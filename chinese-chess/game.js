(() => {
const STR = window.GAME_STR || { zh: {}, en: {} };
const T = (k, ...a) => AMG.tf(STR, k, ...a);
const X = (typeof window !== 'undefined' && window.XQ) || self.XQ;
const W = 560, H = 640, OX = 60, OY = 92, CELL = 54;
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const $ = id => document.getElementById(id);
const dpr = Math.min(window.devicePixelRatio || 1, 2);
canvas.width = W * dpr; canvas.height = H * dpr;
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

const store = {
  get muted() { return localStorage.getItem('xq-muted') === '1'; },
  set muted(v) { localStorage.setItem('xq-muted', v ? '1' : '0'); },
  get stats() { try { return JSON.parse(localStorage.getItem('xq-stats') || '{"r":0,"b":0,"d":0}'); } catch (e) { return { r: 0, b: 0, d: 0 }; } },
  set stats(s) { localStorage.setItem('xq-stats', JSON.stringify(s)); }
};
let actx = null, muted = store.muted;
function tone(f, dur, type, vol, slide) {
  if (muted) return;
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f, actx.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), actx.currentTime + dur);
    g.gain.setValueAtTime(vol || .11, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(.001, actx.currentTime + dur);
    o.connect(g); g.connect(actx.destination); o.start(); o.stop(actx.currentTime + dur);
  } catch (e) {}
}
const sfx = {
  move: () => tone(440, .08, 'triangle', .12),
  cap: () => { tone(300, .1, 'square', .13, -120); },
  check: () => { tone(880, .12, 'square', .12); setTimeout(() => tone(880, .12, 'square', .12), 150); },
  select: () => tone(660, .06, 'sine', .09),
  win: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, .16, 'sine', .12), i * 110)),
  bad: () => tone(170, .14, 'square', .1)
};

const NAMES = { k: T('pk'), a: T('pa'), b: T('pb'), n: T('pn'), r: T('pr'), c: T('pc'), p: T('pp') };
function pname(p) {
  const t = p.toLowerCase(), red = X.isRed(p);
  if (t === 'k') return red ? T('redK') : T('pk');
  if (t === 'n') return red ? T('redN') : T('pn');
  if (t === 'b') return red ? T('redB') : T('pb');
  return NAMES[t];
}
const G = {
  state: 'menu', board: X.initial(), turn: 1, mode: 'pvp', aiLevel: 1,
  human: 1, sel: null, moves: [], hist: [], reps: {}, aiBusy: false, flip: false,
  hint: true, msg: '', msgT: 0, lastMove: null, aiMs: 0
};
let worker = null, reqId = 0;
const pending = {};
try {
  worker = new Worker('ai-worker.js?v=20260906');
  worker.onmessage = e => {
    const { id, ok, move, info, error } = e.data;
    const cb = pending[id];
    delete pending[id];
    if (cb) cb(ok ? move : null, info, error);
  };
} catch (e) { worker = null; }

