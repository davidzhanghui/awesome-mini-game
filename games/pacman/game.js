(() => {
// 吃豆人：经典 28×31 迷宫 + 四幽灵 AI（追击 / 伏击 / 包抄 / 徘徊）+ 能量豆反杀
const STR = window.GAME_STR || { zh: {} };
const T = (k, ...a) => AMG.tf(STR, k, ...a);
const W = 480, H = 620, TS = 16, COLS = 28, ROWS = 31, OX = 16, OY = 86;
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const $ = id => document.getElementById(id);
const dpr = Math.min(window.devicePixelRatio || 1, 2);
canvas.width = W * dpr; canvas.height = H * dpr;
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

// # 墙  . 豆  o 能量豆  - 幽灵屋门  空格 通道
const MAP = [
  '############################',
  '#............##............#',
  '#.####.#####.##.#####.####.#',
  '#o####.#####.##.#####.####o#',
  '#.####.#####.##.#####.####.#',
  '#..........................#',
  '#.####.##.########.##.####.#',
  '#.####.##.########.##.####.#',
  '#......##....##....##......#',
  '######.##### ## #####.######',
  '     #.##### ## #####.#     ',
  '     #.##          ##.#     ',
  '     #.## ###--### ##.#     ',
  '######.## #      # ##.######',
  '      .   #      #   .      ',
  '######.## #      # ##.######',
  '     #.## ######## ##.#     ',
  '     #.##          ##.#     ',
  '     #.## ######## ##.#     ',
  '######.## ######## ##.######',
  '#............##............#',
  '#.####.#####.##.#####.####.#',
  '#.####.#####.##.#####.####.#',
  '#o..##.......  .......##..o#',
  '###.##.##.########.##.##.###',
  '###.##.##.########.##.##.###',
  '#......##....##....##......#',
  '#.##########.##.##########.#',
  '#.##########.##.##########.#',
  '#..........................#',
  '############################'
];
const TUNNEL_ROW = 14;
const DIRS = [{ x: -1, y: 0 }, { x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }]; // 左 上 右 下
const GHOST_DEF = [
  { name: 'blinky', color: '#ff3b3b', corner: { x: 25, y: -3 }, home: { x: 13.5, y: 14 }, release: 0 },
  { name: 'pinky', color: '#ffb0dc', corner: { x: 2, y: -3 }, home: { x: 13.5, y: 14 }, release: .6 },
  { name: 'inky', color: '#38e8ff', corner: { x: 27, y: 31 }, home: { x: 11.5, y: 14 }, release: 4 },
  { name: 'clyde', color: '#ffb347', corner: { x: 0, y: 31 }, home: { x: 15.5, y: 14 }, release: 8 }
];
const FRUITS = [['🍒', 100], ['🍓', 300], ['🍊', 500], ['🍊', 500], ['🍎', 700], ['🍎', 700], ['🍈', 1000], ['🍈', 1000], ['🔔', 2000], ['🔑', 5000]];
const MODES = [7, 20, 7, 20, 5, 20, 5, Infinity]; // 偶数下标 scatter，奇数 chase

const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
};
const store = {
  get best() { return +(LS.get('pac-best', 0)); },
  set best(v) { LS.set('pac-best', v); },
  get muted() { return LS.get('pac-muted', '') === '1'; },
  set muted(v) { LS.set('pac-muted', v ? '1' : '0'); }
};
let actx = null, muted = store.muted;
function ac() {
  if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
  if (actx.state === 'suspended') actx.resume();
  return actx;
}
function sweep(f1, f2, dur, type, vol) {
  if (muted) return;
  try {
    const a = ac(), o = a.createOscillator(), g = a.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(f1, a.currentTime);
    o.frequency.exponentialRampToValueAtTime(f2, a.currentTime + dur);
    g.gain.setValueAtTime(vol || .05, a.currentTime);
    g.gain.exponentialRampToValueAtTime(.001, a.currentTime + dur);
    o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + dur);
  } catch (e) {}
}
let waka = 0;
const sfx = {
  dot: () => { waka ^= 1; sweep(waka ? 300 : 480, waka ? 480 : 300, .08, 'triangle', .07); },
  power: () => sweep(200, 900, .35, 'square', .05),
  ghost: () => sweep(300, 1400, .3, 'square', .05),
  fruit: () => [660, 990, 1320].forEach((f, i) => setTimeout(() => sweep(f, f, .08, 'triangle', .07), i * 60)),
  die: () => sweep(800, 90, 1.3, 'sawtooth', .05),
  life: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => sweep(f, f, .12, 'square', .04), i * 90)),
  start: () => [494, 988, 740, 622, 988, 740, 622].forEach((f, i) => setTimeout(() => sweep(f, f, .12, 'square', .035), i * 130)),
  clear: () => [784, 988, 1175, 1568].forEach((f, i) => setTimeout(() => sweep(f, f, .14, 'triangle', .07), i * 110))
};

