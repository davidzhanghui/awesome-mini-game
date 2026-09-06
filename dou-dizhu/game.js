(() => {
// 牌：0-51 普通牌（0-12: 方块3..2, 13-25 梅花, 26-38 红桃, 39-51 黑桃），52 小王，53 大王
// 点数 rank：0=3 ... 12=2, 13=小王, 14=大王
const W = 760, H = 620;
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const $ = id => document.getElementById(id);
const dpr = Math.min(window.devicePixelRatio || 1, 2);
canvas.width = W * dpr; canvas.height = H * dpr;
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

const store = {
  get muted() { return localStorage.getItem('ddz-muted') === '1'; },
  set muted(v) { localStorage.setItem('ddz-muted', v ? '1' : '0'); },
  get stats() { try { return JSON.parse(localStorage.getItem('ddz-stats') || '{"w":0,"l":0,"s":0}'); } catch (e) { return { w: 0, l: 0, s: 0 }; } },
  set stats(s) { localStorage.setItem('ddz-stats', JSON.stringify(s)); }
};
let actx = null, muted = store.muted;
function tone(f, dur, type, vol) {
  if (muted) return;
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type || 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(vol || .1, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(.001, actx.currentTime + dur);
    o.connect(g); g.connect(actx.destination); o.start(); o.stop(actx.currentTime + dur);
  } catch (e) {}
}
const sfx = {
  deal: () => tone(500, .06, 'triangle', .08),
  play: () => { tone(420, .08, 'triangle', .11); },
  bomb: () => { tone(150, .35, 'sawtooth', .16, -80); },
  win: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, .15, 'sine', .11), i * 100)),
  lose: () => [400, 350, 300].forEach((f, i) => setTimeout(() => tone(f, .2, 'sine', .1), i * 140)),
  click: () => tone(700, .06, 'sine', .09),
  bad: () => tone(180, .14, 'square', .09)
};

const rank = c => c >= 52 ? (c === 52 ? 13 : 14) : (c % 13);
const suit = c => c >= 52 ? -1 : Math.floor(c / 13);
const RSYM = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2', '小王', '大王'];
const cardName = c => RSYM[rank(c)];
const isRedSuit = c => c < 52 && (suit(c) === 0 || suit(c) === 2);

