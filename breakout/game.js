(() => {
// 打砖块：鼠标/键盘挡板 + 落点反弹角 + 7道具 + 8关卡 + 激光
const W = 480, H = 640, PAD_Y = 590;
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const $ = id => document.getElementById(id);
const dpr = Math.min(window.devicePixelRatio || 1, 2);
canvas.width = W * dpr; canvas.height = H * dpr;
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

const store = {
  get best() { return +(localStorage.getItem('breakout-best') || 0); },
  set best(v) { localStorage.setItem('breakout-best', v); },
  get muted() { return localStorage.getItem('breakout-muted') === '1'; },
  set muted(v) { localStorage.setItem('breakout-muted', v ? '1' : '0'); }
};
let actx = null, muted = store.muted;
function tone(f, dur, type, vol, slide) {
  if (muted) return;
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type || 'square'; o.frequency.setValueAtTime(f, actx.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), actx.currentTime + dur);
    g.gain.setValueAtTime(vol || .07, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(.001, actx.currentTime + dur);
    o.connect(g); g.connect(actx.destination); o.start(); o.stop(actx.currentTime + dur);
  } catch (e) {}
}
const sfx = {
  pad: () => tone(300, .05, 'square', .06),
  brick: () => tone(520, .06, 'square', .07),
  hard: () => tone(200, .08, 'square', .08),
  item: () => { tone(660, .08, 'sine', .09); setTimeout(() => tone(990, .12, 'sine', .09), 70); },
  laser: () => tone(880, .1, 'sawtooth', .07, -300),
  lose: () => tone(300, .3, 'sawtooth', .09, -200),
  win: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, .14, 'sine', .09), i * 100)),
  over: () => [400, 300, 200].forEach((f, i) => setTimeout(() => tone(f, .2, 'sine', .09), i * 140))
};