const G = {
  state: 'menu', level: 1, score: 0, lives: 3, grid: [], dots: 0, eaten: 0,
  pac: null, ghosts: [], want: -1, timer: 0, modeIdx: 0, modeT: 0,
  frightT: 0, frightChain: 0, freeze: 0, fruit: null, fruitsShown: 0,
  pops: [], extraGiven: false, flash: 0, t: 0
};

const lvMul = () => Math.min(1.25, 1 + (G.level - 1) * .05);
const frightDur = () => Math.max(1.5, 7 - (G.level - 1) * .7);
const isChase = () => G.modeIdx % 2 === 1;

function tileAt(x, y) {
  if (y === TUNNEL_ROW && (x < 0 || x >= COLS)) return ' ';
  if (y < 0 || y >= ROWS || x < 0 || x >= COLS) return '#';
  return G.grid[y][x];
}
const open = (x, y) => { const c = tileAt(x, y); return c !== '#' && c !== '-'; };

function newLevel() {
  G.grid = MAP.map(r => r.split(''));
  G.dots = 0; G.eaten = 0; G.fruitsShown = 0; G.fruit = null;
  for (const r of G.grid) for (const c of r) if (c === '.' || c === 'o') G.dots++;
}
function resetRound() {
  G.pac = { x: 13.5, y: 23, dir: 0, moving: true, mouth: 0, dieT: 0 };
  G.want = -1;
  const k = Math.max(.3, 1 - (G.level - 1) * .15);
  G.ghosts = GHOST_DEF.map((d, i) => ({
    id: i, ...d,
    x: i === 0 ? 13.5 : d.home.x, y: i === 0 ? 11 : d.home.y,
    dir: i === 0 ? 0 : (i === 2 ? 1 : 3),
    state: i === 0 ? 'active' : 'house', releaseT: d.release * k, fright: false
  }));
  G.modeIdx = 0; G.modeT = MODES[0]; G.frightT = 0; G.freeze = 0;
  G.state = 'ready'; G.timer = 2;
}
function startGame() {
  G.level = 1; G.score = 0; G.lives = 3; G.extraGiven = false; G.pops = [];
  newLevel(); resetRound();
  showScreen(null);
  sfx.start();
}

// 沿方向前进 dist 格；每到达格子中心调用 onCenter，返回 true 则本帧停止移动。
// 隧道：中心坐标 -1 与 28 都是屏幕外的过渡格，走到即从另一侧出现
function advance(e, dist, onCenter) {
  let guard = 0;
  while (dist > 1e-9 && guard++ < 8) {
    const d = DIRS[e.dir];
    let rem;
    if (d.x) {
      const nc = d.x > 0 ? Math.floor(e.x + 1e-6) + 1 : Math.ceil(e.x - 1e-6) - 1;
      rem = Math.abs(nc - e.x);
    } else {
      const nc = d.y > 0 ? Math.floor(e.y + 1e-6) + 1 : Math.ceil(e.y - 1e-6) - 1;
      rem = Math.abs(nc - e.y);
    }
    // 留 1e-5 余量：恰好停在中心附近也必须触发 onCenter，否则下一帧会跳过该中心的转向 / 撞墙判定
    if (dist < rem - 1e-5) { e.x += d.x * dist; e.y += d.y * dist; return; }
    e.x = Math.round(e.x + d.x * rem); e.y = Math.round(e.y + d.y * rem);
    dist -= rem;
    if (e.x <= -1 && d.x < 0) e.x = COLS;
    else if (e.x >= COLS && d.x > 0) e.x = -1;
    if (onCenter(e)) return;
  }
}

