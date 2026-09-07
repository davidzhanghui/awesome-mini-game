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

## 게임 목록 (14종)

| 게임 | 폴더 | 특징 |
|---|---|---|
| 🚀 라이덴 RAIDEN | `raiden/` | 2P 협동 슈팅, 8 스테이지 + 8 보스, 파워업 시스템 |
| 🍄 슈퍼 마리오 | `super-mario-bros/` | 횡스크롤 점프, 픽셀 물리, 버섯·거북이 밟기 |
| 🪖 탱크 배틀 | `tank-battle/` | 기지 방어, 파괴 가능한 지형 |
| 🐝 갤러그 Galaga | `galaga/` | 급강하·편대 공격, 듀얼 파이터 합체 |
| ♞ 중국 장기 | `chinese-chess/` | 완전한 규칙 + AI 엔진(Web Worker, UI 논블로킹) |
| 🃏 도우 디주 Dou Dizhu | `dou-dizhu/` | 3인 대전, 완전한 족보 판정 |
| ⚫ 오목 | `gomoku/` | 2인 대전 + 3단계 난이도 AI |
| 🧱 테트리스 | `tetris/` | 가이드라인 규칙, SRS 회전, T-Spin 판정 |
| 🔢 2048 | `game-2048/` | 부드러운 슬라이드·합치기 애니메이션 |
| 💣 지뢰찾기 | `minesweeper/` | 3단계 난이도, 첫 클릭 안전 보장 |
| 🎯 벽돌깨기 | `breakout/` | 멀티볼·레이저·관통 등 풍부한 아이템 |
| 🫧 버블 드래곤 | `bubble-dragon/` | 조준 발사 + 벽 반사 + 연쇄 제거 |
| 💎 매치3 | `match3/` | 교환 매치, 콤보 배율 |
| 🐤 Flappy Bird | `flappy-bird/` | 1인 / 2인 대전, 주야 테마 |

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
├── raiden/             # 각 게임: index.html + game.js(+ styles.css)
│   ├── index.html
│   ├── game.js
│   └── ...
├── tetris/
└── ...
```

각 게임 폴더는 독립적이며, 해당 `index.html`만 열어도 그 게임을 바로 즐길 수 있습니다.

## 기여하기

PR 환영: 버그 수정, 새 게임 추가, AI·조작감 개선. 유일한 조건은 의존성 없이 유지하는 것입니다.

## 라이선스 및 고지

- 본 저장소의 코드는 오리지널 구현이며 [MIT 라이선스](LICENSE)로 공개됩니다.
- 게임 이름·디자인·규칙은 각 원권리자에게 귀속됩니다(예: 테트리스, 슈퍼 마리오, 라이덴, 갤러그, 탱크 배틀). 본 프로젝트는 학습 목적의 비상업 팬 트리뷰트이며, 정식 버전을 응원해 주세요.
