/* 俄罗斯方块 · 方块狂潮 —— 现代规则（Guideline）
 * 7-bag、SRS 旋转与踢墙、暂存、5 个预览、影子、锁定延迟、T-Spin / B2B / 连击 / 全消，
 * 马拉松 / 40 行冲刺 / 2 分钟限时三种模式。
 */
(() => {
'use strict';
const { $, T } = KIT;
const store = KIT.store('amg-tetris');
const W = 520, H = 640, COLS = 10, ROWS = 22, VIS = 20, CS = 28, BX = 120, BY = 48, STEP = 1 / 60;
const cv = $('game'), c = KIT.canvas(cv, W, H);
const DISP = '"AMG Display", "PingFang SC", system-ui, sans-serif';
const NUMF = '"Helvetica Neue", Arial, system-ui, sans-serif';

// ---------------- 方块定义 ----------------
const BASE = {
  I: [[0, 1], [1, 1], [2, 1], [3, 1]], O: [[1, 0], [2, 0], [1, 1], [2, 1]], T: [[1, 0], [0, 1], [1, 1], [2, 1]],
  S: [[1, 0], [2, 0], [0, 1], [1, 1]], Z: [[0, 0], [1, 0], [1, 1], [2, 1]], J: [[0, 0], [0, 1], [1, 1], [2, 1]], L: [[2, 0], [0, 1], [1, 1], [2, 1]]
};
const SIZE = { I: 4, O: 4, T: 3, S: 3, Z: 3, J: 3, L: 3 };
const COLOR = { I: '#31c7ef', O: '#f7d308', T: '#b04fd0', S: '#42c24a', Z: '#ef2a35', J: '#3f6bff', L: '#ff8a1e', G: '#6b7280' };
const SHAPES = {};
for (const k in BASE) {
  SHAPES[k] = [BASE[k]];
  for (let r = 1; r < 4; r++) SHAPES[k].push(k === 'O' ? BASE[k] : SHAPES[k][r - 1].map(([x, y]) => [SIZE[k] - 1 - y, x]));
}
// SRS 踢墙（y 向上为正，使用时取反）
const KICK = {
  '0>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]], '1>0': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '1>2': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]], '2>1': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '2>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]], '3>2': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '3>0': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]], '0>3': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]]
};
const KICK_I = {
  '0>1': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]], '1>0': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '1>2': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]], '2>1': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '2>3': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]], '3>2': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '3>0': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]], '0>3': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]]
};
const KICK180 = [[0, 0], [0, 1], [1, 0], [-1, 0], [0, -1]];

// ---------------- 状态 ----------------
let state = 'menu', prevState = 'play', mode = store.get('mode', 'marathon'), startLv = store.get('startLv', 1), feel = store.get('feel', 0);
let grid, bag, queue, cur, hold, holdUsed, level, lines, score, combo, b2b, timeMs, pieces, stats, gravAcc, lockT, lockResets, lowestY, lastRot, kickIdx;
let clearAnim = null, popups = [], countdown = 0, overAnim = 0, shake = 0, bumpY = 0, best = store.get('best', { marathon: 0, sprint: 0, ultra: 0 }), finished = null;
const fx = new KIT.Particles();
const ULTRA_MS = 120000, SPRINT_LINES = 40;
const FEEL = [{ das: 167, arr: 33 }, { das: 110, arr: 0 }];

// ---------------- 声音 ----------------
const SFX = {
  move: () => KIT.tone(520, 0.025, { type: 'square', vol: 0.018 }),
  rotate: () => KIT.tone(760, 0.035, { type: 'triangle', vol: 0.035 }),
  lock: () => KIT.noise(0.05, { vol: 0.07, lp: 1400 }),
  hard: () => { KIT.noise(0.1, { vol: 0.14, lp: 900 }); KIT.tone(140, 0.12, { type: 'sine', vol: 0.08, to: 70 }); },
  hold: () => KIT.arp([440, 660], 0.04, { type: 'triangle', vol: 0.04 }),
  clear: n => KIT.arp([523, 659, 784, 1047].slice(0, n), 0.05, { type: 'square', vol: 0.05 }),
  tetris: () => KIT.arp([523, 659, 784, 1047, 1319, 1568], 0.045, { type: 'square', vol: 0.06 }),
  tspin: () => KIT.arp([392, 587, 784, 1175], 0.05, { type: 'triangle', vol: 0.07 }),
  level: () => KIT.arp([784, 988, 1175, 1568], 0.08, { type: 'triangle', vol: 0.07 }),
  pc: () => KIT.arp([523, 659, 784, 1047, 1319, 1568, 2093], 0.06, { type: 'square', vol: 0.06 }),
  count: f => KIT.tone(f, 0.12, { type: 'square', vol: 0.05 }),
  over: () => KIT.arp([523, 466, 415, 349, 262], 0.14, { type: 'triangle', vol: 0.07 })
};

