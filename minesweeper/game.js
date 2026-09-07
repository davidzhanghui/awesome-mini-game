(() => {
// 扫雷：经典三档 + 首击安全 + 双击展开 + 计时
const STR = window.GAME_STR || { zh: {}, en: {} };
const T = (k, ...a) => AMG.tf(STR, k, ...a);
const diffName = d => (T('diffs') || [])[d] || DIFFS[d].name;
const W = 520, H = 620;
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const $ = id => document.getElementById(id);
const dpr = Math.min(window.devicePixelRatio || 1, 2);
canvas.width = W * dpr; canvas.height = H * dpr;
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

const DIFFS = [
  { name: '初级', w: 9, h: 9, mines: 10 },
  { name: '中级', w: 16, h: 16, mines: 40 },
  { name: '高级', w: 30, h: 16, mines: 99 }
];
const store = {
  get muted() { return localStorage.getItem('ms-muted') === '1'; },
  set muted(v) { localStorage.setItem('ms-muted', v ? '1' : '0'); },
  get best() { try { return JSON.parse(localStorage.getItem('ms-best') || '[0,0,0]'); } catch (e) { return [0, 0, 0]; } },
  set best(v) { localStorage.setItem('ms-best', JSON.stringify(v)); }
};
let actx = null, muted = store.muted;
function tone(f, dur, type, vol) {
  if (muted) return;
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type || 'square'; o.frequency.value = f;
    g.gain.setValueAtTime(vol || .07, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(.001, actx.currentTime + dur);
    o.connect(g); g.connect(actx.destination); o.start(); o.stop(actx.currentTime + dur);
  } catch (e) {}
}
const sfx = {
  open: () => tone(500, .05, 'square', .05),
  flag: () => tone(700, .06, 'sine', .07),
  boom: () => tone(120, .4, 'sawtooth', .14, -60),
  win: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, .14, 'sine', .09), i * 100))
};

