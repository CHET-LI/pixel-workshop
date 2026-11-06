# v1.2 模板：保存 / 固定 / 新图片不再改设置 / 批量用同一模板 / 刷新后保留 / 导出导入
import asyncio, sys, pathlib, zipfile, io, json
from playwright.async_api import async_playwright
from PIL import Image
ROOT = pathlib.Path(__file__).resolve().parent.parent; SH = ROOT / 'shots'; TMP = ROOT / 'tmp'
res = []
def ok(c, n): res.append((bool(c), n)); print(('PASS ' if c else 'FAIL ') + n)
SWEETIE = None
async def state(pg):
    return await pg.evaluate("""() => ({mode: document.querySelector('input[name=mode]:checked').value,
      pmode: document.querySelector('input[name=pmode]:checked').value, size: document.getElementById('o_size').value,
      sample: document.getElementById('o_sample').value, colors: document.getElementById('o_colors').value,
      bg: document.getElementById('o_bgAuto').checked, sw: document.querySelectorAll('#customPal .sw').length,
      info: document.getElementById('tplInfo').textContent, grid: document.getElementById('gridInfo').textContent,
      lock: document.getElementById('tplLock').checked, sel: document.getElementById('tplSel').value})""")
async def open_file(pg, path):
    async with pg.expect_file_chooser() as fc: await pg.click('#btnOpen')
    await (await fc.value).set_files(str(path)); await pg.wait_for_timeout(1500)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); ctx = await b.new_context(viewport={'width': 1600, 'height': 920}, accept_downloads=True)
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
        url = 'file://' + str(ROOT / 'PixelWorkshop.html')
        await pg.goto(url); await pg.wait_for_timeout(300)
        s = await state(pg); ok('还没有模板' in s['info'], 'fresh page: no template yet')
        # 1. tune settings: 只统一色板 + Sweetie 16 locked palette
        await pg.click('#btnSample'); await pg.wait_for_function("document.getElementById('cvStatus').textContent.includes('色')", timeout=15000)
        await pg.click('#btnPalPreset'); await pg.wait_for_timeout(300)
        await pg.click('label:has(input[name=pmode][value=custom])'); await pg.select_option('#presetSel', 'Sweetie 16'); await pg.wait_for_timeout(500)
        s = await state(pg); ok(s['mode'] == 'size' and s['size'] == '1' and s['pmode'] == 'custom' and s['sw'] == 16, f'tuned: {s["mode"]} {s["size"]} {s["pmode"]} {s["sw"]}')
        await pg.evaluate("() => { const s = document.getElementById('bScale'); s.value = '2'; s.dispatchEvent(new Event('change')); }")
        # 2. save as template
        await pg.click('#btnTplSave'); await pg.fill('#tplName', '统一色板A'); await pg.click('#mBtns button.accent'); await pg.wait_for_timeout(200)
        s = await state(pg); ok(s['sel'] == '统一色板A' and '未固定' in s['info'], 'saved, selected, not fixed yet')
        # control: without fixing, opening a sharp-grid image still auto-switches (old behaviour kept when not fixed)
        await pg.click('#btnSample'); await pg.wait_for_timeout(1500)
        s = await state(pg); ok(s['mode'] == 'auto' and '改过' in s['info'], f'not fixed: auto switch still happens ({s["mode"]}) and the line says settings changed')
        # 3. fix the template (settings differ -> dialog, keep the template's own settings)
        await pg.click('#tplLock'); await pg.wait_for_timeout(200)
        ok(await pg.is_visible('#modal.on'), 'fixing with changed settings asks which set to keep')
        await pg.click('#mBtns button:has-text("用模板原来的设置")'); await pg.wait_for_timeout(400)
        s = await state(pg); ok(s['lock'] and s['mode'] == 'size' and s['size'] == '1' and s['sw'] == 16 and '已固定' in s['info'], 'fixed: template settings restored')
        # 4. new images no longer change anything
        await pg.click('#btnSample'); await pg.wait_for_timeout(1500)
        s = await state(pg); ok(s['mode'] == 'size' and s['size'] == '1' and s['pmode'] == 'custom' and s['sw'] == 16, f'sharp-grid image: template kept ({s["mode"]} {s["size"]})')
        await open_file(pg, TMP / 'blur_house.png')
        s = await state(pg); ok(s['mode'] == 'size' and s['size'] == '1' and s['sample'] == 'center' and not s['bg'] and '固定模板' in s['grid'], f'blurry image: no blur preset, template kept ({s["sample"]})')
        st = await pg.text_content('#cvStatus'); ok('480' in st, 'blurry image converted at 1px: ' + st)
        await pg.screenshot(path=str(SH / 'tpl_1_fixed.png'))
        # 5. a tweak shows "changed" and the next image restores the template
        await pg.fill('#o_size', '3'); await pg.dispatch_event('#o_size', 'input'); await pg.wait_for_timeout(200)
        s = await state(pg); ok('改过' in s['info'] and '恢复' in s['info'], 'tweak while fixed: warned it will be restored')
        await pg.click('#btnSample'); await pg.wait_for_timeout(1500)
        s = await state(pg); ok(s['size'] == '1' and '改过' not in s['info'], 'next image: back to the template')
        # 6. reload: template + lock survive
        await pg.reload(); await pg.wait_for_timeout(500)
        s = await state(pg); ok(s['lock'] and s['sel'] == '统一色板A' and s['mode'] == 'size' and s['size'] == '1' and s['sw'] == 16, 'after reload: still fixed, same settings')
        ok(await pg.input_value('#bScale') == '2', 'batch scale stored in the template')
        # 7. batch uses the template exactly
        await pg.click('#tabs button[data-tab=batch]'); await pg.wait_for_timeout(200)
        async with pg.expect_file_chooser() as fc: await pg.click('#bAddFiles')
        await (await fc.value).set_files([str(TMP / 'blur_house.png'), str(TMP / 'blur_crop.png')]); await pg.wait_for_timeout(300)
        summ = await pg.text_content('#bSummary'); ok('固定「统一色板A」' in summ and '锁定 16 色' in summ, 'batch summary: ' + summ)
        ok(await pg.is_checked('#bTplLock') and await pg.input_value('#bTplSel') == '统一色板A', 'batch page shows the fixed template')
        async with pg.expect_download(timeout=60000) as d: await pg.click('#bRun')
        z = zipfile.ZipFile(await (await d.value).path()); names = z.namelist(); print(names)
        pal = set()
        for line in z.read('palette.gpl').decode().splitlines():
            parts = line.split()
            if len(parts) >= 3 and all(x.isdigit() for x in parts[:3]): pal.add(tuple(int(x) for x in parts[:3]))
        sizes = {}; extra = 0
        for n in names:
            if not n.endswith('.png'): continue
            im = Image.open(io.BytesIO(z.read(n))).convert('RGBA'); sizes[n] = im.size
            extra += sum(1 for c in set(im.getdata()) if c[3] > 0 and c[:3] not in pal)
        ok(len(pal) == 16 and extra == 0, f'batch colours all inside the 16-colour palette (outside: {extra})')
        exp = {'blur_house': (480, 360), 'blur_crop': (260, 220)}  # template has 按原尺寸导出 -> exact source size
        ok(all(any(v == exp[k] for n, v in sizes.items() if n.startswith(k)) for k in exp), f'batch: every image exported at its source size (template export mode): {sizes}')
        await pg.screenshot(path=str(SH / 'tpl_2_batch.png'))
        # 8. export / delete / import
        async with pg.expect_download() as d: await pg.click('#tabs button[data-tab=convert]'); await pg.click('#btnTplExport')
        data = json.loads(pathlib.Path(await (await d.value).path()).read_text(encoding='utf-8')); ok('统一色板A' in data['templates'], 'export json has the template')
        await pg.click('#btnTplDel'); await pg.click('#mBtns button.accent'); await pg.wait_for_timeout(200)
        s = await state(pg); ok(s['sel'] == '' and not s['lock'], 'deleted: nothing fixed')
        jp = TMP / 'tpl.json'; jp.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
        async with pg.expect_file_chooser() as fc: await pg.click('#btnTplImport')
        await (await fc.value).set_files(str(jp)); await pg.wait_for_timeout(300)
        opts = await pg.eval_on_selector_all('#tplSel option', 'os => os.map(o => o.value)'); ok('统一色板A' in opts, 'imported back')
        ok(not errs, 'no page errors ' + str(errs[:3]))
        await b.close()
asyncio.run(main())
print(f'TEMPLATE_RESULT {sum(1 for c, _ in res if c)}/{len(res)}')
