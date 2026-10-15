(() => {
'use strict';
// 泡泡龙：偶数行 12 / 奇数行 11 的六边形错位网格；吸附到最近空位；同色洪泛消除 + 悬空检测掉落
const { $, T } = KIT;
const store = KIT.store('amg-bubble');
const W = 480, H = 700, R = 20, D = R * 2, RH = R * Math.sqrt(3), HUD = 48;
const SX = W / 2, SY = 638, DEADLINE = 588, SPEED = 1150;
const cv = $('game'), frame = $('frame');
const ctx = KIT.canvas(cv, W, H);

const COLORS = ['#ef5b5b', '#f6c445', '#5fbf6a', '#4f9be8', '#a979e0', '#f08a3a'];
const DARKS = ['#b83a3a', '#c4921d', '#3b8d46', '#2f6fb8', '#7650ad', '#c2621a'];
// 关卡：颜色数 / 行数 / 形状（是否放泡泡）/ 下压前允许的失误数
const LV = [
  { c: 3, rows: 6, s: () => true },
  { c: 3, rows: 7, s: (r, x) => Math.abs(x - W / 2) < W / 2 - r * 26 + 10 },
  { c: 4, rows: 6, s: () => true },
  { c: 4, rows: 8, s: (r, x) => r < 3 || x < 170 || x > 310 },
  { c: 4, rows: 8, s: (r, x) => Math.abs(x - W / 2) + Math.abs(r - 4) * 38 > 120 || r < 1 },
  { c: 5, rows: 7, s: () => true },
  { c: 5, rows: 8, s: (r, x, c) => r < 2 || c % 3 !== 1 },
  { c: 5, rows: 9, s: (r, x) => r < 2 || ((Math.floor(x / 40) + r) % 4) < 3 },
  { c: 5, rows: 9, s: () => true },
  { c: 6, rows: 9, s: (r, x) => Math.abs(x - W / 2) < 70 + Math.abs(r - 4) * 46 },
  { c: 6, rows: 8, s: () => true },
  { c: 6, rows: 10, s: (r, x) => r < 3 || x < 130 || x > 350 || (r > 6) }
];
const LV_EMO = ['🌱', '🔻', '🍬', '🏛️', '💠', '🌈', '🧩', '〰️', '🎪', '⏳', '🌋', '👑'];

let mode = 'menu', endless = false, level = 0, pick = 0;
let grid = [], shift = 0, ceil = 0, topY = HUD, nColors = 3;
let cur = null, next = null, shot = null, aim = -Math.PI / 2;
let score = 0, shots = 0, popped = 0, dropped = 0, misses = 0, missLimit = 6, streak = 0, startCount = 0, sinceRow = 0;
let pops = [], falls = [], texts = [], bestAtStart = 0, warnShown = false;
const keys = {};
const parts = new KIT.Particles();

// ---------------- 网格工具 ----------------
const odd = r => ((r + shift) & 1) === 1;
const cols = r => (odd(r) ? 11 : 12);
const cx = (r, c) => R + c * D + (odd(r) ? R : 0);
const cy = r => topY + R + r * RH;
function cell(r, c) { return grid[r] && c >= 0 && c < cols(r) ? grid[r][c] : null; }
function ensureRow(r) { while (grid.length <= r) grid.push(Array(12).fill(null)); }
function nbrs(r, c) {
  const o = odd(r) ? 1 : 0;
  const L = [[r, c - 1], [r, c + 1], [r - 1, c - 1 + o], [r - 1, c + o], [r + 1, c - 1 + o], [r + 1, c + o]];
  return L.filter(([a, b]) => a >= 0 && b >= 0 && b < cols(a));
}
function each(fn) { for (let r = 0; r < grid.length; r++) for (let c = 0; c < cols(r); c++) if (grid[r][c]) fn(grid[r][c], r, c); }
function count() { let n = 0; each(() => n++); return n; }
function colorsOnBoard() { const s = new Set(); each(b => { if (b.k === 'n') s.add(b.c); }); return [...s]; }

// 种子随机：同一关每次布局一致；约 1/3 概率沿用左/上邻居颜色，形成成块的色团
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function buildLevel(i) {
  const L = LV[i], rnd = rng(1000 + i * 7919);
  grid = []; shift = 0; ceil = 0;
  for (let r = 0; r < L.rows; r++) {
    ensureRow(r);
    for (let c = 0; c < cols(r); c++) {
      if (!L.s(r, cx(r, c), c)) continue;
      let col = (rnd() * L.c) | 0;
      if (rnd() < 0.34) {
        const left = cell(r, c - 1), up = nbrs(r, c).map(([a, b]) => a < r ? cell(a, b) : null).find(Boolean);
        const src = rnd() < 0.5 ? left || up : up || left;
        if (src) col = src.c;
      }
      grid[r][c] = { k: 'n', c: col };
    }
  }
  removeFloating(true);
}
function randomRow(r) {
  ensureRow(r);
  for (let c = 0; c < cols(r); c++) {
    const prev = cell(r, c - 1);
    grid[r][c] = { k: 'n', c: prev && Math.random() < 0.45 ? prev.c : (Math.random() * nColors) | 0 };
  }
}

// ---------------- 音效 ----------------
const sfx = {
  shoot: () => KIT.tone(520, 0.1, { type: 'triangle', vol: 0.06, to: 780 }),
  bounce: () => KIT.tone(300, 0.04, { type: 'triangle', vol: 0.03 }),
  stick: () => KIT.tone(180, 0.07, { type: 'sine', vol: 0.06 }),
  pop: (i, n) => KIT.tone(600 + i * 70 + Math.min(n, 8) * 20, 0.07, { type: 'sine', vol: 0.06, to: 900 + i * 70, delay: i * 0.035 }),
  drop: () => KIT.arp([880, 740, 620, 520], 0.05, { type: 'triangle', vol: 0.05, dur: 0.12 }),
  bomb: () => { KIT.noise(0.4, { vol: 0.18, lp: 1300 }); KIT.tone(120, 0.3, { vol: 0.14, to: 50 }); },
  ceil: () => { KIT.tone(110, 0.25, { type: 'sawtooth', vol: 0.05, to: 70 }); KIT.noise(0.2, { vol: 0.06, lp: 500 }); },
  swap: () => KIT.tone(700, 0.06, { type: 'sine', vol: 0.05, to: 500 }),
  clear: () => KIT.arp([523, 659, 784, 1047, 1319], 0.09, { vol: 0.08, dur: 0.22 }),
  lose: () => KIT.arp([392, 330, 262, 196], 0.15, { type: 'triangle', vol: 0.08, dur: 0.28 })
};

// ---------------- 泡泡生成 ----------------
function makeBubble() {
  const pool = colorsOnBoard();
  const special = level >= 2 || endless;
  const r = Math.random();
  if (special && r < 0.035) return { k: 'bomb', c: -1 };
  if (special && r < 0.07) return { k: 'rainbow', c: -1 };
  const list = pool.length ? pool : [...Array(nColors).keys()];
  return { k: 'n', c: list[(Math.random() * list.length) | 0] };
}
// 场上已消失的颜色不再出现在发射器里
function refreshQueue() {
  const pool = colorsOnBoard();
  for (const b of [cur, next]) if (b && b.k === 'n' && pool.length && !pool.includes(b.c)) b.c = pool[(Math.random() * pool.length) | 0];
}

// ---------------- 开局 ----------------
function start(i, isEndless) {
  endless = !!isEndless; level = i;
  score = shots = popped = dropped = misses = streak = sinceRow = 0;
  pops = []; falls = []; texts = []; parts.clear(); shot = null; warnShown = false;
  if (endless) {
    nColors = 4; grid = []; shift = 0; ceil = 0;
    for (let r = 0; r < 6; r++) randomRow(r);
    missLimit = 5;
    bestAtStart = store.get('best', 0);
  } else {
    nColors = LV[i].c;
    buildLevel(i);
    missLimit = Math.max(4, 9 - nColors);
  }
  topY = HUD + ceil * RH;
  startCount = count();
  cur = makeBubble(); next = makeBubble();
  mode = 'play';
  hideScreens();
  KIT.music('jewel-glow');
}

// ---------------- 发射与吸附 ----------------
function fire() {
  if (mode !== 'play' || shot) return;
  shot = { x: SX, y: SY, vx: Math.cos(aim) * SPEED, vy: Math.sin(aim) * SPEED, b: cur };
  cur = next; next = makeBubble();
  shots++;
  sfx.shoot();
}
function swap() {
  if (mode !== 'play' || shot) return;
  [cur, next] = [next, cur];
  sfx.swap();
}

function collides(x, y) {
  if (y - R <= topY) return true;
  const rr = Math.round((y - topY - R) / RH);
  for (let r = Math.max(0, rr - 1); r <= Math.min(grid.length - 1, rr + 1); r++) {
    for (let c = 0; c < cols(r); c++) {
      if (!grid[r][c]) continue;
      const dx = x - cx(r, c), dy = y - cy(r);
      if (dx * dx + dy * dy < (D - 6) * (D - 6)) return true;
    }
  }
  return false;
}

function snap(x, y) {
  const rr = Math.max(0, Math.round((y - topY - R) / RH));
  let best = null, bd = Infinity;
  for (let r = Math.max(0, rr - 1); r <= rr + 1; r++) {
    for (let c = 0; c < cols(r); c++) {
      if (cell(r, c)) continue;
      const supported = r === 0 || nbrs(r, c).some(([a, b]) => cell(a, b));
      if (!supported) continue;
      const d = Math.hypot(x - cx(r, c), y - cy(r));
      if (d < bd) { bd = d; best = [r, c]; }
    }
  }
  return best || [Math.max(0, rr), KIT.clamp(Math.round((x - R) / D), 0, 10)];
}

function updateShot(dt) {
  const n = Math.ceil(SPEED * dt / 6);
  for (let i = 0; i < n; i++) {
    shot.x += shot.vx * dt / n; shot.y += shot.vy * dt / n;
    if (shot.x < R) { shot.x = R; shot.vx = Math.abs(shot.vx); sfx.bounce(); }
    if (shot.x > W - R) { shot.x = W - R; shot.vx = -Math.abs(shot.vx); sfx.bounce(); }
    if (collides(shot.x, shot.y)) { land(); return; }
  }
}

function land() {
  const [r, c] = snap(shot.x, shot.y);
  ensureRow(r);
  const b = shot.b;
  shot = null;
  if (b.k === 'rainbow') {
    const tally = {};
    nbrs(r, c).forEach(([a, d]) => { const o = cell(a, d); if (o && o.k === 'n') tally[o.c] = (tally[o.c] || 0) + 1; });
    const keysT = Object.keys(tally);
    b.c = keysT.length ? +keysT.sort((p, q) => tally[q] - tally[p])[0] : 0;
    b.k = 'n';
  }
  grid[r][c] = b;
  b.squish = 1;

  let removed = 0;
  if (b.k === 'bomb') {
    sfx.bomb();
    const x0 = cx(r, c), y0 = cy(r);
    parts.burst(x0, y0, { n: 36, color: ['#f2b84b', '#e0603a', '#fff2c8'], speed: 320, size: 6, life: 0.7, gravity: 150 });
    const hit = [];
    each((o, a, d) => { if (Math.hypot(cx(a, d) - x0, cy(a) - y0) < D * 2.05) hit.push([a, d]); });
    removed = popCells(hit, x0, y0);
  } else {
    const group = flood(r, c);
    if (group.length >= 3) removed = popCells(group, cx(r, c), cy(r));
    else sfx.stick();
  }

  if (removed) {
    streak++;
    const fell = removeFloating(false);
    if (streak >= 2) floatText(SX, SY - 120, T('combo', Math.min(streak, 5)), '#f2b84b', 22);
    const total = removed + fell;
    if (total >= 8) KIT.toast($('toast'), T('nice')[Math.min(3, Math.floor((total - 8) / 6))]);
  } else {
    streak = 0;
    misses++;
  }

  if (endless) {
    sinceRow++;
    if (misses >= missLimit || sinceRow >= 9) pushRow();
  } else if (misses >= missLimit) {
    lowerCeiling();
  } else if (misses === missLimit - 1 && !warnShown) {
    warnShown = true;
    KIT.toast($('toast'), T('warn'));
  }
  refreshQueue();
  checkEnd();
}

function flood(r, c) {
  const color = grid[r][c].c, seen = new Set([r + ',' + c]), out = [[r, c]], q = [[r, c]];
  while (q.length) {
    const [a, b] = q.pop();
    for (const [x, y] of nbrs(a, b)) {
      const o = cell(x, y), key = x + ',' + y;
      if (!o || seen.has(key) || o.k !== 'n' || o.c !== color) continue;
      seen.add(key); out.push([x, y]); q.push([x, y]);
    }
  }
  return out;
}

function popCells(list, ox, oy) {
  const mult = 1 + Math.min(streak, 4) * 0.5;
  list.sort((p, q) => Math.hypot(cx(p[0], p[1]) - ox, cy(p[0]) - oy) - Math.hypot(cx(q[0], q[1]) - ox, cy(q[0]) - oy));
  list.forEach(([r, c], i) => {
    const b = grid[r][c];
    if (!b) return;
    pops.push({ x: cx(r, c), y: cy(r), b, t: -i * 0.035 });
    grid[r][c] = null;
    if (i < 10) sfx.pop(i, list.length);
  });
  const n = list.length;
  popped += n;
  score += Math.round(n * 10 * mult);
  return n;
}

function removeFloating(silent) {
  const seen = new Set(), q = [];
  if (grid[0]) for (let c = 0; c < cols(0); c++) if (grid[0][c]) { seen.add('0,' + c); q.push([0, c]); }
  while (q.length) {
    const [a, b] = q.pop();
    for (const [x, y] of nbrs(a, b)) {
      const key = x + ',' + y;
      if (!cell(x, y) || seen.has(key)) continue;
      seen.add(key); q.push([x, y]);
    }
  }
  let n = 0;
  each((b, r, c) => {
    if (seen.has(r + ',' + c)) return;
    if (!silent) falls.push({ x: cx(r, c), y: cy(r), vx: KIT.rand(-60, 60), vy: KIT.rand(-160, -40), b, rot: 0 });
    grid[r][c] = null; n++;
  });
  if (n && !silent) {
    dropped += n;
    const pts = n * 20 * (n >= 6 ? 2 : 1);
    score += pts;
    floatText(SX, SY - 160, T('drop', pts), '#5fbf6a', 20);
    setTimeout(sfx.drop, 150);
  }
  while (grid.length && grid[grid.length - 1].every(x => !x)) grid.pop();
  return n;
}

function lowerCeiling() {
  misses = 0; warnShown = false;
  ceil++;
  sfx.ceil();
  KIT.toast($('toast'), '⬇️');
}
function pushRow() {
  misses = 0; sinceRow = 0;
  shift ^= 1;
  grid.unshift(Array(12).fill(null));
  randomRow(0);
  topY -= RH; // 新行从上方滑入
  nColors = Math.min(6, 4 + Math.floor(shots / 40));
  sfx.ceil();
}

function lowestY() {
  let m = 0;
  each((b, r) => { m = Math.max(m, HUD + ceil * RH + R + r * RH + R); });
  return m;
}
function checkEnd() {
  if (mode !== 'play') return;
  if (!count()) {
    mode = 'clear';
    score += 1000 + Math.max(0, startCount - shots) * 15;
    sfx.clear();
    for (let k = 0; k < 5; k++) setTimeout(() => parts.burst(KIT.rand(60, W - 60), KIT.rand(140, 340), {
      n: 24, color: COLORS, shape: 'square', speed: 240, life: 1.2, size: 6, gravity: 300
    }), k * 130);
    if (!endless) {
      const un = store.get('unlocked', 0);
      if (level + 1 > un && level + 1 < LV.length) store.set('unlocked', level + 1);
      const stars = shots <= startCount / 2.4 ? 3 : shots <= startCount / 1.6 ? 2 : 1;
      const sv = store.get('stars', {});
      if (!sv[level] || sv[level] < stars) { sv[level] = stars; store.set('stars', sv); }
      setTimeout(() => showPanel(level === LV.length - 1 ? 'win' : 'clear', stars), 900);
    } else {
      // 无尽模式清空了：直接再来 6 行
      setTimeout(() => { for (let r = 0; r < 6; r++) randomRow(r); mode = 'play'; }, 800);
    }
    return;
  }
  if (lowestY() > DEADLINE) {
    mode = 'over';
    sfx.lose();
    KIT.stopMusic();
    each((b, r, c) => falls.push({ x: cx(r, c), y: cy(r), vx: KIT.rand(-80, 80), vy: KIT.rand(-200, 0), b, rot: 0, slow: true }));
    grid = [];
    if (endless && score > store.get('best', 0)) store.set('best', score);
    setTimeout(() => showPanel('over'), 1200);
  }
}

function floatText(x, y, s, color, size) { texts.push({ x, y, s, color, size: size || 18, age: 0, life: 1.1 }); }

// ---------------- 绘制 ----------------
const sprite = {};
function bubbleSprite(key, draw) {
  if (sprite[key]) return sprite[key];
  const dpr = Math.min(window.devicePixelRatio || 1, 2), s = Math.ceil((D + 4) * dpr);
  const c = document.createElement('canvas'); c.width = c.height = s;
  const g = c.getContext('2d'); g.scale(dpr, dpr); g.translate(R + 2, R + 2);
  draw(g);
  return (sprite[key] = c);
}
const GLYPH = [
  g => { g.beginPath(); g.arc(0, 0, 5, 0, 7); g.fill(); },
  g => { star(g, 6.5, 2.8); },
  g => { g.beginPath(); g.moveTo(0, -6); g.lineTo(6, 4); g.lineTo(-6, 4); g.closePath(); g.fill(); },
  g => { g.fillRect(-5, -5, 10, 10); },
  g => { g.beginPath(); g.moveTo(0, -6.5); g.lineTo(6, 0); g.lineTo(0, 6.5); g.lineTo(-6, 0); g.closePath(); g.fill(); },
  g => { g.beginPath(); g.arc(-2.5, -1, 3.2, 0, 7); g.arc(2.5, -1, 3.2, 0, 7); g.moveTo(-5.6, 0); g.lineTo(0, 6); g.lineTo(5.6, 0); g.fill(); }
];
function star(g, ro, ri) {
  g.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? ri : ro; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  g.closePath(); g.fill();
}
function getSprite(b) {
  if (b.k === 'bomb') return bubbleSprite('bomb', g => {
    const gr = g.createRadialGradient(-6, -6, 2, 0, 0, R);
    gr.addColorStop(0, '#6b625a'); gr.addColorStop(1, '#2a241f');
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, R - 1, 0, 7); g.fill();
    g.fillStyle = '#f2b84b'; g.font = 'bold 15px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('💣', 0, 1);
  });
  if (b.k === 'rainbow') return bubbleSprite('rainbow', g => {
    COLORS.forEach((col, i) => { g.fillStyle = col; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, R - 1, i * Math.PI / 3, (i + 1) * Math.PI / 3); g.fill(); });
    g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.arc(0, 0, R * 0.45, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.ellipse(-7, -8, 6, 3.5, -0.6, 0, 7); g.fill();
  });
  return bubbleSprite('n' + b.c, g => {
    const gr = g.createRadialGradient(-6, -7, 2, 0, 0, R);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.25, COLORS[b.c]); gr.addColorStop(1, DARKS[b.c]);
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, R - 1, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,255,255,.28)'; GLYPH[b.c](g);
    g.fillStyle = 'rgba(255,255,255,.75)'; g.beginPath(); g.ellipse(-7, -9, 5.5, 3, -0.6, 0, 7); g.fill();
  });
}
function drawBubble(b, x, y, scale, alpha) {
  const s = getSprite(b), size = D + 4;
  ctx.globalAlpha = alpha == null ? 1 : alpha;
  const k = scale || 1;
  ctx.drawImage(s, x - size / 2 * k, y - size / 2 * k, size * k, size * k);
  ctx.globalAlpha = 1;
}

