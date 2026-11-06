"""凤笑天（城镇小人像素图）→ 战斗待机/跑步。工作流示例：PXD 进，PXD 出。"""
import sys, json, os
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '..', 'cli'))
from pxanim import *

SRC = os.path.join(HERE, 'src')     # 源像素图（PXD）
OUT = os.path.join(HERE, 'out')     # 部位图 out/parts/ 与动画 PXD

def shear_rows(a, y0, y1, amt, x_lo=None, x_hi=None):
    """y0..y1 之间逐行横移，越往下移得越多（披风/发尾摆动）。只动 x 范围内的像素。"""
    out = a.copy()
    h, w = a.shape
    sel = np.zeros_like(a, bool); sel[y0:y1 + 1] = True
    if x_lo is not None: sel[:, :x_lo] = False
    if x_hi is not None: sel[:, x_hi + 1:] = False
    moving = np.where(sel, a, -1); out[sel] = -1
    for y in range(y0, min(h, y1 + 1)):
        d = int(round(amt * (y - y0 + 1) / (y1 - y0 + 1)))
        row = moving[y]
        if d: row = np.roll(row, d); (row.__setitem__(slice(0, d), -1) if d > 0 else row.__setitem__(slice(w + d, w), -1))
        m = row >= 0; out[y][m] = row[m]
    return out

def extend_up(a, n):
    """把每列最上面的像素往上复制 n 格（腿被裙子盖住的部分，身体上下动时不露缝）。"""
    out = a.copy()
    for x in range(a.shape[1]):
        ys = np.nonzero(a[:, x] >= 0)[0]
        if len(ys):
            y = ys[0]
            for k in range(1, n + 1):
                if y - k >= 0 and out[y - k, x] < 0: out[y - k, x] = a[y + 1 if y + 1 < a.shape[0] and a[y + 1, x] >= 0 else y, x]
    return out

# ------------------------------------------------------------------ 拆件规则（第一次自动生成，之后可在编辑器里改部位图）
def auto_labels(view, art, pal):
    h, w = art.shape
    names = ['body', 'leg_l', 'leg_r', 'cape_l', 'cape_r']
    lab = np.where(art >= 0, 0, -1).astype(np.int16)
    op = art >= 0
    BIG = h > 200        # 新版立绘（前 128x258 / 后 122x259）：腿更长，坐标按实测
    if view == 'front':
        if BIG:
            L = poly_mask(h, w, [(36, 178), (61, 178), (61, h - 1), (36, h - 1)])
            R = poly_mask(h, w, [(62, 178), (86, 178), (86, h - 1), (62, h - 1)])
            lab[op & L] = 1; lab[op & R] = 2
            CL = np.zeros_like(op); CL[163:, :38] = True
            CR = np.zeros_like(op); CR[163:, 87:] = True
        else:
            L = poly_mask(h, w, [(37, 119), (52, 119), (52, 124), (51, 140), (51, 146), (51, 165), (29, 165), (29, 152), (36, 146), (37, 140)])
            R = poly_mask(h, w, [(56, 119), (71, 119), (71, 140), (73, 146), (73, 165), (58, 165), (58, 146), (57, 140), (56, 124)])
            lab[op & L] = 1; lab[op & R] = 2
            CL = np.zeros_like(op); CL[100:150, :37] = True
            CR = np.zeros_like(op); CR[100:150, 72:] = True
        lab[op & CL & (lab == 0)] = 3; lab[op & CR & (lab == 0)] = 4
    elif view == 'back':
        grey = np.zeros_like(op)
        for i, c in enumerate(pal):
            r, g, b = c[:3]
            if abs(r - g) < 22 and abs(g - b) < 26 and r > 70: grey |= (art == i)
        if BIG:
            L = poly_mask(h, w, [(31, 186), (55, 186), (55, h - 1), (31, h - 1)])
            R = poly_mask(h, w, [(56, 186), (77, 186), (77, h - 1), (56, h - 1)])
            lab[op & L] = 1; lab[op & R] = 2
            CL = np.zeros_like(op); CL[168:, :31] = True
            CR = np.zeros_like(op); CR[168:, 76:] = True
        else:
            L = poly_mask(h, w, [(37, 139), (53, 139), (53, 166), (35, 166), (35, 150)])
            R = poly_mask(h, w, [(55, 139), (71, 139), (71, 166), (55, 166)])
            lab[op & L] = 1; lab[op & R] = 2
            CL = np.zeros_like(op); CL[112:142, :53] = True
            CR = np.zeros_like(op); CR[112:142, 53:] = True
        lab[op & CL & (lab == 0) & ~grey] = 3; lab[op & CR & (lab == 0) & ~grey] = 4
    elif view == 'right':
        names = ['body', 'thigh', 'shin', 'cape_b']
        T = poly_mask(h, w, [(43, 130), (59, 130), (59, 141), (43, 141)])
        S_ = poly_mask(h, w, [(42, 142), (57, 142), (57, 148), (64, 150), (65, 166), (41, 166)])
        lab[op & T] = 1; lab[op & S_] = 2
        CB = np.zeros_like(op); CB[106:150, :46] = True
        lab[op & CB & (lab == 0)] = 3
    return lab, names

