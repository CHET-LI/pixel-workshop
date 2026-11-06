#!/usr/bin/env node
// 像素工坊 命令行（v1.3）：和网页版用同一套 core.js 算法，给脚本 / AI 代理用。
//   node cli/pw.js convert  <AI图.png> [--template 模板.json [--tname 名字]] [--colors N] [--size 块大小] [--no-bg] [--trim] [--out 目录] [--name 名字]
//   node cli/pw.js topxd    <像素图.png...> [--layers] [--dur 120] [--out x.pxd.json] [--name 名字]   多张 = 多帧（--layers 则为多层）
//   node cli/pw.js render   <x.pxd.json> [--scale 4] [--out 目录] [--bg #rrggbb]     → 逐帧 PNG + 横排精灵表 + GIF
//   node cli/pw.js info     <x.pxd.json | 图.png>
//   node cli/pw.js frompxw  <x.pxw.json> [--out x.pxd.json]                           编辑器项目 → PXD
// 只依赖 node 自带模块（zlib / fs / path）。PNG 读写：8 位灰度/RGB/RGBA/调色板，隔行图不支持。
'use strict';
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const PX = require(path.join(__dirname, '..', 'src', 'core.js'));

// ------------------------------------------------------------------ PNG
function readPNG(file) {
  const b = fs.readFileSync(file);
  if (b.readUInt32BE(0) !== 0x89504e47) throw new Error(file + ' 不是 PNG（JPG/WebP 请先转 PNG）');
  let p = 8, w, h, depth, ct, il, plte = null, trns = null; const idat = [];
  while (p < b.length) {
    const len = b.readUInt32BE(p), type = b.toString('ascii', p + 4, p + 8), d = b.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); depth = d[8]; ct = d[9]; il = d[12]; }
    else if (type === 'PLTE') plte = d; else if (type === 'tRNS') trns = d; else if (type === 'IDAT') idat.push(d); else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (depth !== 8 || il) throw new Error('只支持 8 位、非隔行 PNG：' + file);
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ct], bpp = ch, stride = w * bpp;
  const raw = zlib.inflateSync(Buffer.concat(idat)), px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), o = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[o + x - bpp] : 0, up = y ? px[o - stride + x] : 0, c = (x >= bpp && y) ? px[o - stride + x - bpp] : 0;
      let v = src[x];
      if (f === 1) v += a; else if (f === 2) v += up; else if (f === 3) v += (a + up) >> 1;
      else if (f === 4) { const pp = a + up - c, pa = Math.abs(pp - a), pb = Math.abs(pp - up), pc = Math.abs(pp - c); v += (pa <= pb && pa <= pc) ? a : pb <= pc ? up : c; }
      px[o + x] = v & 255;
    }
  }
  const img = PX.makeImage(w, h);
  for (let i = 0; i < w * h; i++) {
    let r, g, bl, al = 255;
    if (ct === 6) { r = px[i * 4]; g = px[i * 4 + 1]; bl = px[i * 4 + 2]; al = px[i * 4 + 3]; }
    else if (ct === 2) { r = px[i * 3]; g = px[i * 3 + 1]; bl = px[i * 3 + 2]; }
    else if (ct === 0) { r = g = bl = px[i]; }
    else if (ct === 4) { r = g = bl = px[i * 2]; al = px[i * 2 + 1]; }
    else { const k = px[i]; r = plte[k * 3]; g = plte[k * 3 + 1]; bl = plte[k * 3 + 2]; if (trns && k < trns.length) al = trns[k]; }
    img.data.set([r, g, bl, al], i * 4);
  }
  return img;
}
function writePNG(file, img) {
  const w = img.width, h = img.height, raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; Buffer.from(img.data.buffer, img.data.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1); }
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t, 'ascii'), d]); const c = Buffer.alloc(4); c.writeUInt32BE(PX.crc32(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6;
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]));
}

