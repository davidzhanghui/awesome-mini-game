(() => {
'use strict';
// 雷电：纵版射击。六个战区（程序化地景）+ 六只多阶段 Boss；红/蓝/紫三色主武器 + 导弹副武器 + 雷击炸弹；
// 支持单人 / 双人同屏 / 手柄 / 触屏拖动。逻辑坐标 480×720。
const { $, T } = KIT;
const store = KIT.store('amg-raiden');
const W = 480, H = 720, TAU = Math.PI * 2;
const cv = $('game'), frame = $('frame');
const ctx = KIT.canvas(cv, W, H);
const rand = KIT.rand, clamp = KIT.clamp;
const hash = (a, b = 0) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---------------- 设置 ----------------
const DIFFS = [
  { bs: 0.78, fire: 0.62, hp: 0.8, stock: 3 },
  { bs: 1, fire: 1, hp: 1, stock: 2 },
  { bs: 1.18, fire: 1.38, hp: 1.15, stock: 2 }
];
let diff = clamp(store.get('diff', 1), 0, 2), nP = store.get('players', 1) === 2 ? 2 : 1;
let pickStage = 0, unlock = clamp(store.get('unlock', 0), 0, 5);
let loop = 0;
const BS = () => DIFFS[diff].bs * (1 + loop * 0.18);
const FIRE = () => DIFFS[diff].fire * (1 + loop * 0.3);

// ---------------- 音效 ----------------
const lastS = {};
function thr(k, gap) { const n = performance.now(); if (lastS[k] && n - lastS[k] < gap) return false; lastS[k] = n; return true; }
const sfx = {
  shot: () => thr('shot', 90) && KIT.tone(880, 0.03, { type: 'square', vol: 0.012, to: 600 }),
  laser: () => thr('laser', 110) && KIT.tone(1500, 0.06, { type: 'sawtooth', vol: 0.01, to: 900 }),
  zap: () => thr('zap', 120) && KIT.noise(0.08, { vol: 0.03, hp: 2500 }),
  hit: () => thr('hit', 60) && KIT.tone(260, 0.03, { type: 'square', vol: 0.014 }),
  boom: () => thr('boom', 50) && (KIT.noise(0.28, { vol: 0.11, lp: 1100 }), KIT.tone(140, 0.2, { type: 'sine', vol: 0.06, to: 50 })),
  bigBoom: () => { KIT.noise(0.9, { vol: 0.26, lp: 700 }); KIT.tone(90, 0.7, { type: 'sine', vol: 0.14, to: 30 }); },
  item: () => KIT.arp([660, 880, 1320], 0.04, { vol: 0.06, dur: 0.1 }),
  power: () => KIT.arp([523, 659, 784, 1046, 1318], 0.05, { type: 'square', vol: 0.045, dur: 0.12 }),
  medal: v => KIT.tone(1200 + Math.min(v, 10) * 60, 0.12, { type: 'sine', vol: 0.06 }),
  bomb: () => { KIT.noise(1.6, { vol: 0.3, lp: 2400 }); KIT.tone(60, 1.2, { type: 'sawtooth', vol: 0.08, to: 30 }); },
  die: () => { KIT.noise(0.8, { vol: 0.25, lp: 900 }); KIT.arp([523, 392, 311, 233], 0.1, { type: 'square', vol: 0.05, dur: 0.18, delay: 0.1 }); },
  siren: i => KIT.tone(i % 2 ? 440 : 620, 0.35, { type: 'sawtooth', vol: 0.045 }),
  oneUp: () => KIT.arp([784, 988, 1175, 1568, 1976], 0.07, { type: 'square', vol: 0.05, dur: 0.14 }),
  tally: () => KIT.tone(1046, 0.05, { type: 'square', vol: 0.03 }),
  beamWarn: () => thr('bw', 200) && KIT.tone(1800, 0.12, { type: 'square', vol: 0.03 }),
  beam: () => KIT.noise(0.7, { vol: 0.12, hp: 600 })
};

// ---------------- 地景 ----------------
const SEG = 240;
const decor = new Map();
function riverX(wy) { return W / 2 + Math.sin(wy * 0.0042) * 120 + Math.sin(wy * 0.011) * 36; }
const sy = wy => H - (wy - scroll);            // 世界纵坐标 → 屏幕
function blob(R, r, n = 14) { const p = []; for (let i = 0; i < n; i++) p.push(r * (0.72 + R() * 0.38)); return p; }
function drawBlob(c, x, y, pts, k, fill) {
  c.beginPath();
  const n = pts.length;
  for (let i = 0; i <= n; i++) {
    const a = i / n * TAU, r = pts[i % n] * k;
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r * 0.8;
    i ? c.lineTo(px, py) : c.moveTo(px, py);
  }
  c.closePath(); c.fillStyle = fill; c.fill();
}

const BG = [
  { // 0 海岸防线
    base(c) {
      const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0c5385'); g.addColorStop(1, '#1479ad');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.strokeStyle = 'rgba(255,255,255,.17)'; c.lineWidth = 2;
      const st = 44, b0 = Math.floor(scroll / st);
      for (let r = -2; r < H / st + 2; r++) {
        const row = b0 + r, y = sy(row * st);
        for (let i = 0; i < 4; i++) {
          const x = hash(row, i) * W + Math.sin(gt * 0.9 + row + i) * 9;
          c.beginPath(); c.moveTo(x - 13, y); c.quadraticCurveTo(x, y - 5, x + 13, y); c.stroke();
        }
      }
    },
    gen(k, R) {
      const L = [];
      if (R() < 0.6) { const r = 40 + R() * 70; L.push({ kd: 'island', x: R() * W, wy: k * SEG + R() * SEG, r, pts: blob(R, r), palms: 2 + (R() * 4 | 0), seed: R() }); }
      if (R() < 0.5) L.push({ kd: 'rock', x: R() * W, wy: k * SEG + R() * SEG, r: 8 + R() * 10, pts: blob(R, 10, 8) });
      return L;
    },
    draw(c, d, y) {
      if (d.kd === 'island') {
        drawBlob(c, d.x, y, d.pts, 1.35, 'rgba(120,210,230,.35)');
        drawBlob(c, d.x, y, d.pts, 1.0, '#e8d39b');
        drawBlob(c, d.x, y - 3, d.pts, 0.72, '#4f9e48');
        drawBlob(c, d.x - 4, y - 8, d.pts, 0.42, '#63b55a');
        for (let i = 0; i < d.palms; i++) {
          const a = d.seed * 9 + i * 2.1, px = d.x + Math.cos(a) * d.r * 0.4, py = y + Math.sin(a) * d.r * 0.3;
          c.fillStyle = '#2f6e2c';
          for (let j = 0; j < 5; j++) { c.beginPath(); c.ellipse(px + Math.cos(j * 1.26) * 6, py + Math.sin(j * 1.26) * 6, 7, 3, j * 1.26, 0, TAU); c.fill(); }
        }
      } else { drawBlob(c, d.x, y, d.pts, d.r / 10 * 1.4, 'rgba(255,255,255,.25)'); drawBlob(c, d.x, y, d.pts, d.r / 10, '#5d6b72'); }
    },
    clouds: true
  },
  { // 1 沙漠基地
    base(c) {
      const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#d4ad62'); g.addColorStop(1, '#c79a50');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.strokeStyle = 'rgba(130,85,30,.16)'; c.lineWidth = 7;
      const st = 70, b0 = Math.floor(scroll / st);
      for (let r = -2; r < H / st + 2; r++) {
        const row = b0 + r, y = sy(row * st), ph = hash(row) * 6;
        c.beginPath();
        for (let x = 0; x <= W; x += 20) { const yy = y + Math.sin(x * 0.02 + ph) * 10; x ? c.lineTo(x, yy) : c.moveTo(x, yy); }
        c.stroke();
      }
    },
    gen(k, R) {
      const L = [], wy = k * SEG;
      const r = R();
      if (r < 0.22) L.push({ kd: 'runway', x: 60 + R() * (W - 120), wy: wy + SEG / 2 });
      else if (r < 0.5) L.push({ kd: 'hangar', x: 50 + R() * (W - 100), wy: wy + R() * SEG, w: 70 + R() * 40 });
      else if (r < 0.62) L.push({ kd: 'pyramid', x: 60 + R() * (W - 120), wy: wy + R() * SEG, s: 40 + R() * 30 });
      for (let i = 0; i < 2; i++) if (R() < 0.6) L.push({ kd: 'rock', x: R() * W, wy: wy + R() * SEG, r: 8 + R() * 16, pts: blob(R, 10, 9) });
      if (R() < 0.15) L.push({ kd: 'oasis', x: R() * W, wy: wy + R() * SEG, pts: blob(R, 30, 12) });
      return L;
    },
    draw(c, d, y) {
      if (d.kd === 'runway') {
        c.fillStyle = '#6f6a62'; c.fillRect(d.x - 32, y - 150, 64, 300);
        c.fillStyle = '#e9e2cf'; for (let i = -140; i < 140; i += 34) c.fillRect(d.x - 2, y + i, 4, 18);
        c.fillStyle = 'rgba(255,255,255,.5)'; c.fillRect(d.x - 30, y - 150, 3, 300); c.fillRect(d.x + 27, y - 150, 3, 300);
      } else if (d.kd === 'hangar') {
        c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(d.x - d.w / 2 + 6, y - 22, d.w, 46);
        c.fillStyle = '#9b958a'; c.fillRect(d.x - d.w / 2, y - 26, d.w, 46);
        c.fillStyle = '#b8b2a5'; for (let i = 0; i < d.w; i += 10) c.fillRect(d.x - d.w / 2 + i, y - 26, 5, 46);
        c.fillStyle = '#4a463f'; c.fillRect(d.x - 14, y + 10, 28, 10);
      } else if (d.kd === 'pyramid') {
        c.fillStyle = '#e0bd76'; c.beginPath(); c.moveTo(d.x, y - d.s); c.lineTo(d.x + d.s, y + d.s * 0.7); c.lineTo(d.x, y + d.s * 0.7); c.fill();
        c.fillStyle = '#a77d3e'; c.beginPath(); c.moveTo(d.x, y - d.s); c.lineTo(d.x - d.s, y + d.s * 0.7); c.lineTo(d.x, y + d.s * 0.7); c.fill();
      } else if (d.kd === 'oasis') {
        drawBlob(c, d.x, y, d.pts, 1.4, '#7ea852'); drawBlob(c, d.x, y, d.pts, 0.9, '#3d93b8'); drawBlob(c, d.x - 3, y - 3, d.pts, 0.5, '#5fb5d4');
      } else { drawBlob(c, d.x + 4, y + 4, d.pts, d.r / 10, 'rgba(90,60,20,.25)'); drawBlob(c, d.x, y, d.pts, d.r / 10, '#9b7a4a'); drawBlob(c, d.x - 2, y - 3, d.pts, d.r / 16, '#b59360'); }
    },
    clouds: true
  },
  { // 2 丛林河谷
    base(c) {
      c.fillStyle = '#2d6a2e'; c.fillRect(0, 0, W, H);
      const st = 36, b0 = Math.floor(scroll / st);
      for (let r = -2; r < H / st + 2; r++) {
        const row = b0 + r, y = sy(row * st);
        for (let i = 0; i < 7; i++) {
          c.fillStyle = i % 2 ? 'rgba(20,70,25,.55)' : 'rgba(80,150,70,.35)';
          c.beginPath(); c.arc(hash(row, i) * W, y + hash(i, row) * 20, 10 + hash(row + i) * 14, 0, TAU); c.fill();
        }
      }
      const L = [], Rr = [];
      for (let y = -30; y <= H + 30; y += 15) { const cx = riverX(scroll + H - y); L.push([cx - 48, y]); Rr.push([cx + 48, y]); }
      c.beginPath(); L.forEach(([x, y], i) => i ? c.lineTo(x - 8, y) : c.moveTo(x - 8, y)); for (let i = Rr.length - 1; i >= 0; i--) c.lineTo(Rr[i][0] + 8, Rr[i][1]);
      c.fillStyle = '#b39a5e'; c.fill();
      c.beginPath(); L.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); for (let i = Rr.length - 1; i >= 0; i--) c.lineTo(Rr[i][0], Rr[i][1]);
      c.fillStyle = '#2c7ca6'; c.fill();
      c.strokeStyle = 'rgba(255,255,255,.18)'; c.lineWidth = 2;
      for (let y = -20; y < H + 20; y += 38) {
        const wy = scroll + H - y, ry = sy(Math.floor(wy / 38) * 38), cx = riverX(scroll + H - ry);
        c.beginPath(); c.moveTo(cx - 14 + Math.sin(gt + ry) * 6, ry); c.lineTo(cx + 6 + Math.sin(gt + ry) * 6, ry); c.stroke();
      }
    },
    gen(k, R) {
      const L = [];
      for (let i = 0; i < 5; i++) {
        const x = R() * W, wy = k * SEG + R() * SEG;
        if (Math.abs(x - riverX(wy)) < 85) continue;
        L.push(R() < 0.12 ? { kd: 'ruin', x, wy, s: 16 + R() * 14 } : { kd: 'tree', x, wy, r: 14 + R() * 16, n: 3 + (R() * 3 | 0), s: R() * 9 });
      }
      return L;
    },
    draw(c, d, y) {
      if (d.kd === 'tree') {
        c.fillStyle = 'rgba(0,30,0,.3)'; c.beginPath(); c.arc(d.x + 6, y + 7, d.r * 1.1, 0, TAU); c.fill();
        for (let i = 0; i < d.n; i++) {
          const a = d.s + i * 2.2, px = d.x + Math.cos(a) * d.r * 0.5, py = y + Math.sin(a) * d.r * 0.4;
          c.fillStyle = '#1f5523'; c.beginPath(); c.arc(px, py, d.r * 0.75, 0, TAU); c.fill();
          c.fillStyle = '#3c8c3a'; c.beginPath(); c.arc(px - 3, py - 3, d.r * 0.42, 0, TAU); c.fill();
        }
      } else {
        c.fillStyle = '#7d7a6c'; c.fillRect(d.x - d.s, y - d.s, d.s * 2, d.s * 2);
        c.fillStyle = '#9b9886'; c.fillRect(d.x - d.s + 4, y - d.s + 4, d.s * 2 - 8, d.s * 2 - 8);
        c.fillStyle = '#4f7d3a'; c.fillRect(d.x - d.s, y + d.s * 0.3, d.s * 0.9, d.s * 0.7);
      }
    },
    clouds: true
  },
  { // 3 冰原要塞
    base(c) {
      const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#dfe9f3'); g.addColorStop(1, '#c9d9e8');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.strokeStyle = 'rgba(110,140,175,.18)'; c.lineWidth = 3;
      const st = 90, b0 = Math.floor(scroll / st);
      for (let r = -2; r < H / st + 2; r++) {
        const row = b0 + r, y = sy(row * st), x0 = hash(row) * W;
        c.beginPath(); c.moveTo(x0 - 80, y); c.bezierCurveTo(x0 - 20, y - 30, x0 + 30, y + 30, x0 + 100, y - 6); c.stroke();
      }
    },
    gen(k, R) {
      const L = [], wy = k * SEG;
      if (R() < 0.3) L.push({ kd: 'lake', x: R() * W, wy: wy + R() * SEG, pts: blob(R, 40, 12), cr: R() * 9 });
      if (R() < 0.25) L.push({ kd: 'wall', x: 40 + R() * (W - 80), wy: wy + R() * SEG, w: 90 + R() * 90 });
      for (let i = 0; i < 4; i++) if (R() < 0.7) L.push({ kd: 'pine', x: R() * W, wy: wy + R() * SEG, s: 10 + R() * 9 });
      return L;
    },
    draw(c, d, y) {
      if (d.kd === 'lake') {
        drawBlob(c, d.x, y, d.pts, 1.05, '#a9d6ef'); drawBlob(c, d.x - 4, y - 4, d.pts, 0.7, '#c7e7f8');
        c.strokeStyle = 'rgba(255,255,255,.8)'; c.lineWidth = 1.5; c.beginPath();
        c.moveTo(d.x - 20, y - 5 + d.cr); c.lineTo(d.x, y + 3); c.lineTo(d.x + 18, y - 8); c.moveTo(d.x, y + 3); c.lineTo(d.x + 5, y + 18); c.stroke();
      } else if (d.kd === 'wall') {
        c.fillStyle = 'rgba(60,80,110,.2)'; c.fillRect(d.x - d.w / 2 + 6, y - 8, d.w, 22);
        c.fillStyle = '#8c99a8'; c.fillRect(d.x - d.w / 2, y - 12, d.w, 20);
        c.fillStyle = '#f4f8fc'; for (let i = 0; i < d.w; i += 16) c.fillRect(d.x - d.w / 2 + i, y - 16, 10, 6);
      } else {
        c.fillStyle = 'rgba(70,90,120,.22)'; c.beginPath(); c.ellipse(d.x + 6, y + d.s, d.s, d.s * 0.4, 0, 0, TAU); c.fill();
        for (let i = 0; i < 3; i++) {
          const s = d.s * (1 - i * 0.25), yy = y - i * d.s * 0.55;
          c.fillStyle = '#2f5d48'; c.beginPath(); c.moveTo(d.x, yy - s); c.lineTo(d.x + s * 0.8, yy + s * 0.4); c.lineTo(d.x - s * 0.8, yy + s * 0.4); c.fill();
          c.fillStyle = '#f7fbff'; c.beginPath(); c.moveTo(d.x, yy - s); c.lineTo(d.x + s * 0.35, yy - s * 0.4); c.lineTo(d.x - s * 0.35, yy - s * 0.4); c.fill();
        }
      }
    },
    clouds: true, snow: true
  },
  { // 4 轨道空间站
    base(c) {
      const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#05081a'); g.addColorStop(1, '#0d1230');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      const neb = (x, y, r, col) => { const ng = c.createRadialGradient(x, y, 0, x, y, r); ng.addColorStop(0, col); ng.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = ng; c.fillRect(x - r, y - r, r * 2, r * 2); };
      neb(W * 0.25, ((scroll * 0.1) % (H + 600)) - 300, 260, 'rgba(120,60,200,.22)');
      neb(W * 0.8, ((scroll * 0.1 + 500) % (H + 600)) - 300, 220, 'rgba(40,120,200,.2)');
      const py = ((scroll * 0.14) % 2200) - 500;
      if (py > -300 && py < H + 300) {
        const pg = c.createRadialGradient(W * 0.72 - 40, py - 40, 10, W * 0.72, py, 150);
        pg.addColorStop(0, '#f6b26b'); pg.addColorStop(0.6, '#b4542f'); pg.addColorStop(1, '#3a1420');
        c.fillStyle = pg; c.beginPath(); c.arc(W * 0.72, py, 150, 0, TAU); c.fill();
        c.strokeStyle = 'rgba(255,220,180,.45)'; c.lineWidth = 6; c.beginPath(); c.ellipse(W * 0.72, py, 230, 40, -0.3, 0, TAU); c.stroke();
      }
      [[0.25, 1, 50], [0.55, 1.6, 60], [1, 2.2, 70]].forEach(([sp, sz, st], li) => {
        const sc = scroll * sp, b0 = Math.floor(sc / st);
        for (let r = -1; r < H / st + 2; r++) {
          const row = b0 + r, y = H - (row * st - sc);
          for (let i = 0; i < 2; i++) {
            c.fillStyle = `rgba(255,255,255,${0.35 + li * 0.25})`;
            c.fillRect(hash(row + li * 1000, i) * W, y + hash(i, row) * st, sz, sz);
          }
        }
      });
    },
    gen(k, R) {
      const L = [], wy = k * SEG;
      if (R() < 0.35) L.push({ kd: 'panel', x: R() < 0.5 ? 70 : W - 70, wy: wy + R() * SEG, w: 120 + R() * 60, h: 80 + R() * 80, s: R() * 9 });
      if (R() < 0.5) L.push({ kd: 'astro', x: R() * W, wy: wy + R() * SEG, pts: blob(R, 10, 9), r: 8 + R() * 18, rot: R() * 6 });
      return L;
    },
    draw(c, d, y) {
      if (d.kd === 'panel') {
        c.fillStyle = '#2a3148'; c.fillRect(d.x - d.w / 2, y - d.h / 2, d.w, d.h);
        c.strokeStyle = '#47506f'; c.lineWidth = 2; c.strokeRect(d.x - d.w / 2, y - d.h / 2, d.w, d.h);
        c.beginPath(); for (let i = 20; i < d.w; i += 20) { c.moveTo(d.x - d.w / 2 + i, y - d.h / 2); c.lineTo(d.x - d.w / 2 + i, y + d.h / 2); } c.stroke();
        for (let i = 0; i < 4; i++) { c.fillStyle = Math.sin(gt * 4 + d.s + i) > 0 ? '#5df2ff' : '#1d6a78'; c.fillRect(d.x - d.w / 2 + 8 + i * 24, y - d.h / 2 + 6, 6, 4); }
      } else {
        c.save(); c.translate(d.x, y); c.rotate(d.rot + gt * 0.2);
        drawBlob(c, 0, 0, d.pts, d.r / 10, '#4b4a55'); drawBlob(c, -2, -2, d.pts, d.r / 16, '#6c6a78'); c.restore();
      }
    }
  },
  { // 5 虚空母巢
    base(c) {
      const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#22060f'); g.addColorStop(1, '#3d0b1c');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      const st = 110, b0 = Math.floor(scroll / st);
      for (let r = -2; r < H / st + 2; r++) {
        const row = b0 + r, y = sy(row * st), a = hash(row) * W, b = hash(row, 3) * W;
        c.strokeStyle = '#5a1029'; c.lineWidth = 12; c.beginPath(); c.moveTo(-20, y); c.bezierCurveTo(a, y - 60, b, y + 60, W + 20, y + 10); c.stroke();
        c.strokeStyle = `rgba(255,70,120,${0.18 + 0.12 * Math.sin(gt * 2 + row)})`; c.lineWidth = 3; c.stroke();
      }
    },
    gen(k, R) {
      const L = [];
      for (let i = 0; i < 3; i++) if (R() < 0.7) L.push({ kd: 'pod', x: R() * W, wy: k * SEG + R() * SEG, r: 8 + R() * 18, s: R() * 6 });
      return L;
    },
    draw(c, d, y) {
      const p = 1 + Math.sin(gt * 3 + d.s) * 0.08;
      c.fillStyle = '#6e1735'; c.beginPath(); c.arc(d.x, y, d.r * p, 0, TAU); c.fill();
      const g = c.createRadialGradient(d.x - d.r * 0.3, y - d.r * 0.3, 1, d.x, y, d.r * p);
      g.addColorStop(0, 'rgba(255,120,160,.8)'); g.addColorStop(1, 'rgba(255,60,110,0)');
      c.fillStyle = g; c.beginPath(); c.arc(d.x, y, d.r * p, 0, TAU); c.fill();
    }
  }
];

// 云层（比地面快的视差）
const cloudSpr = [0, 1, 2].map(i => {
  const o = document.createElement('canvas'); o.width = 300; o.height = 180;
  const c = o.getContext('2d'); const R = rng(77 + i);
  for (let j = 0; j < 9; j++) {
    const x = 60 + R() * 180, y = 60 + R() * 60, r = 30 + R() * 40;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  }
  return o;
});
function drawClouds(c, alpha) {
  const sc = scroll * 1.7, st = 260, b0 = Math.floor(sc / st);
  c.globalAlpha = alpha;
  for (let r = -1; r < H / st + 2; r++) {
    const row = b0 + r;
    if (hash(row, 9) > 0.55) continue;
    const y = H - (row * st - sc), x = hash(row, 2) * W - 150;
    c.drawImage(cloudSpr[row % 3 < 0 ? 0 : row % 3], x, y - 90, 300, 180);
  }
  c.globalAlpha = 1;
}

// ---------------- 状态 ----------------
let state = 'menu', prevState = 'play';
let gt = 0, scroll = 0, scrollSpeed = 60, stageIdx = 0, stageT = 0, evIdx = 0;
let players = [], enemies = [], ebul = [], pbul = [], items = [], craters = [], rings = [], texts = [], bolts = [], spawnQ = [], beams = [];
let boss = null, bossWarn = 0, warnStep = 0, flash = 0, flashCol = '255,255,255', shake = 0, slowT = 0, bombT = 0, bombOwner = null, bombStrikeT = 0;
let banner = null, tally = null, stats = null, continues = 0, overT = 0, hiScore = store.get('best', 0);
const parts = new KIT.Particles();
const keys = new Set();

// ---------------- 敌人定义 ----------------
const ET = {
  dart:    { hp: 3,   r: 13, score: 100,  air: true,  size: 1 },
  swoop:   { hp: 5,   r: 14, score: 150,  air: true,  size: 1 },
  heli:    { hp: 26,  r: 20, score: 400,  air: true,  size: 1.6 },
  kami:    { hp: 4,   r: 12, score: 120,  air: true,  size: 1 },
  bomber:  { hp: 170, r: 44, score: 3000, air: true,  size: 3 },
  carrier: { hp: 40,  r: 24, score: 600,  air: true,  size: 2 },
  drone:   { hp: 8,   r: 13, score: 180,  air: true,  size: 1 },
  orb:     { hp: 12,  r: 15, score: 220,  air: true,  size: 1.2 },
  emis:    { hp: 3,   r: 9,  score: 50,   air: true,  size: 0.8 },
  tank:    { hp: 18,  r: 17, score: 300,  air: false, size: 1.5 },
  turret:  { hp: 30,  r: 18, score: 500,  air: false, size: 1.6 },
  boat:    { hp: 30,  r: 20, score: 500,  air: false, size: 1.8 },
  bunker:  { hp: 55,  r: 24, score: 1000, air: false, size: 2 }
};

// ---------------- 关卡时间轴 [t, type, x(0~1), n, gap, dx, opt] ----------------
const STAGES = [
  { bg: 0, scroll: 62, bossAt: 84, boss: 'poseidon', ev: [
    [2, 'dart', .25, 5, .3, 0, { sine: 1 }], [4, 'dart', .75, 5, .3, 0, { sine: 1 }],
    [6.5, 'boat', .2, 1, 0, 0, { vx: 18 }], [7, 'boat', .8, 1, 0, 0, { vx: -18 }],
    [9, 'swoop', 0, 6, .28, 0, { side: -1, y: 110 }],
    [12, 'carrier', .5, 1, 0, 0, { drop: 'pow' }],
    [14, 'swoop', 1, 6, .28, 0, { side: 1, y: 150 }],
    [16, 'dart', .1, 5, .25, .08], [16.2, 'dart', .9, 5, .25, -.08],
    [19, 'heli', .3, 1, 0, 0, { ty: 170 }], [19.6, 'heli', .7, 1, 0, 0, { ty: 210 }],
    [23, 'boat', .3, 3, 1.1, .2, { vx: 0 }],
    [26, 'kami', .5, 6, .4, 0, { rx: 1 }],
    [29, 'carrier', .3, 1, 0, 0, { drop: 'mis' }],
    [30, 'dart', .5, 8, .22, 0, { sine: 1 }],
    [33, 'swoop', 0, 5, .3, 0, { side: -1, y: 200 }], [33, 'swoop', 1, 5, .3, 0, { side: 1, y: 200 }],
    [37, 'bomber', .5, 1, 0, 0, { drop: 'pow' }],
    [43, 'heli', .2, 3, 1.0, .3, { ty: 150 }],
    [47, 'boat', .15, 1, 0, 0, { vx: 25 }], [47, 'boat', .85, 1, 0, 0, { vx: -25 }],
    [49, 'dart', .2, 6, .25, .12],
    [52, 'carrier', .7, 1, 0, 0, { drop: 'bomb' }],
    [53, 'swoop', 1, 8, .25, 0, { side: 1, y: 120 }],
    [57, 'kami', .5, 8, .35, 0, { rx: 1 }],
    [61, 'heli', .5, 1, 0, 0, { ty: 200 }], [61, 'dart', .15, 4, .3, 0, { sine: 1 }], [61, 'dart', .85, 4, .3, 0, { sine: 1 }],
    [65, 'boat', .5, 4, .7, 0, { rx: 1 }],
    [69, 'bomber', .3, 1, 0, 0, { drop: 'pow' }],
    [71, 'swoop', 0, 6, .25, 0, { side: -1, y: 250 }],
    [75, 'carrier', .5, 1, 0, 0, { drop: 'pow' }],
    [77, 'dart', .5, 10, .2, 0, { rx: 1 }]
  ] },
  { bg: 1, scroll: 58, bossAt: 88, boss: 'scorpion', ev: [
    [2, 'dart', .3, 6, .25, .08, { sine: 1 }],
    [4, 'tank', .2, 3, .9, .1, { vx: 10 }], [5, 'tank', .8, 3, .9, -.1, { vx: -10 }],
    [8, 'swoop', 1, 6, .28, 0, { side: 1, y: 140 }],
    [10, 'turret', .25, 1], [10, 'turret', .75, 1],
    [12, 'carrier', .5, 1, 0, 0, { drop: 'pow' }],
    [15, 'bunker', .5, 1, 0, 0, { drop: 'medal' }],
    [16, 'kami', .5, 8, .3, 0, { rx: 1 }],
    [20, 'heli', .25, 2, .8, .5, { ty: 180 }],
    [23, 'tank', .1, 5, .6, .2, { vx: 0 }],
    [26, 'swoop', 0, 7, .26, 0, { side: -1, y: 120 }],
    [29, 'carrier', .4, 1, 0, 0, { drop: 'mis' }],
    [31, 'turret', .15, 3, .5, .35],
    [34, 'bomber', .5, 1, 0, 0, { drop: 'pow' }],
    [39, 'dart', .2, 8, .2, .08, { sine: 1 }],
    [42, 'bunker', .3, 1, 0, 0, { drop: 'medal' }], [42, 'bunker', .7, 1, 0, 0, { drop: 'medal' }],
    [45, 'heli', .5, 3, .6, 0, { ty: 160, rx: 1 }],
    [48, 'tank', .5, 6, .5, 0, { rx: 1 }],
    [51, 'carrier', .6, 1, 0, 0, { drop: 'bomb' }],
    [53, 'swoop', 1, 6, .25, 0, { side: 1, y: 220 }], [54, 'swoop', 0, 6, .25, 0, { side: -1, y: 160 }],
    [58, 'kami', .5, 10, .25, 0, { rx: 1 }],
    [62, 'turret', .2, 1], [62, 'turret', .5, 1], [62, 'turret', .8, 1],
    [65, 'bomber', .3, 1, 0, 0, { drop: 'pow' }], [67, 'bomber', .7, 1, 0, 0, { drop: 'medal' }],
    [72, 'heli', .2, 4, .7, .2, { ty: 190 }],
    [76, 'carrier', .5, 1, 0, 0, { drop: 'pow' }],
    [78, 'dart', .5, 12, .18, 0, { rx: 1, sine: 1 }]
  ] },
  { bg: 2, scroll: 64, bossAt: 90, boss: 'hawk', ev: [
    [2, 'swoop', 0, 6, .26, 0, { side: -1, y: 120 }],
    [4, 'boat', 0, 3, 1.2, 0, { river: 1 }],
    [6, 'dart', .2, 6, .25, .1, { sine: 1 }],
    [9, 'tank', .1, 2, .6, .05], [9.5, 'tank', .9, 2, .6, -.05],
    [12, 'carrier', .5, 1, 0, 0, { drop: 'pow' }],
    [14, 'heli', .3, 2, .5, .4, { ty: 170 }],
    [17, 'boat', 0, 4, .9, 0, { river: 1 }],
    [19, 'kami', .5, 8, .3, 0, { rx: 1 }],
    [22, 'bunker', .12, 1, 0, 0, { drop: 'medal' }], [22, 'bunker', .88, 1, 0, 0, { drop: '1up' }],
    [25, 'swoop', 1, 8, .24, 0, { side: 1, y: 180 }],
    [28, 'bomber', .5, 1, 0, 0, { drop: 'pow' }],
    [33, 'tank', .15, 4, .5, 0, { rx: 1 }],
    [35, 'carrier', .3, 1, 0, 0, { drop: 'mis' }],
    [37, 'heli', .5, 4, .5, 0, { ty: 150, rx: 1 }],
    [41, 'dart', .5, 12, .18, 0, { rx: 1 }],
    [44, 'boat', 0, 5, .7, 0, { river: 1 }],
    [47, 'turret', .1, 2, .4, .8],
    [50, 'swoop', 0, 7, .22, 0, { side: -1, y: 140 }], [51, 'swoop', 1, 7, .22, 0, { side: 1, y: 240 }],
    [55, 'carrier', .5, 1, 0, 0, { drop: 'bomb' }],
    [57, 'bomber', .25, 1, 0, 0, { drop: 'pow' }], [59, 'bomber', .75, 1, 0, 0, { drop: 'medal' }],
    [64, 'kami', .5, 12, .22, 0, { rx: 1 }],
    [68, 'heli', .2, 5, .5, .15, { ty: 200 }],
    [72, 'tank', .5, 6, .4, 0, { rx: 1 }],
    [76, 'carrier', .5, 1, 0, 0, { drop: 'pow' }],
    [79, 'dart', .3, 8, .2, .05, { sine: 1 }], [79, 'dart', .7, 8, .2, -.05, { sine: 1 }]
  ] },
  { bg: 3, scroll: 60, bossAt: 92, boss: 'citadel', ev: [
    [2, 'dart', .5, 10, .2, 0, { rx: 1, sine: 1 }],
    [5, 'turret', .2, 1], [5, 'turret', .8, 1],
    [7, 'swoop', 1, 7, .25, 0, { side: 1, y: 120 }],
    [10, 'carrier', .5, 1, 0, 0, { drop: 'pow' }],
    [12, 'tank', .15, 5, .5, .14, { vx: 8 }],
    [15, 'heli', .3, 3, .6, .2, { ty: 170 }],
    [18, 'bunker', .5, 1, 0, 0, { drop: 'medal' }],
    [20, 'kami', .5, 10, .25, 0, { rx: 1 }],
    [24, 'bomber', .5, 1, 0, 0, { drop: 'pow' }],
    [28, 'swoop', 0, 8, .22, 0, { side: -1, y: 160 }],
    [30, 'turret', .1, 5, .4, .2],
    [33, 'carrier', .3, 1, 0, 0, { drop: 'mis' }],
    [35, 'tank', .5, 8, .35, 0, { rx: 1 }],
    [38, 'heli', .5, 4, .5, 0, { ty: 190, rx: 1 }],
    [42, 'dart', .2, 10, .18, .06, { sine: 1 }],
    [45, 'bunker', .25, 1, 0, 0, { drop: 'medal' }], [45, 'bunker', .75, 1, 0, 0, { drop: 'medal' }],
    [48, 'bomber', .3, 1, 0, 0, { drop: 'pow' }], [49, 'bomber', .7, 1, 0, 0, { drop: 'bomb' }],
    [55, 'kami', .5, 14, .2, 0, { rx: 1 }],
    [59, 'swoop', 0, 8, .2, 0, { side: -1, y: 130 }], [60, 'swoop', 1, 8, .2, 0, { side: 1, y: 230 }],
    [64, 'carrier', .5, 1, 0, 0, { drop: 'pow' }],
    [66, 'turret', .2, 1], [66, 'turret', .4, 1], [66, 'turret', .6, 1], [66, 'turret', .8, 1],
    [70, 'heli', .2, 5, .4, .15, { ty: 180 }],
    [74, 'tank', .5, 8, .3, 0, { rx: 1 }],
    [78, 'carrier', .5, 1, 0, 0, { drop: 'pow' }],
    [80, 'dart', .5, 14, .15, 0, { rx: 1 }]
  ] },
  { bg: 4, scroll: 70, bossAt: 90, boss: 'eye', ev: [
    [2, 'drone', .5, 8, .3, 0, { rx: 1 }],
    [5, 'swoop', 0, 8, .22, 0, { side: -1, y: 120 }],
    [8, 'carrier', .5, 1, 0, 0, { drop: 'pow' }],
    [10, 'drone', .2, 6, .25, .12],
    [13, 'kami', .5, 10, .22, 0, { rx: 1 }],
    [16, 'turret', .15, 1], [16, 'turret', .85, 1],
    [18, 'heli', .5, 3, .6, 0, { ty: 170, rx: 1 }],
    [22, 'bomber', .5, 1, 0, 0, { drop: 'pow' }],
    [26, 'drone', .5, 14, .18, 0, { rx: 1 }],
    [30, 'swoop', 1, 9, .2, 0, { side: 1, y: 200 }],
    [33, 'carrier', .3, 1, 0, 0, { drop: 'mis' }],
    [35, 'bunker', .2, 1, 0, 0, { drop: 'medal' }], [35, 'bunker', .8, 1, 0, 0, { drop: '1up' }],
    [38, 'kami', .5, 14, .18, 0, { rx: 1 }],
    [42, 'bomber', .3, 1, 0, 0, { drop: 'pow' }], [43, 'bomber', .7, 1, 0, 0, { drop: 'medal' }],
    [48, 'drone', .1, 8, .2, .1, { sine: 1 }],
    [51, 'heli', .2, 5, .4, .15, { ty: 190 }],
    [55, 'carrier', .6, 1, 0, 0, { drop: 'bomb' }],
    [57, 'swoop', 0, 10, .18, 0, { side: -1, y: 140 }], [58, 'swoop', 1, 10, .18, 0, { side: 1, y: 240 }],
    [63, 'turret', .1, 5, .3, .2],
    [66, 'drone', .5, 18, .14, 0, { rx: 1 }],
    [71, 'bomber', .5, 1, 0, 0, { drop: 'pow' }],
    [76, 'carrier', .4, 1, 0, 0, { drop: 'pow' }],
    [78, 'kami', .5, 16, .15, 0, { rx: 1 }]
  ] },
  { bg: 5, scroll: 54, bossAt: 92, boss: 'hive', ev: [
    [2, 'orb', .5, 6, .4, 0, { rx: 1 }],
    [5, 'swoop', 1, 8, .22, 0, { side: 1, y: 140 }],
    [8, 'carrier', .5, 1, 0, 0, { drop: 'pow' }],
    [10, 'drone', .5, 10, .22, 0, { rx: 1, sine: 1 }],
    [14, 'orb', .2, 4, .4, .2],
    [17, 'heli', .3, 3, .5, .2, { ty: 170 }],
    [20, 'kami', .5, 14, .18, 0, { rx: 1 }],
    [24, 'bomber', .5, 1, 0, 0, { drop: 'pow' }],
    [28, 'orb', .5, 10, .3, 0, { rx: 1 }],
    [31, 'carrier', .3, 1, 0, 0, { drop: 'mis' }],
    [33, 'turret', .2, 1], [33, 'turret', .5, 1], [33, 'turret', .8, 1],
    [36, 'swoop', 0, 10, .18, 0, { side: -1, y: 130 }],
    [40, 'bunker', .5, 1, 0, 0, { drop: 'medal' }],
    [42, 'drone', .5, 16, .15, 0, { rx: 1 }],
    [46, 'bomber', .3, 1, 0, 0, { drop: 'pow' }], [47, 'bomber', .7, 1, 0, 0, { drop: 'bomb' }],
    [52, 'orb', .5, 12, .25, 0, { rx: 1 }],
    [56, 'heli', .2, 5, .4, .15, { ty: 200 }],
    [60, 'carrier', .5, 1, 0, 0, { drop: 'pow' }],
    [62, 'kami', .5, 18, .14, 0, { rx: 1 }],
    [67, 'swoop', 0, 10, .16, 0, { side: -1, y: 160 }], [67.5, 'swoop', 1, 10, .16, 0, { side: 1, y: 230 }],
    [72, 'bomber', .5, 1, 0, 0, { drop: 'medal' }],
    [76, 'carrier', .5, 1, 0, 0, { drop: 'bomb' }],
    [78, 'orb', .5, 14, .2, 0, { rx: 1 }]
  ] }
];

// ---------------- 子弹贴图缓存 ----------------
const sprCache = {};
function orbSpr(col, r) {
  const k = col + r;
  if (sprCache[k]) return sprCache[k];
  const s = Math.ceil(r * 3.2), o = document.createElement('canvas'); o.width = o.height = s * 2;
  const c = o.getContext('2d'), m = s;
  const g = c.createRadialGradient(m, m, 0, m, m, s);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.28, '#ffffff'); g.addColorStop(0.36, col); g.addColorStop(0.62, col + '66'); g.addColorStop(1, col + '00');
  c.fillStyle = g; c.fillRect(0, 0, s * 2, s * 2);
  return (sprCache[k] = o);
}
const BCOL = { p: '#ff4f9a', o: '#ff9a2e', b: '#4fb8ff', v: '#b36bff', g: '#5be37a', r: '#ff4b3e' };

