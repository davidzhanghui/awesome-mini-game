# Awesome Mini Game — 开发约定

## 分支与修改流程

- **`main`**：纯网页源码（游戏 + 落地页 + assets），不含桌面壳。
- **`feat/tauri-desktop`**：main 的超集，额外包含 Tauri 桌面壳、CI 发版流水线、desktop/ 页面。

**标准改动流程（务必遵循）**：

1. 网页改动（游戏、落地页、assets）**先在 `main` 上修改并提交推送**；
2. 切到 `feat/tauri-desktop`，`git merge main` 合入；
3. 需要发版时 bump 版本（`package.json` / `src-tauri/Cargo.toml` / `src-tauri/tauri.conf.json` 三处保持一致），推 `v*` tag 触发 CI。

**禁止**：不要把 `feat/tauri-desktop` 合回 `main`（main 只留纯网页源码）；desktop 相关文件只在 feat 分支维护。

## 发版

使用 `david-mini-game-release` skill 的流水线：推 tag → CI 4 平台构建 → draft → 校验 latest.json → 中英分段说明 → publish。签名私钥 `~/.tauri/awesome-mini-game.key` 绝不进 git。

## 本地环境

- 不用 Docker；Python 必须用 `.venv`（已存在）。
- 本地预览前检查端口：`lsof -iTCP:8000 -sTCP:LISTEN`，有则先 kill。

## UI 设计系统

- 共享样式 `assets/ui.css` + 主题脚本 `assets/theme.js`（暖色「游戏大厅」主题，明/暖黑两套变量）。
- 新游戏页接入方式：`<link rel="stylesheet" href="../assets/ui.css" />` + `<script src="../assets/theme.js"></script>`（放在游戏自身样式之后）。
- 标题字体：`assets/fonts/zcool-qkhy-subset.woff2`（ZCOOL 青客黄油体子集）。
