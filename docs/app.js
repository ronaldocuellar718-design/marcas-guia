/* Marcas para guía - aplicación (pantallas y flujo) */
(function () {
  'use strict';

  const L = window.Layout;
  const S = {
    screen: 'home',
    guides: [],
    guide: null,
    marks: {},
    tab: 'F',
    cam: null,
    rev: null,
    sel: [],
    times: 3,
    pdf: null,
    from: 'home'
  };

  /* ---------- utilidades ---------- */

  const $ = (sel, root) => (root || document).querySelector(sel);
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  const nextPaint = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 30)));

  const ICON = {
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
    flash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 3L5 14h6l-1 7 8-11h-6z"/></svg>',
    gallery: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9" cy="10" r="1.5"/><path d="M4 17l5-4 4 3 3-2 4 3"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>',
    minus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M6 12h12"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M6 12h12M12 6v12"/></svg>',
    pdf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 13h6M9 17h6"/></svg>'
  };

  let toastTimer = null;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
  }
  function busy(msg) { $('#busytxt').textContent = msg || 'Procesando…'; $('#busy').hidden = false; }
  function unbusy() { $('#busy').hidden = true; }

  function modal(html) {
    const m = $('#modal');
    m.innerHTML = '<div class="back" data-act="modalBack"><div class="sheet" role="dialog" aria-modal="true">' + html + '</div></div>';
    const first = m.querySelector('input,button');
    if (first && first.tagName === 'INPUT') setTimeout(() => first.focus(), 50);
  }
  function closeModal() { $('#modal').innerHTML = ''; }

  function canvasToBlob(c, type, q) {
    return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('No se pudo guardar la imagen'))), type, q));
  }

  async function fileToCanvas(fileOrBlob, maxSide) {
    let bmp = null;
    try { bmp = await createImageBitmap(fileOrBlob, { imageOrientation: 'from-image' }); } catch (e) { bmp = null; }
    let w, h, src;
    if (bmp) { w = bmp.width; h = bmp.height; src = bmp; }
    else {
      const url = URL.createObjectURL(fileOrBlob);
      const img = new Image();
      img.src = url;
      await img.decode();
      w = img.naturalWidth; h = img.naturalHeight; src = img;
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
    const s = Math.min(1, maxSide / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s));
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    if (bmp && bmp.close) bmp.close();
    return c;
  }

  function blobToBase64(blob) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(',')[1]);
      r.onerror = () => rej(r.error);
      r.readAsDataURL(blob);
    });
  }

  function isNative() {
    const c = window.Capacitor;
    return !!(c && c.isNativePlatform && c.isNativePlatform());
  }

  /* ---------- datos ---------- */

  async function refreshGuides() {
    S.guides = (await DB.listGuides()).sort((a, b) => b.updatedAt - a.updatedAt);
  }
  async function saveGuide() { if (S.guide) await DB.putGuide(S.guide); }
  async function ensureMarks(g) {
    const need = L.allMarkIds(g).filter((id) => !S.marks[id]);
    if (need.length) Object.assign(S.marks, await DB.getMarks(need));
  }
  async function openGuide(id) {
    const g = S.guides.find((x) => x.id === id);
    if (!g) return;
    S.guide = g;
    S.marks = {};
    await ensureMarks(g);
    S.tab = 'F';
    S.sel = [];
    S.pdf = null;
  }

  /* ---------- navegación ---------- */

  function go(screen, push) {
    if (S.screen === 'camera' && screen !== 'camera') stopCamera();
    S.screen = screen;
    if (push !== false) { try { history.pushState({ s: screen }, ''); } catch (e) { /* nada */ } }
    render();
    window.scrollTo(0, 0);
  }

  function back() {
    if ($('#crop')) { closeCrop(); return 'overlay'; }
    if ($('#modal').innerHTML) { closeModal(); return 'overlay'; }
    switch (S.screen) {
      case 'home': return false;
      case 'camera': S.guide && L.countMarks(S.guide) > 0 ? go('doc', false) : go('home', false); return true;
      case 'review': S.rev && S.rev.editOnly ? go('doc', false) : go('camera', false); return true;
      case 'doc': go('home', false); return true;
      case 'copy': case 'export': go('doc', false); return true;
      default: go('home', false); return true;
    }
  }

  window.addEventListener('popstate', () => {
    const r = back();
    if (r === 'overlay') { try { history.pushState({ s: S.screen }, ''); } catch (e) { /* nada */ } }
  });

  /* ---------- pantallas ---------- */

  function render() {
    const app = $('#app');
    let html = '';
    switch (S.screen) {
      case 'home': html = viewHome(); break;
      case 'camera': html = viewCamera(); break;
      case 'review': html = viewReview(); break;
      case 'doc': html = viewDoc(); break;
      case 'copy': html = viewCopy(); break;
      case 'export': html = viewExport(); break;
      default: html = viewHome();
    }
    app.innerHTML = html;
    if (S.screen === 'camera') startCamera();
  }

  function guideProgress(g) { return L.countMarks(g); }

  function viewHome() {
    let list = '';
    if (!S.guides.length) {
      list = '<p class="empty">Todavía no hay guías. Tocá «Nueva guía» para empezar a cargar las marcas.</p>';
    } else {
      list = S.guides.map((g) => {
        const c = guideProgress(g);
        const pct = Math.min(100, Math.round(c * 100 / Math.max(1, g.target)));
        const next = L.nextEmpty(g);
        const done = c >= g.target || !next;
        return '<div class="card">' +
          '<div class="top"><span class="name">' + esc(g.name) + '</span><span class="count">' + c + ' de ' + g.target + ' marcas</span></div>' +
          '<div class="bar" aria-hidden="true"><i style="width:' + pct + '%"></i></div>' +
          (done
            ? '<button type="button" class="btn" data-act="openDoc" data-id="' + g.id + '">Abrir el documento</button>'
            : '<button type="button" class="btn" data-act="continueGuide" data-id="' + g.id + '">Continuar con la marca ' + (c + 1) + '</button>' +
              '<button type="button" class="btn flat" data-act="openDoc" data-id="' + g.id + '">Ver el documento</button>') +
          '<button type="button" class="btn flat" data-act="delGuide" data-id="' + g.id + '">Eliminar esta guía</button>' +
          '</div>';
      }).join('');
    }
    return '<main class="screen">' +
      '<div><div class="eyebrow">Grupo Piveta</div><h1 class="home-title">Marcas para guía</h1></div>' +
      '<div class="label">En proceso</div>' + list +
      '<div class="spacer"></div>' +
      '<button type="button" class="btn primary big" data-act="newGuide">' + ICON.camera + 'Nueva guía</button>' +
      '</main>';
  }

  /* ----- cámara ----- */

  function camTitle() {
    const g = S.guide;
    const slot = S.cam && S.cam.slot;
    return '<b>Marca ' + (L.countMarks(g) + (slot && L.getSlot(g, slot) ? 0 : 1)) + ' de ' + g.target + '</b><span>' + esc(L.slotLabel(g, slot)) + '</span>';
  }

  function viewCamera() {
    return '<div class="camscreen">' +
      '<div class="camtop"><button type="button" class="iconbtn" data-act="back" aria-label="Volver">' + ICON.back + '</button>' +
      '<div class="mid">' + camTitle() + '</div><div style="width:48px"></div></div>' +
      '<div class="viewfinder"><video id="vid" autoplay playsinline muted></video>' +
      '<div class="roi" id="roi"></div>' +
      '<div class="chips" id="chips"></div>' +
      '<div class="camhint" id="camhint">Encuadrá la marca dentro del cuadro verde</div>' +
      '<div class="camerr" id="camerr" hidden></div></div>' +
      '<div class="camctl">' +
      '<button type="button" class="sm" id="torchbtn" data-act="torch" aria-label="Linterna" hidden>' + ICON.flash + '</button>' +
      '<label class="sm" for="filein" role="button" aria-label="Elegir una foto de la galería" tabindex="0">' + ICON.gallery + '</label>' +
      '<button type="button" class="shutter" data-act="shoot" aria-label="Sacar foto"></button>' +
      '<label class="sm" for="filecam" role="button" aria-label="Usar la cámara del teléfono" tabindex="0">' + ICON.camera + '</label>' +
      '<div style="width:56px" aria-hidden="true"></div>' +
      '</div>' +
      '<input type="file" id="filein" accept="image/*" hidden>' +
      '<input type="file" id="filecam" accept="image/*" capture="environment" hidden>' +
      '</div>';
  }

  function stopCamera() {
    const c = S.cam;
    if (!c) return;
    if (c.timer) clearInterval(c.timer);
    if (c.stream) c.stream.getTracks().forEach((t) => t.stop());
    c.stream = null; c.timer = null;
  }

  function camFail(msg) {
    const el = $('#camerr');
    if (!el) return;
    el.hidden = false;
    el.textContent = msg;
    const h = $('#camhint'); if (h) h.hidden = true;
  }

  async function startCamera() {
    const slot = S.cam && S.cam.slot;
    S.cam = { slot, stream: null, timer: null, torch: false };
    const video = $('#vid');
    if (!video) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      camFail('Este dispositivo no permite usar la cámara dentro de la app. Usá el botón de la galería o el de la cámara del teléfono.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } },
        audio: false
      });
      if (S.screen !== 'camera') { stream.getTracks().forEach((t) => t.stop()); return; }
      S.cam.stream = stream;
      video.srcObject = stream;
      await video.play().catch(() => {});
      const track = stream.getVideoTracks()[0];
      const caps = track.getCapabilities ? track.getCapabilities() : {};
      try {
        if (caps.focusMode && caps.focusMode.indexOf('continuous') >= 0) await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
      } catch (e) { /* nada */ }
      if (caps.torch) { S.cam.torch = true; const tb = $('#torchbtn'); if (tb) tb.hidden = false; }
      S.cam.timer = setInterval(qualityTick, 800);
    } catch (err) {
      const name = err && err.name;
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        camFail('No hay permiso para usar la cámara. Activalo en los permisos de la app, o elegí una foto con los botones de abajo.');
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        camFail('No se encontró una cámara. Elegí una foto con los botones de abajo.');
      } else {
        camFail('No se pudo abrir la cámara. Elegí una foto con los botones de abajo.');
      }
    }
  }

  function roiFromView() {
    const v = $('#vid'), r = $('#roi');
    const vr = v.getBoundingClientRect(), rr = r.getBoundingClientRect();
    const vw = v.videoWidth, vh = v.videoHeight;
    const scale = Math.max(vr.width / vw, vr.height / vh);
    const dw = vw * scale, dh = vh * scale;
    const ox = vr.left + (vr.width - dw) / 2, oy = vr.top + (vr.height - dh) / 2;
    let x = (rr.left - ox) / scale, y = (rr.top - oy) / scale, w = rr.width / scale, h = rr.height / scale;
    x = Math.max(0, x); y = Math.max(0, y);
    w = Math.min(vw - x, w); h = Math.min(vh - y, h);
    return { x, y, w, h };
  }

  const MSG_LIVE = {
    ok: ['Foto nítida', 'Luz correcta'],
    empty: ['Encuadrá la marca'],
    blur: ['Poca nitidez', 'Acercá o esperá a que enfoque'],
    dark: ['Poca luz'],
    over: ['Demasiada luz o brillo']
  };

  function qualityTick() {
    const v = $('#vid'), chips = $('#chips');
    if (!v || !chips || !v.videoWidth || S.screen !== 'camera') return;
    try {
      const roi = roiFromView();
      const s = Math.min(1, 480 / Math.max(roi.w, roi.h));
      const c = document.createElement('canvas');
      c.width = Math.max(16, Math.round(roi.w * s)); c.height = Math.max(16, Math.round(roi.h * s));
      c.getContext('2d').drawImage(v, roi.x, roi.y, roi.w, roi.h, 0, 0, c.width, c.height);
      const q = Engine.liveQuality(c);
      const list = MSG_LIVE[q.state] || MSG_LIVE.ok;
      const warn = q.state !== 'ok';
      chips.innerHTML = list.map((t) => '<span class="chip' + (warn ? ' warn' : '') + '">' + t + '</span>').join('');
    } catch (e) { /* nada */ }
  }

  async function toggleTorch() {
    const c = S.cam;
    if (!c || !c.stream) return;
    const track = c.stream.getVideoTracks()[0];
    c.torchOn = !c.torchOn;
    try { await track.applyConstraints({ advanced: [{ torch: c.torchOn }] }); } catch (e) { c.torchOn = false; }
    const tb = $('#torchbtn'); if (tb) tb.classList.toggle('on', !!c.torchOn);
  }

  async function shoot() {
    const v = $('#vid');
    if (!v || !v.videoWidth || !S.cam || !S.cam.stream) { toast('La cámara todavía no está lista'); return; }
    const roi = roiFromView();
    const s = Math.min(1, 2400 / Math.max(v.videoWidth, v.videoHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(v.videoWidth * s); c.height = Math.round(v.videoHeight * s);
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    const rev = {
      frameCanvas: c, frameBlob: null,
      roi: { x: roi.x * s, y: roi.y * s, w: roi.w * s, h: roi.h * s },
      keepDots: false, slot: S.cam.slot, markId: null, editOnly: false, source: 'live'
    };
    await beginReview(rev);
  }

  async function fromFile(file) {
    if (!file) return;
    busy('Abriendo la foto…');
    await nextPaint();
    try {
      const c = await fileToCanvas(file, 2400);
      const w = c.width, h = c.height;
      const bw = w * 0.9, bh = h * 0.9;
      const rev = {
        frameCanvas: c, frameBlob: null,
        roi: { x: (w - bw) / 2, y: (h - bh) / 2, w: bw, h: bh },
        keepDots: false, slot: S.cam && S.cam.slot, markId: null, editOnly: false, source: 'file'
      };
      S.rev = rev;
      unbusy();
      openCrop(true);
    } catch (e) {
      unbusy();
      toast('No se pudo abrir esa foto');
    }
  }

  /* ----- revisión ----- */

  async function processReview() {
    const rev = S.rev;
    const roi = rev.roi;
    const sc = Math.min(1, 1400 / Math.max(roi.w, roi.h));
    const crop = document.createElement('canvas');
    crop.width = Math.max(8, Math.round(roi.w * sc)); crop.height = Math.max(8, Math.round(roi.h * sc));
    crop.getContext('2d').drawImage(rev.frameCanvas, roi.x, roi.y, roi.w, roi.h, 0, 0, crop.width, crop.height);
    rev.cropURL = crop.toDataURL('image/jpeg', 0.85);
    rev.result = Engine.analyze(crop, { keepDots: rev.keepDots });
  }

  async function beginReview(rev) {
    S.rev = rev;
    busy('Procesando la marca…');
    await nextPaint();
    try {
      if (!rev.frameBlob) rev.frameBlob = await canvasToBlob(rev.frameCanvas, 'image/jpeg', 0.92);
      await processReview();
    } catch (e) {
      rev.result = { error: 'fail' };
    }
    unbusy();
    go('review');
  }

  function qualityNotes(q) {
    if (!q) return '';
    const n = [];
    if (q.blur) n.push('La foto está algo borrosa. Conviene repetirla.');
    if (q.dark) n.push('Hay poca luz. Probá con más luz.');
    if (q.over) n.push('Hay demasiada luz o brillo sobre el papel.');
    if (q.lowContrast) n.push('Hay poca diferencia entre la marca y el papel.');
    return n.map((t) => '<div class="note">' + t + '</div>').join('');
  }

  function previewSVG(result, penLevel) {
    const W = L.ANEXO.cw, H = L.ANEXO.ch;
    const pen = L.penFromLevel(penLevel);
    const p = L.placeMark(result, { x: 0, y: 0, w: W, h: H }, pen);
    let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Marca con trazo uniforme">' +
      '<g fill="none" stroke="#111" stroke-width="' + pen + '" stroke-linecap="round" stroke-linejoin="round"><path d="' + p.d + '"/></g>';
    for (const d of p.dots) s += '<circle cx="' + d[0] + '" cy="' + d[1] + '" r="' + (pen / 2) + '" fill="#111"/>';
    return s + '</svg>';
  }

  function miniGrid(slot) {
    const g = S.guide;
    const kind = slot.page === 'F' ? 'F' : 'A';
    const n = kind === 'F' ? L.FRENTE_CELLS : L.ANEXO_CELLS;
    const cols = kind === 'F' ? L.FRENTE.cols : L.ANEXO.cols;
    const cells = L.pageCellIds(g, slot.page);
    let h = '<div class="mini ' + (kind === 'F' ? 'fr' : '') + '" style="grid-template-columns:repeat(' + cols + ',minmax(0,1fr))" aria-hidden="true">';
    for (let i = 0; i < n; i++) {
      let cls = '';
      if (i === slot.idx) cls = 'n'; else if (cells[i]) cls = 'f';
      h += '<i class="' + cls + '"></i>';
    }
    return h + '</div>';
  }

  function viewReview() {
    const rev = S.rev, g = S.guide;
    if (!rev) return viewHome();
    const r = rev.result || {};
    const err = r.error;
    const level = g.penLevel;
    let resBox;
    if (err) {
      const m = err === 'too_much' ? 'Se ve demasiado en la foto. Ajustá el recorte para que solo entre la marca.'
        : err === 'no_mark' ? 'No se encontró la marca. Ajustá el recorte o repetí la foto.'
          : 'No se pudo procesar la foto. Repetila.';
      resBox = '<div class="err">' + m + '</div>';
    } else resBox = previewSVG(r, level);
    const slot = rev.slot;
    const num = rev.markId ? null : (L.countMarks(g) + 1);
    const title = rev.markId ? 'Revisar marca' : 'Revisar marca ' + num + ' de ' + g.target;
    return '<main class="screen">' +
      '<div class="hdr"><button type="button" class="iconbtn" data-act="back" aria-label="Volver">' + ICON.back + '</button>' +
      '<div class="ttl"><h1>' + title + '</h1></div></div>' +
      '<div class="panels">' +
      '<div class="panel"><span class="label">Foto</span><div class="box" style="background:#D3D1CA"><img alt="Foto recortada de la marca" src="' + rev.cropURL + '"></div></div>' +
      '<div class="panel res"><span class="label">Resultado</span><div class="box" id="resbox">' + resBox + '</div></div>' +
      '</div>' +
      (err ? '' : qualityNotes(r.quality)) +
      '<div class="card" style="gap:6px;padding:14px 16px">' +
      '<div class="top"><label for="pen" style="font-size:16px;font-weight:600">Grosor del trazo</label><span class="small">igual en todas las marcas</span></div>' +
      '<input id="pen" class="range" data-act="pen" type="range" min="1" max="10" step="1" value="' + level + '">' +
      '<div class="rangelbl"><span>Fino</span><span>Grueso</span></div></div>' +
      '<div class="switchrow"><span id="lbl-dots">Conservar punto suelto</span>' +
      '<button type="button" class="switch" role="switch" aria-checked="' + (rev.keepDots ? 'true' : 'false') + '" aria-labelledby="lbl-dots" data-act="dots"><i></i></button></div>' +
      (slot ? '<div class="where">' + miniGrid(slot) + '<div><div class="t1">Se ubicará en</div><div class="t2">' + esc(L.slotLabel(g, slot)) + '</div></div></div>' : '') +
      '<div class="spacer"></div>' +
      '<button type="button" class="btn primary" data-act="accept"' + (err ? ' disabled' : '') + '>' + (rev.editOnly ? 'Guardar cambios' : 'Aceptar y sacar la siguiente') + '</button>' +
      '<div class="row"><button type="button" class="btn" data-act="retake">Repetir foto</button>' +
      '<button type="button" class="btn" data-act="crop">Ajustar recorte</button></div>' +
      '</main>';
  }

  async function reprocess() {
    busy('Procesando la marca…');
    await nextPaint();
    try { await processReview(); } catch (e) { S.rev.result = { error: 'fail' }; }
    unbusy();
    render();
  }

  async function acceptReview() {
    const rev = S.rev, g = S.guide;
    if (!rev || !rev.result || rev.result.error) return;
    busy('Guardando…');
    await nextPaint();
    try {
      const id = rev.markId || L.uid('m');
      const mark = {
        id, guideId: g.id,
        strokes: rev.result.strokes, w: rev.result.w, h: rev.result.h,
        keepDots: rev.keepDots, roi: rev.roi,
        frameW: rev.frameCanvas.width, frameH: rev.frameCanvas.height,
        quality: rev.result.quality
      };
      if (!rev.frameBlob) rev.frameBlob = await canvasToBlob(rev.frameCanvas, 'image/jpeg', 0.92);
      let old = null;
      if (!rev.markId) {
        if (!rev.slot) throw new Error('No hay un cuadro libre');
        old = L.getSlot(g, rev.slot);
        L.setSlot(g, rev.slot, id);
      }
      await DB.putFrame(id, rev.frameBlob);
      await DB.putMark(mark);
      S.marks[id] = mark;
      if (old && old !== id) { await DB.deleteMark(old); delete S.marks[old]; }
      await saveGuide();
    } catch (e) {
      unbusy();
      toast('No se pudo guardar: ' + e.message);
      return;
    }
    unbusy();
    const wasEdit = rev.editOnly;
    S.rev = null;
    if (wasEdit) { toast('Cambios guardados'); go('doc'); return; }
    const done = L.countMarks(g) >= g.target;
    const next = L.nextEmpty(g);
    if (done || !next) {
      toast(done ? 'Listo: cargaste las ' + g.target + ' marcas' : 'No quedan cuadros libres. Agregá una hoja.');
      go('doc');
    } else {
      S.cam = { slot: next };
      go('camera');
    }
  }

  /* ----- ajustar recorte ----- */

  function closeCrop() { const c = $('#crop'); if (c) c.remove(); }

  function openCrop(fromFile) {
    const rev = S.rev;
    const fc = rev.frameCanvas;
    closeCrop();
    const wrap = document.createElement('div');
    wrap.className = 'cropscreen';
    wrap.id = 'crop';
    wrap.innerHTML =
      '<div class="camtop"><button type="button" class="iconbtn" data-c="cancel" aria-label="Cancelar">' + ICON.back + '</button>' +
      '<div class="mid"><b>Ajustar recorte</b><span>Mové o estirá el cuadro verde</span></div><div style="width:48px"></div></div>' +
      '<div class="cropstage" id="cstage"><div class="cropwrap" id="cwrap"></div></div>' +
      '<div class="row"><button type="button" class="btn" data-c="cancel" style="background:transparent;color:#F3F0E8;border-color:#4A5046">Cancelar</button>' +
      '<button type="button" class="btn primary" data-c="ok">Listo</button></div>';
    document.body.appendChild(wrap);
    const stage = $('#cstage'), cw = $('#cwrap');
    const sr = stage.getBoundingClientRect();
    const s = Math.min(sr.width / fc.width, sr.height / fc.height) * 0.98;
    const dw = Math.round(fc.width * s), dh = Math.round(fc.height * s);
    const cv = document.createElement('canvas');
    cv.width = Math.min(fc.width, 1600); cv.height = Math.round(cv.width * fc.height / fc.width);
    cv.getContext('2d').drawImage(fc, 0, 0, cv.width, cv.height);
    cv.style.width = dw + 'px'; cv.style.height = dh + 'px';
    cw.style.width = dw + 'px'; cw.style.height = dh + 'px';
    cw.appendChild(cv);
    const r = { x: rev.roi.x, y: rev.roi.y, w: rev.roi.w, h: rev.roi.h };
    const box = document.createElement('div');
    box.className = 'croprect';
    const hs = ['tl', 'tr', 'bl', 'br'].map((k) => {
      const h = document.createElement('div'); h.className = 'h'; h.dataset.h = k;
      h.style[k[0] === 't' ? 'top' : 'bottom'] = '-18px'; h.style[k[1] === 'l' ? 'left' : 'right'] = '-18px';
      box.appendChild(h); return h;
    });
    cw.appendChild(box);
    function place() {
      box.style.left = (r.x * s) + 'px'; box.style.top = (r.y * s) + 'px';
      box.style.width = (r.w * s) + 'px'; box.style.height = (r.h * s) + 'px';
    }
    place();
    const MIN = 40;
    let drag = null;
    function down(e) {
      const hk = e.target.dataset && e.target.dataset.h;
      drag = { mode: hk || 'move', x: e.clientX, y: e.clientY, r: { x: r.x, y: r.y, w: r.w, h: r.h } };
      box.setPointerCapture && box.setPointerCapture(e.pointerId);
      e.preventDefault();
    }
    function move(e) {
      if (!drag) return;
      const dx = (e.clientX - drag.x) / s, dy = (e.clientY - drag.y) / s;
      const o = drag.r;
      let x = o.x, y = o.y, w = o.w, h = o.h;
      if (drag.mode === 'move') {
        x = Math.min(Math.max(0, o.x + dx), fc.width - o.w);
        y = Math.min(Math.max(0, o.y + dy), fc.height - o.h);
      } else {
        const m = drag.mode;
        if (m[1] === 'l') { const nx = Math.min(Math.max(0, o.x + dx), o.x + o.w - MIN); w = o.w + (o.x - nx); x = nx; }
        else { w = Math.min(Math.max(MIN, o.w + dx), fc.width - o.x); }
        if (m[0] === 't') { const ny = Math.min(Math.max(0, o.y + dy), o.y + o.h - MIN); h = o.h + (o.y - ny); y = ny; }
        else { h = Math.min(Math.max(MIN, o.h + dy), fc.height - o.y); }
      }
      r.x = x; r.y = y; r.w = w; r.h = h;
      place();
    }
    function up() { drag = null; }
    box.addEventListener('pointerdown', down);
    box.addEventListener('pointermove', move);
    box.addEventListener('pointerup', up);
    box.addEventListener('pointercancel', up);
    wrap.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-c]');
      if (!b) return;
      if (b.dataset.c === 'cancel') {
        closeCrop();
        if (fromFile) { S.rev = null; render(); }
        return;
      }
      rev.roi = { x: r.x, y: r.y, w: r.w, h: r.h };
      closeCrop();
      if (fromFile) await beginReview(rev); else await reprocess();
    });
  }

  /* ----- documento ----- */

  function viewDoc() {
    const g = S.guide;
    if (!g) return viewHome();
    const ids = L.pageIds(g);
    if (ids.indexOf(S.tab) < 0) S.tab = 'F';
    const c = L.countMarks(g);
    const next = L.nextEmpty(g);
    const tabs = ids.map((id) => '<button type="button" class="tab" data-act="tab" data-id="' + id + '"' + (id === S.tab ? ' aria-current="page"' : '') + '>' + L.pageTitle(g, id) + '</button>').join('');
    const svg = L.pageSVG(g, S.tab, S.marks, {
      lines: g.lines, hit: true, nextIdx: next ? next.idx : -1, nextPage: next ? next.page : null,
      label: L.pageTitle(g, S.tab)
    });
    const isAnexo = S.tab !== 'F';
    return '<main class="screen">' +
      '<div class="hdr"><button type="button" class="iconbtn" data-act="back" aria-label="Volver">' + ICON.back + '</button>' +
      '<div class="ttl"><h1>Documento</h1><button type="button" class="sub link" data-act="editTarget">' + c + ' de ' + g.target + ' marcas</button></div></div>' +
      '<div class="tabs" role="tablist">' + tabs + '</div>' +
      '<div class="pagewrap"><div class="pagebox" id="pagebox">' + svg + '</div></div>' +
      '<div class="switchrow"><span id="lbl-lines">Líneas de los cuadros</span>' +
      '<button type="button" class="switch" role="switch" aria-checked="' + (g.lines ? 'true' : 'false') + '" aria-labelledby="lbl-lines" data-act="lines"><i></i></button></div>' +
      '<div class="row">' +
      '<button type="button" class="btn" data-act="addSheet">Agregar hoja</button>' +
      '<button type="button" class="btn" data-act="delSheet"' + (!isAnexo || g.sheets.length < 2 ? ' disabled' : '') + '>Quitar hoja</button></div>' +
      '<div class="row"><button type="button" class="btn" data-act="goCopy">' + ICON.copy + 'Copiar hojas</button>' +
      '<button type="button" class="btn" data-act="goExport">' + ICON.pdf + 'Exportar PDF</button></div>' +
      (next
        ? '<button type="button" class="btn primary" data-act="shootNext">Sacar la marca ' + (c + 1) + '</button>'
        : '') +
      '</main>';
  }

  function cellMenu(idx) {
    const g = S.guide;
    const slot = { page: S.tab, idx };
    const id = L.getSlot(g, slot);
    const label = esc(L.slotLabel(g, slot));
    if (id) {
      modal('<h2>' + label + '</h2><p>Esta casilla ya tiene una marca.</p>' +
        '<button type="button" class="btn" data-act="cellReview" data-i="' + idx + '">Revisar o ajustar la marca</button>' +
        '<button type="button" class="btn" data-act="cellRetake" data-i="' + idx + '">Sacar la foto de nuevo</button>' +
        '<button type="button" class="btn danger" data-act="cellRemove" data-i="' + idx + '">Quitar la marca</button>' +
        '<button type="button" class="btn flat" data-act="modalClose">Cerrar</button>');
    } else {
      modal('<h2>' + label + '</h2><p>Esta casilla está libre.</p>' +
        '<button type="button" class="btn primary" data-act="cellRetake" data-i="' + idx + '">Sacar la foto de esta casilla</button>' +
        '<button type="button" class="btn flat" data-act="modalClose">Cerrar</button>');
    }
  }

  async function reviewExisting(idx) {
    const g = S.guide;
    const slot = { page: S.tab, idx };
    const id = L.getSlot(g, slot);
    if (!id) return;
    busy('Abriendo la marca…');
    await nextPaint();
    try {
      const mark = S.marks[id] || await DB.getMark(id);
      const blob = await DB.getFrame(id);
      if (!mark || !blob) throw new Error('No se encontró la foto guardada');
      const c = await fileToCanvas(blob, 2400);
      const sx = c.width / mark.frameW;
      const rev = {
        frameCanvas: c, frameBlob: blob,
        roi: { x: mark.roi.x * sx, y: mark.roi.y * sx, w: mark.roi.w * sx, h: mark.roi.h * sx },
        keepDots: !!mark.keepDots, slot, markId: id, editOnly: true, source: 'edit'
      };
      S.rev = rev;
      await processReview();
      unbusy();
      go('review');
    } catch (e) {
      unbusy();
      toast('No se pudo abrir: ' + e.message);
    }
  }

  async function removeMark(idx) {
    const g = S.guide;
    const slot = { page: S.tab, idx };
    const id = L.getSlot(g, slot);
    if (!id) return;
    L.setSlot(g, slot, null);
    await DB.deleteMark(id);
    delete S.marks[id];
    await saveGuide();
    closeModal();
    render();
    toast('Marca quitada');
  }

  function editTargetModal() {
    const g = S.guide;
    modal('<h2>Cantidad de marcas</h2><p>Cuántas marcas tiene esta guía en total. Si hace falta, se agregan hojas de anexo.</p>' +
      '<div class="field"><label for="tg">Cantidad</label><input id="tg" type="number" inputmode="numeric" min="1" max="2000" value="' + g.target + '"></div>' +
      '<button type="button" class="btn primary" data-act="saveTarget">Guardar</button>' +
      '<button type="button" class="btn flat" data-act="modalClose">Cancelar</button>');
  }

  async function addSheet(silent) {
    const g = S.guide;
    const sh = { id: L.uid('s'), cells: new Array(L.ANEXO_CELLS).fill(null) };
    g.sheets.push(sh);
    g.plan.push(sh.id);
    await saveGuide();
    S.tab = sh.id;
    if (!silent) { render(); toast('Se agregó ' + L.pageTitle(g, sh.id)); }
  }

  async function removeSheet() {
    const g = S.guide;
    if (S.tab === 'F' || g.sheets.length < 2) return;
    const sh = g.sheets.find((x) => x.id === S.tab);
    if (!sh) return;
    const used = sh.cells.filter(Boolean);
    const name = L.pageTitle(g, sh.id);
    modal('<h2>Quitar ' + name + '</h2><p>' + (used.length ? 'Esta hoja tiene ' + used.length + ' marcas y se van a borrar.' : 'La hoja está vacía.') +
      ' Las copias que habías armado de esa hoja también se quitan.</p>' +
      '<button type="button" class="btn danger" data-act="confirmDelSheet">Quitar ' + name + '</button>' +
      '<button type="button" class="btn flat" data-act="modalClose">Cancelar</button>');
  }

  async function confirmDelSheet() {
    const g = S.guide;
    const sh = g.sheets.find((x) => x.id === S.tab);
    if (!sh) { closeModal(); return; }
    busy('Quitando la hoja…');
    for (const id of sh.cells.filter(Boolean)) { await DB.deleteMark(id); delete S.marks[id]; }
    g.sheets = g.sheets.filter((x) => x.id !== sh.id);
    g.plan = g.plan.filter((id) => id !== sh.id);
    S.sel = S.sel.filter((id) => id !== sh.id);
    S.tab = 'F';
    await saveGuide();
    unbusy();
    closeModal();
    render();
  }

  /* ----- copiar hojas ----- */

  function viewCopy() {
    const g = S.guide;
    if (!g) return viewHome();
    const ids = L.pageIds(g);
    S.sel = S.sel.filter((id) => ids.indexOf(id) >= 0);
    const counts = L.planCounts(g);
    const thumbs = ids.map((id) => {
      const on = S.sel.indexOf(id) >= 0;
      return '<button type="button" class="thumb' + (on ? ' sel' : '') + '" data-act="toggleSel" data-id="' + id + '" aria-pressed="' + on + '" aria-label="' + L.pageTitle(g, id) + (on ? ', elegida' : '') + '">' +
        '<div class="pg">' + L.pageSVG(g, id, S.marks, { lines: g.lines }) + '<span class="ck">' + ICON.check + '</span></div>' +
        '<span class="nm">' + L.pageTitle(g, id) + '</span></button>';
    }).join('');
    const add = S.sel.length * S.times;
    const total = g.plan.length;
    const summary = S.sel.length
      ? 'Se agregan ' + add + (add === 1 ? ' hoja' : ' hojas') + '. El PDF queda con ' + (total + add) + ' hojas.'
      : 'Elegí las hojas que querés repetir. Ahora el PDF tiene ' + total + (total === 1 ? ' hoja.' : ' hojas.');
    const copied = ids.some((id) => counts[id] > 1);
    return '<main class="screen">' +
      '<div class="hdr"><button type="button" class="iconbtn" data-act="back" aria-label="Volver">' + ICON.back + '</button>' +
      '<div class="ttl"><h1>Copiar hojas</h1><span class="sub">' + L.countMarks(g) + ' de ' + g.target + ' marcas</span></div></div>' +
      '<div style="font-size:17px;font-weight:500">Elegí las hojas que querés repetir</div>' +
      '<div class="thumbs">' + thumbs + '</div>' +
      '<div class="card"><span class="small" style="font-size:16px">Repetir las hojas elegidas</span>' +
      '<div class="counter"><button type="button" class="rb" data-act="timesMinus" aria-label="Menos">' + ICON.minus + '</button>' +
      '<div class="num"><b id="timesnum">' + S.times + '</b><span>' + (S.times === 1 ? 'vez' : 'veces') + '</span></div>' +
      '<button type="button" class="rb" data-act="timesPlus" aria-label="Más">' + ICON.plus + '</button></div>' +
      '<div style="text-align:center;font-size:16px" id="copysum">' + summary + '</div></div>' +
      '<div class="spacer"></div>' +
      '<button type="button" class="btn primary" data-act="doCopy"' + (S.sel.length ? '' : ' disabled') + '>Copiar hojas</button>' +
      '<div class="row"><button type="button" class="btn" data-act="goExport">' + ICON.pdf + 'Ir a exportar</button>' +
      (copied ? '<button type="button" class="btn" data-act="resetCopies">Deshacer copias</button>' : '') + '</div>' +
      '</main>';
  }

  async function doCopy() {
    const g = S.guide;
    if (!S.sel.length) return;
    g.plan = L.copyPages(g, S.sel, S.times);
    await saveGuide();
    const n = g.plan.length;
    S.sel = [];
    render();
    toast('Listo: el PDF tiene ' + n + ' hojas');
  }

  /* ----- exportar ----- */

  function viewExport() {
    const g = S.guide;
    if (!g) return viewHome();
    const ids = L.pageIds(g);
    const counts = L.planCounts(g);
    const rows = ids.map((id) => '<div class="li"><span>' + L.pageTitle(g, id) + '</span><span>' + (counts[id] || 0) + (counts[id] === 1 ? ' hoja' : ' hojas') + '</span></div>').join('');
    const thumbs = ids.map((id) => '<div class="thumb"><div class="pg">' + L.pageSVG(g, id, S.marks, { lines: g.lines }) + '</div><span class="nm">' + L.pageTitle(g, id) + '</span></div>').join('');
    const native = isNative();
    const pdf = S.pdf
      ? '<div class="pdfok"><b>PDF listo: ' + S.pdf.pages + ' hojas</b>' +
        '<button type="button" class="btn primary" data-act="sharePDF">' + (native ? 'Guardar o compartir' : 'Guardar o compartir') + '</button>' +
        (native ? '' : '<div class="row"><button type="button" class="btn" data-act="downloadPDF">Descargar</button><button type="button" class="btn" data-act="openPDF">Ver</button></div>') +
        '</div>'
      : '';
    return '<main class="screen">' +
      '<div class="hdr"><button type="button" class="iconbtn" data-act="back" aria-label="Volver">' + ICON.back + '</button>' +
      '<div class="ttl"><h1>Generar PDF</h1></div></div>' +
      '<div><div class="big-sum">' + g.plan.length + ' hojas, ' + L.countMarks(g) + ' marcas</div><div class="small">Tamaño oficio, como el modelo</div></div>' +
      '<div class="list">' + rows + '</div>' +
      '<div class="thumbs" id="expthumbs">' + thumbs + '</div>' +
      '<div style="display:flex;flex-direction:column;gap:8px"><span style="font-size:16px;font-weight:600">Líneas de los cuadritos</span>' +
      '<div class="seg"><button type="button" data-act="linesOn" aria-pressed="' + (g.lines ? 'true' : 'false') + '">Con líneas</button>' +
      '<button type="button" data-act="linesOff" aria-pressed="' + (g.lines ? 'false' : 'true') + '">Solo marcas</button></div></div>' +
      '<div class="card" style="gap:6px;padding:14px 16px">' +
      '<div class="top"><label for="pen" style="font-size:16px;font-weight:600">Grosor del trazo</label><span class="small">igual en todas</span></div>' +
      '<input id="pen" class="range" data-act="pen" type="range" min="1" max="10" step="1" value="' + g.penLevel + '">' +
      '<div class="rangelbl"><span>Fino</span><span>Grueso</span></div></div>' +
      pdf +
      '<div class="spacer"></div>' +
      '<button type="button" class="btn primary" data-act="genPDF">' + (S.pdf ? 'Generar de nuevo' : 'Generar PDF') + '</button>' +
      '</main>';
  }

  async function genPDF() {
    const g = S.guide;
    busy('Generando el PDF…');
    await nextPaint();
    try {
      await ensureMarks(g);
      const bytes = await PDFExport.buildPDF(g, S.marks, { lines: g.lines });
      const blob = new Blob([bytes], { type: 'application/pdf' });
      if (S.pdf && S.pdf.url) URL.revokeObjectURL(S.pdf.url);
      const d = new Date();
      const stamp = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      const safe = (g.name || 'guia').replace(/[^\w\-]+/g, '_').replace(/^_+|_+$/g, '') || 'guia';
      S.pdf = { blob, url: URL.createObjectURL(blob), name: 'marcas_' + safe + '_' + stamp + '.pdf', pages: g.plan.length };
    } catch (e) {
      unbusy();
      toast('No se pudo generar el PDF: ' + (e && e.message ? e.message : e));
      return;
    }
    unbusy();
    render();
    window.scrollTo(0, document.body.scrollHeight);
  }

  async function sharePDF() {
    const p = S.pdf;
    if (!p) return;
    try {
      const cap = window.Capacitor;
      if (isNative() && cap.Plugins && cap.Plugins.Filesystem && cap.Plugins.Share) {
        const data = await blobToBase64(p.blob);
        const w = await cap.Plugins.Filesystem.writeFile({ path: p.name, data, directory: 'CACHE' });
        await cap.Plugins.Share.share({ title: p.name, url: w.uri, dialogTitle: 'Guardar o compartir el PDF' });
        return;
      }
      const file = new File([p.blob], p.name, { type: 'application/pdf' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: p.name }); return; }
        catch (e) { if (e && e.name === 'AbortError') return; }
      }
      downloadPDF();
    } catch (e) {
      if (e && /cancel/i.test(String(e.message))) return;
      toast('No se pudo compartir: ' + (e && e.message ? e.message : e));
    }
  }

  function downloadPDF() {
    const p = S.pdf; if (!p) return;
    const a = document.createElement('a');
    a.href = p.url; a.download = p.name;
    document.body.appendChild(a); a.click(); a.remove();
  }

  function openPDF() { const p = S.pdf; if (p) window.open(p.url, '_blank'); }

  /* ---------- eventos ---------- */

  let penTimer = null;
  function onPen(level) {
    const g = S.guide;
    g.penLevel = level;
    clearTimeout(penTimer);
    penTimer = setTimeout(saveGuide, 400);
    if (S.screen === 'review') {
      const r = S.rev && S.rev.result;
      const box = $('#resbox');
      if (box && r && !r.error) box.innerHTML = previewSVG(r, level);
    } else if (S.screen === 'export') {
      const t = $('#expthumbs');
      if (t) t.innerHTML = L.pageIds(g).map((id) => '<div class="thumb"><div class="pg">' + L.pageSVG(g, id, S.marks, { lines: g.lines }) + '</div><span class="nm">' + L.pageTitle(g, id) + '</span></div>').join('');
      if (S.pdf) { S.pdf = null; const ok = $('.pdfok'); if (ok) ok.remove(); }
    }
  }

  const actions = {
    back() { if (isNative()) back(); else history.back(); },
    modalBack(el, e) { if (e.target === el) closeModal(); },
    modalClose() { closeModal(); },
    newGuide() {
      const d = new Date();
      const def = 'Guía ' + String(d.getDate()).padStart(2, '0') + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + d.getFullYear();
      modal('<h2>Nueva guía</h2>' +
        '<div class="field"><label for="gname">Nombre</label><input id="gname" type="text" value="' + def + '" maxlength="60"></div>' +
        '<div class="field"><label for="gcount">Cantidad de marcas</label><input id="gcount" type="number" inputmode="numeric" min="1" max="2000" value="62"></div>' +
        '<button type="button" class="btn primary" data-act="createGuide">Crear y empezar</button>' +
        '<button type="button" class="btn flat" data-act="modalClose">Cancelar</button>');
    },
    async createGuide() {
      const name = ($('#gname').value || '').trim() || 'Guía';
      const n = parseInt($('#gcount').value, 10);
      if (!(n >= 1 && n <= 2000)) { toast('Poné una cantidad entre 1 y 2000'); return; }
      const g = L.newGuide(name, n);
      await DB.putGuide(g);
      await refreshGuides();
      S.guide = S.guides.find((x) => x.id === g.id);
      S.marks = {};
      S.tab = 'F'; S.sel = []; S.pdf = null;
      closeModal();
      DB.persist();
      S.cam = { slot: L.nextEmpty(S.guide) };
      go('camera');
    },
    async continueGuide(el) {
      await openGuide(el.dataset.id);
      const next = L.nextEmpty(S.guide);
      if (!next) { go('doc'); return; }
      S.cam = { slot: next };
      go('camera');
    },
    async openDoc(el) { await openGuide(el.dataset.id); go('doc'); },
    delGuide(el) {
      const g = S.guides.find((x) => x.id === el.dataset.id);
      if (!g) return;
      modal('<h2>Eliminar guía</h2><p>Se borra «' + esc(g.name) + '» con sus ' + L.countMarks(g) + ' marcas. No se puede deshacer.</p>' +
        '<button type="button" class="btn danger" data-act="confirmDelGuide" data-id="' + g.id + '">Eliminar</button>' +
        '<button type="button" class="btn flat" data-act="modalClose">Cancelar</button>');
    },
    async confirmDelGuide(el) {
      const g = S.guides.find((x) => x.id === el.dataset.id);
      closeModal();
      if (!g) return;
      busy('Eliminando…');
      for (const id of L.allMarkIds(g)) await DB.deleteMark(id);
      await DB.deleteGuide(g.id);
      if (S.guide && S.guide.id === g.id) { S.guide = null; S.marks = {}; }
      await refreshGuides();
      unbusy();
      render();
    },
    torch() { toggleTorch(); },
    shoot() { shoot(); },
    shootNext() {
      const next = L.nextEmpty(S.guide);
      if (!next) { toast('No quedan cuadros libres. Agregá una hoja.'); return; }
      S.cam = { slot: next };
      go('camera');
    },
    pen(el) { onPen(parseInt(el.value, 10)); },
    dots() {
      S.rev.keepDots = !S.rev.keepDots;
      reprocess();
    },
    accept() { acceptReview(); },
    retake() {
      if (S.rev && S.rev.editOnly) { S.cam = { slot: S.rev.slot }; S.rev = null; go('camera'); return; }
      S.rev = null; go('camera');
    },
    crop() { openCrop(false); },
    tab(el) { S.tab = el.dataset.id; render(); },
    lines() { S.guide.lines = !S.guide.lines; saveGuide(); render(); },
    linesOn() { S.guide.lines = true; saveGuide(); S.pdf = null; render(); },
    linesOff() { S.guide.lines = false; saveGuide(); S.pdf = null; render(); },
    editTarget() { editTargetModal(); },
    async saveTarget() {
      const n = parseInt($('#tg').value, 10);
      if (!(n >= 1 && n <= 2000)) { toast('Poné una cantidad entre 1 y 2000'); return; }
      const g = S.guide;
      g.target = n;
      while (L.capacity(g) < n) await addSheet(true);
      await saveGuide();
      closeModal();
      render();
    },
    addSheet() { addSheet(false); },
    delSheet() { removeSheet(); },
    confirmDelSheet() { confirmDelSheet(); },
    goCopy() { S.pdf = null; go('copy'); },
    goExport() { go('export'); },
    cellReview(el) { closeModal(); reviewExisting(parseInt(el.dataset.i, 10)); },
    cellRetake(el) {
      closeModal();
      S.cam = { slot: { page: S.tab, idx: parseInt(el.dataset.i, 10) } };
      go('camera');
    },
    cellRemove(el) { removeMark(parseInt(el.dataset.i, 10)); },
    toggleSel(el) {
      const id = el.dataset.id;
      const i = S.sel.indexOf(id);
      if (i >= 0) S.sel.splice(i, 1); else S.sel.push(id);
      render();
    },
    timesMinus() { if (S.times > 1) { S.times--; render(); } },
    timesPlus() { if (S.times < 50) { S.times++; render(); } },
    doCopy() { doCopy(); },
    async resetCopies() { S.guide.plan = L.pageIds(S.guide); await saveGuide(); S.pdf = null; render(); toast('Copias deshechas'); },
    genPDF() { genPDF(); },
    sharePDF() { sharePDF(); },
    downloadPDF() { downloadPDF(); },
    openPDF() { openPDF(); }
  };

  document.addEventListener('click', (e) => {
    const cell = e.target.closest && e.target.closest('[data-cell]');
    if (cell && S.screen === 'doc') { cellMenu(parseInt(cell.dataset.cell, 10)); return; }
    const el = e.target.closest && e.target.closest('[data-act]');
    if (!el) return;
    const fn = actions[el.dataset.act];
    if (fn && el.dataset.act !== 'pen') fn(el, e);
  });

  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el && el.dataset && el.dataset.act === 'pen') actions.pen(el);
  });

  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el && el.type === 'file' && (el.id === 'filein' || el.id === 'filecam')) {
      const f = el.files && el.files[0];
      el.value = '';
      fromFile(f);
    }
  });

  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target && e.target.tagName === 'LABEL' && e.target.htmlFor) {
      e.preventDefault();
      const inp = document.getElementById(e.target.htmlFor);
      if (inp) inp.click();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (S.screen !== 'camera') return;
    if (document.hidden) stopCamera();
    else startCamera();
  });

  /* ---------- inicio ---------- */

  async function init() {
    try {
      await refreshGuides();
    } catch (e) {
      toast('No se pudo abrir el almacenamiento del teléfono');
    }
    render();
    const cap = window.Capacitor;
    if (isNative() && cap.Plugins && cap.Plugins.App && cap.Plugins.App.addListener) {
      cap.Plugins.App.addListener('backButton', () => {
        const handled = back();
        if (!handled && cap.Plugins.App.exitApp) cap.Plugins.App.exitApp();
      });
    }
    if ('serviceWorker' in navigator && !isNative() && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  window.__app = { S, L, actions, render, go };
  init();
})();
