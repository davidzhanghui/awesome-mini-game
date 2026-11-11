'use strict';
/* ================= 引擎核心 ================= */
const cv = $('#cv'), ctx = cv.getContext('2d');
let KS = 1;
const SAVE_KEY = 'mengmeng-rpg:save', OPT_KEY = 'mengmeng-rpg:opt';
const AUD = window.AMG_AUDIO || { vol: 0.8, muted: false, save() {} };   // 与全站共用的静音开关
const FRAME = $('#frame');
const PLAYER_TANK = 2; // 人物生命、防御的整体倍率
const G = {
  state: 'title', p: null, st: null, rt: null, map: null, mons: [], projs: [], drops: [], fx: [], texts: [], teles: [],
  cam: { x: 0, y: 0 }, keys: {}, mouse: { down: false, x: 0, y: 0 }, t: 0, auto: false, mute: false,
  mapCache: {}, mv: null, tgt: null, nav: { path: null, t: 0, tx: 0, ty: 0 }, stuckT: 0, shake: 0, portalT: 0, saveT: 0, pet: null, nearNpc: null, fullT: 0,
};

// 静音状态直接读写全站共享的 AMG_AUDIO（页头 🔊 按钮、M 键、系统菜单三处保持一致）
Object.defineProperty(G, 'mute', { get: () => AUD.muted, set: v => { AUD.muted = !!v; AUD.save(); if (window.__mmSyncMute) window.__mmSyncMute(); } });

function fit() {
  const s = Math.min(FRAME.clientWidth / VW, FRAME.clientHeight / VH) || 1;
  $('#wrap').style.transform = `translate(-50%,-50%) scale(${s})`;
  KS = Math.min(3, Math.max(1, s * (devicePixelRatio || 1)));
  cv.width = Math.round(VW * KS); cv.height = Math.round(VH * KS);
}

/* ---------- 音效 ---------- */
let AC = null;
const SFX = {
  atk: [520, 0.05, 'triangle', 0.03], hit: [200, 0.06, 'square', 0.03], hurt: [110, 0.12, 'sawtooth', 0.05],
  pick: [900, 0.07, 'sine', 0.05], skill: [320, 0.18, 'sawtooth', 0.04], ok: [660, 0.12, 'sine', 0.06], bad: [150, 0.2, 'square', 0.04],
};
function sfx(n) {
  if (G.mute) return;
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    const notes = n === 'lvup' ? [523, 659, 784, 1047] : null, d = SFX[n] || SFX.ok;
    (notes || [d[0]]).forEach((f, i) => {
      const o = AC.createOscillator(), g = AC.createGain(), t0 = AC.currentTime + i * 0.09, dur = notes ? 0.16 : d[1];
      o.type = notes ? 'triangle' : d[2]; o.frequency.setValueAtTime(f, t0);
      if (!notes) o.frequency.exponentialRampToValueAtTime(Math.max(40, f * 0.6), t0 + dur);
      g.gain.setValueAtTime(notes ? 0.06 : d[3], t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      o.connect(g); g.connect(AC.destination); o.start(t0); o.stop(t0 + dur + 0.02);
    });
  } catch (e) { /* 忽略 */ }
}

/* ================= 背景音乐 ================= */
// 曲目来自本地素材库，署名见 bgm/CREDITS.md
const BGM_LIST = {
  town: [['town1', 'Balance · Komiku'], ['town2', 'Together we are stronger · Komiku'], ['town3', '夢 · 甘茶の音楽工房']],
  field: [['field1', 'Dreaming of you · Komiku'], ['field2', 'Wake up, heroic figure · Komiku'], ['field3', 'Hop · Monplaisir'], ['field4', 'Resolution · Komiku']],
  dark: [['dark1', 'Action · Monplaisir'], ['dark2', 'Normalityazert · Monplaisir'], ['dark3', 'March of Midnight · Scott Buckley']],
};
const BGM = { on: true, vol: 0.35, mode: 'list', group: null, idx: 0, el: null, fadeT: null };
function saveOpt() { KIT.ls.set(OPT_KEY, JSON.stringify({ on: BGM.on, vol: BGM.vol, mode: BGM.mode })); }
function bgmInit() {
  try { const o = JSON.parse(KIT.ls.get(OPT_KEY, 'null')); if (o) { BGM.on = o.on !== false; if (o.vol >= 0 && o.vol <= 1) BGM.vol = o.vol; if (o.mode === 'one') BGM.mode = 'one'; } } catch (e) { /* 忽略 */ }
  const el = BGM.el = new Audio(); el.preload = 'auto'; el.volume = BGM.vol;
  el.addEventListener('ended', () => bgmNext());            // 多曲循环：播完自动下一首（单曲循环由 el.loop 处理）
  el.addEventListener('error', () => { if (BGM.group && BGM_LIST[BGM.group].length > 1) setTimeout(bgmNext, 500); });
  // 浏览器禁止无交互自动播放：首次点击/按键时再启动
  const kick = () => { if (BGM.on && BGM.group && el.paused && !el.ended && !document.hidden) el.play().catch(() => {}); };
  addEventListener('pointerdown', kick, true); addEventListener('keydown', kick, true);
}
function bgmGroupOf(mapId) { return mapId === 0 ? 'town' : mapId <= 5 ? 'field' : 'dark'; }
function bgmName() { return BGM.group ? BGM_LIST[BGM.group][BGM.idx][1] : '-'; }
function bgmLoad() {
  const el = BGM.el; if (!el || !BGM.group) return;
  clearInterval(BGM.fadeT); BGM.fadeT = null;
  el.src = `bgm/${BGM_LIST[BGM.group][BGM.idx][0]}.mp3`; el.loop = BGM.mode === 'one'; el.volume = BGM.vol;
  if (BGM.on) el.play().catch(() => {});
}
function bgmNext() { if (!BGM.group) return; BGM.idx = (BGM.idx + 1) % BGM_LIST[BGM.group].length; bgmLoad(); }
function bgmSet(group) {
  const el = BGM.el; if (!el || BGM.group === group) return;
  BGM.group = group; BGM.idx = ri(0, BGM_LIST[group].length - 1);
  if (el.paused || !BGM.on) { bgmLoad(); return; }
  clearInterval(BGM.fadeT);                                   // 换场景时淡出再切歌
  BGM.fadeT = setInterval(() => { el.volume = Math.max(0, el.volume - BGM.vol / 12); if (el.volume <= 0.001) bgmLoad(); }, 50);
}
function bgmToggle() { BGM.on = !BGM.on; if (BGM.on) { if (BGM.el.src) BGM.el.play().catch(() => {}); else bgmLoad(); } else BGM.el.pause(); saveOpt(); }
function bgmMode() { BGM.mode = BGM.mode === 'one' ? 'list' : 'one'; BGM.el.loop = BGM.mode === 'one'; saveOpt(); }
function bgmVol(d) { BGM.vol = clamp(Math.round((BGM.vol + d * 0.1) * 10) / 10, 0, 1); if (!BGM.fadeT) BGM.el.volume = BGM.vol; saveOpt(); }

