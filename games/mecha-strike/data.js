/* 机甲大作战 · Mecha Strike — 关卡 / 敌人 / Boss / 武器数据
 * 6 战区 × 4 关 = 24 关，每关最后一波都是 Boss 战。
 * 文案不在这里：名字通过 key 到 strings.js 里取，切换语言无需重建。
 */
window.MS_DATA = (function () {
  'use strict';

  // ---------- 战区（每 4 关一个主题） ----------
  var SECTORS = [
    { key: 'ruins',   ambient: 'dust',  props: { crate: 5, pillar: 2, wall: 3 },
      theme: { sky: 0x2b1d16, ground: 0xb99f83, block: 0x5c5348, accent: 0xffb02e }, transpose: 0 },
    { key: 'foundry', ambient: 'ember', props: { crate: 3, pillar: 4, tank: 3 },
      theme: { sky: 0x1c0f14, ground: 0x9c8578, block: 0x4e3a36, accent: 0xff6a2e }, transpose: -2 },
    { key: 'neon',    ambient: 'mote',  props: { wall: 4, pillar: 3, crate: 2 },
      theme: { sky: 0x0a1226, ground: 0x7e8fa3, block: 0x2c3e55, accent: 0x29e6ff }, transpose: 3 },
    { key: 'frost',   ambient: 'snow',  props: { crystal: 5, wall: 2, crate: 2 },
      theme: { sky: 0x1a2a36, ground: 0xc6d6e0, block: 0x5d7385, accent: 0x8fe3ff }, transpose: 5 },
    { key: 'toxic',   ambient: 'spore', props: { tank: 5, crate: 2, pillar: 2 },
      theme: { sky: 0x0e1a10, ground: 0x7d8f6a, block: 0x3a4a33, accent: 0x9dff4a }, transpose: -4 },
    { key: 'orbital', ambient: 'spark', props: { pillar: 4, crystal: 3, wall: 2 },
      theme: { sky: 0x160b20, ground: 0x8d7f95, block: 0x3c3049, accent: 0xff4655 }, transpose: 0 }
  ];

  // ---------- 普通敌人 ----------
  // cost：波次预算单位；from：最早出现的关卡（0 起）
  var ENEMIES = {
    drone:     { hp: 30,  speed: 7.5, radius: 1.0, score: 100, shotDmg: 6,  shotCd: 2.1, range: 26, flyY: 3.4, cost: 1.0, from: 0 },
    walker:    { hp: 85,  speed: 3.4, radius: 1.4, score: 200, shotDmg: 8,  shotCd: 2.6, range: 25, flyY: 0,   cost: 1.4, from: 0 },
    turret:    { hp: 130, speed: 0,   radius: 1.5, score: 300, shotDmg: 9,  shotCd: 2.9, range: 34, flyY: 0,   cost: 1.7, from: 1 },
    kamikaze:  { hp: 24,  speed: 12,  radius: 0.9, score: 150, shotDmg: 15, shotCd: 9,   range: 3,  flyY: 1.5, cost: 0.8, from: 2 },
    heavy:     { hp: 300, speed: 2.3, radius: 2.0, score: 500, shotDmg: 11, shotCd: 2.4, range: 28, flyY: 0,   cost: 3.0, from: 3 },
    artillery: { hp: 170, speed: 2.2, radius: 1.7, score: 400, shotDmg: 14, shotCd: 4.4, range: 46, flyY: 0,   cost: 2.4, from: 5 }
  };

  // ---------- Boss ----------
  // atk：常态招式循环；rage：半血后的狂暴招式循环
  var BOSSES = {
    hammer:   { model: 'hammer',   hp: 1100, speed: 3.4, radius: 2.8, keep: 13, shotDmg: 10, fly: 0,
                hull: 0x6a4a2a, glow: 0xff7a1a, atk: ['burst', 'slam', 'fan'], rage: ['slam', 'burst', 'charge', 'fan'] },
    hive:     { model: 'hive',     hp: 950,  speed: 5.5, radius: 2.6, keep: 16, shotDmg: 8,  fly: 5.2,
                hull: 0x4a4a22, glow: 0xffc21a, atk: ['ring', 'summon', 'burst'], rage: ['spiral', 'summon', 'ring'] },
    bastion:  { model: 'bastion',  hp: 1500, speed: 0,   radius: 3.6, keep: 0,  shotDmg: 9,  fly: 0,
                hull: 0x3c4150, glow: 0xff4655, atk: ['spiral', 'mortar', 'burst'], rage: ['spiral', 'mortar', 'ring', 'mortar'] },
    titan:    { model: 'titan',    hp: 1800, speed: 2.4, radius: 3.0, keep: 12, shotDmg: 12, fly: 0,
                hull: 0x50323a, glow: 0xff2a35, atk: ['burst', 'charge', 'summon', 'fan'], rage: ['charge', 'burst', 'mortar', 'fan'] },
    phantom:  { model: 'phantom',  hp: 1000, speed: 9,   radius: 2.0, keep: 15, shotDmg: 9,  fly: 0,
                hull: 0x2c2a48, glow: 0xb46aff, atk: ['blink', 'fan', 'burst'], rage: ['blink', 'fan', 'blink', 'ring'] },
    scorpion: { model: 'scorpion', hp: 1400, speed: 4.8, radius: 3.0, keep: 10, shotDmg: 10, fly: 0,
                hull: 0x5a3018, glow: 0x7dff4a, atk: ['homing', 'fan', 'charge'], rage: ['homing', 'mortar', 'charge', 'homing'] },
    thor:     { model: 'thor',     hp: 1600, speed: 2.6, radius: 2.8, keep: 18, shotDmg: 10, fly: 0,
                hull: 0x24384a, glow: 0x3fd2ff, atk: ['laser', 'ring', 'burst'], rage: ['laser', 'spiral', 'laser', 'ring'] },
    gemini:   { model: 'phantom',  hp: 650,  speed: 8.5, radius: 2.0, keep: 15, shotDmg: 9,  fly: 0, twin: true,
                hull: 0x203a40, glow: 0x4affd2, atk: ['blink', 'fan', 'burst'], rage: ['blink', 'ring', 'fan'] },
    overlord: { model: 'overlord', hp: 4200, speed: 2.2, radius: 4.0, keep: 16, shotDmg: 12, fly: 0,
                hull: 0x2a1030, glow: 0xffc84a,
                atk: ['spiral', 'laser', 'mortar', 'burst', 'summon', 'slam'],
                rage: ['laser', 'spiral', 'homing', 'charge', 'ring', 'mortar'] }
  };

  var BOSS_ORDER = [
    'hammer', 'hive', 'bastion', 'titan',
    'phantom', 'scorpion', 'hammer', 'thor',
    'hive', 'bastion', 'phantom', 'titan',
    'scorpion', 'thor', 'hammer', 'gemini',
    'hive', 'bastion', 'phantom', 'titan',
    'scorpion', 'thor', 'gemini', 'overlord'
  ];

  // ---------- 玩家武器 ----------
  // unlock：从第几关（0 起）开始可用
  var WEAPONS = [
    { id: 'pulse',   key: '1', unlock: 0, rate: 8,    dmg: 11, speed: 95, life: 0.85 },
    { id: 'scatter', key: '2', unlock: 1, rate: 1.7,  dmg: 8,  pellets: 7, speed: 72, life: 0.36, spread: 0.55, knock: 2.6 },
    { id: 'plasma',  key: '3', unlock: 3, rate: 1.25, dmg: 34, aoe: 22, radius: 5, speed: 46, life: 1.5 },
    { id: 'laser',   key: '4', unlock: 6, dps: 95, width: 0.55, len: 46, heat: 4.5 }
  ];

  // ---------- 关卡生成（固定种子，每次一样） ----------
  function rng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  var WEIGHTS = { drone: 3, walker: 3, turret: 1.4, kamikaze: 1.6, heavy: 1, artillery: 1 };

  function buildWave(L, budget, r) {
    var pool = [];
    Object.keys(ENEMIES).forEach(function (k) { if (ENEMIES[k].from <= L) pool.push(k); });
    var total = 0; pool.forEach(function (k) { total += WEIGHTS[k]; });
    var counts = {}, n = 0, guard = 0;
    while (budget > 0.5 && n < 18 && guard++ < 60) {
      var x = r() * total, pick = pool[0];
      for (var i = 0; i < pool.length; i++) { x -= WEIGHTS[pool[i]]; if (x <= 0) { pick = pool[i]; break; } }
      if (pick === 'turret' && (counts.turret || 0) >= 3) continue;
      if (pick === 'artillery' && (counts.artillery || 0) >= 3) continue;
      if (pick === 'heavy' && (counts.heavy || 0) >= 2 + Math.floor(L / 8)) continue;
      counts[pick] = (counts[pick] || 0) + 1; n++;
      budget -= ENEMIES[pick].cost;
    }
    return Object.keys(counts).map(function (k) { return [k, counts[k]]; });
  }

  var LEVELS = [];
  for (var L = 0; L < 24; L++) {
    var r = rng(L * 9973 + 17);
    var nW = L < 4 ? 2 : 3, waves = [];
    for (var w = 0; w < nW; w++) waves.push(buildWave(L, 4.5 + L * 0.7 + w * 1.8, r));
    var escorts = L < 2 ? [] : buildWave(Math.min(L, 4), 1 + L * 0.18, r);
    LEVELS.push({ sector: Math.floor(L / 4), sub: (L % 4) + 1, waves: waves, boss: BOSS_ORDER[L], escorts: escorts });
  }

  return { SECTORS: SECTORS, ENEMIES: ENEMIES, BOSSES: BOSSES, WEAPONS: WEAPONS, LEVELS: LEVELS, rng: rng };
})();
