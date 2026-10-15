/* 坦克大战 · 钢铁城防 —— 致敬 Battle City 的网页重制版
 * 逻辑画布 528×448：左侧 416×416 战场（13×13 格，每格 32px），右侧 96px 信息栏。
 * 地形以 8px 微格存储（52×52），砖墙可被一点点打碎；地图设计稿用 13×13 字符串。
 */
(() => {
'use strict';
const { $, T } = KIT;
const store = KIT.store('amg-tank');
const W = 528, H = 448, FX = 16, FY = 16, FS = 416, MC = 52, HT = 26, STEP = 1 / 60;
const cv = $('game'), c = KIT.canvas(cv, W, H);
const E = 0, BR = 1, ST = 2, WA = 3, TR = 4, IC = 5;
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const MONO = '"Courier New", ui-monospace, Menlo, monospace';
const DISP = '"AMG Display", "PingFang SC", system-ui, sans-serif';
const EMOJI = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", system-ui';
const rnd = (a, b) => a + Math.random() * (b - a);
const ri = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const clamp = KIT.clamp;
const ov = (ax, ay, aw, ah, bx, by, bw, bh) => ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
const hash = (a, b) => { let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

// ---------------- 地图 ----------------
// . 空地  # 砖墙  @ 钢板  ~ 河流  % 树林  = 冰面
// 出生点（上方三处、下方两处）和老鹰周围由程序自动清空 / 砌墙
const CH = { '.': E, '#': BR, '@': ST, '~': WA, '%': TR, '=': IC };
const MAPS = [
  { th: 0, rows: [
    '.............', '.#.#.#.#.#.#.', '.#.#.#.#.#.#.', '.#.#.#@#.#.#.', '.#.#.....#.#.', '.....#.#.....', '@.##.#.#.##.@',
    '.....#.#.....', '.#.#.###.#.#.', '.#.#.#.#.#.#.', '.#.#.....#.#.', '.#.#.....#.#.', '.#.........#.'] },
  { th: 2, rows: [
    '...@.....@...', '.#.@.#.#.@.#.', '.#...#.#...#.', '.#.##...##.#.', '....#@@@#....', '@@..#...#..@@', '.....%.%.....',
    '~~~.##.##.~~~', '.#.........#.', '.#.#@...@#.#.', '.#.#.###.#.#.', '.#.........#.', '.#.#.....#.#.'] },
  { th: 1, rows: [
    '...%%...%%...', '.#%%%.#.%%%#.', '.#%%..#..%%#.', '..%.@@#@@.%..', '##%.......%##', '..%%%.#.%%%..', '.#.%%%%%%%.#.',
    '.#..#####..#.', '%%%.......%%%', '%#%.#.#.#.%#%', '%#..#...#..#%', '....#...#....', '%%.#.....#.%%'] },
  { th: 1, rows: [
    '.............', '.##.##.##.##.', '.#...#.#...#.', '.............', '~~~.~~.~~.~~~', '.@.........@.', '.@.##%%%##.@.',
    '.....%%%.....', '~~.~~~.~~~.~~', '.#.#.....#.#.', '.#.#.#.#.#.#.', '.#.........#.', '...#.....#...'] },
  { th: 3, rows: [
    '.............', '.#.=======.#.', '.#.=#===#=.#.', '...=======...', '@#.=.@=@.=.#@', '...=======...', '##.==#=#==.##',
    '...=======...', '.#.=.=.=.=.#.', '.#.=======.#.', '.#..#...#..#.', '....#...#....', '.##.......##.'] },
  { th: 0, night: true, rows: [
    '.............', '.%#.#.%.#.#%.', '.%#.#.%.#.#%.', '...#.....#...', '@@.#.###.#.@@', '.............', '##.%%#.#%%.##',
    '...%%...%%...', '.#.#.###.#.#.', '.#.#.#.#.#.#.', '...#.....#...', '.%.#.....#.%.', '.%.........%.'] },
  { th: 2, rows: [
    '.............', '.@@@.....@@@.', '.@#@.###.@#@.', '.@#@.#@#.@#@.', '.....#.#.....', '##.#.....#.##', '~~.#.@@@.#.~~',
    '~~.........~~', '.#.###.###.#.', '.#.#.....#.#.', '.#.#.#.#.#.#.', '...#.....#...', '.@.#.....#.@.'] },
  { th: 0, rows: [
    '...#.....#...', '.#.#.###.#.#.', '.#...#.#...#.', '.####.#.####.', '......#......', '@###.###.###@', '...#.....#...',
    '.#.#.#@#.#.#.', '.#...#.#...#.', '.###.#.#.###.', '...#.....#...', '.#.#.....#.#.', '.#.........#.'] },
  { th: 1, rows: [
    '.............', '.~~~.#.#.~~~.', '.~#~.....~#~.', '.~~~.%%%.~~~.', '.....%@%.....', '#.~~~%%%~~~.#', '#.~#.....#~.#',
    '..~~~.#.~~~..', '.#.........#.', '.#.~~.#.~~.#.', '...~~.#.~~...', '.#.........#.', '.#.#.....#.#.'] },
  { th: 2, rows: [
    '..@.......@..', '.#@.#.@.#.@#.', '.#..#.@.#..#.', '....@...@....', '@.#...#...#.@', '..#.@.#.@.#..', '.@..#####..@.',
    '.....%%%.....', '#.@.#.#.#.@.#', '#...#...#...#', '.@.###.###.@.', '...#.....#...', '.@.#.....#.@.'] },
  { th: 3, night: true, rows: [
    '.............', '.=#=.%%%.=#=.', '.=#=.%#%.=#=.', '.===.....===.', '....#===#....', '@@..#=@=#..@@', '....#===#....',
    '.%%.......%%.', '.%%.#.#.#.%%.', '....#.#.#....', '==.##...##.==', '==.........==', '==.#.....#.=='] },
  { th: 0, rows: [
    '.............', '.@.#.@.@.#.@.', '.@.#.@.@.#.@.', '.@.#.....#.@.', '...~~###~~...', '##.~~...~~.##', '@@.~~.@.~~.@@',
    '....%%%%%....', '.#.#%#.#%#.#.', '.#.#.....#.#.', '.#@#.###.#@#.', '.#.........#.', '...#.....#...'] }
];
// 每关 20 辆敌军：[普通, 快速, 火力, 装甲]
const COMP = [[18, 2, 0, 0], [14, 4, 0, 2], [12, 5, 1, 2], [2, 5, 10, 3], [8, 5, 5, 2], [9, 2, 7, 2],
  [7, 4, 6, 3], [7, 4, 7, 2], [6, 4, 7, 3], [12, 2, 4, 2], [5, 5, 4, 6], [0, 6, 8, 6]];
const THEMES = [
  { g: '#2a2c31', s: ['#31343a', '#232529'], tread: 'rgba(0,0,0,.3)' },
  { g: '#262e22', s: ['#2e3829', '#1f261b'], tread: 'rgba(0,0,0,.3)' },
  { g: '#3a3125', s: ['#44392b', '#30281e'], tread: 'rgba(0,0,0,.28)' },
  { g: '#2c3644', s: ['#36424f', '#252e3a'], tread: 'rgba(0,0,0,.26)' }
];
const ETYPES = [
  { k: 'basic', spd: 0.8, bspd: 4, hp: 1, pts: 100, fr: [60, 130] },
  { k: 'fast', spd: 1.9, bspd: 5, hp: 1, pts: 200, fr: [60, 130] },
  { k: 'power', spd: 1.1, bspd: 8, hp: 1, pts: 300, fr: [40, 95] },
  { k: 'armor', spd: 0.95, bspd: 5, hp: 4, pts: 400, fr: [45, 110] }
];
const PSPD = 1.5;
const DIFF = { spd: [0.85, 1, 1.12], fire: [1.5, 1, 0.72], spawn: [210, 170, 125], aggro: [0.22, 0.38, 0.55], max: [4, 4, 5], lives: [3, 2, 2] };
const SPAWNS = [192, 384, 0], PSPAWN = [128, 256], BASE = { x: 192, y: 384 };
const PKINDS = ['star', 'star', 'helmet', 'clock', 'shovel', 'grenade', 'tank'];
const PICON = { star: '⭐', helmet: '⛑️', clock: '⏰', shovel: '🧱', grenade: '💣' };
const PCOL = [['#f2c230', '#9c7410', '#ffe9a0'], ['#57c46e', '#257a3a', '#b4f2c0']];
const ECOL = ['#c5cbd3', '#68707c', '#f0f3f6'];
const ACOL = [ECOL, ECOL, ECOL, ['#e2b64a', '#8a6a16', '#fbe4a6'], ['#7fbf54', '#3f6e1f', '#c7eca0']];
const RCOL = ['#e5483b', '#8c2018', '#ffa196'];

// 出生点 / 老鹰保护区（半格坐标）
const RESERVED = [];
for (const sx of [0, 12, 24]) for (let k = 0; k < 4; k++) RESERVED.push([sx + (k & 1), k >> 1]);
for (const sx of [8, 16]) for (let k = 0; k < 4; k++) RESERVED.push([sx + (k & 1), 24 + (k >> 1)]);
const isBaseCell = (hx, hy) => hx >= 12 && hx <= 13 && hy >= 24;
const isProtected = (hx, hy) => (hx >= 11 && hx <= 14 && hy >= 23) || RESERVED.some(([x, y]) => x === hx && y === hy);
const RING_MC = [];
for (let hy = 23; hy < 26; hy++) for (let hx = 11; hx < 15; hx++) if (!isBaseCell(hx, hy)) for (let k = 0; k < 4; k++) RING_MC.push([hx * 2 + (k & 1), hy * 2 + (k >> 1)]);
function applyReserved(a) {
  for (const [x, y] of RESERVED) a[y * HT + x] = E;
  for (let hy = 23; hy < 26; hy++) for (let hx = 11; hx < 15; hx++) a[hy * HT + hx] = isBaseCell(hx, hy) ? E : BR;
}
function tilesToHT(rows) {
  const a = new Uint8Array(HT * HT);
  for (let ty = 0; ty < 13; ty++) for (let tx = 0; tx < 13; tx++) {
    const v = CH[rows[ty][tx]] || E;
    for (let k = 0; k < 4; k++) a[(ty * 2 + (k >> 1)) * HT + tx * 2 + (k & 1)] = v;
  }
  applyReserved(a);
  return a;
}

// ---------------- 状态 ----------------
let state = 'menu', prevState = 'play', demo = false, demoIdx = 0;
let nP = store.get('players', 1), diff = store.get('diff', 1), unlock = store.get('unlock', 0);
let pickStage = Math.min(store.get('pick', 0), unlock), hiScore = store.get('best', 0);
let stageIdx = 0, loop = 0, custom = false, fromEditor = false, thIdx = 0, night = false;
let ht = new Uint8Array(HT * HT);
const mg = new Uint8Array(MC * MC);
let players = [], enemies = [], bullets = [], stars = [], booms = [], pops = [];
let queue = [], spawned = 0, killed = 0, spawnT = 0, spawnPt = 0, eid = 0;
let pwr = null, freezeT = 0, shovelT = 0, baseDead = false, clearT = 0, overSeq = 0, stageF = 0, shake = 0, F = 0;
let curtain = null, tally = null, banner = null, continues = 0, waterPath = new Path2D();
let brush = BR, bsize = 2, edHover = null, painting = false, erasing = false;
const fx = new KIT.Particles();

// ---------------- 离屏画布 ----------------
const SC = 2;
function off(w, h) { const o = document.createElement('canvas'); o.width = w * SC; o.height = h * SC; const g = o.getContext('2d'); g.scale(SC, SC); return [o, g]; }
const [groundCv, gg] = off(FS, FS), [mapCv, mx] = off(FS, FS), [treeCv, tg] = off(FS, FS), [treadCv, trx] = off(FS, FS), [darkCv, dk] = off(FS, FS);

function pix(rows, pal) {
  const o = document.createElement('canvas'); o.width = 16; o.height = 16;
  const g = o.getContext('2d');
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (pal[ch]) { g.fillStyle = pal[ch]; g.fillRect(x, y, 1, 1); } }));
  return o;
}
const EAGLE = pix([
  '................', '.o............o.', '.oo....ww....oo.', '.ooo..wwkw..ooo.', '.oooo.wwww.oooo.', '.ooooo.ww.ooooo.',
  '..oooooyyooooo..', '...ooooyyoooo...', '....ooyyyyoo....', '.....oyyyyo.....', '......yyyy......', '.....yy..yy.....',
  '....yy....yy....', '...dddddddddd...', '..dddddddddddd..', '................'
], { o: '#e0a83e', w: '#f6f1e4', k: '#1d1d1d', y: '#a8711f', d: '#70747d' });
const EAGLE_DEAD = pix([
  '................', '................', '................', '................', '................', '................',
  '.......r........', '....r.rrr.r.....', '...rrrrrrrrr.r..', '..rrkrrrrkrrrr..', '.rrrrrrkrrrrrrr.', '.rrkrrrrrrrkrrr.',
  'rrrrrrrrrrrrrrrr', '...dddddddddd...', '..dddddddddddd..', '................'
], { r: '#5b5550', k: '#2a2522', d: '#70747d' });

