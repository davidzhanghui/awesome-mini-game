(() => {
const STR = window.GAME_STR || { zh: {}, en: {} };
const T = (k, ...a) => AMG.tf(STR, k, ...a);
const worldSub = wi => ((T('worldSubs') || [])[wi]);
const levelSub = idx => (((T('worldLevels') || [])[Math.floor(idx / 4)] || [])[idx % 4]);
const TILE = 32, VW = 640, VH = 480, GY = 13;
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const $ = id => document.getElementById(id);
const screens = { menu: $('screen-menu'), pause: $('screen-pause'), clear: $('screen-clear'), over: $('screen-over'), win: $('screen-win') };

function fitCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = VW * dpr; canvas.height = VH * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
fitCanvas();
window.addEventListener('resize', fitCanvas);

const store = {
  get best() { return +(localStorage.getItem('mario-best') || 0); },
  set best(v) { localStorage.setItem('mario-best', v); },
  get unlocked() { return +(localStorage.getItem('mario-unlocked') || 1); },
  set unlocked(v) { localStorage.setItem('mario-unlocked', v); },
  get muted() { return localStorage.getItem('mario-muted') === '1'; },
  set muted(v) { localStorage.setItem('mario-muted', v ? '1' : '0'); },
  get night() { return localStorage.getItem('mario-night') === '1'; },
  set night(v) { localStorage.setItem('mario-night', v ? '1' : '0'); }
};

let actx = null, muted = store.muted;
const musicOn = true; // BGM 与其他游戏一致：由声音键统管，不再独立开关
function ac() {
  if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
  if (actx.state === 'suspended') actx.resume();
  return actx;
}
function tone(f, dur, type, vol, slide) {
  if (muted) return;
  try {
    const a = ac(), o = a.createOscillator(), g = a.createGain();
    o.type = type || 'square'; o.frequency.setValueAtTime(f, a.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), a.currentTime + dur);
    g.gain.setValueAtTime(vol || .12, a.currentTime);
    g.gain.exponentialRampToValueAtTime(.001, a.currentTime + dur);
    o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + dur);
  } catch (e) {}
}
function noise(dur, vol) {
  if (muted) return;
  try {
    const a = ac(), n = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = a.createBufferSource(), g = a.createGain();
    s.buffer = buf; g.gain.value = vol || .2;
    s.connect(g); g.connect(a.destination); s.start();
  } catch (e) {}
}
const sfx = {
  jump: s => tone(s ? 300 : 220, .22, 'square', .1, 480),
  coin: () => { tone(988, .08, 'square', .09); setTimeout(() => tone(1319, .28, 'square', .09), 70); },
  stomp: () => noise(.16, .25),
  bump: () => tone(120, .12, 'square', .14, -40),
  brk: () => noise(.3, .3),
  sprout: () => tone(200, .5, 'sine', .12, 600),
  power: () => { const n = [523, 659, 784, 1047]; n.forEach((f, i) => setTimeout(() => tone(f, .14, 'square', .1), i * 90)); },
  shrink: () => { const n = [1047, 784, 659, 523]; n.forEach((f, i) => setTimeout(() => tone(f, .12, 'square', .1), i * 80)); },
  fire: () => tone(880, .12, 'sawtooth', .08, -400),
  kick: () => tone(500, .18, 'square', .13, 500),
  oneup: () => { const n = [659, 784, 1319]; n.forEach((f, i) => setTimeout(() => tone(f, .16, 'sine', .12), i * 100)); },
  flag: () => { const n = [523, 659, 784, 1047, 784, 1047]; n.forEach((f, i) => setTimeout(() => tone(f, .15, 'square', .1), i * 110)); },
  die: () => { tone(500, .25, 'square', .12, 100); setTimeout(() => tone(400, .6, 'square', .12, -350), 220); },
  clear: () => { const n = [523, 523, 523, 659, 784, 1047]; n.forEach((f, i) => setTimeout(() => tone(f, .16, 'square', .11), i * 120)); }
};

const midi = m => 440 * Math.pow(2, (m - 69) / 12);
const Music = {
  timer: null, step: 0, next: 0,
  lead: [72,0,76,0,79,0,76,0,81,0,79,76,74,76,72,0,72,0,76,0,79,0,81,79,76,0,74,0,72,0,67,0],
  bass: [36,0,36,0,43,0,43,0,41,0,41,0,43,0,43,0],
  start(trans) {
    this.stop();
    if (!musicOn) return;
    this.step = 0;
    try { this.next = ac().currentTime + .1; } catch (e) { return; }
    this.trans = trans || 0;
    this.timer = setInterval(() => this.tick(), 110);
  },
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; },
  tick() {
    if (muted || !musicOn) return;
    try {
      const a = ac();
      while (this.next < a.currentTime + .35) {
        const l = this.lead[this.step % this.lead.length];
        const b = this.bass[this.step % this.bass.length];
        if (l) this.note(midi(l + this.trans), this.next, .13, 'square', .045);
        if (b) this.note(midi(b + this.trans), this.next, .13, 'triangle', .09);
        this.next += .145;
        this.step++;
      }
    } catch (e) {}
  },
  note(f, t, dur, type, vol) {
    const a = ac(), o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(.001, t + dur);
    o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dur);
  }
};

