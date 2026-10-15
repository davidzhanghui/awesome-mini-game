(() => {
'use strict';
// 宝石消除：async 状态机（交换 → 消除 → 下落 → 连锁），宝石位置逐帧逼近目标格；特殊宝石 BFS 连锁触发
const { $, T } = KIT;
const store = KIT.store('amg-match3');
const N = 8, S = 480, CS = S / N;
const cv = $('game'), ctx = KIT.canvas(cv, S, S);

const COLORS = ['#ef4b5b', '#f4c13d', '#4fbf6a', '#4f97e8', '#a56fe0', '#f08a3a'];
const DARKS = ['#a92a38', '#b88a12', '#2d8645', '#2a63ad', '#6f43a8', '#b8591a'];
const LEVELS = Array.from({ length: 15 }, (_, i) => ({
  moves: 24 - Math.floor(i / 3),
  goal: 2400 + i * 850 + (i > 9 ? (i - 9) * 600 : 0),
  colors: i < 4 ? 5 : 6
}));
const LV_EMO = ['🍬', '🍭', '🧁', '🍩', '🍪', '🍫', '🍰', '🎂', '🍮', '🍯', '🍓', '🍒', '🍑', '🥭', '👑'];
const TIMED = 90;

let grid = [], nColors = 5, nextId = 1;
let mode = 'menu', timed = false, level = 0, pick = 0;
let score = 0, movesLeft = 0, timeLeft = 0, maxChain = 0, specials = 0, bestAtStart = 0;
let busy = false, sel = null, hint = null, idle = 0, flash = [];
let texts = [];
const parts = new KIT.Particles();

// ---------------- 音效 ----------------
const sfx = {
  swap: () => KIT.tone(420, 0.08, { type: 'triangle', vol: 0.05, to: 560 }),
  back: () => KIT.tone(300, 0.12, { type: 'triangle', vol: 0.05, to: 200 }),
  match: ch => {
    const base = [523, 587, 659, 784, 880, 988, 1175][Math.min(ch - 1, 6)];
    KIT.tone(base, 0.16, { type: 'sine', vol: 0.08 });
    KIT.tone(base * 1.5, 0.12, { type: 'triangle', vol: 0.04, delay: 0.05 });
  },
  special: () => KIT.arp([784, 988, 1319], 0.05, { vol: 0.06, dur: 0.14 }),
  line: () => { KIT.tone(1200, 0.25, { type: 'sawtooth', vol: 0.03, to: 300 }); KIT.noise(0.2, { vol: 0.06, hp: 3000 }); },
  bomb: () => { KIT.noise(0.4, { vol: 0.18, lp: 1100 }); KIT.tone(120, 0.3, { vol: 0.12, to: 50 }); },
  rainbow: () => KIT.arp([523, 659, 784, 1047, 1319, 1568], 0.04, { vol: 0.06, dur: 0.18 }),
  win: () => KIT.arp([523, 659, 784, 1047, 784, 1047, 1319], 0.1, { vol: 0.08, dur: 0.24 }),
  fail: () => KIT.arp([392, 330, 262, 196], 0.15, { type: 'triangle', vol: 0.08, dur: 0.28 }),
  select: () => KIT.tone(660, 0.05, { type: 'sine', vol: 0.04 })
};

// ---------------- 棋盘 ----------------
const inB = (r, c) => r >= 0 && r < N && c >= 0 && c < N;
function gem(c, r, col, y) { return { id: nextId++, c: col, sp: null, x: c, y: y == null ? r : y, vy: 0, scale: 1, dying: 0 }; }
function randColor(r, c) {
  for (let k = 0; k < 20; k++) {
    const col = (Math.random() * nColors) | 0;
    const h = c >= 2 && grid[r][c - 1] && grid[r][c - 2] && grid[r][c - 1].c === col && grid[r][c - 2].c === col;
    const v = r >= 2 && grid[r - 1][c] && grid[r - 2][c] && grid[r - 1][c].c === col && grid[r - 2][c].c === col;
    if (!h && !v) return col;
  }
  return (Math.random() * nColors) | 0;
}
function fill() {
  do {
    grid = Array.from({ length: N }, () => Array(N).fill(null));
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) grid[r][c] = gem(c, r, randColor(r, c), r - N - 1);
  } while (!findMove());
}

// 扫描所有横/竖 ≥3 的同色段
function runs() {
  const out = [];
  for (let r = 0; r < N; r++) {
    let s = 0;
    for (let c = 1; c <= N; c++) {
      const a = grid[r][s], b = c < N ? grid[r][c] : null;
      if (b && a && a.c >= 0 && b.c === a.c) continue;
      if (a && a.c >= 0 && c - s >= 3) out.push({ dir: 'h', cells: Array.from({ length: c - s }, (_, k) => [r, s + k]) });
      s = c;
    }
  }
  for (let c = 0; c < N; c++) {
    let s = 0;
    for (let r = 1; r <= N; r++) {
      const a = grid[s][c], b = r < N ? grid[r][c] : null;
      if (b && a && a.c >= 0 && b.c === a.c) continue;
      if (a && a.c >= 0 && r - s >= 3) out.push({ dir: 'v', cells: Array.from({ length: r - s }, (_, k) => [s + k, c]) });
      s = r;
    }
  }
  return out;
}
// 共享格子的段合并成一组，用来判断 L/T 形
function groups(list) {
  const gs = [];
  for (const run of list) {
    const keys = new Set(run.cells.map(([r, c]) => r * N + c));
    const hit = gs.filter(g => g.cells.some(k => keys.has(k)));
    const merged = { runs: [run], cells: [...keys] };
    for (const g of hit) { merged.runs.push(...g.runs); merged.cells.push(...g.cells); gs.splice(gs.indexOf(g), 1); }
    merged.cells = [...new Set(merged.cells)];
    gs.push(merged);
  }
  return gs;
}

function swapCells(a, b) {
  const t = grid[a[0]][a[1]]; grid[a[0]][a[1]] = grid[b[0]][b[1]]; grid[b[0]][b[1]] = t;
}
function findMove() {
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    for (const [dr, dc] of [[0, 1], [1, 0]]) {
      const r2 = r + dr, c2 = c + dc;
      if (!inB(r2, c2)) continue;
      const a = grid[r][c], b = grid[r2][c2];
      if (!a || !b) continue;
      if (a.sp === 'rainbow' || b.sp === 'rainbow' || (a.sp && b.sp)) return [[r, c], [r2, c2]];
      swapCells([r, c], [r2, c2]);
      const ok = runs().length > 0;
      swapCells([r, c], [r2, c2]);
      if (ok) return [[r, c], [r2, c2]];
    }
  }
  return null;
}