// ---------------- 工具 ----------------
function alivePlayers() { return players.filter(p => p.alive && p.entering <= 0); }
function nearestPlayer(x, y) {
  let best = null, bd = 1e9;
  for (const p of players) { if (!p.alive) continue; const d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < bd) { bd = d; best = p; } }
  return best;
}
function aimAt(x, y) { const p = nearestPlayer(x, y); return p ? Math.atan2(p.y - y, p.x - x) : Math.PI / 2; }
function shoot(x, y, ang, spd, o = {}) {
  if (bombT > 0) return;
  const s = spd * BS();
  ebul.push({ x, y, vx: Math.cos(ang) * s, vy: Math.sin(ang) * s, r: o.r || 5, c: o.c || 'p', kind: o.kind || 0, acc: o.acc || 0, t: 0, curve: o.curve || 0 });
}
function fan(x, y, ang, n, spread, spd, o) { for (let i = 0; i < n; i++) shoot(x, y, ang + (n === 1 ? 0 : (i / (n - 1) - 0.5) * spread), spd, o); }
function ring(x, y, n, spd, off = 0, o) { for (let i = 0; i < n; i++) shoot(x, y, off + i / n * TAU, spd, o); }
const okFire = e => e.y > 10 && e.y < H * 0.72 && e.x > 0 && e.x < W;

