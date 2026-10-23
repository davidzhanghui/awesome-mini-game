(() => {
'use strict';
// 扫雷：Canvas 绘制；首击安全区布雷；BFS 涟漪展开（按深度错峰翻开）；失败时地雷按距离连环引爆
const { $, T } = KIT;
const store = KIT.store('amg-mines');
const LV = {
  easy: { c: 9, r: 9, m: 10, cs: 40 },
  mid: { c: 16, r: 16, m: 40, cs: 32 },
  hard: { c: 30, r: 16, m: 99, cs: 30 }
};
const HINTS = 3, PENALTY = 10;

const cv = $('game'), field = $('field');
let ctx, W = 0, H = 0;
let lvKey = LV[store.get('lv', 'easy')] ? store.get('lv', 'easy') : 'easy';
let C = 9, R = 9, M = 10, cs = 40;
let cells = [], state = 'menu'; // menu | ready | play | win | lose
let flagMode = false, opened = 0, flags = 0, t0 = 0, endTime = 0, penalty = 0;
let hintsLeft = HINTS, hintsUsed = 0, clicks = 0, bestAtStart = 0;
let hover = -1, press = null, longTimer = 0, hintCell = -1, hintAt = 0;
let loseUntil = 0;
const parts = new KIT.Particles();

// ---------------- 布局 ----------------
function setup(keepDims) {
  const L = LV[lvKey];
  if (!keepDims) {
    C = L.c; R = L.r; M = L.m;
    if (lvKey === 'hard' && window.innerWidth < 640) { C = 16; R = 30; } // 竖屏手机把高级盘竖过来
  }
  document.getElementById('cabinet').classList.toggle('wide', C >= 30);
  const avail = Math.min(window.innerWidth * 0.94, C >= 30 ? 980 : 640) - 32;
  cs = Math.max(18, Math.min(L.cs, Math.floor(avail / C)));
  W = C * cs; H = R * cs;
  ctx = KIT.canvas(cv, W, H);
  cv.style.width = W + 'px'; cv.style.height = H + 'px';
}

const idx = (x, y) => y * C + x;
function nbrs(i) {
  const x = i % C, y = (i / C) | 0, out = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && nx < C && ny >= 0 && ny < R) out.push(idx(nx, ny));
  }
  return out;
}

// ---------------- 音效 ----------------
const sfx = {
  click: () => KIT.tone(620, 0.05, { type: 'triangle', vol: 0.05, to: 520 }),
  sweep: n => {
    KIT.noise(0.18 + Math.min(n, 60) * 0.004, { vol: 0.05, hp: 2500 });
    KIT.arp([523, 659, 784], 0.04, { vol: 0.04, dur: 0.1 });
  },
  flag: on => KIT.tone(on ? 880 : 520, 0.08, { type: 'square', vol: 0.03, to: on ? 1180 : 360 }),
  deny: () => KIT.tone(150, 0.1, { type: 'sine', vol: 0.06 }),
  boom: big => {
    KIT.noise(big ? 0.7 : 0.35, { vol: big ? 0.3 : 0.12, lp: big ? 900 : 1500 });
    KIT.tone(big ? 90 : 120, big ? 0.5 : 0.25, { type: 'sine', vol: big ? 0.25 : 0.1, to: 40 });
  },
  win: () => KIT.arp([523, 659, 784, 1047, 784, 1047, 1319], 0.09, { vol: 0.08, dur: 0.22 }),
  hint: () => KIT.arp([880, 1175], 0.07, { type: 'sine', vol: 0.06 })
};

// ---------------- 规则 ----------------
function newGame() {
  setup(false);
  cells = Array.from({ length: C * R }, () => ({ mine: false, n: 0, open: false, flag: false, at: 0, boom: 0, blown: false, flagAt: 0 }));
  state = 'ready';
  opened = flags = clicks = penalty = hintsUsed = 0;
  hintsLeft = HINTS; endTime = 0; t0 = 0; hover = -1; press = null; hintCell = -1;
  bestAtStart = store.get('best-' + lvKey, 0);
  parts.clear();
  hideScreens();
  setFace('🙂');
  renderBar();
  KIT.music('puzzle-calm');
}