// ---------------- 核心逻辑 ----------------
const cells = (p, rot = p.rot, x = p.x, y = p.y) => SHAPES[p.k][rot].map(([cx, cy]) => [x + cx, y + cy]);
function fits(p, rot, x, y) {
  for (const [cx, cy] of cells(p, rot, x, y)) {
    if (cx < 0 || cx >= COLS || cy >= ROWS) return false;
    if (cy >= 0 && grid[cy][cx]) return false;
  }
  return true;
}
function refill() { const b = ['I', 'O', 'T', 'S', 'Z', 'J', 'L']; for (let i = 6; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } queue.push(...b); }
function spawn(k) {
  if (!k) { if (queue.length < 7) refill(); k = queue.shift(); }
  cur = { k, rot: 0, x: k === 'O' ? 3 : 3, y: 0 };
  if (k === 'I') cur.y = 0;
  lockT = 0; lockResets = 0; lowestY = cur.y; lastRot = false; gravAcc = 0;
  if (!fits(cur, 0, cur.x, cur.y)) { cur.y--; if (!fits(cur, 0, cur.x, cur.y)) { gameOver(); return false; } }
  // 预先下落到可见区上沿
  if (fits(cur, 0, cur.x, cur.y + 1)) cur.y++;
  pieces++;
  return true;
}
function grounded() { return !fits(cur, cur.rot, cur.x, cur.y + 1); }
function onMoved() {
  if (grounded() && lockResets < 15) { lockT = 0; lockResets++; }
}
function tryMove(dx) {
  if (!cur || !fits(cur, cur.rot, cur.x + dx, cur.y)) return false;
  cur.x += dx; lastRot = false; onMoved(); SFX.move(); return true;
}
function rotate(dir) {
  if (!cur || cur.k === 'O') { if (cur) { lastRot = false; } return; }
  const from = cur.rot, to = (from + dir + 4) % 4;
  const table = dir === 2 ? KICK180.map(k => k) : (cur.k === 'I' ? KICK_I : KICK)[from + '>' + to];
  for (let i = 0; i < table.length; i++) {
    const [kx, ky] = table[i];
    if (fits(cur, to, cur.x + kx, cur.y - ky)) {
      cur.x += kx; cur.y -= ky; cur.rot = to; lastRot = true; kickIdx = i;
      onMoved(); SFX.rotate();
      if (cur.y > lowestY) { lowestY = cur.y; lockResets = 0; }
      return;
    }
  }
}
function softDrop() { if (cur && fits(cur, cur.rot, cur.x, cur.y + 1)) { cur.y++; score += 1; lastRot = false; if (cur.y > lowestY) { lowestY = cur.y; lockResets = 0; } return true; } return false; }
function hardDrop() {
  if (!cur) return;
  const y0 = cur.y;
  while (fits(cur, cur.rot, cur.x, cur.y + 1)) { cur.y++; lastRot = false; }
  const d = cur.y - y0; score += d * 2;
  if (d > 0) {
    for (const [cx, cy] of cells(cur)) for (let k = 0; k < 2; k++) fx.burst(BX + cx * CS + CS / 2, BY + (cy - 2) * CS, { n: 1, color: COLOR[cur.k], speed: 60, life: 0.35, size: 3, gravity: -80, angle: -Math.PI / 2, spread: 0.6 });
    trail = { k: cur.k, cells: cells(cur), d, t: 0 };
  }
  bumpY = 4; SFX.hard();
  lock();
}
let trail = null;
function doHold() {
  if (!cur || holdUsed) return;
  const k = cur.k;
  if (hold) { const h = hold; hold = k; spawn(h); } else { hold = k; spawn(); }
  holdUsed = true; SFX.hold();
}
function tSpinType() {
  if (cur.k !== 'T' || !lastRot) return 0;
  const corners = [[0, 0], [2, 0], [0, 2], [2, 2]].map(([cx, cy]) => { const x = cur.x + cx, y = cur.y + cy; return x < 0 || x >= COLS || y >= ROWS || (y >= 0 && grid[y][x]) ? 1 : 0; });
  const n = corners.reduce((a, b) => a + b, 0);
  if (n < 3) return 0;
  const FRONT = [[0, 1], [1, 3], [2, 3], [0, 2]][cur.rot];
  const front = corners[FRONT[0]] + corners[FRONT[1]];
  return front === 2 || kickIdx === 4 ? 2 : 1; // 2 = T-Spin, 1 = Mini
}
function lock() {
  const ts = tSpinType();
  let above = true;
  for (const [cx, cy] of cells(cur)) { if (cy >= 0) grid[cy][cx] = cur.k; if (cy >= 2) above = false; }
  for (const [cx, cy] of cells(cur)) lockFlash.push({ x: cx, y: cy, t: 0 });
  SFX.lock();
  const full = [];
  for (let y = 0; y < ROWS; y++) if (grid[y].every(v => v)) full.push(y);
  const n = full.length;
  // 计分
  let pts = 0, label = [], diff = false;
  if (ts === 2) { pts = [400, 800, 1200, 1600][n]; label.push('T-SPIN' + (n ? ' ' + ['', 'SINGLE', 'DOUBLE', 'TRIPLE'][n] : '')); diff = n > 0; stats.tspins++; SFX.tspin(); }
  else if (ts === 1) { pts = [100, 200, 400][n] || 400; label.push('T-SPIN MINI' + (n ? ' ' + ['', 'SINGLE', 'DOUBLE'][n] : '')); diff = n > 0; SFX.tspin(); }
  else if (n) { pts = [0, 100, 300, 500, 800][n]; if (n === 4) { label.push('TETRIS'); diff = true; stats.tetris++; } else label.push(['', 'SINGLE', 'DOUBLE', 'TRIPLE'][n]); }
  if (n) {
    if (diff && b2b) { pts = Math.floor(pts * 1.5); label.unshift('B2B'); }
    b2b = diff ? true : n ? false : b2b;
    combo++;
    if (combo > 0) { pts += 50 * combo; label.push(T('combo', combo)); stats.maxCombo = Math.max(stats.maxCombo, combo); }
  } else combo = -1;
  score += pts * level;
  const pc = n && grid.every((row, y) => full.includes(y) || row.every(v => !v));
  if (pc) { score += [0, 800, 1200, 1800, 2000][n] * level; label.push('PERFECT CLEAR'); SFX.pc(); }
  if (label.length && (n || ts)) popup(label, n === 4 || ts === 2 || pc);
  cur = null; holdUsed = false;
  if (n) {
    if (n === 4 || pc) shake = 8;
    if (!(ts === 2) && n < 4 && !pc) SFX.clear(n); else if (n === 4) SFX.tetris();
    clearAnim = { rows: full, t: 0 };
    for (const y of full) for (let x = 0; x < COLS; x++) fx.burst(BX + x * CS + CS / 2, BY + (y - 2) * CS + CS / 2, { n: 3, color: [COLOR[grid[y][x]], '#ffffff'], speed: 220, life: 0.6, size: 3.5, gravity: 400, shape: 'square' });
  } else { if (above) { gameOver(); return; } next(); }
}
let lockFlash = [];
function finishClear() {
  const rows = clearAnim.rows; clearAnim = null;
  for (const y of rows) { grid.splice(y, 1); grid.unshift(Array(COLS).fill(null)); }
  const before = level;
  lines += rows.length;
  if (mode === 'marathon') level = Math.max(level, Math.min(20, startLv + Math.floor(lines / 10)));
  if (level > before) { SFX.level(); popup([T('levelUp', level)], true, '#7dffb0'); }
  if (mode === 'sprint' && lines >= SPRINT_LINES) { finish(); return; }
  next();
}
function next() { if (state === 'play') spawn(); }
const gravity = () => Math.pow(0.8 - (level - 1) * 0.007, level - 1); // 秒 / 行
function popup(lbls, big, col) { popups.push({ lines: lbls, t: 0, big, col: col || (big ? '#ffd84a' : '#ffffff') }); }