const BCOL = ['#ff5d5d', '#ff8c42', '#ffd93d', '#5ee66e', '#3a8dde', '#c86bff'];
// 关卡：街机 Arkanoid 风格 32 关 + 第 33 关 DOH Boss
// 字符：. 空，1-6 色砖（1血），H 银砖（2血），G 金砖（不可破坏），S 道具砖（必掉）
const LEVELS = [
  ['1111111111', '1111111111', '2222222222', '2222222222', '3333333333', '3333333333'], // 1 彩虹条
  ['1........1', '11......11', '111....111', '2222222222', '3333333333', '4444444444'], // 2 门洞
  ['....11....', '...1111...', '..112211..', '..111111..', '.11111111.', '1111111111'], // 3 金字塔
  ['H........H', 'HH......HH', 'HHH1111HHH', '..222222..', '..333333..', '...4444...'], // 4 银墙
  ['55..SS..55', '555SSSS555', '6666666666', '1111111111', '2222222222', 'H......H..'], // 5 道具
  ['.....11...', '....1111..', '...111111.', '..11111...', '.1111.....', '111.......'], // 6 斜线
  ['1111111111', '1........1', '1222222221', '1233333331', '1234444431', '1111111111'], // 7 回形
  ['H1H2H3H4H5', 'H1H2H3H4H5', '..........', '6666666666', '6666666666', '1111111111'], // 8 银柱
];
// 注：第8关占位行稍后由 ARK8 替换（保持数组规整）
const ARK_LEVELS_EXTRA = [
  ['..111111..', '.22222222.', '3333333333', 'H44444444H', 'HH555555HH', '...6666...'], // 9 梯形
  ['5.5.5.5.5.', '.6.6.6.6..', '1.1.1.1.1.', '.2.2.2.2..', '3.3.3.3.3.', '.4.4.4.4..'], // 10 网格点阵
  ['GGGGGGGGGG', 'G11111111G', 'G12222221G', 'G12333321G', 'G12344321G', 'G11111111G'], // 11 金框
  ['....SS....', '..111111..', '.11222111.', '.11111111.', '..111111..', '...1111...'], // 12 心形
  ['11......11', '111....111', '1111..1111', '2222222222', '3333333333', 'HHHSSSHHHH'], // 13 蝴蝶
  ['S12121212S', '2121212121', '1212121212', 'HHHHHHHHHH', '6666666666', '5555555555'], // 14 条纹+银河
  ['.....1....', '....111...', '...11111..', '..1111111.', '.111111111', '1111111111'], // 15 右斜坡
  ['3333333333', '3........3', '3.222222.3', '3.211112.3', '3.211112.3', '3333333333'], // 16 套娃
  ['H...11...H', 'H..1111..H', 'H.111111.H', 'H11111111H', '.22222222.', '..333333..'], // 17 王冠
  ['11H11H11HH', '22H22H22HH', '33H33H33HH', 'SSSSSSSSSS', '4444444444', '5555555555'], // 18 银柱阵
  ['.....11...', '....11....', '...11.....', '..11......', '.11.......', '11........'], // 19 左斜线
  ['6666666666', '6......6..', '6.555555..', '6.544445..', '6.544445..', '6......6..'], // 20 C形
  ['..SSSSSS..', '.11111111.', '1122222211', '1111111111', 'H22222222H', 'HH333333HH'], // 21 道具环
  ['1.2.3.4.5.', '6.1.2.3.4.', '5.6.1.2.3.', '4.5.6.1.2.', '3.4.5.6.1.', '2.3.4.5.6.'], // 22 彩虹点
  ['GG..11..GG', 'GG.1111.GG', '...1111...', '..112211..', '..111111..', '.11111111.'], // 23 金角
  ['1111111111', 'HHHHHHHHHH', '2222222222', 'HHHHHHHHHH', '3333333333', 'HHHHHHHHHH'], // 24 银条纹
  ['....11....', '...1111...', '..11SS11..', '..111111..', '.11222111.', '1111111111'], // 25 宝塔
  ['H1H2H3H4H5', '6H5H4H3H2H', '1S2S3S4S5S', 'HHHHHHHHHH', '6666666666', '1111111111'], // 26 终极阵
  ['.....1....', '....1.1...', '...1...1..', '..1.....1.', '.1.......1', '1........1'], // 27 稀疏V
  ['GGGGGGGGGG', 'G........G', 'G.222222.G', 'G.233332.G', 'G.233332.G', 'G........G'], // 28 金笼
  ['1111111111', '.22222222.', '..333333..', '...4444...', '....55....', '.....6....'], // 29 倒三角
  ['H11111111H', 'H12222221H', 'H12333321H', 'H12344321H', 'H11111111H', 'HHHHHHHHHH'], // 30 银框
  ['..1....1..', '.111..111.', '1111111111', '.11111111.', '..111111..', '...1111...'], // 31 双峰
  ['GGGGGGGGGG', 'G11111111G', 'G1HHHHHH1G', 'G1HSSSSH1G', 'G1HHHHHH1G', 'G11111111G'], // 32 金银堡
];
LEVELS.push(...ARK_LEVELS_EXTRA);
const TOTAL_STAGES = 33; // 32 关 + DOH Boss
const ITEMS = {
  wide: { icon: '↔️', name: '加长' }, laser: { icon: '🔫', name: '激光' },
  multi: { icon: '🌀', name: '多球' }, pierce: { icon: '💥', name: '穿透' },
  sticky: { icon: '🧲', name: '粘球' }, life: { icon: '❤️', name: '+命' }, slow: { icon: '🐢', name: '减速' }
};
const G = {
  state: 'menu', stage: 1, score: 0, lives: 3,
  pad: { x: W / 2, w: 90, laser: 0, sticky: 0 }, balls: [], bricks: [],
  items: [], lasers: [], parts: [], floats: [], keys: {}, laserCd: 0,
  msg: '', msgT: 0, clearFx: 0, doh: null, ebullets: []
};
function reset() {
  G.score = 0; G.stage = 1; G.lives = 3;
  loadStage(1);
}
function loadStage(s) {
  G.bricks = [];
  G.items = []; G.lasers = []; G.parts = [];
  G.doh = null; G.ebullets = [];
  G.pad = { x: W / 2, w: 90, laser: 0, sticky: 0 };
  G.laserCd = 0;
  const rows = LEVELS[(s - 1) % LEVELS.length];
  const bw = (W - 40) / 10, bh = 24;
  rows.forEach((line, r) => {
    for (let c = 0; c < 10; c++) {
      const ch = line[c] || '.';
      if (ch === '.') continue;
      const gold = ch === 'G';
      G.bricks.push({
        x: 20 + c * bw, y: 70 + r * (bh + 4), w: bw - 3, h: bh,
        hp: ch === 'H' ? 2 : 1, hard: ch === 'H', gold,
        color: gold ? 1 : ch === 'H' ? 5 : ch === 'S' ? 2 : (+ch - 1 + 6) % 6,
        forceItem: ch === 'S'
      });
    }
  });
  // 第 33 关：DOH Boss
  if (s === TOTAL_STAGES) spawnDOH();
  const speed = 330 + (s - 1) * 22;
  G.balls = [{ x: W / 2, y: PAD_Y - 10, vx: 0, vy: 0, r: 7, stuck: true, pierce: 0, speed }];
  G.msg = '第 ' + s + ' 关'; G.msgT = 1.6;
}
function launch() {
  for (const b of G.balls) {
    if (b.stuck) {
      b.stuck = false;
      const a = -Math.PI / 2 + (Math.random() - .5) * .6;
      b.vx = Math.cos(a) * b.speed; b.vy = Math.sin(a) * b.speed;
    }
  }
}
function norm(v, sp) {
  const m = Math.hypot(v.vx, v.vy) || 1;
  v.vx = v.vx / m * sp; v.vy = v.vy / m * sp;
}
function addBall(x, y, sp) {
  const a = -Math.PI / 2 + (Math.random() - .5) * 1.2;
  G.balls.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 7, stuck: false, pierce: 0, speed: sp });
}
function dropItem(x, y, force) {
  if (!force && Math.random() > .22) return;
  const keys = Object.keys(ITEMS);
  const k = force ? keys[Math.random() * keys.length | 0] : keys[Math.random() * keys.length | 0];
  G.items.push({ x, y, vy: 130, kind: k, t: 0 });
}
function applyItem(kind) {
  sfx.item();
  const names = { wide: '加长！', laser: '激光！', multi: '多球！', pierce: '穿透！', sticky: '粘球！', life: '+1 命！', slow: '减速！' };
  float(G.pad.x, PAD_Y - 50, ITEMS[kind].icon + names[kind]);
  if (kind === 'wide') G.pad.w = Math.min(170, G.pad.w + 40);
  else if (kind === 'laser') G.pad.laser = 12;
  else if (kind === 'multi') {
    const sp = G.balls[0] ? G.balls[0].speed : 340;
    const src = G.balls.filter(b => !b.stuck);
    for (let i = 0; i < 2; i++) {
      const s = src[i % Math.max(1, src.length)] || { x: G.pad.x, y: PAD_Y - 20 };
      addBall(s.x, s.y, sp);
    }
  }
  else if (kind === 'pierce') for (const b of G.balls) b.pierce = 8;
  else if (kind === 'sticky') G.pad.sticky = 15;
  else if (kind === 'life') G.lives++;
  else if (kind === 'slow') for (const b of G.balls) { b.speed = Math.max(240, b.speed * .8); norm(b, b.speed); }
}
function float(x, y, text) { G.floats.push({ x, y, text, age: 0 }); }
function burst(x, y, color) {
  for (let i = 0; i < 7; i++) {
    const a = Math.random() * 6.28, sp = 60 + Math.random() * 180;
    G.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, age: 0, life: .45, c: color });
  }
}
function hurtBrick(br, ball) {
  if (br.gold) { sfx.hard(); burst(ball.x, ball.y, '#ffd93d'); return; } // 金砖不可破坏
  br.hp--;
  if (br.hp <= 0) {
    G.bricks.splice(G.bricks.indexOf(br), 1);
    const pts = (br.hard ? 100 : 50) * G.stage;
    G.score += pts;
    float(br.x + br.w / 2, br.y, '+' + pts);
    burst(br.x + br.w / 2, br.y + br.h / 2, BCOL[br.color]);
    dropItem(br.x + br.w / 2, br.y + br.h, br.forceItem);
    sfx.brick();
  } else {
    sfx.hard();
    burst(ball.x, ball.y, '#fff');
  }
}
function update(dt) {
  if (G.state !== 'play') return;
  if (G.msgT > 0) G.msgT -= dt;
  if (G.pad.laser > 0) G.pad.laser -= dt;
  if (G.pad.sticky > 0) G.pad.sticky -= dt;
  G.laserCd -= dt;
  // 挡板
  const spd = 460;
  if (G.keys.left) G.pad.x -= spd * dt;
  if (G.keys.right) G.pad.x += spd * dt;
  G.pad.x = Math.max(G.pad.w / 2 + 4, Math.min(W - G.pad.w / 2 - 4, G.pad.x));
  // 激光
  if (G.pad.laser > 0 && (G.keys.fire || G.autoLaser)) {
    if (G.laserCd <= 0) {
      G.laserCd = .25;
      G.lasers.push({ x: G.pad.x - G.pad.w / 2 + 8, y: PAD_Y - 14, t: 0 });
      G.lasers.push({ x: G.pad.x + G.pad.w / 2 - 8, y: PAD_Y - 14, t: 0 });
      sfx.laser();
    }
  }
  for (let i = G.lasers.length - 1; i >= 0; i--) {
    const l = G.lasers[i];
    l.y -= 640 * dt; l.t += dt;
    if (l.y < 0) { G.lasers.splice(i, 1); continue; }
    if (G.doh && l.x > G.doh.x - G.doh.w / 2 && l.x < G.doh.x + G.doh.w / 2 &&
        l.y > G.doh.y - G.doh.h / 2 && l.y < G.doh.y + G.doh.h / 2) {
      G.lasers.splice(i, 1);
      G.doh.hp--;
      burst(l.x, l.y, '#5ee6ff');
      if (G.doh.hp <= 0) {
        G.score += 100000;
        G.doh = null; G.ebullets = [];
        sfx.win();
        winAll();
        return;
      }
      continue;
    }
    for (const br of G.bricks.slice()) {
      if (l.x > br.x && l.x < br.x + br.w && l.y > br.y && l.y < br.y + br.h) {
        hurtBrick(br, { x: l.x, y: l.y });
        G.lasers.splice(i, 1);
        break;
      }
    }
  }
  // 球
  for (let i = G.balls.length - 1; i >= 0; i--) {
    const b = G.balls[i];
    if (b.stuck) { b.x = G.pad.x; b.y = PAD_Y - 10; continue; }
    if (b.pierce > 0) b.pierce -= dt;
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (b.x < b.r + 2) { b.x = b.r + 2; b.vx = Math.abs(b.vx); }
    if (b.x > W - b.r - 2) { b.x = W - b.r - 2; b.vx = -Math.abs(b.vx); }
    if (b.y < b.r + 2) { b.y = b.r + 2; b.vy = Math.abs(b.vy); }
    // 挡板碰撞（落点决定角度：偏离中心越大越斜）
    if (b.vy > 0 && b.y + b.r >= PAD_Y - 8 && b.y + b.r <= PAD_Y + 14 &&
        Math.abs(b.x - G.pad.x) <= G.pad.w / 2 + b.r) {
      const off = (b.x - G.pad.x) / (G.pad.w / 2);
      const a = -Math.PI / 2 + off * 1.05;
      const sp = Math.min(b.speed + 4, 560);
      b.speed = sp;
      b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp;
      b.y = PAD_Y - 8 - b.r;
      sfx.pad();
      if (G.pad.sticky > 0) { b.stuck = true; }
      continue;
    }
    // 砖块碰撞（找最近的一块，按侵入轴反弹）
    let hit = null;
    for (const br of G.bricks) {
      if (b.x + b.r > br.x && b.x - b.r < br.x + br.w && b.y + b.r > br.y && b.y - b.r < br.y + br.h) { hit = br; break; }
    }
    if (hit) {
      const piercing = b.pierce > 0;
      if (!piercing) {
        const ox = Math.min(b.x + b.r - hit.x, hit.x + hit.w - (b.x - b.r));
        const oy = Math.min(b.y + b.r - hit.y, hit.y + hit.h - (b.y - b.r));
        if (ox < oy) { b.vx = -b.vx; b.x += b.vx > 0 ? ox : -ox; }
        else { b.vy = -b.vy; b.y += b.vy > 0 ? oy : -oy; }
      }
      hurtBrick(hit, b);
      continue;
    }
    if (b.y > H + 20) {
      G.balls.splice(i, 1);
      if (!G.balls.length) {
        loseLife();
        if (G.state !== 'play') return;
      }
    }
  }
  // 道具
  for (let i = G.items.length - 1; i >= 0; i--) {
    const it = G.items[i];
    it.y += it.vy * dt; it.t += dt;
    if (it.y > H + 20) { G.items.splice(i, 1); continue; }
    if (it.y > PAD_Y - 14 && it.y < PAD_Y + 14 && Math.abs(it.x - G.pad.x) < G.pad.w / 2 + 12) {
      applyItem(it.kind);
      G.items.splice(i, 1);
    }
  }
  for (let i = G.parts.length - 1; i >= 0; i--) {
    const p = G.parts[i];
    p.age += dt;
    if (p.age > p.life) { G.parts.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 500 * dt;
  }
  for (let i = G.floats.length - 1; i >= 0; i--) {
    const f = G.floats[i];
    f.age += dt; f.y -= 46 * dt;
    if (f.age > 1) G.floats.splice(i, 1);
  }
  if (!G.bricks.some(b => !b.gold) && !G.doh) {
    G.clearFx += dt;
    if (G.clearFx > 1) {
      G.clearFx = 0;
      if (G.stage >= TOTAL_STAGES) { winAll(); return; }
      G.stage++;
      loadStage(G.stage);
    }
  } else G.clearFx = 0;
  updateDOH(dt);
}
// ---------- DOH Boss（第 33 关） ----------
function spawnDOH() {
  G.bricks = [];
  G.doh = { x: W / 2, y: 150, w: 150, h: 70, hp: 12, maxHp: 12, t: 0, dir: 1, fireT: 2 };
  G.ebullets = [];
  G.msg = '最终决战 · DOH'; G.msgT = 2;
}
function updateDOH(dt) {
  const d = G.doh;
  if (!d) return;
  d.t += dt;
  d.x += d.dir * (40 + G.stage) * dt;
  if (d.x < 100) { d.x = 100; d.dir = 1; }
  if (d.x > W - 100) { d.x = W - 100; d.dir = -1; }
  d.fireT -= dt;
  if (d.fireT <= 0) {
    d.fireT = 1.6;
    for (const a of [-.3, 0, .3]) {
      G.ebullets.push({ x: d.x, y: d.y + d.h / 2, vx: Math.sin(a) * 120, vy: 200, r: 6, t: 0 });
    }
    tone(150, .2, 'sawtooth', .08, -50);
  }
  for (let i = G.ebullets.length - 1; i >= 0; i--) {
    const b = G.ebullets[i];
    b.x += b.vx * dt; b.y += b.vy * dt; b.t += dt;
    if (b.y > H + 20 || b.t > 6) { G.ebullets.splice(i, 1); continue; }
    if (Math.abs(b.x - G.pad.x) < G.pad.w / 2 && Math.abs(b.y - PAD_Y) < 12) {
      G.ebullets.splice(i, 1);
      loseLife();
    }
  }
  // 球撞 DOH
  for (const b of G.balls) {
    if (b.stuck) continue;
    if (b.x > d.x - d.w / 2 && b.x < d.x + d.w / 2 && b.y > d.y - d.h / 2 && b.y < d.y + d.h / 2) {
      d.hp--;
      burst(b.x, b.y, '#ff3d68');
      sfx.brick();
      float(d.x, d.y - d.h / 2 - 10, 'DOH -' + 1 + ' (' + Math.max(0, d.hp) + '/12)');
      b.vy = Math.abs(b.vy);
      if (d.hp <= 0) {
        for (let k = 0; k < 40; k++) burst(d.x + (Math.random() - .5) * d.w, d.y + (Math.random() - .5) * d.h, ['#ff3d68', '#ffd93d', '#fff'][k % 3]);
        G.score += 100000;
        G.doh = null;
        G.ebullets = [];
        sfx.win();
        winAll();
        return;
      }
      break;
    }
  }
}
function drawDOH() {
  const d = G.doh;
  if (!d) return;
  const pulse = 1 + Math.sin(d.t * 4) * .04;
  ctx.save();
  ctx.translate(d.x, d.y); ctx.scale(pulse, pulse);
  const g = ctx.createRadialGradient(0, -10, 10, 0, 0, 90);
  g.addColorStop(0, '#ff8c42'); g.addColorStop(.6, '#c81e5b'); g.addColorStop(1, '#5e0f2e');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(0, 0, d.w / 2, d.h / 2, 0, 0, 7); ctx.fill();
  ctx.strokeStyle = '#ffd93d'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.ellipse(0, 0, d.w / 2, d.h / 2, 0, 0, 7); ctx.stroke();
  // 眼睛
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(-28, -6, 14, 0, 7); ctx.arc(28, -6, 14, 0, 7); ctx.fill();
  ctx.fillStyle = '#e33';
  ctx.beginPath(); ctx.arc(-28 + Math.sin(d.t * 2) * 4, -6, 6, 0, 7); ctx.arc(28 + Math.sin(d.t * 2) * 4, -6, 6, 0, 7); ctx.fill();
  ctx.fillStyle = '#1a0510';
  ctx.beginPath(); ctx.arc(-28 + Math.sin(d.t * 2) * 4, -6, 2.5, 0, 7); ctx.arc(28 + Math.sin(d.t * 2) * 4, -6, 2.5, 0, 7); ctx.fill();
  // 血条
  ctx.fillStyle = 'rgba(0,0,0,.5)';
  ctx.fillRect(-d.w / 2, -d.h / 2 - 16, d.w, 8);
  ctx.fillStyle = '#5ee66e';
  ctx.fillRect(-d.w / 2, -d.h / 2 - 16, d.w * Math.max(0, d.hp) / d.maxHp, 8);
  ctx.restore();
  ctx.fillStyle = '#ff5d8c'; ctx.font = '900 16px system-ui'; ctx.textAlign = 'center';
  ctx.fillText('👹 DOH', d.x, d.y - d.h / 2 - 22);
  for (const b of G.ebullets) {
    ctx.fillStyle = '#ff3d68';
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r / 2, 0, 7); ctx.fill();
  }
}
function loseLife() {
  G.lives--;
  sfx.lose();
  G.pad.w = 90;
  if (G.lives <= 0) { gameOver(); return; }
  const sp = 330 + (G.stage - 1) * 22;
  G.balls = [{ x: G.pad.x, y: PAD_Y - 10, vx: 0, vy: 0, r: 7, stuck: true, pierce: 0, speed: sp }];
}
function winAll() {
  G.state = 'clear';
  if (G.score > store.best) store.best = G.score;
  sfx.win();
  $('clear-stats').innerHTML = '<div>👹 DOH 已击败！33 关全部通关！</div><div>🏆 总分 <b>' + G.score + '</b></div><div>❤️ 剩余生命 <b>×' + G.lives + '</b></div>';
  setTimeout(() => showScreen('clear'), 300);
}
function gameOver() {
  if (G.state !== 'play') return;
  G.state = 'over';
  if (G.score > store.best) store.best = G.score;
  sfx.over();
  $('final-score').textContent = G.score;
  $('final-stage').textContent = G.stage;
  setTimeout(() => showScreen('over'), 400);
}
function showScreen(name) {
  for (const k of ['screen-menu', 'screen-pause', 'screen-over', 'screen-clear'])
    $(k).classList.toggle('hidden', k !== 'screen-' + name);
  if (!name) for (const k of ['screen-menu', 'screen-pause', 'screen-over', 'screen-clear']) $(k).classList.add('hidden');
}
function startGame() {
  reset();
  G.state = 'play';
  showScreen(null);
  $('menu-best').textContent = '🏆 历史最高：' + Math.max(store.best, G.score);
}
function togglePause() {
  if (G.state === 'play') { G.state = 'pause'; showScreen('pause'); }
  else if (G.state === 'pause') { G.state = 'play'; showScreen(null); }
}

