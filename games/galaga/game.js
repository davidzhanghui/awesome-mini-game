/* 小蜜蜂 Galaga · 星际蜂群 —— 致敬街机 Galaga 的网页重制版
 * 逻辑画布 448×576（竖版）。敌机沿“海龟路径”入场 → 编队摇摆 / 呼吸 → 俯冲攻击；
 * Boss 牵引光束可俘虏战机，击落押送中的 Boss 可救回战机变成双机；每 4 关一个挑战关。
 */
(() => {
'use strict';
const { $, T } = KIT;
const store = KIT.store('amg-galaga');
const W = 448, H = 576, STEP = 1 / 60, PY = 514;
const cv = $('game'), c = KIT.canvas(cv, W, H);
const MONO = '"Courier New", ui-monospace, Menlo, monospace';
const DISP = '"AMG Display", "PingFang SC", system-ui, sans-serif';
const rnd = (a, b) => a + Math.random() * (b - a);
const ri = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const clamp = KIT.clamp;
const TAU = Math.PI * 2;
const angDiff = (a, b) => ((b - a + Math.PI * 3) % TAU) - Math.PI;

// ---------------- 像素精灵（左半 + 中线，自动镜像） ----------------
const mirror = rows => rows.map(r => r + [...r.slice(0, 7)].reverse().join(''));
function pix(rows, pal) {
  const o = document.createElement('canvas'); o.width = rows[0].length; o.height = rows.length;
  const g = o.getContext('2d');
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (pal[ch]) { g.fillStyle = pal[ch]; g.fillRect(x, y, 1, 1); } }));
  return o;
}
const FIGHTER = mirror(['.......w', '.......w', '.......w', '......ww', '......ww', '...r..ww', '...r..ww', '...w.www', 'r..wwbww', 'r..wbbww', 'w.wwwwww', 'wwwwwrww', 'www.rrww', 'ww...rw.', 'w.....w.', '........']);
const BEE = [
  mirror(['........', '.bb....y', 'bbbb..yy', 'bbbbb.yr', 'bbbbbbyy', '.bbbb.yr', '..bb..yy', '......yy', '.....b.y', '....b...', '........', '........']),
  mirror(['........', '.......y', '......yy', '.bb...yr', 'bbbb..yy', 'bbbbb.yr', 'bbbbbbyy', '.bbb..yy', '.....b.y', '....b...', '........', '........'])
];
const BFLY = [
  mirror(['........', '.rr....b', 'rrrr..bb', 'rrrrr.ww', 'rwwrrrww', 'rrrrr.ww', 'rrrr..ww', '.rr....w', '.....w..', '....w...', '........', '........']),
  mirror(['........', '.......b', '..rr..bb', '.rrrr.ww', 'rrwwrrww', 'rrrrr.ww', '.rrrr.ww', '..rr...w', '.....w..', '....w...', '........', '........'])
];
const BOSS = [
  mirror(['........', '......gg', '.....ggg', '....gyyg', '....gggg', 'o..ggggg', 'oo.gg.gg', 'ooogg.gg', 'ooooggog', 'oooo.goo', '.ooo..oo', '..o...o.', '........', '........']),
  mirror(['........', '......gg', '.....ggg', '....gyyg', 'o...gggg', 'oo.ggggg', 'ooogg.gg', 'oooogggg', '.ooogg.g', '..oo.goo', '...o..oo', '......o.', '........', '........'])
];
const SPR = {
  fighter: pix(FIGHTER, { w: '#f2f2f2', r: '#e8392b', b: '#3f6bff' }),
  captive: pix(FIGHTER, { w: '#e8392b', r: '#f2f2f2', b: '#ffd23a' }),
  bee: BEE.map(r => pix(r, { b: '#3f6bff', y: '#ffd23a', r: '#e8392b' })),
  bfly: BFLY.map(r => pix(r, { r: '#e8392b', w: '#f2f2f2', b: '#3f6bff' })),
  morph: BFLY.map(r => pix(r, { r: '#2fd6c6', w: '#ffe14a', b: '#ff4fa0' })),
  boss: BOSS.map(r => pix(r, { g: '#36c25a', y: '#ffd23a', o: '#f08a2a' })),
  bossHit: BOSS.map(r => pix(r, { g: '#7b6cff', y: '#ffd23a', o: '#c060ff' }))
};
function drawSpr(img, x, y, rot, sc = 2) {
  c.save(); c.translate(x, y); c.rotate(rot); c.imageSmoothingEnabled = false;
  c.drawImage(img, -img.width * sc / 2, -img.height * sc / 2, img.width * sc, img.height * sc);
  c.restore();
}

// ---------------- 路径（海龟绘图：f 前进 / t 转弯） ----------------
function turtle(start, cmds, mir) {
  let [x, y, hd] = start, a = hd * Math.PI / 180;
  const pts = [[x, y]];
  for (const cm of cmds) {
    if (cm[0] === 'f') {
      const n = Math.ceil(cm[1] / 2);
      for (let i = 0; i < n; i++) { x += Math.cos(a) * cm[1] / n; y += Math.sin(a) * cm[1] / n; pts.push([x, y]); }
    } else {
      const tot = cm[1] * Math.PI / 180, arc = Math.abs(tot) * cm[2], n = Math.ceil(arc / 2);
      for (let i = 0; i < n; i++) { a += tot / n; x += Math.cos(a) * arc / n; y += Math.sin(a) * arc / n; pts.push([x, y]); }
    }
  }
  return mir ? pts.map(([px, py]) => [W - px, py]) : pts;
}
const PATHS = {
  A: [[W / 2 - 24, -16, 90], [['f', 140], ['t', 200, 48], ['f', 40]]],
  B: [[-16, 430, -35], [['f', 110], ['t', -250, 50], ['f', 30]]],
  C: [[-16, 120, 25], [['f', 150], ['t', 160, 55], ['f', 30]]],
  A2: [[W / 2 - 24, -16, 90], [['f', 100], ['t', -120, 60], ['t', 300, 40], ['f', 20]]],
  B2: [[-16, 300, -10], [['f', 140], ['t', -300, 45], ['f', 20]]],
  C2: [[-16, 40, 40], [['f', 180], ['t', 220, 45], ['f', 30]]],
  X1: [[180, -16, 90], [['f', 200], ['t', -270, 60], ['f', 520]]],
  X2: [[-16, 300, -20], [['f', 100], ['t', -200, 70], ['f', 80], ['t', 200, 70], ['f', 520]]],
  X3: [[-16, 80, 10], [['f', 120], ['t', 330, 50], ['f', 520]]],
  X4: [[100, -16, 70], [['f', 120], ['t', -120, 80], ['t', 240, 50], ['f', 520]]],
  X5: [[-16, 450, -60], [['f', 160], ['t', 300, 45], ['f', 520]]]
};
const pathCache = {};
const getPath = (n, m) => pathCache[n + m] || (pathCache[n + m] = turtle(PATHS[n][0], PATHS[n][1], m));