// ---------------- 动画工具 ----------------
const wait = ms => new Promise(res => setTimeout(res, ms));
let settleWaiters = [];
function settled() {
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const g = grid[r][c];
    if (g && (Math.abs(g.x - c) > 0.001 || Math.abs(g.y - r) > 0.001)) return false;
  }
  return true;
}
const settle = () => new Promise(res => settleWaiters.push(res));

function animate(dt) {
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const g = grid[r][c];
    if (!g) continue;
    if (g.y < r) {
      g.vy = Math.min(g.vy + 55 * dt, 22);
      g.y = Math.min(r, g.y + g.vy * dt);
      if (g.y === r) { g.vy = 0; g.land = 0.12; }
    } else if (g.y > r) g.y = Math.max(r, g.y - 9 * dt);
    if (g.x !== c) g.x = g.x < c ? Math.min(c, g.x + 9 * dt) : Math.max(c, g.x - 9 * dt);
    if (g.land) g.land = Math.max(0, g.land - dt);
  }
  if (settleWaiters.length && settled()) { const w = settleWaiters; settleWaiters = []; w.forEach(f => f()); }
}

// ---------------- 核心流程 ----------------
async function trySwap(a, b) {
  if (busy || mode !== 'play') return;
  const A = grid[a[0]][a[1]], B = grid[b[0]][b[1]];
  if (!A || !B) return;
  busy = true; sel = null; hint = null; idle = 0;
  swapCells(a, b);
  sfx.swap();
  await settle();

  const combo = A.sp && B.sp || A.sp === 'rainbow' || B.sp === 'rainbow';
  if (!combo && !runs().length) {
    swapCells(a, b);
    sfx.back();
    await settle();
    busy = false;
    return;
  }
  if (!timed) movesLeft--;
  let first = null;
  if (combo) first = specialCombo(b, a, B, A);
  await resolve([a, b], first);
  busy = false;
  afterTurn();
}

