/* 深渊回响 · Echoes of the Abyss
 * 主引擎：地图生成 / 寻路 / 战斗 / 掉落 / 渲染 / 流程
 * 依赖：strings.js → data.js → art.js → audio.js → game.js
 * 调试入口：window.ABYSS
 */
(function () {
  'use strict';

  var D = window.ABYSS_DATA, ART = window.ABYSS_ART, AU = window.ABYSS_AUDIO;
  var TILE = D.TILE;

  /* ---------- 文案 ---------- */
  function T(k) { return window.AMG ? AMG.t(window.ABYSS_STR, k) : (window.ABYSS_STR.zh[k] || k); }
  // 文案是普通字符串，用 %d / %s 占位；这里按顺序替换
  function TF(k) {
    var str = T(k);
    var args = Array.prototype.slice.call(arguments, 1);
    var i = 0;
    return str.replace(/%[ds]/g, function () { return args[i++]; });
  }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function rndi(a, b) { return Math.floor(rnd(a, b + 1)); }
  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  // '#rrggbb' → 'r,g,b'（渐变里拼 alpha 用）
  function hexRgb(hex) {
    if (hex.charAt(0) !== '#') return '255,180,90';
    var n = parseInt(hex.slice(1), 16);
    return ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255);
  }
  function dist2(a, b) { var dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy; }
  function nowSec() { return performance.now() / 1000; }
  function fmt(n) { return Math.round(n).toLocaleString(); }

  /* ---------- 画布 ---------- */
  var canvas = document.getElementById('c');
  var ctx = canvas.getContext('2d', { alpha: false });
  var frame = canvas.parentNode;
  var W = 1120, H = 660;
  var RENDER_DPR = Math.min(window.devicePixelRatio || 1, 1.5);
  var lightCv = document.createElement('canvas');
  var lctx = lightCv.getContext('2d');

  function resize() {
    var r = frame.getBoundingClientRect();
    var cw = Math.max(320, Math.round(r.width || 1120));
    canvas.width = Math.round(cw * RENDER_DPR);
    canvas.height = Math.round(cw * (660 / 1120) * RENDER_DPR);
    lightCv.width = canvas.width;
    lightCv.height = canvas.height;
    document.documentElement.style.setProperty('--ab-s', (cw / 1120).toFixed(4));
    if (cam) clampCamera();
  }

  /* ---------- 存档 ---------- */
  var SKEY = 'abyss:save:v1';
  var save = { best: 0, kills: 0, runs: 0, opts: { auto: true, dmgNum: true, vol: 0.8 } };
  try {
    var raw = localStorage.getItem(SKEY);
    if (raw) {
      var s = JSON.parse(raw);
      if (s) {
        save.best = s.best | 0;
        save.kills = s.kills | 0;
        save.runs = s.runs | 0;
        if (s.opts) {
          if (typeof s.opts.auto === 'boolean') save.opts.auto = s.opts.auto;
          if (typeof s.opts.dmgNum === 'boolean') save.opts.dmgNum = s.opts.dmgNum;
          if (typeof s.opts.vol === 'number') save.opts.vol = s.opts.vol;
        }
      }
    }
  } catch (e) {}
  function writeSave() {
    try { localStorage.setItem(SKEY, JSON.stringify(save)); } catch (e) {}
  }

  /* ---------- 全局状态 ---------- */
  var mode = 'menu';           // menu | play | pause | inv | bless | dead
  var G = null;                // 本局状态
  var map = null;              // { w, h, tiles, rooms, floorCv }
  var cam = { x: 0, y: 0 };
  var debug = { godMode: false, t: 0 };

  /* ---------- 地图 ---------- */
  var MW = 46, MH = 36;

  function genMap(depth) {
    var w = MW, h = MH;
    var tiles = new Uint8Array(w * h);
    tiles.fill(1);
    var rooms = [];
    var tries = 0;
    var target = 9 + Math.min(4, (depth / 2) | 0);
    while (rooms.length < target && tries++ < 240) {
      var rw = rndi(6, 11), rh = rndi(5, 9);
      var rx = rndi(2, w - rw - 3), ry = rndi(2, h - rh - 3);
      var ok = true;
      for (var i = 0; i < rooms.length; i++) {
        var o = rooms[i];
        if (rx < o.x + o.w + 2 && rx + rw + 2 > o.x && ry < o.y + o.h + 2 && ry + rh + 2 > o.y) { ok = false; break; }
      }
      if (!ok) continue;
      rooms.push({ x: rx, y: ry, w: rw, h: rh, cx: rx + (rw >> 1), cy: ry + (rh >> 1) });
    }
    // 挖房间
    rooms.forEach(function (r) {
      for (var y = r.y; y < r.y + r.h; y++)
        for (var x = r.x; x < r.x + r.w; x++) tiles[y * w + x] = 0;
    });
    // 走廊：最小生成树 + 少量环路
    function carveH(x1, x2, y) { for (var x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) { tiles[y * w + x] = 0; if (y + 1 < h) tiles[(y + 1) * w + x] = 0; } }
    function carveV(y1, y2, x) { for (var y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) { tiles[y * w + x] = 0; if (x + 1 < w) tiles[y * w + x + 1] = 0; } }
    var linked = [0], rest = rooms.map(function (_, i) { return i; }).slice(1);
    while (rest.length) {
      var bi = -1, bj = -1, bd = 1e9;
      linked.forEach(function (a) {
        rest.forEach(function (b) {
          var d = Math.abs(rooms[a].cx - rooms[b].cx) + Math.abs(rooms[a].cy - rooms[b].cy);
          if (d < bd) { bd = d; bi = a; bj = b; }
        });
      });
      var A = rooms[bi], B = rooms[bj];
      carveH(A.cx, B.cx, A.cy); carveV(A.cy, B.cy, B.cx);
      linked.push(bj);
      rest = rest.filter(function (i) { return i !== bj; });
    }
    // 额外环路
    for (var k = 0; k < 3 && rooms.length > 3; k++) {
      var r1 = pick(rooms), r2 = pick(rooms);
      if (r1 !== r2) { carveH(r1.cx, r2.cx, r1.cy); carveV(r1.cy, r2.cy, r2.cx); }
    }
    // 兜底：孤立空地
    for (var y2 = 1; y2 < h - 1; y2++)
      for (var x2 = 1; x2 < w - 1; x2++)
        if (!tiles[y2 * w + x2]) {
          var free = 0;
          for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) if (!tiles[(y2 + dy) * w + x2 + dx]) free++;
          if (free === 1) tiles[y2 * w + x2] = 1;
        }

    var m = { w: w, h: h, tiles: tiles, rooms: rooms };
    m.floorCv = ART.bakeFloor(m, TILE);
    return m;
  }

  function isWall(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) return true;
    return !!map.tiles[ty * map.w + tx];
  }
  function cellFree(tx, ty) { return !isWall(tx, ty); }
  function tileAt(px, py) { return [Math.floor(px / TILE), Math.floor(py / TILE)]; }

  // 圆形与墙碰撞：按轴分离滑动
  function moveCircle(e, dx, dy) {
    var r = e.r;
    var nx = e.x + dx;
    if (!circleHitsWall(nx, e.y, r)) e.x = nx;
    var ny = e.y + dy;
    if (!circleHitsWall(e.x, ny, r)) e.y = ny;
  }
  function circleHitsWall(x, y, r) {
    var t0x = Math.floor((x - r) / TILE), t1x = Math.floor((x + r) / TILE);
    var t0y = Math.floor((y - r) / TILE), t1y = Math.floor((y + r) / TILE);
    for (var ty = t0y; ty <= t1y; ty++)
      for (var tx = t0x; tx <= t1x; tx++)
        if (isWall(tx, ty)) {
          var cx = clamp(x, tx * TILE, tx * TILE + TILE);
          var cy = clamp(y, ty * TILE, ty * TILE + TILE);
          if ((x - cx) * (x - cx) + (y - cy) * (y - cy) < r * r) return true;
        }
    return false;
  }
  function los(a, b) {
    var steps = Math.ceil(Math.hypot(a.x - b.x, a.y - b.y) / (TILE * .45));
    for (var i = 1; i < steps; i++) {
      var t = i / steps;
      var x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
      if (isWall(Math.floor(x / TILE), Math.floor(y / TILE))) return false;
    }
    return true;
  }
  // 射击线：从实际枪口出发，并留出子弹半径的余量（贴着墙角的目标不该白打）
  function losShoot(p, tgt) {
    var ang = Math.atan2(tgt.y - tgt.r * .55 - (p.y - 26), tgt.x - p.x);
    var mx = p.x + Math.cos(ang) * 18, my = p.y - 26 + Math.sin(ang) * 8;
    var tx = tgt.x, ty = tgt.y - tgt.r * .55;
    var pad = (tgt.r + 7) / TILE;
    var nx = -(ty - my), ny = tx - mx, nl = Math.hypot(nx, ny) || 1;
    nx = nx / nl * pad * TILE; ny = ny / nl * pad * TILE;
    var steps = Math.ceil(Math.hypot(tx - mx, ty - my) / (TILE * .4));
    for (var i = 1; i < steps; i++) {
      var t = i / steps;
      var x = mx + (tx - mx) * t, y = my + (ty - my) * t;
      // 中轴 + 两侧各偏一个子弹半径，任何一条撞墙就算被挡住
      if (isWall(Math.floor(x / TILE), Math.floor(y / TILE))) return false;
      if (isWall(Math.floor((x + nx) / TILE), Math.floor((y + ny) / TILE))) return false;
      if (isWall(Math.floor((x - nx) / TILE), Math.floor((y - ny) / TILE))) return false;
    }
    return true;
  }

  /* ---------- A* 寻路（玩家点地） ---------- */
  function findPath(sx, sy, tx, ty) {
    if (sx === tx && sy === ty) return [];
    var w = map.w;
    var open = [sx + sy * w];
    var came = {}, gsc = {}, fsc = {};
    came[sx + sy * w] = -1; gsc[sx + sy * w] = 0;
    fsc[sx + sy * w] = Math.abs(tx - sx) + Math.abs(ty - sy);
    var guard = 0;
    var closed = {};
    while (open.length && guard++ < 5000) {
      var bi = 0;
      for (var i = 1; i < open.length; i++) if (fsc[open[i]] < fsc[open[bi]]) bi = i;
      var cur = open.splice(bi, 1)[0];
      if (closed[cur]) continue;
      closed[cur] = 1;
      var cx = cur % w, cy = (cur / w) | 0;
      if (cx === tx && cy === ty) {
        var path = [], n = cur;
        while (n !== -1) { path.push([n % w, (n / w) | 0]); n = came[n]; }
        path.reverse(); path.shift();
        return path;
      }
      var nb = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
      for (var nI = 0; nI < 8; nI++) {
        var nx = cx + nb[nI][0], ny = cy + nb[nI][1];
        if (!cellFree(nx, ny)) continue;
        if (nI > 3 && (!cellFree(cx, ny) || !cellFree(nx, cy))) continue; // 不切墙角
        var key = nx + ny * w;
        if (closed[key]) continue;
        var step = nI > 3 ? 1.414 : 1;
        var ng = gsc[cur] + step;
        if (gsc[key] === undefined || ng < gsc[key]) {
          gsc[key] = ng;
          came[key] = cur;
          fsc[key] = ng + Math.abs(tx - nx) + Math.abs(ty - ny);
          open.push(key);
        }
      }
    }
    return [];
  }

  /* ---------- 流场（怪物追击） ---------- */
  var flow = null, flowT = 0;
  function buildFlow(px, py) {
    var w = map.w, h = map.h;
    var d = new Float32Array(w * h);
    d.fill(1e9);
    var q = new Int32Array(w * h), qh = 0, qt = 0;
    var sx = clamp(Math.floor(px / TILE), 0, w - 1), sy = clamp(Math.floor(py / TILE), 0, h - 1);
    if (isWall(sx, sy)) return;
    d[sy * w + sx] = 0; q[qt++] = sy * w + sx;
    while (qh < qt) {
      var cur = q[qh++];
      var cx = cur % w, cy = (cur / w) | 0;
      var cd = d[cur];
      for (var k = 0; k < 4; k++) {
        var nx = cx + (k === 0 ? 1 : k === 1 ? -1 : 0);
        var ny = cy + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        var idx = ny * w + nx;
        if (map.tiles[idx]) continue;
        if (d[idx] > cd + 1) { d[idx] = cd + 1; q[qt++] = idx; }
      }
    }
    flow = { d: d, w: w, h: h };
  }
  // 取当前格向低距离方向的单位向量
  function flowDir(x, y) {
    if (!flow) return null;
    var tx = clamp(Math.floor(x / TILE), 0, flow.w - 1), ty = clamp(Math.floor(y / TILE), 0, flow.h - 1);
    var best = flow.d[ty * flow.w + tx], bx = tx, by = ty;
    if (best >= 1e9) return null;
    for (var dy = -1; dy <= 1; dy++)
      for (var dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        var nx = tx + dx, ny = ty + dy;
        if (nx < 0 || ny < 0 || nx >= flow.w || ny >= flow.h) continue;
        var dd = flow.d[ny * flow.w + nx];
        if (dd < best) { best = dd; bx = nx; by = ny; }
      }
    // 目标格中心
    var cx = bx * TILE + TILE / 2, cy = by * TILE + TILE / 2;
    var vx = cx - x, vy = cy - y;
    var l = Math.hypot(vx, vy) || 1;
    return { x: vx / l, y: vy / l };
  }

  /* ---------- 属性聚合 ---------- */
  function newBonus() {
    return {
      crit: 0, critD: 0, lifeMult: 0, manaMult: 0, armorMult: 0, moveMult: 0,
      atkSpdMult: 0, lifeSteal: 0, fireDmg: 0, thorns: 0, goldMult: 0,
      magicFind: 0, hpRegenPct: 0, skillMult: 0, cdMult: 0, mpRegenMult: 0,
      potionPower: 0, dmgMult: 0, dr: 0
    };
  }
  // 由装备与祝福重算派生属性
  function recompute(p) {
    // 戒指槽只接受戒指
    ['ring1', 'ring2'].forEach(function (s) {
      if (p.gear[s] && p.gear[s].slotKind !== 'ring') p.gear[s] = null;
    });
    var gear = { armor: 0, dmg: 0, life: 0, mana: 0, crit: 0, critD: 0, moveSpd: 0, atkSpd: 0, lifeSteal: 0, thorns: 0, magicFind: 0, goldFind: 0, skillPower: 0, lifeReg: 0, dr: 0 };
    var fx = {};
    for (var i = 0; i < D.SLOTS.length; i++) {
      var it = p.gear[D.SLOTS[i]];
      if (!it) continue;
      for (var k in it.stats) gear[k] = (gear[k] || 0) + it.stats[k];
      if (it.fx) for (var f in it.fx) fx[f] = (fx[f] || 0) + it.fx[f];
    }
    var b = p.b;
    var cls = D.CLASSES[p.cls];
    p.maxhp = Math.round((cls.hp + p.lv * 7 + gear.life) * (1 + b.lifeMult));
    p.maxmp = Math.round((cls.mp + p.lv * 4 + gear.mana) * (1 + b.manaMult));
    p.armor = Math.round((cls.armor + p.lv * 1.4 + gear.armor) * (1 + b.armorMult));
    p.dmg = (cls.dmg + p.lv * 2.2 + gear.dmg) * (1 + b.dmgMult);
    p.crit = clamp(cls.crit + gear.crit / 100 + b.crit, 0, .75);
    p.critD = cls.critD + gear.critD / 100 + b.critD;
    p.moveSpd = cls.moveSpd * (1 + gear.moveSpd / 100 + b.moveMult);
    p.atkSpd = cls.atkSpd * (1 + gear.atkSpd / 100 + b.atkSpdMult);
    p.lifeSteal = gear.lifeSteal / 100 + b.lifeSteal;
    p.thorns = gear.thorns + b.thorns;
    p.magicFind = gear.magicFind / 100 + b.magicFind;
    p.goldFind = gear.goldFind / 100 + b.goldMult;
    p.skillPower = 1 + gear.skillPower / 100 + b.skillMult;
    p.lifeReg = cls.hpReg + p.lv * .25 + gear.lifeReg;
    p.dr = clamp(b.dr + gear.dr / 100, 0, .6);
    p.fx = fx;
    p.hp = Math.min(p.hp, p.maxhp);
    p.mp = Math.min(p.mp, p.maxmp);
  }

  /* ---------- 新游戏 / 新层 ---------- */
  function newPlayer(clsKey) {
    var cls = D.CLASSES[clsKey];
    var p = {
      kind: 'player', cls: clsKey, x: 0, y: 0, r: 15,
      lv: 1, xp: 0, xpNext: D.xpToLevel(1),
      hp: 1, mp: 1, gold: 0, potions: 3,
      gear: {}, bag: [], b: newBonus(),
      facing: 0, moving: false, atkAnim: 0, hurtT: 0, invuln: 0, dead: false,
      atkCd: 0, castTime: 0, atkDir: 0,
      skills: cls.skills.map(function (s, i) { return { key: s.key, cd: s.cd, cdT: 0, mana: s.mana, idx: i }; }),
      stats: { str: 8, dex: 8, int: 8 },
      forceCrit: false, buff: { dmg: 0, armor: 0, t: 0 },
      path: [], pathT: 0, depth: 1, kills: 0, playT: 0,
      autoTarget: null, repathT: 0
    };
    p.hp = 0; p.mp = 0;
    recompute(p);
    p.hp = p.maxhp; p.mp = p.maxmp;
    return p;
  }

  function startGame(clsKey) {
    AU.init();
    AU.resume();
    mode = 'play';
    flashScreen('fx-dive');
    G = {
      p: newPlayer(clsKey),
      enemies: [], bullets: [], effects: [], items: [], texts: [], parts: [],
      waveT: 0, spawnT: 0, toSpawn: 0,
      depth: 1, state: 'play', clearT: -1, boss: null,
      time: 0, lastFlow: 0, hitStop: 0, shake: 0,
      blessSeed: Math.random(), deadT: 0, lastStand: false,
      startMs: Date.now()
    };
    save.runs++;
    writeSave();
    enterFloor(1);
    syncLang();
    showHUD(true);
    hideOv();
    updateHud(true);
    renderMiniStats();
    renderGearMini();
  }

  function enterFloor(depth) {
    map = genMap(depth);
    loadFloorTiles();
    var p = G.p;
    p.depth = depth;
    // 出生点：第一个房间中心
    var r0 = map.rooms[0];
    p.x = r0.cx * TILE + TILE / 2;
    p.y = r0.cy * TILE + TILE / 2;
    p.path = [];
    G.enemies = []; G.bullets = []; G.effects = []; G.items = []; G.texts = []; G.parts = [];
    G.boss = null;
    G.state = 'play';
    G.clearT = -1;
    G.lastStand = false;
    G.toSpawn = D.monsterCount(depth);
    G.spawnT = 1.2;
    G.isBossFloor = depth % 3 === 0;
    G.bossSpawned = false;
    G.cleared = false;
    var clearChip = document.getElementById('hud-clear');
    if (clearChip) clearChip.classList.add('hidden');
    // 传送门放在最远房间
    var far = map.rooms[0];
    var bestD = -1;
    map.rooms.forEach(function (r) {
      var d = Math.abs(r.cx - r0.cx) + Math.abs(r.cy - r0.cy);
      if (d > bestD) { bestD = d; far = r; }
    });
    G.portal = { x: far.cx * TILE + TILE / 2, y: far.cy * TILE + TILE / 2, open: false };
    G.portalRoom = far;
    // 场景道具
    G.props = [];
    map.rooms.forEach(function (r, ri) {
      if (ri === 0) return;
      var n = rndi(3, 6);
      for (var i = 0; i < n; i++) {
        var px = (r.x + rnd(.4, r.w - .4)) * TILE, py = (r.y + rnd(.4, r.h - .4)) * TILE;
        var tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
        if (isWall(tx, ty)) continue;
        var rv = Math.random();
        if (rv < .55) G.props.push({ kind: 'torch', x: px, y: py, seed: Math.random() * 9 });
        else if (rv < .72) G.props.push({ kind: 'barrel', x: px, y: py, hp: 1, broken: false });
        else G.props.push({ kind: 'bones', x: px, y: py });
      }
    });
    // 门口两支火把，保证出生点有光
    G.props.push({ kind: 'torch', x: p.x - 70, y: p.y + 20, seed: 2 });
    G.props.push({ kind: 'torch', x: p.x + 70, y: p.y + 20, seed: 5 });
    buildFlow(p.x, p.y);
    // 相机直接对准玩家，避免开局滑屏
    cam.x = p.x - W / 2; cam.y = p.y - H / 2;
    // 层名横幅 + 小地图标签（否则会残留上一层的层名）
    note(TF('floorBanner', depth) + ' · ' + T(D.floorName(depth)));
    document.getElementById('mini-label').textContent = TF('floorBanner', depth) + ' · ' + T(D.floorName(depth));
    AU.sfx('descend');
    bgm(floorTrack(depth));
    var dc = document.querySelector('.depth-chip');
    if (dc) { dc.classList.remove('flash'); void dc.offsetWidth; dc.classList.add('flash'); }
    updateHud(true);
    renderMinimap();
  }

  function loadFloorTiles() { /* 地图整张烘焙，无需按块加载 */ }

  /* ---------- 相机 ---------- */
  function clampCamera() {
    var mw = map ? map.w * TILE : 0, mh = map ? map.h * TILE : 0;
    cam.x = clamp(cam.x, 0, Math.max(0, mw - W));
    cam.y = clamp(cam.y, 0, Math.max(0, mh - H));
  }
  function followCam(dt) {
    var p = G.p;
    var tx = p.x - W / 2 + clamp((mouse.x - W / 2) * .12, -70, 70);
    var ty = p.y - H / 2 + clamp((mouse.y - H / 2) * .12, -50, 50);
    var k = 1 - Math.pow(.0006, dt);
    cam.x = lerp(cam.x, tx, k);
    cam.y = lerp(cam.y, ty, k);
    clampCamera();
  }

  /* ---------- 实体生成 ---------- */
  function spawnEnemy(kind, x, y, opts) {
    var def = D.MONSTERS[kind];
    var sc = D.floorScale(G.depth);
    var m = {
      kind: kind, def: def,
      x: x, y: y, r: def.r,
      hp: def.hp * sc.hp, maxhp: def.hp * sc.hp,
      dmg: def.dmg * sc.dmg,
      // 护甲随层数增长要收敛：线性放大会让深层怪直接免疫伤害
      spd: def.spd, armor: (def.armor || 0) * Math.min(2.6, 1 + (G.depth - 1) * .16),
      atkCd: 0, facing: 0, moving: false, seed: Math.random() * 9,
      hitT: 0, frozen: 0, slowT: 0, dead: false, deadT: .6,
      elite: false, shield: 0, split: false, rage: false, affixColor: null,
      phase: !!def.phase, boss: !!def.boss,
      slamCd: def.slam ? 1.5 : 0, castCd: def.ranged ? rnd(.5, 2) : 0,
      xpMul: 1, goldMul: 1
    };
    if (opts && opts.elite) {
      m.elite = true;
      var aff = D.AFFIXES[(Math.random() * D.AFFIXES.length) | 0];
      m.affixKey = aff.key;
      m.affixColor = aff.color || '#d0a040';
      aff.apply(m);
      m.hp = m.maxhp = m.maxhp * 2.4;
      m.dmg *= 1.15;
      m.xpMul = 3.2; m.goldMul = 3.5;
      m.r *= 1.12;
    }
    G.enemies.push(m);
    return m;
  }

  function spawnWave() {
    var depth = G.depth;
    var pool = D.NORMAL_POOL.filter(function (k) { return D.MONSTERS[k].minD <= depth; });
    // 选一个离玩家较远的房间
    var p = G.p;
    var candidates = map.rooms.filter(function (r) { return Math.abs(r.cx * TILE - p.x) + Math.abs(r.cy * TILE - p.y) > 420; });
    var room = candidates.length ? pick(candidates) : pick(map.rooms);
    var eliteChance = .07 + depth * .022;
    var n = G.depth >= 3 && Math.random() < .28 ? 2 : 1;
    for (var i = 0; i < n; i++) {
      var kind = pick(pool);
      var x = (room.x + rnd(.8, room.w - .8)) * TILE;
      var y = (room.y + rnd(.8, room.h - .8)) * TILE;
      if (isWall(Math.floor(x / TILE), Math.floor(y / TILE))) continue;
      spawnEnemy(kind, x, y, { elite: Math.random() < eliteChance });
      G.toSpawn--;
    }
  }

  function spawnBoss() {
    var room = G.portalRoom;
    var x = room.cx * TILE + TILE / 2, y = (room.cy + 2) * TILE;
    var kind = D.bossForDepth(G.depth);
    var b = spawnEnemy(kind, x, y, null);
    // 守层者额外的层数成长有上限，否则深层血量会指数爆炸
    b.maxhp *= 1 + Math.min(.8, (G.depth - 3) * .1);
    b.hp = b.maxhp;
    b.dmg *= 1 + Math.min(.8, (G.depth - 3) * .1);
    b.name = T(kind);
    G.boss = b;
    note(T('bossIncoming'));
    AU.sfx('boss');
    bgm('abyss-boss');
    G.shake = 11;
    G.flash = { color: '255,90,40', a: .5, t: 0, life: .6 };
    addEffect({ kind: 'ring', x: b.x, y: b.y - 20, r: 12, max: 260, t: 0, life: .8, color: 'rgba(255,110,50,' });
    for (var i = 0; i < 46; i++) {
      var a = Math.random() * Math.PI * 2, sp = rnd(60, 300);
      G.parts.push({ x: b.x, y: b.y - 26, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, t: 0, life: rnd(.5, 1.1), color: i % 3 ? '#ff8a40' : '#ffd76a', size: rnd(2, 4.4), glow: true });
    }
  }

  /* ---------- 特效 / 飘字 ---------- */
  function note(text) {
    var el = document.getElementById('center-note');
    if (!el) return;
    el.textContent = text;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }
  function addText(x, y, text, color, size) {
    if (!save.opts.dmgNum && color !== '#ffd76a') return;
    if (G.texts.length > 60) G.texts.shift();
    G.texts.push({ x: x + rnd(-5, 5), y: y, text: text, color: color || '#fff', size: size || 14, t: 0, life: .85, vy: -46 });
  }
  function burst(x, y, n, color, spd, size) {
    if (G.parts.length > 320) return;
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, s = rnd(spd * .3, spd);
      G.parts.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20, t: 0, life: rnd(.25, .6), color: color, size: size || rnd(1.5, 3.2) });
    }
  }
  function addEffect(e) { if (G.effects.length > 90) G.effects.shift(); G.effects.push(e); }

  /* ---------- 背景音乐 ---------- */
  // AMG_BGM 只有 init 之后才会出声；这边在 AudioContext 建成时挂上 master
  var bgmReady = false, bgmName = '';
  function bgm(name) {
    if (!window.AMG_BGM) return;
    var ac = AU.ctx, dest = AU.master;
    if (!ac || !dest) return;
    if (!bgmReady) { AMG_BGM.init(ac, dest); bgmReady = true; }
    if (name === bgmName) return;
    bgmName = name;
    AMG_BGM.play(name);
  }
  function bgmStop() { bgmName = ''; if (window.AMG_BGM) AMG_BGM.stop(); }
  function floorTrack(depth) {
    if (depth >= 7) return 'abyss-deep';
    if (depth >= 4) return 'abyss-crypt-2';
    return 'abyss-crypt';
  }

  /* ---------- 伤害 ---------- */
  function rollDmg(base, critChance, critD) {
    var crit = critChance >= 1 || Math.random() < critChance;
    var v = base * rnd(.88, 1.12) * (crit ? critD : 1);
    return { v: v, crit: crit };
  }
  function dealDamage(e, amount, opts) {
    opts = opts || {};
    if (e.dead) return;
    var p = G.p;
    var crit = !!opts.crit;
    var dmg = amount;
    if (!opts.pure) dmg *= 1 - Math.min(.75, e.armor / (e.armor + 120));
    if (e.curseT > 0) dmg *= 1.28;
    dmg = Math.max(1, Math.round(dmg));
    if (e.shield > 0) { e.shield = 0; dmg *= .35; addText(e.x, e.y - e.r * 1.6, 'SHIELD', '#8fd0ff', 12); AU.sfx('shield'); }
    e.hp -= dmg;
    e.hitT = .14;
    addText(e.x, e.y - e.r * 1.5, (crit ? '✸ ' : '') + dmg, crit ? '#ffd76a' : (opts.color || '#fff'), crit ? 20 : 14);
    burst(e.x, e.y - e.r * .6, crit ? 12 : 3, opts.color || '#ff8a6a', crit ? 220 : 120, crit ? 3.6 : 2.2);
    if (crit) {
      addEffect({ kind: 'ring', x: e.x, y: e.y - e.r * .5, r: 4, max: 34 + e.r, t: 0, life: .28, color: 'rgba(255,220,140,' });
      addEffect({ kind: 'sparks', x: e.x, y: e.y - e.r * .6, t: 0, life: .3, n: 7, color: '#ffd76a' });
    }
    if (crit) AU.sfx('crit'); else AU.sfx('hit');
    G.hitStop = Math.max(G.hitStop, crit ? .055 : .025);
    // 吸血
    var ls = p.lifeSteal + (p.fx.lifeSteal || 0) / 100;
    if (ls > 0) healPlayer(dmg * ls, true);
    if (p.fx.critHeal && crit) healPlayer(p.fx.critHeal, true);
    if (e.hp <= 0) killEnemy(e);
  }

  function healPlayer(v, quiet) {
    var p = G.p;
    if (p.dead) return;
    var before = p.hp;
    p.hp = Math.min(p.maxhp, p.hp + v);
    if (!quiet && p.hp - before > 1) addText(p.x, p.y - 52, '+' + Math.round(p.hp - before), '#8fe07a', 13);
  }

  function killEnemy(e) {
    if (e.dead) return;
    e.dead = true;
    e.deadT = .55;
    var p = G.p;
    p.kills++;
    save.kills++;
    burst(e.x, e.y - e.r, e.boss ? 60 : 18, '#c04030', e.boss ? 340 : 200, e.boss ? 4.2 : 3);
    addEffect({ kind: 'ring', x: e.x, y: e.y, r: 6, max: e.boss ? 220 : 58 + e.r, t: 0, life: e.boss ? .8 : .35, color: 'rgba(200,70,50,' });
    AU.sfx('monsterDie');
    if (e.boss) {
      G.shake = 16; G.hitStop = .18;
      G.flash = { color: '255,150,80', a: .45, t: 0, life: .7 };
      for (var pi = 0; pi < 40; pi++) {
        var pa = Math.random() * Math.PI * 2, psp = rnd(80, 380);
        G.parts.push({ x: e.x, y: e.y - 30, vx: Math.cos(pa) * psp, vy: Math.sin(pa) * psp - 80, t: 0, life: rnd(.6, 1.4), color: pi % 3 ? '#ff8a40' : '#ffe08a', size: rnd(2, 4.6), glow: true });
      }
    }
    // 经验
    var xp = e.def.xp * (1 + G.depth * .32) * (e.xpMul || 1);
    gainXp(xp);
    // 金币
    var gold = Math.round(rnd(e.def.gold[0], e.def.gold[1]) * (1 + G.depth * .5) * (1 + p.goldFind) * (e.goldMul || 1));
    if (gold > 0) dropItem(e.x, e.y, 'gold', gold);
    // 掉落
    var mf = 1 + p.magicFind;
    var chance = e.boss ? 1 : e.elite ? 1 : .2 * mf;
    if (Math.random() < chance) dropGear(e.x, e.y, e);
    if (Math.random() < .1 + (e.boss ? .6 : 0)) dropItem(e.x + rnd(-14, 14), e.y + rnd(-10, 10), 'potion', 1);
    // 分裂词缀
    if (e.split && !e.boss) {
      for (var i = 0; i < 2; i++) {
        var c = spawnEnemy(e.kind, e.x + rnd(-26, 26), e.y + rnd(-20, 20), null);
        c.hp = c.maxhp = e.maxhp * .3;
        c.dmg *= .7;
        c.split = false;
        c.spawnChild = true;
      }
    }
    // 传奇：击杀新星 / 回蓝
    if (p.fx.deathNova && Math.random() < p.fx.deathNova) nova(p.x, p.y, 120, 26, '#ff8a40');
    if (p.fx.killMana) { p.mp = Math.min(p.maxmp, p.mp + p.fx.killMana); }
    if (p.fx.goldBurst && Math.random() < p.fx.goldBurst) dropItem(e.x, e.y + 12, 'gold', rndi(6, 18));
    if (e.boss) {
      G.boss = null;
      var bx = e.x, by = e.y;
      for (var g = 0; g < 3; g++) dropItem(bx + rnd(-40, 40), by + rnd(-24, 24), 'gold', rndi(20, 40));
    }
    updateHud();
  }

  function gainXp(v) {
    var p = G.p;
    p.xp += v;
    while (p.xp >= p.xpNext) {
      p.xp -= p.xpNext;
      p.lv++;
      p.xpNext = D.xpToLevel(p.lv);
      recompute(p);
      p.hp = p.maxhp; p.mp = p.maxmp;
      note(T('levelUp'));
      AU.sfx('levelup');
      burst(p.x, p.y - 30, 40, '#ffe08a', 300, 3.8);
      addEffect({ kind: 'ring', x: p.x, y: p.y, r: 10, max: 150, t: 0, life: .75, color: 'rgba(255,220,140,' });
      addEffect({ kind: 'ring', x: p.x, y: p.y, r: 6, max: 80, t: 0, life: .45, color: 'rgba(255,255,230,' });
      addEffect({ kind: 'sparks', x: p.x, y: p.y - 30, t: 0, life: .8, n: 16, color: '#ffe9a8' });
      G.flash = { color: '255,230,160', a: .18, t: 0, life: .3 };
    }
    updateHud();
  }

  /* ---------- 掉落 ---------- */
  function dropItem(x, y, type, amount) {
    if (type !== 'gold' && G.items.length > 26) return;
    G.items.push({ type: type, x: x + rnd(-10, 10), y: y + rnd(-6, 6), amount: amount || 1, seed: Math.random() * 9, t: 0, item: null });
  }

  function rollRarity(mf, boss) {
    var r = Math.random() / (1 + mf * .55) * (boss ? .55 : 1);
    if (r < .055) return 3;
    if (r < .16) return 2;
    if (r < .44) return 1;
    return 0;
  }

  function makeGear(ilvl, rarity, slot) {
    var p = G.p;
    if (!slot) {
      var kinds = ['weapon', 'offhand', 'helm', 'chest', 'boots', 'ring', 'amulet'];
      slot = pick(kinds);
    }
    if (rarity >= 3) {
      var leg = D.LEGENDARIES.filter(function (l) { return l.slot === slot; });
      if (!leg.length) leg = D.LEGENDARIES;
      var L = pick(leg);
      var it = {
        id: L.id, legendary: true, slot: L.slot, slotKind: L.slot, rarity: 3, ilvl: ilvl,
        name: window.AMG && AMG.lang !== 'zh' ? L.nameEn : L.name,
        stats: {}, fx: L.fx || {}, descKey: L.descKey
      };
      for (var k in L.stats) it.stats[k] = Math.round(L.stats[k] * (1 + ilvl * .012));
      return it;
    }
    var rar = D.RARITY[rarity];
    var affixSlots = D.AFFIX_POOL.filter(function (a) { return a.slots.indexOf(slot) >= 0; });
    var nAff = rar.affixes;
    var chosen = [], stats = {}, used = {};
    // 派生的物品等级缩放
    var lvlMul = 1 + ilvl * .09;
    for (var tries = 0; chosen.length < nAff && tries < 60; tries++) {
      var a = pick(affixSlots);
      if (used[a.key]) continue;
      used[a.key] = 1;
      var v = (a.base[0] + Math.random() * (a.base[1] - a.base[0])) * lvlMul * rar.mult;
      if (a.fmt === 'pct1') v = Math.max(.5, Math.round(v * 10) / 10);
      else v = Math.round(v);
      stats[a.key] = v;
      chosen.push({ a: a, v: v });
    }
    var baseKey = D.BASE_NAME_KEYS[slot];
    var baseName;
    if (typeof baseKey === 'string') baseName = T(baseKey);
    else baseName = T(baseKey[p.cls] || baseKey.knight);
    var it2 = {
      slot: slot, slotKind: slot, rarity: rarity, ilvl: ilvl,
      baseName: baseName, prefix: rarity >= 1 ? T(D.RARITY_PREFIX[rarity] || 'pre2') : '',
      stats: stats, affixKeys: chosen.map(function (c) { return c.a.label; }),
      fx: {}
    };
    it2.name = it2.prefix ? (it2.prefix + ' ' + baseName) : baseName;
    return it2;
  }

  function dropGear(x, y, src) {
    var p = G.p;
    var mf = p.magicFind;
    var rar = rollRarity(mf, src && src.boss);
    var ilvl = clamp(G.depth * 3 + rndi(0, 3), 1, 60);
    var slot = src && src.boss ? pick(['weapon', 'chest', 'helm', 'amulet']) : null;
    var it = makeGear(ilvl, rar, slot);
    G.items.push({ type: 'gear', x: x + rnd(-16, 16), y: y + rnd(-8, 8), amount: 1, seed: Math.random() * 9, t: 0, item: it });
    if (rar === 3) {
      AU.sfx('legendary'); note(T('legendary') + ' · ' + it.name); G.shake = 4;
      G.flash = { color: '255,190,110', a: .2, t: 0, life: .5 };
      addEffect({ kind: 'ring', x: x, y: y, r: 8, max: 120, t: 0, life: .7, color: 'rgba(255,170,90,' });
    }
    else if (rar === 2) AU.sfx('loot');
  }

  function addToBag(it) {
    var p = G.p;
    p.bag = p.bag || [];
    if (p.bag.length >= 60) { note('BAG FULL'); return false; }
    p.bag.push(it);
    return true;
  }

  function equipItem(it, fromBag) {
    var p = G.p;
    var target = it.slotKind;
    if (target === 'ring') {
      if (!p.gear.ring1) target = 'ring1';
      else if (!p.gear.ring2) target = 'ring2';
      else target = 'ring1';
    }
    var prev = p.gear[target];
    p.gear[target] = it;
    if (fromBag) {
      var i = p.bag.indexOf(it);
      if (i >= 0) p.bag.splice(i, 1);
    }
    if (prev) p.bag.push(prev);
    recompute(p);
    AU.sfx('chest');
    updateHud();
    renderInv();
    renderGearMini();
  }

  /* ---------- 技能 ---------- */
  function skillInfo(idx) {
    var p = G.p, s = p.skills[idx];
    if (!s) return null;
    var cls = D.CLASSES[p.cls];
    return { key: T('sk' + s.key), desc: T('sk' + s.key + 'd'), icon: SKILL_ICON[s.key] || '✨', mana: s.mana, cd: s.cd };
  }
  var SKILL_ICON = {
    K2: '🌀', K3: '💥', K4: '📣',
    P2: '🔥', P3: '🛡️', P4: '🌟', P5: '⛪',
    M2: '🔥', M3: '❄️', M4: '✨', M5: '☄️',
    W2: '🩸', W3: '🕸️', W4: '🔮', W5: '🕳️',
    R2: '🏹', R3: '☠️', R4: '💨', R5: '🌧️'
  };

  function castSkill(idx) {
    var p = G.p;
    if (!p || p.dead || mode !== 'play') return;
    var s = p.skills[idx];
    if (!s) return;
    if (s.cdT > 0) return;
    if (p.mp < s.mana) { addText(p.x, p.y - 60, T('mana'), '#7fb0ff', 12); AU.sfx('error'); return; }
    p.mp -= s.mana;
    s.cdT = s.cd * (1 + p.b.cdMult);
    var ang = aimAngle();
    p.facing = ang;
    var pw = p.skillPower;
    var dmg = p.dmg * 2.4 * pw;
    AU.resume();

    switch (s.key) {
      case 'K2': // 旋风斩
        AU.sfx('whirl');
        addEffect({ kind: 'whirl', x: p.x, y: p.y, t: 0, life: .75, r: 0 });
        p.whirlT = .75;
        G.enemies.forEach(function (e) {
          if (e.dead) return;
          if (dist2(e, p) < 120 * 120) {
            var a = Math.atan2(e.y - p.y, e.x - p.x);
            var r = rollDmg(dmg * .42, p.crit, p.critD);
            dealDamage(e, r.v, { crit: r.crit });
            e.x += Math.cos(a) * 16; e.y += Math.sin(a) * 16;
          }
        });
        G.shake = 3;
        break;
      case 'K3': { // 裂地冲锋
        AU.sfx('charge');
        var dx = Math.cos(ang), dy = Math.sin(ang);
        var hitSet = {};
        for (var step = 0; step < 7; step++) {
          var nx = p.x + dx * 34, ny = p.y + dy * 34;
          if (circleHitsWall(nx, ny, p.r)) break;
          p.x = nx; p.y = ny;
          G.enemies.forEach(function (e) {
            if (e.dead || hitSet[e.seed]) return;
            if (dist2(e, p) < 62 * 62) {
              hitSet[e.seed] = 1;
              var r = rollDmg(dmg * 1.15, p.crit, p.critD);
              dealDamage(e, r.v, { crit: r.crit });
              e.frozen = Math.max(e.frozen, .7);
            }
          });
          burst(p.x, p.y, 2, '#d0a060', 90, 2.5);
        }
        G.shake = 4;
        addEffect({ kind: 'ring', x: p.x, y: p.y, r: 8, max: 70, t: 0, life: .4, color: 'rgba(220,180,110,' });
        break;
      }
      case 'K4': // 战吼
        AU.sfx('shout');
        p.buff = { dmg: .4, armor: .3, t: 8 };
        addEffect({ kind: 'ring', x: p.x, y: p.y, r: 10, max: 150, t: 0, life: .7, color: 'rgba(255,190,90,' });
        addText(p.x, p.y - 66, T('skK4'), '#ffd76a', 16);
        break;
      case 'M2': { // 火球
        AU.sfx('fire');
        p.casting = .3;
        spawnBolt(p.x, p.y - 26, ang, 430, dmg * 1.1, { color: '#ff8a40', r: 9, explode: 78, trail: 'fire' });
        break;
      }
      case 'M3': { // 冰霜新星
        AU.sfx('frost');
        addEffect({ kind: 'ring', x: p.x, y: p.y, r: 10, max: 190, t: 0, life: .55, color: 'rgba(150,220,255,' });
        G.enemies.forEach(function (e) {
          if (e.dead) return;
          if (dist2(e, p) < 190 * 190) {
            var r = rollDmg(dmg * .85, p.crit, p.critD);
            dealDamage(e, r.v, { crit: r.crit, color: '#9fd8ff' });
            e.frozen = Math.max(e.frozen, 2.5);
            burst(e.x, e.y - e.r, 6, '#9fd8ff', 110, 2.4);
          }
        });
        break;
      }
      case 'M4': { // 闪现
        AU.sfx('blink');
        var dtp = 200;
        var tx2 = p.x + Math.cos(ang) * dtp, ty2 = p.y + Math.sin(ang) * dtp;
        // 逐步回退直到落点合法
        for (var k2 = 0; k2 < 10; k2++) {
          if (!circleHitsWall(tx2, ty2, p.r)) break;
          tx2 = lerp(tx2, p.x, .25); ty2 = lerp(ty2, p.y, .25);
        }
        burst(p.x, p.y - 24, 12, '#9fd8ff', 160, 2.6);
        p.x = tx2; p.y = ty2;
        p.invuln = .45;
        addEffect({ kind: 'ring', x: p.x, y: p.y, r: 6, max: 60, t: 0, life: .35, color: 'rgba(150,210,255,' });
        break;
      }
      case 'M5': { // 陨石
        AU.sfx('meteor');
        var mx = p.x + Math.cos(ang) * 240, my = p.y + Math.sin(ang) * 240;
        for (var s3 = 0; s3 < 12; s3++) {
          var tt = s3 / 12;
          if (circleHitsWall(lerp(p.x, mx, tt), lerp(p.y, my, tt), 4)) break;
        }
        addEffect({ kind: 'meteor', x: mx, y: my, t: 0, life: .55, dmg: dmg * 2.6, radius: 120 });
        break;
      }
      case 'R2': { // 多重射击
        AU.sfx('bow');
        for (var b2 = -3; b2 <= 3; b2++) {
          spawnBolt(p.x, p.y - 24, ang + b2 * .1, 900, dmg * .5, { color: '#e8d9a0', r: 3, pierce: 2, kind: 'arrow' });
        }
        break;
      }
      case 'R3': { // 毒雾
        AU.sfx('poison');
        addEffect({ kind: 'poison', x: p.x, y: p.y, t: 0, life: 5, r: 96, tick: 0 });
        break;
      }
      case 'R4': { // 影步
        AU.sfx('dash');
        var dx4 = Math.cos(ang), dy4 = Math.sin(ang);
        for (var s4 = 0; s4 < 6; s4++) {
          var nx4 = p.x + dx4 * 30, ny4 = p.y + dy4 * 30;
          if (circleHitsWall(nx4, ny4, p.r)) break;
          p.x = nx4; p.y = ny4;
          burst(p.x, p.y, 1, '#6f8a5c', 40, 2);
        }
        p.forceCrit = true;
        p.invuln = .25;
        break;
      }
      case 'R5': { // 箭雨
        AU.sfx('arrowrain');
        var ax = p.x + Math.cos(ang) * 220, ay = p.y + Math.sin(ang) * 220;
        addEffect({ kind: 'rain', x: ax, y: ay, t: 0, life: 1.6, dmg: dmg * .35, radius: 110, tick: 0 });
        break;
      }

      /* ===== 圣堂 ===== */
      case 'P2': { // 奉献：脚下圣火
        AU.sfx('holy');
        addEffect({ kind: 'holyfire', x: p.x, y: p.y, t: 0, life: 4.2, r: 124, tick: 0, dmg: p.dmg * .42 * pw });
        addEffect({ kind: 'ring', x: p.x, y: p.y, r: 8, max: 124, t: 0, life: .5, color: 'rgba(255,226,150,' });
        break;
      }
      case 'P3': { // 神圣壁垒
        AU.sfx('shield');
        var ward = Math.round(p.maxhp * .26 + 24);
        p.shieldHp = Math.max(p.shieldHp || 0, ward);
        p.shieldT = 8;
        p.invuln = Math.max(p.invuln, .15);
        addEffect({ kind: 'ward', x: p.x, y: p.y, t: 0, life: .9, r: 46 });
        addText(p.x, p.y - 68, '+' + ward, '#ffe2a0', 15);
        break;
      }
      case 'P4': { // 天罚：光标处光柱
        AU.sfx('judgment');
        var wm4 = worldMouse();
        addEffect({ kind: 'pillar', x: wm4.x, y: wm4.y, t: 0, life: .72, radius: 96, dmg: p.dmg * 2.7 * pw, done: false });
        break;
      }
      case 'P5': { // 圣裁领域
        AU.sfx('sanctuary');
        addEffect({ kind: 'sanctuary', x: p.x, y: p.y, t: 0, life: 6.2, r: 152, tick: 0, dmg: p.dmg * .55 * pw });
        addEffect({ kind: 'ring', x: p.x, y: p.y, r: 12, max: 152, t: 0, life: .8, color: 'rgba(255,236,170,' });
        G.flash = { color: '255,230,160', a: .28, t: 0, life: .4 };
        break;
      }

      /* ===== 虚空 ===== */
      case 'W2': { // 灵魂虹吸：前方锥形
        AU.sfx('siphon');
        var drain = 0;
        G.enemies.forEach(function (e) {
          if (e.dead) return;
          var d = Math.sqrt(dist2(e, p));
          if (d > 300 + e.r) return;
          var ea = Math.atan2(e.y - p.y, e.x - p.x);
          var diff = Math.abs(((ea - ang + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
          if (diff > .75) return;
          var r = rollDmg(dmg * .78, p.crit, p.critD);
          dealDamage(e, r.v, { crit: r.crit, color: '#d090ff' });
          drain += r.v;
        });
        var back = Math.min(p.maxmp - p.mp, 10 + drain * .05);
        if (back > 0) { p.mp += back; addText(p.x, p.y - 56, '+' + Math.round(back) + ' MP', '#b070f0', 12); }
        healPlayer(Math.round(drain * .12), true);
        addEffect({ kind: 'beam', x: p.x, y: p.y - 26, ang: ang, len: 300, t: 0, life: .32, color: '170,90,240' });
        break;
      }
      case 'W3': { // 诅咒烙印
        AU.sfx('curse');
        var wm3 = worldMouse();
        addEffect({ kind: 'curse', x: wm3.x, y: wm3.y, t: 0, life: 5.5, r: 116, tick: 0, dmg: p.dmg * .3 * pw });
        addEffect({ kind: 'ring', x: wm3.x, y: wm3.y, r: 8, max: 116, t: 0, life: .45, color: 'rgba(170,90,240,' });
        break;
      }
      case 'W4': { // 血祭
        AU.sfx('blood');
        var cost = Math.min(p.hp - 1, Math.max(1, Math.round(p.maxhp * .12)));
        p.hp = Math.max(1, p.hp - cost);
        p.mp = Math.min(p.maxmp, p.mp + p.maxmp * .5);
        p.buff = { dmg: .28, armor: 0, t: 6 };
        addText(p.x, p.y - 62, '-' + cost + ' HP → +' + Math.round(p.maxmp * .5) + ' MP', '#ff6a90', 13);
        burst(p.x, p.y - 30, 18, '#c03050', 160, 3);
        addEffect({ kind: 'ring', x: p.x, y: p.y, r: 8, max: 92, t: 0, life: .5, color: 'rgba(220,50,90,' });
        break;
      }
      case 'W5': { // 深渊裂隙
        AU.sfx('rift');
        var wm5 = worldMouse();
        addEffect({ kind: 'rift', x: wm5.x, y: wm5.y, t: 0, life: 4.6, r: 122, tick: 0, dmg: p.dmg * .42 * pw });
        G.flash = { color: '140,70,220', a: .22, t: 0, life: .35 };
        break;
      }
    }
    updateHud();
  }

  function spawnBolt(x, y, ang, spd, dmg, opts) {
    opts = opts || {};
    G.bullets.push({
      x: x, y: y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
      dmg: dmg, crit: G.p.crit, critD: G.p.critD, t: 0, life: 2.2,
      color: opts.color || '#ffd76a', r: opts.r || 4,
      pierce: opts.pierce || 0, hit: {}, explode: opts.explode || 0,
      kind: opts.kind || 'bolt', trail: opts.trail || null,
      // 锁定目标的投射物带轻微转向：抵消怪物走位，手感更"打得到"
      homing: opts.homing || null, turn: opts.turn || 0
    });
  }

  // 远程提前量：按飞行时间预测目标位置，避免总是打在怪身后
  function leadAngle(bx, by, tg, spd, base) {
    var px = tg.x, py = tg.y - tg.r * .55;
    var vx = tg.vx || 0, vy = tg.vy || 0;
    for (var i = 0; i < 3; i++) {
      var t = Math.hypot(px - bx, py - by) / spd;
      var nx = tg.x + vx * t, ny = tg.y - tg.r * .55 + vy * t;
      if (Math.abs(nx - px) < .5 && Math.abs(ny - py) < .5) break;
      px = nx; py = ny;
    }
    return Math.atan2(py - by, px - bx);
  }

  function nova(x, y, radius, dmg, color) {
    addEffect({ kind: 'ring', x: x, y: y, r: 10, max: radius, t: 0, life: .45, color: 'rgba(255,140,60,' });
    G.enemies.forEach(function (e) {
      if (e.dead) return;
      if (dist2(e, { x: x, y: y }) < radius * radius) {
        dealDamage(e, dmg, { color: color });
      }
    });
  }

  /* ---------- 玩家攻击 ---------- */
  var mouse = { x: W / 2, y: H / 2, down: false, worldX: 0, worldY: 0, inside: false };
  function playerScreenPos() { return { x: G.p.x - cam.x, y: G.p.y - cam.y }; }
  function aimAngle() {
    var sp = playerScreenPos();
    var dx = mouse.x - sp.x, dy = mouse.y - sp.y - 24;
    return Math.atan2(dy, dx);
  }
  function worldMouse() { return { x: mouse.x + cam.x, y: mouse.y + cam.y }; }

  function attackReach() {
    var p = G.p, cls = D.CLASSES[p.cls];
    return cls.melee ? cls.range + 14 : cls.range * .8;
  }
  function playerAttack() {
    var p = G.p;
    if (!p || p.dead) return;
    var cls = D.CLASSES[p.cls];
    // 近战：锁定目标或光标附近的敌人时自动转向（暗黑式手感，避免贴着怪挥空）
    var ang = aimAngle();
    if (p.autoTarget && !p.autoTarget.dead) ang = Math.atan2(p.autoTarget.y - p.y, p.autoTarget.x - p.x);
    else if (cls.melee) {
      var wm = worldMouse(), best = null, bd = (cls.range + 30) * (cls.range + 30);
      for (var i = 0; i < G.enemies.length; i++) {
        var en = G.enemies[i];
        if (en.dead) continue;
        var dd = (en.x - wm.x) * (en.x - wm.x) + (en.y - wm.y) * (en.y - wm.y);
        if (dd < bd) { bd = dd; best = en; }
      }
      if (best) ang = Math.atan2(best.y - p.y, best.x - p.x);
    }
    p.facing = ang;
    p.atkAnim = .22;
    var bonus = 1 + (p.buff.t > 0 ? p.buff.dmg : 0);
    if (p.fx.lowHpDmg && p.hp / p.maxhp < .35) bonus += p.fx.lowHpDmg;
    var base = p.dmg * bonus;
    var forced = p.forceCrit;
    p.forceCrit = false;
    if (cls.melee) {
      AU.sfx('swing');
      addEffect({ kind: 'slash', x: p.x, y: p.y - 26, ang: ang, t: 0, life: .22, arc: cls.arc, range: cls.range, tint: cls.slashTint || 'steel' });
      var hitAny = false;
      G.enemies.forEach(function (e) {
        if (e.dead) return;
        var d = Math.sqrt(dist2(e, p));
        if (d > cls.range + e.r) return;
        var ea = Math.atan2(e.y - p.y, e.x - p.x);
        var diff = Math.abs(((ea - ang + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (diff > cls.arc / 2 + .28) return;
        var r = rollDmg(base, forced ? 1.01 : p.crit, p.critD);
        var crit = r.crit || forced;
        dealDamage(e, r.v * (crit && !r.crit ? p.critD : 1), { crit: crit });
        hitAny = true;
        e.x += Math.cos(ea) * 10; e.y += Math.sin(ea) * 10;
      });
      // 打木桶
      hitProps(p.x, p.y, cls.range, ang, cls.arc);
      if (hitAny) G.shake = Math.max(G.shake, 2.2);
    } else {
      var sh = cls.shot || { color: '#e8d9a0', r: 3, kind: 'arrow', sfx: 'bow', turn: 5 };
      AU.sfx(sh.sfx || 'bow');
      if (sh.cast) p.casting = sh.cast;
      var bx = p.x + Math.cos(ang) * 20, by = p.y - 26 + Math.sin(ang) * 8;
      var lock = (p.autoTarget && !p.autoTarget.dead) ? p.autoTarget : null;
      if (lock) ang = leadAngle(bx, by, lock, cls.boltSpeed, ang);
      spawnBolt(bx, by, ang, cls.boltSpeed, base, {
        color: sh.color, r: sh.r, kind: sh.kind, trail: sh.trail || null,
        homing: lock, turn: sh.turn || 5
      });
      if (forced) G.bullets[G.bullets.length - 1].forceCrit = true;
      // 出手时枪口闪光
      addEffect({ kind: 'spark', x: bx, y: by, ang: ang, t: 0, life: .16, color: hexRgb(sh.color) });
    }
    p.atkCd = 1 / p.atkSpd;
  }

  function hitProps(x, y, range, ang, arc) {
    G.props.forEach(function (pr) {
      if (pr.kind !== 'barrel' || pr.broken) return;
      var d = Math.hypot(pr.x - x, pr.y - (y - 26));
      if (d > range + 14) return;
      var ea = Math.atan2(pr.y - (y - 26), pr.x - x);
      var diff = Math.abs(((ea - ang + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (diff > arc / 2 + .35) return;
      breakBarrel(pr);
    });
  }
  function breakBarrel(pr) {
    pr.broken = true;
    AU.sfx('chest');
    burst(pr.x, pr.y - 18, 14, '#8a6a3c', 150, 3);
    dropItem(pr.x, pr.y, 'gold', rndi(4, 12));
    if (Math.random() < .45) dropItem(pr.x + 14, pr.y, 'potion', 1);
    if (Math.random() < .1) dropGear(pr.x, pr.y, null);
  }

  /* ---------- 敌人 AI ---------- */
  function updateEnemy(e, dt) {
    if (e.dead) { e.deadT -= dt; e.vx = e.vy = 0; return; }
    var prevX = e.x, prevY = e.y;
    updateEnemyAI(e, dt);
    // 记录实际速度（远程提前量用）
    e.vx = (e.x - prevX) / dt; e.vy = (e.y - prevY) / dt;
  }

  function updateEnemyAI(e, dt) {
    var p = G.p;
    if (e.hitT > 0) e.hitT -= dt;
    if (e.curseT > 0) e.curseT -= dt;
    if (e.frozen > 0) { e.frozen -= dt; e.moving = false; return; }
    var spd = e.spd * (e.slowT > 0 ? .5 : 1);
    if (e.slowT > 0) e.slowT -= dt;
    // 狂暴 / 精英移速
    if (e.rage && e.hp / e.maxhp < .5) spd *= 1.35;

    var sense = e.boss ? 900 : 760;
    var d2 = dist2(e, p);
    var canSee = d2 < sense * sense;
    var ang = Math.atan2(p.y - e.y, p.x - e.x);
    e.facing = ang;
    e.moving = false;

    if (e.def.ranged && canSee && Math.sqrt(d2) < e.def.ranged.range && los(e, p)) {
      // 保持距离射击
      e.castCd -= dt;
      if (Math.sqrt(d2) < 210) {
        moveCircle(e, -Math.cos(ang) * spd * dt, -Math.sin(ang) * spd * dt);
        e.moving = true;
      }
      if (e.castCd <= 0) {
        var rg = e.def.ranged;
        e.castCd = rg.cd * rnd(.85, 1.2);
        var shots = rg.volley || 1;
        for (var vi = 0; vi < shots; vi++) {
          var va = ang + (shots > 1 ? (vi - (shots - 1) / 2) * (rg.spread || .2) : 0);
          G.bullets.push({
            x: e.x, y: e.y - e.r * .8, vx: Math.cos(va) * rg.speed, vy: Math.sin(va) * rg.speed,
            dmg: rg.dmg * (e.dmg / e.def.dmg), hostile: true, t: 0, life: 2.8,
            color: rg.poison ? '#8fe05a' : e.kind === 'skeleton' ? '#e0d8c0' : e.kind === 'wisp' ? '#7fe2f0' : e.kind === 'lich' ? '#b090ff' : '#c06050',
            r: rg.poison ? 5 : e.kind === 'lich' ? 6 : 3.5, kind: 'enemy',
            homing: rg.homing ? p : null, turn: rg.homing || 0, poison: !!rg.poison,
            trail: e.kind === 'lich' ? 'void' : e.kind === 'wisp' ? 'frost' : null
          });
        }
        AU.sfx(rg.poison ? 'poison' : e.kind === 'lich' ? 'dark' : 'bow');
      }
      // 巫妖召唤
      if (e.def.summon) {
        e.summonCd = (e.summonCd == null ? e.def.summon.cd : e.summonCd) - dt;
        if (e.summonCd <= 0) {
          e.summonCd = e.def.summon.cd;
          for (var si = 0; si < e.def.summon.n; si++) {
            var sk = pick(e.def.summon.kinds);
            var sx2 = e.x + rnd(-70, 70), sy2 = e.y + rnd(-50, 50);
            var child = spawnEnemy(sk, sx2, sy2, null);
            child.maxhp *= .85; child.hp = child.maxhp;
            addEffect({ kind: 'summon', x: sx2, y: sy2, t: 0, life: .7, color: 'rgba(150,110,240,' });
          }
          AU.sfx('summon');
        }
      }
      return;
    }

    if (!canSee) {
      // 巡逻：在附近慢慢晃
      e.wanderT = (e.wanderT || 0) - dt;
      if (e.wanderT <= 0) { e.wanderT = rnd(1.4, 3); e.wanderA = Math.random() * Math.PI * 2; }
      moveCircle(e, Math.cos(e.wanderA) * spd * .28 * dt, Math.sin(e.wanderA) * spd * .28 * dt);
      e.moving = true;
      return;
    }

    if (e.kind === 'hound') {
      // 猎犬：中距离蓄力冲刺
      var hd = e.def.dash;
      if (hd) {
        e.dashT = (e.dashT == null ? rnd(.8, 2) : e.dashT) - dt;
        if (e.dashV && e.dashV.t > 0) {
          e.dashV.t -= dt;
          moveCircle(e, e.dashV.x * dt, e.dashV.y * dt);
          e.moving = true;
          if (Math.random() < .6) G.parts.push({ x: e.x, y: e.y - 8, vx: rnd(-20, 20), vy: rnd(-30, -6), t: 0, life: .35, color: '#a05a42', size: 2.2 });
          return;
        }
        if (e.dashT <= 0 && Math.sqrt(d2) < 320 && Math.sqrt(d2) > 90) {
          e.dashT = hd.cd * rnd(.9, 1.3);
          e.dashV = { x: Math.cos(ang) * hd.spd, y: Math.sin(ang) * hd.spd, t: hd.t };
          addEffect({ kind: 'ring', x: e.x, y: e.y, r: 4, max: 34, t: 0, life: .25, color: 'rgba(200,90,60,' });
          AU.sfx('growl');
        }
      }
    }
    if (e.kind === 'ghoul' && e.def.leech) {
      e.leechT = (e.leechT || 0) + dt;
    }
    if (e.kind === 'bat') {
      var wob = Math.sin(G.time * 6 + e.seed) * .9;
      ang += wob;
    }
    if (e.kind === 'spider') {
      e.leapT = (e.leapT || rnd(.5, 2)) - dt;
      if (e.leapT <= 0 && Math.sqrt(d2) < 340) {
        e.leapT = rnd(2.2, 3.4);
        e.leapV = { x: Math.cos(ang) * 560, y: Math.sin(ang) * 560, t: .22 };
      }
      if (e.leapV && e.leapV.t > 0) {
        e.leapV.t -= dt;
        moveCircle(e, e.leapV.x * dt, e.leapV.y * dt);
        e.moving = true;
        return;
      }
    }
    // 走向玩家：近距离直接直线，远距离走流场
    var dx, dy;
    if (Math.sqrt(d2) < 200 || e.boss) {
      dx = Math.cos(ang); dy = Math.sin(ang);
    } else {
      var fd = flowDir(e.x, e.y);
      if (fd) { dx = fd.x; dy = fd.y; } else { dx = Math.cos(ang); dy = Math.sin(ang); }
    }
    // 与其他怪分离，避免叠成一坨
    var sx = 0, sy = 0;
    for (var i = 0; i < G.enemies.length; i++) {
      var o = G.enemies[i];
      if (o === e || o.dead) continue;
      var ddx = e.x - o.x, ddy = e.y - o.y;
      var dd = ddx * ddx + ddy * ddy;
      var minD = (e.r + o.r) * .82;
      if (dd < minD * minD && dd > .01) {
        var dl = Math.sqrt(dd);
        sx += ddx / dl * (minD - dl) * 3;
        sy += ddy / dl * (minD - dl) * 3;
      }
    }
    var mx = (dx * spd + sx) * dt, my = (dy * spd + sy) * dt;
    moveCircle(e, mx, my);
    e.moving = true;

    // 接触伤害
    var reach = e.r + p.r + 2;
    if (d2 < reach * reach) {
      e.atkCd -= dt;
      if (e.atkCd <= 0) {
        e.atkCd = e.boss ? 1.1 : .9;
        hurtPlayer(e.dmg, e);
        if (e.def.leech) { e.hp = Math.min(e.maxhp, e.hp + e.dmg * e.def.leech); addText(e.x, e.y - e.r * 1.7, '+' + Math.round(e.dmg * e.def.leech), '#8fe07a', 11); }
      }
    }
    // 砸地（Boss 与石卫哨兵）
    if (e.def.slam) {
      e.slamCd -= dt;
      var slamReach = e.def.slam.r * .8;
      if (e.slamCd <= 0 && Math.sqrt(d2) < slamReach) {
        e.slamCd = e.def.slam.cd;
        addEffect({ kind: 'telegraph', x: e.x, y: e.y, r: e.def.slam.r, t: 0, life: .42, color: 'rgba(255,90,50,' });
        addEffect({ kind: 'ring', x: e.x, y: e.y, r: 10, max: e.def.slam.r, t: 0, life: .5, color: 'rgba(255,140,60,' });
        addEffect({ kind: 'crack', x: e.x, y: e.y, t: 0, life: .45, r: e.def.slam.r });
        if (Math.sqrt(d2) < e.def.slam.r) hurtPlayer(e.def.slam.dmg * (e.dmg / e.def.dmg), e);
        G.shake = e.boss ? 8 : 4;
        burst(e.x, e.y, 10, '#b09070', 150, 3);
        AU.sfx('boom');
      }
    }
    // 憎恶冲撞
    if (e.boss && e.def.charge) {
      e.chargeCd = (e.chargeCd == null ? e.def.charge.cd : e.chargeCd) - dt;
      if (e.chargeCd <= 0 && Math.sqrt(d2) < 420 && Math.sqrt(d2) > 160) {
        e.chargeCd = e.def.charge.cd;
        e.dashV = { x: Math.cos(ang) * e.def.charge.spd, y: Math.sin(ang) * e.def.charge.spd, t: e.def.charge.t };
        note(T('bossCharge'));
        AU.sfx('charge');
      }
      if (e.dashV && e.dashV.t > 0) {
        e.dashV.t -= dt;
        moveCircle(e, e.dashV.x * dt, e.dashV.y * dt);
        burst(e.x, e.y, 2, '#6f7a4c', 90, 2.4);
        if (d2 < (e.r + p.r + 14) * (e.r + p.r + 14)) hurtPlayer(e.dmg * .8, e);
      }
    }
  }

  function hurtPlayer(amount, src) {
    var p = G.p;
    if (p.dead || p.invuln > 0) return;
    if (debug.godMode) { p.invuln = .3; return; }
    if (p.fx.dodge && Math.random() < p.fx.dodge) {
      addText(p.x, p.y - 56, 'DODGE', '#9fd8ff', 13);
      p.invuln = .18;
      return;
    }
    var armor = p.armor * (1 + (p.buff.t > 0 ? p.buff.armor : 0));
    var red = armor / (armor + 140);
    var dmg = Math.max(1, Math.round(amount * (1 - red) * (1 - p.dr)));
    if (p.shieldHp > 0) {
      var absorbed = Math.min(p.shieldHp, dmg);
      p.shieldHp -= absorbed;
      dmg -= absorbed;
      addText(p.x, p.y - 70, T('warded') + ' ' + Math.round(absorbed), '#ffe2a0', 12);
      addEffect({ kind: 'ward', x: p.x, y: p.y, t: 0, life: .35, r: 46 });
      AU.sfx('shield');
      if (dmg <= 0) { p.invuln = .12; updateHud(); return; }
    }
    p.hp -= dmg;
    p.hurtT = .2;
    p.invuln = .12;
    addText(p.x, p.y - 58, '-' + dmg, '#ff6a50', 15);
    burst(p.x, p.y - 30, 8, '#c03020', 150, 2.4);
    AU.sfx('hurt');
    G.shake = Math.max(G.shake, 4.5);
    G.hitStop = Math.max(G.hitStop, .03);
    addEffect({ kind: 'ring', x: p.x, y: p.y, r: 4, max: 42, t: 0, life: .26, color: 'rgba(255,70,50,' });
    if (p.thorns > 0 && src && !src.dead) dealDamage(src, p.thorns, { pure: true, color: '#c9a86a' });
    // 不灭壁垒
    if (p.hp <= 0) {
      if (p.fx.lastStand && !G.lastStand) {
        G.lastStand = true;
        p.hp = 1;
        p.invuln = 1.2;
        note(T('bLastStand') === 'bLastStand' ? 'LAST STAND' : 'LAST STAND');
        addEffect({ kind: 'ring', x: p.x, y: p.y, r: 10, max: 140, t: 0, life: .6, color: 'rgba(255,220,120,' });
      } else {
        die();
      }
    }
    updateHud();
  }

  function die() {
    var p = G.p;
    p.hp = 0;
    p.dead = true;
    mode = 'dead';
    flashScreen('fx-rise');
    G.flash = { color: '180,20,20', a: .5, t: 0, life: .9 };
    G.state = 'dead';
    AU.sfx('die');
    bgmStop();
    save.best = Math.max(save.best, G.depth);
    writeSave();
    showDead();
    showHUD(false);
  }

  /* ---------- 药水 ---------- */
  var potionCd = 0;
  function drinkPotion(auto) {
    var p = G.p;
    if (!p || p.dead) return;
    if (!auto && mode !== 'play') return;
    if (potionCd > 0) return;
    if (p.potions <= 0) { addText(p.x, p.y - 60, T('potionEmpty'), '#c9a86a', 13); AU.sfx('error'); return; }
    if (p.hp >= p.maxhp) { addText(p.x, p.y - 60, T('potionFull'), '#c9a86a', 13); AU.sfx('error'); return; }
    p.potions--;
    potionCd = D.POTION_CD;
    var heal = p.maxhp * (D.POTION_HEAL + p.b.potionPower);
    p.hp = Math.min(p.maxhp, p.hp + heal);
    healPlayer(heal, true);
    addText(p.x, p.y - 62, '+' + Math.round(heal), '#8fe07a', 16);
    burst(p.x, p.y - 28, 10, '#7ae08a', 90, 2.4);
    AU.sfx('potion');
    updateHud();
  }

  /* ---------- 主循环 ---------- */
  var SIM_DT = 1 / 120;
  var acc = 0, lastT = 0, emaFrame = 16.7, dprChecked = 0;

  function frameLoop(ts) {
    requestAnimationFrame(frameLoop);
    if (!lastT) { lastT = ts; return; }
    var raw = (ts - lastT) / 1000;
    lastT = ts;
    if (raw > .5) raw = .5;        // 切标签页回来不要瞬移
    // 自适应 DPR
    emaFrame = emaFrame * .96 + Math.min(raw * 1000, 60) * .04;
    if (emaFrame > 21 && RENDER_DPR > 1 && ts - dprChecked > 2500) {
      RENDER_DPR = 1; dprChecked = ts; resize();
    }
    if (mode === 'play' && G) {
      acc += Math.min(raw, .1);
      var steps = 0;
      while (acc >= SIM_DT && steps < 8) { simulate(SIM_DT); acc -= SIM_DT; steps++; }
      if (steps === 8) acc = 0;
    }
    if (G) render(G.time);
    if (mode === 'play') updateHudThrottled();
  }

  function simulate(dt) {
    var p = G.p;
    G.time += dt;
    if (G.hitStop > 0) { G.hitStop -= dt; return; }
    p.playT += dt;

    // 冷却
    if (potionCd > 0) potionCd -= dt;
    if (p.invuln > 0) p.invuln -= dt;
    if (p.hurtT > 0) p.hurtT -= dt;
    if (p.atkAnim > 0) p.atkAnim -= dt;
    if (p.casting > 0) p.casting -= dt;
    if (p.buff.t > 0) p.buff.t -= dt;
    if (p.shieldT > 0) { p.shieldT -= dt; if (p.shieldT <= 0) p.shieldHp = 0; }
    if (p.atkCd > 0) p.atkCd -= dt;
    for (var i = 0; i < p.skills.length; i++) if (p.skills[i].cdT > 0) p.skills[i].cdT -= dt;

    // 回复
    p.hp = Math.min(p.maxhp, p.hp + p.lifeReg * dt);
    var mpReg = D.CLASSES[p.cls].mpReg * (1 + p.b.mpRegenMult) * dt;
    p.mp = Math.min(p.maxmp, p.mp + mpReg);
    if (p.b.hpRegenPct) p.hp = Math.min(p.maxhp, p.hp + p.maxhp * p.b.hpRegenPct / 5 * dt);
    if (p.poisonT > 0) {
      p.poisonT -= dt;
      p.hp -= (p.poisonDps || 0) * dt;
      if (p.poisonT <= 0) p.poisonDps = 0;
      if (p.hp <= 0 && !p.dead) die();
    }
    // 自动喝药
    if (save.opts.auto && p.hp / p.maxhp < .35 && p.potions > 0 && potionCd <= 0) drinkPotion(true);

    // 移动
    var vx = 0, vy = 0;
    if (input.joy) { vx = input.joy.x; vy = input.joy.y; }
    else if (!p.dead) {
      if (input.left) vx -= 1;
      if (input.right) vx += 1;
      if (input.up) vy -= 1;
      if (input.down) vy += 1;
    }
    var mag = Math.hypot(vx, vy);
    if (mag > 1) { vx /= mag; vy /= mag; mag = 1; }
    if (mag > .05) {
      p.path = [];
      p.autoTarget = null;
      p.facing = Math.atan2(vy, vx);
      var sp = p.moveSpd * dt;
      moveCircle(p, vx * sp, vy * sp);
      p.moving = true;
    } else {
      p.moving = false;
      // 点地寻路
      if (p.path && p.path.length) {
        var node = p.path[0];
        var tx = node[0] * TILE + TILE / 2, ty = node[1] * TILE + TILE / 2;
        var dx = tx - p.x, dy = ty - p.y;
        var dd = Math.hypot(dx, dy);
        var sp2 = p.moveSpd * dt;
        if (dd < sp2 + 2) { p.path.shift(); }
        else {
          p.x += dx / dd * sp2; p.y += dy / dd * sp2;
          p.moving = true;
          p.facing = Math.atan2(dy, dx);
        }
      }
    }

    // 自动索敌：接近目标 → 进入射程后持续攻击
    if (!p.dead && p.autoTarget) {
      var tgt = p.autoTarget;
      if (tgt.dead || tgt.hp <= 0) { p.autoTarget = null; }
      else {
        var reach = attackReach();
        var td = Math.hypot(tgt.x - p.x, tgt.y - p.y);
        var pcls = D.CLASSES[p.cls];
        // 远程职业必须看得见目标才开火，否则会隔着墙原地空放
        if (td > reach || (!pcls.melee && !losShoot(p, tgt))) {
          p.repathT -= dt;
          if (p.repathT <= 0 || !p.path.length) {
            p.repathT = .35;
            p.path = findPath(Math.floor(p.x / TILE), Math.floor(p.y / TILE),
              clamp(Math.floor(tgt.x / TILE), 0, map.w - 1), clamp(Math.floor(tgt.y / TILE), 0, map.h - 1));
            p.path.pop();
          }
          if (p.path.length) {
            var node = p.path[0];
            var nx2 = node[0] * TILE + TILE / 2, ny2 = node[1] * TILE + TILE / 2;
            var dx2 = nx2 - p.x, dy2 = ny2 - p.y, dl2 = Math.hypot(dx2, dy2);
            var sp3 = p.moveSpd * dt;
            if (dl2 < sp3 + 2) p.path.shift();
            else { p.x += dx2 / dl2 * sp3; p.y += dy2 / dl2 * sp3; p.facing = Math.atan2(dy2, dx2); }
            p.moving = true;
          } else {
            // 已在目标格却仍够不着（怪物贴墙角、或远程怪一直后撤放风筝）：沿直线蹭过去，别原地罚站
            var ddx = tgt.x - p.x, ddy = tgt.y - p.y, ddl = Math.hypot(ddx, ddy) || 1;
            moveCircle(p, ddx / ddl * p.moveSpd * dt, ddy / ddl * p.moveSpd * dt);
            p.moving = true;
          }
          p.stallT = (p.stallT || 0) + dt;
          if (p.stallT > 7) { p.autoTarget = null; p.stallT = 0; }   // 追不进射界就放弃，交给玩家重新点选
        } else {
          p.stallT = 0;
          p.path = [];
          mouse.x = tgt.x - cam.x;
          mouse.y = tgt.y - tgt.r - cam.y;
          if (p.atkCd <= 0) playerAttack();
        }
      }
    }

    // 攻击：按住左键即按攻速连续出手
    if (!p.dead && input.attackHeld && p.atkCd <= 0) playerAttack();

    // 流场重算
    G.lastFlow += dt;
    if (G.lastFlow > .22) { G.lastFlow = 0; buildFlow(p.x, p.y); }

    // 刷怪：Boss 层先清杂兵，再出守层者
    if (G.state === 'play' && G.toSpawn > 0) {
      G.spawnT -= dt;
      if (G.spawnT <= 0) {
        spawnWave();
        G.spawnT = Math.max(.35, 1.5 - G.depth * .06);
      }
    } else if (G.state === 'play' && G.toSpawn <= 0 && !G.cleared) {
      var alive = 0;
      for (var ai = 0; ai < G.enemies.length; ai++) if (!G.enemies[ai].dead) alive++;
      if (alive === 0) {
        if (G.isBossFloor && !G.bossSpawned) {
          G.bossSpawned = true;
          spawnBoss();
        } else if (!G.isBossFloor && !G.bossSpawned) {
          G.bossSpawned = true;
          clearFloor();
        } else if (G.isBossFloor && G.bossSpawned && !G.boss) {
          clearFloor();
        }
      }
    }

    // 敌人
    for (var e = 0; e < G.enemies.length; e++) updateEnemy(G.enemies[e], dt);

    // 子弹
    updateBullets(dt);
    // 特效
    updateEffects(dt);
    // 掉落物与拾取
    updateItems(dt);
    // 粒子与飘字
    updateParticles(dt);

    if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 22);
    if (G.flash) { G.flash.t += dt; if (G.flash.t >= G.flash.life) G.flash = null; }
    // 相机跟随
    followCam(dt);
    // 传送门：靠近后自动进入（已清层才开门）
    if (G.portal && G.portal.open && !p.dead && G.state === 'cleared') {
      if (dist2(p, G.portal) < 54 * 54) { takePortal(); }
    }
    if (G.playerDeadT > 0) G.playerDeadT -= dt;
  }

  function clearFloor() {
    if (G.cleared) return;
    G.cleared = true;
    G.state = 'cleared';
    G.portal.open = true;
    note(T('cleared'));
    AU.sfx('portal');
    document.getElementById('hud-clear').classList.remove('hidden');
    document.getElementById('hud-clear').textContent = '✦ ' + T('cleared');
    document.getElementById('mini-label').textContent = TF('floorBanner', G.depth) + ' · ' + T(D.floorName(G.depth));
    recompute(G.p);
    G.p.mp = G.p.maxmp;
  }

  function takePortal() {
    if (G.state !== 'cleared') return;
    if (mode !== 'play') return;
    G.state = 'bless';
    mode = 'bless';
    openBless();
  }

  function updateBullets(dt) {
    var p = G.p;
    for (var i = G.bullets.length - 1; i >= 0; i--) {
      var b = G.bullets[i];
      b.t += dt;
      if (b.homing && !b.homing.dead && b.turn) {
        // 缓慢转向锁定目标（只修正走位偏移，不做导弹式追踪）
        var want = Math.atan2(b.homing.y - b.homing.r * .55 - b.y, b.homing.x - b.x);
        var cur = Math.atan2(b.vy, b.vx);
        var diff = ((want - cur + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        var maxTurn = b.turn * dt;
        var na = cur + clamp(diff, -maxTurn, maxTurn);
        var spd0 = Math.hypot(b.vx, b.vy);
        b.vx = Math.cos(na) * spd0; b.vy = Math.sin(na) * spd0;
      }
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.t > b.life) { G.bullets.splice(i, 1); continue; }
      if (b.trail === 'fire' && Math.random() < .6) {
        G.parts.push({ x: b.x, y: b.y, vx: rnd(-16, 16), vy: rnd(-24, 0), t: 0, life: .3, color: '#ff8a40', size: rnd(1.5, 3) });
      }
      if (isWall(Math.floor(b.x / TILE), Math.floor(b.y / TILE))) {
        if (b.explode) explodeBolt(b);
        G.bullets.splice(i, 1);
        continue;
      }
      if (b.hostile) {
        if (p.dead) continue;
        if (dist2(b, { x: p.x, y: p.y - 20 }) < (p.r + b.r + 6) * (p.r + b.r + 6)) {
          hurtPlayer(b.dmg, null);
          if (b.poison) { G.p.poisonT = 3; G.p.poisonDps = b.dmg * .22; }
          G.bullets.splice(i, 1);
        }
        continue;
      }
      for (var e = 0; e < G.enemies.length; e++) {
        var en = G.enemies[e];
        if (en.dead || b.hit[en.seed]) continue;
        if (dist2(b, { x: en.x, y: en.y - en.r }) < (en.r + b.r + 4) * (en.r + b.r + 4)) {
          b.hit[en.seed] = 1;
          var r = rollDmg(b.dmg, b.crit, b.critD);
          var crit = r.crit || b.forceCrit;
          dealDamage(en, crit && !r.crit ? r.v * b.critD : r.v, { crit: crit });
          if (b.explode) { explodeBolt(b); G.bullets.splice(i, 1); break; }
          if (b.pierce > 0) { b.pierce--; }
          else { G.bullets.splice(i, 1); break; }
        }
      }
    }
  }

  function explodeBolt(b) {
    AU.sfx('boom');
    burst(b.x, b.y, 14, '#ff9a4a', 180, 3);
    addEffect({ kind: 'ring', x: b.x, y: b.y, r: 8, max: b.explode, t: 0, life: .35, color: 'rgba(255,150,70,' });
    G.enemies.forEach(function (e) {
      if (e.dead) return;
      if (dist2(e, b) < b.explode * b.explode) {
        var r = rollDmg(b.dmg * .8, b.crit, b.critD);
        dealDamage(e, r.v, { crit: r.crit, color: '#ffb070' });
      }
    });
    G.shake = Math.max(G.shake, 3);
  }

  function updateEffects(dt) {
    var p = G.p;
    for (var i = G.effects.length - 1; i >= 0; i--) {
      var ef = G.effects[i];
      ef.t += dt;
      if (ef.kind === 'meteor') {
        if (ef.t >= ef.life && !ef.done) {
          ef.done = true;
          AU.sfx('meteor');
          burst(ef.x, ef.y, 30, '#ff7a30', 260, 4);
          addEffect({ kind: 'ring', x: ef.x, y: ef.y, r: 10, max: ef.radius, t: 0, life: .5, color: 'rgba(255,140,60,' });
          G.enemies.forEach(function (e) {
            if (e.dead) return;
            if (dist2(e, ef) < ef.radius * ef.radius) {
              var r = rollDmg(ef.dmg, p.crit, p.critD);
              dealDamage(e, r.v, { crit: r.crit, color: '#ffb070' });
            }
          });
          G.shake = 7;
        }
      } else if (ef.kind === 'poison') {
        if (ef.t % .5 < dt) {
          G.enemies.forEach(function (e) {
            if (e.dead) return;
            if (dist2(e, ef) < ef.r * ef.r) {
              dealDamage(e, p.dmg * .22 * p.skillPower, { color: '#8fe07a', pure: true });
              e.slowT = Math.max(e.slowT, .6);
            }
          });
        }
        if (Math.random() < .7) G.parts.push({ x: ef.x + rnd(-ef.r, ef.r), y: ef.y + rnd(-ef.r * .5, ef.r * .5), vx: rnd(-8, 8), vy: rnd(-26, -8), t: 0, life: .7, color: '#5aa04a', size: rnd(2, 4) });
      } else if (ef.kind === 'holyfire' || ef.kind === 'sanctuary' || ef.kind === 'curse' || ef.kind === 'rift') {
        ef.tick = (ef.tick || 0) - dt;
        if (ef.tick <= 0) {
          ef.tick = ef.kind === 'curse' ? .75 : .5;
          G.enemies.forEach(function (e) {
            if (e.dead) return;
            if (dist2(e, ef) > ef.r * ef.r) return;
            if (ef.kind === 'curse') {
              e.curseT = Math.max(e.curseT || 0, 1.2);
              var rc = rollDmg(ef.dmg, p.crit, p.critD);
              dealDamage(e, rc.v, { crit: rc.crit, color: '#c890ff' });
            } else if (ef.kind === 'rift') {
              var rr2 = rollDmg(ef.dmg, p.crit, p.critD);
              dealDamage(e, rr2.v, { crit: rr2.crit, color: '#b070f0' });
              e.slowT = Math.max(e.slowT, .4);
            } else {
              var rh = rollDmg(ef.dmg, p.crit, p.critD);
              dealDamage(e, rh.v, { crit: rh.crit, color: ef.kind === 'sanctuary' ? '#ffe6a8' : '#ffcf7a' });
              e.slowT = Math.max(e.slowT, .5);
            }
          });
          if (ef.kind === 'sanctuary') healPlayer(G.p.maxhp * .02, true);
        }
        // 粒子
        if (Math.random() < .8) {
          var ang2 = Math.random() * Math.PI * 2, rad = Math.sqrt(Math.random()) * ef.r;
          var col = ef.kind === 'rift' ? '#8b52e0' : ef.kind === 'curse' ? '#a06fd0' : ef.kind === 'sanctuary' ? '#fff0c0' : '#ffcf7a';
          G.parts.push({ x: ef.x + Math.cos(ang2) * rad, y: ef.y + Math.sin(ang2) * rad * .6, vx: rnd(-6, 6), vy: rnd(-58, -22), t: 0, life: rnd(.4, .95), color: col, size: rnd(1.6, 3.4), glow: true });
        }
      } else if (ef.kind === 'pillar') {
        if (ef.t > ef.life * .45 && !ef.done) {
          ef.done = true;
          AU.sfx('judgmentHit');
          G.flash = { color: '255,240,190', a: .35, t: 0, life: .25 };
          G.shake = 9;
          burst(ef.x, ef.y, 34, '#fff0c0', 300, 4.2);
          addEffect({ kind: 'ring', x: ef.x, y: ef.y, r: 12, max: ef.radius, t: 0, life: .55, color: 'rgba(255,235,170,' });
          G.enemies.forEach(function (e) {
            if (e.dead) return;
            if (dist2(e, ef) < (ef.radius + e.r) * (ef.radius + e.r)) {
              var rp = rollDmg(ef.dmg, p.crit, p.critD);
              dealDamage(e, rp.v, { crit: rp.crit, color: '#ffe6a8' });
              e.frozen = Math.max(e.frozen, .45);
            }
          });
        }
      } else if (ef.kind === 'rain') {
        ef.tick = (ef.tick || 0) - dt;
        if (ef.tick <= 0) {
          ef.tick = .22;
          AU.sfx('bow');
          for (var ri = 0; ri < 5; ri++) {
            var rx = ef.x + rnd(-ef.radius, ef.radius), ry = ef.y + rnd(-ef.radius * .6, ef.radius * .6);
            G.parts.push({ x: rx, y: ry - 160, vx: 0, vy: 900, t: 0, life: .22, color: '#e8d9a0', size: 2, line: true });
            G.enemies.forEach(function (e) {
              if (e.dead) return;
              if (dist2(e, { x: rx, y: ry }) < 26 * 26) {
                var r = rollDmg(ef.dmg, p.crit, p.critD);
                dealDamage(e, r.v, { crit: r.crit });
              }
            });
          }
        }
      }
      if (ef.t >= ef.life) G.effects.splice(i, 1);
    }
  }

  function updateItems(dt) {
    var p = G.p;
    for (var i = G.items.length - 1; i >= 0; i--) {
      var it = G.items[i];
      it.t += dt;
      var d = Math.hypot(it.x - p.x, it.y - (p.y - 14));
      // 吸附（金币/药水；装备需靠近）
      var magR = it.type === 'gold' ? 90 : it.type === 'potion' ? 70 : 46;
      if (d < magR && !p.dead) {
        it.x = lerp(it.x, p.x, Math.min(1, dt * 10));
        it.y = lerp(it.y, p.y, Math.min(1, dt * 10));
        if (d < 26) {
          pickUp(it, i);
          continue;
        }
      }
    }
  }

  function pickUp(it, idx) {
    var p = G.p;
    G.items.splice(idx, 1);
    if (it.type === 'gold') {
      p.gold += it.amount;
      AU.sfx('gold');
      addText(it.x, it.y - 20, '+' + it.amount, '#ffd76a', 12);
      updateHud();
    } else if (it.type === 'potion') {
      p.potions++;
      AU.sfx('potion');
      addText(it.x, it.y - 20, '+1 🧪', '#8fe07a', 13);
      updateHud();
    } else if (it.type === 'gear') {
      var upgraded = autoConsider(p, it.item);
      AU.sfx('loot');
      var nm = it.item.name;
      var col = D.RARITY[it.item.rarity].color;
      addText(it.x, it.y - 26, (upgraded ? '↑ ' : '') + nm, col, 13);
      if (upgraded) addText(it.x, it.y - 46, T('autoEquip'), '#8fe07a', 11);
      if (it.item.rarity >= 2) note(TF('rareDrop', nm));
      if (!upgraded) addToBag(it.item);
      updateHud();
      renderGearMini();
    }
  }

  function updateParticles(dt) {
    for (var i = G.parts.length - 1; i >= 0; i--) {
      var q = G.parts[i];
      q.t += dt;
      q.x += q.vx * dt; q.y += q.vy * dt;
      if (!q.line) q.vy += 140 * dt;
      if (q.t > q.life) G.parts.splice(i, 1);
    }
    for (var j = G.texts.length - 1; j >= 0; j--) {
      var tx = G.texts[j];
      tx.t += dt;
      tx.y += tx.vy * dt;
      tx.vy *= .92;
      if (tx.t > tx.life) G.texts.splice(j, 1);
    }
  }

  /* ---------- 渲染 ---------- */
  function render(t) {
    if (!map) return;
    var c = ctx;
    var dpr = RENDER_DPR;
    var sx = 0, sy = 0;
    if (G && G.shake > 0) { sx = rnd(-G.shake, G.shake); sy = rnd(-G.shake, G.shake); }
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = '#0a0806';
    c.fillRect(0, 0, W, H);
    c.save();
    c.translate(-cam.x + sx, -cam.y + sy);

    // 地面
    var vx0 = cam.x - 80, vy0 = cam.y - 80, vx1 = cam.x + W + 80, vy1 = cam.y + H + 80;
    c.drawImage(map.floorCv, 0, 0);

    if (!G) { c.restore(); return; }
    var p = G.p;

    // 传送门
    if (G.portal) ART.drawPortal(c, G.portal.x, G.portal.y, t, G.portal.open);

    // 地面掉落
    for (var i = 0; i < G.items.length; i++) {
      var it = G.items[i];
      if (it.x < vx0 || it.x > vx1 || it.y < vy0 || it.y > vy1) continue;
      ART.drawGroundItem(c, it, t);
    }

    // 地面特效（毒雾 / 箭雨 / 陨石落点）
    for (var e0 = 0; e0 < G.effects.length; e0++) {
      var ef0 = G.effects[e0];
      if (ef0.kind === 'poison') {
        var a = .16 * (1 - ef0.t / ef0.life);
        var pg = c.createRadialGradient(ef0.x, ef0.y, 4, ef0.x, ef0.y, ef0.r);
        pg.addColorStop(0, 'rgba(90,160,70,' + (a + .1) + ')');
        pg.addColorStop(.7, 'rgba(70,130,50,' + a + ')');
        pg.addColorStop(1, 'rgba(50,100,40,0)');
        c.fillStyle = pg;
        c.beginPath(); c.ellipse(ef0.x, ef0.y, ef0.r, ef0.r * .62, 0, 0, Math.PI * 2); c.fill();
      } else if (ef0.kind === 'meteor') {
        var k = Math.min(1, ef0.t / ef0.life);
        c.strokeStyle = 'rgba(255,120,50,' + (.25 + k * .45) + ')';
        c.lineWidth = 2;
        c.beginPath(); c.ellipse(ef0.x, ef0.y, ef0.radius * (1 - k * .25), ef0.radius * .6 * (1 - k * .25), 0, 0, Math.PI * 2); c.stroke();
        c.fillStyle = 'rgba(255,90,30,' + (.08 + k * .12) + ')';
        c.beginPath(); c.ellipse(ef0.x, ef0.y, ef0.radius, ef0.radius * .6, 0, 0, Math.PI * 2); c.fill();
        // 坠落的石头
        if (!ef0.done) {
          var mk = ef0.t / ef0.life;
          var mxx = ef0.x + (1 - mk) * 240, myy = ef0.y + (1 - mk) * 300 - 180;
          var mg = c.createRadialGradient(mxx, myy, 2, mxx, myy, 26);
          mg.addColorStop(0, 'rgba(255,240,190,1)');
          mg.addColorStop(.4, 'rgba(255,140,60,.9)');
          mg.addColorStop(1, 'rgba(200,60,20,0)');
          c.fillStyle = mg;
          c.beginPath(); c.arc(mxx, myy, 26, 0, Math.PI * 2); c.fill();
          c.fillStyle = '#5a4030';
          c.beginPath(); c.arc(mxx, myy, 10, 0, Math.PI * 2); c.fill();
        }
      } else if (ef0.kind === 'rain') {
        c.strokeStyle = 'rgba(230,210,150,.28)';
        c.lineWidth = 1;
        c.beginPath(); c.ellipse(ef0.x, ef0.y, ef0.radius, ef0.radius * .6, 0, 0, Math.PI * 2); c.stroke();
      } else if (ef0.kind === 'holyfire' || ef0.kind === 'sanctuary') {
        var hk = 1 - ef0.t / ef0.life;
        var hr = ef0.r * (1 + Math.sin(t * 4) * .015);
        var hg = c.createRadialGradient(ef0.x, ef0.y, 6, ef0.x, ef0.y, hr);
        if (ef0.kind === 'sanctuary') {
          hg.addColorStop(0, 'rgba(255,236,170,' + (.22 * hk + .06) + ')');
          hg.addColorStop(.65, 'rgba(255,200,90,' + .16 * hk + ')');
          hg.addColorStop(1, 'rgba(180,120,40,0)');
        } else {
          hg.addColorStop(0, 'rgba(255,214,120,' + (.3 * hk + .06) + ')');
          hg.addColorStop(.7, 'rgba(230,150,50,' + .18 * hk + ')');
          hg.addColorStop(1, 'rgba(140,70,20,0)');
        }
        c.fillStyle = hg;
        c.beginPath(); c.ellipse(ef0.x, ef0.y, hr, hr * .62, 0, 0, Math.PI * 2); c.fill();
        // 边缘光弧
        c.save();
        c.globalCompositeOperation = 'lighter';
        c.strokeStyle = ef0.kind === 'sanctuary' ? 'rgba(255,240,190,' + (.45 * hk) + ')' : 'rgba(255,210,130,' + (.4 * hk) + ')';
        c.lineWidth = 2.4;
        c.beginPath(); c.ellipse(ef0.x, ef0.y, hr, hr * .62, 0, t * 1.4, t * 1.4 + Math.PI * 1.5); c.stroke();
        if (ef0.kind === 'sanctuary') {
          // 内圈旋转符文
          c.strokeStyle = 'rgba(255,246,210,' + (.32 * hk) + ')';
          c.lineWidth = 1.4;
          for (var sr = 0; sr < 3; sr++) {
            var sa = -t * .9 + sr * Math.PI * 2 / 3;
            c.beginPath(); c.ellipse(ef0.x, ef0.y, hr * .62, hr * .38, 0, sa, sa + .7); c.stroke();
          }
        }
        c.restore();
      } else if (ef0.kind === 'curse' || ef0.kind === 'rift') {
        var ck = 1 - ef0.t / ef0.life;
        var cr = ef0.r;
        var cg = c.createRadialGradient(ef0.x, ef0.y, 4, ef0.x, ef0.y, cr);
        if (ef0.kind === 'rift') {
          cg.addColorStop(0, 'rgba(180,110,255,' + (.34 * ck) + ')');
          cg.addColorStop(.5, 'rgba(90,30,160,' + (.22 * ck) + ')');
          cg.addColorStop(1, 'rgba(20,0,40,0)');
        } else {
          cg.addColorStop(0, 'rgba(160,110,230,' + (.28 * ck) + ')');
          cg.addColorStop(.7, 'rgba(90,50,150,' + (.16 * ck) + ')');
          cg.addColorStop(1, 'rgba(40,10,80,0)');
        }
        c.fillStyle = cg;
        c.beginPath(); c.ellipse(ef0.x, ef0.y, cr, cr * .6, 0, 0, Math.PI * 2); c.fill();
        c.save();
        c.globalCompositeOperation = 'lighter';
        c.strokeStyle = 'rgba(190,130,255,' + (.5 * ck) + ')';
        c.lineWidth = 2;
        c.beginPath();
        if (ef0.kind === 'rift') {
          // 锯齿裂隙
          for (var rj = 0; rj <= 10; rj++) {
            var ra = -t * .6 + rj / 10 * Math.PI * 2;
            var rad2 = cr * (.55 + (rj % 2 ? .38 : .18));
            var rx2 = ef0.x + Math.cos(ra) * rad2, ry2 = ef0.y + Math.sin(ra) * rad2 * .6;
            if (rj === 0) c.moveTo(rx2, ry2); else c.lineTo(rx2, ry2);
          }
          c.closePath();
        } else {
          c.ellipse(ef0.x, ef0.y, cr * .8, cr * .48, 0, t * .8, t * .8 + Math.PI * 1.6);
        }
        c.stroke();
        c.restore();
      }
    }

    // 场景道具（先画桶与骨，再画火把，最后实体）
    for (var pr = 0; pr < G.props.length; pr++) {
      var pp = G.props[pr];
      if (pp.x < vx0 || pp.x > vx1 || pp.y < vy0 || pp.y > vy1) continue;
      if (pp.kind === 'barrel') ART.drawBarrel(c, pp.x, pp.y, pp.broken, t);
      else if (pp.kind === 'bones') ART.drawBones(c, pp.x, pp.y);
    }

    // 敌人（按 y 排序与玩家一起）
    var drawList = [];
    for (var en = 0; en < G.enemies.length; en++) {
      var m = G.enemies[en];
      if (m.x < vx0 || m.x > vx1 || m.y < vy0 || m.y > vy1) continue;
      if (m.dead && m.deadT <= 0) continue;
      drawList.push(m);
    }
    if (!p.dead || true) drawList.push(p);
    drawList.sort(function (a, b) { return a.y - b.y; });
    for (var dI = 0; dI < drawList.length; dI++) {
      var ent = drawList[dI];
      if (ent === p) ART.drawPlayer(c, p, t);
      else ART.drawMonster(c, ent, t);
    }

    // 火把（在实体上方，制造前景光晕）
    for (var pt = 0; pt < G.props.length; pt++) {
      var tp = G.props[pt];
      if (tp.kind !== 'torch') continue;
      if (tp.x < vx0 || tp.x > vx1 || tp.y < vy0 || tp.y > vy1) continue;
      ART.drawTorch(c, tp.x, tp.y, t, 1);
    }

    // 子弹（拖尾画在弹体后面）
    c.globalCompositeOperation = 'lighter';
    for (var bT = 0; bT < G.bullets.length; bT++) {
      var bt = G.bullets[bT];
      var tcol = bt.trail === 'fire' ? '255,140,60' : bt.trail === 'shadow' ? '170,90,240'
        : bt.trail === 'void' ? '150,110,255' : bt.trail === 'frost' ? '140,230,255' : null;
      if (!tcol) continue;
      var tl = Math.min(1, bt.t * 6);
      var tg = c.createLinearGradient(bt.x, bt.y, bt.x - bt.vx * .055, bt.y - bt.vy * .055);
      tg.addColorStop(0, 'rgba(' + tcol + ',' + .5 * tl + ')');
      tg.addColorStop(1, 'rgba(' + tcol + ',0)');
      c.strokeStyle = tg;
      c.lineWidth = bt.r * 1.6;
      c.beginPath(); c.moveTo(bt.x, bt.y); c.lineTo(bt.x - bt.vx * .055, bt.y - bt.vy * .055); c.stroke();
    }
    c.globalCompositeOperation = 'source-over';
    for (var bI = 0; bI < G.bullets.length; bI++) {
      var b = G.bullets[bI];
      c.save();
      if (b.kind === 'arrow') {
        var ang = Math.atan2(b.vy, b.vx);
        c.translate(b.x, b.y);
        c.rotate(ang);
        c.save();
        c.globalCompositeOperation = 'lighter';
        c.strokeStyle = 'rgba(255,240,200,.28)';
        c.lineWidth = 7;
        c.beginPath(); c.moveTo(-16, 0); c.lineTo(8, 0); c.stroke();
        c.restore();
        c.strokeStyle = b.color;
        c.lineWidth = 2;
        c.beginPath(); c.moveTo(-10, 0); c.lineTo(7, 0); c.stroke();
        c.fillStyle = b.color;
        c.beginPath(); c.moveTo(11, 0); c.lineTo(5, -3); c.lineTo(5, 3); c.closePath(); c.fill();
      } else if (b.kind === 'enemy') {
        c.globalCompositeOperation = 'lighter';
        var ebg = c.createRadialGradient(b.x, b.y, 1, b.x, b.y, b.r * 3);
        ebg.addColorStop(0, b.color);
        ebg.addColorStop(.4, b.color);
        ebg.addColorStop(1, 'rgba(0,0,0,0)');
        c.globalAlpha = .45;
        c.fillStyle = ebg;
        c.beginPath(); c.arc(b.x, b.y, b.r * 3, 0, Math.PI * 2); c.fill();
        c.globalAlpha = 1;
        c.globalCompositeOperation = 'source-over';
        c.fillStyle = b.color;
        c.beginPath(); c.arc(b.x, b.y, b.r, 0, Math.PI * 2); c.fill();
        c.fillStyle = 'rgba(255,255,255,.7)';
        c.beginPath(); c.arc(b.x - b.r * .25, b.y - b.r * .25, b.r * .38, 0, Math.PI * 2); c.fill();
      } else if (b.kind === 'shadow') {
        c.globalCompositeOperation = 'lighter';
        var sbg = c.createRadialGradient(b.x, b.y, 1, b.x, b.y, b.r * 3.6);
        sbg.addColorStop(0, '#f0e0ff');
        sbg.addColorStop(.3, b.color);
        sbg.addColorStop(.7, 'rgba(110,40,200,.5)');
        sbg.addColorStop(1, 'rgba(40,0,90,0)');
        c.fillStyle = sbg;
        c.beginPath(); c.arc(b.x, b.y, b.r * 3.6, 0, Math.PI * 2); c.fill();
        // 旋转的虚空碎片
        c.strokeStyle = 'rgba(210,170,255,.8)';
        c.lineWidth = 1.4;
        for (var sh2 = 0; sh2 < 3; sh2++) {
          var sha = b.t * 9 + sh2 * 2.1;
          c.beginPath();
          c.moveTo(b.x + Math.cos(sha) * b.r * 2.2, b.y + Math.sin(sha) * b.r * 2.2);
          c.lineTo(b.x + Math.cos(sha + .5) * b.r * 2.9, b.y + Math.sin(sha + .5) * b.r * 2.9);
          c.stroke();
        }
      } else {
        c.globalCompositeOperation = 'lighter';
        var bg = c.createRadialGradient(b.x, b.y, 1, b.x, b.y, b.r * 3.6);
        bg.addColorStop(0, '#fff6dc');
        bg.addColorStop(.3, b.color);
        bg.addColorStop(.65, b.color);
        bg.addColorStop(1, 'rgba(255,120,40,0)');
        c.fillStyle = bg;
        c.beginPath(); c.arc(b.x, b.y, b.r * 3.6, 0, Math.PI * 2); c.fill();
        // 星芒
        c.strokeStyle = 'rgba(255,250,230,.55)';
        c.lineWidth = 1.4;
        c.beginPath();
        c.moveTo(b.x - b.r * 2.4, b.y); c.lineTo(b.x + b.r * 2.4, b.y);
        c.moveTo(b.x, b.y - b.r * 2.4); c.lineTo(b.x, b.y + b.r * 2.4);
        c.stroke();
      }
      c.restore();
    }

    // 挥砍 / 旋风 / 扩散环 / 光柱 / 冲击波
    for (var efI = 0; efI < G.effects.length; efI++) {
      var ef = G.effects[efI];
      var kk = clamp(ef.t / ef.life, 0, 1);
      if (ef.kind === 'slash') {
        var tintSet = ef.tint === 'holy' ? ['255,246,200', '255,215,120', '255,180,60']
          : ef.tint === 'shadow' ? ['220,170,255', '160,80,240', '90,30,170']
          : ['255,250,230', '255,240,200', '200,220,255'];
        c.save();
        c.translate(ef.x, ef.y);
        c.rotate(ef.ang);
        c.globalCompositeOperation = 'lighter';
        // 外层宽光
        var grd = c.createLinearGradient(0, 0, ef.range, 0);
        grd.addColorStop(0, 'rgba(' + tintSet[0] + ',0)');
        grd.addColorStop(.55, 'rgba(' + tintSet[0] + ',' + (1 - kk) * .55 + ')');
        grd.addColorStop(1, 'rgba(' + tintSet[2] + ',0)');
        c.strokeStyle = grd;
        c.lineWidth = 15 * (1 - kk) + 1.5;
        c.beginPath();
        c.arc(0, 0, ef.range * .85, -ef.arc / 2, ef.arc / 2);
        c.stroke();
        // 内层锐利白芯
        c.strokeStyle = 'rgba(255,255,255,' + (1 - kk) * .75 + ')';
        c.lineWidth = 2.2 * (1 - kk) + .6;
        c.beginPath();
        c.arc(0, 0, ef.range * .82, -ef.arc / 2 * .92, ef.arc / 2 * .92);
        c.stroke();
        // 末端飞溅
        if (kk < .6) {
          for (var sp2 = 0; sp2 < 3; sp2++) {
            var sa2 = -ef.arc / 2 + (ef.arc * (sp2 + .5) / 3);
            c.fillStyle = 'rgba(' + tintSet[1] + ',' + (1 - kk) * .5 + ')';
            c.beginPath();
            c.arc(Math.cos(sa2) * ef.range * .85, Math.sin(sa2) * ef.range * .85, 2.4 * (1 - kk), 0, Math.PI * 2);
            c.fill();
          }
        }
        c.restore();
      } else if (ef.kind === 'whirl') {
        c.save();
        c.translate(p.x, p.y - 26);
        c.globalCompositeOperation = 'lighter';
        c.rotate(t * 3.2);
        for (var w = 0; w < 5; w++) {
          var a0 = t * 18 + w * 1.25;
          c.strokeStyle = 'rgba(255,240,200,' + (1 - kk) * (.32 - w * .045) + ')';
          c.lineWidth = 4.5 - w * .6;
          c.beginPath();
          c.arc(0, 0, 62 + w * 13, a0, a0 + 1.5);
          c.stroke();
        }
        // 内圈风压
        var wg3 = c.createRadialGradient(0, 0, 8, 0, 0, 100);
        wg3.addColorStop(0, 'rgba(255,235,190,0)');
        wg3.addColorStop(.7, 'rgba(255,220,160,' + .08 * (1 - kk) + ')');
        wg3.addColorStop(1, 'rgba(255,200,120,0)');
        c.fillStyle = wg3;
        c.beginPath(); c.ellipse(0, 0, 100, 60, 0, 0, Math.PI * 2); c.fill();
        c.restore();
      } else if (ef.kind === 'ring') {
        c.globalCompositeOperation = 'lighter';
        // 主环
        var ease = Math.sqrt(kk);
        var rr = lerp(ef.r, ef.max, ease);
        c.strokeStyle = ef.color + (1 - kk) * .85 + ')';
        c.lineWidth = 4.2 * (1 - kk) + .6;
        c.beginPath(); c.ellipse(ef.x, ef.y, rr, rr * .62, 0, 0, Math.PI * 2); c.stroke();
        // 冲击带：第二圈稍慢，做出厚度
        if (ef.max > 60) {
          var rr2 = lerp(ef.r, ef.max, Math.sqrt(Math.max(0, kk - .16)));
          c.strokeStyle = ef.color + (1 - kk) * .32 + ')';
          c.lineWidth = 9 * (1 - kk) + .5;
          c.beginPath(); c.ellipse(ef.x, ef.y, rr2, rr2 * .62, 0, 0, Math.PI * 2); c.stroke();
        }
        // 环内闪白
        if (kk < .3) {
          var fg = c.createRadialGradient(ef.x, ef.y, 2, ef.x, ef.y, rr);
          fg.addColorStop(0, ef.color + (.3 * (1 - kk / .3)) + ')');
          fg.addColorStop(1, ef.color + '0)');
          c.fillStyle = fg;
          c.beginPath(); c.ellipse(ef.x, ef.y, rr, rr * .62, 0, 0, Math.PI * 2); c.fill();
        }
        c.globalCompositeOperation = 'source-over';
      } else if (ef.kind === 'sparks') {
        c.save();
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = 1 - kk;
        c.strokeStyle = ef.color;
        for (var sk2 = 0; sk2 < ef.n; sk2++) {
          var ska = sk2 / ef.n * Math.PI * 2 + ef.x * .07;
          var r0 = 8 + kk * 46, r1 = r0 + 12 * (1 - kk) + 4;
          c.lineWidth = 2 * (1 - kk) + .5;
          c.beginPath();
          c.moveTo(ef.x + Math.cos(ska) * r0, ef.y + Math.sin(ska) * r0);
          c.lineTo(ef.x + Math.cos(ska) * r1, ef.y + Math.sin(ska) * r1);
          c.stroke();
        }
        c.restore();
      } else if (ef.kind === 'spark') {
        c.save();
        c.translate(ef.x, ef.y);
        c.rotate(ef.ang);
        c.globalCompositeOperation = 'lighter';
        var sg3 = c.createRadialGradient(4, 0, 0, 4, 0, 26);
        sg3.addColorStop(0, 'rgba(255,255,240,' + (1 - kk) + ')');
        sg3.addColorStop(.4, 'rgba(' + ef.color + ',' + (1 - kk) * .8 + ')');
        sg3.addColorStop(1, 'rgba(255,200,120,0)');
        c.fillStyle = sg3;
        c.beginPath(); c.ellipse(4, 0, 15 + kk * 16, 9 + kk * 8, 0, 0, Math.PI * 2); c.fill();
        c.restore();
      } else if (ef.kind === 'beam') {
        c.save();
        c.translate(ef.x, ef.y);
        c.rotate(ef.ang);
        c.globalCompositeOperation = 'lighter';
        var bg2 = c.createLinearGradient(0, 0, ef.len, 0);
        bg2.addColorStop(0, 'rgba(' + ef.color + ',' + (1 - kk) * .8 + ')');
        bg2.addColorStop(.7, 'rgba(' + ef.color + ',' + (1 - kk) * .35 + ')');
        bg2.addColorStop(1, 'rgba(' + ef.color + ',0)');
        c.fillStyle = bg2;
        c.beginPath();
        c.moveTo(0, -18 - (1 - kk) * 8);
        c.lineTo(ef.len, -5);
        c.lineTo(ef.len, 5);
        c.lineTo(0, 18 + (1 - kk) * 8);
        c.closePath();
        c.fill();
        c.fillStyle = 'rgba(255,255,255,' + (1 - kk) * .35 + ')';
        c.fillRect(0, -2.5, ef.len * (.4 + kk * .6), 5);
        c.restore();
      } else if (ef.kind === 'pillar') {
        var pk = ef.t / ef.life;
        c.save();
        c.globalCompositeOperation = 'lighter';
        // 落点预警圈
        if (pk < .45) {
          var warn = pk / .45;
          c.strokeStyle = 'rgba(255,240,190,' + (.3 + warn * .5) + ')';
          c.lineWidth = 2 + warn * 2;
          c.beginPath(); c.ellipse(ef.x, ef.y, ef.radius * (.4 + warn * .6), ef.radius * .6 * (.4 + warn * .6), 0, 0, Math.PI * 2); c.stroke();
        }
        // 光柱
        var pkm = clamp((pk - .35) / .65, 0, 1);
        var pw2 = Math.sin(pkm * Math.PI);
        var pg3 = c.createLinearGradient(ef.x, ef.y - 460, ef.x, ef.y);
        pg3.addColorStop(0, 'rgba(255,250,220,0)');
        pg3.addColorStop(.55, 'rgba(255,240,190,' + pw2 * .5 + ')');
        pg3.addColorStop(1, 'rgba(255,220,140,' + pw2 * .85 + ')');
        c.fillStyle = pg3;
        c.beginPath();
        c.moveTo(ef.x - ef.radius * .28, ef.y - 460);
        c.lineTo(ef.x + ef.radius * .28, ef.y - 460);
        c.lineTo(ef.x + ef.radius * .78, ef.y);
        c.lineTo(ef.x - ef.radius * .78, ef.y);
        c.closePath();
        c.fill();
        c.fillStyle = 'rgba(255,255,255,' + pw2 * .5 + ')';
        c.beginPath();
        c.moveTo(ef.x - ef.radius * .1, ef.y - 460);
        c.lineTo(ef.x + ef.radius * .1, ef.y - 460);
        c.lineTo(ef.x + ef.radius * .2, ef.y);
        c.lineTo(ef.x - ef.radius * .2, ef.y);
        c.closePath();
        c.fill();
        c.restore();
      } else if (ef.kind === 'ward') {
        c.save();
        c.translate(ef.x, ef.y - 26);
        c.globalCompositeOperation = 'lighter';
        var wk = 1 - kk;
        var wr = ef.r * (1 + .1 * Math.sin(t * 9));
        var wgr = c.createRadialGradient(0, 0, wr * .5, 0, 0, wr);
        wgr.addColorStop(0, 'rgba(255,240,190,0)');
        wgr.addColorStop(.75, 'rgba(255,230,160,' + .18 * wk + ')');
        wgr.addColorStop(1, 'rgba(255,210,110,' + .42 * wk + ')');
        c.fillStyle = wgr;
        c.beginPath(); c.arc(0, 0, wr, 0, Math.PI * 2); c.fill();
        c.strokeStyle = 'rgba(255,238,180,' + .65 * wk + ')';
        c.lineWidth = 2;
        c.beginPath(); c.arc(0, 0, wr, 0, Math.PI * 2); c.stroke();
        // 六边形符文
        c.strokeStyle = 'rgba(255,246,210,' + .5 * wk + ')';
        c.lineWidth = 1.4;
        c.beginPath();
        for (var hx = 0; hx < 6; hx++) {
          var ha = t * .8 + hx / 6 * Math.PI * 2;
          var hxx = Math.cos(ha) * wr * .82, hyy = Math.sin(ha) * wr * .82;
          if (hx === 0) c.moveTo(hxx, hyy); else c.lineTo(hxx, hyy);
        }
        c.closePath();
        c.stroke();
        c.restore();
      } else if (ef.kind === 'telegraph') {
        var tkg = 1 - kk;
        c.save();
        c.globalCompositeOperation = 'lighter';
        c.strokeStyle = 'rgba(255,90,50,' + (.25 + kk * .55) + ')';
        c.lineWidth = 2.5;
        c.beginPath(); c.ellipse(ef.x, ef.y, ef.r, ef.r * .6, 0, 0, Math.PI * 2); c.stroke();
        var fillR = ef.r * (1 - kk);
        c.fillStyle = 'rgba(255,70,30,' + (.1 + kk * .2) + ')';
        c.beginPath(); c.ellipse(ef.x, ef.y, fillR, fillR * .6, 0, 0, Math.PI * 2); c.fill();
        c.restore();
      } else if (ef.kind === 'crack') {
        c.save();
        c.globalCompositeOperation = 'lighter';
        var ck2 = 1 - kk;
        c.strokeStyle = 'rgba(255,150,70,' + ck2 * .8 + ')';
        c.lineWidth = 2.4 * ck2 + .6;
        for (var cj = 0; cj < 7; cj++) {
          var ca = cj / 7 * Math.PI * 2 + ef.x * .01;
          c.beginPath();
          c.moveTo(ef.x, ef.y);
          c.lineTo(ef.x + Math.cos(ca) * ef.r * .55, ef.y + Math.sin(ca) * ef.r * .36);
          c.lineTo(ef.x + Math.cos(ca + .15) * ef.r, ef.y + Math.sin(ca + .15) * ef.r * .6);
          c.stroke();
        }
        c.restore();
      } else if (ef.kind === 'summon') {
        var smk = 1 - kk;
        c.save();
        c.globalCompositeOperation = 'lighter';
        var smg = c.createRadialGradient(ef.x, ef.y - 20, 2, ef.x, ef.y - 20, 46);
        smg.addColorStop(0, ef.color + smk * .7 + ')');
        smg.addColorStop(1, ef.color + '0)');
        c.fillStyle = smg;
        c.beginPath(); c.ellipse(ef.x, ef.y - 20, 26 + kk * 14, 38 + kk * 18, 0, 0, Math.PI * 2); c.fill();
        c.strokeStyle = 'rgba(190,150,255,' + smk * .7 + ')';
        c.lineWidth = 2;
        c.beginPath(); c.ellipse(ef.x, ef.y, 26 * (1 - kk) + 6, 9 * (1 - kk) + 3, 0, 0, Math.PI * 2); c.stroke();
        c.restore();
      }
    }

    // 粒子
    for (var qI = 0; qI < G.parts.length; qI++) {
      var q = G.parts[qI];
      var qa = 1 - q.t / q.life;
      c.globalAlpha = qa;
      if (q.line) {
        c.strokeStyle = q.color;
        c.lineWidth = 2;
        c.beginPath(); c.moveTo(q.x, q.y); c.lineTo(q.x, q.y + 22); c.stroke();
      } else if (q.glow) {
        c.globalCompositeOperation = 'lighter';
        c.fillStyle = q.color;
        c.beginPath(); c.arc(q.x, q.y, q.size * qa * 1.8, 0, Math.PI * 2); c.fill();
        c.globalAlpha = qa * .5;
        c.beginPath(); c.arc(q.x, q.y, q.size * qa * 3.4, 0, Math.PI * 2); c.fill();
        c.globalCompositeOperation = 'source-over';
      } else {
        c.fillStyle = q.color;
        c.beginPath(); c.arc(q.x, q.y, q.size * qa, 0, Math.PI * 2); c.fill();
      }
    }
    c.globalAlpha = 1;

    // 飘字
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (var tI = 0; tI < G.texts.length; tI++) {
      var tx = G.texts[tI];
      var ta = 1 - Math.pow(tx.t / tx.life, 2);
      c.globalAlpha = ta;
      c.font = '900 ' + tx.size + 'px "PingFang SC", system-ui, sans-serif';
      c.lineWidth = 3;
      c.strokeStyle = 'rgba(0,0,0,.75)';
      c.strokeText(tx.text, tx.x, tx.y);
      c.fillStyle = tx.color;
      c.fillText(tx.text, tx.x, tx.y);
    }
    c.globalAlpha = 1;

    c.restore();

    // ---- 光照 ----
    drawLighting(t);
  }

  function drawLighting(t) {
    if (!G) return;
    var dpr = RENDER_DPR;
    var p = G.p;
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.globalCompositeOperation = 'source-over';
    lctx.fillStyle = 'rgba(7,6,5,.6)';
    lctx.fillRect(0, 0, lightCv.width, lightCv.height);
    lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    lctx.globalCompositeOperation = 'destination-out';

    function hole(wx, wy, r, str, ry) {
      var x = wx - cam.x, y = wy - cam.y;
      if (x < -r * 2 || x > W + r * 2 || y < -r * 2 || y > H + r * 2) return;
      var g = lctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(0,0,0,' + str + ')');
      g.addColorStop(.55, 'rgba(0,0,0,' + (str * .55) + ')');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      lctx.save();
      lctx.translate(x, y);
      lctx.scale(1, ry || .68);
      lctx.translate(-x, -y);
      lctx.fillStyle = g;
      lctx.beginPath(); lctx.arc(x, y, r, 0, Math.PI * 2); lctx.fill();
      lctx.restore();
    }

    // 玩家提灯
    hole(p.x, p.y - 18, 300 + Math.sin(t * 2.3) * 6, 1, .74);
    // 火把
    for (var i = 0; i < G.props.length; i++) {
      var tp = G.props[i];
      if (tp.kind !== 'torch') continue;
      var fl = 1 + Math.sin(t * 7 + tp.seed) * .06 + Math.sin(t * 13.7 + tp.seed * 2) * .035;
      hole(tp.x, tp.y - 34, 235 * fl, .88, .7);
    }
    // 传送门
    if (G.portal) hole(G.portal.x, G.portal.y - 34, G.portal.open ? 210 : 120, G.portal.open ? .75 : .35, .7);
    // 投射物发光
    for (var b = 0; b < G.bullets.length; b++) {
      var bb = G.bullets[b];
      if (!bb.hostile) hole(bb.x, bb.y, 70, .5, 1);
    }
    // 爆炸 / 火光特效
    for (var e = 0; e < G.effects.length; e++) {
      var ef = G.effects[e];
      if (ef.kind === 'meteor') hole(ef.x, ef.y, ef.radius * 1.2, .55, .7);
      if (ef.kind === 'ring') hole(ef.x, ef.y, ef.max * .7, .25 * (1 - ef.t / ef.life), 1);
      if (ef.kind === 'poison') hole(ef.x, ef.y, ef.r, .18, .7);
      if (ef.kind === 'holyfire') hole(ef.x, ef.y, ef.r * 1.05, .34, .7);
      if (ef.kind === 'sanctuary') hole(ef.x, ef.y, ef.r * 1.15, .42, .7);
      if (ef.kind === 'curse') hole(ef.x, ef.y, ef.r * .8, .16, .7);
      if (ef.kind === 'rift') hole(ef.x, ef.y, ef.r, .26, .7);
      if (ef.kind === 'pillar') hole(ef.x, ef.y, ef.radius * 1.2, .5, .8);
      if (ef.kind === 'spark' || ef.kind === 'beam') hole(ef.x, ef.y, 90, .22, 1);
    }

    lctx.globalCompositeOperation = 'source-over';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(lightCv, 0, 0);

    // 屏幕闪光（Boss 登场 / 天罚 / 虚空）
    if (G.flash) {
      var fk = 1 - G.flash.t / G.flash.life;
      ctx.setTransform(RENDER_DPR, 0, 0, RENDER_DPR, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      var fgd = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * .72);
      fgd.addColorStop(0, 'rgba(' + G.flash.color + ',' + G.flash.a * fk + ')');
      fgd.addColorStop(1, 'rgba(' + G.flash.color + ',0)');
      ctx.fillStyle = fgd;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
    }
    // 低血量红色暗角
    if (G.p && !G.p.dead && G.p.hp / G.p.maxhp < .3) {
      var vk = 1 - G.p.hp / G.p.maxhp / .3;
      var vp = .28 + Math.sin(t * 5) * .07;
      ctx.setTransform(RENDER_DPR, 0, 0, RENDER_DPR, 0, 0);
      var vgd = ctx.createRadialGradient(W / 2, H / 2, H * .32, W / 2, H / 2, H * .82);
      vgd.addColorStop(0, 'rgba(140,10,10,0)');
      vgd.addColorStop(1, 'rgba(150,12,12,' + vk * vp + ')');
      ctx.fillStyle = vgd;
      ctx.fillRect(0, 0, W, H);
    }
    // 中毒绿边
    if (G.p && G.p.poisonT > 0) {
      ctx.setTransform(RENDER_DPR, 0, 0, RENDER_DPR, 0, 0);
      var pgd = ctx.createRadialGradient(W / 2, H / 2, H * .36, W / 2, H / 2, H * .84);
      pgd.addColorStop(0, 'rgba(60,140,40,0)');
      pgd.addColorStop(1, 'rgba(70,150,40,' + Math.min(.3, G.p.poisonT * .09) + ')');
      ctx.fillStyle = pgd;
      ctx.fillRect(0, 0, W, H);
    }
  }

  /* ---------- 小地图 ---------- */
  var miniCv = document.getElementById('mini');
  var miniCtx = miniCv.getContext('2d');
  function renderMinimap() {
    if (!map) return;
    var c = miniCtx;
    var w = miniCv.width, h = miniCv.height;
    c.fillStyle = '#0c0a08';
    c.fillRect(0, 0, w, h);
    var sc = Math.min(w / map.w, h / map.h);
    var ox = (w - map.w * sc) / 2, oy = (h - map.h * sc) / 2;
    for (var y = 0; y < map.h; y++)
      for (var x = 0; x < map.w; x++) {
        if (map.tiles[y * map.w + x]) continue;
        c.fillStyle = '#4a4034';
        c.fillRect(ox + x * sc, oy + y * sc, Math.ceil(sc), Math.ceil(sc));
      }
    // 房间边界淡描
    c.strokeStyle = 'rgba(230,180,90,.14)';
    c.lineWidth = 1;
    map.rooms.forEach(function (r) {
      c.strokeRect(ox + r.x * sc, oy + r.y * sc, r.w * sc, r.h * sc);
    });
  }
  var miniT = 0;
  function renderMiniLive(t) {
    if (!map || !G) return;
    miniT += 1;
    if (miniT % 6) {
      // 在底图上叠层：重画底图成本高，改为每个偶发帧整体重绘
    }
    if (miniT % 8) return;
    renderMinimap();
    var c = miniCtx;
    var w = miniCv.width, h = miniCv.height;
    var sc = Math.min(w / map.w, h / map.h);
    var ox = (w - map.w * sc) / 2, oy = (h - map.h * sc) / 2;
    // 敌人
    for (var i = 0; i < G.enemies.length; i++) {
      var e = G.enemies[i];
      if (e.dead) continue;
      c.fillStyle = e.boss ? '#ff6a30' : e.elite ? '#ffb040' : '#d04030';
      var r = e.boss ? 3.5 : 1.8;
      c.beginPath();
      c.arc(ox + e.x / TILE * sc, oy + e.y / TILE * sc, r, 0, Math.PI * 2);
      c.fill();
    }
    // 传送门
    if (G.portal) {
      c.fillStyle = G.portal.open ? '#7fd0ff' : 'rgba(90,140,200,.4)';
      c.beginPath();
      c.arc(ox + G.portal.x / TILE * sc, oy + G.portal.y / TILE * sc, G.portal.open ? 3.5 : 2, 0, Math.PI * 2);
      c.fill();
    }
    // 玩家
    var p = G.p;
    c.fillStyle = '#ffe08a';
    c.beginPath();
    c.arc(ox + p.x / TILE * sc, oy + p.y / TILE * sc, 2.6, 0, Math.PI * 2);
    c.fill();
  }

  /* ---------- 输入 ---------- */
  var input = { left: false, right: false, up: false, down: false, attack: false, attackHeld: false, joy: null };

  function localPoint(e) {
    var r = frame.getBoundingClientRect();
    var sx2 = e.clientX != null ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : null);
    var sy2 = e.clientY != null ? e.clientY : (e.touches && e.touches[0] ? e.touches[0].clientY : null);
    if (sx2 == null || sy2 == null) return null;
    var cx = sx2 - r.left;
    var cy = sy2 - r.top;
    var s = r.width / 1120;
    return { x: cx / s, y: cy / s };
  }

  canvas.addEventListener('mousemove', function (e) {
    var pt = localPoint(e);
    if (!pt) return;
    mouse.x = pt.x; mouse.y = pt.y; mouse.inside = true;
  });
  canvas.addEventListener('mouseleave', function () { mouse.inside = false; });
  canvas.addEventListener('mousedown', function (e) {
    if (mode !== 'play' || !G) return;
    AU.resume();
    var pt = localPoint(e);
    if (pt) { mouse.x = pt.x; mouse.y = pt.y; mouse.inside = true; }
    if (e.button === 2) {
      e.preventDefault();
      castSkill(0);
      return;
    }
    if (e.button !== 0) return;
    e.preventDefault();
    handleLeftClick();
    input.attackHeld = true;
  });
  window.addEventListener('mouseup', function (e) {
    if (e.button === 0) input.attackHeld = false;
  });
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  function handleLeftClick() {
    if (!G || mode !== 'play') return;
    var p = G.p;
    var wm = worldMouse();
    // 近战/远程统一点击即攻击；若点到远处空地则先移动再打
    var nearest = null, nd = 1e9;
    for (var i = 0; i < G.enemies.length; i++) {
      var en = G.enemies[i];
      if (en.dead) continue;
      // 点击容差放宽：暗黑式操作不该要求像素级点中（以身体中心为准）
      var d = Math.hypot(en.x - wm.x, en.y - en.r - wm.y);
      if (d < en.r + 44 && d < nd) { nd = d; nearest = en; }
    }
    if (nearest) {
      // 锁定目标：自动走进射程并持续攻击，直到它死、玩家点地或按方向键
      p.autoTarget = nearest;
      p.path = [];
      p.repathT = 0;
      mouse.x = nearest.x - cam.x; mouse.y = nearest.y - nearest.r - cam.y;
    } else {
      // 点地寻路
      p.autoTarget = null;
      var tx = Math.floor(wm.x / TILE), ty = Math.floor(wm.y / TILE);
      if (!isWall(tx, ty)) {
        var path = findPath(Math.floor(p.x / TILE), Math.floor(p.y / TILE), tx, ty);
        p.path = path;
        if (path.length) {
          addEffect({ kind: 'ring', x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2, r: 4, max: 20, t: 0, life: .35, color: 'rgba(230,200,140,' });
        }
      }
    }
  }

  document.addEventListener('keydown', function (e) {
    var k = e.key.toLowerCase();
    if (k === 'tab') { e.preventDefault(); toggleInventory(); return; }
    if (k === 'escape') { e.preventDefault(); if (mode === 'inv') toggleInventory(); else if (mode === 'play') togglePause(); else if (mode === 'pause') togglePause(); return; }
    if (mode !== 'play') {
      if (k === ' ' && mode === 'dead') { e.preventDefault(); startGame(G ? G.p.cls : 'knight'); }
      return;
    }
    if (k === 'w' || k === 'arrowup') { input.up = true; e.preventDefault(); }
    else if (k === 's' || k === 'arrowdown') { input.down = true; e.preventDefault(); }
    else if (k === 'a' || k === 'arrowleft') { input.left = true; e.preventDefault(); }
    else if (k === 'd' || k === 'arrowright') { input.right = true; e.preventDefault(); }
    else if (k === 'q') castSkill(1);
    else if (k === 'e') castSkill(2);
    else if (k === 'r') castSkill(3);
    else if (k === ' ') { e.preventDefault(); drinkPotion(); }
    else if (k === 'm') toggleSound();
    else if (k === 'i') toggleInventory();
    else if (k === 'f') toggleFullscreen();
    else if (k >= '1' && k <= '4') castSkill(+k - 1);
  });
  document.addEventListener('keyup', function (e) {
    var k = e.key.toLowerCase();
    if (k === 'w' || k === 'arrowup') input.up = false;
    if (k === 's' || k === 'arrowdown') input.down = false;
    if (k === 'a' || k === 'arrowleft') input.left = false;
    if (k === 'd' || k === 'arrowright') input.right = false;
  });

  /* ---------- 触屏摇杆 ---------- */
  (function bindTouch() {
    var stick = document.getElementById('stick');
    var knob = document.getElementById('stick-knob');
    if (!stick) return;
    var active = null, cx = 0, cy = 0, R = 48;
    stick.addEventListener('pointerdown', function (e) {
      active = e.pointerId;
      var r = stick.getBoundingClientRect();
      cx = r.left + r.width / 2; cy = r.top + r.height / 2;
      R = r.width * .36;
      stick.setPointerCapture(e.pointerId);
      AU.init(); AU.resume();
      e.preventDefault();
    });
    stick.addEventListener('pointermove', function (e) {
      if (e.pointerId !== active) return;
      var dx = e.clientX - cx, dy = e.clientY - cy;
      var l = Math.hypot(dx, dy) || 1;
      var k = Math.min(1, l / R);
      input.joy = { x: dx / l * k, y: dy / l * k };
      knob.style.transform = 'translate(' + (dx / l * k * R) + 'px,' + (dy / l * k * R) + 'px)';
      e.preventDefault();
    });
    function end(e) {
      if (e.pointerId !== active) return;
      active = null; input.joy = null;
      knob.style.transform = '';
    }
    stick.addEventListener('pointerup', end);
    stick.addEventListener('pointercancel', end);

    var atk = document.getElementById('t-atk');
    atk.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      AU.init(); AU.resume();
      // 攻击离玩家最近的怪，否则朝摇杆方向
      var p = G && G.p;
      if (p) {
        var best = null, bd = 1e9;
        for (var i = 0; i < G.enemies.length; i++) {
          var en = G.enemies[i];
          if (en.dead) continue;
          var d = dist2(en, p);
          if (d < bd) { bd = d; best = en; }
        }
        var sp = playerScreenPos();
        if (best && bd < 700 * 700) { mouse.x = best.x - cam.x; mouse.y = best.y - cam.y; }
        else if (input.joy) { mouse.x = sp.x + input.joy.x * 200; mouse.y = sp.y + input.joy.y * 200; }
      }
      input.attackHeld = true;
    });
    atk.addEventListener('pointerup', function () { input.attackHeld = false; });
    atk.addEventListener('pointercancel', function () { input.attackHeld = false; });
    document.querySelectorAll('.tbtn.sk').forEach(function (b) {
      b.addEventListener('pointerdown', function (e) {
        e.preventDefault(); AU.init(); AU.resume();
        if (input.joy) {
          var sp = playerScreenPos();
          mouse.x = sp.x + input.joy.x * 200; mouse.y = sp.y + input.joy.y * 200;
        }
        castSkill(+b.getAttribute('data-skill'));
      });
    });
    var pot = document.getElementById('t-potion');
    pot.addEventListener('pointerdown', function (e) { e.preventDefault(); drinkPotion(); });
  })();

  /* ---------- HUD ---------- */
  var hudEls = {};
  function cacheHud() {
    ['hud-depth', 'hud-floor', 'hud-gold', 'hud-lvl', 'hud-kills',
      'life-fill', 'life-num', 'life-max', 'mana-fill', 'mana-num', 'mana-max',
      'xp-fill', 'potion-num', 'skill-bar', 'boss-bar', 'boss-fill', 'boss-name',
      'potion-badge', 'mini-label', 'hud-clear'].forEach(function (id) {
      hudEls[id] = document.getElementById(id);
    });
  }
  cacheHud();

  function buildSkillBar() {
    var bar = hudEls['skill-bar'];
    if (!bar || !G) return;
    var p = G.p;
    bar.innerHTML = '';
    var bkey = 'sk' + (D.CLASSES[p.cls].basicKey || 'K1');
    var atkIcon = D.CLASSES[p.cls].icon || '⚔️';
    var basic = document.createElement('div');
    basic.className = 'skill basic';
    basic.innerHTML = '<span class="key">LMB</span><span class="ic">' + atkIcon + '</span>';
    basic.title = T(bkey) + ' — ' + T(bkey + 'd');
    bar.appendChild(basic);
    var keys = ['RMB', 'Q', 'W', 'E'];
    p.skills.forEach(function (s, i) {
      var el = document.createElement('div');
      el.className = 'skill';
      el.setAttribute('data-i', i);
      el.innerHTML = '<span class="key">' + keys[i] + '</span><span class="ic">' + (SKILL_ICON[s.key] || '✨') + '</span>' +
        '<span class="cost">' + s.mana + '</span><span class="cd-mask"></span><span class="cd-num"></span>';
      el.title = T('sk' + s.key) + ' — ' + T('sk' + s.key + 'd');
      el.addEventListener('click', function () { castSkill(i); });
      bar.appendChild(el);
    });
    // 触屏技能按钮显隐
    var tbs = document.querySelectorAll('.tbtn.sk');
    tbs.forEach(function (b, i) {
      b.classList.toggle('on', i < p.skills.length);
      var s = p.skills[i];
      if (s) b.textContent = SKILL_ICON[s.key] || '✨';
    });
  }

  function updateHud(force) {
    if (!G) return;
    var p = G.p;
    function set(id, v) { var el = hudEls[id]; if (el) el.textContent = v; }
    hudEls['hud-depth'].textContent = G.depth;
    hudEls['hud-floor'].textContent = T(D.floorName(G.depth));
    hudEls['hud-gold'].textContent = fmt(p.gold);
    hudEls['hud-lvl'].textContent = p.lv;
    hudEls['hud-kills'].textContent = '☠ ' + p.kills;
    hudEls['life-num'].textContent = Math.max(0, Math.ceil(p.hp));
    hudEls['life-max'].textContent = '/' + p.maxhp;
    hudEls['mana-num'].textContent = Math.max(0, Math.floor(p.mp));
    hudEls['mana-max'].textContent = '/' + p.maxmp;
    hudEls['life-fill'].style.height = clamp(p.hp / p.maxhp, 0, 1) * 100 + '%';
    var orbEl = document.getElementById('orb-life');
    if (orbEl) orbEl.classList.toggle('low', p.hp / p.maxhp < .3 && !p.dead);
    hudEls['mana-fill'].style.height = clamp(p.mp / p.maxmp, 0, 1) * 100 + '%';
    hudEls['xp-fill'].style.width = clamp(p.xp / p.xpNext, 0, 1) * 100 + '%';
    hudEls['potion-num'].textContent = p.potions;
    hudEls['potion-badge'].classList.toggle('empty', p.potions <= 0);
    // Boss 血条
    if (G.boss && !G.boss.dead) {
      hudEls['boss-bar'].classList.remove('hidden');
      hudEls['boss-name'].textContent = (G.boss.elite ? T('elite') + ' ' : '') + T(G.boss.kind);
      hudEls['boss-fill'].style.width = clamp(G.boss.hp / G.boss.maxhp, 0, 1) * 100 + '%';
    } else {
      hudEls['boss-bar'].classList.add('hidden');
    }
    // 技能冷却
    var bar = hudEls['skill-bar'];
    if (bar) {
      var nodes = bar.querySelectorAll('.skill[data-i]');
      p.skills.forEach(function (s, i) {
        var el = nodes[i];
        if (!el) return;
        var frac = s.cdT > 0 ? clamp(s.cdT / (s.cd * (1 + p.b.cdMult)), 0, 1) : 0;
        el.querySelector('.cd-mask').style.height = frac * 100 + '%';
        var num = el.querySelector('.cd-num');
        num.textContent = s.cdT > 0 ? (s.cdT > 1 ? Math.ceil(s.cdT) : s.cdT.toFixed(1)) : '';
        el.classList.toggle('no-mana', p.mp < s.mana);
        // 冷却完成的一瞬闪一下
        if (el._wasCd > 0 && s.cdT <= 0) {
          el.classList.remove('cool'); void el.offsetWidth; el.classList.add('cool');
        }
        el._wasCd = s.cdT;
      });
    }
    if (force) {
      renderMiniStats();
      renderGearMini();
    }
  }
  var hudT = 0;
  function updateHudThrottled() {
    hudT++;
    if (hudT % 6 === 0) { updateHud(); renderMiniLive(); }
  }

  function renderMiniStats() {
    var el = document.getElementById('mini-stats');
    if (!el || !G) return;
    var p = G.p;
    var rows = [
      [T('dmg'), Math.round(p.dmg)],
      [T('armor'), p.armor],
      [T('critChance'), Math.round(p.crit * 100) + '%'],
      [T('critDamage'), Math.round(p.critD * 100) + '%'],
      [T('moveSpeed'), Math.round(p.moveSpd)],
      [T('attackSpeed'), (1 / (1 / p.atkSpd)).toFixed(2) + '/s'],
      [T('lifeSteal'), (p.lifeSteal * 100).toFixed(1) + '%'],
      [T('goldFind'), Math.round(p.goldFind * 100) + '%']
    ];
    el.innerHTML = rows.map(function (r) { return '<div><span>' + r[0] + '</span><b>' + r[1] + '</b></div>'; }).join('');
  }

  function renderGearMini() {
    var el = document.getElementById('gear-mini');
    if (!el || !G) return;
    var p = G.p;
    var icons = { weapon: '🗡️', offhand: '🛡️', helm: '⛑️', chest: '🥋', boots: '👢', ring1: '💍', ring2: '💍', amulet: '📿' };
    el.innerHTML = D.SLOTS.map(function (s) {
      var it = p.gear[s];
      var col = it ? D.RARITY[it.rarity].color : '';
      var icon = it ? (icons[it.slotKind] || '❔') : (icons[s] || '❔');
      var label = it ? T(D.SLOT_LABEL[s]).slice(0, 2) : T(D.SLOT_LABEL[s]).slice(0, 2);
      return '<div class="g' + (it ? '' : ' empty') + '" style="' + (col ? 'border-color:' + col : '') + '" title="' + (it ? it.name : T(D.SLOT_LABEL[s])) + '">' + icon + '<small>' + label + '</small></div>';
    }).join('');
  }

  /* ---------- 背包 ---------- */
  var invSel = null;
  function toggleInventory() {
    if (!G) return;
    if (mode === 'play') {
      mode = 'inv';
      document.getElementById('ov-inv').classList.remove('hidden');
      invSel = null;
      renderInv();
      AU.sfx('ui');
    } else if (mode === 'inv') {
      mode = 'play';
      document.getElementById('ov-inv').classList.add('hidden');
      AU.sfx('ui');
    }
  }

  function itemStatLines(it) {
    var out = [];
    for (var k in it.stats) {
      var v = it.stats[k];
      var lbl = T(AFFIX_LABEL[k] || k);
      var val;
      if (k === 'crit' || k === 'critD' || k === 'moveSpd' || k === 'atkSpd' || k === 'magicFind' || k === 'goldFind' || k === 'skillPower' || k === 'dr') val = '+' + v + '%';
      else if (k === 'lifeSteal' || k === 'lifeReg') val = '+' + v + '%';
      else val = '+' + v;
      out.push({ label: lbl, val: val, k: k });
    }
    return out;
  }
  // 装备评分：把词缀折算成"等效输出/生存"，用于自动替换与对比箭头
  var SCORE_W = { dmg: 2.6, armor: 1.5, life: .42, mana: .16, crit: 3.2, critD: 1.1, moveSpd: .8, atkSpd: 2.2,
    lifeSteal: 4.5, thorns: .5, magicFind: .35, goldFind: .2, skillPower: 1.8, lifeReg: 1.6, dr: 8 };
  function gearScore(it) {
    if (!it) return 0;
    var s = 0;
    for (var k in it.stats) s += (it.stats[k] || 0) * (SCORE_W[k] || .5);
    if (it.legendary) s += 22;
    return s;
  }
  function slotForItem(p, it) {
    if (it.slotKind !== 'ring') return it.slotKind;
    if (!p.gear.ring1) return 'ring1';
    if (!p.gear.ring2) return 'ring2';
    return gearScore(p.gear.ring1) <= gearScore(p.gear.ring2) ? 'ring1' : 'ring2';
  }
  // 拾取时自动判断：空槽或明显更强就换上，换下的旧装备回到背包
  function autoConsider(p, it) {
    var slot = slotForItem(p, it);
    var cur = p.gear[slot];
    if (!cur || gearScore(it) > gearScore(cur) + 1e-6) {
      p.gear[slot] = it;
      if (cur) { p.bag = p.bag || []; p.bag.push(cur); }
      recompute(p);
      return true;
    }
    return false;
  }

  var AFFIX_LABEL = {
    armor: 'armor', dmg: 'dmg', life: 'health', mana: 'mana', crit: 'critChance', critD: 'critDamage',
    moveSpd: 'moveSpeed', atkSpd: 'attackSpeed', lifeSteal: 'lifeSteal', thorns: 'thorns',
    magicFind: 'magicFind', goldFind: 'goldFind', skillPower: 'skillPower', lifeReg: 'regen', dr: 'damageReduction'
  };

  function itemIcon(it) {
    var ic = { weapon: '🗡️', offhand: '🛡️', helm: '⛑️', chest: '🥋', boots: '👢', ring: '💍', amulet: '📿' };
    if (it.slotKind === 'weapon') {
      return G ? (D.CLASSES[G.p.cls].icon || '🗡️') : '🗡️';
    }
    return ic[it.slotKind] || '❔';
  }

  function renderInv() {
    if (!G) return;
    var p = G.p;
    document.getElementById('inv-gold').textContent = fmt(p.gold);
    // 装备槽
    var wrap = document.getElementById('equip-wrap');
    wrap.innerHTML = '';
    D.SLOTS.forEach(function (s) {
      var it = p.gear[s];
      var slotEl = document.createElement('div');
      slotEl.className = 'eq-slot' + (it ? '' : ' empty') + (invSel && invSel.slot === s ? ' sel' : '');
      slotEl.innerHTML = '<span class="eq-ic">' + (it ? itemIcon(it) : '') + '</span>' +
        (it ? '<span class="eq-rar" style="color:' + D.RARITY[it.rarity].color + '"></span>' : '') +
        (!it ? '<span style="font-size:10px;color:#8b7a60">' + T(D.SLOT_LABEL[s]) + '</span>' : '');
      slotEl.title = it ? it.name : T(D.SLOT_LABEL[s]);
      slotEl.addEventListener('click', function () {
        if (it) { invSel = { ref: it, slot: s, fromBag: false }; renderInv(); }
      });
      var info = document.createElement('div');
      info.className = 'eq-info';
      info.innerHTML = '<span class="n" style="color:' + (it ? D.RARITY[it.rarity].color : '#6b5a45') + '">' +
        (it ? it.name : T(D.SLOT_LABEL[s])) + '</span>' +
        '<span class="s">' + (it ? itemStatLines(it).slice(0, 2).map(function (l) { return l.label + ' ' + l.val; }).join(' · ') : '—') + '</span>';
      var row = document.createElement('div');
      row.className = 'eq-row';
      row.appendChild(slotEl);
      row.appendChild(info);
      wrap.appendChild(row);
    });
    // 属性
    var sl = document.getElementById('stat-list');
    sl.innerHTML = [
      [T('health'), Math.ceil(p.hp) + ' / ' + p.maxhp],
      [T('mana'), Math.floor(p.mp) + ' / ' + p.maxmp],
      [T('dmg'), Math.round(p.dmg)],
      [T('armor'), p.armor + ' (' + Math.round(p.armor / (p.armor + 140) * 100) + '%)'],
      [T('critChance'), Math.round(p.crit * 100) + '%'],
      [T('critDamage'), Math.round(p.critD * 100) + '%'],
      [T('attackSpeed'), p.atkSpd.toFixed(2) + '/s'],
      [T('moveSpeed'), Math.round(p.moveSpd)],
      [T('lifeSteal'), (p.lifeSteal * 100).toFixed(1) + '%'],
      [T('thorns'), Math.round(p.thorns)],
      [T('magicFind'), Math.round(p.magicFind * 100) + '%'],
      [T('goldFind'), Math.round(p.goldFind * 100) + '%'],
      [T('damageReduction'), Math.round(p.dr * 100) + '%'],
      [T('level'), p.lv + ' · ' + Math.floor(p.xp) + '/' + p.xpNext]
    ].map(function (r) { return '<li><span>' + r[0] + '</span><b>' + r[1] + '</b></li>'; }).join('');
    // 物品栏
    var grid = document.getElementById('bag-grid');
    grid.innerHTML = '';
    var bag = p.bag || [];
    for (var i = 0; i < 27; i++) {
      var cell = document.createElement('div');
      var it = bag[i];
      cell.className = 'bag-cell' + (it && invSel && invSel.ref === it ? ' sel' : '');
      if (it) {
        cell.style.color = D.RARITY[it.rarity].color;
        cell.innerHTML = '<span class="dot"></span>' + itemIcon(it);
        cell.title = it.name;
        (function (item) {
          cell.addEventListener('click', function () { invSel = { ref: item, fromBag: true }; renderInv(); });
        })(it);
      }
      grid.appendChild(cell);
    }
    document.getElementById('bag-empty').classList.toggle('hidden', bag.length > 0);
    // 详情
    var det = document.getElementById('item-detail');
    if (!invSel) { det.classList.add('hidden'); return; }
    det.classList.remove('hidden');
    var it2 = invSel.ref;
    document.getElementById('item-name').textContent = it2.name;
    document.getElementById('item-name').style.color = D.RARITY[it2.rarity].color;
    document.getElementById('item-slot').textContent = T(D.SLOT_LABEL[invSel.slot] || D.SLOT_LABEL[it2.slotKind]);
    document.getElementById('item-rar').textContent = T(D.RARITY[it2.rarity].key) + ' · ' + TF('itemLevel', it2.ilvl);
    document.getElementById('item-rar').style.color = D.RARITY[it2.rarity].color;
    var lines = itemStatLines(it2);
    document.getElementById('item-stats').innerHTML = lines.map(function (l) {
      return '<li>' + l.label + ' ' + l.val + '</li>';
    }).join('');
    var fl = document.getElementById('item-flavor');
    if (it2.legendary) {
      var lang = window.AMG ? AMG.lang : 'zh';
      fl.textContent = (D.LEGENDARY_DESC[lang] || D.LEGENDARY_DESC.zh)[it2.descKey] || '';
    } else fl.textContent = '';
    var eqBtn = document.getElementById('item-equip');
    var salBtn = document.getElementById('item-salvage');
    if (invSel.fromBag) {
      eqBtn.classList.remove('hidden');
      eqBtn.textContent = T('equip');
      eqBtn.onclick = function () { equipItem(invSel.ref, true); invSel = null; renderInv(); };
      salBtn.classList.remove('hidden');
      salBtn.textContent = T('sell') + ' (+' + Math.round(6 + it2.ilvl * 2 * (1 + it2.rarity * .5)) + ')';
      salBtn.onclick = function () {
        var price = Math.round(6 + it2.ilvl * 2 * (1 + it2.rarity * .5));
        G.p.gold += price;
        var idx = G.p.bag.indexOf(it2);
        if (idx >= 0) G.p.bag.splice(idx, 1);
        invSel = null;
        AU.sfx('gold');
        renderInv(); updateHud(true);
      };
    } else {
      eqBtn.classList.remove('hidden');
      eqBtn.textContent = T('unequip');
      eqBtn.onclick = function () { unequip(invSel.slot); invSel = null; renderInv(); };
      salBtn.classList.add('hidden');
    }
  }

  function unequip(slot) {
    var p = G.p;
    var it = p.gear[slot];
    if (!it) return;
    if ((p.bag || []).length >= 60) return;
    delete p.gear[slot];
    p.bag.push(it);
    recompute(p);
    updateHud(true);
    renderGearMini();
  }

  /* ---------- 祝福 ---------- */
  var blessChoices = [];
  function openBless() {
    var p = G.p;
    // 三选一（不重复）
    var pool = D.BLESSINGS.slice();
    blessChoices = [];
    var used = {};
    while (blessChoices.length < 3 && pool.length) {
      var total = 0;
      pool.forEach(function (b) { total += b.w; });
      var r = Math.random() * total, acc2 = 0, chosen = pool[0];
      for (var i = 0; i < pool.length; i++) { acc2 += pool[i].w; if (r <= acc2) { chosen = pool[i]; break; } }
      blessChoices.push(chosen);
      pool = pool.filter(function (b) { return b !== chosen; });
    }
    renderBless();
    document.getElementById('ov-bless').classList.remove('hidden');
    document.getElementById('bless-title').textContent = TF('floorBanner', G.depth + 1) + ' · ' + T(D.floorName(G.depth + 1));
    var rb = document.getElementById('bless-reroll');
    var cost = 20 + G.depth * 10;
    rb.textContent = TF('reroll', cost);
    rb.disabled = p.gold < cost;
    rb.onclick = function () {
      if (p.gold < cost) { AU.sfx('error'); return; }
      p.gold -= cost;
      openBless();
      updateHud(true);
    };
    document.getElementById('bless-skip').onclick = function () {
      finishBless(null);
    };
  }
  var BLESS_ICON = {
    bCrit: '🗡️', bLife: '❤️', bArmor: '🛡️', bSwift: '💨', bVamp: '🩸', bFire: '🔥',
    bThorn: '🌵', bGreed: '💰', bRegen: '🌿', bSkill: '🔮', bMana: '💧', bPotion: '🧪', bGlass: '💥'
  };
  function renderBless() {
    var host = document.getElementById('bless-cards');
    host.innerHTML = '';
    blessChoices.forEach(function (b) {
      var el = document.createElement('button');
      el.type = 'button';
      el.className = 'bless-card';
      el.innerHTML = '<span class="bi">' + (BLESS_ICON[b.id] || '✨') + '</span><b>' + T(b.id) + '</b><small>' + T(b.id + 'D') + '</small>';
      el.onclick = function () { finishBless(b); };
      host.appendChild(el);
    });
  }
  function finishBless(b) {
    var p = G.p;
    if (b) { b.apply(p); recompute(p); AU.sfx('levelup'); }
    document.getElementById('ov-bless').classList.add('hidden');
    G.depth++;
    G.bossSpawned = false;
    mode = 'play';
    flashScreen('fx-dive');
    enterFloor(G.depth);
  }

  /* ---------- 覆盖层 ---------- */
  // 屏幕切换时用 CSS 动画做一次"快门"，避免硬切
  function flashScreen(cls) {
    var el = frame;
    if (!el) return;
    el.classList.remove('fx-dive', 'fx-rise');
    void el.offsetWidth;
    el.classList.add(cls);
    setTimeout(function () { el.classList.remove(cls); }, 700);
  }

  function hideOv() {
    ['ov-menu', 'ov-bless', 'ov-inv', 'ov-pause', 'ov-dead'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });
  }
  function showHUD(on) {
    document.getElementById('hud').classList.toggle('hidden', !on);
  }

  function togglePause() {
    if (mode === 'play') {
      mode = 'pause';
      document.getElementById('ov-pause').classList.remove('hidden');
      document.getElementById('pause-sub').textContent = TF('depth', G.depth) + ' · ' + T(D.floorName(G.depth));
      AU.sfx('ui');
    } else if (mode === 'pause') {
      mode = 'play';
      document.getElementById('ov-pause').classList.add('hidden');
      AU.sfx('ui');
    }
  }

  function showDead() {
    var p = G.p;
    var isBest = G.depth >= save.best && G.depth > 1;
    document.getElementById('dead-record').classList.toggle('hidden', !isBest);
    var el = document.getElementById('dead-stats');
    var mins = Math.floor(p.playT / 60), secs = Math.floor(p.playT % 60);
    el.className = 'stat-list end';
    el.innerHTML = [
      [T('deepest'), TF('depth', G.depth)],
      [T('level'), p.lv],
      [T('kills'), p.kills],
      [T('gold'), fmt(p.gold)],
      [T('time'), mins + ':' + (secs < 10 ? '0' : '') + secs],
      [T('bestDepth'), TF('depth', save.best)]
    ].map(function (r) { return '<li><span>' + r[0] + '</span><b>' + r[1] + '</b></li>'; }).join('');
    document.getElementById('ov-dead').classList.remove('hidden');
  }

  /* ---------- 语言 / 主题 ---------- */
  function syncLang() {
    if (window.AMG) {
      AMG.apply(window.ABYSS_STR);
      AMG.mountBtn();
    }
    // 菜单职业卡
    var host = document.getElementById('hero-pick');
    if (host) {
      host.innerHTML = '';
      D.CLASS_ORDER.forEach(function (k) {
        var cls = D.CLASSES[k];
        var el = document.createElement('button');
        el.type = 'button';
        el.className = 'hero-card' + (menuCls === k ? ' on' : '');
        el.innerHTML = '<canvas width="148" height="172"></canvas>' +
          '<span class="hc-text"><b>' + T(cls.nameKey) + '</b>' +
          '<span class="hero-tag">' + T(cls.tagKey) + '</span>' +
          '<small>' + T(cls.descKey) + '</small></span>';
        // 预览立绘：借用美术层
        var cv = el.querySelector('canvas');
        var cx2 = cv.getContext('2d');
        cx2.setTransform(2, 0, 0, 2, 0, 0);
        ART.drawPlayer(cx2, { x: 37, y: 82, cls: k, facing: 0, moving: false, atkAnim: 0, hurtT: 0, invuln: 0, dead: false }, 0.6);
        el.onclick = function () {
          menuCls = k;
          AU.init(); AU.resume();
          AU.sfx('click');
          syncLang();
        };
        host.appendChild(el);
      });
    }
    document.getElementById('menu-best').textContent =
      save.best > 0 ? T('bestDepth') + ': ' + TF('depth', save.best) + ' · ' + T('kills') + ' ' + save.kills : '';
    document.getElementById('mini-label').textContent = G
      ? (TF('floorBanner', G.depth) + ' · ' + T(D.floorName(G.depth)))
      : T('descendHint');
    var bagBtn = document.getElementById('btn-bag'), pauseBtn = document.getElementById('btn-pause');
    if (bagBtn) bagBtn.title = T('bagTitle');
    if (pauseBtn) pauseBtn.title = T('pauseTitle');
    if (G) {
      buildSkillBar();
      updateHud(true);
      renderGearMini();
      renderMiniStats();
    }
  }
  var menuCls = 'knight';
  window.__refreshLang = function () {
    syncLang();
    if (mode === 'inv') renderInv();
    if (mode === 'bless' && blessChoices.length) {
      document.getElementById('bless-title').textContent = TF('floorBanner', G.depth + 1) + ' · ' + T(D.floorName(G.depth + 1));
      renderBless();
    }
    if (mode === 'dead') showDead();
  };

  /* ---------- 音效 ---------- */
  function toggleSound() {
    save.opts.vol = save.opts.vol > 0 ? 0 : .8;
    applyVol();
    writeSave();
  }
  function applyVol() {
    var v = save.opts.vol;
    AU.setVol(v);
    AU.setMuted(v <= 0);
    if (window.AMG_AUDIO) { AMG_AUDIO.vol = v; AMG_AUDIO.muted = v <= 0; AMG_AUDIO.save(); }
    var icon = v <= 0 ? '🔇' : v < .45 ? '🔉' : '🔊';
    ['btn-mute', 'btn-sound'].forEach(function (id) {
      var b = document.getElementById(id);
      if (b) b.textContent = icon;
    });
    var rng = document.getElementById('opt-vol');
    if (rng) { rng.value = Math.round(v * 100); document.getElementById('opt-vol-val').textContent = Math.round(v * 100); }
  }

  /* ---------- 全屏 ---------- */
  function toggleFullscreen() {
    var el = frame;
    if (!document.fullscreenElement) {
      (el.requestFullscreen || el.webkitRequestFullscreen || function () {}).call(el);
    } else {
      (document.exitFullscreen || document.webkitExitFullscreen || function () {}).call(document);
    }
  }

  /* ---------- 按钮绑定 ---------- */
  // 浏览器要求用户交互后才能出声：第一次点击/按键时开菜单音乐
  function unlockAudio() {
    AU.init(); AU.resume();
    if (mode === 'menu') bgm('abyss-menu');
  }
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) {
    window.addEventListener(ev, unlockAudio, { passive: true });
  });
  // 标签页切回来时上下文可能被挂起
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && AU.ctx && AU.ctx.state === 'suspended') {
      AU.resume();
      var nm = bgmName; bgmName = '';
      if (nm && window.AMG_BGM) AMG_BGM.play(nm);
    }
  });

  function bindUI() {
    document.getElementById('btn-start').addEventListener('click', function () {
      AU.init(); AU.resume();
      AU.sfx('click');
      startGame(menuCls);
    });
    document.getElementById('btn-bag').addEventListener('click', toggleInventory);
    document.getElementById('inv-close').addEventListener('click', toggleInventory);
    document.getElementById('btn-pause').addEventListener('click', togglePause);
    document.getElementById('btn-sound').addEventListener('click', toggleSound);
    document.getElementById('btn-mute').addEventListener('click', function () { AU.init(); toggleSound(); });
    document.getElementById('pause-resume').addEventListener('click', togglePause);
    document.getElementById('pause-restart').addEventListener('click', function () {
      hideOv(); startGame(G.p.cls);
    });
    document.getElementById('pause-menu').addEventListener('click', backToMenu);
    document.getElementById('dead-retry').addEventListener('click', function () {
      hideOv();
      startGame(G.p.cls);
    });
    document.getElementById('dead-menu').addEventListener('click', backToMenu);
    document.getElementById('potion-badge').addEventListener('click', drinkPotion);
    var autoEl = document.getElementById('opt-auto'), dmgEl = document.getElementById('opt-dmg');
    autoEl.checked = save.opts.auto;
    dmgEl.checked = save.opts.dmgNum;
    autoEl.addEventListener('change', function () { save.opts.auto = autoEl.checked; writeSave(); });
    dmgEl.addEventListener('change', function () { save.opts.dmgNum = dmgEl.checked; writeSave(); });
    var vol = document.getElementById('opt-vol');
    vol.addEventListener('input', function () {
      save.opts.vol = +vol.value / 100;
      applyVol();
    });
    vol.addEventListener('change', writeSave);
    window.addEventListener('resize', resize);
  }

  function backToMenu() {
    mode = 'menu';
    G = null;
    map = null;
    hideOv(); showHUD(false);
    document.getElementById('ov-menu').classList.remove('hidden');
    bgm('abyss-menu');
    document.getElementById('menu-best').textContent =
      save.best > 0 ? T('bestDepth') + ': ' + TF('depth', save.best) + ' · ' + T('kills') + ' ' + save.kills : '';
  }

  /* ---------- 启动 ---------- */
  function boot() {
    resize();
    if (window.AMG) { AMG.apply(window.ABYSS_STR); AMG.mountBtn(); }
    syncLang();
    bindUI();
    applyVol();
    // 菜单背景：造一张小地图做氛围
    map = genMap(1);
    G = null;
    requestAnimationFrame(renderMenuBackdrop);
    requestAnimationFrame(frameLoop);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && mode === 'play') togglePause();
    });
    window.addEventListener('beforeunload', writeSave);
  }

  var menuT = 0;
  function renderMenuBackdrop() {
    if (!map) return;
    menuT += .016;
    ctx.setTransform(RENDER_DPR, 0, 0, RENDER_DPR, 0, 0);
    ctx.fillStyle = '#080706';
    ctx.fillRect(0, 0, W, H);
    // 缓慢漂移的地图一角
    var ox = (map.w * TILE - W) * (.5 + Math.sin(menuT * .09) * .45);
    var oy = (map.h * TILE - H) * (.5 + Math.cos(menuT * .07) * .45);
    ctx.drawImage(map.floorCv, -Math.max(0, ox), -Math.max(0, oy), W, H, 0, 0, W, H);
    // 光晕
    var g = ctx.createRadialGradient(W * .5, H * .42, 40, W * .5, H * .42, 560);
    g.addColorStop(0, 'rgba(120,70,30,.30)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    if (mode === 'menu') requestAnimationFrame(renderMenuBackdrop);
  }

  /* ---------- 调试 API ---------- */
  window.ABYSS = {
    get state() { return G; },
    get mode() { return mode; },
    get cam() { return { x: cam.x, y: cam.y }; },
    get map() { return map; },
    start: startGame,
    menu: backToMenu,
    skill: castSkill,
    potion: drinkPotion,
    pause: togglePause,
    inv: toggleInventory,
    give: function (n) { if (G) { G.p.potions += n; updateHud(true); } },
    gold: function (n) { if (G) { G.p.gold += n; updateHud(true); } },
    xp: function (n) { if (G) gainXp(n); },
    killAll: function () {
      if (!G) return;
      G.enemies.slice().forEach(function (e) { if (!e.dead) killEnemy(e); });
    },
    spawn: function (kind, n) {
      if (!G) return;
      n = n || 1;
      for (var i = 0; i < n; i++) spawnEnemy(kind || 'zombie', G.p.x + rnd(-160, 160), G.p.y + rnd(-120, 120), null);
    },
    god: function (on) { debug.godMode = on !== false; },
    bless: function () { if (G) { G.toSpawn = 0; G.enemies = []; clearFloor(); } },
    drop: function (rar) {
      if (!G) return dropGear(G.p.x, G.p.y, null);
      dropGear(G.p.x, G.p.y, null);
    },
    depth: function () { return G ? G.depth : 0; },
    next: function () { if (G) finishBless(null); },
    invite: function () { if (G) { G.toSpawn = 0; G.enemies = []; clearFloor(); } }
  };

  // 供自动化测试/无障碍工具使用的输入钩子
  window.addEventListener('botjoy', function (e) {
    var d = e.detail || {};
    input.joy = (Math.abs(d.x) + Math.abs(d.y) > .01) ? { x: d.x, y: d.y } : null;
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
