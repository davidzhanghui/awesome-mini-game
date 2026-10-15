/* 中国象棋 · 楚汉争锋 —— 人机 / 双人 / 残局挑战
 * 规则与搜索见 xq.js；电脑在 Web Worker（ai.js）里思考，不卡界面。
 */
(() => {
'use strict';
const { $, T } = KIT;
const store = KIT.store('amg-xq');
const W = 580, H = 640, OX = 50, OY = 50, CELL = 60, PR = 26;
const cv = $('game'), c = KIT.canvas(cv, W, H);
const KAI = '"STKaiti", "KaiTi", "Kaiti SC", "楷体", "AMG Display", serif';
const DISP = '"AMG Display", "PingFang SC", system-ui, sans-serif';
const XQ = window.XQ;
const LEVELS = [{ time: 350, depth: 3, noise: 70 }, { time: 1000, depth: 7, noise: 8 }, { time: 2600, depth: 30, noise: 0 }];
// 残局：红先，N 步内绝杀（均已用引擎验证）
const PUZZLES = [
  { fen: '3k5/9/9/9/9/9/9/9/R8/R3K4 w', n: 1 },
  { fen: '2bak4/4a4/4b4/9/9/9/9/9/4C4/3RK1R2 w', n: 1 },
  { fen: '3k5/4P4/9/9/9/9/9/9/9/4K4 w', n: 2 },
  { fen: '5k3/9/5P3/7CN/9/9/9/9/9/5K3 w', n: 2 },
  { fen: '5R3/3ka4/9/9/5C3/9/5C3/5K3/9/9 w', n: 2 },
  { fen: '9/4k4/9/6P2/9/1R7/9/9/5K3/9 w', n: 2 },
  { fen: '9/9/b2ak3b/9/9/R8/6R2/9/9/3K5 w', n: 2 },
  { fen: '9/4k4/5a3/R6n1/5R3/9/9/3K5/9/9 w', n: 3 },
  { fen: '3ak4/4a4/9/9/9/9/9/4N4/2R6/4K4 w', n: 3 },
  { fen: '2n6/4N4/N4k3/9/9/9/9/9/4K4/9 w', n: 3 },
  { fen: '5k3/9/4P4/9/6b2/7R1/9/4K4/9/9 w', n: 3 },
  { fen: '9/1C7/4ka3/3N5/9/9/9/5K3/9/9 w', n: 4 }
];

// ---------------- 状态 ----------------
let state = 'menu', mode = store.get('mode', 'ai'), humanSide = store.get('side', 1), level = store.get('level', 1), puzzleIdx = store.get('pz', 0);
let solved = store.get('solved', []), rec = store.get('rec', { w: [0, 0, 0], l: [0, 0, 0], d: [0, 0, 0] });
let pos = new XQ.Pos(), startFen = XQ.START_FEN, hist = [], flip = false, sel = -1, targets = [], lastMove = 0, hintMove = 0;
let anim = null, thinking = false, reqId = 0, stamp = null, shake = 0, startTime = 0, result = null, noCap = 0, puzzleLeft = 0;
const fx = new KIT.Particles();

// ---------------- AI Worker ----------------
let worker = null;
function makeWorker() {
  try { worker = new Worker('ai.js?v=20261015'); worker.onmessage = e => onAI(e.data); worker.onerror = () => { worker = null; }; }
  catch (e) { worker = null; }
}
makeWorker();
function askAI(hint) {
  const id = ++reqId, L = hint ? { time: 900, depth: 30, noise: 0 } : mode === 'puzzle' ? LEVELS[2] : LEVELS[level];
  const msg = { id, fen: startFen, moves: hist.map(h => h.m), time: L.time, depth: L.depth, noise: L.noise };
  if (!hint) thinking = true;
  pendingHint = hint ? id : 0;
  syncStatus();
  if (worker) worker.postMessage(msg);
  else setTimeout(() => {
    const p = new XQ.Pos(msg.fen); msg.moves.forEach(m => p.make(m));
    const r = XQ.search(p, msg); onAI({ id, move: r.move });
  }, 30);
}
let pendingHint = 0;
function cancelAI() {
  if (thinking || pendingHint) { reqId++; thinking = false; pendingHint = 0; if (worker) { worker.terminate(); makeWorker(); } }
}
function onAI(d) {
  if (d.id !== reqId) return;
  if (pendingHint === d.id) { pendingHint = 0; hintMove = d.move; syncStatus(); return; }
  thinking = false;
  if (state !== 'play' || !d.move) { syncStatus(); return; }
  doMove(d.move);
}

// ---------------- 坐标 ----------------
const sqRC = sq => [(sq / 9) | 0, sq % 9];
function sqXY(sq) { let [r, cc] = sqRC(sq); if (flip) { r = 9 - r; cc = 8 - cc; } return [OX + cc * CELL, OY + r * CELL]; }
function xySq(x, y) {
  let cc = Math.round((x - OX) / CELL), r = Math.round((y - OY) / CELL);
  if (cc < 0 || cc > 8 || r < 0 || r > 9) return -1;
  if (Math.hypot(x - OX - cc * CELL, y - OY - r * CELL) > PR + 4) return -1;
  if (flip) { r = 9 - r; cc = 8 - cc; }
  return r * 9 + cc;
}

// ---------------- 棋盘与棋子预渲染 ----------------
const SC = 2;
function off(w, h) { const o = document.createElement('canvas'); o.width = w * SC; o.height = h * SC; const g = o.getContext('2d'); g.scale(SC, SC); return [o, g]; }
const [boardCv, bg] = off(W, H);
function renderBoard() {
  bg.clearRect(0, 0, W, H);
  const gr = bg.createLinearGradient(0, 0, W, H);
  gr.addColorStop(0, '#f0cf8f'); gr.addColorStop(0.5, '#e6bd77'); gr.addColorStop(1, '#d9a95f');
  bg.fillStyle = gr; KIT.roundRect(bg, 0, 0, W, H, 18); bg.fill();
  // 木纹
  bg.save(); bg.globalAlpha = 0.09; bg.strokeStyle = '#7a4a16';
  for (let i = 0; i < 38; i++) {
    bg.lineWidth = 0.6 + (i % 3) * 0.5; bg.beginPath();
    const y0 = i * 18 + 4;
    bg.moveTo(0, y0);
    for (let x = 0; x <= W; x += 20) bg.lineTo(x, y0 + Math.sin(x * 0.012 + i * 0.7) * 6 + Math.sin(x * 0.05 + i) * 1.5);
    bg.stroke();
  }
  bg.restore();
  const L = OX, Tp = OY, R = OX + 8 * CELL, B = OY + 9 * CELL;
  bg.strokeStyle = '#5a3412'; bg.lineWidth = 3; bg.strokeRect(L - 8, Tp - 8, R - L + 16, B - Tp + 16);
  bg.lineWidth = 1.4; bg.beginPath();
  for (let r = 0; r < 10; r++) { bg.moveTo(L, Tp + r * CELL); bg.lineTo(R, Tp + r * CELL); }
  for (let cc = 0; cc < 9; cc++) {
    if (cc === 0 || cc === 8) { bg.moveTo(L + cc * CELL, Tp); bg.lineTo(L + cc * CELL, B); }
    else { bg.moveTo(L + cc * CELL, Tp); bg.lineTo(L + cc * CELL, Tp + 4 * CELL); bg.moveTo(L + cc * CELL, Tp + 5 * CELL); bg.lineTo(L + cc * CELL, B); }
  }
  // 九宫斜线
  for (const r0 of [0, 7]) { bg.moveTo(L + 3 * CELL, Tp + r0 * CELL); bg.lineTo(L + 5 * CELL, Tp + (r0 + 2) * CELL); bg.moveTo(L + 5 * CELL, Tp + r0 * CELL); bg.lineTo(L + 3 * CELL, Tp + (r0 + 2) * CELL); }
  bg.stroke();
  // 兵炮位标记
  const mark = (cc, r) => {
    const x = L + cc * CELL, y = Tp + r * CELL, d = 5, l = 10;
    bg.beginPath();
    for (const sx of [-1, 1]) {
      if ((sx < 0 && cc === 0) || (sx > 0 && cc === 8)) continue;
      for (const sy of [-1, 1]) { bg.moveTo(x + sx * d, y + sy * (d + l)); bg.lineTo(x + sx * d, y + sy * d); bg.lineTo(x + sx * (d + l), y + sy * d); }
    }
    bg.stroke();
  };
  for (const [cc, r] of [[1, 2], [7, 2], [1, 7], [7, 7], [0, 3], [2, 3], [4, 3], [6, 3], [8, 3], [0, 6], [2, 6], [4, 6], [6, 6], [8, 6]]) mark(cc, r);
  // 楚河汉界
  bg.fillStyle = 'rgba(90,52,18,.78)'; bg.font = '34px ' + KAI; bg.textAlign = 'center'; bg.textBaseline = 'middle';
  const ry = Tp + 4.5 * CELL;
  bg.fillText('楚', L + 1.5 * CELL, ry); bg.fillText('河', L + 2.5 * CELL, ry);
  bg.fillText('漢', L + 5.5 * CELL, ry); bg.fillText('界', L + 6.5 * CELL, ry);
}
const PIECE = {};
function renderPieces() {
  const NR = ['', '帥', '仕', '相', '傌', '俥', '炮', '兵'], NB = ['', '將', '士', '象', '馬', '車', '砲', '卒'];
  for (const s of [1, -1]) for (let t = 1; t <= 7; t++) {
    const [o, g] = off(64, 64), x = 32, y = 32;
    const rg = g.createRadialGradient(x - 8, y - 10, 4, x, y, PR + 2);
    rg.addColorStop(0, '#fff3d6'); rg.addColorStop(0.7, '#f1d39b'); rg.addColorStop(1, '#c99a55');
    g.fillStyle = '#8a5a22'; g.beginPath(); g.arc(x, y + 2.5, PR, 0, 7); g.fill();
    g.fillStyle = rg; g.beginPath(); g.arc(x, y, PR, 0, 7); g.fill();
    g.strokeStyle = 'rgba(120,70,20,.55)'; g.lineWidth = 1.2; g.stroke();
    const col = s > 0 ? '#c0281c' : '#1d1b1a';
    g.strokeStyle = col; g.lineWidth = 1.6; g.beginPath(); g.arc(x, y, PR - 4.5, 0, 7); g.stroke();
    g.fillStyle = col; g.font = 'bold 30px ' + KAI; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText((s > 0 ? NR : NB)[t], x, y + 1.5);
    PIECE[s * t] = o;
  }
}

// ---------------- 声音 ----------------
const SFX = {
  move: () => { KIT.noise(0.05, { vol: 0.12, hp: 900, lp: 3500 }); KIT.tone(420, 0.06, { type: 'triangle', vol: 0.06, to: 300 }); },
  cap: () => { KIT.noise(0.09, { vol: 0.2, hp: 500, lp: 2800 }); KIT.tone(260, 0.12, { type: 'triangle', vol: 0.09, to: 160 }); },
  check: () => KIT.arp([880, 1175, 1568], 0.06, { type: 'square', vol: 0.05 }),
  select: () => KIT.tone(700, 0.04, { type: 'sine', vol: 0.04 }),
  bad: () => KIT.tone(200, 0.1, { type: 'square', vol: 0.03 }),
  win: () => KIT.arp([523, 659, 784, 1047, 1319], 0.1, { type: 'triangle', vol: 0.08 }),
  lose: () => KIT.arp([523, 466, 392, 330], 0.14, { type: 'triangle', vol: 0.07 })
};

// ---------------- 走子 ----------------
const isHumanTurn = () => state === 'play' && !anim && !thinking && (mode === 'pvp' || pos.side === humanSide);
function doMove(m) {
  const note = XQ.notation(pos, m, AMG.lang === 'en'), f = m >> 8, t = m & 255, piece = pos.b[f], cap = pos.b[t];
  anim = { m, piece, cap, t: 0, dur: 0.24, from: sqXY(f), to: sqXY(t) };
  pos.make(m);
  hist.push({ m, note, side: piece > 0 ? 1 : -1 });
  noCap = cap ? 0 : noCap + 1;
  lastMove = m; hintMove = 0; sel = -1; targets = [];
  renderMoves(); syncStatus();
}
function finishMove() {
  const a = anim; anim = null;
  const [tx, ty] = a.to;
  if (a.cap) {
    SFX.cap();
    fx.burst(tx, ty, { n: 16, color: ['#e8c486', '#b98a4a', '#7a4a16', '#fff1cf'], speed: 170, life: 0.55, size: 4, gravity: 380, shape: 'square' });
    shake = 4;
  } else SFX.move();
  const chk = pos.inCheck(pos.side);
  const legal = pos.legal();
  if (!legal.length) { endGame(-pos.side, chk ? 'mate' : 'stalemate'); return; }
  if (chk) { stamp = { text: T('check'), t: 0, col: '#d23a2a' }; SFX.check(); shake = 6; }
  if (pos.isRep(2)) { endGame(0, 'rep'); return; }
  if (noCap >= 120) { endGame(0, 'limit'); return; }
  if (mode === 'puzzle' && a.piece > 0) {
    puzzleLeft--;
    if (puzzleLeft <= 0) { endGame(-1, 'pzFail'); return; }
  }
  syncStatus();
  if (mode !== 'pvp' && pos.side !== humanSide) askAI(false);
}
function endGame(winner, why) {
  state = 'over'; thinking = false; sel = -1; targets = [];
  result = { winner, why };
  KIT.stopMusic();
  const human = mode === 'pvp' ? 0 : humanSide;
  const good = mode === 'pvp' ? winner !== 0 : winner === human;
  if (mode === 'ai') {
    const k = winner === 0 ? 'd' : winner === human ? 'w' : 'l';
    rec[k][level]++; store.set('rec', rec);
  }
  if (mode === 'puzzle' && winner === 1 && !solved.includes(puzzleIdx)) { solved.push(puzzleIdx); store.set('solved', solved); }
  stamp = { text: why === 'mate' ? T('mateStamp') : why === 'stalemate' ? T('staleStamp') : winner === 0 ? T('drawStamp') : why === 'resign' ? T('resignStamp') : T('overStamp'), t: 0, col: winner === 0 ? '#3a6a9a' : '#d23a2a' };
  if (winner !== 0 && good) SFX.win(); else SFX.lose();
  setTimeout(() => showOver(), 1300);
  syncStatus();
}
function rebuild() {
  pos = new XQ.Pos(startFen);
  noCap = 0;
  for (const h of hist) { noCap = pos.b[h.m & 255] ? 0 : noCap + 1; pos.make(h.m); }
  lastMove = hist.length ? hist[hist.length - 1].m : 0;
}
function undo() {
  if (state !== 'play' || anim || !hist.length) return;
  cancelAI();
  let n = mode === 'pvp' ? 1 : (pos.side === humanSide ? 2 : 1);
  n = Math.min(n, hist.length);
  for (let i = 0; i < n; i++) { const h = hist.pop(); if (mode === 'puzzle' && h.side > 0) puzzleLeft++; }
  rebuild(); sel = -1; targets = []; hintMove = 0;
  renderMoves(); syncStatus();
  if (mode !== 'pvp' && pos.side !== humanSide) askAI(false);
}
function clickSq(sq) {
  if (!isHumanTurn() || sq < 0) return;
  const p = pos.b[sq];
  if (sel >= 0 && targets.includes(sq)) { doMove((sel << 8) | sq); return; }
  if (p && (p > 0 ? 1 : -1) === pos.side) {
    if (sel === sq) { sel = -1; targets = []; return; }
    sel = sq; targets = pos.legal().filter(m => (m >> 8) === sq).map(m => m & 255);
    SFX.select();
    if (!targets.length) SFX.bad();
    return;
  }
  if (sel >= 0) { sel = -1; targets = []; SFX.bad(); }
}

// ---------------- 绘制 ----------------
function drawPiece(p, x, y, sc = 1, alpha = 1) {
  c.globalAlpha = alpha;
  c.drawImage(PIECE[p], x - 32 * sc, y - 32 * sc, 64 * sc, 64 * sc);
  c.globalAlpha = 1;
}
function corner(x, y, col) {
  const d = 28, l = 9;
  c.strokeStyle = col; c.lineWidth = 2.5; c.beginPath();
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) { c.moveTo(x + sx * d, y + sy * (d - l)); c.lineTo(x + sx * d, y + sy * d); c.lineTo(x + sx * (d - l), y + sy * d); }
  c.stroke();
}
function arrow(m, col) {
  const [x1, y1] = sqXY(m >> 8), [x2, y2] = sqXY(m & 255), a = Math.atan2(y2 - y1, x2 - x1), len = Math.hypot(x2 - x1, y2 - y1) - 18;
  c.save(); c.translate(x1, y1); c.rotate(a);
  c.globalAlpha = 0.6 + 0.3 * Math.sin(performance.now() / 160);
  c.fillStyle = col; c.beginPath();
  c.moveTo(0, -5); c.lineTo(len - 16, -5); c.lineTo(len - 16, -13); c.lineTo(len, 0); c.lineTo(len - 16, 13); c.lineTo(len - 16, 5); c.lineTo(0, 5); c.closePath(); c.fill();
  c.restore(); c.globalAlpha = 1;
}
function render(dt) {
  c.clearRect(0, 0, W, H);
  c.save();
  if (shake > 0) { c.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake); shake = Math.max(0, shake - dt * 30); }
  c.drawImage(boardCv, 0, 0, W, H);
  // 坐标
  c.font = 'bold 11px ' + DISP; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = 'rgba(90,52,18,.7)';
  const RN = '九八七六五四三二一';
  for (let i = 0; i < 9; i++) {
    const topS = flip ? RN[i] : String(i + 1), botS = flip ? String(i + 1) : RN[i];
    c.fillText(topS, OX + i * CELL, 11); c.fillText(botS, OX + i * CELL, H - 10);
  }
  if (lastMove) { corner(...sqXY(lastMove >> 8), 'rgba(40,120,200,.55)'); corner(...sqXY(lastMove & 255), 'rgba(40,120,200,.95)'); }
  // 被将军的将帅红光
  if (state === 'play' && pos.inCheck(pos.side)) {
    const [kx, ky] = sqXY(pos.kp[pos.side > 0 ? 0 : 1]), k = 0.5 + 0.5 * Math.sin(performance.now() / 120);
    const g = c.createRadialGradient(kx, ky, 10, kx, ky, 46); g.addColorStop(0, `rgba(255,40,30,${0.45 * k + 0.2})`); g.addColorStop(1, 'rgba(255,40,30,0)');
    c.fillStyle = g; c.beginPath(); c.arc(kx, ky, 46, 0, 7); c.fill();
  }
  const animTo = anim ? anim.m & 255 : -1;
  for (let sq = 0; sq < 90; sq++) {
    const p = pos.b[sq];
    if (!p || sq === animTo || sq === sel) continue;
    const [x, y] = sqXY(sq); drawPiece(p, x, y);
  }
  // 可走位置
  for (const t of targets) {
    const [x, y] = sqXY(t);
    if (pos.b[t]) { c.strokeStyle = 'rgba(220,50,40,.9)'; c.lineWidth = 3; c.beginPath(); c.arc(x, y, PR + 3, 0, 7); c.stroke(); }
    else { c.fillStyle = 'rgba(40,150,90,.75)'; c.beginPath(); c.arc(x, y, 7, 0, 7); c.fill(); c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 1.5; c.stroke(); }
  }
  if (sel >= 0) {
    const [x, y] = sqXY(sel), k = Math.sin(performance.now() / 200);
    c.fillStyle = 'rgba(0,0,0,.18)'; c.beginPath(); c.ellipse(x + 3, y + 8, PR, PR * 0.85, 0, 0, 7); c.fill();
    c.shadowColor = 'rgba(255,210,90,.9)'; c.shadowBlur = 16 + k * 4;
    drawPiece(pos.b[sel], x, y - 4, 1.08);
    c.shadowBlur = 0;
  }
  if (anim) {
    anim.t += dt;
    const k = Math.min(1, anim.t / anim.dur), e = KIT.ease.inOut(k);
    const x = anim.from[0] + (anim.to[0] - anim.from[0]) * e, y = anim.from[1] + (anim.to[1] - anim.from[1]) * e, lift = Math.sin(k * Math.PI);
    if (anim.cap) drawPiece(anim.cap, anim.to[0], anim.to[1], 1, 1 - k * 0.6);
    c.fillStyle = `rgba(0,0,0,${0.15 + lift * 0.12})`; c.beginPath(); c.ellipse(x + 3 + lift * 6, y + 6 + lift * 8, PR, PR * 0.85, 0, 0, 7); c.fill();
    drawPiece(anim.piece, x, y - lift * 8, 1 + lift * 0.12);
    if (k >= 1) finishMove();
  }
  if (hintMove) arrow(hintMove, 'rgba(230,160,20,.95)');
  fx.update(dt); fx.draw(c);
  c.restore();
  if (stamp) {
    stamp.t += dt;
    const k = stamp.t, sc = k < 0.25 ? 2.2 - KIT.ease.outBack(k / 0.25) * 1.2 : 1, a = k > 1.2 ? Math.max(0, 1 - (k - 1.2) / 0.4) : 1;
    if (state === 'over' && k > 1.2) stamp.t = 1.2;
    c.save(); c.translate(W / 2, H / 2); c.rotate(-0.12); c.scale(sc, sc); c.globalAlpha = a * 0.92;
    c.font = '64px ' + KAI; c.textAlign = 'center'; c.textBaseline = 'middle';
    const w = c.measureText(stamp.text).width + 44;
    c.strokeStyle = stamp.col; c.lineWidth = 5; KIT.roundRect(c, -w / 2, -48, w, 96, 14); c.stroke();
    c.fillStyle = stamp.col; c.fillText(stamp.text, 0, 4);
    c.restore();
    if (a <= 0) stamp = null;
  }
}
let last = performance.now();
function frame(now) { const dt = Math.min(0.05, (now - last) / 1000); last = now; render(dt); requestAnimationFrame(frame); }

