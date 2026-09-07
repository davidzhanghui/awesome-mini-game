(() => {
// 宝石消除：8x8 交换消除 + 连锁倍率 + 目标闯关 + 无步洗牌
const STR = window.GAME_STR || { zh: {}, en: {} };
const T = (k, ...a) => AMG.tf(STR, k, ...a);
const W = 480, H = 640, N = 8, BX = 48, BY = 150, BS = 384;
const CS = BS / N;
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const $ = id => document.getElementById(id);
const dpr = Math.min(window.devicePixelRatio || 1, 2);
canvas.width = W * dpr; canvas.height = H * dpr;
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

const GEMS = [
  { c: '#ff5d5d', e: '🔴' }, { c: '#ffd93d', e: '🟡' }, { c: '#3a8dde', e: '🔵' },
  { c: '#5ee66e', e: '🟢' }, { c: '#c86bff', e: '🟣' }, { c: '#ff8c42', e: '🟠' }
];
// 关卡：目标分数 + 步数 + 宝石种类
const STAGES = [
  { goal: 600, moves: 25, kinds: 5 }, { goal: 1200, moves: 25, kinds: 5 },
  { goal: 2000, moves: 24, kinds: 5 }, { goal: 2800, moves: 24, kinds: 6 },
  { goal: 4000, moves: 23, kinds: 6 },
  { goal: 3500, moves: 99, kinds: 6, time: 90 },
  { goal: 5000, moves: 99, kinds: 6, time: 75 },
  { goal: 7000, moves: 99, kinds: 6, time: 60 }
];
const store = {
  get best() { return +(localStorage.getItem('match3-best') || 0); },
  set best(v) { localStorage.setItem('match3-best', v); },
  get muted() { return localStorage.getItem('match3-muted') === '1'; },
  set muted(v) { localStorage.setItem('match3-muted', v ? '1' : '0'); }
};
let actx = null, muted = store.muted;
function tone(f, dur, type, vol) {
  if (muted) return;
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type || 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(vol || .08, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(.001, actx.currentTime + dur);
    o.connect(g); g.connect(actx.destination); o.start(); o.stop(actx.currentTime + dur);
  } catch (e) {}
}
const sfx = {
  swap: () => tone(440, .06, 'sine', .07),
  pop: n => tone(600 + Math.min(n, 6) * 100, .12, 'sine', .09),
  bad: () => tone(180, .12, 'square', .08),
  win: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, .14, 'sine', .09), i * 100)),
  over: () => [400, 300, 200].forEach((f, i) => setTimeout(() => tone(f, .2, 'sine', .09), i * 140))
};
const G = {
  state: 'menu', stage: 1, score: 0, movesLeft: 0, kinds: 5,
  grid: [], sel: null, busy: false, parts: [], floats: [], hintT: 0,
  hint: null, idleT: 0, timeLeft: 0, timed: false, animT: 0, msg: '', msgT: 0
};
function rnd() { return Math.random() * G.kinds | 0; }
function reset(stage) {
  G.stage = stage;
  const st = STAGES[Math.min(stage, STAGES.length) - 1];
  G.score = 0; G.movesLeft = st.moves; G.kinds = st.kinds;
  G.timed = !!st.time; G.timeLeft = st.time || 0;
  G.sel = null; G.busy = false; G.parts = []; G.floats = []; G.hint = null; G.idleT = 0;
  do {
    G.grid = Array.from({ length: N }, () => Array.from({ length: N }, () => rnd()));
  } while (findMatches().length || !hasMove());
}
function findMatches() {
  const out = [];
  const mark = Array.from({ length: N }, () => new Array(N).fill(false));
  for (let y = 0; y < N; y++) {
    let x = 0;
    while (x < N) {
      const v = G.grid[y][x];
      let len = 1;
      while (x + len < N && G.grid[y][x + len] === v) len++;
      if (v >= 0 && len >= 3) for (let k = 0; k < len; k++) mark[y][x + k] = len;
      x += Math.max(1, len);
    }
  }
  for (let x = 0; x < N; x++) {
    let y = 0;
    while (y < N) {
      const v = G.grid[y][x];
      let len = 1;
      while (y + len < N && G.grid[y + len][x] === v) len++;
      if (v >= 0 && len >= 3) for (let k = 0; k < len; k++) mark[y + k][x] = Math.max(mark[y + k][x], len);
      y += Math.max(1, len);
    }
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (mark[y][x]) out.push([x, y, mark[y][x]]);
  return out;
}
function hasMove() {
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx >= N || ny >= N) continue;
      [G.grid[y][x], G.grid[ny][nx]] = [G.grid[ny][nx], G.grid[y][x]];
      const m = findMatches().length > 0;
      [G.grid[y][x], G.grid[ny][nx]] = [G.grid[ny][nx], G.grid[y][x]];
      if (m) return true;
    }
  }
  return false;
}
function shuffle() {
  for (let t = 0; t < 48; t++) {
    const vals = G.grid.flat();
    for (let i = vals.length - 1; i > 0; i--) {
      const j = Math.random() * (i + 1) | 0;
      [vals[i], vals[j]] = [vals[j], vals[i]];
    }
    G.grid = Array.from({ length: N }, (_, y) => vals.slice(y * N, (y + 1) * N));
    if (!findMatches().length && hasMove()) { flash(T('shuffleMsg')); return; }
  }
  do {
    G.grid = Array.from({ length: N }, () => Array.from({ length: N }, () => rnd()));
  } while (findMatches().length || !hasMove());
  flash(T('shuffleMsg'));
}
function findHint() {
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx >= N || ny >= N) continue;
      [G.grid[y][x], G.grid[ny][nx]] = [G.grid[ny][nx], G.grid[y][x]];
      const ok = findMatches().length > 0;
      [G.grid[y][x], G.grid[ny][nx]] = [G.grid[ny][nx], G.grid[y][x]];
      if (ok) return [[x, y], [nx, ny]];
    }
  }
  return null;
}
async function swap(a, b) {
  if (G.busy || G.state !== 'play') return false;
  const [ax, ay] = a, [bx, by] = b;
  if (Math.abs(ax - bx) + Math.abs(ay - by) !== 1) return false;
  G.busy = true;
  [G.grid[ay][ax], G.grid[by][bx]] = [G.grid[by][bx], G.grid[ay][ax]];
  sfx.swap();
  await wait(140);
  if (!findMatches().length) {
    [G.grid[ay][ax], G.grid[by][bx]] = [G.grid[by][bx], G.grid[ay][ax]];
    sfx.bad();
    G.busy = false;
    return false;
  }
  G.movesLeft--;
  G.hint = null; G.idleT = 0;
  await resolve(1);
  G.busy = false;
  if (G.score >= goal()) return stageClear();
  if (!G.timed && G.movesLeft <= 0) return stageFail();
  if (!hasMove()) shuffle();
  return true;
}
async function resolve(chain) {
  for (;;) {
    const ms = findMatches();
    if (!ms.length) break;
    const n = ms.length;
    const maxLen = Math.max(...ms.map(m => m[2]));
    const pts = n * 10 * chain + (maxLen >= 5 ? 80 * chain : maxLen >= 4 ? 30 * chain : 0);
    for (const [x, y] of ms) {
      burst(BX + x * CS + CS / 2, BY + y * CS + CS / 2, G.grid[y][x]);
      G.grid[y][x] = -1;
    }
    G.score += pts;
    float(W / 2, BY - 20, T('chainFloat', pts, chain));
    sfx.pop(ms.length + chain);
    await wait(220);
    collapse();
    await wait(180);
    chain++;
  }
}
function collapse() {
  for (let x = 0; x < N; x++) {
    let w = N - 1;
    for (let y = N - 1; y >= 0; y--) {
      if (G.grid[y][x] >= 0) { G.grid[w][x] = G.grid[y][x]; w--; }
    }
    for (let y = w; y >= 0; y--) G.grid[y][x] = rnd();
  }
}
function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
function goal() { return STAGES[Math.min(G.stage, STAGES.length) - 1].goal; }
function stageClear() {
  G.state = 'clear';
  const bonus = G.movesLeft * 50;
  G.score += bonus;
  if (G.score > store.best) store.best = G.score;
  sfx.win();
  $('clear-lv').textContent = G.stage;
  $('clear-stats').innerHTML = T('clearStats', G.score, bonus);
  setTimeout(() => showScreen('clear'), 400);
}
function stageFail() {
  G.state = 'over';
  sfx.over();
  $('over-title').textContent = G.timed ? T('failTimed') : T('failMoves');
  $('over-sub').innerHTML = T('failSub', G.stage, goal(), G.score);
  setTimeout(() => showScreen('over'), 400);
}
function flash(m) { G.msg = m; G.msgT = 2; }
function showScreen(name) {
  for (const k of ['screen-menu', 'screen-over', 'screen-clear'])
    $(k).classList.toggle('hidden', k !== 'screen-' + name);
  if (!name) for (const k of ['screen-menu', 'screen-over', 'screen-clear']) $(k).classList.add('hidden');
}
function startGame(stage) {
  reset(stage || 1);
  G.state = 'play';
  showScreen(null);
  $('menu-best').textContent = T('best', Math.max(store.best, G.score));
}
function burst(x, y, kind) {
  for (let i = 0; i < 8; i++) {
    const a = Math.random() * 6.28, sp = 60 + Math.random() * 160;
    G.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, age: 0, life: .5, c: GEMS[kind].c });
  }
}
function float(x, y, text) { G.floats.push({ x, y, text, age: 0 }); }