// 两颗特殊宝石 / 彩虹宝石交换时的组合技，返回要清除的格子集合
function specialCombo(pa, pb, A, B) {
  const cells = new Set();
  const addRow = r => { for (let c = 0; c < N; c++) cells.add(r * N + c); };
  const addCol = c => { for (let r = 0; r < N; r++) cells.add(r * N + c); };
  const [r, c] = pa;
  const R = A.sp === 'rainbow' ? A : B, other = R === A ? B : A;
  if (A.sp === 'rainbow' && B.sp === 'rainbow') {
    for (let i = 0; i < N * N; i++) cells.add(i);
    sfx.rainbow();
  } else if (A.sp === 'rainbow' || B.sp === 'rainbow') {
    const color = other.c;
    sfx.rainbow();
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const g = grid[y][x];
      if (g && g.c === color) {
        if (other.sp && other.sp !== 'rainbow' && !g.sp) g.sp = other.sp === 'bomb' ? 'bomb' : (Math.random() < 0.5 ? 'h' : 'v');
        cells.add(y * N + x);
        beam(x, y, 'dot');
      }
    }
    cells.add(pa[0] * N + pa[1]); cells.add(pb[0] * N + pb[1]);
    R.sp = 'used';
  } else {
    const kinds = [A.sp, B.sp].sort().join('+');
    A.sp = B.sp = 'used';
    if (kinds === 'bomb+bomb') {
      for (let y = r - 2; y <= r + 2; y++) for (let x = c - 2; x <= c + 2; x++) if (inB(y, x)) cells.add(y * N + x);
      boom(c, r, 2.5);
    } else if (kinds.includes('bomb')) {
      for (let k = -1; k <= 1; k++) { if (inB(r + k, 0)) addRow(r + k); if (inB(0, c + k)) addCol(c + k); }
      beam(c, r, 'cross3');
    } else {
      addRow(r); addCol(c);
      beam(c, r, 'cross');
    }
    cells.add(pb[0] * N + pb[1]);
  }
  return cells;
}

async function resolve(swapped, firstCells) {
  let chain = 0;
  let pending = firstCells;
  for (;;) {
    let clear = new Set(), created = [];
    if (pending) { clear = pending; pending = null; }
    else {
      const gs = groups(runs());
      if (!gs.length) break;
      for (const g of gs) {
        g.cells.forEach(k => clear.add(k));
        const sp = makeSpecial(g, swapped);
        if (sp) created.push(sp);
      }
    }
    chain++;
    maxChain = Math.max(maxChain, chain);
    // 新生成的特殊宝石留在原位，不被这一轮清掉
    for (const s of created) clear.delete(s.k);
    const all = expand(clear);
    for (const s of created) all.delete(s.k);
    const pts = all.size * 10 * chain + created.length * 60;
    score += pts;
    sfx.match(chain);
    if (chain >= 2) {
      const msg = T('chain')[Math.min(chain, 6)];
      if (msg) KIT.toast($('toast'), msg);
    }
    // 消除动画
    let sx = 0, sy = 0;
    all.forEach(k => {
      const r = (k / N) | 0, c = k % N, g = grid[r][c];
      if (!g) return;
      g.dying = 0.001;
      sx += c; sy += r;
    });
    if (all.size) floatText((sx / all.size + 0.5) * CS, (sy / all.size + 0.5) * CS, '+' + pts, chain > 1 ? '#f4c13d' : '#fff');
    for (const s of created) {
      const g = grid[s.r][s.c];
      g.sp = s.sp; if (s.sp === 'rainbow') g.c = -1;
      g.born = 0.35; specials++;
      sfx.special();
    }
    await wait(230);
    all.forEach(k => {
      const r = (k / N) | 0, c = k % N, g = grid[r][c];
      if (!g) return;
      parts.burst((c + 0.5) * CS, (r + 0.5) * CS, { n: 7, color: g.c >= 0 ? [COLORS[g.c], '#fff'] : COLORS, speed: 170, size: 5, life: 0.55, gravity: 350 });
      grid[r][c] = null;
    });
    gravity();
    renderHud();
    await settle();
    swapped = null;
  }
}

// 根据组形状决定生成什么特殊宝石（落在交换点或段中央）
function makeSpecial(g, swapped) {
  const longest = Math.max(...g.runs.map(r => r.cells.length));
  const hasH = g.runs.some(r => r.dir === 'h'), hasV = g.runs.some(r => r.dir === 'v');
  let sp = null;
  if (longest >= 5) sp = 'rainbow';
  else if (hasH && hasV) sp = 'bomb';
  else if (longest === 4) sp = g.runs[0].dir === 'h' ? 'h' : 'v';
  if (!sp) return null;
  let pivot = null;
  if (swapped) for (const [r, c] of swapped) if (g.cells.includes(r * N + c)) pivot = [r, c];
  if (!pivot && sp === 'bomb') {
    const h = g.runs.find(r => r.dir === 'h'), v = g.runs.find(r => r.dir === 'v');
    const vs = new Set(v.cells.map(([r, c]) => r * N + c));
    pivot = h.cells.find(([r, c]) => vs.has(r * N + c));
  }
  if (!pivot) { const cells = g.runs[0].cells; pivot = cells[(cells.length / 2) | 0]; }
  const [r, c] = pivot;
  if (grid[r][c] && grid[r][c].sp) return null;
  return { r, c, k: r * N + c, sp };
}

