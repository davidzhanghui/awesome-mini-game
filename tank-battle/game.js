(() => {
// 坦克大战：26x26 网格（经典 13x13 大格，每大格 2x2 小格），每小格 24px
const STR = window.GAME_STR || { zh: {}, en: {} };
const T = (k, ...a) => AMG.tf(STR, k, ...a);
const stageFull = i => (T('stages') || [])[i] || STAGES[i].name;
const COLS = 26, ROWS = 26, CELL = 24, W = COLS * CELL, H = ROWS * CELL;
// 地形：0 空 1 砖 2 钢 3 水 4 草 5 冰
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const $ = id => document.getElementById(id);
function fit() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = W * dpr; canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
fit();
window.addEventListener('resize', fit);

const store = {
  get best() { return +(localStorage.getItem('tank-best') || 0); },
  set best(v) { localStorage.setItem('tank-best', v); },
  get custom() { try { return JSON.parse(localStorage.getItem('tank-custom') || 'null'); } catch (e) { return null; } },
  set custom(v) { localStorage.setItem('tank-custom', JSON.stringify(v)); },
  get muted() { return localStorage.getItem('tank-muted') === '1'; },
  set muted(v) { localStorage.setItem('tank-muted', v ? '1' : '0'); }
};
let actx = null, muted = store.muted;
function ac() {
  if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
  if (actx.state === 'suspended') actx.resume();
  return actx;
}
function tone(f, dur, type, vol, slide) {
  if (muted) return;
  try {
    const a = ac(), o = a.createOscillator(), g = a.createGain();
    o.type = type || 'square'; o.frequency.setValueAtTime(f, a.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), a.currentTime + dur);
    g.gain.setValueAtTime(vol || .1, a.currentTime);
    g.gain.exponentialRampToValueAtTime(.001, a.currentTime + dur);
    o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + dur);
  } catch (e) {}
}
function noise(dur, vol) {
  if (muted) return;
  try {
    const a = ac(), n = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = a.createBufferSource(), g = a.createGain();
    s.buffer = buf; g.gain.value = vol || .2;
    s.connect(g); g.connect(a.destination); s.start();
  } catch (e) {}
}
const sfx = {
  shoot: () => tone(220, .1, 'square', .09, 180),
  boom: () => noise(.35, .3),
  hit: () => noise(.15, .2),
  item: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, .12, 'square', .09), i * 70)),
  spawn: () => tone(440, .12, 'sine', .07, 220),
  click: () => tone(700, .07, 'sine', .1),
  power: () => tone(300, .3, 'sawtooth', .08, 500),
  gameover: () => [400, 300, 200, 120].forEach((f, i) => setTimeout(() => tone(f, .25, 'sawtooth', .1), i * 180))
};

// ---------- 关卡 ----------
const EAGLE = { c: 12, r: 24 }; // 老鹰左上角（占 2x2）
function emptyGrid() { return Array.from({ length: ROWS }, () => new Array(COLS).fill(0)); }
function rect(g, c0, r0, c1, r1, t) {
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (c >= 0 && r >= 0 && c < COLS && r < ROWS) g[r][c] = t;
}
// 老鹰周边砖墙（+ 老鹰本体 9）
function homeWall(g, t) {
  t = t === undefined ? 1 : t;
  rect(g, 11, 23, 11, 25, t); rect(g, 14, 23, 14, 25, t); rect(g, 12, 23, 13, 23, t);
  rect(g, 12, 24, 13, 25, 9);
  // 出生通道保护：老家墙外侧一格不画墙（P1 左路 8-10 列、P2 右路 15-17 列）
  rect(g, 8, 24, 10, 25, 0);
  rect(g, 15, 24, 17, 25, 0);
}
// P1/P2 出生位及老家墙周边清空，保证出生点左右畅通
function clearSpawnArea(g) {
  rect(g, 6, 24, 10, 25, 0);
  rect(g, 18, 24, 20, 25, 0);
  rect(g, 8, 22, 9, 23, 0);
  rect(g, 16, 22, 17, 23, 0);
  // 老鹰左墙(11,24-25)右移到 18 列，保证 P1 出生位右侧两列全空
  rect(g, 11, 24, 11, 25, 0);
  rect(g, 18, 24, 18, 25, 1);
  // P2 出生位(16列)左右清空
  rect(g, 14, 24, 14, 25, 0);
}
const STAGES = [
  { name: '第 1 关 · 初露锋芒', foes: 12,
    map(g) { homeWall(g); rect(g, 2, 4, 5, 9, 1); rect(g, 8, 4, 11, 9, 1); rect(g, 14, 4, 17, 9, 1); rect(g, 20, 4, 23, 9, 1); rect(g, 6, 12, 9, 15, 2); rect(g, 16, 12, 19, 15, 1); rect(g, 2, 18, 7, 20, 1); rect(g, 18, 18, 23, 20, 1); rect(g, 11, 14, 14, 16, 4); rect(g, 11, 20, 14, 21, 1); } },
  { name: '第 2 关 · 钢铁长城', foes: 14,
    map(g) { homeWall(g); rect(g, 0, 6, 25, 6, 2); rect(g, 4, 9, 9, 14, 1); rect(g, 16, 9, 21, 14, 1); rect(g, 11, 10, 14, 12, 3); rect(g, 2, 17, 8, 19, 1); rect(g, 17, 17, 23, 19, 1); rect(g, 11, 17, 14, 19, 2); rect(g, 5, 21, 8, 21, 5); rect(g, 17, 21, 20, 21, 5); } },
  { name: '第 3 关 · 河流草原', foes: 16,
    map(g) { homeWall(g); rect(g, 0, 8, 25, 10, 3); rect(g, 12, 0, 13, 7, 1); rect(g, 5, 12, 10, 16, 4); rect(g, 15, 12, 20, 16, 4); rect(g, 3, 13, 3, 19, 1); rect(g, 22, 13, 22, 19, 1); rect(g, 7, 18, 18, 20, 1); rect(g, 11, 14, 14, 16, 2); rect(g, 0, 21, 5, 23, 5); rect(g, 20, 21, 25, 23, 5); } },
  { name: '第 4 关 · 冰火两重', foes: 18,
    map(g) { homeWall(g); rect(g, 2, 3, 23, 5, 5); rect(g, 2, 7, 6, 12, 1); rect(g, 10, 7, 15, 12, 2); rect(g, 19, 7, 23, 12, 1); rect(g, 0, 13, 25, 14, 3); rect(g, 4, 16, 9, 20, 4); rect(g, 16, 16, 21, 20, 1); rect(g, 11, 17, 14, 19, 5); rect(g, 12, 20, 13, 22, 1); } },
  { name: '第 5 关 · 最终决战', foes: 20,
    map(g) { homeWall(g, 2); rect(g, 0, 4, 25, 4, 2); rect(g, 3, 7, 8, 12, 1); rect(g, 9, 7, 16, 12, 2); rect(g, 17, 7, 22, 12, 1); rect(g, 5, 14, 20, 15, 3); rect(g, 2, 17, 7, 21, 4); rect(g, 18, 17, 23, 21, 4); rect(g, 10, 18, 15, 20, 1); rect(g, 11, 21, 14, 22, 2); } }
];

