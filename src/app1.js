// ===================================================================== 像素工坊 · 公共 + 转换 + 批量
'use strict';
const $ = id => document.getElementById(id);
const qa = (s, r) => [...(r || document).querySelectorAll(s)];
const S = {
  tab: 'convert', src: null, srcName: '', srcCanvas: null, srcStats: null, grid: null, gridMs: 0,
  result: null, resultCanvas: null, protect: null, customPal: [], pinned: [], view: { s: 1, x: 0, y: 0 },
  batch: [],
};

// ------------------------------------------------------------------ small helpers
function toast(msg, err, ms) {
  const t = $('toast'); t.textContent = msg; t.className = 'toast on' + (err ? ' err' : '');
  clearTimeout(toast._t); toast._t = setTimeout(() => { t.className = 'toast' + (err ? ' err' : ''); }, ms || 2400);
}
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
// buttons: [{label, cls, onClick}] ; onClick returning false keeps the dialog open
function modal(title, body, buttons) {
  $('mTitle').textContent = title;
  const mb = $('mBody'); mb.innerHTML = '';
  if (typeof body === 'string') mb.innerHTML = body; else if (body) mb.appendChild(body);
  const bb = $('mBtns'); bb.innerHTML = '';
  for (const b of (buttons || [{ label: '关闭' }])) {
    const el = document.createElement('button'); el.textContent = b.label; if (b.cls) el.className = b.cls;
    el.onclick = () => { if (b.onClick && b.onClick() === false) return; closeModal(); };
    bb.appendChild(el);
  }
  $('modal').classList.add('on');
  const first = mb.querySelector('input,textarea,select'); if (first) setTimeout(() => first.focus(), 30);
}
function closeModal() { $('modal').classList.remove('on'); }
$('modal').addEventListener('mousedown', e => { if (e.target.id === 'modal') closeModal(); });

