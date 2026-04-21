/**
 * PDF export helper — captures a DOM node as a multi-page PDF.
 *
 * Uses html2canvas to rasterize the element, then jsPDF to tile the image
 * across one or more Letter-sized pages (landscape). Works with Recharts
 * SVG charts and regular HTML tables.
 */

import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

/**
 * Export a DOM node to a PDF file.
 *
 * @param {HTMLElement} node - The element to capture.
 * @param {string} filename - Output filename (should end in .pdf).
 * @param {object} [opts]
 * @param {string} [opts.title] - Optional title drawn at the top of page 1.
 * @param {string} [opts.subtitle] - Optional subtitle drawn below the title.
 */
export async function exportNodeToPdf(node, filename, opts = {}) {
  if (!node) throw new Error('exportNodeToPdf: node is required');

  // Give React a tick to commit any state changes (e.g. force-expanding alerts)
  // before we rasterize the DOM.
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  // Capture at 2x for crisper output
  const canvas = await html2canvas(node, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
  });

  const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 24;
  const headerH = (opts.title || opts.subtitle) ? 44 : 0;

  // Scale image width to page width (minus margins)
  const imgW = pageW - margin * 2;
  const imgH = (canvas.height * imgW) / canvas.width;

  // Available content height per page
  const contentH = pageH - margin * 2 - headerH;

  // Draw header on page 1 if requested
  const drawHeader = () => {
    if (!opts.title && !opts.subtitle) return;
    if (opts.title) {
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(16);
      pdf.setTextColor(4, 20, 79); // navy
      pdf.text(opts.title, margin, margin + 18);
    }
    if (opts.subtitle) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      pdf.setTextColor(100, 100, 100);
      pdf.text(opts.subtitle, margin, margin + 34);
    }
  };

  // If the image fits on one page, just add it
  if (imgH <= contentH) {
    drawHeader();
    pdf.addImage(canvas, 'PNG', margin, margin + headerH, imgW, imgH);
    pdf.save(filename);
    return;
  }

  // Otherwise, slice the canvas into page-sized chunks
  const pxPerPt = canvas.width / imgW;
  const sliceHpx = contentH * pxPerPt;
  let yOffsetPx = 0;
  let firstPage = true;

  while (yOffsetPx < canvas.height) {
    const remaining = canvas.height - yOffsetPx;
    const thisSliceH = Math.min(sliceHpx, remaining);

    // Draw this slice onto a temp canvas, convert to image, add to PDF
    const sliceCanvas = document.createElement('canvas');
    sliceCanvas.width = canvas.width;
    sliceCanvas.height = thisSliceH;
    const ctx = sliceCanvas.getContext('2d');
    ctx.drawImage(canvas, 0, yOffsetPx, canvas.width, thisSliceH, 0, 0, canvas.width, thisSliceH);

    if (!firstPage) pdf.addPage();
    const topOffset = firstPage ? margin + headerH : margin;
    if (firstPage) drawHeader();
    pdf.addImage(sliceCanvas, 'PNG', margin, topOffset, imgW, thisSliceH / pxPerPt);

    yOffsetPx += thisSliceH;
    firstPage = false;
  }

  pdf.save(filename);
}
