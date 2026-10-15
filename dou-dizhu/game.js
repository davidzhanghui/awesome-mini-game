/* 斗地主 · 欢乐对局 —— 3 人斗地主（你 + 2 名电脑）
 * 规则 / AI 见 rules.js。座位：0 你（下）、1 右家、2 左家，出牌顺序 0 → 1 → 2。
 */
(() => {
'use strict';
const { $, T } = KIT;
const D = window.DDZ, rk = D.rk;
const store = KIT.store('amg-ddz');
const W = 900, H = 560, CW = 70, CH = 98;
const cv = $('game'), c = KIT.canvas(cv, W, H);
const DISP = '"AMG Display", "PingFang SC", system-ui, sans-serif';
const NUMF = '"Helvetica Neue", Arial, "PingFang SC", system-ui, sans-serif';
const EMOJI = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", system-ui';
const BASE = 100;
const SEAT = [{ x: 450, y: 470 }, { x: 830, y: 190 }, { x: 70, y: 190 }];
const AVA = ['🙂', '🧔', '👩'];

// ---------------- 状态 ----------------
let phase = 'menu', hands = [[], [], []], bottom = [], roles = [null, null, null], landlord = -1, cur = 0;
let last = null, passes = 0, shown = [null, null, null], mult = 1, bombs = 0, robs = 0, plays = [0, 0, 0], played = [];
let sel = new Set(), hintList = [], hintIdx = 0, bid = null, dealt = [0, 0, 0], dealOrder = [], flyers = [], fxText = null, sprites = [], shake = 0;
let beans = [store.get('beans', 10000), 5000, 5000], recOn = store.get('recorder', true), level = store.get('level', 1), stats = store.get('stats', { w: 0, l: 0 });
let token = 0, revealT = 0, endInfo = null, alarm = [0, 0, 0], newCards = [];
const fx = new KIT.Particles();
const later = (ms, fn) => { const tk = token; setTimeout(() => { if (tk === token) fn(); }, ms); };

// ---------------- 牌面预渲染 ----------------
const SUITS = ['♠', '♥', '♣', '♦'], RANKS = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2' };
const rankLabel = r => RANKS[r] || String(r);
function off(w, h) { const o = document.createElement('canvas'); o.width = w * 2; o.height = h * 2; const g = o.getContext('2d'); g.scale(2, 2); return [o, g]; }
const FACE = [], BACK = (() => {
  const [o, g] = off(CW, CH);
  const gr = g.createLinearGradient(0, 0, CW, CH); gr.addColorStop(0, '#d8463a'); gr.addColorStop(1, '#a8261c');
  g.fillStyle = gr; KIT.roundRect(g, 0, 0, CW, CH, 7); g.fill();
  g.strokeStyle = '#ffd36a'; g.lineWidth = 2; KIT.roundRect(g, 4, 4, CW - 8, CH - 8, 5); g.stroke();
  g.save(); KIT.roundRect(g, 6, 6, CW - 12, CH - 12, 4); g.clip();
  g.strokeStyle = 'rgba(255,220,150,.35)'; g.lineWidth = 1;
  for (let k = -CH; k < CW + CH; k += 8) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + CH, CH); g.moveTo(k + CH, 0); g.lineTo(k, CH); g.stroke(); }
  g.restore();
  g.fillStyle = '#ffd36a'; g.beginPath(); g.arc(CW / 2, CH / 2, 15, 0, 7); g.fill();
  g.fillStyle = '#a8261c'; g.font = 'bold 18px ' + DISP; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('斗', CW / 2, CH / 2 + 1);
  return o;
})();
function renderFaces() {
  for (let id = 0; id < 54; id++) {
    const [o, g] = off(CW, CH);
    const gr = g.createLinearGradient(0, 0, 0, CH); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#f1eee6');
    g.fillStyle = gr; KIT.roundRect(g, 0, 0, CW, CH, 7); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.22)'; g.lineWidth = 1; KIT.roundRect(g, 0.5, 0.5, CW - 1, CH - 1, 7); g.stroke();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    if (id >= 52) {
      const big = id === 53, col = big ? '#d8261c' : '#222';
      g.fillStyle = col; g.font = 'bold 11px ' + NUMF;
      [...'JOKER'].forEach((ch, i) => g.fillText(ch, 11, 13 + i * 12));
      g.save(); g.translate(42, 58); g.fillStyle = big ? '#ffcf3a' : '#9aa3ad'; g.strokeStyle = col; g.lineWidth = 2;
      g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 9 : 20; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill(); g.stroke();
      g.restore();
      
    } else {
      const r = rk(id), s = id & 3, col = s === 1 || s === 3 ? '#d8261c' : '#1d1d1f';
      g.fillStyle = col;
      g.font = 'bold ' + (r === 10 ? 19 : 23) + 'px ' + NUMF; g.fillText(rankLabel(r), 13, 15);
      g.font = '16px ' + NUMF; g.fillText(SUITS[s], 13, 34);
      g.font = '40px ' + NUMF; g.fillText(SUITS[s], 44, 68);
      if (r >= 11 && r <= 13) { g.strokeStyle = col; g.globalAlpha = 0.25; g.lineWidth = 1; g.strokeRect(26, 40, 34, 48); g.globalAlpha = 1; }
    }
    FACE[id] = o;
  }
}