// ---------- 牌型判定 ----------
function countRanks(cards) {
  const m = {};
  for (const c of cards) { const r = rank(c); m[r] = (m[r] || 0) + 1; }
  return m;
}
// 返回 {type, main, len, count} 或 null
// type: single pair trio trio1 trio2 straight pairseq plane plane1 plane2 bomb rocket pass
function analyze(cards) {
  if (!cards || !cards.length) return null;
  const cs = cards.slice().sort((a, b) => rank(a) - rank(b));
  const n = cs.length, m = countRanks(cs);
  const ranks = Object.keys(m).map(Number).sort((a, b) => a - b);
  const counts = ranks.map(r => m[r]);
  const maxR = Math.max(...ranks);
  if (n === 1) return { type: 'single', main: ranks[0], len: 1 };
  if (n === 2) {
    if (ranks.includes(13) && ranks.includes(14)) return { type: 'rocket', main: 14, len: 2 };
    if (counts[0] === 2) return { type: 'pair', main: ranks[0], len: 1 };
    return null;
  }
  if (n === 3 && counts[0] === 3) return { type: 'trio', main: ranks[0], len: 1 };
  if (n === 4) {
    if (counts[0] === 4) return { type: 'bomb', main: ranks[0], len: 1 };
    if (counts.includes(3)) {
      const t = ranks[counts.indexOf(3)];
      return { type: 'trio1', main: t, len: 1 };
    }
    return null;
  }
  if (n === 5 && counts.length === 2 && counts.includes(3) && counts.includes(2))
    return { type: 'trio2', main: ranks[counts.indexOf(3)], len: 1 };
  // 四带二（两张单）/ 四带一对
  if (n === 6 && counts.includes(4)) {
    const main = ranks[counts.indexOf(4)];
    const rest = ranks.filter(r => r !== main);
    if (rest.length === 2 && rest.every(r => m[r] === 1)) return { type: 'four2', main, len: 1 };
    if (rest.length === 1 && m[rest[0]] === 2) return { type: 'four2', main, len: 1 };
  }
  // 四带两对
  if (n === 8 && counts.includes(4)) {
    const main = ranks[counts.indexOf(4)];
    const rest = ranks.filter(r => r !== main);
    if (rest.length === 2 && rest.every(r => m[r] === 2)) return { type: 'four22', main, len: 1 };
  }
  // 炸弹（4张以上同点）
  if (counts.length === 1 && counts[0] >= 4) return { type: 'bomb', main: ranks[0], len: 1, count: counts[0] };
  // 顺子：5+，不能含2/王
  if (maxR < 12 && counts.every(c => c === 1) && n >= 5 && ranks[n - 1] - ranks[0] === n - 1)
    return { type: 'straight', main: ranks[0], len: n };
  // 连对：3+对，不能含2/王
  if (maxR < 12 && counts.every(c => c === 2) && n >= 6 && ranks[ranks.length - 1] - ranks[0] === ranks.length - 1)
    return { type: 'pairseq', main: ranks[0], len: ranks.length };
  // 飞机
  const trios = ranks.filter(r => m[r] === 3);
  if (trios.length >= 2 && Math.max(...trios) < 12) {
    const sorted = trios.slice().sort((a, b) => a - b);
    let chain = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === chain[chain.length - 1] + 1) chain.push(sorted[i]);
      else if (chain.length >= 2) break;
      else chain = [sorted[i]];
    }
    if (chain.length >= 2 && chain[chain.length - 1] - chain[0] + 1 === chain.length) {
      const L = chain.length, used = L * 3, rest = n - used;
      const restRanks = ranks.filter(r => !chain.includes(r));
      if (rest === 0) return { type: 'plane', main: chain[0], len: L };
      if (rest === L && restRanks.every(r => m[r] === 1)) return { type: 'plane1', main: chain[0], len: L };
      if (rest === L * 2) {
        const pairs = restRanks.filter(r => m[r] === 2);
        if (pairs.length === L) return { type: 'plane2', main: chain[0], len: L };
      }
    }
  }
  // 三带（6张以上变体：三带二不能用对子拆——简化：只支持标准5张；其余判非法）
  return null;
}
function beats(a, b) {
  // a 能否大过 b（b 为 null 表示可任意出）
  if (!b) return !!a;
  if (!a) return false;
  if (a.type === 'rocket') return true;
  if (b.type === 'rocket') return false;
  if (a.type === 'bomb' && b.type !== 'bomb') return true;
  if (a.type !== 'bomb' && b.type === 'bomb') return false;
  if (a.type === 'bomb' && b.type === 'bomb') return a.main > b.main;
  if (a.type !== b.type || (a.len || 0) !== (b.len || 0)) return false;
  return a.main > b.main;
}