// ---------------- 输入（DAS / ARR） ----------------
const keys = new Set();
const KM = {
  left: ['ArrowLeft', 'KeyA', 'Pad_l', 'Tch_l'], right: ['ArrowRight', 'KeyD', 'Pad_r', 'Tch_r'], soft: ['ArrowDown', 'KeyS', 'Pad_d'],
  hard: ['Space', 'KeyW', 'Pad_hard'], cw: ['ArrowUp', 'KeyX', 'KeyK', 'Pad_cw'], ccw: ['KeyZ', 'ControlLeft', 'ControlRight', 'KeyJ', 'Pad_ccw'], r180: ['KeyQ', 'KeyE'], hold: ['KeyC', 'ShiftLeft', 'ShiftRight', 'KeyL', 'Pad_hold']
};
const act = code => { for (const a in KM) if (KM[a].includes(code)) return a; return null; };
let das = { dir: 0, t: 0, arrT: 0 };
function press(a) {
  if (state !== 'play' || countdown > 0 || !cur || clearAnim) { if (a === 'left' || a === 'right') das = { dir: a === 'left' ? -1 : 1, t: 0, arrT: 0 }; return; }
  if (a === 'left' || a === 'right') { const d = a === 'left' ? -1 : 1; das = { dir: d, t: 0, arrT: 0 }; tryMove(d); }
  else if (a === 'hard') hardDrop();
  else if (a === 'cw') rotate(1);
  else if (a === 'ccw') rotate(-1);
  else if (a === 'r180') rotate(2);
  else if (a === 'hold') doHold();
}
document.addEventListener('keydown', e => {
  if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
  const a = act(e.code);
  if (a && state === 'play') e.preventDefault();
  if (e.code === 'KeyP' || e.code === 'Escape') { togglePause(); return; }
  if (state === 'menu' && e.code === 'Enter') { newGame(); return; }
  if (e.repeat) return;
  keys.add(e.code);
  if (a) press(a);
});
document.addEventListener('keyup', e => {
  keys.delete(e.code);
  const a = act(e.code);
  if ((a === 'left' && das.dir < 0) || (a === 'right' && das.dir > 0)) {
    const other = a === 'left' ? 'right' : 'left';
    das = KM[other].some(k => keys.has(k)) ? { dir: -das.dir, t: 0, arrT: 0 } : { dir: 0, t: 0, arrT: 0 };
  }
});
const held = a => KM[a].some(k => keys.has(k));
window.addEventListener('blur', () => { keys.clear(); das.dir = 0; if (state === 'play') togglePause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') togglePause(); });
let padPrev = {};
function pollPads() {
  let gps = [];
  try { gps = navigator.getGamepads ? navigator.getGamepads() : []; } catch (e) { return; }
  const g = [...gps].find(x => x); if (!g) return;
  const b = k => !!(g.buttons[k] && g.buttons[k].pressed);
  const st = { Pad_l: b(14) || g.axes[0] < -0.5, Pad_r: b(15) || g.axes[0] > 0.5, Pad_d: b(13) || g.axes[1] > 0.5, Pad_hard: b(12), Pad_cw: b(0) || b(3), Pad_ccw: b(1) || b(2), Pad_hold: b(4) || b(5), Pad_pause: b(9) };
  for (const k in st) {
    if (st[k] && !padPrev[k]) { if (k === 'Pad_pause') togglePause(); else { keys.add(k); const a = act(k); if (state === 'menu' && k === 'Pad_cw') newGame(); else if (a) press(a); } }
    if (!st[k] && padPrev[k]) { keys.delete(k); if ((k === 'Pad_l' && das.dir < 0) || (k === 'Pad_r' && das.dir > 0)) das.dir = 0; }
  }
  padPrev = st;
}
// 触屏手势：拖动左右移动、轻点旋转、下滑软降、快速下划硬降、上划暂存
const tch = { on: false };
cv.addEventListener('pointerdown', e => {
  if (state !== 'play' || e.pointerType === 'mouse') return;
  const r = cv.getBoundingClientRect();
  Object.assign(tch, { on: true, id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t0: performance.now(), moved: false, cell: r.width / W * CS * 0.9, accX: 0, accY: 0 });
  try { cv.setPointerCapture(e.pointerId); } catch (_) {}
});
cv.addEventListener('pointermove', e => {
  if (!tch.on || e.pointerId !== tch.id) return;
  tch.accX += e.clientX - tch.x; tch.accY += e.clientY - tch.y; tch.x = e.clientX; tch.y = e.clientY;
  while (Math.abs(tch.accX) >= tch.cell) { const d = Math.sign(tch.accX); press(d < 0 ? 'left' : 'right'); das.dir = 0; tch.accX -= d * tch.cell; tch.moved = true; }
  while (tch.accY >= tch.cell * 1.2) { softDrop(); tch.accY -= tch.cell * 1.2; tch.moved = true; }
});
cv.addEventListener('pointerup', e => {
  if (!tch.on || e.pointerId !== tch.id) return;
  tch.on = false;
  const dt = performance.now() - tch.t0, dx = e.clientX - tch.x0, dy = e.clientY - tch.y0, v = dy / Math.max(1, dt);
  if (dy > 50 && v > 0.9) { press('hard'); return; }
  if (dy < -50 && Math.abs(dx) < 60) { press('hold'); return; }
  if (!tch.moved && dt < 260 && Math.hypot(dx, dy) < 14) { const r = cv.getBoundingClientRect(); press(e.clientX - r.left < r.width * 0.35 ? 'ccw' : 'cw'); }
});
cv.addEventListener('pointercancel', () => { tch.on = false; });
document.querySelectorAll('#pad [data-a]').forEach(b => b.addEventListener('pointerdown', e => { e.preventDefault(); KIT.audio(); if (b.dataset.a === 'pause') togglePause(); else press(b.dataset.a); }));

// ---------------- 主循环 ----------------
function tick() {
  if (state !== 'play') { stepFx(); if (state === 'over') overAnim += STEP; return; }
  stepFx();
  if (countdown > 0) {
    const before = Math.ceil(countdown);
    countdown -= STEP;
    if (Math.ceil(countdown) !== before) SFX.count(countdown > 0 ? 660 : 1320);
    if (countdown <= 0) { spawn(); KIT.music('block-rush'); }
    return;
  }
  timeMs += STEP * 1000;
  if (mode === 'ultra' && timeMs >= ULTRA_MS) { timeMs = ULTRA_MS; finish(); return; }
  if (clearAnim) { clearAnim.t += STEP; if (clearAnim.t > 0.28) finishClear(); return; }
  if (!cur) return;
  // DAS / ARR
  const F = FEEL[feel];
  if (das.dir) {
    if (!held(das.dir < 0 ? 'left' : 'right') && !tch.on) das.dir = 0;
    else {
      das.t += STEP * 1000;
      if (das.t >= F.das) {
        if (F.arr === 0) { while (tryMove(das.dir)); }
        else { das.arrT += STEP * 1000; while (das.arrT >= F.arr) { das.arrT -= F.arr; tryMove(das.dir); } }
      }
    }
  }
  // 重力 + 软降
  const g = gravity(), soft = held('soft');
  gravAcc += STEP / (soft ? Math.min(g, 0.05) : g);
  while (gravAcc >= 1) {
    gravAcc -= 1;
    if (fits(cur, cur.rot, cur.x, cur.y + 1)) { cur.y++; lastRot = false; if (soft) score += 1; if (cur.y > lowestY) { lowestY = cur.y; lockResets = 0; } }
    else { gravAcc = 0; break; }
  }
  if (grounded()) { lockT += STEP; if (lockT >= 0.5) lock(); }
  else lockT = 0;
}
function stepFx() {
  fx.update(STEP);
  for (const p of popups) p.t += STEP;
  popups = popups.filter(p => p.t < 1.6);
  for (const l of lockFlash) l.t += STEP;
  lockFlash = lockFlash.filter(l => l.t < 0.25);
  if (trail) { trail.t += STEP; if (trail.t > 0.25) trail = null; }
  shake = Math.max(0, shake - 0.5); bumpY = Math.max(0, bumpY - 0.5);
}

// ---------------- 绘制 ----------------
function block(x, y, k, s = CS, alpha = 1) {
  const col = COLOR[k];
  c.globalAlpha = alpha;
  c.fillStyle = col; c.fillRect(x + 1, y + 1, s - 2, s - 2);
  const g = c.createLinearGradient(x, y, x + s, y + s); g.addColorStop(0, 'rgba(255,255,255,.45)'); g.addColorStop(0.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,.25)');
  c.fillStyle = g; c.fillRect(x + 1, y + 1, s - 2, s - 2);
  c.fillStyle = 'rgba(255,255,255,.55)'; c.fillRect(x + 3, y + 3, s - 6, Math.max(2, s * 0.1));
  c.globalAlpha = 1;
}
function miniPiece(k, cx, cy, s) {
  const sh = SHAPES[k][0], xs = sh.map(p => p[0]), ys = sh.map(p => p[1]);
  const w = Math.max(...xs) - Math.min(...xs) + 1, h = Math.max(...ys) - Math.min(...ys) + 1;
  for (const [x, y] of sh) block(cx - w * s / 2 + (x - Math.min(...xs)) * s, cy - h * s / 2 + (y - Math.min(...ys)) * s, k, s);
}
function hue() { return (200 + ((level || 1) - 1) * 23) % 360; }
function render() {
  const hh = hue();
  const bg = c.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, `hsl(${hh},45%,14%)`); bg.addColorStop(1, `hsl(${(hh + 40) % 360},50%,8%)`);
  c.fillStyle = bg; c.fillRect(0, 0, W, H);
  // 背景漂浮方块
  c.globalAlpha = 0.06;
  for (let i = 0; i < 14; i++) { const t = performance.now() / 1000, x = (i * 97 + t * (6 + i)) % (W + 60) - 30, y = (i * 53 + t * 14 * (1 + i % 3)) % (H + 60) - 30; c.fillStyle = Object.values(COLOR)[i % 7]; c.fillRect(x, y, 22, 22); }
  c.globalAlpha = 1;
  c.save();
  if (shake > 0) c.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  c.translate(0, bumpY);
  // 棋盘
  c.fillStyle = 'rgba(0,0,0,.55)'; c.fillRect(BX - 4, BY - 4, COLS * CS + 8, VIS * CS + 8);
  c.strokeStyle = `hsla(${hh},80%,70%,.55)`; c.lineWidth = 2; c.strokeRect(BX - 4, BY - 4, COLS * CS + 8, VIS * CS + 8);
  c.strokeStyle = 'rgba(255,255,255,.05)'; c.lineWidth = 1; c.beginPath();
  for (let x = 1; x < COLS; x++) { c.moveTo(BX + x * CS + 0.5, BY); c.lineTo(BX + x * CS + 0.5, BY + VIS * CS); }
  for (let y = 1; y < VIS; y++) { c.moveTo(BX, BY + y * CS + 0.5); c.lineTo(BX + COLS * CS, BY + y * CS + 0.5); }
  c.stroke();
  if (grid) {
    for (let y = 2; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const k = grid[y][x]; if (!k) continue;
      const gray = state === 'over' && (ROWS - y) < overAnim * 30;
      block(BX + x * CS, BY + (y - 2) * CS, gray ? 'G' : k);
    }
    if (clearAnim) {
      const k = clearAnim.t / 0.28;
      for (const y of clearAnim.rows) {
        c.fillStyle = `rgba(255,255,255,${0.9 * (1 - k)})`;
        const w = COLS * CS * (1 - k * 0.6);
        c.fillRect(BX + (COLS * CS - w) / 2, BY + (y - 2) * CS, w, CS);
      }
    }
    for (const l of lockFlash) if (l.y >= 2) { c.fillStyle = `rgba(255,255,255,${0.5 * (1 - l.t / 0.25)})`; c.fillRect(BX + l.x * CS, BY + (l.y - 2) * CS, CS, CS); }
    if (trail) {
      for (const [x, y] of trail.cells) {
        const gr = c.createLinearGradient(0, BY + (y - 2 - trail.d) * CS, 0, BY + (y - 2) * CS);
        gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, COLOR[trail.k] + '66');
        c.globalAlpha = 1 - trail.t / 0.25; c.fillStyle = gr; c.fillRect(BX + x * CS + 4, BY + Math.max(0, y - 2 - trail.d) * CS, CS - 8, Math.min(trail.d, y - 2) * CS + CS); c.globalAlpha = 1;
      }
    }
    if (cur && state !== 'over') {
      let gy = cur.y; while (fits(cur, cur.rot, cur.x, gy + 1)) gy++;
      for (const [x, y] of cells(cur, cur.rot, cur.x, gy)) if (y >= 2) {
        c.fillStyle = COLOR[cur.k] + '30'; c.fillRect(BX + x * CS + 1, BY + (y - 2) * CS + 1, CS - 2, CS - 2);
        c.strokeStyle = COLOR[cur.k] + 'aa'; c.lineWidth = 1.5; c.strokeRect(BX + x * CS + 2, BY + (y - 2) * CS + 2, CS - 4, CS - 4);
      }
      const lockK = grounded() ? Math.min(1, lockT / 0.5) : 0;
      for (const [x, y] of cells(cur)) if (y >= 2) { block(BX + x * CS, BY + (y - 2) * CS, cur.k); if (lockK) { c.fillStyle = `rgba(0,0,0,${lockK * 0.25})`; c.fillRect(BX + x * CS, BY + (y - 2) * CS, CS, CS); } }
    }
  }
  c.restore();
  // 侧栏
  panelBox(12, BY, 96, 84, 'HOLD');
  if (hold) { c.globalAlpha = holdUsed ? 0.35 : 1; miniPiece(hold, 60, BY + 50, 18); c.globalAlpha = 1; }
  panelBox(W - 108, BY, 96, 300, 'NEXT');
  if (queue) queue.slice(0, 5).forEach((k, i) => miniPiece(k, W - 60, BY + 52 + i * 56 - (i ? 0 : 0), i === 0 ? 20 : 15));
  // 数据
  const st = [];
  if (mode === 'sprint') st.push(['LINES', Math.min(lines || 0, SPRINT_LINES) + '/' + SPRINT_LINES], ['TIME', fmt(timeMs || 0)]);
  else if (mode === 'ultra') st.push(['TIME', fmt(Math.max(0, ULTRA_MS - (timeMs || 0)))], ['LINES', lines || 0]);
  else st.push(['LEVEL', level || startLv], ['LINES', lines || 0], ['TIME', fmt(timeMs || 0)]);
  st.unshift(['SCORE', (score || 0).toLocaleString()]);
  st.forEach(([a, b], i) => {
    const y = BY + 104 + i * 58;
    c.fillStyle = 'rgba(255,255,255,.55)'; c.font = 'bold 11px ' + NUMF; c.textAlign = 'left'; c.textBaseline = 'top'; c.fillText(a, 14, y);
    c.fillStyle = '#fff'; c.font = 'bold ' + (String(b).length > 8 ? 15 : 19) + 'px ' + NUMF; c.fillText(b, 14, y + 16);
  });
  if (combo > 0 && state === 'play') { c.fillStyle = '#ffd84a'; c.font = 'bold 14px ' + NUMF; c.fillText(T('combo', combo), 14, BY + 104 + st.length * 58); }
  if (b2b && state === 'play') { c.fillStyle = '#7dffb0'; c.font = 'bold 13px ' + NUMF; c.fillText('B2B', 14, BY + 124 + st.length * 58); }
  // 右下：模式与最佳
  c.fillStyle = 'rgba(255,255,255,.55)'; c.font = 'bold 11px ' + NUMF; c.textAlign = 'left'; c.fillText(T('modeNames')[mode].toUpperCase(), W - 106, BY + 316);
  c.fillStyle = '#ffd84a'; c.font = 'bold 13px ' + NUMF; c.fillText('BEST ' + bestText(), W - 106, BY + 334);
  fx.draw(c);
  // 弹出文字
  for (const p of popups) {
    const k = p.t, sc = k < 0.2 ? 0.6 + KIT.ease.outBack(k / 0.2) * 0.4 : 1, a = k > 1.1 ? 1 - (k - 1.1) / 0.5 : 1;
    c.save(); c.translate(BX + COLS * CS / 2, BY + 210 - k * 24); c.scale(sc, sc); c.globalAlpha = Math.max(0, a);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    p.lines.forEach((t, i) => {
      c.font = (i === 0 && p.big ? 'bold 30px ' : 'bold 20px ') + NUMF;
      c.lineWidth = 5; c.strokeStyle = 'rgba(0,0,0,.6)'; c.strokeText(t, 0, i * 30);
      c.fillStyle = i === 0 ? p.col : '#ffffff'; c.fillText(t, 0, i * 30);
    });
    c.restore();
  }
  if (state === 'play' && countdown > 0) {
    const n = Math.ceil(countdown), k = n - countdown;
    c.save(); c.translate(BX + COLS * CS / 2, BY + 260); c.scale(1.6 - k * 0.6, 1.6 - k * 0.6); c.globalAlpha = 1 - k * 0.6;
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = 'bold 72px ' + NUMF; c.fillStyle = '#fff'; c.fillText(n, 0, 0); c.restore();
  }
}
function panelBox(x, y, w, h, title) {
  c.fillStyle = 'rgba(0,0,0,.45)'; KIT.roundRect(c, x, y, w, h, 10); c.fill();
  c.strokeStyle = 'rgba(255,255,255,.12)'; c.lineWidth = 1; KIT.roundRect(c, x + 0.5, y + 0.5, w - 1, h - 1, 10); c.stroke();
  c.fillStyle = 'rgba(255,255,255,.6)'; c.font = 'bold 11px ' + NUMF; c.textAlign = 'center'; c.textBaseline = 'top'; c.fillText(title, x + w / 2, y + 7);
}
const fmt = ms => { const s = ms / 1000, m = Math.floor(s / 60); return m + ':' + (s % 60).toFixed(2).padStart(5, '0'); };
function bestText() { const b = best[mode]; if (!b) return '—'; return mode === 'sprint' ? fmt(b) : b.toLocaleString(); }
let acc = 0, last = performance.now();
function frame(now) {
  acc += Math.min(0.1, (now - last) / 1000); last = now;
  pollPads();
  let n = 0; while (acc >= STEP && n++ < 6) { acc -= STEP; tick(); } if (n >= 6) acc = 0;
  render();
  requestAnimationFrame(frame);
}