// 敌方类型：basic / fast / power / armor
const FOE_TYPES = {
  basic: { hp: 1, speed: 62, bspeed: 260, score: 100, color: '#cfcfcf' },
  fast: { hp: 1, speed: 118, bspeed: 260, score: 200, color: '#e8e8e8' },
  power: { hp: 1, speed: 78, bspeed: 420, score: 300, color: '#ffd93d' },
  armor: { hp: 3, speed: 58, bspeed: 300, score: 400, color: '#5ee66e' }
};
const ITEM_KINDS = ['star', 'helmet', 'clock', 'shovel', 'grenade', 'life'];

const G = {
  state: 'menu', mode: '1p', stageIdx: 0, score: 0, t: 0,
  grid: emptyGrid(), players: [], foes: [], bullets: [], items: [],
  spawnQueue: [], spawnT: 0, freezeT: 0, shovelT: 0, shake: 0,
  eagleAlive: true, overReason: '', customStage: false,
  editor: null, floats: [], parts: []
};
G.grid = emptyGrid();

function loadStage(idx, custom) {
  G.stageIdx = idx; G.customStage = !!custom;
  G.grid = emptyGrid();
  if (custom) {
    const c = store.custom;
    for (let r = 0; r < ROWS; r++) for (let cI = 0; cI < COLS; cI++) G.grid[r][cI] = c.grid[r][cI];
  } else STAGES[idx].map(G.grid);
  clearSpawnArea(G.grid);
  G.foes = []; G.bullets = []; G.items = []; G.floats = []; G.parts = [];
  G.freezeT = 0; G.shovelT = 0; G.shake = 0; G.eagleAlive = true;
  const total = custom ? 14 : STAGES[idx].foes;
  // 出怪序列：越往后越强，每 4 辆必出一辆闪烁道具车
  const seq = [];
  const diff = custom ? .5 : idx / (STAGES.length - 1);
  for (let i = 0; i < total; i++) {
    const r = Math.random();
    let t = 'basic';
    if (i > 2 && r < .12 + diff * .22) t = 'armor';
    else if (r < .3 + diff * .2) t = 'power';
    else if (r < .52 + diff * .2) t = 'fast';
    seq.push({ type: t, bonus: i % 4 === 3 });
  }
  G.spawnQueue = seq;
  G.spawnT = 1; G.spawned = 0; G.stageT = 0;
  // 玩家出生
  G.players = [];
  const mk = (x, side) => ({
    side, x: x * CELL + 2, y: 24 * CELL + 2, w: CELL * 2 - 4, h: CELL * 2 - 4,
    dir: 0, speed: 128, alive: true, lives: 3, stars: 0, invuln: 2,
    cd: 0, maxBullets: 1, ai: null, slide: 0, spawnT: 0, flash: 0
  });
  if (G.mode === '2p') { G.players = [mk(6, 'p1'), mk(16, 'p2')]; }
  else G.players = [mk(8, 'p1')];
  G.players.forEach(p => {
    p.lives = 3;
    // P1 出生点右侧保持两列空（避开老家左墙）
    if (p.side === 'p1' && p.x + p.w + 2 > 11 * CELL) p.x = 9 * CELL + 2;
  });
  updateHUD();
}

// ---------- 碰撞 ----------
function tankCells(t) {
  const out = [];
  const eps = .5;
  const c0 = Math.floor((t.x + eps) / CELL), r0 = Math.floor((t.y + eps) / CELL);
  const c1 = Math.floor((t.x + t.w - 1 - eps) / CELL), r1 = Math.floor((t.y + t.h - 1 - eps) / CELL);
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) out.push([c, r]);
  return out;
}
function blocksTank(c, r, isFoe) {
  if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return true;
  const t = G.grid[r][c];
  if (t === 1 || t === 2 || t === 3) return true;
  if (t === 9 || t === 10) return true; // 老鹰（活/毁）都挡路
  return false;
}
function tankHitTank(t, list) {
  for (const o of list) {
    if (o === t || !o.alive) continue;
    // 出生旋转门中的敌军不参与碰撞
    if (o.spawnT > 0 || t.spawnT > 0) continue;
    // AABB 缩进 2px，避免贴边误判卡死
    if (t.x + 2 < o.x + o.w - 2 && t.x + t.w - 2 > o.x + 2 && t.y + 2 < o.y + o.h - 2 && t.y + t.h - 2 > o.y + 2) return true;
  }
  return false;
}
function moveTank(t, dt, allTanks) {
  const step = t.speed * dt;
  let nx = t.x, ny = t.y;
  if (t.dir === 0) ny -= step;
  else if (t.dir === 1) nx += step;
  else if (t.dir === 2) ny += step;
  else nx -= step;
  nx = Math.max(0, Math.min(W - t.w, nx));
  ny = Math.max(0, Math.min(H - t.h, ny));
  const old = { x: t.x, y: t.y };
  t.x = nx; t.y = ny;
  for (const [c, r] of tankCells(t)) {
    if (blocksTank(c, r)) { t.x = old.x; t.y = old.y; return false; }
  }
  if (tankHitTank(t, allTanks)) { t.x = old.x; t.y = old.y; return false; }
  return true;
}
// 子弹打砖：按行列啃
function bulletHitWall(b) {
  const c0 = Math.max(0, Math.floor(b.x / CELL)), r0 = Math.max(0, Math.floor(b.y / CELL));
  const c1 = Math.min(COLS - 1, Math.floor((b.x + b.w) / CELL)), r1 = Math.min(ROWS - 1, Math.floor((b.y + b.h) / CELL));
  let hitSteel = false, broke = false;
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    const t = G.grid[r][c];
    if (t === 1) { G.grid[r][c] = 0; broke = true; }
    else if (t === 2) { if (b.power >= 2) { G.grid[r][c] = 0; broke = true; } else hitSteel = true; }
    else if (t === 9) {
      G.grid[r][c] = 10; broke = true; eagleDown();
    }
  }
  if (broke) { sfx.hit(); addParts(b.x, b.y, '#c98a2e', 6); }
  else if (hitSteel) sfx.hit();
  return broke || hitSteel;
}
function eagleDown() {
  if (!G.eagleAlive) return;
  G.eagleAlive = false;
  G.shake = 14;
  sfx.gameover();
  gameOver(T('eagleDown'));
}
function addParts(x, y, c, n) {
  for (let i = 0; i < (n || 8); i++) G.parts.push({ x, y, vx: (Math.random() - .5) * 260, vy: (Math.random() - .5) * 260, life: .5, age: 0, r: 3, c });
}
function addFloat(x, y, text) { G.floats.push({ x, y, text, age: 0 }); }
function addScore(n, x, y) {
  G.score += n;
  if (x !== undefined) addFloat(x, y, '+' + n);
  if (G.score > store.best) store.best = G.score;
}

