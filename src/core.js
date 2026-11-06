// 像素工坊 core: pure image algorithms (browser + node). Images are {width, height, data: Uint8ClampedArray RGBA}.
(function (root) {
  'use strict';
  const PX = {};

  // ------------------------------------------------------------------ basics
  PX.makeImage = function (w, h, data) {
    return { width: w, height: h, data: data || new Uint8ClampedArray(w * h * 4) };
  };
  PX.cloneImage = function (img) {
    return { width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) };
  };
  PX.rng = function (seed) { // mulberry32, deterministic
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  PX.hex = function (r, g, b) {
    return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  };
  PX.parseHex = function (s) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(s).trim());
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };

  // ------------------------------------------------------------------ OKLab
  const LIN = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const c = i / 255; LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  PX.toLab = function (r, g, b) {
    const R = LIN[r], G = LIN[g], B = LIN[b];
    const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
    const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
    const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
    return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
  };
  function gam(x) { x = x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(Math.max(x, 0), 1 / 2.4) - 0.055; return Math.max(0, Math.min(255, Math.round(x * 255))); }
  PX.fromLab = function (L, a, b) {
    const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
    const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
    const s = Math.pow(L - 0.0894841775 * a - 1.2914855480 * b, 3);
    return [gam(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
      gam(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
      gam(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)];
  };
  PX.dist = function (p, q) { const d0 = p[0] - q[0], d1 = p[1] - q[1], d2 = p[2] - q[2]; return Math.sqrt(d0 * d0 + d1 * d1 + d2 * d2); };
  PX.labOfHex = function (h) { const c = PX.parseHex(h); return PX.toLab(c[0], c[1], c[2]); };

  // ------------------------------------------------------------------ stats
  PX.colorStats = function (img) {
    const map = new Map(); let opaque = 0;
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 128) continue;
      opaque++;
      const k = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
      map.set(k, (map.get(k) || 0) + 1);
    }
    const list = [...map.entries()].map(([k, n]) => ({ hex: PX.hex(k >> 16, (k >> 8) & 255, k & 255), count: n })).sort((a, b) => b.count - a.count);
    const rare = list.filter(c => c.count < opaque * 0.005).length;
    return { colors: list.length, opaque, rare, list };
  };

  // ------------------------------------------------------------------ grid detection (AI "fake pixel" images)
  function profiles(img) {
    const w = img.width, h = img.height, d = img.data;
    const px = new Float64Array(w), py = new Float64Array(h);
    const stepY = Math.max(1, Math.floor(h / 400)), stepX = Math.max(1, Math.floor(w / 400));
    for (let y = 0; y < h; y += stepY) {
      for (let x = 1; x < w; x++) {
        const i = (y * w + x) * 4, j = i - 4;
        px[x] += Math.abs(d[i] - d[j]) + Math.abs(d[i + 1] - d[j + 1]) + Math.abs(d[i + 2] - d[j + 2]) + Math.abs(d[i + 3] - d[j + 3]);
      }
    }
    for (let x = 0; x < w; x += stepX) {
      for (let y = 1; y < h; y++) {
        const i = (y * w + x) * 4, j = i - w * 4;
        py[y] += Math.abs(d[i] - d[j]) + Math.abs(d[i + 1] - d[j + 1]) + Math.abs(d[i + 2] - d[j + 2]) + Math.abs(d[i + 3] - d[j + 3]);
      }
    }
    return [px, py];
  }
  // Edge peaks of a profile (local maxima well above the noise floor), refined to sub-pixel positions.
  PX.edgePeaks = function (prof) {
    const n = prof.length, sorted = Array.from(prof).slice(1).sort((a, b) => a - b);
    const med = sorted[Math.floor(sorted.length / 2)] || 0, hi = sorted[Math.floor(sorted.length * 0.98)] || 0;
    const thr = Math.max(med * 2.5, med + (hi - med) * 0.12);
    const peaks = [];
    for (let x = 2; x < n - 1; x++) {
      const c = prof[x];
      if (c <= thr || c < prof[x - 1] || c <= prof[x + 1]) continue;
      const l = prof[x - 1], r = prof[x + 1], den = l - 2 * c + r;
      peaks.push(x + (den !== 0 ? Math.max(-0.5, Math.min(0.5, 0.5 * (l - r) / den)) : 0) - 0.5);
    }
    return peaks;
  };
  // Period = largest p for which gaps between neighbouring edges are whole multiples of p.
  // (Divisors of the true period fit as well, multiples do not.)
  function peakGaps(prof, minP) {
    const peaks = PX.edgePeaks(prof), gaps = [];
    for (let i = 1; i < peaks.length; i++) { const g = peaks[i] - peaks[i - 1]; if (g >= minP * 0.8) gaps.push(g); }
    return { peaks, gaps };
  }
  function gapFit(gaps, p) { let s = 0, k = 0; for (const g of gaps) { if (g > p * 6) continue; s += g < p * 0.75 ? -1 : Math.cos((2 * Math.PI * g) / p); k++; } return k >= 4 ? s / k : -1; }
  function pickPeriod(gaps, minP, maxP) {
    const scores = [];
    for (let p = minP; p <= maxP; p += Math.max(0.01, p * 0.003)) scores.push({ p, s: gapFit(gaps, p) });
    let max = -1; for (const t of scores) max = Math.max(max, t.s);
    if (max < 0.3) return { period: 0, score: max };
    let pick = null;
    for (let i = scores.length - 1; i >= 0; i--) {
      const t = scores[i]; if (t.s < max * 0.85) continue;
      let peak = true; for (let j = Math.max(0, i - 4); j <= Math.min(scores.length - 1, i + 4); j++) if (scores[j].s > t.s) peak = false;
      if (peak) { pick = t; break; }
    }
    if (!pick) pick = scores.reduce((a, b) => (b.s > a.s ? b : a));
    let bp = pick.p, bs = pick.s;
    for (let p = pick.p * 0.99; p <= pick.p * 1.01; p += pick.p * 0.0004) { const v = gapFit(gaps, p); if (v > bs) { bs = v; bp = p; } }
    return { period: bp, score: bs };
  }
  function phaseOf(peaks, p) {
    let re = 0, im = 0; for (const x of peaks) { re += Math.cos((2 * Math.PI * x) / p); im += Math.sin((2 * Math.PI * x) / p); }
    let ph = (Math.atan2(im, re) / (2 * Math.PI)) * p; if (ph < 0) ph += p; return ph;
  }
  PX.detectPeriod = function (prof, minP, maxP) {
    const { peaks, gaps } = peakGaps(prof, minP);
    if (peaks.length < 6 || gaps.length < 5) return { period: 0, phase: 0, score: 0, peaks: peaks.length };
    const r = pickPeriod(gaps, minP, maxP);
    if (!r.period) return { period: 0, phase: 0, score: r.score, peaks: peaks.length };
    return { period: r.period, phase: phaseOf(peaks, r.period), score: r.score, peaks: peaks.length };
  };
  // Boundaries that follow the real edges (AI grids drift): predicted = previous + period, snapped to the
  // strongest edge within +-30% of a period when that edge is clearly above the noise floor.
  PX.snapCells = function (prof, size, offset) {
    const n = prof.length;
    if (!(size > 0)) return [];
    let total = 0; for (let i = 1; i < n; i++) total += prof[i];
    const floor = (total / Math.max(1, n - 1)) * 1.5;
    const bounds = [];
    let b = offset % size; if (b < 0) b += size;
    let prev = b - size;
    for (let guard = 0; guard < n; guard++) {
      let pred = prev + size;
      if (pred >= n) break;
      const lo = Math.max(1, Math.ceil(pred - size * 0.3)), hi = Math.min(n - 1, Math.floor(pred + size * 0.3));
      let bx = -1, bv = floor;
      for (let x = lo; x <= hi; x++) if (prof[x] > bv) { bv = prof[x]; bx = x; }
      const pos = bx >= 0 ? bx : pred;
      if (pos > 0) bounds.push(pos);
      prev = pos;
    }
    const out = [];
    let a = 0;
    for (const x of bounds) {
      const xi = Math.round(x);
      if (xi - a >= size * 0.5) { out.push([a, xi]); a = xi; } else if (!out.length) a = xi;
    }
    if (n - a >= size * 0.5) out.push([a, n]); else if (out.length) out[out.length - 1][1] = n;
    return out;
  };
  PX.detectGrid = function (img) {
    const [px, py] = profiles(img);
    const gx = PX.detectPeriod(px, 2, 64), gy = PX.detectPeriod(py, 2, 64);
    let sx = gx.period, sy = gy.period, offX = gx.phase, offY = gy.phase, score = Math.min(gx.score, gy.score), joint = false;
    const agree = sx && sy && Math.abs(sx - sy) / Math.max(sx, sy) < 0.04;
    if (agree) { const m = (sx + sy) / 2; sx = m; sy = m; }
    let ok = gx.score > 0.45 && gy.score > 0.45 && sx >= 2 && sy >= 2 && agree;
    if (!ok) { // square pixels: fit one period to the edge gaps of both axes together
      const A = peakGaps(px, 2), B = peakGaps(py, 2), all = A.gaps.concat(B.gaps);
      if (all.length >= 10) {
        const r = pickPeriod(all, 2, 64);
        const fx = gapFit(A.gaps, r.period), fy = gapFit(B.gaps, r.period);
        if (r.period >= 2 && r.score > 0.4 && fx > 0.3 && fy > 0.3) { sx = sy = r.period; offX = phaseOf(A.peaks, r.period); offY = phaseOf(B.peaks, r.period); score = r.score; ok = true; joint = true; }
      }
    }
    return { ok, joint, sizeX: sx, sizeY: sy, offX, offY, score, profX: px, profY: py };
  };
  // Block-size suggestion for images without a recoverable grid (resampled / blurry AI art):
  // incoherent (windowed) spectrum of both edge profiles, strongest period in [minP, maxP].
  PX.suggestBlock = function (grid, minP, maxP) {
    minP = minP || 2; maxP = maxP || 8;
    const spec = prof => {
      const n = prof.length, win = Math.min(n, 320), hop = Math.max(1, win >> 1), det = new Float64Array(n);
      for (let i = 0; i < n; i++) { let s = 0, k = 0; for (let j = Math.max(0, i - 8); j <= Math.min(n - 1, i + 8); j++) { s += prof[j]; k++; } det[i] = prof[i] - s / k; }
      const out = [];
      for (let p = minP; p <= maxP; p += Math.max(0.01, p * 0.004)) {
        let acc = 0, cnt = 0;
        for (let st = 0; st + win <= n; st += hop) { let re = 0, im = 0, e = 0; for (let x = st; x < st + win; x++) { const a = 2 * Math.PI * x / p; re += det[x] * Math.cos(a); im += det[x] * Math.sin(a); e += det[x] * det[x]; } acc += Math.sqrt(re * re + im * im) / Math.sqrt(e * win + 1e-9); cnt++; }
        out.push({ p, m: cnt ? acc / cnt : 0 });
      }
      return out;
    };
    const a = spec(grid.profX), b = spec(grid.profY), j = a.map((t, i) => ({ p: t.p, m: (t.m + b[i].m) / 2 }));
    const med = j.map(t => t.m).sort((x, y) => x - y)[j.length >> 1] || 1e-9;
    let best = j[0]; for (const t of j) if (t.m > best.m) best = t;
    return { size: best.p, strength: best.m / med };
  };
  PX.cells = function (length, size, offset) {
    const out = [];
    if (!(size > 0)) return out;
    let start = offset % size; if (start < 0) start += size;
    const first = start - size;
    for (let x = first; x < length; x += size) {
      const a = Math.max(0, x), b = Math.min(length, x + size);
      if (b - a >= size * 0.5 - 1e-6) out.push([a, b]);
    }
    return out;
  };

  // ------------------------------------------------------------------ downsample
  // sample: 'dominant' (most common colour of the cell core), 'average', 'center'
  // 'detail' sampling for blurry (resampled) AI art: 2-means per cell in OKLab.
  //  - flat cell  -> real pixel closest to the cell mean (denoise)
  //  - two tones  -> the larger tone, except a clearly darker minority >= 25% wins (keeps outlines / window bars)
  function labOf(memo, r, g, b) { const k = (r << 16) | (g << 8) | b; let v = memo.get(k); if (!v) { v = PX.toLab(r, g, b); memo.set(k, v); } return v; }
  function detailCell(img, x0, x1, y0, y1, od, o, memo) {
    const d = img.data, iw = img.width; x1 = Math.min(x1, iw); y1 = Math.min(y1, img.height);
    const px = [], lab = []; let n = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const s = (y * iw + x) * 4; n++; if (d[s + 3] < 128) continue; px.push(s); lab.push(labOf(memo, d[s], d[s + 1], d[s + 2])); }
    if (px.length * 2 < n || !px.length) { od[o + 3] = 0; return; }
    let lo = 0, hi = 0; for (let i = 1; i < lab.length; i++) { if (lab[i][0] < lab[lo][0]) lo = i; if (lab[i][0] > lab[hi][0]) hi = i; }
    let c0 = lab[lo].slice(), c1 = lab[hi].slice(), asg = new Uint8Array(lab.length);
    for (let it = 0; it < 4; it++) {
      const s0 = [0, 0, 0, 0], s1 = [0, 0, 0, 0];
      for (let i = 0; i < lab.length; i++) { const q = lab[i], a = PX.dist(q, c0) <= PX.dist(q, c1) ? 0 : 1; asg[i] = a; const t = a ? s1 : s0; t[0] += q[0]; t[1] += q[1]; t[2] += q[2]; t[3]++; }
      if (s0[3]) c0 = [s0[0] / s0[3], s0[1] / s0[3], s0[2] / s0[3]]; if (s1[3]) c1 = [s1[0] / s1[3], s1[1] / s1[3], s1[2] / s1[3]];
    }
    let n0 = 0; for (const a of asg) if (!a) n0++; const n1 = lab.length - n0;
    let target, pick;
    if (PX.dist(c0, c1) < 0.06 || !n0 || !n1) { const m = [0, 0, 0]; for (const q of lab) { m[0] += q[0]; m[1] += q[1]; m[2] += q[2]; } target = m.map(v => v / lab.length); pick = -1; }
    else {
      // c0 is the darker cluster (seeded from the darkest pixel)
      const darkWins = c0[0] < c1[0] - 0.06 && n0 >= lab.length * PX.DARK_LINE_MIN;
      pick = darkWins ? 0 : (n0 >= n1 ? 0 : 1); target = pick ? c1 : c0;
    }
    let best = -1, bd = 1e9; for (let i = 0; i < lab.length; i++) { if (pick >= 0 && asg[i] !== pick) continue; const e = PX.dist(lab[i], target); if (e < bd) { bd = e; best = i; } }
    const s = px[best]; od[o] = d[s]; od[o + 1] = d[s + 1]; od[o + 2] = d[s + 2]; od[o + 3] = 255;
  }
  PX.DARK_LINE_MIN = 0.25;
  // unsharp mask (separable box blur, radius r) on RGB; alpha untouched. amount 0..2
  PX.sharpen = function (img, r, amount) {
    if (!amount) return img;
    const w = img.width, h = img.height, d = img.data, tmp = new Float32Array(w * h * 3), blur = new Float32Array(w * h * 3);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) { let s = 0, k = 0; for (let t = -r; t <= r; t++) { const xx = Math.min(w - 1, Math.max(0, x + t)); s += d[(y * w + xx) * 4 + c]; k++; } tmp[(y * w + x) * 3 + c] = s / k; }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) { let s = 0, k = 0; for (let t = -r; t <= r; t++) { const yy = Math.min(h - 1, Math.max(0, y + t)); s += tmp[(yy * w + x) * 3 + c]; k++; } blur[(y * w + x) * 3 + c] = s / k; }
    const out = PX.cloneImage(img);
    for (let i = 0; i < w * h; i++) for (let c = 0; c < 3; c++) out.data[i * 4 + c] = d[i * 4 + c] + (d[i * 4 + c] - blur[i * 3 + c]) * amount;
    return out;
  };
  // paint the (possibly trimmed) result back onto the source-sized canvas, one result pixel per source cell
  PX.restoreToSource = function (image, geo, crop, W, H) {
    const out = PX.makeImage(W, H), ox = crop ? crop.x : 0, oy = crop ? crop.y : 0;
    for (let j = 0; j < image.height; j++) {
      const cyj = geo.cy[j + oy]; if (!cyj) continue;
      for (let i = 0; i < image.width; i++) {
        const cxi = geo.cx[i + ox]; if (!cxi) continue; const s = (j * image.width + i) * 4; if (image.data[s + 3] === 0) continue;
        for (let y = Math.max(0, cyj[0]); y < Math.min(H, cyj[1]); y++) for (let x = Math.max(0, cxi[0]); x < Math.min(W, cxi[1]); x++) out.data.set(image.data.subarray(s, s + 4), (y * W + x) * 4);
      }
    }
    return out;
  };
  PX.downsample = function (img, cx, cy, sample) {
    const W = cx.length, H = cy.length, out = PX.makeImage(W, H), d = img.data, iw = img.width;
    const counts = new Map(), labMemo = new Map();
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        const [x0, x1] = cx[i], [y0, y1] = cy[j];
        const o = (j * W + i) * 4;
        if (sample === 'center') {
          const x = Math.min(iw - 1, Math.floor((x0 + x1) / 2)), y = Math.min(img.height - 1, Math.floor((y0 + y1) / 2)), s = (y * iw + x) * 4;
          out.data[o] = d[s]; out.data[o + 1] = d[s + 1]; out.data[o + 2] = d[s + 2]; out.data[o + 3] = d[s + 3];
          continue;
        }
        if (sample === 'detail') { detailCell(img, x0, x1, y0, y1, out.data, o, labMemo); continue; }
        const shrink = sample === 'dominant' ? 0.22 : 0;
        let ax = Math.floor(x0 + (x1 - x0) * shrink), bx = Math.ceil(x1 - (x1 - x0) * shrink);
        let ay = Math.floor(y0 + (y1 - y0) * shrink), by = Math.ceil(y1 - (y1 - y0) * shrink);
        if (bx <= ax) bx = ax + 1; if (by <= ay) by = ay + 1;
        bx = Math.min(bx, iw); by = Math.min(by, img.height);
        let n = 0, sr = 0, sg = 0, sb = 0, sa = 0, trans = 0;
        counts.clear();
        for (let y = ay; y < by; y++) for (let x = ax; x < bx; x++) {
          const s = (y * iw + x) * 4;
          n++;
          if (d[s + 3] < 128) { trans++; continue; }
          if (sample === 'dominant') {
            const k = ((d[s] >> 3) << 10) | ((d[s + 1] >> 3) << 5) | (d[s + 2] >> 3);
            let e = counts.get(k); if (!e) { e = [0, 0, 0, 0]; counts.set(k, e); }
            e[0]++; e[1] += d[s]; e[2] += d[s + 1]; e[3] += d[s + 2];
          } else { sr += d[s]; sg += d[s + 1]; sb += d[s + 2]; sa++; }
        }
        if (trans * 2 > n) { out.data[o + 3] = 0; continue; }
        if (sample === 'dominant') {
          let best = null; for (const e of counts.values()) if (!best || e[0] > best[0]) best = e;
          out.data[o] = best[1] / best[0]; out.data[o + 1] = best[2] / best[0]; out.data[o + 2] = best[3] / best[0];
        } else { out.data[o] = sr / sa; out.data[o + 1] = sg / sa; out.data[o + 2] = sb / sa; }
        out.data[o + 3] = 255;
      }
    }
    return out;
  };

  // ------------------------------------------------------------------ background removal
  // Flood from seeds through pixels whose colour is within tol (OKLab) of the seed colour; contiguous only.
  PX.floodMask = function (img, seeds, tol, diag) {
    const w = img.width, h = img.height, d = img.data, mask = new Uint8Array(w * h);
    const labCache = new Map();
    const lab = i => {
      const k = (d[i * 4] << 16) | (d[i * 4 + 1] << 8) | d[i * 4 + 2];
      let v = labCache.get(k); if (!v) { v = PX.toLab(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]); labCache.set(k, v); }
      return v;
    };
    for (const s of seeds) {
      if (mask[s]) continue;
      const ref = lab(s), refT = d[s * 4 + 3] < 128;
      const stack = [s]; mask[s] = 1;
      while (stack.length) {
        const p = stack.pop(), x = p % w, y = (p - x) / w;
        const nb = diag ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] : [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (const [dx, dy] of nb) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const q = ny * w + nx;
          if (mask[q]) continue;
          const qt = d[q * 4 + 3] < 128;
          if (refT ? !qt : (qt || PX.dist(lab(q), ref) > tol)) continue;
          mask[q] = 1; stack.push(q);
        }
      }
    }
    return mask;
  };
  // Auto background: the most common border colour, flooded from every border pixel that matches it.
  PX.autoBackground = function (img, tol) {
    const w = img.width, h = img.height, d = img.data, border = [];
    for (let x = 0; x < w; x++) { border.push(x, (h - 1) * w + x); }
    for (let y = 0; y < h; y++) { border.push(y * w, y * w + w - 1); }
    const count = new Map();
    for (const p of border) { if (d[p * 4 + 3] < 128) continue; const k = ((d[p * 4] >> 3) << 10) | ((d[p * 4 + 1] >> 3) << 5) | (d[p * 4 + 2] >> 3); count.set(k, (count.get(k) || 0) + 1); }
    if (!count.size) return new Uint8Array(w * h);
    let bk = 0, bn = 0; for (const [k, n] of count) if (n > bn) { bn = n; bk = k; }
    if (bn < border.length * 0.25) return new Uint8Array(w * h); // no clear background
    const ref = [((bk >> 10) & 31) * 8 + 4, ((bk >> 5) & 31) * 8 + 4, (bk & 31) * 8 + 4], refLab = PX.toLab(ref[0], ref[1], ref[2]);
    const seeds = border.filter(p => d[p * 4 + 3] >= 128 && PX.dist(PX.toLab(d[p * 4], d[p * 4 + 1], d[p * 4 + 2]), refLab) <= tol);
    return PX.floodMask(img, seeds, tol, false);
  };
  PX.applyClear = function (img, mask) {
    for (let i = 0; i < mask.length; i++) if (mask[i]) img.data[i * 4 + 3] = 0;
  };

  // ------------------------------------------------------------------ palettes
  PX.PRESETS = {
    'PICO-8': ['#000000', '#1d2b53', '#7e2553', '#008751', '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8', '#ff004d', '#ffa300', '#ffec27', '#00e436', '#29adff', '#83769c', '#ff77a8', '#ffccaa'],
    'Sweetie 16': ['#1a1c2c', '#5d275d', '#b13e53', '#ef7d57', '#ffcd75', '#a7f070', '#38b764', '#257179', '#29366f', '#3b5dc9', '#41a6f6', '#73eff7', '#f4f4f4', '#94b0c2', '#566c86', '#333c57'],
    'DawnBringer 16': ['#140c1c', '#442434', '#30346d', '#4e4a4e', '#854c30', '#346524', '#d04648', '#757161', '#597dce', '#d27d2c', '#8595a1', '#6daa2c', '#d2aa99', '#6dc2ca', '#dad45e', '#deeed6'],
    'Game Boy': ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'],
  };
  PX.parsePalette = function (text) {
    const lines = String(text).replace(/\r/g, '').split('\n');
    const out = [];
    const push = (r, g, b) => { const h = PX.hex(r, g, b); if (!out.includes(h)) out.push(h); };
    const first = (lines[0] || '').trim();
    if (/^GIMP Palette/i.test(first) || /^JASC-PAL/i.test(first)) {
      for (let i = 1; i < lines.length; i++) {
        const m = /^\s*(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})(\s|$)/.exec(lines[i]);
        if (m && !(/^JASC/i.test(first) && i < 3)) push(+m[1], +m[2], +m[3]);
      }
      return out;
    }
    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith(';') || line.startsWith('//')) continue;
      const toks = line.match(/#?\b[0-9a-f]{6,8}\b/gi) || [];
      for (let t of toks) {
        t = t.replace('#', '');
        if (t.length === 8) t = t.slice(2); // paint.net AARRGGBB
        if (t.length === 6) { const c = PX.parseHex(t); push(c[0], c[1], c[2]); }
      }
      if (!toks.length) { const m = /^(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})$/.exec(line); if (m) push(+m[1], +m[2], +m[3]); }
    }
    return out;
  };
  PX.paletteToGPL = function (pal, name) {
    return 'GIMP Palette\nName: ' + (name || 'pixel-workshop') + '\nColumns: 8\n#\n' + pal.map(h => { const c = PX.parseHex(h); return c.map(v => String(v).padStart(3)).join(' ') + '\t' + h; }).join('\n') + '\n';
  };
  PX.paletteToHex = function (pal) { return pal.map(h => h.replace('#', '')).join('\n') + '\n'; };
  PX.sortPalette = function (pal) {
    return pal.slice().sort((a, b) => {
      const A = PX.labOfHex(a), B = PX.labOfHex(b);
      const ca = Math.hypot(A[1], A[2]), cb = Math.hypot(B[1], B[2]);
      const ga = ca < 0.03, gb = cb < 0.03;
      if (ga !== gb) return ga ? -1 : 1;
      if (ga) return A[0] - B[0];
      const ha = Math.floor(((Math.atan2(A[2], A[1]) + Math.PI) / (2 * Math.PI)) * 12), hb = Math.floor(((Math.atan2(B[2], B[1]) + Math.PI) / (2 * Math.PI)) * 12);
      return ha !== hb ? ha - hb : A[0] - B[0];
    });
  };
  // unique opaque colours with weights (+ their lab)
  PX.uniqueColors = function (img) {
    const map = new Map(), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 128) continue;
      const k = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
      map.set(k, (map.get(k) || 0) + 1);
    }
    return [...map.entries()].map(([k, n]) => ({ rgb: [k >> 16, (k >> 8) & 255, k & 255], n, lab: PX.toLab(k >> 16, (k >> 8) & 255, k & 255) }));
  };
  // k-means in OKLab. realColors: snap each centre to the heaviest real colour of its cluster (keeps vivid hues).
  PX.kmeansPalette = function (img, k, realColors, seed, balance) {
    const cols = PX.uniqueColors(img);
    if (!cols.length) return [];
    if (cols.length <= k) return PX.sortPalette(cols.sort((a, b) => b.n - a.n).map(c => PX.hex(...c.rgb)));
    const rnd = PX.rng(seed || 7);
    // balance 0..1: 0 = plain pixel counts; 1 = sqrt counts + chroma boost (small but vivid areas get palette slots)
    const bal = Math.max(0, Math.min(1, +balance || 0));
    const wt = cols.map(c => Math.pow(c.n, 1 - 0.5 * bal) * (1 + 5 * bal * Math.hypot(c.lab[1], c.lab[2])));
    const centers = [];
    let heaviest = cols[0]; for (const c of cols) if (c.n > heaviest.n) heaviest = c;
    centers.push(heaviest.lab.slice());
    const dmin = new Float64Array(cols.length).fill(Infinity);
    while (centers.length < k) {
      const last = centers[centers.length - 1];
      let sum = 0;
      for (let i = 0; i < cols.length; i++) { const dd = PX.dist(cols[i].lab, last); if (dd * dd < dmin[i]) dmin[i] = dd * dd; sum += dmin[i] * wt[i]; }
      if (sum <= 0) break;
      let r = rnd() * sum, pick = 0;
      for (let i = 0; i < cols.length; i++) { r -= dmin[i] * wt[i]; if (r <= 0) { pick = i; break; } }
      centers.push(cols[pick].lab.slice());
    }
    const assign = new Int32Array(cols.length);
    for (let it = 0; it < 16; it++) {
      const acc = centers.map(() => [0, 0, 0, 0]);
      for (let i = 0; i < cols.length; i++) {
        let best = 0, bd = Infinity;
        for (let c = 0; c < centers.length; c++) { const dd = PX.dist(cols[i].lab, centers[c]); if (dd < bd) { bd = dd; best = c; } }
        assign[i] = best; const a = acc[best], n = wt[i];
        a[0] += cols[i].lab[0] * n; a[1] += cols[i].lab[1] * n; a[2] += cols[i].lab[2] * n; a[3] += n;
      }
      let moved = 0;
      for (let c = 0; c < centers.length; c++) if (acc[c][3] > 0) {
        const nc = [acc[c][0] / acc[c][3], acc[c][1] / acc[c][3], acc[c][2] / acc[c][3]];
        moved = Math.max(moved, PX.dist(nc, centers[c])); centers[c] = nc;
      }
      if (moved < 1e-4) break;
    }
    const out = [];
    for (let c = 0; c < centers.length; c++) {
      let hex;
      if (realColors) {
        let best = null, bs = -Infinity;
        for (let i = 0; i < cols.length; i++) if (assign[i] === c) { const s = wt[i] / (1 + 40 * PX.dist(cols[i].lab, centers[c])); if (s > bs) { bs = s; best = cols[i]; } }
        if (!best) continue;
        hex = PX.hex(...best.rgb);
      } else hex = PX.hex(...PX.fromLab(...centers[c]));
      if (!out.includes(hex)) out.push(hex);
    }
    return PX.sortPalette(out);
  };
  // drop near-duplicate colours (OKLab distance < minDE); keeps the earlier (more common) entry
  PX.dedupePalette = function (pal, minDE) {
    const out = [], labs = [];
    for (const hx of pal) { const L = PX.labOfHex(hx); if (labs.some(q => PX.dist(q, L) < minDE)) continue; out.push(hx); labs.push(L); }
    return out;
  };
  PX.paletteFromImage = function (img, max) {
    const u = PX.uniqueColors(img);
    if (u.length <= max) return u.sort((a, b) => b.n - a.n).map(c => PX.hex(...c.rgb));
    return PX.kmeansPalette(img, max, true, 11);
  };

  // ------------------------------------------------------------------ palette fitting -> indexed image
  const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
  PX.fitPalette = function (img, pal, dither, amount) {
    const w = img.width, h = img.height, d = img.data;
    const labs = pal.map(PX.labOfHex);
    const idx = new Int16Array(w * h).fill(-1);
    const nearest2 = (lab) => {
      let b1 = -1, d1 = Infinity, b2 = -1, d2 = Infinity;
      for (let c = 0; c < labs.length; c++) {
        const dd = PX.dist(lab, labs[c]);
        if (dd < d1) { b2 = b1; d2 = d1; b1 = c; d1 = dd; } else if (dd < d2) { b2 = c; d2 = dd; }
      }
      return [b1, d1, b2, d2];
    };
    if (!labs.length) return idx;
    if (dither === 'floyd') {
      const buf = new Float32Array(w * h * 3);
      for (let i = 0; i < w * h; i++) { buf[i * 3] = LIN[d[i * 4]]; buf[i * 3 + 1] = LIN[d[i * 4 + 1]]; buf[i * 3 + 2] = LIN[d[i * 4 + 2]]; }
      const palLin = pal.map(hh => PX.parseHex(hh).map(v => LIN[v]));
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (d[i * 4 + 3] < 128) continue;
        const r = gam(buf[i * 3]), g = gam(buf[i * 3 + 1]), b = gam(buf[i * 3 + 2]);
        const c = nearest2(PX.toLab(r, g, b))[0];
        idx[i] = c;
        const k = amount;
        const er = (buf[i * 3] - palLin[c][0]) * k, eg = (buf[i * 3 + 1] - palLin[c][1]) * k, eb = (buf[i * 3 + 2] - palLin[c][2]) * k;
        const spread = (dx, dy, f) => {
          const nx = x + dx, ny = y + dy; if (nx < 0 || nx >= w || ny >= h) return;
          const j = ny * w + nx; if (d[j * 4 + 3] < 128) return;
          buf[j * 3] += er * f; buf[j * 3 + 1] += eg * f; buf[j * 3 + 2] += eb * f;
        };
        spread(1, 0, 7 / 16); spread(-1, 1, 3 / 16); spread(0, 1, 5 / 16); spread(1, 1, 1 / 16);
      }
      return idx;
    }
    const cache = new Map();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (d[i * 4 + 3] < 128) continue;
      const key = (d[i * 4] << 16) | (d[i * 4 + 1] << 8) | d[i * 4 + 2];
      let r = cache.get(key);
      if (!r) { r = nearest2(PX.toLab(d[i * 4], d[i * 4 + 1], d[i * 4 + 2])); cache.set(key, r); }
      let c = r[0];
      if (dither === 'bayer' && r[2] >= 0) {
        const t = r[1] / (r[1] + r[3] + 1e-9); // 0 = exactly c1, 0.5 = halfway
        if (t * 2 * amount > BAYER4[(y & 3) * 4 + (x & 3)]) c = r[2];
      }
      idx[i] = c;
    }
    return idx;
  };
  PX.indexedToImage = function (idx, w, h, pal) {
    const out = PX.makeImage(w, h), rgb = pal.map(PX.parseHex);
    for (let i = 0; i < w * h; i++) {
      const c = idx[i];
      if (c < 0 || !rgb[c]) continue;
      out.data[i * 4] = rgb[c][0]; out.data[i * 4 + 1] = rgb[c][1]; out.data[i * 4 + 2] = rgb[c][2]; out.data[i * 4 + 3] = 255;
    }
    return out;
  };

  // ------------------------------------------------------------------ cleanup (the "杂色" problem)
  // Colours used by fewer than minCount pixels are merged into their nearest kept colour.
  PX.mergeRare = function (idx, pal, minCount, protect) {
    const count = new Array(pal.length).fill(0);
    for (let i = 0; i < idx.length; i++) if (idx[i] >= 0) count[idx[i]]++;
    const labs = pal.map(PX.labOfHex);
    const protectedColors = new Set();
    if (protect) for (let i = 0; i < idx.length; i++) if (protect[i] && idx[i] >= 0) protectedColors.add(idx[i]);
    const keep = pal.map((_, c) => count[c] >= minCount || protectedColors.has(c));
    if (!keep.some(Boolean)) return 0;
    const map = pal.map((_, c) => {
      if (keep[c] || count[c] === 0) return c;
      let best = c, bd = Infinity;
      for (let k = 0; k < pal.length; k++) if (keep[k]) { const dd = PX.dist(labs[c], labs[k]); if (dd < bd) { bd = dd; best = k; } }
      return best;
    });
    let changed = 0;
    for (let i = 0; i < idx.length; i++) if (idx[i] >= 0 && map[idx[i]] !== idx[i]) { idx[i] = map[idx[i]]; changed++; }
    return changed;
  };
  // Small same-colour islands (<= maxSize px) are absorbed by the neighbour colour they touch most,
  // but only when that colour is perceptually close (<= maxDE), so eye highlights / pupils survive.
  PX.mergeIslands = function (idx, w, h, pal, maxSize, maxDE, protect) {
    const labs = pal.map(PX.labOfHex), seen = new Int32Array(w * h).fill(-1);
    let changed = 0;
    for (let s = 0; s < w * h; s++) {
      if (idx[s] < 0 || seen[s] >= 0) continue;
      const color = idx[s], comp = [s], stack = [s]; seen[s] = s;
      let prot = false, big = false;
      while (stack.length) {
        const p = stack.pop(), x = p % w, y = (p - x) / w;
        if (protect && protect[p]) prot = true;
        for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) {
          if (q < 0 || seen[q] === s || idx[q] !== color) continue;
          seen[q] = s; comp.push(q); stack.push(q);
          if (comp.length > maxSize) big = true;
        }
      }
      if (big || prot || comp.length > maxSize) continue;
      const touch = new Map();
      for (const p of comp) {
        const x = p % w, y = (p - x) / w;
        for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) {
          if (q < 0 || idx[q] < 0 || idx[q] === color) continue;
          touch.set(idx[q], (touch.get(idx[q]) || 0) + 1);
        }
      }
      let best = -1, bn = 0; for (const [c, n] of touch) if (n > bn || (n === bn && PX.dist(labs[c], labs[color]) < PX.dist(labs[best], labs[color]))) { bn = n; best = c; }
      if (best < 0 || PX.dist(labs[best], labs[color]) > maxDE) continue;
      for (const p of comp) idx[p] = best;
      changed += comp.length;
    }
    return changed;
  };
  PX.darkest = function (pal) {
    let best = -1, bl = Infinity; pal.forEach((h, i) => { const L = PX.labOfHex(h)[0]; if (L < bl) { bl = L; best = i; } }); return best;
  };
  // Dark pixels on the silhouette edge become one outline colour.
  PX.unifyOutline = function (idx, w, h, pal, outlineIdx, maxL) {
    const labs = pal.map(PX.labOfHex); let changed = 0;
    const edge = p => { const x = p % w, y = (p - x) / w; return x === 0 || y === 0 || x === w - 1 || y === h - 1 || idx[p - 1] < 0 || idx[p + 1] < 0 || idx[p - w] < 0 || idx[p + w] < 0; };
    const targets = [];
    for (let p = 0; p < w * h; p++) if (idx[p] >= 0 && idx[p] !== outlineIdx && labs[idx[p]][0] <= maxL && edge(p)) targets.push(p);
    for (const p of targets) { idx[p] = outlineIdx; changed++; }
    return changed;
  };
  // 1px outline outside the silhouette.
  PX.addOutline = function (idx, w, h, outlineIdx, diag) {
    const add = [];
    for (let p = 0; p < w * h; p++) {
      if (idx[p] >= 0) continue;
      const x = p % w, y = (p - x) / w;
      let hit = false;
      for (let dy = -1; dy <= 1 && !hit; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue; if (!diag && dx && dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && idx[ny * w + nx] >= 0 && idx[ny * w + nx] !== outlineIdx) { hit = true; break; }
      }
      if (hit) add.push(p);
    }
    for (const p of add) idx[p] = outlineIdx;
    return add.length;
  };
  // Removes redundant L-corner pixels from 1px outline strokes (pixel-perfect lines).
  PX.pixelPerfect = function (idx, w, h, outlineIdx) {
    let changed = 0;
    const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? -2 : idx[y * w + x]);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (at(x, y) !== outlineIdx) continue;
      const N = at(x, y - 1) === outlineIdx, S = at(x, y + 1) === outlineIdx, W = at(x - 1, y) === outlineIdx, E = at(x + 1, y) === outlineIdx;
      let corner = null;
      if (N && W && !S && !E && at(x - 1, y - 1) !== outlineIdx) corner = [[x + 1, y], [x, y + 1]];
      else if (N && E && !S && !W && at(x + 1, y - 1) !== outlineIdx) corner = [[x - 1, y], [x, y + 1]];
      else if (S && W && !N && !E && at(x - 1, y + 1) !== outlineIdx) corner = [[x + 1, y], [x, y - 1]];
      else if (S && E && !N && !W && at(x + 1, y + 1) !== outlineIdx) corner = [[x - 1, y], [x, y - 1]];
      if (!corner) continue;
      // the pixel's other two sides decide what replaces it: transparent if either is outside, else their colour
      const vals = corner.map(([cx, cy]) => at(cx, cy));
      if (vals.some(v => v === -2)) continue;
      const repl = vals.includes(-1) ? -1 : (vals[0] === vals[1] ? vals[0] : null);
      if (repl === null) continue;
      idx[y * w + x] = repl; changed++;
    }
    return changed;
  };
  PX.trimBounds = function (img) {
    const w = img.width, h = img.height, d = img.data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] >= 128) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) return null;
    return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  };
  PX.crop = function (img, r) {
    const out = PX.makeImage(r.w, r.h);
    for (let y = 0; y < r.h; y++) out.data.set(img.data.subarray(((r.y + y) * img.width + r.x) * 4, ((r.y + y) * img.width + r.x + r.w) * 4), y * r.w * 4);
    return out;
  };
  PX.scaleNearest = function (img, s) {
    const w = img.width * s, h = img.height * s, out = PX.makeImage(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const si = (((y / s) | 0) * img.width + ((x / s) | 0)) * 4, di = (y * w + x) * 4;
      out.data[di] = img.data[si]; out.data[di + 1] = img.data[si + 1]; out.data[di + 2] = img.data[si + 2]; out.data[di + 3] = img.data[si + 3];
    }
    return out;
  };

  // ------------------------------------------------------------------ full conversion pipeline
  PX.DEFAULTS = {
    mode: 'auto', snap: true, size: 8, offX: 0, offY: 0, width: 128, sample: 'dominant',
    bgAuto: true, bgTol: 8,
    paletteMode: 'auto', colors: 16, realColors: true, palette: [],
    dither: 'none', ditherAmt: 50,
    rareMerge: true, rarePct: 0.3, islandMerge: true, islandSize: 2, islandDE: 12,
    outlineUnify: false, outlineL: 30, pixelPerfect: false, addOutline: false, outlineColor: '',
    trim: false, sharpen: 0, colorBalance: 0, pinned: [],
  };
  // cell intervals for the chosen mode (auto = detected grid snapped to real edges)
  PX.geometry = function (img, o, grid) {
    if (o.mode === 'auto' && grid && grid.ok) {
      const snap = o.snap !== false && grid.profX;
      return { sizeX: grid.sizeX, sizeY: grid.sizeY, offX: grid.offX, offY: grid.offY,
        cx: snap ? PX.snapCells(grid.profX, grid.sizeX, grid.offX) : PX.cells(img.width, grid.sizeX, grid.offX),
        cy: snap ? PX.snapCells(grid.profY, grid.sizeY, grid.offY) : PX.cells(img.height, grid.sizeY, grid.offY) };
    }
    let sx, ox = 0, oy = 0;
    if (o.mode === 'size' || o.mode === 'auto') { sx = Math.max(1, +o.size || 8); ox = +o.offX || 0; oy = +o.offY || 0; }
    else sx = img.width / Math.max(4, +o.width || 128);
    return { sizeX: sx, sizeY: sx, offX: ox, offY: oy, cx: PX.cells(img.width, sx, ox), cy: PX.cells(img.height, sx, oy) };
  };
  PX.convert = function (img, opts, grid, protect) {
    const o = Object.assign({}, PX.DEFAULTS, opts);
    const geo = PX.geometry(img, o, grid);
    const srcImg = +o.sharpen > 0 ? PX.sharpen(img, Math.max(1, Math.round((geo.sizeX || 2) / 3)), o.sharpen / 100) : img;
    const small = PX.downsample(srcImg, geo.cx, geo.cy, o.sample);
    const w = small.width, h = small.height;
    const report = { w, h, geo, steps: [] };
    report.rawColors = PX.uniqueColors(small).length;
    if (o.bgAuto) { const m = PX.autoBackground(small, o.bgTol / 100); let n = 0; for (const v of m) n += v; PX.applyClear(small, m); report.steps.push(['去背景', n]); }
    let pal = o.paletteMode === 'custom' && o.palette.length ? o.palette.slice() : PX.dedupePalette((o.pinned || []).map(h => h.toLowerCase()).concat(PX.kmeansPalette(small, Math.max(2, +o.colors - (o.pinned || []).length), o.realColors, 7, (+o.colorBalance || 0) / 100)), 0.03);
    const prot = protect && protect.length === w * h ? protect : null;
    const idx = PX.fitPalette(small, pal, o.dither, o.ditherAmt / 100);
    if (o.rareMerge) { let op = 0; for (const v of idx) if (v >= 0) op++; report.steps.push(['合并低占比色', PX.mergeRare(idx, pal, Math.max(1, Math.ceil(op * o.rarePct / 100)), prot)]); }
    if (o.islandMerge) report.steps.push(['吸收杂色小块', PX.mergeIslands(idx, w, h, pal, +o.islandSize, o.islandDE / 100, prot) + PX.mergeIslands(idx, w, h, pal, +o.islandSize, o.islandDE / 100, prot)]);
    let outlineIdx = -1;
    if (o.outlineUnify || o.addOutline || o.pixelPerfect) {
      if (o.outlineColor && PX.parseHex(o.outlineColor)) { outlineIdx = pal.indexOf(o.outlineColor.toLowerCase()); if (outlineIdx < 0) { pal.push(o.outlineColor.toLowerCase()); outlineIdx = pal.length - 1; } }
      else outlineIdx = PX.darkest(pal);
    }
    if (o.outlineUnify && outlineIdx >= 0) report.steps.push(['统一描边', PX.unifyOutline(idx, w, h, pal, outlineIdx, o.outlineL / 100)]);
    if (o.addOutline && outlineIdx >= 0) report.steps.push(['外描边', PX.addOutline(idx, w, h, outlineIdx, false)]);
    if (o.pixelPerfect && outlineIdx >= 0) report.steps.push(['去 L 角', PX.pixelPerfect(idx, w, h, outlineIdx)]);
    // drop unused palette entries (keeps the palette honest)
    const used = new Array(pal.length).fill(false); for (const v of idx) if (v >= 0) used[v] = true;
    const remap = []; const finalPal = [];
    pal.forEach((hx, i) => { if (used[i] || o.paletteMode === 'custom') { remap[i] = finalPal.length; finalPal.push(hx); } });
    for (let i = 0; i < idx.length; i++) if (idx[i] >= 0) idx[i] = remap[idx[i]];
    let image = PX.indexedToImage(idx, w, h, finalPal);
    let cropRect = null;
    if (o.trim) { cropRect = PX.trimBounds(image); if (cropRect) image = PX.crop(image, cropRect); }
    report.colors = PX.colorStats(image).colors;
    return { image, idx, palette: finalPal, report, crop: cropRect };
  };

  // ------------------------------------------------------------------ GIF encoder (animated, transparency)
  PX.encodeGIF = function (frames, delaysMs, loop) {
    const w = frames[0].width, h = frames[0].height;
    const colors = new Map(); let transparent = false;
    for (const f of frames) for (let i = 0; i < f.data.length; i += 4) {
      if (f.data[i + 3] < 128) { transparent = true; continue; }
      const k = (f.data[i] << 16) | (f.data[i + 1] << 8) | f.data[i + 2];
      if (!colors.has(k)) colors.set(k, colors.size);
    }
    let pal = [...colors.keys()];
    let mapColor;
    const limit = transparent ? 255 : 256;
    if (pal.length > limit) {
      const merged = PX.makeImage(w, h * frames.length);
      frames.forEach((f, n) => merged.data.set(f.data, n * w * h * 4));
      const hexes = PX.kmeansPalette(merged, limit, true, 3);
      pal = hexes.map(hx => { const c = PX.parseHex(hx); return (c[0] << 16) | (c[1] << 8) | c[2]; });
      const labs = hexes.map(PX.labOfHex), cache = new Map();
      mapColor = k => { let v = cache.get(k); if (v === undefined) { const l = PX.toLab(k >> 16, (k >> 8) & 255, k & 255); let b = 0, bd = Infinity; labs.forEach((q, i) => { const dd = PX.dist(l, q); if (dd < bd) { bd = dd; b = i; } }); v = b; cache.set(k, v); } return v; };
    } else { const m = new Map(pal.map((k, i) => [k, i])); mapColor = k => m.get(k); }
    const off = transparent ? 1 : 0;
    const total = pal.length + off;
    let bits = 1; while ((1 << bits) < total) bits++;
    const tableSize = 1 << bits;
    const bytes = [];
    const u16 = v => { bytes.push(v & 255, (v >> 8) & 255); };
    for (const c of 'GIF89a') bytes.push(c.charCodeAt(0));
    u16(w); u16(h);
    bytes.push(0xF0 | (bits - 1), 0, 0);
    for (let i = 0; i < tableSize; i++) {
      if (transparent && i === 0) { bytes.push(0, 0, 0); continue; }
      const k = pal[i - off];
      if (k === undefined) bytes.push(0, 0, 0); else bytes.push(k >> 16, (k >> 8) & 255, k & 255);
    }
    if (frames.length > 1 || loop) { bytes.push(0x21, 0xFF, 11); for (const c of 'NETSCAPE2.0') bytes.push(c.charCodeAt(0)); bytes.push(3, 1); u16(0); bytes.push(0); }
    const minCode = Math.max(2, bits);
    frames.forEach((f, n) => {
      const delay = Math.round((delaysMs[n] || 100) / 10);
      bytes.push(0x21, 0xF9, 4, (2 << 2) | (transparent ? 1 : 0)); u16(delay); bytes.push(0, 0);
      bytes.push(0x2C); u16(0); u16(0); u16(w); u16(h); bytes.push(0);
      const ind = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) {
        if (f.data[i * 4 + 3] < 128) { ind[i] = 0; continue; }
        ind[i] = mapColor((f.data[i * 4] << 16) | (f.data[i * 4 + 1] << 8) | f.data[i * 4 + 2]) + off;
      }
      bytes.push(minCode);
      const data = lzw(ind, minCode);
      for (let i = 0; i < data.length; i += 255) { const chunk = data.slice(i, i + 255); bytes.push(chunk.length); for (const b of chunk) bytes.push(b); }
      bytes.push(0);
    });
    bytes.push(0x3B);
    return new Uint8Array(bytes);
  };
  function lzw(ind, minCode) {
    const clear = 1 << minCode, eoi = clear + 1;
    let size = minCode + 1, next = eoi + 1, dict = new Map();
    const out = []; let cur = 0, curBits = 0;
    const emit = code => { cur |= code << curBits; curBits += size; while (curBits >= 8) { out.push(cur & 255); cur >>>= 8; curBits -= 8; } };
    emit(clear);
    let prefix = ind[0];
    for (let i = 1; i < ind.length; i++) {
      const k = ind[i], key = prefix * 256 + k;
      const hit = dict.get(key);
      if (hit !== undefined) { prefix = hit; continue; }
      emit(prefix);
      if (next === 4096) { emit(clear); dict = new Map(); size = minCode + 1; next = eoi + 1; }
      else { if (next >= (1 << size)) size++; dict.set(key, next++); }
      prefix = k;
    }
    emit(prefix);
    if (next >= (1 << size) && size < 12) size++;
    emit(eoi);
    if (curBits > 0) out.push(cur & 255);
    return out;
  }

  // ------------------------------------------------------------------ ZIP (store) writer
  const CRC = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; }
  PX.crc32 = function (buf) { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  PX.zip = function (files) { // [{name, data: Uint8Array}]
    const enc = new TextEncoder(), parts = [], central = [];
    let offset = 0;
    const le = (n, b) => { const a = []; for (let i = 0; i < b; i++) a.push((n >>> (8 * i)) & 255); return a; };
    for (const f of files) {
      const name = enc.encode(f.name), crc = PX.crc32(f.data), size = f.data.length;
      const head = [0x50, 0x4b, 0x03, 0x04, ...le(20, 2), ...le(0x0800, 2), ...le(0, 2), ...le(0, 2), ...le(0x21, 2), ...le(crc, 4), ...le(size, 4), ...le(size, 4), ...le(name.length, 2), ...le(0, 2)];
      parts.push(new Uint8Array(head), name, f.data);
      central.push(new Uint8Array([0x50, 0x4b, 0x01, 0x02, ...le(20, 2), ...le(20, 2), ...le(0x0800, 2), ...le(0, 2), ...le(0, 2), ...le(0x21, 2), ...le(crc, 4), ...le(size, 4), ...le(size, 4), ...le(name.length, 2), ...le(0, 2), ...le(0, 2), ...le(0, 2), ...le(0, 2), ...le(0, 4), ...le(offset, 4)]), name);
      offset += head.length + name.length + size;
    }
    let csize = 0; for (const c of central) csize += c.length;
    const end = new Uint8Array([0x50, 0x4b, 0x05, 0x06, ...le(0, 2), ...le(0, 2), ...le(files.length, 2), ...le(files.length, 2), ...le(csize, 4), ...le(offset, 4), ...le(0, 2)]);
    const all = [...parts, ...central, end];
    let total = 0; for (const a of all) total += a.length;
    const out = new Uint8Array(total); let p = 0;
    for (const a of all) { out.set(a, p); p += a.length; }
    return out;
  };


  // ------------------------------------------------------------------ PXD: text pixel data (v1.3)
  // A plain-JSON, diff-friendly format that code / AI agents can read and write directly:
  // palette + one character per pixel ('.' = transparent), with layers, frames and free-form meta
  // (anchors such as the foot point, part names, fps ...). Opens in the editor like a project.
  PX.PXD_KEYS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ!#$%&()*+,-/:;<=>?@[]^_{|}~';
  const pxdHex = (d, i) => {
    const h = '#' + [d[i], d[i + 1], d[i + 2]].map(v => v.toString(16).padStart(2, '0')).join('');
    return d[i + 3] === 255 ? h : h + d[i + 3].toString(16).padStart(2, '0');
  };
  // doc: {w, h, name?, palette?, layers?, frames:[{dur?, name?, cels:[RGBA Uint8ClampedArray per layer]}], meta?}
  PX.toPXD = function (doc) {
    const w = doc.w, h = doc.h;
    const layers = (doc.layers && doc.layers.length ? doc.layers : [{ name: '图层 1', visible: true, opacity: 100 }]).map(l => ({ name: l.name, visible: l.visible !== false, opacity: l.opacity === undefined ? 100 : l.opacity }));
    const pal = (doc.palette || []).map(x => String(x).toLowerCase());
    const index = new Map(); pal.forEach((x, i) => { if (!index.has(x)) index.set(x, i); });
    for (const f of doc.frames) for (const c of f.cels) for (let i = 0; i < w * h * 4; i += 4) {
      if (!c[i + 3]) continue; const k = pxdHex(c, i); if (!index.has(k)) { index.set(k, pal.length); pal.push(k); }
    }
    const K = PX.PXD_KEYS, kw = pal.length <= K.length ? 1 : 2;
    if (pal.length > K.length * K.length) throw new Error('颜色太多（' + pal.length + '），PXD 最多 ' + K.length * K.length + ' 色');
    const code = i => kw === 1 ? K[i] : K[Math.floor(i / K.length)] + K[i % K.length];
    const blank = '.'.repeat(kw);
    const frames = doc.frames.map(f => {
      const o = { dur: f.dur || 120 }; if (f.name) o.name = f.name;
      o.cels = f.cels.map(c => {
        const rows = [];
        for (let y = 0; y < h; y++) { let r = ''; for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; r += c[i + 3] ? code(index.get(pxdHex(c, i))) : blank; } rows.push(r); }
        return rows;
      });
      return o;
    });
    const out = { format: 'pxd', v: 1, app: 'PixelWorkshop', name: doc.name || 'sprite', w, h, keyWidth: kw, transparent: '.', key: kw === 1 ? K.slice(0, pal.length) : K, palette: pal, layers, frames };
    if (doc.meta && Object.keys(doc.meta).length) out.meta = doc.meta;
    return out;
  };
  PX.fromPXD = function (j) {
    if (typeof j === 'string') j = JSON.parse(j);
    if (!j || j.format !== 'pxd') throw new Error('不是 PXD 像素数据（format 应为 "pxd"）');
    const w = j.w | 0, h = j.h | 0, kw = j.keyWidth || 1, K = j.key || PX.PXD_KEYS, T = j.transparent || '.';
    if (!(w > 0 && h > 0)) throw new Error('PXD 尺寸无效');
    const rgba = j.palette.map(x => { const m = /^#?([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(x); if (!m) throw new Error('色值无效：' + x); const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255, m[2] ? parseInt(m[2], 16) : 255]; });
    const lut = new Map();
    if (kw === 1) for (let i = 0; i < j.palette.length; i++) lut.set(K[i], i);
    else for (let i = 0; i < j.palette.length; i++) lut.set(K[Math.floor(i / K.length)] + K[i % K.length], i);
    const nL = (j.layers && j.layers.length) || (j.frames[0] && j.frames[0].cels.length) || 1;
    const layers = j.layers && j.layers.length ? j.layers.map(l => ({ name: l.name || '图层', visible: l.visible !== false, opacity: l.opacity === undefined ? 100 : l.opacity })) : Array.from({ length: nL }, (_, i) => ({ name: '图层 ' + (i + 1), visible: true, opacity: 100 }));
    const frames = j.frames.map((f, fi) => {
      const cels = [];
      for (let li = 0; li < layers.length; li++) {
        const c = new Uint8ClampedArray(w * h * 4), rows = f.cels[li] || [];
        for (let y = 0; y < Math.min(h, rows.length); y++) {
          const r = rows[y];
          for (let x = 0; x < w; x++) {
            const ch = r.substr(x * kw, kw); if (!ch || ch[0] === T) continue;
            const p = lut.get(ch); if (p === undefined) throw new Error(`第 ${fi + 1} 帧 图层 ${li + 1} 第 ${y + 1} 行有未知字符 "${ch}"`);
            c.set(rgba[p], (y * w + x) * 4);
          }
        }
        cels.push(c);
      }
      return { dur: f.dur || 120, name: f.name, cels };
    });
    const solid = j.palette.filter(x => x.length <= 7).map(x => x.toLowerCase());
    return { name: j.name || 'sprite', w, h, palette: solid, layers, frames, meta: j.meta || {} };
  };

  // pretty-print PXD: header fields one per line, one pixel row per line
  PX.pxdStringify = function (o) {
    const L = ['{'], keys = Object.keys(o).filter(k => k !== 'frames');
    keys.forEach(k => L.push('  ' + JSON.stringify(k) + ': ' + JSON.stringify(o[k]) + ','));
    L.push('  "frames": [');
    o.frames.forEach((f, fi) => {
      const hd = Object.assign({}, f); delete hd.cels;
      L.push('    {' + Object.keys(hd).map(k => JSON.stringify(k) + ': ' + JSON.stringify(hd[k])).join(', ') + (Object.keys(hd).length ? ', ' : '') + '"cels": [');
      f.cels.forEach((cel, ci) => {
        L.push('      [');
        cel.forEach((r, ri) => L.push('        ' + JSON.stringify(r) + (ri < cel.length - 1 ? ',' : '')));
        L.push('      ]' + (ci < f.cels.length - 1 ? ',' : ''));
      });
      L.push('    ]}' + (fi < o.frames.length - 1 ? ',' : ''));
    });
    L.push('  ]', '}');
    return L.join('\n') + '\n';
  };
  // flatten one frame of a doc (layer visibility + opacity), same rule as the editor
  PX.flattenFrame = function (doc, fi) {
    const w = doc.w, h = doc.h, out = new Uint8ClampedArray(w * h * 4);
    doc.layers.forEach((ly, li) => {
      if (!ly.visible) return; const src = doc.frames[fi].cels[li]; if (!src) return; const op = (ly.opacity === undefined ? 100 : ly.opacity) / 100;
      for (let i = 0; i < w * h * 4; i += 4) {
        const a = src[i + 3] / 255 * op; if (!a) continue;
        if (a >= 0.999) { out[i] = src[i]; out[i + 1] = src[i + 1]; out[i + 2] = src[i + 2]; out[i + 3] = 255; continue; }
        const ba = out[i + 3] / 255, na = a + ba * (1 - a);
        for (let k = 0; k < 3; k++) out[i + k] = (src[i + k] * a + out[i + k] * ba * (1 - a)) / na;
        out[i + 3] = na * 255;
      }
    });
    return PX.makeImage(w, h, out);
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = PX;
  root.PX = PX;
})(typeof globalThis !== 'undefined' ? globalThis : this);
