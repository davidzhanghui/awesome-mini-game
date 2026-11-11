'use strict';
/* ================= 程序化 Q 版美术 ================= */
const OLC = '#4a3428';
function shade(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp((n >> 16) + a, 0, 255), g = clamp((n >> 8 & 255) + a, 0, 255), b = clamp((n & 255) + a, 0, 255);
  return `rgb(${r},${g},${b})`;
}
function paint(c, f, s) {
  if (f) { c.fillStyle = f; c.fill(); }
  if (s !== null) { c.strokeStyle = s || OLC; c.lineWidth = 2; c.stroke(); }
}
function ell(c, x, y, rx, ry, f, s) { c.beginPath(); c.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, 6.2832); paint(c, f, s); }
function rr(c, x, y, w, h, r, f, s) { c.beginPath(); c.roundRect(x, y, w, h, r); paint(c, f, s); }
function poly(c, pts, f, s) {
  c.beginPath(); c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  c.closePath(); paint(c, f, s);
}
function mirror(c, pts, f, s) { poly(c, pts, f, s); poly(c, pts.map((v, i) => i % 2 ? v : -v), f, s); }
function eyes2(c, x1, x2, y, r) {
  for (const x of [x1, x2]) { ell(c, x, y, r, r * 1.3, '#2a1a14', null); ell(c, x + r * 0.3, y - r * 0.5, r * 0.4, r * 0.4, '#fff', null); }
}
function line(c, x1, y1, x2, y2, col, w) { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.strokeStyle = col || OLC; c.lineWidth = w || 2; c.stroke(); }

