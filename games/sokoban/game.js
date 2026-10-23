(() => {
// 推箱子：30 关程序生成 + BFS 验证的关卡，无限撤销 / 点击寻路 / 死角检测 / 三星评定
const STR = window.GAME_STR || { zh: {} };
const T = (k, ...a) => AMG.tf(STR, k, ...a);
const W = 480, H = 620, TOP = 74, BOT = 548;
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const $ = id => document.getElementById(id);
const dpr = Math.min(window.devicePixelRatio || 1, 2);
canvas.width = W * dpr; canvas.height = H * dpr;
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
const LEVELS = window.SOKO_LEVELS || [];
const DIRS = [{ x: -1, y: 0 }, { x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }];

const LS = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};
let prog = LS.get('soko-progress', { unlocked: 1, stars: {}, best: {} });
let muted = LS.get('soko-muted', false);
let actx = null;
function tone(f, dur, type, vol) {
  if (muted) return;
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type || 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(vol || .06, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(.001, actx.currentTime + dur);
    o.connect(g); g.connect(actx.destination); o.start(); o.stop(actx.currentTime + dur);
  } catch (e) {}
}
const sfx = {
  step: () => tone(300, .04, 'triangle', .035),
  push: () => tone(150, .09, 'square', .04),
  goal: () => [660, 990].forEach((f, i) => setTimeout(() => tone(f, .1, 'triangle', .07), i * 70)),
  bump: () => tone(90, .06, 'sine', .05),
  undo: () => tone(420, .05, 'sine', .04),
  win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => tone(f, .15, 'triangle', .08), i * 100))
};

const G = {
  state: 'menu', idx: 0, w: 0, h: 0, walls: null, goals: null, inside: null, boxes: [], p: { x: 0, y: 0 }, face: 3,
  moves: 0, pushes: 0, hist: [], anim: 0, path: [], stepT: 0, ts: 40, ox: 0, oy: 0, won: false, t: 0, dead: false
};

function loadLevel(i) {
  const lv = LEVELS[i];
  const rows = lv.map;
  G.idx = i; G.h = rows.length; G.w = Math.max(...rows.map(r => r.length));
  G.walls = []; G.goals = []; G.boxes = []; G.hist = []; G.path = [];
  G.moves = 0; G.pushes = 0; G.anim = 0; G.won = false; G.face = 3; G.dead = false;
  for (let y = 0; y < G.h; y++) {
    G.walls.push([]); G.goals.push([]);
    for (let x = 0; x < G.w; x++) {
      const c = rows[y][x] || ' ';
      G.walls[y].push(c === '#');
      G.goals[y].push(c === '.' || c === '*' || c === '+');
      if (c === '$' || c === '*') G.boxes.push({ x, y, px: x, py: y });
      if (c === '@' || c === '+') G.p = { x, y, px: x, py: y };
    }
  }
  // 从玩家出发泛洪，得到室内地板（用于绘制）
  G.inside = G.walls.map(r => r.map(() => false));
  const st = [[G.p.x, G.p.y]];
  G.inside[G.p.y][G.p.x] = true;
  while (st.length) {
    const [x, y] = st.pop();
    for (const d of DIRS) {
      const nx = x + d.x, ny = y + d.y;
      if (nx < 0 || ny < 0 || nx >= G.w || ny >= G.h || G.walls[ny][nx] || G.inside[ny][nx]) continue;
      G.inside[ny][nx] = true; st.push([nx, ny]);
    }
  }
  G.ts = Math.min(52, Math.floor(452 / G.w), Math.floor((BOT - TOP - 12) / G.h));
  G.ox = Math.round((W - G.ts * G.w) / 2);
  G.oy = Math.round(TOP + (BOT - TOP - G.ts * G.h) / 2);
  G.state = 'play';
  showScreen(null);
  syncBar();
}
const boxAt = (x, y) => G.boxes.findIndex(b => b.x === x && b.y === y);
const isWall = (x, y) => x < 0 || y < 0 || x >= G.w || y >= G.h || G.walls[y][x];