function makeWaterPat(ph) {
  const o = document.createElement('canvas'); o.width = o.height = 32;
  const g = o.getContext('2d'); g.scale(2, 2);
  g.fillStyle = '#1c5aab'; g.fillRect(0, 0, 16, 16);
  g.fillStyle = '#2470cc'; g.fillRect(0, (ph * 5) % 16, 16, 4); g.fillRect(0, (ph * 5 + 9) % 16, 16, 2);
  g.strokeStyle = '#8cc8ff'; g.lineWidth = 1;
  const wv = (x, y) => { g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 2, y - 2, x + 4, y); g.quadraticCurveTo(x + 6, y + 2, x + 8, y); g.stroke(); };
  wv((ph * 3) % 16 - 2, 4); wv((ph * 3 + 8) % 16 - 2, 12);
  const p = c.createPattern(o, 'repeat');
  try { p.setTransform(new DOMMatrix().scale(0.5)); } catch (e) {}
  return p;
}
const WATER = [0, 1, 2].map(makeWaterPat);

// ---------------- 地形绘制 ----------------
function renderGround() {
  const th = THEMES[thIdx];
  gg.fillStyle = th.g; gg.fillRect(0, 0, FS, FS);
  for (let k = 0; k < 900; k++) {
    gg.fillStyle = th.s[k & 1];
    const x = hash(k, 7 + thIdx) * FS, y = hash(k, 91 + thIdx) * FS, s = 1 + hash(k, 3) * 2.5;
    gg.fillRect(x, y, s, s);
  }
  gg.strokeStyle = 'rgba(255,255,255,.025)'; gg.lineWidth = 1;
  for (let k = 1; k < 13; k++) { gg.beginPath(); gg.moveTo(k * 32, 0); gg.lineTo(k * 32, FS); gg.moveTo(0, k * 32); gg.lineTo(FS, k * 32); gg.stroke(); }
  // 老鹰底座
  gg.fillStyle = 'rgba(0,0,0,.25)'; gg.fillRect(BASE.x - 2, BASE.y - 2, 36, 34);
}
function drawBrick(g, x, y, i, j) {
  g.fillStyle = '#6a2a10'; g.fillRect(x, y, 8, 8);
  for (let k = 0; k < 2; k++) {
    const yy = y + k * 4, row = j * 2 + k, sh = (row & 1) ? 4 : 0;
    for (let xx = x - sh; xx < x + 8; xx += 8) {
      const x0 = Math.max(x, xx), x1 = Math.min(x + 8, xx + 7.5);
      if (x1 <= x0) continue;
      const v = hash(Math.floor((xx + 64) / 8) + i, row) > 0.5;
      g.fillStyle = v ? '#c9642c' : '#b8582a'; g.fillRect(x0, yy, x1 - x0, 3.5);
      g.fillStyle = '#e8925a'; g.fillRect(x0, yy, x1 - x0, 1);
      g.fillStyle = '#93401c'; g.fillRect(x0, yy + 2.5, x1 - x0, 1);
    }
  }
}
function drawSteel(g, x, y, i, j) {
  const bx = (i >> 1) * 16, by = (j >> 1) * 16;
  g.save(); g.beginPath(); g.rect(x, y, 8, 8); g.clip();
  g.fillStyle = '#525a64'; g.fillRect(bx, by, 16, 16);
  g.fillStyle = '#9ba5af'; g.fillRect(bx + 1, by + 1, 14, 14);
  g.fillStyle = '#eef2f5'; g.fillRect(bx + 1, by + 1, 14, 2); g.fillRect(bx + 1, by + 1, 2, 14);
  g.fillStyle = '#6b747e'; g.fillRect(bx + 3, by + 13, 12, 2); g.fillRect(bx + 13, by + 3, 2, 12);
  g.fillStyle = '#ccd3da'; g.fillRect(bx + 5, by + 5, 6, 6);
  g.fillStyle = '#7d8690'; g.fillRect(bx + 9, by + 9, 2, 2);
  g.restore();
}
function drawIce(g, x, y, i, j) {
  const bx = (i >> 1) * 16, by = (j >> 1) * 16;
  g.save(); g.beginPath(); g.rect(x, y, 8, 8); g.clip();
  g.fillStyle = '#a6d3e8'; g.fillRect(bx, by, 16, 16);
  g.strokeStyle = '#e4f6ff'; g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(bx + 2, by + 9); g.lineTo(bx + 9, by + 2); g.moveTo(bx + 7, by + 15); g.lineTo(bx + 15, by + 7); g.stroke();
  g.fillStyle = '#86bcd6'; g.fillRect(bx, by + 15, 16, 1); g.fillRect(bx + 15, by, 1, 16);
  g.restore();
}
const BUSH = [[4, 4, 4.6], [12, 4, 4.6], [4, 12, 4.6], [12, 12, 4.6], [8, 8, 4.2]];
function drawTree(g, x, y, i, j) {
  const bx = (i >> 1) * 16, by = (j >> 1) * 16;
  g.save(); g.beginPath(); g.rect(x, y, 8, 8); g.clip();
  g.fillStyle = '#123d18'; g.fillRect(bx, by, 16, 16);
  for (const [ox, oy, r] of BUSH) { g.fillStyle = '#1a5222'; g.beginPath(); g.arc(bx + ox, by + oy, r + 1, 0, 7); g.fill(); }
  for (const [ox, oy, r] of BUSH) { g.fillStyle = '#2c8a39'; g.beginPath(); g.arc(bx + ox, by + oy, r - 0.4, 0, 7); g.fill(); }
  for (const [ox, oy, r] of BUSH) { g.fillStyle = '#5cbf5e'; g.beginPath(); g.arc(bx + ox - 1.3, by + oy - 1.4, r * 0.38, 0, 7); g.fill(); }
  g.restore();
}
function drawCell(i, j) {
  const x = i * 8, y = j * 8, v = mg[j * MC + i];
  mx.clearRect(x, y, 8, 8); tg.clearRect(x, y, 8, 8);
  if (v === BR) drawBrick(mx, x, y, i, j);
  else if (v === ST) drawSteel(mx, x, y, i, j);
  else if (v === IC) drawIce(mx, x, y, i, j);
  else if (v === TR) drawTree(tg, x, y, i, j);
}
function setCell(i, j, v) { mg[j * MC + i] = v; drawCell(i, j); }
function buildMG() { for (let j = 0; j < MC; j++) for (let i = 0; i < MC; i++) mg[j * MC + i] = ht[(j >> 1) * HT + (i >> 1)]; }
function rebuildWater() {
  waterPath = new Path2D();
  for (let j = 0; j < MC; j++) for (let i = 0; i < MC; i++) if (mg[j * MC + i] === WA) waterPath.rect(i * 8, j * 8, 8, 8);
}
function renderAll() {
  renderGround();
  mx.clearRect(0, 0, FS, FS); tg.clearRect(0, 0, FS, FS); trx.clearRect(0, 0, FS, FS);
  for (let j = 0; j < MC; j++) for (let i = 0; i < MC; i++) if (mg[j * MC + i]) drawCell(i, j);
  rebuildWater();
}
function setRing(v) {
  for (const [i, j] of RING_MC) {
    if (mg[j * MC + i] === v) continue;
    if (players.some(t => t.alive && ov(i * 8, j * 8, 8, 8, t.x, t.y, 32, 32)) || enemies.some(t => ov(i * 8, j * 8, 8, 8, t.x, t.y, 32, 32))) continue;
    setCell(i, j, v);
  }
}

// ---------------- 碰撞 ----------------
function cellAt(x, y) { const i = Math.floor(x / 8), j = Math.floor(y / 8); return i < 0 || j < 0 || i >= MC || j >= MC ? -1 : mg[j * MC + i]; }
function mapHas(x, y, w, h, test) {
  const i0 = Math.max(0, Math.floor(x / 8)), i1 = Math.min(MC - 1, Math.floor((x + w - 0.01) / 8));
  const j0 = Math.max(0, Math.floor(y / 8)), j1 = Math.min(MC - 1, Math.floor((y + h - 0.01) / 8));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (test(mg[j * MC + i])) return true;
  return false;
}
const solidT = v => v === BR || v === ST || v === WA;
const bulletT = v => v === BR || v === ST;
function blockedAt(t, x, y) {
  if (x < 0 || y < 0 || x > FS - 32 || y > FS - 32) return true;
  if (mapHas(x, y, 32, 32, solidT)) return true;
  if (ov(x, y, 32, 32, BASE.x, BASE.y, 32, 32)) return true;
  for (const o of players) if (o !== t && o.alive && ov(x, y, 32, 32, o.x, o.y, 32, 32) && !ov(t.x, t.y, 32, 32, o.x, o.y, 32, 32)) return true;
  for (const o of enemies) if (o !== t && ov(x, y, 32, 32, o.x, o.y, 32, 32) && !ov(t.x, t.y, 32, 32, o.x, o.y, 32, 32)) return true;
  return false;
}
function tankAt(x, y) { return players.some(t => t.alive && ov(x, y, 32, 32, t.x, t.y, 32, 32)) || enemies.some(t => ov(x, y, 32, 32, t.x, t.y, 32, 32)); }
function tryMove(t, dx, dy) { if (blockedAt(t, t.x + dx, t.y + dy)) return false; t.x += dx; t.y += dy; return true; }
function snap(t, d) {
  const vert = d % 2 === 0, v = vert ? t.x : t.y, s = Math.round(v / 16) * 16;
  if (Math.abs(s - v) < 0.01) { if (vert) t.x = s; else t.y = s; return; }
  for (const cand of [s, s > v ? s - 16 : s + 16]) {
    const nx = vert ? cand : t.x, ny = vert ? t.y : cand;
    if (!blockedAt(t, nx, ny)) { t.x = nx; t.y = ny; return; }
  }
}
function turn(t, d) { if (d === t.dir) return; if (d % 2 !== t.dir % 2) snap(t, d); t.dir = d; }
function moveTank(t, spd, assist) {
  const [dx, dy] = DIRS[t.dir];
  let d = spd;
  while (d > 0.05 && !tryMove(t, dx * d, dy * d)) d = d > 1 ? Math.floor(d - 0.001) : d / 2;
  if (d <= 0.05) return assist ? cornerAssist(t, spd) : false;
  t.tread += d; t.stampD += d;
  if (t.stampD >= 5) stampTread(t);
  return true;
}
function cornerAssist(t, spd) {
  const [dx, dy] = DIRS[t.dir], px = dy !== 0;
  for (let o = 1; o <= 12; o++) for (const sg of [-1, 1]) {
    const ox = px ? sg * o : 0, oy = px ? 0 : sg * o;
    if (!blockedAt(t, t.x + ox + dx * 2, t.y + oy + dy * 2) && !blockedAt(t, t.x + ox, t.y + oy)) {
      const m = Math.min(spd, o);
      if (tryMove(t, px ? sg * m : 0, px ? 0 : sg * m)) { t.tread += m; return true; }
    }
  }
  return false;
}
function stampTread(t) {
  t.stampD = 0;
  const v = cellAt(t.x + 16, t.y + 16);
  if (v === WA || v === IC) return;
  trx.save(); trx.translate(t.x + 16, t.y + 16); trx.rotate(t.dir * Math.PI / 2);
  trx.fillStyle = THEMES[thIdx].tread;
  trx.fillRect(-14, 4, 6, 3); trx.fillRect(8, 4, 6, 3);
  trx.restore();
}
function fadeTreads() {
  trx.globalCompositeOperation = 'destination-out';
  trx.fillStyle = 'rgba(0,0,0,.06)'; trx.fillRect(0, 0, FS, FS);
  trx.globalCompositeOperation = 'source-over';
}
function scorch(x, y, r) {
  const g = trx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, 'rgba(0,0,0,.5)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  trx.fillStyle = g; trx.beginPath(); trx.arc(x, y, r, 0, 7); trx.fill();
}