/* 怪物：原点在脚底，默认朝右 */
function drawMon(c, shape, col, t) {
  const dk = shade(col, -45), lt = shade(col, 45);
  c.lineJoin = 'round';
  switch (shape) {
    case 'slime': {
      const s = Math.sin(t * 5) * 0.07;
      ell(c, 0, -13 * (1 - s), 20 * (1 + s), 14 * (1 - s), col);
      ell(c, -8, -19, 5, 3, 'rgba(255,255,255,.6)', null);
      eyes2(c, -6, 6, -13, 2.6);
      c.beginPath(); c.arc(0, -9, 3, 0.2, Math.PI - 0.2); c.strokeStyle = OLC; c.lineWidth = 1.5; c.stroke();
      ell(c, -11, -9, 3, 2, 'rgba(255,120,140,.5)', null); ell(c, 11, -9, 3, 2, 'rgba(255,120,140,.5)', null);
      break;
    }
    case 'bug': {
      const w = Math.sin(t * 14) * 2;
      for (let i = -1; i <= 1; i++) line(c, i * 7 - 2, -5, i * 9 - 2 + w * (i ? i : 1), 0);
      ell(c, -2, -12, 15, 11, col); line(c, -2, -23, -2, -1, OLC, 1.5);
      ell(c, -9, -14, 3, 3, '#2a1a14', null); ell(c, 5, -8, 2.5, 2.5, '#2a1a14', null); ell(c, 4, -17, 2.5, 2.5, '#2a1a14', null);
      ell(c, 12, -12, 7, 7, '#3a2a2a');
      ell(c, 14, -14, 2, 2, '#fff', null); ell(c, 14.5, -14, 1, 1, '#000', null);
      line(c, 14, -18, 18, -25, OLC, 1.5); line(c, 11, -18, 12, -26, OLC, 1.5);
      break;
    }
    case 'beast': {
      const lg = Math.sin(t * 10) * 3;
      rr(c, -13 + lg, -8, 6, 9, 3, dk); rr(c, 6 - lg, -8, 6, 9, 3, dk);
      ell(c, -20, -18, 5, 4, dk);
      ell(c, 0, -16, 19, 12, col);
      poly(c, [8, -29, 11, -39, 15, -30], col); poly(c, [17, -30, 22, -38, 23, -28], col);
      ell(c, 15, -22, 11, 10, col);
      ell(c, 23, -19, 5, 4, lt); ell(c, 26, -20, 1.6, 1.4, '#2a1a14', null);
      ell(c, 16, -24, 2, 2.6, '#2a1a14', null); ell(c, 16.6, -25, 0.8, 0.8, '#fff', null);
      break;
    }
    case 'shroom': {
      const b = Math.sin(t * 4) * 1.5;
      ell(c, 0, -10, 10, 10, '#fff3dc'); eyes2(c, -4, 4, -10, 2.2);
      c.beginPath(); c.ellipse(0, -18 + b, 22, 17, 0, Math.PI, 0); c.closePath(); paint(c, col);
      ell(c, -9, -27 + b, 4, 3, '#fff', null); ell(c, 6, -29 + b, 5, 3.5, '#fff', null); ell(c, 14, -22 + b, 3, 2, '#fff', null);
      break;
    }
    case 'bat': {
      const f = Math.sin(t * 16), y = -26 + Math.sin(t * 4) * 3;
      mirror(c, [6, y - 2, 27, y - 8 - f * 8, 23, y + 2 - f * 3, 15, y + 1, 10, y + 6], dk);
      mirror(c, [3, y - 8, 6, y - 17, 9, y - 6], col);
      ell(c, 0, y, 10, 10, col); eyes2(c, -4, 4, y - 1, 2.2);
      poly(c, [-3, y + 4, -2, y + 8, -1, y + 4], '#fff', null); poly(c, [1, y + 4, 2, y + 8, 3, y + 4], '#fff', null);
      break;
    }
    case 'cactus': {
      const b = Math.sin(t * 3) * 1.5;
      rr(c, -19, -28 + b, 8, 14, 4, col); rr(c, 11, -24 - b, 8, 14, 4, col);
      rr(c, -9, -40, 18, 40, 9, col);
      for (let i = 0; i < 5; i++) ell(c, Math.cos(i * 1.257 + t) * 5, -42 + Math.sin(i * 1.257 + t) * 5, 3, 3, '#ff7ab0', null);
      ell(c, 0, -42, 3, 3, '#ffe14a', null);
      eyes2(c, -4, 4, -24, 2.2);
      c.beginPath(); c.arc(0, -17, 3, 0.2, Math.PI - 0.2); c.strokeStyle = OLC; c.lineWidth = 1.5; c.stroke();
      break;
    }
    case 'skull': {
      const b = Math.sin(t * 5) * 1.5;
      line(c, 15, -2, 15, -46 + b, '#7a5a3a', 3); ell(c, 15, -48 + b, 5, 5, lt);
      poly(c, [-13, 0, -9, -27 + b, 9, -27 + b, 13, 0], col);
      rr(c, -6, -29 + b, 12, 6, 2, '#f4f0e4');
      ell(c, 0, -37 + b, 12, 11, '#f4f0e4');
      ell(c, -4.5, -37 + b, 3, 3.5, '#2a1a14', null); ell(c, 4.5, -37 + b, 3, 3.5, '#2a1a14', null);
      ell(c, -4.5, -37 + b, 1.2, 1.2, '#ff4040', null); ell(c, 4.5, -37 + b, 1.2, 1.2, '#ff4040', null);
      line(c, -2, -27 + b, -2, -24 + b, OLC, 1); line(c, 2, -27 + b, 2, -24 + b, OLC, 1);
      break;
    }
    case 'golem': {
      const b = Math.sin(t * 3) * 1.2;
      rr(c, -14, -10, 10, 10, 3, dk); rr(c, 4, -10, 10, 10, 3, dk);
      ell(c, -23, -22 + b, 7, 12, dk); ell(c, 23, -22 - b, 7, 12, dk);
      rr(c, -18, -38 + b, 36, 30, 8, col);
      rr(c, -10, -53 + b, 20, 17, 5, lt);
      ell(c, -4, -45 + b, 2.5, 2.5, '#ffe14a', null); ell(c, 4, -45 + b, 2.5, 2.5, '#ffe14a', null);
      ell(c, 0, -24 + b, 4, 5, '#6ff0ff');
      break;
    }
    case 'sprite': {
      const y = -22 + Math.sin(t * 4) * 3, fl = Math.sin(t * 12) * 2;
      c.beginPath(); c.moveTo(0, y - 24 - fl); c.bezierCurveTo(17, y - 8, 15, y + 12, 0, y + 12);
      c.bezierCurveTo(-15, y + 12, -17, y - 8, 0, y - 24 - fl); paint(c, col);
      ell(c, 0, y + 3, 7, 7, lt, null); eyes2(c, -4, 4, y + 1, 2.2);
      break;
    }
    case 'eye': {
      const y = -24 + Math.sin(t * 3) * 3, f = Math.sin(t * 10) * 4;
      mirror(c, [12, y - 4, 26, y - 12 - f, 24, y + 2], dk);
      ell(c, 0, y, 15, 15, '#fff'); ell(c, 3, y, 8, 8, col); ell(c, 4, y, 4, 4, '#1a1014', null); ell(c, 6, y - 3, 1.8, 1.8, '#fff', null);
      c.beginPath(); c.arc(0, y, 15, Math.PI * 1.1, Math.PI * 1.9); c.strokeStyle = dk; c.lineWidth = 4; c.stroke();
      break;
    }
    case 'ghost': {
      const y = -24 + Math.sin(t * 3) * 3;
      c.save(); c.globalAlpha *= 0.88;
      c.beginPath(); c.moveTo(-14, y + 14); c.lineTo(-14, y - 4); c.arc(0, y - 4, 14, Math.PI, 0); c.lineTo(14, y + 14);
      c.lineTo(9, y + 9); c.lineTo(5, y + 14); c.lineTo(0, y + 9); c.lineTo(-5, y + 14); c.lineTo(-9, y + 9); c.closePath(); paint(c, col);
      ell(c, -5, y - 4, 3, 4, '#2a1a14', null); ell(c, 5, y - 4, 3, 4, '#2a1a14', null); ell(c, 0, y + 4, 3, 3, '#2a1a14', null);
      c.restore();
      break;
    }
    case 'dragon': {
      const b = Math.sin(t * 4) * 1.5, f = Math.sin(t * 8);
      poly(c, [-14, -10, -30, -4, -34, -12, -18, -20], col);
      poly(c, [-4, -30 + b, -24, -48 - f * 6, -30, -30 - f * 3, -14, -24], dk);
      ell(c, -7, -2, 5, 3, dk); ell(c, 8, -2, 5, 3, dk);
      ell(c, 0, -16 + b, 16, 14, col); ell(c, 3, -13 + b, 9, 9, '#ffe9b8', null);
      poly(c, [8, -41 + b, 6, -51 + b, 12, -42 + b], '#fff3dc'); poly(c, [16, -42 + b, 20, -52 + b, 21, -41 + b], '#fff3dc');
      ell(c, 14, -32 + b, 12, 11, col); ell(c, 23, -29 + b, 6, 5, lt); ell(c, 26, -30 + b, 1.2, 1.2, '#2a1a14', null);
      ell(c, 15, -34 + b, 2.2, 3, '#2a1a14', null); ell(c, 15.7, -35 + b, 0.9, 0.9, '#fff', null);
      break;
    }
    case 'demon': {
      const b = Math.sin(t * 3) * 1.5;
      poly(c, [-19, 0, -15, -35 + b, 15, -35 + b, 19, 0], '#2a1a2a');
      rr(c, -11, -33 + b, 22, 29, 8, col);
      mirror(c, [5, -50 + b, 16, -64 + b, 10, -47 + b], '#f4e4c0');
      ell(c, 0, -43 + b, 13, 12, lt);
      poly(c, [-8, -46 + b, -2, -43 + b, -8, -42 + b], '#ffe14a', null); poly(c, [8, -46 + b, 2, -43 + b, 8, -42 + b], '#ffe14a', null);
      poly(c, [-5, -37 + b, -3, -34 + b, -1, -37 + b, 1, -34 + b, 3, -37 + b, 5, -34 + b, 5, -38 + b, -5, -38 + b], '#fff', null);
      ell(c, 0, -20 + b, 4, 4, '#ff4a6a');
      break;
    }
  }
}