function boom(x, y, size = 1, ground = false) {
  parts.burst(x, y, { n: 10 + size * 8, color: ['#fff3b0', '#ffc24a', '#ff7a2e', '#ff4b2e'], speed: 140 + size * 60, life: 0.5 + size * 0.15, size: 3 + size, gravity: 0, shape: 'spark' });
  parts.burst(x, y, { n: 4 + size * 4, color: ground ? ['#4a3c30', '#5d5045'] : ['#666', '#888', '#555'], speed: 40 + size * 20, life: 0.8 + size * 0.2, size: 6 + size * 3, gravity: -30 });
  rings.push({ x, y, r: 4, max: 26 + size * 24, t: 0, life: 0.35 + size * 0.08, col: '255,220,160', w: 3 + size });
  rings.push({ x, y, r: 0, max: 14 + size * 14, t: 0, life: 0.16 + size * 0.05, col: '255,255,230', fill: true });
  shake = Math.max(shake, size * 2.2);
  size >= 2.5 ? sfx.bigBoom() : sfx.boom();
}
const tintCache = {};
function tint(col) {
  if (tintCache[col]) return tintCache[col];
  if (col[0] !== '#' || col.length !== 7) return col;
  const v = [1, 3, 5].map(i => Math.round(parseInt(col.substr(i, 2), 16) * 0.7 + 255 * 0.3));
  return (tintCache[col] = '#' + v.map(x => x.toString(16).padStart(2, '0')).join(''));
}
function popText(x, y, txt, col = '#fff', big = false) { texts.push({ x, y, txt: String(txt), t: 0, col, big }); }
function addScore(p, v) { if (!p) p = players[0]; p.score += v; }

// ---------------- 玩家 ----------------
const K1 = { u: 'KeyW', d: 'KeyS', l: 'KeyA', r: 'KeyD', bomb: ['Space', 'KeyF', 'KeyK'], focus: ['ShiftLeft'] };
const K2 = { u: 'ArrowUp', d: 'ArrowDown', l: 'ArrowLeft', r: 'ArrowRight', bomb: ['Enter', 'NumpadEnter', 'KeyL', 'Slash', 'Numpad0'], focus: ['ShiftRight', 'Period'] };
const PCOL = [{ main: '#e8453c', dark: '#9b2219', light: '#ffb0a8' }, { main: '#3c8de8', dark: '#1d4f96', light: '#a8d1ff' }];
function makePlayer(id) {
  return { id, x: nP === 1 ? W / 2 : (id ? W * 0.67 : W * 0.33), y: H + 50, alive: true, entering: 0.9, stock: DIFFS[diff].stock, bombs: 3,
    wpn: 'V', lv: 1, mis: null, mlv: 0, score: 0, inv: 2.5, fireT: 0, misT: 0, bank: 0, focus: false, respawn: 0, plasma: [], medal: 0, deaths: 0, out: false };
}
function padState(i) {
  try { const gp = navigator.getGamepads && navigator.getGamepads()[i]; if (!gp) return null;
    const ax = Math.abs(gp.axes[0]) > 0.2 ? gp.axes[0] : 0, ay = Math.abs(gp.axes[1]) > 0.2 ? gp.axes[1] : 0;
    const b = n => gp.buttons[n] && gp.buttons[n].pressed;
    return { x: ax + (b(15) ? 1 : 0) - (b(14) ? 1 : 0), y: ay + (b(13) ? 1 : 0) - (b(12) ? 1 : 0), bomb: b(0) || b(1), focus: b(4) || b(5) || b(6), pause: b(9) };
  } catch (e) { return null; }
}
const padPrev = [{}, {}];
function axis(p) {
  let x = 0, y = 0, focus = false;
  const sets = nP === 1 ? [K1, K2] : [p.id ? K2 : K1];
  for (const k of sets) {
    if (keys.has(k.l)) x--; if (keys.has(k.r)) x++; if (keys.has(k.u)) y--; if (keys.has(k.d)) y++;
    if (k.focus.some(f => keys.has(f))) focus = true;
  }
  if (nP === 1 && (keys.has('ShiftLeft') || keys.has('ShiftRight'))) focus = true;
  const g = padState(p.id);
  if (g) { x += g.x; y += g.y; if (g.focus) focus = true; }
  const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
  return { x, y, focus };
}
function spawnPlayer(p) {
  p.alive = true; p.entering = 0.9; p.y = H + 50; p.x = nP === 1 ? W / 2 : (p.id ? W * 0.67 : W * 0.33);
  p.inv = 3; p.bombs = Math.max(p.bombs, 3);
}

const VULCAN = [
  [[-5, 0], [5, 0]],
  [[-5, 0], [5, 0], [-8, -0.12], [8, 0.12]],
  [[-5, 0], [5, 0], [-8, -0.1], [8, 0.1], [-10, -0.22], [10, 0.22]],
  [[-6, 0], [0, 0], [6, 0], [-8, -0.1], [8, 0.1], [-10, -0.22], [10, 0.22]],
  [[-6, 0], [0, 0], [6, 0], [-8, -0.08], [8, 0.08], [-10, -0.17], [10, 0.17], [-12, -0.28], [12, 0.28]],
  [[-6, 0], [0, 0], [6, 0], [-8, -0.08], [8, 0.08], [-10, -0.17], [10, 0.17], [-12, -0.28], [12, 0.28], [-14, -0.4], [14, 0.4]]
];
function fire(p) {
  if (p.wpn === 'V') {
    p.fireT = 0.085;
    const k = p.focus ? 0.35 : 1;
    for (const [ox, a] of VULCAN[p.lv - 1]) {
      const ang = -Math.PI / 2 + a * k;
      pbul.push({ x: p.x + ox * (p.focus ? 0.6 : 1), y: p.y - 16, vx: Math.cos(ang) * 920, vy: Math.sin(ang) * 920, dmg: p.lv >= 6 ? 1.2 : 1, kind: 'v', own: p, r: 4 });
    }
    sfx.shot();
  } else if (p.wpn === 'L') {
    p.fireT = 0.05;
    pbul.push({ x: p.x, y: p.y - 26, vx: 0, vy: -1350, w: 6 + p.lv * 3.2, h: 40, dmg: 1 + p.lv * 0.35, kind: 'l', own: p, hitSet: new Set() });
    if (p.lv >= 5) for (const s of [-1, 1]) pbul.push({ x: p.x + s * 16, y: p.y - 10, vx: s * 60, vy: -1300, w: 4, h: 30, dmg: 0.6, kind: 'l', own: p, hitSet: new Set() });
    sfx.laser();
  } else {
    p.fireT = 0.11;
    if (!p.plasma.length) pbul.push({ x: p.x, y: p.y - 20, vx: 0, vy: -1050, dmg: 2 + p.lv * 0.4, kind: 'p', own: p, r: 5 });
  }
}
function fireMissiles(p) {
  if (!p.mis || !p.mlv) return;
  if (p.mis === 'H') {
    p.misT = 0.7;
    for (let i = 0; i < p.mlv; i++) {
      const s = i % 2 ? 1 : -1;
      pbul.push({ x: p.x + s * 12, y: p.y, vx: s * (120 + i * 30), vy: -120, dmg: 6, kind: 'h', own: p, r: 5, t: 0, ang: -Math.PI / 2 + s * 0.6 });
    }
  } else {
    p.misT = 0.9;
    for (let i = 0; i < p.mlv; i++) {
      const s = i % 2 ? 1 : -1, off = Math.floor(i / 2) * 10 + 14;
      pbul.push({ x: p.x + s * off, y: p.y + 4, vx: 0, vy: -150, dmg: 12, kind: 'n', own: p, r: 6, t: 0 });
    }
  }
}
// 等离子：自动锁定，持续电击
function plasmaTargets(p) {
  const L = [];
  const range = 280 + p.lv * 40;
  for (const e of enemies) {
    if (e.dead || e.y < -10 || e.y > H) continue;
    const d = Math.hypot(e.x - p.x, e.y - p.y); if (d > range || e.y > p.y + 30) continue;
    L.push({ d, x: e.x, y: e.y, e });
  }
  if (boss && !boss.dying && boss.y > 40) {
    for (const pt of boss.parts) if (pt.alive) { const q = partPos(pt); const d = Math.hypot(q.x - p.x, q.y - p.y); if (d < range + 80) L.push({ d: d - 20, x: q.x, y: q.y, part: pt }); }
    const c = boss.hits[0], cx = boss.x + c.dx, cy = boss.y + c.dy, d = Math.hypot(cx - p.x, cy - p.y);
    if (d < range + 160) L.push({ d, x: cx, y: cy, core: true });
  }
  L.sort((a, b) => a.d - b.d);
  return L.slice(0, p.lv >= 4 ? 2 : 1);
}
function updPlayer(p, dt) {
  if (p.out) return;
  if (!p.alive) {
    p.respawn -= dt;
    if (p.respawn <= 0) { if (p.stock > 0) { p.stock--; spawnPlayer(p); } else p.out = true; }
    return;
  }
  p.inv -= dt;
  if (p.entering > 0) {
    p.entering -= dt; p.y += (H - 110 - p.y) * Math.min(1, dt * 5);
    return;
  }
  const a = axis(p);
  if (state === 'play' || state === 'clear') {
    p.focus = a.focus;
    const sp = p.focus ? 150 : 300;
    p.x += a.x * sp * dt; p.y += a.y * sp * dt;
    if (touch.on && p.id === 0) { p.x += touch.dx; p.y += touch.dy; touch.dx = touch.dy = 0; }
    p.x = clamp(p.x, 14, W - 14); p.y = clamp(p.y, 50, H - 24);
    p.bank += (a.x - p.bank) * Math.min(1, dt * 10);
  }
  if (state !== 'play') return;
  p.fireT -= dt; if (p.fireT <= 0) fire(p);
  p.misT -= dt; if (p.misT <= 0) fireMissiles(p);
  p.plasma = [];
  if (p.wpn === 'P') {
    const tg = plasmaTargets(p), dps = 24 + p.lv * 9;
    for (const t of tg) {
      p.plasma.push({ x: t.x, y: t.y });
      if (t.e) damageEnemy(t.e, dps * dt, p, true);
      else if (t.part) damagePart(t.part, dps * dt, p);
      else if (t.core) damageBoss(dps * dt, p);
    }
    if (tg.length) sfx.zap();
  }
}
function useBomb(p) {
  if (state !== 'play' || !p || !p.alive || p.entering > 0 || p.bombs <= 0 || bombT > 0) return;
  p.bombs--; bombT = 2.4; bombOwner = p; bombStrikeT = 0; p.inv = Math.max(p.inv, 2.9);
  flash = 1; flashCol = '200,230,255'; shake = 14;
  sfx.bomb();
  rings.push({ x: p.x, y: p.y, r: 10, max: 760, t: 0, life: 0.9, col: '170,220,255', w: 10 });
  for (let i = 0; i < 6; i++) strike(rand(30, W - 30), rand(60, H * 0.6));
}
function strike(x, y) {
  const pts = [], n = 12;
  for (let i = 0; i <= n; i++) pts.push([x + (i === n ? 0 : rand(-26, 26)) * (i / n), -10 + (y + 10) * i / n]);
  bolts.push({ pts, t: 0, life: 0.35 });
  rings.push({ x, y, r: 6, max: 70, t: 0, life: 0.3, col: '190,230,255', w: 5 });
  parts.burst(x, y, { n: 12, color: ['#ffffff', '#bfe6ff', '#6fc3ff'], speed: 260, life: 0.4, size: 3, gravity: 0, shape: 'spark' });
}
function killPlayer(p) {
  if (!p.alive || p.inv > 0) return;
  p.alive = false; p.respawn = 1.5; p.deaths++; stats.miss++;
  boom(p.x, p.y, 2.6); sfx.die(); flash = 0.6; flashCol = '255,255,255';
  if (p.lv > 1) { const it = spawnItem('pow', p.x, p.y); it.col = 'VLP'.indexOf(p.wpn); it.fixed = 0.8; }
  p.lv = Math.max(1, p.lv - 2); p.mlv = Math.max(0, p.mlv - 1); if (!p.mlv) p.mis = null;
  p.medal = 0;
  clearBullets(false);
}
function clearBullets(score) {
  for (const b of ebul) { parts.burst(b.x, b.y, { n: 2, color: ['#ffe680', '#fff'], speed: 60, life: 0.3, size: 2, gravity: 0 }); if (score) addScore(bombOwner, 10); }
  ebul.length = 0;
}

