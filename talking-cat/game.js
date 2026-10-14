(() => {
'use strict';
// 汤姆猫：Three.js 程序化 3D 猫 + 弹簧动画 + WebAudio 合成音效 + 麦克风学舌 + 养成数值
const STR = window.GAME_STR || { zh: {}, en: {} };
const T = (k, ...a) => AMG.tf(STR, k, ...a);
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.random() * a.length | 0];
const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
const easeIO = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const LS = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
};

const frame = $('frame'), canvas = $('game');
let muted = LS.get('cat-muted') === '1';
let ready = false;

// ---------------------------------------------------------------- 存档
const D = { hunger: 72, mood: 72, energy: 82, bond: 0, fur: 0, t: Date.now() };
try {
  const s = JSON.parse(LS.get('cat-save') || 'null');
  if (s) {
    Object.assign(D, s);
    const el = clamp((Date.now() - (s.t || Date.now())) / 1000, 0, 1800);
    D.hunger = Math.max(15, D.hunger - el * .05);
    D.mood = Math.max(15, D.mood - el * .035);
    D.energy = clamp(D.energy + el * .02, 0, 100);
  }
} catch (e) {}
const level = b => Math.floor(Math.sqrt(b / 6)) + 1;
function save() { D.t = Date.now(); LS.set('cat-save', JSON.stringify(D)); }
window.addEventListener('pagehide', save);

// ---------------------------------------------------------------- 语言 / 静音
function refreshBond() {
  $('bond').textContent = '❤ Lv.' + level(D.bond);
  $('menu-best').textContent = T('best', level(D.bond));
}
function refreshSleepLabel() {
  const sp = document.querySelector('[data-act="sleep"] span');
  sp.dataset.i18n = C.mode === 'sleep' ? 'aWake' : 'aSleep';
  sp.textContent = T(sp.dataset.i18n);
}
window.__refreshLang = function () {
  AMG.apply(STR);
  $('btn-mute').title = T('muteTitle');
  const st = document.querySelectorAll('.stat');
  st[0].title = T('statHunger'); st[1].title = T('statMood'); st[2].title = T('statEnergy');
  refreshBond();
  if (ready) refreshSleepLabel();
};
function toggleMute() {
  muted = !muted; LS.set('cat-muted', muted ? '1' : '0');
  $('btn-mute').textContent = muted ? '🔇' : '🔊';
  if (master) master.gain.value = muted ? 0 : 1;
  if (muted) purr.stop();
}
$('btn-mute').onclick = toggleMute;
$('btn-mute').textContent = muted ? '🔇' : '🔊';
AMG.mountBtn();

if (!window.THREE) { $('screen-nogl').classList.remove('hidden'); $('screen-menu').classList.add('hidden'); window.__refreshLang(); return; }
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true }); }
catch (e) { $('screen-nogl').classList.remove('hidden'); $('screen-menu').classList.add('hidden'); window.__refreshLang(); return; }

// ---------------------------------------------------------------- 音效（全部 WebAudio 合成）
let actx = null, master = null, brown = null, white = null;
function audio() {
  if (!actx) {
    try {
      actx = new (window.AudioContext || window.webkitAudioContext)();
      master = actx.createGain(); master.gain.value = muted ? 0 : 1; master.connect(actx.destination);
      const n = actx.sampleRate * 2;
      brown = actx.createBuffer(1, n, actx.sampleRate); white = actx.createBuffer(1, n, actx.sampleRate);
      const b = brown.getChannelData(0), w = white.getChannelData(0);
      let l = 0;
      for (let i = 0; i < n; i++) { const r = Math.random() * 2 - 1; w[i] = r; l = (l + .02 * r) / 1.02; b[i] = l * 3.2; }
    } catch (e) { actx = null; }
  }
  if (actx && actx.state === 'suspended') actx.resume();
  return actx;
}
function tone(f, dur, type = 'sine', vol = .08, delay = 0, to = null) {
  const c = audio(); if (!c || muted) return;
  const t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + .02);
}
function burst(freq, q, dur, vol, type = 'bandpass', delay = 0) {
  const c = audio(); if (!c || muted) return;
  const t = c.currentTime + delay, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  s.buffer = white; f.type = type; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random()); s.stop(t + dur + .02);
}
function meow(o = {}) {
  const c = audio(); if (!c || muted) return;
  const { f = 520, dur = .7, vol = .13, bend = 1.35, delay = 0 } = o;
  const t = c.currentTime + delay;
  const osc = c.createOscillator(), bp = c.createBiquadFilter(), lp = c.createBiquadFilter(), g = c.createGain();
  const lfo = c.createOscillator(), lg = c.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(f * .86, t);
  osc.frequency.linearRampToValueAtTime(f * bend, t + dur * .32);
  osc.frequency.exponentialRampToValueAtTime(f * .72, t + dur);
  lfo.frequency.value = 6.5; lg.gain.value = f * .02; lfo.connect(lg); lg.connect(osc.frequency);
  bp.type = 'bandpass'; bp.Q.value = 3.2;
  bp.frequency.setValueAtTime(760, t);
  bp.frequency.linearRampToValueAtTime(1650, t + dur * .35);
  bp.frequency.linearRampToValueAtTime(880, t + dur);
  lp.type = 'lowpass'; lp.frequency.value = 3400;
  g.gain.setValueAtTime(.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + .05);
  g.gain.setValueAtTime(vol, t + dur * .55);
  g.gain.exponentialRampToValueAtTime(.001, t + dur);
  osc.connect(bp); bp.connect(lp); lp.connect(g); g.connect(master);
  osc.start(t); lfo.start(t); osc.stop(t + dur + .05); lfo.stop(t + dur + .05);
}
const purr = {
  on: false, g: null,
  start() {
    const c = audio(); if (!c || muted) return;
    if (!this.g) {
      const src = c.createBufferSource(), lp = c.createBiquadFilter(), am = c.createGain(), g = c.createGain();
      const lfo = c.createOscillator(), lg = c.createGain();
      src.buffer = brown; src.loop = true; lp.type = 'lowpass'; lp.frequency.value = 240;
      am.gain.value = .5; lfo.frequency.value = 24; lg.gain.value = .5; lfo.connect(lg); lg.connect(am.gain);
      g.gain.value = 0;
      src.connect(lp); lp.connect(am); am.connect(g); g.connect(master);
      src.start(); lfo.start(); this.g = g;
    }
    this.g.gain.setTargetAtTime(.55, c.currentTime, .15); this.on = true;
  },
  stop() { if (this.g && actx) this.g.gain.setTargetAtTime(0, actx.currentTime, .2); this.on = false; }
};
const sfx = {
  hi: () => meow({ f: 560, dur: .75 }),
  ouch: () => meow({ f: 680, dur: .32, bend: 1.5, vol: .12 }),
  tail: () => meow({ f: 620, dur: .55, bend: 1.7, vol: .14 }),
  happy: () => meow({ f: 500, dur: .5, bend: 1.25, vol: .1 }),
  low: () => meow({ f: 340, dur: .9, bend: 1.15, vol: .12 }),
  yawn: () => meow({ f: 300, dur: 1.4, bend: 1.5, vol: .1 }),
  giggle: () => [640, 760, 680, 800, 720].forEach((f, i) => tone(f, .08, 'triangle', .09, i * .09, f * 1.08)),
  gulp: () => tone(260, .12, 'sine', .1, 0, 130),
  munch: () => { burst(900, 1.2, .07, .14, 'lowpass'); tone(150, .08, 'sine', .08, 0, 90); },
  pop: v => tone(340 + (v || 0) * 40, .1, 'sine', .11, 0, 130),
  swat: () => { burst(1800, 1, .09, .1); tone(520, .12, 'triangle', .08, 0, 260); },
  tummy: () => tone(90, .5, 'sawtooth', .05, 0, 55),
  level: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, .18, 'triangle', .09, i * .09)),
  sleepy: () => burst(300, .8, .8, .05, 'lowpass')
};