/* ================= 地图生成 ================= */
function genMap(id) {
  if (G.mapCache[id]) return G.mapCache[id];
  const d = MAPS[id], w = d.w || 50, h = d.h || 36, R = mulberry32(id * 9973 + 7), th = THEMES[d.theme];
  const T = new Uint8Array(w * h), V = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) V[i] = R() * 100 | 0;
  const m = { def: d, id, w, h, T, V, objs: [], portals: [], npcs: [], th, zones: [[], [], []] };
  const I = (x, y) => y * w + x;
  const addOb = (x, y, type) => { T[I(x, y)] = 3; m.objs.push({ type, x: x * TILE + TILE / 2, y: y * TILE + TILE * 0.85, s: R() }); };
  const C = (tx, ty) => ({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (x < 2 || y < 2 || x >= w - 2 || y >= h - 2) addOb(x, y, th.ob1);

  if (id === 0) {
    for (let x = 2; x < w - 2; x++) { T[I(x, 11)] = 1; T[I(x, 12)] = 1; }
    for (let y = 4; y < h - 3; y++) { T[I(14, y)] = 1; T[I(15, y)] = 1; }
    T[I(w - 2, 11)] = 1; T[I(w - 2, 12)] = 1; // 村口
    m.objs = m.objs.filter(o => !(o.x > (w - 2) * TILE && o.x < (w - 1) * TILE && o.y > 11 * TILE && o.y < 13 * TILE));
    [[7, 8, '#e87a6a', '🧪杂货'], [22, 8, '#6aa8e8', '⚒️铁匠'], [7, 17, '#e8b84a', '🐾宠物'], [22, 17, '#9a7ae0', '📋公会']].forEach(a => {
      for (let y = a[1] - 1; y <= a[1]; y++) for (let x = a[0] - 1; x <= a[0] + 1; x++) T[I(x, y)] = 3;
      m.objs.push({ type: 'house', x: (a[0] + 0.5) * TILE, y: (a[1] + 1) * TILE - 2, s: 0.5, col: a[2], sign: a[3] });
    });
    for (let y = 13; y < 17; y++) for (let x = 24; x < 28; x++) if (Math.hypot(x - 25.5, y - 14.5) < 2.1) T[I(x, y)] = 2;
    [[3, 4], [5, 3], [11, 4], [18, 3], [26, 4], [3, 15], [11, 19], [18, 19], [26, 19], [19, 15], [4, 19], [10, 6]].forEach(a => { if (!T[I(a[0], a[1])]) addOb(a[0], a[1], R() < 0.75 ? 'tree' : 'rock'); });
    m.portals.push({ ...C(w - 2, 11.5), to: 1 });
    m.spawn = C(15, 12); m.entryR = C(w - 5, 11.5);
    NPCS.forEach(n => m.npcs.push({ ...n, x: (n.tx + 0.5) * TILE, y: (n.ty + 0.6) * TILE }));
  } else {
    // 主路
    const py = []; let y = h >> 1, prev = y;
    for (let x = 2; x < w - 2; x++) {
      if (x > 5 && x < w - 6 && R() < 0.45) y = clamp(y + (R() < 0.5 ? -1 : 1), 6, h - 7);
      py[x] = y; T[I(x, y)] = 1; T[I(x, y + 1)] = 1; T[I(x, prev)] = 1; T[I(x, prev + 1)] = 1; prev = y;
    }
    m.portals.push({ ...C(2, py[2] + 0.5), to: id - 1 });
    if (id < MAPS.length - 1) m.portals.push({ ...C(w - 3, py[w - 3] + 0.5), to: id + 1 });
    m.entryL = C(5, py[5] + 0.5); m.entryR = C(w - 6, py[w - 6] + 0.5);
    // 水塘 / 岩浆
    const np = 3 + (R() * 3 | 0);
    for (let k = 0; k < np; k++) {
      const cx = 7 + (R() * (w - 14) | 0), cy = 5 + (R() * (h - 10) | 0), r = 2 + R() * 2.5;
      for (let yy = Math.max(3, cy - 5); yy <= Math.min(h - 4, cy + 5); yy++) for (let xx = Math.max(3, cx - 5); xx <= Math.min(w - 4, cx + 5); xx++)
        if (T[I(xx, yy)] === 0 && Math.hypot(xx - cx, yy - cy) + R() * 0.8 < r) T[I(xx, yy)] = 2;
    }
    // 首领竞技场 + 通道
    const bx = w - 11, by = py[bx] < h / 2 ? h - 9 : 8;
    for (let yy = by - 5; yy <= by + 5; yy++) for (let xx = bx - 5; xx <= bx + 5; xx++)
      if (xx > 1 && yy > 1 && xx < w - 2 && yy < h - 2 && Math.hypot(xx - bx, yy - by) <= 5.2 && T[I(xx, yy)] !== 1) T[I(xx, yy)] = 0;
    const y0 = Math.min(by, py[bx]), y1 = Math.max(by, py[bx]);
    for (let yy = y0; yy <= y1; yy++) for (let dx = -1; dx <= 1; dx++) if (T[I(bx + dx, yy)] !== 1) T[I(bx + dx, yy)] = 0;
    m.boss = C(bx, by);
    // 障碍物
    for (let yy = 3; yy < h - 3; yy++) for (let xx = 3; xx < w - 3; xx++) {
      if (T[I(xx, yy)] !== 0 || R() > 0.085) continue;
      if (Math.hypot(xx - bx, yy - by) < 6.5 || (Math.abs(xx - bx) <= 2 && yy >= y0 - 1 && yy <= y1 + 1)) continue;
      let near = false;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (T[I(xx + a, yy + b)] === 1) near = true;
      if (!near) addOb(xx, yy, R() < 0.65 ? th.ob1 : th.ob2);
    }
    // 连通性 + 刷怪点
    const seen = new Uint8Array(w * h), q = [I(5, py[5])]; seen[q[0]] = 1;
    while (q.length) {
      const i = q.pop(), x = i % w, yy = (i / w) | 0;
      for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const j = I(x + a, yy + b);
        if (!seen[j] && T[j] < 2) { seen[j] = 1; q.push(j); }
      }
    }
    for (let yy = 3; yy < h - 3; yy++) for (let xx = 9; xx < w - 4; xx++) {
      if (!seen[I(xx, yy)] || Math.hypot(xx - bx, yy - by) < 8) continue;
      m.zones[clamp(Math.floor((xx - 9) / ((w - 13) / 3)), 0, 2)].push(C(xx, yy));
    }
  }
  m.objs.sort((a, b) => a.y - b.y);
  // 小地图
  const s = Math.floor(150 / w), mc = document.createElement('canvas'); mc.width = w * s; mc.height = h * s;
  const c = mc.getContext('2d'), cols = [th.g, th.path, th.liq, shade(th.g, -60)];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { c.fillStyle = cols[T[I(x, y)]]; c.fillRect(x * s, y * s, s, s); }
  m.mini = mc; m.ms = s;
  return G.mapCache[id] = m;
}

function mkMon(key, x, y, kind) {
  const d = MONS[key], s = monStats(d.lv, kind), S = SHAPE[d.shape], sc = kind === 2 ? 2.2 : kind === 1 ? 1.25 : 1;
  return {
    key, d, x, y, sx: x, sy: y, kind, boss: kind === 2, elite: kind === 1, lv: d.lv, hp: s.hp, maxHp: s.hp, atk: s.atk, def: s.def,
    exp: s.exp, gold: s.gold, spd: S.spd, sc, r: S.r * sc, h: S.h * sc, fly: !!S.fly, rng: d.rng,
    range: d.rng ? 250 : S.r * sc + 26, aggro: kind === 2 ? 360 : 230, leash: kind === 2 ? 560 : 480,
    state: 'idle', t: rnd(0, 2), vx: 0, vy: 0, atkT: rnd(0.5, 1.5), wind: 0, hurtT: 0, stun: 0, slow: 0, dead: false, respawn: 0,
    anim: rnd(0, 9), face: 1, skT: 3,
  };
}
function spawnMons(m) {
  const out = [];
  if (!m.def.mons) return out;
  const all = m.zones.flat();
  m.def.mons.forEach((key, k) => {
    const pts = m.zones[k].length ? m.zones[k] : all;
    for (let i = 0; i < 13; i++) { const pt = pick(pts); out.push(mkMon(key, pt.x, pt.y, Math.random() < 0.08 ? 1 : 0)); }
  });
  out.push(mkMon(m.def.boss, m.boss.x, m.boss.y, 2));
  return out;
}

/* ================= 玩家 ================= */
function newPlayer(name, cls) {
  const c = CLASSES[cls];
  const p = {
    v: 1, name, cls, lv: 1, exp: 0, gold: 120, hp: 1, mp: 1, attr: { ...c.base }, ap: 0, sp: 0, skills: {},
    inv: new Array(BAG).fill(null), equip: {}, pets: [], pet: null, mapId: 0, q: { i: 0, prog: 0 }, bounty: null,
    unlocked: [0], buffs: {}, kills: 0, x: 0, y: 0, fresh: true,
  };
  SLOTS.forEach(s => p.equip[s] = null);
  p.skills[SKILLS[cls][0].id] = 1;
  p.equip.weapon = makeEquip('weapon', 0, 0, cls); p.equip.armor = makeEquip('armor', 0, 0, cls);
  p.inv[0] = { id: 'hp1', n: 10 }; p.inv[1] = { id: 'mp1', n: 6 }; p.inv[2] = { id: 'scroll', n: 2 };
  return p;
}
function newRt() {
  return { atkT: 0, cd: {}, potT: 0, hurtT: 0, walk: 0, moving: false, fx: 1, fy: 0, dir: 1, swing: 0, dash: null, dead: false, deadT: 0, inv: 0, regenT: 0, stuckT: 0, jit: 0, jx: 0, jy: 0, lx: 0, ly: 0 };
}
function calcStats() {
  const p = G.p, c = CLASSES[p.cls], a = { ...p.attr }, b = { atk: 0, def: 0, hp: 0, mp: 0, crit: 0, spd: 0 };
  for (const s of SLOTS) {
    const e = p.equip[s]; if (!e) continue;
    const k = 1 + e.plus * 0.08;
    for (const key in e.base) b[key] += Math.round(e.base[key] * k);
    for (const key in e.affix) { if (key in a) a[key] += e.affix[key]; else b[key] += e.affix[key]; }
  }
  let atk = a[c.main] * 2 + p.lv * 2 + b.atk, def = a.con * 0.8 + a.str * 0.3 + p.lv + b.def;
  let hp = 80 + a.con * 12 + p.lv * 10 + b.hp, mp = 40 + a.int * 6 + p.lv * 4 + b.mp;
  let crit = 5 + a.agi * 0.25 + b.crit, spd = 190 * (1 + b.spd / 100);
  hp *= PLAYER_TANK; def *= PLAYER_TANK;
  const pb = p.pet ? PETS[p.pet].bonus : {};
  if (pb.atk) atk *= 1 + pb.atk; if (pb.def) def *= 1 + pb.def; if (pb.hp) hp *= 1 + pb.hp; if (pb.mp) mp *= 1 + pb.mp; if (pb.crit) crit += pb.crit;
  if (p.buffs.w3) { atk *= 1.3; def *= 1.3; }
  if (p.buffs.a3) { spd *= 1.4; crit += 20; }
  if (p.buffs.atkPot) atk *= 1.2;
  G.st = { atk: Math.round(atk), def: Math.round(def), maxHp: Math.round(hp), maxMp: Math.round(mp), crit: Math.min(75, Math.round(crit * 10) / 10), spd, attr: a };
  p.hp = Math.min(p.hp, G.st.maxHp); p.mp = Math.min(p.mp, G.st.maxMp);
}
function startGame(p) {
  G.p = p; G.rt = newRt(); G.auto = false;
  while (p.inv.length < BAG) p.inv.push(null);
  calcStats();
  if (p.fresh) { p.hp = G.st.maxHp; p.mp = G.st.maxMp; delete p.fresh; }
  if (p.hp <= 0) p.hp = G.st.maxHp;
  G.state = 'play';
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  $('#title').classList.add('hide'); $('#hud').classList.remove('hide');
  changeMap(p.mapId);
  uiStart();
  msg(`欢迎来到萌萌大陆，${p.name}！`, '#ffe14a');
  msg('WASD 或 点地面移动，点怪物攻击，1-4技能，F对话，Z挂机');
}
function save() { if (G.p) KIT.ls.set(SAVE_KEY, JSON.stringify(G.p)); }
function loadSave() { try { return JSON.parse(KIT.ls.get(SAVE_KEY, 'null')); } catch (e) { return null; } }

