#!/usr/bin/env python3
"""Inline src/* into a single offline HTML: PixelWorkshop.html"""
import base64, io, pathlib, re
from PIL import Image
root = pathlib.Path(__file__).parent
src = root / 'src'
def sample_uri():
    p = root / 'samples' / 'sample_fox.webp'
    old = root / 'PixelWorkshop.html'
    if not p.exists() and not (root / 'samples' / 'ai_fox.png').exists() and old.exists():  # v1.2: reuse the embedded sample
        m = re.search(r'window\.SAMPLE_IMAGE = "([^"]*)"', old.read_text(encoding='utf-8'))
        if m: return m.group(1)
    if not p.exists():
        im = Image.open(root / 'samples' / 'ai_fox.png').convert('RGB')
        im.crop((380, 60, 1000, 720)).save(p, 'WEBP', quality=92, method=6)
    return 'data:image/webp;base64,' + base64.b64encode(p.read_bytes()).decode()
def portraits_js():
    """召唤师原型的队伍立绘：4 角色 × 表情，全部内联成 data URI（约 290KB）。"""
    import json
    d = root / 'assets' / 'summoner_portraits'
    order = ['summoner', 'warrior', 'mage', 'ranger']
    names = {'summoner': '召唤师', 'warrior': '战士', 'mage': '法师', 'ranger': '猎手'}
    pref = {   # 每个角色的默认表情排在最前，点击按这个顺序循环
        'summoner': ['smile', 'laugh', 'serious', 'shy', 'sad'],
        'warrior': ['grin', 'wink', 'serious', 'shy', 'sad'],
        'mage': ['calm', 'smile', 'pout', 'scared', 'reading'],
        'ranger': ['smile', 'content', 'cool', 'flustered'],
    }
    exps, data = {}, {}
    for who in order:
        have = {p.stem.split('_', 1)[1]: p for p in d.glob(f'{who}_*.png') if p.stem.split('_', 1)[1] != 'alert'}
        seq = [e for e in pref[who] if e in have] + [e for e in sorted(have) if e not in pref[who]]
        exps[who] = seq
        data[who] = {e: 'data:image/png;base64,' + base64.b64encode(have[e].read_bytes()).decode() for e in seq}
    egg_p = d / 'ranger_alert.png'
    egg = 'data:image/png;base64,' + base64.b64encode(egg_p.read_bytes()).decode() if egg_p.exists() else ''
    return json.dumps({'order': order, 'names': names, 'exps': exps, 'data': data, 'egg': egg},
                      ensure_ascii=False)


html = (src / 'index.html').read_text(encoding='utf-8')
css = (src / 'style.css').read_text(encoding='utf-8')
core = (src / 'core.js').read_text(encoding='utf-8')
app = '(function(){\n' + (src / 'app1.js').read_text(encoding='utf-8') + '\n' + (src / 'app2.js').read_text(encoding='utf-8') + '\n})();\n'
for name, js in (('core', core), ('app', app)):
    assert '</script' not in js.lower(), name + ' contains </script'
parts = {'{{CSS}}': css, '{{CORE}}': core, '{{APP}}': app, '{{SAMPLE}}': sample_uri(),
         '{{PORTRAITS}}': portraits_js()}
out = re.sub(r'\{\{(CSS|CORE|APP|SAMPLE|PORTRAITS)\}\}', lambda m: parts[m.group(0)], html)
(root / 'PixelWorkshop.html').write_text(out, encoding='utf-8')
print('PixelWorkshop.html', len(out.encode('utf-8')), 'bytes')
