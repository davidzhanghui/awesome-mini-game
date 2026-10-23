# 🎮 Awesome Mini Game · 经典小游戏合集

26 款经典小游戏的纯原生 JS 复刻合集：俄罗斯方块、雷电、坦克大战、马里奥、中国象棋……零依赖，双击即玩。

[English](README.md) | [日本語](README.ja.md) | [한국어](README.ko.md)

## 开始玩

无需构建，双击 `index.html` 即可；也可以起一个本地服务：

```bash
cd awesome-mini-game
python3 -m http.server 8000
# 浏览器打开 http://localhost:8000/
```

首页按 `/` 可快速搜索游戏。

## 游戏列表（26 款）

| 游戏 | 目录 | 特色 |
|---|---|---|
| 🚀 雷电 RAIDEN | `games/raiden/` | 六大战区 + 6 只多阶段 Boss，三色武器切换、雷击炸弹，双人同屏 |
| 🍄 超级马里奥 | `games/super-mario-bros/` | 8 个关卡，蘑菇火花无敌星，隐藏水管房间，旗杆与魔王城 |
| 🪖 坦克大战 | `games/tank-battle/` | 12 张战场含夜战，双人合作，6 种道具，地图工坊自制地图 |
| 🐝 小蜜蜂 Galaga | `games/galaga/` | 编队俯冲，牵引光束俘虏与双机合体，挑战关 |
| ♞ 中国象棋 | `games/chinese-chess/` | 完整规则，三档 Worker AI，悔棋提示，12 道残局 |
| 🃏 斗地主 | `games/dou-dizhu/` | 叫地主抢地主，全牌型，队友配合 AI，记牌器，炸弹王炸特效 |
| ⚫ 五子棋 | `games/gomoku/` | 三档 AI + 双人，可选连珠禁手，悔棋提示 |
| 🧱 俄罗斯方块 | `games/tetris/` | SRS 旋转、暂存、T-Spin/B2B/全消，马拉松 / 40 行冲刺 / 2 分钟 |
| 🔢 2048 | `games/game-2048/` | 四种棋盘、撤销、自动存档 |
| 💣 扫雷 | `games/minesweeper/` | 三档难度，首击安全，一键展开，提示 |
| 🎯 打砖块 | `games/breakout/` | 10 关，钢砖/爆炸砖，8 种道具 |
| 🫧 泡泡龙 | `games/bubble-dragon/` | 反弹瞄准 + 悬空掉落，12 关 + 无尽 |
| 💎 宝石消除 | `games/match3/` | 条纹/炸弹/彩虹宝石，15 关 + 限时 |
| 🐤 Flappy Bird | `games/flappy-bird/` | 三档难度，移动水管，奖牌，昼夜主题 |
| 🕯️ 深渊回响 | `games/abyss/` | 暗黑式地牢 ARPG · 随机地牢、暗金装备、Boss战 |
| 🐍 贪吃蛇 | `games/snake/` | 经典街机 · 三模式、道具、街机 |
| 🃏 记忆翻牌 | `games/memory/` | 益智配对 · 记忆、双人、亲子 |
| 🐱 汤姆猫 | `games/talking-cat/` | 萌宠互动 · 3D、养成、语音 |
| 🌻 植物大战僵尸 | `games/pvz/` | 塔防策略 · 塔防、组卡、无尽 |
| 🍬 萌可花园 | `games/pvz-moe/` | 萌系塔防 · 塔防、萌可、特效 |
| 💎 水晶守卫 | `games/tower-defense/` | 策略塔防 · 塔防、升级、Boss |
| 🟡 吃豆人 | `games/pacman/` | 迷宫街机 · 迷宫、幽灵AI、街机 |
| 🍉 合成大西瓜 | `games/suika/` | 物理合成 · 合成、物理、解压 |
| 🀄 猜成语 | `games/idiom-guess/` | 文字解谜 · 成语、每日一题、拼音 |
| 🥷 水果忍者 | `games/fruit-ninja/` | 划屏切水果 · 切水果、连击、爽快 |
| 📦 推箱子 | `games/sokoban/` | 烧脑解谜 · 推箱、关卡、撤销 |

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
├── assets/             # 共享 UI / 多语言 / 音频 / 触控脚本
└── games/              # 所有游戏，每款一个目录
    ├── raiden/         # 每个游戏：index.html + game.js（+ styles.css）
    │   ├── index.html
    │   ├── game.js
    │   └── ...
    ├── tetris/
    └── ...
```

每个游戏目录只含该游戏本身，公共样式与脚本来自 `assets/`——请在仓库根目录起服务（见「开始玩」），再打开 `games/<name>/`。

## 参与贡献

欢迎 PR：修 bug、加新游戏、优化 AI 与手感。唯一要求：保持零依赖。

## 开源协议与说明

- 本仓库代码为原创实现，遵循 [MIT 协议](LICENSE)开源。
- 游戏名称、玩法与设计归各自原版权方所有（如俄罗斯方块、马里奥、雷电、小蜜蜂、坦克大战等）。本项目为非商业性质的粉丝致敬 + 学习作品，请支持正版。
- 落地页所说的"全部开源"指代码 MIT 开源，不代表原游戏 IP 可自由商用。
