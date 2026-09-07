#!/bin/bash
# 从 GitHub（draft）release 的资产生成 latest.json 并上传。
# 与 CI 里 updater-json 作业等价，本地排障/补发用。
# 用法：make-latest-from-release.sh <tag>   例：make-latest-from-release.sh v0.1.3
set -euo pipefail
TAG="${1:?usage: make-latest-from-release.sh <tag>}"
REPO_SLUG="${AMG_REPO_SLUG:-davidzhanghui/awesome-mini-game}"

ASSETS=$(gh release view "$TAG" -R "$REPO_SLUG" --json assets --jq '.assets[].name')
echo "$ASSETS"
pick() { echo "$ASSETS" | grep -m1 -E "$1" || true; }

ARM_TAR=$(pick 'aarch64.*\.app\.tar\.gz$')
X64_TAR=$(pick 'x86_64.*\.app\.tar\.gz$|x64.*\.app\.tar\.gz$')
# Windows 更新包就是 -setup.exe 本身（v2 起 nsis/msi 安装器自带 .sig 即 updater bundle）
WIN_EXE=$(pick '-setup\.exe$')
[ -z "$WIN_EXE" ] && WIN_EXE=$(pick '\.msi$')
LIN_APP=$(pick '\.AppImage$')
[ -z "$ARM_TAR" ] && { echo 'FATAL: aarch64 updater bundle missing'; exit 1; }
[ -z "$X64_TAR" ] && { echo 'FATAL: x86_64 updater bundle missing'; exit 1; }
[ -z "$WIN_EXE" ] && { echo 'FATAL: windows updater bundle missing'; exit 1; }

SIGDIR="/tmp/sigs-$TAG"
rm -rf "$SIGDIR"; mkdir -p "$SIGDIR"
gh release download "$TAG" -R "$REPO_SLUG" --pattern '*.sig' --dir "$SIGDIR" --clobber

export TAG REPO_SLUG ARM_TAR X64_TAR WIN_EXE
export ARM_SIG=$(cat "$SIGDIR/${ARM_TAR}.sig")
export X64_SIG=$(cat "$SIGDIR/${X64_TAR}.sig")
export WIN_SIG=$(cat "$SIGDIR/${WIN_EXE}.sig")
if [ -n "$LIN_APP" ] && [ -f "$SIGDIR/${LIN_APP}.sig" ]; then
  export LIN_APP LIN_SIG=$(cat "$SIGDIR/${LIN_APP}.sig")
fi

python3 - <<'EOF'
import json, os, datetime
tag = os.environ['TAG']
slug = os.environ['REPO_SLUG']
def entry(bundle, sig):
    return {'signature': sig,
            'url': f'https://github.com/{slug}/releases/download/{tag}/{bundle}'}
platforms = {
    'darwin-aarch64': entry(os.environ['ARM_TAR'], os.environ['ARM_SIG']),
    'darwin-x86_64': entry(os.environ['X64_TAR'], os.environ['X64_SIG']),
    'windows-x86_64': entry(os.environ['WIN_EXE'], os.environ['WIN_SIG']),
}
if os.environ.get('LIN_APP') and os.environ.get('LIN_SIG'):
    platforms['linux-x86_64'] = entry(os.environ['LIN_APP'], os.environ['LIN_SIG'])
doc = {'version': tag.lstrip('v'),
       'notes': f'Awesome Mini Game {tag}',
       'pub_date': datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
       'platforms': platforms}
with open('/tmp/latest.json', 'w') as f:
    json.dump(doc, f, indent=2)
print(json.dumps({'version': doc['version'], 'platforms': sorted(platforms)}, indent=2))
EOF

gh release upload "$TAG" -R "$REPO_SLUG" /tmp/latest.json --clobber
echo "uploaded latest.json to $TAG"
