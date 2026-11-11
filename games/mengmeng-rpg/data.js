'use strict';
/* ================= 基础常量与工具 ================= */
const TILE = 48, VW = 1024, VH = 640, MAXLV = 60, BAG = 40;
const $ = s => document.querySelector(s);
const rnd = (a, b) => a + Math.random() * (b - a);
const ri = (a, b) => Math.floor(rnd(a, b + 1));
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const pick = a => a[Math.floor(Math.random() * a.length)];
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/* ================= 职业 ================= */
const CLASSES = {
  warrior: { name: '剑士', icon: '⚔️', hair: '#e8543f', cloth: '#4a78d0', hat: 'band', main: 'str',
    base: { str: 9, agi: 5, int: 3, con: 8 }, range: 64, atkCd: 0.42, wn: '之剑', wi: '🗡️',
    desc: '近战肉盾，皮糙肉厚，范围挥砍。' },
  mage: { name: '法师', icon: '🪄', hair: '#8e5fe0', cloth: '#7a4fd0', hat: 'wizard', main: 'int',
    base: { str: 3, agi: 5, int: 10, con: 6 }, range: 330, atkCd: 0.55, wn: '法杖', wi: '🪄',
    desc: '远程魔法，范围爆发，还能治疗。' },
  archer: { name: '弓手', icon: '🏹', hair: '#3fae5a', cloth: '#3d9a6a', hat: 'cap', main: 'agi',
    base: { str: 4, agi: 10, int: 4, con: 7 }, range: 380, atkCd: 0.36, wn: '长弓', wi: '🏹',
    desc: '远程射手，攻速飞快，暴击超高。' },
};

/* ================= 技能 ================= */
const SKILLS = {
  warrior: [
    { id: 'w1', name: '旋风斩', icon: '🌀', lv: 1, mp: 8, cd: 3, type: 'aoeSelf', r: 115, mul: 1.7, desc: '旋转挥砍周围所有敌人' },
    { id: 'w2', name: '冲锋突刺', icon: '💨', lv: 5, mp: 14, cd: 6, type: 'dash', dist: 230, mul: 2.5, desc: '向前冲锋并重创路径上的敌人' },
    { id: 'w3', name: '战神怒吼', icon: '📣', lv: 12, mp: 20, cd: 20, type: 'buff', dur: 10, desc: '攻击与防御提升30%' },
    { id: 'w4', name: '天崩地裂', icon: '💥', lv: 20, mp: 40, cd: 16, type: 'aoeSelf', r: 210, mul: 4.2, stun: 1.5, desc: '震碎大地，大范围伤害并眩晕' },
  ],
  mage: [
    { id: 'm1', name: '火球术', icon: '🔥', lv: 1, mp: 10, cd: 2.5, type: 'proj', mul: 2.3, splash: 85, col: '#ff7a2a', desc: '发射会爆炸的火球' },
    { id: 'm2', name: '冰霜新星', icon: '❄️', lv: 5, mp: 16, cd: 7, type: 'aoeSelf', r: 155, mul: 1.7, slow: 3.5, desc: '冰环扩散，伤害并减速敌人' },
    { id: 'm3', name: '治愈之光', icon: '💖', lv: 12, mp: 30, cd: 15, type: 'heal', pct: 0.35, desc: '恢复自身大量生命' },
    { id: 'm4', name: '陨石天降', icon: '☄️', lv: 20, mp: 50, cd: 16, type: 'rain', r: 140, mul: 1.5, hits: 5, col: '255,120,40', desc: '召唤陨石连续轰炸一片区域' },
  ],
  archer: [
    { id: 'a1', name: '多重箭', icon: '🎯', lv: 1, mp: 8, cd: 3, type: 'fan', n: 5, mul: 1.15, desc: '扇形射出5支箭' },
    { id: 'a2', name: '穿云箭', icon: '⚡', lv: 5, mp: 14, cd: 6, type: 'proj', mul: 2.9, pierce: true, col: '#ffe14a', desc: '贯穿直线上所有敌人' },
    { id: 'a3', name: '疾风步', icon: '🍃', lv: 12, mp: 20, cd: 20, type: 'buff', dur: 10, desc: '移速+40%，暴击+20%' },
    { id: 'a4', name: '万箭齐发', icon: '🌠', lv: 20, mp: 45, cd: 16, type: 'rain', r: 150, mul: 1.3, hits: 6, col: '120,220,140', desc: '箭雨覆盖一片区域' },
  ],
};
const SKILL_MAX = 10;

