/* 机甲大作战 · Mecha Strike — 3D 俯视角机甲射击
 * Three.js 渲染（vendored three.min.js），所有模型程序化拼装、所有音效 Web Audio 实时合成。
 * 依赖：three.min.js → i18n.js → bgm.js → kit.js → touch.js → strings.js → data.js → game.js
 * 调试：?debug=1 暴露 window.__MS（跳关 / 无敌 / 自动驾驶 / 快速模拟）。
 */
(function () {
  'use strict';
  var D = window.MS_DATA;
  var $ = function (id) { return document.getElementById(id); };
  function T() { return KIT.T.apply(null, arguments); }
  var DEBUG = /[?&]debug=1\b/.test(location.search);
  var FRAME = $('frame');

  /* ============ error surface ============ */
  var errbox = $('errbox');
  function showErr(msg) {
    if (errbox.textContent.length < 1500) { errbox.style.display = 'block'; errbox.textContent += msg + '\n'; }
  }
  window.addEventListener('error', function (e) { showErr('Error: ' + (e.message || e.type)); });
  window.addEventListener('unhandledrejection', function (e) { showErr('Async: ' + (e.reason && e.reason.message || e.reason)); });

  /* ============ helpers ============ */
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function randi(a, b) { return Math.floor(rand(a, b + 1)); }
  function dist2(ax, az, bx, bz) { var dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; }
  function angWrap(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }
  function fmtTime(s) { s = Math.max(0, Math.floor(s)); var m = Math.floor(s / 60), ss = s % 60; return (m < 10 ? '0' : '') + m + ':' + (ss < 10 ? '0' : '') + ss; }
  function segDist2(px, pz, ax, az, bx, bz) {
    var vx = bx - ax, vz = bz - az, wx = px - ax, wz = pz - az;
    var c = vx * vx + vz * vz, t = c > 0 ? clamp((wx * vx + wz * vz) / c, 0, 1) : 0;
    return dist2(px, pz, ax + vx * t, az + vz * t);
  }
  var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var IS_TOUCH = document.body.classList.contains('is-touch');

  /* ============ persistence ============ */
  var store = KIT.store('mecha-strike');
  var SAVE = {
    best: +store.get('best', 0) || 0,
    maxLevel: clamp(+store.get('maxLevel', 0) || 0, 0, 24),
    diff: clamp(+store.get('diff', 1) || 0, 0, 2),
    quality: store.get('quality', 'auto'),
    shake: store.get('shake', true) !== false
  };
  if (['auto', 'high', 'medium', 'low'].indexOf(SAVE.quality) < 0) SAVE.quality = 'auto';
  var DIFFS = [
    { key: 'easy',   lives: 5, dmg: 0.6,  hp: 0.8, d: -0.12 },
    { key: 'normal', lives: 3, dmg: 1.0,  hp: 1.0, d: 0 },
    { key: 'hard',   lives: 2, dmg: 1.35, hp: 1.2, d: 0.15 }
  ];
  function diff() { return DIFFS[G.diff]; }

  /* ============ AUDIO: all synthesized ============
   * 信号链：voices → sfxGain / bgmGain → master → 压缩器(防爆音) → 输出
   *        sfx / bgm 另有一路湿信号送入卷积混响，爆炸与枪声有空间感
   * 战斗音效按屏幕位置做左右声像 + 距离衰减（at()）
   */
  var AU = window.AMG_AUDIO || { vol: 0.8, muted: false };
  var AudioSys = {
    ctx: null, master: null, sfxGain: null, bgmGain: null, verb: null, noiseBuf: null, bgmTimer: null, bgmStep: 0,
    nextNoteTime: 0, bossMode: false, transpose: 0, gates: {}, laser: null, _v: -1, _pv: null,
    init: function () {
      if (this.ctx) { if (this.ctx.state === 'suspended') { try { this.ctx.resume(); } catch (e) {} } return; }
      var ac = KIT.audio ? KIT.audio() : null; if (!ac) return;
      this.ctx = ac;
      this.master = ac.createGain();
      var comp = ac.createDynamicsCompressor();
      comp.threshold.value = -16; comp.knee.value = 20; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.22;
      this.master.connect(comp); comp.connect(ac.destination);
      this.sfxGain = ac.createGain(); this.sfxGain.gain.value = 0.85; this.sfxGain.connect(this.master);
      this.bgmGain = ac.createGain(); this.bgmGain.gain.value = 0.3; this.bgmGain.connect(this.master);
      var len = ac.sampleRate * 2; this.noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
      var d = this.noiseBuf.getChannelData(0); for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      // 混响：程序生成的指数衰减噪声脉冲响应
      try {
        this.verb = ac.createConvolver(); this.verb.buffer = this.impulse(1.8, 2.8);
        var wet = ac.createGain(); wet.gain.value = 0.55; this.verb.connect(wet); wet.connect(this.master);
        var sS = ac.createGain(); sS.gain.value = 0.22; this.sfxGain.connect(sS); sS.connect(this.verb);
        var sB = ac.createGain(); sB.gain.value = 0.16; this.bgmGain.connect(sB); sB.connect(this.verb);
      } catch (e) { this.verb = null; }
      this.sync();
    },
    impulse: function (sec, decay) {
      var ac = this.ctx, n = Math.floor(ac.sampleRate * sec), buf = ac.createBuffer(2, n, ac.sampleRate);
      for (var c = 0; c < 2; c++) {
        var ch = buf.getChannelData(c);
        for (var i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
      }
      return buf;
    },
    sync: function () {
      if (!this.master) return;
      var v = AU.muted ? 0 : AU.vol;
      if (v !== this._v) { this._v = v; this.master.gain.value = v; if (AU.muted) this.laserOff(); }
    },
    ok: function () { return this.ctx && !AU.muted && !SIM.on; },
    gate: function (k, ms) { var n = performance.now(); if (this.gates[k] && n - this.gates[k] < ms) return false; this.gates[k] = n; return true; },
    now: function () { return this.ctx ? this.ctx.currentTime : 0; },
    // 世界坐标 → 声像（-1 左 .. 1 右）与距离衰减
    at: function (pos) {
      if (!pos || typeof camera === 'undefined' || !camera) return { p: 0, g: 1 };
      var v = this._pv || (this._pv = new THREE.Vector3());
      v.set(pos.x, pos.y || 0, pos.z).project(camera);
      var d = player ? Math.sqrt(dist2(pos.x, pos.z, player.group.position.x, player.group.position.z)) : 0;
      return { p: clamp(v.x * 0.8, -0.9, 0.9), g: clamp(1.15 - d / 90, 0.38, 1) };
    },
    env: function (g, t, a, peak, dur) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + a + dur);
    },
    // 末端接线：可选声像
    out: function (node, o) {
      var dest = o.dest || this.sfxGain;
      if (o.pan && this.ctx.createStereoPanner) {
        var pn = this.ctx.createStereoPanner(); pn.pan.value = clamp(o.pan, -1, 1); node.connect(pn); pn.connect(dest);
      } else node.connect(dest);
    },
    tone: function (o) {
      if (!this.ok()) return;
      var ac = this.ctx, t = (o.when || 0) + this.now(), osc = ac.createOscillator(), g = ac.createGain(), dur = o.dur || 0.15;
      osc.type = o.type || 'square'; osc.frequency.setValueAtTime(o.freq, t);
      if (o.detune) osc.detune.value = o.detune;
      if (o.freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(o.freqEnd, 1), t + dur);
      this.env(g, t, o.attack || 0.004, o.vol || 0.2, dur);
      var node = osc;
      if (o.lp) { var f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; f.Q.value = o.Q || 0.8; osc.connect(f); node = f; }
      node.connect(g); this.out(g, o); osc.start(t); osc.stop(t + (o.attack || 0.004) + dur + 0.1);
    },
    noise: function (o) {
      if (!this.ok()) return;
      var ac = this.ctx, t = (o.when || 0) + this.now(), src = ac.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
      var f = ac.createBiquadFilter(); f.type = o.type || 'lowpass'; f.frequency.setValueAtTime(o.filterFreq || 1000, t); f.Q.value = o.Q || 0.7;
      if (o.filterEnd) f.frequency.exponentialRampToValueAtTime(Math.max(o.filterEnd, 20), t + (o.dur || 0.3));
      var g = ac.createGain(); this.env(g, t, o.attack || 0.003, o.vol || 0.3, o.dur || 0.3);
      src.connect(f); f.connect(g); this.out(g, o); src.start(t, Math.random() * 1.5); src.stop(t + (o.attack || 0.003) + (o.dur || 0.3) + 0.15);
    },
    /* ---- 玩家武器 ---- */
    shoot: function () {
      if (!this.gate('shoot', 38)) return;
      var f = rand(1000, 1260);
      this.tone({ type: 'sawtooth', freq: f, freqEnd: 240, dur: 0.07, vol: 0.07 });
      this.tone({ type: 'square', freq: f * 0.5, freqEnd: 130, dur: 0.06, vol: 0.035, detune: rand(-25, 25) });
      this.tone({ type: 'sine', freq: 190, freqEnd: 70, dur: 0.09, vol: 0.11 });
      this.noise({ dur: 0.035, vol: 0.05, filterFreq: 4200, type: 'highpass' });
    },
    scatter: function () {
      this.noise({ dur: 0.26, vol: 0.34, filterFreq: 3200, filterEnd: 260 });
      this.tone({ type: 'square', freq: 170, freqEnd: 42, dur: 0.22, vol: 0.22 });
      this.tone({ type: 'sine', freq: 90, freqEnd: 32, dur: 0.3, vol: 0.28 });
      this.noise({ dur: 0.05, vol: 0.09, filterFreq: 2200, type: 'bandpass', Q: 3, when: 0.2 });   // 退壳 / 上膛
      this.tone({ type: 'square', freq: 520, freqEnd: 300, dur: 0.04, vol: 0.05, when: 0.2 });
    },
    plasma: function () {
      this.tone({ type: 'sine', freq: 260, freqEnd: 980, dur: 0.24, vol: 0.17 });
      this.tone({ type: 'sawtooth', freq: 90, freqEnd: 58, dur: 0.28, vol: 0.09, lp: 600 });
      this.tone({ type: 'triangle', freq: 1400, freqEnd: 500, dur: 0.18, vol: 0.05, when: 0.03 });
      this.noise({ dur: 0.18, vol: 0.07, filterFreq: 600, filterEnd: 3000, type: 'bandpass', Q: 2 });
    },
    plasmaBoom: function (pos) {
      if (!this.gate('pboom', 60)) return; var s = this.at(pos);
      this.noise({ dur: 0.42, vol: 0.28 * s.g, filterFreq: 2200, filterEnd: 80, pan: s.p });
      this.tone({ type: 'sine', freq: 200, freqEnd: 36, dur: 0.36, vol: 0.26 * s.g, pan: s.p });
      this.tone({ type: 'sawtooth', freq: 700, freqEnd: 90, dur: 0.3, vol: 0.06 * s.g, lp: 1400, pan: s.p });
    },
    // 光矛：双锯齿微失谐 + 低音 + 颤动 LFO + 高频嘶声
    laserOn: function () {
      if (!this.ok() || this.laser) return;
      var c = this.ctx, t = c.currentTime;
      var o = c.createOscillator(), o2 = c.createOscillator(), sub = c.createOscillator(), lfo = c.createOscillator();
      var f = c.createBiquadFilter(), g = c.createGain(), trem = c.createGain(), lg = c.createGain();
      o.type = 'sawtooth'; o.frequency.value = 150; o2.type = 'sawtooth'; o2.frequency.value = 150; o2.detune.value = 14;
      sub.type = 'sine'; sub.frequency.value = 75; lfo.type = 'sine'; lfo.frequency.value = 13;
      f.type = 'lowpass'; f.frequency.value = 1500; f.Q.value = 5;
      trem.gain.value = 0.8; lg.gain.value = 0.2; lfo.connect(lg); lg.connect(trem.gain);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.075, t + 0.06);
      o.connect(f); o2.connect(f); f.connect(trem); sub.connect(trem); trem.connect(g); g.connect(this.sfxGain);
      var hs = c.createBufferSource(); hs.buffer = this.noiseBuf; hs.loop = true;
      var hf = c.createBiquadFilter(); hf.type = 'bandpass'; hf.frequency.value = 3600; hf.Q.value = 1.2;
      var hg = c.createGain(); hg.gain.value = 0.18; hs.connect(hf); hf.connect(hg); hg.connect(g);
      o.start(t); o2.start(t); sub.start(t); lfo.start(t); hs.start(t, Math.random());
      this.laser = { o: o, o2: o2, sub: sub, lfo: lfo, hs: hs, g: g, f: f };
      // 起手“咔”
      this.tone({ type: 'square', freq: 900, freqEnd: 200, dur: 0.06, vol: 0.08 });
    },
    laserOff: function () {
      if (!this.laser) return;
      var L = this.laser, t = this.now(); this.laser = null;
      try {
        L.g.gain.cancelScheduledValues(t); L.g.gain.setTargetAtTime(0.0001, t, 0.035);
        [L.o, L.o2, L.sub, L.lfo, L.hs].forEach(function (n) { n.stop(t + 0.25); });
      } catch (e) {}
    },
    laserMod: function (heat, sweep) {
      if (!this.laser) return; var t = this.now(), L = this.laser;
      var f0 = 150 + heat * 120 + (sweep || 0) * 28;      // 随过热升调，随扫射摆动轻微颤音
      L.o.frequency.setTargetAtTime(f0, t, 0.05); L.o2.frequency.setTargetAtTime(f0, t, 0.05); L.sub.frequency.setTargetAtTime(f0 / 2, t, 0.05);
      L.f.frequency.setTargetAtTime(1500 + heat * 1700, t, 0.05); L.lfo.frequency.setTargetAtTime(13 + heat * 22, t, 0.1);
    },
    missile: function () {
      this.noise({ dur: 0.55, vol: 0.17, filterFreq: 500, filterEnd: 3400, type: 'bandpass', Q: 1.4 });
      this.tone({ type: 'sawtooth', freq: 110, freqEnd: 440, dur: 0.45, vol: 0.06, lp: 1200 });
      this.noise({ dur: 0.08, vol: 0.12, filterFreq: 1400, type: 'bandpass', Q: 2 });
      this.tone({ type: 'sine', freq: 140, freqEnd: 50, dur: 0.18, vol: 0.18 });
    },
    dash: function () {
      this.noise({ dur: 0.26, vol: 0.14, filterFreq: 600, filterEnd: 3000, type: 'bandpass', Q: 1.2 });
      this.tone({ type: 'sine', freq: 420, freqEnd: 120, dur: 0.2, vol: 0.09 });
    },
    /* ---- 命中 / 爆炸 ---- */
    enemyShoot: function (pos) {
      if (!this.gate('es', 60)) return; var s = this.at(pos);
      this.tone({ type: 'square', freq: rand(300, 360), freqEnd: 110, dur: 0.1, vol: 0.045 * s.g, pan: s.p });
      this.tone({ type: 'sine', freq: 150, freqEnd: 70, dur: 0.08, vol: 0.05 * s.g, pan: s.p });
    },
    hit: function (pos, crit) {
      if (!this.gate('hit', 30)) return; var s = this.at(pos), f = rand(1500, 2300);
      this.tone({ type: 'triangle', freq: f, freqEnd: f * 0.7, dur: 0.045, vol: 0.055 * s.g, pan: s.p });
      this.noise({ dur: 0.02, vol: 0.04 * s.g, filterFreq: 5000, type: 'highpass', pan: s.p });
      if (crit) {
        this.tone({ type: 'sine', freq: 2600, dur: 0.16, vol: 0.07 * s.g, pan: s.p });
        this.tone({ type: 'sine', freq: 3900, dur: 0.12, vol: 0.04 * s.g, pan: s.p, when: 0.02 });
      }
    },
    hurt: function () {
      this.tone({ type: 'sawtooth', freq: 190, freqEnd: 55, dur: 0.2, vol: 0.24, lp: 1200 });
      this.noise({ dur: 0.16, vol: 0.16, filterFreq: 1000, filterEnd: 200 });
      this.tone({ type: 'sine', freq: 70, freqEnd: 35, dur: 0.25, vol: 0.28 });
    },
    explosion: function (big, pos) {
      if (!big && !this.gate('boom', 45)) return; var s = this.at(pos), v = s.g, p = s.p;
      this.noise({ dur: big ? 1.0 : 0.5, vol: (big ? 0.5 : 0.28) * v, filterFreq: big ? 3200 : 2000, filterEnd: 60, pan: p });
      this.tone({ type: 'sine', freq: big ? 150 : 120, freqEnd: 28, dur: big ? 0.95 : 0.46, vol: (big ? 0.55 : 0.3) * v, pan: p });
      this.tone({ type: 'triangle', freq: big ? 280 : 210, freqEnd: 50, dur: 0.22, vol: 0.12 * v, pan: p });
      for (var i = 0; i < (big ? 5 : 2); i++)        // 碎片噼啪
        this.noise({ dur: 0.04, vol: 0.07 * v, filterFreq: rand(2500, 6000), type: 'highpass', when: 0.1 + i * rand(0.07, 0.12), pan: p });
      if (big) {
        this.noise({ dur: 1.4, vol: 0.2 * v, filterFreq: 320, filterEnd: 40, when: 0.05, pan: p });
        this.tone({ type: 'sine', freq: 55, freqEnd: 24, dur: 1.2, vol: 0.3 * v, when: 0.04, pan: p });
      }
    },
    spawnWarn: function () {
      this.tone({ type: 'square', freq: 520, freqEnd: 600, dur: 0.09, vol: 0.08, lp: 2400 }); this.tone({ type: 'square', freq: 520, freqEnd: 600, dur: 0.09, vol: 0.08, when: 0.13, lp: 2400 });
      this.tone({ type: 'sine', freq: 260, dur: 0.25, vol: 0.1, when: 0.26 });
    },
    uiClick: function () { this.tone({ type: 'triangle', freq: 760, freqEnd: 1000, dur: 0.07, vol: 0.12 }); this.noise({ dur: 0.02, vol: 0.04, filterFreq: 5000, type: 'highpass' }); },
    pickup: function () {
      if (!this.gate('pick', 60)) return;
      this.tone({ type: 'triangle', freq: 880, freqEnd: 1760, dur: 0.12, vol: 0.12 });
      this.tone({ type: 'sine', freq: 2640, dur: 0.14, vol: 0.05, when: 0.05 });
    },
    oneUp: function () { var s = this; [659, 784, 1318, 1046, 1175, 1568].forEach(function (f, i) { s.tone({ type: 'square', freq: f, dur: 0.1, vol: 0.08, when: i * 0.08, lp: 3000 }); }); },
    overdrive: function () {
      this.tone({ type: 'sawtooth', freq: 110, freqEnd: 880, dur: 0.65, vol: 0.16, lp: 2400 });
      this.noise({ dur: 0.75, vol: 0.2, filterFreq: 400, filterEnd: 5000, type: 'bandpass', Q: 1.5 });
      this.tone({ type: 'sine', freq: 60, freqEnd: 30, dur: 0.5, vol: 0.3, when: 0.55 });
      this.noise({ dur: 0.4, vol: 0.2, filterFreq: 3000, filterEnd: 200, when: 0.55 });
    },
    slamCharge: function () { this.tone({ type: 'sawtooth', freq: 80, freqEnd: 260, dur: 0.7, vol: 0.12, lp: 900 }); },
    shockwave: function (pos) {
      var s = this.at(pos);
      this.noise({ dur: 0.9, vol: 0.4 * s.g, filterFreq: 700, filterEnd: 40, pan: s.p });
      this.tone({ type: 'sine', freq: 75, freqEnd: 26, dur: 0.8, vol: 0.48 * s.g, pan: s.p });
      this.noise({ dur: 0.3, vol: 0.18 * s.g, filterFreq: 4000, filterEnd: 400, pan: s.p });
    },
    laserCharge: function () {
      this.tone({ type: 'sine', freq: 200, freqEnd: 1700, dur: 0.85, vol: 0.1 });
      this.tone({ type: 'sawtooth', freq: 100, freqEnd: 850, dur: 0.85, vol: 0.05, lp: 1800 });
    },
    bossBeam: function () {
      this.noise({ dur: 1.6, vol: 0.2, filterFreq: 1200, type: 'bandpass', Q: 3 });
      this.tone({ type: 'sawtooth', freq: 70, dur: 1.6, vol: 0.12, lp: 500 });
      this.tone({ type: 'sine', freq: 45, dur: 1.6, vol: 0.2 });
    },
    mortar: function () { if (!this.gate('mortar', 90)) return; this.tone({ type: 'sine', freq: 1500, freqEnd: 500, dur: 0.6, vol: 0.05 }); this.noise({ dur: 0.1, vol: 0.08, filterFreq: 800, type: 'bandpass', Q: 2 }); },
    unlock: function () { var s = this; [523, 659, 784, 1046, 1318].forEach(function (f, i) { s.tone({ type: 'triangle', freq: f, dur: 0.22, vol: 0.12, when: i * 0.07 }); s.tone({ type: 'sine', freq: f * 2, dur: 0.18, vol: 0.04, when: i * 0.07 }); }); },
    upgrade: function () { var s = this; [523, 659, 784, 1046].forEach(function (f, i) { s.tone({ type: 'triangle', freq: f, dur: 0.24, vol: 0.14, when: i * 0.09 }); s.tone({ type: 'sine', freq: f * 2, dur: 0.2, vol: 0.05, when: i * 0.09 }); }); },
    levelClear: function () { var s = this; [392, 523, 659, 784, 1046].forEach(function (f, i) { s.tone({ type: 'square', freq: f, dur: 0.28, vol: 0.09, when: i * 0.11, lp: 3200 }); s.tone({ type: 'triangle', freq: f / 2, dur: 0.3, vol: 0.1, when: i * 0.11 }); }); },
    lifeLost: function () { var s = this; [440, 349, 262].forEach(function (f, i) { s.tone({ type: 'sawtooth', freq: f, dur: 0.27, vol: 0.1, when: i * 0.15, lp: 1400 }); }); },
    gameOver: function () { var s = this; [330, 262, 196, 131].forEach(function (f, i) { s.tone({ type: 'sawtooth', freq: f, dur: 0.45, vol: 0.12, when: i * 0.22, lp: 1100 }); }); },
    victory: function () { var s = this; [523, 659, 784, 1046, 784, 1046, 1318].forEach(function (f, i) { s.tone({ type: 'triangle', freq: f, dur: 0.36, vol: 0.13, when: i * 0.13 }); s.tone({ type: 'sine', freq: f * 2, dur: 0.3, vol: 0.05, when: i * 0.13 }); }); },
    bossAlarm: function () {
      for (var i = 0; i < 3; i++) {
        this.tone({ type: 'square', freq: 196, dur: 0.16, vol: 0.13, when: i * 0.34, lp: 1800 }); this.tone({ type: 'square', freq: 147, dur: 0.16, vol: 0.13, when: i * 0.34 + 0.17, lp: 1800 });
        this.tone({ type: 'sine', freq: 49, dur: 0.3, vol: 0.2, when: i * 0.34 });
      }
    },
    /* --- BGM：16 步×4 小节循环，分战区移调；平时 = 低音 + 琶音 + 垫音，Boss 战 = 加速 + 军鼓 + 主旋律 --- */
    startBGM: function () {
      if (!this.ctx || this.bgmTimer) return;
      this.bgmStep = 0; this.nextNoteTime = this.now() + 0.1;
      var s = this; this.bgmTimer = setInterval(function () { s.schedule(); }, 90);
    },
    stopBGM: function () { if (this.bgmTimer) { clearInterval(this.bgmTimer); this.bgmTimer = null; } },
    schedule: function () {
      if (!this.ctx) return;
      var spb = this.bossMode ? 0.15 : 0.19;
      while (this.nextNoteTime < this.now() + 0.28) {
        this.playStep(this.bgmStep, this.nextNoteTime);
        this.nextNoteTime += spb; this.bgmStep = (this.bgmStep + 1) % 64;
      }
    },
    playStep: function (step, t) {
      if (!this.ok()) return;
      var k = Math.pow(2, this.transpose / 12), when = t - this.now(), boss = this.bossMode, d = this.bgmGain;
      var bar = Math.floor(step / 16), s16 = step % 16, spb = boss ? 0.15 : 0.19;
      var roots = [55, 43.65, 65.41, 49], root = roots[bar] * k;
      // 垫音：每小节一次和弦（根音 / 小三度 / 五度），缓起缓落
      if (s16 === 0) {
        [1, 1.19, 1.5].forEach(function (r, i) {
          AudioSys.tone({ type: 'sawtooth', freq: root * 4 * r, dur: spb * 15, attack: spb * 5, vol: 0.022, when: when, dest: d, lp: 700 + (boss ? 500 : 0), detune: (i - 1) * 9 });
        });
      }
      // 低音：八分音符 + 每半小节的八度跳
      if (s16 % 2 === 0) {
        var f = root * (s16 === 14 ? 1.5 : 1) * (s16 === 6 || s16 === 10 ? 2 : 1);
        this.tone({ type: 'sawtooth', freq: f, dur: 0.16, vol: 0.14, when: when, dest: d, lp: 1100 });
        this.tone({ type: 'square', freq: f * 2, dur: 0.1, vol: 0.04, when: when, dest: d, lp: 1800 });
      }
      // 底鼓
      if (s16 === 0 || s16 === 8 || (boss && (s16 === 4 || s16 === 12)) || (!boss && s16 === 10 && bar % 2 === 1)) {
        this.tone({ type: 'sine', freq: 135, freqEnd: 38, dur: 0.16, vol: 0.32, when: when, dest: d });
        this.noise({ dur: 0.02, vol: 0.06, filterFreq: 1500, type: 'bandpass', when: when, dest: d });
      }
      // 军鼓
      if (s16 === 12 || (boss && s16 === 4)) {
        this.noise({ dur: 0.11, vol: boss ? 0.12 : 0.07, filterFreq: 1900, type: 'bandpass', Q: 0.9, when: when, dest: d });
        this.tone({ type: 'triangle', freq: 210, freqEnd: 120, dur: 0.08, vol: 0.09, when: when, dest: d });
      }
      // 踩镲：闭镲 16 分，反拍开镲
      if (s16 % 2 === 1) this.noise({ dur: 0.025, vol: boss ? 0.04 : 0.028, filterFreq: 7500, type: 'highpass', when: when, dest: d });
      if (s16 % 4 === 2) this.noise({ dur: 0.09, vol: 0.045, filterFreq: 6500, type: 'highpass', when: when, dest: d });
      // 琶音
      var arp = [440, 523.25, 659.25, 880, 349.23, 440, 523.25, 698.46, 523.25, 659.25, 783.99, 1046.5, 392, 493.88, 587.33, 783.99];
      if (s16 % 2 === 1 && Math.random() < 0.75) {
        this.tone({ type: 'triangle', freq: arp[bar * 4 + (s16 >> 1) % 4] * k * (boss ? 1.0 : 0.5), dur: 0.12, vol: 0.05, when: when, dest: d });
      }
      // 主旋律（A 小调五声音阶，Boss 战满播，平时只在后两小节偶尔点缀）
      var LEAD = [
        [0, -1, -1, 3, -1, 5, -1, -1, 7, -1, 5, -1, 3, -1, 0, -1],
        [-1, 0, -1, 3, 5, -1, 7, -1, 10, -1, 7, -1, 5, 3, -1, -1],
        [7, -1, -1, 10, -1, 12, -1, 10, 7, -1, -1, 5, -1, 3, -1, -1],
        [5, -1, 7, -1, 10, -1, 12, 15, -1, 12, -1, 10, 7, -1, 5, -1]
      ];
      var ln = LEAD[bar][s16];
      if (ln >= 0 && (boss || (bar >= 2 && Math.random() < 0.45))) {
        var lf = 440 * k * Math.pow(2, ln / 12) * (boss ? 1 : 0.5);
        this.tone({ type: boss ? 'square' : 'triangle', freq: lf, dur: 0.22, vol: boss ? 0.045 : 0.035, attack: 0.01, when: when, dest: d, lp: boss ? 3000 : 2200, detune: boss ? rand(-6, 6) : 0 });
      }
    }
  };

  /* ============ THREE setup ============ */
  var ARENA = 62;
  var scene, camera, renderer, sun, envTex;
  var MATS = {};
  var VIEW = { w: 960, h: 540 };
  var QUALITY = { high: { pr: 1.5, shadow: true }, medium: { pr: 1.1, shadow: true }, low: { pr: 0.8, shadow: false } };
  var qLevel = SAVE.quality === 'auto' ? (IS_TOUCH ? 'medium' : 'high') : SAVE.quality;

  function makeCanvasTex(w, h, draw) {
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    var t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  }
  function frameSize() {
    VIEW.w = Math.max(200, Math.round(FRAME.clientWidth));
    VIEW.h = Math.max(150, Math.round(FRAME.clientHeight));
  }
  function applyQuality() {
    if (!renderer) return;
    var q = QUALITY[qLevel];
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pr));
    if (sun) sun.castShadow = q.shadow;
    renderer.setSize(VIEW.w, VIEW.h);
  }
  function onResize() {
    if (!renderer) return;
    frameSize();
    camera.aspect = VIEW.w / VIEW.h; camera.updateProjectionMatrix();
    renderer.setSize(VIEW.w, VIEW.h);
  }
  function initThree() {
    frameSize();
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0a1622, 0.0055);
    camera = new THREE.PerspectiveCamera(55, VIEW.w / VIEW.h, 0.1, 600);
    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    if ('outputColorSpace' in renderer && THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    $('game').appendChild(renderer.domElement);
    var pmrem = new THREE.PMREMGenerator(renderer);
    envTex = pmrem.fromScene(new THREE.RoomEnvironment(), 0.04).texture;

    scene.add(new THREE.HemisphereLight(0x9fd8ff, 0x1a1410, 0.55));
    sun = new THREE.DirectionalLight(0xffe0b3, 1.35);
    sun.position.set(38, 55, -22); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -80; sun.shadow.camera.right = 80; sun.shadow.camera.top = 80; sun.shadow.camera.bottom = -80;
    sun.shadow.camera.far = 180; sun.shadow.bias = -0.0006;
    scene.add(sun);
    var rim = new THREE.DirectionalLight(0x3fa9ff, 0.5); rim.position.set(-40, 24, 40); scene.add(rim);
    applyQuality();

    MATS.hull = new THREE.MeshStandardMaterial({ color: 0x3d4c5c, metalness: 0.85, roughness: 0.34, envMap: envTex, envMapIntensity: 0.9 });
    MATS.hullDk = new THREE.MeshStandardMaterial({ color: 0x232c36, metalness: 0.8, roughness: 0.45, envMap: envTex, envMapIntensity: 0.8 });
    MATS.accent = new THREE.MeshStandardMaterial({ color: 0xff7a1a, metalness: 0.4, roughness: 0.42, envMap: envTex, envMapIntensity: 0.5 });
    MATS.cyanGlow = new THREE.MeshStandardMaterial({ color: 0x0b2b33, emissive: 0x29e6ff, emissiveIntensity: 2.4, metalness: 0.2, roughness: 0.4 });
    MATS.amberGlow = new THREE.MeshStandardMaterial({ color: 0x33230b, emissive: 0xffb02e, emissiveIntensity: 2.2, metalness: 0.2, roughness: 0.4 });
    MATS.glass = new THREE.MeshStandardMaterial({ color: 0x9feaff, metalness: 0.1, roughness: 0.06, transparent: true, opacity: 0.82, envMap: envTex, envMapIntensity: 1.6 });
    MATS.missileBody = new THREE.MeshStandardMaterial({ color: 0xd8dee6, metalness: 0.7, roughness: 0.3, envMap: envTex, envMapIntensity: 0.8 });
    MATS.enemyDk = new THREE.MeshStandardMaterial({ color: 0x2a2027, metalness: 0.75, roughness: 0.5, envMap: envTex, envMapIntensity: 0.7 });
  }

  /* ============ arena ============ */
  var obstacles = [];
  var arenaGroup = null, arenaMats = [], arenaSector = -1;
  var texCache = {};
  function groundTexture() {
    if (texCache.ground) return texCache.ground;
    texCache.ground = makeCanvasTex(256, 256, function (g) {
      g.fillStyle = '#39434e'; g.fillRect(0, 0, 256, 256);
      for (var i = 0; i < 2600; i++) { g.fillStyle = 'rgba(' + (Math.random() < 0.5 ? '0,0,0' : '255,255,255') + ',' + (Math.random() * 0.05) + ')'; g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); }
      g.strokeStyle = 'rgba(120,200,230,0.20)'; g.lineWidth = 2; g.strokeRect(1, 1, 254, 254);
      g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 7; g.beginPath(); g.moveTo(0, 128); g.lineTo(256, 128); g.stroke();
      g.fillStyle = 'rgba(255,176,46,0.16)'; g.fillRect(108, 120, 40, 16);
    });
    texCache.ground.repeat.set(16, 16);
    return texCache.ground;
  }
  function buildingTexture(key, base, lit) {
    if (texCache[key]) return texCache[key];
    texCache[key] = makeCanvasTex(128, 256, function (g) {
      g.fillStyle = base; g.fillRect(0, 0, 128, 256);
      for (var y = 10; y < 240; y += 16) for (var x = 8; x < 116; x += 14) {
        g.fillStyle = Math.random() < 0.42 ? lit : 'rgba(8,14,20,0.85)';
        g.fillRect(x, y, 9, 10);
      }
    });
    return texCache[key];
  }
  function hexCss(c) { return '#' + ('000000' + c.toString(16)).slice(-6); }
  function buildArena(sectorIdx, seedLevel) {
    if (arenaGroup) {
      scene.remove(arenaGroup);
      arenaGroup.traverse(function (o) { if (o.geometry) o.geometry.dispose(); });
      arenaMats.forEach(function (m) { m.dispose(); });
    }
    arenaMats = []; obstacles = []; arenaSector = sectorIdx;
    function mat(m) { arenaMats.push(m); return m; }
    arenaGroup = new THREE.Group(); scene.add(arenaGroup);
    var S = D.SECTORS[sectorIdx], theme = S.theme;

    var ground = new THREE.Mesh(new THREE.PlaneGeometry(ARENA * 2 + 26, ARENA * 2 + 26),
      mat(new THREE.MeshLambertMaterial({ map: groundTexture(), color: theme.ground })));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; arenaGroup.add(ground);

    var ring = new THREE.Mesh(new THREE.RingGeometry(7.4, 8.1, 48),
      mat(new THREE.MeshBasicMaterial({ color: theme.accent, transparent: true, opacity: 0.5, side: THREE.DoubleSide })));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; arenaGroup.add(ring);
    arenaGroup.userData.ring = ring;

    var fenceMat = mat(new THREE.MeshBasicMaterial({ color: theme.accent, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false }));
    var postMat = mat(new THREE.MeshStandardMaterial({ color: 0x1c2733, emissive: theme.accent, emissiveIntensity: 0.7, metalness: 0.7, roughness: 0.4 }));
    [[0, -ARENA, 1], [0, ARENA, 1], [-ARENA, 0, 0], [ARENA, 0, 0]].forEach(function (w) {
      var f = new THREE.Mesh(new THREE.PlaneGeometry(ARENA * 2, 5.4), fenceMat);
      f.position.set(w[0], 2.7, w[1]); f.rotation.y = w[2] ? 0 : Math.PI / 2; arenaGroup.add(f);
    });
    var postGeo = new THREE.BoxGeometry(0.7, 6.4, 0.7);
    for (var px = -ARENA; px <= ARENA; px += 15.5) for (var pz = -ARENA; pz <= ARENA; pz += 15.5) {
      if (Math.abs(px) !== ARENA && Math.abs(pz) !== ARENA) continue;
      var post = new THREE.Mesh(postGeo, postMat); post.position.set(px, 3.2, pz); arenaGroup.add(post);
    }

    // cover props (deterministic per level)
    var r = D.rng(1234 + seedLevel * 777);
    var blockMat = mat(new THREE.MeshLambertMaterial({ color: theme.block }));
    var blockGlow = mat(new THREE.MeshStandardMaterial({ color: 0x10161c, emissive: theme.accent, emissiveIntensity: 1.1, metalness: 0.4, roughness: 0.5 }));
    var crystalMat = mat(new THREE.MeshStandardMaterial({ color: theme.accent, emissive: theme.accent, emissiveIntensity: 0.45, metalness: 0.1, roughness: 0.15, envMap: envTex, envMapIntensity: 1.2 }));
    var kinds = [], tw = 0;
    Object.keys(S.props).forEach(function (k) { kinds.push(k); tw += S.props[k]; });
    function pickKind() { var x = r() * tw; for (var i = 0; i < kinds.length; i++) { x -= S.props[kinds[i]]; if (x <= 0) return kinds[i]; } return kinds[0]; }
    function rr(a, b) { return a + r() * (b - a); }
    var spots = [];
    for (var i = 0; i < 20 && spots.length < 15; i++) {
      var a = r() * Math.PI * 2, rad = 20 + r() * 36;
      var x = Math.cos(a) * rad, z = Math.sin(a) * rad;
      if (Math.abs(x) < 12 && Math.abs(z) < 12) continue;
      var ok = true; for (var j = 0; j < spots.length; j++) if (dist2(x, z, spots[j].x, spots[j].z) < 130) { ok = false; break; }
      if (!ok) continue;
      spots.push({ x: x, z: z });
      var kind = pickKind();
      var grp = new THREE.Group(); grp.position.set(x, 0, z); grp.rotation.y = r() * Math.PI;
      if (kind === 'crate') {
        var n = 1 + Math.floor(r() * 3);
        for (var k = 0; k < n; k++) {
          var s = rr(2.6, 4.2);
          var b = new THREE.Mesh(new THREE.BoxGeometry(s, s * 0.72, s), blockMat);
          b.position.set(rr(-1, 1), s * 0.36 + k * s * 0.7, rr(-1, 1)); b.rotation.y = rr(-0.3, 0.3);
          b.castShadow = b.receiveShadow = true; grp.add(b);
          var strip = new THREE.Mesh(new THREE.BoxGeometry(s * 1.01, 0.16, s * 1.01), blockGlow);
          strip.position.copy(b.position); strip.position.y += s * 0.2; grp.add(strip);
        }
        obstacles.push({ x: x, z: z, r: 3.4 });
      } else if (kind === 'pillar') {
        var h = rr(5, 9);
        var p = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.6, h, 10), blockMat);
        p.position.y = h / 2; p.castShadow = p.receiveShadow = true; grp.add(p);
        var cap = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 0.5, 10), blockGlow); cap.position.y = h + 0.25; grp.add(cap);
        var orb = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10), blockGlow); orb.position.y = h + 1.0; grp.add(orb);
        obstacles.push({ x: x, z: z, r: 2.3 });
      } else if (kind === 'wall') {
        var wl = new THREE.Mesh(new THREE.BoxGeometry(rr(6, 9), rr(2.6, 3.6), 1.1), blockMat);
        wl.position.y = 1.6; wl.castShadow = wl.receiveShadow = true; grp.add(wl);
        obstacles.push({ x: x, z: z, r: 3.6 });
      } else if (kind === 'tank') {
        var th = rr(2.6, 3.8);
        var tk = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.3, th, 16), blockMat);
        tk.position.y = th / 2; tk.castShadow = tk.receiveShadow = true; grp.add(tk);
        var dome = new THREE.Mesh(new THREE.SphereGeometry(2.1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), blockMat);
        dome.position.y = th; dome.castShadow = true; grp.add(dome);
        var band = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.14, 6, 24), blockGlow);
        band.rotation.x = Math.PI / 2; band.position.y = th * 0.6; grp.add(band);
        obstacles.push({ x: x, z: z, r: 2.7 });
      } else { // crystal cluster
        var nc = 3 + Math.floor(r() * 3);
        for (var c = 0; c < nc; c++) {
          var ch = rr(2.6, 6.2), cr = rr(0.7, 1.3);
          var cn = new THREE.Mesh(new THREE.ConeGeometry(cr, ch, 5), crystalMat);
          cn.position.set(rr(-1.2, 1.2), ch / 2 - 0.2, rr(-1.2, 1.2)); cn.rotation.set(rr(-0.3, 0.3), rr(0, 3), rr(-0.3, 0.3));
          cn.castShadow = true; grp.add(cn);
        }
        obstacles.push({ x: x, z: z, r: 2.5 });
      }
      arenaGroup.add(grp);
    }

    // skyline
    var btex1 = buildingTexture('b1', '#141d28', '#ffd489'), btex2 = buildingTexture('b2', '#101820', '#7fd8ff');
    var bm1 = mat(new THREE.MeshLambertMaterial({ map: btex1, color: 0x8a97a5 })), bm2 = mat(new THREE.MeshLambertMaterial({ map: btex2, color: 0x8a97a5 }));
    for (var bIdx = 0; bIdx < 26; bIdx++) {
      var ba = (bIdx / 26) * Math.PI * 2 + rr(-0.08, 0.08), br = rr(105, 150);
      var bw = rr(14, 26), bh = rr(18, 52);
      var bm = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bw), bIdx % 2 ? bm1 : bm2);
      bm.position.set(Math.cos(ba) * br, bh / 2 - 1, Math.sin(ba) * br); bm.rotation.y = rr(0, Math.PI);
      arenaGroup.add(bm);
    }
    scene.background = new THREE.Color(theme.sky);
    scene.fog.color.set(theme.sky);
    Ambient.setType(S.ambient);
    var css = $('frame'); if (css) css.style.setProperty('--accent3d', hexCss(theme.accent));
  }
  function collideObstacles(pos, radius) {
    for (var i = 0; i < obstacles.length; i++) {
      var o = obstacles[i], d2 = dist2(pos.x, pos.z, o.x, o.z), rr = o.r + radius;
      if (d2 < rr * rr && d2 > 0.0001) {
        var d = Math.sqrt(d2), push = (rr - d);
        pos.x += (pos.x - o.x) / d * push; pos.z += (pos.z - o.z) / d * push;
      }
    }
    pos.x = clamp(pos.x, -ARENA + radius, ARENA - radius);
    pos.z = clamp(pos.z, -ARENA + radius, ARENA - radius);
  }
  function hitsObstacle(x, z, pad) {
    for (var o = 0; o < obstacles.length; o++) {
      var ob = obstacles[o], rr = ob.r + (pad || 0);
      if (dist2(x, z, ob.x, ob.z) < rr * rr) return true;
    }
    return false;
  }

  /* ============ ambient particles (dust / embers / snow …) ============ */
  var softTex = null;
  function getSoftTex() {
    if (softTex) return softTex;
    var c = document.createElement('canvas'); c.width = c.height = 64;
    var g = c.getContext('2d'), grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.4, 'rgba(255,255,255,0.6)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
    softTex = new THREE.CanvasTexture(c); return softTex;
  }
  var AMBIENT_TYPES = {
    dust:  { color: 0xd9b48a, size: 0.45, vx: 1.6, vy: 0.1, jit: 0.4, op: 0.5 },
    ember: { color: 0xff7a2e, size: 0.38, vx: 0.4, vy: 2.6, jit: 0.8, op: 0.9 },
    mote:  { color: 0x29e6ff, size: 0.32, vx: 0.2, vy: 0.4, jit: 0.6, op: 0.8 },
    snow:  { color: 0xffffff, size: 0.42, vx: 1.2, vy: -3.2, jit: 0.6, op: 0.75 },
    spore: { color: 0x9dff4a, size: 0.34, vx: 0.3, vy: 0.9, jit: 0.7, op: 0.75 },
    spark: { color: 0xff6a8a, size: 0.3, vx: 0.0, vy: 1.4, jit: 1.6, op: 0.85 }
  };
  var Ambient = {
    n: 300, pts: null, pos: null, vel: null, cfg: AMBIENT_TYPES.dust,
    init: function () {
      this.pos = new Float32Array(this.n * 3); this.vel = new Float32Array(this.n * 3);
      var geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
      this.mat = new THREE.PointsMaterial({ size: 0.4, map: getSoftTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.6 });
      this.pts = new THREE.Points(geo, this.mat); this.pts.frustumCulled = false; scene.add(this.pts);
    },
    setType: function (type) {
      if (!this.pts) return;
      var c = this.cfg = AMBIENT_TYPES[type] || AMBIENT_TYPES.dust;
      this.mat.color.set(c.color); this.mat.size = c.size; this.mat.opacity = c.op;
      for (var i = 0; i < this.n; i++) {
        var i3 = i * 3;
        this.pos[i3] = rand(-45, 45); this.pos[i3 + 1] = rand(0, 26); this.pos[i3 + 2] = rand(-45, 45);
        this.vel[i3] = c.vx + rand(-c.jit, c.jit); this.vel[i3 + 1] = c.vy + rand(-c.jit, c.jit) * 0.5; this.vel[i3 + 2] = rand(-c.jit, c.jit);
      }
    },
    update: function (dt, cx, cz) {
      if (!this.pts) return;
      for (var i = 0; i < this.n; i++) {
        var i3 = i * 3;
        this.pos[i3] += this.vel[i3] * dt; this.pos[i3 + 1] += this.vel[i3 + 1] * dt; this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
        var dx = this.pos[i3] - cx, dz = this.pos[i3 + 2] - cz;
        if (dx > 45) this.pos[i3] -= 90; else if (dx < -45) this.pos[i3] += 90;
        if (dz > 45) this.pos[i3 + 2] -= 90; else if (dz < -45) this.pos[i3 + 2] += 90;
        if (this.pos[i3 + 1] > 26) this.pos[i3 + 1] = 0.2; else if (this.pos[i3 + 1] < 0.1) this.pos[i3 + 1] = 25.8;
      }
      this.pts.geometry.attributes.position.needsUpdate = true;
    }
  };

  /* ============ mech builders ============ */
  function box(w, h, d, mat, x, y, z, parent, shadow) {
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x || 0, y || 0, z || 0);
    if (shadow !== false) { m.castShadow = true; m.receiveShadow = true; }
    parent.add(m); return m;
  }
  function cyl(rt, rb, h, mat, x, y, z, parent, seg) {
    var m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 14), mat);
    m.position.set(x || 0, y || 0, z || 0); m.castShadow = true;
    parent.add(m); return m;
  }
  function sph(r, mat, x, y, z, parent, seg) {
    var m = new THREE.Mesh(new THREE.SphereGeometry(r, seg || 14, seg ? Math.max(6, seg - 4) : 10), mat);
    m.position.set(x || 0, y || 0, z || 0); m.castShadow = true;
    parent.add(m); return m;
  }
  function mz(parent, x, y, z) { var o = new THREE.Object3D(); o.position.set(x, y, z); parent.add(o); return o; }
  var glowCache = {};
  function glowMat(color) {
    if (!glowCache[color]) glowCache[color] = new THREE.MeshStandardMaterial({ color: 0x220808, emissive: color, emissiveIntensity: 2.6, metalness: 0.2, roughness: 0.4 });
    return glowCache[color];
  }
  function enemyMats(hullColor, glowColor, elite) {
    return {
      hull: new THREE.MeshStandardMaterial({ color: hullColor, metalness: 0.8, roughness: 0.4, envMap: envTex, envMapIntensity: 0.8, emissive: elite ? 0x4a3000 : 0x000000 }),
      dk: new THREE.MeshStandardMaterial({ color: 0x2a2027, metalness: 0.75, roughness: 0.5, envMap: envTex, envMapIntensity: 0.7 }),
      glow: glowMat(elite ? 0xffc21a : glowColor),
      base: elite ? 0x4a3000 : 0x000000
    };
  }

  function buildLeg(side) {
    var hip = new THREE.Group(); hip.position.set(0.62 * side, 2.05, 0);
    box(0.52, 1.05, 0.62, MATS.hullDk, 0, -0.5, 0, hip);
    box(0.6, 0.34, 0.78, MATS.accent, 0, -0.28, 0.02, hip);
    var shin = new THREE.Group(); shin.position.set(0, -1.02, 0); hip.add(shin);
    box(0.44, 1.0, 0.5, MATS.hull, 0, -0.48, 0, shin);
    box(0.5, 0.62, 0.34, MATS.hullDk, 0, -0.55, 0.16, shin);
    box(0.66, 0.22, 1.05, MATS.hullDk, 0, -1.02, 0.14, shin);
    box(0.68, 0.1, 0.3, MATS.accent, 0, -1.06, 0.55, shin);
    hip.userData.shin = shin;
    return hip;
  }
  function buildPlayerMech() {
    var g = new THREE.Group();
    var hips = new THREE.Group(); g.add(hips);
    box(1.5, 0.55, 0.95, MATS.hullDk, 0, 2.15, 0, hips);
    box(1.1, 0.3, 0.6, MATS.accent, 0, 2.32, 0.3, hips);
    var legL = buildLeg(-1), legR = buildLeg(1); hips.add(legL); hips.add(legR);
    var torso = new THREE.Group(); torso.position.y = 2.42; g.add(torso);
    box(2.0, 1.35, 1.25, MATS.hull, 0, 0.62, 0, torso);
    box(2.2, 0.4, 1.35, MATS.hullDk, 0, 1.22, 0, torso);
    box(1.2, 0.7, 0.3, MATS.hullDk, 0, 0.66, 0.68, torso);
    box(0.92, 0.42, 0.14, MATS.glass, 0, 0.72, 0.86, torso, false);
    box(0.5, 0.16, 0.2, MATS.cyanGlow, 0, 1.28, -0.2, torso, false);
    var head = new THREE.Group(); head.position.set(0, 1.62, 0); torso.add(head);
    box(0.62, 0.5, 0.62, MATS.hull, 0, 0.1, 0, head);
    box(0.5, 0.14, 0.06, MATS.cyanGlow, 0, 0.14, 0.32, head, false);
    var fin = box(0.08, 0.55, 0.3, MATS.accent, 0, 0.5, -0.05, head); fin.rotation.x = -0.25;
    box(0.05, 0.7, 0.05, MATS.hullDk, 0.34, 0.45, 0, head, false);
    box(1.5, 1.1, 0.5, MATS.hullDk, 0, 0.75, -0.85, torso);
    cyl(0.17, 0.24, 0.55, MATS.hullDk, -0.5, 0.15, -0.95, torso);
    cyl(0.17, 0.24, 0.55, MATS.hullDk, 0.5, 0.15, -0.95, torso);
    var flameMat = new THREE.MeshBasicMaterial({ color: 0x54d8ff, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false });
    var flameGeo = new THREE.ConeGeometry(0.2, 1.1, 10); flameGeo.translate(0, -0.55, 0); flameGeo.rotateX(Math.PI);
    var flL = new THREE.Mesh(flameGeo, flameMat); flL.position.set(-0.5, -0.18, -0.95); torso.add(flL);
    var flR = new THREE.Mesh(flameGeo, flameMat.clone()); flR.position.set(0.5, -0.18, -0.95); torso.add(flR);
    [-0.55, 0.55].forEach(function (px) {
      box(0.42, 0.5, 0.7, MATS.hull, px, 1.5, -0.8, torso);
      for (var i = 0; i < 3; i++) cyl(0.07, 0.07, 0.76, MATS.hullDk, px - 0.12 + (i % 3) * 0.12, 1.5, -0.8, torso);
    });
    function buildArm(side, isCannon) {
      var sh = new THREE.Group(); sh.position.set(1.28 * side, 1.12, 0); torso.add(sh);
      box(0.78, 0.62, 0.85, side < 0 ? MATS.accent : MATS.hull, 0, 0.08, 0, sh);
      box(0.5, 0.85, 0.5, MATS.hullDk, 0, -0.55, 0, sh);
      if (isCannon) {
        var arm = new THREE.Group(); arm.position.set(0, -1.0, 0.1); sh.add(arm);
        box(0.44, 0.5, 1.5, MATS.hull, 0, 0, 0.45, arm);
        var barrel = cyl(0.11, 0.11, 1.15, MATS.hullDk, 0, 0.06, 1.35, arm); barrel.rotation.x = Math.PI / 2;
        var tip = cyl(0.16, 0.16, 0.3, MATS.accent, 0, 0.06, 1.85, arm); tip.rotation.x = Math.PI / 2;
        sh.userData.muzzle = mz(arm, 0, 0.06, 2.05);
      } else {
        box(0.34, 1.0, 0.75, MATS.hull, 0, -1.05, 0.18, sh);
        box(0.1, 0.7, 0.5, MATS.cyanGlow, 0, -1.05, 0.6, sh, false);
        var barrel2 = cyl(0.08, 0.08, 0.9, MATS.hullDk, 0, -0.95, 0.75, sh); barrel2.rotation.x = Math.PI / 2;
        sh.userData.muzzle = mz(sh, 0, -0.95, 1.25);
      }
      return sh;
    }
    var armR = buildArm(1, true), armL = buildArm(-1, false);
    g.userData = { legL: legL, legR: legR, torso: torso, head: head, armL: armL, armR: armR,
      muzzleR: armR.userData.muzzle, muzzleL: armL.userData.muzzle, flameL: flL, flameR: flR, hips: hips };
    return g;
  }
  function buildDrone(m) {
    var g = new THREE.Group();
    sph(0.62, m.hull, 0, 0, 0, g, 16);
    sph(0.24, m.glow, 0, 0, 0.48, g, 12);
    var ringM = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.09, 8, 24), m.dk); ringM.rotation.x = Math.PI / 2; g.add(ringM);
    g.userData.ring = ringM; g.userData.rotors = [];
    var rotorMat = MATS.rotor || (MATS.rotor = new THREE.MeshBasicMaterial({ color: 0xcfd8e2, transparent: true, opacity: 0.4 }));
    for (var i = 0; i < 4; i++) {
      var a = i * Math.PI / 2 + Math.PI / 4;
      var armB = box(0.5, 0.08, 0.08, m.dk, Math.cos(a) * 0.8, 0.28, Math.sin(a) * 0.8, g); armB.rotation.y = -a;
      var rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 10), rotorMat);
      rotor.position.set(Math.cos(a) * 1.05, 0.34, Math.sin(a) * 1.05); g.add(rotor); g.userData.rotors.push(rotor);
    }
    var gun = cyl(0.07, 0.07, 0.7, m.dk, 0, -0.42, 0.3, g); gun.rotation.x = Math.PI / 2.4;
    g.userData.muzzle = mz(g, 0, -0.62, 0.62);
    sph(0.09, m.glow, 0, -0.55, 0, g, 8);
    return g;
  }
  function buildEnemyLeg(side, m) {
    var hip = new THREE.Group(); hip.position.set(0.55 * side, 1.95, 0);
    box(0.46, 0.95, 0.55, m.dk, 0, -0.46, 0, hip);
    var shin = new THREE.Group(); shin.position.set(0, -0.92, 0); hip.add(shin);
    box(0.4, 0.9, 0.44, m.hull, 0, -0.42, 0, shin);
    box(0.6, 0.2, 0.95, m.dk, 0, -0.92, 0.1, shin);
    hip.userData.shin = shin;
    return hip;
  }
  function buildWalker(m) {
    var g = new THREE.Group();
    var legL = buildEnemyLeg(-1, m), legR = buildEnemyLeg(1, m); g.add(legL); g.add(legR);
    box(1.35, 0.5, 0.9, m.dk, 0, 2.0, 0, g);
    var torso = new THREE.Group(); torso.position.y = 2.25; g.add(torso);
    box(1.8, 1.2, 1.15, m.hull, 0, 0.6, 0, torso);
    box(0.8, 0.34, 0.1, m.glow, 0, 0.62, 0.6, torso, false);
    box(0.55, 0.42, 0.55, m.dk, 0, 1.45, 0, torso);
    box(0.4, 0.1, 0.05, m.glow, 0, 1.48, 0.29, torso, false);
    [-1, 1].forEach(function (side) {
      box(0.66, 0.55, 0.75, m.hull, 1.18 * side, 1.05, 0, torso);
      var barrel = cyl(0.09, 0.09, 1.1, m.dk, 1.18 * side, 0.72, 0.8, torso); barrel.rotation.x = Math.PI / 2;
    });
    g.userData = { legL: legL, legR: legR, torso: torso, muzzle: mz(torso, 0, 0.72, 1.4) };
    return g;
  }
  function buildTurret(m) {
    var g = new THREE.Group();
    cyl(1.5, 1.9, 0.7, m.dk, 0, 0.35, 0, g, 8);
    cyl(1.0, 1.3, 0.9, m.hull, 0, 1.1, 0, g, 8);
    var headG = new THREE.Group(); headG.position.y = 1.85; g.add(headG);
    box(1.5, 0.8, 1.4, m.hull, 0, 0.2, 0, headG);
    box(0.6, 0.2, 0.08, m.glow, 0, 0.3, 0.72, headG, false);
    [-0.35, 0.35].forEach(function (px) { var b = cyl(0.1, 0.1, 1.7, m.dk, px, 0.25, 1.2, headG); b.rotation.x = Math.PI / 2; });
    cyl(0.03, 0.03, 1.1, m.dk, 0.6, 0.95, -0.4, headG);
    var beacon = sph(0.11, m.glow, 0.6, 1.55, -0.4, headG, 8);
    g.userData = { head: headG, muzzle: mz(headG, 0, 0.25, 2.1), beacon: beacon };
    return g;
  }
  function buildKamikaze(m) {
    var g = new THREE.Group();
    sph(0.55, m.hull, 0, 0, 0, g, 12);
    var core = sph(0.3, m.glow, 0, 0, 0.35, g, 10);
    for (var i = 0; i < 6; i++) {
      var a = i / 6 * Math.PI * 2;
      var sp = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.6, 5), m.dk);
      sp.position.set(Math.cos(a) * 0.55, Math.sin(a) * 0.55, -0.1); sp.rotation.z = a - Math.PI / 2; g.add(sp);
    }
    var fin = box(0.08, 0.5, 0.6, m.dk, 0, 0.45, -0.4, g); fin.rotation.x = 0.4;
    g.userData = { core: core, muzzle: mz(g, 0, 0, 0.6) };
    return g;
  }
  function buildArtillery(m) {
    var g = new THREE.Group();
    [-1, 1].forEach(function (s) { box(0.7, 0.8, 3.0, m.dk, 1.05 * s, 0.4, 0, g); });
    box(1.7, 0.9, 2.4, m.hull, 0, 1.1, 0, g);
    var tur = new THREE.Group(); tur.position.y = 1.65; g.add(tur);
    box(1.3, 0.7, 1.3, m.hull, 0, 0.3, -0.2, tur);
    var barrel = cyl(0.22, 0.28, 2.6, m.dk, 0, 1.1, 0.5, tur); barrel.rotation.x = Math.PI / 4.2;
    box(0.5, 0.14, 0.1, m.glow, 0, 0.42, 0.46, tur, false);
    g.userData = { head: tur, muzzle: mz(tur, 0, 2.0, 1.4) };
    return g;
  }
  /* --- bosses --- */
  function buildHammer(m) {
    var g = buildWalker(m), torso = g.userData.torso;
    box(0.9, 0.7, 1.0, m.dk, -1.4, 1.6, 0, torso);
    var arm = new THREE.Group(); arm.position.set(1.45, 0.9, 0.2); torso.add(arm);
    cyl(0.18, 0.18, 1.4, m.dk, 0, -0.3, 0.5, arm).rotation.x = Math.PI / 2;
    box(1.0, 1.0, 1.4, m.hull, 0, -0.3, 1.4, arm);
    box(1.06, 0.2, 1.46, m.glow, 0, 0.0, 1.4, arm, false);
    g.userData.hammer = arm;
    return g;
  }
  function buildHive(m) {
    var g = new THREE.Group();
    sph(1.6, m.hull, 0, 0, 0, g, 18);
    sph(0.55, m.glow, 0, -0.1, 1.35, g, 12);
    var ring = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.18, 8, 32), m.dk); ring.rotation.x = Math.PI / 2; g.add(ring);
    g.userData.ring = ring; g.userData.rotors = [];
    var rotorMat = MATS.rotor || (MATS.rotor = new THREE.MeshBasicMaterial({ color: 0xcfd8e2, transparent: true, opacity: 0.4 }));
    for (var i = 0; i < 6; i++) {
      var a = i / 6 * Math.PI * 2;
      box(1.2, 0.14, 0.14, m.dk, Math.cos(a) * 2.0, 0.5, Math.sin(a) * 2.0, g).rotation.y = -a;
      var rotor = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.06, 12), rotorMat);
      rotor.position.set(Math.cos(a) * 2.7, 0.62, Math.sin(a) * 2.7); g.add(rotor); g.userData.rotors.push(rotor);
      var pod = sph(0.32, m.glow, Math.cos(a + 0.5) * 1.3, -1.3, Math.sin(a + 0.5) * 1.3, g, 8);
      pod.scale.y = 1.5;
    }
    g.userData.muzzle = mz(g, 0, -0.6, 1.6);
    return g;
  }
  function buildBastion(m) {
    var g = new THREE.Group();
    cyl(3.4, 3.9, 1.2, m.dk, 0, 0.6, 0, g, 6);
    cyl(2.5, 3.0, 1.6, m.hull, 0, 1.9, 0, g, 6);
    var head = new THREE.Group(); head.position.y = 3.0; g.add(head);
    var dome = new THREE.Mesh(new THREE.SphereGeometry(2.0, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), m.hull); dome.castShadow = true; head.add(dome);
    for (var i = 0; i < 4; i++) {
      var a = i / 4 * Math.PI * 2;
      var b = cyl(0.2, 0.26, 2.6, m.dk, Math.sin(a) * 1.6, 0.6, Math.cos(a) * 1.6, head); b.rotation.x = Math.PI / 2; b.rotation.z = -a;
      b.position.set(Math.sin(a) * 2.3, 0.6, Math.cos(a) * 2.3);
      b.lookAt(head.position.x + Math.sin(a) * 9, 0.6, Math.cos(a) * 9); b.rotateX(Math.PI / 2);
      sph(0.22, m.glow, Math.sin(a) * 3.4, 0.6, Math.cos(a) * 3.4, head, 8);
    }
    sph(0.7, m.glow, 0, 2.0, 0, head, 12);
    g.userData = { head: head, muzzle: mz(head, 0, 0.6, 3.4) };
    return g;
  }
  function buildTitan(m) {
    var g = buildWalker(m), torso = g.userData.torso;
    [-1, 1].forEach(function (side) {
      box(1.0, 0.7, 1.1, m.dk, 1.35 * side, 1.75, -0.1, torso);
      for (var i = 0; i < 4; i++) box(0.16, 0.16, 0.5, m.glow, 1.35 * side - 0.3 + (i % 2) * 0.6, 1.95, 0.42, torso, false);
      var spike = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.8, 6), m.dk); spike.position.set(1.35 * side, 2.4, -0.1); torso.add(spike);
    });
    box(2.3, 0.5, 0.4, m.glow, 0, 0.15, 0.62, torso, false);
    box(0.1, 0.9, 0.5, m.glow, 0, 2.15, 0, torso, false);
    return g;
  }
  function buildPhantom(m) {
    var g = buildWalker(m), torso = g.userData.torso;
    [-1, 1].forEach(function (side) {
      var wing = box(0.08, 1.6, 2.4, m.dk, 0.7 * side, 1.4, -1.1, torso); wing.rotation.z = 0.5 * side; wing.rotation.x = -0.4;
      box(0.06, 1.3, 0.12, m.glow, 0.75 * side, 1.4, -2.1, torso, false).rotation.z = 0.5 * side;
    });
    var blade = box(0.1, 0.3, 2.2, m.glow, -1.25, 0.5, 1.3, torso, false); blade.rotation.y = 0.1;
    return g;
  }
  function buildScorpion(m) {
    var g = new THREE.Group();
    box(2.4, 0.9, 3.2, m.hull, 0, 1.4, 0, g);
    box(1.6, 0.7, 1.2, m.dk, 0, 1.6, 1.8, g);
    box(0.9, 0.16, 0.08, m.glow, 0, 1.75, 2.42, g, false);
    var legs = [];
    for (var i = 0; i < 3; i++) for (var s = -1; s <= 1; s += 2) {
      var hip = new THREE.Group(); hip.position.set(1.2 * s, 1.4, -0.9 + i * 0.9); g.add(hip);
      var l = box(1.6, 0.22, 0.22, m.dk, 0.8 * s, 0, 0, hip); l.rotation.z = -0.5 * s;
      var f = box(0.2, 1.4, 0.2, m.dk, 1.5 * s, -0.7, 0, hip); f.rotation.z = 0.2 * s;
      hip.userData.side = s; hip.userData.phase = i * 2.1 + (s > 0 ? Math.PI : 0); legs.push(hip);
    }
    [-1, 1].forEach(function (s) {
      var claw = box(0.5, 0.5, 1.6, m.hull, 0.9 * s, 1.3, 2.9, g); claw.rotation.y = -0.25 * s;
      box(0.5, 0.2, 0.7, m.dk, 1.1 * s, 1.3, 3.8, g);
    });
    var tail = new THREE.Group(); tail.position.set(0, 1.8, -1.6); g.add(tail);
    var segs = 5, prev = tail;
    for (var k = 0; k < segs; k++) {
      var seg = new THREE.Group(); seg.position.set(0, k === 0 ? 0 : 0.9, k === 0 ? 0 : -0.1); seg.rotation.x = -0.42; prev.add(seg);
      sph(0.48 - k * 0.05, m.hull, 0, 0.45, 0, seg, 10);
      prev = seg;
    }
    var sting = sph(0.4, m.glow, 0, 1.1, 0.2, prev, 10);
    g.userData = { legs: legs, tail: tail, muzzle: mz(sting, 0, 0, 0) };
    return g;
  }
  function buildThor(m) {
    var g = buildWalker(m), torso = g.userData.torso;
    var cannon = new THREE.Group(); cannon.position.set(0, 2.1, -0.3); torso.add(cannon);
    cyl(0.42, 0.5, 3.0, m.dk, 0, 0, 0.8, cannon).rotation.x = Math.PI / 2;
    for (var i = 0; i < 3; i++) {
      var coil = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.1, 6, 18), m.glow); coil.position.z = i * 0.7 + 0.1; cannon.add(coil);
    }
    sph(0.36, m.glow, 0, 0, 2.35, cannon, 10);
    g.userData.muzzle = mz(cannon, 0, 0, 2.5);
    g.userData.cannon = cannon;
    return g;
  }
  function buildOverlord(m) {
    var g = buildTitan(m), torso = g.userData.torso;
    for (var i = 0; i < 5; i++) {
      var sp = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.9, 5), m.glow);
      sp.position.set(-0.6 + i * 0.3, 2.7 + (i === 2 ? 0.3 : 0), 0); torso.add(sp);
    }
    var halo = new THREE.Group(); halo.position.y = 4.3; g.add(halo);
    var ring1 = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.08, 6, 40), m.glow); ring1.rotation.x = Math.PI / 2; halo.add(ring1);
    var orbs = [];
    for (var k = 0; k < 4; k++) orbs.push(sph(0.35, m.glow, 0, 0, 0, halo, 10));
    g.userData.halo = halo; g.userData.orbs = orbs;
    return g;
  }
  var BOSS_BUILDERS = { hammer: buildHammer, hive: buildHive, bastion: buildBastion, titan: buildTitan, phantom: buildPhantom, scorpion: buildScorpion, thor: buildThor, overlord: buildOverlord };
  var BOSS_SCALE = { hammer: 2.0, hive: 1.0, bastion: 1.0, titan: 2.05, phantom: 1.55, scorpion: 1.25, thor: 1.9, overlord: 2.4 };

  /* ============ FX ============ */
  var Particles = {
    cap: 2000, n: 0, points: null, pos: null, col: null, size: null,
    vel: null, life: null, maxLife: null, grav: null, drag: null, _c: null, _c2: null,
    init: function () {
      this.vel = new Float32Array(this.cap * 3); this.life = new Float32Array(this.cap);
      this.maxLife = new Float32Array(this.cap); this.grav = new Float32Array(this.cap); this.drag = new Float32Array(this.cap);
      var geo = new THREE.BufferGeometry();
      this.pos = new Float32Array(this.cap * 3); this.col = new Float32Array(this.cap * 3); this.size = new Float32Array(this.cap);
      geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
      geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
      var mat = new THREE.ShaderMaterial({
        uniforms: { uMap: { value: getSoftTex() } },
        vertexShader: 'attribute float aSize; varying vec3 vColor;\nvoid main(){ vColor = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = aSize * (260.0 / -mv.z); gl_Position = projectionMatrix * mv; }',
        fragmentShader: 'uniform sampler2D uMap; varying vec3 vColor;\nvoid main(){ vec4 t = texture2D(uMap, gl_PointCoord); gl_FragColor = vec4(vColor, t.a); }',
        vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
      });
      this.points = new THREE.Points(geo, mat); this.points.frustumCulled = false; scene.add(this.points);
      for (var i = 0; i < this.cap; i++) this.pos[i * 3 + 1] = -100;
      this._c = new THREE.Color(); this._c2 = new THREE.Color();
    },
    spawn: function (x, y, z, o) {
      if (SIM.on) return;
      var count = o.count || 12, col = this._c.set(o.color || 0xffa63e);
      var col2 = o.color2 ? this._c2.set(o.color2) : col;
      for (var i = 0; i < count; i++) {
        var idx = this.n % this.cap; this.n++;
        var i3 = idx * 3;
        this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
        var th = Math.random() * Math.PI * 2, ph = Math.acos(rand(-1, 1)), sp = rand(o.speedMin || 1, o.speed || 7);
        this.vel[i3] = Math.sin(ph) * Math.cos(th) * sp;
        this.vel[i3 + 1] = Math.cos(ph) * sp * (o.upBias || 0.7) + (o.up || 0);
        this.vel[i3 + 2] = Math.sin(ph) * Math.sin(th) * sp;
        if (o.dir) { this.vel[i3] += o.dir.x; this.vel[i3 + 2] += o.dir.z; }
        var c = Math.random() < 0.5 ? col : col2;
        this.col[i3] = c.r; this.col[i3 + 1] = c.g; this.col[i3 + 2] = c.b;
        this.size[idx] = rand(o.sizeMin || 0.5, o.size || 1.3);
        this.maxLife[idx] = this.life[idx] = rand(o.lifeMin || 0.3, o.life || 0.8);
        this.grav[idx] = o.gravity !== undefined ? o.gravity : 6;
        this.drag[idx] = o.drag !== undefined ? o.drag : 1.6;
      }
    },
    update: function (dt) {
      for (var i = 0; i < this.cap; i++) {
        if (this.life[i] <= 0) continue;
        this.life[i] -= dt;
        var i3 = i * 3;
        if (this.life[i] <= 0) { this.pos[i3 + 1] = -100; this.size[i] = 0; continue; }
        var dr = Math.max(0, 1 - this.drag[i] * dt);
        this.vel[i3] *= dr; this.vel[i3 + 2] *= dr;
        this.vel[i3 + 1] = this.vel[i3 + 1] * dr - this.grav[i] * dt;
        this.pos[i3] += this.vel[i3] * dt; this.pos[i3 + 1] += this.vel[i3 + 1] * dt; this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
        if (this.pos[i3 + 1] < 0.06) { this.pos[i3 + 1] = 0.06; this.vel[i3 + 1] *= -0.4; }
        var f = this.life[i] / this.maxLife[i];
        this.size[i] = Math.max(0.05, this.size[i] * (0.4 + 0.6 * f) + dt * 0.4 * f);
      }
      var a = this.points.geometry.attributes;
      a.position.needsUpdate = true; a.color.needsUpdate = true; a.aSize.needsUpdate = true;
    },
    clear: function () { for (var i = 0; i < this.cap; i++) { this.life[i] = 0; this.pos[i * 3 + 1] = -100; this.size[i] = 0; } }
  };
  var Rings = {
    pool: [],
    init: function () {
      var geo = new THREE.RingGeometry(0.85, 1, 40);
      for (var i = 0; i < 16; i++) {
        var m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
        m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m);
        this.pool.push({ mesh: m, life: 0, max: 1, maxR: 10 });
      }
    },
    burst: function (x, z, color, maxR, dur) {
      if (SIM.on) return;
      var best = this.pool[0];
      for (var i = 0; i < this.pool.length; i++) { if (this.pool[i].life <= 0) { best = this.pool[i]; break; } if (this.pool[i].life < best.life) best = this.pool[i]; }
      best.life = best.max = dur || 0.5; best.maxR = maxR || 10;
      best.mesh.position.set(x, 0.25, z); best.mesh.material.color.set(color); best.mesh.visible = true;
    },
    update: function (dt) {
      for (var i = 0; i < this.pool.length; i++) {
        var r = this.pool[i];
        if (r.life <= 0) continue; r.life -= dt;
        var f = 1 - r.life / r.max, s = 0.5 + f * r.maxR;
        r.mesh.scale.set(s, s, s); r.mesh.material.opacity = 0.75 * (1 - f);
        if (r.life <= 0) r.mesh.visible = false;
      }
    }
  };
  var Flashes = {
    pool: [],
    init: function () { for (var i = 0; i < 5; i++) { var L = new THREE.PointLight(0xffa63e, 0, 30, 2); scene.add(L); this.pool.push({ light: L, life: 0 }); } },
    burst: function (pos, color, intensity, dist) {
      if (SIM.on) return;
      var best = this.pool[0];
      for (var i = 0; i < this.pool.length; i++) if (this.pool[i].life < best.life) best = this.pool[i];
      best.light.position.copy(pos); best.light.color.set(color);
      best.light.intensity = intensity || 2.4; best.light.distance = dist || 30; best.life = 0.16;
    },
    update: function (dt) {
      for (var i = 0; i < this.pool.length; i++) {
        var f = this.pool[i];
        if (f.life > 0) { f.life -= dt; if (f.life <= 0) f.light.intensity = 0; else f.light.intensity *= Math.pow(0.001, dt / 0.16); }
      }
    }
  };
  var DmgNums = {
    pool: [], layer: null, v: null,
    init: function () {
      this.layer = $('dmgnums'); this.v = new THREE.Vector3();
      for (var i = 0; i < 40; i++) {
        var d = document.createElement('div'); d.className = 'dmgnum'; d.style.display = 'none';
        this.layer.appendChild(d);
        this.pool.push({ el: d, life: 0, pos: new THREE.Vector3(), vy: 0 });
      }
    },
    show: function (worldPos, text, cls) {
      if (SIM.on) return;
      var best = null;
      for (var i = 0; i < this.pool.length; i++) { var p = this.pool[i]; if (p.life <= 0) { best = p; break; } if (!best || p.life < best.life) best = p; }
      best.life = 0.85; best.pos.copy(worldPos); best.pos.x += rand(-0.7, 0.7); best.pos.y += rand(0, 0.5); best.vy = 3.4;
      best.el.textContent = text; best.el.className = 'dmgnum' + (cls ? ' ' + cls : ''); best.el.style.display = 'block';
    },
    update: function (dt) {
      var v = this.v;
      for (var i = 0; i < this.pool.length; i++) {
        var p = this.pool[i];
        if (p.life <= 0) continue; p.life -= dt;
        if (p.life <= 0) { p.el.style.display = 'none'; continue; }
        p.pos.y += p.vy * dt; p.vy *= (1 - 2.2 * dt);
        v.copy(p.pos).project(camera);
        if (v.z > 1) { p.el.style.display = 'none'; continue; }
        p.el.style.display = 'block';
        var x = (v.x * 0.5 + 0.5) * VIEW.w, y = (-v.y * 0.5 + 0.5) * VIEW.h;
        p.el.style.transform = 'translate(' + (x - 14) + 'px,' + (y - 10) + 'px)';
        p.el.style.opacity = String(clamp(p.life / 0.4, 0, 1));
      }
    },
    clear: function () { for (var i = 0; i < this.pool.length; i++) { this.pool[i].life = 0; this.pool[i].el.style.display = 'none'; } }
  };
  /* ground telegraphs: danger circles + lines */
  var Decals = {
    circles: [], lines: [],
    init: function () {
      var cg = new THREE.CircleGeometry(1, 40), rg = new THREE.RingGeometry(0.92, 1, 48), lg = new THREE.PlaneGeometry(1, 1);
      lg.translate(0, 0.5, 0);
      for (var i = 0; i < 28; i++) {
        var g = new THREE.Group(); g.visible = false; g.rotation.x = -Math.PI / 2; g.position.y = 0.06;
        var fill = new THREE.Mesh(cg, new THREE.MeshBasicMaterial({ color: 0xff3040, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
        var edge = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xff3040, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
        g.add(fill); g.add(edge); scene.add(g);
        this.circles.push({ g: g, fill: fill, edge: edge, life: 0, max: 1 });
      }
      for (var k = 0; k < 8; k++) {
        var m = new THREE.Mesh(lg, new THREE.MeshBasicMaterial({ color: 0xff3040, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
        m.rotation.order = 'YXZ'; m.visible = false; scene.add(m);
        this.lines.push({ m: m, life: 0, max: 1 });
      }
    },
    circle: function (x, z, r, dur, color) {
      for (var i = 0; i < this.circles.length; i++) {
        var c = this.circles[i];
        if (c.life > 0) continue;
        c.life = c.max = dur; c.g.visible = !SIM.on; c.g.position.set(x, 0.06, z); c.g.scale.set(r, r, 1);
        c.fill.material.color.set(color || 0xff3040); c.edge.material.color.set(color || 0xff3040);
        return c;
      }
      return null;
    },
    line: function (x, z, ang, len, width, dur, color) {
      for (var i = 0; i < this.lines.length; i++) {
        var L = this.lines[i];
        if (L.life > 0) continue;
        L.life = L.max = dur; L.m.visible = !SIM.on; L.m.material.color.set(color || 0xff3040);
        this.aim(L, x, z, ang, len, width);
        return L;
      }
      return null;
    },
    aim: function (L, x, z, ang, len, width) {
      if (!L) return;
      L.m.position.set(x, 0.07, z); L.m.rotation.set(-Math.PI / 2, ang + Math.PI, 0, 'YXZ');
      L.m.scale.set(width, len, 1);
    },
    free: function (h) { if (!h) return; h.life = 0; if (h.g) h.g.visible = false; if (h.m) h.m.visible = false; },
    update: function (dt) {
      var t = G.time;
      for (var i = 0; i < this.circles.length; i++) {
        var c = this.circles[i]; if (c.life <= 0) continue;
        c.life -= dt; if (c.life <= 0) { c.g.visible = false; continue; }
        var f = 1 - c.life / c.max;
        c.fill.material.opacity = 0.12 + 0.25 * f + Math.sin(t * 24) * 0.05;
        c.edge.material.opacity = 0.6 + Math.sin(t * 20) * 0.3;
      }
      for (var k = 0; k < this.lines.length; k++) {
        var L = this.lines[k]; if (L.life <= 0) continue;
        L.life -= dt; if (L.life <= 0) { L.m.visible = false; continue; }
        L.m.material.opacity = 0.25 + Math.sin(t * 26) * 0.15;
      }
    },
    clear: function () { this.circles.forEach(this.free); this.lines.forEach(this.free); }
  };
  function explosionFX(pos, scale, colorA, colorB) {
    Particles.spawn(pos.x, pos.y, pos.z, { count: Math.round(26 * scale), color: colorA, color2: colorB || 0xffd76a,
      speed: 9 * scale + 3, speedMin: 2, life: 0.9, lifeMin: 0.35, size: 1.5 * scale, sizeMin: 0.6, gravity: 5, up: 2.5 });
    Particles.spawn(pos.x, pos.y, pos.z, { count: Math.round(10 * scale), color: 0x555f6b, color2: 0x2c333c,
      speed: 4 * scale, speedMin: 1, life: 1.3, lifeMin: 0.6, size: 2.4 * scale, sizeMin: 1.2, gravity: -1.5, up: 3.5, drag: 1.1 });
    Rings.burst(pos.x, pos.z, colorA, 9 * scale, 0.5);
    Flashes.burst(pos, colorA, 110 * scale, 36 * scale);
  }
  function shake(v, cap) { if (!SAVE.shake) return; G.shake = Math.min(G.shake + v, cap || 1.1); }

  /* ============ instanced bullet layers ============ */
  var _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s3 = new THREE.Vector3(), _zAxis = new THREE.Vector3(0, 0, 1), _dir = new THREE.Vector3();
  function BulletLayer(cap, geo, haloScale, haloOpacity, oriented) {
    this.cap = cap; this.haloScale = haloScale; this.oriented = oriented;
    this.core = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), cap);
    this.halo = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: haloOpacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), cap);
    var white = new THREE.Color(1, 1, 1);
    for (var i = 0; i < cap; i++) { this.core.setColorAt(i, white); this.halo.setColorAt(i, white); this.core.setMatrixAt(i, _m4.identity()); this.halo.setMatrixAt(i, _m4); }
    this.core.count = 0; this.halo.count = 0;
    this.core.frustumCulled = this.halo.frustumCulled = false;
    scene.add(this.core); scene.add(this.halo);
  }
  BulletLayer.prototype.sync = function (lists) {
    var n = 0;
    for (var l = 0; l < lists.length; l++) {
      var list = lists[l];
      for (var i = 0; i < list.length && n < this.cap; i++) {
        var b = list[i], s = b.size || 1;
        if (this.oriented) { _dir.set(b.vel.x, 0, b.vel.z).normalize(); _q.setFromUnitVectors(_zAxis, _dir); } else _q.identity();
        _m4.compose(b.pos, _q, _s3.set(s, s, s)); this.core.setMatrixAt(n, _m4); this.core.setColorAt(n, b.col);
        var hs = s * this.haloScale;
        _m4.compose(b.pos, _q, _s3.set(hs, hs, hs)); this.halo.setMatrixAt(n, _m4); this.halo.setColorAt(n, b.halo || b.col);
        n++;
      }
    }
    this.core.count = this.halo.count = n;
    this.core.instanceMatrix.needsUpdate = this.halo.instanceMatrix.needsUpdate = true;
    if (this.core.instanceColor) this.core.instanceColor.needsUpdate = true;
    if (this.halo.instanceColor) this.halo.instanceColor.needsUpdate = true;
  };
  var COL = {
    pulse: new THREE.Color(0xc8fbff), pulseH: new THREE.Color(0x2aa8ff),
    od: new THREE.Color(0xfff0b0), odH: new THREE.Color(0xff8a1a),
    pellet: new THREE.Color(0xffe0a0), pelletH: new THREE.Color(0xff7a1a),
    enemy: new THREE.Color(0xffb0a8), enemyH: new THREE.Color(0xff3020),
    homing: new THREE.Color(0xf0c8ff), homingH: new THREE.Color(0xa040ff)
  };
  var bossColCache = {};
  function bossCols(glow) {
    if (!bossColCache[glow]) {
      var h = new THREE.Color(glow), c = h.clone().lerp(new THREE.Color(0xffffff), 0.6);
      bossColCache[glow] = { c: c, h: h };
    }
    return bossColCache[glow];
  }

  /* ============ game state ============ */
  var G = {
    state: 'menu', level: 0, wave: 0, score: 0, kills: 0, time: 0, levelTime: 0, diff: SAVE.diff,
    shake: 0, hitStop: 0, slowT: 0, spawnQueue: [], spawnTimer: 0, waveDelay: 0, bossPhase: false, bossesLeft: 0,
    combo: 0, comboTimer: 0, levelLost: 0, levelHits: 0, timers: [], gen: 0, snap: null, continues: 0, startLevel: 0, endingLevel: false
  };
  var SIM = { on: false };
  // game-time timers (pause-safe, sim-safe). clearField() bumps G.gen so stale timers die.
  function later(t, fn) { G.timers.push({ t: t, fn: fn }); }
  function runTimers(dt) {
    if (!G.timers.length) return;
    var gen = G.gen, list = G.timers; G.timers = [];
    for (var i = 0; i < list.length; i++) {
      if (G.gen !== gen) return;
      list[i].t -= dt;
      if (list[i].t <= 0) list[i].fn(); else G.timers.push(list[i]);
    }
  }

  /* ============ player ============ */
  var player = null;
  var WEAPONS = D.WEAPONS;
  function baseStats() {
    return { dmgMul: 1, rateMul: 1, crit: 0.1, critMul: 2, missileDmg: 60, missileCount: 3, odGain: 1, odDur: 8, leech: 0, regen: 14, magnet: 7 };
  }
  function createPlayer() {
    var g = buildPlayerMech(); scene.add(g);
    player = {
      group: g, hp: 100, maxHp: 100, shield: 0, shieldMax: 0, shieldDelay: 0, energy: 100, energyMax: 100, radius: 1.35, lives: 3,
      fireCd: 0, missileCd: 0, missileCdMax: 3.2, dashCd: 0, dashCdMax: 2.0, dashTime: 0, dashDir: new THREE.Vector3(),
      iframes: 0, invuln: 0, hurtCd: 0, dead: 0, walkCycle: 0, moving: false, speed: 13.5, wIdx: 0,
      weapons: {}, laser: { on: false, heat: 0, over: false, tick: 0 }, od: 0, odTime: 0,
      stats: baseStats(), aim: new THREE.Vector3(0, 0, -10), useAlt: false, lastMove: null, upgrades: {}
    };
    WEAPONS.forEach(function (w) { player.weapons[w.id] = { lv: 1, on: w.unlock === 0 }; });
    var flashMat = new THREE.SpriteMaterial({ map: getSoftTex(), color: 0xaef4ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    var flash = new THREE.Sprite(flashMat); flash.scale.set(1.6, 1.6, 1); scene.add(flash); g.userData.flash = flash;
    // overhead HP bar
    var c = document.createElement('canvas'); c.width = 128; c.height = 22;
    var tex = new THREE.CanvasTexture(c);
    var bar = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, toneMapped: false }));
    bar.scale.set(4.2, 0.72, 1); bar.position.y = 6.3; bar.renderOrder = 5; g.add(bar);
    g.userData.bar = { sprite: bar, canvas: c, tex: tex, key: '' };
    // shield bubble
    var bub = new THREE.Mesh(new THREE.SphereGeometry(2.9, 24, 16), new THREE.MeshBasicMaterial({ color: 0x29e6ff, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }));
    bub.position.y = 2.6; bub.visible = false; g.add(bub); g.userData.bubble = bub;
    // overdrive aura
    var aura = new THREE.Mesh(new THREE.RingGeometry(1.8, 2.6, 40), new THREE.MeshBasicMaterial({ color: 0xffb02e, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    aura.rotation.x = -Math.PI / 2; aura.position.y = 0.08; g.add(aura); g.userData.aura = aura;
    // laser beam meshes
    var lgeo = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true); lgeo.rotateX(Math.PI / 2); lgeo.translate(0, 0, 0.5);
    var beamOuter = new THREE.Mesh(lgeo, new THREE.MeshBasicMaterial({ color: 0x29b6ff, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    var beamCore = new THREE.Mesh(lgeo, new THREE.MeshBasicMaterial({ color: 0xe8fdff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    beamOuter.visible = beamCore.visible = false; scene.add(beamOuter); scene.add(beamCore);
    var fgeo = new THREE.BufferGeometry();
    fgeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, -1, 0, 1, 1, 0, 1]), 3));
    var fan = new THREE.Mesh(fgeo, new THREE.MeshBasicMaterial({ color: 0x29b6ff, transparent: true, opacity: 0.1, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    fan.visible = false; fan.frustumCulled = false; scene.add(fan);
    player.beam = { outer: beamOuter, core: beamCore, fan: fan };
    return player;
  }
  function drawPlayerBar() {
    var b = player.group.userData.bar, p = player;
    var key = Math.ceil(p.hp) + '|' + Math.ceil(p.shield) + '|' + Math.round(p.energy / 5) + '|' + p.maxHp + '|' + p.shieldMax;
    if (b.key === key) return; b.key = key;
    var g = b.canvas.getContext('2d'), f = clamp(p.hp / p.maxHp, 0, 1);
    g.clearRect(0, 0, 128, 22);
    g.fillStyle = 'rgba(4,10,16,0.82)'; g.fillRect(0, 0, 128, 22);
    var hc = f > 0.5 ? '#3dff8e' : (f > 0.25 ? '#ffd23e' : '#ff4655');
    g.fillStyle = hc; g.fillRect(2, 2, 124 * f, 11);
    if (p.shieldMax > 0) { g.fillStyle = 'rgba(41,230,255,0.85)'; g.fillRect(2, 2, 124 * clamp(p.shield / p.shieldMax, 0, 1), 4); }
    g.fillStyle = '#29b6ff'; g.fillRect(2, 15, 124 * clamp(p.energy / p.energyMax, 0, 1), 5);
    g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 1; g.strokeRect(0.5, 0.5, 127, 21);
    for (var i = 1; i < 4; i++) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(2 + 31 * i, 2, 1, 11); }
    b.tex.needsUpdate = true;
  }
  var _wv = new THREE.Vector3();
  function muzzleWorld(alt) {
    var m = alt ? player.group.userData.muzzleL : player.group.userData.muzzleR;
    m.getWorldPosition(_wv); return _wv;
  }
  function damagePlayer(amount, src) {
    var p = player;
    if (!p || p.dead > 0 || p.iframes > 0 || p.invuln > 0 || G.state !== 'playing') return;
    if (DEBUG && DBG.god) return;
    p.shieldDelay = 3;
    if (p.shield > 0) { var ab = Math.min(p.shield, amount); p.shield -= ab; amount -= ab; }
    p.hp -= amount; p.iframes = 0.32; p.hurtCd = 0.3;
    G.levelHits++;
    AudioSys.hurt();
    shake(0.35, 0.8);
    if (!SIM.on) {
      var vig = $('vig'); vig.style.transition = 'none'; vig.style.opacity = '1';
      requestAnimationFrame(function () { vig.style.transition = 'opacity .55s'; vig.style.opacity = '0'; });
      Particles.spawn(p.group.position.x, 2.6, p.group.position.z, { count: 8, color: 0xff5f6e, color2: 0xffb02e, speed: 5, life: 0.4, size: 0.8, gravity: 3 });
      if (amount > 0) DmgNums.show(_v1.set(p.group.position.x, 4.2, p.group.position.z), '-' + Math.round(amount), 'hurt');
    }
    if (p.hp <= 0) { p.hp = 0; playerDie(); }
  }
  function playerDie() {
    var p = player;
    p.dead = 1.9; p.lives--; G.levelLost++;
    stopLaser();
    var pos = p.group.position.clone(); pos.y = 2.4;
    explosionFX(pos, 2.2, 0xff7a1a, 0xffd76a);
    spawnDebris(pos, 0x3d4c5c, 14, 1.3);
    AudioSys.explosion(true); AudioSys.lifeLost();
    p.group.visible = false; shake(1.1);
    if (!REDUCED) G.slowT = 0.5;
    if (p.lives <= 0) {
      p.dead = 99;
      later(1.3, function () { gameOver(false); });
    } else {
      showBanner(T('mechLost'), T('livesLeft', p.lives));
    }
  }
  function respawnPlayer() {
    var p = player, best = null, bestD = -1;
    [[0, 0], [24, 24], [-24, 24], [24, -24], [-24, -24], [0, 30], [0, -30], [30, 0], [-30, 0]].forEach(function (c) {
      if (hitsObstacle(c[0], c[1], 2)) return;
      var md = 1e9;
      enemies.forEach(function (e) { md = Math.min(md, dist2(c[0], c[1], e.group.position.x, e.group.position.z)); });
      if (md > bestD) { bestD = md; best = c; }
    });
    best = best || [0, 0];
    p.group.position.set(best[0], 0, best[1]);
    p.hp = p.maxHp; p.shield = p.shieldMax; p.energy = p.energyMax; p.invuln = 3; p.dead = 0;
    p.group.visible = true;
    clearEnemyFire();
    Rings.burst(best[0], best[1], 0x29e6ff, 12, 0.6);
    Particles.spawn(best[0], 2, best[1], { count: 30, color: 0x29e6ff, color2: 0xffffff, speed: 8, life: 0.7, size: 1.2, gravity: -2, up: 4 });
    AudioSys.unlock();
  }

  /* ============ projectiles ============ */
  var pBullets = [], eShots = [], missiles = [], plasmas = [], mortars = [], shockwaves = [];
  var pLayer = null, eLayer = null, missileGeo = null, plasmaGeo = null, plasmaMat = null, mortarMat = null, waveGeo = null;
  var _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
  function initProjectiles() {
    var pg = new THREE.SphereGeometry(0.16, 8, 6); pg.scale(1, 1, 3.4);
    pLayer = new BulletLayer(500, pg, 2.4, 0.35, true);
    eLayer = new BulletLayer(700, new THREE.SphereGeometry(0.3, 10, 8), 2.0, 0.32, false);
    missileGeo = new THREE.ConeGeometry(0.16, 0.85, 8); missileGeo.rotateX(Math.PI / 2);
    plasmaGeo = new THREE.SphereGeometry(0.55, 14, 10);
    plasmaMat = new THREE.MeshBasicMaterial({ color: 0xd9a8ff, toneMapped: false });
    mortarMat = new THREE.MeshBasicMaterial({ color: 0xffa060, toneMapped: false });
    waveGeo = new THREE.CylinderGeometry(1, 1, 1.6, 56, 1, true);
  }
  function addPBullet(from, dirX, dirZ, speed, life, dmg, size, col, halo, knock) {
    pBullets.push({ pos: new THREE.Vector3(from.x, clamp(from.y, 1.7, 2.8), from.z), vel: new THREE.Vector3(dirX * speed, 0, dirZ * speed),
      life: life, dmg: dmg, size: size || 1, col: col, halo: halo, knock: knock || 0.4 });
  }
  function fireEnemyShotDir(from, dx, dz, speed, dmg, o) {
    o = o || {};
    var len = Math.sqrt(dx * dx + dz * dz) || 1;
    eShots.push({ pos: new THREE.Vector3(from.x, from.y, from.z), vel: new THREE.Vector3(dx / len * speed, 0, dz / len * speed),
      life: o.life || 3.6, dmg: dmg, size: o.size || 1, col: o.col || COL.enemy, halo: o.halo || COL.enemyH,
      homing: o.homing || false, turn: o.turn || 0, speed: speed, hp: o.hp || 0 });
    AudioSys.enemyShoot(from);
  }
  // aimed at the player with partial lead (accuracy grows with level)
  var _lt = new THREE.Vector3();
  function fireAimed(from, speed, dmg, o) {
    var p = player, pp = p.group.position, k = clamp(0.3 + G.level * 0.025, 0, 0.85);
    _lt.copy(pp);
    if (p.moving && p.lastMove && p.dashTime <= 0) {
      var t = Math.sqrt(dist2(from.x, from.z, pp.x, pp.z)) / speed;
      _lt.x += p.lastMove.x * p.speed * t * k * rand(0.6, 1.2); _lt.z += p.lastMove.y * p.speed * t * k * rand(0.6, 1.2);
    }
    fireEnemyShot(from, _lt, speed, dmg, o);
  }
  function fireEnemyShot(from, target, speed, dmg, o) {
    fireEnemyShotDir(from, target.x - from.x, target.z - from.z, speed, dmg, o);
  }
  function fireMissileVolley() {
    var pp = player.group.position;
    var targets = enemies.filter(function (e) { return !e.dying && e.spawnAnim <= 0; })
      .sort(function (a, b) { return (b.boss ? 1e6 : 0) - (a.boss ? 1e6 : 0) + dist2(a.group.position.x, a.group.position.z, pp.x, pp.z) - dist2(b.group.position.x, b.group.position.z, pp.x, pp.z); });
    for (var i = 0; i < player.stats.missileCount; i++) {
      var from = pp.clone(); from.y = 4.6; from.x += (i - (player.stats.missileCount - 1) / 2) * 0.45;
      var body = new THREE.Group();
      body.add(new THREE.Mesh(missileGeo, MATS.missileBody));
      var tip = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), MATS.amberGlow); tip.position.z = 0.45; body.add(tip);
      body.position.copy(from); scene.add(body);
      var tgt = targets.length ? targets[i % Math.min(targets.length, 4)] : null;
      missiles.push({ mesh: body, vel: new THREE.Vector3(rand(-4, 4), rand(9, 13), rand(-4, 4)), target: tgt,
        life: 3.4, dmg: player.stats.missileDmg * player.stats.dmgMul, turn: 3.4, smoke: 0 });
    }
    AudioSys.missile();
    shake(0.14, 0.5);
  }
  function firePlasma(from, dx, dz, w, lv, od) {
    var m = new THREE.Mesh(plasmaGeo, plasmaMat); m.position.set(from.x, clamp(from.y, 1.8, 2.8), from.z);
    var halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: getSoftTex(), color: 0xa040ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.scale.set(3.2, 3.2, 1); m.add(halo); scene.add(m);
    var mul = player.stats.dmgMul * (1 + 0.15 * (lv - 1)) * (od ? 1.3 : 1);
    plasmas.push({ mesh: m, vel: new THREE.Vector3(dx * w.speed, 0, dz * w.speed), life: w.life,
      dmg: w.dmg * mul, aoe: w.aoe * mul, radius: w.radius + 0.6 * (lv - 1) });
  }
  function plasmaBurst(p) {
    var pos = p.mesh.position;
    explosionFX(pos, 1.0 + p.radius * 0.08, 0xb46aff, 0xffd0ff);
    Rings.burst(pos.x, pos.z, 0xd9a8ff, p.radius * 1.15, 0.4);
    AudioSys.plasmaBoom(pos); shake(0.16, 0.6);
    aoeDamage(pos.x, pos.z, p.radius, p.aoe, pos);
    p.mesh.children.forEach(function (c) { if (c.material) c.material.dispose(); });
    scene.remove(p.mesh);
  }
  function aoeDamage(x, z, r, dmg, pos, opts) {
    var list = enemies.slice();
    for (var q = 0; q < list.length; q++) {
      var en = list[q]; if (en.dying || en.spawnAnim > 0) continue;
      var rr = r + en.radius * 0.6;
      if (dist2(x, z, en.group.position.x, en.group.position.z) < rr * rr) damageEnemy(en, dmg, pos || en.group.position, opts);
    }
    // AoE also pops homing orbs
    for (var k = eShots.length - 1; k >= 0; k--) if (eShots[k].hp > 0 && dist2(x, z, eShots[k].pos.x, eShots[k].pos.z) < r * r) popOrb(k);
  }
  function popOrb(k) {
    var s = eShots[k];
    Particles.spawn(s.pos.x, s.pos.y, s.pos.z, { count: 8, color: 0xc46aff, color2: 0xffffff, speed: 5, life: 0.35, size: 0.9, gravity: 1 });
    eShots.splice(k, 1); G.score += 20;
  }
  function updateProjectiles(dt) {
    var pp = player.group.position;
    // player bullets
    for (var i = pBullets.length - 1; i >= 0; i--) {
      var b = pBullets[i];
      b.life -= dt; b.pos.addScaledVector(b.vel, dt);
      var bp = b.pos, hit = b.life <= 0;
      if (!hit) for (var j = 0; j < enemies.length; j++) {
        var e = enemies[j]; if (e.dying || e.spawnAnim > 0) continue;
        var rr = e.radius + 0.35;
        if (dist2(bp.x, bp.z, e.group.position.x, e.group.position.z) < rr * rr && Math.abs(bp.y - e.hitY) < e.hitH) {
          _v2.copy(b.vel).normalize();
          damageEnemy(e, b.dmg, bp, { knock: b.knock, kx: _v2.x, kz: _v2.z }); hit = true; break;
        }
      }
      if (!hit) for (var h = eShots.length - 1; h >= 0; h--) {
        var s = eShots[h]; if (s.hp <= 0) continue;
        if (dist2(bp.x, bp.z, s.pos.x, s.pos.z) < 1.1) { popOrb(h); hit = true; break; }
      }
      if (!hit && (Math.abs(bp.x) > ARENA + 2 || Math.abs(bp.z) > ARENA + 2)) hit = true;
      if (hit) pBullets.splice(i, 1);
    }
    // plasma orbs
    for (var pi = plasmas.length - 1; pi >= 0; pi--) {
      var pl = plasmas[pi];
      pl.life -= dt; pl.mesh.position.addScaledVector(pl.vel, dt);
      pl.mesh.scale.setScalar(1 + Math.sin(G.time * 30) * 0.08);
      var plp = pl.mesh.position, boom = pl.life <= 0 || Math.abs(plp.x) > ARENA || Math.abs(plp.z) > ARENA || hitsObstacle(plp.x, plp.z, 0);
      if (!boom) for (var pj = 0; pj < enemies.length; pj++) {
        var pe = enemies[pj]; if (pe.dying || pe.spawnAnim > 0) continue;
        var pr = pe.radius + 0.6;
        if (dist2(plp.x, plp.z, pe.group.position.x, pe.group.position.z) < pr * pr && Math.abs(plp.y - pe.hitY) < pe.hitH + 0.5) {
          damageEnemy(pe, pl.dmg, plp, { knock: 1.6, kx: pl.vel.x / 46, kz: pl.vel.z / 46 }); boom = true; break;
        }
      }
      if (!SIM.on && Math.random() < 0.5) Particles.spawn(plp.x, plp.y, plp.z, { count: 1, color: 0xb46aff, color2: 0xffd0ff, speed: 0.6, life: 0.3, size: 1.0, gravity: 0 });
      if (boom) { plasmaBurst(pl); plasmas.splice(pi, 1); }
    }
    // enemy shots
    for (var k = eShots.length - 1; k >= 0; k--) {
      var s2 = eShots[k];
      s2.life -= dt;
      if (s2.homing && player.dead <= 0) {
        var want = Math.atan2(pp.x - s2.pos.x, pp.z - s2.pos.z), cur = Math.atan2(s2.vel.x, s2.vel.z);
        var na = cur + clamp(angWrap(want - cur), -s2.turn * dt, s2.turn * dt);
        s2.vel.set(Math.sin(na) * s2.speed, 0, Math.cos(na) * s2.speed);
      }
      s2.pos.addScaledVector(s2.vel, dt);
      s2.pos.y += (2.0 - s2.pos.y) * Math.min(1, dt * 4);
      var sp = s2.pos, dead = s2.life <= 0 || Math.abs(sp.x) > ARENA + 4 || Math.abs(sp.z) > ARENA + 4;
      var hr = 1.0 + 0.3 * s2.size;
      if (!dead && player.dead <= 0 && dist2(sp.x, sp.z, pp.x, pp.z) < hr * hr && sp.y < 4.6) {
        if (player.iframes <= 0 && player.invuln <= 0) { damagePlayer(s2.dmg); dead = true; }
        else if (player.invuln > 0) dead = true;
      }
      if (!dead && hitsObstacle(sp.x, sp.z, 0)) dead = true;
      if (dead) {
        if (s2.life > 0) Particles.spawn(sp.x, Math.max(sp.y, 0.3), sp.z, { count: 4, color: 0xff6a5e, speed: 3.5, life: 0.3, size: 0.7, gravity: 2 });
        eShots.splice(k, 1);
      }
    }
    // missiles
    for (var m = missiles.length - 1; m >= 0; m--) {
      var mi = missiles[m];
      mi.life -= dt;
      if (mi.target && !mi.target.dying && enemies.indexOf(mi.target) >= 0) {
        _v1.copy(mi.target.group.position); _v1.y = mi.target.hitY;
        _v2.copy(_v1).sub(mi.mesh.position).normalize().multiplyScalar(36);
        mi.vel.lerp(_v2, clamp(mi.turn * dt, 0, 1));
      } else {
        var nt = nearestEnemy(60, mi.mesh.position);
        if (nt) mi.target = nt; else mi.vel.y -= 14 * dt;
      }
      mi.mesh.position.addScaledVector(mi.vel, dt);
      if (mi.vel.lengthSq() > 0.1) { _v3.copy(mi.mesh.position).add(mi.vel); mi.mesh.lookAt(_v3); }
      mi.smoke -= dt;
      if (mi.smoke <= 0) {
        mi.smoke = 0.03;
        Particles.spawn(mi.mesh.position.x, mi.mesh.position.y, mi.mesh.position.z, { count: 1, color: 0xffc46a, color2: 0x8a929c, speed: 0.4, life: 0.45, size: 0.85, gravity: -0.5, drag: 0.6 });
      }
      var mp = mi.mesh.position, boom2 = mi.life <= 0 || mp.y < 0.25;
      if (!boom2 && mi.target && !mi.target.dying) {
        var tp = mi.target.group.position, tr = mi.target.radius + 0.6;
        if (dist2(mp.x, mp.z, tp.x, tp.z) < tr * tr && Math.abs(mp.y - mi.target.hitY) < mi.target.hitH + 1) boom2 = true;
      }
      if (boom2) {
        explosionFX(mp, 1.15, 0xffa63e, 0xffe9a8);
        AudioSys.explosion(false);
        shake(0.2, 0.7);
        aoeDamage(mp.x, mp.z, 5, mi.dmg, mp);
        scene.remove(mi.mesh); missiles.splice(m, 1);
      }
    }
    // mortar shells (enemy)
    for (var mo = mortars.length - 1; mo >= 0; mo--) {
      var sh = mortars[mo];
      sh.t += dt;
      var f = clamp(sh.t / sh.T, 0, 1);
      sh.mesh.position.set(lerp(sh.sx, sh.tx, f), lerp(sh.sy, 0.4, f) + Math.sin(f * Math.PI) * sh.h, lerp(sh.sz, sh.tz, f));
      if (f >= 1) {
        _v1.set(sh.tx, 0.6, sh.tz);
        explosionFX(_v1, 0.9 + sh.r * 0.1, 0xff5a2e, 0xffd76a);
        AudioSys.explosion(false); shake(0.12, 0.6);
        if (player.dead <= 0 && dist2(sh.tx, sh.tz, pp.x, pp.z) < (sh.r + 0.8) * (sh.r + 0.8)) damagePlayer(sh.dmg);
        Decals.free(sh.decal);
        scene.remove(sh.mesh); mortars.splice(mo, 1);
      }
    }
    // shockwaves (enemy)
    for (var w = shockwaves.length - 1; w >= 0; w--) {
      var sw = shockwaves[w];
      sw.r += sw.spd * dt;
      sw.mesh.scale.set(sw.r, 1 + (1 - sw.r / sw.maxR), sw.r);
      sw.mesh.material.opacity = 0.7 * (1 - sw.r / sw.maxR) + 0.1;
      if (!sw.hit && player.dead <= 0) {
        var pd = Math.sqrt(dist2(sw.x, sw.z, pp.x, pp.z));
        if (Math.abs(pd - sw.r) < 1.3 && player.dashTime <= 0) {
          if (player.iframes <= 0 && player.invuln <= 0) { sw.hit = true; damagePlayer(sw.dmg); }
        }
      }
      if (sw.r >= sw.maxR) { scene.remove(sw.mesh); sw.mesh.material.dispose(); shockwaves.splice(w, 1); }
    }
  }
  function spawnShockwave(x, z, maxR, dmg, color) {
    var m = new THREE.Mesh(waveGeo, new THREE.MeshBasicMaterial({ color: color || 0xff6a3e, transparent: true, opacity: 0.8, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.set(x, 0.8, z); m.scale.set(0.5, 1, 0.5); scene.add(m);
    shockwaves.push({ x: x, z: z, r: 0.5, maxR: maxR, spd: 17, dmg: dmg, hit: false, mesh: m });
    Rings.burst(x, z, color || 0xff6a3e, maxR * 0.3, 0.6);
  }
  function launchMortar(fx, fy, fz, tx, tz, dmg, r, T) {
    tx = clamp(tx, -ARENA + 2, ARENA - 2); tz = clamp(tz, -ARENA + 2, ARENA - 2);
    var mesh = new THREE.Mesh(eLayer.core.geometry, mortarMat); mesh.scale.setScalar(1.5); scene.add(mesh);
    mortars.push({ mesh: mesh, sx: fx, sy: fy, sz: fz, tx: tx, tz: tz, t: 0, T: T || 1.25, dmg: dmg, r: r || 3.2, h: 10 + rand(0, 4),
      decal: Decals.circle(tx, tz, r || 3.2, (T || 1.25) + 0.05, 0xff4020) });
    AudioSys.mortar();
  }
  function clearEnemyFire() {
    eShots.length = 0;
    mortars.forEach(function (m) { scene.remove(m.mesh); Decals.free(m.decal); }); mortars = [];
    shockwaves.forEach(function (s) { scene.remove(s.mesh); s.mesh.material.dispose(); }); shockwaves = [];
  }
  function clearProjectiles() {
    pBullets.length = 0;
    missiles.forEach(function (m) { scene.remove(m.mesh); }); missiles = [];
    plasmas.forEach(function (p) { p.mesh.children.forEach(function (c) { if (c.material) c.material.dispose(); }); scene.remove(p.mesh); }); plasmas = [];
    clearEnemyFire();
    Decals.clear();
  }

  /* ============ pickups ============ */
  var pickups = [];
  var PICK = {
    heal:   { color: 0x3dff8e, icon: '+' },
    energy: { color: 0x29b6ff },
    chip:   { color: 0xffa020 },
    life:   { color: 0xffd84a }
  };
  var pickGeo = null, pickMats = {};
  function initPickups() {
    pickGeo = new THREE.OctahedronGeometry(0.62, 0);
    Object.keys(PICK).forEach(function (k) {
      pickMats[k] = {
        body: new THREE.MeshStandardMaterial({ color: 0x111111, emissive: PICK[k].color, emissiveIntensity: 1.8, metalness: 0.3, roughness: 0.3 }),
        halo: new THREE.SpriteMaterial({ map: getSoftTex(), color: PICK[k].color, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false })
      };
    });
  }
  function spawnPickup(type, x, z) {
    var g = new THREE.Group();
    var body = new THREE.Mesh(pickGeo, pickMats[type].body); g.add(body);
    if (type === 'life') body.scale.setScalar(1.25);
    var halo = new THREE.Sprite(pickMats[type].halo); halo.scale.set(2.6, 2.6, 1); g.add(halo);
    g.position.set(clamp(x, -ARENA + 2, ARENA - 2), 1.2, clamp(z, -ARENA + 2, ARENA - 2)); scene.add(g);
    pickups.push({ type: type, g: g, body: body, life: 14, vx: rand(-5, 5), vz: rand(-5, 5), seed: rand(0, 6) });
  }
  function rollDrops(e) {
    var x = e.group.position.x, z = e.group.position.z;
    if (e.boss) {
      spawnPickup('heal', x + 1.5, z); spawnPickup('heal', x - 1.5, z); spawnPickup('chip', x, z + 1.5); spawnPickup('energy', x, z - 1.5);
      if (Math.random() < 0.3) spawnPickup('life', x, z);
      return;
    }
    var r = Math.random();
    if (e.elite) {
      if (r < 0.45) spawnPickup('chip', x, z); else if (r < 0.85) spawnPickup('heal', x, z); else spawnPickup('life', x, z);
      return;
    }
    if (r < 0.06) spawnPickup('heal', x, z);
    else if (r < 0.13) spawnPickup('energy', x, z);
    else if (r < 0.145) spawnPickup('chip', x, z);
    else if (r < 0.1485) spawnPickup('life', x, z);
  }
  function collectPickup(pk) {
    var p = player, pos = pk.g.position;
    AudioSys.pickup();
    Particles.spawn(pos.x, 1.6, pos.z, { count: 12, color: PICK[pk.type].color, color2: 0xffffff, speed: 5, life: 0.4, size: 0.9, gravity: -1 });
    if (pk.type === 'heal') { var h = Math.round(p.maxHp * 0.25); p.hp = Math.min(p.maxHp, p.hp + h); DmgNums.show(_v1.set(pos.x, 3.5, pos.z), '+' + h, 'heal'); }
    else if (pk.type === 'energy') { p.energy = p.energyMax; p.od = Math.min(100, p.od + 15); DmgNums.show(_v1.set(pos.x, 3.5, pos.z), T('pkEnergy'), 'energy'); }
    else if (pk.type === 'chip') {
      var w = WEAPONS[p.wIdx], st = p.weapons[w.id];
      if (st.lv >= 5) { var alt = WEAPONS.filter(function (x) { return p.weapons[x.id].on && p.weapons[x.id].lv < 5; })[0]; if (alt) { w = alt; st = p.weapons[alt.id]; } }
      if (st.lv < 5) { st.lv++; showToast(T('weaponUp', T('w_' + w.id), st.lv)); }
      else { G.score += 500; showToast(T('weaponMax')); }
      AudioSys.upgrade(); updateWeaponBar(true);
    } else if (pk.type === 'life') {
      if (p.lives < 9) { p.lives++; showToast(T('oneUp')); AudioSys.oneUp(); } else G.score += 2000;
      updateLives();
    }
  }
  function updatePickups(dt) {
    var pp = player.group.position;
    for (var i = pickups.length - 1; i >= 0; i--) {
      var pk = pickups[i], g = pk.g;
      pk.life -= dt;
      g.position.x += pk.vx * dt; g.position.z += pk.vz * dt; pk.vx *= 1 - dt * 3; pk.vz *= 1 - dt * 3;
      g.position.y = 1.3 + Math.sin(G.time * 3 + pk.seed) * 0.25;
      pk.body.rotation.y += dt * 2.6;
      g.visible = pk.life > 3 || Math.floor(pk.life * 8) % 2 === 0;
      if (player.dead <= 0) {
        var d2 = dist2(g.position.x, g.position.z, pp.x, pp.z), mg = player.stats.magnet;
        if (d2 < mg * mg) {
          var d = Math.sqrt(d2) || 1, sp = 24 * dt;
          g.position.x += (pp.x - g.position.x) / d * Math.min(sp, d); g.position.z += (pp.z - g.position.z) / d * Math.min(sp, d);
        }
        if (d2 < 2.4 * 2.4) { collectPickup(pk); scene.remove(g); pickups.splice(i, 1); continue; }
      }
      if (pk.life <= 0) { scene.remove(g); pickups.splice(i, 1); }
    }
  }
  function clearPickups() { pickups.forEach(function (p) { scene.remove(p.g); }); pickups = []; }

  /* ============ enemies ============ */
  var enemies = [];
  var debris = [];
  var debrisGeo = null, debrisMats = {};
  function spawnDebris(pos, color, n, scale) {
    if (SIM.on) return;
    if (!debrisGeo) debrisGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    var dm = debrisMats[color] || (debrisMats[color] = new THREE.MeshStandardMaterial({ color: color, metalness: 0.7, roughness: 0.5 }));
    for (var i = 0; i < n && debris.length < 90; i++) {
      var m = new THREE.Mesh(debrisGeo, dm);
      m.position.copy(pos); m.scale.setScalar(rand(0.6, 1.5) * (scale || 1));
      m.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3)); scene.add(m);
      debris.push({ mesh: m, vel: new THREE.Vector3(rand(-7, 7), rand(4, 11), rand(-7, 7)), rot: new THREE.Vector3(rand(-6, 6), rand(-6, 6), rand(-6, 6)), life: rand(0.7, 1.2), s: m.scale.x });
    }
  }
  function updateDebris(dt) {
    for (var i = debris.length - 1; i >= 0; i--) {
      var d = debris[i];
      d.life -= dt; d.vel.y -= 22 * dt;
      d.mesh.position.addScaledVector(d.vel, dt);
      if (d.mesh.position.y < 0.3) { d.mesh.position.y = 0.3; d.vel.y *= -0.35; d.vel.x *= 0.7; d.vel.z *= 0.7; }
      d.mesh.rotation.x += d.rot.x * dt; d.mesh.rotation.y += d.rot.y * dt;
      if (d.life <= 0) { scene.remove(d.mesh); debris.splice(i, 1); }
      else if (d.life < 0.3) d.mesh.scale.setScalar(d.s * d.life / 0.3);
    }
  }
  function clearDebris() { debris.forEach(function (d) { scene.remove(d.mesh); }); debris = []; }
  function makeHpSprite() {
    var c = document.createElement('canvas'); c.width = 96; c.height = 12;
    var tex = new THREE.CanvasTexture(c);
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sp.scale.set(3.4, 0.42, 1);
    return { sprite: sp, canvas: c, tex: tex };
  }
  function drawHpBar(e) {
    if (!e.hpBar || SIM.on) return;
    var g = e.hpBar.canvas.getContext('2d'), f = clamp(e.hp / e.maxHp, 0, 1);
    g.clearRect(0, 0, 96, 12);
    g.fillStyle = 'rgba(5,8,12,0.75)'; g.fillRect(0, 0, 96, 12);
    g.fillStyle = e.elite ? '#ffc21a' : (f > 0.35 ? '#3dff8e' : '#ff4655'); g.fillRect(2, 2, 92 * f, 8);
    g.strokeStyle = 'rgba(255,255,255,0.5)'; g.strokeRect(0.5, 0.5, 95, 11);
    e.hpBar.tex.needsUpdate = true;
    e.hpBar.sprite.visible = f < 1 || e.elite;
  }
  function lvMul() {
    var L = G.level, df = diff();
    return { hp: (1 + 0.14 * L) * df.hp, dmg: (1 + 0.07 * L) * df.dmg, spd: 1 + 0.012 * L, cd: 1 - Math.min(0.3, 0.013 * L) };
  }
  function dFactor() { return clamp(G.level / 23 + diff().d, 0, 1.15); }
  function edgeSpawn(minD2) {
    var px = player.group.position.x, pz = player.group.position.z, x = 0, z = 0, tries = 0;
    do {
      var side = randi(0, 3), t = rand(-ARENA + 6, ARENA - 6);
      if (side === 0) { x = t; z = -ARENA + 5; } else if (side === 1) { x = t; z = ARENA - 5; }
      else if (side === 2) { x = -ARENA + 5; z = t; } else { x = ARENA - 5; z = t; }
      tries++;
    } while ((dist2(x, z, px, pz) < minD2 || hitsObstacle(x, z, 2)) && tries < 16);
    return { x: x, z: z };
  }
  function spawnEnemy(type, at) {
    var def = D.ENEMIES[type], lm = lvMul();
    var elite = G.level >= 5 && type !== 'kamikaze' && Math.random() < 0.05 + G.level * 0.006;
    var m = enemyMats(type === 'kamikaze' ? 0x5a2020 : (type === 'artillery' ? 0x3f4a3a : 0x4a3138), 0xff2a35, elite);
    var g, base = 1;
    if (type === 'drone') g = buildDrone(m);
    else if (type === 'walker') g = buildWalker(m);
    else if (type === 'turret') g = buildTurret(m);
    else if (type === 'kamikaze') g = buildKamikaze(m);
    else if (type === 'artillery') g = buildArtillery(m);
    else { g = buildWalker(m); base = 1.45; }
    if (elite) base *= 1.25;
    var pos = at || edgeSpawn(500);
    g.position.set(pos.x, def.flyY, pos.z);
    scene.add(g);
    var hb = makeHpSprite();
    hb.sprite.position.y = type === 'drone' ? 1.6 : (type === 'kamikaze' ? 1.4 : (type === 'heavy' ? 4.6 : 5.0));
    g.add(hb.sprite); hb.sprite.visible = false;
    var hp = def.hp * lm.hp * (elite ? 2.6 : 1);
    var e = { type: type, def: def, group: g, mats: m, hp: hp, maxHp: hp, hpBar: hb, elite: elite,
      radius: def.radius * base, hitY: def.flyY || 1.9 * base, hitH: type === 'drone' || type === 'kamikaze' ? 2.0 : 2.4 * base,
      baseScale: base, flyY: def.flyY, speed: def.speed * lm.spd * (elite ? 1.1 : 1), dmgMul: lm.dmg * (elite ? 1.25 : 1),
      shootCd: rand(1.0, 2.0), cdMul: lm.cd, burst: 0, burstCd: 0, strafeDir: Math.random() < 0.5 ? -1 : 1, strafeTimer: rand(1.5, 3),
      walkCycle: rand(0, 6), spawnAnim: 0.55, spawnDur: 0.55, dying: false, flash: 0, kx: 0, kz: 0, seed: rand(0, 100), accum: 0, accumT: 0 };
    g.scale.setScalar(0.01);
    if (elite) drawHpBar(e);
    enemies.push(e);
    Particles.spawn(pos.x, 1.5, pos.z, { count: 16, color: 0xff4655, color2: 0x29e6ff, speed: 4, life: 0.6, size: 1.0, gravity: -2, up: 5 });
    Rings.burst(pos.x, pos.z, elite ? 0xffc21a : 0xff4655, 6, 0.45);
    return e;
  }
  function disposeEnemy(e) {
    scene.remove(e.group);
    if (e.mats) { e.mats.hull.dispose(); e.mats.dk.dispose(); }
    if (e.hpBar) { e.hpBar.tex.dispose(); e.hpBar.sprite.material.dispose(); }
    if (e.boss) bossCleanup(e);
  }
  function damageEnemy(e, dmg, hitPos, o) {
    if (e.dying || e.spawnAnim > 0) return;
    o = o || {};
    var crit = !o.noCrit && Math.random() < player.stats.crit;
    if (crit) dmg *= player.stats.critMul;
    if (e.boss && e.boss.shielded) dmg *= 0.25;
    e.hp -= dmg; e.flash = 0.09;
    if (player.odTime <= 0) player.od = Math.min(100, player.od + dmg * 0.01 * player.stats.odGain);
    drawHpBar(e);
    AudioSys.hit(hitPos, crit);
    if (!SIM.on) {
      Particles.spawn(hitPos.x, hitPos.y, hitPos.z, { count: crit ? 7 : 3, color: 0xffd76a, color2: 0xff7a1a, speed: 5, life: 0.3, size: 0.7, gravity: 4 });
      if (o.quiet) { e.accum += dmg; }
      else DmgNums.show(_v1.set(e.group.position.x, e.hitY + 1.6 + (e.boss ? 3 : 0), e.group.position.z), String(Math.round(dmg)), crit ? 'crit' : '');
      hitMarker(false);
    }
    if (o.knock && !e.boss && e.type !== 'turret') { var k = o.knock * (e.type === 'heavy' ? 0.35 : 1); e.kx += (o.kx || 0) * k * 6; e.kz += (o.kz || 0) * k * 6; }
    if (e.hp <= 0) killEnemy(e);
  }
  function killEnemy(e) {
    if (e.dying) return;
    e.dying = true;
    var pos = e.group.position.clone(); pos.y = e.hitY;
    var big = e.boss || e.type === 'heavy' || e.elite;
    explosionFX(pos, e.boss ? 2.6 : (big ? 1.5 : 0.95), e.boss ? e.boss.def.glow : 0xffa63e, 0xffe9a8);
    spawnDebris(pos, e.boss ? e.boss.def.hull : 0x4a3138, e.boss ? 16 : (big ? 9 : 5), big ? 1.5 : 1);
    AudioSys.explosion(big, pos);
    shake(e.boss ? 1.0 : (big ? 0.45 : 0.16), 1.1);
    if (big && !REDUCED && !e.boss) G.hitStop = 0.07;
    G.combo++; G.comboTimer = 4;
    var mult = 1 + Math.min(G.combo - 1, 15) * 0.1;
    var gained = Math.round(e.def.score * (e.elite ? 2.5 : 1) * mult * (1 + G.level * 0.05));
    G.score += gained; G.kills++;
    if (player.odTime <= 0) player.od = Math.min(100, player.od + 4 * player.stats.odGain);
    if (player.stats.leech && player.dead <= 0) player.hp = Math.min(player.maxHp, player.hp + player.stats.leech);
    DmgNums.show(_v1.set(pos.x, pos.y + 2.2, pos.z), '+' + gained, 'score');
    if (!SIM.on) hitMarker(true);
    if (G.combo >= 5 && G.combo % 5 === 0) showToast(T('combo', G.combo, Math.round(mult * 100)));
    rollDrops(e);
    disposeEnemy(e);
    var idx = enemies.indexOf(e); if (idx >= 0) enemies.splice(idx, 1);
    if (e.type === 'kamikaze') aoeDamage(pos.x, pos.z, 4.5, 30 * player.stats.dmgMul, pos, { noCrit: true });
    if (e.boss) onBossKilled(e);
  }
  function kamikazeBlast(e) {
    var pos = e.group.position.clone(); pos.y = 1.5;
    explosionFX(pos, 1.3, 0xff5a2e, 0xffd76a);
    AudioSys.explosion(false, pos); shake(0.3, 0.8);
    if (player.dead <= 0 && dist2(pos.x, pos.z, player.group.position.x, player.group.position.z) < 4.2 * 4.2) damagePlayer(e.def.shotDmg * e.dmgMul);
    e.dying = true; disposeEnemy(e);
    var idx = enemies.indexOf(e); if (idx >= 0) enemies.splice(idx, 1);
  }
  var _sv = new THREE.Vector3();
  function updateEnemies(dt) {
    var pp = player.group.position, alive = player.dead <= 0;
    var list = enemies.slice();
    for (var i = 0; i < list.length; i++) {
      var e = list[i], g = e.group, def = e.def;
      if (e.dying) continue;
      if (e.flash > 0) {
        e.flash -= dt;
        var fl = e.flash > 0 ? 0xffffff : e.mats.base;
        e.mats.hull.emissive.setHex(fl); e.mats.dk.emissive.setHex(e.flash > 0 ? 0x888888 : 0);
      }
      if (e.accum > 0) { e.accumT -= dt; if (e.accumT <= 0) { e.accumT = 0.22; DmgNums.show(_v1.set(g.position.x, e.hitY + 1.6 + (e.boss ? 3 : 0), g.position.z), String(Math.round(e.accum)), ''); e.accum = 0; } }
      if (e.spawnAnim > 0) {
        e.spawnAnim -= dt;
        var f = clamp(1 - e.spawnAnim / e.spawnDur, 0.02, 1);
        if (e.boss && e.boss.drop) {
          g.scale.setScalar(e.baseScale);
          g.position.y = e.flyY + (1 - f) * (1 - f) * 34;
          if (e.spawnAnim <= 0) bossLanded(e);
        } else g.scale.setScalar(Math.max(0.01, f * e.baseScale));
        continue;
      }
      var dx = pp.x - g.position.x, dz = pp.z - g.position.z;
      var dist = Math.sqrt(dx * dx + dz * dz) || 0.001;
      var faceA = Math.atan2(dx, dz);
      // separation + knockback
      for (var j = 0; j < enemies.length; j++) {
        var o = enemies[j]; if (o === e || o.dying) continue;
        var sx = g.position.x - o.group.position.x, sz = g.position.z - o.group.position.z;
        var sd = sx * sx + sz * sz, rr = (e.radius + o.radius + 0.6);
        if (sd < rr * rr && sd > 0.001) { var sl = Math.sqrt(sd), push = e.boss ? 1 : 4; g.position.x += sx / sl * dt * push; g.position.z += sz / sl * dt * push; }
      }
      if (e.kx || e.kz) {
        g.position.x += e.kx * dt; g.position.z += e.kz * dt;
        e.kx *= Math.max(0, 1 - dt * 8); e.kz *= Math.max(0, 1 - dt * 8);
        if (Math.abs(e.kx) + Math.abs(e.kz) < 0.05) e.kx = e.kz = 0;
      }
      if (e.boss) { updateBoss(e, dt, pp, dx, dz, dist, faceA); }
      else if (e.type === 'drone') {
        g.position.y = def.flyY + Math.sin(G.time * 2.4 + e.seed) * 0.35;
        if (g.userData.ring) g.userData.ring.rotation.z += dt * 3;
        g.userData.rotors.forEach(function (r) { r.rotation.y += dt * 28; });
        g.rotation.y = faceA;
        e.strafeTimer -= dt; if (e.strafeTimer <= 0) { e.strafeTimer = rand(1.4, 2.8); e.strafeDir *= -1; }
        var mvx = 0, mvz = 0;
        if (dist > def.range * 0.62) { mvx = dx / dist; mvz = dz / dist; }
        else if (dist < 9) { mvx = -dx / dist; mvz = -dz / dist; }
        mvx += (-dz / dist) * e.strafeDir * 0.8; mvz += (dx / dist) * e.strafeDir * 0.8;
        var ml = Math.sqrt(mvx * mvx + mvz * mvz) || 1;
        g.position.x += mvx / ml * e.speed * dt; g.position.z += mvz / ml * e.speed * dt;
        collideObstacles(g.position, e.radius);
        e.shootCd -= dt;
        if (e.shootCd <= 0 && dist < def.range + 6 && alive) {
          e.shootCd = def.shotCd * e.cdMul * rand(0.85, 1.2) * (e.elite ? 0.7 : 1);
          fireAimed(g.userData.muzzle.getWorldPosition(_sv), 27, def.shotDmg * e.dmgMul);
          if (e.elite) { var a0 = faceA; fireEnemyShotDir(_sv, Math.sin(a0 + 0.2), Math.cos(a0 + 0.2), 27, def.shotDmg * e.dmgMul); fireEnemyShotDir(_sv, Math.sin(a0 - 0.2), Math.cos(a0 - 0.2), 27, def.shotDmg * e.dmgMul); }
        }
      }
      else if (e.type === 'kamikaze') {
        g.position.y = def.flyY + Math.sin(G.time * 6 + e.seed) * 0.2;
        var wv = Math.sin(G.time * 3 + e.seed) * 0.45;
        var ka = faceA + wv * clamp(dist / 20, 0, 1);
        g.rotation.y = ka; g.rotation.z += dt * 8;
        if (g.userData.core) g.userData.core.scale.setScalar(1 + Math.sin(G.time * (dist < 10 ? 30 : 10)) * 0.3);
        if (alive) { g.position.x += Math.sin(ka) * e.speed * dt; g.position.z += Math.cos(ka) * e.speed * dt; }
        collideObstacles(g.position, e.radius);
        if (!SIM.on && Math.random() < 0.4) Particles.spawn(g.position.x, g.position.y, g.position.z, { count: 1, color: 0xff6a2e, speed: 0.5, life: 0.3, size: 0.8, gravity: 0 });
        if (alive && dist < 2.6) { kamikazeBlast(e); continue; }
      }
      else if (e.type === 'turret' || e.type === 'artillery') {
        var head = g.userData.head;
        if (e.type === 'artillery') {
          var want0 = dist > 40 ? 1 : (dist < 24 ? -1 : 0);
          if (want0) {
            g.rotation.y += clamp(angWrap((want0 > 0 ? faceA : faceA + Math.PI) - g.rotation.y), -dt * 2, dt * 2);
            g.position.x += Math.sin(g.rotation.y) * e.speed * dt; g.position.z += Math.cos(g.rotation.y) * e.speed * dt;
            collideObstacles(g.position, e.radius);
          }
        }
        var cur = head.rotation.y, want = angWrap(faceA - g.rotation.y - cur);
        head.rotation.y = cur + clamp(want, -dt * 1.8, dt * 1.8);
        if (g.userData.beacon) g.userData.beacon.visible = Math.sin(G.time * 6 + e.seed) > 0;
        e.burstCd -= dt;
        if (e.burst > 0 && e.burstCd <= 0 && alive) {
          e.burst--; e.burstCd = 0.16;
          fireAimed(g.userData.muzzle.getWorldPosition(_sv), 30, def.shotDmg * e.dmgMul);
        }
        e.shootCd -= dt;
        if (e.shootCd <= 0 && dist < def.range && Math.abs(want) < 0.4 && alive) {
          e.shootCd = def.shotCd * e.cdMul * rand(0.9, 1.15) * (e.elite ? 0.7 : 1);
          if (e.type === 'turret') { e.burst = e.elite ? 5 : 3; e.burstCd = 0; }
          else {
            var mzp = g.userData.muzzle.getWorldPosition(_sv), n = e.elite ? 3 : (G.level > 12 ? 2 : 1);
            for (var s = 0; s < n; s++) {
              var lead = player.lastMove && player.moving ? 4 : 0;
              var tx = pp.x + (player.lastMove ? player.lastMove.x * lead : 0) + (s ? rand(-6, 6) : 0), tz = pp.z + (player.lastMove ? player.lastMove.y * lead : 0) + (s ? rand(-6, 6) : 0);
              launchMortar(mzp.x, mzp.y, mzp.z, tx, tz, def.shotDmg * e.dmgMul, 3.0, 1.35 + s * 0.12);
            }
          }
        }
      }
      else { // walker / heavy
        var ud = g.userData;
        g.rotation.y = faceA;
        var stopAt = def.range * 0.8;
        if (dist > stopAt) {
          e.walkCycle += dt * e.speed * 1.55;
          g.position.x += dx / dist * e.speed * dt; g.position.z += dz / dist * e.speed * dt;
          collideObstacles(g.position, e.radius);
        } else e.walkCycle += dt * 1.2;
        animateLegs(ud, e.walkCycle);
        e.burstCd -= dt;
        if (e.burst > 0 && e.burstCd <= 0 && alive) {
          e.burst--; e.burstCd = 0.17;
          fireAimed(ud.muzzle.getWorldPosition(_sv), 29, def.shotDmg * e.dmgMul);
        }
        e.shootCd -= dt;
        if (e.shootCd <= 0 && dist < def.range && alive) {
          e.shootCd = def.shotCd * e.cdMul * rand(0.9, 1.15) * (e.elite ? 0.75 : 1);
          e.burst = e.type === 'walker' ? (e.elite ? 3 : 2) : 3; e.burstCd = 0;
          if (e.type === 'heavy' && Math.random() < 0.45) {
            var from = ud.muzzle.getWorldPosition(_sv);
            for (var vI = -2; vI <= 2; vI++) { var a = faceA + vI * 0.14; fireEnemyShotDir(from, Math.sin(a), Math.cos(a), 26, (def.shotDmg - 2) * e.dmgMul); }
            e.burst = 0;
          }
        }
      }
      // contact damage
      if (alive && player.hurtCd <= 0 && player.iframes <= 0 && e.type !== 'kamikaze') {
        var need = e.radius + player.radius + 0.25;
        if (dist2(g.position.x, g.position.z, pp.x, pp.z) < need * need) {
          var cd = e.boss ? (e.boss.cur && e.boss.cur.name === 'charge' && e.boss.cur.phase === 2 ? 22 : 16) : (e.type === 'drone' ? 7 : 11);
          damagePlayer(cd * e.dmgMul);
          if (!e.boss) { g.position.x -= dx / dist * 1.2; g.position.z -= dz / dist * 1.2; }
          else { pp.x += dx / dist * 2.5; pp.z += dz / dist * 2.5; collideObstacles(pp, player.radius); }
        }
      }
    }
  }
  function animateLegs(ud, cycle) {
    var sw = Math.sin(cycle) * 0.5;
    if (ud.legL) { ud.legL.rotation.x = sw; ud.legL.userData.shin.rotation.x = Math.max(0, -sw) * 0.8; }
    if (ud.legR) { ud.legR.rotation.x = -sw; ud.legR.userData.shin.rotation.x = Math.max(0, sw) * 0.8; }
  }

  /* ============ bosses ============ */
  function spawnBoss(kind, twinIdx) {
    var def = D.BOSSES[kind], L = G.level, df = diff();
    var m = enemyMats(def.hull, def.glow, false);
    m.glow = glowMat(def.glow);
    var g = BOSS_BUILDERS[def.model](m);
    var base = BOSS_SCALE[def.model];
    var pp = player.group.position;
    var ax = -pp.x, az = -pp.z, al = Math.sqrt(ax * ax + az * az);
    if (al < 1) { ax = 0; az = -1; al = 1; }
    var side = twinIdx === 1 ? 1 : (twinIdx === 0 ? -1 : 0);
    var ang = Math.atan2(ax, az) + side * 0.6;
    var x = clamp(Math.sin(ang) * 26, -ARENA + 8, ARENA - 8), z = clamp(Math.cos(ang) * 26, -ARENA + 8, ARENA - 8);
    if (hitsObstacle(x, z, def.radius)) { x *= 0.6; z *= 0.6; }
    g.position.set(x, def.fly + 34, z); g.scale.setScalar(base);
    g.rotation.y = Math.atan2(pp.x - x, pp.z - z);
    scene.add(g);
    var hp = def.hp * (1 + 0.17 * L) * df.hp;
    var tier = 1; for (var i = 0; i < L; i++) if (D.LEVELS[i].boss === kind) tier++;
    var e = { type: 'boss', def: { score: 3000 + 400 * L }, group: g, mats: m, hp: hp, maxHp: hp, hpBar: null, elite: false,
      radius: def.radius, hitY: def.fly || 3.4, hitH: def.fly ? 3.5 : 4.2, baseScale: base, flyY: def.fly,
      speed: def.speed * (1 + 0.012 * L), dmgMul: (1 + 0.07 * L) * df.dmg,
      walkCycle: 0, spawnAnim: 0.9, spawnDur: 0.9, dying: false, flash: 0, kx: 0, kz: 0, seed: rand(0, 100), accum: 0, accumT: 0,
      boss: { kind: kind, def: def, tier: tier, list: def.atk, idx: 0, cur: null, gap: 1.6, rage: false, drop: true, orbit: rand(0, 6), odir: 1, odirT: 3, phase: 0, twin: twinIdx != null } };
    enemies.push(e);
    G.bossesLeft++;
    Decals.circle(x, z, def.radius * 2.2, 0.9, 0xff3040);
    return e;
  }
  function bossLanded(e) {
    var p = e.group.position;
    p.y = e.flyY;
    explosionFX(_v1.set(p.x, 1, p.z), 1.6, e.boss.def.glow, 0xffe9a8);
    Rings.burst(p.x, p.z, e.boss.def.glow, 18, 0.7);
    AudioSys.shockwave(); shake(0.8);
    e.boss.drop = false;
  }
  function bossName(e) {
    var k = e.boss.kind, tierTxt = ['', ' Mk.I', ' Mk.II', ' Mk.III', ' Mk.IV'][Math.min(4, e.boss.tier)] || '';
    return T('b_' + k) + (k === 'overlord' ? '' : tierTxt);
  }
  function bossCleanup(e) {
    var c = e.boss.cur;
    if (c) {
      if (c.decal) Decals.free(c.decal);
      if (c.decals) c.decals.forEach(Decals.free);
      if (c.beams) c.beams.forEach(function (b) { scene.remove(b.mesh); b.mesh.material.dispose(); });
    }
  }
  function onBossKilled(e) {
    G.bossesLeft--;
    var name = bossName(e);
    if (G.bossesLeft > 0) {
      // gemini: the surviving twin goes berserk
      enemies.forEach(function (o) { if (o.boss && !o.dying) { o.boss.rage = true; o.boss.list = o.boss.def.rage; o.boss.idx = 0; o.boss.gap = 0.4; o.boss.fury = true; } });
      showToast(T('twinFury'));
      return;
    }
    if (!REDUCED) G.slowT = 1.1;
    AudioSys.bossMode = false;
    var p = e.group.position.clone();
    for (var i = 0; i < 6; i++) {
      (function (k) {
        later(0.12 + k * 0.18, function () {
          _v3.set(p.x + rand(-4, 4), rand(1, 5), p.z + rand(-4, 4));
          explosionFX(_v3, 1.2 + k * 0.15, k % 2 ? 0xffa63e : e.boss.def.glow, 0xffe9a8);
          AudioSys.explosion(k === 5); shake(0.4);
        });
      })(i);
    }
    showBanner(T('bossDown'), name);
    // wipe the remaining minions & enemy fire
    later(0.5, function () {
      enemies.slice().forEach(function (o) { if (!o.dying) killEnemy(o); });
      clearEnemyFire();
    });
    G.endingLevel = true;
    later(2.8, function () { if (G.state === 'playing') levelComplete(); });
  }
  function bossMuzzle(e) {
    var mzl = e.group.userData.muzzle;
    if (mzl) { mzl.getWorldPosition(_sv); _sv.y = Math.min(_sv.y, 6); return _sv; }
    return _sv.set(e.group.position.x, 2.6, e.group.position.z);
  }
  function bossCenter(e, y) { return _v3.set(e.group.position.x, y || 2.2, e.group.position.z); }
  function bossShot(e, from, dx, dz, speed, mul, o) {
    var bc = bossCols(e.boss.def.glow);
    o = o || {};
    if (!o.col) { o.col = bc.c; o.halo = bc.h; }
    o.size = o.size || 1.25;
    fireEnemyShotDir(from, dx, dz, speed, e.boss.def.shotDmg * e.dmgMul * (mul || 1), o);
  }
  var ATK = {
    burst: {
      start: function (e, d) { return { n: 4 + Math.round(4 * d) + (e.boss.rage ? 2 : 0), cd: 0.2, iv: 0.11 - 0.02 * d }; },
      update: function (e, s, dt, pp) {
        s.cd -= dt;
        if (s.n > 0 && s.cd <= 0) {
          s.n--; s.cd = s.iv;
          var from = bossMuzzle(e);
          var lead = player.moving && player.lastMove ? 0.3 + 0.35 * s.d0 : 0;
          var tx = pp.x + (player.lastMove ? player.lastMove.x * player.speed * lead : 0), tz = pp.z + (player.lastMove ? player.lastMove.y * player.speed * lead : 0);
          bossShot(e, from, tx - from.x + rand(-0.8, 0.8), tz - from.z + rand(-0.8, 0.8), 30 + 6 * s.d0, 1);
        }
        return s.n <= 0 && s.cd < -0.3;
      }
    },
    fan: {
      start: function (e, d) { return { v: 2 + (e.boss.rage ? 1 : 0), cd: 0.15, cnt: 7 + Math.round(4 * d), arc: 1.15, k: 0 }; },
      update: function (e, s, dt, pp) {
        s.cd -= dt;
        if (s.v > 0 && s.cd <= 0) {
          s.v--; s.cd = 0.45; s.k++;
          var from = bossMuzzle(e), base = Math.atan2(pp.x - from.x, pp.z - from.z), off = (s.k % 2) * (s.arc / (s.cnt - 1)) * 0.5;
          for (var i = 0; i < s.cnt; i++) {
            var a = base - s.arc / 2 + s.arc * i / (s.cnt - 1) + off;
            bossShot(e, from, Math.sin(a), Math.cos(a), 22 + 4 * s.d0, 0.9);
          }
        }
        return s.v <= 0 && s.cd < -0.2;
      }
    },
    ring: {
      start: function (e, d) { return { r: 2 + Math.round(d) + (e.boss.rage ? 1 : 0), cd: 0.2, cnt: 14 + Math.round(10 * d), rot: rand(0, 1), lock: true }; },
      update: function (e, s, dt) {
        s.cd -= dt;
        if (s.r > 0 && s.cd <= 0) {
          s.r--; s.cd = 0.5; s.rot += 0.5;
          var from = bossCenter(e, 2.2).clone();
          for (var i = 0; i < s.cnt; i++) {
            var a = (i + s.rot) / s.cnt * Math.PI * 2;
            bossShot(e, from, Math.sin(a), Math.cos(a), 15 + 5 * s.d0, 0.85);
          }
          Rings.burst(from.x, from.z, e.boss.def.glow, 6, 0.35);
        }
        return s.r <= 0 && s.cd < -0.2;
      }
    },
    spiral: {
      start: function (e, d) { return { dur: 2.6 + d, cd: 0, iv: 0.09 - 0.02 * d, arms: 2 + Math.round(d) + (e.boss.rage ? 1 : 0), a: rand(0, 6), dir: Math.random() < 0.5 ? -1 : 1, lock: true }; },
      update: function (e, s, dt) {
        s.dur -= dt; s.cd -= dt; s.a += dt * 2.1 * s.dir;
        if (e.group.userData.head) e.group.userData.head.rotation.y += dt * 3 * s.dir;
        if (s.cd <= 0 && s.dur > 0) {
          s.cd = s.iv;
          var from = bossCenter(e, 2.2).clone();
          for (var i = 0; i < s.arms; i++) {
            var a = s.a + i / s.arms * Math.PI * 2;
            bossShot(e, from, Math.sin(a), Math.cos(a), 14 + 4 * s.d0, 0.75, { size: 1.05 });
          }
        }
        return s.dur <= -0.3;
      }
    },
    slam: {
      start: function (e, d) {
        var R = 18 + 4 * d;
        AudioSys.slamCharge();
        return { phase: 0, t: 0.75, R: R, n: e.boss.rage && e.boss.kind === 'hammer' ? 2 : 1, decal: Decals.circle(e.group.position.x, e.group.position.z, R, 0.8, 0xff6a3e), lock: true };
      },
      update: function (e, s, dt) {
        s.t -= dt;
        var g = e.group;
        if (s.phase === 0) {
          g.position.y = e.flyY + Math.sin(clamp(1 - s.t / 0.75, 0, 1) * Math.PI * 0.5) * 3.5;
          if (s.decal) s.decal.g.position.set(g.position.x, 0.06, g.position.z);
          if (s.t <= 0) {
            s.phase = 1; s.t = 0.2;
            g.position.y = e.flyY;
            spawnShockwave(g.position.x, g.position.z, s.R, e.boss.def.shotDmg * e.dmgMul * 1.5, e.boss.def.glow);
            explosionFX(_v1.set(g.position.x, 0.6, g.position.z), 1.5, e.boss.def.glow, 0xffe9a8);
            AudioSys.shockwave(); shake(0.7);
            var from = bossCenter(e, 2.0).clone(), cnt = 10 + Math.round(6 * s.d0);
            for (var i = 0; i < cnt; i++) { var a = i / cnt * Math.PI * 2; bossShot(e, from, Math.sin(a), Math.cos(a), 16, 0.8); }
            Decals.free(s.decal); s.decal = null;
          }
        } else if (s.t <= 0) {
          s.n--;
          if (s.n > 0) { s.phase = 0; s.t = 0.6; s.decal = Decals.circle(g.position.x, g.position.z, s.R, 0.7, 0xff6a3e); AudioSys.slamCharge(); }
          else return true;
        }
        return false;
      }
    },
    charge: {
      start: function (e, d, pp) {
        var g = e.group, a = Math.atan2(pp.x - g.position.x, pp.z - g.position.z);
        AudioSys.spawnWarn();
        return { phase: 1, t: 0.8 - 0.15 * d, ang: a, decal: Decals.line(g.position.x, g.position.z, a, 46, e.radius * 2, 1.0, 0xff3040), lock: true, hits: e.boss.rage ? 2 : 1 };
      },
      update: function (e, s, dt, pp) {
        var g = e.group;
        s.t -= dt;
        if (s.phase === 1) {
          s.ang += clamp(angWrap(Math.atan2(pp.x - g.position.x, pp.z - g.position.z) - s.ang), -dt * 0.8, dt * 0.8);
          g.rotation.y = s.ang;
          g.position.x += rand(-0.07, 0.07); g.position.z += rand(-0.07, 0.07);
          Decals.aim(s.decal, g.position.x, g.position.z, s.ang, 46, e.radius * 2);
          if (s.t <= 0) { s.phase = 2; s.t = 0.62; AudioSys.dash(); Decals.free(s.decal); s.decal = null; }
        } else if (s.phase === 2) {
          var ox = g.position.x, oz = g.position.z;
          g.position.x += Math.sin(s.ang) * 34 * dt; g.position.z += Math.cos(s.ang) * 34 * dt;
          collideObstacles(g.position, e.radius);
          if (e.walkCycle != null) { e.walkCycle += dt * 18; animateLegs(g.userData, e.walkCycle); }
          if (!SIM.on) Particles.spawn(g.position.x, 0.6, g.position.z, { count: 2, color: e.boss.def.glow, speed: 1.5, life: 0.35, size: 1.1, gravity: 0 });
          var stuck = dist2(ox, oz, g.position.x, g.position.z) < 0.0004;
          if (s.t <= 0 || stuck) {
            s.hits--;
            var from = bossCenter(e, 2.0).clone(), cnt = 8 + Math.round(6 * s.d0);
            for (var i = 0; i < cnt; i++) { var a = i / cnt * Math.PI * 2; bossShot(e, from, Math.sin(a), Math.cos(a), 15, 0.8); }
            shake(0.35);
            if (s.hits > 0) { s.phase = 1; s.t = 0.55; s.ang = Math.atan2(pp.x - g.position.x, pp.z - g.position.z); s.decal = Decals.line(g.position.x, g.position.z, s.ang, 46, e.radius * 2, 0.8, 0xff3040); }
            else return true;
          }
        }
        return false;
      }
    },
    summon: {
      start: function (e, d) {
        var n = 2 + Math.round(2 * d), live = enemies.filter(function (o) { return !o.boss && !o.dying; }).length;
        if (live > 12) n = 0;
        if (n) { showToast(T('bossSummon')); AudioSys.spawnWarn(); }
        var types = e.boss.kind === 'hive' ? ['drone', 'kamikaze'] : (G.level >= 5 ? ['drone', 'walker', 'kamikaze'] : ['drone', 'walker']);
        for (var i = 0; i < n; i++) {
          var a = rand(0, Math.PI * 2), r = e.radius + 4;
          var x = clamp(e.group.position.x + Math.sin(a) * r, -ARENA + 3, ARENA - 3), z = clamp(e.group.position.z + Math.cos(a) * r, -ARENA + 3, ARENA - 3);
          spawnEnemy(types[i % types.length], { x: x, z: z });
        }
        return { t: 0.7 };
      },
      update: function (e, s, dt) { s.t -= dt; return s.t <= 0; }
    },
    mortar: {
      start: function (e, d) { return { n: 4 + Math.round(4 * d) + (e.boss.rage ? 2 : 0), cd: 0.1, first: true }; },
      update: function (e, s, dt, pp) {
        s.cd -= dt;
        if (s.n > 0 && s.cd <= 0) {
          s.n--; s.cd = 0.13;
          var from = bossMuzzle(e), tx, tz;
          if (s.first) { s.first = false; tx = pp.x + (player.lastMove && player.moving ? player.lastMove.x * 5 : 0); tz = pp.z + (player.lastMove && player.moving ? player.lastMove.y * 5 : 0); }
          else { var a = rand(0, Math.PI * 2), r = rand(3, 11); tx = pp.x + Math.sin(a) * r; tz = pp.z + Math.cos(a) * r; }
          launchMortar(from.x, from.y, from.z, tx, tz, e.boss.def.shotDmg * e.dmgMul * 1.6, 3.2, 1.2);
        }
        return s.n <= 0 && s.cd < -0.4;
      }
    },
    homing: {
      start: function (e, d) { return { n: 3 + Math.round(3 * d), cd: 0.1, k: 0 }; },
      update: function (e, s, dt) {
        s.cd -= dt;
        if (s.n > 0 && s.cd <= 0) {
          s.n--; s.cd = 0.16; s.k++;
          var from = bossMuzzle(e).clone(), a = e.group.rotation.y + (s.k % 2 ? 1 : -1) * (0.6 + s.k * 0.15);
          bossShot(e, from, Math.sin(a), Math.cos(a), 12 + 3 * s.d0, 1.3, { homing: true, turn: 1.7, life: 4.6, hp: 1, size: 1.6, col: COL.homing, halo: COL.homingH });
        }
        return s.n <= 0 && s.cd < -0.5;
      }
    },
    laser: {
      start: function (e, d, pp) {
        var g = e.group, a = Math.atan2(pp.x - g.position.x, pp.z - g.position.z);
        AudioSys.laserCharge();
        var n = e.boss.rage ? 2 : 1, decals = [];
        for (var i = 0; i < n; i++) decals.push(Decals.line(g.position.x, g.position.z, a + (n > 1 ? (i ? 0.32 : -0.32) : 0), 64, 0.5, 1.1, e.boss.def.glow));
        return { phase: 1, t: 0.95, ang: a, n: n, decals: decals, beams: [], dir: Math.random() < 0.5 ? -1 : 1, sp: 0.5 + 0.25 * d, lock: true, tick: 0 };
      },
      update: function (e, s, dt, pp) {
        var g = e.group;
        s.t -= dt;
        var ox = g.position.x, oz = g.position.z;
        if (s.phase === 1) {
          s.ang += clamp(angWrap(Math.atan2(pp.x - ox, pp.z - oz) - s.ang), -dt * 1.2, dt * 1.2);
          g.rotation.y = s.ang;
          for (var i = 0; i < s.decals.length; i++) Decals.aim(s.decals[i], ox, oz, s.ang + (s.n > 1 ? (i ? 0.32 : -0.32) : 0), 64, 0.3 + (0.95 - s.t) * 1.2);
          if (s.t <= 0) {
            s.phase = 2; s.t = 1.9;
            s.decals.forEach(Decals.free); s.decals = [];
            var crossTo = angWrap(Math.atan2(pp.x - ox, pp.z - oz) - s.ang);
            s.dir = crossTo >= 0 ? 1 : -1;
            var col = e.boss.def.glow;
            for (var k = 0; k < s.n; k++) {
              var mesh = new THREE.Mesh(BEAM_GEO(), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
              scene.add(mesh); s.beams.push({ mesh: mesh, off: s.n > 1 ? (k ? 0.32 : -0.32) : 0 });
            }
            AudioSys.bossBeam(); shake(0.3);
          }
        } else {
          s.ang += s.dir * s.sp * dt;
          g.rotation.y = s.ang;
          var y = 2.4;
          s.tick -= dt;
          for (var b = 0; b < s.beams.length; b++) {
            var bm = s.beams[b], a = s.ang + bm.off;
            var ex = ox + Math.sin(a) * 64, ez = oz + Math.cos(a) * 64;
            bm.mesh.position.set(ox, y, oz); bm.mesh.rotation.set(0, a, 0);
            var w = 1.2 + Math.sin(G.time * 40) * 0.15; bm.mesh.scale.set(w, w, 64);
            if (player.dead <= 0 && segDist2(pp.x, pp.z, ox + Math.sin(a) * e.radius, oz + Math.cos(a) * e.radius, ex, ez) < 1.5 * 1.5) damagePlayer(e.boss.def.shotDmg * e.dmgMul * 0.9);
            if (!SIM.on && s.tick <= 0) Particles.spawn(ox + Math.sin(a) * rand(4, 40), 0.4, oz + Math.cos(a) * rand(4, 40), { count: 2, color: e.boss.def.glow, color2: 0xffffff, speed: 4, life: 0.3, size: 0.9, gravity: 2 });
          }
          if (s.tick <= 0) s.tick = 0.05;
          if (s.t <= 0) {
            s.beams.forEach(function (bb) { scene.remove(bb.mesh); bb.mesh.material.dispose(); }); s.beams = [];
            return true;
          }
        }
        return false;
      }
    },
    blink: {
      start: function (e) { return { phase: 0, t: 0.28, lock: true }; },
      update: function (e, s, dt, pp) {
        var g = e.group;
        s.t -= dt;
        if (s.phase === 0) {
          g.scale.setScalar(e.baseScale * Math.max(0.02, s.t / 0.28));
          if (s.t <= 0) {
            Particles.spawn(g.position.x, 2.5, g.position.z, { count: 20, color: e.boss.def.glow, color2: 0xffffff, speed: 6, life: 0.5, size: 1.1, gravity: 0 });
            var tries = 0, x, z;
            do {
              var a = rand(0, Math.PI * 2), r = e.boss.def.keep * rand(0.8, 1.1);
              x = clamp(pp.x + Math.sin(a) * r, -ARENA + 5, ARENA - 5); z = clamp(pp.z + Math.cos(a) * r, -ARENA + 5, ARENA - 5);
            } while ((hitsObstacle(x, z, e.radius) || dist2(x, z, pp.x, pp.z) < 64) && ++tries < 12);
            g.position.x = x; g.position.z = z;
            g.rotation.y = Math.atan2(pp.x - x, pp.z - z);
            Decals.circle(x, z, e.radius * 1.6, 0.25, e.boss.def.glow);
            s.phase = 1; s.t = 0.22;
          }
        } else if (s.phase === 1) {
          g.scale.setScalar(e.baseScale * clamp(1 - s.t / 0.22, 0.02, 1));
          if (s.t <= 0) {
            g.scale.setScalar(e.baseScale);
            var from = bossMuzzle(e), base = Math.atan2(pp.x - from.x, pp.z - from.z), cnt = 5 + Math.round(3 * s.d0);
            for (var i = 0; i < cnt; i++) { var aa = base - 0.5 + i / (cnt - 1); bossShot(e, from, Math.sin(aa), Math.cos(aa), 24, 0.9); }
            s.phase = 2; s.t = 0.35;
          }
        } else if (s.t <= 0) return true;
        return false;
      }
    }
  };
  var _beamGeo = null;
  function BEAM_GEO() {
    if (!_beamGeo) { _beamGeo = new THREE.BoxGeometry(1, 1, 1); _beamGeo.translate(0, 0, 0.5); }
    return _beamGeo;
  }
  function updateBoss(e, dt, pp, dx, dz, dist, faceA) {
    var b = e.boss, g = e.group, def = b.def, d = dFactor();
    var frac = e.hp / e.maxHp;
    if (!b.rage && frac < 0.5) {
      b.rage = true; b.list = def.rage; b.idx = 0; b.gap = Math.min(b.gap, 0.6);
      showToast(T('bossRage', bossName(e))); AudioSys.bossAlarm();
      Rings.burst(g.position.x, g.position.z, def.glow, 14, 0.6);
    }
    if (b.kind === 'overlord') {
      if (b.phase === 0 && frac < 0.66) { b.phase = 1; overlordPhase(e); }
      if (b.phase === 1 && frac < 0.33) { b.phase = 2; overlordPhase(e); }
    }
    var lock = b.cur && b.cur.lock;
    if (!lock) moveBoss(e, dt, pp, dx, dz, dist, faceA);
    // model idle animations
    var ud = g.userData;
    if (ud.rotors) ud.rotors.forEach(function (r) { r.rotation.y += dt * 24; });
    if (ud.ring) ud.ring.rotation.z += dt * 1.6;
    if (ud.halo) {
      ud.halo.rotation.y += dt * 1.4;
      ud.orbs.forEach(function (o, i) { var a = G.time * 1.5 + i * Math.PI / 2; o.position.set(Math.cos(a) * 2.6, Math.sin(G.time * 3 + i) * 0.3, Math.sin(a) * 2.6); });
    }
    if (ud.tail) ud.tail.rotation.x = Math.sin(G.time * 2.2) * 0.12;
    if (ud.legs) ud.legs.forEach(function (l) { l.rotation.x = Math.sin(e.walkCycle * 1.4 + l.userData.phase) * 0.35; });
    // attacks
    if (player.dead > 0) { if (b.cur && !b.cur.lock) { finishAttack(e); } return; }
    if (b.cur) {
      b.cur.t0 += dt;
      var done = ATK[b.cur.name].update(e, b.cur, dt, pp) || b.cur.t0 > 9;
      if (done) finishAttack(e);
    } else {
      b.gap -= dt;
      if (b.gap <= 0) {
        var name = b.list[b.idx % b.list.length]; b.idx++;
        var st = ATK[name].start(e, d, pp) || {};
        st.name = name; st.t0 = 0; st.d0 = d;
        b.cur = st;
      }
    }
  }
  function finishAttack(e) {
    var b = e.boss;
    bossCleanup(e);
    b.cur = null;
    var d = dFactor();
    b.gap = Math.max(0.45, (1.5 - 0.55 * d) * (b.rage ? 0.7 : 1) * (b.fury ? 0.7 : 1) * (b.kind === 'overlord' && b.phase === 2 ? 0.75 : 1));
  }
  function overlordPhase(e) {
    var p = e.group.position;
    showBanner(T('overlordPhase'), T('overlordPhaseSub', e.boss.phase + 1));
    AudioSys.bossAlarm();
    spawnShockwave(p.x, p.z, 26, e.boss.def.shotDmg * e.dmgMul * 1.3, e.boss.def.glow);
    finishAttack(e);
    e.boss.gap = 1.2;
    ATK.summon.start(e, dFactor());
  }
  function moveBoss(e, dt, pp, dx, dz, dist, faceA) {
    var b = e.boss, g = e.group, def = b.def, m = def.model;
    if (m === 'bastion') {
      var head = g.userData.head; head.rotation.y += clamp(angWrap(faceA - g.rotation.y - head.rotation.y), -dt * 1.2, dt * 1.2);
      return;
    }
    if (m === 'hive' || m === 'phantom') {
      b.odirT -= dt; if (b.odirT <= 0) { b.odirT = rand(2, 4); b.odir *= -1; }
      var R = def.keep, w = (e.speed / R) * b.odir;
      b.orbit += w * dt;
      var cur = Math.atan2(g.position.x - pp.x, g.position.z - pp.z);
      var tgtA = cur + w * dt * 1.0;
      var tx = pp.x + Math.sin(tgtA) * R, tz = pp.z + Math.cos(tgtA) * R;
      var mx = tx - g.position.x, mz = tz - g.position.z, ml = Math.sqrt(mx * mx + mz * mz) || 1;
      var sp = Math.min(e.speed * dt, ml);
      g.position.x += mx / ml * sp; g.position.z += mz / ml * sp;
      collideObstacles(g.position, e.radius);
      if (m === 'hive') g.position.y = def.fly + Math.sin(G.time * 1.6) * 0.6;
      g.rotation.y = faceA;
      if (m === 'phantom') { e.walkCycle += dt * 9; animateLegs(g.userData, e.walkCycle); }
      return;
    }
    // walkers / scorpion: approach to keep distance with slow strafe
    g.rotation.y += clamp(angWrap(faceA - g.rotation.y), -dt * 3, dt * 3);
    var vx = 0, vz = 0;
    if (dist > def.keep + 2) { vx = dx / dist; vz = dz / dist; }
    else if (dist < def.keep - 4) { vx = -dx / dist * 0.6; vz = -dz / dist * 0.6; }
    b.odirT -= dt; if (b.odirT <= 0) { b.odirT = rand(2.5, 4.5); b.odir *= -1; }
    vx += -dz / dist * 0.45 * b.odir; vz += dx / dist * 0.45 * b.odir;
    var vl = Math.sqrt(vx * vx + vz * vz);
    if (vl > 0.01) {
      g.position.x += vx / Math.max(1, vl) * e.speed * dt; g.position.z += vz / Math.max(1, vl) * e.speed * dt;
      collideObstacles(g.position, e.radius);
      e.walkCycle += dt * e.speed * 1.2;
    } else e.walkCycle += dt;
    animateLegs(g.userData, e.walkCycle);
  }

  /* ============ HUD helpers & banners ============ */
  function showBanner(big, sub) {
    if (SIM.on) return;
    var b = $('banner');
    $('bannerBig').textContent = big;
    $('bannerSub').textContent = sub || '';
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  }
  var toastTimer = null;
  function showToast(txt) {
    if (SIM.on) return;
    var t = $('mtoast'); t.textContent = txt; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2100);
  }
  var hmTimer = null;
  function hitMarker(kill) {
    var c = $('cross'); if (!c) return;
    c.classList.remove('hit', 'kill'); void c.offsetWidth; c.classList.add(kill ? 'kill' : 'hit');
    clearTimeout(hmTimer); hmTimer = setTimeout(function () { c.classList.remove('hit', 'kill'); }, kill ? 220 : 90);
  }
  function levelLabel(L) { var lv = D.LEVELS[L]; return (lv.sector + 1) + '-' + lv.sub; }
  function sectorName(L) { return T('s_' + D.SECTORS[D.LEVELS[L].sector].key); }

  /* ============ flow ============ */
  function queueWave(idx) {
    var defs = D.LEVELS[G.level].waves[idx], q = [];
    defs.forEach(function (pair) { for (var i = 0; i < pair[1]; i++) q.push(pair[0]); });
    for (var i = q.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var tmp = q[i]; q[i] = q[j]; q[j] = tmp; }
    G.spawnQueue = q; G.spawnTimer = 0.4;
  }
  function snapshot() {
    var p = player;
    return JSON.stringify({ score: G.score, kills: G.kills, time: G.time, maxHp: p.maxHp, shieldMax: p.shieldMax, energyMax: p.energyMax,
      speed: p.speed, missileCdMax: p.missileCdMax, dashCdMax: p.dashCdMax, stats: p.stats, weapons: p.weapons, wIdx: p.wIdx, upgrades: p.upgrades, od: p.od });
  }
  function restore(json) {
    var s = JSON.parse(json), p = player;
    G.score = s.score; G.kills = s.kills; G.time = s.time;
    p.maxHp = s.maxHp; p.shieldMax = s.shieldMax; p.energyMax = s.energyMax; p.speed = s.speed;
    p.missileCdMax = s.missileCdMax; p.dashCdMax = s.dashCdMax; p.stats = s.stats; p.weapons = s.weapons; p.wIdx = s.wIdx; p.upgrades = s.upgrades; p.od = s.od;
  }
  function clearField() {
    enemies.slice().forEach(function (e) { disposeEnemy(e); }); enemies = [];
    clearProjectiles(); clearPickups(); clearDebris(); DmgNums.clear();
    G.timers = []; G.gen++; G.bossesLeft = 0; G.bossPhase = false; G.endingLevel = false;
    stopLaser();
  }
  function startLevel(idx) {
    G.level = idx; G.wave = 0; G.spawnQueue = []; G.waveDelay = 2.2; G.levelLost = 0; G.levelHits = 0; G.levelTime = 0;
    clearField();
    var lv = D.LEVELS[idx];
    buildArena(lv.sector, idx);
    var p = player;
    p.group.visible = true; p.dead = 0;
    p.group.position.set(0, 0, 14); p.group.rotation.set(0, 0, 0);
    p.hp = p.maxHp; p.shield = p.shieldMax; p.energy = p.energyMax; p.invuln = 1.5;
    p.fireCd = p.missileCd = p.dashCd = p.iframes = p.hurtCd = 0; p.dashTime = 0; p.odTime = 0;
    p.laser.heat = 0; p.laser.over = false;
    G.snap = snapshot();
    AudioSys.bossMode = false; AudioSys.transpose = D.SECTORS[lv.sector].transpose;
    camTarget.set(0, 0, 14);
    // weapon unlocks
    var newly = [];
    WEAPONS.forEach(function (w, i) { if (!p.weapons[w.id].on && idx >= w.unlock) { p.weapons[w.id].on = true; newly.push(i); } });
    $('lvName').innerHTML = '';
    $('lvName').appendChild(document.createTextNode(levelLabel(idx) + ' · '));
    var bnm = document.createElement('b'); bnm.textContent = sectorName(idx); $('lvName').appendChild(bnm);
    showBanner(T('levelBanner', levelLabel(idx)), sectorName(idx) + ' · SECTOR 0' + (lv.sector + 1));
    if (newly.length) {
      var wi = newly[newly.length - 1];
      p.wIdx = wi;
      later(2.4, function () { showBanner(T('newWeapon'), T('w_' + WEAPONS[wi].id) + ' [' + WEAPONS[wi].key + ']'); AudioSys.unlock(); });
    }
    queueWave(0); G.spawnTimer = 2.1;
    updateWeaponBar(true); updateLives(); updateHUD(true);
  }
  function levelComplete() {
    if (G.state !== 'playing') return;
    var L = G.level;
    stopLaser();
    var bonus = 500 + 150 * L, flawless = G.levelLost === 0;
    if (flawless) bonus += 1000;
    G.score += bonus;
    if (L + 1 > SAVE.maxLevel) { SAVE.maxLevel = L + 1; store.set('maxLevel', SAVE.maxLevel); }
    saveBest();
    if (L >= D.LEVELS.length - 1) { gameOver(true); return; }
    G.state = 'upgrade'; AudioSys.levelClear();
    var lines = [T('clearBonus', levelLabel(L), bonus)];
    if (flawless) lines.push(T('flawless'));
    if ((L + 1) % 4 === 0) {
      if (player.lives < 9) { player.lives++; lines.push(T('sectorLife')); }
      updateLives();
    }
    $('upBrief').textContent = lines.join(' · ');
    buildUpgradeCards();
    $('upgradeScr').classList.remove('hidden');
    if (SIM.on || BOT.on) BOT.pickUpgrade();
  }
  /* upgrades */
  var UPGRADES = [
    { id: 'firepower', max: 10, w: 10, apply: function (p) { p.stats.dmgMul += 0.15; } },
    { id: 'overclock', max: 6,  w: 8,  apply: function (p) { p.stats.rateMul += 0.1; } },
    { id: 'armor',     max: 8,  w: 8,  apply: function (p) { p.maxHp += 25; p.hp = p.maxHp; } },
    { id: 'repair',    max: 99, w: 6,  apply: function (p) { p.maxHp += 10; p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.6); } },
    { id: 'missile',   max: 5,  w: 7,  apply: function (p) { p.stats.missileDmg = Math.round(p.stats.missileDmg * 1.3); p.stats.missileCount = Math.min(8, p.stats.missileCount + 1); p.missileCdMax = Math.max(1.8, p.missileCdMax - 0.25); } },
    { id: 'thruster',  max: 4,  w: 6,  apply: function (p) { p.speed *= 1.08; p.dashCdMax *= 0.85; } },
    { id: 'weaponMod', max: 8,  w: 8,  ok: function (p) { return WEAPONS.some(function (w) { return p.weapons[w.id].on && p.weapons[w.id].lv < 5; }); },
      apply: function (p) { WEAPONS.forEach(function (w) { var s = p.weapons[w.id]; if (s.on && s.lv < 5) s.lv++; }); } },
    { id: 'reactor',   max: 4,  w: 5,  apply: function (p) { p.energyMax += 20; p.stats.regen *= 1.25; p.energy = p.energyMax; } },
    { id: 'crit',      max: 6,  w: 6,  apply: function (p) { p.stats.crit = Math.min(0.5, p.stats.crit + 0.06); p.stats.critMul += 0.1; } },
    { id: 'shield',    max: 4,  w: 6,  apply: function (p) { p.shieldMax += 20; p.shield = p.shieldMax; } },
    { id: 'leech',     max: 3,  w: 4,  apply: function (p) { p.stats.leech += 1; } },
    { id: 'overdrive', max: 3,  w: 4,  apply: function (p) { p.stats.odGain += 0.3; p.stats.odDur += 2; } },
    { id: 'spare',     max: 3,  w: 2,  ok: function (p) { return p.lives < 9; }, apply: function (p) { p.lives++; updateLives(); } },
    { id: 'magnet',    max: 2,  w: 3,  apply: function (p) { p.stats.magnet += 5; } }
  ];
  var UP_ICONS = {
    firepower: '<path d="M13 2L4.5 13.5H11L9.5 22 19 9.5h-6.5L13 2z"/>',
    overclock: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4M5 5l2.8 2.8M16.2 16.2L19 19M19 5l-2.8 2.8M7.8 16.2L5 19"/>',
    armor: '<path d="M12 3l7 3v5c0 4.5-3 8.4-7 10-4-1.6-7-5.5-7-10V6l7-3z"/><path d="M9 12l2.2 2.2L15.5 10"/>',
    repair: '<path d="M12 5v14M5 12h14"/><circle cx="12" cy="12" r="9.2"/>',
    missile: '<path d="M12 2.5c2 2.5 3 5.5 3 8.5l3.5 4h-13L9 11c0-3 1-6 3-8.5z"/><circle cx="12" cy="9" r="1.6"/><path d="M9.5 21.5c.8-1.2 1.6-1.8 2.5-1.8s1.7.6 2.5 1.8"/>',
    thruster: '<path d="M4 18c4 1 12-1 15-8l1.5-4.5L16 7c-7 3-9 11-8 15"/><path d="M4 18l-1.5 4L7 20.5"/><path d="M14 4l6-2-2 6"/>',
    weaponMod: '<path d="M3 10h12l3-3h3v10h-3l-3-3H3z"/><path d="M6 14v4M10 14v4"/>',
    reactor: '<circle cx="12" cy="12" r="3"/><ellipse cx="12" cy="12" rx="10" ry="4"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(120 12 12)"/>',
    crit: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 1v5M12 18v5M1 12h5M18 12h5"/>',
    shield: '<path d="M12 2l8 3.5V12c0 5-3.6 8.6-8 10-4.4-1.4-8-5-8-10V5.5L12 2z"/><path d="M12 6v12"/>',
    leech: '<path d="M12 21s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.6-7 10-7 10z"/><path d="M9 12h6M12 9v6"/>',
    overdrive: '<path d="M12 2l2.6 6.4L21 9l-5 4.4L17.6 20 12 16.6 6.4 20 8 13.4 3 9l6.4-.6L12 2z"/>',
    spare: '<rect x="6" y="3" width="12" height="9" rx="2"/><path d="M8 12v6M16 12v6M5 21h5M14 21h5M10 7h4"/>',
    magnet: '<path d="M6 3v8a6 6 0 0 0 12 0V3"/><path d="M6 3h4v8a2 2 0 0 0 4 0V3h4"/><path d="M6 7h4M14 7h4"/>'
  };
  var upChoices = [];
  function buildUpgradeCards() {
    var p = player, wrap = $('upCards'); wrap.innerHTML = '';
    var pool = UPGRADES.filter(function (u) { return (p.upgrades[u.id] || 0) < u.max && (!u.ok || u.ok(p)); });
    upChoices = [];
    while (upChoices.length < 3 && pool.length) {
      var tw = 0; pool.forEach(function (u) { tw += u.w; });
      var x = Math.random() * tw, k = 0;
      for (; k < pool.length; k++) { x -= pool[k].w; if (x <= 0) break; }
      k = Math.min(k, pool.length - 1);
      upChoices.push(pool[k]); pool.splice(k, 1);
    }
    upChoices.forEach(function (u, i) {
      var d = document.createElement('button'); d.type = 'button'; d.className = 'upcard';
      var lvTxt = (p.upgrades[u.id] || 0) ? ' <small>Lv.' + ((p.upgrades[u.id] || 0) + 1) + '</small>' : '';
      d.innerHTML = '<div class="ic"><svg viewBox="0 0 24 24">' + UP_ICONS[u.id] + '</svg></div><div class="un"></div><div class="ud"></div><div class="uk">' + (i + 1) + '</div>';
      d.querySelector('.un').innerHTML = escapeHtml(T('u_' + u.id)) + lvTxt;
      d.querySelector('.ud').textContent = T('u_' + u.id + '_d');
      d.addEventListener('click', function () { chooseUpgrade(i); });
      wrap.appendChild(d);
    });
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function chooseUpgrade(i) {
    if (G.state !== 'upgrade' || !upChoices[i]) return;
    var u = upChoices[i];
    AudioSys.init(); u.apply(player); AudioSys.upgrade();
    player.upgrades[u.id] = (player.upgrades[u.id] || 0) + 1;
    $('upgradeScr').classList.add('hidden');
    G.state = 'playing';
    startLevel(G.level + 1);
  }
  function applyRandomUpgrades(n) {
    var p = player;
    for (var i = 0; i < n; i++) {
      var pool = UPGRADES.filter(function (u) { return u.id !== 'spare' && u.id !== 'repair' && (p.upgrades[u.id] || 0) < u.max && (!u.ok || u.ok(p)); });
      if (!pool.length) break;
      var u = pool[Math.floor(Math.random() * pool.length)];
      u.apply(p); p.upgrades[u.id] = (p.upgrades[u.id] || 0) + 1;
    }
  }
  function saveBest() {
    if (G.score > SAVE.best) { SAVE.best = G.score; store.set('best', SAVE.best); return true; }
    return false;
  }
  function gameOver(won) {
    if (G.state === 'over' || G.state === 'win') return;
    G.state = won ? 'win' : 'over';
    stopLaser();
    AudioSys.stopBGM();
    if (won) { AudioSys.victory(); G.score += Math.round(player.lives * 2000); }
    else AudioSys.gameOver();
    var rec = saveBest();
    clearEnemyFire();
    var t = $('endTitle'), b = $('endBrief');
    if (won) { t.textContent = T('victory'); t.className = 'ms-h gold'; b.textContent = T('victoryBrief'); }
    else { t.textContent = T('defeat'); t.className = 'ms-h red'; b.textContent = T('defeatBrief', levelLabel(G.level), sectorName(G.level)); }
    $('endRecord').classList.toggle('hidden', !rec);
    $('stScore').textContent = G.score.toLocaleString();
    $('stKills').textContent = G.kills;
    $('stTime').textContent = fmtTime(G.time);
    $('stLevel').textContent = levelLabel(G.level);
    $('stBest').textContent = SAVE.best.toLocaleString();
    $('btnContinue').classList.toggle('hidden', won);
    if (SIM.on) { $('endScr').classList.remove('hidden'); return; }
    setTimeout(function () { if (G.state === 'over' || G.state === 'win') $('endScr').classList.remove('hidden'); }, won ? 500 : 900);
  }
  function resetPlayer() {
    var p = player;
    p.maxHp = 100; p.hp = 100; p.shieldMax = 0; p.shield = 0; p.energyMax = 100; p.energy = 100;
    p.stats = baseStats(); p.speed = 13.5; p.missileCdMax = 3.2; p.dashCdMax = 2.0; p.wIdx = 0; p.od = 0; p.odTime = 0;
    p.upgrades = {}; p.lives = diff().lives;
    WEAPONS.forEach(function (w) { p.weapons[w.id] = { lv: 1, on: w.unlock === 0 }; });
  }
  function startRun(fromLevel) {
    hideScreens();
    FRAME.classList.add('playing');
    G.score = 0; G.kills = 0; G.time = 0; G.combo = 0; G.comboTimer = 0; G.shake = 0; G.hitStop = 0; G.slowT = 0; G.continues = 0;
    G.startLevel = fromLevel;
    resetPlayer();
    if (fromLevel > 0) {
      applyRandomUpgrades(fromLevel);
      WEAPONS.forEach(function (w) { var s = player.weapons[w.id]; if (fromLevel > w.unlock) { s.on = true; s.lv = clamp(1 + Math.floor((fromLevel - w.unlock) / 4), 1, 5); } });
      later(2.6, function () { showToast(T('autoUpgrades', fromLevel)); });
    }
    G.state = 'playing';
    startLevel(fromLevel);
    AudioSys.startBGM();
  }
  function continueRun() {
    hideScreens();
    FRAME.classList.add('playing');
    restore(G.snap);
    player.lives = diff().lives; G.continues++;
    G.state = 'playing';
    startLevel(G.level);
    AudioSys.startBGM();
  }
  function hideScreens() { ['menu', 'endScr', 'upgradeScr', 'pauseScr'].forEach(function (id) { $(id).classList.add('hidden'); }); }
  function toMenu() {
    hideScreens();
    clearField();
    G.state = 'menu';
    FRAME.classList.remove('playing');
    AudioSys.stopBGM();
    $('bossbar').classList.remove('on');
    buildArena(2, 2);
    player.group.visible = true; player.dead = 0; player.invuln = 0;
    player.group.position.set(0, 0, 6);
    renderMenu();
    $('menu').classList.remove('hidden');
  }
  function setPaused(pz) {
    if (pz && G.state === 'playing') {
      G.state = 'paused'; $('pauseScr').classList.remove('hidden'); AudioSys.stopBGM(); stopLaser();
      mouse.down = false; touchFiring = false;
    } else if (!pz && G.state === 'paused') {
      G.state = 'playing'; $('pauseScr').classList.add('hidden'); AudioSys.startBGM();
    }
  }

  /* ============ input ============ */
  var keys = {}, mouse = { x: 0, y: 0, down: false, over: false };
  var joyVec = { x: 0, y: 0 }, touchFiring = false, touchMode = IS_TOUCH;
  function typing(e) { return e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName); }
  addEventListener('keydown', function (e) {
    if (typing(e)) return;
    var inGame = G.state === 'playing' || G.state === 'paused';
    if (inGame && ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(e.code) >= 0) e.preventDefault();
    if (G.state === 'upgrade' && /^Digit[1-3]$/.test(e.code)) { chooseUpgrade(+e.code.slice(5) - 1); return; }
    if (!inGame) return;
    keys[e.code] = true;
    AudioSys.init();
    if (e.code === 'KeyP' || e.code === 'Escape') { if (G.state === 'playing') setPaused(true); else setPaused(false); return; }
    if (G.state !== 'playing') return;
    if (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') tryDash();
    else if (e.code === 'KeyQ') tryMissile();
    else if (e.code === 'KeyE' || e.code === 'KeyF') tryOverdrive();
    else if (e.code === 'KeyB') camReset();
    else if (/^Digit[1-4]$/.test(e.code)) switchWeapon(+e.code.slice(5) - 1);
    else if (e.code === 'Tab') { e.preventDefault(); cycleWeapon(1); }
    touchMode = false;
  });
  addEventListener('keyup', function (e) { keys[e.code] = false; });
  var lastTouch = -1e9;
  function fakeMouse() { return performance.now() - lastTouch < 900; }
  FRAME.addEventListener('touchstart', function () { lastTouch = performance.now(); touchMode = true; }, { passive: true, capture: true });
  FRAME.addEventListener('mousemove', function (e) {
    if (fakeMouse()) return;
    var r = FRAME.getBoundingClientRect();
    var nx = e.clientX - r.left, ny = e.clientY - r.top;
    if (CAM.drag) camRotate(-(nx - mouse.x) * 0.006, (ny - mouse.y) * 0.005);   // 中键拖动：左右旋转 / 上下俯仰
    mouse.x = nx; mouse.y = ny; mouse.over = true;
    $('cross').style.transform = 'translate(' + mouse.x + 'px,' + mouse.y + 'px)';
    touchMode = false;
  });
  FRAME.addEventListener('mouseleave', function () { mouse.over = false; });
  FRAME.addEventListener('mousedown', function (e) {
    if (fakeMouse()) return;
    AudioSys.init();
    if (G.state !== 'playing') return;
    if (e.target.closest && e.target.closest('button, .upcard, .ms-screen, #touch')) return;
    if (e.button === 0) { mouse.down = true; touchMode = false; }
    if (e.button === 1) CAM.drag = true;
    if (e.button === 2) tryMissile();
    e.preventDefault();
  });
  addEventListener('mouseup', function (e) { if (e.button === 0) mouse.down = false; if (e.button === 1) CAM.drag = false; });
  FRAME.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  FRAME.addEventListener('wheel', function (e) {
    if (G.state !== 'playing') return;
    e.preventDefault();
    if (Math.abs(e.deltaY) > 4) cycleWeapon(e.deltaY > 0 ? 1 : -1);
  }, { passive: false });
  addEventListener('blur', function () { keys = {}; mouse.down = false; CAM.drag = false; if (G.state === 'playing') setPaused(true); });
  KIT.onHide(function () { keys = {}; mouse.down = false; if (G.state === 'playing') setPaused(true); });

  function setupTouch() {
    var stick = $('stick'), base = $('stickBase'), knob = $('stickKnob');
    var sid = null, ox = 0, oy = 0;
    function rel(e) { var r = FRAME.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    stick.addEventListener('pointerdown', function (e) {
      AudioSys.init(); touchMode = true; sid = e.pointerId; var p = rel(e); ox = p.x; oy = p.y;
      base.style.display = knob.style.display = 'block';
      base.style.transform = 'translate(' + (ox - 56) + 'px,' + (oy - 56) + 'px)';
      knob.style.transform = 'translate(' + (ox - 26) + 'px,' + (oy - 26) + 'px)';
      try { stick.setPointerCapture(e.pointerId); } catch (er) {}
      e.preventDefault();
    });
    stick.addEventListener('pointermove', function (e) {
      if (e.pointerId !== sid) return;
      var p = rel(e), dx = p.x - ox, dy = p.y - oy, len = Math.sqrt(dx * dx + dy * dy), max = 52;
      if (len > max) { dx = dx / len * max; dy = dy / len * max; }
      knob.style.transform = 'translate(' + (ox + dx - 26) + 'px,' + (oy + dy - 26) + 'px)';
      joyVec.x = dx / max; joyVec.y = dy / max;
      if (Math.abs(joyVec.x) < 0.12 && Math.abs(joyVec.y) < 0.12) joyVec.x = joyVec.y = 0;
    });
    function endStick(e) { if (e.pointerId !== sid) return; sid = null; joyVec.x = joyVec.y = 0; base.style.display = knob.style.display = 'none'; }
    stick.addEventListener('pointerup', endStick); stick.addEventListener('pointercancel', endStick);
    var bf = $('btnFire');
    bf.addEventListener('pointerdown', function (e) { e.preventDefault(); AudioSys.init(); touchMode = true; touchFiring = true; bf.classList.add('held'); try { bf.setPointerCapture(e.pointerId); } catch (er) {} });
    ['pointerup', 'pointercancel'].forEach(function (ev) { bf.addEventListener(ev, function () { touchFiring = false; bf.classList.remove('held'); }); });
    function tap(id, fn) { $(id).addEventListener('pointerdown', function (e) { e.preventDefault(); e.stopPropagation(); AudioSys.init(); if (G.state === 'playing') fn(); }); }
    tap('btnCam', camCycle); tap('btnMissile', tryMissile); tap('btnDash', tryDash); tap('btnSwap', function () { cycleWeapon(1); }); tap('btnOd', tryOverdrive);
  }
  function nearestEnemy(maxD, from) {
    var pp = from || player.group.position, best = null, bd = maxD * maxD;
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i]; if (e.dying || e.spawnAnim > 0.2) continue;
      var d = dist2(pp.x, pp.z, e.group.position.x, e.group.position.z) * (e.boss ? 0.6 : 1);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  /* ============ player actions ============ */
  function tryDash() {
    var p = player;
    if (!p || p.dead > 0 || p.dashCd > 0 || (p.energy < 20 && p.odTime <= 0) || G.state !== 'playing') return;
    if (p.odTime <= 0) p.energy -= 20;
    p.dashCd = p.dashCdMax; p.dashTime = 0.22;
    p.iframes = Math.max(p.iframes, 0.36);
    var mv = currentMoveVec();
    if (mv.x !== 0 || mv.y !== 0) p.dashDir.set(mv.x, 0, mv.y).normalize();
    else p.dashDir.set(Math.sin(p.group.rotation.y), 0, Math.cos(p.group.rotation.y));
    AudioSys.dash();
    Particles.spawn(p.group.position.x, 1.4, p.group.position.z, { count: 10, color: 0x54d8ff, color2: 0x29e6ff, speed: 3, life: 0.35, size: 1.0, gravity: 0 });
  }
  function tryMissile() {
    var p = player;
    if (!p || p.dead > 0 || p.missileCd > 0 || (p.energy < 35 && p.odTime <= 0) || G.state !== 'playing') return;
    if (p.odTime <= 0) p.energy -= 35;
    p.missileCd = p.missileCdMax;
    fireMissileVolley();
  }
  function tryOverdrive() {
    var p = player;
    if (!p || p.dead > 0 || p.od < 100 || p.odTime > 0 || G.state !== 'playing') return;
    p.od = 0; p.odTime = p.stats.odDur;
    AudioSys.overdrive(); shake(0.4);
    showBanner(T('overdrive'), T('overdriveSub'));
    Rings.burst(p.group.position.x, p.group.position.z, 0xffb02e, 16, 0.6);
  }
  function switchWeapon(i) {
    var p = player, w = WEAPONS[i];
    if (!w || !p.weapons[w.id].on || p.wIdx === i) return;
    stopLaser();
    p.wIdx = i; p.fireCd = Math.min(p.fireCd, 0.12);
    AudioSys.uiClick();
    updateWeaponBar(true);
  }
  function cycleWeapon(dir) {
    var p = player;
    for (var k = 1; k <= WEAPONS.length; k++) {
      var i = (p.wIdx + dir * k + WEAPONS.length * 4) % WEAPONS.length;
      if (p.weapons[WEAPONS[i].id].on) { switchWeapon(i); return; }
    }
  }
  function currentMoveVec() {
    if (BOT.on) return BOT.mv;
    var x = 0, y = 0;
    if (keys.KeyW || keys.ArrowUp) y -= 1;
    if (keys.KeyS || keys.ArrowDown) y += 1;
    if (keys.KeyA || keys.ArrowLeft) x -= 1;
    if (keys.KeyD || keys.ArrowRight) x += 1;
    if (joyVec.x !== 0 || joyVec.y !== 0) { x = joyVec.x; y = joyVec.y; }
    var len = Math.sqrt(x * x + y * y);
    if (len > 1) { x /= len; y /= len; }
    // 屏幕方向 → 世界方向（相机偏航后“向上”始终是屏幕上方）
    if (x !== 0 || y !== 0) {
      var c = Math.cos(CAM.yawCur), sn = Math.sin(CAM.yawCur), wx = x * c + y * sn, wz = -x * sn + y * c;
      x = wx; y = wz;
    }
    return { x: x, y: y };
  }
  var raycaster = new THREE.Raycaster(), groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.6), ndc = new THREE.Vector2(), _hit = new THREE.Vector3();
  function updateAim() {
    if (BOT.on) return;
    var p = player;
    if (touchMode) {
      var t = touchFiring ? nearestEnemy(46) : null;
      if (t) p.aim.set(t.group.position.x, 1.6, t.group.position.z);
      else { var mv = currentMoveVec(); if (mv.x !== 0 || mv.y !== 0) p.aim.set(p.group.position.x + mv.x * 10, 1.6, p.group.position.z + mv.y * 10); }
      return;
    }
    ndc.set((mouse.x / VIEW.w) * 2 - 1, -(mouse.y / VIEW.h) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    if (raycaster.ray.intersectPlane(groundPlane, _hit)) { _hit.x = clamp(_hit.x, -ARENA, ARENA); _hit.z = clamp(_hit.z, -ARENA, ARENA); p.aim.copy(_hit); }
  }
  function stopLaser() {
    if (!player) return;
    player.laser.on = false;
    player.beam.outer.visible = player.beam.core.visible = player.beam.fan.visible = false;
    AudioSys.laserOff();
  }
  var _ad = new THREE.Vector3();
  function updatePlayer(dt) {
    var p = player, g = p.group, ud = g.userData;
    if (p.dead > 0) {
      p.dead -= dt;
      if (p.dead <= 0 && p.lives > 0) respawnPlayer();
      return;
    }
    p.fireCd -= dt; p.missileCd -= dt; p.dashCd -= dt; p.iframes -= dt; p.hurtCd -= dt; p.invuln -= dt;
    var od = p.odTime > 0;
    if (od) { p.odTime -= dt; if (p.odTime <= 0) showToast(T('overdriveEnd')); }
    p.energy = clamp(p.energy + p.stats.regen * (od ? 3 : 1) * dt, 0, p.energyMax);
    if (p.shieldMax > 0) { p.shieldDelay -= dt; if (p.shieldDelay <= 0) p.shield = Math.min(p.shieldMax, p.shield + 8 * dt); }
    var mv = currentMoveVec();
    var moving = (mv.x !== 0 || mv.y !== 0);
    if (moving) p.lastMove = { x: mv.x, y: mv.y };
    var speed = p.speed * (od ? 1.12 : 1) * (p.laser.on ? 0.8 : 1);
    if (p.dashTime > 0) {
      p.dashTime -= dt;
      g.position.addScaledVector(p.dashDir, p.speed * 2.7 * dt);
      Particles.spawn(g.position.x, 1.1, g.position.z, { count: 2, color: 0x54d8ff, speed: 0.8, life: 0.3, size: 1.2, gravity: 0 });
      ud.flameL.material.opacity = 0.85; ud.flameR.material.opacity = 0.85;
      var fs = 1.2 + Math.random() * 0.5; ud.flameL.scale.set(1, fs, 1); ud.flameR.scale.set(1, fs, 1);
    } else {
      ud.flameL.material.opacity *= 0.8; ud.flameR.material.opacity *= 0.8;
      if (moving) { g.position.x += mv.x * speed * dt; g.position.z += mv.y * speed * dt; }
    }
    collideObstacles(g.position, p.radius);
    p.moving = moving;
    p.walkCycle += dt * (moving ? speed * 0.85 : 2.2);
    var sw = moving || p.dashTime > 0 ? Math.sin(p.walkCycle) * 0.5 : Math.sin(p.walkCycle) * 0.03;
    ud.legL.rotation.x = sw; ud.legL.userData.shin.rotation.x = Math.max(0, -sw) * 0.75;
    ud.legR.rotation.x = -sw; ud.legR.userData.shin.rotation.x = Math.max(0, sw) * 0.75;
    ud.torso.position.y = 2.42 + (moving ? Math.abs(Math.sin(p.walkCycle)) * 0.07 : Math.sin(G.time * 1.8) * 0.03);
    var dx = p.aim.x - g.position.x, dz = p.aim.z - g.position.z;
    if (dx * dx + dz * dz > 0.6) {
      var want = Math.atan2(dx, dz), cur = g.rotation.y;
      g.rotation.y = cur + angWrap(want - cur) * clamp(dt * 16, 0, 1);
    }
    var blinkOn = p.iframes > 0 && p.dashTime <= 0 && Math.floor(G.time * 18) % 2 === 0;
    g.visible = !blinkOn;
    ud.bubble.visible = p.invuln > 0;
    if (p.invuln > 0) ud.bubble.material.opacity = 0.12 + Math.sin(G.time * 12) * 0.06 + (p.invuln < 1 ? (Math.floor(G.time * 10) % 2) * 0.1 : 0.06);
    ud.aura.material.opacity = od ? 0.55 + Math.sin(G.time * 10) * 0.25 : 0;
    if (od) { ud.aura.rotation.z += dt * 4; if (!SIM.on && Math.random() < 0.5) Particles.spawn(g.position.x + rand(-1, 1), rand(0.5, 4), g.position.z + rand(-1, 1), { count: 1, color: 0xffb02e, color2: 0xfff0b0, speed: 1, life: 0.5, size: 0.9, gravity: -3 }); }
    // aim direction (horizontal)
    _ad.set(Math.sin(g.rotation.y), 0, Math.cos(g.rotation.y));
    var aimA = Math.atan2(dx, dz);
    var dirX = Math.sin(aimA), dirZ = Math.cos(aimA);
    if (dx * dx + dz * dz < 4) { dirX = _ad.x; dirZ = _ad.z; }
    // firing
    var firing = BOT.on ? BOT.fire : (mouse.down || touchFiring);
    if (firing && touchMode && !BOT.on && !nearestEnemy(48)) firing = false;
    var w = WEAPONS[p.wIdx], st = p.weapons[w.id], lv = st.lv;
    var dmgMul = p.stats.dmgMul * (od ? 1.3 : 1);
    if (w.id === 'laser') updateLaser(dt, firing, w, lv, dmgMul, od, dirX, dirZ);
    else {
      if (p.laser.on) stopLaser();
      p.laser.heat = Math.max(0, p.laser.heat - dt * 1.5);
      if (p.laser.heat <= 0) p.laser.over = false;
      if (firing && p.fireCd <= 0) {
        var rate = w.rate * p.stats.rateMul * (od ? 1.8 : 1);
        p.fireCd = 1 / rate;
        fireWeapon(w, lv, dmgMul, od, dirX, dirZ);
      }
    }
    ud.armR.position.z = lerp(ud.armR.position.z, 0, dt * 16);
    ud.armL.position.z = lerp(ud.armL.position.z, 0, dt * 16);
    if (ud.flash.material.opacity > 0) ud.flash.material.opacity = Math.max(0, ud.flash.material.opacity - dt * 9);
    if (!SIM.on) drawPlayerBar();
  }
  function muzzleFlash(from, color, scale) {
    if (SIM.on) return;
    var flash = player.group.userData.flash;
    flash.position.copy(from); flash.material.opacity = 0.95; flash.material.color.set(color);
    flash.material.rotation = rand(0, Math.PI); flash.scale.setScalar(rand(1.3, 1.9) * (scale || 1));
    Flashes.burst(from, color, 22 * (scale || 1), 10);
  }
  function fireWeapon(w, lv, dmgMul, od, dirX, dirZ) {
    var p = player, ud = p.group.userData, a = Math.atan2(dirX, dirZ);
    var bc = od ? COL.od : COL.pulse, bh = od ? COL.odH : COL.pulseH;
    if (w.id === 'pulse') {
      // 扇面扫射：一次喷出 5~9 颗，沿弧线展开，扇面中心随时间左右摆动
      var dmg = w.dmg * (1 + 0.15 * (lv - 1)) * dmgMul;
      var pn = w.pellets + (lv - 1), spr = w.spread + 0.05 * (lv - 1);
      var swp = Math.sin(G.time * 7.5) * w.sweep;
      p.useAlt = !p.useAlt;
      var from = muzzleWorld(p.useAlt).clone();
      for (var pi = 0; pi < pn; pi++) {
        var fr = pn === 1 ? 0 : pi / (pn - 1) - 0.5, sa = a + swp + fr * spr + rand(-0.02, 0.02);
        var mid = Math.abs(fr) < 0.2;
        addPBullet(from, Math.sin(sa), Math.cos(sa), w.speed * rand(0.94, 1.06), w.life, dmg * (mid ? 1.15 : 1), mid ? 1 : 0.85, bc, bh, 0.35);
      }
      (p.useAlt ? ud.armL : ud.armR).position.z = -0.16;
      muzzleFlash(from, od ? 0xffb02e : 0x54d8ff, 1.3);
      AudioSys.shoot();
    } else if (w.id === 'scatter') {
      var n = w.pellets + 2 * (lv - 1), spread = w.spread + 0.03 * (lv - 1);
      var pd = w.dmg * (1 + 0.12 * (lv - 1)) * dmgMul;
      var from2 = muzzleWorld(false).clone();
      for (var i = 0; i < n; i++) {
        var pa = a - spread / 2 + spread * (i + Math.random() * 0.6) / n;
        addPBullet(from2, Math.sin(pa), Math.cos(pa), w.speed * rand(0.85, 1.15), w.life * rand(0.85, 1.15), pd, 1.05, od ? COL.od : COL.pellet, od ? COL.odH : COL.pelletH, w.knock);
      }
      ud.armR.position.z = -0.42;
      muzzleFlash(from2, 0xffb02e, 2.0);
      Particles.spawn(from2.x, from2.y, from2.z, { count: 8, color: 0xffd76a, color2: 0xff7a1a, speed: 9, life: 0.18, size: 0.7, gravity: 0, dir: { x: dirX * 12, z: dirZ * 12 } });
      shake(0.1, 0.4);
      p.group.position.x -= dirX * 0.25; p.group.position.z -= dirZ * 0.25;
      AudioSys.scatter();
    } else if (w.id === 'plasma') {
      var from3 = muzzleWorld(false).clone();
      firePlasma(from3, dirX, dirZ, w, lv, od);
      ud.armR.position.z = -0.35;
      muzzleFlash(from3, 0xb46aff, 1.8);
      shake(0.06, 0.4);
      AudioSys.plasma();
    }
  }
  function updateLaser(dt, firing, w, lv, dmgMul, od, dirX, dirZ) {
    var p = player, L = p.laser, heatMax = w.heat + 0.5 * (lv - 1);
    if (L.over) { L.heat -= dt * heatMax / 2.2; if (L.heat <= 0) { L.heat = 0; L.over = false; } }
    var on = firing && !L.over;
    if (!on) {
      if (L.on) stopLaser();
      if (!L.over) L.heat = Math.max(0, L.heat - dt * 1.6);
      return;
    }
    if (!L.on) { L.on = true; AudioSys.laserOn(); }
    if (!od) L.heat += dt;
    if (L.heat >= heatMax) { L.over = true; stopLaser(); showToast(T('overheat')); AudioSys.tone({ type: 'square', freq: 240, freqEnd: 90, dur: 0.3, vol: 0.12 }); return; }
    // 扇形扫射：扇面半角随等级变宽，光束在扇面内来回扫动
    var half = w.half + 0.04 * (lv - 1), tanH = Math.tan(half), len = w.len;
    var sweepN = Math.sin(G.time * 8.5);
    AudioSys.laserMod(L.heat / heatMax, sweepN);
    var from = muzzleWorld(false).clone(); from.y = clamp(from.y, 1.8, 2.8);
    L.tick -= dt;
    var hitAny = false;
    if (L.tick <= 0) {
      L.tick = 0.07;
      var dps = w.dps * (1 + 0.15 * (lv - 1)) * dmgMul;
      var list = enemies.slice();
      for (var i = 0; i < list.length; i++) {
        var e = list[i]; if (e.dying || e.spawnAnim > 0) continue;
        var ex = e.group.position.x - from.x, ez = e.group.position.z - from.z;
        var along = ex * dirX + ez * dirZ;
        if (along < -e.radius || along > len + e.radius) continue;
        if (Math.abs(ex * dirZ - ez * dirX) < Math.max(along, 0) * tanH + e.radius + 0.4) {
          damageEnemy(e, dps * 0.07, _v2.set(e.group.position.x, from.y, e.group.position.z), { quiet: true, knock: 0.15, kx: dirX, kz: dirZ });
          hitAny = true;
        }
      }
      for (var k = eShots.length - 1; k >= 0; k--) {
        var sx = eShots[k].pos.x - from.x, sz = eShots[k].pos.z - from.z, sa2 = sx * dirX + sz * dirZ;
        if (eShots[k].hp > 0 && sa2 > 0 && sa2 < len && Math.abs(sx * dirZ - sz * dirX) < sa2 * tanH + 0.8) popOrb(k);
      }
    }
    // visuals：扇面底光 + 一道来回扫动的主光束
    var bo = p.beam.outer, bcore = p.beam.core, fan = p.beam.fan;
    bo.visible = bcore.visible = fan.visible = !SIM.on;
    var base = Math.atan2(dirX, dirZ), yaw = base + sweepN * half * 0.85, flick = 1 + Math.sin(G.time * 50) * 0.12, width = w.width + 0.1 * (lv - 1);
    bo.position.copy(from); bo.rotation.set(0, yaw, 0); bo.scale.set(width * 1.6 * flick, width * 1.6 * flick, len);
    bcore.position.copy(from); bcore.rotation.set(0, yaw, 0); bcore.scale.set(width * 0.55, width * 0.55, len);
    bo.material.color.set(od ? 0xffb02e : 0x29b6ff);
    fan.position.set(from.x, 0.3, from.z); fan.rotation.set(0, base, 0); fan.scale.set(len * tanH, 1, len);
    fan.material.color.set(od ? 0xffb02e : 0x29b6ff); fan.material.opacity = 0.1 + Math.sin(G.time * 30) * 0.03;
    p.group.userData.armR.position.z = -0.08 + Math.sin(G.time * 60) * 0.03;
    if (!SIM.on && Math.random() < 0.8) {
      var t = rand(0.1, 1), ang = base + rand(-half, half);
      Particles.spawn(from.x + Math.sin(ang) * len * t, from.y, from.z + Math.cos(ang) * len * t, { count: 1, color: 0x9df3ff, color2: 0xffffff, speed: 2, life: 0.25, size: 0.7, gravity: 0 });
    }
    if (hitAny) shake(0.02, 0.25);
    muzzleFlash(from, od ? 0xffb02e : 0x54d8ff, 0.8);
  }

  /* ============ HUD ============ */
  var hudCache = {};
  function setText(id, txt) { if (hudCache[id] !== txt) { hudCache[id] = txt; $(id).textContent = txt; } }
  function setBar(id, frac) { var el = document.querySelector('#' + id + ' > i'); if (el) el.style.transform = 'scaleX(' + clamp(frac, 0, 1) + ')'; }
  function updateSkill(id, cd, cdMax, blocked, readyTxt) {
    var el = $(id); if (!el) return;
    var fill = el.querySelector('.cd'), txt, ready = false;
    if (cd > 0) { txt = cd.toFixed(1) + 's'; fill.style.transform = 'scaleX(' + clamp(1 - cd / cdMax, 0, 1) + ')'; }
    else if (blocked) { txt = T('noEnergy'); fill.style.transform = 'scaleX(1)'; }
    else { txt = readyTxt || T('ready'); fill.style.transform = 'scaleX(1)'; ready = true; }
    el.classList.toggle('ready', ready);
    setText(id + 'V', txt);
  }
  function updateLives() {
    if (!player) return;
    var n = Math.max(0, player.lives);
    setText('livesNum', '×' + n);
    var icons = $('livesIcons'), want = Math.min(n, 5);
    if (icons.childElementCount !== want) {
      icons.innerHTML = '';
      for (var i = 0; i < want; i++) { var s = document.createElement('i'); icons.appendChild(s); }
    }
  }
  function updateWeaponBar(force) {
    if (!player) return;
    var p = player, bar = $('weapons');
    if (force || !bar.childElementCount) {
      bar.innerHTML = '';
      WEAPONS.forEach(function (w, i) {
        var st = p.weapons[w.id];
        var d = document.createElement('button'); d.type = 'button';
        d.className = 'wslot' + (st.on ? '' : ' locked') + (i === p.wIdx ? ' on' : '');
        d.innerHTML = '<b class="wk">' + w.key + '</b><span class="wn"></span><span class="pips"></span><em class="heat"><i></i></em>';
        d.querySelector('.wn').textContent = st.on ? T('w_' + w.id) : T('locked');
        var pips = d.querySelector('.pips');
        for (var k = 0; k < 5; k++) { var pi = document.createElement('i'); if (k < st.lv && st.on) pi.className = 'f'; pips.appendChild(pi); }
        d.addEventListener('pointerdown', function (e) { e.stopPropagation(); e.preventDefault(); if (G.state === 'playing') switchWeapon(i); });
        bar.appendChild(d);
      });
    }
    var heatEl = bar.children[3] && bar.children[3].querySelector('.heat > i');
    if (heatEl) {
      var hm = WEAPONS[3].heat + 0.5 * (p.weapons.laser.lv - 1);
      heatEl.style.transform = 'scaleX(' + clamp(p.laser.heat / hm, 0, 1) + ')';
      bar.children[3].classList.toggle('over', p.laser.over);
    }
  }
  function updateHUD(force) {
    if (!player || SIM.on) return;
    var p = player;
    setBar('hpBar', p.hp / p.maxHp);
    setBar('shBar', p.shieldMax ? p.shield / p.shieldMax : 0);
    $('hpBar').classList.toggle('low', p.hp / p.maxHp < 0.3);
    setText('hpTxt', Math.ceil(p.hp) + ' / ' + p.maxHp + (p.shieldMax ? '  +' + Math.ceil(p.shield) : ''));
    setBar('enBar', p.energy / p.energyMax);
    setBar('odBar', p.odTime > 0 ? p.odTime / p.stats.odDur : p.od / 100);
    $('odBar').classList.toggle('full', p.od >= 100 && p.odTime <= 0);
    $('odBar').classList.toggle('active', p.odTime > 0);
    $('lowhp').style.opacity = (G.state === 'playing' && p.dead <= 0 && p.hp / p.maxHp < 0.3) ? String(0.5 + Math.sin(G.time * 5) * 0.3) : '0';
    updateSkill('skMissile', p.missileCd, p.missileCdMax, p.energy < 35 && p.odTime <= 0);
    updateSkill('skDash', p.dashCd, p.dashCdMax, p.energy < 20 && p.odTime <= 0);
    var odEl = $('skOd'), odFill = odEl.querySelector('.cd');
    if (p.odTime > 0) { setText('skOdV', p.odTime.toFixed(1) + 's'); odFill.style.transform = 'scaleX(' + clamp(p.odTime / p.stats.odDur, 0, 1) + ')'; odEl.classList.remove('ready'); }
    else if (p.od >= 100) { setText('skOdV', T('odReady')); odFill.style.transform = 'scaleX(1)'; odEl.classList.add('ready'); }
    else { setText('skOdV', Math.floor(p.od) + '%'); odFill.style.transform = 'scaleX(' + (p.od / 100) + ')'; odEl.classList.remove('ready'); }
    setText('scoreVal', G.score.toLocaleString());
    setText('killNum', String(G.kills));
    setText('timeVal', fmtTime(G.time));
    var lv = D.LEVELS[G.level], tw = lv.waves.length + 1;
    setText('waveNum', G.bossPhase ? 'BOSS' : (Math.min(G.wave + 1, tw) + ' / ' + tw));
    var left = 0; for (var i = 0; i < enemies.length; i++) if (!enemies[i].dying) left++;
    setText('leftNum', String(left + G.spawnQueue.length));
    // boss bar
    var bosses = enemies.filter(function (e) { return e.boss && !e.dying; });
    var bb = $('bossbar');
    if (bosses.length && G.state !== 'over') {
      bb.classList.add('on');
      var hp = 0, mx = 0; bosses.forEach(function (b) { hp += Math.max(0, b.hp); mx += b.maxHp; });
      if (G.bossesLeft > bosses.length) mx += bosses[0].maxHp * (G.bossesLeft - bosses.length);
      $('bossFill').style.transform = 'scaleX(' + clamp(hp / mx, 0, 1) + ')';
      setText('bossName', '⚠ ' + bossName(bosses[0]) + (bosses.length > 1 ? ' ×' + bosses.length : '') + (bosses[0].boss.rage ? ' · ' + T('rage') : ''));
      bb.classList.toggle('rage', bosses[0].boss.rage);
    } else if (!G.bossPhase) bb.classList.remove('on');
    // weapons
    updateWeaponBar(false);
    var wSlots = $('weapons').children;
    for (var k = 0; k < wSlots.length; k++) wSlots[k].classList.toggle('on', k === p.wIdx);
    if (force) updateLives();
  }
  var mmCtx = null, mmTimer = 0;
  function drawMinimap(dt) {
    mmTimer -= dt; if (mmTimer > 0) return; mmTimer = 0.12;
    if (!mmCtx) mmCtx = $('minimap').getContext('2d');
    var g = mmCtx, S = 118, half = ARENA;
    g.clearRect(0, 0, S, S);
    g.fillStyle = 'rgba(6,16,26,0.9)'; g.fillRect(0, 0, S, S);
    // 小地图随相机偏航旋转，保持“上 = 屏幕上方”
    var cy = Math.cos(CAM.yawCur), sy = Math.sin(CAM.yawCur), kk = (S - 10) / (half * 2) / (Math.abs(cy) + Math.abs(sy));
    function mxx(x, z) { return S / 2 + (x * cy - z * sy) * kk; }
    function mzz(x, z) { return S / 2 + (x * sy + z * cy) * kk; }
    g.strokeStyle = 'rgba(41,230,255,0.45)'; g.beginPath();
    [[-half, -half], [half, -half], [half, half], [-half, half]].forEach(function (c, i) { var X = mxx(c[0], c[1]), Y = mzz(c[0], c[1]); if (i) g.lineTo(X, Y); else g.moveTo(X, Y); });
    g.closePath(); g.stroke();
    g.fillStyle = 'rgba(160,180,200,0.5)';
    obstacles.forEach(function (o) { g.fillRect(mxx(o.x, o.z) - 2, mzz(o.x, o.z) - 2, 4, 4); });
    pickups.forEach(function (pk) { g.fillStyle = '#' + PICK[pk.type].color.toString(16).padStart(6, '0'); g.fillRect(mxx(pk.g.position.x, pk.g.position.z) - 1.5, mzz(pk.g.position.x, pk.g.position.z) - 1.5, 3, 3); });
    enemies.forEach(function (e) {
      g.fillStyle = e.boss ? '#ff4655' : (e.elite ? '#ffc21a' : '#ff8a5e');
      var r = e.boss ? 4.5 : 2.4;
      g.beginPath(); g.arc(mxx(e.group.position.x, e.group.position.z), mzz(e.group.position.x, e.group.position.z), r, 0, 7); g.fill();
    });
    if (player && player.dead <= 0) {
      var px = mxx(player.group.position.x, player.group.position.z), pz = mzz(player.group.position.x, player.group.position.z);
      g.fillStyle = '#29e6ff';
      g.beginPath(); g.arc(px, pz, 3.4, 0, 7); g.fill();
      g.strokeStyle = 'rgba(41,230,255,0.7)'; g.beginPath(); g.arc(px, pz, 5.5, 0, 7); g.stroke();
    }
  }

  /* ============ camera ============ */
  var camTarget = new THREE.Vector3(), camPos = new THREE.Vector3(0, 30, 44), camBoss = 0;
  // 全视角轨道相机：yaw 绕玩家 360° 旋转，pitch 从低角度平视到垂直俯视；*Cur 为平滑后的实际值
  var CAM = { yaw: 0, pitch: 0.85, yawCur: 0, pitchCur: 0.85, drag: false };
  var CAM_PITCH_MIN = 0.3, CAM_PITCH_MAX = 1.5;
  var CAM_PRESETS = [[0, 0.85], [0, 1.5], [0, 0.32], [Math.PI / 2, 0.85], [Math.PI, 0.85], [-Math.PI / 2, 0.85]];
  var camPresetIdx = 0;
  function camRotate(dy, dp) { CAM.yaw += dy; CAM.pitch = clamp(CAM.pitch + dp, CAM_PITCH_MIN, CAM_PITCH_MAX); }
  function camReset() { camPresetIdx = 0; CAM.yaw = CAM.yawCur = 0; CAM.pitch = 0.85; }
  function camCycle() {
    camPresetIdx = (camPresetIdx + 1) % CAM_PRESETS.length;
    var pr = CAM_PRESETS[camPresetIdx];
    CAM.yaw = pr[0] + Math.round((CAM.yawCur - pr[0]) / (Math.PI * 2)) * Math.PI * 2;   // 取最近的等价角，避免绕远路
    CAM.pitch = pr[1];
    AudioSys.uiClick();
  }
  function updateCamera(dt) {
    if (G.state === 'menu') {
      var t = performance.now() * 0.00008;
      camPos.set(Math.sin(t) * 36, 17, Math.cos(t) * 36);
      camera.position.lerp(camPos, clamp(dt * 2, 0, 1));
      camera.lookAt(0, 2.5, 0);
      return;
    }
    var pp = player.group.position;
    _v1.copy(pp);
    if (player.lastMove) { _v1.x += player.lastMove.x * 3.4; _v1.z += player.lastMove.y * 3.4; }
    var dist = VIEW.w < VIEW.h ? 40 : 30;
    // 视角输入：键盘 Z/C 旋转、X/V 俯仰；平滑追到目标角度
    if (!BOT.on && G.state === 'playing') {
      if (keys.KeyZ) CAM.yaw -= dt * 1.9; if (keys.KeyC) CAM.yaw += dt * 1.9;
      if (keys.KeyX) CAM.pitch = clamp(CAM.pitch + dt * 1.1, CAM_PITCH_MIN, CAM_PITCH_MAX);
      if (keys.KeyV) CAM.pitch = clamp(CAM.pitch - dt * 1.1, CAM_PITCH_MIN, CAM_PITCH_MAX);
    }
    var ck = clamp(dt * 9, 0, 1);
    CAM.yawCur += (CAM.yaw - CAM.yawCur) * ck; CAM.pitchCur += (CAM.pitch - CAM.pitchCur) * ck;
    // boss fights: pull back and lean toward the nearest boss so both stay on screen
    var fb = null, fd = 1e9;
    for (var i = 0; i < enemies.length; i++) {
      var e = enemies[i]; if (!e.boss || e.dying) continue;
      var d2 = dist2(e.group.position.x, e.group.position.z, pp.x, pp.z); if (d2 < fd) { fd = d2; fb = e; }
    }
    if (fb) {
      var bd = Math.sqrt(fd), k = Math.min(0.35, 13 / Math.max(bd, 1));
      _v1.x += (fb.group.position.x - pp.x) * k; _v1.z += (fb.group.position.z - pp.z) * k;
      camBoss = lerp(camBoss, clamp(4 + bd * 0.28, 4, 13), clamp(dt * 2, 0, 1));
    } else camBoss = lerp(camBoss, 0, clamp(dt * 2, 0, 1));
    camTarget.lerp(_v1, clamp(dt * 5, 0, 1));
    dist += camBoss;
    var R = dist * 1.09, cp = Math.cos(CAM.pitchCur);
    // 低角度时拉近一点，避免被建筑挡；垂直俯视时略拉远以保持视野
    R *= 1 + (CAM.pitchCur - 0.85) * 0.18;
    camPos.set(camTarget.x + Math.sin(CAM.yawCur) * cp * R, Math.sin(CAM.pitchCur) * R + 0.5, camTarget.z + Math.cos(CAM.yawCur) * cp * R);
    camera.position.lerp(camPos, clamp(dt * 7, 0, 1));
    if (G.shake > 0.003) {
      var s = G.shake * (REDUCED ? 0.3 : 1);
      camera.position.x += rand(-s, s) * 0.55; camera.position.y += rand(-s, s) * 0.4;
    }
    camera.lookAt(camTarget.x, 1.2, camTarget.z);
  }

  /* ============ wave director ============ */
  function updateFlow(dt) {
    if (G.state !== 'playing' || G.endingLevel) return;
    if (G.spawnQueue.length > 0) {
      G.spawnTimer -= dt;
      if (G.spawnTimer <= 0) {
        G.spawnTimer = G.spawnQueue.length > 6 ? 0.55 : 0.85;
        spawnEnemy(G.spawnQueue.shift());
      }
      return;
    }
    if (G.bossPhase) return;
    var live = 0; for (var i = 0; i < enemies.length; i++) if (!enemies[i].dying) live++;
    if (live > 0) return;
    G.waveDelay -= dt;
    if (G.waveDelay > 0) return;
    var lv = D.LEVELS[G.level];
    if (G.wave < lv.waves.length - 1) {
      G.wave++; G.waveDelay = 2.2;
      queueWave(G.wave);
      showBanner(T('waveBanner', G.wave + 1), T('waveSub'));
      AudioSys.spawnWarn();
    } else {
      // boss wave
      G.bossPhase = true; G.wave = lv.waves.length;
      var def = D.BOSSES[lv.boss];
      if (def.twin) { spawnBoss(lv.boss, 0); spawnBoss(lv.boss, 1); }
      else spawnBoss(lv.boss);
      var q = [];
      lv.escorts.forEach(function (pair) { for (var k = 0; k < pair[1]; k++) q.push(pair[0]); });
      G.spawnQueue = q; G.spawnTimer = 2.5;
      AudioSys.bossMode = true; AudioSys.bossAlarm();
      var b0 = enemies.filter(function (e) { return e.boss; })[0];
      showBanner(T('bossIncoming'), b0 ? bossName(b0) : '');
      $('bossbar').classList.add('on');
    }
  }

  /* ============ main loop ============ */
  var lastT = 0, perf = { acc: 0, n: 0, t: 0 };
  function step(dt) {
    G.time += dt; G.levelTime += dt;
    runTimers(dt);
    if (G.comboTimer > 0) { G.comboTimer -= dt; if (G.comboTimer <= 0) G.combo = 0; }
    if (BOT.on) BOT.think(dt);
    updateAim();
    updatePlayer(dt);
    if (G.state !== 'playing') return;
    updateFlow(dt);
    updateEnemies(dt);
    updateProjectiles(dt);
    updatePickups(dt);
    Decals.update(dt);
  }
  function frame(raw) {
    AudioSys.sync();
    var dt = raw;
    if (G.slowT > 0) { G.slowT -= raw; dt *= 0.3; }
    if (G.hitStop > 0) { G.hitStop -= raw; dt *= 0.12; }
    G.shake = Math.max(0, G.shake - raw * 2.4);
    if (G.state === 'playing') step(dt);
    else if (G.state === 'menu' && player) {
      var ud = player.group.userData;
      ud.torso.position.y = 2.42 + Math.sin(performance.now() * 0.0018) * 0.03;
      player.group.rotation.y = Math.sin(performance.now() * 0.0002) * 0.5;
      player.group.userData.bar.sprite.visible = false;
    }
    if (G.state !== 'menu') player.group.userData.bar.sprite.visible = player.dead <= 0;
    if (touchMode !== frame.tm) { frame.tm = touchMode; FRAME.classList.toggle('touchmode', touchMode); }
    if (G.state !== 'paused') {
      Particles.update(dt); Rings.update(dt); Flashes.update(dt); updateDebris(dt);
      if (G.state !== 'playing') Decals.update(dt);
    }
    Ambient.update(raw, camTarget.x, camTarget.z);
    if (arenaGroup && arenaGroup.userData.ring) arenaGroup.userData.ring.rotation.z += raw * 0.15;
    updateCamera(raw);
    if (G.state !== 'menu') { updateHUD(false); drawMinimap(raw); }
    if (G.state !== 'paused') DmgNums.update(raw);
    pLayer.sync([pBullets]); eLayer.sync([eShots]);
    renderer.render(scene, camera);
    // adaptive quality
    if (SAVE.quality === 'auto' && G.state === 'playing' && !document.hidden) {
      perf.acc += raw; perf.n++;
      if (perf.acc > 3) {
        var avg = perf.acc / perf.n; perf.acc = 0; perf.n = 0;
        if (avg > 0.03 && qLevel !== 'low') { qLevel = qLevel === 'high' ? 'medium' : 'low'; applyQuality(); showToast(T('qualityAuto')); renderPauseOpts(); }
      }
    }
  }
  function loop(t) {
    requestAnimationFrame(loop);
    var raw = Math.min((t - lastT) / 1000 || 0.016, 0.05); lastT = t;
    if (SIM.on) return;
    try { frame(raw); } catch (err) { showErr('Runtime: ' + (err && err.message) + (DEBUG && err.stack ? '\n' + err.stack.split('\n').slice(0, 3).join('\n') : '')); }
  }

  /* ============ autopilot bot (debug / balance testing) ============ */
  var BOT = {
    on: false, mv: { x: 0, y: 0 }, fire: false, strafe: 1, strafeT: 0, wT: 0,
    pickUpgrade: function () {
      var i = Math.floor(Math.random() * upChoices.length);
      if (SIM.on) { chooseUpgrade(i); return; }
      setTimeout(function () { if (G.state === 'upgrade') chooseUpgrade(i); }, 400);
    },
    think: function (dt) {
      var p = player, pp = p.group.position;
      this.fire = false; this.mv.x = this.mv.y = 0;
      if (p.dead > 0) return;
      var target = null, bd = 1e9;
      enemies.forEach(function (e) {
        if (e.dying || e.spawnAnim > 0) return;
        var d = dist2(pp.x, pp.z, e.group.position.x, e.group.position.z) * (e.boss ? 0.5 : 1) * (e.type === 'kamikaze' ? 0.3 : 1);
        if (d < bd) { bd = d; target = e; }
      });
      var mx = 0, mz = 0;
      if (target) {
        var tx = target.group.position.x, tz = target.group.position.z, dx = tx - pp.x, dz = tz - pp.z, dist = Math.sqrt(dx * dx + dz * dz) || 1;
        p.aim.set(tx, 1.6, tz);
        this.fire = dist < 46;
        var keep = p.wIdx === 1 ? 9 : 17;
        if (target.type === 'kamikaze') keep = 22;
        var radial = dist > keep + 3 ? 1 : (dist < keep - 3 ? -1 : 0);
        this.strafeT -= dt; if (this.strafeT <= 0) { this.strafeT = rand(1.5, 3); this.strafe *= -1; }
        mx = dx / dist * radial + (-dz / dist) * this.strafe * 0.9;
        mz = dz / dist * radial + (dx / dist) * this.strafe * 0.9;
        // weapon choice
        this.wT -= dt;
        if (this.wT <= 0) {
          this.wT = 1;
          var best = 0;
          if (p.weapons.laser.on && !p.laser.over && p.laser.heat < 3) best = 3;
          else if (p.weapons.plasma.on && enemies.length > 3) best = 2;
          else if (p.weapons.scatter.on && dist < 11) best = 1;
          if (best !== p.wIdx) switchWeapon(best);
        }
        if (p.missileCd <= 0 && p.energy > 55) tryMissile();
        if (p.od >= 100 && (target.boss || enemies.length > 6)) tryOverdrive();
      }
      // dodge: enemy shots heading at us
      var danger = 0, ax = 0, az = 0;
      for (var i = 0; i < eShots.length; i++) {
        var s = eShots[i], rx = pp.x - s.pos.x, rz = pp.z - s.pos.z, d2 = rx * rx + rz * rz;
        if (d2 > 100) continue;
        var vl = Math.sqrt(s.vel.x * s.vel.x + s.vel.z * s.vel.z) || 1, along = (rx * s.vel.x + rz * s.vel.z) / vl;
        if (along < 0) continue;
        var perpX = rx - s.vel.x / vl * along, perpZ = rz - s.vel.z / vl * along, pd = Math.sqrt(perpX * perpX + perpZ * perpZ) || 0.01;
        if (pd < 2.2) { ax += perpX / pd * (2.4 - pd); az += perpZ / pd * (2.4 - pd); danger += 1 / (1 + along * 0.2); }
      }
      mortars.forEach(function (m) { var rx = pp.x - m.tx, rz = pp.z - m.tz, d = Math.sqrt(rx * rx + rz * rz) || 0.01; if (d < m.r + 2) { ax += rx / d * 3; az += rz / d * 3; danger += 0.6; } });
      shockwaves.forEach(function (w) { var d = Math.sqrt(dist2(w.x, w.z, pp.x, pp.z)); if (d > w.r && d - w.r < 2.5) danger += 3; });
      enemies.forEach(function (e) {
        if (!e.boss || !e.boss.cur) return;
        var c = e.boss.cur, ex = e.group.position.x, ez = e.group.position.z;
        if (c.name === 'laser') { var a = c.ang + (c.phase === 1 ? 0 : c.dir * 0.6); var lx = Math.sin(a), lz = Math.cos(a); var rx = pp.x - ex, rz = pp.z - ez; var cross = rx * lz - rz * lx; ax += lz * Math.sign(cross || 1) * -c.dir * 3; az += -lx * Math.sign(cross || 1) * -c.dir * 3; if (c.phase === 2 && Math.abs(cross) < 3) danger += 2; }
        if (c.name === 'charge' && c.phase >= 1) { var cx = Math.sin(c.ang), cz = Math.cos(c.ang), rx2 = pp.x - ex, rz2 = pp.z - ez, cr = rx2 * cz - rz2 * cx; if (Math.abs(cr) < e.radius + 2.5) { ax += cz * Math.sign(cr || 1) * 3; az += -cx * Math.sign(cr || 1) * 3; danger += c.phase === 2 ? 3 : 0.5; } }
      });
      if (this.noDodge) { danger = 0; ax = az = 0; }
      if (danger > 0) { mx = mx * 0.3 + ax; mz = mz * 0.3 + az; }
      // seek heal pickups when hurt
      if (p.hp < p.maxHp * 0.55) {
        var hp = null, hd = 900;
        pickups.forEach(function (pk) { if (pk.type !== 'heal') return; var d = dist2(pk.g.position.x, pk.g.position.z, pp.x, pp.z); if (d < hd) { hd = d; hp = pk; } });
        if (hp && danger < 1) { var hx = hp.g.position.x - pp.x, hz = hp.g.position.z - pp.z, hl = Math.sqrt(hx * hx + hz * hz) || 1; mx = mx * 0.4 + hx / hl; mz = mz * 0.4 + hz / hl; }
      }
      // walls
      if (pp.x > ARENA - 10) mx -= 1.2; if (pp.x < -ARENA + 10) mx += 1.2;
      if (pp.z > ARENA - 10) mz -= 1.2; if (pp.z < -ARENA + 10) mz += 1.2;
      var ml = Math.sqrt(mx * mx + mz * mz);
      if (ml > 0.05) { this.mv.x = mx / ml; this.mv.y = mz / ml; }
      if (danger > 1.6 && p.dashCd <= 0 && p.energy >= 30) tryDash();
    }
  };

  /* ============ debug API ============ */
  var DBG = { god: false };
  function simRun(seconds) {
    SIM.on = true;
    var steps = Math.round(seconds * 60), i = 0;
    try {
      for (; i < steps; i++) {
        if (G.state === 'playing') { if (G.hitStop > 0) G.hitStop = 0; G.slowT = 0; step(1 / 60); }
        else if (G.state === 'upgrade' && BOT.on) { BOT.pickUpgrade(); }
        else break;
      }
    } finally { SIM.on = false; }
    return i / 60;
  }
  if (DEBUG) {
    window.__MS = {
      G: G, D: D, get player() { return player; }, get enemies() { return enemies; }, get eShots() { return eShots; }, DBG: DBG, BOT: BOT, SAVE: SAVE,
      start: function (L, d) { if (d != null) G.diff = d; AudioSys.init(); startRun(L || 0); },
      god: function (on) { DBG.god = on !== false; },
      killAll: function () { enemies.slice().forEach(function (e) { if (!e.boss) killEnemy(e); }); G.spawnQueue = []; },
      toBoss: function () { var lv = D.LEVELS[G.level]; G.wave = lv.waves.length - 1; G.spawnQueue = []; enemies.slice().forEach(function (e) { if (!e.boss) killEnemy(e); }); G.waveDelay = 0; },
      bossHp: function (f) { enemies.forEach(function (e) { if (e.boss) e.hp = e.maxHp * f; }); },
      bot: function (on) { BOT.on = on !== false; },
      sim: simRun,
      cont: function () { continueRun(); },
      weapon: function (i, lv) { var w = WEAPONS[i]; player.weapons[w.id].on = true; if (lv) player.weapons[w.id].lv = lv; switchWeapon(i); updateWeaponBar(true); },
      fire: function (on) { mouse.down = on !== false; },
      aimAt: function (x, z) { player.aim.set(x, 1.6, z); },
      atk: function (name) { var b = enemies.filter(function (e) { return e.boss; })[0]; if (!b) return 'no boss'; finishAttack(b); var st = ATK[name].start(b, dFactor(), player.group.position) || {}; st.name = name; st.t0 = 0; st.d0 = dFactor(); b.boss.cur = st; return name; },
      counts: function () { return { enemies: enemies.length, eShots: eShots.length, pBullets: pBullets.length, mortars: mortars.length, waves: shockwaves.length, pickups: pickups.length, particles: Particles.n, timers: G.timers.length, info: renderer.info.render.calls + ' calls / ' + renderer.info.render.triangles + ' tris' }; },
      setQuality: function (q) { qLevel = q; applyQuality(); }
    };
  }

  /* ============ menu & screens ============ */
  function renderMenu() {
    var dWrap = $('diffs'); dWrap.innerHTML = '';
    DIFFS.forEach(function (d, i) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'ms-chip' + (i === G.diff ? ' on' : '');
      b.innerHTML = '<b></b><small></small>';
      b.querySelector('b').textContent = T('d_' + d.key);
      b.querySelector('small').textContent = T('livesN', d.lives);
      b.addEventListener('click', function () { G.diff = i; SAVE.diff = i; store.set('diff', i); AudioSys.init(); AudioSys.uiClick(); renderMenu(); });
      dWrap.appendChild(b);
    });
    var sWrap = $('sectors'); sWrap.innerHTML = '';
    D.SECTORS.forEach(function (s, i) {
      var startL = i * 4, unlocked = SAVE.maxLevel >= startL || (DEBUG);
      var b = document.createElement('button'); b.type = 'button';
      b.className = 'lvchip' + (unlocked ? '' : ' locked') + (i === 5 ? ' hot' : '');
      b.style.setProperty('--sc', hexCss(s.theme.accent));
      b.innerHTML = '<b></b><span></span>';
      b.querySelector('b').textContent = unlocked ? (i + 1) + '-1' : '🔒';
      b.querySelector('span').textContent = T('s_' + s.key);
      b.title = unlocked ? T('startFrom', (i + 1) + '-1') : T('lockedSector');
      if (unlocked) b.addEventListener('click', function () { AudioSys.init(); AudioSys.uiClick(); begin(startL); });
      sWrap.appendChild(b);
    });
    $('menuBest').textContent = SAVE.best ? T('bestScore', SAVE.best.toLocaleString()) : '';
    $('menuProgress').textContent = T('progress', Math.min(SAVE.maxLevel, 24));
  }
  function renderPauseOpts() {
    var q = $('optQuality'); if (!q) return;
    q.innerHTML = '';
    ['auto', 'high', 'medium', 'low'].forEach(function (k) {
      var o = document.createElement('option'); o.value = k; o.textContent = T('q_' + k) + (k === 'auto' && SAVE.quality === 'auto' ? ' (' + T('q_' + qLevel) + ')' : '');
      q.appendChild(o);
    });
    q.value = SAVE.quality;
    $('optShake').checked = SAVE.shake;
  }
  function begin(level) {
    if (!renderer) return;
    AudioSys.init(); AudioSys.uiClick();
    $('menu').classList.add('hidden');
    if (IS_TOUCH && !isFs()) toggleFullscreen(true);
    startRun(level || 0);
  }
  function isFs() { return document.fullscreenElement === FRAME || document.webkitFullscreenElement === FRAME || FRAME.classList.contains('ms-fs'); }
  function toggleFullscreen(force) {
    var on = force != null ? force : !isFs();
    if (on) {
      var req = FRAME.requestFullscreen || FRAME.webkitRequestFullscreen;
      if (req) {
        try {
          var pr = req.call(FRAME);
          if (pr && pr.catch) pr.catch(function () { FRAME.classList.add('ms-fs'); document.body.classList.add('ms-fs-on'); onResize(); });
        } catch (e) { FRAME.classList.add('ms-fs'); document.body.classList.add('ms-fs-on'); }
      } else { FRAME.classList.add('ms-fs'); document.body.classList.add('ms-fs-on'); }
    } else {
      if (FRAME.classList.contains('ms-fs')) { FRAME.classList.remove('ms-fs'); document.body.classList.remove('ms-fs-on'); }
      else if (document.exitFullscreen) document.exitFullscreen().catch(function () {});
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    }
    setTimeout(onResize, 120);
  }

  function refreshLang() {
    renderMenu(); renderPauseOpts();
    $('btnFs').title = T('fsTitle'); $('btnCam2').title = T('camTitle');
    if (player) { updateWeaponBar(true); }
    if (G.state !== 'menu' && D.LEVELS[G.level]) {
      $('lvName').innerHTML = '';
      $('lvName').appendChild(document.createTextNode(levelLabel(G.level) + ' · '));
      var bnm = document.createElement('b'); bnm.textContent = sectorName(G.level); $('lvName').appendChild(bnm);
    }
    if (G.state === 'upgrade') {
      var cards = $('upCards').children;
      upChoices.forEach(function (u, i) { if (cards[i]) { cards[i].querySelector('.un').textContent = T('u_' + u.id); cards[i].querySelector('.ud').textContent = T('u_' + u.id + '_d'); } });
    }
    hudCache = {};
  }

  /* ============ init & wiring ============ */
  function init() {
    try { initThree(); }
    catch (err) {
      $('webglMsg').classList.remove('hidden');
      $('btnStart').disabled = true;
      KIT.boot(refreshLang);
      return;
    }
    Particles.init(); Rings.init(); Flashes.init(); DmgNums.init(); Decals.init(); Ambient.init();
    initProjectiles(); initPickups();
    createPlayer();
    player.group.position.set(0, 0, 6);
    buildArena(2, 2);
    setupTouch();
    if (window.ResizeObserver) new ResizeObserver(function () { onResize(); }).observe(FRAME);
    else addEventListener('resize', onResize);
    document.addEventListener('fullscreenchange', function () { setTimeout(onResize, 60); $('btnFs').classList.toggle('on', isFs()); });
    document.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('button'); if (b) b.blur(); });
    $('btnStart').addEventListener('click', function () { begin(0); });
    $('btnAgain').addEventListener('click', function () { AudioSys.init(); AudioSys.uiClick(); begin(G.startLevel); });
    $('btnContinue').addEventListener('click', function () { AudioSys.init(); AudioSys.uiClick(); continueRun(); });
    $('btnMenu').addEventListener('click', function () { AudioSys.uiClick(); toMenu(); });
    $('btnMenu2').addEventListener('click', function () { AudioSys.uiClick(); toMenu(); });
    $('btnResume').addEventListener('click', function () { AudioSys.uiClick(); setPaused(false); });
    $('btnRestart2').addEventListener('click', function () { AudioSys.uiClick(); $('pauseScr').classList.add('hidden'); continueRun(); });
    $('btnPause').addEventListener('click', function () { AudioSys.init(); if (G.state === 'playing') setPaused(true); else setPaused(false); });
    $('btnFs').addEventListener('click', function () { toggleFullscreen(); });
    $('btnFs2').addEventListener('click', function () { toggleFullscreen(); });
    $('btnCam2').addEventListener('click', function () { AudioSys.init(); if (G.state === 'playing') camCycle(); });
    $('optQuality').addEventListener('change', function (e) {
      SAVE.quality = e.target.value; store.set('quality', SAVE.quality);
      qLevel = SAVE.quality === 'auto' ? (IS_TOUCH ? 'medium' : 'high') : SAVE.quality; applyQuality(); renderPauseOpts();
    });
    $('optShake').addEventListener('change', function (e) { SAVE.shake = e.target.checked; store.set('shake', SAVE.shake); });
    KIT.mountMute($('btnMute'));
    KIT.boot(refreshLang);
    if (DEBUG) document.body.classList.add('ms-debug');
    requestAnimationFrame(loop);
  }
  var booted = false;
  function boot() { if (booted) return; booted = true; setTimeout(init, 30); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
