/* 浮岛农场 · Sky Farm
 * 像素风 3D 浮空岛农场：Three.js 低分辨率渲染 → 后处理（描边 + Bayer 抖动 + 天空背景）→ 最近邻放大。
 * 世界由 24×24 的高度图拼出：草地 / 台地 / 山丘 / 溪流，岛底是阶梯状的倒锥岩体。
 * 玩法：开垦 → 播种 → 浇水（每个生长阶段一次，下雨自动浇）→ 收获；鸡下蛋、订单、升级与扩建。
 */
(function () {
  'use strict';
  var $ = KIT.$, T = KIT.T;
  var FRAME = $('frame'), HOST = $('game');
  var ERR = $('errbox');
  function showErr(m) { ERR.style.display = 'block'; ERR.textContent = String(m); }
  window.addEventListener('error', function (e) { showErr(e.message + (e.lineno ? ' @' + e.lineno : '')); });

  if (!window.THREE) { showErr('three.js failed to load'); return; }
  var canGL = (function () { try { var c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } })();
  if (!canGL) { showErr(T('noWebgl')); return; }

  // ======================================================================
  // 数据
  // ======================================================================
  var CROPS = [
    { id: 'carrot', icon: '🥕', lv: 1, cost: 6, sell: 16, grow: 36, xp: 3 },
    { id: 'wheat', icon: '🌾', lv: 2, cost: 10, sell: 26, grow: 54, xp: 5 },
    { id: 'strawberry', icon: '🍓', lv: 3, cost: 16, sell: 42, grow: 80, xp: 8 },
    { id: 'pumpkin', icon: '🎃', lv: 4, cost: 28, sell: 76, grow: 128, xp: 13 },
    { id: 'sunflower', icon: '🌻', lv: 5, cost: 36, sell: 100, grow: 160, xp: 18 }
  ];
  var CROP = {}; CROPS.forEach(function (c) { CROP[c.id] = c; });
  var LV_XP = [0, 40, 120, 260, 480, 800, 1250, 1850, 2600, 3600];
  function lvFromXp(xp) { var l = 1; while (xpForLv(l + 1) <= xp) l++; return l; }
  function xpForLv(l) { return l <= LV_XP.length ? LV_XP[l - 1] : LV_XP[LV_XP.length - 1] + (l - LV_XP.length) * 1200; }
  var EGG_PRICE = 14, MAX_CHICKENS = 6;

  var WEATHERS = [
    { id: 'clear', icon: '☀️' }, { id: 'cloudy', icon: '⛅' }, { id: 'rain', icon: '🌦️' },
    { id: 'storm', icon: '⛈️' }, { id: 'mist', icon: '🌫️' }
  ];
  // 天气目标参数：云量 / 雨 / 风 / 雾 / 雷
  var WX = {
    clear: { cloud: 0.12, rain: 0, wind: 0.25, mist: 0, storm: 0 },
    cloudy: { cloud: 0.7, rain: 0, wind: 0.45, mist: 0, storm: 0 },
    rain: { cloud: 0.85, rain: 0.55, wind: 0.5, mist: 0.15, storm: 0 },
    storm: { cloud: 1, rain: 1, wind: 1, mist: 0.2, storm: 1 },
    mist: { cloud: 0.35, rain: 0, wind: 0.12, mist: 1, storm: 0 }
  };
  var TIME_PRESETS = [['dawn', 6.2], ['morning', 9], ['noon', 12.5], ['dusk', 18.6], ['night', 22.5]];
  var DAY_LENS = [6, 12, 24, 48];

  // ---------------- 地图（z 行从后往前，x 列从左到右） ----------------
  // . 虚空  2 草地  3 台地  4 山丘  w 溪流/池塘
  var MAP = [
    '......44444444444.......',
    '....444444444444444.....',
    '...44444444444444444....',
    '..3344444444444444443...',
    '..33334444444444443333..',
    '.3333333344444433333333.',
    '.3333333333333333333333.',
    '.3333333332222222222222.',
    '.2w22222222222222222222.',
    '22w222222222222222222222',
    '22w222222222222222222222',
    '22ww22222222222222222222',
    '222w22222222222222222222',
    '222w22222222222222222222',
    '22www2222222222222222222',
    '2wwwww222222222222222222',
    '2wwwwww22222222222222222',
    '22wwwww22222222222222222',
    '.22www22222222222222222.',
    '.2222w2222222222222222..',
    '..222w222222222222222...',
    '...22w2222222222222.....',
    '....2w22222222222.......',
    '......2222222...........'
  ];
  var N = 24, HALF = N / 2;
  var WATER_BED = 0.42, WATER_Y = 0.8;
  var STAIRS = [[12, 6], [12, 5]];
  var ZONES = {
    main: { x0: 13, x1: 17, z0: 12, z1: 15, price: 0 },
    A: { x0: 13, x1: 17, z0: 16, z1: 18, price: 260, lv: 2 },
    B: { x0: 19, x1: 21, z0: 12, z1: 17, price: 720, lv: 4 }
  };
  var YARD = { x0: 17, x1: 21, z0: 7, z1: 10 };
  var HOUSE = { x0: 9, x1: 11, z0: 10, z1: 12 };
  var WINDMILL = { x: 12, z: 2 };
  var PATHS = [];
  (function () {
    var z, x;
    for (z = 7; z <= 19; z++) PATHS.push([12, z]);
    PATHS.push([10, 13], [11, 13]);
    for (x = 13; x <= 16; x++) PATHS.push([x, 9]);
    for (z = 12; z <= 17; z++) PATHS.push([18, z]);
    for (x = 6; x <= 11; x++) PATHS.push([x, 19]);
    PATHS.push([4, 19], [3, 19], [12, 4], [12, 3]);
  })();

  function wx(x) { return x - HALF + 0.5; }
  function wz(z) { return z - HALF + 0.5; }
  function key(x, z) { return x + ',' + z; }

  // 确定性随机
  function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  var rnd = mulberry(20261105);
  function hash2(x, z) { var h = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return h - Math.floor(h); }

  // ---------------- 地块 ----------------
  var TILES = [];
  (function () {
    for (var z = 0; z < N; z++) {
      TILES[z] = [];
      for (var x = 0; x < N; x++) {
        var ch = MAP[z].charAt(x) || '.';
        var t = null;
        if (ch === 'w') t = { kind: 'water', y: WATER_BED, lv: 1 };
        else if (ch >= '2' && ch <= '4') { var lv = +ch; t = { kind: 'land', y: lv * 0.5, lv: lv }; }
        if (t) { t.x = x; t.z = z; }
        TILES[z][x] = t;
      }
    }
    STAIRS.forEach(function (s) {
      var t = TILES[s[1]][s[0]]; t.stair = true; t.stairTop = t.y; t.y = t.y - 0.5;
    });
    // 到虚空的距离（决定岛底的深度）
    var dist = [], q = [], z2, x2;
    for (z2 = 0; z2 < N; z2++) { dist[z2] = []; for (x2 = 0; x2 < N; x2++) { dist[z2][x2] = TILES[z2][x2] ? 1e9 : 0; } }
    for (z2 = 0; z2 < N; z2++) for (x2 = 0; x2 < N; x2++) {
      if (!TILES[z2][x2]) continue;
      var edge = x2 === 0 || z2 === 0 || x2 === N - 1 || z2 === N - 1 || !TILES[z2][x2 - 1] || !TILES[z2][x2 + 1] || !TILES[z2 - 1] || !TILES[z2 - 1][x2] || !TILES[z2 + 1] || !TILES[z2 + 1][x2];
      if (edge) { dist[z2][x2] = 1; q.push([x2, z2]); }
    }
    while (q.length) {
      var c = q.shift(), d = dist[c[1]][c[0]];
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (o) {
        var nx = c[0] + o[0], nz = c[1] + o[1];
        if (nx < 0 || nz < 0 || nx >= N || nz >= N) return;
        if (dist[nz][nx] > d + 1) { dist[nz][nx] = d + 1; q.push([nx, nz]); }
      });
    }
    for (z2 = 0; z2 < N; z2++) for (x2 = 0; x2 < N; x2++) {
      var tt = TILES[z2][x2]; if (!tt) continue;
      var dd = Math.min(dist[z2][x2], 8);
      tt.dist = dd;
      tt.bottom = Math.round((-0.7 - (dd - 1) * 0.85 - hash2(x2, z2) * 0.6) / 0.3) * 0.3;
    }
  })();
  function tile(x, z) { return (x >= 0 && z >= 0 && x < N && z < N) ? TILES[z][x] : null; }
  function inRect(r, x, z) { return x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1; }
  function zoneOf(x, z) { for (var k in ZONES) if (inRect(ZONES[k], x, z)) return k; return null; }
  var PATHSET = {}; PATHS.forEach(function (p) { PATHSET[key(p[0], p[1])] = 1; });
  function topY(x, z) {
    var t = tile(x, z); if (!t) return 0;
    if (t.kind === 'water') return WATER_Y;
    return t.stair ? (t.y + t.stairTop) / 2 : t.y;
  }
  // 连续坐标的地面高度（楼梯为斜坡）
  function groundAt(px, pz) {
    var x = Math.floor(px + HALF), z = Math.floor(pz + HALF), t = tile(x, z);
    if (!t) return 0;
    if (t.kind === 'water') return WATER_Y;
    if (t.stair) { var f = (pz + HALF) - z; return t.y + (1 - f) * 0.5; }
    return t.y;
  }

  // ======================================================================
  // 渲染器 / 场景
  // ======================================================================
  var renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.BasicShadowMap;
  renderer.toneMapping = THREE.NoToneMapping;
  HOST.appendChild(renderer.domElement);
  var CANVAS = renderer.domElement;

  var scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xffffff, 400, 500);
  var camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);

  var hemi = new THREE.HemisphereLight(0xffffff, 0x445533, 1);
  scene.add(hemi);
  var sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  var sc = sun.shadow.camera; sc.left = -19; sc.right = 19; sc.top = 19; sc.bottom = -19; sc.near = 1; sc.far = 90;
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
  scene.add(sun); scene.add(sun.target);

  var MAT = {
    vc: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
    glow: new THREE.MeshBasicMaterial({ color: 0x5c7480 }),
    cloud: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
    part: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false })
  };

  // ---------------- 几何拼装器 ----------------
  function ni(g) { return g.index ? g.toNonIndexed() : g; }
  var GEO = {
    box: ni(new THREE.BoxGeometry(1, 1, 1)),
    ico0: ni(new THREE.IcosahedronGeometry(1, 0)),
    ico1: ni(new THREE.IcosahedronGeometry(1, 1)),
    cyl6: ni(new THREE.CylinderGeometry(1, 1, 1, 6)),
    cyl8: ni(new THREE.CylinderGeometry(1, 1, 1, 8)),
    cone6: ni(new THREE.ConeGeometry(1, 1, 6)),
    cone8: ni(new THREE.ConeGeometry(1, 1, 8)),
    dode: ni(new THREE.DodecahedronGeometry(1, 0))
  };
  var _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _eu = new THREE.Euler(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _sv = new THREE.Vector3(), _n3 = new THREE.Matrix3(), _c = new THREE.Color();

  function Build() { this.p = []; this.n = []; this.c = []; }
  // opt: { rot:[x,y,z], jit, fv (每面顶点数), shade (按法线 y 提亮), r (随机源) }
  Build.prototype.add = function (g, pos, scl, color, opt) {
    opt = opt || {};
    var r = opt.rot || [0, 0, 0];
    _eu.set(r[0], r[1], r[2]); _q.setFromEuler(_eu);
    _m4.compose(_v.set(pos[0], pos[1], pos[2]), _q, _sv.set(scl[0], scl[1], scl[2]));
    if (opt.pre) _m4.multiply(opt.pre);
    _n3.getNormalMatrix(_m4);
    var P = g.attributes.position.array, NN = g.attributes.normal.array, fv = opt.fv || (g === GEO.box ? 6 : 3);
    var R = opt.r || rnd, jit = opt.jit || 0, cols = [].concat(color);
    var base = cols[(R() * cols.length) | 0], fr, fg, fb;
    for (var i = 0; i < P.length; i += 3) {
      var vi = i / 3;
      if (vi % fv === 0) {
        _c.set(base);
        if (jit) _c.offsetHSL(0, 0, (R() - 0.5) * jit);
        if (opt.shade) {
          _v2.set(NN[i], NN[i + 1], NN[i + 2]).applyMatrix3(_n3).normalize();
          _c.offsetHSL(0, 0, _v2.y * opt.shade);
        }
        fr = _c.r; fg = _c.g; fb = _c.b;
      }
      _v.set(P[i], P[i + 1], P[i + 2]).applyMatrix4(_m4);
      this.p.push(_v.x, _v.y, _v.z);
      _v.set(NN[i], NN[i + 1], NN[i + 2]).applyMatrix3(_n3).normalize();
      this.n.push(_v.x, _v.y, _v.z);
      this.c.push(fr, fg, fb);
    }
    return this;
  };
  Build.prototype.box = function (x, y, z, sx, sy, sz, color, ry, jit) {
    return this.add(GEO.box, [x, y, z], [sx, sy, sz], color, { rot: [0, ry || 0, 0], jit: jit || 0 });
  };
  Build.prototype.quad = function (a, b, c, d, nrm, color) {
    _c.set(color);
    var pts = [a, b, c, a, c, d];
    for (var i = 0; i < 6; i++) { this.p.push(pts[i][0], pts[i][1], pts[i][2]); this.n.push(nrm[0], nrm[1], nrm[2]); this.c.push(_c.r, _c.g, _c.b); }
  };
  Build.prototype.geometry = function () {
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeBoundingSphere();
    return g;
  };
  Build.prototype.mesh = function (mat, cast, recv) {
    var m = new THREE.Mesh(this.geometry(), mat || MAT.vc);
    m.castShadow = cast !== false; m.receiveShadow = recv !== false;
    return m;
  };

  // ======================================================================
  // 地形
  // ======================================================================
  var GRASS = { 2: ['#5f8f3c', '#679842', '#58873a', '#6e9e45'], 3: ['#5a8a3a', '#62923f', '#547f36', '#69973f'], 4: ['#4f7f36', '#56883a', '#4a7633', '#5d8c3d'] };
  var pickGeo;
  (function buildTerrain() {
    var b = new Build(), pk = new Build();
    var R = mulberry(77);
    function bandColor(x, z, y, top) {
      var dTop = top - y;
      if (dTop < 0.16) return '#4d7a31';
      if (dTop < 0.55) return hash2(x * 3 + y, z) > 0.5 ? '#7a5434' : '#6e4a2d';
      var band = Math.floor((y + 20) / 0.3);
      var h = hash2(x + band * 7.1, z - band * 3.3);
      if (y < -2.5) return h > 0.6 ? '#3e3631' : (h > 0.25 ? '#463d36' : '#3a322d');
      return h > 0.66 ? '#6c5d52' : (h > 0.3 ? '#5e5148' : '#544840');
    }
    function side(x, z, dir, y0, y1, top) {
      // dir: 0 +x, 1 -x, 2 +z, 3 -z ；按 0.3 高度分段着色
      var X = wx(x), Z = wz(z), h = 0.5;
      var segs = [], y = y1;
      var guard = 0;
      while (y > y0 + 1e-4 && guard++ < 200) {
        var ny = Math.max(y0, y - 0.3);
        if (top - y < 0.155 && top - ny > 0.165) ny = Math.max(y0, top - 0.16);
        if (ny >= y - 1e-4) ny = Math.max(y0, y - 0.3);
        segs.push([ny, y]); y = ny;
      }
      segs.forEach(function (s) {
        var c = bandColor(x + dir * 0.37, z, s[0], top), a = s[0], t = s[1];
        if (dir === 0) b.quad([X + h, a, Z + h], [X + h, a, Z - h], [X + h, t, Z - h], [X + h, t, Z + h], [1, 0, 0], c);
        else if (dir === 1) b.quad([X - h, a, Z - h], [X - h, a, Z + h], [X - h, t, Z + h], [X - h, t, Z - h], [-1, 0, 0], c);
        else if (dir === 2) b.quad([X - h, a, Z + h], [X + h, a, Z + h], [X + h, t, Z + h], [X - h, t, Z + h], [0, 0, 1], c);
        else b.quad([X + h, a, Z - h], [X - h, a, Z - h], [X - h, t, Z - h], [X + h, t, Z - h], [0, 0, -1], c);
      });
    }
    var DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (var z = 0; z < N; z++) for (var x = 0; x < N; x++) {
      var t = TILES[z][x]; if (!t) continue;
      var X = wx(x), Z = wz(z), top = t.y;
      // 顶面：3×3 子格随机明暗，形成像素草地纹理
      var S = 3, s = 1 / S, i, j;
      for (i = 0; i < S; i++) for (j = 0; j < S; j++) {
        var c;
        if (t.kind === 'water') c = hash2(x * 3 + i, z * 3 + j) > 0.5 ? '#6b5a3c' : '#5f5036';
        else {
          var pal = GRASS[t.lv] || GRASS[2], hv = hash2(x * 3 + i + 0.5, z * 3 + j);
          c = pal[(hv * pal.length) | 0];
          if (t.stair) c = '#8c8676';
        }
        var x0 = X - 0.5 + i * s, z0 = Z - 0.5 + j * s;
        b.quad([x0, top, z0 + s], [x0 + s, top, z0 + s], [x0 + s, top, z0], [x0, top, z0], [0, 1, 0], c);
      }
      // 拾取面
      var py = topY(x, z);
      pk.quad([X - 0.5, py, Z + 0.5], [X + 0.5, py, Z + 0.5], [X + 0.5, py, Z - 0.5], [X - 0.5, py, Z - 0.5], [0, 1, 0], '#fff');
      // 侧面
      for (var d = 0; d < 4; d++) {
        var nx = x + DIRS[d][0], nz = z + DIRS[d][1], nt = tile(nx, nz);
        if (!nt) { side(x, z, d, t.bottom, top, top); continue; }
        if (t.stair && d === 2) continue; // 楼梯正面被台阶覆盖
        if (nt.y < top - 1e-4) side(x, z, d, nt.y, top, top);
        if (nt.bottom > t.bottom + 1e-4) side(x, z, d, t.bottom, nt.bottom, top);
      }
      // 底面
      b.quad([X - 0.5, t.bottom, Z - 0.5], [X + 0.5, t.bottom, Z - 0.5], [X + 0.5, t.bottom, Z + 0.5], [X - 0.5, t.bottom, Z + 0.5], [0, -1, 0], '#2c2622');
      // 楼梯台阶
      if (t.stair) {
        for (var k = 0; k < 4; k++) {
          var sh = (k + 1) * 0.125;
          b.box(X, t.y + sh / 2, Z + 0.5 - (k + 0.5) * 0.25, 0.74, sh, 0.25, k % 2 ? '#a39b88' : '#958d7b', 0, 0.04);
        }
        b.box(X - 0.44, t.y + 0.25, Z, 0.12, 0.5, 1, '#6b6457');
        b.box(X + 0.44, t.y + 0.25, Z, 0.12, 0.5, 1, '#6b6457');
      }
    }
    var terrain = b.mesh(MAT.vc, true, true);
    scene.add(terrain);
    pickGeo = pk.geometry();
  })();
  var pickMesh = new THREE.Mesh(pickGeo, new THREE.MeshBasicMaterial());
  pickMesh.updateMatrixWorld();

  // ---------------- 水面 / 瀑布 ----------------
  var waterUni = {
    uTime: { value: 0 }, uDeep: { value: new THREE.Color('#2f6f86') }, uLight: { value: new THREE.Color('#5fb3c4') },
    uFoam: { value: new THREE.Color('#d8f3ef') }, uBright: { value: 1 }, uRain: { value: 0 }, uTint: { value: new THREE.Color(1, 1, 1) }
  };
  var NOISE_GLSL = 'float hh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\n';
  (function buildWater() {
    var pos = [], shore = [];
    function landish(x, z) { var t = tile(x, z); return !t || t.kind !== 'water'; }
    for (var z = 0; z < N; z++) for (var x = 0; x < N; x++) {
      var t = TILES[z][x]; if (!t || t.kind !== 'water') continue;
      var X = wx(x), Z = wz(z);
      // 每个角的岸边权重：相邻的陆地格数量
      var cs = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(function (o) {
        var sx = o[0] < 0 ? -1 : 1, sz = o[1] < 0 ? -1 : 1;
        var c = 0;
        if (landish(x + sx, z)) c++; if (landish(x, z + sz)) c++; if (landish(x + sx, z + sz)) c++;
        // 岛边（瀑布口）不算岸
        if (!tile(x, z + sz) && sz > 0) c = Math.max(0, c - 2);
        return Math.min(1, c / 2);
      });
      var P = [[X - 0.5, Z - 0.5], [X + 0.5, Z - 0.5], [X + 0.5, Z + 0.5], [X - 0.5, Z + 0.5]];
      [0, 2, 1, 0, 3, 2].forEach(function (i) { pos.push(P[i][0], WATER_Y, P[i][1]); shore.push(cs[i]); });
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('shore', new THREE.Float32BufferAttribute(shore, 1));
    var mat = new THREE.ShaderMaterial({
      uniforms: waterUni, transparent: true,
      vertexShader: 'attribute float shore; varying float vS; varying vec3 vW; void main(){ vS = shore; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: NOISE_GLSL +
        'uniform float uTime, uBright, uRain; uniform vec3 uDeep, uLight, uFoam, uTint; varying float vS; varying vec3 vW;\n' +
        'void main(){ vec2 p = floor(vW.xz * 10.0) / 10.0;\n' +
        ' float w = sin(p.x * 2.3 + uTime * 1.1) + sin(p.y * 2.9 - uTime * 0.8) + sin((p.x + p.y) * 1.4 + uTime * 0.6);\n' +
        ' vec3 c = mix(uDeep, uLight, 0.3 + 0.1 * w);\n' +
        ' c = mix(c, uFoam, step(2.2, w) * 0.45);\n' +
        ' float f = step(0.62, vS + 0.12 * sin(p.x * 6.0 + p.y * 5.0 + uTime * 2.0));\n' +
        ' c = mix(c, uFoam, f * 0.75);\n' +
        ' float r = hh(floor(vW.xz * 10.0) + floor(uTime * 7.0));\n' +
        ' c = mix(c, uFoam, step(1.0 - 0.05 * uRain, r) * 0.8);\n' +
        ' gl_FragColor = vec4(c * uTint * uBright, 0.9); }'
    });
    var m = new THREE.Mesh(g, mat); m.receiveShadow = false; scene.add(m);

    // 瀑布：(5,22) 的前缘落向虚空；(2,7)→(2,8) 台地小跌水
    var fallMat = new THREE.ShaderMaterial({
      uniforms: waterUni, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: 'varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: NOISE_GLSL +
        'uniform float uTime, uBright; uniform vec3 uDeep, uLight, uFoam, uTint; varying vec2 vUv; varying vec3 vW;\n' +
        'void main(){ float col = floor(vUv.x * 10.0); float y = floor(vW.y * 10.0) / 10.0;\n' +
        ' float s = sin(y * 5.0 + uTime * 13.0 + hh(vec2(col, 1.0)) * 6.28);\n' +
        ' vec3 c = mix(uLight, uFoam, step(0.55, s) * 0.8);\n' +
        ' c = mix(c, uDeep, step(s, -0.7) * 0.35);\n' +
        ' float top = step(0.94, vUv.y); c = mix(c, uFoam, top);\n' +
        ' float a = smoothstep(0.0, 0.45, vUv.y) * 0.92;\n' +
        ' gl_FragColor = vec4(c * uTint * uBright * a, a); }'
    });
    fallMat.blending = THREE.CustomBlending;
    fallMat.blendSrc = THREE.OneFactor; fallMat.blendDst = THREE.OneMinusSrcAlphaFactor;
    fallMat.blendSrcAlpha = THREE.OneFactor; fallMat.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
    var g1 = new THREE.PlaneGeometry(0.9, 9.5); var f1 = new THREE.Mesh(g1, fallMat);
    f1.position.set(wx(5), WATER_Y - 4.75 + 0.02, wz(22) + 0.53); scene.add(f1);
    var g2 = new THREE.PlaneGeometry(0.62, 0.78); var f2 = new THREE.Mesh(g2, fallMat);
    f2.position.set(wx(2), WATER_Y + 0.39, wz(8) - 0.47); scene.add(f2);
    // 泉眼
    var sp = new Build(); sp.box(wx(2), 1.42, wz(7) + 0.46, 0.5, 0.12, 0.1, '#3a3f3a'); scene.add(sp.mesh());
  })();
  var FALL_TOP = new THREE.Vector3(wx(5), WATER_Y, wz(22) + 0.55);

  // ======================================================================
  // 植被：树、灌木、岩石、草丛与野花
  // ======================================================================
  var RESERVED = {};
  function reserve(x0, z0, x1, z1) { for (var z = z0; z <= z1; z++) for (var x = x0; x <= x1; x++) RESERVED[key(x, z)] = 1; }
  for (var zk in ZONES) reserve(ZONES[zk].x0, ZONES[zk].z0, ZONES[zk].x1, ZONES[zk].z1);
  reserve(YARD.x0, YARD.z0, YARD.x1, YARD.z1);
  reserve(HOUSE.x0 - 1, HOUSE.z0 - 1, HOUSE.x1 + 1, HOUSE.z1 + 1);
  reserve(WINDMILL.x - 2, WINDMILL.z - 2, WINDMILL.x + 1, WINDMILL.z + 1);
  reserve(6, 10, 8, 12); // 水井
  reserve(7, 15, 8, 17); // 长椅
  PATHS.forEach(function (p) { RESERVED[key(p[0], p[1])] = 1; });
  STAIRS.forEach(function (p) { RESERVED[key(p[0], p[1])] = 1; });
  reserve(12, 3, 12, 8);
  reserve(18, 4, 21, 5); // 蜂箱

  var TREES = [];
  function canopyColorPal(kind) {
    if (kind === 'pine') return ['#2f5a33', '#376538', '#2b5230'];
    if (kind === 'fruit') return ['#4f8a3a', '#5a9640', '#467e35'];
    if (kind === 'birch') return ['#86ad4a', '#93b951', '#7aa144'];
    return ['#4c8237', '#56903c', '#447632', '#5f9a40'];
  }
  function makeTree(kind, X, Y, Z, s, R) {
    var b = new Build(), pal = canopyColorPal(kind);
    if (kind === 'pine') {
      b.add(GEO.cyl6, [0, 0.3 * s, 0], [0.08 * s, 0.6 * s, 0.08 * s], '#5a3d26');
      for (var i = 0; i < 3; i++) {
        var r = (0.62 - i * 0.16) * s, h = 0.7 * s;
        b.add(GEO.cone6, [0, (0.55 + i * 0.42) * s + h / 2, 0], [r, h, r], pal, { r: R, jit: 0.05, shade: 0.06, rot: [0, R() * 3, 0] });
      }
    } else {
      var trunk = kind === 'birch' ? '#d9d2c2' : '#6a4529';
      var th = (kind === 'fruit' ? 0.5 : 0.75) * s;
      b.add(GEO.cyl6, [0, th / 2, 0], [0.09 * s, th, 0.09 * s], trunk);
      if (kind !== 'fruit') b.add(GEO.box, [0.12 * s, th * 0.7, 0], [0.22 * s, 0.05 * s, 0.05 * s], trunk, { rot: [0, 0, 0.6] });
      var blobs = kind === 'fruit' ? 3 : 4 + ((R() * 2) | 0);
      for (var k = 0; k < blobs; k++) {
        var a = k / blobs * 6.283 + R(), rr = (k === 0 ? 0 : 0.28) * s;
        var rad = (k === 0 ? 0.5 : 0.36 + R() * 0.1) * s;
        b.add(GEO.ico1, [Math.cos(a) * rr, th + (k === 0 ? 0.42 : 0.25 + R() * 0.35) * s, Math.sin(a) * rr], [rad, rad * 0.88, rad], pal, { r: R, jit: 0.06, shade: 0.07, rot: [R(), R(), R()] });
      }
      if (kind === 'fruit') {
        for (var f = 0; f < 7; f++) {
          var fa = R() * 6.283, fr = 0.42 * s;
          b.box(Math.cos(fa) * fr, th + (0.25 + R() * 0.45) * s, Math.sin(fa) * fr, 0.08, 0.08, 0.08, R() > 0.5 ? '#e0452f' : '#f29a2e');
        }
      }
    }
    var m = b.mesh();
    m.position.set(X, Y, Z);
    m.rotation.y = R() * 6.283;
    scene.add(m);
    TREES.push({ m: m, ph: R() * 6.283, k: kind === 'pine' ? 0.5 : 1 });
    return m;
  }
  function makeBush(b, X, Y, Z, s, R, flowers) {
    var pal = ['#4b8236', '#548d3b', '#43742f'];
    for (var k = 0; k < 3; k++) {
      var a = R() * 6.283;
      b.add(GEO.ico0, [X + Math.cos(a) * 0.15 * s, Y + 0.16 * s, Z + Math.sin(a) * 0.15 * s], [0.24 * s, 0.2 * s, 0.24 * s], pal, { r: R, jit: 0.05, shade: 0.08, rot: [R(), R(), R()] });
    }
    if (flowers) for (var f = 0; f < 4; f++) b.box(X + (R() - 0.5) * 0.4 * s, Y + 0.3 * s, Z + (R() - 0.5) * 0.4 * s, 0.06, 0.06, 0.06, flowers);
  }
  function makeRock(b, X, Y, Z, s, R) {
    b.add(GEO.dode, [X, Y + 0.08 * s, Z], [0.22 * s, 0.16 * s, 0.2 * s], ['#8a8a82', '#7b7c75', '#93928a'], { r: R, jit: 0.06, shade: 0.12, rot: [R(), R(), R()] });
  }

  var deco = new Build();
  (function placeVegetation() {
    var R = mulberry(4242);
    // 果园（台地左侧）
    [[2.6, 4.6], [4.4, 4.4], [3.2, 6.2], [5.2, 5.9], [7, 6.3], [6.6, 5.2]].forEach(function (p) {
      var x = Math.floor(p[0]), z = Math.floor(p[1]);
      makeTree('fruit', wx(0) + p[0] - 0.5, topY(x, z), wz(0) + p[1] - 0.5, 0.95 + R() * 0.2, R);
      RESERVED[key(x, z)] = 1;
    });
    for (var z = 0; z < N; z++) for (var x = 0; x < N; x++) {
      var t = TILES[z][x]; if (!t || t.kind !== 'land' || RESERVED[key(x, z)]) continue;
      var X = wx(x) + (R() - 0.5) * 0.5, Z = wz(z) + (R() - 0.5) * 0.5, Y = t.y;
      var edge = t.dist <= 2, p = R();
      var interior = x >= 8 && x <= 22 && z >= 7 && z <= 20;
      if (t.lv === 4) {
        if (p < 0.34) makeTree(R() < 0.6 ? 'pine' : 'oak', X, Y, Z, 0.9 + R() * 0.45, R);
        else if (p < 0.42) makeBush(deco, X, Y, Z, 1, R, null);
      } else if (t.lv === 3) {
        if (p < 0.2) makeTree(R() < 0.3 ? 'pine' : (R() < 0.3 ? 'birch' : 'oak'), X, Y, Z, 0.85 + R() * 0.35, R);
        else if (p < 0.3) makeBush(deco, X, Y, Z, 1, R, R() < 0.5 ? '#f2f0e6' : null);
      } else if (!interior && edge) {
        if (p < 0.3) makeTree(R() < 0.25 ? 'birch' : 'oak', X, Y, Z, 0.9 + R() * 0.45, R);
        else if (p < 0.42) makeBush(deco, X, Y, Z, 1.1, R, R() < 0.5 ? '#e0453a' : '#f2f0e6');
        else if (p < 0.5) makeRock(deco, X, Y, Z, 1 + R(), R);
      } else if (!interior) {
        if (p < 0.12) makeTree(R() < 0.25 ? 'birch' : 'oak', X, Y, Z, 0.85 + R() * 0.4, R);
        else if (p < 0.18) makeBush(deco, X, Y, Z, 1, R, null);
      } else {
        if (p < 0.025) makeRock(deco, X, Y, Z, 0.8 + R() * 0.6, R);
        else if (p < 0.045) makeBush(deco, X, Y, Z, 0.9, R, R() < 0.5 ? '#f0c94a' : null);
      }
    }
    // 中间草地的点缀树（不挡田）
    [[7.2, 8.6], [22.3, 14.2], [21.6, 19.2], [8.4, 20.3]].forEach(function (p) {
      makeTree('oak', wx(0) + p[0] - 0.5, topY(Math.floor(p[0]), Math.floor(p[1])), wz(0) + p[1] - 0.5, 1.15, R);
    });
    // 池塘边的石头与芦苇
    for (var i = 0; i < 26; i++) {
      var a = R() * 6.283, cx = wx(4) + Math.cos(a) * (2.6 + R() * 0.5), cz = wz(16.5) + Math.sin(a) * (2.0 + R() * 0.4);
      var tx = Math.floor(cx + HALF), tz = Math.floor(cz + HALF), tt = tile(tx, tz);
      if (!tt || tt.kind !== 'land' || RESERVED[key(tx, tz)]) continue;
      if (R() < 0.5) makeRock(deco, cx, tt.y, cz, 0.6 + R() * 0.5, R);
      else for (var r = 0; r < 4; r++) deco.box(cx + (R() - 0.5) * 0.25, tt.y + 0.18, cz + (R() - 0.5) * 0.25, 0.04, 0.36 + R() * 0.2, 0.04, ['#6c8a3a', '#7d9a45']);
    }
  })();

  // 草丛 + 野花（实例化），记录每格的实例下标，开垦时隐藏
  var TUFT_IDX = {}, FLOWER_IDX = {}, tuftMesh, flowerMesh;
  (function grassAndFlowers() {
    var R = mulberry(9001);
    var tb = new Build();
    tb.box(0, 0.07, 0, 0.035, 0.14, 0.035, '#ffffff');
    tb.add(GEO.box, [0.045, 0.06, 0.01], [0.03, 0.12, 0.03], '#ffffff', { rot: [0, 0, -0.45] });
    tb.add(GEO.box, [-0.04, 0.055, -0.02], [0.03, 0.11, 0.03], '#ffffff', { rot: [0.2, 0, 0.45] });
    var tgeo = tb.geometry();
    var tufts = [], flowers = [];
    var FLOWER_COLS = ['#e2483a', '#f3efe2', '#f1c84a', '#7f8ee8', '#e889b8', '#ff9a3c'];
    for (var z = 0; z < N; z++) for (var x = 0; x < N; x++) {
      var t = TILES[z][x]; if (!t || t.kind !== 'land' || t.stair) continue;
      var k = key(x, z);
      if (PATHSET[k] || inRect(HOUSE, x, z)) continue;
      var zone = zoneOf(x, z), inYard = inRect(YARD, x, z);
      var nT = zone ? 2 : (inYard ? 3 : 3 + ((R() * 4) | 0));
      for (var i = 0; i < nT; i++) {
        tufts.push({ x: wx(x) + (R() - 0.5) * 0.9, y: t.y, z: wz(z) + (R() - 0.5) * 0.9, s: 0.8 + R() * 0.7, k: k, c: GRASS[t.lv][(R() * 4) | 0] });
      }
      if (zone || inYard) continue;
      // 花丛按区域聚团
      var patch = hash2(Math.floor(x / 3) * 5.1, Math.floor(z / 3) * 2.7);
      var nF = patch > 0.55 ? ((R() * 6) | 0) : (R() < 0.25 ? 1 : 0);
      var fc = FLOWER_COLS[(hash2(Math.floor(x / 3), Math.floor(z / 4) + 9) * FLOWER_COLS.length) | 0];
      for (var j = 0; j < nF; j++) {
        flowers.push({ x: wx(x) + (R() - 0.5) * 0.85, y: t.y + 0.13 + R() * 0.06, z: wz(z) + (R() - 0.5) * 0.85, k: k, c: R() < 0.8 ? fc : FLOWER_COLS[(R() * 6) | 0] });
      }
    }
    var tmat = new THREE.MeshLambertMaterial({ vertexColors: true });
    tuftMesh = new THREE.InstancedMesh(tgeo, tmat, tufts.length);
    var m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(), col = new THREE.Color();
    tufts.forEach(function (o, i) {
      q.setFromEuler(e.set(0, R() * 6.283, 0));
      m.compose(p.set(o.x, o.y, o.z), q, s.set(o.s, o.s, o.s));
      tuftMesh.setMatrixAt(i, m);
      col.set(o.c).offsetHSL(0, 0.04, 0.03 + (R() - 0.5) * 0.06);
      tuftMesh.setColorAt(i, col);
      (TUFT_IDX[o.k] = TUFT_IDX[o.k] || []).push(i);
    });
    tuftMesh.receiveShadow = true;
    scene.add(tuftMesh);
    flowerMesh = new THREE.InstancedMesh(GEO.box, new THREE.MeshLambertMaterial(), Math.max(1, flowers.length));
    flowers.forEach(function (o, i) {
      m.compose(p.set(o.x, o.y, o.z), q.identity(), s.set(0.07, 0.06, 0.07));
      flowerMesh.setMatrixAt(i, m);
      flowerMesh.setColorAt(i, col.set(o.c));
      (FLOWER_IDX[o.k] = FLOWER_IDX[o.k] || []).push(i);
    });
    flowerMesh.receiveShadow = true;
    scene.add(flowerMesh);
  })();
  var ZERO_M = new THREE.Matrix4().makeScale(0, 0, 0);
  function clearTileGrass(k) {
    (TUFT_IDX[k] || []).forEach(function (i) { tuftMesh.setMatrixAt(i, ZERO_M); });
    (FLOWER_IDX[k] || []).forEach(function (i) { flowerMesh.setMatrixAt(i, ZERO_M); });
    tuftMesh.instanceMatrix.needsUpdate = true; flowerMesh.instanceMatrix.needsUpdate = true;
    delete TUFT_IDX[k]; delete FLOWER_IDX[k];
  }

  // ======================================================================
  // 建筑与道具（合并为一个静态网格）
  // ======================================================================
  var glowB = new Build();
  var LAMPS = [], CHIMNEY = new THREE.Vector3(), COOP_DOOR = new THREE.Vector3(), SIGNS = {};
  var windmillBlades;
  (function buildProps() {
    var b = deco, R = mulberry(31337);
    // 石板小路
    PATHS.forEach(function (p) {
      var t = tile(p[0], p[1]); if (!t || t.kind !== 'land' || t.stair) return;
      var X = wx(p[0]), Z = wz(p[1]);
      for (var i = 0; i < 2; i++) {
        var ox = (i ? 0.2 : -0.2) + (R() - 0.5) * 0.12, oz = (i ? -0.18 : 0.2) + (R() - 0.5) * 0.12;
        b.add(GEO.cyl6, [X + ox, t.y + 0.02, Z + oz], [0.22 + R() * 0.06, 0.05, 0.2 + R() * 0.05], ['#cdb894', '#c2ab84', '#b9a07a'], { r: R, rot: [0, R() * 3, 0] });
      }
    });

    // ---- 农舍 ----
    var hx = wx(10), hz = wz(11), hy = 1.0;
    var W = 2.5, D = 2.2, H = 1.25;
    b.box(hx, hy + 0.1, hz, W + 0.2, 0.2, D + 0.2, '#7e7364'); // 石基
    b.box(hx, hy + 0.2 + H / 2, hz, W, H, D, '#e6dcc3', 0, 0.02); // 墙
    // 木框
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (o) { b.box(hx + o[0] * (W / 2), hy + 0.2 + H / 2, hz + o[1] * (D / 2), 0.13, H, 0.13, '#5b3b24'); });
    b.box(hx, hy + 0.2 + H - 0.05, hz + D / 2 + 0.01, W, 0.1, 0.06, '#5b3b24');
    b.box(hx, hy + 0.62, hz + D / 2 + 0.01, W, 0.07, 0.05, '#6a4529');
    b.box(hx - 0.42, hy + 0.2 + H / 2, hz + D / 2 + 0.01, 0.08, H, 0.05, '#5b3b24');
    b.box(hx + 0.42, hy + 0.2 + H / 2, hz + D / 2 + 0.01, 0.08, H, 0.05, '#5b3b24');
    // 门 & 台阶
    b.box(hx, hy + 0.2 + 0.42, hz + D / 2 + 0.03, 0.46, 0.84, 0.06, '#7a4b2a');
    b.box(hx + 0.13, hy + 0.62, hz + D / 2 + 0.07, 0.05, 0.05, 0.04, '#e3c15a');
    b.box(hx, hy + 0.08, hz + D / 2 + 0.28, 0.8, 0.12, 0.36, '#9a9282');
    // 窗（发光材质单独拼）
    [[-0.85, D / 2 + 0.03, 0], [0.85, D / 2 + 0.03, 0]].forEach(function (w) {
      glowB.box(hx + w[0], hy + 0.82, hz + w[1], 0.42, 0.38, 0.05, '#ffffff');
      b.box(hx + w[0], hy + 0.82, hz + w[1] + 0.02, 0.05, 0.42, 0.05, '#5b3b24');
      b.box(hx + w[0], hy + 0.82, hz + w[1] + 0.02, 0.46, 0.05, 0.05, '#5b3b24');
      b.box(hx + w[0], hy + 0.58, hz + w[1] + 0.08, 0.5, 0.1, 0.16, '#6a4529');
      for (var f = 0; f < 4; f++) b.box(hx + w[0] - 0.18 + f * 0.12, hy + 0.67, hz + w[1] + 0.09, 0.07, 0.07, 0.07, ['#e2483a', '#f1c84a', '#e889b8']);
    });
    glowB.box(hx + W / 2 + 0.03, hy + 0.82, hz - 0.3, 0.05, 0.38, 0.42, '#ffffff');
    glowB.box(hx - W / 2 - 0.03, hy + 0.82, hz + 0.3, 0.05, 0.38, 0.42, '#ffffff');
    // 屋顶：两块斜板 + 瓦片条纹
    var roofY = hy + 0.2 + H, slope = 0.62, rl = (D / 2 + 0.3) / Math.cos(slope);
    for (var sd = -1; sd <= 1; sd += 2) {
      for (var r = 0; r < 5; r++) {
        var frac = (r + 0.5) / 5, along = rl * (frac - 0.5);
        var cy = roofY + Math.sin(slope) * rl / 2 + Math.sin(slope) * -along;
        var cz = hz + sd * (Math.cos(slope) * rl / 2 + Math.cos(slope) * along);
        b.add(GEO.box, [hx, cy, cz], [W + 0.5, 0.12, rl / 5 + 0.02], r % 2 ? '#b14b31' : '#bf5636', { rot: [sd * slope, 0, 0], jit: 0.04 });
      }
    }
    // 山墙
    var gb = new THREE.BufferGeometry();
    var ridge = roofY + Math.tan(slope) * (D / 2);
    [-1, 1].forEach(function (sx) {
      var X = hx + sx * (W / 2 - 0.01);
      if (sx > 0) b.quad([X, roofY, hz + D / 2], [X, roofY, hz - D / 2], [X, ridge, hz], [X, ridge, hz], [1, 0, 0], '#d9cdb1');
      else b.quad([X, roofY, hz - D / 2], [X, roofY, hz + D / 2], [X, ridge, hz], [X, ridge, hz], [-1, 0, 0], '#d9cdb1');
    });
    gb.dispose();
    b.box(hx, roofY + Math.tan(slope) * (D / 2 + 0.3) + 0.02, hz, W + 0.55, 0.1, 0.16, '#8e3826');
    // 烟囱
    b.box(hx + 0.75, ridge - 0.05, hz - 0.45, 0.32, 0.9, 0.32, '#8a7f72', 0, 0.05);
    b.box(hx + 0.75, ridge + 0.42, hz - 0.45, 0.38, 0.08, 0.38, '#6f665b');
    CHIMNEY.set(hx + 0.75, ridge + 0.5, hz - 0.45);
    // 门边的木桶与箱子
    b.add(GEO.cyl8, [hx - 1.55, hy + 0.22, hz + 1.2], [0.2, 0.44, 0.2], '#7a5232');
    b.box(hx + 1.55, hy + 0.17, hz + 1.15, 0.34, 0.34, 0.34, '#9a6a3c', 0.3, 0.05);
    b.box(hx + 1.5, hy + 0.45, hz + 1.2, 0.24, 0.22, 0.24, '#b07a45', 0.7, 0.05);

    // ---- 水井 ----
    var wX = wx(7), wZ = wz(11), wY = 1.0;
    b.add(GEO.cyl8, [wX, wY + 0.22, wZ], [0.42, 0.44, 0.42], '#8d8a80', { jit: 0.06 });
    b.add(GEO.cyl8, [wX, wY + 0.45, wZ], [0.3, 0.02, 0.3], '#2c4f60');
    b.box(wX - 0.36, wY + 0.7, wZ, 0.07, 0.6, 0.07, '#5b3b24'); b.box(wX + 0.36, wY + 0.7, wZ, 0.07, 0.6, 0.07, '#5b3b24');
    b.add(GEO.box, [wX, wY + 1.08, wZ - 0.2], [0.95, 0.06, 0.5], '#a5492f', { rot: [0.55, 0, 0] });
    b.add(GEO.box, [wX, wY + 1.08, wZ + 0.2], [0.95, 0.06, 0.5], '#b5532f', { rot: [-0.55, 0, 0] });
    b.add(GEO.cyl6, [wX, wY + 0.85, wZ], [0.06, 0.7, 0.06], '#6a4529', { rot: [0, 0, Math.PI / 2] });
    b.box(wX, wY + 0.62, wZ, 0.14, 0.16, 0.14, '#7a5232');

    // ---- 长椅（看池塘）----
    var bX = wx(7) + 0.1, bZ = wz(16), bY = 1.0;
    b.box(bX, bY + 0.24, bZ, 0.3, 0.05, 0.9, '#8a5a34');
    b.box(bX + 0.13, bY + 0.42, bZ, 0.05, 0.25, 0.9, '#8a5a34');
    b.box(bX, bY + 0.11, bZ - 0.38, 0.26, 0.22, 0.06, '#5b3b24'); b.box(bX, bY + 0.11, bZ + 0.38, 0.26, 0.22, 0.06, '#5b3b24');

    // ---- 木桥 (5,19) ----
    var brX = wx(5), brZ = wz(19);
    for (var p = 0; p < 7; p++) {
      var px = brX - 0.9 + p * 0.3, arch = Math.sin(p / 6 * Math.PI) * 0.12;
      b.box(px, 1.02 + arch, brZ, 0.27, 0.07, 0.86, p % 2 ? '#8a5a34' : '#7d5130', 0, 0.04);
    }
    [-1, 1].forEach(function (s) {
      for (var p2 = 0; p2 < 4; p2++) b.box(brX - 0.9 + p2 * 0.6, 1.2 + Math.sin(p2 / 3 * Math.PI) * 0.12, brZ + s * 0.42, 0.06, 0.34, 0.06, '#5b3b24');
      b.add(GEO.box, [brX - 0.45, 1.36 + 0.06, brZ + s * 0.42], [0.95, 0.05, 0.05], '#6a4529', { rot: [0, 0, 0.14] });
      b.add(GEO.box, [brX + 0.45, 1.36 + 0.06, brZ + s * 0.42], [0.95, 0.05, 0.05], '#6a4529', { rot: [0, 0, -0.14] });
    });
    // 池塘小码头
    for (var d = 0; d < 4; d++) b.box(wx(6) + 0.2 - d * 0.28, 0.98, wz(15) + 0.2, 0.25, 0.06, 0.6, d % 2 ? '#8a5a34' : '#7d5130');
    b.box(wx(6) - 0.75, 0.75, wz(15) - 0.05, 0.07, 0.5, 0.07, '#5b3b24'); b.box(wx(6) - 0.75, 0.75, wz(15) + 0.45, 0.07, 0.5, 0.07, '#5b3b24');

    // ---- 路灯 ----
    [[11.55, 13.55], [6.6, 18.6], [13.5, 7.5]].forEach(function (l) {
      var X = wx(0) + l[0] - 0.5, Z = wz(0) + l[1] - 0.5, Y = groundAt(X, Z);
      b.box(X, Y + 0.05, Z, 0.2, 0.1, 0.2, '#3b3b3b');
      b.box(X, Y + 0.6, Z, 0.07, 1.1, 0.07, '#2f2f33');
      b.box(X, Y + 1.27, Z, 0.24, 0.05, 0.24, '#2f2f33');
      glowB.box(X, Y + 1.15, Z, 0.16, 0.2, 0.16, '#ffffff');
      LAMPS.push(new THREE.Vector3(X, Y + 1.15, Z));
    });

    // ---- 鸡舍与围栏 ----
    var cx = wx(20) + 0.5, cz = wz(7) + 0.1, cy = 1.0;
    for (var leg = 0; leg < 4; leg++) b.box(cx + (leg % 2 ? 0.6 : -0.6), cy + 0.15, cz + (leg < 2 ? -0.35 : 0.35), 0.08, 0.3, 0.08, '#5b3b24');
    b.box(cx, cy + 0.62, cz, 1.4, 0.64, 0.86, ['#9b6a3c'], 0, 0.04);
    for (var pl = 0; pl < 6; pl++) b.box(cx - 0.6 + pl * 0.24, cy + 0.62, cz + 0.44, 0.03, 0.64, 0.02, '#7d5130');
    b.add(GEO.box, [cx, cy + 1.08, cz - 0.26], [1.6, 0.08, 0.62], '#b14b31', { rot: [0.6, 0, 0], jit: 0.04 });
    b.add(GEO.box, [cx, cy + 1.08, cz + 0.26], [1.6, 0.08, 0.62], '#bf5636', { rot: [-0.6, 0, 0], jit: 0.04 });
    b.box(cx - 0.3, cy + 0.52, cz + 0.45, 0.3, 0.36, 0.04, '#3a2617');
    b.add(GEO.box, [cx - 0.3, cy + 0.17, cz + 0.72], [0.28, 0.04, 0.62], '#8a5a34', { rot: [0.55, 0, 0] });
    COOP_DOOR.set(cx - 0.3, cy, cz + 1.05);
    // 草垛
    b.box(wx(21) + 0.1, cy + 0.18, wz(10) - 0.1, 0.5, 0.36, 0.38, '#d8b65a', 0.2, 0.05);
    b.box(wx(21) - 0.2, cy + 0.15, wz(9) + 0.2, 0.42, 0.3, 0.34, '#cfac50', -0.3, 0.05);
    // 食槽
    b.box(wx(18) + 0.2, cy + 0.1, wz(8), 0.5, 0.14, 0.22, '#7d5130');
    b.box(wx(18) + 0.2, cy + 0.17, wz(8), 0.42, 0.03, 0.15, '#e0c060');
    // 围栏
    function fence(x0, z0, x1, z1, gapAt) {
      var len = Math.hypot(x1 - x0, z1 - z0), n = Math.round(len / 0.5);
      for (var i = 0; i <= n; i++) {
        var f = i / n, X = x0 + (x1 - x0) * f, Z = z0 + (z1 - z0) * f;
        if (gapAt && Math.hypot(X - gapAt[0], Z - gapAt[1]) < 0.4) continue;
        b.box(X, 1.0 + 0.22, Z, 0.07, 0.44, 0.07, '#7d5130');
      }
      var ang = Math.atan2(z1 - z0, x1 - x0);
      var segs = gapAt ? 2 : 1;
      if (!gapAt) {
        b.add(GEO.box, [(x0 + x1) / 2, 1.33, (z0 + z1) / 2], [len, 0.05, 0.04], '#8a5a34', { rot: [0, -ang, 0] });
        b.add(GEO.box, [(x0 + x1) / 2, 1.15, (z0 + z1) / 2], [len, 0.05, 0.04], '#8a5a34', { rot: [0, -ang, 0] });
      } else {
        var gx = gapAt[0], gz = gapAt[1], g0 = 0.35;
        var d0 = Math.hypot(gx - x0, gz - z0) - g0, d1 = Math.hypot(x1 - gx, z1 - gz) - g0;
        var ux = (x1 - x0) / len, uz = (z1 - z0) / len;
        [[x0, z0, d0], [gx + ux * g0, gz + uz * g0, d1]].forEach(function (s) {
          [1.33, 1.15].forEach(function (yy) { b.add(GEO.box, [s[0] + ux * s[2] / 2, yy, s[1] + uz * s[2] / 2], [s[2], 0.05, 0.04], '#8a5a34', { rot: [0, -ang, 0] }); });
        });
      }
      return segs;
    }
    var fx0 = wx(YARD.x0) - 0.45, fx1 = wx(YARD.x1) + 0.45, fz0 = wz(YARD.z0) - 0.45, fz1 = wz(YARD.z1) + 0.45;
    fence(fx0, fz1, fx1, fz1);
    fence(fx1, fz0, fx1, fz1);
    fence(fx0, fz0, fx0, fz1, [fx0, wz(9)]);

    // ---- 风车（山顶）----
    var mX = wx(WINDMILL.x) - 0.5, mZ = wz(WINDMILL.z) - 0.5, mY = 2.0;
    b.add(GEO.cyl8, [mX, mY + 0.15, mZ], [0.95, 0.3, 0.95], '#7e7364');
    b.add(GEO.cyl8, [mX, mY + 1.3, mZ], [0.72, 2.1, 0.72], '#e3d7bd', { jit: 0.03, pre: new THREE.Matrix4().makeScale(1, 1, 1) });
    b.add(GEO.cone8, [mX, mY + 2.75, mZ], [0.9, 0.85, 0.9], '#9b4430', { jit: 0.03 });
    b.box(mX, mY + 0.55, mZ + 0.7, 0.4, 0.7, 0.06, '#6a4529');
    glowB.box(mX, mY + 1.55, mZ + 0.71, 0.24, 0.26, 0.04, '#ffffff');
    var bl = new Build();
    for (var a = 0; a < 4; a++) {
      var ang = a * Math.PI / 2;
      var pre = new THREE.Matrix4().makeRotationZ(ang);
      bl.add(GEO.box, [0, 0, 0], [1, 1, 1], '#5b3b24', { pre: new THREE.Matrix4().multiplyMatrices(pre, new THREE.Matrix4().compose(new THREE.Vector3(0, 0.75, 0), new THREE.Quaternion(), new THREE.Vector3(0.07, 1.5, 0.06))) });
      bl.add(GEO.box, [0, 0, 0], [1, 1, 1], ['#efe6d0', '#e6dcc3'], { pre: new THREE.Matrix4().multiplyMatrices(pre, new THREE.Matrix4().compose(new THREE.Vector3(0.17, 0.85, 0.02), new THREE.Quaternion(), new THREE.Vector3(0.28, 1.15, 0.03))) });
    }
    bl.add(GEO.cyl8, [0, 0, 0], [0.12, 0.2, 0.12], '#5b3b24', { rot: [Math.PI / 2, 0, 0] });
    windmillBlades = bl.mesh();
    windmillBlades.position.set(mX, mY + 2.05, mZ + 0.78);
    scene.add(windmillBlades);

    // ---- 蜂箱（台地右侧）----
    [[19.3, 4.5], [20.5, 4.6], [20, 5.6]].forEach(function (h) {
      var X = wx(0) + h[0] - 0.5, Z = wz(0) + h[1] - 0.5, Y = groundAt(X, Z);
      b.box(X, Y + 0.08, Z, 0.36, 0.16, 0.36, '#7d5130');
      b.box(X, Y + 0.3, Z, 0.3, 0.28, 0.3, '#f0d48a', 0, 0.03);
      b.box(X, Y + 0.47, Z, 0.36, 0.06, 0.36, '#b87b3a');
    });

    // ---- 扩建区的木牌 ----
    ['A', 'B'].forEach(function (k) {
      var zn = ZONES[k], sb = new Build();
      var X = (wx(zn.x0) + wx(zn.x1)) / 2, Z = (wz(zn.z0) + wz(zn.z1)) / 2;
      sb.box(0, 0.35, 0, 0.07, 0.7, 0.07, '#5b3b24');
      sb.box(0, 0.62, 0.04, 0.62, 0.36, 0.06, '#a5703d', 0, 0.03);
      sb.box(0, 0.62, 0.08, 0.2, 0.16, 0.02, '#f3c75b');
      var m = sb.mesh(); m.position.set(X, 1.0, Z); m.rotation.y = Math.PI / 4;
      scene.add(m); SIGNS[k] = m;
      // 地面木桩轮廓
      var ob = new Build();
      [[zn.x0, zn.z0], [zn.x1, zn.z0], [zn.x0, zn.z1], [zn.x1, zn.z1]].forEach(function (c) {
        ob.box(wx(c[0]) + (c[0] === zn.x0 ? -0.42 : 0.42), 0.12, wz(c[1]) + (c[1] === zn.z0 ? -0.42 : 0.42), 0.07, 0.24, 0.07, '#a5703d');
      });
      var om = ob.mesh(); om.position.y = 1.0; scene.add(om); SIGNS[k + '_posts'] = om;
    });

    // ---- 树桩 / 倒木 ----
    b.add(GEO.cyl8, [wx(15), 1.5 + 0.1, wz(5)], [0.22, 0.2, 0.22], '#6a4529');
    b.add(GEO.cyl8, [wx(15), 1.5 + 0.205, wz(5)], [0.19, 0.01, 0.19], '#c79a63');
    b.add(GEO.cyl8, [wx(3) + 0.2, 1.0 + 0.12, wz(10)], [0.13, 0.95, 0.13], '#6a4529', { rot: [0, 0.4, Math.PI / 2] });
  })();
  scene.add(deco.mesh());
  var glowMesh = glowB.mesh(MAT.glow, false, false);
  scene.add(glowMesh);

  // 灯光（夜间）
  var houseLight = new THREE.PointLight(0xffb35a, 0, 6, 1.6);
  houseLight.position.set(wx(10), 1.9, wz(11) + 1.9); scene.add(houseLight);
  var lampLights = LAMPS.map(function (p) { var l = new THREE.PointLight(0xffc06a, 0, 5, 1.6); l.position.copy(p); scene.add(l); return l; });

  // ======================================================================
  // 动物、农夫、云、粒子
  // ======================================================================
  function chickenMesh(brown) {
    var b = new Build(), body = brown ? '#b8763e' : '#f3eee4';
    b.box(0, 0.2, 0, 0.24, 0.2, 0.3, body);
    b.box(0, 0.33, 0.13, 0.14, 0.16, 0.13, body);
    b.box(0, 0.43, 0.13, 0.04, 0.06, 0.1, '#d8342c');
    b.box(0, 0.32, 0.22, 0.05, 0.04, 0.06, '#f0a020');
    b.box(0, 0.27, 0.19, 0.03, 0.05, 0.03, '#d8342c');
    b.box(0, 0.26, -0.17, 0.16, 0.14, 0.08, brown ? '#8f5528' : '#e6dfd1');
    b.box(0.13, 0.21, 0, 0.03, 0.12, 0.2, brown ? '#9c6331' : '#e3dccd');
    b.box(-0.13, 0.21, 0, 0.03, 0.12, 0.2, brown ? '#9c6331' : '#e3dccd');
    b.box(0.05, 0.05, 0, 0.03, 0.1, 0.03, '#e7a43a'); b.box(-0.05, 0.05, 0, 0.03, 0.1, 0.03, '#e7a43a');
    var m = b.mesh(); m.scale.setScalar(0.95); return m;
  }
  function duckMesh() {
    var b = new Build();
    b.box(0, 0.08, 0, 0.22, 0.13, 0.32, '#8a6a4a');
    b.box(0, 0.1, -0.02, 0.24, 0.08, 0.24, '#6f553c');
    b.box(0, 0.24, 0.13, 0.12, 0.13, 0.12, '#2f7d4a');
    b.box(0, 0.2, 0.23, 0.07, 0.035, 0.09, '#f0b030');
    b.box(0, 0.16, 0.12, 0.13, 0.025, 0.1, '#f3eee4');
    b.box(0, 0.13, -0.17, 0.1, 0.08, 0.06, '#3a3a3a');
    return b.mesh(MAT.vc, true, false);
  }
  function farmerMesh() {
    var g = new THREE.Group(), b = new Build();
    b.box(0, 0.42, 0, 0.26, 0.28, 0.17, '#d9573b');
    b.box(0, 0.36, 0.005, 0.24, 0.2, 0.18, '#3f6aa8');
    b.box(0.07, 0.42, 0.09, 0.04, 0.24, 0.02, '#3f6aa8'); b.box(-0.07, 0.42, 0.09, 0.04, 0.24, 0.02, '#3f6aa8');
    b.box(0, 0.68, 0, 0.2, 0.2, 0.19, '#f1c9a0');
    b.box(0, 0.72, -0.02, 0.21, 0.13, 0.17, '#6a4529');
    b.add(GEO.cyl8, [0, 0.8, 0], [0.24, 0.03, 0.24], '#e3c463');
    b.add(GEO.cyl8, [0, 0.86, 0], [0.12, 0.1, 0.12], '#d8b655');
    b.box(0, 0.83, 0, 0.25, 0.025, 0.25, '#b0463a');
    b.box(0.04, 0.69, 0.1, 0.03, 0.03, 0.01, '#2a2a2a'); b.box(-0.04, 0.69, 0.1, 0.03, 0.03, 0.01, '#2a2a2a');
    var body = b.mesh(); g.add(body);
    var legL = new Build().box(0, -0.12, 0, 0.09, 0.24, 0.1, '#2e4f80').box(0, -0.22, 0.02, 0.1, 0.05, 0.13, '#4a3020').mesh();
    var legR = legL.clone();
    legL.position.set(0.065, 0.26, 0); legR.position.set(-0.065, 0.26, 0);
    var armL = new Build().box(0, -0.1, 0, 0.07, 0.22, 0.08, '#d9573b').box(0, -0.22, 0, 0.07, 0.06, 0.07, '#f1c9a0').mesh();
    var armR = armL.clone();
    armL.position.set(0.17, 0.54, 0); armR.position.set(-0.17, 0.54, 0);
    g.add(legL, legR, armL, armR);
    g.userData = { legL: legL, legR: legR, armL: armL, armR: armR, body: body };
    return g;
  }
  var EGG_GEO = new Build().add(GEO.ico1, [0, 0.09, 0], [0.075, 0.095, 0.075], '#f6efe2', { shade: 0.05 }).geometry();
  var DROP_GEO = new Build().box(0, 0, 0, 0.1, 0.1, 0.1, '#5fb8ff').box(0, 0.08, 0, 0.05, 0.06, 0.05, '#5fb8ff').geometry();

  // 粒子（实例化小方块）
  var PART_MAX = 520;
  var partMesh = new THREE.InstancedMesh(GEO.box, MAT.part, PART_MAX);
  partMesh.frustumCulled = false;
  var parts = [], partFree = [];
  for (var pi = 0; pi < PART_MAX; pi++) { partFree.push(pi); partMesh.setMatrixAt(pi, ZERO_M); partMesh.setColorAt(pi, _c.set('#ffffff')); }
  scene.add(partMesh);
  function spawn(x, y, z, o) {
    if (!partFree.length) return;
    var i = partFree.pop();
    parts.push({
      i: i, x: x, y: y, z: z, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0,
      g: o.g == null ? 6 : o.g, life: o.life || 0.8, age: 0, s: o.s || 0.06, grow: o.grow || 0, drag: o.drag || 0
    });
    partMesh.setColorAt(i, _c.set(o.c || '#ffffff'));
    partMesh.instanceColor.needsUpdate = true;
  }
  function burst(x, y, z, n, o) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * 6.283, sp = (o.sp || 1.6) * (0.4 + Math.random() * 0.8);
      spawn(x + (Math.random() - 0.5) * (o.r || 0.3), y, z + (Math.random() - 0.5) * (o.r || 0.3), {
        vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: (o.up || 2.4) * (0.5 + Math.random() * 0.7),
        c: [].concat(o.c)[(Math.random() * [].concat(o.c).length) | 0], life: (o.life || 0.6) * (0.7 + Math.random() * 0.5), s: (o.s || 0.06) * (0.7 + Math.random() * 0.6), g: o.g
      });
    }
  }
  var _pm = new THREE.Matrix4(), _pp = new THREE.Vector3(), _ps = new THREE.Vector3(), _pq = new THREE.Quaternion();
  function updateParts(dt) {
    for (var k = parts.length - 1; k >= 0; k--) {
      var p = parts[k];
      p.age += dt;
      if (p.age >= p.life) { partMesh.setMatrixAt(p.i, ZERO_M); partFree.push(p.i); parts.splice(k, 1); continue; }
      p.vy -= p.g * dt;
      if (p.drag) { var dr = Math.exp(-p.drag * dt); p.vx *= dr; p.vz *= dr; p.vy *= dr; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      var s = (p.s + p.grow * p.age) * (1 - Math.pow(p.age / p.life, 3));
      _pm.compose(_pp.set(p.x, p.y, p.z), _pq, _ps.set(s, s, s));
      partMesh.setMatrixAt(p.i, _pm);
    }
    partMesh.instanceMatrix.needsUpdate = true;
  }

  // 萤火虫
  var FF_N = 46, ffPos = new Float32Array(FF_N * 3), ffData = [];
  for (var fi = 0; fi < FF_N; fi++) {
    var fx, fz, tt2;
    do { fx = (Math.random() - 0.5) * 20; fz = (Math.random() - 0.5) * 20; tt2 = tile(Math.floor(fx + HALF), Math.floor(fz + HALF)); } while (!tt2);
    ffData.push({ x: fx, z: fz, y: groundAt(fx, fz) + 0.4 + Math.random() * 0.9, ph: Math.random() * 6.283, sp: 0.3 + Math.random() * 0.4 });
  }
  var ffGeo = new THREE.BufferGeometry(); ffGeo.setAttribute('position', new THREE.BufferAttribute(ffPos, 3));
  var ffMat = new THREE.PointsMaterial({ color: 0xe6ff8a, size: 1, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  var fireflies = new THREE.Points(ffGeo, ffMat); fireflies.frustumCulled = false; scene.add(fireflies);

  // 雨
  var RAIN_N = 1400, rainPos = new Float32Array(RAIN_N * 6), rainV = new Float32Array(RAIN_N);
  function resetDrop(i, top) {
    var x = (Math.random() - 0.5) * 34, z = (Math.random() - 0.5) * 34, y = top ? 12 + Math.random() * 3 : -6 + Math.random() * 20;
    rainPos[i * 6] = x; rainPos[i * 6 + 1] = y; rainPos[i * 6 + 2] = z;
    rainPos[i * 6 + 3] = x; rainPos[i * 6 + 4] = y + 0.35; rainPos[i * 6 + 5] = z;
    rainV[i] = 13 + Math.random() * 5;
  }
  for (var ri = 0; ri < RAIN_N; ri++) resetDrop(ri, false);
  var rainGeo = new THREE.BufferGeometry(); rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  var rainMat = new THREE.LineBasicMaterial({ color: 0xbfd8ee, transparent: true, opacity: 0.55, depthWrite: false });
  var rain = new THREE.LineSegments(rainGeo, rainMat); rain.frustumCulled = false; scene.add(rain);
  rainGeo.setDrawRange(0, 0);

  // 云（投下移动的云影）
  var CLOUDS = [];
  (function makeClouds() {
    var R = mulberry(555);
    for (var i = 0; i < 9; i++) {
      var b = new Build(), n = 4 + ((R() * 3) | 0);
      for (var k = 0; k < n; k++) {
        var s = 0.7 + R() * 0.6;
        b.add(GEO.ico1, [(k - n / 2) * 0.75 + R() * 0.3, R() * 0.35 + (k === (n >> 1) ? 0.3 : 0), (R() - 0.5) * 0.9], [s, s * 0.72, s], '#ffffff', { r: R, jit: 0.03, shade: 0.08 });
      }
      var m = b.mesh(MAT.cloud, true, false);
      m.position.set((R() - 0.5) * 40, 7.5 + R() * 2.5, (R() - 0.5) * 30);
      m.scale.setScalar(0.01);
      scene.add(m);
      CLOUDS.push({ m: m, sp: 0.4 + R() * 0.4, need: i / 9, sz: 0.8 + R() * 0.5, cur: 0 });
    }
  })();

  // 悬停格子框
  var hoverGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.48, 0, -0.48), new THREE.Vector3(0.48, 0, -0.48), new THREE.Vector3(0.48, 0, 0.48), new THREE.Vector3(-0.48, 0, 0.48)]);
  var hoverMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthTest: false });
  var hoverBox = new THREE.LineLoop(hoverGeo, hoverMat); hoverBox.visible = false; hoverBox.renderOrder = 10; scene.add(hoverBox);

  // ======================================================================
  // 存档状态
  // ======================================================================
  var store = KIT.store('sky-farm');
  var DEF = function () {
    return {
      v: 1, coins: 60, xp: 0, plots: {}, zones: { main: true }, chickens: 2, sprinkler: false, eggs: [],
      order: null, time: 8, flow: true, dayLen: 12, weather: 'clear', autoWx: true, day: 1,
      seed: 'carrot', harvested: 0, at: Date.now(), welcomed: false,
      set: { px: 2, dither: true, outline: true, music: true }
    };
  };
  var S = store.get('save', null);
  if (!S || S.v !== 1) S = DEF();
  (function fill() { var d = DEF(); for (var k in d) if (S[k] === undefined) S[k] = d[k]; for (var k2 in d.set) if (S.set[k2] === undefined) S.set[k2] = d.set[k2]; })();
  function save() { S.at = Date.now(); store.set('save', S); }
  function level() { return lvFromXp(S.xp); }

  // ======================================================================
  // 农田
  // ======================================================================
  var PLOT_MESH = {};
  var dropMesh = new THREE.InstancedMesh(DROP_GEO, new THREE.MeshBasicMaterial({ vertexColors: true }), 64);
  dropMesh.frustumCulled = false; scene.add(dropMesh);
  for (var di = 0; di < 64; di++) dropMesh.setMatrixAt(di, ZERO_M);

  function cropShape(b, crop, stage, X, Y, Z, R) {
    var furrowZ = [-0.27, 0, 0.27];
    if (stage === 0) { furrowZ.forEach(function (fz) { for (var i = 0; i < 3; i++) b.box(X - 0.27 + i * 0.27, Y + 0.02, Z + fz, 0.05, 0.03, 0.05, '#e5d394'); }); return; }
    if (stage === 1) {
      furrowZ.forEach(function (fz) {
        for (var i = 0; i < 3; i++) {
          var x = X - 0.27 + i * 0.27;
          b.box(x, Y + 0.06, Z + fz, 0.03, 0.1, 0.03, '#6fbf45');
          b.box(x + 0.04, Y + 0.1, Z + fz, 0.07, 0.025, 0.04, '#86d455');
          b.box(x - 0.04, Y + 0.09, Z + fz, 0.07, 0.025, 0.04, '#7ccd4c');
        }
      });
      return;
    }
    var big = stage === 3;
    if (crop === 'carrot') {
      furrowZ.forEach(function (fz) {
        for (var i = 0; i < 3; i++) {
          var x = X - 0.27 + i * 0.27 + (R() - 0.5) * 0.04;
          var h = big ? 0.24 : 0.16;
          b.add(GEO.box, [x, Y + h / 2, Z + fz], [0.04, h, 0.04], '#4f9a35', { rot: [0, 0, 0.3] });
          b.add(GEO.box, [x, Y + h / 2, Z + fz], [0.04, h, 0.04], '#5aa83c', { rot: [0, 0, -0.3] });
          b.add(GEO.box, [x, Y + h / 2 + 0.02, Z + fz], [0.04, h, 0.04], '#4a8f31', { rot: [0.35, 0, 0] });
          if (big) b.box(x, Y + 0.03, Z + fz, 0.1, 0.07, 0.1, '#ea7a2b');
        }
      });
    } else if (crop === 'wheat') {
      for (var a = 0; a < 3; a++) for (var c = 0; c < 4; c++) {
        var x = X - 0.3 + c * 0.2 + (R() - 0.5) * 0.06, z = Z + furrowZ[a] + (R() - 0.5) * 0.06;
        var h2 = big ? 0.5 + R() * 0.08 : 0.3;
        var col = big ? '#d6b04a' : '#8fbf4a';
        b.box(x, Y + h2 / 2, z, 0.03, h2, 0.03, col);
        if (big) b.box(x, Y + h2 + 0.05, z, 0.06, 0.13, 0.06, ['#f0cf5a', '#e8c24c']);
        else b.box(x + 0.03, Y + h2 * 0.6, z, 0.07, 0.02, 0.03, '#9fcf55');
      }
    } else if (crop === 'strawberry') {
      furrowZ.forEach(function (fz, ri) {
        for (var i = 0; i < 2; i++) {
          var x = X - 0.18 + i * 0.36 + (ri % 2 ? 0.08 : -0.04);
          b.add(GEO.ico0, [x, Y + 0.08, Z + fz], [big ? 0.15 : 0.11, big ? 0.09 : 0.07, big ? 0.15 : 0.11], ['#3f8a35', '#4a9a3c'], { r: R, jit: 0.06, shade: 0.1, rot: [0, R() * 3, 0] });
          if (big) {
            for (var k = 0; k < 3; k++) b.box(x + (R() - 0.5) * 0.2, Y + 0.08 + R() * 0.05, Z + fz + (R() - 0.5) * 0.18, 0.06, 0.07, 0.06, '#e3303a');
          } else b.box(x, Y + 0.16, Z + fz, 0.05, 0.05, 0.05, '#f4f1e6');
        }
      });
    } else if (crop === 'pumpkin') {
      for (var l = 0; l < 4; l++) b.add(GEO.box, [X + (R() - 0.5) * 0.6, Y + 0.05, Z + (R() - 0.5) * 0.6], [0.24, 0.03, 0.18], ['#3f8a35', '#4a9a3c'], { rot: [0, R() * 3, 0.15] });
      var ps = big ? [[-0.16, 0.12, 1], [0.2, -0.16, 0.8]] : [[-0.12, 0.1, 0.55], [0.18, -0.14, 0.45]];
      ps.forEach(function (p) {
        var s = p[2];
        b.add(GEO.ico1, [X + p[0], Y + 0.13 * s, Z + p[1]], [0.24 * s, 0.17 * s, 0.24 * s], big ? ['#e8861e', '#f09428'] : '#7fb04a', { r: R, jit: 0.04, shade: 0.1 });
        b.box(X + p[0], Y + 0.3 * s, Z + p[1], 0.04, 0.08, 0.04, '#5a7a2a');
      });
    } else if (crop === 'sunflower') {
      for (var j = 0; j < 3; j++) {
        var sx = X - 0.24 + j * 0.24, sz = Z + (j % 2 ? 0.18 : -0.12);
        var hh = big ? 0.85 + R() * 0.12 : 0.42;
        b.box(sx, Y + hh / 2, sz, 0.045, hh, 0.045, '#4f8a35');
        b.add(GEO.box, [sx + 0.08, Y + hh * 0.45, sz], [0.16, 0.03, 0.09], '#5a9a3c', { rot: [0, 0, 0.3] });
        b.add(GEO.box, [sx - 0.08, Y + hh * 0.65, sz], [0.16, 0.03, 0.09], '#5a9a3c', { rot: [0, 0, -0.3] });
        if (big) {
          b.add(GEO.box, [sx, Y + hh + 0.06, sz + 0.03], [0.3, 0.3, 0.05], '#f6c933', { rot: [-0.25, Math.PI / 4, 0] });
          b.add(GEO.box, [sx, Y + hh + 0.06, sz + 0.05], [0.14, 0.14, 0.05], '#6b3f1c', { rot: [-0.25, Math.PI / 4, 0] });
        } else b.box(sx, Y + hh + 0.04, sz, 0.1, 0.08, 0.1, '#7fb04a');
      }
    }
  }
  function rebuildPlot(k) {
    var old = PLOT_MESH[k];
    if (old) { scene.remove(old); old.geometry.dispose(); delete PLOT_MESH[k]; }
    var p = S.plots[k]; if (!p) return;
    var xy = k.split(','), x = +xy[0], z = +xy[1], X = wx(x), Z = wz(z), Y = tile(x, z).y;
    var R = mulberry(x * 97 + z * 13 + (p.stage || 0));
    var b = new Build();
    var soil = p.wet ? '#5b3a22' : '#8b5a34', ridge = p.wet ? '#4c311c' : '#9a6a40';
    b.box(X, Y + 0.035, Z, 0.92, 0.07, 0.92, soil);
    [-0.27, 0, 0.27].forEach(function (fz) { b.box(X, Y + 0.08, Z + fz, 0.84, 0.04, 0.12, ridge); });
    if (p.crop) cropShape(b, p.crop, p.stage, X, Y + 0.09, Z, R);
    var m = b.mesh(); scene.add(m); PLOT_MESH[k] = m;
  }
  function plotNeedsWater(p) { return p.crop && p.stage < 3 && !p.wet; }

  // ======================================================================
  // 动物逻辑
  // ======================================================================
  var CHICKENS = [], DUCKS = [], EGGS = [];
  function addChicken(i) {
    var m = chickenMesh(i % 3 === 2); scene.add(m);
    var c = { m: m, x: wx(18 + (i % 3)), z: wz(8 + (i % 2)), tx: 0, tz: 0, wait: Math.random() * 2, layT: 40 + Math.random() * 40, peck: 0, hop: 0, sleep: false };
    c.tx = c.x; c.tz = c.z;
    CHICKENS.push(c);
  }
  for (var ci = 0; ci < S.chickens; ci++) addChicken(ci);
  for (var dk = 0; dk < 3; dk++) {
    var dm = duckMesh(); scene.add(dm);
    DUCKS.push({ m: dm, a: dk * 2.1, r: 0.9 + dk * 0.35, sp: 0.18 + dk * 0.05, cx: wx(4) + 0.1, cz: wz(16) + 0.2 });
  }
  function eggMeshAt(e) {
    var m = new THREE.Mesh(EGG_GEO, MAT.vc); m.castShadow = true;
    m.position.set(e.x, 1.0, e.z); m.rotation.y = Math.random() * 3; scene.add(m); e.m = m;
  }
  S.eggs.forEach(eggMeshAt);
  var farmer = farmerMesh(); scene.add(farmer);
  var FARMER = { x: wx(10), z: wz(13) + 0.3, tx: wx(10), tz: wz(13) + 0.3, walk: 0, act: 0, idle: 3 };

  // 蝴蝶
  var BUTTERFLIES = [];
  for (var bi = 0; bi < 6; bi++) {
    var g = new THREE.Group(), colr = ['#f3efe2', '#f1c84a', '#e889b8', '#8fb0ff'][bi % 4];
    var wl = new Build().box(0.05, 0, 0, 0.1, 0.01, 0.08, colr).mesh(MAT.vc, false, false), wr = wl.clone();
    wr.scale.x = -1; g.add(wl, wr); scene.add(g);
    var bx = (Math.random() - 0.5) * 14, bz = (Math.random() - 0.5) * 14;
    BUTTERFLIES.push({ g: g, wl: wl, wr: wr, x: bx, z: bz, tx: bx, tz: bz, y: 1.6, ph: Math.random() * 6 });
  }

  // ======================================================================
  // 天色系统
  // ======================================================================
  // 关键帧：小时、太阳色、太阳强度、天空色、地面色、半球强度、背景上 / 下、夜晚度
  var KF = [
    [0, '#7f93d8', 0.42, '#2c3a68', '#11141c', 0.5, '#070b1a', '#141c35', 1],
    [4.6, '#8f98dd', 0.4, '#34406e', '#15171f', 0.52, '#0f1530', '#2a2b4f', 0.95],
    [6, '#ffab7a', 0.9, '#b99ab5', '#4a3b30', 0.68, '#4b5a92', '#f0a688', 0.35],
    [7.4, '#ffe0b8', 1.55, '#bcd4f0', '#5a4a30', 0.85, '#7fb6e6', '#f5d9b5', 0],
    [10, '#fff4e0', 1.95, '#c9e2ff', '#62553a', 0.95, '#69aee8', '#cfe7f4', 0],
    [14, '#ffffff', 2.0, '#cfe6ff', '#665a3c', 0.95, '#64a8e6', '#d3eaf3', 0],
    [16.8, '#ffe7c2', 1.75, '#d6dcef', '#5f4f36', 0.88, '#78a8dc', '#f0dcc0', 0],
    [18.4, '#ff8f55', 1.25, '#f0a596', '#4a3530', 0.75, '#6b6aa8', '#ff9f74', 0.1],
    [19.6, '#a46aa8', 0.55, '#6a5a96', '#2a2430', 0.6, '#2c2f63', '#a3628a', 0.6],
    [21, '#7f93d8', 0.42, '#2c3a68', '#11141c', 0.5, '#0a0e22', '#1a2140', 1],
    [24, '#7f93d8', 0.42, '#2c3a68', '#11141c', 0.5, '#070b1a', '#141c35', 1]
  ].map(function (k) { return { h: k[0], sc: new THREE.Color(k[1]), si: k[2], hs: new THREE.Color(k[3]), hg: new THREE.Color(k[4]), hi: k[5], bt: new THREE.Color(k[6]), bb: new THREE.Color(k[7]), night: k[8] }; });
  var SKY = { sc: new THREE.Color(), si: 1, hs: new THREE.Color(), hg: new THREE.Color(), hi: 1, bt: new THREE.Color(), bb: new THREE.Color(), night: 0 };
  function sampleSky(h, out) {
    h = ((h % 24) + 24) % 24;
    var a = KF[0], b = KF[1];
    for (var i = 0; i < KF.length - 1; i++) if (h >= KF[i].h && h <= KF[i + 1].h) { a = KF[i]; b = KF[i + 1]; break; }
    var f = (h - a.h) / Math.max(1e-6, b.h - a.h);
    f = f * f * (3 - 2 * f);
    out.sc.copy(a.sc).lerp(b.sc, f); out.hs.copy(a.hs).lerp(b.hs, f); out.hg.copy(a.hg).lerp(b.hg, f);
    out.bt.copy(a.bt).lerp(b.bt, f); out.bb.copy(a.bb).lerp(b.bb, f);
    out.si = a.si + (b.si - a.si) * f; out.hi = a.hi + (b.hi - a.hi) * f; out.night = a.night + (b.night - a.night) * f;
    return out;
  }
  var WXS = { cloud: 0.12, rain: 0, wind: 0.25, mist: 0, storm: 0 };
  var flash = 0, nextBolt = 6, wxTimer = 150 + Math.random() * 120;
  var GRAY = new THREE.Color('#8a9098'), STORMBG = new THREE.Color('#3a4250'), MISTC = new THREE.Color('#c9d2cf');
  var _sunDir = new THREE.Vector3(), _moonDir = new THREE.Vector3(-0.45, 0.8, 0.4).normalize();
  var CENTER = new THREE.Vector3(0, 1, 0);

  function applySky(dt) {
    var tgt = WX[S.weather] || WX.clear;
    var k = 1 - Math.exp(-dt * 0.6);
    for (var p in WXS) WXS[p] += (tgt[p] - WXS[p]) * k;
    sampleSky(S.time, SKY);
    var cl = WXS.cloud, rn = WXS.rain, st = WXS.storm, ms = WXS.mist;
    var dim = 1 - 0.42 * Math.max(0, cl - 0.15) - 0.25 * st;
    // 太阳 / 月亮方向
    var h = S.time, s = (h - 5.4) / 14.4;
    var ang = Math.max(0.02, Math.min(Math.PI - 0.02, s * Math.PI));
    _sunDir.set(Math.cos(ang) * 0.85, Math.max(0.22, Math.sin(ang)) * 0.95 + 0.15, -0.38).normalize();
    var nightW = SKY.night;
    var dir = _v.copy(_sunDir).lerp(_moonDir, nightW).normalize();
    sun.position.copy(CENTER).addScaledVector(dir, 40);
    sun.target.position.copy(CENTER);
    sun.color.copy(SKY.sc).lerp(GRAY, cl * 0.5);
    sun.intensity = SKY.si * dim * (1 - 0.3 * ms);
    hemi.color.copy(SKY.hs).lerp(GRAY, cl * 0.45);
    hemi.groundColor.copy(SKY.hg);
    hemi.intensity = SKY.hi * (1 + 0.15 * cl) * (1 - 0.15 * st) + flash * 2.2;
    // 背景
    post.uniforms.uBgTop.value.copy(SKY.bt).lerp(STORMBG, cl * 0.55 * (1 - nightW * 0.6)).lerp(MISTC, ms * 0.6 * (1 - nightW * 0.8));
    post.uniforms.uBgBot.value.copy(SKY.bb).lerp(STORMBG, cl * 0.45 * (1 - nightW * 0.6)).lerp(MISTC, ms * 0.75 * (1 - nightW * 0.8));
    post.uniforms.uNight.value = nightW * (1 - cl * 0.85);
    post.uniforms.uFlash.value = flash;
    // 雾
    scene.fog.color.copy(post.uniforms.uBgBot.value);
    scene.fog.near = 60 - 4 + (1 - ms) * 300;
    scene.fog.far = 60 + 26 + (1 - ms) * 400;
    // 水面颜色随光照
    var lum = Math.min(1.15, 0.1 + SKY.si * 0.4 * dim + SKY.hi * 0.25 + flash * 0.6);
    waterUni.uBright.value = lum;
    waterUni.uTint.value.copy(SKY.hs).lerp(_c.set('#ffffff'), 0.55);
    waterUni.uRain.value = rn;
    // 窗户与灯
    var glow = Math.max(nightW, cl * 0.35 + st * 0.3);
    MAT.glow.color.set('#5c7480').lerp(_c.set('#ffd07a'), Math.min(1, glow * 1.1));
    houseLight.intensity = glow * 4;
    lampLights.forEach(function (l) { l.intensity = glow * 3.2; });
    ffMat.opacity = Math.max(0, nightW * (1 - rn * 1.8)) * 0.95;
    ffMat.size = 1.6 / VIEW.dpr;
    // 云
    MAT.cloud.color.set('#ffffff').lerp(GRAY, Math.min(1, rn * 0.6 + st * 0.4));
    rainGeo.setDrawRange(0, Math.floor(RAIN_N * Math.min(1, rn)) * 2);
    rainMat.opacity = 0.35 + 0.3 * st;
    return glow;
  }

  // ======================================================================
  // 后处理：低分辨率 → 描边 + 抖动 + 背景
  // ======================================================================
  var rt = new THREE.WebGLRenderTarget(16, 16, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, type: THREE.HalfFloatType, depthBuffer: true });
  rt.depthTexture = new THREE.DepthTexture(16, 16);
  var post = new THREE.ShaderMaterial({
    uniforms: {
      tColor: { value: rt.texture }, tDepth: { value: rt.depthTexture }, uLow: { value: new THREE.Vector2(16, 16) }, uPx: { value: 3 },
      uBgTop: { value: new THREE.Color() }, uBgBot: { value: new THREE.Color() }, uNight: { value: 0 }, uFlash: { value: 0 },
      uDither: { value: 1 }, uOutline: { value: 1 }, uTime: { value: 0 }, uLevels: { value: 22 }
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: [
      'uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 uLow; uniform float uPx;',
      'uniform vec3 uBgTop, uBgBot; uniform float uNight, uFlash, uDither, uOutline, uTime, uLevels; varying vec2 vUv;',
      NOISE_GLSL,
      'float b2(vec2 a){ a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }',
      'float bayer4(vec2 a){ return b2(0.5 * a) * 0.25 + b2(a); }',
      'vec3 toSRGB(vec3 c){ c = max(c, vec3(0.0)); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }',
      'float dep(vec2 t){ return texture2D(tDepth, (clamp(t, vec2(0.0), uLow - 1.0) + 0.5) / uLow).r; }',
      'void main(){',
      ' vec2 tc = floor(vUv * uLow);',
      ' vec4 src = texture2D(tColor, (tc + 0.5) / uLow);',
      ' float d = dep(tc);',
      ' vec3 c = src.rgb;',
      ' if (uOutline > 0.5 && d < 0.9999) {',
      '   float dn = max(max(dep(tc + vec2(1.0, 0.0)), dep(tc - vec2(1.0, 0.0))), max(dep(tc + vec2(0.0, 1.0)), dep(tc - vec2(0.0, 1.0))));',
      '   if (dn - d > 0.0035) c *= 0.58;',
      ' }',
      ' float yy = tc.y / uLow.y;',
      ' vec3 bg = mix(uBgBot, uBgTop, smoothstep(0.0, 1.0, yy));',
      ' float st = hh(tc);',
      ' float tw = 0.55 + 0.45 * sin(uTime * 2.3 + st * 80.0);',
      ' bg += vec3(0.9, 0.92, 1.0) * step(0.9968, st) * uNight * tw * smoothstep(0.3, 0.75, yy);',
      ' vec3 col = toSRGB(c + bg * (1.0 - src.a));',
      ' col += uFlash * vec3(0.32, 0.34, 0.4);',
      ' vec2 q = vUv - 0.5; col *= 1.0 - dot(q, q) * 0.35;',
      ' if (uDither > 0.5) col = floor(col * uLevels + bayer4(tc)) / uLevels;',
      ' gl_FragColor = vec4(col, 1.0);',
      '}'
    ].join('\n'),
    depthTest: false, depthWrite: false
  });
  var postScene = new THREE.Scene(), postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  var postQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post); postQuad.frustumCulled = false; postScene.add(postQuad);

  // ======================================================================
  // 相机
  // ======================================================================
  var PITCH = 0.6, BASE_VIEW = 27;
  var CAM = { yaw: Math.PI / 4, yawT: Math.PI / 4, zoom: 1, zoomT: 1, target: new THREE.Vector3(0.2, 0.9, -0.9), tT: new THREE.Vector3(0.2, 0.9, -0.9) };
  var VIEW = { w: 1, h: 1, lowW: 1, lowH: 1, px: 3, dpr: 1 };
  var _right = new THREE.Vector3(), _up = new THREE.Vector3(), _dir = new THREE.Vector3();
  function updateCamera(dt) {
    var k = 1 - Math.exp(-dt * 9);
    CAM.yaw += (CAM.yawT - CAM.yaw) * k;
    CAM.zoom += (CAM.zoomT - CAM.zoom) * k;
    CAM.target.lerp(CAM.tT, k);
    var vh = BASE_VIEW / CAM.zoom, vw = vh * VIEW.w / VIEW.h;
    camera.left = -vw / 2; camera.right = vw / 2; camera.top = vh / 2; camera.bottom = -vh / 2;
    camera.updateProjectionMatrix();
    _dir.set(Math.sin(CAM.yaw) * Math.cos(PITCH), Math.sin(PITCH), Math.cos(CAM.yaw) * Math.cos(PITCH));
    camera.position.copy(CAM.target).addScaledVector(_dir, 60);
    camera.lookAt(CAM.target);
    camera.updateMatrixWorld();
    // 像素对齐：把相机位置吸附到低分辨率纹素网格，平移时画面不闪
    var wpt = vh / VIEW.lowH;
    _right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    _up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    var dx = camera.position.dot(_right), dy = camera.position.dot(_up);
    camera.position.addScaledVector(_right, Math.round(dx / wpt) * wpt - dx).addScaledVector(_up, Math.round(dy / wpt) * wpt - dy);
    camera.updateMatrixWorld();
  }
  function rotateCam(d) { CAM.yawT += d * Math.PI / 2; KIT.tone(520, 0.08, { type: 'triangle', vol: 0.04 }); }
  function resetCam() { CAM.yawT = Math.round((CAM.yaw - Math.PI / 4) / (Math.PI * 2)) * Math.PI * 2 + Math.PI / 4; CAM.zoomT = 1; CAM.tT.set(0.2, 0.9, -0.9); }
  function panBy(dxPx, dyPx) {
    var vh = BASE_VIEW / CAM.zoom, perPx = vh / VIEW.h;
    _right.set(Math.cos(CAM.yaw), 0, -Math.sin(CAM.yaw));
    var fwd = _v2.set(-Math.sin(CAM.yaw), 0, -Math.cos(CAM.yaw));
    CAM.tT.addScaledVector(_right, -dxPx * perPx).addScaledVector(fwd, dyPx * perPx / Math.sin(PITCH));
    CAM.tT.x = Math.max(-11, Math.min(11, CAM.tT.x)); CAM.tT.z = Math.max(-11, Math.min(11, CAM.tT.z));
  }
  function zoomBy(f) { CAM.zoomT = Math.max(0.75, Math.min(3.2, CAM.zoomT * f)); }

  function resize() {
    var r = HOST.getBoundingClientRect();
    var w = Math.max(160, Math.round(r.width)), h = Math.max(120, Math.round(r.height));
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    VIEW.w = w; VIEW.h = h; VIEW.dpr = dpr;
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    var px = Math.max(1, Math.round((S.set.px || 2) * dpr));
    VIEW.px = px;
    VIEW.lowW = Math.ceil(w * dpr / px); VIEW.lowH = Math.ceil(h * dpr / px);
    rt.setSize(VIEW.lowW, VIEW.lowH);
    post.uniforms.uLow.value.set(VIEW.lowW, VIEW.lowH);
    post.uniforms.uPx.value = px;
  }
  if (window.ResizeObserver) new ResizeObserver(resize).observe(HOST);
  window.addEventListener('resize', resize);

  // ======================================================================
  // 音频：环境声 + 轻音乐
  // ======================================================================
  var AU = { on: false };
  var A_PREF = window.AMG_AUDIO || { vol: 0.8, muted: false };
  function startAudio() {
    if (AU.on) return;
    var ac = KIT.audio(); if (!ac) return;
    AU.on = true; AU.ac = ac;
    AU.bus = ac.createGain(); AU.bus.gain.value = 0; AU.bus.connect(ac.destination);
    var buf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate), d = buf.getChannelData(0), last = 0;
    for (var i = 0; i < d.length; i++) { var w = Math.random() * 2 - 1; last = last * 0.6 + w * 0.4; d[i] = w * 0.6 + last * 0.4; }
    function loop(type, freq, q) {
      var s = ac.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = 0.8 + Math.random() * 0.4;
      var f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq; if (q) f.Q.value = q;
      var g = ac.createGain(); g.gain.value = 0;
      s.connect(f); f.connect(g); g.connect(AU.bus); s.start();
      return g;
    }
    AU.rain = loop('highpass', 1200);
    AU.rainLow = loop('lowpass', 500);
    AU.fall = loop('bandpass', 420, 0.6);
    AU.wind = loop('lowpass', 260);
    AU.music = ac.createGain(); AU.music.gain.value = 0.55; AU.music.connect(AU.bus);
    AU.nextNote = ac.currentTime + 0.5; AU.step = 0; AU.chord = 0;
    AU.nextBird = 2; AU.nextCricket = 1;
  }
  function env(g, v, t, a, d) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
  function blip(f, t, dur, vol, type, to, dest) {
    var ac = AU.ac, o = ac.createOscillator(), g = ac.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    env(g, vol, t, 0.01, dur); o.connect(g); g.connect(dest || AU.bus); o.start(t); o.stop(t + dur + 0.05);
  }
  var SCALE = [0, 2, 4, 7, 9];
  var CHORDS = [[48, 55, 64], [45, 52, 60], [41, 48, 57], [43, 50, 59]];
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function updateAudio(dt, glow) {
    if (!AU.on) return;
    var ac = AU.ac, t = ac.currentTime;
    AU.bus.gain.setTargetAtTime(A_PREF.muted ? 0 : A_PREF.vol * 0.9, t, 0.1);
    var rn = WXS.rain, st = WXS.storm;
    AU.rain.gain.setTargetAtTime(rn * 0.16, t, 0.4);
    AU.rainLow.gain.setTargetAtTime(rn * 0.1 + st * 0.08, t, 0.4);
    var fd = Math.hypot(CAM.target.x - FALL_TOP.x, CAM.target.z - FALL_TOP.z);
    AU.fall.gain.setTargetAtTime(0.03 + 0.05 * Math.max(0, 1 - fd / 14) * Math.min(1.5, CAM.zoom), t, 0.4);
    AU.wind.gain.setTargetAtTime(0.02 + WXS.wind * 0.07, t, 0.6);
    var night = SKY.night;
    // 鸟鸣（白天、不下雨）
    AU.nextBird -= dt;
    if (AU.nextBird <= 0) {
      AU.nextBird = 2.5 + Math.random() * 6;
      if (night < 0.4 && rn < 0.3) {
        var base = 2200 + Math.random() * 1800, n = 2 + ((Math.random() * 4) | 0);
        for (var i = 0; i < n; i++) blip(base * (1 + Math.random() * 0.2), t + i * 0.11, 0.08, 0.02, 'sine', base * (1.3 + Math.random() * 0.5));
      }
    }
    // 蟋蟀（夜晚）
    AU.nextCricket -= dt;
    if (AU.nextCricket <= 0) {
      AU.nextCricket = 0.7 + Math.random() * 1.4;
      if (night > 0.5 && rn < 0.4) for (var j = 0; j < 4; j++) blip(4300 + Math.random() * 200, t + j * 0.045, 0.03, 0.008, 'square');
    }
    // 音乐：五声音阶随机拨弦，夜里更慢更轻
    if (S.set.music) {
      var beat = night > 0.5 ? 0.62 : 0.46;
      while (AU.nextNote < t + 0.2) {
        var tt = AU.nextNote;
        if (AU.step % 16 === 0) {
          AU.chord = (AU.chord + 1) % CHORDS.length;
          CHORDS[AU.chord].forEach(function (m, k) { blip(mtof(m), tt + k * 0.02, beat * 7, 0.012, 'triangle', null, AU.music); });
        }
        if (Math.random() < (night > 0.5 ? 0.35 : 0.55)) {
          var root = CHORDS[AU.chord][0] + 24, deg = SCALE[(Math.random() * 5) | 0] + (Math.random() < 0.3 ? 12 : 0);
          blip(mtof(root + deg), tt, beat * 2.2, 0.03 * (night > 0.5 ? 0.7 : 1), 'triangle', null, AU.music);
        }
        AU.step++; AU.nextNote += beat;
      }
    } else AU.nextNote = t + 0.3;
  }
  function thunder(delay) {
    if (!AU.on) return;
    var ac = AU.ac, t = ac.currentTime + delay;
    var s = ac.createBufferSource(); var len = ac.sampleRate * 3, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0), l = 0;
    for (var i = 0; i < len; i++) { l = l * 0.97 + (Math.random() * 2 - 1) * 0.03; d[i] = l * 6; }
    s.buffer = buf;
    var f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 300;
    var g = ac.createGain(); env(g, 0.7, t, 0.05, 2.6);
    s.connect(f); f.connect(g); g.connect(AU.bus); s.start(t);
  }
  var SFX = {
    till: function () { KIT.noise(0.12, { vol: 0.12, lp: 900 }); KIT.tone(110, 0.1, { type: 'triangle', vol: 0.08, to: 70 }); },
    plant: function () { KIT.tone(660, 0.07, { type: 'sine', vol: 0.06, to: 880 }); },
    water: function () { KIT.noise(0.28, { vol: 0.06, hp: 2200 }); KIT.tone(900, 0.12, { vol: 0.03, to: 1300 }); },
    harvest: function () { KIT.arp([523, 659, 784], 0.06, { vol: 0.06, type: 'triangle' }); },
    coin: function () { KIT.tone(1318, 0.06, { type: 'square', vol: 0.025 }); KIT.tone(1760, 0.12, { type: 'square', vol: 0.025, delay: 0.06 }); },
    egg: function () { KIT.tone(700, 0.06, { type: 'square', vol: 0.03, to: 500 }); KIT.tone(600, 0.08, { type: 'square', vol: 0.03, to: 420, delay: 0.09 }); },
    cluck: function () { KIT.tone(520, 0.05, { type: 'square', vol: 0.03, to: 380 }); KIT.tone(560, 0.07, { type: 'square', vol: 0.03, to: 360, delay: 0.08 }); },
    quack: function () { KIT.tone(300, 0.12, { type: 'sawtooth', vol: 0.04, to: 220 }); },
    no: function () { KIT.tone(200, 0.12, { type: 'square', vol: 0.035, to: 150 }); },
    ui: function () { KIT.tone(780, 0.05, { type: 'triangle', vol: 0.035 }); },
    level: function () { KIT.arp([523, 659, 784, 1046], 0.09, { vol: 0.07, type: 'triangle', dur: 0.22 }); },
    buy: function () { KIT.arp([392, 523, 659], 0.07, { vol: 0.06, type: 'triangle' }); }
  };

  // ======================================================================
  // UI 辅助
  // ======================================================================
  var FLOATS = $('floats'), TIP = $('tip'), TOAST = $('toast');
  var _proj = new THREE.Vector3();
  function screenOf(x, y, z) {
    _proj.set(x, y, z).project(camera);
    return { x: (_proj.x * 0.5 + 0.5) * VIEW.w, y: (-_proj.y * 0.5 + 0.5) * VIEW.h };
  }
  function floatText(x, y, z, text, cls) {
    var p = screenOf(x, y, z), el = document.createElement('div');
    el.className = 'fl ' + (cls || ''); el.textContent = text;
    el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
    FLOATS.appendChild(el);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 1250);
  }
  function toast(t, c) { KIT.toast(TOAST, t, c); }
  function fmtTime(h) { var hh = Math.floor(h), mm = Math.floor((h - hh) * 60 / 10) * 10; return (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm; }
  function phaseOf(h) {
    if (h < 4.6) return 'ph_late'; if (h < 7.2) return 'ph_dawn'; if (h < 11) return 'ph_morning'; if (h < 14) return 'ph_noon';
    if (h < 17.6) return 'ph_after'; if (h < 19.8) return 'ph_dusk'; return 'ph_night';
  }
  function wxIcon(id) { for (var i = 0; i < WEATHERS.length; i++) if (WEATHERS[i].id === id) return WEATHERS[i].icon; return '☀️'; }
  function cropName(id) { return T('c_' + id); }

  // ======================================================================
  // 游戏逻辑
  // ======================================================================
  var tool = 'hand';
  function addCoins(n, at) {
    S.coins += n;
    if (at && n) floatText(at.x, at.y, at.z, (n > 0 ? '+' : '') + n + ' 🪙', n > 0 ? 'gold' : 'bad');
    renderHUD();
  }
  function addXp(n) {
    var before = level();
    S.xp += n;
    var after = level();
    if (after > before) {
      SFX.level();
      var unlocked = CROPS.filter(function (c) { return c.lv === after; })[0];
      toast(T('levelUp', after) + (unlocked ? ' · ' + T('unlock', unlocked.icon + ' ' + cropName(unlocked.id)) : ''), '#fff3b0');
      renderSeeds(); renderShop();
    }
    renderHUD();
  }
  function newOrder() {
    var lv = level(), pool = CROPS.filter(function (c) { return c.lv <= lv; });
    var c = pool[(Math.random() * pool.length) | 0];
    var need = 3 + ((Math.random() * (2 + Math.min(4, lv))) | 0);
    S.order = { crop: c.id, need: need, have: 0, reward: Math.round(need * c.sell * 0.6 / 5) * 5 + 10, xp: need * 2 + 4 };
    renderOrder();
  }
  function farmerGo(x, z) {
    var X = wx(x), Z = wz(z);
    var dx = FARMER.x - X, dz = FARMER.z - Z, d = Math.hypot(dx, dz) || 1;
    FARMER.tx = X + dx / d * 0.75; FARMER.tz = Z + dz / d * 0.75;
    FARMER.act = 0.35; FARMER.idle = 5 + Math.random() * 4;
    FARMER.face = Math.atan2(X - FARMER.tx, Z - FARMER.tz);
  }

  function till(x, z) {
    var k = key(x, z);
    S.plots[k] = { crop: null, stage: 0, prog: 0, wet: WXS.rain > 0.45 };
    clearTileGrass(k); rebuildPlot(k);
    var Y = tile(x, z).y;
    burst(wx(x), Y + 0.1, wz(z), 10, { c: ['#8b5a34', '#6e4a2d', '#a7774a'], sp: 1.2, up: 2.2, s: 0.07, g: 9 });
    SFX.till(); farmerGo(x, z);
    return true;
  }
  function plant(x, z, silent) {
    var k = key(x, z), p = S.plots[k], c = CROP[S.seed];
    if (!c || c.lv > level()) { if (!silent) { SFX.no(); toast(T('needLv', c ? c.lv : 1), '#ffd0c4'); } return false; }
    if (S.coins < c.cost) { if (!silent) { SFX.no(); toast(T('noMoney'), '#ffd0c4'); } return false; }
    p.crop = c.id; p.stage = 0; p.prog = 0;
    var Y = tile(x, z).y + 0.3;
    addCoins(-c.cost, { x: wx(x), y: Y, z: wz(z) });
    rebuildPlot(k); SFX.plant(); farmerGo(x, z);
    burst(wx(x), Y - 0.1, wz(z), 6, { c: ['#e5d394', '#7fcf4a'], sp: 0.8, up: 1.8, s: 0.05 });
    return true;
  }
  function water(x, z, auto) {
    var k = key(x, z), p = S.plots[k];
    p.wet = true; rebuildPlot(k);
    var Y = tile(x, z).y;
    for (var i = 0; i < 14; i++) spawn(wx(x) + (Math.random() - 0.5) * 0.8, Y + 0.7 + Math.random() * 0.3, wz(z) + (Math.random() - 0.5) * 0.8, { vy: -2, c: ['#7cc8ff', '#a9dcff'][i % 2], s: 0.05, life: 0.4, g: 8 });
    if (auto) { KIT.noise(0.18, { vol: 0.025, hp: 2600 }); return true; }
    SFX.water(); farmerGo(x, z);
    return true;
  }
  function harvest(x, z) {
    var k = key(x, z), p = S.plots[k], c = CROP[p.crop];
    var Y = tile(x, z).y + 0.5, at = { x: wx(x), y: Y, z: wz(z) };
    var gain = c.sell + ((Math.random() * 4) | 0);
    p.crop = null; p.stage = 0; p.prog = 0; p.wet = WXS.rain > 0.45;
    rebuildPlot(k);
    addCoins(gain, at);
    setTimeout(function () { floatText(at.x, at.y + 0.4, at.z, '+' + c.xp + ' ⭐', 'xp'); }, 160);
    burst(at.x, Y - 0.2, at.z, 12, { c: ['#ffe27a', '#ffffff', '#9be07a'], sp: 1.4, up: 3, s: 0.06 });
    SFX.harvest(); setTimeout(SFX.coin, 120); farmerGo(x, z);
    S.harvested++;
    if (S.order && S.order.crop === c.id) {
      S.order.have++;
      if (S.order.have >= S.order.need) {
        var o = S.order; S.order = null;
        setTimeout(function () {
          addCoins(o.reward); toast(T('orderDone', o.reward), '#fff3b0'); SFX.buy(); addXp(o.xp);
          setTimeout(newOrder, 1500);
        }, 500);
      }
      renderOrder();
    }
    addXp(c.xp);
    return true;
  }
  function collectEgg(e) {
    var i = S.eggs.indexOf(e); if (i < 0) return;
    S.eggs.splice(i, 1);
    if (e.m) { scene.remove(e.m); }
    addCoins(EGG_PRICE, { x: e.x, y: 1.4, z: e.z }); addXp(1);
    burst(e.x, 1.15, e.z, 8, { c: ['#f6efe2', '#ffe27a'], sp: 1, up: 2.4, s: 0.05 });
    SFX.egg(); setTimeout(SFX.coin, 100);
  }

  // 一次点击 / 涂抹的动作。返回 true 表示有效
  function actionFor(x, z, tl) {
    var zk = zoneOf(x, z);
    if (!zk) return null;
    if (!S.zones[zk]) return 'locked';
    var p = S.plots[key(x, z)];
    if (tl === 'hand') {
      if (!p) return 'till';
      if (p.crop && p.stage >= 3) return 'harvest';
      if (plotNeedsWater(p)) return 'water';
      if (!p.crop) return 'plant';
      return 'wait';
    }
    if (tl === 'hoe') return p ? null : 'till';
    if (tl === 'seed') return p && !p.crop ? 'plant' : null;
    if (tl === 'water') return p && !p.wet && !(p.crop && p.stage >= 3) ? 'water' : null;
    return null;
  }
  function doAction(x, z, tl, painting) {
    var a = actionFor(x, z, tl);
    if (a === 'till') return till(x, z);
    if (a === 'plant') return plant(x, z, painting);
    if (a === 'water') return water(x, z);
    if (a === 'harvest') return harvest(x, z);
    if (a === 'locked' && !painting) { SFX.no(); toast(T('zoneLocked'), '#ffe9b0'); openPanel('pShop'); return false; }
    return false;
  }
  function eggNear(px, pz) {
    var best = null, bd = 0.6;
    S.eggs.forEach(function (e) { var d = Math.hypot(e.x - px, e.z - pz); if (d < bd) { bd = d; best = e; } });
    return best;
  }
  function chickenNear(px, pz) {
    var best = null, bd = 0.55;
    CHICKENS.forEach(function (c) { if (c.sleep) return; var d = Math.hypot(c.x - px, c.z - pz); if (d < bd) { bd = d; best = c; } });
    return best;
  }
  function clickWorld(hit) {
    var px = hit.point.x, pz = hit.point.z, x = Math.floor(px + HALF), z = Math.floor(pz + HALF);
    var e = eggNear(px, pz); if (e) { collectEgg(e); return; }
    var c = chickenNear(px, pz);
    if (c) { SFX.cluck(); c.hop = 0.5; floatText(c.x, 1.7, c.z, '♥', 'bad'); return; }
    if (doAction(x, z, tool, false)) return;
    // 彩蛋式小互动
    if (Math.hypot(px - (wx(WINDMILL.x) - 0.5), pz - (wz(WINDMILL.z) - 0.5)) < 1.4) { windBoost = 3; KIT.noise(0.4, { vol: 0.05, lp: 700 }); return; }
    var t = tile(x, z);
    if (t && t.kind === 'water') {
      var dd = DUCKS.filter(function (d) { return Math.hypot(d.m.position.x - px, d.m.position.z - pz) < 1.2; })[0];
      if (dd) { SFX.quack(); dd.spin = 1; return; }
      for (var i = 0; i < 8; i++) spawn(px, WATER_Y + 0.05, pz, { vx: Math.cos(i) * 0.8, vz: Math.sin(i) * 0.8, vy: 1.4, c: '#d8f3ef', s: 0.05, life: 0.4, g: 7 });
      KIT.tone(900, 0.05, { vol: 0.02, to: 400 });
    }
  }

  // ======================================================================
  // 输入
  // ======================================================================
  var raycaster = new THREE.Raycaster(), _ndc = new THREE.Vector2();
  function pickAt(cx, cy) {
    var r = CANVAS.getBoundingClientRect();
    _ndc.set((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(_ndc, camera);
    var hits = raycaster.intersectObject(pickMesh, false);
    return hits.length ? hits[0] : null;
  }
  var ptrs = {}, drag = null, hover = null, lastPaint = null, pinch = null;
  function tileOfHit(h) { return h ? { x: Math.floor(h.point.x + HALF), z: Math.floor(h.point.z + HALF) } : null; }
  CANVAS.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  CANVAS.addEventListener('pointerdown', function (e) {
    startAudio(); closePanels();
    try { CANVAS.setPointerCapture(e.pointerId); } catch (err) {}
    ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
    var ids = Object.keys(ptrs);
    if (ids.length === 2) {
      var a = ptrs[ids[0]], b = ptrs[ids[1]];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
      drag = null; return;
    }
    var panBtn = e.button === 1 || e.button === 2;
    drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, moved: false, pan: panBtn || tool === 'hand', id: e.pointerId };
    if (!drag.pan) {
      var h = pickAt(e.clientX, e.clientY), t = tileOfHit(h);
      lastPaint = t ? key(t.x, t.z) : null;
      if (h) {
        var eg = eggNear(h.point.x, h.point.z);
        if (eg) collectEgg(eg); else if (t) doAction(t.x, t.z, tool, false);
      }
    }
    HOST.classList.toggle('grabbing', drag.pan);
  });
  CANVAS.addEventListener('pointermove', function (e) {
    if (ptrs[e.pointerId]) { ptrs[e.pointerId].x = e.clientX; ptrs[e.pointerId].y = e.clientY; }
    var ids = Object.keys(ptrs);
    if (pinch && ids.length >= 2) {
      var a = ptrs[ids[0]], b = ptrs[ids[1]];
      var d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      if (pinch.d > 0) zoomBy(d / pinch.d);
      panBy(cx - pinch.cx, cy - pinch.cy);
      pinch.d = d; pinch.cx = cx; pinch.cy = cy;
      return;
    }
    if (drag && drag.id === e.pointerId) {
      if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) > 6) drag.moved = true;
      if (drag.pan) {
        if (drag.moved) panBy(e.clientX - drag.x, e.clientY - drag.y);
      } else {
        var t = tileOfHit(pickAt(e.clientX, e.clientY));
        if (t && key(t.x, t.z) !== lastPaint) { lastPaint = key(t.x, t.z); doAction(t.x, t.z, tool, true); }
      }
      drag.x = e.clientX; drag.y = e.clientY;
    }
    if (e.pointerType === 'mouse') updateHover(e.clientX, e.clientY);
  });
  function endPtr(e) {
    delete ptrs[e.pointerId];
    if (pinch && Object.keys(ptrs).length < 2) { pinch = null; drag = null; }
    if (drag && drag.id === e.pointerId) {
      if (drag.pan && !drag.moved && e.button !== 2 && e.button !== 1) {
        var h = pickAt(e.clientX, e.clientY);
        if (h) clickWorld(h);
      }
      drag = null; lastPaint = null;
    }
    HOST.classList.remove('grabbing');
  }
  CANVAS.addEventListener('pointerup', endPtr);
  CANVAS.addEventListener('pointercancel', endPtr);
  CANVAS.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') { hover = null; TIP.classList.add('hidden'); } });
  CANVAS.addEventListener('wheel', function (e) { e.preventDefault(); zoomBy(Math.exp(-e.deltaY * 0.0015)); }, { passive: false });

  var hoverMouse = null;
  function updateHover(cx, cy) { hoverMouse = { x: cx, y: cy }; }
  function refreshHover() {
    if (!hoverMouse) { hoverBox.visible = false; return; }
    var h = pickAt(hoverMouse.x, hoverMouse.y), t = tileOfHit(h);
    if (!t || !tile(t.x, t.z)) { hoverBox.visible = false; TIP.classList.add('hidden'); hover = null; return; }
    hover = t;
    var y = topY(t.x, t.z) + 0.1;
    var pl = S.plots[key(t.x, t.z)]; if (pl) y += 0.08;
    hoverBox.position.set(wx(t.x), y, wz(t.z)); hoverBox.visible = true;
    var a = actionFor(t.x, t.z, tool);
    var egg = h && eggNear(h.point.x, h.point.z);
    hoverMat.color.set(egg ? '#ffe27a' : (a === 'locked' ? '#ff9a7a' : (a && a !== 'wait' ? '#ffffff' : '#9fb0a0')));
    // 提示
    var html = '';
    if (egg) html = '🥚 ' + T('tipEgg', EGG_PRICE);
    else if (a === 'locked') { var zk = zoneOf(t.x, t.z), zn = ZONES[zk]; html = '🔒 <span class="no">' + T('tipLocked', zn.price, zn.lv) + '</span>'; }
    else if (pl && pl.crop) {
      var c = CROP[pl.crop], pct = pl.stage >= 3 ? 100 : Math.floor(((pl.stage + pl.prog / (c.grow / 3)) / 3) * 100);
      html = c.icon + ' <b>' + cropName(c.id) + '</b> · ' + (pl.stage >= 3 ? '<span class="ok">' + T('tipRipe') + '</span>' : T('tipGrow', pct));
      if (plotNeedsWater(pl)) html += '<br><span class="warn">💧 ' + T('tipThirsty') + '</span>';
      else if (pl.stage < 3) { var left = Math.ceil((c.grow / 3) * (3 - pl.stage) - pl.prog); html += '<br><span class="s">' + T('tipLeft', left) + '</span>'; }
    } else if (pl) html = '🟫 ' + T('tipSoil') + (a === 'plant' ? '<br><span class="s">' + T('tipPlant', CROP[S.seed].icon + ' ' + cropName(S.seed), CROP[S.seed].cost) + '</span>' : '');
    else if (a === 'till') html = '🌿 ' + T('tipTill');
    if (html) {
      TIP.innerHTML = html; TIP.classList.remove('hidden');
      var r = FRAME.getBoundingClientRect();
      var lx = hoverMouse.x - r.left + 16, ly = hoverMouse.y - r.top + 14;
      if (lx + TIP.offsetWidth > r.width - 8) lx = hoverMouse.x - r.left - TIP.offsetWidth - 12;
      if (ly + TIP.offsetHeight > r.height - 70) ly = hoverMouse.y - r.top - TIP.offsetHeight - 10;
      TIP.style.left = lx + 'px'; TIP.style.top = ly + 'px';
    } else TIP.classList.add('hidden');
  }

  var KEYS = {};
  document.addEventListener('keydown', function (e) {
    var tg = e.target && e.target.tagName;
    if (/INPUT|SELECT|TEXTAREA/.test(tg) || e.ctrlKey || e.metaKey || e.altKey) return;
    var k = e.key.toLowerCase();
    if (!$('welcome').classList.contains('hidden')) { if (k === 'enter' || k === ' ') { e.preventDefault(); $('btnStart').click(); } return; }
    if (k === '1') setTool('hand'); else if (k === '2') setTool('hoe'); else if (k === '3') setTool('seed'); else if (k === '4') setTool('water');
    else if (k === 'q') rotateCam(-1); else if (k === 'e') rotateCam(1);
    else if (k === 'r') resetCam();
    else if (k === '+' || k === '=') zoomBy(1.2); else if (k === '-' || k === '_') zoomBy(1 / 1.2);
    else if (k === 't') togglePanel('pSky'); else if (k === 'b') togglePanel('pShop');
    else if (k === 'escape') closePanels();
    else if (k === ' ') { e.preventDefault(); S.flow = !S.flow; renderSky(); toast(S.flow ? T('flowOn') : T('flowOff')); }
    else if (k === 'f') toggleFs();
    else if (/^(w|a|s|d|arrowup|arrowdown|arrowleft|arrowright)$/.test(k)) { KEYS[k] = true; if (k.indexOf('arrow') === 0) e.preventDefault(); }
    startAudio();
  });
  document.addEventListener('keyup', function (e) { KEYS[e.key.toLowerCase()] = false; });
  function keyPan(dt) {
    var dx = 0, dy = 0, sp = 520 * dt;
    if (KEYS.a || KEYS.arrowleft) dx += sp; if (KEYS.d || KEYS.arrowright) dx -= sp;
    if (KEYS.w || KEYS.arrowup) dy += sp; if (KEYS.s || KEYS.arrowdown) dy -= sp;
    if (dx || dy) panBy(dx, dy);
  }

  // ======================================================================
  // 面板
  // ======================================================================
  var PANELS = ['pSeed', 'pSky', 'pShop', 'pSet'];
  function closePanels() { PANELS.forEach(function (id) { $(id).classList.add('hidden'); }); syncDock(); }
  function openPanel(id) { PANELS.forEach(function (p) { $(p).classList.toggle('hidden', p !== id); }); if (id === 'pSky') drawDial(); syncDock(); }
  function togglePanel(id) { if ($(id).classList.contains('hidden')) { openPanel(id); SFX.ui(); } else closePanels(); }
  document.querySelectorAll('[data-close]').forEach(function (b) { b.addEventListener('click', closePanels); });
  function setTool(t) {
    tool = t; HOST.classList.toggle('grab', t === 'hand');
    syncDock(); SFX.ui();
  }
  function syncDock() {
    document.querySelectorAll('#dock .tool').forEach(function (b) { b.classList.toggle('on', b.dataset.tool === tool); });
    $('bSky').classList.toggle('on', !$('pSky').classList.contains('hidden'));
    $('bShop').classList.toggle('on', !$('pShop').classList.contains('hidden'));
    $('bSet').classList.toggle('on', !$('pSet').classList.contains('hidden'));
    $('seedIc').textContent = CROP[S.seed].icon;
  }
  document.querySelectorAll('#dock .tool').forEach(function (b) {
    b.addEventListener('click', function () {
      startAudio();
      var t = b.dataset.tool;
      if (t === 'seed') { if (tool === 'seed' && !$('pSeed').classList.contains('hidden')) closePanels(); else { setTool('seed'); openPanel('pSeed'); } return; }
      closePanels(); setTool(t);
    });
  });
  $('bSky').addEventListener('click', function () { startAudio(); togglePanel('pSky'); });
  $('bShop').addEventListener('click', function () { startAudio(); togglePanel('pShop'); });
  $('bSet').addEventListener('click', function () { startAudio(); togglePanel('pSet'); });
  // 面板内的点击不要穿透
  PANELS.concat(['dock', 'order']).forEach(function (id) { $(id).addEventListener('pointerdown', function (e) { e.stopPropagation(); }); });

  function renderSeeds() {
    var box = $('seedList'); box.innerHTML = '';
    var lv = level();
    CROPS.forEach(function (c) {
      var b = document.createElement('button'); b.type = 'button';
      var lock = c.lv > lv;
      b.className = 'seed' + (S.seed === c.id ? ' on' : '') + (lock ? ' lock' : '');
      b.innerHTML = '<span class="e">' + c.icon + '</span><span class="n">' + cropName(c.id) + '</span>' +
        '<span class="p">' + (lock ? '🔒 Lv ' + c.lv : '-' + c.cost + ' 🪙<br>+' + c.sell + ' 🪙') + '</span>' +
        '<span class="d">' + T('seedDesc', c.grow) + '</span>';
      b.addEventListener('click', function () {
        if (lock) { SFX.no(); return; }
        S.seed = c.id; renderSeeds(); syncDock(); SFX.ui(); closePanels(); setTool('seed');
      });
      box.appendChild(b);
    });
    var dex = $('dex'); dex.innerHTML = '';
    CROPS.forEach(function (c) {
      dex.insertAdjacentHTML('beforeend', '<div class="ic">' + c.icon + '</div><span><b>' + cropName(c.id) + '</b> · ' + T('dexLine', c.lv, c.cost, c.sell, c.grow) + '</span>');
    });
  }
  function shopItems() {
    return [
      { id: 'A', icon: '🌱', price: ZONES.A.price, lv: ZONES.A.lv, owned: !!S.zones.A, name: T('shopA'), desc: T('shopAd') },
      { id: 'B', icon: '🌾', price: ZONES.B.price, lv: ZONES.B.lv, owned: !!S.zones.B, name: T('shopB'), desc: T('shopBd') },
      { id: 'chicken', icon: '🐔', price: 90 + 45 * Math.max(0, S.chickens - 2), lv: 1, owned: S.chickens >= MAX_CHICKENS, name: T('shopChick'), desc: T('shopChickd', S.chickens, MAX_CHICKENS) },
      { id: 'sprinkler', icon: '💦', price: 880, lv: 5, owned: !!S.sprinkler, name: T('shopSpr'), desc: T('shopSprd') }
    ];
  }
  var shopSig = '';
  function renderShop(force) {
    var lv = level();
    var sig = shopItems().map(function (it) { return [it.owned, S.coins >= it.price, lv >= it.lv, it.price].join(); }).join('|') + T('shopTitle');
    if (!force && sig === shopSig) return;
    shopSig = sig;
    var box = $('shopList'); box.innerHTML = '';
    shopItems().forEach(function (it) {
      var d = document.createElement('div'); d.className = 'item';
      var label = it.owned ? T('owned') : (lv < it.lv ? '🔒 Lv ' + it.lv : it.price + ' 🪙');
      d.innerHTML = '<div class="t"><span class="e">' + it.icon + '</span>' + it.name + '</div><div class="d">' + it.desc + '</div>';
      var b = document.createElement('button'); b.type = 'button'; b.textContent = label;
      b.disabled = it.owned || lv < it.lv || S.coins < it.price;
      b.addEventListener('click', function () { buy(it); });
      d.appendChild(b); box.appendChild(d);
    });
  }
  function buy(it) {
    if (it.owned || S.coins < it.price || level() < it.lv) { SFX.no(); return; }
    S.coins -= it.price; SFX.buy();
    if (it.id === 'A' || it.id === 'B') {
      S.zones[it.id] = true; applyZoneVisuals();
      var zn = ZONES[it.id];
      for (var z = zn.z0; z <= zn.z1; z++) for (var x = zn.x0; x <= zn.x1; x++) burst(wx(x), 1.1, wz(z), 3, { c: ['#9be07a', '#ffe27a'], sp: 0.8, up: 2.4, s: 0.06 });
      toast(T('boughtZone'), '#fff3b0');
      CAM.tT.set((wx(zn.x0) + wx(zn.x1)) / 2, 0.9, (wz(zn.z0) + wz(zn.z1)) / 2);
    } else if (it.id === 'chicken') {
      addChicken(S.chickens); S.chickens++;
      toast(T('boughtChick'), '#fff3b0');
      floatText(wx(19), 1.8, wz(8.5), '🐔', '');
    } else if (it.id === 'sprinkler') {
      S.sprinkler = true; applyZoneVisuals();
      toast(T('boughtSpr'), '#fff3b0');
    }
    renderShop(); renderHUD(); save();
  }
  var sprinklerMeshes = [];
  function applyZoneVisuals() {
    ['A', 'B'].forEach(function (k) { SIGNS[k].visible = !S.zones[k]; SIGNS[k + '_posts'].visible = !S.zones[k]; });
    sprinklerMeshes.forEach(function (m) { scene.remove(m); }); sprinklerMeshes = [];
    if (S.sprinkler) {
      [[12.5, 13.5], [12.5, 17.5], [18.5, 15]].forEach(function (p) {
        var b = new Build(), X = wx(0) + p[0], Z = wz(0) + p[1] - 0.5;
        b.box(0, 0.25, 0, 0.06, 0.5, 0.06, '#7f8a92'); b.box(0, 0.52, 0, 0.18, 0.06, 0.06, '#9aa5ad'); b.box(0, 0.52, 0, 0.06, 0.06, 0.18, '#9aa5ad');
        var m = b.mesh(); m.position.set(X - 0.5, 1.0, Z); scene.add(m); sprinklerMeshes.push(m);
      });
    }
  }

  // ---------- 天色面板 ----------
  var DIAL = $('dial'), dctx = DIAL.getContext('2d');
  var _dialSky = { sc: new THREE.Color(), hs: new THREE.Color(), hg: new THREE.Color(), bt: new THREE.Color(), bb: new THREE.Color() };
  function drawDial() {
    if ($('pSky').classList.contains('hidden')) return;
    var W = 168, c = dctx, cx = W / 2, cy = W / 2, R = 70;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (DIAL.width !== W * dpr) { DIAL.width = W * dpr; DIAL.height = W * dpr; }
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, W);
    // 24 段天色环（午夜在下，正午在上）
    for (var i = 0; i < 96; i++) {
      var h = i / 4, a0 = Math.PI / 2 + (i / 96) * Math.PI * 2, a1 = a0 + Math.PI * 2 / 96 + 0.01;
      sampleSky(h, _dialSky);
      c.beginPath(); c.arc(cx, cy, R, a0, a1); c.arc(cx, cy, R - 14, a1, a0, true); c.closePath();
      c.fillStyle = '#' + _dialSky.bb.clone().lerp(_dialSky.bt, 0.4).getHexString(THREE.SRGBColorSpace);
      c.fill();
    }
    c.fillStyle = 'rgba(255,255,255,.55)'; c.font = '10px ui-monospace,monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
    [[0, '0'], [6, '6'], [12, '12'], [18, '18']].forEach(function (t) {
      var a = Math.PI / 2 + t[0] / 24 * Math.PI * 2;
      c.fillText(t[1], cx + Math.cos(a) * (R - 25), cy + Math.sin(a) * (R - 25));
    });
    var a = Math.PI / 2 + S.time / 24 * Math.PI * 2, hx = cx + Math.cos(a) * (R - 7), hy = cy + Math.sin(a) * (R - 7);
    c.beginPath(); c.arc(hx, hy, 11, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill();
    c.font = '13px system-ui'; c.fillText(SKY.night > 0.5 ? '🌙' : '☀️', hx, hy + 1);
    c.fillStyle = '#f4f1e4'; c.font = '700 20px ui-monospace,monospace'; c.fillText(fmtTime(S.time), cx, cy - 6);
    c.font = '12px system-ui'; c.fillStyle = 'rgba(244,241,228,.7)'; c.fillText(T(phaseOf(S.time)), cx, cy + 14);
  }
  var dialDrag = false;
  function dialSet(e) {
    var r = DIAL.getBoundingClientRect(), x = e.clientX - r.left - r.width / 2, y = e.clientY - r.top - r.height / 2;
    var a = Math.atan2(y, x) - Math.PI / 2; if (a < 0) a += Math.PI * 2;
    S.time = (a / (Math.PI * 2) * 24) % 24; renderSky(); renderHUD();
  }
  DIAL.addEventListener('pointerdown', function (e) { dialDrag = true; try { DIAL.setPointerCapture(e.pointerId); } catch (err) {} dialSet(e); });
  DIAL.addEventListener('pointermove', function (e) { if (dialDrag) dialSet(e); });
  DIAL.addEventListener('pointerup', function () { dialDrag = false; save(); });
  function renderSky() {
    var tc = $('timeChips'); tc.innerHTML = '';
    TIME_PRESETS.forEach(function (p) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = T('tp_' + p[0]);
      if (Math.abs(S.time - p[1]) < 0.3) b.classList.add('on');
      b.addEventListener('click', function () { S.time = p[1]; SFX.ui(); renderSky(); renderHUD(); save(); });
      tc.appendChild(b);
    });
    var wl = $('wxList'); wl.innerHTML = '';
    WEATHERS.forEach(function (w) {
      var b = document.createElement('button'); b.type = 'button';
      b.innerHTML = '<span class="e">' + w.icon + '</span>' + T('wx_' + w.id);
      if (S.weather === w.id) b.classList.add('on');
      b.addEventListener('click', function () { setWeather(w.id); SFX.ui(); });
      wl.appendChild(b);
    });
    $('optFlow').checked = S.flow; $('optAutoWx').checked = S.autoWx;
    var sel = $('optDayLen');
    if (!sel.options.length) DAY_LENS.forEach(function (m) { var o = document.createElement('option'); o.value = m; sel.appendChild(o); });
    for (var i = 0; i < sel.options.length; i++) sel.options[i].textContent = T('minutes', DAY_LENS[i]);
    sel.value = S.dayLen;
    drawDial();
  }
  function setWeather(id) {
    if (S.weather === id) return;
    S.weather = id; wxTimer = 150 + Math.random() * 150;
    if (id === 'storm') nextBolt = 2;
    renderSky(); renderHUD(); save();
  }
  $('optFlow').addEventListener('change', function (e) { S.flow = e.target.checked; save(); });
  $('optAutoWx').addEventListener('change', function (e) { S.autoWx = e.target.checked; save(); });
  $('optDayLen').addEventListener('change', function (e) { S.dayLen = +e.target.value; save(); });

  // ---------- 设置 ----------
  function renderSettings() {
    var sel = $('optPixel');
    if (!sel.options.length) [2, 3, 4].forEach(function (v) { var o = document.createElement('option'); o.value = v; sel.appendChild(o); });
    var names = [T('px_s'), T('px_m'), T('px_l')];
    for (var i = 0; i < sel.options.length; i++) sel.options[i].textContent = names[i];
    sel.value = S.set.px;
    $('optDither').checked = S.set.dither; $('optOutline').checked = S.set.outline; $('optMusic').checked = S.set.music;
  }
  $('optPixel').addEventListener('change', function (e) { S.set.px = +e.target.value; resize(); save(); });
  $('optDither').addEventListener('change', function (e) { S.set.dither = e.target.checked; save(); });
  $('optOutline').addEventListener('change', function (e) { S.set.outline = e.target.checked; save(); });
  $('optMusic').addEventListener('change', function (e) { S.set.music = e.target.checked; save(); });
  $('camL').addEventListener('click', function () { rotateCam(-1); });
  $('camR').addEventListener('click', function () { rotateCam(1); });
  $('camReset').addEventListener('click', resetCam);
  var resetArm = 0;
  $('btnReset').addEventListener('click', function () {
    var b = $('btnReset');
    if (!resetArm) { resetArm = 1; b.classList.add('armed'); b.textContent = T('resetConfirm'); setTimeout(function () { resetArm = 0; b.classList.remove('armed'); b.textContent = T('resetFarm'); }, 3000); return; }
    store.set('save', null); location.reload();
  });
  $('btnReroll').addEventListener('click', function () { SFX.ui(); newOrder(); save(); });

  // ---------- HUD ----------
  function renderHUD() {
    $('coinNum').textContent = S.coins;
    var lv = level(), a = xpForLv(lv), b = xpForLv(lv + 1);
    $('lvNum').textContent = 'Lv ' + lv;
    $('xpFill').style.width = Math.min(100, (S.xp - a) / (b - a) * 100) + '%';
    $('dayTxt').textContent = T('dayN', S.day) + ' · ' + fmtTime(S.time);
    $('wxIc').textContent = wxIcon(S.weather);
  }
  function renderOrder() {
    var o = S.order, body = $('orderBody');
    if (!o) { body.innerHTML = '<span class="rw">' + T('orderWait') + '</span>'; $('orderFill').style.width = '0%'; return; }
    var c = CROP[o.crop];
    body.innerHTML = c.icon + ' ' + cropName(c.id) + ' <b class="num">' + o.have + ' / ' + o.need + '</b><div class="rw">' + T('orderReward', o.reward, o.xp) + '</div>';
    $('orderFill').style.width = (o.have / o.need * 100) + '%';
  }

  // ---------- 全屏 ----------
  function isFs() { return document.fullscreenElement === FRAME || document.webkitFullscreenElement === FRAME || FRAME.classList.contains('sf-fs'); }
  function toggleFs() {
    if (!isFs()) {
      var req = FRAME.requestFullscreen || FRAME.webkitRequestFullscreen;
      if (req) {
        try { var pr = req.call(FRAME); if (pr && pr.catch) pr.catch(function () { FRAME.classList.add('sf-fs'); document.body.classList.add('sf-fs-on'); }); }
        catch (e) { FRAME.classList.add('sf-fs'); document.body.classList.add('sf-fs-on'); }
      } else { FRAME.classList.add('sf-fs'); document.body.classList.add('sf-fs-on'); }
    } else {
      if (FRAME.classList.contains('sf-fs')) { FRAME.classList.remove('sf-fs'); document.body.classList.remove('sf-fs-on'); }
      else { var ex = document.exitFullscreen || document.webkitExitFullscreen; if (ex) ex.call(document); }
    }
    setTimeout(resize, 120);
  }
  $('btnFs').addEventListener('click', toggleFs);
  $('btnFs2').addEventListener('click', toggleFs);

  // ======================================================================
  // 模拟
  // ======================================================================
  var windBoost = 0, sprTimer = 0, saveTimer = 0, rainWetTimer = 0, smokeT = 0, mistT = 0;
  function simulate(dt) {
    // 时间
    if (S.flow) {
      S.time += dt * 24 / (S.dayLen * 60);
      if (S.time >= 24) { S.time -= 24; S.day++; toast(T('newDay', S.day), '#fff3b0'); }
    }
    // 自动天气
    if (S.autoWx) {
      wxTimer -= dt;
      if (wxTimer <= 0) {
        var h = S.time, w = { clear: 50, cloudy: 24, rain: 14, storm: 4, mist: (h > 4 && h < 9) ? 18 : 3 };
        if (S.weather === 'storm') { w.storm = 0; w.rain = 30; }
        var tot = 0, k; for (k in w) tot += w[k];
        var r = Math.random() * tot; for (k in w) { r -= w[k]; if (r <= 0) break; }
        setWeather(k);
        wxTimer = 120 + Math.random() * 180;
      }
    }
    // 闪电
    if (WXS.storm > 0.6) {
      nextBolt -= dt;
      if (nextBolt <= 0) { flash = 1; nextBolt = 5 + Math.random() * 9; thunder(0.3 + Math.random() * 1.2); }
    }
    flash = Math.max(0, flash - dt * (flash > 0.5 ? 6 : 2.2));
    // 作物生长
    var raining = WXS.rain > 0.45;
    rainWetTimer -= dt;
    if (raining && rainWetTimer <= 0) {
      rainWetTimer = 1.5;
      for (var pk in S.plots) { var pl = S.plots[pk]; if (!pl.wet) { pl.wet = true; rebuildPlot(pk); } }
    }
    if (S.sprinkler) {
      sprTimer -= dt;
      if (sprTimer <= 0) {
        sprTimer = 2.5;
        var n = 0;
        for (var sk in S.plots) {
          var sp = S.plots[sk];
          if (plotNeedsWater(sp) && n < 3) {
            n++; var xy = sk.split(','); water(+xy[0], +xy[1], true);
          }
        }
      }
    }
    for (var k2 in S.plots) {
      var p = S.plots[k2];
      if (!p.crop || p.stage >= 3 || !p.wet) continue;
      var c = CROP[p.crop], dur = c.grow / 3;
      p.prog += dt;
      if (p.prog >= dur) {
        p.prog = 0; p.stage++;
        p.wet = raining;
        rebuildPlot(k2);
        var xy2 = k2.split(',');
        burst(wx(+xy2[0]), tile(+xy2[0], +xy2[1]).y + 0.3, wz(+xy2[1]), p.stage >= 3 ? 10 : 4, { c: p.stage >= 3 ? ['#ffe27a', '#ffffff'] : ['#9be07a'], sp: 0.7, up: 2, s: 0.05 });
      }
    }
    // 存档
    saveTimer -= dt;
    if (saveTimer <= 0) { saveTimer = 5; save(); }
  }

  // 离线进度（最多 2 小时）
  function offline(sec) {
    sec = Math.min(sec, 7200);
    if (sec < 2) return;
    for (var k in S.plots) {
      var p = S.plots[k], left = sec;
      while (p.crop && p.stage < 3 && (p.wet || S.sprinkler) && left > 0) {
        var dur = CROP[p.crop].grow / 3, need = dur - p.prog;
        if (left >= need) { left -= need; p.prog = 0; p.stage++; p.wet = !!S.sprinkler; }
        else { p.prog += left; left = 0; }
      }
    }
    var eggs = Math.min(S.chickens, Math.floor(sec / 60));
    for (var i = 0; i < eggs && S.eggs.length < S.chickens; i++) {
      var e = { x: wx(17 + Math.random() * 4) + 0.3, z: wz(8 + Math.random() * 2) };
      S.eggs.push(e); eggMeshAt(e);
    }
    if (S.flow) {
      var hrs = sec * 24 / (S.dayLen * 60);
      S.time += hrs; while (S.time >= 24) { S.time -= 24; S.day++; }
    }
  }

  // ---------- 动画 ----------
  var DROP_M = new THREE.Matrix4();
  function animate(dt, now) {
    // 树随风
    var wind = 0.012 + WXS.wind * 0.05;
    TREES.forEach(function (t) { t.m.rotation.z = Math.sin(now * 1.3 + t.ph) * wind * t.k; t.m.rotation.x = Math.cos(now * 1.1 + t.ph) * wind * 0.6 * t.k; });
    // 风车
    windBoost = Math.max(0, windBoost - dt);
    windmillBlades.rotation.z -= dt * (0.35 + WXS.wind * 2.6 + windBoost * 2.5);
    // 水
    waterUni.uTime.value = now;
    // 云
    var want = WXS.cloud;
    CLOUDS.forEach(function (c, i) {
      var vis = want > c.need * 0.95 ? 1 : 0;
      c.cur += (vis - c.cur) * Math.min(1, dt * 0.5);
      var m = c.m;
      m.position.x += dt * c.sp * (0.5 + WXS.wind * 1.5);
      if (m.position.x > 24) { m.position.x = -24; m.position.z = (Math.random() - 0.5) * 30; }
      var s = Math.max(0.001, c.cur * c.sz * (1 + WXS.rain * 0.3));
      m.scale.set(s, s, s); m.visible = c.cur > 0.02;
      m.position.y = 7.5 + (i % 3) * 1.1 + Math.sin(now * 0.2 + i) * 0.2;
    });
    // 雨
    if (WXS.rain > 0.02) {
      var cnt = Math.floor(RAIN_N * Math.min(1, WXS.rain)), wdx = 1.5 + WXS.wind * 4;
      for (var i = 0; i < cnt; i++) {
        var o = i * 6, v = rainV[i] * dt;
        rainPos[o + 1] -= v; rainPos[o + 4] -= v; rainPos[o] += wdx * dt; rainPos[o + 3] += wdx * dt;
        var gy = groundAt(rainPos[o], rainPos[o + 2]);
        var t = tile(Math.floor(rainPos[o] + HALF), Math.floor(rainPos[o + 2] + HALF));
        var floor = t ? gy : -8;
        if (rainPos[o + 1] < floor) {
          if (t && Math.random() < 0.08) spawn(rainPos[o], gy + 0.02, rainPos[o + 2], { vy: 0.9, vx: 0, vz: 0, c: '#cfe6f5', s: 0.035, life: 0.18, g: 8 });
          resetDrop(i, true);
        }
      }
      rainGeo.attributes.position.needsUpdate = true;
      rain.position.x = 0;
    }
    // 萤火虫
    if (ffMat.opacity > 0.01) {
      ffData.forEach(function (f, i) {
        f.ph += dt * f.sp;
        ffPos[i * 3] = f.x + Math.sin(f.ph * 1.3) * 0.9; ffPos[i * 3 + 1] = f.y + Math.sin(f.ph * 2.1) * 0.25; ffPos[i * 3 + 2] = f.z + Math.cos(f.ph) * 0.9;
      });
      ffGeo.attributes.position.needsUpdate = true;
      fireflies.visible = true;
    } else fireflies.visible = false;
    // 烟囱炊烟
    smokeT -= dt;
    if (smokeT <= 0) {
      smokeT = 0.32;
      var gl = Math.max(0.35, Math.min(1, sun.intensity * 0.45 + 0.3));
      var sc2 = Math.round(170 * gl + 40);
      spawn(CHIMNEY.x + (Math.random() - 0.5) * 0.1, CHIMNEY.y, CHIMNEY.z, { vy: 0.55, vx: 0.15 + WXS.wind * 0.6, vz: 0.05, g: -0.05, c: 'rgb(' + sc2 + ',' + sc2 + ',' + (sc2 + 6) + ')', s: 0.09, grow: 0.07, life: 3.2, drag: 0.3 });
    }
    // 瀑布水雾
    mistT -= dt;
    if (mistT <= 0) {
      mistT = 0.06;
      spawn(FALL_TOP.x + (Math.random() - 0.5) * 0.8, FALL_TOP.y - Math.random() * 6, FALL_TOP.z + 0.1, { vy: -1.2, vz: 0.5 + Math.random() * 0.5, vx: (Math.random() - 0.5) * 0.4, g: 1, c: '#e4f5f4', s: 0.06, life: 1.4, drag: 0.4 });
    }
    // 干渴水滴
    var di = 0;
    for (var k in S.plots) {
      var p = S.plots[k];
      if (!plotNeedsWater(p) || di >= 64) continue;
      var xy = k.split(','), x = +xy[0], z = +xy[1];
      DROP_M.makeTranslation(wx(x), tile(x, z).y + 0.75 + Math.sin(now * 4 + x + z) * 0.06, wz(z));
      dropMesh.setMatrixAt(di++, DROP_M);
    }
    for (var j = di; j < dropMesh.userData.last; j++) dropMesh.setMatrixAt(j, ZERO_M);
    dropMesh.userData.last = di;
    dropMesh.instanceMatrix.needsUpdate = true;
    // 鸡
    var night = SKY.night > 0.7;
    CHICKENS.forEach(function (c, i) {
      c.sleep = night;
      if (night) { c.tx = COOP_DOOR.x + (i % 3 - 1) * 0.25; c.tz = COOP_DOOR.z - 0.25 - ((i / 3) | 0) * 0.25; }
      else {
        c.wait -= dt;
        if (c.wait <= 0 && Math.hypot(c.tx - c.x, c.tz - c.z) < 0.05) {
          c.wait = 1 + Math.random() * 3;
          c.tx = wx(YARD.x0) - 0.3 + Math.random() * (YARD.x1 - YARD.x0 + 0.6);
          c.tz = wz(YARD.z0) + 0.95 + Math.random() * 2.4;
          if (Math.random() < 0.4) c.peck = 1.2;
        }
        c.layT -= dt;
        if (c.layT <= 0) {
          c.layT = 50 + Math.random() * 40;
          if (S.eggs.length < S.chickens) { var e = { x: c.x, z: c.z }; S.eggs.push(e); eggMeshAt(e); SFX.cluck(); }
        }
      }
      var dx = c.tx - c.x, dz = c.tz - c.z, d = Math.hypot(dx, dz), sp = 0.7 * dt;
      var moving = d > 0.03;
      if (moving) { c.x += dx / d * Math.min(sp, d); c.z += dz / d * Math.min(sp, d); c.m.rotation.y = Math.atan2(dx, dz); }
      c.peck = Math.max(0, c.peck - dt); c.hop = Math.max(0, c.hop - dt);
      c.m.position.set(c.x, 1.0 + (moving ? Math.abs(Math.sin(now * 14 + i)) * 0.04 : 0) + Math.sin(c.hop * 12) * c.hop * 0.4, c.z);
      c.m.rotation.x = !moving && c.peck > 0 ? Math.max(0, Math.sin(c.peck * 9)) * 0.5 : 0;
      c.m.visible = !(night && d < 0.08);
    });
    // 鸭子
    DUCKS.forEach(function (dd, i) {
      dd.a += dt * dd.sp;
      var x = dd.cx + Math.cos(dd.a) * dd.r * 1.1, z = dd.cz + Math.sin(dd.a) * dd.r * 0.75;
      dd.m.position.set(x, WATER_Y - 0.03 + Math.sin(now * 2 + i) * 0.015, z);
      dd.spin = Math.max(0, (dd.spin || 0) - dt);
      dd.m.rotation.y = Math.atan2(-Math.sin(dd.a) * 1.1, Math.cos(dd.a) * 0.75) + dd.spin * 12;
      if (Math.random() < dt * 0.6) spawn(x, WATER_Y + 0.01, z, { vy: 0, g: 0, c: '#d8f3ef', s: 0.04, life: 0.6 });
    });
    // 蝴蝶（白天、不下雨）
    var bfVis = SKY.night < 0.3 && WXS.rain < 0.2;
    BUTTERFLIES.forEach(function (b) {
      b.g.visible = bfVis;
      if (!bfVis) return;
      if (Math.hypot(b.tx - b.x, b.tz - b.z) < 0.2) { b.tx = (Math.random() - 0.5) * 16; b.tz = (Math.random() - 0.5) * 14; }
      var dx = b.tx - b.x, dz = b.tz - b.z, d = Math.hypot(dx, dz);
      b.x += dx / d * dt * 0.8; b.z += dz / d * dt * 0.8;
      b.ph += dt * 18;
      b.g.position.set(b.x, groundAt(b.x, b.z) + 0.55 + Math.sin(now * 2 + b.ph * 0.05) * 0.2, b.z);
      b.g.rotation.y = Math.atan2(dx, dz) + Math.PI / 2;
      var f = Math.sin(b.ph); b.wl.rotation.z = f * 0.9; b.wr.rotation.z = -f * 0.9;
    });
    // 农夫
    var F = FARMER, fdx = F.tx - F.x, fdz = F.tz - F.z, fd = Math.hypot(fdx, fdz);
    var U = farmer.userData;
    if (fd > 0.05) {
      var spd = Math.min(fd, (fd > 3 ? 4.2 : 2.4) * dt);
      F.x += fdx / fd * spd; F.z += fdz / fd * spd;
      farmer.rotation.y = Math.atan2(fdx, fdz);
      F.walk += dt * 12;
    } else {
      F.walk = 0;
      if (F.face != null) { farmer.rotation.y += (F.face - farmer.rotation.y) * Math.min(1, dt * 10); }
      F.idle -= dt;
      if (F.idle <= 0) {
        F.idle = 4 + Math.random() * 6; F.face = null;
        F.tx = wx(10) + (Math.random() - 0.5) * 3; F.tz = wz(14) + Math.random() * 1.5;
      }
    }
    F.act = Math.max(0, F.act - dt);
    var sw = Math.sin(F.walk);
    U.legL.rotation.x = sw * 0.6; U.legR.rotation.x = -sw * 0.6;
    U.armL.rotation.x = -sw * 0.5; U.armR.rotation.x = F.act > 0 ? -1.4 * Math.sin(F.act / 0.35 * Math.PI) : sw * 0.5;
    farmer.position.set(F.x, groundAt(F.x, F.z) + Math.abs(sw) * 0.03, F.z);
    // 成熟作物轻轻摇
    updateParts(dt);
  }

  // ======================================================================
  // 主循环
  // ======================================================================
  var last = performance.now(), running = true, clockAcc = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    var dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (!running) return;
    var t = now / 1000;
    simulate(dt);
    var glow = applySky(dt);
    keyPan(dt);
    updateCamera(dt);
    animate(dt, t);
    refreshHover();
    updateAudio(dt, glow);
    clockAcc += dt;
    if (clockAcc > 0.5) { clockAcc = 0; renderHUD(); if (!$('pSky').classList.contains('hidden')) drawDial(); if (!$('pShop').classList.contains('hidden')) renderShop(); }
    post.uniforms.uTime.value = t;
    post.uniforms.uDither.value = S.set.dither ? 1 : 0;
    post.uniforms.uOutline.value = S.set.outline ? 1 : 0;
    renderer.setRenderTarget(rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(postScene, postCam);
  }

  var hiddenAt = 0;
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { hiddenAt = Date.now(); running = false; save(); }
    else {
      if (hiddenAt) { offline((Date.now() - hiddenAt) / 1000); for (var k in S.plots) rebuildPlot(k); }
      hiddenAt = 0; last = performance.now(); running = true;
    }
  });
  window.addEventListener('pagehide', save);

  // ======================================================================
  // 启动
  // ======================================================================
  function refreshLang() {
    renderSeeds(); renderShop(true); renderSky(); renderSettings(); renderHUD(); renderOrder(); syncDock();
    $('bSky').title = T('skyTitle') + ' (T)'; $('bShop').title = T('shopTitle') + ' (B)'; $('bSet').title = T('setTitle');
    $('btnFs').title = T('fsTitle'); $('btnFs2').title = T('fsTitle'); $('btnReroll').title = T('reroll');
    var tt = { hand: 'tHand', hoe: 'tHoe', seed: 'tSeed', water: 'tWater' };
    document.querySelectorAll('#dock .tool').forEach(function (b) { b.title = T(tt[b.dataset.tool]); });
  }
  offline((Date.now() - (S.at || Date.now())) / 1000);
  Object.keys(S.plots).forEach(function (k) {
    var xy = k.split(','), x = +xy[0], z = +xy[1];
    if (!tile(x, z) || !zoneOf(x, z)) { delete S.plots[k]; return; }
    clearTileGrass(k); rebuildPlot(k);
  });
  if (!S.order) newOrder();
  applyZoneVisuals();
  WXS.cloud = WX[S.weather].cloud; WXS.rain = WX[S.weather].rain; WXS.mist = WX[S.weather].mist; WXS.storm = WX[S.weather].storm; WXS.wind = WX[S.weather].wind;
  KIT.mountMute($('btnMute'));
  KIT.boot(refreshLang);
  setTool('hand');
  resize();
  if (!S.welcomed) $('welcome').classList.remove('hidden');
  $('btnStart').addEventListener('click', function () {
    S.welcomed = true; save(); $('welcome').classList.add('hidden'); startAudio(); SFX.harvest();
  });
  requestAnimationFrame(function (t) { last = t; frame(t); });
})();
