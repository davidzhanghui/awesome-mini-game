/* 深渊回响 — 程序化美术
 * 全部用 Canvas 2D 绘制，没有任何图片资源。
 * 坐标约定：实体 (x, y) 是脚底中心，向上为负；所有绘制函数自行处理阴影。
 */
(function () {
  'use strict';

  var TAU = Math.PI * 2;

  /* ---------- 小工具 ---------- */
  function hash(x, y, s) {
    var h = x * 374761393 + y * 668265263 + (s || 0) * 2147483647;
    h = (h ^ (h >> 13)) * 1274126177;
    return ((h ^ (h >> 16)) >>> 0) / 4294967296;
  }
  function shade(hex, amt) {
    var n = parseInt(hex.slice(1), 16);
    var r = Math.max(0, Math.min(255, (n >> 16) + amt));
    var g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
    var b = Math.max(0, Math.min(255, (n & 255) + amt));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }
  function shadow(ctx, x, y, rx, ry, a) {
    ctx.save();
    ctx.globalAlpha = a == null ? .38 : a;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  function roundRect(ctx, x, y, w, h, r) {
    var rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }
  function ellipse(ctx, x, y, rx, ry, rot) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rot || 0, 0, TAU);
    ctx.fill();
  }

  /* ---------- 地形烘焙 ---------- */
  // map: { w, h, tiles: Uint8Array } 1 = 墙
  function bakeFloor(map, TILE) {
    var W = map.w * TILE, H = map.h * TILE;
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var c = cv.getContext('2d');

    // 底色
    c.fillStyle = '#141210';
    c.fillRect(0, 0, W, H);

    // 地砖
    for (var y = 0; y < map.h; y++) {
      for (var x = 0; x < map.w; x++) {
        if (map.tiles[y * map.w + x]) continue;
        var px = x * TILE, py = y * TILE;
        var r = hash(x, y, 7);
        var base = ['#38332c', '#3d3830', '#343029', '#403a31'][(r * 4) | 0];
        c.fillStyle = base;
        c.fillRect(px, py, TILE, TILE);
        // 石缝
        c.strokeStyle = 'rgba(0,0,0,.42)';
        c.lineWidth = 2;
        c.strokeRect(px + 1, py + 1, TILE - 2, TILE - 2);
        // 高光边
        c.strokeStyle = 'rgba(255,236,200,.075)';
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(px + 3, py + TILE - 3);
        c.lineTo(px + 3, py + 3);
        c.lineTo(px + TILE - 3, py + 3);
        c.stroke();
        // 裂纹 / 苔藓 / 碎石
        var r2 = hash(x, y, 19);
        if (r2 < .18) {
          c.strokeStyle = 'rgba(0,0,0,.45)';
          c.lineWidth = 1.5;
          c.beginPath();
          var cx = px + 12 + r2 * 160 % 40, cy = py + 14 + r2 * 90 % 36;
          c.moveTo(cx, cy);
          c.lineTo(cx + 9, cy + 7);
          c.lineTo(cx + 4, cy + 16);
          c.stroke();
        } else if (r2 > .9) {
          c.fillStyle = 'rgba(90,120,70,.16)';
          ellipse(c, px + 18 + r2 * 30 % 30, py + 20 + r2 * 50 % 26, 7 + r2 * 6, 4 + r2 * 4, r2);
        } else if (r2 > .82) {
          c.fillStyle = 'rgba(255,240,210,.05)';
          ellipse(c, px + 20 + r2 * 20 % 24, py + 26 + r2 * 30 % 22, 2.4, 1.6, 0);
        }
      }
    }

    // 墙体：顶面 + 正面
    for (var wy = 0; wy < map.h; wy++) {
      for (var wx = 0; wx < map.w; wx++) {
        if (!map.tiles[wy * map.w + wx]) continue;
        var X = wx * TILE, Y = wy * TILE;
        var t = hash(wx, wy, 3);
        // 正面（底部 16px）
        c.fillStyle = shade('#1b1916', ((t * 10) | 0) - 4);
        c.fillRect(X, Y + TILE - 14, TILE, 14);
        // 砖块
        c.fillStyle = shade('#332d26', ((t * 14) | 0) - 5);
        c.fillRect(X + 1, Y + 1, TILE - 2, TILE - 16);
        c.strokeStyle = 'rgba(0,0,0,.35)';
        c.lineWidth = 1.5;
        c.beginPath();
        c.moveTo(X + 1, Y + TILE / 2 - 6);
        c.lineTo(X + TILE - 1, Y + TILE / 2 - 6);
        c.stroke();
        c.beginPath();
        c.moveTo(X + (t > .5 ? 20 : 42), Y + 2);
        c.lineTo(X + (t > .5 ? 20 : 42), Y + TILE / 2 - 6);
        c.stroke();
        // 顶部亮边
        c.fillStyle = 'rgba(255,230,190,.11)';
        c.fillRect(X + 1, Y + 1, TILE - 2, 3);
      }
    }

    // 边缘阴影：墙下沿在地面投一条暗带
    for (var ey = 0; ey < map.h; ey++) {
      for (var ex = 0; ex < map.w; ex++) {
        if (map.tiles[ey * map.w + ex]) continue;
        var below = ey > 0 && map.tiles[(ey - 1) * map.w + ex];
        if (below) {
          var g = c.createLinearGradient(0, ey * TILE, 0, ey * TILE + 18);
          g.addColorStop(0, 'rgba(0,0,0,.34)');
          g.addColorStop(1, 'rgba(0,0,0,0)');
          c.fillStyle = g;
          c.fillRect(ex * TILE, ey * TILE, TILE, 18);
        }
      }
    }

    // 大范围脏污，避免重复感
    for (var i = 0; i < 26; i++) {
      var gx = hash(i, 1, 11) * W, gy = hash(i, 2, 11) * H;
      var gr = 90 + hash(i, 3, 11) * 220;
      var rg = c.createRadialGradient(gx, gy, 0, gx, gy, gr);
      rg.addColorStop(0, 'rgba(0,0,0,.16)');
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = rg;
      c.fillRect(gx - gr, gy - gr, gr * 2, gr * 2);
    }
    return cv;
  }

  /* ---------- 场景道具 ---------- */
  function drawTorch(ctx, x, y, t, s) {
    s = s || 1;
    // 铁架
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.fillStyle = '#241f1a';
    ctx.fillRect(-3, -30, 6, 30);
    ctx.fillStyle = '#3a322a';
    ctx.fillRect(-3, -30, 2, 30);
    // 火盆
    ctx.fillStyle = '#2e2822';
    ctx.beginPath();
    ctx.moveTo(-9, -30);
    ctx.lineTo(9, -30);
    ctx.lineTo(6, -22);
    ctx.lineTo(-6, -22);
    ctx.closePath();
    ctx.fill();
    // 火焰（三层抖动）
    var f = Math.sin(t * 9 + x) * 2.2, f2 = Math.sin(t * 13 + x * 2) * 1.6;
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(255,120,30,.55)';
    ctx.beginPath();
    ctx.ellipse(0, -36 + f * .3, 10 + f * .6, 15 + f, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,190,80,.75)';
    ctx.beginPath();
    ctx.ellipse(0, -35 + f2 * .4, 6, 10 + f2, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,246,200,.9)';
    ctx.beginPath();
    ctx.ellipse(0, -33, 3, 5.5, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawBarrel(ctx, x, y, broken, t) {
    if (broken) {
      ctx.save();
      ctx.globalAlpha = .55;
      ctx.fillStyle = '#3a2a18';
      for (var i = 0; i < 4; i++) {
        var a = i * 1.7 + x;
        ctx.save();
        ctx.translate(x + Math.cos(a) * 15, y + Math.sin(a) * 8);
        ctx.rotate(a);
        ctx.fillRect(-7, -2, 14, 4);
        ctx.restore();
      }
      ctx.restore();
      return;
    }
    shadow(ctx, x, y, 16, 7, .4);
    ctx.save();
    ctx.translate(x, y);
    // 桶身
    var g = ctx.createLinearGradient(-16, 0, 16, 0);
    g.addColorStop(0, '#3a2a18');
    g.addColorStop(.45, '#6b4d2c');
    g.addColorStop(1, '#33240f');
    ctx.fillStyle = g;
    roundRect(ctx, -16, -40, 32, 40, 5);
    ctx.fill();
    // 铁箍
    ctx.fillStyle = '#2a2722';
    ctx.fillRect(-16, -32, 32, 4);
    ctx.fillRect(-16, -13, 32, 4);
    // 桶盖
    ctx.fillStyle = '#5a4126';
    ellipse(ctx, 0, -40, 16, 5.5, 0);
    ctx.fillStyle = 'rgba(255,230,180,.12)';
    ellipse(ctx, -4, -41, 9, 3, 0);
    ctx.restore();
  }

  function drawBones(ctx, x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#b9b09a';
    ctx.globalAlpha = .8;
    // 头骨
    ellipse(ctx, -6, -6, 7, 6, .2);
    ctx.fillStyle = '#17140f';
    ellipse(ctx, -8, -6.5, 1.8, 2, 0);
    ellipse(ctx, -3.5, -6.5, 1.8, 2, 0);
    // 骨头
    ctx.strokeStyle = '#b9b09a';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(4, -2); ctx.lineTo(20, -4);
    ctx.moveTo(8, -8); ctx.lineTo(18, 4);
    ctx.stroke();
    ctx.restore();
  }

  function drawPortal(ctx, x, y, t, open) {
    var k = open ? 1 : .35;
    ctx.save();
    ctx.translate(x, y);
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < 3; i++) {
      var ph = t * (1.4 + i * .5) + i * 2;
      var rr = (34 + i * 9) * k;
      ctx.strokeStyle = ['rgba(120,200,255,.55)', 'rgba(90,140,255,.35)', 'rgba(180,120,255,.22)'][i];
      ctx.lineWidth = 3 - i * .6;
      ctx.beginPath();
      ctx.ellipse(0, -34, rr, rr * .42, Math.sin(ph) * .2, 0, TAU);
      ctx.stroke();
    }
    var g = ctx.createRadialGradient(0, -34, 2, 0, -34, 46 * k);
    g.addColorStop(0, 'rgba(200,240,255,.55)');
    g.addColorStop(.4, 'rgba(90,160,255,.22)');
    g.addColorStop(1, 'rgba(40,60,160,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, -34, 46 * k, 24 * k, 0, 0, TAU);
    ctx.fill();
    // 上升粒子
    for (var p = 0; p < 7; p++) {
      var a = (t * .8 + p * .9) % 1;
      var px = Math.sin(p * 3.1 + t) * 26 * k;
      var py = -34 - a * 58;
      ctx.fillStyle = 'rgba(170,220,255,' + (1 - a) * .55 + ')';
      ellipse(ctx, px, py, 1.8, 1.8, 0);
    }
    ctx.restore();
  }

  /* ---------- 玩家 ---------- */
  // p: { x,y, cls, facing, moving, atkAnim, hurtT, dead, casting }
  function drawPlayer(ctx, p, t) {
    var cls = p.cls;
    var bob = p.moving ? Math.sin(t * 12) * 1.8 : Math.sin(t * 2.4) * .7;
    var step = p.moving ? Math.sin(t * 12) : 0;
    shadow(ctx, p.x, p.y, 15, 6, .45);
    ctx.save();
    ctx.translate(p.x, p.y + bob);

    if (p.dead) { ctx.rotate(-1.35); ctx.globalAlpha = .75; }

    var face = p.facing || 0;
    var flip = Math.cos(face) < 0 ? -1 : 1;

    // 腿
    ctx.fillStyle = cls === 'knight' ? '#4a4741' : cls === 'mage' ? '#2d3350' : cls === 'paladin' ? '#4a3a28' : cls === 'warlock' ? '#2a2236' : '#2f3a2c';
    ellipse(ctx, -5 + step * 4, -8, 4.4, 6, 0);
    ellipse(ctx, 5 - step * 4, -8, 4.4, 6, 0);

    if (cls === 'knight') {
      // 披风
      ctx.fillStyle = '#6b2f2a';
      ctx.beginPath();
      ctx.moveTo(-11 * flip, -30);
      ctx.quadraticCurveTo(-16 * flip, -12, -10 * flip, -2);
      ctx.lineTo(10 * flip, -2);
      ctx.quadraticCurveTo(14 * flip, -14, 9 * flip, -30);
      ctx.closePath();
      ctx.fill();
      // 躯干
      var g = ctx.createLinearGradient(0, -44, 0, -12);
      g.addColorStop(0, '#9aa2ac');
      g.addColorStop(1, '#5e666e');
      ctx.fillStyle = g;
      roundRect(ctx, -11, -42, 22, 30, 7);
      ctx.fill();
      // 胸甲纹
      ctx.strokeStyle = 'rgba(255,255,255,.22)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, -39); ctx.lineTo(0, -16);
      ctx.moveTo(-8, -30); ctx.lineTo(8, -30);
      ctx.stroke();
      // 肩甲
      ctx.fillStyle = '#7d858f';
      ellipse(ctx, -12, -38, 7, 6, -.3);
      ellipse(ctx, 12, -38, 7, 6, .3);
      // 头盔
      ctx.fillStyle = '#b7bec7';
      ellipse(ctx, 0, -50, 9.5, 10, 0);
      ctx.fillStyle = '#232a31';
      ctx.fillRect(-7, -52, 14, 4.5);
      ctx.fillStyle = 'rgba(255,120,80,.9)';
      ctx.fillRect(-5.5, -51, 3, 2);
      ctx.fillRect(2.5, -51, 3, 2);
      // 头盔羽饰
      ctx.fillStyle = '#b0483c';
      ctx.beginPath();
      ctx.moveTo(0, -59);
      ctx.quadraticCurveTo(-9, -66, -3, -70);
      ctx.quadraticCurveTo(2, -64, 0, -59);
      ctx.fill();
      // 剑
      var swing = p.atkAnim > 0 ? (1 - p.atkAnim) * 2.4 - .9 : -.5;
      ctx.save();
      ctx.translate(13 * flip, -30);
      ctx.rotate(swing * flip + .25 * flip);
      ctx.fillStyle = '#3c352d';
      ctx.fillRect(-2, 0, 4, 10);
      ctx.fillStyle = '#c8cdd4';
      ctx.beginPath();
      ctx.moveTo(-2.5, -1); ctx.lineTo(2.5, -1);
      ctx.lineTo(1.8, -30); ctx.lineTo(0, -35); ctx.lineTo(-1.8, -30);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.5)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(0, -30); ctx.stroke();
      ctx.restore();
    } else if (cls === 'mage') {
      // 法袍
      var g2 = ctx.createLinearGradient(0, -46, 0, 0);
      g2.addColorStop(0, '#4b5a86');
      g2.addColorStop(1, '#222a44');
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.moveTo(-9, -42);
      ctx.quadraticCurveTo(-16, -18, -13, -2);
      ctx.lineTo(13, -2);
      ctx.quadraticCurveTo(16, -18, 9, -42);
      ctx.closePath();
      ctx.fill();
      // 袍边纹
      ctx.strokeStyle = 'rgba(140,190,255,.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-11, -10); ctx.quadraticCurveTo(0, -4, 11, -10);
      ctx.stroke();
      // 兜帽
      ctx.fillStyle = '#2c3550';
      ctx.beginPath();
      ctx.moveTo(-11, -44);
      ctx.quadraticCurveTo(0, -62, 11, -44);
      ctx.quadraticCurveTo(0, -38, -11, -44);
      ctx.fill();
      // 脸（暗）
      ctx.fillStyle = '#c9a98a';
      ellipse(ctx, 0, -45, 6, 5, 0);
      ctx.fillStyle = 'rgba(120,190,255,.95)';
      ellipse(ctx, -2.2, -46, 1.5, 1.5, 0);
      ellipse(ctx, 2.2, -46, 1.5, 1.5, 0);
      // 法杖 + 法球
      var cast = p.casting ? 1 : 0;
      ctx.save();
      ctx.translate(14 * flip, -24);
      ctx.rotate(-.12 * flip);
      ctx.fillStyle = '#4a3a28';
      ctx.fillRect(-1.6, -26, 3.2, 46);
      var og = ctx.createRadialGradient(0, -30, 1, 0, -30, 14 + cast * 6);
      og.addColorStop(0, 'rgba(255,210,140,1)');
      og.addColorStop(.45, 'rgba(255,130,50,.8)');
      og.addColorStop(1, 'rgba(255,80,20,0)');
      ctx.fillStyle = og;
      ellipse(ctx, 0, -30, 14 + cast * 6, 14 + cast * 6, 0);
      ctx.fillStyle = '#ffe9b8';
      ellipse(ctx, 0, -30, 3.5, 3.5, 0);
      ctx.restore();
    } else if (cls === 'paladin') {
      // 圣堂：白袍 + 金边
      var pg2 = ctx.createLinearGradient(0, -46, 0, 0);
      pg2.addColorStop(0, '#e6dcc0');
      pg2.addColorStop(1, '#8a7f66');
      ctx.fillStyle = pg2;
      ctx.beginPath();
      ctx.moveTo(-10, -42);
      ctx.quadraticCurveTo(-16, -18, -13, -2);
      ctx.lineTo(13, -2);
      ctx.quadraticCurveTo(16, -18, 10, -42);
      ctx.closePath();
      ctx.fill();
      // 金边与圣徽
      ctx.strokeStyle = 'rgba(255,214,130,.85)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-12, -8); ctx.quadraticCurveTo(0, -2, 12, -8);
      ctx.stroke();
      ctx.fillStyle = '#e8b84a';
      ctx.beginPath();
      ctx.moveTo(0, -36); ctx.lineTo(2.6, -29); ctx.lineTo(9, -29); ctx.lineTo(3.8, -24.5);
      ctx.lineTo(6, -17); ctx.lineTo(0, -21); ctx.lineTo(-6, -17); ctx.lineTo(-3.8, -24.5);
      ctx.lineTo(-9, -29); ctx.lineTo(-2.6, -29);
      ctx.closePath();
      ctx.fill();
      // 头盔 + 光环
      ctx.fillStyle = '#d8d2c2';
      ellipse(ctx, 0, -50, 9, 9.5, 0);
      ctx.fillStyle = '#3a3428';
      ctx.fillRect(-7, -52, 14, 4);
      ctx.fillStyle = 'rgba(255,220,130,.95)';
      ctx.fillRect(-5.5, -51, 3, 1.8);
      ctx.fillRect(2.5, -51, 3, 1.8);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(255,226,150,.75)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, -62, 12, 3.6, 0, 0, TAU);
      ctx.stroke();
      ctx.restore();
      // 战锤
      var psw = p.atkAnim > 0 ? (1 - p.atkAnim) * 2.2 - .8 : -.45;
      ctx.save();
      ctx.translate(14 * flip, -28);
      ctx.rotate(psw * flip + .2 * flip);
      ctx.fillStyle = '#6a4a28';
      ctx.fillRect(-1.8, -2, 3.6, 26);
      ctx.fillStyle = '#cfd6d0';
      roundRect(ctx, -8, -22, 16, 12, 3);
      ctx.fill();
      ctx.fillStyle = '#e8c878';
      ctx.fillRect(-8, -14, 16, 2.6);
      ctx.restore();
      // 盾
      ctx.save();
      ctx.translate(-15 * flip, -26);
      var sg2 = ctx.createLinearGradient(0, -16, 0, 16);
      sg2.addColorStop(0, '#f0e6c8');
      sg2.addColorStop(1, '#9a8a60');
      ctx.fillStyle = sg2;
      ctx.beginPath();
      ctx.moveTo(0, -18);
      ctx.quadraticCurveTo(13, -14, 13, 2);
      ctx.quadraticCurveTo(13, 14, 0, 20);
      ctx.quadraticCurveTo(-13, 14, -13, 2);
      ctx.quadraticCurveTo(-13, -14, 0, -18);
      ctx.fill();
      ctx.strokeStyle = '#d8a850';
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.fillStyle = '#e8b84a';
      ctx.fillRect(-1.6, -10, 3.2, 20);
      ctx.fillRect(-7, -3, 14, 3.2);
      ctx.restore();
    } else if (cls === 'warlock') {
      // 虚空：破碎长袍 + 漂浮咒印
      var wg = ctx.createLinearGradient(0, -46, 0, 0);
      wg.addColorStop(0, '#3a2a58');
      wg.addColorStop(1, '#170f26');
      ctx.fillStyle = wg;
      ctx.beginPath();
      ctx.moveTo(-9, -42);
      ctx.quadraticCurveTo(-18, -16, -14, 0);
      ctx.lineTo(-4, -6); ctx.lineTo(0, 0); ctx.lineTo(5, -6); ctx.lineTo(14, 0);
      ctx.quadraticCurveTo(18, -16, 9, -42);
      ctx.closePath();
      ctx.fill();
      // 虚空纹路
      ctx.strokeStyle = 'rgba(170,110,255,.55)';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(-8, -30); ctx.lineTo(-2, -22); ctx.lineTo(-7, -12);
      ctx.moveTo(8, -28); ctx.lineTo(3, -20); ctx.lineTo(8, -10);
      ctx.stroke();
      // 兜帽
      ctx.fillStyle = '#241733';
      ctx.beginPath();
      ctx.moveTo(-12, -44);
      ctx.quadraticCurveTo(0, -63, 12, -44);
      ctx.quadraticCurveTo(0, -37, -12, -44);
      ctx.fill();
      ctx.fillStyle = '#0c0813';
      ellipse(ctx, 0, -46, 6.5, 5.4, 0);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(190,120,255,1)';
      ellipse(ctx, -2.2, -47, 1.7, 1.7, 0);
      ellipse(ctx, 2.4, -47, 1.7, 1.7, 0);
      ctx.restore();
      // 魂杖
      var cast2 = p.casting ? 1 : 0;
      ctx.save();
      ctx.translate(15 * flip, -24);
      ctx.rotate(-.1 * flip);
      ctx.fillStyle = '#33243f';
      ctx.fillRect(-1.6, -24, 3.2, 44);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var wog = ctx.createRadialGradient(0, -30, 1, 0, -30, 15 + cast2 * 6);
      wog.addColorStop(0, 'rgba(230,190,255,1)');
      wog.addColorStop(.4, 'rgba(150,80,230,.85)');
      wog.addColorStop(1, 'rgba(70,20,130,0)');
      ctx.fillStyle = wog;
      ellipse(ctx, 0, -30, 15 + cast2 * 6, 15 + cast2 * 6, 0);
      ctx.restore();
      // 环绕咒印
      for (var oi = 0; oi < 3; oi++) {
        var oa = t * 1.8 + oi * TAU / 3;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(190,130,255,.85)';
        ellipse(ctx, Math.cos(oa) * 20, -34 + Math.sin(oa) * 6, 2, 2, 0);
        ctx.restore();
      }
      ctx.restore();
    } else {
      // 游侠披风
      ctx.fillStyle = '#232f22';
      ctx.beginPath();
      ctx.moveTo(-10, -38);
      ctx.quadraticCurveTo(-17, -16, -12, -1);
      ctx.lineTo(12, -1);
      ctx.quadraticCurveTo(17, -16, 10, -38);
      ctx.closePath();
      ctx.fill();
      // 皮甲
      ctx.fillStyle = '#5a4a30';
      roundRect(ctx, -9, -40, 18, 26, 6);
      ctx.fill();
      ctx.fillStyle = '#8a6c42';
      ctx.fillRect(-9, -26, 18, 3);
      // 兜帽
      ctx.fillStyle = '#2e4028';
      ctx.beginPath();
      ctx.moveTo(-11, -42);
      ctx.quadraticCurveTo(0, -60, 11, -42);
      ctx.quadraticCurveTo(0, -36, -11, -42);
      ctx.fill();
      ctx.fillStyle = '#d8b48c';
      ellipse(ctx, 0, -43, 5.6, 5, 0);
      ctx.fillStyle = '#182015';
      ellipse(ctx, -2, -44, 1.4, 1.7, 0);
      ellipse(ctx, 2.4, -44, 1.4, 1.7, 0);
      // 弓
      var draw = p.atkAnim > 0 ? Math.sin((1 - p.atkAnim) * Math.PI) : 0;
      ctx.save();
      ctx.translate(14 * flip, -28);
      ctx.strokeStyle = '#7a5a32';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 17, -1.35, 1.35);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(240,230,200,.7)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(17 * Math.cos(-1.35 + Math.PI * 0), 17 * Math.sin(-1.35));
      ctx.lineTo(17 * Math.cos(1.35), 17 * Math.sin(1.35));
      ctx.stroke();
      // 搭箭
      if (draw > .1) {
        ctx.strokeStyle = '#d8c9a0';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-2, 0);
        ctx.lineTo(18, 0);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 神圣壁垒护盾
    if (p.shieldHp > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var wk2 = .5 + Math.sin(t * 6) * .18;
      var wgr2 = ctx.createRadialGradient(0, -30, 12, 0, -30, 34);
      wgr2.addColorStop(0, 'rgba(255,240,180,0)');
      wgr2.addColorStop(.8, 'rgba(255,232,160,' + .16 * wk2 + ')');
      wgr2.addColorStop(1, 'rgba(255,214,110,' + .5 * wk2 + ')');
      ctx.fillStyle = wgr2;
      ctx.beginPath(); ctx.arc(0, -30, 34, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,244,200,' + (.55 * wk2) + ')';
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(0, -30, 34, 0, TAU); ctx.stroke();
      ctx.restore();
    }
    // 受伤闪白
    if (p.hurtT > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(.6, p.hurtT * 3);
      ctx.fillStyle = '#ff6a50';
      ellipse(ctx, 0, -30, 18, 26, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
    // 无敌 / 闪现残影
    if (p.invuln > 0) {
      ctx.globalAlpha = .35;
      ctx.strokeStyle = 'rgba(160,220,255,.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, -28, 20, 30, 0, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  /* ---------- 怪物 ---------- */
  function glowEyes(ctx, x, y, r, color) {
    ctx.fillStyle = color || '#ff5a3c';
    ellipse(ctx, x - r, y, 1.7, 2, 0);
    ellipse(ctx, x + r, y, 1.7, 2, 0);
  }

  function drawMonster(ctx, m, t) {
    var k = m.kind, col = m.def.color;
    var bob = m.dead ? 0 : Math.sin(t * (m.moving ? 9 : 2.5) + m.seed) * (m.moving ? 2 : .8);
    var face = m.facing == null ? 0 : m.facing;
    var flip = Math.cos(face) < 0 ? -1 : 1;
    var s = m.r / 22;

    // 影子
    shadow(ctx, m.x, m.y, m.r * .85, m.r * .34, .42);

    ctx.save();
    ctx.translate(m.x, m.y + bob);
    ctx.scale(s, s);
    if (m.dead) {
      ctx.globalAlpha *= Math.max(0, m.deadT / .6);
      ctx.rotate(.9 * (1 - m.deadT / .6));
    }
    if (m.hitT > 0) ctx.globalAlpha *= 1;

    var step = m.moving ? Math.sin(t * 9 + m.seed) : 0;

    if (k === 'zombie') {
      ctx.fillStyle = '#3b4a34';
      ellipse(ctx, -6 + step * 3, -7, 4.2, 6, 0);
      ellipse(ctx, 6 - step * 3, -7, 4.2, 6, 0);
      ctx.fillStyle = '#5c7a52';
      roundRect(ctx, -10, -36, 20, 28, 7);
      ctx.fill();
      ctx.fillStyle = '#42583b';
      ctx.fillRect(-10, -26, 20, 4);
      // 手臂前伸
      ctx.strokeStyle = '#6d8f5f';
      ctx.lineWidth = 4.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-8, -32); ctx.lineTo(-15 * flip, -24);
      ctx.moveTo(8, -32); ctx.lineTo(15 * flip, -24);
      ctx.stroke();
      // 头
      ctx.fillStyle = '#7fae74';
      ellipse(ctx, 0, -44, 8.5, 9, 0);
      ctx.fillStyle = '#5a7a50';
      ellipse(ctx, -3, -46, 4, 3, 0);
      glowEyes(ctx, 0, -45, 3.4, '#ffd24a');
      // 嘴
      ctx.strokeStyle = '#2a1a14';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(-3, -39); ctx.lineTo(3, -39);
      ctx.stroke();
    } else if (k === 'skeleton') {
      ctx.strokeStyle = '#cfc7b0';
      ctx.lineWidth = 2.6;
      ctx.lineCap = 'round';
      // 腿
      ctx.beginPath();
      ctx.moveTo(-2, -18); ctx.lineTo(-5 + step * 2, -2);
      ctx.moveTo(2, -18); ctx.lineTo(5 - step * 2, -2);
      ctx.stroke();
      // 脊柱与肋骨
      ctx.beginPath(); ctx.moveTo(0, -36); ctx.lineTo(0, -17); ctx.stroke();
      ctx.lineWidth = 2;
      for (var rb = 0; rb < 3; rb++) {
        ctx.beginPath();
        ctx.moveTo(-6, -33 + rb * 5);
        ctx.quadraticCurveTo(0, -30 + rb * 5, 6, -33 + rb * 5);
        ctx.stroke();
      }
      // 头骨
      ctx.fillStyle = '#ddd5bf';
      ellipse(ctx, 0, -43, 7.5, 8, 0);
      ctx.fillStyle = '#1a1712';
      ellipse(ctx, -2.8, -44, 2.2, 2.6, 0);
      ellipse(ctx, 2.8, -44, 2.2, 2.6, 0);
      ctx.fillRect(-3, -38, 6, 2);
      // 弓
      ctx.strokeStyle = '#6e5634';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(13 * flip, -28, 15, -1.3, 1.3);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(230,220,190,.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(13 * flip + 15 * flip * Math.cos(-1.3), -28 + 15 * Math.sin(-1.3));
      ctx.lineTo(13 * flip + 15 * flip * Math.cos(1.3), -28 + 15 * Math.sin(1.3));
      ctx.stroke();
    } else if (k === 'bat') {
      var flap = Math.sin(t * 16 + m.seed) * .8;
      var hy = -34 + Math.sin(t * 5 + m.seed) * 4;
      ctx.fillStyle = '#5e4a78';
      // 翅膀
      ctx.save();
      ctx.translate(-4, hy);
      ctx.rotate(-.4 + flap * .5);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(-18, -10, -26, 2);
      ctx.quadraticCurveTo(-16, 0, -12, 8);
      ctx.quadraticCurveTo(-6, 4, 0, 8);
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.translate(4, hy);
      ctx.rotate(.4 - flap * .5);
      ctx.scale(-1, 1);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(-18, -10, -26, 2);
      ctx.quadraticCurveTo(-16, 0, -12, 8);
      ctx.quadraticCurveTo(-6, 4, 0, 8);
      ctx.fill();
      ctx.restore();
      // 身体
      ctx.fillStyle = '#7a5f9a';
      ellipse(ctx, 0, hy, 8, 10, 0);
      ctx.fillStyle = '#8f74ad';
      ellipse(ctx, -2, hy - 3, 4, 4.5, 0);
      // 耳朵
      ctx.fillStyle = '#7a5f9a';
      ctx.beginPath();
      ctx.moveTo(-6, hy - 8); ctx.lineTo(-8, hy - 16); ctx.lineTo(-2, hy - 10); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(6, hy - 8); ctx.lineTo(8, hy - 16); ctx.lineTo(2, hy - 10); ctx.fill();
      glowEyes(ctx, 0, hy - 1, 3, '#ffd24a');
    } else if (k === 'brute') {
      ctx.fillStyle = '#5b5346';
      ellipse(ctx, -6, -6, 6, 8, 0);
      ellipse(ctx, 6, -6, 6, 8, 0);
      // 躯体
      var bg = ctx.createLinearGradient(0, -52, 0, -8);
      bg.addColorStop(0, '#b0a694');
      bg.addColorStop(1, '#6d6455');
      ctx.fillStyle = bg;
      roundRect(ctx, -15, -50, 30, 42, 11);
      ctx.fill();
      // 石纹
      ctx.strokeStyle = 'rgba(40,34,28,.4)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-8, -44); ctx.lineTo(-3, -36); ctx.lineTo(-9, -30);
      ctx.stroke();
      // 拳头
      ctx.fillStyle = '#9a8f7d';
      ellipse(ctx, -19, -26, 8, 9, 0);
      ellipse(ctx, 19, -26, 8, 9, 0);
      // 头
      ctx.fillStyle = '#8a8070';
      ellipse(ctx, 0, -58, 10, 9, 0);
      ctx.fillStyle = '#3a342c';
      ctx.fillRect(-7, -60, 14, 3.5);
      glowEyes(ctx, 0, -59, 4, '#ffb347');
    } else if (k === 'cultist') {
      // 长袍
      var cg = ctx.createLinearGradient(0, -52, 0, 0);
      cg.addColorStop(0, '#8c4444');
      cg.addColorStop(1, '#3d1d1f');
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.moveTo(-7, -44);
      ctx.quadraticCurveTo(-15, -16, -13, 0);
      ctx.lineTo(13, 0);
      ctx.quadraticCurveTo(15, -16, 7, -44);
      ctx.closePath();
      ctx.fill();
      // 兜帽
      ctx.fillStyle = '#4a2226';
      ctx.beginPath();
      ctx.moveTo(-10, -46);
      ctx.quadraticCurveTo(0, -62, 10, -46);
      ctx.quadraticCurveTo(0, -40, -10, -46);
      ctx.fill();
      ctx.fillStyle = '#10100f';
      ellipse(ctx, 0, -46, 6, 5, 0);
      glowEyes(ctx, 0, -46, 2.6, '#ff7040');
      // 法杖
      ctx.strokeStyle = '#4a3a28';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(13 * flip, -4); ctx.lineTo(13 * flip, -56);
      ctx.stroke();
      var cg2 = ctx.createRadialGradient(13 * flip, -60, 1, 13 * flip, -60, 10);
      cg2.addColorStop(0, 'rgba(255,120,80,1)');
      cg2.addColorStop(1, 'rgba(180,40,20,0)');
      ctx.fillStyle = cg2;
      ellipse(ctx, 13 * flip, -60, 10, 10, 0);
    } else if (k === 'spider') {
      ctx.strokeStyle = '#3f5136';
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      for (var li = 0; li < 4; li++) {
        var sw = Math.sin(t * 12 + li * .8 + m.seed) * 3;
        var bx = -8 + li * 5;
        ctx.beginPath();
        ctx.moveTo(bx, -20);
        ctx.quadraticCurveTo(bx - 12, -22 + sw, bx - 16, -6 + sw * .5);
        ctx.moveTo(bx, -20);
        ctx.quadraticCurveTo(bx + 12, -22 + sw, bx + 16, -6 - sw * .5);
        ctx.stroke();
      }
      // 腹部
      ctx.fillStyle = '#4c633f';
      ellipse(ctx, 0, -20, 12, 10, 0);
      ctx.fillStyle = '#6f8a5c';
      ellipse(ctx, 0, -26, 8, 7, 0);
      // 眼睛
      ctx.fillStyle = '#ffcf4a';
      for (var ei = 0; ei < 4; ei++) {
        ellipse(ctx, -4 + (ei % 2) * 6, -29 + ((ei / 2) | 0) * 3, 1.5, 1.5, 0);
      }
    } else if (k === 'shade') {
      ctx.globalCompositeOperation = 'lighter';
      var wob = Math.sin(t * 3 + m.seed) * 3;
      var sg = ctx.createRadialGradient(0, -32, 2, 0, -32, 26);
      sg.addColorStop(0, 'rgba(150,140,220,.75)');
      sg.addColorStop(.55, 'rgba(90,80,170,.35)');
      sg.addColorStop(1, 'rgba(40,30,100,0)');
      ctx.fillStyle = sg;
      ellipse(ctx, 0, -32, 22 + wob, 28 + wob, 0);
      // 拖尾
      ctx.fillStyle = 'rgba(90,80,170,.22)';
      ctx.beginPath();
      ctx.moveTo(-12, -30);
      ctx.quadraticCurveTo(-6 + wob, -4, -16 + wob, 2);
      ctx.quadraticCurveTo(0, -6, 12, -30);
      ctx.fill();
      // 兜帽轮廓
      ctx.strokeStyle = 'rgba(190,180,255,.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, -36, 11, .2, Math.PI - .2);
      ctx.stroke();
      glowEyes(ctx, 0, -36, 3.2, '#c9b8ff');
      ctx.globalCompositeOperation = 'source-over';
    } else if (k === 'hound') {
      // 猎犬：低伏的四足兽
      ctx.strokeStyle = '#6a3226';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      for (var hl = 0; hl < 4; hl++) {
        var hx = -10 + hl * 7;
        var hsw = Math.sin(t * 14 + hl * 1.4 + m.seed) * 3;
        ctx.beginPath();
        ctx.moveTo(hx, -16);
        ctx.lineTo(hx - 3 + hsw, -1);
        ctx.stroke();
      }
      ctx.fillStyle = '#7a3a2c';
      ellipse(ctx, 0, -20, 16, 9, 0);
      ctx.fillStyle = '#a05a42';
      ellipse(ctx, 2, -24, 13, 8, 0);
      // 背脊骨刺
      ctx.fillStyle = '#d8c8a8';
      for (var hs = 0; hs < 4; hs++) {
        ctx.beginPath();
        ctx.moveTo(-8 + hs * 6, -28);
        ctx.lineTo(-6 + hs * 6, -36);
        ctx.lineTo(-4 + hs * 6, -28);
        ctx.fill();
      }
      // 头
      ctx.fillStyle = '#a8604a';
      ellipse(ctx, 14 * flip, -28, 9, 7, 0);
      ctx.fillStyle = '#5a2a20';
      ellipse(ctx, 21 * flip, -26, 4, 3, 0);
      // 牙
      ctx.fillStyle = '#efe6d0';
      ctx.beginPath();
      ctx.moveTo(20 * flip, -24); ctx.lineTo(21 * flip, -20); ctx.lineTo(23 * flip, -24);
      ctx.fill();
      glowEyes(ctx, 14 * flip, -30, 3.4, '#ffb84a');
      // 尾巴
      ctx.strokeStyle = '#7a3a2c';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-14, -24);
      ctx.quadraticCurveTo(-24, -30 + Math.sin(t * 6) * 5, -28, -18);
      ctx.stroke();
    } else if (k === 'wisp') {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var wob2 = Math.sin(t * 3.4 + m.seed) * 4;
      var wg2 = ctx.createRadialGradient(0, -32 + wob2, 2, 0, -32 + wob2, 24);
      wg2.addColorStop(0, 'rgba(230,255,255,1)');
      wg2.addColorStop(.35, 'rgba(110,220,240,.8)');
      wg2.addColorStop(1, 'rgba(20,80,120,0)');
      ctx.fillStyle = wg2;
      ellipse(ctx, 0, -32 + wob2, 20, 22, 0);
      // 拖尾火焰
      ctx.fillStyle = 'rgba(120,220,245,.35)';
      ctx.beginPath();
      ctx.moveTo(-7, -28 + wob2);
      ctx.quadraticCurveTo(0, -8, 7, -28 + wob2);
      ctx.quadraticCurveTo(0, -20 + wob2, -7, -28 + wob2);
      ctx.fill();
      ctx.restore();
      glowEyes(ctx, 0, -34 + wob2, 2.6, '#e8ffff');
    } else if (k === 'spitter') {
      // 毒囊怪：矮胖身躯 + 鼓胀毒囊
      ctx.fillStyle = '#4a5a2c';
      ellipse(ctx, -8, -6, 5, 7, 0);
      ellipse(ctx, 8, -6, 5, 7, 0);
      var spg = ctx.createLinearGradient(0, -40, 0, -4);
      spg.addColorStop(0, '#9ab85c');
      spg.addColorStop(1, '#4a5a2c');
      ctx.fillStyle = spg;
      ellipse(ctx, 0, -24, 17, 15, 0);
      // 毒囊
      var pulse2 = .7 + Math.sin(t * 4 + m.seed) * .3;
      ctx.fillStyle = 'rgba(150,240,90,' + (.5 + pulse2 * .35) + ')';
      ellipse(ctx, 0, -30, 10 * pulse2, 8 * pulse2, 0);
      ctx.strokeStyle = 'rgba(200,255,140,.6)';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(0, -30, 11, 0, TAU); ctx.stroke();
      // 头
      ctx.fillStyle = '#7a9448';
      ellipse(ctx, 0, -44, 8, 7, 0);
      glowEyes(ctx, 0, -45, 3, '#c8ff60');
      ctx.strokeStyle = '#2a3018';
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(-3, -39); ctx.lineTo(3, -39); ctx.stroke();
    } else if (k === 'ghoul') {
      // 食尸鬼：灰绿瘦长，前倾
      ctx.strokeStyle = '#5a6448';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-3, -18); ctx.lineTo(-6 + step * 3, -1);
      ctx.moveTo(3, -18); ctx.lineTo(6 - step * 3, -1);
      ctx.stroke();
      ctx.fillStyle = '#67724f';
      ctx.beginPath();
      ctx.moveTo(-9, -38);
      ctx.quadraticCurveTo(-15, -22, -8, -14);
      ctx.lineTo(9, -14);
      ctx.quadraticCurveTo(15, -22, 9, -38);
      ctx.closePath();
      ctx.fill();
      // 肋骨
      ctx.strokeStyle = 'rgba(210,220,180,.35)';
      ctx.lineWidth = 1.3;
      for (var gr = 0; gr < 3; gr++) {
        ctx.beginPath();
        ctx.moveTo(-6, -34 + gr * 6); ctx.lineTo(6, -34 + gr * 6);
        ctx.stroke();
      }
      // 长臂
      ctx.strokeStyle = '#78845a';
      ctx.lineWidth = 3.4;
      ctx.beginPath();
      ctx.moveTo(-8, -34); ctx.lineTo(-18 * flip, -16 + Math.sin(t * 5 + m.seed) * 3);
      ctx.moveTo(8, -34); ctx.lineTo(18 * flip, -16 - Math.sin(t * 5 + m.seed) * 3);
      ctx.stroke();
      // 爪
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-18 * flip, -16); ctx.lineTo(-22 * flip, -9);
      ctx.moveTo(18 * flip, -16); ctx.lineTo(22 * flip, -9);
      ctx.stroke();
      // 头
      ctx.fillStyle = '#8a9468';
      ellipse(ctx, 0, -45, 7.5, 8.5, 0);
      ctx.fillStyle = '#1a1c12';
      ellipse(ctx, -2.8, -46, 2.2, 2.6, 0);
      ellipse(ctx, 2.8, -46, 2.2, 2.6, 0);
      ctx.fillStyle = '#e8e0c8';
      ctx.fillRect(-3, -39, 6, 2);
    } else if (k === 'sentinel') {
      // 石卫：矮壮石块 + 符文
      ctx.fillStyle = '#5a564e';
      roundRect(ctx, -20, -28, 16, 28, 5); ctx.fill();
      roundRect(ctx, 4, -28, 16, 28, 5); ctx.fill();
      var ssg = ctx.createLinearGradient(0, -66, 0, -18);
      ssg.addColorStop(0, '#a49c8c');
      ssg.addColorStop(1, '#5f5a4e');
      ctx.fillStyle = ssg;
      roundRect(ctx, -23, -64, 46, 44, 12); ctx.fill();
      // 符文
      ctx.strokeStyle = 'rgba(120,200,255,' + (.5 + Math.sin(t * 2.6 + m.seed) * .25) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-10, -54); ctx.lineTo(-3, -46); ctx.lineTo(-11, -38);
      ctx.moveTo(10, -52); ctx.lineTo(4, -44); ctx.lineTo(11, -36);
      ctx.stroke();
      // 手臂
      ctx.fillStyle = '#857e6e';
      roundRect(ctx, -35, -58, 13, 30, 6); ctx.fill();
      roundRect(ctx, 22, -58, 13, 30, 6); ctx.fill();
      // 头
      ctx.fillStyle = '#a49c8c';
      roundRect(ctx, -10, -80, 20, 18, 6); ctx.fill();
      ctx.fillStyle = '#26221c';
      ctx.fillRect(-7, -75, 14, 4);
      ctx.fillStyle = 'rgba(150,210,255,.95)';
      ctx.fillRect(-5, -74.5, 3.4, 2);
      ctx.fillRect(1.6, -74.5, 3.4, 2);
    } else if (k === 'lich') {
      // 巫妖 Boss：漂浮骨袍 + 冠冕
      var lv = Math.sin(t * 2.2 + m.seed) * 5;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var lg = ctx.createRadialGradient(0, -40 + lv, 4, 0, -40 + lv, 46);
      lg.addColorStop(0, 'rgba(180,140,255,.5)');
      lg.addColorStop(1, 'rgba(60,20,120,0)');
      ctx.fillStyle = lg;
      ellipse(ctx, 0, -40 + lv, 44, 50, 0);
      ctx.restore();
      // 长袍
      var lrg = ctx.createLinearGradient(0, -60 + lv, 0, 0);
      lrg.addColorStop(0, '#4a3a70');
      lrg.addColorStop(1, '#161024');
      ctx.fillStyle = lrg;
      ctx.beginPath();
      ctx.moveTo(-14, -56 + lv);
      ctx.quadraticCurveTo(-32, -20, -24, 2);
      ctx.lineTo(-8, -4); ctx.lineTo(0, 2); ctx.lineTo(9, -4); ctx.lineTo(24, 2);
      ctx.quadraticCurveTo(32, -20, 14, -56 + lv);
      ctx.closePath();
      ctx.fill();
      // 肋骨光纹
      ctx.strokeStyle = 'rgba(200,170,255,.45)';
      ctx.lineWidth = 1.6;
      for (var lb = 0; lb < 3; lb++) {
        ctx.beginPath();
        ctx.moveTo(-10, -46 + lb * 8 + lv);
        ctx.quadraticCurveTo(0, -41 + lb * 8 + lv, 10, -46 + lb * 8 + lv);
        ctx.stroke();
      }
      // 头骨
      ctx.fillStyle = '#e2dcc8';
      ellipse(ctx, 0, -62 + lv, 11, 12, 0);
      ctx.fillStyle = '#14101e';
      ellipse(ctx, -4.2, -64 + lv, 3, 3.4, 0);
      ellipse(ctx, 4.2, -64 + lv, 3, 3.4, 0);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(190,150,255,1)';
      ellipse(ctx, -4.2, -64 + lv, 1.6, 1.8, 0);
      ellipse(ctx, 4.2, -64 + lv, 1.6, 1.8, 0);
      ctx.restore();
      ctx.fillStyle = '#14101e';
      ctx.fillRect(-4, -55 + lv, 8, 2.4);
      // 冠冕
      ctx.fillStyle = '#c8a850';
      for (var lc = 0; lc < 4; lc++) {
        ctx.beginPath();
        ctx.moveTo(-9 + lc * 6, -72 + lv);
        ctx.lineTo(-6 + lc * 6, -82 + lv);
        ctx.lineTo(-3 + lc * 6, -72 + lv);
        ctx.fill();
      }
      // 法杖
      ctx.strokeStyle = '#3a2c50';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(26 * flip, 0); ctx.lineTo(26 * flip, -76 + lv);
      ctx.stroke();
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var log = ctx.createRadialGradient(26 * flip, -82 + lv, 1, 26 * flip, -82 + lv, 14);
      log.addColorStop(0, 'rgba(230,200,255,1)');
      log.addColorStop(1, 'rgba(120,50,220,0)');
      ctx.fillStyle = log;
      ellipse(ctx, 26 * flip, -82 + lv, 14, 14, 0);
      ctx.restore();
    } else if (k === 'abomination') {
      // 憎恶 Boss：缝合巨躯
      ctx.fillStyle = '#4a5238';
      roundRect(ctx, -20, -26, 17, 26, 7); ctx.fill();
      roundRect(ctx, 4, -26, 17, 26, 7); ctx.fill();
      var agg = ctx.createLinearGradient(0, -84, 0, -14);
      agg.addColorStop(0, '#8a9468');
      agg.addColorStop(1, '#454c30');
      ctx.fillStyle = agg;
      ellipse(ctx, 0, -50, 34, 34, 0);
      // 缝合线
      ctx.strokeStyle = 'rgba(40,30,24,.75)';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(-18, -62); ctx.lineTo(18, -62);
      ctx.moveTo(-2, -80); ctx.lineTo(-2, -22);
      ctx.stroke();
      ctx.lineWidth = 1;
      for (var ab = 0; ab < 7; ab++) {
        ctx.beginPath();
        ctx.moveTo(-20 + ab * 6, -66); ctx.lineTo(-16 + ab * 6, -58);
        ctx.stroke();
      }
      // 裸露的心脏
      var hb = .8 + Math.sin(t * 5) * .2;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(220,60,60,' + hb + ')';
      ellipse(ctx, 6, -52, 9, 8, 0);
      ctx.restore();
      // 手臂
      ctx.fillStyle = '#78805c';
      roundRect(ctx, -50, -72, 18, 46, 9); ctx.fill();
      roundRect(ctx, 32, -72, 18, 46, 9); ctx.fill();
      // 钩爪
      ctx.strokeStyle = '#d8d0b8';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(-48, -26); ctx.lineTo(-52, -14);
      ctx.moveTo(-42, -26); ctx.lineTo(-40, -12);
      ctx.moveTo(48, -26); ctx.lineTo(52, -12);
      ctx.moveTo(42, -26); ctx.lineTo(40, -14);
      ctx.stroke();
      // 头（歪在一边）
      ctx.fillStyle = '#9aa478';
      ellipse(ctx, -6, -88, 13, 12, 0);
      ctx.fillStyle = '#1a1c12';
      ellipse(ctx, -11, -90, 3, 3.4, 0);
      ellipse(ctx, -1, -90, 3, 3.4, 0);
      glowEyes(ctx, -6, -90, 5, '#ff5a3c');
      // 口中缝线
      ctx.strokeStyle = '#2a1a14';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-12, -82); ctx.lineTo(0, -82);
      ctx.stroke();
    } else if (k === 'golem') {
      // 腿
      ctx.fillStyle = '#5d574a';
      roundRect(ctx, -20, -26, 15, 26, 6); ctx.fill();
      roundRect(ctx, 5, -26, 15, 26, 6); ctx.fill();
      // 躯体
      var gg = ctx.createLinearGradient(0, -80, 0, -20);
      gg.addColorStop(0, '#8b8171');
      gg.addColorStop(1, '#4c463b');
      ctx.fillStyle = gg;
      roundRect(ctx, -28, -78, 56, 56, 16);
      ctx.fill();
      // 发光裂缝
      var pulse = .6 + Math.sin(t * 3) * .3;
      ctx.strokeStyle = 'rgba(255,140,40,' + pulse + ')';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(-16, -70); ctx.lineTo(-6, -58); ctx.lineTo(-14, -46); ctx.lineTo(-2, -34);
      ctx.moveTo(14, -66); ctx.lineTo(6, -54); ctx.lineTo(16, -44);
      ctx.stroke();
      // 手臂
      ctx.fillStyle = '#776e5f';
      roundRect(ctx, -42, -70, 16, 40, 8); ctx.fill();
      roundRect(ctx, 26, -70, 16, 40, 8); ctx.fill();
      // 头
      ctx.fillStyle = '#8b8171';
      roundRect(ctx, -13, -96, 26, 22, 8); ctx.fill();
      ctx.fillStyle = '#2c2620';
      ctx.fillRect(-9, -90, 18, 5);
      var eg = ctx.createRadialGradient(0, -87, 1, 0, -87, 12);
      eg.addColorStop(0, 'rgba(255,190,90,1)');
      eg.addColorStop(1, 'rgba(255,90,20,0)');
      ctx.fillStyle = eg;
      ellipse(ctx, 0, -87, 12, 9, 0);
      // 肩部晶簇
      ctx.fillStyle = '#c07a3a';
      ctx.beginPath();
      ctx.moveTo(-26, -76); ctx.lineTo(-20, -92); ctx.lineTo(-14, -76); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(14, -76); ctx.lineTo(20, -92); ctx.lineTo(26, -76); ctx.fill();
    }

    // 精英光环
    if (m.elite) {
      var ac = m.affixColor || '#d0a040';
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = ac;
      ctx.globalAlpha = .45 + Math.sin(t * 5 + m.seed) * .18;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.ellipse(0, -2, m.r * 1.15 / s, m.r * .45 / s, 0, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      // 护盾
      if (m.shield > 0) {
        ctx.strokeStyle = 'rgba(120,190,255,.7)';
        ctx.fillStyle = 'rgba(90,150,255,.12)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, -34, m.r * 1.3 / s, 0, TAU);
        ctx.fill();
        ctx.stroke();
      }
    }

    // 受击闪白
    if (m.hitT > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(.7, m.hitT * 5);
      ctx.fillStyle = '#fff';
      ellipse(ctx, 0, -30, m.r * .9 / s, m.r * 1.1 / s, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
    // 诅咒
    if (m.curseT > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(.5, m.curseT);
      ctx.fillStyle = '#8a50d0';
      ellipse(ctx, 0, -30, m.r * .95 / s, m.r * 1.15 / s, 0);
      ctx.restore();
    }
    // 冻结
    if (m.frozen > 0) {
      ctx.fillStyle = 'rgba(150,220,255,.28)';
      ellipse(ctx, 0, -28, m.r * 1.05 / s, m.r * 1.25 / s, 0);
      ctx.strokeStyle = 'rgba(200,240,255,.7)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, -28, m.r / s, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ---------- 掉落物 ---------- */
  var RARITY_GLOW = ['rgba(200,190,170,', 'rgba(90,150,255,', 'rgba(255,200,70,', 'rgba(255,140,50,'];
  function drawGroundItem(ctx, it, t) {
    var rar = it.item ? it.item.rarity : 0;
    var g = RARITY_GLOW[rar];
    var bob = Math.sin(t * 3 + it.seed) * 2;
    // 光柱
    if (rar >= 2) {
      var h = rar === 3 ? 150 : 92;
      var w = rar === 3 ? 26 : 15;
      var lg = ctx.createLinearGradient(0, it.y - h, 0, it.y);
      lg.addColorStop(0, g + '0)');
      lg.addColorStop(.65, g + (rar === 3 ? '.22)' : '.13)'));
      lg.addColorStop(1, g + (rar === 3 ? '.5)' : '.32)'));
      ctx.fillStyle = lg;
      ctx.fillRect(it.x - w, it.y - h, w * 2, h);
      // 底光
      ctx.globalCompositeOperation = 'lighter';
      var rg = ctx.createRadialGradient(it.x, it.y, 1, it.x, it.y, w * 1.6);
      rg.addColorStop(0, g + '.45)');
      rg.addColorStop(1, g + '0)');
      ctx.fillStyle = rg;
      ellipse(ctx, it.x, it.y, w * 1.6, w * .7, 0);
      ctx.globalCompositeOperation = 'source-over';
    }
    // 图标
    ctx.save();
    ctx.translate(it.x, it.y - 12 + bob);
    if (it.type === 'gold') {
      ctx.fillStyle = '#e0b040';
      ellipse(ctx, 0, 0, 7, 5, 0);
      ctx.fillStyle = '#ffd870';
      ellipse(ctx, -1.5, -1.5, 4, 2.6, 0);
    } else if (it.type === 'potion') {
      ctx.fillStyle = '#8a2a30';
      roundRect(ctx, -5, -4, 10, 11, 3); ctx.fill();
      ctx.fillStyle = '#5a3a22';
      ctx.fillRect(-2.5, -8, 5, 5);
      ctx.fillStyle = 'rgba(255,140,140,.8)';
      ellipse(ctx, -1.5, 1, 2, 3, 0);
    } else {
      // 装备：按槽位画剪影
      var kk = it.item.slotKind || 'ring';
      ctx.fillStyle = '#d9cfb8';
      ctx.strokeStyle = '#d9cfb8';
      ctx.lineWidth = 2.2;
      if (kk === 'weapon') {
        ctx.beginPath();
        ctx.moveTo(-1.5, -10); ctx.lineTo(1.5, -10);
        ctx.lineTo(1.5, 6); ctx.lineTo(-1.5, 6);
        ctx.closePath(); ctx.fill();
        ctx.fillRect(-6, 5, 12, 2.5);
      } else if (kk === 'offhand') {
        ctx.beginPath();
        ctx.moveTo(0, -11); ctx.lineTo(8, -6); ctx.lineTo(8, 4);
        ctx.lineTo(0, 10); ctx.lineTo(-8, 4); ctx.lineTo(-8, -6);
        ctx.closePath(); ctx.fill();
      } else if (kk === 'helm') {
        ctx.beginPath();
        ctx.arc(0, 0, 8, Math.PI, 0);
        ctx.lineTo(8, 5); ctx.lineTo(-8, 5);
        ctx.closePath(); ctx.fill();
      } else if (kk === 'chest') {
        roundRect(ctx, -8, -9, 16, 18, 4); ctx.fill();
      } else if (kk === 'boots') {
        ctx.fillRect(-7, -8, 6, 14);
        ctx.fillRect(1, -8, 6, 14);
        ctx.fillRect(-7, 4, 9, 4);
        ctx.fillRect(1, 4, 9, 4);
      } else if (kk === 'amulet') {
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(0, -2, 6, .3, Math.PI - .3);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, 2); ctx.lineTo(4, 7); ctx.lineTo(0, 12); ctx.lineTo(-4, 7);
        ctx.closePath(); ctx.fill();
      } else {
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.arc(0, 2, 6, 0, TAU);
        ctx.stroke();
        ctx.fillStyle = it.item.rarity === 3 ? '#e08f4a' : '#8fd0ff';
        ellipse(ctx, 0, -6, 3, 3, 0);
      }
    }
    ctx.restore();
  }

  window.ABYSS_ART = {
    bakeFloor: bakeFloor,
    drawTorch: drawTorch,
    drawBarrel: drawBarrel,
    drawBones: drawBones,
    drawPortal: drawPortal,
    drawPlayer: drawPlayer,
    drawMonster: drawMonster,
    drawGroundItem: drawGroundItem,
    shadow: shadow,
    hash: hash
  };
})();
