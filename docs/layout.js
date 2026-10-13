/* Marcas para guía - geometría de las hojas y reglas de armado
 * Las medidas salen del PDF modelo (612 x 1008 pt, formato oficio):
 *  - Frente: 3 columnas x 2 filas = 6 cuadros (el 1 queda libre)
 *  - Anexo: 5 columnas x 8 filas = 40 cuadros
 */
(function (global) {
  'use strict';

  const PAGE = { w: 612, h: 1008 };
  const FRENTE = { cols: 3, rows: 2, x0: 42.2, y0: 261.2, cw: 118.83, ch: 100.75 };
  const ANEXO = { cols: 5, rows: 8, x0: 25.99, y0: 199.96, cw: 113.806, ch: 90.014 };
  const FRENTE_CELLS = FRENTE.cols * FRENTE.rows; // 6
  const ANEXO_CELLS = ANEXO.cols * ANEXO.rows;     // 40
  const FRENTE_USABLE = FRENTE_CELLS - 1;          // 5 (el cuadro 1 queda libre)
  const FILL = 0.74;                                // la marca ocupa 74% del cuadro
  const GRID_GRAY = '#999999';

  const PEN_MIN = 0.8, PEN_STEP = 0.35;            // grosor 1..10 -> 0.8 .. 3.95 pt
  function penFromLevel(level) { return PEN_MIN + (Math.round(level) - 1) * PEN_STEP; }
  const DEFAULT_PEN_LEVEL = 5;                      // 2.2 pt

  function geom(kind) { return kind === 'F' ? FRENTE : ANEXO; }

  function cellRect(kind, idx) {
    const g = geom(kind);
    const col = idx % g.cols, row = Math.floor(idx / g.cols);
    return { x: g.x0 + col * g.cw, y: g.y0 + row * g.ch, w: g.cw, h: g.ch };
  }

  function f2(v) { return (Math.round(v * 100) / 100).toString(); }

  // Coloca una marca dentro de un cuadro: mismo tamaño máximo, sin deformar, centrada.
  function placeMark(mark, rect, pen) {
    const boxW = Math.max(1, rect.w * FILL - pen);
    const boxH = Math.max(1, rect.h * FILL - pen);
    const mw = mark.w, mh = mark.h;
    let s;
    if (mw < 1e-3 && mh < 1e-3) s = 0;
    else s = Math.min(mw < 1e-3 ? Infinity : boxW / mw, mh < 1e-3 ? Infinity : boxH / mh);
    const ox = rect.x + rect.w / 2 - mw * s / 2;
    const oy = rect.y + rect.h / 2 - mh * s / 2;
    const paths = [];
    const dots = [];
    for (const q of mark.strokes) {
      if (q.length === 1) { dots.push([ox + q[0][0] * s, oy + q[0][1] * s]); continue; }
      let d = '';
      for (let i = 0; i < q.length; i++) {
        d += (i ? 'L' : 'M') + f2(ox + q[i][0] * s) + ' ' + f2(oy + q[i][1] * s);
      }
      paths.push(d);
    }
    return { d: paths.join(''), dots };
  }

  function pageCellIds(guide, pageId) {
    if (pageId === 'F') return guide.frente;
    const sh = guide.sheets.find((x) => x.id === pageId);
    return sh ? sh.cells : [];
  }

  function pageKind(pageId) { return pageId === 'F' ? 'F' : 'A'; }

  // SVG de una hoja completa (misma geometría que el PDF)
  function pageSVG(guide, pageId, marks, opts) {
    opts = opts || {};
    const kind = pageKind(pageId);
    const g = geom(kind);
    const cells = pageCellIds(guide, pageId);
    const pen = opts.pen != null ? opts.pen : penFromLevel(guide.penLevel || DEFAULT_PEN_LEVEL);
    const n = kind === 'F' ? FRENTE_CELLS : ANEXO_CELLS;
    let out = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + PAGE.w + ' ' + PAGE.h + '" class="pagesvg"' +
      (opts.label ? ' role="img" aria-label="' + opts.label + '"' : ' aria-hidden="true"') + '>';
    out += '<rect x="0" y="0" width="' + PAGE.w + '" height="' + PAGE.h + '" fill="#fff"/>';
    for (let i = 0; i < n; i++) {
      const r = cellRect(kind, i);
      const reserved = kind === 'F' && i === 0;
      const isNext = opts.nextIdx === i && opts.nextPage === pageId;
      if (isNext) out += '<rect x="' + f2(r.x) + '" y="' + f2(r.y) + '" width="' + f2(r.w) + '" height="' + f2(r.h) + '" fill="#DDF0E4"/>';
      if (opts.lines) {
        out += '<rect x="' + f2(r.x) + '" y="' + f2(r.y) + '" width="' + f2(r.w) + '" height="' + f2(r.h) + '" fill="none" stroke="' +
          (reserved ? '#000' : GRID_GRAY) + '" stroke-width="0.96"/>';
      }
    }
    let marksSvg = '';
    for (let i = 0; i < n; i++) {
      const id = cells[i];
      if (!id) continue;
      const m = marks[id];
      if (!m) continue;
      const r = cellRect(kind, i);
      const p = placeMark(m, r, pen);
      if (p.d) marksSvg += '<path d="' + p.d + '"/>';
      for (const dt of p.dots) marksSvg += '<circle cx="' + f2(dt[0]) + '" cy="' + f2(dt[1]) + '" r="' + f2(pen / 2) + '" fill="#111" stroke="none"/>';
    }
    out += '<g fill="none" stroke="#111" stroke-width="' + f2(pen) + '" stroke-linecap="round" stroke-linejoin="round">' + marksSvg + '</g>';
    if (opts.hit) {
      for (let i = 0; i < n; i++) {
        if (kind === 'F' && i === 0) continue;
        const r = cellRect(kind, i);
        out += '<rect data-cell="' + i + '" x="' + f2(r.x) + '" y="' + f2(r.y) + '" width="' + f2(r.w) + '" height="' + f2(r.h) + '" fill="transparent" stroke="none" style="cursor:pointer"/>';
      }
    }
    out += '</svg>';
    return out;
  }

  /* ---------- guías (datos) ---------- */

  function uid(prefix) {
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function sheetsNeeded(target) {
    return Math.max(1, Math.ceil(Math.max(0, target - FRENTE_USABLE) / ANEXO_CELLS));
  }

  function newGuide(name, target) {
    const guide = {
      id: uid('g'),
      name: name,
      target: target,
      penLevel: DEFAULT_PEN_LEVEL,
      lines: true,
      frente: new Array(FRENTE_CELLS).fill(null),
      sheets: [],
      plan: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    const n = sheetsNeeded(target);
    for (let i = 0; i < n; i++) guide.sheets.push({ id: uid('s'), cells: new Array(ANEXO_CELLS).fill(null) });
    guide.plan = pageIds(guide);
    return guide;
  }

  function pageIds(guide) { return ['F'].concat(guide.sheets.map((s) => s.id)); }

  function pageTitle(guide, pageId) {
    if (pageId === 'F') return 'Frente';
    const i = guide.sheets.findIndex((s) => s.id === pageId);
    return 'Anexo ' + (i + 1);
  }

  function countMarks(guide) {
    let c = guide.frente.filter(Boolean).length;
    for (const s of guide.sheets) c += s.cells.filter(Boolean).length;
    return c;
  }

  function capacity(guide) { return FRENTE_USABLE + guide.sheets.length * ANEXO_CELLS; }

  // Primer cuadro libre en el orden de carga: frente (2 al 6), luego anexos.
  function nextEmpty(guide) {
    for (let i = 1; i < FRENTE_CELLS; i++) if (!guide.frente[i]) return { page: 'F', idx: i };
    for (const s of guide.sheets) {
      for (let i = 0; i < ANEXO_CELLS; i++) if (!s.cells[i]) return { page: s.id, idx: i };
    }
    return null;
  }

  function slotLabel(guide, slot) {
    if (!slot) return '';
    if (slot.page === 'F') return 'Frente, cuadro ' + (slot.idx + 1);
    return pageTitle(guide, slot.page) + ', cuadro ' + (slot.idx + 1);
  }

  function setSlot(guide, slot, markId) {
    if (slot.page === 'F') guide.frente[slot.idx] = markId;
    else {
      const s = guide.sheets.find((x) => x.id === slot.page);
      if (s) s.cells[slot.idx] = markId;
    }
  }

  function getSlot(guide, slot) {
    if (slot.page === 'F') return guide.frente[slot.idx];
    const s = guide.sheets.find((x) => x.id === slot.page);
    return s ? s.cells[slot.idx] : null;
  }

  function allMarkIds(guide) {
    const ids = guide.frente.filter(Boolean);
    for (const s of guide.sheets) for (const id of s.cells) if (id) ids.push(id);
    return ids;
  }

  // Copiar hojas: inserta N veces el bloque elegido justo después de su última aparición.
  function copyPages(guide, selected, times) {
    const order = pageIds(guide).filter((id) => selected.indexOf(id) >= 0);
    if (!order.length || times < 1) return guide.plan.slice();
    let last = -1;
    guide.plan.forEach((id, i) => { if (order.indexOf(id) >= 0) last = i; });
    const block = [];
    for (let t = 0; t < times; t++) for (const id of order) block.push(id);
    const plan = guide.plan.slice();
    plan.splice(last + 1, 0, ...block);
    return plan;
  }

  function planCounts(guide) {
    const counts = {};
    for (const id of guide.plan) counts[id] = (counts[id] || 0) + 1;
    return counts;
  }

  global.Layout = {
    PAGE, FRENTE, ANEXO, FRENTE_CELLS, ANEXO_CELLS, FRENTE_USABLE, FILL, GRID_GRAY,
    penFromLevel, DEFAULT_PEN_LEVEL, cellRect, placeMark, pageSVG, pageCellIds, pageKind,
    uid, sheetsNeeded, newGuide, pageIds, pageTitle, countMarks, capacity, nextEmpty,
    slotLabel, setSlot, getSlot, allMarkIds, copyPages, planCounts
  };
})(typeof window !== 'undefined' ? window : globalThis);