// ---------------- 声音 ----------------
const SFX = {
  card: () => { KIT.noise(0.07, { vol: 0.1, hp: 1500 }); KIT.tone(900, 0.04, { type: 'triangle', vol: 0.03 }); },
  deal: () => KIT.noise(0.03, { vol: 0.05, hp: 2500 }),
  pass: () => KIT.tone(260, 0.12, { type: 'sine', vol: 0.05 }),
  bid: () => KIT.arp([523, 784], 0.07, { type: 'triangle', vol: 0.05 }),
  rob: () => KIT.arp([659, 880, 1047], 0.06, { type: 'square', vol: 0.05 }),
  bomb: () => { KIT.noise(0.7, { vol: 0.3, lp: 700 }); KIT.tone(120, 0.6, { type: 'sawtooth', vol: 0.1, to: 30 }); },
  rocket: () => { KIT.tone(200, 0.8, { type: 'sawtooth', vol: 0.06, to: 2000 }); KIT.noise(0.8, { vol: 0.15, hp: 800 }); },
  plane: () => KIT.tone(300, 1.0, { type: 'triangle', vol: 0.06, to: 700 }),
  seq: () => KIT.arp([523, 587, 659, 784, 880], 0.04, { type: 'square', vol: 0.04 }),
  alarm: () => { KIT.tone(1200, 0.12, { type: 'square', vol: 0.04 }); KIT.tone(1200, 0.12, { type: 'square', vol: 0.04, delay: 0.18 }); },
  win: () => KIT.arp([523, 659, 784, 1047, 784, 1047, 1319], 0.1, { type: 'square', vol: 0.06 }),
  lose: () => KIT.arp([523, 466, 415, 349], 0.15, { type: 'triangle', vol: 0.07 }),
  bad: () => KIT.tone(180, 0.12, { type: 'square', vol: 0.04 }),
  select: () => KIT.tone(1300, 0.03, { type: 'sine', vol: 0.03 })
};

// ---------------- 发牌 / 叫地主 ----------------
function newRound() {
  token++; hideScreens(); KIT.audio();
  if (beans[0] < 1000) { beans[0] = 10000; store.set('beans', 10000); toast(T('refill')); }
  const deck = [...Array(54).keys()];
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  hands = [deck.slice(0, 17), deck.slice(17, 34), deck.slice(34, 51)]; bottom = deck.slice(51);
  roles = [null, null, null]; landlord = -1; last = null; passes = 0; shown = [null, null, null]; mult = 1; bombs = 0; robs = 0; plays = [0, 0, 0]; played = [];
  sel.clear(); hintList = []; dealt = [0, 0, 0]; flyers = []; fxText = null; sprites = []; endInfo = null; alarm = [0, 0, 0]; newCards = []; revealT = 0; fx.clear();
  phase = 'deal'; syncActs();
  KIT.music('card-party');
  for (let k = 0; k < 51; k++) {
    const s = k % 3;
    later(k * 32, () => { flyers.push({ s, t: 0 }); SFX.deal(); });
  }
  later(51 * 32 + 380, startBid);
}
function startBid() {
  phase = 'bid';
  const first = Math.floor(Math.random() * 3);
  bid = { queue: [first, (first + 1) % 3, (first + 2) % 3], mode: 'call', caller: -1, cand: -1, finalDone: false, robbed: false };
  nextBid();
}
function nextBid() {
  if (!bid.queue.length) {
    if (bid.mode === 'rob' && bid.robbed && !bid.finalDone) { bid.finalDone = true; bid.queue.push(bid.caller); bid.final = true; }
    else if (bid.cand < 0) { toast(T('redeal')); later(1200, newRound); return; }
    else { setLandlord(bid.cand); return; }
  }
  cur = bid.queue[0];
  syncActs();
  if (cur !== 0) later(700 + Math.random() * 500, () => {
    const s = D.bidStrength(hands[cur]) + (Math.random() - 0.5) * 1.2;
    answerBid(cur, bid.mode === 'call' ? s >= 6.3 - level * 0.3 : s >= 8.6 - level * 0.3);
  });
}
function answerBid(s, yes) {
  if (phase !== 'bid' || bid.queue[0] !== s) return;
  bid.queue.shift();
  if (bid.mode === 'call') {
    say(s, yes ? T('bCall') : T('bNo'));
    if (yes) { bid.caller = bid.cand = s; bid.mode = 'rob'; SFX.bid(); }
    else SFX.pass();
  } else {
    say(s, yes ? T('bRob') : T('bNoRob'));
    if (yes) { bid.cand = s; mult *= 2; robs++; bid.robbed = true; SFX.rob(); popMult(); }
    else SFX.pass();
  }
  later(450, nextBid);
}
function setLandlord(s) {
  landlord = s; roles = [0, 1, 2].map(i => i === s ? 'landlord' : 'farmer');
  phase = 'reveal'; revealT = 0; syncActs();
  later(900, () => {
    hands[s] = hands[s].concat(bottom);
    if (s === 0) newCards = bottom.slice();
    later(1600, () => { newCards = []; });
    shown = [null, null, null];
    phase = 'play'; cur = s; last = null; passes = 0;
    toast(s === 0 ? T('youLandlord') : T('isLandlord', T('names')[s]));
    turn();
  });
}
function say(s, text) { shown[s] = { text, t: 0 }; }

