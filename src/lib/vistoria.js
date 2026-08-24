import { supabase, FOTOS_BUCKET } from "./supabase";

const SIGNED_URL_TTL = 60 * 60 * 24; // 24h, suficiente para uma sessão de vistoria/relatório

export function authErrorMessage(error) {
  const msg = error?.message || "";
  if (msg.includes("already registered") || msg.includes("already exists")) {
    return "Já existe uma conta com esse e-mail — tente entrar em vez de criar.";
  }
  if (msg.includes("Invalid login credentials")) {
    return "E-mail ou senha incorretos.";
  }
  if (msg.includes("Email not confirmed")) {
    return "Confirme seu e-mail antes de entrar — enviamos um link de confirmação.";
  }
  if (msg.includes("Password should be at least")) {
    return "A senha precisa ter pelo menos 6 caracteres.";
  }
  return msg || "Algo deu errado. Tente novamente.";
}

export async function signUp({ nome, whatsapp, email, senha }) {
  return supabase.auth.signUp({
    email,
    password: senha,
    options: { data: { nome, whatsapp } },
  });
}

export async function signIn({ email, senha }) {
  return supabase.auth.signInWithPassword({ email, password: senha });
}

export async function signOut() {
  return supabase.auth.signOut();
}

export async function enviarResetSenha(email) {
  return supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/app`,
  });
}

export async function atualizarSenha(novaSenha) {
  return supabase.auth.updateUser({ password: novaSenha });
}

export function onPasswordRecovery(callback) {
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY") callback(session);
  });
  return () => data.subscription.unsubscribe();
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function getConta(userId) {
  const { data, error } = await supabase
    .from("contas")
    .select("plano_id, creditos_restantes, assinatura_ativa")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return (
    data || { plano_id: "avulso", creditos_restantes: 0, assinatura_ativa: false }
  );
}

export async function fetchPlanos() {
  const { data, error } = await supabase
    .from("planos")
    .select("id, nome, preco_centavos, creditos, recorrente, descricao")
    .order("preco_centavos", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function criarCheckout(planoId) {
  const { data, error } = await supabase.functions.invoke("mp-checkout", {
    body: { plano_id: planoId },
  });
  if (error) throw error;
  if (!data?.url) throw new Error("O Mercado Pago não retornou uma URL de pagamento.");
  return data.url;
}

export async function cancelarAssinatura() {
  const { data, error } = await supabase.functions.invoke("mp-cancelar-assinatura", {
    body: {},
  });
  if (error) throw error;
  if (!data?.ok) throw new Error("Não foi possível cancelar a assinatura.");
}

export async function gerarParecerIA(vistoriaId) {
  const { data, error } = await supabase.functions.invoke("gerar-parecer-ia", {
    body: { vistoria_id: vistoriaId },
  });
  if (error) throw error;
  if (!data?.parecer) throw new Error("A IA não retornou um parecer.");
  return data.parecer;
}

export async function fetchVistoriaAtual(userId) {
  const { data, error } = await supabase
    .from("vistorias")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function salvarVistoria(vistoriaId, userId, patch) {
  const payload = {
    user_id: userId,
    nome: patch.nome,
    whatsapp: patch.whatsapp,
    tipo_imovel: patch.tipoImovel,
    mobiliado: patch.mobiliado,
    quartos: patch.quartos,
    banheiros: patch.banheiros,
    finalidade: patch.finalidade,
  };
  if (patch.concluidaEm !== undefined) payload.concluida_em = patch.concluidaEm;

  if (vistoriaId) {
    const { data, error } = await supabase
      .from("vistorias")
      .update(payload)
      .eq("id", vistoriaId)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabase
    .from("vistorias")
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function signedUrlFor(path) {
  const { data, error } = await supabase.storage
    .from(FOTOS_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL);
  if (error) throw error;
  return data.signedUrl;
}

// Carrega itens + fotos de uma vistoria e remonta os mapas usados pela UI,
// casando (categoria, item) de volta para a chave `${ci}-${ii}` do checklist gerado.
export async function fetchChecklistState(vistoriaId, checklist) {
  const [itensRes, fotosRes] = await Promise.all([
    supabase
      .from("checklist_itens")
      .select("id, categoria, item, checado, comentario")
      .eq("vistoria_id", vistoriaId),
    supabase
      .from("checklist_fotos")
      .select("id, item_id, storage_path")
      .eq("vistoria_id", vistoriaId),
  ]);
  if (itensRes.error) throw itensRes.error;
  if (fotosRes.error) throw fotosRes.error;

  const rowByKey = {};
  const rowById = {};
  checklist.forEach((cat, ci) => {
    cat.itens.forEach((item, ii) => {
      const key = `${ci}-${ii}`;
      const row = itensRes.data.find((r) => r.categoria === cat.nome && r.item === item.t);
      if (row) {
        rowByKey[key] = row;
        rowById[row.id] = key;
      }
    });
  });

  const checked = {};
  const problemas = {};
  Object.entries(rowByKey).forEach(([key, row]) => {
    if (row.checado) checked[key] = true;
    if (row.comentario) {
      const lista = row.comentario.split("\n").filter(Boolean);
      if (lista.length) problemas[key] = lista;
    }
  });

  const fotosPorItem = {};
  fotosRes.data.forEach((f) => {
    if (!fotosPorItem[f.item_id]) fotosPorItem[f.item_id] = [];
    fotosPorItem[f.item_id].push(f);
  });

  const fotos = {};
  await Promise.all(
    Object.entries(fotosPorItem).map(async ([itemId, lista]) => {
      const key = rowById[itemId];
      if (!key) return;
      const comFotoUrl = await Promise.all(
        lista.map(async (f) => ({ id: f.id, path: f.storage_path, url: await signedUrlFor(f.storage_path) }))
      );
      fotos[key] = comFotoUrl;
    })
  );

  return { rowByKey, checked, problemas, fotos };
}

export async function ensureItemRow(vistoriaId, userId, categoria, item, patch = {}) {
  const { data, error } = await supabase
    .from("checklist_itens")
    .upsert(
      { vistoria_id: vistoriaId, user_id: userId, categoria, item, ...patch },
      { onConflict: "vistoria_id,categoria,item" }
    )
    .select("id, categoria, item, checado, comentario")
    .single();
  if (error) throw error;
  return data;
}

export async function adicionarFotoItem(userId, vistoriaId, itemId, blob) {
  const path = `${userId}/${vistoriaId}/${itemId}-${Date.now()}.jpg`;
  const upload = await supabase.storage
    .from(FOTOS_BUCKET)
    .upload(path, blob, { contentType: "image/jpeg" });
  if (upload.error) throw upload.error;

  const { data, error } = await supabase
    .from("checklist_fotos")
    .insert({ item_id: itemId, vistoria_id: vistoriaId, user_id: userId, storage_path: path })
    .select()
    .single();
  if (error) throw error;

  const url = await signedUrlFor(path);
  return { id: data.id, path, url };
}

export async function removerFotoItem(fotoId, storagePath) {
  await supabase.storage.from(FOTOS_BUCKET).remove([storagePath]);
  const { error } = await supabase.from("checklist_fotos").delete().eq("id", fotoId);
  if (error) throw error;
}

export async function consumirCreditoPdf(userId, vistoriaId, conta) {
  const ilimitado = !!conta.assinatura_ativa;
  if (!ilimitado) {
    const { error: errConta } = await supabase
      .from("contas")
      .update({ creditos_restantes: conta.creditos_restantes - 1 })
      .eq("user_id", userId);
    if (errConta) throw errConta;
  }
  const { error: errVistoria } = await supabase
    .from("vistorias")
    .update({ pdf_gerado: true })
    .eq("id", vistoriaId);
  if (errVistoria) throw errVistoria;
}
