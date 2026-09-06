'use strict';
(function () {
  const canvas = document.getElementById('game');
  Game.init(canvas);
  Input.init(canvas);

  const strip = document.getElementById('stages-strip');
  CFG.STAGES.forEach((s, i) => {
    const d = document.createElement('div');
    d.className = 'stage-chip';
    d.innerHTML = `<b>STAGE ${i + 1}</b><span>${s.name}</span><br><span style="color:#ffb3c4">👹 ${s.boss}</span>`;
    d.title = s.desc;
    d.onclick = () => { document.getElementById('sel-stage').value = String(i); startGame(1, i); };
    strip.appendChild(d);
  });

  const opts = () => ({
    stage: parseInt(document.getElementById('sel-stage').value, 10) || 0,
    diff: parseFloat(document.getElementById('sel-diff').value) || 1,
    autofire: document.getElementById('opt-autofire').checked,
    assist: document.getElementById('opt-assist').checked,
  });

  function startGame(n, stageOverride) {
    AudioSys.ensure();
    const o = opts();
    Game.start(n, stageOverride !== undefined ? stageOverride : o.stage, o.diff, o.autofire, o.assist);
  }

  document.getElementById('btn-1p').onclick = () => startGame(1);
  document.getElementById('btn-2p').onclick = () => startGame(2);
  document.getElementById('btn-pause').onclick = () => Game.togglePause();
  document.getElementById('btn-quit').onclick = () => Game.toMenu();
  document.getElementById('btn-bomb1').onclick = () => Game.players[0]?.tryBomb(true);
  document.getElementById('btn-bomb2').onclick = () => Game.players[1]?.tryBomb(true);
  document.getElementById('btn-help').onclick = () => document.getElementById('help-modal').classList.remove('hidden');
  document.getElementById('btn-close-help').onclick = () => document.getElementById('help-modal').classList.add('hidden');
  document.getElementById('btn-again').onclick = () => { document.getElementById('end-modal').classList.add('hidden'); startGame(Game.nPlayers || 1, 0); };
  document.getElementById('btn-tomenu').onclick = () => { document.getElementById('end-modal').classList.add('hidden'); Game.toMenu(); };
  const snd = document.getElementById('btn-sound');
  snd.onclick = () => { AudioSys.enabled = !AudioSys.enabled; snd.textContent = AudioSys.enabled ? '🔊 声音开' : '🔇 声音关'; };
  document.getElementById('opt-shake').checked = true;

  // gamepad polling merged into input each frame
  let last = performance.now();
  function loop(now) {
    let dt = (now - last) / 1000; last = now;
    dt = Math.min(dt, 0.05);
    pollGamepads();
    Game.frame(dt);
    requestAnimationFrame(loop);
  }

  function pollGamepads() {
    try {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      const gp = pads && (pads[0] || pads[1]);
      const k = Input.keys;
      for (const c of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyJ', 'KeyK']) if (k[c] === 'pad') k[c] = false;
      if (!gp || !Game.running || Game.paused) return;
      const dz = v => Math.abs(v) > 0.25 ? v : 0;
      const ax = dz(gp.axes[0] || 0), ay = dz(gp.axes[1] || 0);
      if (ax < 0) k['KeyA'] = 'pad'; if (ax > 0) k['KeyD'] = 'pad';
      if (ay < 0) k['KeyW'] = 'pad'; if (ay > 0) k['KeyS'] = 'pad';
      if (gp.buttons[7]?.pressed || gp.buttons[0]?.pressed) k['KeyJ'] = 'pad';
      if (gp.buttons[6]?.pressed || gp.buttons[1]?.pressed) k['KeyK'] = 'pad';
    } catch (e) {}
  }

  // idle attract background on menu
  Game.renderMenuIdle = function () {
    if (Game.running) return;
    const ctx = Game.ctx;
    ctx.fillStyle = '#02040a'; ctx.fillRect(0, 0, CFG.W, CFG.H);
    Game.star.update(0.016, 0.5); Game.star.draw(ctx);
  };
  setInterval(() => { if (!Game.running) { Game.renderMenuIdle(); } }, 50);

  requestAnimationFrame(loop);
  window.__game = Game;
  window.__gameErrors = [];
  window.addEventListener('error', e => window.__gameErrors.push(String(e.message)));
})();
