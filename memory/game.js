(() => {
// 记忆翻牌：4x4 共 8 对 emoji，配对消除
const STR = window.GAME_STR || { zh: {}, en: {} };
const T = (k, ...a) => AMG.tf(STR, k, ...a);
const W = 480, H = 620;
const N = 4, BS = 400, BX = 40, BY = 160, GAP = 12;
const CS = (BS - GAP * (N + 1)) / N;
const EMOJI = ['🍎', '🐶', '🚀', '🌈', '⚽', '🎵', '🍩', '🐱'];
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const $ = id => document.getElementById(id);
const dpr = Math.min(window.devicePixelRatio || 1, 2);
canvas.width = W * dpr; canvas.height = H * dpr;
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

const store = {
  get best() { return +(localStorage.getItem('mem-best') || 0); },
  set best(v) { localStorage.setItem('mem-best', v); },
  get muted() { return localStorage.getItem('mem-muted') === '1'; },
  set muted(v) { localStorage.setItem('mem-muted', v ? '1' : '0'); }
};
let actx = null, muted = store.muted;
function tone(f, dur, type, vol) {
  if (muted) return;
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type || 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(vol || .07, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(.001, actx.currentTime + dur);
    o.connect(g); g.connect(actx.destination); o.start(); o.stop(actx.currentTime + dur);
  } catch (e) {}
}
const sfx = {
  flip: () => tone(500, .06, 'sine', .07),
  match: () => [660, 880].forEach((f, i) => setTimeout(() => tone(f, .1, 'sine', .09), i * 80)),
  nomatch: () => tone(220, .15, 'sine', .06),
  win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => tone(f, .15, 'sine', .09), i * 100))
};

// cards[i] = {emoji, faceUp:0..1, matched, flipT}
const G = {
  state: 'menu', cards: [], first: -1, second: -1,
  moves: 0, time: 0, matched: 0, lock: 0, started: false
};
function reset() {
  const deck = EMOJI.concat(EMOJI);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.random() * (i + 1) | 0;
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  G.cards = deck.map(e => ({ emoji: e, faceUp: 0, matched: false, target: 0 }));
  G.first = -1; G.second = -1;
  G.moves = 0; G.time = 0; G.matched = 0; G.lock = 0; G.started = false;
}
function cellRect(i) {
  const x = BX + GAP + (i % N) * (CS + GAP);
  const y = BY + GAP + (i / N | 0) * (CS + GAP);
  return [x, y];
}
function flip(i) {
  if (G.state !== 'play' || G.lock > 0) return;
  const c = G.cards[i];
  if (!c || c.matched || c.target === 1) return;
  if (!G.started) G.started = true;
  c.target = 1; sfx.flip();
  if (G.first < 0) { G.first = i; return; }
  G.second = i;
  G.moves++;
  const a = G.cards[G.first], b = G.cards[G.second];
  if (a.emoji === b.emoji) {
    a.matched = b.matched = true;
    G.matched += 2;
    G.first = G.second = -1;
    sfx.match();
    if (G.matched === N * N) {
      const moves2 = G.moves;
      if (!store.best || moves2 < store.best) store.best = moves2;
      sfx.win();
      G.state = 'over';
      $('over-title').textContent = T('overTitle');
      $('over-sub').textContent = T('overSub', moves2, Math.round(G.time));
      setTimeout(() => showScreen('over'), 700);
    }
  } else {
    G.lock = .8;
    setTimeout(() => sfx.nomatch(), 500);
  }
}
function showScreen(name) {
  for (const k of ['screen-menu', 'screen-over'])
    $(k).classList.toggle('hidden', k !== 'screen-' + name);
  if (!name) for (const k of ['screen-menu', 'screen-over']) $(k).classList.add('hidden');
}
function startGame() {
  reset();
  G.state = 'play';
  showScreen(null);
}
canvas.addEventListener('pointerdown', e => {
  const r = canvas.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width * W, y = (e.clientY - r.top) / r.height * H;
  for (let i = 0; i < G.cards.length; i++) {
    const [cx, cy] = cellRect(i);
    if (x >= cx && x <= cx + CS && y >= cy && y <= cy + CS) { flip(i); return; }
  }
});
window.addEventListener('keydown', e => {
  if (e.code === 'KeyM') toggleMute();
  else if (e.code === 'KeyR' || e.code === 'Enter') {
    if (G.state === 'over' || G.state === 'menu') startGame();
  }
  else if (e.code === 'Escape') { G.state = 'menu'; showScreen('menu'); }
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

function rr(x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
}
function render(now) {
  ctx.fillStyle = '#2d2440'; ctx.fillRect(0, 0, W, H);
  // HUD
  ctx.fillStyle = '#f9f6f2'; ctx.textAlign = 'left';
  ctx.font = '900 20px system-ui'; ctx.fillText(T('moves').toUpperCase(), 40, 50);
  ctx.font = '900 30px system-ui'; ctx.fillStyle = '#c4b5fd';
  ctx.fillText(G.moves, 40, 84);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#f9f6f2'; ctx.font = '900 20px system-ui';
  ctx.fillText(T('time').toUpperCase(), W - 40, 50);
  ctx.font = '900 30px system-ui'; ctx.fillStyle = '#c4b5fd';
  ctx.fillText(Math.round(G.time), W - 40, 84);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f9f6f2'; ctx.font = '900 16px system-ui';
  ctx.fillText(G.matched + ' / ' + (N * N), W / 2, 78);
  // 卡片
  for (let i = 0; i < G.cards.length; i++) {
    const c = G.cards[i];
    const [x, y] = cellRect(i);
    const f = c.faceUp; // 0 背面 → 1 正面
    const sx = Math.abs(Math.cos(f * Math.PI)); // 翻转动效：宽度缩放
    const dw = CS * Math.max(.08, sx);
    const dx = x + (CS - dw) / 2;
    const showFace = f > .5;
    if (c.matched && f >= 1) {
      ctx.globalAlpha = .35;
    }
    ctx.fillStyle = showFace ? '#f9f6f2' : '#7c3aed';
    rr(dx, y, dw, CS, 12); ctx.fill();
    if (showFace) {
      ctx.font = '34px system-ui'; ctx.textAlign = 'center';
      ctx.fillText(c.emoji, x + CS / 2, y + CS / 2 + 13);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,.35)';
      ctx.font = '900 22px system-ui'; ctx.textAlign = 'center';
      ctx.fillText('?', x + CS / 2, y + CS / 2 + 8);
    }
    ctx.globalAlpha = 1;
  }
}
let last = performance.now();
function loop(now) {
  const dt = Math.min(((now || performance.now()) - last) / 1000, .05);
  last = now || performance.now();
  if (G.state === 'play' && G.started) G.time += dt;
  if (G.lock > 0) {
    G.lock -= dt;
    if (G.lock <= 0 && G.first >= 0 && G.second >= 0) {
      G.cards[G.first].target = 0;
      G.cards[G.second].target = 0;
      G.first = G.second = -1;
    }
  }
  for (const c of G.cards) {
    c.faceUp += (c.target - c.faceUp) * Math.min(1, dt * 10);
    if (Math.abs(c.faceUp - c.target) < .02) c.faceUp = c.target;
  }
  render(now || performance.now());
  requestAnimationFrame(loop);
}
reset();
requestAnimationFrame(t => { last = t; requestAnimationFrame(loop); });
window.__game = G;
window.__gameErrors = [];
window.addEventListener('error', e => window.__gameErrors.push(String(e.message)));
G._flip = flip; G._start = startGame;
})();
