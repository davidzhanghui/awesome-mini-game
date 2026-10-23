# 🎮 Awesome Mini Game

26 mini-games rebuilt with pure HTML + CSS + JS — zero dependencies, playable out of the box.

[中文版](README.zh-CN.md) | [日本語](README.ja.md) | [한국어](README.ko.md)

## Play

No build step. Either double-click `index.html`, or serve it locally:

```bash
cd awesome-mini-game
python3 -m http.server 8000
# open http://localhost:8000/
```

Press `/` on the home page to search games.

## Games (26)

| Game | Folder | Highlights |
|---|---|---|
| 🚀 Raiden | `games/raiden/` | 6 war zones + 6 multi-phase bosses, 3 switchable weapons, thunder bombs, 2P co-op |
| 🍄 Super Mario Bros | `games/super-mario-bros/` | 8 levels, power-ups, secret pipe rooms, flagpole & castle bosses |
| 🪖 Tank Battle | `games/tank-battle/` | 12 battlefields incl. night ops, 2P co-op, 6 power-ups, map workshop |
| 🐝 Galaga | `games/galaga/` | Formation dives, tractor beam capture & dual-fighter rescue, challenging stages |
| ♞ Chinese Chess | `games/chinese-chess/` | Full rules, 3-level Web Worker AI, hints/undo, 12 endgame puzzles |
| 🃏 Dou Dizhu | `games/dou-dizhu/` | Bid & steal, all combos, teamwork AI, card counter, bomb/rocket effects |
| ⚫ Gomoku | `games/gomoku/` | 3-level AI, PvP, optional Renju forbidden moves, hints/undo |
| 🧱 Tetris | `games/tetris/` | SRS, hold, T-Spin/B2B/Perfect Clear, Marathon / Sprint 40L / Ultra |
| 🔢 2048 | `games/game-2048/` | 4 board sizes, undo, auto-save |
| 💣 Minesweeper | `games/minesweeper/` | 3 difficulties, safe first click, chording, hints |
| 🎯 Breakout | `games/breakout/` | 10 levels, steel/TNT bricks, 8 power-ups |
| 🫧 Bubble Dragon | `games/bubble-dragon/` | Bounce aiming, drops, 12 levels + endless |
| 💎 Match 3 | `games/match3/` | Striped/bomb/rainbow gems, 15 levels + blitz |
| 🐤 Flappy Bird | `games/flappy-bird/` | 3 difficulties, moving pipes, medals, day/night |
| 🕯️ Echoes of the Abyss | `games/abyss/` | Dungeon ARPG · Dungeons, Legendaries, Boss |
| 🐍 Snake | `games/snake/` | Arcade Classic · 3 Modes, Items, Arcade |
| 🃏 Memory Match | `games/memory/` | Find the Pairs · Memory, 2P, Family |
| 🐱 Talking Cat | `games/talking-cat/` | Pet Sim · 3D, Pet, Voice |
| 🌻 Plants vs. Zombies | `games/pvz/` | Tower Defense · Tower Defense, Deck, Endless |
| 🍬 Moe Garden | `games/pvz-moe/` | Kawaii Tower Defense · Tower Defense, Kawaii, VFX |
| 💎 Crystal Guardians | `games/tower-defense/` | Strategy TD · TD, Upgrade, Boss |
| 🟡 Pac-Man | `games/pacman/` | Maze Arcade · Maze, Ghost AI, Arcade |
| 🍉 Watermelon Merge | `games/suika/` | Physics Merge · Merge, Physics, Relaxing |
| 🀄 Idiom Wordle | `games/idiom-guess/` | Word Puzzle · Idioms, Daily, Pinyin |
| 🥷 Fruit Ninja | `games/fruit-ninja/` | Swipe & Slice · Slice, Combo, Juicy |
| 📦 Sokoban | `games/sokoban/` | Brain Puzzle · Push, Levels, Undo |

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
├── assets/             # shared UI / i18n / audio / touch scripts
└── games/              # all games, one folder each
    ├── raiden/         # each game: index.html + game.js (+ styles.css)
    │   ├── index.html
    │   ├── game.js
    │   └── ...
    ├── tetris/
    └── ...
```

Each game folder holds one game and loads shared styles/scripts from `assets/` — serve the repo root (see Play) and open `games/<name>/`.

## Contributing

PRs welcome: bug fixes, new games, or better AI/handling. Keep it dependency-free.

## License & Disclaimer

- The code in this repo is original work, licensed under the [MIT License](LICENSE).
- Game names, designs and rules belong to their respective original creators
  (e.g. Tetris, Super Mario, Raiden, Galaga, Tank Battle). This project is a
  non-commercial fan tribute for learning purposes — please support the
  official releases.