// ---------------- 敌人 ----------------
function spawnEnemy(type, xf, opt = {}) {
  const d = ET[type];
  const hpMul = DIFFS[diff].hp * (1 + loop * 0.3) * (nP === 2 ? 1.25 : 1);
  const e = { type, x: xf * W, y: -30, vx: 0, vy: 0, hp: d.hp * hpMul, r: d.r, air: d.air, t: 0, fireT: rand(0.5, 1.4) / FIRE(), flash: 0, drop: opt.drop, opt, ang: Math.PI / 2, dead: false };
  if (opt.rx) e.x = rand(0.1, 0.9) * W;
  switch (type) {
    case 'dart': e.vy = 190 + rand(0, 30); e.x0 = e.x; break;
    case 'swoop': {
      const side = opt.side || -1, y0 = opt.y || 120;
      e.path = [[side < 0 ? -30 : W + 30, y0], [W / 2, y0 + 280], [side < 0 ? W + 40 : -40, y0 - 30]];
      e.x = e.path[0][0]; e.y = y0; e.dur = 2.9; break;
    }
    case 'heli': e.y = -40; e.ty = opt.ty || 180; e.stay = 3.6; break;
    case 'kami': e.y = -20; e.ang = aimAt(e.x, e.y); e.spd = 250; break;
    case 'bomber': e.y = -70; e.vy = 55; e.ty = opt.ty || 150; break;
    case 'carrier': e.y = -40; e.vy = 70; e.x0 = e.x; break;
    case 'drone': e.vy = 130; e.x0 = e.x; break;
    case 'orb': e.vy = 90; break;
    case 'tank': case 'boat': e.vx = opt.vx != null ? opt.vx : rand(-14, 14); e.turret = Math.PI / 2; break;
    case 'turret': case 'bunker': e.turret = Math.PI / 2; break;
  }
  if (opt.river) { e.wy = scroll + H + 30; e.x = riverX(e.wy); e.vx = 0; }
  if (type !== 'emis' && !opt.nb) stats.spawned++;
  enemies.push(e);
  return e;
}
function bez(P, t) { const u = 1 - t; return [u * u * P[0][0] + 2 * u * t * P[1][0] + t * t * P[2][0], u * u * P[0][1] + 2 * u * t * P[1][1] + t * t * P[2][1]]; }
function updEnemy(e, dt) {
  e.t += dt; e.flash -= dt;
  if (!e.air) e.y += scrollSpeed * dt;
  const F = FIRE();
  e.fireT -= dt;
  switch (e.type) {
    case 'dart':
      e.y += e.vy * dt;
      if (e.opt.sine) e.x = e.x0 + Math.sin(e.t * 3) * 60;
      if (e.fireT <= 0 && okFire(e)) { e.fireT = 99; shoot(e.x, e.y, aimAt(e.x, e.y), 200); }
      break;
    case 'swoop': {
      const k = e.t / e.dur;
      if (k >= 1) { e.y += 0; e.x += (e.path[2][0] > W / 2 ? 1 : -1) * 300 * dt; e.y -= 60 * dt; break; }
      const [nx, ny] = bez(e.path, k); e.ang = Math.atan2(ny - e.y, nx - e.x); e.x = nx; e.y = ny;
      if (e.fireT <= 0 && okFire(e)) { e.fireT = 1.6 / F; shoot(e.x, e.y, aimAt(e.x, e.y), 210); }
      break;
    }
    case 'heli':
      if (e.t < 1.4) e.y += (e.ty - e.y) * Math.min(1, dt * 2.4);
      else if (e.t > 1.4 + e.stay) e.y -= 120 * dt * (e.t - 1.4 - e.stay);
      e.x += Math.sin(e.t * 1.3) * 20 * dt;
      if (e.fireT <= 0 && okFire(e) && e.t > 0.8) { e.fireT = 1.15 / F; fan(e.x, e.y + 8, aimAt(e.x, e.y), 3, 0.5, 190, { c: 'o' }); }
      break;
    case 'kami': {
      const p = nearestPlayer(e.x, e.y);
      if (p && e.t < 1.2) { const want = Math.atan2(p.y - e.y, p.x - e.x); let da = want - e.ang; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU; e.ang += clamp(da, -2 * dt, 2 * dt); }
      e.spd += 120 * dt; e.x += Math.cos(e.ang) * e.spd * dt; e.y += Math.sin(e.ang) * e.spd * dt;
      break;
    }
    case 'bomber':
      if (e.y < e.ty) e.y += e.vy * dt; else e.x += Math.sin(e.t * 0.6) * 30 * dt;
      if (e.t > 14) e.y += 50 * dt;
      if (e.fireT <= 0 && okFire(e)) {
        e.fireT = 1.9 / F; e.k = (e.k || 0) + 1;
        if (e.k % 2) ring(e.x, e.y, 14 + diff * 4, 150, e.k * 0.2, { c: 'v' });
        else fan(e.x, e.y + 30, aimAt(e.x, e.y), 5, 0.8, 220, { c: 'p', kind: 1 });
      }
      break;
    case 'carrier': e.y += e.vy * dt; e.x = e.x0 + Math.sin(e.t * 1.2) * 30; break;
    case 'drone':
      e.y += e.vy * dt; if (e.opt.sine) e.x = e.x0 + Math.sin(e.t * 4) * 40;
      if (e.fireT <= 0 && okFire(e) && diff > 0) { e.fireT = 2.2 / F; shoot(e.x, e.y, aimAt(e.x, e.y), 230, { c: 'b' }); }
      break;
    case 'orb': {
      const p = nearestPlayer(e.x, e.y);
      if (p) { e.vx += clamp(p.x - e.x, -1, 1) * 40 * dt; }
      e.x += e.vx * dt; e.y += e.vy * dt;
      if (e.fireT <= 0 && okFire(e)) { e.fireT = 2 / F; ring(e.x, e.y, 6, 140, e.t, { c: 'p' }); }
      break;
    }
    case 'emis': {
      const p = nearestPlayer(e.x, e.y);
      if (p && e.t < 3) { const want = Math.atan2(p.y - e.y, p.x - e.x); let da = want - e.ang; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU; e.ang += clamp(da, -1.6 * dt, 1.6 * dt); }
      e.x += Math.cos(e.ang) * 170 * dt; e.y += Math.sin(e.ang) * 170 * dt;
      if (Math.random() < 0.5) parts.burst(e.x - Math.cos(e.ang) * 8, e.y - Math.sin(e.ang) * 8, { n: 1, color: '#aaa', speed: 10, life: 0.4, size: 3, gravity: 0 });
      break;
    }
    case 'tank': case 'boat':
      e.x += e.vx * dt;
      if (e.opt.river) e.x = riverX(e.wy) + Math.sin(e.t) * 10;
      e.turret = aimAt(e.x, e.y);
      if (e.fireT <= 0 && okFire(e)) { e.fireT = (e.type === 'boat' ? 1.4 : 1.7) / F; if (e.type === 'boat') fan(e.x, e.y, e.turret, 2, 0.25, 180, { c: 'o' }); else shoot(e.x + Math.cos(e.turret) * 18, e.y + Math.sin(e.turret) * 18, e.turret, 200, { c: 'o' }); }
      break;
    case 'turret':
      e.turret = aimAt(e.x, e.y);
      if (e.fireT <= 0 && okFire(e)) { e.fireT = 1.8 / F; for (let i = 0; i < 3; i++) setTimeout(() => !e.dead && okFire(e) && state === 'play' && shoot(e.x, e.y, aimAt(e.x, e.y), 230, { c: 'r', kind: 1 }), i * 110); }
      break;
    case 'bunker':
      e.open = e.y > 60 && e.y < H * 0.6;
      if (e.fireT <= 0 && okFire(e)) { e.fireT = 2.1 / F; ring(e.x, e.y, 10, 150, e.t, { c: 'o' }); }
      break;
  }
  if (e.y > H + 80 || e.y < -260 || e.x < -120 || e.x > W + 120) {
    if (e.t > 1) { e.dead = true; e.gone = true; }
  }
}
function damageEnemy(e, dmg, p, quiet) {
  if (e.dead || e.y < -20) return;
  e.hp -= dmg; e.flash = 0.06;
  if (!quiet) sfx.hit();
  if (e.hp <= 0) killEnemy(e, p);
}
function killEnemy(e, p) {
  e.dead = true;
  const d = ET[e.type];
  addScore(p, d.score);
  if (e.type !== 'emis' && !e.opt.nb) stats.kills++;
  boom(e.x, e.y, d.size, !e.air);
  if (d.score >= 400) popText(e.x, e.y - 10, d.score, '#ffe28a');
  if (!e.air && e.type !== 'boat') craters.push({ x: e.x, y: e.y, r: e.r * 1.1, s: Math.random() * 6 });
  if (e.drop) spawnItem(e.drop, e.x, e.y);
  else if (!e.air && Math.random() < 0.35) spawnItem('medal', e.x, e.y);
  if (e.type === 'drone' && diff === 2) ring(e.x, e.y, 6, 120, Math.random() * 6, { c: 'b' });
}

// ---------------- 道具 ----------------
function spawnItem(kind, x, y) {
  const it = { kind, x, y, vx: rand(-60, 60), vy: kind === 'medal' ? 80 : 46, t: 0, col: (Math.random() * 3) | 0, fixed: 0, mk: Math.random() < 0.5 ? 0 : 1 };
  if (kind === 'medal') it.vx = rand(-20, 20);
  items.push(it); return it;
}
function updItem(it, dt) {
  it.t += dt; it.fixed -= dt;
  it.x += it.vx * dt; it.y += it.vy * dt;
  if (it.kind !== 'medal') {
    if (it.x < 14 || it.x > W - 14) it.vx *= -1;
    if (it.t < 8) { if (it.y > H - 130) it.vy = -Math.abs(it.vy); if (it.y < 70 && it.t > 1) it.vy = Math.abs(it.vy); }
  }
  for (const p of players) {
    if (!p.alive) continue;
    if (Math.hypot(p.x - it.x, p.y - it.y) < 26) { pickItem(p, it); it.dead = true; return; }
  }
  if (it.y > H + 30) { it.dead = true; if (it.kind === 'medal') for (const p of players) p.medal = 0; }
}
function powCol(it) { return it.fixed > 0 ? it.col : (it.col + Math.floor(it.t / 1.5)) % 3; }
function misKind(it) { return (it.mk + Math.floor(it.t / 2)) % 2 ? 'N' : 'H'; }
function pickItem(p, it) {
  const { x, y } = it;
  switch (it.kind) {
    case 'pow': {
      const w = 'VLP'[powCol(it)];
      if (p.wpn === w) {
        if (p.lv < 6) { p.lv++; sfx.power(); popText(x, y, p.lv === 6 ? T('maxPow') : T('powerUp'), '#ffe28a', true); }
        else { addScore(p, 5000); sfx.item(); popText(x, y, 5000, '#ffe28a'); }
      } else { p.wpn = w; sfx.power(); popText(x, y, T('wpnNames')[w], '#fff', true); }
      break;
    }
    case 'mis': {
      const m = misKind(it);
      if (p.mis === m) { if (p.mlv < 4) p.mlv++; else addScore(p, 3000); }
      else { p.mis = m; p.mlv = Math.max(1, p.mlv); }
      sfx.power(); popText(x, y, T('misNames')[m], '#bfe6ff', true); break;
    }
    case 'bomb': p.bombs = Math.min(7, p.bombs + 1); sfx.item(); popText(x, y, T('bombUp'), '#9fd8ff'); break;
    case 'medal': {
      p.medal++;
      const val = p.medal > 5 ? 10000 : [500, 1000, 2000, 4000, 8000][p.medal - 1];
      addScore(p, val); stats.medals++; sfx.medal(p.medal); popText(x, y, val, '#ffd84a'); break;
    }
    case '1up': p.stock++; sfx.oneUp(); popText(x, y, T('oneUp'), '#7dffa0', true); break;
  }
  parts.burst(x, y, { n: 8, color: ['#fff', '#ffe28a'], speed: 120, life: 0.35, size: 2, gravity: 0, shape: 'spark' });
}

