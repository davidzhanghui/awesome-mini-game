# Awesome Mini Game — 开发约定

## 分支与修改流程

- **`main`**：纯网页源码（`games/` 下的游戏 + 落地页 + assets），不含桌面壳。
- **`feat/tauri-desktop`**：main 的超集，额外包含 Tauri 桌面壳、CI 发版流水线、desktop/ 页面。

**标准改动流程（务必遵循）**：

1. 网页改动（游戏、落地页、assets）**先在 `main` 上修改并提交推送**；
2. 切到 `feat/tauri-desktop`，`git merge main` 合入；
3. 需要发版时 bump 版本（`package.json` / `src-tauri/Cargo.toml` / `src-tauri/tauri.conf.json` 三处保持一致），推 `v*` tag 触发 CI；
4. tag 推送成功后立刻 `git checkout main`。工作区不要留在 `feat/tauri-desktop`，否则下一次加游戏会直接落在桌面分支上。修桌面壳或 workflow 时再临时切回去，改完推送后再次切回 `main`。

**禁止**：不要把 `feat/tauri-desktop` 合回 `main`（main 只留纯网页源码）；desktop 相关文件只在 feat 分支维护。

## 目录结构

```
index.html / favicon.svg / sitemap.xml / robots.txt / vercel.json   # 落地页与站点文件
assets/      # 共享 ui.css、theme.js、i18n.js、kit.js、bgm.js、touch.js、字体
games/<name>/  # 所有游戏，一款一个目录（index.html + game.js + styles.css …）
```

- **新增游戏**：建 `games/<name>/`；页面内引用共享资源用 `../../assets/...`；
  `index.html` 的游戏数据数组加 `{dir:"<name>", ...}`（卡片链接自动拼成 `games/<dir>/index.html`）；
  canonical / hreflang / og:url / JSON-LD 用 `https://awesome-mini-game.vercel.app/games/<name>/`；
  `sitemap.xml` 加对应条目；README 四语言的游戏表（目录列写 `games/<name>/`）与数量同步。
- `vercel.json` 把旧路径 `/<name>/` 301 到 `/games/<name>/`；新增游戏无需改它（只服务历史链接）。
- 返回首页链接由 `assets/i18n.js` 注入（`../../?lang=`）。
- ⚠️ `feat/tauri-desktop` 合并 main 后，需检查桌面壳/`desktop/` 页面/CI 中是否仍引用旧的 `<name>/` 顶层路径。

## 发版

使用 `david-mini-game-release` skill 的流水线：推 tag → 立刻切回 `main` → CI 4 平台构建 → draft → 校验 latest.json → 中英分段说明 → publish。签名私钥 `~/.tauri/awesome-mini-game.key` 绝不进 git。

## 本地环境

- 不用 Docker；Python 必须用 `.venv`（已存在）。
- 本地预览前检查端口：`lsof -iTCP:8000 -sTCP:LISTEN`，有则先 kill。

## UI 设计系统

- 共享样式 `assets/ui.css` + 主题脚本 `assets/theme.js`（暖色「游戏大厅」主题，明/暖黑两套变量）。
- 新游戏页接入方式：`<link rel="stylesheet" href="../assets/ui.css" />` + `<script src="../assets/theme.js"></script>`（放在游戏自身样式之后）。
- 标题字体：`assets/fonts/zcool-qkhy-subset.woff2`（ZCOOL 青客黄油体子集）。
