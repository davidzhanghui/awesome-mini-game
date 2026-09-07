(() => {
// 泡泡龙：六角网格 + 瞄准发射 + 边墙反弹 + 3连消 + 孤块掉落 + 天花板下压 + 多关卡
const STR = window.GAME_STR || { zh: {}, en: {} };
const T = (k, ...a) => AMG.tf(STR, k, ...a);
const W = 480, H = 640, R = 17, TOP = 64, BOT = 560, SHOOT_Y = 596;
const COLS = 13;
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const $ = id => document.getElementById(id);
const dpr = Math.min(window.devicePixelRatio || 1, 2);
canvas.width = W * dpr; canvas.height = H * dpr;
ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

const COLORS = ['#ff5d5d', '#ffd93d', '#3a8dde', '#5ee66e', '#c86bff', '#ff8c42'];
const store = {
  get best() { return +(localStorage.getItem('bubble-best') || 0); },
  set best(v) { localStorage.setItem('bubble-best', v); },
  get muted() { return localStorage.getItem('bubble-muted') === '1'; },
  set muted(v) { localStorage.setItem('bubble-muted', v ? '1' : '0'); }
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
    g.gain.setValueAtTime(vol || .09, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(.001, actx.currentTime + dur);
    o.connect(g); g.connect(actx.destination); o.start(); o.stop(actx.currentTime + dur);
  } catch (e) {}
}
const sfx = {
  shoot: () => tone(600, .1, 'square', .07, 300),
  bounce: () => tone(400, .06, 'square', .05),
  stick: () => tone(300, .07, 'triangle', .08),
  pop: n => { tone(700 + Math.min(n, 8) * 80, .12, 'sine', .1); },
  drop: () => tone(250, .2, 'sine', .08, -120),
  win: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, .14, 'sine', .09), i * 100)),
  over: () => [400, 300, 200].forEach((f, i) => setTimeout(() => tone(f, .2, 'sine', .09), i * 140))
};

const G = {
  state: 'menu', stage: 1, score: 0, grid: [], rows: 0,
  angle: -Math.PI / 2, cur: 0, next: 1, flying: null,
  shots: 0, dropEvery: 6, parts: [], floats: [], msg: '', msgT: 0, aimX: W / 2, aimY: 200
};
const rowY = r => TOP + r * R * 1.72 + G.dropOff;
const colX = (r, c) => R + 4 + c * (R * 2 + 2) + (r % 2 ? R + 1 : 0);