// ---------------- 状态 ----------------
let state = 'menu', prevState = 'play', diff = store.get('diff', 1), hiScore = store.get('best', 20000);
let stage = 1, phase = 'intro', phaseT = 0, waveF = 0, sched = [], schedIdx = 0, diveT = 0, eid = 0;
let enemies = [], pb = [], eb = [], booms = [], pops = [], msg = null, readyT = 0, starSpd = 1;
let score = 0, lives = 3, nextLife = 20000, shots = 0, hits = 0, chHits = 0, chTotal = 0, demo = false, god = false;
const morphGroups = {};
let mgid = 0, breath = 0, swayAmp = 1, breathAmp = 0;
const player = { x: W / 2, alive: false, dual: false, state: 'ok', inv: 0, fireCd: 0, respawnT: 0, gameOver: false, capt: null, spin: 0, cy: PY };
const fx = new KIT.Particles();
const DIVING = new Set(['dive', 'homing', 'escort', 'beamGo', 'beam', 'morph']);
const isChallenge = n => n % 4 === 3;
let challenge = false;

const STAR_COLS = ['#ffffff', '#ff5a5a', '#5aff7a', '#6a8bff', '#ffe45a', '#ff6af0', '#5af0ff'];
const starsL = Array.from({ length: 120 }, () => ({ x: rnd(0, W), y: rnd(0, H), z: ri(0, 2), c: STAR_COLS[ri(0, 6)], ph: rnd(0, 6.28), f: rnd(0.02, 0.09) }));
const nebula = (() => {
  const o = document.createElement('canvas'); o.width = W; o.height = H * 2;
  const g = o.getContext('2d');
  for (const [x, y, r, col] of [[90, 200, 220, 'rgba(90,40,160,.16)'], [360, 520, 260, 'rgba(30,80,170,.14)'], [200, 880, 240, 'rgba(150,40,110,.12)'], [380, 1040, 200, 'rgba(40,120,160,.12)'], [90, 200 + H, 220, 'rgba(90,40,160,.16)']]) {
    const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H * 2);
  }
  return o;
})();
let nebY = 0;

// ---------------- 声音 ----------------
const SFX = {
  shot: () => KIT.tone(1300, 0.07, { type: 'square', vol: 0.035, to: 500 }),
  hit: () => { KIT.noise(0.18, { vol: 0.08, lp: 2400 }); KIT.tone(500, 0.12, { type: 'square', vol: 0.04, to: 120 }); },
  bossHit: () => KIT.tone(700, 0.12, { type: 'square', vol: 0.05, to: 1100 }),
  bossDie: () => { KIT.noise(0.35, { vol: 0.12, lp: 1500 }); KIT.arp([880, 660, 440], 0.05, { type: 'square', vol: 0.04 }); },
  dive: () => KIT.tone(1100, 0.55, { type: 'triangle', vol: 0.025, to: 300 }),
  beam: () => { for (let i = 0; i < 6; i++) KIT.tone(i % 2 ? 380 : 300, 0.28, { type: 'sine', vol: 0.05, to: i % 2 ? 300 : 420, delay: i * 0.27 }); },
  captured: () => KIT.arp([523, 494, 466, 440, 415, 392], 0.13, { type: 'square', vol: 0.05 }),
  rescue: () => KIT.arp([523, 659, 784, 1047, 1319, 1568], 0.07, { type: 'square', vol: 0.05 }),
  die: () => { KIT.noise(0.9, { vol: 0.25, lp: 900 }); KIT.tone(300, 0.8, { type: 'sawtooth', vol: 0.07, to: 40 }); },
  start: () => KIT.arp([523, 587, 659, 784, 659, 784, 1047, 988, 1047], 0.09, { type: 'square', vol: 0.05 }),
  life: () => KIT.arp([784, 988, 1175, 1568], 0.07, { type: 'triangle', vol: 0.08 }),
  morph: () => KIT.arp([1500, 1200, 1500, 1200], 0.04, { type: 'triangle', vol: 0.04 }),
  perfect: () => KIT.arp([523, 659, 784, 1047, 784, 1047, 1319, 1568], 0.08, { type: 'square', vol: 0.06 }),
  tick: () => KIT.tone(1046, 0.04, { type: 'square', vol: 0.03 })
};
const snd = k => { if (!demo) SFX[k](); };