// ---------- 开火 ----------
function fire(t) {
  if (!t.alive || t.cd > 0 || G.state !== 'play') return;
  const mine = G.bullets.filter(b => b.owner === t).length;
  if (mine >= t.maxBullets) return;
  t.cd = t.side[0] === 'p' ? .22 : .5 + Math.random() * .5;
  const s = 6;
  let x = t.x + t.w / 2 - s / 2, y = t.y + t.h / 2 - s / 2;
  if (t.dir === 0) y = t.y - s - 1;
  else if (t.dir === 1) x = t.x + t.w + 1;
  else if (t.dir === 2) y = t.y + t.h + 1;
  else x = t.x - s - 1;
  // 出生点安全检查：子弹落点若在己方坦克体内则不出膛（防自杀式开火打老鹰）
  if (t.side[0] === 'p') {
    for (const p of G.players) {
      if (!p.alive) continue;
      if (x < p.x + p.w - 4 && x + s > p.x + 4 && y < p.y + p.h - 4 && y + s > p.y + 4) return;
    }
  }
  const sp = t.bulletSpeed || 380;
  const vx = t.dir === 1 ? sp : t.dir === 3 ? -sp : 0;
  const vy = t.dir === 2 ? sp : t.dir === 0 ? -sp : 0;
  G.bullets.push({ x, y, w: s, h: s, vx, vy, owner: t, power: t.stars >= 2 ? 2 : 1, foe: t.side === 'foe' });
  if (t.side[0] === 'p') sfx.shoot();
}
function hurtPlayer(p) {
  if (!p.alive || p.invuln > 0 || G.state !== 'play') return;
  p.lives--;
  addParts(p.x + p.w / 2, p.y + p.h / 2, '#ff5d5d', 16);
  sfx.boom();
  if (p.lives <= 0) {
    p.alive = false;
    if (G.players.every(q => !q.alive)) gameOver(T('allLost'));
  } else {
    // 原地重生
    p.x = (p.side === 'p2' ? 16 : p.side === 'p1' && G.mode === '2p' ? 6 : 8) * CELL + 2; p.y = 24 * CELL + 2;
    p.dir = 0; p.invuln = 3; p.stars = 0; p.maxBullets = 1;
  }
  updateHUD();
}
function hurtFoe(f, power) {
  f.hp -= power;
  f.flash = .12;
  if (f.hp <= 0) {
    f.alive = false;
    const info = FOE_TYPES[f.type];
    addScore(info.score, f.x, f.y - 8);
    addParts(f.x + f.w / 2, f.y + f.h / 2, '#ff8c42', 14);
    sfx.boom();
    if (f.bonus) spawnItem(f.x + f.w / 2, f.y + f.h / 2);
  } else sfx.hit();
}
function spawnItem(x, y) {
  const kind = ITEM_KINDS[Math.random() * ITEM_KINDS.length | 0];
  G.items.push({ kind, x: Math.max(10, Math.min(W - 34, x - 12)), y: Math.max(10, Math.min(H - 34, y - 12)), w: 24, h: 24, age: 0 });
  sfx.spawn();
}
function applyItem(p, kind) {
  sfx.item();
  addFloat(p.x + p.w / 2, p.y - 6, (T('itemFloat') || {})[kind] || kind);
  if (kind === 'star') {
    p.stars = Math.min(3, p.stars + 1);
    if (p.stars >= 1) p.maxBullets = 2;
    if (p.stars >= 3) p.speed = 150;
    sfx.power();
  }
  else if (kind === 'helmet') p.invuln = 8;
  else if (kind === 'clock') G.freezeT = 7;
  else if (kind === 'shovel') {
    G.shovelT = 20;
    homeWall(G.grid, 2);
  }
  else if (kind === 'grenade') {
    for (const f of G.foes) if (f.alive) hurtFoe(f, 99);
  }
  else if (kind === 'life') { p.lives++; updateHUD(); }
}

