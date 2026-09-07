(() => {
// 2048：标准规则 + 滑动合并动画 + 胜利可继续
const STR = window.GAME_STR || { zh: {}, en: {} };
const T = (k, ...a) => AMG.tf(STR, k, ...a);
const W = 480, H = 620, N = 4, BX = 40, BY = 170, BS = 400, GAP = 10;
const CS = (BS - GAP * 5) / 4;
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const $ = id => document.getElementById(id);
const dpr = Math.min(window.devicePixelRatio || 1, 2);
canvas.width = W * dpr; canvas.height = H * dpr;
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

const store = {
  get best() { return +(localStorage.getItem('t48-best') || 0); },
  set best(v) { localStorage.setItem('t48-best', v); },
  get muted() { return localStorage.getItem('t48-muted') === '1'; },
  set muted(v) { localStorage.setItem('t48-muted', v ? '1' : '0'); }
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
  move: () => tone(330, .05, 'sine', .06),
  merge: big => tone(big ? 880 : 660, .1, 'sine', .09),
  win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => tone(f, .15, 'sine', .09), i * 100)),
  over: () => [400, 300, 200].forEach((f, i) => setTimeout(() => tone(f, .2, 'sine', .09), i * 140))
};
const TCOL = {
  2: ['#eee4da', '#776e65'], 4: ['#ede0c8', '#776e65'], 8: ['#f2b179', '#f9f6f2'],
  16: ['#f59563', '#f9f6f2'], 32: ['#f67c5f', '#f9f6f2'], 64: ['#f65e3b', '#f9f6f2'],
  128: ['#edcf72', '#f9f6f2'], 256: ['#edcc61', '#f9f6f2'], 512: ['#edc850', '#f9f6f2'],
  1024: ['#edc53f', '#f9f6f2'], 2048: ['#edc22e', '#f9f6f2']
};
function colFor(v) {
  if (TCOL[v]) return TCOL[v];
  return ['#3c3a32', '#f9f6f2'];
}
const G = {
  state: 'menu', grid: [], score: 0, won: false, keepGoing: false,
  anims: [], spawnFx: [], msg: '', msgT: 0, moves: 0
};
function reset() {
  G.grid = Array.from({ length: N }, () => new Array(N).fill(0));
  G.score = 0; G.won = false; G.keepGoing = false;
  G.anims = []; G.spawnFx = []; G.moves = 0;
  addRandom(); addRandom();
}
function emptyCells() {
  const out = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (!G.grid[y][x]) out.push([x, y]);
  return out;
}
function addRandom() {
  const e = emptyCells();
  if (!e.length) return false;
  const [x, y] = e[Math.random() * e.length | 0];
  G.grid[y][x] = Math.random() < .9 ? 2 : 4;
  G.spawnFx.push({ x, y, t: 0 });
  return true;
}
function move(dir) {
  const before = G.grid.map(r => r.slice());
  let gained = 0;
  const merges = [];
  const anims = [];
  const next = Array.from({ length: N }, () => new Array(N).fill(0));
  const tracks = [];
  if (dir === 0) for (let y = 0; y < N; y++) tracks.push([0, 1, 2, 3].map(x => [x, y]));
  else if (dir === 2) for (let y = 0; y < N; y++) tracks.push([3, 2, 1, 0].map(x => [x, y]));
  else if (dir === 1) for (let x = 0; x < N; x++) tracks.push([0, 1, 2, 3].map(y => [x, y]));
  else for (let x = 0; x < N; x++) tracks.push([3, 2, 1, 0].map(y => [x, y]));
  for (const track of tracks) {
    const items = [];
    for (const [x, y] of track) if (before[y][x]) items.push({ v: before[y][x], fx: x, fy: y });
    const placed = [];
    for (let i = 0; i < items.length; i++) {
      if (i + 1 < items.length && items[i].v === items[i + 1].v) {
        const v = items[i].v * 2;
        gained += v; merges.push(v);
        placed.push({ v, from: [items[i], items[i + 1]] });
        i++;
      } else placed.push({ v: items[i].v, from: [items[i]] });
    }
    for (let i = 0; i < N; i++) {
      const [tx, ty] = track[i];
      if (i < placed.length) {
        next[ty][tx] = placed[i].v;
        for (const src of placed[i].from) anims.push({ fx: src.fx, fy: src.fy, tx, ty, v: src.v, nv: placed[i].v });
      }
    }
  }
  G.grid = next;
  const moved = JSON.stringify(G.grid) !== JSON.stringify(before);
  return { moved, gained, merges, anims };
}
function doMove(dir) {
  if (G.state !== 'play') return false;
  if (G.anims.length) { G.anims = []; finishMove(); }
  const { moved, gained, merges, anims } = move(dir);
  if (!moved) return false;
  G.moves++;
  G.score += gained;
  if (gained > 0) sfx.merge(merges.some(v => v >= 128));
  else sfx.move();
  if (merges.some(v => v >= 2048) && !G.won) {
    G.won = true;
    sfx.win();
    G.msg = T('winMsg'); G.msgT = 2.5;
  }
  G.anims = anims; G.animT = 0; G._pendingSpawn = true;
  if (G.score > store.best) store.best = G.score;
  return true;
}
function finishMove() {
  if (!G._pendingSpawn) return;
  G._pendingSpawn = false;
  addRandom();
  if (!canMove()) {
    G.state = 'over';
    sfx.over();
    const max = Math.max(...G.grid.flat());
    $('over-title').textContent = T('overTitle');
    $('over-sub').textContent = T('overSub', G.score, max, G.moves);
    setTimeout(() => showScreen('over'), 400);
  }
}
function canMove() {
  if (emptyCells().length) return true;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const v = G.grid[y][x];
    if (x + 1 < N && G.grid[y][x + 1] === v) return true;
    if (y + 1 < N && G.grid[y + 1][x] === v) return true;
  }
  return false;
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
  $('menu-best').textContent = T('best', Math.max(store.best, G.score));
}