/* Q 版小人：原点在脚底，默认朝右。style:{hair,cloth,hat,weapon} */
function drawChibi(c, st, t, moving, swing) {
  const bob = moving ? -Math.abs(Math.sin(t * 12)) * 2.5 : Math.sin(t * 2.5) * 0.8;
  const lg = moving ? Math.sin(t * 12) * 5 : 0;
  c.lineJoin = 'round';
  ell(c, -5 + lg, -3, 5, 3.5, '#6b4a36'); ell(c, 5 - lg, -3, 5, 3.5, '#6b4a36');
  rr(c, -9, -21 + bob, 18, 17, 7, st.cloth);
  c.fillStyle = shade(st.cloth.length === 7 ? st.cloth : '#888888', -45); c.fillRect(-8, -10 + bob, 16, 3);
  // 武器
  if (st.weapon) {
    c.save(); c.translate(9, -13 + bob);
    const sw = swing > 0 ? (1 - swing) : -1;
    if (st.weapon === 'warrior') {
      c.rotate(sw < 0 ? 0.5 : -0.9 + sw * 2.4);
      rr(c, -2, -28, 4, 24, 2, '#e8eef4'); rr(c, -6, -6, 12, 3, 1, '#f0c040'); rr(c, -1.5, -3, 3, 7, 1, '#7a5a3a');
    } else if (st.weapon === 'mage') {
      c.rotate(sw < 0 ? 0.15 : 0.5 - sw * 0.4);
      line(c, 0, 10, 0, -28, '#7a5a3a', 3);
      ell(c, 0, -31, swing > 0 ? 7 : 5, swing > 0 ? 7 : 5, '#c79aff'); ell(c, -1.5, -33, 1.5, 1.5, '#fff', null);
    } else {
      c.rotate(0.1);
      c.beginPath(); c.arc(-4, 0, 16, -1.2, 1.2); c.strokeStyle = '#7a5a3a'; c.lineWidth = 3; c.stroke();
      const px = swing > 0.5 ? -6 : 2;
      line(c, 1.8, -15, px, 0, '#eee', 1); line(c, px, 0, 1.8, 15, '#eee', 1);
    }
    c.restore();
    ell(c, 9, -13 + bob, 3.5, 3.5, '#ffe2c4');
  }
  // 头
  const hy = -33 + bob;
  ell(c, 0, hy, 15, 14, '#ffe2c4');
  c.beginPath(); c.ellipse(0, hy - 2, 15.6, 13.5, 0, Math.PI, 0);
  c.lineTo(11, hy + 3); c.lineTo(7, hy - 3); c.lineTo(2, hy + 3); c.lineTo(-3, hy - 3); c.lineTo(-8, hy + 2); c.lineTo(-12, hy - 2); c.lineTo(-15.6, hy + 6);
  c.closePath(); paint(c, st.hair);
  ell(c, 2, hy + 4, 2, 2.9, '#2a1a14', null); ell(c, 9, hy + 4, 2, 2.9, '#2a1a14', null);
  ell(c, 2.6, hy + 3, 0.8, 0.8, '#fff', null); ell(c, 9.6, hy + 3, 0.8, 0.8, '#fff', null);
  ell(c, -1, hy + 8, 3, 1.8, 'rgba(255,120,140,.55)', null); ell(c, 12, hy + 8, 2.4, 1.8, 'rgba(255,120,140,.55)', null);
  if (st.hat === 'wizard') {
    poly(c, [-12, hy - 9, 2, hy - 34, 13, hy - 9], st.cloth);
    ell(c, 0, hy - 9, 19, 5, st.cloth); ell(c, 2, hy - 34, 2.5, 2.5, '#ffe14a');
  } else if (st.hat === 'cap') {
    c.beginPath(); c.ellipse(0, hy - 7, 14, 9, 0, Math.PI, 0); c.closePath(); paint(c, st.cloth);
    rr(c, 4, hy - 9, 15, 4, 2, st.cloth);
    poly(c, [-6, hy - 14, -12, hy - 28, -2, hy - 16], '#ff6a5a');
  } else if (st.hat === 'band') {
    rr(c, -15, hy - 8, 30, 4, 2, '#ff4a4a');
    poly(c, [-14, hy - 6, -24, hy - 2, -22, hy - 9], '#ff4a4a');
  }
}

