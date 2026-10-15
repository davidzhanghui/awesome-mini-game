/* 五子棋 · 黑白对弈 —— 人机（三档 AI）/ 双人，可选连珠禁手
 * AI：五元组评估（增量维护）+ 候选点排序的 Alpha-Beta 迭代加深。
 */
(() => {
'use strict';
const { $, T } = KIT;
const store = KIT.store('amg-gomoku');
const N = 15, W = 640, H = 640, M = 40, CELL = 40;
const cv = $('game'), c = KIT.canvas(cv, W, H);
const DISP = '"AMG Display", "PingFang SC", system-ui, sans-serif';
const NUMF = '"Helvetica Neue", Arial, system-ui, sans-serif';
const EMPTY = 0, BLACK = 1, WHITE = 2;

// ---------------- 五元组 ----------------
const WIN = []; // 每个五元组的 5 个格子
const OF = Array.from({ length: N * N }, () => []); // 每格所在的五元组
for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const ex = x + dx * 4, ey = y + dy * 4;
    if (ex < 0 || ex >= N || ey < 0 || ey >= N) continue;
    const cells = []; for (let k = 0; k < 5; k++) cells.push((y + dy * k) * N + x + dx * k);
    const id = WIN.length; WIN.push(cells); cells.forEach(cc => OF[cc].push(id));
  }
}
const NW = WIN.length, TUP = [0, 1, 14, 180, 3000, 1e7];
const wb = new Int8Array(NW), ww = new Int8Array(NW);
const board = new Int8Array(N * N);
let evalB = 0; // 黑方视角
const wval = w => wb[w] && ww[w] ? 0 : wb[w] ? TUP[wb[w]] : ww[w] ? -TUP[ww[w]] : 0;
function place(p, col) {
  board[p] = col;
  for (const w of OF[p]) { evalB -= wval(w); if (col === BLACK) wb[w]++; else ww[w]++; evalB += wval(w); }
}
function remove(p) {
  const col = board[p];
  for (const w of OF[p]) { evalB -= wval(w); if (col === BLACK) wb[w]--; else ww[w]--; evalB += wval(w); }
  board[p] = EMPTY;
}
function resetBoard() { board.fill(0); wb.fill(0); ww.fill(0); evalB = 0; }
function fiveAt(p) { for (const w of OF[p]) if (wb[w] === 5 || ww[w] === 5) return WIN[w]; return null; }

// ---------------- 禁手（黑方：长连 / 双四 / 双三） ----------------
const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];
function lineAt(p, dx, dy, col) {
  const x0 = p % N, y0 = (p / N) | 0, s = [];
  for (let k = -5; k <= 5; k++) {
    const x = x0 + dx * k, y = y0 + dy * k;
    s.push(x < 0 || y < 0 || x >= N || y >= N ? 2 : board[y * N + x] === col ? 1 : board[y * N + x] === EMPTY ? 0 : 2);
  }
  return s;
}
function runLen(s, i) { let a = i, b = i; while (a > 0 && s[a - 1] === 1) a--; while (b < 10 && s[b + 1] === 1) b++; return b - a + 1; }
function exactFive(s, j) { if (s[j] !== 0) return false; s[j] = 1; const r = runLen(s, j) === 5 && covers(s, j); s[j] = 0; return r; }
function covers(s, j) { let a = j, b = j; while (a > 0 && s[a - 1] === 1) a--; while (b < 10 && s[b + 1] === 1) b++; return a <= 5 && b >= 5; }
function fourCount(s) { let n = 0; for (let j = 0; j <= 10; j++) if (exactFive(s, j)) n++; return n; }
function isOpenThree(s) {
  for (let j = 0; j <= 10; j++) {
    if (s[j] !== 0) continue;
    s[j] = 1;
    let fives = 0; for (let k = 0; k <= 10; k++) if (exactFive(s, k)) fives++;
    const live = fives >= 2 && runLen(s, 5) === 4;
    s[j] = 0;
    if (live) return true;
  }
  return false;
}
function forbidden(p) {
  if (board[p] !== EMPTY) return false;
  board[p] = BLACK;
  let fours = 0, threes = 0, five = false, over = false;
  for (const [dx, dy] of DIRS) {
    const s = lineAt(p, dx, dy, BLACK), r = runLen(s, 5);
    if (r === 5) five = true; else if (r > 5) over = true;
    const f = fourCount(s);
    if (f) fours += f >= 2 && r === 4 ? 1 : f; // 活四算一个四
    else if (isOpenThree(s)) threes++;
  }
  board[p] = EMPTY;
  if (five) return false;
  return over || fours >= 2 || threes >= 2;
}