function eatAt(x, y) {
  if (x < 0 || x >= COLS) return;
  const c = G.grid[y][x];
  if (c !== '.' && c !== 'o') return;
  G.grid[y][x] = ' ';
  G.dots--; G.eaten++;
  if (c === '.') { addScore(10); sfx.dot(); }
  else {
    addScore(50); sfx.power();
    G.frightT = frightDur(); G.frightChain = 0;
    for (const g of G.ghosts) {
      if (g.state === 'eyes' || g.state === 'entering') continue;
      g.fright = true;
      if (g.state === 'active') g.dir = (g.dir + 2) % 4;
    }
  }
  if (G.eaten === 70 || G.eaten === 170) {
    const f = FRUITS[Math.min(G.level - 1, FRUITS.length - 1)];
    G.fruit = { e: f[0], pts: f[1], t: 9.5 };
  }
  if (G.dots === 0) { G.state = 'clear'; G.timer = 2.2; G.fruit = null; sfx.clear(); }
}
function addScore(n) {
  G.score += n;
  if (!G.extraGiven && G.score >= 10000) { G.extraGiven = true; G.lives++; sfx.life(); }
  if (G.score > store.best) store.best = G.score;
}

function pacCenter(p) {
  eatAt(p.x, p.y);
  if (G.state !== 'play') return true;
  if (G.want >= 0 && open(p.x + DIRS[G.want].x, p.y + DIRS[G.want].y)) p.dir = G.want;
  if (!open(p.x + DIRS[p.dir].x, p.y + DIRS[p.dir].y)) { p.moving = false; return true; }
  p.moving = true;
  return false;
}
function updatePac(dt) {
  const p = G.pac;
  if (G.want >= 0) {
    // 行进中随时可掉头（来路必然可通行）；停在墙前时只能转向可通行的方向
    if (p.moving && G.want === (p.dir + 2) % 4) p.dir = G.want;
    else if (!p.moving && Number.isInteger(p.x) && Number.isInteger(p.y) &&
             open(p.x + DIRS[G.want].x, p.y + DIRS[G.want].y)) { p.dir = G.want; p.moving = true; }
  }
  if (!p.moving) return;
  const sp = 7.6 * lvMul() * (G.frightT > 0 ? 1.1 : 1);
  advance(p, sp * dt, pacCenter);
  p.mouth += dt * 16;
}

