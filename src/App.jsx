import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  ClipboardCheck, Home, Building2, Sofa, ChevronRight, RotateCcw, Sparkles,
  CheckCircle2, PlusCircle, LayoutDashboard, FileText, ArrowLeft, Printer, AlertTriangle,
  Lock, Mail, LogOut, X as XIcon, Camera, Star,
} from "lucide-react";
import {
  signUp, signIn, signOut, getSession, getConta, fetchPlanos, fetchVistoriaAtual,
  salvarVistoria, fetchChecklistState, ensureItemRow, adicionarFotoItem, removerFotoItem,
  consumirCreditoPdf, authErrorMessage,
} from "./lib/vistoria";
import { gerarPdfDeElemento } from "./lib/pdf";

// Sem @import de fonte externa: evita dependência de rede (mais rápido e sem risco de "load failed").
// As referências a 'Fraunces' / 'IBM Plex Sans' / 'IBM Plex Mono' abaixo caem direto nos fallbacks (serif/sans-serif/monospace).
const FONT_STYLE = ``;

const INK = "#1E2A32";
const PAPER = "#EEEBE3";
const CARD = "#F7F5EF";
const AMBER = "#D98A2B";
const GREEN = "#4C7A5E";
const RED = "#B14545";
const LINE = "#D3CFC3";

function buildChecklist(p) {
  const cats = [];

  cats.push({
    nome: "Sala",
    itens: [
      { t: "Paredes e teto", d: "Procure manchas de umidade, mofo ou rachaduras. Umidade recente costuma ter cheiro característico." },
      { t: "Piso", d: "Passe a mão em busca de riscos ou peças soltas. Em laminado, pise nos cantos ouvindo ruído de folga." },
      { t: "Janelas e portas", d: "Abra e feche tudo. Trinco emperrado ou vidro trincado deve entrar no laudo." },
      { t: "Tomadas e interruptores", d: "Leve um carregador de celular e teste uma a uma — é o item mais esquecido." },
    ],
  });

  cats.push({
    nome: "Cozinha",
    itens: [
      { t: "Torneira e pia", d: "Abra a torneira no máximo por 30s: veja pressão e se escoa sem transbordar." },
      { t: "Armários", d: "Abra todas as portas e gavetas — dobradiças soltas são comuns e fáceis de esquecer." },
      { t: "Tomada 220V (se houver)", d: "Confirme a voltagem antes de ligar qualquer eletrodoméstico." },
    ],
  });

  const nBanheiros = Math.max(1, Number(p.banheiros) || 1);
  for (let i = 1; i <= nBanheiros; i++) {
    cats.push({
      nome: nBanheiros > 1 ? `Banheiro ${i}` : "Banheiro",
      itens: [
        { t: "Descarga e vaso", d: "Dê a descarga e observe se o nível de água volta ao normal em segundos." },
        { t: "Chuveiro", d: "Ligue e sinta a pressão. Repare em vazamento na conexão com a parede." },
        { t: "Box e rejunte", d: "Silicone amarelado ou com mofo é sinal de manutenção pendente — registre em foto." },
        { t: "Ralo", d: "Jogue um pouco de água e veja se escoa rápido, sem borbulhar." },
      ],
    });
  }

  const nQuartos = Math.max(1, Number(p.quartos) || 1);
  for (let i = 1; i <= nQuartos; i++) {
    cats.push({
      nome: `Quarto ${nQuartos > 1 ? i : ""}`.trim(),
      itens: [
        { t: "Paredes e piso", d: "Mesma lógica da sala: manchas, rachaduras, riscos." },
        { t: "Armário embutido", d: "Teste todas as portas e gavetas — item que mais gera desconto na devolução da caução." },
        { t: "Janela e trinco", d: "Verifique vedação — frestas indicam desgaste na borracha." },
      ],
    });
  }

  cats.push({
    nome: "Área de serviço",
    itens: [
      { t: "Tanque e torneira", d: "Vazamento na base da torneira é comum e barato de provar com foto." },
      { t: "Ponto da máquina de lavar", d: "Confirme se a saída de água e o ponto elétrico estão no lugar certo." },
    ],
  });

  if (p.tipoImovel === "casa") {
    cats.push({
      nome: "Quintal e garagem",
      itens: [
        { t: "Portão e fechadura", d: "Teste abertura manual e automática (se houver motor)." },
        { t: "Muros e piso externo", d: "Rachaduras em muro externo podem indicar problema estrutural — fotografe de longe e de perto." },
        { t: "Torneira externa", d: "Verifique vazamento e pressão." },
      ],
    });
  }

  if (p.mobiliado === "sim") {
    cats.push({
      nome: "Mobília inclusa",
      itens: [
        { t: "Lista de itens", d: "Confira contra o contrato: cada móvel/eletro citado precisa estar lá e funcionando." },
        { t: "Estado de uso", d: "Fotografe riscos, manchas ou avarias em cada peça — isso evita cobrança indevida na saída." },
        { t: "Eletrodomésticos", d: "Ligue geladeira, fogão e afins por alguns minutos para confirmar que funcionam." },
      ],
    });
  }

  cats.push({
    nome: "Medidores e geral",
    itens: [
      { t: "Medidor de luz", d: "Fotografe o número exato no dia da vistoria — evita cobrança de consumo que não foi seu." },
      { t: "Medidor de água", d: "Se individualizado, fotografe também. Se não, anote isso no laudo." },
      { t: "Interfone/campainha", d: "Teste o funcionamento e, se possível, o vídeo do porteiro eletrônico." },
    ],
  });

  return cats;
}