// ---------------------------------------------------------------- Three.js 基础
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const dayBg = new THREE.Color(0xf7e2c2), nightBg = new THREE.Color(0x1b2140);
scene.background = dayBg.clone();
const camera = new THREE.PerspectiveCamera(32, 480 / 620, .1, 100);
const CAM = { y: 3.4, ty: 2.05, d: 15.6 };
function resize() {
  const w = frame.clientWidth || 480, h = frame.clientHeight || 620;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.position.set(0, CAM.y, CAM.d * Math.max(1, .774 / camera.aspect));
  camera.lookAt(0, CAM.ty, 0);
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(frame);

const hemi = new THREE.HemisphereLight(0xfff3df, 0xc9a882, .9); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, .85);
sun.position.set(3.5, 8, 7); sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -6, right: 6, top: 7, bottom: -3, near: 1, far: 30 });
sun.shadow.bias = -.0008; sun.shadow.normalBias = .07;
scene.add(sun);
const lamp = new THREE.PointLight(0xffc47a, 0, 18, 1.6); lamp.position.set(2.8, 3.2, 3.5); scene.add(lamp);
const DAY = { hemi: new THREE.Color(0xfff3df), sun: new THREE.Color(0xffffff) };
const NIGHT = { hemi: new THREE.Color(0x7d8fd0), sun: new THREE.Color(0x93a5ff) };

const std = (c, r = .9) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: 0 });
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t;
}

// ---- 房间
const floorTex = canvasTex(512, 512, (g, w, h) => {
  const rows = 8, rh = h / rows;
  for (let r = 0; r < rows; r++) {
    const s = 205 + ((r * 37) % 26), y = r * rh;
    g.fillStyle = `rgb(${s},${s - 54},${s - 112})`; g.fillRect(0, y, w, rh);
    let x = (r % 2) * 90;
    while (x < w) { g.fillStyle = 'rgba(70,35,10,.2)'; g.fillRect(x, y, 2, rh); x += 150 + ((x * 7 + r * 13) % 110); }
    g.fillStyle = 'rgba(70,35,10,.28)'; g.fillRect(0, y, w, 2);
  }
});
floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping; floorTex.repeat.set(3, 2);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(26, 14), new THREE.MeshStandardMaterial({ map: floorTex, roughness: .85 }));
floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, 4.4); floor.receiveShadow = true; scene.add(floor);

const wallTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#f8e3c4'; g.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 32) { g.fillStyle = 'rgba(255,255,255,.28)'; g.fillRect(x, 0, 14, h); }
  g.fillStyle = 'rgba(214,150,96,.22)';
  for (let y = 16; y < h; y += 48) for (let x = 16; x < w; x += 48) { g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); }
});
wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping; wallTex.repeat.set(8, 3);
const wall = new THREE.Mesh(new THREE.PlaneGeometry(26, 12), new THREE.MeshStandardMaterial({ map: wallTex, roughness: 1 }));
wall.position.set(0, 6, -2.6); wall.receiveShadow = true; scene.add(wall);
const wains = new THREE.Mesh(new THREE.PlaneGeometry(26, 2), std(0xdca877, 1)); wains.position.set(0, 1, -2.58); scene.add(wains);
const rail = new THREE.Mesh(new THREE.BoxGeometry(26, .16, .16), std(0xfff1dc)); rail.position.set(0, 2.05, -2.5); scene.add(rail);
const base = new THREE.Mesh(new THREE.BoxGeometry(26, .32, .16), std(0xfff1dc)); base.position.set(0, .16, -2.5); scene.add(base);

// 窗户（昼夜切换）
const skyMat = new THREE.MeshBasicMaterial({ color: 0x9edcff });
const daySky = new THREE.Color(0x9edcff), nightSky = new THREE.Color(0x121a3d);
const win = new THREE.Group(); win.position.set(-3.5, 4.75, -2.5); scene.add(win);
win.add(new THREE.Mesh(new THREE.BoxGeometry(2.9, 3.7, .18), std(0xfff8ee)));
const sky = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 3.2), skyMat); sky.position.z = .1; win.add(sky);
const bar1 = new THREE.Mesh(new THREE.BoxGeometry(2.4, .12, .1), std(0xfff8ee)); bar1.position.z = .13; win.add(bar1);
const bar2 = new THREE.Mesh(new THREE.BoxGeometry(.12, 3.2, .1), std(0xfff8ee)); bar2.position.z = .13; win.add(bar2);
const cloud = new THREE.Mesh(new THREE.CircleGeometry(.38, 20), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .9 }));
cloud.position.set(-.5, .8, .11); cloud.scale.x = 1.8; win.add(cloud);
const moon = new THREE.Mesh(new THREE.CircleGeometry(.3, 24), new THREE.MeshBasicMaterial({ color: 0xfff2b8 }));
moon.position.set(.45, .8, .12); win.add(moon);
const starPts = [];
for (let i = 0; i < 16; i++) starPts.push(rnd(-1.05, 1.05), rnd(-1.4, 1.4), .12);
const starGeo = new THREE.BufferGeometry(); starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPts, 3));
const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: .08, transparent: true, opacity: 0 })); win.add(stars);

// 挂画
const pic = new THREE.Group(); pic.position.set(3.7, 4.9, -2.5); scene.add(pic);
pic.add(new THREE.Mesh(new THREE.BoxGeometry(2, 2.5, .14), std(0xb9784a)));
const picTex = canvasTex(128, 160, (g, w, h) => {
  g.fillStyle = '#fff7e8'; g.fillRect(0, 0, w, h);
  g.font = '84px system-ui, "Apple Color Emoji", "Segoe UI Emoji"'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('🐟', w / 2, h / 2 + 4);
});
const picFace = new THREE.Mesh(new THREE.PlaneGeometry(1.68, 2.1), new THREE.MeshBasicMaterial({ map: picTex, color: 0xffffff }));
picFace.position.z = .08; pic.add(picFace);

// 地毯
const rug = new THREE.Mesh(new THREE.CircleGeometry(3.5, 56), std(0xf28c7d, 1));
rug.rotation.x = -Math.PI / 2; rug.position.set(0, .012, .4); rug.receiveShadow = true; scene.add(rug);
const rug2 = new THREE.Mesh(new THREE.RingGeometry(2.55, 2.85, 56), std(0xfff0d6, 1));
rug2.rotation.x = -Math.PI / 2; rug2.position.set(0, .016, .4); scene.add(rug2);
const rug3 = new THREE.Mesh(new THREE.CircleGeometry(2.4, 56), std(0xf7a99c, 1));
rug3.rotation.x = -Math.PI / 2; rug3.position.set(0, .014, .4); scene.add(rug3);

