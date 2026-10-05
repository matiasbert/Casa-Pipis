#!/usr/bin/env python3
"""Builds the claude.ai page from index.html (same code, different packaging).

claude.ai wraps the page in its own <html>/<head>/<body>, so this keeps only what belongs
inside: <title>, the Google Fonts stylesheet, the script tags, <style> and the body content.
Meta/manifest/icon tags are dropped (the platform provides them; service workers do not run there).

Usage: python3 tools/build_artifact.py [index.html] [output.html]
"""
import re, sys

src_path = sys.argv[1] if len(sys.argv) > 1 else 'index.html'
out_path = sys.argv[2] if len(sys.argv) > 2 else 'artifact.html'
src = open(src_path, encoding='utf-8').read()

head = re.search(r'<head>(.*?)</head>', src, re.S).group(1)
body = re.search(r'<body[^>]*>(.*)</body>', src, re.S).group(1)

title = re.search(r'<title>.*?</title>', head, re.S).group(0)
fonts = re.findall(r'<link rel="stylesheet" href="https://fonts\.googleapis\.com[^>]*>', head)
scripts = re.findall(r'<script src="[^"]+"></script>', head)
style = re.search(r'<style>.*?</style>', head, re.S).group(0)

out = '\n'.join([title] + fonts + [style] + scripts) + '\n' + body.strip() + '\n'
assert not re.search(r'<(html|head|body)[\s>]', out, re.I) and '<!DOCTYPE' not in out
assert 'manifest' not in out.split('<script>')[0]
open(out_path, 'w', encoding='utf-8').write(out)
print(f'{out_path}: {len(out):,} bytes')