canvas.addEventListener('pointermove', e => {
  const r = canvas.getBoundingClientRect();
  G.pad.x = (e.clientX - r.left) / r.width * W;
});
canvas.addEventListener('pointerdown', e => {
  if (G.state === 'play') {
    if (G.balls.some(b => b.stuck)) launch();
    else if (G.pad.laser > 0) { G.autoLaser = true; setTimeout(() => G.autoLaser = false, 120); }
  }
  else if (G.state === 'pause') togglePause();
});
window.addEventListener('keydown', e => {
  if (['ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  if (e.code === 'ArrowLeft') G.keys.left = true;
  else if (e.code === 'ArrowRight') G.keys.right = true;
  else if (e.code === 'Space') {
    if (G.state === 'play') {
      if (G.balls.some(b => b.stuck)) launch();
      else G.keys.fire = true;
    }
    else if (G.state === 'menu') startGame();
  }
  else if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
  else if (e.code === 'KeyM') toggleMute();
  else if (e.code === 'KeyR' || e.code === 'Enter') { if (G.state === 'over') startGame(); else if (G.state === 'menu') startGame(); }
});
window.addEventListener('keyup', e => {
  if (e.code === 'ArrowLeft') G.keys.left = false;
  else if (e.code === 'ArrowRight') G.keys.right = false;
  else if (e.code === 'Space') G.keys.fire = false;
});
$('btn-start').onclick = () => startGame();
$('btn-retry').onclick = () => startGame();
$('btn-again').onclick = () => startGame();
$('btn-menu').onclick = () => { G.state = 'menu'; showScreen('menu'); };
$('btn-menu2').onclick = () => { G.state = 'menu'; showScreen('menu'); };
$('btn-resume').onclick = () => togglePause();
$('btn-quit').onclick = () => { G.state = 'menu'; showScreen('menu'); };
function toggleMute() {
  muted = !muted; store.muted = muted;
  $('btn-mute').textContent = muted ? '🔇' : '🔊';
}
$('btn-mute').onclick = toggleMute;
$('btn-mute').textContent = muted ? '🔇' : '🔊';
$('menu-best').textContent = '🏆 历史最高：' + store.best;

function render() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#141b45'); g.addColorStop(1, '#070a1c');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,.08)';
  ctx.fillRect(0, 0, 4, H); ctx.fillRect(W - 4, 0, 4, H); ctx.fillRect(0, 0, W, 4);
  if (G.state === 'menu') return;
  for (const br of G.bricks) {
    if (br.gold) {
      const gg = ctx.createLinearGradient(br.x, br.y, br.x, br.y + br.h);
      gg.addColorStop(0, '#ffe98a'); gg.addColorStop(.5, '#d4a017'); gg.addColorStop(1, '#8a6508');
      ctx.fillStyle = gg;
      ctx.fillRect(br.x, br.y, br.w, br.h);
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      ctx.fillRect(br.x, br.y, br.w, 3);
      ctx.fillStyle = '#5e4200'; ctx.font = '900 11px system-ui'; ctx.textAlign = 'center';
      ctx.fillText('◆', br.x + br.w / 2, br.y + 16);
      continue;
    }
    ctx.fillStyle = BCOL[br.color];
    ctx.fillRect(br.x, br.y, br.w, br.h);
    ctx.fillStyle = 'rgba(255,255,255,.4)';
    ctx.fillRect(br.x, br.y, br.w, 4);
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    ctx.fillRect(br.x, br.y + br.h - 4, br.w, 4);
    if (br.hard) {
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      ctx.fillRect(br.x + br.w / 2 - 1, br.y + 3, 2, br.h - 6);
      if (br.hp > 1) { ctx.fillStyle = '#fff'; ctx.font = '900 12px system-ui'; ctx.textAlign = 'center'; ctx.fillText('◆', br.x + br.w / 2, br.y + 16); }
    }
    if (br.forceItem) { ctx.fillStyle = '#fff'; ctx.font = '12px system-ui'; ctx.textAlign = 'center'; ctx.fillText('?', br.x + br.w / 2, br.y + 16); }
  }
  // 挡板
  const pg = ctx.createLinearGradient(0, PAD_Y - 8, 0, PAD_Y + 8);
  pg.addColorStop(0, '#ffe45e'); pg.addColorStop(1, '#ff8c42');
  ctx.fillStyle = pg;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(G.pad.x - G.pad.w / 2, PAD_Y - 8, G.pad.w, 16, 8);
  else ctx.rect(G.pad.x - G.pad.w / 2, PAD_Y - 8, G.pad.w, 16);
  ctx.fill();
  if (G.pad.laser > 0) {
    ctx.fillStyle = '#3a8dde';
    ctx.fillRect(G.pad.x - G.pad.w / 2 + 4, PAD_Y - 16, 8, 8);
    ctx.fillRect(G.pad.x + G.pad.w / 2 - 12, PAD_Y - 16, 8, 8);
  }
  for (const l of G.lasers) {
    ctx.fillStyle = '#5ee6ff';
    ctx.fillRect(l.x - 2, l.y - 10, 4, 14);
  }
  for (const b of G.balls) {
    const bg = ctx.createRadialGradient(b.x - 2, b.y - 2, 1, b.x, b.y, b.r);
    bg.addColorStop(0, '#fff'); bg.addColorStop(.5, '#ffd93d'); bg.addColorStop(1, '#ff8c42');
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.fill();
  }
  for (const it of G.items) {
    ctx.fillStyle = 'rgba(0,0,0,.5)';
    ctx.beginPath(); ctx.arc(it.x, it.y, 13, 0, 7); ctx.fill();
    ctx.font = '15px serif'; ctx.textAlign = 'center';
    ctx.fillText(ITEMS[it.kind].icon, it.x, it.y + 5);
  }
  drawDOH();
  for (const p of G.parts) {
    ctx.globalAlpha = Math.max(0, 1 - p.age / p.life);
    ctx.fillStyle = p.c;
    ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center';
  for (const f of G.floats) {
    ctx.globalAlpha = Math.max(0, 1 - f.age);
    ctx.font = '900 18px system-ui';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.6)';
    ctx.strokeText(f.text, f.x, f.y);
    ctx.fillStyle = '#ffd93d';
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(0,0,0,.45)';
  ctx.fillRect(0, 0, W, 30);
  ctx.fillStyle = '#fff'; ctx.font = '900 14px system-ui'; ctx.textAlign = 'left';
  ctx.fillText('SCORE ' + G.score, 10, 20);
  ctx.textAlign = 'center';
  ctx.fillText('STAGE ' + G.stage + '  ❤️×' + G.lives, W / 2, 20);
  ctx.textAlign = 'right';
  ctx.fillText('BEST ' + Math.max(store.best, G.score), W - 10, 20);
  if (G.msgT > 0) {
    ctx.font = '900 30px system-ui'; ctx.textAlign = 'center';
    ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,.7)';
    ctx.strokeText(G.msg, W / 2, H / 2);
    ctx.fillStyle = '#ffd93d';
    ctx.fillText(G.msg, W / 2, H / 2);
  }
}
let last = performance.now();
function loop(now) {
  const dt = Math.min(((now || performance.now()) - last) / 1000, .033);
  last = now || performance.now();
  update(dt);
  render();
  requestAnimationFrame(loop);
}
reset();
requestAnimationFrame(t => { last = t; requestAnimationFrame(loop); });
window.__game = G;
window.__gameErrors = [];
window.addEventListener('error', e => window.__gameErrors.push(String(e.message)));
G._load = loadStage; G._start = startGame; G._launch = launch; G._apply = applyItem; G._levels = LEVELS;
})();