// 盆栽
const plant = new THREE.Group(); plant.position.set(4.3, 0, -1.3); scene.add(plant);
const pot = new THREE.Mesh(new THREE.CylinderGeometry(.6, .45, .9, 20), std(0xc8693f)); pot.position.y = .45; pot.castShadow = true; plant.add(pot);
for (let i = 0; i < 6; i++) {
  const l = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), std(i % 2 ? 0x5fae5a : 0x79c26b));
  const a = i / 6 * Math.PI * 2;
  l.scale.set(.22, .8, .1); l.position.set(Math.cos(a) * .3, 1.5, Math.sin(a) * .2);
  l.rotation.z = -Math.cos(a) * .55; l.rotation.x = Math.sin(a) * .4; l.castShadow = true; plant.add(l);
}

// 脚底阴影
const blobTex = canvasTex(128, 128, (g, w, h) => {
  const r = g.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2);
  r.addColorStop(0, 'rgba(60,30,10,.5)'); r.addColorStop(1, 'rgba(60,30,10,0)');
  g.fillStyle = r; g.fillRect(0, 0, w, h);
});
const blob = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 3.4), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }));
blob.rotation.x = -Math.PI / 2; blob.position.set(0, .03, .2); scene.add(blob);

// ---------------------------------------------------------------- 猫（全部用基础几何体拼装）
const FURS = [
  { body: 0x8fa2ba, dark: 0x6b7d97, light: 0xf4f6fa, ear: 0xf2a7b5 },
  { body: 0xf2a24c, dark: 0xc97622, light: 0xfff0dc, ear: 0xf5a3a3 },
  { body: 0xf6f3ee, dark: 0xd9d0c3, light: 0xffffff, ear: 0xf7b6c2 },
  { body: 0x55505c, dark: 0x37333d, light: 0xc9c3d0, ear: 0xd98ba0 }
];
const M = {
  body: std(FURS[0].body), dark: std(FURS[0].dark), light: std(FURS[0].light), ear: std(FURS[0].ear),
  nose: std(0xff8fa3, .5), white: std(0xffffff, .4), black: new THREE.MeshStandardMaterial({ color: 0x1b1b22, roughness: .3 }),
  mouth: new THREE.MeshBasicMaterial({ color: 0x4a1620 }), tongue: std(0xff7b8f, .6),
  line: new THREE.MeshBasicMaterial({ color: 0x3a2a30 }), whisker: new THREE.MeshBasicMaterial({ color: 0xffffff })
};
function setFur(i) {
  const f = FURS[i % FURS.length];
  M.body.color.setHex(f.body); M.dark.color.setHex(f.dark); M.light.color.setHex(f.light); M.ear.color.setHex(f.ear);
}
setFur(D.fur);

const SPH = new THREE.SphereGeometry(1, 36, 24);
const sph = (r, m, sx = 1, sy = 1, sz = 1) => { const o = new THREE.Mesh(SPH, m); o.scale.set(r * sx, r * sy, r * sz); return o; };
const hits = [];
function part(mesh, zone, parent) {
  mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.zone = zone; hits.push(mesh);
  parent.add(mesh); return mesh;
}

const cat = new THREE.Group(); scene.add(cat);
const torso = new THREE.Group(); cat.add(torso);

// 身体 + 肚皮
part(Object.assign(sph(1.15, M.body, 1, 1.12, .95), {}), 'belly', torso).position.set(0, 1.32, 0);
{ const bl = part(sph(.85, M.light, 1, 1.08, .6), 'belly', torso); bl.position.set(0, 1.2, .6); bl.receiveShadow = false; }
// 后腿（坐姿）
for (const s of [-1, 1]) part(sph(.72, M.body, 1, .85, 1.15), 'foot', torso).position.set(s * .95, .62, .15);
// 前脚
const feet = [];
for (const s of [-1, 1]) {
  const g = new THREE.Group(); g.position.set(s * .55, 0, .98); cat.add(g);
  part(sph(.42, M.body, 1, .55, 1.35), 'foot', g).position.set(0, .23, 0);
  part(sph(.34, M.light, 1.05, .6, .85), 'foot', g).position.set(0, .2, .42);
  feet.push(g);
}
// 手臂
function makeArm(s) {
  const g = new THREE.Group(); g.position.set(s * 1.0, 2.0, .28); torso.add(g);
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(.27, .7, 6, 14), M.body); m.position.y = -.5; part(m, 'arm', g);
  const hand = new THREE.Group(); hand.position.y = -1.02; g.add(hand);
  part(sph(.31, M.light), 'arm', hand);
  return { g, hand };
}
const armL = makeArm(-1), armR = makeArm(1);

// 头
const headP = new THREE.Group(); headP.position.set(0, 2.35, .12); torso.add(headP);
const head = new THREE.Group(); head.position.y = .72; headP.add(head);
part(sph(1, M.body, 1.25, 1, 1.08), 'head', head);
for (const s of [-1, 1]) part(sph(.5, M.body, 1, .8, .8), 'head', head).position.set(s * .95, -.3, .35);
for (const s of [-1, 1]) part(sph(.33, M.light, 1, .85, .8), 'head', head).position.set(s * .25, -.37, .86);
part(sph(.22, M.light, 1.2, .7, .8), 'head', head).position.set(0, -.66, .78);
part(sph(.12, M.nose, 1.35, .9, .9), 'head', head).position.set(0, -.17, 1.07);
// 额头花纹
[[-.28, .8, .26], [0, .86, 0], [.28, .8, -.26]].forEach(([x, y, r]) => {
  const st = sph(.1, M.dark, .6, 2.3, .35); st.position.set(x, y, .58); st.rotation.set(-.95, 0, r);
  part(st, 'head', head);
});
// 眼睛
function makeEye(s) {
  const g = new THREE.Group(); g.position.set(s * .5, .2, .88); head.add(g);
  const ball = part(sph(.3, M.white, 1, 1.1, .75), 'head', g);
  const pupil = new THREE.Group(); pupil.position.z = .19; g.add(pupil);
  pupil.add(sph(.17, M.black, 1, 1.15, .55));
  const hi = sph(.055, M.white); hi.position.set(.06, .08, .1); pupil.add(hi);
  return { g, pupil, ball };
}
const eyeL = makeEye(-1), eyeR = makeEye(1);
// 耳朵
function makeEar(s) {
  const g = new THREE.Group(); g.position.set(s * .78, .8, .02); head.add(g);
  const c = new THREE.Mesh(new THREE.ConeGeometry(.5, 1.05, 22), M.body); c.position.y = .5; c.scale.z = .55; part(c, 'head', g);
  const inn = new THREE.Mesh(new THREE.ConeGeometry(.3, .72, 20), M.ear); inn.position.set(0, .4, .11); inn.scale.z = .5; g.add(inn);
  return g;
}
const earL = makeEar(-1), earR = makeEar(1);
// 胡须
for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
  const g = new THREE.Group(); g.position.set(s * .5, -.36 - (i - 1) * .05, .98); g.rotation.z = s * (i - 1) * -.2 + s * .03; head.add(g);
  const w = new THREE.Mesh(new THREE.CylinderGeometry(.012, .006, 1.05, 5), M.whisker);
  w.rotation.z = Math.PI / 2; w.position.x = s * .52; g.add(w);
}
// 嘴：微笑 + 张嘴
const smile = new THREE.Group(); smile.position.set(0, -.36, 1.08); head.add(smile);
for (const s of [-1, 1]) {
  const a = new THREE.Mesh(new THREE.TorusGeometry(.11, .018, 8, 20, Math.PI), M.line);
  a.rotation.z = Math.PI; a.position.x = s * .11; smile.add(a);
}
const mouthM = sph(1, M.mouth); mouthM.position.set(0, -.5, .98); head.add(mouthM);
const tongueM = sph(1, M.tongue, .16, .06, .12); tongueM.position.set(0, -.58, 1.0); head.add(tongueM);

