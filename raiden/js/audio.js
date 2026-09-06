'use strict';
const AudioSys = {
  ctx: null, enabled: true,
  ensure() {
    if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  },
  tone(freq, dur = 0.08, type = 'square', vol = 0.12, slide = 0) {
    if (!this.enabled) return; this.ensure(); if (!this.ctx) return;
    const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.ctx.destination); o.start(t); o.stop(t + dur + 0.02);
  },
  shoot() { this.tone(880 + Math.random() * 200, 0.05, 'square', 0.05, -300); },
  laser() { this.tone(220, 0.12, 'sawtooth', 0.06, 400); },
  boom() { this.tone(120, 0.3, 'sawtooth', 0.2, -90); this.tone(60, 0.4, 'triangle', 0.25, -30); },
  hit() { this.tone(200, 0.06, 'square', 0.08, -80); },
  pickup() { this.tone(660, 0.08, 'square', 0.12); setTimeout(() => this.tone(990, 0.1, 'square', 0.12), 70); },
  bomb() { this.tone(80, 0.8, 'sawtooth', 0.3, -40); this.tone(400, 0.5, 'square', 0.1, -350); },
  warn() { for (let i = 0; i < 3; i++) setTimeout(() => this.tone(440, 0.25, 'square', 0.15), i * 300); },
  overdrive() { this.tone(150, 0.4, 'sawtooth', 0.2, 900); },
};
