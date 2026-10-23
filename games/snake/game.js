(() => {
'use strict';
// 贪吃蛇：固定节拍逻辑 + 节拍间插值渲染（丝滑移动）；方向输入队列；三种模式；限时道具
const { $, T } = KIT;
const store = KIT.store('amg-snake');
const W = 520, H = 580, COLS = 20, ROWS = 20, CS = 25, OX = 10, OY = 70;
const cv = $('game'), frame = $('frame');
const ctx = KIT.canvas(cv, W, H);
const SPEEDS = [175, 135, 100];
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };

let gm = store.get('mode', 'classic'), sp = store.get('speed', 1);
if (!['classic', 'wrap', 'maze'].includes(gm)) gm = 'classic';
let state = 'menu'; // menu | ready | play | pause | dead | over
let snake = [], prev = [], dir = 'right', queue = [], grow = 0;
let apple = null, extra = null, rocks = new Set();
let score = 0, apples = 0, stepMs = 140, acc = 0, slowT = 0, playT = 0, mapIdx = 0;
let shake = 0, deadAt = 0, deathCause = '', bestAtStart = 0, eatPulse = 0;
const parts = new KIT.Particles();

// ---------------- 音效 ----------------
const sfx = {
  eat: n => { KIT.tone(520 + (n % 8) * 40, 0.08, { type: 'square', vol: 0.04 }); KIT.tone(780 + (n % 8) * 40, 0.08, { type: 'square', vol: 0.03, delay: 0.05 }); },
  gold: () => KIT.arp([784, 988, 1175, 1568], 0.05, { vol: 0.07, dur: 0.14 }),
  shrink: () => KIT.tone(600, 0.25, { type: 'sine', vol: 0.07, to: 200 }),
  slow: () => KIT.tone(1200, 0.4, { type: 'sine', vol: 0.05, to: 500 }),
  turn: () => KIT.tone(220, 0.025, { type: 'triangle', vol: 0.015 }),
  die: () => { KIT.noise(0.3, { vol: 0.16, lp: 1200 }); KIT.arp([392, 330, 262, 196], 0.14, { type: 'triangle', vol: 0.08, dur: 0.24, delay: 0.15 }); },
  spawn: () => KIT.tone(1046, 0.1, { type: 'sine', vol: 0.04 })
};

// ---------------- 地图 ----------------
const key = (x, y) => x + ',' + y;
const MAZES = [
  () => { const s = []; for (let i = 0; i < 5; i++) { s.push([3 + i, 3], [3, 3 + i], [16 - i, 3], [16, 3 + i], [3 + i, 16], [3, 16 - i], [16 - i, 16], [16, 16 - i]); } return s; },
  () => { const s = []; for (let i = 2; i < 18; i++) { if (i < 8 || i > 11) { s.push([i, 9], [i, 10]); } } return s; },
  () => { const s = []; for (let i = 0; i < 12; i++) { s.push([4 + i, 6], [4 + i, 13]); } return s; },
  () => { const s = []; for (let i = 5; i < 15; i++) { if (i !== 9 && i !== 10) s.push([i, 5], [i, 14], [5, i], [14, i]); } return s; },
  () => { const s = []; for (let y = 2; y < 18; y += 5) for (let x = 2; x < 18; x += 5) s.push([x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]); return s; }
];
function loadMaze(i) {
  rocks = new Set();
  if (gm !== 'maze') return;
  const head = snake[0];
  const safe = new Set(snake.map(s => key(s.x, s.y)));
  for (let k = 1; k <= 4; k++) safe.add(key(head.x + DIRS[dir][0] * k, head.y + DIRS[dir][1] * k));
  MAZES[i % MAZES.length]().forEach(([x, y]) => { if (!safe.has(key(x, y))) rocks.add(key(x, y)); });
}

function freeCell() {
  const taken = new Set(snake.map(s => key(s.x, s.y)));
  rocks.forEach(k => taken.add(k));
  if (apple) taken.add(key(apple.x, apple.y));
  if (extra) taken.add(key(extra.x, extra.y));
  const free = [];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (!taken.has(key(x, y))) free.push({ x, y });
  return free.length ? free[(Math.random() * free.length) | 0] : null;
}

// ---------------- 流程 ----------------
function newGame() {
  snake = [];
  for (let i = 0; i < 4; i++) snake.push({ x: 7 - i, y: 10 });
  prev = snake.map(s => ({ ...s }));
  dir = 'right'; queue = []; grow = 0;
  score = 0; apples = 0; slowT = 0; playT = 0; mapIdx = 0; acc = 0;
  stepMs = SPEEDS[sp];
  extra = null; apple = null;
  loadMaze(0);
  apple = freeCell();
  parts.clear();
  bestAtStart = store.get('best-' + gm, 0);
  state = 'ready';
  hideScreens();
  KIT.music('arcade-run');
}

function input(d) {
  if (state === 'menu' || state === 'over' || state === 'dead') return;
  if (state === 'pause') return;
  const lastD = queue.length ? queue[queue.length - 1] : dir;
  if (d === lastD || d === OPP[lastD]) {
    if (state === 'ready' && d !== OPP[dir]) state = 'play';
    return;
  }
  if (queue.length < 3) queue.push(d);
  if (state === 'ready') state = 'play';
}

function step() {
  if (queue.length) { dir = queue.shift(); sfx.turn(); }
  const head = snake[0];
  let nx = head.x + DIRS[dir][0], ny = head.y + DIRS[dir][1];
  if (gm === 'wrap') { nx = (nx + COLS) % COLS; ny = (ny + ROWS) % ROWS; }
  else if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) { die('wall'); return; }
  if (rocks.has(key(nx, ny))) { die('rock'); return; }
  // 尾巴这一拍会离开，所以可以紧跟尾巴走
  const willGrow = grow > 0 || (apple && apple.x === nx && apple.y === ny);
  const body = willGrow ? snake : snake.slice(0, -1);
  if (body.some(s => s.x === nx && s.y === ny)) { die('self'); return; }

  prev = snake.map(s => ({ ...s }));
  snake.unshift({ x: nx, y: ny });
  if (grow > 0) grow--; else snake.pop();

  if (apple && apple.x === nx && apple.y === ny) eatApple();
  if (extra && extra.x === nx && extra.y === ny) eatExtra();
}