// 尾巴：一串嵌套关节
const tailBase = new THREE.Group(); tailBase.position.set(.62, .5, -.82); cat.add(tailBase);
const tail = []; {
  const N = 9, L = .34; let par = tailBase;
  for (let i = 0; i < N; i++) {
    const g = new THREE.Group(); if (i) g.position.y = L; par.add(g);
    const mat = i >= N - 2 ? M.light : (i % 2 ? M.dark : M.body);
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(.2 - i * .008, L, 4, 10), mat);
    m.position.y = L / 2; part(m, 'tail', g); tail.push(g); par = g;
  }
}

// ---- 道具：牛奶杯 / 小鱼 / 皮球
const glass = new THREE.Group(); glass.visible = false; armR.hand.add(glass);
{
  const gm = new THREE.Mesh(new THREE.CylinderGeometry(.34, .28, .9, 22, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xe3f4ff, transparent: true, opacity: .38, roughness: .1, side: THREE.DoubleSide }));
  glass.add(gm); glass.scale.setScalar(1.2);
  const mg = new THREE.CylinderGeometry(.31, .27, .8, 22); mg.translate(0, .4, 0);
  var milk = new THREE.Mesh(mg, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .5, emissive: 0x555555 }));
  milk.position.y = -.42; glass.add(milk);
}
const fish = new THREE.Group(); fish.visible = false; armR.hand.add(fish); const FISH_S = 1.35;
{
  const fb = sph(.5, std(0x6cb6ee, .5), 1.5, .72, .6); fish.add(fb);
  const fbl = sph(.42, std(0xd8f0ff, .5), 1.3, .5, .55); fbl.position.set(.05, -.14, .05); fish.add(fbl);
  const ft = new THREE.Mesh(new THREE.ConeGeometry(.42, .6, 4), std(0x4f9ad6, .6)); ft.rotation.z = Math.PI / 2; ft.position.x = -.95; ft.scale.z = .3; fish.add(ft);
  const fe = sph(.07, M.black); fe.position.set(.5, .12, .3); fish.add(fe);
}
const ball = new THREE.Group(); ball.visible = false; scene.add(ball);
{
  const b = sph(.42, std(0xffd23f, .6)); b.castShadow = true; ball.add(b);
  const r1 = new THREE.Mesh(new THREE.TorusGeometry(.42, .035, 8, 32), std(0xe8552d, .6)); ball.add(r1);
  const r2 = r1.clone(); r2.rotation.y = Math.PI / 2; ball.add(r2);
}
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3();
function keepUpright(obj, ex = 0, ey = 0, ez = 0, ox = 0, oy = 0, oz = 0) {
  obj.parent.getWorldQuaternion(_q).invert();
  obj.position.set(ox, oy, oz).applyQuaternion(_q);
  _q2.setFromEuler(_e.set(ex, ey, ez));
  obj.quaternion.copy(_q).multiply(_q2);
}

// ---------------------------------------------------------------- 弹簧
class Spring {
  constructor(k = 120, d = 9, x = 0) { this.k = k; this.d = d; this.x = x; this.v = 0; this.t = x; }
  step(dt) {
    const n = Math.max(1, Math.ceil(dt / .008)), h = dt / n;
    for (let i = 0; i < n; i++) { this.v += (this.t - this.x) * this.k * h; this.v *= Math.exp(-this.d * h); this.x += this.v * h; }
    return this.x;
  }
  kick(v) { this.v += v; }
}
const sp = {
  squash: new Spring(170, 8), tilt: new Spring(90, 8), nod: new Spring(100, 8), turn: new Spring(80, 9),
  lean: new Spring(90, 7), hop: new Spring(230, 9),
  aLx: new Spring(110, 10), aLz: new Spring(110, 10, -.16), aRx: new Spring(110, 10), aRz: new Spring(110, 10, .16),
  mouth: new Spring(320, 24), eye: new Spring(220, 22, 1), blink: new Spring(700, 45, 1),
  earL: new Spring(220, 14), earR: new Spring(220, 14), whip: new Spring(70, 4)
};

// ---------------------------------------------------------------- 运行时状态
const C = {
  mode: 'idle', t: 0, started: false, petting: 0, night: 0, nightT: 0,
  blinkIn: 2, blinkOut: 0, idleT: 6, callT: 16, purrT: 0, zT: 0, statT: 0, saveT: 0, hudT: 0,
  wander: 0, wanderX: 0, wanderY: 0, taps: [], bites: 0, milkDrunk: 0, swatCd: 0, ballLife: 0,
  meowN: 0, meowFired: 0, pulse: 0, lastPokeAt: 0, bondCd: 0, sayUntil: 0, phase: 0
};
const look = { x: 0, y: 0, tx: 0, ty: 0, moveAt: -99 };
const ballV = new THREE.Vector3();

function setMode(m) {
  C.mode = m; C.t = 0; C.bites = 0; C.milkDrunk = 0; C.phase = 0;
  glass.visible = m === 'drink'; fish.visible = m === 'eat';
  if (m !== 'play') { ball.visible = false; }
  C.nightT = m === 'sleep' ? 1 : 0;
  refreshSleepLabel();
  updateActs();
}

// ---------------------------------------------------------------- 提示 / 飘字
const bubble = $('bubble'), fxLayer = $('fx-layer');
const headW = new THREE.Vector3();
function toScreen(v) {
  _v.copy(v).project(camera);
  return { x: (_v.x * .5 + .5) * frame.clientWidth, y: (-_v.y * .5 + .5) * frame.clientHeight };
}
function say(text, ms = 2400) {
  if (!text) return;
  bubble.textContent = text; bubble.classList.remove('hidden');
  bubble.style.animation = 'none'; void bubble.offsetWidth; bubble.style.animation = '';
  C.sayUntil = performance.now() + ms;
}
function fx(txt, pos, o = {}) {
  if (fxLayer.childElementCount > 26) return;
  const p = toScreen(pos), d = document.createElement('div');
  d.className = 'fx'; d.textContent = txt;
  d.style.left = p.x + 'px'; d.style.top = p.y + 'px';
  d.style.setProperty('--dx', (o.dx !== undefined ? o.dx : rnd(-26, 26)) + 'px');
  d.style.setProperty('--d', (o.d || 1.4) + 's');
  if (o.size) d.style.fontSize = o.size + 'px';
  fxLayer.appendChild(d);
  setTimeout(() => d.remove(), (o.d || 1.4) * 1000 + 100);
}
function fxHead(txt, o) { head.getWorldPosition(headW); fx(txt, headW.clone().add(new THREE.Vector3(rnd(-.7, .7), rnd(.6, 1.2), .8)), o); }

function addBond(n) {
  const before = level(D.bond); D.bond += n;
  const after = level(D.bond);
  if (after > before) { sfx.level(); say(T('sayLevelUp', after), 3000); for (let i = 0; i < 4; i++) setTimeout(() => fxHead('🎉', { d: 1.8 }), i * 120); }
  refreshBond();
}
const addStat = (k, n) => { D[k] = clamp(D[k] + n, 0, 100); };

