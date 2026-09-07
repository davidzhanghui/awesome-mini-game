(() => {
const STR = window.GAME_STR || { zh: {}, en: {} };
const T = (k, ...a) => AMG.tf(STR, k, ...a);
const W = 420, H = 640, GROUND_H = 88;
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const $ = id => document.getElementById(id);
const screens = { menu: $('screen-menu'), ready: $('screen-ready'), pause: $('screen-pause'), over: $('screen-over') };
const hud = $('hud'), hudScore = $('hud-score'), hudBest = $('hud-best');

const store = {
  get best() { return +(localStorage.getItem('flappy-best') || 0); },
  set best(v) { localStorage.setItem('flappy-best', v); },
  get muted() { return localStorage.getItem('flappy-muted') === '1'; },
  set muted(v) { localStorage.setItem('flappy-muted', v ? '1' : '0'); },
  get night() { return localStorage.getItem('flappy-night') === '1'; },
  set night(v) { localStorage.setItem('flappy-night', v ? '1' : '0'); }
};

function fitCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = W * dpr; canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
fitCanvas();
window.addEventListener('resize', fitCanvas);

// ---------- Audio (WebAudio 合成，无外部资源) ----------
let actx = null, muted = store.muted;
function ac() {
  if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
  if (actx.state === 'suspended') actx.resume();
  return actx;
}
function tone(freq, dur, type = 'sine', vol = .18, slide = 0) {
  if (muted) return;
  try {
    const a = ac(), o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, a.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), a.currentTime + dur);
    g.gain.setValueAtTime(vol, a.currentTime);
    g.gain.exponentialRampToValueAtTime(.001, a.currentTime + dur);
    o.connect(g).connect(a.destination); o.start(); o.stop(a.currentTime + dur);
  } catch (e) {}
}
const sfx = {
  flap: () => tone(420, .12, 'square', .08, 260),
  score: () => { tone(880, .1, 'sine', .16); setTimeout(() => tone(1320, .16, 'sine', .16), 90); },
  hit: () => tone(160, .3, 'sawtooth', .22, -100),
  die: () => tone(600, .5, 'triangle', .14, -450),
  swoosh: () => tone(300, .18, 'sine', .1, 200),
  click: () => tone(700, .07, 'sine', .12),
};

// ---------- 游戏状态 ----------
const GRAV = 1050, MAX_FALL = 330, FLAP_VY = -300, DIE_VY = -280;
function makeBird(x, tint) {
  return { x, y: H * .44, vy: 0, r: 14, rot: 0, wing: Math.random() * 3, alive: true, tint };
}
const G = {
  state: 'menu', night: store.night, mode: 'solo',
  t: 0, score: 0, best: store.best, newBest: false,
  speed: 165, shake: 0, flash: 0,
  birds: [makeBird(110, 'yellow')],
  pipes: [], particles: [], floats: [], clouds: [], stars: [],
  groundX: 0, sincePipe: 0, overTimer: -1,
};
Object.defineProperty(G, 'bird', { get() { return G.birds[0]; } });

function difficulty() {
  const s = G.mode === 'duo' ? Math.max(G.birds[0].score, G.birds[1].score) : G.score;
  return {
    speed: Math.min(165 + s * 4.2, 300),
    gap: Math.max(168 - s * 1.6, 118),
  };
}

function reset(world = true) {
  G.score = 0; G.newBest = false; G.shake = 0; G.flash = 0; G.overTimer = -1;
  if (G.mode === 'duo') {
    G.birds = [makeBird(80, 'yellow'), makeBird(150, 'blue')];
    G.birds.forEach(b => b.score = 0);
  } else {
    G.birds = [makeBird(110, 'yellow')];
  }
  G.pipes = []; G.particles = []; G.floats = [];
  G.sincePipe = 0;
  if (world) { G.groundX = 0; }
  updateHUD();
}

function setScreen(name) {
  for (const k in screens) screens[k].classList.toggle('hidden', k !== name);
  if (!name) for (const k in screens) screens[k].classList.add('hidden');
  hud.classList.toggle('hidden', !(name === null && (G.state === 'playing' || G.state === 'paused')) && name !== 'ready');
  $('btn-pause').classList.toggle('hidden', G.state !== 'playing');
}