function cellCenter(x, y) { return [OX + x * CS + CS / 2, OY + y * CS + CS / 2]; }

function eatApple() {
  apples++; grow++;
  score += 10;
  eatPulse = 1;
  sfx.eat(apples);
  const [px, py] = cellCenter(apple.x, apple.y);
  parts.burst(px, py, { n: 12, color: ['#ef4b4b', '#7cc46d', '#fff'], speed: 150, size: 4, life: 0.5 });
  stepMs = Math.max(62, stepMs - 2.6);
  if (gm === 'maze' && apples % 8 === 0) {
    mapIdx++;
    loadMaze(mapIdx);
    KIT.toast($('toast'), T('newMap'));
  }
  apple = freeCell();
  if (!extra) {
    const r = Math.random();
    if (r < 0.22) spawnExtra('gold');
    else if (r < 0.32 && snake.length > 9) spawnExtra('mush');
    else if (r < 0.4) spawnExtra('ice');
  }
}
function spawnExtra(kind) {
  const c = freeCell();
  if (!c) return;
  extra = { ...c, kind, life: kind === 'gold' ? 6 : 8, max: kind === 'gold' ? 6 : 8 };
  if (kind === 'gold') KIT.toast($('toast'), T('gold'), '#f6c445');
  sfx.spawn();
}
function eatExtra() {
  const e = extra; extra = null;
  const [px, py] = cellCenter(e.x, e.y);
  if (e.kind === 'gold') {
    const pts = Math.max(15, Math.round(50 * e.life / e.max));
    score += pts; grow += 2;
    sfx.gold();
    parts.burst(px, py, { n: 24, color: ['#f6c445', '#fff3c4'], speed: 200, size: 5, life: 0.7, shape: 'square' });
    floatTexts.push({ x: px, y: py, s: '+' + pts, age: 0 });
  } else if (e.kind === 'mush') {
    const cut = Math.min(3, snake.length - 3);
    for (let i = 0; i < cut; i++) {
      const t = snake.pop();
      const [tx, ty] = cellCenter(t.x, t.y);
      parts.burst(tx, ty, { n: 6, color: ['#c98a4a', '#fff'], speed: 90, size: 4, life: 0.5 });
    }
    prev = prev.slice(0, snake.length);
    score += 5;
    sfx.shrink();
    KIT.toast($('toast'), T('shrink'));
  } else {
    slowT = 5;
    sfx.slow();
    KIT.toast($('toast'), T('slow'), '#8fd3f4');
    parts.burst(px, py, { n: 16, color: ['#bfe8ff', '#fff'], speed: 150, size: 4, life: 0.6 });
  }
}
const floatTexts = [];

