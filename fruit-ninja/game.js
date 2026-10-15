(() => {
// 水果忍者：抛物线抛射 + 划屏刀光切割（线段-圆相交）+ 半块飞散 / 果汁溅射，经典 & 街机两种模式
const STR = window.GAME_STR || { zh: {} };
const T = (k, ...a) => AMG.tf(STR, k, ...a);
const W = 480, H = 620, GRAV = 720;
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const $ = id => document.getElementById(id);
const dpr = Math.min(window.devicePixelRatio || 1, 2);
canvas.width = W * dpr; canvas.height = H * dpr;
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",system-ui';

const FRUITS = [
  { e: '🍉', r: 36, c: '#ef4444' }, { e: '🍊', r: 27, c: '#fb923c' }, { e: '🍎', r: 26, c: '#dc2626' },
  { e: '🍋', r: 25, c: '#facc15' }, { e: '🍍', r: 31, c: '#fbbf24' }, { e: '🥝', r: 24, c: '#84cc16' },
  { e: '🍓', r: 22, c: '#e11d48' }, { e: '🍑', r: 26, c: '#fb7185' }, { e: '🥥', r: 28, c: '#f5f5f4' },
  { e: '🍐', r: 26, c: '#bef264' }
];
const BANANAS = { freeze: '#38bdf8', frenzy: '#f97316', double: '#a855f7' };

const store = {
  best(m) { return +(localStorage.getItem('fn-best-' + m) || 0); },
  setBest(m, v) { localStorage.setItem('fn-best-' + m, v); },
  get muted() { return localStorage.getItem('fn-muted') === '1'; },
  set muted(v) { localStorage.setItem('fn-muted', v ? '1' : '0'); }
};
let actx = null, muted = store.muted, noise = null;
function ac() {
  if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
  if (actx.state === 'suspended') actx.resume();
  return actx;
}
function tone(f, dur, type, vol, f2) {
  if (muted) return;
  try {
    const a = ac(), o = a.createOscillator(), g = a.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f, a.currentTime);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, a.currentTime + dur);
    g.gain.setValueAtTime(vol || .07, a.currentTime);
    g.gain.exponentialRampToValueAtTime(.001, a.currentTime + dur);
    o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + dur);
  } catch (e) {}
}
function hiss(dur, vol, hp) {
  if (muted) return;
  try {
    const a = ac();
    if (!noise) {
      noise = a.createBuffer(1, a.sampleRate, a.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    s.buffer = noise; f.type = 'highpass'; f.frequency.value = hp || 2500;
    g.gain.setValueAtTime(vol, a.currentTime);
    g.gain.exponentialRampToValueAtTime(.001, a.currentTime + dur);
    s.connect(f); f.connect(g); g.connect(a.destination); s.start(); s.stop(a.currentTime + dur);
  } catch (e) {}
}
const sfx = {
  swing: () => hiss(.12, .05, 3500),
  slice: () => { hiss(.1, .12, 1800); tone(240 + Math.random() * 80, .12, 'triangle', .05, 120); },
  throw: () => tone(180, .15, 'sine', .03, 320),
  bomb: () => { hiss(.8, .35, 80); tone(90, .6, 'sawtooth', .08, 30); },
  miss: () => tone(200, .25, 'square', .04, 110),
  combo: n => [660, 880, 1100].slice(0, Math.min(3, n - 1)).forEach((f, i) => setTimeout(() => tone(f, .1, 'triangle', .07), i * 70)),
  power: () => [523, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, .12, 'sine', .07), i * 80)),
  over: () => [392, 311, 233].forEach((f, i) => setTimeout(() => tone(f, .25, 'sine', .08), i * 160))
};

const G = {
  state: 'menu', mode: 'classic', score: 0, lives: 3, time: 60, objs: [], halves: [], parts: [], splats: [], pops: [],
  blade: [], down: false, spawnT: 1, queue: [], elapsed: 0, combo: 0, comboT: 0, comboPos: null,
  freeze: 0, frenzy: 0, double: 0, flash: 0, shake: 0, sliced: 0, bestCombo: 0, overT: 0, t: 0
};