// ---------- AI ----------
function allCombos(hand, last) {
  // 生成能大过 last 的候选（按从小到大）
  const out = [];
  const m = countRanks(hand);
  const byRank = {};
  for (const c of hand) { const r = rank(c); (byRank[r] = byRank[r] || []).push(c); }
  const ranks = Object.keys(byRank).map(Number).sort((a, b) => a - b);
  const push = cards => { if (cards && cards.length) out.push(cards); };
  const need = last ? null : null;
  if (!last) {
    // 首手：出最小单张（保留炸弹王炸）
    for (const r of ranks) {
      if ((m[r] || 0) === 4 || r >= 13) continue;
      push([byRank[r][0]]);
      return out;
    }
    push([hand[0]]);
    return out;
  }
  const t = last.type, main = last.main, len = last.len || 1;
  const hasTrio = c => (m[c] || 0) >= 3 && c > main;
  if (t === 'single') {
    for (const r of ranks) {
      if (r > main && (m[r] || 0) < 4) { push([byRank[r][0]]); return out; }
    }
  } else if (t === 'pair') {
    for (const r of ranks) {
      if (r > main && (m[r] || 0) >= 2 && (m[r] || 0) < 4) { push(byRank[r].slice(0, 2)); return out; }
    }
  } else if (t === 'trio') {
    for (const r of ranks) if (r > main && (m[r] || 0) >= 3 && (m[r] || 0) < 4) { push(byRank[r].slice(0, 3)); return out; }
  } else if (t === 'trio1') {
    for (const r of ranks) {
      if (r > main && (m[r] || 0) === 3) {
        const kick = ranks.find(k => k !== r && (m[k] || 0) < 4 && (m[k] || 0) <= 2);
        if (kick !== undefined) { push(byRank[r].slice(0, 3).concat([byRank[kick][0]])); return out; }
      }
    }
  } else if (t === 'trio2') {
    for (const r of ranks) {
      if (r > main && (m[r] || 0) === 3) {
        const pr = ranks.find(k => k !== r && (m[k] || 0) >= 2 && (m[k] || 0) < 4);
        if (pr !== undefined) { push(byRank[r].slice(0, 3).concat(byRank[pr].slice(0, 2))); return out; }
      }
    }
  } else if (t === 'straight') {
    for (let s = main + 1; s + len - 1 < 12; s++) {
      const seq = [];
      let ok = true;
      for (let k = 0; k < len; k++) {
        const r = s + k;
        if (!byRank[r] || (m[r] || 0) !== 1) { ok = false; break; }
        seq.push(byRank[r][0]);
      }
      if (ok) { push(seq); return out; }
    }
  } else if (t === 'pairseq') {
    for (let s = main + 1; s + len - 1 < 12; s++) {
      const seq = [];
      let ok = true;
      for (let k = 0; k < len; k++) {
        const r = s + k;
        if (!byRank[r] || (m[r] || 0) < 2) { ok = false; break; }
        seq.push(...byRank[r].slice(0, 2));
      }
      if (ok) { push(seq); return out; }
    }
  } else if (t === 'plane' || t === 'plane1' || t === 'plane2') {
    for (let s = main + 1; s + len - 1 < 12; s++) {
      const seq = [];
      let ok = true;
      for (let k = 0; k < len; k++) {
        const r = s + k;
        if (!byRank[r] || (m[r] || 0) < 3) { ok = false; break; }
        seq.push(...byRank[r].slice(0, 3));
      }
      if (!ok) continue;
      if (t === 'plane') { push(seq); return out; }
      const used = new Set(seq);
      const leftRanks = ranks.filter(r => !seq.some(c => rank(c) === r) || (m[r] || 0) > 3);
      if (t === 'plane1') {
        const kicks = [];
        for (const r of ranks) {
          if (seq.some(c => rank(c) === r) && (m[r] || 0) <= 3) continue;
          const avail = (byRank[r] || []).filter(c => !used.has(c));
          if (!avail.length) continue;
          kicks.push(avail[0]); used.add(avail[0]);
          if (kicks.length === len) break;
        }
        if (kicks.length === len) { push(seq.concat(kicks)); return out; }
      }
      if (t === 'plane2') {
        const kicks = [];
        for (const r of ranks) {
          if (r >= s && r < s + len) continue;
          if ((m[r] || 0) >= 2 && (m[r] || 0) < 4) {
            kicks.push(...byRank[r].slice(0, 2));
            if (kicks.length / 2 === len) break;
          }
        }
        if (kicks.length === len * 2) { push(seq.concat(kicks)); return out; }
      }
    }
  } else if (t === 'four2') {
    for (const r of ranks) {
      if (r > main && (m[r] || 0) >= 4) {
        const body = byRank[r].slice(0, 4);
        const kick = [];
        for (const k of ranks) {
          if (k === r) continue;
          const avail = byRank[k] || [];
          for (const c of avail) { if (kick.length < 2) kick.push(c); }
          if (kick.length >= 2) break;
        }
        if (kick.length >= 2) { push(body.concat(kick.slice(0, 2))); return out; }
      }
    }
  } else if (t === 'four22') {
    for (const r of ranks) {
      if (r > main && (m[r] || 0) >= 4) {
        const body = byRank[r].slice(0, 4);
        const kick = [];
        for (const k of ranks) {
          if (k === r) continue;
          if ((m[k] || 0) >= 2) { kick.push(...byRank[k].slice(0, 2)); if (kick.length >= 4) break; }
        }
        if (kick.length >= 4) { push(body.concat(kick.slice(0, 4))); return out; }
      }
    }
  }
  // 炸弹 / 王炸兜底（队友必胜不炸在上层控制）
  for (const r of ranks) {
    if ((m[r] || 0) >= 4 && (t !== 'bomb' || r > main)) { push(byRank[r].slice(0, 4)); return out; }
  }
  if (byRank[13] && byRank[14]) { push([byRank[13][0], byRank[14][0]]); return out; }
  return out; // 空 = 不出
}
function aiBid(hand) {
  // 叫分：大牌越多叫越高
  let s = 0;
  const m = countRanks(hand);
  if (m[14]) s += 3;
  if (m[13]) s += 2;
  for (let r = 10; r <= 12; r++) s += (m[r] || 0) * .8;
  for (const r of Object.keys(m)) if (m[r] === 4) s += 2;
  if (s >= 5) return 3;
  if (s >= 3.2) return 2;
  if (s >= 1.8) return 1;
  return 0;
}
function aiPlay(G, seat) {
  const hand = G.hands[seat];
  const last = G.lastPlay;
  const isMate = (G.roles[seat] === G.roles[(G.landlord + 1) % 3] || G.roles[seat] === G.roles[(G.landlord + 2) % 3]) && G.roles[(seat + 1) % 3] !== G.roles[seat] && G.roles[(seat + 2) % 3] !== G.roles[seat];
  // 队友刚出且下家（对手）只剩1张且我方不是出牌者 → 能大必须大（简化：队友出牌后若我是农民且队友出的非炸弹，50%放行）
  const mateJustPlayed = last && last.seat !== undefined && G.roles[last.seat] === G.roles[seat] && last.seat !== seat;
  if (mateJustPlayed && G.roles[seat] !== 'landlord') {
    // 若对手只剩 ≤2 张，不放行
    const foes = [0, 1, 2].filter(i => G.roles[i] !== G.roles[seat]);
    if (foes.some(f => G.hands[f].length <= 2)) {
      // 必须管
    } else if (last.type !== 'bomb' && last.type !== 'rocket') {
      return []; // 放行让队友走
    }
  }
  const cands = allCombos(hand, last && last.seat !== seat ? last : null);
  if (!cands.length) return [];
  // 地主 vs 农民末尾压制：对手剩1张时优先出大单
  const foes = [0, 1, 2].filter(i => G.roles[i] !== G.roles[seat]);
  if (foes.some(f => G.hands[f].length === 1) && (!last || last.seat === seat)) {
    const m = countRanks(hand);
    for (let r = 12; r >= 0; r--) {
      if ((m[r] || 0) === 1) {
        const c = hand.find(c => rank(c) === r);
        return [c];
      }
    }
  }
  return cands[0];
}

