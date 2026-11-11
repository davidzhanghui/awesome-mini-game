/* 疾风卡丁车 · Turbo Drift Kart — Three.js 3D 卡丁车竞速（单人 / 双人分屏、漂移、坡道、道具）
 * 文案见 strings.js；背景音乐为 music/ 下的 MP3 片段（署名见 music/CREDITS.md）。
 */
(function () {
'use strict';
/* ================= 基础 ================= */
const $ = s => document.querySelector(s);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const mod = (a, n) => ((a % n) + n) % n;
const wrap = a => mod(a + Math.PI, Math.PI * 2) - Math.PI;
const rnd = (a, b) => a + Math.random() * (b - a);
const T = KIT.T, A = window.AMG_AUDIO || { vol: .8, muted: false };
const FRAME = $('#frame');

const ROAD_HALF = 8, WALL = 15, LAPS = 3, GRAV = 32, BASE_MAX = 46, ACC = 34, TURN = 2.0;
const RACERS = [
  { icon: '🦊', color: 0xe8432e, head: 0xf08a3c, feat: 'fox',     spd: 1.00, acc: 1.00, trn: 1.00 },
  { icon: '🤖', color: 0x2f7fe8, head: 0xb8c4d0, feat: 'robot',   spd: 1.03, acc: 0.92, trn: 0.96 },
  { icon: '🐸', color: 0x3cb44b, head: 0x58c85a, feat: 'frog',    spd: 0.97, acc: 1.12, trn: 1.03 },
  { icon: '🐱', color: 0xf5a11f, head: 0x9aa0ad, feat: 'cat',     spd: 0.98, acc: 1.00, trn: 1.10 },
  { icon: '🧙', color: 0x8e44d6, head: 0xffd2a8, feat: 'wizard',  spd: 1.02, acc: 0.96, trn: 1.00 },
  { icon: '🐰', color: 0xff7eb6, head: 0xffffff, feat: 'bunny',   spd: 0.99, acc: 1.06, trn: 1.04 },
];
RACERS.forEach((r, i) => Object.defineProperty(r, 'name', { get: () => T('r' + i) }));   // 车手名随语言切换
const ITEMS = { turbo: { icon: '🔥' }, rocket: { icon: '🚀' }, oil: { icon: '🛢️' }, shield: { icon: '🛡️' }, emp: { icon: '⚡' } };
const ITEM_KEYS = Object.keys(ITEMS);

/* ================= 渲染器 / 场景 ================= */
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas: $('#c'), antialias: true }); }
catch (e) { const eb = $('#errbox'); eb.textContent = T('noWebgl'); eb.style.display = 'block'; throw e; }
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fd4ff);
scene.fog = new THREE.Fog(0xbfe3ff, 220, 1050);
scene.add(new THREE.HemisphereLight(0xffffff, 0x6b8f4e, 1.7));
const sun = new THREE.DirectionalLight(0xfff2d6, 2.0); sun.position.set(80, 160, 40); scene.add(sun);

function ctex(w, h, draw, rx = 1, ry = 1) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
const noise = (g, w, h, n, cols) => { for (let i = 0; i < n; i++) { g.fillStyle = cols[i % cols.length]; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); } };
const lam = (o) => new THREE.MeshLambertMaterial(o);

/* ================= 赛道 ================= */
const CP = [[0,0,0],[120,0,0],[220,10,0],[290,60,4],[300,140,10],[250,200,14],[170,190,10],[120,130,4],
            [50,120,0],[0,170,0],[-20,250,6],[-100,280,8],[-190,240,3],[-220,150,0],[-170,80,0],[-100,5,0]];
const curve = new THREE.CatmullRomCurve3(CP.map(p => new THREE.Vector3(p[0], p[2], p[1])), true, 'centripetal');
const LEN = curve.getLength();
const N = Math.round(LEN / 2), DS = LEN / N;
const TR = (() => {
  const pts = curve.getSpacedPoints(N); pts.pop();
  return pts.map((p, i) => {
    const a = pts[(i + N - 1) % N], b = pts[(i + 1) % N];
    let tx = b.x - a.x, tz = b.z - a.z; const l = Math.hypot(tx, tz); tx /= l; tz /= l;
    return { x: p.x, y: Math.max(0, p.y), z: p.z, tx, tz, nx: tz, nz: -tx, ang: Math.atan2(tx, tz) }; // n = 左侧法线
  });
})();
function nearestIdx(x, z) { let b = 0, bd = 1e9; TR.forEach((t, i) => { const q = (t.x - x) ** 2 + (t.z - z) ** 2; if (q < bd) { bd = q; b = i; } }); return b; }
function trackPoint(s, d, out) {
  s = mod(s, LEN); const f = s / DS, i = Math.floor(f) % N, t = f - Math.floor(f), a = TR[i], b = TR[(i + 1) % N];
  out.x = a.x + (b.x - a.x) * t + (a.nx + (b.nx - a.nx) * t) * d;
  out.z = a.z + (b.z - a.z) * t + (a.nz + (b.nz - a.nz) * t) * d;
  out.y = a.y + (b.y - a.y) * t; out.ang = a.ang; return out;
}
const tanAngle = s => TR[Math.floor(mod(s, LEN) / DS) % N].ang;

function strip(fa, fb, mat, vScale, i0 = 0, n = N) {
  const pos = [], uv = [], idx = [];
  for (let k = 0; k <= n; k++) {
    const t = TR[(i0 + k) % N], a = fa(t, k), b = fb(t, k);
    pos.push(t.x + t.nx * a[0], t.y + a[1], t.z + t.nz * a[0], t.x + t.nx * b[0], t.y + b[1], t.z + t.nz * b[0]);
    const v = k * DS / vScale; uv.push(0, v, 1, v);
    if (k < n) { const j = k * 2; idx.push(j, j + 1, j + 2, j + 1, j + 3, j + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat); scene.add(m); return m;
}

const roadTex = ctex(256, 256, (g, w, h) => {
  g.fillStyle = '#4b4f58'; g.fillRect(0, 0, w, h); noise(g, w, h, 1800, ['#555a64', '#42464e', '#5d626c']);
  g.fillStyle = '#f2f2f2'; g.fillRect(5, 0, 6, h); g.fillRect(w - 11, 0, 6, h);
  g.fillStyle = '#ffd84a'; g.fillRect(w / 2 - 3, 0, 6, h / 2);
});
const curbTex = ctex(16, 64, (g, w, h) => { g.fillStyle = '#e8432e'; g.fillRect(0, 0, w, h / 2); g.fillStyle = '#fff'; g.fillRect(0, h / 2, w, h / 2); });
const grassTex = ctex(128, 128, (g, w, h) => { g.fillStyle = '#5fae4a'; g.fillRect(0, 0, w, h); noise(g, w, h, 1500, ['#6cbc55', '#529c40', '#78c860']); });
const wallTex = ctex(64, 32, (g, w, h) => { g.fillStyle = '#f4f4f4'; g.fillRect(0, 0, w, h); g.fillStyle = '#2f7fe8'; g.fillRect(0, 0, w / 2, h); g.fillStyle = '#1b2333'; g.fillRect(0, 0, w, 5); });
const chevTex = ctex(128, 128, (g, w, h) => {
  g.fillStyle = '#ff8a1f'; g.fillRect(0, 0, w, h); g.strokeStyle = '#fff36b'; g.lineWidth = 16; g.lineJoin = 'miter';
  for (let y = 0; y < 3; y++) { const o = y * 64; g.beginPath(); g.moveTo(8, 110 - o + 64); g.lineTo(64, 60 - o + 64); g.lineTo(120, 110 - o + 64); g.stroke(); }
});
const DS2 = THREE.DoubleSide;
strip(() => [ROAD_HALF, 0], () => [-ROAD_HALF, 0], lam({ map: roadTex }), 16);
const curbM = lam({ map: curbTex }), grassM = lam({ map: grassTex }), wallM = lam({ map: wallTex, side: DS2 }), dirtM = lam({ color: 0x8a6a45, side: DS2 });
strip(() => [ROAD_HALF + 1.2, 0], () => [ROAD_HALF, 0], curbM, 5);
strip(() => [-ROAD_HALF, 0], () => [-ROAD_HALF - 1.2, 0], curbM, 5);
strip(() => [WALL, 0], () => [ROAD_HALF + 1.2, 0], grassM, 6);
strip(() => [-ROAD_HALF - 1.2, 0], () => [-WALL, 0], grassM, 6);
strip(() => [WALL, 1.1], () => [WALL, 0], wallM, 6);
strip(() => [-WALL, 0], () => [-WALL, 1.1], wallM, 6);
strip(t => [WALL + 5, -2.2 - t.y], () => [WALL, 0], dirtM, 6);
strip(() => [-WALL, 0], t => [-WALL - 5, -2.2 - t.y], dirtM, 6);

// 坡道（跳台）与加速带
const RAMPS = [], PADS = [];
const chevM = new THREE.MeshBasicMaterial({ map: chevTex, side: DS2 });
function addRamp(x, z, n = 6, h = 2.5) {
  const i0 = nearestIdx(x, z), top = (t, k) => h * k / n;
  strip((t, k) => [ROAD_HALF, top(t, k) + 0.02], (t, k) => [-ROAD_HALF, top(t, k) + 0.02], chevM, 4, i0, n);
  const side = lam({ color: 0x39404f, side: DS2 });
  strip((t, k) => [ROAD_HALF, top(t, k)], () => [ROAD_HALF, -0.2], side, 4, i0, n);
  strip((t, k) => [-ROAD_HALF, top(t, k)], () => [-ROAD_HALF, -0.2], side, 4, i0, n);
  const e = TR[(i0 + n) % N], g = new THREE.BufferGeometry(), L = [e.x + e.nx * ROAD_HALF, e.z + e.nz * ROAD_HALF], R = [e.x - e.nx * ROAD_HALF, e.z - e.nz * ROAD_HALF];
  g.setAttribute('position', new THREE.Float32BufferAttribute([L[0], e.y + h, L[1], R[0], e.y + h, R[1], L[0], e.y - .2, L[1], R[0], e.y - .2, R[1]], 3));
  g.setIndex([0, 1, 2, 1, 3, 2]); g.computeVertexNormals(); scene.add(new THREE.Mesh(g, side));
  RAMPS.push({ s0: i0 * DS, len: n * DS, h });
}
function addPad(x, z, d = 0) {
  const i0 = nearestIdx(x, z);
  strip(() => [d + 3, 0.05], () => [d - 3, 0.05], chevM, 4, i0, 5);
  PADS.push({ s0: i0 * DS, len: 5 * DS, d });
}
addRamp(100, 0); addRamp(-12, 212); addRamp(-135, 42);
addPad(296, 100, 3); addPad(145, 160, -3); addPad(-150, 262, 0);
function rampExtra(s, d) {
  if (Math.abs(d) > ROAD_HALF) return 0;
  for (const r of RAMPS) { const ds = mod(s - r.s0, LEN); if (ds < r.len) return r.h * ds / r.len; }
  return 0;
}

// 起点线与拱门
(() => {
  const t = TR[0];
  const chk = ctex(128, 32, (g, w, h) => { for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) { g.fillStyle = (x + y) % 2 ? '#111' : '#fff'; g.fillRect(x * 8, y * 8, 8, 8); } });
  const line = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, 3).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: chk, polygonOffset: true, polygonOffsetFactor: -2 }));
  line.position.set(t.x, t.y + 0.04, t.z); line.rotation.y = t.ang; scene.add(line);
  const arch = new THREE.Group(); arch.position.set(t.x, t.y, t.z); arch.rotation.y = t.ang; scene.add(arch);
  const post = lam({ color: 0xe8432e });
  for (const sx of [-11, 11]) { const p = new THREE.Mesh(new THREE.BoxGeometry(1, 8, 1), post); p.position.set(sx, 4, 0); arch.add(p); }
  const ban = ctex(512, 64, (g, w, h) => { g.fillStyle = '#1b2333'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffd84a'; g.font = 'italic 900 46px sans-serif'; g.textAlign = 'center'; g.fillText('★ TURBO DRIFT ★', w / 2, 48); });
  const beam = new THREE.Mesh(new THREE.BoxGeometry(23, 2, 0.8), new THREE.MeshBasicMaterial({ map: ban })); beam.position.y = 8; arch.add(beam);
})();