function startGame(mode) {
  G.mode = mode || G.mode;
  Object.assign(G, {
    state: 'play', score: 0, lives: 3, time: 60, objs: [], halves: [], parts: [], splats: [], pops: [], blade: [],
    spawnT: .8, queue: [], elapsed: 0, combo: 0, comboT: 0, freeze: 0, frenzy: 0, double: 0, flash: 0, shake: 0,
    sliced: 0, bestCombo: 0, overT: 0
  });
  showScreen(null);
}

// ---------- 生成 ----------
function launch(kind, opts) {
  opts = opts || {};
  const x = opts.x !== undefined ? opts.x : 70 + Math.random() * (W - 140);
  const apex = 70 + Math.random() * 190;
  const y0 = H + 40;
  const vy = opts.vy !== undefined ? opts.vy : -Math.sqrt(2 * GRAV * (y0 - apex));
  const flight = -vy / GRAV * 2;
  const tx = W * (.25 + Math.random() * .5);
  const vx = opts.vx !== undefined ? opts.vx : (tx - x) / flight * (.8 + Math.random() * .6);
  const o = { kind, x, y: opts.y !== undefined ? opts.y : y0, vx, vy, rot: Math.random() * 6, vr: (Math.random() - .5) * 5, sliced: false };
  if (kind === 'fruit') { const f = FRUITS[Math.random() * FRUITS.length | 0]; o.f = f; o.r = f.r; }
  else if (kind === 'bomb') o.r = 25;
  else { o.r = 26; o.power = opts.power; }
  G.objs.push(o);
  return o;
}
function planWave() {
  const lvl = Math.min(1, G.elapsed / 90);
  const n = 1 + Math.floor(Math.random() * (2 + lvl * 3.5));
  const bombP = G.mode === 'classic' ? .08 + lvl * .14 : .13;
  const burst = Math.random() < .35;
  for (let i = 0; i < n; i++) {
    let kind = Math.random() < bombP && G.elapsed > 4 ? 'bomb' : 'fruit';
    G.queue.push({ at: burst ? 0 : i * (.22 + Math.random() * .2), kind });
  }
  if (G.mode === 'arcade' && Math.random() < .16) {
    const ps = Object.keys(BANANAS);
    G.queue.push({ at: .3, kind: 'banana', power: ps[Math.random() * ps.length | 0] });
  }
  if (n >= 3 || burst) sfx.throw();
  G.spawnT = (1.9 - lvl * .8) + Math.random() * .7;
}

// ---------- 切割 ----------
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
function cutCheck(ax, ay, bx, by) {
  if (Math.hypot(bx - ax, by - ay) < 3) return;
  const ang = Math.atan2(by - ay, bx - ax);
  for (const o of G.objs) {
    if (o.sliced) continue;
    if (segDist(o.x, o.y, ax, ay, bx, by) > o.r * .92) continue;
    o.sliced = true;
    if (o.kind === 'bomb') return hitBomb(o);
    sliceObj(o, ang);
  }
}
function sliceObj(o, ang) {
  const color = o.kind === 'fruit' ? o.f.c : BANANAS[o.power];
  const e = o.kind === 'fruit' ? o.f.e : '🍌';
  const nx = -Math.sin(ang), ny = Math.cos(ang);
  for (const side of [-1, 1]) {
    G.halves.push({ e, r: o.r, x: o.x, y: o.y, vx: o.vx * .6 + nx * side * 110, vy: Math.min(o.vy, 0) * .4 + ny * side * 110 - 60,
      rot: o.rot, vr: o.vr + side * 4, cut: ang - o.rot, side, c: color, t: 0 });
  }
  for (let i = 0; i < 16; i++) {
    const a = Math.random() * Math.PI * 2, s = 60 + Math.random() * 260;
    G.parts.push({ x: o.x, y: o.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 80, t: .4 + Math.random() * .4, c: color, r: 2 + Math.random() * 3 });
  }
  G.splats.push({ x: o.x, y: o.y, c: color, r: o.r * (1.1 + Math.random() * .5), t: 3.5, seed: Math.random() * 100 });
  if (G.splats.length > 14) G.splats.shift();
  sfx.slice();
  if (o.kind === 'banana') {
    sfx.power();
    if (o.power === 'freeze') G.freeze = 5;
    if (o.power === 'frenzy') G.frenzy = 4;
    if (o.power === 'double') G.double = 7;
    G.pops.push({ x: o.x, y: o.y - 20, txt: T('pw_' + o.power), t: 1.3, c: color, big: true });
    return;
  }
  const pts = G.double > 0 ? 2 : 1;
  addScore(pts);
  G.sliced++;
  G.combo++; G.comboT = .28; G.comboPos = { x: o.x, y: o.y };
}
function addScore(n) {
  G.score = Math.max(0, G.score + n);
}
function hitBomb(o) {
  G.flash = 1; G.shake = .6; sfx.bomb();
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * Math.PI * 2, s = 100 + Math.random() * 400;
    G.parts.push({ x: o.x, y: o.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: .5 + Math.random() * .5, c: i % 2 ? '#fde68a' : '#f97316', r: 2 + Math.random() * 4 });
  }
  if (G.mode === 'classic') {
    G.state = 'dying'; G.overT = 1.4; G.reason = 'bomb';
  } else {
    addScore(-10);
    G.pops.push({ x: o.x, y: o.y, txt: '-10', t: 1.1, c: '#ef4444', big: true });
    G.objs = G.objs.filter(x => x !== o);
  }
}
function endCombo() {
  if (G.combo >= 3) {
    const bonus = G.combo * (G.double > 0 ? 2 : 1);
    addScore(bonus);
    G.bestCombo = Math.max(G.bestCombo, G.combo);
    G.pops.push({ x: G.comboPos.x, y: G.comboPos.y - 30, txt: T('combo', G.combo, bonus), t: 1.3, c: '#fde047', big: true });
    sfx.combo(G.combo);
  }
  G.combo = 0;
}

