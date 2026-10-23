/* 植物大战僵尸 · 草坪守卫 — 数值与关卡数据
 * 纯数据文件：植物 / 僵尸 / 难度 / 关卡 / 波次生成器。
 */
(function () {
  'use strict';

  var PLANTS = [
    { id: 'sunflower',  cost: 50,  cd: 7.5, hp: 300,  icon: 'sunflower',  cat: 'sun' },
    { id: 'peashooter', cost: 100, cd: 7.5, hp: 300,  icon: 'peashooter', cat: 'shoot' },
    { id: 'snowpea',    cost: 175, cd: 7.5, hp: 300,  icon: 'snowpea',    cat: 'shoot' },
    { id: 'repeater',   cost: 200, cd: 7.5, hp: 300,  icon: 'repeater',   cat: 'shoot' },
    { id: 'threepeater',cost: 325, cd: 7.5, hp: 300,  icon: 'threepeater',cat: 'shoot' },
    { id: 'wallnut',    cost: 50,  cd: 20,  hp: 4000, icon: 'wallnut',    cat: 'wall' },
    { id: 'tallnut',    cost: 125, cd: 30,  hp: 8000, icon: 'tallnut',    cat: 'wall' },
    { id: 'potato',     cost: 25,  cd: 20,  hp: 300,  icon: 'potato',     cat: 'trap' },
    { id: 'cherry',     cost: 150, cd: 30,  hp: 9999, icon: 'cherry',     cat: 'bomb' },
    { id: 'chomper',    cost: 150, cd: 20,  hp: 300,  icon: 'chomper',    cat: 'melee' },
    { id: 'spike',      cost: 100, cd: 20,  hp: 300,  icon: 'spike',      cat: 'ground' },
    { id: 'torch',      cost: 175, cd: 20,  hp: 300,  icon: 'torch',      cat: 'buff' }
  ];

  var ZOMBIES = {
    normal:    { hp: 200,  speed: 13, scale: 1,    armor: 0,    armorType: null },
    cone:      { hp: 200,  speed: 13, scale: 1,    armor: 370,  armorType: 'cone' },
    bucket:    { hp: 200,  speed: 13, scale: 1.04, armor: 1100, armorType: 'bucket' },
    pole:      { hp: 340,  speed: 13, scale: 1,    run: 42, vault: true },
    newspaper: { hp: 200,  speed: 12, scale: 1,    armor: 150,  armorType: 'paper', rageSpeed: 34 },
    door:      { hp: 200,  speed: 12, scale: 1.02, armor: 1100, armorType: 'door' },
    football:  { hp: 200,  speed: 26, scale: 1.06, armor: 1400, armorType: 'helmet' },
    giant:     { hp: 3000, speed: 8,  scale: 1.7,  giant: true, throwImp: true },
    imp:       { hp: 270,  speed: 30, scale: 0.72 }
  };

  // 无尽模式的“难度预算”权重
  var Z_COST = { normal: 1, cone: 1.5, pole: 1.7, newspaper: 1.6, bucket: 2.3, door: 2.4, football: 2.8, giant: 11, imp: 0.7 };

  var DIFF = {
    casual: { hp: 0.8, speed: 0.9, sun: 1.15, startSun: 200, label: 'diffCasual' },
    normal: { hp: 1.0, speed: 1.0, sun: 1.0,  startSun: 150, label: 'diffNormal' },
    hard:   { hp: 1.18, speed: 1.06, sun: 0.92, startSun: 125, label: 'diffHard' }
  };

  /* 波次模板：[type, count] */
  var LEVELS = [
    {
      id: 1, key: 'lv1', scene: 'day', skySun: [8, 12], waves: 10, huge: [5, 10],
      pool: ['normal', 'cone', 'pole'],
      table: [
        [['normal', 3]],
        [['normal', 4], ['cone', 1]],
        [['normal', 4], ['cone', 2]],
        [['normal', 4], ['cone', 2], ['pole', 1]],
        [['normal', 6], ['cone', 3], ['pole', 2]],
        [['normal', 4], ['cone', 3], ['pole', 2]],
        [['normal', 5], ['cone', 3], ['pole', 3]],
        [['normal', 5], ['cone', 4], ['pole', 3], ['bucket', 1]],
        [['normal', 6], ['cone', 4], ['pole', 4], ['bucket', 2]],
        [['normal', 8], ['cone', 5], ['pole', 4], ['bucket', 3]]
      ]
    },
    {
      id: 2, key: 'lv2', scene: 'noon', skySun: [9, 13], waves: 12, huge: [6, 12],
      pool: ['normal', 'cone', 'pole', 'bucket', 'newspaper', 'door'],
      table: [
        [['normal', 3]],
        [['normal', 4], ['cone', 2]],
        [['normal', 4], ['cone', 2], ['newspaper', 1]],
        [['normal', 4], ['cone', 3], ['pole', 1], ['newspaper', 1]],
        [['normal', 5], ['cone', 3], ['bucket', 1], ['door', 1]],
        [['normal', 7], ['cone', 4], ['bucket', 2], ['newspaper', 2], ['door', 2], ['pole', 2]],
        [['normal', 5], ['cone', 4], ['bucket', 2], ['newspaper', 2]],
        [['normal', 5], ['cone', 4], ['door', 2], ['pole', 2]],
        [['normal', 6], ['cone', 4], ['bucket', 3], ['newspaper', 2]],
        [['normal', 6], ['cone', 5], ['bucket', 3], ['door', 2], ['pole', 3]],
        [['normal', 7], ['cone', 5], ['bucket', 3], ['door', 3], ['newspaper', 3]],
        [['normal', 9], ['cone', 6], ['bucket', 4], ['door', 3], ['newspaper', 3], ['pole', 4]]
      ]
    },
    {
      id: 3, key: 'lv3', scene: 'dusk', skySun: [11, 15], waves: 12, huge: [6, 12],
      pool: ['normal', 'cone', 'pole', 'bucket', 'newspaper', 'door', 'football'],
      table: [
        [['normal', 3]],
        [['normal', 4], ['cone', 2]],
        [['normal', 4], ['cone', 2], ['pole', 2]],
        [['normal', 4], ['cone', 3], ['football', 1]],
        [['normal', 5], ['cone', 3], ['bucket', 2], ['newspaper', 1]],
        [['normal', 7], ['cone', 4], ['bucket', 2], ['door', 2], ['football', 2], ['pole', 3]],
        [['normal', 5], ['cone', 4], ['bucket', 3], ['newspaper', 2]],
        [['normal', 5], ['cone', 4], ['door', 3], ['football', 2]],
        [['normal', 6], ['cone', 5], ['bucket', 3], ['pole', 3], ['newspaper', 2]],
        [['normal', 7], ['cone', 5], ['bucket', 3], ['door', 3], ['football', 2]],
        [['normal', 7], ['cone', 6], ['bucket', 4], ['door', 3], ['football', 3], ['pole', 4]],
        [['normal', 10], ['cone', 7], ['bucket', 5], ['door', 4], ['football', 4], ['pole', 4]]
      ]
    },
    {
      id: 4, key: 'lv4', scene: 'night', skySun: [16, 22], waves: 12, huge: [6, 12],
      graves: 3,
      pool: ['normal', 'cone', 'pole', 'bucket', 'newspaper', 'door', 'football'],
      table: [
        [['normal', 3]],
        [['normal', 4], ['cone', 2]],
        [['normal', 4], ['cone', 2], ['newspaper', 2]],
        [['normal', 5], ['cone', 3], ['pole', 2]],
        [['normal', 5], ['cone', 3], ['bucket', 2], ['door', 1]],
        [['normal', 8], ['cone', 5], ['bucket', 3], ['door', 2], ['football', 2], ['newspaper', 3]],
        [['normal', 5], ['cone', 4], ['bucket', 3], ['newspaper', 2]],
        [['normal', 6], ['cone', 4], ['door', 3], ['football', 2], ['pole', 3]],
        [['normal', 6], ['cone', 5], ['bucket', 4], ['newspaper', 3]],
        [['normal', 6], ['cone', 4], ['bucket', 3], ['door', 3], ['football', 2]],
        [['normal', 7], ['cone', 5], ['bucket', 4], ['door', 3], ['football', 3], ['pole', 3]],
        [['normal', 9], ['cone', 7], ['bucket', 5], ['door', 3], ['football', 4], ['newspaper', 3]]
      ]
    },
    {
      id: 5, key: 'lv5', scene: 'eclipse', skySun: [14, 19], waves: 14, huge: [5, 10, 14],
      graves: 2,
      pool: ['normal', 'cone', 'pole', 'bucket', 'newspaper', 'door', 'football', 'giant'],
      table: [
        [['normal', 4]],
        [['normal', 4], ['cone', 2]],
        [['normal', 5], ['cone', 3], ['pole', 2]],
        [['normal', 5], ['cone', 3], ['bucket', 2], ['newspaper', 2]],
        [['normal', 8], ['cone', 5], ['bucket', 3], ['door', 2], ['football', 2], ['giant', 1]],
        [['normal', 6], ['cone', 4], ['bucket', 3], ['door', 2], ['football', 2]],
        [['normal', 6], ['cone', 4], ['newspaper', 3], ['pole', 3], ['bucket', 3]],
        [['normal', 7], ['cone', 5], ['door', 3], ['football', 3], ['bucket', 3]],
        [['normal', 7], ['cone', 5], ['bucket', 4], ['door', 3], ['football', 3], ['newspaper', 3]],
        [['normal', 8], ['cone', 5], ['bucket', 3], ['door', 2], ['football', 3], ['giant', 1]],
        [['normal', 6], ['cone', 4], ['bucket', 3], ['door', 3], ['football', 2], ['pole', 3]],
        [['normal', 7], ['cone', 4], ['bucket', 3], ['door', 3], ['football', 3], ['newspaper', 3]],
        [['normal', 6], ['cone', 4], ['bucket', 4], ['door', 3], ['football', 3]],
        [['normal', 9], ['cone', 6], ['bucket', 4], ['door', 3], ['football', 4], ['giant', 1]]
      ]
    }
  ];

  var RECOMMENDED = ['sunflower', 'peashooter', 'wallnut', 'snowpea', 'potato', 'cherry', 'repeater', 'spike', 'torch'];
  var ALL_IDS = PLANTS.map(function (p) { return p.id; });

  function byId(id) {
    for (var i = 0; i < PLANTS.length; i++) if (PLANTS[i].id === id) return PLANTS[i];
    return null;
  }

  function expand(spec) {
    var list = [];
    if (!spec) return list;
    spec.forEach(function (pair) {
      for (var i = 0; i < pair[1]; i++) list.push(pair[0]);
    });
    return list;
  }

  // 洗牌
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  // 无尽模式：按波次预算程序化生成（巨人有数量上限，避免整波都是巨人）
  function endlessWave(n) {
    var budget = 3.2 + n * 1.15 + Math.pow(n, 1.42) * 0.34;
    var out = [];
    var giantsLeft = n >= 9 ? Math.min(3, 1 + Math.floor((n - 9) / 5)) : 0;
    while (budget > 0.8) {
      var pool = ['normal'];
      if (n >= 2) pool.push('cone');
      if (n >= 3) pool.push('pole');
      if (n >= 4) pool.push('newspaper');
      if (n >= 5) pool.push('bucket');
      if (n >= 6) pool.push('door');
      if (n >= 7) pool.push('football');
      if (giantsLeft > 0 && budget > 12 && Math.random() < .45) pool.push('giant');
      var t = pool[Math.floor(Math.random() * pool.length)];
      var c = Z_COST[t];
      if (c > budget + 1.2) { t = 'normal'; c = 1; }
      if (t === 'giant') giantsLeft--;
      out.push([t, 1]);
      budget -= c;
    }
    // 合并同类
    var map = {}, order = [];
    out.forEach(function (p) {
      if (!map[p[0]]) { map[p[0]] = 0; order.push(p[0]); }
      map[p[0]]++;
    });
    return order.map(function (k) { return [k, map[k]]; });
  }

  window.PVZ_DATA = {
    PLANTS: PLANTS,
    ZOMBIES: ZOMBIES,
    DIFF: DIFF,
    LEVELS: LEVELS,
    RECOMMENDED: RECOMMENDED,
    ALL_IDS: ALL_IDS,
    Z_COST: Z_COST,
    byId: byId,
    expand: expand,
    shuffle: shuffle,
    endlessWave: endlessWave
  };
})();
