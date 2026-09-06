(() => {
// ================= 小蜜蜂 Galaga =================
// 阵型入场 / 俯冲 / Boss抓机 / 双机合体 / 奖励关 / 双人协作
const STR = window.GAME_STR || { zh: {}, en: {} };
const T = (k, ...a) => AMG.tf(STR, k, ...a);
const W = 480, H = 640;
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const $ = id => document.getElementById(id);
const dpr = Math.min(window.devicePixelRatio || 1, 2);
canvas.width = W * dpr; canvas.height = H * dpr;
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

const store = {
  get best() { return +(localStorage.getItem('galaga-best') || 0); },
  set best(v) { localStorage.setItem('galaga-best', v); },
  get muted() { return localStorage.getItem('galaga-muted') === '1'; },
  set muted(v) { localStorage.setItem('galaga-muted', v ? '1' : '0'); },
  get music() { return localStorage.getItem('galaga-music') !== '0'; },
  set music(v) { localStorage.setItem('galaga-music', v ? '1' : '0'); }
};

// ---------- 音频 ----------
let actx = null, muted = store.muted, musicOn = store.music;
function ac() {
  if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
  if (actx.state === 'suspended') actx.resume();
  return actx;
}
function tone(f, dur, type, vol, slide) {
  if (muted) return;
  try {
    const a = ac(), o = a.createOscillator(), g = a.createGain();
    o.type = type || 'square'; o.frequency.setValueAtTime(f, a.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), a.currentTime + dur);
    g.gain.setValueAtTime(vol || .09, a.currentTime);
    g.gain.exponentialRampToValueAtTime(.001, a.currentTime + dur);
    o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + dur);
  } catch (e) {}
}
function noise(dur, vol) {
  if (muted) return;
  try {
    const a = ac(), n = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const s = a.createBufferSource(), g = a.createGain();
    s.buffer = buf; g.gain.value = vol || .2;
    s.connect(g); g.connect(a.destination); s.start();
  } catch (e) {}
}
const sfx = {
  shoot: () => tone(880, .1, 'square', .06, 440),
  eshoot: () => tone(330, .14, 'sawtooth', .045, -120),
  boom: () => noise(.3, .28),
  bigboom: () => noise(.55, .34),
  capture: () => { [300, 400, 500, 700].forEach((f, i) => setTimeout(() => tone(f, .14, 'sine', .1), i * 100)); },
  rescue: () => { [700, 500, 400, 900].forEach((f, i) => setTimeout(() => tone(f, .13, 'sine', .1), i * 90)); },
  bonus: () => { [523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => tone(f, .15, 'square', .09), i * 100)); },
  clear: () => { [523, 523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, .15, 'square', .09), i * 110)); },
  dive: () => tone(200, .4, 'sawtooth', .05, 500),
  click: () => tone(700, .07, 'sine', .1),
};
const midi = m => 440 * Math.pow(2, (m - 69) / 12);
const Music = {
  timer: null, step: 0, next: 0,
  lead: [76, 0, 79, 0, 81, 0, 79, 76, 74, 0, 72, 0, 74, 0, 76, 0],
  bass: [48, 0, 48, 0, 55, 0, 53, 0],
  start() {
    this.stop();
    if (!musicOn) return;
    this.step = 0;
    try { this.next = ac().currentTime + .1; } catch (e) { return; }
    this.timer = setInterval(() => this.tick(), 120);
  },
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; },
  tick() {
    if (muted || !musicOn) return;
    try {
      const a = ac();
      while (this.next < a.currentTime + .35) {
        const l = this.lead[this.step % this.lead.length];
        const b = this.bass[this.step % this.bass.length];
        if (l) this.note(midi(l), this.next, .13, 'square', .035);
        if (b) this.note(midi(b), this.next, .13, 'triangle', .07);
        this.next += .16;
        this.step++;
      }
    } catch (e) {}
  },
  note(f, t, dur, type, vol) {
    const a = ac(), o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(.001, t + dur);
    o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dur);
  }
};