function placeMines(safe) {
  const ban = new Set([safe]);
  if (C * R - M >= 9) nbrs(safe).forEach(n => ban.add(n));
  const pool = [];
  for (let i = 0; i < C * R; i++) if (!ban.has(i)) pool.push(i);
  for (let k = 0; k < M; k++) {
    const j = k + ((Math.random() * (pool.length - k)) | 0);
    [pool[k], pool[j]] = [pool[j], pool[k]];
    cells[pool[k]].mine = true;
  }
  cells.forEach((c, i) => { c.n = nbrs(i).filter(n => cells[n].mine).length; });
}

function reveal(i, silent) {
  const c = cells[i];
  if (c.open || c.flag) return 0;
  if (state === 'ready') { placeMines(i); state = 'play'; t0 = performance.now(); }
  if (c.mine) { lose(i); return -1; }
  const now = performance.now();
  const q = [[i, 0]];
  c.open = true; c.at = now; opened++;
  let count = 1;
  while (q.length) {
    const [j, d] = q.shift();
    if (cells[j].n) continue;
    for (const n of nbrs(j)) {
      const o = cells[n];
      if (o.open || o.flag || o.mine) continue;
      o.open = true; o.at = now + Math.min(900, (d + 1) * 24); opened++; count++;
      q.push([n, d + 1]);
    }
  }
  if (!silent) count > 1 ? sfx.sweep(count) : sfx.click();
  checkWin();
  return count;
}

function chord(i) {
  const c = cells[i];
  if (!c.open || !c.n || state !== 'play') return;
  const around = nbrs(i);
  const f = around.filter(n => cells[n].flag).length;
  const closed = around.filter(n => !cells[n].open && !cells[n].flag);
  if (!closed.length) return;
  if (f !== c.n) { sfx.deny(); flashNbrs = { i, at: performance.now() }; return; }
  let total = 0;
  for (const n of closed) {
    const r = reveal(n, true);
    if (r < 0) return;
    total += r;
  }
  total > 1 ? sfx.sweep(total) : sfx.click();
}
let flashNbrs = null;

function toggleFlag(i) {
  const c = cells[i];
  if (c.open || (state !== 'play' && state !== 'ready')) return;
  c.flag = !c.flag; c.flagAt = performance.now();
  flags += c.flag ? 1 : -1;
  sfx.flag(c.flag);
  renderBar();
}

function elapsed() {
  if (state === 'ready' || state === 'menu') return 0;
  const end = endTime || performance.now();
  return (end - t0) / 1000 + penalty;
}
const fmt = s => (Math.round(s * 10) / 10).toFixed(1);

function checkWin() {
  if (state !== 'play' || opened !== C * R - M) return;
  state = 'win';
  endTime = performance.now();
  const now = endTime;
  cells.forEach(c => { if (c.mine && !c.flag) { c.flag = true; c.flagAt = now + Math.random() * 400; } });
  flags = M;
  const t = +fmt(elapsed());
  const best = store.get('best-' + lvKey, 0);
  if (!best || t < best) store.set('best-' + lvKey, t);
  setFace('😎');
  sfx.win();
  KIT.stopMusic();
  for (let k = 0; k < 6; k++) setTimeout(() => parts.burst(Math.random() * W, Math.random() * H * 0.6, {
    n: 26, color: ['#f2b84b', '#e0703a', '#5a9e63', '#4f8fe0', '#d9539a'], shape: 'square', speed: 260, life: 1.3, size: 7, gravity: 380
  }), k * 160);
  renderBar();
  setTimeout(() => showOver(true, t, !bestAtStart || t < bestAtStart), 1100);
}

