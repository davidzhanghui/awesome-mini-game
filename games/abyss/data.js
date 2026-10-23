/* 深渊回响 — 数据层：职业 / 怪物 / 装备 / 祝福 / 关卡曲线
 * 这里只放数值与 key；所有可见文案在 strings.js，通过 T() 取。
 */
(function () {
  'use strict';

  var TILE = 64;

  /* ---------- 职业 ---------- */
  // skills: key 对应 strings 的 sk<Key> / sk<Key>d；cd 秒；mana 消耗
  var CLASSES = {
    knight: {
      nameKey: 'knight', descKey: 'knightDesc', tagKey: 'tagKnight', icon: '⚔️',
      hp: 190, mp: 70, hpReg: 3.2, mpReg: 3.0,
      armor: 18, dmg: 15, atkSpd: 1.55, moveSpd: 232,
      crit: .08, critD: 1.9, range: 78, arc: 1.5, melee: true,
      attackFx: 'slash', basicKey: 'K1', slashTint: 'steel',
      statName: [7, 3, 1],          // 升级时 力量/敏捷/智力 权重
      skills: [
        { key: 'K2', cd: 3.2, mana: 12 },
        { key: 'K3', cd: 7.5, mana: 18 },
        { key: 'K4', cd: 16, mana: 20 }
      ]
    },
    paladin: {
      nameKey: 'paladin', descKey: 'paladinDesc', tagKey: 'tagPaladin', icon: '🛡️',
      hp: 176, mp: 96, hpReg: 2.9, mpReg: 3.6,
      armor: 16, dmg: 14, atkSpd: 1.42, moveSpd: 224,
      crit: .07, critD: 1.9, range: 82, arc: 1.7, melee: true,
      attackFx: 'holy', basicKey: 'P1', slashTint: 'holy',
      statName: [6, 2, 3],
      skills: [
        { key: 'P2', cd: 3.4, mana: 13 },
        { key: 'P3', cd: 7.2, mana: 19 },
        { key: 'P4', cd: 14, mana: 22 },
        { key: 'P5', cd: 17, mana: 34 }
      ]
    },
    ranger: {
      nameKey: 'ranger', descKey: 'rangerDesc', tagKey: 'tagRanger', icon: '🏹',
      hp: 140, mp: 110, hpReg: 2.2, mpReg: 4.4,
      armor: 9, dmg: 11, atkSpd: 2.15, moveSpd: 248,
      crit: .18, critD: 2.05, range: 480, arc: 0, melee: false,
      attackFx: 'arrow', basicKey: 'R1', boltSpeed: 860,
      shot: { color: '#e8d9a0', r: 3, kind: 'arrow', sfx: 'bow', turn: 5 },
      statName: [2, 7, 2],
      skills: [
        { key: 'R2', cd: 2.2, mana: 13 },
        { key: 'R3', cd: 9, mana: 20 },
        { key: 'R4', cd: 6, mana: 12 },
        { key: 'R5', cd: 14, mana: 32 }
      ]
    },
    mage: {
      nameKey: 'mage', descKey: 'mageDesc', tagKey: 'tagMage', icon: '🔥',
      hp: 120, mp: 160, hpReg: 1.6, mpReg: 7.0,
      armor: 4, dmg: 13, atkSpd: 1.25, moveSpd: 214,
      crit: .05, critD: 2.0, range: 460, arc: 0, melee: false,
      attackFx: 'firebolt', basicKey: '1', boltSpeed: 560,
      shot: { color: '#ff9a4a', r: 6, kind: 'firebolt', trail: 'fire', sfx: 'fire', turn: 7.5, cast: .18 },
      statName: [1, 2, 8],
      skills: [
        { key: 'M2', cd: 2.6, mana: 16 },
        { key: 'M3', cd: 8.5, mana: 24 },
        { key: 'M4', cd: 5.5, mana: 10 },
        { key: 'M5', cd: 15, mana: 40 }
      ]
    },
    warlock: {
      nameKey: 'warlock', descKey: 'warlockDesc', tagKey: 'tagWarlock', icon: '💀',
      hp: 134, mp: 148, hpReg: 2.0, mpReg: 5.6,
      armor: 6, dmg: 12, atkSpd: 1.32, moveSpd: 218,
      crit: .1, critD: 1.95, range: 445, arc: 0, melee: false,
      attackFx: 'shadowbolt', basicKey: 'W1', boltSpeed: 620,
      shot: { color: '#b070f0', r: 5, kind: 'shadow', trail: 'shadow', sfx: 'dark', turn: 8, cast: .16 },
      statName: [1, 3, 7],
      skills: [
        { key: 'W2', cd: 2.8, mana: 14 },
        { key: 'W3', cd: 10, mana: 26 },
        { key: 'W4', cd: 7, mana: 16 },
        { key: 'W5', cd: 15, mana: 34 }
      ]
    }
  };

  var CLASS_ORDER = ['knight', 'paladin', 'ranger', 'mage', 'warlock'];

  /* ---------- 怪物 ---------- */
  // ai: chase 追击 / keep 远程保持距离 / erratic 乱飞 / leap 扑击
  var MONSTERS = {
    zombie:   { nameKey: 'zombie',   hp: 46,  dmg: 7,  spd: 62,  r: 22, ai: 'chase',  xp: 9,  gold: [1, 4],  minD: 1, color: '#7fae74' },
    skeleton: { nameKey: 'skeleton', hp: 38,  dmg: 9,  spd: 74,  r: 21, ai: 'keep',   xp: 11, gold: [1, 5],  minD: 1, color: '#cfc7b0', ranged: { speed: 300, range: 430, cd: 2.4, dmg: 8 } },
    bat:      { nameKey: 'bat',      hp: 26,  dmg: 6,  spd: 132, r: 17, ai: 'erratic', xp: 8,  gold: [1, 3],  minD: 1, color: '#8a6cae' },
    hound:    { nameKey: 'hound',    hp: 54,  dmg: 11, spd: 146, r: 21, ai: 'chase',  xp: 16, gold: [2, 6],  minD: 2, color: '#a05a42', dash: { cd: 3.4, spd: 430, t: .26 } },
    brute:    { nameKey: 'brute',    hp: 190, dmg: 18, spd: 52,  r: 32, ai: 'chase',  xp: 30, gold: [4, 11], minD: 2, color: '#9a8f7d', armor: 12 },
    cultist:  { nameKey: 'cultist',  hp: 74,  dmg: 12, spd: 70,  r: 22, ai: 'keep',   xp: 18, gold: [3, 8],  minD: 2, color: '#b05c5c', ranged: { speed: 260, range: 470, cd: 2.1, dmg: 11 } },
    wisp:     { nameKey: 'wisp',     hp: 42,  dmg: 10, spd: 92,  r: 17, ai: 'erratic', xp: 17, gold: [2, 7],  minD: 3, color: '#5ab8c8', ranged: { speed: 210, range: 420, cd: 2.9, dmg: 10, homing: 2.2 } },
    spider:   { nameKey: 'spider',   hp: 58,  dmg: 10, spd: 118, r: 19, ai: 'leap',   xp: 14, gold: [2, 6],  minD: 3, color: '#6f8a5c' },
    shade:    { nameKey: 'shade',    hp: 96,  dmg: 14, spd: 96,  r: 23, ai: 'chase',  xp: 22, gold: [3, 9],  minD: 4, color: '#6b6f9e', phase: true },
    spitter:  { nameKey: 'spitter',  hp: 70,  dmg: 12, spd: 96,  r: 21, ai: 'keep',   xp: 21, gold: [3, 8],  minD: 4, color: '#7a9a4a', ranged: { speed: 290, range: 440, cd: 2.3, dmg: 12, poison: true } },
    ghoul:    { nameKey: 'ghoul',    hp: 138, dmg: 15, spd: 88,  r: 25, ai: 'chase',  xp: 26, gold: [3, 10], minD: 5, color: '#7f8a68', leech: .4 },
    sentinel: { nameKey: 'sentinel', hp: 264, dmg: 20, spd: 46,  r: 31, ai: 'chase',  xp: 42, gold: [5, 13], minD: 6, color: '#8a8478', armor: 12, slam: { r: 104, dmg: 18, cd: 3.6 } },
    golem:    { nameKey: 'golem',    hp: 520, dmg: 24, spd: 58,  r: 54, ai: 'chase',  xp: 220, gold: [45, 80], minD: 3, color: '#7b7566', armor: 15, boss: true, slam: { r: 120, dmg: 28, cd: 4.0 } },
    lich:     { nameKey: 'lich',     hp: 300, dmg: 20, spd: 64,  r: 38, ai: 'keep',   xp: 300, gold: [55, 95], minD: 6, color: '#7a68b0', armor: 8, boss: true,
                ranged: { speed: 310, range: 540, cd: 2.0, dmg: 16, volley: 3, spread: .22 },
                summon: { cd: 8.5, kinds: ['skeleton', 'shade'], n: 2 } },
    abomination: { nameKey: 'abomination', hp: 400, dmg: 30, spd: 54, r: 50, ai: 'chase', xp: 420, gold: [80, 130], minD: 9, color: '#6f7a4c', armor: 14, boss: true,
                slam: { r: 150, dmg: 34, cd: 3.4 }, charge: { cd: 7.5, spd: 540, t: .45 } }
  };

  var NORMAL_POOL = ['zombie', 'skeleton', 'bat', 'hound', 'brute', 'cultist', 'wisp', 'spider', 'shade', 'spitter', 'ghoul', 'sentinel'];

  /* ---------- 精英词缀 ---------- */
  var AFFIXES = [
    { id: 'affix1', key: 'eliteAffix1', apply: function (m) { m.spd *= 1.45; m.atkCd *= 0.75; } },
    { id: 'affix2', key: 'eliteAffix2', apply: function (m) { m.split = true; }, color: '#a06fd0' },
    { id: 'affix3', key: 'eliteAffix3', apply: function (m) { m.shield = 1; m.hp *= 1.35; m.maxhp *= 1.35; }, color: '#6fa8d0' },
    { id: 'affix4', key: 'eliteAffix4', apply: function (m) { m.rage = true; m.dmg *= 1.25; }, color: '#d06060' }
  ];

  /* ---------- 装备 ---------- */
  // slot: weapon / offhand / helm / chest / boots / ring / amulet
  var SLOTS = ['weapon', 'offhand', 'helm', 'chest', 'boots', 'ring1', 'ring2', 'amulet'];
  var SLOT_LABEL = { weapon: 'slotWeapon', offhand: 'slotOffhand', helm: 'slotHelm', chest: 'slotChest', boots: 'slotBoots', ring1: 'slotRing1', ring2: 'slotRing2', amulet: 'slotAmulet' };
  // 戒指槽可互换成对
  var SLOT_KIND = { weapon: 'weapon', offhand: 'offhand', helm: 'helm', chest: 'chest', boots: 'boots', ring1: 'ring', ring2: 'ring', amulet: 'amulet' };

  // 词缀池：按槽位限制；v 范围会随物品等级放大
  var AFFIX_POOL = [
    { key: 'armor',          label: 'armor',          slots: ['helm', 'chest', 'boots', 'offhand'], base: [6, 14], per: 1.6, fmt: 'int', p: 1.0 },
    { key: 'dmg',            label: 'dmg',            slots: ['weapon', 'ring', 'amulet', 'offhand'], base: [3, 8], per: 1.1, fmt: 'int', p: 0.95 },
    { key: 'life',           label: 'health',         slots: ['helm', 'chest', 'boots', 'ring', 'amulet', 'offhand'], base: [14, 34], per: 6, fmt: 'int', p: 1.0 },
    { key: 'mana',           label: 'mana',           slots: ['helm', 'chest', 'ring', 'amulet', 'offhand'], base: [10, 24], per: 4, fmt: 'int', p: 0.75 },
    { key: 'crit',           label: 'critChance',     slots: ['weapon', 'ring', 'amulet', 'helm'], base: [2, 5], per: 0.25, fmt: 'pct', p: 0.7 },
    { key: 'critD',          label: 'critDamage',     slots: ['weapon', 'ring', 'amulet'], base: [10, 24], per: 1.2, fmt: 'pct', p: 0.6 },
    { key: 'moveSpd',        label: 'moveSpeed',      slots: ['boots', 'ring', 'amulet'], base: [3, 7], per: 0.2, fmt: 'pct', p: 0.6 },
    { key: 'atkSpd',         label: 'attackSpeed',    slots: ['weapon', 'boots', 'ring'], base: [3, 8], per: 0.2, fmt: 'pct', p: 0.6 },
    { key: 'lifeSteal',      label: 'lifeSteal',      slots: ['weapon', 'ring', 'amulet'], base: [1, 3], per: 0.08, fmt: 'pct1', p: 0.35 },
    { key: 'thorns',         label: 'thorns',         slots: ['chest', 'helm', 'offhand'], base: [3, 9], per: 0.9, fmt: 'int', p: 0.45 },
    { key: 'magicFind',      label: 'magicFind',      slots: ['helm', 'boots', 'ring', 'amulet'], base: [4, 11], per: 0.5, fmt: 'pct', p: 0.45 },
    { key: 'goldFind',       label: 'goldFind',       slots: ['helm', 'boots', 'ring', 'amulet'], base: [6, 16], per: 0.8, fmt: 'pct', p: 0.5 },
    { key: 'skillPower',     label: 'skillPower',     slots: ['weapon', 'offhand', 'amulet'], base: [5, 14], per: 1.0, fmt: 'pct', p: 0.5 },
    { key: 'lifeReg',        label: 'regen',          slots: ['chest', 'chest', 'boots', 'amulet'], base: [2, 6], per: 0.3, fmt: 'pct1', p: 0.4 },
    { key: 'dr',             label: 'damageReduction', slots: ['chest', 'helm', 'offhand'], base: [2, 5], per: 0.12, fmt: 'pct', p: 0.35 }
  ];

  var RARITY = [
    { key: 'common',    affixes: 0, mult: 1.00, color: '#b9b2a4' },
    { key: 'magic',     affixes: 1, mult: 1.06, color: '#6fa8ff' },
    { key: 'rare',      affixes: 3, mult: 1.14, color: '#f2c14e' },
    { key: 'legendary', affixes: 4, mult: 1.26, color: '#e08f4a' }
  ];

  // 基础名用 key：bn_<slot>[_<class>]；稀有度前缀 pre1..pre4 也在 strings.js
  var BASE_NAME_KEYS = {
    weapon: { knight: 'bn_weapon_knight', paladin: 'bn_weapon_paladin', mage: 'bn_weapon_mage', ranger: 'bn_weapon_ranger', warlock: 'bn_weapon_warlock' },
    offhand: { knight: 'bn_offhand_knight', paladin: 'bn_offhand_paladin', mage: 'bn_offhand_mage', ranger: 'bn_offhand_ranger', warlock: 'bn_offhand_warlock' },
    helm: 'bn_helm', chest: 'bn_chest', boots: 'bn_boots', ring: 'bn_ring', amulet: 'bn_amulet'
  };
  var RARITY_PREFIX = ['', 'pre2', 'pre3', '']; // 普通无前缀，魔法/稀有加形容词；传奇用专名

  // 传奇：独一无二的特效词条
  var LEGENDARIES = [
    { id: 'lg1', name: '裂魂者', nameEn: 'Soulrenderer', slot: 'weapon', descKey: 'lg1d',
      stats: { crit: 8, dmg: 22 }, fx: { critHeal: 3 } },
    { id: 'lg2', name: '不灭壁垒', nameEn: 'Unbreaking Bulwark', slot: 'offhand', descKey: 'lg2d',
      stats: { armor: 26, dr: 6 }, fx: { lastStand: true } },
    { id: 'lg3', name: '灰烬之息', nameEn: 'Ash Breath', slot: 'helm', descKey: 'lg3d',
      stats: { life: 40, skillPower: 12 }, fx: { deathNova: .2 } },
    { id: 'lg4', name: '血月胸甲', nameEn: 'Bloodmoon Plate', slot: 'chest', descKey: 'lg4d',
      stats: { armor: 32, life: 60 }, fx: { lowHpDmg: .3 } },
    { id: 'lg5', name: '踏影靴', nameEn: 'Shadewalkers', slot: 'boots', descKey: 'lg5d',
      stats: { moveSpd: 12 }, fx: { dodge: .08 } },
    { id: 'lg6', name: '贪婪之戒', nameEn: 'Ring of Avarice', slot: 'ring', descKey: 'lg6d',
      stats: { goldFind: 80 }, fx: { goldBurst: .25 } },
    { id: 'lg7', name: '风暴吊坠', nameEn: 'Storm Pendant', slot: 'amulet', descKey: 'lg7d',
      stats: { skillPower: 18, crit: 4 }, fx: { chain: .15 } },
    { id: 'lg8', name: '噬魂之刃', nameEn: 'Soul Eater', slot: 'weapon', descKey: 'lg8d',
      stats: { lifeSteal: 5, dmg: 16 }, fx: { killMana: 4 } }
  ];
  var LEGENDARY_DESC = {
    zh: { lg1d: '每次暴击回复 3 点生命。', lg2d: '受到致命伤害时，保留 1 点生命（每层一次）。', lg3d: '击杀敌人时有 20% 概率释放一圈火焰。', lg4d: '生命低于 35% 时伤害 +30%。', lg5d: '移动速度 +12%，闪避概率 8%。', lg6d: '金币 +80%，击杀时有概率爆出金币。', lg7d: '攻击时 15% 概率连锁闪电。', lg8d: '生命偷取 +5%，击杀回复 4 点法力。' },
    en: { lg1d: 'Critical hits restore 3 life.', lg2d: 'Survive a lethal hit at 1 life once per floor.', lg3d: '20% chance to release a ring of fire on kill.', lg4d: '+30% damage while below 35% life.', lg5d: '+12% move speed, 8% dodge.', lg6d: '+80% gold; kills may burst into coins.', lg7d: '15% chance to chain lightning on attack.', lg8d: '+5% life steal; kills restore 4 mana.' },
    ja: { lg1d: '会心のたびに体力3回復。', lg2d: '致命傷を1度だけ体力1で耐える（階層ごと）。', lg3d: '撃破時20%で炎の輪を放つ。', lg4d: '体力35%未満でダメージ+30%。', lg5d: '移動速度+12%、回避8%。', lg6d: 'ゴールド+80%、撃破時にコイン爆発。', lg7d: '攻撃時15%で連鎖稲妻。', lg8d: '生命吸収+5%、撃破でマナ4回復。' },
    ko: { lg1d: '치명타마다 생명력 3 회복.', lg2d: '치명타를 1회 버틴다(층마다 1회).', lg3d: '처치 시 20% 확률로 화염 고리.', lg4d: '생명력 35% 미만 시 피해 +30%.', lg5d: '이동 속도 +12%, 회피 8%.', lg6d: '골드 +80%, 처치 시 코인 폭발.', lg7d: '공격 시 15% 확률 연쇄 번개.', lg8d: '생명력 흡수 +5%, 처치 시 마나 4 회복.' }
  };

  /* ---------- 祝福 ---------- */
  var BLESSINGS = [
    { id: 'bCrit',  w: 10, apply: function (p) { p.b.crit += .08; p.b.critD += .25; } },
    { id: 'bLife',  w: 10, apply: function (p) { p.b.lifeMult += .28; } },
    { id: 'bArmor', w: 9,  apply: function (p) { p.b.armorMult += .40; p.b.dr += .08; } },
    { id: 'bSwift', w: 9,  apply: function (p) { p.b.moveMult += .18; p.b.atkSpdMult += .15; } },
    { id: 'bVamp',  w: 6,  apply: function (p) { p.b.lifeSteal += .06; } },
    { id: 'bFire',  w: 8,  apply: function (p) { p.b.fireDmg += 6; } },
    { id: 'bThorn', w: 7,  apply: function (p) { p.b.thorns += 12; } },
    { id: 'bGreed', w: 7,  apply: function (p) { p.b.goldMult += .5; p.b.magicFind += .3; } },
    { id: 'bRegen', w: 8,  apply: function (p) { p.b.hpRegenPct += .03; } },
    { id: 'bSkill', w: 8,  apply: function (p) { p.b.skillMult += .25; p.b.cdMult -= .12; } },
    { id: 'bMana',  w: 6,  apply: function (p) { p.b.manaMult += .6; p.b.mpRegenMult += 1; } },
    { id: 'bPotion', w: 6, apply: function (p) { p.potions += 3; p.b.potionPower += .4; } },
    { id: 'bGlass', w: 5,  apply: function (p) { p.b.dmgMult += .3; p.b.lifeMult -= .15; } }
  ];

  /* ---------- 曲线 ---------- */
  function xpToLevel(lv) { return Math.round(56 * Math.pow(lv, 1.42)); }
  // 前 6 层指数成长（开局有压迫感），之后转为线性：玩家输出随等级/装备大致线性增长，
  // 两边都指数会变成"深层刮痧"，两边都线性又会让前 3 层太软。
  function floorScale(depth) {
    var hp = depth <= 6 ? Math.pow(1.30, depth - 1)
      : Math.pow(1.30, 5) * (1 + .075 * (depth - 6));
    var dmg = depth <= 8 ? Math.pow(1.21, depth - 1)
      : Math.pow(1.21, 7) * (1 + .085 * (depth - 8));
    return { hp: hp, dmg: dmg };
  }
  function monsterCount(depth) { return 10 + Math.min(22, depth * 3); }

  var FLOOR_NAMES = ['floorName1', 'floorName2', 'floorName3', 'floorName4', 'floorName5', 'floorName6',
    'floorName7', 'floorName8', 'floorName9', 'floorName10'];

  // 守层者轮换：每 3 层一位，之后循环并随层数增强
  var BOSS_ORDER = ['golem', 'lich', 'abomination'];
  function bossForDepth(depth) { return BOSS_ORDER[(Math.floor(depth / 3) - 1) % BOSS_ORDER.length]; }
  function floorName(depth) { return FLOOR_NAMES[Math.min(depth - 1, FLOOR_NAMES.length - 1)]; }

  window.ABYSS_DATA = {
    TILE: TILE,
    CLASSES: CLASSES, CLASS_ORDER: CLASS_ORDER,
    MONSTERS: MONSTERS, NORMAL_POOL: NORMAL_POOL,
    AFFIXES: AFFIXES,
    SLOTS: SLOTS, SLOT_LABEL: SLOT_LABEL, SLOT_KIND: SLOT_KIND,
    AFFIX_POOL: AFFIX_POOL, RARITY: RARITY,
    BASE_NAME_KEYS: BASE_NAME_KEYS, RARITY_PREFIX: RARITY_PREFIX,
    LEGENDARIES: LEGENDARIES, LEGENDARY_DESC: LEGENDARY_DESC,
    BLESSINGS: BLESSINGS,
    xpToLevel: xpToLevel, floorScale: floorScale, monsterCount: monsterCount,
    FLOOR_NAMES: FLOOR_NAMES, floorName: floorName,
    BOSS_ORDER: BOSS_ORDER, bossForDepth: bossForDepth,
    POTION_HEAL: .42, POTION_CD: 1.6
  };
})();