// ---------------- 编队 ----------------
const ROW_Y = [84, 118, 150, 182, 214];
function slotPos(s) {
  const k = 1 + 0.16 * breath * breathAmp, sway = Math.sin(F * 0.018) * 22 * swayAmp;
  return { x: W / 2 + (s.c - 4.5) * 36 * k + sway, y: 64 + (ROW_Y[s.r] - 64) * k };
}
function allSlots() {
  return {
    boss: [3, 4, 5, 6].map(c2 => [0, c2]),
    bfly: [3, 4, 5, 6, 1, 2, 7, 8].map(c2 => [1, c2]).concat([1, 2, 3, 4, 5, 6, 7, 8].map(c2 => [2, c2])),
    bee: [3, 4, 5, 6, 0, 1, 2, 7, 8, 9].map(c2 => [3, c2]).concat([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(c2 => [4, c2]))
  };
}
function buildSched() {
  const out = [];
  if (challenge) {
    const pats = ['X1', 'X2', 'X3', 'X4', 'X5'], tys = [['bee', 'bee'], ['bfly', 'boss'], ['bfly', 'bfly'], ['morph', 'morph'], ['boss', 'bfly']];
    const rot = Math.floor(stage / 4) % 5;
    pats.forEach((p0, gi) => [false, true].forEach((m, si) => {
      const p = pats[(gi + rot) % 5];
      for (let k = 0; k < 4; k++) out.push({ t: 30 + gi * 220 + k * 12, type: tys[gi][si], path: getPath(p, m), slot: null, group: gi });
    }));
  } else {
    const S = allSlots(), P = stage % 2 === 0 ? ['A2', 'B2', 'C2'] : ['A', 'B', 'C'];
    const rep = (t, n) => Array(n).fill(t);
    const groups = [
      [[P[0], false, rep('bfly', 4)], [P[0], true, rep('bee', 4)]],
      [[P[1], false, ['boss', 'bfly', 'boss', 'bfly', 'boss', 'bfly', 'boss', 'bfly']]],
      [[P[1], true, rep('bfly', 8)]],
      [[P[2], false, rep('bee', 8)]],
      [[P[2], true, rep('bee', 8)]]
    ];
    groups.forEach((g, gi) => g.forEach(([p, m, tys]) => tys.forEach((ty, k) => out.push({ t: 30 + gi * 180 + k * 9, type: ty, path: getPath(p, m), slot: S[ty].shift() }))));
  }
  return out.sort((a, b) => a.t - b.t);
}
const enterSpd = () => Math.min(5, 3.1 + stage * 0.05 + diff * 0.15);
function spawn(s) {
  const p0 = s.path[0];
  enemies.push({
    id: ++eid, type: s.type, slot: s.slot ? { r: s.slot[0], c: s.slot[1] } : null, x: p0[0], y: p0[1], ang: Math.PI / 2, mode: 'enter', path: s.path, pi: 0, spd: enterSpd(),
    hp: s.type === 'boss' && !challenge ? 2 : 1, t: 0, group: s.group, flash: 0, escKilled: 0, vx: 0, vy: 0,
    shotsLeft: !challenge && stage >= 2 && Math.random() < 0.18 + stage * 0.03 + diff * 0.06 ? 1 : 0, shootY: rnd(150, 320)
  });
}
function followPath(e) {
  e.pi += e.spd / 2;
  const P = e.path, i = Math.floor(e.pi);
  if (i >= P.length - 1) { const l = P[P.length - 1]; e.x = l[0]; e.y = l[1]; return true; }
  const f = e.pi - i, a = P[i], b = P[i + 1];
  const nx = a[0] + (b[0] - a[0]) * f, ny = a[1] + (b[1] - a[1]) * f;
  if (Math.abs(nx - e.x) + Math.abs(ny - e.y) > 0.01) e.ang = Math.atan2(ny - e.y, nx - e.x);
  e.x = nx; e.y = ny;
  return false;
}
function moveToward(e, tx, ty, spd) {
  const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy);
  if (d <= spd) { e.x = tx; e.y = ty; return true; }
  const a = Math.atan2(dy, dx);
  e.ang += angDiff(e.ang, a) * 0.25;
  e.x += Math.cos(a) * spd; e.y += Math.sin(a) * spd;
  return false;
}

// ---------------- 俯冲 ----------------
function startDive(e, beam) {
  const side = e.x < W / 2 ? -1 : 1;
  e.mode = 'dive'; e.pi = 0; e.spd = 2.6 + Math.min(1.6, stage * 0.06) + diff * 0.2; e.beamDive = !!beam; e.escKilled = 0;
  e.path = turtle([e.x, e.y, -90], [['f', 6], ['t', side * 200, 26]], false);
  const nShots = demo || beam ? 0 : Math.min(4, 1 + Math.floor(stage / 4) + (diff === 2 ? 1 : 0) - (diff === 0 ? 1 : 0));
  e.shotsLeft = Math.max(0, nShots); e.shootY = rnd(150, 260);
  e.morphChecked = false;
  snd('dive');
}
function pickDiver() {
  const pool = enemies.filter(e => e.mode === 'form' && e.type !== 'captive');
  if (!pool.length) return;
  let e = pool[ri(0, pool.length - 1)];
  if (Math.random() < 0.25) { const bs = pool.filter(b => b.type === 'boss'); if (bs.length) e = bs[ri(0, bs.length - 1)]; }
  if (e.type === 'boss') {
    const busy = enemies.some(b => b.type === 'captive' || b.beamDive && (b.mode === 'dive' || b.mode === 'beamGo' || b.mode === 'beam'));
    if (!e.captive && !player.dual && player.alive && !busy && !demo && Math.random() < 0.5) { startDive(e, true); return; }
    startDive(e, false);
    const esc = pool.filter(b => b.type === 'bfly' && b.slot.r === 1 && Math.abs(b.slot.c - e.slot.c) <= 1).slice(0, 2);
    esc.forEach((b, k) => { b.mode = 'escort'; b.leader = e; b.off = esc.length === 1 ? (b.slot.c < e.slot.c ? -26 : 26) : k ? 26 : -26; b.shotsLeft = e.shotsLeft; b.shootY = e.shootY + 30; });
    if (e.captive) e.captive.mode = 'follow';
  } else startDive(e, false);
}
function stepDives() {
  if (challenge || (!player.alive && !demo) || phase !== 'fight' || schedIdx < sched.length) return;
  if (enemies.some(e => e.mode === 'enter')) return;
  const divers = enemies.filter(e => DIVING.has(e.mode)).length, left = enemies.length;
  const maxD = Math.min(2 + Math.floor(stage / 3) + diff, 7) + (left <= 8 ? 3 : 0);
  if (--diveT > 0 || divers >= maxD) return;
  diveT = Math.max(18, 110 - stage * 5 - diff * 20 - (left <= 8 ? 45 : 0)) + ri(0, 40);
  pickDiver();
}
function shoot(e) {
  if (demo || !player.alive) return;
  const tx = player.x + rnd(-30, 30), a = Math.atan2(PY - e.y, tx - e.x), sp = 3.2 + diff * 0.45 + Math.min(1, stage * 0.04);
  eb.push({ x: e.x, y: e.y + 8, vx: Math.cos(a) * sp, vy: Math.max(1.8, Math.sin(a) * sp) });
}
function morph(e) {
  e.dead = true; e.silent = true;
  const id = ++mgid; morphGroups[id] = { left: 3, killed: 0 };
  for (const [ox, oy] of [[-22, 0], [0, -16], [22, 0]]) {
    enemies.push({ id: ++eid, type: 'morph', x: e.x + ox, y: e.y + oy, ang: Math.PI / 2, mode: 'morph', vx: clamp((player.x - e.x) * 0.006, -1.6, 1.6), vy: 3.1, t: 0, hp: 1, mg: id, flash: 10, shotsLeft: 0 });
  }
  fx.burst(e.x, e.y, { n: 16, color: ['#2fd6c6', '#ffe14a', '#ff4fa0'], speed: 140, life: 0.4, size: 3, gravity: 0, shape: 'spark' });
  snd('morph');
}

