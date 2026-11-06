// ===================================================================== 像素工坊 · 编辑器 + 导出 + 帮助
const E = {
  doc: null, name: 'sprite', tool: 'pencil', primary: [26, 20, 32, 255], secondary: [244, 244, 244, 255],
  view: { s: 8, x: 0, y: 0 }, sel: null, selPath: null, float: null, clip: null, undo: [], redo: [],
  drag: null, hover: null, preview: null, playing: 0, space: false, off: document.createElement('canvas'), offPrev: document.createElement('canvas'),
};
const TOOL_NAMES = { pencil: '铅笔', eraser: '橡皮', dither: '抖动笔', fill: '填充', picker: '吸管', line: '直线', rect: '矩形', ellipse: '椭圆', gradient: '抖动渐变', select: '框选', wand: '魔棒', move: '移动', bgpick: '去底魔棒', replace: '换色' };
const edCv = $('edCanvas');
const hexOf = c => PX.hex(c[0], c[1], c[2]);
const rgbaOfHex = h => { const c = PX.parseHex(h); return [c[0], c[1], c[2], 255]; };

// ------------------------------------------------------------------ document
function blankCel(d) { return new Uint8ClampedArray(d.w * d.h * 4); }
function edNewDoc(w, h, img, palette, name) {
  w = Math.max(1, Math.min(1024, w | 0)); h = Math.max(1, Math.min(1024, h | 0));
  const d = { w, h, palette: palette || PX.PRESETS['Sweetie 16'].slice(), layers: [{ name: '图层 1', visible: true, opacity: 100 }], frames: [{ dur: 120, cels: [] }], L: 0, F: 0 };
  const c = new Uint8ClampedArray(w * h * 4); if (img) c.set(img.data.subarray(0, w * h * 4)); d.frames[0].cels.push(c);
  E.doc = d; E.meta = {}; E.name = name || 'sprite'; E.restore = null; E.sel = null; E.selPath = null; E.float = null; E.undo = []; E.redo = [];
  if (d.palette.length) { E.primary = rgbaOfHex(d.palette[PX.darkest(d.palette)] || d.palette[0]); }
  $('edEmpty').style.display = 'none';
  edPanels(); requestAnimationFrame(() => { edFit(); });
}
function edOpenImage(img, name) {
  if (img.width > 1024 || img.height > 1024) { toast('编辑器最大 1024×1024；大图请先在「转换」页处理', true); return; }
  const pal = PX.paletteFromImage(img, 64);
  edNewDoc(img.width, img.height, img, PX.uniqueColors(img).length <= 64 ? PX.sortPalette(pal) : pal, baseName(name)); setTab('edit');
}
const cel = (l, f) => E.doc.frames[f === undefined ? E.doc.F : f].cels[l === undefined ? E.doc.L : l];
function snapshot() {
  const d = E.doc;
  return { w: d.w, h: d.h, L: d.L, F: d.F, palette: d.palette.slice(), layers: d.layers.map(l => Object.assign({}, l)), frames: d.frames.map(f => ({ dur: f.dur, cels: f.cels.map(c => c.slice()) })) };
}
function pushUndo() { if (!E.doc) return; E.undo.push(snapshot()); if (E.undo.length > 60) E.undo.shift(); E.redo = []; }
function restoreSnap(s) { E.doc = s; E.doc.L = Math.min(s.L, s.layers.length - 1); E.doc.F = Math.min(s.F, s.frames.length - 1); setSel(null); edPanels(); edRender(); }
function edUndo() { commitFloat(); if (!E.undo.length) return toast('没有可撤销的操作'); E.redo.push(snapshot()); restoreSnap(E.undo.pop()); }
function edRedo() { commitFloat(); if (!E.redo.length) return; E.undo.push(snapshot()); restoreSnap(E.redo.pop()); }

// ------------------------------------------------------------------ compositing
function composite(f, withFloat) {
  const d = E.doc, out = new Uint8ClampedArray(d.w * d.h * 4);
  d.layers.forEach((ly, li) => {
    if (!ly.visible) return;
    let src = d.frames[f].cels[li];
    if (withFloat && E.float && li === d.L && f === d.F) src = floatApplied(src);
    const op = ly.opacity / 100;
    for (let i = 0; i < out.length; i += 4) {
      const a = src[i + 3] / 255 * op; if (a <= 0) continue;
      const ba = out[i + 3] / 255, oa = a + ba * (1 - a);
      for (let k = 0; k < 3; k++) out[i + k] = (src[i + k] * a + out[i + k] * ba * (1 - a)) / oa;
      out[i + 3] = oa * 255;
    }
  });
  return out;
}
function floatApplied(base) {
  const d = E.doc, F = E.float, out = base.slice();
  for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) {
    const i = y * d.w + x; if (!F.mask[i]) continue;
    const nx = x + F.dx, ny = y + F.dy; if (nx < 0 || ny < 0 || nx >= d.w || ny >= d.h) continue;
    const s = i * 4, t = (ny * d.w + nx) * 4; if (F.data[s + 3] === 0) continue;
    out[t] = F.data[s]; out[t + 1] = F.data[s + 1]; out[t + 2] = F.data[s + 2]; out[t + 3] = F.data[s + 3];
  }
  return out;
}
function commitFloat() {
  if (!E.float) return; const d = E.doc, F = E.float;
  d.frames[d.F].cels[d.L] = floatApplied(cel());
  const m = new Uint8Array(d.w * d.h);
  for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) if (F.mask[y * d.w + x]) { const nx = x + F.dx, ny = y + F.dy; if (nx >= 0 && ny >= 0 && nx < d.w && ny < d.h) m[ny * d.w + nx] = 1; }
  E.float = null; setSel(F.whole ? null : m); edPanels();
}

