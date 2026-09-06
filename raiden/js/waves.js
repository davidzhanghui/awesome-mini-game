'use strict';
var STR = window.GAME_STR || { zh: {}, en: {} };
var T = (k, ...a) => AMG.tf(STR, k, ...a);
// Fixed wave scripts: each stage spawns fixed formations on a timeline, learnable/memorizable.
// Density: roughly one wave every 2-4s, 4-8 ships each, from t=2 to t=86, Boss around 90s.
// wave = { t:sec, say:announce key (only key waves, avoid spam), f:formation, type:foe, n:count, side:left/right }
// f: vee(top V) row(top row) side(flank) pair(duo) tanks(armor row)
//    gun(gunboat+escort) kami(kamikaze pack) carrier(carrier+escort) split(splitters) turret(turrets+cover) bonus(fixed supply drop)
const STAGE_WAVES = [
  [ // S1: scouts + weavers + choppers, tutorial stage but kept busy
    { t: 2, say: 'scoutsApproach', f: 'vee', type: 'scout', n: 5 },
    { t: 5, f: 'row', type: 'weaver', n: 4 },
    { t: 8, f: 'bonus', kinds: ['P'] },
    { t: 9, say: 'leftRaid', f: 'side', type: 'scout', n: 5, side: 'L' },
    { t: 12, f: 'pair', type: 'chopper', n: 3 },
    { t: 15, say: 'scoutsApproach', f: 'vee', type: 'scout', n: 6 },
    { t: 18, f: 'row', type: 'weaver', n: 5 },
    { t: 21, say: 'rightRaid', f: 'side', type: 'scout', n: 5, side: 'R' },
    { t: 24, f: 'vee', type: 'scout', n: 6 },
    { t: 27, say: 'gunship', f: 'pair', type: 'chopper', n: 3 },
    { t: 30, f: 'row', type: 'weaver', n: 5 },
    { t: 33, f: 'side', type: 'weaver', n: 4, side: 'L' },
    { t: 36, say: 'scoutsReturn', f: 'vee', type: 'scout', n: 7 },
    { t: 39, f: 'pair', type: 'chopper', n: 3 },
    { t: 42, say: 'snakeRing', f: 'row', type: 'weaver', n: 6 },
    { t: 45, f: 'side', type: 'scout', n: 6, side: 'R' },
    { t: 48, f: 'bonus', kinds: ['M'] },
    { t: 49, f: 'vee', type: 'scout', n: 6 },
    { t: 52, f: 'row', type: 'weaver', n: 5 },
    { t: 55, say: 'lowHunter', f: 'side', type: 'chopper', n: 4, side: 'L' },
    { t: 58, f: 'vee', type: 'scout', n: 7 },
    { t: 61, f: 'row', type: 'weaver', n: 6 },
    { t: 64, say: 'gunship', f: 'pair', type: 'chopper', n: 4 },
    { t: 67, f: 'side', type: 'scout', n: 6, side: 'R' },
    { t: 70, say: 'scoutsAllOut', f: 'vee', type: 'scout', n: 7 },
    { t: 73, f: 'row', type: 'weaver', n: 6 },
    { t: 76, f: 'side', type: 'weaver', n: 5, side: 'L' },
    { t: 78, f: 'bonus', kinds: ['B'] },
    { t: 79, f: 'pair', type: 'chopper', n: 3 },
    { t: 82, say: 'finalScouts', f: 'vee', type: 'scout', n: 8 },
    { t: 85, f: 'row', type: 'weaver', n: 6 },
  ],
  [ // S2: choppers + tank push
    { t: 2, say: 'ruinsRecon', f: 'row', type: 'scout', n: 5 },
    { t: 5, f: 'pair', type: 'chopper', n: 3 },
    { t: 8, f: 'vee', type: 'scout', n: 5 },
    { t: 11, say: 'groundArmor', f: 'tanks', type: 'tank', n: 3 },
    { t: 14, f: 'row', type: 'weaver', n: 5 },
    { t: 17, say: 'wreckAmbush', f: 'side', type: 'weaver', n: 4, side: 'L' },
    { t: 20, f: 'pair', type: 'chopper', n: 3 },
    { t: 23, f: 'vee', type: 'scout', n: 6 },
    { t: 26, f: 'bonus', kinds: ['P'] },
    { t: 27, say: 'armorPush', f: 'tanks', type: 'tank', n: 4 },
    { t: 30, f: 'side', type: 'chopper', n: 3, side: 'R' },
    { t: 33, f: 'row', type: 'weaver', n: 5 },
    { t: 36, say: 'airSuppress', f: 'pair', type: 'chopper', n: 3 },
    { t: 39, f: 'vee', type: 'scout', n: 6 },
    { t: 42, say: 'heavyArmor', f: 'tanks', type: 'tank', n: 4 },
    { t: 45, f: 'side', type: 'weaver', n: 5, side: 'L' },
    { t: 48, f: 'row', type: 'scout', n: 6 },
    { t: 51, say: 'rightHunter', f: 'side', type: 'chopper', n: 4, side: 'R' },
    { t: 54, f: 'tanks', type: 'tank', n: 4 },
    { t: 57, say: 'snakeRing', f: 'row', type: 'weaver', n: 6 },
    { t: 60, f: 'pair', type: 'chopper', n: 3 },
    { t: 62, f: 'bonus', kinds: ['O'] },
    { t: 63, say: 'scoutsAllOut', f: 'vee', type: 'scout', n: 7 },
    { t: 66, f: 'tanks', type: 'tank', n: 4 },
    { t: 69, say: 'airBlock', f: 'pair', type: 'chopper', n: 4 },
    { t: 72, f: 'row', type: 'weaver', n: 6 },
    { t: 75, f: 'side', type: 'scout', n: 6, side: 'L' },
    { t: 78, say: 'finalWave', f: 'vee', type: 'scout', n: 7 },
    { t: 80, f: 'bonus', kinds: ['B'] },
    { t: 81, f: 'tanks', type: 'tank', n: 4 },
    { t: 84, f: 'pair', type: 'chopper', n: 4 },
    { t: 86, f: 'row', type: 'weaver', n: 6 },
  ],
  [ // S3: gunboats lead, mixed fodder
    { t: 2, say: 'fleetOutpost', f: 'gun', n: 1 },
    { t: 6, f: 'row', type: 'scout', n: 5 },
    { t: 9, f: 'pair', type: 'chopper', n: 3 },
    { t: 12, say: 'twinBoats', f: 'gun', n: 2 },
    { t: 16, f: 'row', type: 'weaver', n: 5 },
    { t: 19, f: 'side', type: 'scout', n: 5, side: 'L' },
    { t: 22, say: 'boatPatrol', f: 'gun', n: 2 },
    { t: 26, f: 'vee', type: 'scout', n: 6 },
    { t: 28, f: 'bonus', kinds: ['P'] },
    { t: 29, say: 'fogRaid', f: 'side', type: 'weaver', n: 5, side: 'R' },
    { t: 32, f: 'pair', type: 'chopper', n: 3 },
    { t: 35, say: 'fleetMain', f: 'gun', n: 2 },
    { t: 39, f: 'row', type: 'scout', n: 6 },
    { t: 42, f: 'side', type: 'chopper', n: 3, side: 'L' },
    { t: 45, say: 'snakeRing', f: 'row', type: 'weaver', n: 6 },
    { t: 48, f: 'vee', type: 'scout', n: 6 },
    { t: 51, say: 'boatPatrol', f: 'gun', n: 2 },
    { t: 55, f: 'side', type: 'weaver', n: 5, side: 'R' },
    { t: 58, f: 'pair', type: 'chopper', n: 3 },
    { t: 61, say: 'torpedo', f: 'side', type: 'scout', n: 6, side: 'L' },
    { t: 64, f: 'bonus', kinds: ['M'] },
    { t: 65, say: 'eliteFleet', f: 'gun', n: 2 },
    { t: 69, f: 'row', type: 'weaver', n: 6 },
    { t: 72, f: 'vee', type: 'scout', n: 7 },
    { t: 75, say: 'lowHunter', f: 'pair', type: 'chopper', n: 4 },
    { t: 78, f: 'gun', n: 2 },
    { t: 81, f: 'side', type: 'scout', n: 6, side: 'R' },
    { t: 82, f: 'bonus', kinds: ['S'] },
    { t: 84, say: 'fleetAllOut', f: 'row', type: 'weaver', n: 6 },
    { t: 86, f: 'gun', n: 2 },
  ],
  [ // S4: tanks + turret crossfire
    { t: 2, say: 'armorTrain', f: 'tanks', type: 'tank', n: 3 },
    { t: 5, f: 'vee', type: 'scout', n: 5 },
    { t: 8, say: 'turretPos', f: 'turret' },
    { t: 12, f: 'pair', type: 'chopper', n: 3 },
    { t: 15, say: 'dustRecon', f: 'vee', type: 'scout', n: 6 },
    { t: 18, f: 'row', type: 'weaver', n: 5 },
    { t: 21, f: 'side', type: 'scout', n: 5, side: 'R' },
    { t: 24, say: 'armorPush', f: 'tanks', type: 'tank', n: 4 },
    { t: 28, f: 'bonus', kinds: ['P'] },
    { t: 29, say: 'crossFire', f: 'turret' },
    { t: 32, f: 'vee', type: 'scout', n: 6 },
    { t: 35, say: 'desertAmbush', f: 'side', type: 'weaver', n: 5, side: 'L' },
    { t: 38, f: 'pair', type: 'chopper', n: 3 },
    { t: 41, say: 'sandstorm', f: 'vee', type: 'scout', n: 7 },
    { t: 44, f: 'tanks', type: 'tank', n: 4 },
    { t: 47, f: 'row', type: 'weaver', n: 5 },
    { t: 50, say: 'airSuppress', f: 'pair', type: 'chopper', n: 4 },
    { t: 53, say: 'baseGuard', f: 'turret' },
    { t: 56, say: 'heavyArmor', f: 'tanks', type: 'tank', n: 4 },
    { t: 59, f: 'side', type: 'scout', n: 6, side: 'L' },
    { t: 62, f: 'row', type: 'weaver', n: 6 },
    { t: 65, say: 'armorEncircle', f: 'tanks', type: 'tank', n: 4 },
    { t: 66, f: 'bonus', kinds: ['O'] },
    { t: 68, f: 'vee', type: 'scout', n: 6 },
    { t: 71, say: 'spinRaid', f: 'side', type: 'scout', n: 6, side: 'R' },
    { t: 74, f: 'turret' },
    { t: 77, say: 'sandAllOut', f: 'row', type: 'weaver', n: 6 },
    { t: 80, f: 'bonus', kinds: ['B'] },
    { t: 81, f: 'tanks', type: 'tank', n: 4 },
    { t: 84, f: 'pair', type: 'chopper', n: 4 },
    { t: 86, f: 'vee', type: 'scout', n: 7 },
  ],
  [ // S5: kamikazes + turrets
    { t: 2, say: 'lavaSentry', f: 'row', type: 'weaver', n: 5 },
    { t: 5, f: 'vee', type: 'scout', n: 5 },
    { t: 8, say: 'kamiWave', f: 'kami', type: 'kami', n: 4 },
    { t: 11, f: 'pair', type: 'chopper', n: 3 },
    { t: 14, say: 'furnaceTurret', f: 'turret' },
    { t: 17, f: 'row', type: 'weaver', n: 5 },
    { t: 20, f: 'side', type: 'scout', n: 5, side: 'L' },
    { t: 23, say: 'flameCharge', f: 'kami', type: 'kami', n: 5 },
    { t: 26, f: 'vee', type: 'scout', n: 6 },
    { t: 28, f: 'bonus', kinds: ['P'] },
    { t: 29, f: 'pair', type: 'chopper', n: 3 },
    { t: 32, say: 'furnaceGuns', f: 'turret' },
    { t: 35, f: 'row', type: 'weaver', n: 6 },
    { t: 38, say: 'rightHunter', f: 'side', type: 'chopper', n: 4, side: 'R' },
    { t: 41, f: 'vee', type: 'scout', n: 6 },
    { t: 44, say: 'finalCharge', f: 'kami', type: 'kami', n: 6 },
    { t: 47, f: 'row', type: 'weaver', n: 5 },
    { t: 50, f: 'turret' },
    { t: 53, say: 'lavaEncircle', f: 'side', type: 'weaver', n: 5, side: 'L' },
    { t: 56, f: 'pair', type: 'chopper', n: 4 },
    { t: 59, say: 'flameCharge', f: 'kami', type: 'kami', n: 5 },
    { t: 62, f: 'row', type: 'weaver', n: 6 },
    { t: 64, f: 'bonus', kinds: ['M'] },
    { t: 65, f: 'turret' },
    { t: 68, say: 'airSuppress', f: 'pair', type: 'chopper', n: 4 },
    { t: 71, f: 'vee', type: 'scout', n: 6 },
    { t: 74, say: 'suicideAllOut', f: 'kami', type: 'kami', n: 6 },
    { t: 77, f: 'row', type: 'weaver', n: 6 },
    { t: 80, f: 'bonus', kinds: ['S'] },
    { t: 81, f: 'side', type: 'chopper', n: 4, side: 'L' },
    { t: 84, f: 'kami', type: 'kami', n: 5 },
    { t: 86, f: 'row', type: 'weaver', n: 6 },
  ],
  [ // S6: splitters + gunboats
    { t: 2, say: 'splitterVanguard', f: 'split', type: 'splitter', n: 4 },
    { t: 5, f: 'row', type: 'scout', n: 5 },
    { t: 8, say: 'floatBoat', f: 'gun', n: 2 },
    { t: 12, f: 'pair', type: 'chopper', n: 3 },
    { t: 15, say: 'cellGrowth', f: 'split', type: 'splitter', n: 5 },
    { t: 18, f: 'row', type: 'weaver', n: 5 },
    { t: 21, f: 'side', type: 'scout', n: 5, side: 'R' },
    { t: 24, say: 'cloudBattery', f: 'turret' },
    { t: 27, f: 'vee', type: 'scout', n: 6 },
    { t: 28, f: 'bonus', kinds: ['P'] },
    { t: 30, say: 'surround3d', f: 'side', type: 'splitter', n: 5, side: 'R' },
    { t: 33, f: 'gun', n: 2 },
    { t: 36, f: 'row', type: 'weaver', n: 6 },
    { t: 39, say: 'boatPatrol', f: 'gun', n: 2 },
    { t: 42, f: 'vee', type: 'scout', n: 6 },
    { t: 45, say: 'stormEye', f: 'row', type: 'weaver', n: 6 },
    { t: 48, f: 'pair', type: 'chopper', n: 4 },
    { t: 51, say: 'growthPeak', f: 'split', type: 'splitter', n: 6 },
    { t: 54, f: 'side', type: 'weaver', n: 5, side: 'L' },
    { t: 57, f: 'gun', n: 2 },
    { t: 60, say: 'fortressGuns', f: 'turret' },
    { t: 63, f: 'row', type: 'scout', n: 6 },
    { t: 64, f: 'bonus', kinds: ['O'] },
    { t: 66, say: 'splitFrenzy', f: 'split', type: 'splitter', n: 6 },
    { t: 69, f: 'vee', type: 'scout', n: 6 },
    { t: 72, say: 'eliteFortressGun', f: 'gun', n: 2 },
    { t: 75, f: 'row', type: 'weaver', n: 6 },
    { t: 78, f: 'side', type: 'splitter', n: 5, side: 'L' },
    { t: 80, f: 'bonus', kinds: ['B'] },
    { t: 81, f: 'pair', type: 'chopper', n: 4 },
    { t: 84, f: 'split', type: 'splitter', n: 6 },
    { t: 86, f: 'row', type: 'scout', n: 7 },
  ],
  [ // S7: carriers join
    { t: 2, say: 'orbitSentry', f: 'carrier', n: 1 },
    { t: 5, f: 'row', type: 'weaver', n: 5 },
    { t: 8, say: 'splitterVanguard', f: 'split', type: 'splitter', n: 5 },
    { t: 11, f: 'vee', type: 'scout', n: 6 },
    { t: 14, say: 'dockGuns', f: 'turret' },
    { t: 17, f: 'pair', type: 'chopper', n: 3 },
    { t: 20, say: 'carrierIncoming', f: 'carrier', n: 1 },
    { t: 24, f: 'row', type: 'weaver', n: 6 },
    { t: 27, say: 'carrierLaunch', f: 'kami', type: 'kami', n: 5 },
    { t: 28, f: 'bonus', kinds: ['P'] },
    { t: 30, f: 'side', type: 'scout', n: 6, side: 'L' },
    { t: 33, say: 'cellGrowth', f: 'split', type: 'splitter', n: 6 },
    { t: 36, f: 'turret' },
    { t: 39, say: 'dockAmbush', f: 'side', type: 'weaver', n: 6, side: 'L' },
    { t: 42, f: 'pair', type: 'chopper', n: 4 },
    { t: 45, say: 'orbitPatrol', f: 'carrier', n: 1 },
    { t: 49, f: 'row', type: 'scout', n: 6 },
    { t: 52, say: 'defense3d', f: 'turret' },
    { t: 55, f: 'pair', type: 'chopper', n: 3 },
    { t: 58, say: 'abyssPair', f: 'carrier', n: 2 },
    { t: 62, f: 'row', type: 'weaver', n: 6 },
    { t: 65, say: 'carrierAllOut', f: 'kami', type: 'kami', n: 6 },
    { t: 68, f: 'side', type: 'splitter', n: 5, side: 'R' },
    { t: 71, say: 'splitFrenzy', f: 'row', type: 'splitter', n: 6 },
    { t: 74, f: 'vee', type: 'scout', n: 6 },
    { t: 77, f: 'turret' },
    { t: 78, f: 'bonus', kinds: ['O'] },
    { t: 80, say: 'carrierEscort', f: 'carrier', n: 1 },
    { t: 81, f: 'bonus', kinds: ['B'] },
    { t: 83, f: 'row', type: 'weaver', n: 6 },
    { t: 86, f: 'side', type: 'kami', n: 6, side: 'R' },
  ],
  [ // S8: elite everything, full pressure
    { t: 2, say: 'alienVanguard', f: 'split', type: 'splitter', n: 6 },
    { t: 5, say: 'kamiWave', f: 'kami', type: 'kami', n: 5 },
    { t: 8, f: 'row', type: 'weaver', n: 6 },
    { t: 11, say: 'abyssCarrier', f: 'carrier', n: 1 },
    { t: 14, f: 'vee', type: 'scout', n: 6 },
    { t: 17, say: 'eliteBoats', f: 'gun', n: 2 },
    { t: 20, f: 'side', type: 'splitter', n: 5, side: 'L' },
    { t: 23, say: 'coreGuns', f: 'turret' },
    { t: 26, f: 'row', type: 'weaver', n: 6 },
    { t: 29, say: 'devourWave', f: 'split', type: 'splitter', n: 6 },
    { t: 30, f: 'bonus', kinds: ['P'] },
    { t: 32, say: 'finalCharge', f: 'kami', type: 'kami', n: 6 },
    { t: 35, f: 'gun', n: 2 },
    { t: 38, say: 'carrierIncoming', f: 'carrier', n: 1 },
    { t: 41, f: 'row', type: 'weaver', n: 6 },
    { t: 44, say: 'swarmEscort', f: 'side', type: 'weaver', n: 6, side: 'R' },
    { t: 47, f: 'split', type: 'splitter', n: 6 },
    { t: 50, say: 'killBox3d', f: 'gun', n: 2 },
    { t: 53, f: 'turret' },
    { t: 56, say: 'fullCharge', f: 'kami', type: 'kami', n: 7 },
    { t: 59, f: 'row', type: 'scout', n: 7 },
    { t: 60, f: 'bonus', kinds: ['M'] },
    { t: 62, say: 'twinMothers', f: 'carrier', n: 2 },
    { t: 66, f: 'split', type: 'splitter', n: 6 },
    { t: 69, say: 'swarmAllOut', f: 'row', type: 'weaver', n: 7 },
    { t: 72, f: 'gun', n: 2 },
    { t: 75, say: 'coreGuns', f: 'turret' },
    { t: 77, f: 'side', type: 'kami', n: 6, side: 'L' },
    { t: 79, say: 'lastLine', f: 'split', type: 'splitter', n: 7 },
    { t: 81, f: 'bonus', kinds: ['B', 'O'] },
    { t: 82, f: 'row', type: 'scout', n: 7 },
    { t: 84, say: 'motherGuard', f: 'carrier', n: 1 },
    { t: 86, f: 'kami', type: 'kami', n: 6 },
  ],
];