/* ================= 场景点缀：看台人群 / 农场 / 小溪 / 动物 ================= */
const GY = -1.6;                 // 地面高度
const RECTS = [], CLEAR = [];    // 不种树的区域：矩形 [x0,z0,x1,z1] / 圆 [x,z,r]
const anim = [];                 // 每帧回调 (dt, T)
const blocked = (x, z) => RECTS.some(r => x > r[0] && x < r[2] && z > r[1] && z < r[3]) || CLEAR.some(c => (c[0] - x) ** 2 + (c[1] - z) ** 2 < c[2] * c[2]);
const mesh = (geo, mat, x = 0, y = 0, z = 0, p = scene) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); p.add(m); return m; };
const bx = (w, h, d, mat, x, y, z, p) => mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z, p);
const PAL = [0xe8432e, 0x2f7fe8, 0xffd84a, 0x3cb44b, 0xff7eb6, 0x8e44d6, 0xf4f4f4, 0xf5a11f, 0x22c1c3];
const pick = a => a[Math.floor(Math.random() * a.length)];
const waterTex = ctex(64, 128, (g, w, h) => {
  g.fillStyle = '#3fa9e6'; g.fillRect(0, 0, w, h); g.lineWidth = 2;
  for (let i = 0; i < 22; i++) { g.strokeStyle = i % 3 ? 'rgba(255,255,255,.5)' : 'rgba(20,90,170,.45)'; const x = Math.random() * w, y = Math.random() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x + rnd(-3, 3), y + rnd(8, 22)); g.stroke(); }
});
anim.push(dt => { waterTex.offset.y += dt * .35; });

// ---------- 看台与人群 ----------
(() => {
  const crowd = [], stA = lam({ color: 0xd9dde6 }), stB = lam({ color: 0xaeb6c4 }), postM = lam({ color: 0x39404f });
  const V = new THREE.Vector3();
  function stand(i, side, len, tiers, x0, roof) {
    const t = TR[mod(i, N)], g = new THREE.Group(), base = GY - t.y;
    g.position.set(t.x, t.y, t.z); g.rotation.y = t.ang; scene.add(g); g.updateMatrixWorld();
    for (let k = 0; k < tiers; k++) {
      const top = .5 + k * .9, lx = side * (x0 + k * 1.8 + .9);
      bx(1.8, top - base, len, k % 2 ? stA : stB, lx, (top + base) / 2, 0, g);
      for (let z = -len / 2 + .6; z < len / 2 - .5; z += rnd(.95, 1.35)) {
        if (Math.random() < .1) continue;
        g.localToWorld(V.set(lx + rnd(-.3, .3), top, z));
        crowd.push({ x: V.x, y: V.y, z: V.z, ph: rnd(0, 6.28), sp: rnd(5, 9), amp: rnd(.12, .5), h: rnd(.82, 1.12), rot: t.ang + Math.PI / 2 + rnd(-.3, .3) });
      }
    }
    const depth = tiers * 1.8, cx = side * (x0 + depth / 2), topY = .5 + tiers * .9;
    bx(.4, topY + 1.6, len, postM, side * (x0 + depth + .2), (topY + 1.6) / 2, 0, g); // 背墙
    if (roof) {
      const rm = lam({ map: ctex(64, 16, (c, w, h) => { for (let s = 0; s < 4; s++) { c.fillStyle = s % 2 ? '#fff' : '#e8432e'; c.fillRect(s * 16, 0, 16, h); } }, len / 8, 1) });
      const r = bx(depth + 2.4, .3, len + 2, rm, cx - side * .6, topY + 4.2, 0, g); r.rotation.z = side * .1;
      for (const z of [-len / 2, 0, len / 2]) bx(.3, topY + 4.6 - base, .3, postM, side * (x0 + depth + .2), (topY + 4.6 + base) / 2, z, g);
      for (let z = -len / 2; z <= len / 2; z += len / 6) {         // 屋顶彩旗
        bx(.1, 2.6, .1, postM, cx, topY + 5.7, z, g);
        const f = bx(.06, .9, 1.6, new THREE.MeshBasicMaterial({ color: pick(PAL) }), 0, topY + 6.4, z + .8, g); f.position.x = cx;
        const ph = rnd(0, 6); anim.push((dt, T) => { f.rotation.y = Math.sin(T * 5 + ph) * .35; });
      }
      for (const z of [-len / 2 - 1.5, len / 2 + 1.5]) for (let b = 0; b < 5; b++) {   // 两端气球
        const bl = mesh(new THREE.SphereGeometry(.55, 10, 8), lam({ color: pick(PAL) }), side * (x0 + .6 + b * .5), 3.4 + (b % 3) * .7, z + rnd(-.5, .5), g);
        const y0 = bl.position.y, ph = rnd(0, 6); anim.push((dt, T) => { bl.position.y = y0 + Math.sin(T * 1.6 + ph) * .25; });
        bx(.04, y0 - .3, .04, postM, bl.position.x, y0 / 2 - .2, bl.position.z, g);
      }
    }
    for (let z = -len / 2; z <= len / 2; z += 8) { g.localToWorld(V.set(cx, 0, z)); CLEAR.push([V.x, V.z, depth / 2 + 5]); }
  }
  stand(18, 1, 60, 5, 18, true); stand(18, -1, 60, 5, 18, true);                 // 起点直道两侧主看台
  for (const [f, side] of [[.105, 1], [.17, -1], [.235, 1], [.31, -1], [.385, 1], [.45, -1], [.52, 1], [.6, -1], [.67, 1], [.74, -1], [.81, 1], [.9, -1]])
    stand(Math.round(f * N), side, 13, 2, 16.6, false);                          // 沿途小看台
  const n = crowd.length, D = new THREE.Object3D(), C = new THREE.Color();
  const legs = new THREE.InstancedMesh(new THREE.BoxGeometry(.42, .55, .28).translate(0, .275, 0), lam({ color: 0x2b3142 }), n);
  const torso = new THREE.InstancedMesh(new THREE.BoxGeometry(.6, .65, .36).translate(0, .87, 0), lam({ color: 0xffffff }), n);
  const arms = new THREE.InstancedMesh(new THREE.BoxGeometry(.95, .16, .16).translate(0, 1.3, 0), lam({ color: 0xffffff }), n);
  const head = new THREE.InstancedMesh(new THREE.SphereGeometry(.24, 8, 6).translate(0, 1.44, 0), lam({ color: 0xffffff }), n);
  crowd.forEach((c, i) => { C.setHex(pick(PAL)); torso.setColorAt(i, C); arms.setColorAt(i, C); C.setHex(pick([0xffd2a8, 0xf1c27d, 0xc68642, 0x8d5524])); head.setColorAt(i, C); });
  const parts = [legs, torso, arms, head]; parts.forEach(p => { p.frustumCulled = false; scene.add(p); });
  anim.push((dt, T) => {
    for (let i = 0; i < n; i++) {
      const c = crowd[i], j = Math.max(0, Math.sin(T * c.sp + c.ph)) * c.amp;
      D.position.set(c.x, c.y + j, c.z); D.rotation.set(0, c.rot, Math.sin(T * c.sp * .5 + c.ph) * .1); D.scale.setScalar(c.h); D.updateMatrix();
      for (const p of parts) p.setMatrixAt(i, D.matrix);
    }
    for (const p of parts) p.instanceMatrix.needsUpdate = true;
  });
})();