/* ================= 装备 ================= */
const SLOTS = ['weapon', 'helmet', 'armor', 'boots', 'ring', 'necklace'];
const SLOT_NAME = { weapon: '武器', helmet: '头盔', armor: '铠甲', boots: '鞋子', ring: '戒指', necklace: '项链' };
const SLOT_ICON = { weapon: '🗡️', helmet: '🪖', armor: '🥋', boots: '👢', ring: '💍', necklace: '📿' };
const SLOT_SUFFIX = { helmet: '头盔', armor: '战衣', boots: '靴', ring: '指环', necklace: '项链' };
const RAR = [
  { n: '普通', c: '#8a8a8a', m: 1 }, { n: '优秀', c: '#3aa655', m: 1.2 }, { n: '精良', c: '#2f7fe0', m: 1.45 },
  { n: '史诗', c: '#a44be0', m: 1.75 }, { n: '传说', c: '#f08a1c', m: 2.1 },
];
const TIERS = [
  { lv: 1, n: '新手' }, { lv: 6, n: '青藤' }, { lv: 12, n: '蘑菇' }, { lv: 18, n: '黄沙' }, { lv: 25, n: '水晶' },
  { lv: 32, n: '霜雪' }, { lv: 39, n: '熔岩' }, { lv: 46, n: '幽沼' }, { lv: 53, n: '天穹' }, { lv: 58, n: '魔王' },
];
const ATTR_NAME = { str: '力量', agi: '敏捷', int: '智力', con: '体质' };
const ATTR_DESC = { str: '剑士攻击、少量防御', agi: '弓手攻击、暴击率', int: '法师攻击、魔法值', con: '生命值、防御' };
const STAT_NAME = { atk: '攻击', def: '防御', hp: '生命', mp: '魔法', crit: '暴击%', spd: '移速%', str: '力量', agi: '敏捷', int: '智力', con: '体质' };
const SCORE_W = { atk: 1, def: 1.2, hp: 0.12, mp: 0.06, crit: 6, spd: 3, str: 2, agi: 2, int: 2, con: 2 };
const ENH_RATE = [100, 100, 90, 80, 70, 60, 50, 40, 35, 30, 25, 20];

function makeEquip(slot, tier, rar, cls) {
  tier = clamp(tier, 0, 9); rar = clamp(rar, 0, 4);
  const T = TIERS[tier], L = T.lv, m = RAR[rar].m, b = {};
  if (slot === 'weapon') b.atk = (6 + L * 3.2) * m;
  else if (slot === 'helmet') { b.def = (2 + L * 0.9) * m; b.hp = (10 + L * 6) * m; }
  else if (slot === 'armor') { b.def = (4 + L * 1.6) * m; b.hp = (20 + L * 8) * m; }
  else if (slot === 'boots') { b.def = (1 + L * 0.6) * m; b.spd = 3 + tier + rar; }
  else if (slot === 'ring') { b.atk = (2 + L) * m; b.crit = 2 + tier * 0.5 + rar * 0.5; }
  else { b.hp = (15 + L * 6) * m; b.mp = (10 + L * 5) * m; }
  for (const k in b) b[k] = Math.max(1, Math.round(b[k]));
  const affix = {}, pool = ['str', 'agi', 'int', 'con', 'hp', 'mp', 'crit'];
  for (let i = 0; i < rar; i++) {
    const k = pick(pool);
    const v = k === 'hp' ? L * 5 + 10 : k === 'mp' ? L * 4 + 8 : k === 'crit' ? rnd(1, 3) : 1 + L * 0.25;
    affix[k] = (affix[k] || 0) + Math.max(1, Math.round(v * rnd(0.7, 1.3)));
  }
  const C = CLASSES[cls] || CLASSES.warrior;
  return {
    eq: 1, slot, tier, lv: L, rar, cls: slot === 'weapon' ? cls : null,
    name: T.n + (slot === 'weapon' ? C.wn : SLOT_SUFFIX[slot]),
    icon: slot === 'weapon' ? C.wi : SLOT_ICON[slot], base: b, affix, plus: 0,
  };
}
function eqPrice(e) { return Math.round((30 + e.lv * e.lv * 1.5 + e.lv * 20) * RAR[e.rar].m * RAR[e.rar].m * (1 + e.plus * 0.15)); }
function eqScore(e) {
  if (!e) return 0;
  const k = 1 + e.plus * 0.08; let s = 0;
  for (const key in e.base) s += Math.round(e.base[key] * k) * SCORE_W[key];
  for (const key in e.affix) s += e.affix[key] * SCORE_W[key];
  return Math.round(s);
}
function enhCost(e) { return { gold: Math.round(40 * (e.plus + 1) * (1 + e.lv / 6)), stone: 1 + Math.floor(e.plus / 3) }; }

