#!/usr/bin/env python3
"""Builds the published site into _site/ (run by .github/workflows/pages.yml on every push).

The app is written as many small files in js/, loaded one by one by index.html. That's nice to
edit, but a browser fetching 24 small files takes over a second. So for the published site this
joins them, in the same order, into one js/app.<version>.js and points index.html at it.
Nothing else changes: locally you keep editing js/*.js and previewing index.html as before.

    python3 tools/build.py          # writes _site/ (open _site/index.html through a local server to check)
"""
import hashlib
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / '_site'
COPY = ['index.html', 'styles.css', '.nojekyll', 'js', 'manifest.webmanifest', 'sw.js', 'icons']
LOCAL_SCRIPT = re.compile(r'[ \t]*<script src="(js/[^"]+\.js)"></script>\n?')
ANY_SCRIPT = re.compile(r'<script\b[^>]*>')


def main():
    html = (ROOT / 'index.html').read_text()
    scripts = LOCAL_SCRIPT.findall(html)
    assert scripts, 'no js/ scripts found in index.html'

    # Joining only keeps the order right if nothing else (e.g. a CDN script) sits between them.
    first, last = LOCAL_SCRIPT.search(html), list(LOCAL_SCRIPT.finditer(html))[-1]
    between = ANY_SCRIPT.findall(html[first.start():last.end()])
    assert len(between) == len(scripts), 'a non-js/ <script> sits between the js/ scripts; move it before them'

    bundle = ''.join(f'// ---- {src}\n{(ROOT / src).read_text().rstrip()}\n;\n' for src in scripts)
    version = hashlib.sha256((bundle + (ROOT / 'styles.css').read_text()).encode()).hexdigest()[:10]
    name = f'js/app.{version}.js'

    # One <script> where the first was, the rest removed. A new name per version, so a browser
    # never mixes a cached old file with a new page.
    indent = re.match(r'[ \t]*', first.group(0)).group(0)
    html = html[:first.start()] + f'{indent}<script src="{name}"></script>\n' + LOCAL_SCRIPT.sub('', html[first.end():])
    html = html.replace('href="styles.css"', f'href="styles.css?v={version}"')

    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir()
    for item in COPY:
        src = ROOT / item
        (shutil.copytree if src.is_dir() else shutil.copy2)(src, OUT / item)
    (OUT / 'index.html').write_text(html)
    (OUT / name).write_text(bundle)
    print(f'{len(scripts)} scripts -> {name} ({len(bundle) // 1024} KB)')


if __name__ == '__main__':
    main()
