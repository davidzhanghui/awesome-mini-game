(() => {
const STR = window.GAME_STR || { zh: {}, en: {} };
const T = (k, ...a) => AMG.tf(STR, k, ...a);
const N = 15, W = 600;
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const $ = id => document.getElementById(id);
const dpr = Math.min(window.devicePixelRatio || 1, 2);
canvas.width = W * dpr; canvas.height = W * dpr;
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

const store = {
  get muted() { return localStorage.getItem('gomoku-muted') === '1'; },
  set muted(v) { localStorage.setItem('gomoku-muted', v ? '1' : '0'); },
  get stats() { try { return JSON.parse(localStorage.getItem('gomoku-stats') || '{"b":0,"w":0,"d":0}'); } catch (e) { return { b: 0, w: 0, d: 0 }; } },
  set stats(s) { localStorage.setItem('gomoku-stats', JSON.stringify(s)); }
};
let actx = null, muted = store.muted;
function tone(f, dur, type, vol) {
  if (muted) return;
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type || 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(vol || .12, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(.001, actx.currentTime + dur);
    o.connect(g); g.connect(actx.destination); o.start(); o.stop(actx.currentTime + dur);
  } catch (e) {}
}
const sfx = { put: () => tone(520, .09, 'triangle', .14), win: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, .16, 'sine', .13), i * 110)), click: () => tone(700, .07, 'sine', .1), bad: () => tone(180, .15, 'square', .1) };

const G = {
  state: 'menu', board: [], moves: [], turn: 1, mode: 'pvp', aiLevel: 0,
  human: 1, forbid: false, lastMove: null, aiThinking: false, winLine: null
};
const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];

function reset() {
  G.board = Array.from({ length: N }, () => new Array(N).fill(0));
  G.moves = []; G.turn = 1; G.lastMove = null; G.aiThinking = false; G.winLine = null;
}
function inB(x, y) { return x >= 0 && y >= 0 && x < N && y < N; }
function countLine(bd, x, y, dx, dy, c) {
  let n = 0, i = x + dx, j = y + dy;
  while (inB(i, j) && bd[j][i] === c) { n++; i += dx; j += dy; }
  i = x - dx; j = y - dy;
  while (inB(i, j) && bd[j][i] === c) { n++; i -= dx; j -= dy; }
  return n;
}
function isFive(bd, x, y, c) {
  for (const [dx, dy] of DIRS) {
    if (countLine(bd, x, y, dx, dy, c) + 1 >= 5) {
      const line = [[x, y]];
      let i = x + dx, j = y + dy;
      while (inB(i, j) && bd[j][i] === c) { line.push([i, j]); i += dx; j += dy; }
      i = x - dx; j = y - dy;
      while (inB(i, j) && bd[j][i] === c) { line.push([i, j]); i -= dx; j -= dy; }
      return line;
    }
  }
  return null;
}
// 禁手判定（仅黑方）：活三三 / 四四 / 长连（白方无禁手）
function dirRun(bd, x, y, dx, dy, c) {
  let n = 1;
  let i = x + dx, j = y + dy;
  while (inB(i, j) && bd[j][i] === c) { n++; i += dx; j += dy; }
  const o1 = inB(i, j) && bd[j][i] === 0;
  i = x - dx; j = y - dy;
  while (inB(i, j) && bd[j][i] === c) { n++; i -= dx; j -= dy; }
  const o2 = inB(i, j) && bd[j][i] === 0;
  return { n, o1, o2 };
}
function isOpenThree(bd, x, y, dx, dy, c) {
  bd[y][x] = c;
  const { n, o1, o2 } = dirRun(bd, x, y, dx, dy, c);
  bd[y][x] = 0;
  return n === 3 && o1 && o2;
}
function isFour(bd, x, y, dx, dy, c) {
  bd[y][x] = c;
  const { n, o1, o2 } = dirRun(bd, x, y, dx, dy, c);
  bd[y][x] = 0;
  return n === 4 && (o1 || o2);
}
function isForbidden(bd, x, y) {
  for (const [dx, dy] of DIRS) {
    if (countLine(bd, x, y, dx, dy, 1) + 1 > 5) return T('forbidLong');
  }
  let fours = 0, threes = 0;
  for (const [dx, dy] of DIRS) {
    if (isFour(bd, x, y, dx, dy, 1)) fours++;
    if (isOpenThree(bd, x, y, dx, dy, 1)) threes++;
  }
  if (fours >= 2) return T('forbid44');
  if (threes >= 2) return T('forbid33');
  return null;
}