function reset() {
  G.board = X.initial(); G.turn = 1; G.sel = null; G.moves = []; G.hist = [];
  G.reps = {}; G.aiBusy = false; G.lastMove = null; G.aiMs = 0;
  G.reps[X.key(G.board, 1)] = 1;
}
function flash(m) { G.msg = m; G.msgT = 2.4; }
function legalMoves() { return X.legal(G.board, G.turn); }
function applyMove(m) {
  const cap = X.doMove(G.board, m);
  G.moves.push(m); G.hist.push({ m, cap });
  G.lastMove = m;
  const k = X.key(G.board, G.turn === 1 ? -1 : 1);
  G.turn = -G.turn;
  G.reps[k] = (G.reps[k] || 0) + 1;
  return cap;
}
function tryMove(fx, fy, tx, ty) {
  const p = G.board[fy][fx];
  if (!p) return false;
  const moves = X.legal(G.board, G.turn).filter(m => m.fx === fx && m.fy === fy && m.tx === tx && m.ty === ty);
  if (!moves.length) { sfx.bad(); return false; }
  const m = moves[0];
  const cap = applyMove(m);
  if (cap) sfx.cap(); else sfx.move();
  postMove();
  return true;
}
function postMove() {
  G.sel = null;
  updateHUD();
  // 胜负：对方无合法走法 → 将死或困毙（规则判负）
  const foeMoves = X.legal(G.board, G.turn);
  const check = X.inCheck(G.board, G.turn);
  if (!foeMoves.length) {
    endGame(-G.turn, check ? (G.turn === 1 ? T('mateB') : T('mateR')) : (G.turn === 1 ? T('staleB') : T('staleR')));
    return;
  }
  if (check) sfx.check();
  const k = X.key(G.board, G.turn);
  if (G.reps[k] >= 3) { endGame(0, T('repDraw')); return; }
  if (G.moves.length >= 240) { endGame(0, T('longDraw')); return; }
  maybeAI();
}
function maybeAI() {
  if (G.state !== 'play' || G.mode === 'pvp' || G.turn === G.human || G.aiBusy) return;
  G.aiBusy = true;
  updateHUD();
  const t0 = performance.now();
  const board = G.board.map(r => r.slice()), turn = G.turn, level = G.aiLevel;
  const done = (move) => {
    G.aiBusy = false;
    G.aiMs = Math.round(performance.now() - t0);
    if (G.state !== 'play') { updateHUD(); return; }
    if (!move) {
      // AI 无棋：认负
      endGame(-turn, T('aiNone'));
      return;
    }
    const cap = applyMove({ fx: move.fx, fy: move.fy, tx: move.tx, ty: move.ty });
    if (cap) sfx.cap(); else sfx.move();
    postMove();
  };
  if (worker) {
    const id = ++reqId;
    pending[id] = (move) => done(move);
    try { worker.postMessage({ id, board, turn, level }); }
    catch (e) { delete pending[id]; done(X.search(board, turn, level, 1500).move); }
    // 熔断：2.5s 无响应则主线程兜底
    setTimeout(() => { if (pending[id]) { delete pending[id]; done(X.search(board, turn, level, 400).move); } }, 2500);
  } else {
    setTimeout(() => done(X.search(board, turn, level, 1200).move), 30);
  }
}
function endGame(winner, reason) {
  G.state = 'over';
  const st = store.stats;
  if (winner === 1) st.r++; else if (winner === -1) st.b++; else st.d++;
  store.stats = st;
  refreshStats();
  sfx.win();
  $('over-title').textContent = winner === 0 ? T('drawT') : winner === 1 ? T('redWin') : T('blkWin');
  $('over-sub').textContent = T('overSub', reason, G.moves.length) + (G.mode !== 'pvp' ? (winner === 0 ? '' : winner === G.human ? T('youWin') : T('aiWin')) : '');
  setTimeout(() => $('screen-over').classList.remove('hidden'), 500);
  updateHUD();
}
function startGame(mode) {
  G.mode = mode;
  if (mode.startsWith('ai')) G.aiLevel = +mode.slice(2);
  G.human = +$('sel-color').value;
  G.hint = $('ck-hint').checked;
  reset();
  G.state = 'play';
  $('screen-menu').classList.add('hidden');
  $('screen-over').classList.add('hidden');
  $('hud').classList.remove('hidden');
  $('toolbar').classList.remove('hidden');
  updateHUD();
  maybeAI();
}
function undo() {
  if (G.state !== 'play' || G.aiBusy) return;
  const n = G.mode === 'pvp' ? 1 : 2;
  for (let i = 0; i < n && G.hist.length; i++) {
    const { m, cap } = G.hist.pop();
    X.undoMove(G.board, m, cap);
    G.moves.pop();
    G.turn = -G.turn;
  }
  G.sel = null; G.lastMove = G.moves.length ? G.moves[G.moves.length - 1] : null;
  rebuildReps();
  updateHUD();
}
function rebuildReps() {
  const bd = X.initial();
  let turn = 1;
  G.reps = {};
  G.reps[X.key(bd, 1)] = 1;
  for (const { m } of G.hist) {
    X.doMove(bd, m);
    turn = -turn;
    const k = X.key(bd, turn);
    G.reps[k] = (G.reps[k] || 0) + 1;
  }
}
function updateHUD() {
  $('hud-turn').textContent = T('hudTurn', G.turn === 1, G.aiBusy);
  $('hud-info').textContent = T('hudInfo', G.moves.length + 1, G.aiMs);
}
function refreshStats() {
  const st = store.stats;
  $('st-r').textContent = st.r; $('st-b').textContent = st.b; $('st-d').textContent = st.d;
}