// ---------------- 出牌 ----------------
function turn() {
  shown[cur] = null;
  hintList = []; hintIdx = 0;
  syncActs();
  if (cur !== 0) later(650 + Math.random() * 650, () => {
    const lastCtx = last && last.seat !== cur ? last : null;
    const c2 = D.aiPlay({ hand: hands[cur], seat: cur, roles, counts: hands.map(h => h.length), last: lastCtx, level });
    if (c2) play(cur, D.parse(c2.cards)); else pass(cur);
  });
}
function play(s, combo) {
  hands[s] = D.minus(hands[s], combo.cards);
  played.push(...combo.cards);
  plays[s]++;
  shown[s] = { combo, t: 0 };
  last = { seat: s, combo }; passes = 0;
  if (s === 0) sel.clear();
  SFX.card();
  effects(s, combo);
  const left = hands[s].length;
  if (left > 0 && left <= 2 && alarm[s] !== left) { alarm[s] = left; SFX.alarm(); }
  if (!left) { finish(s); return; }
  cur = (s + 1) % 3; later(250, turn);
}
function pass(s) {
  shown[s] = { text: T('passWords')[Math.floor(Math.random() * T('passWords').length)], t: 0 };
  SFX.pass();
  passes++;
  cur = (s + 1) % 3;
  if (passes >= 2) { last = null; passes = 0; }
  later(200, turn);
}
function effects(s, cb) {
  const at = s === 0 ? { x: 450, y: 300 } : s === 1 ? { x: 640, y: 210 } : { x: 260, y: 210 };
  if (cb.type === 'bomb') {
    bombs++; mult *= 2; popMult(); SFX.bomb(); shake = 14;
    fxText = { text: T('fxBomb'), t: 0, col: '#ff7a2a' };
    fx.burst(at.x, at.y, { n: 60, color: ['#ffd25a', '#ff7a2a', '#ff3b2a', '#fff3c0'], speed: 420, life: 0.9, size: 5, gravity: 200 });
    sprites.push({ emoji: '💣', x: at.x, y: at.y, t: 0, dur: 0.8, kind: 'pop' });
  } else if (cb.type === 'rocket') {
    bombs++; mult *= 2; popMult(); SFX.rocket(); shake = 10;
    fxText = { text: T('fxRocket'), t: 0, col: '#ff3b8a' };
    sprites.push({ emoji: '🚀', x: at.x, y: at.y, t: 0, dur: 1.2, kind: 'rocket' });
  } else if (cb.type.startsWith('plane')) {
    SFX.plane(); fxText = { text: T('fxPlane'), t: 0, col: '#3a9aff' };
    sprites.push({ emoji: '✈️', x: -60, y: 230, t: 0, dur: 1.5, kind: 'plane' });
  } else if (cb.type === 'straight') { SFX.seq(); fxText = { text: T('fxStraight'), t: 0, col: '#3fae5a' }; sprites.push({ kind: 'sweep', t: 0, dur: 0.7, y: at.y }); }
  else if (cb.type === 'dstraight') { SFX.seq(); fxText = { text: T('fxDouble'), t: 0, col: '#3fae5a' }; sprites.push({ kind: 'sweep', t: 0, dur: 0.7, y: at.y }); }
  else if (cb.type === 'four2' || cb.type === 'four22') fxText = { text: T('fxFour'), t: 0, col: '#b05aff' };
}
function popMult() { sprites.push({ kind: 'mult', t: 0, dur: 1, text: '×' + mult }); }
function finish(s) {
  phase = 'end'; syncActs(); KIT.stopMusic();
  const llWin = roles[s] === 'landlord';
  let spring = 0;
  if (llWin && plays[(landlord + 1) % 3] === 0 && plays[(landlord + 2) % 3] === 0) spring = 1;
  if (!llWin && plays[landlord] === 1) spring = 2;
  if (spring) { mult *= 2; fxText = { text: spring === 1 ? T('fxSpring') : T('fxAntiSpring'), t: 0, col: '#ff5aa0' }; fx.burst(450, 260, { n: 70, color: ['#ff9ac8', '#ffd0e6', '#fff', '#ffe08a'], speed: 300, life: 1.6, size: 5, gravity: 60 }); }
  const unit = BASE * mult, delta = [0, 0, 0];
  for (let i = 0; i < 3; i++) delta[i] = (roles[i] === 'landlord' ? 2 : 1) * unit * ((roles[i] === 'landlord') === llWin ? 1 : -1);
  for (let i = 0; i < 3; i++) beans[i] = Math.max(0, beans[i] + delta[i]);
  store.set('beans', beans[0]);
  const youWin = delta[0] > 0;
  if (youWin) stats.w++; else stats.l++;
  store.set('stats', stats);
  endInfo = { winner: s, llWin, spring, delta, youWin };
  (youWin ? SFX.win : SFX.lose)();
  if (youWin) fx.burst(450, 300, { n: 50, color: ['#ffd25a', '#fff', '#ff7a2a', '#7ad8ff'], speed: 380, life: 1.4, size: 5, gravity: 260 });
  later(1700, showEnd);
}