function pal() {
  return KIT.dark()
    ? { bg1: '#2b2118', bg2: '#1b140d', grid: 'rgba(242,231,212,.04)', ink: '#f2e7d4', soft: '#bfa98a', hud: 'rgba(20,14,8,.55)', line: 'rgba(240,120,90,.55)', ceil: '#4a3826', base: '#5c4731', guide: 'rgba(255,240,215,.75)' }
    : { bg1: '#fdf7ec', bg2: '#eedfc5', grid: 'rgba(120,90,50,.06)', ink: '#3a2e24', soft: '#8a7660', hud: 'rgba(255,250,240,.78)', line: 'rgba(224,80,60,.5)', ceil: '#d9c4a2', base: '#c9a982', guide: 'rgba(90,60,30,.55)' };
}

// 瞄准线：模拟最多 3 次墙面反弹，停在第一次碰撞点
function guidePath() {
  let x = SX, y = SY, vx = Math.cos(aim), vy = Math.sin(aim);
  const pts = [];
  for (let i = 0; i < 900; i++) {
    x += vx * 5; y += vy * 5;
    if (x < R) { x = R; vx = Math.abs(vx); }
    if (x > W - R) { x = W - R; vx = -Math.abs(vx); }
    if (i % 4 === 0) pts.push([x, y]);
    if (collides(x, y)) return { pts, end: snap(x, y) };
  }
  return { pts, end: null };
}

