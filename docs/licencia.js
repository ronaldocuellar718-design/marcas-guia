/* licencia.js · Cuentas y licencias (Etapa 1)
 * Lo usan Marcas para guía, Estampado Pro y el panel del administrador.
 * Qué hace: inicio de sesión con usuario y contraseña, cambio de contraseña temporal,
 * consulta de la licencia al servidor, avisos de vencimiento, bloqueo y exportación de datos.
 * Los datos de trabajo NO se envían al servidor: solo cuenta, licencia y ajustes.
 * Límite honesto: todo esto corre en el equipo del cliente. Frena el uso casual,
 * pero una persona con conocimientos técnicos podría saltárselo. */
(function (global) {
  'use strict';

  const CFG = Object.assign({
    supabaseUrl: '', anonKey: '', sistema: 'app', appNombre: 'Sistema',
    dominioInterno: 'cuentas.interno', minClave: 8, basesExportar: []
  }, global.LICENCIA_CONFIG || {});

  const DIA = 86400000;
  const K = {
    sesion: 'lic:' + CFG.sistema + ':sesion',
    cache: 'lic:' + CFG.sistema + ':cache',
    visto: 'lic:' + CFG.sistema + ':visto',
    delta: 'lic:' + CFG.sistema + ':delta'
  };

  /* ---------- utilidades ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function leer(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function guardar(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* nada */ } }
  function borrar(k) { try { localStorage.removeItem(k); } catch (e) { /* nada */ } }
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function num(v, def) { const n = Number(v); return Number.isFinite(n) && v !== null && v !== '' && v !== undefined ? n : def; }
  function fechaLocal(ms) { const d = new Date(ms); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
  function diasEntre(a, b) {
    const pa = a.split('-').map(Number), pb = b.split('-').map(Number);
    return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / DIA);
  }
  function fmtFecha(s) { if (!s) return ''; const p = String(s).slice(0, 10).split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
  function plural(n, uno, varios) { return n + ' ' + (n === 1 ? uno : varios); }
  function emailDe(usuario) { return String(usuario).trim().toLowerCase() + '@' + CFG.dominioInterno; }
  function delta() { return num(leer(K.delta), 0); }
  function ahora() { return Date.now() + delta(); }

  /* ---------- acceso al servidor ---------- */
  async function http(metodo, ruta, op) {
    op = op || {};
    const h = { apikey: CFG.anonKey, 'Content-Type': 'application/json' };
    if (op.token) h.Authorization = 'Bearer ' + op.token;
    if (op.cabeceras) Object.assign(h, op.cabeceras);
    let r;
    try {
      r = await fetch(CFG.supabaseUrl + ruta, {
        method: metodo, headers: h,
        body: op.cuerpo !== undefined ? JSON.stringify(op.cuerpo) : undefined
      });
    } catch (e) {
      const err = new Error('sin-conexion'); err.sinConexion = true; throw err;
    }
    const txt = await r.text();
    let datos = null;
    try { datos = txt ? JSON.parse(txt) : null; } catch (e) { datos = txt; }
    if (!r.ok) {
      const msg = datos && typeof datos === 'object'
        ? (datos.error_description || datos.msg || datos.message || (typeof datos.error === 'string' ? datos.error : '')) : String(datos || '');
      const err = new Error(msg || ('HTTP ' + r.status));
      err.status = r.status; err.datos = datos; throw err;
    }
    return datos;
  }

  /* ---------- sesión ---------- */
  function guardarSesion(d) {
    const email = (d.user && d.user.email) || '';
    guardar(K.sesion, {
      access_token: d.access_token, refresh_token: d.refresh_token,
      expires_at: d.expires_at || (Math.floor(Date.now() / 1000) + (d.expires_in || 3600)),
      user_id: d.user && d.user.id, usuario: email.split('@')[0]
    });
  }
  function sesion() { return leer(K.sesion); }

  async function tokenActual() {
    const s = sesion();
    if (!s) return null;
    if (s.expires_at - 60 > Math.floor(Date.now() / 1000)) return s.access_token;
    try {
      const d = await http('POST', '/auth/v1/token?grant_type=refresh_token', { cuerpo: { refresh_token: s.refresh_token } });
      guardarSesion(d);
      return d.access_token;
    } catch (e) {
      if (e.sinConexion) throw e;
      if (e.status === 400 || e.status === 401 || e.status === 403) { borrar(K.sesion); return null; }
      throw e;
    }
  }

  let ultimaClave = '';
  async function ingresar(usuario, clave) {
    const u = String(usuario || '').trim().toLowerCase();
    if (!u || !clave) return { error: 'Escribe tu usuario y tu contraseña.' };
    try {
      const d = await http('POST', '/auth/v1/token?grant_type=password', { cuerpo: { email: emailDe(u), password: clave } });
      guardarSesion(d);
      ultimaClave = clave;
      return { ok: true };
    } catch (e) {
      if (e.sinConexion) return { error: 'No hay conexión a internet. La primera vez necesitas internet para ingresar.' };
      const codigo = e.datos && (e.datos.error_code || e.datos.code);
      if (codigo === 'email_address_invalid' || codigo === 'validation_failed') {
        return { error: 'Configuración incompleta del servidor (dominio interno no válido). Avisa al administrador.' };
      }
      if (e.status === 400 || e.status === 401) return { error: 'Usuario o contraseña incorrectos.' };
      return { error: 'No se pudo ingresar (' + e.message + ').' };
    }
  }

  /* ---------- estado de la licencia ---------- */
  function calcularEstado(lic, aj, ahoraMs) {
    const A = aj || {};
    const avisoD = num(A.dias_aviso, 7), graciaD = num(A.dias_gracia, 3), expD = num(A.dias_exportacion, 30);
    const d = diasEntre(fechaLocal(ahoraMs), lic.vence);
    const base = { vence: lic.vence, d: d, avisoD: avisoD, graciaD: graciaD, expD: expD };
    if (lic.bloqueado) return Object.assign(base, { nivel: 'bloqueado', motivo: 'manual', puedeExportar: true, expRestantes: null });
    if (d > avisoD) return Object.assign(base, { nivel: 'ok' });
    if (d >= 0) return Object.assign(base, { nivel: 'aviso', diasParaVencer: d });
    const pasados = -d;
    if (pasados <= graciaD) return Object.assign(base, { nivel: 'gracia', graciaRestantes: graciaD - pasados + 1 });
    const rest = expD - (pasados - graciaD) + 1;
    return Object.assign(base, { nivel: 'bloqueado', motivo: 'vencida', puedeExportar: rest > 0, expRestantes: Math.max(rest, 0) });
  }

  async function traerDatos(token, userId) {
    const lic = await http('GET', '/rest/v1/licencias?select=*&user_id=eq.' + encodeURIComponent(userId), { token: token });
    const aj = await http('GET', '/rest/v1/ajustes?select=*&id=eq.1', { token: token });
    const user = await http('GET', '/auth/v1/user', { token: token });
    let srv = null;
    try { srv = await http('POST', '/rest/v1/rpc/hora_servidor', { token: token, cuerpo: {} }); } catch (e) { srv = null; }
    return {
      licencia: Array.isArray(lic) && lic.length ? lic[0] : null,
      ajustes: Array.isArray(aj) && aj.length ? aj[0] : null,
      debeCambiar: !!(user && user.user_metadata && user.user_metadata.debe_cambiar),
      srv: typeof srv === 'string' ? Date.parse(srv) : NaN
    };
  }

  /* devuelve { fase, ... } con fase: sin-sesion | cambiar-clave | sin-licencia | sin-sistema | sin-conexion | listo */
  async function verificar() {
    const s = sesion();
    if (!s) return { fase: 'sin-sesion' };
    let datos = null, enLinea = true;
    try {
      const token = await tokenActual();
      if (!token) return { fase: 'sin-sesion' };
      datos = await traerDatos(token, s.user_id);
    } catch (e) {
      if (e.sinConexion || (e.status && e.status >= 500)) enLinea = false;
      else if (e.status === 401 || e.status === 403) { borrar(K.sesion); return { fase: 'sin-sesion' }; }
      else throw e;
    }
    if (enLinea) {
      if (Number.isFinite(datos.srv)) guardar(K.delta, datos.srv - Date.now());
      if (datos.debeCambiar) return { fase: 'cambiar-clave', usuario: s.usuario };
      if (!datos.licencia) { borrar(K.cache); return { fase: 'sin-licencia', usuario: s.usuario, ajustes: datos.ajustes }; }
      guardar(K.cache, { userId: s.user_id, licencia: datos.licencia, ajustes: datos.ajustes, verificadoEn: Date.now() });
    } else {
      const c = leer(K.cache);
      const dOff = num(c && c.ajustes && c.ajustes.dias_offline, 7);
      const visto = num(leer(K.visto), 0);
      const relojAtrasado = ahora() < visto - 10 * 60000;
      if (!c || c.userId !== s.user_id || (Date.now() - c.verificadoEn) > dOff * DIA || relojAtrasado) {
        return { fase: 'sin-conexion', usuario: s.usuario, dias: dOff, relojAtrasado: relojAtrasado, ajustes: c && c.ajustes };
      }
      datos = { licencia: c.licencia, ajustes: c.ajustes };
    }
    const ms = ahora();
    guardar(K.visto, Math.max(num(leer(K.visto), 0), ms));
    const lic = datos.licencia;
    if (!Array.isArray(lic.sistemas) || lic.sistemas.indexOf(CFG.sistema) === -1) {
      return { fase: 'sin-sistema', usuario: s.usuario, ajustes: datos.ajustes, enLinea: enLinea };
    }
    return { fase: 'listo', usuario: s.usuario, licencia: lic, ajustes: datos.ajustes, enLinea: enLinea, estado: calcularEstado(lic, datos.ajustes, ms) };
  }

  /* ---------- cambio de contraseña ---------- */
  async function cambiarClave(temporal, nueva, repetida) {
    const s = sesion();
    if (!s) return { error: 'Tu sesión terminó. Vuelve a ingresar.' };
    if (!temporal) return { error: 'Escribe la contraseña temporal.' };
    if (!nueva || nueva.length < CFG.minClave) return { error: 'La contraseña nueva debe tener al menos ' + CFG.minClave + ' caracteres.' };
    if (nueva !== repetida) return { error: 'Las dos contraseñas nuevas no coinciden.' };
    if (nueva === temporal) return { error: 'La contraseña nueva debe ser distinta de la temporal.' };
    const comprobar = await ingresar(s.usuario, temporal);
    if (!comprobar.ok) return { error: comprobar.error === 'Usuario o contraseña incorrectos.' ? 'La contraseña temporal no es correcta.' : comprobar.error };
    try {
      const token = await tokenActual();
      await http('PUT', '/auth/v1/user', { token: token, cuerpo: { password: nueva, data: { debe_cambiar: false } } });
      ultimaClave = '';
      return { ok: true };
    } catch (e) {
      if (e.sinConexion) return { error: 'No hay conexión a internet.' };
      return { error: 'No se pudo guardar la contraseña (' + e.message + ').' };
    }
  }

  /* ---------- exportación de datos ---------- */
  function aBase64(blob) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => { const t = String(fr.result); res(t.slice(t.indexOf(',') + 1)); };
      fr.onerror = () => rej(fr.error);
      fr.readAsDataURL(blob);
    });
  }
  async function serializar(v) {
    if (v === null || v === undefined) return null;
    if (typeof v !== 'object') return v;
    const tag = Object.prototype.toString.call(v);
    if (tag === '[object Blob]' || tag === '[object File]') return { __tipo: 'blob', mime: v.type, datos: await aBase64(v) };
    if (tag === '[object ArrayBuffer]') return { __tipo: 'bytes', datos: await aBase64(new Blob([v])) };
    if (ArrayBuffer.isView(v)) {
      return { __tipo: 'bytes', clase: v.constructor.name, datos: await aBase64(new Blob([v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength)])) };
    }
    if (tag === '[object Date]') return { __tipo: 'fecha', iso: v.toISOString() };
    if (Array.isArray(v)) { const o = []; for (const x of v) o.push(await serializar(x)); return o; }
    const o = {};
    for (const k of Object.keys(v)) o[k] = await serializar(v[k]);
    return o;
  }
  function abrirBase(nombre) {
    return new Promise((res) => {
      let r;
      try { r = indexedDB.open(nombre); } catch (e) { res(null); return; }
      r.onupgradeneeded = () => { try { r.transaction.abort(); } catch (e) { /* nada */ } };
      r.onsuccess = () => res(r.result);
      r.onerror = () => res(null);
      r.onblocked = () => res(null);
    });
  }
  function leerTienda(db, tienda) {
    return new Promise((res, rej) => {
      const t = db.transaction(tienda, 'readonly');
      const s = t.objectStore(tienda);
      const rk = s.getAllKeys(), rv = s.getAll();
      t.oncomplete = () => res({ claves: rk.result, valores: rv.result });
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    });
  }
  async function exportarDatos() {
    const s = sesion();
    const usuario = (s && s.usuario) || 'usuario';
    const partes = ['{"formato":"datos-exportados","version":1,"sistema":' + JSON.stringify(CFG.sistema) +
      ',"usuario":' + JSON.stringify(usuario) + ',"exportadoEn":' + JSON.stringify(new Date().toISOString()) + ',"bases":['];
    let primeraBase = true, registros = 0;
    for (const nombre of (CFG.basesExportar || [])) {
      const db = await abrirBase(nombre);
      if (!db) continue;
      partes.push((primeraBase ? '' : ',') + '{"nombre":' + JSON.stringify(nombre) + ',"tiendas":[');
      primeraBase = false;
      const tiendas = Array.from(db.objectStoreNames);
      for (let i = 0; i < tiendas.length; i++) {
        const t = await leerTienda(db, tiendas[i]);
        partes.push((i ? ',' : '') + '{"nombre":' + JSON.stringify(tiendas[i]) + ',"registros":[');
        for (let j = 0; j < t.valores.length; j++) {
          partes.push((j ? ',' : '') + JSON.stringify({ clave: await serializar(t.claves[j]), valor: await serializar(t.valores[j]) }));
          registros++;
        }
        partes.push(']}');
      }
      partes.push(']}');
      db.close();
    }
    partes.push(']}');
    const blob = new Blob(partes, { type: 'application/json' });
    const nombreArchivo = 'datos-' + CFG.sistema + '-' + usuario + '-' + fechaLocal(Date.now()) + '.json';
    descargar(blob, nombreArchivo);
    return { archivo: nombreArchivo, registros: registros, bytes: blob.size };
  }
  function descargar(blob, nombre) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nombre; a.style.display = 'none';
    document.body.appendChild(a); a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 4000);
  }

  /* ---------- pantallas ---------- */
  const CSS = '.lic-ov{position:fixed;inset:0;z-index:2147483000;background:#F5F3EE;color:#1B2236;font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif;font-size:15px;line-height:1.45;overflow:auto;-webkit-overflow-scrolling:touch}' +
    '.lic-ov *{box-sizing:border-box}' +
    '.lic-box{max-width:440px;margin:0 auto;padding:calc(28px + env(safe-area-inset-top,0px)) 24px calc(28px + env(safe-area-inset-bottom,0px));display:flex;flex-direction:column;gap:18px;min-height:100%}' +
    '.lic-app{font-size:18px;font-weight:700;color:#1F2A44}.lic-h1{margin:0;font-size:24px;font-weight:700;color:#1F2A44}.lic-sub{margin:0;color:#4A5163}' +
    '.lic-card{background:#fff;border:1px solid #DAD5C9;border-radius:10px;padding:20px;display:flex;flex-direction:column;gap:16px}' +
    '.lic-f{display:flex;flex-direction:column;gap:4px}.lic-f label,.lic-f .lic-et{font-size:14px;font-weight:600}' +
    '.lic-f input{min-height:48px;padding:0 12px;border:1px solid #8F897B;border-radius:8px;font-size:16px;background:#fff;color:#1B2236;font-family:inherit}' +
    '.lic-fijo{min-height:48px;padding:0 12px;border:1px solid #DAD5C9;border-radius:8px;background:#F5F3EE;display:flex;align-items:center;font-weight:600}' +
    '.lic-ayuda,.lic-nota{font-size:13px;color:#4A5163;margin:0}' +
    '.lic-btn{min-height:48px;padding:0 20px;border-radius:8px;font-size:15px;font-weight:600;font-family:inherit;cursor:pointer;border:1px solid #1F2A44}' +
    '.lic-btn.p{background:#1F2A44;color:#fff}.lic-btn.s{background:#fff;color:#1F2A44}.lic-btn:disabled{opacity:.5;cursor:default}' +
    '.lic-link{background:none;border:0;color:#1F2A44;text-decoration:underline;font-size:14px;cursor:pointer;min-height:44px;font-family:inherit}' +
    '.lic-err{background:#F8E1E1;color:#8E2727;border-radius:8px;padding:10px 12px;font-size:14px}.lic-ok{background:#E3F1E8;color:#1F5A3A;border-radius:8px;padding:10px 12px;font-size:14px}' +
    '.lic-banner{position:sticky;top:0;flex-shrink:0;padding:10px 16px;font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif;font-size:14px;line-height:1.4;display:flex;flex-direction:column;gap:2px}' +
    '.lic-banner.aviso{background:#F8ECD6;color:#5E3C0F}.lic-banner.gracia{background:#F8E1E1;color:#8E2727}.lic-banner small{font-size:13px}';

  let overlay = null, banner = null, opciones = {}, autorizado = false, ocupado = false, ultimoChequeo = 0, iniciado = false, ultimaFase = null;

  function css() {
    if (document.getElementById('lic-css')) return;
    const st = document.createElement('style'); st.id = 'lic-css'; st.textContent = CSS;
    document.head.appendChild(st);
  }
  function mostrar(html, enfocar) {
    css();
    if (!overlay) {
      overlay = document.createElement('div'); overlay.className = 'lic-ov';
      overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true');
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = '<div class="lic-box">' + html + '</div>';
    if (enfocar) { const el = overlay.querySelector(enfocar); if (el) try { el.focus(); } catch (e) { /* nada */ } }
    return overlay;
  }
  function quitarOverlay() { if (overlay) { overlay.remove(); overlay = null; } }
  function quitarBanner() { if (banner) { banner.remove(); banner = null; } }
  function $o(sel) { return overlay ? overlay.querySelector(sel) : null; }
  function encabezado(h1, sub) {
    return '<div><div class="lic-app">' + esc(CFG.appNombre) + '</div><h1 class="lic-h1">' + esc(h1) + '</h1>' + (sub ? '<p class="lic-sub">' + esc(sub) + '</p>' : '') + '</div>';
  }
  function contactoTxt(aj) { return aj && aj.contacto ? String(aj.contacto) : ''; }
  function ligar(sel, fn) { const el = $o(sel); if (el) el.onclick = fn; }

  function pantallaCarga(txt) { mostrar(encabezado('Comprobando licencia…', txt || '') ); }

  function pantallaLogin(msg) {
    mostrar(encabezado('Ingresar') +
      '<form class="lic-card" id="lic-f" novalidate>' +
      '<div class="lic-f"><label for="lic-u">Usuario</label><input id="lic-u" type="text" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false"></div>' +
      '<div class="lic-f"><label for="lic-p">Contraseña</label><input id="lic-p" type="password" autocomplete="current-password"></div>' +
      '<div id="lic-m" role="alert">' + (msg ? '<div class="lic-err">' + esc(msg) + '</div>' : '') + '</div>' +
      '<button class="lic-btn p" id="lic-go" type="submit">Entrar</button></form>' +
      '<p class="lic-nota">Si olvidaste tu contraseña, pídesela al administrador. La primera vez necesitas internet para ingresar.</p>', '#lic-u');
    $o('#lic-f').onsubmit = async (ev) => {
      ev.preventDefault();
      const go = $o('#lic-go'); go.disabled = true; go.textContent = 'Ingresando…';
      const r = await ingresar($o('#lic-u').value, $o('#lic-p').value);
      if (!r.ok) { pantallaLogin(r.error); return; }
      pantallaCarga(); procesar();
    };
  }

  function pantallaCrearClave(msg) {
    const s = sesion() || {};
    mostrar(encabezado('Crea tu contraseña', 'Es tu primer ingreso. Cambia la contraseña temporal por una que solo tú conozcas.') +
      '<form class="lic-card" id="lic-f" novalidate>' +
      '<div class="lic-f"><span class="lic-et">Usuario</span><div class="lic-fijo">' + esc(s.usuario || '') + '</div></div>' +
      '<div class="lic-f"><label for="lic-t">Contraseña temporal</label><input id="lic-t" type="password" autocomplete="current-password" value="' + esc(ultimaClave) + '"></div>' +
      '<div class="lic-f"><label for="lic-n">Contraseña nueva</label><input id="lic-n" type="password" autocomplete="new-password"><span class="lic-ayuda">Mínimo ' + CFG.minClave + ' caracteres.</span></div>' +
      '<div class="lic-f"><label for="lic-r">Repite la contraseña nueva</label><input id="lic-r" type="password" autocomplete="new-password"></div>' +
      '<div id="lic-m" role="alert">' + (msg ? '<div class="lic-err">' + esc(msg) + '</div>' : '') + '</div>' +
      '<button class="lic-btn p" id="lic-go" type="submit">Guardar y entrar</button></form>' +
      '<button class="lic-link" id="lic-salir" type="button">Cerrar sesión</button>', '#lic-n');
    $o('#lic-f').onsubmit = async (ev) => {
      ev.preventDefault();
      const go = $o('#lic-go'); go.disabled = true; go.textContent = 'Guardando…';
      const r = await cambiarClave($o('#lic-t').value, $o('#lic-n').value, $o('#lic-r').value);
      if (!r.ok) { pantallaCrearClave(r.error); return; }
      pantallaCarga(); procesar();
    };
    ligar('#lic-salir', () => cerrarSesion());
  }

  function pieAcciones(extra) {
    return '<button class="lic-btn s" id="lic-re" type="button">Comprobar de nuevo</button>' + (extra || '') +
      '<button class="lic-link" id="lic-salir" type="button">Cerrar sesión</button>';
  }
  function ligarPie() {
    ligar('#lic-re', async () => { const b = $o('#lic-re'); if (b) { b.disabled = true; b.textContent = 'Comprobando…'; } await procesar(); });
    ligar('#lic-salir', () => cerrarSesion());
  }

  function pantallaBloqueo(est, aj, msg) {
    const c = contactoTxt(aj);
    const contacto = c ? 'Para renovar, contacta a ' + c + '.' : 'Para renovar, contacta al administrador.';
    let titulo, cuerpo;
    if (est.motivo === 'manual') { titulo = 'Tu acceso está bloqueado'; cuerpo = 'El administrador bloqueó tu acceso. Puedes exportar tus datos.'; }
    else if (est.puedeExportar) { titulo = 'Tu licencia venció'; cuerpo = 'El uso del sistema está bloqueado. Tienes ' + plural(est.expRestantes, 'día', 'días') + ' para exportar tus datos.'; }
    else { titulo = 'Tu licencia venció'; cuerpo = 'El uso del sistema está bloqueado y el plazo para exportar tus datos terminó.'; }
    mostrar(encabezado(titulo) +
      '<div class="lic-card"><p style="margin:0">' + esc(cuerpo) + '</p>' +
      '<div id="lic-m" role="alert">' + (msg ? msg : '') + '</div>' +
      (est.puedeExportar ? '<button class="lic-btn p" id="lic-ex" type="button">Exportar mis datos</button>' : '') +
      '<button class="lic-btn s" id="lic-re" type="button">Comprobar de nuevo</button>' +
      '<p class="lic-nota">' + esc(contacto) + '</p></div>' +
      '<button class="lic-link" id="lic-salir" type="button">Cerrar sesión</button>');
    ligarPie();
    ligar('#lic-ex', async () => {
      const b = $o('#lic-ex'); b.disabled = true; b.textContent = 'Preparando archivo…';
      try {
        const r = await exportarDatos();
        pantallaBloqueo(est, aj, '<div class="lic-ok">Listo: se descargó ' + esc(r.archivo) + ' (' + plural(r.registros, 'registro', 'registros') + ').</div>');
      } catch (e) {
        pantallaBloqueo(est, aj, '<div class="lic-err">No se pudo exportar: ' + esc(e.message || e) + '</div>');
      }
    });
  }

  function pantallaAviso(titulo, cuerpo, extra) {
    mostrar(encabezado(titulo, cuerpo) + '<div class="lic-card">' + (extra || '') + pieAcciones() + '</div>');
    ligarPie();
  }

  function aplicarBanner(est, aj) {
    quitarBanner();
    if (est.nivel !== 'aviso' && est.nivel !== 'gracia') return;
    const c = contactoTxt(aj);
    let t, b;
    if (est.nivel === 'aviso') {
      t = est.d === 0 ? 'Tu licencia vence hoy (' + fmtFecha(est.vence) + ')' : 'Tu licencia vence el ' + fmtFecha(est.vence);
      b = est.d === 0 ? 'Hoy es el último día. Para renovarla, contacta al administrador.' :
        (est.d === 1 ? 'Falta 1 día. ' : 'Faltan ' + est.d + ' días. ') + 'Para renovarla, contacta al administrador.';
    } else {
      t = 'Tu licencia venció el ' + fmtFecha(est.vence);
      b = 'Puedes seguir trabajando ' + plural(est.graciaRestantes, 'día', 'días') + ' más. Después el uso se bloquea.';
    }
    css();
    banner = document.createElement('div');
    banner.className = 'lic-banner ' + est.nivel; banner.setAttribute('role', 'status');
    banner.innerHTML = '<strong>' + esc(t) + '</strong><span>' + esc(b) + '</span>' + (c ? '<small>Contacto: ' + esc(c) + '</small>' : '');
    document.body.insertBefore(banner, document.body.firstChild);
  }

  function aplicar(r) {
    const previa = ultimaFase;
    ultimaFase = r.fase;
    quitarBanner();
    /* si ya hay un formulario en pantalla, no lo redibujes (se perdería lo que la persona está escribiendo) */
    if ((r.fase === 'sin-sesion' && !opciones.loginPropio) || r.fase === 'cambiar-clave') {
      if (previa === r.fase && overlay && overlay.querySelector('#lic-f')) return;
    }
    if (r.fase === 'sin-sesion') {
      autorizado = false;
      if (opciones.loginPropio) { quitarOverlay(); if (opciones.mostrarLogin) opciones.mostrarLogin(true); }
      else pantallaLogin();
      return;
    }
    if (opciones.mostrarLogin) opciones.mostrarLogin(false);
    if (r.fase === 'cambiar-clave') { pantallaCrearClave(); return; }
    if (r.fase === 'sin-licencia') {
      pantallaAviso('Tu cuenta no tiene licencia', 'Todavía no hay una licencia asignada a tu usuario. Contacta al administrador.'); return;
    }
    if (r.fase === 'sin-sistema') {
      pantallaAviso('Tu cuenta no incluye este sistema', 'Tu licencia no tiene habilitado ' + CFG.appNombre + '. Contacta al administrador.'); return;
    }
    if (r.fase === 'sin-conexion') {
      pantallaAviso('Necesitas conexión a internet',
        r.relojAtrasado ? 'La fecha de tu equipo parece estar atrasada. Conéctate a internet para validar tu licencia.'
          : 'Hace más de ' + plural(r.dias || 7, 'día', 'días') + ' que no se valida tu licencia, o es la primera vez. Conéctate a internet para continuar.');
      return;
    }
    if (r.fase === 'error') {
      pantallaAviso('No se pudo comprobar la licencia', r.mensaje || 'Ocurrió un problema inesperado. Intenta de nuevo.'); return;
    }
    /* listo */
    if (r.estado.nivel === 'bloqueado') { pantallaBloqueo(r.estado, r.ajustes); return; }
    quitarOverlay();
    aplicarBanner(r.estado, r.ajustes);
    if (!autorizado) {
      autorizado = true;
      if (opciones.onAutorizado) opciones.onAutorizado({ usuario: r.usuario, licencia: r.licencia, estado: r.estado });
    }
  }

  async function procesar() {
    if (ocupado) return;
    ocupado = true;
    try {
      const r = await verificar();
      ultimoChequeo = Date.now();
      aplicar(r);
    } catch (e) {
      console.error(e);
      if (!autorizado) aplicar({ fase: 'error', mensaje: e.message });
    } finally { ocupado = false; }
  }

  async function ingresarYContinuar(usuario, clave) {
    const r = await ingresar(usuario, clave);
    if (!r.ok) return r;
    await procesar();
    return { ok: true };
  }

  async function cerrarSesion() {
    const s = sesion();
    if (s) { try { await http('POST', '/auth/v1/logout', { token: s.access_token }); } catch (e) { /* nada */ } }
    borrar(K.sesion); borrar(K.cache); ultimaClave = '';
    autorizado = false;
    if (iniciado) { quitarBanner(); await procesar(); }
  }

  function iniciar(opts) {
    opciones = opts || {};
    iniciado = true;
    css();
    if (!CFG.supabaseUrl || !CFG.anonKey) {
      mostrar(encabezado('Falta configurar el servidor', 'No se cargaron la dirección ni la clave pública del servidor. Revisa el archivo licencia-config.js.'));
      return;
    }
    pantallaCarga();
    procesar();
    document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - ultimoChequeo > 10 * 60000) procesar(); });
    global.addEventListener('online', () => procesar());
    setInterval(() => procesar(), 30 * 60000);
  }

  global.Licencia = {
    config: CFG, iniciar: iniciar, ingresar: ingresarYContinuar, cerrarSesion: cerrarSesion,
    exportarDatos: exportarDatos, calcularEstado: calcularEstado, procesar: procesar,
    estadoActual: () => ultimaFase,
    core: { http: http, ingresar: ingresar, tokenActual: tokenActual, sesion: sesion, emailDe: emailDe, fmtFecha: fmtFecha,
      diasEntre: diasEntre, fechaLocal: fechaLocal, ahora: ahora, esc: esc, serializar: serializar, borrarSesion: () => { borrar(K.sesion); borrar(K.cache); } }
  };
})(typeof window !== 'undefined' ? window : globalThis);
