(() => {
'use strict';
// 打砖块：子步进圆-矩形碰撞；球拍击球点决定出射角；8 种道具；爆炸砖连锁；连击倍率
const { $, T } = KIT;
const store = KIT.store('amg-breakout');
const W = 480, H = 680, COLS = 12, BW = 38, BH = 18, BX = (W - COLS * BW) / 2, BY = 78, PY = 632, HUD = 50;
const cv = $('game'), frame = $('frame');
const ctx = KIT.canvas(cv, W, H);

// . 空 / 1-5 普通砖 / h 硬砖(2) / H 超硬(3) / m 钢砖 / x 爆炸砖 / q 问号砖(必掉道具)
const LEVELS = [
  ['............', '111111111111', '222222222222', '333333333333', '444444444444', '555555555555'],
  ['.....11.....', '....2222....', '...333333...', '..44444444..', '.5555555555.', 'hhhhhhhhhhhh'],
  ['1.2.3.4.5.1.', '.2.3.4.5.1.2', '3.4.q.1.q.3.', '.4.5.1.2.3.4', '5.1.2.3.4.5.', '.h.h.h.h.h.h'],
  ['m..........m', 'm.hhhhhhhh.m', 'm.h222222h.m', 'm.h2qxxq2h.m', 'm.h222222h.m', 'm.hhhhhhhh.m'],
  ['..11....11..', '.1111..1111.', '111q1111q111', '111111111111', '.1111111111.', '..11111111..', '...111111...', '....1111....', '.....11.....'],
  ['HHHHHHHHHHHH', '............', 'xx22222222xx', '............', 'hhhhqhhqhhhh', '............', '444444444444'],
  ['..h......h..', '...h....h...', '..44444444..', '.44.4444.44.', '4444qq444444', '4.44444444.4', '4.4......4.4', '...44..44...'],
  ['555555555555', 'mmmmm..mmmmm', '4444q44q4444', 'mm..mmmm..mm', '333333333333', '....xxxx....', '222222222222'],
  ['.....HH.....', '....H22H....', '...H2xx2H...', '..H2xqqx2H..', '...H2xx2H...', '....H22H....', '.....HH.....', '............', '111111111111'],
  ['HHHHHHHHHHHH', 'H5555555555H', 'H5mmmmmmmm5H', 'H54444q4445H', 'H5x333333x5H', 'H5x3q22q3x5H', 'H5x333333x5H', 'H5mmm..mmm5H', 'H5555555555H']
];
const EMO = ['🔥', '🔺', '♟️', '🏰', '❤️', '🎏', '👾', '🌀', '💎', '👑'];
const COLORS = { 1: '#f08a5d', 2: '#f2b84b', 3: '#78c06a', 4: '#56a8e0', 5: '#a58de8', h: '#c98a4a', H: '#8e5a34', x: '#e0483a', q: '#f0c43b' };
const PW = {
  E: { e: '↔️', c: '#5a9e63', w: 16 }, M: { e: '⚪', c: '#56a8e0', w: 14 }, L: { e: '🔫', c: '#d9539a', w: 11 },
  F: { e: '🔥', c: '#e0703a', w: 8 }, C: { e: '🧲', c: '#8a6fd6', w: 10 }, S: { e: '🐢', c: '#3fa59a', w: 10 },
  H: { e: '❤️', c: '#e0483a', w: 4 }, X: { e: '💀', c: '#5c5148', w: 10 }
};
const PW_DUR = { E: 16, L: 10, F: 8, C: 14, S: 10, X: 10 };

let mode = 'menu', level = 0, pick = 0, score = 0, lives = 3, lvT = 0;
let bricks = [], balls = [], drops = [], bolts = [], texts = [];
const paddle = { x: W / 2, tx: W / 2, w: 86 };
const fx = { E: 0, L: 0, F: 0, C: 0, S: 0, X: 0 };
let combo = 0, maxCombo = 0, broken = 0, shake = 0, laserCd = 0, flash = 0, clearAt = 0, bestAtStart = 0;
const keys = {};
let fireHeld = false;
const parts = new KIT.Particles();

// ---------------- 音效 ----------------
const sfx = {
  paddle: () => KIT.tone(330, 0.08, { type: 'square', vol: 0.04, to: 440 }),
  wall: () => KIT.tone(240, 0.04, { type: 'triangle', vol: 0.03 }),
  brick: k => KIT.tone(520 + Math.min(k, 12) * 45, 0.07, { type: 'square', vol: 0.04 }),
  hard: () => KIT.tone(300, 0.06, { type: 'triangle', vol: 0.06 }),
  metal: () => { KIT.tone(1400, 0.12, { type: 'sine', vol: 0.04 }); KIT.tone(2100, 0.08, { type: 'sine', vol: 0.02 }); },
  boom: () => { KIT.noise(0.4, { vol: 0.2, lp: 1200 }); KIT.tone(110, 0.35, { vol: 0.15, to: 40 }); },
  power: good => good ? KIT.arp([660, 880, 1320], 0.05, { vol: 0.06, dur: 0.12 }) : KIT.arp([440, 330, 220], 0.07, { type: 'sawtooth', vol: 0.04 }),
  laser: () => KIT.tone(1500, 0.06, { type: 'sawtooth', vol: 0.02, to: 700 }),
  lose: () => KIT.arp([392, 311, 262, 196], 0.12, { type: 'triangle', vol: 0.08, dur: 0.22 }),
  clear: () => KIT.arp([523, 659, 784, 1047, 1319], 0.08, { vol: 0.08, dur: 0.22 }),
  launch: () => KIT.tone(440, 0.1, { type: 'triangle', vol: 0.05, to: 880 })
};

// ---------------- 关卡 ----------------
function loadLevel(i) {
  bricks = [];
  LEVELS[i].forEach((row, r) => {
    row.padEnd(COLS, '.').slice(0, COLS).split('').forEach((ch, c) => {
      if (ch === '.') return;
      const type = /[1-5]/.test(ch) ? 'n' : ch;
      bricks.push({
        x: BX + c * BW, y: BY + r * BH, w: BW, h: BH, type, alive: true, hit: 0,
        hp: type === 'h' ? 2 : type === 'H' ? 3 : 1, max: type === 'h' ? 2 : type === 'H' ? 3 : 1,
        color: COLORS[ch] || '#9aa3ad'
      });
    });
  });
}
const breakable = () => bricks.some(b => b.alive && b.type !== 'm');

function baseSpeed() {
  const ramp = 1 + Math.min(0.22, lvT / 100 * 0.22);
  return (330 + level * 14) * ramp * (fx.S > 0 ? 0.68 : 1);
}
function paddleW() { return fx.E > 0 ? 130 : fx.X > 0 ? 56 : 86; }

function newBall() {
  balls = [{ x: paddle.x, y: PY - 8, vx: 0, vy: 0, r: 7, stuck: true, off: 0, trail: [] }];
}

function startLevel(i, fresh) {
  level = i;
  if (fresh) { score = 0; lives = 3; broken = 0; maxCombo = 0; bestAtStart = store.get('best', 0); }
  loadLevel(i);
  drops = []; bolts = []; texts = []; parts.clear();
  Object.keys(fx).forEach(k => { fx[k] = 0; });
  combo = 0; lvT = 0; clearAt = 0; paddle.x = paddle.tx = W / 2;
  newBall();
  mode = 'ready';
  hideScreens();
  floatText(W / 2, H / 2 - 20, T('lv', i + 1) + ' · ' + T('names')[i], '#e08f4a', 30, 1.6);
  KIT.music('arcade-run');
}

function launch() {
  let any = false;
  for (const b of balls) {
    if (!b.stuck) continue;
    const k = KIT.clamp(b.off / (paddle.w / 2), -1, 1);
    const a = (k * 55 + (k === 0 ? (Math.random() - 0.5) * 20 : 0)) * Math.PI / 180;
    const sp = baseSpeed();
    b.vx = Math.sin(a) * sp; b.vy = -Math.cos(a) * sp; b.stuck = false;
    any = true;
  }
  if (any) { sfx.launch(); if (mode === 'ready') mode = 'play'; }
}

// ---------------- 伤害 / 道具 ----------------
function floatText(x, y, s, color, size, life) {
  texts.push({ x, y, s, color: color || '#fff', size: size || 16, life: life || 0.9, age: 0 });
}

function damage(b, fromBall, pierce) {
  if (!b.alive) return;
  b.hit = 0.14;
  if (b.type === 'm') { sfx.metal(); return; }
  b.hp -= pierce ? b.hp : 1;
  if (b.hp > 0) { sfx.hard(); score += 10; return; }
  b.alive = false;
  broken++;
  if (fromBall) { combo++; maxCombo = Math.max(maxCombo, combo); }
  const mult = Math.min(8, 1 + Math.floor(combo / 3));
  const base = b.type === 'h' ? 80 : b.type === 'H' ? 120 : b.type === 'x' ? 70 : 50;
  score += base * mult;
  if (fromBall && combo >= 3 && combo % 3 === 0) floatText(b.x + b.w / 2, b.y, T('combo', mult), '#f2b84b', 18);
  sfx.brick(combo);
  parts.burst(b.x + b.w / 2, b.y + b.h / 2, { n: 12, color: [b.color, '#fff8e8'], shape: 'square', speed: 170, size: 5, life: 0.6 });
  if (b.type === 'q' || Math.random() < 0.11) spawnDrop(b.x + b.w / 2, b.y + b.h / 2);
  if (b.type === 'x') explode(b);
}

function explode(b) {
  sfx.boom();
  shake = Math.max(shake, 0.45);
  flash = 0.18;
  parts.burst(b.x + b.w / 2, b.y + b.h / 2, { n: 34, color: ['#f2b84b', '#e0603a', '#fff2c8'], speed: 300, size: 6, life: 0.7, gravity: 120 });
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  setTimeout(() => {
    for (const o of bricks) {
      if (!o.alive || o.type === 'm') continue;
      if (Math.abs(o.x + o.w / 2 - cx) <= BW * 1.05 && Math.abs(o.y + o.h / 2 - cy) <= BH * 1.05) damage(o, false, true);
    }
  }, 70);
}

function spawnDrop(x, y) {
  const bag = Object.keys(PW);
  let total = 0;
  bag.forEach(k => { total += PW[k].w; });
  let r = Math.random() * total, kind = 'E';
  for (const k of bag) { r -= PW[k].w; if (r <= 0) { kind = k; break; } }
  drops.push({ x, y, kind, t: 0 });
}

function applyPower(k) {
  const good = k !== 'X';
  sfx.power(good);
  floatText(paddle.x, PY - 30, T('pw')[k], PW[k].c, 18);
  if (k === 'M') {
    const src = balls.find(b => !b.stuck) || balls[0];
    if (!src) return;
    if (src.stuck) launch();
    const sp = Math.hypot(src.vx, src.vy) || baseSpeed();
    const a0 = Math.atan2(src.vy, src.vx);
    for (const d of [-0.45, 0.45]) {
      balls.push({ x: src.x, y: src.y, vx: Math.cos(a0 + d) * sp, vy: Math.sin(a0 + d) * sp, r: 7, stuck: false, off: 0, trail: [] });
    }
  } else if (k === 'H') {
    lives = Math.min(lives + 1, 6);
  } else {
    if (k === 'E') fx.X = 0;
    if (k === 'X') fx.E = 0;
    fx[k] = PW_DUR[k];
  }
}

function loseLife() {
  lives--;
  combo = 0;
  sfx.lose();
  shake = 0.35;
  Object.keys(fx).forEach(k => { fx[k] = 0; });
  drops = []; bolts = [];
  if (lives <= 0) { gameOver(false); return; }
  newBall();
  mode = 'ready';
}

// ---------------- 碰撞 ----------------
function hitRect(b, r) {
  const nx = KIT.clamp(b.x, r.x, r.x + r.w), ny = KIT.clamp(b.y, r.y, r.y + r.h);
  const dx = b.x - nx, dy = b.y - ny;
  return dx * dx + dy * dy < b.r * b.r;
}

function stepBall(b, dt) {
  const sp = Math.hypot(b.vx, b.vy);
  const n = Math.max(1, Math.ceil(sp * dt / 3.5));
  const h = dt / n;
  for (let s = 0; s < n; s++) {
    b.x += b.vx * h; b.y += b.vy * h;
    if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx); sfx.wall(); }
    else if (b.x > W - b.r) { b.x = W - b.r; b.vx = -Math.abs(b.vx); sfx.wall(); }
    if (b.y < HUD + b.r) { b.y = HUD + b.r; b.vy = Math.abs(b.vy); sfx.wall(); }

    // 球拍
    const hw = paddle.w / 2;
    if (b.vy > 0 && b.y + b.r >= PY && b.y - b.r <= PY + 14 && b.x >= paddle.x - hw - b.r && b.x <= paddle.x + hw + b.r) {
      const k = KIT.clamp((b.x - paddle.x) / hw, -1, 1);
      const a = k * 62 * Math.PI / 180;
      const v = baseSpeed();
      b.vx = Math.sin(a) * v; b.vy = -Math.cos(a) * v;
      b.y = PY - b.r;
      combo = 0;
      sfx.paddle();
      parts.burst(b.x, PY, { n: 5, color: '#fff2d8', speed: 90, size: 3, life: 0.3, angle: -Math.PI / 2, spread: 2 });
      if (fx.C > 0) { b.stuck = true; b.off = b.x - paddle.x; b.vx = b.vy = 0; return; }
      continue;
    }

    // 砖块：每个子步最多处理一块
    for (const r of bricks) {
      if (!r.alive || !hitRect(b, r)) continue;
      const pierce = fx.F > 0 && r.type !== 'm';
      damage(r, true, pierce);
      if (!pierce) {
        const ox = Math.min(b.x + b.r - r.x, r.x + r.w - (b.x - b.r));
        const oy = Math.min(b.y + b.r - r.y, r.y + r.h - (b.y - b.r));
        if (ox < oy) { b.vx = b.x < r.x + r.w / 2 ? -Math.abs(b.vx) : Math.abs(b.vx); }
        else { b.vy = b.y < r.y + r.h / 2 ? -Math.abs(b.vy) : Math.abs(b.vy); }
      }
      break;
    }
    // 防止近水平死循环
    if (Math.abs(b.vy) < sp * 0.18) { b.vy = (b.vy < 0 ? -1 : 1) * sp * 0.18; }
  }
  // 保持速度与当前速度目标一致（慢速道具 / 逐渐加速）
  const target = baseSpeed(), cur = Math.hypot(b.vx, b.vy) || 1;
  const k = 1 + (target / cur - 1) * Math.min(1, dt * 3);
  b.vx *= k; b.vy *= k;
}

