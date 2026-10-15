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
| 🚀 Raiden | `raiden/` | 6 war zones + 6 multi-phase bosses, 3 switchable weapons, thunder bombs, 2P co-op |
| 🍄 Super Mario Bros | `super-mario-bros/` | 8 levels, power-ups, secret pipe rooms, flagpole & castle bosses |
| 🪖 Tank Battle | `tank-battle/` | 12 battlefields incl. night ops, 2P co-op, 6 power-ups, map workshop |
| 🐝 Galaga | `galaga/` | Formation dives, tractor beam capture & dual-fighter rescue, challenging stages |
| ♞ Chinese Chess | `chinese-chess/` | Full rules, 3-level Web Worker AI, hints/undo, 12 endgame puzzles |
| 🃏 Dou Dizhu | `dou-dizhu/` | Bid & steal, all combos, teamwork AI, card counter, bomb/rocket effects |
| ⚫ Gomoku | `gomoku/` | 3-level AI, PvP, optional Renju forbidden moves, hints/undo |
| 🧱 Tetris | `tetris/` | SRS, hold, T-Spin/B2B/Perfect Clear, Marathon / Sprint 40L / Ultra |
| 🔢 2048 | `game-2048/` | 4 board sizes, undo, auto-save |
| 💣 Minesweeper | `minesweeper/` | 3 difficulties, safe first click, chording, hints |
| 🎯 Breakout | `breakout/` | 10 levels, steel/TNT bricks, 8 power-ups |
| 🫧 Bubble Dragon | `bubble-dragon/` | Bounce aiming, drops, 12 levels + endless |
| 💎 Match 3 | `match3/` | Striped/bomb/rainbow gems, 15 levels + blitz |
| 🐤 Flappy Bird | `flappy-bird/` | 3 difficulties, moving pipes, medals, day/night |

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