// ---------------- 流程 / 屏幕 ----------------
function newGame() {
  hideScreens(); KIT.audio(); KIT.stopMusic();
  grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  bag = []; queue = []; refill(); refill();
  cur = null; hold = null; holdUsed = false; level = mode === 'marathon' ? startLv : 1; lines = 0; score = 0; combo = -1; b2b = false; timeMs = 0; pieces = 0;
  stats = { tetris: 0, tspins: 0, maxCombo: 0 }; gravAcc = 0; clearAnim = null; popups = []; lockFlash = []; trail = null; fx.clear(); overAnim = 0; finished = null;
  das = { dir: 0, t: 0, arrT: 0 };
  state = 'play'; countdown = 3; SFX.count(660);
}
function gameOver() {
  if (state !== 'play') return;
  state = 'over'; cur = null; overAnim = 0; KIT.stopMusic(); SFX.over(); shake = 10;
  setTimeout(() => showResult(false), 1100);
}
function finish() {
  state = 'over'; finished = true; cur = null; KIT.stopMusic(); SFX.pc();
  fx.burst(BX + COLS * CS / 2, BY + 280, { n: 80, color: Object.values(COLOR), speed: 420, life: 1.5, size: 5, gravity: 300, shape: 'square' });
  overAnim = -99;
  setTimeout(() => showResult(true), 900);
}
function showResult(done) {
  const val = mode === 'sprint' ? (done ? timeMs : 0) : score;
  let rec = false;
  if (val && (mode === 'sprint' ? (!best.sprint || val < best.sprint) : val > (best[mode] || 0))) { best[mode] = val; store.set('best', best); rec = true; }
  $('over-title').textContent = done ? (mode === 'sprint' ? T('sprintDone') : T('timeUp')) : 'GAME OVER';
  $('over-title').className = done ? 'clear-title' : 'over-title';
  $('over-emo').textContent = done ? '🏁' : '🧱';
  $('over-record').classList.toggle('hidden', !rec);
  const secs = timeMs / 1000;
  const rows = [[T('stScore'), score.toLocaleString()], [T('stLines'), lines], [T('stTime'), fmt(timeMs)]];
  if (mode === 'marathon') rows.splice(1, 0, [T('stLevel'), level]);
  rows.push([T('stTetris'), stats.tetris], [T('stTspin'), stats.tspins], [T('stCombo'), Math.max(0, stats.maxCombo)], ['PPS', secs > 0 ? (pieces / secs).toFixed(2) : '0']);
  rows.push([T('stBest'), bestText()]);
  $('over-stats').innerHTML = rows.map(([a, b]) => `<span>${a}</span><b>${b}</b>`).join('');
  $('screen-over').classList.remove('hidden');
}
function togglePause() {
  if (state === 'play') { prevState = state; state = 'pause'; $('screen-pause').classList.remove('hidden'); KIT.stopMusic(); }
  else if (state === 'pause') { state = 'play'; $('screen-pause').classList.add('hidden'); if (!countdown) KIT.music('block-rush'); last = performance.now(); }
}
function hideScreens() { ['screen-menu', 'screen-pause', 'screen-over'].forEach(id => $(id).classList.add('hidden')); }
function toMenu() { hideScreens(); state = 'menu'; grid = null; queue = null; hold = null; cur = null; score = 0; lines = 0; timeMs = 0; combo = -1; b2b = false; popups = []; KIT.stopMusic(); renderMenu(); $('screen-menu').classList.remove('hidden'); }
function renderMenu() {
  document.querySelectorAll('#mode-seg button').forEach(b => b.classList.toggle('on', b.dataset.m === mode));
  document.querySelectorAll('#lv-seg button').forEach(b => b.classList.toggle('on', +b.dataset.l === startLv));
  document.querySelectorAll('#feel-seg button').forEach(b => b.classList.toggle('on', +b.dataset.f === feel));
  $('lv-wrap').classList.toggle('hidden', mode !== 'marathon');
  $('mode-desc').textContent = T('modeDesc')[mode];
  $('menu-best').textContent = T('bestLbl', bestText());
}
document.querySelectorAll('#mode-seg button').forEach(b => b.onclick = () => { mode = b.dataset.m; store.set('mode', mode); renderMenu(); });
document.querySelectorAll('#lv-seg button').forEach(b => b.onclick = () => { startLv = +b.dataset.l; store.set('startLv', startLv); renderMenu(); });
document.querySelectorAll('#feel-seg button').forEach(b => b.onclick = () => { feel = +b.dataset.f; store.set('feel', feel); renderMenu(); });
$('btn-start').onclick = newGame;
$('btn-resume').onclick = togglePause;
$('btn-restart').onclick = newGame;
$('btn-quit').onclick = toMenu;
$('btn-retry').onclick = newGame;
$('btn-menu').onclick = toMenu;

if (location.hash === '#debug') window.__tt = {
  info: () => ({ state, mode, level, lines, score, combo, b2b, cur: cur && { ...cur }, hold, next: queue && queue.slice(0, 5), stats }),
  setGrid: rows => { rows.forEach((r, i) => { grid[ROWS - rows.length + i] = [...r].map(ch => ch === '#' ? 'G' : null); }); },
  setCur: (k, x, y, rot = 0) => { cur = { k, x, y, rot }; lockT = 0; },
  press, lines: n => { lines = n; },
  skipCount: () => { countdown = 0.001; }
};
const syncMute = KIT.mountMute($('btn-mute'));
KIT.boot(() => { syncMute(); renderMenu(); });
toMenu();
requestAnimationFrame(frame);
})();
