#!/usr/bin/env python3
"""Inline every player source into a single self-contained dist/index.html.

Usage: python3 build.py [week-file.json]
"""
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).parent
SRC = ROOT / "src" / "player"

# Strict dependency order. Nothing may import "upward" in this list.
MODULE_ORDER = [
    "parser.js", "machine.js", "storage.js", "effects.js",
    "render.js", "input.js", "editor.js", "main.js",
]

IMPORT_RE = re.compile(r"^[ \t]*import\s[^\n]*\n?", re.M)
EXPORT_RE = re.compile(r"^export\s+(?=(?:async\s+)?(?:function|const|let|class)\b)", re.M)
BAD_EXPORT_RE = re.compile(r"^export\s+(?:default\b|\{)", re.M)
PLACEHOLDER_RE = re.compile(r"<!--INLINE:\w+-->")


def read_module(name: str) -> str:
    """Strip module syntax so the file can be concatenated into one script."""
    path = SRC / name
    text = path.read_text(encoding="utf-8")

    if BAD_EXPORT_RE.search(text):
        sys.exit(f"{name}: `export default` and `export {{ ... }}` are unsupported; "
                 f"use `export function` / `export const` / `export class`")

    for match in IMPORT_RE.finditer(text):
        line = match.group(0).strip()
        if "./" not in line:
            sys.exit(f"{name}: only sibling imports are allowed, found: {line}")

    text = EXPORT_RE.sub("", IMPORT_RE.sub("", text))
    return f"/* ---------- {name} ---------- */\n{text.strip()}\n"


def main() -> None:
    week_name = sys.argv[1] if len(sys.argv) > 1 else "week-2026-09-13.json"
    week_path = ROOT / "src" / "data" / week_name
    if not week_path.exists():
        sys.exit(f"no such week file: {week_path}")

    week = json.loads(week_path.read_text(encoding="utf-8"))
    html = (SRC / "index.html").read_text(encoding="utf-8")
    css = (SRC / "style.css").read_text(encoding="utf-8")
    js = "\n".join(read_module(name) for name in MODULE_ORDER)

    if re.search(r"^[ \t]*(import|export)\s", js, re.M):
        sys.exit("module syntax survived inlining; check the source conventions")

    html = html.replace("<!--INLINE:css-->", f"<style>\n{css}\n</style>")
    html = html.replace("<!--INLINE:data-->", json.dumps(week, ensure_ascii=False, indent=2))
    html = html.replace("<!--INLINE:js-->", js)

    leftover = PLACEHOLDER_RE.search(html)
    if leftover:
        sys.exit(f"unreplaced placeholder: {leftover.group(0)}")

    out = ROOT / "dist" / "index.html"
    out.parent.mkdir(exist_ok=True)
    out.write_text(html, encoding="utf-8")
    print(f"built {out.relative_to(ROOT)} ({len(html):,} bytes) from {week_path.name}")


if __name__ == "__main__":
    main()