// ---------------- Boss ----------------
function partPos(pt) { return boss.def.partPos ? boss.def.partPos(boss, pt) : { x: boss.x + pt.dx, y: boss.y + pt.dy }; }
function damagePart(pt, dmg, p) {
  if (!pt.alive || boss.y < 40 || boss.dying) return;
  pt.hp -= dmg; pt.flash = 0.06; addScore(p, dmg * 3);
  if (pt.hp <= 0) {
    pt.alive = false; const q = partPos(pt);
    boom(q.x, q.y, 2); addScore(p, 2000); popText(q.x, q.y, 2000, '#ffe28a');
    if (Math.random() < 0.5) spawnItem('medal', q.x, q.y);
  }
}
function damageBoss(dmg, p) {
  if (!boss || boss.dying || boss.y < 40) return;
  if (boss.def.coreMul) dmg *= boss.def.coreMul(boss);
  boss.hp -= dmg; boss.flash = 0.05; addScore(p, dmg * 3);
  if (boss.hp <= 0) bossDie();
}
function bossDie() {
  boss.dying = 2.6; boss.hp = 0; slowT = 1.1;
  clearBullets(false); beams.length = 0;
  for (const e of enemies) if (e.type === 'emis' || e.type === 'orb') { e.dead = true; boom(e.x, e.y, 1); }
  for (const pt of boss.parts) pt.alive = false;
  KIT.stopMusic();
}
const BOSSES = {
  poseidon: {
    hp: 1500, ty: 190, score: 50000,
    parts: [{ dx: -46, dy: -88, r: 18, hp: 130 }, { dx: 46, dy: -88, r: 18, hp: 130 }, { dx: -52, dy: 36, r: 18, hp: 130 }, { dx: 52, dy: 36, r: 18, hp: 130 }],
    hits: [{ dx: 0, dy: -30, r: 46 }, { dx: 0, dy: 80, r: 40 }],
    update(b, dt, ph) {
      b.x = W / 2 + Math.sin(b.t * (0.4 + ph * 0.15)) * (50 + ph * 20);
      const F = FIRE(); const m = b.mem;
      b.parts.forEach((pt, i) => {
        if (!pt.alive) return;
        pt.ft = (pt.ft == null ? i * 0.5 : pt.ft) - dt;
        const q = partPos(pt); pt.ang = aimAt(q.x, q.y);
        if (pt.ft <= 0) { pt.ft = 2.2 / F; fan(q.x, q.y, pt.ang, 3, 0.3, 210, { c: 'o' }); }
      });
      m.bow = (m.bow || 1) - dt;
      if (m.bow <= 0) { m.bow = (ph === 2 ? 0.9 : 1.6) / F; fan(b.x, b.y + 150, aimAt(b.x, b.y + 150), ph ? 7 : 5, 0.9, 200, { c: 'p', kind: 1 }); }
      if (ph >= 1) { m.sp = (m.sp || 0) - dt; if (m.sp <= 0) { m.sp = 0.11 / F; for (const s of [0, Math.PI]) shoot(b.x, b.y - 40, b.t * 2.3 + s, 160, { c: 'v' }); } }
      if (ph === 2) { m.rg = (m.rg || 0) - dt; if (m.rg <= 0) { m.rg = 1.4 / F; ring(b.x, b.y + 40, 18, 140, b.t, { c: 'b', r: 6 }); } }
    },
    draw(c, b, hit) {
      const F = col => hit ? tint(col) : col;
      c.save(); c.translate(b.x, b.y);
      c.fillStyle = 'rgba(255,255,255,.35)';
      for (let i = 0; i < 6; i++) { c.beginPath(); c.ellipse(Math.sin(gt * 3 + i) * 30, -170 - i * 18, 40 - i * 4, 8, 0, 0, TAU); c.fill(); }
      c.fillStyle = 'rgba(0,30,60,.35)'; c.beginPath(); c.ellipse(14, 20, 92, 180, 0, 0, TAU); c.fill();
      c.beginPath(); c.moveTo(-72, -165); c.lineTo(72, -165); c.lineTo(84, 60); c.lineTo(0, 175); c.lineTo(-84, 60); c.closePath();
      c.fillStyle = F('#5d6977'); c.fill(); c.lineWidth = 3; c.strokeStyle = '#3a434d'; c.stroke();
      c.fillStyle = F('#76838f'); c.fillRect(-56, -150, 112, 200);
      c.strokeStyle = 'rgba(40,48,56,.5)'; c.lineWidth = 1;
      for (let y = -140; y < 50; y += 16) { c.beginPath(); c.moveTo(-56, y); c.lineTo(56, y); c.stroke(); }
      c.fillStyle = F('#9aa6b1'); c.fillRect(-26, -70, 52, 70);
      c.fillStyle = F('#c8d2db'); c.fillRect(-18, -62, 36, 22);
      c.fillStyle = '#ff5050'; c.globalAlpha = 0.6 + 0.4 * Math.sin(gt * 6); c.fillRect(-16, -58, 32, 6); c.globalAlpha = 1;
      c.fillStyle = F('#454c55'); c.beginPath(); c.arc(0, -110, 14, 0, TAU); c.fill();
      c.fillStyle = 'rgba(80,80,80,.5)';
      for (let i = 0; i < 4; i++) { const k = (gt * 0.8 + i * 0.25) % 1; c.beginPath(); c.arc(Math.sin(i) * 6, -110 - k * 70, 8 + k * 14, 0, TAU); c.globalAlpha = 0.5 * (1 - k); c.fill(); }
      c.globalAlpha = 1;
      c.fillStyle = F('#3d444c'); c.fillRect(-10, 120, 20, 36);
      c.fillStyle = '#ffcf6a'; c.beginPath(); c.arc(0, 150, 6, 0, TAU); c.fill();
      c.restore();
      drawTurrets(c, b);
    }
  },
  scorpion: {
    hp: 1800, ty: 175, score: 60000,
    parts: [{ dx: -78, dy: 62, r: 22, hp: 170 }, { dx: 78, dy: 62, r: 22, hp: 170 }],
    hits: [{ dx: 0, dy: 0, r: 56 }],
    partPos(b, pt) { const s = pt.dx < 0 ? -1 : 1; return { x: b.x + pt.dx + Math.sin(b.t * 2 + s) * 6, y: b.y + pt.dy + Math.cos(b.t * 2.2 + s) * 8 }; },
    update(b, dt, ph) {
      const m = b.mem, F = FIRE();
      if (!m.mode) { m.mode = 'walk'; m.mt = 5; }
      m.mt -= dt;
      if (m.mode === 'walk') {
        b.x = W / 2 + Math.sin(b.t * 0.55) * 120; b.y += (b.ty + Math.sin(b.t * 3) * 6 - b.y) * Math.min(1, dt * 3);
        if (ph >= 1 && m.mt <= 0) { m.mode = 'charge'; m.mt = 0.9; sfx.beamWarn(); }
      } else if (m.mode === 'charge') {
        b.y += 330 * dt; if (m.mt <= 0 || b.y > 420) { m.mode = 'back'; ring(b.x, b.y, 22, 150, b.t, { c: 'o' }); shake = 8; }
      } else if (m.mode === 'back') { b.y -= 140 * dt; if (b.y <= b.ty) { m.mode = 'walk'; m.mt = 6; } }
      b.parts.forEach((pt, i) => {
        if (!pt.alive) return;
        pt.ft = (pt.ft == null ? i * 0.9 : pt.ft) - dt;
        const q = partPos(pt);
        if (pt.ft <= 0) { pt.ft = 1.8 / F; fan(q.x, q.y, aimAt(q.x, q.y), 3, 0.45, 200, { c: 'o' }); }
      });
      m.st = (m.st || 1.5) - dt;
      const tip = { x: b.x + Math.sin(b.t * 1.3) * 50, y: b.y - 130 };
      if (m.st <= 0) { m.st = (ph === 2 ? 0.9 : 1.4) / F; fan(tip.x, tip.y, aimAt(tip.x, tip.y), ph ? 3 : 1, 0.4, 170, { c: 'r', r: 10 }); }
      if (ph === 2) { m.rain = (m.rain || 0) - dt; if (m.rain <= 0) { m.rain = 0.16 / F; shoot(rand(10, W - 10), 40, Math.PI / 2 + rand(-0.1, 0.1), 200, { c: 'o', kind: 1 }); } }
    },
    draw(c, b, hit) {
      const F = col => hit ? tint(col) : col;
      c.save(); c.translate(b.x, b.y);
      c.fillStyle = 'rgba(70,40,10,.3)'; c.beginPath(); c.ellipse(16, 24, 100, 76, 0, 0, TAU); c.fill();
      c.strokeStyle = F('#5b3d1f'); c.lineWidth = 8; c.lineCap = 'round';
      for (let i = 0; i < 3; i++) for (const s of [-1, 1]) {
        const ph = b.t * 6 + i * 2 + (s > 0 ? Math.PI : 0), ky = -30 + i * 30;
        c.beginPath(); c.moveTo(s * 40, ky); c.lineTo(s * (82 + Math.sin(ph) * 6), ky - 18 + Math.cos(ph) * 8); c.lineTo(s * (104 + Math.sin(ph) * 8), ky + 20); c.stroke();
      }
      const sw = Math.sin(b.t * 1.3) * 50;
      c.lineWidth = 16; c.strokeStyle = F('#8a5a2b');
      c.beginPath(); c.moveTo(0, -40); c.quadraticCurveTo(sw * 0.3, -110, sw, -130); c.stroke();
      c.lineWidth = 10; c.strokeStyle = F('#b47a3c'); c.stroke();
      c.fillStyle = F('#3a2410'); c.beginPath(); c.arc(sw, -132, 13, 0, TAU); c.fill();
      c.fillStyle = '#ff4b3e'; c.beginPath(); c.arc(sw, -132, 5 + Math.sin(gt * 10) * 2, 0, TAU); c.fill();
      c.fillStyle = F('#8a5a2b'); c.beginPath(); c.ellipse(0, 0, 66, 60, 0, 0, TAU); c.fill();
      c.fillStyle = F('#b47a3c');
      for (let i = 0; i < 4; i++) { c.beginPath(); c.ellipse(0, -36 + i * 20, 56 - i * 4, 10, 0, 0, TAU); c.fill(); }
      c.fillStyle = F('#6d4520'); c.beginPath(); c.ellipse(0, 44, 36, 22, 0, 0, TAU); c.fill();
      c.fillStyle = '#ff3b30'; c.shadowColor = '#ff3b30'; c.shadowBlur = 12;
      for (const s of [-1, 1]) { c.beginPath(); c.arc(s * 12, 46, 5, 0, TAU); c.fill(); }
      c.shadowBlur = 0; c.restore();
      for (const pt of b.parts) {
        if (!pt.alive) continue; const q = partPos(pt); const s = pt.dx < 0 ? -1 : 1;
        c.save(); c.translate(q.x, q.y);
        c.fillStyle = (pt.flash > 0 && Math.floor(gt * 30) % 2) ? '#c99560' : '#9c6630';
        c.beginPath(); c.ellipse(0, 0, 24, 18, 0, 0, TAU); c.fill();
        c.fillStyle = '#5b3d1f'; c.beginPath(); c.moveTo(s * 4, 10); c.lineTo(s * 20, 34); c.lineTo(s * -2, 22); c.fill();
        c.beginPath(); c.moveTo(s * -8, 10); c.lineTo(s * -14, 36); c.lineTo(s * 4, 20); c.fill();
        c.restore();
      }
    }
  },
  hawk: {
    hp: 2200, ty: 190, score: 70000,
    parts: [{ dx: -78, dy: 4, r: 20, hp: 180 }, { dx: 78, dy: 4, r: 20, hp: 180 }],
    hits: [{ dx: 0, dy: 0, r: 40 }, { dx: 0, dy: 70, r: 26 }, { dx: 0, dy: -70, r: 26 }],
    update(b, dt, ph) {
      const m = b.mem, F = FIRE();
      b.x = W / 2 + Math.sin(b.t * 0.6) * 110; b.y += (b.ty + Math.sin(b.t * 1.2) * 34 - b.y) * Math.min(1, dt * 3);
      b.parts.forEach((pt, i) => {
        if (!pt.alive) return;
        pt.ft = (pt.ft == null ? 1 + i : pt.ft) - dt; const q = partPos(pt);
        if (pt.ft <= 0) { pt.burst = 6; pt.ft = 2.2 / F; }
        if (pt.burst > 0) { pt.bt = (pt.bt || 0) - dt; if (pt.bt <= 0) { pt.bt = 0.12; pt.burst--; shoot(q.x, q.y + 10, aimAt(q.x, q.y), 260, { c: 'r', kind: 1 }); } }
      });
      m.nose = (m.nose || 2) - dt;
      if (m.nose <= 0) { m.nose = 1.7 / F; fan(b.x, b.y + 90, aimAt(b.x, b.y + 90), 5 + ph * 2, 1.0, 190, { c: 'p' }); }
      if (ph >= 1) { m.ms = (m.ms || 1) - dt; if (m.ms <= 0) { m.ms = 4.2 / F; for (let i = 0; i < 4; i++) { const e = spawnEnemy('emis', (b.x + (i - 1.5) * 40) / W, {}); e.y = b.y; e.ang = Math.PI / 2 + (i - 1.5) * 0.5; } } }
      if (ph === 2) { m.fl = (m.fl || 0) - dt; if (m.fl <= 0) { m.fl = 0.1 / F; const a = b.t * 3; for (let k = 0; k < 3; k++) shoot(b.x, b.y, a + k * TAU / 3, 150, { c: 'v' }); } }
    },
    draw(c, b, hit) {
      const F = col => hit ? tint(col) : col;
      c.save(); c.translate(b.x, b.y);
      c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.ellipse(30, 40, 60, 110, 0, 0, TAU); c.fill();
      c.fillStyle = F('#3d5a35'); c.fillRect(-100, -10, 200, 22);
      c.fillStyle = F('#2c4427'); c.fillRect(-100, 6, 200, 6);
      c.fillStyle = F('#4c6e42'); c.beginPath(); c.ellipse(0, 0, 40, 104, 0, 0, TAU); c.fill();
      c.fillStyle = F('#5f8753'); c.beginPath(); c.ellipse(-8, -10, 18, 80, 0, 0, TAU); c.fill();
      c.fillStyle = F('#1c2b30'); c.beginPath(); c.ellipse(0, 66, 18, 24, 0, 0, TAU); c.fill();
      c.fillStyle = 'rgba(140,220,255,.6)'; c.beginPath(); c.ellipse(-4, 60, 8, 12, 0, 0, TAU); c.fill();
      c.fillStyle = '#ffd34a'; c.font = 'bold 14px system-ui'; c.textAlign = 'center'; c.fillText('★', 0, 10);
      for (const ry of [-62, 40]) {
        c.fillStyle = 'rgba(200,200,200,.12)'; c.beginPath(); c.arc(0, ry, 92, 0, TAU); c.fill();
        c.strokeStyle = 'rgba(30,30,30,.7)'; c.lineWidth = 7;
        for (let k = 0; k < 3; k++) { const a = gt * (ry < 0 ? 22 : -22) + k * TAU / 3; c.beginPath(); c.moveTo(Math.cos(a) * -92, ry + Math.sin(a) * -92); c.lineTo(Math.cos(a) * 92, ry + Math.sin(a) * 92); c.stroke(); }
        c.fillStyle = '#222'; c.beginPath(); c.arc(0, ry, 8, 0, TAU); c.fill();
      }
      c.restore();
      for (const pt of b.parts) {
        if (!pt.alive) continue; const q = partPos(pt);
        c.fillStyle = (pt.flash > 0 && Math.floor(gt * 30) % 2) ? '#58704f' : '#2d3b2a'; c.beginPath(); c.ellipse(q.x, q.y, 16, 26, 0, 0, TAU); c.fill();
        c.fillStyle = '#ff7a2e'; for (let k = -1; k <= 1; k++) { c.beginPath(); c.arc(q.x + k * 7, q.y + 22, 3.5, 0, TAU); c.fill(); }
      }
    }
  },
  citadel: {
    hp: 2600, ty: 140, score: 80000,
    parts: [{ dx: -140, dy: 10, r: 26, hp: 220 }, { dx: 140, dy: 10, r: 26, hp: 220 }],
    hits: [{ dx: 0, dy: 20, r: 44 }],
    shields(b) { const L = []; for (let i = 0; i < 4; i++) { const a = b.t * 1.4 + i * TAU / 4; L.push({ x: b.x + Math.cos(a) * 78, y: b.y + 20 + Math.sin(a) * 58 }); } return L; },
    update(b, dt, ph) {
      const m = b.mem, F = FIRE();
      b.x = W / 2 + Math.sin(b.t * 0.3) * 36;
      b.parts.forEach((pt, i) => {
        if (!pt.alive) return;
        pt.ft = (pt.ft == null ? i * 0.7 : pt.ft) - dt; const q = partPos(pt);
        if (pt.ft <= 0) { pt.ft = 1.6 / F; fan(q.x, q.y + 20, Math.PI / 2 + (i ? -0.3 : 0.3), 5, 0.9, 190, { c: 'b', kind: 1 }); }
      });
      m.rail = (m.rail == null ? 3 : m.rail) - dt;
      if (m.rail <= 0) {
        m.rail = (ph === 2 ? 4.2 : 5.2) / F;
        const targets = ph >= 1 ? alivePlayers().map(p => p.x).concat([rand(40, W - 40)]) : alivePlayers().map(p => p.x);
        targets.slice(0, ph >= 1 ? 2 : 1).forEach(x => beams.push({ x, w: 44, warn: 1.1, on: 0.75, sweep: ph === 2 ? (x < W / 2 ? 90 : -90) : 0 }));
        if (!targets.length) beams.push({ x: W / 2, w: 44, warn: 1.1, on: 0.75, sweep: 0 });
      }
      if (ph >= 1) { m.ice = (m.ice || 0) - dt; if (m.ice <= 0) { m.ice = 0.22 / F; shoot(rand(10, W - 10), 0, Math.PI / 2, 150 + rand(0, 80), { c: 'b', kind: 1 }); } }
      if (ph === 2) { m.rg = (m.rg || 0) - dt; if (m.rg <= 0) { m.rg = 1.6 / F; ring(b.x, b.y + 30, 20, 130, b.t, { c: 'v' }); } }
    },
    draw(c, b, hit) {
      const F = col => hit ? tint(col) : col;
      c.save(); c.translate(b.x, b.y);
      c.fillStyle = 'rgba(40,60,90,.3)'; c.fillRect(-166, -40, 340, 120);
      c.fillStyle = F('#7d8fa3'); c.fillRect(-170, -60, 340, 110);
      c.fillStyle = F('#a2b4c7'); for (let i = -170; i < 170; i += 24) c.fillRect(i, -72, 14, 14);
      c.fillStyle = F('#5d6e82'); c.fillRect(-170, 30, 340, 20);
      c.fillStyle = F('#c9dcef'); c.fillRect(-60, -50, 120, 70);
      c.fillStyle = F('#3c4b5c'); c.beginPath(); c.arc(0, 20, 34, 0, TAU); c.fill();
      const g = c.createRadialGradient(0, 30, 2, 0, 30, 30); g.addColorStop(0, '#ffffff'); g.addColorStop(0.4, '#7fd8ff'); g.addColorStop(1, 'rgba(60,160,255,0)');
      c.fillStyle = g; c.beginPath(); c.arc(0, 30, 26 + Math.sin(gt * 8) * 3, 0, TAU); c.fill();
      c.fillStyle = F('#2b3644'); c.fillRect(-12, 30, 24, 40);
      c.restore();
      for (const pt of b.parts) {
        if (!pt.alive) continue; const q = partPos(pt);
        c.fillStyle = (pt.flash > 0 && Math.floor(gt * 30) % 2) ? '#9fb0c2' : '#6e8095'; c.fillRect(q.x - 26, q.y - 40, 52, 70);
        c.fillStyle = '#e7f2ff'; c.beginPath(); c.moveTo(q.x - 30, q.y - 40); c.lineTo(q.x, q.y - 66); c.lineTo(q.x + 30, q.y - 40); c.fill();
        c.fillStyle = '#4fb8ff'; c.beginPath(); c.arc(q.x, q.y + 12, 9, 0, TAU); c.fill();
      }
      for (const s of BOSSES.citadel.shields(b)) {
        const g = c.createRadialGradient(s.x, s.y, 2, s.x, s.y, 16); g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#9fe0ff'); g.addColorStop(1, 'rgba(120,200,255,0)');
        c.fillStyle = g; c.beginPath(); c.arc(s.x, s.y, 16, 0, TAU); c.fill();
      }
    }
  },
  eye: {
    hp: 2900, ty: 200, score: 90000,
    parts: [0, 1, 2, 3].map(i => ({ dx: 0, dy: 0, r: 20, hp: 170, k: i })),
    hits: [{ dx: 0, dy: 0, r: 46 }],
    partPos(b, pt) { const a = b.t * 0.6 + pt.k * TAU / 4; return { x: b.x + Math.cos(a) * 112, y: b.y + Math.sin(a) * 112 }; },
    coreMul(b) { return b.mem.open > 0 ? 1 : 0.3; },
    update(b, dt, ph) {
      const m = b.mem, F = FIRE();
      b.x = W / 2 + Math.sin(b.t * 0.35) * 60; b.y += (b.ty + Math.sin(b.t * 0.5) * 30 - b.y) * Math.min(1, dt * 2);
      m.cyc = (m.cyc || 0) + dt; const cyc = m.cyc % 6; m.open = cyc > 3 ? 1 : 0;
      m.lid = (m.lid || 0) + ((m.open ? 1 : 0) - (m.lid || 0)) * Math.min(1, dt * 6);
      b.parts.forEach(pt => {
        if (!pt.alive) return;
        pt.ft = (pt.ft == null ? pt.k * 0.1 : pt.ft) - dt; const q = partPos(pt);
        if (pt.ft <= 0) { pt.ft = (ph === 2 ? 0.22 : 0.34) / F; const a = Math.atan2(q.y - b.y, q.x - b.x) + 0.6; shoot(q.x, q.y, a, 150, { c: 'g' }); }
      });
      if (m.open) {
        m.sp = (m.sp || 0) - dt;
        if (m.sp <= 0) { m.sp = 0.07 / F; shoot(b.x, b.y, b.t * 4, 180, { c: 'p' }); if (ph >= 1) shoot(b.x, b.y, -b.t * 4 + 1, 180, { c: 'v' }); }
      } else {
        m.aim = (m.aim || 0) - dt;
        if (m.aim <= 0) { m.aim = 0.9 / F; fan(b.x, b.y + 40, aimAt(b.x, b.y), 3, 0.18, 280, { c: 'r', kind: 1 }); }
      }
      if (ph === 2) { m.rg = (m.rg || 0) - dt; if (m.rg <= 0) { m.rg = 2 / F; ring(b.x, b.y, 24, 120, b.t, { c: 'b', r: 6 }); } }
    },
    draw(c, b, hit) {
      const F = col => hit ? tint(col) : col;
      const m = b.mem;
      c.save(); c.translate(b.x, b.y);
      c.strokeStyle = F('#5b6585'); c.lineWidth = 12;
      for (let i = 0; i < 4; i++) { const a = b.t * 0.6 + i * TAU / 4; c.beginPath(); c.moveTo(Math.cos(a) * 50, Math.sin(a) * 50); c.lineTo(Math.cos(a) * 104, Math.sin(a) * 104); c.stroke(); }
      c.strokeStyle = 'rgba(140,200,255,.35)'; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, 112, 0, TAU); c.stroke();
      c.fillStyle = F('#39415e'); c.beginPath(); c.arc(0, 0, 64, 0, TAU); c.fill();
      c.fillStyle = F('#4f5a80');
      for (let i = 0; i < 8; i++) { const a = i * TAU / 8 + b.t * 0.2; c.beginPath(); c.arc(Math.cos(a) * 56, Math.sin(a) * 56, 9, 0, TAU); c.fill(); }
      c.fillStyle = '#0a0c18'; c.beginPath(); c.arc(0, 0, 44, 0, TAU); c.fill();
      const lid = m.lid || 0;
      c.save(); c.beginPath(); c.ellipse(0, 0, 42, 40 * Math.max(0.08, lid), 0, 0, TAU); c.clip();
      const g = c.createRadialGradient(0, 0, 2, 0, 0, 40); g.addColorStop(0, '#ffffff'); g.addColorStop(0.25, '#ff3b6b'); g.addColorStop(0.7, '#7a0f3a'); g.addColorStop(1, '#2a0516');
      c.fillStyle = g; c.fillRect(-44, -44, 88, 88);
      const p = nearestPlayer(b.x, b.y), la = p ? Math.atan2(p.y - b.y, p.x - b.x) : Math.PI / 2;
      c.fillStyle = '#0b0b0b'; c.beginPath(); c.ellipse(Math.cos(la) * 14, Math.sin(la) * 14, 7, 15, 0, 0, TAU); c.fill();
      c.restore();
      c.restore();
      for (const pt of b.parts) {
        if (!pt.alive) continue; const q = partPos(pt);
        c.fillStyle = (pt.flash > 0 && Math.floor(gt * 30) % 2) ? '#9aa6d0' : '#6c78a4'; c.beginPath(); c.arc(q.x, q.y, 20, 0, TAU); c.fill();
        c.fillStyle = '#5be37a'; c.beginPath(); c.arc(q.x, q.y, 7 + Math.sin(gt * 9 + pt.k) * 2, 0, TAU); c.fill();
      }
    }
  },
  hive: {
    hp: 3800, ty: 200, score: 150000,
    parts: [0, 1, 2, 3].map(i => ({ dx: 0, dy: 0, r: 18, hp: 220, k: i })),
    hits: [{ dx: 0, dy: 0, r: 64 }],
    partPos(b, pt) { const base = [-2.4, -0.75, 0.75, 2.4][pt.k] + Math.PI / 2; const a = base + Math.sin(b.t * 1.4 + pt.k) * 0.25; return { x: b.x + Math.cos(a) * 140, y: b.y + Math.sin(a) * 120 }; },
    update(b, dt, ph) {
      const m = b.mem, F = FIRE();
      b.x = W / 2 + Math.sin(b.t * 0.4) * 50; b.y += (b.ty + Math.sin(b.t * 0.7) * 24 - b.y) * Math.min(1, dt * 2);
      m.rg = (m.rg || 1) - dt;
      if (m.rg <= 0) { m.rg = (ph === 2 ? 2.2 : 1.7) / F; ring(b.x, b.y, 16 + ph * 2, 130, b.t, { c: 'p', r: 6 }); }
      m.spore = (m.spore || 3) - dt;
      if (m.spore <= 0 && ph < 2) { m.spore = 5 / F; for (let i = 0; i < 3; i++) { const e = spawnEnemy('orb', (b.x + (i - 1) * 60) / W, { nb: 1 }); e.y = b.y + 40; } }
      b.parts.forEach(pt => {
        if (!pt.alive) return; const q = partPos(pt);
        pt.ft = (pt.ft == null ? pt.k * 0.3 : pt.ft) - dt;
        if (ph >= 1 && pt.ft <= 0) { pt.ft = (ph === 2 ? 0.4 : 0.22) / F; shoot(q.x, q.y, Math.PI / 2 + Math.sin(b.t * 3 + pt.k) * 0.7, 170, { c: 'v' }); }
        else if (ph === 0 && pt.ft <= 0) { pt.ft = 1.4 / F; shoot(q.x, q.y, aimAt(q.x, q.y), 200, { c: 'r', r: 7 }); }
      });
      if (ph === 2) {
        m.fl = (m.fl || 0) - dt;
        if (m.fl <= 0) { m.fl = 0.2 / F; const a = b.t * 1.7; for (let k = 0; k < 6; k++) shoot(b.x, b.y, a + k * TAU / 6, 130 + Math.sin(b.t * 5) * 30, { c: 'r' }); }
        m.big = (m.big || 0) - dt; if (m.big <= 0) { m.big = 1.2 / F; fan(b.x, b.y + 50, aimAt(b.x, b.y), 3, 0.5, 230, { c: 'o', r: 11 }); }
      }
    },
    draw(c, b, hit) {
      const F = col => hit ? tint(col) : col;
      const pul = 1 + Math.sin(gt * (b.phase === 2 ? 9 : 4)) * 0.05;
      for (const pt of b.parts) {
        const q = partPos(pt);
        c.strokeStyle = F(pt.alive ? '#8a1c45' : '#3d1020'); c.lineWidth = pt.alive ? 16 : 8; c.lineCap = 'round';
        c.beginPath(); c.moveTo(b.x, b.y); c.quadraticCurveTo((b.x + q.x) / 2 + Math.sin(gt * 2 + pt.k) * 30, (b.y + q.y) / 2 + 20, q.x, q.y); c.stroke();
        if (pt.alive) {
          c.strokeStyle = '#d6457a'; c.lineWidth = 5; c.stroke();
          c.fillStyle = pt.flash > 0 && Math.floor(gt * 30) % 2 ? '#ffa8c8' : '#ff6aa0'; c.beginPath(); c.arc(q.x, q.y, 18, 0, TAU); c.fill();
          c.fillStyle = '#2a0010'; c.beginPath(); c.arc(q.x, q.y + 3, 7, 0, TAU); c.fill();
        }
      }
      c.save(); c.translate(b.x, b.y); c.scale(pul, pul);
      const g = c.createRadialGradient(-20, -20, 6, 0, 0, 84); g.addColorStop(0, F('#ff9ec0')); g.addColorStop(0.5, F('#c22a5e')); g.addColorStop(1, F('#4a0a22'));
      c.fillStyle = g; c.beginPath();
      for (let i = 0; i <= 24; i++) { const a = i / 24 * TAU, r = 74 + Math.sin(a * 5 + gt * 3) * 6; i ? c.lineTo(Math.cos(a) * r, Math.sin(a) * r) : c.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
      c.fill();
      c.strokeStyle = 'rgba(80,0,30,.6)'; c.lineWidth = 3;
      for (let i = 0; i < 6; i++) { const a = i * 1.05 + 0.3; c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(Math.cos(a + 0.4) * 40, Math.sin(a + 0.4) * 40, Math.cos(a) * 70, Math.sin(a) * 70); c.stroke(); }
      [[0, 0, 18], [-34, -22, 9], [32, -26, 10], [-28, 30, 8], [30, 28, 9]].forEach(([x, y, r], i) => {
        const bl = (Math.sin(gt * 1.3 + i * 2) > 0.94) ? 0.15 : 1;
        c.fillStyle = '#fff3c4'; c.beginPath(); c.ellipse(x, y, r, r * bl, 0, 0, TAU); c.fill();
        if (bl > 0.5) { c.fillStyle = '#1a0008'; c.beginPath(); c.arc(x, y + 2, r * 0.45, 0, TAU); c.fill(); }
      });
      c.restore();
    }
  }
};
function drawTurrets(c, b) {
  for (const pt of b.parts) {
    if (!pt.alive) continue; const q = partPos(pt);
    c.fillStyle = pt.flash > 0 && Math.floor(gt * 30) % 2 ? '#7a848f' : '#4a535d'; c.beginPath(); c.arc(q.x, q.y, 18, 0, TAU); c.fill();
    c.fillStyle = '#6d7782'; c.beginPath(); c.arc(q.x, q.y, 12, 0, TAU); c.fill();
    const a = pt.ang || Math.PI / 2; c.strokeStyle = '#2c3238'; c.lineWidth = 6;
    c.beginPath(); c.moveTo(q.x, q.y); c.lineTo(q.x + Math.cos(a) * 24, q.y + Math.sin(a) * 24); c.stroke();
  }
}
function makeBoss(kind) {
  const B = BOSSES[kind];
  const hpMul = DIFFS[diff].hp * (nP === 2 ? 1.45 : 1) * (1 + loop * 0.35);
  boss = { kind, def: B, x: W / 2, y: -220, ty: B.ty, hp: B.hp * hpMul, max: B.hp * hpMul, t: 0, phase: 0, mem: {}, flash: 0, dying: 0, hits: B.hits,
    parts: B.parts.map(p => ({ ...p, hp: p.hp * hpMul, max: p.hp * hpMul, alive: true, flash: 0 })) };
}
function updBoss(dt) {
  const b = boss;
  b.flash -= dt; b.parts.forEach(p => p.flash -= dt);
  if (b.dying) {
    b.dying -= dt;
    if (Math.random() < 0.35) boom(b.x + rand(-80, 80), b.y + rand(-80, 80), rand(1, 2.2));
    b.y += 10 * dt;
    if (b.dying <= 0) {
      boom(b.x, b.y, 4); flash = 1; flashCol = '255,240,200'; shake = 20;
      for (let i = 0; i < 8; i++) parts.burst(b.x, b.y, { n: 20, color: ['#fff', '#ffe28a', '#ff9a2e'], speed: 420, life: 1.2, size: 4, gravity: 60, shape: 'square' });
      const pts = Math.round(b.def.score * (1 + loop));
      for (const p of players) if (!p.out) addScore(p, pts / players.filter(q => !q.out).length);
      popText(b.x, b.y, pts, '#ffe28a', true);
      for (let i = 0; i < 6; i++) spawnItem('medal', b.x + rand(-60, 60), b.y + rand(-40, 40));
      boss = null; startTally(); return;
    }
    return;
  }
  b.t += dt;
  if (b.y < b.ty - 2 && b.t < 3.5) { b.y += (b.ty - b.y) * Math.min(1, dt * 1.3) + 20 * dt; return; }
  const r = b.hp / b.max, ph = r > 0.66 ? 0 : r > 0.33 ? 1 : 2;
  if (ph !== b.phase) {
    b.phase = ph; flash = 0.5; flashCol = '255,80,80'; shake = 8;
    popText(b.x, b.y + 90, T('rage'), '#ff7a6a', true);
    sfx.siren(0);
  }
  b.def.update(b, dt, ph);
}