// ---------- 动物 ----------
const animals = [];
const ANIMAL = (() => {
  const L = (w, h) => new THREE.BoxGeometry(w, h, w).translate(0, -h / 2, 0);   // 腿：原点在髋部
  const cowM = lam({ map: ctex(64, 64, (g, w, h) => { g.fillStyle = '#f6f3ec'; g.fillRect(0, 0, w, h); g.fillStyle = '#2a2622'; for (let i = 0; i < 7; i++) { g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, rnd(6, 13), rnd(5, 10), rnd(0, 3), 0, 7); g.fill(); } }) });
  const M = { white: lam({ color: 0xf6f3ec }), dark: lam({ color: 0x2a2622 }), pink: lam({ color: 0xf2a6a0 }), wool: lam({ color: 0xfbfaf5, flatShading: true }), brown: lam({ color: 0xa66a3c }), tan: lam({ color: 0xd9b48a }),
    red: lam({ color: 0xd8322a }), yel: lam({ color: 0xf7b52c }), horn: lam({ color: 0xe9dcc0 }), duck: lam({ color: 0xfff6d6 }), green: lam({ color: 0x1f7a4d }) };
  const G = { cowB: new THREE.BoxGeometry(1.2, 1.1, 2.3), cowH: new THREE.BoxGeometry(.7, .7, .9), cowMz: new THREE.BoxGeometry(.56, .4, .3), cowL: L(.28, .9), horn: new THREE.ConeGeometry(.08, .32, 5),
    wool: new THREE.IcosahedronGeometry(.75, 1), shH: new THREE.BoxGeometry(.4, .45, .55), shL: L(.14, .55),
    deB: new THREE.BoxGeometry(.6, .7, 1.6), deN: new THREE.BoxGeometry(.3, .9, .32), deH: new THREE.BoxGeometry(.34, .36, .7), deL: L(.14, 1.05), ant: new THREE.ConeGeometry(.05, .7, 4), tail: new THREE.BoxGeometry(.16, .22, .12),
    chB: new THREE.SphereGeometry(.28, 8, 6), chH: new THREE.SphereGeometry(.15, 8, 6), beak: new THREE.ConeGeometry(.06, .18, 5).rotateX(Math.PI / 2), comb: new THREE.BoxGeometry(.05, .12, .16), chL: L(.05, .22) };
  const base = (legGeo, legMat, hipY, lx, lz) => {
    const g = new THREE.Group(), head = new THREE.Group(), legs = [];
    for (const [x, z] of lz ? [[lx, lz], [-lx, lz], [lx, -lz], [-lx, -lz]] : [[lx, 0], [-lx, 0]]) legs.push(mesh(legGeo, legMat, x, hipY, z, g));
    g.add(head); return { g, head, legs };
  };
  return {
    cow() {
      const a = base(G.cowL, M.white, .9, .4, .85), H = a.head; mesh(G.cowB, cowM, 0, 1.4, 0, a.g); H.position.set(0, 1.75, 1.15);
      mesh(G.cowH, cowM, 0, 0, .4, H); mesh(G.cowMz, M.pink, 0, -.14, .9, H); mesh(G.horn, M.horn, .3, .45, .2, H); mesh(G.horn, M.horn, -.3, .45, .2, H);
      mesh(G.cowMz, M.pink, 0, .78, -.5, a.g); mesh(G.tail, M.dark, 0, 1.3, -1.2, a.g).scale.set(.6, 3.2, 1);
      return { ...a, spd: 1.1, graze: .85 };
    },
    sheep() {
      const a = base(G.shL, M.dark, .55, .3, .5), H = a.head; mesh(G.wool, M.wool, 0, 1.0, 0, a.g).scale.set(.95, .85, 1.3); H.position.set(0, 1.1, .9);
      mesh(G.shH, M.dark, 0, 0, .2, H);
      return { ...a, spd: 1.3, graze: .8 };
    },
    deer() {
      const a = base(G.deL, M.brown, 1.05, .2, .6), H = a.head; mesh(G.deB, M.brown, 0, 1.4, 0, a.g); H.position.set(0, 1.55, .7);
      const nk = mesh(G.deN, M.brown, 0, .4, .1, H); nk.rotation.x = .25; mesh(G.deH, M.tan, 0, .85, .35, H);
      for (const s of [.14, -.14]) mesh(G.ant, M.horn, s, 1.35, .15, H).rotation.z = -s * 3;
      mesh(G.tail, M.white, 0, 1.6, -.84, a.g);
      return { ...a, spd: 2.2, graze: .75 };
    },
    chicken() {
      const a = base(G.chL, M.yel, .22, .1, 0), H = a.head; mesh(G.chB, M.white, 0, .42, 0, a.g).scale.set(.9, .9, 1.25); H.position.set(0, .62, .26);
      mesh(G.chH, M.white, 0, .06, 0, H); mesh(G.beak, M.yel, 0, .04, .2, H); mesh(G.comb, M.red, 0, .24, 0, H);
      return { ...a, spd: 1.6, graze: 1.1, peck: true };
    },
    duck(x, z, r) {
      const g = new THREE.Group(); mesh(G.chB, M.duck, 0, .12, 0, g).scale.set(1.1, .8, 1.6); mesh(G.chH, M.green, 0, .45, .34, g); mesh(G.beak, M.yel, 0, .42, .56, g);
      scene.add(g); const ph = rnd(0, 6.28), sp = rnd(.25, .5) * (Math.random() < .5 ? 1 : -1), rr = rnd(.3, .85) * r;
      anim.push((dt, T) => { const a = ph + T * sp; g.position.set(x + Math.cos(a) * rr, GY + .2 + Math.sin(T * 3 + ph) * .04, z + Math.sin(a) * rr * .8); g.rotation.y = -a + (sp > 0 ? 0 : Math.PI); });
    },
  };
})();
function spawn(kind, n, x0, z0, x1, z1, sc = 1) {
  for (let i = 0; i < n; i++) {
    const a = ANIMAL[kind](), s = sc * rnd(.85, 1.15); a.g.scale.setScalar(s); a.g.position.set(rnd(x0, x1), GY, rnd(z0, z1)); a.g.rotation.y = rnd(0, 6.28); scene.add(a.g);
    animals.push(Object.assign(a, { home: [x0, z0, x1, z1], t: rnd(0, 5), moving: false, tx: 0, tz: 0, ph: rnd(0, 6.28) }));
  }
}
anim.push((dt, T) => {
  for (const a of animals) {
    const p = a.g.position; a.t -= dt;
    if (a.t <= 0) { a.moving = !a.moving && Math.random() < .75; a.t = a.moving ? rnd(3, 7) : rnd(2, 7); a.tx = rnd(a.home[0], a.home[2]); a.tz = rnd(a.home[1], a.home[3]); }
    let sw = 0, hd = 0;
    if (a.moving) {
      const dx = a.tx - p.x, dz = a.tz - p.z, d = Math.hypot(dx, dz);
      if (d < .4) a.moving = false;
      else { a.g.rotation.y += wrap(Math.atan2(dx, dz) - a.g.rotation.y) * Math.min(1, 3 * dt); const v = a.spd * dt; p.x += Math.sin(a.g.rotation.y) * v; p.z += Math.cos(a.g.rotation.y) * v; sw = Math.sin(T * a.spd * 6 + a.ph) * .5; }
    } else hd = a.peck ? a.graze * Math.max(0, Math.sin(T * 7 + a.ph)) : (Math.sin(T * .4 + a.ph) > -.3 ? a.graze + Math.sin(T * 5 + a.ph) * .06 : 0);
    a.head.rotation.x += (hd - a.head.rotation.x) * Math.min(1, 6 * dt);
    a.legs.forEach((l, i) => { l.rotation.x = (i === 0 || i === 3 ? sw : -sw); });
  }
});

// ---------- 农场（右侧内场） ----------
(() => {
  RECTS.push([36, 21, 224, 102]);
  const F = new THREE.Group(); F.position.y = GY; scene.add(F);
  const red = lam({ color: 0xb8322a }), cream = lam({ color: 0xf4efe6 }), roofM = lam({ color: 0x4a4f5c }), wood = lam({ color: 0x9a7448 }), dark = lam({ color: 0x2b2f3a }), tile = lam({ color: 0xa5482f });
  const gable = (w, h, d, mat, x, y, z) => { const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, h); s.closePath(); return mesh(new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false }).translate(0, 0, -d / 2), mat, x, y, z, F); };
  // 谷仓 + 粮仓
  bx(14, 7, 10, red, 150, 3.5, 84, F); gable(14, 4, 10, red, 150, 7, 84); gable(15.4, 4.5, 11, roofM, 150, 7.15, 84).scale.set(1, 1, 1);
  bx(4.6, 5, .3, cream, 150, 2.5, 78.9, F); bx(3.8, 4.4, .36, dark, 150, 2.2, 78.9, F); bx(2, 1.6, .3, cream, 150, 8.3, 78.4, F);
  mesh(new THREE.CylinderGeometry(2.6, 2.6, 12, 14), lam({ color: 0xd5d9df }), 162.5, 6, 87, F); mesh(new THREE.SphereGeometry(2.6, 14, 8, 0, 6.3, 0, Math.PI / 2), red, 162.5, 12, 87, F);
  // 农舍
  bx(9, 5, 7, cream, 78, 2.5, 86, F); gable(10.4, 3.4, 8.2, tile, 78, 5, 86); bx(1.5, 2.6, .2, wood, 78, 1.3, 82.45, F); bx(1.2, 3, 1.2, red, 81, 7.4, 87, F);
  for (const x of [75, 81]) bx(1.5, 1.4, .2, new THREE.MeshBasicMaterial({ color: 0x8fd0ff }), x, 3, 82.45, F);
  // 风车
  mesh(new THREE.CylinderGeometry(1.3, 2.6, 14, 8), cream, 196, 7, 86, F); mesh(new THREE.ConeGeometry(1.9, 2.4, 8), tile, 196, 15.2, 86, F);
  const blades = new THREE.Group(); blades.position.set(196, 13.4, 83.9); F.add(blades);
  for (let i = 0; i < 4; i++) { const b = new THREE.Group(); b.rotation.z = i * Math.PI / 2; blades.add(b); bx(.25, 7.5, .16, wood, 0, 3.75, 0, b); bx(1.5, 5.6, .08, cream, .8, 4.5, 0, b); }
  anim.push(dt => { blades.rotation.z += dt * .9; });
  // 麦田 + 稻草人 + 圆草垛
  const wheat = lam({ map: ctex(64, 64, (g, w, h) => { g.fillStyle = '#e2b53a'; g.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 8) { g.fillStyle = '#c9982a'; g.fillRect(x, 0, 3, h); } noise(g, w, h, 500, ['#f1cc5a', '#b88a22']); }, 12, 6) });
  bx(46, 1, 26, wheat, 68, .5, 44, F);
  const sc = new THREE.Group(); sc.position.set(68, 1, 44); sc.rotation.y = Math.PI; F.add(sc);
  bx(.2, 3.2, .2, wood, 0, 1.6, 0, sc); bx(2.6, .18, .18, wood, 0, 2.5, 0, sc); bx(1.1, 1.2, .5, lam({ color: 0x2f7fe8 }), 0, 2.2, 0, sc);
  mesh(new THREE.SphereGeometry(.42, 10, 8), lam({ color: 0xf1cc8a }), 0, 3.3, 0, sc); mesh(new THREE.ConeGeometry(.7, .7, 10), wood, 0, 3.9, 0, sc);
  anim.push((dt, T) => { sc.rotation.z = Math.sin(T * 1.3) * .05; });
  const hay = lam({ color: 0xdcb04a }), bale = new THREE.CylinderGeometry(1.1, 1.1, 1.6, 12).rotateZ(Math.PI / 2);
  for (const [x, z, y] of [[133, 68, 1.1], [136, 68.4, 1.1], [134.5, 68.2, 3], [128, 72, 1.1], [96, 62, 1.1], [60, 62, 1.1], [44, 60, 1.1]]) mesh(bale, hay, x, y, z, F).rotation.y = rnd(-.3, .3);
  // 菜地：卷心菜与南瓜
  bx(32, .2, 22, lam({ color: 0x6b4a2e }), 112, .1, 84, F);
  const veg = [], m4 = new THREE.Matrix4();
  for (let x = 98; x <= 126; x += 2) for (let z = 75; z <= 93; z += 3) veg.push([x, z]);
  const cab = new THREE.InstancedMesh(new THREE.SphereGeometry(.55, 7, 5), lam({ color: 0x5fbf4a, flatShading: true }), veg.length);
  const pum = new THREE.InstancedMesh(new THREE.SphereGeometry(.6, 8, 6), lam({ color: 0xf08a1f }), veg.length);
  let nc = 0, np = 0;
  for (const [x, z] of veg) { const p = z > 88, s = rnd(.7, 1.1); m4.makeScale(s, s * (p ? .75 : .8), s).setPosition(x, GY + .45, z); p ? pum.setMatrixAt(np++, m4) : cab.setMatrixAt(nc++, m4); }
  cab.count = nc; pum.count = np; scene.add(cab, pum);
  // 围栏牧场
  const posts = [], rail = lam({ color: 0xe9e2d2 });
  const fence = (x0, z0, x1, z1) => {
    for (const [ax, az, bxx, bz] of [[x0, z0, x1, z0], [x1, z0, x1, z1], [x1, z1, x0, z1], [x0, z1, x0, z0]]) {
      const len = Math.hypot(bxx - ax, bz - az), horiz = az === bz;
      for (const y of [.55, 1.1]) bx(horiz ? len : .12, .16, horiz ? .12 : len, rail, (ax + bxx) / 2, y, (az + bz) / 2, F);
      for (let d = 0; d < len; d += 3) posts.push([ax + (bxx - ax) * d / len, az + (bz - az) * d / len]);
    }
  };
  fence(98, 29, 142, 58); fence(150, 31, 205, 62); fence(140, 63, 168, 73);
  const pm = new THREE.InstancedMesh(new THREE.BoxGeometry(.3, 1.5, .3), rail, posts.length);
  posts.forEach(([x, z], i) => { m4.makeTranslation(x, GY + .75, z); pm.setMatrixAt(i, m4); }); scene.add(pm);
  bx(3, .7, 1, wood, 180, .35, 60, F); bx(2.6, .12, .7, new THREE.MeshBasicMaterial({ map: waterTex }), 180, .72, 60, F);   // 水槽
  // 拖拉机
  const tr = new THREE.Group(); tr.position.set(178, 0, 70); tr.rotation.y = -1.1; F.add(tr);
  const grn = lam({ color: 0x2e9b4f }), wheelG = (r, w) => new THREE.CylinderGeometry(r, r, w, 14).rotateZ(Math.PI / 2);
  bx(1.6, 1.1, 3.2, grn, 0, 1.5, .6, tr); bx(1.7, 1.7, 1.6, grn, 0, 2.6, -.8, tr); bx(1.5, .9, 1.4, new THREE.MeshBasicMaterial({ color: 0xbfe6ff }), 0, 2.9, -.8, tr); bx(.18, 1.3, .18, dark, .5, 2.6, 1.6, tr);
  for (const s of [1.05, -1.05]) { mesh(wheelG(1.25, .6), dark, s, 1.25, -.9, tr); mesh(wheelG(.5, .65), new THREE.MeshLambertMaterial({ color: 0xf7b52c }), s, 1.25, -.9, tr); mesh(wheelG(.7, .45), dark, s * .92, .7, 1.7, tr); }
  spawn('sheep', 9, 101, 32, 139, 55); spawn('cow', 8, 153, 34, 202, 59); spawn('chicken', 9, 142, 65, 166, 71);
})();