// ---------------- 敌机逐帧 ----------------
function stepEnemy(e) {
  e.t++;
  if (e.flash > 0) e.flash--;
  switch (e.mode) {
    case 'enter':
      if (followPath(e)) { if (e.slot) e.mode = 'toSlot'; else { e.dead = true; e.silent = true; } }
      if (!e.slot && e.pi > 20 && (e.x < -40 || e.x > W + 40 || e.y < -40 || e.y > H + 40)) { e.dead = true; e.silent = true; }
      break;
    case 'toSlot': { const s = slotPos(e.slot); if (moveToward(e, s.x, s.y, Math.max(2.4, e.spd))) e.mode = 'form'; break; }
    case 'form': { const s = slotPos(e.slot); e.x = s.x; e.y = s.y; e.ang += angDiff(e.ang, Math.PI / 2) * 0.15; break; }
    case 'dive':
      if (followPath(e)) {
        if (e.beamDive) { e.mode = 'beamGo'; e.bx = clamp(player.x, 60, W - 60); }
        else { e.mode = 'homing'; e.vx = (e.x < W / 2 ? -1 : 1) * 0.6; e.vy = 1.6; }
      }
      break;
    case 'homing': {
      const maxVy = 2.5 + Math.min(1.6, stage * 0.06) + diff * 0.3, tx = player.alive ? player.x : W / 2;
      e.vy = Math.min(e.vy + 0.05, maxVy);
      e.vx = clamp(e.vx + clamp((tx - e.x) * 0.004, -0.09, 0.09), -2.6, 2.6);
      e.x += e.vx + (e.type === 'bfly' ? Math.sin(e.t * 0.09) * 1.2 : 0); e.y += e.vy;
      e.ang = Math.atan2(e.vy, e.vx);
      if (e.type === 'bee' && stage >= 4 && !e.morphChecked && e.y > 190 && !demo) { e.morphChecked = true; if (Math.random() < 0.16 + Math.min(0.14, stage * 0.01)) morph(e); }
      if (e.y > H + 24) { e.y = -24; e.x = clamp(e.x, 20, W - 20); e.mode = e.slot ? 'toSlot' : 'gone'; if (!e.slot) { e.dead = true; e.silent = true; } }
      break;
    }
    case 'escort': {
      const L = e.leader;
      if (L && !L.dead && (L.mode === 'dive' || L.mode === 'homing')) {
        e.x += (L.x + e.off - e.x) * 0.25; e.y += (L.y - 20 - e.y) * 0.25; e.ang = L.ang;
      } else { e.mode = 'homing'; e.vx = 0; e.vy = 2; }
      break;
    }
    case 'beamGo': if (moveToward(e, e.bx, 292, 2.6)) { e.mode = 'beam'; e.beamT = 0; e.ang = Math.PI / 2; snd('beam'); } break;
    case 'beam': stepBeam(e); break;
    case 'morph':
      e.x += e.vx; e.y += e.vy; e.vx += Math.sin(e.t * 0.06) * 0.06; e.ang = Math.atan2(e.vy, e.vx);
      if (e.y > H + 30) { e.dead = true; e.silent = true; }
      break;
    case 'follow': {
      const o = e.owner;
      if (!o || o.dead) { e.mode = 'leave'; break; }
      if (o.mode === 'form') { const s = slotPos(o.slot); e.x = s.x; e.y = s.y - 30; e.ang += angDiff(e.ang, Math.PI / 2) * 0.2; }
      else { e.x += (o.x - Math.cos(o.ang) * 30 - e.x) * 0.3; e.y += (o.y - Math.sin(o.ang) * 30 - e.y) * 0.3; e.ang = o.ang; }
      break;
    }
    case 'rescue': {
      e.spin += 0.25;
      const tx = player.alive ? clamp(player.x + 32, 48, W - 16) : W / 2, ty = player.alive ? PY : PY - 120;
      if (moveToward(e, tx, ty, 2.4) && player.alive && player.state === 'ok') {
        e.dead = true; e.silent = true;
        if (!player.dual) { player.dual = true; player.x = clamp(tx - 16, 32, W - 32); }
        snd('rescue'); msg = { text: T('rescued'), col: '#7dffb0', t: 150 };
      }
      break;
    }
    case 'leave': e.y -= 3.2; e.ang = -Math.PI / 2; if (e.y < -40) { e.dead = true; e.silent = true; } break;
  }
  if (e.shotsLeft > 0 && (DIVING.has(e.mode) || e.mode === 'enter') && e.y >= e.shootY && e.y < 420) { shoot(e); e.shotsLeft--; e.shootY = e.y + rnd(40, 90); }
}
function stepBeam(e) {
  if (!e.capturing) e.beamT++;
  const P = player;
  if (!e.capturing && P.alive && P.state === 'ok' && !P.dual && !god && e.beamT > 50 && e.beamT < 230 && Math.abs(P.x - e.x) < 28) {
    e.capturing = true; P.state = 'captured'; P.capt = e; P.spin = 0; P.cy = PY;
    pb = []; snd('captured');
  }
  if (e.beamT >= 280) { e.mode = e.captive ? 'toSlot' : 'homing'; e.vx = 0; e.vy = 1; e.spd = 2.8; }
}

