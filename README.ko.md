# 🎮 Awesome Mini Game · 클래식 미니게임 모음

순수 HTML + CSS + JS로 재구현한 클래식 미니게임 14종 — 의존성 제로, 열자마자 바로 플레이.

[English](README.md) | [中文版](README.zh-CN.md) | [日本語](README.ja.md)

## 플레이 방법

빌드 불필요. `index.html`을 더블클릭하거나 로컬 서버로 실행:

```bash
cd awesome-mini-game
python3 -m http.server 8000
# 브라우저에서 http://localhost:8000/ 열기
```

홈페이지에서 `/` 키를 누르면 게임을 검색할 수 있습니다.

## 게임 목록 (26종)

| 게임 | 폴더 | 특징 |
|---|---|---|
| 🚀 라이덴 RAIDEN | `games/raiden/` | 6개 전장 + 다단계 보스 6, 3색 무기 교체, 번개 폭탄, 2인 협동 |
| 🍄 슈퍼 마리오 | `games/super-mario-bros/` | 8개 코스, 파워업, 비밀 파이프 방, 깃대와 성 보스 |
| 🪖 탱크 배틀 | `games/tank-battle/` | 야간전 포함 12개 전장, 2인 협동, 6종 아이템, 맵 공방 |
| 🐝 갤러그 Galaga | `games/galaga/` | 편대 급강하, 견인 광선 포획과 구출 합체, 챌린지 스테이지 |
| ♞ 중국 장기 | `games/chinese-chess/` | 완전한 규칙, 3단계 Worker AI, 무르기·힌트, 박보 12문제 |
| 🃏 도우 디주 Dou Dizhu | `games/dou-dizhu/` | 지주 선언·빼앗기, 전 족보, 협력 AI, 카드 카운터, 폭탄 연출 |
| ⚫ 오목 | `games/gomoku/` | 3단계 AI + 2인 대국, 렌주 금수 규칙, 무르기·힌트 |
| 🧱 테트리스 | `games/tetris/` | SRS, 홀드, T-스핀/B2B/퍼펙트 클리어, 마라톤/40줄/2분 |
| 🔢 2048 | `games/game-2048/` | 4가지 보드, 되돌리기, 자동 저장 |
| 💣 지뢰찾기 | `games/minesweeper/` | 3단계 난이도, 첫 클릭 안전, 일괄 열기, 힌트 |
| 🎯 벽돌깨기 | `games/breakout/` | 10 스테이지, 강철/TNT, 8가지 아이템 |
| 🫧 버블 드래곤 | `games/bubble-dragon/` | 반사 조준 + 낙하, 12스테이지 + 무한 |
| 💎 매치3 | `games/match3/` | 줄무늬/폭탄/무지개 보석, 15스테이지 + 타임어택 |
| 🐤 Flappy Bird | `games/flappy-bird/` | 3단계 난이도, 움직이는 파이프, 메달, 주야 테마 |
| 🕯️ Echoes of the Abyss | `games/abyss/` | 던전 ARPG · 던전, 전설 장비, 보스전 |
| 🐍 Snake | `games/snake/` | 클래식 아케이드 · 3모드, 아이템, 아케이드 |
| 🃏 Memory Match | `games/memory/` | 짝 맞추기 · 기억력, 2인, 가족 |
| 🐱 Talking Cat | `games/talking-cat/` | 펫 키우기 · 3D, 육성, 음성 |
| 🌻 Plants vs. Zombies | `games/pvz/` | 타워 디펜스 · 디펜스, 덱, 무한 |
| 🍬 Moe Garden | `games/pvz-moe/` | 모에 타워 디펜스 · 디펜스, 모에, 이펙트 |
| 💎 Crystal Guardians | `games/tower-defense/` | 전략 타워 디펜스 · TD, 강화, 보스 |
| 🟡 Pac-Man | `games/pacman/` | 미로 아케이드 · 미로, 유령 AI, 아케이드 |
| 🍉 Watermelon Merge | `games/suika/` | 물리 합성 · 합성, 물리, 힐링 |
| 🀄 Idiom Wordle | `games/idiom-guess/` | 단어 퍼즐 · 성어, 데일리, 병음 |
| 🥷 Fruit Ninja | `games/fruit-ninja/` | 스와이프 베기 · 베기, 콤보, 시원함 |
| 📦 Sokoban | `games/sokoban/` | 두뇌 퍼즐 · 밀기, 스테이지, 되돌리기 |

## 기술 특징

- 🖼️ 네이티브 Canvas 2D 렌더링, 프레임 단위 정밀 제어
- 🔊 WebAudio 합성 효과음·BGM, 외부 오디오 파일 없음
- 💾 `localStorage`에 최고 기록·진행 상황·설정 저장
- 📱 모바일 터치 조작 지원
- ⚡ 의존성 제로 — 각 게임은 `index.html` + `game.js` 폴더 하나로 완결

## 디렉토리 구조

```
awesome-mini-game/
├── index.html          # 홈(검색 + 필터 + 게임 카드)
├── favicon.svg
├── assets/             # 공용 UI / 다국어 / 오디오 / 터치 스크립트
└── games/              # 모든 게임 (게임당 폴더 하나)
    ├── raiden/         # 각 게임: index.html + game.js (+ styles.css)
    │   ├── index.html
    │   ├── game.js
    │   └── ...
    ├── tetris/
    └── ...
```

각 게임 폴더에는 해당 게임만 있고, 공용 스타일과 스크립트는 `assets/`에서 불러옵니다. 저장소 루트에서 서버를 띄우고 `games/<name>/`을 여세요.

## 기여하기

PR 환영: 버그 수정, 새 게임 추가, AI·조작감 개선. 유일한 조건은 의존성 없이 유지하는 것입니다.

## 라이선스 및 고지

- 본 저장소의 코드는 오리지널 구현이며 [MIT 라이선스](LICENSE)로 공개됩니다.
- 게임 이름·디자인·규칙은 각 원권리자에게 귀속됩니다(예: 테트리스, 슈퍼 마리오, 라이덴, 갤러그, 탱크 배틀). 본 프로젝트는 학습 목적의 비상업 팬 트리뷰트이며, 정식 버전을 응원해 주세요.
