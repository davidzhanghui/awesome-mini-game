(() => {
// 合成大西瓜：Verlet 圆形物理 + 同级水果碰撞合成 + 越线判负
const STR = window.GAME_STR || { zh: {} };
const T = (k, ...a) => AMG.tf(STR, k, ...a);
const W = 480, H = 620;
const L = 24, R = 456, FLOOR = 600, TOP = 150, DANGER = 172, HOLD_Y = 112;
const GRAV = 1500, SUB = 2, ITER = 8, DT = 1 / 120;
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const $ = id => document.getElementById(id);
const dpr = Math.min(window.devicePixelRatio || 1, 2);
canvas.width = W * dpr; canvas.height = H * dpr;
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

// 11 级水果：半径 / 颜色 / emoji
const FRUITS = [
  { r: 14, c: '#8b5cf6', e: '🍇' }, { r: 19, c: '#f43f5e', e: '🍒' },
  { r: 25, c: '#fb923c', e: '🍊' }, { r: 30, c: '#facc15', e: '🍋' },
  { r: 37, c: '#84cc16', e: '🥝' }, { r: 45, c: '#ef4444', e: '🍅' },
  { r: 53, c: '#fda4af', e: '🍑' }, { r: 62, c: '#fbbf24', e: '🍍' },
  { r: 71, c: '#d6d3d1', e: '🥥' }, { r: 83, c: '#a3e635', e: '🍈' },
  { r: 97, c: '#22c55e', e: '🍉' }
];
const SCORES = [1, 3, 6, 10, 15, 21, 28, 36, 45, 55, 66];
const MAX_LV = FRUITS.length - 1;

const store = {
  get best() { return +(localStorage.getItem('suika-best') || 0); },
  set best(v) { localStorage.setItem('suika-best', v); },
  get muted() { return localStorage.getItem('suika-muted') === '1'; },
  set muted(v) { localStorage.setItem('suika-muted', v ? '1' : '0'); }
};
let actx = null, muted = store.muted;
function tone(f, dur, type, vol, f2) {
  if (muted) return;
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f, actx.currentTime);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, actx.currentTime + dur);
    g.gain.setValueAtTime(vol || .08, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(.001, actx.currentTime + dur);
    o.connect(g); g.connect(actx.destination); o.start(); o.stop(actx.currentTime + dur);
  } catch (e) {}
}
const sfx = {
  drop: () => tone(330, .12, 'sine', .06, 200),
  merge: lv => tone(380 + lv * 60, .16, 'triangle', .09, 600 + lv * 90),
  melon: () => [523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => tone(f, .18, 'triangle', .09), i * 90)),
  warn: () => tone(880, .08, 'square', .03),
  over: () => [440, 349, 262].forEach((f, i) => setTimeout(() => tone(f, .25, 'sine', .09), i * 160))
};

// 每级水果预渲染为精灵（彩色果盘 + emoji），绘制时只做 drawImage
const sprites = FRUITS.map(f => {
  const s = Math.ceil((f.r * 2 + 4) * dpr), c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  const o = f.r + 2;
  const grd = g.createRadialGradient(o - f.r * .35, o - f.r * .4, f.r * .1, o, o, f.r);
  grd.addColorStop(0, '#ffffff'); grd.addColorStop(.25, f.c); grd.addColorStop(1, shade(f.c, -.28));
  g.fillStyle = grd;
  g.beginPath(); g.arc(o, o, f.r, 0, 7); g.fill();
  g.lineWidth = 2; g.strokeStyle = shade(f.c, -.4); g.stroke();
  g.font = Math.round(f.r * 1.15) + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",system-ui';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(f.e, o, o + f.r * .06);
  return { c, size: f.r * 2 + 4 };
});
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const ch = s => { const v = (n >> s) & 255; return Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k); };
  return 'rgb(' + ch(16) + ',' + ch(8) + ',' + ch(0) + ')';
}

const G = {
  state: 'menu', bodies: [], parts: [], pops: [], score: 0, aimX: W / 2,
  cur: 0, next: 0, cool: 0, drops: 0, dangerT: 0, shake: 0, banner: 0,
  maxLv: 0, t: 0, keys: { l: false, r: false }, nid: 1, warnT: 0
};

function randLv() {
  const pool = G.drops < 5 ? [0, 0, 1, 1, 2] : [0, 0, 0, 1, 1, 1, 2, 2, 3, 4];
  return pool[Math.random() * pool.length | 0];
}
function reset() {
  G.bodies = []; G.parts = []; G.pops = [];
  G.score = 0; G.drops = 0; G.cool = 0; G.dangerT = 0; G.maxLv = 0; G.banner = 0;
  G.cur = randLv(); G.next = randLv(); G.aimX = W / 2;
}
function startGame() { reset(); G.state = 'play'; showScreen(null); }

