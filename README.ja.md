# 🎮 Awesome Mini Game · クラシックミニゲーム集

26 種類のクラシックミニゲームをピュア HTML + CSS + JS で再実装——ゼロ依存、開いてすぐ遊べます。

[English](README.md) | [中文版](README.zh-CN.md) | [한국어](README.ko.md)

## 遊び方

ビルド不要。`index.html` をダブルクリックするか、ローカルサーバーで起動：

```bash
cd awesome-mini-game
python3 -m http.server 8000
# ブラウザで http://localhost:8000/ を開く
```

ホームページで `/` キーを押すとゲームを検索できます。

## ゲーム一覧（26本）

| ゲーム | フォルダ | 特徴 |
|---|---|---|
| 🚀 雷電 RAIDEN | `games/raiden/` | 6戦域 + 多段階ボス6体、3色武器切替、雷撃ボム、2人協力 |
| 🍄 スーパーマリオ | `games/super-mario-bros/` | 全8コース、パワーアップ、隠し土管部屋、ゴールポールと城ボス |
| 🪖 戦車バトル | `games/tank-battle/` | 夜戦を含む12戦場、2人協力、6種アイテム、マップ工房 |
| 🐝 ギャラガ Galaga | `games/galaga/` | 編隊急降下、トラクタービーム捕獲と救出合体、チャレンジングステージ |
| ♞ 中国将棋 | `games/chinese-chess/` | 完全ルール、3段階Worker AI、待った・ヒント、詰め象棋12問 |
| 🃏 闘地主 Dou Dizhu | `games/dou-dizhu/` | コール＆奪取、全役対応、協力AI、カウンター、爆弾演出 |
| ⚫ 五目並べ | `games/gomoku/` | 3段階AI + 2人対局、連珠の禁手ルール、待った・ヒント |
| 🧱 テトリス | `games/tetris/` | SRS、ホールド、Tスピン/B2B/パフェ、マラソン/40ライン/2分 |
| 🔢 2048 | `games/game-2048/` | 4種の盤面、戻す、自動セーブ |
| 💣 マインスイーパ | `games/minesweeper/` | 3難易度、初手安全、一括オープン、ヒント |
| 🎯 ブロック崩し | `games/breakout/` | 10ステージ、鋼鉄/TNT、8種アイテム |
| 🫧 バブルドラゴン | `games/bubble-dragon/` | 反射照準＋落下、12ステージ＋エンドレス |
| 💎 マッチ3 | `games/match3/` | ストライプ/ボム/レインボー、15ステージ＋タイムアタック |
| 🐤 Flappy Bird | `games/flappy-bird/` | 3難易度、動く土管、メダル、昼夜テーマ |
| 🕯️ Echoes of the Abyss | `games/abyss/` | ダンジョンARPG · ダンジョン、レジェンダリー、ボス戦 |
| 🐍 Snake | `games/snake/` | 定番アーケード · 3モード、アイテム、アーケード |
| 🃏 Memory Match | `games/memory/` | ペア探し · 記憶、2人、親子 |
| 🐱 Talking Cat | `games/talking-cat/` | ペット育成 · 3D、育成、音声 |
| 🌻 Plants vs. Zombies | `games/pvz/` | タワーディフェンス · タワーディフェンス、デッキ、エンドレス |
| 🍬 Moe Garden | `games/pvz-moe/` | もえタワーディフェンス · タワーディフェンス、もえ、演出 |
| 💎 Crystal Guardians | `games/tower-defense/` | 戦略タワーディフェンス · TD、強化、ボス |
| 🟡 Pac-Man | `games/pacman/` | 迷路アーケード · 迷路、ゴーストAI、アーケード |
| 🍉 Watermelon Merge | `games/suika/` | 物理合体 · 合体、物理、癒し |
| 🀄 Idiom Wordle | `games/idiom-guess/` | ことばパズル · 成語、デイリー、ピンイン |
| 🥷 Fruit Ninja | `games/fruit-ninja/` | スワイプ斬り · 斬る、コンボ、爽快 |
| 📦 Sokoban | `games/sokoban/` | 頭脳パズル · 倉庫番、ステージ、アンドゥ |

## 技術的特徴

- 🖼️ ネイティブ Canvas 2D 描画、フレーム単位の精密制御
- 🔊 WebAudio 合成の効果音＆BGM、外部音声ファイル不要
- 💾 `localStorage` にハイスコア・進行状況・設定を保存
- 📱 モバイルのタッチ操作に対応
- ⚡ ゼロ依存——各ゲームは `index.html` + `game.js` の1フォルダ完結

## ディレクトリ構成

```
awesome-mini-game/
├── index.html          # ホーム（検索 + フィルタ + ゲームカード）
├── favicon.svg
├── assets/             # 共通 UI / 多言語 / 音声 / タッチ用スクリプト
└── games/              # すべてのゲーム（1本につき1フォルダ）
    ├── raiden/         # 各ゲーム: index.html + game.js（+ styles.css）
    │   ├── index.html
    │   ├── game.js
    │   └── ...
    ├── tetris/
    └── ...
```

各ゲームフォルダはそのゲーム本体のみで、共通のスタイルとスクリプトは `assets/` から読み込みます。リポジトリのルートでサーバーを起動し、`games/<name>/` を開いてください。

## コントリビューション

PR歓迎：バグ修正、新ゲーム追加、AI・操作性の改善。条件は依存ライブラリなしを保つこと。

## ライセンスと免責

- 本リポジトリのコードはオリジナル実装であり、[MITライセンス](LICENSE)のもとで公開されています。
- ゲーム名・デザイン・ルールは各原権利者に帰属します（例：テトリス、スーパーマリオ、雷電、ギャラガ、戦車バトル）。本プロジェクトは学習目的の非商用ファントリビュートです。公式版の応援をお願いします。