// ---------------- 声音 ----------------
const SFX = {
  fire: () => { KIT.tone(420, 0.08, { type: 'square', vol: 0.05, to: 170 }); KIT.noise(0.05, { vol: 0.04, lp: 3000 }); },
  efire: () => KIT.tone(260, 0.06, { type: 'square', vol: 0.018, to: 140 }),
  brick: () => KIT.noise(0.12, { vol: 0.09, lp: 1700 }),
  steel: () => KIT.tone(1500, 0.08, { type: 'triangle', vol: 0.06, to: 1100 }),
  wall: () => KIT.tone(900, 0.05, { type: 'square', vol: 0.025, to: 500 }),
  armor: () => KIT.tone(700, 0.1, { type: 'square', vol: 0.05, to: 1400 }),
  boom: () => { KIT.noise(0.45, { vol: 0.18, lp: 900 }); KIT.tone(120, 0.35, { type: 'sawtooth', vol: 0.06, to: 40 }); },
  pdie: () => { KIT.noise(0.8, { vol: 0.24, lp: 700 }); KIT.tone(220, 0.7, { type: 'sawtooth', vol: 0.08, to: 30 }); },
  base: () => { KIT.noise(1.4, { vol: 0.3, lp: 500 }); KIT.tone(160, 1.2, { type: 'sawtooth', vol: 0.1, to: 25 }); },
  pAppear: () => KIT.arp([660, 880, 660, 990], 0.06, { type: 'square', vol: 0.04 }),
  pick: () => KIT.arp([523, 659, 784, 1047, 1319], 0.05, { type: 'square', vol: 0.05 }),
  life: () => KIT.arp([784, 988, 1175, 1568], 0.07, { type: 'triangle', vol: 0.08 }),
  stun: () => KIT.tone(300, 0.3, { type: 'sine', vol: 0.06, to: 900 }),
  freeze: () => KIT.arp([1568, 1319, 1047, 1319, 1568], 0.05, { type: 'triangle', vol: 0.05 }),
  tick: () => KIT.tone(1046, 0.03, { type: 'square', vol: 0.03 }),
  start: () => KIT.arp([392, 523, 659, 784, 659, 784, 1047], 0.1, { type: 'square', vol: 0.05 })
};
const snd = k => { if (!demo) SFX[k](); };

// ---------------- 坦克 ----------------
function makePlayer(i) {
  return { team: 'p', idx: i, x: PSPAWN[i], y: 384, dir: 0, alive: false, lives: DIFF.lives[diff], lvl: 0, score: 0, kills: [0, 0, 0, 0], skills: [0, 0, 0, 0],
    shield: 0, stun: 0, respawnT: 1, out: false, tread: 0, stampD: 0, bullets: 0, fireCd: 0, mz: 0, slide: 0, nextLife: 20000, ai: false, think: 0, stuck: 0, mood: 'hunt', wander: randPt() };
}
function spawnPlayer(p) {
  p.x = PSPAWN[p.idx]; p.y = 384; p.dir = 0; p.alive = true; p.shield = 180; p.stun = 0; p.slide = 0; p.bullets = 0; p.fireCd = 0;
}
function randPt() { return { x: ri(0, 24) * 16, y: ri(0, 24) * 16 }; }
function pickMood() {
  const ag = DIFF.aggro[diff] + Math.min(0.3, stageF / 60 / 200) + loop * 0.08, r = Math.random();
  return r < ag ? 'base' : r < ag + 0.35 ? 'hunt' : 'wander';
}
function makeEnemy(x, y, q) {
  const et = ETYPES[q.type];
  return { team: 'e', id: ++eid, x, y, dir: 2, alive: true, type: q.type, hp: et.hp, bonus: q.bonus, spd: et.spd * DIFF.spd[diff] * (1 + loop * 0.05), bspd: et.bspd,
    tread: 0, stampD: 0, bullets: 0, fireCd: 0, mz: 0, fireT: ri(30, 90), think: ri(20, 60), stuck: 0, patience: ri(10, 50), mood: pickMood(), moodT: ri(300, 600), wander: randPt(), flash: 0 };
}
function fire(t) {
  if (t.fireCd > 0) return false;
  const maxB = t.team === 'p' && t.lvl >= 2 ? 2 : 1;
  if (t.bullets >= maxB) return false;
  const [dx, dy] = DIRS[t.dir];
  const spd = t.team === 'p' ? (t.lvl >= 1 ? 8 : 5) : t.bspd;
  bullets.push({ x: t.x + 16 + dx * 14, y: t.y + 16 + dy * 14, dir: t.dir, spd, owner: t, team: t.team, steel: t.team === 'p' && t.lvl >= 3, dead: false });
  t.bullets++; t.fireCd = t.team === 'p' ? 12 : 4; t.mz = 4;
  snd(t.team === 'p' ? 'fire' : 'efire');
  return true;
}
function readInput(i) {
  const sets = nP === 1 ? [K1, K2] : [i === 0 ? K1 : K2];
  let best = -1, bt = -1, fireOn = false;
  for (const k of sets) {
    for (let d = 0; d < 4; d++) for (const code of k.dir[d]) if (keys.has(code) && keyT[code] > bt) { bt = keyT[code]; best = d; }
    for (const code of k.fire) if (keys.has(code)) fireOn = true;
  }
  return { dir: best, fire: fireOn };
}
function stepPlayer(p) {
  if (p.out) return;
  if (!p.alive) {
    if (overSeq) return;
    p.respawnT--;
    if (p.respawnT === 30) stars.push({ x: PSPAWN[p.idx], y: 384, t: 30, ply: true });
    if (p.respawnT <= 0) spawnPlayer(p);
    return;
  }
  if (p.shield > 0) p.shield--;
  if (p.fireCd > 0) p.fireCd--;
  if (p.mz > 0) p.mz--;
  if (p.stun > 0) { p.stun--; return; }
  const inp = overSeq || baseDead ? { dir: -1, fire: false } : p.ai ? aiPlayer(p) : readInput(p.idx);
  let d = inp.dir;
  const onIce = cellAt(p.x + 16, p.y + 16) === IC;
  if (d >= 0) p.slide = onIce ? 24 : 0;
  else if (p.slide > 0) { p.slide--; d = p.dir; }
  if (d >= 0) {
    turn(p, d);
    const moved = moveTank(p, onIce && inp.dir < 0 ? PSPD * (0.4 + p.slide / 40) : PSPD, !p.ai);
    p.stuck = moved ? 0 : p.stuck + 1;
    if (!moved && p.slide) p.slide = 0;
  }
  if (inp.fire) fire(p);
}
function aiPlayer(p) {
  if (--p.think <= 0 || p.stuck > 20) { aiThink(p); p.stuck = 0; }
  let f = Math.random() < 0.04;
  for (const e of enemies) if (inLine(p, e.x, e.y)) f = true;
  if (p.stuck > 6 && frontHas(p, BR)) f = true;
  if (inLine(p, BASE.x, BASE.y)) f = false;
  for (const o of players) if (o !== p && o.alive && inLine(p, o.x, o.y)) f = false;
  return { dir: p.dir, fire: f };
}
function inLine(t, ox, oy) {
  const [dx, dy] = DIRS[t.dir], ex = ox - t.x, ey = oy - t.y;
  return dx ? Math.abs(ey) < 12 && ex * dx > 0 : Math.abs(ex) < 12 && ey * dy > 0;
}
function frontHas(t, v) { const [dx, dy] = DIRS[t.dir]; return mapHas(t.x + dx * 4, t.y + dy * 4, 32, 32, x => x === v); }
function aiTarget(t) {
  if (t.team === 'p') {
    let best = null, bd = 1e9;
    for (const e of enemies) { const d = Math.abs(e.x - t.x) + Math.abs(e.y - t.y); if (d < bd) { bd = d; best = e; } }
    return best || t.wander;
  }
  if (t.mood === 'base') return BASE;
  if (t.mood === 'hunt') {
    let best = null, bd = 1e9;
    for (const p of players) if (p.alive) { const d = Math.abs(p.x - t.x) + Math.abs(p.y - t.y); if (d < bd) { bd = d; best = p; } }
    return best || BASE;
  }
  return t.wander;
}
function canGo(t, d) {
  let x = t.x, y = t.y;
  if (d % 2 === 0) x = Math.round(x / 16) * 16; else y = Math.round(y / 16) * 16;
  const [dx, dy] = DIRS[d]; x += dx * 4; y += dy * 4;
  if (x < 0 || y < 0 || x > FS - 32 || y > FS - 32) return 0;
  if (ov(x, y, 32, 32, BASE.x, BASE.y, 32, 32)) return 0;
  if (mapHas(x, y, 32, 32, v => v === ST || v === WA)) return 0;
  return mapHas(x, y, 32, 32, v => v === BR) ? 1 : 2;
}
function aiThink(t) {
  const tg = aiTarget(t), dx = tg.x - t.x, dy = tg.y - t.y;
  const ws = [0, 0, 0, 0]; let tot = 0;
  for (let d = 0; d < 4; d++) {
    const cm = canGo(t, d);
    let w = cm === 2 ? 1 : cm === 1 ? 0.45 : 0;
    if (w) {
      const [ux, uy] = DIRS[d], tow = ux * dx + uy * dy;
      const major = Math.abs(ux ? dx : dy) >= Math.abs(ux ? dy : dx);
      if (tow > 8) w *= major ? 5 : 2.5;
      if (d === (t.dir + 2) % 4) w *= 0.35;
    }
    ws[d] = w; tot += w;
  }
  let d = ri(0, 3);
  if (tot > 0) { let r = Math.random() * tot; for (d = 0; d < 3; d++) { r -= ws[d]; if (r <= 0) break; } }
  turn(t, d);
  t.think = ri(30, 130);
}
function aimTurn(e) {
  if (e.mood === 'wander') return;
  const ch = 0.3 + diff * 0.15;
  for (const p of players) {
    if (!p.alive) continue;
    const ex = p.x - e.x, ey = p.y - e.y;
    if (Math.abs(ex) < 10 && Math.abs(ey) < 220 && Math.random() < ch) { turn(e, ey < 0 ? 0 : 2); return; }
    if (Math.abs(ey) < 10 && Math.abs(ex) < 220 && Math.random() < ch) { turn(e, ex < 0 ? 3 : 1); return; }
  }
}
function stepEnemy(e) {
  if (e.flash > 0) e.flash--;
  if (e.fireCd > 0) e.fireCd--;
  if (e.mz > 0) e.mz--;
  if (freezeT > 0) return;
  if (--e.moodT <= 0) { e.mood = pickMood(); e.moodT = ri(300, 700); e.wander = randPt(); }
  if (--e.think <= 0) aiThink(e);
  if (F % 16 === e.id % 16) aimTurn(e);
  const moved = moveTank(e, e.spd, false);
  e.stuck = moved ? 0 : e.stuck + 1;
  if (e.stuck > 8 && frontHas(e, BR) && Math.random() < 0.08) fire(e);
  if (e.stuck > e.patience) { aiThink(e); e.stuck = 0; e.patience = ri(10, 50); }
  if (--e.fireT <= 0) { fire(e); e.fireT = Math.round(rnd(...ETYPES[e.type].fr) * DIFF.fire[diff] / (1 + loop * 0.15)); }
  else if (e.fireT > 8 && F % 8 === 0 && Math.random() < 0.45 + diff * 0.2 && targetInLine(e)) e.fireT = ri(2, 8);
}
function targetInLine(e) {
  for (const p of players) if (p.alive && inLine(e, p.x, p.y)) return true;
  return !baseDead && inLine(e, BASE.x, BASE.y);
}

