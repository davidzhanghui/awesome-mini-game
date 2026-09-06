(() => {
// Guideline 俄罗斯方块：7-Bag / SRS（含I） / T-Spin 3角规则 / Hold / Ghost / B2B / 连击
const STR = window.GAME_STR || { zh: {}, en: {} };
const T = (k, ...a) => AMG.tf(STR, k, ...a);
const COLS = 10, ROWS = 20, OX = 130, OY = 30, CELL = 29;
const W = 460, H = 640;
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const $ = id => document.getElementById(id);
const dpr = Math.min(window.devicePixelRatio || 1, 2);
canvas.width = W * dpr; canvas.height = H * dpr;
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

const store = {
  get best() { return +(localStorage.getItem('tetris-best') || 0); },
  set best(v) { localStorage.setItem('tetris-best', v); },
  get muted() { return localStorage.getItem('tetris-muted') === '1'; },
  set muted(v) { localStorage.setItem('tetris-muted', v ? '1' : '0'); }
};
let actx = null, muted = store.muted;
function tone(f, dur, type, vol, slide) {
  if (muted) return;
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type || 'square'; o.frequency.setValueAtTime(f, actx.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), actx.currentTime + dur);
    g.gain.setValueAtTime(vol || .08, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(.001, actx.currentTime + dur);
    o.connect(g); g.connect(actx.destination); o.start(); o.stop(actx.currentTime + dur);
  } catch (e) {}
}
const sfx = {
  move: () => tone(220, .04, 'square', .05),
  rot: () => tone(330, .05, 'square', .06),
  hold: () => tone(500, .07, 'sine', .07),
  lock: () => tone(180, .07, 'square', .08),
  clear: n => [523, 659, 784, 1047].slice(0, n).forEach((f, i) => setTimeout(() => tone(f, .12, 'square', .08), i * 70)),
  tspin: () => [660, 880, 1320].forEach((f, i) => setTimeout(() => tone(f, .14, 'sawtooth', .07), i * 80)),
  level: () => [523, 784].forEach((f, i) => setTimeout(() => tone(f, .12, 'square', .08), i * 90)),
  over: () => [400, 300, 200].forEach((f, i) => setTimeout(() => tone(f, .2, 'square', .09), i * 150))
};

// SRS 形状：以 4x4 包围盒定义（O 为 3x4 简化，用标准偏移）
const SHAPES = {
  I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
  O: [[1, 1], [1, 1]],
  T: [[0, 2, 0], [2, 2, 2], [0, 0, 0]],
  S: [[0, 3, 3], [3, 3, 0], [0, 0, 0]],
  Z: [[4, 4, 0], [0, 4, 4], [0, 0, 0]],
  J: [[5, 0, 0], [5, 5, 5], [0, 0, 0]],
  L: [[0, 0, 6], [6, 6, 6], [0, 0, 0]]
};
const COLORS = { 1: '#29e6ff', 2: '#ffd93d', 3: '#c86bff', 4: '#5ee66e', 5: '#ff5d5d', 6: '#3a8dde', 7: '#ff8c42' };
const IDMAP = { I: 1, O: 2, T: 3, S: 4, Z: 5, J: 6, L: 7 };
// JLSTZ 踢墙表（顺时针 0>>1, 1>>2, 2>>3, 3>>0 与逆时针）
const KICKS = {
  '01': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '10': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '12': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '21': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '23': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '32': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '30': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '03': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]]
};
const KICKS_I = {
  '01': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '10': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '12': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]],
  '21': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '23': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
  '32': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
  '30': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
  '03': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]]
};
// 重力曲线（秒/格）
const GRAVITY = [1, .9, .8, .7, .6, .5, .4, .32, .25, .2, .16, .13, .1, .08, .06, .05];

