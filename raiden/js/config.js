'use strict';
var STR = window.GAME_STR || { zh: {}, en: {} };
var T = (k, ...a) => AMG.tf(STR, k, ...a);
const stageName = i => (T('stageNames') || [])[i] || ('STAGE ' + (i + 1));
const stageDesc = i => (T('stageDescs') || [])[i] || '';
const bossName = i => (T('bossNames') || [])[i] || ('BOSS ' + (i + 1));
const CFG = {
  W: 960, H: 720,
  STORE_HI: 'raiden_tribute_hi',
  MAX_WPN_LV: 8,
  STAGES: [
    { sky: ['#0a2a5e', '#0d4d2b'], ground: '#123f22', en: 'STAGE 1 · FARMLAND DAWN', bossEn: 'TWIN CANNON FORT' },
    { sky: ['#2b0f3a', '#5e1a1a'], ground: '#3a2330', en: 'STAGE 2 · RUINED CITY', bossEn: 'HEAVY BOMBER' },
    { sky: ['#062a4a', '#0a5e7a'], ground: '#0a3a5e', en: 'STAGE 3 · SEA FLEET', bossEn: 'ABYSS CARRIER' },
    { sky: ['#4a3206', '#7a5a0a'], ground: '#5e4a1a', en: 'STAGE 4 · DESERT BASE', bossEn: 'DESERT LEVIATHAN' },
    { sky: ['#3a0a0a', '#7a1a00'], ground: '#4a1408', en: 'STAGE 5 · VOLCANO FACTORY', bossEn: 'FURNACE GOLEM' },
    { sky: ['#0a1a4a', '#3a5e9e'], ground: '#22345c', en: 'STAGE 6 · SKY FORTRESS', bossEn: 'SKY BASTION' },
    { sky: ['#050514', '#1a1a4a'], ground: '#14142e', en: 'STAGE 7 · ORBITAL DOCK', bossEn: 'ORBITAL COLOSSUS' },
    { sky: ['#14041a', '#3a0a2e'], ground: '#2e0a24', en: 'STAGE 8 · ALIEN MOTHERSHIP', bossEn: 'MOTHERSHIP CORE' },
  ],
  SCORES: { scout: 100, weaver: 150, chopper: 200, tank: 250, turret: 300, gunboat: 500, splitter: 400, kami: 350, carrier: 1000, bossBonus: [50000, 80000, 120000, 160000, 200000, 260000, 320000, 500000] },
};