// ---------- AI ----------
function candidates(bd) {
  const set = new Set(), out = [];
  let any = false;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (bd[y][x]) { any = true; break; }
  if (!any) return [[7, 7]];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (!bd[y][x]) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const i = x + dx, j = y + dy;
      if (inB(i, j) && !bd[j][i] && !set.has(j * N + i)) { set.add(j * N + i); out.push([i, j]); }
    }
  }
  return out;
}
function lineScore(n, open) {
  if (n >= 5) return 1000000;
  if (n === 4) return open === 2 ? 100000 : 10000;
  if (n === 3) return open === 2 ? 5000 : open === 1 ? 500 : 0;
  if (n === 2) return open === 2 ? 200 : open === 1 ? 30 : 0;
  if (n === 1) return open === 2 ? 10 : 2;
  return 0;
}
function evalPoint(bd, x, y, c) {
  let s = 0;
  for (const [dx, dy] of DIRS) {
    let n = 1, open = 0;
    let i = x + dx, j = y + dy;
    while (inB(i, j) && bd[j][i] === c) { n++; i += dx; j += dy; }
    if (inB(i, j) && !bd[j][i]) open++;
    i = x - dx; j = y - dy;
    while (inB(i, j) && bd[j][i] === c) { n++; i -= dx; j -= dy; }
    if (inB(i, j) && !bd[j][i]) open++;
    s += lineScore(n, open);
  }
  return s;
}
function aiMove(level, color) {
  const bd = G.board;
  if (level === 0) {
    // 简单：70% 启发式单步，否则周边随机
    const cands = candidates(bd);
    if (Math.random() < .3) return cands[Math.random() * cands.length | 0];
    return bestOnePly(bd, color);
  }
  if (level === 1) return bestOnePly(bd, color);
  return negamaxRoot(bd, color, 3);
}
function bestOnePly(bd, color) {
  // 己方立即胜 > 堵对方立即胜 > 综合评分
  const cands = candidates(bd);
  for (const [x, y] of cands) { bd[y][x] = color; const w = isFive(bd, x, y, color); bd[y][x] = 0; if (w) return [x, y]; }
  const foe = 3 - color;
  for (const [x, y] of cands) { bd[y][x] = foe; const w = isFive(bd, x, y, foe); bd[y][x] = 0; if (w) return [x, y]; }
  let best = null, bs = -1;
  for (const [x, y] of cands) {
    const s = evalPoint(bd, x, y, color) * 1.0 + evalPoint(bd, x, y, foe) * .92;
    if (s > bs) { bs = s; best = [x, y]; }
  }
  return best || [7, 7];
}
function evaluate(bd, color) {
  let s = 0;
  for (const [x, y] of candidates(bd)) {
    s += evalPoint(bd, x, y, color) - evalPoint(bd, x, y, 3 - color) * .95;
  }
  return s;
}
function negamax(bd, depth, alpha, beta, color) {
  const cands = candidates(bd);
  // 终局检查（只查候选落子形成的五连，简化：评估中已含百万分，这里只做浅层胜负）
  if (depth === 0) return evaluate(bd, color);
  // 排序：按启发式分
  const scored = cands.map(p => ({ p, s: evalPoint(bd, p[0], p[1], color) + evalPoint(bd, p[0], p[1], 3 - color) }));
  scored.sort((a, b) => b.s - a.s);
  const top = scored.slice(0, Math.min(12, scored.length));
  let best = -Infinity;
  for (const { p } of top) {
    const [x, y] = p;
    bd[y][x] = color;
    let v;
    if (isFive(bd, x, y, color)) v = 10000000;
    else v = -negamax(bd, depth - 1, -beta, -alpha, 3 - color);
    bd[y][x] = 0;
    if (v > best) best = v;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}
function negamaxRoot(bd, color, depth) {
  const cands = candidates(bd);
  for (const [x, y] of cands) { bd[y][x] = color; const w = isFive(bd, x, y, color); bd[y][x] = 0; if (w) return [x, y]; }
  const foe = 3 - color;
  for (const [x, y] of cands) { bd[y][x] = foe; const w = isFive(bd, x, y, foe); bd[y][x] = 0; if (w) return [x, y]; }
  const scored = cands.map(p => ({ p, s: evalPoint(bd, p[0], p[1], color) + evalPoint(bd, p[0], p[1], foe) }));
  scored.sort((a, b) => b.s - a.s);
  const top = scored.slice(0, Math.min(10, scored.length));
  let best = null, bs = -Infinity;
  for (const { p } of top) {
    const [x, y] = p;
    bd[y][x] = color;
    const v = -negamax(bd, depth - 1, -Infinity, Infinity, foe);
    bd[y][x] = 0;
    if (v > bs) { bs = v; best = [x, y]; }
  }
  return best || [7, 7];
}

// ---------- 流程 ----------
function place(x, y) {
  if (G.state !== 'play' || G.aiThinking) return false;
  if (!inB(x, y) || G.board[y][x]) { sfx.bad(); return false; }
  const c = G.turn;
  if (G.forbid && c === 1) {
    const f = isForbidden(G.board, x, y);
    if (f) { flashMsg(T('forbidHint', f)); sfx.bad(); return false; }
  }
  G.board[y][x] = c;
  G.moves.push([x, y]);
  G.lastMove = [x, y];
  sfx.put();
  const line = isFive(G.board, x, y, c);
  if (line) { line.sort((a, b) => a[0] - b[0] || a[1] - b[1]); G.winLine = line; endGame(c); return true; }
  if (G.moves.length >= N * N) { endGame(0); return true; }
  G.turn = 3 - c;
  updateHUD();
  maybeAI();
  return true;
}
function maybeAI() {
  if (G.state !== 'play') return;
  if (G.mode === 'pvp') return;
  if (G.turn === G.human) return;
  G.aiThinking = true;
  updateHUD();
  setTimeout(() => {
    if (G.state !== 'play') { G.aiThinking = false; return; }
    const t0 = performance.now();
    const [x, y] = aiMove(G.aiLevel, G.turn);
    G.aiThinking = false;
    if (performance.now() - t0 < 250) { setTimeout(() => doAIMove(x, y), 250); }
    else doAIMove(x, y);
  }, 30);
}
function doAIMove(x, y) {
  if (G.state !== 'play') return;
  if (G.board[y][x]) { // 极端情况回退
    const c = candidates(G.board)[0] || [7, 7];
    x = c[0]; y = c[1];
  }
  if (G.forbid && G.turn === 1 && isForbidden(G.board, x, y)) {
    const cands = candidates(G.board).filter(([ix, iy]) => !(G.forbid && G.turn === 1 && isForbidden(G.board, ix, iy)));
    const fb = cands[0] || candidates(G.board)[0];
    if (!fb) return;
    x = fb[0]; y = fb[1];
  }
  G.board[y][x] = G.turn;
  G.moves.push([x, y]);
  G.lastMove = [x, y];
  sfx.put();
  const c = G.turn;
  const line = isFive(G.board, x, y, c);
  if (line) { line.sort((a, b) => a[0] - b[0] || a[1] - b[1]); G.winLine = line; endGame(c); return; }
  if (G.moves.length >= N * N) { endGame(0); return; }
  G.turn = 3 - c;
  updateHUD();
}
let msgT = 0, msg = '';
function flashMsg(m) { msg = m; msgT = 2.2; }
function endGame(winner) {
  G.state = 'over';
  const st = store.stats;
  if (winner === 1) st.b++; else if (winner === 2) st.w++; else st.d++;
  store.stats = st;
  refreshStats();
  sfx.win();
  $('over-title').textContent = winner === 0 ? T('drawTitle') : winner === 1 ? T('winBlack') : T('winWhite');
  $('over-sub').textContent = T('overSub', G.moves.length, (G.mode !== 'pvp' ? (winner === G.human ? T('extraYou') : winner === 0 ? '' : T('extraAi')) : ''));
  setTimeout(() => { $('screen-over').classList.remove('hidden'); }, 500);
  updateHUD();
}
function startGame(mode) {
  G.mode = mode;
  if (mode.startsWith('ai')) G.aiLevel = +mode.slice(2);
  G.human = +$('sel-color').value;
  G.forbid = $('ck-forbid').checked;
  reset();
  G.state = 'play';
  $('screen-menu').classList.add('hidden');
  $('screen-over').classList.add('hidden');
  $('hud').classList.remove('hidden');
  $('toolbar').classList.remove('hidden');
  sfx.click();
  updateHUD();
  maybeAI();
}
function undo() {
  if (G.state !== 'play' || G.aiThinking) return;
  const n = G.mode === 'pvp' ? 1 : 2;
  for (let i = 0; i < n && G.moves.length; i++) {
    const [x, y] = G.moves.pop();
    G.board[y][x] = 0;
  }
  G.turn = G.moves.length % 2 === 0 ? 1 : 2;
  G.lastMove = G.moves.length ? G.moves[G.moves.length - 1] : null;
  sfx.click();
  updateHUD();
}
function updateHUD() {
  const t = $('hud-turn');
  t.textContent = (G.turn === 1 ? T('hudBlack') : T('hudWhite')) + T('hudMove') + (G.aiThinking ? T('hudThinking') : '');
  t.className = 'turn ' + (G.turn === 1 ? 'black' : 'white');
  $('hud-moves').textContent = T('hudMoves', G.moves.length);
}
function refreshStats() {
  const st = store.stats;
  $('st-b').textContent = st.b; $('st-w').textContent = st.w; $('st-d').textContent = st.d;
}

// ---------- 渲染 ----------
function cell() { return W / (N + 1); }
function render(dt) {
  const g = ctx.createLinearGradient(0, 0, W, W);
  g.addColorStop(0, '#e8b96a'); g.addColorStop(1, '#d29a4a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, W);
  ctx.strokeStyle = 'rgba(90,50,10,.8)'; ctx.lineWidth = 1.5;
  const c = cell();
  for (let i = 0; i < N; i++) {
    ctx.beginPath(); ctx.moveTo(c * (i + 1), c); ctx.lineTo(c * (i + 1), W - c); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(c, c * (i + 1)); ctx.lineTo(W - c, c * (i + 1)); ctx.stroke();
  }
  const star = [[3, 3], [11, 3], [3, 11], [11, 11], [7, 7]];
  ctx.fillStyle = '#5a320a';
  for (const [x, y] of star) { ctx.beginPath(); ctx.arc(c * (x + 1), c * (y + 1), 4, 0, 7); ctx.fill(); }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (!G.board[y]) continue;
    const v = G.board[y][x];
    if (!v) continue;
    const px = c * (x + 1), py = c * (y + 1), r = c * .44;
    const grad = ctx.createRadialGradient(px - r * .3, py - r * .3, r * .1, px, py, r);
    if (v === 1) { grad.addColorStop(0, '#666'); grad.addColorStop(.4, '#222'); grad.addColorStop(1, '#000'); }
    else { grad.addColorStop(0, '#fff'); grad.addColorStop(.7, '#eee'); grad.addColorStop(1, '#bbb'); }
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(px, py, r, 0, 7); ctx.fill();
  }
  if (G.lastMove) {
    const [x, y] = G.lastMove;
    ctx.strokeStyle = '#e33'; ctx.lineWidth = 2.5;
    ctx.strokeRect(c * (x + 1) - 8, c * (y + 1) - 8, 16, 16);
  }
  if (G.winLine) {
    ctx.strokeStyle = 'rgba(227,62,43,.9)'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    const a = G.winLine[0], b = G.winLine[G.winLine.length - 1];
    ctx.beginPath();
    ctx.moveTo(c * (a[0] + 1), c * (a[1] + 1));
    ctx.lineTo(c * (b[0] + 1), c * (b[1] + 1));
    ctx.stroke();
  }
  if (msgT > 0) {
    msgT -= dt;
    ctx.fillStyle = 'rgba(0,0,0,.7)';
    ctx.fillRect(W / 2 - 170, W / 2 - 26, 340, 52);
    ctx.fillStyle = '#ffd93d'; ctx.font = '900 20px system-ui'; ctx.textAlign = 'center';
    ctx.fillText(msg, W / 2, W / 2 + 7);
  }
}
let last = performance.now();
reset();
(function loop(now) {
  const dt = Math.min(((now || performance.now()) - last) / 1000, .05);
  last = now || performance.now();
  render(dt);
  requestAnimationFrame(loop);
})(performance.now());

// ---------- 输入 ----------
canvas.addEventListener('pointerdown', e => {
  if (G.state !== 'play') return;
  const r = canvas.getBoundingClientRect();
  const px = (e.clientX - r.left) / r.width * W, py = (e.clientY - r.top) / r.height * W;
  const gx = Math.round(px / cell()) - 1, gy = Math.round(py / cell()) - 1;
  if (inB(gx, gy)) place(gx, gy);
});
window.addEventListener('keydown', e => {
  if (e.code === 'KeyM') toggleMute();
  else if (e.code === 'KeyU') undo();
  else if (e.code === 'KeyR') { if (G.state === 'over') retry(); else if (G.state === 'play') retry(); }
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
$('btn-resign').onclick = () => {
  if (G.state !== 'play') return;
  endGame(3 - G.turn);
};
function toggleMute() {
  muted = !muted; store.muted = muted;
  $('btn-mute').textContent = muted ? '🔇' : '🔊';
}
$('btn-mute').onclick = toggleMute;
$('btn-mute').textContent = muted ? '🔇' : '🔊';
// i18n boot: static DOM + dynamic boot texts
window.__refreshLang = function () {
  AMG.apply(STR);
  $('btn-mute').title = T('muteTitle');
  $('btn-undo').title = T('undoTitle');
  $('btn-resign').title = T('resignTitle');
  $('btn-tomenu').title = T('tomenuTitle');
  refreshStats();
};
AMG.mountBtn();
window.__refreshLang();

refreshStats();
window.__game = G;
window.__gameErrors = [];
window.addEventListener('error', e => window.__gameErrors.push(String(e.message)));
G._place = place; G._aiMove = aiMove; G._isFive = isFive; G._isForbidden = isForbidden;
})();