function show(name) {
  if (name === 'menu') { G.state = 'menu'; reset(); $('menu-best').textContent = T('bestLine', G.best); setScreen('menu'); }
  if (name === 'ready') {
    G.state = 'ready'; reset(); setScreen('ready'); sfx.swoosh();
    $('ready-tip').textContent = G.mode === 'duo' ? T('readyDuo') : T('readySolo');
  }
  if (name === 'over') {
    G.state = 'over';
    if (G.mode === 'duo') {
      const [a, b] = [G.birds[0].score || 0, G.birds[1].score || 0];
      $('over-title').textContent = T('duelOver');
      $('medal').textContent = a === b ? '🤝' : '🏆';
      $('over-solo').classList.add('hidden');
      $('over-duo').classList.remove('hidden');
      $('final-p1').textContent = a;
      $('final-p2').textContent = b;
      $('duel-result').textContent = a === b ? T('draw') : (a > b ? T('p1Win') : T('p2Win'));
      const top = Math.max(a, b);
      if (top > G.best) { G.best = top; store.best = top; G.newBest = true; }
    } else {
      const isNew = G.score > G.best;
      G.newBest = isNew;
      if (isNew) { G.best = G.score; store.best = G.best; }
      $('over-title').textContent = 'GAME OVER';
      $('medal').textContent = G.score >= 40 ? '💎' : G.score >= 30 ? '🥇' : G.score >= 20 ? '🥈' : G.score >= 10 ? '🥉' : '🐣';
      $('over-solo').classList.remove('hidden');
      $('over-duo').classList.add('hidden');
      $('final-score').textContent = G.score;
      $('final-best').textContent = G.best;
      $('new-record').classList.toggle('hidden', !isNew);
    }
    G.overTimer = .65;
  }
}

function startPlay() {
  G.state = 'playing';
  setScreen(null);
  hud.classList.remove('hidden');
  $('btn-pause').classList.remove('hidden');
}

function flapBird(b) {
  b.vy = FLAP_VY;
  b.wing = 1;
  sfx.flap();
  for (let i = 0; i < 5; i++) spawnParticle(b.x - 12, b.y + 8, 'trail');
}

function flap(which) {
  if (G.state === 'menu') { show('ready'); return; }
  if (G.state === 'ready') { startPlay(); }
  if (G.state === 'over' || G.state === 'paused') return;
  if (G.state !== 'playing') return;
  if (G.mode === 'duo') {
    const b = G.birds[which || 0];
    if (b && b.alive) flapBird(b);
    return;
  }
  flapBird(G.birds[0]);
}

function togglePause() {
  if (G.state === 'playing') { G.state = 'paused'; setScreen('pause'); hud.classList.remove('hidden'); }
  else if (G.state === 'paused') { G.state = 'playing'; setScreen(null); hud.classList.remove('hidden'); $('btn-pause').classList.remove('hidden'); }
}

// ---------- 粒子 / 云 / 星 ----------
function spawnParticle(x, y, kind) {
  G.particles.push({
    kind, x, y,
    vx: kind === 'boom' ? (Math.random() - .5) * 320 : -G.speed * .5 + (Math.random() - .5) * 60,
    vy: kind === 'boom' ? (Math.random() - .7) * 320 : (Math.random() - .5) * 80,
    life: kind === 'boom' ? .9 : .55, age: 0,
    r: 2 + Math.random() * (kind === 'boom' ? 5 : 3),
    c: kind === 'boom' ? ['#ffd93d', '#ff8c42', '#ff5d5d'][Math.random() * 3 | 0] : 'rgba(255,255,255,.85)',
  });
}
function spawnFloat(x, y, text) { G.floats.push({ x, y, text, age: 0 }); }

for (let i = 0; i < 7; i++) G.clouds.push({ x: Math.random() * W, y: 30 + Math.random() * 260, s: .5 + Math.random() * .9, v: 8 + Math.random() * 14 });
for (let i = 0; i < 70; i++) G.stars.push({ x: Math.random() * W, y: Math.random() * H * .7, r: Math.random() * 1.6 + .4, tw: Math.random() * 6.28 });

// ---------- 更新 ----------
let last = performance.now();
function loop(now) {
  let dt = Math.min((now - last) / 1000, .033);
  last = now;
  update(dt);
  render();
  requestAnimationFrame(loop);
}