function changeMap(id, side) {
  const m = genMap(id), p = G.p;
  G.map = m; p.mapId = id;
  const e = (side === 'R' && m.entryR) || m.spawn || m.entryL;
  p.x = e.x; p.y = e.y;
  mouseStop();
  G.mons = spawnMons(m); G.projs = []; G.drops = []; G.teles = []; G.fx = []; G.texts = [];
  G.portalT = 1.2; G.rt.dash = null; G.rt.inv = 1.5; G.pet = null;
  if (!p.unlocked.includes(id)) p.unlocked.push(id);
  banner(m.def.name, m.def.safe ? '安全区' : `推荐等级 Lv.${m.def.lv[0]} - ${m.def.lv[1]}`);
  updCam(true); save(); bgmSet(bgmGroupOf(id));
}

/* ---------- 背包 ---------- */
function addItem(it) {
  const inv = G.p.inv;
  if (!it.eq) {
    const s = inv.find(x => x && x.id === it.id);
    if (s) { s.n += it.n; return true; }
  }
  const i = inv.indexOf(null);
  if (i < 0) return false;
  inv[i] = it.eq ? it : { id: it.id, n: it.n };
  return true;
}
function countItem(id) { let n = 0; for (const x of G.p.inv) if (x && x.id === id) n += x.n; return n; }
function removeItem(id, n) {
  const inv = G.p.inv;
  for (let i = 0; i < inv.length && n > 0; i++) {
    const x = inv[i];
    if (x && x.id === id) { const k = Math.min(n, x.n); x.n -= k; n -= k; if (x.n <= 0) inv[i] = null; }
  }
}
function itemName(it) { return it.eq ? it.name + (it.plus ? ' +' + it.plus : '') : ITEMS[it.id].name + (it.n > 1 ? ' ×' + it.n : ''); }
function giveOrDrop(it) { if (!addItem(it)) G.drops.push({ x: G.p.x + rnd(-30, 30), y: G.p.y + rnd(-30, 30), it, t: 0 }); }

/* ---------- 碰撞 ---------- */
function solid(x, y, fly) {
  const m = G.map, tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) return true;
  const t = m.T[ty * m.w + tx];
  return t === 3 || (t === 2 && !fly);
}
function moveEnt(e, dx, dy, r, fly) {
  let mv = false; const h = r * 0.5;
  if (dx) { const nx = e.x + dx, ex = nx + Math.sign(dx) * r; if (!solid(ex, e.y - h, fly) && !solid(ex, e.y + h, fly)) { e.x = nx; mv = true; } }
  if (dy) { const ny = e.y + dy, ey = ny + Math.sign(dy) * h; if (!solid(e.x - r, ey, fly) && !solid(e.x + r, ey, fly)) { e.y = ny; mv = true; } }
  return mv;
}
/* ---------- 鼠标寻路 ---------- */
// 两点之间人物能否直线走过去（按人物碰撞盒采样）
function los(x0, y0, x1, y1) {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 10);
  for (let i = 1; i <= n; i++) {
    const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n;
    if (solid(x - 14, y - 8) || solid(x + 14, y - 8) || solid(x - 14, y + 8) || solid(x + 14, y + 8)) return false;
  }
  return true;
}
// 网格 BFS：返回一串路点（格子中心，终点为精确坐标），到不了返回 null
function findPath(sx, sy, tx, ty) {
  const m = G.map, W = m.w, H = m.h, free = (x, y) => x >= 0 && y >= 0 && x < W && y < H && m.T[y * W + x] < 2;
  const s = Math.floor(sy / TILE) * W + Math.floor(sx / TILE), ex = Math.floor(tx / TILE), ey = Math.floor(ty / TILE), e = ey * W + ex;
  if (!free(ex, ey)) return null;
  if (s === e) return [{ x: tx, y: ty }];
  const prev = new Int32Array(W * H).fill(-1), q = [s]; prev[s] = s;
  const D = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  for (let h = 0; h < q.length && prev[e] < 0; h++) {
    const c = q[h], cx = c % W, cy = (c - cx) / W;
    for (const [dx, dy] of D) {
      const nx = cx + dx, ny = cy + dy, ni = ny * W + nx;
      if (!free(nx, ny) || prev[ni] >= 0) continue;
      if (dx && dy && (!free(cx + dx, cy) || !free(cx, cy + dy))) continue;   // 不允许斜穿墙角
      prev[ni] = c; q.push(ni);
    }
  }
  if (prev[e] < 0) return null;
  const path = [{ x: tx, y: ty }];
  for (let c = prev[e]; c !== s; c = prev[c]) path.unshift({ x: (c % W + 0.5) * TILE, y: (Math.floor(c / W) + 0.5) * TILE });
  return path;
}
// 朝目标点走：能直走就直走，否则沿寻路路点走。返回移动方向（未归一化）
function steer(tx, ty, dt) {
  const p = G.p, n = G.nav;
  if (los(p.x, p.y, tx, ty)) { n.path = null; return [tx - p.x, ty - p.y]; }
  n.t -= dt;
  if (!n.path || n.t <= 0 || Math.hypot(n.tx - tx, n.ty - ty) > 24) { n.path = findPath(p.x, p.y, tx, ty); n.t = 0.4; n.tx = tx; n.ty = ty; }
  if (!n.path) return [tx - p.x, ty - p.y];
  while (n.path.length > 1 && (los(p.x, p.y, n.path[1].x, n.path[1].y) || Math.hypot(n.path[0].x - p.x, n.path[0].y - p.y) < 8)) n.path.shift();
  return [n.path[0].x - p.x, n.path[0].y - p.y];
}
// 点到水面/障碍上时，改成离它最近的可走格子
function snapFree(x, y) {
  const m = G.map, tx = Math.floor(x / TILE), ty = Math.floor(y / TILE), free = (a, b) => a >= 0 && b >= 0 && a < m.w && b < m.h && m.T[b * m.w + a] < 2;
  if (free(tx, ty)) return { x, y };
  let best = null, bd = 1e9;
  for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) {
    if (!free(tx + dx, ty + dy)) continue;
    const cx = (tx + dx + 0.5) * TILE, cy = (ty + dy + 0.5) * TILE, d = Math.hypot(cx - x, cy - y);
    if (d < bd) { bd = d; best = { x: cx, y: cy }; }
  }
  return best;
}
function monAt(wx, wy) {
  let best = null, bd = 1e9;
  for (const m of G.mons) {
    if (m.dead || Math.abs(wx - m.x) > m.r + 14 || wy > m.y + 16 || wy < m.y - m.r * 2 - 16) continue;
    const d = Math.hypot(wx - m.x, wy - (m.y - m.r)); if (d < bd) { bd = d; best = m; }
  }
  return best;
}
function mouseStop() { G.mv = null; G.tgt = null; G.nav.path = null; G.stuckT = 0; G.mouse.drag = false; }
// 鼠标控制：返回 [mx, my, 是否攻击]
function mouseCtl(dt) {
  const p = G.p, c = CLASSES[p.cls];
  if (G.tgt && G.tgt.dead) G.tgt = null;
  if (G.tgt) {
    const t = G.tgt, d = Math.hypot(t.x - p.x, t.y - p.y);
    if (d <= c.range * 0.8 + t.r) return [0, 0, true];
    const v = steer(t.x, t.y, dt); return [v[0], v[1], false];
  }
  if (G.mv) {
    const v = G.mv;
    if (G.mouse.drag) { const s = snapFree(G.mouse.x + G.cam.x, G.mouse.y + G.cam.y); if (s) { v.x = s.x; v.y = s.y; } v.npc = null; }   // 按住左键：一直跟着鼠标走
    if (v.npc && G.nearNpc === v.npc) { const n = v.npc; mouseStop(); openNpc(n); return [0, 0, false]; }
    if (Math.hypot(v.x - p.x, v.y - p.y) < 6) { if (!G.mouse.drag) mouseStop(); return [0, 0, false]; }
    const s = steer(v.x, v.y, dt); return [s[0], s[1], false];
  }
  return [0, 0, false];
}
function nearestMon(range, from, filter) {
  from = from || G.p; let best = null, bd = 1e9;
  for (const m of G.mons) {
    if (m.dead || (filter && !filter(m))) continue;
    const d = Math.hypot(m.x - from.x, m.y - from.y) - m.r;
    if (d < range && d < bd) { bd = d; best = m; }
  }
  return best;
}