const G = {
  state: 'menu', diff: 0, w: 9, h: 9, mines: 10,
  board: [], opened: 0, flags: 0, started: false, over: false, win: false,
  t0: 0, elapsed: 0, boomAt: null, ox: 0, oy: 0, cell: 0
};
const NCOL = ['#3a8dde', '#5ee66e', '#ff5d5d', '#2b5fd9', '#a03a2a', '#3aa0a0', '#222', '#888'];
function reset(d) {
  G.diff = d;
  const D = DIFFS[d];
  G.w = D.w; G.h = D.h; G.mines = D.mines;
  G.board = Array.from({ length: G.h }, () => Array.from({ length: G.w }, () => ({ mine: false, open: false, flag: false, n: 0 })));
  G.opened = 0; G.flags = 0; G.started = false; G.over = false; G.win = false;
  G.elapsed = 0; G.boomAt = null;
  layout();
}
function layout() {
  const maxCellW = (W - 30) / G.w, maxCellH = (H - 120) / G.h;
  G.cell = Math.floor(Math.min(maxCellW, maxCellH, 34));
  G.ox = (W - G.cell * G.w) / 2;
  G.oy = 96 + (H - 120 - G.cell * G.h) / 2;
}
function placeMines(sx, sy) {
  let placed = 0, guard = 0;
  while (placed < G.mines && guard++ < 10000) {
    const x = Math.random() * G.w | 0, y = Math.random() * G.h | 0;
    if (G.board[y][x].mine) continue;
    if (Math.abs(x - sx) <= 1 && Math.abs(y - sy) <= 1) continue; // 首击 3x3 安全
    G.board[y][x].mine = true;
    placed++;
  }
  for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) {
    if (G.board[y][x].mine) continue;
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < G.w && ny < G.h && G.board[ny][nx].mine) n++;
    }
    G.board[y][x].n = n;
  }
}
function open(x, y) {
  if (G.over || G.win) return;
  const c = G.board[y] && G.board[y][x];
  if (!c || c.open || c.flag) return;
  if (!G.started) {
    G.started = true;
    G.t0 = Date.now();
    placeMines(x, y);
  }
  if (c.mine) {
    c.open = true;
    G.boomAt = [x, y];
    return gameOver(false);
  }
  flood(x, y);
  sfx.open();
  checkWin();
}
function flood(x, y) {
  const q = [[x, y]];
  while (q.length) {
    const [cx, cy] = q.pop();
    const c = G.board[cy] && G.board[cy][cx];
    if (!c || c.open || c.flag) continue;
    c.open = true;
    G.opened++;
    if (c.n === 0 && !c.mine) {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx, ny = cy + dy;
        if (nx >= 0 && ny >= 0 && nx < G.w && ny < G.h) {
          const n = G.board[ny][nx];
          if (!n.open && !n.flag) q.push([nx, ny]);
        }
      }
    }
  }
}
function chord(x, y) {
  const c = G.board[y][x];
  if (!c || !c.open || c.n === 0) return;
  let flags = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < G.w && ny < G.h && G.board[ny][nx].flag) flags++;
  }
  if (flags !== c.n) return;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < G.w && ny < G.h) {
      const n = G.board[ny][nx];
      if (!n.open && !n.flag) {
        if (n.mine) { n.open = true; G.boomAt = [nx, ny]; return gameOver(false); }
        flood(nx, ny);
      }
    }
  }
  sfx.open();
  checkWin();
}
function toggleFlag(x, y) {
  if (G.over || G.win) return;
  const c = G.board[y] && G.board[y][x];
  if (!c || c.open) return;
  c.flag = !c.flag;
  G.flags += c.flag ? 1 : -1;
  sfx.flag();
}
function checkWin() {
  if (G.opened + G.mines === G.w * G.h) {
    G.win = true;
    const secs = Math.floor((Date.now() - G.t0) / 1000);
    const best = store.best;
    if (!best[G.diff] || secs < best[G.diff]) { best[G.diff] = secs; store.best = best; }
    sfx.win();
    $('over-title').textContent = T('winTitle');
    $('over-sub').textContent = T('winSub', diffName(G.diff), secs, best[G.diff]);
    setTimeout(() => showScreen('over'), 400);
  }
}
function gameOver(win) {
  G.over = true;
  sfx.boom();
  // 展开所有雷
  G.board.forEach(row => row.forEach(c => { if (c.mine) c.open = true; }));
  $('over-title').textContent = T('loseTitle');
  $('over-sub').textContent = T('loseSub', diffName(G.diff), G.opened);
  setTimeout(() => showScreen('over'), 600);
}
function showScreen(name) {
  for (const k of ['screen-menu', 'screen-over'])
    $(k).classList.toggle('hidden', k !== 'screen-' + name);
  if (!name) for (const k of ['screen-menu', 'screen-over']) $(k).classList.add('hidden');
}
function startGame(d) {
  reset(d);
  G.state = 'play';
  showScreen(null);
}
function refreshBest() {
  const b = store.best, na = T('na');
  const fmt = v => v ? v + 's' : na;
  $('menu-best').textContent = T('bestLine', fmt(b[0]), fmt(b[1]), fmt(b[2]));
}
function pos(e) {
  const r = canvas.getBoundingClientRect();
  const px = (e.clientX - r.left) / r.width * W, py = (e.clientY - r.top) / r.height * H;
  const x = Math.floor((px - G.ox) / G.cell), y = Math.floor((py - G.oy) / G.cell);
  if (x < 0 || y < 0 || x >= G.w || y >= G.h) return null;
  return [x, y];
}
let pressT = 0, pressPos = null;
canvas.addEventListener('pointerdown', e => {
  if (G.state !== 'play') return;
  const p = pos(e);
  if (!p) return;
  pressT = Date.now(); pressPos = p;
});
canvas.addEventListener('pointerup', e => {
  if (G.state !== 'play') return;
  const p = pos(e);
  if (!p) return;
  const held = Date.now() - pressT;
  const [x, y] = p;
  if (e.button === 2 || held > 450) toggleFlag(x, y);
  else {
    const c = G.board[y][x];
    if (c.open) chord(x, y);
    else open(x, y);
  }
});
canvas.addEventListener('contextmenu', e => {
  e.preventDefault();
  if (G.state !== 'play') return;
  const p = pos(e);
  if (p) toggleFlag(p[0], p[1]);
});
// 双击数字展开
canvas.addEventListener('dblclick', e => {
  if (G.state !== 'play') return;
  const p = pos(e);
  if (p) chord(p[0], p[1]);
});
window.addEventListener('keydown', e => {
  if (e.code === 'KeyM') toggleMute();
  else if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
  else if (e.code === 'KeyR') { if (G.state === 'play' || G.state === 'pause' || G.state === 'menu') startGame(G.diff); }
});
function togglePause() {
  if (G.state === 'play') { G.state = 'pause'; G._pauseAt = Date.now(); }
  else if (G.state === 'pause') {
    if (G._pauseAt && G.t0) G.t0 += Date.now() - G._pauseAt;
    G.state = 'play';
  }
}
document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { tone(700, .07, 'sine', .08); startGame(+b.dataset.mode); });
$('btn-retry').onclick = () => startGame(G.diff);
$('btn-menu').onclick = () => { G.state = 'menu'; showScreen('menu'); refreshBest(); };
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
  refreshBest();
};
AMG.mountBtn();
window.__refreshLang();