/* ================= 道具 ================= */
const ITEMS = {
  hp1: { name: '苹果红药', icon: '🍎', type: 'potion', hp: 100, price: 15, desc: '恢复100点生命' },
  hp2: { name: '草莓红药', icon: '🍓', type: 'potion', hp: 300, price: 60, desc: '恢复300点生命' },
  hp3: { name: '樱桃红药', icon: '🍒', type: 'potion', hp: 800, price: 180, desc: '恢复800点生命' },
  hp4: { name: '蜜桃圣药', icon: '🍑', type: 'potion', hp: 2000, price: 500, desc: '恢复2000点生命' },
  mp1: { name: '蓝莓蓝药', icon: '🫐', type: 'potion', mp: 60, price: 12, desc: '恢复60点魔法' },
  mp2: { name: '葡萄蓝药', icon: '🍇', type: 'potion', mp: 180, price: 50, desc: '恢复180点魔法' },
  mp3: { name: '果汁蓝药', icon: '🧃', type: 'potion', mp: 450, price: 150, desc: '恢复450点魔法' },
  mp4: { name: '星露圣水', icon: '🍷', type: 'potion', mp: 1000, price: 400, desc: '恢复1000点魔法' },
  scroll: { name: '回城卷轴', icon: '📜', type: 'scroll', price: 40, desc: '立刻传送回萌萌村（快捷键 T）' },
  atkPot: { name: '狂暴药剂', icon: '💪', type: 'buff', buff: 'atkPot', dur: 180, price: 300, desc: '3分钟内攻击+20%' },
  expPot: { name: '双倍经验药水', icon: '🌟', type: 'buff', buff: 'expPot', dur: 300, price: 600, desc: '5分钟内获得双倍经验' },
  stone: { name: '强化石', icon: '💎', type: 'mat', price: 200, desc: '铁匠强化装备的必需材料' },
  mat1: { name: '黏黏凝胶', icon: '🫧', type: 'mat', price: 24, desc: '草原怪物掉落的材料' },
  mat2: { name: '蘑菇孢子', icon: '🍄', type: 'mat', price: 48, desc: '蘑菇森林的材料' },
  mat3: { name: '仙人掌刺', icon: '🌵', type: 'mat', price: 72, desc: '金沙荒漠的材料' },
  mat4: { name: '水晶碎片', icon: '🔷', type: 'mat', price: 100, desc: '水晶矿洞的材料' },
  mat5: { name: '万年冰晶', icon: '❄️', type: 'mat', price: 130, desc: '雪域冰原的材料' },
  mat6: { name: '火焰核心', icon: '🌋', type: 'mat', price: 160, desc: '熔岩火山的材料' },
  mat7: { name: '幽魂之骨', icon: '🦴', type: 'mat', price: 200, desc: '幽暗沼泽的材料' },
  mat8: { name: '天空之羽', icon: '🪶', type: 'mat', price: 240, desc: '天空之城的材料' },
  mat9: { name: '暗影精华', icon: '🖤', type: 'mat', price: 300, desc: '魔王城堡的材料' },
  egg_slime: { name: '宠物蛋·啵啵', icon: '🥚', type: 'egg', pet: 'slime', price: 800, desc: '孵化出宠物「啵啵史莱姆」' },
  egg_shroom: { name: '宠物蛋·菇菇', icon: '🥚', type: 'egg', pet: 'shroom', price: 3000, desc: '孵化出宠物「蘑菇仔」' },
  egg_bat: { name: '宠物蛋·小蝠', icon: '🥚', type: 'egg', pet: 'bat', price: 6000, desc: '孵化出宠物「小蝠蝠」' },
  egg_sprite: { name: '宠物蛋·火苗', icon: '🥚', type: 'egg', pet: 'sprite', price: 12000, desc: '孵化出宠物「火苗苗」' },
  egg_ghost: { name: '宠物蛋·幽幽', icon: '🥚', type: 'egg', pet: 'ghost', price: 16000, desc: '孵化出宠物「幽幽」' },
  egg_dragon: { name: '宠物蛋·团子龙', icon: '🥚', type: 'egg', pet: 'dragon', price: 30000, desc: '孵化出宠物「团子龙」' },
};
const SHOP_GOODS = ['hp1', 'hp2', 'hp3', 'hp4', 'mp1', 'mp2', 'mp3', 'mp4', 'scroll', 'atkPot', 'expPot', 'stone'];
const PET_GOODS = ['egg_slime', 'egg_shroom'];