// ---------------- 玩家 ----------------
const keys = new Set();
const K_L = ['ArrowLeft', 'KeyA', 'Pad_l'], K_R = ['ArrowRight', 'KeyD', 'Pad_r'], K_F = ['Space', 'KeyJ', 'KeyZ', 'KeyK', 'Pad_f'];
const touch = { on: false, x: 0, dx: 0, id: null };
const shipXs = () => player.dual ? [player.x - 16, player.x + 16] : [player.x];
function stepPlayer() {
  const P = player;
  if (P.state === 'captured') {
    const b = P.capt;
    P.spin += 0.18; P.cy -= 1.3;
    if (b && !b.dead) P.x += (b.x - P.x) * 0.08;
    if (!b || b.dead || P.cy <= b.y + 34) {
      P.state = 'ok'; P.alive = false; P.capt = null;
      if (b && !b.dead) {
        const cap = { id: ++eid, type: 'captive', x: b.x, y: b.y + 30, ang: Math.PI / 2, mode: 'follow', owner: b, hp: 1, t: 0, flash: 0, shotsLeft: 0 };
        enemies.push(cap); b.captive = cap; b.capturing = false; b.beamT = 230;
        msg = { text: T('captured'), col: '#ff5a5a', t: 170 };
      }
      loseLife(170);
    }
    return;
  }
  if (!P.alive) return;
  if (P.inv > 0) P.inv--;
  if (P.fireCd > 0) P.fireCd--;
  let dir = 0;
  if (K_L.some(k => keys.has(k))) dir -= 1;
  if (K_R.some(k => keys.has(k))) dir += 1;
  const half = P.dual ? 32 : 16;
  P.x = clamp(P.x + dir * 3.4 + touch.dx, half, W - half); touch.dx = 0;
  if ((K_F.some(k => keys.has(k)) || touch.on) && P.fireCd <= 0 && pb.length <= (P.dual ? 2 : 1)) {
    for (const x of shipXs()) pb.push({ x, y: PY - 14 });
    shots += P.dual ? 2 : 1; P.fireCd = 9; snd('shot');
  }
}
function loseLife(t) {
  player.respawnT = t; player.dual = false;
  if (lives > 0) lives--; else player.gameOver = true;
}
function killPlayer(xHit) {
  const P = player;
  if (P.dual) {
    const xs = shipXs(), i = Math.abs(xs[0] - xHit) < Math.abs(xs[1] - xHit) ? 0 : 1;
    boomAt(xs[i], PY, true); P.dual = false; P.x = xs[1 - i]; P.inv = 50; snd('die');
    return;
  }
  P.alive = false; boomAt(P.x, PY, true); snd('die'); KIT.stopMusic();
  loseLife(150);
}
function addScore(v) {
  if (demo) return;
  score += v;
  if (score >= nextLife) { nextLife = nextLife === 20000 ? 70000 : nextLife + 70000; lives++; snd('life'); msg = { text: T('oneUp'), col: '#7dffb0', t: 90 }; }
}

// ---------------- 击中 ----------------
function pointsFor(e) {
  if (challenge) return 100;
  const dive = e.mode !== 'form';
  switch (e.type) {
    case 'bee': return dive ? 100 : 50;
    case 'bfly': return dive ? 160 : 80;
    case 'boss': return !dive ? 150 : e.escKilled >= 2 ? 1600 : e.escKilled === 1 ? 800 : 400;
    case 'morph': return 160;
    case 'captive': return 1000;
  }
  return 0;
}
function boomAt(x, y, big, cols) {
  booms.push({ x, y, t: 0, max: big ? 60 : 26, big, cols: cols || ['#fff', '#ffe14a', '#ff7a2a', '#e8392b'] });
  fx.burst(x, y, { n: big ? 30 : 12, color: cols || ['#fff', '#ffe14a', '#ff7a2a', '#7ad8ff'], speed: big ? 220 : 150, life: big ? 0.9 : 0.45, size: big ? 3 : 2.4, gravity: 0, shape: 'spark' });
}
function hitEnemy(e) {
  hits++;
  if (e.type === 'boss' && e.hp > 1) { e.hp--; e.flash = 8; snd('bossHit'); return; }
  e.dead = true;
  const pts = pointsFor(e);
  addScore(pts);
  const cols = e.type === 'bee' ? ['#ffd23a', '#3f6bff', '#fff'] : e.type === 'bfly' ? ['#e8392b', '#fff', '#3f6bff'] : e.type === 'morph' ? ['#2fd6c6', '#ffe14a', '#ff4fa0'] : ['#36c25a', '#f08a2a', '#fff', '#7b6cff'];
  boomAt(e.x, e.y, false, cols);
  if (pts >= 400 || e.type === 'captive') pops.push({ x: e.x, y: e.y, t: 70, text: String(pts) });
  snd(e.type === 'boss' ? 'bossDie' : 'hit');
  if (e.mode === 'escort' && e.leader && !e.leader.dead) e.leader.escKilled++;
  if (e.type === 'boss' && e.captive && !e.captive.dead) {
    const cap = e.captive;
    if (e.mode !== 'form') { cap.mode = 'rescue'; cap.spin = 0; cap.owner = null; }
    else cap.mode = 'leave';
  }
  if (e.type === 'captive') { msg = { text: T('captiveLost'), col: '#ffb070', t: 120 }; }
  if (e.mg && morphGroups[e.mg]) {
    const g = morphGroups[e.mg]; g.killed++;
    if (g.killed === 3) { const b = 1000 * Math.min(3, 1 + Math.floor(stage / 8)); addScore(b); pops.push({ x: e.x, y: e.y - 14, t: 80, text: String(b) }); }
  }
  if (challenge) chHits++;
}
function stepBullets() {
  for (const b of pb) b.y -= 9;
  pb = pb.filter(b => b.y > -10);
  for (const b of pb) {
    for (const e of enemies) {
      if (e.dead || e.mode === 'rescue' || e.mode === 'leave') continue;
      if (Math.abs(e.x - b.x) < 13 && Math.abs(e.y - b.y) < 14) { b.dead = true; hitEnemy(e); break; }
    }
  }
  pb = pb.filter(b => !b.dead);
  for (const b of eb) { b.x += b.vx; b.y += b.vy; }
  eb = eb.filter(b => b.y < H + 10 && b.x > -10 && b.x < W + 10);
  const P = player;
  if (P.alive && P.state === 'ok' && !P.inv && !god) {
    for (const b of eb) for (const x of shipXs()) if (Math.abs(b.x - x) < 9 && Math.abs(b.y - PY) < 12) { b.dead = true; killPlayer(x); return; }
    for (const e of enemies) {
      if (e.dead || !(DIVING.has(e.mode) || e.mode === 'toSlot' || e.mode === 'enter') || e.mode === 'beam') continue;
      for (const x of shipXs()) if (Math.abs(e.x - x) < 22 && Math.abs(e.y - PY) < 20) { hitEnemy(e); killPlayer(x); return; }
    }
  }
  eb = eb.filter(b => !b.dead);
}

