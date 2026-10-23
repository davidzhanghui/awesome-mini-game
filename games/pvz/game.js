/* 植物大战僵尸 · 草坪守卫 — 游戏主逻辑
 * 固定步长 120Hz 模拟，逐帧渲染。依赖：strings.js / data.js / art.js / audio.js。
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

  /* ============================================================
   * 存档
   * ============================================================ */
  var SAVE_KEY = 'pvz:save:v2';
  var save = { unlocked: 1, stars: {}, best: { wave: 0, score: 0 }, deck: null, diff: 'normal', opts: { auto: false, hp: true, vol: 0.8 } };
  function loadSave() {
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        var o = JSON.parse(raw);
        if (o && typeof o === 'object') {
          save.unlocked = clamp(o.unlocked | 0, 1, 5) || 1;
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
      // 窄屏下覆盖层是全屏滚动容器，切换界面时回到顶部
      if (el.scrollTop) el.scrollTop = 0;
    }
  }
  function hideAll() { ovAll.forEach(function (o) { o.classList.add('hidden'); }); }

  /* ============================================================
   * 游戏状态
   * ============================================================ */
  var G = null;
  var mode = 'menu';            // menu | playing | paused | ending
  var lastNow = 0, acc = 0;
  var uiT = 0;
  var bgCache = {};
  var particle = [];
  var floaters = [];
  var shake = 0;
  var flashRed = 0;
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
      gravesBroken: 0
    };
    for (var r = 0; r < ROWS; r++) {
      G.grid.push(new Array(COLS).fill(null));
      G.mowers.push({ row: r, x: GX - 52, state: 'idle', t: 0 });
    }
    // 墓碑（黑夜关卡）
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
    particle.length = 0; floaters.length = 0; shake = 0; flashRed = 0;
    AU.setScene(scene);
    mode = 'playing';
    G.banner = { key: 'prep', txt: T('tipSun'), t: 4, color: '#fff3c8', size: 26 };
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
    G.suns.push(s);
  }
  function collectSun(s) {
    s.state = 'fly'; s.ft = 0; s.fx0 = s.x; s.fy0 = s.y;
    AU.sfx('sun');
  }

  /* ============================================================
   * 粒子 / 飘字
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
        shape: o.shape || 'dot', rot: rnd(0, 6), vr: rnd(-9, 9)
      });
    }
  }
  function floater(x, y, txt, color, size) {
    floaters.push({ x: x, y: y, txt: txt, color: color, size: size || 20, t: 0, life: 1.05 });
  }
  function addShake(v) { shake = Math.max(shake, v); }

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
      slowTick: 0
    };
    if (opts && opts.flag) z.flag = true;
    G.zombies.push(z);
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
        burst(z.x - 8 * z.scale, z.y - 80 * z.scale, 14, col, { s0: 3, s1: 7, min: 60, max: 190, shape: 'rect' });
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
    if (z.charred) burst(z.x, z.y - 40 * z.scale, 14, ['#2a2420', '#4a4440', '#ff9a2a'], { g: -70, min: 20, max: 110, s0: 2, s1: 6, life: 1.3 });
    else burst(z.x, z.y - 28 * z.scale, 9, ['#8fae7e', '#6b5a45', '#b7c9a5'], { min: 30, max: 100 });
    if (z.giant) addShake(6);
  }

  function explode(x, y, r, dmg, big) {
    G.fx.push({ k: 'boom', x: x, y: y, r: r, t: 0, life: big ? .75 : .55 });
    burst(x, y, big ? 40 : 24, ['#ff9a2a', '#ffd23a', '#e0402a', '#3a3a3a'], { min: 70, max: big ? 300 : 210, g: 160, s0: 3, s1: 8, life: 1.25 });
    burst(x, y, big ? 26 : 12, ['#2a2a2a', '#555'], { min: 20, max: 150, g: -90, s0: 3, s1: 9, life: 1.6, up: 90 });
    addShake(big ? 13 : 7);
    AU.sfx('boom');
    G.zombies.forEach(function (z) {
      if (z.dead) return;
      var zy = z.y - 30;
      if (Math.hypot(z.x - x, zy - y) <= r + 16 * z.scale) hurtZ(z, dmg, 'boom', true);
    });
    // 炸碎墓碑
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
      fire: 0, plantedT: 0
    };
    if (card.id === 'sunflower') p.timer = rnd(5, 7.5);
    else if (card.id === 'potato') { p.timer = 10; p.armed = false; }
    else if (card.id === 'chomper') p.timer = 0;
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
    burst(cellCX(c), rowFoot(r), 9, ['#8a6234', '#6b4a24', '#4fb83a'], { min: 20, max: 90, up: 70, s0: 2, s1: 4 });
    return p;
  }

  function removePlant(p) {
    if (!p) return;
    if (G.grid[p.r][p.c] === p) G.grid[p.r][p.c] = null;
    var i = G.plants.indexOf(p);
    if (i >= 0) G.plants.splice(i, 1);
  }

  function hurtPlant(p, dmg) {
    p.hp -= dmg;
    p.hurt = 0.14;
    if (p.hp <= 0) {
      removePlant(p);
      burst(cellCX(p.c), rowFoot(p.r) - 20, 11, ['#5fcf3a', '#3f9b2f', '#ffffff', '#8a6234'], { min: 40, max: 140 });
      AU.sfx('hit');
    }
  }

  function breakGrave(g, silent) {
    if (g.broken) return;
    g.broken = true;
    if (G.grid[g.r][g.c] === g) G.grid[g.r][g.c] = null;
    G.gravesBroken++;
    burst(cellCX(g.c), rowFoot(g.r) - 20, 16, ['#9a9184', '#6d6558', '#4c463c'], { min: 40, max: 160, s0: 2, s1: 6 });
    if (!silent) AU.sfx('grave');
    floater(cellCX(g.c), rowFoot(g.r) - 60, '✕', '#e8e0c8', 22);
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
    // 大波次别在十几秒内倒完（39 只挤成一团基本无解），按每 0.7s 一只铺开
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
      G.banner = { txt: T(last ? 'hugeLast' : 'huge'), sub: '', t: 3.4, color: '#ff5a4a', size: 38, huge: true };
      AU.sfx('alarm');
      addShake(5);
      flashRed = 1;
    } else {
      G.banner = { txt: TF('waveFmt', G.wave), sub: '', t: 1.8, color: '#fff3c8', size: 32 };
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
    if (G.tipT > 0) G.tipT -= dt;
    G.cards.forEach(function (c) { if (c.cd > 0) c.cd = Math.max(0, c.cd - dt); });
    if (G.banner && (G.banner.t -= dt) <= 0) G.banner = null;

    // 天降阳光
    if ((G.skyT -= dt) <= 0) {
      skySun();
      G.skyT = rnd(G.skyRange[0], G.skyRange[1]);
    }

    // 波次推进
    G.countdown -= dt;
    if (G.queue.length === 0 && aliveZ() === 0 && G.wave > 0 && G.countdown > 5) G.countdown = 5;
    if (!G.endless && G.wave < G.waveTotal) {
      var nxt = G.wave + 1;
      if (G.huge.indexOf(nxt) >= 0 && !G.hugeWarned[nxt] && G.countdown <= 3.6) {
        G.hugeWarned[nxt] = true;
        G.banner = { txt: T(nxt === G.waveTotal ? 'hugeLast' : 'huge'), sub: '', t: 3.2, color: '#ff5a4a', size: 38, huge: true };
        AU.sfx('alarm');
        flashRed = .9;
      }
    }
    if (G.countdown <= 0 && (G.endless || G.wave < G.waveTotal)) launchWave();

    // 队列出怪
    while (G.queue.length && G.queue[0].at <= G.time) {
      var q = G.queue.shift();
      var row = Math.floor(rnd(0, ROWS));
      spawnZombie(q.type, row, null, { flag: q.flag });
      if (Math.random() < .5) AU.sfx('groan');
    }

    updatePlants(dt);
    updateZombies(dt);
    updatePeas(dt);
    updateSuns(dt);
    updateMowers(dt);
    updateGraves(dt);
    updateParticles(dt);

    // 胜负
    if (G.state === 'play' && !G.endless && G.wave >= G.waveTotal && G.queue.length === 0 && aliveZ() === 0) {
      G.endT += dt;
      if (G.endT > 1.4) endGame(true);
    }
  }

  function updatePlants(dt) {
    for (var i = G.plants.length - 1; i >= 0; i--) {
      var p = G.plants[i];
      p.t += dt;
      p.plantedT += dt;
      if (p.hurt > 0) p.hurt -= dt;
      if (p.shoot > 0) p.shoot -= dt;
      var cx = cellCX(p.c), foot = rowFoot(p.r);

      if (p.id === 'sunflower') {
        p.timer -= dt;
        p.glow = p.timer < 1.6 ? 1 - p.timer / 1.6 : 0;
        if (p.timer <= 0) {
          plantSun(p);
          p.timer = 14;
          AU.sfx('pop');
        }
      } else if (p.id === 'peashooter' || p.id === 'snowpea' || p.id === 'repeater' || p.id === 'threepeater') {
        p.timer -= dt;
        if (p.timer <= 0) {
          var rows = p.id === 'threepeater' ? [p.r - 1, p.r, p.r + 1] : [p.r];
          var fired = false;
          rows.forEach(function (r) {
            if (r < 0 || r >= ROWS) return;
            var has = G.zombies.some(function (z) { return !z.dead && z.row === r && z.x > cx - 14 && z.x < W + 10; });
            if (!has && r === p.r) return;
            if (!has) return;
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
      } else if (p.id === 'potato') {
        if (!p.armed) {
          p.timer -= dt;
          if (p.timer <= 0) {
            p.armed = true;
            AU.sfx('pop');
            burst(cx, foot, 10, ['#8a6234', '#6b4a24'], { min: 30, max: 100, up: 90 });
          }
        } else {
          p.rise = Math.min(1, p.rise + dt * 3);
          if (p.rise >= 1) {
            var hit = G.zombies.some(function (z) { return !z.dead && z.row === p.r && z.x > cx - 44 && z.x < cx + 46; });
            if (hit) {
              explode(cx, foot - 18, 88, 1800, false);
              floater(cx, foot - 70, T('spudow'), '#ffd23a', 30);
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
          floater(cx, ccy - 64, T('boom'), '#ff5a2a', 34);
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
              floater(cx + 20, foot - 80, T('munch'), '#ffd23a', 24);
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
                // 巨人踩毁地刺
                z.smashCD = 1.5;
                removePlant(p);
                burst(cx, foot - 10, 10, ['#eef3f6', '#98a4ac'], { min: 30, max: 120 });
                return;
              }
              hurtZ(z, 20, 'spike');
            }
          });
        }
      } else if (p.id === 'torch') {
        // 火焰闪烁仅作视觉
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
      if (z.dead) {
        z.dieT += dt;
        if (z.dieT > (z.charred ? .9 : 1.7)) G.zombies.splice(i, 1);
        continue;
      }
      if (z.jumping) {
        z.jt += dt * (z.slow > 0 ? .5 : 1);
        var k = clamp(z.jt / .95, 0, 1);
        z.x = lerp(z.jx0, z.jx1, k);
        z.jy = Math.sin(k * Math.PI) * 82;
        z.ph += dt * 7;
        if (k >= 1) {
          z.jumping = false; z.jy = 0; z.state = 'walk'; z.hasPole = false;
          burst(z.x, z.y, 7, ['#8a6234', '#4fb83a'], { min: 20, max: 80, up: 50 });
        }
        continue;
      }
      // 巨人抛小鬼
      if (z.throwImp && !z.thrown && z.hp <= z.maxhp * .5) {
        z.thrown = true; z.throwT = 0;
        var targetX = clamp(z.x - rnd(280, 420), GX + CW * 3, GX + CW * 6);
        var imp = spawnZombie('imp', z.row, targetX + 40);
        imp.y = rowFoot(z.row);
        imp.jy = 0;
        imp.ph = 0;
        AU.sfx('throw');
        floater(z.x, z.y - 120, '!', '#ffb03a', 30);
      }
      if (z.throwT >= 0) { z.throwT += dt; if (z.throwT > 2) z.throwT = -1; }

      var mult = z.slow > 0 ? .5 : 1;
      if (z.rage) mult *= 1; // 速度已在暴怒时改写
      var bite = z.x - 26 * z.scale;
      var col = Math.floor((bite - GX) / CW);
      var target = (col >= 0 && col < COLS) ? G.grid[z.row][col] : null;
      if (target && (target.broken || target.hp === 0)) target = null;

      z.eat = false;

      // 撑杆跳：遇到第一株可跳植物
      if (z.state === 'run' && z.hasPole) {
        var jc = col;
        var jp = jc >= 0 && jc < COLS ? G.grid[z.row][jc] : null;
        if (jp && jp.id && jp.id !== 'spike' && jp.id !== 'tallnut' && bite < cellCX(jc) + 40) {
          z.jumping = true; z.jt = 0; z.jx0 = z.x; z.jx1 = Math.min(cellCX(jc) - 40, z.x - 74);
          AU.sfx('vault');
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
              burst(cellCX(col), z.y, 20, ['#8a6234', '#5e4529', '#ffffff', '#4fb83a'], { min: 60, max: 230, up: 140, s0: 3, s1: 9 });
              addShake(9);
              AU.sfx('smash');
              floater(cellCX(col), z.y - 70, T('smash'), '#ff8a3a', 24);
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

      // 墓碑阻挡：墓碑不挡路，但僵尸出生时可能在其后方
      // 越线 / 小推车
      if (z.x < GX - 10) {
        var mw = G.mowers[z.row];
        if (mw.state === 'idle') {
          mw.state = 'run'; mw.t = 0;
          G.stats.mowersUsed++;
          AU.sfx('mower');
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
      // 火炬转化
      if (!b.fire && !b.ice) {
        for (var t = 0; t < G.plants.length; t++) {
          var p = G.plants[t];
          if (p.id === 'torch' && p.r === b.row && Math.abs(b.x - cellCX(p.c)) < 22) {
            b.fire = true;
            b.dmg = 40;
            AU.sfx('torch');
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
      var hit = null;
      for (var j = 0; j < G.zombies.length; j++) {
        var z = G.zombies[j];
        if (z.dead || z.row !== b.row) continue;
        if (b.x >= z.x - 24 * z.scale && b.x <= z.x + 16 * z.scale) {
          if (!hit || z.x < hit.x) hit = z;
        }
      }
      if (hit) {
        hurtZ(hit, b.dmg, b.fire ? 'fire' : b.ice ? 'ice' : 'pea');
        if (b.fire) {
          // 火豆小范围溅射
          G.zombies.forEach(function (o) {
            if (o === hit || o.dead || o.row !== b.row) return;
            if (Math.abs(o.x - hit.x) < 46) hurtZ(o, 14, 'fire', true);
          });
          burst(b.x, b.y, 8, ['#ffd23a', '#ff7a1a', '#fff2c0'], { min: 40, max: 140, g: 100 });
        }
        G.peas.splice(i, 1);
      } else if (b.x > W + 24) {
        G.peas.splice(i, 1);
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
          burst(z.x, z.y - 20, 8, ['#8fae7e', '#6b5a45', '#ffd23a'], { min: 60, max: 200 });
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
      // 末波开始后墓碑不再冒僵尸，否则清场永远等不到“全部清除”
      var finalWaveOn = !G.endless && G.wave >= G.waveTotal;
      if (g.timer <= 0 && mode === 'playing' && !finalWaveOn) {
        g.timer = rnd(16, 24);
        if (G.zombies.length < 42) {
          var z = spawnZombie(Math.random() < .5 ? 'normal' : 'cone', g.r, cellCX(g.c) + 10);
          z.jy = 0;
          AU.sfx('grave');
          burst(cellCX(g.c), rowFoot(g.r), 12, ['#3a2a22', '#6d6558'], { min: 20, max: 90, up: 80 });
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
      if (G.level.id >= save.unlocked) save.unlocked = Math.min(5, G.level.id + 1);
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
      mowers: mowersLeft, wave: G.wave, time: G.time,
      huge: G.wave >= G.waveTotal
    };
    AU.music('');
    AU.sfx(win ? 'win' : 'lose');
    if (win) {
      for (var i = 0; i < 5; i++) {
        burst(rnd(GX, GX + COLS * CW), rnd(GY, GY + ROWS * CH), 18, ['#ffd23a', '#ff8a3a', '#7bd34a', '#8fdcff'], { min: 60, max: 260, up: 120, g: 220, life: 1.6 });
      }
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
    // 覆盖层是 1120×660 的固定设计空间，按画布实际宽度等比缩放
    var frame = canvas.parentNode;
    if (frame && frame.clientWidth) frame.style.setProperty('--pvz-s', (frame.clientWidth / W).toFixed(4));
    bgCache = {};
  }
  window.addEventListener('resize', resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas.parentNode);

  // 自适应渲染分辨率：1120×660 画布在 Retina 上按 2× 绘制会掉到 25fps。
  // 先按 1.5× 起步，实测帧间隔持续超过 20ms 就逐级降到 1×（画面略软但流畅）。
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

    // 悬停高亮 / 预览
    if (mode === 'playing') drawHover();

    // 墓碑
    G.graves.forEach(function (g) {
      if (g.broken) return;
      A.drawGrave(ctx, cellCX(g.c), rowFoot(g.r) + 4, G.time + g.t, false);
    });

    // 小推车
    G.mowers.forEach(function (m) {
      if (m.state === 'done') return;
      A.drawMower(ctx, m.x, rowFoot(m.row), m.state === 'run', m.t);
    });

    // 按行绘制：植物 → 僵尸 → 豌豆
    for (var r = 0; r < ROWS; r++) {
      var foot = rowFoot(r);
      // 植物
      for (var i = 0; i < G.plants.length; i++) {
        var p = G.plants[i];
        if (p.r !== r) continue;
        ctx.save();
        ctx.translate(cellCX(p.c), foot);
        if (p.hurt > 0) ctx.translate(Math.sin(G.time * 70) * 1.1, 0);
        A.drawPlant(ctx, p.id, p);
        ctx.restore();
        if (G.showHp && p.hp < p.max && p.id !== 'cherry') drawMiniBar(cellCX(p.c), foot + 8, 38, p.hp / p.max, p.hp / p.max > .5 ? '#6bd04a' : '#e8483a');
      }
      // 僵尸（后排先画）
      var lane = [];
      for (var j = 0; j < G.zombies.length; j++) if (G.zombies[j].row === r) lane.push(G.zombies[j]);
      lane.sort(function (a, b) { return b.x - a.x; });
      lane.forEach(function (z) {
        A.drawZombie(ctx, z, G.time);
        if (z.flag) A.drawFlag(ctx, z.x + 8, z.y - 20, G.time);
        if (G.showHp && !z.dead && (z.hp < z.maxhp || (z.armorMax && z.armor < z.armorMax))) {
          var by = z.y - 104 * z.scale;
          drawMiniBar(z.x, by, 40, z.hp / z.maxhp, '#e8483a');
          if (z.armorMax && z.armor > 0) drawMiniBar(z.x, by - 7, 40, z.armor / z.armorMax, z.type === 'cone' ? '#ff9a2a' : z.type === 'newspaper' ? '#e8dcc0' : '#c5ced6');
        }
      });
      // 豌豆
      for (var k = 0; k < G.peas.length; k++) {
        var b = G.peas[k];
        if (b.row !== r) continue;
        A.drawPea(ctx, b.x, b.y, b.ice, b.fire, b.fire ? 1.12 : 1);
      }
    }

    // 特效
    G.fx.forEach(function (f) { drawFx(f); });

    // 粒子
    drawParticles();

    // 阳光
    G.suns.forEach(function (s) {
      var alpha = 1;
      if (s.state === 'rest' && s.life < 3) alpha = Math.sin(s.life * 16) > 0 ? 1 : .35;
      if (s.state === 'rest' && G.auto) alpha *= .9;
      A.drawSun(ctx, s.x, s.y, 18 + Math.sin(G.time * 5 + s.ph) * 1, G.time * .9 + s.ph, alpha);
    });

    ctx.restore();

    // 铲子 / 选中卡跟随
    if (mode === 'playing') {
      var m = G.mouse;
      if (G.shovel && m.in && m.y > 110) A.drawShovel(ctx, m.x + 8, m.y - 4, .9, -.45);
    }

    drawHUD();

    // 飘字
    floaters.forEach(function (f) {
      var k = f.t / f.life, sc = k < .16 ? .6 + k / .16 * .55 : 1.12;
      ctx.globalAlpha = clamp(1 - (f.t - f.life) / .3, 0, 1);
      text(f.txt, f.x, f.y, f.size * sc, f.color, '#2a1808', 'center', 5);
      ctx.globalAlpha = 1;
    });

    // 红色脉冲
    if (flashRed > 0) {
      ctx.fillStyle = 'rgba(220,40,30,' + (flashRed * .22) + ')';
      ctx.fillRect(0, 0, W, H);
    }

    // 横幅
    if (G.banner) drawBanner(G.banner);

    // 提示（新手）
    if (G.tip && G.tipT > 0) {
      var a = Math.min(1, G.tipT / .4);
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(30,20,10,.62)';
      var tw = Math.min(560, ctx.measureText(G.tip).width + 60);
      rrPath(ctx, W / 2 - 230, GY + ROWS * CH + 14, 460, 34, 17);
      ctx.fill();
      text(G.tip, W / 2, GY + ROWS * CH + 31, 15, '#fff3d8', null, 'center');
      ctx.globalAlpha = 1;
    }
  }

  function drawMenuPreview() {
    // 菜单背景：演示植物与漂浮阳光
    var demo = [
      { id: 'sunflower', c: 1, r: 1 }, { id: 'peashooter', c: 2, r: 1 }, { id: 'wallnut', c: 3, r: 1 },
      { id: 'snowpea', c: 1, r: 3 }, { id: 'repeater', c: 2, r: 3 }, { id: 'torch', c: 3, r: 3 },
      { id: 'chomper', c: 1, r: 2 }, { id: 'threepeater', c: 2, r: 2 }, { id: 'spike', c: 4, r: 2 }
    ];
    demo.forEach(function (d, i) {
      ctx.save();
      ctx.translate(cellCX(d.c) + 6, rowFoot(d.r));
      ctx.globalAlpha = .9;
      A.drawPlant(ctx, d.id, { t: menuT + i * .7, hp: 1, max: 1, armed: true, rise: 1, cherry: 0, chew: 0, hurt: 0, glow: .25 + .25 * Math.sin(menuT * 2 + i) });
      ctx.restore();
    });
    // 排队走来的僵尸剪影
    for (var i = 0; i < 4; i++) {
      var x = GX + COLS * CW - ((menuT * 22 + i * 90) % (COLS * CW + 260));
      ctx.save();
      ctx.translate(x, rowFoot(4));
      A.drawZombie(ctx, {
        type: 'normal', ph: menuT * 3 + i, eat: false, dead: false, dieT: 0, flash: 0, slow: 0,
        armLost: false, armor: 0, armorMax: 0, armorType: null, scale: 1, x: 0, y: 0, smash: 0
      }, menuT);
      ctx.restore();
    }
    // 漂浮阳光
    for (var s = 0; s < 5; s++) {
      var sx = GX + 80 + ((s * 173 + menuT * 18) % (COLS * CW - 120));
      var sy = GY + 110 + Math.sin(menuT * 1.3 + s) * 22 + s * 38;
      A.drawSun(ctx, sx, sy, 16, menuT + s, .85);
    }
    // 暗角压暗，让 DOM 菜单更易读
    var vg = ctx.createRadialGradient(W / 2, H / 2, 120, W / 2, H / 2, W * .62);
    vg.addColorStop(0, 'rgba(20,28,14,.05)'); vg.addColorStop(1, 'rgba(16,22,10,.45)');
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
      g.addColorStop(0, 'rgba(255,255,225,' + (1 - k) + ')');
      g.addColorStop(.34, 'rgba(255,175,45,' + (.85 * (1 - k)) + ')');
      g.addColorStop(.72, 'rgba(220,65,25,' + (.5 * (1 - k)) + ')');
      g.addColorStop(1, 'rgba(60,20,10,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.x, f.y, rad, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,240,190,' + (.5 * (1 - k)) + ')';
      ctx.lineWidth = 3 * (1 - k) + .5;
      ctx.beginPath(); ctx.arc(f.x, f.y, rad * .92, 0, TAU); ctx.stroke();
    } else if (f.k === 'area') {
      ctx.fillStyle = 'rgba(255,205,90,' + (.35 * (1 - k)) + ')';
      ctx.fillRect(f.x - f.w / 2, f.y - f.h / 2, f.w, f.h);
      ctx.strokeStyle = 'rgba(255,240,180,' + (.7 * (1 - k)) + ')';
      ctx.lineWidth = 3;
      ctx.strokeRect(f.x - f.w / 2, f.y - f.h / 2, f.w, f.h);
    }
  }

  function drawMiniBar(x, y, w, ratio, color) {
    rrPath(ctx, x - w / 2 - 1, y - 1, w + 2, 6, 3);
    ctx.fillStyle = 'rgba(0,0,0,.62)'; ctx.fill();
    rrPath(ctx, x - w / 2, y, Math.max(2, w * clamp(ratio, 0, 1)), 4, 2);
    ctx.fillStyle = color; ctx.fill();
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

  var FONT = '"AMG Display","PingFang SC","Hiragino Sans GB","Microsoft YaHei",system-ui,sans-serif';
  // 数字与拉丁字符用系统圆体：展示字体的 5/2 等字形辨识度低，HUD 里容易读错
  var NUMFONT = '"SF Pro Rounded","PingFang SC","Hiragino Sans GB","Microsoft YaHei",system-ui,sans-serif';
  var CJK = /[　-鿿＀-￯]/;
  function text(txt, x, y, size, fill, stroke, align, lw) {
    ctx.font = '600 ' + size + 'px ' + (CJK.test(txt) ? FONT : NUMFONT);
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
    var pulse = b.huge ? (0.86 + 0.14 * Math.sin(G.time * 11)) : 1;
    ctx.save();
    ctx.globalAlpha = a;
    if (b.huge) {
      ctx.fillStyle = 'rgba(50,0,0,.42)';
      ctx.fillRect(0, GY + 150, W, 120);
      ctx.fillStyle = 'rgba(255,70,50,.20)';
      ctx.fillRect(0, GY + 150, W, 3);
      ctx.fillRect(0, GY + 267, W, 3);
    }
    var y = b.huge ? GY + 196 : GY + 130;
    text(b.txt, W / 2, y, b.size * pulse, b.color, '#2a0a05', 'center', b.huge ? 9 : 7);
    const subs = b.sub;
    if (subs) text(subs, W / 2, y + 40, 20, '#ffd7d0', '#2a0a05', 'center', 5);
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
      ctx.fillStyle = ok ? 'rgba(255,255,255,.26)' : 'rgba(230,50,40,.26)';
      ctx.fillRect(GX + cell.c * CW + 2, GY + cell.r * CH + 2, CW - 4, CH - 4);
      ctx.strokeStyle = ok ? 'rgba(255,255,255,.7)' : 'rgba(255,90,70,.8)';
      ctx.lineWidth = 2;
      ctx.strokeRect(GX + cell.c * CW + 2, GY + cell.r * CH + 2, CW - 4, CH - 4);
      if (!occupied) {
        ctx.save();
        ctx.globalAlpha = .55;
        ctx.translate(cellCX(cell.c), rowFoot(cell.r));
        A.drawPlant(ctx, card.id, { t: G.time, hp: 1, max: 1, armed: true, rise: 1, cherry: 0, chew: 0, hurt: 0 });
        ctx.restore();
      }
    } else if (G.shovel && occupied) {
      ctx.fillStyle = 'rgba(230,50,40,.28)';
      ctx.fillRect(GX + cell.c * CW + 2, GY + cell.r * CH + 2, CW - 4, CH - 4);
    }
  }

  /* ---------------- HUD ---------------- */
  function drawHUD() {
    // 木板
    var g = ctx.createLinearGradient(0, 0, 0, 104);
    g.addColorStop(0, '#8a5a2c'); g.addColorStop(.55, '#6f451f'); g.addColorStop(1, '#53331a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, 104);
    // 木纹
    for (var i = 0; i < 12; i++) {
      ctx.fillStyle = 'rgba(0,0,0,' + (0.03 + (i % 3) * .015) + ')';
      ctx.fillRect(0, i * 9, W, 1);
    }
    ctx.fillStyle = 'rgba(255,220,160,.10)'; ctx.fillRect(0, 0, W, 2);
    ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(0, 102, W, 2);
    ctx.fillStyle = '#c89a52'; ctx.fillRect(0, 100, W, 2);

    // 阳光槽
    var s = UI.sunCard;
    var bump = G.sunBump > 0 ? 1 + Math.sin(G.sunBump / .35 * Math.PI) * .1 : 1;
    rrPath(ctx, s.x, s.y, s.w, s.h, 12);
    var sg = ctx.createLinearGradient(0, s.y, 0, s.y + s.h);
    sg.addColorStop(0, '#fff6d2'); sg.addColorStop(1, '#f3dda2');
    ctx.fillStyle = sg; ctx.fill();
    ctx.strokeStyle = '#3a2410'; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.save(); ctx.translate(s.x + s.w / 2, s.y + 40); ctx.scale(bump, bump);
    A.drawSun(ctx, 0, 0, 16, G.time * .8, 1);
    ctx.restore();
    text(String(Math.floor(G.sun)), s.x + s.w / 2, s.y + 72, 22, '#3a2410');

    // 卡牌
    var n = G.cards.length;
    var step = Math.min(UI.cardW + UI.cardGap, (UI.shovel.x - 8 - UI.cardX0) / Math.max(1, n));
    var cw = Math.min(UI.cardW, step - UI.cardGap);
    for (var i2 = 0; i2 < n; i2++) {
      var card = G.cards[i2], def = PLANT_BY_ID[card.id];
      var x = UI.cardX0 + i2 * step, y = UI.cardY;
      var sel = G.sel === i2;
      var cd = card.cd, afford = G.sun >= def.cost;
      // 卡片底
      ctx.save();
      if (sel) { ctx.shadowColor = '#ffe27a'; ctx.shadowBlur = 16; }
      rrPath(ctx, x, y, cw, UI.cardH, 9);
      var cg = ctx.createLinearGradient(0, y, 0, y + UI.cardH);
      cg.addColorStop(0, '#fdf4d4'); cg.addColorStop(1, '#efdcaa');
      ctx.fillStyle = cg; ctx.fill();
      ctx.restore();
      rrPath(ctx, x, y, cw, UI.cardH, 9);
      ctx.strokeStyle = sel ? '#ffd23a' : '#3a2410';
      ctx.lineWidth = sel ? 3.5 : 2.4;
      ctx.stroke();
      // 立绘区
      ctx.save();
      rrPath(ctx, x + 3, y + 3, cw - 6, 54, 7); ctx.clip();
      var lg = ctx.createLinearGradient(0, y + 3, 0, y + 57);
      lg.addColorStop(0, '#d7eeb2'); lg.addColorStop(1, '#93c964');
      ctx.fillStyle = lg; ctx.fillRect(x + 3, y + 3, cw - 6, 54);
      // 立绘缩放适配
      ctx.save();
      ctx.translate(x + cw / 2, y + 57);
      ctx.scale(.56, .56);
      A.drawPlant(ctx, card.id, { t: G.time + i2 * .4, hp: 1, max: 1, armed: true, rise: 1, cherry: 0, chew: 0, hurt: 0 });
      ctx.restore();
      ctx.restore();
      // 价格
      A.drawSun(ctx, x + cw / 2 - 17, y + 71, 6, G.time * .5, 1);
      text(String(def.cost), x + cw / 2 + 5, y + 71, 14, afford ? '#3a2410' : '#b03020');
      // 快捷键
      text(String(i2 + 1), x + 8, y + 10, 10, '#fff', '#3a2410', 'center', 3);
      // 冷却 / 不足
      if (cd > 0 || !afford) {
        ctx.save();
        rrPath(ctx, x + 2, y + 2, cw - 4, UI.cardH - 4, 7); ctx.clip();
        if (cd > 0) {
          var k = clamp(cd / def.cd, 0, 1);
          ctx.fillStyle = 'rgba(15,20,25,.52)';
          ctx.fillRect(x, y, cw, UI.cardH * k);
          text(cd.toFixed(cd > 1 ? 0 : 1), x + cw / 2, y + UI.cardH / 2, 17, '#fff', '#222', 'center', 3);
        } else {
          ctx.fillStyle = 'rgba(20,20,25,.36)';
          ctx.fillRect(x, y, cw, UI.cardH);
        }
        ctx.restore();
      }
    }

    // 铲子
    var sv = UI.shovel;
    ctx.save();
    if (G.shovel) { ctx.shadowColor = '#ffe27a'; ctx.shadowBlur = 16; }
    rrPath(ctx, sv.x, sv.y, sv.w, sv.h, 9);
    var avg = ctx.createLinearGradient(0, sv.y, 0, sv.y + sv.h);
    avg.addColorStop(0, '#e8d9b0'); avg.addColorStop(1, '#c9b483');
    ctx.fillStyle = avg; ctx.fill();
    ctx.restore();
    rrPath(ctx, sv.x, sv.y, sv.w, sv.h, 9);
    ctx.strokeStyle = G.shovel ? '#ffd23a' : '#3a2410'; ctx.lineWidth = G.shovel ? 3.5 : 2.4; ctx.stroke();
    A.drawShovel(ctx, sv.x + sv.w / 2, sv.y + 44, 1, G.shovel ? Math.sin(G.time * 7) * .14 : 0);
    text('S', sv.x + 9, sv.y + 10, 10, '#fff', '#3a2410', 'center', 3);

    // 控制按钮
    drawBtn(UI.btnPause, '⏸', T('pauseBtn'), false);
    drawBtn(UI.btnSpeed, G.speed + '×', T('speedBtn'), G.speed > 1);
    drawBtn(UI.btnHp, G.showHp ? '♥' : '♡', T('hpOn'), G.showHp);
    drawBtn(UI.btnAuto, '☀', T('autoOn'), G.auto);
    drawBtn(UI.btnMute, AU.isMuted() ? '🔇' : '🔊', T('muteTitle'), false, true);

    // 波次条
    drawWaveBar();

    // 选中卡片的名字提示
    if (G.sel >= 0) {
      var d2 = PLANT_BY_ID[G.cards[G.sel].id];
      var nm = T('p_' + d2.id + '_n');
      var dx = UI.cardX0 + G.sel * step + cw / 2;
      rrPath(ctx, dx - 70, 104, 140, 24, 12);
      ctx.fillStyle = 'rgba(30,18,8,.82)'; ctx.fill();
      text(nm, dx, 116, 14, '#ffe9b8');
    }
  }

  function drawBtn(r, icon, label, active, small) {
    rrPath(ctx, r.x, r.y, r.w, r.h, 9);
    var g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
    if (active) { g.addColorStop(0, '#ffe27a'); g.addColorStop(1, '#e8a82a'); }
    else { g.addColorStop(0, '#e8d8b0'); g.addColorStop(1, '#c3a970'); }
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = '#3a2410'; ctx.lineWidth = 2; ctx.stroke();
    text(icon, r.x + r.w / 2, r.y + r.h / 2 + (small ? 0 : 0), small ? 16 : 17, '#3a2410');
  }

  function drawWaveBar() {
    var b = UI.bar;
    var total = G.endless ? Math.max(10, G.wave + 1) : G.waveTotal;
    var p = G.endless ? (G.wave % 10) / 10 : clamp((G.wave - 1 + clamp(1 - G.countdown / G.waveGap, 0, 1)) / total, 0, 1);

    // 底槽
    rrPath(ctx, b.x, b.y, b.w, b.h, 8);
    ctx.fillStyle = 'rgba(28,16,6,.85)'; ctx.fill();
    ctx.save();
    rrPath(ctx, b.x + 2, b.y + 2, b.w - 4, b.h - 4, 6); ctx.clip();
    var pg = ctx.createLinearGradient(b.x, 0, b.x + b.w, 0);
    pg.addColorStop(0, '#6bd04a'); pg.addColorStop(1, '#d6e83a');
    ctx.fillStyle = pg;
    ctx.fillRect(b.x + 2, b.y + 2, (b.w - 4) * p, b.h - 4);
    ctx.fillStyle = 'rgba(255,255,255,.22)';
    ctx.fillRect(b.x + 2, b.y + 2, (b.w - 4) * p, 5);
    ctx.restore();
    rrPath(ctx, b.x, b.y, b.w, b.h, 8);
    ctx.strokeStyle = '#2a1808'; ctx.lineWidth = 2; ctx.stroke();
    // 大波旗帜：立在进度条上方，最后一波用红色
    if (!G.endless) {
      for (var i = 0; i < G.huge.length; i++) {
        var hf = G.huge[i];
        if (hf > total) continue;
        var fx = b.x + 4 + (b.w - 8) * (hf / total);
        line(ctx, fx, b.y + 2, fx, b.y - 9, 1.6, '#3a2410');
        ctx.fillStyle = hf === total ? '#ff4a3a' : '#e8392f';
        ctx.beginPath(); ctx.moveTo(fx, b.y - 9); ctx.lineTo(fx + 9, b.y - 5.5); ctx.lineTo(fx, b.y - 2); ctx.closePath(); ctx.fill();
      }
    }
    // 波次信息分两行：第一行只放“第 N 波”，第二行放倒计时与场上僵尸数，
    // 三件事各占一行/一侧，100px 宽的进度条区域才不会挤在一起。
    var dying = aliveZ();
    text(G.endless ? TF('waveFmt', Math.max(1, G.wave)) : (G.wave >= total ? T('finalWave') : TF('waveFmt', Math.max(1, G.wave))),
      b.x + b.w / 2, b.y + b.h + 14, 13, '#fff6dc', '#2a1808', 'center', 3);
    var sub = G.endless ? '♾' : (G.wave === 0 ? T('prep') : (dying > 0 ? T('incoming') + ' ' + dying : ''));
    if (sub) text(sub, b.x + b.w, b.y + b.h + 32, 10.5, '#f3e2b8', '#2a1808', 'right', 3);
    if (G.wave < total) {
      var cd = Math.max(0, Math.ceil(G.countdown));
      text(cd + 's', b.x, b.y + b.h + 32, 10.5, '#f3e2b8', '#2a1808', 'left', 3);
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
    // 控制按钮
    if (inRect(m, UI.btnPause)) { togglePause(); return; }
    if (inRect(m, UI.btnSpeed)) { G.speed = G.speed === 1 ? 2 : G.speed === 2 ? 3 : 1; AU.sfx('click'); return; }
    if (inRect(m, UI.btnHp)) { G.showHp = !G.showHp; save.opts.hp = G.showHp; writeSave(); AU.sfx('click'); return; }
    if (inRect(m, UI.btnAuto)) { G.auto = !G.auto; save.opts.auto = G.auto; writeSave(); AU.sfx('click'); G.tip = T('optAuto') + (G.auto ? ' ✓' : ' ✕'); G.tipT = 1.2; return; }
    if (inRect(m, UI.btnMute)) { toggleMute(); return; }

    // 阳光优先（且在草坪区域）
    for (var i = G.suns.length - 1; i >= 0; i--) {
      var s = G.suns[i];
      if (s.state !== 'fly' && Math.hypot(s.x - m.x, s.y - m.y) < 34) { collectSun(s); return; }
    }
    // 铲子
    if (inRect(m, UI.shovel)) { G.shovel = !G.shovel; G.sel = -1; AU.sfx('select'); return; }
    // 卡片
    var ci = cardAt(m);
    if (ci >= 0) { selectCard(ci); return; }
    // 草坪
    var cell = cellOf(m.x, m.y);
    if (!cell) { if (m.y > 110) { G.sel = -1; G.shovel = false; } return; }
    if (G.shovel) {
      var cellObj = G.grid[cell.r][cell.c];
      if (cellObj && cellObj.id) {
        removePlant(cellObj);
        burst(cellCX(cell.c), rowFoot(cell.r) - 20, 10, ['#8a6234', '#4fb83a'], { min: 30, max: 110 });
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

  // 切后台自动暂停：避免回来时被僵尸偷家（rAF 在后台也会被节流）
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && mode === 'playing' && G && G.state === 'play') togglePause();
  });

  function toggleMute() {
    AU.init();
    AU.setMuted(!AU.isMuted());
    AU.sfx('click');
  }

  /* ============================================================
   * 覆盖层渲染
   * ============================================================ */
  var currentLevel = 0;
  var pendingDeck = null;

  function diffLabel(d) { return T(D.DIFF[d].label); }

  function isTouch() { return document.body.classList.contains('is-touch'); }

  // 菜单底部提示：触屏与键鼠写不同的操作方式
  function syncMenuHint() {
    var el = document.querySelector('.menu-hint');
    if (el) el.textContent = T(isTouch() ? 'menuHintTouch' : 'menuHint');
  }

  // 卡组面板还没打开过时（pendingDeck 为 null），只需初始化计数文案
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
      btn.className = 'lv' + (locked ? ' locked' : '') + (i === 0 || !locked ? '' : '');
      btn.type = 'button';
      btn.setAttribute('data-lv', String(i));
      btn.innerHTML =
        '<span class="lv-no">' + (i + 1) + '</span>' +
        '<span class="lv-main"><b>' + T(lv.key + 'Name') + '</b><small>' + T(lv.key + 'Desc') + '</small></span>' +
        '<span class="lv-side">' +
        (locked ? '<em class="lock">🔒</em>' : '<em class="stars">' + starStr(stars) + '</em>') +
        '<span class="waves">' + lv.waves + ' 波</span></span>';
      btn.title = locked ? T('levelLockedHint') : T(lv.key + 'Desc');
      btn.onclick = function () {
        if (locked) { AU.sfx('bad'); return; }
        AU.init(); AU.sfx('click');
        currentLevel = i;
        openDeck(false);
      };
      adv.appendChild(btn);
    });
    // 无尽卡片
    document.getElementById('endless-best').textContent =
      '🌊 ' + T('bestWave') + ' ' + (save.best.wave || 0) + ' · ⭐ ' + (save.best.score || 0);
    document.getElementById('endless').onclick = function () {
      AU.init(); AU.sfx('click');
      openDeck(true);
    };
    // 难度分段
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
    // 卡组按钮
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
      b.className = 'pcard' + (on ? ' on' : '');
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

  // 窗口较矮时，卡组面板底部的“开始”按钮会把画布顶出视口，开局后把棋盘滚回来
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

  /* 覆盖层按钮绑定 */
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
    // 顶栏按钮
    var mute = document.getElementById('btn-mute');
    mute.onclick = function () { toggleMute(); syncMuteBtn(); };
    syncMuteBtn();
    // 侧栏卡组
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
    AU.music('pvz-calm');
    show(ovReady);
    renderReady();
    refreshSide();
  }

  function partyClear() {
    particle.length = 0;
    floaters.length = 0;
  }

  /* ============================================================
   * 侧栏（本次卡组 / 僵尸图鉴）
   * ============================================================ */
  function refreshSide() {
    var hold = document.getElementById('deck-mini');
    hold.innerHTML = '';
    var deck = (G && G.cards ? G.cards.map(function (c) { return c.id; }) : save.deck);
    deck.forEach(function (id, i) {
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
      ['normal', 'cone', 'bucket', 'pole', 'newspaper', 'door', 'football', 'giant', 'imp'].forEach(function (z) {
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
        var zid = ['normal', 'cone', 'bucket', 'pole', 'newspaper', 'door', 'football', 'giant', 'imp'][i];
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
      if (mode === 'menu' && AU.ctx) AU.music('pvz-calm');
      return;
    }
    var n = aliveZ();
    if (!G.bgmTense && ((G.huge.indexOf(G.wave) >= 0 && n > 0) || n >= 10)) G.bgmTense = true;
    else if (G.bgmTense && n <= 3) G.bgmTense = false;
    var want = G.bgmTense ? 'pvz-tense' : (G.scene === 'night' || G.scene === 'eclipse' ? 'pvz-night' : 'pvz-calm');
    AU.music(want);
  }

  var musicClock = 0;
  function frame(ts) {
    requestAnimationFrame(frame);
    var raw = (ts - lastNow) / 1000 || 0;
    var dt = Math.min(.1, raw);
    lastNow = ts;
    // 掉帧自适应：战斗中帧间隔持续偏高就降低渲染分辨率（菜单动画很轻，不参与判定）
    if (mode === 'playing' && RENDER_DPR > 1 && raw > 0 && raw < .2) {
      slowAvg = slowAvg ? slowAvg * .94 + raw * .06 : raw;
      if (++slowCount > 90) {
        slowCount = 0;
        if (slowAvg > .021) { RENDER_DPR = 1; resize(); slowAvg = 0; }
      }
    }
    uiT += dt; menuT += dt;
    if (mode === 'playing' && G) {
      acc += dt * G.speed;
      var n = 0;
      while (acc >= STEP && n < 10) {
        step(STEP);
        acc -= STEP;
        n++;
        if (G.state !== 'play') break;
      }
      if (n >= 10) acc = 0;
    } else if (G) {
      // 暂停/结算时仍更新粒子
      updateParticles(dt * .6);
      if (G.state === 'over') G.time += 0;
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
    // 卡组面板可能还没打开过（pendingDeck 为 null），此时只需本地化计数文案
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
      var idx = G.cards.map(function (c) { return c.id; }).indexOf(id);
      if (idx < 0) {
        // 不在卡组中则临时加入
        G.cards.push({ id: id, cd: 0 });
        idx = G.cards.length - 1;
      }
      G.cards[idx].cd = 0;
      var p = plantAt(idx, r, c, true);
      return p;
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
    // 渲染基准：返回单帧 JS 绘制耗时（不含合成）
    bench: function (n) {
      n = n || 60;
      var t0 = performance.now();
      for (var i = 0; i < n; i++) render();
      return +((performance.now() - t0) / n).toFixed(2);
    }
  };
})();