/* ================= 战斗 ================= */
function addText(x, y, s, col, big) { G.texts.push({ x: x + rnd(-8, 8), y, s: String(s), col, big, t: 0 }); }
function burst(x, y, col, n, sp) {
  for (let i = 0; i < n; i++) { const a = rnd(0, 6.28), v = rnd(0.3, 1) * (sp || 140); G.fx.push({ type: 'part', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, t: 0, dur: rnd(0.3, 0.6), col, size: rnd(2, 5) }); }
}
function aim(range) {
  const p = G.p, rt = G.rt; let dx, dy;
  if (G.mouse.down) { dx = G.mouse.x + G.cam.x - p.x; dy = G.mouse.y + G.cam.y - (p.y - 16); }
  else if (G.tgt && !G.tgt.dead) { dx = G.tgt.x - p.x; dy = G.tgt.y - p.y; }
  else { const m = nearestMon(range); if (m) { dx = m.x - p.x; dy = m.y - p.y; } else { dx = rt.fx; dy = rt.fy; } }
  const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
  rt.fx = dx; rt.fy = dy; if (Math.abs(dx) > 0.1) rt.dir = dx > 0 ? 1 : -1;
  return { x: dx, y: dy };
}
function shootP(d, o) {
  const p = G.p, sp = o.speed || 560;
  G.projs.push({ x: p.x + d.x * 14, y: p.y + d.y * 14, vx: d.x * sp, vy: d.y * sp, life: (o.range || CLASSES[p.cls].range) / sp, from: 'p', mul: o.mul, r: o.r || 8, pierce: o.pierce, splash: o.splash, col: o.col, kind: o.kind, hit: new Set() });
}
function tryAttack() {
  const p = G.p, rt = G.rt, c = CLASSES[p.cls];
  if (rt.atkT > 0 || rt.dead || rt.dash) return;
  rt.atkT = c.atkCd; rt.swing = 1;
  const d = aim(c.range + 30);
  sfx('atk');
  if (p.cls === 'warrior') {
    G.fx.push({ type: 'slash', x: p.x, y: p.y - 16, ang: Math.atan2(d.y, d.x), t: 0, dur: 0.18 });
    for (const m of G.mons) {
      if (m.dead) continue;
      const dx = m.x - p.x, dy = m.y - p.y, dd = Math.hypot(dx, dy) || 1;
      if (dd < c.range + m.r && (dd < m.r + 20 || (dx * d.x + dy * d.y) / dd > 0.25)) hitMon(m, 1);
    }
  } else if (p.cls === 'mage') shootP(d, { mul: 1, kind: 'orb', col: '#c79aff' });
  else shootP(d, { mul: 1, kind: 'arrow', speed: 700, col: '#f4e4c0' });
}
function cast(i) {
  const p = G.p, rt = G.rt, st = G.st, sk = SKILLS[p.cls][i];
  if (!sk || rt.dead || rt.dash) return false;
  const lv = p.skills[sk.id] || 0;
  if (!lv) { msg(`「${sk.name}」需要等级 ${sk.lv} 才能学会`); return false; }
  if (rt.cd[sk.id] > 0) return false;
  if (p.mp < sk.mp) { if (!G.auto) msg('魔法不足！', '#8ac8ff'); return false; }
  p.mp -= sk.mp; rt.cd[sk.id] = sk.cd;
  const mul = (sk.mul || 0) * (1 + 0.12 * (lv - 1)), d = aim(420);
  sfx('skill'); rt.swing = 1;
  addText(p.x, p.y - 70, sk.name, '#ffe14a');
  switch (sk.type) {
    case 'aoeSelf':
      G.fx.push({ type: 'ring', x: p.x, y: p.y, r: sk.r, t: 0, dur: 0.4, col: sk.slow ? '140,220,255' : '255,200,80' });
      for (const m of G.mons) if (!m.dead && Math.hypot(m.x - p.x, m.y - p.y) < sk.r + m.r) hitMon(m, mul, { stun: sk.stun, slow: sk.slow });
      G.shake = sk.stun ? 0.4 : 0.15;
      break;
    case 'dash': rt.dash = { x: d.x, y: d.y, t: sk.dist / 900, mul, hit: new Set() }; rt.inv = Math.max(rt.inv, 0.4); break;
    case 'buff':
      p.buffs[sk.id] = sk.dur + (lv - 1); calcStats();
      G.fx.push({ type: 'ring', x: p.x, y: p.y, r: 70, t: 0, dur: 0.5, col: '255,225,74' }); break;
    case 'heal': healP(st.maxHp * (sk.pct + 0.02 * (lv - 1))); G.fx.push({ type: 'ring', x: p.x, y: p.y, r: 60, t: 0, dur: 0.5, col: '255,140,180' }); break;
    case 'proj': shootP(d, { mul, splash: sk.splash, pierce: sk.pierce, col: sk.col, kind: sk.pierce ? 'arrow' : 'orb', r: 12, range: 460, speed: sk.pierce ? 820 : 520 }); break;
    case 'fan':
      for (let k = 0; k < sk.n; k++) { const a = Math.atan2(d.y, d.x) + (k - (sk.n - 1) / 2) * 0.16; shootP({ x: Math.cos(a), y: Math.sin(a) }, { mul, kind: 'arrow', speed: 700, col: '#f4e4c0' }); }
      break;
    case 'rain': {
      const m = nearestMon(420), tx = m ? m.x : p.x + d.x * 200, ty = m ? m.y : p.y + d.y * 200;
      G.teles.push({ x: tx, y: ty, r: sk.r, t: 0, friendly: true, hits: sk.hits, every: 0.3, next: 0.25, mul, col: sk.col });
      break;
    }
  }
  return true;
}
function hitMon(m, mul, o) {
  if (m.dead) return;
  const p = G.p, st = G.st; o = o || {};
  let dmg = st.atk * mul * 100 / (100 + m.def) * rnd(0.9, 1.1);
  const crit = Math.random() * 100 < st.crit;
  if (crit) dmg *= 1.8;
  dmg = Math.max(1, Math.round(dmg));
  m.hp -= dmg; m.hurtT = 0.15;
  if (m.state !== 'chase') m.state = 'chase';
  if (o.stun) m.stun = Math.max(m.stun, m.boss ? o.stun * 0.4 : o.stun);
  if (o.slow) m.slow = o.slow;
  if (!m.boss) { const dx = m.x - p.x, dy = m.y - p.y, d = Math.hypot(dx, dy) || 1; moveEnt(m, dx / d * 5, dy / d * 5, m.r * 0.6, m.fly); }
  addText(m.x, m.y - m.h - 6, crit ? dmg + '!' : dmg, crit ? '#ffd23f' : '#ffffff', crit);
  burst(m.x, m.y - m.h * 0.5, m.d.c, 3, 110);
  sfx('hit');
  if (m.hp <= 0) killMon(m);
}
function hurtPlayer(atk) {
  const p = G.p, rt = G.rt;
  if (rt.dead || rt.inv > 0) return;
  const d = Math.max(1, Math.round(atk * 100 / (100 + G.st.def) * rnd(0.9, 1.1)));
  p.hp -= d; rt.hurtT = 0.25;
  addText(p.x, p.y - 60, '-' + d, '#ff5a5a');
  sfx('hurt');
  if (p.hp <= 0) {
    p.hp = 0; rt.dead = true; rt.deadT = 3; rt.dash = null; mouseStop();
    const loss = Math.floor(p.gold * 0.1); p.gold -= loss;
    msg(`你被打倒了……损失 ${loss} 金币，3秒后在萌萌村复活`, '#ff8a8a');
    if (G.auto) toggleAuto();
  }
}
function healP(v) { const p = G.p; v = Math.round(Math.min(v, G.st.maxHp - p.hp)); p.hp += v; if (v > 0) addText(p.x, p.y - 60, '+' + v, '#6ae06a'); }
function gainExp(n) {
  const p = G.p;
  if (p.lv >= MAXLV) return;
  p.exp += n;
  let up = false;
  while (p.lv < MAXLV && p.exp >= expNeed(p.lv)) {
    p.exp -= expNeed(p.lv); p.lv++; p.ap += 5; p.sp++; up = true;
    for (const sk of SKILLS[p.cls]) if (p.lv >= sk.lv && !p.skills[sk.id]) { p.skills[sk.id] = 1; msg(`✨ 学会新技能「${sk.name}」！`, '#ffe14a'); }
  }
  if (p.lv >= MAXLV) p.exp = 0;
  if (up) {
    calcStats(); p.hp = G.st.maxHp; p.mp = G.st.maxMp;
    G.fx.push({ type: 'ring', x: p.x, y: p.y, r: 120, t: 0, dur: 0.8, col: '255,225,74' });
    burst(p.x, p.y - 30, '#ffe14a', 24, 220);
    addText(p.x, p.y - 80, 'LEVEL UP!', '#ffe14a', true);
    msg(`🎉 升级啦！当前等级 ${p.lv}，获得 5 属性点、1 技能点`, '#ffe14a');
    sfx('lvup'); uiDirty();
  }
}
function rollRar(k) {
  const tb = k === 2 ? [0, 30, 40, 22, 8] : k === 1 ? [25, 42, 24, 7.5, 1.5] : [60, 28, 9, 2.5, 0.5];
  let r = Math.random() * 100;
  for (let i = 0; i < 5; i++) { if (r < tb[i]) return i; r -= tb[i]; }
  return 0;
}
function killMon(m) {
  const p = G.p, md = G.map.def, k = m.kind;
  m.dead = true; m.respawn = m.boss ? 120 : rnd(8, 14);
  p.kills++;
  let exp = m.exp; if (p.lv - m.lv > 10) exp *= 0.1; else if (p.lv - m.lv > 5) exp *= 0.35; if (p.buffs.expPot) exp *= 2;
  exp = Math.max(1, Math.round(exp));
  addText(m.x, m.y - m.h - 26, '+' + exp + ' EXP', '#b8f07a');
  burst(m.x, m.y - m.h * 0.4, m.d.c, m.boss ? 40 : 12, m.boss ? 260 : 150);
  const drop = it => G.drops.push({ x: m.x + rnd(-26, 26) * m.sc, y: m.y + rnd(-18, 18) * m.sc, it, t: 0 });
  if (Math.random() < 0.75 || k) for (let i = 0; i < (k === 2 ? 6 : 1); i++) drop({ gold: Math.max(1, Math.round(m.gold * rnd(0.7, 1.4) / (k === 2 ? 4 : 1))) });
  if (Math.random() < [0.3, 0.8, 1][k]) drop({ id: md.mat, n: k === 2 ? ri(3, 5) : 1 });
  if (Math.random() < [0.08, 0.35, 1][k]) { const t = clamp(Math.floor(md.id / 2.6) + 1, 1, 4); drop({ id: (Math.random() < 0.6 ? 'hp' : 'mp') + t, n: k === 2 ? 5 : 1 }); }
  if (Math.random() < [0.04, 0.35, 1][k]) drop({ id: 'stone', n: k === 2 ? ri(2, 4) : 1 });
  const ne = k === 2 ? ri(2, 3) : Math.random() < [0.06, 0.5][k] ? 1 : 0;
  for (let i = 0; i < ne; i++) drop(makeEquip(pick(SLOTS), md.id - 1 + (k === 2 ? 1 : 0), rollRar(k), p.cls));
  if (k === 2) {
    if (md.egg && !p.pets.includes(ITEMS[md.egg].pet) && Math.random() < 0.3) drop({ id: md.egg, n: 1 });
    G.shake = 0.6; msg(`🏆 击败了首领【${m.d.name}】！`, '#ffb84a'); sfx('lvup');
    if (m.key === 'b_demon') banner('🎉 通关！', '大魔王·噗噗被你打跑啦，萌萌大陆恢复了和平！');
  }
  // 任务
  const q = QUESTS[p.q.i];
  if (q && q.target === m.key && p.q.prog < q.n) { p.q.prog++; if (p.q.prog >= q.n) { msg(`✅ 主线「${q.name}」已完成，按 L 领取奖励！`, '#7af07a'); sfx('ok'); } }
  const b = p.bounty;
  if (b && b.type === 'kill' && b.target === m.key && b.prog < b.n) { b.prog++; if (b.prog >= b.n) msg('✅ 悬赏任务已完成，按 L 领取奖励！', '#7af07a'); }
  gainExp(exp);
}
function usePotion(kind) {
  const p = G.p, rt = G.rt;
  if (rt.dead || rt.potT > 0) return false;
  if (kind === 'hp' ? p.hp >= G.st.maxHp : p.mp >= G.st.maxMp) return false;
  for (let t = 1; t <= 4; t++) {
    const id = kind + t;
    if (countItem(id) > 0) {
      removeItem(id, 1); rt.potT = 1.2;
      if (kind === 'hp') healP(ITEMS[id].hp);
      else { const v = Math.round(Math.min(ITEMS[id].mp, G.st.maxMp - p.mp)); p.mp += v; addText(p.x, p.y - 60, '+' + v, '#6ab8ff'); }
      sfx('pick'); uiDirty(); return true;
    }
  }
  if (!G.auto) msg(kind === 'hp' ? '没有红药了！' : '没有蓝药了！', '#ff8a8a');
  return false;
}
function useScroll() {
  if (G.rt.dead) return;
  if (G.map.def.safe) { msg('你已经在村子里啦'); return; }
  if (countItem('scroll') < 1) { msg('没有回城卷轴了，可以在杂货商处购买', '#ff8a8a'); return; }
  removeItem('scroll', 1); changeMap(0); msg('咻~ 回到了萌萌村'); sfx('ok'); uiDirty();
}

