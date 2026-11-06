"""v1.3 PXD 浏览器测试：打开 .pxd.json → 编辑器（层/帧/像素）→ 导出 .pxd.json 往返一致；转换页导出 PXD。
用法：python tests/ui_pxd.py <some.pxd.json>（需要 playwright + chromium）"""
import sys, json, pathlib, tempfile
from playwright.sync_api import sync_playwright
root = pathlib.Path(__file__).resolve().parent.parent
src = pathlib.Path(sys.argv[1]).resolve()
P = F = 0
def ok(c, m):
    global P, F
    if c: P += 1
    else: F += 1; print('FAIL', m)
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={'width': 1400, 'height': 900}, accept_downloads=True)
    errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto((root / 'PixelWorkshop.html').as_uri()); pg.wait_for_timeout(500)
    # 1 open pxd via 打开 button
    with pg.expect_file_chooser() as fc: pg.click('#btnOpen')
    fc.value.set_files(str(src)); pg.wait_for_timeout(800)
    j = json.loads(src.read_text(encoding='utf-8'))
    toast = pg.inner_text('#toast')
    ok('已打开' in toast and f"{len(j['frames'])} 帧" in toast, 'toast after open: ' + toast)
    ok(pg.locator('#frameList > *').count() >= len(j['frames']), 'frame list count %d' % pg.locator('#frameList > *').count())
    # 2 export pxd from editor and compare pixels
    pg.click('#btnExport'); pg.wait_for_timeout(300)
    with pg.expect_download() as dl: pg.click('text=像素数据 .pxd.json')
    out = pathlib.Path(tempfile.mkdtemp()) / 'x.pxd.json'; dl.value.save_as(out)
    k = json.loads(out.read_text(encoding='utf-8'))
    def px(d):  # decode to list of hex per pixel
        K, kw = d['key'], d.get('keyWidth', 1)
        lut = {(K[i] if kw == 1 else K[i // len(K)] + K[i % len(K)]): c for i, c in enumerate(d['palette'])}
        return [[[lut.get(r[x*kw:(x+1)*kw], None) for x in range(d['w'])] for r in cel] for f in d['frames'] for cel in f['cels']]
    ok(px(k) == px(j), 'editor pxd round trip pixels identical')
    ok(k.get('meta') == j.get('meta'), 'meta preserved')
    ok([f['dur'] for f in k['frames']] == [f['dur'] for f in j['frames']], 'durations preserved')
    pg.keyboard.press('Escape')
    # 3 converter page: sample -> pxd export
    pg.click('[data-tab="convert"]') if pg.locator('[data-tab="convert"]').count() else None
    pg.click('#btnSample'); pg.wait_for_timeout(1500)
    pg.click('#btnExport'); pg.wait_for_timeout(300)
    with pg.expect_download() as dl: pg.click('text=像素数据 .pxd.json')
    out2 = out.parent / 'c.pxd.json'; dl.value.save_as(out2)
    c = json.loads(out2.read_text(encoding='utf-8'))
    ok(c['format'] == 'pxd' and c['w'] > 50 and len(c['frames'][0]['cels'][0]) == c['h'] and c['meta']['block'] > 5, 'converter pxd %sx%s block %s' % (c['w'], c['h'], c['meta'].get('block')))
    ok(not errs, 'no page errors: %s' % errs)
    b.close()
print('RESULT pass=%d fail=%d' % (P, F))