// ---------------------------------------------------------------- 互动：戳 / 摸
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function pointerNDC(e) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  return ndc;
}
function pickZone(e) {
  ray.setFromCamera(pointerNDC(e), camera);
  const h = ray.intersectObjects(hits, false)[0];
  return h ? h.object.userData.zone : null;
}
function setLook(e) {
  const n = pointerNDC(e);
  look.tx = clamp(n.x, -1, 1); look.ty = clamp(n.y, -1, 1); look.moveAt = performance.now() / 1000;
}
function poke(zone) {
  if (!C.started) return;
  if (C.mode === 'sleep') return wake();
  if (C.mode !== 'idle' && C.mode !== 'play') return;
  const now = performance.now() / 1000;
  C.taps = C.taps.filter(t => now - t < 1.6); C.taps.push(now);
  if (C.taps.length >= 6) { C.taps.length = 0; return annoyed(); }
  if (now - C.lastPokeAt > .35) { addBond(.6); addStat('mood', 1.2); }
  C.lastPokeAt = now;
  const sign = Math.random() < .5 ? -1 : 1;
  if (zone === 'head') {
    sp.nod.kick(4); sp.tilt.kick(sign * 5); sp.squash.kick(1.4); sp.earL.kick(-9); sp.earR.kick(9);
    C.pulse = .5; sfx.ouch();
    if (Math.random() < .55) say(pick(T('sayPoke')), 1600);
    fxHead('💫', { d: 1 });
  } else if (zone === 'belly') {
    sp.squash.kick(7); C.pulse = 1.6; sfx.giggle();
    sp.aLx.kick(-6); sp.aRx.kick(-6); sp.tilt.kick(sign * 3);
    if (Math.random() < .6) say(pick(T('sayBelly')), 1800);
    fxHead('😆', { d: 1.1 });
  } else if (zone === 'tail') {
    sp.whip.kick(sign * 22); sp.hop.kick(4.5); sp.turn.kick(sign * 4); sfx.tail();
    C.pulse = .9;
    if (Math.random() < .7) say(pick(T('sayTail')), 1800);
    fxHead('❗', { d: 1 });
  } else if (zone === 'foot') {
    sp.hop.kick(8.5); sp.squash.kick(-1.5); sfx.happy();
    if (Math.random() < .5) say(pick(T('sayFoot')), 1600);
  } else if (zone === 'arm') {
    sp[Math.random() < .5 ? 'aLx' : 'aRx'].kick(-11); sfx.happy(); sp.tilt.kick(sign * 3);
  }
}
function annoyed() {
  setMode('annoyed'); sfx.low(); say(pick(T('sayAnnoyed')), 2200); addStat('mood', -6); fxHead('💢', { d: 1.3 });
}
function wake() {
  say(T('sayWake'), 2000); setMode('yawn'); sfx.yawn();
}
const ptr = { down: false, zone: null, moved: 0, lx: 0, ly: 0 };
canvas.addEventListener('pointerdown', e => {
  audio();
  ptr.down = true; ptr.zone = pickZone(e); ptr.moved = 0; ptr.lx = e.clientX; ptr.ly = e.clientY;
  try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  setLook(e);
});
canvas.addEventListener('pointermove', e => {
  setLook(e);
  if (!ptr.down) return;
  const d = Math.hypot(e.clientX - ptr.lx, e.clientY - ptr.ly);
  ptr.lx = e.clientX; ptr.ly = e.clientY; ptr.moved += d;
  const petZone = ptr.zone === 'head' || ptr.zone === 'belly' || ptr.zone === 'arm';
  if (petZone && ptr.moved > 24 && C.started && (C.mode === 'idle' || C.mode === 'play')) C.petting = Math.min(1, C.petting + d * .009);
});
const endPtr = e => {
  if (!ptr.down) return;
  ptr.down = false;
  if (ptr.moved < 10 && ptr.zone) poke(ptr.zone);
};
canvas.addEventListener('pointerup', endPtr);
canvas.addEventListener('pointercancel', () => { ptr.down = false; });
canvas.addEventListener('pointerleave', () => { if (!ptr.down) { look.tx = 0; look.ty = 0; } });

// ---------------------------------------------------------------- 动作：喂食 / 玩球 / 睡觉 / 说话
const BUSY = ['drink', 'eat', 'listen', 'talk', 'yawn', 'greet', 'annoyed', 'refuse', 'meow'];
function doAct(name) {
  if (!C.started) return;
  audio();
  if (name === 'color') {
    D.fur = (D.fur + 1) % FURS.length; setFur(D.fur); sp.squash.kick(3); sfx.happy(); say(T('sayColor'), 1800); fxHead('✨', { d: 1.2 });
    return;
  }
  if (name === 'sleep') {
    if (C.mode === 'sleep') return wake();
    if (C.mode !== 'idle' && C.mode !== 'play') return;
    setMode('sleep'); say(T('saySleep'), 2200); sfx.sleepy(); return;
  }
  if (C.mode === 'sleep') return wake();
  if (name === 'talk') {
    if (C.mode === 'listen') return cancelListen();
    if (C.mode !== 'idle' && C.mode !== 'play') return;
    return startListen();
  }
  if (C.mode !== 'idle') { if (!(name === 'ball' && C.mode === 'play')) return; }
  if (name === 'milk' || name === 'fish') {
    if (D.hunger > 95) { setMode('refuse'); say(T('sayFull'), 1800); return; }
    setMode(name === 'milk' ? 'drink' : 'eat');
    say(T(name === 'milk' ? 'sayMilk' : 'sayFish'), 2200); sfx.happy();
    milk.scale.y = 1; fish.scale.setScalar(FISH_S);
  } else if (name === 'ball') {
    if (C.mode === 'play') { C.ballLife = 99; return; }
    setMode('play'); C.ballLife = 0; ball.visible = true; ball.scale.setScalar(1);
    ball.position.set(-2.2, 5.6, 1.7); ballV.set(1.4, 0, .2);
    say(T('sayBall'), 2000); sfx.happy();
  }
}
document.querySelectorAll('.act').forEach(b => b.addEventListener('click', () => doAct(b.dataset.act)));
function updateActs() {
  const busy = BUSY.includes(C.mode), sleeping = C.mode === 'sleep';
  document.querySelectorAll('.act').forEach(b => {
    const a = b.dataset.act;
    b.classList.toggle('on', (a === 'sleep' && sleeping) || (a === 'ball' && C.mode === 'play') ||
      (a === 'talk' && (C.mode === 'listen' || C.mode === 'talk')) || (a === 'milk' && C.mode === 'drink') || (a === 'fish' && C.mode === 'eat'));
    const off = a === 'color' ? false : sleeping ? a !== 'sleep' : busy && !(a === 'talk' && C.mode === 'listen');
    b.classList.toggle('disabled', off);
  });
}

