'use strict';
const CFG = {
  W: 960, H: 720,
  STORE_HI: 'raiden_tribute_hi',
  MAX_WPN_LV: 8,
  STAGES: [
    { name: '田园黎明', en: 'STAGE 1 · FARMLAND DAWN', desc: '入侵从绿色平原开始 —— 切开敌方侦察机群！', sky: ['#0a2a5e', '#0d4d2b'], ground: '#123f22', boss: '双联装要塞炮', bossEn: 'TWIN CANNON FORT' },
    { name: '废墟都市', en: 'STAGE 2 · RUINED CITY', desc: '燃烧的城市上空，直升机与坦克群围剿。', sky: ['#2b0f3a', '#5e1a1a'], ground: '#3a2330', boss: '重型轰炸机', bossEn: 'HEAVY BOMBER' },
    { name: '海上舰队', en: 'STAGE 3 · SEA FLEET', desc: '低空掠海，击沉敌方航母战斗群。', sky: ['#062a4a', '#0a5e7a'], ground: '#0a3a5e', boss: '深海航母', bossEn: 'ABYSS CARRIER' },
    { name: '沙漠基地', en: 'STAGE 4 · DESERT BASE', desc: '沙尘之下，装甲列车与炮塔林立。', sky: ['#4a3206', '#7a5a0a'], ground: '#5e4a1a', boss: '沙漠利维坦', bossEn: 'DESERT LEVIATHAN' },
    { name: '火山工厂', en: 'STAGE 5 · VOLCANO FACTORY', desc: '岩浆工厂全速运转，自杀机蜂拥而至。', sky: ['#3a0a0a', '#7a1a00'], ground: '#4a1408', boss: '熔炉魔像', bossEn: 'FURNACE GOLEM' },
    { name: '云端要塞', en: 'STAGE 6 · SKY FORTRESS', desc: '万米高空，浮空要塞与分裂体包围网。', sky: ['#0a1a4a', '#3a5e9e'], ground: '#22345c', boss: '苍穹堡垒', bossEn: 'SKY BASTION' },
    { name: '轨道船坞', en: 'STAGE 7 · ORBITAL DOCK', desc: '突破大气层，在轨道船坞迎战巨像。', sky: ['#050514', '#1a1a4a'], ground: '#14142e', boss: '轨道巨像', bossEn: 'ORBITAL COLOSSUS' },
    { name: '异星母舰', en: 'STAGE 8 · ALIEN MOTHERSHIP', desc: '突入母舰核心 —— 为了地球，全弹发射！', sky: ['#14041a', '#3a0a2e'], ground: '#2e0a24', boss: '异星母舰核心', bossEn: 'MOTHERSHIP CORE' },
  ],
  SCORES: { scout: 100, weaver: 150, chopper: 200, tank: 250, turret: 300, gunboat: 500, splitter: 400, kami: 350, carrier: 1000, bossBonus: [50000, 80000, 120000, 160000, 200000, 260000, 320000, 500000] },
};