// ---------------- 主循环 ----------------
function update(dt) {
  parts.update(dt);
  for (let i = texts.length - 1; i >= 0; i--) { texts[i].age += dt; if (texts[i].age > texts[i].life) texts.splice(i, 1); }
  shake = Math.max(0, shake - dt);
  flash = Math.max(0, flash - dt);
  for (const b of bricks) b.hit = Math.max(0, b.hit - dt);
  if (mode !== 'ready' && mode !== 'play') return;

  if (mode === 'play') lvT += dt;
  for (const k in fx) fx[k] = Math.max(0, fx[k] - dt);
  paddle.w += (paddleW() - paddle.w) * Math.min(1, dt * 10);
  if (keys.left) paddle.tx -= 600 * dt;
  if (keys.right) paddle.tx += 600 * dt;
  paddle.tx = KIT.clamp(paddle.tx, paddle.w / 2, W - paddle.w / 2);
  paddle.x += (paddle.tx - paddle.x) * Math.min(1, dt * 22);
  paddle.x = KIT.clamp(paddle.x, paddle.w / 2, W - paddle.w / 2);

  laserCd -= dt;
  if (fx.L > 0 && fireHeld && laserCd <= 0 && mode === 'play') {
    laserCd = 0.26;
    bolts.push({ x: paddle.x - paddle.w / 2 + 8, y: PY - 6 }, { x: paddle.x + paddle.w / 2 - 8, y: PY - 6 });
    sfx.laser();
  }

  for (const b of balls) {
    if (b.stuck) { b.x = paddle.x + b.off; b.y = PY - b.r; continue; }
    stepBall(b, dt);
    b.trail.push(b.x, b.y);
    if (b.trail.length > 16) b.trail.splice(0, 2);
  }
  balls = balls.filter(b => b.y < H + 20);
  if (!balls.length) { loseLife(); return; }

  for (let i = bolts.length - 1; i >= 0; i--) {
    const z = bolts[i];
    z.y -= 760 * dt;
    let hit = z.y < HUD;
    for (const r of bricks) {
      if (r.alive && z.x > r.x && z.x < r.x + r.w && z.y > r.y && z.y < r.y + r.h) { damage(r, false); hit = true; break; }
    }
    if (hit) bolts.splice(i, 1);
  }

  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i];
    d.y += 150 * dt; d.t += dt;
    if (d.y + 9 >= PY && d.y - 9 <= PY + 14 && Math.abs(d.x - paddle.x) < paddle.w / 2 + 20) { applyPower(d.kind); drops.splice(i, 1); }
    else if (d.y > H + 20) drops.splice(i, 1);
  }

  if (mode === 'play' && !breakable() && !clearAt) {
    clearAt = performance.now();
    setTimeout(levelClear, 650);
  }
}