// ---------- 小溪与池塘（左侧内场） ----------
(() => {
  const PTS = [[-125, 240], [-159, 227], [-175, 208], [-184, 190], [-189, 170], [-186, 152], [-172, 134], [-150, 128], [-135, 112]], POND = [-120, 92, 14];   // 前半段贴着左侧弯道内沿流淌
  const P = new THREE.CatmullRomCurve3(PTS.concat([[POND[0], POND[1]]]).map(([x, z]) => new THREE.Vector3(x, 0, z))).getSpacedPoints(90);
  const ribbon = (hw, y, mat) => {
    const pos = [], uv = [], idx = [];
    P.forEach((p, k) => {
      const a = P[Math.max(0, k - 1)], b = P[Math.min(P.length - 1, k + 1)]; let tx = b.x - a.x, tz = b.z - a.z; const l = Math.hypot(tx, tz); tx /= l; tz /= l;
      const w = hw * (1 + .25 * Math.sin(k * .5));
      pos.push(p.x + tz * w, y, p.z - tx * w, p.x - tz * w, y, p.z + tx * w); uv.push(0, k / 4, 1, k / 4);
      if (k < P.length - 1) { const j = k * 2; idx.push(j, j + 2, j + 1, j + 1, j + 2, j + 3); }
    });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    return mesh(g, mat);
  };
  const sand = new THREE.MeshLambertMaterial({ color: 0xcbb98a, side: DS2, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const water = new THREE.MeshBasicMaterial({ map: waterTex, side: DS2, transparent: true, opacity: .93, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  ribbon(4.2, GY + .06, sand); ribbon(2.8, GY + .12, water);
  mesh(new THREE.CircleGeometry(POND[2] + 1.6, 30).rotateX(-Math.PI / 2), sand, POND[0], GY + .06, POND[1]).scale.z = .8;
  mesh(new THREE.CircleGeometry(POND[2], 30).rotateX(-Math.PI / 2), water, POND[0], GY + .12, POND[1]).scale.z = .8;
  P.forEach(p => CLEAR.push([p.x, p.z, 9])); CLEAR.push([POND[0], POND[1], POND[2] + 8]);
  // 岸边石头、芦苇、睡莲
  const rocks = [], reeds = [], m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s3 = new THREE.Vector3();
  P.forEach((p, k) => { if (k % 3 === 0 && k < 84) rocks.push([p.x + rnd(3.4, 5) * (k % 2 ? 1 : -1), p.z + rnd(-2, 2), rnd(.5, 1.3)]); if (k % 4 === 1) for (let i = 0; i < 4; i++) reeds.push([p.x + rnd(3, 4.6) * (k % 8 < 4 ? 1 : -1) + rnd(-.6, .6), p.z + rnd(-1, 1)]); });
  for (let i = 0; i < 26; i++) { const a = rnd(0, 6.28), r = POND[2] + rnd(.3, 1.6); (i % 3 ? reeds : rocks).push([POND[0] + Math.cos(a) * r, POND[1] + Math.sin(a) * r * .8, rnd(.5, 1.2)]); }
  rocks.push([-123, 242, 3.2], [-119, 239, 2.4], [-126, 244.5, 2]);             // 溪流源头的石堆
  const rk = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), lam({ color: 0x8b93a1, flatShading: true }), rocks.length);
  rocks.forEach(([x, z, s], i) => { m4.compose(v.set(x, GY + s * .3, z), q.setFromEuler(e.set(rnd(0, 3), rnd(0, 3), 0)), s3.set(s, s * .7, s)); rk.setMatrixAt(i, m4); });
  const rd = new THREE.InstancedMesh(new THREE.ConeGeometry(.12, 2.4, 4), lam({ color: 0x3f8f3a }), reeds.length);
  reeds.forEach(([x, z], i) => { const s = rnd(.7, 1.3); m4.compose(v.set(x, GY + 1.2 * s, z), q.setFromEuler(e.set(rnd(-.15, .15), 0, rnd(-.15, .15))), s3.set(1, s, 1)); rd.setMatrixAt(i, m4); });
  scene.add(rk, rd);
  const pad = new THREE.CircleGeometry(.8, 9, .4, 5.6).rotateX(-Math.PI / 2), padM = new THREE.MeshLambertMaterial({ color: 0x2f9d4c, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 });
  for (let i = 0; i < 9; i++) { const a = rnd(0, 6.28), r = rnd(3, 12); mesh(pad, padM, POND[0] + Math.cos(a) * r, GY + .16, POND[1] + Math.sin(a) * r * .8).rotation.y = a; }
  // 小木桥
  const bp = P[40], bq = P[41], br = new THREE.Group(), wood = lam({ color: 0x9a6a3c });
  br.position.set(bp.x, GY, bp.z); br.rotation.y = Math.atan2(bq.x - bp.x, bq.z - bp.z) + Math.PI / 2; scene.add(br);
  for (let i = -4; i <= 4; i++) bx(2.4, .18, 1.05, wood, 0, 1.15 - i * i * .055, i * 1.1, br).rotation.x = i * .1;
  for (const s of [1.1, -1.1]) { for (const z of [-4, 0, 4]) bx(.16, 1.2, .16, wood, s, 1.5 - z * z * .05, z, br); bx(.12, .12, 8.4, wood, s, 2, 0, br); }
  for (let i = 0; i < 6; i++) ANIMAL.duck(POND[0], POND[1], POND[2] - 2);
  spawn('deer', 3, -170, 150, -145, 188); spawn('deer', 3, -140, 135, -112, 165); spawn('sheep', 4, -100, 80, -84, 104);
})();

// ---------- 天空：飞鸟与热气球 ----------
(() => {
  const wing = new THREE.PlaneGeometry(1.5, .55).rotateX(-Math.PI / 2).translate(.75, 0, 0), bm = new THREE.MeshBasicMaterial({ color: 0x2b2f3a, side: DS2 }), bodyG = new THREE.ConeGeometry(.22, 1.2, 5).rotateX(Math.PI / 2);
  for (const [cx, cz, R, y, sp] of [[60, 60, 90, 42, .22], [-110, 160, 80, 36, -.27], [200, 150, 70, 50, .3]]) {
    for (let i = 0; i < 7; i++) {
      const b = new THREE.Group(), wl = mesh(wing, bm, 0, 0, 0, b), wr = mesh(wing, bm, 0, 0, 0, b); wr.scale.x = -1; mesh(bodyG, bm, 0, 0, 0, b); b.scale.setScalar(1.6); scene.add(b);
      const row = Math.ceil(i / 2), sd = i % 2 ? 1 : -1, ph = rnd(0, 6);
      anim.push((dt, T) => {
        const a = T * sp - row * .06 * Math.sign(sp), r = R + sd * row * 4;
        b.position.set(cx + Math.cos(a) * r, y + Math.sin(T * .7 + ph) * 1.5, cz + Math.sin(a) * r); b.rotation.y = -a + (sp > 0 ? 0 : Math.PI);
        const f = Math.sin(T * 9 + ph) * .7; wl.rotation.z = f; wr.rotation.z = -f;
      });
    }
  }
  const stripe = c => lam({ map: ctex(128, 32, (g, w, h) => { for (let s = 0; s < 8; s++) { g.fillStyle = s % 2 ? '#fff' : c; g.fillRect(s * 16, 0, 16, h); } }) });
  [[330, 30, 75, '#e8432e'], [-260, 60, 95, '#2f7fe8'], [60, 380, 85, '#f5a11f'], [-60, -150, 110, '#8e44d6']].forEach(([x, z, y, c], i) => {
    const b = new THREE.Group(); mesh(new THREE.SphereGeometry(11, 16, 12), stripe(c), 0, 0, 0, b).scale.y = 1.15; mesh(new THREE.ConeGeometry(7.4, 9, 16), stripe(c), 0, -11.5, 0, b).rotation.x = Math.PI;
    bx(3, 2.6, 3, lam({ color: 0x8a6a45 }), 0, -19, 0, b); scene.add(b);
    anim.push((dt, T) => { b.position.set(x + Math.sin(T * .05 + i * 2) * 30, y + Math.sin(T * .3 + i) * 4, z + Math.cos(T * .04 + i) * 30); b.rotation.y = T * .05; });
  });
})();

// 环境：地面、树、山、云
(() => {
  const gt = ctex(128, 128, (g, w, h) => { g.fillStyle = '#4e9a3d'; g.fillRect(0, 0, w, h); noise(g, w, h, 1500, ['#58a646', '#458c36', '#62b04e']); }, 300, 300);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000).rotateX(-Math.PI / 2), lam({ map: gt })); ground.position.set(40, -1.6, 140); scene.add(ground);
  const spots = [];
  for (let tries = 0; tries < 3500 && spots.length < 280; tries++) {
    const x = rnd(-330, 400), z = rnd(-110, 390); let ok = true;
    for (let i = 0; i < N; i += 3) { const t = TR[i]; if ((t.x - x) ** 2 + (t.z - z) ** 2 < 24 * 24) { ok = false; break; } }
    if (ok && !blocked(x, z)) spots.push([x, z, rnd(0.8, 1.7)]);
  }
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.5, 0.7, 4, 6), lam({ color: 0x7a5230 }), spots.length);
  const crown = new THREE.InstancedMesh(new THREE.ConeGeometry(3.2, 8, 7), lam({ color: 0x2f8f46 }), spots.length);
  const m = new THREE.Matrix4();
  spots.forEach(([x, z, s], i) => {
    m.makeScale(s, s, s).setPosition(x, -1.6 + 2 * s, z); trunk.setMatrixAt(i, m);
    m.makeScale(s, s, s).setPosition(x, -1.6 + 7.5 * s, z); crown.setMatrixAt(i, m);
  });
  scene.add(trunk, crown);
  const mm = lam({ color: 0x7d9bb5 }), sm = lam({ color: 0xf4f8ff });
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2 + rnd(-.1, .1), r = rnd(600, 760), h = rnd(130, 240), w = rnd(140, 220);
    const mt = new THREE.Mesh(new THREE.ConeGeometry(w, h, 6), mm); mt.position.set(40 + Math.cos(a) * r, h / 2 - 2, 140 + Math.sin(a) * r); mt.rotation.y = rnd(0, 3); scene.add(mt);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(w * .3, h * .3, 6), sm); cap.position.copy(mt.position); cap.position.y = h * .85 - 1; cap.rotation.y = mt.rotation.y; scene.add(cap);
  }
  const cm = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, transparent: true, opacity: .9 }), cg = new THREE.SphereGeometry(1, 8, 6);
  for (let i = 0; i < 22; i++) {
    const cx = rnd(-700, 780), cz = rnd(-560, 840), cy = rnd(150, 240);
    for (let j = 0; j < 3; j++) { const c = new THREE.Mesh(cg, cm); c.scale.set(rnd(25, 45), rnd(8, 13), rnd(16, 26)); c.position.set(cx + j * 28, cy + rnd(-4, 4), cz + rnd(-10, 10)); scene.add(c); }
  }
})();