function draw(now) {
  const P = pal();
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, P.bg1); g.addColorStop(1, P.bg2);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = P.grid;
  for (let y = HUD; y < H; y += 26) for (let x = (y / 26 % 2) * 13; x < W; x += 26) { ctx.beginPath(); ctx.arc(x, y, 2, 0, 7); ctx.fill(); }

  // 天花板（压下来的部分）
  if (topY > HUD + 1) {
    ctx.fillStyle = P.ceil; ctx.fillRect(0, HUD, W, topY - HUD);
    ctx.fillStyle = 'rgba(0,0,0,.12)';
    for (let x = 0; x < W; x += 24) ctx.fillRect(x, HUD, 2, topY - HUD);
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(0, topY - 4, W, 4);
  }

  // 底线
  ctx.strokeStyle = P.line; ctx.lineWidth = 2; ctx.setLineDash([10, 8]);
  ctx.beginPath(); ctx.moveTo(0, DEADLINE); ctx.lineTo(W, DEADLINE); ctx.stroke(); ctx.setLineDash([]);

  // 网格泡泡
  const danger = lowestY() > DEADLINE - RH * 1.5;
  each((b, r, c) => {
    let k = 1;
    if (b.squish) { b.squish = Math.max(0, b.squish - 0.08); k = 1 + Math.sin(b.squish * Math.PI) * 0.12; }
    const wob = danger && mode === 'play' ? Math.sin(now / 60 + r + c) * 1.2 : 0;
    drawBubble(b, cx(r, c) + wob, cy(r), k);
  });

  // 瞄准线
  if (mode === 'play' && !shot) {
    const gp = guidePath();
    ctx.fillStyle = P.guide;
    const off = (now / 40) % 4;
    gp.pts.forEach(([x, y], i) => {
      if (i < 2) return;
      ctx.globalAlpha = Math.max(0.15, 1 - i / 90);
      ctx.beginPath(); ctx.arc(x, y, i % 2 === Math.floor(off / 2) % 2 ? 3 : 2.2, 0, 7); ctx.fill();
    });
    ctx.globalAlpha = 1;
    if (gp.end) {
      const [r, c] = gp.end;
      ctx.strokeStyle = P.guide; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.arc(cx(r, c), cy(r), R - 2, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    }
  }

  // 消除 & 掉落动画
  for (const p of pops) {
    if (p.t < 0) { drawBubble(p.b, p.x, p.y); continue; }
    const k = p.t / 0.22;
    drawBubble(p.b, p.x, p.y, 1 + k * 0.5, 1 - k);
  }
  for (const f of falls) drawBubble(f.b, f.x, f.y, 1, Math.max(0, Math.min(1, (H + 20 - f.y) / 120)));

  if (shot) drawBubble(shot.b, shot.x, shot.y);

  // 发射器
  ctx.save(); ctx.translate(SX, SY);
  ctx.fillStyle = P.base;
  ctx.beginPath(); ctx.arc(0, 26, 46, Math.PI, 0); ctx.fill();
  ctx.rotate(aim + Math.PI / 2);
  ctx.fillStyle = P.soft;
  KIT.roundRect(ctx, -9, -58, 18, 40, 8); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(-5, -54, 4, 30);
  ctx.restore();
  if (cur && !(mode === 'over')) drawBubble(cur, SX, SY);
  if (next) {
    ctx.fillStyle = P.soft; ctx.globalAlpha = 0.25;
    ctx.beginPath(); ctx.arc(SX + 78, SY + 18, R * 0.85, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
    drawBubble(next, SX + 78, SY + 18, 0.72);
    ctx.font = '14px system-ui'; ctx.fillStyle = P.soft; ctx.textAlign = 'center';
    ctx.fillText('⇄', SX + 78, SY + 48);
  }
  ctx.font = '34px system-ui, "Apple Color Emoji", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('🐲', SX - 86, SY + 16 + Math.sin(now / 300) * 3);

  parts.draw(ctx);
  for (const t of texts) {
    const k = t.age / t.life;
    ctx.globalAlpha = Math.min(1, (1 - k) * 2);
    ctx.font = `400 ${t.size}px "AMG Display", "PingFang SC", system-ui, sans-serif`;
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(40,28,16,.5)';
    ctx.strokeText(t.s, t.x, t.y - k * 34);
    ctx.fillStyle = t.color; ctx.fillText(t.s, t.x, t.y - k * 34);
  }
  ctx.globalAlpha = 1;
  drawHud(P);
}

function drawHud(P) {
  ctx.fillStyle = P.hud; ctx.fillRect(0, 0, W, HUD);
  ctx.fillStyle = 'rgba(0,0,0,.08)'; ctx.fillRect(0, HUD - 1, W, 1);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left'; ctx.fillStyle = P.soft; ctx.font = '800 10px system-ui, sans-serif';
  ctx.fillText(T('hudScore'), 14, 14);
  ctx.fillStyle = P.ink; ctx.font = '400 21px "AMG Display", system-ui, sans-serif';
  ctx.fillText(score, 14, 33);
  ctx.textAlign = 'center'; ctx.fillStyle = P.soft; ctx.font = '800 10px system-ui, sans-serif';
  ctx.fillText(endless ? T('hudEndless') : T('hudLevel'), W / 2, 14);
  ctx.fillStyle = P.ink; ctx.font = '400 19px "AMG Display", system-ui, sans-serif';
  ctx.fillText(endless ? '♾️' : LV_EMO[level] + ' ' + (level + 1), W / 2, 33);
  // 下压倒计时圆点
  ctx.textAlign = 'right'; ctx.fillStyle = P.soft; ctx.font = '800 10px system-ui, sans-serif';
  ctx.fillText(T('hudDrop'), W - 54, 14);
  for (let i = 0; i < missLimit; i++) {
    ctx.fillStyle = i < missLimit - misses ? '#5fbf6a' : 'rgba(224,80,60,.75)';
    ctx.beginPath(); ctx.arc(W - 54 - i * 11, 33, 4, 0, 7); ctx.fill();
  }
}

// ---------------- 主循环 ----------------
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.033, (now - last) / 1000); last = now;
  if (mode !== 'pause') {
    if (keys.left) aim -= 1.6 * dt;
    if (keys.right) aim += 1.6 * dt;
    aim = KIT.clamp(aim, -Math.PI + 0.13, -0.13);
    if (shot && mode === 'play') updateShot(dt);
    const target = HUD + ceil * RH;
    topY += (target - topY) * Math.min(1, dt * 8);
    if (Math.abs(target - topY) < 0.3) topY = target;
    for (let i = pops.length - 1; i >= 0; i--) {
      const p = pops[i];
      const was = p.t;
      p.t += dt;
      if (was < 0 && p.t >= 0) parts.burst(p.x, p.y, { n: 8, color: [COLORS[p.b.c] || '#fff', '#fff'], speed: 140, size: 4, life: 0.5 });
      if (p.t > 0.22) pops.splice(i, 1);
    }
    for (let i = falls.length - 1; i >= 0; i--) {
      const f = falls[i];
      f.vy += (f.slow ? 700 : 1300) * dt; f.x += f.vx * dt; f.y += f.vy * dt;
      if (f.y > H + 40) falls.splice(i, 1);
    }
    for (let i = texts.length - 1; i >= 0; i--) { texts[i].age += dt; if (texts[i].age > texts[i].life) texts.splice(i, 1); }
    parts.update(dt);
    if (mode === 'play' && topY === HUD + ceil * RH && lowestY() > DEADLINE) checkEnd();
  }
  draw(now);
  requestAnimationFrame(loop);
}