function tryMove(dir, fromPath) {
  if (G.state !== 'play' || G.won) return false;
  if (!fromPath) G.path = [];
  const d = DIRS[dir];
  G.face = dir;
  const nx = G.p.x + d.x, ny = G.p.y + d.y;
  if (isWall(nx, ny)) { sfx.bump(); return false; }
  const bi = boxAt(nx, ny);
  if (bi >= 0) {
    const bx = nx + d.x, by = ny + d.y;
    if (isWall(bx, by) || boxAt(bx, by) >= 0) { sfx.bump(); return false; }
    const b = G.boxes[bi];
    b.px = b.x; b.py = b.y; b.x = bx; b.y = by;
    G.pushes++;
    G.hist.push({ dir, bi });
    if (G.goals[by][bx]) sfx.goal(); else sfx.push();
  } else {
    G.hist.push({ dir, bi: -1 });
    sfx.step();
  }
  G.p.px = G.p.x; G.p.py = G.p.y; G.p.x = nx; G.p.y = ny;
  G.moves++; G.anim = 1;
  for (const b of G.boxes) if (b !== G.boxes[bi]) { b.px = b.x; b.py = b.y; }
  checkState();
  return true;
}
function undo() {
  if (G.state !== 'play' || G.won || !G.hist.length) return;
  G.path = [];
  const h = G.hist.pop(), d = DIRS[h.dir];
  for (const b of G.boxes) { b.px = b.x; b.py = b.y; }
  G.p.px = G.p.x; G.p.py = G.p.y;
  G.p.x -= d.x; G.p.y -= d.y;
  if (h.bi >= 0) { const b = G.boxes[h.bi]; b.x -= d.x; b.y -= d.y; G.pushes--; }
  G.moves--; G.face = h.dir; G.anim = 1;
  sfx.undo();
  checkState();
}
function restart() { if (G.state === 'play' || G.state === 'win') loadLevel(G.idx); }

// 简单死角检测：不在目标上的箱子卡在两面墙的夹角里
function deadBox(b) {
  if (G.goals[b.y][b.x]) return false;
  const v = isWall(b.x, b.y - 1) || isWall(b.x, b.y + 1);
  const hz = isWall(b.x - 1, b.y) || isWall(b.x + 1, b.y);
  return v && hz;
}
function checkState() {
  syncBar();
  G.dead = G.boxes.some(deadBox);
  if (G.dead) toast(T('deadHint'));
  if (G.boxes.every(b => G.goals[b.y][b.x])) {
    G.won = true; G.path = [];
    setTimeout(win, 380);
  }
}
function starsFor(moves) {
  const opt = LEVELS[G.idx].opt;
  return moves <= Math.ceil(opt * 1.15) ? 3 : moves <= Math.ceil(opt * 1.6) ? 2 : 1;
}
function win() {
  G.state = 'win'; sfx.win();
  const s = starsFor(G.moves), i = G.idx;
  const prevS = prog.stars[i] || 0;
  prog.stars[i] = Math.max(prevS, s);
  prog.best[i] = Math.min(prog.best[i] || Infinity, G.moves);
  prog.unlocked = Math.max(prog.unlocked, Math.min(LEVELS.length, i + 2));
  LS.set('soko-progress', prog);
  $('win-title').textContent = i === LEVELS.length - 1 ? T('allClear') : T('winTitle', i + 1);
  $('win-stars').innerHTML = [1, 2, 3].map(k => '<span class="' + (k <= s ? 'on' : '') + '">★</span>').join('');
  $('win-sub').textContent = T('winSub', G.moves, G.pushes, LEVELS[i].opt);
  $('btn-next').classList.toggle('hidden', i >= LEVELS.length - 1);
  showScreen('win');
}

// BFS 寻路（不推箱子）
function findPath(tx, ty) {
  const key = (x, y) => y * G.w + x;
  const prev = new Map([[key(G.p.x, G.p.y), null]]);
  const q = [[G.p.x, G.p.y]];
  while (q.length) {
    const [x, y] = q.shift();
    if (x === tx && y === ty) break;
    DIRS.forEach((d, di) => {
      const nx = x + d.x, ny = y + d.y, k = key(nx, ny);
      if (isWall(nx, ny) || boxAt(nx, ny) >= 0 || prev.has(k)) return;
      prev.set(k, [key(x, y), di]); q.push([nx, ny]);
    });
  }
  if (!prev.has(key(tx, ty))) return null;
  const out = [];
  let k = key(tx, ty);
  while (prev.get(k)) { const [pk, di] = prev.get(k); out.unshift(di); k = pk; }
  return out;
}
function tapTile(x, y) {
  if (G.state !== 'play' || G.won) return;
  const dx = x - G.p.x, dy = y - G.p.y;
  if (Math.abs(dx) + Math.abs(dy) === 1) {
    tryMove(dx === -1 ? 0 : dy === -1 ? 1 : dx === 1 ? 2 : 3);
    return;
  }
  if (isWall(x, y) || !G.inside[y] || !G.inside[y][x] || boxAt(x, y) >= 0) return;
  const p = findPath(x, y);
  if (p && p.length) { G.path = p; G.stepT = 0; }
}