function lose(i) {
  state = 'lose';
  endTime = performance.now();
  const now = endTime;
  const x0 = i % C, y0 = (i / C) | 0;
  cells[i].boom = now; cells[i].first = true;
  let last = now;
  cells.forEach((c, j) => {
    if (!c.mine || j === i || c.flag) return;
    const d = Math.hypot(j % C - x0, ((j / C) | 0) - y0);
    c.boom = now + 260 + d * 70 + Math.random() * 60;
    last = Math.max(last, c.boom);
  });
  loseUntil = Math.min(last, now + 2400);
  // 太远的雷压缩到 2.4 秒内一起爆
  cells.forEach(c => { if (c.boom > loseUntil) c.boom = loseUntil - Math.random() * 200; });
  setFace('😵');
  sfx.boom(true);
  field.classList.remove('shake'); void field.offsetWidth; field.classList.add('shake');
  KIT.stopMusic();
  renderBar();
  setTimeout(() => showOver(false, elapsed(), false), loseUntil - now + 700);
}

function useHint() {
  if (state === 'ready') { KIT.toast($('toast'), T('noSafe')); sfx.deny(); return; }
  if (state !== 'play') return;
  if (hintsLeft <= 0) { KIT.toast($('toast'), T('noHint')); sfx.deny(); return; }
  const safe = [], edge = [];
  cells.forEach((c, i) => {
    if (c.open || c.mine || c.flag) return;
    safe.push(i);
    if (nbrs(i).some(n => cells[n].open)) edge.push(i);
  });
  const pool = edge.length ? edge : safe;
  if (!pool.length) return;
  const pick = pool[(Math.random() * pool.length) | 0];
  hintsLeft--; hintsUsed++; penalty += PENALTY;
  hintCell = pick; hintAt = performance.now();
  sfx.hint();
  KIT.toast($('toast'), T('hintPenalty'));
  reveal(pick, true);
  renderBar();
}

// ---------------- 界面 ----------------
function setFace(f) { $('btn-face').textContent = f; }
function renderBar() {
  $('mines-left').textContent = M - flags;
  $('hint-left').textContent = hintsLeft;
  $('btn-hint').disabled = hintsLeft <= 0;
  $('btn-flag').classList.toggle('on', flagMode);
}
function hideScreens() {
  $('screen-menu').classList.add('hidden');
  $('screen-over').classList.add('hidden');
  $('screen-over').classList.remove('peek');
}
function showMenu() {
  state = 'menu';
  KIT.stopMusic();
  hideScreens();
  setup(false);
  cells = Array.from({ length: C * R }, () => ({ mine: false, n: 0, open: false, flag: false, at: 0, boom: 0 }));
  renderMenu();
  $('screen-menu').classList.remove('hidden');
}
function renderMenu() {
  document.querySelectorAll('#lv-seg button').forEach(b => b.classList.toggle('on', b.dataset.lv === lvKey));
  const L = LV[lvKey];
  $('lv-desc').textContent = T('lvDesc', L.c, L.r, L.m);
  const b = store.get('best-' + lvKey, 0);
  $('menu-best').textContent = T('best', b ? T('sec', fmt(b)) : 0);
}
function showOver(win, t, record) {
  if (state !== (win ? 'win' : 'lose')) return;
  $('over-icon').textContent = win ? '🏆' : '💥';
  const title = $('over-title');
  title.textContent = win ? T('winTitle') : T('loseTitle');
  title.className = win ? 'clear-title' : 'over-title';
  $('over-record').classList.toggle('hidden', !record);
  const best = store.get('best-' + lvKey, 0);
  const pct = Math.floor(opened / (C * R - M) * 100);
  $('over-stats').innerHTML =
    `<span>${T('stTime')}</span><b>${T('sec', fmt(t))}</b>` +
    `<span>${T('stBest')}</span><b>${best ? T('sec', fmt(best)) : '—'}</b>` +
    `<span>${T('stProgress')}</span><b>${pct}%</b>` +
    `<span>${T('stClicks')}</span><b>${clicks}</b>` +
    `<span>${T('stHints')}</span><b>${hintsUsed}</b>`;
  $('screen-over').classList.remove('hidden', 'peek');
}