// ---------------- DOM：状态 / 棋谱 ----------------
function syncStatus() {
  const el = $('status');
  let s;
  if (state === 'menu') s = T('stMenu');
  else if (state === 'over' && result) s = result.winner === 0 ? T('rDraw') : result.winner > 0 ? T('rRed') : T('rBlack');
  else if (thinking) s = T('thinking');
  else if (pendingHint) s = T('hinting');
  else s = (pos.side > 0 ? T('redTurn') : T('blackTurn')) + (mode === 'puzzle' ? ' · ' + T('pzLeft', puzzleLeft) : '');
  el.textContent = s;
  el.classList.toggle('busy', thinking || !!pendingHint);
  el.classList.toggle('red', pos.side > 0 && state === 'play');
  $('btn-undo').disabled = state !== 'play' || !hist.length;
  $('btn-hint').disabled = state !== 'play' || !isHumanTurn();
  $('btn-resign').disabled = state !== 'play';
}
function renderMoves() {
  const ol = $('moves');
  if (!hist.length) { ol.innerHTML = `<li class="empty">${T('noMoves')}</li>`; return; }
  let html = '';
  const off0 = new XQ.Pos(startFen).side < 0 ? 1 : 0;
  for (let i = 0; i < hist.length + off0; i += 2) {
    const a = i - off0 >= 0 ? hist[i - off0] : null, b = hist[i + 1 - off0];
    html += `<li><i>${i / 2 + 1}.</i><span class="r">${a ? a.note : '…'}</span><span class="b">${b ? b.note : ''}</span></li>`;
  }
  ol.innerHTML = html;
  ol.scrollTop = ol.scrollHeight;
}

