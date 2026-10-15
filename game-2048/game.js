(() => {
'use strict';
// 2048：DOM 方块 + CSS transform 过渡；每步快照用于撤销；按棋盘尺寸分别存档
const { $, T } = KIT;
const store = KIT.store('amg-2048');
const GOALS = { 3: 256, 4: 2048, 5: 4096, 6: 8192 };
const DIRS = { left: [0, -1], right: [0, 1], up: [-1, 0], down: [1, 0] };
const UNDO_MAX = 3;

const board = $('board'), cellsEl = $('cells'), tilesEl = $('tiles');
let N = store.get('size', 4);
if (!GOALS[N]) N = 4;
let grid = [], score = 0, moves = 0, undoLeft = UNDO_MAX, history = [];
let won = false, over = false, playing = false, nextId = 1, maxTile = 0;
let dying = [], flushTimer = 0, bestAtStart = 0;
let geo = { cell: 0, gap: 0 };

// ---------------- 尺寸与渲染 ----------------
const pos = i => geo.gap + i * (geo.cell + geo.gap);
function fontFor(v) {
  const d = String(v).length;
  return geo.cell * (d <= 2 ? 0.48 : d === 3 ? 0.4 : d === 4 ? 0.31 : 0.25);
}
function tileClass(v) { return v <= 2048 ? 't' + v : v === 4096 ? 't4096' : v === 8192 ? 't8192' : 'tbig'; }

function layout() {
  const w = board.clientWidth;
  if (!w) return;
  const gap = Math.max(5, Math.round(w * (N >= 6 ? 0.018 : N === 5 ? 0.022 : 0.028)));
  geo = { gap, cell: (w - gap * (N + 1)) / N };
  cellsEl.innerHTML = '';
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const d = document.createElement('div');
    d.className = 'cell';
    d.style.cssText = `left:${pos(c)}px;top:${pos(r)}px;width:${geo.cell}px;height:${geo.cell}px`;
    cellsEl.appendChild(d);
  }
  forTiles(t => paint(t));
}

function forTiles(fn) { for (const row of grid) for (const t of row) if (t) fn(t); }

function place(t) { t.el.style.transform = `translate(${pos(t.c)}px,${pos(t.r)}px)`; }
function paint(t) {
  t.el.className = 'tile ' + tileClass(t.v) + (t.isNew ? ' new' : '') + (t.isMerged ? ' merged' : '');
  t.el.style.width = t.el.style.height = geo.cell + 'px';
  const inner = t.el.firstChild;
  inner.textContent = t.v;
  inner.style.fontSize = fontFor(t.v) + 'px';
  inner.style.borderRadius = Math.max(6, geo.cell * 0.12) + 'px';
  place(t);
}
function spawnEl(t) {
  const el = document.createElement('div');
  el.appendChild(document.createElement('div')).className = 'in';
  t.el = el;
  paint(t);
  tilesEl.appendChild(el);
}
function newTile(r, c, v, flag) {
  const t = { id: nextId++, v, r, c, isNew: flag === 'new', isMerged: flag === 'merged', fresh: flag === 'merged' };
  grid[r][c] = t;
  spawnEl(t);
  return t;
}

// 结束上一步残留的动画：移除被合并掉的方块、清掉一次性标记
function flush() {
  clearTimeout(flushTimer);
  for (const t of dying) t.el.remove();
  dying = [];
  forTiles(t => { t.fresh = false; t.isNew = false; t.isMerged = false; });
}

// ---------------- 状态 ----------------
function emptyGrid() { grid = Array.from({ length: N }, () => Array(N).fill(null)); }
function values() { return grid.map(row => row.map(t => (t ? t.v : 0))); }
function snapshot() { return { cells: values(), score, moves, won }; }
function rebuild(cells) {
  flush();
  tilesEl.innerHTML = '';
  emptyGrid();
  maxTile = 0;
  cells.forEach((row, r) => row.forEach((v, c) => {
    if (v) { newTile(r, c, v); maxTile = Math.max(maxTile, v); }
  }));
}
function emptyCells() {
  const out = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (!grid[r][c]) out.push([r, c]);
  return out;
}
function addRandom() {
  const e = emptyCells();
  if (!e.length) return;
  const [r, c] = e[(Math.random() * e.length) | 0];
  newTile(r, c, Math.random() < 0.9 ? 2 : 4, 'new');
}
function canMove() {
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const t = grid[r][c];
    if (!t) return true;
    if (c + 1 < N && grid[r][c + 1] && grid[r][c + 1].v === t.v) return true;
    if (r + 1 < N && grid[r + 1][c] && grid[r + 1][c].v === t.v) return true;
  }
  return false;
}
function save() {
  store.set('save' + N, over ? null : { cells: values(), score, moves, undoLeft, won });
}