function update(dt) {
  G.t += dt;
  const d = difficulty();
  G.speed = d.speed;

  for (const c of G.clouds) { c.x -= c.v * dt; if (c.x < -90) { c.x = W + 90; c.y = 30 + Math.random() * 260; } }

  if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 26);
  if (G.flash > 0) G.flash = Math.max(0, G.flash - dt * 2.2);

  // 粒子
  for (let i = G.particles.length - 1; i >= 0; i--) {
    const p = G.particles[i];
    p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 500 * dt;
    if (p.age > p.life) G.particles.splice(i, 1);
  }
  for (let i = G.floats.length - 1; i >= 0; i--) {
    const f = G.floats[i]; f.age += dt; f.y -= 55 * dt;
    if (f.age > .9) G.floats.splice(i, 1);
  }

  if (G.state === 'menu' || G.state === 'ready') {
    G.groundX = (G.groundX + 120 * dt) % 48;
    for (const b of G.birds) {
      b.y = H * .44 + Math.sin(G.t * 3.2) * 10;
      b.rot = Math.sin(G.t * 3.2 + 1) * .08;
      b.wing += dt * 10;
    }
    return;
  }
  if (G.state === 'paused') return;
  if (G.state === 'over') {
    // 结算面板延迟弹出（替代 setTimeout，保证暂停时不穿透）
    if (G.overTimer > 0) {
      G.overTimer -= dt;
      if (G.overTimer <= 0) { G.overTimer = -1; setScreen('over'); }
    }
    for (const b of G.birds) {
      if (!b.alive && b.y + b.r < H - GROUND_H) {
        b.vy = Math.min(b.vy + 900 * dt, 500);
        b.y = Math.min(b.y + b.vy * dt, H - GROUND_H - b.r);
        b.rot = Math.min(1.5, b.rot + dt * 4);
      }
    }
    return;
  }
  if (G.state !== 'playing') return;

  // 物理（逐只）
  for (const b of G.birds) {
    if (!b.alive) continue;
    b.vy = Math.min(b.vy + GRAV * dt, MAX_FALL);
    b.y += b.vy * dt;
    b.wing += dt * (b.vy < 0 ? 22 : 9);
    const targetRot = b.vy < 0 ? -.38 : Math.min(1.35, b.vy / 600);
    b.rot += (targetRot - b.rot) * Math.min(1, dt * 10);
  }
  G.groundX = (G.groundX + G.speed * dt) % 48;

  // 水管生成
  G.sincePipe += dt;
  const interval = 1.52 * (165 / G.speed);
  if ((G.pipes.length === 0 && G.state === 'playing') || G.sincePipe > interval) {
    G.sincePipe = 0;
    const gap = d.gap;
    const margin = 90;
    const cy = margin + gap / 2 + Math.random() * (H - GROUND_H - margin * 2 - gap);
    G.pipes.push({ x: W + 20, gapY: cy, gap, scored: false, wob: Math.random() * 6.28 });
  }
  for (const p of G.pipes) p.x -= G.speed * dt;
  if (G.pipes.length && G.pipes[0].x < -90) G.pipes.shift();

  // 得分（水管经过哪只鸟、哪只得分，各计各的）
  for (const p of G.pipes) {
    G.birds.forEach((b, i) => {
      if (!b.alive || p['s' + i]) return;
      if (p.x + 68 < b.x - b.r) {
        p['s' + i] = true;
        b.score = (b.score || 0) + 1;
        spawnFloat(b.x + 10, b.y - 34, '+1');
        for (let k = 0; k < 8; k++) spawnParticle(p.x + 68, p.gapY, 'trail');
        G.score = G.mode === 'duo' ? Math.max(...G.birds.map(x => x.score || 0)) : (G.birds[0].score || 0);
        updateHUD(); sfx.score();
      }
    });
  }

  // 碰撞（逐只判定，撞到的先死；都死了才结算）
  for (const b of G.birds) {
    if (!b.alive) continue;
    if (b.y - b.r <= 0) { b.y = b.r; b.vy = Math.max(b.vy, 0); }
    if (b.y + b.r >= H - GROUND_H) { b.y = H - GROUND_H - b.r; killBird(b, true); continue; }
    for (const p of G.pipes) {
      if (b.x + b.r > p.x && b.x - b.r < p.x + 68) {
        const topB = p.gapY - p.gap / 2, botT = p.gapY + p.gap / 2;
        if (b.y - b.r < topB || b.y + b.r > botT) { killBird(b, false); break; }
      }
    }
  }
  if (G.birds.every(b => !b.alive)) { show('over'); }
}

