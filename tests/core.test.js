const PX = require('../src/core.js'); const fs = require('fs');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
function load(p) { const b = fs.readFileSync(p); const w = b.readUInt32LE(0), h = b.readUInt32LE(4); return PX.makeImage(w, h, new Uint8ClampedArray(b.buffer, b.byteOffset + 8, w * h * 4).slice()); }
// synthetic: 20x12 logical image, scaled by 5.5 with a 2px offset and blur-ish AA
const rnd = PX.rng(3); const lw = 40, lh = 24, s = 5.5, off = 2;
const logical = PX.makeImage(lw, lh); for (let i = 0; i < lw * lh; i++) { const c = [[200,40,40],[30,30,30],[240,230,200],[60,140,60]][Math.floor(rnd()*4)]; logical.data.set([...c,255], i*4); }
const W = Math.round(lw * s + off + 3), H = Math.round(lh * s + off + 3), big = PX.makeImage(W, H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const lx = Math.floor((x - off) / s), ly = Math.floor((y - off) / s); const i = (y*W+x)*4;
  if (lx < 0 || ly < 0 || lx >= lw || ly >= lh) { big.data.set([240,230,200,255], i); continue; }
  const j = (ly*lw+lx)*4; for (let k = 0; k < 3; k++) big.data[i+k] = Math.max(0, Math.min(255, logical.data[j+k] + (rnd()*16-8))); big.data[i+3] = 255; }
const g = PX.detectGrid(big);
ok(g.ok && Math.abs(g.sizeX - 5.5) < 0.08 && Math.abs(g.sizeY - 5.5) < 0.08, 'grid size 5.5 got ' + JSON.stringify(g, (k, v) => k.startsWith('prof') ? undefined : v));
const geo = PX.geometry(big, PX.DEFAULTS, g); const small = PX.downsample(big, geo.cx, geo.cy, 'dominant');
let match = 0, total = 0;
for (const [ax, ay] of [[0,0],[1,0],[0,1],[1,1]]) { let m = 0, t = 0;
  for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) { const sx = x + ax, sy = y + ay; if (sx >= small.width || sy >= small.height) continue; t++; const a = (y*lw+x)*4, b = (sy*small.width+sx)*4; if (Math.abs(logical.data[a]-small.data[b]) < 12 && Math.abs(logical.data[a+1]-small.data[b+1]) < 12) m++; }
  if (m > match) { match = m; total = t; } }
ok(match / total > 0.97, 'downsample recovers logical pixels ' + match + '/' + total + ' size ' + small.width + 'x' + small.height);
// cells
ok(PX.cells(100, 10, 0).length === 10 && PX.cells(100, 10, 5).length === 11, 'cells count');
// palettes
ok(PX.parsePalette('GIMP Palette\nName: x\n#\n255 0 0 red\n  0 255 0\n').join() === '#ff0000,#00ff00', 'gpl');
ok(PX.parsePalette('JASC-PAL\n0100\n2\n1 2 3\n4 5 6\n').join() === '#010203,#040506', 'jasc');
ok(PX.parsePalette('ff0000\n#00ff00\n;c\nFF0000FF\n').join() === '#ff0000,#00ff00,#0000ff', 'hex + paint.net');
ok(PX.parsePalette(PX.paletteToGPL(PX.PRESETS['PICO-8'])).length === 16, 'gpl roundtrip');
// oklab roundtrip
let maxErr = 0; for (let i = 0; i < 500; i++) { const c = [rnd()*255|0, rnd()*255|0, rnd()*255|0]; const r = PX.fromLab(...PX.toLab(...c)); maxErr = Math.max(maxErr, ...r.map((v, k) => Math.abs(v - c[k]))); }
ok(maxErr <= 1, 'oklab roundtrip err ' + maxErr);
// islands keep far-colour highlights, absorb near colours
{ const w = 5, h = 5, pal = ['#202020', '#c05030', '#c85838', '#ffffff']; const idx = new Int16Array(25).fill(1); idx[6] = 2; idx[18] = 3;
  PX.mergeIslands(idx, w, h, pal, 2, 0.12, null); ok(idx[6] === 1 && idx[18] === 3, 'island merge near only'); 
  const idx2 = new Int16Array(25).fill(1); idx2[6] = 2; const prot = new Uint8Array(25); prot[6] = 1; PX.mergeIslands(idx2, w, h, pal, 2, 0.12, prot); ok(idx2[6] === 2, 'protect mask'); }
{ const pal = ['#000000', '#ff0000', '#fe0101']; const idx = new Int16Array(100).fill(1); idx[5] = 2; PX.mergeRare(idx, pal, 3, null); ok(idx[5] === 1, 'rare merge'); }
{ // pixel perfect: L corner removed
  const w = 5, h = 5, idx = new Int16Array(25).fill(-1); [[1,1],[1,2],[2,2],[3,2]].forEach(([x,y]) => idx[y*w+x] = 0); PX.pixelPerfect(idx, w, h, 0); ok(idx[2*w+1] === -1, 'pixel perfect L'); }