function targetOf(g) {
  const p = { x: Math.round(G.pac.x), y: Math.round(G.pac.y) }, d = DIRS[G.pac.dir];
  const elroy = g.id === 0 && G.dots < 20;
  if (!isChase() && !elroy) return g.corner;
  if (g.id === 0) return p;
  if (g.id === 1) return { x: p.x + d.x * 4, y: p.y + d.y * 4 };
  if (g.id === 2) {
    const a = { x: p.x + d.x * 2, y: p.y + d.y * 2 }, b = G.ghosts[0];
    return { x: 2 * a.x - Math.round(b.x), y: 2 * a.y - Math.round(b.y) };
  }
  return Math.hypot(g.x - p.x, g.y - p.y) > 8 ? p : g.corner;
}
function ghostDecide(g) {
  const opts = [];
  for (const d of [1, 0, 3, 2]) {
    if (d === (g.dir + 2) % 4) continue;
    if (open(g.x + DIRS[d].x, g.y + DIRS[d].y)) opts.push(d);
  }
  if (!opts.length) { g.dir = (g.dir + 2) % 4; return; }
  if (g.fright && g.state === 'active') { g.dir = opts[Math.random() * opts.length | 0]; return; }
  const t = g.state === 'eyes' ? { x: 13, y: 11 } : targetOf(g);
  let best = opts[0], bd = Infinity;
  for (const d of opts) {
    const dd = (g.x + DIRS[d].x - t.x) ** 2 + (g.y + DIRS[d].y - t.y) ** 2;
    if (dd < bd) { bd = dd; best = d; }
  }
  g.dir = best;
}
function moveTo(g, tx, ty, d) {
  const dx = tx - g.x;
  if (Math.abs(dx) > 1e-6) {
    const s = Math.min(Math.abs(dx), d);
    g.x += Math.sign(dx) * s; g.dir = dx < 0 ? 0 : 2; d -= s;
    if (Math.abs(tx - g.x) > 1e-6) return false;
  }
  const dy = ty - g.y;
  if (Math.abs(dy) > 1e-6) {
    const s = Math.min(Math.abs(dy), d);
    g.y += Math.sign(dy) * s; g.dir = dy < 0 ? 1 : 3;
    if (Math.abs(ty - g.y) > 1e-6) return false;
  }
  g.x = tx; g.y = ty;
  return true;
}
function updateGhost(g, dt) {
  const base = 7.1 * lvMul();
  if (g.state === 'house') {
    g.releaseT -= dt;
    if (g.releaseT <= 0) g.state = 'leaving';
  } else if (g.state === 'leaving') {
    if (moveTo(g, 13.5, 11, 4 * dt)) { g.state = 'active'; g.dir = 0; }
  } else if (g.state === 'active') {
    const tunnel = g.y === TUNNEL_ROW && (g.x < 6 || g.x > 21);
    let sp = g.fright ? 4.3 : base;
    if (tunnel) sp = Math.min(sp, 3.8);
    else if (!g.fright && g.id === 0 && G.dots < 20) sp *= 1.1;
    advance(g, sp * dt, e => { ghostDecide(e); return false; });
  } else if (g.state === 'eyes') {
    advance(g, 15 * dt, e => {
      if (e.y === 11 && (e.x === 13 || e.x === 14)) { e.state = 'entering'; return true; }
      ghostDecide(e);
      return false;
    });
  } else if (g.state === 'entering') {
    if (moveTo(g, 13.5, 14, 8 * dt)) { g.fright = false; g.state = 'leaving'; }
  }
}

function checkCollide() {
  const p = G.pac;
  for (const g of G.ghosts) {
    if (g.state !== 'active') continue;
    let dx = Math.abs(g.x - p.x);
    if (dx > COLS / 2) dx = COLS + 1 - dx;
    if (dx + Math.abs(g.y - p.y) > .75) continue;
    if (g.fright) {
      const pts = 200 * 2 ** G.frightChain++;
      addScore(pts);
      g.state = 'eyes'; g.fright = false;
      G.pops.push({ x: g.x, y: g.y, txt: pts, t: 1, c: '#7dd3fc' });
      G.freeze = .55; sfx.ghost();
    } else {
      G.state = 'dying'; G.timer = 1.8; p.dieT = 0; sfx.die();
      return;
    }
  }
  if (G.fruit && Math.abs(p.y - 17) < .5 && Math.abs(p.x - 13.5) < .8) {
    addScore(G.fruit.pts);
    G.pops.push({ x: 13.5, y: 17, txt: G.fruit.pts, t: 1.4, c: '#fda4af' });
    G.fruit = null; sfx.fruit();
  }
}

function update(dt) {
  G.t += dt;
  for (const pp of G.pops) pp.t -= dt;
  G.pops = G.pops.filter(pp => pp.t > 0);
  if (G.state === 'ready') {
    G.timer -= dt;
    if (G.timer <= 0) G.state = 'play';
    return;
  }
  if (G.state === 'dying') {
    G.timer -= dt; G.pac.dieT += dt;
    if (G.timer <= 0) {
      G.lives--;
      if (G.lives <= 0) return gameOver();
      resetRound();
    }
    return;
  }
  if (G.state === 'clear') {
    G.timer -= dt; G.flash += dt;
    if (G.timer <= 0) { G.level++; newLevel(); resetRound(); }
    return;
  }
  if (G.state !== 'play') return;
  if (G.freeze > 0) { G.freeze -= dt; return; }
  if (G.frightT > 0) {
    G.frightT -= dt;
    if (G.frightT <= 0) for (const g of G.ghosts) g.fright = false;
  } else {
    G.modeT -= dt;
    if (G.modeT <= 0 && G.modeIdx < MODES.length - 1) {
      G.modeIdx++; G.modeT = MODES[G.modeIdx];
      for (const g of G.ghosts) if (g.state === 'active') g.dir = (g.dir + 2) % 4;
    }
  }
  if (G.fruit) { G.fruit.t -= dt; if (G.fruit.t <= 0) G.fruit = null; }
  updatePac(dt);
  if (G.state !== 'play') return;
  checkCollide();
  if (G.state !== 'play') return;
  for (const g of G.ghosts) updateGhost(g, dt);
  checkCollide();
}