function die(cause) {
  state = 'dead';
  deathCause = cause;
  deadAt = performance.now();
  shake = 0.4;
  sfx.die();
  KIT.stopMusic();
  const [hx, hy] = cellCenter(snake[0].x, snake[0].y);
  parts.burst(hx, hy, { n: 26, color: ['#f2b84b', '#e0603a', '#fff'], speed: 220, size: 5, life: 0.7 });
  if (score > store.get('best-' + gm, 0)) store.set('best-' + gm, score);
  setTimeout(showOver, 900);
}

// ---------------- 绘制 ----------------
function pal() {
  return KIT.dark()
    ? { bg: '#241b12', a: '#2e2418', b: '#2a2015', border: '#4a3a26', hud: '#f2e7d4', soft: '#a08b6e', head: '#8fd16a', body1: '#6cbf55', body2: '#2f7a46', belly: '#a8e08a', rock: '#6b5a45', rock2: '#4a3d2f' }
    : { bg: '#f6eddc', a: '#eedfc4', b: '#e8d7b9', border: '#d7c19c', hud: '#3a2e24', soft: '#98846c', head: '#5fb84a', body1: '#6cc455', body2: '#2f8a4a', belly: '#c4ef9e', rock: '#a88a66', rock2: '#86694b' };
}

function lerpColor(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = ((pa >> 16) & 255) + ((((pb >> 16) & 255) - ((pa >> 16) & 255)) * t);
  const g = ((pa >> 8) & 255) + ((((pb >> 8) & 255) - ((pa >> 8) & 255)) * t);
  const bl = (pa & 255) + (((pb & 255) - (pa & 255)) * t);
  return `rgb(${r | 0},${g | 0},${bl | 0})`;
}

function segPos(i, t) {
  const c = snake[i], p = prev[i] || prev[prev.length - 1] || c;
  if (Math.abs(c.x - p.x) > 1 || Math.abs(c.y - p.y) > 1) return cellCenter(c.x, c.y); // 穿墙瞬移不插值
  return cellCenter(p.x + (c.x - p.x) * t, p.y + (c.y - p.y) * t);
}

