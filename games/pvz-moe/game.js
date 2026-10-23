/* 萌可花园 · 植物大战僵尸（萌可版） — 游戏主逻辑
 * 固定步长 120Hz 模拟，逐帧渲染。依赖：strings.js / data.js / art.js / audio.js。
 *
 * 相比经典版新增：
 *   植物 star（穿透星屑）/ marshmallow（糖霜护盾）/ pumpkin（追踪幽灵瓜）/ sundae（整行糖浆）
 *   团子 jelly（死亡分裂）/ spring（弹跳过植物）/ bubble（远程泡泡定身）
 *   特效 顿帧、白闪、冲击环、连击、星屑拖尾、糖浆波、护盾泡
 */
(function () {
  'use strict';

  var A = window.PVZ_ART, D = window.PVZ_DATA, AU = window.PVZ_AUDIO;
  var M = A.metrics;
  var W = M.W, H = M.H, GX = M.GX, GY = M.GY, CW = M.CW, CH = M.CH, ROWS = M.ROWS, COLS = M.COLS;

  var TAU = Math.PI * 2, STEP = 1 / 120;
  var PLANT_BY_ID = {};
  D.PLANTS.forEach(function (p) { PLANT_BY_ID[p.id] = p; });

  var T = function (k) { return window.AMG ? AMG.t(window.PVZ_STR, k) : k; };
  var TF = function (k) {
    var args = [].slice.call(arguments, 1);
    if (window.AMG) return AMG.tf.apply(null, [window.PVZ_STR, k].concat(args));
    return k;
  };
  var rnd = function (a, b) { return a + Math.random() * (b - a); };
  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var cellCX = function (c) { return GX + c * CW + CW / 2; };
  var rowFoot = function (r) { return GY + r * CH + CH * 0.84; };

  /* 糖果色板（渲染用） */
  var C = {
    plum: '#5d2f45', plumD: '#432033',
    pink: '#ff9fc4', pinkD: '#e2699d', rose: '#ff7fab',
    cream: '#fff6ec', creamD: '#ffe3ee',
    mint: '#9be8cf', mintD: '#57c2a5',
    lilac: '#c7b2ff', sun: '#ffe08a', sunD: '#e9a93a',
    choco: '#7b4c30'
  };

  /* ============================================================
   * 存档
   * ============================================================ */
  var SAVE_KEY = 'pvz-moe:save:v1';
  var save = { unlocked: 1, stars: {}, best: { wave: 0, score: 0 }, deck: null, diff: 'normal', opts: { auto: false, hp: true, vol: 0.8 } };
  function loadSave() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        var o = JSON.parse(raw);
        if (o && typeof o === 'object') {
          save.unlocked = clamp(o.unlocked | 0, 1, D.LEVELS.length) || 1;
          save.stars = o.stars && typeof o.stars === 'object' ? o.stars : {};
          save.best = o.best && typeof o.best === 'object' ? { wave: o.best.wave | 0, score: o.best.score | 0 } : { wave: 0, score: 0 };
          save.deck = Array.isArray(o.deck) ? o.deck.filter(function (id) { return !!PLANT_BY_ID[id]; }).slice(0, 9) : null;
          save.diff = D.DIFF[o.diff] ? o.diff : 'normal';
          if (o.opts) {
            save.opts.auto = !!o.opts.auto;
            save.opts.hp = o.opts.hp !== false;
          }
        }
      }
    } catch (e) { /* 存档损坏：使用默认 */ }
    if (!save.deck || !save.deck.length) save.deck = D.RECOMMENDED.slice();
  }
  function writeSave() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {}
  }
  loadSave();

  /* ============================================================
   * DOM 引用
   * ============================================================ */
  var canvas = document.getElementById('c');
  var ctx = canvas.getContext('2d');
  var ovReady = document.getElementById('ov-ready');
  var ovDeck = document.getElementById('ov-deck');
  var ovPause = document.getElementById('ov-pause');
  var ovEnd = document.getElementById('ov-end');
  var ovAll = [ovReady, ovDeck, ovPause, ovEnd];
  var DPR = 1;

  function show(el) {
    ovAll.forEach(function (o) { o.classList.toggle('hidden', o !== el); });
    if (el) {
      el.classList.remove('hidden'); el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
      if (el.scrollTop) el.scrollTop = 0;
    }
  }
  function hideAll() { ovAll.forEach(function (o) { o.classList.add('hidden'); }); }

  /* ============================================================
   * 全局状态
   * ============================================================ */
  var G = null;
  var mode = 'menu';
  var lastNow = 0, acc = 0;
  var uiT = 0;
  var bgCache = {};
  var particle = [];
  var floaters = [];
  var shake = 0;
  var flashRed = 0;
  var flashWhite = 0;
  var hitStop = 0;
  var menuT = 0;

  var UI = {
    sunCard: { x: 10, y: 8, w: 92, h: 88 },
    cardX0: 108, cardY: 8, cardW: 68, cardH: 88, cardGap: 4,
    shovel: { x: 748, y: 8, w: 66, h: 88 },
    btnPause: { x: 824, y: 8, w: 62, h: 38 },
    btnSpeed: { x: 824, y: 52, w: 62, h: 38 },
    btnHp: { x: 892, y: 8, w: 62, h: 38 },
    btnAuto: { x: 892, y: 52, w: 62, h: 38 },
    btnMute: { x: 960, y: 8, w: 42, h: 38 },
    bar: { x: 1010, y: 14, w: 100, h: 16 },
    waveTextY: 44
  };
  function inRect(m, r) { return m.x >= r.x && m.x <= r.x + r.w && m.y >= r.y && m.y <= r.y + r.h; }

  function newGame(opts) {
    var lv = opts.level;
    var diff = D.DIFF[opts.diff] || D.DIFF.normal;
    var scene = lv.scene;
    var deck = opts.deck.slice(0, 9);
    G = {
      mode: opts.endless ? 'endless' : 'level',
      level: lv,
      levelIndex: opts.levelIndex || 0,
      diffKey: opts.diff,
      diff: diff,
      scene: scene,
      endless: !!opts.endless,
      deck: deck,
      cards: deck.map(function (id) { return { id: id, cd: 0 }; }),
      sun: Math.round(diff.startSun),
      sunBump: 0,
      grid: [],
      plants: [],
      zombies: [],
      peas: [],
      suns: [],
      mowers: [],
      graves: [],
      fx: [],
      gourds: [],
      syrup: [],
      bubbles: [],
      wave: 0,
      waveTotal: opts.endless ? Infinity : lv.waves,
      huge: lv.huge || [],
      table: lv.table || null,
      queue: [],
      countdown: opts.endless ? 18 : 16,
      waveGap: 26,
      nextWaveAt: 0,
      state: 'play',
      time: 0,
      skyT: opts.endless ? 8 : rnd(lv.skySun[0], lv.skySun[1]),
      skyRange: lv.skySun,
      sel: -1,
      shovel: false,
      mouse: { x: -99, y: -99, in: false },
      stats: { kills: 0, planted: 0, sun: 0, mowersUsed: 0 },
      banner: null,
      endT: 0,
      result: null,
      bgmTense: false,
      hugeWarned: {},
      tip: null,
      tipT: 0,
      speed: 1,
      auto: save.opts.auto,
      showHp: save.opts.hp,
      paused: false,
      starsGained: 0,
      gravesBroken: 0,
      combo: 0, comboT: 0, maxCombo: 0
    };
    for (var r = 0; r < ROWS; r++) {
      G.grid.push(new Array(COLS).fill(null));
      G.mowers.push({ row: r, x: GX - 52, state: 'idle', t: 0 });
    }
    if (lv.graves) {
      var spots = [];
      for (var i = 0; i < lv.graves; i++) {
        var tries = 0;
        while (tries++ < 40) {
          var gr = Math.floor(rnd(0, ROWS)), gc = Math.floor(rnd(2, 6));
          var okSpot = !spots.some(function (s) { return s.r === gr && Math.abs(s.c - gc) < 2; });
          if (okSpot) { spots.push({ r: gr, c: gc }); break; }
        }
      }
      spots.forEach(function (s2) {
        var gv = { r: s2.r, c: s2.c, hp: 0, broken: false, timer: rnd(12, 20), t: 0 };
        G.graves.push(gv);
        G.grid[s2.r][s2.c] = gv;
      });
    }
    particle.length = 0; floaters.length = 0; shake = 0; flashRed = 0; flashWhite = 0; hitStop = 0;
    AU.setScene(scene);
    mode = 'playing';
    G.banner = { key: 'prep', txt: T('tipSun'), t: 4, color: '#fff6ee', size: 26 };
    show(null);
    return G;
  }

  /* ============================================================
   * 阳光
   * ============================================================ */
  function spawnSun(x, y, kind, val) {
    var s = { x: x, y: y, val: val || 25, kind: kind, life: 9, ph: rnd(0, 6), t: 0, vx: 0, vy: 0, ty: 0, state: kind, ft: 0, fx0: 0, fy0: 0 };
    G.suns.push(s);
    return s;
  }
  function skySun() {
    var x = rnd(GX + 40, GX + COLS * CW - 40);
    var s = spawnSun(x, GY - 20, 'fall');
    s.ty = rnd(GY + 70, GY + ROWS * CH - 60);
    AU.sfx('sunSpawn');
  }
  function plantSun(p) {
    var s = spawnSun(cellCX(p.c) + rnd(-6, 6), rowFoot(p.r) - 58, 'pop');
    s.vx = rnd(-38, 38); s.vy = -190; s.ty = rowFoot(p.r) + rnd(-4, 10);
  }
  function collectSun(s) {
    if (s.state === 'fly') return;
    s.state = 'fly'; s.ft = 0; s.fx0 = s.x; s.fy0 = s.y;
    floater(s.x, s.y - 22, '+' + Math.round(s.val * G.diff.sun), '#ffe08a', 19);
    sparkles(s.x, s.y, 6, ['#fff6c0', '#ffffff', '#ffd1e3']);
    ring(s.x, s.y, 4, 34, '#ffe08a', .32, 3);
    AU.sfx('sun');
  }

  /* ============================================================
   * 粒子 / 飘字 / 特效
   * ============================================================ */
  function burst(x, y, n, colors, o) {
    o = o || {};
    for (var i = 0; i < n; i++) {
      var a = rnd(0, TAU), sp = rnd(o.min || 30, o.max || 150);
      particle.push({
        x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (o.up || 40),
        life: rnd(.35, .85) * (o.life || 1), max: 1, g: o.g == null ? 420 : o.g,
        size: rnd(o.s0 || 2, o.s1 || 5),
        color: colors[Math.floor(Math.random() * colors.length)],
        shape: o.shape || 'dot', rot: rnd(0, 6), vr: rnd(-9, 9),
        spin: o.spin || 0
      });
    }
  }
  function sparkles(x, y, n, colors) {
    burst(x, y, n, colors || ['#fff6c0', '#ffffff', '#ffd1e3'], { min: 40, max: 170, up: 70, g: 160, s0: 3, s1: 6, shape: 'star', life: 1.2 });
  }
  function ring(x, y, r0, r1, color, life, wide) {
    G.fx.push({ k: 'ring', x: x, y: y, r0: r0, r1: r1, color: color || '#fff3c4', t: 0, life: life || .45, wide: wide || 4 });
  }
  function floater(x, y, txt, color, size) {
    floaters.push({ x: x, y: y, txt: txt, color: color, size: size || 20, t: 0, life: 1.05 });
  }
  function addShake(v) { shake = Math.max(shake, v); }
  function addHitStop(v) { hitStop = Math.max(hitStop, v); }

  /* ============================================================
   * 僵尸
   * ============================================================ */
  function spawnZombie(type, row, x, opts) {
    var def = D.ZOMBIES[type] || D.ZOMBIES.normal;
    var hpMul = G.diff.hp, spdMul = G.diff.speed;
    var z = {
      type: type, row: row,
      x: x == null ? W + rnd(20, 70) : x,
      y: rowFoot(row) + rnd(-2, 2),
      jy: 0,
      hp: def.hp * hpMul, maxhp: def.hp * hpMul,
      armor: (def.armor || 0) * hpMul, armorMax: (def.armor || 0) * hpMul,
      armorType: def.armorType || null,
      speed: def.speed * spdMul, run: (def.run || 0) * spdMul,
      scale: def.scale || 1,
      giant: !!def.giant, vault: !!def.vault, throwImp: !!def.throwImp,
      ph: rnd(0, 6), eat: false, dead: false, dieT: 0, charred: false,
      flash: 0, slow: 0, armLost: false, rage: false,
      state: def.vault ? 'run' : 'walk',
      hasPole: !!def.vault, jt: 0, jx0: 0, jx1: 0,
      smash: 0, smashCD: 0, thrown: false, throwT: -1,
      slowTick: 0,
      split: !!def.split, bounce: !!def.bounce, bubble: !!def.bubble, candy: !!def.candy,
      bounceCD: 2.6, shootCD: rnd(2, 4), gourdT: 0, gourdDps: 0, small: false
    };
    if (opts && opts.flag) z.flag = true;
    G.zombies.push(z);
    burst(z.x - 10, z.y - 6, 7, ['#ffffff', '#ffe3ef', '#d9d2e4'], {
      min: 12, max: 60, up: 40, g: 120, s0: 2, s1: 4.5, shape: 'star'
    });
    return z;
  }

  function armorMul(kind) { return kind === 'boom' ? 0.6 : 1; }
  function hurtZ(z, dmg, kind, noSfx) {
    if (z.dead) return;
    z.flash = 0.09;
    var rem = dmg;
    if (z.armor > 0) {
      var take = Math.min(rem, z.armor * (kind === 'boom' ? 1 / armorMul(kind) : 1));
      take = Math.min(take, z.armor);
      rem -= take * armorMul(kind);
      z.armor -= take;
      if (!noSfx) {
        if (z.armorType === 'bucket' || z.armorType === 'door' || z.armorType === 'helmet') AU.sfx('metal');
        else AU.sfx('hit');
      }
      if (z.armor <= 0) {
        z.armor = 0;
        var col = z.armorType === 'cone' ? ['#ff8a1c', '#ffffff'] :
          z.armorType === 'paper' ? ['#efe6cf', '#b8a888'] :
          z.armorType === 'helmet' ? ['#e04a3a', '#ffffff'] : ['#cfd6dc', '#8d98a1'];
        burst(z.x - 8 * z.scale, z.y - 80 * z.scale, 16, col, { s0: 3, s1: 7, min: 60, max: 210, shape: 'rect' });
        ring(z.x, z.y - 60 * z.scale, 6, 46, '#ffffff', .3, 3);
        z.armorType = null;
        if (z.type === 'newspaper') {
          z.rage = true;
          z.speed = D.ZOMBIES.newspaper.rageSpeed * G.diff.speed;
          floater(z.x, z.y - 96, '!', '#ff3b2f', 30);
          AU.sfx('groan');
        }
      }
    }
    if (rem > 0) z.hp -= rem;
    if (!noSfx && kind === 'pea') AU.sfx('hit');
    if (kind === 'ice') z.slow = 4;
    var hy = z.y - 62 * z.scale;
    if (kind === 'pea') burst(z.x - 10, hy, 4, ['#7bd34a', '#a6e870'], { min: 30, max: 100 });
    else if (kind === 'ice') burst(z.x - 10, hy, 6, ['#bfe9ff', '#ffffff', '#6fc3ff'], { min: 30, max: 110, shape: 'rect' });
    else if (kind === 'fire') burst(z.x - 8, hy, 5, ['#ffd23a', '#ff7a1a'], { min: 30, max: 120, g: 60 });
    else if (kind === 'star') burst(z.x - 6, hy, 3, ['#fff6c0', '#c9d8ff', '#ffffff'], { min: 30, max: 120, shape: 'star', g: 90 });
    else if (kind === 'syrup') burst(z.x - 6, hy, 4, ['#ffb3cf', '#ffe08a', '#ffffff'], { min: 30, max: 130, g: 200 });
    if (!z.armLost && !z.giant && !z.dead && z.hp > 0 && z.hp <= z.maxhp * 0.5) {
      z.armLost = true;
      particle.push({ x: z.x - 6, y: z.y - 50 * z.scale, vx: rnd(-60, -10), vy: -140, life: 1.3, max: 1, g: 560, size: 1, color: '#8fae7e', shape: 'arm', rot: 0, vr: rnd(-7, 7) });
    }
    if (z.hp <= 0) killZ(z, kind);
  }

  function killZ(z, kind) {
    if (z.dead) return;
    z.dead = true; z.dieT = 0; z.hp = 0;
    G.stats.kills++;
    z.charred = kind === 'boom';
    // 连击
    G.combo = G.comboT > 0 ? G.combo + 1 : 1;
    G.comboT = 2.2;
    G.maxCombo = Math.max(G.maxCombo, G.combo);
    if (G.combo > 0 && G.combo % 5 === 0) {
      floater(z.x, z.y - 118 * z.scale, TF('comboFmt', G.combo), '#ffb3e0', 26);
      sparkles(z.x, z.y - 60, 10, ['#ffd1e3', '#fff3a8', '#c7b2ff']);
    }
    if (z.charred) burst(z.x, z.y - 40 * z.scale, 14, ['#2a2420', '#4a4440', '#ff9a2a'], { g: -70, min: 20, max: 110, s0: 2, s1: 6, life: 1.3 });
    else burst(z.x, z.y - 28 * z.scale, 9, ['#8fae7e', '#6b5a45', '#b7c9a5'], { min: 30, max: 100 });
    // 果冻分裂
    if (z.split && !z.small && kind !== 'mower') {
      for (var s = 0; s < 2; s++) {
        var kid = spawnZombie('jelly', z.row, z.x + (s ? 16 : -16));
        kid.small = true;
        kid.split = false;
        kid.scale = (D.ZOMBIES.jelly.scale || 1) * .62;
        kid.maxhp = kid.hp = z.maxhp * .42;
        kid.speed = z.speed * 1.25;
        kid.jy = 10 + s * 4;
        kid.ph = rnd(0, 6);
      }
      ring(z.x, z.y - 30, 8, 62, '#ffb3cf', .42, 5);
      sparkles(z.x, z.y - 34, 12, ['#ffd1e3', '#ff9fc4', '#ffffff']);
      floater(z.x, z.y - 90, TF('split'), '#ff9fc4', 20);
      AU.sfx('split');
    }
    if (z.giant) { addShake(6); ring(z.x, z.y - 40, 10, 150, '#ffd1e3', .55, 6); }
  }

  function explode(x, y, r, dmg, big) {
    G.fx.push({ k: 'boom', x: x, y: y, r: r, t: 0, life: big ? .75 : .55 });
    ring(x, y, 8, big ? 190 : 120, '#fff3c4', big ? .6 : .42, big ? 7 : 4);
    ring(x, y, 4, big ? 140 : 90, '#ffb3cf', big ? .72 : .5, 3);
    burst(x, y, big ? 46 : 26, ['#ff9a2a', '#ffd23a', '#e0402a', '#ffb3cf'], { min: 70, max: big ? 320 : 220, g: 160, s0: 3, s1: 8, life: 1.25 });
    burst(x, y, big ? 28 : 14, ['#2a2a2a', '#555', '#8a6a7a'], { min: 20, max: 150, g: -90, s0: 3, s1: 9, life: 1.6, up: 90 });
    sparkles(x, y, big ? 16 : 8, ['#fff6c0', '#ffffff', '#ffd1e3']);
    addShake(big ? 13 : 7);
    flashWhite = Math.max(flashWhite, big ? .55 : .28);
    addHitStop(big ? .055 : .03);
    AU.sfx('boom');
    G.zombies.forEach(function (z) {
      if (z.dead) return;
      var zy = z.y - 30;
      if (Math.hypot(z.x - x, zy - y) <= r + 16 * z.scale) hurtZ(z, dmg, 'boom', true);
    });
    G.graves.forEach(function (g) {
      if (g.broken) return;
      if (Math.hypot(cellCX(g.c) - x, rowFoot(g.r) - 20 - y) <= r + 24) breakGrave(g, true);
    });
  }

  /* ============================================================
   * 植物
   * ============================================================ */
  function cellOf(x, y) {
    var c = Math.floor((x - GX) / CW), r = Math.floor((y - GY) / CH);
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return null;
    return { r: r, c: c };
  }

  function canAfford(card) {
    var def = PLANT_BY_ID[card.id];
    return G.sun >= def.cost && card.cd <= 0;
  }

  function plantAt(cardIdx, r, c, free) {
    var card = G.cards[cardIdx];
    if (!card) return false;
    var def = PLANT_BY_ID[card.id];
    if (!free) {
      if (G.grid[r][c]) { AU.sfx('bad'); return false; }
      if (!canAfford(card)) { AU.sfx('bad'); return false; }
    } else if (G.grid[r][c]) return false;
    var p = {
      id: card.id, type: card.id, idx: cardIdx, r: r, c: c,
      hp: def.hp, max: def.hp, t: rnd(0, 6), timer: 0,
      armed: false, rise: 0, shoot: 0, cherry: 0, chew: 0, hurt: 0, glow: 0,
      fire: 0, plantedT: 0, shield: 0, stun: 0, cast: 0
    };
    if (card.id === 'sunflower') p.timer = rnd(5, 7.5);
    else if (card.id === 'potato') { p.timer = 10; p.armed = false; }
    else if (card.id === 'chomper') p.timer = 0;
    else if (card.id === 'marshmallow') p.timer = 1.6;
    else if (card.id === 'sundae') p.timer = 12;
    else if (card.id === 'pumpkin') p.timer = 2.4;
    else p.timer = .55;
    G.grid[r][c] = p;
    G.plants.push(p);
    if (!free) {
      G.sun -= def.cost;
      card.cd = def.cd;
      G.sel = -1;
      G.stats.planted++;
    }
    AU.sfx('plant');
    burst(cellCX(c), rowFoot(r), 11, ['#ffd1e3', '#8a6234', '#6b4a24', '#c7b2ff'], { min: 20, max: 100, up: 80, s0: 2, s1: 5, shape: 'star' });
    ring(cellCX(c), rowFoot(r) - 6, 6, 46, '#fff2f8', .38, 3);
    return p;
  }

  function removePlant(p) {
    if (!p) return;
    if (G.grid[p.r][p.c] === p) G.grid[p.r][p.c] = null;
    var i = G.plants.indexOf(p);
    if (i >= 0) G.plants.splice(i, 1);
  }

  function hurtPlant(p, dmg) {
    if (p.shield > 0) {
      var take = Math.min(p.shield, dmg);
      p.shield -= take; dmg -= take;
      if (Math.random() < .4) {
        burst(cellCX(p.c) + rnd(-18, 18), rowFoot(p.r) - rnd(20, 60), 2, ['#dff4ff', '#ffffff', '#bfe9ff'], { min: 20, max: 70, g: 60, shape: 'star' });
      }
      if (p.shield <= 0) {
        p.shield = 0;
        ring(cellCX(p.c), rowFoot(p.r) - 34, 20, 62, '#bfe9ff', .4, 4);
        AU.sfx('shieldBreak');
      }
      if (dmg <= 0) { p.hurt = 0.1; return; }
    }
    p.hp -= dmg;
    p.hurt = 0.14;
    if (p.hp <= 0) {
      removePlant(p);
      burst(cellCX(p.c), rowFoot(p.r) - 20, 13, ['#5fcf3a', '#3f9b2f', '#ffffff', '#ffd1e3'], { min: 40, max: 150, shape: 'star' });
      AU.sfx('hit');
    }
  }

  function breakGrave(g, silent) {
    if (g.broken) return;
    g.broken = true;
    if (G.grid[g.r][g.c] === g) G.grid[g.r][g.c] = null;
    G.gravesBroken++;
    burst(cellCX(g.c), rowFoot(g.r) - 20, 18, ['#c9c2d4', '#9a92ad', '#fff3f8'], { min: 40, max: 170, s0: 2, s1: 6, shape: 'star' });
    if (!silent) AU.sfx('grave');
    floater(cellCX(g.c), rowFoot(g.r) - 64, '✕', '#ffe3ee', 22);
  }

  /* ============================================================
   * 波次
   * ============================================================ */
  function levelTable(n) {
    if (!G.endless) return G.table[n - 1] || [];
    return D.endlessWave(n);
  }

  function launchWave() {
    G.wave++;
    var spec = levelTable(G.wave);
    var list = D.expand(spec);
    D.shuffle(list);
    var isHuge = G.endless ? (G.wave % 5 === 0) : (G.huge.indexOf(G.wave) >= 0);
    var last = !G.endless && G.wave === G.waveTotal;
    var span = isHuge ? Math.max(10, list.length * 0.7) : Math.max(3.5, list.length * 0.9);
    var t0 = G.time;
    list.forEach(function (type, i) {
      var at = (i / Math.max(1, list.length)) * span + rnd(0, .8);
      if (isHuge) at = rnd(0, span);
      G.queue.push({ at: t0 + at, type: type, flag: i === 0 && isHuge });
    });
    G.queue.sort(function (a, b) { return a.at - b.at; });
    G.waveGap = isHuge ? 30 : 26;
    G.countdown = G.waveGap;
    if (isHuge) {
      G.banner = { txt: T(last ? 'hugeLast' : 'huge'), sub: '', t: 3.4, color: '#ff7a9c', size: 38, huge: true };
      AU.sfx('alarm');
      addShake(5);
      flashRed = 1;
      ring(W / 2, GY + 190, 40, W * .66, '#ff9fc4', .9, 8);
    } else {
      G.banner = { txt: TF('waveFmt', G.wave), sub: '', t: 1.8, color: '#fff6ee', size: 32 };
    }
  }

  function aliveZ() {
    var n = 0;
    for (var i = 0; i < G.zombies.length; i++) if (!G.zombies[i].dead) n++;
    return n;
  }

  /* ============================================================
   * 更新
   * ============================================================ */
  function step(dt) {
    G.time += dt;
    if (G.sunBump > 0) G.sunBump -= dt;
    if (shake > 0) shake = Math.max(0, shake - 34 * dt);
    if (flashRed > 0) flashRed = Math.max(0, flashRed - dt * 1.6);
    if (flashWhite > 0) flashWhite = Math.max(0, flashWhite - dt * 3.4);
    if (G.tipT > 0) G.tipT -= dt;
    if (G.comboT > 0) { G.comboT -= dt; if (G.comboT <= 0) G.combo = 0; }
    G.cards.forEach(function (c) { if (c.cd > 0) c.cd = Math.max(0, c.cd - dt); });
    if (G.banner && (G.banner.t -= dt) <= 0) G.banner = null;

    if ((G.skyT -= dt) <= 0) {
      skySun();
      G.skyT = rnd(G.skyRange[0], G.skyRange[1]);
    }

    G.countdown -= dt;
    if (G.queue.length === 0 && aliveZ() === 0 && G.wave > 0 && G.countdown > 5) G.countdown = 5;
    if (!G.endless && G.wave < G.waveTotal) {
      var nxt = G.wave + 1;
      if (G.huge.indexOf(nxt) >= 0 && !G.hugeWarned[nxt] && G.countdown <= 3.6) {
        G.hugeWarned[nxt] = true;
        G.banner = { txt: T(nxt === G.waveTotal ? 'hugeLast' : 'huge'), sub: '', t: 3.2, color: '#ff7a9c', size: 38, huge: true };
        AU.sfx('alarm');
        flashRed = .9;
      }
    }
    if (G.countdown <= 0 && (G.endless || G.wave < G.waveTotal)) launchWave();

    while (G.queue.length && G.queue[0].at <= G.time) {
      var q = G.queue.shift();
      var row = Math.floor(rnd(0, ROWS));
      spawnZombie(q.type, row, null, { flag: q.flag });
      if (Math.random() < .5) AU.sfx('groan');
    }

    updatePlants(dt);
    updateZombies(dt);
    updatePeas(dt);
    updateGourds(dt);
    updateSyrup(dt);
    updateBubbles(dt);
    updateSuns(dt);
    updateMowers(dt);
    updateGraves(dt);
    updateParticles(dt);

    if (G.state === 'play' && !G.endless && G.wave >= G.waveTotal && G.queue.length === 0 && aliveZ() === 0) {
      G.endT += dt;
      if (G.endT > 1.4) endGame(true);
    }
  }

  function rowHasZombie(row, fromX) {
    for (var i = 0; i < G.zombies.length; i++) {
      var z = G.zombies[i];
      if (!z.dead && z.row === row && z.x > fromX - 14 && z.x < W + 40) return true;
    }
    return false;
  }

  function updatePlants(dt) {
    for (var i = G.plants.length - 1; i >= 0; i--) {
      var p = G.plants[i];
      p.t += dt;
      p.plantedT += dt;
      if (p.hurt > 0) p.hurt -= dt;
      if (p.shoot > 0) p.shoot -= dt;
      if (p.cast > 0) p.cast -= dt;
      if (p.stun > 0) { p.stun -= dt; continue; }
      var cx = cellCX(p.c), foot = rowFoot(p.r);

      if (p.id === 'sunflower') {
        p.timer -= dt;
        p.glow = p.timer < 1.6 ? 1 - p.timer / 1.6 : 0;
        if (p.timer <= 0) {
          plantSun(p);
          p.timer = 14;
          AU.sfx('pop');
          ring(cx, foot - 52, 4, 34, '#ffe08a', .4, 3);
        }
      } else if (p.id === 'peashooter' || p.id === 'snowpea' || p.id === 'repeater' || p.id === 'threepeater') {
        p.timer -= dt;
        if (p.timer <= 0) {
          var rows = p.id === 'threepeater' ? [p.r - 1, p.r, p.r + 1] : [p.r];
          var fired = false;
          rows.forEach(function (r) {
            if (r < 0 || r >= ROWS) return;
            if (!rowHasZombie(r, cx)) return;
            firePea(p, r, cx, foot);
            fired = true;
          });
          if (fired) {
            p.shoot = .16;
            p.timer = 1.4;
            AU.sfx(p.id === 'snowpea' ? 'ice' : 'shoot');
            if (p.id === 'repeater') {
              setTimeout(function () {
                if (mode !== 'playing' || G.plants.indexOf(p) < 0) return;
                firePea(p, p.r, cx, foot);
                AU.sfx('shoot');
              }, 150);
            }
          } else p.timer = 0;
        }
      } else if (p.id === 'star') {
        // 星星灯：三连星屑，穿透 3 只
        p.timer -= dt;
        if (p.timer <= 0) {
          if (rowHasZombie(p.r, cx)) {
            for (var s = 0; s < 3; s++) {
              G.peas.push({
                x: cx + 26, y: foot - 54 + (s - 1) * 11, row: p.r, vx: 430,
                ice: false, fire: false, dmg: 14, star: true, pierce: 3, hit: [],
                vy: (s - 1) * 14, ph: rnd(0, 6)
              });
            }
            p.shoot = .2;
            p.timer = 2.1;
            AU.sfx('star');
            ring(cx + 30, foot - 52, 3, 26, '#fff6c0', .3, 2.5);
          } else p.timer = 0;
        }
      } else if (p.id === 'marshmallow') {
        // 棉花糖苔：3×3 糖霜护盾
        p.timer -= dt;
        if (p.timer <= 0) {
          p.timer = 9;
          p.cast = .5;
          var n = 0;
          G.plants.forEach(function (o) {
            if (Math.abs(o.r - p.r) > 1 || Math.abs(o.c - p.c) > 1) return;
            if (o.shield >= o.shieldMax && o.shieldMax > 0 && o.shield >= 300) return; // 满盾不重复刷
            o.shield = Math.max(o.shield, 300);
            o.shieldMax = 300;
            n++;
            ring(cellCX(o.c), rowFoot(o.r) - 34, 8, 52, '#bfe9ff', .5, 3);
            burst(cellCX(o.c), rowFoot(o.r) - 34, 4, ['#dff4ff', '#ffffff'], { min: 20, max: 70, shape: 'star' });
          });
          AU.sfx('shield');
          floater(cx, foot - 92, TF('shieldUp'), '#9be8cf', 18);
          sparkles(cx, foot - 40, 12, ['#dff4ff', '#ffffff', '#bfe9ff']);
          ring(cx, foot - 30, 10, 130, '#ffe3ef', .6, 5);
        }
      } else if (p.id === 'pumpkin') {
        // 幽灵南瓜：追踪幽灵瓜
        p.timer -= dt;
        if (p.timer <= 0) {
          var best = null;
          G.zombies.forEach(function (z) {
            if (z.dead || z.row !== p.r || z.x < cx - 10) return;
            if (!best || z.x < best.x) best = z;
          });
          if (best) {
            G.gourds.push({ x: cx + 18, y: foot - 62, row: p.r, t: 0, life: 6, target: best, ph: rnd(0, 6) });
            p.timer = 4.2;
            p.shoot = .25;
            AU.sfx('ghost');
            burst(cx + 18, foot - 62, 10, ['#ffd59a', '#ffb35c', '#fff3d0'], { min: 20, max: 90, g: -30, shape: 'star' });
          } else p.timer = 0;
        }
      } else if (p.id === 'sundae') {
        // 甜筒炮：整行糖浆
        p.timer -= dt;
        p.cherry = clamp(1 - p.timer / 12, 0, 1);
        if (p.timer <= 0) {
          if (rowHasZombie(p.r, cx)) {
            G.syrup.push({ x: cx + 40, row: p.r, t: 0, dmg: 260, hit: [], vx: 520 });
            p.timer = 12;
            p.cherry = 0;
            addShake(6);
            flashWhite = Math.max(flashWhite, .24);
            addHitStop(.04);
            AU.sfx('sundae');
            floater(cx, foot - 104, TF('splash'), '#ff9fc4', 22);
            ring(cx + 40, foot - 40, 8, 90, '#ffb3cf', .5, 5);
          } else p.timer = 0;
        }
      } else if (p.id === 'potato') {
        if (!p.armed) {
          p.timer -= dt;
          if (p.timer <= 0) {
            p.armed = true;
            AU.sfx('pop');
            burst(cx, foot, 12, ['#8a6234', '#6b4a24', '#ffd1e3'], { min: 30, max: 110, up: 90, shape: 'star' });
          }
        } else {
          p.rise = Math.min(1, p.rise + dt * 3);
          if (p.rise >= 1) {
            var hit = G.zombies.some(function (z) { return !z.dead && z.row === p.r && z.x > cx - 44 && z.x < cx + 46; });
            if (hit) {
              explode(cx, foot - 18, 88, 1800, false);
              floater(cx, foot - 72, T('spudow'), '#ffd23a', 30);
              AU.sfx('spudow');
              removePlant(p);
            }
          }
        }
      } else if (p.id === 'cherry') {
        p.cherry += dt;
        if (p.cherry >= 1) {
          var ccy = foot - 28;
          G.fx.push({ k: 'area', x: cx, y: ccy, w: CW * 3, h: CH * 3, t: 0, life: .5 });
          explode(cx, ccy, 0, 0, true);
          G.zombies.forEach(function (z) {
            if (z.dead) return;
            if (Math.abs(z.row - p.r) <= 1 && Math.abs(z.x - cx) <= CW * 1.5) hurtZ(z, 1800, 'boom', true);
          });
          floater(cx, ccy - 66, T('boom'), '#ff5a2a', 34);
          removePlant(p);
        }
      } else if (p.id === 'chomper') {
        if (p.chew > 0) {
          p.chew -= dt;
          if (p.chew <= 0) AU.sfx('swallow');
        } else {
          p.timer -= dt;
          for (var j = 0; j < G.zombies.length; j++) {
            var z = G.zombies[j];
            if (z.dead || z.giant || z.row !== p.r) continue;
            if (z.x > cx + 6 && z.x < cx + 96) {
              killZ(z, 'chomp');
              p.chew = 18;
              p.timer = 18;
              floater(cx + 20, foot - 84, T('munch'), '#ffd23a', 24);
              sparkles(cx + 24, foot - 56, 8, ['#ffe08a', '#ffffff']);
              AU.sfx('swallow');
              break;
            }
          }
        }
      } else if (p.id === 'spike') {
        p.timer -= dt;
        if (p.timer <= 0) {
          p.timer = .8;
          G.zombies.forEach(function (z) {
            if (z.dead || z.row !== p.r) return;
            if (z.x > cx - CW / 2 && z.x < cx + CW / 2) {
              if (z.giant && z.smashCD <= 0) {
                z.smashCD = 1.5;
                removePlant(p);
                burst(cx, foot - 10, 12, ['#fff3c4', '#ffd1e3', '#ffffff'], { min: 30, max: 130, shape: 'star' });
                return;
              }
              hurtZ(z, 20, 'spike');
            }
          });
        }
      } else if (p.id === 'torch') {
        if (Math.random() < .18) {
          particle.push({
            x: cx + rnd(-8, 8), y: foot - 82, vx: rnd(-12, 12), vy: rnd(-50, -22),
            life: .6, max: 1, g: -20, size: rnd(1.4, 2.6), color: '#ffd08a', shape: 'star', rot: 0, vr: 3
          });
        }
      }
    }
  }

  function firePea(p, row, cx, foot) {
    var y = foot - 50;
    var laneCX = row === p.r ? cx : cellCX(p.c);
    G.peas.push({ x: laneCX + 30, y: row === p.r ? y : rowFoot(row) - 50, row: row, vx: 340, ice: p.id === 'snowpea', fire: false, dmg: 20 });
  }

  function updateZombies(dt) {
    for (var i = G.zombies.length - 1; i >= 0; i--) {
      var z = G.zombies[i];
      if (z.flash > 0) z.flash -= dt;
      if (z.slow > 0) z.slow -= dt;
      if (z.smashCD > 0) z.smashCD -= dt;
      if (z.bounceCD > 0) z.bounceCD -= dt;
      if (z.dead) {
        z.dieT += dt;
        if (z.dieT > (z.charred ? .9 : 1.7)) G.zombies.splice(i, 1);
        continue;
      }
      // 幽灵瓜附着伤害
      if (z.gourdT > 0) {
        z.gourdT -= dt;
        z.hp -= z.gourdDps * dt;
        z.slow = Math.max(z.slow, .5);
        if (Math.random() < .3) {
          particle.push({
            x: z.x + rnd(-14, 14), y: z.y - rnd(20, 80), vx: rnd(-10, 10), vy: rnd(-50, -18),
            life: .5, max: 1, g: -40, size: rnd(2, 4), color: Math.random() < .5 ? '#ffb35c' : '#ffe0a8', shape: 'star', rot: 0, vr: 4
          });
        }
        if (z.hp <= 0) { killZ(z, 'ghost'); continue; }
      }
      if (z.jumping) {
        z.jt += dt * (z.slow > 0 ? .5 : 1);
        var dur = z.jumpDur || .95;
        var k = clamp(z.jt / dur, 0, 1);
        z.x = lerp(z.jx0, z.jx1, k);
        z.jy = Math.sin(k * Math.PI) * (z.jumpH || 82);
        z.ph += dt * 7;
        if (k >= 1) {
          z.jumping = false; z.jy = 0; z.state = 'walk'; z.hasPole = false;
          burst(z.x, z.y, 11, ['#ffd1e3', '#ffb3cf', '#ffffff', '#ffe08a'], { min: 30, max: 120, up: 60, shape: 'star' });
          ring(z.x, z.y, 4, 52, '#ffb3cf', .34, 4);
        }
        continue;
      }
      if (z.throwImp && !z.thrown && z.hp <= z.maxhp * .5) {
        z.thrown = true; z.throwT = 0;
        var targetX = clamp(z.x - rnd(280, 420), GX + CW * 3, GX + CW * 6);
        var imp = spawnZombie('imp', z.row, targetX + 40);
        imp.y = rowFoot(z.row);
        imp.jy = 0;
        imp.ph = 0;
        AU.sfx('throw');
        floater(z.x, z.y - 120, '!', '#ffb03a', 30);
        ring(z.x, z.y - 90, 6, 60, '#ffd1e3', .4, 4);
      }
      if (z.throwT >= 0) { z.throwT += dt; if (z.throwT > 2) z.throwT = -1; }

      var mult = z.slow > 0 ? .5 : 1;
      var bite = z.x - 26 * z.scale;
      var col = Math.floor((bite - GX) / CW);
      var target = (col >= 0 && col < COLS) ? G.grid[z.row][col] : null;
      if (target && (target.broken || target.hp === 0)) target = null;

      z.eat = false;

      // 泡泡团子：远程定身
      if (z.bubble) {
        z.shootCD -= dt * mult;
        if (z.shootCD <= 0) {
          var tp = null;
          for (var pi = 0; pi < G.plants.length; pi++) {
            var pp = G.plants[pi];
            if (pp.r !== z.row) continue;
            var px = cellCX(pp.c);
            if (px < z.x - 12 && px > z.x - 360 && (!tp || px > cellCX(tp.c))) tp = pp;
          }
          if (tp) {
            G.bubbles.push({ x: z.x - 26 * z.scale, y: z.y - 58 * z.scale, row: z.row, vx: -185, t: 0, ph: rnd(0, 6) });
            z.shootCD = rnd(4.6, 6.2);
            AU.sfx('bubble');
          } else z.shootCD = .8;
        }
      }

      // 弹簧团子：跳过大植物
      if (z.bounce && z.bounceCD <= 0) {
        var jc = col;
        if (jc >= 0 && jc < COLS && G.grid[z.row][jc] && G.grid[z.row][jc].id && bite < cellCX(jc) + 44) {
          z.jumping = true; z.jt = 0; z.jx0 = z.x;
          z.jx1 = Math.max(GX + 20, Math.min(cellCX(jc) - CW + 18, z.x - 64));
          z.jumpDur = .72; z.jumpH = 96; z.bounceCD = 4.5;
          AU.sfx('boing');
          floater(z.x, z.y - 128, TF('boing'), '#9be8cf', 18);
          ring(z.x, z.y - 6, 6, 52, '#9be8cf', .38, 4);
          continue;
        }
      }

      // 撑杆跳
      if (z.state === 'run' && z.hasPole) {
        var jp = col >= 0 && col < COLS ? G.grid[z.row][col] : null;
        if (jp && jp.id && jp.id !== 'spike' && jp.id !== 'tallnut' && bite < cellCX(col) + 40) {
          z.jumping = true; z.jt = 0; z.jx0 = z.x;
          z.jx1 = Math.max(GX + 20, Math.min(cellCX(col) - CW + 16, z.x - 70));
          z.jumpDur = .95; z.jumpH = 82;
          AU.sfx('vault');
          burst(z.x, z.y, 8, ['#d8b98a', '#f3e0c4', '#ffffff'], { min: 20, max: 90, up: 40, shape: 'star' });
          continue;
        }
      }

      if (target && target.id && bite < cellCX(col) + 34) {
        z.eat = true;
        z.ph += dt * 8 * mult;
        if (z.giant) {
          if (z.smashCD <= 0) {
            z.smash += dt * mult;
            if (z.smash >= .78) {
              z.smash = 0; z.smashCD = 1.1;
              removePlant(target);
              burst(cellCX(col), z.y, 22, ['#ffd1e3', '#ffd9a0', '#ffffff', '#c7b2ff'], { min: 60, max: 240, up: 140, s0: 3, s1: 9, shape: 'star' });
              ring(cellCX(col), z.y - 20, 8, 96, '#ffd1e3', .42, 5);
              addShake(9);
              addHitStop(.05);
              AU.sfx('smash');
              floater(cellCX(col), z.y - 74, T('smash'), '#ff8a9c', 24);
            }
          }
        } else if (target.id !== 'spike') {
          hurtPlant(target, 100 * mult * dt);
          AU.sfx('chomp');
        }
      } else {
        z.smash = 0;
        var spd = (z.state === 'run' ? z.run : z.speed) * mult;
        z.x -= spd * dt;
        z.ph += dt * (z.state === 'run' ? 9 : 4.4) * mult * (z.giant ? .72 : 1);
      }

      if (z.x < GX - 10) {
        var mw = G.mowers[z.row];
        if (mw.state === 'idle') {
          mw.state = 'run'; mw.t = 0;
          G.stats.mowersUsed++;
          AU.sfx('mower');
          addShake(7);
          ring(GX - 20, z.y, 6, 80, '#ffd1e3', .5, 5);
        } else if (z.x < GX - 58 && mw.state !== 'run') {
          endGame(false);
          return;
        }
      }
    }
  }

  function updatePeas(dt) {
    for (var i = G.peas.length - 1; i >= 0; i--) {
      var b = G.peas[i];
      b.x += b.vx * dt;
      if (b.vy) {
        b.y += b.vy * dt;
        b.vy *= .96;
      }
      // 火炬转化
      if (!b.star) {
        if (!b.fire && !b.ice) {
          for (var t = 0; t < G.plants.length; t++) {
            var p = G.plants[t];
            if (p.id === 'torch' && p.r === b.row && Math.abs(b.x - cellCX(p.c)) < 22) {
              b.fire = true;
              b.dmg = 40;
              AU.sfx('torch');
              burst(b.x, b.y, 6, ['#ffd23a', '#ff7a1a'], { min: 20, max: 90, shape: 'star' });
              break;
            }
          }
        } else if (b.ice) {
          for (var t2 = 0; t2 < G.plants.length; t2++) {
            var p2 = G.plants[t2];
            if (p2.id === 'torch' && p2.r === b.row && Math.abs(b.x - cellCX(p2.c)) < 22) {
              b.ice = false; b.fire = false; b.dmg = 20;
              break;
            }
          }
        }
      }
      if (b.star && Math.random() < .5) {
        particle.push({
          x: b.x - 10, y: b.y, vx: rnd(-20, 0), vy: rnd(-14, 14),
          life: .35, max: 1, g: 0, size: rnd(1.4, 2.6), color: Math.random() < .5 ? '#fff6c0' : '#c9d8ff', shape: 'star', rot: 0, vr: 6
        });
      }
      var hit = null;
      for (var j = 0; j < G.zombies.length; j++) {
        var z = G.zombies[j];
        if (z.dead || z.row !== b.row) continue;
        if (b.star && b.hit && b.hit.indexOf(z) >= 0) continue;
        if (b.x >= z.x - 24 * z.scale && b.x <= z.x + 16 * z.scale) {
          if (!hit || z.x < hit.x) hit = z;
        }
      }
      if (hit) {
        hurtZ(hit, b.dmg, b.star ? 'star' : (b.fire ? 'fire' : b.ice ? 'ice' : 'pea'));
        if (b.fire) {
          G.zombies.forEach(function (o) {
            if (o === hit || o.dead || o.row !== b.row) return;
            if (Math.abs(o.x - hit.x) < 46) hurtZ(o, 14, 'fire', true);
          });
          burst(b.x, b.y, 8, ['#ffd23a', '#ff7a1a', '#fff2c0'], { min: 40, max: 140, g: 100 });
        }
        if (b.star) {
          sparkles(b.x, b.y, 4, ['#fff6c0', '#ffffff', '#c9d8ff']);
          b.hit.push(hit);
          b.pierce--;
          if (b.pierce <= 0) G.peas.splice(i, 1);
        } else {
          G.peas.splice(i, 1);
        }
      } else if (b.x > W + 24) {
        G.peas.splice(i, 1);
      }
    }
  }

  function updateGourds(dt) {
    for (var i = G.gourds.length - 1; i >= 0; i--) {
      var g = G.gourds[i];
      g.t += dt;
      var z = g.target;
      if (!z || z.dead || g.t > g.life) {
        burst(g.x, g.y, 6, ['#ffb35c', '#ffd9a0'], { min: 10, max: 50, g: -20, shape: 'star' });
        G.gourds.splice(i, 1);
        continue;
      }
      var tx = z.x, ty = z.y - 66 * z.scale;
      var dx = tx - g.x, dy = ty - g.y, d = Math.hypot(dx, dy) || 1;
      var sp = 300;
      g.x += dx / d * sp * dt;
      g.y += dy / d * sp * dt;
      g.ph += dt * 6;
      if (Math.random() < .5) {
        particle.push({
          x: g.x, y: g.y + 8, vx: rnd(-8, 8), vy: rnd(-30, -6),
          life: .4, max: 1, g: -30, size: rnd(1.6, 3), color: Math.random() < .5 ? '#ffb35c' : '#ffe0a8', shape: 'star', rot: 0, vr: 3
        });
      }
      if (d < 22) {
        z.gourdT = 3.2;
        z.gourdDps = 34;
        burst(z.x, z.y - 60 * z.scale, 12, ['#ffb35c', '#ffd9a0', '#fff3d0'], { min: 30, max: 130, shape: 'star' });
        ring(z.x, z.y - 60 * z.scale, 6, 58, '#ffb35c', .4, 4);
        G.gourds.splice(i, 1);
      }
    }
  }

  function updateSyrup(dt) {
    for (var i = G.syrup.length - 1; i >= 0; i--) {
      var s = G.syrup[i];
      s.t += dt;
      s.x += s.vx * dt;
      for (var j = 0; j < G.zombies.length; j++) {
        var z = G.zombies[j];
        if (z.dead || z.row !== s.row || s.hit.indexOf(z) >= 0) continue;
        if (Math.abs(z.x - s.x) < 34) {
          s.hit.push(z);
          hurtZ(z, s.dmg, 'syrup');
          z.slow = Math.max(z.slow, 2.4);
          burst(z.x, z.y - 40, 12, ['#ffb3cf', '#ffe08a', '#ffffff'], { min: 40, max: 170, g: 260, shape: 'star' });
          ring(z.x, z.y - 40, 6, 56, '#ff9fc4', .35, 4);
        }
      }
      if (s.x > GX + COLS * CW + 80) G.syrup.splice(i, 1);
    }
  }

  function updateBubbles(dt) {
    for (var i = G.bubbles.length - 1; i >= 0; i--) {
      var b = G.bubbles[i];
      b.t += dt;
      b.x += b.vx * dt;
      b.y += Math.sin(b.t * 4 + b.ph) * 14 * dt;
      var hitP = null;
      for (var j = 0; j < G.plants.length; j++) {
        var p = G.plants[j];
        if (p.r !== b.row) continue;
        if (Math.abs(cellCX(p.c) - b.x) < 26) { hitP = p; break; }
      }
      if (hitP) {
        if (hitP.stun <= .3) floater(cellCX(hitP.c), rowFoot(hitP.r) - 98, TF('stun'), '#9be8cf', 17);
        hitP.stun = Math.max(hitP.stun, 2.6);
        ring(cellCX(hitP.c), rowFoot(hitP.r) - 40, 6, 54, '#bfe9ff', .45, 4);
        burst(b.x, b.y, 10, ['#dff4ff', '#ffffff', '#bfe9ff'], { min: 20, max: 100, g: -40 });
        AU.sfx('pop');
        G.bubbles.splice(i, 1);
      } else if (b.x < GX - 40 || b.t > 4) {
        G.bubbles.splice(i, 1);
      }
    }
  }

  function updateSuns(dt) {
    for (var i = G.suns.length - 1; i >= 0; i--) {
      var s = G.suns[i];
      s.t += dt;
      if (s.state === 'fall') {
        s.y += 48 * dt;
        if (s.y >= s.ty) { s.y = s.ty; s.state = 'rest'; }
      } else if (s.state === 'pop') {
        s.vy += 470 * dt; s.x += s.vx * dt; s.y += s.vy * dt;
        if (s.vy > 0 && s.y >= s.ty) { s.y = s.ty; s.state = 'rest'; }
      } else if (s.state === 'rest') {
        if (G.auto && s.t > .6) { collectSun(s); continue; }
        s.life -= dt;
        if (s.life <= 0) G.suns.splice(i, 1);
        continue;
      } else if (s.state === 'fly') {
        s.ft += dt / .7;
        var k = Math.min(1, s.ft), e = k * k * (3 - 2 * k);
        var tx = UI.sunCard.x + UI.sunCard.w / 2, ty = UI.sunCard.y + 40;
        var cx2 = (s.fx0 + tx) / 2, cy2 = Math.min(s.fy0, ty) - 110;
        s.x = (1 - e) * (1 - e) * s.fx0 + 2 * (1 - e) * e * cx2 + e * e * tx;
        s.y = (1 - e) * (1 - e) * s.fy0 + 2 * (1 - e) * e * cy2 + e * e * ty;
        if (k >= 1) {
          var add = Math.round(s.val * G.diff.sun);
          G.sun += add;
          G.sunBump = .35;
          G.stats.sun += add;
          G.suns.splice(i, 1);
          AU.sfx('star');
        }
        continue;
      }
    }
  }

  function updateMowers(dt) {
    G.mowers.forEach(function (m) {
      if (m.state !== 'run') return;
      m.t += dt;
      m.x += 560 * dt;
      G.zombies.forEach(function (z) {
        if (!z.dead && z.row === m.row && Math.abs(z.x - m.x) < 40) {
          hurtZ(z, 99999, 'mower');
          burst(z.x, z.y - 20, 10, ['#ffd1e3', '#ffffff', '#ffd23a'], { min: 60, max: 210, shape: 'star' });
        }
      });
      G.graves.forEach(function (g) {
        if (!g.broken && g.r === m.row && Math.abs(cellCX(g.c) - m.x) < 40) breakGrave(g);
      });
      if (m.x > W + 70) m.state = 'done';
    });
  }

  function updateGraves(dt) {
    G.graves.forEach(function (g) {
      if (g.broken) return;
      g.t += dt;
      g.timer -= dt;
      var finalWaveOn = !G.endless && G.wave >= G.waveTotal;
      if (g.timer <= 0 && mode === 'playing' && !finalWaveOn) {
        g.timer = rnd(16, 24);
        if (G.zombies.length < 42) {
          var z = spawnZombie(Math.random() < .45 ? 'jelly' : (Math.random() < .5 ? 'normal' : 'cone'), g.r, cellCX(g.c) + 10);
          z.jy = 0;
          AU.sfx('grave');
          burst(cellCX(g.c), rowFoot(g.r), 14, ['#c9c2d4', '#9a92ad', '#ffe3ee'], { min: 20, max: 100, up: 80, shape: 'star' });
          ring(cellCX(g.c), rowFoot(g.r) - 16, 4, 46, '#c7b2ff', .45, 4);
        }
      }
    });
  }

  function updateParticles(dt) {
    for (var i = particle.length - 1; i >= 0; i--) {
      var p = particle[i];
      p.life -= dt;
      if (p.life <= 0) { particle.splice(i, 1); continue; }
      p.vy += p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      if (p.shape === 'spark') p.vx *= .97;
    }
    for (var j = floaters.length - 1; j >= 0; j--) {
      var f = floaters[j];
      f.t += dt; f.y -= 28 * dt;
      if (f.t > f.life + .3) floaters.splice(j, 1);
    }
    for (var k = G.fx.length - 1; k >= 0; k--) {
      G.fx[k].t += dt;
      if (G.fx[k].t > G.fx[k].life) G.fx.splice(k, 1);
    }
  }

  /* ============================================================
   * 结束
   * ============================================================ */
  function endGame(win) {
    if (G.state !== 'play') return;
    G.state = 'over';
    mode = 'ending';
    var mowersLeft = G.mowers.filter(function (m) { return m.state === 'idle'; }).length;
    var stars = 0;
    if (win && !G.endless) {
      stars = mowersLeft >= 4 ? 3 : mowersLeft >= 2 ? 2 : 1;
      G.starsGained = stars;
      var key = String(G.level.id);
      save.stars[key] = Math.max(save.stars[key] || 0, stars);
      if (G.level.id >= save.unlocked) save.unlocked = Math.min(D.LEVELS.length, G.level.id + 1);
      writeSave();
    }
    var score = 0;
    if (G.endless) {
      score = G.wave * 120 + G.stats.kills * 6 + Math.round(G.sun);
      if (G.wave > save.best.wave) save.best.wave = G.wave;
      if (score > save.best.score) save.best.score = score;
      writeSave();
    }
    G.result = {
      win: win, stars: stars, score: score,
      kills: G.stats.kills, planted: G.stats.planted, sun: G.stats.sun,
      mowers: mowersLeft, wave: G.wave, time: G.time, combo: G.maxCombo,
      huge: G.wave >= G.waveTotal
    };
    AU.music('');
    AU.sfx(win ? 'win' : 'lose');
    if (win) {
      flashWhite = .5;
      for (var i = 0; i < 7; i++) {
        burst(rnd(GX, GX + COLS * CW), rnd(GY, GY + ROWS * CH), 20, ['#ffd23a', '#ff9fc4', '#9be8cf', '#c7b2ff', '#ffffff'], { min: 60, max: 280, up: 120, g: 220, life: 1.7, shape: 'star' });
      }
      ring(W / 2, GY + 200, 20, W * .7, '#fff3a8', 1.0, 8);
    } else {
      addShake(10);
    }
    setTimeout(function () { if (G && G.state === 'over') showEnd(); }, win ? 900 : 1100);
  }

  /* ============================================================
   * 渲染
   * ============================================================ */
  function getBg(scene) {
    var key = scene + '@' + DPR;
    if (!bgCache[key]) bgCache[key] = A.buildBackground(scene, DPR);
    return bgCache[key];
  }

  function resize() {
    DPR = RENDER_DPR;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.aspectRatio = W + ' / ' + H;
    var frame = canvas.parentNode;
    if (frame && frame.clientWidth) frame.style.setProperty('--pvz-s', (frame.clientWidth / W).toFixed(4));
    bgCache = {};
  }
  window.addEventListener('resize', resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas.parentNode);

  var maxDpr = Math.min(window.devicePixelRatio || 1, 1.5);
  var RENDER_DPR = maxDpr;
  var slowAvg = 0, slowCount = 0;

  function render() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    var scene = (G && (G.scene)) || 'day';
    ctx.drawImage(getBg(scene), 0, 0, W, H);
    A.drawSky(ctx, scene, G ? G.time : menuT);

    if (!G) { drawMenuPreview(); return; }

    ctx.save();
    if (shake > 0) ctx.translate(rnd(-shake, shake) * .55, rnd(-shake, shake) * .55);

    if (mode === 'playing') drawHover();

    G.graves.forEach(function (g) {
      if (g.broken) return;
      A.drawGrave(ctx, cellCX(g.c), rowFoot(g.r) + 4, G.time + g.t, false);
    });

    G.mowers.forEach(function (m) {
      if (m.state === 'done') return;
      A.drawMower(ctx, m.x, rowFoot(m.row), m.state === 'run', m.t);
    });

    for (var r = 0; r < ROWS; r++) {
      var foot = rowFoot(r);
      for (var i = 0; i < G.plants.length; i++) {
        var p = G.plants[i];
        if (p.r !== r) continue;
        ctx.save();
        ctx.translate(cellCX(p.c), foot);
        if (p.hurt > 0) ctx.translate(Math.sin(G.time * 70) * 1.1, 0);
        A.drawPlant(ctx, p.id, p);
        ctx.restore();
        drawPlantAura(p, foot);
        if (G.showHp && p.hp < p.max && p.id !== 'cherry') drawMiniBar(cellCX(p.c), foot + 8, 38, p.hp / p.max, p.hp / p.max > .5 ? '#6bd04a' : '#e8483a');
      }
      var lane = [];
      for (var j = 0; j < G.zombies.length; j++) if (G.zombies[j].row === r) lane.push(G.zombies[j]);
      lane.sort(function (a, b) { return b.x - a.x; });
      lane.forEach(function (z) {
        A.drawZombie(ctx, z, G.time);
        drawGourdOn(z);
        if (z.flag) A.drawFlag(ctx, z.x + 8, z.y - 20, G.time);
        if (G.showHp && !z.dead && (z.hp < z.maxhp || (z.armorMax && z.armor < z.armorMax))) {
          var by = z.y - 104 * z.scale;
          drawMiniBar(z.x, by, 40, z.hp / z.maxhp, '#e8483a');
          if (z.armorMax && z.armor > 0) drawMiniBar(z.x, by - 7, 40, z.armor / z.armorMax, z.type === 'cone' ? '#ff9a2a' : z.type === 'newspaper' ? '#e8dcc0' : '#c5ced6');
        }
      });
      for (var k = 0; k < G.peas.length; k++) {
        var b = G.peas[k];
        if (b.row !== r) continue;
        if (b.star) drawStarShot(b);
        else A.drawPea(ctx, b.x, b.y, b.ice, b.fire, b.fire ? 1.12 : 1);
      }
    }

    drawSyrupWaves();
    drawBubbles();
    G.gourds.forEach(drawGourd);

    G.fx.forEach(function (f) { drawFx(f); });
    drawParticles();

    G.suns.forEach(function (s) {
      var alpha = 1;
      if (s.state === 'rest' && s.life < 3) alpha = Math.sin(s.life * 16) > 0 ? 1 : .35;
      if (s.state === 'rest' && G.auto) alpha *= .9;
      A.drawSun(ctx, s.x, s.y, 18 + Math.sin(G.time * 5 + s.ph) * 1, G.time * .9 + s.ph, alpha);
    });

    ctx.restore();

    if (mode === 'playing') {
      var m = G.mouse;
      if (G.shovel && m.in && m.y > 110) A.drawShovel(ctx, m.x + 8, m.y - 4, .9, -.45);
    }

    drawHUD();

    // 飘字只画在草坪内，避免盖到顶部 HUD 的卡牌上
    ctx.save();
    ctx.beginPath(); ctx.rect(0, GY, W, H - GY); ctx.clip();
    floaters.forEach(function (f) {
      var k = f.t / f.life, sc = k < .16 ? .6 + k / .16 * .55 : 1.12;
      ctx.globalAlpha = clamp(1 - (f.t - f.life) / .3, 0, 1);
      text(f.txt, f.x, f.y, f.size * sc, f.color, '#3a1c2c', 'center', 5);
      ctx.globalAlpha = 1;
    });
    ctx.restore();

    if (flashRed > 0) {
      ctx.fillStyle = 'rgba(255,70,110,' + (flashRed * .18) + ')';
      ctx.fillRect(0, 0, W, H);
    }
    if (flashWhite > 0) {
      ctx.fillStyle = 'rgba(255,250,255,' + (flashWhite * .55) + ')';
      ctx.fillRect(0, 0, W, H);
    }

    if (G.banner) drawBanner(G.banner);

    if (G.tip && G.tipT > 0) {
      var a = Math.min(1, G.tipT / .4);
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(70,30,55,.72)';
      rrPath(ctx, W / 2 - 240, GY + ROWS * CH + 12, 480, 34, 17);
      ctx.fill();
      text(G.tip, W / 2, GY + ROWS * CH + 29, 15, '#fff3f8', null, 'center');
      ctx.globalAlpha = 1;
    }
  }

  function drawPlantAura(p, foot) {
    if (p.shield > 0) {
      var cx = cellCX(p.c);
      ctx.save();
      var k = clamp(p.shield / (p.shieldMax || 300), 0, 1);
      ctx.globalAlpha = .18 + .22 * k;
      ctx.fillStyle = '#bfe9ff';
      ctx.beginPath(); ctx.ellipse(cx, foot - 38, 34, 42, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = .5 + .3 * Math.sin(G.time * 4 + p.t);
      ctx.strokeStyle = '#dff4ff'; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.ellipse(cx, foot - 38, 34, 42, 0, 0, TAU); ctx.stroke();
      ctx.restore();
      if (Math.random() < .06) {
        particle.push({ x: cx + rnd(-26, 26), y: foot - rnd(20, 70), vx: 0, vy: -18, life: .5, max: 1, g: 0, size: rnd(1.4, 2.4), color: '#ffffff', shape: 'star', rot: 0, vr: 2 });
      }
    }
    if (p.stun > 0) {
      ctx.save();
      ctx.globalAlpha = .85;
      for (var i = 0; i < 3; i++) {
        var a = G.time * 3 + i * 2.1;
        var sx = cellCX(p.c) + Math.cos(a) * 20;
        var sy = rowFoot(p.r) - 62 + Math.sin(a) * 7;
        starShape(ctx, sx, sy, 4.4, '#ffe08a', '#e9a93a');
      }
      ctx.restore();
    }
  }

  function drawGourdOn(z) {
    if (z.gourdT > 0) {
      var x = z.x + Math.sin(G.time * 8) * 4, y = z.y - 74 * z.scale;
      ctx.save();
      ctx.globalAlpha = .92;
      var g = ctx.createRadialGradient(x, y, 2, x, y, 22);
      g.addColorStop(0, 'rgba(255,220,150,.95)'); g.addColorStop(1, 'rgba(255,150,70,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 22, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffb35c';
      ctx.beginPath(); ctx.ellipse(x, y, 11, 9, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#8a5a2a'; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.fillStyle = '#6b4a24';
      ctx.beginPath(); ctx.moveTo(x - 5, y - 1); ctx.lineTo(x - 2, y + 3); ctx.lineTo(x + 1, y - 1); ctx.lineTo(x + 4, y + 3); ctx.lineTo(x + 6, y - 1); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }

  function drawGourd(g) {
    ctx.save();
    ctx.globalAlpha = .9;
    var x = g.x + Math.sin(g.ph) * 3, y = g.y + Math.sin(g.ph * .8) * 4;
    var rg = ctx.createRadialGradient(x, y, 2, x, y, 26);
    rg.addColorStop(0, 'rgba(255,225,170,.9)'); rg.addColorStop(1, 'rgba(255,160,80,0)');
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(x, y, 26, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffc06a';
    ctx.beginPath(); ctx.ellipse(x, y, 13, 11, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#c07a34'; ctx.lineWidth = 1.8; ctx.stroke();
    ctx.fillStyle = '#5d3a1c';
    ctx.beginPath(); ctx.arc(x - 4, y - 2, 1.7, 0, TAU); ctx.arc(x + 4, y - 2, 1.7, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - 5, y + 3); ctx.lineTo(x - 2, y + 6); ctx.lineTo(x + 1, y + 3); ctx.lineTo(x + 4, y + 6); ctx.lineTo(x + 6, y + 3); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#7fae5a'; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(x, y - 10); ctx.quadraticCurveTo(x + 4, y - 16, x + 7, y - 15); ctx.stroke();
    ctx.restore();
  }

  function drawStarShot(b) {
    var col = '#fff6c0';
    ctx.save();
    ctx.globalAlpha = .45;
    for (var i = 3; i >= 1; i--) {
      ctx.fillStyle = 'rgba(255,246,192,' + (.22 - i * .05) + ')';
      ctx.beginPath(); ctx.arc(b.x - i * 9, b.y, 4.6 - i * .9, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    starShape(ctx, b.x, b.y, 6.2, col, '#e8c25a');
    ctx.restore();
  }

  function drawSyrupWaves() {
    G.syrup.forEach(function (s) {
      var y = rowFoot(s.row) - 34;
      ctx.save();
      // 波体
      var g = ctx.createLinearGradient(s.x - 60, 0, s.x + 40, 0);
      g.addColorStop(0, 'rgba(255,159,196,0)');
      g.addColorStop(.55, 'rgba(255,159,196,.75)');
      g.addColorStop(1, 'rgba(255,224,138,.85)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(s.x - 70, y + 26);
      for (var i = 0; i <= 10; i++) {
        var px = s.x - 70 + i * 12;
        var py = y - 18 + Math.sin(G.time * 14 + i * .8) * 7;
        ctx.lineTo(px, py);
      }
      ctx.lineTo(s.x + 60, y + 26);
      ctx.closePath(); ctx.fill();
      // 顶部奶泡
      ctx.fillStyle = 'rgba(255,255,255,.7)';
      for (var k = 0; k < 4; k++) {
        var fx = s.x - 40 + k * 22;
        ctx.beginPath(); ctx.arc(fx, y - 16 + Math.sin(G.time * 10 + k) * 5, 7, 0, TAU); ctx.fill();
      }
      ctx.restore();
    });
  }

  function drawBubbles() {
    G.bubbles.forEach(function (b) {
      ctx.save();
      var r = 11 + Math.sin(b.t * 6 + b.ph) * 1.4;
      var g = ctx.createRadialGradient(b.x - r * .3, b.y - r * .35, 1, b.x, b.y, r);
      g.addColorStop(0, 'rgba(255,255,255,.9)');
      g.addColorStop(.5, 'rgba(200,240,255,.5)');
      g.addColorStop(1, 'rgba(150,220,255,.25)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(190,235,255,.9)'; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.beginPath(); ctx.arc(b.x - r * .35, b.y - r * .35, r * .22, 0, TAU); ctx.fill();
      ctx.restore();
    });
  }

  function drawMenuPreview() {
    var demo = [
      { id: 'sunflower', c: 1, r: 1 }, { id: 'star', c: 2, r: 1 }, { id: 'marshmallow', c: 3, r: 1 },
      { id: 'snowpea', c: 1, r: 3 }, { id: 'pumpkin', c: 2, r: 3 }, { id: 'sundae', c: 3, r: 3 },
      { id: 'chomper', c: 1, r: 2 }, { id: 'peashooter', c: 2, r: 2 }, { id: 'wallnut', c: 4, r: 2 }
    ];
    demo.forEach(function (d, i) {
      ctx.save();
      ctx.translate(cellCX(d.c) + 6, rowFoot(d.r));
      ctx.globalAlpha = .92;
      A.drawPlant(ctx, d.id, { t: menuT + i * .7, hp: 1, max: 1, armed: true, rise: 1, cherry: .3, chew: 0, hurt: 0, shoot: 0, glow: .25 + .25 * Math.sin(menuT * 2 + i) });
      ctx.restore();
    });
    var types = ['jelly', 'spring', 'bubble', 'normal'];
    for (var i = 0; i < 4; i++) {
      var x = GX + COLS * CW - ((menuT * 22 + i * 96) % (COLS * CW + 260));
      ctx.save();
      ctx.translate(x, rowFoot(4));
      A.drawZombie(ctx, {
        type: types[i], ph: menuT * 3 + i, eat: false, dead: false, dieT: 0, flash: 0, slow: 0,
        armLost: false, armor: 0, armorMax: 0, armorType: null, scale: 1, x: 0, y: 0, smash: 0, hasPole: false
      }, menuT);
      ctx.restore();
    }
    for (var s = 0; s < 5; s++) {
      var sx = GX + 80 + ((s * 173 + menuT * 18) % (COLS * CW - 120));
      var sy = GY + 110 + Math.sin(menuT * 1.3 + s) * 22 + s * 38;
      A.drawSun(ctx, sx, sy, 16, menuT + s, .85);
    }
    for (var st = 0; st < 8; st++) {
      var ax = GX + ((st * 191 + menuT * 26) % (COLS * CW));
      var ay = GY + ((st * 117 + menuT * 14) % (ROWS * CH));
      ctx.save(); ctx.globalAlpha = .35 + .3 * Math.sin(menuT * 2 + st);
      starShape(ctx, ax, ay, 3.4 + Math.sin(menuT * 3 + st) * 1.2, '#fff6c0', null);
      ctx.restore();
    }
    var vg = ctx.createRadialGradient(W / 2, H / 2, 120, W / 2, H / 2, W * .62);
    vg.addColorStop(0, 'rgba(80,40,70,.05)'); vg.addColorStop(1, 'rgba(70,30,60,.42)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  }

  function drawParticles() {
    for (var i = 0; i < particle.length; i++) {
      var p = particle[i];
      var a = clamp(p.life / .4, 0, 1);
      ctx.globalAlpha = a;
      if (p.shape === 'arm') {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        line(ctx, -9, 0, 5, 0, 6.5, '#6b5a45'); line(ctx, 5, 0, 12, 0, 5.5, '#9cbb8c');
        circle(ctx, 13, 0, 3.8, '#7d9d6d', null);
        ctx.restore();
      } else if (p.shape === 'rect') {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.color; ctx.fillRect(-p.size, -p.size * .6, p.size * 2, p.size * 1.2);
        ctx.restore();
      } else if (p.shape === 'star') {
        ctx.save(); ctx.translate(p.x, p.y); ctx.globalAlpha = a;
        var r = p.size * (0.5 + a * .8);
        ctx.fillStyle = p.color;
        starPath(ctx, 0, 0, r, r * .42, 4, p.rot);
        ctx.fill();
        ctx.restore();
      } else if (p.shape === 'spark') {
        ctx.strokeStyle = p.color; ctx.lineWidth = Math.max(1, p.size * .4);
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * .03, p.y - p.vy * .03); ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.45 + a * .55), 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawFx(f) {
    var k = f.t / f.life;
    if (f.k === 'boom') {
      var R = f.r || 84;
      var rad = (0.3 + k * .95) * Math.max(R, 88) * (f.r ? 1 : 1.35);
      var g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, rad);
      g.addColorStop(0, 'rgba(255,255,235,' + (1 - k) + ')');
      g.addColorStop(.28, 'rgba(255,190,110,' + (.85 * (1 - k)) + ')');
      g.addColorStop(.55, 'rgba(255,120,160,' + (.6 * (1 - k)) + ')');
      g.addColorStop(.8, 'rgba(190,90,200,' + (.3 * (1 - k)) + ')');
      g.addColorStop(1, 'rgba(80,20,60,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.x, f.y, rad, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,244,200,' + (.6 * (1 - k)) + ')';
      ctx.lineWidth = 4 * (1 - k) + .5;
      ctx.beginPath(); ctx.arc(f.x, f.y, rad * .92, 0, TAU); ctx.stroke();
    } else if (f.k === 'ring') {
      var r = lerp(f.r0, f.r1, k);
      ctx.save();
      ctx.globalAlpha = (1 - k) * .85;
      ctx.strokeStyle = f.color;
      ctx.lineWidth = Math.max(.6, f.wide * (1 - k));
      ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, TAU); ctx.stroke();
      ctx.globalAlpha = (1 - k) * .25;
      ctx.lineWidth = Math.max(.4, f.wide * .5 * (1 - k));
      ctx.beginPath(); ctx.arc(f.x, f.y, r * .74, 0, TAU); ctx.stroke();
      ctx.restore();
    } else if (f.k === 'area') {
      ctx.fillStyle = 'rgba(255,190,215,' + (.32 * (1 - k)) + ')';
      ctx.fillRect(f.x - f.w / 2, f.y - f.h / 2, f.w, f.h);
      ctx.strokeStyle = 'rgba(255,245,220,' + (.75 * (1 - k)) + ')';
      ctx.lineWidth = 3;
      ctx.strokeRect(f.x - f.w / 2, f.y - f.h / 2, f.w, f.h);
    }
  }

  function drawMiniBar(x, y, w, ratio, color) {
    rrPath(ctx, x - w / 2 - 1, y - 1, w + 2, 7, 3.5);
    ctx.fillStyle = 'rgba(60,25,45,.66)'; ctx.fill();
    rrPath(ctx, x - w / 2, y, Math.max(2, w * clamp(ratio, 0, 1)), 5, 2.5);
    ctx.fillStyle = color; ctx.fill();
    rrPath(ctx, x - w / 2, y, Math.max(2, w * clamp(ratio, 0, 1)), 2, 1);
    ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.fill();
  }

  function rrPath(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }

  function line(c, x1, y1, x2, y2, w, col) {
    c.strokeStyle = col;
    c.lineWidth = w;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
  }

  function circle(c, x, y, r, fill, stroke) {
    c.beginPath(); c.arc(x, y, r, 0, TAU);
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1.5; c.stroke(); }
  }

  function starPath(c, x, y, rOut, rIn, points, rot) {
    var n = points || 4;
    c.beginPath();
    for (var i = 0; i < n * 2; i++) {
      var rr = i % 2 ? rIn : rOut;
      var a = (rot || 0) + i * Math.PI / n;
      var px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
    }
    c.closePath();
  }
  function starShape(c, x, y, r, fill, stroke) {
    // 四角闪光星（凹边）
    c.beginPath();
    c.moveTo(x, y - r);
    c.quadraticCurveTo(x + r * .16, y - r * .16, x + r, y);
    c.quadraticCurveTo(x + r * .16, y + r * .16, x, y + r);
    c.quadraticCurveTo(x - r * .16, y + r * .16, x - r, y);
    c.quadraticCurveTo(x - r * .16, y - r * .16, x, y - r);
    c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1.2; c.stroke(); }
  }

  var FONT = '"AMG Display","PingFang SC","Hiragino Sans GB","Microsoft YaHei",system-ui,sans-serif';
  var NUMFONT = '"SF Pro Rounded","PingFang SC","Hiragino Sans GB","Microsoft YaHei",system-ui,sans-serif';
  var CJK = /[　-鿿＀-￯]/;
  function text(txt, x, y, size, fill, stroke, align, lw) {
    ctx.font = '700 ' + size + 'px ' + (CJK.test(txt) ? FONT : NUMFONT);
    ctx.textAlign = align || 'center';
    ctx.textBaseline = 'middle';
    if (stroke) {
      ctx.lineJoin = 'round';
      ctx.lineWidth = lw || 4;
      ctx.strokeStyle = stroke;
      ctx.strokeText(txt, x, y);
    }
    ctx.fillStyle = fill;
    ctx.fillText(txt, x, y);
  }

  function drawBanner(b) {
    var a = clamp(Math.min(b.t, .45) / .45, 0, 1);
    var pulse = b.huge ? (0.88 + 0.12 * Math.sin(G.time * 11)) : 1;
    ctx.save();
    ctx.globalAlpha = a;
    if (b.huge) {
      var g = ctx.createLinearGradient(0, GY + 150, 0, GY + 270);
      g.addColorStop(0, 'rgba(255,120,160,0)');
      g.addColorStop(.5, 'rgba(255,120,160,.30)');
      g.addColorStop(1, 'rgba(255,120,160,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, GY + 140, W, 140);
      ctx.fillStyle = 'rgba(255,255,255,.75)';
      ctx.fillRect(0, GY + 150, W, 2);
      ctx.fillRect(0, GY + 268, W, 2);
      for (var i = 0; i < 10; i++) {
        var sx = ((G.time * 90 + i * 131) % W);
        ctx.globalAlpha = a * (.4 + .4 * Math.sin(G.time * 6 + i));
        starShape(ctx, sx, GY + 160 + (i % 4) * 30, 4, '#fff3f8', null);
      }
      ctx.globalAlpha = a;
    }
    var y = b.huge ? GY + 196 : GY + 130;
    text(b.txt, W / 2, y, b.size * pulse, b.color, '#3a1226', 'center', b.huge ? 9 : 7);
    if (b.sub) text(b.sub, W / 2, y + 40, 20, '#ffd7e6', '#3a1226', 'center', 5);
    ctx.restore();
  }

  function drawHover() {
    var m = G.mouse;
    if (!m.in || m.y < GY - 10) return;
    var cell = cellOf(m.x, m.y);
    if (!cell) return;
    var occupied = !!G.grid[cell.r][cell.c];
    if (G.sel >= 0) {
      var card = G.cards[G.sel];
      var ok = !occupied && canAfford(card);
      ctx.fillStyle = ok ? 'rgba(255,255,255,.28)' : 'rgba(255,90,120,.26)';
      rrPath(ctx, GX + cell.c * CW + 3, GY + cell.r * CH + 3, CW - 6, CH - 6, 16); ctx.fill();
      ctx.strokeStyle = ok ? 'rgba(255,255,255,.85)' : 'rgba(255,120,150,.9)';
      ctx.lineWidth = 2.4; ctx.stroke();
      if (!occupied) {
        ctx.save();
        ctx.globalAlpha = .55;
        ctx.translate(cellCX(cell.c), rowFoot(cell.r));
        A.drawPlant(ctx, card.id, { t: G.time, hp: 1, max: 1, armed: true, rise: 1, cherry: .3, chew: 0, hurt: 0, shoot: 0 });
        ctx.restore();
      }
    } else if (G.shovel && occupied) {
      ctx.fillStyle = 'rgba(255,90,120,.26)';
      ctx.fillRect(GX + cell.c * CW + 3, GY + cell.r * CH + 3, CW - 6, CH - 6);
    }
  }

  /* ---------------- HUD ---------------- */
  function drawHUD() {
    // 奶油糖板
    var g = ctx.createLinearGradient(0, 0, 0, 104);
    g.addColorStop(0, '#ffe2ee'); g.addColorStop(.55, '#ffcfe2'); g.addColorStop(1, '#f7aecb');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, 104);
    // 斜纹糖纸
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, W, 104); ctx.clip();
    for (var i = -8; i < 40; i++) {
      ctx.fillStyle = 'rgba(255,255,255,' + (i % 2 ? .12 : .05) + ')';
      ctx.beginPath();
      ctx.moveTo(i * 34, 0); ctx.lineTo(i * 34 + 17, 0);
      ctx.lineTo(i * 34 + 17 - 40, 104); ctx.lineTo(i * 34 - 40, 104);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    // 圆点
    for (var d = 0; d < 26; d++) {
      ctx.fillStyle = 'rgba(255,255,255,.22)';
      ctx.beginPath(); ctx.arc(20 + d * 43, 96 - (d % 3) * 5, 1.8, 0, TAU); ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillRect(0, 0, W, 2);
    ctx.fillStyle = 'rgba(120,50,85,.28)'; ctx.fillRect(0, 102, W, 3);

    // 阳光槽
    var s = UI.sunCard;
    var bump = G.sunBump > 0 ? 1 + Math.sin(G.sunBump / .35 * Math.PI) * .12 : 1;
    ctx.save();
    if (bump > 1.01) { ctx.shadowColor = '#ffe08a'; ctx.shadowBlur = 18; }
    rrPath(ctx, s.x, s.y, s.w, s.h, 16);
    var sg = ctx.createLinearGradient(0, s.y, 0, s.y + s.h);
    sg.addColorStop(0, '#fffbe8'); sg.addColorStop(1, '#ffe9a8');
    ctx.fillStyle = sg; ctx.fill();
    ctx.restore();
    rrPath(ctx, s.x, s.y, s.w, s.h, 16);
    ctx.strokeStyle = '#e2699d'; ctx.lineWidth = 2.6; ctx.stroke();
    ctx.save(); ctx.translate(s.x + s.w / 2, s.y + 40); ctx.scale(bump, bump);
    A.drawSun(ctx, 0, 0, 16, G.time * .8, 1);
    ctx.restore();
    text(String(Math.floor(G.sun)), s.x + s.w / 2, s.y + 72, 22, '#5d2f45');

    // 卡牌
    var n = G.cards.length;
    var step = Math.min(UI.cardW + UI.cardGap, (UI.shovel.x - 8 - UI.cardX0) / Math.max(1, n));
    var cw = Math.min(UI.cardW, step - UI.cardGap);
    for (var i2 = 0; i2 < n; i2++) {
      var card = G.cards[i2], def = PLANT_BY_ID[card.id];
      var x = UI.cardX0 + i2 * step, y = UI.cardY;
      var sel = G.sel === i2;
      var cd = card.cd, afford = G.sun >= def.cost;
      ctx.save();
      if (sel) { ctx.shadowColor = '#fff3a8'; ctx.shadowBlur = 18; }
      rrPath(ctx, x, y, cw, UI.cardH, 12);
      var cg = ctx.createLinearGradient(0, y, 0, y + UI.cardH);
      cg.addColorStop(0, '#fffbf6'); cg.addColorStop(1, '#ffe7f1');
      ctx.fillStyle = cg; ctx.fill();
      ctx.restore();
      rrPath(ctx, x, y, cw, UI.cardH, 12);
      ctx.strokeStyle = sel ? '#ffe08a' : '#e2699d';
      ctx.lineWidth = sel ? 3.6 : 2.2;
      ctx.stroke();
      // 立绘区
      ctx.save();
      rrPath(ctx, x + 3, y + 3, cw - 6, 54, 9); ctx.clip();
      var lg = ctx.createLinearGradient(0, y + 3, 0, y + 57);
      lg.addColorStop(0, '#eafbe4'); lg.addColorStop(1, '#c9efc0');
      ctx.fillStyle = lg; ctx.fillRect(x + 3, y + 3, cw - 6, 54);
      ctx.fillStyle = 'rgba(255,255,255,.5)';
      ctx.beginPath(); ctx.arc(x + cw - 10, y + 12, 12, 0, TAU); ctx.fill();
      ctx.save();
      ctx.translate(x + cw / 2, y + 57);
      ctx.scale(.56, .56);
      A.drawPlant(ctx, card.id, { t: G.time + i2 * .4, hp: 1, max: 1, armed: true, rise: 1, cherry: .3, chew: 0, hurt: 0, shoot: 0 });
      ctx.restore();
      ctx.restore();
      // 价格
      A.drawSun(ctx, x + cw / 2 - 17, y + 71, 6, G.time * .5, 1);
      text(String(def.cost), x + cw / 2 + 5, y + 71, 14, afford ? '#5d2f45' : '#c0304f');
      // 快捷键
      text(String(i2 + 1), x + 8, y + 10, 10, '#fff', '#b8507a', 'center', 3);
      if (cd > 0 || !afford) {
        ctx.save();
        rrPath(ctx, x + 2, y + 2, cw - 4, UI.cardH - 4, 9); ctx.clip();
        if (cd > 0) {
          var k = clamp(cd / def.cd, 0, 1);
          ctx.fillStyle = 'rgba(90,40,70,.42)';
          ctx.fillRect(x, y, cw, UI.cardH * k);
          text(cd.toFixed(cd > 1 ? 0 : 1), x + cw / 2, y + UI.cardH / 2, 17, '#fff', '#432033', 'center', 3);
        } else {
          ctx.fillStyle = 'rgba(90,40,70,.26)';
          ctx.fillRect(x, y, cw, UI.cardH);
        }
        ctx.restore();
      }
    }

    // 铲子
    var sv = UI.shovel;
    ctx.save();
    if (G.shovel) { ctx.shadowColor = '#fff3a8'; ctx.shadowBlur = 18; }
    rrPath(ctx, sv.x, sv.y, sv.w, sv.h, 12);
    var avg = ctx.createLinearGradient(0, sv.y, 0, sv.y + sv.h);
    avg.addColorStop(0, '#fff6f9'); avg.addColorStop(1, '#ffdcea');
    ctx.fillStyle = avg; ctx.fill();
    ctx.restore();
    rrPath(ctx, sv.x, sv.y, sv.w, sv.h, 12);
    ctx.strokeStyle = G.shovel ? '#ffe08a' : '#e2699d'; ctx.lineWidth = G.shovel ? 3.6 : 2.2; ctx.stroke();
    A.drawShovel(ctx, sv.x + sv.w / 2, sv.y + 44, 1, G.shovel ? Math.sin(G.time * 7) * .14 : 0);
    text('S', sv.x + 9, sv.y + 10, 10, '#fff', '#b8507a', 'center', 3);

    // 控制按钮
    drawBtn(UI.btnPause, '⏸', false);
    drawBtn(UI.btnSpeed, G.speed + '×', G.speed > 1);
    drawBtn(UI.btnHp, G.showHp ? '♥' : '♡', G.showHp);
    drawBtn(UI.btnAuto, '☀', G.auto);
    drawBtn(UI.btnMute, AU.isMuted() ? '🔇' : '🔊', false, true);

    drawWaveBar();

    if (G.sel >= 0) {
      var d2 = PLANT_BY_ID[G.cards[G.sel].id];
      var nm = T('p_' + d2.id + '_n');
      var dx = UI.cardX0 + G.sel * step + cw / 2;
      rrPath(ctx, dx - 74, 104, 148, 26, 13);
      ctx.fillStyle = 'rgba(93,47,69,.88)'; ctx.fill();
      text(nm, dx, 117, 14, '#ffe9f2');
    }

    // 连击
    if (G.combo >= 3) {
      var ck = clamp(G.comboT / 2.2, 0, 1);
      var pop = 1 + (1 - ck) * .25 * Math.sin(G.time * 12);
      ctx.save();
      ctx.globalAlpha = .55 + .45 * ck;
      ctx.translate(W / 2, GY + 22);
      ctx.scale(pop, pop);
      rrPath(ctx, -78, -16, 156, 32, 16);
      var cgb = ctx.createLinearGradient(-78, 0, 78, 0);
      cgb.addColorStop(0, 'rgba(255,159,196,.92)'); cgb.addColorStop(1, 'rgba(199,178,255,.92)');
      ctx.fillStyle = cgb; ctx.fill();
      text(TF('comboFmt', G.combo), 0, 1, 18, '#fff', '#8a3a63', 'center', 4);
      ctx.restore();
    }
  }

  function drawBtn(r, icon, active, small) {
    rrPath(ctx, r.x, r.y, r.w, r.h, 11);
    var g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
    if (active) { g.addColorStop(0, '#fff2b8'); g.addColorStop(1, '#ffcf6b'); }
    else { g.addColorStop(0, '#fffaf7'); g.addColorStop(1, '#ffd9e8'); }
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = active ? '#e0a328' : '#e2699d'; ctx.lineWidth = 2; ctx.stroke();
    if (active) {
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      ctx.beginPath(); ctx.arc(r.x + r.w - 9, r.y + 9, 3, 0, TAU); ctx.fill();
    }
    text(icon, r.x + r.w / 2, r.y + r.h / 2, small ? 16 : 17, '#5d2f45');
  }

  function drawWaveBar() {
    var b = UI.bar;
    var total = G.endless ? Math.max(10, G.wave + 1) : G.waveTotal;
    var p = G.endless ? (G.wave % 10) / 10 : clamp((G.wave - 1 + clamp(1 - G.countdown / G.waveGap, 0, 1)) / total, 0, 1);

    rrPath(ctx, b.x, b.y, b.w, b.h, 9);
    ctx.fillStyle = 'rgba(93,47,69,.85)'; ctx.fill();
    ctx.save();
    rrPath(ctx, b.x + 2, b.y + 2, b.w - 4, b.h - 4, 7); ctx.clip();
    var pg = ctx.createLinearGradient(b.x, 0, b.x + b.w, 0);
    pg.addColorStop(0, '#9be8cf'); pg.addColorStop(.5, '#ffe08a'); pg.addColorStop(1, '#ff9fc4');
    ctx.fillStyle = pg;
    ctx.fillRect(b.x + 2, b.y + 2, (b.w - 4) * p, b.h - 4);
    ctx.fillStyle = 'rgba(255,255,255,.38)';
    ctx.fillRect(b.x + 2, b.y + 2, (b.w - 4) * p, 5);
    // 流动亮点
    for (var i = 0; i < 5; i++) {
      var dotX = b.x + 4 + ((G.time * 40 + i * 21) % Math.max(1, (b.w - 8) * p));
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      ctx.beginPath(); ctx.arc(dotX, b.y + b.h / 2, 1.6, 0, TAU); ctx.fill();
    }
    ctx.restore();
    rrPath(ctx, b.x, b.y, b.w, b.h, 9);
    ctx.strokeStyle = '#5d2f45'; ctx.lineWidth = 2; ctx.stroke();
    if (!G.endless) {
      for (var i2 = 0; i2 < G.huge.length; i2++) {
        var hf = G.huge[i2];
        if (hf > total) continue;
        var fx = b.x + 4 + (b.w - 8) * (hf / total);
        line(ctx, fx, b.y + 2, fx, b.y - 9, 1.8, '#5d2f45');
        ctx.fillStyle = hf === total ? '#ff4a6e' : '#ff7a9c';
        ctx.beginPath(); ctx.moveTo(fx, b.y - 10); ctx.lineTo(fx + 9, b.y - 6.5); ctx.lineTo(fx, b.y - 3); ctx.closePath(); ctx.fill();
      }
    }
    var dying = aliveZ();
    text(G.endless ? TF('waveFmt', Math.max(1, G.wave)) : (G.wave >= total ? T('finalWave') : TF('waveFmt', Math.max(1, G.wave))),
      b.x + b.w / 2, b.y + b.h + 14, 13, '#fff4fa', '#5d2f45', 'center', 3);
    var sub = G.endless ? '♾' : (G.wave === 0 ? T('prep') : (dying > 0 ? T('incoming') + ' ' + dying : ''));
    if (sub) text(sub, b.x + b.w, b.y + b.h + 32, 10.5, '#ffe3ee', '#5d2f45', 'right', 3);
    if (G.wave < total) {
      var cd = Math.max(0, Math.ceil(G.countdown));
      text(cd + 's', b.x, b.y + b.h + 32, 10.5, '#ffe3ee', '#5d2f45', 'left', 3);
    }
  }

  /* ============================================================
   * 输入
   * ============================================================ */
  function toLogical(e) {
    var rc = canvas.getBoundingClientRect();
    return { x: (e.clientX - rc.left) * W / rc.width, y: (e.clientY - rc.top) * H / rc.height };
  }

  function cardAt(m) {
    var n = G.cards.length;
    var step = Math.min(UI.cardW + UI.cardGap, (UI.shovel.x - 8 - UI.cardX0) / Math.max(1, n));
    var cw = Math.min(UI.cardW, step - UI.cardGap);
    for (var i = 0; i < n; i++) {
      var x = UI.cardX0 + i * step;
      if (m.x >= x && m.x <= x + cw && m.y >= UI.cardY && m.y <= UI.cardY + UI.cardH) return i;
    }
    return -1;
  }

  function selectCard(i) {
    if (mode !== 'playing') return;
    var card = G.cards[i];
    if (!card) return;
    var def = PLANT_BY_ID[card.id];
    if (card.cd > 0) { AU.sfx('bad'); return; }
    if (G.sun < def.cost) { AU.sfx('bad'); G.tip = T('lowSun') + ' · ' + T('p_' + def.id + '_n'); G.tipT = 1.2; return; }
    G.sel = G.sel === i ? -1 : i;
    G.shovel = false;
    AU.sfx('select');
  }

  canvas.addEventListener('pointerdown', function (e) {
    AU.init();
    var m = toLogical(e);
    G && (G.mouse = { x: m.x, y: m.y, in: true });
    if (mode !== 'playing') return;
    if (e.button === 2) { G.sel = -1; G.shovel = false; return; }
    if (inRect(m, UI.btnPause)) { togglePause(); return; }
    if (inRect(m, UI.btnSpeed)) { G.speed = G.speed === 1 ? 2 : G.speed === 2 ? 3 : 1; AU.sfx('click'); return; }
    if (inRect(m, UI.btnHp)) { G.showHp = !G.showHp; save.opts.hp = G.showHp; writeSave(); AU.sfx('click'); return; }
    if (inRect(m, UI.btnAuto)) { G.auto = !G.auto; save.opts.auto = G.auto; writeSave(); AU.sfx('click'); G.tip = T('optAuto') + (G.auto ? ' ✓' : ' ✕'); G.tipT = 1.2; return; }
    if (inRect(m, UI.btnMute)) { toggleMute(); return; }

    for (var i = G.suns.length - 1; i >= 0; i--) {
      var s = G.suns[i];
      if (s.state !== 'fly' && Math.hypot(s.x - m.x, s.y - m.y) < 34) { collectSun(s); return; }
    }
    if (inRect(m, UI.shovel)) { G.shovel = !G.shovel; G.sel = -1; AU.sfx('select'); return; }
    var ci = cardAt(m);
    if (ci >= 0) { selectCard(ci); return; }
    var cell = cellOf(m.x, m.y);
    if (!cell) { if (m.y > 110) { G.sel = -1; G.shovel = false; } return; }
    if (G.shovel) {
      var cellObj = G.grid[cell.r][cell.c];
      if (cellObj && cellObj.id) {
        removePlant(cellObj);
        burst(cellCX(cell.c), rowFoot(cell.r) - 20, 12, ['#ffd1e3', '#ffffff', '#ffb3cf'], { min: 30, max: 120, shape: 'star' });
        AU.sfx('shovel');
      } else if (cellObj && cellObj.broken === false && !cellObj.id) {
        breakGrave(cellObj);
      } else AU.sfx('bad');
      return;
    }
    if (G.sel >= 0) plantAt(G.sel, cell.r, cell.c);
  });
  canvas.addEventListener('pointermove', function (e) {
    if (!G) return;
    var m = toLogical(e);
    G.mouse = { x: m.x, y: m.y, in: true };
    var hand = inRect(m, UI.shovel) || inRect(m, UI.btnPause) || inRect(m, UI.btnSpeed) || inRect(m, UI.btnHp) || inRect(m, UI.btnAuto) || inRect(m, UI.btnMute) || inRect(m, UI.sunCard);
    if (!hand) hand = cardAt(m) >= 0;
    if (!hand) hand = G.suns.some(function (s) { return s.state !== 'fly' && Math.hypot(s.x - m.x, s.y - m.y) < 34; });
    canvas.style.cursor = hand ? 'pointer' : 'default';
  });
  canvas.addEventListener('pointerleave', function () { if (G) G.mouse.in = false; });
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); if (G) { G.sel = -1; G.shovel = false; } });

  window.addEventListener('keydown', function (e) {
    var tag = (e.target && e.target.tagName) || '';
    if (/INPUT|SELECT|TEXTAREA/.test(tag)) return;
    var k = e.key.toLowerCase();
    if (mode === 'playing') {
      if (k >= '1' && k <= '9') { selectCard(+k - 1); e.preventDefault(); }
      else if (k === 's') { G.shovel = !G.shovel; G.sel = -1; AU.sfx('select'); }
      else if (k === 'escape') { G.sel = -1; G.shovel = false; }
      else if (k === 'p' || k === ' ') { e.preventDefault(); togglePause(); }
      else if (k === 'm') { toggleMute(); }
      else if (k === 'a') { G.auto = !G.auto; save.opts.auto = G.auto; writeSave(); AU.sfx('click'); }
    } else if (mode === 'paused') {
      if (k === 'p' || k === ' ' || k === 'escape') { e.preventDefault(); togglePause(); }
    } else if (mode === 'over' || mode === 'ending') {
      if (k === 'r') restart();
    }
  });

  function togglePause() {
    if (mode === 'playing') {
      mode = 'paused'; G.paused = true;
      showPause();
    } else if (mode === 'paused') {
      mode = 'playing';
      show(null);
      AU.init();
    }
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden && mode === 'playing' && G && G.state === 'play') togglePause();
  });

  function toggleMute() {
    AU.init();
    AU.setMuted(!AU.isMuted());
    AU.sfx('click');
  }

  /* ============================================================
   * 覆盖层
   * ============================================================ */
  var currentLevel = 0;
  var pendingDeck = null;

  function diffLabel(d) { return T(D.DIFF[d].label); }
  function isTouch() { return document.body.classList.contains('is-touch'); }

  function syncMenuHint() {
    var el = document.querySelector('.menu-hint');
    if (el) el.textContent = T(isTouch() ? 'menuHintTouch' : 'menuHint');
  }

  function renderDeckIdle() {
    var n = save.deck.length;
    var c = document.getElementById('deck-count');
    c.textContent = T('deckCount') + ' ' + n + ' / 9';
    c.classList.toggle('full', n >= 9);
    document.getElementById('deck-start').disabled = n === 0;
  }

  function renderReady() {
    var adv = document.getElementById('adv-list');
    adv.innerHTML = '';
    D.LEVELS.forEach(function (lv, i) {
      var locked = (i + 1) > save.unlocked;
      var stars = save.stars[String(lv.id)] || 0;
      var btn = document.createElement('button');
      btn.className = 'lv' + (locked ? ' locked' : '') + (lv.candy ? ' candy' : '');
      btn.type = 'button';
      btn.setAttribute('data-lv', String(i));
      btn.innerHTML =
        '<span class="lv-no">' + (i + 1) + '</span>' +
        '<span class="lv-main"><b>' + T(lv.key + 'Name') + '</b><small>' + T(lv.key + 'Desc') + '</small></span>' +
        '<span class="lv-side">' +
        (locked ? '<em class="lock">🔒</em>' : '<em class="stars">' + starStr(stars) + '</em>') +
        '<span class="waves">' + TF('waveFmt', lv.waves) + '</span></span>';
      // 窄屏（手机竖屏）只显示标题与波次，描述改由 title 提供
      if (window.matchMedia && window.matchMedia('(max-width: 560px)').matches) {
        var sm = btn.querySelector('.lv-main small');
        if (sm) sm.remove();
        var bw = btn.querySelector('.lv-main b');
        if (bw) bw.title = T(lv.key + 'Desc');
      }
      btn.title = locked ? T('levelLockedHint') : T(lv.key + 'Desc');
      btn.onclick = function () {
        if (locked) { AU.sfx('bad'); return; }
        AU.init(); AU.sfx('click');
        currentLevel = i;
        openDeck(false);
      };
      adv.appendChild(btn);
    });
    document.getElementById('endless-best').textContent =
      '🌊 ' + T('bestWave') + ' ' + (save.best.wave || 0) + ' · ⭐ ' + (save.best.score || 0);
    document.getElementById('endless').onclick = function () {
      AU.init(); AU.sfx('click');
      openDeck(true);
    };
    var seg = document.getElementById('diff-seg');
    seg.querySelectorAll('button').forEach(function (b) {
      b.classList.toggle('on', b.dataset.d === save.diff);
      b.onclick = function () {
        save.diff = b.dataset.d; writeSave(); AU.sfx('click');
        seg.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); });
        document.getElementById('diff-desc').textContent = T(D.DIFF[save.diff].label + 'Desc');
      };
    });
    document.getElementById('diff-desc').textContent = T(D.DIFF[save.diff].label + 'Desc');
    syncMenuHint();
    document.getElementById('deck-open').onclick = function () { AU.init(); AU.sfx('click'); openDeck(false, true); };
  }

  function starStr(n) {
    if (!n) return '☆☆☆';
    return '★'.repeat(n) + '☆'.repeat(3 - n);
  }

  function openDeck(endless, fromMenu) {
    if (fromMenu) { currentLevel = 0; }
    pendingDeck = save.deck.slice();
    renderDeck(endless, fromMenu);
    show(ovDeck);
    mode = 'menu';
  }

  var deckEndless = false, deckFromMenu = false;

  function renderDeck(endless, fromMenu) {
    deckEndless = endless; deckFromMenu = fromMenu;
    document.getElementById('deck-title').textContent = T('deckTitle');
    document.getElementById('deck-hint').textContent = T('deckHint');
    var grid = document.getElementById('deck-grid');
    grid.innerHTML = '';
    D.PLANTS.forEach(function (def) {
      var on = pendingDeck.indexOf(def.id) >= 0;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'pcard' + (on ? ' on' : '') + (def.noe ? ' new' : '');
      var thumb = document.createElement('canvas');
      thumb.width = 128; thumb.height = 128;
      var tc = thumb.getContext('2d');
      tc.scale(128 / 150, 128 / 150);
      A.drawPlantPreview(tc, def.id, 75, 138, 1, 0);
      b.appendChild(thumb);
      var nm = document.createElement('b'); nm.textContent = T('p_' + def.id + '_n'); b.appendChild(nm);
      var cost = document.createElement('span'); cost.className = 'cost'; cost.textContent = '☀ ' + def.cost; b.appendChild(cost);
      var desc = document.createElement('small'); desc.textContent = T('p_' + def.id + '_d'); b.appendChild(desc);
      var idx = pendingDeck.indexOf(def.id);
      if (idx >= 0) { var num = document.createElement('i'); num.className = 'num'; num.textContent = idx + 1; b.appendChild(num); }
      b.onclick = function () {
        var i = pendingDeck.indexOf(def.id);
        if (i >= 0) { pendingDeck.splice(i, 1); AU.sfx('shovel'); }
        else {
          if (pendingDeck.length >= 9) { AU.sfx('bad'); deckWarn(T('deckFull')); return; }
          pendingDeck.push(def.id); AU.sfx('select');
        }
        syncDeckUI();
        renderDeck(endless, fromMenu);
      };
      grid.appendChild(b);
    });
    syncDeckUI();
    document.getElementById('deck-rec').onclick = function () {
      pendingDeck = D.RECOMMENDED.slice(); AU.sfx('select'); renderDeck(endless, fromMenu);
    };
    document.getElementById('deck-back').onclick = function () {
      AU.sfx('click');
      show(ovReady);
      mode = 'menu';
      renderReady();
    };
    document.getElementById('deck-start').onclick = function () {
      if (!pendingDeck.length) { AU.sfx('bad'); deckWarn(T('chooseCard')); return; }
      save.deck = pendingDeck.slice(); writeSave();
      AU.sfx('click');
      startGame(endless ? null : D.LEVELS[currentLevel], currentLevel, endless);
    };
  }

  function syncDeckUI() {
    var c = document.getElementById('deck-count');
    c.textContent = T('deckCount') + ' ' + pendingDeck.length + ' / 9';
    c.classList.toggle('full', pendingDeck.length >= 9);
    document.getElementById('deck-start').disabled = pendingDeck.length === 0;
    var note = document.getElementById('deck-note');
    note.textContent = deckEndless ? T('endlessDesc') : T('lv' + (currentLevel + 1) + 'Desc');
  }

  var deckWarnT = 0;
  function deckWarn(msg) {
    var el = document.getElementById('deck-note');
    el.textContent = msg;
    el.classList.add('warn');
    clearTimeout(deckWarnT);
    deckWarnT = setTimeout(function () { el.classList.remove('warn'); syncDeckUI(); }, 1600);
  }

  function startGame(lv, idx, endless) {
    if (endless) {
      lv = { id: 0, key: 'endless', scene: 'day', skySun: [9, 13], waves: Infinity, huge: [], graves: 0 };
    }
    newGame({
      level: lv, levelIndex: idx, endless: !!endless,
      diff: save.diff, deck: pendingDeck && pendingDeck.length ? pendingDeck : save.deck
    });
    hideAll();
    mode = 'playing';
    AU.init();
    ensureBoardVisible();
  }

  function ensureBoardVisible() {
    var frame = canvas.parentNode;
    if (!frame || !frame.getBoundingClientRect) return;
    var r = frame.getBoundingClientRect();
    var vh = window.innerHeight || document.documentElement.clientHeight;
    var off = r.top < 0 || (r.height <= vh && r.bottom > vh);
    if (!off) return;
    var y = Math.max(0, (window.pageYOffset || document.documentElement.scrollTop || 0) + r.top - 12);
    try { window.scrollTo({ top: y, behavior: 'smooth' }); } catch (e) { window.scrollTo(0, y); }
  }

  function restart() {
    if (!G) return;
    startGame(G.endless ? null : G.level, G.levelIndex, G.endless);
  }

  function showPause() {
    document.getElementById('pause-title').textContent = T('paused');
    document.getElementById('pause-sub').textContent = T('pausedSub');
    document.getElementById('pause-resume').textContent = T('resume');
    document.getElementById('pause-restart').textContent = T('restart');
    document.getElementById('pause-menu').textContent = T('menuBtn');
    document.getElementById('opt-auto').checked = G ? G.auto : save.opts.auto;
    document.getElementById('opt-hp').checked = G ? G.showHp : save.opts.hp;
    var vol = document.getElementById('opt-vol');
    vol.value = Math.round((window.AMG_AUDIO ? AMG_AUDIO.vol : .8) * 100);
    document.getElementById('opt-vol-val').textContent = vol.value;
    show(ovPause);
  }

  function showEnd() {
    var res = G.result;
    mode = 'over';
    document.getElementById('end-title').textContent = res.win ? T('winTitle') : T('loseTitle');
    document.getElementById('end-sub').textContent = res.win ? T('winSub') : T('loseSub');
    var starsEl = document.getElementById('end-stars');
    if (G.endless) {
      starsEl.innerHTML = '<span class="big">🌊</span>';
    } else {
      starsEl.innerHTML = res.win
        ? '<i class="on">★</i>'.repeat(res.stars) + '<i>★</i>'.repeat(3 - res.stars)
        : '<i>★</i><i>★</i><i>★</i>';
    }
    var rows = [];
    if (G.endless) {
      rows.push([T('statWave'), res.wave], [T('statScore'), res.score], [T('statKills'), res.kills]);
      if (res.wave >= save.best.wave && res.wave > 0) {
        var nr = document.getElementById('end-record');
        nr.classList.remove('hidden');
      }
    } else {
      rows.push([T('statKills'), res.kills], [T('statPlanted'), res.planted], [T('statSun'), res.sun]);
      rows.push([T('statMowers'), res.mowers + ' / 5'], [T('statTime'), fmtTime(res.time)]);
      if (res.win) rows.push([T('statScore'), (res.kills * 20 + res.mowers * 200 + Math.round(res.time) * -1 + 1000)]);
    }
    var ul = document.getElementById('end-stats');
    ul.innerHTML = rows.map(function (r) { return '<li><span>' + r[0] + '</span><b>' + r[1] + '</b></li>'; }).join('');
    var nextBtn = document.getElementById('end-next');
    if (!G.endless && res.win && G.levelIndex + 1 < D.LEVELS.length) {
      nextBtn.classList.remove('hidden');
      nextBtn.textContent = T('nextLevel');
    } else nextBtn.classList.add('hidden');
    document.getElementById('end-replay').textContent = T('replay');
    document.getElementById('end-menu').textContent = T('backMenu');
    document.getElementById('end-record').classList.toggle('hidden', !(G.endless && res.wave > 0 && res.wave >= save.best.wave));
    show(ovEnd);
    AU.sfx('click');
  }

  function fmtTime(s) {
    var m = Math.floor(s / 60), ss = Math.floor(s % 60);
    return m + ':' + (ss < 10 ? '0' : '') + ss;
  }

  function bindUI() {
    document.getElementById('end-next').onclick = function () {
      AU.sfx('click');
      currentLevel = Math.min(D.LEVELS.length - 1, G.levelIndex + 1);
      openDeck(false);
    };
    document.getElementById('end-replay').onclick = function () { AU.sfx('click'); restart(); };
    document.getElementById('end-menu').onclick = function () { AU.sfx('click'); backToMenu(); };
    document.getElementById('pause-resume').onclick = function () { AU.sfx('click'); togglePause(); };
    document.getElementById('pause-restart').onclick = function () { AU.sfx('click'); restart(); };
    document.getElementById('pause-menu').onclick = function () { AU.sfx('click'); backToMenu(); };
    document.getElementById('opt-auto').onchange = function (e) { save.opts.auto = e.target.checked; if (G) G.auto = e.target.checked; writeSave(); };
    document.getElementById('opt-hp').onchange = function (e) { save.opts.hp = e.target.checked; if (G) G.showHp = e.target.checked; writeSave(); };
    var vol = document.getElementById('opt-vol');
    vol.oninput = function () {
      AU.init();
      AU.setVolume(vol.value / 100);
      AU.setMuted(false);
      document.getElementById('opt-vol-val').textContent = vol.value;
    };
    var mute = document.getElementById('btn-mute');
    mute.onclick = function () { toggleMute(); syncMuteBtn(); };
    syncMuteBtn();
    document.getElementById('side-deck').onclick = function () { AU.init(); AU.sfx('click'); openDeck(false, true); };
  }

  function syncMuteBtn() {
    var mute = document.getElementById('btn-mute');
    if (mute) mute.textContent = AU.isMuted() || (window.AMG_AUDIO && AMG_AUDIO.vol === 0) ? '🔇' : '🔊';
  }

  function backToMenu() {
    mode = 'menu';
    G = null;
    partyClear();
    AU.music('moe-garden');
    show(ovReady);
    renderReady();
    refreshSide();
  }

  function partyClear() {
    particle.length = 0;
    floaters.length = 0;
  }

  /* ============================================================
   * 侧栏
   * ============================================================ */
  function refreshSide() {
    var hold = document.getElementById('deck-mini');
    hold.innerHTML = '';
    var deck = (G && G.cards ? G.cards.map(function (c) { return c.id; }) : save.deck);
    deck.forEach(function (id) {
      var d = PLANT_BY_ID[id];
      if (!d) return;
      var wrap = document.createElement('div');
      wrap.className = 'mini';
      wrap.title = T('p_' + id + '_n');
      var cvs = document.createElement('canvas');
      cvs.width = 72; cvs.height = 72;
      var c2 = cvs.getContext('2d');
      c2.scale(72 / 120, 72 / 120);
      A.drawPlantPreview(c2, id, 60, 104, .95, 0);
      wrap.appendChild(cvs);
      var lbl = document.createElement('span'); lbl.textContent = T('p_' + id + '_n'); wrap.appendChild(lbl);
      hold.appendChild(wrap);
    });
    if (!deck.length) {
      hold.innerHTML = '<p class="empty">' + T('sideDeckEmpty') + '</p>';
    }
    var zhold = document.getElementById('z-mini');
    if (!zhold.childElementCount) {
      D.ZOMBIE_IDS.forEach(function (z) {
        var wrap = document.createElement('div');
        wrap.className = 'mini z';
        wrap.title = T('z_' + z + '_n') + ' — ' + T('z_' + z + '_d');
        var cvs = document.createElement('canvas');
        cvs.width = 64; cvs.height = 72;
        var c3 = cvs.getContext('2d');
        c3.scale(64 / 130, 72 / 130);
        A.drawSmallZombie(c3, z, 65, 132, 1, 0);
        wrap.appendChild(cvs);
        var lbl2 = document.createElement('span'); lbl2.textContent = T('z_' + z + '_n'); wrap.appendChild(lbl2);
        zhold.appendChild(wrap);
      });
    } else {
      zhold.querySelectorAll('.mini').forEach(function (el, i) {
        var zid = D.ZOMBIE_IDS[i];
        el.title = T('z_' + zid + '_n') + ' — ' + T('z_' + zid + '_d');
        el.querySelector('span').textContent = T('z_' + zid + '_n');
      });
    }
  }

  /* ============================================================
   * 主循环
   * ============================================================ */
  function musicTick() {
    if (!G || G.state !== 'play') {
      if (mode === 'menu' && AU.ctx) AU.music('moe-garden');
      return;
    }
    var n = aliveZ();
    if (!G.bgmTense && ((G.huge.indexOf(G.wave) >= 0 && n > 0) || n >= 12)) G.bgmTense = true;
    else if (G.bgmTense && n <= 4) G.bgmTense = false;
    var want;
    if (G.bgmTense) want = 'moe-candy';
    else if (G.scene === 'candy') want = 'moe-candy';
    else if (G.scene === 'night' || G.scene === 'eclipse') want = 'moe-night';
    else want = 'moe-garden';
    AU.music(want);
  }

  var musicClock = 0;
  function frame(ts) {
    requestAnimationFrame(frame);
    var raw = (ts - lastNow) / 1000 || 0;
    var dt = Math.min(.1, raw);
    lastNow = ts;
    if (mode === 'playing' && RENDER_DPR > 1 && raw > 0 && raw < .2) {
      slowAvg = slowAvg ? slowAvg * .94 + raw * .06 : raw;
      if (++slowCount > 90) {
        slowCount = 0;
        if (slowAvg > .021) { RENDER_DPR = 1; resize(); slowAvg = 0; }
      }
    }
    uiT += dt; menuT += dt;
    if (mode === 'playing' && G) {
      if (hitStop > 0) {
        hitStop = Math.max(0, hitStop - dt);
        if (flashWhite > 0) flashWhite = Math.max(0, flashWhite - dt * 3.4);
        if (shake > 0) shake = Math.max(0, shake - 40 * dt);
      } else {
        acc += dt * G.speed;
        var n = 0;
        while (acc >= STEP && n < 10) {
          step(STEP);
          acc -= STEP;
          n++;
          if (G.state !== 'play') break;
        }
        if (n >= 10) acc = 0;
      }
    } else if (G) {
      updateParticles(dt * .6);
      if (flashWhite > 0) flashWhite = Math.max(0, flashWhite - dt * 3.4);
    } else {
      if (flashWhite > 0) flashWhite = 0;
    }
    musicClock += dt;
    if (musicClock > .4) { musicClock = 0; musicTick(); }
    render();
  }

  /* ============================================================
   * 语言刷新
   * ============================================================ */
  window.__refreshLang = function () {
    if (window.AMG) AMG.apply(window.PVZ_STR);
    renderReady();
    if (pendingDeck) renderDeck(deckEndless, deckFromMenu);
    else renderDeckIdle();
    refreshSide();
    syncMuteBtn();
    if (mode === 'paused') showPause();
    if (mode === 'over' && G && G.result) showEnd();
  };

  /* ============================================================
   * 启动
   * ============================================================ */
  resize();
  bindUI();
  renderReady();
  refreshSide();
  if (window.AMG) AMG.mountBtn();
  window.__refreshLang();
  show(ovReady);
  AU.music('');
  AU.setScene('day');
  requestAnimationFrame(frame);

  /* 调试 / 自动化测试 API */
  window.PVZ = {
    get state() { return G; },
    get mode() { return mode; },
    start: function (opts) {
      var o = opts || {};
      var lv = typeof o.level === 'number' ? D.LEVELS[o.level] : D.LEVELS[0];
      startGame(lv, o.level || 0, !!o.endless);
      if (o.sun != null) G.sun = o.sun;
      return G;
    },
    plant: function (id, r, c) {
      var idx = G.cards.map(function (c2) { return c2.id; }).indexOf(id);
      if (idx < 0) {
        G.cards.push({ id: id, cd: 0 });
        idx = G.cards.length - 1;
      }
      G.cards[idx].cd = 0;
      return plantAt(idx, r, c, true);
    },
    giveSun: function (n) { if (G) G.sun += n; },
    spawn: function (type, row, x) { return spawnZombie(type || 'normal', row == null ? 2 : row, x == null ? 980 : x); },
    skip: function (seconds) { var t = Math.round((seconds || 1) / STEP); for (var i = 0; i < t && G && G.state === 'play'; i++) step(STEP); return G; },
    wave: function () { if (G) launchWave(); },
    clearZombies: function () { if (G) G.zombies.forEach(function (z) { z.dead = true; z.dieT = 10; }); },
    youWin: function () { if (!G) return; G.wave = G.waveTotal; G.queue.length = 0; G.zombies.forEach(function (z) { z.dead = true; z.dieT = 10; }); },
    togglePause: togglePause,
    menu: backToMenu,
    save: save,
    setDeck: function (ids) { save.deck = ids.slice(0, 9); writeSave(); refreshSide(); },
    bench: function (n) {
      n = n || 60;
      var t0 = performance.now();
      for (var i = 0; i < n; i++) render();
      return +((performance.now() - t0) / n).toFixed(2);
    }
  };
})();
