(() => {
// 猜成语：中文版 Wordle —— 6 次机会猜出四字成语，汉字 + 声母 / 韵母 / 声调三重颜色提示
const STR = window.GAME_STR || { zh: {} };
const T = (k, ...a) => AMG.tf(STR, k, ...a);
const $ = id => document.getElementById(id);
const ROWS = 6, KEYS = 24;
const INITS = ['zh', 'ch', 'sh', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'j', 'q', 'x', 'r', 'z', 'c', 's', 'y', 'w'];
const TONES = {};
[['a', 'āáǎà'], ['e', 'ēéěè'], ['i', 'īíǐì'], ['o', 'ōóǒò'], ['u', 'ūúǔù'], ['ü', 'ǖǘǚǜ']]
  .forEach(([v, s]) => [...s].forEach((c, i) => { TONES[c] = [v, i + 1]; }));
const TONE_MARK = ['·', 'ˉ', 'ˊ', 'ˇ', 'ˋ'];

function parseSyl(s) {
  let tone = 0, plain = '';
  for (const ch of s) {
    if (TONES[ch]) { plain += TONES[ch][0]; tone = TONES[ch][1]; } else plain += ch;
  }
  const ini = INITS.find(i => plain.startsWith(i)) || '';
  return { ini, fin: plain.slice(ini.length), tone };
}
const IDIOMS = (window.IDIOM_DATA || []).map(line => {
  const [w, py, mean, en] = line.split('|');
  return { w, chars: [...w], syl: py.split(' ').map(parseSyl), py, mean, en };
});
const CHAR_PY = {};
for (const id of IDIOMS) id.chars.forEach((c, i) => { if (!CHAR_PY[c]) CHAR_PY[c] = id.syl[i]; });

// ---------- 存档 ----------
const LS = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};
const blankStats = () => ({ played: 0, wins: 0, streak: 0, maxStreak: 0, dist: [0, 0, 0, 0, 0, 0] });
let stats = LS.get('idiom-stats', blankStats());
let muted = LS.get('idiom-muted', false);

let actx = null;
function tone(f, dur, type, vol) {
  if (muted) return;
  try {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type || 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(vol || .06, actx.currentTime);
    g.gain.exponentialRampToValueAtTime(.001, actx.currentTime + dur);
    o.connect(g); g.connect(actx.destination); o.start(); o.stop(actx.currentTime + dur);
  } catch (e) {}
}
const sfx = {
  key: () => tone(520, .05, 'triangle', .05),
  flip: i => tone(440 + i * 90, .08, 'sine', .06),
  bad: () => tone(160, .15, 'square', .04),
  win: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, .16, 'triangle', .08), i * 110)),
  lose: () => [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, .22, 'sine', .07), i * 150))
};

// ---------- 题目 ----------
function dayNum(d) {
  d = d || new Date();
  return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(2026, 0, 1)) / 864e5);
}
const dailyIndex = n => ((n * 7919 + 13) % IDIOMS.length + IDIOMS.length) % IDIOMS.length;
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
// 字盘：答案 4 字 + 与答案共享字的成语里的其他字 + 同声母 / 同韵母的干扰字
function buildKeys(ans, rand) {
  const set = new Set(ans.chars);
  const add = c => { if (!set.has(c) && set.size < KEYS) set.add(c); };
  const related = IDIOMS.filter(id => id !== ans && id.chars.some(c => ans.chars.includes(c)));
  related.sort(() => rand() - .5).slice(0, 3).forEach(id => id.chars.forEach(add));
  const pool = Object.keys(CHAR_PY).filter(c => !set.has(c)).map(c => {
    const p = CHAR_PY[c];
    let sc = rand() * 3;
    for (const s of ans.syl) { if (s.ini && s.ini === p.ini) sc += 2; if (s.fin === p.fin) sc += 2; if (s.tone === p.tone) sc += .5; }
    return [c, sc];
  }).sort((a, b) => b[1] - a[1]);
  for (const [c] of pool) add(c);
  const all = [...set];
  for (let i = all.length - 1; i > 0; i--) { const j = rand() * (i + 1) | 0; [all[i], all[j]] = [all[j], all[i]]; }
  return all;
}

