(() => {
// 贪吃蛇：网格移动 + 吃食加速 + 撞墙/自撞结束
const STR = window.GAME_STR || { zh: {}, en: {} };
const T = (k, ...a) => AMG.tf(STR, k, ...a);
const W = 480, H = 620, COLS = 20, ROWS = 20, BX = 40, BY = 170, CELL = 20;
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const $ = id => document.getElementById(id);
const dpr = Math.min(window.devicePixelRatio || 1, 2);
canvas.width = W * dpr; canvas.height = H * dpr;
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

const store = {
  get best() { return +(localStorage.getItem('snk-best') || 0); },
  set best(v) { localStorage.setItem('snk-best', v); },
  get muted() { return localStorage.getItem('snk-muted') === '1'; },
  set muted(v) { localStorage.setItem('snk-muted', v ? '1' : '0'); }
};
let actx = null, muted = store.muted;
function tone(f, dur, type, vol) {
  if (muted) return;
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type || 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(vol || .07, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(.001, actx.currentTime + dur);
    o.connect(g); g.connect(actx.destination); o.start(); o.stop(actx.currentTime + dur);
  } catch (e) {}
}
const sfx = {
  eat: () => tone(660, .08, 'sine', .09),
  star: () => [880, 1175].forEach((f, i) => setTimeout(() => tone(f, .1, 'sine', .09), i * 80)),
  over: () => [400, 300, 180].forEach((f, i) => setTimeout(() => tone(f, .2, 'sine', .09), i * 140)),
  turn: () => tone(220, .03, 'sine', .03)
};

const G = {
  state: 'menu', snake: [], dir: 2, nextDir: 2, score: 0,
  food: null, star: null, starT: 0, tick: 0, interval: .21, grow: 0, bump: 0
};
const DIRS = [{ x: -1, y: 0 }, { x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }];

function reset() {
  const cy = ROWS >> 1;
  G.snake = [{ x: 6, y: cy }, { x: 5, y: cy }, { x: 4, y: cy }];
  G.dir = G.nextDir = 2; G.score = 0; G.tick = 0;
  G.interval = .21; G.grow = 0; G.bump = 0; G.star = null;
  placeFood();
}
function freeCells() {
  const used = new Set(G.snake.map(s => s.x + ',' + s.y));
  const out = [];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++)
    if (!used.has(x + ',' + y)) out.push({ x, y });
  return out;
}
function placeFood() {
  const e = freeCells();
  if (!e.length) { G.food = null; return; }
  G.food = e[Math.random() * e.length | 0];
}
function placeStar() {
  const e = freeCells().filter(c => !(G.food && c.x === G.food.x && c.y === G.food.y));
  if (!e.length) return;
  G.star = e[Math.random() * e.length | 0];
  G.starT = 6;
}
function step() {
  G.dir = G.nextDir;
  const d = DIRS[G.dir];
  const head = { x: G.snake[0].x + d.x, y: G.snake[0].y + d.y };
  // 撞墙 / 撞自己
  if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS ||
      G.snake.some(s => s.x === head.x && s.y === head.y)) {
    return die();
  }
  G.snake.unshift(head);
  if (G.food && head.x === G.food.x && head.y === G.food.y) {
    G.score += 10; G.grow += 1; sfx.eat();
    G.interval = Math.max(.08, G.interval * .99);
    placeFood();
    if (Math.random() < .18 && !G.star) placeStar();
  }
  if (G.star && head.x === G.star.x && head.y === G.star.y) {
    G.score += 50; G.star = null; sfx.star();
  }
  if (G.grow > 0) G.grow--;
  else G.snake.pop();
  if (G.score > store.best) store.best = G.score;
}
function die() {
  G.state = 'over'; G.bump = .4; sfx.over();
  $('over-title').textContent = T('overTitle');
  $('over-sub').textContent = T('overSub', G.score, G.snake.length);
  setTimeout(() => showScreen('over'), 500);
}
function showScreen(name) {
  for (const k of ['screen-menu', 'screen-over'])
    $(k).classList.toggle('hidden', k !== 'screen-' + name);
  if (!name) for (const k of ['screen-menu', 'screen-over']) $(k).classList.add('hidden');
}
function startGame() {
  reset();
  G.state = 'play';
  showScreen(null);
}
const KEYS = { ArrowLeft: 0, KeyA: 0, ArrowUp: 1, KeyW: 1, ArrowRight: 2, KeyD: 2, ArrowDown: 3, KeyS: 3 };
window.addEventListener('keydown', e => {
  if (e.code in KEYS) {
    e.preventDefault();
    const nd = KEYS[e.code];
    // 禁止 180° 掉头
    if (G.state === 'play' && (nd + 2) % 4 !== G.dir) { G.nextDir = nd; sfx.turn(); }
  }
  else if (e.code === 'KeyM') toggleMute();
  else if (e.code === 'KeyP') togglePause();
  else if (e.code === 'KeyR' || e.code === 'Enter' || e.code === 'Space') {
    e.preventDefault();
    if (G.state === 'over' || G.state === 'menu') startGame();
  }
  else if (e.code === 'Escape') {
    if (G.state === 'play' || G.state === 'pause') togglePause();
    else { G.state = 'menu'; showScreen('menu'); }
  }
});
function togglePause() {
  if (G.state === 'play') G.state = 'pause';
  else if (G.state === 'pause') G.state = 'play';
}
let touchS = null;
canvas.addEventListener('pointerdown', e => {
  const r = canvas.getBoundingClientRect();
  touchS = [(e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H];
});
canvas.addEventListener('pointerup', e => {
  if (!touchS) return;
  const r = canvas.getBoundingClientRect();
  const dx = (e.clientX - r.left) / r.width * W - touchS[0];
  const dy = (e.clientY - r.top) / r.height * H - touchS[1];
  touchS = null;
  if (Math.hypot(dx, dy) < 20) {
    // 点按 = 朝点击方向转（相对蛇头）
    return;
  }
  const nd = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 2 : 0) : (dy > 0 ? 3 : 1);
  if (G.state === 'play' && (nd + 2) % 4 !== G.dir) { G.nextDir = nd; sfx.turn(); }
});
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