// ---------- 坐标 ----------
function toBoard(px, py) {
  const gx = Math.round((px - OX) / CELL), gy = Math.round((py - OY) / CELL);
  if (gx < 0 || gy < 0 || gx > 8 || gy > 9) return null;
  if (G.flip) return { x: 8 - gx, y: 9 - gy };
  return { x: gx, y: gy };
}
function toPx(x, y) {
  const gx = G.flip ? 8 - x : x, gy = G.flip ? 9 - y : y;
  return { x: OX + gx * CELL, y: OY + gy * CELL };
}

// ---------- 渲染 ----------
function render(dt) {
  // 木质棋盘
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#e8c07a'); g.addColorStop(1, '#c8924a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#5a3a12'; ctx.lineWidth = 2;
  // 网格
  for (let x = 0; x < 9; x++) {
    const a = toPx(x, 0), b = toPx(x, 9);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  for (let y = 0; y < 10; y++) {
    const a = toPx(0, y), b = toPx(8, y);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  // 九宫斜线
  for (const [cx, y0] of [[4, 0], [4, 7]]) {
    const a = toPx(cx - 1, y0), b = toPx(cx + 1, y0 + 2);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    const c = toPx(cx + 1, y0), d = toPx(cx - 1, y0 + 2);
    ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.stroke();
  }
  // 楚河汉界
  ctx.fillStyle = 'rgba(90,58,18,.75)';
  ctx.font = '900 26px "PingFang SC",serif'; ctx.textAlign = 'center';
  ctx.fillText(T('river'), W / 2, OY + 4.6 * CELL + 9);
  // 选中
  if (G.sel) {
    const p = toPx(G.sel.x, G.sel.y);
    ctx.strokeStyle = '#e33'; ctx.lineWidth = 3;
    ctx.strokeRect(p.x - 26, p.y - 26, 52, 52);
    if (G.hint) {
      const ms = X.legal(G.board, G.turn).filter(m => m.fx === G.sel.x && m.fy === G.sel.y);
      ctx.fillStyle = 'rgba(227,62,43,.85)';
      for (const m of ms) {
        const q = toPx(m.tx, m.ty);
        ctx.beginPath(); ctx.arc(q.x, q.y, G.board[m.ty][m.tx] ? 22 : 7, 0, 7); ctx.fill();
        if (G.board[m.ty][m.tx]) { ctx.strokeStyle = '#e33'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(q.x, q.y, 22, 0, 7); ctx.stroke(); }
      }
    }
  }
  // 上一步
  if (G.lastMove) {
    for (const [x, y] of [[G.lastMove.fx, G.lastMove.fy], [G.lastMove.tx, G.lastMove.ty]]) {
      const p = toPx(x, y);
      ctx.strokeStyle = 'rgba(46,139,222,.9)'; ctx.lineWidth = 2.5;
      ctx.strokeRect(p.x - 26, p.y - 26, 52, 52);
    }
  }
  // 棋子
  for (let y = 0; y < 10; y++) for (let x = 0; x < 9; x++) {
    const p = G.board[y][x];
    if (!p) continue;
    const { x: px, y: py } = toPx(x, y);
    const red = X.isRed(p);
    const grad = ctx.createRadialGradient(px - 7, py - 8, 3, px, py, 24);
    grad.addColorStop(0, '#fffdf5'); grad.addColorStop(.75, '#f7ecd2'); grad.addColorStop(1, '#d9c49a');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(px, py, 23, 0, 7); ctx.fill();
    ctx.strokeStyle = red ? '#c0392b' : '#2c3e50'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(px, py, 23, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.arc(px, py, 18, 0, 7); ctx.stroke();
    ctx.fillStyle = red ? '#c0392b' : '#1a1a1a';
    ctx.font = '900 24px "PingFang SC",serif'; ctx.textAlign = 'center';
    ctx.fillText(pname(p), px, py + 8.5);
  }
  if (G.msgT > 0) {
    G.msgT -= dt;
    ctx.fillStyle = 'rgba(0,0,0,.7)';
    ctx.fillRect(W / 2 - 190, H / 2 - 26, 380, 52);
    ctx.fillStyle = '#ffd93d'; ctx.font = '900 19px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(G.msg, W / 2, H / 2 + 7);
  }
}
reset();
let last = performance.now();
(function loop(now) {
  const dt = Math.min(((now || performance.now()) - last) / 1000, .05);
  last = now || performance.now();
  render(dt);
  requestAnimationFrame(loop);
})(performance.now());

// ---------- 输入 ----------
canvas.addEventListener('pointerdown', e => {
  if (G.state !== 'play' || G.aiBusy) return;
  if (G.mode !== 'pvp' && G.turn !== G.human) return;
  const r = canvas.getBoundingClientRect();
  const px = (e.clientX - r.left) / r.width * W, py = (e.clientY - r.top) / r.height * H;
  const cell = toBoard(px, py);
  if (!cell) { G.sel = null; return; }
  const { x, y } = cell;
  const p = G.board[y][x];
  if (G.sel) {
    if (G.sel.x === x && G.sel.y === y) { G.sel = null; return; }
    if (p && ((G.turn === 1 && X.isRed(p)) || (G.turn === -1 && !X.isRed(p)))) {
      G.sel = { x, y }; sfx.select(); return;
    }
    if (tryMove(G.sel.x, G.sel.y, x, y)) return;
    G.sel = null;
    return;
  }
  if (p && ((G.turn === 1 && X.isRed(p)) || (G.turn === -1 && !X.isRed(p)))) {
    G.sel = { x, y }; sfx.select();
  }
});
window.addEventListener('keydown', e => {
  if (e.code === 'KeyM') toggleMute();
  else if (e.code === 'KeyU') undo();
  else if (e.code === 'KeyR') { if (G.state === 'over' || G.state === 'play') retry(); }
  else if (e.code === 'Escape') toMenu();
});
function retry() {
  $('screen-over').classList.add('hidden');
  reset(); G.state = 'play';
  $('hud').classList.remove('hidden'); $('toolbar').classList.remove('hidden');
  updateHUD(); maybeAI();
}
function toMenu() {
  G.state = 'menu';
  G.aiBusy = false;
  for (const k in pending) delete pending[k];
  $('screen-menu').classList.remove('hidden');
  $('screen-over').classList.add('hidden');
  $('hud').classList.add('hidden'); $('toolbar').classList.add('hidden');
  refreshStats();
}
document.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => startGame(b.dataset.mode));
$('btn-retry').onclick = retry;
$('btn-menu').onclick = toMenu;
$('btn-undo').onclick = undo;
$('btn-tomenu').onclick = toMenu;
$('btn-resign').onclick = () => { if (G.state === 'play') endGame(-G.turn, T('resign')); };
$('btn-flip').onclick = () => { G.flip = !G.flip; };
function toggleMute() {
  muted = !muted; store.muted = muted;
  $('btn-mute').textContent = muted ? '🔇' : '🔊';
}
$('btn-mute').onclick = toggleMute;
$('btn-mute').textContent = muted ? '🔇' : '🔊';
// i18n boot: static DOM + dynamic boot texts
AMG.mountBtn();
window.__refreshLang = function() {
  AMG.apply(STR);
  $('btn-mute').title = T('muteTitle');
  $('btn-flip').title = T('flipTitle');
  refreshStats();
};
window.__refreshLang();
window.__game = G;
window.__gameErrors = [];
window.addEventListener('error', e => window.__gameErrors.push(String(e.message)));
G._tryMove = tryMove;
})();