// ---------- 对局 ----------
const G = {
  state: 'menu', hands: [[], [], []], roles: ['', '', ''], landlord: -1,
  dipai: [], turn: 0, lastPlay: null, passCount: 0, sel: new Set(),
  bids: [], bidTurn: 0, maxBid: 0, phase: 'bid', bombs: 0, spring: true,
  plays: [[], [], []], playCount: [0, 0, 0], msg: '', msgT: 0, aiTimer: 0, sortAsc: true
};
function reset() {
  G.hands = [[], [], []]; G.roles = ['', '', '']; G.landlord = -1;
  G.dipai = []; G.turn = 0; G.lastPlay = null; G.passCount = 0; G.sel = new Set();
  G.bids = []; G.bidTurn = 0; G.maxBid = 0; G.phase = 'bid'; G.bombs = 0; G.spring = true;
  G.plays = [[], [], []]; G.playCount = [0, 0, 0];
  const deck = [...Array(54).keys()];
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [deck[i], deck[j]] = [deck[j], deck[i]]; }
  G.dipai = deck.slice(0, 3);
  for (let i = 0; i < 3; i++) {
    G.hands[i] = deck.slice(3 + i * 17, 3 + (i + 1) * 17).sort((a, b) => rank(b) - rank(a));
  }
  G.bidTurn = Math.random() * 3 | 0;
  G.turn = G.bidTurn;
}
function seatName(i) { return i === 0 ? '你' : 'AI·' + (i === 1 ? '右' : '左'); }
function doBid(seat, bid) {
  G.bids[seat] = bid;
  if (bid > 0) { G.maxBid = bid; G.landlord = seat; }
  G.bidTurn = (G.bidTurn + 1) % 3;
  const done = G.bids.filter(b => b !== undefined).length >= 3;
  if (done) {
    if (G.maxBid === 0) { // 无人叫：重发
      flash('无人叫地主，重新发牌');
      setTimeout(() => { if (G.state === 'play') { reset(); } }, 1200);
      return;
    }
    G.roles = ['', '', ''];
    G.roles[G.landlord] = 'landlord';
    G.roles[(G.landlord + 1) % 3] = 'farmer';
    G.roles[(G.landlord + 2) % 3] = 'farmer';
    G.hands[G.landlord] = G.hands[G.landlord].concat(G.dipai).sort((a, b) => rank(b) - rank(a));
    G.phase = 'play';
    G.turn = G.landlord;
    G.aiTimer = 1;
    sfx.play();
    refreshCounter();
  } else {
    G.turn = G.bidTurn;
    G.aiTimer = 1;
  }
}
function removeCards(seat, cards) {
  for (const c of cards) {
    const i = G.hands[seat].indexOf(c);
    if (i >= 0) G.hands[seat].splice(i, 1);
  }
}
function playCards(seat, cards) {
  const an = analyze(cards);
  if (!an) { flash('牌型不合法'); sfx.bad(); return false; }
  const last = G.lastPlay && G.lastPlay.seat !== seat ? G.lastPlay : null;
  if (!beats(an, last)) { flash(last ? '管不上上家' : '牌型不对'); sfx.bad(); return false; }
  removeCards(seat, cards);
  an.seat = seat;
  G.lastPlay = an;
  G.plays[seat] = cards.slice();
  G.passCount = 0;
  if (an.type === 'bomb' || an.type === 'rocket') { G.bombs++; sfx.bomb(); }
  else sfx.play();
  G.playCount[seat] = (G.playCount[seat] || 0) + 1;
  if (G.hands[seat].length === 0) { endGame(seat); return true; }
  G.turn = (seat + 1) % 3;
  G.aiTimer = 1;
  refreshCounter();
  return true;
}
function passTurn(seat) {
  if (!G.lastPlay || G.lastPlay.seat === seat) return false; // 首手不能不出
  G.plays[seat] = [];
  G.passCount++;
  G.turn = (seat + 1) % 3;
  if (G.passCount >= 2) { G.lastPlay = null; }
  sfx.click();
  G.aiTimer = 1;
  refreshCounter();
  return true;
}
function endGame(winner) {
  G.state = 'over';
  const winLandlord = G.roles[winner] === 'landlord';
  const iWin = (winner === 0);
  const lp = G.playCount[G.landlord] || 0;
  const fp = [1, 2].map(i => (G.landlord + i) % 3).reduce((s, i) => s + (G.playCount[i] || 0), 0);
  let spring = false, springName = '';
  if (winLandlord && fp === 0) { spring = true; springName = '春天'; }
  if (!winLandlord && lp <= 1) { spring = true; springName = '反春天'; }
  G.spring = spring;
  const mult = Math.pow(2, G.bombs) * (spring ? 2 : 1);
  const base = winLandlord ? 200 : 100;
  const delta = (iWin ? 1 : -1) * base * Math.max(1, mult);
  const st = store.stats;
  if (iWin) st.w++; else st.l++;
  st.s += delta;
  store.stats = st;
  refreshStats();
  if (iWin) sfx.win(); else sfx.lose();
  $('over-title').textContent = winner === 0 ? '🎉 你赢了！' : (winLandlord ? '😈 地主获胜' : '🎉 农民胜利！');
  $('over-sub').innerHTML = '地主：' + seatName(G.landlord) + ' · 炸弹×' + G.bombs + (spring ? ' · ' + springName : '') +
    '<br>积分 ' + (delta > 0 ? '+' : '') + delta + '（总 ' + st.s + '）';
  setTimeout(() => $('screen-over').classList.remove('hidden'), 600);
}
function flash(m) { G.msg = m; G.msgT = 2.2; }
function refreshStats() {
  const st = store.stats;
  $('st-w').textContent = st.w; $('st-l').textContent = st.l; $('st-s').textContent = st.s;
  refreshCounter();
}
function refreshCounter() {
  const el = $('card-counter');
  if (!el) return;
  if (G.state !== 'play' || G.phase === 'bid') { el.textContent = '开局后显示剩余牌'; return; }
  const left = {};
  for (const h of G.hands) for (const c of h) { const r = rank(c); left[r] = (left[r] || 0) + 1; }
  const order = [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0];
  el.innerHTML = order.filter(r => left[r]).map(r => '<span>' + RSYM[r] + '<b>' + left[r] + '</b></span>').join('');
}