// ---------------- AI ----------------
function candidates(col, limit, checkForbid) {
  const out = [], seen = new Uint8Array(N * N);
  let any = false;
  for (let p = 0; p < N * N; p++) {
    if (!board[p]) continue; any = true;
    const x0 = p % N, y0 = (p / N) | 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const x = x0 + dx, y = y0 + dy; if (x < 0 || y < 0 || x >= N || y >= N) continue;
      const q = y * N + x; if (board[q] || seen[q]) continue; seen[q] = 1;
      if (checkForbid && renju && col === BLACK && forbidden(q)) continue;
      out.push(q);
    }
  }
  if (!any) return [7 * N + 7];
  const sc = q => {
    let s = 0;
    for (const w of OF[q]) {
      const b = wb[w], wh = ww[w];
      if (!wh) s += TUP[b + 1] - TUP[b];
      if (!b) s += TUP[wh + 1] - TUP[wh];
    }
    return s;
  };
  const scored = out.map(q => [q, sc(q)]).sort((a, b) => b[1] - a[1]);
  return scored.slice(0, limit).map(a => a[0]);
}
function search(col, opt) {
  const deadline = Date.now() + opt.time;
  let stop = false, nodes = 0;
  const opp = col === BLACK ? WHITE : BLACK;
  function ab(side, depth, alpha, beta, last) {
    if (last >= 0 && fiveAt(last)) return -1e9 + (20 - depth);
    if ((++nodes & 511) === 0 && Date.now() > deadline) stop = true;
    if (depth === 0 || stop) return side === BLACK ? evalB : -evalB;
    const cs = candidates(side, opt.width);
    if (!cs.length) return 0;
    let best = -Infinity;
    for (const q of cs) {
      place(q, side);
      const v = -ab(side === BLACK ? WHITE : BLACK, depth - 1, -beta, -alpha, q);
      remove(q);
      if (v > best) best = v;
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return best;
  }
  const root = candidates(col, opt.width + 4, true);
  // 先找一步成五 / 必须堵
  for (const q of root) { place(q, col); const f = fiveAt(q); remove(q); if (f) return q; }
  const blocks = [];
  for (const q of candidates(opp, 40)) { place(q, opp); const f = fiveAt(q); remove(q); if (f) blocks.push(q); }
  if (blocks.length && (!renju || col !== BLACK || !forbidden(blocks[0]))) return blocks[0];
  let bestMove = root[0];
  for (let d = 1; d <= opt.depth; d++) {
    let alpha = -Infinity, iterBest = -1, scores = [];
    for (const q of root) {
      place(q, col);
      const v = -ab(opp, d - 1, -Infinity, -alpha, q) + (opt.noise ? (Math.random() - 0.5) * opt.noise : 0);
      remove(q);
      if (stop) break;
      scores.push([q, v]);
      if (v > alpha) { alpha = v; iterBest = q; }
    }
    if (stop && iterBest < 0) break;
    if (iterBest >= 0) bestMove = iterBest;
    if (stop || alpha > 5e8) break;
    root.sort((a, b) => { const sa = scores.find(s => s[0] === a), sb = scores.find(s => s[0] === b); return (sb ? sb[1] : -1e18) - (sa ? sa[1] : -1e18); });
  }
  return bestMove;
}
const LEVELS = [{ depth: 1, width: 8, time: 200, noise: 400 }, { depth: 3, width: 10, time: 700, noise: 20 }, { depth: 6, width: 12, time: 1800, noise: 0 }];

// ---------------- 状态 ----------------
let state = 'menu', mode = store.get('mode', 'ai'), humanCol = store.get('side', BLACK), level = store.get('level', 1), renju = store.get('renju', false), showNum = store.get('nums', false);
let moves = [], turn = BLACK, winLine = null, hover = -1, thinking = false, hintAt = -1, drops = {}, stamp = null, token = 0, rec = store.get('rec', { w: [0, 0, 0], l: [0, 0, 0] }), startTime = 0, result = null;
const fx = new KIT.Particles();

// ---------------- 声音 ----------------
const SFX = {
  stone: () => { KIT.noise(0.05, { vol: 0.14, hp: 1200, lp: 5000 }); KIT.tone(520, 0.05, { type: 'triangle', vol: 0.05, to: 380 }); },
  bad: () => KIT.tone(180, 0.1, { type: 'square', vol: 0.03 }),
  win: () => KIT.arp([523, 659, 784, 1047, 1319], 0.1, { type: 'triangle', vol: 0.08 }),
  lose: () => KIT.arp([523, 466, 392, 330], 0.14, { type: 'triangle', vol: 0.07 }),
  warn: () => KIT.arp([880, 660], 0.08, { type: 'square', vol: 0.03 })
};

// ---------------- 坐标 ----------------
const px = p => [M + (p % N) * CELL, M + ((p / N) | 0) * CELL];
function cellAt(x, y) {
  const cx = Math.round((x - M) / CELL), cy = Math.round((y - M) / CELL);
  if (cx < 0 || cy < 0 || cx >= N || cy >= N) return -1;
  if (Math.hypot(x - M - cx * CELL, y - M - cy * CELL) > CELL * 0.48) return -1;
  return cy * N + cx;
}

// ---------------- 棋盘预渲染 ----------------
const [boardCv, bg] = (() => { const o = document.createElement('canvas'); o.width = W * 2; o.height = H * 2; const g = o.getContext('2d'); g.scale(2, 2); return [o, g]; })();
function renderBoard() {
  bg.clearRect(0, 0, W, H);
  const gr = bg.createLinearGradient(0, 0, W, H); gr.addColorStop(0, '#f2cf86'); gr.addColorStop(1, '#d9a85a');
  bg.fillStyle = gr; KIT.roundRect(bg, 0, 0, W, H, 18); bg.fill();
  bg.save(); bg.globalAlpha = 0.08; bg.strokeStyle = '#7a4a16';
  for (let i = 0; i < 40; i++) { bg.lineWidth = 0.6 + (i % 3) * 0.5; bg.beginPath(); const x0 = i * 17; bg.moveTo(x0, 0); for (let y = 0; y <= H; y += 20) bg.lineTo(x0 + Math.sin(y * 0.013 + i) * 7, y); bg.stroke(); }
  bg.restore();
  bg.strokeStyle = '#5a3412'; bg.lineWidth = 1.2; bg.beginPath();
  for (let i = 0; i < N; i++) { bg.moveTo(M, M + i * CELL); bg.lineTo(M + (N - 1) * CELL, M + i * CELL); bg.moveTo(M + i * CELL, M); bg.lineTo(M + i * CELL, M + (N - 1) * CELL); }
  bg.stroke();
  bg.lineWidth = 2.4; bg.strokeRect(M, M, (N - 1) * CELL, (N - 1) * CELL);
  bg.fillStyle = '#5a3412';
  for (const [x, y] of [[7, 7], [3, 3], [11, 3], [3, 11], [11, 11]]) { bg.beginPath(); bg.arc(M + x * CELL, M + y * CELL, 4.5, 0, 7); bg.fill(); }
  bg.font = 'bold 11px ' + NUMF; bg.textAlign = 'center'; bg.textBaseline = 'middle'; bg.fillStyle = 'rgba(90,52,18,.7)';
  for (let i = 0; i < N; i++) { bg.fillText('ABCDEFGHJKLMNOP'[i], M + i * CELL, 16); bg.fillText(String(N - i), 16, M + i * CELL); }
}
function stone(x, y, col, sc = 1, alpha = 1) {
  const r = CELL * 0.45 * sc;
  c.globalAlpha = alpha;
  c.fillStyle = 'rgba(0,0,0,.28)'; c.beginPath(); c.arc(x + 2, y + 3, r, 0, 7); c.fill();
  const g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  if (col === BLACK) { g.addColorStop(0, '#6a6a6a'); g.addColorStop(0.35, '#2a2a2a'); g.addColorStop(1, '#050505'); }
  else { g.addColorStop(0, '#ffffff'); g.addColorStop(0.6, '#f0ece2'); g.addColorStop(1, '#c9c1b0'); }
  c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
  c.globalAlpha = 1;
}

// ---------------- 流程 ----------------
const isHumanTurn = () => state === 'play' && !thinking && (mode === 'pvp' || turn === humanCol);
function play(p) {
  place(p, turn);
  moves.push(p); drops[p] = 0; hintAt = -1;
  SFX.stone();
  const f = fiveAt(p);
  if (f) { winLine = f; endGame(turn, 'five'); return; }
  if (moves.length === N * N) { endGame(0, 'full'); return; }
  turn = turn === BLACK ? WHITE : BLACK;
  syncStatus();
  if (mode === 'ai' && turn !== humanCol) aiMove();
}
function aiMove() {
  thinking = true; syncStatus();
  const tk = ++token;
  setTimeout(() => {
    if (tk !== token || state !== 'play') return;
    const q = search(turn, LEVELS[level]);
    thinking = false;
    if (q >= 0 && !board[q]) play(q);
    syncStatus();
  }, 260);
}
function endGame(winner, why) {
  state = 'over'; thinking = false; token++;
  result = { winner, why };
  KIT.stopMusic();
  const good = mode === 'pvp' || winner === humanCol;
  if (mode === 'ai' && winner) { if (winner === humanCol) rec.w[level]++; else rec.l[level]++; store.set('rec', rec); }
  stamp = { text: winner ? (mode === 'pvp' ? (winner === BLACK ? T('blackWin') : T('whiteWin')) : winner === humanCol ? T('youWin') : T('aiWin')) : T('draw'), t: 0 };
  if (winLine) {
    const [x1, y1] = px(winLine[0]), [x2, y2] = px(winLine[4]);
    for (let k = 0; k <= 10; k++) fx.burst(x1 + (x2 - x1) * k / 10, y1 + (y2 - y1) * k / 10, { n: 4, color: ['#ffd25a', '#fff', '#ff9a3a'], speed: 150, life: 0.8, size: 3, gravity: 120, shape: 'spark' });
  }
  if (winner && good) { SFX.win(); fx.burst(W / 2, H / 2, { n: 60, color: ['#ffd25a', '#ff7a5a', '#7ad8ff', '#9aff8a'], speed: 360, life: 1.4, size: 5, gravity: 260, shape: 'square' }); }
  else SFX.lose();
  setTimeout(showOver, 1500);
  syncStatus();
}
function undo() {
  if (state !== 'play' || !moves.length) return;
  token++; thinking = false;
  let n = mode === 'pvp' ? 1 : (turn === humanCol ? 2 : 1);
  n = Math.min(n, moves.length);
  for (let i = 0; i < n; i++) { remove(moves.pop()); turn = turn === BLACK ? WHITE : BLACK; }
  hintAt = -1; syncStatus();
  if (mode === 'ai' && turn !== humanCol) aiMove();
}
function hint() {
  if (!isHumanTurn()) return;
  hintAt = search(turn, LEVELS[1]);
}
function clickCell(p) {
  if (!isHumanTurn() || p < 0 || board[p]) return;
  if (renju && turn === BLACK && forbidden(p)) { SFX.bad(); toast(T('forbidden')); return; }
  play(p);
}

// ---------------- 绘制 ----------------
let lastT = performance.now(), fbKey = -1, fbSet = [];
function frame(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  c.clearRect(0, 0, W, H);
  c.drawImage(boardCv, 0, 0, W, H);
  // 禁手提示
  if (renju && state === 'play' && turn === BLACK && isHumanTurn() && moves.length > 4) {
    if (fbKey !== moves.length) { fbKey = moves.length; fbSet = []; for (let p = 0; p < N * N; p++) if (!board[p] && nearStone(p) && forbidden(p)) fbSet.push(p); }
    c.strokeStyle = 'rgba(220,40,30,.75)'; c.lineWidth = 2;
    for (const p of fbSet) {
      const [x, y] = px(p); c.beginPath(); c.moveTo(x - 6, y - 6); c.lineTo(x + 6, y + 6); c.moveTo(x + 6, y - 6); c.lineTo(x - 6, y + 6); c.stroke();
    }
  }
  moves.forEach((p, i) => {
    const [x, y] = px(p), col = i % 2 === 0 ? BLACK : WHITE;
    let sc = 1;
    if (drops[p] !== undefined) { drops[p] += dt; const k = Math.min(1, drops[p] / 0.18); sc = 1 + (1 - KIT.ease.outBack(k)) * 0.35; if (k >= 1) delete drops[p]; }
    const win = winLine && winLine.includes(p);
    if (win) { const k = 0.5 + 0.5 * Math.sin(now / 150); c.fillStyle = `rgba(255,200,40,${0.35 + 0.35 * k})`; c.beginPath(); c.arc(x, y, CELL * 0.6, 0, 7); c.fill(); }
    stone(x, y, col, sc);
    if (showNum) { c.fillStyle = col === BLACK ? '#fff' : '#222'; c.font = 'bold ' + (i >= 99 ? 11 : 13) + 'px ' + NUMF; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(i + 1, x, y + 1); }
    else if (i === moves.length - 1) { c.fillStyle = '#e8392b'; c.beginPath(); c.arc(x, y, 4.5, 0, 7); c.fill(); }
  });
  if (winLine) {
    const [x1, y1] = px(winLine[0]), [x2, y2] = px(winLine[4]);
    c.strokeStyle = 'rgba(255,90,40,.85)'; c.lineWidth = 5; c.lineCap = 'round'; c.shadowColor = '#ffb030'; c.shadowBlur = 16;
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); c.shadowBlur = 0;
  }
  if (hover >= 0 && isHumanTurn() && !board[hover]) { const [x, y] = px(hover); stone(x, y, turn, 1, 0.45); }
  if (hintAt >= 0 && !board[hintAt]) {
    const [x, y] = px(hintAt), k = 0.5 + 0.5 * Math.sin(now / 140);
    c.strokeStyle = `rgba(40,160,90,${0.6 + 0.4 * k})`; c.lineWidth = 3; c.beginPath(); c.arc(x, y, CELL * 0.42 + k * 4, 0, 7); c.stroke();
  }
  fx.update(dt); fx.draw(c);
  if (stamp) {
    stamp.t += dt;
    const k = stamp.t, sc = k < 0.3 ? 2 - KIT.ease.outBack(k / 0.3) : 1;
    c.save(); c.translate(W / 2, H / 2); c.rotate(-0.08); c.scale(sc, sc); c.globalAlpha = Math.min(1, k * 4) * 0.94;
    c.font = '58px ' + DISP; c.textAlign = 'center'; c.textBaseline = 'middle';
    const w = c.measureText(stamp.text).width + 50;
    c.fillStyle = 'rgba(255,250,240,.85)'; KIT.roundRect(c, -w / 2, -46, w, 92, 16); c.fill();
    c.strokeStyle = '#c0281c'; c.lineWidth = 5; c.stroke();
    c.fillStyle = '#c0281c'; c.fillText(stamp.text, 0, 4);
    c.restore();
  }
  requestAnimationFrame(frame);
}
function nearStone(p) {
  const x0 = p % N, y0 = (p / N) | 0;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const x = x0 + dx, y = y0 + dy; if (x >= 0 && y >= 0 && x < N && y < N && board[y * N + x]) return true; }
  return false;
}