// ---------- 更新 ----------
function update(rdt) {
  G.t += rdt;
  const dt = rdt * (G.freeze > 0 ? .45 : 1);
  if (G.state === 'dying') {
    G.overT -= rdt;
    stepFx(rdt, dt);
    if (G.overT <= 0) gameOver();
    return;
  }
  G.elapsed += rdt;
  if (G.mode === 'arcade') {
    G.time -= rdt;
    if (G.time <= 0) { G.time = 0; G.state = 'dying'; G.overT = .9; G.reason = 'time'; return; }
  }
  for (const k of ['freeze', 'frenzy', 'double']) if (G[k] > 0) G[k] -= rdt;
  // 发射队列
  G.spawnT -= dt;
  if (G.spawnT <= 0 && !G.queue.length) planWave();
  for (const q of G.queue) q.at -= dt;
  for (const q of G.queue.filter(q => q.at <= 0)) launch(q.kind, { power: q.power });
  G.queue = G.queue.filter(q => q.at > 0);
  if (G.frenzy > 0 && Math.random() < dt * 9) {
    const fromLeft = Math.random() < .5;
    launch('fruit', { x: fromLeft ? -30 : W + 30, y: 200 + Math.random() * 260, vx: (fromLeft ? 1 : -1) * (260 + Math.random() * 120), vy: -300 - Math.random() * 200 });
  }
  for (const o of G.objs) {
    o.vy += GRAV * dt; o.x += o.vx * dt; o.y += o.vy * dt; o.rot += o.vr * dt;
  }
  const gone = G.objs.filter(o => o.sliced || o.y > H + 80 || (o.vy > 0 && (o.x < -90 || o.x > W + 90)));
  for (const o of gone) {
    if (!o.sliced && o.kind === 'fruit' && o.y > H + 80 && G.mode === 'classic' && G.state === 'play') {
      G.lives--; sfx.miss();
      G.pops.push({ x: Math.max(30, Math.min(W - 30, o.x)), y: H - 40, txt: '✖', t: 1, c: '#ef4444', big: true });
      if (G.lives <= 0) { G.state = 'dying'; G.overT = 1; G.reason = 'miss'; }
    }
  }
  G.objs = G.objs.filter(o => !gone.includes(o));
  if (G.comboT > 0) { G.comboT -= rdt; if (G.comboT <= 0) endCombo(); }
  stepFx(rdt, dt);
}
function stepFx(rdt, dt) {
  for (const h of G.halves) { h.vy += GRAV * dt; h.x += h.vx * dt; h.y += h.vy * dt; h.rot += h.vr * dt; h.t += dt; }
  G.halves = G.halves.filter(h => h.y < H + 100);
  for (const p of G.parts) { p.vy += 600 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.t -= dt; }
  G.parts = G.parts.filter(p => p.t > 0);
  for (const s of G.splats) s.t -= rdt;
  G.splats = G.splats.filter(s => s.t > 0);
  for (const p of G.pops) { p.y -= 30 * rdt; p.t -= rdt; }
  G.pops = G.pops.filter(p => p.t > 0);
  if (G.flash > 0) G.flash -= rdt * 1.4;
  if (G.shake > 0) G.shake -= rdt;
  const now = G.t;
  G.blade = G.blade.filter(b => now - b.t < .16);
}
function gameOver() {
  endCombo();
  G.state = 'over'; sfx.over();
  const best = store.best(G.mode);
  const isNew = G.score > best;
  if (isNew) store.setBest(G.mode, G.score);
  $('over-title').textContent = T(G.reason === 'bomb' ? 'overBomb' : G.reason === 'time' ? 'overTime' : 'overMiss');
  $('over-sub').textContent = T('overSub', G.score, G.sliced, G.bestCombo) + (isNew ? T('newBest') : '');
  showScreen('over');
}
function showScreen(name) {
  for (const k of ['screen-menu', 'screen-over'])
    $(k).classList.toggle('hidden', k !== 'screen-' + name);
}
function togglePause() {
  if (G.state === 'play') G.state = 'pause';
  else if (G.state === 'pause') G.state = 'play';
}

