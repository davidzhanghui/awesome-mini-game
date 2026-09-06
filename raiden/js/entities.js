'use strict';

class Bullet {
  constructor(o) {
    this.x = o.x; this.y = o.y; this.vx = o.vx || 0; this.vy = o.vy || -600;
    this.r = o.r || 4; this.dmg = o.dmg || 1; this.friendly = o.friendly !== false;
    this.kind = o.kind || 'v'; this.color = o.color || '#ffd34d';
    this.life = o.life || 2; this.t = 0; this.pierce = o.pierce || 0;
    this.homing = o.homing || 0; this.grow = o.grow || 0;
  }
  update(dt, game) {
    this.t += dt;
    if (this.friendly && this.homing > 0) {
      const tgt = game.nearestFoe(this.x, this.y);
      if (tgt) {
        const cur = Math.atan2(this.vy, this.vx);
        const want = Math.atan2(tgt.y - this.y, tgt.x - this.x);
        let d = want - cur;
        while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
        const ang = cur + clamp(d, -4 * dt, 4 * dt);
        const sp = Math.hypot(this.vx, this.vy);
        this.vx = Math.cos(ang) * sp; this.vy = Math.sin(ang) * sp;
      }
    }
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.life -= dt;
    if (this.grow) this.r += this.grow * dt;
  }
  draw(ctx) {
    ctx.save(); ctx.translate(this.x, this.y);
    if (this.kind === 'laser') {
      ctx.fillStyle = this.color; ctx.shadowColor = this.color; ctx.shadowBlur = 12;
      ctx.fillRect(-this.r, -16, this.r * 2, 32);
      ctx.fillStyle = '#fff'; ctx.fillRect(-this.r * 0.35, -16, this.r * 0.7, 32);
    } else if (this.kind === 'plasma') {
      ctx.shadowColor = this.color; ctx.shadowBlur = 14;
      ctx.fillStyle = this.color; ctx.beginPath(); ctx.arc(0, 0, this.r, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, this.r * 0.45, 0, 7); ctx.fill();
    } else if (!this.friendly) {
      ctx.shadowColor = '#ff3d3d'; ctx.shadowBlur = 8;
      ctx.fillStyle = this.color; ctx.beginPath(); ctx.arc(0, 0, this.r, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, this.r * 0.4, 0, 7); ctx.fill();
    } else {
      ctx.shadowColor = this.color; ctx.shadowBlur = 8;
      ctx.fillStyle = this.color;
      ctx.beginPath(); ctx.ellipse(0, 0, this.r * 0.7, this.r * 1.6, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(-1, -this.r, 2, this.r * 1.4);
    }
    ctx.restore();
  }
}

class Pickup {
  constructor(kind, x, y) { this.kind = kind; this.x = x; this.y = y; this.vy = 90; this.vx = rand(-20, 20); this.t = rand(0, 5); this.life = 12; }
  update(dt) { this.t += dt; this.y += this.vy * dt; this.x += this.vx * dt; this.life -= dt; if (this.x < 20) this.x = 20; if (this.x > CFG.W - 20) this.x = CFG.W - 20; }
}

class Enemy {
  constructor(type, x, y, stage, diff) {
    this.type = type; this.x = x; this.y = y; this.t = 0;
    this.stage = stage; this.diff = diff;
    const hpBase = { scout: 2, weaver: 4, chopper: 8, tank: 16, turret: 12, gunboat: 20, splitter: 6, kami: 3, carrier: 30 }[type] || 5;
    const scale = (1 + stage * 0.35) * diff;
    this.maxhp = Math.round(hpBase * scale); this.hp = this.maxhp;
    this.flash = 0; this.fireT = rand(0.5, 1.8); this.aim = Math.PI;
    this.vx = 0; this.vy = 60; this.seed = Math.random() * 10;
    if (type === 'scout') { this.vy = rand(120, 180); this.vx = rand(-60, 60); }
    if (type === 'weaver') { this.vy = rand(70, 110); }
    if (type === 'chopper') { this.vy = 55; this.vx = rand(-40, 40); }
    if (type === 'kami') { this.vy = rand(180, 260); }
    if (type === 'gunboat') { this.vy = 45; }
    if (type === 'carrier') { this.vy = 40; }
    if (type === 'tank' || type === 'turret') { this.vy = 30; }
    this.score = CFG.SCORES[type] || 100;
  }
  update(dt, game) {
    this.t += dt; this.flash = Math.max(0, this.flash - dt);
    const P = game.nearestPlayer(this.x, this.y);
    switch (this.type) {
      case 'scout': this.x += (this.vx + Math.sin(this.t * 3 + this.seed) * 60) * dt; this.y += this.vy * dt; break;
      case 'weaver': this.x += Math.sin(this.t * 2.2 + this.seed) * 220 * dt; this.y += this.vy * dt; break;
      case 'chopper': this.x += this.vx * dt; this.y += this.vy * dt; if (this.x < 60 || this.x > CFG.W - 60) this.vx *= -1; break;
      case 'kami':
        if (P) { const a = Math.atan2(P.y - this.y, P.x - this.x); const sp = 300; this.vx = Math.cos(a) * sp; this.vy = Math.sin(a) * sp; }
        this.x += this.vx * dt; this.y += this.vy * dt; break;
      case 'gunboat': this.y += this.vy * dt; this.x += Math.sin(this.t * 1.2 + this.seed) * 40 * dt; break;
      case 'splitter': this.x += Math.sin(this.t * 3 + this.seed) * 120 * dt; this.y += this.vy * dt + 30 * dt; break;
      default: this.y += this.vy * dt; this.x += this.vx * dt;
    }
    if (this.type === 'turret' && P) this.aim = Math.atan2(P.y - this.y, P.x - this.x) - Math.PI / 2 + Math.PI;
    this.fireT -= dt;
    if (this.fireT <= 0 && this.y > 0 && this.y < CFG.H - 160) {
      const onScreen = game.enemies.length + game.foeBullets.length;
      if (onScreen > 40) { this.fireT = 0.5; return; } // 全场太挤时哑火,防弹幕叠罗汉
      const base = { scout: 2.6, weaver: 2.2, chopper: 2.8, tank: 3.0, turret: 2.4, gunboat: 3.2, splitter: 3.0, kami: 99, carrier: 3.4 }[this.type] || 2.6;
      this.fireT = rand(base * 0.85, base * 1.3) / Math.sqrt(this.diff);
      this.shoot(game, P);
    }
  }
  shoot(game, P) {
    const sp = (185 + this.stage * 14) / Math.sqrt(game.players.length);
    const mk = (vx, vy, r = 4) => {
      if (game.foeBullets.length > 220) return; // 全局弹数硬上限
      game.foeBullets.push(new Bullet({ x: this.x, y: this.y + 8, vx, vy, r, dmg: 1, friendly: false, color: '#ff5d5d', life: 5 }));
    };
    if (!P) return;
    const a = Math.atan2(P.y - this.y, P.x - this.x);
    switch (this.type) {
      case 'scout': mk(Math.cos(a) * sp, Math.sin(a) * sp, 3.5); break;
      case 'weaver': for (let i = -1; i <= 1; i++) { const aa = a + i * 0.22; mk(Math.cos(aa) * sp, Math.sin(aa) * sp, 3.5); } break;
      case 'chopper': for (let i = 0; i < 2; i++) mk(rand(-50, 50), sp, 4); break;
      case 'gunboat': for (let i = 0; i < 3; i++) { const aa = Math.PI / 2 + (i - 1) * 0.2; mk(Math.cos(aa) * sp, Math.sin(aa) * sp, 4); } break;
      case 'carrier': for (let i = 0; i < 3; i++) { const aa = a + (i - 1) * 0.28; mk(Math.cos(aa) * sp, Math.sin(aa) * sp, 4); } break;
      case 'tank': mk(Math.cos(a) * sp * 1.1, Math.sin(a) * sp * 1.1, 4.5); break;
      case 'turret': mk(Math.cos(a) * sp * 1.2, Math.sin(a) * sp * 1.2, 4); break;
      case 'splitter': mk(0, sp, 4); break;
    }
  }
}

const BOSS_DEF = [
  { hp: 900, r: 52, score: 50000, name: '双联装要塞炮', mover: 'slide', atk: ['spread', 'aimed'] },
  { hp: 1400, r: 60, score: 80000, name: '重型轰炸机', mover: 'hover', atk: ['fan', 'spawn'] },
  { hp: 1900, r: 64, score: 120000, name: '深海航母', mover: 'slide', atk: ['fan', 'ring'] },
  { hp: 2400, r: 66, score: 160000, name: '沙漠利维坦', mover: 'dive', atk: ['spread', 'spawn'] },
  { hp: 3000, r: 70, score: 200000, name: '熔炉魔像', mover: 'hover', atk: ['ring', 'aimed5'] },
  { hp: 3700, r: 74, score: 260000, name: '苍穹堡垒', mover: 'slide', atk: ['fan', 'laser'] },
  { hp: 4500, r: 78, score: 320000, name: '轨道巨像', mover: 'hover', atk: ['ring', 'spawn', 'aimed5'] },
  { hp: 6000, r: 86, score: 500000, name: '异星母舰核心', mover: 'core', atk: ['ring', 'fan', 'spawn', 'laser'] },
];

class Boss {
  constructor(stage, diff, nPlayers) {
    const d = BOSS_DEF[stage];
    this.stage = stage; this.name = d.name; this.r = d.r;
    this.maxhp = Math.round(d.hp * diff * (nPlayers > 1 ? 1.6 : 1));
    this.hp = this.maxhp; this.t = 0; this.flash = 0;
    this.x = CFG.W / 2; this.y = -120; this.enterY = 130;
    this.atkT = 2; this.atkIdx = 0; this.atkSet = d.atk; this.mover = d.mover;
    this.spawnT = 3; this.score = d.score;
  }
  update(dt, game) {
    this.t += dt; this.flash = Math.max(0, this.flash - dt);
    if (this.y < this.enterY) { this.y += 90 * dt; return; }
    if (this.mover === 'slide') this.x = CFG.W / 2 + Math.sin(this.t * 0.7) * 260;
    else if (this.mover === 'hover') { this.x = CFG.W / 2 + Math.sin(this.t * 0.5) * 200; this.y = this.enterY + Math.sin(this.t * 1.1) * 30; }
    else if (this.mover === 'dive') { this.x = CFG.W / 2 + Math.sin(this.t * 0.9) * 300; this.y = this.enterY + Math.abs(Math.sin(this.t * 0.6)) * 60; }
    else if (this.mover === 'core') { this.x = CFG.W / 2 + Math.sin(this.t * 0.4) * 140; this.y = this.enterY + Math.sin(this.t * 0.8) * 20; }
    this.atkT -= dt; this.spawnT -= dt;
    if (this.atkT <= 0) {
      this.atkT = Math.max(1.2, 2.6 - this.stage * 0.12);
      const atk = this.atkSet[this.atkIdx % this.atkSet.length]; this.atkIdx++;
      this.attack(atk, game);
      AudioSys.hit();
    }
    if (this.spawnT <= 0 && this.atkSet.includes('spawn')) {
      this.spawnT = 5;
      for (let i = 0; i < 2 + Math.floor(this.stage / 3); i++)
        game.enemies.push(new Enemy('scout', this.x + rand(-80, 80), this.y + 40, this.stage, game.diff));
    }
  }
  attack(kind, game) {
    const P = game.nearestPlayer(this.x, this.y);
    const nP = game.players.length;
    const sp = (200 + this.stage * 16) / Math.sqrt(nP);
    const mk = (x, y, vx, vy, r = 5) => {
      if (game.foeBullets.length > 260) return;
      game.foeBullets.push(new Bullet({ x, y, vx, vy, r, dmg: 1, friendly: false, color: '#ff5d5d', life: 6 }));
    };
    const aimAt = (x, y, s, n = 1, spread = 0.2) => {
      if (!P) return; const a = Math.atan2(P.y - y, P.x - x);
      for (let i = 0; i < n; i++) { const aa = a + (i - (n - 1) / 2) * spread; mk(x, y, Math.cos(aa) * s, Math.sin(aa) * s); }
    };
    if (kind === 'spread' || kind === 'fan') {
      const n = 4 + Math.min(3, this.stage);
      for (let i = 0; i < n; i++) { const aa = Math.PI / 2 + (i - (n - 1) / 2) * 0.2; mk(this.x, this.y + 30, Math.cos(aa) * sp, Math.sin(aa) * sp); }
    } else if (kind === 'aimed') aimAt(this.x, this.y + 20, sp * 1.25, 3, 0.15);
    else if (kind === 'aimed5') aimAt(this.x, this.y + 20, sp * 1.3, 4, 0.18);
    else if (kind === 'ring') {
      const n = 10 + this.stage;
      for (let i = 0; i < n; i++) { const aa = (i / n) * Math.PI * 2 + this.t; mk(this.x, this.y, Math.cos(aa) * sp * 0.8, Math.sin(aa) * sp * 0.8, 4.5); }
    } else if (kind === 'laser') {
      for (let i = -1; i <= 1; i++) mk(this.x + i * 30, this.y + 30, i * 40, sp * 1.2, 5);
      aimAt(this.x, this.y + 20, sp * 1.4, 3, 0.2);
    } else if (kind === 'spawn') {
      game.enemies.push(new Enemy('weaver', this.x - 100, this.y, this.stage, game.diff));
      game.enemies.push(new Enemy('weaver', this.x + 100, this.y, this.stage, game.diff));
    }
  }
  draw(ctx) {
    ctx.save(); ctx.translate(this.x, this.y);
    const s = this.stage, flash = this.flash > 0;
    const body = c => flash ? '#fff' : c;
    ctx.shadowColor = '#ff3d6e'; ctx.shadowBlur = 24;
    if (s === 0) {
      ctx.fillStyle = body('#5a6e8a'); ctx.fillRect(-90, -24, 180, 52);
      ctx.fillStyle = body('#2e3d55'); ctx.fillRect(-90, -34, 180, 12);
      for (const sx of [-45, 45]) {
        ctx.fillStyle = body('#8899bb'); ctx.fillRect(sx - 14, -10, 28, 44);
        ctx.fillStyle = body('#ff3d6e'); ctx.beginPath(); ctx.arc(sx, 36, 8, 0, 7); ctx.fill();
      }
      ctx.fillStyle = body('#ffd34d'); ctx.beginPath(); ctx.arc(0, 0, 12, 0, 7); ctx.fill();
    } else if (s === 1) {
      ctx.fillStyle = body('#4a5a3a'); ctx.beginPath(); ctx.ellipse(0, 0, 95, 34, 0, 0, 7); ctx.fill();
      ctx.fillStyle = body('#2e3d22'); ctx.fillRect(-60, -44, 120, 20);
      ctx.fillStyle = body('#9adc5d'); for (let i = -3; i <= 3; i++) ctx.fillRect(i * 22 - 4, -8, 8, 16);
    } else if (s === 2) {
      ctx.fillStyle = body('#2e5a7a'); ctx.beginPath(); ctx.moveTo(0, 50); ctx.lineTo(100, -20); ctx.lineTo(60, -30); ctx.lineTo(-60, -30); ctx.lineTo(-100, -20); ctx.closePath(); ctx.fill();
      ctx.fillStyle = body('#9adcff'); ctx.fillRect(-14, -52, 28, 24);
      ctx.fillStyle = body('#ff3d6e'); for (const sx of [-60, -20, 20, 60]) { ctx.beginPath(); ctx.arc(sx, 0, 7, 0, 7); ctx.fill(); }
    } else if (s === 3) {
      ctx.rotate(Math.sin(this.t) * 0.08);
      ctx.fillStyle = body('#8a6e3a'); ctx.beginPath(); ctx.ellipse(0, 0, 90, 40, 0, 0, 7); ctx.fill();
      ctx.fillStyle = body('#5e4a1a'); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + this.t * 0.5; ctx.beginPath(); ctx.arc(Math.cos(a) * 60, Math.sin(a) * 26, 12, 0, 7); ctx.fill(); }
      ctx.fillStyle = body('#ffd34d'); ctx.beginPath(); ctx.arc(0, 0, 16, 0, 7); ctx.fill();
    } else if (s === 4) {
      ctx.fillStyle = body('#5a2e1a'); ctx.fillRect(-70, -40, 140, 90);
      ctx.fillStyle = body('#ff7a3d'); ctx.fillRect(-50, 10, 100, 14); ctx.fillRect(-50, -20, 100, 10);
      ctx.fillStyle = body('#ffd34d'); ctx.beginPath(); ctx.arc(-40, -50, 12, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(40, -50, 12, 0, 7); ctx.fill();
      ctx.fillStyle = body('#fff'); ctx.beginPath(); ctx.arc(0, 10, 14 + Math.sin(this.t * 6) * 3, 0, 7); ctx.fill();
    } else if (s === 5) {
      ctx.fillStyle = body('#3a4a6e'); ctx.beginPath(); ctx.moveTo(0, -50); ctx.lineTo(95, 20); ctx.lineTo(50, 45); ctx.lineTo(-50, 45); ctx.lineTo(-95, 20); ctx.closePath(); ctx.fill();
      ctx.fillStyle = body('#38e1ff'); for (const sx of [-55, 0, 55]) { ctx.beginPath(); ctx.arc(sx, 5, 9, 0, 7); ctx.fill(); }
      ctx.fillStyle = body('#cfe9ff'); ctx.fillRect(-8, -62, 16, 20);
    } else if (s === 6) {
      ctx.rotate(this.t * 0.3);
      ctx.fillStyle = body('#3a3a5e'); for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); ctx.fillRect(-12, -85, 24, 170); }
      ctx.rotate(-this.t * 0.3);
      ctx.fillStyle = body('#b46bff'); ctx.beginPath(); ctx.arc(0, 0, 26, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, 12, 0, 7); ctx.fill();
    } else {
      const pulse = 1 + Math.sin(this.t * 4) * 0.08; ctx.scale(pulse, pulse);
      ctx.fillStyle = body('#5e1a3a'); ctx.beginPath(); ctx.arc(0, 0, 85, 0, 7); ctx.fill();
      ctx.fillStyle = body('#2e0a1e'); ctx.beginPath(); ctx.arc(0, 0, 60, 0, 7); ctx.fill();
      ctx.fillStyle = body('#ff3d6e'); ctx.shadowBlur = 30; ctx.beginPath(); ctx.arc(0, 0, 30 + Math.sin(this.t * 5) * 5, 0, 7); ctx.fill();
      ctx.shadowBlur = 0; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, 12, 0, 7); ctx.fill();
      ctx.fillStyle = body('#b46bff'); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + this.t; ctx.beginPath(); ctx.arc(Math.cos(a) * 80, Math.sin(a) * 80, 8, 0, 7); ctx.fill(); }
    }
    ctx.restore();
    if (this.hp < this.maxhp) {
      ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(this.x - 60, this.y - this.r - 22, 120, 6);
      ctx.fillStyle = '#ff3d6e'; ctx.fillRect(this.x - 60, this.y - this.r - 22, 120 * (this.hp / this.maxhp), 6);
    }
  }
}