// ---------- 敌军 AI ----------
function spawnFoe() {
  if (!G.spawnQueue.length) return;
  if (G.foes.filter(f => f.alive).length >= 4) return;
  const { type, bonus } = G.spawnQueue.shift();
  G.spawned = (G.spawned || 0) + 1;
  const info = FOE_TYPES[type];
  // 出生点：左/中/右轮换，避免扎堆；选无己方坦克挡路的位置
  if (G.spawnCursor === undefined) G.spawnCursor = 0;
  const spots = [0, 12, 24];
  let sx = null;
  for (let k = 0; k < 3; k++) {
    const s = spots[(G.spawnCursor + k) % 3];
    const x = s * CELL;
    let blocked = false;
    for (const t of [...G.players, ...G.foes]) {
      if (!t.alive) continue;
      if (x < t.x + t.w + 12 && x + CELL * 2 > t.x - 12 && 0 < t.y + t.h + 12 && CELL * 2 > t.y - 12) { blocked = true; break; }
    }
    if (!blocked) { sx = x; G.spawnCursor = (G.spawnCursor + k + 1) % 3; break; }
  }
  if (sx === null) {
    // 三个出生点都被堵：把怪塞回队列稍后重试
    G.spawnQueue.unshift({ type, bonus });
    G.spawned--;
    return;
  }
  G.foes.push({
    side: 'foe', type, bonus, x: sx + 2, y: 2, w: CELL * 2 - 4, h: CELL * 2 - 4,
    dir: 2, speed: info.speed, bulletSpeed: info.bspeed, hp: info.hp, maxHp: info.hp,
    alive: true, cd: 1 + Math.random(), aiT: 0, invuln: 0, stars: 0, maxBullets: 1,
    spawnT: .8, flash: 0
  });
  sfx.spawn();
}
function foeAI(f, dt) {
  f.aiT -= dt;
  if (f.aiT <= 0) {
    f.aiT = .5 + Math.random() * 1.2;
    const r = Math.random();
    // 目标：在老鹰和玩家之间二选一（各 25% 概率追玩家，增加对抗性）
    let tx = EAGLE.c * CELL, ty = EAGLE.r * CELL;
    const alive = G.players.filter(p => p.alive);
    if (alive.length && r < .3) {
      const p = alive[Math.random() * alive.length | 0];
      tx = p.x; ty = p.y;
    }
    let want = null;
    if (r < .5) want = Math.abs(tx - f.x) > Math.abs(ty - f.y) ? (tx > f.x ? 1 : 3) : (ty > f.y ? 2 : 0);
    else want = Math.random() * 4 | 0;
    f.dir = want;
  }
  // 开火：前方是砖/钢/老鹰/玩家时才打，不浪费子弹；每关开局 5 秒敌军不开火（保护期）
  if (G.stageT > 5) {
    if (looksShootable(f) && f.cd <= 0) fire(f);
    else if (Math.random() < dt * .25 && f.cd <= 0) fire(f);
  }
}
// 前方两格内有可击目标（砖/钢/老鹰/玩家）则值得开火
function looksShootable(f) {
  const cx = f.x + f.w / 2, cy = f.y + f.h / 2;
  for (let s = 1; s <= 3; s++) {
    const d = s * CELL;
    const x = f.dir === 1 ? cx + d : f.dir === 3 ? cx - d : cx;
    const y = f.dir === 2 ? cy + d : f.dir === 0 ? cy - d : cy;
    if (x < 0 || y < 0 || x >= W || y >= H) return false;
    const t = G.grid[Math.floor(y / CELL)][Math.floor(x / CELL)];
    if (t === 1 || t === 2 || t === 9 || t === 10) return true;
    for (const p of G.players) {
      if (!p.alive) continue;
      if (x > p.x && x < p.x + p.w && y > p.y && y < p.y + p.h) return true;
    }
  }
  return false;
}