// ---------------- 菜单 / 流程 ----------------
function hideScreens() { ['screen-menu', 'screen-over'].forEach(id => $(id).classList.add('hidden')); }
function newGame() {
  cancelAI(); hideScreens(); KIT.audio();
  state = 'play'; hist = []; sel = -1; targets = []; hintMove = 0; stamp = null; result = null; fx.clear();
  if (mode === 'puzzle') { const P = PUZZLES[puzzleIdx]; startFen = P.fen; puzzleLeft = P.n; humanSide = 1; }
  else { startFen = XQ.START_FEN; if (mode === 'pvp') humanSide = 1; else humanSide = store.get('side', 1); }
  flip = mode === 'ai' && humanSide < 0;
  rebuild(); startTime = Date.now();
  renderMoves(); syncStatus();
  KIT.music('zen-board');
  if (mode === 'puzzle') stamp = { text: T('pzStamp', PUZZLES[puzzleIdx].n), t: 0, col: '#b0401c' };
  if (mode === 'ai' && pos.side !== humanSide) setTimeout(() => askAI(false), 500);
}
function toMenu() { cancelAI(); hideScreens(); state = 'menu'; KIT.stopMusic(); renderMenu(); syncStatus(); $('screen-menu').classList.remove('hidden'); }
function showOver() {
  if (state !== 'over') return;
  const r = result, human = mode === 'pvp' ? 0 : humanSide;
  let title, emo;
  if (mode === 'puzzle') { title = r.winner === 1 ? T('pzWin') : T('pzLose'); emo = r.winner === 1 ? '🏆' : '💭'; }
  else if (r.winner === 0) { title = T('rDraw'); emo = '🤝'; }
  else if (mode === 'pvp') { title = r.winner > 0 ? T('rRed') : T('rBlack'); emo = '🏆'; }
  else { title = r.winner === human ? T('youWin') : T('youLose'); emo = r.winner === human ? '🏆' : '😤'; }
  $('over-emo').textContent = emo; $('over-title').textContent = title;
  $('over-sub').textContent = T('why_' + r.why);
  const secs = Math.round((Date.now() - startTime) / 1000);
  const rows = [[T('stMoves'), Math.ceil(hist.length / 2)], [T('stTime'), Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0')]];
  if (mode === 'ai') rows.push([T('stRec', T('lvNames')[level]), `${rec.w[level]} / ${rec.d[level]} / ${rec.l[level]}`]);
  if (mode === 'puzzle') rows.push([T('stSolved'), solved.length + ' / ' + PUZZLES.length]);
  $('over-stats').innerHTML = rows.map(([a, b]) => `<span>${a}</span><b>${b}</b>`).join('');
  $('btn-next').classList.toggle('hidden', !(mode === 'puzzle' && r.winner === 1 && puzzleIdx < PUZZLES.length - 1));
  $('screen-over').classList.remove('hidden');
}
function renderMenu() {
  document.querySelectorAll('#mode-seg button').forEach(b => b.classList.toggle('on', b.dataset.m === mode));
  document.querySelectorAll('#side-seg button').forEach(b => b.classList.toggle('on', +b.dataset.s === store.get('side', 1)));
  document.querySelectorAll('#lv-seg button').forEach(b => b.classList.toggle('on', +b.dataset.l === level));
  $('ai-opts').classList.toggle('hidden', mode !== 'ai');
  $('pz-opts').classList.toggle('hidden', mode !== 'puzzle');
  const box = $('pz-pick'); box.innerHTML = '';
  PUZZLES.forEach((p, i) => {
    const b = document.createElement('button');
    b.className = 'lvl-btn' + (i === puzzleIdx ? ' active' : '') + (solved.includes(i) ? ' done' : '');
    b.innerHTML = `<span class="lv-emo">${solved.includes(i) ? '✅' : '♟️'}</span>${i + 1}<small>${T('pzN', p.n)}</small>`;
    b.title = T('pzNames')[i];
    b.onclick = () => { puzzleIdx = i; store.set('pz', i); renderMenu(); };
    box.appendChild(b);
  });
  $('pz-name').textContent = T('pzNames')[puzzleIdx] + ' · ' + T('pzN', PUZZLES[puzzleIdx].n);
  const tot = rec.w.reduce((a, b) => a + b, 0);
  $('menu-best').textContent = T('menuRec', tot, solved.length);
}
document.querySelectorAll('#mode-seg button').forEach(b => b.onclick = () => { mode = b.dataset.m; store.set('mode', mode); renderMenu(); });
document.querySelectorAll('#side-seg button').forEach(b => b.onclick = () => { store.set('side', +b.dataset.s); renderMenu(); });
document.querySelectorAll('#lv-seg button').forEach(b => b.onclick = () => { level = +b.dataset.l; store.set('level', level); renderMenu(); });
$('btn-start').onclick = newGame;
$('btn-again').onclick = newGame;
$('btn-next').onclick = () => { puzzleIdx++; store.set('pz', puzzleIdx); newGame(); };
$('btn-view').onclick = () => $('screen-over').classList.add('hidden');
$('btn-menu').onclick = toMenu;
$('btn-undo').onclick = undo;
$('btn-hint').onclick = () => { if (isHumanTurn() && !pendingHint) askAI(true); };
$('btn-flip').onclick = () => { flip = !flip; };
$('btn-resign').onclick = () => {
  if (state !== 'play') return;
  if (!confirm(T('resignAsk'))) return;
  cancelAI();
  endGame(mode === 'pvp' ? -pos.side : -humanSide, 'resign');
};
$('btn-home').onclick = toMenu;
cv.addEventListener('pointerdown', e => { const p = KIT.point(cv, e, W, H); clickSq(xySq(p.x, p.y)); });
document.addEventListener('keydown', e => {
  if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
  if (state === 'menu' && e.code === 'Enter') { newGame(); return; }
  if (state !== 'play') return;
  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ' || e.code === 'KeyU') { e.preventDefault(); undo(); }
  else if (e.code === 'KeyH') $('btn-hint').click();
  else if (e.code === 'KeyF') flip = !flip;
  else if (e.code === 'Escape') { sel = -1; targets = []; }
});

if (location.hash === '#debug') window.__xq = {
  info: () => ({ state, mode, side: pos.side, fen: pos.fen(), moves: hist.map(h => h.note), thinking, result }),
  play: (from, to) => clickSq(from) || clickSq(to),
  move: m => doMove(m),
  legal: () => pos.legal(),
  fen: f => { startFen = f; hist = []; rebuild(); renderMoves(); syncStatus(); },
  XQ
};
renderBoard(); renderPieces();
const syncMute = KIT.mountMute($('btn-mute'));
function renotate() {
  const p = new XQ.Pos(startFen);
  for (const h of hist) { h.note = XQ.notation(p, h.m, AMG.lang === 'en'); p.make(h.m); }
  renderMoves();
}
KIT.boot(() => { syncMute(); renderMenu(); syncStatus(); renotate(); });
renderMenu(); renderMoves(); syncStatus();
// 字体加载后重绘棋子（楷体 / 标题字体）
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { renderBoard(); renderPieces(); });
requestAnimationFrame(frame);
})();
