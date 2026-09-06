// 中国象棋引擎：走法生成（含全部规则）+ 评估 + Negamax α-β 搜索
// 双模式：<script> 引入页面时暴露 globalThis.XQ；作为 Worker 时响应 {board, turn, level}。
(function (root) {
const W = 9, H = 10;
const VAL = { k: 100000, r: 600, c: 300, n: 270, b: 120, a: 120, p: 60 };
const RED = 'RNBAKCP', BLK = 'rnbakcp';
function isRed(p) { return p && p === p.toUpperCase(); }
function isBlk(p) { return p && p === p.toLowerCase(); }
function sameSide(a, b) { return (isRed(a) && isRed(b)) || (isBlk(a) && isBlk(b)); }
function inPalace(x, y, red) {
  if (x < 3 || x > 5) return false;
  return red ? (y >= 7 && y <= 9) : (y >= 0 && y <= 2);
}
function crossedRiver(y, red) { return red ? y <= 4 : y >= 5; }

function initial() {
  const b = Array.from({ length: H }, () => new Array(W).fill(null));
  const back = ['r', 'n', 'b', 'a', 'k', 'a', 'b', 'n', 'r'];
  for (let x = 0; x < 9; x++) { b[0][x] = back[x]; b[9][x] = back[x].toUpperCase(); }
  b[2][1] = 'c'; b[2][7] = 'c'; b[7][1] = 'C'; b[7][7] = 'C';
  for (const x of [0, 2, 4, 6, 8]) { b[3][x] = 'p'; b[6][x] = 'P'; }
  return b;
}

// 伪合法走法（含吃子），不含"走后帅被照面"过滤
function pseudo(bd, x, y) {
  const p = bd[y][x];
  if (!p) return [];
  const red = isRed(p), t = p.toLowerCase(), out = [];
  const add = (tx, ty) => {
    if (tx < 0 || ty < 0 || tx >= W || ty >= H) return false;
    const q = bd[ty][tx];
    if (q && sameSide(p, q)) return false;
    out.push({ fx: x, fy: y, tx: tx, ty: ty });
    return !q;
  };
  if (t === 'k') {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const tx = x + dx, ty = y + dy;
      if (inPalace(tx, ty, red)) add(tx, ty);
    }
    // 飞将
    const dir = red ? -1 : 1;
    let ty = y + dir, blocked = false;
    while (ty >= 0 && ty < H) {
      const q = bd[ty][x];
      if (q) {
        if (!blocked && q.toLowerCase() === 'k' && !sameSide(p, q)) add(x, ty);
        break;
      }
      ty += dir;
    }
  } else if (t === 'a') {
    for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const tx = x + dx, ty = y + dy;
      if (inPalace(tx, ty, red)) add(tx, ty);
    }
  } else if (t === 'b') {
    for (const [dx, dy] of [[2, 2], [2, -2], [-2, 2], [-2, -2]]) {
      const tx = x + dx, ty = y + dy;
      if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue;
      if (red && ty < 5) continue;
      if (!red && ty > 4) continue;
      if (bd[y + dy / 2][x + dx / 2]) continue; // 象眼
      add(tx, ty);
    }
  } else if (t === 'n') {
    for (const [dx, dy, lx, ly] of [[2, 1, 1, 0], [2, -1, 1, 0], [-2, 1, -1, 0], [-2, -1, -1, 0], [1, 2, 0, 1], [-1, 2, 0, 1], [1, -2, 0, -1], [-1, -2, 0, -1]]) {
      if (bd[y + ly] && bd[y + ly][x + lx]) continue; // 马腿
      add(x + dx, y + dy);
    }
  } else if (t === 'r') {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      let tx = x + dx, ty = y + dy;
      while (tx >= 0 && ty >= 0 && tx < W && ty < H) {
        if (!add(tx, ty)) break;
        tx += dx; ty += dy;
      }
    }
  } else if (t === 'c') {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      let tx = x + dx, ty = y + dy, screen = false;
      while (tx >= 0 && ty >= 0 && tx < W && ty < H) {
        const q = bd[ty][tx];
        if (!screen) {
          if (!q) out.push({ fx: x, fy: y, tx: tx, ty: ty });
          else screen = true;
        } else if (q) {
          if (!sameSide(p, q)) out.push({ fx: x, fy: y, tx: tx, ty: ty });
          break;
        }
        tx += dx; ty += dy;
      }
    }
  } else if (t === 'p') {
    const fwd = red ? -1 : 1;
    add(x, y + fwd);
    if (crossedRiver(y, red)) { add(x - 1, y); add(x + 1, y); }
  }
  return out;
}

