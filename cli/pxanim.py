#!/usr/bin/env python3
"""pxanim：读写像素工坊 PXD 像素数据，按部位拆件，然后用代码做动画（像素工坊 v1.3 配套）。

所有操作都在“色板索引”上进行（-1 = 透明），输出永远只用源图色板里的颜色，不会产生新颜色。

    from pxanim import *
    spr = load_pxd('feng_front.pxd.json')          # Sprite: .pal（RGBA 列表）.frames[帧][层] -> np.int16 (H,W)
    art = spr.frames[0][0]
    parts = labels_to_parts(art, label_map, names) # 按部位图拆件
    out = compose(W, H, [(parts['leg_l'], dx, dy), ...])
    save_pxd('feng_run_front.pxd.json', [[f] for f in frames], spr.pal, durs=[100]*6, meta={...})

部位图（parts）也是 PXD：第 1 层原图，第 2 层“部位”每个部位一种颜色，meta.parts 里写着
颜色 → 部位名。在像素工坊编辑器里打开后，可以用铅笔修改部位层，保存后重新运行动画脚本。
依赖：numpy、Pillow。
"""
import json, math
import numpy as np
from PIL import Image

KEYS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ!#$%&()*+,-/:;<=>?@[]^_{|}~'


# ------------------------------------------------------------------ PXD I/O
def _hex_to_rgba(h):
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), int(h[6:8], 16) if len(h) >= 8 else 255)


def _rgba_to_hex(c):
    s = '#%02x%02x%02x' % tuple(c[:3])
    return s if len(c) < 4 or c[3] == 255 else s + '%02x' % c[3]


class Sprite:
    def __init__(self, w, h, pal, frames, layers=None, durs=None, meta=None, name='sprite', frame_names=None):
        self.w, self.h, self.pal, self.frames = w, h, list(pal), frames
        self.layers = layers or [{'name': '图层 %d' % (i + 1), 'visible': True, 'opacity': 100} for i in range(len(frames[0]))]
        self.durs = durs or [120] * len(frames)
        self.meta = meta or {}
        self.name = name
        self.frame_names = frame_names or [None] * len(frames)

    def layer(self, name, frame=0):
        for i, l in enumerate(self.layers):
            if l['name'] == name:
                return self.frames[frame][i]
        raise KeyError(name)