// ---------------- 关卡流程 ----------------
function startStage() {
  challenge = isChallenge(stage);
  sched = buildSched(); schedIdx = 0; waveF = 0; diveT = 120; chHits = 0; chTotal = challenge ? 40 : 0;
  swayAmp = 1; breathAmp = 0;
  phase = 'intro'; phaseT = 0; eb = [];
  if (!player.alive && !player.gameOver && player.state === 'ok') { player.alive = true; player.x = W / 2; player.inv = 0; }
  snd('start');
}
let F = 0;
function stepGame() {
  phaseT++;
  breath = (1 - Math.cos(F * 0.028)) / 2;
  const allIn = schedIdx >= sched.length && !enemies.some(e => e.mode === 'enter' || e.mode === 'toSlot' && e.t < 400);
  swayAmp += ((allIn ? 0 : 1) - swayAmp) * 0.02; breathAmp += ((allIn ? 1 : 0) - breathAmp) * 0.02;
  if (phase === 'intro') {
    if (phaseT > (challenge ? 150 : 110)) { phase = 'fight'; phaseT = 0; if (!demo) KIT.music('star-wing'); }
  } else if (phase === 'fight') {
    waveF++;
    while (schedIdx < sched.length && sched[schedIdx].t <= waveF) spawn(sched[schedIdx++]);
    stepDives();
    if (schedIdx >= sched.length && enemies.length === 0) {
      if (challenge) { phase = 'chResult'; phaseT = 0; KIT.stopMusic(); }
      else { phase = 'clear'; phaseT = 0; }
    }
  } else if (phase === 'clear') {
    if (phaseT > 80) { stage++; startStage(); }
  } else if (phase === 'chResult') {
    if (phaseT === 60) snd('tick');
    if (phaseT === 130) { const perfect = chHits >= chTotal; addScore(perfect ? 10000 : chHits * 100); snd(perfect ? 'perfect' : 'tick'); }
    if (phaseT > 300) { stage++; startStage(); }
  } else if (phase === 'gameover') {
    if (phaseT > 200) showOver();
  }
  stepPlayer();
  for (const e of enemies) if (!e.dead) stepEnemy(e);
  enemies = enemies.filter(e => !e.dead);
  stepBullets();
  enemies = enemies.filter(e => !e.dead);
  // 复活
  const P = player;
  if (!P.alive && P.state === 'ok' && phase !== 'gameover' && phase !== 'over') {
    P.respawnT--;
    if (P.respawnT <= 0) {
      if (P.gameOver) { phase = 'gameover'; phaseT = 0; KIT.stopMusic(); }
      else if (!readyT && (!enemies.some(e => DIVING.has(e.mode)) || P.respawnT < -420)) readyT = 100;
    }
  }
  if (readyT > 0 && --readyT === 0) { P.alive = true; P.x = W / 2; P.inv = 40; if (phase === 'fight') KIT.music('star-wing'); }
}
function stepFx() {
  for (const b of booms) b.t++;
  booms = booms.filter(b => b.t < b.max);
  for (const p of pops) { p.t--; p.y -= 0.3; }
  pops = pops.filter(p => p.t > 0);
  if (msg && --msg.t <= 0) msg = null;
  fx.update(STEP);
  const want = state === 'play' ? (player.alive || player.state === 'captured' ? (phase === 'intro' ? 3 : 1) : 0) : 0.6;
  starSpd += (want - starSpd) * 0.04;
  for (const s of starsL) { s.y += [0.4, 0.9, 1.6][s.z] * starSpd; if (s.y > H) { s.y -= H; s.x = rnd(0, W); } }
  nebY = (nebY + 0.15 * starSpd) % H;
}