// ---------------- 子弹 ----------------
function killBullet(b) { if (b.dead) return; b.dead = true; b.owner.bullets = Math.max(0, b.owner.bullets - 1); }
function boom(x, y, big) {
  booms.push({ x, y, t: 0, max: big ? 40 : 16, big, seed: Math.random() * 6 });
  if (big) {
    fx.burst(x, y, { n: 14, color: ['#ffd25a', '#ff8a3a', '#fff3c0'], speed: 190, life: 0.5, size: 3, gravity: 0, shape: 'spark' });
    fx.burst(x, y, { n: 8, color: ['#55585e', '#3d4045', '#6b6e74'], speed: 50, life: 1.1, size: 7, gravity: -30 });
    scorch(x, y, 22); shake = Math.max(shake, 4);
  }
}
function bulletHit(b) {
  const vert = b.dir % 2 === 0, bw = vert ? 6 : 8, bh = vert ? 8 : 6, x0 = b.x - bw / 2, y0 = b.y - bh / 2;
  if (x0 < 0 || y0 < 0 || x0 + bw > FS || y0 + bh > FS) {
    killBullet(b); boom(clamp(b.x, 2, FS - 2), clamp(b.y, 2, FS - 2), false);
    if (b.team === 'p') snd('wall');
    return;
  }
  if (mapHas(x0, y0, bw, bh, bulletT)) { hitWall(b); return; }
  if (!baseDead && ov(x0, y0, bw, bh, BASE.x, BASE.y, 32, 32)) { killBullet(b); destroyBase(); return; }
  for (const t of players) {
    if (!t.alive || t === b.owner || !ov(x0, y0, bw, bh, t.x + 1, t.y + 1, 30, 30)) continue;
    killBullet(b); boom(b.x, b.y, false);
    if (b.team === 'p') { if (!t.shield) { t.stun = 150; snd('stun'); } }
    else if (t.shield > 0) snd('wall');
    else killPlayer(t);
    return;
  }
  if (b.team === 'p') for (const e of enemies) {
    if (!e.alive || !ov(x0, y0, bw, bh, e.x + 1, e.y + 1, 30, 30)) continue;
    killBullet(b); hitEnemy(e, b.owner);
    return;
  }
}
function hitWall(b) {
  killBullet(b);
  const [dx, dy] = DIRS[b.dir], vert = b.dir % 2 === 0;
  const lane = Math.round((vert ? b.x : b.y) / 8), r0 = Math.floor((vert ? b.y + dy * 3.99 : b.x + dx * 3.99) / 8), step = vert ? dy : dx;
  let brick = false, steel = false;
  for (let k = -2; k < 2; k++) for (let dd = 0; dd < 2; dd++) {
    const ln = lane + k, dp = r0 + step * dd, i = vert ? ln : dp, j = vert ? dp : ln;
    if (i < 0 || j < 0 || i >= MC || j >= MC) break;
    const v = mg[j * MC + i];
    if (v === BR) {
      setCell(i, j, E); brick = true;
      if (Math.random() < 0.5) fx.burst(i * 8 + 4, j * 8 + 4, { n: 3, color: ['#c9642c', '#e8925a', '#6a2a10'], speed: 90, life: 0.4, size: 3, gravity: 0, shape: 'square' });
    } else if (v === ST) {
      steel = true;
      if (b.steel) setCell(i, j, E); else break;
    }
  }
  boom(b.x, b.y, false);
  if (steel) fx.burst(b.x, b.y, { n: 6, color: ['#fff', '#ffe08a'], speed: 180, life: 0.22, size: 2, gravity: 0, shape: 'spark' });
  if (b.team === 'p') snd(steel && !b.steel ? 'steel' : 'brick');
}
function stepBullets() {
  for (const b of bullets) {
    if (b.dead) continue;
    const [dx, dy] = DIRS[b.dir], n = Math.ceil(b.spd / 3);
    for (let s = 0; s < n && !b.dead; s++) { b.x += dx * b.spd / n; b.y += dy * b.spd / n; bulletHit(b); }
  }
  for (let i = 0; i < bullets.length; i++) {
    const a = bullets[i]; if (a.dead) continue;
    for (let j = i + 1; j < bullets.length; j++) {
      const b = bullets[j]; if (b.dead || a.team === b.team) continue;
      if (Math.abs(a.x - b.x) < 8 && Math.abs(a.y - b.y) < 8) {
        killBullet(a); killBullet(b);
        fx.burst((a.x + b.x) / 2, (a.y + b.y) / 2, { n: 6, color: ['#fff', '#9fe3ff'], speed: 140, life: 0.2, size: 2, gravity: 0, shape: 'spark' });
        break;
      }
    }
  }
  bullets = bullets.filter(b => !b.dead);
}

// ---------------- 击毁 / 得分 ----------------
function addScore(p, v) {
  if (demo) return;
  p.score += v;
  if (p.score >= p.nextLife) { p.nextLife += 20000; p.lives++; snd('life'); pops.push({ x: p.x + 16, y: p.y - 4, t: 70, text: T('oneUp'), col: '#7dff8a' }); }
}
function hitEnemy(e, p) {
  if (e.bonus) { e.bonus = false; spawnPower(); }
  e.hp--;
  if (e.hp > 0) { e.flash = 8; boom(e.x + 16, e.y + 16, false); snd('armor'); return; }
  killEnemy(e, p, true);
}
function killEnemy(e, p, score) {
  e.alive = false; killed++;
  boom(e.x + 16, e.y + 16, true); snd('boom');
  if (score && p && p.team === 'p') {
    const pts = ETYPES[e.type].pts;
    addScore(p, pts); p.kills[e.type]++; p.skills[e.type]++;
    pops.push({ x: e.x + 16, y: e.y + 16, t: 60, text: String(pts), col: '#fff' });
  }
}
function killPlayer(p) {
  p.alive = false; p.lvl = 0; p.bullets = 0;
  boom(p.x + 16, p.y + 16, true);
  booms.push({ x: p.x + 16, y: p.y + 16, t: 0, max: 50, big: true, seed: 2 });
  shake = 7; snd('pdie');
  if (p.lives > 0) { p.lives--; p.respawnT = 80; } else p.out = true;
}
function destroyBase() {
  if (baseDead) return;
  baseDead = true; shake = 12; snd('base');
  for (let k = 0; k < 4; k++) booms.push({ x: BASE.x + 16 + rnd(-10, 10), y: BASE.y + 16 + rnd(-10, 10), t: -k * 6, max: 44, big: true, seed: k });
  scorch(BASE.x + 16, BASE.y + 16, 34);
  startGameOver();
}
function startGameOver() { if (!overSeq) { overSeq = 1; KIT.stopMusic(); } }

// ---------------- 道具 ----------------
function spawnPower() {
  let x = 0, y = 0;
  for (let k = 0; k < 40; k++) {
    x = ri(0, 24) * 16; y = ri(0, 22) * 16;
    if (ov(x, y, 32, 32, 160, 352, 96, 64)) continue;
    if (!mapHas(x + 4, y + 4, 24, 24, v => v === ST || v === WA)) break;
  }
  pwr = { kind: PKINDS[ri(0, PKINDS.length - 1)], x, y, t: 1500 };
  snd('pAppear');
}
function applyPower(p, k) {
  const pw = T('pw');
  if (k === 'helmet') p.shield = 600;
  else if (k === 'clock') { freezeT = 600; snd('freeze'); }
  else if (k === 'shovel') { shovelT = 1080; setRing(ST); }
  else if (k === 'star') { if (p.lvl < 3) p.lvl++; else k = 'starMax'; }
  else if (k === 'grenade') { for (const e of enemies) if (e.alive) killEnemy(e, null, false); shake = 10; }
  else if (k === 'tank') { p.lives++; snd('life'); }
  addScore(p, 500);
  pops.push({ x: pwr.x + 16, y: pwr.y + 16, t: 60, text: '500', col: '#ffe08a' });
  banner = { text: pw[k], t: 100 };
  if (k !== 'tank') snd('pick');
}
function stepPower() {
  if (!pwr) return;
  if (--pwr.t <= 0) { pwr = null; return; }
  for (const p of players) if (p.alive && ov(p.x, p.y, 32, 32, pwr.x + 4, pwr.y + 4, 24, 24)) { applyPower(p, pwr.kind); pwr = null; return; }
}
function stepShovel() {
  shovelT--;
  if (shovelT <= 0) { setRing(BR); return; }
  if (shovelT < 180) setRing(Math.floor(shovelT / 15) % 2 ? BR : ST);
}