class Player {
  constructor(idx, game) {
    this.idx = idx; this.game = game; this.scheme = idx;
    this.reset(true);
  }
  reset(full) {
    this.x = CFG.W / 2 + (this.idx === 0 ? -70 : 70);
    this.y = CFG.H - 110;
    this.alive = true; this.respawnT = 0; this.inv = 2;
    this.touching = false;
    if (full) {
      this.weapon = 'V'; this.wlv = 1; this.mtype = 'H'; this.mlv = 1;
      this.options = 0; this.bombs = 3; this.score = 0; this.speed = 330;
      this.shieldT = this.game.assist ? 8 : 0;
    }
    this.fireCd = 0; this.mslCd = 0; this.charge = 0; this.tilt = 0;
    this.holdT = 0; this.optPhase = Math.random() * 6;
  }
  get name() { return this.idx === 0 ? 'P1' : 'P2'; }
  optionPos(i) {
    this.optPhase += 0.016;
    const side = i === 0 ? -1 : 1;
    return { x: this.x + side * 30, y: this.y + 6 + Math.sin(this.optPhase * 3) * 3 };
  }
  update(dt, ctl) {
    if (!this.alive) {
      this.respawnT -= dt;
      if (this.respawnT <= 0 && this.game.stock > 0) {
        this.game.stock--;
        this.reset(false);
        this.wlv = Math.max(1, this.wlv); this.inv = 3;
      } else if (this.respawnT <= 0 && this.game.stock <= 0) {
        this.respawnT = 1e9;
      }
      return;
    }
    this.inv = Math.max(0, this.inv - dt);
    this.shieldT = Math.max(0, this.shieldT - dt);
    if (!this.touching) {
      const sp = this.speed;
      this.x += ctl.dx * sp * dt; this.y += ctl.dy * sp * dt;
      this.tilt += ((ctl.dx || 0) - this.tilt) * Math.min(1, 10 * dt);
    }
    this.x = clamp(this.x, 24, CFG.W - 24);
    this.y = clamp(this.y, 60, CFG.H - 40);
    const wantFire = this.game.autofire || ctl.fire || this.touching;
    this.fireCd -= dt; this.mslCd -= dt;
    if (wantFire) {
      this.holdT += dt; this.charge += dt;
      this.shoot(dt);
      if (this.charge >= 1.4) { this.charge = 0; this.overdrive(); }
    } else {
      if (this.holdT > 1.1) this.overdrive();
      this.holdT = 0; this.charge = Math.max(0, this.charge - dt * 2);
    }
    if (ctl.bomb && !this._bombHeld) this.tryBomb(false);
    this._bombHeld = !!ctl.bomb;
  }
  power() { return 1 + (this.wlv - 1) * 0.28; }
  shoot(dt) {
    if (this.fireCd > 0) return;
    const g = this.game, pw = this.power(), lv = this.wlv;
    const bx = this.x, by = this.y - 16;
    if (this.weapon === 'V') {
      this.fireCd = Math.max(0.05, 0.11 - lv * 0.006);
      const streams = Math.min(2 + Math.floor((lv + 1) / 2), 8);
      for (let i = 0; i < streams; i++) {
        const off = (i - (streams - 1) / 2);
        g.bullets.push(new Bullet({ x: bx + off * 5, y: by, vx: off * 55, vy: -720, r: 4 + lv * 0.25, dmg: (1 + lv * 0.35) * g.dmgMul, kind: 'v', color: '#ffd34d', pierce: lv >= 6 ? 1 : 0, life: 1.4 }));
      }
      if (lv >= 4) g.bullets.push(new Bullet({ x: bx - 14, y: by + 6, vx: -260, vy: -420, r: 3.5, dmg: pw * g.dmgMul, kind: 'v', color: '#ff9d3d', life: 1 }));
      if (lv >= 4) g.bullets.push(new Bullet({ x: bx + 14, y: by + 6, vx: 260, vy: -420, r: 3.5, dmg: pw * g.dmgMul, kind: 'v', color: '#ff9d3d', life: 1 }));
      AudioSys.shoot();
    } else if (this.weapon === 'L') {
      this.fireCd = 0.07;
      const beams = lv >= 5 ? 3 : lv >= 2 ? 2 : 1;
      for (let i = 0; i < beams; i++) {
        const off = (i - (beams - 1) / 2) * 10;
        g.bullets.push(new Bullet({ x: bx + off, y: by, vx: off * 8, vy: -980, r: 5 + lv * 0.8, dmg: (2.2 + lv * 0.55) * g.dmgMul, kind: 'laser', color: lv >= 7 ? '#b4f4ff' : '#38c8ff', pierce: 3, life: 1.1 }));
      }
      if (lv >= 3) {
        g.bullets.push(new Bullet({ x: bx - 18, y: by, vx: -140, vy: -700, r: 4, dmg: pw * g.dmgMul, kind: 'laser', color: '#38c8ff', pierce: 1, life: 0.8 }));
        g.bullets.push(new Bullet({ x: bx + 18, y: by, vx: 140, vy: -700, r: 4, dmg: pw * g.dmgMul, kind: 'laser', color: '#38c8ff', pierce: 1, life: 0.8 }));
      }
      if (Math.random() < 0.4) AudioSys.laser();
    } else {
      this.fireCd = 0.16;
      const n = Math.min(1 + Math.floor(lv / 2), 4);
      for (let i = 0; i < n; i++) {
        const off = (i - (n - 1) / 2) * 40;
        g.bullets.push(new Bullet({ x: bx + off * 0.2, y: by, vx: off * 3, vy: -520, r: 6 + lv * 0.5, dmg: (2.5 + lv * 0.7) * g.dmgMul, kind: 'plasma', color: '#c58bff', pierce: 2, homing: 3, life: 2.4 }));
      }
      AudioSys.shoot();
    }
    if (this.mslCd <= 0 && this.mlv > 0) {
      this.mslCd = this.mtype === 'H' ? 0.5 : 0.34;
      const md = (this.mtype === 'H' ? 1.5 : 2.6) * (1 + this.mlv * 0.4) * g.dmgMul;
      if (this.mtype === 'H') {
        g.bullets.push(new Bullet({ x: bx - 12, y: by + 8, vx: -160, vy: -320, r: 5, dmg: md, kind: 'plasma', color: '#ffb03d', homing: 5, life: 3 }));
        g.bullets.push(new Bullet({ x: bx + 12, y: by + 8, vx: 160, vy: -320, r: 5, dmg: md, kind: 'plasma', color: '#ffb03d', homing: 5, life: 3 }));
        if (this.mlv >= 3) g.bullets.push(new Bullet({ x: bx, y: by + 10, vx: 0, vy: -260, r: 6, dmg: md * 1.2, kind: 'plasma', color: '#ff7a3d', homing: 5, life: 3 }));
      } else {
        g.bullets.push(new Bullet({ x: bx - 8, y: by, vx: 0, vy: -900, r: 6, dmg: md, kind: 'v', color: '#ff6d3d', pierce: 1, life: 1.2 }));
        g.bullets.push(new Bullet({ x: bx + 8, y: by, vx: 0, vy: -900, r: 6, dmg: md, kind: 'v', color: '#ff6d3d', pierce: 1, life: 1.2 }));
      }
    }
    for (let i = 0; i < this.options; i++) {
      const p = this.optionPos(i);
      g.bullets.push(new Bullet({ x: p.x, y: p.y - 8, vx: 0, vy: -640, r: 3.5, dmg: pw * 0.7 * g.dmgMul, kind: this.weapon === 'L' ? 'laser' : 'v', color: this.idx === 0 ? '#ff8ba0' : '#8bb4ff', life: 1.2 }));
    }
  }
  overdrive() {
    const g = this.game;
    AudioSys.overdrive();
    spawnExplosion(g.parts, this.x, this.y - 20, 1.2, ['#38e1ff', '#ffffff', '#ffd34d']);
    g.shake = Math.min(10, g.shake + 5);
    if (this.weapon === 'V') {
      for (let i = 0; i < 26; i++) { const a = (i / 26) * Math.PI * 2; g.bullets.push(new Bullet({ x: this.x, y: this.y - 10, vx: Math.cos(a) * 520, vy: Math.sin(a) * 520 - 200, r: 5, dmg: 3 * g.dmgMul, kind: 'v', color: '#ffd34d', pierce: 2, life: 1.2 })); }
    } else if (this.weapon === 'L') {
      for (let i = 0; i < 10; i++) g.bullets.push(new Bullet({ x: this.x + rand(-24, 24), y: this.y - 20 - i * 26, vx: 0, vy: -1100, r: 10, dmg: 6 * g.dmgMul, kind: 'laser', color: '#b4f4ff', pierce: 5, life: 0.9 }));
    } else {
      for (let i = 0; i < 8; i++) { const a = -Math.PI / 2 + (i - 3.5) * 0.3; g.bullets.push(new Bullet({ x: this.x, y: this.y - 10, vx: Math.cos(a) * 600, vy: Math.sin(a) * 600, r: 8, dmg: 5 * g.dmgMul, kind: 'plasma', color: '#e3b4ff', pierce: 4, homing: 6, life: 2.5 })); }
    }
    g.combo += 2;
  }
  tryBomb(silent) {
    const g = this.game;
    if (!this.alive || this.bombs <= 0 || g.bombT > 0) return false;
    this.bombs--; g.bombT = 1.6; g.bombOwner = this;
    AudioSys.bomb(); g.shake = 16;
    spawnExplosion(g.parts, this.x, this.y - 40, 3, ['#38e1ff', '#ffffff', '#ffd34d', '#ff3d6e']);
    for (const b of g.foeBullets) spawnExplosion(g.parts, b.x, b.y, 0.5, ['#38e1ff', '#fff']);
    g.foeBullets.length = 0;
    const dmg = 160 * g.dmgMul;
    for (const e of g.enemies) { e.hp -= dmg; e.flash = 0.2; }
    if (g.boss) { g.boss.hp -= dmg * 3; g.boss.flash = 0.3; }
    return true;
  }
  applyPickup(kind, game) {
    const full = this.wlv >= CFG.MAX_WPN_LV;
    if (kind === 'V' || kind === 'L' || kind === 'E') {
      if (this.weapon !== kind) { this.weapon = kind; this.wlv = Math.max(this.wlv, 2); game.toast(`${this.name} 切换 ${kind === 'V' ? '火神炮' : kind === 'L' ? '激光' : '等离子'}!`); }
      else if (!full) { this.wlv++; game.toast(`${this.name} 武器 Lv.${this.wlv}!`); }
      else { this.score += 10000; game.toast(`${this.name} +10000`); }
    } else if (kind === 'P') {
      if (!full) { this.wlv++; game.toast(`${this.name} 武器 Lv.${this.wlv}!`); }
      else { this.score += 10000; game.toast(`${this.name} +10000`); }
    } else if (kind === 'M') {
      if (this.mlv < 4) { this.mlv++; }
      else { this.mtype = this.mtype === 'H' ? 'N' : 'H'; }
      game.toast(`${this.name} 导弹 ${this.mtype === 'H' ? '追踪' : '核弹'} Lv.${this.mlv}`);
    } else if (kind === 'B') { this.bombs = Math.min(6, this.bombs + 1); game.toast(`${this.name} 炸弹+1`); }
    else if (kind === 'O') { this.options = Math.min(2, this.options + 1); game.toast(`${this.name} 僚机+1!`); }
    else if (kind === 'S') { this.speed = Math.min(460, this.speed + 30); this.shieldT = 6; game.toast(`${this.name} 护盾!`); }
    else if (kind === 'MEDAL') { game.medalChain++; const v = 1000 + game.medalChain * 500; this.score += v; game.combo += 1; }
    else if (kind === 'FAIRY') { this.score += 5000; game.toast('仙女 +5000!'); }
    else if (kind === 'MICLUS') { this.score += 100000; game.toast('隐藏米克鲁斯 +100000!! 🐄'); }
    AudioSys.pickup();
  }
  die(game) {
    if (this.inv > 0 || this.shieldT > 0 || !this.alive) return false;
    if (game.bombT > 0) return false;
    this.alive = false;
    spawnExplosion(game.parts, this.x, this.y, 2.2);
    AudioSys.boom(); game.shake = 12; game.combo = 0;
    this.wlv = Math.max(1, Math.floor(this.wlv / 2));
    this.options = Math.max(0, this.options - 1);
    game.dropOnDeath(this);
    if (game.stock > 0) this.respawnT = 3;
    else this.respawnT = 1e9;
    return true;
  }
  draw(ctx) {
    if (!this.alive) return;
    if (this.inv > 0 && Math.floor(Date.now() / 100) % 2 === 0 && this.shieldT <= 0) ctx.globalAlpha = 0.5;
    for (let i = 0; i < this.options; i++) { const p = this.optionPos(i); drawOption(ctx, p.x, p.y, this.scheme); }
    if (this.charge > 0.6) {
      ctx.save(); ctx.globalAlpha = Math.min(0.8, (this.charge - 0.6) * 1.2);
      ctx.strokeStyle = '#38e1ff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(this.x, this.y - 2, 22 + Math.sin(Date.now() / 60) * 2, 0, 7); ctx.stroke();
      ctx.restore();
    }
    drawFighter(ctx, this.x, this.y, this.scheme, this.tilt, { shield: this.shieldT > 0, inv: this.inv > 0 });
    ctx.globalAlpha = 1;
    if (this.idx === 0) { ctx.fillStyle = '#ff5d7e'; } else { ctx.fillStyle = '#5d9bff'; }
    ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(this.name, this.x, this.y + 26);
  }
}
