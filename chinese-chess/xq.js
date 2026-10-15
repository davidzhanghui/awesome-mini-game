/* 中国象棋规则与搜索引擎（主线程与 Web Worker 共用）
 * 棋盘 90 格：sq = r*9 + c，r=0 为黑方底线（上方），r=9 为红方底线（下方）。
 * 棋子：正数红方、负数黑方；1帅 2仕 3相 4马 5车 6炮 7兵。走法编码 (from << 8) | to。
 */
(function (root) {
'use strict';
var K = 1, A = 2, B = 3, N = 4, R = 5, C = 6, P = 7;
var FEN_P = { k: K, a: A, b: B, e: B, n: N, h: N, r: R, c: C, p: P };
var FEN_C = ['', 'k', 'a', 'b', 'n', 'r', 'c', 'p'];
var START_FEN = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w';
var VAL = [0, 0, 200, 200, 400, 900, 450, 100];
var MATE = 30000;

function T(rows) { var a = new Int16Array(90); for (var i = 0; i < 90; i++) a[i] = rows[i]; return a; }
var PST = [];
PST[P] = T([
  0, 0, 0, 10, 20, 10, 0, 0, 0,
  20, 30, 50, 65, 70, 65, 50, 30, 20,
  20, 30, 45, 55, 55, 55, 45, 30, 20,
  20, 27, 30, 40, 42, 40, 30, 27, 20,
  10, 18, 22, 35, 40, 35, 22, 18, 10,
  3, 0, 4, 0, 7, 0, 4, 0, 3,
  -2, 0, -2, 0, 6, 0, -2, 0, -2,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0]);
PST[N] = T([
  4, 8, 16, 12, 4, 12, 16, 8, 4,
  4, 10, 28, 16, 8, 16, 28, 10, 4,
  12, 14, 16, 20, 18, 20, 16, 14, 12,
  8, 24, 18, 24, 20, 24, 18, 24, 8,
  6, 16, 14, 18, 16, 18, 14, 16, 6,
  4, 12, 16, 14, 12, 14, 16, 12, 4,
  2, 6, 8, 6, 10, 6, 8, 6, 2,
  4, 2, 8, 8, 4, 8, 8, 2, 4,
  0, 2, 4, 4, -2, 4, 4, 2, 0,
  0, -4, 0, 0, 0, 0, 0, -4, 0]);
PST[R] = T([
  14, 14, 12, 18, 16, 18, 12, 14, 14,
  16, 20, 18, 24, 26, 24, 18, 20, 16,
  12, 12, 12, 18, 18, 18, 12, 12, 12,
  12, 18, 16, 22, 22, 22, 16, 18, 12,
  12, 14, 12, 18, 18, 18, 12, 14, 12,
  12, 16, 14, 20, 20, 20, 14, 16, 12,
  6, 10, 8, 14, 14, 14, 8, 10, 6,
  4, 8, 6, 14, 12, 14, 6, 8, 4,
  8, 4, 8, 16, 8, 16, 8, 4, 8,
  -2, 10, 6, 14, 12, 14, 6, 10, -2]);
PST[C] = T([
  6, 4, 0, -10, -12, -10, 0, 4, 6,
  2, 2, 0, -4, -14, -4, 0, 2, 2,
  2, 2, 0, -10, -8, -10, 0, 2, 2,
  0, 0, -2, 4, 10, 4, -2, 0, 0,
  0, 0, 0, 2, 8, 2, 0, 0, 0,
  -2, 0, 4, 2, 6, 2, 4, 0, -2,
  0, 0, 0, 2, 4, 2, 0, 0, 0,
  4, 0, 8, 6, 10, 6, 8, 0, 4,
  0, 2, 4, 6, 6, 6, 4, 2, 0,
  0, 0, 2, 6, 6, 6, 2, 0, 0]);
PST[A] = new Int16Array(90); PST[A][84] = 3; PST[A][76] = 4;
PST[B] = new Int16Array(90); PST[B][76] = 4; PST[B][83] = 2; PST[B][87] = 2; PST[B][65] = 1; PST[B][69] = 1;
PST[K] = new Int16Array(90); PST[K][85] = 2; PST[K][76] = -6; PST[K][75] = -4; PST[K][77] = -4;
function psv(p, sq) {
  var t = p > 0 ? p : -p;
  if (p > 0) return VAL[t] + PST[t][sq];
  return VAL[t] + PST[t][(9 - ((sq / 9) | 0)) * 9 + sq % 9];
}

// Zobrist（两段 32 位）
var seed = 0x2545f491;
function rnd32() { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed >>> 0; }
var ZL = new Uint32Array(15 * 90), ZH = new Uint32Array(15 * 90);
for (var zi = 0; zi < ZL.length; zi++) { ZL[zi] = rnd32(); ZH[zi] = rnd32(); }
var ZSL = rnd32(), ZSH = rnd32();

function Pos(fen) { this.b = new Int8Array(90); this.load(fen || START_FEN); }
Pos.prototype.load = function (fen) {
  var b = this.b, parts = fen.trim().split(/\s+/), rows = parts[0].split('/');
  b.fill(0);
  for (var r = 0; r < 10; r++) {
    var c = 0, row = rows[r] || '';
    for (var i = 0; i < row.length; i++) {
      var ch = row[i];
      if (ch >= '1' && ch <= '9') { c += +ch; continue; }
      var t = FEN_P[ch.toLowerCase()];
      if (t) b[r * 9 + c] = ch === ch.toUpperCase() ? t : -t;
      c++;
    }
  }
  this.side = parts[1] === 'b' ? -1 : 1;
  this.kp = [-1, -1]; this.score = 0; this.kl = 0; this.kh = 0;
  for (var sq = 0; sq < 90; sq++) {
    var p = b[sq]; if (!p) continue;
    if (p === K) this.kp[0] = sq; else if (p === -K) this.kp[1] = sq;
    this.score += p > 0 ? psv(p, sq) : -psv(p, sq);
    this.kl ^= ZL[(p + 7) * 90 + sq]; this.kh ^= ZH[(p + 7) * 90 + sq];
  }
  if (this.side < 0) { this.kl ^= ZSL; this.kh ^= ZSH; }
  this.stack = []; this.hl = []; this.hh = []; this.cap = [];
  return this;
};
Pos.prototype.fen = function () {
  var s = '', b = this.b;
  for (var r = 0; r < 10; r++) {
    var e = 0;
    for (var c = 0; c < 9; c++) {
      var p = b[r * 9 + c];
      if (!p) { e++; continue; }
      if (e) { s += e; e = 0; }
      var ch = FEN_C[p > 0 ? p : -p]; s += p > 0 ? ch.toUpperCase() : ch;
    }
    if (e) s += e;
    if (r < 9) s += '/';
  }
  return s + (this.side > 0 ? ' w' : ' b');
};
Pos.prototype.make = function (m) {
  var f = m >> 8, t = m & 255, b = this.b, p = b[f], q = b[t];
  this.stack.push(m, q, this.kl, this.kh, this.score);
  this.hl.push(this.kl); this.hh.push(this.kh); this.cap.push(q ? 1 : 0);
  var zi = (p + 7) * 90;
  this.kl ^= ZL[zi + f] ^ ZL[zi + t]; this.kh ^= ZH[zi + f] ^ ZH[zi + t];
  var sg = p > 0 ? 1 : -1;
  this.score += sg * (psv(p, t) - psv(p, f));
  if (q) { this.kl ^= ZL[(q + 7) * 90 + t]; this.kh ^= ZH[(q + 7) * 90 + t]; this.score += sg * psv(q, t); }
  b[t] = p; b[f] = 0;
  if (p === K) this.kp[0] = t; else if (p === -K) this.kp[1] = t;
  this.side = -this.side; this.kl ^= ZSL; this.kh ^= ZSH;
  return q;
};
Pos.prototype.unmake = function () {
  var st = this.stack, sc = st.pop(), kh = st.pop(), kl = st.pop(), q = st.pop(), m = st.pop();
  var f = m >> 8, t = m & 255, b = this.b, p = b[t];
  b[f] = p; b[t] = q;
  if (p === K) this.kp[0] = f; else if (p === -K) this.kp[1] = f;
  this.side = -this.side; this.kl = kl; this.kh = kh; this.score = sc;
  this.hl.pop(); this.hh.pop(); this.cap.pop();
};
Pos.prototype.makeNull = function () { this.stack.push(0, 0, this.kl, this.kh, this.score); this.hl.push(this.kl); this.hh.push(this.kh); this.cap.push(1); this.side = -this.side; this.kl ^= ZSL; this.kh ^= ZSH; };
Pos.prototype.unmakeNull = function () { var st = this.stack; this.score = st.pop(); this.kh = st.pop(); this.kl = st.pop(); st.pop(); st.pop(); this.side = -this.side; this.hl.pop(); this.hh.pop(); this.cap.pop(); };

var ORTH = [[-1, 0], [1, 0], [0, -1], [0, 1]], DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
var HORSE = [[-1, 0, -2, -1], [-1, 0, -2, 1], [1, 0, 2, -1], [1, 0, 2, 1], [0, -1, -1, -2], [0, -1, 1, -2], [0, 1, -1, 2], [0, 1, 1, 2]];
function inPalace(r, c, s) { return c >= 3 && c <= 5 && (s > 0 ? r >= 7 : r <= 2); }

Pos.prototype.gen = function (out, capOnly) {
  var b = this.b, s = this.side, i, d, r, c, nr, nc, to, q;
  for (var sq = 0; sq < 90; sq++) {
    var p = b[sq];
    if (!p || (p > 0) !== (s > 0)) continue;
    r = (sq / 9) | 0; c = sq % 9;
    var t = p > 0 ? p : -p;
    if (t === R || t === C) {
      for (i = 0; i < 4; i++) {
        d = ORTH[i]; nr = r + d[0]; nc = c + d[1]; var jumped = false;
        while (nr >= 0 && nr < 10 && nc >= 0 && nc < 9) {
          to = nr * 9 + nc; q = b[to];
          if (!jumped) {
            if (!q) { if (!capOnly) out.push((sq << 8) | to); }
            else if (t === R) { if ((q > 0) !== (s > 0)) out.push((sq << 8) | to); break; }
            else jumped = true;
          } else if (q) { if ((q > 0) !== (s > 0)) out.push((sq << 8) | to); break; }
          nr += d[0]; nc += d[1];
        }
      }
      continue;
    }
    if (t === N) {
      for (i = 0; i < 8; i++) {
        d = HORSE[i]; var lr = r + d[0], lc = c + d[1];
        if (lr < 0 || lr > 9 || lc < 0 || lc > 8 || b[lr * 9 + lc]) continue;
        nr = r + d[2]; nc = c + d[3];
        if (nr < 0 || nr > 9 || nc < 0 || nc > 8) continue;
        to = nr * 9 + nc; q = b[to];
        if (q ? (q > 0) !== (s > 0) : !capOnly) out.push((sq << 8) | to);
      }
      continue;
    }
    if (t === P) {
      var fr = r - s;
      if (fr >= 0 && fr <= 9) { to = fr * 9 + c; q = b[to]; if (q ? (q > 0) !== (s > 0) : !capOnly) out.push((sq << 8) | to); }
      if (s > 0 ? r <= 4 : r >= 5) {
        for (i = -1; i <= 1; i += 2) {
          nc = c + i; if (nc < 0 || nc > 8) continue;
          to = r * 9 + nc; q = b[to]; if (q ? (q > 0) !== (s > 0) : !capOnly) out.push((sq << 8) | to);
        }
      }
      continue;
    }
    var dirs = t === K ? ORTH : DIAG, mul = t === B ? 2 : 1;
    for (i = 0; i < 4; i++) {
      d = dirs[i]; nr = r + d[0] * mul; nc = c + d[1] * mul;
      if (nr < 0 || nr > 9 || nc < 0 || nc > 8) continue;
      if (t === B) {
        if (b[(r + d[0]) * 9 + c + d[1]]) continue;
        if (s > 0 ? nr < 5 : nr > 4) continue;
      } else if (!inPalace(nr, nc, s)) continue;
      to = nr * 9 + nc; q = b[to];
      if (q ? (q > 0) !== (s > 0) : !capOnly) out.push((sq << 8) | to);
    }
  }
  return out;
};

// s 方的将帅是否被攻击（含“白脸将”）
Pos.prototype.inCheck = function (s) {
  var b = this.b, k = this.kp[s > 0 ? 0 : 1];
  if (k < 0) return true;
  var kr = (k / 9) | 0, kc = k % 9, e = -s, i, d, nr, nc, q;
  for (i = 0; i < 4; i++) {
    d = ORTH[i]; nr = kr + d[0]; nc = kc + d[1]; var screen = false;
    while (nr >= 0 && nr < 10 && nc >= 0 && nc < 9) {
      q = b[nr * 9 + nc];
      if (q) {
        if (!screen) {
          if (q === e * R || (q === e * K && d[1] === 0)) return true;
          screen = true;
        } else { if (q === e * C) return true; break; }
      }
      nr += d[0]; nc += d[1];
    }
  }
  for (i = 0; i < 8; i++) {
    // 马从 H 走 (dr,dc) 到将帅位置，马腿在 H + (legDr, legDc)
    d = HORSE[i];
    var hr = kr - d[2], hc = kc - d[3];
    if (hr < 0 || hr > 9 || hc < 0 || hc > 8 || b[hr * 9 + hc] !== e * N) continue;
    if (!b[(hr + d[0]) * 9 + hc + d[1]]) return true;
  }
  var pr = kr + s; // 敌兵在将帅“前方”（从敌方视角向前）
  if (pr >= 0 && pr <= 9 && b[pr * 9 + kc] === e * P) return true;
  if (kc > 0 && b[k - 1] === e * P) return true;
  if (kc < 8 && b[k + 1] === e * P) return true;
  return false;
};
Pos.prototype.legal = function () {
  var ms = this.gen([], false), out = [];
  for (var i = 0; i < ms.length; i++) { this.make(ms[i]); if (!this.inCheck(-this.side)) out.push(ms[i]); this.unmake(); }
  return out;
};
Pos.prototype.isRep = function (n) {
  var L = this.hl, Hh = this.hh, cnt = 0;
  for (var i = L.length - 2; i >= 0; i -= 2) {
    if (L[i] === this.kl && Hh[i] === this.kh) { if (++cnt >= (n || 1)) return true; }
    if (this.cap[i] || this.cap[i + 1]) break;
  }
  return false;
};

// ---------------- 搜索 ----------------
var TTN = 1 << 20, TTM = TTN - 1;
var ttL = new Uint32Array(TTN), ttH = new Uint32Array(TTN), ttD = new Int8Array(TTN), ttF = new Int8Array(TTN), ttS = new Int32Array(TTN), ttMv = new Int32Array(TTN);
var hist = new Int32Array(90 * 90);
var killers = new Int32Array(128 * 2);

function search(pos, opt) {
  opt = opt || {};
  var deadline = Date.now() + (opt.time || 1000), maxDepth = opt.depth || 30, nodes = 0, stop = false, noise = opt.noise || 0;
  hist.fill(0); killers.fill(0);
  function timeUp() { if ((++nodes & 1023) === 0 && Date.now() > deadline) stop = true; return stop; }
  function mvvlva(m) { var q = pos.b[m & 255], p = pos.b[m >> 8]; return q ? VAL[q > 0 ? q : -q] * 10 - VAL[p > 0 ? p : -p] / 10 + 100000 : 0; }
  function order(ms, ttm, ply) {
    var sc = new Array(ms.length);
    for (var i = 0; i < ms.length; i++) {
      var m = ms[i];
      sc[i] = m === ttm ? 1e9 : mvvlva(m) || (m === killers[ply * 2] ? 90000 : m === killers[ply * 2 + 1] ? 80000 : hist[(m >> 8) * 90 + (m & 255)]);
    }
    var idx = ms.map(function (_, i) { return i; }).sort(function (a, b) { return sc[b] - sc[a]; });
    return idx.map(function (i) { return ms[i]; });
  }
  function qs(alpha, beta, ply) {
    if (timeUp()) return 0;
    var chk = pos.inCheck(pos.side), best;
    if (!chk) {
      var stand = pos.side * pos.score;
      if (stand >= beta) return stand;
      if (stand > alpha) alpha = stand;
      if (ply > 40) return stand;
      best = stand;
    } else best = -MATE + ply;
    var ms = order(pos.gen([], !chk), 0, Math.min(ply, 127));
    for (var i = 0; i < ms.length; i++) {
      pos.make(ms[i]);
      if (pos.inCheck(-pos.side)) { pos.unmake(); continue; }
      var v = -qs(-beta, -alpha, ply + 1);
      pos.unmake();
      if (stop) return 0;
      if (v > best) best = v;
      if (v > alpha) { alpha = v; if (v >= beta) return v; }
    }
    return best;
  }
  function ab(depth, alpha, beta, ply, nullOk) {
    if (ply && pos.isRep(1)) return 0;
    if (depth <= 0) return qs(alpha, beta, ply);
    if (timeUp()) return 0;
    var idx = pos.kl & TTM, ttm = 0, a0 = alpha;
    if (ttL[idx] === pos.kl && ttH[idx] === pos.kh) {
      ttm = ttMv[idx];
      if (ply && ttD[idx] >= depth) {
        var s = ttS[idx], f = ttF[idx];
        if (f === 0 || (f === 1 && s >= beta) || (f === 2 && s <= alpha)) return s;
      }
    }
    var chk = pos.inCheck(pos.side);
    if (chk && ply < 60) depth++;
    if (!chk && nullOk && depth >= 3 && ply && pos.side * pos.score >= beta) {
      pos.makeNull();
      var nv = -ab(depth - 3, -beta, -beta + 1, ply + 1, false);
      pos.unmakeNull();
      if (stop) return 0;
      if (nv >= beta) return nv;
    }
    var ms = order(pos.gen([], false), ttm, Math.min(ply, 127)), best = -MATE - 1, bm = 0, legal = 0;
    for (var i = 0; i < ms.length; i++) {
      var m = ms[i];
      pos.make(m);
      if (pos.inCheck(-pos.side)) { pos.unmake(); continue; }
      legal++;
      var v;
      if (legal === 1) v = -ab(depth - 1, -beta, -alpha, ply + 1, true);
      else {
        var red = (!chk && legal > 4 && depth >= 3 && !pos.cap[pos.cap.length - 1]) ? 1 : 0;
        v = -ab(depth - 1 - red, -alpha - 1, -alpha, ply + 1, true);
        if (v > alpha && (red || v < beta)) v = -ab(depth - 1, -beta, -alpha, ply + 1, true);
      }
      pos.unmake();
      if (stop) return 0;
      if (v > best) { best = v; bm = m; }
      if (v > alpha) {
        alpha = v;
        if (v >= beta) {
          if (!pos.b[m & 255] && ply < 128) { killers[ply * 2 + 1] = killers[ply * 2]; killers[ply * 2] = m; hist[(m >> 8) * 90 + (m & 255)] += depth * depth; }
          break;
        }
      }
    }
    if (!legal) return -MATE + ply;
    ttL[idx] = pos.kl; ttH[idx] = pos.kh; ttD[idx] = depth; ttS[idx] = best; ttMv[idx] = bm;
    ttF[idx] = best >= beta ? 1 : best <= a0 ? 2 : 0;
    return best;
  }
  var root = pos.legal();
  if (!root.length) return { move: 0, score: -MATE, depth: 0, nodes: 0 };
  var bestMove = root[0], bestScore = -MATE, done = 0;
  for (var d = 1; d <= maxDepth; d++) {
    var alpha = -MATE - 1, beta = MATE + 1, iterBest = 0, iterScore = -MATE - 1, scores = [];
    var idx0 = pos.kl & TTM, ttm0 = ttL[idx0] === pos.kl ? ttMv[idx0] : bestMove;
    var ordered = order(root.slice(), ttm0 || bestMove, 0);
    for (var i = 0; i < ordered.length; i++) {
      var m = ordered[i];
      pos.make(m);
      var v = i === 0 ? -ab(d - 1, -beta, -alpha, 1, true) : -ab(d - 1, -alpha - 1, -alpha, 1, true);
      if (!stop && i > 0 && v > alpha) v = -ab(d - 1, -beta, -alpha, 1, true);
      pos.unmake();
      if (stop) break;
      var nv = v + (noise ? (Math.random() * 2 - 1) * noise : 0);
      scores.push([m, nv]);
      if (nv > iterScore) { iterScore = nv; iterBest = m; }
      if (v > alpha) alpha = v;
    }
    if (stop && !iterBest) break;
    if (iterBest) { bestMove = iterBest; bestScore = iterScore; done = d; }
    if (stop) break;
    if (Math.abs(bestScore) > MATE - 200) break;
    if (Date.now() > deadline - (opt.time || 1000) * 0.45 && d >= 2) break;
  }
  return { move: bestMove, score: Math.round(bestScore), depth: done, nodes: nodes };
}

// ---------------- 记谱 ----------------
var NAMES_R = ['', '帅', '仕', '相', '马', '车', '炮', '兵'], NAMES_B = ['', '将', '士', '象', '马', '车', '炮', '卒'];
var NUM_R = '一二三四五六七八九', NUM_B = '１２３４５６７８９';
var WXF = ['', 'K', 'A', 'E', 'H', 'R', 'C', 'P'];
function notation(pos, m, western) {
  var b = pos.b, f = m >> 8, t = m & 255, p = b[f], s = p > 0 ? 1 : -1, ty = p * s;
  var fr = (f / 9) | 0, fc = f % 9, tr = (t / 9) | 0, tc = t % 9;
  var file = function (col) { return s > 0 ? 9 - col : col + 1; };
  var num = function (n) { return western ? String(n) : (s > 0 ? NUM_R : NUM_B)[n - 1]; };
  var same = [];
  for (var r = 0; r < 10; r++) if (b[r * 9 + fc] === p) same.push(r);
  var head;
  var name = western ? WXF[ty] : (s > 0 ? NAMES_R : NAMES_B)[ty];
  if (same.length >= 2 && ty !== K && ty !== A && ty !== B) {
    var ordered = s > 0 ? same : same.slice().reverse(), k = ordered.indexOf(fr);
    var tags = western ? (same.length === 2 ? ['+', '-'] : ['+', '=', '-']) : (same.length === 2 ? ['前', '后'] : same.length === 3 ? ['前', '中', '后'] : ['一', '二', '三', '四', '五']);
    head = western ? tags[k] + name : tags[k] + name;
  } else head = name + num(file(fc));
  var fwd = (tr - fr) * -s, act, tgt;
  if (fwd === 0) { act = western ? '=' : '平'; tgt = num(file(tc)); }
  else {
    act = western ? (fwd > 0 ? '+' : '-') : (fwd > 0 ? '进' : '退');
    tgt = (ty === N || ty === B || ty === A) ? num(file(tc)) : num(Math.abs(tr - fr));
  }
  return head + act + tgt;
}

var XQ = { K: K, A: A, B: B, N: N, R: R, C: C, P: P, START_FEN: START_FEN, MATE: MATE, Pos: Pos, search: search, notation: notation };
if (typeof module !== 'undefined' && module.exports) module.exports = XQ;
root.XQ = XQ;
})(typeof self !== 'undefined' ? self : this);
