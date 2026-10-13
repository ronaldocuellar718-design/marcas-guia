/* Marcas para guía - exportación a PDF vectorial (nítido a cualquier zoom)
 * Cada hoja mide 612 x 1008 pt, igual que el modelo. Los cuadritos se dibujan
 * solo si se pide "Con líneas".
 */
(function (global) {
  'use strict';

  async function buildPDF(guide, marks, opts) {
    opts = opts || {};
    const { PDFDocument, rgb, LineCapStyle } = global.PDFLib;
    const L = global.Layout;
    const pdf = await PDFDocument.create();
    pdf.setTitle('Marcas para guía - ' + (guide.name || ''));
    pdf.setProducer('Marcas para guía');
    pdf.setCreator('Marcas para guía');
    const pen = L.penFromLevel(guide.penLevel || L.DEFAULT_PEN_LEVEL);
    const ink = rgb(0.07, 0.07, 0.07);
    const gray = rgb(0.6, 0.6, 0.6);
    const black = rgb(0, 0, 0);

    for (const pageId of guide.plan) {
      const page = pdf.addPage([L.PAGE.w, L.PAGE.h]);
      page.pushOperators(global.PDFLib.setLineJoin(global.PDFLib.LineJoinStyle.Round));
      const kind = L.pageKind(pageId);
      const n = kind === 'F' ? L.FRENTE_CELLS : L.ANEXO_CELLS;
      const cells = L.pageCellIds(guide, pageId);

      if (opts.lines) {
        for (let i = 0; i < n; i++) {
          const r = L.cellRect(kind, i);
          page.drawRectangle({
            x: r.x, y: L.PAGE.h - r.y - r.h, width: r.w, height: r.h,
            borderColor: (kind === 'F' && i === 0) ? black : gray,
            borderWidth: 0.96
          });
        }
      }

      for (let i = 0; i < n; i++) {
        const id = cells[i];
        if (!id || !marks[id]) continue;
        const r = L.cellRect(kind, i);
        const p = L.placeMark(marks[id], r, pen, L.boxScaleOf(guide));
        if (p.d) {
          page.drawSvgPath(p.d, {
            x: 0, y: L.PAGE.h,
            borderColor: ink, borderWidth: pen,
            borderLineCap: LineCapStyle.Round
          });
        }
        for (const dt of p.dots) {
          page.drawCircle({ x: dt[0], y: L.PAGE.h - dt[1], size: pen / 2, color: ink });
        }
      }
    }
    return pdf.save();
  }

  global.PDFExport = { buildPDF };
})(typeof window !== 'undefined' ? window : globalThis);
