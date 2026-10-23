/* 萌可花园 · 植物大战僵尸（萌可版） — 音效与音乐
 * 全部音效由 Web Audio 实时合成；BGM 复用站点 AMG_BGM 引擎（moe-garden / moe-candy / moe-night）。
 * 总线：sfxBus + BGM → master → destination，master 受 AMG_AUDIO 的 muted/vol 控制。
 */
(function () {
  'use strict';

  var AC = null, master = null, sfxBus = null, noiseBuf = null;
  var muted = false, volume = 0.8;
  var last = {};
  var ambientScene = '', ambientTimer = 0;
  var A = window.AMG_AUDIO || { vol: 0.8, muted: false, save: function () {} };

  function readPrefs() {
    muted = !!A.muted;
    volume = typeof A.vol === 'number' ? A.vol : 0.8;
    sync();
  }
  function sync() {
    if (!master) return;
    var v = muted ? 0 : volume;
    master.gain.setTargetAtTime(v, AC.currentTime, 0.03);
  }

  function init() {
    if (AC) {
      if (AC.state === 'suspended') { try { AC.resume(); } catch (e) {} }
      return AC;
    }
    try {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      master = AC.createGain(); master.gain.value = muted ? 0 : volume;
      master.connect(AC.destination);
      sfxBus = AC.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
      if (window.AMG_BGM) AMG_BGM.init(AC, master);
      noiseBuf = AC.createBuffer(1, Math.floor(AC.sampleRate * 1.2), AC.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      readPrefs();
    } catch (e) { AC = null; }
    return AC;
  }

  function now() { return AC ? AC.currentTime : 0; }
  function ok(name, gap) {
    if (!AC || muted) return false;
    var t = performance.now();
    if (last[name] && t - last[name] < (gap || 0)) return false;
    last[name] = t;
    return true;
  }

  /* ---------- 基础合成器 ---------- */
  function tone(f, dur, o) {
    o = o || {};
    var t = (o.delay || 0) + now();
    var osc = AC.createOscillator(), g = AC.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(f, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t + dur);
    var v = o.vol == null ? 0.12 : o.vol;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), t + (o.attack || 0.006));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    var node = osc;
    if (o.lp) {
      var fl = AC.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = o.lp;
      node.connect(fl); node = fl;
    }
    if (o.hp) {
      var fh = AC.createBiquadFilter(); fh.type = 'highpass'; fh.frequency.value = o.hp;
      node.connect(fh); node = fh;
    }
    node.connect(g); g.connect(o.bus || sfxBus);
    osc.start(t); osc.stop(t + dur + 0.05);
  }

  function noise(dur, o) {
    o = o || {};
    var t = (o.delay || 0) + now();
    var s = AC.createBufferSource(); s.buffer = noiseBuf;
    var node = s;
    if (o.hp) { var h = AC.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = o.hp; node.connect(h); node = h; }
    if (o.lp) {
      var l = AC.createBiquadFilter(); l.type = 'lowpass';
      l.frequency.setValueAtTime(o.lp, t);
      if (o.lpTo) l.frequency.exponentialRampToValueAtTime(Math.max(30, o.lpTo), t + dur);
      node.connect(l); node = l;
    }
    if (o.bp) { var b = AC.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = o.bp; b.Q.value = o.q || 1; node.connect(b); node = b; }
    var g = AC.createGain();
    var v = o.vol == null ? 0.12 : o.vol;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), t + (o.attack || 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    node.connect(g); g.connect(sfxBus);
    s.start(t, Math.random() * 0.4); s.stop(t + dur + 0.05);
  }

  var S = {};

  S.plant = function () {
    if (!ok('plant', 45)) return;
    tone(170, .16, { type: 'sine', vol: .24, to: 92 });
    noise(.12, { lp: 1100, lpTo: 260, vol: .13 });
    noise(.05, { hp: 2400, vol: .05 });
  };
  S.sun = function () {
    if (!ok('sun', 40)) return;
    tone(940, .13, { type: 'sine', vol: .17, to: 1320 });
    tone(1400, .22, { type: 'triangle', vol: .13, delay: .06 });
    tone(2110, .18, { type: 'sine', vol: .06, delay: .11 });
  };
  S.sunSpawn = function () {
    if (!ok('sunSpawn', 260)) return;
    tone(1180, .1, { type: 'sine', vol: .04 });
  };
  S.pop = function () {
    if (!ok('pop', 280)) return;
    tone(560, .09, { type: 'sine', vol: .07, to: 860 });
  };
  S.shoot = function () {
    if (!ok('shoot', 42)) return;
    tone(560 + Math.random() * 60, .085, { type: 'triangle', vol: .1, to: 300 });
    noise(.05, { hp: 2600, vol: .035 });
  };
  S.ice = function () {
    if (!ok('ice', 55)) return;
    tone(980, .12, { type: 'sine', vol: .1, to: 640 });
    tone(1620, .1, { type: 'triangle', vol: .05, delay: .02 });
    noise(.1, { hp: 4200, vol: .04 });
  };
  S.hit = function () {
    if (!ok('hit', 38)) return;
    tone(180 + Math.random() * 40, .07, { type: 'square', vol: .06, to: 100 });
    noise(.04, { bp: 1400, vol: .05 });
  };
  S.metal = function () {
    if (!ok('metal', 70)) return;
    tone(1320, .18, { type: 'square', vol: .045, to: 1180 });
    tone(1980, .13, { type: 'triangle', vol: .045, to: 1720 });
    tone(870, .2, { type: 'sawtooth', vol: .022, to: 760 });
  };
  S.boom = function () {
    if (!ok('boom', 60)) return;
    noise(.85, { lp: 2200, lpTo: 60, vol: .55 });
    tone(120, .6, { type: 'sine', vol: .4, to: 32 });
    tone(70, .5, { type: 'triangle', vol: .2, to: 28, delay: .03 });
  };
  S.chomp = function () {
    if (!ok('chomp', 120)) return;
    tone(120, .07, { type: 'square', vol: .07, to: 70 });
    noise(.05, { bp: 700, vol: .045 });
  };
  S.groan = function () {
    if (!ok('groan', 1700)) return;
    var f = 88 + Math.random() * 38;
    tone(f, .9, { type: 'sawtooth', vol: .035, to: f * 1.28, lp: 520 });
    tone(f * .72, .9, { type: 'square', vol: .02, to: f * .95, delay: .1, lp: 420 });
  };
  S.vault = function () {
    if (!ok('vault', 120)) return;
    tone(280, .42, { type: 'triangle', vol: .1, to: 780 });
    noise(.2, { bp: 1800, vol: .03, delay: .12 });
  };
  S.mower = function () {
    if (!ok('mower', 300)) return;
    noise(.5, { lp: 1400, lpTo: 600, vol: .13 });
    tone(88, .55, { type: 'sawtooth', vol: .1, to: 120, lp: 420 });
  };
  S.smash = function () {
    if (!ok('smash', 150)) return;
    noise(.34, { lp: 900, lpTo: 70, vol: .4 });
    tone(64, .34, { type: 'sine', vol: .32, to: 34 });
  };
  S.alarm = function () {
    if (!ok('alarm', 1500)) return;
    for (var i = 0; i < 4; i++) {
      tone(i % 2 ? 560 : 760, .3, { type: 'sawtooth', vol: .075, delay: i * .32, lp: 2200 });
    }
  };
  S.win = function () {
    if (!ok('win', 800)) return;
    [523, 659, 784, 1046, 1318, 1568].forEach(function (f, i) {
      tone(f, .4, { type: 'triangle', vol: .16, delay: i * .12 });
      tone(f * 2, .3, { type: 'sine', vol: .04, delay: i * .12 });
    });
  };
  S.lose = function () {
    if (!ok('lose', 800)) return;
    [392, 349, 311, 262, 196].forEach(function (f, i) {
      tone(f, .55, { type: 'sawtooth', vol: .1, delay: i * .2, lp: 1200 });
    });
    noise(1.2, { lp: 400, lpTo: 60, vol: .1, delay: .5 });
  };
  S.click = function () {
    if (!ok('click', 30)) return;
    tone(720, .05, { type: 'triangle', vol: .07, to: 900 });
  };
  S.select = function () {
    if (!ok('select', 40)) return;
    tone(520, .07, { type: 'triangle', vol: .08, to: 700 });
    tone(780, .08, { type: 'sine', vol: .05, delay: .04 });
  };
  S.bad = function () {
    if (!ok('bad', 120)) return;
    tone(150, .16, { type: 'square', vol: .07, to: 110, lp: 900 });
  };
  S.shovel = function () {
    if (!ok('shovel', 60)) return;
    noise(.1, { bp: 1500, vol: .09 });
    tone(230, .1, { type: 'triangle', vol: .09, to: 140 });
  };
  S.spudow = function () {
    if (!ok('spudow', 80)) return;
    noise(.4, { lp: 1400, lpTo: 120, vol: .3 });
    tone(180, .3, { type: 'triangle', vol: .2, to: 60 });
    tone(520, .18, { type: 'square', vol: .05, to: 300, delay: .04 });
  };
  S.swallow = function () {
    if (!ok('swallow', 150)) return;
    tone(220, .22, { type: 'sine', vol: .13, to: 90 });
    noise(.16, { bp: 600, vol: .08, delay: .06 });
  };
  S.torch = function () {
    if (!ok('torch', 90)) return;
    noise(.22, { bp: 900, vol: .08 });
    tone(300, .2, { type: 'sawtooth', vol: .05, to: 520, lp: 1600 });
  };
  S.grave = function () {
    if (!ok('grave', 400)) return;
    noise(.35, { lp: 700, lpTo: 120, vol: .12 });
    tone(96, .4, { type: 'sine', vol: .08, to: 60 });
  };
  S.throw = function () {
    if (!ok('throw', 200)) return;
    tone(420, .3, { type: 'triangle', vol: .08, to: 120 });
    noise(.18, { bp: 900, vol: .05, delay: .1 });
  };
  S.star = function () {
    if (!ok('star', 60)) return;
    tone(1046, .12, { type: 'sine', vol: .1, to: 1568 });
  };

  /* ---------- 萌可版新增音效 ---------- */
  // 果冻分裂：软糯的啵啾
  S.split = function () {
    if (!ok('split', 160)) return;
    tone(420, .1, { type: 'sine', vol: .16, to: 700 });
    tone(700, .12, { type: 'triangle', vol: .1, to: 1040, delay: .05 });
    tone(1040, .16, { type: 'sine', vol: .07, to: 620, delay: .1 });
  };
  // 弹簧弹跳：boing
  S.boing = function () {
    if (!ok('boing', 160)) return;
    tone(180, .26, { type: 'triangle', vol: .17, to: 560 });
    tone(560, .2, { type: 'sine', vol: .08, to: 300, delay: .1 });
  };
  // 泡泡发射：水泡破裂前的滑音
  S.bubble = function () {
    if (!ok('bubble', 110)) return;
    tone(880, .16, { type: 'sine', vol: .09, to: 420 });
    tone(1320, .1, { type: 'triangle', vol: .04, to: 760, delay: .03 });
  };
  // 糖霜护盾展开
  S.shield = function () {
    if (!ok('shield', 240)) return;
    [784, 988, 1175, 1568].forEach(function (f, i) {
      tone(f, .3, { type: 'sine', vol: .075, delay: i * .045 });
    });
    noise(.18, { hp: 3200, vol: .035 });
  };
  S.shieldBreak = function () {
    if (!ok('shieldBreak', 160)) return;
    tone(1568, .16, { type: 'triangle', vol: .09, to: 520 });
    noise(.2, { hp: 2600, lpTo: 700, vol: .07 });
  };
  // 甜筒炮：整行糖浆
  S.sundae = function () {
    if (!ok('sundae', 260)) return;
    tone(196, .4, { type: 'triangle', vol: .2, to: 78 });
    tone(392, .3, { type: 'sine', vol: .1, to: 156, delay: .04 });
    noise(.5, { lp: 1600, lpTo: 180, vol: .2 });
    [1046, 1318, 1568].forEach(function (f, i) {
      tone(f, .2, { type: 'sine', vol: .06, delay: .08 + i * .05 });
    });
  };
  // 幽灵南瓜：飘忽的呜声
  S.ghost = function () {
    if (!ok('ghost', 200)) return;
    tone(320, .5, { type: 'sine', vol: .07, to: 520, lp: 1400 });
    tone(480, .45, { type: 'triangle', vol: .04, to: 300, delay: .08 });
    noise(.3, { bp: 900, q: .8, vol: .03 });
  };

  /* ---------- 环境音 ---------- */
  function bird() {
    var base = 2200 + Math.random() * 1200;
    var n = 2 + Math.floor(Math.random() * 3);
    for (var i = 0; i < n; i++) {
      tone(base * (1 + Math.random() * .15), .09, { type: 'sine', vol: .022, to: base * 1.4, delay: i * .11 });
    }
  }
  function cricket() {
    for (var i = 0; i < 3; i++) {
      tone(4200 + Math.random() * 300, .035, { type: 'triangle', vol: .012, delay: i * .07 });
    }
  }
  function tickAmbient() {
    if (!AC || muted) return;
    var sc = ambientScene;
    if (sc === 'day' || sc === 'noon') {
      if (Math.random() < .35) bird();
      if (Math.random() < .12) noise(.6, { bp: 500, vol: .012, q: .6 });
    } else if (sc === 'candy') {
      // 糖果花园：鸟鸣 + 偶尔的八音盒亮片
      if (Math.random() < .45) bird();
      if (Math.random() < .3) {
        var f = [1046, 1318, 1568, 2093][Math.floor(Math.random() * 4)];
        tone(f, .3, { type: 'sine', vol: .018, to: f * 1.5 });
      }
    } else if (sc === 'dusk') {
      if (Math.random() < .2) cricket();
      if (Math.random() < .12) bird();
    } else if (sc === 'night' || sc === 'eclipse') {
      if (Math.random() < .75) cricket();
      if (Math.random() < .1) tone(70, 1.6, { type: 'sine', vol: .02, to: 55 });
    }
  }

  function setScene(scene) {
    if (ambientScene === scene && ambientTimer) return;
    ambientScene = scene;
    if (ambientTimer) { clearInterval(ambientTimer); ambientTimer = 0; }
    if (!AC) return;
    ambientTimer = setInterval(tickAmbient, 2200);
  }

  /* ---------- 音乐 ---------- */
  var curMusic = '';
  function music(name) {
    if (!AC || !window.AMG_BGM) return;
    if (name === curMusic) return;
    curMusic = name;
    if (name) AMG_BGM.play(name); else AMG_BGM.stop();
  }

  function setMuted(v) {
    muted = !!v;
    A.muted = muted; A.save();
    if (master && AC) master.gain.setTargetAtTime(muted ? 0 : volume, AC.currentTime, .05);
    if (!muted && curMusic && window.AMG_BGM) AMG_BGM.play(curMusic);
    if (!muted && ambientScene && !ambientTimer) ambientTimer = setInterval(tickAmbient, 2200);
  }
  function setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    A.vol = volume; A.save();
    if (master && AC) master.gain.setTargetAtTime(muted ? 0 : volume, AC.currentTime, .04);
  }
  function isMuted() { return muted; }

  window.PVZ_AUDIO = {
    init: init,
    sfx: function (n) { if (AC && S[n]) S[n](); },
    raw: S,
    setScene: setScene,
    music: music,
    setMuted: setMuted,
    isMuted: isMuted,
    setVolume: setVolume,
    getVolume: function () { return volume; },
    get ctx() { return AC; }
  };
})();