// 被清除的特殊宝石继续触发自身效果（BFS 直到稳定）
function expand(cells) {
  const out = new Set(cells), q = [...cells];
  while (q.length) {
    const k = q.pop(), r = (k / N) | 0, c = k % N, g = grid[r][c];
    if (!g || !g.sp || g.sp === 'used' || g.fired) continue;
    g.fired = true;
    const add = (y, x) => { const kk = y * N + x; if (inB(y, x) && !out.has(kk)) { out.add(kk); q.push(kk); } };
    if (g.sp === 'h') { for (let x = 0; x < N; x++) add(r, x); beam(c, r, 'h'); }
    else if (g.sp === 'v') { for (let y = 0; y < N; y++) add(y, c); beam(c, r, 'v'); }
    else if (g.sp === 'bomb') { for (let y = r - 1; y <= r + 1; y++) for (let x = c - 1; x <= c + 1; x++) add(y, x); boom(c, r, 1.5); }
    else if (g.sp === 'rainbow') {
      const tally = {};
      for (const row of grid) for (const o of row) if (o && o.c >= 0) tally[o.c] = (tally[o.c] || 0) + 1;
      const color = +Object.keys(tally).sort((a, b) => tally[b] - tally[a])[0];
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (grid[y][x] && grid[y][x].c === color) { add(y, x); beam(x, y, 'dot'); }
      sfx.rainbow();
    }
  }
  return out;
}

function gravity() {
  for (let c = 0; c < N; c++) {
    let w = N - 1;
    for (let r = N - 1; r >= 0; r--) {
      if (grid[r][c]) { if (w !== r) { grid[w][c] = grid[r][c]; grid[r][c] = null; } w--; }
    }
    let k = 0;
    for (let r = w; r >= 0; r--) { grid[r][c] = gem(c, r, (Math.random() * nColors) | 0, -1 - k); k++; }
  }
}

async function shuffle(free) {
  if (busy) return;
  busy = true;
  if (!free && !timed) { movesLeft--; KIT.toast($('toast'), T('shuffleCost')); }
  const all = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) all.push(grid[r][c]);
  let tries = 0;
  do {
    for (let i = all.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [all[i], all[j]] = [all[j], all[i]]; }
    for (let i = 0; i < all.length; i++) grid[(i / N) | 0][i % N] = all[i];
    tries++;
  } while ((runs().length || !findMove()) && tries < 200);
  if (tries >= 200) fill();
  KIT.arp([440, 554, 659, 880], 0.05, { vol: 0.05 });
  await settle();
  busy = false;
  renderHud();
  afterTurn();
}

function afterTurn() {
  if (mode !== 'play') return;
  const L = LEVELS[level];
  if (!timed && score >= L.goal) { finishLevel(); return; }
  if (!timed && movesLeft <= 0) { endGame('fail'); return; }
  if (!findMove()) { KIT.toast($('toast'), T('noMoves')); setTimeout(() => shuffle(true), 600); }
  renderHud();
}

async function finishLevel() {
  mode = 'ending';
  if (movesLeft > 0) {
    KIT.toast($('toast'), T('bonus'));
    const n = movesLeft;
    for (let i = 0; i < n; i++) {
      movesLeft--; score += 150;
      const r = (Math.random() * N) | 0, c = (Math.random() * N) | 0;
      parts.burst((c + 0.5) * CS, (r + 0.5) * CS, { n: 12, color: ['#f4c13d', '#fff'], speed: 200, size: 5, life: 0.6 });
      KIT.tone(700 + i * 40, 0.06, { type: 'triangle', vol: 0.05 });
      renderHud();
      await wait(90);
    }
  }
  endGame('clear');
}