// ---------------- 音效 ----------------
const sfx = {
  slide: () => KIT.tone(180, 0.07, { type: 'triangle', vol: 0.035, to: 140 }),
  merge: v => {
    const k = Math.log2(v);
    KIT.tone(260 * Math.pow(2, k / 7), 0.14, { type: 'triangle', vol: 0.07 });
    KIT.tone(390 * Math.pow(2, k / 7), 0.12, { type: 'sine', vol: 0.04, delay: 0.04 });
  },
  bump: () => KIT.tone(110, 0.08, { type: 'sine', vol: 0.05 }),
  cheer: () => KIT.arp([523, 659, 784, 1047], 0.07, { vol: 0.07 }),
  win: () => KIT.arp([523, 659, 784, 1047, 1319, 1568], 0.09, { vol: 0.08, dur: 0.25 }),
  over: () => KIT.arp([392, 330, 262, 196], 0.16, { type: 'sine', vol: 0.08, dur: 0.3 }),
  undo: () => KIT.tone(500, 0.1, { type: 'sine', vol: 0.05, to: 300 })
};

// ---------------- 移动 ----------------
function move(dir) {
  if (!playing || over) return;
  flush();
  const [dr, dc] = DIRS[dir];
  const before = snapshot();
  const idx = [...Array(N).keys()];
  const rows = dr === 1 ? idx.slice().reverse() : idx;
  const cols = dc === 1 ? idx.slice().reverse() : idx;
  let moved = false, gained = 0, biggest = 0;

  for (const r of rows) for (const c of cols) {
    const t = grid[r][c];
    if (!t) continue;
    let nr = r, nc = c, merged = false;
    for (;;) {
      const rr = nr + dr, cc = nc + dc;
      if (rr < 0 || rr >= N || cc < 0 || cc >= N) break;
      const o = grid[rr][cc];
      if (!o) { nr = rr; nc = cc; continue; }
      if (o.v === t.v && !o.fresh) {
        grid[r][c] = null;
        t.r = rr; t.c = cc; place(t);
        dying.push(t, o);
        const m = newTile(rr, cc, t.v * 2, 'merged');
        gained += m.v; biggest = Math.max(biggest, m.v);
        merged = moved = true;
      }
      break;
    }
    if (!merged && (nr !== r || nc !== c)) {
      grid[r][c] = null; grid[nr][nc] = t;
      t.r = nr; t.c = nc; place(t);
      moved = true;
    }
  }

  if (!moved) { sfx.bump(); return; }
  history.push(before);
  if (history.length > 20) history.shift();
  moves++;
  score += gained;
  addRandom();
  flushTimer = setTimeout(flush, 130);
  if (gained) { sfx.merge(biggest); showGain(gained); } else sfx.slide();

  if (biggest > maxTile) {
    const prev = maxTile;
    maxTile = biggest;
    const cheer = T('cheer')[biggest];
    if (cheer && prev && biggest < GOALS[N]) { KIT.toast($('toast'), cheer + ' ' + biggest); sfx.cheer(); }
  }
  const best = store.get('best' + N, 0);
  if (score > best) store.set('best' + N, score);

  if (!won && maxTile >= GOALS[N]) {
    won = true;
    setTimeout(showWin, 380);
  } else if (!canMove()) {
    over = true;
    setTimeout(showOver, 450);
  }
  save();
  renderHud();
}

function showGain(v) {
  const g = $('gain');
  g.textContent = '+' + v;
  g.classList.remove('go'); void g.offsetWidth; g.classList.add('go');
}

function undo() {
  if (!playing || !history.length) return;
  if (undoLeft <= 0) { KIT.toast($('toast'), T('noUndo')); sfx.bump(); return; }
  const s = history.pop();
  undoLeft--;
  rebuild(s.cells);
  score = s.score; moves = s.moves; won = s.won; over = false;
  $('screen-over').classList.add('hidden');
  sfx.undo();
  save();
  renderHud();
}

// ---------------- 界面 ----------------
function renderHud() {
  $('score').textContent = score;
  $('best').textContent = Math.max(store.get('best' + N, 0), score);
  $('maxTile').textContent = maxTile || 2;
  $('undo-left').textContent = undoLeft;
  $('btn-undo').disabled = !history.length || undoLeft <= 0;
  $('btn-over-undo').classList.toggle('hidden', !history.length || undoLeft <= 0);
  $('goal-tip').textContent = T('goal', won ? GOALS[N] * 2 : GOALS[N]);
}