// ---------------- 玩家操作 ----------------
function selCombo() { return D.parse([...sel]); }
function humanCanPass() { return phase === 'play' && cur === 0 && last && last.seat !== 0; }
function syncActs() {
  const box = $('acts'); box.innerHTML = '';
  const btn = (txt, cls, fn, dis) => { const b = document.createElement('button'); b.className = 'act ' + cls; b.textContent = txt; b.disabled = !!dis; b.onclick = e => { e.stopPropagation(); KIT.audio(); fn(); }; box.appendChild(b); return b; };
  if (phase === 'bid' && cur === 0 && bid && bid.queue[0] === 0) {
    if (bid.mode === 'call') { btn(T('bNo'), 'ghost', () => answerBid(0, false)); btn(T('bCall'), 'gold', () => answerBid(0, true)); }
    else { btn(T('bNoRob'), 'ghost', () => answerBid(0, false)); btn(T('bRob'), 'gold', () => answerBid(0, true)); }
  } else if (phase === 'play' && cur === 0) {
    const lead = !last || last.seat === 0;
    if (!lead && !D.hints(hands[0], last.combo).length) { btn(T('cantBeat'), 'ghost wide', () => pass(0)); }
    else {
      btn(T('passBtn'), 'ghost', () => pass(0), lead);
      btn(T('hintBtn'), 'blue', doHint);
      btn(T('playBtn'), 'gold', doPlay);
    }
  }
  box.classList.toggle('hidden', !box.children.length);
}
function doHint() {
  if (!hintList.length) hintList = D.hints(hands[0], last && last.seat !== 0 ? last.combo : null);
  if (!hintList.length) return;
  sel = new Set(hintList[hintIdx % hintList.length].cards); hintIdx++;
  SFX.select();
}
function doPlay() {
  const cb = selCombo();
  const target = last && last.seat !== 0 ? last.combo : null;
  if (!cb) { SFX.bad(); toast(T('badType')); return; }
  if (!D.canBeat(cb, target)) { SFX.bad(); toast(T('cantBeatMsg')); return; }
  play(0, cb);
}
// 手牌布局（含点击 / 拖选）
function handLayout() {
  const h = D.sortCards(hands[0]).filter((id, i, arr) => phase !== 'deal' || true);
  const n = h.length, step = n > 1 ? Math.min(40, (W - 140 - CW) / (n - 1)) : 0, total = step * Math.max(0, n - 1) + CW, x0 = (W - total) / 2;
  return h.map((id, i) => ({ id, x: x0 + i * step, y: 438 - (sel.has(id) ? 22 : 0) - (newCards.includes(id) ? 12 : 0), w: i === n - 1 ? CW : step }));
}
let drag = null;
function cardAt(p) {
  const L = handLayout();
  for (let i = L.length - 1; i >= 0; i--) { const q = L[i]; if (p.x >= q.x && p.x <= q.x + q.w && p.y >= q.y && p.y <= q.y + CH + 22) return q.id; }
  return -1;
}
cv.addEventListener('pointerdown', e => {
  if (phase !== 'play' && phase !== 'bid' && phase !== 'reveal') return;
  const p = KIT.point(cv, e, W, H), id = cardAt(p);
  if (id < 0) { if (p.y > 300 && sel.size) { sel.clear(); } return; }
  const on = !sel.has(id); drag = { on, seen: new Set([id]) };
  if (on) sel.add(id); else sel.delete(id);
  hintList = []; SFX.select();
  try { cv.setPointerCapture(e.pointerId); } catch (_) {}
});
cv.addEventListener('pointermove', e => {
  if (!drag) return;
  const id = cardAt(KIT.point(cv, e, W, H));
  if (id < 0 || drag.seen.has(id)) return;
  drag.seen.add(id); if (drag.on) sel.add(id); else sel.delete(id); SFX.select();
});
const endDrag = () => { drag = null; };
cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', endDrag);
document.addEventListener('keydown', e => {
  if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
  if (phase === 'play' && cur === 0) {
    if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); doPlay(); }
    else if (e.code === 'KeyH' || e.code === 'KeyT') doHint();
    else if (e.code === 'KeyP' && humanCanPass()) pass(0);
    else if (e.code === 'Escape') sel.clear();
  } else if (phase === 'menu' && e.code === 'Enter') newRound();
});

