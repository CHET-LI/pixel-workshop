"""半身立绘（带背景）动起来：人物和背景分离 → 背景补全 → 人物分部位做循环待机。"""
import sys, math, os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'cli'))
from pxanim import *
from collections import deque, Counter
import colorsys
SRC = sys.argv[1] if len(sys.argv) > 1 else '/home/user/uploads/feng_standing_f1_1x.pxd.json'
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
os.makedirs(OUT, exist_ok=True)
s = load_pxd(SRC); art = s.frames[0][0]; pal = s.pal; H, W = art.shape
K = {c: i for i, c in enumerate(KEYS[:len(pal)])}

# ---------------------------------------------------------------- 1. 人物 / 背景分离
def segment():
    hls = [colorsys.rgb_to_hls(*[v / 255 for v in c[:3]]) for c in pal]
    passable = np.array([(h[2] < 0.40 and h[1] > 0.15) for h in hls]); passable[K['M']] = True
    P = passable[art]
    bg = np.zeros((H, W), bool); q = deque()
    for y in range(H):
        for x in (0, W - 1):
            if P[y, x]: bg[y, x] = True; q.append((y, x))
    for x in range(W):
        if P[0, x] and not bg[0, x]: bg[0, x] = True; q.append((0, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            Y, X = y + dy, x + dx
            if 0 <= Y < H and 0 <= X < W and not bg[Y, X] and P[Y, X]: bg[Y, X] = True; q.append((Y, X))
    ch = ~bg
    ch |= poly_mask(H, W, [(84, 12), (112, -1), (117, -1), (117, 14), (100, 23), (89, 28), (86, 26)])  # 剑身（灰色，会被当成背景）
    # 只保留和人物主体连通的部分（窗框之类的零碎深色块归背景）
    from scipy import ndimage
    lab, n = ndimage.label(ch)
    sizes = ndimage.sum(ch, lab, range(1, n + 1))
    keep = 1 + int(np.argmax(sizes))
    m = lab == keep
    m[0:4, 56:71] = False; m[4:9, 56:62] = False                     # 头顶后面的木柱子是背景
    for y in range(H):                                               # 图片左边框那条黑线
        if not (78 <= y <= 89) and art[y, 0] == K['0']: m[y, 0] = False
    return m

# ---------------------------------------------------------------- 2. 背景补全（人物身后被挡住的部分）
def inpaint(img, hole):
    img = img.copy(); hole = hole.copy()
    while hole.any():
        ys, xs = np.nonzero(hole)
        upd = []
        for y, x in zip(ys, xs):
            c = Counter()
            for dy, dx, wgt in ((0, -1, 2), (0, 1, 2), (-1, 0, 1), (1, 0, 1)):  # 横向权重高：墙砖是横纹
                Y, X = y + dy, x + dx
                if 0 <= Y < H and 0 <= X < W and not hole[Y, X]: c[int(img[Y, X])] += wgt
            if sum(c.values()) >= 2: upd.append((y, x, c.most_common(1)[0][0]))
        if not upd:  # 孤立区域：放宽条件
            for y, x in zip(ys, xs):
                for dy, dx in ((0, -1), (0, 1), (-1, 0), (1, 0)):
                    Y, X = y + dy, x + dx
                    if 0 <= Y < H and 0 <= X < W and not hole[Y, X]: upd.append((y, x, int(img[Y, X]))); break
        for y, x, v in upd: img[y, x] = v; hole[y, x] = False
    return img

mask = segment()
char = np.where(mask, art, -1).astype(np.int16)
plate = inpaint(art, mask)

# ---------------------------------------------------------------- 3. 分部位
SPLIT = 112                                               # 腰带下沿：以上呼吸起伏
tail_m = poly_mask(H, W, [(76, 28), (90, 28), (101, 44), (105, 60), (105, 82), (92, 82), (88, 62), (80, 50)]) & mask
hemL_m = mask & poly_mask(H, W, [(0, 122), (36, 122), (36, 167), (0, 167)])
hemR_m = mask & poly_mask(H, W, [(86, 122), (117, 122), (117, 167), (86, 167)])

def shear_mask(a, m, y0, y1, amt):
    """m 内的像素逐行横移（越往下越多），返回移动后的那一块。"""
    part = np.where(m, a, -1); out = np.full_like(a, -1)
    for y in range(H):
        if not m[y].any(): continue
        d = 0 if y < y0 else int(round(amt * min(1, (y - y0 + 1) / (y1 - y0 + 1))))
        row = part[y]
        if d > 0: out[y, d:] = row[:W - d]
        elif d < 0: out[y, :W + d] = row[-d:]
        else: out[y] = row
    return out

EYE_HALF = {36: 'CHHHHEI', 37: 'EILLLIL', 38: 'E22222a'}                  # x=42..48
EYE_SHUT = {36: 'CHHHHEI', 37: 'EILLLIL', 38: 'EILLLLI', 39: 'k22222a', 40: 'EBBBBLL'}
def eye(a, rows, dy):
    for y, r in rows.items():
        for i, ch in enumerate(r): a[y - dy, 42 + i] = K[ch]

# 剑身中轴（用于反光）
ys_e, xs_e = np.nonzero(char == K['e'])
def glint(a, t, dy):
    """沿剑身从护手往剑尖扫一道亮光。t∈[0,1]"""
    p0, p1 = np.array([88.0, 20.0]), np.array([116.0, 2.0])
    d = (p1 - p0) / np.linalg.norm(p1 - p0)
    c = p0 + (p1 - p0) * t
    for y, x in zip(ys_e, xs_e):
        along = (x - c[0]) * d[0] + (y - c[1]) * d[1]
        Y = y - dy
        if 0 <= Y < H and a[Y, x] == K['e']:
            if abs(along) < 0.9: a[Y, x] = K['g']
            elif abs(along) < 1.9: a[Y, x] = K['f']

N = 16
# ---------------------------------------------------------------- 4. 柔和变形（替代整行错位）
# 马尾：从发根到发尾权重 0→1，波从上往下传（发尾比发根慢半拍）；权重边缘高斯羽化，不撕裂
yy, xx = np.mgrid[0:H, 0:W].astype(float)
tail_w = smooth_mask(tail_m, 2.5) * np.clip((yy - 30) / 50, 0, 1) ** 1.3
# 披风下摆：越往下摆幅越大，波沿水平方向传过去（一片片羽毛依次飘）
hem_w = smooth_mask(hemL_m | hemR_m, 2.5) * np.clip((yy - 118) / 49, 0, 1) ** 1.5
frames = []
for k in range(N):
    ph = 2 * math.pi * k / N
    dx = (1.6 * tail_w * np.sin(ph - (yy - 30) / 18)                          # 马尾：向右为主的摆动
          + 1.3 * hem_w * np.sin(ph * 1 + xx / 9) * np.where(xx < 58, -1, 1))  # 下摆：两侧向外
    dy = 0.5 * hem_w * np.cos(ph + xx / 9)                                    # 下摆轻微上下
    c = warp(char, dx, dy)
    if k in (12, 14): eye(c, EYE_HALF, 0)
    if k == 13: eye(c, EYE_SHUT, 0)
    if k <= 6: glint(c, k / 6, 0)
    frame = plate.copy(); over(frame, c)
    frames.append((frame, plate.copy(), c))

save_pxd(f'{OUT}/feng_half_idle.pxd.json', [[f[0]] for f in frames], pal, durs=[100] * N,
         meta={'note': '合成后的完整画面（背景+人物）', 'fps': 10, 'loop': True}, name='feng_half_idle')
save_pxd(f'{OUT}/feng_half_idle_layers.pxd.json', [[f[1], f[2]] for f in frames], pal, durs=[100] * N,
         layers=['背景（已补全）', '人物'], meta={'note': '分层版：背景被人物挡住的部分已补全，人物单独一层', 'fps': 10, 'loop': True}, name='feng_half_idle_layers')
# 调试图：分离结果
sheet_png(f'{OUT}/分离检查_原图_补全背景_人物.png', [art, plate, char], pal, 3)
print('ok', mask.sum())