function endGame(kind) {
  mode = 'over';
  KIT.stopMusic();
  const L = LEVELS[level];
  let stars = 0;
  if (kind === 'clear') {
    sfx.win();
    stars = score >= L.goal * 2 ? 3 : score >= L.goal * 1.5 ? 2 : 1;
    const sv = store.get('stars', {});
    if (!sv[level] || sv[level] < stars) { sv[level] = stars; store.set('stars', sv); }
    const un = store.get('unlocked', 0);
    if (level + 1 > un && level + 1 < LEVELS.length) store.set('unlocked', level + 1);
    for (let k = 0; k < 5; k++) setTimeout(() => parts.burst(KIT.rand(60, S - 60), KIT.rand(60, 260), { n: 24, color: COLORS, shape: 'square', speed: 240, life: 1.2, size: 6, gravity: 300 }), k * 130);
  } else {
    if (timed) sfx.win(); else sfx.fail();
    if (timed && score > store.get('best', 0)) store.set('best', score);
  }
  setTimeout(() => showPanel(kind, stars), kind === 'clear' ? 900 : 500);
}

// ---------------- 特效 ----------------
function beam(c, r, kind) { flash.push({ c, r, kind, t: 0 }); if (kind !== 'dot') sfx.line(); }
function boom(c, r, size) { flash.push({ c, r, kind: 'boom', size, t: 0 }); sfx.bomb(); }
function floatText(x, y, s, color) { texts.push({ x, y, s, color, age: 0, life: 1 }); }

// ---------------- 绘制 ----------------
const sprites = {};
function shapePath(g, i, R) {
  g.beginPath();
  const poly = (n, rot, rx, ry) => { for (let k = 0; k < n; k++) { const a = rot + k * Math.PI * 2 / n; g.lineTo(Math.cos(a) * (rx || R), Math.sin(a) * (ry || R)); } g.closePath(); };
  if (i === 0) poly(8, Math.PI / 8);
  else if (i === 1) poly(4, -Math.PI / 2, R * 0.92, R * 1.05);
  else if (i === 2) { const s = R * 0.86, k = R * 0.32; g.moveTo(-s + k, -s); g.lineTo(s - k, -s); g.lineTo(s, -s + k); g.lineTo(s, s - k); g.lineTo(s - k, s); g.lineTo(-s + k, s); g.lineTo(-s, s - k); g.lineTo(-s, -s + k); g.closePath(); }
  else if (i === 3) g.arc(0, 0, R * 0.95, 0, Math.PI * 2);
  else if (i === 4) poly(3, -Math.PI / 2, R * 1.08, R * 1.08);
  else poly(6, 0);
}
function gemSprite(i) {
  const key = 'g' + i;
  if (sprites[key]) return sprites[key];
  const dpr = Math.min(window.devicePixelRatio || 1, 2), sz = Math.ceil(CS * dpr);
  const cvs = document.createElement('canvas'); cvs.width = cvs.height = sz;
  const g = cvs.getContext('2d'); g.scale(dpr, dpr); g.translate(CS / 2, CS / 2 + (i === 4 ? 4 : 0));
  const R = CS * 0.38;
  if (i < 0) {
    COLORS.forEach((col, k) => { g.fillStyle = col; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, R, k * Math.PI / 3, (k + 1) * Math.PI / 3); g.fill(); });
    const rg = g.createRadialGradient(-6, -8, 2, 0, 0, R);
    rg.addColorStop(0, 'rgba(255,255,255,.9)'); rg.addColorStop(0.5, 'rgba(255,255,255,.15)'); rg.addColorStop(1, 'rgba(0,0,0,.15)');
    g.fillStyle = rg; g.beginPath(); g.arc(0, 0, R, 0, 7); g.fill();
    return (sprites[key] = cvs);
  }
  g.fillStyle = 'rgba(0,0,0,.18)'; g.save(); g.translate(0, 3); shapePath(g, i, R); g.fill(); g.restore();
  const grd = g.createLinearGradient(-R, -R, R, R);
  grd.addColorStop(0, '#fff'); grd.addColorStop(0.18, COLORS[i]); grd.addColorStop(1, DARKS[i]);
  g.fillStyle = grd; shapePath(g, i, R); g.fill();
  g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1.5; g.stroke();
  // 内切面
  g.fillStyle = 'rgba(255,255,255,.22)'; shapePath(g, i, R * 0.55); g.fill();
  g.fillStyle = 'rgba(255,255,255,.8)'; g.beginPath(); g.ellipse(-R * 0.35, -R * 0.42, R * 0.22, R * 0.11, -0.6, 0, 7); g.fill();
  return (sprites[key] = cvs);
}

function pal() {
  return KIT.dark()
    ? { a: '#3b2d1f', b: '#33271a', sel: '#f0a35e', hint: '#7fd88f', frame: '#2a2016' }
    : { a: '#f6ead6', b: '#ecdcc0', sel: '#d0803a', hint: '#4f9a5a', frame: '#e2cfb0' };
}