// ---------------- 激光柱（冰原 Boss） ----------------
function updBeams(dt) {
  const cy = boss ? boss.y + 70 : 160;
  for (const bm of beams) {
    if (bm.warn > 0) { bm.warn -= dt; if (Math.random() < 0.2) sfx.beamWarn(); if (bm.warn <= 0) { sfx.beam(); shake = 6; } continue; }
    bm.on -= dt; bm.x += bm.sweep * dt;
    for (const p of players) if (p.alive && p.inv <= 0 && Math.abs(p.x - bm.x) < bm.w / 2 && p.y > cy) killPlayer(p);
  }
  beams = beams.filter(b => b.warn > 0 || b.on > 0);
}

// ---------------- 碰撞 ----------------
function collide() {
  const shields = boss && boss.kind === 'citadel' && !boss.dying ? BOSSES.citadel.shields(boss) : null;
  for (const b of pbul) {
    if (b.dead) continue;
    if (shields) for (const s of shields) if (Math.hypot(b.x - s.x, b.y - s.y) < 18 + (b.w || 4) / 2) { b.dead = true; parts.burst(b.x, b.y, { n: 3, color: '#bfe6ff', speed: 90, life: 0.2, size: 2, gravity: 0 }); break; }
    if (b.dead) continue;
    const isL = b.kind === 'l';
    for (const e of enemies) {
      if (e.dead || e.y < -10) continue;
      const hit = isL ? (Math.abs(b.x - e.x) < b.w / 2 + e.r && Math.abs(b.y - e.y) < b.h / 2 + e.r) : Math.hypot(b.x - e.x, b.y - e.y) < e.r + b.r;
      if (!hit) continue;
      if (isL) { if (b.hitSet.has(e)) continue; b.hitSet.add(e); damageEnemy(e, b.dmg, b.own); }
      else { damageEnemy(e, b.dmg, b.own); hitSpark(b); b.dead = true; if (b.kind === 'n') splash(b); break; }
    }
    if (b.dead || !boss || boss.dying || boss.y < 40) continue;
    for (const pt of boss.parts) {
      if (!pt.alive) continue; const q = partPos(pt);
      const hit = isL ? (Math.abs(b.x - q.x) < b.w / 2 + pt.r && Math.abs(b.y - q.y) < b.h / 2 + pt.r) : Math.hypot(b.x - q.x, b.y - q.y) < pt.r + b.r;
      if (!hit) continue;
      if (isL) { if (b.hitSet.has(pt)) continue; b.hitSet.add(pt); damagePart(pt, b.dmg, b.own); }
      else { damagePart(pt, b.dmg, b.own); hitSpark(b); b.dead = true; break; }
    }
    if (b.dead) continue;
    for (const h of boss.hits) {
      const hx = boss.x + h.dx, hy = boss.y + h.dy;
      const hit = isL ? (Math.abs(b.x - hx) < b.w / 2 + h.r && Math.abs(b.y - hy) < b.h / 2 + h.r) : Math.hypot(b.x - hx, b.y - hy) < h.r + b.r;
      if (!hit) continue;
      if (isL) { if (b.hitSet.has(boss)) break; b.hitSet.add(boss); damageBoss(b.dmg, b.own); sfx.hit(); }
      else { damageBoss(b.dmg, b.own); hitSpark(b); b.dead = true; sfx.hit(); }
      break;
    }
  }
  for (const p of players) {
    if (!p.alive || p.entering > 0 || p.inv > 0) continue;
    for (const b of ebul) { if (Math.hypot(b.x - p.x, b.y - p.y) < b.r * 0.7 + 2.5) { killPlayer(p); break; } }
    if (!p.alive) continue;
    for (const e of enemies) if (!e.dead && e.air && Math.hypot(e.x - p.x, e.y - p.y) < e.r * 0.8 + 6) { killPlayer(p); damageEnemy(e, 20, p); break; }
    if (p.alive && boss && !boss.dying) for (const h of boss.hits) if (Math.hypot(boss.x + h.dx - p.x, boss.y + h.dy - p.y) < h.r * 0.8) { killPlayer(p); break; }
  }
}
function hitSpark(b) { parts.burst(b.x, b.y, { n: 2, color: b.kind === 'v' ? '#ffb070' : '#d8b4ff', speed: 90, life: 0.15, size: 2, gravity: 0, shape: 'spark' }); }
function splash(b) {
  rings.push({ x: b.x, y: b.y, r: 4, max: 36, t: 0, life: 0.25, col: '255,200,120', w: 4 });
  for (const e of enemies) if (!e.dead && Math.hypot(e.x - b.x, e.y - b.y) < 40) damageEnemy(e, 6, b.own, true);
}

// ---------------- 流程 ----------------
function newGame(stage) {
  loop = 0; continues = 0;
  players = [makePlayer(0)]; if (nP === 2) players.push(makePlayer(1));
  if (stage > 0) for (const p of players) { p.lv = 3; p.mis = 'H'; p.mlv = 1; }
  hideScreens();
  startStage(stage);
}
function startStage(i) {
  stageIdx = i; const S = STAGES[i];
  enemies = []; ebul = []; pbul = []; items = []; craters = []; rings = []; texts = []; bolts = []; spawnQ = []; beams = [];
  boss = null; bossWarn = 0; tally = null; stageT = 0; evIdx = 0; scroll = 0; scrollSpeed = S.scroll; decor.clear(); parts.clear();
  stats = { kills: 0, spawned: 0, medals: 0, miss: 0 };
  for (const p of players) if (!p.out && p.alive) { p.entering = 1; p.y = H + 50; p.inv = 2; }
  banner = { t: 0, dur: 2.8, title: T('stageN', i + 1 + loop * 6), sub: T('stageNames')[i] };
  state = 'play';
  KIT.music('sky-raid');
  if (i > unlock) { unlock = i; store.set('unlock', unlock); }
}
function startTally() {
  const killPct = stats.spawned ? Math.round(stats.kills / stats.spawned * 100) : 0;
  const bombs = players.reduce((s, p) => s + (p.out ? 0 : p.bombs), 0);
  const L = [
    { k: 'tKill', v: killPct + '%', b: killPct * 300 },
    { k: 'tMedal', v: '×' + stats.medals, b: stats.medals * 1000 },
    { k: 'tNoMiss', v: stats.miss ? '—' : 'PERFECT', b: stats.miss ? 0 : 30000 },
    { k: 'tBomb', v: '×' + bombs, b: bombs * 5000 }
  ];
  tally = { t: 0, lines: L, total: L.reduce((s, l) => s + l.b, 0), added: false };
  for (const e of enemies) boom(e.x, e.y, 1);
  enemies = []; ebul = []; beams = [];
  state = 'clear'; KIT.music('sky-breeze');
  if (stageIdx + 1 > unlock && stageIdx + 1 < STAGES.length) { unlock = stageIdx + 1; store.set('unlock', unlock); }
}
function finishTally() {
  if (!tally.added) applyTally();
  if (stageIdx + 1 >= STAGES.length) return winGame();
  startStage(stageIdx + 1);
}
function applyTally() {
  tally.added = true;
  const live = players.filter(p => !p.out);
  for (const p of live) addScore(p, Math.round(tally.total / live.length));
}
function saveBest() {
  const top = Math.max(...players.map(p => Math.floor(p.score)));
  const rec = top > hiScore; if (rec) { hiScore = top; store.set('best', hiScore); }
  return rec;
}
function gameOver() {
  state = 'over'; KIT.stopMusic();
  const rec = saveBest();
  $('over-record').classList.toggle('hidden', !rec);
  $('over-stats').innerHTML = statRows();
  $('screen-over').classList.remove('hidden');
  overT = 10; tickContinue();
}
let contTimer = 0;
function tickContinue() {
  clearInterval(contTimer);
  const btn = $('btn-continue');
  const up = () => { btn.textContent = T('continueBtn', overT); };
  up();
  contTimer = setInterval(() => { overT--; if (overT <= 0) { clearInterval(contTimer); btn.classList.add('hidden'); } else up(); }, 1000);
  btn.classList.remove('hidden');
}
function doContinue() {
  if (state !== 'over') return;
  clearInterval(contTimer); continues++;
  for (const p of players) { p.out = false; p.stock = DIFFS[diff].stock; p.score = 0; p.bombs = 3; spawnPlayer(p); }
  hideScreens(); state = 'play';
  KIT.music(boss ? 'boss-alarm' : 'sky-raid');
}
function winGame() {
  state = 'win'; KIT.music('puzzle-calm');
  const rec = saveBest();
  $('win-record').classList.toggle('hidden', !rec);
  $('win-stats').innerHTML = statRows();
  $('screen-win').classList.remove('hidden');
  for (let i = 0; i < 6; i++) setTimeout(() => boom(rand(60, W - 60), rand(120, 400), 1.5), i * 300);
}
function nextLoop() {
  loop++; hideScreens();
  for (const p of players) { if (p.out) { p.out = false; p.stock = DIFFS[diff].stock; spawnPlayer(p); } }
  startStage(0);
}
function statRows() {
  const rows = [];
  players.forEach((p, i) => rows.push([nP === 2 ? T('stScoreP', i + 1) : T('stScore'), Math.floor(p.score).toLocaleString()]));
  rows.push([T('stStage'), (stageIdx + 1) + (loop ? ' · ' + T('loopN', loop + 1) : '')]);
  rows.push([T('stCont'), continues]);
  rows.push([T('stBest'), hiScore.toLocaleString()]);
  return rows.map(([a, b]) => `<span>${a}</span><b>${b}</b>`).join('');
}

// ---------------- 主更新 ----------------
function update(dt) {
  gt += dt;
  if (state === 'menu' || state === 'over' || state === 'win') {
    scroll += 50 * dt; parts.update(dt); updFx(dt);
    return;
  }
  if (slowT > 0) { slowT -= dt; dt *= 0.3; }
  scroll += scrollSpeed * dt;
  if (banner) { banner.t += dt; if (banner.t > banner.dur) banner = null; }
  if (state === 'play') {
    stageT += dt;
    const S = STAGES[stageIdx];
    while (evIdx < S.ev.length && S.ev[evIdx][0] <= stageT) {
      const [, type, x, n = 1, gap = 0.3, dx = 0, opt = {}] = S.ev[evIdx++];
      for (let i = 0; i < n; i++) spawnQ.push({ at: stageT + i * gap, type, x: x + dx * i, opt });
    }
    for (let i = spawnQ.length - 1; i >= 0; i--) if (spawnQ[i].at <= stageT) { const q = spawnQ[i]; spawnQ.splice(i, 1); spawnEnemy(q.type, q.x, q.opt); }
    if (!boss && !bossWarn && evIdx >= S.ev.length && stageT >= S.bossAt) { bossWarn = 3.2; warnStep = 0; KIT.music('boss-alarm'); }
    if (bossWarn > 0) {
      bossWarn -= dt;
      const st = Math.floor((3.2 - bossWarn) / 0.4);
      if (st > warnStep) { warnStep = st; sfx.siren(st); }
      if (bossWarn <= 0) { bossWarn = 0; makeBoss(S.boss); }
    }
    if (boss) updBoss(dt);
    if (bombT > 0) {
      bombT -= dt; bombStrikeT -= dt;
      if (ebul.length) clearBullets(true);
      for (const e of enemies) damageEnemy(e, 34 * dt, bombOwner, true);
      if (boss) { damageBoss(22 * dt, bombOwner); for (const pt of boss.parts) damagePart(pt, 22 * dt, bombOwner); }
      if (bombStrikeT <= 0) {
        bombStrikeT = 0.14;
        const live = enemies.filter(e => !e.dead && e.y > 0 && e.y < H);
        if (live.length) { const e = live[(Math.random() * live.length) | 0]; strike(e.x, e.y); damageEnemy(e, 25, bombOwner, true); }
        else if (boss && !boss.dying) { strike(boss.x + rand(-50, 50), boss.y + rand(-30, 30)); damageBoss(12, bombOwner); }
        else strike(rand(30, W - 30), rand(80, H * 0.6));
      }
    }
  }
  if (state === 'clear') {
    tally.t += dt;
    const shown = tally.lines.filter((l, i) => tally.t > 0.8 + i * 0.5).length;
    if (shown > (tally.shown || 0)) { tally.shown = shown; sfx.tally(); }
    if (tally.t > 3.4 && !tally.added) { applyTally(); sfx.power(); }
    if (tally.t > 6) finishTally();
  }
  for (const p of players) updPlayer(p, dt);
  for (const e of enemies) updEnemy(e, dt);
  enemies = enemies.filter(e => !e.dead);
  for (const b of pbul) updPBullet(b, dt);
  pbul = pbul.filter(b => !b.dead && b.y > -60 && b.y < H + 40 && b.x > -40 && b.x < W + 40);
  for (const b of ebul) {
    b.t += dt;
    if (b.acc) { const s = Math.hypot(b.vx, b.vy), k = (s + b.acc * dt) / s; b.vx *= k; b.vy *= k; }
    b.x += b.vx * dt; b.y += b.vy * dt;
  }
  ebul = ebul.filter(b => b.x > -20 && b.x < W + 20 && b.y > -30 && b.y < H + 20);
  for (const it of items) updItem(it, dt);
  items = items.filter(i => !i.dead);
  for (const c of craters) c.y += scrollSpeed * dt;
  craters = craters.filter(c => c.y < H + 60);
  updBeams(dt);
  if (state === 'play') collide();
  updFx(dt);
  if (state === 'play' && players.every(p => p.out)) gameOver();
}
function updPBullet(b, dt) {
  if (b.kind === 'h') {
    b.t += dt;
    let tg = null, bd = 1e9;
    for (const e of enemies) { if (e.dead || e.y < 0) continue; const d = Math.hypot(e.x - b.x, e.y - b.y); if (d < bd) { bd = d; tg = e; } }
    if (!tg && boss && !boss.dying && boss.y > 40) tg = { x: boss.x, y: boss.y };
    if (tg && b.t > 0.15) { const want = Math.atan2(tg.y - b.y, tg.x - b.x); let da = want - b.ang; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU; b.ang += clamp(da, -7 * dt, 7 * dt); }
    const sp = Math.min(560, 200 + b.t * 900); b.vx = Math.cos(b.ang) * sp; b.vy = Math.sin(b.ang) * sp;
    if (Math.random() < 0.6) parts.burst(b.x, b.y, { n: 1, color: '#d9d9d9', speed: 10, life: 0.35, size: 3, gravity: 0 });
  } else if (b.kind === 'n') {
    b.t += dt; b.vy -= 1300 * dt;
    if (Math.random() < 0.7) parts.burst(b.x, b.y + 10, { n: 1, color: ['#ffb060', '#ccc'], speed: 20, life: 0.3, size: 3, gravity: 0 });
  }
  b.x += b.vx * dt; b.y += b.vy * dt;
}
function updFx(dt) {
  parts.update(dt);
  for (const r of rings) r.t += dt; rings = rings.filter(r => r.t < r.life);
  for (const t of texts) { t.t += dt; t.y -= 30 * dt; } texts = texts.filter(t => t.t < 1.1);
  for (const b of bolts) b.t += dt; bolts = bolts.filter(b => b.t < b.life);
  flash = Math.max(0, flash - dt * 2.2); shake = Math.max(0, shake - dt * 30);
}