/* ================= 道具箱 ================= */
const boxes = [];
(() => {
  const tex = ctex(64, 64, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#ff5e7e'); gr.addColorStop(.5, '#ffd84a'); gr.addColorStop(1, '#4fc3ff');
    g.fillStyle = gr; g.fillRect(0, 0, w, h); g.strokeStyle = '#fff'; g.lineWidth = 5; g.strokeRect(3, 3, w - 6, h - 6);
    g.fillStyle = '#fff'; g.font = '900 46px sans-serif'; g.textAlign = 'center'; g.fillText('?', w / 2, 49);
  });
  const geo = new THREE.BoxGeometry(1.7, 1.7, 1.7), mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: .88 });
  const P = { x: 0, y: 0, z: 0 };
  for (const [x, z] of [[45, 0], [296, 120], [165, 185], [25, 145], [-120, 275], [-205, 115], [-55, 2]]) {
    const s = nearestIdx(x, z) * DS;
    for (const d of [-5.4, -1.8, 1.8, 5.4]) {
      trackPoint(s, d, P); const m = new THREE.Mesh(geo, mat); m.position.set(P.x, P.y + 1.5, P.z); scene.add(m);
      boxes.push({ x: P.x, y: P.y + 1.5, z: P.z, mesh: m, t: 0 });
    }
  }
})();

/* ================= 卡丁车模型 ================= */
function makeKart(r) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body); g.rotation.order = 'YXZ';
  const col = lam({ color: r.color }), dark = lam({ color: 0x232833 }), gray = lam({ color: 0x8b93a1 }), white = lam({ color: 0xf4f4f4 }), head = lam({ color: r.head });
  const add = (geo, mat, x, y, z, p = body) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); p.add(m); return m; };
  const box = (w, h, d, mat, x, y, z) => add(new THREE.BoxGeometry(w, h, d), mat, x, y, z);
  box(1.5, .35, 2.5, col, 0, .5, 0); box(1.0, .3, .8, col, 0, .55, 1.4); box(1.8, .2, .28, dark, 0, .38, 1.85);
  box(.36, .3, 1.2, white, .92, .5, -.1); box(.36, .3, 1.2, white, -.92, .5, -.1);
  box(.9, .75, .2, dark, 0, 1.0, -.8); box(.9, .45, .5, gray, 0, .8, -1.15);
  box(1.8, .08, .5, col, 0, 1.45, -1.3); box(.08, .5, .08, dark, .6, 1.2, -1.3); box(.08, .5, .08, dark, -.6, 1.2, -1.3);
  box(.06, .5, .06, dark, 0, .9, .55).rotation.x = -.5; add(new THREE.TorusGeometry(.2, .05, 6, 12), dark, 0, 1.12, .42).rotation.x = -.5;
  const wheels = [], wg = new THREE.CylinderGeometry(.42, .42, .38, 12).rotateZ(Math.PI / 2), hub = new THREE.CylinderGeometry(.2, .2, .4, 8).rotateZ(Math.PI / 2);
  for (const [x, z] of [[.98, 1.05], [-.98, 1.05], [1.02, -.95], [-1.02, -.95]]) {
    const piv = new THREE.Group(); piv.position.set(x, .42, z); body.add(piv);
    const w = add(wg, dark, 0, 0, 0, piv); add(hub, white, 0, 0, 0, w); wheels.push({ piv, w, front: z > 0 });
  }
  // 车手
  add(new THREE.CylinderGeometry(.3, .38, .65, 10), col, 0, 1.0, -.3);
  const H = new THREE.Group(); H.position.set(0, 1.68, -.3); body.add(H);
  if (r.feat === 'robot') add(new THREE.BoxGeometry(.72, .64, .66), head, 0, 0, 0, H); else add(new THREE.SphereGeometry(.42, 14, 10), head, 0, 0, 0, H);
  const blk = new THREE.MeshBasicMaterial({ color: 0x111111 });
  add(new THREE.SphereGeometry(.07, 6, 6), blk, .16, .06, .38, H); add(new THREE.SphereGeometry(.07, 6, 6), blk, -.16, .06, .38, H);
  const cone = (rad, h, mat, x, y, z) => add(new THREE.ConeGeometry(rad, h, 8), mat, x, y, z, H);
  if (r.feat === 'fox') { cone(.17, .42, head, .25, .44, 0); cone(.17, .42, head, -.25, .44, 0); cone(.12, .2, white, 0, 0, .44).rotation.x = Math.PI / 2; }
  if (r.feat === 'cat') { cone(.14, .28, head, .26, .4, 0); cone(.14, .28, head, -.26, .4, 0); }
  if (r.feat === 'robot') { add(new THREE.CylinderGeometry(.03, .03, .4, 6), dark, 0, .5, 0, H); add(new THREE.SphereGeometry(.1, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff4040 }), 0, .74, 0, H); }
  if (r.feat === 'frog') for (const sx of [.22, -.22]) { add(new THREE.SphereGeometry(.18, 10, 8), white, sx, .38, .12, H); add(new THREE.SphereGeometry(.08, 6, 6), blk, sx, .4, .27, H); }
  if (r.feat === 'wizard') { cone(.4, .85, col, 0, .72, 0); add(new THREE.CylinderGeometry(.62, .62, .06, 14), col, 0, .3, 0, H); }
  if (r.feat === 'bunny') for (const sx of [.17, -.17]) add(new THREE.CapsuleGeometry(.09, .5, 4, 8), head, sx, .68, 0, H).rotation.z = -sx;
  // 特效部件
  const sparks = [.95, -.95].map(x => add(new THREE.OctahedronGeometry(.28), new THREE.MeshBasicMaterial({ color: 0xffffff }), x, .15, -1.35));
  const flames = [.32, -.32].map(x => add(new THREE.ConeGeometry(.24, 1.3, 8).rotateX(-Math.PI / 2).translate(0, 0, -.65), new THREE.MeshBasicMaterial({ color: 0xffa726 }), x, .8, -1.4));
  const shield = add(new THREE.SphereGeometry(2.1, 16, 12), new THREE.MeshBasicMaterial({ color: 0x4fd8ff, transparent: true, opacity: .28, depthWrite: false }), 0, .9, 0, g);
  const zap = add(new THREE.OctahedronGeometry(.4), new THREE.MeshBasicMaterial({ color: 0xfff36b }), 0, 3.0, 0, g);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(1.5, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: .35, depthWrite: false }));
  scene.add(g, shadow);
  return { g, body, wheels, sparks, flames, shield, zap, shadow };
}
const MODELS = RACERS.map(makeKart);

/* ================= 音频 ================= */
let AC = null, master = null, engines = [];
function audioInit() { if (AC) return; try { AC = new (window.AudioContext || window.webkitAudioContext)(); master = AC.createGain(); master.gain.value = .5; master.connect(AC.destination); } catch (e) { AC = null; } }
function sfx(f1, f2, dur, type = 'square', vol = .12) {
  if (!AC || game.demo || A.muted) return;
  const o = AC.createOscillator(), g = AC.createGain(), t = AC.currentTime;
  o.type = type; o.frequency.setValueAtTime(f1, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
  o.connect(g).connect(master); o.start(t); o.stop(t + dur);
}
function engineSetup(n) {
  engines.forEach(e => { try { e.o.stop(); } catch (_) {} }); engines = [];
  if (!AC) return;
  for (let i = 0; i < n; i++) {
    const o = AC.createOscillator(), f = AC.createBiquadFilter(), g = AC.createGain();
    o.type = 'sawtooth'; f.type = 'lowpass'; f.frequency.value = 500; g.gain.value = 0;
    o.connect(f).connect(g).connect(master); o.start(); engines.push({ o, g });
  }
}

/* 背景音乐：菜单单曲循环，比赛三首精华片段随机起播、交叉淡入淡出轮播（素材署名见 music/CREDITS.md） */
const BGM = { menu: ['music/menu.mp3'], race: ['music/race1.mp3', 'music/race2.mp3', 'music/race3.mp3'] };
const music = { kind: '', list: [], idx: 0, cur: null, all: [], vol: .34, rate: 1 };
function musicStart(src) {
  const a = new Audio(src); a.preload = 'auto'; a.volume = 0; a.g = 0; a.to = 1; a.playbackRate = music.rate;
  a.onended = () => { if (a === music.cur) musicNext(); };
  if (music.cur) music.cur.to = 0;
  music.cur = a; music.all.push(a);
  a.play().catch(() => { a.blocked = true; });           // 浏览器自动播放限制：等首次点击/按键再播
}
function musicNext() { music.idx = (music.idx + 1) % music.list.length; musicStart(music.list[music.idx]); }
function musicRate(r) { music.rate = r; if (music.cur) music.cur.playbackRate = r; }
function musicPlay(kind) {
  if (music.kind === kind && music.cur) return;
  music.kind = kind; music.list = BGM[kind]; music.idx = Math.floor(Math.random() * music.list.length);
  musicStart(music.list[music.idx]);
}
function musicTick(dt) {
  const duck = (A.muted ? 0 : game.paused ? .3 : 1) * A.vol / .8;
  for (const a of music.all) {
    a.g = clamp(a.g + (a.to ? dt / .8 : -dt / 1.8), 0, 1); a.volume = a.g * music.vol * duck;
    if (!a.to && a.g <= 0) a.pause();
  }
  music.all = music.all.filter(a => a.to || a.g > 0);
  const c = music.cur;
  if (c && c.to && c.duration && c.duration - c.currentTime < 2) musicNext();
}
function musicUnlock() { const c = music.cur; if (c && c.blocked) { c.blocked = false; c.play().catch(() => { c.blocked = true; }); } }
addEventListener('pointerdown', musicUnlock); addEventListener('keydown', musicUnlock);

/* ================= 游戏状态 ================= */
const game = { state: 'race', demo: true, mode: 1, diff: 1, picks: [], karts: [], order: [], views: [], time: 0, raceTime: 0, cd: 0, goT: 0, overT: 0, paused: false, place: 0 };
const shots = [], oils = [], fxs = [];
const keys = {};
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (!game.demo && /^Arrow|Space|Slash|Backspace/.test(e.code)) e.preventDefault();
  if ((e.code === 'Escape' || e.code === 'KeyP') && !game.demo && $('#result').classList.contains('hidden')) setPause(!game.paused);
  if (e.code === 'KeyF' && !e.ctrlKey && !e.metaKey) toggleFs();
  if (/^(Key[WASD]|Arrow)/.test(e.code)) touchDrive = false;
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

// 触屏：自动油门，按键只负责转向 / 漂移 / 道具 / 刹车；一旦用键盘驾驶就退回手动油门
const tk = { l: 0, r: 0, dr: 0, it: 0, brk: 0, rs: 0 };
let touchDrive = !!(window.matchMedia && matchMedia('(hover:none) and (pointer:coarse)').matches);
document.querySelectorAll('#touch [data-k]').forEach(b => {
  const k = b.dataset.k, set = v => e => { e.preventDefault(); tk[k] = v; b.classList.toggle('held', !!v); if (v) { touchDrive = true; audioInit(); } };
  b.addEventListener('pointerdown', e => { try { b.setPointerCapture(e.pointerId); } catch (_) {} set(1)(e); });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, set(0));
  b.addEventListener('contextmenu', e => e.preventDefault());
});

function readInput(p) {
  const K = keys, solo = game.mode === 1;
  const A = { u: K.KeyW, d: K.KeyS, l: K.KeyA, r: K.KeyD, dr: K.ShiftLeft || K.Space, it: K.KeyE || K.KeyQ, rs: K.KeyR };
  const B = { u: K.ArrowUp, d: K.ArrowDown, l: K.ArrowLeft, r: K.ArrowRight, dr: K.ShiftRight || K.Slash, it: K.Enter || K.Period, rs: K.Backspace };
  const a = solo ? { u: A.u || B.u, d: A.d || B.d, l: A.l || B.l, r: A.r || B.r, dr: A.dr || B.dr, it: A.it || B.it, rs: A.rs || B.rs } : p === 0 ? A : B;
  if (p === 0) return { acc: !!a.u || (touchDrive && !tk.brk), brk: !!a.d || !!tk.brk, steer: (a.l || tk.l ? 1 : 0) - (a.r || tk.r ? 1 : 0), drift: !!a.dr || !!tk.dr, item: !!a.it || !!tk.it, reset: !!a.rs || !!tk.rs };
  return { acc: !!a.u, brk: !!a.d, steer: (a.l ? 1 : 0) - (a.r ? 1 : 0), drift: !!a.dr, item: !!a.it, reset: !!a.rs };
}