function draw(now, dt) {
  const P = pal();
  ctx.clearRect(0, 0, S, S);
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    ctx.fillStyle = (r + c) % 2 ? P.b : P.a;
    ctx.fillRect(c * CS, r * CS, CS, CS);
  }
  // 提示
  if (hint && mode === 'play') {
    const k = 0.5 + Math.sin(now / 160) * 0.5;
    ctx.strokeStyle = P.hint; ctx.lineWidth = 3; ctx.globalAlpha = 0.4 + k * 0.6;
    for (const [r, c] of hint) { KIT.roundRect(ctx, c * CS + 4, r * CS + 4, CS - 8, CS - 8, 12); ctx.stroke(); }
    ctx.globalAlpha = 1;
  }
  if (sel) {
    ctx.fillStyle = P.sel; ctx.globalAlpha = 0.22;
    KIT.roundRect(ctx, sel[1] * CS + 3, sel[0] * CS + 3, CS - 6, CS - 6, 12); ctx.fill();
    ctx.globalAlpha = 1; ctx.strokeStyle = P.sel; ctx.lineWidth = 3; ctx.stroke();
  }

  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, S, S); ctx.clip();
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const g = grid[r][c];
    if (!g) continue;
    let sc = 1;
    if (g.dying) { g.dying += dt; sc = Math.max(0, 1 - g.dying / 0.22) * (1 + g.dying); }
    if (g.born) { g.born = Math.max(0, g.born - dt); sc *= 1 + Math.sin(g.born / 0.35 * Math.PI) * 0.35; }
    if (g.land) sc *= 1 + g.land * 0.6;
    if (sel && sel[0] === r && sel[1] === c) sc *= 1 + Math.sin(now / 120) * 0.05;
    const x = (g.x + 0.5) * CS, y = (g.y + 0.5) * CS;
    if (y < -CS) continue;
    drawGem(g, x, y, sc, now);
  }
  ctx.restore();

  // 线条 / 爆炸特效
  for (let i = flash.length - 1; i >= 0; i--) {
    const f = flash[i];
    f.t += dt;
    const k = f.t / 0.4;
    if (k >= 1) { flash.splice(i, 1); continue; }
    const x = (f.c + 0.5) * CS, y = (f.r + 0.5) * CS;
    ctx.globalAlpha = 1 - k;
    ctx.fillStyle = '#fff8e0';
    const th = CS * 0.5 * (1 - k * 0.7);
    if (f.kind === 'h' || f.kind === 'cross' || f.kind === 'cross3') ctx.fillRect(0, y - th / 2 - (f.kind === 'cross3' ? CS : 0), S, th + (f.kind === 'cross3' ? CS * 2 : 0));
    if (f.kind === 'v' || f.kind === 'cross' || f.kind === 'cross3') ctx.fillRect(x - th / 2 - (f.kind === 'cross3' ? CS : 0), 0, th + (f.kind === 'cross3' ? CS * 2 : 0), S);
    if (f.kind === 'boom') { ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 10 * (1 - k); ctx.beginPath(); ctx.arc(x, y, CS * f.size * k + 10, 0, 7); ctx.stroke(); }
    if (f.kind === 'dot') { ctx.beginPath(); ctx.arc(x, y, CS * 0.5 * (1 - k), 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;
  }

  parts.update(dt); parts.draw(ctx);
  for (let i = texts.length - 1; i >= 0; i--) {
    const t = texts[i];
    t.age += dt;
    if (t.age > t.life) { texts.splice(i, 1); continue; }
    const k = t.age / t.life;
    ctx.globalAlpha = Math.min(1, (1 - k) * 2);
    ctx.font = '400 26px "AMG Display", "PingFang SC", system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(40,28,16,.6)';
    ctx.strokeText(t.s, t.x, t.y - k * 40);
    ctx.fillStyle = t.color; ctx.fillText(t.s, t.x, t.y - k * 40);
  }
  ctx.globalAlpha = 1;
}

function drawGem(g, x, y, sc, now) {
  const spr = gemSprite(g.c);
  const s = CS * sc;
  if (g.sp === 'bomb') {
    ctx.save(); ctx.translate(x, y);
    ctx.strokeStyle = '#fff3c4'; ctx.lineWidth = 3; ctx.globalAlpha = 0.6 + Math.sin(now / 150) * 0.35;
    ctx.beginPath(); ctx.arc(0, 0, CS * 0.44 * sc, 0, 7); ctx.stroke();
    ctx.globalAlpha = 1; ctx.restore();
  }
  if (g.sp === 'rainbow') { ctx.save(); ctx.translate(x, y); ctx.rotate(now / 600); ctx.drawImage(spr, -s / 2, -s / 2, s, s); ctx.restore(); }
  else ctx.drawImage(spr, x - s / 2, y - s / 2, s, s);
  if (g.sp === 'h' || g.sp === 'v') {
    ctx.save(); ctx.translate(x, y);
    if (g.sp === 'v') ctx.rotate(Math.PI / 2);
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    for (const o of [-8, 0, 8]) ctx.fillRect(-CS * 0.3 * sc, (o - 1.5) * sc, CS * 0.6 * sc, 3 * sc);
    ctx.restore();
  }
  if (g.sp === 'bomb') {
    ctx.fillStyle = 'rgba(40,25,10,.75)';
    ctx.beginPath(); ctx.arc(x, y, CS * 0.13 * sc, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffd27a';
    ctx.beginPath(); ctx.arc(x + 4 * sc, y - 5 * sc, 2.5 * sc, 0, 7); ctx.fill();
  }
}

// ---------------- HUD / 界面 ----------------
function renderHud() {
  $('score').textContent = score;
  const L = LEVELS[level];
  $('goal-label').textContent = timed ? T('stBest') : T('goal');
  $('left-label').textContent = timed ? T('time') : T('moves');
  $('goal').textContent = timed ? Math.max(store.get('best', 0), score) : L.goal;
  $('goal-bar').style.width = (timed ? 100 : Math.min(100, score / L.goal * 100)) + '%';
  const left = timed ? Math.ceil(timeLeft) : movesLeft;
  $('left').textContent = left;
  $('left').classList.toggle('warn', mode === 'play' && (timed ? timeLeft <= 10 : movesLeft <= 3));
}
function hideScreens() { ['screen-menu', 'screen-pause', 'screen-over'].forEach(id => $(id).classList.add('hidden')); }

function start(i, isTimed) {
  timed = !!isTimed; level = i;
  nColors = timed ? 6 : LEVELS[i].colors;
  score = 0; maxChain = 0; specials = 0; idle = 0;
  movesLeft = LEVELS[i].moves; timeLeft = TIMED;
  sel = null; hint = null; flash = []; texts = []; parts.clear();
  bestAtStart = store.get('best', 0);
  fill();
  mode = 'play'; busy = false;
  hideScreens();
  renderHud();
  KIT.music('jewel-glow');
}
function showMenu() {
  mode = 'menu';
  KIT.stopMusic();
  hideScreens();
  nColors = 6; level = pick; fill();
  renderMenu();
  renderHud();
  $('screen-menu').classList.remove('hidden');
}
function renderMenu() {
  const un = store.get('unlocked', 0), sv = store.get('stars', {}), box = $('levels');
  box.innerHTML = '';
  LEVELS.forEach((_, i) => {
    const b = document.createElement('button');
    b.className = 'lvl-btn' + (i === pick ? ' active' : '') + (i > un ? ' locked' : '');
    const st = sv[i] ? '★'.repeat(sv[i]) + '☆'.repeat(3 - sv[i]) : '';
    b.innerHTML = `<span class="lv-emo">${i > un ? '🔒' : LV_EMO[i]}</span>${i + 1}<small>${st || '&nbsp;'}</small>`;
    b.onclick = () => {
      if (i > un) { KIT.tone(150, 0.1, { vol: 0.05 }); return; }
      pick = i; KIT.tone(500 + i * 25, 0.06, { type: 'triangle', vol: 0.05 });
      renderMenu();
    };
    box.appendChild(b);
  });
  $('menu-best').textContent = T('best', store.get('best', 0));
}
function showPanel(kind, stars) {
  const clear = kind === 'clear', last = clear && level === LEVELS.length - 1;
  $('over-icon').textContent = last ? '👑' : clear ? '🎉' : timed ? '⏱' : '😢';
  const t = $('over-title');
  t.textContent = last ? T('winTitle') : clear ? T('clearTitle', level + 1) : timed ? T('timeUp') : T('failTitle');
  t.className = clear || timed ? 'clear-title' : 'over-title';
  $('over-stars').innerHTML = clear ? [1, 2, 3].map(i => `<span class="${i <= stars ? '' : 'off'}" style="animation-delay:${i * 0.15}s">⭐</span>`).join('') : '';
  $('over-record').classList.toggle('hidden', !(timed && score > bestAtStart));
  const rows = [[T('stScore'), score]];
  if (timed) rows.push([T('stBest'), Math.max(score, store.get('best', 0))]);
  else rows.push([T('stGoal'), LEVELS[level].goal]);
  rows.push([T('stCombo'), maxChain], [T('stSpecial'), specials]);
  $('over-stats').innerHTML = rows.map(([a, b]) => `<span>${a}</span><b>${b}</b>`).join('');
  const btn = $('btn-retry');
  btn.textContent = clear && !last ? T('next') : clear || timed ? T('again') : T('retry');
  btn.dataset.kind = clear && !last ? 'next' : last ? 'first' : 'same';
  $('screen-over').classList.remove('hidden');
}
function pause(on) {
  if (on && mode === 'play') { mode = 'pause'; $('screen-pause').classList.remove('hidden'); KIT.stopMusic(); }
  else if (!on && mode === 'pause') { mode = 'play'; $('screen-pause').classList.add('hidden'); KIT.music('jewel-glow'); }
}

// ---------------- 主循环 ----------------
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.033, (now - last) / 1000); last = now;
  if (mode !== 'pause') {
    animate(dt);
    if (mode === 'play') {
      if (!busy) { idle += dt; if (idle > 7 && !hint) hint = findMove(); }
      if (timed) {
        timeLeft -= dt;
        if (Math.ceil(timeLeft) !== Math.ceil(timeLeft + dt)) {
          renderHud();
          if (timeLeft <= 5 && timeLeft > 0) KIT.tone(880, 0.05, { type: 'square', vol: 0.03 });
        }
        if (timeLeft <= 0 && !busy) { timeLeft = 0; renderHud(); endGame('time'); }
      }
    }
  }
  draw(now, mode === 'pause' ? 0 : dt);
  requestAnimationFrame(loop);
}