// ------------------------------------------------------------------ selection
function setSel(m) {
  E.sel = m; E.selPath = null;
  if (m) {
    const d = E.doc, p = new Path2D(); let any = false;
    for (let y = 0; y <= d.h; y++) for (let x = 0; x <= d.w; x++) {
      const a = x < d.w && y < d.h && m[y * d.w + x], up = x < d.w && y > 0 && m[(y - 1) * d.w + x], lf = x > 0 && y < d.h && m[y * d.w + x - 1];
      if (x < d.w && !!a !== !!up) { p.moveTo(x, y); p.lineTo(x + 1, y); }
      if (y < d.h && !!a !== !!lf) { p.moveTo(x, y); p.lineTo(x, y + 1); }
      if (a) any = true;
    }
    if (!any) { E.sel = null; } else E.selPath = p;
  }
  const b = selBounds(); $('edSelInfo').textContent = b ? `选区 ${b.w}×${b.h}` : '';
}
function selBounds(m) {
  m = m || E.sel; if (!m) return null; const d = E.doc; let x0 = d.w, y0 = d.h, x1 = -1, y1 = -1;
  for (let i = 0; i < m.length; i++) if (m[i]) { const x = i % d.w, y = (i - x) / d.w; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
const inSel = i => !E.sel || E.sel[i];

// ------------------------------------------------------------------ view
function edFit() {
  if (!E.doc) return; const r = edCv.getBoundingClientRect(); const d = E.doc;
  let s = Math.min((r.width - 40) / d.w, (r.height - 40) / d.h); s = s >= 1 ? Math.max(1, Math.floor(s)) : s;
  E.view = { s, x: Math.round((r.width - d.w * s) / 2), y: Math.round((r.height - d.h * s) / 2) }; edRender();
}
function edZoom(f, cx, cy) {
  const v = E.view, r = edCv.getBoundingClientRect(); if (cx === undefined) { cx = r.width / 2; cy = r.height / 2; }
  let ns = v.s * f; ns = ns >= 1 ? Math.round(ns) || 1 : ns; if (f > 1 && ns <= v.s) ns = v.s + 1; if (f < 1 && ns >= v.s) ns = Math.max(0.25, v.s - 1);
  ns = Math.max(0.25, Math.min(96, ns)); v.x = Math.round(cx - (cx - v.x) * ns / v.s); v.y = Math.round(cy - (cy - v.y) * ns / v.s); v.s = ns; edRender();
}
function edRender() {
  if (S.tab !== 'edit') return;
  const { w, h, dpr } = fitCanvas(edCv), ctx = edCv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = '#0f1214'; ctx.fillRect(0, 0, w, h);
  $('edZoomLbl').textContent = Math.round(E.view.s * 100) + '%';
  const d = E.doc; if (!d) return;
  const v = E.view, W = d.w * v.s, H = d.h * v.s; ctx.imageSmoothingEnabled = false;
  const comp = composite(d.F, true);
  E.off.width = d.w; E.off.height = d.h; E.off.getContext('2d').putImageData(new ImageData(comp, d.w, d.h), 0, 0);
  const tile = $('edTile').checked;
  if (tile) { ctx.globalAlpha = 0.5; for (let ty = -1; ty <= 1; ty++) for (let tx = -1; tx <= 1; tx++) if (tx || ty) ctx.drawImage(E.off, v.x + tx * W, v.y + ty * H, W, H); ctx.globalAlpha = 1; }
  ctx.fillStyle = checker(ctx); ctx.fillRect(v.x, v.y, W, H);
  if ($('edOnion').checked && d.frames.length > 1 && !E.playing) {
    const pf = (d.F - 1 + d.frames.length) % d.frames.length; E.offPrev.width = d.w; E.offPrev.height = d.h;
    E.offPrev.getContext('2d').putImageData(new ImageData(composite(pf, false), d.w, d.h), 0, 0);
    ctx.globalAlpha = 0.3; ctx.drawImage(E.offPrev, v.x, v.y, W, H); ctx.globalAlpha = 1;
  }
  ctx.drawImage(E.off, v.x, v.y, W, H);
  // preview pixels (shapes)
  if (E.preview && E.preview.length) { ctx.fillStyle = `rgba(${E.primary[0]},${E.primary[1]},${E.primary[2]},.85)`; for (const [x, y] of E.preview) ctx.fillRect(v.x + x * v.s, v.y + y * v.s, v.s, v.s); }
  // pixel grid
  if ($('edGrid').checked && v.s >= 6) {
    ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.lineWidth = 1; ctx.beginPath();
    const x0 = Math.max(0, Math.floor(-v.x / v.s)), x1 = Math.min(d.w, Math.ceil((w - v.x) / v.s)), y0 = Math.max(0, Math.floor(-v.y / v.s)), y1 = Math.min(d.h, Math.ceil((h - v.y) / v.s));
    for (let x = x0; x <= x1; x++) { const X = v.x + x * v.s + .5; ctx.moveTo(X, v.y + y0 * v.s); ctx.lineTo(X, v.y + y1 * v.s); }
    for (let y = y0; y <= y1; y++) { const Y = v.y + y * v.s + .5; ctx.moveTo(v.x + x0 * v.s, Y); ctx.lineTo(v.x + x1 * v.s, Y); }
    ctx.stroke();
  }
  ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.strokeRect(v.x - .5, v.y - .5, W + 1, H + 1);
  // selection (marching ants)
  const drawAnts = (path, dx, dy) => {
    ctx.save(); ctx.translate(v.x + dx * v.s, v.y + dy * v.s); ctx.scale(v.s, v.s); ctx.lineWidth = 1 / v.s;
    ctx.setLineDash([4 / v.s, 4 / v.s]); ctx.strokeStyle = '#000'; ctx.stroke(path);
    ctx.lineDashOffset = 4 / v.s; ctx.strokeStyle = '#fff'; ctx.stroke(path); ctx.restore();
  };
  if (E.float && E.float.path) drawAnts(E.float.path, E.float.dx, E.float.dy);
  else if (E.selPath) drawAnts(E.selPath, 0, 0);
  if (E.drag && E.drag.rect) { const r = E.drag.rect; ctx.setLineDash([4, 4]); ctx.strokeStyle = '#5fe0d0'; ctx.strokeRect(v.x + r.x * v.s + .5, v.y + r.y * v.s + .5, r.w * v.s, r.h * v.s); ctx.setLineDash([]); }
  if (E.drag && E.drag.gline) { const g = E.drag.gline; ctx.strokeStyle = '#5fe0d0'; ctx.beginPath(); ctx.moveTo(v.x + (g[0] + .5) * v.s, v.y + (g[1] + .5) * v.s); ctx.lineTo(v.x + (g[2] + .5) * v.s, v.y + (g[3] + .5) * v.s); ctx.stroke(); }
  // brush cursor
  if (E.hover && /pencil|eraser|dither/.test(E.tool)) {
    const n = +$('e_brush').value, o = Math.floor((n - 1) / 2);
    ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.strokeRect(v.x + (E.hover[0] - o) * v.s + .5, v.y + (E.hover[1] - o) * v.s + .5, n * v.s - 1, n * v.s - 1);
  }
}
window.edRender = edRender;

// ------------------------------------------------------------------ pixel ops
function getPx(c, x, y) { const i = (y * E.doc.w + x) * 4; return [c[i], c[i + 1], c[i + 2], c[i + 3]]; }
function setPx(c, x, y, col) {
  const d = E.doc; if (x < 0 || y < 0 || x >= d.w || y >= d.h || !inSel(y * d.w + x)) return;
  const i = (y * d.w + x) * 4; c[i] = col[0]; c[i + 1] = col[1]; c[i + 2] = col[2]; c[i + 3] = col[3];
}
const sameCol = (a, b) => (a[3] === 0 && b[3] === 0) || (a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3]);
function mirrors(x, y) {
  const d = E.doc, pts = [[x, y]];
  if ($('e_symX').checked) pts.push([d.w - 1 - x, y]);
  if ($('e_symY').checked) pts.push([x, d.h - 1 - y]);
  if ($('e_symX').checked && $('e_symY').checked) pts.push([d.w - 1 - x, d.h - 1 - y]);
  return pts;
}
function brushColor(x, y, right) {
  if (E.tool === 'eraser') return [0, 0, 0, 0];
  if (E.tool === 'dither') return ((x + y) & 1) ? (right ? E.primary : E.secondary) : (right ? E.secondary : E.primary);
  return right ? E.secondary : E.primary;
}
function stamp(x, y, right) {
  const n = +$('e_brush').value, o = Math.floor((n - 1) / 2), c = cel(), st = E.drag;
  for (const [mx, my] of mirrors(x, y)) for (let dy = 0; dy < n; dy++) for (let dx = 0; dx < n; dx++) {
    const px = mx - o + dx, py = my - o + dy; if (px < 0 || py < 0 || px >= E.doc.w || py >= E.doc.h) continue;
    const k = py * E.doc.w + px; if (st && st.orig && !st.orig.has(k)) st.orig.set(k, getPx(c, px, py));
    setPx(c, px, py, brushColor(px, py, right));
  }
}
function unstamp(x, y) { const c = cel(), st = E.drag; for (const [mx, my] of mirrors(x, y)) { const k = my * E.doc.w + mx; if (st.orig.has(k)) setPx(c, mx, my, st.orig.get(k)); } }
function linePts(x0, y0, x1, y1) {
  const pts = [], dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let err = dx + dy;
  for (;;) { pts.push([x0, y0]); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
  return pts;
}
function rectPts(x0, y0, x1, y1, filled) {
  const pts = [], ax = Math.min(x0, x1), bx = Math.max(x0, x1), ay = Math.min(y0, y1), by = Math.max(y0, y1);
  for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) if (filled || y === ay || y === by || x === ax || x === bx) pts.push([x, y]);
  return pts;
}
function ellipsePts(x0, y0, x1, y1, filled) { // Zingl: ellipse inside a rectangle (works for even sizes)
  const pts = []; if (x0 > x1) [x0, x1] = [x1, x0]; if (y0 > y1) [y0, y1] = [y1, y0];
  let a = x1 - x0, b = y1 - y0, b1 = b & 1; let dx = 4 * (1 - a) * b * b, dy = 4 * (b1 + 1) * a * a, err = dx + dy + b1 * a * a, e2;
  y0 += (b + 1) >> 1; y1 = y0 - b1; a *= 8 * a; b1 = 8 * b * b;
  const rows = new Map(); const add = (x, y) => { pts.push([x, y]); const r = rows.get(y); if (!r) rows.set(y, [x, x]); else { r[0] = Math.min(r[0], x); r[1] = Math.max(r[1], x); } };
  do { add(x1, y0); add(x0, y0); add(x0, y1); add(x1, y1); e2 = 2 * err; if (e2 <= dy) { y0++; y1--; err += dy += a; } if (e2 >= dx || 2 * err > dy) { x0++; x1--; err += dx += b1; } } while (x0 <= x1);
  while (y0 - y1 <= b) { add(x0 - 1, y0); add(x1 + 1, y0++); add(x0 - 1, y1); add(x1 + 1, y1--); }
  if (filled) for (const [y, [a0, a1]] of rows) for (let x = a0; x <= a1; x++) pts.push([x, y]);
  return pts;
}
function flood(c, x, y, tolDE, global) { // returns mask of matching pixels (exact or OKLab tolerance)
  const d = E.doc;
  if (tolDE > 0) return global ? globalMask(c, getPx(c, x, y), tolDE) : PX.floodMask({ width: d.w, height: d.h, data: c }, [y * d.w + x], tolDE, false);
  const ref = getPx(c, x, y), m = new Uint8Array(d.w * d.h);
  if (global) { for (let i = 0; i < m.length; i++) if (sameCol(ref, [c[i * 4], c[i * 4 + 1], c[i * 4 + 2], c[i * 4 + 3]])) m[i] = 1; return m; }
  const st = [y * d.w + x]; m[st[0]] = 1;
  while (st.length) { const p = st.pop(), px = p % d.w, py = (p - px) / d.w;
    for (const [nx, ny] of [[px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]]) { if (nx < 0 || ny < 0 || nx >= d.w || ny >= d.h) continue; const q = ny * d.w + nx; if (m[q]) continue; if (!sameCol(ref, getPx(c, nx, ny))) continue; m[q] = 1; st.push(q); } }
  return m;
}
function globalMask(c, ref, tol) {
  const m = new Uint8Array(E.doc.w * E.doc.h), rl = ref[3] < 128 ? null : PX.toLab(ref[0], ref[1], ref[2]);
  for (let i = 0; i < m.length; i++) { const a = c[i * 4 + 3] < 128; if (!rl) { m[i] = a ? 1 : 0; continue; } if (!a && PX.dist(PX.toLab(c[i * 4], c[i * 4 + 1], c[i * 4 + 2]), rl) <= tol) m[i] = 1; }
  return m;
}
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function gradientFill(x0, y0, x1, y1) {
  const d = E.doc, c = cel(); const region = E.sel || flood(c, x0, y0, 0, false);
  const vx = x1 - x0, vy = y1 - y0, L2 = vx * vx + vy * vy || 1;
  for (let i = 0; i < region.length; i++) {
    if (!region[i]) continue; const x = i % d.w, y = (i - x) / d.w;
    const t = Math.max(0, Math.min(1, ((x - x0) * vx + (y - y0) * vy) / L2));
    const th = (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
    setPx(c, x, y, t > th ? E.secondary : E.primary);
  }
}

// ------------------------------------------------------------------ pointer
function docPos(e) { const r = edCv.getBoundingClientRect(); return [Math.floor((e.clientX - r.left - E.view.x) / E.view.s), Math.floor((e.clientY - r.top - E.view.y) / E.view.s)]; }
const inDoc = (x, y) => E.doc && x >= 0 && y >= 0 && x < E.doc.w && y < E.doc.h;
edCv.addEventListener('contextmenu', e => e.preventDefault());
edCv.addEventListener('wheel', e => { e.preventDefault(); const r = edCv.getBoundingClientRect(); edZoom(e.deltaY < 0 ? 1.25 : 0.8, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
edCv.addEventListener('pointerdown', e => {
  if (!E.doc) return; edCv.setPointerCapture(e.pointerId); stopPlay();
  const [x, y] = docPos(e), right = e.button === 2;
  if (e.button === 1 || E.space) { E.drag = { pan: true, sx: e.clientX, sy: e.clientY, vx: E.view.x, vy: E.view.y }; return; }
  const t = E.tool, shift = e.shiftKey;
  if (t !== 'move' && E.float) commitFloat();
  if (t === 'pencil' || t === 'eraser' || t === 'dither') {
    pushUndo(); E.drag = { t, right, last: [x, y], pts: [[x, y]], orig: new Map() }; stamp(x, y, right);
  } else if (t === 'fill') {
    if (!inDoc(x, y)) return; pushUndo(); const c = cel(), m = flood(c, x, y, 0, $('e_global').checked), col = right ? E.secondary : E.primary;
    for (let i = 0; i < m.length; i++) if (m[i]) setPx(c, i % E.doc.w, (i / E.doc.w) | 0, col);
  } else if (t === 'picker') {
    if (!inDoc(x, y)) return; const comp = composite(E.doc.F, true), i = (y * E.doc.w + x) * 4;
    if (comp[i + 3] < 128) { toast('这里是透明的'); return; }
    const col = [comp[i], comp[i + 1], comp[i + 2], 255]; if (right) E.secondary = col; else E.primary = col; edColors();
  } else if (t === 'line' || t === 'rect' || t === 'ellipse') {
    E.drag = { t, x0: x, y0: y, x1: x, y1: y, right }; E.preview = [[x, y]];
  } else if (t === 'gradient') {
    if (!inDoc(x, y)) return; E.drag = { t, x0: x, y0: y, gline: [x, y, x, y] };
  } else if (t === 'select') {
    E.drag = { t, x0: x, y0: y, rect: { x, y, w: 1, h: 1 }, add: shift };
  } else if (t === 'wand' || t === 'bgpick') {
    if (!inDoc(x, y)) return; const c = cel(), m = flood(c, x, y, +$('e_tol').value / 100, false);
    if (t === 'wand') { if (shift && E.sel) for (let i = 0; i < m.length; i++) m[i] |= E.sel[i]; setSel(m); }
    else { pushUndo(); for (let i = 0; i < m.length; i++) if (m[i]) setPx(c, i % E.doc.w, (i / E.doc.w) | 0, [0, 0, 0, 0]); toast('已去除连通区域'); }
  } else if (t === 'replace') {
    if (!inDoc(x, y)) return; const ref = getPx(cel(), x, y); if (ref[3] === 0) { toast('点在透明处，没有颜色可换'); return; }
    pushUndo(); let n = 0; const to = right ? E.secondary : E.primary;
    const targets = $('e_allFrames').checked ? E.doc.frames.flatMap(f => f.cels) : [cel()];
    for (const c of targets) for (let i = 0; i < c.length; i += 4) if (c[i + 3] && c[i] === ref[0] && c[i + 1] === ref[1] && c[i + 2] === ref[2] && inSel(i / 4)) { c[i] = to[0]; c[i + 1] = to[1]; c[i + 2] = to[2]; n++; }
    toast(`${hexOf(ref)} → ${hexOf(to)}：替换 ${n} 像素`);
  } else if (t === 'move') {
    if (!E.float) {
      pushUndo(); const d = E.doc, c = cel(), whole = !E.sel, mask = E.sel ? E.sel.slice() : new Uint8Array(d.w * d.h).fill(1);
      const data = new Uint8ClampedArray(c.length);
      for (let i = 0; i < mask.length; i++) if (mask[i]) { data.set(c.subarray(i * 4, i * 4 + 4), i * 4); c[i * 4] = c[i * 4 + 1] = c[i * 4 + 2] = c[i * 4 + 3] = 0; }
      E.float = { data, mask, dx: 0, dy: 0, whole, path: E.selPath };
    }
    E.drag = { t, sx: x, sy: y, dx0: E.float.dx, dy0: E.float.dy };
  }
  edRender();
});
edCv.addEventListener('pointermove', e => {
  if (!E.doc) return; const [x, y] = docPos(e);
  E.hover = inDoc(x, y) ? [x, y] : null;
  if (inDoc(x, y)) { const comp = cel(), p = getPx(comp, x, y); $('edPos').textContent = `x ${x}, y ${y}  ${p[3] ? hexOf(p) : '透明'}`; } else $('edPos').textContent = '—';
  const g = E.drag;
  if (!g) { if (/pencil|eraser|dither/.test(E.tool)) edRender(); return; }
  if (g.pan) { E.view.x = g.vx + e.clientX - g.sx; E.view.y = g.vy + e.clientY - g.sy; edRender(); return; }
  if (g.t === 'pencil' || g.t === 'eraser' || g.t === 'dither') {
    if (x === g.last[0] && y === g.last[1]) return;
    const pp = g.t === 'pencil' && $('e_pp').checked && +$('e_brush').value === 1;
    for (const [px, py] of linePts(g.last[0], g.last[1], x, y).slice(1)) {
      stamp(px, py, g.right); g.pts.push([px, py]);
      if (pp && g.pts.length >= 3) { // remove L-shaped corners: pixel-perfect strokes
        const [a, b, c] = g.pts.slice(-3);
        if ((a[0] === b[0] || a[1] === b[1]) && (b[0] === c[0] || b[1] === c[1]) && Math.abs(a[0] - c[0]) === 1 && Math.abs(a[1] - c[1]) === 1) { unstamp(b[0], b[1]); g.orig.delete(b[1] * E.doc.w + b[0]); g.pts.splice(g.pts.length - 2, 1); }
      }
    }
    g.last = [x, y];
  } else if (g.t === 'line' || g.t === 'rect' || g.t === 'ellipse') {
    let x1 = x, y1 = y;
    if (e.shiftKey) {
      const dx = x - g.x0, dy = y - g.y0;
      if (g.t === 'line') { const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * Math.PI / 4, len = Math.max(Math.abs(dx), Math.abs(dy)); x1 = g.x0 + Math.round(Math.cos(ang) * len); y1 = g.y0 + Math.round(Math.sin(ang) * len); }
      else { const m = Math.max(Math.abs(dx), Math.abs(dy)); x1 = g.x0 + Math.sign(dx || 1) * m; y1 = g.y0 + Math.sign(dy || 1) * m; }
    }
    g.x1 = x1; g.y1 = y1;
    const f = $('e_filled').checked;
    E.preview = g.t === 'line' ? linePts(g.x0, g.y0, x1, y1) : g.t === 'rect' ? rectPts(g.x0, g.y0, x1, y1, f) : ellipsePts(g.x0, g.y0, x1, y1, f);
  } else if (g.t === 'gradient') { g.gline = [g.x0, g.y0, x, y]; }
  else if (g.t === 'select') { g.rect = { x: Math.min(g.x0, x), y: Math.min(g.y0, y), w: Math.abs(x - g.x0) + 1, h: Math.abs(y - g.y0) + 1 }; }
  else if (g.t === 'move') { E.float.dx = g.dx0 + x - g.sx; E.float.dy = g.dy0 + y - g.sy; }
  edRender();
});
function endDrag() {
  const g = E.drag; E.drag = null; if (!g || !E.doc) return;
  if (g.t === 'line' || g.t === 'rect' || g.t === 'ellipse') {
    pushUndo(); const c = cel(), col = g.right ? E.secondary : E.primary; for (const [x, y] of E.preview || []) setPx(c, x, y, col); E.preview = null;
  } else if (g.t === 'gradient') {
    pushUndo(); gradientFill(g.gline[0], g.gline[1], g.gline[2], g.gline[3]);
  } else if (g.t === 'select') {
    const d = E.doc, r = g.rect;
    if (r.w === 1 && r.h === 1 && !g.add) setSel(null);
    else { const m = g.add && E.sel ? E.sel.slice() : new Uint8Array(d.w * d.h); for (let y = Math.max(0, r.y); y < Math.min(d.h, r.y + r.h); y++) for (let x = Math.max(0, r.x); x < Math.min(d.w, r.x + r.w); x++) m[y * d.w + x] = 1; setSel(m); }
  }
  edRender(); edThumbs();
}
edCv.addEventListener('pointerup', endDrag); edCv.addEventListener('pointercancel', endDrag);
edCv.addEventListener('pointerleave', () => { E.hover = null; if (!E.drag) edRender(); });

// ------------------------------------------------------------------ tools & options
function setTool(t) {
  if (t !== 'move') commitFloat();
  E.tool = t; qa('#toolBar button').forEach(b => b.classList.toggle('on', b.dataset.tool === t));
  $('toolName').textContent = TOOL_NAMES[t];
  qa('#edOpts .opt').forEach(o => o.classList.toggle('show', o.dataset.for.split(' ').includes(t)));
  edCv.style.cursor = t === 'move' ? 'move' : 'crosshair'; edRender();
}
qa('#toolBar button').forEach(b => b.onclick = () => setTool(b.dataset.tool));
['edGrid', 'edTile', 'edOnion'].forEach(id => $(id).onchange = edRender);
$('edZoomIn').onclick = () => edZoom(1.5); $('edZoomOut').onclick = () => edZoom(1 / 1.5); $('edFit').onclick = edFit;
$('edUndo').onclick = edUndo; $('edRedo').onclick = edRedo;
$('edNew').onclick = () => {
  const b = document.createElement('div'); b.className = 'grid2';
  b.innerHTML = `<span>宽</span><input type="number" id="nW" value="64" min="1" max="1024"><span>高</span><input type="number" id="nH" value="64" min="1" max="1024">`;
  modal('新建画布', b, [{ label: '取消' }, { label: '新建', cls: 'accent', onClick: () => edNewDoc(+$('nW').value, +$('nH').value, null, null, 'sprite') }]);
};
$('edOpenImg').onclick = () => $('btnOpen').click();

// ------------------------------------------------------------------ colours & palette
function edColors() {
  $('colPrimary').style.background = `rgba(${E.primary.join(',')})`; $('colSecondary').style.background = `rgba(${E.secondary.join(',')})`;
  $('colPick').value = hexOf(E.primary);
  const ph = hexOf(E.primary), sh = hexOf(E.secondary);
  qa('#edPal .sw').forEach(s => { s.classList.toggle('cur', s.dataset.hex === ph); s.classList.toggle('cur2', s.dataset.hex === sh); });
}
$('colPick').oninput = () => { E.primary = rgbaOfHex($('colPick').value); edColors(); };
$('colPrimary').onclick = () => $('colPick').click();
$('colSecondary').onclick = () => { [E.primary, E.secondary] = [E.secondary, E.primary]; edColors(); };
$('colSwap').onclick = () => { [E.primary, E.secondary] = [E.secondary, E.primary]; edColors(); };
function edPalette() {
  const box = $('edPal'); box.innerHTML = ''; if (!E.doc) return;
  E.doc.palette.forEach((hx, i) => {
    const s = document.createElement('div'); s.className = 'sw'; s.style.background = hx; s.dataset.hex = hx; s.title = `${hx}\n左键主色 · 右键副色 · 双击改色 · Alt+点击删除`;
    s.onclick = e => { if (e.altKey) { E.doc.palette.splice(i, 1); edPalette(); return; } E.primary = rgbaOfHex(hx); edColors(); };
    s.oncontextmenu = e => { e.preventDefault(); E.secondary = rgbaOfHex(hx); edColors(); };
    s.ondblclick = () => editPaletteColor(i);
    box.appendChild(s);
  });
  edColors();
}
function editPaletteColor(i) {
  const old = E.doc.palette[i], inp = $('palEditor'); inp.value = old;
  inp.onchange = () => {
    const nw = inp.value.toLowerCase(); if (nw === old) return; pushUndo(); E.doc.palette[i] = nw;
    let n = 0;
    if ($('palLink').checked) { const a = PX.parseHex(old), b = PX.parseHex(nw); for (const f of E.doc.frames) for (const c of f.cels) for (let k = 0; k < c.length; k += 4) if (c[k + 3] && c[k] === a[0] && c[k + 1] === a[1] && c[k + 2] === a[2]) { c[k] = b[0]; c[k + 1] = b[1]; c[k + 2] = b[2]; n++; } }
    if (hexOf(E.primary) === old) E.primary = rgbaOfHex(nw);
    edPalette(); edRender(); edThumbs(); toast(`${old} → ${nw}` + ($('palLink').checked ? `，画面替换 ${n} 像素` : ''));
  };
  inp.click();
}
$('edPalAdd').onclick = () => { if (!E.doc) return; const h = hexOf(E.primary); if (!E.doc.palette.includes(h)) E.doc.palette.push(h); edPalette(); };
$('edPalExtract').onclick = () => {
  if (!E.doc) return; const all = PX.makeImage(E.doc.w, E.doc.h * E.doc.frames.length);
  E.doc.frames.forEach((f, i) => all.data.set(composite(i, false), i * E.doc.w * E.doc.h * 4));
  E.doc.palette = PX.sortPalette(PX.paletteFromImage(all, 64)); edPalette(); toast(`提取 ${E.doc.palette.length} 色`);
};
$('edPalSnap').onclick = () => {
  if (!E.doc || !E.doc.palette.length) return; commitFloat(); pushUndo(); let n = 0;
  for (const f of E.doc.frames) {
    const c = f.cels[E.doc.L], img = PX.makeImage(E.doc.w, E.doc.h, c), idx = PX.fitPalette(img, E.doc.palette, 'none', 0), out = PX.indexedToImage(idx, E.doc.w, E.doc.h, E.doc.palette);
    for (let i = 0; i < c.length; i += 4) if (c[i + 3] >= 128 && (c[i] !== out.data[i] || c[i + 1] !== out.data[i + 1] || c[i + 2] !== out.data[i + 2])) n++;
    f.cels[E.doc.L] = out.data;
  }
  edRender(); edThumbs(); toast(`当前图层已吸附到色板（${n} 像素改变）`);
};
$('edPalImport').onclick = async () => {
  if (!E.doc) return; const [f] = await pickFile($('filePal')); if (!f) return;
  const p = await importPaletteFile(f); if (!p.length) return toast('没有识别到颜色', true);
  E.doc.palette = p; edPalette(); toast(`导入 ${p.length} 色`);
};

// ------------------------------------------------------------------ selection & canvas commands
function requireDoc() { if (!E.doc) { toast('先打开或新建一张图', true); return false; } return true; }
function selectAll() { if (!requireDoc()) return; commitFloat(); setSel(new Uint8Array(E.doc.w * E.doc.h).fill(1)); edRender(); }
function selectNone() { if (!E.doc) return; commitFloat(); setSel(null); edRender(); }
function deleteSel() { if (!requireDoc() || (!E.sel && !E.float)) return; if (E.float) { E.float = null; setSel(null); edRender(); return; } pushUndo(); const c = cel(); for (let i = 0; i < E.sel.length; i++) if (E.sel[i]) c[i * 4 + 3] = c[i * 4] = c[i * 4 + 1] = c[i * 4 + 2] = 0; edRender(); edThumbs(); }
function copySel(cut) {
  if (!requireDoc()) return; commitFloat(); const d = E.doc, b = selBounds() || { x: 0, y: 0, w: d.w, h: d.h }, c = cel();
  const data = new Uint8ClampedArray(b.w * b.h * 4);
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) { const i = (b.y + y) * d.w + b.x + x; if (!E.sel || E.sel[i]) data.set(c.subarray(i * 4, i * 4 + 4), (y * b.w + x) * 4); }
  E.clip = { x: b.x, y: b.y, w: b.w, h: b.h, data }; if (cut) deleteSel(); toast(cut ? '已剪切' : '已复制');
}
function pasteClip(clip) {
  if (!requireDoc() || !clip) return; commitFloat(); pushUndo(); const d = E.doc;
  const data = new Uint8ClampedArray(d.w * d.h * 4), mask = new Uint8Array(d.w * d.h);
  const bx = Math.min(clip.x, Math.max(0, d.w - clip.w)), by = Math.min(clip.y, Math.max(0, d.h - clip.h));
  for (let y = 0; y < clip.h; y++) for (let x = 0; x < clip.w; x++) { const X = bx + x, Y = by + y; if (X >= d.w || Y >= d.h) continue; const i = Y * d.w + X; data.set(clip.data.subarray((y * clip.w + x) * 4, (y * clip.w + x) * 4 + 4), i * 4); mask[i] = 1; }
  setSel(mask); E.float = { data, mask, dx: 0, dy: 0, whole: false, path: E.selPath }; setTool('move'); edRender(); toast('已粘贴：拖动放置，Enter 确认');
}
window.edPasteImage = img => { if (!E.doc) { edOpenImage(img, '剪贴板'); return; } pasteClip({ x: 0, y: 0, w: img.width, h: img.height, data: img.data }); };
function selToLayer() {
  if (!requireDoc()) return; commitFloat(); if (!E.sel) return toast('先用框选/魔棒选出要单独处理的部位', true);
  pushUndo(); const d = E.doc, c = cel(), n = blankCel(d);
  for (let i = 0; i < E.sel.length; i++) if (E.sel[i]) { n.set(c.subarray(i * 4, i * 4 + 4), i * 4); c[i * 4] = c[i * 4 + 1] = c[i * 4 + 2] = c[i * 4 + 3] = 0; }
  d.layers.splice(d.L + 1, 0, { name: '部位 ' + (d.layers.length + 1), visible: true, opacity: 100 });
  d.frames.forEach((f, fi) => f.cels.splice(d.L + 1, 0, fi === d.F ? n : blankCel(d)));
  d.L++; edPanels(); edRender(); toast('选区已移到新图层：可以单独重画/隐藏对比');
}
function cropTo(b) {
  const d = E.doc; pushUndo();
  for (const f of d.frames) f.cels = f.cels.map(c => { const n = new Uint8ClampedArray(b.w * b.h * 4); for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) { const sx = b.x + x, sy = b.y + y; if (sx < 0 || sy < 0 || sx >= d.w || sy >= d.h) continue; n.set(c.subarray((sy * d.w + sx) * 4, (sy * d.w + sx) * 4 + 4), (y * b.w + x) * 4); } return n; });
  d.w = b.w; d.h = b.h; setSel(null); edPanels(); edFit();
}
function flip(horizontal) {
  if (!requireDoc()) return; commitFloat(); pushUndo(); const d = E.doc;
  const b = selBounds() || { x: 0, y: 0, w: d.w, h: d.h }, targets = E.sel ? [cel()] : d.frames.flatMap(f => f.cels);
  for (const c of targets) {
    const src = c.slice();
    for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
      const sx = horizontal ? b.x + b.w - 1 - x : b.x + x, sy = horizontal ? b.y + y : b.y + b.h - 1 - y, tx = b.x + x, ty = b.y + y;
      if (E.sel && !(E.sel[sy * d.w + sx] && E.sel[ty * d.w + tx])) continue;
      c.set(src.subarray((sy * d.w + sx) * 4, (sy * d.w + sx) * 4 + 4), (ty * d.w + tx) * 4);
    }
  }
  edRender(); edThumbs();
}
$('selAll').onclick = selectAll; $('selNone').onclick = selectNone; $('selDel').onclick = deleteSel; $('selToLayer').onclick = selToLayer;
$('selCrop').onclick = () => { if (!requireDoc()) return; commitFloat(); const b = selBounds(); if (!b) return toast('先建立选区', true); cropTo(b); };
$('flipH').onclick = () => flip(true); $('flipV').onclick = () => flip(false);
$('cvTrim').onclick = () => {
  if (!requireDoc()) return; commitFloat(); const d = E.doc, m = new Uint8Array(d.w * d.h);
  for (const f of d.frames) for (const c of f.cels) for (let i = 0; i < m.length; i++) if (c[i * 4 + 3]) m[i] = 1;
  const b = selBounds(m); if (!b) return toast('画布是空的'); cropTo(b); toast(`已裁到 ${b.w}×${b.h}`);
};
$('cvResize').onclick = () => {
  if (!requireDoc()) return; commitFloat(); let anchor = [1, 1];
  const b = document.createElement('div');
  b.innerHTML = `<div class="grid2"><span>宽</span><input type="number" id="rW" value="${E.doc.w}" min="1" max="1024"><span>高</span><input type="number" id="rH" value="${E.doc.h}" min="1" max="1024"><span>锚点</span><div class="anchors" id="rA"></div><span>整数放大</span><select id="rS"><option value="1">不放大（只改画布）</option><option value="2">×2</option><option value="3">×3</option><option value="4">×4</option></select></div>`;
  const drawA = () => { const a = b.querySelector('#rA'); a.innerHTML = ''; for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) { const x = document.createElement('button'); x.textContent = i === anchor[0] && j === anchor[1] ? '●' : '·'; x.onclick = () => { anchor = [i, j]; drawA(); }; a.appendChild(x); } };
  drawA();
  modal('画布大小', b, [{ label: '取消' }, { label: '应用', cls: 'accent', onClick: () => {
    const s = +$('rS').value, d = E.doc;
    if (s > 1) { if (d.w * s > 1024 || d.h * s > 1024) { toast('放大后超过 1024', true); return false; } pushUndo(); for (const f of d.frames) f.cels = f.cels.map(c => PX.scaleNearest(PX.makeImage(d.w, d.h, c), s).data); d.w *= s; d.h *= s; edPanels(); edFit(); return; }
    const W = Math.max(1, Math.min(1024, +$('rW').value)), H = Math.max(1, Math.min(1024, +$('rH').value));
    cropTo({ x: -Math.round((W - d.w) * anchor[0] / 2), y: -Math.round((H - d.h) * anchor[1] / 2), w: W, h: H });
  } }]);
};

// ------------------------------------------------------------------ layers & frames
function thumbInto(cv, data, w, h) { cv.width = w; cv.height = h; cv.getContext('2d').putImageData(new ImageData(data, w, h), 0, 0); }
function edLayers() {
  const box = $('layerList'); box.innerHTML = ''; if (!E.doc) return; const d = E.doc;
  for (let li = d.layers.length - 1; li >= 0; li--) {
    const ly = d.layers[li], row = document.createElement('div'); row.className = 'ly' + (li === d.L ? ' cur' : '');
    const eye = document.createElement('span'); eye.className = 'eye' + (ly.visible ? '' : ' off'); eye.textContent = '👁'; eye.title = '显示/隐藏';
    eye.onclick = e => { e.stopPropagation(); ly.visible = !ly.visible; edLayers(); edRender(); edThumbs(); };
    const tc = document.createElement('canvas'); thumbInto(tc, d.frames[d.F].cels[li].slice(), d.w, d.h);
    const nm = document.createElement('span'); nm.textContent = ly.name; nm.style.flex = '1';
    row.append(eye, tc, nm);
    row.onclick = () => { commitFloat(); d.L = li; edLayers(); edRender(); };
    row.ondblclick = () => { const inp = document.createElement('input'); inp.type = 'text'; inp.value = ly.name; inp.style.width = '100%'; modal('重命名图层', inp, [{ label: '取消' }, { label: '确定', cls: 'accent', onClick: () => { ly.name = inp.value || ly.name; edLayers(); } }]); };
    box.appendChild(row);
  }
  $('lyOpacity').value = d.layers[d.L].opacity; $('lyOpacity').dispatchEvent(new Event('input'));
}
function edFrames() {
  const box = $('frameList'); box.innerHTML = ''; if (!E.doc) return; const d = E.doc;
  d.frames.forEach((f, fi) => {
    const el = document.createElement('div'); el.className = 'fr' + (fi === d.F ? ' cur' : '');
    const tc = document.createElement('canvas'); thumbInto(tc, composite(fi, false), d.w, d.h);
    const lb = document.createElement('span'); lb.textContent = `${fi + 1} · ${f.dur}ms`;
    el.append(tc, lb); el.onclick = () => { stopPlay(); commitFloat(); d.F = fi; edPanels(); edRender(); };
    box.appendChild(el);
  });
  $('frDur').value = d.frames[d.F].dur;
}
const edThumbs = debounce(() => { if (E.doc) { edLayers(); edFrames(); } }, 250);
function edPanels() { edLayers(); edFrames(); edPalette(); $('edSize').textContent = E.doc ? `${E.doc.w} × ${E.doc.h} · ${E.doc.layers.length} 层 · ${E.doc.frames.length} 帧` : ''; }
$('lyAdd').onclick = () => { if (!requireDoc()) return; commitFloat(); pushUndo(); const d = E.doc; d.layers.splice(d.L + 1, 0, { name: '图层 ' + (d.layers.length + 1), visible: true, opacity: 100 }); d.frames.forEach(f => f.cels.splice(d.L + 1, 0, blankCel(d))); d.L++; edPanels(); edRender(); };
$('lyDup').onclick = () => { if (!requireDoc()) return; commitFloat(); pushUndo(); const d = E.doc; d.layers.splice(d.L + 1, 0, Object.assign({}, d.layers[d.L], { name: d.layers[d.L].name + ' 副本' })); d.frames.forEach(f => f.cels.splice(d.L + 1, 0, f.cels[d.L].slice())); d.L++; edPanels(); edRender(); };
$('lyDel').onclick = () => { if (!requireDoc()) return; const d = E.doc; if (d.layers.length < 2) return toast('至少保留一个图层'); commitFloat(); pushUndo(); d.layers.splice(d.L, 1); d.frames.forEach(f => f.cels.splice(d.L, 1)); d.L = Math.max(0, d.L - 1); edPanels(); edRender(); };
function moveLayer(dir) { if (!requireDoc()) return; const d = E.doc, j = d.L + dir; if (j < 0 || j >= d.layers.length) return; commitFloat(); pushUndo(); [d.layers[d.L], d.layers[j]] = [d.layers[j], d.layers[d.L]]; d.frames.forEach(f => { [f.cels[d.L], f.cels[j]] = [f.cels[j], f.cels[d.L]]; }); d.L = j; edPanels(); edRender(); }
$('lyUp').onclick = () => moveLayer(1); $('lyDown').onclick = () => moveLayer(-1);
$('lyMerge').onclick = () => {
  if (!requireDoc()) return; const d = E.doc; if (d.L === 0) return toast('已经是最底层'); commitFloat(); pushUndo();
  const op = d.layers[d.L].opacity / 100;
  d.frames.forEach(f => { const top = f.cels[d.L], bot = f.cels[d.L - 1]; for (let i = 0; i < top.length; i += 4) { const a = top[i + 3] / 255 * op; if (a <= 0 || !d.layers[d.L].visible) continue; const ba = bot[i + 3] / 255, oa = a + ba * (1 - a); for (let k = 0; k < 3; k++) bot[i + k] = (top[i + k] * a + bot[i + k] * ba * (1 - a)) / oa; bot[i + 3] = oa * 255; } f.cels.splice(d.L, 1); });
  d.layers.splice(d.L, 1); d.L--; edPanels(); edRender();
};
$('lyOpacity').addEventListener('input', () => { if (!E.doc) return; E.doc.layers[E.doc.L].opacity = +$('lyOpacity').value; edRender(); });
$('frAdd').onclick = () => { if (!requireDoc()) return; commitFloat(); pushUndo(); const d = E.doc, f = d.frames[d.F]; d.frames.splice(d.F + 1, 0, { dur: f.dur, cels: f.cels.map(c => c.slice()) }); d.F++; edPanels(); edRender(); };
$('frDel').onclick = () => { if (!requireDoc()) return; const d = E.doc; if (d.frames.length < 2) return toast('至少保留一帧'); commitFloat(); pushUndo(); d.frames.splice(d.F, 1); d.F = Math.max(0, d.F - 1); edPanels(); edRender(); };
function moveFrame(dir) { if (!requireDoc()) return; const d = E.doc, j = d.F + dir; if (j < 0 || j >= d.frames.length) return; commitFloat(); pushUndo(); [d.frames[d.F], d.frames[j]] = [d.frames[j], d.frames[d.F]]; d.F = j; edPanels(); edRender(); }
$('frLeft').onclick = () => moveFrame(-1); $('frRight').onclick = () => moveFrame(1);
$('frDur').onchange = () => { if (!E.doc) return; E.doc.frames[E.doc.F].dur = Math.max(20, +$('frDur').value || 100); edFrames(); };
function stopPlay() { if (E.playing) { clearTimeout(E.playing); E.playing = 0; $('frPlay').textContent = '▶ 播放'; edRender(); } }
$('frPlay').onclick = () => {
  if (!requireDoc()) return; if (E.playing) return stopPlay(); commitFloat();
  if (E.doc.frames.length < 2) return toast('只有一帧，先「＋复制帧」再改动');
  $('frPlay').textContent = '■ 停止';
  const step = () => { const d = E.doc; d.F = (d.F + 1) % d.frames.length; edRender(); E.playing = setTimeout(step, d.frames[d.F].dur); };
  E.playing = setTimeout(step, E.doc.frames[E.doc.F].dur);
};

// ------------------------------------------------------------------ export / project
function b64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
function unb64(s) { const b = atob(s), u = new Uint8ClampedArray(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
function frameImage(fi) { return PX.makeImage(E.doc.w, E.doc.h, composite(fi, false)); }

// v1.3: PXD text pixel data (for code / AI agents) + project files, opened from anywhere
function edOpenProjectText(txt, fname) {
  const j = JSON.parse(txt);
  if (j && j.format === 'pxd') {
    const doc = PX.fromPXD(j);
    if (doc.w > 1024 || doc.h > 1024) throw new Error('编辑器最大 1024×1024');
    edNewDoc(doc.w, doc.h, null, doc.palette.length ? doc.palette : PX.sortPalette(PX.paletteFromImage(PX.flattenFrame(doc, 0), 64)), doc.name);
    const d = E.doc; d.layers = doc.layers; d.frames = doc.frames.map(f => ({ dur: f.dur, cels: f.cels })); d.L = 0; d.F = 0; E.meta = doc.meta || {};
  } else if (j && j.app === 'PixelWorkshop' && j.frames) {
    edNewDoc(j.w, j.h, null, j.palette, j.name);
    const d = E.doc; d.layers = j.layers; d.frames = j.frames.map(fr => ({ dur: fr.dur, cels: fr.cels.map(unb64) })); d.L = 0; d.F = 0; E.meta = j.meta || {};
  } else throw new Error('不是像素工坊项目或 PXD 像素数据');
  setTab('edit'); edPanels(); edRender(); requestAnimationFrame(() => edFit());
  const n = E.doc.frames.length, l = E.doc.layers.length;
  toast(`已打开 ${fname || E.name}：${E.doc.w}×${E.doc.h}，${l} 层，${n} 帧`);
}
async function edOpenProjectFile(f) {
  try { edOpenProjectText(await readText(f), f.name); } catch (e) { toast('打开失败：' + e.message, true); }
}
function pxdText(obj) { return PX.pxdStringify(obj); }
function edToPXD(name) { const d = E.doc; return PX.toPXD({ w: d.w, h: d.h, name, palette: d.palette, layers: d.layers, frames: d.frames, meta: E.meta || {} }); }
function exportDialog() {
  const inEdit = S.tab === 'edit' && E.doc;
  if (!inEdit && !S.result) return toast('没有可导出的内容：先载入图片或打开编辑器', true);
  const name = inEdit ? E.name : baseName(S.srcName) + '_pixel';
  const pal = inEdit ? E.doc.palette : S.result.palette;
  const b = document.createElement('div');
  b.innerHTML = `<div class="row"><span>放大倍率（最近邻，像素不糊）</span><select id="xS">${[1, 2, 3, 4, 5, 6, 8].map(s => `<option ${s === 4 ? 'selected' : ''}>${s}</option>`).join('')}</select></div><div class="expgrid" id="xG"></div>`;
  const G = b.querySelector('#xG'); const sc = () => +b.querySelector('#xS').value;
  const add = (label, sub, fn) => { const x = document.createElement('button'); x.innerHTML = `${label}<small>${sub}</small>`; x.onclick = async () => { commitFloat(); await fn(); }; G.appendChild(x); };
  if (inEdit) {
    add('PNG · 当前帧', `${E.doc.w}×${E.doc.h}`, async () => download(`${name}_f${E.doc.F + 1}_${sc()}x.png`, await pngBlob(PX.scaleNearest(frameImage(E.doc.F), sc()))));
    if (E.restore && E.restore.w === E.doc.w && E.restore.h === E.doc.h) add('原图尺寸 PNG · 当前帧', `${E.restore.W}×${E.restore.H}，直接替换原贴图`, async () => download(`${name}_原尺寸.png`, await pngBlob(PX.restoreToSource(frameImage(E.doc.F), E.restore.geo, E.restore.crop, E.restore.W, E.restore.H))));
    add('精灵表 PNG', `${E.doc.frames.length} 帧横排`, async () => { const d = E.doc, sh = PX.makeImage(d.w * d.frames.length, d.h); d.frames.forEach((f, fi) => { const c = composite(fi, false); for (let y = 0; y < d.h; y++) sh.data.set(c.subarray(y * d.w * 4, (y + 1) * d.w * 4), (y * sh.width + fi * d.w) * 4); }); download(`${name}_sheet_${sc()}x.png`, await pngBlob(PX.scaleNearest(sh, sc()))); });
    add('GIF 动画', '透明背景 · 按帧时长', () => { const d = E.doc; download(`${name}_${sc()}x.gif`, PX.encodeGIF(d.frames.map((f, fi) => PX.scaleNearest(frameImage(fi), sc())), d.frames.map(f => f.dur), true), 'image/gif'); });
    add('逐帧 PNG（ZIP）', '每帧一张', async () => { const files = []; for (let fi = 0; fi < E.doc.frames.length; fi++) files.push({ name: `${name}_${String(fi + 1).padStart(2, '0')}.png`, data: await pngBytes(PX.scaleNearest(frameImage(fi), sc())) }); download(`${name}_frames.zip`, PX.zip(files), 'application/zip'); });
    add('保存项目 .json', '图层/帧/色板完整保存', () => { const d = E.doc; download(`${name}.pxw.json`, JSON.stringify({ app: 'PixelWorkshop', v: 1, name, w: d.w, h: d.h, palette: d.palette, layers: d.layers, frames: d.frames.map(f => ({ dur: f.dur, cels: f.cels.map(c => b64(new Uint8Array(c.buffer))) })) }), 'application/json'); });
    add('打开项目 / PXD', '.pxw.json 或 .pxd.json（也可直接拖进窗口）', async () => { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json'; const [f] = await pickFile(inp); if (!f) return; closeModal(); await edOpenProjectFile(f); });
    add('像素数据 .pxd.json', '给代码 / AI 读写：色板 + 每像素一个字符，含图层、帧、锚点', () => download(`${name}.pxd.json`, pxdText(edToPXD(name)), 'application/json'));
  } else {
    add('PNG', `${S.result.image.width}×${S.result.image.height}`, async () => download(`${name}_${sc()}x.png`, await pngBlob(PX.scaleNearest(S.result.image, sc()))));
    add('像素数据 .pxd.json', '给代码 / AI 读写（1 倍像素，色板 + 字符网格）', () => { const im = S.result.image, g = S.result.report && S.result.report.geo; download(`${name}.pxd.json`, pxdText(PX.toPXD({ w: im.width, h: im.height, name, palette: S.result.palette, frames: [{ dur: 120, cels: [im.data] }], meta: { source: S.srcName || '', block: g ? +(+g.sizeX).toFixed(3) : null } })), 'application/json'); });
  }
  add('色板 .gpl', `GIMP / Aseprite / Krita（${pal.length} 色）`, () => download(`${name}.gpl`, PX.paletteToGPL(pal, name), 'text/plain'));
  add('色板 .hex', 'Lospec 格式', () => download(`${name}.hex`, PX.paletteToHex(pal), 'text/plain'));
  add('色板 PNG', '每色一格', async () => { const im = PX.makeImage(pal.length, 1); pal.forEach((h, i) => im.data.set(rgbaOfHex(h), i * 4)); download(`${name}_palette.png`, await pngBlob(PX.scaleNearest(im, 16))); });
  modal(inEdit ? '导出（编辑器）' : '导出（转换结果）', b, [{ label: '关闭' }]);
}
$('btnExport').onclick = exportDialog;

// ------------------------------------------------------------------ help
$('btnHelp').onclick = () => modal('像素工坊 · 使用说明', `<div class="help">
<h4>它解决什么问题</h4><p>AI 生成的「像素风」图只是看起来像像素：一个像素块里有几十种相近颜色，边缘有抗锯齿，网格也不严格对齐。直接缩小会糊，直接减色会丢细节（压过头）。本工具先<b>找回原本的像素网格</b>，每格取一个主色，再把颜色<b>吸附到你的色板</b>，只清理<b>相近色的零碎杂点</b>，最后让你在编辑器里对五官、武器等部位<b>单独重画</b>。</p>
<h4>推荐流程</h4><ol>
<li>「转换」页打开 AI 图 → 自动识别网格（看左侧提示的块大小是否合理，不对就改「固定块大小」）。</li>
<li>调色板：先用「自动提取」找感觉；做成套素材时点「把当前结果色板锁定」，或导入你自己的 .gpl/.hex、从手调过的样图提取。</li>
<li>杂色清理：零碎色太多就调高「低于 %」和「块≤」；想保留的高光或眼睛，用「保护笔」在结果图上涂一下。</li>
<li>「送到编辑器」→ 用魔棒/框选把要重画的部位「选区→新图层」，在新图层重画，隐藏旧层对比；用「换色」或双击色板统一改色。</li>
<li>「导出」PNG（整数倍放大）、精灵表、GIF、色板；「批量」页用同一设置处理整套图。</li></ol>
<h4>编辑器快捷键</h4><p>
<kbd>B</kbd>铅笔 <kbd>E</kbd>橡皮 <kbd>D</kbd>抖动笔 <kbd>G</kbd>填充 <kbd>I</kbd>吸管 <kbd>L</kbd>直线 <kbd>R</kbd>矩形 <kbd>O</kbd>椭圆 <kbd>J</kbd>抖动渐变 <kbd>M</kbd>框选 <kbd>W</kbd>魔棒 <kbd>V</kbd>移动 <kbd>K</kbd>去底 <kbd>C</kbd>换色<br>
<kbd>X</kbd>交换主副色 · <kbd>[</kbd><kbd>]</kbd>笔刷大小 · 右键 = 用副色画 · 空格/中键拖动平移 · 滚轮缩放 · <kbd>0</kbd>适应窗口<br>
<kbd>Ctrl+Z</kbd>撤销 <kbd>Ctrl+Y</kbd>重做 · <kbd>Ctrl+A</kbd>全选 <kbd>Ctrl+D</kbd>/<kbd>Esc</kbd>取消选区 · <kbd>Ctrl+C/X/V</kbd>复制/剪切/粘贴 · <kbd>Del</kbd>删除选区 · 移动工具下方向键微调 · <kbd>Enter</kbd>确认粘贴 · Shift 画直线 45° / 正方形 / 加选</p>
<h4>给代码 / AI 用：像素数据 PXD</h4><p>「导出 → 像素数据 .pxd.json」把画面存成色板 + 每像素一个字符的文本（含图层、帧、锚点），脚本和 AI 能直接读写；脚本生成的 .pxd.json 拖进窗口就能逐帧修。命令行 <code>cli/pw.js</code> 和动画库 <code>cli/pxanim.py</code> 见 WORKFLOW.md。</p>
<h4>说明</h4><p>单文件离线运行，图片不会上传任何地方。设置和锁定的色板会记在本机浏览器里。</p></div>`, [{ label: '知道了', cls: 'accent' }]);

// ------------------------------------------------------------------ keyboard
const KEYS = { b: 'pencil', e: 'eraser', d: 'dither', g: 'fill', i: 'picker', l: 'line', r: 'rect', o: 'ellipse', j: 'gradient', m: 'select', w: 'wand', v: 'move', k: 'bgpick', c: 'replace' };
document.addEventListener('keydown', e => {
  if ($('modal').classList.contains('on')) { if (e.key === 'Escape') closeModal(); return; }
  if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && document.activeElement.type !== 'checkbox' && document.activeElement.type !== 'range') return;
  if (S.tab !== 'edit') return;
  const k = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
  if (ctrl) {
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); edUndo(); } else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); edRedo(); }
    else if (k === 'a') { e.preventDefault(); selectAll(); } else if (k === 'd') { e.preventDefault(); selectNone(); }
    else if (k === 'c') { e.preventDefault(); copySel(false); } else if (k === 'x') { e.preventDefault(); copySel(true); }
    else if (k === 'v' && E.clip) { e.preventDefault(); pasteClip(E.clip); }
    return;
  }
  if (e.key === ' ') { E.space = true; edCv.style.cursor = 'grab'; e.preventDefault(); return; }
  if (e.key === 'Escape') { if (E.float) commitFloat(); selectNone(); return; }
  if (e.key === 'Enter') { commitFloat(); edRender(); return; }
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSel(); return; }
  if (e.key.startsWith('Arrow') && E.doc && E.tool === 'move') {
    e.preventDefault();
    if (!E.float) { pushUndo(); const d = E.doc, c = cel(), mask = E.sel ? E.sel.slice() : new Uint8Array(d.w * d.h).fill(1), data = new Uint8ClampedArray(c.length); for (let i = 0; i < mask.length; i++) if (mask[i]) { data.set(c.subarray(i * 4, i * 4 + 4), i * 4); c[i * 4] = c[i * 4 + 1] = c[i * 4 + 2] = c[i * 4 + 3] = 0; } E.float = { data, mask, dx: 0, dy: 0, whole: !E.sel, path: E.selPath }; }
    const st = e.shiftKey ? 8 : 1; if (e.key === 'ArrowLeft') E.float.dx -= st; if (e.key === 'ArrowRight') E.float.dx += st; if (e.key === 'ArrowUp') E.float.dy -= st; if (e.key === 'ArrowDown') E.float.dy += st; edRender(); return;
  }
  if (KEYS[k]) { setTool(KEYS[k]); return; }
  if (k === 'x') { [E.primary, E.secondary] = [E.secondary, E.primary]; edColors(); }
  else if (k === '[' || k === ']') { const b = $('e_brush'); b.value = Math.max(1, Math.min(8, +b.value + (k === ']' ? 1 : -1))); b.dispatchEvent(new Event('input')); edRender(); }
  else if (k === '0') edFit(); else if (k === '=' || k === '+') edZoom(1.5); else if (k === '-') edZoom(1 / 1.5);
});
document.addEventListener('keyup', e => { if (e.key === ' ') { E.space = false; edCv.style.cursor = E.tool === 'move' ? 'move' : 'crosshair'; } });