const DIRS = { ArrowLeft: 0, KeyA: 0, ArrowUp: 1, KeyW: 1, ArrowRight: 2, KeyD: 2, ArrowDown: 3, KeyS: 3 };
window.addEventListener('keydown', e => {
  if (e.code in DIRS) { e.preventDefault(); if (!e.repeat && G.state === 'play') doMove(DIRS[e.code]); }
  else if (e.code === 'KeyM') toggleMute();
  else if (e.code === 'KeyP') togglePause();
  else if (e.code === 'KeyR' || e.code === 'Enter') { if (G.state === 'over' || G.state === 'menu') startGame(); }
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
  const x = (e.clientX - r.left) / r.width * W, y = (e.clientY - r.top) / r.height * H;
  const dx = x - touchS[0], dy = y - touchS[1];
  touchS = null;
  if (Math.hypot(dx, dy) < 24) return;
  if (Math.abs(dx) > Math.abs(dy)) doMove(dx > 0 ? 2 : 0);
  else doMove(dy > 0 ? 3 : 1);
});
$('btn-start').onclick = () => startGame();
$('btn-retry').onclick = () => startGame();
$('btn-menu').onclick = () => { G.state = 'menu'; showScreen('menu'); $('menu-best').textContent = T('best', store.best); };
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