function findK(bd, red) {
  const k = red ? 'K' : 'k';
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (bd[y][x] === k) return [x, y];
  return null;
}
// (x,y) 是否被 color 方攻击（color: 1 红, -1 黑）
function attacked(bd, x, y, color) {
  const red = color === 1;
  // 对方兵：红兵向上打（兵在目标下方），黑兵向下打；过河后可在同一行左右打
  const pawn = red ? 'P' : 'p';
  const fy = red ? y + 1 : y - 1;
  if (fy >= 0 && fy < H && bd[fy] && bd[fy][x] === pawn) return true;
  const crossed = red ? y <= 4 : y >= 5;
  if (crossed && bd[y]) {
    if (x > 0 && bd[y][x - 1] === pawn) return true;
    if (x < 8 && bd[y][x + 1] === pawn) return true;
  }
  // 对方马
  const N = red ? 'N' : 'n';
  for (const [dx, dy, lx, ly] of [[2, 1, 1, 0], [2, -1, 1, 0], [-2, 1, -1, 0], [-2, -1, -1, 0], [1, 2, 0, 1], [-1, 2, 0, 1], [1, -2, 0, -1], [-1, -2, 0, -1]]) {
    const tx = x + dx, ty = y + dy;
    if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue;
    if (bd[ty][tx] === N && bd[y + ly] && !bd[y + ly][x + lx]) return true;
  }
  // 对方车 / 将（直线）与炮（隔一子）
  const R = red ? 'R' : 'r', C = red ? 'C' : 'c', K = red ? 'K' : 'k';
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    let tx = x + dx, ty = y + dy, between = 0;
    while (tx >= 0 && ty >= 0 && tx < W && ty < H) {
      const q = bd[ty][tx];
      if (q) {
        if (between === 0 && (q === R || q === K)) return true;
        if (between === 1 && q === C) return true;
        break;
      }
      between++;
      tx += dx; ty += dy;
    }
  }
  // 对方帅贴身
  const EK = red ? 'K' : 'k';
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
    if (bd[y + dy] && bd[y + dy][x + dx] === EK) return true;
  return false;
}

function doMove(bd, m) {
  const cap = bd[m.ty][m.tx];
  bd[m.ty][m.tx] = bd[m.fy][m.fx];
  bd[m.fy][m.fx] = null;
  return cap;
}
function undoMove(bd, m, cap) {
  bd[m.fy][m.fx] = bd[m.ty][m.tx];
  bd[m.ty][m.tx] = cap;
}

// turn: 1 红, -1 黑。返回合法走法（走后本方帅不被照面）
function legal(bd, turn) {
  const red = turn === 1, out = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = bd[y][x];
    if (!p || (red ? !isRed(p) : !isBlk(p))) continue;
    for (const m of pseudo(bd, x, y)) {
      const cap = doMove(bd, m);
      const kpos = findK(bd, red);
      const ok = kpos && !attacked(bd, kpos[0], kpos[1], -turn);
      undoMove(bd, m, cap);
      if (ok) { m.cap = cap || null; out.push(m); }
    }
  }
  return out;
}
function inCheck(bd, turn) {
  const red = turn === 1, k = findK(bd, red);
  return !!(k && attacked(bd, k[0], k[1], -turn));
}
function key(bd, turn) {
  let s = turn + '|';
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) s += bd[y][x] || '.';
  return s;
}

function evaluate(bd) {
  let s = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = bd[y][x];
    if (!p) continue;
    const t = p.toLowerCase(), red = isRed(p);
    let v = VAL[t];
    if (t === 'p') {
      const adv = red ? (9 - y) : y;
      v += crossedRiver(y, red) ? 30 + adv * 6 : adv * 4;
      if (x >= 3 && x <= 5) v += 6;
    }
    if (t === 'n' || t === 'r' || t === 'c') {
      if (x >= 2 && x <= 6) v += 4;
      if (y >= 2 && y <= 7) v += 4;
    }
    s += red ? v : -v;
  }
  return s;
}