/* ================= 怪物 AI ================= */
function shootM(m, dx, dy, k) {
  G.projs.push({ x: m.x, y: m.y, vx: dx * 250, vy: dy * 250, life: 2.2, from: 'm', dmg: m.atk * (k || 1), r: m.boss ? 10 : 7, col: m.d.c, kind: 'orb' });
}
function bossAI(m, dt) {
  m.skT -= dt; if (m.skT > 0) return;
  const rage = m.hp < m.maxHp * 0.5, p = G.p, k = Math.random();
  m.skT = rage ? 3.2 : 4.8;
  if (k < 0.45) {
    const n = rage ? 3 : 1;
    for (let i = 0; i < n; i++) G.teles.push({ x: p.x + (i ? rnd(-130, 130) : 0), y: p.y + (i ? rnd(-130, 130) : 0), r: 85, delay: 1 + i * 0.25, t: 0, dmg: m.atk * 1.8, col: '255,60,60' });
  } else if (k < 0.8) {
    const n = rage ? 16 : 12;
    for (let i = 0; i < n; i++) { const a = i / n * 6.283 + m.anim; shootM(m, Math.cos(a), Math.sin(a), 0.8); }
  } else G.teles.push({ x: m.x, y: m.y, r: m.r + 130, delay: 1.1, t: 0, dmg: m.atk * 2, col: '255,140,40' });
}
function updMon(m, dt) {
  if (m.dead) { m.respawn -= dt; if (m.respawn <= 0) Object.assign(m, { dead: false, hp: m.maxHp, x: m.sx, y: m.sy, state: 'idle', stun: 0, slow: 0, wind: 0 }); return; }
  m.anim += dt; m.hurtT -= dt; m.atkT -= dt; if (m.slow > 0) m.slow -= dt;
  if (m.stun > 0) { m.stun -= dt; return; }
  const p = G.p, rt = G.rt, dx = p.x - m.x, dy = p.y - m.y, d = Math.hypot(dx, dy) || 1, hd = Math.hypot(m.x - m.sx, m.y - m.sy);
  const sp = m.spd * (m.slow > 0 ? 0.5 : 1);
  if (m.wind > 0) {
    m.wind -= dt;
    if (m.wind <= 0) { if (m.rng) shootM(m, dx / d, dy / d); else if (d < m.range * 1.35) hurtPlayer(m.atk); }
    return;
  }
  if (m.state === 'idle') {
    m.t -= dt;
    if (m.t <= 0) {
      m.t = rnd(1, 3);
      if (Math.random() < 0.5) m.vx = m.vy = 0; else { const a = rnd(0, 6.28); m.vx = Math.cos(a); m.vy = Math.sin(a); }
      if (hd > 110) { m.vx = (m.sx - m.x) / hd; m.vy = (m.sy - m.y) / hd; }
    }
    if ((m.vx || m.vy) && !m.boss) { moveEnt(m, m.vx * sp * 0.35 * dt, m.vy * sp * 0.35 * dt, m.r * 0.6, m.fly); if (Math.abs(m.vx) > 0.1) m.face = m.vx > 0 ? 1 : -1; }
    if (!rt.dead && d < m.aggro) m.state = 'chase';
  } else if (m.state === 'chase') {
    if (rt.dead || hd > m.leash) { m.state = 'back'; return; }
    m.face = dx > 0 ? 1 : -1;
    if (d > m.range) { if (!moveEnt(m, dx / d * sp * dt, dy / d * sp * dt, m.r * 0.6, m.fly)) moveEnt(m, -dy / d * sp * dt, dx / d * sp * dt, m.r * 0.6, m.fly); }
    else if (m.atkT <= 0) { m.atkT = m.boss ? 1.1 : 1.4; m.wind = 0.35; }
    if (m.boss) bossAI(m, dt);
  } else {
    if (hd < 14) { m.state = 'idle'; m.hp = m.maxHp; }
    else { m.x += (m.sx - m.x) / hd * sp * 1.6 * dt; m.y += (m.sy - m.y) / hd * sp * 1.6 * dt; m.hp = Math.min(m.maxHp, m.hp + m.maxHp * 0.3 * dt); m.face = m.sx > m.x ? 1 : -1; }
  }
}