setTool('pencil'); edColors();

// ------------------------------------------------------------------ 菜单 + 召唤师原型立绘（v1.4.0）
const VERSION = '1.4.0';
(function initMenu() {
  const btn = $('btnMenu'), pop = $('menuPop'), mask = $('protoPanel');
  if (!btn || !pop) return;
  const P = window.SUMMONER_PORTRAITS;
  const expIdx = {};           // 每个角色当前表情序号
  let eggDone = false, built = false;
  const eggTaps = {};          // 彩蛋：连点计数
  let eggTimer = null;

  const openMenu = (on) => { pop.hidden = !on; btn.classList.toggle('on', on); };
  btn.onclick = (e) => { e.stopPropagation(); openMenu(pop.hidden); };
  document.addEventListener('click', (e) => {
    if (!pop.hidden && !pop.contains(e.target) && e.target !== btn) openMenu(false);
  });

  $('miSample').onclick = () => { openMenu(false); $('btnSample').click(); };
  $('miExport').onclick = () => { openMenu(false); $('btnExport').click(); };
  $('miAbout').onclick = () => {
    openMenu(false);
    tapAbout();
    modal(`关于 像素工坊 v${VERSION}`, `<div class="help">
      <p>单文件离线的 AI 像素图整理 + 像素编辑器。MIT 许可，源码：<code>github.com/CHET-LI/pixel-workshop</code>。</p>
      <p>菜单里的「召唤师原型」是另一个项目 <code>summoner-proto</code> 的队伍立绘，顺手放进来当示例。</p></div>`,
      [{ label: '知道了', cls: 'accent' }]);
  };

  // 关于里连点三下 → 菜单底部冒出彩蛋项
  function tapAbout() {
    const now = Date.now();
    eggTaps.n = (now - (eggTaps.t || 0) < 900) ? (eggTaps.n || 0) + 1 : 1;
    eggTaps.t = now;
    if (eggTaps.n >= 3) { $('miEgg').hidden = false; eggTaps.n = 0; }
  }
  $('miEgg').onclick = () => { openMenu(false); openProto(true); };

  // ---------------- 立绘面板
  function build() {
    if (built || !P) return;
    const row = $('protoRow');
    P.order.forEach((who) => {
      const card = document.createElement('div');
      card.className = 'proto-card';
      card.dataset.who = who;
      const img = document.createElement('img');
      img.width = 96; img.height = Math.round(96 * 134 / 127);
      img.src = P.data[who][P.exps[who][0]];
      img.alt = P.names[who];
      const nm = document.createElement('div'); nm.className = 'pc-name'; nm.textContent = P.names[who];
      const ex = document.createElement('div'); ex.className = 'pc-exp'; ex.textContent = P.exps[who][0];
      card.append(img, nm, ex);
      card.onclick = () => {
        if (who === 'ranger') {
          eggTaps[who] = (eggTaps[who] || 0) + 1;
          if (eggTaps[who] >= 3 && !eggDone && P.egg) { showEgg(img, ex); return; }
        }
        expIdx[who] = ((expIdx[who] ?? 0) + 1) % P.exps[who].length;
        const e = P.exps[who][expIdx[who]];
        img.src = P.data[who][e];
        ex.textContent = e;
        $('protoFoot').classList.remove('flash');
        $('protoFoot').textContent = `${P.names[who]} · ${e}`;
      };
      row.appendChild(card);
    });
    built = true;
  }
  function showEgg(img, ex) {
    eggDone = true;
    img.src = P.egg;
    ex.textContent = 'alert';
    const f = $('protoFoot');
    f.textContent = '她被吓到了';
    f.classList.add('flash');
  }
  function openProto(instantEgg) {
    if (!P) return;
    build();
    mask.hidden = false;
    if (instantEgg && !eggDone) {
      const card = $('protoRow').querySelector('[data-who="ranger"]');
      showEgg(card.querySelector('img'), card.querySelector('.pc-exp'));
    }
  }
  const closeProto = () => { mask.hidden = true; };
  $('miProto').onclick = () => { openMenu(false); openProto(false); };
  $('protoClose').onclick = closeProto;
  mask.addEventListener('click', (e) => { if (e.target === mask) closeProto(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !mask.hidden) { closeProto(); e.stopPropagation(); }
  }, true);
})();