function hideScreens() { ['screen-menu', 'screen-win', 'screen-over'].forEach(id => $(id).classList.add('hidden')); }

function startNew() {
  hideScreens();
  emptyGrid(); tilesEl.innerHTML = ''; dying = [];
  score = 0; moves = 0; undoLeft = UNDO_MAX; history = []; won = false; over = false; maxTile = 0;
  layout();
  addRandom(); addRandom();
  forTiles(t => { maxTile = Math.max(maxTile, t.v); });
  playing = true;
  bestAtStart = store.get('best' + N, 0);
  save(); renderHud();
  KIT.music('puzzle-calm');
}

function resume() {
  const s = store.get('save' + N, null);
  if (!s) return startNew();
  hideScreens();
  layout();
  rebuild(s.cells);
  score = s.score; moves = s.moves; undoLeft = s.undoLeft; won = s.won; over = false; history = [];
  playing = true;
  bestAtStart = store.get('best' + N, 0);
  renderHud();
  KIT.music('puzzle-calm');
}

function showWin() {
  sfx.win();
  $('win-title').textContent = T('winTitle', GOALS[N]);
  $('win-sub').textContent = T('winSub', score, moves);
  $('screen-win').classList.remove('hidden');
}

function showOver() {
  sfx.over();
  KIT.stopMusic();
  board.classList.remove('shake'); void board.offsetWidth; board.classList.add('shake');
  const best = store.get('best' + N, 0);
  const isRecord = score > bestAtStart;
  $('over-record').classList.toggle('hidden', !isRecord);
  $('over-stats').innerHTML =
    `<span>${T('stScore')}</span><b>${score}</b><span>${T('stBest')}</span><b>${best}</b>` +
    `<span>${T('stMax')}</span><b>${maxTile}</b><span>${T('stMoves')}</span><b>${moves}</b>`;
  renderHud();
  $('screen-over').classList.remove('hidden');
}

function showMenu() {
  playing = false;
  hideScreens();
  renderMenu();
  $('screen-menu').classList.remove('hidden');
}
function renderMenu() {
  document.querySelectorAll('#size-seg button').forEach(b => b.classList.toggle('on', +b.dataset.n === N));
  $('size-desc').textContent = T('sizeDesc', N, GOALS[N]);
  $('menu-best').textContent = T('best', N, store.get('best' + N, 0));
  $('btn-continue').classList.toggle('hidden', !store.get('save' + N, null));
}

// ---------------- 输入 ----------------
document.querySelectorAll('#size-seg button').forEach(b => b.addEventListener('click', () => {
  N = +b.dataset.n; store.set('size', N);
  emptyGrid(); tilesEl.innerHTML = ''; layout();
  renderMenu();
  KIT.tone(440 + N * 60, 0.08, { type: 'triangle', vol: 0.05 });
}));
$('btn-start').onclick = startNew;
$('btn-continue').onclick = resume;
$('btn-new').onclick = startNew;
$('btn-size').onclick = showMenu;
$('btn-undo').onclick = undo;
$('btn-over-undo').onclick = undo;
$('btn-retry').onclick = startNew;
$('btn-win-new').onclick = startNew;
$('btn-keep').onclick = () => { $('screen-win').classList.add('hidden'); renderHud(); };

const KEYMAP = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
  a: 'left', d: 'right', w: 'up', s: 'down', A: 'left', D: 'right', W: 'up', S: 'down'
};
document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
  const dir = KEYMAP[e.key];
  const winOpen = !$('screen-win').classList.contains('hidden');
  if (dir && playing && !winOpen) { e.preventDefault(); move(dir); return; }
  if (e.key === 'z' || e.key === 'Z') undo();
  else if ((e.key === 'r' || e.key === 'R') && playing) startNew();
  else if (e.key === 'Enter' && !$('screen-menu').classList.contains('hidden')) startNew();
});

// 指针拖动（鼠标 + 触屏统一）：超过阈值即判定方向
let drag = null;
board.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY }; });
window.addEventListener('pointermove', e => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 26) return;
  drag = null;
  move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
});
window.addEventListener('pointerup', () => { drag = null; });
window.addEventListener('pointercancel', () => { drag = null; });

if (window.ResizeObserver) new ResizeObserver(() => layout()).observe(board);
else window.addEventListener('resize', layout);

const syncMute = KIT.mountMute($('btn-mute'));
KIT.boot(() => { syncMute(); renderHud(); renderMenu(); });
emptyGrid();
layout();
showMenu();
})();
