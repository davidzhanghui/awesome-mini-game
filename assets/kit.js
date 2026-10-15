/* AMG game kit — shared helpers for the rebuilt games. Zero dependencies.
 * Load after i18n.js and bgm.js, before the game's own script:
 *   <script src="../assets/bgm.js"></script>
 *   <script src="../assets/kit.js"></script>
 *
 *   KIT.$(id)                          getElementById
 *   KIT.T(key, ...args)                AMG.tf(window.GAME_STR, ...)
 *   KIT.store(ns)                      { get(k, def), set(k, v) } JSON localStorage, never throws
 *   KIT.canvas(el, W, H)               HiDPI-scaled 2d context in logical W×H units
 *   KIT.point(el, e, W, H)             pointer/touch event → logical coords
 *   KIT.swipe(el, cb)                  cb('up'|'down'|'left'|'right') on touch swipe
 *   KIT.dark()                         true when the page is in the dark theme
 *   KIT.onTheme(cb)                    called when <html data-theme> changes
 *   KIT.tone(f, dur, opt) / KIT.noise(dur, opt) / KIT.arp(freqs, gap, opt)
 *   KIT.music(name) / KIT.stopMusic()  procedural BGM via AMG_BGM
 *   KIT.mountMute(btn)                 🔊/🔇 toggle (shared AMG_AUDIO.muted, key M)
 *   KIT.toast(el, text)                one-shot floating banner
 *   KIT.Particles                      tiny particle system for canvas games
 *   KIT.boot(refresh)                  wires __refreshLang + language dropdown
 */