// ---------------- 绘制 ----------------
function drawTable() {
  const g = c.createRadialGradient(W / 2, H * 0.45, 60, W / 2, H / 2, W * 0.7);
  g.addColorStop(0, '#2f9a63'); g.addColorStop(0.6, '#1f7a4c'); g.addColorStop(1, '#14553a');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  c.strokeStyle = 'rgba(255,255,255,.07)'; c.lineWidth = 2;
  c.beginPath(); c.ellipse(W / 2, H / 2 + 20, 360, 190, 0, 0, 7); c.stroke();
  c.fillStyle = 'rgba(255,255,255,.05)'; c.font = '46px ' + DISP; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(T('tableLogo'), W / 2, H / 2 + 20);
}
function card(id, x, y, sc = 1, face = true, alpha = 1) {
  c.globalAlpha = alpha;
  c.fillStyle = 'rgba(0,0,0,.18)'; KIT.roundRect(c, x + 2, y + 3, CW * sc, CH * sc, 7 * sc); c.fill();
  c.drawImage(face ? FACE[id] : BACK, x, y, CW * sc, CH * sc);
  c.globalAlpha = 1;
}
function comboOrder(cards) {
  const cnt = {}; cards.forEach(id => { cnt[rk(id)] = (cnt[rk(id)] || 0) + 1; });
  return cards.slice().sort((a, b) => cnt[rk(b)] - cnt[rk(a)] || rk(b) - rk(a));
}
function drawPlayed(s, cards, k) {
  const sc = s === 0 ? 0.82 : 0.72, step = 24 * sc / 0.72 * 0.95, n = cards.length, w = step * (n - 1) + CW * sc;
  let x0 = s === 0 ? W / 2 - w / 2 : s === 1 ? 740 - w : 160, y0 = s === 0 ? 268 : 150;
  const pop = 1 + (1 - KIT.ease.outBack(Math.min(1, k * 4))) * 0.25;
  c.save(); c.translate(x0 + w / 2, y0 + CH * sc / 2); c.scale(pop, pop); c.translate(-(x0 + w / 2), -(y0 + CH * sc / 2));
  comboOrder(cards).forEach((id, i) => card(id, x0 + i * step, y0, sc));
  c.restore();
}
function bubble(s, text, k) {
  const at = s === 0 ? [W / 2, 330] : s === 1 ? [700, 200] : [200, 200];
  c.globalAlpha = Math.min(1, k * 5);
  c.font = 'bold 20px ' + DISP; c.textAlign = 'center'; c.textBaseline = 'middle';
  const w = c.measureText(text).width + 30;
  c.fillStyle = 'rgba(255,255,255,.92)'; KIT.roundRect(c, at[0] - w / 2, at[1] - 20, w, 40, 20); c.fill();
  c.fillStyle = '#7a3b10'; c.fillText(text, at[0], at[1] + 1);
  c.globalAlpha = 1;
}
function drawSeat(s, now) {
  if (s === 0) return;
  const { x, y } = SEAT[s], active = (phase === 'play' || phase === 'bid') && cur === s;
  if (active) { const k = 0.5 + 0.5 * Math.sin(now / 160); c.fillStyle = `rgba(255,220,90,${0.25 + k * 0.3})`; c.beginPath(); c.arc(x, y, 44, 0, 7); c.fill(); }
  c.fillStyle = '#fff4dc'; c.beginPath(); c.arc(x, y, 34, 0, 7); c.fill();
  c.strokeStyle = roles[s] === 'landlord' ? '#ffb020' : 'rgba(255,255,255,.6)'; c.lineWidth = 3; c.stroke();
  c.font = '38px ' + EMOJI; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(AVA[s], x, y + 2);
  if (roles[s]) { c.font = '22px ' + EMOJI; c.fillText(roles[s] === 'landlord' ? '👑' : '👒', x + 24, y - 28); }
  c.font = 'bold 14px ' + DISP; c.fillStyle = '#fff'; c.fillText(T('names')[s], x, y + 50);
  c.font = 'bold 12px ' + NUMF; c.fillStyle = '#ffe08a'; c.fillText('🫘 ' + beans[s].toLocaleString(), x, y + 68);
  // 手牌背面 + 张数
  const n = phase === 'deal' ? dealt[s] : hands[s].length;
  if (n && phase !== 'end') {
    const bx = s === 1 ? x - 22 : x - 18, by = y + 82;
    for (let i = 0; i < Math.min(n, 6); i++) c.drawImage(BACK, bx + i * 2, by - i * 2, 40, 56);
    c.fillStyle = n <= 2 ? '#ff4a3a' : 'rgba(0,0,0,.55)'; KIT.roundRect(c, bx + 6, by + 18, 30, 22, 8); c.fill();
    c.fillStyle = '#fff'; c.font = 'bold 15px ' + NUMF; c.fillText(n, bx + 21, by + 30);
    if (n <= 2 && phase === 'play' && (now >> 8) & 1) { c.font = '20px ' + EMOJI; c.fillText('🚨', bx + 21, by - 16); }
  }
  if (phase === 'end' && hands[s].length) {
    const step = 18, w = step * (hands[s].length - 1) + CW * 0.6, x0 = s === 1 ? 760 - w : 140;
    D.sortCards(hands[s]).forEach((id, i) => card(id, x0 + i * step, 330, 0.6));
  }
}
function drawHUD() {
  c.textBaseline = 'middle';
  c.fillStyle = 'rgba(0,0,0,.28)'; KIT.roundRect(c, 12, 10, 190, 34, 17); c.fill();
  c.fillStyle = '#fff'; c.font = 'bold 14px ' + NUMF; c.textAlign = 'left';
  c.fillText(T('hudBase', BASE) + '   ' + T('hudMult'), 26, 28);
  c.fillStyle = '#ffd25a'; c.font = 'bold 17px ' + NUMF; c.fillText('×' + mult, 160, 28);
  c.fillStyle = 'rgba(0,0,0,.28)'; KIT.roundRect(c, W - 202, 10, 190, 34, 17); c.fill();
  c.fillStyle = '#ffe08a'; c.textAlign = 'right'; c.font = 'bold 15px ' + NUMF;
  c.fillText('🫘 ' + beans[0].toLocaleString() + (roles[0] ? (roles[0] === 'landlord' ? '  👑' : '  👒') : ''), W - 26, 28);
  // 底牌
  const bx = W / 2 - 64;
  bottom.forEach((id, i) => {
    const open = phase === 'play' || phase === 'end' || (phase === 'reveal' && revealT > 0.3);
    if (phase === 'menu') return;
    card(id, bx + i * 44, 10, 0.58, open);
  });
  if (recOn && (phase === 'play' || phase === 'reveal')) drawCounter();
}
function drawCounter() {
  const ORDER = [17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3], LBL = { 17: '大', 16: '小' };
  const mine = {}; hands[0].forEach(id => { mine[rk(id)] = (mine[rk(id)] || 0) + 1; });
  const gone = {}; played.forEach(id => { gone[rk(id)] = (gone[rk(id)] || 0) + 1; });
  const cw = 26, x0 = W / 2 - ORDER.length * cw / 2, y0 = 72;
  c.fillStyle = 'rgba(0,0,0,.32)'; KIT.roundRect(c, x0 - 6, y0 - 2, ORDER.length * cw + 12, 42, 10); c.fill();
  c.textAlign = 'center';
  ORDER.forEach((r, i) => {
    const tot = r >= 16 ? 1 : 4, left = tot - (mine[r] || 0) - (gone[r] || 0), x = x0 + i * cw + cw / 2;
    c.fillStyle = 'rgba(255,255,255,.75)'; c.font = 'bold 11px ' + NUMF; c.fillText(LBL[r] || rankLabel(r), x, y0 + 10);
    c.fillStyle = left === 0 ? 'rgba(255,255,255,.3)' : left >= (r >= 16 ? 1 : 3) ? '#ffd25a' : '#fff'; c.font = 'bold 14px ' + NUMF; c.fillText(left, x, y0 + 28);
  });
}
function drawHand(now) {
  if (phase === 'menu') return;
  let L = handLayout();
  if (phase === 'deal') { const vis = new Set(dealOrderHuman().slice(0, dealt[0])); L = layoutFor(D.sortCards(hands[0].filter(id => vis.has(id)))); }
  for (const q of L) {
    card(q.id, q.x, q.y);
    if (sel.has(q.id)) { c.fillStyle = 'rgba(255,210,60,.18)'; KIT.roundRect(c, q.x, q.y, CW, CH, 7); c.fill(); }
    if (newCards.includes(q.id)) { c.strokeStyle = `rgba(255,200,40,${0.6 + 0.4 * Math.sin(now / 120)})`; c.lineWidth = 2.5; KIT.roundRect(c, q.x + 1, q.y + 1, CW - 2, CH - 2, 7); c.stroke(); }
  }
  if (roles[0] && phase !== 'menu') {
    c.font = 'bold 13px ' + NUMF; c.textAlign = 'left'; c.fillStyle = 'rgba(255,255,255,.85)';
    c.fillText((roles[0] === 'landlord' ? '👑 ' + T('rLandlord') : '👒 ' + T('rFarmer')) + ' · ' + T('nCards', hands[0].length), 20, H - 14);
  }
  if ((phase === 'play' || phase === 'bid') && cur === 0) { c.fillStyle = `rgba(255,220,90,${0.5 + 0.4 * Math.sin(now / 160)})`; c.fillRect(W / 2 - 60, H - 6, 120, 3); }
}
let dealCache = null;
function dealOrderHuman() { return hands[0]; }
function layoutFor(h) {
  const n = h.length, step = n > 1 ? Math.min(40, (W - 140 - CW) / (n - 1)) : 0, total = step * Math.max(0, n - 1) + CW, x0 = (W - total) / 2;
  return h.map((id, i) => ({ id, x: x0 + i * step, y: 438, w: CW }));
}
function drawSprites(dt) {
  for (const s of sprites) {
    s.t += dt; const k = Math.min(1, s.t / s.dur);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    if (s.kind === 'pop') { c.font = (40 + 40 * Math.sin(k * Math.PI)) + 'px ' + EMOJI; c.globalAlpha = 1 - k; c.fillText(s.emoji, s.x, s.y - k * 30); }
    else if (s.kind === 'rocket') {
      const y = s.y - KIT.ease.inOut(k) * (s.y + 80), x = s.x + Math.sin(k * 6) * 10;
      c.save(); c.translate(x, y); c.rotate(-Math.PI / 4); c.font = '64px ' + EMOJI; c.fillText(s.emoji, 0, 0); c.restore();
      fx.burst(x, y + 30, { n: 3, color: ['#ffd25a', '#ff7a2a', '#fff'], speed: 120, life: 0.5, size: 4, gravity: 300, angle: Math.PI / 2, spread: 0.8 });
    } else if (s.kind === 'plane') {
      const x = -60 + KIT.ease.inOut(k) * (W + 120), y = s.y - Math.sin(k * Math.PI) * 60;
      c.font = '70px ' + EMOJI; c.fillText(s.emoji, x, y);
      fx.burst(x - 40, y + 10, { n: 2, color: ['#ffffff', '#cfe9ff'], speed: 40, life: 0.6, size: 5, gravity: 0 });
    } else if (s.kind === 'sweep') {
      const x = -100 + k * (W + 200), g = c.createLinearGradient(x - 120, 0, x + 120, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(x - 120, s.y - 60, 240, 120);
    } else if (s.kind === 'mult') {
      c.globalAlpha = 1 - k; c.font = 'bold ' + (26 + 14 * Math.sin(Math.min(1, k * 3) * Math.PI)) + 'px ' + NUMF; c.fillStyle = '#ffd25a';
      c.fillText(s.text, 160, 60 + k * -18);
    }
    c.globalAlpha = 1;
  }
  sprites = sprites.filter(s => s.t < s.dur);
}
function drawFxText(dt) {
  if (!fxText) return;
  fxText.t += dt;
  const k = fxText.t, sc = k < 0.3 ? 2 - KIT.ease.outBack(k / 0.3) : 1, a = k > 1.3 ? Math.max(0, 1 - (k - 1.3) / 0.4) : 1;
  c.save(); c.translate(W / 2, 200); c.scale(sc, sc); c.globalAlpha = a;
  c.font = '54px ' + DISP; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.lineWidth = 8; c.strokeStyle = 'rgba(0,0,0,.45)'; c.strokeText(fxText.text, 0, 0);
  c.fillStyle = fxText.col; c.fillText(fxText.text, 0, 0);
  c.restore();
  if (a <= 0) fxText = null;
}
let lastT = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  c.save();
  if (shake > 0) { c.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake); shake = Math.max(0, shake - dt * 30); }
  drawTable();
  if (phase === 'menu') drawMenuDecor(now);
  else {
    drawHUD();
    for (let s = 1; s <= 2; s++) drawSeat(s, now);
    for (let s = 0; s < 3; s++) {
      const sh = shown[s]; if (!sh) continue;
      sh.t += dt;
      if (sh.combo) drawPlayed(s, sh.combo.cards, sh.t); else bubble(s, sh.text, sh.t);
    }
    // 发牌飞行
    for (const f of flyers) {
      f.t += dt * 4; const k = Math.min(1, f.t), to = f.s === 0 ? [W / 2 - 35, 438] : [SEAT[f.s].x - 20, SEAT[f.s].y + 80];
      const x = W / 2 - 35 + (to[0] - W / 2 + 35) * KIT.ease.outCubic(k), y = 180 + (to[1] - 180) * KIT.ease.outCubic(k);
      c.drawImage(BACK, x, y, CW * (f.s ? 0.6 : 1), CH * (f.s ? 0.6 : 1));
      if (k >= 1 && !f.done) { f.done = true; dealt[f.s]++; }
    }
    flyers = flyers.filter(f => !f.done);
    if (phase === 'deal' && dealt[0] + dealt[1] + dealt[2] < 51) c.drawImage(BACK, W / 2 - 35, 180, CW, CH);
    if (phase === 'reveal') revealT += dt;
    drawHand(now);
  }
  fx.update(dt); fx.draw(c);
  drawSprites(dt);
  drawFxText(dt);
  c.restore();
  requestAnimationFrame(frame);
}
function drawMenuDecor(now) {
  const ids = [53, 52, 51, 47, 43, 39, 35];
  ids.forEach((id, i) => {
    const a = (i - 3) * 0.16 + Math.sin(now / 900) * 0.03;
    c.save(); c.translate(W / 2, 470); c.rotate(a); c.drawImage(FACE[id], -CW * 0.9, -260, CW * 1.8, CH * 1.8); c.restore();
  });
}

