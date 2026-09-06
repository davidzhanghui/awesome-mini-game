'use strict';
// 固定波次脚本:每关按时间轴刷出固定编队,保证套路可学习、可背板。
// 密度标准:约每 2~4 秒一波,每波 4~8 架,从 t=2 铺到 t=86,Boss 约 90 秒出场。
// wave = { t:秒, say:预告文案(只给关键波,避免刷屏), f:编队, type:敌机, n:数量, side:左右 }
// f: vee(顶部V字) row(顶部横排) side(侧翼切入) pair(双机) tanks(装甲横列)
//    gun(炮艇+护航) kami(自杀机群) carrier(航母+护航) split(分裂体) turret(炮塔+掩护) bonus(固定补给掉落)
const STAGE_WAVES = [
  [ // S1 田园黎明:侦察+蛇形+直升机,教学关但保证手感忙碌
    { t: 2, say: '侦察机群接近', f: 'vee', type: 'scout', n: 5 },
    { t: 5, f: 'row', type: 'weaver', n: 4 },
    { t: 8, f: 'bonus', kinds: ['P'] },
    { t: 9, say: '左翼突袭', f: 'side', type: 'scout', n: 5, side: 'L' },
    { t: 12, f: 'pair', type: 'chopper', n: 3 },
    { t: 15, say: '侦察机群接近', f: 'vee', type: 'scout', n: 6 },
    { t: 18, f: 'row', type: 'weaver', n: 5 },
    { t: 21, say: '右翼突袭', f: 'side', type: 'scout', n: 5, side: 'R' },
    { t: 24, f: 'vee', type: 'scout', n: 6 },
    { t: 27, say: '武装直升机', f: 'pair', type: 'chopper', n: 3 },
    { t: 30, f: 'row', type: 'weaver', n: 5 },
    { t: 33, f: 'side', type: 'weaver', n: 4, side: 'L' },
    { t: 36, say: '侦察机回马枪', f: 'vee', type: 'scout', n: 7 },
    { t: 39, f: 'pair', type: 'chopper', n: 3 },
    { t: 42, say: '蛇形包围', f: 'row', type: 'weaver', n: 6 },
    { t: 45, f: 'side', type: 'scout', n: 6, side: 'R' },
    { t: 48, f: 'bonus', kinds: ['M'] },
    { t: 49, f: 'vee', type: 'scout', n: 6 },
    { t: 52, f: 'row', type: 'weaver', n: 5 },
    { t: 55, say: '低空猎手', f: 'side', type: 'chopper', n: 4, side: 'L' },
    { t: 58, f: 'vee', type: 'scout', n: 7 },
    { t: 61, f: 'row', type: 'weaver', n: 6 },
    { t: 64, say: '武装直升机', f: 'pair', type: 'chopper', n: 4 },
    { t: 67, f: 'side', type: 'scout', n: 6, side: 'R' },
    { t: 70, say: '侦察总攻', f: 'vee', type: 'scout', n: 7 },
    { t: 73, f: 'row', type: 'weaver', n: 6 },
    { t: 76, f: 'side', type: 'weaver', n: 5, side: 'L' },
    { t: 78, f: 'bonus', kinds: ['B'] },
    { t: 79, f: 'pair', type: 'chopper', n: 3 },
    { t: 82, say: '最终侦察波', f: 'vee', type: 'scout', n: 8 },
    { t: 85, f: 'row', type: 'weaver', n: 6 },
  ],
  [ // S2 废墟都市:直升机+坦克推进
    { t: 2, say: '废墟侦察队', f: 'row', type: 'scout', n: 5 },
    { t: 5, f: 'pair', type: 'chopper', n: 3 },
    { t: 8, f: 'vee', type: 'scout', n: 5 },
    { t: 11, say: '地面装甲', f: 'tanks', type: 'tank', n: 3 },
    { t: 14, f: 'row', type: 'weaver', n: 5 },
    { t: 17, say: '残骸伏击', f: 'side', type: 'weaver', n: 4, side: 'L' },
    { t: 20, f: 'pair', type: 'chopper', n: 3 },
    { t: 23, f: 'vee', type: 'scout', n: 6 },
    { t: 26, f: 'bonus', kinds: ['P'] },
    { t: 27, say: '装甲推进', f: 'tanks', type: 'tank', n: 4 },
    { t: 30, f: 'side', type: 'chopper', n: 3, side: 'R' },
    { t: 33, f: 'row', type: 'weaver', n: 5 },
    { t: 36, say: '空中压制', f: 'pair', type: 'chopper', n: 3 },
    { t: 39, f: 'vee', type: 'scout', n: 6 },
    { t: 42, say: '重装甲阵', f: 'tanks', type: 'tank', n: 4 },
    { t: 45, f: 'side', type: 'weaver', n: 5, side: 'L' },
    { t: 48, f: 'row', type: 'scout', n: 6 },
    { t: 51, say: '右翼猎手', f: 'side', type: 'chopper', n: 4, side: 'R' },
    { t: 54, f: 'tanks', type: 'tank', n: 4 },
    { t: 57, say: '蛇形包围', f: 'row', type: 'weaver', n: 6 },
    { t: 60, f: 'pair', type: 'chopper', n: 3 },
    { t: 62, f: 'bonus', kinds: ['O'] },
    { t: 63, say: '侦察总攻', f: 'vee', type: 'scout', n: 7 },
    { t: 66, f: 'tanks', type: 'tank', n: 4 },
    { t: 69, say: '空中封锁', f: 'pair', type: 'chopper', n: 4 },
    { t: 72, f: 'row', type: 'weaver', n: 6 },
    { t: 75, f: 'side', type: 'scout', n: 6, side: 'L' },
    { t: 78, say: '最终波', f: 'vee', type: 'scout', n: 7 },
    { t: 80, f: 'bonus', kinds: ['B'] },
    { t: 81, f: 'tanks', type: 'tank', n: 4 },
    { t: 84, f: 'pair', type: 'chopper', n: 4 },
    { t: 86, f: 'row', type: 'weaver', n: 6 },
  ],
  [ // S3 海上舰队:炮艇为主,杂兵不断
    { t: 2, say: '舰队前哨', f: 'gun', n: 1 },
    { t: 6, f: 'row', type: 'scout', n: 5 },
    { t: 9, f: 'pair', type: 'chopper', n: 3 },
    { t: 12, say: '双炮艇', f: 'gun', n: 2 },
    { t: 16, f: 'row', type: 'weaver', n: 5 },
    { t: 19, f: 'side', type: 'scout', n: 5, side: 'L' },
    { t: 22, say: '炮艇巡航', f: 'gun', n: 2 },
    { t: 26, f: 'vee', type: 'scout', n: 6 },
    { t: 28, f: 'bonus', kinds: ['P'] },
    { t: 29, say: '海雾突袭', f: 'side', type: 'weaver', n: 5, side: 'R' },
    { t: 32, f: 'pair', type: 'chopper', n: 3 },
    { t: 35, say: '舰队主力', f: 'gun', n: 2 },
    { t: 39, f: 'row', type: 'scout', n: 6 },
    { t: 42, f: 'side', type: 'chopper', n: 3, side: 'L' },
    { t: 45, say: '蛇形包围', f: 'row', type: 'weaver', n: 6 },
    { t: 48, f: 'vee', type: 'scout', n: 6 },
    { t: 51, say: '炮艇巡航', f: 'gun', n: 2 },
    { t: 55, f: 'side', type: 'weaver', n: 5, side: 'R' },
    { t: 58, f: 'pair', type: 'chopper', n: 3 },
    { t: 61, say: '鱼雷机群', f: 'side', type: 'scout', n: 6, side: 'L' },
    { t: 64, f: 'bonus', kinds: ['M'] },
    { t: 65, say: '精锐舰队', f: 'gun', n: 2 },
    { t: 69, f: 'row', type: 'weaver', n: 6 },
    { t: 72, f: 'vee', type: 'scout', n: 7 },
    { t: 75, say: '低空猎手', f: 'pair', type: 'chopper', n: 4 },
    { t: 78, f: 'gun', n: 2 },
    { t: 81, f: 'side', type: 'scout', n: 6, side: 'R' },
    { t: 82, f: 'bonus', kinds: ['S'] },
    { t: 84, say: '舰队总攻', f: 'row', type: 'weaver', n: 6 },
    { t: 86, f: 'gun', n: 2 },
  ],
  [ // S4 沙漠基地:坦克+炮塔交叉火力
    { t: 2, say: '装甲列车', f: 'tanks', type: 'tank', n: 3 },
    { t: 5, f: 'vee', type: 'scout', n: 5 },
    { t: 8, say: '炮塔阵地', f: 'turret' },
    { t: 12, f: 'pair', type: 'chopper', n: 3 },
    { t: 15, say: '沙尘侦察', f: 'vee', type: 'scout', n: 6 },
    { t: 18, f: 'row', type: 'weaver', n: 5 },
    { t: 21, f: 'side', type: 'scout', n: 5, side: 'R' },
    { t: 24, say: '装甲推进', f: 'tanks', type: 'tank', n: 4 },
    { t: 28, f: 'bonus', kinds: ['P'] },
    { t: 29, say: '交叉火力', f: 'turret' },
    { t: 32, f: 'vee', type: 'scout', n: 6 },
    { t: 35, say: '沙漠伏击', f: 'side', type: 'weaver', n: 5, side: 'L' },
    { t: 38, f: 'pair', type: 'chopper', n: 3 },
    { t: 41, say: '沙暴来袭', f: 'vee', type: 'scout', n: 7 },
    { t: 44, f: 'tanks', type: 'tank', n: 4 },
    { t: 47, f: 'row', type: 'weaver', n: 5 },
    { t: 50, say: '空中压制', f: 'pair', type: 'chopper', n: 4 },
    { t: 53, say: '基地守卫', f: 'turret' },
    { t: 56, say: '重装甲阵', f: 'tanks', type: 'tank', n: 4 },
    { t: 59, f: 'side', type: 'scout', n: 6, side: 'L' },
    { t: 62, f: 'row', type: 'weaver', n: 6 },
    { t: 65, say: '装甲合围', f: 'tanks', type: 'tank', n: 4 },
    { t: 66, f: 'bonus', kinds: ['O'] },
    { t: 68, f: 'vee', type: 'scout', n: 6 },
    { t: 71, say: '回旋突袭', f: 'side', type: 'scout', n: 6, side: 'R' },
    { t: 74, f: 'turret' },
    { t: 77, say: '沙暴总攻', f: 'row', type: 'weaver', n: 6 },
    { t: 80, f: 'bonus', kinds: ['B'] },
    { t: 81, f: 'tanks', type: 'tank', n: 4 },
    { t: 84, f: 'pair', type: 'chopper', n: 4 },
    { t: 86, f: 'vee', type: 'scout', n: 7 },
  ],
  [ // S5 火山工厂:自杀机+炮塔
    { t: 2, say: '熔岩哨兵', f: 'row', type: 'weaver', n: 5 },
    { t: 5, f: 'vee', type: 'scout', n: 5 },
    { t: 8, say: '自杀机群!', f: 'kami', type: 'kami', n: 4 },
    { t: 11, f: 'pair', type: 'chopper', n: 3 },
    { t: 14, say: '高炉炮塔', f: 'turret' },
    { t: 17, f: 'row', type: 'weaver', n: 5 },
    { t: 20, f: 'side', type: 'scout', n: 5, side: 'L' },
    { t: 23, say: '烈焰冲锋', f: 'kami', type: 'kami', n: 5 },
    { t: 26, f: 'vee', type: 'scout', n: 6 },
    { t: 28, f: 'bonus', kinds: ['P'] },
    { t: 29, f: 'pair', type: 'chopper', n: 3 },
    { t: 32, say: '熔炉炮群', f: 'turret' },
    { t: 35, f: 'row', type: 'weaver', n: 6 },
    { t: 38, say: '右翼猎手', f: 'side', type: 'chopper', n: 4, side: 'R' },
    { t: 41, f: 'vee', type: 'scout', n: 6 },
    { t: 44, say: '玉碎波', f: 'kami', type: 'kami', n: 6 },
    { t: 47, f: 'row', type: 'weaver', n: 5 },
    { t: 50, f: 'turret' },
    { t: 53, say: '熔岩合围', f: 'side', type: 'weaver', n: 5, side: 'L' },
    { t: 56, f: 'pair', type: 'chopper', n: 4 },
    { t: 59, say: '烈焰冲锋', f: 'kami', type: 'kami', n: 5 },
    { t: 62, f: 'row', type: 'weaver', n: 6 },
    { t: 64, f: 'bonus', kinds: ['M'] },
    { t: 65, f: 'turret' },
    { t: 68, say: '空中压制', f: 'pair', type: 'chopper', n: 4 },
    { t: 71, f: 'vee', type: 'scout', n: 6 },
    { t: 74, say: '自杀总攻', f: 'kami', type: 'kami', n: 6 },
    { t: 77, f: 'row', type: 'weaver', n: 6 },
    { t: 80, f: 'bonus', kinds: ['S'] },
    { t: 81, f: 'side', type: 'chopper', n: 4, side: 'L' },
    { t: 84, f: 'kami', type: 'kami', n: 5 },
    { t: 86, f: 'row', type: 'weaver', n: 6 },
  ],
  [ // S6 云端要塞:分裂体+炮艇
    { t: 2, say: '分裂体先锋', f: 'split', type: 'splitter', n: 4 },
    { t: 5, f: 'row', type: 'scout', n: 5 },
    { t: 8, say: '浮空炮艇', f: 'gun', n: 2 },
    { t: 12, f: 'pair', type: 'chopper', n: 3 },
    { t: 15, say: '细胞增殖', f: 'split', type: 'splitter', n: 5 },
    { t: 18, f: 'row', type: 'weaver', n: 5 },
    { t: 21, f: 'side', type: 'scout', n: 5, side: 'R' },
    { t: 24, say: '云端炮台', f: 'turret' },
    { t: 27, f: 'vee', type: 'scout', n: 6 },
    { t: 28, f: 'bonus', kinds: ['P'] },
    { t: 30, say: '立体包围', f: 'side', type: 'splitter', n: 5, side: 'R' },
    { t: 33, f: 'gun', n: 2 },
    { t: 36, f: 'row', type: 'weaver', n: 6 },
    { t: 39, say: '炮艇巡航', f: 'gun', n: 2 },
    { t: 42, f: 'vee', type: 'scout', n: 6 },
    { t: 45, say: '风暴眼', f: 'row', type: 'weaver', n: 6 },
    { t: 48, f: 'pair', type: 'chopper', n: 4 },
    { t: 51, say: '增殖高潮', f: 'split', type: 'splitter', n: 6 },
    { t: 54, f: 'side', type: 'weaver', n: 5, side: 'L' },
    { t: 57, f: 'gun', n: 2 },
    { t: 60, say: '要塞炮群', f: 'turret' },
    { t: 63, f: 'row', type: 'scout', n: 6 },
    { t: 64, f: 'bonus', kinds: ['O'] },
    { t: 66, say: '分裂狂潮', f: 'split', type: 'splitter', n: 6 },
    { t: 69, f: 'vee', type: 'scout', n: 6 },
    { t: 72, say: '精锐要塞炮', f: 'gun', n: 2 },
    { t: 75, f: 'row', type: 'weaver', n: 6 },
    { t: 78, f: 'side', type: 'splitter', n: 5, side: 'L' },
    { t: 80, f: 'bonus', kinds: ['B'] },
    { t: 81, f: 'pair', type: 'chopper', n: 4 },
    { t: 84, f: 'split', type: 'splitter', n: 6 },
    { t: 86, f: 'row', type: 'scout', n: 7 },
  ],
  [ // S7 轨道船坞:航母登场
    { t: 2, say: '轨道哨舰', f: 'carrier', n: 1 },
    { t: 5, f: 'row', type: 'weaver', n: 5 },
    { t: 8, say: '分裂体先锋', f: 'split', type: 'splitter', n: 5 },
    { t: 11, f: 'vee', type: 'scout', n: 6 },
    { t: 14, say: '船坞炮群', f: 'turret' },
    { t: 17, f: 'pair', type: 'chopper', n: 3 },
    { t: 20, say: '航母来袭', f: 'carrier', n: 1 },
    { t: 24, f: 'row', type: 'weaver', n: 6 },
    { t: 27, say: '舰载机出击', f: 'kami', type: 'kami', n: 5 },
    { t: 28, f: 'bonus', kinds: ['P'] },
    { t: 30, f: 'side', type: 'scout', n: 6, side: 'L' },
    { t: 33, say: '细胞增殖', f: 'split', type: 'splitter', n: 6 },
    { t: 36, f: 'turret' },
    { t: 39, say: '船坞伏击', f: 'side', type: 'weaver', n: 6, side: 'L' },
    { t: 42, f: 'pair', type: 'chopper', n: 4 },
    { t: 45, say: '轨道巡航', f: 'carrier', n: 1 },
    { t: 49, f: 'row', type: 'scout', n: 6 },
    { t: 52, say: '立体防御', f: 'turret' },
    { t: 55, f: 'pair', type: 'chopper', n: 3 },
    { t: 58, say: '深渊双舰', f: 'carrier', n: 2 },
    { t: 62, f: 'row', type: 'weaver', n: 6 },
    { t: 65, say: '舰载机总攻', f: 'kami', type: 'kami', n: 6 },
    { t: 68, f: 'side', type: 'splitter', n: 5, side: 'R' },
    { t: 71, say: '分裂狂潮', f: 'row', type: 'splitter', n: 6 },
    { t: 74, f: 'vee', type: 'scout', n: 6 },
    { t: 77, f: 'turret' },
    { t: 78, f: 'bonus', kinds: ['O'] },
    { t: 80, say: '航母护航', f: 'carrier', n: 1 },
    { t: 81, f: 'bonus', kinds: ['B'] },
    { t: 83, f: 'row', type: 'weaver', n: 6 },
    { t: 86, f: 'side', type: 'kami', n: 6, side: 'R' },
  ],
  [ // S8 异星母舰:全员精锐,全程高压
    { t: 2, say: '异星先锋', f: 'split', type: 'splitter', n: 6 },
    { t: 5, say: '自杀机群!', f: 'kami', type: 'kami', n: 5 },
    { t: 8, f: 'row', type: 'weaver', n: 6 },
    { t: 11, say: '深渊航母', f: 'carrier', n: 1 },
    { t: 14, f: 'vee', type: 'scout', n: 6 },
    { t: 17, say: '精锐炮艇', f: 'gun', n: 2 },
    { t: 20, f: 'side', type: 'splitter', n: 5, side: 'L' },
    { t: 23, say: '核心炮群', f: 'turret' },
    { t: 26, f: 'row', type: 'weaver', n: 6 },
    { t: 29, say: '吞噬波', f: 'split', type: 'splitter', n: 6 },
    { t: 30, f: 'bonus', kinds: ['P'] },
    { t: 32, say: '玉碎波', f: 'kami', type: 'kami', n: 6 },
    { t: 35, f: 'gun', n: 2 },
    { t: 38, say: '航母来袭', f: 'carrier', n: 1 },
    { t: 41, f: 'row', type: 'weaver', n: 6 },
    { t: 44, say: '虫群护航', f: 'side', type: 'weaver', n: 6, side: 'R' },
    { t: 47, f: 'split', type: 'splitter', n: 6 },
    { t: 50, say: '立体杀阵', f: 'gun', n: 2 },
    { t: 53, f: 'turret' },
    { t: 56, say: '总力冲锋', f: 'kami', type: 'kami', n: 7 },
    { t: 59, f: 'row', type: 'scout', n: 7 },
    { t: 60, f: 'bonus', kinds: ['M'] },
    { t: 62, say: '双母舰降临', f: 'carrier', n: 2 },
    { t: 66, f: 'split', type: 'splitter', n: 6 },
    { t: 69, say: '虫群总攻', f: 'row', type: 'weaver', n: 7 },
    { t: 72, f: 'gun', n: 2 },
    { t: 75, say: '核心炮群', f: 'turret' },
    { t: 77, f: 'side', type: 'kami', n: 6, side: 'L' },
    { t: 79, say: '最后防线', f: 'split', type: 'splitter', n: 7 },
    { t: 81, f: 'bonus', kinds: ['B', 'O'] },
    { t: 82, f: 'row', type: 'scout', n: 7 },
    { t: 84, say: '母舰亲卫', f: 'carrier', n: 1 },
    { t: 86, f: 'kami', type: 'kami', n: 6 },
  ],
];

// 随机“涓流”池:填补波次间隙,保持屏幕一直有怪;重型单位依然只走固定脚本
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