/* ================= 宠物 ================= */
const PETS = {
  slime: { name: '啵啵史莱姆', shape: 'slime', c: '#7fd8ff', bonus: { hp: 0.08 }, desc: '生命 +8%' },
  shroom: { name: '蘑菇仔', shape: 'shroom', c: '#ff8a8a', bonus: { def: 0.12 }, desc: '防御 +12%' },
  bat: { name: '小蝠蝠', shape: 'bat', c: '#a080e0', bonus: { crit: 6 }, desc: '暴击 +6%' },
  sprite: { name: '火苗苗', shape: 'sprite', c: '#ff9040', bonus: { atk: 0.1 }, desc: '攻击 +10%' },
  ghost: { name: '幽幽', shape: 'ghost', c: '#d0d0ff', bonus: { mp: 0.2, atk: 0.05 }, desc: '魔法 +20%，攻击 +5%' },
  dragon: { name: '团子龙', shape: 'dragon', c: '#ffb04a', bonus: { atk: 0.12, hp: 0.1 }, desc: '攻击 +12%，生命 +10%' },
};

/* ================= 地图 ================= */
const THEMES = {
  village: { g: '#8fd46a', g2: '#86cc61', path: '#ecd9a0', liq: '#6ec3f0', rim: '#4d9fd0', ob1: 'tree', ob2: 'rock', leaf: '#4fae4a', deco: '#ff8ab0', dark: 0 },
  plains: { g: '#93d86e', g2: '#89d064', path: '#e6d294', liq: '#6ec3f0', rim: '#4d9fd0', ob1: 'tree', ob2: 'rock', leaf: '#58b84f', deco: '#ffe14a', dark: 0 },
  forest: { g: '#62b86a', g2: '#59ad61', path: '#c9b27c', liq: '#5ab0e0', rim: '#3e8ab8', ob1: 'tree', ob2: 'bigshroom', leaf: '#2f8a45', deco: '#ff7a7a', dark: 0.06 },
  desert: { g: '#f2dc96', g2: '#ead184', path: '#d6b46a', liq: '#58c8d8', rim: '#3aa0b0', ob1: 'cactus', ob2: 'rock', leaf: '#6fc76a', deco: '#e8a860', dark: 0 },
  cave: { g: '#736e8e', g2: '#6a6584', path: '#8e88aa', liq: '#3c3a5c', rim: '#2a2844', ob1: 'crystal', ob2: 'rock', leaf: '#b0a0ff', deco: '#c8b8ff', dark: 0.28 },
  snow: { g: '#f0f7ff', g2: '#e3eefb', path: '#cddcf0', liq: '#9fd8f5', rim: '#78b8dc', ob1: 'pine', ob2: 'icerock', leaf: '#4f9a7a', deco: '#b8e0ff', dark: 0 },
  volcano: { g: '#6e4c46', g2: '#62423d', path: '#8c6c60', liq: '#ff6a20', rim: '#c23a10', ob1: 'deadtree', ob2: 'rock', leaf: '#3a2a2a', deco: '#ff9a4a', dark: 0.12 },
  swamp: { g: '#5c7c5a', g2: '#527252', path: '#7c8c64', liq: '#7a5fa8', rim: '#5a4288', ob1: 'deadtree', ob2: 'bigshroom', leaf: '#3a4a3a', deco: '#b8e080', dark: 0.2 },
  sky: { g: '#f6f2ff', g2: '#eae4fb', path: '#ffe9a8', liq: '#8fd0ff', rim: '#6ab0ea', ob1: 'pillar', ob2: 'cloud', leaf: '#ffffff', deco: '#ffd86a', dark: 0 },
  castle: { g: '#4c465a', g2: '#443e52', path: '#6c3042', liq: '#b02a4a', rim: '#7a1830', ob1: 'pillar', ob2: 'torch', leaf: '#5a5468', deco: '#8a6aa0', dark: 0.3 },
};
const MAPS = [
  { id: 0, name: '萌萌村', theme: 'village', w: 30, h: 22, safe: true, lv: [1, 1], req: 1 },
  { id: 1, name: '青青草原', theme: 'plains', lv: [1, 6], req: 1, mons: ['slime_g', 'bug_f', 'boar'], boss: 'b_slime', mat: 'mat1',
    story: '村外的草原上，史莱姆越来越多了，连小野猪都变得暴躁起来……' },
  { id: 2, name: '蘑菇森林', theme: 'forest', lv: [6, 12], req: 5, mons: ['shroom_r', 'shroom_p', 'bat_f'], boss: 'b_shroom', mat: 'mat2',
    story: '森林里的蘑菇们突然长出了腿，据说是蘑菇长老在搞鬼。' },
  { id: 3, name: '金沙荒漠', theme: 'desert', lv: [12, 18], req: 11, mons: ['cactus', 'scarab', 'jackal'], boss: 'b_pharaoh', mat: 'mat3',
    story: '沙漠深处的古墓被打开了，沉睡千年的法老正在苏醒。' },
  { id: 4, name: '水晶矿洞', theme: 'cave', lv: [18, 25], req: 17, mons: ['bat_c', 'slime_c', 'golem_r'], boss: 'b_golem', mat: 'mat4', egg: 'egg_bat',
    story: '矿工们逃出了矿洞，他们说水晶活过来了！' },
  { id: 5, name: '雪域冰原', theme: 'snow', lv: [25, 32], req: 24, mons: ['slime_s', 'wolf_i', 'sprite_i'], boss: 'b_yeti', mat: 'mat5',
    story: '终年不化的雪原上，雪怪大王霸占了通往火山的唯一道路。' },
  { id: 6, name: '熔岩火山', theme: 'volcano', lv: [32, 39], req: 31, mons: ['sprite_f', 'slime_l', 'eye_f'], boss: 'b_dragon_f', mat: 'mat6', egg: 'egg_sprite',
    story: '火山口传来龙吼，炎龙·赤焰的怒火快要把大陆烤熟了。' },
  { id: 7, name: '幽暗沼泽', theme: 'swamp', lv: [39, 46], req: 38, mons: ['ghost_s', 'plant_m', 'skull_s'], boss: 'b_lich', mat: 'mat7', egg: 'egg_ghost',
    story: '沼泽的雾气里游荡着亡灵，巫妖正在为魔王召集军队。' },
  { id: 8, name: '天空之城', theme: 'sky', lv: [46, 53], req: 45, mons: ['sprite_c', 'bird_s', 'golem_g'], boss: 'b_dragon_t', mat: 'mat8', egg: 'egg_dragon',
    story: '漂浮在云端的古城，雷龙守护着通往魔王城的天桥。' },
  { id: 9, name: '魔王城堡', theme: 'castle', lv: [53, 60], req: 52, mons: ['eye_d', 'skull_k', 'ghost_d'], boss: 'b_demon', mat: 'mat9', egg: 'egg_dragon',
    story: '一切的源头——大魔王·噗噗就在城堡最深处，去结束这场闹剧吧！' },
];

