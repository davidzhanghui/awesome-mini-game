(() => {
'use strict';
// Flappy Bird：固定步长物理；四层视差背景；昼夜跟随站点主题；分数越高缺口越窄、水管开始上下移动
const { $, T } = KIT;
const store = KIT.store('amg-flappy');
const W = 420, H = 680, GROUND = 598, BX = 112;
const cv = $('game'), frame = $('frame');
const ctx = KIT.canvas(cv, W, H);
const DIFF = {
  easy: { speed: 135, gap: 196, space: 236, move: 30 },
  normal: { speed: 160, gap: 160, space: 222, move: 20 },
  hard: { speed: 190, gap: 140, space: 210, move: 0 }
};
const GRAV = 1550, FLAP = -440, MAXV = 620, PW = 68;

let lv = DIFF[store.get('lv', 'normal')] ? store.get('lv', 'normal') : 'normal';
let mode = 'menu'; // menu | ready | play | pause | dead | over
let bird, pipes = [], score = 0, dist = 0, shake = 0, flashA = 0, deadT = 0, bestAtStart = 0;
let tGlobal = 0;
const parts = new KIT.Particles();

// ---------------- 音效 ----------------
const sfx = {
  flap: () => { KIT.tone(520, 0.08, { type: 'triangle', vol: 0.05, to: 760 }); KIT.noise(0.06, { vol: 0.03, hp: 2500 }); },
  point: () => { KIT.tone(988, 0.08, { type: 'square', vol: 0.035 }); KIT.tone(1319, 0.14, { type: 'square', vol: 0.035, delay: 0.07 }); },
  hit: () => { KIT.noise(0.18, { vol: 0.2, lp: 1600 }); KIT.tone(160, 0.2, { type: 'square', vol: 0.06, to: 80 }); },
  die: () => KIT.tone(600, 0.5, { type: 'triangle', vol: 0.06, to: 120, delay: 0.25 }),
  medal: () => KIT.arp([659, 784, 988, 1319], 0.08, { vol: 0.07, dur: 0.2 })
};

// ---------------- 状态 ----------------
function resetBird() { bird = { y: H * 0.42, vy: 0, rot: 0, wing: 0, flapT: 0 }; }
function cfg() {
  const d = DIFF[lv];
  const k = Math.min(score, 40);
  return { speed: d.speed + k * 1.2, gap: d.gap - Math.min(24, k * 0.6), space: d.space, move: d.move };
}
function addPipe(x) {
  const c = cfg();
  const margin = 70;
  const prev = pipes.length ? pipes[pipes.length - 1].cy : H * 0.42;
  // 相邻缺口高度差不超过 190，保证一定飞得过去
  const lo = Math.max(margin + c.gap / 2 + 40, prev - 190), hi = Math.min(GROUND - margin - c.gap / 2, prev + 190);
  const cy = KIT.rand(lo, hi);
  const moving = score >= c.move && Math.random() < (lv === 'hard' ? 0.55 : 0.4);
  pipes.push({ x, cy, base: cy, gap: c.gap, passed: false, amp: moving ? KIT.rand(22, 44) : 0, ph: Math.random() * 6.28, sp: KIT.rand(1.4, 2.3) });
}

function toReady() {
  mode = 'ready';
  score = 0; pipes = []; dist = 0; deadT = 0;
  parts.clear();
  resetBird();
  bestAtStart = store.get('best-' + lv, 0);
  hideScreens();
  KIT.music('sky-breeze');
}
function flap() {
  if (mode === 'ready') { mode = 'play'; addPipe(W + 60); }
  if (mode === 'pause') { mode = 'play'; KIT.music('sky-breeze'); return; }
  if (mode !== 'play') return;
  bird.vy = FLAP; bird.flapT = 0.25;
  sfx.flap();
  parts.burst(BX - 12, bird.y + 6, { n: 3, color: ['#fff6d8', '#ffe08a'], speed: 60, size: 3, life: 0.35, gravity: 200, angle: Math.PI * 0.75, spread: 1 });
}
function die() {
  if (mode !== 'play') return;
  mode = 'dead';
  shake = 0.35; flashA = 0.7;
  sfx.hit(); sfx.die();
  KIT.stopMusic();
  if (bird.vy < 0) bird.vy = 0;
  parts.burst(BX, bird.y, { n: 16, color: ['#ffd23f', '#fff6d8', '#f08a3a'], speed: 180, size: 4, life: 0.6 });
}
function finish() {
  mode = 'over';
  const best = store.get('best-' + lv, 0);
  if (score > best) store.set('best-' + lv, score);
  const m = score >= 50 ? 'plat' : score >= 30 ? 'gold' : score >= 20 ? 'silver' : score >= 10 ? 'bronze' : 'none';
  $('medal').textContent = { plat: '💎', gold: '🥇', silver: '🥈', bronze: '🥉', none: '🥚' }[m];
  $('medal-name').textContent = T('medals')[m];
  if (m !== 'none') sfx.medal();
  $('over-stats').innerHTML = `<span>${T('stScore')}</span><b>${score}</b><span>${T('stBest')}</span><b>${Math.max(best, score)}</b>`;
  $('over-record').classList.toggle('hidden', score <= bestAtStart || score === 0);
  setTimeout(() => { if (mode === 'over') $('screen-over').classList.remove('hidden'); }, 300);
}

// ---------------- 更新 ----------------
function update(dt) {
  tGlobal += dt;
  parts.update(dt);
  shake = Math.max(0, shake - dt);
  flashA = Math.max(0, flashA - dt * 2.5);
  const c = cfg();
  const scrolling = mode === 'menu' || mode === 'ready' || mode === 'play';
  if (scrolling) dist += c.speed * dt;
  bird.wing += dt * (mode === 'play' ? 18 : 10);
  bird.flapT = Math.max(0, bird.flapT - dt);

  if (mode === 'menu' || mode === 'ready') {
    bird.y = H * 0.42 + Math.sin(tGlobal * 3) * 9;
    bird.rot = 0;
    return;
  }
  if (mode === 'pause' || mode === 'over') return;

  bird.vy = Math.min(MAXV, bird.vy + GRAV * dt);
  bird.y += bird.vy * dt;
  const targetRot = bird.vy < 0 ? -0.42 : Math.min(1.45, (bird.vy / MAXV) * 1.7 - 0.2);
  bird.rot += (targetRot - bird.rot) * Math.min(1, dt * (bird.vy < 0 ? 18 : 6));
  if (bird.y < -40) { bird.y = -40; bird.vy = 0; }

  if (mode === 'dead') {
    if (bird.y >= GROUND - 12) {
      bird.y = GROUND - 12; bird.vy = 0;
      deadT += dt;
      if (deadT > 0.35) finish();
    }
    return;
  }

  for (const p of pipes) {
    p.x -= c.speed * dt;
    if (p.amp) p.cy = p.base + Math.sin(tGlobal * p.sp + p.ph) * p.amp;
    if (!p.passed && p.x + PW / 2 < BX) {
      p.passed = true; score++;
      sfx.point();
      parts.burst(BX + 30, 80, { n: 8, color: ['#ffe08a', '#fff'], speed: 120, size: 3, life: 0.4, gravity: 0 });
    }
  }
  if (pipes.length && pipes[0].x < -PW) pipes.shift();
  const lastP = pipes[pipes.length - 1];
  if (!lastP || lastP.x < W + 60 - c.space) addPipe((lastP ? lastP.x : W) + c.space);

  // 碰撞：鸟用 13px 圆，水管用矩形
  const r = 13, by = bird.y;
  if (by + r >= GROUND) { bird.y = GROUND - r; die(); return; }
  for (const p of pipes) {
    if (BX + r < p.x - PW / 2 || BX - r > p.x + PW / 2) continue;
    const top = p.cy - p.gap / 2, bot = p.cy + p.gap / 2;
    for (const [y0, y1] of [[-100, top], [bot, GROUND]]) {
      const nx = KIT.clamp(BX, p.x - PW / 2, p.x + PW / 2), ny = KIT.clamp(by, y0, y1);
      if ((BX - nx) ** 2 + (by - ny) ** 2 < r * r) { die(); return; }
    }
  }
}

// ---------------- 绘制 ----------------
function pal() {
  return KIT.dark()
    ? { sky1: '#1b2340', sky2: '#4a3a5a', far: '#2c3352', mid: '#243a3a', near: '#2f5236', pipe1: '#3f8f6a', pipe2: '#24604a', cap: '#2f7a58', ground: '#5a4630', grass: '#3f7a3a', stripe: '#4c3b28', cloud: 'rgba(200,210,240,.13)', ink: '#fff' }
    : { sky1: '#8fd3f4', sky2: '#fdf1d6', far: '#b9dcd2', mid: '#8fc79a', near: '#68b36a', pipe1: '#7fd34e', pipe2: '#4e9a2a', cap: '#69bf3d', ground: '#ded39a', grass: '#79c94a', stripe: '#cfc283', cloud: 'rgba(255,255,255,.85)', ink: '#fff' };
}

function drawBg(P) {
  const g = ctx.createLinearGradient(0, 0, 0, GROUND);
  g.addColorStop(0, P.sky1); g.addColorStop(1, P.sky2);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, GROUND);
  const night = KIT.dark();
  // 太阳 / 月亮 + 星星
  if (night) {
    ctx.fillStyle = 'rgba(255,255,255,.8)';
    for (let i = 0; i < 40; i++) {
      const x = (i * 97 + 13) % W, y = (i * 53 + 7) % 330;
      ctx.globalAlpha = 0.3 + 0.5 * Math.abs(Math.sin(tGlobal * 1.5 + i));
      ctx.fillRect(x, y, 2, 2);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#f6efd2'; ctx.beginPath(); ctx.arc(320, 96, 30, 0, 7); ctx.fill();
    ctx.fillStyle = P.sky1; ctx.beginPath(); ctx.arc(334, 86, 26, 0, 7); ctx.fill();
  } else {
    ctx.fillStyle = 'rgba(255,236,170,.45)'; ctx.beginPath(); ctx.arc(320, 100, 52, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffe48a'; ctx.beginPath(); ctx.arc(320, 100, 34, 0, 7); ctx.fill();
  }
  // 云
  ctx.fillStyle = P.cloud;
  for (let i = 0; i < 5; i++) {
    const x = ((i * 150 - dist * 0.12) % (W + 200) + W + 200) % (W + 200) - 100, y = 70 + (i * 61) % 170;
    for (const [dx, dy, r] of [[0, 0, 22], [24, -10, 26], [50, 0, 20], [24, 6, 22]]) { ctx.beginPath(); ctx.arc(x + dx, y + dy, r, 0, 7); ctx.fill(); }
  }
  // 远山 / 城市
  layer(P.far, 0.2, 470, (x) => 60 + Math.sin(x * 0.013) * 30 + Math.sin(x * 0.041) * 14);
  // 楼房剪影
  ctx.fillStyle = P.mid;
  const off = dist * 0.35;
  for (let i = -1; i < 12; i++) {
    const bx = i * 46 - (off % 46);
    const k = Math.floor((off / 46) + i);
    const hgt = 40 + ((k * 37) % 5) * 16;
    ctx.fillRect(bx, GROUND - hgt - 24, 40, hgt + 24);
    ctx.fillStyle = night ? 'rgba(255,220,130,.5)' : 'rgba(255,255,255,.35)';
    for (let wy = GROUND - hgt - 14; wy < GROUND - 30; wy += 14) for (let wx = bx + 6; wx < bx + 34; wx += 11) if ((wx * 7 + wy * 3 + k) % 5 > 1) ctx.fillRect(wx, wy, 5, 6);
    ctx.fillStyle = P.mid;
  }
  // 灌木
  ctx.fillStyle = P.near;
  for (let i = -1; i < 14; i++) {
    const bx = i * 36 - ((dist * 0.6) % 36);
    ctx.beginPath(); ctx.arc(bx, GROUND - 4, 24, Math.PI, 0); ctx.fill();
  }
}
function layer(color, par, base, fn) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(0, GROUND);
  for (let x = 0; x <= W; x += 10) ctx.lineTo(x, base - fn(x + dist * par));
  ctx.lineTo(W, GROUND); ctx.closePath(); ctx.fill();
}

function drawPipe(p, P) {
  const x = p.x - PW / 2, top = p.cy - p.gap / 2, bot = p.cy + p.gap / 2;
  const g = ctx.createLinearGradient(x, 0, x + PW, 0);
  g.addColorStop(0, P.pipe2); g.addColorStop(0.35, P.pipe1); g.addColorStop(1, P.pipe2);
  ctx.fillStyle = g;
  ctx.fillRect(x + 4, -10, PW - 8, top - 26 + 10);
  ctx.fillRect(x + 4, bot + 26, PW - 8, GROUND - bot - 26);
  const cap = (y) => {
    ctx.fillStyle = g; KIT.roundRect(ctx, x - 2, y, PW + 4, 26, 5); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillRect(x + 6, y + 4, 6, 18);
  };
  cap(top - 26); cap(bot);
  ctx.fillStyle = 'rgba(255,255,255,.22)';
  ctx.fillRect(x + 10, -10, 6, top - 26 + 10); ctx.fillRect(x + 10, bot + 26, 6, GROUND - bot - 26);
  if (p.amp) { ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.font = '12px system-ui'; ctx.textAlign = 'center'; ctx.fillText('⇕', p.x, top - 34); }
}

function drawGround(P) {
  ctx.fillStyle = P.ground; ctx.fillRect(0, GROUND, W, H - GROUND);
  ctx.fillStyle = P.grass; ctx.fillRect(0, GROUND, W, 14);
  ctx.fillStyle = 'rgba(0,0,0,.1)'; ctx.fillRect(0, GROUND + 14, W, 3);
  ctx.fillStyle = P.stripe;
  const o = dist % 28;
  for (let x = -28; x < W + 28; x += 28) {
    ctx.beginPath(); ctx.moveTo(x - o, GROUND + 14); ctx.lineTo(x - o + 14, GROUND + 14); ctx.lineTo(x - o + 4, GROUND + 26); ctx.lineTo(x - o - 10, GROUND + 26); ctx.fill();
  }
}

function drawBird() {
  ctx.save();
  ctx.translate(BX, bird.y); ctx.rotate(bird.rot);
  // 身体
  ctx.fillStyle = 'rgba(0,0,0,.15)'; ctx.beginPath(); ctx.ellipse(1, 3, 18, 14, 0, 0, 7); ctx.fill();
  const g = ctx.createRadialGradient(-5, -6, 2, 0, 0, 20);
  g.addColorStop(0, '#fff2a8'); g.addColorStop(0.5, '#ffd23f'); g.addColorStop(1, '#f2a623');
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, 18, 14, 0, 0, 7); ctx.fill();
  ctx.strokeStyle = '#a8650f'; ctx.lineWidth = 1.6; ctx.stroke();
  // 肚子
  ctx.fillStyle = '#fff3c8'; ctx.beginPath(); ctx.ellipse(2, 6, 10, 6, 0, 0, 7); ctx.fill();
  // 翅膀
  const flapA = mode === 'dead' || mode === 'over' ? 0 : Math.sin(bird.wing) * (bird.flapT > 0 ? 0.9 : 0.5);
  ctx.save(); ctx.translate(-6, 1); ctx.rotate(flapA);
  ctx.fillStyle = '#fff8e0'; ctx.beginPath(); ctx.ellipse(-2, 2, 9, 6, -0.3, 0, 7); ctx.fill();
  ctx.strokeStyle = '#a8650f'; ctx.lineWidth = 1.3; ctx.stroke();
  ctx.restore();
  // 眼睛
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(8, -5, 6.5, 0, 7); ctx.fill();
  ctx.strokeStyle = '#a8650f'; ctx.lineWidth = 1.2; ctx.stroke();
  if (mode === 'dead' || mode === 'over') {
    ctx.strokeStyle = '#2b1d10'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(6, -8); ctx.lineTo(12, -2); ctx.moveTo(12, -8); ctx.lineTo(6, -2); ctx.stroke();
  } else {
    ctx.fillStyle = '#2b1d10'; ctx.beginPath(); ctx.arc(10, -5, 3, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(11, -6, 1, 0, 7); ctx.fill();
  }
  // 嘴
  ctx.fillStyle = '#f2702a';
  ctx.beginPath(); ctx.moveTo(12, 0); ctx.quadraticCurveTo(25, 1, 13, 7); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#e0531c';
  ctx.beginPath(); ctx.moveTo(12, 4); ctx.quadraticCurveTo(22, 6, 13, 8); ctx.closePath(); ctx.fill();
  // 腮红
  ctx.fillStyle = 'rgba(255,120,100,.4)'; ctx.beginPath(); ctx.ellipse(4, 3, 3.5, 2, 0, 0, 7); ctx.fill();
  ctx.restore();
}

function bigText(s, y, size, color) {
  ctx.font = `400 ${size}px "AMG Display", "PingFang SC", system-ui, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = size / 5; ctx.strokeStyle = '#3a2614'; ctx.strokeText(s, W / 2, y);
  ctx.fillStyle = color || '#fff'; ctx.fillText(s, W / 2, y);
}

function draw() {
  const P = pal();
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake * 18, (Math.random() - 0.5) * shake * 18);
  drawBg(P);
  for (const p of pipes) drawPipe(p, P);
  drawGround(P);
  drawBird();
  parts.draw(ctx);
  ctx.restore();

  if (mode === 'play' || mode === 'dead' || mode === 'pause') bigText(score, 82, 54);
  if (mode === 'ready') {
    bigText(T('getReady'), 170, 34, '#ffd23f');
    const k = Math.sin(tGlobal * 5) * 4;
    ctx.font = '40px system-ui, "Apple Color Emoji", sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('👆', BX + 4, bird.y + 70 + k);
    bigText(T('tapToFlap'), bird.y + 120, 18);
  }
  if (mode === 'pause') {
    ctx.fillStyle = 'rgba(30,20,10,.35)'; ctx.fillRect(0, 0, W, H);
    bigText(T('paused'), H / 2, 22);
  }
  if (flashA > 0) { ctx.fillStyle = `rgba(255,255,255,${flashA})`; ctx.fillRect(0, 0, W, H); }
}

let last = performance.now(), acc = 0;
const STEP = 1 / 120;
function loop(now) {
  acc += Math.min(0.1, (now - last) / 1000); last = now;
  while (acc >= STEP) { update(STEP); acc -= STEP; }
  draw();
  requestAnimationFrame(loop);
}

// ---------------- 界面 ----------------
function hideScreens() { $('screen-menu').classList.add('hidden'); $('screen-over').classList.add('hidden'); }
function showMenu() {
  mode = 'menu'; pipes = []; score = 0;
  resetBird();
  KIT.stopMusic();
  hideScreens();
  renderMenu();
  $('screen-menu').classList.remove('hidden');
}
function renderMenu() {
  document.querySelectorAll('#lv-seg button').forEach(b => b.classList.toggle('on', b.dataset.lv === lv));
  $('lv-desc').textContent = T('lvDesc')[lv];
  $('menu-best').textContent = T('best', store.get('best-' + lv, 0));
}

document.querySelectorAll('#lv-seg button').forEach(b => b.addEventListener('click', () => {
  lv = b.dataset.lv; store.set('lv', lv);
  KIT.tone(560, 0.06, { type: 'triangle', vol: 0.05 });
  renderMenu();
}));
$('btn-start').onclick = toReady;
$('btn-retry').onclick = toReady;
$('btn-menu').onclick = showMenu;

frame.addEventListener('pointerdown', e => {
  if (e.target.closest('.screen, button')) return;
  e.preventDefault();
  flap();
});
document.addEventListener('keydown', e => {
  if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
  const k = e.key;
  if (k === ' ' || k === 'ArrowUp' || k === 'w' || k === 'W') {
    e.preventDefault();
    if (e.repeat) return;
    if (mode === 'menu') toReady();
    else if (mode === 'over') toReady();
    else flap();
  } else if (k === 'p' || k === 'P' || k === 'Escape') {
    if (mode === 'play') { mode = 'pause'; KIT.stopMusic(); }
    else if (mode === 'pause') { mode = 'play'; KIT.music('sky-breeze'); }
  } else if (k === 'Enter' && (mode === 'menu' || mode === 'over')) toReady();
});
document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'play') { mode = 'pause'; KIT.stopMusic(); } });

const syncMute = KIT.mountMute($('btn-mute'));
KIT.boot(() => { syncMute(); renderMenu(); });
resetBird();
showMenu();
requestAnimationFrame(loop);
})();