// real AI sample
const fox = load('/tmp/px/fox.rgba'); const t0 = Date.now();
const gf = PX.detectGrid(fox); console.log('fox grid', JSON.stringify(gf, (k, v) => k.startsWith('prof') ? undefined : v), Date.now() - t0, 'ms');
const t1 = Date.now(); const res = PX.convert(fox, { colors: 16 }, gf, null); console.log('fox convert', res.report.w + 'x' + res.report.h, 'raw', res.report.rawColors, '->', res.report.colors, JSON.stringify(res.report.steps), Date.now() - t1, 'ms');
ok(gf.ok && res.report.colors <= 16 && res.report.colors >= 8, 'fox converts to <=16 colours');
fs.writeFileSync('/tmp/px/fox_out.rgba', Buffer.concat([Buffer.from(new Uint32Array([res.image.width, res.image.height]).buffer), Buffer.from(res.image.data.buffer)]));
const res2 = PX.convert(fox, { paletteMode: 'custom', palette: PX.PRESETS['Sweetie 16'], outlineUnify: true, pixelPerfect: true, trim: true }, gf, null);
fs.writeFileSync('/tmp/px/fox_sw.rgba', Buffer.concat([Buffer.from(new Uint32Array([res2.image.width, res2.image.height]).buffer), Buffer.from(res2.image.data.buffer)]));
ok(res2.palette.length === 16 && res2.crop, 'custom palette + trim');
// gif + zip for python verification
const f1 = res.image, f2 = PX.cloneImage(res.image); for (let i = 0; i < f2.data.length; i += 4) if (f2.data[i+3]) f2.data[i] = 255 - f2.data[i];
fs.writeFileSync('/tmp/px/anim.gif', PX.encodeGIF([f1, f2], [100, 200], true));
const noise = PX.makeImage(97, 61); for (let i = 0; i < noise.data.length; i += 4) noise.data.set([rnd()*255|0, rnd()*255|0, rnd()*255|0, rnd() < 0.1 ? 0 : 255], i);
fs.writeFileSync('/tmp/px/noise.gif', PX.encodeGIF([noise], [100], false));
fs.writeFileSync('/tmp/px/noise.rgba', Buffer.concat([Buffer.from(new Uint32Array([97, 61]).buffer), Buffer.from(noise.data.buffer)]));
fs.writeFileSync('/tmp/px/t.zip', PX.zip([{ name: '狐狸.txt', data: new TextEncoder().encode('hello') }, { name: 'b.bin', data: new Uint8Array([1,2,3]) }]));

// v1.3 PXD: round trip (layers, frames, alpha, meta) and >90-colour fallback
{
  const w = 5, h = 3, a = new Uint8ClampedArray(w * h * 4), b = new Uint8ClampedArray(w * h * 4);
  a.set([255, 0, 0, 255], 0); a.set([0, 255, 0, 255], 4 * 6); b.set([0, 0, 255, 128], 4 * 14);
  const doc = { w, h, name: 't', palette: ['#ff0000'], layers: [{ name: 'A', visible: true, opacity: 100 }, { name: 'B', visible: false, opacity: 40 }],
    frames: [{ dur: 90, cels: [a, b] }, { dur: 200, name: 'k2', cels: [b, a] }], meta: { foot: [2, 2] } };
  const txt = PX.pxdStringify(PX.toPXD(doc)), back = PX.fromPXD(JSON.parse(txt));
  ok(back.frames.length === 2 && back.layers[1].name === 'B' && back.layers[1].visible === false && back.layers[1].opacity === 40, 'pxd layers');
  ok(Buffer.from(back.frames[0].cels[0]).equals(Buffer.from(a)) && Buffer.from(back.frames[1].cels[0]).equals(Buffer.from(b)), 'pxd pixels exact incl. alpha');
  ok(back.frames[1].dur === 200 && back.frames[1].name === 'k2' && back.meta.foot[1] === 2, 'pxd dur/name/meta');
  ok(txt.split('\n').some(l => l.trim() === '"0....",'), 'pxd one row per line');
  const W = 20, H = 10, many = new Uint8ClampedArray(W * H * 4); for (let i = 0; i < W * H; i++) many.set([i, (i * 7) & 255, 9, 255], i * 4);
  const pm = PX.toPXD({ w: W, h: H, frames: [{ cels: [many] }] });
  ok(pm.keyWidth === 2 && Buffer.from(PX.fromPXD(pm).frames[0].cels[0]).equals(Buffer.from(many)), 'pxd 2-char keys for 200 colours');
  const fl = PX.flattenFrame(back, 0); ok(fl.data[3] === 255 && fl.data[14 * 4 + 3] === 0, 'flatten respects hidden layer');
}
console.log('RESULT pass=' + pass + ' fail=' + fail);