/* ================= 怪物 ================= */
const SHAPE = {
  slime: { spd: 70, r: 16, h: 32 }, bug: { spd: 95, r: 14, h: 28 }, beast: { spd: 125, r: 18, h: 40 },
  shroom: { spd: 65, r: 15, h: 40 }, bat: { spd: 130, r: 13, h: 44, fly: 1 }, cactus: { spd: 45, r: 15, h: 48 },
  skull: { spd: 90, r: 15, h: 50 }, golem: { spd: 60, r: 20, h: 56 }, sprite: { spd: 100, r: 13, h: 48, fly: 1 },
  eye: { spd: 80, r: 15, h: 44, fly: 1 }, ghost: { spd: 90, r: 15, h: 44, fly: 1 }, dragon: { spd: 95, r: 20, h: 54 },
  demon: { spd: 100, r: 18, h: 62 },
};
const MONS = {};
[
  ['slime_g', '绿豆史莱姆', 'slime', '#8be05a', 1], ['bug_f', '花花瓢虫', 'bug', '#ff6b6b', 3], ['boar', '冲冲小野猪', 'beast', '#c98a5a', 5],
  ['b_slime', '史莱姆大王', 'slime', '#58b8ff', 7, 0],
  ['shroom_r', '红伞蘑菇仔', 'shroom', '#ff7a7a', 7], ['shroom_p', '毒毒菇', 'shroom', '#b07ae0', 9, 1], ['bat_f', '森林小蝙蝠', 'bat', '#8a6ad0', 11],
  ['b_shroom', '蘑菇长老', 'shroom', '#e0a040', 13, 0],
  ['cactus', '仙人掌球球', 'cactus', '#6fc76a', 13, 1], ['scarab', '圣甲虫', 'bug', '#e0b040', 15], ['jackal', '沙漠胡狼', 'beast', '#d8b070', 17],
  ['b_pharaoh', '沙之法老', 'skull', '#e8c860', 19, 1],
  ['bat_c', '洞穴蝙蝠', 'bat', '#6a7ab0', 19], ['slime_c', '水晶史莱姆', 'slime', '#b0a0ff', 21], ['golem_r', '岩石傀儡', 'golem', '#9a8a7a', 24],
  ['b_golem', '水晶巨像', 'golem', '#a090ff', 26, 0],
  ['slime_s', '雪团子', 'slime', '#f4faff', 26], ['wolf_i', '冰原狼', 'beast', '#b8d0e8', 28], ['sprite_i', '冰晶精灵', 'sprite', '#8fd8ff', 31, 1],
  ['b_yeti', '雪怪大王', 'golem', '#f0f6ff', 33, 0],
  ['sprite_f', '火焰精灵', 'sprite', '#ff8a3a', 33, 1], ['slime_l', '熔岩史莱姆', 'slime', '#ff6a30', 35], ['eye_f', '火山魔眼', 'eye', '#ff5040', 38, 1],
  ['b_dragon_f', '炎龙·赤焰', 'dragon', '#e8483a', 40, 1],
  ['ghost_s', '沼泽幽灵', 'ghost', '#b8e0c8', 40], ['plant_m', '食人花', 'cactus', '#a05ac0', 42, 1], ['skull_s', '骷髅兵', 'skull', '#8a9a8a', 45],
  ['b_lich', '沼泽巫妖', 'skull', '#7a50c0', 47, 1],
  ['sprite_c', '云朵精灵', 'sprite', '#e8f0ff', 47, 1], ['bird_s', '天空飞羽', 'bat', '#ffd070', 49], ['golem_g', '黄金守卫', 'golem', '#f0c850', 52],
  ['b_dragon_t', '雷龙·苍穹', 'dragon', '#6a8af0', 54, 1],
  ['eye_d', '深渊魔眼', 'eye', '#a040e0', 54, 1], ['skull_k', '骷髅骑士', 'skull', '#5a5a7a', 56], ['ghost_d', '暗影恶灵', 'ghost', '#6a4a8a', 58],
  ['b_demon', '大魔王·噗噗', 'demon', '#8a2a4a', 60, 1],
].forEach(r => { MONS[r[0]] = { name: r[1], shape: r[2], c: r[3], lv: r[4], rng: !!r[5] }; });