def darken_map(pal, f=0.7):
    """每个颜色 → 色板里最接近“变暗后颜色”的那个（远侧腿用），不引入新颜色。"""
    P = np.array([c[:3] for c in pal], float)
    out = np.arange(len(pal))
    for i, c in enumerate(P):
        t = c * f
        d = ((P - t) ** 2).sum(1); d[i] = 1e9
        out[i] = int(d.argmin())
    return out

def remap(a, m):
    return np.where(a >= 0, m[np.clip(a, 0, None)], -1).astype(np.int16)

def anim_side():
    view = 'right'
    art, pal, lab, names = load_view(view)
    P = split_parts(art, lab, names)
    W, H = art.shape[1], art.shape[0]
    thigh = extend_up(P['thigh'], 5)
    shin = P['shin']
    HIP, KNEE, GROUND = (51, 128), (50, 142), 164
    dk = darken_map(pal, 0.68)
    def leg(th, bend, dark=False):
        # 大腿绕胯转，小腿先绕膝转（相对弯曲），再跟着大腿走
        # rotsprite 的正角度 = 顺时针（脚往后）；这里约定 th>0 = 脚往前，所以取负
        t = rotsprite(thigh, -th, HIP)
        import math
        r = math.radians(-th); c, s_ = math.cos(r), math.sin(r)
        dx, dy = KNEE[0] - HIP[0], KNEE[1] - HIP[1]
        kx, ky = HIP[0] + c * dx - s_ * dy, HIP[1] + s_ * dx + c * dy
        sh = rotsprite(shin, -(th - bend), KNEE, dst_pivot=(kx, ky))
        g = compose(W, H, [sh, t])
        return remap(g, dk) if dark else g
    def low(a):
        ys = np.nonzero((a >= 0).any(1))[0]; return ys.max() if len(ys) else GROUND
    frames = {}
    idle = []
    for dy, sw in [(0, 0), (1, -1)]:
        cb = shear_rows(P['cape_b'], 108, 149, sw)
        idle.append(compose(W, H, [(leg(-4, 0, True), 3, 0), (cb, 0, dy), leg(3, 0), (P['body'], 0, dy)]))
    frames['idle'] = idle
    RUN = [(28, 8), (10, 25), (-15, 15), (-30, 22), (-12, 95), (25, 65)]
    BOB = [0, 1, -1, 0, 1, -1]
    run = []
    for k in range(6):
        nt, nb = RUN[k]; ft, fb = RUN[(k + 3) % 6]
        near, far = leg(nt, nb), leg(ft, fb, True)
        foot = max(low(near), low(far))
        dy = GROUND - foot + BOB[k]
        cb = shear_rows(P['cape_b'], 108, 149, -1 - (k % 3 == 1))
        run.append(compose(W, H, [(far, 2, dy), (cb, 0, dy), (near, 0, dy), (P['body'], 0, dy)]))
    frames['run'] = run
    return frames, pal

def load_view(view):
    pp = f'{OUT}/parts/feng_{view}_parts.pxd.json'
    s = load_pxd(f'{SRC}/feng_{view}.pxd.json')
    art = s.frames[0][0].copy()
    # 修掉两腿之间那道灰线（README 里记录的已知问题）；新版立绘没有这个问题
    if view in ('front', 'back') and art.shape[0] < 200:
        for y in range(134 if view == 'back' else 144, 150):
            for x in range(50, 60):
                v = art[y, x]
                if v >= 0:
                    r, g, b = s.pal[v][:3]
                    if abs(r - g) < 20 and abs(g - b) < 20 and r > 60: art[y, x] = -1
    if os.path.exists(pp):          # 人改过的部位图优先
        art2, pal2, lab, names, _ = load_parts(pp)
        return art2, pal2, lab, names
    lab, names = auto_labels(view, art, s.pal)
    os.makedirs(os.path.dirname(pp), exist_ok=True)
    save_parts(pp, art, s.pal, lab, names, meta={'view': view, 'note': '第 2 层是部位图：改颜色归属后保存，重新运行脚本即可'}, name=f'feng_{view}_parts')
    return art, s.pal, lab, names