// 30 张手写固定关卡（致敬原版：教学 → 经典造型 → 高密度）
// 字符：. 空，R红 Y黄 B蓝 G绿 P紫 O橙；偶数行13列，奇数行12列
const FIXED_STAGES = [
  ['RRRRRRRRRRRRR', 'RRRRRRRRRRRR', 'RRRRRRRRRRRRR'], // 1 全红教学
  ['YYYYYYYYYYYYY', 'YYYYYYYYYYYY', 'RRRRRRRRRRRRR', 'RRRRRRRRRRRR'], // 2 双色分层
  ['RBRBRBRBRBRBR', 'BRBRBRBRBRBR', 'RBRBRBRBRBRBR'], // 3 红蓝相间
  ['GGGGGGGGGGGGG', 'GYYYYYYYYYYG', 'GYRRRRRRRRYG', 'GYRBBBBBRYG'], // 4 同心框
  ['..RRRRRRR..', '.RYYYYYYYR.', 'RYBBBBBBBYR', 'RYBGGGGGYBR'], // 5 彩虹山
  ['BBBBBBBBBBBBB', 'BGGGGGGGGGB', 'BGPPPPPPPGB', 'BGPGOOOGPGB'], // 6 城堡外墙
  ['.....R.....', '....RRR....', '...RRRRR...', '..RRRRRRR..', '.RRRRRRRRR.'], // 7 箭头向下
  ['PPPPPPPPPPPPP', 'POOOOOOOOOOP', 'POYYYYYYYOP', 'POYBBBBBYOP', 'POYBGGBGYOP'], // 8 嵌套菱形
  ['RBYGPRBYGPRBY', 'YGPBRYYGPBR', 'BRYGPBRYGPBR', 'GPBRYGPBRYG'], // 9 彩虹杂烩
  ['.....GGG.....', '....GGGGG...', '...GGGGGGG..', '..GGGBBBGGG.', '.GGGBBBBBBGG'], // 10 圣诞树
  ['BBBBB...BBBBB', 'BBBB.....BBB', 'BBB..RRR..BB', 'BB..RRRRR..B'], // 11 双峰夹红
  ['OOOOOOOOOOOOO', 'ORRRRRRRRRRO', 'ORYBBBBBYRO', 'ORYBGGGBYRO', 'ORYBGPGGBYR'], // 12 火焰纹章
  ['G.G.G.G.G.G.G', '.P.P.P.P.P.P', 'G.G.G.G.G.G.G', '.P.P.P.P.P.P', 'G.G.G.G.G.G.G'], // 13 棋盘点阵
  ['....BBBBB....', '...BBYYYBB..', '..BBYYYYYBB.', '..BYYRRRYYB.', '..BYYRRRYYB'], // 14 笑脸
  ['RRRBBBBBRRRR', 'RRBBBBBBBRBR', 'RBBBBBBBBBR', 'RBBBGGGBBBR', 'RBBBGGGBBBR'], // 15 蓝宝石
  ['PPPPPPPPPPPPP', 'PBBBBBBBBBBP', 'PBBBBBBBRBBP', 'PBRBGGGBRBP'], // 16 紫框迷宫
  ['..OOO...OOO..', '.OOOOO.OOOOO', 'OOOOOOOOOOOOO', '.OOOOOOOOOOO', '..OOOOOOO..'], // 17 双环
  ['YBYBYBYBYBYBY', 'BYBYBYBYBYBY', 'YBYBYBYBYBYBY', 'BYBYBYBYBYBY', 'RBBBBBBBBRBR'], // 18 黄蓝潮+红底
  ['.....P.....', '....PPP....', '...PPPPP...', '..PPPPPPP..', '.PPPPPPPPP.', 'PPPPPPPPPPP'], // 19 紫三角
  ['GGGGGGGGGGGGG', 'GRRRRRRRRRRG', 'GRYBBBBBYRR', 'GRYBGGGBYRG', 'GRYBGGGBYRG'], // 20 绿野迷宫
  ['R............', 'RR..........', 'RRRBBBBBBBBB', 'RRBBBBBBBBBB', 'RBBBBBBBBBBB'], // 21 红色闪电
  ['PPPPPPPPPPPPP', 'PGGGGGGGGGGP', 'PGYYYYYYYGGP', 'PGYRRRRRYGP', 'PGYRBBBRYGP'], // 22 螺旋（简化）
  ['OOOOO...OOOOO', 'OOOO.....OOO', 'OOO..GGG..OO', 'OO..GGGGG..O', 'O...GGGGG...'], // 23 橙色峡谷
  ['BBRBBBRBBBRBB', 'BRBBBRBBBRB', 'RBBBRBBBRBBR', 'BBBRBBBRBBBR'], // 24 红蓝编织
  ['.....Y.....', '....YYY....', '...YYYYY...', '..YYYBYYY..', '.YYYBBBYYY.', 'YYBBBBBBYY'], // 25 王冠
  ['GGGGGGGGGGGGG', 'GPPPPPPPPPPG', 'GPORRRRROPOG', 'GPORYBBYROPG', 'GPORYBBYROP'], // 26 终极徽章
  ['R.Y.B.G.P.O.R', '.O.R.Y.B.G.P', 'P.O.R.Y.B.G.', '.G.P.O.R.Y.B', 'B.G.P.O.R.Y.'], // 27 六色彩虹斜
  ['.....BBB.....', '....BBBBB...', '...BBRRRBB..', '..BBRRRRRBB.', '..BBRRRRRBB'], // 28 蓝宝石II
  ['PPPPPPPPPPPPP', 'POOOOOOOOOOP', 'POYGGGGGYOP', 'POYGBBBGYOP', 'POYGBBBGYOP'], // 29 皇冠II
  ['RRRRRRRRRRRRR', 'RYYYYYYYYYYR', 'RYBBBBBBBYRR', 'RYBGGGGGBYR', 'RYBGPGGPGBY'], // 30 最终堡垒
];
const COLORMAP = { R: 0, Y: 1, B: 2, G: 3, P: 4, O: 5 };
function genStage(stage) {
  const fixed = FIXED_STAGES[(stage - 1) % FIXED_STAGES.length];
  const loop = Math.floor((stage - 1) / FIXED_STAGES.length); // 30关后循环，颜色数+1
  G.grid = [];
  G.dropOff = 0;
  fixed.forEach((line, r) => {
    const n = r % 2 ? COLS - 1 : COLS;
    const pad = n - line.length;
    const left = pad > 0 ? Math.floor(pad / 2) : 0;
    const aligned = pad > 0 ? ('.'.repeat(left) + line + '.'.repeat(pad - left)) : line.slice(0, n);
    const row = [];
    for (let c = 0; c < n; c++) {
      const ch = aligned[c] || '.';
      if (ch === '.') { row.push(-1); continue; }
      let v = COLORMAP[ch];
      if (v === undefined) v = 0;
      // 循环轮次：颜色轮转，增加变化
      if (loop > 0) v = (v + loop) % 6;
      row.push(v);
    }
    G.grid.push(row);
  });
  const present = new Set();
  G.grid.flat().forEach(v => { if (v >= 0) present.add(v); });
  const arr = [...present];
  G.cur = arr[Math.random() * arr.length | 0] ?? 0;
  G.next = arr[Math.random() * arr.length | 0] ?? 0;
  G.shots = 0;
  G.dropEvery = Math.max(4, 7 - Math.floor(stage / 4));
}
function reset() {
  G.score = 0; G.stage = 1;
  G.parts = []; G.floats = []; G.flying = null;
  G.angle = -Math.PI / 2;
  genStage(1);
}
function neighbors(r, c) {
  const odd = r % 2 === 1;
  const d = odd
    ? [[0, 1], [0, -1], [-1, 0], [-1, 1], [1, 0], [1, 1]]
    : [[0, 1], [0, -1], [-1, -1], [-1, 0], [1, -1], [1, 0]];
  const out = [];
  for (const [dr, dc] of d) {
    const nr = r + dr, nc = c + dc;
    if (nr < 0 || nr >= G.grid.length) continue;
    if (nc < 0 || nc >= G.grid[nr].length) continue;
    out.push([nr, nc]);
  }
  return out;
}
function findCluster(r, c) {
  const color = G.grid[r][c];
  if (color < 0) return [];
  const seen = new Set([r + ',' + c]), q = [[r, c]];
  while (q.length) {
    const [cr, cc] = q.pop();
    for (const [nr, nc] of neighbors(cr, cc)) {
      const k = nr + ',' + nc;
      if (!seen.has(k) && G.grid[nr][nc] === color) { seen.add(k); q.push([nr, nc]); }
    }
  }
  return [...seen].map(k => k.split(',').map(Number));
}
function findFloating() {
  const connected = new Set(), q = [];
  if (G.grid.length) {
    for (let c = 0; c < G.grid[0].length; c++) {
      if (G.grid[0][c] >= 0) { connected.add('0,' + c); q.push([0, c]); }
    }
  }
  while (q.length) {
    const [cr, cc] = q.pop();
    for (const [nr, nc] of neighbors(cr, cc)) {
      const k = nr + ',' + nc;
      if (!connected.has(k) && G.grid[nr][nc] >= 0) { connected.add(k); q.push([nr, nc]); }
    }
  }
  const floating = [];
  G.grid.forEach((row, r) => row.forEach((v, c) => {
    if (v >= 0 && !connected.has(r + ',' + c)) floating.push([r, c]);
  }));
  return floating;
}
function attach(r, c, color) {
  while (G.grid.length <= r) {
    const nr = G.grid.length;
    const n = nr % 2 ? COLS - 1 : COLS;
    G.grid.push(new Array(n).fill(-1));
  }
  if (c >= G.grid[r].length) c = G.grid[r].length - 1;
  if (c < 0) c = 0;
  G.grid[r][c] = color;
  sfx.stick();
  // 消除
  const cluster = findCluster(r, c);
  if (cluster.length >= 3) {
    for (const [cr, cc] of cluster) {
      burst(colX(cr, cc), rowY(cr), color);
      G.grid[cr][cc] = -1;
    }
    const pts = cluster.length * 10 * G.stage;
    G.score += pts;
    float(colX(r, c), rowY(r) - 10, '+' + pts);
    sfx.pop(cluster.length);
    // 孤块掉落
    const floating = findFloating();
    if (floating.length) {
      for (const [fr, fc] of floating) {
        drop(colX(fr, fc), rowY(fr), G.grid[fr][fc]);
        G.grid[fr][fc] = -1;
      }
      const dp = floating.length * 20 * G.stage;
      G.score += dp;
      sfx.drop();
    }
  }
  // 空行裁剪
  while (G.grid.length && G.grid[G.grid.length - 1].every(v => v < 0)) G.grid.pop();
  G.shots++;
  if (G.shots >= G.dropEvery) {
    G.shots = 0;
    G.dropOff += R * 1.72;
    // 下压后检查失败
    if (G.grid.length && rowY(G.grid.length - 1) + R >= BOT) { gameOver(); return; }
  }
  // 选下一发（只选场上存在的颜色）
  const present = new Set();
  G.grid.flat().forEach(v => { if (v >= 0) present.add(v); });
  if (!present.size) { stageClear(); return; }
  const arr = [...present];
  G.cur = G.next !== undefined && present.has(G.next) ? G.next : arr[Math.random() * arr.length | 0];
  G.next = arr[Math.random() * arr.length | 0];
  // 失败检查：最低泡泡过线
  if (G.grid.length && rowY(G.grid.length - 1) + R >= BOT) gameOver();
}
function burst(x, y, color) {
  for (let i = 0; i < 8; i++) {
    const a = Math.random() * 6.28, sp = 60 + Math.random() * 160;
    G.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, age: 0, life: .5, c: COLORS[color] });
  }
}
function drop(x, y, color) {
  G.parts.push({ x, y, vx: (Math.random() - .5) * 60, vy: 40, age: 0, life: 1.2, c: COLORS[color], fall: true, r: R - 2 });
}
function float(x, y, text) { G.floats.push({ x, y, text, age: 0 }); }
function shoot() {
  if (G.state !== 'play' || G.flying) return;
  const sx = W / 2, sy = SHOOT_Y;
  G.flying = { x: sx, y: sy, vx: Math.cos(G.angle) * 620, vy: Math.sin(G.angle) * 620, color: G.cur };
  sfx.shoot();
}
function snapToGrid(x, y) {
  // 找最近的空格子
  let best = null, bd = 1e9;
  for (let r = 0; r < G.grid.length + 1; r++) {
    const n = r % 2 ? COLS - 1 : COLS;
    for (let c = 0; c < n; c++) {
      if (r < G.grid.length && G.grid[r][c] >= 0) continue;
      const dx = x - colX(r, c), dy = y - rowY(r);
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = [r, c]; }
    }
  }
  return best || [0, 0];
}
function update(dt) {
  if (G.state !== 'play') return;
  for (let i = G.parts.length - 1; i >= 0; i--) {
    const p = G.parts[i];
    p.age += dt;
    if (p.age > p.life) { G.parts.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vy += (p.fall ? 900 : 300) * dt;
  }
  for (let i = G.floats.length - 1; i >= 0; i--) {
    const f = G.floats[i];
    f.age += dt; f.y -= 50 * dt;
    if (f.age > 1) G.floats.splice(i, 1);
  }
  const f = G.flying;
  if (!f) return;
  f.x += f.vx * dt; f.y += f.vy * dt;
  if (f.x < R + 2) { f.x = R + 2; f.vx = -f.vx; sfx.bounce(); }
  if (f.x > W - R - 2) { f.x = W - R - 2; f.vx = -f.vx; sfx.bounce(); }
  if (f.y <= rowY(0) + R * .8) {
    const [r, c] = snapToGrid(f.x, f.y);
    G.flying = null;
    attach(Math.max(0, r), c, f.color);
    return;
  }
  // 碰撞场上泡泡
  for (let r = 0; r < G.grid.length; r++) {
    for (let c = 0; c < G.grid[r].length; c++) {
      if (G.grid[r][c] < 0) continue;
      const dx = f.x - colX(r, c), dy = f.y - rowY(r);
      if (dx * dx + dy * dy < (R * 2 - 3) * (R * 2 - 3)) {
        const [nr, nc] = snapToGrid(f.x, f.y);
        G.flying = null;
        attach(nr, nc, f.color);
        return;
      }
    }
  }
  if (f.y > H - 8) {
    const [r, c] = snapToGrid(f.x, Math.min(f.y, BOT - R));
    G.flying = null;
    attach(r, c, f.color);
  }
}
function stageClear() {
  G.state = 'clear';
  const bonus = 500 * G.stage;
  G.score += bonus;
  if (G.score > store.best) store.best = G.score;
  sfx.win();
  $('clear-lv').textContent = G.stage;
  $('clear-stats').innerHTML = T('clearStats', bonus, G.score);
  setTimeout(() => showScreen('clear'), 400);
}
function gameOver() {
  if (G.state !== 'play') return;
  G.state = 'over';
  if (G.score > store.best) store.best = G.score;
  sfx.over();
  $('over-title').textContent = 'GAME OVER';
  $('final-score').textContent = G.score;
  $('final-stage').textContent = G.stage;
  setTimeout(() => showScreen('over'), 400);
}
function showScreen(name) {
  for (const k of ['screen-menu', 'screen-pause', 'screen-over', 'screen-clear'])
    $(k).classList.toggle('hidden', k !== 'screen-' + name);
  if (!name) for (const k of ['screen-menu', 'screen-pause', 'screen-over', 'screen-clear']) $(k).classList.add('hidden');
}
function startGame() {
  reset();
  G.state = 'play';
  showScreen(null);
  $('menu-best').textContent = T('best', Math.max(store.best, G.score));
}
function togglePause() {
  if (G.state === 'play') { G.state = 'pause'; showScreen('pause'); }
  else if (G.state === 'pause') { G.state = 'play'; showScreen(null); }
}

canvas.addEventListener('pointermove', e => {
  const r = canvas.getBoundingClientRect();
  const px = (e.clientX - r.left) / r.width * W, py = (e.clientY - r.top) / r.height * H;
  G.aimX = px; G.aimY = py;
  const a = Math.atan2(py - SHOOT_Y, px - W / 2);
  G.angle = Math.max(-Math.PI + .15, Math.min(-.15, a));
});
canvas.addEventListener('pointerdown', e => {
  const r = canvas.getBoundingClientRect();
  const px = (e.clientX - r.left) / r.width * W, py = (e.clientY - r.top) / r.height * H;
  const a = Math.atan2(py - SHOOT_Y, px - W / 2);
  G.angle = Math.max(-Math.PI + .15, Math.min(-.15, a));
  if (G.state === 'play') shoot();
  else if (G.state === 'pause') togglePause();
});
window.addEventListener('keydown', e => {
  if (e.code === 'ArrowLeft') { e.preventDefault(); G.angle = Math.max(-Math.PI + .15, G.angle - .09); }
  else if (e.code === 'ArrowRight') { e.preventDefault(); G.angle = Math.min(-.15, G.angle + .09); }
  else if (e.code === 'Space') { e.preventDefault(); if (G.state === 'play') shoot(); else if (G.state === 'menu') startGame(); }
  else if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
  else if (e.code === 'KeyM') toggleMute();
  else if (e.code === 'KeyR' || e.code === 'Enter') { if (G.state === 'over') startGame(); else if (G.state === 'menu') startGame(); }
});
$('btn-start').onclick = () => startGame();
$('btn-retry').onclick = () => startGame();
$('btn-next').onclick = () => { G.stage++; genStage(G.stage); G.state = 'play'; showScreen(null); };
$('btn-menu').onclick = () => { G.state = 'menu'; showScreen('menu'); };
$('btn-menu2').onclick = () => { G.state = 'menu'; showScreen('menu'); };
$('btn-resume').onclick = () => togglePause();
$('btn-quit').onclick = () => { G.state = 'menu'; showScreen('menu'); };
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
  $('menu-best').textContent = T('best', store.best);
};
AMG.mountBtn();
window.__refreshLang();

