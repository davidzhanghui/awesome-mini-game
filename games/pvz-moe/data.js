/* 萌可花园 · 植物大战僵尸（萌可版） — 数值与关卡数据
 * 与经典版的差别：阳光经济更快、植物血量更低、僵尸更萌更快、
 * 新增 4 株萌可植物与 3 种捣蛋团子，关卡 6 片花园。
 */
(function () {
  'use strict';

  var PLANTS = [
    // cat: sun 产光 / shoot 射手 / wall 肉盾 / trap 陷阱 / bomb 炸弹 / melee 近战 / ground 地面 / buff 增益 / support 辅助
    { id: 'sunflower',  cost: 50,  cd: 7,    hp: 280,  icon: 'sunflower',  cat: 'sun' },
    { id: 'peashooter', cost: 100, cd: 7,    hp: 280,  icon: 'peashooter', cat: 'shoot' },
    { id: 'snowpea',    cost: 175, cd: 7,    hp: 280,  icon: 'snowpea',    cat: 'shoot' },
    { id: 'repeater',   cost: 200, cd: 7,    hp: 280,  icon: 'repeater',   cat: 'shoot' },
    { id: 'threepeater',cost: 325, cd: 8,    hp: 280,  icon: 'threepeater',cat: 'shoot' },
    { id: 'wallnut',    cost: 50,  cd: 20,   hp: 3800, icon: 'wallnut',    cat: 'wall' },
    { id: 'tallnut',    cost: 125, cd: 28,   hp: 7600, icon: 'tallnut',    cat: 'wall' },
    { id: 'potato',     cost: 25,  cd: 18,   hp: 300,  icon: 'potato',     cat: 'trap' },
    { id: 'cherry',     cost: 150, cd: 28,   hp: 9999, icon: 'cherry',     cat: 'bomb' },
    { id: 'chomper',    cost: 150, cd: 20,   hp: 300,  icon: 'chomper',    cat: 'melee' },
    { id: 'spike',      cost: 100, cd: 18,   hp: 300,  icon: 'spike',      cat: 'ground' },
    { id: 'torch',      cost: 175, cd: 18,   hp: 300,  icon: 'torch',      cat: 'buff' },
    // ---- 萌可版新增 ----
    // 星星灯：向前方扇形发射星屑，穿透 3 只僵尸（低伤害高频率）
    { id: 'star',       cost: 175, cd: 12,   hp: 260,  icon: 'star',       cat: 'shoot', noe: true },
    // 棉花糖苔：周期性给 3×3 内植物套一层糖霜护盾（吸收 300 伤害）
    { id: 'marshmallow',cost: 150, cd: 24,   hp: 320,  icon: 'marshmallow',cat: 'support', noe: true },
    // 幽灵南瓜：召唤一颗缓慢的幽灵瓜，追踪并黏住最近的僵尸（持续伤害 + 减速）
    { id: 'pumpkin',    cost: 200, cd: 22,   hp: 340,  icon: 'pumpkin',    cat: 'shoot', noe: true },
    // 甜筒炮：一次性轰炸一条直线（整行 260 伤害），冷却长
    { id: 'sundae',     cost: 225, cd: 30,   hp: 300,  icon: 'sundae',     cat: 'bomb',  noe: true }
  ];

  var ZOMBIES = {
    normal:    { hp: 190,  speed: 18, scale: 1,    armor: 0,    armorType: null },
    cone:      { hp: 190,  speed: 18, scale: 1,    armor: 350,  armorType: 'cone' },
    bucket:    { hp: 190,  speed: 18, scale: 1.04, armor: 1020, armorType: 'bucket' },
    pole:      { hp: 320,  speed: 16, scale: 1,    run: 48, vault: true },
    newspaper: { hp: 190,  speed: 17, scale: 1,    armor: 140,  armorType: 'paper', rageSpeed: 40 },
    door:      { hp: 190,  speed: 17, scale: 1.02, armor: 1020, armorType: 'door' },
    football:  { hp: 190,  speed: 30, scale: 1.06, armor: 1300, armorType: 'helmet' },
    giant:     { hp: 2800, speed: 11,  scale: 1.7,  giant: true, throwImp: true },
    imp:       { hp: 250,  speed: 30, scale: 0.72 },
    // ---- 萌可版：捣蛋团子 ----
    // 果冻团子：一段血被打空后分裂成两只小团子（各自半血）
    jelly:     { hp: 420,  speed: 19, scale: 1.02, armor: 0, armorType: null, split: 2, candy: true },
    // 弹簧团子：每 4.5 秒弹跳一次，越过前方植物（无视高坚果）
    spring:    { hp: 360,  speed: 20, scale: 1.0,  armor: 0, armorType: null, bounce: true, candy: true },
    // 泡泡团子：远程吐泡泡，命中植物使其短暂停摆
    bubble:    { hp: 300,  speed: 15, scale: 1.05, armor: 0, armorType: null, bubble: true, candy: true }
  };

  // 无尽模式的“难度预算”权重
  var Z_COST = {
    normal: 1, cone: 1.5, pole: 1.7, newspaper: 1.6, bucket: 2.3, door: 2.4, football: 2.8, giant: 11, imp: 0.7,
    jelly: 2.2, spring: 2.0, bubble: 1.8
  };

  var DIFF = {
    casual: { hp: 0.8,  speed: 0.9,  sun: 1.2, startSun: 225, label: 'diffCasual' },
    normal: { hp: 1.0,  speed: 1.0,  sun: 1.0, startSun: 175, label: 'diffNormal' },
    hard:   { hp: 1.16, speed: 1.06, sun: 0.94, startSun: 150, label: 'diffHard' }
  };

  /* 波次模板：[type, count] */
  var LEVELS = [
    {
      id: 1, key: 'lv1', scene: 'day', skySun: [7, 11], waves: 10, huge: [5, 10],
      pool: ['normal', 'cone', 'pole', 'jelly'],
      table: [
        [['normal', 3]],
        [['normal', 4], ['cone', 1]],
        [['normal', 4], ['cone', 2]],
        [['normal', 4], ['cone', 2], ['jelly', 1]],
        [['normal', 6], ['cone', 3], ['jelly', 2]],
        [['normal', 4], ['cone', 3], ['pole', 2]],
        [['normal', 5], ['cone', 3], ['jelly', 3]],
        [['normal', 5], ['cone', 4], ['spring', 2]],
        [['normal', 6], ['cone', 4], ['jelly', 3], ['pole', 2]],
        [['normal', 8], ['cone', 5], ['jelly', 4], ['spring', 3]]
      ]
    },
    {
      id: 2, key: 'lv2', scene: 'noon', skySun: [8, 12], waves: 11, huge: [6, 11],
      pool: ['normal', 'cone', 'pole', 'jelly', 'spring', 'bubble'],
      table: [
        [['normal', 3]],
        [['normal', 4], ['cone', 2]],
        [['normal', 4], ['cone', 2], ['bubble', 1]],
        [['normal', 4], ['cone', 3], ['jelly', 1]],
        [['normal', 5], ['cone', 3], ['spring', 2]],
        [['normal', 7], ['cone', 4], ['jelly', 3], ['bubble', 2]],
        [['normal', 5], ['cone', 4], ['bubble', 3]],
        [['normal', 5], ['cone', 4], ['spring', 3], ['jelly', 2]],
        [['normal', 6], ['cone', 4], ['bucket', 2], ['bubble', 2]],
        [['normal', 7], ['cone', 5], ['jelly', 4], ['spring', 3]],
        [['normal', 9], ['cone', 6], ['bucket', 3], ['jelly', 4], ['bubble', 3]]
      ]
    },
    {
      id: 3, key: 'lv3', scene: 'dusk', skySun: [10, 14], waves: 12, huge: [6, 12],
      pool: ['normal', 'cone', 'pole', 'bucket', 'jelly', 'spring', 'bubble', 'football'],
      table: [
        [['normal', 3]],
        [['normal', 4], ['cone', 2]],
        [['normal', 4], ['cone', 2], ['jelly', 2]],
        [['normal', 4], ['cone', 3], ['football', 1]],
        [['normal', 5], ['cone', 3], ['bucket', 2], ['bubble', 1]],
        [['normal', 7], ['cone', 4], ['bucket', 2], ['football', 2], ['spring', 2]],
        [['normal', 5], ['cone', 4], ['bucket', 3], ['jelly', 3]],
        [['normal', 5], ['cone', 4], ['football', 2], ['bubble', 3]],
        [['normal', 6], ['cone', 5], ['bucket', 3], ['jelly', 3], ['newspaper', 2]],
        [['normal', 7], ['cone', 5], ['bucket', 3], ['football', 2], ['spring', 3]],
        [['normal', 7], ['cone', 6], ['bucket', 4], ['jelly', 4], ['bubble', 3]],
        [['normal', 10], ['cone', 7], ['bucket', 5], ['football', 4], ['spring', 4]]
      ]
    },
    {
      id: 4, key: 'lv4', scene: 'night', skySun: [14, 19], waves: 12, huge: [6, 12],
      graves: 2,
      pool: ['normal', 'cone', 'pole', 'bucket', 'newspaper', 'door', 'football', 'jelly', 'spring', 'bubble'],
      table: [
        [['normal', 3]],
        [['normal', 4], ['cone', 2]],
        [['normal', 4], ['cone', 2], ['bubble', 2]],
        [['normal', 5], ['cone', 3], ['jelly', 2]],
        [['normal', 5], ['cone', 3], ['bucket', 2], ['door', 1]],
        [['normal', 8], ['cone', 5], ['bucket', 3], ['football', 2], ['jelly', 3]],
        [['normal', 5], ['cone', 4], ['bucket', 3], ['spring', 3]],
        [['normal', 6], ['cone', 4], ['door', 3], ['football', 2], ['bubble', 2]],
        [['normal', 6], ['cone', 5], ['bucket', 4], ['jelly', 4]],
        [['normal', 6], ['cone', 4], ['bucket', 3], ['door', 3], ['football', 2]],
        [['normal', 7], ['cone', 5], ['bucket', 4], ['football', 3], ['spring', 3]],
        [['normal', 9], ['cone', 7], ['bucket', 5], ['door', 3], ['jelly', 5]]
      ]
    },
    {
      id: 5, key: 'lv5', scene: 'eclipse', skySun: [13, 18], waves: 13, huge: [5, 9, 13],
      graves: 2,
      pool: ['normal', 'cone', 'pole', 'bucket', 'newspaper', 'door', 'football', 'giant', 'jelly', 'spring', 'bubble'],
      table: [
        [['normal', 4]],
        [['normal', 4], ['cone', 2]],
        [['normal', 5], ['cone', 3], ['jelly', 2]],
        [['normal', 5], ['cone', 3], ['bucket', 2], ['bubble', 2]],
        [['normal', 8], ['cone', 5], ['bucket', 3], ['football', 2], ['giant', 1]],
        [['normal', 6], ['cone', 4], ['bucket', 3], ['spring', 3]],
        [['normal', 6], ['cone', 4], ['newspaper', 3], ['jelly', 4]],
        [['normal', 7], ['cone', 5], ['door', 3], ['football', 3]],
        [['normal', 7], ['cone', 5], ['bucket', 4], ['bubble', 3], ['giant', 1]],
        [['normal', 8], ['cone', 5], ['bucket', 3], ['football', 3], ['spring', 3]],
        [['normal', 6], ['cone', 4], ['bucket', 3], ['door', 3], ['jelly', 4]],
        [['normal', 7], ['cone', 4], ['bucket', 3], ['football', 3], ['bubble', 3]],
        [['normal', 9], ['cone', 6], ['bucket', 4], ['jelly', 5], ['giant', 1]]
      ]
    },
    {
      // 萌可花园特别关：糖果军团，节奏最快
      id: 6, key: 'lv6', scene: 'candy', skySun: [9, 13], waves: 14, huge: [5, 10, 14],
      pool: ['jelly', 'spring', 'bubble', 'normal', 'cone', 'bucket', 'football', 'giant'],
      candy: true,
      table: [
        [['jelly', 3]],
        [['jelly', 4], ['spring', 2]],
        [['jelly', 4], ['bubble', 2], ['normal', 3]],
        [['spring', 4], ['bubble', 3], ['cone', 2]],
        [['jelly', 6], ['spring', 4], ['bubble', 3], ['normal', 4]],
        [['jelly', 5], ['bubble', 3], ['bucket', 2], ['football', 2]],
        [['spring', 6], ['jelly', 4], ['normal', 5], ['giant', 1]],
        [['jelly', 7], ['bubble', 4], ['bucket', 3], ['spring', 4]],
        [['spring', 6], ['jelly', 6], ['football', 3], ['giant', 1]],
        [['jelly', 8], ['bubble', 5], ['bucket', 4], ['spring', 5]],
        [['jelly', 6], ['spring', 6], ['bubble', 4], ['football', 3], ['giant', 1]],
        [['jelly', 9], ['bubble', 5], ['bucket', 5], ['normal', 6]],
        [['spring', 8], ['jelly', 8], ['football', 4], ['giant', 1]],
        [['jelly', 12], ['spring', 8], ['bubble', 6], ['bucket', 5], ['giant', 2]]
      ]
    }
  ];

  var RECOMMENDED = ['sunflower', 'peashooter', 'wallnut', 'snowpea', 'potato', 'cherry', 'star', 'repeater', 'marshmallow'];
  var ALL_IDS = PLANTS.map(function (p) { return p.id; });
  var ZOMBIE_IDS = ['normal', 'cone', 'bucket', 'pole', 'newspaper', 'door', 'football', 'jelly', 'spring', 'bubble', 'giant', 'imp'];

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
    var budget = 3.4 + n * 1.2 + Math.pow(n, 1.42) * 0.36;
    var out = [];
    var giantsLeft = n >= 9 ? Math.min(3, 1 + Math.floor((n - 9) / 5)) : 0;
    while (budget > 0.8) {
      var pool = ['normal'];
      if (n >= 2) pool.push('cone');
      if (n >= 3) pool.push('jelly');
      if (n >= 4) pool.push('spring');
      if (n >= 4) pool.push('newspaper');
      if (n >= 5) pool.push('bubble', 'bucket');
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
    ZOMBIE_IDS: ZOMBIE_IDS,
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