const G = { state: 'menu', mode: 'free', ans: null, rows: [], cur: [], keys: [], keyState: {}, hints: 0, done: false, won: false, day: 0, lock: false };

function pyOf(ch) {
  const i = G.ans.chars.indexOf(ch);
  return i >= 0 ? G.ans.syl[i] : (CHAR_PY[ch] || null);
}
function evaluate(guess) {
  const ans = G.ans.chars, res = Array(4).fill('x'), used = Array(4).fill(false);
  for (let i = 0; i < 4; i++) if (guess[i] === ans[i]) { res[i] = 'g'; used[i] = true; }
  for (let i = 0; i < 4; i++) {
    if (res[i] === 'g') continue;
    const j = ans.findIndex((c, k) => !used[k] && c === guess[i]);
    if (j >= 0) { res[i] = 'y'; used[j] = true; }
  }
  const part = (i, key, v) => G.ans.syl[i][key] === v ? 'g' : G.ans.syl.some((s, k) => k !== i && s[key] === v) ? 'y' : 'x';
  const py = guess.map((c, i) => {
    const p = pyOf(c);
    if (!p) return null;
    return { p, ini: part(i, 'ini', p.ini), fin: part(i, 'fin', p.fin), tone: part(i, 'tone', p.tone) };
  });
  return { chars: guess, res, py };
}

function startRound(mode) {
  G.mode = mode; G.rows = []; G.cur = []; G.keyState = {}; G.hints = 0; G.done = false; G.won = false; G.lock = false;
  if (mode === 'daily') {
    G.day = dayNum();
    G.ans = IDIOMS[dailyIndex(G.day)];
    G.keys = buildKeys(G.ans, rng(G.day * 977 + 1));
    const saved = LS.get('idiom-daily', null);
    if (saved && saved.day === G.day) {
      G.hints = saved.hints || 0;
      for (const w of saved.rows) applyRow(evaluate([...w]));
      G.done = !!saved.done; G.won = !!saved.won;
    }
  } else {
    let a;
    do { a = IDIOMS[Math.random() * IDIOMS.length | 0]; } while (G.ans && a === G.ans && IDIOMS.length > 1);
    G.ans = a;
    G.keys = buildKeys(G.ans, rng(Math.random() * 1e9));
  }
  G.state = 'play';
  $('ig-input').value = '';
  showScreen(null);
  renderAll();
  if (G.done) setTimeout(showResult, 300);
}
function applyRow(row) {
  G.rows.push(row);
  const rank = { g: 3, y: 2, x: 1 };
  row.chars.forEach((c, i) => {
    if ((rank[row.res[i]] || 0) > (rank[G.keyState[c]] || 0)) G.keyState[c] = row.res[i];
  });
}
function saveDaily() {
  if (G.mode !== 'daily') return;
  LS.set('idiom-daily', { day: G.day, rows: G.rows.map(r => r.chars.join('')), hints: G.hints, done: G.done, won: G.won });
}