function rr(x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
}
let t0 = 0;
function render(now) {
  t0 = now / 1000;
  ctx.fillStyle = '#14261a'; ctx.fillRect(0, 0, W, H);
  // HUD
  ctx.fillStyle = '#f9f6f2'; ctx.textAlign = 'left';
  ctx.font = '900 20px system-ui'; ctx.fillText('SCORE', 40, 50);
  ctx.font = '900 30px system-ui'; ctx.fillStyle = '#a3e635';
  ctx.fillText(G.score, 40, 84);
  ctx.fillStyle = '#f9f6f2'; ctx.font = '900 20px system-ui'; ctx.textAlign = 'right';
  ctx.fillText('BEST', W - 40, 50);
  ctx.font = '900 30px system-ui'; ctx.fillStyle = '#a3e635';
  ctx.fillText(Math.max(store.best, G.score), W - 40, 84);
  // 棋盘
  const shake = G.bump > 0 ? Math.sin(t0 * 50) * 4 * G.bump : 0;
  ctx.save(); ctx.translate(shake, 0);
  ctx.fillStyle = '#1e3a24'; rr(BX - 4, BY - 4, COLS * CELL + 8, ROWS * CELL + 8, 12); ctx.fill();
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    ctx.fillStyle = (x + y) % 2 ? '#234a2b' : '#1f4227';
    ctx.fillRect(BX + x * CELL, BY + y * CELL, CELL, CELL);
  }
  // 食物
  if (G.food) {
    const pulse = 1 + Math.sin(t0 * 6) * .12;
    const cx = BX + G.food.x * CELL + CELL / 2, cy = BY + G.food.y * CELL + CELL / 2;
    ctx.fillStyle = '#ef4444';
    ctx.beginPath(); ctx.arc(cx, cy, CELL * .36 * pulse, 0, 7); ctx.fill();
    ctx.fillStyle = '#22c55e';
    ctx.beginPath(); ctx.arc(cx + 3, cy - CELL * .32, 3, 0, 7); ctx.fill();
  }
  // 星星奖励
  if (G.star) {
    const cx = BX + G.star.x * CELL + CELL / 2, cy = BY + G.star.y * CELL + CELL / 2;
    ctx.font = CELL * .8 + 'px system-ui'; ctx.textAlign = 'center';
    ctx.fillText('⭐', cx, cy + CELL * .3);
  }
  // 蛇
  G.snake.forEach((s, i) => {
    const px = BX + s.x * CELL, py = BY + s.y * CELL;
    const k = 1 - i / Math.max(1, G.snake.length);
    ctx.fillStyle = i === 0 ? '#84cc16' : `hsl(${95 + k * 20},${60 + k * 15}%,${38 + k * 18}%)`;
    rr(px + 1, py + 1, CELL - 2, CELL - 2, i === 0 ? 7 : 5); ctx.fill();
    if (i === 0) {
      // 眼睛
      const d = DIRS[G.dir];
      const cx = px + CELL / 2, cy = py + CELL / 2;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(cx + d.x * 4 - d.y * 4, cy + d.y * 4 - d.x * 4, 3, 0, 7);
      ctx.arc(cx + d.x * 4 + d.y * 4, cy + d.y * 4 + d.x * 4, 3, 0, 7);
      ctx.fill();
      ctx.fillStyle = '#1a2e1a';
      ctx.beginPath();
      ctx.arc(cx + d.x * 5 - d.y * 4, cy + d.y * 5 - d.x * 4, 1.6, 0, 7);
      ctx.arc(cx + d.x * 5 + d.y * 4, cy + d.y * 5 + d.x * 4, 1.6, 0, 7);
      ctx.fill();
    }
  });
  ctx.restore();
  if (G.state === 'pause') {
    ctx.fillStyle = 'rgba(10,20,12,.6)'; ctx.fillRect(BX, BY, COLS * CELL, ROWS * CELL);
    ctx.fillStyle = '#fff'; ctx.font = '900 32px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(T('paused'), W / 2, BY + COLS * CELL / 2);
  }
}
let last = performance.now();
function loop(now) {
  const dt = Math.min(((now || performance.now()) - last) / 1000, .05);
  last = now || performance.now();
  if (G.state === 'play') {
    G.tick += dt;
    if (G.starT > 0) { G.starT -= dt; if (G.starT <= 0) G.star = null; }
    while (G.tick >= G.interval && G.state === 'play') {
      G.tick -= G.interval;
      step();
    }
  }
  if (G.bump > 0) G.bump -= dt;
  render(now || performance.now());
  requestAnimationFrame(loop);
}
reset();
requestAnimationFrame(t => { last = t; requestAnimationFrame(loop); });
window.__game = G;
window.__gameErrors = [];
window.addEventListener('error', e => window.__gameErrors.push(String(e.message)));
})();