// ---------- AI 调度 ----------
function updateAI(dt) {
  if (G.state !== 'play' || G.aiTimer <= 0) return;
  G.aiTimer -= dt;
  if (G.aiTimer > 0) return;
  if (G.phase === 'bid') {
    const seat = G.bidTurn;
    if (seat === 0) return; // 等玩家
    const myMax = Math.max(0, ...G.bids.filter(b => b !== undefined));
    let bid = aiBid(G.hands[seat]);
    if (bid <= myMax) bid = 0;
    if (Math.random() < .08) bid = 0;
    doBid(seat, bid);
    if (G.phase === 'bid' && G.bidTurn !== 0) G.aiTimer = .8;
    return;
  }
  const seat = G.turn;
  if (seat === 0) return;
  const cards = aiPlay(G, seat);
  if (!cards.length) {
    if (!passTurn(seat)) {
      // 首手异常：随便出最小
      const c = allCombos(G.hands[seat], null)[0] || [];
      if (c.length) playCards(seat, c);
    }
  } else {
    playCards(seat, cards);
  }
  if (G.state === 'play' && G.turn !== 0) G.aiTimer = .9;
}

// ---------- 渲染 ----------
function cardWH() { return { w: 56, h: 80 }; }
function drawCard(c, x, y, opts) {
  opts = opts || {};
  const { w, h } = cardWH();
  ctx.save();
  if (opts.small) { ctx.translate(x, y); ctx.scale(.62, .62); x = 0; y = 0; }
  ctx.fillStyle = opts.back ? '#1a4d8f' : '#fff';
  ctx.strokeStyle = opts.sel ? '#ffd93d' : '#333';
  ctx.lineWidth = opts.sel ? 3 : 1.5;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, 8);
  else ctx.rect(x, y, w, h);
  ctx.fill(); ctx.stroke();
  if (!opts.back) {
    const r = rank(c);
    const red = c >= 52 || isRedSuit(c);
    ctx.fillStyle = red ? '#d33' : '#222';
    ctx.font = '900 17px system-ui'; ctx.textAlign = 'left';
    const label = c >= 52 ? (c === 52 ? 'JOK' : 'JOK') : RSYM[r];
    ctx.fillText(label, x + 5, y + 20);
    ctx.font = '900 15px system-ui';
    ctx.fillText(c === 52 ? '小' : c === 53 ? '大' : ['♦', '♣', '♥', '♠'][suit(c)], x + 5, y + 38);
    if (c >= 52) {
      ctx.font = '28px serif'; ctx.textAlign = 'center';
      ctx.fillText(c === 52 ? '🃏' : '🎴', x + w / 2, y + 62);
    } else {
      ctx.font = '26px serif'; ctx.textAlign = 'center';
      ctx.fillStyle = red ? '#d33' : '#222';
      ctx.fillText(['♦', '♣', '♥', '♠'][suit(c)], x + w / 2, y + 62);
    }
  } else {
    ctx.fillStyle = 'rgba(255,255,255,.25)';
    ctx.font = '24px serif'; ctx.textAlign = 'center';
    ctx.fillText('🃏', x + w / 2, y + h / 2 + 8);
  }
  ctx.restore();
}
const BTNS = [];
function button(label, x, y, w, h, opts) {
  opts = opts || {};
  ctx.fillStyle = opts.dis ? '#666' : opts.primary ? '#ffb52e' : 'rgba(255,255,255,.16)';
  ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 2;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, 10);
  else ctx.rect(x, y, w, h);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = opts.dis ? '#aaa' : opts.primary ? '#5b3400' : '#fff';
  ctx.font = '900 16px system-ui'; ctx.textAlign = 'center';
  ctx.fillText(label, x + w / 2, y + h / 2 + 6);
  BTNS.push({ label, x, y, w, h, dis: opts.dis, cb: opts.cb });
  return { x, y, w, h };
}
function render(dt) {
  // 桌面
  const g = ctx.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, 520);
  g.addColorStop(0, '#147a5b'); g.addColorStop(1, '#0a3527');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  BTNS.length = 0;
  ctx.textAlign = 'center';
  // 顶栏：底牌 + 倍数
  ctx.fillStyle = '#fff'; ctx.font = '900 14px system-ui';
  ctx.fillText('底牌', 60, 26);
  G.dipai.forEach((c, i) => drawCard(c, 92 + i * 38, 6, { small: true }));
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffd93d';
  ctx.fillText('💣×' + G.bombs + '  ' + (G.phase === 'play' ? ('地主:' + seatName(G.landlord)) : '叫分中…'), W - 220, 26);
  if (G.state === 'menu') return;
  // 左右 AI 手牌数 + 出牌区
  const aiPos = [{ x: 88, y: 200 }, { x: W - 88, y: 200 }];
  [1, 2].forEach((seat, k) => {
    const p = aiPos[k];
    ctx.fillStyle = G.roles[seat] === 'landlord' ? '#ffd93d' : '#fff';
    ctx.font = '900 15px system-ui'; ctx.textAlign = 'center';
    ctx.fillText((G.roles[seat] === 'landlord' ? '😈' : '🧑‍🌾') + seatName(seat) + ' 🂠×' + G.hands[seat].length, p.x, 120);
    // 出的牌
    const pcs = G.plays[seat];
    if (pcs && pcs.length) {
      const tw = pcs.length * 30 + 26;
      const sx = k === 0 ? 120 : W - 120 - tw;
      pcs.forEach((c, i) => drawCard(c, sx + i * 30, 150, { small: true }));
    } else if (G.phase === 'play' && G.lastPlay && G.turn !== seat && G.plays[seat] !== undefined && G.movesShown !== false) {
      // 不出提示
      if (G.lastPlay && G.lastPlay.seat !== seat && (G.plays[seat] || []).length === 0 && G.hands[seat].length) {
        ctx.fillStyle = '#9fd8ff'; ctx.font = '900 22px system-ui';
        ctx.fillText('不出', k === 0 ? 150 : W - 150, 190);
      }
    }
    // 叫分显示
    if (G.phase === 'bid' && G.bids[seat] !== undefined) {
      ctx.fillStyle = '#ffd93d'; ctx.font = '900 20px system-ui';
      ctx.fillText(G.bids[seat] === 0 ? '不叫' : G.bids[seat] + '分', k === 0 ? 150 : W - 150, 190);
    }
  });
  // 中间出牌区（上家出的牌）
  if (G.lastPlay && G.phase === 'play') {
    const pcs = G.plays[G.lastPlay.seat] || [];
    if (pcs.length && G.lastPlay.seat !== 0) {
      // 已在两侧画出
    }
  }
  // 自己的出牌
  const mine = G.plays[0];
  if (mine && mine.length) {
    const tw = mine.length * 30 + 26;
    mine.forEach((c, i) => drawCard(c, W / 2 - tw / 2 + i * 30, 210, { small: true }));
  }
  // 玩家手牌
  const hand = G.hands[0];
  const { w } = cardWH();
  const gap = Math.min(44, (W - 80 - w) / Math.max(1, hand.length - 1 || 1));
  const startX = W / 2 - (gap * (hand.length - 1) + w) / 2;
  const hy = H - 130;
  hand.forEach((c, i) => {
    const sel = G.sel.has(c);
    drawCard(c, startX + i * gap, sel ? hy - 22 : hy, { sel });
    // 记录点击区
  });
  G._handGeom = { startX, gap, hy, w, h: 80 };
  // 按钮区
  const by = H - 34;
  if (G.phase === 'bid' && G.state === 'play') {
    if (G.bidTurn === 0) {
      const myMax = Math.max(0, ...G.bids.filter(b => b !== undefined));
      button('不叫', W / 2 - 190, by - 44, 86, 38, { cb: () => { doBid(0, 0); if (G.bidTurn !== 0) G.aiTimer = .8; } });
      [1, 2, 3].forEach((v, i) => {
        button(v + '分', W / 2 - 94 + i * 96, by - 44, 86, 38, {
          dis: v <= myMax,
          primary: v > myMax,
          cb: () => { if (v > myMax) { doBid(0, v); if (G.bidTurn !== 0) G.aiTimer = .8; } }
        });
      });
    } else {
      ctx.fillStyle = '#fff'; ctx.font = '15px system-ui'; ctx.textAlign = 'center';
      ctx.fillText('等待 ' + seatName(G.bidTurn) + ' 叫分…', W / 2, by - 18);
    }
  } else if (G.phase === 'play' && G.state === 'play') {
    if (G.turn === 0) {
      const canPass = G.lastPlay && G.lastPlay.seat !== 0;
      button('不出', W / 2 - 150, by - 44, 90, 38, {
        dis: !canPass,
        cb: () => { if (canPass) passTurn(0); }
      });
      button('出牌', W / 2 - 48, by - 44, 110, 38, {
        primary: true,
        cb: () => {
          const cards = hand.filter(c => G.sel.has(c));
          if (!cards.length) { flash('先选牌'); return; }
          if (playCards(0, cards)) G.sel = new Set();
        }
      });
      button('全选', W / 2 + 72, by - 44, 80, 38, { cb: () => { G.sel = new Set(hand); } });
    } else {
      ctx.fillStyle = '#fff'; ctx.font = '15px system-ui'; ctx.textAlign = 'center';
      ctx.fillText('等待 ' + seatName(G.turn) + ' 出牌…', W / 2, by - 18);
    }
  }
  // 选中牌型提示
  if (G.sel.size && G.phase === 'play') {
    const cards = hand.filter(c => G.sel.has(c));
    const an = analyze(cards);
    ctx.fillStyle = an ? '#5ee66e' : '#ff8c8c'; ctx.font = '13px system-ui'; ctx.textAlign = 'center';
    const names = { single: '单张', pair: '对子', trio: '三张', trio1: '三带一', trio2: '三带二', straight: '顺子', pairseq: '连对', plane: '飞机', plane1: '飞机带单', plane2: '飞机带对', four2: '四带二', four22: '四带两对', bomb: '炸弹！', rocket: '王炸！' };
    ctx.fillText(an ? (names[an.type] || an.type) + ' ' + RSYM[an.main] : '牌型不对', W / 2, by - 52);
  }
  if (G.msgT > 0) {
    G.msgT -= dt;
    ctx.fillStyle = 'rgba(0,0,0,.72)';
    ctx.fillRect(W / 2 - 190, H / 2 - 26, 380, 52);
    ctx.fillStyle = '#ffd93d'; ctx.font = '900 19px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(G.msg, W / 2, H / 2 + 7);
  }
}
let last = performance.now();
function loop(now) {
  const dt = Math.min(((now || performance.now()) - last) / 1000, .05);
  last = now || performance.now();
  updateAI(dt);
  render(dt);
  requestAnimationFrame(loop);
}