function levelClear() {
  clearAt = 0;
  if (mode !== 'play') return;
  score += 500 + lives * 100;
  sfx.clear();
  const unlocked = store.get('unlocked', 0);
  if (level + 1 > unlocked && level + 1 < LEVELS.length) store.set('unlocked', level + 1);
  for (let k = 0; k < 5; k++) setTimeout(() => parts.burst(KIT.rand(60, W - 60), KIT.rand(120, 300), {
    n: 24, color: ['#f2b84b', '#e0703a', '#78c06a', '#56a8e0', '#a58de8'], shape: 'square', speed: 240, life: 1.2, size: 6, gravity: 320
  }), k * 140);
  if (level === LEVELS.length - 1) gameOver(true);
  else showPanel('clear');
}

function gameOver(win) {
  mode = win ? 'win' : 'over';
  KIT.stopMusic();
  if (score > store.get('best', 0)) store.set('best', score);
  showPanel(win ? 'win' : 'over');
}

// ---------------- 绘制 ----------------
function pal() {
  return KIT.dark()
    ? { bg1: '#2c2117', bg2: '#1c150e', dot: 'rgba(242,231,212,.05)', hud: 'rgba(20,14,8,.55)', ink: '#f2e7d4', soft: '#bfa98a', ball: '#fff3dc', pad1: '#f0a35e', pad2: '#c2652a' }
    : { bg1: '#fdf6ea', bg2: '#f0e0c6', dot: 'rgba(120,90,50,.07)', hud: 'rgba(255,250,240,.75)', ink: '#3a2e24', soft: '#8a7660', ball: '#ffffff', pad1: '#e8954f', pad2: '#bf6324' };
}