/* 场景物件：原点在底部中心 */
function drawObj(c, type, th, s, t, o) {
  c.lineJoin = 'round';
  const k = 0.9 + s * 0.3;
  switch (type) {
    case 'tree':
      rr(c, -5, -20, 10, 20, 3, '#8a5a3a');
      ell(c, -12 * k, -30, 14 * k, 13 * k, th.leaf); ell(c, 12 * k, -30, 14 * k, 13 * k, th.leaf); ell(c, 0, -44 * k, 17 * k, 16 * k, th.leaf);
      ell(c, -5, -48 * k, 5, 3.5, 'rgba(255,255,255,.25)', null);
      break;
    case 'pine':
      rr(c, -4, -12, 8, 12, 2, '#7a5238');
      poly(c, [-20, -10, 0, -36, 20, -10], th.leaf); poly(c, [-16, -26, 0, -50, 16, -26], th.leaf); poly(c, [-11, -42, 0, -62, 11, -42], th.leaf);
      poly(c, [-6, -53, 0, -62, 6, -53], '#fff', null); poly(c, [-8, -36, 0, -50, 8, -36, 3, -39, 0, -36, -3, -39], '#fff', null);
      break;
    case 'rock':
      ell(c, 0, -11, 20 * k, 13 * k, '#9a9aa4'); ell(c, -6, -16, 7, 4, 'rgba(255,255,255,.35)', null);
      break;
    case 'icerock':
      poly(c, [-18, 0, -12, -22, -2, -34 * k, 10, -24, 18, 0], '#bfe6ff'); line(c, -2, -34 * k, 0, 0, '#8cc8ee', 1.5);
      break;
    case 'bigshroom':
      rr(c, -6, -26, 12, 26, 5, '#fff3dc');
      c.beginPath(); c.ellipse(0, -24, 24 * k, 20 * k, 0, Math.PI, 0); c.closePath(); paint(c, s > 0.5 ? '#e86a6a' : '#c07ae0');
      ell(c, -10, -34, 4, 3, '#fff', null); ell(c, 8, -37, 5, 3.5, '#fff', null);
      break;
    case 'cactus':
      rr(c, -20, -30, 9, 16, 4, th.leaf); rr(c, 11, -36, 9, 18, 4, th.leaf); rr(c, -9, -50 * k, 18, 50 * k, 9, th.leaf);
      break;
    case 'crystal':
      poly(c, [-16, 0, -20, -22, -11, -34, -5, -8], '#8fe8ff'); poly(c, [6, 0, 12, -26, 20, -18, 18, 0], '#ffa0e8');
      poly(c, [-8, 0, -6, -40 * k, 2, -52 * k, 10, -38 * k, 8, 0], th.leaf); line(c, 2, -52 * k, 1, 0, 'rgba(255,255,255,.6)', 1.5);
      break;
    case 'deadtree':
      rr(c, -5, -34, 10, 34, 3, '#4a3a34');
      line(c, 0, -30, -16, -48, '#4a3a34', 4); line(c, 0, -24, 16, -44, '#4a3a34', 4); line(c, -9, -40, -12, -54, '#4a3a34', 3); line(c, 9, -36, 20, -34, '#4a3a34', 3);
      break;
    case 'pillar':
      rr(c, -13, -8, 26, 8, 2, '#c8c2d4'); rr(c, -9, -52, 18, 46, 2, '#e4def0'); rr(c, -13, -60, 26, 9, 2, '#c8c2d4');
      line(c, -3, -50, -3, -10, '#b8b0c8', 1.5); line(c, 3, -50, 3, -10, '#b8b0c8', 1.5);
      break;
    case 'cloud':
      ell(c, -12, -12, 13, 11, '#fff', '#c8d8f0'); ell(c, 12, -12, 13, 11, '#fff', '#c8d8f0'); ell(c, 0, -20, 15, 13, '#fff', '#c8d8f0');
      ell(c, 0, -10, 18, 9, '#fff', null);
      break;
    case 'torch': {
      rr(c, -3, -36, 6, 36, 2, '#5a4a44'); rr(c, -7, -40, 14, 6, 2, '#8a7a70');
      const f = Math.sin(t * 10 + s * 9) * 2;
      ell(c, 0, -48 - f * 0.5, 7, 10 + f, '#ff8a2a', '#c8501a'); ell(c, 0, -45, 3.5, 5, '#ffe14a', null);
      break;
    }
    case 'house':
      rr(c, -62, -70, 124, 70, 6, '#fff3dc');
      poly(c, [-74, -66, -50, -112, 50, -112, 74, -66], o.col);
      line(c, -74, -66, 74, -66, OLC, 3);
      rr(c, -12, -38, 24, 38, 4, '#a8703a'); ell(c, 6, -18, 2, 2, '#ffe14a', null);
      rr(c, -48, -48, 24, 22, 3, '#bfe6ff'); line(c, -36, -48, -36, -26, OLC, 1.5); line(c, -48, -37, -24, -37, OLC, 1.5);
      rr(c, 24, -48, 24, 22, 3, '#bfe6ff'); line(c, 36, -48, 36, -26, OLC, 1.5); line(c, 24, -37, 48, -37, OLC, 1.5);
      rr(c, -26, -106, 52, 22, 6, '#fff8e7');
      c.font = '15px serif'; c.textAlign = 'center'; c.fillStyle = OLC; c.fillText(o.sign, 0, -90);
      break;
  }
}
