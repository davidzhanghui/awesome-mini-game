# Awesome Mini Game · macOS 桌面版发布与更新说明

分支：`feat/tauri-desktop` ｜ 壳：Tauri v2 ｜ 网页本体（`index.html` + 14 个游戏目录）**零改造**。

## 目录结构

```
awesome-mini-game/
├── index.html / tetris/ / raiden/ …   # 网页本体（浏览器和桌面版共用）
├── desktop/
│   ├── about.html                      # 关于页（随包发布，同步进 dist/desktop/）
│   ├── settings.html                   # 偏好设置页（随包发布）
│   └── RELEASE.md                      # 本文件
├── scripts/sync-web.sh                 # 网页本体 → dist/ 同步脚本（排除 .git/src-tauri/node_modules）
├── dist/                               # 生成物（gitignore），即 frontendDist
└── src-tauri/
    ├── tauri.conf.json                 # 应用配置（版本 / dmg / updater 公钥…）
    ├── capabilities/default.json       # 权限（窗口 / 对话框 / 外链 / 更新）
    ├── src/main.rs                     # 原生菜单 + 关于 + 外链 + 窗口管理
    ├── src/settings.rs                 # 偏好设置读写（本机 settings.json）
    ├── src/updater.rs                  # 自动更新流程（检查/下载/安装/重启）
    └── icons/                          # 由 favicon.svg 生成的全套图标
```

## CI 全自动发版（v0.1.3 起，推荐）

推 tag 即触发 `.github/workflows/release.yml`：双 mac（aarch64/x86_64）+ Windows（nsis+msi）+ Ubuntu（appimage+deb）并行构建，
产物进 draft release，随后 `updater-json` 作业自动生成 `latest.json` 并上传。

```bash
git checkout feat/tauri-desktop && git merge main   # 合入最新游戏
# bump 三处版本：package.json / src-tauri/Cargo.toml / src-tauri/tauri.conf.json
git commit -am "chore: bump desktop to vX.Y.Z" && git tag vX.Y.Z
git push origin feat/tauri-desktop && git push origin vX.Y.Z
gh run watch   # 等全绿（约 20-40 分钟）
```

收尾（draft → 正式）：

```bash
gh release view vX.Y.Z --json assets --jq '.assets[].name'  # 核对资产（含 latest.json）
# 换上中英双语说明（模板见 skill），然后发布：
gh release edit vX.Y.Z --notes-file notes.md --draft=false
curl -sL https://github.com/davidzhanghui/awesome-mini-game/releases/latest/download/latest.json
```

CI 要用的签名已配好：repo secret `TAURI_SIGNING_PRIVATE_KEY`（内容即 `~/.tauri/awesome-mini-game.key` 全文）。
本地补发/排障可用 `scripts/make-latest-from-release.sh <tag>`（与 CI 同逻辑）。

## 本地开发 / 打包（调试与应急）

```bash
npm install
npm run tauri:dev    # 调试：自动同步 dist + 起本地服务(:8000) + 开桌面窗口
npm run tauri:build  # 打包：产物在 src-tauri/target/release/bundle/
```

`npm run tauri:build`（`--bundles app,dmg`）一次产出：

| 产物 | 位置 | 用途 |
|---|---|---|
| `Awesome Mini Game.app` | `bundle/macos/` | 直接运行 |
| `Awesome Mini Game_0.1.0_aarch64.dmg` | `bundle/dmg/` | 分发安装（拖到 Applications） |
| `Awesome Mini Game.app.tar.gz` + `.sig` | `bundle/macos/` | 自动更新包（随 release 发布） |

> 未签名本地构建：首次打开被 Gatekeeper 拦截时，右键 → 打开 → 仍要打开即可。
> 对外发布才需要 Apple Developer 签名 + 公证（见下）。

## 自动更新（已接好，发布第 2 版时生效）

1. 生成签名密钥（已做过一次，**私钥只保存在本机，绝不进 git**）：
   ```bash
   npx tauri signer generate -w ~/.tauri/awesome-mini-game.key
   # 输出的公钥填到 src-tauri/tauri.conf.json → plugins.updater.pubkey
   ```
2. 打包时注入私钥（`--ci` 生成的无密码密钥在非交互 shell 下还要再加空密码，否则签名步骤会报 `Device not configured`）：
   ```bash
   export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/awesome-mini-game.key)"
   export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""
   npm run tauri:build
   ```
   本地自测 Gatekeeper 拦截时，可临时 ad-hoc 签名（仅本机跑通，不用于分发）：
   ```bash
   codesign --force --deep --sign - "src-tauri/target/release/bundle/macos/Awesome Mini Game.app"
   ```
3. 发版：在 GitHub 建 Release（如 `v0.2.0`），上传 `*.app.tar.gz` + `*.app.tar.gz.sig`，
   并附 `latest.json`（`plugins.updater.endpoints` 指向它）：
   ```json
   {
     "version": "0.2.0",
     "notes": "本次更新内容…",
     "pub_date": "2026-09-08T00:00:00Z",
     "platforms": {
       "darwin-aarch64": {
         "signature": "<对应 .sig 文件内容>",
         "url": "https://github.com/davidzhanghui/awesome-mini-game/releases/download/v0.2.0/Awesome.Mini.Game_0.2.0_aarch64.app.tar.gz"
       },
       "darwin-x86_64": { "signature": "<…>", "url": "<…>" }
     }
   }
   ```
4. 用户侧：菜单「检查更新…」/ 关于页按钮 / 启动自动检查 → 原生对话框 → 下载安装 → 重启生效。
   偏好设置里可开关「启动自动检查」「自动下载安装」。发 `latest.json` 之前更新检查会静默失败，
   属正常现象（手动点会提示网络/解析错误）。

## Apple 签名与公证（对外发布时做）

1. 注册 Apple Developer（$99/年），本机装好证书后：
   ```bash
   export APPLE_ID="你的Apple ID" APPLE_PASSWORD="app-specific-password" APPLE_TEAM_ID="TeamID"
   ```
2. `tauri.conf.json → bundle.macOS.signingIdentity` 填 `Developer ID Application: …` 后重新打包；
   再 `xcrun notarytool submit … --wait && xcrun stapler staple …`。
3. 当前 `identifier = com.davidzhanghui.awesome-mini-game`，申请证书时保持一致即可。

## 已知技术点

- `security.csp = null`：游戏页大量用内联 `<script>`，必须关掉 Tauri 默认 CSP（内容全是本地可信文件）。
- `frontendDist = ../dist`（而非直接 `../`）：避免把 `src-tauri/target`（几个 GB）和 `.git` 打进安装包。
- 象棋 AI 的 `new Worker('ai-worker.js?v=…')` 在桌面 asset 协议下需实测，发版前必验。
- 桌面版 `localStorage` 与浏览器相互独立（游戏进度不互通），设置页里有文字说明。
