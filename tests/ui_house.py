import asyncio, pathlib, shutil, sys
from playwright.async_api import async_playwright
from PIL import Image
ROOT = pathlib.Path('/home/user/pixelsoul'); OUT = ROOT / 'samples/game'; res = []
def ok(c, n): res.append(bool(c)); print(('PASS ' if c else 'FAIL ') + n)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1600, 'height': 920}, accept_downloads=True)
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + str(ROOT / 'PixelWorkshop.html'))
        await pg.evaluate("localStorage.clear()"); await pg.reload()
        for n in ['11', '01', '06', '03']:
            src = OUT / f'exterior_{n}.png'
            async with pg.expect_file_chooser() as fc: await pg.click('#btnOpen')
            await (await fc.value).set_files(str(src))
            await pg.wait_for_function("document.getElementById('cvStatus').textContent.includes('色')", timeout=20000); await pg.wait_for_timeout(400)
            gi = await pg.text_content('#gridInfo'); st = await pg.text_content('#cvStatus')
            smp = await pg.input_value('#o_sample'); rs = await pg.is_checked('#o_restore')
            print(n, '|', st, '|', gi[:120])
            if n == '03':
                sz = await pg.input_value('#o_size'); ok(smp == 'center' and sz == '1' and rs, f'03: palette-only preset carried over (sample={smp}, size={sz})')
            else: ok(smp == 'detail' and rs, f'{n}: blur preset auto-applied (sample={smp}, restore={rs})')
            if n == '01':
                # pick the lion's gold from the source pane -> must-keep colour
                bb = await pg.locator('#cvSrc').bounding_box(); sc = min(bb['width'] / 800, bb['height'] / 544) * 0.94
                ox = bb['x'] + (bb['width'] - 800 * sc) / 2; oy = bb['y'] + (bb['height'] - 544 * sc) / 2
                await pg.check('#cvPick'); await pg.mouse.click(ox + 398 * sc, oy + 238 * sc); await pg.wait_for_timeout(600); await pg.uncheck('#cvPick')
                npin = await pg.locator('#pinnedPal .sw').count(); t = await pg.get_attribute('#pinnedPal .sw', 'title') if npin else ''
                ok(npin == 1, f'01: pinned colour {npin} {t}')
                await pg.screenshot(path=str(ROOT / 'shots/h_01_convert.png'))
            if n == '06':
                await pg.click('#btnPalPreset'); await pg.wait_for_timeout(300)
                await pg.wait_for_function("document.getElementById('cvStatus').textContent.includes('色')", timeout=20000); await pg.wait_for_timeout(1500)
                vals = [await pg.input_value('#o_size'), await pg.input_value('#o_sample'), await pg.is_checked('#o_islandMerge'), await pg.is_checked('#o_bgAuto')]
                ok(vals == ['1', 'center', False, False], f'06: palette-only preset {vals} | ' + (await pg.text_content('#cvStatus')))
            async with pg.expect_download() as d: await pg.click('#btnConvPNG')
            dl = await d.value; tgt = OUT / f'tool_ext{n}.png'; shutil.copy(await dl.path(), tgt)
            a, bb = Image.open(src).size, Image.open(tgt).size; ok(a == bb, f'{n}: same size {a} -> {bb} ({dl.suggested_filename})')
            if n == '06':
                import numpy as np
                A = np.asarray(Image.open(src).convert('RGBA')).astype(int); B = np.asarray(Image.open(tgt).convert('RGBA')).astype(int); m = A[..., 3] > 128
                nc = len(np.unique(B[m][:, :3], axis=0)); dif = np.abs(A[..., :3] - B[..., :3]).sum(-1)[m].mean()
                ok(nc <= 64 and dif < 40, f'06: palette-only keeps every pixel: {nc} colours, mean diff {dif:.1f}')
        ok(not errs, 'no JS errors ' + '; '.join(errs[:3])); await b.close()
asyncio.run(main()); print(f'RESULT pass={sum(res)} fail={len(res) - sum(res)}')
