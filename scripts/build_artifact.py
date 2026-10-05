#!/usr/bin/env python3
"""Bundle index.html + styles.css + app.js into one page (dist/academy.html) for publishing
as a shared claude.ai page, where coaches work from the same live database."""
import pathlib
import re

root = pathlib.Path(__file__).resolve().parent.parent
html = (root / "index.html").read_text()
css = (root / "styles.css").read_text()
js = (root / "app.js").read_text()

title = re.search(r"<title>.*?</title>", html, re.S).group(0)
fonts = re.search(r'<link rel="stylesheet" href="https://fonts.googleapis.com[^>]*>', html).group(0)
body = re.search(r"<body>(.*)</body>", html, re.S).group(1)
body = body.replace('<script src="app.js"></script>', f"<script>\n{js}\n</script>")

out = f"{title}\n{fonts}\n<style>\n{css}\n</style>\n{body.strip()}\n"
dist = root / "dist"
dist.mkdir(exist_ok=True)
(dist / "academy.html").write_text(out)
print(f"wrote {dist / 'academy.html'} ({len(out) // 1024} KB)")