// ---------- 主循环 ----------
const keys = {};
const KEYMAP = {
  KeyW: ['p1', 'up'], KeyA: ['p1', 'left'], KeyS: ['p1', 'down'], KeyD: ['p1', 'right'],
  ArrowUp: ['p2', 'up'], ArrowLeft: ['p2', 'left'], ArrowDown: ['p2', 'down'], ArrowRight: ['p2', 'right']
};
window.addEventListener('keydown', e => {
  if (['Space', 'Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  keys[e.code] = true;
  if (e.repeat) return;
  if (e.code === 'Space') { const p = G.players[0]; if (p) tryFireKey(p); }
  if (e.code === 'Enter') { const p = G.players[1]; if (p) tryFireKey(p); }
  if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
  if (e.code === 'KeyM') toggleMute();
  if (e.code === 'KeyR') { if (G.state === 'over' || G.state === 'clear') retry(); else if (G.state === 'play') retry(); }
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
function tryFireKey(p) { if (G.state === 'play') fire(p); }
function pressDir(p, side) {
  if (side === 'p1') {
    if (keys.KeyW) return 0;
    if (keys.KeyD) return 1;
    if (keys.KeyS) return 2;
    if (keys.KeyA) return 3;
  } else {
    if (keys.ArrowUp) return 0;
    if (keys.ArrowRight) return 1;
    if (keys.ArrowDown) return 2;
    if (keys.ArrowLeft) return 3;
  }
  return null;
}
function update(dt) {
  G.t += dt;
  if (G.state === 'play') G.stageT += dt;
  if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 30);
  for (let i = G.parts.length - 1; i >= 0; i--) {
    const p = G.parts[i];
    p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.age > p.life) G.parts.splice(i, 1);
  }
  for (let i = G.floats.length - 1; i >= 0; i--) {
    const f = G.floats[i];
    f.age += dt; f.y -= 40 * dt;
    if (f.age > 1.2) G.floats.splice(i, 1);
  }
  if (G.state !== 'play') return;
  if (G.freezeT > 0) G.freezeT -= dt;
  if (G.shovelT > 0) {
    G.shovelT -= dt;
    if (G.shovelT <= 0) homeWall(G.grid, 1);
  }
  // 出怪
  if (G.spawnQueue.length) {
    G.spawnT -= dt;
    if (G.spawnT <= 0) { G.spawnT = 2.2; spawnFoe(); }
  }
  const all = [...G.players.filter(p => p.alive), ...G.foes.filter(f => f.alive)];
  // 玩家
  G.players.forEach((p, pi) => {
    if (!p.alive) return;
    if (p.cd > 0) p.cd -= dt;
    if (p.invuln > 0) p.invuln -= dt;
    if (p.spawnT > 0) { p.spawnT -= dt; return; }
    const d = pressDir(p, p.side);
    // 冰面打滑
    let onIce = false;
    for (const [c, r] of tankCells(p)) if (G.grid[r] && G.grid[r][c] === 5) onIce = true;
    if (d !== null) {
      p.dir = d; p.slide = 0;
      moveTank(p, dt * (onIce ? 1.25 : 1), all);
    } else if (onIce && p.slide > 0) {
      moveTank(p, dt * .6, all);
      p.slide -= dt;
    } else p.slide = onIce ? .4 : 0;
    // 拾道具
    for (let i = G.items.length - 1; i >= 0; i--) {
      const it = G.items[i];
      if (p.x < it.x + it.w && p.x + p.w > it.x && p.y < it.y + it.h && p.y + p.h > it.y) {
        G.items.splice(i, 1);
        applyItem(p, it.kind);
      }
    }
  });
  // 敌军
  for (const f of G.foes) {
    if (!f.alive) continue;
    if (f.spawnT > 0) { f.spawnT -= dt; continue; }
    if (f.cd > 0) f.cd -= dt;
    if (f.flash > 0) f.flash -= dt;
    if (G.freezeT <= 0) {
      foeAI(f, dt);
      moveTank(f, dt, all);
    }
  }
  // 子弹
  for (let i = G.bullets.length - 1; i >= 0; i--) {
    const b = G.bullets[i];
    b.x += b.vx * dt; b.y += b.vy * dt;
    let dead = false;
    if (b.x < -8 || b.y < -8 || b.x > W + 8 || b.y > H + 8) dead = true;
    if (!dead && bulletHitWall(b)) dead = true;
    if (!dead) {
      // 子弹互撞
      for (let j = G.bullets.length - 1; j >= 0; j--) {
        const o = G.bullets[j];
        if (o === b || o.foe === b.foe) continue;
        if (b.x < o.x + o.w && b.x + b.w > o.x && b.y < o.y + o.h && b.y + b.h > o.y) {
          o.dead = true; dead = true;
          addParts(b.x, b.y, '#fff', 4);
          break;
        }
      }
    }
    if (!dead) {
      if (b.foe) {
        for (const p of G.players) {
          if (!p.alive) continue;
          if (b.x < p.x + p.w && b.x + b.w > p.x && b.y < p.y + p.h && b.y + p.h > p.y) {
            dead = true;
            hurtPlayer(p);
            break;
          }
        }
      } else {
        for (const f of G.foes) {
          if (!f.alive || f.spawnT > 0) continue;
          if (b.x < f.x + f.w && b.x + b.w > f.x && b.y < f.y + f.h && b.y + b.h > f.y) {
            dead = true;
            hurtFoe(f, b.power);
            break;
          }
        }
      }
    }
    if (dead || b.dead) G.bullets.splice(i, 1);
  }
  // 胜利：出怪完毕 + 敌军全灭（且至少出过怪，避免测试清怪误触）
  if (!G.spawnQueue.length && G.spawned > 0 && G.foes.every(f => !f.alive)) levelClear();
  G.foes = G.foes.filter(f => f.alive || (f.deadT = (f.deadT || 0) + dt) < .1);
  updateHUD();
}
function updateHUD() {
  $('hud-stage').textContent = G.customStage ? T('customMap') : T('stageShort', G.stageIdx + 1);
  const left = G.spawnQueue.length + G.foes.filter(f => f.alive).length;
  $('hud-foes').textContent = T('foesLeft', left);
  $('hud-score').textContent = String(G.score).padStart(6, '0');
  $('hud-lives').textContent = G.players.map(p => (p.side === 'p1' ? 'P1' : 'P2') + ' ❤' + Math.max(0, p.lives)).join(' ');
}

// ---------- 流程 ----------
function setScreen(n) {
  for (const id of ['screen-menu', 'screen-pause', 'screen-clear', 'screen-over', 'screen-win'])
    $(id).classList.toggle('hidden', id !== n);
  if (!n) for (const id of ['screen-menu', 'screen-pause', 'screen-clear', 'screen-over', 'screen-win']) $(id).classList.add('hidden');
  $('btn-pause') && $('btn-pause').classList.toggle('hidden', G.state !== 'play');
}
function showMenu() {
  G.state = 'menu';
  setScreen('screen-menu');
  const sel = $('sel-stage');
  sel.innerHTML = STAGES.map((s, i) => '<option value="' + i + '">' + stageFull(i) + '</option>').join('');
  sel.value = G.stageIdx;
  $('custom-note').classList.toggle('hidden', !store.custom);
  $('menu-best').textContent = store.best;
}
function startGame(mode, stageIdx, custom) {
  G.mode = mode; G.score = 0;
  loadStage(stageIdx || 0, custom);
  G.state = 'play';
  setScreen(null);
  $('hud').classList.remove('hidden');
  sfx.click();
}
function retry() {
  const idx = G.stageIdx, c = G.customStage;
  G.score = 0;
  loadStage(idx, c);
  G.state = 'play';
  setScreen(null);
  $('hud').classList.remove('hidden');
}
function levelClear() {
  G.state = 'clear';
  const bonus = 500 * (G.customStage ? 1 : G.stageIdx + 1);
  G.score += bonus;
  if (G.score > store.best) store.best = G.score;
  $('clear-stats').innerHTML = '<div>' + T('clearStage', G.customStage ? T('customMap') : stageFull(G.stageIdx)) + '</div>' +
    '<div>' + T('clearBonus', bonus) + '</div>' +
    '<div>' + T('clearScore', G.score) + '</div>';
  if (!G.customStage && G.stageIdx < STAGES.length - 1) {
    $('btn-next').textContent = T('nextStage', stageFull(G.stageIdx + 1));
    $('btn-next').classList.remove('hidden');
  } else $('btn-next').classList.add('hidden');
  setTimeout(() => setScreen('screen-clear'), 500);
}
function gameOver(reason) {
  if (G.state !== 'play') return;
  G.state = 'over';
  G.overReason = reason;
  $('over-sub').textContent = T('overSub', reason, G.score);
  if (!G.customStage && G.stageIdx >= STAGES.length - 1 && false) { /* never win via over */ }
  setTimeout(() => setScreen('screen-over'), 800);
}
function winAll() {
  G.state = 'win';
  $('win-score').textContent = G.score;
  $('win-best').textContent = store.best;
  setTimeout(() => setScreen('screen-win'), 500);
}
function togglePause() {
  if (G.state === 'play') { G.state = 'pause'; setScreen('screen-pause'); }
  else if (G.state === 'pause') { G.state = 'play'; setScreen(null); }
}
function toggleMute() {
  muted = !muted; store.muted = muted;
  $('btn-mute').textContent = muted ? '🔇' : '🔊';
}

// ---------- 编辑器 ----------
function openEditor() {
  G.state = 'editor';
  setScreen(null);
  $('hud').classList.add('hidden');
  $('editor-bar').classList.remove('hidden');
  G.editor = { grid: emptyGrid(), brush: 1 };
  homeWall(G.editor.grid);
  clearSpawnArea(G.editor.grid);
  // 老鹰本体
  G.editor.grid[24][12] = 9; G.editor.grid[24][13] = 9;
  G.editor.grid[25][12] = 9; G.editor.grid[25][13] = 9;
  document.querySelectorAll('#palette [data-t]').forEach(b => b.onclick = () => {
    document.querySelectorAll('#palette [data-t]').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    G.editor.brush = +b.dataset.t;
  });
}
function closeEditor() {
  G.state = 'menu';
  $('editor-bar').classList.add('hidden');
  showMenu();
}
$('btn-editor').onclick = () => { sfx.click(); openEditor(); };
$('ed-back').onclick = closeEditor;
$('ed-clear').onclick = () => { G.editor.grid = emptyGrid(); homeWall(G.editor.grid); };
$('ed-save').onclick = () => {
  store.custom = { grid: G.editor.grid, time: Date.now() };
  sfx.item();
  $('custom-note').classList.remove('hidden');
  closeEditor();
};
$('ed-test').onclick = () => {
  store.custom = { grid: G.editor.grid, time: Date.now() };
  $('editor-bar').classList.add('hidden');
  startGame(G.mode === '2p' ? '2p' : '1p', 0, true);
};
canvas.addEventListener('pointerdown', e => {
  if (G.state === 'editor') {
    paintAt(e, false);
    const mv = ev => paintAt(ev, true);
    const up = () => {
      canvas.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
    };
    canvas.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
    return;
  }
  if (G.state === 'pause') togglePause();
});
function paintAt(e, drag) {
  const r = canvas.getBoundingClientRect();
  const c = Math.floor((e.clientX - r.left) / r.width * COLS);
  const rr = Math.floor((e.clientY - r.top) / r.height * ROWS);
  if (c < 0 || rr < 0 || c >= COLS || rr >= ROWS) return;
  // 老鹰区不可画
  if (c >= 12 && c <= 13 && rr >= 24 && rr <= 25) return;
  // 出生点区不可画
  if (rr >= 24 && ((c >= 7 && c <= 10) || (c >= 15 && c <= 18))) return;
  G.editor.grid[rr][c] = G.editor.brush;
}

// ---------- 渲染 ----------
function drawTank(x, y, dir, pal, bonus, spawnT, invuln, flash, foe, t) {
  const s = CELL * 2 - 4;
  if (spawnT > 0) {
    // 出生旋转门
    ctx.fillStyle = ['#888', '#eee'][Math.floor(G.t * 12) % 2];
    ctx.fillRect(x, y, s, s / 4); ctx.fillRect(x, y + s * 3 / 4, s, s / 4);
    ctx.fillRect(x, y, s / 4, s); ctx.fillRect(x + s * 3 / 4, y, s / 4, s);
    return;
  }
  if (invuln > 0 && Math.floor(G.t * 12) % 2 === 0) ctx.globalAlpha = .55;
  const blink = bonus && Math.floor(G.t * 6) % 2 === 0;
  const body = flash > 0 ? '#fff' : blink ? '#ff5d5d' : pal.body;
  const dark = pal.dark;
  ctx.save();
  ctx.translate(x + s / 2, y + s / 2);
  ctx.rotate(dir * Math.PI / 2);
  const h = s / 2;
  // 履带
  ctx.fillStyle = dark;
  ctx.fillRect(-h, -h, s * .28, s);
  ctx.fillRect(h - s * .28, -h, s * .28, s);
  ctx.fillStyle = 'rgba(255,255,255,.25)';
  for (let i = 0; i < 4; i++) {
    const yy = -h + ((G.t * 60 + i * 12) % s);
    ctx.fillRect(-h, yy, s * .28, 3);
    ctx.fillRect(h - s * .28, yy, s * .28, 3);
  }
  // 车身
  ctx.fillStyle = body;
  ctx.fillRect(-h + s * .26, -h + 4, s * .48, s - 8);
  ctx.fillStyle = dark;
  ctx.fillRect(-h + s * .26, -h + 4, s * .48, 3);
  // 炮塔
  ctx.fillStyle = body;
  ctx.fillRect(-7, -7, 14, 14);
  ctx.fillStyle = dark;
  ctx.fillRect(-7, -7, 14, 3);
  // 炮管
  ctx.fillStyle = '#222';
  ctx.fillRect(-2.5, -h - 4, 5, h - 2);
  ctx.restore();
  ctx.globalAlpha = 1;
}
const PAL_P1 = { body: '#e8c832', dark: '#8a6d00' };
const PAL_P2 = { body: '#5ee66e', dark: '#1d7a2a' };
function drawCell(t, x, y) {
  if (t === 1) {
    ctx.fillStyle = '#a34d1e'; ctx.fillRect(x, y, CELL, CELL);
    ctx.fillStyle = '#e08a3c'; ctx.fillRect(x, y, CELL, 3); ctx.fillRect(x, y, 3, CELL);
    ctx.fillStyle = '#5e2203'; ctx.fillRect(x + CELL / 2 - 1, y, 2, CELL); ctx.fillRect(x, y + CELL / 2 - 1, CELL, 2);
  } else if (t === 2) {
    ctx.fillStyle = '#cfd6dd'; ctx.fillRect(x, y, CELL, CELL);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, CELL, 3); ctx.fillRect(x, y, 3, CELL);
    ctx.fillStyle = '#7a848e'; ctx.fillRect(x, y + CELL - 3, CELL, 3); ctx.fillRect(x + CELL - 3, y, 3, CELL);
  } else if (t === 3) {
    const w = Math.sin(G.t * 3 + (x + y) * .02) * 2;
    ctx.fillStyle = '#1d5fc2'; ctx.fillRect(x, y, CELL, CELL);
    ctx.fillStyle = '#5ea8ff'; ctx.fillRect(x + 3, y + 6 + w, CELL - 6, 3); ctx.fillRect(x + 5, y + 14 - w, CELL - 10, 3);
  } else if (t === 4) {
    ctx.fillStyle = 'rgba(46,139,60,.9)';
    ctx.beginPath(); ctx.arc(x + 6, y + 8, 6, 0, 7); ctx.arc(x + 15, y + 14, 7, 0, 7); ctx.arc(x + 8, y + 18, 5, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(120,220,130,.9)';
    ctx.fillRect(x + 4, y + 6, 3, 3); ctx.fillRect(x + 13, y + 12, 3, 3);
  } else if (t === 5) {
    ctx.fillStyle = '#cfe8ff'; ctx.fillRect(x, y, CELL, CELL);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(x + 4, y + 5, 8, 3); ctx.fillRect(x + 12, y + 14, 7, 3);
  } else if (t === 9 || t === 10) {
    drawEagle(x, y, t === 10);
  }
}
function drawGrid(grid) {
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const t = grid[r][c];
    if (!t) continue;
    drawCell(t, c * CELL, r * CELL);
  }
}
function render() {
  ctx.save();
  if (G.shake > 0) ctx.translate((Math.random() - .5) * G.shake, (Math.random() - .5) * G.shake);
  ctx.fillStyle = '#0a0a0a'; ctx.fillRect(-20, -20, W + 40, H + 40);
  const grid = G.state === 'editor' ? G.editor.grid : G.grid;
  if (G.state === 'editor' || G.state === 'play' || G.state === 'pause' || G.state === 'clear' || G.state === 'over' || G.state === 'win') {
    drawGrid(grid);
  }
  if (G.state === 'menu') { ctx.restore(); return; }
  if (G.state === 'editor') {
    // 编辑器网格线
    ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth = 1;
    for (let c = 0; c <= COLS; c += 2) { ctx.beginPath(); ctx.moveTo(c * CELL, 0); ctx.lineTo(c * CELL, H); ctx.stroke(); }
    for (let r = 0; r <= ROWS; r += 2) { ctx.beginPath(); ctx.moveTo(0, r * CELL); ctx.lineTo(W, r * CELL); ctx.stroke(); }
    // 老鹰位置标记
    ctx.strokeStyle = 'rgba(255,217,61,.6)'; ctx.lineWidth = 2;
    ctx.strokeRect(12 * CELL, 24 * CELL, CELL * 2, CELL * 2);
    ctx.fillStyle = 'rgba(255,217,61,.9)'; ctx.font = '900 13px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(T('eagleTag'), 13 * CELL, 24 * CELL - 8);
    // 出生点标记
    ctx.fillStyle = 'rgba(94,230,110,.9)';
    ctx.fillText('P1', 9 * CELL, 24 * CELL - 8);
    ctx.fillText('P2', 17 * CELL, 24 * CELL - 8);
    ctx.restore();
    return;
  }
  // 老鹰画在砖上层已在循环里画了（占2x2，按左上画一次即可）——上面循环会对4格各画一次，这里用裁剪避免重叠无妨
  // 道具
  for (const it of G.items) {
    const pulse = 1 + Math.sin(G.t * 6) * .08;
    ctx.save();
    ctx.translate(it.x + 12, it.y + 12); ctx.scale(pulse, pulse);
    ctx.fillStyle = '#111'; ctx.fillRect(-13, -13, 26, 26);
    ctx.strokeStyle = '#ffd93d'; ctx.lineWidth = 2; ctx.strokeRect(-13, -13, 26, 26);
    ctx.font = '17px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText({ star: '⭐', helmet: '⛑', clock: '⏰', shovel: '🛡', grenade: '💣', life: '🎖' }[it.kind], 0, 1);
    ctx.restore();
  }
  // 坦克（草下层：先画坦克再补草）
  for (const p of G.players) {
    if (!p.alive) continue;
    const pal = p.side === 'p2' ? PAL_P2 : PAL_P1;
    drawTank(p.x, p.y, p.dir, p.stars >= 3 ? { body: '#ff8c42', dark: '#8a3d00' } : pal, false, p.spawnT, p.invuln, 0, false, G.t);
  }
  for (const f of G.foes) {
    if (!f.alive) continue;
    const info = FOE_TYPES[f.type];
    drawTank(f.x, f.y, f.dir, { body: info.color, dark: '#444' }, f.bonus, f.spawnT, 0, f.flash, true, G.t);
    if (f.maxHp > 1 && f.hp < f.maxHp) {
      ctx.fillStyle = '#333'; ctx.fillRect(f.x, f.y - 6, f.w, 4);
      ctx.fillStyle = '#5ee66e'; ctx.fillRect(f.x, f.y - 6, f.w * f.hp / f.maxHp, 4);
    }
  }
  // 草丛盖顶
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (grid[r][c] !== 4) continue;
    const x = c * CELL, y = r * CELL;
    ctx.fillStyle = 'rgba(46,139,60,.85)';
    ctx.beginPath(); ctx.arc(x + 6, y + 8, 6, 0, 7); ctx.arc(x + 15, y + 14, 7, 0, 7); ctx.fill();
  }
  // 子弹
  for (const b of G.bullets) {
    ctx.fillStyle = b.foe ? '#ff6b6b' : '#ffe45e';
    ctx.fillRect(b.x - 1, b.y - 1, b.w + 2, b.h + 2);
    ctx.fillStyle = '#fff';
    ctx.fillRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
  }
  // 粒子
  for (const p of G.parts) {
    ctx.globalAlpha = Math.max(0, 1 - p.age / p.life);
    ctx.fillStyle = p.c;
    ctx.fillRect(p.x - p.r / 2, p.y - p.r / 2, p.r, p.r);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center';
  for (const f of G.floats) {
    ctx.globalAlpha = Math.max(0, 1 - f.age / 1.2);
    ctx.font = '900 16px system-ui';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.7)';
    ctx.strokeText(f.text, f.x, f.y);
    ctx.fillStyle = '#ffd93d';
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
  if (G.freezeT > 0) {
    ctx.fillStyle = 'rgba(120,180,255,.9)';
    ctx.font = '900 14px system-ui'; ctx.textAlign = 'left';
    ctx.fillText(T('freezeTag', Math.ceil(G.freezeT)), 12, H - 12);
  }
  if (G.shovelT > 0) {
    ctx.fillStyle = 'rgba(255,217,61,.9)';
    ctx.font = '900 14px system-ui'; ctx.textAlign = 'right';
    ctx.fillText(T('shovelTag', Math.ceil(G.shovelT)), W - 12, H - 12);
  }
  ctx.restore();
}
function drawEagle(x, y, dead) {
  // x,y 是4格之一的左上；只在左上格绘制完整老鹰
  const gx = Math.round(x / CELL), gy = Math.round(y / CELL);
  if (gx !== EAGLE.c || gy !== EAGLE.r) return;
  const X = EAGLE.c * CELL, Y = EAGLE.r * CELL, S = CELL * 2;
  ctx.save();
  ctx.fillStyle = dead ? '#222' : '#e8d8a8';
  ctx.fillRect(X, Y, S, S);
  ctx.strokeStyle = dead ? '#000' : '#8a6d3b'; ctx.lineWidth = 2;
  ctx.strokeRect(X + 1, Y + 1, S - 2, S - 2);
  ctx.fillStyle = dead ? '#555' : '#5e4a1a';
  // 简笔鹰：身 + 翼 + 头
  ctx.fillRect(X + S / 2 - 4, Y + 12, 8, 24);
  ctx.beginPath();
  ctx.moveTo(X + S / 2 - 4, Y + 20); ctx.lineTo(X + 4, Y + 10); ctx.lineTo(X + 4, Y + 26); ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(X + S / 2 + 4, Y + 20); ctx.lineTo(X + S - 4, Y + 10); ctx.lineTo(X + S - 4, Y + 26); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.arc(X + S / 2, Y + 10, 7, 0, 7); ctx.fill();
  if (!dead) {
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(X + S / 2 - 7, Y + 2, 14, 4);
  } else {
    ctx.strokeStyle = '#ff5d5d'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(X + 6, Y + 6); ctx.lineTo(X + S - 6, Y + S - 6); ctx.moveTo(X + S - 6, Y + 6); ctx.lineTo(X + 6, Y + S - 6); ctx.stroke();
  }
  ctx.restore();
}

let last = performance.now();
function loop(now) {
  const dt = Math.min((now - last) / 1000, .033);
  last = now;
  if (G.state !== 'editor') update(dt);
  else G.t += dt;
  render();
  requestAnimationFrame(loop);
}

// ---------- 按钮 ----------
$('btn-1p').onclick = () => startGame('1p', +$('sel-stage').value, false);
$('btn-2p').onclick = () => startGame('2p', +$('sel-stage').value, false);
$('btn-resume').onclick = togglePause;
$('btn-quit').onclick = () => { showMenu(); };
$('btn-menu2').onclick = () => showMenu();
$('btn-menu3').onclick = () => showMenu();
$('btn-menu4').onclick = () => showMenu();
$('btn-next').onclick = () => {
  if (G.customStage) { showMenu(); return; }
  if (G.stageIdx >= STAGES.length - 1) { winAll(); return; }
  G.score = G.score; // 分数延续
  loadStage(G.stageIdx + 1, false);
  // 生命延续：保留玩家生命与星级
  G.state = 'play';
  setScreen(null);
  $('hud').classList.remove('hidden');
};
$('btn-retry').onclick = () => retry();
$('btn-again').onclick = () => startGame(G.mode, 0, false);
function toggleMute() {
  muted = !muted; store.muted = muted;
  $('btn-mute').textContent = muted ? '🔇' : '🔊';
}
$('btn-mute').onclick = e => { e.stopPropagation(); toggleMute(); };
$('btn-mute').textContent = muted ? '🔇' : '🔊';
// i18n boot: static DOM + dynamic boot texts
AMG.mountBtn();
window.__refreshLang = function() {
  AMG.apply(STR);
  $('btn-mute').title = T('muteTitle');
  document.querySelectorAll('#palette [data-t]').forEach(b => { const n = (T('palTitles') || {})[b.dataset.t]; if (n) b.title = n; });
  const edT = T('edTitles') || {};
  if ($('ed-clear')) $('ed-clear').title = edT.clear || $('ed-clear').title;
  if ($('ed-test')) $('ed-test').title = edT.test || $('ed-test').title;
  if ($('ed-save')) $('ed-save').title = edT.save || $('ed-save').title;
  if ($('ed-back')) $('ed-back').title = edT.back || $('ed-back').title;
  const sel = $('sel-stage');
  if (sel) {
    const cur = sel.value;
    sel.innerHTML = STAGES.map((s, i) => '<option value="' + i + '">' + stageFull(i) + '</option>').join('');
    sel.value = cur === '' ? G.stageIdx : cur;
    if (sel.value === '') sel.value = G.stageIdx;
  }
  const mb = $('menu-best');
  if (mb) mb.textContent = store.best;
};
window.__refreshLang();

// 触屏
function bindHold(id, code) {
  const el = $(id);
  const on = e => { e.preventDefault(); keys[code] = true; };
  const off = e => { e.preventDefault(); keys[code] = false; };
  el.addEventListener('pointerdown', on);
  el.addEventListener('pointerup', off);
  el.addEventListener('pointercancel', off);
  el.addEventListener('pointerleave', off);
}
bindHold('t-up', 'KeyW'); bindHold('t-left', 'KeyA'); bindHold('t-down', 'KeyS'); bindHold('t-right', 'KeyD');
$('t-fire').addEventListener('pointerdown', e => { e.preventDefault(); const p = G.players[0]; if (p) tryFireKey(p); });

loadStage(0, false);
G.state = 'menu';
showMenu();
window.__game = G;
window.__gameErrors = [];
window.addEventListener('error', e => window.__gameErrors.push(String(e.message)));
G._loadStage = loadStage; G._fire = fire; G._startGame = startGame; G._applyItem = applyItem; G._STAGES = STAGES;
requestAnimationFrame(t => { last = t; requestAnimationFrame(loop); });
})();