function download(name, data, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: type || 'application/octet-stream' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function imgToCanvas(img, cv) {
  cv = cv || document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
  if (img.width && img.height) cv.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
  return cv;
}
function pngBlob(img) { return new Promise(res => imgToCanvas(img).toBlob(b => res(b), 'image/png')); }
async function pngBytes(img) { return new Uint8Array(await (await pngBlob(img)).arrayBuffer()); }
function dataURLOf(img) { return imgToCanvas(img).toDataURL('image/png'); }
function imageFromElement(el) {
  const w = el.naturalWidth || el.width, h = el.naturalHeight || el.height;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d'); ctx.drawImage(el, 0, 0);
  const d = ctx.getImageData(0, 0, w, h);
  return PX.makeImage(w, h, d.data);
}
function loadURLImage(url) {
  return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(imageFromElement(im)); im.onerror = () => rej(new Error('图片无法解码')); im.src = url; });
}
async function loadFileImage(file) {
  const url = URL.createObjectURL(file);
  try { return await loadURLImage(url); } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
function readText(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsText(file); }); }
function pickFile(input) { return new Promise(res => { input.value = ''; input.onchange = () => res([...input.files]); input.click(); }); }
function baseName(n) { return String(n || 'image').replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]/g, '_'); }
function store(k, v) { try { localStorage.setItem('pxw_' + k, JSON.stringify(v)); } catch (e) { /* sandboxed */ } }
function load(k) { try { const v = localStorage.getItem('pxw_' + k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
let CHECKER = null;
function checker(ctx) {
  if (!CHECKER) { const c = document.createElement('canvas'); c.width = c.height = 16; const g = c.getContext('2d'); g.fillStyle = '#3a3f47'; g.fillRect(0, 0, 16, 16); g.fillStyle = '#2c3037'; g.fillRect(0, 0, 8, 8); g.fillRect(8, 8, 8, 8); CHECKER = c; }
  return ctx.createPattern(CHECKER, 'repeat');
}
function fitCanvas(cv) { // match backing store to CSS size
  const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  return { w: r.width, h: r.height, dpr };
}
qa('input[type=range]').forEach(r => {
  const o = document.querySelector(`output[for="${r.id}"]`);
  const upd = () => { if (o) o.textContent = r.value; }; r.addEventListener('input', upd); upd();
});

// ------------------------------------------------------------------ tabs
function setTab(t) {
  S.tab = t;
  qa('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  qa('.view').forEach(v => v.classList.toggle('on', v.id === 'view-' + t));
  requestAnimationFrame(() => { if (t === 'convert') drawConvert(); if (t === 'edit' && window.edRender) edRender(); if (t === 'batch') renderBatch(); });
}
qa('#tabs button').forEach(b => b.onclick = () => setTab(b.dataset.tab));

// ------------------------------------------------------------------ options
const OPT_IDS = ['snap', 'size', 'offX', 'offY', 'width', 'sample', 'bgAuto', 'bgTol', 'colors', 'realColors', 'dither', 'ditherAmt',
  'rareMerge', 'rarePct', 'islandMerge', 'islandSize', 'islandDE', 'outlineUnify', 'outlineL', 'pixelPerfect', 'addOutline', 'outlineColorPick', 'outlineCustom', 'trim', 'scale', 'sharpen', 'colorBalance', 'restore'];
function radio(name) { const r = document.querySelector(`input[name="${name}"]:checked`); return r ? r.value : ''; }
function setRadio(name, v) { const r = document.querySelector(`input[name="${name}"][value="${v}"]`); if (r) r.checked = true; }
function readOpts() {
  const v = id => { const el = $('o_' + id); return el.type === 'checkbox' ? el.checked : (el.type === 'number' || el.type === 'range') ? +el.value : el.value; };
  return {
    mode: radio('mode'), snap: v('snap'), size: v('size'), offX: v('offX'), offY: v('offY'), width: v('width'), sample: v('sample'),
    bgAuto: v('bgAuto'), bgTol: v('bgTol'), paletteMode: radio('pmode'), colors: v('colors'), realColors: v('realColors'), palette: S.customPal.slice(),
    dither: v('dither'), ditherAmt: v('ditherAmt'), rareMerge: v('rareMerge'), rarePct: v('rarePct'), islandMerge: v('islandMerge'),
    islandSize: v('islandSize'), islandDE: v('islandDE'), outlineUnify: v('outlineUnify'), outlineL: v('outlineL'), pixelPerfect: v('pixelPerfect'),
    addOutline: v('addOutline'), outlineColor: v('outlineCustom') ? v('outlineColorPick') : '', trim: v('trim'), scale: +v('scale'),
    sharpen: v('sharpen'), colorBalance: v('colorBalance'), restore: v('restore'), pinned: S.pinned.slice(),
  };
}
function saveOpts() {
  const o = {}; for (const id of OPT_IDS) { const el = $('o_' + id); o[id] = el.type === 'checkbox' ? el.checked : el.value; }
  o.mode = radio('mode'); o.pmode = radio('pmode'); store('opts', o); store('pal', S.customPal); store('pinned', S.pinned);
  if (S.templates) renderTpl();
}
function restoreOpts() {
  const o = load('opts'); const p = load('pal');
  if (Array.isArray(p)) S.customPal = p.filter(h => PX.parseHex(h));
  S.preset = load('preset') || null;
  const pn = load('pinned'); if (Array.isArray(pn)) S.pinned = pn.filter(h => PX.parseHex(h));
  if (!o) return;
  for (const id of OPT_IDS) { const el = $('o_' + id); if (!el || o[id] === undefined) continue; if (el.type === 'checkbox') el.checked = !!o[id]; else el.value = o[id]; el.dispatchEvent(new Event('input')); }
  if (o.mode) setRadio('mode', o.mode); if (o.pmode) setRadio('pmode', o.pmode);
}
function syncModeUI() {
  const m = radio('mode'), pm = radio('pmode');
  qa('[data-mode]').forEach(el => el.style.display = el.dataset.mode === m ? '' : 'none');
  qa('[data-pmode]').forEach(el => el.style.display = el.dataset.pmode === pm ? '' : 'none');
}
const runConvertSoon = debounce(() => runConvert(), 90);
qa('#convPanel input, #convPanel select').forEach(el => {
  if (el.type === 'file' || el.id === 'palAddColor' || el.dataset.noconv) return;
  el.addEventListener(el.type === 'range' || el.type === 'number' ? 'input' : 'change', () => { syncModeUI(); saveOpts(); runConvertSoon(); });
});

// ------------------------------------------------------------------ source loading
async function setSource(img, name) {
  if (!img || !img.width) { toast('图片为空', true); return; }
  if (img.width * img.height > 5000 * 5000) { toast('图片太大（上限约 2500 万像素）', true); return; }
  S.src = img; S.srcName = name || 'image'; S.srcCanvas = imgToCanvas(img); S.protect = null;
  S.srcStats = PX.colorStats(img);
  const t0 = performance.now(); S.grid = PX.detectGrid(img); S.gridMs = Math.round(performance.now() - t0);
  S.suggest = S.grid.ok ? null : PX.suggestBlock(S.grid);
  const fixed = lockedTpl();
  if (fixed) applyTpl(fixed); // v1.2: fixed template = exactly these settings for every image, no auto switching
  else if (S.grid.ok && S.preset === 'pal' && radio('mode') !== 'auto') { setRadio('mode', 'auto'); syncModeUI(); toast('识别到清晰的像素网格，已切回「自动识别」'); }
  if (fixed) { /* keep the template */ }
  else if (!S.grid.ok && S.preset === 'pal' && S.srcStats.colors > 64) applyPalettePreset(true);
  else if (!S.grid.ok && radio('mode') === 'auto') {
    if (S.srcStats.colors <= 64) $('o_size').value = 1; // already real pixel art at 1x
    else { $('o_size').value = fallbackBlock(S.suggest); if ($('o_sample').value === 'dominant') { applyBlurPreset(true); } }
  }
  $('srcInfo').innerHTML = `<b>${esc(S.srcName)}</b><br>${img.width} × ${img.height} 像素 · <b>${S.srcStats.colors.toLocaleString()}</b> 种颜色` +
    (S.srcStats.colors > 256 ? `<br><span class="warn">颜色远超像素画常见的 16–64 色：典型的 AI「伪像素」图。</span>` : '');
  updateGridInfo(); if (S.templates) renderTpl();
  setTab('convert');
  requestAnimationFrame(() => { cvFit(); runConvert(); });
}
function fallbackBlock(sug) { return sug && sug.strength >= 3.5 ? Math.max(2, Math.round(sug.size)) : 3; }
function applyBlurPreset(silent) {
  S.preset = 'blur'; store('preset', 'blur');
  const set = (id, v) => { const el = $('o_' + id); if (el.type === 'checkbox') el.checked = v; else el.value = v; el.dispatchEvent(new Event('input')); };
  set('sample', 'detail'); set('sharpen', 0); set('colors', Math.max(40, +$('o_colors').value)); set('colorBalance', 70);
  set('islandMerge', true); set('rareMerge', true); set('islandSize', 2); set('islandDE', 12); set('rarePct', 0.1); set('restore', true);
  if (radio('mode') !== 'auto') setRadio('mode', 'size');
  syncModeUI(); saveOpts();
  if (!silent) { runConvertSoon(); toast('已套用模糊大图预设：细线保护取样、40+ 色、保留小面积色、去噪点、按原尺寸导出。小而重要的颜色用「吸色」加入必保色'); }
}
$('btnBlurPreset').onclick = () => applyBlurPreset(false);
function applyPalettePreset(silent) {
  S.preset = 'pal'; store('preset', 'pal');
  const set = (id, v) => { const el = $('o_' + id); if (el.type === 'checkbox') el.checked = v; else el.value = v; el.dispatchEvent(new Event('input')); };
  setRadio('mode', 'size'); set('size', 1); set('offX', 0); set('offY', 0); set('sample', 'center'); set('sharpen', 0);
  set('colors', Math.max(32, +$('o_colors').value)); set('colorBalance', 70); set('dither', 'none');
  set('bgAuto', false); set('rareMerge', false); set('islandMerge', false); set('restore', true); set('scale', 1);
  syncModeUI(); saveOpts(); if (silent) return; runConvertSoon();
  toast('已套用「只统一色板」：1px（每个原图像素保留）、不清理杂点、不去背景、原尺寸导出。游戏里放大请用整数倍 + 最近邻');
}
$('btnPalPreset').onclick = () => applyPalettePreset(false);
function updateGridInfo() {
  const g = S.grid; if (!g) { $('gridInfo').textContent = '—'; return; }
  if (g.ok) {
    const cw = Math.round(S.src.width / g.sizeX), ch = Math.round(S.src.height / g.sizeY);
    $('gridInfo').innerHTML = `识别到像素块 ≈ <b>${g.sizeX.toFixed(2)}</b> px（置信 ${Math.round(g.score * 100)}%，${S.gridMs} ms）<br>原本的像素图约 <b>${cw} × ${ch}</b>`;
  } else {
    const sg = S.suggest;
    $('gridInfo').innerHTML = `<span class="warn">没有可还原的像素网格</span>：图被缩放过或边缘发糊（游戏里裁切缩放过的房子常见）。<br>` +
      (sg && sg.strength >= 3.5 ? `频谱估计原像素约 <b>${sg.size.toFixed(2)}</b> px，` : '看不出明显的像素周期，') +
      `按 <b>${$('o_size').value} px</b> 块重新像素化（可在「固定块大小」里改，2–4 常用）。` +
      (lockedTpl() ? `<br>按固定模板「${esc(S.tplName)}」处理。` : $('o_sample').value === 'detail' ? '<br>已自动套用「模糊大图预设」。' : '');
  }
}
async function openSourceFile(file) {
  try { toast('正在读取…'); setSource(await loadFileImage(file), file.name); } catch (e) { toast('无法读取图片：' + e.message, true); }
}
$('btnOpen').onclick = async () => {
  const [f] = await pickFile($('fileOpen')); if (!f) return;
  if (/\.json$/i.test(f.name)) { edOpenProjectFile(f); return; }
  if (S.tab === 'edit') { try { edOpenImage(await loadFileImage(f), f.name); } catch (e) { toast('无法读取图片', true); } }
  else if (S.tab === 'batch') addBatchFiles([f]);
  else openSourceFile(f);
};
$('dropZone').onclick = () => $('btnOpen').click();
$('btnSample').onclick = async () => {
  if (!window.SAMPLE_IMAGE || window.SAMPLE_IMAGE.length < 50) { toast('本版本没有内置示例', true); return; }
  setSource(await loadURLImage(window.SAMPLE_IMAGE), '示例_AI狐狸.webp');
};
document.addEventListener('dragover', e => { e.preventDefault(); $('dropZone').classList.add('over'); });
document.addEventListener('dragleave', e => { if (!e.relatedTarget) $('dropZone').classList.remove('over'); });
document.addEventListener('drop', e => {
  e.preventDefault(); $('dropZone').classList.remove('over');
  const js = [...e.dataTransfer.files].find(f => /\.json$/i.test(f.name));
  if (js) { edOpenProjectFile(js); return; }
  const files = [...e.dataTransfer.files].filter(f => /^image\//.test(f.type) || /\.(png|jpe?g|webp|gif|bmp)$/i.test(f.name));
  if (!files.length) return;
  if (S.tab === 'batch') addBatchFiles(files);
  else if (S.tab === 'edit') loadFileImage(files[0]).then(im => edOpenImage(im, files[0].name));
  else openSourceFile(files[0]);
});
document.addEventListener('paste', e => {
  if (/INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
  const item = [...(e.clipboardData || {}).items || []].find(i => /^image\//.test(i.type)); if (!item) return;
  const f = item.getAsFile(); e.preventDefault();
  loadFileImage(f).then(im => { if (S.tab === 'edit' && window.edPasteImage) edPasteImage(im); else setSource(im, '剪贴板图片.png'); });
});

// ------------------------------------------------------------------ conversion
function runConvert() {
  if (!S.src) return;
  const opts = readOpts();
  const t0 = performance.now();
  let res;
  try { res = PX.convert(S.src, opts, S.grid, S.protect); } catch (e) { console.error(e); toast('转换出错：' + e.message, true); return; }
  const ms = Math.round(performance.now() - t0);
  const n = res.report.w * res.report.h;
  if (!S.protect || S.protect.length !== n) S.protect = new Uint8Array(n);
  S.result = res; S.resultCanvas = imgToCanvas(res.image); S.noise = noiseMap(res.idx, res.report.w, res.report.h);
  $('cvStatus').textContent = `结果 ${res.image.width}×${res.image.height} · ${res.report.colors} 色 · ${ms} ms`;
  renderStats(); drawConvert();
}
// noisy spots: a 3x3 neighbourhood holding >= 5 different colours (stray-colour clusters worth redrawing)
function noiseMap(idx, w, h) {
  const m = new Uint8Array(w * h); let n = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const c = idx[y * w + x]; if (c < 0) continue; const set = new Set();
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const v = idx[(y + dy) * w + x + dx]; if (v >= 0) set.add(v); }
    if (set.size >= 5) { m[y * w + x] = 1; n++; }
  }
  m.count = n; return m;
}
function renderStats() {
  const r = S.result, st = S.srcStats; if (!r) return;
  const out = PX.colorStats(r.image);
  $('statsBox').innerHTML =
    `原图：<b>${st.colors.toLocaleString()}</b> 色<br>` +
    `按网格取色后：<b>${r.report.rawColors.toLocaleString()}</b> 色<br>` +
    `最终：<span class="big">${out.colors}</span> 色（色板 ${r.palette.length}）<br>` +
    `尺寸：<b>${r.image.width} × ${r.image.height}</b>${r.crop ? '（已裁边）' : ''}<br>` +
    `占比 &lt;0.5% 的零碎色：<b>${out.rare}</b><br>` +
    `杂色热区：<b>${(S.noise.count / Math.max(1, out.opaque) * 100).toFixed(1)}%</b> 的像素 <span class="muted small">（勾「杂色热区」查看）</span>`;
  $('stepsBox').innerHTML = r.report.steps.map(([k, v]) => `<div><span>${esc(k)}</span><b>${v.toLocaleString()} 格</b></div>`).join('') || '<div class="muted">无</div>';
  const max = out.list.length ? out.list[0].count : 1;
  $('usageBox').innerHTML = out.list.map(c => `<div class="u${c.count < out.opaque * 0.005 ? ' rare' : ''}"><i style="background:${c.hex}"></i><span>${c.hex}</span><div class="bar" style="width:${Math.max(2, c.count / max * 100)}%"></div><span>${(c.count / out.opaque * 100).toFixed(1)}%</span></div>`).join('');
}

// ------------------------------------------------------------------ dual view (shared source-pixel coordinates)
const cvSrc = $('cvSrc'), cvDst = $('cvDst');
function resultRect() { // where the result image sits in source coordinates
  const r = S.result; if (!r) return null;
  const g = r.report.geo, cx = g.cx, cy = g.cy;
  const X0 = cx[0][0], X1 = cx[cx.length - 1][1], Y0 = cy[0][0], Y1 = cy[cy.length - 1][1];
  const cw = (X1 - X0) / r.report.w, ch = (Y1 - Y0) / r.report.h;
  const ox = r.crop ? r.crop.x : 0, oy = r.crop ? r.crop.y : 0;
  return { x: X0 + ox * cw, y: Y0 + oy * ch, w: r.image.width * cw, h: r.image.height * ch, cw, ch, X0, Y0 };
}
function drawPane(cv, which) {
  const { w, h, dpr } = fitCanvas(cv); const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = '#0f1214'; ctx.fillRect(0, 0, w, h);
  if (!S.src) { ctx.fillStyle = '#56615c'; ctx.font = '14px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(which === 'src' ? '打开或拖入一张 AI 生成的「像素风」图片' : '结果会显示在这里', w / 2, h / 2); return; }
  const v = S.view; ctx.imageSmoothingEnabled = false;
  const iw = S.src.width, ih = S.src.height;
  if (which === 'src') {
    ctx.fillStyle = checker(ctx); ctx.fillRect(v.x, v.y, iw * v.s, ih * v.s);
    ctx.imageSmoothingEnabled = v.s < 1; ctx.drawImage(S.srcCanvas, v.x, v.y, iw * v.s, ih * v.s); ctx.imageSmoothingEnabled = false;
  } else if (S.result) {
    const R = resultRect();
    ctx.fillStyle = checker(ctx); ctx.fillRect(v.x + R.x * v.s, v.y + R.y * v.s, R.w * v.s, R.h * v.s);
    ctx.drawImage(S.resultCanvas, v.x + R.x * v.s, v.y + R.y * v.s, R.w * v.s, R.h * v.s);
    // protection overlay
    const P = S.protect, pw = S.result.report.w; let any = false;
    if (P) {
      ctx.fillStyle = $('cvProtect').checked ? 'rgba(255,60,200,.45)' : 'rgba(255,60,200,.22)';
      for (let i = 0; i < P.length; i++) if (P[i]) { any = true; const px = i % pw, py = (i - px) / pw; ctx.fillRect(v.x + (R.X0 + px * R.cw) * v.s, v.y + (R.Y0 + py * R.ch) * v.s, R.cw * v.s + .5, R.ch * v.s + .5); }
    }
    if ($('cvNoise').checked && S.noise) {
      ctx.strokeStyle = '#ffb020'; ctx.lineWidth = Math.max(1, Math.min(2, R.cw * v.s / 5));
      for (let i = 0; i < S.noise.length; i++) if (S.noise[i]) { const px = i % pw, py = (i - px) / pw; ctx.strokeRect(v.x + (R.X0 + px * R.cw) * v.s + 1, v.y + (R.Y0 + py * R.ch) * v.s + 1, R.cw * v.s - 2, R.ch * v.s - 2); }
    }
  }
  if ($('cvGrid').checked && S.result) {
    const g = S.result.report.geo; const step = (g.cx.length ? (g.cx[g.cx.length - 1][1] - g.cx[0][0]) / g.cx.length : 8) * v.s;
    if (step >= 4) {
      ctx.strokeStyle = which === 'src' ? 'rgba(83,229,134,.55)' : 'rgba(0,0,0,.35)'; ctx.lineWidth = 1; ctx.beginPath();
      const y0 = v.y + g.cy[0][0] * v.s, y1 = v.y + g.cy[g.cy.length - 1][1] * v.s, x0 = v.x + g.cx[0][0] * v.s, x1 = v.x + g.cx[g.cx.length - 1][1] * v.s;
      for (const [a] of g.cx) { const X = Math.round(v.x + a * v.s) + .5; if (X < 0 || X > w) continue; ctx.moveTo(X, Math.max(0, y0)); ctx.lineTo(X, Math.min(h, y1)); }
      for (const [a] of g.cy) { const Y = Math.round(v.y + a * v.s) + .5; if (Y < 0 || Y > h) continue; ctx.moveTo(Math.max(0, x0), Y); ctx.lineTo(Math.min(w, x1), Y); }
      ctx.stroke();
    }
  }
}
function drawConvert() { if (S.tab !== 'convert') return; drawPane(cvSrc, 'src'); drawPane(cvDst, 'dst'); $('cvZoomLbl').textContent = Math.round(S.view.s * 100) + '%'; }
function cvFit() {
  if (!S.src) return drawConvert();
  const r = cvDst.getBoundingClientRect(); const s = Math.min(r.width / S.src.width, r.height / S.src.height) * 0.94;
  S.view = { s, x: (r.width - S.src.width * s) / 2, y: (r.height - S.src.height * s) / 2 }; drawConvert();
}
function cvZoom(f, cx, cy) {
  const v = S.view, r = cvDst.getBoundingClientRect(); if (cx === undefined) { cx = r.width / 2; cy = r.height / 2; }
  const ns = Math.max(0.05, Math.min(64, v.s * f)); v.x = cx - (cx - v.x) * ns / v.s; v.y = cy - (cy - v.y) * ns / v.s; v.s = ns; drawConvert();
}
$('cvZoomIn').onclick = () => cvZoom(1.5); $('cvZoomOut').onclick = () => cvZoom(1 / 1.5); $('cvFit').onclick = cvFit;
$('cvGrid').onchange = drawConvert; $('cvNoise').onchange = drawConvert;
$('cvSolo').onchange = () => { $('cvSplit').classList.toggle('solo', $('cvSolo').checked); requestAnimationFrame(cvFit); };
$('cvProtect').onchange = () => { if ($('cvProtect').checked) { $('cvPick').checked = false; cvSrc.style.cursor = ''; } cvDst.style.cursor = $('cvProtect').checked ? 'crosshair' : ''; drawConvert(); };
$('cvProtectClear').onclick = () => { if (S.protect) S.protect.fill(0); runConvert(); };
function cellAt(sx, sy) { // screen -> pre-trim result cell
  const r = S.result; if (!r) return null; const v = S.view; const X = (sx - v.x) / v.s, Y = (sy - v.y) / v.s;
  const find = (arr, p) => { let lo = 0, hi = arr.length - 1; if (p < arr[0][0] || p >= arr[hi][1]) return -1; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m][1] <= p) lo = m + 1; else hi = m; } return lo; };
  const i = find(r.report.geo.cx, X), j = find(r.report.geo.cy, Y); return i < 0 || j < 0 ? null : [i, j];
}
for (const cv of [cvSrc, cvDst]) {
  cv.addEventListener('wheel', e => { e.preventDefault(); const r = cv.getBoundingClientRect(); cvZoom(e.deltaY < 0 ? 1.2 : 1 / 1.2, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture(e.pointerId);
    const r = cv.getBoundingClientRect();
    if ($('cvPick').checked && e.button === 0 && S.src) { pickSourceColor(e.clientX - r.left, e.clientY - r.top); return; }
    const protect = cv === cvDst && $('cvProtect').checked && e.button !== 1 && S.result;
    const st = { x: e.clientX, y: e.clientY, vx: S.view.x, vy: S.view.y, protect, val: e.button === 2 ? 0 : 1, changed: false };
    const paint = ev => {
      const c = cellAt(ev.clientX - r.left, ev.clientY - r.top); if (!c) return;
      const n = +$('cvProtectSize').value, pw = S.result.report.w, ph = S.result.report.h, o = Math.floor((n - 1) / 2);
      for (let dy = 0; dy < n; dy++) for (let dx = 0; dx < n; dx++) { const x = c[0] - o + dx, y = c[1] - o + dy; if (x >= 0 && y >= 0 && x < pw && y < ph) S.protect[y * pw + x] = st.val; }
      st.changed = true; drawConvert();
    };
    if (protect) paint(e);
    const move = ev => { if (st.protect) paint(ev); else { S.view.x = st.vx + ev.clientX - st.x; S.view.y = st.vy + ev.clientY - st.y; drawConvert(); } };
    const up = () => { cv.removeEventListener('pointermove', move); cv.removeEventListener('pointerup', up); cv.removeEventListener('pointercancel', up); if (st.changed) runConvert(); };
    cv.addEventListener('pointermove', move); cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  });
}
window.addEventListener('resize', debounce(() => { if (S.tab === 'convert') drawConvert(); else if (S.tab === 'edit' && window.edRender) edRender(); }, 60));

// ------------------------------------------------------------------ must-keep colours (picked from the source)
function pickSourceColor(sx, sy) {
  const v = S.view, x = Math.floor((sx - v.x) / v.s), y = Math.floor((sy - v.y) / v.s);
  if (x < 0 || y < 0 || x >= S.src.width || y >= S.src.height) return;
  const i = (y * S.src.width + x) * 4, d = S.src.data; if (d[i + 3] < 128) { toast('这里是透明的'); return; }
  const hx = PX.hex(d[i], d[i + 1], d[i + 2]);
  if (radio('pmode') === 'custom') { S.customPal.push(hx); palChanged(); toast('已加入锁定色板 ' + hx); return; }
  if (!S.pinned.includes(hx)) S.pinned.push(hx); if (S.pinned.length > 16) S.pinned.shift();
  renderPinned(); saveOpts(); runConvertSoon(); toast('已加入必保色 ' + hx);
}
function renderPinned() {
  const box = $('pinnedPal'); box.innerHTML = '';
  if (!S.pinned.length) { box.innerHTML = '<div class="emptymsg">无。徽章、花、灯火这类小面积颜色被挤掉时用。</div>'; return; }
  S.pinned.forEach((hx, i) => { const d = document.createElement('div'); d.className = 'sw'; d.style.background = hx; d.title = hx + '（点击移除）'; d.onclick = () => { S.pinned.splice(i, 1); renderPinned(); saveOpts(); runConvertSoon(); }; box.appendChild(d); });
}
$('cvPick').onchange = () => { if ($('cvPick').checked) $('cvProtect').checked = false; for (const c of [cvSrc, cvDst]) c.style.cursor = $('cvPick').checked ? 'copy' : ''; drawConvert(); };

// ------------------------------------------------------------------ custom palette
function renderCustomPal() {
  const box = $('customPal'); box.innerHTML = '';
  if (!S.customPal.length) { box.innerHTML = '<div class="emptymsg">色板为空：选预设、导入，或在「自动提取」下点「锁定当前结果色板」。为空时按自动提取处理。</div>'; return; }
  S.customPal.forEach((hx, i) => {
    const d = document.createElement('div'); d.className = 'sw'; d.style.background = hx; d.title = hx + '（点击删除）';
    d.onclick = () => { S.customPal.splice(i, 1); palChanged(); toast('已删除 ' + hx); };
    box.appendChild(d);
  });
}
function palChanged(switchToCustom) {
  S.customPal = [...new Set(S.customPal.map(h => h.toLowerCase()))].slice(0, 256);
  if (switchToCustom) { setRadio('pmode', 'custom'); syncModeUI(); }
  renderCustomPal(); saveOpts(); runConvertSoon();
}
for (const k of Object.keys(PX.PRESETS)) { const o = document.createElement('option'); o.value = k; o.textContent = `${k}（${PX.PRESETS[k].length} 色）`; $('presetSel').appendChild(o); }
$('presetSel').onchange = () => { const k = $('presetSel').value; if (!k) return; S.customPal = PX.PRESETS[k].slice(); $('presetSel').value = ''; palChanged(true); toast('已载入预设 ' + k); };
$('btnLockPal').onclick = () => { if (!S.result) { toast('先载入图片', true); return; } S.customPal = S.result.palette.slice(); palChanged(true); toast(`已锁定 ${S.customPal.length} 色色板：之后的图片和批量处理都会用它`); };
$('btnPalAdd').onclick = () => { S.customPal.push($('palAddColor').value); palChanged(true); };
$('btnPalClear').onclick = () => { S.customPal = []; palChanged(); };
$('btnPalPaste').onclick = () => {
  const ta = document.createElement('textarea'); ta.placeholder = '每行一个颜色，支持：#aabbcc / aabbcc / GIMP .gpl 内容 / JASC-PAL / paint.net / "r g b"';
  modal('粘贴色值', ta, [{ label: '取消' }, { label: '使用', cls: 'accent', onClick: () => { const p = PX.parsePalette(ta.value); if (!p.length) { toast('没有识别到颜色', true); return false; } S.customPal = p; palChanged(true); toast(`导入 ${p.length} 色`); } }]);
};
async function importPaletteFile(file) {
  if (/^image\//.test(file.type)) { const im = await loadFileImage(file); return PX.paletteFromImage(im, 64); }
  return PX.parsePalette(await readText(file));
}
$('btnPalImport').onclick = async () => {
  const [f] = await pickFile($('filePal')); if (!f) return;
  const p = await importPaletteFile(f); if (!p.length) { toast('文件里没有识别到颜色', true); return; }
  S.customPal = p; palChanged(true); toast(`从 ${f.name} 导入 ${p.length} 色`);
};
$('btnPalRef').onclick = async () => {
  const [f] = await pickFile($('fileRef')); if (!f) return;
  const im = await loadFileImage(f); const u = PX.uniqueColors(im).length;
  const box = document.createElement('div');
  box.innerHTML = `<p>参考图 <b>${esc(f.name)}</b> 共 ${u.toLocaleString()} 种颜色。</p><div class="row"><span>提取颜色数</span><input type="number" id="refN" min="2" max="64" value="${Math.min(u, 16)}"></div><p class="hint">颜色少于该数时直接取全部原色（手工像素图/色板图）；否则聚类出最有代表性的真实颜色。</p>`;
  modal('从参考图提取色板', box, [{ label: '取消' }, { label: '提取', cls: 'accent', onClick: () => { const n = Math.max(2, Math.min(64, +$('refN').value || 16)); S.customPal = PX.sortPalette(PX.paletteFromImage(im, n)); palChanged(true); toast(`提取 ${S.customPal.length} 色`); } }]);
};

// ------------------------------------------------------------------ convert outputs
$('btnConvPNG').onclick = async () => {
  if (!S.result) { toast('先载入图片', true); return; }
  if ($('o_restore').checked) { download(`${baseName(S.srcName)}_pixel_原尺寸.png`, await pngBlob(restoredResult())); return; }
  const s = +$('o_scale').value; download(`${baseName(S.srcName)}_pixel_${s}x.png`, await pngBlob(PX.scaleNearest(S.result.image, s)));
};
function restoredResult(image) { const r = S.result; return PX.restoreToSource(image || r.image, r.report.geo, r.crop, S.src.width, S.src.height); }
$('btnToEditor').onclick = () => {
  if (!S.result) { toast('先载入图片', true); return; }
  edNewDoc(S.result.image.width, S.result.image.height, S.result.image, S.result.palette.slice(), baseName(S.srcName));
  E.restore = { geo: S.result.report.geo, crop: S.result.crop, W: S.src.width, H: S.src.height, w: S.result.image.width, h: S.result.image.height };
  setTab('edit'); toast('已送到编辑器：可以局部重画、换色、单独修某个部位');
};

// ------------------------------------------------------------------ batch
function addBatchFiles(files) {
  for (const f of files) if (/^image\//.test(f.type) || /\.(png|jpe?g|webp|gif|bmp)$/i.test(f.name)) S.batch.push({ file: f, name: f.webkitRelativePath || f.name, status: '待处理', srcURL: URL.createObjectURL(f), outURL: '' });
  setTab('batch');
}
function renderBatch() {
  const o = readOpts();
  $('bSummary').innerHTML = `共 <b>${S.batch.length}</b> 张 · ${lockedTpl() ? `模板：<b>固定「${esc(S.tplName)}」</b>` : '模板：未固定'} · 网格：${{ auto: '每张自动识别', size: '固定 ' + o.size + 'px', width: '目标宽度 ' + o.width }[o.mode]} · ` +
    (o.paletteMode === 'custom' && o.palette.length ? `色板：<b>锁定 ${o.palette.length} 色</b>（整批统一）` : `<span class="warn">色板：每张自动提取 ${o.colors} 色，每张的颜色会不一样。做成套素材请先锁定色板。</span>`);
  const box = $('bList'); box.innerHTML = '';
  for (const it of S.batch) {
    const c = document.createElement('div'); c.className = 'bcard';
    c.innerHTML = `<div class="imgs"><div style="background-image:url('${it.srcURL}')"></div><div style="background-image:${it.outURL ? `url('${it.outURL}')` : 'none'}"></div></div><div class="nm" title="${esc(it.name)}">${esc(it.name)}</div><div class="st ${it.cls || ''}">${esc(it.status)}</div>`;
    box.appendChild(c);
  }
}
$('bAddFiles').onclick = async () => addBatchFiles(await pickFile($('bFiles')));
$('bAddFolder').onclick = async () => addBatchFiles(await pickFile($('bFolder')));
$('bClear').onclick = () => { S.batch = []; renderBatch(); };
$('bRun').onclick = async () => {
  if (!S.batch.length) { toast('先添加图片', true); return; }
  const fixed = lockedTpl(); if (fixed) applyTpl(fixed);
  const o = readOpts(), scale = +$('bScale').value, files = []; $('bRun').disabled = true;
  let ok = 0;
  for (const it of S.batch) {
    it.status = '处理中…'; it.cls = ''; renderBatch(); await new Promise(r => setTimeout(r, 0));
    try {
      const img = await loadFileImage(it.file);
      const grid = o.mode === 'auto' ? PX.detectGrid(img) : null;
      const oo = grid && !grid.ok && !fixed ? Object.assign({}, o, { size: fallbackBlock(PX.suggestBlock(grid)) }) : o;
      const res = PX.convert(img, oo, grid, null);
      const outImg = o.restore ? PX.restoreToSource(res.image, res.report.geo, res.crop, img.width, img.height) : PX.scaleNearest(res.image, scale);
      files.push({ name: it.name.replace(/\.[^./]+$/, '') + (o.restore ? '_pixel.png' : `_pixel${scale > 1 ? '_' + scale + 'x' : ''}.png`), data: await pngBytes(outImg) });
      it.outURL = dataURLOf(res.image);
      it.status = `✓ ${res.image.width}×${res.image.height} · ${res.report.colors} 色${grid ? (grid.ok ? ' · 网格 ' + grid.sizeX.toFixed(1) + 'px' : ' · 重新像素化 ' + oo.size + 'px') : ''}${o.restore ? ' · 原尺寸' : ''}`; it.cls = 'ok'; ok++;
    } catch (e) { it.status = '✗ ' + e.message; it.cls = 'err'; }
  }
  if (o.paletteMode === 'custom' && o.palette.length) files.push({ name: 'palette.gpl', data: new TextEncoder().encode(PX.paletteToGPL(o.palette, 'PixelWorkshop')) });
  renderBatch(); $('bRun').disabled = false;
  if (files.length) download(`像素工坊_批量_${ok}张.zip`, PX.zip(files), 'application/zip');
  toast(`完成 ${ok}/${S.batch.length} 张`);
};

// ------------------------------------------------------------------ templates (v1.2)
// A template = every convert setting (grid, sampling, background, palette mode + locked palette, must-keep colours,
// clean-up, outline, export) plus the batch scale. "固定模板": opening an image or running a batch applies it exactly.
S.templates = (() => { const t = load('templates'); return t && typeof t === 'object' && !Array.isArray(t) ? t : {}; })();
S.tplName = typeof load('tplName') === 'string' ? load('tplName') : '';
S.tplLock = load('tplLock') === true && !!S.templates[S.tplName];
function validTpl(t) { return !!t && typeof t === 'object' && !!t.opts && typeof t.opts === 'object' && Array.isArray(t.pal); }
function lockedTpl() { return S.templates && S.tplLock && validTpl(S.templates[S.tplName]) ? S.templates[S.tplName] : null; }
function captureTpl() {
  const o = {}; for (const id of OPT_IDS) { const el = $('o_' + id); o[id] = el.type === 'checkbox' ? el.checked : el.value; }
  o.mode = radio('mode'); o.pmode = radio('pmode');
  return { v: 1, opts: o, pal: S.customPal.slice(), pinned: S.pinned.slice(), preset: S.preset || null, bScale: $('bScale').value };
}
function tplKey(t) { const o = Object.assign({}, t.opts); for (const k in o) o[k] = String(o[k]); return JSON.stringify([o, t.pal, t.pinned || [], String(t.bScale || '')]); }
function applyTpl(t) {
  const o = t.opts;
  for (const id of OPT_IDS) { const el = $('o_' + id); if (!el || o[id] === undefined) continue; if (el.type === 'checkbox') el.checked = !!o[id]; else el.value = o[id]; el.dispatchEvent(new Event('input')); }
  if (o.mode) setRadio('mode', o.mode); if (o.pmode) setRadio('pmode', o.pmode);
  S.customPal = t.pal.filter(h => PX.parseHex(h)); S.pinned = (t.pinned || []).filter(h => PX.parseHex(h));
  S.preset = t.preset || null; store('preset', S.preset);
  if (t.bScale) $('bScale').value = t.bScale;
  syncModeUI(); renderCustomPal(); renderPinned(); saveOpts();
}
function storeTpl() { store('templates', S.templates); store('tplName', S.tplName); store('tplLock', S.tplLock); }
function renderTpl() {
  const names = Object.keys(S.templates).sort((a, b) => a.localeCompare(b, 'zh'));
  const opts = '<option value="">— 选择模板 —</option>' + names.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
  for (const id of ['tplSel', 'bTplSel']) { const sel = $(id); if (sel.innerHTML !== opts) sel.innerHTML = opts; sel.value = S.templates[S.tplName] ? S.tplName : ''; }
  $('tplLock').checked = $('bTplLock').checked = !!lockedTpl();
  const t = S.templates[S.tplName]; let msg;
  if (!t) msg = names.length ? '未选择模板：导入新图片时会按图片自动调整设置。' : '还没有模板：调好设置后点「保存为模板」，再勾选「固定模板」。';
  else {
    const dirty = tplKey(captureTpl()) !== tplKey(t);
    msg = (lockedTpl() ? `<b>已固定「${esc(S.tplName)}」</b>：导入新图片、批量处理都按这个模板，不再自动改设置。` : `当前模板「${esc(S.tplName)}」<span class="warn">（未固定：导入新图片时仍会自动调整）</span>`) +
      (dirty ? `<br><span class="warn">现在的设置改过、和模板不一样${lockedTpl() ? '（下一张图会恢复成模板设置）' : ''}。要保留请点「保存为模板」覆盖。</span>` : '');
  }
  $('tplInfo').innerHTML = msg; $('bTplInfo').innerHTML = msg;
}
function selectTpl(name) {
  if (!name || !validTpl(S.templates[name])) { S.tplName = ''; S.tplLock = false; storeTpl(); renderTpl(); if (S.tab === 'batch') renderBatch(); return; }
  S.tplName = name; applyTpl(S.templates[name]); storeTpl(); renderTpl(); runConvertSoon(); if (S.tab === 'batch') renderBatch();
  toast(`已套用模板「${name}」` + (S.tplLock ? '（已固定）' : '：勾选「固定模板」后，导入新图片也不会再改'));
}
$('tplSel').onchange = () => selectTpl($('tplSel').value);
$('bTplSel').onchange = () => selectTpl($('bTplSel').value);
function setLock(on) {
  const t = S.templates[S.tplName];
  if (on && !validTpl(t)) { renderTpl(); toast(Object.keys(S.templates).length ? '先在上面选一个模板' : '先点「保存为模板」', true); return; }
  if (!on) { S.tplLock = false; storeTpl(); renderTpl(); if (S.tab === 'batch') renderBatch(); toast('已取消固定：导入新图片时会按图片自动调整'); return; }
  const finish = save => { if (save) S.templates[S.tplName] = captureTpl(); S.tplLock = true; applyTpl(S.templates[S.tplName]); storeTpl(); renderTpl(); runConvertSoon(); if (S.tab === 'batch') renderBatch(); toast(`已固定模板「${S.tplName}」：之后导入的图片和批量都只用它`); };
  if (tplKey(captureTpl()) === tplKey(t)) { finish(false); return; }
  renderTpl();
  modal('固定模板', `<p>现在的设置和模板「${esc(S.tplName)}」不一样（改过参数）。固定哪一套？</p>`, [
    { label: '取消' }, { label: '用模板原来的设置', onClick: () => finish(false) }, { label: '把现在的设置存进模板', cls: 'accent', onClick: () => finish(true) }]);
}
$('tplLock').onchange = () => setLock($('tplLock').checked);
$('bTplLock').onchange = () => setLock($('bTplLock').checked);
$('bScale').addEventListener('change', () => renderTpl());
$('btnTplSave').onclick = () => {
  const box = document.createElement('div');
  box.innerHTML = `<div class="row"><span>模板名</span><input type="text" id="tplName" maxlength="40" style="flex:1"></div><p class="hint">保存转换页的全部设置（网格、取色、背景、色板模式和锁定的色板、必保色、杂色清理、描边、导出方式）和批量倍率。同名会覆盖。</p>`;
  modal('保存为模板', box, [{ label: '取消' }, { label: '保存', cls: 'accent', onClick: () => {
    const n = $('tplName').value.trim(); if (!n) { toast('请输入模板名', true); return false; }
    const existed = !!S.templates[n]; S.templates[n] = captureTpl(); S.tplName = n; storeTpl(); renderTpl(); if (S.tab === 'batch') renderBatch();
    toast(`${existed ? '已覆盖' : '已保存'}模板「${n}」` + (S.tplLock ? '（已固定）' : '：勾选「固定模板」就不会再被新图片改掉'));
  } }]);
  $('tplName').value = S.tplName || `模板${Object.keys(S.templates).length + 1}`;
};
$('btnTplDel').onclick = () => {
  const n = S.tplName; if (!S.templates[n]) { toast('先选一个模板', true); return; }
  modal('删除模板', `<p>删除模板「${esc(n)}」？</p>`, [{ label: '取消' }, { label: '删除', cls: 'accent', onClick: () => {
    delete S.templates[n]; S.tplName = ''; S.tplLock = false; storeTpl(); renderTpl(); if (S.tab === 'batch') renderBatch(); toast(`已删除「${n}」`); } }]);
};
$('btnTplExport').onclick = () => {
  if (!Object.keys(S.templates).length) { toast('还没有模板', true); return; }
  download('像素工坊_模板.json', new Blob([JSON.stringify({ app: 'PixelWorkshop', kind: 'templates', v: 1, templates: S.templates }, null, 1)], { type: 'application/json' }));
};
$('btnTplImport').onclick = async () => {
  const [f] = await pickFile($('fileTpl')); if (!f) return;
  let data; try { data = JSON.parse(await readText(f)); } catch (e) { toast('不是有效的模板文件', true); return; }
  const src = data && data.templates && typeof data.templates === 'object' ? data.templates : {};
  let n = 0; for (const k of Object.keys(src)) if (validTpl(src[k]) && k.trim()) { S.templates[k.trim().slice(0, 40)] = src[k]; n++; }
  if (!n) { toast('文件里没有模板', true); return; }
  storeTpl(); renderTpl(); toast(`导入 ${n} 个模板（同名已覆盖）`);
};

restoreOpts(); syncModeUI(); renderCustomPal(); renderPinned();
if (lockedTpl()) applyTpl(lockedTpl());
renderTpl();