// ---------------- 绘制：敌人 ----------------
function shadow(c, x, y, rx, ry) { c.fillStyle = 'rgba(0,0,0,.22)'; c.beginPath(); c.ellipse(x + 18, y + 30, rx, ry, 0, 0, TAU); c.fill(); }
function drawEnemy(c, e) {
  const hit = e.flash > 0 && Math.floor(gt * 30) % 2 === 0, F = col => hit ? tint(col) : col;
  c.save(); c.translate(e.x, e.y);
  switch (e.type) {
    case 'dart':
      c.fillStyle = F('#c9d1d9'); c.beginPath(); c.moveTo(0, 16); c.lineTo(5, 2); c.lineTo(16, -6); c.lineTo(5, -6); c.lineTo(3, -14); c.lineTo(-3, -14); c.lineTo(-5, -6); c.lineTo(-16, -6); c.lineTo(-5, 2); c.closePath(); c.fill();
      c.fillStyle = F('#e5533d'); c.fillRect(-16, -7, 5, 3); c.fillRect(11, -7, 5, 3);
      c.fillStyle = '#2b3b55'; c.beginPath(); c.ellipse(0, 4, 2.5, 5, 0, 0, TAU); c.fill();
      break;
    case 'swoop': {
      c.rotate(e.ang - Math.PI / 2);
      c.fillStyle = F('#7a5bd1'); c.beginPath(); c.moveTo(0, 18); c.lineTo(17, -10); c.lineTo(6, -6); c.lineTo(0, -14); c.lineTo(-6, -6); c.lineTo(-17, -10); c.closePath(); c.fill();
      c.fillStyle = F('#b9a6f5'); c.beginPath(); c.moveTo(0, 12); c.lineTo(5, -4); c.lineTo(-5, -4); c.fill();
      c.fillStyle = '#ffcf5a'; c.beginPath(); c.arc(0, -12, 3 + Math.random(), 0, TAU); c.fill();
      break;
    }
    case 'heli':
      c.fillStyle = F('#4c7a3f'); c.beginPath(); c.ellipse(0, 4, 13, 20, 0, 0, TAU); c.fill();
      c.fillRect(-3, -30, 6, 22); c.fillRect(-10, -32, 20, 4);
      c.fillStyle = 'rgba(160,230,255,.7)'; c.beginPath(); c.ellipse(0, 12, 7, 8, 0, 0, TAU); c.fill();
      c.fillStyle = F('#2f4a27'); c.fillRect(-20, 2, 40, 5);
      c.strokeStyle = 'rgba(20,20,20,.6)'; c.lineWidth = 3;
      for (let k = 0; k < 2; k++) { const a = gt * 28 + k * Math.PI / 2; c.beginPath(); c.moveTo(Math.cos(a) * -30, Math.sin(a) * -30); c.lineTo(Math.cos(a) * 30, Math.sin(a) * 30); c.stroke(); }
      c.fillStyle = 'rgba(200,200,200,.12)'; c.beginPath(); c.arc(0, 0, 30, 0, TAU); c.fill();
      break;
    case 'kami':
      c.rotate(e.ang - Math.PI / 2);
      c.fillStyle = F('#d93a3a'); c.beginPath(); c.moveTo(0, 16); c.lineTo(10, -10); c.lineTo(0, -5); c.lineTo(-10, -10); c.closePath(); c.fill();
      c.fillStyle = '#ffb347'; c.beginPath(); c.moveTo(-4, -8); c.lineTo(0, -18 - Math.random() * 8); c.lineTo(4, -8); c.fill();
      break;
    case 'bomber':
      c.fillStyle = F('#5f6b5a'); c.beginPath(); c.moveTo(-70, -6); c.lineTo(70, -6); c.lineTo(60, 10); c.lineTo(-60, 10); c.closePath(); c.fill();
      c.fillStyle = F('#77856f'); c.beginPath(); c.ellipse(0, 0, 14, 48, 0, 0, TAU); c.fill();
      c.fillStyle = F('#4a5446'); c.fillRect(-28, -44, 56, 8);
      for (const x of [-46, -22, 22, 46]) {
        c.fillStyle = F('#3f473b'); c.beginPath(); c.ellipse(x, 6, 7, 14, 0, 0, TAU); c.fill();
        c.strokeStyle = 'rgba(30,30,30,.5)'; c.lineWidth = 2; c.beginPath(); c.moveTo(x - 12, 18 + Math.sin(gt * 40 + x) * 2); c.lineTo(x + 12, 18 - Math.sin(gt * 40 + x) * 2); c.stroke();
      }
      c.fillStyle = 'rgba(150,220,255,.75)'; c.beginPath(); c.ellipse(0, 34, 6, 8, 0, 0, TAU); c.fill();
      c.fillStyle = '#ff4b3e'; c.globalAlpha = 0.5 + 0.5 * Math.sin(gt * 8); c.beginPath(); c.arc(-66, -2, 3, 0, TAU); c.arc(66, -2, 3, 0, TAU); c.fill(); c.globalAlpha = 1;
      break;
    case 'carrier':
      c.fillStyle = F('#d7c9a6'); c.beginPath(); c.ellipse(0, 0, 18, 28, 0, 0, TAU); c.fill();
      c.fillStyle = F('#b9aa83'); c.fillRect(-34, -4, 68, 10);
      c.fillStyle = F('#f08a24'); c.fillRect(-18, -8, 36, 6); c.fillRect(-34, -4, 8, 10); c.fillRect(26, -4, 8, 10);
      c.fillStyle = Math.sin(gt * 10) > 0 ? '#5df27a' : '#1f6e33'; c.beginPath(); c.arc(0, -16, 4, 0, TAU); c.fill();
      break;
    case 'drone':
      c.rotate(gt * 5);
      c.fillStyle = F('#7f8bb0'); c.beginPath(); for (let i = 0; i < 3; i++) { const a = i * TAU / 3; c.lineTo(Math.cos(a) * 15, Math.sin(a) * 15); c.lineTo(Math.cos(a + 1.05) * 6, Math.sin(a + 1.05) * 6); } c.closePath(); c.fill();
      c.fillStyle = '#4fe0ff'; c.beginPath(); c.arc(0, 0, 4, 0, TAU); c.fill();
      break;
    case 'orb': {
      const p = 1 + Math.sin(gt * 6 + e.x) * 0.1;
      const g = c.createRadialGradient(-4, -4, 1, 0, 0, 16 * p); g.addColorStop(0, F('#ffd0e0')); g.addColorStop(0.5, F('#e0457a')); g.addColorStop(1, F('#6a0e30'));
      c.fillStyle = g; c.beginPath(); c.arc(0, 0, 15 * p, 0, TAU); c.fill();
      c.fillStyle = '#1a0008'; c.beginPath(); c.arc(0, 3, 4, 0, TAU); c.fill();
      break;
    }
    case 'emis':
      c.rotate(e.ang - Math.PI / 2);
      c.fillStyle = F('#c8c8c8'); c.fillRect(-3, -9, 6, 18); c.fillStyle = F('#e04a3a'); c.beginPath(); c.moveTo(-3, 9); c.lineTo(0, 14); c.lineTo(3, 9); c.fill();
      c.fillStyle = '#ffb347'; c.beginPath(); c.arc(0, -11, 3 + Math.random() * 2, 0, TAU); c.fill();
      break;
    case 'tank': {
      c.fillStyle = F('#3c4230'); c.fillRect(-17, -14, 34, 28);
      c.fillStyle = '#23271c'; const tr = (gt * 40) % 6;
      for (let y = -14 + tr; y < 14; y += 6) { c.fillRect(-19, y, 5, 3); c.fillRect(14, y, 5, 3); }
      c.fillStyle = F('#5d6848'); c.beginPath(); c.arc(0, 0, 9, 0, TAU); c.fill();
      c.strokeStyle = F('#2f3526'); c.lineWidth = 5; c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(e.turret) * 20, Math.sin(e.turret) * 20); c.stroke();
      break;
    }
    case 'turret':
      c.fillStyle = F('#6b6f75'); c.beginPath(); for (let i = 0; i < 6; i++) { const a = i * TAU / 6; c.lineTo(Math.cos(a) * 20, Math.sin(a) * 20); } c.closePath(); c.fill();
      c.fillStyle = F('#8b9097'); c.beginPath(); c.arc(0, 0, 11, 0, TAU); c.fill();
      c.strokeStyle = F('#33363a'); c.lineWidth = 6; c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(e.turret) * 22, Math.sin(e.turret) * 22); c.stroke();
      break;
    case 'boat':
      c.fillStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.moveTo(-12, -22); c.lineTo(-26 - Math.sin(gt * 4) * 3, -60); c.lineTo(26, -60); c.lineTo(12, -22); c.fill();
      c.fillStyle = F('#596673'); c.beginPath(); c.moveTo(0, 26); c.lineTo(13, 8); c.lineTo(12, -22); c.lineTo(-12, -22); c.lineTo(-13, 8); c.closePath(); c.fill();
      c.fillStyle = F('#8794a1'); c.fillRect(-7, -12, 14, 14);
      c.strokeStyle = '#2c3238'; c.lineWidth = 4; c.beginPath(); c.moveTo(0, 8); c.lineTo(Math.cos(e.turret) * 16, 8 + Math.sin(e.turret) * 16); c.stroke();
      break;
    case 'bunker':
      c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(-22, -18, 50, 46);
      c.fillStyle = F('#8a8678'); c.fillRect(-25, -25, 50, 50);
      c.fillStyle = F('#a6a291'); c.fillRect(-20, -20, 40, 40);
      c.fillStyle = e.open ? '#2a2620' : F('#6d6a5e'); c.beginPath(); c.arc(0, 0, 12, 0, TAU); c.fill();
      if (e.open) { c.fillStyle = '#ff8a3a'; c.beginPath(); c.arc(0, 0, 5 + Math.sin(gt * 8) * 1.5, 0, TAU); c.fill(); }
      break;
  }
  c.restore();
}

// ---------------- 绘制：玩家 ----------------
function drawShip(c, x, y, bank, id, scale = 1) {
  const P = PCOL[id];
  c.save(); c.translate(x, y); c.scale(scale, scale);
  const w = 1 - Math.abs(bank) * 0.3;
  const fl = 8 + Math.random() * 7;
  const g = c.createLinearGradient(0, 12, 0, 12 + fl);
  g.addColorStop(0, '#fff7c2'); g.addColorStop(0.4, '#ffb347'); g.addColorStop(1, 'rgba(255,90,40,0)');
  c.fillStyle = g;
  for (const s of [-5, 5]) { c.beginPath(); c.moveTo(s - 3, 12); c.lineTo(s, 14 + fl); c.lineTo(s + 3, 12); c.fill(); }
  c.fillStyle = P.dark;
  c.beginPath(); c.moveTo(-22 * w, 10); c.lineTo(-7, -6); c.lineTo(7, -6); c.lineTo(22 * w, 10); c.lineTo(9, 14); c.lineTo(-9, 14); c.closePath(); c.fill();
  c.fillStyle = P.main;
  c.beginPath(); c.moveTo(-20 * w, 8); c.lineTo(-7, -4); c.lineTo(7, -4); c.lineTo(20 * w, 8); c.lineTo(8, 11); c.lineTo(-8, 11); c.closePath(); c.fill();
  c.fillStyle = '#eef1f5';
  c.beginPath(); c.moveTo(0, -24); c.lineTo(6, -8); c.lineTo(6, 14); c.lineTo(-6, 14); c.lineTo(-6, -8); c.closePath(); c.fill();
  c.fillStyle = '#c3cad3'; c.fillRect(-6, 4, 12, 10);
  c.fillStyle = P.main; c.fillRect(-1.5, -18, 3, 14);
  const cg = c.createLinearGradient(0, -14, 0, -2); cg.addColorStop(0, '#d9f6ff'); cg.addColorStop(1, '#2b7bbd');
  c.fillStyle = cg; c.beginPath(); c.ellipse(0, -8, 3.2, 6, 0, 0, TAU); c.fill();
  c.fillStyle = P.light; c.fillRect(-19 * w, 6, 4, 3); c.fillRect(15 * w, 6, 4, 3);
  c.restore();
}
function drawPlayers(c) {
  for (const p of players) {
    if (!p.alive || p.out) continue;
    for (const t of p.plasma) drawPlasma(c, p.x, p.y - 18, t.x, t.y, p.lv);
    if (p.inv > 0 && Math.floor(gt * 16) % 2) continue;
    drawShip(c, p.x, p.y, p.bank, p.id);
    if (p.focus) {
      c.strokeStyle = 'rgba(255,255,255,.8)'; c.lineWidth = 1.5; c.beginPath(); c.arc(p.x, p.y, 7, 0, TAU); c.stroke();
      c.fillStyle = '#ff4f9a'; c.beginPath(); c.arc(p.x, p.y, 3, 0, TAU); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(p.x, p.y, 1.6, 0, TAU); c.fill();
    }
    if (nP === 2) { c.fillStyle = PCOL[p.id].light; c.font = 'bold 10px system-ui'; c.textAlign = 'center'; c.fillText(p.id + 1 + 'P', p.x, p.y + 32); }
  }
}
function drawPlasma(c, x1, y1, x2, y2, lv) {
  const n = 9, pts = [];
  for (let i = 0; i <= n; i++) {
    const k = i / n, j = (i === 0 || i === n) ? 0 : (Math.random() - 0.5) * 22;
    const nx = -(y2 - y1), ny = x2 - x1, L = Math.hypot(nx, ny) || 1;
    pts.push([x1 + (x2 - x1) * k + nx / L * j, y1 + (y2 - y1) * k + ny / L * j]);
  }
  c.lineCap = 'round'; c.lineJoin = 'round';
  [[10 + lv * 1.5, 'rgba(180,90,255,.25)'], [4 + lv * 0.6, 'rgba(210,150,255,.8)'], [1.6, '#ffffff']].forEach(([w, col]) => {
    c.strokeStyle = col; c.lineWidth = w; c.beginPath(); pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.stroke();
  });
  c.fillStyle = 'rgba(230,200,255,.9)'; c.beginPath(); c.arc(x2, y2, 6 + Math.random() * 6, 0, TAU); c.fill();
}
function drawPBullets(c) {
  for (const b of pbul) {
    if (b.kind === 'v') {
      c.fillStyle = '#ff8a3a'; c.beginPath(); c.ellipse(b.x, b.y, 3.2, 9, Math.atan2(b.vy, b.vx) + Math.PI / 2, 0, TAU); c.fill();
      c.fillStyle = '#fff2c4'; c.beginPath(); c.ellipse(b.x, b.y, 1.5, 6, Math.atan2(b.vy, b.vx) + Math.PI / 2, 0, TAU); c.fill();
    } else if (b.kind === 'l') {
      const g = c.createLinearGradient(b.x - b.w / 2, 0, b.x + b.w / 2, 0);
      g.addColorStop(0, 'rgba(60,160,255,0)'); g.addColorStop(0.3, 'rgba(80,190,255,.9)'); g.addColorStop(0.5, '#ffffff'); g.addColorStop(0.7, 'rgba(80,190,255,.9)'); g.addColorStop(1, 'rgba(60,160,255,0)');
      c.fillStyle = g; c.fillRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h + 4);
    } else if (b.kind === 'p') {
      c.drawImage(orbSpr('#b36bff', 5), b.x - 16, b.y - 16, 32, 32);
    } else {
      c.save(); c.translate(b.x, b.y); c.rotate(Math.atan2(b.vy, b.vx) + Math.PI / 2);
      c.fillStyle = b.kind === 'n' ? '#e9e2c8' : '#dfe6ee'; c.fillRect(-2.5, -8, 5, 16);
      c.fillStyle = b.kind === 'n' ? '#d94a3a' : '#3c8de8'; c.beginPath(); c.moveTo(-2.5, -8); c.lineTo(0, -13); c.lineTo(2.5, -8); c.fill();
      c.fillStyle = '#ffcf6a'; c.beginPath(); c.arc(0, 10, 2.5 + Math.random() * 2, 0, TAU); c.fill();
      c.restore();
    }
  }
}
function drawEBullets(c) {
  for (const b of ebul) {
    const col = BCOL[b.c] || b.c;
    if (b.kind === 1) {
      c.save(); c.translate(b.x, b.y); c.rotate(Math.atan2(b.vy, b.vx));
      c.fillStyle = col; c.beginPath(); c.ellipse(0, 0, b.r * 2.2, b.r * 0.9, 0, 0, TAU); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.ellipse(0, 0, b.r * 1.4, b.r * 0.45, 0, 0, TAU); c.fill();
      c.restore();
    } else {
      const s = b.r * 3.2; c.drawImage(orbSpr(col, b.r), b.x - s, b.y - s, s * 2, s * 2);
    }
  }
}
function drawItems(c) {
  for (const it of items) {
    const blink = it.t > 7 && it.kind !== 'medal' && Math.floor(it.t * 8) % 2;
    if (blink) continue;
    c.save(); c.translate(it.x, it.y);
    if (it.kind === 'pow') {
      const ci = powCol(it), col = ['#ff4b3e', '#3fa0ff', '#b36bff'][ci];
      c.rotate(gt * 2);
      c.shadowColor = col; c.shadowBlur = 14;
      c.fillStyle = col; c.beginPath(); c.moveTo(0, -13); c.lineTo(11, 0); c.lineTo(0, 13); c.lineTo(-11, 0); c.closePath(); c.fill();
      c.shadowBlur = 0;
      c.fillStyle = 'rgba(255,255,255,.7)'; c.beginPath(); c.moveTo(0, -13); c.lineTo(5, -2); c.lineTo(-5, -2); c.fill();
    } else if (it.kind === 'medal') {
      const sx = Math.abs(Math.cos(gt * 5 + it.x));
      c.scale(Math.max(0.15, sx), 1);
      c.fillStyle = '#c98a1a'; c.beginPath(); c.arc(0, 0, 10, 0, TAU); c.fill();
      c.fillStyle = '#ffd84a'; c.beginPath(); c.arc(0, 0, 8, 0, TAU); c.fill();
      c.fillStyle = '#fff5b8'; c.font = 'bold 11px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('★', 0, 1);
    } else {
      const lab = it.kind === 'mis' ? misKind(it) : it.kind === 'bomb' ? 'B' : '1UP';
      const col = it.kind === 'mis' ? (lab === 'H' ? '#3c8de8' : '#2fa35a') : it.kind === 'bomb' ? '#e0a020' : '#e04a8a';
      c.fillStyle = col; KIT.roundRect(c, -13, -11, 26, 22, 6); c.fill();
      c.strokeStyle = '#fff'; c.lineWidth = 2; c.stroke();
      c.fillStyle = '#fff'; c.font = `bold ${lab.length > 1 ? 10 : 14}px system-ui`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(lab, 0, 1);
    }
    c.restore();
  }
}
function drawFx(c) {
  for (const r of rings) {
    const k = r.t / r.life, rad = r.r + (r.max - r.r) * KIT.ease.outCubic(k);
    if (r.fill) { c.fillStyle = `rgba(${r.col},${(1 - k) * 0.9})`; c.beginPath(); c.arc(r.x, r.y, rad, 0, TAU); c.fill(); }
    else { c.strokeStyle = `rgba(${r.col},${1 - k})`; c.lineWidth = r.w * (1 - k) + 0.5; c.beginPath(); c.arc(r.x, r.y, rad, 0, TAU); c.stroke(); }
  }
  parts.draw(c);
  for (const b of bolts) {
    const a = 1 - b.t / b.life;
    [[12, `rgba(120,190,255,${0.3 * a})`], [5, `rgba(190,230,255,${0.9 * a})`], [2, `rgba(255,255,255,${a})`]].forEach(([w, col]) => {
      c.strokeStyle = col; c.lineWidth = w; c.beginPath(); b.pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.stroke();
    });
  }
  c.textAlign = 'center'; c.textBaseline = 'middle';
  for (const t of texts) {
    const a = t.t < 0.8 ? 1 : 1 - (t.t - 0.8) / 0.3;
    c.globalAlpha = Math.max(0, a);
    c.font = `${t.big ? 'bold 18px' : 'bold 13px'} "AMG Display", system-ui`;
    c.lineWidth = 3; c.strokeStyle = 'rgba(0,0,0,.6)'; c.strokeText(t.txt, t.x, t.y); c.fillStyle = t.col; c.fillText(t.txt, t.x, t.y);
  }
  c.globalAlpha = 1;
}
function drawBeams(c) {
  const cy = boss ? boss.y + 70 : 160;
  for (const bm of beams) {
    if (bm.warn > 0) {
      c.strokeStyle = `rgba(120,220,255,${Math.floor(gt * 14) % 2 ? 0.9 : 0.3})`; c.lineWidth = 2; c.setLineDash([10, 8]);
      c.beginPath(); c.moveTo(bm.x - bm.w / 2, cy); c.lineTo(bm.x - bm.w / 2, H); c.moveTo(bm.x + bm.w / 2, cy); c.lineTo(bm.x + bm.w / 2, H); c.stroke(); c.setLineDash([]);
    } else {
      const w = bm.w * (0.8 + Math.random() * 0.25);
      const g = c.createLinearGradient(bm.x - w / 2, 0, bm.x + w / 2, 0);
      g.addColorStop(0, 'rgba(80,180,255,0)'); g.addColorStop(0.25, 'rgba(110,210,255,.85)'); g.addColorStop(0.5, '#ffffff'); g.addColorStop(0.75, 'rgba(110,210,255,.85)'); g.addColorStop(1, 'rgba(80,180,255,0)');
      c.fillStyle = g; c.fillRect(bm.x - w / 2, cy, w, H - cy);
    }
  }
}