// ---------- 输入 ----------
canvas.addEventListener('pointerdown', e => {
  if (G.state !== 'play') return;
  const r = canvas.getBoundingClientRect();
  const px = (e.clientX - r.left) / r.width * W, py = (e.clientY - r.top) / r.height * H;
  for (const b of BTNS) {
    if (!b.dis && px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) {
      sfx.click(); b.cb(); return;
    }
  }
  // 手牌点击
  const g = G._handGeom;
  if (g && py >= g.hy - 22 && py <= g.hy + g.h) {
    const i = Math.floor((px - g.startX) / g.gap + .4);
    const hand = G.hands[0];
    if (i >= 0 && i < hand.length) {
      const c = hand[i];
      if (G.sel.has(c)) G.sel.delete(c);
      else G.sel.add(c);
      sfx.click();
    }
  }
});
window.addEventListener('keydown', e => {
  if (e.code === 'KeyM') toggleMute();
  else if (e.code === 'KeyR') { if (G.state === 'over' || G.state === 'play') retry(); }
  else if (e.code === 'Escape') toMenu();
});
function retry() {
  $('screen-over').classList.add('hidden');
  reset(); G.state = 'play';
  sfx.click();
}
function toMenu() {
  G.state = 'menu';
  $('screen-menu').classList.remove('hidden');
  $('screen-over').classList.add('hidden');
}
$('btn-start').onclick = () => { $('screen-menu').classList.add('hidden'); reset(); G.state = 'play'; G.aiTimer = 1; sfx.click(); };
$('btn-retry').onclick = retry;
$('btn-menu').onclick = toMenu;
function toggleMute() {
  muted = !muted; store.muted = muted;
  $('btn-mute').textContent = muted ? '🔇' : '🔊';
}
$('btn-mute').onclick = toggleMute;
$('btn-mute').textContent = muted ? '🔇' : '🔊';

refreshStats();
reset();
requestAnimationFrame(t => { last = t; requestAnimationFrame(loop); });
window.__game = G;
window.__gameErrors = [];
window.addEventListener('error', e => window.__gameErrors.push(String(e.message)));
G._analyze = analyze; G._beats = beats; G._aiPlay = aiPlay; G._doBid = doBid; G._playCards = playCards; G._pass = passTurn; G._reset = reset;
})();
