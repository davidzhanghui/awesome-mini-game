(() => {
'use strict';
// 记忆翻牌：DOM 卡片 + CSS 3D 翻转；开局偷看；单人计时 / 双人轮流；连击计分与星级
const { $, T } = KIT;
const store = KIT.store('amg-memory');
const LEVELS = [{ c: 4, r: 3 }, { c: 4, r: 4 }, { c: 5, r: 4 }, { c: 6, r: 5 }];
const THEMES = {
  animals: ['🐶', '🐱', '🐰', '🦊', '🐼', '🐨', '🐯', '🦁', '🐸', '🐵', '🐧', '🐤', '🦄', '🐮', '🐷', '🐹'],
  fruits: ['🍎', '🍌', '🍇', '🍓', '🍒', '🍑', '🍍', '🥝', '🍉', '🍋', '🥥', '🍐', '🫐', '🥭', '🍊', '🍈'],
  space: ['🚀', '🛸', '🌍', '🌙', '⭐', '☄️', '🪐', '👽', '🌞', '🛰️', '🔭', '👨‍🚀', '🌌', '🌠', '🌈', '⚡'],
  ocean: ['🐠', '🐙', '🦀', '🐬', '🐳', '🦈', '🐢', '🦑', '🐚', '🦞', '🐡', '🪼', '🦭', '🐟', '🦐', '⚓']
};

let lv = store.get('lv', 1), theme = store.get('theme', 'animals'), gm = store.get('mode', 'solo');
if (!LEVELS[lv]) lv = 1;
if (!THEMES[theme]) theme = 'animals';
let cards = [], open = [], pairsFound = 0, moves = 0, score = 0, combo = 0, maxCombo = 0;
let player = 1, pScore = [0, 0, 0], t0 = 0, elapsed = 0, state = 'menu', lockUntil = 0, bestAtStart = null;
let missTimer = 0;
const grid = $('grid');

// 胜利彩带
const fx = $('fx');
let fctx = null, FW = 0, FH = 0;
const parts = new KIT.Particles();
function fitFx() {
  const r = $('frame').getBoundingClientRect();
  FW = r.width; FH = r.height;
  fctx = KIT.canvas(fx, FW, FH);
}

// ---------------- 音效 ----------------
const sfx = {
  flip: () => { KIT.noise(0.05, { vol: 0.05, hp: 3000 }); KIT.tone(700, 0.04, { type: 'triangle', vol: 0.025 }); },
  match: n => KIT.arp([659 + n * 30, 880 + n * 30, 1175 + n * 30], 0.06, { vol: 0.07, dur: 0.14 }),
  miss: () => KIT.tone(220, 0.18, { type: 'triangle', vol: 0.06, to: 160 }),
  win: () => KIT.arp([523, 659, 784, 1047, 784, 1047, 1319, 1568], 0.09, { vol: 0.08, dur: 0.24 }),
  turn: () => KIT.tone(440, 0.08, { type: 'sine', vol: 0.04, to: 520 })
};

const fmtTime = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');

// ---------------- 开局 ----------------
function deal() {
  const L = LEVELS[lv], n = (L.c * L.r) / 2;
  const pool = THEMES[theme].slice().sort(() => Math.random() - 0.5).slice(0, n);
  const deck = pool.concat(pool);
  for (let i = deck.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [deck[i], deck[j]] = [deck[j], deck[i]]; }
  grid.innerHTML = '';
  grid.className = 'grid c' + L.c;
  grid.style.gridTemplateColumns = `repeat(${L.c}, minmax(0, 1fr))`;
  cards = deck.map((e, i) => {
    const b = document.createElement('button');
    b.className = 'mcard';
    b.style.animationDelay = (i * 0.025) + 's';
    b.setAttribute('aria-label', 'card ' + (i + 1));
    b.innerHTML = `<span class="face back"></span><span class="face front">${e}</span>`;
    const card = { e, el: b, up: false, done: false, i };
    b.addEventListener('click', () => flip(card));
    grid.appendChild(b);
    return card;
  });
}

function start() {
  clearTimeout(missTimer);
  deal();
  open = []; pairsFound = 0; moves = 0; score = 0; combo = 0; maxCombo = 0;
  player = 1; pScore = [0, 0, 0]; elapsed = 0; t0 = 0;
  bestAtStart = store.get('best-' + lv, null);
  parts.clear();
  $('screen-menu').classList.add('hidden');
  $('screen-over').classList.add('hidden');
  $('hud-solo').classList.toggle('hidden', gm !== 'solo');
  $('hud-duo').classList.toggle('hidden', gm !== 'duo');
  state = 'peek';
  renderHud();
  KIT.music('puzzle-calm');
  // 发牌动画结束后偷看 2 秒
  const dealT = cards.length * 25 + 450;
  setTimeout(() => {
    if (state !== 'peek') return;
    KIT.toast($('toast'), T('peek'));
    cards.forEach(c => c.el.classList.add('up'));
    sfx.flip();
    setTimeout(() => {
      if (state !== 'peek') return;
      cards.forEach(c => c.el.classList.remove('up'));
      sfx.flip();
      setTimeout(() => {
        if (state !== 'peek') return;
        state = 'play';
        if (gm === 'duo') KIT.toast($('toast'), T('turn', 1));
      }, 420);
    }, 2000);
  }, dealT);
}

// ---------------- 翻牌 ----------------
function coverMiss() {
  clearTimeout(missTimer);
  for (const c of open) { c.up = false; c.el.classList.remove('up', 'miss'); }
  open = [];
}

function flip(card) {
  if (state !== 'play' || card.done) return;
  // 上一对没配上：立刻盖回；点的正好是那两张之一就只盖回，不算新翻
  if (open.length === 2) { const was = open.includes(card); coverMiss(); if (was) return; }
  if (card.up) return;
  if (!t0) t0 = performance.now();
  card.up = true;
  card.el.classList.add('up');
  sfx.flip();
  open.push(card);
  if (open.length < 2) return;

  moves++;
  const [a, b] = open;
  if (a.e === b.e) {
    a.done = b.done = true;
    combo++;
    maxCombo = Math.max(maxCombo, combo);
    const gain = 100 + (combo - 1) * 50;
    pairsFound++;
    if (gm === 'duo') { pScore[player]++; a.el.classList.add('p' + player); b.el.classList.add('p' + player); }
    else score += gain;
    open = [];
    setTimeout(() => {
      [a, b].forEach(c => c.el.classList.add('done'));
      burstAt(a.el); burstAt(b.el);
      setTimeout(() => [a, b].forEach(c => c.el.classList.add('fade')), 900);
    }, 380);
    sfx.match(combo);
    if (combo >= 2) KIT.toast($('toast'), T('combo', combo), '#f4c13d');
    if (pairsFound === cards.length / 2) setTimeout(win, 700);
  } else {
    combo = 0;
    setTimeout(() => { if (open.includes(a)) { a.el.classList.add('miss'); b.el.classList.add('miss'); sfx.miss(); } }, 380);
    missTimer = setTimeout(() => {
      if (open[0] === a && open[1] === b) coverMiss();
    }, 1100);
    if (gm === 'duo') {
      player = player === 1 ? 2 : 1;
      setTimeout(() => { if (state === 'play') { KIT.toast($('toast'), T('turn', player)); sfx.turn(); } }, 600);
    }
  }
  renderHud();
}

function burstAt(el) {
  if (!fctx) fitFx();
  const fr = $('frame').getBoundingClientRect(), r = el.getBoundingClientRect();
  parts.burst(r.left - fr.left + r.width / 2, r.top - fr.top + r.height / 2, {
    n: 14, color: ['#f4c13d', '#6ab872', '#fff6dc'], speed: 160, size: 4, life: 0.6, gravity: 300
  });
}

function win() {
  state = 'over';
  elapsed = (performance.now() - t0) / 1000;
  KIT.stopMusic();
  sfx.win();
  fitFx();
  for (let k = 0; k < 6; k++) setTimeout(() => parts.burst(KIT.rand(40, FW - 40), KIT.rand(40, FH * 0.4), {
    n: 30, color: ['#ef4b5b', '#f4c13d', '#4fbf6a', '#4f97e8', '#a56fe0', '#f08a3a'], shape: 'square', speed: 260, life: 1.4, size: 7, gravity: 360
  }), k * 150);

  const pairs = cards.length / 2;
  const stars = moves <= Math.ceil(pairs * 1.4) ? 3 : moves <= pairs * 2 ? 2 : 1;
  let record = false;
  if (gm === 'solo') {
    const b = store.get('best-' + lv, null);
    if (!b || moves < b.moves || (moves === b.moves && elapsed < b.time)) { store.set('best-' + lv, { moves, time: elapsed }); record = true; }
  }
  setTimeout(() => {
    $('over-icon').textContent = gm === 'duo' ? (pScore[1] === pScore[2] ? '🤝' : '🏆') : '🏆';
    $('over-title').textContent = gm === 'duo'
      ? (pScore[1] === pScore[2] ? T('duoTie') : T('duoWin', pScore[1] > pScore[2] ? 1 : 2))
      : T('winTitle');
    $('over-stars').innerHTML = gm === 'solo' ? [1, 2, 3].map(i => `<span class="${i <= stars ? '' : 'off'}" style="animation-delay:${i * 0.15}s">⭐</span>`).join('') : '';
    $('over-record').classList.toggle('hidden', !(gm === 'solo' && record));
    const rows = gm === 'solo'
      ? [[T('stTime'), fmtTime(elapsed)], [T('stMoves'), moves], [T('stScore'), score], [T('stCombo'), maxCombo], [T('stBest'), store.get('best-' + lv, { moves }).moves]]
      : [[T('stP1'), pScore[1]], [T('stP2'), pScore[2]], [T('stMoves'), moves], [T('stTime'), fmtTime(elapsed)]];
    $('over-stats').innerHTML = rows.map(([a, b]) => `<span>${a}</span><b>${b}</b>`).join('');
    $('screen-over').classList.remove('hidden');
  }, 900);
}

// ---------------- 界面 ----------------
function renderHud() {
  const pairs = cards.length / 2;
  $('moves').textContent = moves;
  $('pairs').textContent = $('pairs2').textContent = pairsFound + '/' + pairs;
  $('score').textContent = score;
  $('p1-score').textContent = pScore[1];
  $('p2-score').textContent = pScore[2];
  $('p1').classList.toggle('on', player === 1);
  $('p2').classList.toggle('on', player === 2);
}
function showMenu() {
  state = 'menu';
  clearTimeout(missTimer);
  KIT.stopMusic();
  $('screen-over').classList.add('hidden');
  deal();
  renderMenu();
  $('screen-menu').classList.remove('hidden');
}
function renderMenu() {
  document.querySelectorAll('#lv-seg button').forEach(b => b.classList.toggle('on', +b.dataset.lv === lv));
  document.querySelectorAll('#theme-seg button').forEach(b => b.classList.toggle('on', b.dataset.t === theme));
  document.querySelectorAll('#mode-seg button').forEach(b => b.classList.toggle('on', b.dataset.m === gm));
  const L = LEVELS[lv];
  $('menu-desc').textContent = T('desc', L.c, L.r, L.c * L.r / 2);
  const b = store.get('best-' + lv, null);
  $('menu-best').textContent = b ? T('best', b.moves, fmtTime(b.time)) : T('best', 0);
}

document.querySelectorAll('#lv-seg button').forEach(b => b.addEventListener('click', () => {
  lv = +b.dataset.lv; store.set('lv', lv); KIT.tone(500 + lv * 80, 0.06, { type: 'triangle', vol: 0.05 }); showMenu();
}));
document.querySelectorAll('#theme-seg button').forEach(b => b.addEventListener('click', () => {
  theme = b.dataset.t; store.set('theme', theme); KIT.tone(640, 0.06, { type: 'triangle', vol: 0.05 }); showMenu();
}));
document.querySelectorAll('#mode-seg button').forEach(b => b.addEventListener('click', () => {
  gm = b.dataset.m; store.set('mode', gm); KIT.tone(560, 0.06, { type: 'triangle', vol: 0.05 }); renderMenu();
}));
$('btn-start').onclick = start;
$('btn-retry').onclick = start;
$('btn-restart').onclick = () => { if (state !== 'menu') start(); };
$('btn-menu').onclick = showMenu;
$('btn-menu2').onclick = showMenu;
document.addEventListener('keydown', e => {
  if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
  if ((e.key === 'r' || e.key === 'R') && state !== 'menu') start();
  else if (e.key === 'Enter' && state === 'menu' && !(e.target && e.target.tagName === 'BUTTON')) start();
});

// 计时 + 彩带渲染
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (state === 'play' && t0) $('time').textContent = fmtTime((now - t0) / 1000);
  else if (state === 'peek') $('time').textContent = '0:00';
  if (parts.list.length && fctx) {
    fctx.clearRect(0, 0, FW, FH);
    parts.update(dt); parts.draw(fctx);
    if (!parts.list.length) fctx.clearRect(0, 0, FW, FH);
  }
  requestAnimationFrame(loop);
}
window.addEventListener('resize', fitFx);

const syncMute = KIT.mountMute($('btn-mute'));
KIT.boot(() => { syncMute(); renderMenu(); renderHud(); });
fitFx();
showMenu();
requestAnimationFrame(loop);
})();