function drawBrick(b, P) {
  const r = 5, x = b.x + 1.5, y = b.y + 1.5, w = b.w - 3, h = b.h - 3;
  let base = b.color;
  if (b.type === 'm') {
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, '#d5dbe2'); g.addColorStop(0.5, '#9aa3ad'); g.addColorStop(1, '#727b85');
    base = g;
  }
  ctx.fillStyle = 'rgba(0,0,0,.18)';
  KIT.roundRect(ctx, x, y + 2, w, h, r); ctx.fill();
  ctx.fillStyle = base;
  KIT.roundRect(ctx, x, y, w, h, r); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.35)';
  KIT.roundRect(ctx, x + 3, y + 2, w - 6, 4, 2); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,.12)';
  ctx.fillRect(x + 2, y + h - 3, w - 4, 2);
  if (b.type === 'm') {
    ctx.fillStyle = '#5d656e';
    [[x + 4, y + h / 2], [x + w - 4, y + h / 2]].forEach(([a, c]) => { ctx.beginPath(); ctx.arc(a, c, 1.6, 0, 7); ctx.fill(); });
  } else if (b.type === 'x') {
    ctx.fillStyle = '#fff3d6'; ctx.font = '900 9px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('TNT', x + w / 2, y + h / 2 + 1);
  } else if (b.type === 'q') {
    ctx.fillStyle = '#7a4a10'; ctx.font = '900 12px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('?', x + w / 2, y + h / 2 + 1 + Math.sin(performance.now() / 200) * 1.2);
  } else if (b.max > 1 && b.hp < b.max) {
    ctx.strokeStyle = 'rgba(40,20,5,.55)'; ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.3, y + 1); ctx.lineTo(x + w * 0.42, y + h * 0.5); ctx.lineTo(x + w * 0.34, y + h - 1);
    if (b.max - b.hp > 1) { ctx.moveTo(x + w * 0.7, y + 1); ctx.lineTo(x + w * 0.6, y + h * 0.55); ctx.lineTo(x + w * 0.75, y + h - 1); }
    ctx.stroke();
  }
  if (b.hit > 0) {
    ctx.fillStyle = `rgba(255,255,255,${b.hit / 0.14 * 0.7})`;
    KIT.roundRect(ctx, x, y, w, h, r); ctx.fill();
  }
}