// Random trickle pool: fills gaps between waves so the screen stays busy; heavies stay scripted only
const STAGE_TRICKLE = [
  ['scout', 'scout', 'weaver'],
  ['scout', 'weaver', 'chopper'],
  ['scout', 'chopper', 'weaver', 'weaver'],
  ['scout', 'weaver', 'chopper', 'tank'],
  ['scout', 'weaver', 'kami', 'chopper'],
  ['scout', 'splitter', 'weaver', 'scout'],
  ['scout', 'weaver', 'splitter', 'chopper'],
  ['scout', 'weaver', 'kami', 'splitter'],
];

const WaveKit = {
  spawn(game, w) {
    const CX = CFG.W / 2;
    const put = (type, x, y) => game.enemies.push(new Enemy(type, x, y, game.stageIdx, game.diff));
    switch (w.f) {
      case 'vee': {
        const cx = CX + rand(-80, 80);
        for (let i = 0; i < w.n; i++) put(w.type, cx + (i - (w.n - 1) / 2) * 64, -30 - Math.abs(i - (w.n - 1) / 2) * 36);
        break;
      }
      case 'row': {
        const n = w.n;
        for (let i = 0; i < n; i++) put(w.type, n === 1 ? CX : 110 + i * ((CFG.W - 220) / (n - 1)), -30 - (i % 2) * 46);
        break;
      }
      case 'side': {
        const left = (w.side || 'L') === 'L';
        for (let i = 0; i < w.n; i++) put(w.type, left ? -20 : CFG.W + 20, 90 + i * 56 + rand(-10, 10));
        break;
      }
      case 'pair': {
        const n = w.n || 2;
        for (let i = 0; i < n; i++) put(w.type, CX + (i - (n - 1) / 2) * 150, -30 - (i % 2) * 60);
        break;
      }
      case 'tanks': {
        for (let i = 0; i < w.n; i++) put(w.type, CX + (i - (w.n - 1) / 2) * 130, -30 - (i % 2) * 30);
        break;
      }
      case 'gun': {
        const n = w.n || 2;
        for (let i = 0; i < n; i++) put('gunboat', CX + (i - (n - 1) / 2) * 240, -30 - i * 60);
        put('scout', CX - 200, -90); put('scout', CX + 200, -90);
        break;
      }
      case 'kami': {
        for (let i = 0; i < w.n; i++) put(w.type, i % 2 ? 130 : CFG.W - 130, -30 - i * 52);
        break;
      }
      case 'carrier': {
        const n = w.n || 1;
        for (let i = 0; i < n; i++) put('carrier', CX + (i - (n - 1) / 2) * 300, -40 - i * 40);
        put('weaver', CX - 200, -60); put('weaver', CX + 200, -60);
        break;
      }
      case 'split': {
        for (let i = 0; i < w.n; i++) put(w.type, CX + (i - (w.n - 1) / 2) * 110, -30 - (i % 2) * 40);
        break;
      }
      case 'turret': {
        put('turret', 210, -20); put('turret', CFG.W - 210, -20);
        put('scout', CX - 70, -40); put('scout', CX, -80); put('scout', CX + 70, -40);
        break;
      }
      case 'bonus': {
        for (let i = 0; i < w.kinds.length; i++)
          game.pickups.push(new Pickup(w.kinds[i], CX + (i - (w.kinds.length - 1) / 2) * 120, -20));
        break;
      }
    }
  }
};