const G = {
  state: 'menu', grid: [], cur: null, bag: [], next: [],
  hold: null, canHold: true, score: 0, lines: 0, level: 1, combo: -1, b2b: false,
  dropT: 0, lockT: 0, lockResets: 0, dasT: 0, arrT: 0, dasDir: 0,
  msg: '', msgT: 0, clearFx: [], soft: false
};
function reset() {
  G.grid = Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
  G.bag = []; G.next = [];
  for (let i = 0; i < 7; i++) G.next.push(drawPiece());
  G.hold = null; G.canHold = true;
  G.score = 0; G.lines = 0; G.level = 1; G.combo = -1; G.b2b = false;
  G.dropT = 0; G.lockT = 0; G.lockResets = 0; G.dasDir = 0; G.soft = false;
  G.clearFx = [];
  spawn();
}
function drawPiece() {
  if (!G.bag.length) {
    G.bag = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
    for (let i = G.bag.length - 1; i > 0; i--) {
      const j = Math.random() * (i + 1) | 0;
      [G.bag[i], G.bag[j]] = [G.bag[j], G.bag[i]];
    }
  }
  return G.bag.pop();
}
function spawn() {
  const t = G.next.shift();
  G.next.push(drawPiece());
  G.cur = { type: t, id: IDMAP[t], rot: 0, x: 3, y: t === 'I' ? -1 : 0, lastKick: 0, rotated: false };
  if (t === 'O') { G.cur.x = 4; G.cur.y = 0; }
  G.dropT = 0; G.lockT = 0; G.lockResets = 0;
  G.canHold = true;
  if (collide(G.cur, 0, 0)) {
    // 出生即碰撞 → 终局（Block Out）
    gameOver();
  }
}
function cells(p) {
  const out = [];
  const m = SHAPES[p.type];
  for (let r = 0; r < m.length; r++) for (let c = 0; c < m[r].length; c++) {
    if (!m[r][c]) continue;
    // 旋转 rot 次（顺时针）：(r,c) -> (c, n-1-r)
    let rr = r, cc = c, n = m.length;
    for (let k = 0; k < p.rot; k++) { const t = rr; rr = cc; cc = n - 1 - t; }
    out.push([p.x + cc, p.y + rr]);
  }
  return out;
}
function collide(p, dx, dy, rotOverride) {
  const q = { type: p.type, id: p.id, rot: rotOverride !== undefined ? rotOverride : p.rot, x: p.x + dx, y: p.y + dy };
  for (const [x, y] of cells(q)) {
    if (x < 0 || x >= COLS || y >= ROWS) return true;
    if (y >= 0 && G.grid[y][x]) return true;
  }
  return false;
}
function rotate(dir) {
  const p = G.cur;
  if (!p || p.type === 'O') return;
  const from = p.rot, to = (p.rot + (dir > 0 ? 1 : 3)) % 4;
  const table = p.type === 'I' ? KICKS_I : KICKS;
  const kicks = table['' + from + to] || [[0, 0]];
  for (let i = 0; i < kicks.length; i++) {
    const [kx, ky] = kicks[i];
    if (!collide(p, kx, -ky, to)) {
      p.x += kx; p.y -= ky; p.rot = to;
      p.lastKick = i; p.rotated = true;
      if (onGround()) {
        if (G.lockResets < 15) { G.lockT = 0; G.lockResets++; }
      }
      sfx.rot();
      return;
    }
  }
}
function onGround() { return collide(G.cur, 0, 1); }
function ghostY() {
  let y = 0;
  while (!collide(G.cur, 0, y + 1)) y++;
  return y;
}
function isTspin() {
  const p = G.cur;
  if (p.type !== 'T' || !p.rotated) return { spin: false, mini: false };
  const cx = p.x + 1, cy = p.y + 1;
  const corners = [[cx - 1, cy - 1], [cx + 1, cy - 1], [cx - 1, cy + 1], [cx + 1, cy + 1]];
  const filledAt = corners.map(([x, y]) => x < 0 || x >= COLS || y >= ROWS || (y >= 0 && G.grid[y][x]));
  const filled = filledAt.filter(Boolean).length;
  if (filled < 3) return { spin: false, mini: false };
  const frontPair = [[0, 1], [1, 3], [2, 3], [0, 2]][p.rot];
  const frontOk = filledAt[frontPair[0]] && filledAt[frontPair[1]];
  const mini = p.lastKick !== 4 && !frontOk;
  return { spin: true, mini };
}
function lockPiece() {
  const p = G.cur;
  const ts = isTspin();
  for (const [x, y] of cells(p)) {
    if (y < 0) { gameOver(); return; } // Lock Out
    G.grid[y][x] = p.id;
  }
  sfx.lock();
  // 消行
  const full = [];
  for (let y = 0; y < ROWS; y++) if (G.grid[y].every(v => v)) full.push(y);
  const n = full.length;
  let gained = 0, label = '';
  if (ts.spin) {
    const miniBase = [100, 200, 400, 1600];
    const fullBase = [400, 800, 1200, 1600];
    const base = (ts.mini ? miniBase : fullBase)[Math.min(3, n)];
    gained = base * G.level * ((n > 0 && G.b2b) ? 1.5 : 1);
    const kind = ts.mini ? 'T-SPIN MINI' : 'T-SPIN';
    label = kind + (n ? ' ' + ['', 'SINGLE', 'DOUBLE', 'TRIPLE'][Math.min(3, n)] : '') + (n && G.b2b ? ' B2B' : '');
    if (n > 0) G.b2b = true;
    sfx.tspin();
  } else if (n === 4) {
    gained = 800 * G.level * (G.b2b ? 1.5 : 1);
    label = 'TETRIS!' + (G.b2b ? ' B2B' : '');
    G.b2b = true;
    sfx.clear(4);
  } else if (n > 0) {
    gained = [0, 100, 300, 500][n] * G.level;
    label = ['', 'SINGLE', 'DOUBLE', 'TRIPLE'][n];
    G.b2b = false;
    sfx.clear(n);
  }
  if (n > 0) {
    G.combo++;
    if (G.combo > 0) gained += 50 * G.combo * G.level;
    // 删除行（从大到小，避免索引漂移）
    full.sort((a, b) => b - a);
    for (const y of full) G.grid.splice(y, 1);
    for (let i = 0; i < full.length; i++) G.grid.unshift(new Array(COLS).fill(0));
    G.lines += n;
    const nl = Math.floor(G.lines / 10) + 1;
    if (nl !== G.level) { G.level = nl; sfx.level(); }
    G.clearFx.push({ rows: full, t: 0 });
    if (label) flash(label + ' +' + Math.round(gained));
  } else {
    G.combo = -1;
    if (ts.spin && label) flash(label + ' +' + Math.round(gained));
  }
  G.score += Math.round(gained);
  spawn();
}
function hardDrop() {
  const p = G.cur;
  if (!p) return;
  const d = ghostY();
  G.score += d * 2;
  p.y += d;
  lockPiece();
}
function doHold() {
  if (!G.canHold || !G.cur) return;
  sfx.hold();
  const cur = G.cur.type;
  if (!G.hold) {
    G.hold = cur;
    spawn();
  } else {
    const t = G.hold;
    G.hold = cur;
    G.cur = { type: t, id: IDMAP[t], rot: 0, x: 3, y: t === 'I' ? -1 : 0, lastKick: 0, rotated: false };
    if (t === 'O') { G.cur.x = 4; G.cur.y = 0; }
    G.dropT = 0; G.lockT = 0; G.lockResets = 0;
    if (collide(G.cur, 0, 0)) gameOver();
  }
  G.canHold = false;
}
function flash(m) { G.msg = m; G.msgT = 1.6; }
function gameOver() {
  if (G.state !== 'play') return;
  G.state = 'over';
  sfx.over();
  const isNew = G.score > store.best;
  if (isNew) store.best = G.score;
  $('final-score').textContent = G.score;
  $('final-lines').textContent = G.level + ' / ' + G.lines;
  setTimeout(() => showScreen('over'), 400);
}
function showScreen(name) {
  for (const k of ['screen-menu', 'screen-pause', 'screen-over'])
    $(k).classList.toggle('hidden', k !== 'screen-' + name);
  if (!name) for (const k of ['screen-menu', 'screen-pause', 'screen-over']) $(k).classList.add('hidden');
}
function startGame() {
  reset();
  G.state = 'play';
  showScreen(null);
  $('menu-best').textContent = T('best', Math.max(store.best, G.score));
}
function togglePause() {
  if (G.state === 'play') { G.state = 'pause'; showScreen('pause'); }
  else if (G.state === 'pause') { G.state = 'play'; showScreen(null); }
}