// ---------------- 界面 ----------------
function hideScreens() { ['screen-menu', 'screen-pause', 'screen-over'].forEach(id => $(id).classList.add('hidden')); }
function showMenu() {
  mode = 'menu';
  KIT.stopMusic();
  hideScreens();
  endless = false; level = pick; nColors = LV[pick].c; buildLevel(pick); topY = HUD;
  cur = next = null; shot = null; pops = []; falls = []; texts = [];
  renderMenu();
  $('screen-menu').classList.remove('hidden');
}
function renderMenu() {
  const un = store.get('unlocked', 0), sv = store.get('stars', {}), box = $('levels');
  box.innerHTML = '';
  LV.forEach((_, i) => {
    const b = document.createElement('button');
    b.className = 'lvl-btn' + (i === pick ? ' active' : '') + (i > un ? ' locked' : '');
    const st = sv[i] ? '★'.repeat(sv[i]) + '☆'.repeat(3 - sv[i]) : '';
    b.innerHTML = `<span class="lv-emo">${i > un ? '🔒' : LV_EMO[i]}</span>${i + 1}<small>${st || '&nbsp;'}</small>`;
    b.onclick = () => {
      if (i > un) { KIT.tone(150, 0.1, { vol: 0.05 }); return; }
      pick = i; KIT.tone(500 + i * 30, 0.06, { type: 'triangle', vol: 0.05 });
      showMenu();
    };
    box.appendChild(b);
  });
  $('menu-best').textContent = T('best', store.get('best', 0));
}
function showPanel(kind, stars) {
  const clear = kind === 'clear', win = kind === 'win';
  $('over-icon').textContent = win ? '👑' : clear ? '🎉' : '😵';
  const t = $('over-title');
  t.textContent = win ? T('winTitle') : clear ? T('clearTitle', level + 1) : T('overTitle');
  t.className = clear || win ? 'clear-title' : 'over-title';
  $('over-stars').innerHTML = stars ? [1, 2, 3].map(i => `<span class="${i <= stars ? '' : 'off'}" style="animation-delay:${i * 0.15}s">⭐</span>`).join('') : '';
  $('over-record').classList.toggle('hidden', !(endless && score > bestAtStart));
  const rows = [[T('stScore'), score], [T('stShots'), shots], [T('stPopped'), popped], [T('stDropped'), dropped]];
  if (endless) rows.push([T('stBest'), Math.max(score, store.get('best', 0))]);
  else rows.push([T('stLevel'), (level + 1) + ' / ' + LV.length]);
  $('over-stats').innerHTML = rows.map(([a, b]) => `<span>${a}</span><b>${b}</b>`).join('');
  const btn = $('btn-retry');
  btn.textContent = clear ? T('next') : win ? T('again') : T('retry');
  btn.dataset.kind = kind;
  $('screen-over').classList.remove('hidden');
}
function pause(on) {
  if (on && mode === 'play') { mode = 'pause'; $('screen-pause').classList.remove('hidden'); KIT.stopMusic(); }
  else if (!on && mode === 'pause') { mode = 'play'; $('screen-pause').classList.add('hidden'); KIT.music('jewel-glow'); }
}