function cellAt(px, py) {
  const x = Math.floor((px - BX) / CS), y = Math.floor((py - BY) / CS);
  if (x < 0 || y < 0 || x >= N || y >= N) return null;
  return [x, y];
}
let dragFrom = null;
canvas.addEventListener('pointerdown', e => {
  if (G.state !== 'play' || G.busy) return;
  const r = canvas.getBoundingClientRect();
  const c = cellAt((e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H);
  if (c) dragFrom = c;
});
canvas.addEventListener('pointerup', e => {
  if (!dragFrom || G.state !== 'play' || G.busy) { dragFrom = null; return; }
  const r = canvas.getBoundingClientRect();
  const c = cellAt((e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H);
  const from = dragFrom;
  dragFrom = null;
  if (!c) return;
  if (c[0] === from[0] && c[1] === from[1]) {
    // 点击：选中/交换
    if (!G.sel) { G.sel = c; tone(600, .05, 'sine', .06); }
    else if (G.sel[0] === c[0] && G.sel[1] === c[1]) G.sel = null;
    else { const s = G.sel; G.sel = null; swap(s, c); }
  } else {
    swap(from, c);
  }
});
canvas.addEventListener('pointermove', e => {
  if (!dragFrom || G.state !== 'play' || G.busy) return;
  const r = canvas.getBoundingClientRect();
  const c = cellAt((e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H);
  if (c && (c[0] !== dragFrom[0] || c[1] !== dragFrom[1])) {
    const from = dragFrom;
    dragFrom = null;
    swap(from, c);
  }
});
window.addEventListener('keydown', e => {
  if (e.code === 'KeyM') toggleMute();
  else if (e.code === 'KeyP') togglePause();
  else if (e.code === 'KeyR' || e.code === 'Enter') { if (G.state === 'over' || G.state === 'menu') startGame(G.stage); }
  else if (e.code === 'Escape') {
    if (G.state === 'play' || G.state === 'pause') togglePause();
    else { G.state = 'menu'; showScreen('menu'); }
  }
});
function togglePause() {
  if (G.state === 'play') G.state = 'pause';
  else if (G.state === 'pause') G.state = 'play';
}
$('btn-start').onclick = () => startGame(1);
$('btn-retry').onclick = () => startGame(G.stage);
$('btn-next').onclick = () => startGame(Math.min(G.stage + 1, STAGES.length));
$('btn-menu').onclick = () => { G.state = 'menu'; showScreen('menu'); };
$('btn-menu2').onclick = () => { G.state = 'menu'; showScreen('menu'); };
function toggleMute() {
  muted = !muted; store.muted = muted;
  $('btn-mute').textContent = muted ? '🔇' : '🔊';
}
$('btn-mute').onclick = toggleMute;
$('btn-mute').textContent = muted ? '🔇' : '🔊';
// i18n boot: static DOM + dynamic boot texts
window.__refreshLang = function () {
  AMG.apply(STR);
  $('btn-mute').title = T('muteTitle');
  $('menu-best').textContent = T('best', store.best);
};
AMG.mountBtn();
window.__refreshLang();

function drawGem(x, y, kind) {
  const cx = BX + x * CS + CS / 2, cy = BY + y * CS + CS / 2, r = CS / 2 - 5;
  const g = ctx.createRadialGradient(cx - r * .3, cy - r * .35, 2, cx, cy, r);
  g.addColorStop(0, '#fff');
  g.addColorStop(.4, GEMS[kind].c);
  g.addColorStop(1, GEMS[kind].c);
  ctx.fillStyle = g;
  ctx.beginPath();
  // 菱形宝石
  ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r * .85, cy);
  ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r * .85, cy);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.8)';
  ctx.beginPath();
  ctx.moveTo(cx, cy - r * .45); ctx.lineTo(cx + r * .3, cy - r * .05);
  ctx.lineTo(cx, cy + r * .1); ctx.lineTo(cx - r * .3, cy - r * .05);
  ctx.closePath(); ctx.fill();
}
function render(dt) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#1c2456'); g.addColorStop(1, '#0c1030');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  if (G.state === 'menu') return;
  // HUD
  ctx.fillStyle = 'rgba(0,0,0,.4)';
  ctx.fillRect(0, 0, W, 110);
  ctx.fillStyle = '#fff'; ctx.font = '900 14px system-ui'; ctx.textAlign = 'left';
  ctx.fillText(T('hudStage', G.stage, goal()), 16, 26);
  ctx.font = '900 22px system-ui'; ctx.fillStyle = '#ffd93d';
  ctx.fillText(G.score, 16, 54);
  // 目标进度条
  ctx.fillStyle = 'rgba(255,255,255,.15)';
  ctx.fillRect(16, 64, W - 32, 10);
  ctx.fillStyle = '#5ee66e';
  ctx.fillRect(16, 64, (W - 32) * Math.min(1, G.score / goal()), 10);
  ctx.textAlign = 'right'; ctx.fillStyle = '#fff'; ctx.font = '900 16px system-ui';
  ctx.fillText(G.timed ? T('hudTime', Math.ceil(Math.max(0, G.timeLeft))) : T('hudMoves', G.movesLeft), W - 16, 30);
  ctx.fillText('BEST ' + Math.max(store.best, G.score), W - 16, 54);
  // 棋盘
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.fillRect(BX - 6, BY - 6, BS + 12, BS + 12);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    ctx.fillStyle = (x + y) % 2 ? 'rgba(255,255,255,.04)' : 'rgba(255,255,255,.08)';
    ctx.fillRect(BX + x * CS, BY + y * CS, CS, CS);
    if (G.grid[y] && G.grid[y][x] >= 0) drawGem(x, y, G.grid[y][x]);
  }
  if (G.sel) {
    ctx.strokeStyle = '#ffd93d'; ctx.lineWidth = 3;
    ctx.strokeRect(BX + G.sel[0] * CS + 2, BY + G.sel[1] * CS + 2, CS - 4, CS - 4);
  }
  if (G.hint && G.state === 'play') {
    const pulse = .45 + Math.sin(performance.now() / 180) * .35;
    ctx.strokeStyle = 'rgba(94,230,110,' + pulse + ')'; ctx.lineWidth = 3;
    for (const [x, y] of G.hint) ctx.strokeRect(BX + x * CS + 3, BY + y * CS + 3, CS - 6, CS - 6);
  }
  for (const p of G.parts) {
    ctx.globalAlpha = Math.max(0, 1 - p.age / p.life);
    ctx.fillStyle = p.c;
    ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center';
  for (const f of G.floats) {
    ctx.globalAlpha = Math.max(0, 1 - f.age);
    ctx.font = '900 22px system-ui';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.6)';
    ctx.strokeText(f.text, f.x, f.y);
    ctx.fillStyle = '#ffd93d';
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
  if (G.msgT > 0) {
    ctx.font = '900 22px system-ui'; ctx.textAlign = 'center';
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,.6)';
    ctx.strokeText(G.msg, W / 2, H - 30);
    ctx.fillStyle = '#5ee66e';
    ctx.fillText(G.msg, W / 2, H - 30);
  }
  if (G.state === 'pause') {
    ctx.fillStyle = 'rgba(5,10,25,.55)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff'; ctx.font = '900 32px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(T('paused'), W / 2, H / 2);
  }
}
let last = performance.now();
function loop(now) {
  const dt = Math.min(((now || performance.now()) - last) / 1000, .05);
  last = now || performance.now();
  for (const p of G.parts) { p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 400 * dt; }
  G.parts = G.parts.filter(p => p.age < p.life);
  for (const f of G.floats) { f.age += dt; f.y -= 44 * dt; }
  G.floats = G.floats.filter(f => f.age < 1);
  if (G.msgT > 0) G.msgT -= dt;
  if (G.state === 'play' && !G.busy) {
    if (G.timed) {
      G.timeLeft -= dt;
      if (G.timeLeft <= 0) { G.timeLeft = 0; stageFail(); }
    }
    G.idleT += dt;
    if (G.idleT > 6 && !G.hint) G.hint = findHint();
  }
  render(dt);
  requestAnimationFrame(loop);
}
reset(1);
requestAnimationFrame(t => { last = t; requestAnimationFrame(loop); });
window.__game = G;
window.__gameErrors = [];
window.addEventListener('error', e => window.__gameErrors.push(String(e.message)));
G._swap = swap; G._start = startGame; G._find = findMatches; G._has = hasMove; G._reset = reset;
})();