// ---------- 输入 ----------
const keys = { l: false, r: false, fire: false, l2: false, r2: false, fire2: false };
function setKey(code, down) {
  if (code === 'ArrowLeft' || code === 'KeyA') keys.l = down;
  else if (code === 'ArrowRight' || code === 'KeyD') keys.r = down;
  else if (code === 'KeyZ' || code === 'Space') keys.fire = down;
  else if (code === 'KeyJ') keys.l2 = down;
  else if (code === 'KeyK') keys.r2 = down;
  else if (code === 'KeyL') keys.fire2 = down;
}
window.addEventListener('keydown', e => {
  if (['ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  setKey(e.code, true);
  if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
  if (e.code === 'KeyM') toggleMute();
  if (e.code === 'KeyR' || e.code === 'Enter') {
    if (G.state === 'over') retryAll();
    else if (G.state === 'menu') startGame(G.mode);
  }
});
window.addEventListener('keyup', e => setKey(e.code, false));
function bindTouch(id, prop) {
  const el = $(id);
  const on = e => { e.preventDefault(); keys[prop] = true; };
  const off = e => { e.preventDefault(); keys[prop] = false; };
  el.addEventListener('pointerdown', on);
  el.addEventListener('pointerup', off);
  el.addEventListener('pointercancel', off);
  el.addEventListener('pointerleave', off);
}
bindTouch('t-left', 'l'); bindTouch('t-right', 'r'); bindTouch('t-a', 'fire');

// ---------- 状态 ----------
const PY = H - 70;
const G = {
  state: 'menu', mode: 'solo', t: 0, stage: 1,
  score: 0, lives: 3, best: store.best, newBest: false,
  players: [], enemies: [], bullets: [], ebullets: [], parts: [], floats: [],
  stars: [], entering: [], diveT: 0, bossBeam: null, captured: null,
  dual: false, stageT: 0, introT: 0, overT: 0, clearT: 0,
  challenge: false, challLeft: 0, challBonus: 0,
  shake: 0, scored0: 0, kills: 0,
};
for (let i = 0; i < 90; i++) G.stars.push({ x: Math.random() * W, y: Math.random() * H, s: .5 + Math.random() * 2, v: 40 + Math.random() * 130 });

const SCORES = { zako: 50, goei: 80, boss: 150 };
const FORM_Y = [120, 165, 210, 250]; // boss, goei, zako, zako 行

function formationSlots(stage) {
  // 随关卡加数量：boss 4→6, goei 8→10, zako row 10+10 → 12+12
  const hard = Math.min(1, (stage - 1) / 5);
  const nb = stage >= 3 ? 6 : 4;
  const ng = stage >= 2 ? 10 : 8;
  const nz = 10 + Math.floor(hard * 4);
  const slots = [];
  for (let i = 0; i < nb; i++) slots.push({ type: 'boss', col: i - (nb - 1) / 2 });
  for (let i = 0; i < ng; i++) slots.push({ type: 'goei', col: i - (ng - 1) / 2 });
  for (let i = 0; i < nz; i++) slots.push({ type: 'zako', col: i - (nz - 1) / 2, row: 2 });
  for (let i = 0; i < nz; i++) slots.push({ type: 'zako', col: i - (nz - 1) / 2, row: 3 });
  return slots;
}
const MAX_PER_LINE = 10, COL_W = 38, ROW_Y = { boss: 0, goei: 1, zako: 2 };
function slotPos(slot) {
  // 分行排布，避免 24 列挤爆：每行最多 10 个，分两段错开
  const row = slot.type === 'boss' ? 0 : slot.type === 'goei' ? 1 : (slot.row || 2);
  const siblings = G._slots ? G._slots.filter(s => (s.type === 'boss' ? 0 : s.type === 'goei' ? 1 : (s.row || 2)) === row).length : 10;
  const idx = slot._idx || 0;
  const n = Math.max(siblings, 1);
  const x = W / 2 + (idx - (n - 1) / 2) * Math.min(COL_W, (W - 80) / Math.max(n - 1, 1));
  return { x, y: FORM_Y[row] };
}

function newPlayer(x, p2) {
  return { x, y: PY, w: 30, h: 26, vx: 0, cd: 0, alive: true, p2: !!p2, respawn: 0, warp: 0 };
}
function resetCommon() {
  G.enemies = []; G.bullets = []; G.ebullets = []; G.parts = []; G.floats = [];
  G.entering = []; G.bossBeam = null; G.captured = null; G.dual = false;
  G.diveT = 2.5; G.shake = 0;
}
function startGame(mode) {
  G.mode = mode || 'solo';
  G.score = 0; G.lives = 3; G.stage = 1; G.newBest = false; G.kills = 0; G._extend = 0;
  startStage(1);
}
function startStage(stage) {
  G.stage = stage;
  G.challenge = stage % 3 === 0; // 3/6/9…为奖励关
  const keepDual = !!G.dual;
  resetCommon();
  G.dual = keepDual;
  G.players = [newPlayer(W / 2, false)];
  if (G.mode === 'coop') G.players.push(newPlayer(W / 2 + 60, true));
  G.state = 'intro'; G.introT = 0; G.stageT = 0; G.clearT = 0;
  G.scored0 = G.score;
  // 入场队列：分批曲线入场
  const slots = formationSlots(stage);
  G._slots = slots;
  slots.forEach((s, i) => s._idx = i % Math.max(1, slots.filter(o => (o.type === 'boss' ? 0 : o.type === 'goei' ? 1 : (o.row || 2)) === (s.type === 'boss' ? 0 : s.type === 'goei' ? 1 : (s.row || 2))).length));
  // 按类型分组编号，保证同行内 _idx 连续
  const counters = {};
  slots.forEach(s => {
    const row = s.type === 'boss' ? 0 : s.type === 'goei' ? 1 : (s.row || 2);
    counters[row] = counters[row] || 0;
    s._idx = counters[row]++;
  });
  slots.forEach((s, i) => {
    G.entering.push({ slot: s, t: -i * .28, side: i % 2 ? 1 : -1, x: 0, y: 0, done: false });
  });
  if (G.challenge) {
    // 奖励关：40 只 zako，直线编队入场后定点跳舞，不射击
    G.entering = [];
    for (let i = 0; i < 40; i++) {
      G.entering.push({ slot: { type: 'zako', chall: true, ci: i }, t: -i * .22, side: i % 2 ? 1 : -1, x: 0, y: 0, done: false });
    }
    G.challLeft = 40; G.challBonus = 0;
  }
  showScreen(null);
  $('btn-pause').classList.add('hidden');
  Music.stop();
  sfx.capture();
}

// 入场曲线：从屏幕上方两侧盘旋进入阵型位
function entryPos(e, total) {
  const p = slotPos(e.slot);
  if (e.slot.chall) {
    // 奖励关阵型：8 列 × 5 行
    const ci = e.slot.ci, cols = 8;
    p.x = W / 2 + (ci % cols - (cols - 1) / 2) * 44;
    p.y = 110 + Math.floor(ci / cols) * 36;
  }
  const t = e.t;
  if (t < 0) return { x: e.side > 0 ? W + 40 : -40, y: -30, a: 0 };
  const dur = 2.6;
  const k = Math.min(1, t / dur);
  const sx = e.side > 0 ? W + 40 : -40, sy = -30;
  // 三段：俯冲下来 → 绕圈 → 归位
  const x = sx + (p.x - sx) * k + Math.sin(k * Math.PI * 3 + (e.side > 0 ? 0 : Math.PI)) * 120 * (1 - k);
  const y = sy + (p.y - sy) * (k * k * .6 + k * .4) + Math.abs(Math.sin(k * Math.PI * 2)) * 60 * (1 - k);
  return { x, y, a: k };
}

function overlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
function addScore(n, x, y) {
  G.score += n;
  checkExtend();
  if (x !== undefined) G.floats.push({ x, y, text: '+' + n, age: 0 });
}
function boom(x, y, big, color) {
  sfx[big ? 'bigboom' : 'boom']();
  for (let i = 0; i < (big ? 26 : 12); i++) {
    G.parts.push({ x, y, vx: (Math.random() - .5) * 360, vy: (Math.random() - .5) * 360, life: .5 + Math.random() * .4, age: 0, r: 2 + Math.random() * 3, c: color || ['#ffd93d', '#ff8c42', '#fff'][Math.random() * 3 | 0] });
  }
}

// ---------- 俯冲 / 抓机 ----------
function tryDive() {
  // 选一个在阵型中的敌机开始俯冲（boss 优先抓机）
  const cands = G.enemies.filter(e => e.mode === 'form' && !e.diving);
  if (!cands.length || G.bossBeam) return;
  const boss = cands.find(e => e.type === 'boss' && !G.captured && G.players.some(p => p.alive));
  let e;
  if (boss && Math.random() < .45 + G.stage * .05) e = boss;
  else e = cands[Math.random() * cands.length | 0];
  e.diving = true; e.diveT = 0; e.diveKind = e.type === 'boss' && !G.captured && G.players.some(p => p.alive) && Math.random() < .5 ? 'capture' : 'attack';
  if (e.diveKind === 'capture') { e.hp = 2; }
  sfx.dive();
}
function fireEnemy(e) {
  if (G.challenge) return;
  const p = G.players.find(p => p.alive);
  if (!p) return;
  const dx = (p.x - e.x) * .0015;
  G.ebullets.push({ x: e.x, y: e.y + 14, w: 5, h: 12, vx: dx * 200 * .5, vy: 200 + G.stage * 12, life: 5 });
  sfx.eshoot();
}

// 玩家被击中
function hitPlayer(p) {
  if (!p.alive || G.state !== 'play') return;
  boom(p.x + p.w / 2, p.y + p.h / 2, true, ['#5ee6ff', '#fff', '#ffd93d']);
  G.shake = 10;
  if (G.dual && !p.p2) {
    // 双机时只损失一架
    G.dual = false;
    p.warp = 1.2;
    float(p.x, p.y - 20, T('floatSolo'));
    return;
  }
  p.alive = false; p.respawn = 1.6;
  G.lives--;
  checkExtend();
  if (G.lives < 0) { gameOver(); }
}
// 分数奖励命：3万、10万各奖一命（经典规则）
function checkExtend() {
  if (G.state !== 'play') return;
  G._extend = G._extend || 0;
  const marks = [30000, 100000];
  if (G._extend < marks.length && G.score >= marks[G._extend]) {
    G._extend++;
    G.lives++;
    float(W / 2, H / 2 - 40, T('floatLife'));
    sfx.rescue();
  }
}
function float(x, y, text) { G.floats.push({ x, y, text, age: 0 }); }

// Boss 牵引光束抓住玩家
function capturePlayer(boss, p) {
  G.captured = { boss, px: p.x, py: p.y, t: 0 };
  G.bossBeam = null;
  boss.diving = false; boss.mode = 'return'; boss.retT = 0;
  sfx.capture();
  float(p.x, p.y - 24, T('floatCaptured'));
  G.dual = false;
  G.lives--;
  if (G.lives < 0) {
    p.alive = false; p.respawn = 0;
    gameOver();
    return;
  }
  p.alive = false;
  p.respawn = 1.6;
}
// 救回：击落带着战机的 boss（返回途中或回阵后均可）
function rescueCheck(boss) {
  if (G.captured && G.captured.boss === boss) {
    G.captured = null;
    G.dual = true;
    const p = G.players[0];
    p.alive = true;
    p.respawn = 0;
    p.warp = 1.2;
    if (p.y > H - 80) { p.x = W / 2; p.y = PY; }
    addScore(1500, boss.x, boss.y);
    float(boss.x, boss.y - 20, T('floatRescue'));
    sfx.rescue();
    return true;
  }
  return false;
}

// ---------- 流程 ----------
function showScreen(name) {
  const screens = { menu: $('screen-menu'), pause: $('screen-pause'), clear: $('screen-clear'), over: $('screen-over') };
  for (const k in screens) screens[k].classList.toggle('hidden', k !== name);
  if (!name) for (const k in screens) screens[k].classList.add('hidden');
  $('btn-pause').classList.toggle('hidden', G.state !== 'play');
}
function refreshMenu() { $('menu-best').textContent = T('best', Math.max(store.best, G.score)); }
function toMenu() { G.state = 'menu'; Music.stop(); refreshMenu(); showScreen('menu'); }
function togglePause(force) {
  if (G.state === 'play') { G.state = 'pause'; showScreen('pause'); Music.stop(); }
  else if (G.state === 'pause' && !force) { G.state = 'play'; showScreen(null); $('btn-pause').classList.remove('hidden'); Music.start(); }
}
function stageClear() {
  const gained = G.score - G.scored0;
  if (G.challenge) {
    if (G.challLeft <= 0) { addScore(10000, W / 2, H / 2 - 60); float(W / 2, H / 2 - 90, 'PERFECT +10000'); }
    G.challBonus = G.challLeft <= 0 ? 10000 : 0;
  }
  if (G.score > store.best) store.best = G.score;
  Music.stop(); sfx.clear();
  G.state = 'clear';
  $('clear-stage').textContent = G.stage;
  $('clear-stats').innerHTML =
    '<div>' + T('clearScore', gained) + '</div>' +
    (G.challenge ? '<div>' + T('challLine', G.challLeft, G.challBonus) + '</div>' : '') +
    '<div>' + T('killsLine', G.kills, Math.max(0, G.lives)) + '</div>' +
    (G.dual ? '<div>' + T('dualKeep') + '</div>' : '');
  setTimeout(() => showScreen('clear'), 700);
}
function gameOver() {
  G.state = 'over';
  Music.stop();
  const isNew = G.score > store.best;
  G.newBest = isNew;
  if (isNew) store.best = G.score;
  $('final-score').textContent = G.score;
  $('final-best').textContent = store.best;
  $('new-record').classList.toggle('hidden', !isNew);
  G.overT = .5;
}
function retryAll() {
  startGame(G.mode);
}

// ---------- 更新 ----------
let last = performance.now();
function loop(now) {
  const dt = Math.min((now - last) / 1000, .033);
  last = now;
  if (G.state !== 'pause' && G.state !== 'menu') update(dt);
  else G.t += dt;
  render();
  requestAnimationFrame(loop);
}

function update(dt) {
  G.t += dt;
  for (const s of G.stars) { s.y += s.v * dt; if (s.y > H) { s.y = -4; s.x = Math.random() * W; } }
  if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 30);
  for (let i = G.parts.length - 1; i >= 0; i--) {
    const p = G.parts[i];
    p.age += dt;
    if (p.age > p.life) { G.parts.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vx *= .98; p.vy *= .98;
  }
  for (let i = G.floats.length - 1; i >= 0; i--) {
    const f = G.floats[i];
    f.age += dt; f.y -= 40 * dt;
    if (f.age > 1.1) G.floats.splice(i, 1);
  }

  if (G.state === 'intro') {
    G.introT += dt;
    if (G.introT > 1.4) { G.state = 'play'; $('btn-pause').classList.remove('hidden'); Music.start(); }
    return;
  }
  if (G.state === 'over') {
    if (G.overT > 0) { G.overT -= dt; if (G.overT <= 0) showScreen('over'); }
    return;
  }
  if (G.state === 'clear') return;
  if (G.state !== 'play') return;
  G.stageT += dt;

  // ---- 玩家 ----
  for (const p of G.players) {
    if (p.warp > 0) p.warp -= dt;
    if (!p.alive) {
      if (p.respawn > 0) {
        p.respawn -= dt;
        if (p.respawn <= 0 && G.lives >= 0) {
          p.alive = true; p.x = W / 2 + (p.p2 ? 60 : -30); p.y = PY; p.warp = 1.2;
        }
      }
      continue;
    }
    const L = p.p2 ? keys.l2 : keys.l, R = p.p2 ? keys.r2 : keys.r;
    const sp = 340;
    if (L && !R) { p.x -= sp * dt; p.tilt = Math.max(-1, (p.tilt || 0) - dt * 8); }
    else if (R && !L) { p.x += sp * dt; p.tilt = Math.min(1, (p.tilt || 0) + dt * 8); }
    else p.tilt = (p.tilt || 0) * Math.max(0, 1 - dt * 10);
    p.x = Math.max(8, Math.min(W - 8 - (G.dual && !p.p2 ? p.w + 34 : p.w), p.x));
    if (p.cd > 0) p.cd -= dt;
    const F = p.p2 ? keys.fire2 : keys.fire;
    if (F && p.cd <= 0) {
      p.cd = G.dual && !p.p2 ? .22 : .16;
      const cx = p.x + p.w / 2;
      G.bullets.push({ x: cx - 3, y: p.y - 12, w: 6, h: 14, vy: -560, life: 2 });
      if (G.dual && !p.p2) G.bullets.push({ x: cx + 31, y: p.y - 12, w: 6, h: 14, vy: -560, life: 2 });
      sfx.shoot();
    }
  }

  // ---- 入场 ----
  for (const e of G.entering) {
    if (e.done) continue;
    e.t += dt;
    const total = 2.6;
    if (e.t >= total) {
      e.done = true;
      const p = slotPos(e.slot);
      G.enemies.push(makeEnemy(e.slot, p.x, p.y));
    }
  }
  if (G.entering.length && G.entering.every(e => e.done)) { /* 入场完毕 */ }

  // ---- 俯冲调度 ----
  G.diveT -= dt;
  const formed = G.enemies.filter(e => e.mode === 'form').length;
  if (G.diveT <= 0 && formed > 0 && !G.challenge) {
    tryDive();
    G.diveT = Math.max(1.6, 3.2 - G.stage * .2);
  }
  // 阵型敌机偶尔开火（限制屏幕上敌方子弹数，避免弹幕过密）
  if (!G.challenge && G.ebullets.length < 3 + G.stage && Math.random() < dt * (1 + G.stage * .25) && formed > 0) {
    const shooters = G.enemies.filter(e => e.mode === 'form');
    fireEnemy(shooters[Math.random() * shooters.length | 0]);
  }

  // ---- 敌机 ----
  for (let i = G.enemies.length - 1; i >= 0; i--) {
    const e = G.enemies[i];
    e.animT = (e.animT || 0) + dt * 8;
    if (e.mode === 'dive' || e.diving) updateDive(e, dt);
    else if (e.mode === 'return') {
      // 带战机返回阵型
      e.retT += dt;
      const p = slotPos(e.slot);
      e.x += (p.x - e.x) * Math.min(1, dt * 2);
      e.y += (p.y - e.y) * Math.min(1, dt * 2);
      if (Math.hypot(p.x - e.x, p.y - e.y) < 6) { e.mode = 'form'; e.x = p.x; e.y = p.y; }
      if (G.captured && G.captured.boss === e) { G.captured.px = e.x; G.captured.py = e.y - 30; }
    } else if (e.mode === 'form') {
      // 阵型内左右摇摆
      const p = slotPos(e.slot);
      e.x = p.x + Math.sin(G.t * 1.6 + e.slot._idx) * 8;
      e.y = p.y;
      if (e.shootCd === undefined) e.shootCd = 2 + Math.random() * 4;
    } else if (e.mode === 'chall') {
      // 奖励关：定点左右跳舞
      e.x = e.bx + Math.sin(G.t * 2 + e.ci) * 60;
      e.y = e.by + Math.sin(G.t * 3 + e.ci * 2) * 8;
    }
    // 飞出屏幕底部 → 回到顶部重新进入（attack 俯冲）或删除
    if (e.y > H + 40) {
      if (e.diveKind === 'attack' || e.mode === 'dive') {
        e.y = -30; e.x = Math.random() * (W - 60) + 30;
        e.mode = 'leave';
      } else {
        G.enemies.splice(i, 1);
        continue;
      }
    }
    if (e.mode === 'leave') {
      e.y += 160 * dt;
      const p = slotPos(e.slot);
      // 飞到顶部后归位
      if (e.y < 60) { e.x += (p.x - e.x) * dt * 1.5; }
      else { e.mode = 'form'; e.diving = false; const q = slotPos(e.slot); e.x = q.x; e.y = q.y; }
      if (e.y < -50) { e.mode = 'form'; e.diving = false; const q = slotPos(e.slot); e.x = q.x; e.y = q.y; }
    }
  }

  // ---- Boss 牵引光束 ----
  if (G.bossBeam) {
    const b = G.bossBeam;
    b.t += dt;
    // 光束持续 4s，范围内玩家被吸上去
    const bx = b.boss.x + b.boss.w / 2;
    for (const p of G.players) {
      if (!p.alive || p.p2 || p.warp > 0) continue;
      const cx = p.x + p.w / 2;
      if (Math.abs(cx - bx) < 34 && p.y > b.boss.y) {
        p.y -= 150 * dt;
        p.x += (bx - p.w / 2 - p.x) * dt * 3;
        if (p.y < b.boss.y + 44) { capturePlayer(b.boss, p); break; }
      }
    }
    // 光束期间 boss 不动
    if (G.bossBeam && b.t > 4) G.bossBeam = null;
  }
  // 被抓走的战机跟随 boss
  if (G.captured) {
    const c = G.captured;
    c.t += dt;
    const b = c.boss;
    // 若 boss 已死（理论上 rescueCheck 会清掉），保护一下
    if (!G.enemies.includes(b)) G.captured = null;
  }

  // ---- 子弹 ----
  for (let i = G.bullets.length - 1; i >= 0; i--) {
    const bl = G.bullets[i];
    bl.y += bl.vy * dt; bl.life -= dt;
    if (bl.y < -20 || bl.life <= 0) { G.bullets.splice(i, 1); continue; }
    // 打敌机
    for (let j = G.enemies.length - 1; j >= 0; j--) {
      const e = G.enemies[j];
      if (overlap(bl, e)) {
        G.bullets.splice(i, 1);
        damageEnemy(e, 1, bl.x, bl.y);
        break;
      }
    }
  }
  for (let i = G.ebullets.length - 1; i >= 0; i--) {
    const bl = G.ebullets[i];
    bl.x += bl.vx * dt; bl.y += bl.vy * dt; bl.life -= dt;
    if (bl.y > H + 20 || bl.life <= 0) { G.ebullets.splice(i, 1); continue; }
    for (const p of G.players) {
      if (!p.alive || p.warp > 0) continue;
      if (overlap(bl, p)) {
        G.ebullets.splice(i, 1);
        // 奖励关无敌机子弹（fireEnemy 已禁），这里只处理普通关
        hitPlayer(p);
        break;
      }
    }
  }

  // 玩家撞敌机
  for (const p of G.players) {
    if (!p.alive || p.warp > 0) continue;
    for (let j = G.enemies.length - 1; j >= 0; j--) {
      const e = G.enemies[j];
      if (e.mode === 'chall') continue;
      if (overlap(p, e)) {
        damageEnemy(e, 1, e.x, e.y);
        hitPlayer(p);
        break;
      }
    }
  }

  // ---- 过关判定 ----
  const active = G.entering.some(e => !e.done);
  if (!active && G.enemies.length === 0 && !G.captured) {
    if (G.challenge) {
      // 奖励关：时间到或全歼都算过（challLeft<=0 即全歼）
      if (G.challLeft <= 0 || G.stageT > 40) { G.clearT += dt; if (G.clearT > .8) stageClear(); }
    } else {
      G.clearT += dt;
      if (G.clearT > 1) stageClear();
    }
  } else G.clearT = 0;
  // 挑战关超时保护
  if (G.challenge && G.stageT > 60 && G.enemies.length === 0) stageClear();
}

function makeEnemy(slot, x, y) {
  const base = { x: x - 15, y: y - 12, w: 30, h: 24, slot, type: slot.type, mode: slot.chall ? 'chall' : 'form', diving: false, diveT: 0, hp: slot.type === 'boss' ? 2 : 1, animT: Math.random() * 5 };
  if (slot.chall) { base.bx = x - 15; base.by = y - 12; base.ci = slot.ci; }
  return base;
}

function updateDive(e, dt) {
  e.mode = 'dive';
  e.diveT += dt;
  const p0 = G.players.find(p => p.alive) || { x: W / 2, y: PY };
  if (e.diveKind === 'capture') {
    // Boss 抓机：俯冲到玩家上方悬停，放光束
    if (!e.capPhase) e.capPhase = 0;
    if (e.capPhase === 0) {
      e.y += 190 * dt;
      e.x += Math.sign(p0.x - e.x) * 120 * dt;
      if (e.y >= p0.y - 190) { e.capPhase = 1; e.y = p0.y - 190; G.bossBeam = { boss: e, t: 0 }; sfx.capture(); }
    } else if (e.capPhase === 1) {
      e.x += Math.sin(G.t * 3) * 20 * dt;
      // 光束结束还没抓到 → 返回
      if (!G.bossBeam) { e.mode = 'return'; e.retT = 0; e.capPhase = 0; e.diveKind = 'attack'; }
      // 抓到了 → capturePlayer 里已置 return
      if (G.captured && G.captured.boss === e) { e.capPhase = 0; }
    }
    return;
  }
  // 普通攻击俯冲：正弦蛇形向下，到底部后 leave 归位
  e.y += (200 + G.stage * 14) * dt;
  e.x += Math.sin(e.diveT * 5 + (e.slot._idx || 0)) * 160 * dt;
  // 俯冲中开火
  if (!e.fired && e.y > 200 && e.y < H - 200 && Math.random() < dt * 1.2) { e.fired = true; fireEnemy(e); }
}

function damageEnemy(e, dmg, hx, hy) {
  e.hp -= dmg;
  if (e.hp > 0) { tone(200, .08, 'square', .08); return; } // boss 第一发只变色
  // 击落
  const idx = G.enemies.indexOf(e);
  if (idx >= 0) G.enemies.splice(idx, 1);
  G.kills++;
  const diving = e.mode === 'dive' || e.diving;
  // 救回判定优先：击落的是带机返回中的 boss → 双机合体
  if (e.type === 'boss' && G.captured && G.captured.boss === e && rescueCheck(e)) {
    boom(e.x + 15, e.y + 12, true);
    return;
  }
  // 被抓走的战机：其他情况下 boss 死时若带机，战机坠毁
  if (G.captured && G.captured.boss === e) {
    G.captured = null;
    float(e.x, e.y, T('floatLost'));
  }
  let sc = SCORES[e.type] || 50;
  if (diving) sc *= 2; // 俯冲中双倍
  if (e.diveKind === 'capture' || e.capPhase === 1) sc *= 2; // 抓机俯冲中击落 4 倍（boss 150→600）
  if (e.mode === 'chall' || (e.slot && e.slot.chall)) { sc = 100; G.challLeft--; }
  addScore(sc, e.x + 15, e.y);
  boom(e.x + 15, e.y + 12, e.type === 'boss');
  // 俯冲 rescue：击落正在抓机俯冲（capPhase）的 boss 若已抓到？已在上面处理；未抓到正常分
}

// ---------- 绘制 ----------
function spr(rows, pal, x, y, px, flip) {
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    for (let c = 0; c < row.length; c++) {
      const ch = row[flip ? row.length - 1 - c : c];
      if (ch === '.' || ch === ' ') continue;
      ctx.fillStyle = pal[ch] || '#f0f';
      ctx.fillRect(Math.round(x + c * px), Math.round(y + r * px), Math.ceil(px), Math.ceil(px));
    }
  }
}
// 玩家战机（贴近 Galaga 自机：白红蓝配色）
const PAL_P = { W: '#f2f7ff', R: '#e7402e', B: '#2b9fe3', Y: '#ffd93d', E: '#ffb52e' };
const SHIP = [
  '.......WW.......',
  '.......WW.......',
  '.......WW.......',
  '.......WW.......',
  '......WWWW......',
  '......WWWW......',
  '......WRWW......',
  '.....WWRRWW.....',
  '.....WRBBRW.....',
  '....WWBBBBWW....',
  '....WBBBBBBW....',
  '...WWBBBBBBWW...',
  '...WBBBBBBBBW...',
  '..WWBBWBBWBBWW..',
  '..WBBBWBBWBBBW..',
  '.WWBBBWBWBBBWW.',
  '.WBBBWWBBWWBBBW.',
  '.WBBWWBBBBWWBBW.',
  'EWWWBBBBBBBBWWWE',
  'EEWWBBBBBBBBWWEE',
  '.EWWWBBBBBBWWWE.',
  '...EEWWBBWWEE...',
  '....EEWWWWEE....',
  '.....EE..EE.....',
];
// Zako 蓝黄小蜜蜂
const PAL_Z = { B: '#2b6fe3', Y: '#ffd93d', W: '#f2f7ff', R: '#e7402e', E: '#1c1c1c' };
const ZAKO = [
  '.....BB.BB......',
  '....BBB.BBB.....',
  '....BBB.BBB.....',
  '...BBBB.BBBB....',
  '...BWWB.BWWB....',
  '...BWKB.BWKB....',
  '....BBBBBBB.....',
  '..YBBBBBBBBBY...',
  '.YYBBBBBBBBBYY..',
  '.YBBBBBBBBBBBY..',
  '..BBBBBBBBBB....',
  '...BB.BB.BB.....',
  '...BB.BB.BB.....',
];
// Goei 红蝶
const PAL_G2 = { R: '#e7402e', Y: '#ffd93d', W: '#f2f7ff', B: '#2b6fe3', E: '#1c1c1c' };
const GOEI = [
  '....RR...RR.....',
  '...RRR...RRR....',
  '...RRR...RRR....',
  '..RRRR...RRRR...',
  '..RWRR...RRWR...',
  '..RWKR...RKWR...',
  '...RRRRRRRRR....',
  '..YRRRRRRRRRY...',
  '.YYRRRYRYRRRYY..',
  '.YRRRYRYRYRRRY..',
  '..RRRYRYRYRRR...',
  '...RB.....BR....',
  '...RB.....BR....',
];
// Boss 绿大甲（2 血，受伤变紫）
const PAL_B = { G: '#35c759', D: '#1d7a38', Y: '#ffd93d', W: '#f2f7ff', R: '#e7402e', E: '#1c1c1c' };
const PAL_BH = { G: '#b16bff', D: '#6e3ab5', Y: '#ffd93d', W: '#f2f7ff', R: '#e7402e', E: '#1c1c1c' };
const BOSS = [
  '....GG...GG.....',
  '...GGG...GGG....',
  '...GGG...GGG....',
  '..GGGG...GGGG...',
  '..GWGG...GGWG...',
  '..GWKG...GKWG...',
  '...GGGGGGGGG....',
  '..GGGGGGGGGGG...',
  '.YGGGGGGGGGGGY..',
  '.YGGGWGGGWGGGY..',
  '.YGGGWGGGWGGGY..',
  '..GGGGGGGGGGG...',
  '..DGG.....GGD...',
  '..DD.......DD...',
];

function drawBG() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#050518'); g.addColorStop(.6, '#0d1440'); g.addColorStop(1, '#1b2452');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#fff';
  for (const s of G.stars) {
    ctx.globalAlpha = .3 + .7 * (s.s / 2.5);
    ctx.fillRect(s.x, s.y, s.s, s.s * 3);
  }
  ctx.globalAlpha = 1;
  // 地平线霓虹线
  ctx.fillStyle = 'rgba(90,120,255,.15)';
  ctx.fillRect(0, H - 8, W, 8);
}
function drawPlayers() {
  for (const p of G.players) {
    if (!p.alive) continue;
    if (p.warp > 0 && Math.floor(G.t * 14) % 2 === 0) continue; // 重生闪烁
    ctx.save();
    // 移动倾斜（-0.25 ~ 0.25 弧度），手感反馈
    const cx = p.x + 15, cy = p.y + 20;
    ctx.translate(cx, cy);
    ctx.rotate((p.tilt || 0) * .25);
    ctx.translate(-cx, -cy);
    if (G.dual && !p.p2) {
      // 双机：左右各一架
      spr(SHIP, PAL_P, p.x, p.y, 1.6, false);
      spr(SHIP, PAL_P, p.x + 34, p.y, 1.6, false);
      p.w = 30; // 逻辑宽度保持单架（判定不翻倍，经典规则双机更宽——这里视觉双机、判定略宽）
    } else {
      spr(SHIP, PAL_P, p.x, p.y, 1.6, false);
    }
    // 引擎尾焰
    const fl = 6 + Math.random() * 8 + Math.abs(p.tilt || 0) * 6;
    ctx.fillStyle = '#5ee6ff';
    ctx.fillRect(p.x + 12, p.y + 38, 6, fl);
    ctx.fillStyle = '#fff';
    ctx.fillRect(p.x + 14, p.y + 38, 2, fl * .6);
    if (G.dual && !p.p2) {
      ctx.fillStyle = '#5ee6ff';
      ctx.fillRect(p.x + 46, p.y + 38, 6, fl);
      ctx.fillStyle = '#fff';
      ctx.fillRect(p.x + 48, p.y + 38, 2, fl * .6);
    }
    ctx.restore();
  }
  // 被抓走的战机画在 boss 下方
  if (G.captured) {
    const c = G.captured;
    const bx = c.boss.x, by = c.boss.y;
    ctx.save();
    ctx.rotate(Math.sin(G.t * 6) * .15);
    spr(SHIP, PAL_P, bx - 6, by + 26, 1.4, false);
    ctx.restore();
  }
}
function drawEnemies() {
  for (const e of G.enemies) {
    const wob = e.mode === 'dive' || e.diving ? Math.sin(e.diveT * 10) * .3 : 0;
    ctx.save();
    ctx.translate(e.x + e.w / 2, e.y + e.h / 2);
    ctx.rotate(wob);
    ctx.translate(-(e.x + e.w / 2), -(e.y + e.h / 2));
    const flip = Math.floor((e.animT || 0)) % 2 === 0;
    if (e.type === 'zako') spr(ZAKO, PAL_Z, e.x - 1, e.y, 2, flip);
    else if (e.type === 'goei') spr(GOEI, PAL_G2, e.x - 1, e.y, 2, flip);
    else spr(BOSS, e.hp > 1 ? PAL_B : PAL_BH, e.x - 3, e.y - 2, 2, flip);
    ctx.restore();
  }
  // 牵引光束
  if (G.bossBeam) {
    const b = G.bossBeam.boss;
    const bx = b.x + b.w / 2;
    const grd = ctx.createLinearGradient(0, b.y + 20, 0, b.y + 220);
    grd.addColorStop(0, 'rgba(120,220,255,.85)');
    grd.addColorStop(1, 'rgba(120,220,255,.05)');
    ctx.fillStyle = grd;
    const wob = Math.sin(G.t * 20) * 6;
    ctx.beginPath();
    ctx.moveTo(bx - 14, b.y + 20);
    ctx.lineTo(bx + 14, b.y + 20);
    ctx.lineTo(bx + 34 + wob, b.y + 220);
    ctx.lineTo(bx - 34 + wob, b.y + 220);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.5)';
    ctx.fillRect(bx - 3, b.y + 20, 6, 200);
  }
}
function drawShots() {
  for (const b of G.bullets) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = '#ff5d5d';
    ctx.fillRect(b.x + 1, b.y, b.w - 2, 4);
  }
  for (const b of G.ebullets) {
    ctx.fillStyle = '#ff5d8f';
    ctx.beginPath(); ctx.arc(b.x + 2.5, b.y + 6, 4, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(b.x + 2.5, b.y + 6, 1.8, 0, 7); ctx.fill();
  }
}
function drawParts() {
  for (const p of G.parts) {
    ctx.globalAlpha = Math.max(0, 1 - p.age / p.life);
    ctx.fillStyle = p.c;
    ctx.fillRect(p.x - p.r / 2, p.y - p.r / 2, p.r, p.r);
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center';
  for (const f of G.floats) {
    ctx.globalAlpha = Math.max(0, 1 - f.age / 1.1);
    ctx.font = '900 16px system-ui';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.6)';
    ctx.strokeText(f.text, f.x, f.y);
    ctx.fillStyle = '#ffd93d';
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}
function drawHUD() {
  ctx.fillStyle = 'rgba(0,0,0,.45)';
  ctx.fillRect(0, 0, W, 52);
  ctx.fillStyle = '#ff5d5d';
  ctx.font = '900 15px system-ui'; ctx.textAlign = 'left';
  ctx.fillText('SCORE', 12, 19);
  ctx.fillStyle = '#fff';
  ctx.fillText(String(G.score).padStart(7, '0'), 12, 37);
  ctx.fillStyle = '#5ee6ff'; ctx.textAlign = 'center';
  ctx.fillText((G.challenge ? '⭐ CHALLENGE ' : 'STAGE ') + G.stage, W / 2, 24);
  if (G.challenge && G.state === 'play') {
    ctx.fillStyle = '#ffd93d';
    ctx.fillText(T('hudChallLeft', G.challLeft), W / 2, 41);
  } else {
    ctx.fillStyle = '#fff';
    const left = G.enemies.length + G.entering.filter(e => !e.done).length;
    ctx.fillText(T('hudFoes', left), W / 2, 41);
  }
  ctx.textAlign = 'right';
  ctx.fillStyle = '#fff';
  ctx.fillText('🚀×' + Math.max(0, G.lives), W - 12, 24);
  ctx.fillStyle = '#ffd93d';
  ctx.fillText('HI ' + Math.max(store.best, G.score), W - 12, 41);
  ctx.textAlign = 'left';
  // 双机指示
  if (G.dual) {
    ctx.fillStyle = '#5ee66e';
    ctx.font = '900 13px system-ui';
    ctx.fillText(T('hudDual'), 12, 64);
    ctx.font = '900 15px system-ui';
  }
  if (G.captured) {
    ctx.fillStyle = '#ff8c42';
    ctx.font = '900 13px system-ui';
    ctx.fillText(T('hudCaptured'), 90, 64);
    ctx.font = '900 15px system-ui';
  }
  if (G.state === 'intro') {
    ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.font = '900 36px system-ui';
    ctx.fillText(G.challenge ? T('introChall') : 'STAGE ' + G.stage, W / 2, H / 2 - 20);
    ctx.font = '700 16px system-ui';
    ctx.fillStyle = '#ffd93d';
    ctx.fillText(G.challenge ? T('introChallSub') : T('introGo'), W / 2, H / 2 + 14);
    ctx.textAlign = 'left';
  }
}
function render() {
  ctx.save();
  if (G.shake > 0) ctx.translate((Math.random() - .5) * G.shake, (Math.random() - .5) * G.shake);
  drawBG();
  if (G.state === 'menu') { ctx.restore(); return; }
  drawEnemies();
  drawPlayers();
  drawShots();
  drawParts();
  drawHUD();
  ctx.restore();
}

// ---------- 启动 ----------
function toggleMute() {
  muted = !muted; store.muted = muted;
  $('btn-mute').textContent = muted ? '🔇' : '🔊';
}
$('btn-mute').onclick = e => { e.stopPropagation(); toggleMute(); };
$('btn-mute').textContent = muted ? '🔇' : '🔊';
$('btn-music').onclick = e => {
  e.stopPropagation();
  musicOn = !musicOn; store.music = musicOn;
$('btn-music').textContent = musicOn ? '🎵' : '🚫';
  if (!musicOn) Music.stop();
  else if (G.state === 'play') Music.start();
};
// i18n boot: static DOM + dynamic boot texts
AMG.apply(STR);
AMG.mountBtn();
$('btn-mute').title = T('muteTitle');
$('btn-music').title = T('musicTitle');
$('btn-pause').title = T('pauseBtnTitle');
$('btn-music').textContent = musicOn ? '🎵' : '🚫';
document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { ac(); sfx.click(); G.mode = b.dataset.mode; G.score = 0; G.lives = 3; G.stage = 1; G.kills = 0; startStage(1); });
$('btn-next').onclick = () => { startStage(G.stage + 1); };
$('btn-replay').onclick = () => { startStage(G.stage); };
$('btn-retry').onclick = () => retryAll();
$('btn-menu').onclick = () => toMenu();
$('btn-resume').onclick = () => togglePause();
$('btn-quit').onclick = () => toMenu();
$('btn-pause').onclick = e => { e.stopPropagation(); togglePause(); };
canvas.parentElement.addEventListener('pointerdown', e => {
  if (e.target.closest('button')) return;
  if (G.state === 'pause') togglePause();
});

refreshMenu();
resetCommon();
G.players = [newPlayer(W / 2, false)];
showScreen('menu');
window.__game = G;
window.__gameErrors = [];
window.addEventListener('error', e => window.__gameErrors.push(String(e.message)));
// 调试函数
G._start = startGame; G._startStage = startStage; G._slotPos = slotPos;
G._damage = damageEnemy; G._capture = capturePlayer; G._addScore = addScore;
G._formation = formationSlots;
requestAnimationFrame(t => { last = t; requestAnimationFrame(loop); });
})();