function formatarPreco(centavos) {
  return `R$ ${(centavos / 100).toFixed(2).replace(".", ",")}`;
}

function redimensionarImagem(file, maxDim = 1000) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) { height = Math.round(height * (maxDim / width)); width = maxDim; }
          else { width = Math.round(width * (maxDim / height)); height = maxDim; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Falha ao gerar imagem"))), "image/jpeg", 0.72);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function VistoriaApp() {
  const [step, setStep] = useState("loading");
  const [userId, setUserId] = useState(null);
  const [vistoriaId, setVistoriaId] = useState(null);
  const [pdfGerado, setPdfGerado] = useState(false);
  const [conta, setConta] = useState({ plano_id: "avulso", creditos_restantes: 0, assinatura_ativa: false });
  const [planos, setPlanos] = useState([]);

  const [nome, setNome] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [tipoImovel, setTipoImovel] = useState("apartamento");
  const [mobiliado, setMobiliado] = useState("nao");
  const [quartos, setQuartos] = useState(2);
  const [banheiros, setBanheiros] = useState(1);
  const [finalidade, setFinalidade] = useState("aluguel");
  const [checked, setChecked] = useState({});
  const [problemas, setProblemas] = useState({});
  const [fotos, setFotos] = useState({});
  const [itemRows, setItemRows] = useState({});
  const [openProblema, setOpenProblema] = useState({});
  const [novoProblema, setNovoProblema] = useState({});
  const [concluidoEm, setConcluidoEm] = useState("");
  const [saveError, setSaveError] = useState(false);
  const [gerandoPdf, setGerandoPdf] = useState(false);

  const [modo, setModo] = useState("criar");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmSenha, setConfirmSenha] = useState("");
  const [authErro, setAuthErro] = useState("");
  const [confirmacaoEmail, setConfirmacaoEmail] = useState(false);
  const [perfilPronto, setPerfilPronto] = useState(false);

  const printableRef = useRef(null);

  const afterAuth = useCallback(async (user) => {
    setUserId(user.id);
    try {
      const contaData = await getConta(user.id);
      setConta(contaData);
    } catch { /* segue com os valores padrão de conta */ }

    let vistoria = null;
    try {
      vistoria = await fetchVistoriaAtual(user.id);
    } catch { setSaveError(true); }

    if (vistoria) {
      setVistoriaId(vistoria.id);
      setNome(vistoria.nome || "");
      setWhatsapp(vistoria.whatsapp || "");
      setTipoImovel(vistoria.tipo_imovel || "apartamento");
      setMobiliado(vistoria.mobiliado || "nao");
      setQuartos(vistoria.quartos || 2);
      setBanheiros(vistoria.banheiros || 1);
      setFinalidade(vistoria.finalidade || "aluguel");
      setConcluidoEm(vistoria.concluida_em ? new Date(vistoria.concluida_em).toLocaleDateString("pt-BR") : "");
      setPdfGerado(!!vistoria.pdf_gerado);

      const def = buildChecklist({
        tipoImovel: vistoria.tipo_imovel, mobiliado: vistoria.mobiliado,
        quartos: vistoria.quartos, banheiros: vistoria.banheiros,
      });
      try {
        const st = await fetchChecklistState(vistoria.id, def);
        setChecked(st.checked);
        setProblemas(st.problemas);
        setFotos(st.fotos);
        setItemRows(st.rowByKey);
      } catch { setSaveError(true); }

      setPerfilPronto(true);
      setStep("checklist");
    } else {
      setPerfilPronto(false);
      setStep("perguntas");
    }
  }, []);

  useEffect(() => {
    (async () => {
      const session = await getSession().catch(() => null);
      if (session?.user) {
        setNome(session.user.user_metadata?.nome || "");
        setEmail(session.user.email || "");
        await afterAuth(session.user);
      } else {
        setStep("login");
      }
    })();
  }, [afterAuth]);

  const criarConta = async () => {
    setAuthErro(""); setConfirmacaoEmail(false);
    if (!nome.trim() || !email.trim() || senha.length < 6) { setAuthErro("Preencha nome, e-mail e uma senha com pelo menos 6 caracteres."); return; }
    if (senha !== confirmSenha) { setAuthErro("As senhas não coincidem."); return; }
    const { data, error } = await signUp({ nome, whatsapp, email, senha });
    if (error) { setAuthErro(authErrorMessage(error)); return; }
    if (data.session && data.user) {
      await afterAuth(data.user);
    } else {
      setConfirmacaoEmail(true);
      setModo("entrar");
    }
  };

  const entrar = async () => {
    setAuthErro("");
    const { data, error } = await signIn({ email, senha });
    if (error) { setAuthErro(authErrorMessage(error)); return; }
    await afterAuth(data.user);
  };

  const sair = async () => {
    await signOut().catch(() => {});
    setUserId(null); setVistoriaId(null); setPdfGerado(false);
    setConta({ plano_id: "avulso", creditos_restantes: 0, assinatura_ativa: false });
    setChecked({}); setProblemas({}); setFotos({}); setItemRows({});
    setOpenProblema({}); setNovoProblema({});
    setSenha(""); setConfirmSenha(""); setAuthErro(""); setConfirmacaoEmail(false);
    setModo("entrar"); setPerfilPronto(false); setConcluidoEm("");
    setStep("login");
  };

  const toggleItem = async (key) => {
    const [ci, ii] = key.split("-").map(Number);
    const itemDef = checklist[ci]?.itens[ii];
    if (!itemDef) return;
    const novoChecado = !checked[key];
    setChecked((c) => ({ ...c, [key]: novoChecado }));
    try {
      const row = await ensureItemRow(vistoriaId, userId, checklist[ci].nome, itemDef.t, { checado: novoChecado });
      setItemRows((m) => ({ ...m, [key]: row }));
    } catch { setSaveError(true); }
  };

  const persistirProblemas = async (key, listaProblemas) => {
    const [ci, ii] = key.split("-").map(Number);
    const itemDef = checklist[ci]?.itens[ii];
    if (!itemDef) return;
    try {
      const row = await ensureItemRow(vistoriaId, userId, checklist[ci].nome, itemDef.t, {
        comentario: listaProblemas.length ? listaProblemas.join("\n") : null,
      });
      setItemRows((m) => ({ ...m, [key]: row }));
    } catch { setSaveError(true); }
  };

  const confirmarNovoProblema = (key) => {
    const texto = (novoProblema[key] || "").trim();
    setOpenProblema((p) => ({ ...p, [key]: false }));
    setNovoProblema((p) => ({ ...p, [key]: "" }));
    if (!texto) return;
    const lista = [...(problemas[key] || []), texto];
    setProblemas((p) => ({ ...p, [key]: lista }));
    persistirProblemas(key, lista);
  };

  const removerProblema = (key, idx) => {
    const lista = (problemas[key] || []).filter((_, i) => i !== idx);
    const next = { ...problemas };
    if (lista.length === 0) delete next[key]; else next[key] = lista;
    setProblemas(next);
    persistirProblemas(key, lista);
  };

  const adicionarFoto = async (key, file) => {
    try {
      const [ci, ii] = key.split("-").map(Number);
      const itemDef = checklist[ci]?.itens[ii];
      if (!itemDef) return;
      const blob = await redimensionarImagem(file);
      let row = itemRows[key];
      if (!row) {
        row = await ensureItemRow(vistoriaId, userId, checklist[ci].nome, itemDef.t);
        setItemRows((m) => ({ ...m, [key]: row }));
      }
      const foto = await adicionarFotoItem(userId, vistoriaId, row.id, blob);
      setFotos((f) => ({ ...f, [key]: [...(f[key] || []), foto] }));
    } catch { setSaveError(true); }
  };

  const removerFoto = async (key, idx) => {
    const foto = (fotos[key] || [])[idx];
    const lista = (fotos[key] || []).filter((_, i) => i !== idx);
    const next = { ...fotos };
    if (lista.length === 0) delete next[key]; else next[key] = lista;
    setFotos(next);
    if (foto) {
      try { await removerFotoItem(foto.id, foto.path); } catch { setSaveError(true); }
    }
  };

  const irParaPainel = async () => {
    const agora = new Date();
    try {
      const row = await salvarVistoria(vistoriaId, userId, {
        nome, whatsapp, tipoImovel, mobiliado, quartos, banheiros, finalidade, concluidaEm: agora.toISOString(),
      });
      setVistoriaId(row.id);
      setConcluidoEm(agora.toLocaleDateString("pt-BR"));
    } catch { setSaveError(true); }
    setStep("painel");
  };

  const reiniciar = () => {
    setChecked({}); setProblemas({}); setOpenProblema({}); setNovoProblema({}); setFotos({}); setItemRows({});
    setTipoImovel("apartamento"); setMobiliado("nao");
    setQuartos(2); setBanheiros(1); setConcluidoEm(""); setPerfilPronto(false); setPdfGerado(false);
    setVistoriaId(null);
    setStep("perguntas");
  };

  const abrirRelatorio = async () => {
    const temCredito = pdfGerado || conta.assinatura_ativa || conta.creditos_restantes > 0;
    if (!temCredito) {
      try { setPlanos(await fetchPlanos()); } catch { /* lista fica vazia, texto genérico ainda aparece */ }
      setStep("paywall");
      return;
    }
    if (!pdfGerado) {
      try {
        await consumirCreditoPdf(userId, vistoriaId, conta);
        setPdfGerado(true);
        setConta((c) => (c.assinatura_ativa ? c : { ...c, creditos_restantes: c.creditos_restantes - 1 }));
      } catch { setSaveError(true); return; }
    }
    setStep("relatorio");
  };

  const baixarPdf = async () => {
    if (!printableRef.current) return;
    setGerandoPdf(true);
    try {
      const arquivo = `vistoria-${(nome || "relatorio").trim().replace(/\s+/g, "-").toLowerCase()}.pdf`;
      await gerarPdfDeElemento(printableRef.current, arquivo);
    } catch { setSaveError(true); }
    setGerandoPdf(false);
  };

  const checklist = useMemo(
    () => buildChecklist({ tipoImovel, mobiliado, quartos, banheiros }),
    [tipoImovel, mobiliado, quartos, banheiros]
  );
  const totalItens = useMemo(() => checklist.reduce((n, c) => n + c.itens.length, 0), [checklist]);
  const totalChecked = useMemo(() => Object.values(checked).filter(Boolean).length, [checked]);
  const pct = totalItens ? Math.round((totalChecked / totalItens) * 100) : 0;
  const totalProblemas = useMemo(() => Object.values(problemas).reduce((n, l) => n + (l?.length || 0), 0), [problemas]);
  const pontosDeAtencao = useMemo(() => {
    const lista = [];
    checklist.forEach((cat, ci) => cat.itens.forEach((item, ii) => {
      const key = `${ci}-${ii}`;
      const probs = problemas[key] || [];
      if (!checked[key] || probs.length > 0) {
        lista.push({ cat: cat.nome, item: item.t, problemas: probs, ok: !!checked[key] });
      }
    }));
    return lista;
  }, [checklist, checked, problemas]);

  return (
    <div style={{ minHeight: "100vh", background: PAPER, fontFamily: "'IBM Plex Sans', sans-serif", color: INK }}>
      <style>{FONT_STYLE}{`
        .clip { position:absolute; top:-14px; width:28px; height:28px; border-radius:50%; background:${INK}; box-shadow: inset 0 2px 3px rgba(0,0,0,0.4); }
        .field:focus { outline: 2px solid ${AMBER}; outline-offset: 2px; }
        .opt:focus-visible { outline: 2px solid ${AMBER}; outline-offset: 2px; }
        .item-row { transition: background .15s ease; }
        @media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
        @media print {
          body * { visibility: hidden; }
          .printable, .printable * { visibility: visible; }
          .printable { position: absolute; left: 0; top: 0; width: 100%; padding: 0 !important; margin: 0 !important; }
          .no-print { display: none !important; }
        }
      `}</style>

      {step !== "relatorio" && (
        <header className="no-print" style={{ background: INK, color: PAPER, padding: "18px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <ClipboardCheck size={22} color={AMBER} />
            <span style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 19, letterSpacing: 0.2 }}>Vistoria Sem Susto</span>
          </div>
          {step !== "login" && step !== "loading" && (
            <button onClick={sair} style={{ background: "none", border: "none", color: PAPER, opacity: 0.7, cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontSize: 13 }}>
              <LogOut size={15} /> sair
            </button>
          )}
        </header>
      )}

      <main style={{ maxWidth: 560, margin: "0 auto", padding: step === "relatorio" ? 0 : "28px 16px 60px" }}>

        {step === "loading" && <p style={{ textAlign: "center", opacity: 0.6, marginTop: 60 }}>carregando…</p>}

        {saveError && step !== "loading" && (
          <p style={{ background: "#FBE7E7", color: RED, fontSize: 12, padding: "8px 12px", borderRadius: 4, marginBottom: 14, textAlign: "center" }}>
            Não consegui salvar agora — verifique sua conexão. Os dados ficam só nesta sessão até salvar de novo.
          </p>
        )}

        {step === "login" && (
          <div style={{ position: "relative", background: CARD, border: `1px solid ${LINE}`, borderRadius: 4, padding: "36px 24px 28px", boxShadow: "0 8px 24px rgba(30,42,50,0.08)" }}>
            <div className="clip" style={{ left: "50%", transform: "translateX(-50%)" }} />
            <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 26, fontWeight: 600, margin: "0 0 6px" }}>
              {modo === "criar" ? "Antes de assinar, confira tudo." : "Bem-vindo de volta"}
            </h1>
            <p style={{ opacity: 0.75, fontSize: 14.5, margin: "0 0 20px", lineHeight: 1.5 }}>
              {modo === "criar"
                ? "Crie sua conta e monte um checklist de vistoria feito sob medida pro seu imóvel."
                : "Entre com seu e-mail e senha para continuar sua vistoria."}
            </p>

            {confirmacaoEmail && (
              <p style={{ background: "#EAF3EC", color: GREEN, fontSize: 12.5, padding: "10px 12px", borderRadius: 4, margin: "-8px 0 18px", textAlign: "center", lineHeight: 1.4 }}>
                Conta criada! Enviamos um link de confirmação para {email} — confirme e depois entre com sua senha.
              </p>
            )}

            {modo === "criar" && (
              <>
                <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>Nome</label>
                <input className="field" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Seu nome"
                  style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", border: `1px solid ${LINE}`, borderRadius: 3, marginBottom: 14, fontFamily: "inherit", fontSize: 14.5 }} />
                <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>Telefone (WhatsApp)</label>
                <input className="field" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="(00) 00000-0000"
                  style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", border: `1px solid ${LINE}`, borderRadius: 3, marginBottom: 14, fontFamily: "inherit", fontSize: 14.5 }} />
              </>
            )}

            <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>E-mail</label>
            <div style={{ position: "relative", marginBottom: 14 }}>
              <Mail size={15} style={{ position: "absolute", left: 12, top: 12, opacity: 0.5 }} />
              <input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@email.com"
                style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px 10px 34px", border: `1px solid ${LINE}`, borderRadius: 3, fontFamily: "inherit", fontSize: 14.5 }} />
            </div>

            <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>Senha</label>
            <div style={{ position: "relative", marginBottom: modo === "criar" ? 14 : 20 }}>
              <Lock size={15} style={{ position: "absolute", left: 12, top: 12, opacity: 0.5 }} />
              <input className="field" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="mínimo 6 caracteres"
                style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px 10px 34px", border: `1px solid ${LINE}`, borderRadius: 3, fontFamily: "inherit", fontSize: 14.5 }} />
            </div>

            {modo === "criar" && (
              <>
                <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>Confirmar senha</label>
                <div style={{ position: "relative", marginBottom: 20 }}>
                  <Lock size={15} style={{ position: "absolute", left: 12, top: 12, opacity: 0.5 }} />
                  <input className="field" type="password" value={confirmSenha} onChange={(e) => setConfirmSenha(e.target.value)} placeholder="repita a senha"
                    style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px 10px 34px", border: `1px solid ${LINE}`, borderRadius: 3, fontFamily: "inherit", fontSize: 14.5 }} />
                </div>
              </>
            )}

            {authErro && <p style={{ color: RED, fontSize: 12.5, margin: "-8px 0 14px" }}>{authErro}</p>}

            <button onClick={modo === "criar" ? criarConta : entrar}
              style={{ width: "100%", padding: "12px 16px", background: INK, color: PAPER, border: "none", borderRadius: 3, fontWeight: 600, fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              {modo === "criar" ? "Criar conta" : "Entrar"} <ChevronRight size={17} />
            </button>

            <p style={{ textAlign: "center", fontSize: 13, marginTop: 16 }}>
              {modo === "criar" ? "Já tem conta? " : "Ainda não tem conta? "}
              <button onClick={() => { setAuthErro(""); setConfirmacaoEmail(false); setModo(modo === "criar" ? "entrar" : "criar"); }}
                style={{ background: "none", border: "none", color: AMBER, fontWeight: 600, cursor: "pointer", padding: 0, fontSize: 13 }}>
                {modo === "criar" ? "Entrar" : "Criar agora"}
              </button>
            </p>
          </div>
        )}

        {step === "perguntas" && (
          <div style={{ position: "relative", background: CARD, border: `1px solid ${LINE}`, borderRadius: 4, padding: "36px 24px 28px", boxShadow: "0 8px 24px rgba(30,42,50,0.08)" }}>
            <div className="clip" style={{ left: "50%", transform: "translateX(-50%)" }} />
            <p style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, letterSpacing: 1, color: AMBER, margin: "0 0 4px" }}>PASSO 2 DE 2</p>
            <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 600, margin: "0 0 22px" }}>Sobre o seu imóvel</h1>

            <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Tipo de imóvel</p>
            <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
              {[{ v: "apartamento", l: "Apartamento", i: Building2 }, { v: "casa", l: "Casa", i: Home }].map(({ v, l, i: Icon }) => (
                <button key={v} className="opt" onClick={() => setTipoImovel(v)}
                  style={{ flex: 1, padding: "14px 8px", borderRadius: 3, cursor: "pointer", border: `1.5px solid ${tipoImovel === v ? INK : LINE}`, background: tipoImovel === v ? INK : "transparent", color: tipoImovel === v ? PAPER : INK, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, fontSize: 13.5, fontWeight: 500 }}>
                  <Icon size={18} /> {l}
                </button>
              ))}
            </div>

            <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Vem mobiliado?</p>
            <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
              {[{ v: "sim", l: "Sim" }, { v: "nao", l: "Não" }].map(({ v, l }) => (
                <button key={v} className="opt" onClick={() => setMobiliado(v)}
                  style={{ flex: 1, padding: "12px 8px", borderRadius: 3, cursor: "pointer", border: `1.5px solid ${mobiliado === v ? INK : LINE}`, background: mobiliado === v ? INK : "transparent", color: mobiliado === v ? PAPER : INK, fontSize: 13.5, fontWeight: 500 }}>
                  {v === "sim" && <Sofa size={15} style={{ verticalAlign: "-3px", marginRight: 5 }} />} {l}
                </button>
              ))}
            </div>

            <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Você vai precisar devolver esse imóvel algum dia?</p>
            <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
              {[{ v: "aluguel", l: "Sim, é aluguel" }, { v: "propria", l: "Não, é imóvel próprio" }].map(({ v, l }) => (
                <button key={v} className="opt" onClick={() => setFinalidade(v)}
                  style={{ flex: 1, padding: "12px 8px", borderRadius: 3, cursor: "pointer", border: `1.5px solid ${finalidade === v ? INK : LINE}`, background: finalidade === v ? INK : "transparent", color: finalidade === v ? PAPER : INK, fontSize: 13, fontWeight: 500 }}>
                  {l}
                </button>
              ))}
            </div>
            {finalidade === "aluguel" && (
              <p style={{ fontSize: 12, opacity: 0.6, margin: "-12px 0 20px", lineHeight: 1.4 }}>
                Vamos guardar este relatório pra comparar com a vistoria de saída quando chegar a hora.
              </p>
            )}

            <div style={{ display: "flex", gap: 16, marginBottom: 26 }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Quartos</p>
                <select className="field" value={quartos} onChange={(e) => setQuartos(Number(e.target.value))}
                  style={{ width: "100%", padding: "10px 12px", border: `1px solid ${LINE}`, borderRadius: 3, fontFamily: "inherit", fontSize: 14.5 }}>
                  {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Banheiros</p>
                <select className="field" value={banheiros} onChange={(e) => setBanheiros(Number(e.target.value))}
                  style={{ width: "100%", padding: "10px 12px", border: `1px solid ${LINE}`, borderRadius: 3, fontFamily: "inherit", fontSize: 14.5 }}>
                  {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>

            <button onClick={async () => {
              try {
                const row = await salvarVistoria(vistoriaId, userId, { nome, whatsapp, tipoImovel, mobiliado, quartos, banheiros, finalidade });
                setVistoriaId(row.id);
              } catch { setSaveError(true); }
              setStep("checklist");
            }}
              style={{ width: "100%", padding: "12px 16px", background: AMBER, color: INK, border: "none", borderRadius: 3, fontWeight: 600, fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <Sparkles size={16} /> Gerar meu checklist
            </button>
          </div>
        )}

        {step === "checklist" && (
          <div>
            <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 4, padding: "16px 20px", marginBottom: 18, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <p style={{ margin: 0, fontSize: 13, opacity: 0.7 }}>Oi, {nome.split(" ")[0] || "tudo pronto"} —</p>
                <p style={{ margin: "2px 0 0", fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 17 }}>{totalChecked}/{totalItens} itens conferidos</p>
              </div>
              <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 22, fontWeight: 500, color: pct === 100 ? GREEN : AMBER }}>{pct}%</div>
            </div>
            <div style={{ height: 6, background: LINE, borderRadius: 3, marginBottom: 22, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${pct}%`, background: pct === 100 ? GREEN : AMBER, transition: "width .3s ease" }} />
            </div>

            {checklist.map((cat, ci) => (
              <div key={ci} style={{ marginBottom: 22 }}>
                <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 17, fontWeight: 600, margin: "0 0 10px", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 4, height: 16, background: AMBER, display: "inline-block", borderRadius: 1 }} />{cat.nome}
                </h2>
                <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 4, overflow: "hidden" }}>
                  {cat.itens.map((item, ii) => {
                    const key = `${ci}-${ii}`;
                    const isChecked = !!checked[key];
                    const isOpen = !!openProblema[key];
                    const listaProblemas = problemas[key] || [];
                    return (
                      <div key={key} className="item-row" style={{ padding: "12px 14px", borderBottom: ii < cat.itens.length - 1 ? `1px solid ${LINE}` : "none", background: isChecked ? "rgba(76,122,94,0.06)" : "transparent" }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                          <button onClick={() => toggleItem(key)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, marginTop: 1, flexShrink: 0 }}>
                            {isChecked ? <CheckCircle2 size={19} color={GREEN} /> : <span style={{ width: 19, height: 19, borderRadius: "50%", border: `1.5px solid ${LINE}`, display: "inline-block" }} />}
                          </button>
                          <div style={{ flex: 1 }}>
                            <span style={{ fontSize: 14.5, fontWeight: 500, textDecoration: isChecked ? "line-through" : "none", opacity: isChecked ? 0.6 : 1 }}>{item.t}</span>
                            <br />
                            <span style={{ fontSize: 12.5, opacity: 0.65, lineHeight: 1.4 }}>{item.d}</span>

                            {listaProblemas.map((prob, pi) => (
                              <div key={pi} style={{ display: "flex", alignItems: "flex-start", gap: 6, marginTop: 6, background: "#FBE7E7", border: `1px solid ${RED}33`, borderRadius: 3, padding: "6px 8px" }}>
                                <span style={{ flex: 1, fontSize: 12.5 }}>⚠️ {prob}</span>
                                <button onClick={() => removerProblema(key, pi)} title="Remover problema"
                                  style={{ background: "none", border: "none", cursor: "pointer", color: RED, padding: 0, flexShrink: 0, display: "flex" }}>
                                  <XIcon size={14} />
                                </button>
                              </div>
                            ))}

                            {isOpen ? (
                              <input
                                autoFocus
                                value={novoProblema[key] || ""}
                                onChange={(e) => setNovoProblema((p) => ({ ...p, [key]: e.target.value }))}
                                onKeyDown={(e) => { if (e.key === "Enter") confirmarNovoProblema(key); if (e.key === "Escape") { setOpenProblema((p) => ({ ...p, [key]: false })); setNovoProblema((p) => ({ ...p, [key]: "" })); } }}
                                onBlur={() => confirmarNovoProblema(key)}
                                placeholder="Descreva o problema (ex: risco no piso perto da janela)"
                                style={{ width: "100%", boxSizing: "border-box", marginTop: 8, padding: "8px 10px", fontFamily: "inherit", fontSize: 13, border: `1px solid ${RED}`, borderRadius: 3 }}
                              />
                            ) : (
                              <button onClick={() => setOpenProblema((p) => ({ ...p, [key]: true }))} style={{ marginTop: 6, background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 4, fontSize: 12, opacity: 0.55 }}>
                                <PlusCircle size={13} /> {listaProblemas.length ? "adicionar outro problema" : "registrar problema"}
                              </button>
                            )}

                            {(fotos[key] || []).length > 0 && (
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                                {fotos[key].map((foto, fi) => (
                                  <div key={foto.id || fi} style={{ position: "relative" }}>
                                    <img src={foto.url} alt="" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 4, border: `1px solid ${LINE}`, display: "block" }} />
                                    <button onClick={() => removerFoto(key, fi)} title="Remover foto"
                                      style={{ position: "absolute", top: -6, right: -6, background: INK, color: PAPER, border: "none", borderRadius: "50%", width: 18, height: 18, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", padding: 0 }}>
                                      <XIcon size={11} />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}

                            <label htmlFor={`foto-${key}`} style={{ marginTop: 8, background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 4, fontSize: 12, opacity: 0.55, width: "fit-content" }}>
                              <Camera size={13} /> tirar foto
                            </label>
                            <input id={`foto-${key}`} type="file" accept="image/*" capture="environment" style={{ display: "none" }}
                              onChange={(e) => { const f = e.target.files[0]; e.target.value = ""; if (f) adicionarFoto(key, f); }} />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            <button onClick={irParaPainel}
              style={{ width: "100%", padding: "13px 16px", background: INK, color: PAPER, border: "none", borderRadius: 3, fontWeight: 600, fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 8 }}>
              <LayoutDashboard size={17} /> Concluir e ver painel da vistoria
            </button>
            <button onClick={reiniciar} style={{ display: "flex", alignItems: "center", gap: 6, margin: "14px auto 0", background: "none", border: "none", color: INK, opacity: 0.5, fontSize: 13, cursor: "pointer" }}>
              <RotateCcw size={14} /> refazer perguntas do imóvel
            </button>
          </div>
        )}

        {step === "painel" && (
          <div>
            <div style={{ position: "relative", background: INK, color: PAPER, borderRadius: 4, padding: "22px 22px 18px", marginBottom: 20 }}>
              <p style={{ margin: 0, fontSize: 12, opacity: 0.7, fontFamily: "'IBM Plex Mono', monospace", letterSpacing: 1 }}>ÁREA DA VISTORIA</p>
              <h1 style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 23, margin: "4px 0 10px" }}>{nome.split(" ")[0]}, aqui está o resumo</h1>
              <p style={{ margin: 0, fontSize: 13, opacity: 0.8 }}>
                {tipoImovel === "casa" ? "Casa" : "Apartamento"} · {quartos} quarto{quartos > 1 ? "s" : ""} · {banheiros} banheiro{banheiros > 1 ? "s" : ""} · {mobiliado === "sim" ? "mobiliado" : "sem mobília"}
              </p>
              <p style={{ margin: "2px 0 0", fontSize: 12, opacity: 0.6 }}>concluída em {concluidoEm}</p>
            </div>

            <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
              <div style={{ flex: 1, background: CARD, border: `1px solid ${LINE}`, borderRadius: 4, padding: "14px", textAlign: "center" }}>
                <p style={{ margin: 0, fontFamily: "'IBM Plex Mono', monospace", fontSize: 24, fontWeight: 500, color: pct === 100 ? GREEN : AMBER }}>{pct}%</p>
                <p style={{ margin: "2px 0 0", fontSize: 11.5, opacity: 0.65 }}>conferido</p>
              </div>
              <div style={{ flex: 1, background: CARD, border: `1px solid ${LINE}`, borderRadius: 4, padding: "14px", textAlign: "center" }}>
                <p style={{ margin: 0, fontFamily: "'IBM Plex Mono', monospace", fontSize: 24, fontWeight: 500 }}>{checklist.length}</p>
                <p style={{ margin: "2px 0 0", fontSize: 11.5, opacity: 0.65 }}>cômodos</p>
              </div>
              <div style={{ flex: 1, background: CARD, border: `1px solid ${LINE}`, borderRadius: 4, padding: "14px", textAlign: "center" }}>
                <p style={{ margin: 0, fontFamily: "'IBM Plex Mono', monospace", fontSize: 24, fontWeight: 500, color: totalProblemas ? RED : GREEN }}>{totalProblemas}</p>
                <p style={{ margin: "2px 0 0", fontSize: 11.5, opacity: 0.65 }}>problemas identificados</p>
              </div>
            </div>

            {pontosDeAtencao.length > 0 && (
              <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 4, padding: "16px 18px", marginBottom: 20 }}>
                <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 15.5, fontWeight: 600, margin: "0 0 10px", display: "flex", alignItems: "center", gap: 6 }}>
                  <AlertTriangle size={15} color={AMBER} /> Pontos de atenção
                </h2>
                {pontosDeAtencao.map((p, i) => (
                  <div key={i} style={{ fontSize: 13, padding: "8px 0", borderBottom: i < pontosDeAtencao.length - 1 ? `1px solid ${LINE}` : "none" }}>
                    <strong>{p.cat}</strong> — {p.item}{!p.ok && <span style={{ color: RED }}> (não conferido)</span>}
                    {p.problemas.map((pr, pi) => <div key={pi} style={{ opacity: 0.75, marginTop: 2 }}>⚠️ {pr}</div>)}
                  </div>
                ))}
              </div>
            )}

            {finalidade === "aluguel" && (
              <p style={{ fontSize: 12.5, opacity: 0.65, textAlign: "center", margin: "0 0 14px" }}>
                Guarde este relatório — na saída, dá pra comparar e confirmar que nada mudou.
              </p>
            )}

            <button onClick={abrirRelatorio}
              style={{ width: "100%", padding: "13px 16px", background: AMBER, color: INK, border: "none", borderRadius: 3, fontWeight: 600, fontSize: 15, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 10 }}>
              <FileText size={17} /> Ver relatório completo (PDF)
            </button>
            <button onClick={() => setStep("checklist")}
              style={{ width: "100%", padding: "12px 16px", background: "transparent", color: INK, border: `1.5px solid ${LINE}`, borderRadius: 3, fontWeight: 500, fontSize: 14.5, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 10 }}>
              <ArrowLeft size={16} /> Voltar ao checklist
            </button>
            <button onClick={reiniciar}
              style={{ width: "100%", padding: "11px 16px", background: "transparent", color: INK, opacity: 0.6, border: "none", borderRadius: 3, fontWeight: 500, fontSize: 13.5, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <PlusCircle size={15} /> Iniciar uma nova vistoria
            </button>
          </div>
        )}

        {step === "paywall" && (
          <div style={{ position: "relative", background: CARD, border: `1px solid ${LINE}`, borderRadius: 4, padding: "32px 24px 28px", boxShadow: "0 8px 24px rgba(30,42,50,0.08)" }}>
            <div className="clip" style={{ left: "50%", transform: "translateX(-50%)" }} />
            <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 23, fontWeight: 600, margin: "0 0 6px" }}>Seu checklist está pronto</h1>
            <p style={{ opacity: 0.75, fontSize: 14, margin: "0 0 22px", lineHeight: 1.5 }}>
              Você já conferiu o imóvel todo — falta só liberar o relatório em PDF pra levar como prova.
            </p>

            {planos.map((p) => (
              <div key={p.id} style={{ border: `1.5px solid ${LINE}`, borderRadius: 4, padding: "14px 16px", marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <div>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: 14.5, display: "flex", alignItems: "center", gap: 5 }}>
                    {p.id === "profissional" && <Star size={13} color={AMBER} />} {p.nome}
                  </p>
                  <p style={{ margin: "2px 0 0", fontSize: 12, opacity: 0.65 }}>{p.descricao}</p>
                </div>
                <p style={{ margin: 0, fontFamily: "'IBM Plex Mono', monospace", fontWeight: 600, fontSize: 16, whiteSpace: "nowrap" }}>
                  {formatarPreco(p.preco_centavos)}{p.recorrente ? "/mês" : ""}
                </p>
              </div>
            ))}

            <p style={{ fontSize: 12.5, opacity: 0.7, textAlign: "center", margin: "18px 0 20px", lineHeight: 1.5 }}>
              Para liberar seu crédito, entre em contato informando o e-mail da sua conta ({email}):
              <br />
              <a href={`mailto:gabrielfariasfotografias@gmail.com?subject=${encodeURIComponent("Liberar crédito Vistoria Sem Susto")}&body=${encodeURIComponent(`Meu e-mail de cadastro: ${email}`)}`}
                style={{ color: AMBER, fontWeight: 600 }}>
                gabrielfariasfotografias@gmail.com
              </a>
            </p>

            <button onClick={() => setStep("painel")}
              style={{ width: "100%", padding: "12px 16px", background: "transparent", color: INK, border: `1.5px solid ${LINE}`, borderRadius: 3, fontWeight: 500, fontSize: 14.5, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <ArrowLeft size={16} /> Voltar ao painel
            </button>
          </div>
        )}

        {step === "relatorio" && (
          <div>
            <div className="no-print" style={{ display: "flex", gap: 10, padding: "16px", maxWidth: 560, margin: "0 auto" }}>
              <button onClick={() => setStep("painel")} style={{ flex: 1, padding: "11px", background: "transparent", border: `1.5px solid ${LINE}`, borderRadius: 3, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 14 }}>
                <ArrowLeft size={15} /> Voltar
              </button>
              <button onClick={baixarPdf} disabled={gerandoPdf} style={{ flex: 1, padding: "11px", background: INK, color: PAPER, border: "none", borderRadius: 3, cursor: gerandoPdf ? "default" : "pointer", opacity: gerandoPdf ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 14, fontWeight: 600 }}>
                <Printer size={15} /> {gerandoPdf ? "Gerando PDF…" : "Baixar PDF"}
              </button>
            </div>

            <div ref={printableRef} className="printable" style={{ background: "#fff", color: "#1a1a1a", maxWidth: 640, margin: "0 auto", padding: "36px 30px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <ClipboardCheck size={20} />
                <span style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 18 }}>Relatório de Vistoria</span>
              </div>
              <p style={{ fontSize: 12, opacity: 0.6, margin: "0 0 20px" }}>Gerado em {concluidoEm || new Date().toLocaleDateString("pt-BR")}</p>

              <table style={{ width: "100%", fontSize: 13, marginBottom: 22, borderCollapse: "collapse" }}>
                <tbody>
                  <tr><td style={{ padding: "3px 0", opacity: 0.6, width: 130 }}>Cliente</td><td>{nome}</td></tr>
                  <tr><td style={{ padding: "3px 0", opacity: 0.6 }}>WhatsApp</td><td>{whatsapp || "—"}</td></tr>
                  <tr><td style={{ padding: "3px 0", opacity: 0.6 }}>Imóvel</td><td>{tipoImovel === "casa" ? "Casa" : "Apartamento"}{mobiliado === "sim" ? " · mobiliado" : ""}</td></tr>
                  <tr><td style={{ padding: "3px 0", opacity: 0.6 }}>Cômodos</td><td>{quartos} quarto(s) · {banheiros} banheiro(s)</td></tr>
                  <tr><td style={{ padding: "3px 0", opacity: 0.6 }}>Resultado</td><td>{totalChecked}/{totalItens} itens conferidos ({pct}%) · {totalProblemas} problema(s) identificado(s)</td></tr>
                </tbody>
              </table>

              {checklist.map((cat, ci) => (
                <div key={ci} style={{ marginBottom: 16, breakInside: "avoid" }}>
                  <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: 14, fontWeight: 700, margin: "0 0 6px", borderBottom: "1px solid #ccc", paddingBottom: 3 }}>{cat.nome}</h3>
                  {cat.itens.map((item, ii) => {
                    const key = `${ci}-${ii}`;
                    const isChecked = !!checked[key];
                    const listaProblemas = problemas[key] || [];
                    const listaFotos = fotos[key] || [];
                    return (
                      <div key={key} style={{ fontSize: 12, padding: "4px 0", display: "flex", gap: 8 }}>
                        <span style={{ width: 14, flexShrink: 0 }}>{isChecked ? "✔" : "✘"}</span>
                        <span>
                          <strong>{item.t}</strong>
                          {listaProblemas.length > 0 && (
                            <span style={{ display: "block", fontSize: 11, opacity: 0.85, marginTop: 2 }}>
                              Problemas identificados:
                              <ul style={{ margin: "2px 0 0", paddingLeft: 16 }}>
                                {listaProblemas.map((pr, pi) => <li key={pi}>{pr}</li>)}
                              </ul>
                            </span>
                          )}
                          {listaFotos.length > 0 && (
                            <span style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 4 }}>
                              {listaFotos.map((foto, fi) => (
                                <img key={foto.id || fi} src={foto.url} crossOrigin="anonymous" alt="" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 3, border: "1px solid #ccc" }} />
                              ))}
                            </span>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))}

              <p style={{ fontSize: 10.5, opacity: 0.5, marginTop: 24, borderTop: "1px solid #ccc", paddingTop: 10 }}>
                Relatório gerado por Vistoria Sem Susto — documento de apoio para conferência do imóvel na entrega/entrada.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