// ---------------- 绘制 ----------------
function drawStars() {
  c.fillStyle = '#02030a'; c.fillRect(0, 0, W, H);
  c.drawImage(nebula, 0, nebY - H, W, H * 2);
  for (const s of starsL) {
    if (Math.sin(F * s.f + s.ph) < -0.25) continue;
    c.fillStyle = s.c; const sz = s.z === 2 ? 2 : 1.4;
    c.fillRect(s.x, s.y, sz, sz * (1 + starSpd * 0.6 * s.z));
  }
}
function enemyImg(e) {
  const fl = (e.mode === 'form' ? F >> 5 : F >> 3) & 1;
  if (e.type === 'boss') return (e.hp > 1 || challenge ? SPR.boss : SPR.bossHit)[fl];
  if (e.type === 'captive') return e.mode === 'rescue' && (F >> 2) & 1 ? SPR.fighter : SPR.captive;
  return SPR[e.type][fl];
}
function drawBeam(e) {
  const t = e.beamT, ext = t < 50 ? t / 50 : t < 230 || e.capturing ? 1 : Math.max(0, 1 - (t - 230) / 50);
  if (ext <= 0) return;
  const top = e.y + 16, len = 210 * ext, COLS = ['rgba(90,200,255,.55)', 'rgba(110,120,255,.5)', 'rgba(200,110,255,.45)', 'rgba(90,220,255,.3)'];
  c.save(); c.globalCompositeOperation = 'lighter';
  for (let y = 0; y < len; y += 5) {
    const k = y / 210, hw = 8 + k * 30 + Math.sin(y * 0.15 + F * 0.3) * 2;
    c.fillStyle = COLS[((Math.floor((y - F * 2) / 10) % 4) + 4) % 4];
    c.fillRect(e.x - hw, top + y, hw * 2, 4);
  }
  const gr = c.createRadialGradient(e.x, top + len, 0, e.x, top + len, 50);
  gr.addColorStop(0, 'rgba(120,200,255,.35)'); gr.addColorStop(1, 'rgba(120,200,255,0)');
  c.fillStyle = gr; c.fillRect(e.x - 50, top + len - 50, 100, 100);
  c.restore();
}
function drawBooms() {
  c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
  for (const b of booms) {
    const k = b.t / b.max, n = b.big ? 14 : 8, R = (b.big ? 46 : 22) * KIT.ease.outCubic(k);
    c.globalAlpha = 1 - k;
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU + (i % 2) * 0.2, r0 = R * (i % 2 ? 0.35 : 0.2), r1 = R * (i % 2 ? 0.75 : 1);
      c.strokeStyle = b.cols[i % b.cols.length]; c.lineWidth = b.big ? 3 : 2.2;
      c.beginPath(); c.moveTo(b.x + Math.cos(a) * r0, b.y + Math.sin(a) * r0); c.lineTo(b.x + Math.cos(a) * r1, b.y + Math.sin(a) * r1); c.stroke();
    }
    if (k < 0.3) { c.fillStyle = '#fff'; c.beginPath(); c.arc(b.x, b.y, (b.big ? 14 : 7) * (1 - k / 0.3), 0, TAU); c.fill(); }
  }
  c.restore();
}
function drawBadges() {
  let n = stage, x = W - 14;
  const kinds = [[50, '#ffd23a', 14], [30, '#ff6af0', 13], [20, '#5af0ff', 12], [10, '#3f6bff', 11], [5, '#e8392b', 9], [1, '#e8392b', 7]];
  for (const [v, col, h] of kinds) {
    while (n >= v && x > W / 2) {
      n -= v;
      c.fillStyle = '#ddd'; c.fillRect(x, H - 6 - h * 1.6, 1.5, h * 1.6);
      c.fillStyle = col; c.beginPath(); c.moveTo(x, H - 6 - h * 1.6); c.lineTo(x - h * 0.9, H - 6 - h * 1.3); c.lineTo(x, H - 6 - h); c.closePath(); c.fill();
      if (v >= 10) { c.fillStyle = '#fff'; c.fillRect(x - 3, H - 6 - h * 1.35, 2, 2); }
      x -= v >= 10 ? 14 : 10;
    }
  }
}
function drawHUD() {
  c.textBaseline = 'top'; c.font = 'bold 15px ' + MONO;
  c.textAlign = 'left';
  if ((F >> 5) & 1 || state !== 'play') { c.fillStyle = '#ff3b3b'; c.fillText('1UP', 30, 8); }
  c.fillStyle = '#fff'; c.fillText(String(score).padStart(6, ' '), 22, 26);
  c.textAlign = 'center'; c.fillStyle = '#ff3b3b'; c.fillText('HIGH SCORE', W / 2, 8);
  c.fillStyle = '#fff'; c.fillText(String(Math.max(hiScore, score)), W / 2, 26);
  for (let i = 0; i < Math.min(lives, 8); i++) drawSpr(SPR.fighter, 18 + i * 24, H - 16, 0, 1.3);
  drawBadges();
}
function centerText(t, y, col, size, font) {
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = 'bold ' + (size || 18) + 'px ' + (font || MONO);
  c.fillStyle = col; c.fillText(t, W / 2, y);
}
function render() {
  drawStars();
  for (const e of enemies) if (e.mode === 'beam') drawBeam(e);
  for (const e of enemies) {
    if (e.flash && (e.flash >> 1) & 1) continue;
    const img = enemyImg(e);
    const rot = e.type === 'captive' ? e.ang + Math.PI / 2 + (e.mode === 'rescue' ? e.spin : 0) : e.ang - Math.PI / 2;
    drawSpr(img, e.x, e.y, rot);
  }
  const P = player;
  if (P.state === 'captured') drawSpr((F >> 3) & 1 ? SPR.captive : SPR.fighter, P.x, P.cy, P.spin);
  else if (P.alive && !(P.inv && (F >> 2) & 1)) for (const x of shipXs()) drawSpr(SPR.fighter, x, PY, 0);
  for (const b of pb) { c.fillStyle = '#e8392b'; c.fillRect(b.x - 1, b.y + 2, 2, 6); c.fillStyle = '#f2f2f2'; c.fillRect(b.x - 1.2, b.y - 5, 2.4, 8); c.fillStyle = '#3f6bff'; c.fillRect(b.x - 1.2, b.y - 6, 2.4, 2); }
  for (const b of eb) {
    c.fillStyle = 'rgba(255,90,60,.35)'; c.beginPath(); c.arc(b.x, b.y, 5, 0, TAU); c.fill();
    c.fillStyle = '#ffe14a'; c.fillRect(b.x - 1.5, b.y - 4, 3, 8); c.fillStyle = '#fff'; c.fillRect(b.x - 0.8, b.y - 3, 1.6, 4);
  }
  drawBooms();
  fx.draw(c);
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = 'bold 13px ' + MONO;
  for (const p of pops) { c.globalAlpha = Math.min(1, p.t / 20); c.fillStyle = '#5af0ff'; c.fillText(p.text, p.x, p.y); }
  c.globalAlpha = 1;
  if (state === 'menu') return;
  drawHUD();
  if (phase === 'intro') {
    if (challenge) { centerText('CHALLENGING STAGE', H / 2 - 20, '#5af0ff', 22); centerText(T('chHint'), H / 2 + 14, '#c8d0ff', 15, DISP); }
    else { centerText('STAGE ' + stage, H / 2 - 10, '#5af0ff', 24); if (phaseT < 80 && stage === 1) centerText(T('ready'), H / 2 + 24, '#ff3b3b', 16); }
  }
  if (readyT > 0) centerText('READY', H / 2 + 40, '#ff3b3b', 20);
  if (phase === 'chResult') {
    if (phaseT > 30) { centerText('NUMBER OF HITS', H / 2 - 40, '#5af0ff', 18); centerText(String(chHits), H / 2 - 12, '#fff', 22); }
    if (phaseT > 130) {
      if (chHits >= chTotal) { centerText('PERFECT !', H / 2 + 24, (F >> 3) & 1 ? '#ffe14a' : '#ff6af0', 24); centerText('SPECIAL BONUS 10000 PTS', H / 2 + 56, '#ffe14a', 16); }
      else { centerText('BONUS', H / 2 + 24, '#ffe14a', 18); centerText(String(chHits * 100), H / 2 + 52, '#fff', 20); }
    }
  }
  if (phase === 'gameover') centerText('GAME OVER', H / 2, '#ff3b3b', 30);
  if (msg) { c.globalAlpha = Math.min(1, msg.t / 20); centerText(msg.text, H / 2 + 80, msg.col, 18, DISP); c.globalAlpha = 1; }
}