function gameOver() {
  G.state = 'over';
  $('over-title').textContent = T('overTitle');
  $('over-sub').textContent = T('overSub', G.score, G.level);
  showScreen('over');
}
function showScreen(name) {
  for (const k of ['screen-menu', 'screen-over'])
    $(k).classList.toggle('hidden', k !== 'screen-' + name);
}
function togglePause() {
  if (G.state === 'play' || G.state === 'ready') { G.prev = G.state; G.state = 'pause'; }
  else if (G.state === 'pause') G.state = G.prev || 'play';
}
function setWant(d) {
  if (G.state === 'play' || G.state === 'ready') G.want = d;
}

const KEYS = { ArrowLeft: 0, KeyA: 0, ArrowUp: 1, KeyW: 1, ArrowRight: 2, KeyD: 2, ArrowDown: 3, KeyS: 3 };
window.addEventListener('keydown', e => {
  if (e.code in KEYS) { e.preventDefault(); setWant(KEYS[e.code]); }
  else if (e.code === 'KeyM') toggleMute();
  else if (e.code === 'KeyP') togglePause();
  else if (e.code === 'KeyR' || e.code === 'Enter' || e.code === 'Space') {
    e.preventDefault();
    if (G.state === 'over' || G.state === 'menu') startGame();
  } else if (e.code === 'Escape') togglePause();
});
// 触屏：按住滑动即转向（无需抬手）
let touchS = null;
canvas.addEventListener('pointerdown', e => { touchS = [e.clientX, e.clientY]; });
canvas.addEventListener('pointermove', e => {
  if (!touchS) return;
  const dx = e.clientX - touchS[0], dy = e.clientY - touchS[1];
  if (Math.hypot(dx, dy) < 18) return;
  setWant(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 2 : 0) : (dy > 0 ? 3 : 1));
  touchS = [e.clientX, e.clientY];
});
window.addEventListener('pointerup', () => { touchS = null; });
$('btn-start').onclick = startGame;
$('btn-retry').onclick = startGame;
$('btn-menu').onclick = () => { G.state = 'menu'; showScreen('menu'); $('menu-best').textContent = T('best', store.best); };
function toggleMute() {
  muted = !muted; store.muted = muted;
  $('btn-mute').textContent = muted ? '🔇' : '🔊';
}
$('btn-mute').onclick = toggleMute;
$('btn-mute').textContent = muted ? '🔇' : '🔊';
window.__refreshLang = function () {
  AMG.apply(STR);
  $('btn-mute').title = T('muteTitle');
  $('menu-best').textContent = T('best', store.best);
};
AMG.mountBtn();
window.__refreshLang();