// ---------------- DOM ----------------
const toastEl = $('toast');
function toast(t) { KIT.toast(toastEl, t); }
function hideScreens() { ['screen-menu', 'screen-end'].forEach(id => $(id).classList.add('hidden')); }
function showEnd() {
  const e = endInfo; if (!e) return;
  $('end-emo').textContent = e.youWin ? '🎉' : '😵';
  $('end-title').textContent = e.youWin ? T('youWin') : T('youLose');
  $('end-title').className = e.youWin ? 'clear-title' : 'over-title';
  $('end-sub').textContent = (e.llWin ? T('llWins') : T('farmersWin')) + (e.spring === 1 ? ' · ' + T('fxSpring') : e.spring === 2 ? ' · ' + T('fxAntiSpring') : '');
  const rows = [0, 1, 2].map(i => `<span>${AVA[i]} ${T('names')[i]} ${roles[i] === 'landlord' ? '👑' : '👒'}</span><b class="${e.delta[i] > 0 ? 'up' : 'down'}">${e.delta[i] > 0 ? '+' : ''}${e.delta[i].toLocaleString()}</b>`);
  rows.push(`<span>${T('multDetail', robs, bombs)}</span><b>×${mult}</b>`);
  rows.push(`<span>${T('recLbl')}</span><b>${stats.w} / ${stats.l}</b>`);
  $('end-stats').innerHTML = rows.join('');
  $('screen-end').classList.remove('hidden');
}
function toMenu() {
  token++; phase = 'menu'; hideScreens(); KIT.stopMusic(); syncActs(); renderMenu();
  $('screen-menu').classList.remove('hidden');
}
function renderMenu() {
  $('menu-beans').textContent = T('beansLbl', beans[0].toLocaleString());
  document.querySelectorAll('#rec-seg button').forEach(b => b.classList.toggle('on', (b.dataset.r === '1') === recOn));
  document.querySelectorAll('#lv-seg button').forEach(b => b.classList.toggle('on', +b.dataset.l === level));
}
document.querySelectorAll('#rec-seg button').forEach(b => b.onclick = () => { recOn = b.dataset.r === '1'; store.set('recorder', recOn); renderMenu(); });
document.querySelectorAll('#lv-seg button').forEach(b => b.onclick = () => { level = +b.dataset.l; store.set('level', level); renderMenu(); });
$('btn-start').onclick = newRound;
$('btn-again').onclick = newRound;
$('btn-menu').onclick = toMenu;
$('btn-rec').onclick = () => { recOn = !recOn; store.set('recorder', recOn); };
$('btn-home').onclick = toMenu;

if (location.hash === '#debug') window.__dz = {
  info: () => ({ phase, cur, roles, mult, counts: hands.map(h => h.length), last: last && { seat: last.seat, type: last.combo.type }, beans }),
  hand: () => D.sortCards(hands[0]).map(rk),
  autoplay: () => { const id = setInterval(() => { if (phase === 'bid' && cur === 0) answerBid(0, true); else if (phase === 'play' && cur === 0) { const h = D.hints(hands[0], last && last.seat !== 0 ? last.combo : null); if (h.length) play(0, D.parse(h[0].cards)); else pass(0); } else if (phase === 'end') clearInterval(id); }, 300); },
  give: ids => { hands[0] = ids; },
  D
};
renderFaces();
const syncMute = KIT.mountMute($('btn-mute'));
KIT.boot(() => { syncMute(); renderMenu(); syncActs(); });
toMenu();
if (document.fonts && document.fonts.ready) document.fonts.ready.then(renderFaces);
requestAnimationFrame(frame);
})();
