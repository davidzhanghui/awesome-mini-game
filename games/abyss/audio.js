/* 深渊回响 — 实时合成音效（Web Audio）
 * 无音频文件：所有声音由振荡器与噪声缓冲现场合成。
 * 暴露 PVZ 同款风格接口：abyss.sfx(name) / abyss.setVol(v) / abyss.init()
 */
(function () {
  'use strict';

  var ac = null, master = null, noiseBuf = null;
  var vol = 0.8;
  var last = {};      // 同名音效限流，避免密集攻击把扬声器打爆
  var muted = false;

  function now() { return ac.currentTime; }

  function makeNoise() {
    var len = ac.sampleRate * 1.2;
    var b = ac.createBuffer(1, len, ac.sampleRate);
    var d = b.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  function init() {
    if (ac) return ac;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = vol;
    var comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 22;
    comp.ratio.value = 5;
    master.connect(comp);
    comp.connect(ac.destination);
    noiseBuf = makeNoise();
    return ac;
  }

  function env(g, t, a, d, peak) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  function tone(freq, dur, type, gain, slideTo, delay) {
    if (!ac) return;
    var t = now() + (delay || 0);
    var o = ac.createOscillator(), g = ac.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    env(g, t, .008, dur, gain == null ? .2 : gain);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + .05);
  }

  function noise(dur, gain, hp, lp, delay, type) {
    if (!ac) return;
    var t = now() + (delay || 0);
    var s = ac.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    var f = ac.createBiquadFilter();
    f.type = type || 'bandpass';
    f.frequency.value = hp || 1200;
    if (lp) { f.type = 'lowpass'; f.frequency.value = lp; }
    var g = ac.createGain();
    env(g, t, .005, dur, gain == null ? .2 : gain);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t); s.stop(t + dur + .05);
  }

  // 带限流的合成音
  function sfx(name) {
    if (!ac || muted) return;
    var t = ac.currentTime;
    // 高频音效 40ms 内只响一次
    if (last[name] && t - last[name] < .045) return;
    last[name] = t;
    switch (name) {
      case 'click':
        tone(660, .06, 'triangle', .10, 880); break;
      case 'swing':
        noise(.12, .10, 2600, null, 0); tone(220, .1, 'triangle', .05, 140); break;
      case 'hit':
        noise(.09, .16, 900, null, 0); tone(120, .09, 'square', .10, 70); break;
      case 'crit':
        noise(.14, .2, 1600, null, 0); tone(220, .12, 'square', .12, 90); tone(1600, .1, 'triangle', .08, 2400, .02); break;
      case 'bow':
        noise(.08, .12, 3400, null, 0); tone(520, .07, 'triangle', .06, 900); break;
      case 'fire':
        noise(.22, .12, 700, 2200, 0); tone(300, .2, 'sawtooth', .07, 120); break;
      case 'boom':
        noise(.45, .3, 60, 900, 0); tone(90, .4, 'sine', .25, 36); break;
      case 'frost':
        tone(1200, .25, 'sine', .10, 2400); noise(.3, .1, 4000, null, 0); break;
      case 'blink':
        tone(700, .18, 'sine', .1, 1800); noise(.12, .08, 5000, null, 0); break;
      case 'meteor':
        noise(.6, .22, 80, 1200, 0); tone(70, .6, 'sine', .2, 30); break;
      case 'whirl':
        noise(.5, .14, 700, 3000, 0); break;
      case 'charge':
        noise(.3, .18, 300, 1500, 0); tone(140, .3, 'sawtooth', .12, 60); break;
      case 'shout':
        tone(160, .35, 'sawtooth', .16, 240); tone(240, .3, 'square', .08, 300, .03); break;
      case 'poison':
        noise(.5, .12, 400, 1400, 0); tone(180, .4, 'sine', .07, 90); break;
      case 'dash':
        noise(.22, .12, 1800, null, 0); tone(400, .16, 'triangle', .07, 1200); break;
      case 'arrowrain':
        for (var i = 0; i < 5; i++) noise(.07, .07, 3200, null, i * .045);
        break;
      case 'potion':
        tone(420, .25, 'sine', .12, 620); tone(560, .2, 'triangle', .07, 780, .05); break;
      case 'levelup':
        tone(523, .18, 'triangle', .14);
        tone(659, .18, 'triangle', .14, null, .09);
        tone(784, .28, 'triangle', .16, null, .18);
        tone(1046, .4, 'sine', .12, null, .28); break;
      case 'loot':
        tone(880, .09, 'triangle', .1);
        tone(1320, .18, 'sine', .09, null, .07); break;
      case 'legendary':
        [523, 659, 784, 1046, 1318].forEach(function (f, i) {
          tone(f, .35, 'triangle', .1, null, i * .07);
        }); break;
      case 'gold':
        tone(1180, .07, 'triangle', .07, 1500); break;
      case 'hurt':
        tone(140, .16, 'sawtooth', .16, 70); noise(.1, .12, 500, null, 0); break;
      case 'die':
        tone(220, .5, 'sawtooth', .14, 55); noise(.4, .12, 300, 900, 0); break;
      case 'monsterDie':
        noise(.2, .12, 400, 1400, 0); tone(180, .18, 'square', .05, 80); break;
      case 'portal':
        tone(220, .8, 'sine', .12, 440); tone(330, .8, 'triangle', .07, 660, .1); break;
      case 'descend':
        tone(440, .9, 'sine', .14, 110); noise(.8, .08, 200, 800, 0); break;
      case 'boss':
        tone(55, 1.4, 'sawtooth', .22, 40); noise(1.2, .12, 100, 500, 0);
        tone(110, 1.2, 'square', .1, 58, .1); break;
      case 'shield':
        tone(600, .2, 'sine', .08, 900); break;
      case 'chest':
        noise(.3, .12, 300, 1600, 0); tone(300, .25, 'triangle', .08, 500); break;
      case 'ui':
        tone(500, .05, 'sine', .06, 620); break;
      case 'error':
        tone(180, .12, 'square', .08, 120); break;
      /* ===== 深渊新技能 / 敌人 ===== */
      case 'holy':
        [523, 659, 784].forEach(function (f, i) { tone(f, .45, 'sine', .07, null, i * .04); });
        noise(.4, .05, 2400, 6000, 0); break;
      case 'judgment':
        tone(880, .5, 'sine', .1, 1760); noise(.35, .08, 3000, null, .1); break;
      case 'judgmentHit':
        tone(1320, .35, 'triangle', .12, 660); noise(.4, .16, 100, 1800, 0);
        tone(66, .5, 'sine', .22, 40); break;
      case 'sanctuary':
        [392, 523, 659, 784, 1046].forEach(function (f, i) { tone(f, .8, 'triangle', .06, null, i * .06); });
        noise(.6, .05, 1200, 3000, 0); break;
      case 'siphon':
        tone(320, .4, 'sawtooth', .1, 120); tone(160, .45, 'sine', .1, 80, .05); break;
      case 'curse':
        tone(240, .5, 'sawtooth', .09, 110); tone(355, .5, 'square', .04, 166, .06); break;
      case 'blood':
        tone(140, .3, 'sine', .16, 70); tone(900, .18, 'square', .05, 1600, .05); break;
      case 'rift':
        noise(.9, .16, 60, 700, 0); tone(55, .9, 'sawtooth', .16, 30); tone(330, .5, 'triangle', .05, 90, .1); break;
      case 'dark':
        noise(.3, .1, 300, 1200, 0); tone(110, .3, 'sawtooth', .1, 55); break;
      case 'summon':
        tone(160, .6, 'sine', .1, 420); noise(.4, .06, 500, null, 0); break;
      case 'growl':
        tone(90, .22, 'sawtooth', .11, 140); noise(.16, .08, 400, 900, 0); break;
    }
  }

  function setVol(v) {
    vol = Math.max(0, Math.min(1, v));
    if (master) master.gain.value = vol;
  }
  // 静音不碰 master：BGM 走 master，音效直连 comp；只拦 sfx 调用
  function setMuted(m) { muted = !!m; }
  function resume() {
    if (ac && ac.state === 'suspended') ac.resume();
  }

  window.ABYSS_AUDIO = {
    init: init, sfx: sfx, setVol: setVol, setMuted: setMuted, resume: resume,
    get ctx() { return ac; },
    get master() { return master; }
  };
})();