// ---------------- DOM ----------------
const toastEl = $('toast');
function toast(t) { KIT.toast(toastEl, t); }
function syncStatus() {
  const el = $('status');
  let s;
  if (state === 'menu') s = T('stMenu');
  else if (state === 'over' && result) s = stamp ? stamp.text : '';
  else if (thinking) s = T('thinking');
  else s = (turn === BLACK ? T('blackTurn') : T('whiteTurn')) + (mode === 'ai' ? (turn === humanCol ? ' · ' + T('yourTurn') : '') : '');
  el.textContent = s;
  el.classList.toggle('busy', thinking);
  el.classList.toggle('white', turn === WHITE);
  $('btn-undo').disabled = state !== 'play' || !moves.length;
  $('btn-hint').disabled = !isHumanTurn();
  $('btn-resign').disabled = state !== 'play';
  $('btn-num').classList.toggle('on', showNum);
}
function hideScreens() { ['screen-menu', 'screen-over'].forEach(id => $(id).classList.add('hidden')); }
function newGame() {
  token++; hideScreens(); KIT.audio();
  resetBoard(); moves = []; turn = BLACK; winLine = null; hintAt = -1; drops = {}; stamp = null; result = null; thinking = false; fx.clear();
  humanCol = mode === 'ai' ? store.get('side', BLACK) : BLACK;
  state = 'play'; startTime = Date.now();
  KIT.music('zen-board');
  syncStatus();
  if (mode === 'ai' && humanCol === WHITE) { thinking = true; setTimeout(() => { thinking = false; if (state === 'play' && !moves.length) play(7 * N + 7); }, 500); }
}
function showOver() {
  if (state !== 'over') return;
  const r = result, human = mode === 'ai' ? humanCol : 0;
  $('over-emo').textContent = !r.winner ? '🤝' : mode === 'pvp' || r.winner === human ? '🏆' : '😤';
  $('over-title').textContent = stamp ? stamp.text : '';
  $('over-sub').textContent = r.why === 'resign' ? T('whyResign') : r.why === 'full' ? T('whyFull') : T('whyFive');
  const secs = Math.round((Date.now() - startTime) / 1000);
  const rows = [[T('stMoves'), moves.length], [T('stTime'), Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0')]];
  if (mode === 'ai') rows.push([T('stRec', T('lvNames')[level]), rec.w[level] + ' / ' + rec.l[level]]);
  $('over-stats').innerHTML = rows.map(([a, b]) => `<span>${a}</span><b>${b}</b>`).join('');
  $('screen-over').classList.remove('hidden');
}
function toMenu() { token++; hideScreens(); state = 'menu'; thinking = false; KIT.stopMusic(); renderMenu(); syncStatus(); $('screen-menu').classList.remove('hidden'); }
function renderMenu() {
  document.querySelectorAll('#mode-seg button').forEach(b => b.classList.toggle('on', b.dataset.m === mode));
  document.querySelectorAll('#side-seg button').forEach(b => b.classList.toggle('on', +b.dataset.s === store.get('side', BLACK)));
  document.querySelectorAll('#lv-seg button').forEach(b => b.classList.toggle('on', +b.dataset.l === level));
  document.querySelectorAll('#rule-seg button').forEach(b => b.classList.toggle('on', (b.dataset.r === '1') === renju));
  $('ai-opts').classList.toggle('hidden', mode !== 'ai');
  const tot = rec.w.reduce((a, b) => a + b, 0);
  $('menu-best').textContent = T('menuRec', tot);
}
document.querySelectorAll('#mode-seg button').forEach(b => b.onclick = () => { mode = b.dataset.m; store.set('mode', mode); renderMenu(); });
document.querySelectorAll('#side-seg button').forEach(b => b.onclick = () => { store.set('side', +b.dataset.s); renderMenu(); });
document.querySelectorAll('#lv-seg button').forEach(b => b.onclick = () => { level = +b.dataset.l; store.set('level', level); renderMenu(); });
document.querySelectorAll('#rule-seg button').forEach(b => b.onclick = () => { renju = b.dataset.r === '1'; store.set('renju', renju); renderMenu(); });
$('btn-start').onclick = newGame;
$('btn-again').onclick = newGame;
$('btn-view').onclick = () => $('screen-over').classList.add('hidden');
$('btn-menu').onclick = toMenu;
$('btn-undo').onclick = undo;
$('btn-hint').onclick = hint;
$('btn-num').onclick = () => { showNum = !showNum; store.set('nums', showNum); syncStatus(); };
$('btn-resign').onclick = () => { if (state === 'play' && confirm(T('resignAsk'))) endGame(mode === 'pvp' ? (turn === BLACK ? WHITE : BLACK) : (humanCol === BLACK ? WHITE : BLACK), 'resign'); };
$('btn-home').onclick = toMenu;
cv.addEventListener('pointermove', e => { const p = KIT.point(cv, e, W, H); hover = cellAt(p.x, p.y); });
cv.addEventListener('pointerleave', () => { hover = -1; });
cv.addEventListener('pointerdown', e => { const p = KIT.point(cv, e, W, H); clickCell(cellAt(p.x, p.y)); });
document.addEventListener('keydown', e => {
  if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
  if (state === 'menu' && e.code === 'Enter') { newGame(); return; }
  if (state !== 'play') return;
  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ' || e.code === 'KeyU') { e.preventDefault(); undo(); }
  else if (e.code === 'KeyH') hint();
  else if (e.code === 'KeyN') $('btn-num').click();
});

if (location.hash === '#debug') window.__gm = {
  info: () => ({ state, turn, moves: moves.slice(), thinking, result, evalB }),
  play: (x, y) => clickCell(y * N + x),
  ai: col => search(col, LEVELS[2]),
  forbidden: (x, y) => forbidden(y * N + x)
};
renderBoard();
const syncMute = KIT.mountMute($('btn-mute'));
KIT.boot(() => { syncMute(); renderMenu(); syncStatus(); });
toMenu();
requestAnimationFrame(frame);
})();