const keys = { left: false, right: false, down: false };
function moveStep(dir) {
  if (!G.cur || G.state !== 'play') return;
  if (!collide(G.cur, dir, 0)) {
    G.cur.x += dir;
    G.cur.rotated = false;
    if (onGround() && G.lockResets < 15) { G.lockT = 0; G.lockResets++; }
    sfx.move();
  }
}
window.addEventListener('keydown', e => {
  if (['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', 'Space'].includes(e.code)) e.preventDefault();
  if (e.repeat) {
    if (e.code === 'ArrowDown') G.soft = true;
    return;
  }
  if (e.code === 'ArrowLeft') { keys.left = true; moveStep(-1); G.dasDir = -1; G.dasT = 0; G.arrT = 0; }
  else if (e.code === 'ArrowRight') { keys.right = true; moveStep(1); G.dasDir = 1; G.dasT = 0; G.arrT = 0; }
  else if (e.code === 'ArrowDown') { keys.down = true; G.soft = true; }
  else if (e.code === 'ArrowUp' || e.code === 'KeyX') rotate(1);
  else if (e.code === 'KeyZ') rotate(-1);
  else if (e.code === 'Space') { if (G.state === 'play') hardDrop(); else if (G.state === 'menu') startGame(); }
  else if (e.code === 'KeyC' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') { if (G.state === 'play') doHold(); }
  else if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
  else if (e.code === 'KeyM') toggleMute();
  else if (e.code === 'KeyR' || e.code === 'Enter') {
    if (G.state === 'over') startGame();
    else if (G.state === 'menu') startGame();
  }
});
window.addEventListener('keyup', e => {
  if (e.code === 'ArrowLeft') { keys.left = false; if (G.dasDir === -1) G.dasDir = keys.right ? 1 : 0; }
  else if (e.code === 'ArrowRight') { keys.right = false; if (G.dasDir === 1) G.dasDir = keys.left ? -1 : 0; }
  else if (e.code === 'ArrowDown') { keys.down = false; G.soft = false; }
});
function bindTouch(id, down, up) {
  const el = $(id);
  el.addEventListener('pointerdown', e => { e.preventDefault(); down(); });
  if (up) { el.addEventListener('pointerup', up); el.addEventListener('pointerleave', up); el.addEventListener('pointercancel', up); }
}
bindTouch('t-left', () => { keys.left = true; moveStep(-1); G.dasDir = -1; G.dasT = 0; }, () => { keys.left = false; G.dasDir = 0; });
bindTouch('t-right', () => { keys.right = true; moveStep(1); G.dasDir = 1; G.dasT = 0; }, () => { keys.right = false; G.dasDir = 0; });
bindTouch('t-down', () => { G.soft = true; }, () => { G.soft = false; });
bindTouch('t-rot', () => { if (G.state === 'play') rotate(1); });
bindTouch('t-drop', () => { if (G.state === 'play') hardDrop(); });
bindTouch('t-hold', () => { if (G.state === 'play') doHold(); });

const DAS = .13, ARR = .033;
function update(dt) {
  if (G.state !== 'play' || !G.cur) return;
  // DAS/ARR
  if (G.dasDir !== 0) {
    G.dasT += dt;
    if (G.dasT >= DAS) {
      G.arrT += dt;
      while (G.arrT >= ARR) { G.arrT -= ARR; moveStep(G.dasDir); if (collide(G.cur, G.dasDir, 0)) break; }
    }
  } else { G.dasT = 0; G.arrT = 0; }
  // 重力
  const grav = (GRAVITY[Math.min(G.level, GRAVITY.length) - 1] || .04) / (G.soft ? 20 : 1);
  if (G.soft && G.cur) G.score += Math.floor(dt * 60);
  G.dropT += dt;
  let guard = 0;
  while (G.dropT >= grav && guard++ < 40) {
    G.dropT -= grav;
    if (!collide(G.cur, 0, 1)) { G.cur.y++; G.lockT = 0; }
    else break;
  }
  // 锁定延迟
  if (onGround()) {
    G.lockT += dt;
    if (G.lockT >= .5) lockPiece();
  } else G.lockT = 0;
  if (G.msgT > 0) G.msgT -= dt;
  for (let i = G.clearFx.length - 1; i >= 0; i--) {
    G.clearFx[i].t += dt;
    if (G.clearFx[i].t > .35) G.clearFx.splice(i, 1);
  }
}

// ---------- 渲染 ----------
function drawBlock(x, y, id, ghost) {
  ctx.fillStyle = ghost ? 'rgba(255,255,255,.12)' : COLORS[id];
  ctx.fillRect(x, y, CELL - 1, CELL - 1);
  if (!ghost) {
    ctx.fillStyle = 'rgba(255,255,255,.45)';
    ctx.fillRect(x, y, CELL - 1, 4);
    ctx.fillRect(x, y, 4, CELL - 1);
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.fillRect(x, y + CELL - 5, CELL - 1, 4);
    ctx.fillRect(x + CELL - 5, y, 4, CELL - 1);
  } else {
    ctx.strokeStyle = 'rgba(255,255,255,.4)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + .5, y + .5, CELL - 2, CELL - 2);
  }
}
function drawPieceAt(type, id, rot, bx, by, cell, ox, oy, ghost) {
  const m = SHAPES[type];
  for (let r = 0; r < m.length; r++) for (let c = 0; c < m[r].length; c++) {
    if (!m[r][c]) continue;
    let rr = r, cc = c, n = m.length;
    for (let k = 0; k < rot; k++) { const t = rr; rr = cc; cc = n - 1 - t; }
    const x = ox + (bx + cc) * cell, y = oy + (by + rr) * cell;
    if (ghost) {
      ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 1.5;
      ctx.strokeRect(x + .5, y + .5, cell - 2, cell - 2);
    } else {
      ctx.fillStyle = COLORS[id];
      ctx.fillRect(x, y, cell - 1, cell - 1);
      ctx.fillStyle = 'rgba(255,255,255,.45)';
      ctx.fillRect(x, y, cell - 1, 3);
    }
  }
}
function render() {
  ctx.fillStyle = '#0a0e1a'; ctx.fillRect(0, 0, W, H);
  // 场地
  ctx.fillStyle = '#11162a';
  ctx.fillRect(OX, OY, COLS * CELL, ROWS * CELL);
  ctx.strokeStyle = 'rgba(255,255,255,.15)';
  for (let x = 0; x <= COLS; x++) { ctx.beginPath(); ctx.moveTo(OX + x * CELL, OY); ctx.lineTo(OX + x * CELL, OY + ROWS * CELL); ctx.stroke(); }
  for (let y = 0; y <= ROWS; y++) { ctx.beginPath(); ctx.moveTo(OX, OY + y * CELL); ctx.lineTo(OX + COLS * CELL, OY + y * CELL); ctx.stroke(); }
  if (G.state === 'menu') return;
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++)
    if (G.grid[y][x]) drawBlock(OX + x * CELL, OY + y * CELL, G.grid[y][x]);
  if (G.cur && G.state === 'play') {
    const gy = ghostY();
    for (const [x, y] of cells({ ...G.cur, y: G.cur.y + gy })) {
      if (y >= 0) drawBlock(OX + x * CELL, OY + y * CELL, G.cur.id, true);
    }
    for (const [x, y] of cells(G.cur)) {
      if (y >= 0) drawBlock(OX + x * CELL, OY + y * CELL, G.cur.id);
    }
  }
  // 消行动画
  for (const fx of G.clearFx) {
    ctx.fillStyle = 'rgba(255,255,255,' + (1 - fx.t / .35) * .8 + ')';
    for (const y of fx.rows) ctx.fillRect(OX, OY + y * CELL, COLS * CELL, CELL);
  }
  // 侧栏
  ctx.fillStyle = '#fff'; ctx.textAlign = 'left';
  ctx.font = '900 13px system-ui';
  ctx.fillText('HOLD', 14, 26);
  ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.strokeRect(10, 34, 96, 70);
  if (G.hold) drawPieceAt(G.hold, IDMAP[G.hold], 0, 0, 0, 20, 24, 46);
  ctx.fillText('NEXT', W - 106, 26);
  ctx.strokeRect(W - 110, 34, 96, 300);
  G.next.slice(0, 5).forEach((t, i) => drawPieceAt(t, IDMAP[t], 0, 0, 0, 18, W - 96, 50 + i * 58));
  ctx.font = '900 16px system-ui';
  ctx.fillText('SCORE', 14, 150);
  ctx.font = '900 20px system-ui'; ctx.fillStyle = '#ffd93d';
  ctx.fillText(String(G.score), 14, 174);
  ctx.fillStyle = '#fff'; ctx.font = '900 16px system-ui';
  ctx.fillText('LEVEL ' + G.level, 14, 210);
  ctx.fillText('LINES ' + G.lines, 14, 234);
  if (G.combo > 0) { ctx.fillStyle = '#5ee66e'; ctx.fillText('COMBO ×' + G.combo, 14, 258); }
  if (G.b2b) { ctx.fillStyle = '#ff8c42'; ctx.fillText('B2B 🔥', 14, 282); }
  if (G.msgT > 0) {
    ctx.font = '900 26px system-ui'; ctx.textAlign = 'center';
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,.7)';
    ctx.strokeText(G.msg, OX + COLS * CELL / 2, H / 2);
    ctx.fillStyle = '#ffd93d';
    ctx.fillText(G.msg, OX + COLS * CELL / 2, H / 2);
  }
  if (G.state === 'pause') { ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = '900 30px system-ui'; ctx.fillText(T('paused'), W / 2, H / 2); }
}
let last = performance.now();
function loop(now) {
  const dt = Math.min(((now || performance.now()) - last) / 1000, .05);
  last = now || performance.now();
  update(dt);
  render();
  requestAnimationFrame(loop);
}
$('btn-start').onclick = () => { sfx.hold(); startGame(); };
$('btn-retry').onclick = () => startGame();
$('btn-menu').onclick = () => { G.state = 'menu'; showScreen('menu'); };
$('btn-resume').onclick = () => togglePause();
$('btn-quit').onclick = () => { G.state = 'menu'; showScreen('menu'); };
function toggleMute() {
  muted = !muted; store.muted = muted;
  $('btn-mute').textContent = muted ? '🔇' : '🔊';
}
$('btn-mute').onclick = toggleMute;
$('btn-mute').textContent = muted ? '🔇' : '🔊';
// i18n boot: static DOM + dynamic boot texts
AMG.apply(STR);
AMG.mountBtn();
$('btn-mute').title = T('muteTitle');
$('menu-best').textContent = T('best', store.best);
requestAnimationFrame(t => { last = t; requestAnimationFrame(loop); });
window.__game = G;
window.__gameErrors = [];
window.addEventListener('error', e => window.__gameErrors.push(String(e.message)));
G._cells = cells; G._collide = collide; G._rotate = rotate; G._spawn = spawn;
G._lock = lockPiece; G._hold = doHold; G._drop = hardDrop; G._start = startGame;
G._shapes = SHAPES; G._isTspin = isTspin;
})();