function draw() {
  const P = pal(), now = performance.now();
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake * 14, (Math.random() - 0.5) * shake * 14);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, P.bg1); g.addColorStop(1, P.bg2);
  ctx.fillStyle = g; ctx.fillRect(-10, -10, W + 20, H + 20);
  ctx.fillStyle = P.dot;
  for (let y = HUD + 10; y < H; y += 24) for (let x = 12; x < W; x += 24) ctx.fillRect(x, y, 2, 2);

  for (const b of bricks) if (b.alive) drawBrick(b, P);

  // 道具胶囊
  for (const d of drops) {
    const c = PW[d.kind];
    ctx.save(); ctx.translate(d.x, d.y);
    ctx.fillStyle = 'rgba(0,0,0,.2)'; KIT.roundRect(ctx, -21, -8, 42, 20, 10); ctx.fill();
    ctx.fillStyle = c.c; KIT.roundRect(ctx, -21, -10, 42, 20, 10); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.3)'; KIT.roundRect(ctx, -16, -8, 32, 5, 3); ctx.fill();
    ctx.fillStyle = '#000'; ctx.font = '13px system-ui, "Apple Color Emoji", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(c.e, 0, 1 + Math.sin(d.t * 8) * 1);
    ctx.restore();
  }

  // 激光
  ctx.strokeStyle = '#ff5fa8'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  for (const z of bolts) { ctx.beginPath(); ctx.moveTo(z.x, z.y); ctx.lineTo(z.x, z.y + 12); ctx.stroke(); }

  // 球拍
  const pw = paddle.w, px = paddle.x - pw / 2;
  if (fx.C > 0) { ctx.shadowColor = '#8a6fd6'; ctx.shadowBlur = 16; }
  const pg = ctx.createLinearGradient(0, PY, 0, PY + 14);
  pg.addColorStop(0, fx.X > 0 ? '#8a7f74' : P.pad1); pg.addColorStop(1, fx.X > 0 ? '#5c5148' : P.pad2);
  ctx.fillStyle = pg; KIT.roundRect(ctx, px, PY, pw, 14, 7); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255,255,255,.45)'; KIT.roundRect(ctx, px + 8, PY + 2, pw - 16, 3, 2); ctx.fill();
  if (fx.L > 0) {
    ctx.fillStyle = '#d9539a';
    ctx.fillRect(px + 4, PY - 7, 8, 9); ctx.fillRect(px + pw - 12, PY - 7, 8, 9);
  }

  // 球
  for (const b of balls) {
    const fire = fx.F > 0;
    for (let i = 0; i < b.trail.length; i += 2) {
      const k = i / b.trail.length;
      ctx.globalAlpha = k * (fire ? 0.6 : 0.3);
      ctx.fillStyle = fire ? '#f08a3a' : P.soft;
      ctx.beginPath(); ctx.arc(b.trail[i], b.trail[i + 1], b.r * (0.4 + k * 0.6), 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (fire) { ctx.shadowColor = '#ff7a2a'; ctx.shadowBlur = 18; }
    ctx.fillStyle = fire ? '#ffd27a' : P.ball;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = fire ? '#e0603a' : 'rgba(80,60,40,.35)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    ctx.beginPath(); ctx.arc(b.x - 2.2, b.y - 2.2, 2, 0, 7); ctx.fill();
  }

  parts.draw(ctx);

  for (const t of texts) {
    const k = t.age / t.life;
    ctx.globalAlpha = Math.min(1, (1 - k) * 2);
    ctx.font = `400 ${t.size}px "AMG Display", "PingFang SC", system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(40,28,16,.55)';
    ctx.strokeText(t.s, t.x, t.y - k * 30);
    ctx.fillStyle = t.color; ctx.fillText(t.s, t.x, t.y - k * 30);
  }
  ctx.globalAlpha = 1;

  if (mode === 'ready' && Math.floor(now / 500) % 2 === 0) {
    ctx.font = '700 15px "PingFang SC", system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillStyle = P.soft; ctx.fillText(T('launch'), W / 2, PY - 60);
  }
  ctx.restore();

  if (flash > 0) { ctx.fillStyle = `rgba(255,240,210,${flash * 2})`; ctx.fillRect(0, 0, W, H); }
  drawHud(P);
}

function drawHud(P) {
  ctx.fillStyle = P.hud; ctx.fillRect(0, 0, W, HUD);
  ctx.fillStyle = 'rgba(0,0,0,.08)'; ctx.fillRect(0, HUD - 1, W, 1);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left'; ctx.fillStyle = P.soft; ctx.font = '800 10px system-ui, sans-serif';
  ctx.fillText(T('hudScore'), 14, 15);
  ctx.fillStyle = P.ink; ctx.font = '400 22px "AMG Display", system-ui, sans-serif';
  ctx.fillText(score, 14, 34);
  ctx.textAlign = 'center'; ctx.fillStyle = P.soft; ctx.font = '800 10px system-ui, sans-serif';
  ctx.fillText(T('hudLevel'), W / 2, 15);
  ctx.fillStyle = P.ink; ctx.font = '400 19px "AMG Display", system-ui, sans-serif';
  ctx.fillText(EMO[level] + ' ' + (level + 1), W / 2, 34);
  ctx.textAlign = 'right'; ctx.font = '14px system-ui, "Apple Color Emoji", sans-serif';
  ctx.fillText('❤️'.repeat(Math.max(0, Math.min(lives, 6))), W - 52, 26);
  // 生效中的道具：小图标 + 剩余时间条
  let ix = 12;
  for (const k of ['E', 'X', 'L', 'F', 'C', 'S']) {
    if (fx[k] <= 0) continue;
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = PW[k].c; KIT.roundRect(ctx, ix, HUD + 6, 34, 16, 8); ctx.fill();
    ctx.font = '11px system-ui, "Apple Color Emoji", sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(PW[k].e, ix + 17, HUD + 14.5);
    ctx.fillStyle = PW[k].c; ctx.fillRect(ix + 2, HUD + 25, 30 * fx[k] / PW_DUR[k], 2);
    ctx.globalAlpha = 1;
    ix += 40;
  }
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.033, (now - last) / 1000); last = now;
  if (mode !== 'pause') update(dt);
  draw();
  requestAnimationFrame(loop);
}

// ---------------- 界面 ----------------
function hideScreens() { ['screen-menu', 'screen-pause', 'screen-over'].forEach(id => $(id).classList.add('hidden')); }
function showMenu() {
  mode = 'menu';
  KIT.stopMusic();
  hideScreens();
  loadLevel(pick); balls = []; drops = []; bolts = []; texts = [];
  renderMenu();
  $('screen-menu').classList.remove('hidden');
}
function renderMenu() {
  const unlocked = store.get('unlocked', 0), box = $('levels');
  box.innerHTML = '';
  LEVELS.forEach((_, i) => {
    const b = document.createElement('button');
    b.className = 'lvl-btn' + (i === pick ? ' active' : '') + (i > unlocked ? ' locked' : '');
    b.innerHTML = `<span class="lv-emo">${i > unlocked ? '🔒' : EMO[i]}</span>${i + 1}<small>${T('names')[i]}</small>`;
    b.onclick = () => {
      if (i > unlocked) { KIT.tone(150, 0.1, { vol: 0.05 }); return; }
      pick = i; KIT.tone(500 + i * 30, 0.06, { type: 'triangle', vol: 0.05 });
      loadLevel(pick); renderMenu();
    };
    box.appendChild(b);
  });
  $('menu-best').textContent = T('best', store.get('best', 0));
}
function showPanel(kind) {
  const isClear = kind === 'clear', win = kind === 'win';
  $('over-icon').textContent = win ? '👑' : isClear ? '🎉' : '💥';
  const t = $('over-title');
  t.textContent = win ? T('winTitle') : isClear ? T('clearTitle', level + 1) : T('overTitle');
  t.className = win || isClear ? 'clear-title' : 'over-title';
  const best = Math.max(store.get('best', 0), score);
  $('over-record').classList.toggle('hidden', isClear || score <= bestAtStart);
  $('over-stats').innerHTML =
    `<span>${T('stScore')}</span><b>${score}</b><span>${T('stLevel')}</span><b>${level + 1} / ${LEVELS.length}</b>` +
    `<span>${T('stBricks')}</span><b>${broken}</b><span>${T('stCombo')}</span><b>${maxCombo}</b>` +
    `<span>${T('stBest')}</span><b>${best}</b>`;
  const btn = $('btn-retry');
  btn.textContent = isClear ? T('next') : win ? T('again') : T('retry');
  btn.dataset.kind = kind;
  if (isClear) mode = 'clear';
  $('screen-over').classList.remove('hidden');
}
function pause(on) {
  if (on && (mode === 'play' || mode === 'ready')) { mode = 'pause'; $('screen-pause').classList.remove('hidden'); KIT.stopMusic(); }
  else if (!on && mode === 'pause') {
    $('screen-pause').classList.add('hidden');
    mode = balls.some(b => !b.stuck) ? 'play' : 'ready';
    KIT.music('arcade-run');
  }
}

// ---------------- 输入 ----------------
$('btn-start').onclick = () => startLevel(pick, true);
$('btn-retry').onclick = () => {
  const k = $('btn-retry').dataset.kind;
  if (k === 'clear') startLevel(level + 1, false);
  else startLevel(k === 'win' ? 0 : level, true);
};
$('btn-menu').onclick = showMenu;
$('btn-quit').onclick = showMenu;
$('btn-resume').onclick = () => pause(false);
$('btn-pause').onclick = e => { e.stopPropagation(); pause(mode !== 'pause'); };

let touch = null;
frame.addEventListener('pointerdown', e => {
  if (e.target.closest('.screen, button')) return;
  const p = KIT.point(cv, e, W, H);
  if (e.pointerType === 'mouse') { paddle.tx = p.x; }
  else touch = { x: p.x, tx: paddle.tx, t: performance.now(), moved: false };
  if (mode === 'ready' || mode === 'play') { fireHeld = true; launch(); }
});
frame.addEventListener('pointermove', e => {
  const p = KIT.point(cv, e, W, H);
  if (e.pointerType === 'mouse') paddle.tx = p.x;
  else if (touch) {
    paddle.tx = touch.tx + (p.x - touch.x) * 1.25;
    if (Math.abs(p.x - touch.x) > 8) touch.moved = true;
  }
});
window.addEventListener('pointerup', () => { fireHeld = false; touch = null; });

document.addEventListener('keydown', e => {
  if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
  const k = e.key;
  if (k === 'ArrowLeft' || k === 'a' || k === 'A') { keys.left = true; e.preventDefault(); }
  else if (k === 'ArrowRight' || k === 'd' || k === 'D') { keys.right = true; e.preventDefault(); }
  else if (k === ' ' || k === 'ArrowUp') {
    e.preventDefault();
    if (mode === 'menu') startLevel(pick, true);
    else { fireHeld = true; launch(); }
  } else if (k === 'p' || k === 'P' || k === 'Escape') pause(mode !== 'pause');
  else if (k === 'Enter' && mode === 'menu') startLevel(pick, true);
});
document.addEventListener('keyup', e => {
  const k = e.key;
  if (k === 'ArrowLeft' || k === 'a' || k === 'A') keys.left = false;
  else if (k === 'ArrowRight' || k === 'd' || k === 'D') keys.right = false;
  else if (k === ' ' || k === 'ArrowUp') fireHeld = false;
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(true); });

const syncMute = KIT.mountMute($('btn-mute'));
KIT.boot(() => { syncMute(); if (mode === 'menu') renderMenu(); });
pick = Math.min(store.get('unlocked', 0), LEVELS.length - 1);
showMenu();
requestAnimationFrame(loop);
})();
