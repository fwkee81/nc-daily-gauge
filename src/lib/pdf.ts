// Client-side DOM-to-PDF: render an element exactly as styled on screen into
// a one-page PDF, no server-side rendering needed. Shared by Wellness
// Evaluation reports and invoices.
export async function buildPdfFromElement(el: HTMLElement, filename: string): Promise<File> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas-pro"), import("jspdf")]);
  if (document.fonts?.ready) await document.fonts.ready;
  const canvas = await html2canvas(el, {
    scale: 2,
    useCORS: true,
    ignoreElements: (node) => node instanceof HTMLElement && node.dataset.pdfHide !== undefined,
    onclone: (doc) => {
      // the cards' soft gradient renders as a smudge — use a flat background in the PDF
      doc.querySelectorAll<HTMLElement>("[data-pdf-flat]").forEach((n) => {
        n.style.background = "var(--card)";
      });
    },
  });
  // one tall page (no awkward page breaks) — easy to scroll on a phone
  const w = 210;
  const h = (canvas.height * w) / canvas.width;
  const pdf = new jsPDF({ unit: "mm", format: [w, h], orientation: h > w ? "portrait" : "landscape" });
  pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, w, h);
  return new File([pdf.output("blob")], filename, { type: "application/pdf" });
}

export function downloadFile(file: File) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