function render() {
  ctx.fillStyle = '#1c2536'; ctx.fillRect(0, 0, W, H);
  if (G.state === 'menu') return;
  // 顶栏
  ctx.fillStyle = 'rgba(0,0,0,.4)';
  ctx.fillRect(0, 0, W, 64);
  ctx.fillStyle = '#fff'; ctx.font = '900 18px system-ui'; ctx.textAlign = 'left';
  ctx.fillText('💣 ' + String(G.mines - G.flags).padStart(3, '0'), 16, 30);
  ctx.fillText(diffName(G.diff), 16, 54);
  ctx.textAlign = 'center';
  const face = G.over ? '😵' : G.win ? '😎' : '🙂';
  ctx.font = '30px serif';
  ctx.fillText(face, W / 2, 42);
  ctx.font = '900 18px system-ui'; ctx.textAlign = 'right';
  const secs = G.state === 'pause' && G._pauseAt && G.t0
    ? Math.floor((G._pauseAt - G.t0) / 1000)
    : G.started && !G.over && !G.win && G.state === 'play' ? Math.floor((Date.now() - G.t0) / 1000) : G.elapsed || 0;
  if (G.started) G.elapsed = secs;
  ctx.fillText('⏱ ' + String(Math.min(999, secs)).padStart(3, '0'), W - 16, 30);
  ctx.fillText('🚩 ' + G.flags, W - 16, 54);
  // 棋盘
  for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) {
    const c = G.board[y][x];
    const px = G.ox + x * G.cell, py = G.oy + y * G.cell;
    if (c.open) {
      ctx.fillStyle = '#0e1420';
      ctx.fillRect(px, py, G.cell, G.cell);
      if (c.mine) {
        const boom = G.boomAt && G.boomAt[0] === x && G.boomAt[1] === y;
        if (boom) { ctx.fillStyle = '#e33'; ctx.fillRect(px, py, G.cell, G.cell); }
        ctx.font = Math.floor(G.cell * .6) + 'px serif'; ctx.textAlign = 'center';
        ctx.fillText('💣', px + G.cell / 2, py + G.cell * .72);
      } else if (c.n > 0) {
        ctx.fillStyle = NCOL[c.n - 1];
        ctx.font = '900 ' + Math.floor(G.cell * .62) + 'px system-ui'; ctx.textAlign = 'center';
        ctx.fillText(c.n, px + G.cell / 2, py + G.cell * .74);
      }
    } else {
      const g = ctx.createLinearGradient(px, py, px, py + G.cell);
      g.addColorStop(0, '#4a5a7a'); g.addColorStop(1, '#33405c');
      ctx.fillStyle = g;
      ctx.fillRect(px, py, G.cell, G.cell);
      ctx.fillStyle = 'rgba(255,255,255,.25)';
      ctx.fillRect(px, py, G.cell, 2);
      if (c.flag) {
        ctx.font = Math.floor(G.cell * .6) + 'px serif'; ctx.textAlign = 'center';
        ctx.fillText('🚩', px + G.cell / 2, py + G.cell * .72);
      }
    }
    ctx.strokeStyle = 'rgba(0,0,0,.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(px + .5, py + .5, G.cell - 1, G.cell - 1);
  }
  if (G.state === 'pause') {
    ctx.fillStyle = 'rgba(5,10,25,.5)';
    ctx.fillRect(0, 64, W, H);
    ctx.fillStyle = '#fff'; ctx.font = '900 32px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(T('paused'), W / 2, H / 2);
  }
}
let last = performance.now();
function loop(now) {
  last = now || performance.now();
  render();
  requestAnimationFrame(loop);
}
reset(0);
refreshBest();
requestAnimationFrame(t => { last = t; requestAnimationFrame(loop); });
window.__game = G;
window.__gameErrors = [];
window.addEventListener('error', e => window.__gameErrors.push(String(e.message)));
G._open = open; G._flag = toggleFlag; G._chord = chord; G._reset = reset; G._start = startGame; G._diffs = DIFFS;
})();
