'use strict';
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const chance = p => Math.random() < p;
const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };

class Starfield {
  constructor(n = 90) { this.stars = []; for (let i = 0; i < n; i++) this.stars.push({ x: Math.random() * CFG.W, y: Math.random() * CFG.H, s: rand(0.5, 2.2), v: rand(20, 120) }); }
  update(dt, speed = 1) { for (const s of this.stars) { s.y += s.v * speed * dt; if (s.y > CFG.H) { s.y = -4; s.x = Math.random() * CFG.W; } } }
  draw(ctx) { ctx.save(); for (const s of this.stars) { ctx.globalAlpha = 0.35 + s.s * 0.25; ctx.fillStyle = '#bfe9ff'; ctx.fillRect(s.x, s.y, s.s, s.s * 2.2); } ctx.restore(); }
}

function spawnExplosion(arr, x, y, scale = 1, colors = ['#ffd34d', '#ff7a3d', '#ff3d6e', '#ffffff']) {
  for (let i = 0; i < 14 * scale; i++) {
    const a = Math.random() * Math.PI * 2, sp = rand(40, 320) * scale;
    arr.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, ttl: rand(0.3, 0.8), age: 0, r: rand(1.5, 4.5) * scale, c: colors[i % colors.length] });
  }
  arr.push({ x, y, vx: 0, vy: 0, ttl: 0.18, age: 0, r: 26 * scale, c: '#ffffff', flash: true });
}
function updateParts(arr, dt) {
  for (let i = arr.length - 1; i >= 0; i--) {
    const p = arr[i]; p.age += dt;
    if (p.age >= p.ttl) { arr.splice(i, 1); continue; }
    p.x += (p.vx || 0) * dt; p.y += (p.vy || 0) * dt;
    p.vx *= (1 - 2.2 * dt); p.vy *= (1 - 2.2 * dt);
  }
}
function drawParts(ctx, arr) {
  for (const p of arr) {
    const k = 1 - p.age / p.ttl;
    ctx.globalAlpha = p.flash ? k : k * 0.9;
    ctx.fillStyle = p.c;
    ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.5, p.r * (p.flash ? k : 1)), 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawFighter(ctx, x, y, scheme, tilt = 0, opts = {}) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(tilt * 0.18);
  const body = scheme === 0 ? '#ff5d7e' : '#5d9bff';
  const dark = scheme === 0 ? '#a3122e' : '#123a8f';
  const glow = scheme === 0 ? '#ff9db1' : '#a9c8ff';
  if (opts.engineFlame !== false) {
    const f = 10 + Math.random() * 8 + (opts.thrust || 0);
    const g = ctx.createLinearGradient(0, 10, 0, 10 + f + 10);
    g.addColorStop(0, '#fff'); g.addColorStop(0.4, '#7dffcb'); g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(-4, 10); ctx.lineTo(0, 14 + f); ctx.lineTo(4, 10); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = dark;
  ctx.beginPath(); ctx.moveTo(-13, 6); ctx.lineTo(-20, 12); ctx.lineTo(-8, 10); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(13, 6); ctx.lineTo(20, 12); ctx.lineTo(8, 10); ctx.closePath(); ctx.fill();
  const bg = ctx.createLinearGradient(0, -16, 0, 12);
  bg.addColorStop(0, '#ffffff'); bg.addColorStop(0.35, body); bg.addColorStop(1, dark);
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.moveTo(0, -17); ctx.lineTo(6, -4); ctx.lineTo(6, 10); ctx.lineTo(-6, 10); ctx.lineTo(-6, -4); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#eaffff';
  ctx.beginPath(); ctx.ellipse(0, -6, 2.6, 5, 0, 0, 7); ctx.fill();
  ctx.fillStyle = glow; ctx.globalAlpha = 0.85;
  ctx.fillRect(-6, 2, 12, 2);
  ctx.globalAlpha = 1;
  if (opts.shield) {
    ctx.strokeStyle = `rgba(80,255,220,${0.55 + Math.random() * 0.3})`; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(0, -2, 20 + Math.sin(Date.now() / 90) * 1.5, 0, 7); ctx.stroke();
  }
  if (opts.inv) {
    ctx.globalAlpha = 0.35 + 0.3 * Math.sin(Date.now() / 60);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, -2, 24, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function drawOption(ctx, x, y, scheme) {
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = scheme === 0 ? '#ff8ba0' : '#8bb4ff';
  ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 10;
  ctx.beginPath(); ctx.arc(0, 0, 6, 0, 7); ctx.fill();
  ctx.shadowBlur = 0; ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(0, 0, 2.4, 0, 7); ctx.fill();
  ctx.restore();
}

const POW_COLOR = { V: '#ff3d6e', L: '#38a1ff', E: '#b46bff', P: '#ffd34d', M: '#ffb03d', B: '#38e1ff', O: '#3dff9b', S: '#ffffff', MEDAL: '#ffd34d', FAIRY: '#ff9de2', MICLUS: '#9dff57' };
function drawPower(ctx, p) {
  ctx.save(); ctx.translate(p.x, p.y);
  const bob = Math.sin(p.t * 5) * 2; ctx.translate(0, bob);
  if (p.kind === 'MEDAL') {
    ctx.rotate(Math.sin(p.t * 6) * 0.4);
    ctx.fillStyle = '#ffd34d'; ctx.strokeStyle = '#8a5f00'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0, 0, 9, 11, 0, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#8a5f00'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('★', 0, 1);
  } else if (p.kind === 'FAIRY') {
    ctx.fillStyle = '#ff9de2'; ctx.shadowColor = '#ff9de2'; ctx.shadowBlur = 12;
    ctx.beginPath(); ctx.arc(0, 0, 9, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('🧚', 0, 3.5);
  } else if (p.kind === 'MICLUS') {
    ctx.fillStyle = '#9dff57'; ctx.fillRect(-8, -6, 16, 12);
    ctx.fillStyle = '#1a3a00'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('牛', 0, 4);
  } else {
    const c = POW_COLOR[p.kind] || '#fff';
    ctx.shadowColor = c; ctx.shadowBlur = 12;
    ctx.fillStyle = '#0a152c'; ctx.strokeStyle = c; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(0, 0, 11, 0, 7); ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0; ctx.fillStyle = c; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(p.kind, 0, 1);
  }
  ctx.restore();
}

function drawEnemy(ctx, e) {
  ctx.save(); ctx.translate(e.x, e.y);
  const flash = e.flash > 0;
  const body = c => flash ? '#ffffff' : c;
  switch (e.type) {
    case 'scout':
      ctx.rotate(Math.PI + Math.sin(e.t * 3) * 0.2);
      ctx.fillStyle = body('#c33'); ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(9, 8); ctx.lineTo(0, 3); ctx.lineTo(-9, 8); ctx.closePath(); ctx.fill();
      ctx.fillStyle = body('#ff8'); ctx.fillRect(-2, -2, 4, 6);
      break;
    case 'weaver':
      ctx.fillStyle = body('#c65df0');
      ctx.beginPath(); ctx.ellipse(0, 0, 12, 8, Math.sin(e.t * 4) * 0.3, 0, 7); ctx.fill();
      ctx.fillStyle = body('#f3c'); ctx.beginPath(); ctx.arc(0, 0, 4, 0, 7); ctx.fill();
      break;
    case 'chopper':
      ctx.fillStyle = body('#5d8f5d');
      ctx.fillRect(-10, -4, 20, 8); ctx.fillStyle = body('#2e4d2e'); ctx.fillRect(-3, -8, 6, 16);
      ctx.strokeStyle = body('#cfe8cf'); ctx.lineWidth = 2;
      const r = e.t * 20 % Math.PI;
      ctx.beginPath(); ctx.moveTo(Math.cos(r) * -22, -8); ctx.lineTo(Math.cos(r) * 22, -8); ctx.stroke();
      break;
    case 'tank':
      ctx.fillStyle = body('#8a7a3a'); ctx.fillRect(-13, -8, 26, 14);
      ctx.fillStyle = body('#5e521f'); ctx.fillRect(-16, -4, 32, 5); ctx.fillRect(-16, 5, 32, 5);
      ctx.fillStyle = body('#d8c85d'); ctx.fillRect(-2, -16, 4, 12);
      break;
    case 'turret':
      ctx.fillStyle = body('#666'); ctx.beginPath(); ctx.arc(0, 0, 12, 0, 7); ctx.fill();
      ctx.rotate(e.aim || 0);
      ctx.fillStyle = body('#f66'); ctx.fillRect(-2, 0, 4, 18);
      break;
    case 'gunboat':
      ctx.fillStyle = body('#3a6e8a'); ctx.beginPath(); ctx.moveTo(0, 18); ctx.lineTo(12, -8); ctx.lineTo(5, -14); ctx.lineTo(-5, -14); ctx.lineTo(-12, -8); ctx.closePath(); ctx.fill();
      ctx.fillStyle = body('#9adcff'); ctx.fillRect(-3, -20, 6, 8);
      break;
    case 'splitter':
      ctx.fillStyle = body('#3dff9b');
      for (let i = 0; i < 3; i++) { ctx.save(); ctx.rotate(i * 2.09 + e.t); ctx.fillRect(-3, -12, 6, 24); ctx.restore(); }
      ctx.fillStyle = body('#0a4d2e'); ctx.beginPath(); ctx.arc(0, 0, 5, 0, 7); ctx.fill();
      break;
    case 'kami':
      ctx.rotate(e.t * 6);
      ctx.fillStyle = body('#ff7a3d');
      ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(8, 0); ctx.lineTo(0, 11); ctx.lineTo(-8, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, 3, 0, 7); ctx.fill();
      break;
    case 'carrier':
      ctx.fillStyle = body('#7a5dc8');
      ctx.fillRect(-26, -10, 52, 22); ctx.fillStyle = body('#4a3585'); ctx.fillRect(-26, -14, 52, 6);
      ctx.fillStyle = '#ffd34d';
      for (let i = -2; i <= 2; i++) ctx.fillRect(i * 10 - 2, -4, 4, 8);
      break;
    default:
      ctx.fillStyle = body('#f66'); ctx.beginPath(); ctx.arc(0, 0, 10, 0, 7); ctx.fill();
  }
  if (e.hp < e.maxhp && e.maxhp > 3) {
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(-12, -20, 24, 3);
    ctx.fillStyle = '#3dff6b'; ctx.fillRect(-12, -20, 24 * (e.hp / e.maxhp), 3);
  }
  ctx.restore();
}