// ---------- 渲染 ----------
const cx = x => OX + x * TS + TS / 2, cy = y => OY + y * TS + TS / 2;
function drawMaze(flashWhite) {
  ctx.fillStyle = '#05061a'; ctx.fillRect(OX, OY, COLS * TS, ROWS * TS);
  const isWall = (x, y) => x >= 0 && x < COLS && G.grid[y][x] === '#';
  const edge = flashWhite ? '#f8fafc' : '#4f7dff';
  ctx.fillStyle = flashWhite ? '#334155' : '#0e1a5c';
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++)
    if (G.grid[y][x] === '#') ctx.fillRect(OX + x * TS, OY + y * TS, TS, TS);
  ctx.strokeStyle = edge; ctx.lineWidth = 2; ctx.lineCap = 'round';
  ctx.beginPath();
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    if (G.grid[y][x] !== '#') continue;
    const px = OX + x * TS, py = OY + y * TS;
    if (y > 0 && !isWall(x, y - 1)) { ctx.moveTo(px, py + 1); ctx.lineTo(px + TS, py + 1); }
    if (y < ROWS - 1 && !isWall(x, y + 1)) { ctx.moveTo(px, py + TS - 1); ctx.lineTo(px + TS, py + TS - 1); }
    if (x > 0 && !isWall(x - 1, y)) { ctx.moveTo(px + 1, py); ctx.lineTo(px + 1, py + TS); }
    if (x < COLS - 1 && !isWall(x + 1, y)) { ctx.moveTo(px + TS - 1, py); ctx.lineTo(px + TS - 1, py + TS); }
  }
  ctx.stroke();
  // 幽灵屋门
  ctx.fillStyle = '#fda4d4';
  ctx.fillRect(OX + 13 * TS, OY + 12 * TS + 6, TS * 2, 4);
}
function drawDots() {
  const blink = Math.sin(G.t * 10) > -.3;
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const c = G.grid[y][x];
    if (c === '.') { ctx.fillStyle = '#ffd8b0'; ctx.fillRect(cx(x) - 2, cy(y) - 2, 4, 4); }
    else if (c === 'o' && (blink || G.state !== 'play')) {
      ctx.fillStyle = '#ffe2c4';
      ctx.beginPath(); ctx.arc(cx(x), cy(y), 6, 0, 7); ctx.fill();
    }
  }
}
function drawPac() {
  const p = G.pac;
  const rot = [Math.PI, -Math.PI / 2, 0, Math.PI / 2][p.dir];
  let m = p.moving ? (.04 + .22 * Math.abs(Math.sin(p.mouth))) * Math.PI : .16 * Math.PI;
  let r = 7.5, ang = rot;
  if (G.state === 'dying') {
    const k = Math.max(0, (p.dieT - .4) / 1.1);
    if (k >= 1) return;
    m = Math.min(Math.PI, .1 + k * Math.PI); ang = -Math.PI / 2;
  }
  const x = cx(p.x), y = cy(p.y);
  ctx.fillStyle = '#ffd84d';
  ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r, ang + m, ang + Math.PI * 2 - m); ctx.closePath(); ctx.fill();
}
function drawGhost(g) {
  let x = cx(g.x), y = cy(g.y);
  if (g.state === 'house') y += Math.sin(G.t * 6 + g.id) * 3;
  const r = 7.6, eyesOnly = g.state === 'eyes' || g.state === 'entering';
  const flashing = g.fright && G.frightT < 2 && Math.floor(G.t * 5) % 2 === 0;
  if (!eyesOnly) {
    ctx.fillStyle = g.fright ? (flashing ? '#f1f5f9' : '#2747ff') : g.color;
    ctx.beginPath();
    ctx.arc(x, y - 1, r, Math.PI, 0);
    ctx.lineTo(x + r, y + r);
    const ph = Math.floor(G.t * 8) % 2, w = r / 2;
    for (let i = 0; i < 4; i++) {
      const xs = x + r - i * w;
      ctx.lineTo(xs - w / 2, y + r - (ph ? 3.2 : 1.6));
      ctx.lineTo(xs - w, y + r);
    }
    ctx.lineTo(x - r, y + r);
    ctx.closePath(); ctx.fill();
  }
  if (g.fright && !eyesOnly) {
    ctx.fillStyle = flashing ? '#ef4444' : '#ffe0c0';
    ctx.fillRect(x - 4, y - 3, 2.5, 2.5); ctx.fillRect(x + 1.5, y - 3, 2.5, 2.5);
    ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(x - 5, y + 4);
    for (let i = 0; i < 4; i++) ctx.lineTo(x - 5 + (i + .5) * 2.5, y + (i % 2 ? 4 : 2.5));
    ctx.lineTo(x + 5, y + 4); ctx.stroke();
    return;
  }
  const d = DIRS[g.dir];
  for (const s of [-1, 1]) {
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.ellipse(x + s * 3.2 + d.x, y - 2 + d.y, 2.6, 3.3, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#1d4ed8';
    ctx.beginPath(); ctx.arc(x + s * 3.2 + d.x * 2.2, y - 2 + d.y * 2.2, 1.5, 0, 7); ctx.fill();
  }
}
function render() {
  ctx.fillStyle = '#05061a'; ctx.fillRect(0, 0, W, H);
  // HUD
  ctx.textAlign = 'left'; ctx.fillStyle = '#f8fafc'; ctx.font = '900 15px system-ui';
  ctx.fillText(T('hudScore'), 18, 30);
  ctx.textAlign = 'center'; ctx.fillText(T('hudBest'), W / 2, 30);
  ctx.textAlign = 'right'; ctx.fillText(T('hudLevel'), W - 18, 30);
  ctx.font = '900 24px system-ui'; ctx.fillStyle = '#ffd84d';
  ctx.textAlign = 'left'; ctx.fillText(G.score, 18, 60);
  ctx.textAlign = 'center'; ctx.fillText(Math.max(store.best, G.score), W / 2, 60);
  ctx.textAlign = 'right'; ctx.fillText(G.level, W - 18, 60);
  if (!G.grid.length) newLevel();
  const flashWhite = G.state === 'clear' && Math.floor(G.flash * 5) % 2 === 1;
  drawMaze(flashWhite);
  drawDots();
  ctx.save();
  ctx.beginPath(); ctx.rect(OX, OY, COLS * TS, ROWS * TS); ctx.clip();
  if (G.fruit) {
    ctx.font = '18px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(G.fruit.e, cx(13.5), cy(17));
    ctx.textBaseline = 'alphabetic';
  }
  if (G.pac && G.state !== 'menu' && G.state !== 'over') {
    const hideGhosts = (G.state === 'dying' && G.pac.dieT > .4) || G.state === 'clear';
    if (!hideGhosts) for (const g of G.ghosts) if (!(G.freeze > 0 && g.state === 'eyes' && G.pops.length)) drawGhost(g);
    if (!(G.freeze > 0)) drawPac();
  }
  ctx.font = '900 13px system-ui'; ctx.textAlign = 'center';
  for (const pp of G.pops) { ctx.fillStyle = pp.c; ctx.fillText(pp.txt, cx(pp.x), cy(pp.y) + 4); }
  ctx.restore();
  if (G.state === 'ready') {
    ctx.fillStyle = '#ffd84d'; ctx.font = '900 18px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(T('ready'), W / 2, cy(17) + 6);
  }
  // 底部：剩余命 + 当前关水果
  for (let i = 0; i < Math.max(0, G.lives - 1); i++) {
    const x = 30 + i * 24, y = 602;
    ctx.fillStyle = '#ffd84d';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, 8, Math.PI + .6, Math.PI * 3 - .6); ctx.closePath(); ctx.fill();
  }
  ctx.font = '16px system-ui'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  const fl = FRUITS.slice(0, Math.min(G.level, 7));
  fl.forEach((f, i) => ctx.fillText(f[0], W - 18 - i * 22, 602));
  ctx.textBaseline = 'alphabetic';
  if (G.state === 'pause') {
    ctx.fillStyle = 'rgba(5,6,26,.7)'; ctx.fillRect(OX, OY, COLS * TS, ROWS * TS);
    ctx.fillStyle = '#fff'; ctx.font = '900 30px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(T('paused'), W / 2, OY + ROWS * TS / 2);
  }
}

let last = performance.now();
function loop(now) {
  const dt = Math.min((now - last) / 1000, .05);
  last = now;
  if (G.state !== 'pause' && G.state !== 'menu' && G.state !== 'over') update(dt);
  else G.t += dt;
  render();
  requestAnimationFrame(loop);
}
newLevel();
requestAnimationFrame(t => { last = t; requestAnimationFrame(loop); });
window.__game = G;
window.__gameApi = { startGame, update, open, MAP };
window.__gameErrors = [];
window.addEventListener('error', e => window.__gameErrors.push(String(e.message)));
})();
document.addEventListener('visibilitychange', () => { if (document.hidden && (G.state === 'play' || G.state === 'ready')) togglePause(); });