function monStats(lv, kind) { // kind: 0普通 1精英 2首领
  const k = [[1, 1, 1, 1, 1], [3, 1.25, 1.1, 4, 4], [22, 1.7, 1.3, 12, 25]][kind];
  return {
    hp: Math.round((30 + 18 * lv + 0.6 * lv * lv) * k[0]), atk: Math.round((8 + 4 * lv + 0.06 * lv * lv) * k[1]),
    def: Math.round((2 + 1.6 * lv) * k[2]), exp: Math.round((6 + 5 * lv + 0.25 * lv * lv) * k[3]), gold: Math.round((2 + 1.5 * lv) * k[4]),
  };
}
function expNeed(lv) { return Math.floor(40 + 30 * lv + 8 * lv * lv); }

/* ================= 主线任务（按地图自动生成） ================= */
const QUESTS = [];
MAPS.forEach(m => {
  if (!m.mons) return;
  const [a, , c] = m.mons, tier = m.id - 1;
  const mk = (name, target, n, k, items) => {
    const lv = MONS[target].lv;
    QUESTS.push({ map: m.id, name, target, n, exp: Math.round(expNeed(lv) * k), gold: Math.round((40 + lv * 30) * k * 1.5), items, story: m.story });
  };
  mk(`初探${m.name}`, a, 8, 0.6, [{ id: m.id < 4 ? 'hp1' : m.id < 7 ? 'hp2' : 'hp3', n: 8 }, { id: m.id < 4 ? 'mp1' : m.id < 7 ? 'mp2' : 'mp3', n: 5 }]);
  mk(`${m.name}的威胁`, c, 10, 0.8, [{ eq: [pick(['helmet', 'armor', 'boots']), tier, 2] }, { id: 'stone', n: 2 }]);
  const boss = [{ eq: ['weapon', tier + 1, 3] }, { eq: [pick(['ring', 'necklace']), tier + 1, 2] }, { id: 'stone', n: 4 }];
  if (m.id === 1) boss.push({ id: 'egg_slime', n: 1 });
  mk(`讨伐·${MONS[m.boss].name}`, m.boss, 1, 1.6, boss);
});