// ---- 麦克风学舌
let mic = null, micLevel = 0, voice = null, listenToken = 0;
function stopMic() {
  if (!mic) return;
  try { mic.proc.onaudioprocess = null; mic.src.disconnect(); mic.proc.disconnect(); mic.sink.disconnect(); } catch (_) {}
  try { mic.stream.getTracks().forEach(t => t.stop()); } catch (_) {}
  mic = null; micLevel = 0; $('mic-ind').classList.add('hidden');
}
function meowSeq(n) {
  setMode('meow'); C.meowN = n; C.meowFired = -1;
}
async function startListen() {
  const c = audio();
  if (!c || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { say(T('sayNoMic'), 2600); return meowSeq(3); }
  setMode('listen'); say(T('sayListen'), 2000);
  const token = ++listenToken;
  let stream;
  try {
    stream = await Promise.race([
      navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 15000))
    ]);
  } catch (e) {
    if (token === listenToken && C.mode === 'listen') { setMode('idle'); say(T('sayMicDeny'), 3600); meowSeq(2); }
    return;
  }
  if (token !== listenToken || C.mode !== 'listen') { stream.getTracks().forEach(t => t.stop()); return; }
  const src = c.createMediaStreamSource(stream), proc = c.createScriptProcessor(2048, 1, 1), sink = c.createGain();
  sink.gain.value = 0;
  const st = { stream, src, proc, sink, chunks: [], pre: [], speaking: false, silent: 0, waited: 0, noise: 0, cal: 0, total: 0, done: false };
  proc.onaudioprocess = ev => onMicChunk(st, ev.inputBuffer.getChannelData(0));
  src.connect(proc); proc.connect(sink); sink.connect(c.destination);
  mic = st; $('mic-ind').classList.remove('hidden');
}
function cancelListen() { listenToken++; stopMic(); setMode('idle'); }
function onMicChunk(st, d) {
  if (st.done) return;
  const dur = d.length / actx.sampleRate;
  let s = 0; for (let i = 0; i < d.length; i++) s += d[i] * d[i];
  const rms = Math.sqrt(s / d.length); micLevel = rms;
  st.cal += dur;
  if (st.cal < .35) { st.noise = Math.max(st.noise, rms); return; }
  const th = Math.max(.02, st.noise * 2.6), chunk = new Float32Array(d);
  if (!st.speaking) {
    st.pre.push(chunk); if (st.pre.length > 3) st.pre.shift();
    st.waited += dur;
    if (rms > th) { st.speaking = true; st.chunks = st.pre.slice(); st.total = st.chunks.reduce((a, b) => a + b.length, 0); st.silent = 0; }
    else if (st.waited > 9) finishMic(st, false);
    return;
  }
  st.chunks.push(chunk); st.total += chunk.length;
  if (rms > th) st.silent = 0; else st.silent += dur;
  if (st.silent > .75 || st.total / actx.sampleRate > 6) finishMic(st, true);
}
function finishMic(st, ok) {
  st.done = true;
  const dur = 2048 / actx.sampleRate;
  const chunks = st.chunks.slice(0, Math.max(1, st.chunks.length - Math.max(0, Math.floor(st.silent / dur) - 1)));
  setTimeout(() => {
    stopMic();
    const len = chunks.reduce((a, b) => a + b.length, 0);
    if (!ok || len / actx.sampleRate < .2) { setMode('idle'); say(T('sayNoVoice'), 1800); return; }
    playVoice(chunks, len);
  }, 0);
}
function playVoice(chunks, len) {
  const c = audio(), ab = c.createBuffer(1, len, c.sampleRate), ch = ab.getChannelData(0);
  let o = 0, peak = 0;
  for (const k of chunks) { ch.set(k, o); o += k.length; }
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(ch[i]));
  const src = c.createBufferSource(), g = c.createGain(), an = c.createAnalyser();
  an.fftSize = 512;
  src.buffer = ab; src.playbackRate.value = 1.85; g.gain.value = peak > 0 ? Math.min(4, .8 / peak) : 1;
  src.connect(an); src.connect(g); g.connect(master);
  voice = { an, data: new Uint8Array(an.fftSize), level: 0 };
  setMode('talk');
  src.onended = () => {
    voice = null;
    if (C.mode === 'talk') { setMode('idle'); addBond(3); addStat('mood', 6); for (let i = 0; i < 3; i++) setTimeout(() => fxHead('💖'), i * 150); }
  };
  src.start();
}

// ---------------------------------------------------------------- 每帧：行为 + 姿态
const qs = document.querySelectorAll('.stat');
function statsTick(dt) {
  if (!C.started) return;
  if (C.mode === 'sleep') {
    D.energy = clamp(D.energy + dt * 1.15, 0, 100); D.hunger = clamp(D.hunger - dt * .04, 0, 100);
    if (D.energy >= 100) wake();
  } else {
    D.hunger = clamp(D.hunger - dt * .1, 0, 100);
    D.mood = clamp(D.mood - dt * (D.hunger < 25 ? .13 : .06), 0, 100);
    D.energy = clamp(D.energy - dt * .04, 0, 100);
  }
}
function idleBehavior(dt) {
  C.idleT -= dt;
  if (C.idleT > 0) return;
  C.idleT = rnd(5, 10);
  const r = Math.random();
  if (r < .4) { C.wander = 1.8; C.wanderX = rnd(-.8, .8); C.wanderY = rnd(-.3, .5); }
  else if (r < .6) { sp.earL.kick(-10); sp.earR.kick(10); }
  else if (r < .8) sp.whip.kick(rnd(-12, 12));
  else if (D.energy < 35) { setMode('yawn'); sfx.yawn(); }
  else if (D.mood > 60) { sp.tilt.kick(rnd(-3, 3)); sfx.happy(); }
}
function callouts(dt) {
  C.callT -= dt;
  if (C.callT > 0 || C.mode !== 'idle') return;
  C.callT = rnd(15, 24);
  if (D.hunger < 30) { say(pick(T('sayHungry')), 2800); sfx.tummy(); sp.squash.kick(1.5); }
  else if (D.mood < 32) { say(pick(T('saySad')), 2800); sfx.low(); }
  else if (D.energy < 25) { say(pick(T('saySleepy')), 2600); }
}