// ---------- 输入 ----------
function toLocal(e) {
  const r = canvas.getBoundingClientRect();
  return [(e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H];
}
canvas.addEventListener('pointerdown', e => {
  if (G.state !== 'play') return;
  G.down = true;
  try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  const [x, y] = toLocal(e);
  G.blade = [{ x, y, t: G.t }];
});
canvas.addEventListener('pointermove', e => {
  if (!G.down || G.state !== 'play') return;
  const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  for (const ev of (evs.length ? evs : [e])) {
    const [x, y] = toLocal(ev);
    const lastP = G.blade[G.blade.length - 1];
    if (lastP) {
      const d = Math.hypot(x - lastP.x, y - lastP.y);
      if (d > 40 && (!G.lastSwing || G.t - G.lastSwing > .18)) { sfx.swing(); G.lastSwing = G.t; }
      cutCheck(lastP.x, lastP.y, x, y);
      if (G.state !== 'play') break;
    }
    G.blade.push({ x, y, t: G.t });
  }
});
const up = () => { G.down = false; };
canvas.addEventListener('pointerup', up);
canvas.addEventListener('pointercancel', up);
window.addEventListener('keydown', e => {
  if (e.code === 'KeyM') toggleMute();
  else if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
  else if (e.code === 'KeyR' || e.code === 'Enter' || e.code === 'Space') {
    e.preventDefault();
    if (G.state === 'over' || G.state === 'menu') startGame(G.mode);
  }
});
$('btn-classic').onclick = () => startGame('classic');
$('btn-arcade').onclick = () => startGame('arcade');
$('btn-retry').onclick = () => startGame(G.mode);
$('btn-menu').onclick = () => { G.state = 'menu'; refreshMenu(); showScreen('menu'); };
function refreshMenu() { $('menu-best').textContent = T('best', store.best('classic'), store.best('arcade')); }
function toggleMute() {
  muted = !muted; store.muted = muted;
  $('btn-mute').textContent = muted ? '🔇' : '🔊';
}
$('btn-mute').onclick = toggleMute;
$('btn-mute').textContent = muted ? '🔇' : '🔊';
window.__refreshLang = function () {
  AMG.apply(STR);
  $('btn-mute').title = T('muteTitle');
  refreshMenu();
};
AMG.mountBtn();
window.__refreshLang();

// ---------- 渲染 ----------
const bgCanvas = document.createElement('canvas');
(function paintBg() {
  bgCanvas.width = W * dpr; bgCanvas.height = H * dpr;
  const b = bgCanvas.getContext('2d');
  b.scale(dpr, dpr);
  const plank = 80;
  for (let i = 0; i * plank < W; i++) {
    const g = b.createLinearGradient(i * plank, 0, (i + 1) * plank, 0);
    const base = i % 2 ? [120, 72, 38] : [134, 82, 44];
    g.addColorStop(0, `rgb(${base[0] - 18},${base[1] - 12},${base[2] - 8})`);
    g.addColorStop(.5, `rgb(${base})`);
    g.addColorStop(1, `rgb(${base[0] - 24},${base[1] - 16},${base[2] - 10})`);
    b.fillStyle = g; b.fillRect(i * plank, 0, plank, H);
    b.strokeStyle = 'rgba(60,30,10,.35)'; b.lineWidth = 1;
    for (let k = 0; k < 6; k++) {
      const x = i * plank + 10 + k * 12 + (k % 2) * 3;
      b.beginPath(); b.moveTo(x, 0);
      for (let y = 0; y <= H; y += 40) b.lineTo(x + Math.sin(y / 70 + i + k) * 3, y);
      b.stroke();
    }
    b.fillStyle = 'rgba(30,14,4,.55)'; b.fillRect((i + 1) * plank - 2, 0, 2, H);
  }
  const v = b.createRadialGradient(W / 2, H / 2, 120, W / 2, H / 2, 460);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.5)');
  b.fillStyle = v; b.fillRect(0, 0, W, H);
})();