function toast(msg) {
  const el = $('ig-toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 1500);
}
function shake() {
  const r = $('ig-board').children[G.rows.length];
  if (!r) return;
  r.classList.remove('shake'); void r.offsetWidth; r.classList.add('shake');
  sfx.bad();
}
function typeChar(c) {
  if (G.state !== 'play' || G.done || G.lock || G.cur.length >= 4) return;
  G.cur.push(c); sfx.key(); renderBoard();
}
function backspace() {
  if (G.state !== 'play' || G.done || G.lock) return;
  G.cur.pop(); renderBoard();
}
function submit() {
  if (G.state !== 'play' || G.done || G.lock) return;
  if (G.cur.length < 4) { toast(T('needFour')); return shake(); }
  const w = G.cur.join('');
  if (G.rows.some(r => r.chars.join('') === w)) { toast(T('dup')); return shake(); }
  const row = evaluate(G.cur.slice());
  applyRow(row);
  G.cur = []; $('ig-input').value = '';
  const won = row.res.every(r => r === 'g');
  if (won || G.rows.length >= ROWS) {
    G.done = true; G.won = won;
    stats.played++;
    if (won) { stats.wins++; stats.streak++; stats.maxStreak = Math.max(stats.maxStreak, stats.streak); stats.dist[G.rows.length - 1]++; }
    else stats.streak = 0;
    LS.set('idiom-stats', stats);
  }
  saveDaily();
  G.lock = true;
  renderBoard(G.rows.length - 1);
  row.res.forEach((_, i) => setTimeout(() => sfx.flip(i), i * 220));
  setTimeout(() => {
    G.lock = false;
    renderKeys();
    if (G.done) {
      if (G.won) sfx.win(); else sfx.lose();
      setTimeout(showResult, G.won ? 700 : 400);
    }
  }, 4 * 220 + 300);
}
function useHint() {
  if (G.state !== 'play' || G.done) return;
  if (G.hints >= 2) { toast(T('noMoreHint')); return; }
  G.hints++; saveDaily(); renderHint();
}

// ---------- 渲染 ----------
function pyHtml(p, cls) {
  if (!p) return '<span class="px">?</span>';
  const c = k => cls ? ' class="p' + cls[k] + '"' : '';
  return (p.ini ? '<span' + c('ini') + '>' + p.ini + '</span>' : '') +
    '<span' + c('fin') + '>' + p.fin + '</span>' +
    '<span' + c('tone') + '>' + TONE_MARK[p.tone] + '</span>';
}
function renderBoard(flipRow) {
  const b = $('ig-board');
  let html = '';
  for (let r = 0; r < ROWS; r++) {
    html += '<div class="ig-row">';
    const row = G.rows[r];
    for (let i = 0; i < 4; i++) {
      if (row) {
        const py = row.py[i];
        const anim = r === flipRow ? ' flip" style="animation-delay:' + i * .22 + 's' : '';
        html += '<div class="ig-cell ' + row.res[i] + anim + '"><div class="pin">' +
          pyHtml(py && py.p, py && { ini: py.ini, fin: py.fin, tone: py.tone }) + '</div><div class="ch">' + row.chars[i] + '</div></div>';
      } else if (r === G.rows.length && !G.done) {
        const c = G.cur[i];
        html += '<div class="ig-cell' + (c ? ' typed' : '') + (i === G.cur.length ? ' caret' : '') + '"><div class="pin">' + (c ? pyHtml(pyOf(c)) : '') + '</div><div class="ch">' + (c || '') + '</div></div>';
      } else html += '<div class="ig-cell empty"><div class="pin"></div><div class="ch"></div></div>';
    }
    html += '</div>';
  }
  b.innerHTML = html;
  $('ig-left').textContent = T('left', ROWS - G.rows.length);
  $('ig-mode').textContent = G.mode === 'daily' ? T('modeDaily') : T('modeFree');
}
function renderKeys() {
  $('ig-keys').innerHTML = G.keys.map(c => {
    const p = pyOf(c), st = G.keyState[c] || '';
    const py = p ? (p.ini + p.fin + TONE_MARK[p.tone]) : '';
    return '<button class="ig-key ' + st + '" data-ch="' + c + '"><i>' + py + '</i><b>' + c + '</b></button>';
  }).join('');
}
function renderHint() {
  const el = $('ig-hint');
  if (!G.hints) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  let s = '💡 ' + G.ans.mean;
  if (AMG.lang !== 'zh') s += ' (' + G.ans.en + ')';
  if (G.hints >= 2) s += ' · ' + T('firstChar', G.ans.chars[0]);
  el.textContent = s;
  $('btn-hint').textContent = T('hint') + ' ' + (2 - G.hints);
}
function renderAll() { renderBoard(); renderKeys(); renderHint(); $('btn-hint').textContent = T('hint') + ' ' + (2 - G.hints); }

function emojiGrid() {
  return G.rows.map(r => r.res.map(x => x === 'g' ? '🟩' : x === 'y' ? '🟨' : '⬜').join('')).join('\n');
}
function showResult() {
  $('over-title').textContent = G.won ? T('winTitle') : T('loseTitle');
  $('over-title').className = G.won ? 'clear-title' : 'over-title';
  $('res-word').textContent = G.ans.w;
  $('res-py').textContent = G.ans.py;
  $('res-mean').textContent = G.ans.mean + (AMG.lang !== 'zh' ? ' — ' + G.ans.en : '');
  $('res-grid').textContent = emojiGrid();
  $('res-sub').textContent = G.won ? T('winSub', G.rows.length, G.hints) : T('loseSub');
  $('res-stats').innerHTML = statsHtml();
  $('btn-next').textContent = G.mode === 'daily' ? T('toFree') : T('next');
  showScreen('over');
}
function statsHtml() {
  const rate = stats.played ? Math.round(stats.wins / stats.played * 100) : 0;
  return [[stats.played, T('stPlayed')], [rate + '%', T('stRate')], [stats.streak, T('stStreak')], [stats.maxStreak, T('stMax')]]
    .map(([v, k]) => '<div><b>' + v + '</b><span>' + k + '</span></div>').join('');
}
function showScreen(name) {
  for (const k of ['screen-menu', 'screen-over'])
    $(k).classList.toggle('hidden', k !== 'screen-' + name);
}
function toMenu() {
  G.state = 'menu';
  $('menu-stats').innerHTML = statsHtml();
  const saved = LS.get('idiom-daily', null);
  $('btn-daily').textContent = saved && saved.day === dayNum() && saved.done ? T('dailyDone') : T('daily');
  showScreen('menu');
}

// ---------- 输入 ----------
$('ig-keys').addEventListener('click', e => {
  const k = e.target.closest('.ig-key');
  if (k) typeChar(k.dataset.ch);
});
$('btn-del').onclick = backspace;
$('btn-enter').onclick = submit;
$('btn-hint').onclick = useHint;
const inp = $('ig-input');
inp.addEventListener('input', () => {
  if (inp.isComposing) return;
  syncInput();
});
inp.addEventListener('compositionend', syncInput);
function syncInput() {
  if (G.done || G.lock) return;
  const cs = [...inp.value].filter(c => /[一-鿿]/.test(c)).slice(0, 4);
  G.cur = cs; renderBoard();
}
inp.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); submit(); }
  e.stopPropagation();
});
window.addEventListener('keydown', e => {
  if (e.target && e.target.tagName === 'INPUT') return;
  if (e.code === 'Backspace') { e.preventDefault(); backspace(); }
  else if (e.code === 'Enter') { e.preventDefault(); if (G.state === 'play') submit(); else if (G.state === 'menu') startRound('free'); }
  else if (e.code === 'KeyM') toggleMute();
  else if (e.code === 'KeyH') useHint();
});
$('btn-daily').onclick = () => startRound('daily');
$('btn-free').onclick = () => startRound('free');
$('btn-next').onclick = () => startRound('free');
$('btn-menu').onclick = toMenu;
$('btn-back').onclick = toMenu;
$('btn-share').onclick = () => {
  const head = (G.mode === 'daily' ? T('shareDaily', G.day + 1) : T('shareFree')) + ' ' + (G.won ? G.rows.length : 'X') + '/' + ROWS;
  const text = head + '\n' + emojiGrid() + '\n' + location.origin + location.pathname;
  const done = () => toast(T('copied'));
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => toast(text));
  else toast(text);
};
function toggleMute() {
  muted = !muted; LS.set('idiom-muted', muted);
  $('btn-mute').textContent = muted ? '🔇' : '🔊';
}
$('btn-mute').onclick = toggleMute;
$('btn-mute').textContent = muted ? '🔇' : '🔊';
window.__refreshLang = function () {
  AMG.apply(STR);
  $('btn-mute').title = T('muteTitle');
  inp.placeholder = T('inputPh');
  if (G.state === 'menu') toMenu();
  else if (G.ans) { renderAll(); if (G.state === 'play' && !$('screen-over').classList.contains('hidden')) showResult(); }
};
AMG.mountBtn();
window.__refreshLang();
toMenu();

window.__game = G;
window.__gameApi = { IDIOMS, CHAR_PY, evaluate, startRound, typeChar, submit, backspace, buildKeys, parseSyl, dailyIndex, dayNum };
window.__gameErrors = [];
window.addEventListener('error', e => window.__gameErrors.push(String(e.message)));
})();