// ---------------- 主循环 ----------------
let acc = 0, last = performance.now();
function tick() {
  F++;
  if (state === 'play' || state === 'menu') { stepGame(); }
  if (state !== 'pause') stepFx();
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
const GAME_KEYS = new Set(['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);
document.addEventListener('keydown', e => {
  if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
  if (GAME_KEYS.has(e.code) && state === 'play') e.preventDefault();
  if (e.repeat) return;
  if (e.code === 'KeyP' || e.code === 'Escape') { togglePause(); return; }
  if (state === 'menu' && (e.code === 'Enter' || e.code === 'Space')) { e.preventDefault(); $('btn-start').click(); return; }
  keys.add(e.code);
});
document.addEventListener('keyup', e => keys.delete(e.code));
window.addEventListener('blur', () => { keys.clear(); if (state === 'play') togglePause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') togglePause(); });
let padPause = false, padFire = false;
function pollPads() {
  let gps = [];
  try { gps = navigator.getGamepads ? navigator.getGamepads() : []; } catch (e) { return; }
  let l = false, r = false, f = false, p = false;
  for (const g of gps) {
    if (!g) continue;
    const b = k => !!(g.buttons[k] && g.buttons[k].pressed);
    l = l || b(14) || g.axes[0] < -0.4; r = r || b(15) || g.axes[0] > 0.4; f = f || b(0) || b(1) || b(2) || b(3); p = p || b(9);
  }
  const set = (k, v) => v ? keys.add(k) : keys.delete(k);
  set('Pad_l', l); set('Pad_r', r); set('Pad_f', f);
  if (f && !padFire && state === 'menu') $('btn-start').click();
  if (p && !padPause) togglePause();
  padFire = f; padPause = p;
}
cv.addEventListener('pointerdown', e => {
  if (state !== 'play') return;
  touch.on = true; touch.id = e.pointerId; touch.x = e.clientX;
  try { cv.setPointerCapture(e.pointerId); } catch (_) {}
});
cv.addEventListener('pointermove', e => {
  if (!touch.on || e.pointerId !== touch.id) return;
  const r = cv.getBoundingClientRect();
  touch.dx += (e.clientX - touch.x) * W / r.width * 1.3; touch.x = e.clientX;
});
const endTouch = e => { if (e.pointerId === touch.id) { touch.on = false; touch.dx = 0; } };
cv.addEventListener('pointerup', endTouch); cv.addEventListener('pointercancel', endTouch);
$('t-pause').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); togglePause(); });

// ---------------- 屏幕 ----------------
function togglePause() {
  if (state === 'play') { prevState = state; state = 'pause'; $('screen-pause').classList.remove('hidden'); KIT.stopMusic(); }
  else if (state === 'pause') { state = prevState; $('screen-pause').classList.add('hidden'); if (phase === 'fight' && player.alive) KIT.music('star-wing'); last = performance.now(); }
}
function hideScreens() { ['screen-menu', 'screen-pause', 'screen-over'].forEach(id => $(id).classList.add('hidden')); }
function resetWorld() { enemies = []; pb = []; eb = []; booms = []; pops = []; fx.clear(); msg = null; readyT = 0; }
function newGame() {
  demo = false; state = 'play'; hideScreens(); KIT.audio();
  resetWorld();
  score = 0; lives = [4, 3, 2][diff]; nextLife = 20000; shots = 0; hits = 0; stage = 1;
  Object.assign(player, { x: W / 2, alive: true, dual: false, state: 'ok', inv: 0, fireCd: 0, respawnT: 0, gameOver: false, capt: null });
  startStage();
}
function showOver() {
  state = 'over'; phase = 'over'; KIT.stopMusic();
  const rec = score > store.get('best', 20000);
  if (rec) { hiScore = score; store.set('best', score); }
  $('over-record').classList.toggle('hidden', !rec);
  const ratio = shots ? (hits / shots * 100).toFixed(1) : '0.0';
  const rows = [[T('stScore'), score.toLocaleString()], [T('stStage'), stage], [T('stShots'), shots], [T('stHits'), hits], [T('stRatio'), ratio + ' %'], [T('stBest'), Math.max(hiScore, score).toLocaleString()]];
  $('over-stats').innerHTML = rows.map(([a, b]) => `<span>${a}</span><b>${b}</b>`).join('');
  $('screen-over').classList.remove('hidden');
}
function startDemo() {
  demo = true; resetWorld(); stage = 2; challenge = false;
  Object.assign(player, { alive: false, dual: false, state: 'ok', gameOver: false, respawnT: 1e9 });
  const S = allSlots();
  for (const ty of ['boss', 'bfly', 'bee']) for (const s of S[ty]) {
    const sl = { r: s[0], c: s[1] }, p = slotPos(sl);
    enemies.push({ id: ++eid, type: ty, slot: sl, x: p.x, y: p.y, ang: Math.PI / 2, mode: 'form', hp: ty === 'boss' ? 2 : 1, t: 0, flash: 0, escKilled: 0, shotsLeft: 0 });
  }
  sched = []; schedIdx = 0; phase = 'fight'; diveT = 60; swayAmp = 0; breathAmp = 1;
}
function toMenu() {
  if (state === 'pause' || state === 'play') { if (score > hiScore) { hiScore = score; store.set('best', score); } }
  hideScreens(); state = 'menu'; KIT.stopMusic(); startDemo(); renderMenu(); $('screen-menu').classList.remove('hidden');
}
function renderMenu() {
  document.querySelectorAll('#diff-seg button').forEach(b => b.classList.toggle('on', +b.dataset.d === diff));
  $('menu-best').textContent = T('bestLbl', hiScore.toLocaleString());
}
document.querySelectorAll('#diff-seg button').forEach(b => b.onclick = () => { diff = +b.dataset.d; store.set('diff', diff); renderMenu(); });
$('btn-start').onclick = newGame;
$('btn-resume').onclick = () => togglePause();
$('btn-quit').onclick = toMenu;
$('btn-retry').onclick = newGame;
$('btn-menu').onclick = toMenu;

if (location.hash === '#debug') window.__gl = {
  info: () => ({ state, phase, stage, challenge, enemies: enemies.length, modes: enemies.reduce((m, e) => (m[e.mode] = (m[e.mode] || 0) + 1, m), {}), score, lives, dual: player.dual, alive: player.alive, pstate: player.state, shots, hits }),
  stage: n => { newGame(); stage = n; resetWorld(); startStage(); },
  god: v => { god = v !== false; },
  killAll: () => { for (const e of enemies) e.dead = true; schedIdx = sched.length; },
  beam: () => { const b = enemies.find(e => e.type === 'boss' && e.mode === 'form'); if (b) startDive(b, true); return !!b; },
  rescue: () => { const b = enemies.find(e => e.captive); if (b) { b.mode = 'homing'; b.vx = 0; b.vy = 1; hitEnemy(b); if (!b.dead) hitEnemy(b); } return !!b; },
  dive: () => pickDiver(),
  lives: n => { lives = n; }
};
const syncMute = KIT.mountMute($('btn-mute'));
KIT.boot(() => { syncMute(); renderMenu(); });
toMenu();
requestAnimationFrame(loopFrame);
})();