// ------------------------------------------------------------------ args
function parse(argv) {
  const pos = [], o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) { const k = a.slice(2); if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) o[k] = argv[++i]; else o[k] = true; }
    else pos.push(a);
  }
  return { pos, o };
}
const base = f => path.basename(f).replace(/\.(pxd|pxw)?\.?json$/i, '').replace(/\.[a-z0-9]+$/i, '');
const writeText = (f, s) => { fs.mkdirSync(path.dirname(path.resolve(f)), { recursive: true }); fs.writeFileSync(f, s); };
const loadPXD = f => PX.fromPXD(JSON.parse(fs.readFileSync(f, 'utf8')));

function templateOpts(file, tname) {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  const list = j.templates || (j.opts ? [j] : null);
  if (!list || !list.length) throw new Error('模板文件里没有模板');
  const t = tname ? list.find(x => x.name === tname) : list[0];
  if (!t) throw new Error('找不到模板：' + tname + '（有：' + list.map(x => x.name).join('、') + '）');
  const o = Object.assign({}, t.opts);
  for (const k in o) { const d = PX.DEFAULTS[k]; if (typeof d === 'number') o[k] = +o[k]; else if (typeof d === 'boolean') o[k] = o[k] === true || o[k] === 'true'; }
  if (t.pal && t.pal.length) { o.palette = t.pal.slice(); if (!o.paletteMode || o.paletteMode === 'auto') o.paletteMode = 'custom'; }
  if (t.pinned) o.pinned = t.pinned.slice();
  return { opts: o, name: t.name };
}