function drawBall(x, y, color, ghost) {
  const g = ctx.createRadialGradient(x - 5, y - 6, 2, x, y, R);
  g.addColorStop(0, '#fff');
  g.addColorStop(.35, COLORS[color]);
  g.addColorStop(1, ghost ? '#555' : COLORS[color]);
  ctx.fillStyle = g;
  ctx.globalAlpha = ghost ? .5 : 1;
  ctx.beginPath(); ctx.arc(x, y, R - 1, 0, 7); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(255,255,255,.75)';
  ctx.beginPath(); ctx.arc(x - 5, y - 6, 3.5, 0, 7); ctx.fill();
}
function render() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#1a2450'); g.addColorStop(1, '#0a1030');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // 侧墙
  ctx.fillStyle = 'rgba(255,255,255,.12)';
  ctx.fillRect(0, TOP - 20, 3, BOT - TOP + 20);
  ctx.fillRect(W - 3, TOP - 20, 3, BOT - TOP + 20);
  ctx.strokeStyle = 'rgba(255,93,93,.6)'; ctx.lineWidth = 2; ctx.setLineDash([8, 6]);
  ctx.beginPath(); ctx.moveTo(0, BOT); ctx.lineTo(W, BOT); ctx.stroke();
  ctx.setLineDash([]);
  if (G.state === 'menu') return;
  // 天花板
  ctx.fillStyle = '#3a4a6e';
  ctx.fillRect(0, 0, W, TOP - 20 + G.dropOff);
  // 场上泡泡
  G.grid.forEach((row, r) => row.forEach((v, c) => {
    if (v >= 0) drawBall(colX(r, c), rowY(r), v);
  }));
  // 瞄准线
  if (G.state === 'play' && !G.flying) {
    ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.lineWidth = 2; ctx.setLineDash([6, 8]);
    ctx.beginPath();
    ctx.moveTo(W / 2, SHOOT_Y);
    ctx.lineTo(W / 2 + Math.cos(G.angle) * 220, SHOOT_Y + Math.sin(G.angle) * 220);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  // 飞行泡泡
  if (G.flying) drawBall(G.flying.x, G.flying.y, G.flying.color);
  // 发射器
  ctx.fillStyle = 'rgba(255,255,255,.15)';
  ctx.beginPath(); ctx.arc(W / 2, SHOOT_Y + 6, 30, 0, 7); ctx.fill();
  if (G.state === 'play') {
    drawBall(W / 2, SHOOT_Y, G.cur);
    ctx.fillStyle = '#fff'; ctx.font = '900 12px system-ui'; ctx.textAlign = 'left';
    ctx.fillText(T('nextLabel'), 20, SHOOT_Y + 5);
    drawBall(80, SHOOT_Y, G.next);
  }
  // HUD
  ctx.fillStyle = 'rgba(0,0,0,.4)';
  ctx.fillRect(0, 0, W, 30);
  ctx.fillStyle = '#fff'; ctx.font = '900 14px system-ui'; ctx.textAlign = 'left';
  ctx.fillText('SCORE ' + G.score, 10, 20);
  ctx.textAlign = 'center';
  ctx.fillText('STAGE ' + G.stage, W / 2, 20);
  ctx.textAlign = 'right';
  ctx.fillText('BEST ' + Math.max(store.best, G.score), W - 10, 20);
  for (const p of G.parts) {
    ctx.globalAlpha = Math.max(0, 1 - p.age / p.life);
    if (p.fall) drawBall(p.x, p.y, COLORS.indexOf(p.c) >= 0 ? COLORS.indexOf(p.c) : 0);
    else { ctx.fillStyle = p.c; ctx.fillRect(p.x - 2, p.y - 2, 4, 4); }
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center';
  for (const fl of G.floats) {
    ctx.globalAlpha = Math.max(0, 1 - fl.age);
    ctx.font = '900 20px system-ui';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.6)';
    ctx.strokeText(fl.text, fl.x, fl.y);
    ctx.fillStyle = '#ffd93d';
    ctx.fillText(fl.text, fl.x, fl.y);
  }
  ctx.globalAlpha = 1;
}
let last = performance.now();
function loop(now) {
  const dt = Math.min(((now || performance.now()) - last) / 1000, .05);
  last = now || performance.now();
  update(dt);
  render();
  requestAnimationFrame(loop);
}
reset();
requestAnimationFrame(t => { last = t; requestAnimationFrame(loop); });
window.__game = G;
window.__gameErrors = [];
window.addEventListener('error', e => window.__gameErrors.push(String(e.message)));
G._attach = attach; G._gen = genStage; G._shoot = shoot; G._start = startGame;
G._cluster = findCluster; G._floating = findFloating; G._snap = snapToGrid;
G._next = () => { G.stage++; genStage(G.stage); G.state = 'play'; G.flying = null; showScreen(null); };
})();