function killBird(b, hitGround) {
  b.alive = false;
  b.score = b.score || 0;
  G.shake = 12; G.flash = 1;
  sfx.hit();
  updateHUD();
  for (let i = 0; i < 26; i++) spawnParticle(b.x, b.y, 'boom');
  if (!hitGround) { b.vy = DIE_VY; setTimeout(() => sfx.die(), 120); }
}

function die(hitGround) {
  killBird(G.birds[0], hitGround);
  show('over');
}

function updateHUD() {
  if (G.mode === 'duo' && G.birds.length > 1) {
    $('hud-score').classList.add('hidden');
    $('hud-best').classList.add('hidden');
    $('hud-duo').classList.remove('hidden');
    $('hud-p1').textContent = G.birds[0].score || 0;
    $('hud-p2').textContent = G.birds[1].score || 0;
    $('hud-p1').parentElement.classList.toggle('dead', !G.birds[0].alive && G.state === 'playing');
    $('hud-p2').parentElement.classList.toggle('dead', !G.birds[1].alive && G.state === 'playing');
  } else {
    $('hud-score').classList.remove('hidden');
    $('hud-best').classList.remove('hidden');
    $('hud-duo').classList.add('hidden');
    hudScore.textContent = G.score;
    hudBest.textContent = `BEST ${Math.max(G.best, G.score)}`;
  }
}

