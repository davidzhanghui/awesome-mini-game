#!/usr/bin/env python3
"""给 HTML 里引用的本地 js/css 统一加上内容 hash 版本号：?v=<sha1 前 8 位>。

改了 assets/ 或 games/*/ 下的 js/css 后运行一次：
    .venv/bin/python scripts/bump-versions.py
配合 vercel.json 的 immutable 缓存头：文件内容不变 → URL 不变 → 命中长缓存；
内容一变 → hash 变 → 浏览器自动拉新文件。
"""
import hashlib
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REF = re.compile(r'(?P<attr>\b(?:src|href)=")(?P<path>[^"?#]+\.(?:js|css))(?:\?v=[^"]*)?(?P<end>")')


def digest(f: Path) -> str:
    return hashlib.sha1(f.read_bytes()).hexdigest()[:8]


def process(html: Path) -> bool:
    text = html.read_text(encoding="utf-8")

    def sub(m):
        p = m.group("path")
        if re.match(r"^(?:[a-z]+:)?//", p):
            return m.group(0)
        target = (html.parent / p).resolve()
        if not target.is_file():
            print(f"  ! {html.relative_to(ROOT)}: missing {p}", file=sys.stderr)
            return m.group(0)
        return f'{m.group("attr")}{p}?v={digest(target)}{m.group("end")}'

    new = REF.sub(sub, text)
    if new != text:
        html.write_text(new, encoding="utf-8")
        return True
    return False


def main():
    pages = [ROOT / "index.html", *sorted((ROOT / "games").glob("*/index.html"))]
    changed = [p for p in pages if process(p)]
    print(f"{len(changed)}/{len(pages)} pages updated")


if __name__ == "__main__":
    main()