function addBody(lv, x, y, vx, vy, grow) {
  const r = FRUITS[lv].r;
  const b = { id: G.nid++, lv, x, y, px: x - (vx || 0), py: y - (vy || 0), r: grow ? r * .6 : r, tr: r, age: 0, ang: 0, dead: false };
  G.bodies.push(b);
  return b;
}
function clampAim() {
  const r = FRUITS[G.cur].r;
  G.aimX = Math.max(L + r, Math.min(R - r, G.aimX));
}
function drop() {
  if (G.state !== 'play' || G.cool > 0) return;
  clampAim();
  addBody(G.cur, G.aimX, HOLD_Y, 0, 0, false);
  G.drops++; G.cool = .5;
  G.cur = G.next; G.next = randLv();
  sfx.drop();
}

function physics() {
  const bs = G.bodies;
  for (const b of bs) {
    let vx = (b.x - b.px) * .996, vy = (b.y - b.py) * .996;
    const sp = Math.hypot(vx, vy);
    if (sp > 18) { vx *= 18 / sp; vy *= 18 / sp; }
    b.px = b.x; b.py = b.y;
    b.x += vx; b.y += vy + GRAV * DT * DT;
    if (b.r < b.tr) b.r = Math.min(b.tr, b.r + b.tr * 4 * DT);
    b.age += DT;
    b.ang += vx / b.r;
  }
  const merges = [];
  for (let it = 0; it < ITER; it++) {
    for (let i = 0; i < bs.length; i++) {
      const a = bs[i];
      for (let j = i + 1; j < bs.length; j++) {
        const b = bs[j];
        const dx = b.x - a.x, dy = b.y - a.y, rr = a.r + b.r;
        // 粗筛留 2px 余量：刚好贴着（未重叠）的同级水果也要能合成
        if (Math.abs(dx) > rr + 2 || Math.abs(dy) > rr + 2) continue;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr) {
          if (it === 0 && a.lv === b.lv && d2 < (rr + 1.5) ** 2) merges.push([a, b]);
          continue;
        }
        const d = Math.sqrt(d2) || .01, ov = rr - d, nx = dx / d, ny = dy / d;
        if (it === 0 && a.lv === b.lv) merges.push([a, b]);
        const ma = a.r * a.r, mb = b.r * b.r, tot = ma + mb;
        a.x -= nx * ov * mb / tot; a.y -= ny * ov * mb / tot;
        b.x += nx * ov * ma / tot; b.y += ny * ov * ma / tot;
      }
    }
    for (const b of bs) {
      if (b.x - b.r < L) { b.x = L + b.r; }
      if (b.x + b.r > R) { b.x = R - b.r; }
      if (b.y + b.r > FLOOR) {
        b.y = FLOOR - b.r;
        b.px = b.x - (b.x - b.px) * .92; // 地面摩擦
      }
    }
  }
  for (const [a, b] of merges) {
    if (a.dead || b.dead || a.age < .04 || b.age < .04) continue;
    a.dead = b.dead = true;
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const vx = ((a.x - a.px) + (b.x - b.px)) / 2, vy = ((a.y - a.py) + (b.y - b.py)) / 2;
    burst(mx, my, FRUITS[a.lv].c, 10 + a.lv * 3);
    if (a.lv === MAX_LV) {
      gain(SCORES[MAX_LV] * 2, mx, my);
      G.shake = .6; sfx.melon();
    } else {
      const nl = a.lv + 1;
      addBody(nl, mx, my, vx, vy, true).age = .05;
      gain(SCORES[nl], mx, my);
      sfx.merge(nl);
      if (nl > G.maxLv) G.maxLv = nl;
      if (nl === MAX_LV) { G.banner = 2.4; G.shake = .5; sfx.melon(); burst(mx, my, '#fde047', 60); }
    }
  }
  if (merges.length) G.bodies = bs.filter(b => !b.dead);
}
function gain(n, x, y) {
  G.score += n;
  G.pops.push({ x, y, txt: '+' + n, t: .9 });
  if (G.score > store.best) store.best = G.score;
}
function burst(x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = 80 + Math.random() * 260;
    G.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 120, t: .5 + Math.random() * .5, c: color, r: 2 + Math.random() * 3.5 });
  }
}