const tmpV = new THREE.Vector3();
function ballScreenLook() {
  tmpV.copy(ball.position).project(camera);
  look.tx = clamp(tmpV.x, -1, 1); look.ty = clamp(tmpV.y, -1, 1);
}
function updateCat(dt, time) {
  C.t += dt;
  const sad = clamp((45 - Math.min(D.mood, D.hunger)) / 45, 0, 1);
  const sleepy = clamp((28 - D.energy) / 28, 0, 1);
  let eyeT = 1 - .35 * sleepy, mouthT = C.pulse, nodT = .04 + sad * .2 + sleepy * .12, tiltT = 0, turnT = null,
    earT = sad * .5, aLx = 0, aLz = -.16, aRx = 0, aRz = .16, leanT = 0, pupil = 1, breath = 1;
  const t = C.t;
  C.pulse = Math.max(0, C.pulse - dt * 2.6);

  switch (C.mode) {
    case 'sleep':
      eyeT = .05; nodT = .5; tiltT = .24; earT = .28; aLz = -.08; aRz = .08; breath = 2.2;
      C.zT -= dt;
      if (C.zT <= 0) { C.zT = 1.7; fxHead('💤', { d: 2.2, dx: 30 }); if (Math.random() < .5) sfx.sleepy(); }
      break;
    case 'drink': {
      const up = easeIO(seg(t, 0, .7)) * (1 - easeIO(seg(t, 3.7, 4.4)));
      const tilt = easeIO(seg(t, .8, 1.5)) * (1 - easeIO(seg(t, 3.2, 3.7)));
      aRx = -2.0 * up; aRz = lerp(.16, -.9, up);
      nodT = -.05 - .28 * tilt; eyeT = 1 - .45 * tilt;
      keepUpright(glass, -tilt * 1.0, 0, 0, 0, .38, .3);
      milk.scale.y = 1 - .84 * seg(t, .9, 3.3);
      if (t > .9 && t < 3.3) {
        mouthT = .1 + .1 * Math.abs(Math.sin(t * 9));
        const k = Math.floor((t - .9) / .5);
        if (k > C.milkDrunk) { C.milkDrunk = k; sfx.gulp(); sp.squash.kick(.8); }
        addStat('hunger', dt * 12.5);
      } else if (t > 3.8) mouthT = .45 * Math.abs(Math.sin((t - 3.8) * 12));
      if (t >= 4.4) { setMode('idle'); say(T('sayYum'), 2000); addBond(2); addStat('mood', 5); fxHead('😋'); }
      break;
    }
    case 'eat': {
      const up = easeIO(seg(t, 0, .7)) * (1 - easeIO(seg(t, 3.9, 4.6)));
      aRx = -2.0 * up; aRz = lerp(.16, -.9, up);
      keepUpright(fish, 0, 0, Math.PI / 2 + Math.sin(t * 3) * .05, 0, .5, .35);
      if (t > 1.0 && t < 4.1) {
        mouthT = .28 + .32 * Math.abs(Math.sin((t - 1) * 9));
        addStat('hunger', dt * 14);
        const k = Math.floor((t - 1.0) / .75);
        if (k > C.bites - 1 && k < 5) { C.bites = k + 1; sfx.munch(); sp.nod.kick(2.5); sp.squash.kick(.9); }
      }
      fish.scale.setScalar(FISH_S * Math.max(.001, 1 - .24 * Math.min(4, C.bites)) * (1 - seg(t, 3.9, 4.2)));
      if (t >= 4.6) { setMode('idle'); say(T('sayYum'), 2000); addBond(2); addStat('mood', 6); fxHead('😋'); }
      break;
    }
    case 'listen':
      eyeT = 1.18; earT = -.3; leanT = -.04; tiltT = .2 * Math.sin(t * 1.5); pupil = 1.25; nodT = -.02;
      break;
    case 'talk': {
      if (voice) {
        voice.an.getByteTimeDomainData(voice.data);
        let s = 0; for (let i = 0; i < voice.data.length; i++) { const v = (voice.data[i] - 128) / 128; s += v * v; }
        const lv = Math.sqrt(s / voice.data.length);
        if (lv > voice.level + .05) sp.nod.kick(1.6);
        voice.level = lerp(voice.level, lv, .5);
        mouthT = clamp(voice.level * 7, 0, 1);
      }
      earT = -.2; eyeT = 1.1; aRx = -.5 + Math.sin(t * 6) * .2; aLx = -.5 + Math.cos(t * 6) * .2; tiltT = .15 * Math.sin(t * 3);
      break;
    }
    case 'meow': {
      const k = Math.floor(t / .62);
      if (k > C.meowFired && k < C.meowN) { C.meowFired = k; sfx.hi(); sp.nod.kick(3); }
      const ph = (t % .62) / .62;
      mouthT = ph < .8 ? .6 + .3 * Math.sin(ph * 3.6) : 0;
      if (t >= C.meowN * .62 + .2) setMode('idle');
      break;
    }
    case 'yawn': {
      const up = Math.sin(clamp(t / 1.8, 0, 1) * Math.PI);
      aLx = aRx = -2.5 * up; aLz = -.7 * up - .1; aRz = .7 * up + .1;
      mouthT = .95 * up; eyeT = 1 - .9 * up; nodT = -.32 * up; earT = .1;
      if (t >= 1.8) setMode('idle');
      break;
    }
    case 'greet': {
      const up = easeIO(seg(t, 0, .3)) * (1 - easeIO(seg(t, 1.5, 1.9)));
      aRx = -2.7 * up; aRz = -.2 * up + Math.sin(t * 13) * .4 * up + .16 * (1 - up);
      mouthT = t < .7 ? .55 : 0; eyeT = 1.1; earT = -.1; nodT = -.03;
      if (t >= 1.9) setMode('idle');
      break;
    }
    case 'annoyed':
      turnT = Math.sin(t * 22) * .35 * (1 - seg(t, .8, 1.4)); eyeT = .45; earT = .5; mouthT = .05; leanT = 0;
      if (t >= 1.5) setMode('idle');
      break;
    case 'refuse':
      turnT = Math.sin(t * 16) * .45 * (1 - seg(t, .5, 1.0)); eyeT = .8;
      if (t >= 1.1) setMode('idle');
      break;
    case 'play': {
      C.ballLife += dt;
      const P = ball.position;
      ballV.y -= 17 * dt; P.addScaledVector(ballV, dt);
      if (P.y < .42) { P.y = .42; if (ballV.y < -1.2) { ballV.y *= -.74; sfx.pop(Math.min(6, -ballV.y)); } else ballV.y = 0; ballV.x *= .985; ballV.z *= .985; }
      if (P.x < -2.5 || P.x > 2.5) { ballV.x *= -1; P.x = clamp(P.x, -2.5, 2.5); }
      if (P.z < .5 || P.z > 3.6) { ballV.z *= -1; P.z = clamp(P.z, .5, 3.6); }
      ball.rotation.x += ballV.z * dt * 2; ball.rotation.z -= ballV.x * dt * 2;
      C.swatCd -= dt;
      const dx = P.x, dz = P.z - .9;
      if (C.swatCd <= 0 && Math.hypot(dx, dz) < 2.3 && P.y < 3.2 && ballV.y < 1) {
        C.swatCd = .55; const right = dx >= 0;
        sp[right ? 'aRx' : 'aLx'].kick(-22); sp.hop.kick(4); sp.nod.kick(2.5); sfx.swat();
        ballV.set(-dx * 1.4 + rnd(-1.6, 1.6), rnd(6.5, 8.5), rnd(1, 3));
        addStat('mood', 1.8); addStat('energy', -.7);
        if (Math.random() < .3) fxHead('🎾', { d: 1 });
      }
      ballScreenLook(); eyeT = 1.08; pupil = 1.2;
      if (t > 1.5) addBond(dt * .12);
      if (C.ballLife > 9) {
        const s = 1 - seg(C.ballLife, 9, 9.5); ball.scale.setScalar(Math.max(.001, s));
        if (s <= 0) { setMode('idle'); say(T('sayGoodBall'), 2200); addBond(2); fxHead('💖'); }
      }
      break;
    }
    default: break;
  }

  // 抚摸
  if (C.petting > .04) {
    eyeT = lerp(eyeT, .2, C.petting); nodT += .14 * C.petting; tiltT += .14 * C.petting * Math.sin(time * 2.4);
    addStat('mood', dt * 4.5 * C.petting);
    C.bondCd -= dt;
    if (C.petting > .3) {
      if (!purr.on) purr.start();
      C.purrT -= dt;
      if (C.purrT <= 0) { C.purrT = .55; fxHead('❤️', { d: 1.5 }); addBond(.35); if (Math.random() < .35) say(pick(T('sayPet')), 1800); }
    }
    C.petting *= Math.exp(-dt * 1.7);
  } else if (purr.on) purr.stop();

  // 眨眼
  C.blinkIn -= dt;
  if (C.blinkIn <= 0 && C.mode !== 'sleep') { sp.blink.t = .05; C.blinkOut = .12; C.blinkIn = rnd(2, 5.5); }
  if (C.blinkOut > 0) { C.blinkOut -= dt; if (C.blinkOut <= 0) sp.blink.t = 1; }

  // 视线
  const nowS = performance.now() / 1000;
  if (C.mode === 'sleep') { look.tx = look.ty = 0; }
  else if (C.mode !== 'play') {
    if (C.wander > 0) { C.wander -= dt; look.tx = C.wanderX; look.ty = C.wanderY; }
    else if (nowS - look.moveAt > 3.5) { look.tx = look.ty = 0; }
  }
  look.x = lerp(look.x, look.tx, 1 - Math.exp(-dt * 7)); look.y = lerp(look.y, look.ty, 1 - Math.exp(-dt * 7));

  // ---- 应用到弹簧目标
  sp.eye.t = eyeT; sp.mouth.t = mouthT;
  sp.nod.t = nodT; sp.tilt.t = tiltT; sp.turn.t = turnT !== null ? turnT : look.x * .42;
  sp.lean.t = leanT; sp.aLx.t = aLx; sp.aLz.t = aLz; sp.aRx.t = aRx; sp.aRz.t = aRz;

  const squash = sp.squash.step(dt), tilt = sp.tilt.step(dt), nod = sp.nod.step(dt), turn = sp.turn.step(dt),
    lean = sp.lean.step(dt), hop = sp.hop.step(dt), eye = sp.eye.step(dt), blink = sp.blink.step(dt), mouth = sp.mouth.step(dt),
    eL = sp.earL.step(dt), eR = sp.earR.step(dt), whip = sp.whip.step(dt);
  const alx = sp.aLx.step(dt), alz = sp.aLz.step(dt), arx = sp.aRx.step(dt), arz = sp.aRz.step(dt);

  const b = Math.sin(time * (C.mode === 'sleep' ? 1.1 : 1.9)) * .012 * breath;
  torso.scale.set(1 + squash * .3 + b * .4, 1 - squash * .45 + b, 1 + squash * .3 + b * .4);
  cat.position.y = Math.max(0, hop) * .5;
  cat.rotation.z = lean;
  blob.scale.setScalar(1 - Math.min(.35, cat.position.y * .25)); blob.material.opacity = 1 - Math.min(.5, cat.position.y * .4);
  headP.rotation.set(nod - look.y * .2, turn, tilt);
  armL.g.rotation.set(alx, 0, alz); armR.g.rotation.set(arx, 0, arz);
  earL.rotation.z = .42 + earT + eL; earR.rotation.z = -(.42 + earT + eR);
  for (const f of feet) f.position.y = 0;
  if (hop > .05) { feet[0].position.y = hop * .1; feet[1].position.y = hop * .1; }

  const ey = clamp(Math.min(eye, blink), .05, 1.3);
  for (const E of [eyeL, eyeR]) {
    E.g.scale.set(1, ey, 1);
    E.pupil.position.set(clamp(look.x, -1, 1) * .1, clamp(look.y, -1, 1) * .09, .19);
    E.pupil.scale.setScalar(pupil * (1 + C.night * .25));
  }
  const mo = clamp(mouth, 0, 1.1);
  mouthM.visible = mo > .04; mouthM.scale.set(.1 + .13 * mo, .01 + .27 * mo, .14);
  tongueM.visible = mo > .28; tongueM.scale.set(.11 + .07 * mo, .04 + .09 * mo, .1);
  smile.visible = mo <= .04 && C.mode !== 'annoyed';

  const amp = .1 + .05 * (1 - sad) + Math.abs(whip) * .012;
  tailBase.rotation.z = -.95;
  tail.forEach((g, i) => {
    g.rotation.z = .17 + Math.sin(time * 2.0 - i * .55) * amp * (C.mode === 'sleep' ? .3 : 1) + whip * (i + 1) * .012;
    g.rotation.x = Math.sin(time * 1.3 - i * .4) * .04;
  });

  // 昼夜
  C.night += (C.nightT - C.night) * (1 - Math.exp(-dt * 2.4));
  const n = C.night;
  hemi.intensity = lerp(.9, .38, n); hemi.color.lerpColors(DAY.hemi, NIGHT.hemi, n);
  sun.intensity = lerp(.85, .25, n); sun.color.lerpColors(DAY.sun, NIGHT.sun, n);
  lamp.intensity = n * 1.1;
  scene.background.lerpColors(dayBg, nightBg, n);
  skyMat.color.lerpColors(daySky, nightSky, n);
  moon.visible = n > .05; stars.material.opacity = n; cloud.visible = n < .5;
}