// ---------- UI ----------
function showScreen(name) {
  for (const k of ['screen-menu', 'screen-win'])
    $(k).classList.toggle('hidden', k !== 'screen-' + name);
  $('soko-bar').classList.toggle('hidden', name === 'menu');
}
function syncBar() {
  $('btn-undo').disabled = !G.hist.length;
}
let toastT = 0;
function toast(msg) {
  const el = $('soko-toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 1800);
}
function buildMenu() {
  const total = Object.values(prog.stars).reduce((a, b) => a + b, 0);
  $('menu-stars').textContent = T('totalStars', total, LEVELS.length * 3);
  const chapters = [[0, 10], [10, 20], [20, 30]];
  let html = '';
  chapters.forEach(([a, b], ci) => {
    html += '<div class="chap">' + T('chap' + (ci + 1)) + '</div><div class="lvl-grid">';
    for (let i = a; i < Math.min(b, LEVELS.length); i++) {
      const locked = i + 1 > prog.unlocked, s = prog.stars[i] || 0;
      html += '<button class="lvl-btn' + (locked ? ' locked' : '') + (s ? ' done' : '') + (i === prog.unlocked - 1 ? ' active' : '') +
        '" data-i="' + i + '"' + (locked ? ' disabled' : '') + '><b>' + (locked ? '🔒' : i + 1) + '</b><small>' +
        (locked ? '' : '★'.repeat(s) + '☆'.repeat(3 - s)) + '</small></button>';
    }
    html += '</div>';
  });
  $('lvl-list').innerHTML = html;
}
function toMenu() {
  G.state = 'menu'; G.path = [];
  buildMenu();
  showScreen('menu');
  const act = $('lvl-list').querySelector('.lvl-btn.active');
  if (act && act.scrollIntoView) act.scrollIntoView({ block: 'nearest' });
}
$('lvl-list').addEventListener('click', e => {
  const b = e.target.closest('.lvl-btn');
  if (b && !b.disabled) loadLevel(+b.dataset.i);
});
$('btn-continue').onclick = () => loadLevel(Math.min(prog.unlocked, LEVELS.length) - 1);
$('btn-undo').onclick = undo;
$('btn-restart').onclick = restart;
$('btn-levels').onclick = toMenu;
$('btn-next').onclick = () => loadLevel(G.idx + 1);
$('btn-replay').onclick = () => loadLevel(G.idx);
$('btn-tolevels').onclick = toMenu;

const KEYS = { ArrowLeft: 0, KeyA: 0, ArrowUp: 1, KeyW: 1, ArrowRight: 2, KeyD: 2, ArrowDown: 3, KeyS: 3 };
window.addEventListener('keydown', e => {
  if (e.code in KEYS) { e.preventDefault(); if (G.state === 'play') tryMove(KEYS[e.code]); }
  else if (e.code === 'KeyZ' || e.code === 'KeyU' || e.code === 'Backspace') { e.preventDefault(); undo(); }
  else if (e.code === 'KeyR') restart();
  else if (e.code === 'KeyM') toggleMute();
  else if (e.code === 'Escape') { if (G.state === 'play' || G.state === 'win') toMenu(); }
  else if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyN') {
    e.preventDefault();
    if (G.state === 'win' && G.idx < LEVELS.length - 1) loadLevel(G.idx + 1);
    else if (G.state === 'menu') $('btn-continue').click();
  }
});
// 触屏 / 鼠标：滑动 = 走一步；点按 = 相邻则走 / 远处则自动寻路
let ptr = null;
canvas.addEventListener('pointerdown', e => { ptr = [e.clientX, e.clientY]; });
canvas.addEventListener('pointerup', e => {
  if (!ptr) return;
  const dx = e.clientX - ptr[0], dy = e.clientY - ptr[1];
  ptr = null;
  if (Math.hypot(dx, dy) > 24) { tryMove(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 2 : 0) : (dy > 0 ? 3 : 1)); return; }
  const r = canvas.getBoundingClientRect();
  const lx = (e.clientX - r.left) / r.width * W, ly = (e.clientY - r.top) / r.height * H;
  tapTile(Math.floor((lx - G.ox) / G.ts), Math.floor((ly - G.oy) / G.ts));
});
function toggleMute() {
  muted = !muted; LS.set('soko-muted', muted);
  $('btn-mute').textContent = muted ? '🔇' : '🔊';
}
$('btn-mute').onclick = toggleMute;
$('btn-mute').textContent = muted ? '🔇' : '🔊';
window.__refreshLang = function () {
  AMG.apply(STR);
  $('btn-mute').title = T('muteTitle');
  if (G.state === 'menu') buildMenu();
};
AMG.mountBtn();
window.__refreshLang();

