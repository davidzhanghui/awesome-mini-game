# 🎮 Awesome Mini Game · 经典小游戏合集

14 款经典小游戏的纯原生 JS 复刻合集：俄罗斯方块、雷电、坦克大战、马里奥、中国象棋……零依赖，双击即玩。

[English](README.md)

## 开始玩

无需构建，双击 `index.html` 即可；也可以起一个本地服务：

```bash
cd awesome-mini-game
python3 -m http.server 8000
# 浏览器打开 http://localhost:8000/
```

首页按 `/` 可快速搜索游戏。

## 游戏列表（14 款）

| 游戏 | 目录 | 特色 |
|---|---|---|
| 🚀 雷电 RAIDEN | `raiden/` | 双人同屏协作，8 关卡 + 8 个 Boss，武器强化系统 |
| 🍄 超级马里奥 | `super-mario-bros/` | 横版跳跃，像素物理，吃蘑菇、踩乌龟 |
| 🛡️ 坦克大战 | `tank-battle/` | 保卫基地，可破坏地形 |
| 🐝 小蜜蜂 Galaga | `galaga/` | 俯冲回旋弹幕，双机合体 |
| ♞ 中国象棋 | `chinese-chess/` | 完整规则 + AI 引擎（Worker 运行，不卡界面） |
| 🃏 斗地主 | `dou-dizhu/` | 3 人对局，完整牌型判定 |
| ⚫ 五子棋 | `gomoku/` | 双人对战 + 三档难度 AI |
| 🧱 俄罗斯方块 | `tetris/` | Guideline 规则，SRS 旋转，T-Spin 判定 |
| 🔢 2048 | `game-2048/` | 流畅滑动合并动画 |
| 💣 扫雷 | `minesweeper/` | 三档难度，首次点击安全 |
| 🎯 打砖块 | `breakout/` | 多球、激光、穿透等丰富道具 |
| 🫧 泡泡龙 | `bubble-dragon/` | 瞄准发射 + 边墙反弹 + 连锁消除 |
| 💎 宝石消除 | `match3/` | 交换三消，连击倍率 |
| 🐤 Flappy Bird | `flappy-bird/` | 单人 / 双人对战，昼夜主题 |

## 技术特性

- 🖼️ 原生 Canvas 2D 渲染，逐帧精准控制
- 🔊 WebAudio 合成音效与 BGM，无外部音频文件
- 💾 localStorage 存最高分、进度与设置
- 📱 移动端触屏支持
- ⚡ 零依赖——每个游戏就是一个文件夹（`index.html` + `game.js`）

## 目录结构

```
awesome-mini-game/
├── index.html          # 首页（搜索 + 分类 + 游戏卡片）
├── favicon.svg
├── raiden/             # 每个游戏：index.html + game.js（+ styles.css）
│   ├── index.html
│   ├── game.js
│   └── ...
├── tetris/
└── ...
```

每个游戏目录都是自包含的，单独打开其中任意 `index.html` 就能玩那一款。

## 参与贡献

欢迎 PR：修 bug、加新游戏、优化 AI 与手感。唯一要求：保持零依赖。

## 说明

仅供学习研究，致敬原游戏制作者。