// ---------------- 关卡流程 ----------------
const maxField = () => DIFF.max[diff] + (players.length === 2 ? 2 : 0);
const spawnInterval = () => Math.max(60, DIFF.spawn[diff] - (custom ? 0 : stageIdx * 3) - loop * 15 - (players.length - 1) * 20);
function buildQueue() {
  const comp = (custom ? [10, 4, 4, 2] : COMP[stageIdx]).slice();
  for (let l = 0; l < loop; l++) { const mv = Math.min(comp[0], 4); comp[0] -= mv; comp[3] += Math.ceil(mv / 2); comp[2] += Math.floor(mv / 2); }
  const q = [];
  comp.forEach((n, t) => { for (let i = 0; i < n; i++) q.push({ type: t, key: t + Math.random() * 2.6 }); });
  q.sort((a, b) => a.key - b.key);
  return q.map((o, i) => ({ type: o.type, bonus: i === 3 || i === 10 || i === 17 }));
}
function loadCustomHT() {
  const s = store.get('custom', ''), a = new Uint8Array(HT * HT);
  if (typeof s === 'string' && s.length === HT * HT) for (let i = 0; i < a.length; i++) { const v = +s[i]; a[i] = v >= 0 && v <= 5 ? v : 0; }
  applyReserved(a);
  return a;
}
function resetWorld() {
  enemies = []; bullets = []; stars = []; booms = []; pops = []; fx.clear(); pwr = null; banner = null;
  freezeT = shovelT = 0; baseDead = false; clearT = 0; overSeq = 0; stageF = 0; shake = 0;
}
function loadStage() {
  const m = custom ? null : MAPS[stageIdx];
  ht = custom ? loadCustomHT() : tilesToHT(m.rows);
  thIdx = custom ? 0 : m.th; night = !custom && !!m.night;
  buildMG(); renderAll(); resetWorld();
  spawned = killed = 0; spawnT = 30; spawnPt = 0; queue = buildQueue();
  for (const p of players) { p.skills = [0, 0, 0, 0]; p.bullets = 0; if (!p.out) spawnPlayer(p); }
  if (night && !demo) banner = { text: T('nightTip'), t: 200 };
}
function stepSpawn() {
  if (spawned >= queue.length || --spawnT > 0) return;
  if (enemies.length + stars.filter(s => !s.ply).length >= maxField()) { spawnT = 20; return; }
  for (let k = 0; k < 3; k++) {
    const x = SPAWNS[(spawnPt + k) % 3];
    if (!tankAt(x, 0)) {
      stars.push({ x, y: 0, t: 56, q: queue[spawned++] });
      spawnPt = (spawnPt + k + 1) % 3;
      spawnT = enemies.length < 2 ? Math.min(60, spawnInterval()) : spawnInterval();
      return;
    }
  }
  spawnT = 15;
}
function stepFx() {
  for (const s of stars) {
    if (--s.t > 0 || s.ply) continue;
    if (tankAt(s.x, s.y)) { s.t = 6; continue; }
    enemies.push(makeEnemy(s.x, s.y, s.q)); s.done = true;
  }
  stars = stars.filter(s => s.t > 0 && !s.done);
  for (const b of booms) b.t++;
  booms = booms.filter(b => b.t < b.max);
  for (const p of pops) { p.t--; p.y -= 0.35; }
  pops = pops.filter(p => p.t > 0);
  if (banner && --banner.t <= 0) banner = null;
  fx.update(STEP);
  if (shake > 0) shake = Math.max(0, shake - 0.4);
  if (baseDead && F % 7 === 0) fx.burst(BASE.x + 16 + rnd(-6, 6), BASE.y + 10, { n: 1, color: ['#4a4d52', '#5d6066'], speed: 12, life: 1.6, size: 7, gravity: -26 });
}
function stepWorld() {
  stageF++;
  if (freezeT > 0) freezeT--;
  if (shovelT > 0) stepShovel();
  stepSpawn();
  for (const p of players) stepPlayer(p);
  for (const e of enemies) if (e.alive) stepEnemy(e);
  stepBullets();
  enemies = enemies.filter(e => e.alive);
  stepPower();
  stepFx();
  if (F % 40 === 0) fadeTreads();
  checkEnd();
}
function checkEnd() {
  if (!overSeq && players.every(p => p.out)) startGameOver();
  if (overSeq) {
    overSeq++;
    if (demo) { if (overSeq > 90) startDemo(); }
    else if (overSeq > 210) showOver();
    return;
  }
  if (killed >= queue.length && ++clearT > 170) { if (demo) startDemo(); else startTally(); }
}

// ---------------- 幕布 / 结算 ----------------
const CL = 30, HOLD = 110;
function startCurtain() { state = 'curtain'; curtain = { t: 0 }; KIT.stopMusic(); }
function stepCurtain() {
  const t = ++curtain.t;
  if (t === CL) loadStage();
  if (t === CL + 6) snd('start');
  if (t >= CL * 2 + HOLD) { curtain = null; state = 'play'; KIT.music('tank-march'); }
}
const stageLabel = () => custom ? '★' : String(stageIdx + 1 + loop * MAPS.length);
function stageName() { return custom ? T('customName') : T('stageNames')[stageIdx]; }
function startTally() {
  state = 'tally'; KIT.stopMusic();
  if (!custom && stageIdx + 1 > unlock) { unlock = Math.min(MAPS.length - 1, stageIdx + 1); store.set('unlock', unlock); }
  saveBest();
  tally = { row: 0, cnt: players.map(() => [0, 0, 0, 0]), wait: 40, total: false, bonus: -1, done: false, silent: false };
}
function stepTally() {
  const tl = tally;
  if (tl.wait > 0) { tl.wait--; return; }
  if (tl.done) { finishTally(); return; }
  if (tl.row < 4) {
    let more = false;
    players.forEach((p, i) => { if (tl.cnt[i][tl.row] < p.skills[tl.row]) { tl.cnt[i][tl.row]++; more = true; } });
    if (more) { if (!tl.silent) snd('tick'); tl.wait = 7; } else { tl.row++; tl.wait = 22; }
    return;
  }
  if (!tl.total) {
    tl.total = true; tl.wait = 40;
    if (players.length === 2) {
      const a = sumK(players[0].skills), b = sumK(players[1].skills);
      if (a !== b) { tl.bonus = a > b ? 0 : 1; addScore(players[tl.bonus], 1000); if (!tl.silent) snd('life'); }
    }
    return;
  }
  tl.done = true; tl.wait = 130;
}
const sumK = a => a[0] + a[1] + a[2] + a[3];
function skipTally() {
  if (!tally || tally.done) { if (tally) tally.wait = Math.min(tally.wait, 10); return; }
  tally.silent = true;
  for (let k = 0; k < 400 && !tally.done; k++) { tally.wait = 0; stepTally(); }
  tally.wait = 50;
}
function finishTally() {
  tally = null;
  if (custom) { if (fromEditor) enterEditor(); else toMenu(); return; }
  if (stageIdx >= MAPS.length - 1) { showWin(); return; }
  stageIdx++;
  startCurtain();
}

