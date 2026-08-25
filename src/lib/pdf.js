import jsPDF from "jspdf";
import html2canvas from "html2canvas";

const MARGIN_MM = 14;

export async function gerarPdfDeElemento(el, filename) {
  const canvas = await html2canvas(el, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
  });

  const pdf = new jsPDF("p", "mm", "a4");
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const contentWidthMm = pageWidth - MARGIN_MM * 2;
  const contentHeightMm = pageHeight - MARGIN_MM * 2;

  // fatia o canvas em pedaços do tamanho de uma página (com margem), em vez de
  // esticar a imagem inteira de ponta a ponta — assim cada página tem margem
  // de verdade nos 4 lados, não só a que já vinha do padding interno do card.
  const pxPerMm = canvas.width / contentWidthMm;
  const pageHeightPx = Math.floor(contentHeightMm * pxPerMm);

  let renderedPx = 0;
  let primeiraPagina = true;
  while (renderedPx < canvas.height) {
    const sliceHeightPx = Math.min(pageHeightPx, canvas.height - renderedPx);
    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = canvas.width;
    pageCanvas.height = sliceHeightPx;
    const ctx = pageCanvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
    ctx.drawImage(canvas, 0, renderedPx, canvas.width, sliceHeightPx, 0, 0, canvas.width, sliceHeightPx);

    if (!primeiraPagina) pdf.addPage();
    pdf.addImage(
      pageCanvas.toDataURL("image/jpeg", 0.92),
      "JPEG",
      MARGIN_MM,
      MARGIN_MM,
      contentWidthMm,
      sliceHeightPx / pxPerMm
    );

    renderedPx += sliceHeightPx;
    primeiraPagina = false;
  }

  const blob = pdf.output("blob");
  const file = new File([blob], filename, { type: "application/pdf" });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (err) {
      if (err?.name === "AbortError") return; // usuário fechou o menu de compartilhar, não tenta de novo
      // qualquer outro erro: cai no download tradicional abaixo
    }
  }

  pdf.save(filename);
}