function clearList(list) { list.forEach(o => scene.remove(o.mesh)); list.length = 0; }

function setupRace(cfg) {
  Object.assign(game, { demo: !!cfg.demo, mode: cfg.mode || 1, diff: cfg.diff ?? game.diff, picks: cfg.picks || [], time: 0, raceTime: 0, paused: false, place: 0, overT: 0, goT: 0 });
  clearList(shots); clearList(oils); clearList(fxs);
  boxes.forEach(b => { b.t = 0; b.mesh.visible = true; });
  const ai = RACERS.map((_, i) => i).filter(i => !game.picks.includes(i)).sort(() => Math.random() - .5);
  const grid = [...ai, ...game.picks], P = {};
  game.karts = grid.map((ri, j) => {
    const s = LEN - 7 - j * 4.5, d = j % 2 ? -3.6 : 3.6; trackPoint(s, d, P);
    const pl = game.picks.indexOf(ri);
    return {
      r: RACERS[ri], ri, m: MODELS[ri], human: pl >= 0, player: pl, auto: false,
      x: P.x, y: P.y, z: P.z, gy: P.y, vy: 0, heading: P.ang, moveAngle: P.ang, speed: 0, steerS: 0, onGround: true, airT: 0,
      i: Math.floor(mod(s, LEN) / DS) % N, s: mod(s, LEN), d, lap: -1, prog: 0, rank: j + 1, finished: false, time: 0, place: 0,
      drift: 0, charge: 0, armed: false, pDrift: false, pItem: false, visYaw: 0, pitch: 0,
      boostT: 0, spinT: 0, spin: 0, slowT: 0, invT: 0, shieldT: 0, item: null, rollT: 0, itemT: 0,
      aiMul: 1, skill: [0.86, 0.92, 0.985][game.diff] + rnd(-.025, .02), lane: rnd(-4, 4), laneT: rnd(1, 4), stuckT: 0, view: null,
    };
  });
  // 视图 / HUD
  const hud = $('#hud'); hud.innerHTML = '';
  const humans = game.demo ? [game.karts[2]] : game.picks.map(ri => game.karts.find(k => k.ri === ri));
  game.views = humans.map((k, i) => {
    const el = document.createElement('div'); el.className = 'view';
    el.style.cssText = `top:${humans.length === 2 ? i * 50 : 0}%;height:${humans.length === 2 ? 50 : 100}%`;
    el.innerHTML = `<div class="item"></div><div class="tag"></div><div class="lap"></div><div class="rank"></div><div class="spd"></div><div class="msg"></div>`;
    if (!game.demo) hud.appendChild(el);
    const v = { kart: k, cam: new THREE.PerspectiveCamera(70, 1, .5, 1800), ang: k.heading, ky: k.y, msgT: 0, cache: {}, el: {}, pfx: humans.length === 2 ? 'P' + (i + 1) + ' · ' : '' };
    for (const c of ['item', 'tag', 'lap', 'rank', 'spd', 'msg']) v.el[c] = el.querySelector('.' + c);
    k.view = v; return v;
  });
  $('#mini').classList.toggle('two', humans.length === 2);
  $('#mini').classList.toggle('hidden', game.demo);
  engineSetup(game.demo ? 0 : humans.length);
  FRAME.classList.toggle('playing', !game.demo); for (const k in tk) tk[k] = 0;
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  musicRate(1); musicPlay(game.demo ? 'menu' : 'race');
  if (game.demo) { game.state = 'race'; game.karts.forEach(k => { k.skill = 0.9 + rnd(-.03, .03); }); $('#count').textContent = ''; }
  else { game.state = 'count'; game.cd = 3.999; $('#count').textContent = '3'; sfx(440, 440, .18); }
  rankAll();
}

function say(k, text, dur = 1.6) { if (k.view && !game.demo) { k.view.el.msg.textContent = text; k.view.msgT = dur; } }
function rankAll() {
  for (const k of game.karts) k.prog = k.finished ? 1e9 - k.place : k.lap * LEN + k.s;
  game.order = [...game.karts].sort((a, b) => b.prog - a.prog);
  game.order.forEach((k, i) => { k.rank = i + 1; });
}

/* ================= 道具逻辑 ================= */
function rollItem(rank) {
  const t = (rank - 1) / 5, w = { turbo: 3, rocket: 1 + 3 * t, oil: 3 - 2.2 * t, shield: 2, emp: rank >= 3 ? .3 + 1.6 * t : 0 };
  let sum = 0; for (const k in w) sum += w[k];
  let r = Math.random() * sum; for (const k in w) { r -= w[k]; if (r <= 0) return k; }
  return 'turbo';
}
function addFx(x, y, z, color, size) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .8, depthWrite: false }));
  mesh.position.set(x, y, z); scene.add(mesh); fxs.push({ mesh, t: 0, size });
}
function hitKart(k) {
  if (k.shieldT > 0) { k.shieldT = 0; addFx(k.x, k.y + 1, k.z, 0x4fd8ff, 4); if (k.human) sfx(900, 300, .25, 'sine'); say(k, T('shieldBlock')); return; }
  if (k.invT > 0 || k.finished) return;
  k.spinT = 1.1; k.invT = 2.6; k.drift = 0; k.charge = 0; k.boostT = 0;
  if (k.human) sfx(300, 60, .5, 'sawtooth', .18);
}
const rocketGeo = new THREE.ConeGeometry(.35, 1.8, 8).rotateX(Math.PI / 2), rocketMat = new THREE.MeshBasicMaterial({ color: 0xff3b30 });
const oilGeo = new THREE.CircleGeometry(1.7, 14).rotateX(-Math.PI / 2), oilMat = new THREE.MeshBasicMaterial({ color: 0x15101c, transparent: true, opacity: .88, polygonOffset: true, polygonOffsetFactor: -3 });
function useItem(k) {
  const it = k.item; if (!it) return; k.item = null;
  if (it === 'turbo') { k.boostT = Math.max(k.boostT, 1.7); if (k.human) sfx(200, 900, .5, 'sawtooth'); }
  else if (it === 'shield') { k.shieldT = 9; if (k.human) sfx(500, 1000, .3, 'sine'); }
  else if (it === 'rocket') {
    const mesh = new THREE.Mesh(rocketGeo, rocketMat); scene.add(mesh);
    shots.push({ mesh, owner: k, target: game.order[k.rank - 2] || null, s: k.s + 3, d: k.d, life: 6, x: k.x, y: k.y, z: k.z });
    if (k.human) sfx(900, 200, .4, 'sawtooth');
  } else if (it === 'oil') {
    const mesh = new THREE.Mesh(oilGeo, oilMat), x = k.x - Math.sin(k.heading) * 3.2, z = k.z - Math.cos(k.heading) * 3.2;
    mesh.position.set(x, k.gy + .07, z); scene.add(mesh); oils.push({ mesh, x, z, y: k.gy, owner: k, life: 45, arm: 1 });
    if (k.human) sfx(200, 90, .25, 'sine');
  } else if (it === 'emp') {
    sfx(1400, 80, .7, 'sawtooth', .16);
    for (const o of game.karts) if (o !== k && o.prog > k.prog && !o.finished) {
      if (o.shieldT > 0) { o.shieldT = 0; say(o, T('shieldBlock')); continue; }
      o.slowT = 3.2; o.drift = 0; o.charge = 0; o.boostT = 0; say(o, T('empHit'));
    }
  }
}
const TP = {};
function updateItems(dt) {
  for (const b of boxes) {
    b.mesh.rotation.y += dt * 1.6; b.mesh.rotation.x += dt * .9;
    if (b.t > 0) { b.t -= dt; if (b.t <= 0) b.mesh.visible = true; continue; }
    for (const k of game.karts) if (Math.abs(k.x - b.x) < 1.9 && Math.abs(k.z - b.z) < 1.9 && Math.abs(k.y + 1 - b.y) < 2.2) {
      b.t = 3; b.mesh.visible = false;
      if (!k.item && k.rollT <= 0) { k.rollT = .9; if (k.human) sfx(700, 1400, .12); }
      break;
    }
  }
  for (let i = shots.length - 1; i >= 0; i--) {
    const r = shots[i]; r.life -= dt; r.s += 92 * dt;
    if (r.target) { const gap = mod(r.target.s - r.s, LEN); if (gap < 70) r.d += clamp(r.target.d - r.d, -16 * dt, 16 * dt); }
    trackPoint(r.s, r.d, TP); r.x = TP.x; r.z = TP.z; r.y = TP.y + rampExtra(r.s, r.d) + .9;
    if (r.target && Math.hypot(r.target.x - r.x, r.target.z - r.z) < 12) r.y += (r.target.y + .8 - r.y) * .7;
    r.mesh.position.set(r.x, r.y, r.z); r.mesh.rotation.y = TP.ang;
    let dead = r.life <= 0;
    for (const k of game.karts) if (k !== r.owner && (k.x - r.x) ** 2 + (k.z - r.z) ** 2 < 5.5 && Math.abs(k.y + .8 - r.y) < 2.5) {
      hitKart(k); if (k.human) say(k, T('rocketHit')); dead = true; addFx(r.x, r.y, r.z, 0xff9a2e, 5); if (k.human || r.owner.human) sfx(180, 40, .45, 'sawtooth', .2); break;
    }
    if (dead) { scene.remove(r.mesh); shots.splice(i, 1); }
  }
  for (let i = oils.length - 1; i >= 0; i--) {
    const o = oils[i]; o.life -= dt; o.arm -= dt; let dead = o.life <= 0;
    for (const k of game.karts) if ((k !== o.owner || o.arm <= 0) && k.onGround && (k.x - o.x) ** 2 + (k.z - o.z) ** 2 < 4.4 && Math.abs(k.y - o.y) < 1.5) {
      if (k.invT <= 0) { hitKart(k); if (k.human) say(k, T('oilSlip')); dead = true; } break;
    }
    if (dead) { scene.remove(o.mesh); oils.splice(i, 1); }
  }
  for (let i = fxs.length - 1; i >= 0; i--) {
    const f = fxs[i]; f.t += dt; const u = f.t / .4; f.mesh.scale.setScalar(.3 + u * f.size); f.mesh.material.opacity = .8 * (1 - u);
    if (u >= 1) { scene.remove(f.mesh); fxs.splice(i, 1); }
  }
}