def anim_front_back(view):
    art, pal, lab, names = load_view(view)
    P = split_parts(art, lab, names)
    W, H = art.shape[1], art.shape[0]
    legL, legR = extend_up(P['leg_l'], 4), extend_up(P['leg_r'], 4)
    frames = {}
    # 披风摆动区间：新版立绘裙摆/披风在 y≈163 以下，旧版在 y≈104
    CY0, CY1 = (163, 205) if H > 200 else (104, 149)
    # 待机：上半身下沉 1 格 + 披风下摆轻摆
    idle = []
    for k, (dy, sway) in enumerate([(0, 0), (1, 1)]):
        body = P['body']
        cl, cr = shear_rows(P['cape_l'], CY0, CY1, -sway), shear_rows(P['cape_r'], CY0, CY1, sway)
        idle.append(compose(W, H, [legL, legR, (body, 0, dy), (cl, 0, dy), (cr, 0, dy)]))
    frames['idle'] = idle
    # 跑步 6 帧：左右腿交替抬起，身体上下起伏，披风反向甩
    RUN = [  # body_dy, 左腿 dy, 右腿 dy, 披风摆
        (1, 0, -3, -1), (0, 0, -6, -2), (-1, -1, -3, -1),
        (1, -3, 0, 1), (0, -6, 0, 2), (-1, -3, -1, 1)]
    run = []
    for bdy, ly, ry, sw in RUN:
        if view == 'front':
            cl, cr = shear_rows(P['cape_l'], CY0, CY1, sw - 1), shear_rows(P['cape_r'], CY0, CY1, sw + 1)
        else:
            cl, cr = shear_rows(P['cape_l'], CY0, CY1, sw), shear_rows(P['cape_r'], CY0, CY1, sw)
        run.append(compose(W, H, [(legL, 0, ly), (legR, 0, ry), (P['body'], 0, bdy), (cl, 0, bdy), (cr, 0, bdy)]))
    frames['run'] = run
    return frames, pal

if __name__ == '__main__':
    views = [v for v in sys.argv[1:] if v != 'export'] or ['front', 'back']   # 侧身源图未提供，right 先不跑
    for v in views:
        fr, pal = anim_side() if v == 'right' else anim_front_back(v)
        for a, fs in fr.items():
            dur = {'idle': 400, 'run': 100}[a]
            save_pxd(f'{OUT}/feng_{a}_{v}.pxd.json', [[f] for f in fs], pal, durs=[dur] * len(fs),
                     meta={'character': '凤笑天', 'anim': a, 'dir': v, 'foot': [53, 164], 'fps': round(1000 / dur, 2)}, name=f'feng_{a}_{v}')
        print(v, 'ok')

def export_all():
    """左 = 右的镜像；输出每个动作×方向的 PXD + 预览总表（侧身源图未提供时跳过左右）。"""
    for a in ('idle', 'run'):
        if not os.path.exists(f'{OUT}/feng_{a}_right.pxd.json'):
            continue
        s = load_pxd(f'{OUT}/feng_{a}_right.pxd.json')
        fl = [[flip_h(f[0])] for f in s.frames]
        m = dict(s.meta); m['dir'] = 'left'; m['foot'] = [s.w - 1 - s.meta['foot'][0], s.meta['foot'][1]]; m['note'] = '右侧镜像'
        save_pxd(f'{OUT}/feng_{a}_left.pxd.json', fl, s.pal, durs=s.durs, meta=m, name=f'feng_{a}_left')
    # 总预览：新立绘只换到了正面/背面（侧身图还没给），左右两方向仍是旧立绘，所以先只排前/后
    dirs = ['front', 'back']
    rows = []
    for d in dirs:
        fr = []
        for a in ('idle', 'run'):
            s = load_pxd(f'{OUT}/feng_{a}_{d}.pxd.json')
            fr += [to_rgba(f[0], s.pal, (214, 204, 182)) for f in s.frames]
        rows.append(fr)
    w, h = rows[0][0].size
    S, gap = 3, 6
    sheet = Image.new('RGBA', ((w + gap) * 8 + gap, (h + gap) * len(rows) + gap), (196, 186, 164, 255))
    for r, fr in enumerate(rows):
        for c, im in enumerate(fr):
            sheet.paste(im, (gap + c * (w + gap), gap + r * (h + gap)))
    sheet.resize((sheet.width * S, sheet.height * S), Image.NEAREST).save(f'{OUT}/预览_凤笑天_待机跑步_前后.png')

if __name__ == '__main__' and 'export' in sys.argv:
    export_all(); print('exported')