/* ================= NPC ================= */
const NPCS = [
  { id: 'chief', name: '村长爷爷', icon: '📜', tx: 13, ty: 10, hair: '#e8e8e8', cloth: '#b06a3a', hat: 'none' },
  { id: 'tele', name: '传送员·闪闪', icon: '🌀', tx: 17, ty: 10, hair: '#5ac8e8', cloth: '#3a6ad0', hat: 'wizard' },
  { id: 'shop', name: '杂货商·糖糖', icon: '🧪', tx: 7, ty: 9, hair: '#ff9ac0', cloth: '#ff7a9a', hat: 'none' },
  { id: 'smith', name: '铁匠·大锤', icon: '⚒️', tx: 22, ty: 9, hair: '#6a4a3a', cloth: '#7a7a8a', hat: 'band' },
  { id: 'pet', name: '宠物师·喵喵', icon: '🐾', tx: 7, ty: 18, hair: '#ffb84a', cloth: '#6ac87a', hat: 'cap' },
  { id: 'guild', name: '公会·阿布', icon: '📋', tx: 22, ty: 18, hair: '#3a3a4a', cloth: '#c84a4a', hat: 'none' },
  { id: 'heal', name: '治疗师·暖暖', icon: '💗', tx: 12, ty: 14, hair: '#fff0a0', cloth: '#ffffff', hat: 'none' },
];