// ------------------------------------------------------------------ commands
const CMD = {};
CMD.convert = ({ pos, o }) => {
  const src = pos[0]; if (!src) throw new Error('用法：convert <图.png>');
  const img = readPNG(src);
  let opts = {}, tn = null;
  if (o.template) { const t = templateOpts(o.template, o.tname); opts = t.opts; tn = t.name; }
  if (o.colors) opts.colors = +o.colors;
  if (o.size) { opts.mode = 'size'; opts.size = +o.size; }
  if (o['no-bg']) opts.bgAuto = false;
  if (o.trim) opts.trim = true;
  const mode = opts.mode || PX.DEFAULTS.mode;
  const grid = mode === 'auto' ? PX.detectGrid(img) : null;
  if (grid && !grid.ok && !o.size) { const s = PX.suggestBlock(grid); opts.size = s && s.strength >= 3.5 ? Math.max(2, Math.round(s.size)) : 3; }
  const res = PX.convert(img, opts, grid, null);
  const name = o.name || base(src) + '_pixel', out = o.out || path.dirname(src);
  writePNG(path.join(out, name + '.png'), res.image);
  const g = res.report.geo;
  const pxd = PX.toPXD({ w: res.image.width, h: res.image.height, name, palette: res.palette, frames: [{ dur: 120, cels: [res.image.data] }],
    meta: { source: path.basename(src), block: +(+g.sizeX).toFixed(3), grid: grid ? { ok: grid.ok, conf: grid.conf } : null, template: tn } });
  writeText(path.join(out, name + '.pxd.json'), PX.pxdStringify(pxd));
  console.log(JSON.stringify({ out: path.join(out, name + '.pxd.json'), size: [res.image.width, res.image.height], block: +(+g.sizeX).toFixed(3), grid_ok: grid ? grid.ok : null, colors: res.palette.length, steps: res.report.steps }));
};
CMD.topxd = ({ pos, o }) => {
  if (!pos.length) throw new Error('用法：topxd <图.png...>');
  const imgs = pos.map(readPNG), w = imgs[0].width, h = imgs[0].height;
  imgs.forEach((im, i) => { if (im.width !== w || im.height !== h) throw new Error(pos[i] + ' 尺寸不一致'); });
  const dur = +(o.dur || 120), name = o.name || base(pos[0]);
  const doc = o.layers
    ? { w, h, name, layers: pos.map(f => ({ name: base(f), visible: true, opacity: 100 })), frames: [{ dur, cels: imgs.map(i => i.data) }] }
    : { w, h, name, frames: imgs.map((im, i) => ({ dur, name: base(pos[i]), cels: [im.data] })) };
  const out = o.out || path.join(path.dirname(pos[0]), name + '.pxd.json');
  const pxd = PX.toPXD(doc); writeText(out, PX.pxdStringify(pxd));
  console.log(JSON.stringify({ out, size: [w, h], frames: pxd.frames.length, layers: pxd.layers.length, colors: pxd.palette.length }));
};
CMD.render = ({ pos, o }) => {
  const doc = loadPXD(pos[0]), s = +(o.scale || 1), name = base(pos[0]), out = o.out || path.join(path.dirname(pos[0]), name + '_render');
  const bg = o.bg ? PX.parseHex(o.bg) : null;
  const frames = doc.frames.map((f, i) => {
    let im = PX.flattenFrame(doc, i);
    if (bg) { const d = im.data; for (let k = 0; k < d.length; k += 4) { const a = d[k + 3] / 255; for (let c = 0; c < 3; c++) d[k + c] = d[k + c] * a + bg[c] * (1 - a); d[k + 3] = 255; } }
    return PX.scaleNearest(im, s);
  });
  frames.forEach((im, i) => writePNG(path.join(out, `${name}_${String(i + 1).padStart(2, '0')}.png`), im));
  const W = frames[0].width, H = frames[0].height, sheet = PX.makeImage(W * frames.length, H);
  frames.forEach((im, i) => { for (let y = 0; y < H; y++) sheet.data.set(im.data.subarray(y * W * 4, (y + 1) * W * 4), (y * sheet.width + i * W) * 4); });
  writePNG(path.join(out, `${name}_sheet.png`), sheet);
  if (frames.length > 1) fs.writeFileSync(path.join(out, `${name}.gif`), Buffer.from(PX.encodeGIF(frames, doc.frames.map(f => f.dur), true)));
  console.log(JSON.stringify({ out, frames: frames.length, size: [W, H] }));
};
CMD.info = ({ pos }) => {
  const f = pos[0];
  if (/\.json$/i.test(f)) { const j = JSON.parse(fs.readFileSync(f, 'utf8')); console.log(JSON.stringify({ name: j.name, size: [j.w, j.h], colors: j.palette.length, layers: (j.layers || []).map(l => l.name), frames: j.frames.length, meta: j.meta || {} }, null, 1)); }
  else { const im = readPNG(f), st = PX.colorStats(im), g = PX.detectGrid(im); console.log(JSON.stringify({ size: [im.width, im.height], colors: st.colors, grid: { ok: g.ok, sizeX: g.sizeX, sizeY: g.sizeY, conf: g.conf } })); }
};
CMD.frompxw = ({ pos, o }) => {
  const j = JSON.parse(fs.readFileSync(pos[0], 'utf8'));
  if (j.app !== 'PixelWorkshop' || !j.frames) throw new Error('不是像素工坊项目');
  const un = s => new Uint8ClampedArray(Buffer.from(s, 'base64'));
  const doc = { w: j.w, h: j.h, name: j.name, palette: j.palette, layers: j.layers, frames: j.frames.map(f => ({ dur: f.dur, cels: f.cels.map(un) })), meta: j.meta };
  const out = o.out || pos[0].replace(/(\.pxw)?\.json$/i, '.pxd.json');
  writeText(out, PX.pxdStringify(PX.toPXD(doc))); console.log(JSON.stringify({ out }));
};

if (require.main === module) {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!CMD[cmd]) { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 8).map(l => l.replace(/^\/\/ ?/, '')).join('\n')); process.exit(cmd ? 1 : 0); }
  try { CMD[cmd](parse(rest)); } catch (e) { console.error('错误：' + e.message); process.exit(1); }
}
module.exports = { readPNG, writePNG, CMD };