// ---------------- 输入 ----------------
let down = null;
function cellAt(e) {
  const p = KIT.point(cv, e, S, S);
  return { r: Math.floor(p.y / CS), c: Math.floor(p.x / CS), x: p.x, y: p.y };
}
cv.addEventListener('pointerdown', e => {
  if (mode !== 'play' || busy) return;
  const p = cellAt(e);
  if (!inB(p.r, p.c)) return;
  down = p;
  idle = 0;
});
cv.addEventListener('pointermove', e => {
  if (!down || busy) return;
  const p = cellAt(e);
  const dx = p.x - down.x, dy = p.y - down.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < CS * 0.35) return;
  const t = Math.abs(dx) > Math.abs(dy) ? [down.r, down.c + Math.sign(dx)] : [down.r + Math.sign(dy), down.c];
  const from = [down.r, down.c];
  down = null;
  if (inB(t[0], t[1])) trySwap(from, t);
});
window.addEventListener('pointerup', () => {
  if (!down) return;
  const p = down; down = null;
  if (sel && Math.abs(sel[0] - p.r) + Math.abs(sel[1] - p.c) === 1) { trySwap(sel, [p.r, p.c]); return; }
  if (sel && sel[0] === p.r && sel[1] === p.c) { sel = null; return; }
  sel = [p.r, p.c];
  sfx.select();
});