// ---------------- HUD ----------------
const fmt = n => String(Math.floor(n)).padStart(8, '0');
function drawHUD(c) {
  c.fillStyle = 'rgba(8,10,20,.45)'; c.fillRect(0, 0, W, 30);
  c.font = 'bold 14px "AMG Display", system-ui'; c.textBaseline = 'middle';
  c.textAlign = 'left'; c.fillStyle = '#ff8a7a'; c.fillText('1P', 10, 15); c.fillStyle = '#fff'; c.fillText(fmt(players[0] ? players[0].score : 0), 34, 15);
  c.textAlign = 'center'; c.fillStyle = '#ffd84a'; c.fillText('HI ' + fmt(Math.max(hiScore, ...players.map(p => p.score))), W / 2, 15);
  if (nP === 2 && players[1]) { c.textAlign = 'right'; c.fillStyle = '#fff'; c.fillText(fmt(players[1].score), W - 34, 15); c.fillStyle = '#8ac4ff'; c.fillText('2P', W - 10, 15); }
  players.forEach(p => {
    const left = p.id === 0, x0 = left ? 10 : W - 10, dir = left ? 1 : -1;
    if (p.out) { c.font = 'bold 13px "AMG Display", system-ui'; c.textAlign = left ? 'left' : 'right'; c.fillStyle = 'rgba(255,255,255,.6)'; c.fillText('GAME OVER', x0, H - 18); return; }
    for (let i = 0; i < Math.min(p.stock, 6); i++) drawShip(c, x0 + dir * (8 + i * 16), H - 44, 0, p.id, 0.42);
    for (let i = 0; i < p.bombs; i++) {
      const bx = x0 + dir * (8 + i * 15), by = H - 20;
      c.fillStyle = '#e0a020'; c.beginPath(); c.arc(bx, by, 6, 0, TAU); c.fill(); c.fillStyle = '#fff'; c.font = 'bold 8px system-ui'; c.textAlign = 'center'; c.fillText('B', bx, by + 0.5);
    }
    const wx = left ? 128 : W - 128, col = { V: '#ff4b3e', L: '#3fa0ff', P: '#b36bff' }[p.wpn];
    c.fillStyle = col; c.beginPath(); c.moveTo(wx, H - 50); c.lineTo(wx + 7, H - 43); c.lineTo(wx, H - 36); c.lineTo(wx - 7, H - 43); c.fill();
    for (let i = 0; i < 6; i++) { c.fillStyle = i < p.lv ? col : 'rgba(255,255,255,.2)'; c.fillRect(wx + dir * 12 + (left ? 0 : -6) + dir * i * 8, H - 47, 6, 8); }
    if (p.mis) { c.font = 'bold 11px system-ui'; c.textAlign = 'center'; c.fillStyle = p.mis === 'H' ? '#8ac4ff' : '#7fe0a0'; c.fillText(p.mis + p.mlv, wx + dir * 70, H - 43); }
  });
  if (boss && !boss.dying && boss.t > 0.5) {
    const bw = W - 40, k = boss.hp / boss.max;
    c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(20, 38, bw, 10);
    const g = c.createLinearGradient(20, 0, 20 + bw, 0); g.addColorStop(0, '#ff3b30'); g.addColorStop(1, '#ffb347');
    c.fillStyle = g; c.fillRect(20, 38, bw * k, 10);
    c.strokeStyle = 'rgba(255,255,255,.6)'; c.lineWidth = 1; c.strokeRect(20, 38, bw, 10);
    c.fillStyle = 'rgba(255,255,255,.5)'; c.fillRect(20 + bw * 0.33, 38, 1.5, 10); c.fillRect(20 + bw * 0.66, 38, 1.5, 10);
    c.font = 'bold 11px "AMG Display", system-ui'; c.textAlign = 'left'; c.fillStyle = '#fff'; c.fillText(T('bossNames')[stageIdx], 22, 58);
  }
}
function drawBanner(c) {
  if (!banner) return;
  const t = banner.t, a = t < 0.4 ? t / 0.4 : t > banner.dur - 0.5 ? (banner.dur - t) / 0.5 : 1;
  c.save(); c.globalAlpha = Math.max(0, a);
  c.fillStyle = 'rgba(0,0,0,.45)'; c.fillRect(0, H * 0.36, W, 110);
  c.fillStyle = '#ffd84a'; c.fillRect(0, H * 0.36, W, 3); c.fillRect(0, H * 0.36 + 107, W, 3);
  const off = (1 - KIT.ease.outCubic(Math.min(1, t / 0.6))) * 200;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = '44px "AMG Display", system-ui'; c.fillStyle = '#fff'; c.fillText(banner.title, W / 2 - off, H * 0.36 + 42);
  c.font = '20px "AMG Display", system-ui'; c.fillStyle = '#ffd84a'; c.fillText(banner.sub, W / 2 + off, H * 0.36 + 82);
  c.restore();
}
function drawWarning(c) {
  if (bossWarn <= 0) return;
  const a = 0.55 + 0.45 * Math.sin(gt * 12);
  c.fillStyle = `rgba(255,30,30,${0.12 * a})`; c.fillRect(0, 0, W, H);
  for (const y of [H * 0.3, H * 0.62]) {
    c.fillStyle = 'rgba(160,0,0,.75)'; c.fillRect(0, y, W, 34);
    c.fillStyle = '#ffd84a'; c.font = 'bold 16px "AMG Display", system-ui'; c.textAlign = 'left'; c.textBaseline = 'middle';
    const off = (gt * 160) % 160;
    for (let x = -160; x < W + 160; x += 160) c.fillText('⚠ WARNING', (y < H / 2 ? x + off : x - off), y + 17);
  }
  c.globalAlpha = a; c.textAlign = 'center';
  c.font = '54px "AMG Display", system-ui'; c.fillStyle = '#ff4b3e'; c.fillText(T('warning'), W / 2, H * 0.46);
  c.font = '17px "AMG Display", system-ui'; c.fillStyle = '#fff'; c.fillText(T('bossApproach'), W / 2, H * 0.46 + 46);
  c.globalAlpha = 1;
}
function drawTally(c) {
  if (state !== 'clear' || !tally) return;
  const t = tally.t;
  c.fillStyle = `rgba(5,10,25,${Math.min(0.6, t)})`; c.fillRect(0, 0, W, H);
  c.textAlign = 'center'; c.textBaseline = 'middle';
  const s = 1 + Math.max(0, 0.4 - t) * 2;
  c.save(); c.translate(W / 2, 180); c.scale(s, s);
  c.font = '46px "AMG Display", system-ui'; c.fillStyle = '#ffd84a'; c.fillText(T('clear'), 0, 0); c.restore();
  c.font = '16px "AMG Display", system-ui'; c.fillStyle = '#fff'; c.fillText(T('stageNames')[stageIdx], W / 2, 222);
  tally.lines.forEach((l, i) => {
    if (t < 0.8 + i * 0.5) return;
    const y = 290 + i * 46, k = Math.min(1, (t - 0.8 - i * 0.5) / 0.3);
    c.globalAlpha = k;
    c.font = '18px "AMG Display", system-ui'; c.textAlign = 'left'; c.fillStyle = '#cfe0ff'; c.fillText(T(l.k), 70 - (1 - k) * 40, y);
    c.textAlign = 'center'; c.fillStyle = '#fff'; c.fillText(l.v, W / 2 + 40, y);
    c.textAlign = 'right'; c.fillStyle = '#ffd84a'; c.fillText('+' + l.b.toLocaleString(), W - 60, y);
  });
  c.globalAlpha = 1;
  if (t > 2.9) {
    c.fillStyle = 'rgba(255,255,255,.3)'; c.fillRect(60, 480, W - 120, 2);
    c.font = '24px "AMG Display", system-ui'; c.textAlign = 'center'; c.fillStyle = '#ffe28a';
    c.fillText(T('tTotal') + '  ' + tally.total.toLocaleString(), W / 2, 512);
  }
}

// ---------------- 主绘制 ----------------
function render() {
  const c = ctx;
  c.save();
  if (shake > 0) c.translate(rand(-shake, shake) * 0.5, rand(-shake, shake) * 0.5);
  const S = STAGES[state === 'menu' ? pickStage : stageIdx], bg = BG[S.bg];
  bg.base(c);
  const k0 = Math.floor((scroll - 260) / SEG), k1 = Math.floor((scroll + H + 260) / SEG);
  for (let k = k0; k <= k1; k++) {
    const key = S.bg + ':' + k;
    if (!decor.has(key)) decor.set(key, bg.gen(k, rng(k * 7919 + S.bg * 104729 + 13)));
    for (const d of decor.get(key)) { const y = sy(d.wy); if (y > -200 && y < H + 200) bg.draw(c, d, y); }
  }
  if (decor.size > 80) for (const key of decor.keys()) { const k = +key.split(':')[1]; if (k < k0 - 2) decor.delete(key); }
  for (const cr of craters) {
    c.fillStyle = 'rgba(30,20,10,.55)'; c.beginPath(); c.ellipse(cr.x, cr.y, cr.r, cr.r * 0.8, cr.s, 0, TAU); c.fill();
    c.fillStyle = 'rgba(60,40,20,.5)'; c.beginPath(); c.ellipse(cr.x + 3, cr.y + 2, cr.r * 0.6, cr.r * 0.45, cr.s, 0, TAU); c.fill();
  }
  if (state !== 'menu') {
    for (const e of enemies) if (!e.air) drawEnemy(c, e);
    if (bg.clouds) drawClouds(c, 0.32);
    for (const e of enemies) if (e.air && e.type !== 'emis') shadow(c, e.x, e.y, e.r * 0.8, e.r * 0.5);
    if (boss) boss.def.draw(c, boss, boss.flash > 0 && Math.floor(gt * 30) % 2 === 0);
    drawItems(c);
    for (const e of enemies) if (e.air) drawEnemy(c, e);
    drawPBullets(c);
    drawBeams(c);
    drawPlayers(c);
    drawEBullets(c);
  } else {
    if (bg.clouds) drawClouds(c, 0.32);
    const t = gt;
    drawShip(c, W / 2 + Math.sin(t * 0.9) * 90, H - 150 + Math.sin(t * 1.7) * 14, Math.cos(t * 0.9) * 0.8, 0, 1.3);
    if (nP === 2) drawShip(c, W / 2 + Math.sin(t * 0.9 + 2) * 90, H - 110 + Math.sin(t * 1.5) * 14, Math.cos(t * 0.9 + 2) * 0.8, 1, 1.3);
  }
  drawFx(c);
  if (bg.snow) {
    c.fillStyle = 'rgba(255,255,255,.8)';
    for (let i = 0; i < 40; i++) { const x = (hash(i) * W + Math.sin(gt + i) * 20 + gt * 20) % W, y = (hash(i, 1) * H + gt * (60 + hash(i, 2) * 60)) % H; c.fillRect(x, y, 2, 2); }
  }
  c.restore();
  if (state !== 'menu') { drawHUD(c); drawWarning(c); drawBanner(c); drawTally(c); }
  if (flash > 0) { c.fillStyle = `rgba(${flashCol},${Math.min(0.85, flash)})`; c.fillRect(0, 0, W, H); }
  if (state === 'play' && boss && boss.phase === 2 && boss.kind === 'hive') { c.fillStyle = `rgba(255,0,60,${0.06 + 0.05 * Math.sin(gt * 9)})`; c.fillRect(0, 0, W, H); }
}

let last = performance.now();
function loopFrame(now) {
  const dt = Math.min(0.033, (now - last) / 1000); last = now;
  pollPads();
  if (state !== 'pause') update(dt);
  render();
  requestAnimationFrame(loopFrame);
}

// ---------------- 输入 ----------------
const GAME_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Slash']);
document.addEventListener('keydown', e => {
  if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
  if (GAME_KEYS.has(e.code) && state !== 'menu') e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code);
  if (e.code === 'KeyP' || e.code === 'Escape') { togglePause(); return; }
  if (state === 'menu' && (e.code === 'Enter' || e.code === 'Space')) { e.preventDefault(); $('btn-start').click(); return; }
  if (state === 'clear' && tally && tally.t > 1 && (K1.bomb.includes(e.code) || K2.bomb.includes(e.code))) { tally.t = Math.max(tally.t, 5.6); return; }
  if (state === 'play') {
    if (nP === 1 && (K1.bomb.includes(e.code) || K2.bomb.includes(e.code) || e.code === 'KeyX')) useBomb(players[0]);
    else if (nP === 2) { if (K1.bomb.includes(e.code)) useBomb(players[0]); if (K2.bomb.includes(e.code)) useBomb(players[1]); }
  }
});
document.addEventListener('keyup', e => keys.delete(e.code));
window.addEventListener('blur', () => { keys.clear(); if (state === 'play') togglePause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') togglePause(); });
function pollPads() {
  for (let i = 0; i < 2; i++) {
    const g = padState(i); if (!g) continue;
    const pr = padPrev[i];
    if (g.bomb && !pr.bomb) {
      if (state === 'play') useBomb(players[nP === 1 ? 0 : i]);
      else if (state === 'menu') $('btn-start').click();
      else if (state === 'clear' && tally) tally.t = Math.max(tally.t, 5.6);
      else if (state === 'over') doContinue();
    }
    if (g.pause && !pr.pause) togglePause();
    padPrev[i] = g;
  }
}
const touch = { on: false, x: 0, y: 0, dx: 0, dy: 0, id: null };
cv.addEventListener('pointerdown', e => {
  if (state !== 'play' && state !== 'clear') return;
  touch.on = true; touch.id = e.pointerId; touch.x = e.clientX; touch.y = e.clientY;
  try { cv.setPointerCapture(e.pointerId); } catch (_) {}
});
cv.addEventListener('pointermove', e => {
  if (!touch.on || e.pointerId !== touch.id) return;
  const r = cv.getBoundingClientRect(), k = W / r.width * 1.25;
  touch.dx += (e.clientX - touch.x) * k; touch.dy += (e.clientY - touch.y) * k;
  touch.x = e.clientX; touch.y = e.clientY;
});
const endTouch = e => { if (e.pointerId === touch.id) { touch.on = false; touch.dx = touch.dy = 0; } };
cv.addEventListener('pointerup', endTouch); cv.addEventListener('pointercancel', endTouch);
$('t-bomb').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); if (state === 'clear' && tally) tally.t = Math.max(tally.t, 5.6); else useBomb(players[0]); });
$('t-pause').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); togglePause(); });

function togglePause() {
  if (state === 'play' || state === 'clear') { prevState = state; state = 'pause'; $('screen-pause').classList.remove('hidden'); KIT.stopMusic(); }
  else if (state === 'pause') { state = prevState; $('screen-pause').classList.add('hidden'); KIT.music(boss || bossWarn ? 'boss-alarm' : state === 'clear' ? 'sky-breeze' : 'sky-raid'); last = performance.now(); }
}
function hideScreens() { ['screen-menu', 'screen-pause', 'screen-over', 'screen-win'].forEach(id => $(id).classList.add('hidden')); }
function toMenu() {
  clearInterval(contTimer);
  if (players.length && state !== 'menu') saveBest();
  hideScreens(); state = 'menu'; KIT.stopMusic();
  boss = null; enemies = []; ebul = []; pbul = []; items = []; beams = []; banner = null; tally = null; bossWarn = 0;
  renderMenu(); $('screen-menu').classList.remove('hidden');
}

// ---------------- 菜单 ----------------
function renderMenu() {
  document.querySelectorAll('#pl-seg button').forEach(b => b.classList.toggle('on', +b.dataset.n === nP));
  document.querySelectorAll('#diff-seg button').forEach(b => b.classList.toggle('on', +b.dataset.d === diff));
  const box = $('stage-pick'); box.innerHTML = '';
  const names = T('stageNames'), emo = ['🌊', '🏜️', '🌴', '❄️', '🛰️', '👁️'];
  names.forEach((n, i) => {
    const b = document.createElement('button');
    b.className = 'lvl-btn' + (i === pickStage ? ' active' : '') + (i > unlock ? ' locked' : '');
    b.innerHTML = `<span class="lv-emo">${i > unlock ? '🔒' : emo[i]}</span>${i + 1}<small>${n}</small>`;
    b.title = i > unlock ? T('locked') : n;
    b.onclick = () => { if (i > unlock) { KIT.tone(200, 0.1, { type: 'square', vol: 0.04 }); return; } pickStage = i; scroll = 0; decor.clear(); renderMenu(); };
    box.appendChild(b);
  });
  $('menu-best').textContent = T('bestLbl', hiScore.toLocaleString());
  $('hint-2p').classList.toggle('hidden', nP !== 2);
  $('hint-1p').classList.toggle('hidden', nP === 2);
}
document.querySelectorAll('#pl-seg button').forEach(b => b.onclick = () => { nP = +b.dataset.n; store.set('players', nP); renderMenu(); });
document.querySelectorAll('#diff-seg button').forEach(b => b.onclick = () => { diff = +b.dataset.d; store.set('diff', diff); renderMenu(); });
$('btn-start').onclick = () => { KIT.audio(); newGame(pickStage); };
$('btn-resume').onclick = () => togglePause();
$('btn-restart').onclick = () => { $('screen-pause').classList.add('hidden'); newGame(stageIdx); };
$('btn-quit').onclick = toMenu;
$('btn-continue').onclick = doContinue;
$('btn-retry').onclick = () => { clearInterval(contTimer); newGame(0); };
$('btn-menu').onclick = toMenu;
$('btn-loop').onclick = nextLoop;
$('btn-menu2').onclick = toMenu;

if (location.hash === '#debug') window.__rd = {
  info: () => ({ state, stageIdx, stageT: +stageT.toFixed(1), enemies: enemies.length, ebul: ebul.length, boss: boss && { hp: Math.round(boss.hp), max: Math.round(boss.max), phase: boss.phase }, players: players.map(p => ({ score: Math.floor(p.score), lv: p.lv, wpn: p.wpn, stock: p.stock, alive: p.alive })) }),
  stage: i => newGame(i),
  toBoss: () => { stageT = STAGES[stageIdx].bossAt; evIdx = STAGES[stageIdx].ev.length; },
  god: () => players.forEach(p => { p.inv = 1e9; }),
  power: (w, lv) => players.forEach(p => { p.wpn = w; p.lv = lv; p.mis = 'H'; p.mlv = 4; }),
  hurtBoss: f => { if (boss) boss.hp = boss.max * f; },
  kill: () => players.forEach(p => { p.stock = 0; p.inv = 0; killPlayer(p); }),
  setPlayers: n => { nP = n; }
};
const syncMute = KIT.mountMute($('btn-mute'));
KIT.boot(() => { syncMute(); renderMenu(); if (state === 'over') $('btn-continue').textContent = T('continueBtn', overT); });
renderMenu();
requestAnimationFrame(loopFrame);
})();
