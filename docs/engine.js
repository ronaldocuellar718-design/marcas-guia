/* Marcas para guía - motor de imagen
 * Convierte la foto de una marca en trazos vectoriales (línea central) para
 * que luego se dibujen todas con el mismo grosor y el mismo tamaño máximo.
 * Todo corre en el celular, sin internet.
 */
(function (global) {
  'use strict';

  const WORK = 900; // lado mayor (px) al que se lleva la marca para sacar el esqueleto

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  /* ---------- utilidades de imagen ---------- */

  function grayFromCanvas(canvas) {
    const w = canvas.width, h = canvas.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const d = ctx.getImageData(0, 0, w, h).data;
    const g = new Float32Array(w * h);
    for (let i = 0, j = 0; i < g.length; i++, j += 4) {
      g[i] = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2];
    }
    return { g, w, h };
  }

  function boxBlurH(src, dst, w, h, r) {
    const k = 2 * r + 1;
    for (let y = 0; y < h; y++) {
      const row = y * w;
      let sum = 0;
      for (let x = -r; x <= r; x++) sum += src[row + clamp(x, 0, w - 1)];
      for (let x = 0; x < w; x++) {
        dst[row + x] = sum / k;
        sum += src[row + clamp(x + r + 1, 0, w - 1)] - src[row + clamp(x - r, 0, w - 1)];
      }
    }
  }

  function boxBlurV(src, dst, w, h, r) {
    const k = 2 * r + 1;
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let y = -r; y <= r; y++) sum += src[clamp(y, 0, h - 1) * w + x];
      for (let y = 0; y < h; y++) {
        dst[y * w + x] = sum / k;
        sum += src[clamp(y + r + 1, 0, h - 1) * w + x] - src[clamp(y - r, 0, h - 1) * w + x];
      }
    }
  }

  function blur(src, w, h, r, passes) {
    r = Math.round(r);
    if (r < 1) return Float32Array.from(src);
    let a = Float32Array.from(src);
    const b = new Float32Array(src.length);
    for (let p = 0; p < (passes || 3); p++) {
      boxBlurH(a, b, w, h, r);
      boxBlurV(b, a, w, h, r);
    }
    return a;
  }

  function maxFilter(src, w, h, r) {
    const tmp = new Float32Array(src.length);
    const out = new Float32Array(src.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let m = 0;
        const x0 = Math.max(0, x - r), x1 = Math.min(w - 1, x + r);
        for (let xx = x0; xx <= x1; xx++) { const v = src[y * w + xx]; if (v > m) m = v; }
        tmp[y * w + x] = m;
      }
    }
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        let m = 0;
        const y0 = Math.max(0, y - r), y1 = Math.min(h - 1, y + r);
        for (let yy = y0; yy <= y1; yy++) { const v = tmp[yy * w + x]; if (v > m) m = v; }
        out[y * w + x] = m;
      }
    }
    return out;
  }

  function downscaleAvg(src, w, h, nw, nh) {
    const out = new Float32Array(nw * nh);
    for (let y = 0; y < nh; y++) {
      const y0 = Math.floor(y * h / nh), y1 = Math.max(y0 + 1, Math.floor((y + 1) * h / nh));
      for (let x = 0; x < nw; x++) {
        const x0 = Math.floor(x * w / nw), x1 = Math.max(x0 + 1, Math.floor((x + 1) * w / nw));
        let s = 0, c = 0;
        for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { s += src[yy * w + xx]; c++; }
        out[y * nw + x] = s / c;
      }
    }
    return out;
  }

  function resizeBilinear(src, w, h, nw, nh) {
    const out = new Float32Array(nw * nh);
    const sx = w / nw, sy = h / nh;
    for (let y = 0; y < nh; y++) {
      const fy = clamp((y + 0.5) * sy - 0.5, 0, h - 1);
      const y0 = Math.floor(fy), y1 = Math.min(h - 1, y0 + 1), wy = fy - y0;
      for (let x = 0; x < nw; x++) {
        const fx = clamp((x + 0.5) * sx - 0.5, 0, w - 1);
        const x0 = Math.floor(fx), x1 = Math.min(w - 1, x0 + 1), wx = fx - x0;
        const a = src[y0 * w + x0], b = src[y0 * w + x1], c = src[y1 * w + x0], d = src[y1 * w + x1];
        out[y * nw + x] = (a * (1 - wx) + b * wx) * (1 - wy) + (c * (1 - wx) + d * wx) * wy;
      }
    }
    return out;
  }

  function estimateBackground(g, w, h) {
    const m = Math.max(w, h);
    const f = Math.max(1, Math.floor(m / 160));
    const sw = Math.max(8, Math.round(w / f)), sh = Math.max(8, Math.round(h / f));
    const small = downscaleAvg(g, w, h, sw, sh);
    const r = Math.max(3, Math.round(Math.max(sw, sh) * 0.09));
    const dil = maxFilter(small, sw, sh, r);
    const bgs = blur(dil, sw, sh, Math.max(2, Math.round(r * 0.6)), 2);
    return resizeBilinear(bgs, sw, sh, w, h);
  }

  function otsu(values, n) {
    const hist = new Float64Array(256);
    for (let i = 0; i < n; i++) hist[clamp(Math.round(values[i]), 0, 255)]++;
    let total = n, sum = 0;
    for (let t = 0; t < 256; t++) sum += t * hist[t];
    let sumB = 0, wB = 0, best = 0, thr = 128;
    for (let t = 0; t < 256; t++) {
      wB += hist[t];
      if (!wB) continue;
      const wF = total - wB;
      if (!wF) break;
      sumB += t * hist[t];
      const mB = sumB / wB, mF = (sum - sumB) / wF;
      const between = wB * wF * (mB - mF) * (mB - mF);
      if (between > best) { best = between; thr = t; }
    }
    return thr;
  }

  /* ---------- componentes conectados ---------- */

  function labelComponents(mask, w, h) {
    const labels = new Int32Array(w * h);
    const stack = new Int32Array(w * h);
    const comps = [];
    let id = 0;
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i] || labels[i]) continue;
      id++;
      let sp = 0, area = 0, minx = w, maxx = 0, miny = h, maxy = 0;
      stack[sp++] = i; labels[i] = id;
      while (sp) {
        const p = stack[--sp];
        area++;
        const x = p % w, y = (p - x) / w;
        if (x < minx) minx = x; if (x > maxx) maxx = x;
        if (y < miny) miny = y; if (y > maxy) maxy = y;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy; if (yy < 0 || yy >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const xx = x + dx; if (xx < 0 || xx >= w) continue;
            const q = yy * w + xx;
            if (mask[q] && !labels[q]) { labels[q] = id; stack[sp++] = q; }
          }
        }
      }
      comps.push({ id, area, minx, maxx, miny, maxy });
    }
    return { labels, comps };
  }

  // rellena huecos pequeños (4-conectividad del fondo) que no tocan el borde
  function fillSmallHoles(mask, w, h, maxArea) {
    const inv = new Uint8Array(w * h);
    for (let i = 0; i < inv.length; i++) inv[i] = mask[i] ? 0 : 1;
    const labels = new Int32Array(w * h);
    const stack = new Int32Array(w * h);
    let id = 0;
    for (let i = 0; i < inv.length; i++) {
      if (!inv[i] || labels[i]) continue;
      id++;
      let sp = 0, area = 0, touches = false;
      const members = [];
      stack[sp++] = i; labels[i] = id;
      while (sp) {
        const p = stack[--sp];
        area++;
        members.push(p);
        const x = p % w, y = (p - x) / w;
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touches = true;
        if (x > 0 && inv[p - 1] && !labels[p - 1]) { labels[p - 1] = id; stack[sp++] = p - 1; }
        if (x < w - 1 && inv[p + 1] && !labels[p + 1]) { labels[p + 1] = id; stack[sp++] = p + 1; }
        if (y > 0 && inv[p - w] && !labels[p - w]) { labels[p - w] = id; stack[sp++] = p - w; }
        if (y < h - 1 && inv[p + w] && !labels[p + w]) { labels[p + w] = id; stack[sp++] = p + w; }
      }
      if (!touches && area <= maxArea) for (const p of members) mask[p] = 1;
    }
  }

  /* ---------- adelgazado (Guo-Hall) ---------- */

  function thin(mask, w, h) {
    const W = w + 2, H = h + 2;
    const img = new Uint8Array(W * H);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) img[(y + 1) * W + x + 1] = mask[y * w + x];
    const del = [];
    let changed = true;
    while (changed) {
      changed = false;
      for (let step = 0; step < 2; step++) {
        del.length = 0;
        for (let y = 1; y < H - 1; y++) {
          for (let x = 1; x < W - 1; x++) {
            const i = y * W + x;
            if (!img[i]) continue;
            const p2 = img[i - W], p3 = img[i - W + 1], p4 = img[i + 1], p5 = img[i + W + 1];
            const p6 = img[i + W], p7 = img[i + W - 1], p8 = img[i - 1], p9 = img[i - W - 1];
            const C = (!p2 && (p3 || p4) ? 1 : 0) + (!p4 && (p5 || p6) ? 1 : 0) +
              (!p6 && (p7 || p8) ? 1 : 0) + (!p8 && (p9 || p2) ? 1 : 0);
            if (C !== 1) continue;
            const N1 = (p9 || p2 ? 1 : 0) + (p3 || p4 ? 1 : 0) + (p5 || p6 ? 1 : 0) + (p7 || p8 ? 1 : 0);
            const N2 = (p2 || p3 ? 1 : 0) + (p4 || p5 ? 1 : 0) + (p6 || p7 ? 1 : 0) + (p8 || p9 ? 1 : 0);
            const N = N1 < N2 ? N1 : N2;
            if (N < 2 || N > 3) continue;
            const m = step === 0 ? ((p2 || p3 || !p5) && p4) : ((p6 || p7 || !p9) && p8);
            if (m) continue;
            del.push(i);
          }
        }
        if (del.length) { changed = true; for (let k = 0; k < del.length; k++) img[del[k]] = 0; }
      }
    }
    return { img, W, H };
  }

  const NB = [-1, 0, 1, 0, 0, 1, 0, -1, -1, -1, 1, -1, 1, 1, -1, 1]; // dx,dy pares (4-vecinos primero)

  function degree(img, W, i) {
    return img[i - W] + img[i - W + 1] + img[i + 1] + img[i + W + 1] + img[i + W] + img[i + W - 1] + img[i - 1] + img[i - W - 1];
  }

  function transitions(img, W, i) {
    const p2 = img[i - W], p3 = img[i - W + 1], p4 = img[i + 1], p5 = img[i + W + 1];
    const p6 = img[i + W], p7 = img[i + W - 1], p8 = img[i - 1], p9 = img[i - W - 1];
    return (!p2 && p3 ? 1 : 0) + (!p3 && p4 ? 1 : 0) + (!p4 && p5 ? 1 : 0) + (!p5 && p6 ? 1 : 0) +
      (!p6 && p7 ? 1 : 0) + (!p7 && p8 ? 1 : 0) + (!p8 && p9 ? 1 : 0) + (!p9 && p2 ? 1 : 0);
  }

  // quita píxeles "diente": dos vecinos pegados entre sí, no aportan conexión
  function cleanTeeth(sk, W, H) {
    for (let pass = 0; pass < 4; pass++) {
      let removed = 0;
      for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
          const i = y * W + x;
          if (!sk[i]) continue;
          const d = degree(sk, W, i);
          if (d >= 2 && transitions(sk, W, i) === 1) { sk[i] = 0; removed++; }
        }
      }
      if (!removed) break;
    }
    return sk;
  }

  /* ---------- poda de espolones ---------- */

  function prune(sk, W, H, N, keepSmall) {
    const orig = Uint8Array.from(sk);
    const cur = Uint8Array.from(sk);
    for (let it = 0; it < N; it++) {
      const del = [];
      for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
          const i = y * W + x;
          if (cur[i] && degree(cur, W, i) <= 1) del.push(i);
        }
      }
      if (!del.length) break;
      for (const i of del) cur[i] = 0;
    }
    // vuelve a crecer los extremos verdaderos
    const ends = [];
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        if (cur[i] && degree(cur, W, i) === 1) ends.push(i);
      }
    }
    for (const e of ends) {
      let p = e, prev = -1;
      for (let step = 0; step < N; step++) {
        let next = -1;
        const px = p % W, py = (p - px) / W;
        for (let k = 0; k < 16; k += 2) {
          const q = (py + NB[k + 1]) * W + (px + NB[k]);
          if (q === prev || !orig[q] || cur[q]) continue;
          next = q; break;
        }
        if (next < 0) break;
        cur[next] = 1; prev = p; p = next;
      }
    }
    // componentes que desaparecieron por completo (marcas diminutas, puntos)
    if (keepSmall) {
      const seen = new Uint8Array(orig.length);
      for (let i = 0; i < orig.length; i++) {
        if (!orig[i] || seen[i]) continue;
        const stack = [i]; seen[i] = 1;
        const members = [];
        let alive = false;
        while (stack.length) {
          const p = stack.pop();
          members.push(p);
          if (cur[p]) alive = true;
          const px = p % W, py = (p - px) / W;
          for (let k = 0; k < 16; k += 2) {
            const q = (py + NB[k + 1]) * W + (px + NB[k]);
            if (orig[q] && !seen[q]) { seen[q] = 1; stack.push(q); }
          }
        }
        if (!alive) for (const p of members) cur[p] = 1;
      }
    }
    return cur;
  }

  /* ---------- trazado del esqueleto en polilíneas ---------- */

  function traceSkeleton(sk, W, H) {
    const kind = new Uint8Array(W * H); // 0 nada, 1 extremo, 2 normal, 3 cruce, 4 punto
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        if (!sk[i]) continue;
        const d = degree(sk, W, i);
        if (d === 0) { kind[i] = 4; continue; }
        const a = transitions(sk, W, i);
        if (d === 1) kind[i] = 1;
        else if (a >= 3) kind[i] = 3;
        else kind[i] = 2;
      }
    }
    const visited = new Uint8Array(W * H);
    const lines = [];
    const px = (i) => [i % W, Math.floor(i / W)];

    function neighborsOf(i) {
      const x = i % W, y = (i - x) / W;
      const out = [];
      for (let k = 0; k < 16; k += 2) {
        const q = (y + NB[k + 1]) * W + (x + NB[k]);
        if (sk[q]) out.push(q);
      }
      return out;
    }

    function walk(start, first) {
      const path = [start, first];
      visited[first] = 1;
      let prev = start, cur = first;
      for (let guard = 0; guard < W * H; guard++) {
        if (kind[cur] === 1 || kind[cur] === 3) break; // llegó a un nodo
        const cand = neighborsOf(cur).filter((q) => q !== prev && !visited[q]);
        // permite cerrar en un nodo ya conocido
        const nodeCand = neighborsOf(cur).filter((q) => q !== prev && (kind[q] === 1 || kind[q] === 3));
        let next = -1;
        if (nodeCand.length) {
          next = nodeCand[0];
          path.push(next);
          break;
        }
        if (!cand.length) break;
        if (cand.length === 1) next = cand[0];
        else {
          // elige el que mejor sigue la dirección y descarta vecinos pegados (esquinas)
          const [cx, cy] = px(cur), [pxx, pyy] = px(prev);
          const dx0 = cx - pxx, dy0 = cy - pyy;
          let bestQ = cand[0], bestS = -Infinity;
          for (const q of cand) {
            const [qx, qy] = px(q);
            const s = (qx - cx) * dx0 + (qy - cy) * dy0;
            if (s > bestS) { bestS = s; bestQ = q; }
          }
          next = bestQ;
          const [nx, ny] = px(next);
          for (const q of cand) {
            if (q === next) continue;
            const [qx, qy] = px(q);
            if (Math.abs(qx - nx) <= 1 && Math.abs(qy - ny) <= 1) visited[q] = 1;
          }
        }
        visited[next] = 1;
        path.push(next);
        prev = cur; cur = next;
      }
      return path;
    }

    const edgeKeys = new Set();
    for (let i = 0; i < kind.length; i++) {
      if (kind[i] !== 1 && kind[i] !== 3) continue;
      for (const n of neighborsOf(i)) {
        if (kind[n] === 1 || kind[n] === 3) {
          const key = i < n ? i + '-' + n : n + '-' + i;
          if (edgeKeys.has(key)) continue;
          edgeKeys.add(key);
          lines.push([i, n].map(px));
          continue;
        }
        if (visited[n]) continue;
        lines.push(walk(i, n).map(px));
      }
    }
    // lazos cerrados y puntos sueltos
    for (let i = 0; i < kind.length; i++) {
      if (!kind[i] || visited[i]) continue;
      if (kind[i] === 4) { visited[i] = 1; lines.push([px(i)]); continue; }
      if (kind[i] !== 2) continue;
      const nbs = neighborsOf(i).filter((q) => !visited[q]);
      if (!nbs.length) { visited[i] = 1; continue; }
      visited[i] = 1;
      const path = walk(i, nbs[0]);
      // si volvió a tocar el inicio, cierra el lazo
      const last = path[path.length - 1];
      const ln = neighborsOf(last);
      if (ln.indexOf(i) >= 0 && path.length > 3) path.push(i);
      lines.push(path.map(px));
    }
    return lines;
  }

  /* ---------- suavizado y simplificación ---------- */

  function smoothPath(pts, win) {
    if (pts.length < 5) return pts;
    const out = pts.map((p) => p.slice());
    const n = pts.length;
    for (let i = 1; i < n - 1; i++) {
      const k = Math.min(win, i, n - 1 - i);
      if (k < 1) continue;
      let sx = 0, sy = 0, c = 0;
      for (let j = i - k; j <= i + k; j++) { sx += pts[j][0]; sy += pts[j][1]; c++; }
      out[i] = [sx / c, sy / c];
    }
    return out;
  }

  function rdp(pts, eps) {
    if (pts.length < 3) return pts;
    const keep = new Uint8Array(pts.length);
    keep[0] = 1; keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
      const [a, b] = stack.pop();
      let maxD = 0, idx = -1;
      const [ax, ay] = pts[a], [bx, by] = pts[b];
      const dx = bx - ax, dy = by - ay;
      const len2 = dx * dx + dy * dy;
      for (let i = a + 1; i < b; i++) {
        let d;
        if (len2 === 0) d = Math.hypot(pts[i][0] - ax, pts[i][1] - ay);
        else {
          let t = ((pts[i][0] - ax) * dx + (pts[i][1] - ay) * dy) / len2;
          t = clamp(t, 0, 1);
          d = Math.hypot(pts[i][0] - (ax + t * dx), pts[i][1] - (ay + t * dy));
        }
        if (d > maxD) { maxD = d; idx = i; }
      }
      if (maxD > eps && idx > 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
    }
    const out = [];
    for (let i = 0; i < pts.length; i++) if (keep[i]) out.push(pts[i]);
    return out;
  }


  /* ---------- esquinas, cruces y colas ---------- */
  // El esqueleto de un trazo grueso se aparta de las esquinas agudas: las redondea y
  // deja una cola hacia la punta. Aquí se reconstruyen con rectas ajustadas a los tramos.

  function arcLen(pts) {
    const a = [0];
    for (let i = 1; i < pts.length; i++) a.push(a[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    return a;
  }

  // punto a una distancia de arco dada, desde el inicio de la lista
  function pointAt(pts, a, d) {
    if (d >= a[a.length - 1]) return pts[pts.length - 1];
    for (let i = 1; i < pts.length; i++) {
      if (a[i] >= d) {
        const t = (d - a[i - 1]) / Math.max(1e-9, a[i] - a[i - 1]);
        return [pts[i - 1][0] + t * (pts[i][0] - pts[i - 1][0]), pts[i - 1][1] + t * (pts[i][1] - pts[i - 1][1])];
      }
    }
    return pts[pts.length - 1];
  }

  function unit(vx, vy) { const m = Math.hypot(vx, vy); return m < 1e-9 ? null : [vx / m, vy / m]; }

  // línea recta (punto + dirección) que ajusta los puntos entre dos distancias de arco
  function fitRange(pts, a, d0, d1) {
    const sel = [];
    for (let i = 0; i < pts.length; i++) if (a[i] >= d0 && a[i] <= d1) sel.push(pts[i]);
    if (sel.length < 3) return null;
    let mx = 0, my = 0;
    for (const p of sel) { mx += p[0]; my += p[1]; }
    mx /= sel.length; my /= sel.length;
    let sxx = 0, sxy = 0, syy = 0;
    for (const p of sel) { const dx = p[0] - mx, dy = p[1] - my; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; }
    const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    let dx = Math.cos(ang), dy = Math.sin(ang);
    let res = 0;
    for (const p of sel) { const e = Math.abs(-(p[0] - mx) * dy + (p[1] - my) * dx); if (e > res) res = e; }
    // orienta la dirección de menor a mayor distancia de arco
    const first = sel[0], last = sel[sel.length - 1];
    if ((last[0] - first[0]) * dx + (last[1] - first[1]) * dy < 0) { dx = -dx; dy = -dy; }
    return { x: mx, y: my, dx, dy, res };
  }

  function lineIntersect(l1, l2) {
    const det = l1.dx * l2.dy - l1.dy * l2.dx;
    if (Math.abs(det) < 0.12) return null; // casi paralelas
    const t = ((l2.x - l1.x) * l2.dy - (l2.y - l1.y) * l2.dx) / det;
    return [l1.x + t * l1.dx, l1.y + t * l1.dy];
  }

  function buildNodes(lines) {
    const ends = [];
    lines.forEach((pts, li) => {
      if (pts.length < 2) return;
      ends.push({ li, side: 0, p: pts[0] });
      ends.push({ li, side: 1, p: pts[pts.length - 1] });
    });
    const par = ends.map((_, i) => i);
    const find = (i) => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
    for (let i = 0; i < ends.length; i++) {
      for (let j = i + 1; j < ends.length; j++) {
        if (Math.hypot(ends[i].p[0] - ends[j].p[0], ends[i].p[1] - ends[j].p[1]) <= 2.3) par[find(i)] = find(j);
      }
    }
    const groups = new Map();
    ends.forEach((e, i) => { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(e); });
    return Array.from(groups.values());
  }

  function orientFrom(pts, side) { return side === 0 ? pts.slice() : pts.slice().reverse(); }

  function refineLines(lines, R) {
    lines = lines.filter((q) => q.length > 0);
    // 1) conectores cortos entre píxeles de un mismo cruce
    let work = lines.filter((q) => {
      if (q.length < 2) return true;
      const a = arcLen(q);
      if (a[a.length - 1] > 4) return true;
      const p0 = q[0], p1 = q[q.length - 1];
      return Math.hypot(p0[0] - p1[0], p0[1] - p1[1]) > 2.3 ? true : false;
    });
    const dropped = lines.filter((q) => q.length >= 2 && !work.includes(q));
    // los conectores no se pierden: los extremos de los demás tramos ya están agrupados por cercanía

    // 2) colas en esquinas agudas
    for (let pass = 0; pass < 6; pass++) {
      const nodes = buildNodes(work);
      let changed = false;
      for (const node of nodes) {
        if (node.length !== 3) continue;
        const info = node.map((m) => {
          const pts = orientFrom(work[m.li], m.side);
          const a = arcLen(pts);
          return { m, pts, a, len: a[a.length - 1] };
        });
        if (new Set(info.map((x) => x.m.li)).size !== 3) continue;
        for (let k = 0; k < 3; k++) {
          const sp = info[k];
          const others = info.filter((_, i) => i !== k);
          const farNode = nodes.find((nd) => nd !== node && nd.some((e) => e.li === sp.m.li));
          if (farNode && farNode.length !== 1) continue; // la cola debe terminar libre
          if (others[0].len < 2.5 * R || others[1].len < 2.5 * R) continue;
          const pa = pointAt(others[0].pts, others[0].a, 4 * R), pb = pointAt(others[1].pts, others[1].a, 4 * R);
          const o = others[0].pts[0];
          const va = unit(pa[0] - o[0], pa[1] - o[1]), vb = unit(pb[0] - o[0], pb[1] - o[1]);
          if (!va || !vb) continue;
          const cos = clamp(va[0] * vb[0] + va[1] * vb[1], -1, 1);
          const theta = Math.acos(cos);
          if (theta > 2.2) continue; // más de ~125°: no es una esquina aguda
          const bis = unit(va[0] + vb[0], va[1] + vb[1]);
          if (!bis) continue;
          const ps = pointAt(sp.pts, sp.a, Math.min(sp.len, 2.5 * R));
          const vc = unit(ps[0] - o[0], ps[1] - o[1]);
          if (!vc) continue;
          // la cola apunta hacia la punta: al revés de la bisectriz de los dos brazos
          if (vc[0] * bis[0] + vc[1] * bis[1] > -0.82) continue;
          const maxLen = 1.4 * R / Math.max(0.2, Math.sin(theta / 2)) + 4;
          if (sp.len > maxLen) continue;
          // quita la cola y une los dos brazos
          const A = others[0], B = others[1];
          const merged = A.pts.slice().reverse().concat(B.pts.slice(1));
          const drop = new Set([A.m.li, B.m.li, sp.m.li]);
          work = work.filter((_, i) => !drop.has(i));
          work.push(merged);
          changed = true;
          break;
        }
        if (changed) break;
      }
      if (!changed) break;
    }

    // 3) cruces: el punto de unión se lleva a la intersección de las rectas de cada brazo
    {
      const nodes = buildNodes(work);
      const newLines = work.map((q) => q.slice());
      for (const node of nodes) {
        if (node.length < 3) continue;
        const arms = node.map((m) => {
          const pts = orientFrom(work[m.li], m.side);
          const a = arcLen(pts);
          const fit = a[a.length - 1] >= 3.6 * R ? fitRange(pts, a, 1.4 * R, Math.min(a[a.length - 1], 5 * R)) : null;
          return { m, pts, a, fit };
        });
        const fits = arms.filter((x) => x.fit && x.fit.res <= 0.35 * R + 0.6).map((x) => x.fit);
        if (fits.length < 2) continue;
        // punto que minimiza la distancia a todas las rectas
        let a11 = 0, a12 = 0, a22 = 0, b1 = 0, b2 = 0;
        for (const f of fits) {
          const m11 = 1 - f.dx * f.dx, m12 = -f.dx * f.dy, m22 = 1 - f.dy * f.dy;
          a11 += m11; a12 += m12; a22 += m22;
          b1 += m11 * f.x + m12 * f.y; b2 += m12 * f.x + m22 * f.y;
        }
        const det = a11 * a22 - a12 * a12;
        if (Math.abs(det) < 0.05) continue;
        const X = [(b1 * a22 - b2 * a12) / det, (a11 * b2 - a12 * b1) / det];
        let cx = 0, cy = 0;
        for (const m of node) { cx += m.p[0]; cy += m.p[1]; }
        cx /= node.length; cy /= node.length;
        if (Math.hypot(X[0] - cx, X[1] - cy) > 2.5 * R) continue;
        for (const arm of arms) {
          const cut = Math.min(1.5 * R, arm.a[arm.a.length - 1] * 0.5);
          const rest = arm.pts.filter((_, i) => arm.a[i] > cut);
          const fixed = [X].concat(rest);
          newLines[arm.m.li] = arm.m.side === 0 ? fixed : fixed.reverse();
        }
      }
      work = newLines;
    }

    // 4) esquinas simples: dos tramos rectos que se encuentran en ángulo
    work = work.map((q) => sharpenCorners(q, R));
    return work;
  }

  function sharpenCorners(pts, R) {
    if (pts.length < 6) return pts;
    const a = arcLen(pts);
    const total = a[a.length - 1];
    if (total < 6 * R) return pts;
    const corners = [];
    for (let i = 1; i < pts.length - 1; i++) {
      const s = a[i];
      if (s < 2.4 * R || s > total - 2.4 * R) continue;
      const bN = fitRange(pts, a, s - 3 * R, s - 1.2 * R), bF = fitRange(pts, a, Math.max(0, s - 6 * R), s - 3 * R);
      const aN = fitRange(pts, a, s + 1.2 * R, s + 3 * R), aF = fitRange(pts, a, s + 3 * R, Math.min(total, s + 6 * R));
      if (!bN || !aN) continue;
      const tol = 0.3 * R + 0.6;
      if (bN.res > tol || aN.res > tol) continue;
      const ang = (u, v) => Math.acos(clamp(u.dx * v.dx + u.dy * v.dy, -1, 1));
      if (bF && bF.res <= tol && ang(bN, bF) > 0.22) continue; // el tramo no es recto
      if (aF && aF.res <= tol && ang(aN, aF) > 0.22) continue;
      const turn = ang(bN, aN);
      if (turn < 0.6 || turn > 2.9) continue;
      const X = lineIntersect(bN, aN);
      if (!X) continue;
      if (Math.hypot(X[0] - pts[i][0], X[1] - pts[i][1]) > 2.2 * R) continue;
      corners.push({ i, s, turn, X });
    }
    if (!corners.length) return pts;
    // un solo candidato por esquina: el de mayor giro dentro de una ventana
    corners.sort((u, v) => v.turn - u.turn);
    const chosen = [];
    for (const c of corners) if (chosen.every((o) => Math.abs(o.s - c.s) > 3.4 * R)) chosen.push(c);
    chosen.sort((u, v) => u.s - v.s);
    const out = [];
    let ci = 0;
    for (let i = 0; i < pts.length; i++) {
      while (ci < chosen.length && a[i] > chosen[ci].s + 1.6 * R) ci++;
      const c = chosen[ci];
      if (c && a[i] >= c.s - 1.6 * R && a[i] <= c.s + 1.6 * R) {
        if (!c.done) { out.push(c.X); c.done = true; }
        continue;
      }
      out.push(pts[i]);
    }
    return out;
  }

  /* ---------- calidad de la foto ---------- */

  function sharpnessInfo(g, w, h) {
    const m = Math.max(w, h);
    const f = Math.max(1, m / 600);
    const sw = Math.max(16, Math.round(w / f)), sh = Math.max(16, Math.round(h / f));
    const s = f > 1 ? downscaleAvg(g, w, h, sw, sh) : g;
    const W = f > 1 ? sw : w, H = f > 1 ? sh : h;
    const grads = [];
    let lo = 255, hi = 0;
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const gx = s[y * W + x + 1] - s[y * W + x - 1];
        const gy = s[(y + 1) * W + x] - s[(y - 1) * W + x];
        const gm = Math.hypot(gx, gy) / 2;
        grads.push(gm);
        const v = s[y * W + x];
        if (v < lo) lo = v; if (v > hi) hi = v;
      }
    }
    grads.sort((a, b) => a - b);
    const k = Math.max(1, Math.floor(grads.length * 0.01));
    let e = 0;
    for (let i = grads.length - k; i < grads.length; i++) e += grads[i];
    e /= k;
    // ancho aproximado del borde, en px de una imagen de 600 px
    const p5 = grads.length ? 0 : 0;
    const range = Math.max(1, hi - lo);
    return { edgeWidth: range / Math.max(e, 0.5), range, p5 };
  }

  /* ---------- proceso principal ---------- */

  function analyze(canvas, opts) {
    opts = opts || {};
    const keepDots = !!opts.keepDots;
    const { g, w, h } = grayFromCanvas(canvas);
    const n = w * h;

    // fondo parejo
    const bg = estimateBackground(g, w, h);
    const norm = new Float32Array(n);
    let bgSum = 0;
    for (let i = 0; i < n; i++) {
      norm[i] = clamp(g[i] / Math.max(bg[i], 20) * 255, 0, 255);
      bgSum += bg[i];
    }
    const bgMean = bgSum / n;

    const sigma = Math.max(1, Math.max(w, h) / 900);
    const sm = blur(norm, w, h, Math.max(1, Math.round(sigma * 1.0)), 2);
    const thr0 = otsu(sm, n);

    // umbral un poco más inclusivo que Otsu para no cortar trazos finos
    let paperSum = 0, paperC = 0, inkSum = 0, inkC = 0;
    for (let i = 0; i < n; i++) { if (sm[i] < thr0) { inkSum += norm[i]; inkC++; } else { paperSum += norm[i]; paperC++; } }
    const paperM = paperC ? paperSum / paperC : 255;
    const inkM = inkC ? inkSum / inkC : 0;
    const thr = thr0 + 0.12 * (paperM - thr0);

    const mask = new Uint8Array(n);
    let inkCount = 0;
    for (let i = 0; i < n; i++) { if (sm[i] < thr) { mask[i] = 1; inkCount++; } }

    const sharp = sharpnessInfo(g, w, h);
    const contrast = (paperM - inkM) / 255;
    const quality = {
      edgeWidth: sharp.edgeWidth,
      bright: bgMean,
      contrast,
      blur: sharp.edgeWidth > (opts.blurLimit || 5.2),
      dark: bgMean < 85,
      over: bgMean > 248,
      lowContrast: contrast < 0.25
    };

    if (inkCount < n * 0.0015) return { error: 'no_mark', quality };
    if (inkCount > n * 0.6) return { error: 'too_much', quality };

    // componentes: quita manchas
    const { labels, comps } = labelComponents(mask, w, h);
    // sombras y manchas gruesas pegadas al borde del recorte no son parte de la marca
    {
      const perim = new Float64Array(comps.length + 1);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          const l = labels[i];
          if (!l) continue;
          if (x === 0 || y === 0 || x === w - 1 || y === h - 1 || !mask[i - 1] || !mask[i + 1] || !mask[i - w] || !mask[i + w]) perim[l]++;
        }
      }
      const minArea = Math.max(40, n * 0.0002);
      const free = [];
      for (const c of comps) {
        c.touch = c.minx === 0 || c.miny === 0 || c.maxx === w - 1 || c.maxy === h - 1;
        c.thickC = perim[c.id] ? 2 * c.area / perim[c.id] : 0;
        if (!c.touch && c.area >= minArea) free.push(c.thickC);
      }
      if (free.length) {
        free.sort((p, q) => p - q);
        const tRef = free[Math.floor(free.length / 2)];
        for (const c of comps) if (c.touch && c.thickC > 2.2 * tRef && c.area >= minArea) c.area = 0;
      }
    }
    let largest = 0;
    for (const c of comps) if (c.area > largest) largest = c.area;
    const relMin = keepDots ? 0.0008 : 0.02;
    const absMin = keepDots ? Math.max(8, n * 0.000015) : Math.max(40, n * 0.0002);
    const keepIds = new Set();
    let minx = w, maxx = 0, miny = h, maxy = 0;
    for (const c of comps) {
      if (c.area >= largest * relMin && c.area >= absMin) {
        keepIds.add(c.id);
        if (c.minx < minx) minx = c.minx; if (c.maxx > maxx) maxx = c.maxx;
        if (c.miny < miny) miny = c.miny; if (c.maxy > maxy) maxy = c.maxy;
      }
    }
    if (!keepIds.size) return { error: 'no_mark', quality };

    // imagen suavizada solo con los componentes que se conservan
    const clean = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      clean[i] = (labels[i] && !keepIds.has(labels[i])) ? 255 : sm[i];
    }
    const bw0 = maxx - minx + 1, bh0 = maxy - miny + 1;
    const pad = Math.round(0.03 * Math.max(bw0, bh0)) + 4;
    const cx0 = Math.max(0, minx - pad), cy0 = Math.max(0, miny - pad);
    const cx1 = Math.min(w - 1, maxx + pad), cy1 = Math.min(h - 1, maxy + pad);
    const cw = cx1 - cx0 + 1, ch = cy1 - cy0 + 1;
    const crop = new Float32Array(cw * ch);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) crop[y * cw + x] = clean[(cy0 + y) * w + cx0 + x];

    // escala de trabajo
    const s = WORK / Math.max(bw0, bh0);
    const nw = Math.max(16, Math.round(cw * s)), nh = Math.max(16, Math.round(ch * s));
    const scaled = (nw === cw && nh === ch) ? crop : resizeBilinear(crop, cw, ch, nw, nh);
    const m2 = new Uint8Array(nw * nh);
    for (let i = 0; i < m2.length; i++) m2[i] = scaled[i] < thr ? 1 : 0;

    // grosor aproximado del trazo original, para rellenar huecos de textura
    let area = 0, perim = 0;
    for (let y = 1; y < nh - 1; y++) {
      for (let x = 1; x < nw - 1; x++) {
        const i = y * nw + x;
        if (!m2[i]) continue;
        area++;
        if (!m2[i - 1] || !m2[i + 1] || !m2[i - nw] || !m2[i + nw]) perim++;
      }
    }
    const thick = perim ? Math.max(2, 2 * area / perim) : 4;
    fillSmallHoles(m2, nw, nh, Math.max(12, 2.5 * thick * thick));

    // quita restos chicos que quedaron después de escalar
    const L2 = labelComponents(m2, nw, nh);
    let big2 = 0;
    for (const c of L2.comps) if (c.area > big2) big2 = c.area;
    const keep2 = new Set();
    for (const c of L2.comps) {
      if (c.area >= big2 * (keepDots ? 0.0008 : 0.02) && c.area >= (keepDots ? 6 : 30)) keep2.add(c.id);
    }
    for (let i = 0; i < m2.length; i++) if (m2[i] && !keep2.has(L2.labels[i])) m2[i] = 0;

    // esqueleto
    const { img, W, H } = thin(m2, nw, nh);
    const medianR = Math.max(1.5, thick / 2);
    const N = Math.round(clamp(1.3 * medianR + 3, 6, 40));
    cleanTeeth(img, W, H);
    const skp = cleanTeeth(prune(img, W, H, N, keepDots), W, H);

    if (opts.debug) return { dbg: { skp, img, W, H } };
    // polilíneas
    let lines = traceSkeleton(skp, W, H);
    lines = lines.map((pts) => smoothPath(pts.map((p) => [p[0] - 1, p[1] - 1]), 3));
    if (!opts.noRefine) lines = refineLines(lines, medianR);
    lines = lines.map((q) => rdp(q, 0.8)).filter((q) => q.length > 0);

    if (!lines.length) return { error: 'no_mark', quality };

    // caja del esqueleto
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    for (const q of lines) for (const p of q) {
      if (p[0] < bx0) bx0 = p[0]; if (p[0] > bx1) bx1 = p[0];
      if (p[1] < by0) by0 = p[1]; if (p[1] > by1) by1 = p[1];
    }
    const strokes = lines.map((q) => q.map((p) => [Math.round((p[0] - bx0) * 100) / 100, Math.round((p[1] - by0) * 100) / 100]));
    return {
      strokes,
      w: Math.round((bx1 - bx0) * 100) / 100,
      h: Math.round((by1 - by0) * 100) / 100,
      quality,
      thick
    };
  }

  // Estimación rápida para la cámara en vivo (canvas chico)
  function liveQuality(canvas) {
    const { g, w, h } = grayFromCanvas(canvas);
    let sum = 0;
    for (let i = 0; i < g.length; i++) sum += g[i];
    const mean = sum / g.length;
    const info = sharpnessInfo(g, w, h);
    let state = 'ok';
    if (info.range < 35) state = 'empty';
    else if (mean < 70) state = 'dark';
    else if (mean > 245) state = 'over';
    else if (info.edgeWidth > (global.__liveBlurLimit || 4.4)) state = 'blur';
    return { state, mean, edgeWidth: info.edgeWidth, range: info.range };
  }

  global.Engine = { analyze, liveQuality, WORK, _t: { transitions, degree } };
})(typeof window !== 'undefined' ? window : globalThis);
