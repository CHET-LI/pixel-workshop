import asyncio, sys, pathlib, zipfile, io
from playwright.async_api import async_playwright
from PIL import Image
ROOT = pathlib.Path('/home/user/pixelsoul'); SH = ROOT / 'shots'; TAG = sys.argv[1] if len(sys.argv) > 1 else 'a'
res = []
def ok(c, n): res.append((bool(c), n)); print(('PASS ' if c else 'FAIL ') + n)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1600, 'height': 920}, accept_downloads=True)
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
        await pg.goto('file://' + str(ROOT / 'PixelWorkshop.html')); await pg.wait_for_timeout(300)
        await pg.click('#btnSample'); await pg.wait_for_function("document.getElementById('cvStatus').textContent.includes('色')", timeout=15000)
        st = await pg.text_content('#cvStatus'); gi = await pg.text_content('#gridInfo'); print(st, '|', gi)
        ok('105×113' in st or '105' in st, 'sample converted: ' + st); ok('5.8' in gi, 'grid info shows ~5.87')
        await pg.screenshot(path=str(SH / f'{TAG}_1_convert.png'))
        # zoom in (wheel on result), grid on
        await pg.check('#cvGrid'); box = await pg.locator('#cvDst').bounding_box()
        for _ in range(5): await pg.mouse.move(box['x'] + box['width'] * .55, box['y'] + box['height'] * .35); await pg.mouse.wheel(0, -200); await pg.wait_for_timeout(40)
        await pg.check('#cvNoise'); await pg.screenshot(path=str(SH / f'{TAG}_2_zoomgrid.png')); await pg.uncheck('#cvGrid'); await pg.uncheck('#cvNoise'); await pg.click('#cvFit')
        # custom palette preset
        await pg.click('label:has(input[name=pmode][value=custom])'); await pg.wait_for_timeout(200)
        await pg.select_option('#presetSel', 'Sweetie 16'); await pg.wait_for_timeout(400)
        st2 = await pg.text_content('#cvStatus'); n = await pg.locator('#customPal .sw').count(); ok(n == 16, f'custom palette swatches {n}')
        await pg.screenshot(path=str(SH / f'{TAG}_3_sweetie.png'))
        # back to auto, lock palette
        await pg.click('label:has(input[name=pmode][value=auto])'); await pg.wait_for_timeout(300); await pg.click('#btnLockPal'); await pg.wait_for_timeout(300)
        n2 = await pg.locator('#customPal .sw').count(); ok(n2 >= 8, f'locked palette {n2}')
        # protect brush stroke
        await pg.check('#cvProtect'); box = await pg.locator('#cvDst').bounding_box()
        await pg.mouse.move(box['x'] + box['width'] * .5, box['y'] + box['height'] * .3); await pg.mouse.down(); await pg.mouse.move(box['x'] + box['width'] * .56, box['y'] + box['height'] * .32, steps=6); await pg.mouse.up(); await pg.wait_for_timeout(300)
        prot = await pg.evaluate("(()=>{let n=0;for(const v of (window.__S||{}).protect||[])n+=v;return n})()")
        await pg.uncheck('#cvProtect')
        # export PNG
        async with pg.expect_download() as d: await pg.click('#btnConvPNG')
        dl = await d.value; pth = await dl.path(); im = Image.open(pth); ok(im.size[0] % 4 == 0 and im.size[0] >= 400, f'convert PNG {im.size} {dl.suggested_filename}')
        # to editor
        await pg.click('#btnToEditor'); await pg.wait_for_timeout(500)
        ok(await pg.is_visible('#view-edit'), 'editor tab visible'); sz = await pg.text_content('#edSize'); ok('105' in sz, 'editor doc ' + sz)
        cv = await pg.locator('#edCanvas').bounding_box()
        # pencil line
        await pg.keyboard.press('b'); X0 = cv['x'] + cv['width'] * .5 - 300; Y0 = cv['y'] + 110
        before = await pg.evaluate("document.getElementById('edPos').textContent")
        await pg.mouse.move(X0, Y0); await pg.mouse.down(); await pg.mouse.move(X0 + 200, Y0 + 50, steps=25); await pg.mouse.up()
        await pg.mouse.move(X0 + 100, Y0 + 25); pos = await pg.text_content('#edPos'); ok('#1a1420' in pos or '#0' in pos, 'pencil painted: ' + pos)
        # rect / ellipse
        await pg.keyboard.press('o'); await pg.mouse.move(X0 + 20, Y0 + 500); await pg.mouse.down(); await pg.mouse.move(X0 + 140, Y0 + 600, steps=5); await pg.mouse.up()
        # wand on fox body then to layer
        await pg.keyboard.press('w'); await pg.mouse.click(cv['x'] + cv['width'] * .5, cv['y'] + cv['height'] * .45)
        sel = await pg.text_content('#edSelInfo'); ok('选区' in sel, 'wand selection ' + sel)
        await pg.click('#selToLayer'); await pg.wait_for_timeout(200); nl = await pg.locator('#layerList .ly').count(); ok(nl == 2, f'layers {nl}')
        await pg.screenshot(path=str(SH / f'{TAG}_4_editor.png'))
        # move selection by arrows, commit
        await pg.keyboard.press('v'); await pg.keyboard.press('ArrowRight'); await pg.keyboard.press('ArrowRight'); await pg.keyboard.press('Enter')
        # undo x3 then redo
        for _ in range(3): await pg.keyboard.press('Control+z')
        nl2 = await pg.locator('#layerList .ly').count(); ok(nl2 == 1, f'undo removed layer -> {nl2}')
        await pg.keyboard.press('Control+y'); nl3 = await pg.locator('#layerList .ly').count(); ok(nl3 == 2, f'redo -> {nl3}')
        # replace colour tool + palette dblclick-free path
        await pg.keyboard.press('c'); await pg.mouse.click(cv['x'] + cv['width'] * .5, cv['y'] + cv['height'] * .45)
        # frames
        await pg.click('#frAdd'); await pg.keyboard.press('Control+a'); await pg.click('#flipH'); nf = await pg.locator('#frameList .fr').count(); ok(nf == 2, f'frames {nf}')
        await pg.check('#edOnion'); await pg.check('#edTile'); await pg.click('#edFit'); await pg.wait_for_timeout(100)
        await pg.screenshot(path=str(SH / f'{TAG}_5_frames.png')); await pg.uncheck('#edTile')
        # gradient in new canvas region
        await pg.keyboard.press('j'); await pg.keyboard.press('Control+d'); await pg.mouse.move(cv['x'] + 30, cv['y'] + 30); await pg.mouse.down(); await pg.mouse.move(cv['x'] + 300, cv['y'] + 30, steps=4); await pg.mouse.up()
        # export GIF + sheet + project
        await pg.click('#btnExport'); await pg.wait_for_timeout(200)
        async with pg.expect_download() as d: await pg.click('#xG button:has-text("GIF")')
        g = Image.open(await (await d.value).path()); ok(getattr(g, 'n_frames', 1) == 2, f'GIF frames {getattr(g,"n_frames",1)} size {g.size}')
        async with pg.expect_download() as d: await pg.click('#xG button:has-text("精灵表")')
        s = Image.open(await (await d.value).path()); ok(s.size == (105 * 2 * 4, 113 * 4), f'sheet {s.size}')
        async with pg.expect_download() as d: await pg.click('#xG button:has-text("逐帧")')
        z = zipfile.ZipFile(await (await d.value).path()); ok(len(z.namelist()) == 2, f'frames zip {z.namelist()}')
        async with pg.expect_download() as d: await pg.click('#xG button:has-text("保存项目")')
        proj = await (await d.value).path(); ok(pathlib.Path(proj).stat().st_size > 1000, 'project json saved')
        async with pg.expect_download() as d: await pg.click('#xG button:has-text(".gpl")')
        gpl = pathlib.Path(await (await d.value).path()).read_text(); ok(gpl.startswith('GIMP Palette'), 'gpl export')
        await pg.screenshot(path=str(SH / f'{TAG}_6_export.png')); await pg.keyboard.press('Escape')
        # help
        await pg.click('#btnHelp'); await pg.wait_for_timeout(100); await pg.screenshot(path=str(SH / f'{TAG}_7_help.png')); await pg.keyboard.press('Escape')
        # batch: 3 files
        await pg.click('#tabs button[data-tab=batch]')
        async with pg.expect_file_chooser() as fc: await pg.click('#bAddFiles')
        await (await fc.value).set_files([str(ROOT / 'samples/ai_fox.png'), str(ROOT / 'samples/sample_fox.webp'), str(ROOT / 'samples/t1_fox_out.png')])
        await pg.wait_for_timeout(300)
        async with pg.expect_download(timeout=60000) as d: await pg.click('#bRun')
        z = zipfile.ZipFile(await (await d.value).path()); names = z.namelist(); ok(len(names) == 4 and 'palette.gpl' in names, f'batch zip {names}')
        await pg.wait_for_timeout(200); await pg.screenshot(path=str(SH / f'{TAG}_8_batch.png'))
        ok(not errs, 'no JS errors ' + '; '.join(errs[:5]))
        await b.close()
asyncio.run(main())
print(f'RESULT pass={sum(1 for r in res if r[0])} fail={sum(1 for r in res if not r[0])}')