// ---------- 绘制 ----------
function rr(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function sky() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  if (G.night) {
    g.addColorStop(0, '#060a24'); g.addColorStop(.55, '#101a4a'); g.addColorStop(1, '#2a2a5e');
  } else {
    g.addColorStop(0, '#3fb6ff'); g.addColorStop(.55, '#7fd8f7'); g.addColorStop(1, '#c9f2e8');
  }
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  if (G.night) {
    for (const s of G.stars) {
      ctx.globalAlpha = .4 + .6 * Math.abs(Math.sin(G.t * 2 + s.tw));
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#f4f1de';
    ctx.beginPath(); ctx.arc(W - 70, 90, 26, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(6,10,36,.9)';
    ctx.beginPath(); ctx.arc(W - 60, 82, 22, 0, 7); ctx.fill();
  } else {
    ctx.fillStyle = 'rgba(255,244,180,.9)';
    ctx.beginPath(); ctx.arc(W - 72, 92, 30, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.5)';
    ctx.beginPath(); ctx.arc(W - 72, 92, 42, 0, 7); ctx.fill();
  }
}

function clouds() {
  ctx.fillStyle = G.night ? 'rgba(40,50,110,.8)' : 'rgba(255,255,255,.92)';
  for (const c of G.clouds) {
    const { x, y, s } = c;
    ctx.beginPath();
    ctx.arc(x, y, 20 * s, 0, 7); ctx.arc(x + 22 * s, y - 8 * s, 24 * s, 0, 7);
    ctx.arc(x + 48 * s, y, 20 * s, 0, 7); ctx.arc(x + 24 * s, y + 8 * s, 22 * s, 0, 7);
    ctx.fill();
  }
}

function hills() {
  ctx.fillStyle = G.night ? '#1c2450' : '#8fd694';
  ctx.beginPath(); ctx.moveTo(0, H - GROUND_H);
  for (let x = 0; x <= W; x += 10) ctx.lineTo(x, H - GROUND_H - 26 - Math.sin((x + G.t * 20) * .02) * 14 - Math.sin(x * .05) * 8);
  ctx.lineTo(W, H - GROUND_H); ctx.closePath(); ctx.fill();
  ctx.fillStyle = G.night ? 'rgba(255,255,255,.06)' : 'rgba(255,255,255,.35)';
  ctx.beginPath(); ctx.moveTo(0, H - GROUND_H);
  for (let x = 0; x <= W; x += 10) ctx.lineTo(x, H - GROUND_H - 60 - Math.sin((x + 200 + G.t * 12) * .015) * 18);
  ctx.lineTo(W, H - GROUND_H); ctx.closePath(); ctx.fill();
}

function pipe(x, y, h, isTop) {
  const w = 68;
  const grad = ctx.createLinearGradient(x, 0, x + w, 0);
  grad.addColorStop(0, '#3f9e2f'); grad.addColorStop(.25, '#6fe05e');
  grad.addColorStop(.55, '#4ecb40'); grad.addColorStop(1, '#2c7a22');
  ctx.fillStyle = grad;
  ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 3;
  rr(x, y, w, h, 4); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.28)';
  ctx.fillRect(x + 10, y + 6, 10, h - 12);
  const capH = 30, capY = isTop ? y + h - capH : y;
  const cg = ctx.createLinearGradient(x - 4, 0, x + w + 4, 0);
  cg.addColorStop(0, '#358a28'); cg.addColorStop(.3, '#7bf56a'); cg.addColorStop(1, '#256b1c');
  ctx.fillStyle = cg;
  rr(x - 4, capY, w + 8, capH, 6); ctx.fill(); ctx.stroke();
}

function ground() {
  const y = H - GROUND_H;
  const g = ctx.createLinearGradient(0, y, 0, H);
  g.addColorStop(0, '#f7e08b'); g.addColorStop(.18, '#eed88a'); g.addColorStop(.2, '#7ed957'); g.addColorStop(1, '#3f9e2f');
  ctx.fillStyle = g; ctx.fillRect(0, y, W, GROUND_H);
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(0, y, W, 5);
  ctx.fillStyle = 'rgba(120,90,40,.5)';
  for (let x = -((G.groundX * 2) % 48); x < W; x += 48) ctx.fillRect(x, y + 14, 24, 8);
  ctx.fillStyle = 'rgba(255,255,255,.25)';
  for (let x = -((G.groundX * 2) % 48); x < W; x += 48) ctx.fillRect(x, y + 34, 24, 6);
}

function bird(b) {
  ctx.save();
  ctx.translate(b.x, b.y); ctx.rotate(b.rot);
  if (!b.alive && G.state === 'playing') ctx.globalAlpha = .45;
  const blue = b.tint === 'blue';
  // 尾巴
  ctx.fillStyle = blue ? '#5aa9e6' : '#f2a541';
  ctx.beginPath(); ctx.moveTo(-14, -2); ctx.lineTo(-24, -8); ctx.lineTo(-22, 4); ctx.closePath(); ctx.fill();
  // 身体
  const bg = ctx.createLinearGradient(0, -16, 0, 16);
  if (blue) { bg.addColorStop(0, '#9adcff'); bg.addColorStop(1, '#2f7fd0'); }
  else { bg.addColorStop(0, '#ffe45e'); bg.addColorStop(1, '#ff9f1c'); }
  ctx.fillStyle = bg;
  ctx.strokeStyle = 'rgba(120,60,0,.55)'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.ellipse(0, 0, 17, 14, 0, 0, 7); ctx.fill(); ctx.stroke();
  // 肚皮
  ctx.fillStyle = '#fff3d6';
  ctx.beginPath(); ctx.ellipse(2, 6, 10, 6.5, 0, 0, 7); ctx.fill();
  // 翅膀
  const flapA = Math.sin(b.wing) * .9;
  ctx.save(); ctx.translate(-3, 1); ctx.rotate(-.4 + flapA * .7);
  ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(120,60,0,.4)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(-4, 0, 11, 6.5, -.25, 0, 7); ctx.fill(); ctx.stroke();
  ctx.restore();
  // 眼睛
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(7, -6, 6.4, 0, 7); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(8.8, -6, 3, 0, 7); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(9.8, -7, 1.2, 0, 7); ctx.fill();
  // 嘴
  ctx.fillStyle = '#ff5d5d';
  ctx.beginPath(); ctx.moveTo(13, -1); ctx.lineTo(23, 1.5); ctx.lineTo(13, 5); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(150,20,20,.5)'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.restore();
}

function render() {
  ctx.save();
  if (G.shake > 0) ctx.translate((Math.random() - .5) * G.shake, (Math.random() - .5) * G.shake);
  sky(); clouds(); hills();
  for (const p of G.pipes) {
    const topB = p.gapY - p.gap / 2, botT = p.gapY + p.gap / 2;
    pipe(p.x, -6, topB + 6, true);
    pipe(p.x, botT, H - GROUND_H - botT, false);
  }
  ground();
  for (const b of G.birds) bird(b);
  // 粒子
  for (const p of G.particles) {
    ctx.globalAlpha = 1 - p.age / p.life;
    ctx.fillStyle = p.c;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // +1 飘字
  ctx.textAlign = 'center';
  for (const f of G.floats) {
    ctx.globalAlpha = 1 - f.age;
    ctx.font = '900 26px system-ui';
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,.5)';
    ctx.strokeText(f.text, f.x, f.y); ctx.fillStyle = '#fff'; ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
  if (G.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${G.flash * .7})`; ctx.fillRect(0, 0, W, H); }
  ctx.restore();
}

// ---------- 输入 ----------
// 单人：任意键/点击都控制小鸟；双人：P1=空格/左半屏，P2=↑/W/右半屏
function press(e, which) {
  if (e && e.repeat) return;
  if (G.state === 'paused') { togglePause(); return; }
  if (G.mode === 'duo' && G.state === 'playing' && which === undefined) which = 0;
  flap(which);
}
window.addEventListener('keydown', e => {
  if (G.mode === 'duo' && G.state === 'playing') {
    if (e.code === 'Space') { e.preventDefault(); press(e, 0); }
    else if (e.code === 'ArrowUp' || e.code === 'KeyW') { e.preventDefault(); press(e, 1); }
    else if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
    else if (e.code === 'KeyM') toggleMute();
    return;
  }
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') { e.preventDefault(); press(e, 0); }
  else if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
  else if (e.code === 'KeyM') toggleMute();
  else if (e.code === 'KeyR' || e.code === 'Enter') {
    if (G.state === 'over' || G.state === 'menu') { show('ready'); }
    else if (G.state === 'ready') startPlay();
  }
});
canvas.parentElement.addEventListener('pointerdown', e => {
  if (e.target.closest('button')) return;
  e.preventDefault();
  let which;
  if (G.mode === 'duo' && G.state === 'playing') {
    const r = canvas.getBoundingClientRect();
    which = (e.clientX - r.left) < r.width / 2 ? 0 : 1;
  }
  press(undefined, which);
});
function setMode(m) {
  G.mode = m; sfx.click(); show('ready');
}
$('btn-start').onclick = () => setMode('solo');
$('btn-duo').onclick = () => setMode('duo');
$('btn-retry').onclick = () => { sfx.click(); show('ready'); };
$('btn-menu').onclick = () => { sfx.click(); show('menu'); };
$('btn-resume').onclick = () => togglePause();
$('btn-quit').onclick = () => show('menu');
$('btn-pause').onclick = e => { e.stopPropagation(); togglePause(); };
$('screen-pause').onclick = e => { if (e.target.id === 'screen-pause') togglePause(); };

function toggleMute() {
  muted = !muted; store.muted = muted;
  $('btn-mute').textContent = muted ? '🔇' : '🔊';
}
$('btn-mute').onclick = e => { e.stopPropagation(); toggleMute(); };
$('btn-mute').textContent = muted ? '🔇' : '🔊';

function applyNight() {
  document.body.classList.toggle('night', G.night);
  $('btn-theme').textContent = G.night ? '☀️' : '🌙';
}
$('btn-theme').onclick = e => { e.stopPropagation(); G.night = !G.night; store.night = G.night; applyNight(); sfx.click(); };

// ---------- 启动 ----------
// i18n boot: static DOM + dynamic boot texts
window.__refreshLang = function () {
  AMG.apply(STR);
  $('btn-mute').title = T('muteTitle');
  $('btn-pause').title = T('pauseTitle');
  $('btn-theme').title = T('themeTitle');
  $('menu-best').textContent = T('bestLine', G.best);
};
AMG.mountBtn();
window.__refreshLang();
applyNight();
show('menu');
updateHUD();
requestAnimationFrame(t => { last = t; requestAnimationFrame(loop); });
// 调试钩子（自动试玩 / 手感测量用）
window.__flappy = G;
window.__game = G;
window.__gameErrors = [];
window.addEventListener('error', e => window.__gameErrors.push(String(e.message)));
})();