// ---------------- 绘制 ----------------
const PAL = {
  light: {
    top: '#f1dfc0', side: '#d7bb91', hi: '#fff6e6', open: '#f8f1e4', line: '#e8dac3', hover: '#f8e9cf', press: '#eadcc4',
    nums: ['', '#2f6fd6', '#2f9a4a', '#d6443a', '#7a4bc9', '#b8662a', '#1f9aa8', '#3a2e24', '#8c7f70'],
    mine: '#2b221b', boomBg: '#f08a7a', hint: '#5a9e63'
  },
  dark: {
    top: '#5c4731', side: '#3a2c1d', hi: '#715a3f', open: '#2a2016', line: '#3a2d1f', hover: '#6c5439', press: '#3b2e20',
    nums: ['', '#7fb0ff', '#7fd88f', '#ff8a7a', '#c6a3ff', '#f0a868', '#6fd6e0', '#f2e7d4', '#b8aa98'],
    mine: '#f2e7d4', boomBg: '#a8402f', hint: '#7fd88f'
  }
};

function drawMine(x, y, col) {
  const cx = x + cs / 2, cy = y + cs / 2, r = cs * 0.24;
  ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = Math.max(1.5, cs * 0.06); ctx.lineCap = 'round';
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 4;
    ctx.beginPath();
    ctx.moveTo(cx - Math.cos(a) * r * 1.45, cy - Math.sin(a) * r * 1.45);
    ctx.lineTo(cx + Math.cos(a) * r * 1.45, cy + Math.sin(a) * r * 1.45);
    ctx.stroke();
  }
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.75)';
  ctx.beginPath(); ctx.arc(cx - r * 0.35, cy - r * 0.35, r * 0.28, 0, Math.PI * 2); ctx.fill();
}
function drawFlag(x, y, scale) {
  const cx = x + cs / 2, cy = y + cs / 2;
  ctx.save(); ctx.translate(cx, cy); ctx.scale(scale, scale);
  const s = cs;
  ctx.fillStyle = '#6b5a45';
  ctx.fillRect(-s * 0.03, -s * 0.28, s * 0.06, s * 0.52);
  ctx.fillRect(-s * 0.18, s * 0.2, s * 0.36, s * 0.07);
  ctx.fillStyle = '#e0483a';
  ctx.beginPath(); ctx.moveTo(s * 0.03, -s * 0.3); ctx.lineTo(s * 0.26, -s * 0.17); ctx.lineTo(s * 0.03, -s * 0.03); ctx.closePath(); ctx.fill();
  ctx.restore();
}
function drawCovered(x, y, P, mode) {
  const g = Math.max(1, cs * 0.05);
  ctx.fillStyle = P.side;
  KIT.roundRect(ctx, x + g, y + g, cs - g * 2, cs - g * 2, cs * 0.18); ctx.fill();
  ctx.fillStyle = mode === 'press' ? P.press : mode === 'hover' ? P.hover : P.top;
  const lift = mode === 'press' ? 0 : cs * 0.08;
  KIT.roundRect(ctx, x + g, y + g, cs - g * 2, cs - g * 2 - lift, cs * 0.18); ctx.fill();
  if (mode !== 'press') {
    ctx.fillStyle = P.hi;
    ctx.globalAlpha = 0.6;
    KIT.roundRect(ctx, x + g * 2.5, y + g * 2.2, cs - g * 5, cs * 0.12, cs * 0.06); ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function pressedSet() {
  const s = new Set();
  if (press && press.type === 'mouse' && press.i >= 0 && (state === 'play' || state === 'ready')) {
    const c = cells[press.i];
    if (!c.open && !c.flag && !flagMode && press.btn === 0) s.add(press.i);
    if (c.open && c.n) nbrs(press.i).forEach(n => { if (!cells[n].open && !cells[n].flag) s.add(n); });
  }
  if (flashNbrs && performance.now() - flashNbrs.at < 220) nbrs(flashNbrs.i).forEach(n => { if (!cells[n].open && !cells[n].flag) s.add(n); });
  return s;
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (ctx && cells.length) draw(now, dt);
  if (state === 'play') $('timer').textContent = Math.floor(elapsed());
  else if (state === 'ready' || state === 'menu') $('timer').textContent = 0;
  requestAnimationFrame(frame);
}

function draw(now, dt) {
  const P = KIT.dark() ? PAL.dark : PAL.light;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = P.open; ctx.fillRect(0, 0, W, H);
  const pressed = pressedSet();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `400 ${Math.round(cs * 0.62)}px "AMG Display", "PingFang SC", system-ui, sans-serif`;

  for (let i = 0; i < cells.length; i++) {
    const c = cells[i], x = (i % C) * cs, y = ((i / C) | 0) * cs;
    const shown = c.open && now >= c.at;
    const boomed = state === 'lose' && c.mine && c.boom && now >= c.boom;
    if (boomed && !c.blown) {
      c.blown = true;
      parts.burst(x + cs / 2, y + cs / 2, { n: c.first ? 30 : 12, color: ['#f2b84b', '#e0603a', '#6b5a45'], speed: c.first ? 260 : 150, life: 0.6, size: 4, gravity: 300 });
      if (!c.first && Math.random() < 0.5) sfx.boom(false);
    }
    if (shown || boomed) {
      ctx.strokeStyle = P.line; ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, cs - 1, cs - 1);
      if (boomed) {
        if (c.first) { ctx.fillStyle = P.boomBg; ctx.fillRect(x + 1, y + 1, cs - 2, cs - 2); }
        drawMine(x, y, c.first ? '#2b221b' : P.mine);
      } else if (c.n) {
        ctx.fillStyle = P.nums[c.n];
        ctx.fillText(c.n, x + cs / 2, y + cs / 2 + cs * 0.03);
      }
      if (i === hintCell && now - hintAt < 1400) {
        ctx.strokeStyle = P.hint; ctx.lineWidth = 3; ctx.globalAlpha = 1 - (now - hintAt) / 1400;
        ctx.strokeRect(x + 2, y + 2, cs - 4, cs - 4); ctx.globalAlpha = 1;
      }
      // 翻开动画：盖板缩小淡出
      const k = (now - (boomed ? c.boom : c.at)) / 150;
      if (k < 1) {
        ctx.save(); ctx.globalAlpha = 1 - k;
        ctx.translate(x + cs / 2, y + cs / 2); ctx.scale(1 - k * 0.5, 1 - k * 0.5); ctx.translate(-x - cs / 2, -y - cs / 2);
        drawCovered(x, y, P, '');
        ctx.restore();
      }
    } else {
      drawCovered(x, y, P, pressed.has(i) ? 'press' : (i === hover && (state === 'play' || state === 'ready') ? 'hover' : ''));
      if (c.flag && now >= c.flagAt) {
        const k = Math.min(1, (now - c.flagAt) / 160);
        drawFlag(x, y - cs * 0.04, KIT.ease.outBack(k));
        if (state === 'lose' && !c.mine && now > loseUntil) {
          ctx.strokeStyle = '#d6443a'; ctx.lineWidth = Math.max(2, cs * 0.08); ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(x + cs * 0.22, y + cs * 0.22); ctx.lineTo(x + cs * 0.78, y + cs * 0.78);
          ctx.moveTo(x + cs * 0.78, y + cs * 0.22); ctx.lineTo(x + cs * 0.22, y + cs * 0.78);
          ctx.stroke();
        }
      }
    }
  }
  parts.update(dt);
  parts.draw(ctx);
}

// ---------------- 输入 ----------------
function cellAt(e) {
  const p = KIT.point(cv, e, W, H);
  const x = Math.floor(p.x / cs), y = Math.floor(p.y / cs);
  return x >= 0 && x < C && y >= 0 && y < R ? idx(x, y) : -1;
}
function act(i, btn) {
  if (i < 0 || (state !== 'play' && state !== 'ready')) return;
  const c = cells[i];
  clicks++;
  if (btn === 2) { c.open ? chord(i) : toggleFlag(i); return; }
  if (btn === 1 || c.open) { chord(i); return; }
  if (flagMode) { toggleFlag(i); return; }
  if (!c.flag) reveal(i);
}

cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('pointerdown', e => {
  if (!$('screen-over').classList.contains('hidden')) return;
  if (state !== 'play' && state !== 'ready') return;
  e.preventDefault();
  const i = cellAt(e);
  press = { i, btn: e.button, type: e.pointerType, long: false, x: e.clientX, y: e.clientY };
  if (e.button === 0) setFace('😮');
  if (e.pointerType !== 'mouse') {
    clearTimeout(longTimer);
    longTimer = setTimeout(() => {
      if (!press || press.i !== i) return;
      press.long = true;
      clicks++;
      cells[i].open ? chord(i) : toggleFlag(i);
      if (navigator.vibrate) try { navigator.vibrate(25); } catch (er) {}
    }, 360);
  }
});
cv.addEventListener('pointermove', e => {
  hover = cellAt(e);
  if (!press) return;
  if (press.type === 'mouse') press.i = hover;
  else if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > 12) { clearTimeout(longTimer); press = null; }
});
cv.addEventListener('pointerleave', () => { hover = -1; if (press && press.type === 'mouse') press = null; if (state === 'play' || state === 'ready') setFace('🙂'); });
window.addEventListener('pointerup', () => {
  clearTimeout(longTimer);
  if (state === 'play' || state === 'ready') setFace('🙂');
  if (!press) return;
  const p = press; press = null;
  if (!p.long) act(p.i, p.btn);
});