function cellXY(x, y) {
  return [BX + GAP + x * (CS + GAP), BY + GAP + y * (CS + GAP)];
}
function render(dt) {
  ctx.fillStyle = '#3b3a36'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#f9f6f2'; ctx.textAlign = 'left';
  ctx.font = '900 20px system-ui';
  ctx.fillText('SCORE', 40, 50);
  ctx.font = '900 30px system-ui'; ctx.fillStyle = '#ffd93d';
  ctx.fillText(G.score, 40, 84);
  ctx.fillStyle = '#f9f6f2'; ctx.font = '900 20px system-ui'; ctx.textAlign = 'right';
  ctx.fillText('BEST', W - 40, 50);
  ctx.font = '900 30px system-ui'; ctx.fillStyle = '#ffd93d';
  ctx.fillText(Math.max(store.best, G.score), W - 40, 84);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f9f6f2'; ctx.font = '900 15px system-ui';
  ctx.fillText(T('goal'), W / 2, 50);
  if (G.state === 'menu') return;
  ctx.fillStyle = '#6b6a64';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(BX, BY, BS, BS, 10);
  else ctx.rect(BX, BY, BS, BS);
  ctx.fill();
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const [px, py] = cellXY(x, y);
    ctx.fillStyle = 'rgba(238,228,218,.35)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(px, py, CS, CS, 6);
    else ctx.rect(px, py, CS, CS);
    ctx.fill();
  }
  const sliding = G.anims.length && G.animT < .14;
  const k = sliding ? Math.min(1, G.animT / .14) : 1;
  const ease = 1 - Math.pow(1 - k, 3);
  const drawTile = (px, py, v, scale) => {
    const [bg, fg] = colFor(v);
    const dw = CS * scale, dx = px + (CS - dw) / 2, dy = py + (CS - dw) / 2;
    ctx.fillStyle = bg;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(dx, dy, dw, dw, 6);
    else ctx.rect(dx, dy, dw, dw);
    ctx.fill();
    ctx.fillStyle = fg;
    ctx.font = '900 ' + (v < 100 ? 34 : v < 1000 ? 30 : v < 10000 ? 24 : 20) + 'px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(v, px + CS / 2, py + CS / 2 + (v < 100 ? 12 : 10));
  };
  if (sliding) {
    for (const a of G.anims) {
      const [sx, sy] = cellXY(a.fx, a.fy), [ex, ey] = cellXY(a.tx, a.ty);
      drawTile(sx + (ex - sx) * ease, sy + (ey - sy) * ease, k > .85 ? a.nv : a.v, 1);
    }
  } else {
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const v = G.grid[y][x];
      if (!v) continue;
      const [px, py] = cellXY(x, y);
      let scale = 1;
      for (const s of G.spawnFx) if (s.x === x && s.y === y) scale = .3 + .7 * Math.min(1, s.t / .15);
      drawTile(px, py, v, scale);
    }
  }
  if (G.state === 'pause') {
    ctx.fillStyle = 'rgba(20,18,14,.55)';
    ctx.fillRect(BX, BY, BS, BS);
    ctx.fillStyle = '#fff'; ctx.font = '900 32px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(T('paused'), W / 2, BY + BS / 2);
  }
  if (G.msgT > 0) {
    ctx.font = '900 26px system-ui'; ctx.textAlign = 'center';
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,.6)';
    ctx.strokeText(G.msg, W / 2, H - 30);
    ctx.fillStyle = '#ffd93d';
    ctx.fillText(G.msg, W / 2, H - 30);
  }
}
let last = performance.now();
function loop(now) {
  const dt = Math.min(((now || performance.now()) - last) / 1000, .05);
  last = now || performance.now();
  for (const s of G.spawnFx) s.t += dt;
  G.spawnFx = G.spawnFx.filter(s => s.t < .3);
  if (G.anims.length) {
    G.animT += dt;
    if (G.animT >= .14) { G.anims = []; finishMove(); }
  }
  if (G.msgT > 0) G.msgT -= dt;
  render(dt);
  requestAnimationFrame(loop);
}
reset();
requestAnimationFrame(t => { last = t; requestAnimationFrame(loop); });
window.__game = G;
window.__gameErrors = [];
window.addEventListener('error', e => window.__gameErrors.push(String(e.message)));
G._move = doMove; G._start = startGame; G._can = canMove;
})();