function drawEmoji(e, r) {
  ctx.font = Math.round(r * 2.05) + 'px ' + EMOJI_FONT;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(e, 0, r * .08);
}
function drawObj(o) {
  ctx.save();
  ctx.translate(o.x, o.y);
  if (o.kind === 'banana') {
    const c = BANANAS[o.power];
    ctx.shadowColor = c; ctx.shadowBlur = 24;
    ctx.fillStyle = c + '55';
    ctx.beginPath(); ctx.arc(0, 0, o.r + 6, 0, 7); ctx.fill();
    ctx.shadowBlur = 0;
  }
  ctx.rotate(o.rot);
  if (o.kind === 'bomb') {
    ctx.shadowColor = '#ef4444'; ctx.shadowBlur = 14 + Math.sin(G.t * 12) * 6;
    drawEmoji('💣', o.r);
    ctx.shadowBlur = 0;
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i % 2 ? '#fde047' : '#fb923c';
      ctx.beginPath(); ctx.arc(o.r * .55 + Math.random() * 6 - 3, -o.r * .75 + Math.random() * 6 - 3, 2 + Math.random() * 2, 0, 7); ctx.fill();
    }
  } else drawEmoji(o.kind === 'fruit' ? o.f.e : '🍌', o.r);
  ctx.restore();
}
function drawHalf(h) {
  ctx.save();
  ctx.translate(h.x, h.y); ctx.rotate(h.rot);
  ctx.globalAlpha = Math.max(0, 1 - h.t / 1.6);
  ctx.save();
  ctx.rotate(h.cut);
  ctx.beginPath(); ctx.rect(-h.r * 1.6, h.side < 0 ? -h.r * 1.6 : 0, h.r * 3.2, h.r * 1.6); ctx.clip();
  ctx.rotate(-h.cut);
  drawEmoji(h.e, h.r);
  ctx.rotate(h.cut);
  ctx.strokeStyle = h.c; ctx.lineWidth = 4; ctx.globalAlpha *= .85;
  ctx.beginPath(); ctx.moveTo(-h.r * .85, 0); ctx.lineTo(h.r * .85, 0); ctx.stroke();
  ctx.restore();
  ctx.restore();
}
function drawSplat(s) {
  ctx.globalAlpha = Math.min(.5, s.t / 3.5 * .55);
  ctx.fillStyle = s.c;
  ctx.beginPath(); ctx.arc(s.x, s.y, s.r * .7, 0, 7); ctx.fill();
  for (let i = 0; i < 7; i++) {
    const a = s.seed + i * 1.7, d = s.r * (.7 + (Math.sin(s.seed * (i + 1)) * .5 + .5) * .7);
    ctx.beginPath(); ctx.arc(s.x + Math.cos(a) * d, s.y + Math.sin(a) * d, s.r * (.12 + (i % 3) * .06), 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
}
function drawBlade() {
  const pts = G.blade;
  if (pts.length < 2) return;
  const now = G.t;
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 1; i < pts.length; i++) {
      const k = 1 - (now - pts[i].t) / .16;
      if (k <= 0) continue;
      ctx.strokeStyle = pass ? `rgba(255,255,255,${k})` : `rgba(125,211,252,${k * .55})`;
      ctx.lineWidth = (pass ? 5 : 13) * k + 1;
      ctx.beginPath(); ctx.moveTo(pts[i - 1].x, pts[i - 1].y); ctx.lineTo(pts[i].x, pts[i].y); ctx.stroke();
    }
  }
  ctx.restore();
}
function render() {
  ctx.save();
  if (G.shake > 0) ctx.translate((Math.random() - .5) * 14 * G.shake, (Math.random() - .5) * 14 * G.shake);
  ctx.drawImage(bgCanvas, 0, 0, W, H);
  for (const s of G.splats) drawSplat(s);
  if (G.freeze > 0) { ctx.fillStyle = 'rgba(125,211,252,.16)'; ctx.fillRect(0, 0, W, H); }
  for (const h of G.halves) drawHalf(h);
  for (const o of G.objs) drawObj(o);
  for (const p of G.parts) {
    ctx.globalAlpha = Math.min(1, p.t * 2.5); ctx.fillStyle = p.c;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
  drawBlade();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const p of G.pops) {
    ctx.globalAlpha = Math.min(1, p.t * 2);
    ctx.font = (p.big ? '900 24px ' : '900 18px ') + 'system-ui';
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.strokeText(p.txt, p.x, p.y);
    ctx.fillStyle = p.c || '#fff'; ctx.fillText(p.txt, p.x, p.y);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  // HUD
  if (G.state !== 'menu') {
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    ctx.font = '22px ' + EMOJI_FONT; ctx.fillText('🍉', 16, 44);
    ctx.font = '900 32px system-ui'; ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,.55)';
    ctx.strokeText(G.score, 48, 46); ctx.fillStyle = '#fde047'; ctx.fillText(G.score, 48, 46);
    ctx.font = '800 13px system-ui'; ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.fillText(T('hudBest') + ' ' + Math.max(store.best(G.mode), G.score), 18, 70);
    ctx.textAlign = 'right';
    if (G.mode === 'classic') {
      ctx.font = '900 30px system-ui';
      for (let i = 0; i < 3; i++) {
        const lost = i >= G.lives;
        ctx.fillStyle = lost ? '#ef4444' : 'rgba(255,255,255,.35)';
        ctx.fillText('✖', W - 16 - (2 - i) * 32, 46);
      }
    } else {
      const s = Math.ceil(G.time);
      ctx.font = '900 30px system-ui'; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 5;
      const txt = '⏱ ' + s;
      ctx.strokeText(txt, W - 16, 46); ctx.fillStyle = s <= 10 ? '#f87171' : '#fff'; ctx.fillText(txt, W - 16, 46);
      let yy = 72;
      ctx.font = '800 13px system-ui';
      for (const k of ['freeze', 'frenzy', 'double']) if (G[k] > 0) {
        ctx.fillStyle = BANANAS[k]; ctx.fillText(T('pw_' + k) + ' ' + G[k].toFixed(1) + 's', W - 16, yy); yy += 18;
      }
    }
  }
  if (G.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${Math.min(1, G.flash)})`; ctx.fillRect(0, 0, W, H); }
  if (G.state === 'pause') {
    ctx.fillStyle = 'rgba(20,10,4,.6)'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff'; ctx.font = '900 32px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(T('paused'), W / 2, H / 2);
  }
  ctx.textBaseline = 'alphabetic';
}

// 菜单背景：水果在背景里慢慢翻飞
let demoT = 0;
function menuDemo(dt) {
  demoT -= dt;
  if (demoT <= 0) { launch('fruit'); demoT = .9; }
  for (const o of G.objs) { o.vy += GRAV * dt * .6; o.x += o.vx * dt * .6; o.y += o.vy * dt * .6; o.rot += o.vr * dt; }
  G.objs = G.objs.filter(o => o.y < H + 90);
}

let last = performance.now();
function loop(now) {
  const dt = Math.min((now - last) / 1000, .05);
  last = now;
  if (G.state === 'play' || G.state === 'dying') update(dt);
  else if (G.state === 'menu') { G.t += dt; menuDemo(dt); }
  else if (G.state === 'over') { G.t += dt; stepFx(dt, dt); }
  render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(t => { last = t; requestAnimationFrame(loop); });
window.__game = G;
window.__gameApi = { startGame, launch, cutCheck, update };
window.__gameErrors = [];
window.addEventListener('error', e => window.__gameErrors.push(String(e.message)));
})();
