/* 斗地主牌型规则 + AI（纯函数，无 DOM）
 * 牌 id 0..53：0..51 为 3..2（每点 4 张），52 小王，53 大王。点数 rk：3..15（A=14，2=15），16 小王，17 大王。
 */
(function (root) {
'use strict';
const rk = id => id >= 52 ? id - 36 : (id >> 2) + 3;
const byRank = cards => { const m = Array.from({ length: 18 }, () => []); for (const id of cards) m[rk(id)].push(id); return m; };
const mk = (type, rank, len, cards) => ({ type, rank, len, cards, n: cards.length });
const isBomb = c => c && (c.type === 'bomb' || c.type === 'rocket');
const sortCards = cards => cards.slice().sort((a, b) => rk(b) - rk(a) || b - a);

function parse(cards) {
  const n = cards.length; if (!n) return null;
  const R = byRank(cards), cnt = R.map(a => a.length), ranks = [];
  for (let r = 3; r <= 17; r++) if (cnt[r]) ranks.push(r);
  const top = ranks[ranks.length - 1];
  if (n === 2 && cnt[16] && cnt[17]) return mk('rocket', 17, 1, cards);
  if (n === 1) return mk('single', ranks[0], 1, cards);
  if (n === 2 && cnt[ranks[0]] === 2) return mk('pair', ranks[0], 1, cards);
  if (n === 3 && ranks.length === 1) return mk('triple', ranks[0], 1, cards);
  if (n === 4 && ranks.length === 1) return mk('bomb', ranks[0], 1, cards);
  if (n === 4) { const t = ranks.find(r => cnt[r] === 3); if (t) return mk('triple1', t, 1, cards); }
  if (n === 5 && ranks.length === 2) { const t = ranks.find(r => cnt[r] === 3), p = ranks.find(r => cnt[r] === 2); if (t && p) return mk('triple2', t, 1, cards); }
  const seq = k => top <= 14 && ranks.every(r => cnt[r] === k) && top - ranks[0] === ranks.length - 1;
  if (n >= 5 && seq(1)) return mk('straight', top, n, cards);
  if (n >= 6 && n % 2 === 0 && seq(2)) return mk('dstraight', top, n / 2, cards);
  for (let k = Math.floor(n / 3); k >= 2; k--) {
    if (n !== 3 * k && n !== 4 * k && n !== 5 * k) continue;
    for (let t = 14; t - k + 1 >= 3; t--) {
      let ok = true;
      for (let r = t - k + 1; r <= t; r++) if (cnt[r] < 3) { ok = false; break; }
      if (!ok) continue;
      if (n === 3 * k) return mk('plane', t, k, cards);
      if (n === 4 * k) return mk('plane1', t, k, cards);
      const rest = cnt.slice(); for (let r = t - k + 1; r <= t; r++) rest[r] -= 3;
      if (rest.every(v => v % 2 === 0) && !(rest[16] || rest[17])) return mk('plane2', t, k, cards);
    }
  }
  if (n === 6) { const f = ranks.find(r => cnt[r] === 4); if (f) return mk('four2', f, 1, cards); }
  if (n === 8) { const f = ranks.find(r => cnt[r] === 4); if (f && ranks.every(r => r === f || cnt[r] === 2 || cnt[r] === 4)) return mk('four22', f, 1, cards); }
  return null;
}
function canBeat(a, b) {
  if (!a) return false;
  if (!b) return true;
  if (a.type === 'rocket') return true;
  if (b.type === 'rocket') return false;
  if (a.type === 'bomb') return b.type !== 'bomb' || a.rank > b.rank;
  return a.type === b.type && a.n === b.n && a.rank > b.rank;
}

// 取 k 个点数不同的“带牌”：优先单张（不拆对子/三张），点数从小到大
function kickers(R, k, size, exclude) {
  const cnt = R.map(a => a.length), cand = [];
  for (let r = 3; r <= 17; r++) {
    if (exclude.includes(r) || cnt[r] < size) continue;
    if (size === 2 && r >= 16) continue;
    cand.push([cnt[r] === size ? 0 : cnt[r] === 4 ? 3 : 1, r >= 15 ? 1 : 0, r]);
  }
  cand.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  if (cand.length < k) return null;
  const out = [];
  for (let i = 0; i < k; i++) out.push(...R[cand[i][2]].slice(0, size));
  return out;
}
// 所有能压过 last 的出法（last 为空时不使用）
function gen(hand, last) {
  const R = byRank(hand), cnt = R.map(a => a.length), out = [], T = last.type;
  const take = (r, k) => R[r].slice(0, k);
  const run = (top, k, size) => { const ids = []; for (let r = top - k + 1; r <= top; r++) { if (cnt[r] < size) return null; ids.push(...take(r, size)); } return ids; };
  const runRanks = (top, k) => { const a = []; for (let r = top - k + 1; r <= top; r++) a.push(r); return a; };
  if (T === 'single') for (let r = last.rank + 1; r <= 17; r++) { if (cnt[r]) out.push(mk('single', r, 1, take(r, 1))); }
  if (T === 'pair') for (let r = last.rank + 1; r <= 15; r++) { if (cnt[r] >= 2) out.push(mk('pair', r, 1, take(r, 2))); }
  if (T === 'triple' || T === 'triple1' || T === 'triple2') for (let r = last.rank + 1; r <= 15; r++) {
    if (cnt[r] < 3) continue;
    if (T === 'triple') out.push(mk(T, r, 1, take(r, 3)));
    else { const kk = kickers(R, 1, T === 'triple1' ? 1 : 2, [r]); if (kk) out.push(mk(T, r, 1, take(r, 3).concat(kk))); }
  }
  if (T === 'straight' || T === 'dstraight') {
    const size = T === 'straight' ? 1 : 2, L = last.len;
    for (let t = last.rank + 1; t <= 14; t++) { if (t - L + 1 < 3) continue; const ids = run(t, L, size); if (ids) out.push(mk(T, t, L, ids)); }
  }
  if (T === 'plane' || T === 'plane1' || T === 'plane2') {
    const k = last.len;
    for (let t = last.rank + 1; t <= 14; t++) {
      if (t - k + 1 < 3) continue;
      const ids = run(t, k, 3); if (!ids) continue;
      if (T === 'plane') { out.push(mk(T, t, k, ids)); continue; }
      const kk = kickers(R, k, T === 'plane1' ? 1 : 2, runRanks(t, k));
      if (kk) out.push(mk(T, t, k, ids.concat(kk)));
    }
  }
  if (T === 'four2' || T === 'four22') for (let r = last.rank + 1; r <= 15; r++) {
    if (cnt[r] !== 4) continue;
    const kk = kickers(R, 2, T === 'four2' ? 1 : 2, [r]); if (kk) out.push(mk(T, r, 1, take(r, 4).concat(kk)));
  }
  for (let r = 3; r <= 15; r++) if (cnt[r] === 4 && (T !== 'bomb' || r > last.rank) && T !== 'rocket') out.push(mk('bomb', r, 1, take(r, 4)));
  if (cnt[16] && cnt[17]) out.push(mk('rocket', 17, 1, [R[16][0], R[17][0]]));
  return out;
}

// 拆牌：把手牌分成尽量少的组合（两种策略取更优）
function splitWith(hand, useStraight) {
  const R = byRank(hand), cnt = R.map(a => a.length), combos = [];
  const pull = (r, k) => { cnt[r] -= k; return R[r].splice(0, k); };
  if (cnt[16] && cnt[17]) combos.push(mk('rocket', 17, 1, [...pull(16, 1), ...pull(17, 1)]));
  for (let r = 3; r <= 15; r++) if (cnt[r] === 4) combos.push(mk('bomb', r, 1, pull(r, 4)));
  // 飞机
  for (let r = 3; r <= 13; r++) {
    if (cnt[r] < 3 || cnt[r + 1] < 3) continue;
    let e = r; while (e + 1 <= 14 && cnt[e + 1] >= 3) e++;
    const ids = []; for (let x = r; x <= e; x++) ids.push(...pull(x, 3));
    combos.push(mk('plane', e, e - r + 1, ids)); r = e;
  }
  if (useStraight) {
    let found = true;
    while (found) {
      found = false;
      let bs = 0, bl = 0;
      for (let s = 3; s <= 10; s++) { let e = s; while (e <= 14 && cnt[e] >= 1) e++; if (e - s > bl) { bl = e - s; bs = s; } }
      if (bl >= 5) { const ids = []; for (let x = bs; x < bs + bl; x++) ids.push(...pull(x, 1)); combos.push(mk('straight', bs + bl - 1, bl, ids)); found = true; }
    }
  }
  for (let r = 3; r <= 12; r++) {
    if (cnt[r] < 2 || cnt[r + 1] < 2 || cnt[r + 2] < 2) continue;
    if (cnt[r] === 3 || cnt[r + 1] === 3 || cnt[r + 2] === 3) continue;
    let e = r + 2; while (e + 1 <= 14 && cnt[e + 1] === 2) e++;
    const ids = []; for (let x = r; x <= e; x++) ids.push(...pull(x, 2));
    combos.push(mk('dstraight', e, e - r + 1, ids)); r = e;
  }
  const trip = [], pairs = [], singles = [];
  for (let r = 3; r <= 17; r++) {
    if (cnt[r] === 3) trip.push(mk('triple', r, 1, pull(r, 3)));
    else if (cnt[r] === 2) pairs.push(mk('pair', r, 1, pull(r, 2)));
    else if (cnt[r] === 1) singles.push(mk('single', r, 1, pull(r, 1)));
  }
  // 三带一 / 三带二、飞机带翅膀
  const attach = (c, k) => {
    const sg = singles.filter(s => s.rank < 15);
    if (sg.length >= k) { const use = sg.slice(0, k); use.forEach(u => singles.splice(singles.indexOf(u), 1)); return mk(k === 1 ? 'triple1' : 'plane1', c.rank, c.len, c.cards.concat(...use.map(u => u.cards))); }
    const pr = pairs.filter(p => p.rank < 14);
    if (pr.length >= k) { const use = pr.slice(0, k); use.forEach(u => pairs.splice(pairs.indexOf(u), 1)); return mk(k === 1 ? 'triple2' : 'plane2', c.rank, c.len, c.cards.concat(...use.map(u => u.cards))); }
    return c;
  };
  for (let i = 0; i < combos.length; i++) if (combos[i].type === 'plane') combos[i] = attach(combos[i], combos[i].len);
  for (const t of trip) combos.push(t.rank >= 15 ? t : attach(t, 1));
  return combos.concat(pairs, singles);
}
function split(hand) {
  const a = splitWith(hand, true), b = splitWith(hand, false);
  const sc = cs => cs.length * 10 + cs.filter(c => c.type === 'single' && c.rank < 11).length * 2;
  return sc(a) <= sc(b) ? a : b;
}
const minus = (hand, cards) => hand.filter(id => !cards.includes(id));

// ---------------- AI ----------------
function bidStrength(hand) {
  const R = byRank(hand), cnt = R.map(a => a.length);
  let s = (cnt[17] ? 4 : 0) + (cnt[16] ? 3 : 0) + cnt[15] * 2 + cnt[14] * 0.7;
  for (let r = 3; r <= 14; r++) if (cnt[r] === 4) s += 4;
  s -= split(hand).length * 0.35;
  return s;
}
// ctx: { hand, seat, roles[], counts[] (各家剩余张数), last: {seat, combo} | null, level }
function aiPlay(ctx) {
  const { hand, seat, roles, counts, last } = ctx;
  const mate = s => s !== seat && roles[s] === roles[seat];
  const enemies = [0, 1, 2].filter(s => s !== seat && roles[s] !== roles[seat]);
  const minE = Math.min(...enemies.map(s => counts[s]));
  const nxt = (seat + 1) % 3;
  if (!last) {
    const combos = split(hand);
    if (combos.length === 1) return combos[0];
    const big = combos.filter(isBomb);
    if (big.length && combos.length - big.length <= 1) return big[0];
    if (roles[seat] === 'farmer' && mate(nxt) && counts[nxt] === 1) {
      const lo = hand.reduce((a, b) => rk(a) <= rk(b) ? a : b);
      return mk('single', rk(lo), 1, [lo]);
    }
    let pool = combos.filter(c => !isBomb(c));
    if (!pool.length) pool = combos;
    if (minE === 1) {
      const ns = pool.filter(c => c.type !== 'single');
      if (ns.length) pool = ns;
      else { const hi = hand.reduce((a, b) => rk(a) >= rk(b) ? a : b); return mk('single', rk(hi), 1, [hi]); }
    } else if (minE === 2) { const np = pool.filter(c => c.type !== 'pair'); if (np.length) pool = np; }
    pool.sort((a, b) => (a.rank - a.n * 0.7) - (b.rank - b.n * 0.7));
    return pool[0];
  }
  const cands = gen(hand, last.combo);
  if (!cands.length) return null;
  for (const c of cands) if (c.n === hand.length) return c;
  const base = split(hand).length;
  let best = null, bestCost = 1e9;
  for (const c of cands) {
    const hc = split(minus(hand, c.cards)).length;
    let cost = (hc - base) * 10 + c.rank + (isBomb(c) ? 60 : 0);
    if (minE <= 2 && c.type === 'single') cost -= c.rank * 2;
    if (cost < bestCost) { bestCost = cost; best = c; best.delta = hc - base; }
  }
  const ls = last.seat;
  if (mate(ls)) {
    if (counts[ls] <= 2 || last.combo.rank >= 12 || isBomb(best) || best.delta > 0) return null;
    if (enemies.includes(nxt) && last.combo.rank < 10 && best.rank <= 13 && ctx.level > 0) return best;
    return null;
  }
  const threat = counts[ls] <= 3 || minE <= 2;
  if (isBomb(best) && !threat && base > 2) return null;
  if (!threat && best.delta >= 2) return null;
  if (!threat && best.rank >= 15 && base > 4 && Math.random() < 0.6) return null;
  return best;
}
// 给玩家的提示：所有可出组合（压牌时）或拆牌后的组合（自由出牌时）
function hints(hand, last) {
  if (!last) {
    const cs = split(hand).filter(c => !isBomb(c));
    cs.sort((a, b) => (a.rank - a.n * 0.7) - (b.rank - b.n * 0.7));
    return cs.length ? cs : split(hand);
  }
  const cs = gen(hand, last);
  const base = split(hand).length;
  cs.forEach(c => { c.cost = (split(minus(hand, c.cards)).length - base) * 10 + c.rank + (isBomb(c) ? 60 : 0); });
  return cs.sort((a, b) => a.cost - b.cost);
}

const DDZ = { rk, parse, canBeat, gen, split, aiPlay, hints, bidStrength, sortCards, isBomb, minus };
if (typeof module !== 'undefined' && module.exports) module.exports = DDZ;
root.DDZ = DDZ;
})(typeof self !== 'undefined' ? self : this);