/* ================= 挂机 ================= */
function toggleAuto() { G.auto = !G.auto; msg(G.auto ? '🤖 自动战斗已开启（Z 关闭）' : '自动战斗已关闭'); $('#btnAuto').classList.toggle('on', G.auto); }
function autoCtl(dt) {
  const p = G.p, rt = G.rt, st = G.st, c = CLASSES[p.cls];
  if (p.hp < st.maxHp * 0.45) usePotion('hp');
  if (p.mp < st.maxMp * 0.25) usePotion('mp');
  if (G.map.def.safe) return [0, 0];
  let tgt = null, bd = 1e9;
  const bs = G.map.boss, weak = p.lv < MONS[G.map.def.boss].lv + 3;
  for (const m of G.mons) {
    if (m.dead || (m.boss && m.state !== 'chase')) continue;
    if (weak && m.state !== 'chase' && Math.hypot(m.x - bs.x, m.y - bs.y) < 540) continue; // 等级不够时不去招惹首领
    const d = Math.hypot(m.x - p.x, m.y - p.y) - m.r - (m.state === 'chase' ? 150 : 0);
    if (d < bd) { bd = d; tgt = m; }
  }
  const td = tgt ? Math.hypot(tgt.x - p.x, tgt.y - p.y) : 1e9;
  let goal = null;
  if (tgt && td <= c.range + tgt.r) {
    tryAttack();
    const sk = SKILLS[p.cls];
    for (let i = 0; i < 4; i++) {
      const s = sk[i]; if (!p.skills[s.id] || rt.cd[s.id] > 0 || p.mp < s.mp) continue;
      if (s.type === 'aoeSelf' && td > s.r) continue;
      if (s.type === 'heal' && p.hp > st.maxHp * 0.6) continue;
      if (s.type === 'dash' && td < 70) continue;
      cast(i); break;
    }
    if (td > (p.cls === 'warrior' ? c.range * 0.6 + tgt.r : c.range * 0.8)) goal = tgt;
  } else {
    let dr = null, dd = 320;
    for (const o of G.drops) { if (!o.it.gold && G.fullT > 0) continue; const d = Math.hypot(o.x - p.x, o.y - p.y); if (d < dd) { dd = d; dr = o; } }
    goal = dr || tgt;
  }
  if (!goal) return [0, 0];
  let mx = goal.x - p.x, my = goal.y - p.y; const d = Math.hypot(mx, my) || 1; mx /= d; my /= d;
  rt.stuckT += dt;
  if (rt.stuckT > 0.5) {
    if (Math.hypot(p.x - rt.lx, p.y - rt.ly) < 12) { rt.jit = 0.7; const s = Math.random() < 0.5 ? 1 : -1; rt.jx = -my * s; rt.jy = mx * s; }
    rt.stuckT = 0; rt.lx = p.x; rt.ly = p.y;
  }
  if (rt.jit > 0) { rt.jit -= dt; return [rt.jx + mx * 0.3, rt.jy + my * 0.3]; }
  return [mx, my];
}

/* ================= 主更新 ================= */
function update(dt) {
  const p = G.p, rt = G.rt, st = G.st, map = G.map;
  G.t += dt; G.portalT -= dt; G.fullT -= dt; if (G.shake > 0) G.shake -= dt;
  let bc = false;
  for (const k in p.buffs) { p.buffs[k] -= dt; if (p.buffs[k] <= 0) { delete p.buffs[k]; bc = true; } }
  if (bc) calcStats();
  for (const k in rt.cd) if (rt.cd[k] > 0) rt.cd[k] -= dt;
  rt.atkT -= dt; rt.potT -= dt; rt.hurtT -= dt; rt.inv -= dt; rt.swing = Math.max(0, rt.swing - dt * 4);

  if (rt.dead) {
    rt.deadT -= dt;
    if (rt.deadT <= 0) { rt.dead = false; p.hp = st.maxHp; p.mp = st.maxMp; changeMap(0); msg('你在萌萌村醒了过来'); }
  } else {
    rt.regenT += dt;
    if (rt.regenT >= 1) {
      rt.regenT = 0;
      p.hp = Math.min(st.maxHp, p.hp + (map.def.safe ? st.maxHp * 0.1 : st.maxHp * 0.004 + 1));
      p.mp = Math.min(st.maxMp, p.mp + (map.def.safe ? st.maxMp * 0.1 : st.maxMp * 0.012 + 1));
    }
    let mx = 0, my = 0; const K = G.keys;
    if (K.a || K.arrowleft) mx -= 1; if (K.d || K.arrowright) mx += 1;
    if (K.w || K.arrowup) my -= 1; if (K.s || K.arrowdown) my += 1;
    let mAtk = false; const byKey = mx || my;
    if (byKey) mouseStop();                                   // 键盘移动优先，并取消鼠标指令
    else if (G.mv || G.tgt) [mx, my, mAtk] = mouseCtl(dt);
    const byMouse = !byKey && (mx || my);
    if (G.auto && !mx && !my && !mAtk) [mx, my] = autoCtl(dt);
    rt.moving = false;
    if (rt.dash) {
      const D = rt.dash; D.t -= dt;
      moveEnt(p, D.x * 900 * dt, D.y * 900 * dt, 13);
      for (const m of G.mons) if (!m.dead && !D.hit.has(m) && Math.hypot(m.x - p.x, m.y - p.y) < 50 + m.r) { D.hit.add(m); hitMon(m, D.mul); }
      G.fx.push({ type: 'part', x: p.x, y: p.y - 16, vx: 0, vy: 0, t: 0, dur: 0.25, col: '#ffffff', size: 8 });
      if (D.t <= 0) rt.dash = null;
    } else {
      const len = Math.hypot(mx, my);
      if (len > 0.01) {
        mx /= len; my /= len; rt.fx = mx; rt.fy = my; if (Math.abs(mx) > 0.1) rt.dir = mx > 0 ? 1 : -1;
        const ox = p.x, oy = p.y;
        moveEnt(p, mx * st.spd * dt, my * st.spd * dt, 13); rt.walk += dt; rt.moving = true;
        if (byMouse) { G.stuckT = Math.hypot(p.x - ox, p.y - oy) > st.spd * dt * 0.3 ? 0 : G.stuckT + dt; if (G.stuckT > 0.4) mouseStop(); }   // 走不动就放弃
      }
      if (K.j || K[' '] || G.mouse.down || mAtk) tryAttack();
    }
    // 传送门
    if (G.portalT <= 0) for (const po of map.portals) {
      if (Math.hypot(po.x - p.x, po.y - p.y) < 34) {
        const to = MAPS[po.to];
        if (p.lv < to.req) { msg(`「${to.name}」需要等级 ${to.req} 才能进入`, '#ff8a8a'); G.portalT = 2; }
        else { changeMap(po.to, po.to < map.id ? 'R' : 'L'); sfx('ok'); return; }
      }
    }
  }
  // NPC
  G.nearNpc = null;
  for (const n of map.npcs) if (Math.hypot(n.x - p.x, n.y - p.y) < 72) G.nearNpc = n;

  for (const m of G.mons) updMon(m, dt);
  // 怪物分离
  for (let i = 0; i < G.mons.length; i++) {
    const a = G.mons[i]; if (a.dead || a.state !== 'chase') continue;
    for (let j = i + 1; j < G.mons.length; j++) {
      const b = G.mons[j]; if (b.dead || b.state !== 'chase') continue;
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, min = (a.r + b.r) * 0.8;
      if (d < min) { const k = (min - d) * 0.5 / d; if (!a.boss) moveEnt(a, -dx * k, -dy * k, a.r * 0.6, a.fly); if (!b.boss) moveEnt(b, dx * k, dy * k, b.r * 0.6, b.fly); }
    }
  }
  // 弹道
  for (const o of G.projs) {
    o.x += o.vx * dt; o.y += o.vy * dt; o.life -= dt;
    const tx = Math.floor(o.x / TILE), ty = Math.floor(o.y / TILE);
    if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h || map.T[ty * map.w + tx] === 3) o.life = -1;
    if (o.from === 'p') {
      for (const m of G.mons) {
        if (m.dead || o.hit.has(m) || Math.hypot(m.x - o.x, m.y - o.y) > m.r + o.r + 4) continue;
        hitMon(m, o.mul);
        if (o.splash) {
          G.fx.push({ type: 'ring', x: o.x, y: o.y, r: o.splash, t: 0, dur: 0.3, col: '255,140,50' });
          for (const n of G.mons) if (n !== m && !n.dead && Math.hypot(n.x - o.x, n.y - o.y) < o.splash + n.r) hitMon(n, o.mul * 0.6);
        }
        if (o.pierce) o.hit.add(m); else { o.life = -1; break; }
      }
    } else if (!rt.dead && Math.hypot(p.x - o.x, p.y - o.y) < 15 + o.r) { hurtPlayer(o.dmg); o.life = -1; }
  }
  G.projs = G.projs.filter(o => o.life > 0);
  // 预警圈 / 持续范围技能
  for (const t of G.teles) {
    t.t += dt;
    if (t.friendly) {
      if (t.t >= t.next && t.hits > 0) {
        t.next += t.every; t.hits--;
        for (let i = 0; i < 4; i++) { const a = rnd(0, 6.28), r = rnd(0, t.r); G.fx.push({ type: 'fall', x: t.x + Math.cos(a) * r, y: t.y + Math.sin(a) * r * 0.8, t: 0, dur: 0.25, col: t.col }); }
        for (const m of G.mons) if (!m.dead && Math.hypot(m.x - t.x, m.y - t.y) < t.r + m.r) hitMon(m, t.mul);
        G.shake = Math.max(G.shake, 0.1);
        if (t.hits <= 0) t.done = true;
      }
    } else if (t.t >= t.delay) {
      t.done = true;
      G.fx.push({ type: 'ring', x: t.x, y: t.y, r: t.r, t: 0, dur: 0.35, col: t.col }); G.shake = 0.25;
      if (Math.hypot(p.x - t.x, p.y - t.y) < t.r + 8) hurtPlayer(t.dmg);
    }
  }
  G.teles = G.teles.filter(t => !t.done);
  // 掉落
  for (const o of G.drops) {
    o.t += dt;
    if (rt.dead || o.t < 0.35) continue;
    const dx = p.x - o.x, dy = p.y - o.y, d = Math.hypot(dx, dy) || 1;
    const canTake = o.it.gold || o.it.eq ? (o.it.gold || G.p.inv.includes(null)) : (G.p.inv.includes(null) || G.p.inv.some(x => x && x.id === o.it.id));
    if (!canTake) { if (d < 40 && G.fullT <= 0) { msg('背包满了！快去清理一下吧', '#ff8a8a'); G.fullT = 4; } continue; }
    if (d < 100) { o.x += dx / d * 420 * dt; o.y += dy / d * 420 * dt; }
    if (d < 26) {
      o.got = true; sfx('pick');
      if (o.it.gold) { p.gold += o.it.gold; addText(p.x, p.y - 50, '+' + o.it.gold + ' 金币', '#ffd23f'); }
      else {
        addItem(o.it);
        const col = o.it.eq ? RAR[o.it.rar].c : '#ffffff';
        msg(`获得 ${o.it.eq ? '[' + RAR[o.it.rar].n + '] ' : ''}${itemName(o.it)}`, o.it.eq && o.it.rar === 0 ? '#dddddd' : col);
        uiDirty();
      }
    }
  }
  G.drops = G.drops.filter(o => !o.got && o.t < 90);
  // 特效
  for (const f of G.fx) { f.t += dt; if (f.type === 'part') { f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 300 * dt; } }
  G.fx = G.fx.filter(f => f.t < f.dur);
  for (const t of G.texts) { t.t += dt; t.y -= 42 * dt; }
  G.texts = G.texts.filter(t => t.t < 0.9);
  // 宠物
  if (p.pet) {
    if (!G.pet) G.pet = { x: p.x - 30, y: p.y, atkT: 1, anim: 0, face: 1 };
    const pt = G.pet, tx = p.x - rt.dir * 36, ty = p.y - 4, dx = tx - pt.x, dy = ty - pt.y, d = Math.hypot(dx, dy);
    pt.anim += dt;
    if (d > 320) { pt.x = tx; pt.y = ty; } else if (d > 6) { const s = Math.min(d, (d > 90 ? 420 : 200) * dt); pt.x += dx / d * s; pt.y += dy / d * s; pt.face = dx > 0 ? 1 : -1; }
    pt.atkT -= dt;
    if (pt.atkT <= 0 && !rt.dead) {
      const m = nearestMon(300, pt, x => x.state === 'chase');
      if (m) {
        pt.atkT = 1.2; const ddx = m.x - pt.x, ddy = m.y - pt.y, dd = Math.hypot(ddx, ddy) || 1; pt.face = ddx > 0 ? 1 : -1;
        G.projs.push({ x: pt.x, y: pt.y, vx: ddx / dd * 480, vy: ddy / dd * 480, life: 0.8, from: 'p', mul: 0.35, r: 6, col: PETS[p.pet].c, kind: 'orb', hit: new Set() });
      }
    }
  } else G.pet = null;
  updCam();
  G.saveT += dt; if (G.saveT > 30) { G.saveT = 0; save(); }
}
function updCam(snap) {
  const p = G.p, m = G.map, W = m.w * TILE, H = m.h * TILE;
  const tx = clamp(p.x - VW / 2, 0, Math.max(0, W - VW)), ty = clamp(p.y - 30 - VH / 2, 0, Math.max(0, H - VH));
  if (snap) { G.cam.x = tx; G.cam.y = ty; } else { G.cam.x += (tx - G.cam.x) * 0.15; G.cam.y += (ty - G.cam.y) * 0.15; }
}