$('btn-start').onclick = () => start(pick, false);
$('btn-timed').onclick = () => start(0, true);
$('btn-hint').onclick = () => { if (mode === 'play' && !busy) { hint = findMove(); idle = 0; KIT.tone(880, 0.08, { vol: 0.05 }); } };
$('btn-shuffle').onclick = () => { if (mode === 'play') shuffle(false).then(() => {}); };
$('btn-pause').onclick = () => pause(mode !== 'pause');
$('btn-resume').onclick = () => pause(false);
$('btn-quit').onclick = showMenu;
$('btn-menu').onclick = showMenu;
$('btn-retry').onclick = () => {
  const k = $('btn-retry').dataset.kind;
  if (timed) start(0, true);
  else if (k === 'next') { pick = level + 1; start(level + 1, false); }
  else if (k === 'first') { pick = 0; start(0, false); }
  else start(level, false);
};
document.addEventListener('keydown', e => {
  if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
  const k = e.key;
  if (k === 'p' || k === 'P' || k === 'Escape') pause(mode !== 'pause');
  else if ((k === 'h' || k === 'H') && mode === 'play') $('btn-hint').click();
  else if (k === 'Enter' && mode === 'menu') start(pick, false);
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(true); });

const syncMute = KIT.mountMute($('btn-mute'));
KIT.boot(() => { syncMute(); renderHud(); if (mode === 'menu') renderMenu(); });
pick = Math.min(store.get('unlocked', 0), LEVELS.length - 1);
showMenu();
requestAnimationFrame(loop);
})();
