#!/usr/bin/env python3
"""把网页本体同步到 dist/（Tauri frontendDist），全平台可跑（macOS/Windows/Linux）。

只用标准库。排除规则与 scripts/sync-web.sh 一致，.sh 仅作本地备用。
用法：python3 scripts/sync-web.py
"""
import os
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, "dist")

EXCLUDE_TOP = {
    ".git", ".github", ".gitignore", ".DS_Store", ".commandcode", ".venv",
    "src-tauri", "dist", "node_modules", "scripts",
    "package.json", "package-lock.json",
}
EXCLUDE_SUFFIX = (".key",)

# 嵌套路径（相对仓库根），发布包里不需要
EXCLUDE_NESTED = {
    os.path.join("desktop", "RELEASE.md"),
    os.path.join("desktop", "app-icon-1024.png"),
}


def excluded(name: str) -> bool:
    return name in EXCLUDE_TOP or name.endswith(EXCLUDE_SUFFIX)


def main() -> int:
    if os.path.isdir(DIST):
        shutil.rmtree(DIST)
    os.makedirs(DIST, exist_ok=True)
    for entry in sorted(os.listdir(ROOT)):
        if excluded(entry):
            continue
        src = os.path.join(ROOT, entry)
        dst = os.path.join(DIST, entry)
        if os.path.isdir(src) and not os.path.islink(src):
            shutil.copytree(src, dst, ignore=shutil.ignore_patterns(".DS_Store"))
        elif os.path.isfile(src):
            shutil.copy2(src, dst)
    for rel in EXCLUDE_NESTED:
        p = os.path.join(DIST, rel)
        if os.path.isfile(p):
            os.remove(p)
    total = sum(
        os.path.getsize(os.path.join(d, f))
        for d, _, files in os.walk(DIST) for f in files
    )
    print(f"synced -> {DIST} ({total / 1024:.0f} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
