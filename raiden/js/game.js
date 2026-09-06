'use strict';

const Game = {
  canvas: null, ctx: null,
  running: false, paused: false, over: false, victory: false,
  players: [], enemies: [], bullets: [], foeBullets: [], pickups: [], parts: [], toasts: [],
  boss: null, bossActive: false,
  stageIdx: 0, stageTime: 0, spawnT: 0, scrollY: 0,
  waveIdx: 0, trickleT: 5, betweenStages: false, BOSS_AT: 90,
  combo: 0, comboT: 0, medalChain: 0, stock: 5,
  shake: 0, bombT: 0, bombOwner: null,
  diff: 1, autofire: true, assist: false, dmgMul: 1,
  hi: 0, kills: 0, playT: 0, cardT: 0,
  star: null,

  init(canvas) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d');
    this.hi = parseInt(localStorage.getItem(CFG.STORE_HI) || '0', 10) || 0;
    this.star = new Starfield(110);
    this.updateHi();
  },
  updateHi() { document.getElementById('hi-score-top').textContent = 'HI-SCORE ' + this.hi.toLocaleString(); },

  start(nPlayers, stage, diff, autofire, assist) {
    this.running = true; this.paused = false; this.over = false; this.victory = false;
    this.nPlayers = nPlayers; this.diff = diff; this.autofire = autofire; this.assist = assist;
    this.dmgMul = nPlayers > 1 ? 0.85 : 1;
    this.stageIdx = stage;
    this.stock = nPlayers > 1 ? 8 : 5;
    this.kills = 0; this.playT = 0;
    this.players = [];
    for (let i = 0; i < nPlayers; i++) this.players.push(new Player(i, this));
    if (nPlayers === 1) this.stock = 5;
    this.enterStage(stage, true);
    document.getElementById('menu-screen').classList.remove('active');
    document.getElementById('game-screen').classList.add('active');
    document.getElementById('end-modal').classList.add('hidden');
  },

  enterStage(idx, fresh) {
    this.stageIdx = idx; this.stageTime = 0; this.spawnT = 1.2; this.scrollY = 0;
    this.waveIdx = 0; this.trickleT = 2.5; this.betweenStages = false;
    this.enemies.length = 0; this.foeBullets.length = 0;
    this.boss = null; this.bossActive = false;
    this.combo = 0; this.medalChain = 0;
    if (!fresh) {
      for (const p of this.players) { if (!p.alive && this.stock > 0) { this.stock--; p.reset(false); } else { p.inv = 2; p.x = CFG.W / 2 + (p.idx === 0 ? -70 : 70); p.y = CFG.H - 110; p.alive = true; } }
    }
    const s = CFG.STAGES[idx];
    document.getElementById('stage-card-kicker').textContent = s.en;
    document.getElementById('stage-card-title').textContent = 'STAGE ' + (idx + 1) + ' · ' + s.name;
    document.getElementById('stage-card-desc').textContent = s.desc;
    const card = document.getElementById('stage-card');
    card.classList.add('show'); this.cardT = 3.2;
    AudioSys.warn();
    this.toast(s.en, 3);
  },

  toMenu() {
    this.running = false;
    document.getElementById('game-screen').classList.remove('active');
    document.getElementById('menu-screen').classList.add('active');
    document.getElementById('pause-tip').style.display = 'none';
  },
  togglePause() {
    if (!this.running || this.over) return;
    this.paused = !this.paused;
    document.getElementById('pause-tip').style.display = this.paused ? 'block' : 'none';
  },
  tryContinue() {
    if (!this.running || !this.over) return;
    this.stock += 4;
    for (const p of this.players) { p.reset(false); p.score = Math.floor(p.score / 2); }
    this.over = false;
    document.getElementById('end-modal').classList.add('hidden');
    this.toast('CONTINUE! 续关!', 2);
  },

  toast(text, ttl = 1.6) { this.toasts.push({ text, ttl, age: 0 }); },
  totalScore() { return this.players.reduce((a, p) => a + p.score, 0); },

  nearestPlayer(x, y) {
    let best = null, bd = 1e18;
    for (const p of this.players) { if (!p.alive) continue; const d = dist2(x, y, p.x, p.y); if (d < bd) { bd = d; best = p; } }
    return best;
  },
  nearestFoe(x, y) {
    let best = null, bd = 1e18;
    for (const e of this.enemies) { const d = dist2(x, y, e.x, e.y); if (d < bd) { bd = d; best = e; } }
    if (this.boss) { const d = dist2(x, y, this.boss.x, this.boss.y); if (d < bd) { bd = d; best = this.boss; } }
    return best;
  },

  director(dt) {
    this.stageTime += dt;
    if (!this.bossActive && this.stageTime >= this.BOSS_AT) {
      this.bossActive = true;
      this.enemies.length = 0;
      this.boss = new Boss(this.stageIdx, this.diff, this.players.length);
      const w = document.getElementById('warn');
      w.style.display = 'block'; AudioSys.warn();
      setTimeout(() => { w.style.display = 'none'; }, 2600);
      this.toast('⚠ ' + this.boss.name + ' 接近! ⚠', 2.6);
      document.getElementById('boss-name').textContent = CFG.STAGES[this.stageIdx].bossEn + ' · ' + this.boss.name;
      return;
    }
    if (this.bossActive) return;

    // 1) 固定波次:按时间轴精确刷出,同一关每次都一样,可背板
    const script = STAGE_WAVES[this.stageIdx] || [];
    while (this.waveIdx < script.length && this.stageTime >= script[this.waveIdx].t) {
      const w = script[this.waveIdx++];
      if (w.f === 'bonus') WaveKit.spawn(this, w); // 补给不受敌机上限影响
      else if (this.enemies.length < 30) WaveKit.spawn(this, w);
      if (w.say && w.f !== 'bonus') this.toast(w.say, 1.4);
      AudioSys.pickup();
    }

    // 2) 随机涓流:填补波次间隙,重型单位(turret/gunboat/carrier)依然只走固定脚本
    this.trickleT -= dt;
    if (this.trickleT <= 0) {
      this.trickleT = rand(1.6, 2.8) / this.diff;
      const pool = STAGE_TRICKLE[this.stageIdx] || ['scout'];
      if (this.enemies.length < 22) {
        const n = 1 + (chance(0.45) ? 1 : 0) + (this.stageIdx >= 4 && chance(0.3) ? 1 : 0);
        for (let i = 0; i < n; i++) {
          const type = pool[randi(0, pool.length - 1)];
          let x = rand(60, CFG.W - 60), y = -30;
          if (chance(0.3)) { x = chance(0.5) ? -20 : CFG.W + 20; y = rand(60, 300); }
          if (type === 'tank') { x = rand(80, CFG.W - 80); y = rand(-40, 40); }
          this.enemies.push(new Enemy(type, x, y, this.stageIdx, this.diff));
        }
      }
      if (chance(0.012)) this.pickups.push(new Pickup('FAIRY', rand(80, CFG.W - 80), -20));
      if (chance(0.004)) this.pickups.push(new Pickup('MICLUS', rand(80, CFG.W - 80), -20));
    }
  },

  dropTable(enemy) {
    const r = Math.random();
    let kind = null;
    if (enemy === 'DROP') { /* forced */ }
    if (r < 0.22) kind = 'MEDAL';
    else if (r < 0.34) kind = 'P';
    else if (r < 0.42) kind = ['V', 'L', 'E'][randi(0, 2)];
    else if (r < 0.52) kind = 'M';
    else if (r < 0.60) kind = 'B';
    else if (r < 0.66) kind = 'O';
    else if (r < 0.76) kind = 'S';
    return kind;
  },

  dropOnDeath(p) {
    const kinds = ['P', p.weapon, 'M'];
    this.pickups.push(new Pickup(kinds[randi(0, kinds.length - 1)], clamp(p.x + rand(-30, 30), 30, CFG.W - 30), p.y));
  },

  killEnemy(e, idx) {
    this.enemies.splice(idx, 1);
    this.kills++; this.combo++; this.comboT = 3;
    const mult = 1 + Math.min(this.combo, 100) * 0.02;
    const killer = this.nearestPlayer(e.x, e.y) || this.players[0];
    killer.score += Math.round(e.score * mult);
    spawnExplosion(this.parts, e.x, e.y, e.type === 'carrier' ? 1.6 : 1);
    AudioSys.boom();
    if (e.type === 'splitter') {
      for (const dx of [-24, 24]) this.enemies.push(new Enemy('scout', e.x + dx, e.y, this.stageIdx, this.diff));
    }
    const roll = Math.random();
    const dropChance = e.type === 'carrier' ? 1 : e.type === 'tank' ? 0.5 : 0.3;
    if (roll < dropChance) {
      const k = this.dropTable(e.type);
      if (k) this.pickups.push(new Pickup(k, e.x, e.y));
    } else if (roll < dropChance + 0.12) {
      this.pickups.push(new Pickup('MEDAL', e.x, e.y));
    }
  },

  update(dt) {
    if (!this.running || this.paused || this.over) return;
    this.playT += dt;
    this.scrollY += dt * (this.bossActive ? 40 : 130);
    this.star.update(dt, this.bossActive ? 0.4 : 1.4);
    this.shake = Math.max(0, this.shake - dt * 30);
    this.bombT = Math.max(0, this.bombT - dt);
    if (this.cardT > 0) { this.cardT -= dt; if (this.cardT <= 0) document.getElementById('stage-card').classList.remove('show'); }
    this.comboT -= dt; if (this.comboT <= 0) this.combo = 0;

    const c1 = Input.p1(), c2 = Input.p2();
    this.players[0]?.update(dt, c1);
    if (this.players[1]) this.players[1].update(dt, c2);

    this.director(dt);

    for (const e of this.enemies) e.update(dt, this);
    if (this.boss) {
      this.boss.update(dt, this);
      document.getElementById('boss-fill').style.width = (100 * Math.max(0, this.boss.hp) / this.boss.maxhp).toFixed(1) + '%';
      if (this.boss.hp <= 0) this.onBossDown();
    } else {
      document.getElementById('boss-fill').style.width = '0';
    }

    for (const b of this.bullets) b.update(dt, this);
    for (const b of this.foeBullets) b.update(dt, this);
    for (const p of this.pickups) p.update(dt);
    updateParts(this.parts, dt);
    for (let i = this.toasts.length - 1; i >= 0; i--) { this.toasts[i].age += dt; if (this.toasts[i].age >= this.toasts[i].ttl) this.toasts.splice(i, 1); }

    this.collide();

    this.enemies = this.enemies.filter(e => e.y < CFG.H + 80 && e.x > -100 && e.x < CFG.W + 100 && e.hp > 0);
    this.bullets = this.bullets.filter(b => b.life > 0 && b.y > -60 && b.y < CFG.H + 60 && b.x > -60 && b.x < CFG.W + 60);
    this.foeBullets = this.foeBullets.filter(b => b.life > 0 && b.y > -60 && b.y < CFG.H + 60 && b.x > -60 && b.x < CFG.W + 60);
    this.pickups = this.pickups.filter(p => p.life > 0 && p.y < CFG.H + 40);

    const total = this.totalScore();
    if (total > this.hi) { this.hi = total; localStorage.setItem(CFG.STORE_HI, String(this.hi)); this.updateHi(); }

    if (this.stock <= 0 && this.players.every(p => !p.alive)) this.gameOver(false);

    this.hud();
  },

  onBossDown() {
    const b = this.boss; this.boss = null; this.bossActive = false;
    document.getElementById('boss-fill').style.width = '0';
    document.getElementById('boss-name').textContent = '—';
    spawnExplosion(this.parts, b.x, b.y, 4);
    AudioSys.boom(); setTimeout(() => AudioSys.boom(), 200);
    this.shake = 14;
    const bonus = CFG.SCORES.bossBonus[this.stageIdx] || 50000;
    for (const p of this.players) if (p.alive) p.score += Math.round(bonus / this.players.filter(q => q.alive).length);
    this.foeBullets.length = 0;
    this.toast(`STAGE ${this.stageIdx + 1} CLEAR! +${bonus.toLocaleString()}`, 3);
    this.pickups.push(new Pickup('B', b.x - 40, b.y), new Pickup('P', b.x, b.y), new Pickup('MEDAL', b.x + 40, b.y));
    if (this.stageIdx >= 7) { this.gameOver(true); return; }
    setTimeout(() => { if (this.running && !this.over) this.enterStage(this.stageIdx + 1, false); }, 2600);
    this.stageTime = -3; // brief breather (director paused-ish since bossActive false but stageTime negative delays spawns? boss check needs stageTime>=62 so fine)
    this.bossActive = false;
    // prevent immediate boss trigger: stageTime reset happens in enterStage
  },

  gameOver(win) {
    this.over = true; this.victory = win;
    const total = this.totalScore();
    const t = document.getElementById('end-title'), s = document.getElementById('end-sub'), st = document.getElementById('end-stats');
    if (win) {
      t.textContent = '🏆 MISSION COMPLETE!';
      s.textContent = '8 大关卡全部突破 —— 地球得救了!通关奖励 +1,000,000!';
      for (const p of this.players) p.score += Math.round(1000000 / this.players.length);
    } else {
      t.textContent = 'GAME OVER';
      s.textContent = '战机全部坠毁 —— 按回车投币续关，或返回菜单再战!';
    }
    st.innerHTML = `总分 <b>${this.totalScore().toLocaleString()}</b> · 击坠 ${this.kills} · 用时 ${Math.floor(this.playT / 60)}:${String(Math.floor(this.playT % 60)).padStart(2, '0')} · 到达 STAGE ${this.stageIdx + 1}<br>` +
      this.players.map(p => `${p.name}: ${p.score.toLocaleString()} · 武器${p.weapon} Lv.${p.wlv} · 炸弹${p.bombs}`).join('<br>');
    document.getElementById('end-modal').classList.remove('hidden');
  },

  collide() {
    // friendly bullets vs enemies / boss
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      let hit = false;
      for (let j = this.enemies.length - 1; j >= 0; j--) {
        const e = this.enemies[j];
        const rr = (e.type === 'carrier' ? 26 : e.type === 'tank' ? 16 : 12) + b.r;
        if (dist2(b.x, b.y, e.x, e.y) < rr * rr) {
          e.hp -= b.dmg; e.flash = 0.08; hit = true;
          if (e.hp <= 0) this.killEnemy(e, j);
          if (b.pierce > 0) { b.pierce--; hit = false; }
          break;
        }
      }
      if (!hit && this.boss && this.boss.y > 0) {
        const rr = this.boss.r + b.r;
        if (dist2(b.x, b.y, this.boss.x, this.boss.y) < rr * rr) {
          this.boss.hp -= b.dmg; this.boss.flash = 0.06; hit = true;
          if (b.pierce > 0) { b.pierce--; hit = false; }
        }
      }
      if (hit) { this.bullets.splice(i, 1); spawnExplosion(this.parts, b.x, b.y, 0.25, ['#fff', '#ffd34d']); }
    }
    // foe bullets / enemies vs players
    for (const p of this.players) {
      if (!p.alive) continue;
      for (let i = this.foeBullets.length - 1; i >= 0; i--) {
        const b = this.foeBullets[i];
        if (dist2(b.x, b.y, p.x, p.y - 2) < (b.r + 8) * (b.r + 8)) {
          this.foeBullets.splice(i, 1);
          if (p.die(this)) break;
        }
      }
      if (!p.alive) continue;
      for (const e of this.enemies) {
        const rr = (e.type === 'carrier' ? 26 : 14) + 10;
        if (dist2(e.x, e.y, p.x, p.y) < rr * rr) {
          e.hp -= 50; e.flash = 0.1;
          if (p.die(this)) break;
        }
      }
      if (!p.alive) continue;
      if (this.boss && this.boss.y > 0) {
        if (dist2(this.boss.x, this.boss.y, p.x, p.y) < (this.boss.r + 8) * (this.boss.r + 8)) p.die(this);
      }
      if (!p.alive) continue;
      for (let i = this.pickups.length - 1; i >= 0; i--) {
        const k = this.pickups[i];
        if (dist2(k.x, k.y, p.x, p.y) < 26 * 26) {
          this.pickups.splice(i, 1);
          p.applyPickup(k.kind, this);
        }
      }
    }
  },

  drawGround(ctx) {
    const s = CFG.STAGES[this.stageIdx];
    const g = ctx.createLinearGradient(0, 0, 0, CFG.H);
    g.addColorStop(0, s.sky[0]); g.addColorStop(0.55, s.sky[1]); g.addColorStop(0.551, s.ground); g.addColorStop(1, '#02040a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, CFG.W, CFG.H);
    // scrolling terrain bands
    ctx.save(); ctx.globalAlpha = 0.5;
    const off = this.scrollY % 90;
    ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.lineWidth = 2;
    for (let y = -90 + off; y < CFG.H; y += 90) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CFG.W, y); ctx.stroke();
    }
    // terrain blobs (deterministic pseudo-random by row)
    for (let y = -90 + off; y < CFG.H; y += 90) {
      const row = Math.floor((y + this.scrollY) / 90);
      let seed = (row * 2654435761) % 1000 / 1000;
      for (let k = 0; k < 4; k++) {
        seed = (seed * 9301 + 49297) % 233280 / 233280;
        const bx = seed * CFG.W, bw = 30 + seed * 90;
        ctx.fillStyle = 'rgba(0,0,0,.25)';
        ctx.beginPath(); ctx.ellipse(bx, y + 22, bw, 12, 0, 0, 7); ctx.fill();
      }
    }
    ctx.restore();
    // water shimmer for sea stage
    if (this.stageIdx === 2) {
      ctx.save(); ctx.globalAlpha = 0.25; ctx.fillStyle = '#9adcff';
      for (let i = 0; i < 8; i++) {
        const y = (i * 97 + this.scrollY * 1.5) % CFG.H;
        ctx.fillRect(0, y, CFG.W, 2);
      }
      ctx.restore();
    }
  },

  render() {
    const ctx = this.ctx;
    ctx.save();
    if (this.shake > 0 && document.getElementById('opt-shake')?.checked !== false)
      ctx.translate(rand(-this.shake, this.shake) * 0.5, rand(-this.shake, this.shake) * 0.5);
    this.drawGround(ctx);
    this.star.draw(ctx);
    for (const p of this.pickups) drawPower(ctx, p);
    for (const e of this.enemies) drawEnemy(ctx, e);
    if (this.boss) this.boss.draw(ctx);
    for (const b of this.foeBullets) b.draw(ctx);
    for (const b of this.bullets) b.draw(ctx);
    for (const p of this.players) p.draw(ctx);
    drawParts(ctx, this.parts);
    // bomb flash
    if (this.bombT > 0) {
      ctx.fillStyle = `rgba(120,240,255,${0.25 * (this.bombT / 1.6)})`;
      ctx.fillRect(-20, -20, CFG.W + 40, CFG.H + 40);
      ctx.strokeStyle = `rgba(255,255,255,${this.bombT})`; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(this.bombOwner?.x || CFG.W / 2, this.bombOwner?.y || CFG.H / 2, (1.6 - this.bombT) * 700, 0, 7); ctx.stroke();
    }
    // charge bars under players
    for (const p of this.players) {
      if (!p.alive || p.charge < 0.15) continue;
      ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(p.x - 20, p.y + 30, 40, 4);
      ctx.fillStyle = p.charge >= 1.2 ? '#ffd34d' : '#38e1ff';
      ctx.fillRect(p.x - 20, p.y + 30, 40 * Math.min(1, p.charge / 1.4), 4);
    }
    // toasts
    ctx.textAlign = 'center';
    this.toasts.forEach((t, i) => {
      const a = 1 - t.age / t.ttl;
      ctx.globalAlpha = Math.min(1, a * 2);
      ctx.font = 'bold 26px sans-serif';
      ctx.fillStyle = '#ffd34d'; ctx.shadowColor = '#ff3d6e'; ctx.shadowBlur = 16;
      ctx.fillText(t.text, CFG.W / 2, 200 + i * 36);
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    });
    // dead-player respawn hints
    ctx.font = 'bold 15px sans-serif';
    this.players.forEach((p, i) => {
      if (!p.alive && this.stock > 0 && this.running && !this.over) {
        ctx.fillStyle = i === 0 ? '#ff8ba0' : '#8bb4ff';
        ctx.fillText(`${p.name} ${Math.ceil(p.respawnT)}秒后复活… (剩余备用机 ${this.stock})`, CFG.W / 2, CFG.H - 60 - i * 24);
      }
    });
    ctx.restore();
    // vignette
    const v = ctx.createRadialGradient(CFG.W / 2, CFG.H / 2, CFG.H * 0.35, CFG.W / 2, CFG.H / 2, CFG.H * 0.8);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.45)');
    ctx.fillStyle = v; ctx.fillRect(0, 0, CFG.W, CFG.H);
  },

  hud() {
    const f = (id, v) => { document.getElementById(id).textContent = v; };
    const p1 = this.players[0], p2 = this.players[1];
    f('hud-s1', (p1?.score || 0).toLocaleString());
    f('hud-s2', p2 ? p2.score.toLocaleString() : '—');
    f('hud-total', this.totalScore().toLocaleString());
    f('hud-combo', 'x' + this.combo);
    f('hud-medal', this.medalChain);
    const wpn = p => p ? `${p.weapon==='V'?'火神':p.weapon==='L'?'激光':'等离子'} Lv.${p.wlv} · ${p.mtype === 'H' ? '追踪' : '核弹'}M${p.mlv} · 炸弹${p.bombs}${p.options ? ' · 僚机' + p.options : ''}${p.alive ? '' : ' · 阵亡'}` : '—';
    f('hud-p1', 'P1 ' + wpn(p1)); f('hud-p2', 'P2 ' + (p2 ? wpn(p2) : '未参战 (按2P模式开始)'));
    f('hud-l1', p1 ? '✈'.repeat(Math.max(0, Math.min(9, this.stock))) + ` 备用机 ${this.stock}` : '');
    f('hud-l2', '');
  },

  frame(dt) {
    this.update(dt);
    if (this.running) this.render();
  }
};