// ---------------- 绘制：坦克 ----------------
function rr(g, x, y, w, h, r) { KIT.roundRect(g, x, y, w, h, r); g.fill(); }
function circ(g, x, y, r) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
function drawTankShape(g, cx, cy, dir, kind, col, tread, sc) {
  const [b, d, l] = col, heavy = kind === 'armor', slim = kind === 'fast';
  g.save(); g.translate(cx, cy); g.rotate(dir * Math.PI / 2); if (sc) g.scale(sc, sc);
  const tw = heavy ? 8 : slim ? 6 : 7, tx = 15;
  g.fillStyle = '#1b1c20'; rr(g, -tx, -14, tw, 28, 2); rr(g, tx - tw, -14, tw, 28, 2);
  g.fillStyle = d;
  const o = ((tread % 4) + 4) % 4;
  for (let y = -14 + o; y < 13; y += 4) { g.fillRect(-tx + 1, y, tw - 2, 2); g.fillRect(tx - tw + 1, y, tw - 2, 2); }
  const hw = slim ? 14 : heavy ? 20 : 18, hh = heavy ? 24 : 22;
  g.fillStyle = d; rr(g, -hw / 2, -hh / 2 + 1, hw, hh, 3);
  g.fillStyle = b; rr(g, -hw / 2 + 1, -hh / 2 + 1, hw - 2, hh - 3, 3);
  g.fillStyle = l; g.fillRect(-hw / 2 + 2, -hh / 2 + 2, hw - 4, 2);
  if (heavy) { g.fillStyle = d; g.fillRect(-hw / 2 + 2, -5, 3, 12); g.fillRect(hw / 2 - 5, -5, 3, 12); g.fillStyle = l; g.fillRect(-hw / 2 + 2, -5, 3, 1); g.fillRect(hw / 2 - 5, -5, 3, 1); }
  if (slim) { g.fillStyle = l; g.beginPath(); g.moveTo(-5, -9); g.lineTo(0, -12); g.lineTo(5, -9); g.closePath(); g.fill(); }
  if (kind === 'p1' || kind === 'p2' || kind === 'p3') { g.fillStyle = d; g.fillRect(-hw / 2 + 2, 7, hw - 4, 2); }
  const longB = kind === 'power' || kind === 'p3', bl = longB ? 17 : kind === 'p1' || kind === 'p2' ? 16 : 14, bw = longB ? 5 : 4;
  g.fillStyle = d; g.fillRect(-bw / 2, -bl, bw, bl);
  g.fillStyle = l; g.fillRect(-bw / 2 + 1, -bl + 1, 1, bl - 5);
  if (longB || kind === 'p2') { g.fillStyle = d; g.fillRect(-bw / 2 - 1, -bl, bw + 2, 3); }
  const trd = heavy || kind === 'p3' ? 7.5 : slim ? 5.5 : 6.5;
  g.fillStyle = d; circ(g, 0, 2, trd + 1);
  g.fillStyle = b; circ(g, 0, 2, trd);
  g.fillStyle = l; circ(g, -trd * 0.3, 2 - trd * 0.3, trd * 0.36);
  if (kind === 'p3') { g.fillStyle = d; circ(g, 0, 2, 2.2); }
  g.restore();
}
function tankCols(t) {
  if (t.team === 'p') return PCOL[t.idx];
  if (t.flash > 0 && t.flash % 4 < 2) return ['#ffffff', '#c8c8c8', '#ffffff'];
  if (t.bonus && (F >> 3) & 1) return RCOL;
  return t.type === 3 ? ACOL[t.hp] || ECOL : ECOL;
}
function drawTank(g, t) {
  if (t.team === 'p' && t.stun > 0 && (F >> 2) & 1) return;
  g.fillStyle = 'rgba(0,0,0,.32)'; rr(g, t.x + 3, t.y + 5, 30, 29, 6);
  drawTankShape(g, t.x + 16, t.y + 16, t.dir, t.team === 'p' ? 'p' + t.lvl : ETYPES[t.type].k, tankCols(t), t.tread);
  if (t.mz > 0) {
    const [dx, dy] = DIRS[t.dir];
    g.save(); g.globalCompositeOperation = 'lighter';
    g.fillStyle = `rgba(255,230,140,${t.mz / 4})`; circ(g, t.x + 16 + dx * 20, t.y + 16 + dy * 20, 5 + t.mz);
    g.restore();
  }
  if (t.team === 'e' && freezeT > 0 && (freezeT > 120 || (F >> 3) & 1)) {
    g.fillStyle = 'rgba(160,225,255,.38)'; rr(g, t.x + 1, t.y + 1, 30, 30, 5);
    g.strokeStyle = 'rgba(230,250,255,.85)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(t.x + 6, t.y + 8); g.lineTo(t.x + 12, t.y + 14); g.moveTo(t.x + 24, t.y + 22); g.lineTo(t.x + 28, t.y + 27); g.stroke();
  }
  if (t.team === 'p' && t.shield > 0) {
    g.save(); g.translate(t.x + 16, t.y + 16);
    g.fillStyle = 'rgba(120,220,255,.1)'; circ(g, 0, 0, 21);
    g.strokeStyle = `rgba(130,225,255,${0.55 + 0.35 * Math.sin(F * 0.5)})`; g.lineWidth = 2;
    g.setLineDash([6, 5]); g.lineDashOffset = -F * 0.8;
    g.beginPath(); g.arc(0, 0, 21, 0, Math.PI * 2); g.stroke();
    g.setLineDash([]); g.restore();
  }
}
function drawSpawnStar(g, s) {
  const R = 5 + Math.abs(Math.sin(s.t * 0.3)) * 11;
  g.save(); g.translate(s.x + 16, s.y + 16); g.rotate(F * 0.12);
  g.globalCompositeOperation = 'lighter';
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, R * 1.7);
  gr.addColorStop(0, 'rgba(140,220,255,.7)'); gr.addColorStop(1, 'rgba(140,220,255,0)');
  g.fillStyle = gr; circ(g, 0, 0, R * 1.7);
  g.fillStyle = '#fff'; g.beginPath();
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, r = i % 2 ? R * 0.22 : R; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
  g.closePath(); g.fill(); g.restore();
}
function drawBullets(g) {
  for (const b of bullets) {
    g.save(); g.translate(b.x, b.y); g.rotate(b.dir * Math.PI / 2);
    const gr = g.createLinearGradient(0, 0, 0, 16);
    gr.addColorStop(0, b.team === 'p' ? 'rgba(255,214,110,.75)' : 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(-1.5, 0, 3, 16);
    g.fillStyle = b.steel ? '#ffad42' : b.team === 'p' ? '#fff6d8' : '#f2f2f2';
    g.beginPath(); g.moveTo(0, -5); g.lineTo(2.6, -1); g.lineTo(2.6, 4); g.lineTo(-2.6, 4); g.lineTo(-2.6, -1); g.closePath(); g.fill();
    g.restore();
  }
}
function drawBooms(g) {
  g.save(); g.globalCompositeOperation = 'lighter';
  for (const b of booms) {
    if (b.t < 0) continue;
    const k = b.t / b.max;
    if (!b.big) {
      const r = 3 + 11 * KIT.ease.outCubic(k);
      g.globalAlpha = 1 - k;
      g.fillStyle = '#ff7a2a'; circ(g, b.x, b.y, r);
      g.fillStyle = k < 0.35 ? '#ffffff' : '#ffd25a'; circ(g, b.x, b.y, r * 0.55);
    } else {
      const r = 10 + 28 * KIT.ease.outCubic(k);
      g.globalAlpha = Math.max(0, 1 - k * 1.1);
      for (let i = 0; i < 6; i++) {
        const a = b.seed + i * 1.05, rr2 = r * (0.42 + 0.18 * Math.sin(b.seed * 5 + i * 2)) * (1 - k * 0.4);
        const ox = b.x + Math.cos(a) * r * 0.45, oy = b.y + Math.sin(a) * r * 0.45;
        const gr = g.createRadialGradient(ox, oy, 0, ox, oy, rr2);
        gr.addColorStop(0, k < 0.3 ? 'rgba(255,255,236,1)' : 'rgba(255,200,90,.95)'); gr.addColorStop(0.55, 'rgba(255,110,30,.8)'); gr.addColorStop(1, 'rgba(150,30,10,0)');
        g.fillStyle = gr; circ(g, ox, oy, rr2);
      }
      g.strokeStyle = `rgba(255,220,160,${0.6 * (1 - k)})`; g.lineWidth = 3 * (1 - k) + 0.5;
      g.beginPath(); g.arc(b.x, b.y, r * 1.35, 0, Math.PI * 2); g.stroke();
    }
  }
  g.restore();
}
function drawPwr(g) {
  if (!pwr || (pwr.t < 240 && (F >> 2) & 1)) return;
  const s = 1 + Math.sin(F * 0.15) * 0.07;
  g.save(); g.translate(pwr.x + 16, pwr.y + 16); g.scale(s, s);
  g.shadowColor = '#ffe08a'; g.shadowBlur = 14;
  g.fillStyle = (F >> 3) & 1 ? '#ffffff' : '#ffeccb'; rr(g, -14, -14, 28, 28, 7);
  g.shadowBlur = 0; g.lineWidth = 2; g.strokeStyle = '#e2463a'; KIT.roundRect(g, -14, -14, 28, 28, 7); g.stroke();
  if (pwr.kind === 'tank') drawTankShape(g, 0, 1, 0, 'p0', PCOL[0], 0, 0.62);
  else { g.font = '17px ' + EMOJI; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(PICON[pwr.kind], 0, 1.5); }
  g.restore();
}
function drawNight(g) {
  dk.globalCompositeOperation = 'source-over';
  dk.clearRect(0, 0, FS, FS);
  dk.fillStyle = 'rgba(3,5,14,.93)'; dk.fillRect(0, 0, FS, FS);
  dk.globalCompositeOperation = 'destination-out';
  const hole = (x, y, r, a) => {
    const gr = dk.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(0.6, `rgba(0,0,0,${a * 0.7})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    dk.fillStyle = gr; dk.beginPath(); dk.arc(x, y, r, 0, Math.PI * 2); dk.fill();
  };
  for (const p of players) {
    if (!p.alive) continue;
    const cx = p.x + 16, cy = p.y + 16, ang = -Math.PI / 2 + p.dir * Math.PI / 2, R = 170;
    const gr = dk.createRadialGradient(cx, cy, 10, cx, cy, R);
    gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.65, 'rgba(0,0,0,.75)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    dk.fillStyle = gr; dk.beginPath(); dk.moveTo(cx, cy); dk.arc(cx, cy, R, ang - 0.46, ang + 0.46); dk.closePath(); dk.fill();
    hole(cx, cy, 46, 1);
  }
  for (const b of booms) if (b.t >= 0) hole(b.x, b.y, (b.big ? 90 : 34) * (1 - b.t / b.max), 1);
  for (const b of bullets) hole(b.x, b.y, 16, 0.8);
  for (const s of stars) hole(s.x + 16, s.y + 16, 34, 0.9);
  hole(BASE.x + 16, BASE.y + 16, 40 + Math.sin(F * 0.2) * 3, 0.85);
  if (pwr) hole(pwr.x + 16, pwr.y + 16, 34, 0.9);
  dk.globalCompositeOperation = 'source-over';
  g.drawImage(darkCv, 0, 0, FS, FS);
  // 黑暗中的红眼睛
  for (const e of enemies) {
    const [dx, dy] = DIRS[e.dir], px = -dy, py = dx, cx = e.x + 16 + dx * 6, cy = e.y + 16 + dy * 6;
    g.fillStyle = `rgba(255,60,50,${0.7 + 0.3 * Math.sin(F * 0.2 + e.id)})`;
    circ(g, cx + px * 4, cy + py * 4, 1.6); circ(g, cx - px * 4, cy - py * 4, 1.6);
  }
}
function drawField(g) {
  g.drawImage(groundCv, 0, 0, FS, FS);
  g.drawImage(treadCv, 0, 0, FS, FS);
  g.fillStyle = WATER[(F >> 4) % 3]; g.fill(waterPath);
  g.drawImage(mapCv, 0, 0, FS, FS);
  g.save(); g.imageSmoothingEnabled = false; g.drawImage(baseDead ? EAGLE_DEAD : EAGLE, BASE.x, BASE.y, 32, 32); g.restore();
  for (const s of stars) drawSpawnStar(g, s);
  for (const e of enemies) drawTank(g, e);
  for (const p of players) if (p.alive) drawTank(g, p);
  drawBullets(g);
  drawBooms(g);
  fx.draw(g);
  g.drawImage(treeCv, 0, 0, FS, FS);
  if (night) { drawNight(g); drawBullets(g); }
  drawPwr(g);
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 12px ' + MONO;
  for (const p of pops) {
    g.globalAlpha = Math.min(1, p.t / 20);
    g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,.7)'; g.strokeText(p.text, p.x, p.y);
    g.fillStyle = p.col; g.fillText(p.text, p.x, p.y);
  }
  g.globalAlpha = 1;
  if (banner) {
    g.globalAlpha = Math.min(1, banner.t / 20);
    g.font = '15px ' + DISP;
    const w = g.measureText(banner.text).width + 28;
    g.fillStyle = 'rgba(0,0,0,.6)'; rr(g, FS / 2 - w / 2, 22, w, 28, 14);
    g.fillStyle = '#ffe08a'; g.fillText(banner.text, FS / 2, 37);
    g.globalAlpha = 1;
  }
}

// ---------------- 绘制：信息栏 / 幕布 / 结算 ----------------
function miniTank(g, x, y, col) { g.fillStyle = col; g.fillRect(x, y + 1, 3, 10); g.fillRect(x + 8, y + 1, 3, 10); g.fillRect(x + 3, y + 3, 5, 7); g.fillRect(x + 4.5, y - 1, 2, 5); }
function drawBezel(g) {
  g.fillStyle = '#6b6e75'; g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(0, 0, W, 2);
  g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(FX - 2, FY - 2, FS + 4, FS + 4);
  g.fillStyle = '#5c5f66';
  for (const [x, y] of [[6, 6], [W - 10, 6], [6, H - 10], [W - 10, H - 10], [FX + FS + 2, 6], [FX + FS + 2, H - 10]]) { g.fillRect(x, y, 4, 4); }
}
function drawPanel(g) {
  const px = FX + FS + 14;
  g.textAlign = 'left'; g.textBaseline = 'top';
  const remain = Math.max(0, queue.length - spawned);
  for (let k = 0; k < remain; k++) miniTank(g, px + 4 + (k % 2) * 22, 24 + Math.floor(k / 2) * 16, '#24262b');
  players.forEach((p, i) => {
    const y = 206 + i * 62;
    g.fillStyle = '#24262b'; g.font = 'bold 15px ' + MONO; g.fillText(i ? 'IIP' : 'IP', px, y);
    g.fillStyle = PCOL[i][0]; g.fillRect(px + (i ? 36 : 24), y + 4, 8, 8);
    miniTank(g, px, y + 21, '#24262b');
    g.fillStyle = '#24262b'; g.font = 'bold 15px ' + MONO; g.fillText(String(Math.max(0, p.lives)), px + 18, y + 19);
    for (let s = 0; s < p.lvl; s++) { g.fillStyle = '#ffd84a'; g.font = '10px ' + MONO; g.fillText('★', px + 40 + s * 10, y + 22); }
    g.fillStyle = '#e9ebef'; g.font = 'bold 11px ' + MONO; g.fillText(String(p.score).padStart(7, '0'), px, y + 40);
  });
  const fy = 340;
  g.fillStyle = '#24262b'; g.fillRect(px + 4, fy, 2, 26);
  g.fillStyle = '#e2732a'; g.beginPath(); g.moveTo(px + 6, fy); g.lineTo(px + 26, fy + 6); g.lineTo(px + 6, fy + 13); g.closePath(); g.fill();
  g.fillStyle = '#24262b'; g.font = 'bold 18px ' + MONO; g.fillText(stageLabel(), px + 30, fy + 8);
  let ey = 384;
  const eff = (ic, k, col) => {
    g.font = '13px ' + EMOJI; g.fillText(ic, px, ey);
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(px + 20, ey + 5, 50, 5);
    g.fillStyle = col; g.fillRect(px + 20, ey + 5, 50 * k, 5);
    ey += 20;
  };
  if (freezeT > 0) eff('⏰', freezeT / 600, '#9fe3ff');
  if (shovelT > 0) eff('🧱', shovelT / 1080, '#ffb070');
}
function drawCurtain(g) {
  const t = curtain.t;
  let k = t < CL ? t / CL : t < CL + HOLD ? 1 : 1 - (t - CL - HOLD) / CL;
  k = KIT.ease.inOut(clamp(k, 0, 1));
  const h = H / 2 * k;
  g.fillStyle = '#6b6e75'; g.fillRect(0, 0, W, h); g.fillRect(0, H - h, W, h);
  g.fillStyle = 'rgba(0,0,0,.18)';
  for (let y = 8; y < h; y += 16) g.fillRect(0, y, W, 1);
  for (let y = H - 8; y > H - h; y -= 16) g.fillRect(0, y, W, 1);
  g.fillStyle = '#3f4248'; g.fillRect(0, h - 3, W, 3); g.fillRect(0, H - h, W, 3);
  if (t >= CL - 2 && t <= CL + HOLD + 4) {
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#1b1c20'; g.font = 'bold 30px ' + MONO; g.fillText('STAGE ' + stageLabel(), W / 2, H / 2 - 14);
    g.font = '17px ' + DISP; g.fillStyle = '#f4e6c8'; g.fillText(stageName() + (loop ? ' · ' + T('loopN', loop + 1) : ''), W / 2, H / 2 + 20);
    if (night) { g.font = '13px ' + DISP; g.fillStyle = '#c8d6ff'; g.fillText('🌙 NIGHT OPS', W / 2, H / 2 + 46); }
  }
}
function drawGameOverText(g) {
  const k = Math.min(1, overSeq / 110), y = FY + FS + 20 - (FS / 2 + 20) * KIT.ease.outCubic(k);
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 34px ' + MONO;
  g.lineWidth = 6; g.strokeStyle = '#1b0b07'; g.strokeText('GAME OVER', FX + FS / 2, y);
  g.fillStyle = '#e2463a'; g.fillText('GAME OVER', FX + FS / 2, y);
}
function drawTally(g) {
  const tl = tally;
  g.fillStyle = '#0b0b0d'; g.fillRect(0, 0, W, H);
  g.textBaseline = 'middle'; g.textAlign = 'center'; g.font = 'bold 16px ' + MONO;
  g.fillStyle = '#e2463a'; g.fillText('HI-SCORE', W / 2 - 60, 32);
  g.fillStyle = '#f2a43a'; g.fillText(String(Math.max(hiScore, ...players.map(p => p.score))), W / 2 + 70, 32);
  g.fillStyle = '#fff'; g.fillText('STAGE ' + stageLabel(), W / 2, 62);
  const two = players.length === 2;
  players.forEach((p, i) => {
    const x = i ? W / 2 + 140 : W / 2 - 140;
    g.fillStyle = '#e2463a'; g.fillText(i ? 'II-PLAYER' : 'I-PLAYER', x, 96);
    g.fillStyle = '#f2a43a'; g.fillText(String(p.score), x, 120);
  });
  for (let r = 0; r < 4; r++) {
    const y = 166 + r * 42;
    drawTankShape(g, W / 2, y, 0, ETYPES[r].k, ECOL, 0, 0.8);
    if (r > tl.row) continue;
    players.forEach((p, i) => {
      const n = tl.cnt[i][r], s = i ? 1 : -1;
      g.fillStyle = '#fff'; g.font = 'bold 15px ' + MONO;
      g.textAlign = 'right'; g.fillText(i ? '' : String(n * ETYPES[r].pts) + ' PTS', W / 2 - 92, y);
      if (i) { g.textAlign = 'left'; g.fillText(String(n * ETYPES[r].pts) + ' PTS', W / 2 + 92, y); }
      g.textAlign = 'center'; g.fillText(String(n), W / 2 + s * 58, y); g.fillText(i ? '▶' : '◀', W / 2 + s * 30, y);
    });
  }
  g.fillStyle = '#fff'; g.fillRect(W / 2 - (two ? 190 : 150), 340, two ? 380 : 190, 2);
  if (tl.total) {
    g.textAlign = 'center'; g.font = 'bold 15px ' + MONO;
    g.fillText('TOTAL', W / 2, 362);
    players.forEach((p, i) => g.fillText(String(sumK(tl.cnt[i])), W / 2 + (i ? 58 : -58), 362));
    if (tl.bonus >= 0 && (F >> 4) & 1) {
      g.fillStyle = '#e2463a'; g.fillText('BONUS!', W / 2 + (tl.bonus ? 140 : -140), 396);
      g.fillStyle = '#fff'; g.fillText('1000 PTS', W / 2 + (tl.bonus ? 140 : -140), 418);
    }
  }
}
function drawEditor(g) {
  g.lineWidth = 1;
  g.strokeStyle = 'rgba(255,255,255,.06)';
  g.beginPath(); for (let k = 1; k < HT; k++) { g.moveTo(k * 16 + 0.5, 0); g.lineTo(k * 16 + 0.5, FS); g.moveTo(0, k * 16 + 0.5); g.lineTo(FS, k * 16 + 0.5); } g.stroke();
  g.strokeStyle = 'rgba(255,255,255,.14)';
  g.beginPath(); for (let k = 1; k < 13; k++) { g.moveTo(k * 32 + 0.5, 0); g.lineTo(k * 32 + 0.5, FS); g.moveTo(0, k * 32 + 0.5); g.lineTo(FS, k * 32 + 0.5); } g.stroke();
  g.setLineDash([4, 3]); g.lineWidth = 1.5; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 10px ' + MONO;
  for (const x of SPAWNS) { g.strokeStyle = 'rgba(255,100,90,.8)'; g.strokeRect(x + 1, 1, 30, 30); g.fillStyle = 'rgba(255,100,90,.9)'; g.fillText('E', x + 16, 16); }
  PSPAWN.forEach((x, i) => { g.strokeStyle = PCOL[i][0]; g.strokeRect(x + 1, 385, 30, 30); g.fillStyle = PCOL[i][0]; g.fillText(i ? '2P' : '1P', x + 16, 400); });
  g.setLineDash([]);
  if (edHover) {
    const sz = bsize === 2 ? 32 : 16, hx = bsize === 2 ? edHover.hx & ~1 : edHover.hx, hy = bsize === 2 ? edHover.hy & ~1 : edHover.hy;
    g.fillStyle = erasing || brush === E ? 'rgba(255,90,80,.25)' : 'rgba(255,255,255,.18)'; g.fillRect(hx * 16, hy * 16, sz, sz);
    g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.strokeRect(hx * 16 + 0.75, hy * 16 + 0.75, sz - 1.5, sz - 1.5);
  }
}
function render() {
  drawBezel(c);
  if (state === 'tally' && tally) { drawTally(c); return; }
  c.save();
  if (shake > 0) c.translate(rnd(-shake, shake), rnd(-shake, shake));
  c.save(); c.beginPath(); c.rect(FX, FY, FS, FS); c.clip(); c.translate(FX, FY);
  drawField(c);
  if (state === 'edit') drawEditor(c);
  c.restore(); c.restore();
  if (state !== 'edit') drawPanel(c);
  if (overSeq && !demo) drawGameOverText(c);
  if (curtain) drawCurtain(c);
}

// ---------------- 主循环 ----------------
let acc = 0, last = performance.now();
function tick() {
  F++;
  if (state === 'menu') { if (demo) stepWorld(); return; }
  if (state === 'curtain') { stepCurtain(); return; }
  if (state === 'tally') { stepTally(); return; }
  if (state === 'play') stepWorld();
  else if (state === 'over' || state === 'win' || state === 'edit') { fx.update(STEP); if (shake > 0) shake = Math.max(0, shake - 0.4); }
}
function loopFrame(now) {
  acc += Math.min(0.1, (now - last) / 1000); last = now;
  pollPads();
  let n = 0;
  while (acc >= STEP && n++ < 6) { acc -= STEP; tick(); }
  if (n >= 6) acc = 0;
  render();
  requestAnimationFrame(loopFrame);
}

// ---------------- 输入 ----------------
const keys = new Set(), keyT = {};
let keySeq = 0;
const K1 = { dir: [['KeyW', 'Tch_0', 'Pad0_0'], ['KeyD', 'Tch_1', 'Pad0_1'], ['KeyS', 'Tch_2', 'Pad0_2'], ['KeyA', 'Tch_3', 'Pad0_3']], fire: ['Space', 'KeyJ', 'KeyF', 'Tch_f', 'Pad0_f'] };
const K2 = { dir: [['ArrowUp', 'Pad1_0'], ['ArrowRight', 'Pad1_1'], ['ArrowDown', 'Pad1_2'], ['ArrowLeft', 'Pad1_3']], fire: ['Enter', 'NumpadEnter', 'Numpad0', 'Slash', 'Period', 'Pad1_f'] };
const isFire = code => K1.fire.includes(code) || K2.fire.includes(code);
const GAME_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Slash']);
function press(code) {
  keys.add(code); keyT[code] = ++keySeq;
  if (state === 'tally' && isFire(code)) skipTally();
  else if (state === 'curtain' && isFire(code) && curtain.t > CL + 20 && curtain.t < CL + HOLD) curtain.t = CL + HOLD;
}
document.addEventListener('keydown', e => {
  if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
  if (GAME_KEYS.has(e.code) && state !== 'menu' && !(state === 'edit' && e.code === 'Enter')) e.preventDefault();
  if (e.repeat) return;
  if (e.code === 'KeyP' || e.code === 'Escape') { if (state === 'edit') exitEditor(); else togglePause(); return; }
  if (state === 'menu' && (e.code === 'Enter' || e.code === 'Space')) { e.preventDefault(); $('btn-start').click(); return; }
  if (state === 'edit') {
    const n = '012345'.indexOf(e.key);
    if (n >= 0) { brush = n; syncEditBar(); }
    return;
  }
  press(e.code);
});
document.addEventListener('keyup', e => keys.delete(e.code));
window.addEventListener('blur', () => { keys.clear(); if (state === 'play') togglePause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') togglePause(); });
const padPrev = [false, false];
function pollPads() {
  let gps = [];
  try { gps = navigator.getGamepads ? navigator.getGamepads() : []; } catch (e) { return; }
  for (let i = 0; i < 2; i++) {
    const g = gps[i];
    const b = k => !!(g && g.buttons[k] && g.buttons[k].pressed);
    const st = g ? [b(12) || g.axes[1] < -0.5, b(15) || g.axes[0] > 0.5, b(13) || g.axes[1] > 0.5, b(14) || g.axes[0] < -0.5, b(0) || b(1) || b(2) || b(3)] : [0, 0, 0, 0, 0];
    ['0', '1', '2', '3', 'f'].forEach((s, k) => {
      const code = 'Pad' + i + '_' + s;
      if (st[k]) { if (!keys.has(code)) { press(code); if (s === 'f' && state === 'menu') $('btn-start').click(); } } else keys.delete(code);
    });
    const pz = b(9);
    if (pz && !padPrev[i]) togglePause();
    padPrev[i] = pz;
  }
}
document.querySelectorAll('#pad [data-k]').forEach(btn => {
  const code = 'Tch_' + btn.dataset.k;
  const on = e => { e.preventDefault(); KIT.audio(); press(code); btn.classList.add('on'); };
  const offF = () => { keys.delete(code); btn.classList.remove('on'); };
  btn.addEventListener('pointerdown', on); btn.addEventListener('pointerup', offF); btn.addEventListener('pointercancel', offF); btn.addEventListener('pointerleave', offF);
});
$('pad-pause').addEventListener('click', () => togglePause());

// ---------------- 地图工坊 ----------------
function setHalf(hx, hy, v) {
  if (isProtected(hx, hy) || ht[hy * HT + hx] === v) return false;
  ht[hy * HT + hx] = v;
  for (let k = 0; k < 4; k++) setCell(hx * 2 + (k & 1), hy * 2 + (k >> 1), v);
  return true;
}
function paintAt(e) {
  const p = KIT.point(cv, e, W, H), fx0 = p.x - FX, fy0 = p.y - FY;
  if (fx0 < 0 || fy0 < 0 || fx0 >= FS || fy0 >= FS) { edHover = null; return; }
  const hx = Math.floor(fx0 / 16), hy = Math.floor(fy0 / 16);
  edHover = { hx, hy };
  if (!painting) return;
  const v = erasing ? E : brush;
  const cells = bsize === 2 ? [[hx & ~1, hy & ~1], [(hx & ~1) + 1, hy & ~1], [hx & ~1, (hy & ~1) + 1], [(hx & ~1) + 1, (hy & ~1) + 1]] : [[hx, hy]];
  let ch = false;
  for (const [x, y] of cells) ch = setHalf(x, y, v) || ch;
  if (ch) { rebuildWater(); KIT.tone(v ? 300 + v * 80 : 200, 0.03, { type: 'square', vol: 0.02 }); }
}
cv.addEventListener('pointerdown', e => {
  if (state !== 'edit') return;
  e.preventDefault(); painting = true; erasing = e.button === 2;
  try { cv.setPointerCapture(e.pointerId); } catch (_) {}
  paintAt(e);
});
cv.addEventListener('pointermove', e => { if (state === 'edit') paintAt(e); });
const endPaint = () => { if (painting) { painting = false; erasing = false; saveCustom(); } };
cv.addEventListener('pointerup', endPaint); cv.addEventListener('pointercancel', endPaint);
cv.addEventListener('pointerleave', () => { if (!painting) edHover = null; });
cv.addEventListener('contextmenu', e => { if (state === 'edit') e.preventDefault(); });
function saveCustom() { store.set('custom', Array.from(ht).join('')); }
function reachable(a) {
  const pass = (tx, ty) => { for (let k = 0; k < 4; k++) { const v = a[(ty * 2 + (k >> 1)) * HT + tx * 2 + (k & 1)]; if (v === ST || v === WA) return false; } return true; };
  const seen = new Uint8Array(169), q = [[6, 10]]; seen[136] = 1;
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx > 12 || ny > 12 || seen[ny * 13 + nx] || !pass(nx, ny)) continue;
      seen[ny * 13 + nx] = 1; q.push([nx, ny]);
    }
  }
  return [[0, 0], [6, 0], [12, 0], [4, 12], [8, 12]].every(([x, y]) => seen[y * 13 + x]);
}
function genRandom() {
  const P = [[BR, 0.3], [ST, 0.05], [WA, 0.06], [TR, 0.08], [IC, 0.04]];
  const HALF = [[1, 1, 1, 1], [1, 1, 0, 0], [0, 0, 1, 1], [1, 0, 1, 0], [0, 1, 0, 1]];
  for (let tries = 0; tries < 40; tries++) {
    const a = new Uint8Array(HT * HT);
    for (let ty = 0; ty < 13; ty++) for (let tx = 0; tx < 7; tx++) {
      let r = Math.random(), v = E;
      for (const [t, p] of P) { if (r < p) { v = t; break; } r -= p; }
      if (!v) continue;
      const mask = v === BR && Math.random() < 0.3 ? HALF[ri(1, 4)] : HALF[0];
      for (let k = 0; k < 4; k++) if (mask[k]) {
        const hx = tx * 2 + (k & 1), hy = ty * 2 + (k >> 1);
        a[hy * HT + hx] = v; a[hy * HT + (HT - 1 - hx)] = v;
      }
    }
    applyReserved(a);
    if (reachable(a)) { ht = a; return; }
  }
}
function edLoad() { buildMG(); renderAll(); saveCustom(); }
function enterEditor() {
  demo = false; state = 'edit'; hideScreens(); KIT.stopMusic(); curtain = null; tally = null;
  $('edit-bar').classList.remove('hidden'); $('pad').classList.add('hidden');
  ht = loadCustomHT(); thIdx = 0; night = false; players = []; queue = []; spawned = 0;
  buildMG(); renderAll(); resetWorld();
  syncEditBar();
  banner = { text: T('edTip'), t: 260 };
}
function exitEditor() { $('edit-bar').classList.add('hidden'); toMenu(); }
function syncEditBar() {
  document.querySelectorAll('#edit-bar [data-b]').forEach(b => { b.classList.toggle('on', +b.dataset.b === brush); b.title = T('edB')[+b.dataset.b]; });
  $('ed-size').textContent = bsize === 2 ? '⬛' : '▪️';
  $('ed-size').title = T('edSize'); $('ed-rand').title = T('edRand'); $('ed-clear').title = T('edClear'); $('ed-test').title = T('edTest'); $('ed-exit').title = T('edExit');
}
document.querySelectorAll('#edit-bar [data-b]').forEach(b => b.onclick = () => { brush = +b.dataset.b; syncEditBar(); });
$('ed-size').onclick = () => { bsize = bsize === 2 ? 1 : 2; syncEditBar(); };
$('ed-rand').onclick = () => { genRandom(); edLoad(); KIT.arp([523, 659, 784], 0.05, { type: 'square', vol: 0.04 }); };
$('ed-clear').onclick = () => { ht = new Uint8Array(HT * HT); applyReserved(ht); edLoad(); };
$('ed-test').onclick = () => { saveCustom(); $('edit-bar').classList.add('hidden'); newGame(0, { custom: true, fromEditor: true }); };
$('ed-exit').onclick = exitEditor;

// ---------------- 屏幕 / 菜单 ----------------
function togglePause() {
  if (state === 'play' || state === 'curtain' || state === 'tally') { prevState = state; state = 'pause'; $('screen-pause').classList.remove('hidden'); KIT.stopMusic(); }
  else if (state === 'pause') { state = prevState; $('screen-pause').classList.add('hidden'); if (state === 'play' && !overSeq) KIT.music('tank-march'); last = performance.now(); }
}
function hideScreens() { ['screen-menu', 'screen-pause', 'screen-over', 'screen-win'].forEach(id => $(id).classList.add('hidden')); }
function topScore() { return players.length ? Math.max(...players.map(p => p.score)) : 0; }
function saveBest() {
  if (demo) return false;
  const top = topScore();
  if (top > hiScore) { hiScore = top; store.set('best', hiScore); return true; }
  return false;
}
function stats(id) {
  const rows = [];
  players.forEach((p, i) => rows.push([players.length === 2 ? T('stScoreP', i + 1) : T('stScore'), p.score.toLocaleString()]));
  rows.push([T('stStage'), custom ? T('customName') : stageLabel() + ' · ' + stageName()]);
  rows.push([T('stKills'), players.reduce((s, p) => s + sumK(p.kills), 0)]);
  if (continues) rows.push([T('stCont'), continues]);
  rows.push([T('stBest'), hiScore.toLocaleString()]);
  $(id).innerHTML = rows.map(([a, b]) => `<span>${a}</span><b>${b}</b>`).join('');
}
function showOver() {
  state = 'over';
  const rec = saveBest();
  $('over-record').classList.toggle('hidden', !rec);
  $('over-sub').textContent = baseDead ? T('overBase') : T('overAll');
  stats('over-stats');
  $('screen-over').classList.remove('hidden');
}
function showWin() {
  state = 'win';
  const rec = saveBest();
  $('win-record').classList.toggle('hidden', !rec);
  stats('win-stats');
  $('screen-win').classList.remove('hidden');
  KIT.arp([523, 659, 784, 1047, 784, 1047, 1319], 0.12, { type: 'square', vol: 0.06 });
}
function newGame(si, opts = {}) {
  demo = false; custom = !!opts.custom; fromEditor = !!opts.fromEditor; loop = opts.loop || 0; continues = 0;
  if (!opts.keep) { players = []; for (let i = 0; i < nP; i++) players.push(makePlayer(i)); }
  stageIdx = si;
  hideScreens(); KIT.audio(); $('pad').classList.remove('hidden');
  startCurtain();
}
function doContinue() {
  continues++;
  for (const p of players) { p.lives = DIFF.lives[diff]; p.out = false; p.lvl = 0; p.alive = false; }
  hideScreens(); startCurtain();
}
function startDemo() {
  demo = true; custom = false; loop = 0;
  players = [makePlayer(0), makePlayer(1)];
  for (const p of players) { p.ai = true; p.lives = 99; }
  stageIdx = [0, 3, 4, 8, 9, 1][demoIdx++ % 6];
  loadStage();
}
function toMenu() {
  if (players.length && !demo && state !== 'menu') saveBest();
  hideScreens(); state = 'menu'; KIT.stopMusic(); curtain = null; tally = null;
  $('edit-bar').classList.add('hidden'); $('pad').classList.remove('hidden');
  startDemo();
  renderMenu(); $('screen-menu').classList.remove('hidden');
}
function renderMenu() {
  document.querySelectorAll('#pl-seg button').forEach(b => b.classList.toggle('on', +b.dataset.n === nP));
  document.querySelectorAll('#diff-seg button').forEach(b => b.classList.toggle('on', +b.dataset.d === diff));
  const box = $('stage-pick'); box.innerHTML = '';
  const names = T('stageNames'), emo = ['🧱', '⚙️', '🌲', '🌊', '🧊', '🌙', '🏰', '🌀', '🏝️', '🔩', '🌌', '🦅'];
  names.forEach((n, i) => {
    const b = document.createElement('button');
    b.className = 'lvl-btn' + (i === pickStage ? ' active' : '') + (i > unlock ? ' locked' : '') + (i < unlock ? ' done' : '');
    b.innerHTML = `<span class="lv-emo">${i > unlock ? '🔒' : emo[i]}</span>${i + 1}<small>${n}</small>`;
    b.title = i > unlock ? T('locked') : n;
    b.onclick = () => { if (i > unlock) { KIT.tone(200, 0.1, { type: 'square', vol: 0.04 }); return; } pickStage = i; store.set('pick', i); renderMenu(); };
    box.appendChild(b);
  });
  $('menu-best').textContent = T('bestLbl', hiScore.toLocaleString());
  $('hint-2p').classList.toggle('hidden', nP !== 2);
  $('hint-1p').classList.toggle('hidden', nP === 2);
}
document.querySelectorAll('#pl-seg button').forEach(b => b.onclick = () => { nP = +b.dataset.n; store.set('players', nP); renderMenu(); });
document.querySelectorAll('#diff-seg button').forEach(b => b.onclick = () => { diff = +b.dataset.d; store.set('diff', diff); renderMenu(); });
$('btn-start').onclick = () => newGame(pickStage);
$('btn-workshop').onclick = () => { KIT.audio(); enterEditor(); };
$('btn-resume').onclick = () => togglePause();
$('btn-restart').onclick = () => { $('screen-pause').classList.add('hidden'); for (const p of players) { p.alive = false; p.out = false; } startCurtain(); };
$('btn-quit').onclick = () => { if (fromEditor) enterEditor(); else toMenu(); };
$('btn-continue').onclick = doContinue;
$('btn-retry').onclick = () => newGame(0, { custom, fromEditor });
$('btn-menu').onclick = () => { if (fromEditor) enterEditor(); else toMenu(); };
$('btn-loop').onclick = () => { hideScreens(); for (const p of players) { p.out = false; if (p.lives < 1) p.lives = 1; } newGame(0, { loop: loop + 1, keep: true }); };
$('btn-menu2').onclick = toMenu;

if (location.hash === '#debug') window.__tk = {
  info: () => ({ state, stageIdx, loop, demo, enemies: enemies.length, spawned, killed, queue: queue.length, bullets: bullets.length, pwr: pwr && pwr.kind, freezeT, shovelT, baseDead,
    players: players.map(p => ({ x: p.x, y: p.y, alive: p.alive, lives: p.lives, lvl: p.lvl, score: p.score, shield: p.shield, out: p.out })) }),
  stage: i => newGame(i),
  god: () => players.forEach(p => { p.shield = 1e9; }),
  lvl: n => players.forEach(p => { p.lvl = n; }),
  power: k => { spawnPower(); pwr.kind = k; pwr.x = players[0].x; pwr.y = players[0].y - 40; },
  bonus: () => { spawnPower(); },
  killAll: () => { for (const e of enemies) killEnemy(e, players[0], true); killed = queue.length; spawned = queue.length; stars = []; },
  hurtBase: () => destroyBase(),
  die: () => players.forEach(p => { p.shield = 0; p.lives = 0; if (p.alive) killPlayer(p); }),
  tp: (x, y) => { players[0].x = x; players[0].y = y; },
  freeze: () => { freezeT = 600; }
};
const syncMute = KIT.mountMute($('btn-mute'));
KIT.boot(() => { syncMute(); renderMenu(); if (state === 'edit') syncEditBar(); });
toMenu();
requestAnimationFrame(loopFrame);
})();
