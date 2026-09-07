#!/bin/bash
# 把网页本体同步到 dist/（Tauri frontendDist），桌面壳专用文件来自 desktop/。
# src-tauri/target、.git、node_modules 等绝不进安装包。
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
rm -rf "$ROOT/dist"
mkdir -p "$ROOT/dist"
rsync -a --delete \
  --exclude='.git/' \
  --exclude='.gitignore' \
  --exclude='src-tauri/' \
  --exclude='dist/' \
  --exclude='node_modules/' \
  --exclude='package.json' \
  --exclude='package-lock.json' \
  --exclude='scripts/' \
  --exclude='desktop/RELEASE.md' \
  --exclude='desktop/app-icon-1024.png' \
  --exclude='.DS_Store' \
  --exclude='.commandcode/' \
  --exclude='.venv/' \
  "$ROOT/" "$ROOT/dist/"
echo "synced -> $ROOT/dist ($(du -sh "$ROOT/dist" | cut -f1))"