function update(dt) {
  G.t += dt;
  if (G.keys.l) G.aimX -= 420 * dt;
  if (G.keys.r) G.aimX += 420 * dt;
  clampAim();
  if (G.cool > 0) G.cool -= dt;
  G.acc = Math.min((G.acc || 0) + dt, DT * SUB * 3);
  while (G.acc >= DT) { physics(); G.acc -= DT; }
  // 越线判定：稳定后的水果顶部高过警戒线持续 2.5 秒即失败
  let over = false;
  for (const b of G.bodies) if (b.age > 1.2 && b.y - b.r < DANGER) { over = true; break; }
  if (over) {
    G.dangerT += dt;
    G.warnT -= dt;
    if (G.warnT <= 0) { sfx.warn(); G.warnT = .5; }
    if (G.dangerT > 2.5) return gameOver();
  } else G.dangerT = Math.max(0, G.dangerT - dt * 2);
  stepFx(dt);
}
function stepFx(dt) {
  for (const p of G.parts) { p.vy += 900 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.t -= dt; }
  G.parts = G.parts.filter(p => p.t > 0);
  for (const p of G.pops) { p.y -= 40 * dt; p.t -= dt; }
  G.pops = G.pops.filter(p => p.t > 0);
  if (G.shake > 0) G.shake -= dt;
  if (G.banner > 0) G.banner -= dt;
}
function gameOver() {
  G.state = 'over'; sfx.over(); G.shake = .4;
  $('over-title').textContent = T('overTitle');
  $('over-sub').textContent = T('overSub', G.score, FRUITS[G.maxLv].e);
  setTimeout(() => { if (G.state === 'over') showScreen('over'); }, 700);
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
let pressing = false;
canvas.addEventListener('pointermove', e => { if (G.state === 'play') G.aimX = toLocal(e)[0]; });
canvas.addEventListener('pointerdown', e => { if (G.state === 'play') { pressing = true; G.aimX = toLocal(e)[0]; } });
canvas.addEventListener('pointerup', e => {
  if (!pressing) return;
  pressing = false;
  G.aimX = toLocal(e)[0];
  drop();
});
canvas.addEventListener('pointercancel', () => { pressing = false; });
window.addEventListener('keydown', e => {
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') { G.keys.l = true; e.preventDefault(); }
  else if (e.code === 'ArrowRight' || e.code === 'KeyD') { G.keys.r = true; e.preventDefault(); }
  else if (e.code === 'Space' || e.code === 'ArrowDown' || e.code === 'KeyS' || e.code === 'Enter') {
    e.preventDefault();
    if (G.state === 'play') drop();
    else if (G.state === 'menu' || G.state === 'over') startGame();
  } else if (e.code === 'KeyR') { if (G.state === 'over' || G.state === 'menu') startGame(); }
  else if (e.code === 'KeyM') toggleMute();
  else if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
});
window.addEventListener('keyup', e => {
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') G.keys.l = false;
  if (e.code === 'ArrowRight' || e.code === 'KeyD') G.keys.r = false;
});
$('btn-start').onclick = startGame;
$('btn-retry').onclick = startGame;
$('btn-menu').onclick = () => { G.state = 'menu'; showScreen('menu'); $('menu-best').textContent = T('best', store.best); };
function toggleMute() {
  muted = !muted; store.muted = muted;
  $('btn-mute').textContent = muted ? '🔇' : '🔊';
}
$('btn-mute').onclick = toggleMute;
$('btn-mute').textContent = muted ? '🔇' : '🔊';
window.__refreshLang = function () {
  AMG.apply(STR);
  $('btn-mute').title = T('muteTitle');
  $('menu-best').textContent = T('best', store.best);
};
AMG.mountBtn();
window.__refreshLang();

// ---------- 渲染 ----------
function drawFruit(lv, x, y, r, ang, alpha) {
  const sp = sprites[lv], k = r / FRUITS[lv].r, s = sp.size * k;
  ctx.save();
  if (alpha !== undefined) ctx.globalAlpha = alpha;
  ctx.translate(x, y); ctx.rotate(ang || 0);
  ctx.drawImage(sp.c, -s / 2, -s / 2, s, s);
  ctx.restore();
}
function render() {
  const sh = G.shake > 0 ? G.shake * 8 : 0;
  ctx.save();
  ctx.translate((Math.random() - .5) * sh, (Math.random() - .5) * sh);
  // 背景
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#fff3d6'); bg.addColorStop(1, '#ffd9a0');
  ctx.fillStyle = bg; ctx.fillRect(-10, -10, W + 20, H + 20);
  // HUD
  ctx.fillStyle = '#7c4a12'; ctx.textAlign = 'left'; ctx.font = '900 14px system-ui';
  ctx.fillText(T('hudScore'), 26, 30);
  ctx.font = '900 34px system-ui'; ctx.fillStyle = '#c2410c';
  ctx.fillText(G.score, 26, 66);
  ctx.font = '800 13px system-ui'; ctx.fillStyle = '#9a6b33';
  ctx.fillText(T('hudBest') + ' ' + Math.max(store.best, G.score), 26, 88);
  ctx.textAlign = 'center'; ctx.fillStyle = '#7c4a12'; ctx.font = '900 14px system-ui';
  ctx.fillText(T('hudNext'), W - 62, 30);
  ctx.fillStyle = 'rgba(255,255,255,.6)';
  ctx.beginPath(); ctx.arc(W - 62, 66, 28, 0, 7); ctx.fill();
  if (G.state !== 'menu') drawFruit(G.next, W - 62, 66, Math.min(24, FRUITS[G.next].r), 0);
  // 箱子
  ctx.fillStyle = 'rgba(255,248,235,.75)';
  ctx.fillRect(L, TOP, R - L, FLOOR - TOP);
  ctx.fillStyle = '#b7793a';
  ctx.fillRect(L - 12, TOP, 12, FLOOR - TOP + 12);
  ctx.fillRect(R, TOP, 12, FLOOR - TOP + 12);
  ctx.fillRect(L - 12, FLOOR, R - L + 24, 14);
  ctx.fillStyle = '#d29a5c';
  ctx.fillRect(L - 12, TOP, 4, FLOOR - TOP + 12); ctx.fillRect(R + 8, TOP, 4, FLOOR - TOP + 12);
  // 警戒线
  const near = G.bodies.some(b => b.age > .8 && b.y - b.r < DANGER + 50);
  ctx.setLineDash([10, 8]); ctx.lineWidth = 2;
  ctx.strokeStyle = G.dangerT > 0 ? (Math.floor(G.t * 8) % 2 ? '#ef4444' : '#fca5a5') : (near ? 'rgba(239,68,68,.75)' : 'rgba(180,120,60,.35)');
  ctx.beginPath(); ctx.moveTo(L, DANGER); ctx.lineTo(R, DANGER); ctx.stroke();
  ctx.setLineDash([]);
  // 待投放水果 + 瞄准线
  if (G.state === 'play' || G.state === 'pause') {
    const r = FRUITS[G.cur].r;
    let hitY = FLOOR;
    for (const b of G.bodies) {
      const dx = Math.abs(b.x - G.aimX);
      if (dx < b.r + r) { const top = b.y - Math.sqrt(Math.max(0, (b.r + r) ** 2 - dx * dx)); if (top < hitY) hitY = top; }
    }
    ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 2; ctx.setLineDash([4, 6]);
    ctx.beginPath(); ctx.moveTo(G.aimX, HOLD_Y + r); ctx.lineTo(G.aimX, Math.max(HOLD_Y + r, hitY)); ctx.stroke();
    ctx.setLineDash([]);
    drawFruit(G.cur, G.aimX, HOLD_Y, r, 0, G.cool > 0 ? .35 : 1);
  }
  for (const b of G.bodies) drawFruit(b.lv, b.x, b.y, b.r, b.ang);
  for (const p of G.parts) {
    ctx.globalAlpha = Math.min(1, p.t * 2); ctx.fillStyle = p.c;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.font = '900 18px system-ui'; ctx.textAlign = 'center';
  for (const p of G.pops) {
    ctx.globalAlpha = Math.min(1, p.t * 2);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.strokeText(p.txt, p.x, p.y);
    ctx.fillStyle = '#c2410c'; ctx.fillText(p.txt, p.x, p.y);
  }
  ctx.globalAlpha = 1;
  if (G.banner > 0) {
    const k = Math.min(1, (2.4 - G.banner) * 4);
    ctx.save(); ctx.translate(W / 2, 330); ctx.scale(k, k);
    ctx.font = '900 40px system-ui'; ctx.textAlign = 'center';
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 8; ctx.strokeText(T('melon'), 0, 0);
    ctx.fillStyle = '#16a34a'; ctx.fillText(T('melon'), 0, 0);
    ctx.restore();
  }
  if (G.state === 'pause') {
    ctx.fillStyle = 'rgba(80,45,10,.55)'; ctx.fillRect(L, TOP, R - L, FLOOR - TOP);
    ctx.fillStyle = '#fff'; ctx.font = '900 32px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(T('paused'), W / 2, (TOP + FLOOR) / 2);
  }
  ctx.restore();
}

let last = performance.now();
function loop(now) {
  const dt = Math.min((now - last) / 1000, .05);
  last = now;
  if (G.state === 'play') update(dt);
  else if (G.state === 'over') stepFx(dt);
  render();
  requestAnimationFrame(loop);
}
reset();
requestAnimationFrame(t => { last = t; requestAnimationFrame(loop); });
window.__game = G;
window.__gameApi = { startGame, drop, physics, addBody, FRUITS, DANGER };
window.__gameErrors = [];
window.addEventListener('error', e => window.__gameErrors.push(String(e.message)));
})();