// ---------- 渲染 ----------
function rr(x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
}
function drawWall(px, py, s) {
  ctx.fillStyle = '#7a4b2e'; ctx.fillRect(px, py, s, s);
  ctx.fillStyle = '#9a6240';
  const bh = s / 3;
  for (let r = 0; r < 3; r++) {
    const off = r % 2 ? s / 2 : 0;
    for (let c = -1; c < 2; c++) {
      const bx = px + off + c * s / 2 + 1, w = s / 2 - 2;
      const x0 = Math.max(px + 1, bx), x1 = Math.min(px + s - 1, bx + w);
      if (x1 > x0) ctx.fillRect(x0, py + r * bh + 1, x1 - x0, bh - 2);
    }
  }
  ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(px, py, s, 2);
}
function drawBox(px, py, s, onGoal, dead) {
  const m = s * .08;
  rr(px + m, py + m, s - m * 2, s - m * 2, s * .12);
  ctx.fillStyle = onGoal ? '#5fae68' : dead ? '#c2553d' : '#d0924e'; ctx.fill();
  ctx.lineWidth = Math.max(2, s * .07); ctx.strokeStyle = onGoal ? '#3d7f47' : dead ? '#8f3324' : '#8d5a2b'; ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(px + m * 2, py + m * 2); ctx.lineTo(px + s - m * 2, py + s - m * 2);
  ctx.moveTo(px + s - m * 2, py + m * 2); ctx.lineTo(px + m * 2, py + s - m * 2);
  ctx.lineWidth = Math.max(2, s * .06); ctx.stroke();
  if (onGoal) {
    ctx.fillStyle = '#fff'; ctx.font = '900 ' + Math.round(s * .42) + 'px system-ui';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('✓', px + s / 2, py + s / 2 + 1);
    ctx.textBaseline = 'alphabetic';
  }
}
function drawPlayer(px, py, s) {
  const cx = px + s / 2, cy = py + s / 2, r = s * .36;
  const bob = Math.sin(G.t * 6) * s * .02;
  ctx.fillStyle = 'rgba(0,0,0,.18)';
  ctx.beginPath(); ctx.ellipse(cx, py + s * .88, r * .8, r * .25, 0, 0, 7); ctx.fill();
  ctx.fillStyle = '#f59e0b';
  ctx.beginPath(); ctx.arc(cx, cy + bob, r, 0, 7); ctx.fill();
  ctx.fillStyle = '#2563eb';
  ctx.beginPath(); ctx.arc(cx, cy + bob - r * .25, r, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
  ctx.fillRect(cx - r * 1.05, cy + bob - r * .48, r * 2.1, r * .18);
  const d = DIRS[G.face];
  for (const sx of [-1, 1]) {
    const ex = cx + sx * r * .36 + d.x * r * .28, ey = cy + bob + r * .08 + d.y * r * .22;
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex, ey, r * .22, 0, 7); ctx.fill();
    ctx.fillStyle = '#1f2937'; ctx.beginPath(); ctx.arc(ex + d.x * r * .08, ey + d.y * r * .08, r * .11, 0, 7); ctx.fill();
  }
}
const lerp = (a, b, k) => a + (b - a) * k;
function render() {
  ctx.fillStyle = '#2a1f17'; ctx.fillRect(0, 0, W, H);
  if (G.state === 'menu' || !G.walls) return;
  const s = G.ts, k = 1 - G.anim * G.anim;
  // HUD
  ctx.fillStyle = '#fbe7c6'; ctx.font = '900 20px system-ui'; ctx.textAlign = 'left';
  ctx.fillText(T('levelN', G.idx + 1), 20, 34);
  ctx.font = '700 13px system-ui'; ctx.fillStyle = '#c9a77c';
  const st = prog.stars[G.idx] || 0;
  ctx.fillText(T('bestLine', prog.best[G.idx] || '-', LEVELS[G.idx].opt) + '  ' + '★'.repeat(st) + '☆'.repeat(3 - st), 20, 56);
  ctx.textAlign = 'right'; ctx.font = '900 15px system-ui'; ctx.fillStyle = '#fbe7c6';
  ctx.fillText(T('hudMoves', G.moves), W - 20, 30);
  ctx.fillText(T('hudPushes', G.pushes), W - 20, 52);
  const onGoals = G.boxes.filter(b => G.goals[b.y][b.x]).length;
  ctx.font = '700 13px system-ui'; ctx.fillStyle = '#9ad3a0';
  ctx.fillText('📦 ' + onGoals + ' / ' + G.boxes.length, W - 20, 70);
  // 地图
  for (let y = 0; y < G.h; y++) for (let x = 0; x < G.w; x++) {
    const px = G.ox + x * s, py = G.oy + y * s;
    if (G.walls[y][x]) { drawWall(px, py, s); continue; }
    if (!G.inside[y][x]) continue;
    ctx.fillStyle = (x + y) % 2 ? '#e7d3ad' : '#dfc89f';
    ctx.fillRect(px, py, s, s);
    if (G.goals[y][x]) {
      const pulse = 1 + Math.sin(G.t * 4) * .08;
      ctx.strokeStyle = '#d97706'; ctx.lineWidth = Math.max(2, s * .08);
      ctx.beginPath(); ctx.arc(px + s / 2, py + s / 2, s * .22 * pulse, 0, 7); ctx.stroke();
      ctx.fillStyle = 'rgba(245,158,11,.35)';
      ctx.beginPath(); ctx.arc(px + s / 2, py + s / 2, s * .12, 0, 7); ctx.fill();
    }
  }
  // 路径预览
  if (G.path.length) {
    let x = G.p.x, y = G.p.y;
    ctx.fillStyle = 'rgba(37,99,235,.35)';
    for (const di of G.path) {
      x += DIRS[di].x; y += DIRS[di].y;
      ctx.beginPath(); ctx.arc(G.ox + x * s + s / 2, G.oy + y * s + s / 2, s * .09, 0, 7); ctx.fill();
    }
  }
  for (const b of G.boxes) {
    const bx = lerp(b.px, b.x, k), by = lerp(b.py, b.y, k);
    drawBox(G.ox + bx * s, G.oy + by * s, s, G.goals[b.y][b.x], deadBox(b));
  }
  drawPlayer(G.ox + lerp(G.p.px, G.p.x, k) * s, G.oy + lerp(G.p.py, G.p.y, k) * s, s);
}

let last = performance.now();
function loop(now) {
  const dt = Math.min((now - last) / 1000, .05);
  last = now; G.t += dt;
  if (G.anim > 0) G.anim = Math.max(0, G.anim - dt / .09);
  if (G.path.length && G.anim === 0 && G.state === 'play') {
    G.stepT -= dt;
    if (G.stepT <= 0) { const di = G.path.shift(); if (!tryMove(di, true)) G.path = []; G.stepT = .02; }
  }
  render();
  requestAnimationFrame(loop);
}
toMenu();
requestAnimationFrame(t => { last = t; requestAnimationFrame(loop); });
window.__game = G;
window.__gameApi = { loadLevel, tryMove, undo, restart, tapTile, findPath, LEVELS, starsFor, toMenu };
window.__gameErrors = [];
window.addEventListener('error', e => window.__gameErrors.push(String(e.message)));
})();