/* ================= 渲染 ================= */
function label(c, s, x, y, col, size, bold) {
  c.font = `${bold ? 'bold ' : ''}${size || 12}px "PingFang SC","Microsoft YaHei",sans-serif`; c.textAlign = 'center';
  c.lineWidth = 3; c.strokeStyle = 'rgba(40,24,16,.85)'; c.strokeText(s, x, y); c.fillStyle = col || '#fff'; c.fillText(s, x, y);
}
function render() {
  const c = ctx;
  c.setTransform(KS, 0, 0, KS, 0, 0);
  if (G.state !== 'play') { renderTitle(c); return; }
  const m = G.map, th = m.th, p = G.p, rt = G.rt, T = m.T, w = m.w;
  let cx = G.cam.x, cy = G.cam.y;
  if (G.shake > 0) { cx += rnd(-4, 4); cy += rnd(-4, 4); }
  c.fillStyle = shade(th.g, -60); c.fillRect(0, 0, VW, VH);
  c.save(); c.translate(-cx, -cy);
  const x0 = Math.max(0, Math.floor(cx / TILE) - 1), x1 = Math.min(w - 1, Math.floor((cx + VW) / TILE) + 1);
  const y0 = Math.max(0, Math.floor(cy / TILE) - 1), y1 = Math.min(m.h - 1, Math.floor((cy + VH) / TILE) + 1);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    c.fillStyle = m.V[y * w + x] < 50 ? th.g : th.g2; c.fillRect(x * TILE, y * TILE, TILE + 1, TILE + 1);
  }
  // 路
  c.fillStyle = th.path; c.beginPath();
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (T[y * w + x] === 1) c.roundRect(x * TILE - 5, y * TILE - 5, TILE + 10, TILE + 10, 14);
  c.fill();
  // 液体
  for (let pass = 0; pass < 2; pass++) {
    c.fillStyle = pass ? th.liq : th.rim; c.beginPath(); const e = pass ? 0 : 5;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (T[y * w + x] === 2) c.roundRect(x * TILE - e, y * TILE - e, TILE + e * 2, TILE + e * 2, 12);
    c.fill();
  }
  // 地面点缀
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * w + x, v = m.V[i];
    if (T[i] === 0 && v < 14) {
      const px = x * TILE + 8 + (v * 7) % 30, py = y * TILE + 10 + (v * 13) % 28;
      c.fillStyle = th.deco; c.beginPath(); c.arc(px, py, 3, 0, 7); c.arc(px + 7, py + 4, 2.2, 0, 7); c.fill();
      c.fillStyle = 'rgba(255,255,255,.7)'; c.beginPath(); c.arc(px, py, 1.1, 0, 7); c.fill();
    } else if (T[i] === 2 && v < 30) {
      c.fillStyle = `rgba(255,255,255,${0.25 + Math.sin(G.t * 2 + v) * 0.15})`;
      c.fillRect(x * TILE + (v * 5) % 28, y * TILE + (v * 11) % 36, 12, 2.5);
    }
  }
  // 传送门
  for (const po of m.portals) {
    for (let i = 0; i < 3; i++) {
      c.save(); c.translate(po.x, po.y - 22); c.rotate(G.t * (1.2 + i * 0.5) + i * 2);
      c.beginPath(); c.ellipse(0, 0, 24 - i * 6, 30 - i * 7, 0, 0, 6.3);
      c.fillStyle = ['rgba(120,90,255,.55)', 'rgba(110,200,255,.6)', 'rgba(255,255,255,.75)'][i]; c.fill(); c.restore();
    }
    const to = MAPS[po.to];
    label(c, `➤ ${to.name}`, po.x, po.y - 62, p.lv >= to.req ? '#b8f0ff' : '#ff9a9a', 13, true);
    if (to.req > 1) label(c, `需要 Lv.${to.req}`, po.x, po.y - 78, p.lv >= to.req ? '#fff' : '#ff9a9a', 11);
  }
  // 预警圈
  for (const t of G.teles) {
    const k = t.friendly ? 0.5 : Math.min(1, t.t / t.delay);
    c.beginPath(); c.ellipse(t.x, t.y, t.r, t.r * 0.8, 0, 0, 6.3); c.fillStyle = `rgba(${t.col},${t.friendly ? 0.18 : 0.15 + k * 0.25})`; c.fill();
    c.strokeStyle = `rgba(${t.col},.9)`; c.lineWidth = 2; c.stroke();
    if (!t.friendly) { c.beginPath(); c.ellipse(t.x, t.y, t.r * k, t.r * 0.8 * k, 0, 0, 6.3); c.fillStyle = `rgba(${t.col},.3)`; c.fill(); }
  }
  // 掉落
  for (const o of G.drops) {
    const b = Math.abs(Math.sin(o.t * 4)) * 5 * Math.max(0, 1 - o.t * 0.4) + Math.sin(o.t * 3) * 1.5;
    ell(c, o.x, o.y + 6, 9, 3.5, 'rgba(0,0,0,.2)', null);
    if (o.it.eq && o.it.rar > 0) { c.beginPath(); c.arc(o.x, o.y - 6 - b, 14, 0, 7); c.fillStyle = RAR[o.it.rar].c + '55'; c.fill(); }
    c.font = '20px serif'; c.textAlign = 'center'; c.fillStyle = '#000';
    c.fillText(o.it.gold ? '🪙' : o.it.eq ? o.it.icon : ITEMS[o.it.id].icon, o.x, o.y - b);
  }
  // 深度排序
  const list = [];
  for (const o of m.objs) if (o.x > cx - 90 && o.x < cx + VW + 90 && o.y > cy - 20 && o.y < cy + VH + 130) list.push({ y: o.y, o });
  for (const mo of G.mons) if (!mo.dead && mo.x > cx - 120 && mo.x < cx + VW + 120 && mo.y > cy - 60 && mo.y < cy + VH + 160) list.push({ y: mo.y, m: mo });
  for (const n of m.npcs) list.push({ y: n.y, n });
  list.push({ y: p.y, pl: 1 });
  if (G.pet) list.push({ y: G.pet.y, pet: 1 });
  list.sort((a, b) => a.y - b.y);
  for (const e of list) {
    if (e.o) { c.save(); c.translate(e.o.x, e.o.y); drawObj(c, e.o.type, th, e.o.s, G.t, e.o); c.restore(); }
    else if (e.m) drawMonster(c, e.m);
    else if (e.n) {
      const n = e.n; c.save(); c.translate(n.x, n.y); ell(c, 0, 0, 13, 5, 'rgba(0,0,0,.2)', null);
      c.save(); c.scale(p.x < n.x ? -1 : 1, 1); drawChibi(c, n, G.t + n.tx, false, 0); c.restore();
      label(c, n.name, 0, -66, '#ffe9a8', 12, true);
      c.font = '18px serif'; c.fillText(n.icon, 0, -82 + Math.sin(G.t * 3 + n.tx) * 3);
      c.restore();
    } else if (e.pet) {
      const pt = G.pet, d = PETS[p.pet]; c.save(); c.translate(pt.x, pt.y); ell(c, 0, 0, 9, 3.5, 'rgba(0,0,0,.2)', null);
      c.scale(pt.face * 0.62, 0.62); drawMon(c, d.shape, d.c, pt.anim); c.restore();
    } else {
      c.save(); c.translate(p.x, p.y); ell(c, 0, 0, 13, 5, 'rgba(0,0,0,.22)', null);
      if (rt.dead) { c.rotate(Math.PI / 2 * rt.dir); c.translate(-14, -6); c.globalAlpha = 0.7; }
      else if (rt.inv > 0 && Math.sin(G.t * 30) > 0) c.globalAlpha = 0.5;
      c.save(); c.scale(rt.dir, 1);
      const C = CLASSES[p.cls];
      drawChibi(c, { hair: C.hair, cloth: rt.hurtT > 0 ? '#ff8a8a' : C.cloth, hat: C.hat, weapon: p.cls }, rt.moving ? rt.walk : G.t, rt.moving, rt.swing);
      c.restore(); c.globalAlpha = 1;
      if (!rt.dead) label(c, p.name, 0, p.cls === 'mage' ? -74 : -58, '#8affb0', 12, true);
      c.restore();
    }
  }
  // 弹道
  for (const o of G.projs) {
    const y = o.y - 18;
    if (o.kind === 'arrow') {
      const a = Math.atan2(o.vy, o.vx); c.save(); c.translate(o.x, y); c.rotate(a);
      line(c, -14, 0, 8, 0, o.col, o.r > 8 ? 4 : 2.5); poly(c, [8, -4, 15, 0, 8, 4], '#fff', null); c.restore();
    } else {
      c.beginPath(); c.arc(o.x, y, o.r + 4, 0, 7); c.fillStyle = (o.col.length === 7 ? o.col : '#ffffff') + '55'; c.fill();
      c.beginPath(); c.arc(o.x, y, o.r, 0, 7); c.fillStyle = o.col; c.fill();
      c.beginPath(); c.arc(o.x - 2, y - 2, o.r * 0.4, 0, 7); c.fillStyle = '#fff'; c.fill();
    }
  }
  // 特效
  for (const f of G.fx) {
    const k = f.t / f.dur;
    if (f.type === 'part') { c.globalAlpha = 1 - k; c.fillStyle = f.col; c.beginPath(); c.arc(f.x, f.y, f.size * (1 - k * 0.5), 0, 7); c.fill(); c.globalAlpha = 1; }
    else if (f.type === 'ring') {
      c.beginPath(); c.ellipse(f.x, f.y, f.r * (0.3 + k * 0.7), f.r * 0.8 * (0.3 + k * 0.7), 0, 0, 6.3);
      c.strokeStyle = `rgba(${f.col},${1 - k})`; c.lineWidth = 8 * (1 - k) + 2; c.stroke(); c.fillStyle = `rgba(${f.col},${0.25 * (1 - k)})`; c.fill();
    } else if (f.type === 'slash') {
      c.beginPath(); c.arc(f.x, f.y, 48, f.ang - 1.2 + k * 0.8, f.ang - 0.2 + k * 1.4);
      c.strokeStyle = `rgba(255,255,255,${1 - k})`; c.lineWidth = 12 * (1 - k) + 2; c.lineCap = 'round'; c.stroke(); c.lineCap = 'butt';
    } else if (f.type === 'fall') {
      const h = (1 - k) * 160; line(c, f.x + h * 0.3, f.y - h - 26, f.x + h * 0.3 * 0.2, f.y - h * 0.2, `rgba(${f.col},.9)`, 5);
      if (k > 0.8) { c.beginPath(); c.ellipse(f.x, f.y, 18, 12, 0, 0, 6.3); c.fillStyle = `rgba(${f.col},.5)`; c.fill(); }
    }
  }
  for (const t of G.texts) { c.globalAlpha = Math.min(1, (0.9 - t.t) * 3); label(c, t.s, t.x, t.y, t.col, t.big ? 20 : 14, true); c.globalAlpha = 1; }
  c.restore();
  // 暗角
  if (th.dark) {
    const g = c.createRadialGradient(p.x - cx, p.y - cy - 20, 130, p.x - cx, p.y - cy - 20, 560);
    g.addColorStop(0, 'rgba(10,8,30,0)'); g.addColorStop(1, `rgba(10,8,30,${Math.min(0.85, th.dark * 2.4)})`);
    c.fillStyle = g; c.fillRect(0, 0, VW, VH);
  }
  if (rt.dead) { c.fillStyle = 'rgba(40,0,0,.45)'; c.fillRect(0, 0, VW, VH); label(c, `复活倒计时 ${Math.ceil(rt.deadT)}`, VW / 2, VH / 2, '#fff', 30, true); }
  // 首领血条
  const boss = G.mons.find(b => b.boss && !b.dead && (b.state === 'chase' || b.hp < b.maxHp));
  if (boss) {
    const bw = 420, bx = (VW - bw) / 2, by = 64;
    rr(c, bx - 3, by - 3, bw + 6, 22, 11, '#3a2418', '#ffd23f');
    rr(c, bx, by, Math.max(8, bw * boss.hp / boss.maxHp), 16, 8, boss.hp < boss.maxHp * 0.5 ? '#ff4a4a' : '#ff7a4a', null);
    label(c, `👑 ${boss.d.name}  Lv.${boss.lv}   ${Math.ceil(boss.hp)} / ${boss.maxHp}`, VW / 2, by + 13, '#fff', 12, true);
  }
}
function drawMonster(c, m) {
  c.save(); c.translate(m.x, m.y);
  ell(c, 0, 0, m.r, m.r * 0.38, 'rgba(0,0,0,.2)', null);
  c.save();
  if (m.wind > 0) c.translate(m.face * 4, -4);
  c.scale(m.face * m.sc, m.sc);
  if (m.hurtT > 0) c.globalAlpha = 0.55;
  if (m.elite) { c.shadowColor = '#ffd23f'; c.shadowBlur = 16; }
  drawMon(c, m.d.shape, m.d.c, m.anim);
  c.restore();
  const top = -m.h - 10, pl = G.p.lv;
  if (m.boss) { c.font = `${22}px serif`; c.textAlign = 'center'; c.fillText('👑', 0, top - 14 + Math.sin(m.anim * 3) * 2); }
  label(c, `${m.elite ? '★精英·' : ''}${m.d.name} Lv.${m.lv}`, 0, top, m.boss ? '#ffb84a' : m.elite ? '#ffe14a' : m.lv > pl + 5 ? '#ff8a8a' : '#fff', m.boss ? 14 : 11, m.boss || m.elite);
  if (m.hp < m.maxHp && !m.boss) {
    const bw = 40 * m.sc; rr(c, -bw / 2, top + 4, bw, 5, 2.5, '#3a2418', null); rr(c, -bw / 2, top + 4, Math.max(2, bw * m.hp / m.maxHp), 5, 2.5, '#ff5a5a', null);
  }
  if (m.stun > 0) label(c, '💫', 0, top - 14, '#fff', 16);
  if (m.slow > 0) label(c, '❄', m.r, top + 14, '#8fd8ff', 14);
  c.restore();
}
const TITLE_MONS = [['slime', '#8be05a'], ['shroom', '#ff7a7a'], ['bat', '#8a6ad0'], ['dragon', '#e8483a'], ['ghost', '#d0d0ff'], ['golem', '#f0c850'], ['sprite', '#ff8a3a'], ['beast', '#c98a5a']];
function renderTitle(c) {
  const t = performance.now() / 1000;
  const g = c.createLinearGradient(0, 0, 0, VH); g.addColorStop(0, '#8fd8ff'); g.addColorStop(0.6, '#d8f4ff'); g.addColorStop(0.61, '#93d86e'); g.addColorStop(1, '#6fbf58');
  c.fillStyle = g; c.fillRect(0, 0, VW, VH);
  for (let i = 0; i < 6; i++) { c.save(); c.translate(((i * 210 + t * (12 + i * 3)) % (VW + 200)) - 100, 60 + (i * 53) % 150); c.scale(1.6, 1.6); drawObj(c, 'cloud', THEMES.sky, 0.5, t, {}); c.restore(); }
  TITLE_MONS.forEach((mm, i) => {
    c.save(); c.translate(70 + i * 128, 600 - Math.abs(Math.sin(t * 2 + i)) * 14); c.scale(i % 2 ? -1.5 : 1.5, 1.5);
    drawMon(c, mm[0], mm[1], t + i); c.restore();
  });
}

function loop(ts) {
  const dt = Math.min(0.05, (ts - (loop.last || ts)) / 1000); loop.last = ts;
  if (G.state === 'play') { update(dt); hudTick(dt); }
  if (BGM.el) BGM.el.muted = AUD.muted;
  render();
  requestAnimationFrame(loop);
}
