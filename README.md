# 🎮 Awesome Mini Game

14 classic mini-games rebuilt with pure HTML + CSS + JS — zero dependencies, playable out of the box.

[中文版](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md)

## Play

No build step. Either double-click `index.html`, or serve it locally:

```bash
cd awesome-mini-game
python3 -m http.server 8000
# open http://localhost:8000/
```

Press `/` on the home page to search games.

## Games (14)

| Game | Folder | Highlights |
|---|---|---|
| 🚀 Raiden | `raiden/` | Co-op 2P shmup, 8 stages + 8 bosses, power-up system |
| 🍄 Super Mario Bros | `super-mario-bros/` | Side-scrolling platformer, pixel physics |
| 🪖 Tank Battle | `tank-battle/` | Base defense, destructible terrain |
| 🐝 Galaga | `galaga/` | Dive patterns, dual-fighter merge |
| ♞ Chinese Chess | `chinese-chess/` | Full rules + AI engine (Web Worker, non-blocking UI) |
| 🃏 Dou Dizhu | `dou-dizhu/` | 3-player, complete hand-type detection |
| ⚫ Gomoku | `gomoku/` | PvP + AI with 3 difficulty levels |
| 🧱 Tetris | `tetris/` | Guideline rules, SRS rotation, T-Spin |
| 🔢 2048 | `game-2048/` | Smooth slide-and-merge animations |
| 💣 Minesweeper | `minesweeper/` | 3 difficulties, first-click safe |
| 🎯 Breakout | `breakout/` | Power-ups: multi-ball, laser, pierce |
| 🫧 Bubble Dragon | `bubble-dragon/` | Aiming + bounce + chain clears |
| 💎 Match 3 | `match3/` | Swap-to-match, combo multiplier |
| 🐤 Flappy Bird | `flappy-bird/` | 1P / versus 2P, day-night themes |

## Tech

- 🖼️ Native Canvas 2D rendering, frame-by-frame control
- 🔊 WebAudio-synthesized SFX & BGM — no audio files
- 💾 `localStorage` high scores, progress and settings
- 📱 Touch support for mobile play
- ⚡ Zero dependencies — every game is one folder with `index.html` + `game.js`

## Structure

```
awesome-mini-game/
├── index.html          # home page (search + filters + game cards)
├── favicon.svg
├── raiden/             # each game: index.html + game.js (+ styles.css)
│   ├── index.html
│   ├── game.js
│   └── ...
├── tetris/
└── ...
```

Each game folder is self-contained — open any `index.html` to play that game alone.

## Contributing

PRs welcome: bug fixes, new games, or better AI/handling. Keep it dependency-free.

## License & Disclaimer

- The code in this repo is original work, licensed under the [MIT License](LICENSE).
- Game names, designs and rules belong to their respective original creators
  (e.g. Tetris, Super Mario, Raiden, Galaga, Tank Battle). This project is a
  non-commercial fan tribute for learning purposes — please support the
  official releases.