// ---------------------------------------------------------------- HUD
function hudTick(dt) {
  C.hudT -= dt; if (C.hudT > 0) return; C.hudT = .2;
  const v = [D.hunger, D.mood, D.energy];
  qs.forEach((s, i) => { s.querySelector('u').style.width = v[i].toFixed(0) + '%'; s.classList.toggle('low', v[i] < 22); });
  if (mic) $('mic-level').style.width = clamp(micLevel * 500, 0, 100) + '%';
  if (bubble && performance.now() > C.sayUntil) bubble.classList.add('hidden');
  updateActs();
}
function placeBubble() {
  if (bubble.classList.contains('hidden')) return;
  head.getWorldPosition(headW);
  const p = toScreen(headW.clone().add(new THREE.Vector3(0, 1.75, 0)));
  bubble.style.top = clamp(p.y - 44, 62, frame.clientHeight - 200) + 'px';
}

// ---------------------------------------------------------------- 菜单 / 键盘 / 循环
function startGame() {
  audio();
  $('screen-menu').classList.add('hidden');
  $('hud').classList.remove('hidden'); $('actions').classList.remove('hidden');
  C.started = true; refreshBond();
  setMode('greet'); sfx.hi(); say(pick(T('sayHello')), 2600);
  if (D.hunger < 30) C.callT = 4;
}
$('btn-start').onclick = startGame;
window.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.code === 'KeyM') return toggleMute();
  if (!C.started) { if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); startGame(); } return; }
  const map = { Digit1: 'milk', Digit2: 'fish', Digit3: 'talk', Digit4: 'ball', Digit5: 'sleep', Digit6: 'color' };
  if (map[e.code]) doAct(map[e.code]);
  else if (e.code === 'Space') { e.preventDefault(); if (C.mode === 'idle') meowSeq(1); else if (C.mode === 'sleep') wake(); }
  else if (e.code === 'Escape') { if (C.mode === 'listen') cancelListen(); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) { save(); purr.stop(); } });

let last = performance.now();
function loop(now) {
  const dt = Math.min((now - last) / 1000, .05); last = now;
  const time = now / 1000;
  if (!document.hidden) {
    C.statT += dt; if (C.statT >= .25) { statsTick(C.statT); C.statT = 0; }
    if (C.started && (C.mode === 'idle')) { idleBehavior(dt); callouts(dt); }
    updateCat(dt, time);
    hudTick(dt);
    renderer.render(scene, camera);
    placeBubble();
  }
  C.saveT += dt; if (C.saveT > 5) { C.saveT = 0; save(); }
  requestAnimationFrame(loop);
}

ready = true;
resize();
setMode('idle');
window.__refreshLang();
requestAnimationFrame(t => { last = t; requestAnimationFrame(loop); });
window.__game = C;
window.__cat = { D, C, sp, look, scene, camera, renderer, cat, torso, headP, head, armL, armR, glass, fish, ball, doAct, poke, say, startGame, playVoice, THREE };
window.__gameErrors = [];
window.addEventListener('error', e => window.__gameErrors.push(String(e.message)));
})();