function draw(now, dt) {
  const P = pal();
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake * 16, (Math.random() - 0.5) * shake * 16);
  ctx.fillStyle = P.bg; ctx.fillRect(-10, -10, W + 20, H + 20);
  // 棋盘格
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    ctx.fillStyle = (x + y) % 2 ? P.a : P.b;
    ctx.fillRect(OX + x * CS, OY + y * CS, CS, CS);
  }
  ctx.strokeStyle = gm === 'wrap' ? P.soft : P.border;
  ctx.lineWidth = gm === 'wrap' ? 2 : 5;
  if (gm === 'wrap') ctx.setLineDash([8, 8]);
  ctx.strokeRect(OX - 2, OY - 2, COLS * CS + 4, ROWS * CS + 4);
  ctx.setLineDash([]);

  // 障碍
  rocks.forEach(k => {
    const [x, y] = k.split(',').map(Number);
    const px = OX + x * CS, py = OY + y * CS;
    ctx.fillStyle = P.rock2; KIT.roundRect(ctx, px + 1, py + 2, CS - 2, CS - 2, 5); ctx.fill();
    ctx.fillStyle = P.rock; KIT.roundRect(ctx, px + 1, py + 1, CS - 2, CS - 4, 5); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(px + 4, py + 4, CS - 10, 3);
  });

  // 食物
  const bob = Math.sin(now / 200) * 1.5;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (apple) {
    const [ax, ay] = cellCenter(apple.x, apple.y);
    ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.beginPath(); ctx.ellipse(ax, ay + 10, 8, 3, 0, 0, 7); ctx.fill();
    ctx.font = '20px system-ui, "Apple Color Emoji", sans-serif';
    ctx.fillStyle = '#000';
    ctx.fillText('🍎', ax, ay + bob);
  }
  if (extra) {
    const [ex, ey] = cellCenter(extra.x, extra.y);
    const k = extra.life / extra.max;
    ctx.strokeStyle = extra.kind === 'gold' ? '#f6c445' : extra.kind === 'ice' ? '#8fd3f4' : '#c98a4a';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(ex, ey, 14, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); ctx.stroke();
    if (k > 0.3 || Math.floor(now / 120) % 2) {
      ctx.font = '19px system-ui, "Apple Color Emoji", sans-serif';
      ctx.fillStyle = '#000';
      ctx.fillText({ gold: '🌟', mush: '🍄', ice: '❄️' }[extra.kind], ex, ey + bob);
    }
  }

  drawSnake(now, P);
  parts.update(dt); parts.draw(ctx);
  for (let i = floatTexts.length - 1; i >= 0; i--) {
    const f = floatTexts[i];
    f.age += dt;
    if (f.age > 1) { floatTexts.splice(i, 1); continue; }
    ctx.globalAlpha = 1 - f.age;
    ctx.font = '400 22px "AMG Display", system-ui, sans-serif';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(40,28,16,.6)'; ctx.strokeText(f.s, f.x, f.y - f.age * 30);
    ctx.fillStyle = '#f6c445'; ctx.fillText(f.s, f.x, f.y - f.age * 30);
    ctx.globalAlpha = 1;
  }
  if (slowT > 0) { ctx.fillStyle = `rgba(143,211,244,${0.08 + Math.sin(now / 200) * 0.03})`; ctx.fillRect(OX, OY, COLS * CS, ROWS * CS); }
  ctx.restore();

  drawHud(P);
  if (state === 'ready') {
    ctx.fillStyle = 'rgba(0,0,0,.0)';
    ctx.font = '700 15px "PingFang SC", system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillStyle = P.hud; ctx.globalAlpha = 0.55 + Math.sin(now / 250) * 0.35;
    ctx.fillText(T('ready'), W / 2, OY + ROWS * CS * 0.72);
    ctx.globalAlpha = 1;
  }
}

