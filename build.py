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
html = (src / 'index.html').read_text(encoding='utf-8')
css = (src / 'style.css').read_text(encoding='utf-8')
core = (src / 'core.js').read_text(encoding='utf-8')
app = '(function(){\n' + (src / 'app1.js').read_text(encoding='utf-8') + '\n' + (src / 'app2.js').read_text(encoding='utf-8') + '\n})();\n'
for name, js in (('core', core), ('app', app)):
    assert '</script' not in js.lower(), name + ' contains </script'
parts = {'{{CSS}}': css, '{{CORE}}': core, '{{APP}}': app, '{{SAMPLE}}': sample_uri()}
out = re.sub(r'\{\{(CSS|CORE|APP|SAMPLE)\}\}', lambda m: parts[m.group(0)], html)
(root / 'PixelWorkshop.html').write_text(out, encoding='utf-8')
print('PixelWorkshop.html', len(out.encode('utf-8')), 'bytes')