def load_pxd(path):
    j = json.load(open(path, encoding='utf-8'))
    assert j.get('format') == 'pxd', path + ' 不是 PXD'
    kw, key, T = j.get('keyWidth', 1), j.get('key', KEYS), j.get('transparent', '.')
    n = len(j['palette'])
    lut = {(key[i] if kw == 1 else key[i // len(key)] + key[i % len(key)]): i for i in range(n)}
    w, h = j['w'], j['h']
    frames = []
    for f in j['frames']:
        cels = []
        for rows in f['cels']:
            a = np.full((h, w), -1, np.int16)
            for y, r in enumerate(rows[:h]):
                for x in range(min(w, len(r) // kw)):
                    ch = r[x * kw:(x + 1) * kw]
                    if ch[0] != T:
                        a[y, x] = lut[ch]
            cels.append(a)
        frames.append(cels)
    return Sprite(w, h, [_hex_to_rgba(c) for c in j['palette']], frames, j.get('layers'),
                  [f.get('dur', 120) for f in j['frames']], j.get('meta', {}), j.get('name', 'sprite'),
                  [f.get('name') for f in j['frames']])


def pxd_dumps(obj):
    """与 core.js 的 PX.pxdStringify 相同的排版：一行一行像素。"""
    L = ['{']
    for k, v in obj.items():
        if k != 'frames':
            L.append('  %s: %s,' % (json.dumps(k), json.dumps(v, ensure_ascii=False, separators=(',', ':'))))
    L.append('  "frames": [')
    for fi, f in enumerate(obj['frames']):
        hd = {k: v for k, v in f.items() if k != 'cels'}
        L.append('    {' + ', '.join('%s: %s' % (json.dumps(k), json.dumps(v, ensure_ascii=False)) for k, v in hd.items()) + (', ' if hd else '') + '"cels": [')
        for ci, cel in enumerate(f['cels']):
            L.append('      [')
            for ri, r in enumerate(cel):
                L.append('        ' + json.dumps(r) + (',' if ri < len(cel) - 1 else ''))
            L.append('      ]' + (',' if ci < len(f['cels']) - 1 else ''))
        L.append('    ]}' + (',' if fi < len(obj['frames']) - 1 else ''))
    L += ['  ]', '}']
    return '\n'.join(L) + '\n'


def save_pxd(path, frames, pal, durs=None, layers=None, meta=None, name=None, frame_names=None, compact_palette=True):
    """frames: [帧][层] 的索引数组（同尺寸）。默认去掉没用到的颜色并重新编号。"""
    h, w = frames[0][0].shape
    pal = [tuple(c) for c in pal]
    if compact_palette:
        used = sorted(set(int(v) for f in frames for c in f for v in np.unique(c) if v >= 0))
        remap = np.full(len(pal) + 1, -1, np.int32)
        for i, u in enumerate(used):
            remap[u] = i
        frames = [[np.where(c >= 0, remap[np.clip(c, 0, None)], -1) for c in f] for f in frames]
        pal = [pal[u] for u in used]
    kw = 1 if len(pal) <= len(KEYS) else 2
    code = (lambda i: KEYS[i]) if kw == 1 else (lambda i: KEYS[i // len(KEYS)] + KEYS[i % len(KEYS)])
    table = np.array([code(i) for i in range(len(pal))] + ['.' * kw])
    nl = len(frames[0])
    layers = layers or [{'name': '图层 %d' % (i + 1), 'visible': True, 'opacity': 100} for i in range(nl)]
    layers = [l if isinstance(l, dict) else {'name': l, 'visible': True, 'opacity': 100} for l in layers]
    out = {'format': 'pxd', 'v': 1, 'app': 'PixelWorkshop', 'name': name or 'sprite', 'w': w, 'h': h, 'keyWidth': kw,
           'transparent': '.', 'key': KEYS[:len(pal)] if kw == 1 else KEYS, 'palette': [_rgba_to_hex(c) for c in pal],
           'layers': layers}
    if meta:
        out['meta'] = meta
    fr = []
    for i, f in enumerate(frames):
        o = {'dur': int((durs or [120] * len(frames))[i])}
        if frame_names and frame_names[i]:
            o['name'] = frame_names[i]
        o['cels'] = [[''.join(table[np.where(row >= 0, row, len(pal))]) for row in c] for c in f]
        fr.append(o)
    out['frames'] = fr
    open(path, 'w', encoding='utf-8').write(pxd_dumps(out))
    return path


def from_png(path, pal=None, max_dist=0):
    """PNG -> 索引数组。pal 给定时吸附到该色板（max_dist>0 时超过距离的像素报错）。"""
    a = np.array(Image.open(path).convert('RGBA')).astype(np.int32)
    pal = list(pal or [])
    idx = np.full(a.shape[:2], -1, np.int16)
    op = a[..., 3] > 0
    cols = {tuple(c) for c in a[op].tolist()}
    lut = {}
    P = np.array([c[:3] for c in pal]) if pal else None
    for c in cols:
        if tuple(c) in [tuple(p) for p in pal]:
            lut[c] = [tuple(p) for p in pal].index(tuple(c))
        elif P is not None and max_dist:
            d = ((P - np.array(c[:3])) ** 2).sum(1)
            k = int(d.argmin())
            if d[k] > max_dist ** 2:
                raise ValueError('颜色 %s 不在色板里' % (c,))
            lut[c] = k
        else:
            pal.append(tuple(c)); lut[c] = len(pal) - 1
    ys, xs = np.nonzero(op)
    for y, x in zip(ys, xs):
        idx[y, x] = lut[tuple(a[y, x].tolist())]
    return idx, pal


def to_rgba(idx, pal, bg=None):
    P = np.array([list(c) + [255] * (4 - len(c)) for c in pal] + [[0, 0, 0, 0]], np.uint8)
    im = P[np.where(idx >= 0, idx, len(pal))]
    if bg is not None:
        b = np.zeros_like(im); b[...] = list(bg) + [255]
        a = im[..., 3:4] / 255.0
        im = (im * a + b * (1 - a)).astype(np.uint8); im[..., 3] = 255
    return Image.fromarray(im, 'RGBA')


# ------------------------------------------------------------------ geometry on index maps
def blank(w, h):
    return np.full((h, w), -1, np.int16)


def poly_mask(h, w, pts):
    """多边形（像素坐标，含边界）→ bool 掩码。"""
    from PIL import ImageDraw
    m = Image.new('L', (w, h), 0)
    ImageDraw.Draw(m).polygon([tuple(p) for p in pts], fill=1, outline=1)
    return np.array(m).astype(bool)


def shift(a, dx, dy):
    h, w = a.shape
    out = np.full_like(a, -1)
    xs0, xs1 = max(0, -dx), min(w, w - dx)
    ys0, ys1 = max(0, -dy), min(h, h - dy)
    if xs0 < xs1 and ys0 < ys1:
        out[ys0 + dy:ys1 + dy, xs0 + dx:xs1 + dx] = a[ys0:ys1, xs0:xs1]
    return out


def flip_h(a):
    return a[:, ::-1].copy()


def over(dst, src):
    """src 盖在 dst 上（就地修改 dst 并返回）。"""
    m = src >= 0
    dst[m] = src[m]
    return dst


def compose(w, h, layers):
    """layers: [(索引数组, dx, dy), ...] 从下到上。"""
    out = blank(w, h)
    for item in layers:
        if isinstance(item, tuple):
            a, dx, dy = item[0], (item[1] if len(item) > 1 else 0), (item[2] if len(item) > 2 else 0)
        else:
            a, dx, dy = item, 0, 0
        over(out, shift(a, int(dx), int(dy)))
    return out


def _scale2x(a):
    h, w = a.shape
    p = np.pad(a, 1, mode='edge')
    B, D, E, F, H = p[:-2, 1:-1], p[1:-1, :-2], p[1:-1, 1:-1], p[1:-1, 2:], p[2:, 1:-1]
    e0 = np.where((D == B) & (B != F) & (D != H), D, E)
    e1 = np.where((B == F) & (B != D) & (F != H), F, E)
    e2 = np.where((D == H) & (D != B) & (H != F), D, E)
    e3 = np.where((H == F) & (D != H) & (B != F), F, E)
    out = np.empty((h * 2, w * 2), a.dtype)
    out[0::2, 0::2], out[0::2, 1::2], out[1::2, 0::2], out[1::2, 1::2] = e0, e1, e2, e3
    return out


def rotsprite(a, deg, pivot, dst_pivot=None, out_shape=None):
    """RotSprite 式旋转：Scale2x×3 放大到 8 倍 → 最近邻旋转 → 取块中心采样。
    pivot：源图里的转轴（像素坐标，可以是小数）；dst_pivot：输出里转轴的位置（默认同 pivot）。"""
    h, w = a.shape
    oh, ow = out_shape or (h, w)
    dst_pivot = dst_pivot or pivot
    big = _scale2x(_scale2x(_scale2x(a)))
    S = 8
    yy, xx = np.mgrid[0:oh * S, 0:ow * S]
    # 输出 8 倍坐标 → 源 8 倍坐标（逆旋转）
    cx, cy = (dst_pivot[0] + 0.5) * S, (dst_pivot[1] + 0.5) * S
    sx0, sy0 = (pivot[0] + 0.5) * S, (pivot[1] + 0.5) * S
    t = math.radians(deg)
    c, s = math.cos(t), math.sin(t)
    X, Y = xx + 0.5 - cx, yy + 0.5 - cy
    sx = np.floor(c * X + s * Y + sx0).astype(np.int32)
    sy = np.floor(-s * X + c * Y + sy0).astype(np.int32)
    ok = (sx >= 0) & (sy >= 0) & (sx < w * S) & (sy < h * S)
    r8 = np.full((oh * S, ow * S), -1, a.dtype)
    r8[ok] = big[sy[ok], sx[ok]]
    # 下采样：取每个 8×8 块里中心附近 4 个样本的众数（避免细线断掉）
    sub = r8.reshape(oh, S, ow, S)[:, 3:5, :, 3:5].transpose(0, 2, 1, 3).reshape(oh, ow, 4)
    cnt = np.stack([(sub == sub[..., k:k + 1]).sum(-1) for k in range(4)], -1)
    best = cnt.argmax(-1)
    out = np.take_along_axis(sub, best[..., None], -1)[..., 0]
    return out


# ------------------------------------------------------------------ parts
PART_COLORS = ['#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#911eb4', '#46f0f0', '#f032e6',
               '#bcf60c', '#fabebe', '#008080', '#e6beff', '#9a6324', '#fffac8', '#800000', '#aaffc3']


def save_parts(path, art, pal, labels, names, meta=None, name=None):
    """把部位图存成两层 PXD：原图 + 部位（半透明），给人在编辑器里修改。labels: int 数组，-1=无。"""
    lp = [_hex_to_rgba(PART_COLORS[i % len(PART_COLORS)]) for i in range(len(names))]
    pal2 = list(pal) + lp
    lab = np.where(labels >= 0, labels + len(pal), -1).astype(np.int16)
    m = dict(meta or {})
    m['parts'] = {PART_COLORS[i % len(PART_COLORS)]: n for i, n in enumerate(names)}
    return save_pxd(path, [[art, lab]], pal2, layers=[{'name': '原图', 'visible': True, 'opacity': 100},
                                                       {'name': '部位', 'visible': True, 'opacity': 55}],
                    meta=m, name=name, compact_palette=False)


def load_parts(path):
    """读回（可能被人改过的）部位图 → (原图索引, 色板, labels, names)。"""
    spr = load_pxd(path)
    art, lab = spr.frames[0][0], spr.frames[0][1]
    parts = spr.meta['parts']
    names = list(parts.values())
    col2i = {_hex_to_rgba(c)[:3]: i for i, c in enumerate(parts.keys())}
    labels = np.full(lab.shape, -1, np.int16)
    for pi, c in enumerate(spr.pal):
        if c[:3] in col2i:
            labels[lab == pi] = col2i[c[:3]]
    return art, spr.pal, labels, names, spr.meta


def split_parts(art, labels, names):
    return {n: np.where(labels == i, art, -1).astype(np.int16) for i, n in enumerate(names)}


# ------------------------------------------------------------------ previews
def sheet_png(path, frames, pal, scale=4, bg=(214, 204, 182), pad=4):
    ims = [to_rgba(f, pal, bg) for f in frames]
    w, h = ims[0].size
    out = Image.new('RGBA', ((w + pad) * len(ims) + pad, h + pad * 2), tuple(bg) + (255,))
    for i, im in enumerate(ims):
        out.paste(im, (pad + i * (w + pad), pad))
    out.resize((out.width * scale, out.height * scale), Image.NEAREST).save(path)
    return path


# ------------------------------------------------------------------ smooth deformation (v1.3.1)
def smooth_mask(m, radius=3.0):
    """布尔掩码 → 0..1 的柔和权重（高斯模糊），让变形区和静止区之间没有硬边。"""
    from scipy import ndimage
    return np.clip(ndimage.gaussian_filter(m.astype(float), radius), 0, 1)


def warp(a, dx, dy=None, S=8):
    """连续位移场变形（亚像素）：先 Scale2x×3 放大到 8 倍，按位移场反向采样，再取块中心众数缩回。
    dx, dy：和 a 同尺寸的浮点数组，表示该处像素要移动多少格（可以是小数）。
    位移场要平滑（用 smooth_mask 做权重），这样不会出现撕裂和台阶。"""
    h, w = a.shape
    dy = np.zeros_like(dx) if dy is None else dy
    big = _scale2x(_scale2x(_scale2x(a)))
    from scipy import ndimage
    # 位移场放大到 8 倍（双线性）
    yy, xx = np.mgrid[0:h * S, 0:w * S]
    fy, fx = (yy + 0.5) / S - 0.5, (xx + 0.5) / S - 0.5
    DX = ndimage.map_coordinates(dx, [fy, fx], order=1, mode='nearest')
    DY = ndimage.map_coordinates(dy, [fy, fx], order=1, mode='nearest')
    sx = np.floor(xx - DX * S).astype(np.int32)
    sy = np.floor(yy - DY * S).astype(np.int32)
    ok = (sx >= 0) & (sy >= 0) & (sx < w * S) & (sy < h * S)
    r8 = np.full((h * S, w * S), -1, a.dtype)
    r8[ok] = big[sy[ok], sx[ok]]
    sub = r8.reshape(h, S, w, S)[:, 3:5, :, 3:5].transpose(0, 2, 1, 3).reshape(h, w, 4)
    cnt = np.stack([(sub == sub[..., k:k + 1]).sum(-1) for k in range(4)], -1)
    return np.take_along_axis(sub, cnt.argmax(-1)[..., None], -1)[..., 0]