/* ================= AI ================= */
function aiInput(k, dt) {
  const inp = { acc: true, brk: false, steer: 0, drift: false, item: false, reset: false };
  k.laneT -= dt; if (k.laneT <= 0) { k.laneT = rnd(2, 6); k.lane = rnd(-5, 5); }
  const look = 13 + Math.abs(k.speed) * .42;
  trackPoint(k.s + look, k.lane, TP);
  const diff = wrap(Math.atan2(TP.x - k.x, TP.z - k.z) - (k.drift ? k.moveAngle : k.heading));
  const u = clamp(diff * 2.3, -1.28, 1.28);
  const far = wrap(tanAngle(k.s + 52) - tanAngle(k.s + 6)), near = wrap(tanAngle(k.s + 30) - tanAngle(k.s + 2));
  if (k.drift) {
    inp.steer = k.drift * clamp((u * k.drift - .78) / .5, -1, 1);
    inp.drift = Math.abs(near) > .28 && Math.sign(near) === k.drift && k.charge < 3.4 && Math.abs(k.d) < ROAD_HALF + .5;
  } else {
    inp.steer = clamp(u, -1, 1);
    inp.drift = game.diff + (game.demo ? 1 : 0) > 0 && Math.abs(far) > .62 && k.speed > 30 && k.onGround && Math.sign(far) === Math.sign(inp.steer) && Math.abs(inp.steer) > .3 && Math.abs(k.d) < ROAD_HALF;
  }
  if (Math.abs(diff) > 1.0 && k.speed > 22) { inp.brk = true; inp.acc = false; }
  // 卡住复位
  k.stuckT = Math.abs(k.speed) < 5 && k.spinT <= 0 ? k.stuckT + dt : 0;
  if (k.stuckT > 2) { inp.reset = true; k.stuckT = 0; }
  // 道具
  if (k.item) {
    k.itemT -= dt;
    if (k.itemT <= 0) {
      const ahead = game.order[k.rank - 2], behind = game.order[k.rank];
      inp.item = k.itemT < -8 ||
        (k.item === 'turbo' && Math.abs(far) < .25 && !k.drift && k.onGround) || k.item === 'shield' || (k.item === 'emp' && k.rank > 1) ||
        (k.item === 'rocket' && !!ahead && ahead.prog - k.prog < 90) || (k.item === 'oil' && !!behind && k.prog - behind.prog < 32);
    }
  }
  return inp;
}

/* ================= 车辆物理 ================= */
function locate(k) {
  let best = k.i, bd = 1e9;
  for (let j = -6; j <= 12; j++) { const i = mod(k.i + j, N), t = TR[i], q = (k.x - t.x) ** 2 + (k.z - t.z) ** 2; if (q < bd) { bd = q; best = i; } }
  const t = TR[best], dx = k.x - t.x, dz = k.z - t.z, al = clamp((dx * t.tx + dz * t.tz) / DS, -1, 1);
  k.i = best; k.d = dx * t.nx + dz * t.nz; k.s = mod((best + al) * DS, LEN);
  const o = TR[mod(best + (al >= 0 ? 1 : -1), N)];
  return t.y + (o.y - t.y) * Math.abs(al) + rampExtra(k.s, k.d);
}
function resetKart(k) {
  trackPoint(k.s, clamp(k.d, -5, 5), TP);
  Object.assign(k, { x: TP.x, z: TP.z, y: TP.y + .3, vy: 0, heading: TP.ang, moveAngle: TP.ang, speed: 8, drift: 0, charge: 0, spinT: 0, spin: 0 });
}
function releaseDrift(k) {
  const lvl = k.charge > 2.5 ? 3 : k.charge > 1.45 ? 2 : k.charge > .7 ? 1 : 0;
  if (lvl) { k.boostT = Math.max(k.boostT, [0, .6, 1.1, 1.8][lvl]); if (k.human) sfx(300 + lvl * 120, 900 + lvl * 200, .3, 'sawtooth'); }
  k.drift = 0; k.charge = 0;
}
function updateKart(k, inp, dt) {
  const st = k.r;
  k.boostT = Math.max(0, k.boostT - dt); k.slowT = Math.max(0, k.slowT - dt); k.invT = Math.max(0, k.invT - dt); k.shieldT = Math.max(0, k.shieldT - dt);
  if (k.rollT > 0) { k.rollT -= dt; if (k.rollT <= 0) { k.item = rollItem(k.rank); k.itemT = rnd(1, 4); if (k.human) sfx(1000, 1600, .15); } }
  if (inp.reset && !k.pReset && k.onGround) resetKart(k); k.pReset = inp.reset;
  if (inp.item && !k.pItem) useItem(k); k.pItem = inp.item;
  let { steer, acc, brk, drift: dr } = inp;
  if (k.spinT > 0) { k.spinT -= dt; k.spin += dt * 15; steer = 0; acc = brk = dr = false; if (k.spinT <= 0) k.spin = 0; }
  k.steerS += (steer - k.steerS) * Math.min(1, 10 * dt);
  const off = Math.abs(k.d) > ROAD_HALF + 1.4, og = k.onGround;
  let max = BASE_MAX * st.spd * k.aiMul;
  if (k.boostT > 0) max *= 1.35; else if (off) max *= .55;
  if (k.slowT > 0) max *= .62;
  if (og) {
    if (k.spinT > 0) k.speed *= 1 - 2.2 * dt;
    else if (k.boostT > 0 && k.speed < max) k.speed += 60 * dt;
    else if (acc && !brk) { if (k.speed < max) k.speed += ACC * st.acc * (1 - .75 * Math.max(0, k.speed) / max) * dt; }
    else if (brk) k.speed = Math.max(-14, k.speed - (k.speed > 0 ? 55 : 22) * dt);
    else k.speed -= k.speed * .7 * dt;
    if (k.speed > max) k.speed -= Math.min(k.speed - max, (off ? 45 : 14) * dt);
  }
  // 漂移
  if (dr && !k.pDrift) k.armed = true; if (!dr) k.armed = false; k.pDrift = dr;
  if (!k.drift && k.armed && og && k.speed > 20 && Math.abs(steer) > .3) { k.drift = Math.sign(steer); k.armed = false; k.charge = 0; k.vy = 5.5; if (k.human) sfx(500, 700, .08); }
  if (k.drift) {
    if (!dr) releaseDrift(k);
    else if (k.speed < 14 || (off && k.boostT <= 0)) { k.drift = 0; k.charge = 0; }
    else if (og) k.charge += dt * (.75 + .5 * Math.max(0, steer * k.drift));
  }
  // 转向与移动
  let w = k.drift ? k.drift * TURN * (.78 + .5 * k.steerS * k.drift)
                  : TURN * st.trn * k.steerS * clamp(k.speed / 10, -1, 1) * (1 - .22 * clamp(Math.abs(k.speed) / BASE_MAX, 0, 1));
  if (!og) w *= .5;
  k.heading += w * dt;
  if (og) k.moveAngle += wrap(k.heading - k.moveAngle) * Math.min(1, (k.drift ? 4 : 9) * dt);
  k.x += Math.sin(k.moveAngle) * k.speed * dt; k.z += Math.cos(k.moveAngle) * k.speed * dt;
  const ps = k.s; const g = locate(k);
  // 护栏
  const lim = WALL - 1.2;
  if (Math.abs(k.d) > lim) {
    const t = TR[k.i], sg = Math.sign(k.d), over = Math.abs(k.d) - lim;
    k.x -= t.nx * sg * over; k.z -= t.nz * sg * over; k.d = sg * lim;
    if (k.speed > 0) {
      let vx = Math.sin(k.moveAngle) * k.speed, vz = Math.cos(k.moveAngle) * k.speed; const vn = (vx * t.nx + vz * t.nz) * sg;
      if (vn > 0) {
        vx -= t.nx * sg * vn * 1.3; vz -= t.nz * sg * vn * 1.3;
        k.speed = Math.hypot(vx, vz) * (vn > 5 ? .88 : 1); k.moveAngle = Math.atan2(vx, vz); k.heading += wrap(k.moveAngle - k.heading) * .35;
        if (vn > 4) { if (k.drift) { k.drift = 0; k.charge = 0; } if (k.human) sfx(120, 60, .12, 'square', .1); }
      }
    } else k.speed *= .5;
  }
  // 计圈
  if (ps > LEN * .75 && k.s < LEN * .25) { k.lap++; onLap(k); } else if (ps < LEN * .25 && k.s > LEN * .75) k.lap--;
  // 垂直方向（坡道 / 跳跃）
  k.gy = g; k.vy -= GRAV * dt; const py = k.y; k.y += k.vy * dt;
  if (k.y <= g) {
    if (!og && k.airT > .45 && k.human) sfx(140, 70, .12, 'sine', .2);
    k.vy = og ? clamp((g - py) / dt, -40, 15) : 0; k.y = g;
  }
  k.onGround = k.y <= g + .12; k.airT = k.onGround ? 0 : k.airT + dt;
  k.pitch += (Math.atan2((k.y - py) / dt, Math.max(10, Math.abs(k.speed))) - k.pitch) * Math.min(1, 9 * dt);
  // 坡道 / 加速带
  if (k.onGround && k.spinT <= 0) {
    let b = rampExtra(k.s, k.d) > .3;
    if (!b) for (const p of PADS) if (mod(k.s - p.s0, LEN) < p.len && Math.abs(k.d - p.d) < 3.4) b = true;
    if (b) { if (k.boostT < .3 && k.human) sfx(250, 1000, .35, 'sawtooth'); k.boostT = Math.max(k.boostT, .9); }
  }
}
function onLap(k) {
  if (game.demo || k.finished) return;
  if (k.lap >= LAPS) {
    k.finished = true; k.time = game.raceTime; k.place = ++game.place; k.auto = true;
    if (k.human) { say(k, T('finish', k.place), 99); sfx(600, 1200, .6, 'square', .15); }
  } else if (k.lap === LAPS - 1 && k.human) { say(k, T('lastLap'), 2); sfx(900, 900, .3); musicRate(1.1); }
  else if (k.lap > 0 && k.human) sfx(700, 900, .15);
}
function collide() {
  const K = game.karts;
  for (let i = 0; i < K.length; i++) for (let j = i + 1; j < K.length; j++) {
    const a = K[i], b = K[j], dx = b.x - a.x, dz = b.z - a.z, q = dx * dx + dz * dz;
    if (q < 5.29 && Math.abs(a.y - b.y) < 1.4) {
      const d = Math.sqrt(q) || .01, p = (2.3 - d) / 2, ux = dx / d, uz = dz / d;
      a.x -= ux * p; a.z -= uz * p; b.x += ux * p; b.z += uz * p;
      const av = (a.speed + b.speed) / 2; a.speed += (av - a.speed) * .15; b.speed += (av - b.speed) * .15;
    }
  }
}

function syncKart(k, dt) {
  const m = k.m, g = m.g;
  k.visYaw += (k.drift * .28 - k.visYaw) * Math.min(1, 8 * dt);
  g.position.set(k.x, k.y, k.z); g.rotation.set(-k.pitch, k.heading + k.visYaw + k.spin, 0);
  m.body.rotation.z = k.steerS * .06 * clamp(k.speed / 30, 0, 1);
  for (const w of m.wheels) { w.w.rotation.x += k.speed * dt / .42; if (w.front) w.piv.rotation.y = k.steerS * .4; }
  const lvl = k.charge > 2.5 ? 3 : k.charge > 1.45 ? 2 : k.charge > .7 ? 1 : 0;
  for (const s of m.sparks) {
    s.visible = !!k.drift && k.onGround;
    if (s.visible) { s.material.color.setHex([0xdddddd, 0x4fc3ff, 0xffa726, 0xd05bff][lvl]); s.scale.setScalar((lvl ? .8 + lvl * .35 : .5) * rnd(.6, 1.3)); s.rotation.set(rnd(0, 6), rnd(0, 6), 0); }
  }
  for (const f of m.flames) { f.visible = k.boostT > 0; if (f.visible) f.scale.set(1, 1, rnd(.7, 1.5)); }
  m.shield.visible = k.shieldT > 0; m.zap.visible = k.slowT > 0; if (m.zap.visible) m.zap.rotation.y += dt * 12;
  g.visible = !(k.invT > 0 && k.spinT <= 0 && Math.floor(game.time * 14) % 2);
  const hgt = k.y - k.gy; m.shadow.position.set(k.x, k.gy + .06, k.z); m.shadow.scale.setScalar(clamp(1 - hgt * .08, .4, 1));
}