function drawSnake(now, P) {
  if (!snake.length) return;
  const t = state === 'play' ? Math.min(1, acc / curStep()) : (state === 'ready' || state === 'menu' ? 1 : 1);
  const pts = snake.map((_, i) => segPos(i, t));
  // 吃到尾巴还在原地：额外补一节让尾巴平滑
  const n = pts.length;
  const dead = state === 'dead' || state === 'over';
  const fade = dead ? Math.min(1, (performance.now() - deadAt) / 600) : 0;
  const width = CS * 0.78;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let i = n - 1; i > 0; i--) {
    const a = pts[i], b = pts[i - 1];
    if (Math.abs(a[0] - b[0]) > CS * 1.5 || Math.abs(a[1] - b[1]) > CS * 1.5) continue;
    const k = i / Math.max(1, n - 1);
    ctx.strokeStyle = dead ? lerpColor(k < 0.5 ? P.body1 : P.body2, '#8a7f74', fade) : lerpColor(P.body1, P.body2, k);
    ctx.lineWidth = width * (1 - k * 0.35);
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
  }
  // 背部花纹
  for (let i = 2; i < n; i += 3) {
    const k = i / n;
    ctx.fillStyle = 'rgba(255,255,255,.18)';
    ctx.beginPath(); ctx.arc(pts[i][0], pts[i][1], width * 0.18 * (1 - k * 0.4), 0, 7); ctx.fill();
  }
  // 头
  const [hx, hy] = pts[0];
  const d = DIRS[dir];
  const ang = Math.atan2(d[1], d[0]);
  const pulse = eatPulse * 0.25;
  ctx.save(); ctx.translate(hx, hy); ctx.rotate(ang);
  ctx.fillStyle = dead ? '#8a7f74' : P.head;
  ctx.beginPath(); ctx.ellipse(1, 0, CS * 0.5 * (1 + pulse), CS * 0.44 * (1 + pulse), 0, 0, 7); ctx.fill();
  // 舌头
  if (!dead && Math.floor(now / 900) % 3 === 0 && (now % 900) < 260) {
    ctx.strokeStyle = '#e0483a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(CS * 0.5, 0); ctx.lineTo(CS * 0.78, 0); ctx.lineTo(CS * 0.9, -3); ctx.moveTo(CS * 0.78, 0); ctx.lineTo(CS * 0.9, 3); ctx.stroke();
  }
  // 眼睛
  for (const s of [-1, 1]) {
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(CS * 0.12, s * CS * 0.2, CS * 0.15, 0, 7); ctx.fill();
    if (dead) {
      ctx.strokeStyle = '#2b1d10'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(CS * 0.05, s * CS * 0.2 - 3); ctx.lineTo(CS * 0.19, s * CS * 0.2 + 3); ctx.moveTo(CS * 0.19, s * CS * 0.2 - 3); ctx.lineTo(CS * 0.05, s * CS * 0.2 + 3); ctx.stroke();
    } else {
      ctx.fillStyle = '#2b1d10'; ctx.beginPath(); ctx.arc(CS * 0.17, s * CS * 0.2, CS * 0.075, 0, 7); ctx.fill();
    }
  }
  ctx.fillStyle = 'rgba(255,140,120,.45)';
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(-CS * 0.05, s * CS * 0.33, 2.5, 0, 7); ctx.fill(); }
  ctx.restore();
}

function drawHud(P) {
  const best = Math.max(store.get('best-' + gm, 0), score);
  const items = [[T('hudScore'), score], [T('hudLen'), snake.length], [T('hudBest'), best]];
  items.forEach(([label, v], i) => {
    const x = 18 + i * 120;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = P.soft; ctx.font = '800 10px system-ui, sans-serif';
    ctx.fillText(label, x, 20);
    ctx.fillStyle = P.hud; ctx.font = '400 24px "AMG Display", system-ui, sans-serif';
    ctx.fillText(v, x, 44);
  });
  ctx.textAlign = 'right'; ctx.font = '22px system-ui, "Apple Color Emoji", sans-serif';
  ctx.fillText({ classic: '🧱', wrap: '🌀', maze: '🏯' }[gm] + (slowT > 0 ? ' ❄️' : ''), W - 18, 36);
}

// ---------------- 主循环 ----------------
const curStep = () => stepMs * (slowT > 0 ? 1.6 : 1);
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  shake = Math.max(0, shake - dt);
  eatPulse = Math.max(0, eatPulse - dt * 4);
  if (state === 'play') {
    playT += dt;
    slowT = Math.max(0, slowT - dt);
    if (extra) { extra.life -= dt; if (extra.life <= 0) extra = null; }
    acc += dt * 1000;
    let guard = 0;
    while (acc >= curStep() && state === 'play' && guard++ < 4) { acc -= curStep(); step(); }
  }
  draw(now, dt);
  requestAnimationFrame(loop);
}

