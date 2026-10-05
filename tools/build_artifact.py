#!/usr/bin/env python3
"""Builds the single-file claude.ai page from index.html + css/ + js/.

claude.ai wraps the page in its own <html>/<head>/<body>, so this keeps only what belongs inside:
<title>, the Google Fonts stylesheet, the external script tags (html2canvas, jsPDF), the local CSS and JS
inlined, and the body markup. Meta/manifest/icon tags are dropped (the platform provides them; service
workers do not run there).

Usage: python3 tools/build_artifact.py [output.html]
"""
import os, re, sys

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(root, 'artifact.html')
read = lambda p: open(os.path.join(root, p), encoding='utf-8').read()
src = read('index.html')

head = re.search(r'<head>(.*?)</head>', src, re.S).group(1)
body = re.search(r'<body[^>]*>(.*)</body>', src, re.S).group(1)

title = re.search(r'<title>.*?</title>', head, re.S).group(0)
fonts = re.findall(r'<link rel="stylesheet" href="https://fonts\.googleapis\.com[^>]*>', head)
ext_scripts = re.findall(r'<script src="https://[^"]+"></script>', head)
css = '\n'.join(read(p) for p in re.findall(r'<link rel="stylesheet" href="(css/[^"]+)">', head))

local_js = re.findall(r'<script src="(js/[^"]+)"></script>', body)
js = '\n'.join(read(p) for p in local_js)
body = re.sub(r'<script src="js/[^"]+"></script>\n?', '', body)

out = '\n'.join([title] + fonts + ['<style>\n' + css + '</style>'] + ext_scripts) + '\n' + body.strip() + '\n<script>\n' + js + '</script>\n'
assert local_js and css.strip(), 'no local css/js found'
assert not re.search(r'<(html|head|body)[\s>]', out, re.I) and '<!DOCTYPE' not in out
assert 'rel="manifest"' not in out
open(out_path, 'w', encoding='utf-8').write(out)
print(f'{out_path}: {len(out):,} bytes ({len(local_js)} scripts inlined)')