let ABORT = false, NODES = 0;
function orderMoves(bd, moves) {
  for (const m of moves) {
    let s = 0;
    if (m.cap) s = 10 * VAL[m.cap.toLowerCase()] - VAL[bd[m.fy][m.fx].toLowerCase()];
    else if (bd[m.ty][m.tx]) s = 0;
    m._s = s;
  }
  moves.sort((a, b) => b._s - a._s);
  return moves;
}
function quiesce(bd, alpha, beta, turn, depth) {
  NODES++;
  if ((NODES & 2047) === 0 && ABORT) throw 'abort';
  const stand = turn * evaluate(bd);
  if (stand >= beta) return beta;
  if (stand > alpha) alpha = stand;
  if (depth <= 0) return alpha;
  const moves = orderMoves(bd, legal(bd, turn)).filter(m => m.cap);
  for (const m of moves) {
    const cap = doMove(bd, m);
    let v;
    try { v = -quiesce(bd, -beta, -alpha, -turn, depth - 1); } catch (e) { undoMove(bd, m, cap); throw e; }
    undoMove(bd, m, cap);
    if (v >= beta) return beta;
    if (v > alpha) alpha = v;
  }
  return alpha;
}
function negamax(bd, depth, alpha, beta, turn) {
  NODES++;
  if ((NODES & 2047) === 0 && ABORT) throw 'abort';
  const moves = orderMoves(bd, legal(bd, turn));
  if (!moves.length) {
    // 无棋可走：被将死或困毙 → 判负
    return -90000 - depth * 100;
  }
  if (depth <= 0) return quiesce(bd, alpha, beta, turn, 2);
  let best = -Infinity;
  for (const m of moves) {
    const cap = doMove(bd, m);
    let v;
    try { v = -negamax(bd, depth - 1, -beta, -alpha, -turn); } catch (e) { undoMove(bd, m, cap); throw e; }
    undoMove(bd, m, cap);
    if (v > best) best = v;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}
// level 0/1/2 → depth 1/2/3；timeCap ms 熔断
function search(board, turn, level, timeCap) {
  const bd = board.map(r => r.slice());
  const depth = [1, 2, 3][Math.min(2, level)] || 2;
  const moves = orderMoves(bd, legal(bd, turn));
  if (!moves.length) return { move: null };
  if (level === 0 && Math.random() < .25) {
    // 简单 AI 偶尔随手走（但绝不送将）
    return { move: moves[Math.random() * moves.length | 0], depth: 0 };
  }
  ABORT = false; NODES = 0;
  const timer = setTimeout(() => { ABORT = true; }, timeCap || 1500);
  let best = moves[0], bestV = -Infinity;
  try {
    for (let d = 1; d <= depth; d++) {
      let cur = null, curV = -Infinity, alpha = -Infinity;
      for (const m of moves) {
        const cap = doMove(bd, m);
        const v = -negamax(bd, d - 1, -Infinity, -alpha, -turn);
        undoMove(bd, m, cap);
        if (v > curV) { curV = v; cur = m; }
        if (v > alpha) alpha = v;
      }
      best = cur; bestV = curV;
      // 排序供下一轮迭代
      moves.sort((a, b) => (a === cur ? -1 : b === cur ? 1 : 0));
      if (bestV > 80000) break; // 已找到杀棋
    }
  } catch (e) { /* 熔断：保留当前最优 */ }
  clearTimeout(timer);
  return { move: { fx: best.fx, fy: best.fy, tx: best.tx, ty: best.ty }, depth, nodes: NODES, value: Math.round(bestV) };
}

const XQ = { initial, legal, pseudo, doMove, undoMove, inCheck, findK, key, search, evaluate, isRed, VAL };
root.XQ = XQ;

// Worker 模式
if (typeof importScripts === 'function' || (typeof self !== 'undefined' && self && !self.window && !self.document)) {
  self.onmessage = e => {
    const { id, board, turn, level } = e.data;
    try {
      const r = search(board, turn, level, 1600);
      self.postMessage({ id, ok: true, move: r.move, info: { depth: r.depth, nodes: r.nodes, value: r.value } });
    } catch (err) {
      self.postMessage({ id, ok: false, error: String(err && err.message || err) });
    }
  };
}
})(typeof self !== 'undefined' ? self : this);