const keys = { left: false, right: false, jump: false, run: false };
function setKey(code, down) {
  if (code === 'ArrowLeft' || code === 'KeyA') keys.left = down;
  else if (code === 'ArrowRight' || code === 'KeyD') keys.right = down;
  else if (code === 'KeyZ' || code === 'Space' || code === 'ArrowUp' || code === 'KeyW') keys.jump = down;
  else if (code === 'KeyX' || code === 'ShiftLeft' || code === 'ShiftRight') keys.run = down;
}
window.addEventListener('keydown', e => {
  if (['ArrowLeft','ArrowRight','ArrowUp','Space'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  setKey(e.code, true);
  if (e.code === 'KeyZ' || e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') G.jbuf = .13;
  if (e.code === 'KeyX' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') tryFire();
  if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
  if (e.code === 'KeyM') toggleMute();
  if (e.code === 'KeyR' || e.code === 'Enter') {
    if (G.state === 'over') retryAll();
    else if (G.state === 'menu') startLevel(G.selected);
  }
});
window.addEventListener('keyup', e => setKey(e.code, false));
window.addEventListener('blur', () => { if (G.state === 'play') togglePause(true); });
function bindTouch(id, prop) {
  const el = $(id);
  const on = e => { e.preventDefault(); keys[prop] = true; if (prop === 'jump') G.jbuf = .13; if (prop === 'run') tryFire(); };
  const off = e => { e.preventDefault(); keys[prop] = false; };
  el.addEventListener('pointerdown', on);
  el.addEventListener('pointerup', off);
  el.addEventListener('pointercancel', off);
  el.addEventListener('pointerleave', off);
}
bindTouch('t-left', 'left'); bindTouch('t-right', 'right');
bindTouch('t-a', 'jump'); bindTouch('t-b', 'run');

const WORLDS = [
  { sub: 0, sky: ['#5c94fc', '#a5d8ff', '#d8f4ff'], hill: '#5db53c', trans: 0, levels: [0, 1, 2, 3] },
  { sub: 1, sky: ['#e8963e', '#f7c873', '#ffedbe'], hill: '#c98a2e', trans: -2, levels: [0, 1, 2, 3] },
  { sub: 2, sky: ['#3b2d6e', '#e2583e', '#ffc46b'], hill: '#7a9e3c', trans: -2, levels: [0, 1, 2, 3] },
  { sub: 3, sky: ['#050718', '#141b4d', '#2c3a7a'], hill: '#1e4d2e', trans: 3, dark: true, levels: [0, 1, 2, 3] },
  { sub: 4, sky: ['#5e9fd8', '#bfe4ff', '#ffffff'], hill: '#dff0ff', trans: 5, levels: [0, 1, 2, 3] },
  { sub: 5, sky: ['#2b0a0a', '#a83226', '#ff7b3d'], hill: '#5a2a1a', trans: -5, dark: true, levels: [0, 1, 2, 3] },
  { sub: 6, sky: ['#3fb6ff', '#a5e8ff', '#ffffff'], hill: '#8fd694', trans: 7, levels: [0, 1, 2, 3] },
  { sub: 7, sky: ['#0d0618', '#3b1a5e', '#7a2e5e'], hill: '#3a2a4e', trans: -7, dark: true, levels: [0, 1, 2, 3] }
];
const WORLD_NAMES = WORLDS.map(w => w.sub);
const THEMES = [];
WORLDS.forEach((w, wi) => {
  w.levels.forEach((s, li) => {
    THEMES.push({ name: (wi + 1) + '-' + (li + 1), sub: wi * 4 + li, world: wi, sky: w.sky, hill: w.hill, trans: w.trans, dark: !!(w.dark || li === 3), castle: li === 3 });
  });
});

function L() { return { w: 0, tiles: new Map(), pipes: [], spawns: [], coins: [], flag: 0, castle: 0, time: 300 }; }
function put(lv, x, y, t) {
  if (x < 0 || y < 0) return;
  if (!lv.tiles.has(x + ',' + y)) lv.tiles.set(x + ',' + y, { t: t });
}
function ground(lv, x0, x1) {
  for (let x = x0; x <= x1; x++) { put(lv, x, GY, 'ground'); put(lv, x, GY + 1, 'ground'); }
}
function inGap(x, gaps) { return gaps.some(g => x >= g[0] && x <= g[1]); }
function baseGround(lv, w, gaps) {
  for (let x = 0; x < w; x++) if (!inGap(x, gaps)) ground(lv, x, x);
}
function stair(lv, x, dir, h) {
  for (let i = 0; i < h; i++)
    for (let y = GY - 1; y > GY - 1 - (i + 1); y--)
      put(lv, x + dir * i, y, 'solid');
}
function coinArc(lv, x0, x1, y) {
  for (let x = x0; x <= x1; x++) lv.coins.push({ x: x * TILE + 8, y: y * TILE, got: false });
}
function coinLine(lv, x0, x1, y) {
  for (let x = x0; x <= x1; x++) lv.coins.push({ x: x * TILE + 8, y: y * TILE, got: false });
}

function buildLevel(idx) {
  const lv = L();
  if (idx === 0) {
    lv.w = 212;
    const gaps = [[30, 31], [72, 73], [120, 121], [160, 161]];
    baseGround(lv, lv.w, gaps);
    put(lv, 16, 9, 'qcoin');
    put(lv, 20, 9, 'brick'); put(lv, 21, 9, 'qmush'); put(lv, 22, 9, 'brick');
    put(lv, 23, 9, 'qcoin'); put(lv, 24, 9, 'brick');
    put(lv, 22, 5, 'qcoin');
    put(lv, 48, 9, 'brick'); put(lv, 49, 9, 'qstar'); put(lv, 50, 9, 'brick');
    put(lv, 80, 9, 'brick'); put(lv, 81, 9, 'brick'); put(lv, 82, 9, 'brick');
    put(lv, 132, 9, 'brick'); put(lv, 133, 9, 'qcoin'); put(lv, 134, 9, 'q1up'); put(lv, 135, 9, 'brick');
    put(lv, 70, 9, 'solid'); put(lv, 71, 9, 'solid');
    lv.pipes = [{ x: 28, h: 2 }, { x: 38, h: 3 }, { x: 52, h: 3, plant: true }, { x: 66, h: 2 }, { x: 92, h: 3, plant: true }, { x: 108, h: 2 }, { x: 140, h: 3, plant: true }];
    coinArc(lv, 30, 32, 8); coinArc(lv, 72, 74, 8); coinArc(lv, 120, 122, 8); coinArc(lv, 160, 162, 8);
    coinLine(lv, 56, 59, 7); coinLine(lv, 96, 99, 7);
    stair(lv, 168, 1, 4); stair(lv, 181, -1, 4);
    lv.spawns = [
      { t: 'goomba', x: 26 }, { t: 'goomba', x: 41 }, { t: 'goomba', x: 43 },
      { t: 'koopa', x: 56 }, { t: 'goomba', x: 62 }, { t: 'goomba', x: 64 },
      { t: 'goomba', x: 84 }, { t: 'goomba', x: 86 }, { t: 'goomba', x: 100 },
      { t: 'koopa', x: 105 }, { t: 'goomba', x: 118 }, { t: 'goomba', x: 130 },
      { t: 'koopa', x: 146 }, { t: 'goomba', x: 150 }, { t: 'goomba', x: 152 }
    ];
    lv.flag = 196; lv.castle = 199; lv.time = 300;
  } else if (idx === 1) {
    lv.w = 228;
    const gaps = [[24, 25], [48, 50], [88, 89], [130, 132], [170, 171]];
    baseGround(lv, lv.w, gaps);
    put(lv, 14, 9, 'qcoin');
    put(lv, 18, 9, 'brick'); put(lv, 19, 9, 'qmush'); put(lv, 20, 9, 'brick');
    put(lv, 30, 9, 'brick'); put(lv, 31, 9, 'qcoin'); put(lv, 32, 9, 'brick');
    put(lv, 31, 5, 'qcoin');
    put(lv, 63, 9, 'brick'); put(lv, 64, 9, 'qstar'); put(lv, 65, 9, 'brick');
    put(lv, 119, 9, 'brick'); put(lv, 120, 9, 'q1up'); put(lv, 121, 9, 'brick');
    put(lv, 68, 9, 'solid'); put(lv, 69, 9, 'solid'); put(lv, 70, 9, 'solid');
    put(lv, 104, 8, 'solid'); put(lv, 105, 8, 'solid');
    stair(lv, 80, 1, 4); stair(lv, 87, -1, 4);
    stair(lv, 196, 1, 4); stair(lv, 204, -1, 4);
    lv.pipes = [{ x: 34, h: 3, plant: true }, { x: 44, h: 2 }, { x: 58, h: 3, plant: true }, { x: 76, h: 2 }, { x: 96, h: 3, plant: true }, { x: 112, h: 3 }, { x: 138, h: 4, plant: true }, { x: 150, h: 2 }, { x: 162, h: 3, plant: true }];
    coinArc(lv, 24, 26, 8); coinArc(lv, 48, 51, 7); coinArc(lv, 88, 90, 8);
    coinArc(lv, 130, 133, 7); coinArc(lv, 170, 172, 8);
    coinLine(lv, 54, 57, 7); coinLine(lv, 146, 149, 7);
    lv.spawns = [
      { t: 'goomba', x: 22 }, { t: 'goomba', x: 36 }, { t: 'goomba', x: 37 },
      { t: 'koopa', x: 42 }, { t: 'goomba', x: 60 }, { t: 'goomba', x: 61 },
      { t: 'koopa', x: 72 }, { t: 'goomba', x: 74 }, { t: 'goomba', x: 98 },
      { t: 'goomba', x: 100 }, { t: 'koopa', x: 108 }, { t: 'goomba', x: 114 },
      { t: 'goomba', x: 134 }, { t: 'goomba', x: 136 }, { t: 'koopa', x: 142 },
      { t: 'goomba', x: 156 }, { t: 'goomba', x: 158 }, { t: 'koopa', x: 160 }, { t: 'goomba', x: 166 }
    ];
    lv.flag = 214; lv.castle = 217; lv.time = 300;
  } else if (idx === 2) {
    lv.w = 242;
    const gaps = [[20, 21], [40, 42], [66, 67], [95, 97], [125, 126], [155, 158], [185, 186]];
    baseGround(lv, lv.w, gaps);
    put(lv, 12, 9, 'qcoin');
    put(lv, 16, 9, 'brick'); put(lv, 17, 9, 'qmush'); put(lv, 18, 9, 'brick');
    put(lv, 17, 5, 'qcoin');
    put(lv, 28, 9, 'brick'); put(lv, 29, 9, 'qcoin'); put(lv, 30, 9, 'brick');
    put(lv, 50, 9, 'qcoin');
    put(lv, 71, 9, 'brick'); put(lv, 72, 9, 'qstar'); put(lv, 73, 9, 'brick');
    put(lv, 109, 9, 'brick'); put(lv, 110, 9, 'q1up'); put(lv, 111, 9, 'brick');
    put(lv, 60, 9, 'solid'); put(lv, 61, 9, 'solid'); put(lv, 62, 9, 'solid');
    put(lv, 120, 8, 'solid'); put(lv, 121, 8, 'solid'); put(lv, 122, 8, 'solid');
    put(lv, 148, 8, 'brick'); put(lv, 149, 8, 'qcoin'); put(lv, 150, 8, 'brick');
    stair(lv, 86, 1, 4); stair(lv, 200, 1, 4); stair(lv, 208, -1, 4);
    lv.pipes = [{ x: 32, h: 3, plant: true }, { x: 46, h: 3, plant: true }, { x: 56, h: 2 }, { x: 80, h: 4, plant: true }, { x: 102, h: 3, plant: true }, { x: 116, h: 2 }, { x: 134, h: 4, plant: true }, { x: 144, h: 3, plant: true }, { x: 166, h: 4, plant: true }, { x: 176, h: 2 }, { x: 192, h: 4, plant: true }];
    coinArc(lv, 20, 22, 8); coinArc(lv, 40, 43, 7); coinArc(lv, 66, 68, 8);
    coinArc(lv, 95, 98, 7); coinArc(lv, 125, 127, 8); coinArc(lv, 155, 159, 7); coinArc(lv, 185, 187, 8);
    coinLine(lv, 58, 61, 7); coinLine(lv, 138, 141, 6);
    lv.spawns = [
      { t: 'goomba', x: 26 }, { t: 'goomba', x: 34 }, { t: 'goomba', x: 35 },
      { t: 'koopa', x: 44 }, { t: 'goomba', x: 52 }, { t: 'goomba', x: 53 },
      { t: 'goomba', x: 64 }, { t: 'koopa', x: 76 }, { t: 'goomba', x: 78 },
      { t: 'goomba', x: 79 }, { t: 'goomba', x: 84 }, { t: 'goomba', x: 104 },
      { t: 'goomba', x: 105 }, { t: 'koopa', x: 112 }, { t: 'goomba', x: 118 },
      { t: 'goomba', x: 132 }, { t: 'goomba', x: 136 }, { t: 'koopa', x: 140 },
      { t: 'goomba', x: 148 }, { t: 'koopa', x: 164 }, { t: 'goomba', x: 168 },
      { t: 'goomba', x: 170 }, { t: 'goomba', x: 180 }, { t: 'koopa', x: 190 }, { t: 'goomba', x: 194 }
    ];
    lv.flag = 228; lv.castle = 231; lv.time = 300;
  } else {
    buildProcedural(lv, idx);
  }
  return lv;
}

// ---------- 程序化关卡生成（第 4 关起，种子固定可重复） ----------
function rng(seed) {
  let s = (seed * 9301 + 49297) % 233280;
  if (s <= 0) s += 233279;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}
function buildProcedural(lv, idx) {
  const world = Math.floor(idx / 4), stage = idx % 4;
  const R = rng(idx * 7919 + 13);
  const diff = Math.min(1, idx / 31);
  const isCastle = stage === 3;
  // 长度随进度增长：220 → 300
  lv.w = Math.floor(220 + diff * 80);
  const time = isCastle ? 280 : 300;
  lv.time = time;
  // 地面缺口：数量与宽度随难度增长（跑跳可过：宽 ≤ 4）
  const gaps = [];
  const gapCount = Math.floor(4 + diff * 5 + (isCastle ? 1 : 0));
  let gx = 26;
  for (let i = 0; i < gapCount; i++) {
    gx += Math.floor(14 + R() * 16);
    if (gx > lv.w - 40) break;
    const gw = R() < .25 + diff * .4 ? 3 : 2;
    if (isCastle && gw > 2) { gaps.push([gx, gx + 1]); gx += 2; }
    else { gaps.push([gx, gx + gw - 1]); gx += gw; }
  }
  baseGround(lv, lv.w, gaps);
  // 缺口上方金币弧线（引导跳跃）
  for (const g of gaps) coinArc(lv, g[0] - 1, g[1] + 1, 7);
  // 砖块 / 问号组
  let bx = 14;
  const groups = Math.floor(lv.w / 26);
  for (let i = 0; i < groups; i++) {
    if (bx > lv.w - 50) break;
    const r = R();
    if (r < .3) {
      put(lv, bx, 9, 'qcoin');
    } else if (r < .55) {
      put(lv, bx, 9, 'brick'); put(lv, bx + 1, 9, R() < .5 ? 'qmush' : 'qcoin'); put(lv, bx + 2, 9, 'brick');
      if (R() < .4 + diff * .3) put(lv, bx + 1, 5, 'qcoin');
      bx += 3;
    } else if (r < .7) {
      put(lv, bx, 9, 'brick'); put(lv, bx + 1, 9, R() < .6 ? 'qstar' : 'q1up'); put(lv, bx + 2, 9, 'brick');
      bx += 3;
    } else if (r < .85) {
      const len = 2 + Math.floor(R() * 3);
      for (let k = 0; k < len; k++) put(lv, bx + k, 9, R() < .7 ? 'brick' : 'qcoin');
      bx += len + 1;
    } else {
      put(lv, bx, 9, 'solid'); put(lv, bx + 1, 9, 'solid');
      bx += 2;
    }
    bx += Math.floor(6 + R() * 14);
  }
  // 高台跳跃段
  for (let i = 0; i < 2 + Math.floor(diff * 2); i++) {
    const px = Math.floor(50 + R() * (lv.w - 110));
    if (inGap(px, gaps) || inGap(px + 1, gaps)) continue;
    put(lv, px, 8, 'solid'); put(lv, px + 1, 8, 'solid');
    if (R() < .5) { put(lv, px, 4, 'solid'); put(lv, px + 1, 4, 'solid'); }
  }
  // 楼梯（一上一下成对）
  for (let i = 0; i < 2 + Math.floor(diff * 2); i++) {
    const sx = Math.floor(60 + R() * (lv.w - 120));
    if (sx > lv.w - 60 || inGap(sx, gaps) || inGap(sx + 8, gaps)) continue;
    const h = 3 + Math.floor(R() * 2);
    stair(lv, sx, 1, h); stair(lv, sx + h + 4, -1, h);
  }
  // 水管（高度 ≤ 4，食人花随难度增多）
  const pipeCount = Math.floor(6 + diff * 5);
  let ppx = 30;
  lv.pipes = [];
  for (let i = 0; i < pipeCount; i++) {
    ppx += Math.floor(12 + R() * 14);
    if (ppx > lv.w - 45) break;
    if (inGap(ppx, gaps)) { ppx += 3; continue; }
    const h = isCastle ? 3 + Math.floor(R() * 2) : 2 + Math.floor(R() * 3);
    lv.pipes.push({ x: ppx, h: h, plant: R() < .35 + diff * .35 });
  }
  lv.pipes.sort((a, b) => a.x - b.x);
  // 悬空金币线
  coinLine(lv, 40, 43, 7);
  coinLine(lv, Math.floor(lv.w / 2), Math.floor(lv.w / 2) + 3, 6);
  // 敌人（密度随难度增长，库巴城更多）
  const foeCount = Math.floor(12 + diff * 14 + (isCastle ? 4 : 0));
  lv.spawns = [];
  let fx = 20;
  for (let i = 0; i < foeCount; i++) {
    fx += Math.floor(8 + R() * (13 - diff * 5));
    if (fx > lv.w - 35) break;
    if (inGap(fx, gaps)) { fx += 2; continue; }
    const r = R();
    lv.spawns.push({ t: r < .62 - diff * .15 ? 'goomba' : 'koopa', x: fx });
  }
  lv.spawns.sort((a, b) => a.x - b.x);
  lv.flag = lv.w - 16; lv.castle = lv.w - 13;
}

function spr(rows, pal, x, y, px, flip) {
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    for (let c = 0; c < row.length; c++) {
      const ch = row[flip ? row.length - 1 - c : c];
      if (ch === '.' || ch === ' ') continue;
      ctx.fillStyle = pal[ch] || '#f0f';
      ctx.fillRect(Math.round(x + c * px), Math.round(y + r * px), Math.ceil(px), Math.ceil(px));
    }
  }
}

// ---------- 经典马里奥像素精灵（红帽 R / 肤 S / 头发鞋 B / 背带裤 D / 纽扣 Y） ----------
// 小马里奥 14x14：站 / 跑A / 跑B / 跳
const PAL_M = { R: '#e7402e', S: '#ffcf9e', B: '#6b3a12', D: '#2b5fd9', Y: '#ffd93d', E: '#1c1c1c' };
const MARIO_S_STAND = [
  '....RRRRRR....',
  '...RRRRRRRRRR.',
  '...BBBSBS.E...',
  '..BSBSSSSBEEE.',
  '..BSBBBSSBEEEE',
  '..BBSSSSSEEE..',
  '....SSSSSS....',
  '..RRRRRRRRR...',
  '.RRRRRRRRRRR..',
  '.SSRRDDDRRSS..',
  '.SSRDDRDDRSS..',
  '.SSDDDRDDDSS..',
  '...DDD.DDD....',
  '..BBB...BBB...'
];
const MARIO_S_RUNA = [
  '....RRRRRR....',
  '...RRRRRRRRRR.',
  '...BBBSBS.E...',
  '..BSBSSSSBEEE.',
  '..BSBBBSSBEEEE',
  '..BBSSSSSEEE..',
  '....SSSSSS....',
  '..RRRRRRRRR...',
  '.RRRRRRRRRRR..',
  '.SSRRDDDRRSS..',
  '.SSRDDRDDRSS..',
  '.SSDDDRDDDSS..',
  '..DDD..DDD....',
  '.BBB.....BBB..'
];
const MARIO_S_RUNB = [
  '....RRRRRR....',
  '...RRRRRRRRRR.',
  '...BBBSBS.E...',
  '..BSBSSSSBEEE.',
  '..BSBBBSSBEEEE',
  '..BBSSSSSEEE..',
  '....SSSSSS....',
  '..RRRRRRRRR...',
  '.RRRRRRRRRRR..',
  '.SSRRDDDRRSS..',
  '.SSRDDRDDRSS..',
  '.SSDDDRDDDSS..',
  '...DDDDDD.....',
  '...BB..BB.....'
];
const MARIO_S_JUMP = [
  '....RRRRRR....',
  '...RRRRRRRRRR.',
  '...BBBSBS.E...',
  '..BSBSSSSBEEE.',
  '..BSBBBSSBEEEE',
  '..BBSSSSSEEE..',
  '....SSSSSS....',
  '..RRRRRRRRR...',
  '.RRRRRRRRRRR..',
  '.SSRRDDDRRSS..',
  '..SRDDRDRSS...',
  '.SSDDDRDDSS...',
  '.BBDDD.DDDBB..',
  '.BB.......BB..'
];
// 大马里奥 16x28，setForm 用 h=56 对应 2px/格
const PAL_MB = { R: '#e7402e', S: '#ffcf9e', B: '#5a2c0c', D: '#2b5fd9', Y: '#ffd93d', E: '#1c1c1c' };
const MARIO_B_STAND = [
  '.....RRRRRR.....',
  '....RRRRRRRRRR..',
  '....BBBSBS.E....',
  '...BSBSSSSBEEE..',
  '...BSBBBSSBEEEE.',
  '...BBSSSSSEEE...',
  '.....SSSSSS.....',
  '...RRRRRRRR.....',
  '..RRRRRRRRRRRR..',
  '..RRRRRRRRRRRR..',
  '.SSRRRDDDRRRSS..',
  '.SSRRDDDDRRRSS..',
  '.SSRRDDDDRRRSS..',
  '.SSSDDDDRRRSS...',
  '..SSDDDDDRSS....',
  '..SSDDDDDRSS....',
  '..DDDDDDDDDD....',
  '..DDDDDDDDDD....',
  '..DDDYDDDYDD....',
  '..DDDYDDDYDD....',
  '..DDDDDDDDDD....',
  '..DDDDDDDDDD....',
  '...DDDDDDDD.....',
  '...DDDDDDDD.....',
  '...DDDDDDDD.....',
  '...DDD..DDD.....',
  '...DDD..DDD.....',
  '..BBBB..BBBB....'
];
const MARIO_B_RUNA = [
  '.....RRRRRR.....',
  '....RRRRRRRRRR..',
  '....BBBSBS.E....',
  '...BSBSSSSBEEE..',
  '...BSBBBSSBEEEE.',
  '...BBSSSSSEEE...',
  '.....SSSSSS.....',
  '...RRRRRRRR.....',
  '..RRRRRRRRRRRR..',
  '..RRRRRRRRRRRR..',
  '.SSRRRDDDRRRSS..',
  '.SSRRDDDDRRRSS..',
  '.SSRRDDDDRRRSS..',
  '.SSSDDDDRRRSS...',
  '..SSDDDDDRSS....',
  '..SSDDDDDRSS....',
  '..DDDDDDDDDD....',
  '..DDDDDDDDDD....',
  '..DDDYDDDYDD....',
  '..DDDYDDDYDD....',
  '..DDDDDDDDDD....',
  '...DDDDDDD......',
  '...DDDDDD.......',
  '..DDDDDD........',
  '..DDDD..........',
  '..DDD...........',
  '.BBBB...........',
  '.BBB............'
];
const MARIO_B_RUNB = [
  '.....RRRRRR.....',
  '....RRRRRRRRRR..',
  '....BBBSBS.E....',
  '...BSBSSSSBEEE..',
  '...BSBBBSSBEEEE.',
  '...BBSSSSSEEE...',
  '.....SSSSSS.....',
  '...RRRRRRRR.....',
  '..RRRRRRRRRRRR..',
  '..RRRRRRRRRRRR..',
  '.SSRRRDDDRRRSS..',
  '.SSRRDDDDRRRSS..',
  '.SSRRDDDDRRRSS..',
  '.SSSDDDDRRRSS...',
  '..SSDDDDDRSS....',
  '..SSDDDDDRSS....',
  '..DDDDDDDDDD....',
  '..DDDDDDDDDD....',
  '..DDDYDDDYDD....',
  '..DDDYDDDYDD....',
  '..DDDDDDDDDD....',
  '..DDDDDDDDDD....',
  '...DDDDDDDDDD...',
  '....DDDDDDDDD...',
  '.....DDDDDDD....',
  '......DDDD......',
  '......BBBB......',
  '.....BBBBB......'
];
const MARIO_B_JUMP = [
  '.....RRRRRR.....',
  '....RRRRRRRRRR..',
  '....BBBSBS.E....',
  '...BSBSSSSBEEE..',
  '...BSBBBSSBEEEE.',
  '...BBSSSSSEEE...',
  '.....SSSSSS.....',
  '...RRRRRRRR.....',
  '..RRRRRRRRRRRR..',
  '..RRRDRRRRRRR...',
  '.SSRRDDDRRRSS...',
  '.SSRRDDDDRSS....',
  '.SSRRDDDDRSS....',
  '.SSSDDDDRSS.....',
  '..SSDDDDRSS.....',
  '..SDDDDDRS......',
  '..DDDDDDDDBB....',
  '..DDDDDDDDBBB...',
  '..DDDYDDDDBB....',
  '..DDDYDDDD......',
  '..DDDDDDD.......',
  '..DDDDDD........',
  '...DDDDD........',
  '...DDDD.........',
  '...DDD..........',
  '...DDD..........',
  '...BBB..........',
  '..BBBB..........'
];
const MARIO_B_SKID = [
  '.....RRRRRR.....',
  '....RRRRRRRRRR..',
  '....E.SBSBBB....',
  '..EEEBSSSSBSB...',
  '.EEEEBSSBBBBS...',
  '...EEESSSSBB....',
  '.....SSSSSS.....',
  '.....RRRRRRR....',
  '..RRRRRRRRRRR...',
  '..RRRRRRRRRR....',
  '..SSRRRDDDRRSS..',
  '..SSRRDDDDRRSS..',
  '..SSRRDDDDRRSS..',
  '...SSRRDDDRSS...',
  '....SSDDDRSS....',
  '....DDDDDDSS....',
  '....DDDDDDDD....',
  '....DDDDDDDD....',
  '....DDDYDDDD....',
  '....DDDYDDDD....',
  '....DDDDDDDD....',
  '....DDDDDDDD....',
  '.....DDDDDDD....',
  '.....DDDDDDD....',
  '.....DDDDDDD....',
  '.....DDD.DDD....',
  '....BBB...BBB...',
  '....BBB...BBB...'
];
const PAL_G = { B: '#b06a2c', W: '#fff', K: '#222', E: '#222' };
const GOOMBA = [
  '.....BBBBBB.....',
  '....BBBBBBBB....',
  '...BBBBBBBBBB...',
  '...BWWBBBBWWB...',
  '..BBWKWBBBWBWB..',
  '..BBBBBBBBBBBB..',
  '.BBBBBBBBBBBBBB.',
  '.BBBBBBBBBBBBBB.',
  '..BBBBBBBBBBBB..',
  '...BBBBBBBBBB...',
  '....BBB..BBB....',
  '...BBB....BBB...',
  '...BB......BB...'
];
const PAL_K = { G: '#3fae4a', D: '#2a7a33', W: '#fff', K: '#222', Y: '#ffd93d', E: '#222' };
const KOOPA = [
  '......GGGG......',
  '.....GGGGGG.....',
  '....GGWWGGD.....',
  '....GGWKGGDD....',
  '....GGGGGGDD....',
  '.....GGGGGD.....',
  '....GGGGGGG.....',
  '...GGGGGGGGG....',
  '..GGGGGGGGGGG...',
  '..GYYGGGGGYGD...',
  '..GYYGGGGGYGDD..',
  '...DDDDDDDDDD...',
  '..DDDDDDDDDDDD..',
  '..DD.DD..DD.DD..'
];
const SHELL = [
  '.....DDDDDD.....',
  '...DDDDDDDDDD...',
  '..DDWWDDDDWWDD..',
  '.DDDWKDDDDWKWDD.',
  '.DDDDDDDDDDDDDD.',
  'DDDDDDDDDDDDDDDD'
];
const PAL_P = { R: '#e33e2b', W: '#fff', O: '#ff9c3c', S: '#ffcf9e', G: '#3fae4a', D: '#2a7a33', Y: '#ffd93d', K: '#222' };
const MUSH = [
  '.....RRRRRR.....',
  '...RRRRRRRRRR...',
  '..RRWWRRRWWRRR..',
  '.RRWWWWRRWWWWWRR',
  '.RWWWWWRRWWWWWWR',
  '.RRRRRRRRRRRRRR.',
  '..RWWWWWWWWWWR..',
  '..RWSWWWWWSWSR..',
  '...RSSSSSSSSSR..',
  '...RSSSSSSSSSR..'
];
const MUSH1 = [
  '.....GGGGGG.....',
  '...GGGGGGGGGG...',
  '..GGWWGGGGGWWR..',
  '.GGWWWGGGGWWWWGG',
  '.GWWWWGGGGWWWWWG',
  '.GGGGGGGGGGGGGG.',
  '..GWWWWWWWWWWG..',
  '..GWSWWWWWSWSG..',
  '...GSSSSSSSSSG..',
  '...GSSSSSSSSSG..'
];
const FLOWER = [
  '...OOO..OOO....',
  '..OROOOOROOO...',
  '..OROYWOROYWO..',
  '..OROYWOROYWO..',
  '..OROOOOROOO...',
  '...OOO..OOO....',
  '.....OOOO......',
  '...GG.GG.GG....',
  '...GGGGGGG.....',
  '....GGGGG......',
  '....GGGGG......',
  '.....GGG.......'
];
const STAR = [
  '......YY........',
  '......YYY.......',
  '.....YYYYY......',
  '..YYYYYYYYYYY...',
  '.YYYYYYYYYYYYY..',
  '..YYYYYYYYYYY...',
  '...YYYYYYYYY....',
  '...YYYY.YYYY....',
  '..YYY...YYY.....',
  '..YY.....YY.....'
];

const G = {
  state: 'menu', t: 0, selected: 0, worldPick: -1,
  levelIdx: 0, score: 0, coins: 0, lives: 3, timeLeft: 300,
  camX: 0, lv: null, bumps: new Map(),
  enemies: [], items: [], fballs: [], parts: [], floats: [],
  fireCd: 0, shake: 0, introT: 0, deadT: 0, deadFall: false, flagT: 0,
  scored0: 0, coins0: 0, kills: 0, coinMile: 0,
  player: null
};

function newPlayer(x, y, form) {
  return {
    x: x, y: y, w: 24, h: 28, vx: 0, vy: 0, face: 1,
    form: form || 0, onGround: false, coyote: 0, jumpT: 0,
    invuln: 0, star: 0, animT: 0, skid: false
  };
}
function setForm(p, f) {
  const wasBig = p.form !== 0;
  p.form = f;
  const isBig = f !== 0;
  if (isBig && !wasBig) { p.w = 26; p.h = 56; p.y -= 28; }
  else if (!isBig && wasBig) { p.w = 24; p.h = 28; p.y += 28; }
}

function loadLevel(idx) {
  G.levelIdx = idx;
  G.lv = buildLevel(idx);
  G.camX = 0; G.bumps = new Map();
  G.enemies = []; G.items = []; G.fballs = []; G.parts = []; G.floats = [];
  G.fireCd = 0; G.shake = 0;
  G.timeLeft = G.lv.time;
  G.scored0 = G.score; G.coins0 = G.coins;
  const p = newPlayer(2.5 * TILE, (GY - 2) * TILE, 0);
  G.player = p;
  G.enemies = [];
  spawnInitial();
}
function spawnInitial() {
  for (const s of G.lv.spawns) s.done = false;
}
function tileAt(tx, ty) {
  if (tx < 0) return { t: 'solid' };
  if (ty < 0 || ty > 14) return null;
  return G.lv.tiles.get(tx + ',' + ty) || null;
}
function solidAt(tx, ty) {
  if (tx < 0) return true;
  if (ty < 0) return false;
  if (ty > 14) return false;
  const t = G.lv.tiles.get(tx + ',' + ty);
  if (t && (t.t === 'ground' || t.t === 'brick' || t.t === 'solid' || t.t === 'used' || t.t === 'qcoin' || t.t === 'qmush' || t.t === 'qstar' || t.t === 'q1up')) return true;
  for (const p of G.lv.pipes) {
    const px = p.x * TILE, top = (GY - p.h) * TILE;
    if (tx * TILE + TILE > px && tx * TILE < px + TILE * 2 && ty * TILE + TILE > top && ty * TILE < GY * TILE) return true;
  }
  return false;
}

function addScore(n, x, y) {
  G.score += n;
  if (x !== undefined) G.floats.push({ x: x, y: y, text: '+' + n, age: 0 });
}
function addCoin(x, y) {
  G.coins++;
  addScore(100, x, y);
  sfx.coin();
  G.parts.push({ x: x, y: y, vx: 0, vy: -60, life: .4, age: 0, r: 3, c: '#ffd93d' });
  if (Math.floor(G.coins / 100) > G.coinMile) {
    G.coinMile = Math.floor(G.coins / 100);
    G.lives++; sfx.oneup();
    G.floats.push({ x: G.player.x, y: G.player.y - 20, text: '1UP!', age: 0 });
  }
}

function spawnEnemy(type, tx) {
  const gy = GY * TILE;
  if (type === 'goomba') G.enemies.push({ type: type, x: tx * TILE + 2, y: gy - 24, w: 28, h: 24, vx: -60, vy: 0, onGround: false, dead: 0, animT: Math.random() * 5 });
  else if (type === 'koopa') G.enemies.push({ type: type, x: tx * TILE + 3, y: gy - 30, w: 26, h: 30, vx: -70, vy: 0, onGround: false, dead: 0, animT: 0, shell: false, shellVx: 0, shellT: 0 });
  else if (type === 'plant') {
    const pipe = G.lv.pipes[tx];
    G.enemies.push({ type: type, pipe: pipe, x: pipe.x * TILE + 4, w: 56, h: 56, t: Math.random() * 2, phase: 0, dead: 0 });
  }
}
function tryFire() {
  if (G.state !== 'play') return;
  const p = G.player;
  if (p.form !== 2 || G.fireCd > 0) return;
  if (G.fballs.length >= 2) return;
  G.fireCd = .28;
  G.fballs.push({ x: p.x + (p.face > 0 ? p.w : -10), y: p.y + p.h / 2 - 8, w: 12, h: 12, vx: p.face * 430, vy: -160, life: 3, animT: 0 });
  sfx.fire();
}

function hurt() {
  const p = G.player;
  if (p.invuln > 0 || p.star > 0 || G.state !== 'play') return;
  if (p.form === 2) { setForm(p, 1); p.invuln = 2; sfx.shrink(); }
  else if (p.form === 1) { setForm(p, 0); p.invuln = 2; sfx.shrink(); }
  else die(false);
}
function die(silent) {
  if (G.state !== 'play') return;
  G.state = 'dead'; G.deadT = 0; G.deadFall = silent;
  Music.stop();
  sfx.die();
  if (!silent) G.player.vy = -720;
}
function gameOver() {
  G.state = 'over';
  Music.stop();
  const isNew = G.score > store.best;
  if (isNew) store.best = G.score;
  $('final-score').textContent = G.score;
  $('final-best').textContent = store.best;
  $('new-record').classList.toggle('hidden', !isNew);
  setTimeout(() => showScreen('over'), 400);
}
function retryAll() {
  G.score = 0; G.coins = 0; G.lives = 3; G.coinMile = 0;
  startLevel(G.levelIdx);
}

function showScreen(name) {
  for (const k in screens) screens[k].classList.toggle('hidden', k !== name);
  if (!name) for (const k in screens) screens[k].classList.add('hidden');
  $('btn-pause').classList.toggle('hidden', G.state !== 'play');
}
const WORLD_EMOJI = ['🌱', '🏜', '🌇', '🌙', '❄️', '🌋', '☁️', '👹'];
function worldUnlocked(wi) { return store.unlocked > wi * 4; }
function pickWorld(wi) {
  if (!worldUnlocked(wi)) { tone(160, .15, 'square', .1); return; }
  G.worldPick = wi;
  const first = wi * 4;
  if (G.selected < first || G.selected >= first + 4) {
    G.selected = Math.min(store.unlocked - 1, first);
  }
  sfx.coin();
  refreshMenu();
}
function buildMenu() {
  const box = $('world-select');
  box.innerHTML = '';
  WORLDS.forEach((w, wi) => {
    const b = document.createElement('button');
    b.className = 'world-btn';
    b.dataset.world = wi;
    b.innerHTML = '<span class="w-emo">' + WORLD_EMOJI[wi] + '</span><span class="w-name">' + T('worldTag', wi + 1) + '</span><span class="w-sub">' + worldSub(wi) + '</span>';
    b.title = T('worldTitle', wi + 1, worldSub(wi));
    b.onclick = () => pickWorld(wi);
    box.appendChild(b);
  });
}
function renderStages() {
  const panel = $('stage-panel');
  const sel = $('level-select');
  const label = $('stage-label');
  if (G.worldPick < 0) {
    panel.classList.add('hidden');
    sel.innerHTML = '';
    return;
  }
  panel.classList.remove('hidden');
  const wi = G.worldPick;
  const w = WORLDS[wi];
  label.textContent = T('stageLabel', WORLD_EMOJI[wi], wi + 1, worldSub(wi));
  sel.innerHTML = '';
  const un = store.unlocked;
  for (let li = 0; li < 4; li++) {
    const i = wi * 4 + li;
    const th = THEMES[i];
    const b = document.createElement('button');
    b.className = 'lvl-btn' + (th.castle ? ' castle' : '') + (i >= un ? ' locked' : '') + (i === G.selected ? ' active' : '');
    b.dataset.lvl = i;
    b.innerHTML = th.name + '<small>' + levelSub(i) + '</small>';
    b.title = T('levelTitle', worldSub(th.world), th.name, levelSub(i));
    b.onclick = () => {
      if (i >= un) { tone(160, .15, 'square', .1); return; }
      G.selected = i;
      sfx.coin();
      refreshMenu();
    };
    sel.appendChild(b);
  }
}
function refreshMenu() {
  const un = store.unlocked;
  document.querySelectorAll('.world-btn').forEach(b => {
    const wi = +b.dataset.world;
    const done = un >= (wi + 1) * 4;
    const locked = !worldUnlocked(wi);
    b.classList.toggle('locked', locked);
    b.classList.toggle('done', done);
    b.classList.toggle('active', wi === G.worldPick);
  });
  renderStages();
  $('menu-best').textContent = T('best', Math.max(store.best, G.score));
}
function toMenu() {
  G.state = 'menu';
  Music.stop();
  G.worldPick = Math.floor(G.selected / 4);
  refreshMenu();
  showScreen('menu');
}
function startLevel(idx) {
  G.selected = idx;
  if (G.lives <= 0) { G.lives = 3; }
  loadLevel(idx);
  G.state = 'intro'; G.introT = 0;
  showScreen(null);
  $('btn-pause').classList.add('hidden');
  Music.stop();
  sfx.sprout();
}
function beginPlay() {
  G.state = 'play';
  showScreen(null);
  $('btn-pause').classList.remove('hidden');
  Music.start(THEMES[G.levelIdx].trans);
}
function togglePause(force) {
  if (G.state === 'play') {
    G.state = 'pause'; showScreen('pause'); Music.stop();
  } else if (G.state === 'pause' && !force) {
    G.state = 'play'; showScreen(null);
    $('btn-pause').classList.remove('hidden');
    Music.start(THEMES[G.levelIdx].trans);
  }
}
function levelClear() {
  const gained = G.score - G.scored0;
  const gotCoins = G.coins - G.coins0;
  const bonus = Math.floor(G.timeLeft) * 10;
  G.score += bonus;
  const un = store.unlocked;
  if (G.levelIdx + 1 >= un && un < THEMES.length) store.unlocked = un + 1;
  if (G.score > store.best) store.best = G.score;
  Music.stop(); sfx.clear();
  $('clear-stats').innerHTML = T('clearStats', THEMES[G.levelIdx].name, levelSub(G.levelIdx), gained, bonus, gotCoins, G.lives);
  if (G.levelIdx >= THEMES.length - 1) {
    G.state = 'win';
    $('win-score').textContent = G.score;
    $('win-lives').textContent = '×' + G.lives;
    setTimeout(() => showScreen('win'), 600);
  } else {
    G.state = 'clear';
    $('btn-next').textContent = T('nextBtn', THEMES[G.levelIdx + 1].name);
    setTimeout(() => showScreen('clear'), 600);
  }
}

function headBump(tx, ty) {
  const k = tx + ',' + ty;
  const t = G.lv.tiles.get(k);
  if (!t) return;
  if (t.t === 'qcoin' || t.t === 'qmush' || t.t === 'qstar' || t.t === 'q1up') {
    const kind = t.t;
    t.t = 'used';
    G.bumps.set(k, 0);
    G.lv.coins.push({ x: 0, y: 0, got: true });
    sfx.bump();
    const cx = tx * TILE + 6, cy = ty * TILE - 30;
    if (kind === 'qcoin') {
      addCoin(cx, cy - 10);
      G.floats.push({ x: cx, y: cy - 24, text: '+100', age: 0 });
      for (let i = 0; i < 6; i++) G.parts.push({ x: cx + 10, y: cy, vx: (Math.random() - .5) * 200, vy: -Math.random() * 260, life: .5, age: 0, r: 2.5, c: '#ffd93d' });
    } else if (kind === 'qmush') {
      sfx.sprout();
      G.items.push({ kind: G.player.form === 0 ? 'mush' : 'flower', x: tx * TILE + 3, y: ty * TILE - 26, w: 26, h: 26, vx: 0, vy: 0, emerge: 1, ey: ty * TILE - 26 });
    } else if (kind === 'qstar') {
      sfx.sprout();
      G.items.push({ kind: 'star', x: tx * TILE + 3, y: ty * TILE - 26, w: 26, h: 26, vx: 0, vy: 0, emerge: 1, ey: ty * TILE - 26 });
    } else if (kind === 'q1up') {
      sfx.sprout();
      G.items.push({ kind: 'oneup', x: tx * TILE + 3, y: ty * TILE - 26, w: 26, h: 26, vx: 0, vy: 0, emerge: 1, ey: ty * TILE - 26 });
    }
    killOnTile(tx, ty);
  } else if (t.t === 'brick') {
    if (G.player.form === 0) {
      G.bumps.set(k, 0);
      sfx.bump();
      killOnTile(tx, ty);
    } else {
      G.lv.tiles.delete(k);
      sfx.brk();
      addScore(50, tx * TILE, ty * TILE);
      for (let i = 0; i < 5; i++) G.parts.push({ x: tx * TILE + 16, y: ty * TILE + 16, vx: (Math.random() - .5) * 420, vy: -Math.random() * 520, life: .8, age: 0, r: 4, c: '#c84c0c', grav: 1800 });
    }
  } else if (t.t === 'solid' || t.t === 'used' || t.t === 'ground') {
    G.bumps.set(k, 0);
    sfx.bump();
    killOnTile(tx, ty);
  }
}
function killOnTile(tx, ty) {
  const top = ty * TILE;
  for (const e of G.enemies) {
    if (e.dead || e.type === 'plant') continue;
    if (e.x + e.w > tx * TILE && e.x < tx * TILE + TILE && Math.abs((e.y + e.h) - top) < 12) {
      e.dead = .001; e.vy = -480;
      addScore(200, e.x, e.y - 10);
      sfx.kick();
    }
  }
}

function overlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function moveBody(b, dt, isPlayer) {
  b.x += b.vx * dt;
  collideX(b, isPlayer);
  b.vy = Math.min(b.vy + 2400 * dt, 900);
  b.y += b.vy * dt;
  b.onGround = false;
  collideY(b, isPlayer);
}
function tilesIn(box) {
  const out = [];
  const x0 = Math.floor(box.x / TILE), x1 = Math.floor((box.x + box.w - .01) / TILE);
  const y0 = Math.floor(box.y / TILE), y1 = Math.floor((box.y + box.h - .01) / TILE);
  for (let tx = x0; tx <= x1; tx++)
    for (let ty = y0; ty <= y1; ty++)
      if (solidAt(tx, ty)) out.push([tx, ty]);
  return out;
}
function collideX(b, isPlayer) {
  if (b.x < 0) { b.x = 0; b.vx = 0; }
  const ts = tilesIn(b);
  for (const [tx, ty] of ts) {
    if (b.vx > 0) b.x = tx * TILE - b.w;
    else if (b.vx < 0) b.x = (tx + 1) * TILE;
    else {
      const cx = b.x + b.w / 2;
      if (cx < tx * TILE + TILE / 2) b.x = tx * TILE - b.w;
      else b.x = (tx + 1) * TILE;
    }
    if (isPlayer) { b.hitWall = true; }
    else b.vx = -b.vx || 60;
    break;
  }
}
function collideY(b, isPlayer) {
  const ts = tilesIn(b);
  for (const [tx, ty] of ts) {
    if (b.vy > 0) { b.y = ty * TILE - b.h; b.vy = 0; b.onGround = true; }
    else if (b.vy < 0) {
      b.y = (ty + 1) * TILE; b.vy = 0;
      if (isPlayer) headBump(tx, ty);
    }
    break;
  }
  for (const p of G.lv.pipes) {
    const px = p.x * TILE, top = (GY - p.h) * TILE;
    if (b.x + b.w > px && b.x < px + TILE * 2 && b.y + b.h > top && b.y < GY * TILE) {
      if (b.vy > 0 && b.y + b.h - top < 20) { b.y = top - b.h; b.vy = 0; b.onGround = true; }
    }
  }
}

function update(dt) {
  G.t += dt;
  for (const [k, v] of G.bumps) {
    const nv = v + dt;
    if (nv > .28) G.bumps.delete(k);
    else G.bumps.set(k, nv);
  }
  for (let i = G.parts.length - 1; i >= 0; i--) {
    const p = G.parts[i];
    p.age += dt;
    if (p.age > p.life) { G.parts.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vy += (p.grav || 900) * dt;
  }
  for (let i = G.floats.length - 1; i >= 0; i--) {
    const f = G.floats[i];
    f.age += dt; f.y -= 46 * dt;
    if (f.age > 1) G.floats.splice(i, 1);
  }
  if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 30);

  if (G.state === 'intro') {
    G.introT += dt;
    if (G.introT > 1.6) beginPlay();
    return;
  }
  if (G.state !== 'play' && G.state !== 'flag' && G.state !== 'walk' && G.state !== 'dead') return;

  const p = G.player;
  if (G.state === 'dead') {
    G.deadT += dt;
    if (!G.deadFall) {
      p.vy = Math.min(p.vy + 2000 * dt, 900);
      p.y += p.vy * dt;
    }
    if (G.deadT > (G.deadFall ? 1 : 2.2)) {
      G.lives--;
      if (G.lives <= 0) gameOver();
      else { loadLevel(G.levelIdx); G.state = 'intro'; G.introT = 0; showScreen(null); }
    }
    return;
  }

  if (G.state === 'flag') {
    G.flagT += dt;
    const poleX = G.lv.flag * TILE + 14;
    p.x = poleX - p.w - 3;
    p.y += 260 * dt;
    const gy = GY * TILE - p.h;
    if (p.y >= gy) {
      p.y = gy;
      G.state = 'walk';
      p.vx = 130; p.face = 1;
      setTimeout(() => {}, 0);
    }
    updateEnemies(dt, false);
    return;
  }
  if (G.state === 'walk') {
    const doorX = (G.lv.castle + 2) * TILE;
    p.animT += dt * 10;
    p.x += p.vx * dt;
    p.y = GY * TILE - p.h;
    if (G.t % .3 < dt) G.parts.push({ x: p.x + 10, y: p.y + p.h - 4, vx: -40, vy: -80, life: .4, age: 0, r: 2.5, c: '#fff' });
    if (p.x >= doorX) levelClear();
    updateEnemies(dt, false);
    return;
  }

  G.timeLeft -= dt;
  if (G.timeLeft <= 0) { G.timeLeft = 0; die(true); return; }
  if (G.timeLeft < 30 && Math.floor(G.timeLeft * 2) !== Math.floor((G.timeLeft + dt) * 2)) tone(880, .07, 'square', .07);

  const maxSp = keys.run ? 330 : 205;
  const acc = p.onGround ? 1900 : 1300;
  if (keys.left && !keys.right) {
    p.vx = Math.max(p.vx - acc * dt, -maxSp);
    p.face = -1;
    p.skid = p.onGround && p.vx > 120;
  } else if (keys.right && !keys.left) {
    p.vx = Math.min(p.vx + acc * dt, maxSp);
    p.face = 1;
    p.skid = p.onGround && p.vx < -120;
  } else {
    const f = p.onGround ? 1600 : 300;
    if (Math.abs(p.vx) <= f * dt) p.vx = 0;
    else p.vx -= Math.sign(p.vx) * f * dt;
    p.skid = false;
  }
  if (p.skid && Math.random() < .3) G.parts.push({ x: p.x + p.w / 2, y: p.y + p.h - 2, vx: -p.face * 60, vy: -60, life: .3, age: 0, r: 2, c: '#fff' });

  if (p.onGround) p.coyote = .09;
  else p.coyote -= dt;
  if (G.jbuf > 0) G.jbuf -= dt;
  if (G.jbuf > 0 && (p.onGround || p.coyote > 0)) {
    const big = p.form !== 0;
    const runBoost = Math.min(Math.abs(p.vx) / 330, 1);
    p.vy = (big ? -620 : -580) - runBoost * 60;
    p.onGround = false; p.coyote = 0; G.jbuf = 0; p.jumpT = 0;
    sfx.jump(big);
    for (let i = 0; i < 4; i++) G.parts.push({ x: p.x + p.w / 2, y: p.y + p.h, vx: (Math.random() - .5) * 120, vy: -Math.random() * 60, life: .3, age: 0, r: 2, c: '#fff' });
  }
  if (!keys.jump) { p.jumpT = 1; if (p.vy < -280) p.vy = -280; }
  if (keys.jump && p.vy < 0 && p.jumpT < .2) {
    p.vy -= 1300 * dt;
    p.jumpT += dt;
  }
  if (p.vy > 0) p.vy = Math.min(p.vy + 1300 * dt, 950);

  p.hitWall = false;
  moveBody(p, dt, true);
  p.animT += dt * (Math.abs(p.vx) / 40 + (p.onGround ? 0 : 0));
  if (p.y > VH + 80) { die(true); return; }

  if (p.invuln > 0) p.invuln -= dt;
  if (p.star > 0) {
    p.star -= dt;
    if (Math.random() < .4) G.parts.push({ x: p.x + Math.random() * p.w, y: p.y + Math.random() * p.h, vx: (Math.random() - .5) * 100, vy: -100, life: .4, age: 0, r: 2.5, c: ['#ff5d5d', '#ffd93d', '#5ee66e', '#3aa0ff'][Math.random() * 4 | 0] });
  }
  if (G.fireCd > 0) G.fireCd -= dt;

  const target = Math.max(0, Math.min(p.x + p.w / 2 - VW * .42, G.lv.w * TILE - VW));
  G.camX += (target - G.camX) * Math.min(1, dt * 8);

  for (const s of G.lv.spawns) {
    if (!s.done && s.x * TILE < G.camX + VW + 80) { s.done = true; spawnEnemy(s.t, s.x); }
  }
  G.lv.pipes.forEach((pl, i) => {
    if (pl.plant && !pl.spawned && pl.x * TILE < G.camX + VW + 80) {
      pl.spawned = true;
      G.enemies.push({ type: 'plant', pipe: pl, x: pl.x * TILE + 4, w: 56, h: 60, t: Math.random() * 2, dead: 0 });
    }
  });

  updateEnemies(dt, true);
  updateItems(dt);
  updateFireballs(dt);
  updateCoins();

  const poleX = G.lv.flag * TILE + 14;
  if (p.x + p.w >= poleX && p.x < poleX + 40) {
    G.state = 'flag'; G.flagT = 0;
    Music.stop(); sfx.flag();
    const frac = Math.max(0, Math.min(1, 1 - (p.y / (GY * TILE))));
    addScore(400 + Math.floor(frac * 16) * 100, poleX - 30, p.y - 20);
    G.enemies.forEach(e => { if (!e.dead) { e.dead = .001; e.vy = -400; } });
  }
}

function updateEnemies(dt, interact) {
  const p = G.player;
  for (let i = G.enemies.length - 1; i >= 0; i--) {
    const e = G.enemies[i];
    if (e.dead) {
      e.dead += dt;
      e.vy = Math.min((e.vy || 0) + 1800 * dt, 900);
      e.y += (e.vy || 0) * dt;
      if (e.dead > 1.4 || e.y > VH + 120) G.enemies.splice(i, 1);
      continue;
    }
    if (e.x < G.camX - 220 || e.x > G.camX + VW + 200) {
      if (e.x < G.camX - 220) G.enemies.splice(i, 1);
      continue;
    }
    if (e.type === 'plant') {
      e.t += dt;
      const cyc = e.t % 4;
      const top = (GY - e.pipe.h) * TILE;
      let show = 0;
      if (cyc < 1.1) show = 0;
      else if (cyc < 1.7) show = (cyc - 1.1) / .6;
      else if (cyc < 3.2) show = 1;
      else if (cyc < 3.8) show = 1 - (cyc - 3.2) / .6;
      const near = Math.abs((p.x + p.w / 2) - (e.pipe.x * TILE + TILE)) < 52 && p.y + p.h > top - 20;
      if (near && show < 1 && cyc < 1.1) { e.t = 1.1; show = 0; }
      e.show = near && cyc < 1.2 ? 0 : show;
      e.y = top - 52 + (1 - (e.show || 0)) * 56;
      e.animT = (e.animT || 0) + dt * 6;
      if (interact && overlap(p, { x: e.x + 8, y: e.y + 6, w: e.w - 16, h: 46 })) {
        if (p.star > 0) { e.dead = .001; e.vy = -400; addScore(200, e.x, e.y); sfx.kick(); }
        else hurt();
      }
      continue;
    }
    e.animT += dt * 8;
    if (e.type === 'koopa' && e.shell) {
      e.shellT += dt;
      if (e.shellT > 7) {
        e.shell = false; e.w = 26; e.h = 30; e.y -= 14; e.vx = -70 * (p.x < e.x ? 1 : -1);
      } else if (e.shellVx !== 0) {
        e.x += e.shellVx * dt;
        const ts = tilesIn(e);
        if (ts.length) {
          const [tx] = ts[0];
          if (e.shellVx > 0) e.x = tx * TILE - e.w;
          else e.x = (tx + 1) * TILE;
          e.shellVx = -e.shellVx;
          sfx.bump();
        }
        for (const o of G.enemies) {
          if (o !== e && !o.dead && o.type !== 'plant' && overlap(e, o)) {
            o.dead = .001; o.vy = -480;
            addScore(200, o.x, o.y - 10);
            G.kills++;
          }
        }
        if (interact && overlap(p, e)) {
          const stomp = p.vy > 60 && (p.y + p.h) - e.y < 20;
          if (stomp) {
            e.shellVx = 0; e.shellT = 0;
            p.y = e.y - p.h; p.vy = keys.jump ? -700 : -480;
            addScore(200, e.x, e.y - 10); sfx.stomp();
          } else if (p.star > 0) { e.dead = .001; e.vy = -480; addScore(200, e.x, e.y); sfx.kick(); }
          else hurt();
        }
      } else if (interact && overlap(p, e)) {
        const dir = (p.x + p.w / 2) < (e.x + e.w / 2) ? 1 : -1;
        e.shellVx = dir * 500; e.shellT = 0;
        sfx.kick();
        addScore(100, e.x, e.y - 10);
        if (p.y + p.h - e.y < 24 && p.vy > 0) { p.vy = -420; }
      }
      continue;
    }
    moveBody(e, dt, false);
    if (e.y > VH + 100) { G.enemies.splice(i, 1); continue; }
    for (const o of G.enemies) {
      if (o !== e && !o.dead && o.type !== 'plant' && !(o.type === 'koopa' && o.shell && o.shellVx !== 0) && overlap(e, o)) {
        if (e.x < o.x) { e.vx = -Math.abs(e.vx); o.vx = Math.abs(o.vx || 60); }
        else { e.vx = Math.abs(e.vx); o.vx = -Math.abs(o.vx || 60); }
      }
    }
    if (!interact) continue;
    if (overlap(p, e)) {
      if (p.star > 0) {
        e.dead = .001; e.vy = -480;
        addScore(200, e.x, e.y - 10); sfx.kick();
        G.kills++;
      } else {
        const stomp = p.vy > 60 && (p.y + p.h) - e.y < 20;
        if (stomp) {
          p.y = e.y - p.h;
          p.vy = keys.jump ? -720 : -500;
          sfx.stomp();
          G.kills++;
          if (e.type === 'goomba') {
            e.dead = .001; e.vy = -480;
            addScore(200, e.x, e.y - 10);
          } else if (e.type === 'koopa') {
            e.shell = true; e.shellVx = 0; e.shellT = 0;
            e.w = 30; e.h = 16; e.y += 14; e.vx = 0;
            addScore(200, e.x, e.y - 10);
          }
          for (let k = 0; k < 6; k++) G.parts.push({ x: e.x + e.w / 2, y: e.y + e.h, vx: (Math.random() - .5) * 200, vy: -Math.random() * 200, life: .4, age: 0, r: 2.5, c: '#fff' });
        } else hurt();
      }
    }
  }
}

function updateItems(dt) {
  const p = G.player;
  for (let i = G.items.length - 1; i >= 0; i--) {
    const it = G.items[i];
    if (it.emerge) {
      it.y -= 30 * dt;
      if (it.y <= it.ey) { it.y = it.ey; it.emerge = 0; if (it.kind === 'mush' || it.kind === 'oneup') it.vx = 95; if (it.kind === 'star') it.vx = 165; }
      continue;
    }
    if (it.kind === 'flower') { it.animT = (it.animT || 0) + dt * 5; }
    else {
      if (it.kind === 'star') it.vy = Math.min(it.vy + 1900 * dt, 800);
      else it.vy = Math.min(it.vy + 2000 * dt, 800);
      it.x += it.vx * dt;
      collideX(it, false);
      if (it.vx === 0) it.vx = 95;
      it.y += it.vy * dt;
      it.onGround = false;
      const ts = tilesIn(it);
      for (const [tx, ty] of ts) {
        if (it.vy > 0) { it.y = ty * TILE - it.h; it.vy = it.kind === 'star' ? -620 : 0; it.onGround = true; }
        else if (it.vy < 0) { it.y = (ty + 1) * TILE; it.vy = 0; }
        break;
      }
      if (it.y > VH + 60) { G.items.splice(i, 1); continue; }
    }
    if (overlap(p, it)) {
      G.items.splice(i, 1);
      if (it.kind === 'mush') {
        if (p.form === 0) { setForm(p, 1); addScore(500, it.x, it.y - 10); }
        else addScore(500, it.x, it.y - 10);
        sfx.power();
      } else if (it.kind === 'flower') {
        setForm(p, 2); addScore(500, it.x, it.y - 10); sfx.power();
      } else if (it.kind === 'star') {
        p.star = 10; p.invuln = Math.max(p.invuln, 10); addScore(500, it.x, it.y - 10); sfx.power();
      } else if (it.kind === 'oneup') {
        G.lives++; sfx.oneup();
        G.floats.push({ x: it.x, y: it.y - 16, text: '1UP!', age: 0 });
      }
      for (let k = 0; k < 8; k++) G.parts.push({ x: it.x + 13, y: it.y + 13, vx: (Math.random() - .5) * 260, vy: -Math.random() * 260, life: .5, age: 0, r: 3, c: '#ffd93d' });
    }
  }
}
function updateFireballs(dt) {
  for (let i = G.fballs.length - 1; i >= 0; i--) {
    const f = G.fballs[i];
    f.life -= dt; f.animT += dt * 12;
    f.vy = Math.min(f.vy + 1500 * dt, 700);
    f.x += f.vx * dt;
    let hitWall = false;
    const tsx = tilesIn({ x: f.x, y: f.y, w: f.w, h: f.h });
    if (tsx.length) hitWall = true;
    f.y += f.vy * dt;
    const tsy = tilesIn({ x: f.x, y: f.y, w: f.w, h: f.h });
    for (const [tx, ty] of tsy) {
      if (f.vy > 0) { f.y = ty * TILE - f.h; f.vy = -400; }
      else if (f.vy < 0) { f.y = (ty + 1) * TILE; f.vy = 0; }
      break;
    }
    let dead = hitWall || f.life <= 0 || f.y > VH + 40;
    if (!dead) {
      for (const e of G.enemies) {
        if (e.dead || e.type === 'plant' && (e.show || 0) < .5) continue;
        if (overlap(f, e)) {
          e.dead = .001; e.vy = -480;
          if (e.type === 'koopa' && e.shell) { e.shell = false; }
          addScore(200, e.x, e.y - 10);
          sfx.stomp();
          dead = true;
          break;
        }
      }
    }
    if (dead) {
      for (let k = 0; k < 5; k++) G.parts.push({ x: f.x + 6, y: f.y + 6, vx: (Math.random() - .5) * 260, vy: -Math.random() * 240, life: .35, age: 0, r: 2.5, c: '#ff8c42' });
      G.fballs.splice(i, 1);
    }
  }
}
function updateCoins() {
  const p = G.player;
  const box = { x: p.x - 4, y: p.y - 4, w: p.w + 8, h: p.h + 8 };
  for (const c of G.lv.coins) {
    if (c.got) continue;
    if (Math.abs(c.x + 8 - (G.camX + VW / 2)) > VW) continue;
    if (box.x < c.x + 16 && box.x + box.w > c.x && box.y < c.y + 28 && box.y + box.h > c.y) {
      c.got = true;
      addCoin(c.x, c.y);
    }
  }
}

function rr(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function seedRand(i) {
  let s = i * 9301 + 49297;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

function drawBG() {
  const th = THEMES[G.lv ? G.levelIdx : 0];
  const night = store.night ? 2 : G.levelIdx;
  const cols = store.night ? THEMES[2].sky : th.sky;
  const g = ctx.createLinearGradient(0, 0, 0, VH);
  g.addColorStop(0, cols[0]); g.addColorStop(.6, cols[1]); g.addColorStop(1, cols[2]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
  const dark = store.night || (THEMES[G.levelIdx] && THEMES[G.levelIdx].dark);
  if (dark) {
    ctx.fillStyle = '#fff';
    const r = seedRand(7);
    for (let i = 0; i < 60; i++) {
      const x = r() * VW, y = r() * 300;
      ctx.globalAlpha = .3 + .7 * Math.abs(Math.sin(G.t * 2 + i));
      ctx.fillRect(x, y, 2, 2);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#f4f1de';
    ctx.beginPath(); ctx.arc(VW - 80, 70, 24, 0, 7); ctx.fill();
    ctx.fillStyle = cols[0];
    ctx.beginPath(); ctx.arc(VW - 70, 62, 20, 0, 7); ctx.fill();
  } else {
    ctx.fillStyle = 'rgba(255,250,200,.95)';
    ctx.beginPath(); ctx.arc(VW - 80, 70, 26, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.4)';
    ctx.beginPath(); ctx.arc(VW - 80, 70, 38, 0, 7); ctx.fill();
  }
  const cam = G.camX || 0;
  ctx.fillStyle = dark ? 'rgba(200,210,255,.75)' : 'rgba(255,255,255,.92)';
  for (let i = 0; i < 12; i++) {
    const r = seedRand(i + 1);
    const bx = ((r() * 2400 - cam * .3) % 2600 + 2600) % 2600 - 100;
    const y = 30 + r() * 150, s = .7 + r() * .8;
    ctx.beginPath();
    ctx.arc(bx, y, 18 * s, 0, 7); ctx.arc(bx + 20 * s, y - 7 * s, 22 * s, 0, 7);
    ctx.arc(bx + 44 * s, y, 18 * s, 0, 7);
    ctx.fill();
  }
  const hillC = dark ? '#173d24' : (store.night ? '#173d24' : th.hill);
  for (let i = 0; i < 10; i++) {
    const r = seedRand(i + 100);
    const bx = ((r() * 2000 - cam * .5) % 2200 + 2200) % 2200 - 200;
    const hw = 90 + r() * 90, hh = 40 + r() * 50;
    ctx.fillStyle = hillC;
    ctx.beginPath(); ctx.moveTo(bx - hw, GY * TILE);
    ctx.quadraticCurveTo(bx, GY * TILE - hh * 2, bx + hw, GY * TILE);
    ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = dark ? '#1f6b33' : th.hill;
  for (let i = 0; i < 14; i++) {
    const r = seedRand(i + 200);
    const bx = ((r() * 2000 - cam * .7) % 2200 + 2200) % 2200 - 100;
    const y = GY * TILE, s = .8 + r() * .5;
    ctx.beginPath();
    ctx.arc(bx, y - 10 * s, 12 * s, 0, 7); ctx.arc(bx + 14 * s, y - 14 * s, 14 * s, 0, 7); ctx.arc(bx + 28 * s, y - 10 * s, 12 * s, 0, 7);
    ctx.fill();
  }
}

function drawTiles() {
  const cam = G.camX;
  const x0 = Math.max(0, Math.floor(cam / TILE) - 1), x1 = Math.floor((cam + VW) / TILE) + 1;
  for (let tx = x0; tx <= x1; tx++) {
    for (let ty = 0; ty <= 14; ty++) {
      const t = G.lv.tiles.get(tx + ',' + ty);
      if (!t) continue;
      let dy = 0;
      const bk = tx + ',' + ty;
      if (G.bumps.has(bk)) dy = -9 * Math.sin(Math.PI * G.bumps.get(bk) / .28);
      drawTile(t.t, tx * TILE - cam, ty * TILE + dy);
    }
  }
  for (const pl of G.lv.pipes) {
    const px = pl.x * TILE - cam;
    if (px < -80 || px > VW + 80) continue;
    drawPipe(px, (GY - pl.h) * TILE, pl.h);
  }
  const poleX = G.lv.flag * TILE + 14 - cam;
  const topY = 3 * TILE, botY = GY * TILE;
  ctx.fillStyle = '#2a7a33';
  ctx.fillRect(poleX - 3, topY, 6, botY - topY);
  ctx.fillStyle = '#5ee66e';
  ctx.fillRect(poleX - 3, topY, 2, botY - topY);
  ctx.fillStyle = '#ffd93d';
  ctx.beginPath(); ctx.arc(poleX, topY - 8, 8, 0, 7); ctx.fill();
  ctx.strokeStyle = '#7a5a00'; ctx.lineWidth = 2; ctx.stroke();
  const fy = Math.min(G.player && (G.state === 'flag' || G.state === 'walk') ? G.player.y + 8 : 0, 0);
  const flagY = G.state === 'flag' || G.state === 'walk' ? (G.player ? G.player.y + 6 : topY + 30) : topY + 30;
  ctx.fillStyle = '#e33e2b';
  ctx.beginPath(); ctx.moveTo(poleX - 3, flagY); ctx.lineTo(poleX - 45, flagY + 15); ctx.lineTo(poleX - 3, flagY + 30); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = '900 13px system-ui'; ctx.textAlign = 'center';
  ctx.fillText('★', poleX - 22, flagY + 21);
  drawCastle(G.lv.castle * TILE - cam);
}
function drawTile(t, x, y) {
  if (t === 'ground') {
    ctx.fillStyle = '#c84c0c'; ctx.fillRect(x, y, TILE, TILE);
    ctx.fillStyle = '#f7a54b'; ctx.fillRect(x, y, TILE, 6);
    ctx.fillStyle = '#7a2e05';
    ctx.fillRect(x + 5, y + 14, 6, 6); ctx.fillRect(x + 19, y + 22, 6, 6); ctx.fillRect(x + 12, y + 12, 4, 4);
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(x, y + TILE - 2, TILE, 2);
  } else if (t === 'brick') {
    ctx.fillStyle = '#c84c0c'; ctx.fillRect(x, y, TILE, TILE);
    ctx.fillStyle = '#f7a54b'; ctx.fillRect(x, y, TILE, 3);
    ctx.fillStyle = '#5e2203';
    ctx.fillRect(x, y + 9, TILE, 2); ctx.fillRect(x, y + 20, TILE, 2);
    ctx.fillRect(x + 15, y, 2, 9); ctx.fillRect(x + 7, y + 11, 2, 9); ctx.fillRect(x + 23, y + 11, 2, 9); ctx.fillRect(x + 15, y + 22, 2, 10);
  } else if (t === 'solid') {
    ctx.fillStyle = '#d2691e'; ctx.fillRect(x, y, TILE, TILE);
    ctx.strokeStyle = '#4a1c02'; ctx.lineWidth = 3; ctx.strokeRect(x + 1.5, y + 1.5, TILE - 3, TILE - 3);
    ctx.fillStyle = '#f7c873';
    ctx.fillRect(x + 5, y + 5, 4, 4); ctx.fillRect(x + TILE - 9, y + 5, 4, 4);
    ctx.fillRect(x + 5, y + TILE - 9, 4, 4); ctx.fillRect(x + TILE - 9, y + TILE - 9, 4, 4);
  } else if (t === 'used') {
    ctx.fillStyle = '#9c5a24'; ctx.fillRect(x, y, TILE, TILE);
    ctx.strokeStyle = '#4a2c05'; ctx.lineWidth = 3; ctx.strokeRect(x + 1.5, y + 1.5, TILE - 3, TILE - 3);
    ctx.fillStyle = '#6b3a12';
    ctx.fillRect(x + 6, y + 6, 4, 4); ctx.fillRect(x + TILE - 10, y + 6, 4, 4);
    ctx.fillRect(x + 6, y + TILE - 10, 4, 4); ctx.fillRect(x + TILE - 10, y + TILE - 10, 4, 4);
  } else if (t === 'qcoin' || t === 'qmush' || t === 'qstar' || t === 'q1up') {
    const pulse = .75 + .25 * Math.sin(G.t * 5 + x * .05);
    ctx.fillStyle = 'rgb(' + Math.floor(248 * pulse + 40) + ',' + Math.floor(184 * pulse + 30) + ',60)';
    ctx.fillRect(x, y, TILE, TILE);
    ctx.strokeStyle = '#5e2203'; ctx.lineWidth = 3; ctx.strokeRect(x + 1.5, y + 1.5, TILE - 3, TILE - 3);
    ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(x + 4, y + 4, TILE - 8, 3);
    ctx.fillStyle = '#fff8d8';
    ctx.font = '900 20px system-ui'; ctx.textAlign = 'center';
    ctx.fillText('?', x + TILE / 2, y + 23);
    ctx.fillStyle = '#7a4a00';
    ctx.fillRect(x + 4, y + 4, 3, 3); ctx.fillRect(x + TILE - 7, y + 4, 3, 3);
    ctx.fillRect(x + 4, y + TILE - 7, 3, 3); ctx.fillRect(x + TILE - 7, y + TILE - 7, 3, 3);
  }
}
function drawPipe(x, y, h) {
  const w = TILE * 2, bh = h * TILE;
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  ctx.fillRect(x + 5, GY * TILE - 4, w, 5);
  const gr = ctx.createLinearGradient(x, 0, x + w, 0);
  gr.addColorStop(0, '#1d6b27'); gr.addColorStop(.3, '#5ee66e'); gr.addColorStop(.6, '#3fae4a'); gr.addColorStop(1, '#1d6b27');
  ctx.fillStyle = gr;
  ctx.fillRect(x + 3, y + 26, w - 6, bh - 26);
  ctx.fillRect(x - 3, y, w + 6, 30);
  ctx.strokeStyle = '#0c3d14'; ctx.lineWidth = 3;
  ctx.strokeRect(x + 3, y + 26, w - 6, bh - 26);
  ctx.strokeRect(x - 3, y, w + 6, 30);
  ctx.fillStyle = 'rgba(255,255,255,.35)';
  ctx.fillRect(x + 10, y + 32, 8, bh - 40);
}
function drawCastle(x) {
  const base = GY * TILE;
  ctx.fillStyle = 'rgba(0,0,0,.2)';
  ctx.fillRect(x - 6, base - 4, 172, 6);
  ctx.fillStyle = '#d8b48f';
  ctx.fillRect(x, base - 150, 160, 150);
  ctx.fillStyle = '#b98a5e';
  for (let i = 0; i < 5; i++) ctx.fillRect(x + i * 32, base - 170, 24, 20);
  ctx.fillRect(x + 40, base - 196, 80, 30);
  for (let i = 0; i < 3; i++) ctx.fillRect(x + 44 + i * 26, base - 210, 18, 14);
  ctx.fillStyle = '#5e3a1a';
  ctx.fillRect(x + 62, base - 64, 36, 64);
  ctx.beginPath(); ctx.arc(x + 80, base - 64, 18, Math.PI, 0); ctx.fill();
  ctx.fillStyle = '#3a2410';
  ctx.fillRect(x + 72, base - 50, 16, 50);
  ctx.fillStyle = '#5e3a1a';
  ctx.fillRect(x + 20, base - 110, 22, 30); ctx.fillRect(x + 118, base - 110, 22, 30);
  ctx.fillStyle = '#2b1a0c';
  ctx.fillRect(x + 24, base - 106, 14, 22); ctx.fillRect(x + 122, base - 106, 14, 22);
  ctx.fillStyle = '#8a5a2e';
  ctx.fillRect(x + 76, base - 196, 8, 30);
  ctx.fillStyle = '#e33e2b';
  ctx.beginPath(); ctx.moveTo(x + 84, base - 196); ctx.lineTo(x + 116, base - 188); ctx.lineTo(x + 84, base - 180); ctx.closePath(); ctx.fill();
}

function marioPal(base, p) {
  // 火焰形态：红衣白帽 ↔ 白衣红帽闪烁不用，经典是白+红
  if (p.form === 2) return { R: '#ffffff', S: '#ffcf9e', B: '#5a2c0c', D: '#e7402e', Y: '#ffd93d', E: '#1c1c1c' };
  // 无敌星：衣服颜色循环
  if (p.star > 0) {
    const c = ['#e7402e', '#2b5fd9', '#22b14c', '#ff7f27'][Math.floor(G.t * 10) % 4];
    return { R: base.R, S: '#ffcf9e', B: '#5a2c0c', D: c, Y: '#ffd93d', E: '#1c1c1c' };
  }
  return base;
}

function drawPlayer() {
  const p = G.player;
  if (!p) return;
  if (p.invuln > 0 && p.star <= 0 && Math.floor(G.t * 12) % 2 === 0) return;
  const x = p.x - G.camX, y = p.y;
  const flip = p.face < 0;
  if (p.form === 0) {
    // 小马里奥 14x14，2px/格 → 28x28（碰撞盒 24x28，居中）
    let rows = MARIO_S_STAND;
    if (!p.onGround) rows = MARIO_S_JUMP;
    else if (Math.abs(p.vx) > 20) rows = Math.floor(p.animT * 10) % 2 ? MARIO_S_RUNA : MARIO_S_RUNB;
    spr(rows, marioPal(PAL_M, p), x - 2, y, 2, flip);
  } else {
    // 大马里奥 16x28，2px/格 → 32x56（碰撞盒 26x56，居中）
    let rows = MARIO_B_STAND;
    if (!p.onGround) rows = MARIO_B_JUMP;
    else if (p.skid) rows = MARIO_B_SKID;
    else if (Math.abs(p.vx) > 20) rows = Math.floor(p.animT * 10) % 2 ? MARIO_B_RUNA : MARIO_B_RUNB;
    spr(rows, marioPal(PAL_MB, p), x - 3, y, 2, flip);
  }
}

function drawEnemies() {
  for (const e of G.enemies) {
    const x = e.x - G.camX;
    if (x < -80 || x > VW + 80) continue;
    ctx.save();
    if (e.dead) { ctx.globalAlpha = Math.max(0, 1 - e.dead); ctx.translate(x + e.w / 2, e.y + e.h / 2); ctx.scale(1, -1); ctx.translate(-(x + e.w / 2), -(e.y + e.h / 2)); }
    if (e.type === 'goomba') {
      spr(GOOMBA, PAL_G, x - 2, e.y, 2, Math.floor(e.animT) % 2 === 0);
    } else if (e.type === 'koopa') {
      if (e.shell) {
        const blink = e.shellT > 5 && Math.floor(G.t * 8) % 2 === 0;
        spr(SHELL, blink ? { D: '#ffd93d', W: '#fff', K: '#222' } : PAL_K, x - 1, e.y + 2, 2, e.shellVx < 0);
      } else {
        spr(KOOPA, PAL_K, x - 3, e.y - 2, 2, e.vx > 0);
      }
    } else if (e.type === 'plant') {
      const top = (GY - e.pipe.h) * TILE;
      ctx.fillStyle = '#2a7a33';
      ctx.fillRect(x + 22, top - 6, 12, e.y + 40 - top);
      const open = Math.floor(e.animT) % 2 === 0;
      ctx.fillStyle = '#e33e2b';
      ctx.beginPath(); ctx.ellipse(x + 28, e.y + 18, 20, open ? 20 : 14, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff';
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + G.t;
        ctx.beginPath(); ctx.arc(x + 28 + Math.cos(a) * 13, e.y + 18 + Math.sin(a) * (open ? 13 : 8), 4.5, 0, 7); ctx.fill();
      }
      ctx.fillStyle = '#5e0f08';
      ctx.beginPath(); ctx.ellipse(x + 28, e.y + 20, 9, open ? 11 : 4, 0, 0, 7); ctx.fill();
    }
    ctx.restore();
  }
}
function drawItems() {
  for (const it of G.items) {
    const x = it.x - G.camX;
    if (it.kind === 'mush') spr(MUSH, PAL_P, x, it.y, 2, false);
    else if (it.kind === 'oneup') spr(MUSH1, PAL_P, x, it.y, 2, false);
    else if (it.kind === 'flower') spr(FLOWER, PAL_P, x, it.y + Math.sin((it.animT || 0)) * 1.5, 2, false);
    else if (it.kind === 'star') {
      ctx.save();
      ctx.translate(x + 13, it.y + 13); ctx.rotate(G.t * 3); ctx.translate(-13, -13);
      spr(STAR, PAL_P, 0, -2, 2, false);
      ctx.restore();
    }
  }
  for (const c of G.lv.coins) {
    if (c.got) continue;
    const x = c.x - G.camX;
    if (x < -30 || x > VW + 30) continue;
    const w = 6 + 5 * Math.abs(Math.sin(G.t * 5 + c.x * .02));
    ctx.fillStyle = '#8a5a00';
    ctx.beginPath(); ctx.ellipse(c.x + 8 - G.camX, c.y + 14, 9, 13, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffd93d';
    ctx.beginPath(); ctx.ellipse(c.x + 8 - G.camX, c.y + 14, w + 2, 11, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff3b0';
    ctx.beginPath(); ctx.ellipse(c.x + 6 - G.camX, c.y + 11, w * .4, 5, -.4, 0, 7); ctx.fill();
  }
  for (const f of G.fballs) {
    const x = f.x - G.camX;
    ctx.fillStyle = '#ff5d00';
    ctx.beginPath(); ctx.arc(x + 6, f.y + 6, 7 + Math.sin(f.animT) * 1.5, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffd93d';
    ctx.beginPath(); ctx.arc(x + 6, f.y + 6, 3.5, 0, 7); ctx.fill();
  }
}
function drawParts() {
  for (const pt of G.parts) {
    ctx.globalAlpha = Math.max(0, 1 - pt.age / pt.life);
    ctx.fillStyle = pt.c;
    const x = (pt.world ? pt.x : pt.x - (pt.stick ? 0 : G.camX));
    ctx.fillRect(x - pt.r / 2, pt.y - pt.r / 2, pt.r, pt.r);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center';
  for (const f of G.floats) {
    ctx.globalAlpha = Math.max(0, 1 - f.age);
    ctx.font = '900 17px system-ui';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.6)';
    const fx = f.x - (f.stick ? 0 : G.camX);
    ctx.strokeText(f.text, fx, f.y);
    ctx.fillStyle = '#fff';
    ctx.fillText(f.text, fx, f.y);
  }
  ctx.globalAlpha = 1;
}
function drawHUD() {
  ctx.fillStyle = 'rgba(0,0,0,.32)';
  rr(10, 8, VW - 20, 44, 12); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = '900 15px system-ui'; ctx.textAlign = 'left';
  ctx.fillText('SCORE ' + String(G.score).padStart(6, '0'), 24, 27);
  ctx.fillText('🪙×' + String(G.coins).padStart(2, '0'), 24, 45);
  ctx.textAlign = 'center';
  ctx.fillText('WORLD ' + THEMES[G.levelIdx].name, VW / 2, 27);
  ctx.fillText('❤×' + G.lives, VW / 2, 45);
  ctx.textAlign = 'right';
  const tcol = G.timeLeft < 30 ? (Math.floor(G.t * 4) % 2 ? '#ff5d5d' : '#fff') : '#fff';
  ctx.fillStyle = tcol;
  ctx.fillText('TIME ' + Math.ceil(G.timeLeft), VW - 24, 32);
  ctx.fillStyle = '#fff';
  const p = G.player;
  if (p && p.star > 0) {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffd93d';
    ctx.fillText('⭐ ' + Math.ceil(p.star) + 's', 200, 45);
    ctx.fillStyle = '#fff';
  }
  if (G.state === 'intro') {
    ctx.fillStyle = 'rgba(0,0,0,.72)'; ctx.fillRect(0, 0, VW, VH);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.font = '900 34px system-ui';
    ctx.fillText('WORLD ' + THEMES[G.levelIdx].name, VW / 2, VH / 2 - 30);
    ctx.font = '700 17px system-ui';
    ctx.fillStyle = '#ffd93d';
    ctx.fillText(T('introSub', levelSub(G.levelIdx), G.lives), VW / 2, VH / 2 + 4);
  }
}

function render() {
  ctx.save();
  if (G.shake > 0) ctx.translate((Math.random() - .5) * G.shake, (Math.random() - .5) * G.shake);
  if (!G.lv) {
    drawBG();
    ctx.restore();
    return;
  }
  drawBG();
  drawTiles();
  drawItems();
  drawEnemies();
  if (G.state !== 'walk' || Math.floor(G.t * 8) % 2 === 0) drawPlayer();
  drawParts();
  drawHUD();
  ctx.restore();
}

let last = performance.now();
function loop(now) {
  let dt = Math.min((now - last) / 1000, .033);
  last = now;
  if (G.state !== 'pause' && G.state !== 'menu') update(dt);
  else G.t += dt;
  render();
  requestAnimationFrame(loop);
}

$('btn-start').onclick = () => { ac(); sfx.power(); G.score = 0; G.coins = 0; G.lives = 3; G.coinMile = 0; startLevel(G.selected); };
$('btn-retry').onclick = () => retryAll();
$('btn-menu').onclick = () => toMenu();
$('btn-menu2').onclick = () => toMenu();
$('btn-again').onclick = () => { G.score = 0; G.coins = 0; G.lives = 3; G.coinMile = 0; G.selected = 0; startLevel(0); };
$('btn-next').onclick = () => { startLevel(Math.min(THEMES.length - 1, G.levelIdx + 1)); };
$('btn-replay').onclick = () => { loadLevel(G.levelIdx); G.state = 'intro'; G.introT = 0; showScreen(null); };
$('btn-resume').onclick = () => togglePause();
$('btn-quit').onclick = () => toMenu();
$('btn-pause').onclick = e => { e.stopPropagation(); togglePause(); };
canvas.parentElement.addEventListener('pointerdown', e => {
  if (e.target.closest('button')) return;
  if (G.state === 'pause') togglePause();
});

function toggleMute() {
  muted = !muted; store.muted = muted;
  $('btn-mute').textContent = muted ? '🔇' : '🔊';
  if (muted) Music.stop();
  else if (G.state === 'play') Music.start(THEMES[G.levelIdx].trans);
}
$('btn-mute').onclick = e => { e.stopPropagation(); toggleMute(); };
$('btn-mute').textContent = muted ? '🔇' : '🔊';
// i18n boot: static DOM + dynamic boot texts
AMG.mountBtn();
window.__refreshLang = function() {
  AMG.apply(STR);
  $('btn-mute').title = T('muteTitle');
  $('btn-theme').title = T('themeTitle');
  $('btn-pause').title = T('pauseTitle');
  buildMenu();
  refreshMenu();
};
window.__refreshLang();
function applyNight() {
  document.body.classList.toggle('night', store.night);
  $('btn-theme').textContent = store.night ? '☀️' : '🌙';
}
$('btn-theme').onclick = e => { e.stopPropagation(); store.night = !store.night; applyNight(); tone(700, .08, 'sine', .1); };

applyNight();
G.lv = buildLevel(0);
G.player = newPlayer(2.5 * TILE, (GY - 2) * TILE, 0);
showScreen('menu');
// 调试钩子（试玩验证用）
window.__mario = { G, THEMES, WORLDS, buildLevel, loadLevel, startLevel, setForm, showScreen };
window.__game = window.__mario;
window.__marioErrors = [];
window.__gameErrors = window.__marioErrors;
window.addEventListener('error', e => window.__marioErrors.push(String(e.message)));
requestAnimationFrame(t => { last = t; requestAnimationFrame(loop); });
})();
