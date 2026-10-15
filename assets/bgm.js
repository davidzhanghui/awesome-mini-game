/* AMG BGM helper — procedural background music + persisted volume prefs.
 * Zero dependencies, no audio files: notes are synthesized with Web Audio.
 *
 *   AMG_AUDIO.vol / .muted          persisted in localStorage "amg-audio"
 *   AMG_AUDIO.save()                write prefs
 *   AMG_BGM.init(ctx, destNode)     call once the AudioContext exists
 *   AMG_BGM.play('pvz-calm'|...)    crossfade to a track (same name = no-op)
 *   AMG_BGM.stop()                  fade out
 * Tracks: one loop = 4 bars x 8 eighth-notes (32 steps).
 */
(function () {
  'use strict';
  var KEY = 'amg-audio';
  var A = { vol: 0.8, muted: false };
  try {
    var s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s) { if (typeof s.vol === 'number') A.vol = Math.min(1, Math.max(0, s.vol)); A.muted = !!s.muted; }
  } catch (e) {}
  A.save = function () { try { localStorage.setItem(KEY, JSON.stringify({ vol: A.vol, muted: A.muted })); } catch (e) {} };
  window.AMG_AUDIO = A;

  var N = null;
  var BAR = 8;
  function rep(a, n) { var r = []; for (var i = 0; i < n; i++) r = r.concat(a); return r; }
  var _ = null;
  var TRACKS = {
    // 植物大战僵尸：轻快草坪（C 大调 I–vi–IV–V）
    'pvz-calm': {
      bpm: 104, lead: 'triangle', leadVol: 0.13, leadLen: 0.85,
      melody: [76, 79, 76, 72, 74, 76, 79, _,  69, 72, 76, 72, 69, 72, 71, _,
               77, 81, 77, 72, 74, 77, 81, _,  79, 83, 86, 83, 79, 83, 74, _],
      bass: [36, 33, 41, 43], bassPat: [1, 0, 1, 0, 1, 0, 1, 0], bassWave: 'triangle', bassVol: 0.22,
      chords: [[60, 64, 67], [57, 60, 64], [57, 60, 65], [59, 62, 67]], padVol: 0.05,
      kick: [1, 0, 0, 0, 1, 0, 0, 0], snare: [0, 0, 0, 0, 0, 0, 0, 0], hat: [0, 1, 0, 1, 0, 1, 0, 1], drumVol: 0.5
    },
    // 僵尸压境：A 小调紧张 8 分音符
    'pvz-tense': {
      bpm: 150, lead: 'square', leadVol: 0.07, leadLen: 0.7, lp: 2400,
      melody: [69, 72, 76, 81, 76, 72, 69, 72,  65, 69, 72, 77, 72, 69, 65, 69,
               67, 71, 74, 79, 74, 71, 67, 71,  64, 68, 71, 76, 71, 68, 64, 68],
      bass: [33, 29, 31, 28], bassPat: [1, 1, 1, 1, 1, 1, 1, 1], bassWave: 'sawtooth', bassVol: 0.11, bassLp: 500,
      chords: [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 56, 59]], padVol: 0.05,
      kick: [1, 0, 1, 0, 1, 0, 1, 0], snare: [0, 0, 1, 0, 0, 0, 1, 0], hat: [1, 1, 1, 1, 1, 1, 1, 1], drumVol: 0.7
    },
    // 水晶守卫：史诗行军（D 小调 i–VI–III–VII）
    'td-calm': {
      bpm: 92, lead: 'triangle', leadVol: 0.14, leadLen: 0.95,
      melody: [74, _, 77, 81, _, 79, 77, _,  70, _, 74, 77, _, 76, 74, _,
               72, _, 77, 81, _, 79, 77, _,  76, _, 79, 84, _, 83, 79, _],
      bass: [38, 34, 41, 36], bassPat: [1, 0, 0, 1, 0, 1, 0, 0], bassWave: 'sine', bassVol: 0.3,
      chords: [[62, 65, 69], [58, 62, 65], [60, 65, 69], [60, 64, 67]], padVol: 0.06,
      kick: [1, 0, 0, 0, 1, 0, 0, 0], snare: [0, 0, 0, 0, 0, 0, 0, 0], hat: [0, 0, 1, 0, 0, 0, 1, 0], drumVol: 0.55
    },
    // Boss / 大军：高速琶音
    'td-tense': {
      bpm: 132, lead: 'square', leadVol: 0.065, leadLen: 0.7, lp: 2600,
      melody: [74, 77, 81, 77, 74, 77, 81, 86,  70, 74, 77, 74, 70, 74, 77, 82,
               72, 77, 81, 77, 72, 77, 81, 84,  72, 76, 79, 76, 72, 76, 79, 84],
      bass: [38, 34, 41, 36], bassPat: [1, 1, 1, 1, 1, 1, 1, 1], bassWave: 'sawtooth', bassVol: 0.11, bassLp: 520,
      chords: [[62, 65, 69], [58, 62, 65], [60, 65, 69], [60, 64, 67]], padVol: 0.05,
      kick: [1, 0, 1, 0, 1, 0, 1, 1], snare: [0, 0, 1, 0, 0, 0, 1, 0], hat: [1, 1, 1, 1, 1, 1, 1, 1], drumVol: 0.75
    },
    // 益智静心（2048 / 扫雷 / 记忆翻牌）：F 大调 I–vi–ii–V
    'puzzle-calm': {
      bpm: 92, lead: 'sine', leadVol: 0.12, leadLen: 0.9,
      melody: [72, _, 69, 72, 77, _, 76, 72,  74, _, 69, 74, 77, _, 74, 69,
               70, _, 74, 79, 77, _, 74, 70,  72, _, 76, 79, 76, 74, 72, _],
      bass: [41, 38, 43, 36], bassPat: [1, 0, 0, 0, 1, 0, 0, 0], bassWave: 'sine', bassVol: 0.25,
      chords: [[65, 69, 72], [62, 65, 69], [62, 67, 70], [60, 64, 67]], padVol: 0.045,
      kick: [1, 0, 0, 0, 0, 0, 0, 0], snare: [0, 0, 0, 0, 0, 0, 0, 0], hat: [0, 0, 1, 0, 0, 0, 1, 0], drumVol: 0.35
    },
    // 街机冲刺（打砖块 / 贪吃蛇）：E 小调 i–VI–III–VII
    'arcade-run': {
      bpm: 144, lead: 'square', leadVol: 0.06, leadLen: 0.7, lp: 2800,
      melody: [76, 79, 83, 79, 76, 79, 83, 88,  72, 76, 79, 76, 84, 79, 76, 72,
               74, 79, 83, 79, 86, 83, 79, 74,  78, 74, 81, 78, 86, 81, 78, _],
      bass: [40, 36, 43, 38], bassPat: [1, 1, 1, 1, 1, 1, 1, 1], bassWave: 'sawtooth', bassVol: 0.1, bassLp: 520,
      chords: [[64, 67, 71], [60, 64, 67], [62, 67, 71], [62, 66, 69]], padVol: 0.045,
      kick: [1, 0, 0, 0, 1, 0, 0, 0], snare: [0, 0, 1, 0, 0, 0, 1, 0], hat: [1, 1, 1, 1, 1, 1, 1, 1], drumVol: 0.6
    },
    // 晴空微风（Flappy Bird）：G 大调 I–V–vi–IV
    'sky-breeze': {
      bpm: 116, lead: 'triangle', leadVol: 0.12, leadLen: 0.8,
      melody: [79, _, 83, 86, 83, _, 79, 81,  78, _, 81, 86, 81, _, 78, 79,
               76, _, 79, 83, 79, _, 76, 78,  76, 79, 84, _, 83, 81, 79, _],
      bass: [43, 38, 40, 36], bassPat: [1, 0, 0, 1, 0, 0, 1, 0], bassWave: 'triangle', bassVol: 0.22,
      chords: [[67, 71, 74], [62, 66, 69], [64, 67, 71], [60, 64, 67]], padVol: 0.05,
      kick: [1, 0, 0, 0, 1, 0, 0, 0], snare: [0, 0, 0, 0, 0, 0, 0, 0], hat: [0, 1, 0, 1, 0, 1, 0, 1], drumVol: 0.45
    },
    // 宝石微光（宝石消除 / 泡泡龙）：A 小调琶音 Am–F–C–G
    'jewel-glow': {
      bpm: 104, lead: 'sine', leadVol: 0.13, leadLen: 0.7,
      melody: [81, 76, 72, 76, 81, 84, 81, 76,  77, 72, 69, 72, 77, 81, 77, 72,
               79, 76, 72, 76, 79, 84, 79, 76,  79, 74, 71, 74, 79, 83, 86, _],
      bass: [33, 29, 36, 31], bassPat: [1, 0, 0, 0, 1, 0, 1, 0], bassWave: 'sine', bassVol: 0.28,
      chords: [[57, 60, 64], [53, 57, 60], [55, 60, 64], [55, 59, 62]], padVol: 0.05,
      kick: [1, 0, 0, 0, 1, 0, 0, 0], snare: [0, 0, 1, 0, 0, 0, 1, 0], hat: [0, 1, 0, 1, 0, 1, 0, 1], drumVol: 0.35
    }
  };

  var ac = null, g = null, noise = null, timer = 0;
  var cur = null, curName = '', step = 0, nextT = 0, hidden = false;
  var LEVEL = 0.34;

  function hz(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  function init(ctx, dest) {
    if (ac === ctx && g) return;
    ac = ctx;
    g = ac.createGain(); g.gain.value = 0; g.connect(dest);
    noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    var d = noise.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  function osc(type, f, t, dur, vol, lp) {
    var o = ac.createOscillator(), e = ac.createGain(), out = e;
    o.type = type; o.frequency.setValueAtTime(f, t);
    e.gain.setValueAtTime(0.0001, t);
    e.gain.exponentialRampToValueAtTime(vol, t + 0.015);
    e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(e);
    if (lp) { var fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = lp; e.connect(fl); out = fl; }
    out.connect(g); o.start(t); o.stop(t + dur + 0.05);
  }
  function kick(t, v) {
    var o = ac.createOscillator(), e = ac.createGain();
    o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    e.gain.setValueAtTime(v * 0.6, t); e.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(e); e.connect(g); o.start(t); o.stop(t + 0.2);
  }
  function hitNoise(t, dur, v, hp) {
    var s = ac.createBufferSource(), fl = ac.createBiquadFilter(), e = ac.createGain();
    s.buffer = noise; fl.type = 'highpass'; fl.frequency.value = hp;
    e.gain.setValueAtTime(v, t); e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(e); e.connect(g); s.start(t); s.stop(t + dur + 0.02);
  }

  function schedule(tr, st, t, eighth) {
    var bar = Math.floor(st / BAR) % 4, i = st % BAR;
    var m = tr.melody[st % 32];
    if (m != null) osc(tr.lead, hz(m), t, eighth * tr.leadLen, tr.leadVol, tr.lp);
    if (tr.bassPat[i]) osc(tr.bassWave, hz(tr.bass[bar]), t, eighth * 0.9, tr.bassVol, tr.bassLp);
    if (i === 0) tr.chords[bar].forEach(function (c) { osc('triangle', hz(c), t, eighth * BAR * 0.96, tr.padVol); });
    var dv = tr.drumVol;
    if (tr.kick[i]) kick(t, dv);
    if (tr.snare[i]) hitNoise(t, 0.1, 0.22 * dv, 1800);
    if (tr.hat[i]) hitNoise(t, 0.035, 0.1 * dv, 7000);
  }

  function tick() {
    if (!ac || !cur || hidden) return;
    var eighth = 60 / cur.bpm / 2;
    if (ac.state !== 'running') { nextT = ac.currentTime + 0.1; return; }
    if (nextT < ac.currentTime) nextT = ac.currentTime + 0.05;
    while (nextT < ac.currentTime + 0.35) { schedule(cur, step, nextT, eighth); nextT += eighth; step++; }
  }

  function fade(to, delay, tc) {
    var t = ac.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setTargetAtTime(to, t + (delay || 0), tc || 0.1);
  }

  function play(name) {
    if (!ac || !g || !TRACKS[name] || name === curName) return;
    var had = !!cur;
    curName = name; cur = TRACKS[name]; step = 0;
    nextT = ac.currentTime + (had ? 0.35 : 0.1);
    if (had) { fade(0, 0, 0.05); g.gain.setTargetAtTime(LEVEL, ac.currentTime + 0.33, 0.15); }
    else fade(LEVEL, 0, 0.3);
    if (!timer) timer = setInterval(tick, 60);
  }
  function stop() {
    if (!ac || !g || !cur) return;
    curName = ''; fade(0, 0, 0.12);
    var gone = cur;
    setTimeout(function () { if (cur === gone && !curName) { cur = null; clearInterval(timer); timer = 0; } }, 700);
  }

  document.addEventListener('visibilitychange', function () {
    if (!ac || !g) return;
    hidden = document.hidden;
    if (hidden) { g.gain.cancelScheduledValues(ac.currentTime); g.gain.value = 0; }
    else if (cur) { nextT = ac.currentTime + 0.1; fade(LEVEL, 0, 0.3); }
  });

  window.AMG_BGM = { init: init, play: play, stop: stop };
})();