// ---------------- 输入 ----------------
$('btn-start').onclick = () => start(pick, false);
$('btn-endless').onclick = () => start(0, true);
$('btn-retry').onclick = () => {
  const k = $('btn-retry').dataset.kind;
  if (endless) start(0, true);
  else if (k === 'clear') { pick = level + 1; start(level + 1, false); }
  else if (k === 'win') { pick = 0; start(0, false); }
  else start(level, false);
};
$('btn-menu').onclick = showMenu;
$('btn-quit').onclick = showMenu;
$('btn-resume').onclick = () => pause(false);
$('btn-pause').onclick = e => { e.stopPropagation(); pause(mode !== 'pause'); };

function aimAt(p) {
  if (p.y > SY - 8) return;
  aim = KIT.clamp(Math.atan2(p.y - SY, p.x - SX), -Math.PI + 0.13, -0.13);
}
const nearNext = p => Math.hypot(p.x - (SX + 78), p.y - (SY + 18)) < 30;
let touchAim = false;
frame.addEventListener('pointerdown', e => {
  if (e.target.closest('.screen, button') || mode !== 'play') return;
  const p = KIT.point(cv, e, W, H);
  if (nearNext(p)) { swap(); return; }
  if (e.pointerType === 'mouse') { aimAt(p); fire(); }
  else { touchAim = true; aimAt(p); }
});
frame.addEventListener('pointermove', e => {
  if (mode !== 'play') return;
  if (e.pointerType === 'mouse' || touchAim) aimAt(KIT.point(cv, e, W, H));
});
window.addEventListener('pointerup', e => {
  if (touchAim && e.pointerType !== 'mouse') { touchAim = false; fire(); }
});

document.addEventListener('keydown', e => {
  if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
  const k = e.key;
  if (k === 'ArrowLeft' || k === 'a' || k === 'A') { keys.left = true; e.preventDefault(); }
  else if (k === 'ArrowRight' || k === 'd' || k === 'D') { keys.right = true; e.preventDefault(); }
  else if (k === 'ArrowUp' || k === 'w' || k === 'W' || k === 'Enter') {
    e.preventDefault();
    if (mode === 'menu') start(pick, false); else fire();
  } else if (k === ' ') { e.preventDefault(); swap(); }
  else if (k === 'p' || k === 'P' || k === 'Escape') pause(mode !== 'pause');
});
document.addEventListener('keyup', e => {
  const k = e.key;
  if (k === 'ArrowLeft' || k === 'a' || k === 'A') keys.left = false;
  if (k === 'ArrowRight' || k === 'd' || k === 'D') keys.right = false;
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(true); });

const syncMute = KIT.mountMute($('btn-mute'));
KIT.boot(() => { syncMute(); if (mode === 'menu') renderMenu(); });
pick = Math.min(store.get('unlocked', 0), LV.length - 1);
showMenu();
requestAnimationFrame(loop);
})();