$('btn-face').onclick = () => { if (state !== 'menu') newGame(); };
$('btn-flag').onclick = () => {
  flagMode = !flagMode; renderBar();
  KIT.toast($('toast'), flagMode ? T('flagOn') : T('flagOff'));
  KIT.tone(flagMode ? 880 : 600, 0.06, { type: 'triangle', vol: 0.05 });
};
$('btn-hint').onclick = useHint;
$('btn-start').onclick = newGame;
$('btn-retry').onclick = newGame;
$('btn-menu').onclick = showMenu;
$('btn-look').onclick = () => $('screen-over').classList.add('peek');
field.addEventListener('click', () => {
  const s = $('screen-over');
  if (s.classList.contains('peek')) s.classList.remove('peek');
});
document.querySelectorAll('#lv-seg button').forEach(b => b.addEventListener('click', () => {
  lvKey = b.dataset.lv; store.set('lv', lvKey);
  KIT.tone(520, 0.06, { type: 'triangle', vol: 0.05 });
  showMenu();
}));

document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
  const k = e.key.toLowerCase();
  if (k === ' ' && hover >= 0 && (state === 'play' || state === 'ready')) {
    e.preventDefault(); clicks++;
    cells[hover].open ? chord(hover) : toggleFlag(hover);
  } else if (k === 'f' && state !== 'menu') $('btn-flag').click();
  else if (k === 'h' && state === 'play') useHint();
  else if (k === 'r' && state !== 'menu') newGame();
  else if (k === 'enter' && state === 'menu') newGame();
});

let rz = 0;
window.addEventListener('resize', () => {
  clearTimeout(rz);
  rz = setTimeout(() => { state === 'menu' ? showMenu() : setup(true); }, 120);
});

const syncMute = KIT.mountMute($('btn-mute'));
KIT.boot(() => { syncMute(); renderMenu(); $('btn-flag').title = T('op5'); });
showMenu();
requestAnimationFrame(frame);
})();
