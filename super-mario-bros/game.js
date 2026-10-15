(() => {
'use strict';
// 超级马里奥 · 像素大冒险：16px 瓦片横版平台。固定 60Hz 物理；像素精灵由字符画生成；
// 8 个关卡（关卡构建器搭建），水管暗道、旗杆结算、城堡吊桥 Boss；键盘 / 手柄 / 触屏。
const { $, T } = KIT;
const store = KIT.store('amg-mario');
const TS = 16, W = 384, H = 240, ROWS = 15;
const cv = $('game'), frame = $('frame');
const ctx = cv.getContext('2d');
let SC = 1;
function fit() {
  const r = frame.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
  SC = Math.max(1, Math.round(r.width * dpr / W));
  cv.width = W * SC; cv.height = H * SC;
  ctx.setTransform(SC, 0, 0, SC, 0, 0); ctx.imageSmoothingEnabled = false;
}
window.addEventListener('resize', fit); fit();
const clamp = KIT.clamp;
const hash = (a, b = 0) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

// ---------------- 像素精灵 ----------------
function spr(rows, pal, flip) {
  const h = rows.length, w = rows[0].length, o = document.createElement('canvas');
  o.width = w; o.height = h; const c = o.getContext('2d');
  rows.forEach((r, y) => { for (let x = 0; x < w; x++) { const col = pal[r[x]]; if (!col) continue; c.fillStyle = col; c.fillRect(flip ? w - 1 - x : x, y, 1, 1); } });
  return o;
}
const pair = (rows, pal) => [spr(rows, pal, false), spr(rows, pal, true)];
const HEAD = [
  '......RRRRR.....',
  '....RRRRRRRRR...',
  '...RRRRRRWWRR...',
  '...RRRRRRRRRRRR.',
  '...HHSSSSKSS....',
  '..HSSSSSSKSSS...',
  '..HSSSSSSSSSSS..',
  '...SSSHHHHHS....',
  '....SSSSSSS.....'];
const SB = {
  stand: ['...RROOOORR.....', '..RRROYOYORR....', '.SSRROOOOORSS...', '.SSSOOOOOOOSS...', '...OOOOOOOOO....', '...BBBB.BBBB....', '..BBBBB.BBBBB...'],
  walk1: ['...RROOOORR.....', '..RRROYOYORRSS..', '.SSRROOOOORRSS..', '.SS.OOOOOOO.....', '...OOOO..OOOO...', '..BBB......BBB..', '.BBBB.....BBBB..'],
  walk2: ['....RROOORR.....', '...RRROYOYRR....', '...SSROOOORSS...', '...SSOOOOOOSS...', '....OOOOOOO.....', '....BBBBBBB.....', '...BBBBB........'],
  jump: ['...RROOOORR.SS..', '..RRROYOYORRSS..', '.SSRROOOOORR....', '.SS.OOOOOOOO....', '...OOOOO.OOOO...', '..BBBB....BBB...', '.BBB.......BB...']
};
const DIE = ['.....RRRRRR.....', '....RRRRRRRR....', '...RRRWWWWRRR...', '...RRRRRRRRRR...', '..SHSSKSSKSSHS..', '..SHSSKSSKSSHS..', '..SSSSSSSSSSSS..',
  '...SHHHHHHHHS...', '....SSSSSSSS....', '.SS.RROOOORR.SS.', '.SSRRRYOOYRRRSS.', '...RROOOOOORR...', '....OOOOOOOO....', '...OOOO..OOOO...', '..BBBB....BBBB..', '..BBB......BBB..'];
const BIGBODY = ['....RRROORR.....', '...RRRROORRRR...', '..RRRRROOORRRR..', '.RRRRROOOOORRRR.', '.RRRRYOOOOYRRRR.', '.SSRROOOOOOORSS.', '.SSSOOOOOOOOSSS.', '.SSOOOOOOOOOOSS.',
  '...OOOOOOOOOO...', '...OOOOOOOOOO...', '...OOOOOOOOOO...', '...OOOOOOOOOO...', '..OOOOOOOOOOOO..', '..OOOOOO.OOOOO..', '..OOOOO...OOOO..'];
const BIGJUMPBODY = BIGBODY.map((r, i) => i < 3 ? r.slice(0, 12) + 'SS..' : r);
const LEGS = {
  stand: ['..OOOO....OOOO..', '..OOOO....OOOO..', '..OOO......OOO..', '..OOO......OOO..', '..OOO......OOO..', '.BBBB......BBBB.', 'BBBBB......BBBBB', 'BBBBB......BBBBB'],
  walk1: ['.OOOO......OOOO.', 'OOOO........OOO.', 'OOO..........OOO', 'OOO..........OOO', 'BBB..........BBB', 'BBBB..........BB', 'BBB...........BB', '................'],
  walk2: ['....OOOOOOOO....', '....OOOOOOO.....', '.....OOOOOO.....', '.....OOOOO......', '.....OOOOO......', '....BBBBBB......', '...BBBBBBB......', '...BBBBBB.......'],
  jump: ['..OOOO.....OOOO.', '.OOOO.......OOOO', '.OOO.........BBB', '.OOO.........BBB', 'BBBB..........BB', 'BBBB............', '.BB.............', '................']
};
const BLANK = '................';
const HPAL = {
  normal: { R: '#d8382c', S: '#f6c08a', H: '#6b3a1e', O: '#2f5fd0', Y: '#ffd84a', K: '#1a1a1a', W: '#ffffff', B: '#6b3a1e' },
  fire: { R: '#f6f6f6', S: '#f6c08a', H: '#6b3a1e', O: '#d8382c', Y: '#ffd84a', K: '#1a1a1a', W: '#d8382c', B: '#8a3a1e' },
  star1: { R: '#2fa84a', S: '#f6c08a', H: '#1a1a1a', O: '#1a1a1a', Y: '#ffd84a', K: '#1a1a1a', W: '#ffffff', B: '#1a1a1a' },
  star2: { R: '#f08a24', S: '#ffe0b0', H: '#7a2a10', O: '#7a2a10', Y: '#ffffff', K: '#1a1a1a', W: '#ffffff', B: '#7a2a10' }
};
const HERO = {};
for (const k in HPAL) {
  const p = HPAL[k], S = {}, B = {};
  for (const f in SB) S[f] = pair(HEAD.concat(SB[f]), p);
  S.die = pair(DIE, p);
  for (const f in LEGS) B[f] = pair(HEAD.concat(f === 'jump' ? BIGJUMPBODY : BIGBODY).concat(LEGS[f]), p);
  const crouch = HEAD.concat(BIGBODY.slice(0, 8)).concat(['.BBBBB....BBBBB.', 'BBBBBB....BBBBBB']);
  B.crouch = pair(new Array(32 - crouch.length).fill(BLANK).concat(crouch), p);
  HERO[k] = { s: S, b: B };
}
const GOOMBA = pair(['......NNNN......', '.....NNNNNN.....', '....NNNNNNNN....', '...NNNNNNNNNN...', '..NKKNNNNNNKKN..', '..NWKKNNNNKKWN..', '.NNWWKNNNNKWWNN.', '.NNWWKNNNNKWWNN.',
  'NNNNNNNNNNNNNNNN', 'NNNNNKKKKKKNNNNN', '.NNNNNNNNNNNNNN.', '...TTTTTTTTTT...', '..TTTTTTTTTTTT..', '..KKKTTTTTTTT...', '.KKKKK..TTKKKK..', '..KKKK...KKKKK..'],
  { N: '#b5652b', T: '#f3c48b', K: '#2a1608', W: '#ffffff' });
const GOOMBA_SQ = spr(['...NNNNNNNNNN...', '.NNKKWNNNNWKKNN.', 'NNNNNNNNNNNNNNNN', 'NNNNNKKKKKKNNNNN', '..TTTTTTTTTTTT..', '.KKKKK....KKKKK.'], { N: '#b5652b', T: '#f3c48b', K: '#2a1608', W: '#ffffff' });
const KOOPA_TOP = ['..........SSS...', '.........SSSSS..', '.........SWKSS..', '.........SWKSS..', '.........SSSSSS.', '..........SSSSS.', '..........SSS...', '.....GGGG.SSS...', '....GDGGDGSSS...',
  '...GDGGGGDGS....', '..GGDGGGGDGG....', '..GDGGGGGGDG....', '.GGDGGGGGGDGG...', '.GDGGGGGGGGDG...', '.GDDDDDDDDDDG...', '..WWWWWWWWWWW...', '...WWWWWWWWW....'];
const KOOPA_L1 = ['....SSS..SSS....', '...SSSS..SSSS...', '..OOOO....OOOO..'], KOOPA_L2 = ['.....SSSSSS.....', '....SSSS.SSS....', '...OOOO..OOO....'];
const SHELL = new Array(6).fill(BLANK).concat(['.....GGGGGG.....', '...GGDGGGGDGG...', '..GGDGGGGGGDGG..', '.GGDGGGGGGGGDGG.', '.GDGGGGGGGGGGDG.', 'GGDGGGGGGGGGGDGG', 'GDDDDDDDDDDDDDDG', 'WWWWWWWWWWWWWWWW', '.WWWWWWWWWWWWWW.', '..WWWWWWWWWWWW..']);
const KPAL = { G: { G: '#2fa84a', D: '#1e6e30', S: '#f0d060', K: '#1a1a1a', W: '#ffffff', O: '#e07a1a' }, R: { G: '#d8382c', D: '#8a1e16', S: '#f0d060', K: '#1a1a1a', W: '#ffffff', O: '#e07a1a' } };
const KOOPA = {}, SHELLS = {};
for (const k of ['G', 'R']) { KOOPA[k] = [pair(KOOPA_TOP.concat(KOOPA_L1), KPAL[k]), pair(KOOPA_TOP.concat(KOOPA_L2), KPAL[k])]; SHELLS[k] = spr(SHELL, KPAL[k]); }
const BULLET = pair(['....KKKKKKKK....', '..KKKKKKKKKKKK..', '.KKKWWKKKKKKKKW.', '.KKWWKKKKKKKKWW.', 'KKKWKKKWWKKKKWWW', 'KKKKKKKWKKKKKKWW', 'KKKKKKKKKKKKKKWW', 'KKKKKKKKKKKKKKWW', '.KKKKKKKKKKKKKW.', '..KKKKKKKKKKKK..', '....KKKKKKKK....'], { K: '#1e1e26', W: '#f4f4f4' });
const MUSH_ROWS = ['......RRRR......', '....RRWWRRRR....', '...RRWWWWRRRR...', '..RRRWWWWRRRRR..', '.RRRRRWWRRRWWRR.', '.RRRRRRRRRWWWWR.', 'RRWWRRRRRRWWWWRR', 'RWWWWRRRRRRWWRRR', 'RWWWWRRRRRRRRRRR', 'RRWWRRRRRRRRRWRR',
  '.RRRRRRRRRRRRRR.', '...TTTKTTKTTT...', '...TTTKTTKTTT...', '...TTTTTTTTTT...', '....TTTTTTTT....', BLANK];
const MUSH = spr(MUSH_ROWS, { R: '#d8382c', W: '#ffffff', T: '#f6dcb0', K: '#1a1a1a' });
const ONEUP = spr(MUSH_ROWS, { R: '#2fa84a', W: '#ffffff', T: '#f6dcb0', K: '#1a1a1a' });
const STAR_ROWS = ['.......YY.......', '.......YY.......', '......YYYY......', '......YYYY......', 'YYYYYYYYYYYYYYYY', '.YYYYYKYYKYYYYY.', '..YYYYKYYKYYYY..', '...YYYKYYKYYY...', '....YYYYYYYY....', '...YYYYYYYYYY...', '...YYYYYYYYYY...', '..YYYYY..YYYYY..', '..YYYY....YYYY..', '.YYY........YYY.', '.YY..........YY.', BLANK];
const STARS = [spr(STAR_ROWS, { Y: '#ffd84a', K: '#1a1a1a' }), spr(STAR_ROWS, { Y: '#ffa030', K: '#1a1a1a' })];
const FLOWER_ROWS = ['......FFFF......', '...FFFEEEEFFF...', '..FEEEWWWWEEEF..', '..FEEEWWWWEEEF..', '...FFFEEEEFFF...', '......FFFF......', '.......LL.......', '.LL....LL....LL.', '.LLL...LL...LLL.', '..LLL..LL..LLL..', '...LLL.LL.LLL...', '....LLLLLLLL....', '.......LL.......', '.......LL.......', '.......LL.......', '.......LL.......'];
const FLOWERS = [spr(FLOWER_ROWS, { F: '#d8382c', E: '#f08a24', W: '#ffffff', L: '#2fa84a' }), spr(FLOWER_ROWS, { F: '#f08a24', E: '#ffd84a', W: '#ffffff', L: '#2fa84a' })];

// ---------------- 主题 / 瓦片 ----------------
const THEMES = {
  grass: { sky: ['#5fb6ff', '#c8ecff'], g: ['#c47a3c', '#6e3c16', '#f0b47a'], top: '#4cc04a', topD: '#2a8a30', b: ['#c8642e', '#4e240c', '#f0a070'], q: 'mush', bg: 'hills', music: 'pixel-quest' },
  cave: { sky: ['#07090f', '#131a30'], g: ['#3d6fb0', '#162c55', '#86b4ee'], top: null, b: ['#3d6fb0', '#122650', '#8ab8f2'], q: 'cloud', bg: 'cave', music: 'pixel-cave' },
  sky: { sky: ['#7cc8ff', '#eaf8ff'], g: ['#c47a3c', '#6e3c16', '#f0b47a'], top: '#4cc04a', topD: '#2a8a30', b: ['#c8642e', '#4e240c', '#f0a070'], q: 'cloud', bg: 'sky', music: 'pixel-quest' },
  castle: { sky: ['#120809', '#2e1012'], g: ['#7c7c86', '#34343c', '#b8b8c4'], top: null, b: ['#8a8a94', '#34343c', '#c8c8d4'], q: 'cloud', bg: 'castle', music: 'pixel-cave' },
  snow: { sky: ['#98ceff', '#f0f9ff'], g: ['#86b0d6', '#3e6c9c', '#d4eaff'], top: '#ffffff', topD: '#b8d4ee', b: ['#6a9ad0', '#26457a', '#b8d8ff'], q: 'cloud', bg: 'snow', ice: true, music: 'pixel-quest' },
  night: { sky: ['#080f34', '#28306c'], g: ['#6a4a8a', '#2a1a44', '#a888c8'], top: '#3a9a6a', topD: '#1c5e40', b: ['#7a4aa0', '#2a1844', '#b88ae0'], q: 'tree', bg: 'night', music: 'pixel-cave' },
  sunset: { sky: ['#ff875a', '#ffdca8'], g: ['#b86a3a', '#5e3012', '#e8a070'], top: '#e8b040', topD: '#a87420', b: ['#b8582e', '#4e240c', '#e89070'], q: 'cloud', bg: 'sunset', music: 'pixel-quest' }
};
const tileCache = new Map();
function tileCanvas(key, draw) {
  let o = tileCache.get(key);
  if (!o) { o = document.createElement('canvas'); o.width = o.height = TS; const c = o.getContext('2d'); draw(c); tileCache.set(key, o); }
  return o;
}
const px = (c, x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
function paintGround(c, p) {
  px(c, 0, 0, 16, 16, p[0]);
  px(c, 0, 0, 16, 1, p[2]); px(c, 0, 0, 1, 16, p[2]);
  px(c, 15, 0, 1, 16, p[1]); px(c, 0, 15, 16, 1, p[1]);
  px(c, 7, 1, 1, 7, p[1]); px(c, 1, 7, 6, 1, p[1]); px(c, 8, 8, 7, 1, p[1]); px(c, 11, 9, 1, 6, p[1]);
  px(c, 8, 1, 1, 6, p[2]); px(c, 1, 8, 5, 1, p[2]); px(c, 12, 9, 1, 5, p[2]);
}
function paintBrick(c, p) {
  px(c, 0, 0, 16, 16, p[0]);
  px(c, 0, 0, 16, 1, p[2]);
  for (const y of [3, 7, 11, 15]) px(c, 0, y, 16, 1, p[1]);
  for (const [x, y] of [[7, 0], [15, 0], [3, 4], [11, 4], [7, 8], [15, 8], [3, 12], [11, 12]]) px(c, x, y, 1, 3, p[1]);
  for (const [x, y] of [[0, 1], [8, 1], [4, 5], [12, 5], [0, 9], [8, 9], [4, 13], [12, 13]]) px(c, x, y, 3, 1, p[2]);
}
function paintQ(c, glow, used) {
  const gold = used ? '#a0662e' : ['#f8b800', '#ffd84a', '#ffe9a0'][glow];
  px(c, 0, 0, 16, 16, used ? '#6a3a14' : '#9a4a0a');
  px(c, 1, 1, 14, 14, gold);
  px(c, 1, 1, 14, 1, used ? '#c08a50' : '#fff3c4');
  for (const [x, y] of [[2, 2], [13, 2], [2, 13], [13, 13]]) px(c, x, y, 1, 1, '#4a2400');
  if (used) return;
  const q = ['..XXXX..', '.XX..XX.', '.XX..XX.', '....XXX.', '...XXX..', '...XX...', '........', '...XX...'];
  q.forEach((r, y) => { for (let x = 0; x < 8; x++) if (r[x] === 'X') { px(c, 4 + x + 1, 4 + y + 1, 1, 1, '#9a4a0a'); px(c, 4 + x, 4 + y, 1, 1, '#ffffff'); } });
}
function paintHard(c, p) {
  px(c, 0, 0, 16, 16, p[0]);
  c.fillStyle = p[2]; c.beginPath(); c.moveTo(0, 0); c.lineTo(16, 0); c.lineTo(13, 3); c.lineTo(3, 3); c.lineTo(3, 13); c.lineTo(0, 16); c.fill();
  c.fillStyle = p[1]; c.beginPath(); c.moveTo(16, 16); c.lineTo(16, 0); c.lineTo(13, 3); c.lineTo(13, 13); c.lineTo(3, 13); c.lineTo(0, 16); c.fill();
}
const PIPE = ['#1a6a22', '#2e9a36', '#48c048', '#9ef08a', '#48c048', '#2e9a36', '#2e9a36', '#2e9a36', '#2e9a36', '#2e9a36', '#2e9a36', '#2e9a36', '#2e9a36', '#2e9a36', '#1e7a26', '#1a6a22'];
function paintPipe(c, ch) {
  const rim = ch === '[' || ch === ']', left = ch === '[' || ch === '{';
  for (let x = 0; x < 16; x++) {
    const i = left ? x + (rim ? 0 : 1) : x + 16;
    const col = PIPE[Math.min(15, Math.floor(i / 2))];
    px(c, x, 0, 1, 16, col);
  }
  if (rim) { px(c, 0, 0, 16, 1, '#0e4a14'); px(c, 0, 15, 16, 1, '#0e4a14'); if (left) px(c, 0, 0, 1, 16, '#0e4a14'); else px(c, 15, 0, 1, 16, '#0e4a14'); }
  else { if (left) px(c, 1, 0, 1, 16, '#0e4a14'); else px(c, 14, 0, 1, 16, '#0e4a14'); }
}
function paintHPipe(c, ch) {
  for (let y = 0; y < 16; y++) { const col = ['#1a6a22', '#2e9a36', '#48c048', '#9ef08a', '#48c048', '#2e9a36', '#2e9a36', '#2e9a36', '#2e9a36', '#2e9a36', '#2e9a36', '#2e9a36', '#2e9a36', '#1e7a26', '#1a6a22', '#0e4a14'][y]; px(c, 0, y, 16, 1, col); }
  if (ch === 'A') { px(c, 0, 0, 1, 16, '#0e4a14'); px(c, 15, 0, 1, 16, '#0e4a14'); }
}
function tileImg(ch, th, area, tx, ty) {
  const t = THEMES[th];
  switch (ch) {
    case 'G': {
      const top = t.top && area && !isGround(area, tx, ty - 1);
      return tileCanvas(th + 'G' + (top ? 't' : ''), c => {
        paintGround(c, t.g);
        if (top) { px(c, 0, 0, 16, 4, t.top); px(c, 0, 4, 16, 1, t.topD); for (let x = 1; x < 16; x += 3) px(c, x, 5, 1, 1, t.topD); px(c, 0, 0, 16, 1, '#ffffff55'); }
      });
    }
    case 'B': case 'C': case 'T': return tileCanvas(th + 'B', c => paintBrick(c, t.b));
    case 'W': return tileCanvas('W', c => paintBrick(c, THEMES.castle.b));
    case '?': case 'M': { const f = [0, 0, 1, 2, 1, 0][Math.floor(tick / 8) % 6]; return tileCanvas('Q' + f, c => paintQ(c, f, false)); }
    case 'U': return tileCanvas('U', c => paintQ(c, 0, true));
    case 'H': case 'F': return tileCanvas(th + 'H', c => paintHard(c, th === 'cave' ? ['#4a5e88', '#1e2c48', '#8aa0d0'] : th === 'castle' ? ['#6e6e78', '#2e2e34', '#a8a8b4'] : ['#b06e3c', '#5a3010', '#e8b080']));
    case '[': case ']': case '{': case '}': return tileCanvas('P' + ch, c => paintPipe(c, ch));
    case 'A': case 'Z': return tileCanvas('P' + ch, c => paintHPipe(c, ch));
    case 'c': return tileCanvas('c', c => { px(c, 0, 0, 16, 16, '#26262e'); px(c, 2, 2, 12, 12, '#3a3a44'); px(c, 4, 4, 8, 8, '#14141a'); px(c, 5, 5, 2, 2, '#f4f4f4'); px(c, 9, 5, 2, 2, '#f4f4f4'); px(c, 6, 9, 4, 1, '#f4f4f4'); px(c, 0, 0, 16, 1, '#6a6a78'); });
    case 'd': return tileCanvas('d', c => { px(c, 2, 0, 12, 16, '#3a3a44'); px(c, 3, 0, 2, 16, '#5a5a66'); px(c, 2, 6, 12, 2, '#26262e'); });
    case '=': return tileCanvas('=', c => { px(c, 0, 4, 16, 8, '#8a4a1a'); px(c, 0, 4, 16, 1, '#d08a4a'); for (let x = 0; x < 16; x += 4) px(c, x, 4, 1, 8, '#4a2408'); px(c, 0, 0, 16, 1, '#c8c8c8'); for (let x = 1; x < 16; x += 3) px(c, x, 1, 1, 3, '#909090'); });
    case 'Q': {
      const l = area && area.g[ty][tx - 1] !== 'Q', r = area && area.g[ty][tx + 1] !== 'Q';
      const k = t.q + (l ? 'l' : '') + (r ? 'r' : '');
      return tileCanvas('Q' + k, c => {
        if (t.q === 'cloud') {
          px(c, l ? 3 : 0, 3, 16 - (l ? 3 : 0) - (r ? 3 : 0), 10, '#ffffff');
          px(c, l ? 1 : 0, 6, 16 - (l ? 1 : 0) - (r ? 1 : 0), 5, '#ffffff');
          px(c, l ? 3 : 0, 12, 16 - (l ? 3 : 0) - (r ? 3 : 0), 2, '#c8e4f8');
          px(c, 4, 4, 3, 2, '#e4f4ff');
        } else if (t.q === 'tree') {
          px(c, 0, 0, 16, 9, '#2e8a4a'); px(c, 0, 0, 16, 2, '#58c070'); px(c, 0, 8, 16, 2, '#1c5e32');
          for (let x = 2; x < 16; x += 5) px(c, x, 3, 2, 2, '#58c070');
          if (l) px(c, 0, 0, 2, 10, '#1c5e32'); if (r) px(c, 14, 0, 2, 10, '#1c5e32');
        } else {
          px(c, 0, 0, 16, 9, '#e04a3a'); px(c, 0, 0, 16, 2, '#ff8a70'); px(c, 0, 8, 16, 2, '#9a2a1e');
          for (let x = 3; x < 16; x += 6) { px(c, x, 3, 3, 3, '#ffffff'); }
          if (l) px(c, 0, 0, 2, 10, '#9a2a1e'); if (r) px(c, 14, 0, 2, 10, '#9a2a1e');
        }
      });
    }
  }
  return null;
}
const SOLID = new Set(['G', 'B', 'C', 'T', '?', 'M', 'U', 'H', '[', ']', '{', '}', 'A', 'Z', 'c', 'd', 'W', '=']);
function isGround(a, x, y) { return y >= 0 && y < ROWS && x >= 0 && x < a.w && a.g[y][x] === 'G'; }

// ---------------- 关卡构建器 ----------------
function mk(w, theme) {
  const g = []; for (let y = 0; y < ROWS; y++) g.push(new Array(w).fill('.'));
  const L = { w, theme, g, ents: [], lifts: [], bars: [], warps: [], start: [2, 12], flagX: -1, mid: -1, npc: null, trunks: [] };
  const set = (x, y, ch) => { if (x >= 0 && x < w && y >= 0 && y < ROWS) g[y][x] = ch; };
  L.set = (x, y, ch) => { set(x, y, ch); return L; };
  L.gnd = (a, b, top = 13) => { for (let x = a; x <= b; x++) for (let y = top; y < ROWS; y++) set(x, y, 'G'); return L; };
  L.fill = (x0, y0, x1, y1, ch) => { for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) set(x, y, ch); return L; };
  L.blk = (x, y, s) => { [...s].forEach((ch, i) => { if (ch !== ' ') set(x + i, y, ch); }); return L; };
  L.coins = (x, y, n) => { for (let i = 0; i < n; i++) set(x + i, y, 'o'); return L; };
  L.pipe = (x, top, bot = 12, o = {}) => {
    for (let y = top; y <= bot; y++) { set(x, y, y === top ? '[' : '{'); set(x + 1, y, y === top ? ']' : '}'); }
    if (o.plant) L.ents.push({ t: 'plant', x, y: top });
    return L;
  };
  L.hpipe = (x, y, len) => { set(x, y, 'A'); set(x, y + 1, 'A'); for (let i = 1; i <= len; i++) { set(x + i, y, 'Z'); set(x + i, y + 1, 'Z'); } return L; };
  L.stair = (x, n, dir = 1, base = 12) => { for (let i = 0; i < n; i++) { const h = dir > 0 ? i + 1 : n - i; for (let k = 0; k < h; k++) set(x + i, base - k, 'H'); } return L; };
  L.e = (t, x, y = 12, o = {}) => { L.ents.push(Object.assign({ t, x, y }, o)); return L; };
  L.lift = (x, y, o = {}) => { L.lifts.push({ x, y, w: o.w || 3, ax: o.ax || 'y', range: o.range || 64, sp: o.sp || 0.6, fall: !!o.fall }); return L; };
  L.bar = (x, y, n = 6, sp = 0.05, a0 = 0) => { set(x, y, 'U'); L.bars.push({ x, y, n, sp, a0 }); return L; };
  L.flag = x => { L.flagX = x; set(x, 12, 'F'); return L; };
  L.cannon = (x, y) => { set(x, y, 'c'); for (let yy = y + 1; yy <= 12; yy++) set(x, yy, 'd'); return L; };
  L.lava = (a, b, top = 13) => { for (let x = a; x <= b; x++) for (let y = 0; y < ROWS; y++) { if (y >= top) set(x, y, '~'); else if (g[y][x] === 'G') set(x, y, '.'); } return L; };
  L.warp = (x, y, dir, to, tx, ty, out) => { L.warps.push({ x, y, dir, to, tx, ty, out }); return L; };
  return L;
}
function bonusRoom(back) {
  const B = mk(24, 'cave');
  B.gnd(0, 23).fill(0, 1, 23, 1, 'B').fill(0, 2, 0, 12, 'B').fill(23, 2, 23, 12, 'B');
  B.fill(3, 10, 9, 12, 'B').fill(3, 7, 9, 9, 'o').fill(4, 4, 8, 5, 'o').fill(12, 11, 16, 11, 'o').fill(13, 9, 15, 9, 'o');
  B.hpipe(19, 11, 3).fill(20, 2, 20, 10, '{').fill(21, 2, 21, 10, '}');
  B.warp(19, 11, 'right', 'main', back[0], back[1], 'up');
  B.start = [2, 3];
  return B;
}
const LEVELS = [
  () => { // 1-1 草原
    const M = mk(212, 'grass'); M.start = [3, 12]; M.mid = 100;
    M.gnd(0, 68).gnd(71, 85).gnd(89, 152).gnd(155, 211);
    M.blk(16, 9, '?').blk(20, 9, 'BMB?B').blk(22, 5, '?');
    M.pipe(28, 11).pipe(38, 10).pipe(46, 9).pipe(57, 9);
    M.e('g', 22).e('g', 40).e('g', 51).e('g', 53);
    M.blk(64, 8, '1').coins(69, 9, 2).coins(32, 7, 3);
    M.blk(77, 9, 'B?B').blk(80, 5, 'BBBBBBBB').e('g', 81, 4).e('g', 83, 4);
    M.blk(91, 5, 'BBB?').blk(94, 9, 'C').e('g', 97).e('g', 99);
    M.blk(100, 9, 'BT').blk(106, 9, '?').blk(109, 9, '?').blk(109, 5, 'M').blk(112, 9, '?').e('k', 107);
    M.blk(118, 9, 'B').blk(121, 5, 'BBB').e('g', 114).e('g', 116).e('g', 124).e('g', 126);
    M.blk(128, 5, 'B??B').blk(129, 9, 'BB').e('g', 130).e('g', 132);
    M.stair(134, 4, 1).stair(140, 4, -1).stair(148, 4, 1).fill(152, 9, 152, 12, 'H').stair(155, 4, -1);
    M.pipe(163, 11).blk(168, 9, 'BB?B').e('g', 174).e('g', 176).pipe(179, 11);
    M.stair(181, 8, 1).fill(189, 5, 189, 12, 'H').flag(198);
    M.warp(57, 9, 'down', 'b', 2, 3, 'drop');
    return { areas: { main: M, b: bonusRoom([163, 11]) }, time: 300 };
  },
  () => { // 1-2 地下迷宫
    const M = mk(200, 'cave'); M.start = [3, 12]; M.mid = 100;
    M.gnd(0, 79).gnd(84, 85).gnd(90, 120).gnd(124, 154).gnd(160, 199);
    M.fill(6, 2, 185, 2, 'B').fill(0, 2, 0, 12, 'B');
    M.blk(10, 9, 'M????').e('g', 16).e('g', 17);
    M.fill(28, 10, 28, 12, 'H').fill(30, 8, 30, 12, 'H').fill(32, 6, 32, 12, 'H').set(28, 9, 'o').set(30, 7, 'o').set(32, 5, 'o');
    M.blk(38, 9, 'BCB').e('k', 44).e('k', 46);
    M.pipe(50, 10, 12, { plant: 1 }).pipe(56, 9, 12, { plant: 1 }).pipe(62, 10, 12, { plant: 1 });
    M.blk(67, 9, 'BBBBBB').coins(67, 8, 6).e('g', 69, 8).e('g', 71, 8).blk(72, 5, 'BMBB');
    M.lift(80, 10, { ax: 'y', range: 64, sp: 0.6 }).lift(86, 8, { ax: 'y', range: 64, sp: -0.6 });
    M.e('g', 95).e('g', 97).e('k', 101).blk(96, 9, 'B?B?B').blk(98, 5, 'BTB');
    M.stair(105, 3, 1).pipe(110, 9).pipe(114, 10, 12, { plant: 1 });
    M.e('r', 127).blk(128, 9, 'BBBBBBB').e('g', 131, 8).coins(129, 6, 5);
    M.blk(144, 9, '??M?').e('g', 146).e('g', 148);
    M.lift(155, 10, { ax: 'x', range: 48, w: 3 });
    M.e('k', 165).e('g', 170).e('g', 172).blk(166, 9, 'B1B');
    M.hpipe(186, 11, 2).fill(187, 3, 187, 10, '{').fill(188, 3, 188, 10, '}').fill(189, 2, 199, 12, 'B');
    M.warp(186, 11, 'right', 'out', 3, 11, 'up');
    const O = mk(40, 'grass'); O.gnd(0, 39); O.pipe(3, 11); O.stair(9, 6, 1).fill(15, 7, 15, 12, 'H').flag(24); O.start = [3, 11];
    return { areas: { main: M, out: O }, time: 300 };
  },
  () => { // 1-3 云端之路
    const M = mk(190, 'sky'); M.start = [3, 12]; M.mid = 95;
    M.gnd(0, 15).blk(10, 9, '?M?');
    M.blk(18, 10, 'QQQQQ').e('g', 20, 9);
    M.blk(25, 8, 'QQQ').coins(25, 7, 3);
    M.blk(30, 11, 'QQQQQQ').e('p', 33, 10);
    M.lift(38, 9, { ax: 'x', range: 48 });
    M.blk(46, 7, 'QQQQ').blk(47, 3, '?T?');
    M.gnd(52, 58).e('k', 55);
    M.lift(61, 10, { ax: 'y', range: 64, sp: -0.6 });
    M.blk(65, 6, 'QQQQQQQ').coins(66, 5, 5).e('p', 69, 5);
    M.blk(75, 10, 'QQQ').blk(80, 8, 'QQQ').blk(85, 6, 'QQQ').coins(81, 7, 2).coins(86, 5, 2);
    M.gnd(90, 100).cannon(94, 11).cannon(98, 10).blk(91, 9, 'M');
    M.lift(103, 10, { fall: 1 }).lift(108, 9, { fall: 1 }).lift(113, 8, { fall: 1 });
    M.blk(118, 7, 'QQQQQQ').e('p', 121, 6).e('p', 123, 6).blk(118, 3, 'B?B');
    M.lift(127, 9, { ax: 'x', range: 64 });
    M.gnd(136, 140).e('r', 138);
    M.blk(144, 10, 'QQ').blk(148, 8, 'QQ').blk(152, 6, 'QQ').coins(148, 7, 2).coins(152, 5, 2);
    M.lift(156, 8, { ax: 'y', range: 48 });
    M.gnd(160, 189).stair(164, 5, 1).fill(169, 8, 169, 12, 'H').flag(178);
    return { areas: { main: M }, time: 300 };
  },
  () => { // 1-4 熔岩城堡
    const M = mk(150, 'castle'); M.start = [3, 12]; M.mid = 81;
    M.fill(0, 0, 149, 1, 'W').fill(0, 2, 1, 12, 'W');
    M.gnd(0, 149).lava(21, 24);
    M.bar(30, 9, 6, 0.04).blk(34, 9, 'M');
    M.lava(43, 47).lift(43, 11, { ax: 'x', range: 48, w: 3 }).e('pod', 45);
    M.fill(52, 9, 54, 12, 'W').bar(53, 8, 6, 0.05).fill(58, 2, 68, 5, 'W').bar(63, 9, 6, -0.05);
    M.lava(73, 80).lift(73, 11, { ax: 'x', range: 80, w: 3 }).e('pod', 76).e('pod', 79);
    M.bar(86, 10, 6, 0.06).bar(94, 7, 6, -0.05).blk(90, 9, '?').fill(98, 9, 104, 12, 'W');
    M.lava(105, 108).fill(109, 10, 112, 14, 'W');
    M.lava(113, 130, 12).blk(113, 10, '=================').fill(130, 10, 149, 14, 'W').set(130, 9, 'X');
    M.e('boss', 124, 8);
    M.npc = [140, 9];
    return { areas: { main: M }, time: 300, castle: true };
  },
  () => { // 2-1 冰雪原野
    const M = mk(210, 'snow'); M.start = [3, 12]; M.mid = 105;
    M.gnd(0, 40).gnd(44, 90).gnd(95, 130).gnd(134, 209);
    M.blk(12, 9, '?B?B?').blk(14, 5, 'M').e('g', 18).e('g', 20).e('k', 26);
    M.cannon(32, 11).cannon(38, 10).coins(41, 9, 3);
    M.blk(48, 9, 'BBBBBB').blk(50, 5, '?C?').e('g', 50, 8).e('g', 52, 8);
    M.pipe(58, 10, 12, { plant: 1 }).pipe(64, 9, 12, { plant: 1 }).e('p', 70).e('p', 74);
    M.stair(78, 4, 1).stair(84, 4, -1).coins(91, 8, 4);
    M.set(102, 8, '1').cannon(104, 11).blk(106, 9, 'BMB').e('k', 108).e('k', 111);
    M.blk(114, 6, 'BBBBBBBB').e('g', 116, 5).e('g', 118, 5).cannon(124, 10).coins(131, 9, 3);
    M.blk(140, 9, '?T?').e('g', 145).e('g', 147).e('g', 149).e('r', 152);
    M.pipe(156, 11).pipe(162, 10, 12, { plant: 1 }).cannon(168, 11);
    M.stair(176, 8, 1).fill(184, 5, 184, 12, 'H').flag(194);
    return { areas: { main: M }, time: 300 };
  },
  () => { // 2-2 夜之森林
    const M = mk(200, 'night'); M.start = [3, 12]; M.mid = 100;
    M.gnd(0, 20).gnd(24, 60).gnd(66, 90).gnd(96, 130).gnd(136, 199);
    M.blk(9, 9, '?M?').blk(15, 8, 'QQQQQ').e('g', 17, 7);
    M.pipe(28, 10, 12, { plant: 1 }).pipe(34, 9, 12, { plant: 1 });
    M.e('p', 40).e('p', 44).blk(42, 6, 'QQQQ').coins(42, 5, 4);
    M.blk(50, 9, 'BCBB').e('k', 54).blk(61, 9, 'QQQQQ').coins(61, 8, 5);
    M.blk(70, 9, 'B?B?B').blk(72, 5, 'T').e('g', 70).e('g', 72).e('g', 74);
    M.pipe(80, 9, 12, { plant: 1 }).pipe(86, 11);
    M.lift(91, 10, { ax: 'x', range: 48 });
    M.e('p', 100).e('p', 104).e('r', 110).blk(106, 7, 'QQQQQQ').e('g', 108, 6);
    M.blk(114, 9, '??M??').pipe(120, 10, 12, { plant: 1 }).pipe(126, 9, 12, { plant: 1 });
    M.blk(131, 10, 'QQQQ').e('k', 140).e('k', 143).e('p', 147);
    M.stair(150, 4, 1).stair(156, 4, -1).blk(164, 9, 'B.B').set(165, 9, '1').coins(165, 6, 1);
    M.stair(176, 8, 1).fill(184, 5, 184, 12, 'H').flag(192);
    return { areas: { main: M }, time: 300 };
  },
  () => { // 2-3 黄昏飞空
    const M = mk(200, 'sunset'); M.start = [3, 12]; M.mid = 86;
    M.gnd(0, 12).blk(7, 9, '?M?');
    M.lift(14, 10, { ax: 'x', range: 48 });
    M.blk(22, 8, 'QQQQ').e('p', 24, 7);
    M.lift(28, 9, { fall: 1 }).lift(33, 8, { fall: 1 });
    M.gnd(38, 50).cannon(44, 11).cannon(48, 10).blk(40, 9, '?C?');
    M.lift(53, 10, { ax: 'y', range: 64 }).lift(58, 6, { ax: 'y', range: 64, sp: 0.7 });
    M.blk(63, 9, 'QQQQQQ').coins(63, 8, 6).e('r', 65, 8);
    M.lift(71, 10, { ax: 'x', range: 64, w: 2 });
    M.gnd(80, 92).cannon(84, 11).cannon(88, 11).e('k', 90).blk(81, 9, 'M');
    M.blk(95, 7, 'QQQ').blk(100, 9, 'QQQ').blk(105, 6, 'QQQ').coins(95, 6, 3).coins(105, 5, 3);
    M.lift(110, 9, { fall: 1 }).lift(114, 8, { fall: 1 }).lift(118, 7, { fall: 1 });
    M.blk(123, 8, 'QQQQQQQ').e('p', 125, 7).e('p', 128, 7).blk(124, 4, '?T?');
    M.lift(132, 10, { ax: 'x', range: 64 });
    M.gnd(142, 150).cannon(146, 11);
    M.lift(152, 10, { ax: 'y', range: 48 }).blk(157, 7, 'QQQ').lift(162, 9, { fall: 1 });
    M.gnd(167, 199).stair(170, 6, 1).fill(176, 7, 176, 12, 'H').flag(186);
    return { areas: { main: M }, time: 300 };
  },
  () => { // 2-4 魔王城
    const M = mk(180, 'castle'); M.start = [3, 12]; M.mid = 91;
    M.fill(0, 0, 179, 1, 'W').fill(0, 2, 1, 12, 'W');
    M.gnd(0, 179).lava(17, 21).lift(17, 11, { ax: 'x', range: 40, w: 2 }).e('pod', 19);
    M.bar(28, 9, 7, 0.05).bar(28, 9, 7, 0.05, Math.PI).blk(33, 9, 'M');
    M.fill(36, 9, 40, 12, 'W').bar(38, 8, 6, 0.06);
    M.lava(41, 48).lift(41, 10, { ax: 'x', range: 80, w: 3 }).e('pod', 44).e('pod', 47);
    M.fill(52, 2, 80, 5, 'W').bar(56, 9, 6, -0.06).bar(64, 9, 6, 0.06).bar(72, 9, 6, -0.07).e('g', 60).e('g', 62).e('k', 70);
    M.lava(81, 90).lift(81, 11, { fall: 1 }).lift(84, 10, { fall: 1 }).lift(87, 9, { fall: 1 }).e('pod', 85).e('pod', 89);
    M.fill(95, 9, 97, 12, 'W').bar(96, 8, 8, 0.05).blk(104, 9, '?M?').fill(110, 10, 120, 12, 'W').bar(115, 9, 6, -0.06);
    M.lava(121, 124).fill(125, 10, 128, 14, 'W');
    M.lava(129, 152, 12).blk(129, 10, '=======================').fill(152, 10, 179, 14, 'W').set(152, 9, 'X');
    M.e('boss', 145, 8, { hammer: 1, hp: 8 });
    M.npc = [166, 9];
    return { areas: { main: M }, time: 300, castle: true, final: true };
  }
];

// ---------------- 音效 ----------------
const sfx = {
  jump: big => KIT.tone(big ? 330 : 420, 0.16, { type: 'square', vol: 0.05, to: big ? 700 : 900 }),
  stomp: () => { KIT.tone(260, 0.08, { type: 'square', vol: 0.06, to: 120 }); KIT.noise(0.06, { vol: 0.05, lp: 1200 }); },
  coin: () => { KIT.tone(988, 0.06, { type: 'square', vol: 0.045 }); KIT.tone(1319, 0.22, { type: 'square', vol: 0.045, delay: 0.06 }); },
  bump: () => KIT.tone(150, 0.08, { type: 'square', vol: 0.06, to: 90 }),
  brk: () => { KIT.noise(0.25, { vol: 0.12, lp: 2000 }); KIT.tone(200, 0.1, { type: 'square', vol: 0.04, to: 60 }); },
  sprout: () => KIT.arp([392, 523, 659, 784, 1046], 0.03, { type: 'square', vol: 0.035, dur: 0.06 }),
  power: () => KIT.arp([523, 659, 784, 1046, 659, 784, 1046, 1319], 0.045, { type: 'square', vol: 0.04, dur: 0.08 }),
  fire: () => KIT.tone(900, 0.06, { type: 'square', vol: 0.04, to: 300 }),
  kick: () => KIT.tone(600, 0.06, { type: 'square', vol: 0.05, to: 200 }),
  pipe: () => KIT.arp([392, 330, 262, 196, 392, 330, 262, 196], 0.05, { type: 'square', vol: 0.04, dur: 0.05 }),
  oneUp: () => KIT.arp([659, 784, 1319, 1046, 1175, 1568], 0.08, { type: 'square', vol: 0.05, dur: 0.1 }),
  hurt: () => KIT.arp([784, 523, 392, 262], 0.06, { type: 'square', vol: 0.05, dur: 0.08 }),
  die: () => KIT.arp([523, 494, 466, 440, 0, 330, 262, 196], 0.12, { type: 'square', vol: 0.06, dur: 0.12 }),
  flag: () => KIT.tone(1200, 0.9, { type: 'square', vol: 0.035, to: 300 }),
  clear: () => KIT.arp([392, 523, 659, 784, 1046, 1319, 1568, 1319, 1568], 0.11, { type: 'square', vol: 0.05, dur: 0.14 }),
  tick: () => KIT.tone(1500, 0.025, { type: 'square', vol: 0.025 }),
  firework: () => KIT.noise(0.4, { vol: 0.16, lp: 1500 }),
  hurry: () => KIT.arp([880, 1046, 880, 1046, 880, 1046], 0.08, { type: 'square', vol: 0.04, dur: 0.07 }),
  bossFire: () => KIT.noise(0.35, { vol: 0.1, hp: 400, lp: 2500 }),
  collapse: () => KIT.noise(0.08, { vol: 0.08, lp: 900 }),
  bossFall: () => KIT.tone(500, 1.2, { type: 'sawtooth', vol: 0.06, to: 60 }),
  over: () => KIT.arp([523, 392, 330, 440, 494, 440, 415, 466, 415, 392], 0.13, { type: 'triangle', vol: 0.08, dur: 0.16 })
};

// ---------------- 状态 ----------------
let state = 'menu', prevState = 'play';
let lvIdx = 0, lvDef = null, areas = null, area = null, areaKey = 'main', theme = THEMES.grass;
let camX = 0, tick = 0, timeLeft = 300, timeAcc = 0, hurried = false;
let score = 0, coins = 0, lives = 3, checkpoint = false;
let ents = [], items = [], fballs = [], debris = [], texts = [], bumps = [], lifts = [], bars = [], cannons = [], pending = [];
let hero = null, freeze = 0, iris = null, introT = 0, clearSeq = null, msg = null, combo = 0;
let prog = store.get('prog', { unlocked: 0, cleared: [], best: 0 });
let pickLv = Math.min(prog.unlocked, 7);
const parts = new KIT.Particles();

// ---------------- 输入 ----------------
const keys = new Set();
const input = { l: 0, r: 0, d: 0, jump: 0, run: 0, jumpP: 0, runP: 0 };
const KMAP = { ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r', ArrowDown: 'd', KeyS: 'd', Space: 'jump', KeyZ: 'jump', KeyK: 'jump', ArrowUp: 'jump', KeyW: 'jump', ShiftLeft: 'run', ShiftRight: 'run', KeyX: 'run', KeyJ: 'run' };
const touchHeld = {};
let padPrev = {};
function readInput() {
  const st = { l: 0, r: 0, d: 0, jump: 0, run: 0 };
  for (const k of keys) if (KMAP[k]) st[KMAP[k]] = 1;
  for (const k in touchHeld) if (touchHeld[k]) st[k] = 1;
  try {
    const gp = navigator.getGamepads && navigator.getGamepads()[0];
    if (gp) {
      const b = n => gp.buttons[n] && gp.buttons[n].pressed;
      if (gp.axes[0] < -0.35 || b(14)) st.l = 1; if (gp.axes[0] > 0.35 || b(15)) st.r = 1; if (gp.axes[1] > 0.5 || b(13)) st.d = 1;
      if (b(0) || b(1)) st.jump = 1; if (b(2) || b(3)) st.run = 1;
      if (b(9) && !padPrev.start) togglePause();
      padPrev.start = b(9);
    }
  } catch (e) {}
  input.jumpP = st.jump && !input.jump; input.runP = st.run && !input.run;
  Object.assign(input, st);
}

// ---------------- 区域加载 ----------------
function cloneArea(A) {
  return { w: A.w, theme: A.theme, g: A.g.map(r => r.slice()), def: A, cc: new Map(), warps: A.warps, flagX: A.flagX, mid: A.mid, npc: A.npc };
}
function loadArea(key, spawn) {
  areaKey = key; area = areas[key]; theme = THEMES[area.theme];
  ents = []; items = []; fballs = []; debris = []; bumps = []; texts = []; pending = [];
  pending = area.def.ents.map(e => Object.assign({}, e)).sort((a, b) => a.x - b.x);
  lifts = area.def.lifts.map(l => ({ x: l.x * TS, y: l.y * TS, w: l.w * TS, ox: l.x * TS, oy: l.y * TS, ax: l.ax, range: l.range, sp: l.sp, fall: l.fall, t: 0, dx: 0, dy: 0, stood: 0, falling: false, vy: 0 }));
  bars = area.def.bars.map(b => ({ cx: b.x * TS + 8, cy: b.y * TS + 8, n: b.n, sp: b.sp, a: b.a0 }));
  cannons = [];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < area.w; x++) if (area.g[y][x] === 'c') cannons.push({ x, y, t: 60 + (x * 37) % 90 });
  parts.clear();
  area.axe = null;
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < area.w; x++) if (area.g[y][x] === 'X') area.axe = [x, y];
  area.trunks = [];
  if (theme.q !== 'cloud') {
    for (let y = 0; y < ROWS; y++) { let x = 0; while (x < area.w) { if (area.g[y][x] === 'Q') { let e = x; while (area.g[y][e + 1] === 'Q') e++; area.trunks.push({ x: (x + e + 1) / 2 * TS, y: (y + 1) * TS }); x = e + 1; } else x++; } }
  }
  if (spawn) placeHero(spawn);
  camX = clamp(hero.x - W * 0.4, 0, Math.max(0, area.w * TS - W));
  KIT.music(starMusic() ? 'star-power' : theme.music);
}
function placeHero(sp) {
  hero.vx = 0; hero.vy = 0; hero.onGround = false; hero.lift = null;
  if (sp.out === 'up') { hero.x = sp.tx * TS + 16 - hero.w / 2; hero.y = sp.ty * TS + 4; hero.outY = sp.ty * TS; hero.state = 'pipeOut'; hero.pipeT = 0; hero.behind = true; sfx.pipe(); }
  else { hero.x = sp.tx * TS + 2; hero.y = (sp.ty + 1) * TS - hero.h; hero.state = 'play'; hero.behind = false; }
}
function newHero() { return { x: 0, y: 0, vx: 0, vy: 0, w: 12, h: 15, big: false, fire: false, dir: 1, onGround: false, coyote: 0, jumpBuf: 0, star: 0, inv: 0, state: 'play', anim: 0, crouch: false, lift: null, behind: false, pipeT: 0, dieT: 0, growT: 0 }; }
function setBig(b) { const bottom = hero.y + hero.h; hero.big = b; hero.h = b ? 28 : 15; hero.y = bottom - hero.h; }

function startLevel(i, fromCheckpoint) {
  lvIdx = i; lvDef = LEVELS[i]();
  areas = {}; for (const k in lvDef.areas) areas[k] = cloneArea(lvDef.areas[k]);
  const keepBig = hero && hero.state !== 'die' ? { big: hero.big, fire: hero.fire } : { big: false, fire: false };
  hero = newHero(); if (keepBig.big) { setBig(true); hero.fire = keepBig.fire; }
  timeLeft = lvDef.time; timeAcc = 0; hurried = false; clearSeq = null; msg = null; freeze = 0; combo = 0;
  if (!fromCheckpoint) checkpoint = false;
  const M = lvDef.areas.main, sx = checkpoint && M.mid > 0 ? M.mid : M.start[0];
  hero.x = sx * TS + 2; hero.y = (M.start[1] + 1) * TS - hero.h;
  if (checkpoint && M.mid > 0) { let ty = ROWS - 1; if (SOLID.has(M.g[ty][sx])) { while (ty > 0 && SOLID.has(M.g[ty - 1][sx])) ty--; hero.y = ty * TS - hero.h; } }
  loadArea('main', null);
  state = 'intro'; introT = 0; KIT.stopMusic();
  hideScreens();
}

// ---------------- 物理 ----------------
function tileAt(tx, ty) { if (ty < 0 || ty >= ROWS) return '.'; if (tx < 0) return 'W'; if (tx >= area.w) return '.'; return area.g[ty][tx]; }
function solidT(tx, ty) { if (tx < 0 && ty >= 0) return true; if (tx >= area.w) return ty >= 0 && ty < ROWS && false; return SOLID.has(tileAt(tx, ty)); }
function solidPx(x, y) { return solidT(Math.floor(x / TS), Math.floor(y / TS)); }
function moveBody(e, ghostWalls) {
  // 水平
  e.x += e.vx;
  let hitX = false;
  if (!ghostWalls) {
    const t0 = Math.floor(e.y / TS), t1 = Math.floor((e.y + e.h - 1) / TS);
    if (e.vx > 0) { const tx = Math.floor((e.x + e.w - 1) / TS); for (let ty = t0; ty <= t1; ty++) if (solidT(tx, ty)) { e.x = tx * TS - e.w; hitX = true; break; } }
    else if (e.vx < 0) { const tx = Math.floor(e.x / TS); for (let ty = t0; ty <= t1; ty++) if (solidT(tx, ty)) { e.x = (tx + 1) * TS; hitX = true; break; } }
  }
  // 垂直
  const prevBot = e.y + e.h;
  e.y += e.vy; e.onGround = false;
  let hitHead = null;
  const l = Math.floor(e.x / TS), r = Math.floor((e.x + e.w - 1) / TS);
  if (e.vy >= 0) {
    const ty = Math.floor((e.y + e.h) / TS);
    for (let tx = l; tx <= r; tx++) {
      const ch = tileAt(tx, ty);
      if (SOLID.has(ch) || (ch === 'Q' && prevBot <= ty * TS + 1)) { e.y = ty * TS - e.h; e.vy = 0; e.onGround = true; break; }
    }
  } else {
    const ty = Math.floor(e.y / TS);
    const hit = [];
    for (let tx = l; tx <= r; tx++) if (solidT(tx, ty) || (e === hero && (tileAt(tx, ty) === '1') && e.y < (ty + 1) * TS - 4)) hit.push(tx);
    if (hit.length) {
      if (e === hero && hit.length === 1 && l !== r) {
        const tx = hit[0];
        if (tx === r && e.x + e.w - r * TS <= 5 && !solidT(l, ty)) { e.x = r * TS - e.w; return { hitX, hitHead: null }; }
        if (tx === l && (l + 1) * TS - e.x <= 5 && !solidT(r, ty)) { e.x = (l + 1) * TS; return { hitX, hitHead: null }; }
      }
      const cx = e.x + e.w / 2;
      hitHead = hit.reduce((b, tx) => Math.abs(tx * TS + 8 - cx) < Math.abs(b * TS + 8 - cx) ? tx : b, hit[0]);
      e.y = (ty + 1) * TS; e.vy = 1;
      hitHead = { tx: hitHead, ty };
    }
  }
  return { hitX, hitHead };
}

// ---------------- 方块 ----------------
function bumpTile(tx, ty) {
  const ch = tileAt(tx, ty);
  bumps.push({ tx, ty, t: 0 });
  // 顶起方块上的敌人 / 道具
  const top = ty * TS;
  for (const e of ents) if (!e.dead && e.kind !== 'plant' && e.y + e.h >= top - 2 && e.y + e.h <= top + 2 && e.x + e.w > tx * TS && e.x < tx * TS + TS) flipKill(e, 100, e.x + e.w / 2 < tx * TS + 8 ? -1 : 1);
  for (const it of items) if (it.y + 16 >= top - 2 && it.y + 16 <= top + 2 && it.x + 16 > tx * TS && it.x < tx * TS + TS) { it.vy = -3.5; if (it.vx) it.vx = it.x + 8 < tx * TS + 8 ? -Math.abs(it.vx) : Math.abs(it.vx); }
  if (tileAt(tx, ty - 1) === 'o') { area.g[ty - 1][tx] = '.'; coinPop(tx, ty - 1); }
  switch (ch) {
    case '?': area.g[ty][tx] = 'U'; coinPop(tx, ty); break;
    case '1': area.g[ty][tx] = 'U'; spawnItem('oneup', tx, ty); break;
    case 'M': area.g[ty][tx] = 'U'; spawnItem(hero.big ? 'flower' : 'mush', tx, ty); break;
    case 'T': area.g[ty][tx] = 'U'; spawnItem('star', tx, ty); break;
    case 'C': {
      const k = tx + ',' + ty, st = area.cc.get(k) || { n: 0, t0: tick };
      st.n++; area.cc.set(k, st); coinPop(tx, ty);
      if (st.n >= 10 || tick - st.t0 > 240) area.g[ty][tx] = 'U';
      break;
    }
    case 'B':
      if (hero.big) {
        area.g[ty][tx] = '.'; sfx.brk(); addScore(50);
        for (const [dx, dy, vx, vy] of [[0, 0, -1.2, -5], [8, 0, 1.2, -5], [0, 8, -1, -3.5], [8, 8, 1, -3.5]])
          debris.push({ x: tx * TS + dx, y: ty * TS + dy, vx, vy, r: 0 });
        bumps.pop();
      } else sfx.bump();
      break;
    default: sfx.bump();
  }
}
function coinPop(tx, ty) {
  coins++; addScore(200); sfx.coin(); checkCoins();
  items.push({ kind: 'popcoin', x: tx * TS, y: ty * TS - 16, vy: -5, t: 0 });
}
function checkCoins() { if (coins >= 100) { coins -= 100; lives++; sfx.oneUp(); textAt(hero.x, hero.y - 8, '1UP'); } }
function spawnItem(kind, tx, ty) {
  sfx.sprout();
  items.push({ kind, x: tx * TS, y: ty * TS, vx: 0, vy: 0, rise: 16, t: 0, dir: 1 });
}
function addScore(v) { score += v; }
function textAt(x, y, s) { texts.push({ x, y, s: String(s), t: 0 }); }
const COMBO = [100, 200, 400, 500, 800, 1000, 2000, 4000, 5000, 8000];
function comboScore(n, x, y) {
  if (n >= COMBO.length) { lives++; sfx.oneUp(); textAt(x, y, '1UP'); return; }
  addScore(COMBO[n]); textAt(x, y, COMBO[n]);
}

// ---------------- 敌人 ----------------
function activate() {
  while (pending.length && pending[0].x * TS < camX + W + 32) {
    const d = pending.shift();
    const e = { kind: d.t, x: d.x * TS, y: (d.y + 1) * TS - 14, w: 14, h: 14, vx: -0.5, vy: 0, dead: false, t: 0, onGround: false };
    switch (d.t) {
      case 'g': break;
      case 'k': case 'r': e.kind = 'koopa'; e.red = d.t === 'r'; e.shell = false; break;
      case 'p': e.kind = 'koopa'; e.wing = true; break;
      case 'plant': e.kind = 'plant'; e.px = d.x * TS + 16; e.base = d.y * TS; e.off = 0; e.phase = 'hide'; e.pt = 60; e.w = 12; e.h = 22; e.x = e.px - 6; e.vx = 0; break;
      case 'pod': e.kind = 'pod'; e.x = d.x * TS + 1; e.base = 13 * TS; e.y = e.base + 20; e.vy = 0; e.wait = 30 + (d.x * 13) % 60; e.vx = 0; break;
      case 'boss': e.kind = 'boss'; e.x = d.x * TS; e.y = 10 * TS - 30; e.w = 28; e.h = 30; e.hp = d.hp || 5; e.home = e.x; e.fireT = 120; e.jumpT = 150; e.hammer = !!d.hammer; e.hamT = 80; e.vx = 0; e.dir = -1; break;
    }
    ents.push(e);
  }
}
function flipKill(e, pts, dir = 1) {
  if (e.dead) return;
  e.dead = true; e.flip = true; e.vy = -4; e.vx = dir * 1; e.t = 0;
  if (pts) { addScore(pts); textAt(e.x, e.y - 6, pts); }
  sfx.kick();
}
function stomp(e) {
  if (e.kind === 'g') { e.dead = true; e.squash = 30; e.vx = 0; }
  else if (e.kind === 'koopa') {
    if (e.wing) { e.wing = false; e.vy = 0; }
    else if (!e.shell) { e.shell = true; e.vx = 0; e.h = 14; e.shellT = 0; }
    else if (e.vx !== 0) { e.vx = 0; e.shellT = 0; }
    else { kickShell(e); return; }
  } else if (e.kind === 'bullet') { e.dead = true; e.flip = true; e.vy = 0; e.vx = 0; }
  sfx.stomp();
  comboScore(combo, e.x, e.y - 8); combo++;
  hero.vy = input.jump ? -5.4 : -3.8;
}
function kickShell(e) {
  e.vx = (hero.x + hero.w / 2 < e.x + e.w / 2) ? 3.4 : -3.4; e.kickT = 12; e.shellT = 0; e.chain = 0;
  sfx.kick(); addScore(400); textAt(e.x, e.y - 6, 400);
}
function updEnemy(e) {
  e.t++;
  if (e.flip) { e.vy += 0.3; e.y += e.vy; e.x += e.vx; if (e.y > H + 40) e.gone = true; return; }
  if (e.squash) { if (--e.squash <= 0) e.gone = true; return; }
  if (e.dead) { e.gone = true; return; }
  switch (e.kind) {
    case 'g': case 'koopa': {
      if (e.kind === 'koopa' && e.shell && e.vx === 0) {
        e.shellT++;
        if (e.shellT > 420) { e.shell = false; e.vx = hero.x < e.x ? -0.5 : 0.5; e.y -= 0; }
      }
      if (e.kind === 'koopa' && e.wing) {
        e.vy = Math.min(e.vy + 0.22, 3.5);
        const r = moveBody(e);
        if (r.hitX) e.vx *= -1;
        if (e.onGround) e.vy = -4;
      } else {
        e.vy = Math.min(e.vy + 0.3, 4);
        const r = moveBody(e);
        if (r.hitX) { e.vx *= -1; if (e.shell && Math.abs(e.vx) > 1 && e.x > camX - 16 && e.x < camX + W) sfx.bump(); }
        if (e.red && !e.shell && e.onGround) {
          const fx = e.vx > 0 ? e.x + e.w + 1 : e.x - 1;
          if (!solidPx(fx, e.y + e.h + 2) && tileAt(Math.floor(fx / TS), Math.floor((e.y + e.h + 2) / TS)) !== 'Q') e.vx *= -1;
        }
      }
      if (e.kickT) e.kickT--;
      if (e.y > H + 32) e.gone = true;
      if (e.x < camX - 120 || e.x > camX + W + 400) e.gone = true;
      break;
    }
    case 'plant': {
      const near = Math.abs(hero.x + hero.w / 2 - e.px) < 28;
      e.pt--;
      if (e.phase === 'hide') { if (e.pt <= 0 && !near) { e.phase = 'up'; } }
      else if (e.phase === 'up') { e.off += 0.6; if (e.off >= 24) { e.off = 24; e.phase = 'stay'; e.pt = 80; } }
      else if (e.phase === 'stay') { if (e.pt <= 0) e.phase = 'down'; }
      else if (e.phase === 'down') { e.off -= 0.6; if (e.off <= 0) { e.off = 0; e.phase = 'hide'; e.pt = 90; } }
      e.y = e.base - e.off; e.h = Math.max(0, e.off - 2);
      if (e.x < camX - 64) e.gone = true;
      break;
    }
    case 'pod':
      if (e.wait > 0) { e.wait--; if (!e.wait) { e.vy = -6.3; } break; }
      e.vy += 0.17; e.y += e.vy;
      if (e.y > e.base + 20 && e.vy > 0) { e.y = e.base + 20; e.wait = 70; e.vy = 0; parts.burst(e.x + 7, e.base, { n: 6, color: ['#ffb030', '#ff6a1a'], speed: 60, life: 0.4, size: 2, gravity: 200 }); }
      break;
    case 'bullet':
      e.x += e.vx;
      if (e.x < camX - 40 || e.x > camX + W + 40) e.gone = true;
      break;
    case 'bfire':
      e.x += e.vx; e.y += (e.ty - e.y) * 0.03;
      if (e.x < camX - 40) e.gone = true;
      break;
    case 'hammer':
      e.vy += 0.2; e.x += e.vx; e.y += e.vy; e.rot = (e.rot || 0) + 0.3;
      if (e.y > H + 20) e.gone = true;
      break;
    case 'boss': updBoss(e); break;
  }
}
function updBoss(e) {
  if (e.falling) { e.vy = Math.min(e.vy + 0.15, 3); e.y += e.vy; if (e.y > H + 40) e.gone = true; return; }
  const dist = hero.x - e.x;
  e.dir = dist < 0 ? -1 : 1;
  if (!e.walkT || --e.walkT <= 0) { e.walkT = 40 + (e.t % 3) * 25; e.vx = (e.x > e.home + 4 ? -0.4 : e.x < e.home - 40 ? 0.4 : (Math.random() < 0.5 ? -0.4 : 0.4)); }
  e.vy = Math.min(e.vy + 0.25, 4);
  moveBody(e);
  if (e.onGround && --e.jumpT <= 0) { e.vy = -4.2; e.jumpT = 140 + (e.t % 80); }
  if (--e.fireT <= 0 && Math.abs(dist) < W) {
    e.fireT = 130 + (e.t % 70);
    const ty = hero.y + hero.h - 12 + [0, -16, 8][e.t % 3];
    ents.push({ kind: 'bfire', x: e.x - 20, y: e.y + 6, w: 22, h: 7, vx: -1.7, ty, t: 0 });
    sfx.bossFire();
  }
  if (e.hammer && --e.hamT <= 0 && Math.abs(dist) < W) {
    e.hamT = 45 + (e.t % 40);
    ents.push({ kind: 'hammer', x: e.x + 8, y: e.y - 6, w: 10, h: 10, vx: -0.9 - (e.t % 5) * 0.25, vy: -4.6, t: 0 });
  }
  if (e.y > H + 40) e.gone = true;
}
function enemyInteract() {
  // 移动的龟壳击杀其他敌人；普通敌人互相掉头
  for (const a of ents) {
    if (a.dead || a.flip || a.kind === 'plant' || a.kind === 'pod' || a.kind === 'boss') continue;
    for (const b of ents) {
      if (a === b || b.dead || b.flip || b.kind === 'pod' || b.kind === 'boss' || b.kind === 'bfire' || b.kind === 'hammer') continue;
      if (a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y) continue;
      if (a.kind === 'koopa' && a.shell && Math.abs(a.vx) > 1) {
        if (b.kind === 'plant' && b.off < 4) continue;
        flipKill(b, 0, a.vx > 0 ? 1 : -1); comboScore(a.chain || 0, b.x, b.y - 6); a.chain = (a.chain || 0) + 1;
        if (b.kind === 'koopa' && b.shell && Math.abs(b.vx) > 1) flipKill(a, 0, -1);
      } else if ((a.kind === 'g' || a.kind === 'koopa') && (b.kind === 'g' || b.kind === 'koopa') && !(b.shell && Math.abs(b.vx) > 1) && a.onGround && b.onGround) {
        if ((a.x < b.x && a.vx > 0) || (a.x > b.x && a.vx < 0)) a.vx *= -1;
      }
    }
  }
}
function heroVsEnemies() {
  if (hero.state !== 'play') return;
  const hx = hero.x, hy = hero.y, hw = hero.w, hh = hero.h;
  for (const e of ents) {
    if (e.dead || e.flip || e.gone) continue;
    if (e.kind === 'plant' && e.off < 4) continue;
    if (hx + hw <= e.x + 1 || e.x + e.w <= hx + 1 || hy + hh <= e.y + 1 || e.y + e.h <= hy + 2) continue;
    if (hero.star > 0 && e.kind !== 'boss' && e.kind !== 'bfire' && e.kind !== 'hammer' && e.kind !== 'pod') { flipKill(e, 0, hero.vx >= 0 ? 1 : -1); comboScore(combo, e.x, e.y - 6); combo++; continue; }
    const stompable = e.kind === 'g' || e.kind === 'koopa' || e.kind === 'bullet';
    if (stompable && hero.vy > 0 && hy + hh - e.y < 10) { stomp(e); continue; }
    if (e.kind === 'koopa' && e.shell && e.vx === 0) { kickShell(e); continue; }
    if (e.kind === 'koopa' && e.shell && e.kickT) continue;
    hurt();
    return;
  }
  for (const b of bars) {
    for (let i = 1; i < b.n; i++) {
      const fx = b.cx + Math.cos(b.a) * i * 8, fy = b.cy + Math.sin(b.a) * i * 8;
      if (fx > hx - 3 && fx < hx + hw + 3 && fy > hy - 3 && fy < hy + hh + 3) { hurt(); return; }
    }
  }
}
function hurt() {
  if (hero.inv > 0 || hero.star > 0 || hero.state !== 'play') return;
  if (hero.big) {
    hero.fire = false; hero.growT = 40; hero.growDir = -1; freeze = 40; hero.inv = 140; sfx.hurt();
  } else die();
}
function die() {
  if (hero.state === 'die') return;
  hero.state = 'die'; hero.dieT = 0; hero.vx = 0; hero.vy = 0; hero.star = 0;
  if (hero.big) setBig(false); hero.fire = false;
  KIT.stopMusic(); sfx.die();
}

// ---------------- 道具 ----------------
function updItem(it) {
  it.t++;
  if (it.kind === 'popcoin') { it.vy += 0.35; it.y += it.vy; if (it.t > 28) { it.gone = true; textAt(it.x, it.y, 200); parts.burst(it.x + 8, it.y + 8, { n: 6, color: ['#fff3a0', '#ffd84a'], speed: 50, life: 0.3, size: 2, gravity: 0, shape: 'spark' }); } return; }
  if (it.rise > 0) { it.rise--; it.y -= 1; if (!it.rise && it.kind !== 'flower') it.vx = it.kind === 'star' ? 1.2 : 1; return; }
  if (it.kind === 'flower') return;
  it.vy = Math.min(it.vy + (it.kind === 'star' ? 0.22 : 0.3), 4);
  const b = { x: it.x, y: it.y, w: 16, h: 16, vx: it.vx, vy: it.vy };
  const r = moveBody(b);
  it.x = b.x; it.y = b.y; it.vy = b.vy;
  if (r.hitX) it.vx = -it.vx;
  if (it.kind === 'star' && b.onGround) it.vy = -4.2;
  if (it.y > H + 20) it.gone = true;
}
function heroVsItems() {
  if (hero.state !== 'play') return;
  for (const it of items) {
    if (it.gone || it.kind === 'popcoin' || it.rise > 8) continue;
    if (hero.x + hero.w <= it.x + 2 || it.x + 14 <= hero.x || hero.y + hero.h <= it.y + 2 || it.y + 15 <= hero.y) continue;
    it.gone = true;
    switch (it.kind) {
      case 'mush': if (!hero.big) { hero.growT = 40; hero.growDir = 1; freeze = 40; } addScore(1000); textAt(it.x, it.y, 1000); sfx.power(); break;
      case 'flower': if (!hero.big) { hero.growT = 40; hero.growDir = 1; freeze = 40; hero.fireNext = true; } else hero.fire = true; addScore(1000); textAt(it.x, it.y, 1000); sfx.power(); break;
      case 'oneup': lives++; sfx.oneUp(); textAt(it.x, it.y, '1UP'); break;
      case 'star': hero.star = 600; addScore(1000); textAt(it.x, it.y, 1000); sfx.power(); KIT.music('star-power'); break;
    }
  }
  // 地图上的金币
  const l = Math.floor(hero.x / TS), r = Math.floor((hero.x + hero.w - 1) / TS), t = Math.floor(hero.y / TS), b = Math.floor((hero.y + hero.h - 1) / TS);
  for (let tx = l; tx <= r; tx++) for (let ty = t; ty <= b; ty++) if (tileAt(tx, ty) === 'o') {
    area.g[ty][tx] = '.'; coins++; addScore(200); sfx.coin(); checkCoins();
    parts.burst(tx * TS + 8, ty * TS + 8, { n: 6, color: ['#fff3a0', '#ffd84a'], speed: 60, life: 0.3, size: 2, gravity: 0, shape: 'spark' });
  }
}
const starMusic = () => hero && hero.star > 0;

// ---------------- 火球 ----------------
function shootFire() {
  if (!hero.fire || fballs.length >= 2 || hero.crouch) return;
  fballs.push({ x: hero.x + (hero.dir > 0 ? hero.w : -8), y: hero.y + 8, w: 8, h: 8, vx: 3.8 * hero.dir, vy: 2, t: 0 });
  sfx.fire(); hero.throwT = 8;
}
function updFire(f) {
  f.t++;
  f.vy = Math.min(f.vy + 0.4, 4.5);
  const r = moveBody(f);
  if (f.onGround) f.vy = -3.2;
  if (r.hitX || r.hitHead) { f.gone = true; puff(f.x + 4, f.y + 4); return; }
  if (f.x < camX - 16 || f.x > camX + W + 16 || f.y > H) { f.gone = true; return; }
  for (const e of ents) {
    if (e.dead || e.flip || e.kind === 'pod' || e.kind === 'hammer') continue;
    if (e.kind === 'plant' && e.off < 4) continue;
    if (f.x + 8 <= e.x || e.x + e.w <= f.x || f.y + 8 <= e.y || e.y + e.h <= f.y) continue;
    f.gone = true; puff(f.x + 4, f.y + 4);
    if (e.kind === 'boss') { e.hp--; e.hit = 10; sfx.bump(); if (e.hp <= 0) { flipKill(e, 5000, 1); textAt(e.x, e.y, 5000); sfx.bossFall(); } }
    else if (e.kind === 'bfire') { e.gone = true; }
    else flipKill(e, 200, f.vx > 0 ? 1 : -1);
    return;
  }
}
function puff(x, y) { parts.burst(x, y, { n: 6, color: ['#fff', '#ffb030', '#ff6a1a'], speed: 60, life: 0.25, size: 2.5, gravity: 0 }); }

// ---------------- 升降台 / 火棒 / 炮台 ----------------
function updLifts() {
  for (const L of lifts) {
    const ox = L.x, oy = L.y;
    if (L.fall) {
      if (L.stood > 0) { L.stood++; if (L.stood > 18) L.falling = true; }
      if (L.falling) { L.vy = Math.min(L.vy + 0.12, 3); L.y += L.vy; }
    } else {
      L.t += Math.abs(L.sp) / Math.max(1, L.range) * Math.PI;
      const k = (1 - Math.cos(L.t)) / 2 * Math.sign(L.sp);
      if (L.ax === 'x') L.x = L.ox + k * L.range; else L.y = L.oy + k * L.range;
    }
    L.dx = L.x - ox; L.dy = L.y - oy;
  }
}
function updCannons() {
  for (const c of cannons) {
    const cx = c.x * TS + 8;
    if (cx < camX - 16 || cx > camX + W + 16) continue;
    if (--c.t > 0) continue;
    c.t = 160 + (c.x * 31) % 100;
    const d = hero.x - cx;
    if (Math.abs(d) < 28 || Math.abs(d) > 300) continue;
    if (area.g[c.y][c.x + Math.sign(d)] && SOLID.has(area.g[c.y][c.x + Math.sign(d)])) continue;
    ents.push({ kind: 'bullet', x: cx - 8 + Math.sign(d) * 8, y: c.y * TS + 1, w: 16, h: 12, vx: Math.sign(d) * 1.3, vy: 0, t: 0 });
    KIT.noise(0.2, { vol: 0.1, lp: 800 });
    shake = 3;
  }
}
let shake = 0;

// ---------------- 主角更新 ----------------
const ACC_W = 0.075, ACC_R = 0.11, MAX_W = 1.45, MAX_R = 2.45, FRIC = 0.085, SKID = 0.2;
function updHero() {
  const h = hero;
  if (h.inv > 0) h.inv--;
  if (h.star > 0) { h.star--; if (h.star === 0) KIT.music(theme.music); }
  if (h.throwT) h.throwT--;
  switch (h.state) {
    case 'die':
      h.dieT++;
      if (h.dieT === 30) h.vy = -5;
      if (h.dieT > 30) { h.vy += 0.22; h.y += h.vy; }
      if (h.dieT === 150) loseLife();
      return;
    case 'pipeIn':
      h.pipeT++;
      if (h.pipeDir === 'down') h.y += 0.8; else h.x += 0.6;
      if (h.pipeT === 36) {
        const w = h.warp;
        iris = { r: 260, to: 0, cb: () => { const out = { tx: w.tx, ty: w.ty, out: w.out }; loadArea(w.to, out); iris = { r: 0, to: 260 }; } };
      }
      return;
    case 'pipeOut':
      h.pipeT++; h.y -= 0.8;
      if (h.y + h.h <= h.outY || h.pipeT > 60) { h.state = 'play'; h.behind = false; }
      return;
    case 'flag': {
      const bottom = 12 * TS;
      if (h.y + h.h < bottom) { h.y = Math.min(bottom - h.h, h.y + 2); }
      if (clearSeq.flagY < 11 * TS - 4) clearSeq.flagY += 2;
      else if (h.y + h.h >= bottom) { clearSeq.wait++; if (clearSeq.wait > 25) { h.state = 'walkout'; h.dir = 1; h.x += 10; h.vy = 0; KIT.arp([523, 659, 784], 0.08, { type: 'square', vol: 0.04 }); } }
      return;
    }
    case 'walkout': {
      h.vx = 1.2; h.vy = Math.min(h.vy + 0.4, 4);
      moveBody(h);
      h.anim += 0.18;
      const door = (area.flagX + 6) * TS + 8 - h.w / 2;
      if (h.x >= door) { h.state = 'gone'; clearSeq.phase = 'tally'; sfx.clear(); }
      return;
    }
    case 'axe': case 'gone': case 'npc': return;
  }
  // ---- 正常操控 ----
  const ice = theme.ice;
  let dir = (input.r ? 1 : 0) - (input.l ? 1 : 0);
  h.crouch = h.big && input.d && h.onGround;
  if (h.crouch) dir = 0;
  const acc = (input.run ? ACC_R : ACC_W) * (ice ? 0.45 : 1) * (h.onGround ? 1 : 0.85);
  const max = input.run ? MAX_R : MAX_W;
  h.skid = false;
  if (dir) {
    if (h.vx * dir < 0) { h.vx += dir * SKID * (ice ? 0.3 : 1); if (h.onGround) { h.skid = true; if (tick % 4 === 0) parts.burst(h.x + h.w / 2, h.y + h.h, { n: 1, color: '#e8e0d0', speed: 20, life: 0.3, size: 2, gravity: -20 }); } }
    else h.vx += dir * acc;
    if (Math.abs(h.vx) > max) h.vx -= Math.sign(h.vx) * Math.min(Math.abs(h.vx) - max, FRIC);
    if (h.onGround) h.dir = dir;
  } else if (h.onGround) {
    const f = FRIC * (ice ? 0.25 : 1) * (h.crouch ? 0.7 : 1);
    h.vx -= Math.sign(h.vx) * Math.min(Math.abs(h.vx), f);
  }
  if (input.jumpP) h.jumpBuf = 7; else if (h.jumpBuf) h.jumpBuf--;
  if (h.onGround) h.coyote = 6; else if (h.coyote) h.coyote--;
  if (h.jumpBuf && h.coyote) {
    h.vy = -(4.6 + Math.min(Math.abs(h.vx), 2.4) * 0.27); h.jumpBuf = 0; h.coyote = 0; h.onGround = false; h.lift = null;
    sfx.jump(h.big);
  }
  if (input.runP) shootFire();
  h.vy = Math.min(h.vy + (h.vy < 0 && input.jump ? 0.19 : 0.5), 5);
  // 蹲下时缩小碰撞盒
  const wantH = !h.big ? 15 : h.crouch ? 15 : 28;
  if (wantH !== h.h) {
    if (wantH > h.h && solidPx(h.x + 1, h.y + h.h - wantH) || wantH > h.h && solidPx(h.x + h.w - 2, h.y + h.h - wantH)) { /* 头顶有砖，保持蹲姿 */ }
    else { h.y += h.h - wantH; h.h = wantH; }
  }
  // 升降台携带
  if (h.lift) { h.x += h.lift.dx; h.y += h.lift.dy; }
  const wasGround = h.onGround;
  const r = moveBody(h);
  if (r.hitX) h.vx = 0;
  if (r.hitHead) bumpTile(r.hitHead.tx, r.hitHead.ty);
  h.lift = null;
  if (h.vy >= 0) {
    for (const L of lifts) {
      const top = L.y;
      if (h.x + h.w > L.x + 1 && h.x < L.x + L.w - 1 && h.y + h.h >= top - 1 && h.y + h.h - h.vy - (L.dy > 0 ? L.dy : 0) <= top + 2) {
        h.y = top - h.h; h.vy = 0; h.onGround = true; h.lift = L; if (L.fall && !L.stood) L.stood = 1; break;
      }
    }
  }
  if (h.onGround) combo = 0;
  if (h.onGround && !wasGround && h.vy === 0) parts.burst(h.x + h.w / 2, h.y + h.h, { n: 3, color: '#ffffffaa', speed: 30, life: 0.25, size: 2, gravity: -10 });
  if (h.x < camX) { h.x = camX; if (h.vx < 0) h.vx = 0; }
  if (h.x + h.w > area.w * TS) h.x = area.w * TS - h.w;
  h.anim += Math.abs(h.vx) * 0.13;
  // 致命：掉坑 / 岩浆
  if (h.y > H + 8) { die(); return; }
  const l = Math.floor(h.x / TS), rr = Math.floor((h.x + h.w - 1) / TS), b = Math.floor((h.y + h.h - 2) / TS);
  for (let tx = l; tx <= rr; tx++) if (tileAt(tx, b) === '~') { die(); return; }
  // 水管
  for (const w of area.warps) {
    if (w.dir === 'down' && input.d && h.onGround && Math.abs(h.y + h.h - w.y * TS) < 1 && h.x >= w.x * TS + 2 && h.x + h.w <= w.x * TS + 30) { enterPipe(w, 'down'); return; }
    if (w.dir === 'right' && input.r && h.onGround && h.x + h.w >= w.x * TS - 1 && h.x + h.w <= w.x * TS + 2 && Math.abs(h.y + h.h - (w.y + 2) * TS) < 1) { enterPipe(w, 'right'); return; }
  }
  // 中途点
  if (areaKey === 'main' && area.mid > 0 && h.x > area.mid * TS) checkpoint = true;
  // 旗杆
  if (area.flagX > 0 && h.x + h.w >= area.flagX * TS + 6) {
    h.state = 'flag'; h.vx = 0; h.vy = 0; h.x = area.flagX * TS + 8 - h.w; h.dir = 1; h.star = 0; KIT.stopMusic(); sfx.flag();
    const hy = h.y + h.h;
    const pts = hy < 72 ? 5000 : hy < 104 ? 2000 : hy < 136 ? 800 : hy < 168 ? 400 : 100;
    addScore(pts); textAt(area.flagX * TS + 12, h.y, pts);
    clearSeq = { phase: 'flag', flagY: 3 * TS + 2, wait: 0, fw: 0, fwT: 0, digit: timeLeft % 10, t: 0 };
  }
  // 斧头
  if (area.axe && h.x + h.w >= area.axe[0] * TS + 2) startAxe(area.axe[0], area.axe[1]);
}
function enterPipe(w, dir) {
  hero.state = 'pipeIn'; hero.pipeDir = dir; hero.pipeT = 0; hero.warp = w; hero.behind = true; hero.vx = 0; hero.vy = 0;
  if (dir === 'down') hero.x = w.x * TS + 16 - hero.w / 2;
  sfx.pipe(); KIT.stopMusic();
}
function startAxe(tx, ty) {
  area.g[ty][tx] = '.'; area.axe = null;
  hero.state = 'axe'; hero.vx = 0; hero.vy = 0; KIT.stopMusic();
  const bridge = [];
  for (let x = tx - 1; x >= 0; x--) { let found = false; for (let y = 0; y < ROWS; y++) if (area.g[y][x] === '=') { bridge.push([x, y]); found = true; } if (!found && bridge.length) break; }
  clearSeq = { phase: 'bridge', bridge, t: 0 };
}

// ---------------- 流程 ----------------
function loseLife() {
  lives--;
  if (lives <= 0) { gameOver(); return; }
  iris = { r: 260, to: 0, cb: () => { startLevel(lvIdx, true); iris = null; } };
}
function gameOver() {
  state = 'over'; KIT.stopMusic(); sfx.over();
  saveBest();
  $('over-stats').innerHTML = rows([[T('stScore'), score.toLocaleString()], [T('stWorld'), lvName(lvIdx)], [T('stBest'), prog.best.toLocaleString()]]);
  $('screen-over').classList.remove('hidden');
}
function saveBest() { if (score > prog.best) { prog.best = score; store.set('prog', prog); } }
function levelClear() {
  if (!prog.cleared.includes(lvIdx)) prog.cleared.push(lvIdx);
  prog.unlocked = Math.max(prog.unlocked, Math.min(7, lvIdx + 1));
  saveBest(); store.set('prog', prog);
  if (lvDef.final) { winGame(); return; }
  checkpoint = false;
  iris = { r: 260, to: 0, cb: () => { startLevel(lvIdx + 1); iris = null; } };
}
function winGame() {
  state = 'win'; KIT.music('puzzle-calm');
  $('win-stats').innerHTML = rows([[T('stScore'), score.toLocaleString()], [T('stCoins'), coins], [T('stLives'), lives], [T('stBest'), prog.best.toLocaleString()]]);
  $('screen-win').classList.remove('hidden');
}
const rows = L => L.map(([a, b]) => `<span>${a}</span><b>${b}</b>`).join('');
const lvName = i => ['1-1', '1-2', '1-3', '1-4', '2-1', '2-2', '2-3', '2-4'][i] + ' ' + T('lvNames')[i];

function updClearSeq() {
  const s = clearSeq; if (!s) return;
  s.t++;
  if (s.phase === 'tally') {
    if (timeLeft > 0) { const n = Math.min(timeLeft, 2); timeLeft -= n; addScore(50 * n); if (s.t % 3 === 0) sfx.tick(); }
    else { s.phase = 'fw'; s.t = 0; s.fw = [1, 3, 6].includes(s.digit) ? s.digit : 0; }
  } else if (s.phase === 'fw') {
    if (s.fw > 0 && s.t % 30 === 0) {
      s.fw--; const x = (area.flagX + 4) * TS + Math.random() * 90, y = 30 + Math.random() * 60;
      parts.burst(x, y, { n: 30, color: ['#ff5a5a', '#ffd84a', '#5ad8ff', '#ffffff', '#9a7aff'], speed: 120, life: 0.9, size: 2.5, gravity: 40, shape: 'spark' });
      addScore(500); textAt(x, y, 500); sfx.firework(); shake = 2;
    }
    if (s.fw === 0 && s.t > 50) { s.phase = 'done'; levelClear(); }
  } else if (s.phase === 'bridge') {
    if (s.t % 4 === 0 && s.bridge.length) { const [x, y] = s.bridge.shift(); area.g[y][x] = '.'; sfx.collapse(); }
    for (const e of ents) if (e.kind === 'boss' && !e.flip && !e.falling) { const below = Math.floor((e.y + e.h + 1) / TS), l = Math.floor(e.x / TS), r = Math.floor((e.x + e.w - 1) / TS); let sup = false; for (let tx = l; tx <= r; tx++) if (SOLID.has(tileAt(tx, below))) sup = true; if (!sup) { e.falling = true; e.vy = 0; sfx.bossFall(); addScore(5000); textAt(e.x, e.y, 5000); } }
    for (const e of ents) if (e.kind === 'bfire' || e.kind === 'hammer') e.gone = true;
    if (!s.bridge.length && s.t > 30) { s.phase = 'walk'; s.t = 0; KIT.music('puzzle-calm'); }
  } else if (s.phase === 'walk') {
    hero.vx = 1; hero.vy = Math.min(hero.vy + 0.4, 4); moveBody(hero); hero.anim += 0.15; hero.dir = 1;
    if (area.npc && hero.x + hero.w >= area.npc[0] * TS - 4) { hero.vx = 0; s.phase = 'talk'; s.t = 0; msg = { text: T(lvDef.final ? 'npcFinal' : 'npcThanks'), t: 0 }; }
    if (hero.x + hero.w >= area.w * TS - 2) { s.phase = 'talk'; s.t = 0; }
  } else if (s.phase === 'talk') {
    if (s.t > 200) { s.phase = 'done'; levelClear(); }
  }
}

function step() {
  tick++;
  readInput();
  if (state === 'intro') { introT++; if (introT > 140) { state = 'play'; iris = { r: 0, to: 260 }; KIT.music(theme.music); } return; }
  if (state !== 'play') return;
  if (iris && iris.cb) { iris.r -= 9; if (iris.r <= 0) { const cb = iris.cb; iris = null; cb(); } return; }
  if (iris && !iris.cb) { iris.r += 9; if (iris.r >= iris.to) iris = null; }
  if (freeze > 0) {
    freeze--;
    if (hero.growT) {
      hero.growT--;
      if (hero.growT === 0) { if (hero.growDir > 0) { setBig(true); if (hero.fireNext) hero.fire = true; } else { setBig(false); } hero.fireNext = false; }
    }
    return;
  }
  updLifts();
  updHero();
  if (hero.state === 'die' || hero.state === 'pipeIn' || hero.state === 'pipeOut') { parts.update(1 / 60); return; }
  if (clearSeq) updClearSeq();
  // 计时
  if (hero.state === 'play') {
    if (++timeAcc >= 24) { timeAcc = 0; timeLeft--; if (timeLeft === 100 && !hurried) { hurried = true; sfx.hurry(); } if (timeLeft <= 0) { timeLeft = 0; die(); } }
  }
  // 摄像机（只向前）
  const target = hero.x + hero.w / 2 - W * 0.42;
  camX = clamp(Math.max(camX, Math.min(target, camX + 4)), 0, Math.max(0, area.w * TS - W));
  activate();
  updCannons();
  for (const b of bars) b.a += b.sp;
  for (const e of ents) updEnemy(e);
  enemyInteract();
  heroVsEnemies();
  for (const it of items) updItem(it);
  heroVsItems();
  for (const f of fballs) updFire(f);
  for (const d of debris) { d.vy += 0.3; d.x += d.vx; d.y += d.vy; d.r += 0.3; }
  for (const b of bumps) b.t++;
  for (const t of texts) { t.t++; t.y -= 0.6; }
  ents = ents.filter(e => !e.gone);
  items = items.filter(i => !i.gone);
  fballs = fballs.filter(f => !f.gone);
  debris = debris.filter(d => d.y < H + 20);
  bumps = bumps.filter(b => b.t < 10);
  texts = texts.filter(t => t.t < 50);
  if (msg) msg.t++;
  if (shake > 0) shake -= 0.25;
  parts.update(1 / 60);
}

// ---------------- 绘制 ----------------
function drawBG(c) {
  const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, theme.sky[0]); g.addColorStop(1, theme.sky[1]);
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  const bg = theme.bg;
  const par = (k, span) => { const o = camX * k; return { o, i0: Math.floor(o / span) - 1, i1: Math.floor((o + W) / span) + 1 }; };
  if (bg === 'hills' || bg === 'sky' || bg === 'sunset') {
    const cloudCol = bg === 'sunset' ? '#ffe4d0' : '#ffffff';
    let p = par(0.2, 120);
    for (let i = p.i0; i <= p.i1; i++) { const x = i * 120 - p.o + hash(i) * 40, y = 20 + hash(i, 1) * 50; cloud(c, x, y, 1 + hash(i, 2) * 0.6, cloudCol, 0.85); }
    if (bg === 'hills') {
      p = par(0.35, 220);
      for (let i = p.i0; i <= p.i1; i++) { const x = i * 220 - p.o + hash(i, 3) * 60, hh = 50 + hash(i, 4) * 40; hill(c, x, H - 32, hh, '#5bb85a', '#3d8e40'); }
      p = par(0.6, 150);
      for (let i = p.i0; i <= p.i1; i++) { const x = i * 150 - p.o + hash(i, 5) * 50; hill(c, x, H - 32, 26 + hash(i, 6) * 16, '#7ad072', '#4ea84e'); }
    } else {
      p = par(0.35, 260);
      for (let i = p.i0; i <= p.i1; i++) { const x = i * 260 - p.o + hash(i, 7) * 80, y = 120 + hash(i, 8) * 50; island(c, x, y, bg === 'sunset'); }
      p = par(0.55, 140);
      for (let i = p.i0; i <= p.i1; i++) { const x = i * 140 - p.o + hash(i, 9) * 50, y = 150 + hash(i, 10) * 60; cloud(c, x, y, 1.4, cloudCol, 0.7); }
    }
    if (bg === 'sunset') { c.fillStyle = 'rgba(255,240,200,.85)'; c.beginPath(); c.arc(W * 0.78, 70, 26, 0, Math.PI * 2); c.fill(); }
  } else if (bg === 'cave') {
    const p = par(0.4, 64);
    for (let i = p.i0; i <= p.i1; i++) {
      const x = i * 64 - p.o; c.fillStyle = '#18213d';
      c.beginPath(); c.moveTo(x, 0); c.lineTo(x + 14 + hash(i) * 10, 30 + hash(i, 1) * 40); c.lineTo(x + 32, 0); c.fill();
      if (hash(i, 2) > 0.5) { c.fillStyle = Math.sin(tick * 0.08 + i) > 0.3 ? '#7fd8ff' : '#2a6a9a'; c.fillRect(x + 20, 120 + hash(i, 3) * 60, 2, 2); }
    }
  } else if (bg === 'castle') {
    const p = par(0.3, 80);
    for (let i = p.i0; i <= p.i1; i++) {
      const x = i * 80 - p.o; c.fillStyle = '#24121a'; c.fillRect(x, 40, 40, H);
      c.fillStyle = Math.sin(tick * 0.05 + i * 2) > -0.6 ? '#f0a030' : '#a05a18'; c.fillRect(x + 14, 70, 10, 16);
      c.fillStyle = '#3a1820'; for (let k = 0; k < 40; k += 10) c.fillRect(x + k, 34, 6, 6);
    }
    const lg = c.createLinearGradient(0, H - 80, 0, H); lg.addColorStop(0, 'rgba(255,90,20,0)'); lg.addColorStop(1, 'rgba(255,90,20,.25)');
    c.fillStyle = lg; c.fillRect(0, H - 80, W, 80);
  } else if (bg === 'snow') {
    let p = par(0.25, 180);
    for (let i = p.i0; i <= p.i1; i++) {
      const x = i * 180 - p.o + hash(i) * 40, hh = 90 + hash(i, 1) * 50, bx = H - 32;
      c.fillStyle = '#9ab8d8'; c.beginPath(); c.moveTo(x - 90, bx); c.lineTo(x, bx - hh); c.lineTo(x + 90, bx); c.fill();
      c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(x - 26, bx - hh + 30); c.lineTo(x, bx - hh); c.lineTo(x + 26, bx - hh + 30); c.lineTo(x + 8, bx - hh + 24); c.lineTo(x - 6, bx - hh + 32); c.fill();
    }
    p = par(0.55, 40);
    for (let i = p.i0; i <= p.i1; i++) { const x = i * 40 - p.o, s = 14 + hash(i, 4) * 12; c.fillStyle = '#5a86a8'; c.beginPath(); c.moveTo(x, H - 32 - s * 2); c.lineTo(x + s * 0.7, H - 32); c.lineTo(x - s * 0.7, H - 32); c.fill(); }
  } else if (bg === 'night') {
    for (let i = 0; i < 50; i++) { const x = (hash(i) * W * 2 - camX * 0.05) % W, y = hash(i, 1) * 150; c.fillStyle = `rgba(255,255,255,${0.4 + 0.6 * Math.abs(Math.sin(tick * 0.03 + i))})`; c.fillRect((x + W) % W, y, 1, 1); }
    c.fillStyle = '#fff6d0'; c.beginPath(); c.arc(W * 0.8, 46, 18, 0, Math.PI * 2); c.fill(); c.fillStyle = theme.sky[0]; c.beginPath(); c.arc(W * 0.8 + 8, 40, 16, 0, Math.PI * 2); c.fill();
    const p = par(0.4, 200);
    for (let i = p.i0; i <= p.i1; i++) hill(c, i * 200 - p.o + hash(i, 2) * 50, H - 32, 60 + hash(i, 3) * 40, '#1e2a5a', '#141e44');
    for (let i = 0; i < 8; i++) { const x = ((hash(i, 5) * 1000 - camX * 0.8) % W + W) % W, y = 120 + Math.sin(tick * 0.02 + i) * 20 + hash(i, 6) * 60; c.fillStyle = `rgba(200,255,120,${0.4 + 0.5 * Math.sin(tick * 0.1 + i)})`; c.fillRect(x, y, 2, 2); }
  }
}
function cloud(c, x, y, s, col, a) {
  c.globalAlpha = a; c.fillStyle = col;
  c.beginPath(); c.moveTo(x, y + 15 * s); c.arc(x, y + 6 * s, 9 * s, Math.PI / 2, Math.PI * 1.5); c.arc(x + 12 * s, y, 12 * s, Math.PI * 1.1, Math.PI * 1.9); c.arc(x + 26 * s, y + 6 * s, 9 * s, Math.PI * 1.5, Math.PI / 2); c.closePath(); c.fill();
  c.globalAlpha = 1;
}
function hill(c, x, base, h, col, edge) {
  c.fillStyle = edge; c.beginPath(); c.ellipse(x, base, h * 1.3 + 2, h + 2, 0, Math.PI, 0); c.fill();
  c.fillStyle = col; c.beginPath(); c.ellipse(x, base, h * 1.3, h, 0, Math.PI, 0); c.fill();
  c.fillStyle = edge; c.fillRect(x - 4, base - h * 0.6, 2, 6); c.fillRect(x + 6, base - h * 0.7, 2, 6);
}
function island(c, x, y, warm) {
  c.fillStyle = warm ? '#c88a5a' : '#b88a5a'; c.beginPath(); c.moveTo(x - 40, y); c.lineTo(x + 40, y); c.lineTo(x + 8, y + 36); c.lineTo(x - 10, y + 30); c.fill();
  c.fillStyle = warm ? '#d8a040' : '#5bb85a'; c.fillRect(x - 40, y - 6, 80, 8);
  c.fillStyle = warm ? '#a87020' : '#3d8e40'; c.fillRect(x - 40, y + 1, 80, 2);
}
function drawTiles(c) {
  const x0 = Math.max(0, Math.floor(camX / TS)), x1 = Math.min(area.w - 1, Math.floor((camX + W) / TS) + 1);
  const bmap = new Map(); for (const b of bumps) bmap.set(b.tx + ',' + b.ty, Math.sin(b.t / 10 * Math.PI) * 5);
  for (const t of area.trunks) {
    if (t.x < camX - 20 || t.x > camX + W + 20) continue;
    c.fillStyle = theme.q === 'tree' ? '#3a2614' : '#e8dcc0'; c.fillRect(Math.round(t.x - 6), t.y, 12, H - t.y);
    c.fillStyle = theme.q === 'tree' ? '#5a3a1e' : '#fff6e0'; c.fillRect(Math.round(t.x - 6), t.y, 3, H - t.y);
  }
  for (let ty = 0; ty < ROWS; ty++) for (let tx = x0; tx <= x1; tx++) {
    const ch = area.g[ty][tx];
    if (ch === '.' || ch === '1') continue;
    const x = tx * TS, y = ty * TS - (bmap.get(tx + ',' + ty) || 0);
    if (ch === 'o') { drawCoin(c, x, y, tick); continue; }
    if (ch === '~') { drawLava(c, x, y, ty > 0 && area.g[ty - 1][tx] !== '~'); continue; }
    if (ch === 'X') { drawAxe(c, x, y); continue; }
    const img = tileImg(ch, area.theme, area, tx, ty);
    if (img) c.drawImage(img, x, y);
  }
}
function drawCoin(c, x, y, t) {
  const f = Math.floor(t / 8) % 4, w = [8, 6, 2, 6][f];
  c.fillStyle = '#b06a0a'; c.fillRect(x + 8 - w / 2, y + 2, w, 12);
  c.fillStyle = '#ffd84a'; c.fillRect(x + 8 - w / 2 + (w > 2 ? 1 : 0), y + 3, Math.max(1, w - 2), 10);
  if (w > 4) { c.fillStyle = '#fff3c4'; c.fillRect(x + 8 - w / 2 + 2, y + 4, 1, 6); }
}
function drawLava(c, x, y, surface) {
  c.fillStyle = '#d83a10'; c.fillRect(x, y, 16, 16);
  c.fillStyle = '#ff7a1a'; c.fillRect(x, y + (surface ? 4 : 0), 16, surface ? 4 : 2);
  if (surface) { c.fillStyle = '#ffd04a'; for (let i = 0; i < 16; i += 4) c.fillRect(x + i, y + 2 + Math.round(Math.sin(tick * 0.12 + (x + i) * 0.3) * 2), 3, 2); }
  else if ((x / 16 + tick / 20) % 3 < 1) { c.fillStyle = '#ff9a2a'; c.fillRect(x + 6, y + 8, 3, 2); }
}
function drawAxe(c, x, y) {
  c.fillStyle = '#8a5a2a'; c.fillRect(x + 7, y + 2, 2, 14);
  c.fillStyle = '#c8c8d4'; c.beginPath(); c.moveTo(x + 9, y + 2); c.lineTo(x + 16, y); c.lineTo(x + 16, y + 10); c.lineTo(x + 9, y + 8); c.fill();
  c.fillStyle = '#ffffff'; c.fillRect(x + 14, y + 1, 1, 8);
  if (Math.floor(tick / 15) % 2) { c.fillStyle = '#fff6a0'; c.fillRect(x + 12, y - 3, 2, 2); }
}
function drawFlag(c) {
  if (area.flagX < 0) return;
  const fx = area.flagX * TS + 7;
  c.fillStyle = '#9ad86a'; c.fillRect(fx, 2 * TS + 8, 2, 10 * TS - 8);
  c.fillStyle = '#2fa84a'; c.beginPath(); c.arc(fx + 1, 2 * TS + 6, 4, 0, Math.PI * 2); c.fill();
  const fy = clearSeq && clearSeq.flagY ? clearSeq.flagY : 3 * TS + 2;
  c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(fx, fy); c.lineTo(fx - 16, fy + 7); c.lineTo(fx, fy + 14); c.fill();
  c.fillStyle = '#d8382c'; c.beginPath(); c.arc(fx - 6, fy + 7, 3, 0, Math.PI * 2); c.fill();
  // 城堡
  const cx = (area.flagX + 4) * TS, base = 13 * TS;
  const br = THEMES.castle.b;
  c.fillStyle = '#b86a3a'; c.fillRect(cx, base - 80, 80, 80);
  c.fillStyle = '#8a4a20'; for (let y = base - 80; y < base; y += 8) c.fillRect(cx, y, 80, 1);
  for (let y = base - 80; y < base; y += 8) for (let x = cx + ((y / 8) % 2 ? 0 : 8); x < cx + 80; x += 16) c.fillRect(x, y, 1, 8);
  c.fillStyle = '#b86a3a'; for (let x = cx; x < cx + 80; x += 16) c.fillRect(x, base - 88, 10, 8);
  c.fillRect(cx + 20, base - 120, 40, 40); for (let x = cx + 20; x < cx + 60; x += 14) c.fillRect(x, base - 128, 9, 8);
  c.fillStyle = '#1a0e08'; c.fillRect(cx + 30, base - 28, 20, 28); c.beginPath(); c.arc(cx + 40, base - 28, 10, Math.PI, 0); c.fill();
  c.fillRect(cx + 28, base - 108, 8, 12); c.fillRect(cx + 44, base - 108, 8, 12);
  void br;
}
function drawItems(c, behind) {
  for (const it of items) {
    if ((it.rise > 0) !== behind && it.kind !== 'popcoin') continue;
    if (it.kind === 'popcoin') { if (!behind) drawCoin(c, it.x, it.y, it.t * 2); continue; }
    const x = Math.round(it.x), y = Math.round(it.y);
    if (it.kind === 'mush') c.drawImage(MUSH, x, y);
    else if (it.kind === 'oneup') c.drawImage(ONEUP, x, y);
    else if (it.kind === 'star') c.drawImage(STARS[Math.floor(tick / 4) % 2], x, y);
    else if (it.kind === 'flower') c.drawImage(FLOWERS[Math.floor(tick / 6) % 2], x, y);
  }
}
function drawEnemy(c, e) {
  const x = Math.round(e.x), y = Math.round(e.y);
  if (e.flip) { c.save(); c.translate(x + e.w / 2, y + e.h / 2); c.scale(1, -1); c.translate(-x - e.w / 2, -y - e.h / 2); }
  switch (e.kind) {
    case 'g':
      if (e.squash) c.drawImage(GOOMBA_SQ, x - 1, y + 8);
      else c.drawImage(GOOMBA[Math.floor(tick / 10) % 2], x - 1, y - 2);
      break;
    case 'koopa': {
      const k = e.red ? 'R' : 'G';
      if (e.shell) {
        const wob = e.vx === 0 && e.shellT > 330 ? Math.sin(tick) * 1 : 0;
        c.drawImage(SHELLS[k], x - 1 + wob, y - 2);
        if (e.vx === 0 && e.shellT > 330) { c.fillStyle = '#f0d060'; c.fillRect(x + 2, y + 10, 3, 3); c.fillRect(x + 9, y + 10, 3, 3); }
      } else {
        const f = KOOPA[k][Math.floor(tick / 12) % 2][e.vx > 0 ? 0 : 1];
        c.drawImage(f, x - 1, y - 6);
        if (e.wing) {
          const up = Math.floor(tick / 6) % 2;
          c.fillStyle = '#ffffff'; const wx = e.vx > 0 ? x - 4 : x + 10;
          c.fillRect(wx, y - 2 - up * 3, 7, 4); c.fillRect(wx + 1, y - 5 - up * 3, 5, 3); c.fillStyle = '#c8c8c8'; c.fillRect(wx, y + 1 - up * 3, 7, 1);
        }
      }
      break;
    }
    case 'plant': {
      if (e.off <= 0) break;
      c.save(); c.beginPath(); c.rect(e.px - 12, e.base - 30, 24, 30); c.clip();
      const top = e.base - e.off, open = Math.floor(tick / 10) % 2;
      c.fillStyle = '#2fa84a'; c.fillRect(e.px - 1, top + 12, 3, 20);
      c.fillRect(e.px - 7, top + 16, 6, 3); c.fillRect(e.px + 2, top + 18, 6, 3);
      c.fillStyle = '#d8382c'; c.beginPath(); c.ellipse(e.px - 4, top + 6, 5, 7, 0.3, 0, Math.PI * 2); c.ellipse(e.px + 4, top + 6, 5, 7, -0.3, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#ffffff'; for (const [dx, dy] of [[-6, 2], [-3, 8], [5, 3], [3, 9]]) c.fillRect(e.px + dx, top + dy, 2, 2);
      c.fillStyle = '#ffe8c8'; if (open) { c.fillRect(e.px - 1, top + 1, 2, 10); }
      c.restore();
      break;
    }
    case 'pod': {
      if (e.wait > 0) break;
      c.save(); c.translate(x + 7, y + 7); if (e.vy > 0) c.scale(1, -1);
      c.fillStyle = '#ff6a1a'; c.beginPath(); c.arc(0, 0, 7, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#ffd04a'; c.beginPath(); c.arc(0, -1, 4, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#1a0a00'; c.fillRect(-4, -2, 2, 3); c.fillRect(2, -2, 2, 3);
      c.fillStyle = 'rgba(255,120,30,.6)'; c.fillRect(-3, 7, 6, 4 + (tick % 4));
      c.restore();
      break;
    }
    case 'bullet': c.drawImage(BULLET[e.vx > 0 ? 1 : 0], x, y); break;
    case 'bfire': {
      const g = c.createLinearGradient(x, 0, x + e.w, 0); g.addColorStop(0, '#fff6a0'); g.addColorStop(0.4, '#ff9a2a'); g.addColorStop(1, 'rgba(255,60,20,0)');
      c.fillStyle = g; c.beginPath(); c.ellipse(x + 11, y + 3.5, 12, 3.5 + Math.sin(tick * 0.5), 0, 0, Math.PI * 2); c.fill();
      break;
    }
    case 'hammer':
      c.save(); c.translate(x + 5, y + 5); c.rotate(e.rot || 0);
      c.fillStyle = '#8a5a2a'; c.fillRect(-1, -2, 2, 8); c.fillStyle = '#9a9aa8'; c.fillRect(-4, -6, 8, 4); c.restore();
      break;
    case 'boss': drawBoss(c, e); break;
  }
  if (e.flip) c.restore();
}
function drawBoss(c, e) {
  const x = Math.round(e.x), y = Math.round(e.y), d = e.dir, hit = e.hit > 0 && tick % 4 < 2;
  if (e.hit) e.hit--;
  const P = (dx, dy, w, h, col) => { c.fillStyle = hit ? '#ffffff' : col; c.fillRect(d < 0 ? x + dx : x + 28 - dx - w, y + dy, w, h); };
  P(8, 6, 20, 18, '#2e8a3a'); P(10, 8, 16, 14, '#4cb04a');
  for (let i = 0; i < 4; i++) { P(10 + i * 4, 4, 3, 4, '#f4f4f4'); }
  P(12, 10, 12, 10, '#e8d090'); P(13, 12, 10, 1, '#b89a50'); P(13, 15, 10, 1, '#b89a50');
  P(0, 2, 12, 12, '#4cb04a'); P(0, 8, 6, 3, '#f4f4f4'); P(1, 9, 1, 1, '#1a1a1a'); P(3, 9, 1, 1, '#1a1a1a');
  P(3, 4, 3, 3, '#ffffff'); P(4, 5, 2, 2, '#d8382c');
  P(6, 0, 2, 3, '#f4f4f4'); P(9, -1, 2, 3, '#f4f4f4');
  P(8, -3, 10, 4, '#d8382c'); P(14, -1, 8, 5, '#d8382c');
  const step = Math.floor(e.t / 10) % 2;
  P(9, 24, 6, 6 - step * 2, '#2e8a3a'); P(19, 24, 6, 4 + step * 2, '#2e8a3a');
  P(7, 28, 4, 2, '#f4f4f4'); P(17, 28, 4, 2, '#f4f4f4');
  P(4, 14, 5, 4, '#2e8a3a'); P(2, 16, 3, 2, '#f4f4f4');
  if (e.fireT < 20) { c.fillStyle = 'rgba(255,160,40,.8)'; c.fillRect(d < 0 ? x - 4 : x + 30, y + 8, 4, 3); }
}
function drawNPC(c) {
  if (!area.npc) return;
  const x = area.npc[0] * TS, y = (area.npc[1] + 1) * TS - 20;
  c.fillStyle = '#ffffff'; c.beginPath(); c.ellipse(x + 8, y + 6, 9, 7, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#3a7ad8'; for (const [dx, dy] of [[2, 2], [10, 1], [6, 6]]) c.fillRect(x + dx, y + dy, 4, 4);
  c.fillStyle = '#f6dcb0'; c.fillRect(x + 3, y + 10, 10, 6); c.fillStyle = '#1a1a1a'; c.fillRect(x + 5, y + 12, 1, 2); c.fillRect(x + 10, y + 12, 1, 2);
  c.fillStyle = '#3a7ad8'; c.fillRect(x + 3, y + 16, 10, 4);
}
function heroSprite() {
  const h = hero;
  let pal = h.fire ? 'fire' : 'normal';
  if (h.star > 0) pal = ['normal', 'star1', 'fire', 'star2'][Math.floor(tick / (h.star < 120 ? 8 : 3)) % 4];
  const dirI = h.dir > 0 ? 0 : 1;
  let big = h.big;
  if (h.growT) big = Math.floor(h.growT / 5) % 2 === 0 ? h.growDir > 0 : h.growDir < 0;
  if (h.state === 'die') return HERO[pal].s.die[0];
  const set = big ? HERO[pal].b : HERO[pal].s;
  if (big && h.crouch) return set.crouch[dirI];
  if (h.state === 'flag') return set.walk1[1];
  if (!h.onGround && h.state === 'play' && !h.lift) return set.jump[dirI];
  if (h.skid) return set.walk2[dirI];
  if (Math.abs(h.vx) > 0.1 || h.state === 'walkout' || (clearSeq && clearSeq.phase === 'walk')) return set[['walk1', 'walk2', 'stand'][Math.floor(h.anim) % 3]][dirI];
  return set.stand[dirI];
}
function drawHero(c) {
  const h = hero;
  if (h.state === 'gone') return;
  if (h.inv > 0 && Math.floor(tick / 3) % 2) return;
  const img = heroSprite();
  const x = Math.round(h.x - 2), y = Math.round(h.y + h.h - img.height);
  c.drawImage(img, x, y);
  if (h.star > 0 && tick % 6 === 0) parts.burst(h.x + Math.random() * h.w, h.y + Math.random() * h.h, { n: 1, color: ['#fff', '#ffd84a'], speed: 20, life: 0.4, size: 2, gravity: 0, shape: 'spark' });
}
function drawHUD(c) {
  c.save();
  c.font = 'bold 9px "Courier New", monospace'; c.textBaseline = 'top';
  const sh = (s, x, y, col = '#fff', al = 'left') => { c.textAlign = al; c.fillStyle = 'rgba(0,0,0,.45)'; c.fillText(s, x + 1, y + 1); c.fillStyle = col; c.fillText(s, x, y); };
  sh('SCORE', 10, 6); sh(String(score).padStart(7, '0'), 10, 16);
  drawCoin(c, 96, 10, tick); sh('×' + String(coins).padStart(2, '0'), 112, 14);
  sh('WORLD', 176, 6, '#fff', 'center'); sh(['1-1', '1-2', '1-3', '1-4', '2-1', '2-2', '2-3', '2-4'][lvIdx], 176, 16, '#fff', 'center');
  sh('TIME', 262, 6, '#fff', 'center'); sh(String(Math.max(0, timeLeft)).padStart(3, '0'), 262, 16, timeLeft <= 100 && tick % 30 < 15 ? '#ff6a5a' : '#fff', 'center');
  c.drawImage(HERO.normal.s.stand[0], 330, 6, 12, 12); sh('×' + lives, 344, 10);
  c.restore();
}
function drawIntro(c) {
  c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillStyle = '#fff'; c.font = 'bold 14px "Courier New", monospace';
  c.fillText('WORLD ' + ['1-1', '1-2', '1-3', '1-4', '2-1', '2-2', '2-3', '2-4'][lvIdx], W / 2, 82);
  c.font = '13px "AMG Display", system-ui'; c.fillStyle = '#ffd84a'; c.fillText(T('lvNames')[lvIdx], W / 2, 104);
  c.drawImage(HERO.normal.s.stand[0], W / 2 - 30, 128);
  c.fillStyle = '#fff'; c.font = 'bold 12px "Courier New", monospace'; c.fillText('×  ' + lives, W / 2 + 10, 137);
  if (checkpoint) { c.font = '10px "AMG Display", system-ui'; c.fillStyle = '#9ad8ff'; c.fillText(T('fromMid'), W / 2, 170); }
  drawHUD(c);
}
function render() {
  const c = ctx;
  if (state === 'menu') { drawMenuBG(c); return; }
  if (state === 'intro') { drawIntro(c); return; }
  drawBG(c);
  c.save();
  const sx = shake > 0 ? Math.round((Math.random() - 0.5) * shake * 2) : 0;
  c.translate(-Math.round(camX) + sx, 0);
  for (const e of ents) if (e.kind === 'plant') drawEnemy(c, e);
  drawItems(c, true);
  if (hero.behind) drawHero(c);
  drawTiles(c);
  drawFlag(c);
  for (const L of lifts) {
    const x = Math.round(L.x), y = Math.round(L.y);
    c.fillStyle = '#e8e8f0'; c.fillRect(x, y, L.w, 6); c.fillStyle = L.fall ? '#d88a3a' : '#7a8aa8'; c.fillRect(x, y + 2, L.w, 4);
    c.fillStyle = '#ffffff'; for (let i = 4; i < L.w; i += 8) c.fillRect(x + i, y + 3, 2, 2);
  }
  for (const b of bars) for (let i = 0; i < b.n; i++) {
    const fx = b.cx + Math.cos(b.a) * i * 8, fy = b.cy + Math.sin(b.a) * i * 8;
    c.fillStyle = '#ff6a1a'; c.beginPath(); c.arc(fx, fy, 4, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ffd04a'; c.beginPath(); c.arc(fx, fy, 2, 0, Math.PI * 2); c.fill();
  }
  drawItems(c, false);
  drawNPC(c);
  for (const e of ents) if (e.kind !== 'plant') drawEnemy(c, e);
  for (const f of fballs) {
    c.save(); c.translate(f.x + 4, f.y + 4); c.rotate(f.t * 0.4);
    c.fillStyle = '#ff6a1a'; c.fillRect(-4, -4, 8, 8); c.fillStyle = '#ffd04a'; c.fillRect(-2, -2, 4, 4); c.restore();
  }
  if (!hero.behind) drawHero(c);
  for (const d of debris) { c.save(); c.translate(d.x + 4, d.y + 4); c.rotate(d.r); c.fillStyle = theme.b[0]; c.fillRect(-4, -4, 8, 8); c.fillStyle = theme.b[1]; c.fillRect(-4, 2, 8, 2); c.restore(); }
  parts.draw(c);
  c.font = 'bold 8px "Courier New", monospace'; c.textAlign = 'center';
  for (const t of texts) { c.fillStyle = 'rgba(0,0,0,.4)'; c.fillText(t.s, t.x + 9, t.y + 1); c.fillStyle = '#fff'; c.fillText(t.s, t.x + 8, t.y); }
  if (msg) {
    const mx = (area.npc ? area.npc[0] * TS : hero.x) - 40;
    c.font = '10px "AMG Display", system-ui'; c.textAlign = 'center';
    const lines = msg.text.split('\n');
    lines.forEach((l, i) => { const a = Math.min(1, msg.t / 20); c.globalAlpha = a; c.fillStyle = 'rgba(0,0,0,.55)'; c.fillRect(mx - 110, 60 + i * 16 - 10, 220, 16); c.fillStyle = '#fff'; c.fillText(l, mx, 60 + i * 16); });
    c.globalAlpha = 1;
  }
  c.restore();
  drawHUD(c);
  if (iris) {
    const cx = Math.round(hero.x + hero.w / 2 - camX), cy = Math.round(hero.y + hero.h / 2);
    c.fillStyle = '#000'; c.beginPath(); c.rect(0, 0, W, H); c.arc(cx, cy, Math.max(0, iris.r), 0, Math.PI * 2, true); c.fill('evenodd');
  }
}
function drawMenuBG(c) {
  const sv = theme; theme = THEMES[['grass', 'cave', 'sky', 'castle', 'snow', 'night', 'sunset', 'castle'][pickLv]];
  camX = tick * 0.4; drawBG(c);
  c.fillStyle = theme.g[0]; c.fillRect(0, H - 32, W, 32); c.fillStyle = theme.top || theme.g[2]; c.fillRect(0, H - 32, W, 4);
  const hx = (tick * 1.2) % (W + 40) - 20;
  c.drawImage(HERO.normal.s[['walk1', 'walk2', 'walk1', 'stand'][Math.floor(tick / 6) % 4]][0], Math.round(hx), H - 48);
  c.drawImage(GOOMBA[Math.floor(tick / 10) % 2], Math.round((hx + 120) % (W + 40) - 20), H - 48);
  theme = sv;
}

// ---------------- 主循环 ----------------
let last = performance.now(), acc = 0;
function loop(now) {
  acc += Math.min(0.1, (now - last) / 1000); last = now;
  if (state !== 'pause') { while (acc >= 1 / 60) { acc -= 1 / 60; if (state === 'menu') tick++; else step(); } }
  else acc = 0;
  render();
  requestAnimationFrame(loop);
}

// ---------------- 界面 ----------------
const GAME_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
document.addEventListener('keydown', e => {
  if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
  if (GAME_KEYS.has(e.code) && state !== 'menu') e.preventDefault();
  if (e.code === 'KeyP' || e.code === 'Escape') { togglePause(); return; }
  if (state === 'menu' && (e.code === 'Enter' || e.code === 'Space')) { e.preventDefault(); $('btn-start').click(); return; }
  keys.add(e.code);
});
document.addEventListener('keyup', e => keys.delete(e.code));
window.addEventListener('blur', () => { keys.clear(); if (state === 'play') togglePause(); });
document.querySelectorAll('#pad [data-k]').forEach(b => {
  const k = b.dataset.k;
  const on = e => { e.preventDefault(); touchHeld[k] = 1; b.classList.add('on'); KIT.audio(); };
  const off = e => { e.preventDefault(); touchHeld[k] = 0; b.classList.remove('on'); };
  b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
});
$('pad-pause').addEventListener('click', () => togglePause());
function togglePause() {
  if (state === 'play' || state === 'intro') { prevState = state; state = 'pause'; $('screen-pause').classList.remove('hidden'); KIT.stopMusic(); }
  else if (state === 'pause') { state = prevState; $('screen-pause').classList.add('hidden'); if (state === 'play') KIT.music(starMusic() ? 'star-power' : theme.music); }
}
function hideScreens() { ['screen-menu', 'screen-pause', 'screen-over', 'screen-win'].forEach(id => $(id).classList.add('hidden')); }
function toMenu() { hideScreens(); saveBest(); state = 'menu'; KIT.stopMusic(); renderMenu(); $('screen-menu').classList.remove('hidden'); }
function renderMenu() {
  const box = $('world-pick'); box.innerHTML = '';
  const emo = ['🌳', '🕳️', '☁️', '🏰', '❄️', '🌙', '🌇', '🐉'];
  T('lvNames').forEach((n, i) => {
    const locked = i > prog.unlocked, done = prog.cleared.includes(i);
    const b = document.createElement('button');
    b.className = 'lvl-btn' + (i === pickLv ? ' active' : '') + (locked ? ' locked' : '') + (done ? ' done' : '');
    b.innerHTML = `<span class="lv-emo">${locked ? '🔒' : emo[i]}</span>${['1-1', '1-2', '1-3', '1-4', '2-1', '2-2', '2-3', '2-4'][i]}${done ? ' ⭐' : ''}<small>${n}</small>`;
    b.onclick = () => { if (locked) { KIT.tone(200, 0.1, { type: 'square', vol: 0.04 }); return; } pickLv = i; renderMenu(); };
    box.appendChild(b);
  });
  $('menu-best').textContent = T('bestLbl', prog.best.toLocaleString());
}
$('btn-start').onclick = () => { KIT.audio(); score = 0; coins = 0; lives = 3; hero = null; checkpoint = false; startLevel(pickLv); };
$('btn-resume').onclick = togglePause;
$('btn-quit').onclick = toMenu;
$('btn-retry').onclick = () => { score = 0; coins = 0; lives = 3; hero = null; startLevel(lvIdx, checkpoint); };
$('btn-menu').onclick = toMenu;
$('btn-menu2').onclick = toMenu;
$('btn-again').onclick = () => { score = 0; coins = 0; lives = 3; hero = null; startLevel(0); };

if (location.hash === '#debug') window.__mb = {
  info: () => ({ state, lv: lvIdx, area: areaKey, x: Math.round(hero && hero.x), y: Math.round(hero && hero.y), hs: hero && hero.state, big: hero && hero.big, score, coins, lives, time: timeLeft, ents: ents.length, cam: Math.round(camX) }),
  go: (i) => { score = 0; coins = 0; lives = 3; hero = null; startLevel(i); introT = 139; },
  tp: (tx, ty = 2) => { hero.x = tx * TS; hero.y = ty * TS; hero.vy = 0; camX = clamp(hero.x - W * 0.4, 0, area.w * TS - W); },
  big: f => { setBig(true); hero.fire = !!f; },
  god: () => { hero.star = 1e9; },
  hold: (k, v) => { touchHeld[k] = v; }
};
const syncMute = KIT.mountMute($('btn-mute'));
KIT.boot(() => { syncMute(); renderMenu(); fit(); });
renderMenu();
requestAnimationFrame(loop);
})();