/* ================= 主循环 ================= */
function tick(dt) {
  game.time += dt; chevTex.offset.y -= dt * 1.5;
  for (const f of anim) f(dt, game.time);
  if (game.state === 'count') {
    const p = Math.ceil(game.cd); game.cd -= dt; const c = Math.ceil(game.cd);
    if (c !== p) { if (c > 0) { $('#count').textContent = c; sfx(440, 440, .18); } else { $('#count').textContent = 'GO!'; game.state = 'race'; game.goT = .9; sfx(880, 880, .5); } }
  } else {
    if (game.goT > 0) { game.goT -= dt; if (game.goT <= 0) $('#count').textContent = ''; }
    game.raceTime += dt;
    let best = -1e9; for (const k of game.karts) if (k.human && !k.auto) best = Math.max(best, k.prog);
    for (const k of game.karts) {
      const isAI = !k.human || k.auto;
      if (isAI) { const rb = best > -1e8 ? clamp((best - k.prog) / 300, -1, 1) : 0; k.aiMul = k.skill * (1 + (rb > 0 ? .07 : .05) * rb); }
      updateKart(k, isAI ? aiInput(k, dt) : readInput(k.player), dt);
    }
    collide(); updateItems(dt); rankAll();
    if (!game.demo && game.state === 'race' && game.karts.every(k => !k.human || k.finished)) { game.state = 'over'; game.overT = 2.8; }
    if (game.state === 'over' && game.overT > 0) { game.overT -= dt; if (game.overT <= 0) showResult(); }
  }
  for (const k of game.karts) syncKart(k, dt);
}

const fmt = t => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;
function setText(v, key, html) { if (v.cache[key] !== html) { v.cache[key] = html; v.el[key].innerHTML = html; } }
function updateView(v, dt, i, n) {
  const k = v.kart, cam = v.cam;
  v.ang += wrap((k.speed > 2 ? k.moveAngle : k.heading) - v.ang) * Math.min(1, 5.5 * dt);
  v.ky += (k.y - v.ky) * Math.min(1, 7 * dt);
  const dist = game.demo ? 13 : 7.6, hgt = game.demo ? 6.5 : 3.5, sx = Math.sin(v.ang), cz = Math.cos(v.ang);
  cam.position.set(k.x - sx * dist, v.ky + hgt, k.z - cz * dist); cam.lookAt(k.x + sx * 5, v.ky + 1.3, k.z + cz * 5);
  const fov = 68 + clamp(k.speed / BASE_MAX, 0, 1.4) * 9 + (k.boostT > 0 ? 9 : 0);
  cam.fov += (fov - cam.fov) * Math.min(1, 5 * dt);
  if (game.demo) return;
  setText(v, 'tag', `${v.pfx}${k.r.icon} ${k.r.name}`);
  setText(v, 'rank', `${k.finished ? k.place : k.rank}<span>/6</span>`);
  setText(v, 'lap', `${T('lap', clamp(k.lap + 1, 1, LAPS), LAPS)}<small>${fmt(k.finished ? k.time : game.raceTime)}</small>`);
  setText(v, 'item', k.rollT > 0 ? ITEMS[ITEM_KEYS[Math.floor(game.time * 12) % 5]].icon : k.item ? ITEMS[k.item].icon : '');
  setText(v, 'spd', `${Math.round(Math.abs(k.speed) * 3.2)}<small>km/h</small>`);
  if (v.msgT > 0) { v.msgT -= dt; if (v.msgT <= 0) v.el.msg.textContent = ''; }
  else if (!k.auto && k.speed > 6 && Math.abs(wrap(k.moveAngle - TR[k.i].ang)) > 2.1) { v.el.msg.textContent = T('wrongWay'); v.msgT = .4; }
  const e = engines[i];
  if (e) { e.o.frequency.value = 55 + Math.abs(k.speed) * 2.6 + (k.boostT > 0 ? 40 : 0); e.g.gain.value = game.paused || game.state === 'over' || A.muted ? 0 : .05 / n; }
}

// 小地图
const mini = $('#mini'), mg = mini.getContext('2d');
const MB = (() => { let a = 1e9, b = -1e9, c = 1e9, d = -1e9; for (const t of TR) { a = Math.min(a, t.x); b = Math.max(b, t.x); c = Math.min(c, t.z); d = Math.max(d, t.z); } const sc = 300 / Math.max(b - a, d - c); return { b, d, sc, ox: (340 - (b - a) * sc) / 2, oz: (340 - (d - c) * sc) / 2 }; })();
const mx = x => MB.ox + (MB.b - x) * MB.sc, mz = z => MB.oz + (MB.d - z) * MB.sc;
const miniBg = document.createElement('canvas'); miniBg.width = miniBg.height = 340;
(() => { const g = miniBg.getContext('2d'); g.lineJoin = 'round'; for (const [w, c] of [[16, 'rgba(10,16,32,.75)'], [8, '#fff']]) { g.beginPath(); TR.forEach((t, i) => i ? g.lineTo(mx(t.x), mz(t.z)) : g.moveTo(mx(t.x), mz(t.z))); g.closePath(); g.lineWidth = w; g.strokeStyle = c; g.stroke(); } g.fillStyle = '#e8432e'; g.fillRect(mx(TR[0].x) - 3, mz(TR[0].z) - 9, 6, 18); })();
function drawMini() {
  mg.clearRect(0, 0, 340, 340); mg.drawImage(miniBg, 0, 0);
  for (const k of [...game.order].reverse()) {
    mg.beginPath(); mg.arc(mx(k.x), mz(k.z), k.human ? 10 : 7, 0, 7); mg.fillStyle = '#' + k.r.color.toString(16).padStart(6, '0'); mg.fill();
    mg.lineWidth = k.human ? 4 : 2; mg.strokeStyle = k.human ? '#fff' : '#1b2333'; mg.stroke();
  }
}

function draw(dt) {
  const w = FRAME.clientWidth, h = FRAME.clientHeight, n = game.views.length;
  renderer.setScissorTest(true);
  game.views.forEach((v, i) => {
    updateView(v, dt, i, n);
    const vh = n === 2 ? h / 2 : h, y = n === 2 && i === 0 ? h / 2 : 0;
    renderer.setViewport(0, y, w, vh); renderer.setScissor(0, y, w, vh);
    v.cam.aspect = w / vh; v.cam.updateProjectionMatrix(); renderer.render(scene, v.cam);
  });
  if (!game.demo) drawMini();
}
let last = performance.now();
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  if (!game.paused && dt > 0) tick(dt);
  draw(game.paused ? 0 : dt); musicTick(dt);
  if (master) master.gain.value = A.muted ? 0 : .5 * A.vol / .8;
  requestAnimationFrame(frame);
}
function resize() { renderer.setSize(Math.max(1, FRAME.clientWidth), Math.max(1, FRAME.clientHeight), false); }
addEventListener('resize', resize); resize();
if (window.ResizeObserver) new ResizeObserver(resize).observe(FRAME);

/* ================= 界面 ================= */
function showResult() {
  rankAll();
  $('#resTable').innerHTML = game.order.map((k, i) =>
    `<tr class="${k.human ? 'me' : ''}"><td>${i + 1}</td><td>${k.r.icon} ${k.r.name}${k.human ? (game.mode === 2 ? ` (P${k.player + 1})` : ` (${T('you')})`) : ''}</td><td>${k.finished ? fmt(k.time) : '—'}</td></tr>`).join('');
  $('#result').classList.remove('hidden'); FRAME.classList.remove('playing'); musicRate(1); engines.forEach(e => { e.g.gain.value = 0; });
}
function setPause(p) { if (game.state === 'over' && game.overT <= 0) return; game.paused = p; $('#pause').classList.toggle('hidden', !p); }
function toMenu() {
  setupRace({ demo: true });
  for (const id of ['#result', '#pause', '#step2']) $(id).classList.add('hidden');
  for (const id of ['#menu', '#step1']) $(id).classList.remove('hidden');
}
let pendMode = 1, pendPicks = [];
function showCards() {
  $('#pickTitle').textContent = pendMode === 2 ? T('pickP', pendPicks.length + 1) : T('pickSolo');
  const bar = v => `<u><i style="width:${clamp((v - .88) / .26, .1, 1) * 100}%"></i></u>`;
  $('#cards').innerHTML = RACERS.map((r, i) =>
    `<div class="kr-card ${pendPicks.includes(i) ? 'taken' : ''}" data-i="${i}"><div class="av" style="background:#${r.color.toString(16).padStart(6, '0')}">${r.icon}</div><b>${r.name}</b>
     <div class="st">${T('statSpd')}${bar(r.spd)}${T('statAcc')}${bar(r.acc)}${T('statTrn')}${bar(r.trn)}</div></div>`).join('');
}
document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => {
  audioInit(); pendMode = +b.dataset.mode; pendPicks = [];
  $('#step1').classList.add('hidden'); $('#step2').classList.remove('hidden'); showCards();
});
document.querySelectorAll('[data-diff]').forEach(b => b.onclick = () => {
  game.diff = +b.dataset.diff; document.querySelectorAll('[data-diff]').forEach(o => o.classList.toggle('on', o === b));
});
$('#cards').onclick = e => {
  const c = e.target.closest('.kr-card'); if (!c) return;
  pendPicks.push(+c.dataset.i);
  if (pendPicks.length < pendMode) return showCards();
  $('#menu').classList.add('hidden'); setupRace({ mode: pendMode, picks: pendPicks, diff: game.diff });
};
$('#back').onclick = () => { $('#step2').classList.add('hidden'); $('#step1').classList.remove('hidden'); };
$('#again').onclick = () => { $('#result').classList.add('hidden'); setupRace({ mode: game.mode, picks: game.picks, diff: game.diff }); };
$('#toMenu').onclick = toMenu; $('#quit').onclick = toMenu; $('#resume').onclick = () => setPause(false);

$('#btnPause').onclick = () => { if (!game.demo && $('#result').classList.contains('hidden')) setPause(!game.paused); };

/* ================= 全屏 / 后台暂停 / 语言 ================= */
function isFs() { return document.fullscreenElement === FRAME || document.webkitFullscreenElement === FRAME || FRAME.classList.contains('kr-fs'); }
function toggleFs() {
  const soft = () => { FRAME.classList.add('kr-fs'); document.body.classList.add('kr-fs-on'); };
  if (!isFs()) {
    const req = FRAME.requestFullscreen || FRAME.webkitRequestFullscreen;
    if (req) { try { const pr = req.call(FRAME); if (pr && pr.catch) pr.catch(soft); } catch (e) { soft(); } } else soft();
  } else if (FRAME.classList.contains('kr-fs')) { FRAME.classList.remove('kr-fs'); document.body.classList.remove('kr-fs-on'); }
  else { const ex = document.exitFullscreen || document.webkitExitFullscreen; if (ex) ex.call(document); }
  setTimeout(resize, 120);
}
$('#btnFs').addEventListener('click', toggleFs);
for (const ev of ['fullscreenchange', 'webkitfullscreenchange']) document.addEventListener(ev, () => setTimeout(resize, 60));

KIT.onHide(() => { if (!game.demo && game.state !== 'over' && !game.paused) setPause(true); for (const k in keys) keys[k] = false; });
document.addEventListener('visibilitychange', () => {       // 切后台时音乐一并停下，回来再接着放
  if (document.hidden) music.all.forEach(a => a.pause());
  else if (music.cur && !music.cur.blocked) music.cur.play().catch(() => { music.cur.blocked = true; });
});

function refreshLang() {
  $('#btnFs').title = T('fsTitle'); $('#btnPause').title = T('pauseTitle');
  game.views.forEach(v => { v.cache = {}; });
  if (!$('#step2').classList.contains('hidden')) showCards();
  if (!$('#result').classList.contains('hidden')) showResult();
}
KIT.mountMute($('#btnMute'));
KIT.boot(refreshLang);

setupRace({ demo: true });
requestAnimationFrame(frame);
window.KART = { game, tick, setupRace, TR, LEN, RAMPS, PADS, music, animals, scene, renderer }; // 调试入口
})();