// ---------------- 界面 ----------------
function hideScreens() { ['screen-menu', 'screen-pause', 'screen-over'].forEach(id => $(id).classList.add('hidden')); }
function showMenu() {
  state = 'menu';
  KIT.stopMusic();
  hideScreens();
  snake = []; for (let i = 0; i < 5; i++) snake.push({ x: 9 - i, y: 14 });
  prev = snake.map(s => ({ ...s })); dir = 'right'; extra = null; apple = { x: 13, y: 14 };
  rocks = new Set();
  renderMenu();
  $('screen-menu').classList.remove('hidden');
}
function renderMenu() {
  document.querySelectorAll('#mode-seg button').forEach(b => b.classList.toggle('on', b.dataset.m === gm));
  document.querySelectorAll('#speed-seg button').forEach(b => b.classList.toggle('on', +b.dataset.s === sp));
  $('mode-desc').textContent = T('modeDesc')[gm];
  $('menu-best').textContent = T('best', store.get('best-' + gm, 0));
}
function showOver() {
  if (state !== 'dead') return;
  state = 'over';
  $('over-title').textContent = deathCause === 'wall' ? T('overWall') : deathCause === 'rock' ? T('overRock') : T('overSelf');
  $('over-record').classList.toggle('hidden', score <= bestAtStart || !score);
  $('over-stats').innerHTML =
    `<span>${T('stScore')}</span><b>${score}</b><span>${T('stLen')}</span><b>${snake.length}</b>` +
    `<span>${T('stApples')}</span><b>${apples}</b><span>${T('stTime')}</span><b>${T('sec', Math.round(playT))}</b>` +
    `<span>${T('stBest')}</span><b>${Math.max(score, store.get('best-' + gm, 0))}</b>`;
  $('screen-over').classList.remove('hidden');
}
function pause(on) {
  if (on && state === 'play') { state = 'pause'; $('screen-pause').classList.remove('hidden'); KIT.stopMusic(); }
  else if (!on && state === 'pause') { state = 'play'; $('screen-pause').classList.add('hidden'); KIT.music('arcade-run'); }
}

document.querySelectorAll('#mode-seg button').forEach(b => b.addEventListener('click', () => {
  gm = b.dataset.m; store.set('mode', gm); KIT.tone(560, 0.06, { type: 'triangle', vol: 0.05 }); renderMenu();
}));
document.querySelectorAll('#speed-seg button').forEach(b => b.addEventListener('click', () => {
  sp = +b.dataset.s; store.set('speed', sp); KIT.tone(500 + sp * 120, 0.06, { type: 'triangle', vol: 0.05 }); renderMenu();
}));
$('btn-start').onclick = newGame;
$('btn-retry').onclick = newGame;
$('btn-menu').onclick = showMenu;
$('btn-quit').onclick = showMenu;
$('btn-resume').onclick = () => pause(false);

const KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right' };
document.addEventListener('keydown', e => {
  if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
  const d = KEYS[e.key];
  if (d) {
    if (state !== 'menu' && state !== 'over') e.preventDefault();
    if (state === 'pause') return;
    input(d); return;
  }
  if (e.key === ' ' || e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
    if (state === 'menu' || state === 'over') { if (e.key === ' ') { e.preventDefault(); newGame(); } return; }
    e.preventDefault();
    pause(state !== 'pause');
  } else if (e.key === 'Enter' && (state === 'menu' || state === 'over')) newGame();
});
KIT.swipe(frame, d => input(d), 18);
document.querySelectorAll('#pad button').forEach(b => b.addEventListener('pointerdown', e => {
  e.preventDefault();
  const d = b.dataset.d;
  if (d === 'pause') { if (state === 'play' || state === 'pause') pause(state !== 'pause'); return; }
  input(d);
}));
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(true); });

const syncMute = KIT.mountMute($('btn-mute'));
KIT.boot(() => { syncMute(); renderMenu(); });
showMenu();
requestAnimationFrame(loop);
})();