(function () {
  'use strict';
  var K = {};
  var A = window.AMG_AUDIO || { vol: 0.8, muted: false, save: function () {} };

  K.$ = function (id) { return document.getElementById(id); };
  K.T = function () {
    var args = [window.GAME_STR || { zh: {} }].concat([].slice.call(arguments));
    return window.AMG ? AMG.tf.apply(null, args) : arguments[0];
  };

  K.store = function (ns) {
    return {
      get: function (k, def) {
        try { var v = localStorage.getItem(ns + ':' + k); return v == null ? def : JSON.parse(v); } catch (e) { return def; }
      },
      set: function (k, v) { try { localStorage.setItem(ns + ':' + k, JSON.stringify(v)); } catch (e) {} }
    };
  };

  K.canvas = function (el, W, H) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    el.width = Math.round(W * dpr); el.height = Math.round(H * dpr);
    var c = el.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    return c;
  };

  K.point = function (el, e, W, H) {
    var r = el.getBoundingClientRect();
    var p = e.touches && e.touches[0] ? e.touches[0] : (e.changedTouches && e.changedTouches[0] ? e.changedTouches[0] : e);
    return { x: (p.clientX - r.left) / r.width * W, y: (p.clientY - r.top) / r.height * H };
  };

  K.swipe = function (el, cb, min) {
    var sx = 0, sy = 0, on = false;
    min = min || 24;
    el.addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1) return;
      on = true; sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    }, { passive: true });
    el.addEventListener('touchmove', function (e) {
      if (!on) return;
      var dx = e.touches[0].clientX - sx, dy = e.touches[0].clientY - sy;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < min) return;
      on = false;
      cb(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
    }, { passive: true });
    el.addEventListener('touchend', function () { on = false; }, { passive: true });
  };

  K.dark = function () { return document.documentElement.dataset.theme === 'dark'; };
  K.onTheme = function (cb) {
    try {
      new MutationObserver(function () { cb(K.dark()); })
        .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    } catch (e) {}
  };

  // ---------------- audio ----------------
  var ac = null, master = null, sfxBus = null;
  function audio() {
    if (!ac) {
      try {
        ac = new (window.AudioContext || window.webkitAudioContext)();
        master = ac.createGain(); master.connect(ac.destination);
        sfxBus = ac.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
        applyVol();
        if (window.AMG_BGM) AMG_BGM.init(ac, master);
      } catch (e) { ac = null; return null; }
    }
    if (ac.state === 'suspended') { try { ac.resume(); } catch (e) {} }
    return ac;
  }
  function applyVol() { if (master) master.gain.value = A.muted ? 0 : A.vol; }
  K.audio = audio;

  // opt: { type, vol, to (end freq), delay, attack }
  K.tone = function (f, dur, opt) {
    opt = opt || {};
    if (A.muted || !audio()) return;
    var t = ac.currentTime + (opt.delay || 0);
    var o = ac.createOscillator(), g = ac.createGain();
    o.type = opt.type || 'sine';
    o.frequency.setValueAtTime(f, t);
    if (opt.to) o.frequency.exponentialRampToValueAtTime(opt.to, t + dur);
    var v = opt.vol == null ? 0.08 : opt.vol;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + (opt.attack || 0.008));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(sfxBus);
    o.start(t); o.stop(t + dur + 0.03);
  };
  var noiseBuf = null;
  // opt: { vol, delay, hp, lp }
  K.noise = function (dur, opt) {
    opt = opt || {};
    if (A.muted || !audio()) return;
    if (!noiseBuf) {
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    var t = ac.currentTime + (opt.delay || 0);
    var s = ac.createBufferSource(), g = ac.createGain(), node = s;
    s.buffer = noiseBuf;
    if (opt.hp) { var h = ac.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = opt.hp; node.connect(h); node = h; }
    if (opt.lp) { var l = ac.createBiquadFilter(); l.type = 'lowpass'; l.frequency.value = opt.lp; node.connect(l); node = l; }
    g.gain.setValueAtTime(opt.vol == null ? 0.1 : opt.vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    node.connect(g); g.connect(sfxBus);
    s.start(t); s.stop(t + dur + 0.03);
  };
  K.arp = function (freqs, gap, opt) {
    opt = opt || {};
    for (var i = 0; i < freqs.length; i++) {
      K.tone(freqs[i], opt.dur || 0.16, { type: opt.type || 'triangle', vol: opt.vol, delay: (opt.delay || 0) + i * gap });
    }
  };

  var wantMusic = '';
  K.music = function (name) {
    wantMusic = name;
    if (!window.AMG_BGM || !audio()) return;
    AMG_BGM.play(name);
  };
  K.stopMusic = function () { wantMusic = ''; if (window.AMG_BGM) AMG_BGM.stop(); };

  K.mountMute = function (btn) {
    function sync() {
      btn.textContent = A.muted ? '🔇' : '🔊';
      btn.title = K.T('muteTitle');
    }
    function toggle() {
      A.muted = !A.muted; A.save();
      audio(); applyVol(); sync();
      if (!A.muted && wantMusic && window.AMG_BGM) AMG_BGM.play(wantMusic);
    }
    btn.addEventListener('click', toggle);
    document.addEventListener('keydown', function (e) {
      if ((e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.metaKey && !(e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName))) toggle();
    });
    sync();
    return sync;
  };

  K.toast = function (el, text, color) {
    el.textContent = text;
    el.style.color = color || '';
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  };

  // ---------------- particles ----------------
  function Particles() { this.list = []; }
  // opt: { n, color(s), speed, life, size, gravity, shape:'dot'|'square'|'spark', spread }
  Particles.prototype.burst = function (x, y, opt) {
    opt = opt || {};
    var n = opt.n || 14, cols = [].concat(opt.color || '#fff');
    for (var i = 0; i < n; i++) {
      var a = opt.angle != null ? opt.angle + (Math.random() - 0.5) * (opt.spread || Math.PI * 2) : Math.random() * Math.PI * 2;
      var sp = (opt.speed || 160) * (0.35 + Math.random() * 0.75);
      this.list.push({
        x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: (opt.life || 0.7) * (0.6 + Math.random() * 0.5), age: 0,
        size: (opt.size || 4) * (0.6 + Math.random() * 0.7),
        g: opt.gravity == null ? 420 : opt.gravity,
        c: cols[(Math.random() * cols.length) | 0], shape: opt.shape || 'dot',
        rot: Math.random() * 6, vr: (Math.random() - 0.5) * 12
      });
    }
  };
  Particles.prototype.update = function (dt) {
    var L = this.list;
    for (var i = L.length - 1; i >= 0; i--) {
      var p = L[i];
      p.age += dt;
      if (p.age >= p.life) { L.splice(i, 1); continue; }
      p.vy += p.g * dt; p.vx *= 0.985;
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    }
  };
  Particles.prototype.draw = function (c) {
    var L = this.list;
    for (var i = 0; i < L.length; i++) {
      var p = L[i], k = 1 - p.age / p.life;
      c.globalAlpha = Math.min(1, k * 1.4);
      c.fillStyle = p.c;
      if (p.shape === 'square') {
        c.save(); c.translate(p.x, p.y); c.rotate(p.rot);
        c.fillRect(-p.size / 2, -p.size / 2, p.size, p.size); c.restore();
      } else if (p.shape === 'spark') {
        c.strokeStyle = p.c; c.lineWidth = p.size * 0.5 * k + 0.5; c.lineCap = 'round';
        c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04); c.stroke();
      } else {
        c.beginPath(); c.arc(p.x, p.y, p.size * (0.4 + k * 0.6), 0, Math.PI * 2); c.fill();
      }
    }
    c.globalAlpha = 1;
  };
  Particles.prototype.clear = function () { this.list.length = 0; };
  K.Particles = Particles;

  K.rand = function (a, b) { return a + Math.random() * (b - a); };
  K.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  K.ease = {
    outBack: function (t) { var s = 1.70158; t -= 1; return t * t * ((s + 1) * t + s) + 1; },
    outCubic: function (t) { t -= 1; return t * t * t + 1; },
    inOut: function (t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
  };
  K.roundRect = function (c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  };

  // Language wiring: refresh() re-renders game-specific dynamic texts.
  K.boot = function (refresh) {
    window.__refreshLang = function () {
      if (window.AMG) AMG.apply(window.GAME_STR);
      if (refresh) refresh();
    };
    if (window.AMG) AMG.mountBtn();
    window.__refreshLang();
  };

  window.KIT = K;
})();
