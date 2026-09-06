'use strict';
var STR = window.GAME_STR || { zh: {}, en: {} };
var T = (k, ...a) => AMG.tf(STR, k, ...a);
const Input = {
  keys: {},
  padPrev: [],
  init(canvas) {
    window.addEventListener('keydown', e => {
      this.keys[e.code] = true;
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
      if (e.code === 'KeyP') Game.togglePause();
      if (e.code === 'KeyM') Game.toMenu();
      if (e.code === 'Enter') Game.tryContinue();
      if (e.code === 'Space') { AudioSys.ensure(); }
    });
    window.addEventListener('keyup', e => { this.keys[e.code] = false; });
    // touch: drag = P1 move + autofire
    let touchId = null, lastPos = null;
    const getP1 = () => Game.players[0];
    const toGame = (t) => {
      const r = canvas.getBoundingClientRect();
      return { x: (t.clientX - r.left) / r.width * CFG.W, y: (t.clientY - r.top) / r.height * CFG.H };
    };
    canvas.addEventListener('touchstart', e => {
      AudioSys.ensure();
      for (const t of e.changedTouches) {
        if (touchId === null) { touchId = t.identifier; lastPos = toGame(t); }
        else { const p = getP1(); const q = Game.players[1]; (q && q.alive ? q : p)?.tryBomb(true); }
      }
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchmove', e => {
      for (const t of e.changedTouches) if (t.identifier === touchId) {
        const p = toGame(t); const pl = getP1();
        if (pl && pl.alive) { pl.x = p.x; pl.y = p.y; pl.touching = true; }
        lastPos = p;
      }
      e.preventDefault();
    }, { passive: false });
    const endTouch = e => {
      for (const t of e.changedTouches) if (t.identifier === touchId) { touchId = null; const pl = getP1(); if (pl) pl.touching = false; }
    };
    canvas.addEventListener('touchend', endTouch); canvas.addEventListener('touchcancel', endTouch);
    // mouse drag also controls P1 (for desktop testing)
    let mouseDown = false;
    canvas.addEventListener('mousedown', e => { mouseDown = true; AudioSys.ensure(); });
    window.addEventListener('mouseup', () => {
      mouseDown = false; const pl = getP1(); if (pl) pl.touching = false;
    });
    canvas.addEventListener('mousemove', e => {
      if (!mouseDown || !Game.running) return;
      const r = canvas.getBoundingClientRect();
      const pl = getP1();
      if (pl && pl.alive) {
        pl.x = (e.clientX - r.left) / r.width * CFG.W;
        pl.y = (e.clientY - r.top) / r.height * CFG.H;
        pl.touching = true;
      }
    });
  },
  p1() {
    const k = this.keys;
    return {
      dx: (k['KeyD'] ? 1 : 0) - (k['KeyA'] ? 1 : 0),
      dy: (k['KeyS'] ? 1 : 0) - (k['KeyW'] ? 1 : 0),
      fire: !!(k['KeyJ'] || k['Space']),
      bomb: !!(k['KeyK'] || k['KeyL']),
    };
  },
  p2() {
    const k = this.keys;
    return {
      dx: (k['ArrowRight'] ? 1 : 0) - (k['ArrowLeft'] ? 1 : 0),
      dy: (k['ArrowDown'] ? 1 : 0) - (k['ArrowUp'] ? 1 : 0),
      fire: !!(k['Comma']),
      bomb: !!(k['Period'] || k['Slash']),
    };
  }
};
