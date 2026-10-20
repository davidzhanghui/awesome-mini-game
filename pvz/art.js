/* 植物大战僵尸 · 草坪守卫 — 程序化美术
 * 全部图形用 Canvas 2D 矢量绘制：黏土玩具风（深描边 + 柔和渐变 + 椭圆投影）。
 * 坐标系：植物/僵尸以脚底为原点 (0,0)，向上为负 y。
 */
(function () {
  'use strict';

  var A = {};
  var TAU = Math.PI * 2;
  var W = 1120, H = 660;
  var GX = 132, GY = 120, CW = 98, CH = 98, ROWS = 5, COLS = 9;

  var OUT = '#22301c';      // 植物描边
  var ZOUT = '#2f2b23';     // 僵尸描边
  var INK = '#2a1a0c';      // HUD 描边

  /* ---------------- 基础工具 ---------------- */
  function mix(a, b, t) {
    if (a[0] !== '#') return b;
    var pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)];
    var pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)];
    return 'rgb(' + Math.round(pa[0] + (pb[0] - pa[0]) * t) + ',' +
      Math.round(pa[1] + (pb[1] - pa[1]) * t) + ',' +
      Math.round(pa[2] + (pb[2] - pa[2]) * t) + ')';
  }
  function C(c, x, y, r) { c.fillStyle = c._f; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
  function circle(c, x, y, r, fill, stroke, lw) {
    c.beginPath(); c.arc(x, y, r, 0, TAU);
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 2; c.stroke(); }
  }
  function ell(c, x, y, rx, ry, fill, rot) {
    c.beginPath(); c.ellipse(x, y, rx, ry, rot || 0, 0, TAU);
    if (fill) { c.fillStyle = fill; c.fill(); }
  }
  function ellS(c, x, y, rx, ry, fill, stroke, rot, lw) {
    c.beginPath(); c.ellipse(x, y, rx, ry, rot || 0, 0, TAU);
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 2; c.stroke(); }
  }
  function rr(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  function fillRR(c, x, y, w, h, r, fill, stroke, lw) {
    rr(c, x, y, w, h, r);
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 2; c.stroke(); }
  }
  function line(c, x1, y1, x2, y2, w, col, cap) {
    c.strokeStyle = col; c.lineWidth = w; c.lineCap = cap || 'round';
    c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
  }
  function path(c, pts, w, col, close) {
    c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(pts[0], pts[1]);
    for (var i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
    if (close) c.closePath();
    c.stroke();
  }
  function shadow(c, x, y, rx, ry, a) {
    c.fillStyle = 'rgba(20,30,12,' + (a == null ? 0.22 : a) + ')';
    c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); c.fill();
  }
  function gradV(c, x, y0, y1, stops) {
    var g = c.createLinearGradient(x, y0, x, y1);
    for (var i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
    return g;
  }
  function gradR(c, x, y, r0, r1, stops) {
    var g = c.createRadialGradient(x, y, r0, x, y, r1);
    for (var i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
    return g;
  }
  // 眼睛：白眼球 + 瞳孔
  function eye(c, x, y, r, lookX, lookY, dead) {
    circle(c, x, y, r, '#fff', null);
    if (dead) {
      c.strokeStyle = '#2a2a2a'; c.lineWidth = Math.max(1, r * 0.32);
      c.beginPath();
      c.moveTo(x - r * .55, y - r * .55); c.lineTo(x + r * .55, y + r * .55);
      c.moveTo(x + r * .55, y - r * .55); c.lineTo(x - r * .55, y + r * .55);
      c.stroke();
    } else {
      circle(c, x + (lookX || 0), y + (lookY || 0), r * 0.52, '#1b1b16', null);
      circle(c, x + (lookX || 0) - r * .18, y + (lookY || 0) - r * .18, r * 0.17, 'rgba(255,255,255,.85)', null);
    }
  }
  function leaf(c, x, y, len, wid, rot, fill, stroke) {
    c.save(); c.translate(x, y); c.rotate(rot);
    c.beginPath();
    c.moveTo(0, 0);
    c.quadraticCurveTo(len * .5, -wid, len, 0);
    c.quadraticCurveTo(len * .5, wid, 0, 0);
    c.fillStyle = fill; c.fill();
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1.6; c.stroke(); }
    c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(3, 0); c.lineTo(len * .78, 0); c.stroke();
    c.restore();
  }

  /* ---------------- 调色板 ---------------- */
  var P = {
    stem: '#3f9b2f', stemD: '#2c7220', leaf: '#4fb83a', leafD: '#2e7a24',
    sun: '#ffd23a', sunD: '#e0a010', face: '#8a5426', faceD: '#5e3512',
    pea: '#62d03c', peaD: '#3d9a26', ice: '#7dd3ff', iceD: '#3a9fd8',
    nut: '#e2b366', nutD: '#a97a38', nutDD: '#7a5520',
    purple: '#a855c8', purpleD: '#74359a',
    metal: '#c9d2d9', metalD: '#7c8790', metalL: '#eef3f6',
    wood: '#9a6a34', woodD: '#6a4520'
  };

  /* ---------------- 背景 ---------------- */
  var SCENES = {
    day: {
      g1: '#63b94f', g2: '#54a843', gEdge: '#3f8531', tuft: '#7ed067',
      path: '#c3b79a', pathD: '#a99b7d', pathL: '#d8cdb2',
      bush: '#2f6a2a', bushD: '#255421', sky: '#bfe4f5',
      light: 'rgba(255,241,190,.14)', shade: 'rgba(30,60,20,.00)',
      wall: '#d9c9a6', wallD: '#bba98a', roof: '#a4562e',
      fence: '#efe3c6', fenceD: '#c9b88e'
    },
    noon: {
      g1: '#6cc455', g2: '#5cb448', gEdge: '#438c33', tuft: '#8bdd70',
      path: '#cfc2a4', pathD: '#b3a586', pathL: '#e4d9be',
      bush: '#337230', bushD: '#275a26', sky: '#cdebf7',
      light: 'rgba(255,250,215,.16)', shade: 'rgba(255,240,180,.05)',
      wall: '#e2d3b0', wallD: '#c2b092', roof: '#ad5d32',
      fence: '#f3e8cb', fenceD: '#cdbc92'
    },
    dusk: {
      g1: '#6f9c3c', g2: '#5f8b33', gEdge: '#486d26', tuft: '#8eb654',
      path: '#b8a282', pathD: '#9c8768', pathL: '#cdb998',
      bush: '#2c5a26', bushD: '#22471f', sky: '#f2a65a',
      light: 'rgba(255,140,60,.17)', shade: 'rgba(120,50,20,.10)',
      wall: '#c9ac82', wallD: '#a98c68', roof: '#8f4526',
      fence: '#e0cda6', fenceD: '#bda37c'
    },
    night: {
      g1: '#3c7d5c', g2: '#336f51', gEdge: '#265742', tuft: '#4f9a72',
      path: '#8d8a7d', pathD: '#74716a', pathL: '#9e9b8c',
      bush: '#1d422f', bushD: '#163326', sky: '#152238',
      light: 'rgba(130,180,255,.10)', shade: 'rgba(10,25,45,.30)',
      wall: '#8f846d', wallD: '#6f6654', roof: '#5c3a2c',
      fence: '#b9ae94', fenceD: '#948a72'
    },
    eclipse: {
      g1: '#356e55', g2: '#2d614b', gEdge: '#204a39', tuft: '#437f63',
      path: '#7e7c72', pathD: '#67655f', pathL: '#8d8b7e',
      bush: '#183a2a', bushD: '#122d21', sky: '#0f1728',
      light: 'rgba(255,120,90,.10)', shade: 'rgba(5,12,28,.38)',
      wall: '#7f7560', wallD: '#615949', roof: '#4c2e23',
      fence: '#a89e86', fenceD: '#877e69'
    }
  };
  A.SCENES = SCENES;

  function seeded(seed) {
    return function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  }

  A.buildBackground = function (scene, dpr) {
    var pal = SCENES[scene] || SCENES.day;
    var cv = document.createElement('canvas');
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    var b = cv.getContext('2d');
    b.setTransform(dpr, 0, 0, dpr, 0, 0);
    var rd = seeded(scene === 'night' || scene === 'eclipse' ? 31 : scene === 'dusk' ? 17 : 7);
    var lawnW = COLS * CW, lawnH = ROWS * CH;

    // 底部全幅草地（避免 HUD 下方露白）
    b.fillStyle = pal.gEdge; b.fillRect(0, 0, W, H);

    // ---- 草坪格 ----
    for (var r = 0; r < ROWS; r++) {
      for (var col = 0; col < COLS; col++) {
        var x = GX + col * CW, y = GY + r * CH;
        b.fillStyle = (r + col) % 2 ? pal.g1 : pal.g2;
        b.fillRect(x, y, CW, CH);
        // 每格顶部的斜向光泽
        var g = b.createLinearGradient(x, y, x, y + CH);
        g.addColorStop(0, 'rgba(255,255,255,.09)'); g.addColorStop(.45, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,.06)');
        b.fillStyle = g; b.fillRect(x, y, CW, CH);
      }
    }
    // 割草纹理（细横条）
    for (var rr2 = 0; rr2 < ROWS; rr2++) {
      b.fillStyle = 'rgba(0,0,0,.035)';
      b.fillRect(GX, GY + rr2 * CH + CH - 8, lawnW, 7);
      b.fillStyle = 'rgba(255,255,255,.045)';
      b.fillRect(GX, GY + rr2 * CH, lawnW, 4);
    }
    // 草叶纹理
    for (var i = 0; i < 900; i++) {
      var gx = GX + rd() * lawnW, gy = GY + rd() * lawnH;
      b.strokeStyle = rd() > .5 ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.075)';
      b.lineWidth = 1.1;
      b.beginPath(); b.moveTo(gx, gy); b.lineTo(gx + (rd() - .5) * 4, gy - 3 - rd() * 4); b.stroke();
    }
    // 行列交界极淡网格
    b.strokeStyle = 'rgba(0,0,0,.055)'; b.lineWidth = 1;
    for (var c2 = 1; c2 < COLS; c2++) { b.beginPath(); b.moveTo(GX + c2 * CW, GY); b.lineTo(GX + c2 * CW, GY + lawnH); b.stroke(); }

    // ---- 左侧石板路 ----
    var pg = b.createLinearGradient(0, 0, GX, 0);
    pg.addColorStop(0, pal.pathD); pg.addColorStop(.55, pal.path); pg.addColorStop(1, pal.pathL);
    b.fillStyle = pg; b.fillRect(0, GY - 10, GX, lawnH + 20);
    b.strokeStyle = 'rgba(60,45,25,.22)'; b.lineWidth = 1.6;
    for (var pr = 0; pr <= ROWS; pr++) {
      b.beginPath(); b.moveTo(0, GY + pr * CH); b.lineTo(GX, GY + pr * CH - 6); b.stroke();
    }
    for (var pr2 = 0; pr2 < ROWS; pr2++) {
      var ox = pr2 % 2 ? 34 : 66;
      b.beginPath(); b.moveTo(ox, GY + pr2 * CH); b.lineTo(ox - 4, GY + (pr2 + 1) * CH); b.stroke();
      b.beginPath(); b.moveTo(ox + 62, GY + pr2 * CH); b.lineTo(ox + 58, GY + (pr2 + 1) * CH); b.stroke();
    }
    // 石面小石子
    for (var s2 = 0; s2 < 90; s2++) {
      var sx = rd() * GX, sy = GY + rd() * lawnH;
      circle(b, sx, sy, 0.8 + rd() * 1.8, rd() > .5 ? 'rgba(255,255,255,.28)' : 'rgba(80,65,45,.18)', null);
    }
    // 草坪左缘阴影
    var eg = b.createLinearGradient(GX - 12, 0, GX + 6, 0);
    eg.addColorStop(0, 'rgba(30,50,20,0)'); eg.addColorStop(1, 'rgba(20,40,12,.30)');
    b.fillStyle = eg; b.fillRect(GX - 12, GY - 10, 18, lawnH + 20);

    // ---- 房屋前廊（左上，露出一点墙和屋顶） ----
    b.fillStyle = pal.wall; b.fillRect(0, GY - 76, 92, 78);
    b.fillStyle = pal.wallD; b.fillRect(0, GY - 20, 92, 20);
    for (var wl = 0; wl < 4; wl++) { b.fillStyle = 'rgba(0,0,0,.07)'; b.fillRect(4, GY - 70 + wl * 14, 84, 6); }
    b.fillStyle = pal.roof;
    b.beginPath(); b.moveTo(-10, GY - 76); b.lineTo(100, GY - 76); b.lineTo(88, GY - 96); b.lineTo(0, GY - 96); b.closePath(); b.fill();
    // 窗
    fillRR(b, 18, GY - 64, 34, 26, 5, '#7a8f9e', '#5b4030', 2.5);
    line(b, 35, GY - 64, 35, GY - 38, 2, '#5b4030');
    line(b, 18, GY - 51, 52, GY - 51, 2, '#5b4030');

    // ---- 顶部栅栏 ----
    var fenceY = GY - 6;
    b.fillStyle = 'rgba(0,0,0,.14)'; b.fillRect(0, fenceY + 2, W, 6);
    for (var fx = 0; fx < W; fx += 17) {
      b.fillStyle = pal.fence;
      b.beginPath();
      b.moveTo(fx + 2, fenceY + 4); b.lineTo(fx + 2, fenceY - 34);
      b.lineTo(fx + 8.5, fenceY - 42); b.lineTo(fx + 15, fenceY - 34);
      b.lineTo(fx + 15, fenceY + 4); b.closePath(); b.fill();
      b.strokeStyle = pal.fenceD; b.lineWidth = 1; b.stroke();
    }
    b.fillStyle = pal.fenceD; b.fillRect(0, fenceY - 26, W, 4);
    b.fillStyle = 'rgba(255,255,255,.18)'; b.fillRect(0, fenceY - 26, W, 1.5);

    // ---- 底部灌木 ----
    var bt = GY + lawnH;
    b.fillStyle = pal.bushD; b.fillRect(0, bt, W, H - bt);
    for (var bx = -10; bx < W + 20; bx += 26) {
      b.fillStyle = (bx / 26) % 2 ? pal.bush : pal.bushD;
      b.beginPath(); b.arc(bx + 13, bt + 14, 17 + ((bx / 26) % 3) * 2, Math.PI, 0); b.fill();
      b.fillRect(bx - 4, bt + 12, 34, H - bt);
    }
    // 灌木高光
    for (var bx2 = 0; bx2 < W; bx2 += 26) {
      b.fillStyle = 'rgba(255,255,255,.07)';
      b.beginPath(); b.arc(bx2 + 13, bt + 12, 12, Math.PI * 1.1, Math.PI * 1.75); b.fill();
    }

    // ---- 右侧围栏与野草 ----
    var rx = GX + lawnW;
    var rgd = b.createLinearGradient(rx, 0, W, 0);
    rgd.addColorStop(0, 'rgba(20,45,15,.38)'); rgd.addColorStop(.5, 'rgba(30,60,20,.15)'); rgd.addColorStop(1, 'rgba(20,45,15,.35)');
    b.fillStyle = rgd; b.fillRect(rx, GY, W - rx, lawnH);
    for (var gr = 0; gr < 220; gr++) {
      var gx2 = rx + rd() * (W - rx), gy2 = GY + rd() * lawnH;
      b.strokeStyle = 'rgba(20,50,15,' + (0.12 + rd() * .16) + ')'; b.lineWidth = 1.2;
      b.beginPath(); b.moveTo(gx2, gy2); b.lineTo(gx2 + (rd() - .5) * 6, gy2 - 6 - rd() * 8); b.stroke();
    }
    b.fillStyle = 'rgba(15,35,12,.30)'; b.fillRect(rx - 3, GY, 4, lawnH);

    // ---- 暗角 ----
    var vg = b.createRadialGradient(W * .45, H * .46, H * .32, W * .5, H * .5, H * .95);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(10,20,5,.24)');
    b.fillStyle = vg; b.fillRect(0, 0, W, H);

    // ---- 场景光照 ----
    if (scene === 'day' || scene === 'noon') {
      var lg = b.createRadialGradient(W * .82, -60, 40, W * .78, 120, 620);
      lg.addColorStop(0, pal.light); lg.addColorStop(1, 'rgba(255,240,180,0)');
      b.fillStyle = lg; b.fillRect(0, 0, W, H);
    } else if (scene === 'dusk') {
      var lg2 = b.createLinearGradient(0, GY, 0, H);
      lg2.addColorStop(0, 'rgba(255,120,40,.05)'); lg2.addColorStop(1, 'rgba(120,30,60,.28)');
      b.fillStyle = lg2; b.fillRect(0, GY - 10, W, H - GY + 10);
      var sunGlow = b.createRadialGradient(W * .86, GY + 30, 10, W * .86, GY + 30, 340);
      sunGlow.addColorStop(0, 'rgba(255,210,120,.55)'); sunGlow.addColorStop(1, 'rgba(255,150,60,0)');
      b.fillStyle = sunGlow; b.fillRect(0, 0, W, H);
    } else {
      var ng = b.createLinearGradient(0, GY, 0, H);
      ng.addColorStop(0, 'rgba(10,25,55,.34)'); ng.addColorStop(1, 'rgba(5,15,35,.50)');
      b.fillStyle = ng; b.fillRect(0, GY - 10, W, H - GY + 10);
      var mg = b.createRadialGradient(W * .84, 70, 8, W * .84, 70, 300);
      mg.addColorStop(0, 'rgba(190,215,255,.42)'); mg.addColorStop(1, 'rgba(150,190,255,0)');
      b.fillStyle = mg; b.fillRect(0, 0, W, H);
      if (scene === 'eclipse') {
        var eg2 = b.createRadialGradient(W * .84, 70, 26, W * .84, 70, 120);
        eg2.addColorStop(0, 'rgba(255,120,80,.30)'); eg2.addColorStop(1, 'rgba(255,80,50,0)');
        b.fillStyle = eg2; b.fillRect(0, 0, W, H);
      }
    }
    return cv;
  };

  /* 每帧绘制的环境装饰（云、萤火、光柱） */
  A.drawSky = function (c, scene, t) {
    if (scene === 'day' || scene === 'noon') {
      // 云影掠过草坪
      c.save();
      for (var i = 0; i < 3; i++) {
        var cx = ((t * (7 + i * 3) + i * 420) % (W + 500)) - 250;
        var cy = 150 + i * 70;
        c.globalAlpha = 0.10;
        c.fillStyle = '#ffffff';
        c.beginPath();
        c.ellipse(cx, cy, 130, 26, 0, 0, TAU);
        c.ellipse(cx + 70, cy - 12, 80, 20, 0, 0, TAU);
        c.fill();
      }
      c.restore();
      // 阳光光柱
      c.save(); c.globalAlpha = 0.05; c.fillStyle = '#fff6c8';
      var bx = W * .78;
      c.beginPath(); c.moveTo(bx - 40, GY); c.lineTo(bx + 10, GY); c.lineTo(bx - 130, H); c.lineTo(bx - 300, H); c.closePath(); c.fill();
      c.restore();
    } else if (scene === 'night' || scene === 'eclipse') {
      for (var j = 0; j < 22; j++) {
        var fx = GX + ((j * 137.3 + Math.sin(t * .7 + j) * 26) % (COLS * CW));
        var fy = GY + 70 + ((j * 83.7 + Math.cos(t * .5 + j * 2) * 20) % (ROWS * CH - 100));
        var a = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(t * 2.2 + j * 1.7));
        c.fillStyle = 'rgba(255,240,160,' + a + ')';
        c.beginPath(); c.arc(fx, fy, 1.6 + (j % 3) * .6, 0, TAU); c.fill();
        var g = c.createRadialGradient(fx, fy, 0, fx, fy, 9);
        g.addColorStop(0, 'rgba(255,240,160,' + a * .35 + ')'); g.addColorStop(1, 'rgba(255,240,160,0)');
        c.fillStyle = g; c.beginPath(); c.arc(fx, fy, 9, 0, TAU); c.fill();
      }
    } else if (scene === 'dusk') {
      for (var k = 0; k < 10; k++) {
        var mx = GX + ((k * 211 + t * 14) % (COLS * CW));
        var my = GY + 80 + ((k * 97) % (ROWS * CH - 120));
        c.fillStyle = 'rgba(255,200,120,.16)';
        c.beginPath(); c.arc(mx, my, 2.2, 0, TAU); c.fill();
      }
    }
  };

  /* ---------------- 墓碑 ---------------- */
  A.drawGrave = function (c, x, y, t, broken) {
    if (broken) {
      c.fillStyle = 'rgba(60,50,40,.55)';
      ell(c, x, y - 3, 22, 9, 'rgba(40,30,22,.35)');
      c.fillStyle = '#6e6456';
      c.beginPath(); c.moveTo(x - 16, y); c.lineTo(x - 12, y - 12); c.lineTo(x - 2, y - 6); c.lineTo(x + 6, y - 15); c.lineTo(x + 14, y); c.closePath(); c.fill();
      return;
    }
    shadow(c, x, y, 24, 8, 0.28);
    var g = gradV(c, x, y - 62, y, [[0, '#9a9184'], [1, '#6d6558']]);
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(x - 21, y);
    c.lineTo(x - 21, y - 44);
    c.arc(x, y - 44, 21, Math.PI, 0);
    c.lineTo(x + 21, y);
    c.closePath();
    c.fill();
    c.strokeStyle = '#4c463c'; c.lineWidth = 2.5; c.stroke();
    // 阴影面
    c.fillStyle = 'rgba(0,0,0,.14)';
    c.beginPath(); c.moveTo(x + 6, y); c.lineTo(x + 6, y - 58); c.arc(x, y - 44, 15, 0, Math.PI * .5); c.closePath(); c.fill();
    // 刻字
    c.strokeStyle = 'rgba(45,40,34,.55)'; c.lineWidth = 2; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x - 8, y - 40); c.lineTo(x + 8, y - 40); c.stroke();
    c.beginPath(); c.moveTo(x - 5, y - 31); c.lineTo(x + 6, y - 31); c.stroke();
    c.beginPath(); c.moveTo(x - 2, y - 22); c.lineTo(x + 1, y - 22); c.stroke();
    // 苔藓
    c.fillStyle = 'rgba(70,120,50,.35)';
    c.beginPath(); c.ellipse(x - 14, y - 8, 9, 5, .3, 0, TAU); c.fill();
    // 鬼火
    var fl = 0.5 + 0.5 * Math.sin(t * 3 + x);
    var gg = c.createRadialGradient(x + 12, y - 48, 0, x + 12, y - 48, 18);
    gg.addColorStop(0, 'rgba(140,255,190,' + (0.3 + fl * .25) + ')'); gg.addColorStop(1, 'rgba(140,255,190,0)');
    c.fillStyle = gg; c.beginPath(); c.arc(x + 12, y - 48, 18, 0, TAU); c.fill();
  };

  /* ---------------- 植物 ---------------- */
  // v: { t, hp, max, armed, rise, cherry, chew, hurt, glow, fire }
  function stem(c, h, sway, col, colD) {
    c.save(); c.rotate(sway * .35);
    c.strokeStyle = colD; c.lineWidth = 9; c.lineCap = 'round';
    c.beginPath(); c.moveTo(0, -2); c.quadraticCurveTo(-4, -h * .55, 0, -h); c.stroke();
    c.strokeStyle = col; c.lineWidth = 6;
    c.beginPath(); c.moveTo(0, -2); c.quadraticCurveTo(-4, -h * .55, 0, -h); c.stroke();
    c.restore();
  }
  function pairLeaves(c, y1, y2, tint) {
    leaf(c, -4, y1, 26, 9, Math.PI + .42, tint || P.leaf, P.leafD);
    leaf(c, 4, y2, 26, 9, -.42, tint || P.leaf, P.leafD);
  }
  function smile(c, x, y, w, open) {
    c.strokeStyle = '#3a1c08'; c.lineWidth = 2.2; c.lineCap = 'round';
    c.beginPath();
    if (open) { c.ellipse(x, y, w, w * .8, 0, 0, Math.PI); }
    else c.arc(x, y, w, 0.15, Math.PI - 0.15);
    c.stroke();
  }

  var DRAW = {};

  DRAW.sunflower = function (c, v) {
    var t = v.t, sway = Math.sin(t * 2.1) * .06, gl = v.glow || 0;
    shadow(c, 0, 1, 25, 8);
    stem(c, 40, sway, P.stem, P.stemD);
    pairLeaves(c, -14, -22);
    c.save(); c.translate(0, -58); c.rotate(sway * 1.4);
    var sc = 1 + gl * .1 + Math.sin(t * 3) * .012;
    c.scale(sc, sc);
    if (gl > 0) {
      var g = gradR(c, 0, 0, 8, 52, [[0, 'rgba(255,244,160,' + (.7 * gl) + ')'], [1, 'rgba(255,230,100,0)']]);
      c.fillStyle = g; c.beginPath(); c.arc(0, 0, 52, 0, TAU); c.fill();
    }
    // 花瓣
    for (var i = 0; i < 13; i++) {
      var a = i / 13 * TAU + t * .18;
      c.save(); c.translate(Math.cos(a) * 19, Math.sin(a) * 19); c.rotate(a);
      ellS(c, 0, 0, 11.5, 6.2, gl > .35 ? '#ffe066' : P.sun, P.sunD, 0, 1.4);
      c.restore();
    }
    // 花盘
    var fg = gradR(c, -4, -4, 2, 17, [[0, '#a86a34'], [1, '#6b3f16']]);
    circle(c, 0, 0, 15.5, fg, '#4a2a0e', 2.2);
    // 花盘纹理
    for (var d = 0; d < 10; d++) {
      var da = d / 10 * TAU;
      circle(c, Math.cos(da) * 9, Math.sin(da) * 9, 1.1, 'rgba(255,220,150,.35)', null);
    }
    eye(c, -5.5, -3, 4.4, 0, 0);
    eye(c, 5.5, -3, 4.4, 0, 0);
    smile(c, 0, 3, 6.5);
    c.restore();
  };

  function peaHead(c, t, ice, sway) {
    var col = ice ? P.ice : P.pea, colD = ice ? P.iceD : P.peaD;
    c.save(); c.rotate(sway * .4);
    // 后脑叶冠
    for (var i = 0; i < 3; i++) {
      c.save(); c.rotate(-2.1 + i * .36);
      ellS(c, 0, -17, 4.6, 11.5, colD, null, 0, 0);
      c.restore();
    }
    if (ice) {
      c.fillStyle = '#eaf8ff';
      for (var k = 0; k < 3; k++) {
        c.save(); c.rotate(-2.1 + k * .36);
        c.beginPath(); c.moveTo(-3.2, -24); c.lineTo(0, -33); c.lineTo(3.2, -24); c.closePath(); c.fill();
        c.restore();
      }
    }
    var hg = gradR(c, -6, -7, 3, 19, [[0, ice ? '#d4f2ff' : '#a9f27e'], [1, col]]);
    circle(c, 0, 0, 17.5, hg, colD, 2.2);
    // 炮口
    fillRR(c, 9, -6.5, 22, 15, 6, ice ? '#b6e6ff' : col, colD, 2);
    ell(c, 31, 1, 3.6, 7.4, '#16320f');
    ell(c, 30.4, 1, 2.1, 5, '#081c05');
    // 高光
    c.fillStyle = 'rgba(255,255,255,.55)';
    c.beginPath(); c.ellipse(-6, -8, 5.4, 3.4, -.5, 0, TAU); c.fill();
    eye(c, 2.2, -5.5, 4.4, 1.2, .2);
    // 嘴
    c.strokeStyle = '#2c5a18'; c.lineWidth = 1.8; c.beginPath(); c.arc(3, 6, 4.2, .2, Math.PI - .5); c.stroke();
    if (ice && Math.sin(t * 2) > .3) {
      circle(c, 36 + Math.sin(t * 6) * 2, -4, 1.5, 'rgba(255,255,255,.8)', null);
      circle(c, 40, 4, 1.1, 'rgba(255,255,255,.6)', null);
    }
    c.restore();
  }

  DRAW.peashooter = function (c, v) {
    var t = v.t, sway = Math.sin(t * 2.3) * .07;
    shadow(c, 0, 1, 24, 7.5);
    stem(c, 34, sway, P.stem, P.stemD);
    pairLeaves(c, -11, -18);
    var rec = v.shoot > 0 ? -5 * Math.min(1, v.shoot / .16) : 0;
    c.save(); c.translate(rec, -52); peaHead(c, t, false, sway); c.restore();
  };

  DRAW.snowpea = function (c, v) {
    var t = v.t, sway = Math.sin(t * 2.1) * .07;
    shadow(c, 0, 1, 24, 7.5);
    stem(c, 34, sway, '#3f9b7a', '#2c7260');
    leaf(c, -4, -11, 25, 8.5, Math.PI + .42, '#5fcf9e', '#3a8f6c');
    leaf(c, 4, -18, 25, 8.5, -.42, '#5fcf9e', '#3a8f6c');
    var rec = v.shoot > 0 ? -5 * Math.min(1, v.shoot / .16) : 0;
    c.save(); c.translate(rec, -52); peaHead(c, t, true, sway); c.restore();
    // 地面霜
    c.fillStyle = 'rgba(220,245,255,.35)';
    c.beginPath(); c.ellipse(0, 0, 22, 5, 0, 0, TAU); c.fill();
  };

  DRAW.repeater = function (c, v) {
    var t = v.t, sway = Math.sin(t * 2.3) * .07;
    shadow(c, 0, 1, 24, 7.5);
    stem(c, 34, sway, '#3f9b2f', '#2c7220');
    pairLeaves(c, -11, -18);
    var rec = v.shoot > 0 ? -5 * Math.min(1, v.shoot / .16) : 0;
    c.save(); c.translate(rec, -52); peaHead(c, t, false, sway); c.restore();
    // 第二根炮管
    c.save(); c.translate(rec, -36);
    fillRR(c, 12, -4, 20, 13, 6, P.pea, P.peaD, 2);
    ell(c, 31, 2.5, 3.2, 6, '#16320f');
    c.restore();
  };

  DRAW.threepeater = function (c, v) {
    var t = v.t, sway = Math.sin(t * 2.2) * .06;
    shadow(c, 0, 1, 24, 7.5);
    stem(c, 30, sway, P.stem, P.stemD);
    pairLeaves(c, -9, -15);
    var rec = v.shoot > 0 ? -4 * Math.min(1, v.shoot / .16) : 0;
    c.save(); c.translate(rec, -44);
    c.save(); c.translate(-4, 0); c.scale(.86, .86); peaHead(c, t, false, sway); c.restore();
    c.save(); c.translate(-14, -22); c.rotate(-.5); c.scale(.66, .66); peaHead(c, t, false, sway); c.restore();
    c.save(); c.translate(-14, 22); c.rotate(.5); c.scale(.66, .66); peaHead(c, t, false, sway); c.restore();
    c.restore();
  };

  DRAW.wallnut = function (c, v) {
    var ratio = v.hp / v.max, st = ratio > .66 ? 0 : ratio > .33 ? 1 : 2;
    var t = v.t, wob = Math.sin(t * 2) * .02 + (v.hurt > 0 ? Math.sin(t * 60) * .045 : 0);
    shadow(c, 0, 1, 27, 8);
    c.save(); c.rotate(wob);
    var g = gradR(c, -9, -46, 4, 38, [[0, st === 2 ? '#d8ae70' : '#f0c67c'], [1, st === 2 ? '#94682f' : '#b3813a']]);
    ellS(c, 0, -36, 27, 34, g, '#6e4a1a', 0, 2.4);
    // 高光
    c.fillStyle = 'rgba(255,255,255,.22)';
    c.beginPath(); c.ellipse(-10, -50, 9, 13, -.4, 0, TAU); c.fill();
    // 裂纹
    c.strokeStyle = '#5a3a12'; c.lineWidth = 2; c.lineJoin = 'round';
    if (st >= 1) {
      c.beginPath(); c.moveTo(-7, -66); c.lineTo(-2, -55); c.lineTo(-10, -48); c.lineTo(-4, -39); c.stroke();
      c.beginPath(); c.moveTo(15, -22); c.lineTo(9, -15); c.lineTo(14, -8); c.stroke();
      // 汗滴
      c.fillStyle = '#8fd8ff';
      c.beginPath(); c.moveTo(21, -64); c.quadraticCurveTo(26, -55, 21, -51); c.quadraticCurveTo(16, -55, 21, -64); c.fill();
    }
    if (st === 2) {
      c.fillStyle = '#4a2f10';
      c.beginPath(); c.moveTo(-26, -48); c.lineTo(-12, -56); c.lineTo(-18, -45); c.lineTo(-10, -38); c.lineTo(-26, -34); c.closePath(); c.fill();
      c.strokeStyle = '#5a3a12'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(9, -68); c.lineTo(13, -55); c.lineTo(6, -47); c.lineTo(12, -34); c.stroke();
    }
    var ey = st === 2 ? -40 : -42;
    eye(c, -8, ey, 5.6, 0, 0);
    eye(c, 8, ey, 5.6, 0, 0);
    c.strokeStyle = '#3a2208'; c.lineWidth = 2.2; c.lineCap = 'round';
    c.beginPath();
    if (st === 0) c.arc(0, -30, 6.5, .2, Math.PI - .2);
    else if (st === 1) { c.moveTo(-6, -26); c.lineTo(6, -26); }
    else c.arc(0, -23, 6, Math.PI + .3, TAU - .3);
    c.stroke();
    if (st >= 1) { c.beginPath(); c.moveTo(-15, -52); c.lineTo(-4, st === 2 ? -47 : -50); c.moveTo(15, -52); c.lineTo(4, st === 2 ? -47 : -50); c.stroke(); }
    c.restore();
  };

  DRAW.tallnut = function (c, v) {
    var ratio = v.hp / v.max, st = ratio > .75 ? 0 : ratio > .5 ? 1 : ratio > .25 ? 2 : 3;
    var t = v.t, wob = Math.sin(t * 1.8) * .016 + (v.hurt > 0 ? Math.sin(t * 60) * .04 : 0);
    shadow(c, 0, 1, 26, 8, .24);
    c.save(); c.rotate(wob);
    var g = gradR(c, -9, -70, 5, 52, [[0, st >= 2 ? '#d8ae70' : '#f3cb82'], [1, st >= 2 ? '#8f632c' : '#ad7c36']]);
    ellS(c, 0, -52, 25, 45, g, '#6e4a1a', 0, 2.4);
    c.fillStyle = 'rgba(255,255,255,.20)';
    c.beginPath(); c.ellipse(-9, -72, 8, 16, -.35, 0, TAU); c.fill();
    c.strokeStyle = '#5a3a12'; c.lineWidth = 2;
    if (st >= 1) { c.beginPath(); c.moveTo(-6, -95); c.lineTo(-1, -82); c.lineTo(-9, -73); c.lineTo(-3, -62); c.stroke(); }
    if (st >= 2) { c.beginPath(); c.moveTo(14, -40); c.lineTo(8, -30); c.lineTo(15, -22); c.lineTo(9, -13); c.stroke(); }
    if (st >= 3) { c.fillStyle = '#4a2f10'; c.beginPath(); c.moveTo(-24, -62); c.lineTo(-10, -70); c.lineTo(-17, -56); c.lineTo(-8, -48); c.lineTo(-24, -44); c.closePath(); c.fill(); }
    // 坚毅表情
    eye(c, -8, -60, 5.4, 0, 0);
    eye(c, 8, -60, 5.4, 0, 0);
    c.strokeStyle = '#3a2208'; c.lineWidth = 2.6; c.lineCap = 'round';
    c.beginPath(); c.moveTo(-15, -70); c.lineTo(-3, -66); c.moveTo(15, -70); c.lineTo(3, -66); c.stroke();
    c.beginPath(); c.moveTo(-6, -46); c.lineTo(6, -46); c.stroke();
    c.restore();
  };

  DRAW.potato = function (c, v) {
    var t = v.t;
    // 土堆
    ell(c, 0, -4, 24, 9, '#6b4a24');
    ell(c, 0, -7, 18, 6.5, '#8a6234');
    if (!v.armed) {
      // 埋着：只露个土包 + 红灯
      for (var i = 0; i < 5; i++) circle(c, -13 + i * 6.5, -8 + (i % 2) * 2, 2, '#5a3d1a', null);
      line(c, 0, -10, 1, -22, 3, '#4a3418');
      var on = Math.sin(t * 9) > 0;
      circle(c, 1, -24, 4.6, on ? '#ff3b2f' : '#6e1d16', '#3a0f0a', 1.2);
      if (on) {
        var g = gradR(c, 1, -24, 1, 15, [[0, 'rgba(255,70,50,.7)'], [1, 'rgba(255,60,40,0)']]);
        c.fillStyle = g; c.beginPath(); c.arc(1, -24, 15, 0, TAU); c.fill();
      }
    } else {
      var rise = v.rise == null ? 1 : v.rise;
      c.save(); c.translate(0, (1 - rise) * 16);
      var sq = 1 + Math.sin(t * 4) * .02;
      c.scale(1 / sq, sq);
      var g2 = gradR(c, -7, -28, 3, 26, [[0, '#f0c883'], [1, '#b98b48']]);
      ellS(c, 0, -20, 23, 18, g2, '#7a5520', 0, 2.2);
      // 芽眼
      circle(c, -12, -26, 2, 'rgba(90,60,25,.35)', null);
      circle(c, 10, -14, 1.8, 'rgba(90,60,25,.35)', null);
      eye(c, -7, -24, 4.2, 0, 0);
      eye(c, 7, -24, 4.2, 0, 0);
      smile(c, 0, -16, 5);
      // 引线
      line(c, 0, -37, 2, -48, 2.6, '#4a3418');
      var on2 = Math.sin(t * 10) > 0;
      circle(c, 2, -50, 4.4, on2 ? '#ff3b2f' : '#ffd23a', '#7a3a0a', 1.2);
      c.restore();
    }
  };

  DRAW.cherry = function (c, v) {
    var f = Math.min(1, (v.cherry || 0) / 1);
    var sc = 1 + f * .5, t = v.t;
    var flash = f > 0 ? (Math.sin(f * 44) > 0 ? f : f * .35) : 0;
    shadow(c, 0, 1, 24, 7.5);
    c.save(); c.translate(0, -18); c.scale(sc, sc); c.translate(0, 18);
    c.save(); c.rotate(Math.sin(t * 3) * .03);
    var st = '#3f7a2a';
    c.strokeStyle = st; c.lineWidth = 3.4; c.lineCap = 'round';
    c.beginPath(); c.moveTo(-14, -28); c.quadraticCurveTo(-10, -56, 1, -62); c.stroke();
    c.beginPath(); c.moveTo(14, -30); c.quadraticCurveTo(9, -54, 1, -62); c.stroke();
    leaf(c, 1, -62, 22, 8, -.35, '#4fb83a', '#2e7a24');
    for (var i = 0; i < 2; i++) {
      var sx = i ? 14 : -14, sy = i ? -24 : -22;
      var g = gradR(c, sx - 5, sy - 5, 2, 19, [[0, mix('#ff6a5a', '#ffffff', flash * .85)], [1, mix('#c2141b', '#ff6a2a', flash)]]);
      circle(c, sx, sy, 16.5, g, '#7a0f12', 2.2);
      c.fillStyle = 'rgba(255,255,255,.42)';
      c.beginPath(); c.ellipse(sx - 6, sy - 7, 4.6, 3.2, -.5, 0, TAU); c.fill();
      // 愤怒的眼睛
      eye(c, sx - 4.5, sy - 3, 3.6, 0, .4);
      eye(c, sx + 4.5, sy - 3, 3.6, 0, .4);
      c.strokeStyle = '#4a0a0a'; c.lineWidth = 2; c.lineCap = 'round';
      c.beginPath(); c.moveTo(sx - 9, sy - 9); c.lineTo(sx - 2, sy - 6.5); c.moveTo(sx + 9, sy - 9); c.lineTo(sx + 2, sy - 6.5); c.stroke();
      c.beginPath(); c.arc(sx, sy + 6, 4.4, Math.PI + .35, TAU - .35); c.stroke();
    }
    c.restore();
    c.restore();
  };

  DRAW.chomper = function (c, v) {
    var t = v.t, chew = v.chew || 0, sway = Math.sin(t * 1.7) * .05;
    shadow(c, 0, 1, 24, 8);
    stem(c, 40, sway, '#3f7a3a', '#2c5a28');
    pairLeaves(c, -12, -20, '#4fa848');
    var open = chew > 0 ? .12 : (.55 + .45 * Math.sin(t * 1.6));
    c.save(); c.translate(0, -58); c.rotate(sway * .8);
    // 头
    var hg = gradR(c, -6, -8, 3, 26, [[0, '#cf8ce8'], [1, P.purple]]);
    ellS(c, 0, 0, 21, 20, hg, P.purpleD, 0, 2.3);
    // 上颚
    c.save();
    c.fillStyle = P.purpleD;
    c.beginPath(); c.moveTo(2, 0); c.quadraticCurveTo(20, -6 - open * 12, 28, -2 - open * 16); c.quadraticCurveTo(18, -2, 4, 3); c.closePath(); c.fill();
    c.restore();
    // 嘴（开口）
    if (open > .2) {
      c.fillStyle = '#4a0f2a';
      c.beginPath(); c.moveTo(6, -2); c.quadraticCurveTo(20, -6 - open * 12, 28, -2 - open * 16);
      c.quadraticCurveTo(24, 2, 26, 4); c.quadraticCurveTo(14, 6, 6, 2); c.closePath(); c.fill();
      // 牙齿
      c.fillStyle = '#fff8e8';
      for (var i = 0; i < 4; i++) {
        var tx = 9 + i * 5;
        c.beginPath(); c.moveTo(tx, -2 - i * .3); c.lineTo(tx + 2.4, 3); c.lineTo(tx + 4.4, -1.6); c.closePath(); c.fill();
      }
    }
    // 眼睛
    eye(c, -6, -8, 4.4, -1, -.5);
    eye(c, 5, -10, 4, 1, -.5);
    // 叶子装饰
    leaf(c, -6, -19, 20, 7, -1.9, '#4fb83a', '#2e7a24');
    // 咀嚼鼓包
    if (chew > 0) {
      var k = Math.sin(t * 9) * 2;
      ellS(c, -2, 6, 10 + k * .4, 8, 'rgba(110,50,140,.55)', null, 0, 0);
      c.fillStyle = 'rgba(255,255,255,.4)'; c.font = '700 13px sans-serif'; c.textAlign = 'center';
      c.fillText('…', -2, 9);
    }
    c.restore();
  };

  DRAW.spike = function (c, v) {
    var t = v.t;
    shadow(c, 0, 0, 40, 9, .18);
    // 土槽
    ell(c, 0, -2, 42, 10, '#4a3a22');
    ell(c, 0, -5, 42, 9, '#6b5636');
    var rows = [-6, 4];
    for (var r = 0; r < 2; r++) {
      for (var i = 0; i < 5; i++) {
        var x = -34 + i * 17 + (r % 2) * 8.5, y = rows[r];
        var g = gradV(c, x, y - 16, y, [[0, '#eef3f6'], [1, '#98a4ac']]);
        c.fillStyle = g; c.strokeStyle = '#4c565e'; c.lineWidth = 1.3;
        c.beginPath();
        c.moveTo(x - 5.5, y); c.lineTo(x, y - 16); c.lineTo(x + 5.5, y);
        c.closePath(); c.fill(); c.stroke();
      }
    }
    // 闪光
    var a = .35 + .35 * Math.sin(t * 3);
    c.strokeStyle = 'rgba(255,255,255,' + a + ')'; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(-22, -14); c.lineTo(-19, -9); c.stroke();
  };

  DRAW.torch = function (c, v) {
    var t = v.t;
    shadow(c, 0, 1, 24, 8);
    // 树桩
    var g = gradV(c, 0, -38, 0, [[0, '#b8834a'], [1, '#7a5428']]);
    fillRR(c, -17, -38, 34, 38, 7, g, '#4e3218', 2.4);
    // 年轮顶面
    ellS(c, 0, -38, 17, 6.5, '#d9a763', '#4e3218', 0, 2);
    c.strokeStyle = 'rgba(110,70,30,.5)'; c.lineWidth = 1;
    c.beginPath(); c.ellipse(0, -38, 10, 3.8, 0, 0, TAU); c.stroke();
    // 树皮纹
    c.strokeStyle = 'rgba(70,45,20,.4)'; c.lineWidth = 1.6;
    for (var i = 0; i < 3; i++) { c.beginPath(); c.moveTo(-11 + i * 10, -30); c.lineTo(-11 + i * 10 + 1, -8); c.stroke(); }
    // 火焰
    var f = Math.sin(t * 7) * .5 + Math.sin(t * 11.3) * .5;
    c.save(); c.translate(0, -42);
    var fg = gradR(c, 0, -10, 2, 30, [[0, 'rgba(255,250,200,.95)'], [.45, 'rgba(255,190,60,.9)'], [1, 'rgba(230,70,30,0)']]);
    c.fillStyle = fg;
    c.beginPath();
    c.moveTo(-13, 3);
    c.quadraticCurveTo(-16, -12 - f * 3, -4, -20 - f * 4);
    c.quadraticCurveTo(-2, -30 - f * 5, 2, -34 - f * 5);
    c.quadraticCurveTo(4, -22, 10, -16 - f * 3);
    c.quadraticCurveTo(17, -6, 12, 3);
    c.closePath(); c.fill();
    c.fillStyle = 'rgba(255,255,220,.9)';
    c.beginPath(); c.moveTo(-5, 2); c.quadraticCurveTo(-6, -10, 0, -17 - f * 2); c.quadraticCurveTo(7, -8, 5, 2); c.closePath(); c.fill();
    c.restore();
    // 火星
    for (var k = 0; k < 3; k++) {
      var yy = -56 - ((t * 26 + k * 17) % 34);
      c.fillStyle = 'rgba(255,190,80,' + (0.7 - (yy + 56) / 60) + ')';
      c.beginPath(); c.arc(Math.sin(t * 3 + k) * 6, yy, 1.6, 0, TAU); c.fill();
    }
  };

  A.drawPlant = function (c, type, v) {
    (DRAW[type] || DRAW.peashooter)(c, v);
  };
  A.plantTypes = Object.keys(DRAW);

  /* ---------------- 僵尸 ---------------- */
  var ZCOL = {
    normal:    { skin: '#9cbb8c', skinD: '#7d9d6d', coat: '#6b5a45', coatD: '#4f412f', pants: '#58656f', pantsD: '#414c55' },
    cone:      { skin: '#9cbb8c', skinD: '#7d9d6d', coat: '#6b5a45', coatD: '#4f412f', pants: '#58656f', pantsD: '#414c55' },
    bucket:    { skin: '#9cbb8c', skinD: '#7d9d6d', coat: '#5f5340', coatD: '#463c2d', pants: '#4f5a62', pantsD: '#3a4449' },
    pole:      { skin: '#a3c190', skinD: '#82a272', coat: '#3b74c9', coatD: '#2a5597', pants: '#2e5aa1', pantsD: '#22447c' },
    newspaper: { skin: '#9cbb8c', skinD: '#7d9d6d', coat: '#7a6a50', coatD: '#5a4c38', pants: '#5a6068', pantsD: '#43484f' },
    door:      { skin: '#93b184', skinD: '#748f66', coat: '#6f6250', coatD: '#514636', pants: '#4f5a62', pantsD: '#3a4449' },
    football:  { skin: '#a8c297', skinD: '#84a173', coat: '#b8342c', coatD: '#8a1f1a', pants: '#e8e2d0', pantsD: '#c2bba8' },
    giant:     { skin: '#7e96a0', skinD: '#61787f', coat: '#6a3d6e', coatD: '#4a2850', pants: '#3b3550', pantsD: '#29243a' },
    imp:       { skin: '#a9be9a', skinD: '#86997a', coat: '#8a4a8a', coatD: '#653465', pants: '#4a4458', pantsD: '#35303f' }
  };

  // z: { type, ph, eat, dead, dieT, flash, slow, armLost, armor, armorMax, smash, jumping, jumpT, rage, throwT }
  A.drawZombie = function (c, z, t) {
    var type = z.type, col = ZCOL[type] || ZCOL.normal;
    var s = z.scale || 1;
    var K = function (hex) {
      if (z.flash > 0) return mix(hex, '#ffffff', .78);
      if (z.charred) return mix(hex, '#201a14', .78);
      if (z.slow > 0) return mix(hex, '#6fb8ff', .45);
      if (z.rage && type === 'newspaper') return mix(hex, '#ff8a7a', .28);
      return hex;
    };
    var alpha = 1;
    if (z.dead) alpha = Math.max(0, 1 - Math.max(0, z.dieT - (z.charred ? .25 : .8)) / .7);
    if (alpha <= 0) return;

    // 阴影（缩放前，固定大小；跳跃时留在地面）
    c.fillStyle = 'rgba(20,30,12,' + (0.25 * alpha) + ')';
    c.beginPath(); c.ellipse(z.x, z.y + 2, 25 * s, 7 * s, 0, 0, TAU); c.fill();

    c.save();
    c.globalAlpha = alpha;
    c.translate(z.x, z.y - (z.jy || 0));
    c.scale(s, s);
    var ph = z.ph, eat = z.eat ? (0.5 + 0.5 * Math.sin(ph * 9)) : 0;
    var amp = z.dead ? .05 : (z.eat ? .1 : (z.jumping ? .3 : .55));
    var lean = z.eat ? .12 + eat * .06 : (z.type === 'giant' ? .06 : .05);

    if (z.dead && !z.charred) { var f = Math.min(1, (z.dieT || 0) / .55); c.rotate(f * f * 1.45); }
    if (z.jumping) { c.translate(0, -40); c.rotate(-Math.min(1, z.jt / .95) * TAU); c.translate(0, 40); }

    // 腿
    for (var i = 1; i >= 0; i--) {
      var a = Math.sin(ph + i * Math.PI) * amp;
      var hx = -2 + i * 6, hy = -30;
      var fx = hx + Math.sin(a) * 21, fy = hy + Math.cos(a) * 29;
      line(c, hx, hy, fx, fy, 9.2, K(i ? mix(col.pants, '#000000', .16) : col.pants));
      ell(c, fx - 3.5, fy - 1, 9, 4.4, K('#2d2d33'));
    }

    // 躯干 + 头（整体前倾）
    c.save();
    c.translate(0, -30); c.rotate(-lean); c.translate(0, 30);

    // 后臂
    var raise = 0;
    if (z.smash != null && z.smash > 0) raise = Math.min(1, z.smash / .7);
    var armA = function (k) {
      var ang = Math.PI + .08 + Math.sin(ph + k) * .12;
      if (z.eat) ang = Math.PI + .25 + Math.sin(ph * 9 + k) * .4;
      if (z.type === 'giant') ang = Math.PI * 1.5 * raise + Math.PI * .1 * (1 - raise) + (z.smash < 0 ? Math.min(1, -z.smash / .5) * -0.5 : 0);
      if (z.jumping) ang = Math.PI * 1.3;
      if (z.dead) ang = Math.PI * .8;
      return ang;
    };
    var arm = function (sx, sy, ang, coatCol, skinCol) {
      var ex = sx + Math.cos(ang) * 13, ey = sy + Math.sin(ang) * 13;
      var a2 = ang + .22, hx2 = ex + Math.cos(a2) * 13, hy2 = ey + Math.sin(a2) * 13;
      line(c, sx, sy, ex, ey, 7, K(coatCol));
      line(c, ex, ey, hx2, hy2, 6, K(skinCol));
      circle(c, hx2, hy2, 4.2, K(col.skinD), K(ZOUT), 1.2);
    };
    arm(4, -34, armA(Math.PI), mix(col.coat, '#000000', .2), col.skin);

    // 躯干
    var tg = gradV(c, 0, -64, -28, [[0, K(mix(col.coat, '#ffffff', .10))], [1, K(col.coat)]]);
    rr(c, -13, -64, 26, 38, 7); c.fillStyle = tg; c.fill();
    c.strokeStyle = K(col.coatD); c.lineWidth = 1.6; c.stroke();
    // 衬衫领口 + 领带
    c.fillStyle = K('#e2d6bb'); c.beginPath(); c.moveTo(-5, -62); c.lineTo(5, -62); c.lineTo(3, -50); c.lineTo(-3, -50); c.closePath(); c.fill();
    if (type !== 'football' && type !== 'giant') {
      c.fillStyle = K(type === 'pole' ? '#e8c43a' : '#b33a3a');
      c.beginPath(); c.moveTo(-2.6, -60); c.lineTo(2.6, -60); c.lineTo(3.4, -40); c.lineTo(0, -34); c.lineTo(-3.4, -40); c.closePath(); c.fill();
    }
    // 衣摆破口
    c.fillStyle = K(mix(col.coat, '#000000', .28));
    for (var k2 = 0; k2 < 4; k2++) { c.beginPath(); c.moveTo(-13 + k2 * 6.5, -29); c.lineTo(-10 + k2 * 6.5, -23); c.lineTo(-7 + k2 * 6.5, -29); c.closePath(); c.fill(); }
    // 橄榄球肩甲
    if (type === 'football') {
      c.fillStyle = K('#d8d2c0'); c.strokeStyle = K('#8e8878'); c.lineWidth = 1.5;
      ell(c, -13, -58, 11, 8, K('#ddd7c5')); c.stroke();
      ell(c, 13, -58, 11, 8, K('#ddd7c5')); c.stroke();
      c.fillStyle = K('#f2ecd8'); c.fillRect(-4, -60, 8, 5);
    }
    // 巨人背上的电线杆
    if (type === 'giant') {
      c.save(); c.translate(16, -40); c.rotate(.12);
      c.fillStyle = K('#7a5a32'); c.fillRect(-4, -70, 8, 110);
      c.fillStyle = K('#5e4222'); c.fillRect(-14, -62, 28, 5); c.fillRect(-11, -48, 22, 4);
      c.restore();
    }

    // 头
    c.save();
    c.translate(-2, -78); c.rotate(Math.sin(ph) * .06 + (z.eat ? eat * .1 : 0) + (z.dead ? .35 : 0));
    var hg = gradR(c, -5, -5, 2, 17, [[0, K(mix(col.skin, '#ffffff', .16))], [1, K(col.skin)]]);
    circle(c, 0, 0, 14, hg, K(col.skinD), 1.8);
    // 耳朵
    circle(c, 12, 2, 3.2, K(col.skinD), null);
    // 头发
    c.strokeStyle = K('#3a3a2a'); c.lineWidth = 2; c.lineCap = 'round';
    if (type !== 'football' && z.armorType !== 'bucket') {
      c.beginPath(); c.moveTo(-7, -13); c.lineTo(-9, -20); c.moveTo(-2, -14); c.lineTo(-2, -22); c.moveTo(3, -13); c.lineTo(5, -19); c.stroke();
    }
    // 眼睛
    eye(c, -6, -2, 4.4, 0, 0, z.dead);
    eye(c, 3.5, -3, 3.5, 0, 0, z.dead);
    if (z.rage) {
      c.fillStyle = 'rgba(255,60,40,.35)';
      c.beginPath(); c.arc(0, -2, 12, 0, TAU); c.fill();
    }
    // 嘴
    c.fillStyle = K('#3a1a1a');
    c.beginPath(); c.moveTo(-8, 6); c.quadraticCurveTo(-2, 11 + eat * 4, 5, 6); c.lineTo(4, 4); c.lineTo(-7, 4); c.closePath(); c.fill();
    c.fillStyle = K('#f1ead2'); c.fillRect(-6, 4, 3, 3); c.fillRect(-.5, 4, 3, 3);

    // ---- 头部护甲 ----
    if (z.armorType === 'cone' && z.armor > 0) {
      var dm = z.armor / z.armorMax;
      c.fillStyle = K(dm > .5 ? '#ff8a1c' : '#d96a10');
      c.beginPath(); c.moveTo(-13.5, -8); c.lineTo(12, -8); c.lineTo(-.5, -40); c.closePath(); c.fill();
      c.strokeStyle = K('#8a4408'); c.lineWidth = 1.4; c.stroke();
      c.fillStyle = K('#fff');
      c.beginPath(); c.moveTo(-9.5, -17); c.lineTo(7.5, -17); c.lineTo(5, -23.5); c.lineTo(-6.5, -23.5); c.fill();
      c.beginPath(); c.moveTo(-5, -29); c.lineTo(3, -29); c.lineTo(.8, -34.5); c.lineTo(-2.8, -34.5); c.fill();
      ell(c, -.6, -8, 14.5, 3.4, K('#e07410'));
      if (dm < .6) { c.fillStyle = K(col.skinD); c.beginPath(); c.moveTo(-1, -40); c.lineTo(3.5, -31); c.lineTo(-4, -32); c.closePath(); c.fill(); }
    } else if (z.armorType === 'bucket' && z.armor > 0) {
      var db = z.armor / z.armorMax;
      var bg = c.createLinearGradient(-14, 0, 14, 0);
      bg.addColorStop(0, K('#8d98a1')); bg.addColorStop(.38, K('#eef3f6')); bg.addColorStop(1, K('#7a858e'));
      c.fillStyle = bg;
      c.beginPath(); c.moveTo(-11, -36); c.lineTo(10, -36); c.lineTo(14.5, -7); c.lineTo(-15.5, -7); c.closePath(); c.fill();
      c.strokeStyle = K('#55606a'); c.lineWidth = 1.5; c.stroke();
      ell(c, -.5, -36, 10.5, 3, K('#b4bdc4'));
      ell(c, -.5, -7, 15, 3.2, K('#6c7780'));
      line(c, -9, -27, 11, -27, 1.3, K('#6c7780'));
      line(c, -10, -17, 12.5, -17, 1.3, K('#6c7780'));
      c.fillStyle = 'rgba(255,255,255,.4)'; c.fillRect(-7, -33, 4, 22);
      if (db < .66) { c.fillStyle = K('#5a636b'); c.beginPath(); c.ellipse(-4, -22, 4, 2.4, .6, 0, TAU); c.fill(); }
      if (db < .33) { c.fillStyle = K('#3f464c'); c.beginPath(); c.ellipse(5, -15, 5, 3, -.4, 0, TAU); c.fill(); }
    } else if (z.armorType === 'helmet' && z.armor > 0) {
      var dh = z.armor / z.armorMax;
      var hlg = gradR(c, -4, -6, 2, 20, [[0, K('#e04a3a')], [1, K('#a01e18')]]);
      c.fillStyle = hlg;
      c.beginPath(); c.arc(0, -3, 17, Math.PI * 1.02, Math.PI * 1.98); c.closePath(); c.fill();
      c.strokeStyle = K('#6a1210'); c.lineWidth = 1.6; c.stroke();
      // 面罩
      c.fillStyle = K('#d8d2c0');
      c.fillRect(-13, 4, 26, 3.2);
      for (var m = 0; m < 4; m++) { c.fillRect(-11 + m * 7, 7, 2, 6); }
      c.fillStyle = K('#f2ecd8'); c.fillRect(-1.6, -21, 3.2, 16);
      if (dh < .5) { c.strokeStyle = K('#6a1210'); c.lineWidth = 2; c.beginPath(); c.moveTo(-8, -14); c.lineTo(-3, -8); c.lineTo(-9, -4); c.stroke(); }
    } else if (type === 'pole') {
      // 头带
      c.fillStyle = K('#d33'); c.fillRect(-14, -9, 28, 5);
      c.fillStyle = K('#ffd23a'); c.beginPath(); c.moveTo(-14, -9); c.lineTo(-22, -12); c.lineTo(-21, -5); c.closePath(); c.fill();
    }
    c.restore(); // 头

    // 报纸僵尸的报纸（护甲）
    if (type === 'newspaper' && z.armor > 0) {
      c.save(); c.translate(20, -52); c.rotate(-.12);
      c.fillStyle = K('#efe6cf'); c.strokeStyle = K('#8a7a58'); c.lineWidth = 1.4;
      c.fillRect(-4, -20, 30, 40); c.strokeRect(-4, -20, 30, 40);
      c.strokeStyle = K('#6a5a3a'); c.lineWidth = 1.4;
      c.beginPath(); c.moveTo(0, -16); c.lineTo(22, -16); c.stroke();
      for (var ln = 0; ln < 7; ln++) { c.beginPath(); c.moveTo(-1, -8 + ln * 4); c.lineTo(15 - (ln % 3) * 3, -8 + ln * 4); c.stroke(); }
      c.fillStyle = K('#555'); c.fillRect(18, -17, 6, 6);
      c.restore();
    }
    // 铁门
    if (type === 'door' && z.armor > 0) {
      c.save(); c.translate(24, -36);
      var dg = c.createLinearGradient(-16, 0, 16, 0);
      dg.addColorStop(0, K('#7e8890')); dg.addColorStop(.4, K('#cfd6dc')); dg.addColorStop(1, K('#6d767d'));
      c.fillStyle = dg; c.strokeStyle = K('#4a5258'); c.lineWidth = 2;
      fillRR(c, -16, -38, 32, 74, 4, dg, K('#4a5258'), 2);
      // 视窗
      c.fillStyle = K('#5a6a72'); c.fillRect(-9, -30, 18, 14);
      c.strokeStyle = K('#3f464c'); c.lineWidth = 1.4;
      for (var b2 = 0; b2 < 3; b2++) { c.beginPath(); c.moveTo(-9, -26 + b2 * 5); c.lineTo(9, -26 + b2 * 5); c.stroke(); }
      // 铆钉
      c.fillStyle = K('#9aa4ab');
      for (var rv = 0; rv < 4; rv++) { circle(c, -11, -20 + rv * 16, 1.6, K('#aeb8bf'), null); circle(c, 11, -20 + rv * 16, 1.6, K('#aeb8bf'), null); }
      // 把手
      c.fillStyle = K('#8a949b'); c.fillRect(7, 2, 5, 12);
      c.restore();
    }

    c.restore(); // 躯干

    // 撑杆
    if (type === 'pole' && z.hasPole !== false) {
      line(c, -48, -42 + Math.sin(ph * 2) * 2, 46, -66, 4.2, K('#9a6a34'));
      c.strokeStyle = K('#c99a5e'); c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(-46, -43); c.lineTo(44, -66); c.stroke();
    }
    // 前臂
    if (!z.armLost) arm(-6, -34, armA(0), col.coat, col.skin);
    else { circle(c, -6, -34, 4, K(col.skinD), K(ZOUT), 1.2); }

    // 巨人手中的大棒 / 铁锤
    if (type === 'giant') {
      c.save(); c.translate(30, -40); c.rotate(z.smash > 0 ? -1.1 + Math.min(1, z.smash / .7) * .9 : -.15);
      c.fillStyle = K('#6a4a2a'); c.fillRect(-6, -8, 12, 54);
      c.fillStyle = K('#8a6a44'); c.strokeStyle = K('#4a3018'); c.lineWidth = 2;
      rr(c, -22, -58, 44, 54, 12); c.fill(); c.stroke();
      c.fillStyle = K('#a88254'); rr(c, -16, -52, 16, 12, 5); c.fill();
      c.restore();
    }
    c.restore();
  };

  /* 死亡的焦黑烟雾等由 game.js 粒子处理 */

  /* ---------------- 小物件 ---------------- */
  A.drawSun = function (c, x, y, r, rot, alpha) {
    c.save(); c.globalAlpha = alpha == null ? 1 : alpha; c.translate(x, y);
    var g = c.createRadialGradient(0, 0, r * .3, 0, 0, r * 2.4);
    g.addColorStop(0, 'rgba(255,246,170,.85)'); g.addColorStop(1, 'rgba(255,220,80,0)');
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, r * 2.4, 0, TAU); c.fill();
    c.rotate(rot);
    c.fillStyle = '#ffcf2e'; c.strokeStyle = '#e09a10'; c.lineWidth = 1.2;
    for (var i = 0; i < 12; i++) {
      c.rotate(TAU / 12);
      c.beginPath(); c.moveTo(r * .82, -r * .17); c.lineTo(r * 1.5, 0); c.lineTo(r * .82, r * .17); c.closePath(); c.fill();
    }
    var g2 = c.createRadialGradient(-r * .28, -r * .3, r * .08, 0, 0, r);
    g2.addColorStop(0, '#fffce0'); g2.addColorStop(.55, '#ffe45a'); g2.addColorStop(1, '#f2b41a');
    c.fillStyle = g2; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(190,120,10,.45)'; c.lineWidth = 1; c.stroke();
    c.restore();
  };

  A.drawPea = function (c, x, y, ice, fire, scale) {
    var s = scale || 1;
    c.save(); c.translate(x, y); c.scale(s, s);
    var trail = fire ? 'rgba(255,150,40,' : ice ? 'rgba(160,225,255,' : 'rgba(110,210,66,';
    for (var i = 3; i >= 1; i--) {
      c.fillStyle = trail + (0.26 - i * .06) + ')';
      c.beginPath(); c.arc(-i * 7, 0, 6.5 - i * 1.2, 0, TAU); c.fill();
    }
    if (fire) {
      var fg = c.createRadialGradient(0, 0, 1, 0, 0, 13);
      fg.addColorStop(0, 'rgba(255,255,220,.9)'); fg.addColorStop(.4, 'rgba(255,170,40,.95)'); fg.addColorStop(1, 'rgba(220,60,20,0)');
      c.fillStyle = fg; c.beginPath(); c.arc(0, 0, 13, 0, TAU); c.fill();
    }
    var g = c.createRadialGradient(-2.5, -2.5, 1, 0, 0, 9);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(.34, fire ? '#ffd23a' : ice ? '#8fdcff' : '#6fd042');
    g.addColorStop(1, fire ? '#e0501a' : ice ? '#3a9fd8' : '#3d9a26');
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, 8.2, 0, TAU); c.fill();
    c.strokeStyle = fire ? 'rgba(150,40,10,.5)' : ice ? 'rgba(30,90,130,.4)' : 'rgba(30,90,20,.35)';
    c.lineWidth = 1; c.stroke();
    c.restore();
  };

  A.drawMower = function (c, x, y, running, t) {
    c.save(); c.translate(x, y + (running ? Math.sin(t * 60) * 1.4 : 0));
    shadow(c, 0, 6, 29, 6, .25);
    var g = gradV(c, 0, -26, 0, [[0, '#ef5a48'], [1, '#c22f24']]);
    fillRR(c, -25, -25, 48, 25, 8, g, '#7a1612', 2.2);
    fillRR(c, -11, -34, 22, 11, 4, '#d8432f', '#7a1612', 2);
    c.fillStyle = '#ffe1a0'; c.fillRect(-9, -31, 8, 4);
    line(c, 15, -27, 27, -47, 4.2, '#666'); line(c, 23, -47, 34, -47, 4.2, '#444');
    line(c, -25, -8, -36, -8, 3, '#aaa'); line(c, -36, -15, -36, -1, 3, '#ccc');
    for (var i = 0; i < 2; i++) {
      var wx = i ? 14 : -14;
      circle(c, wx, 0, 8, '#26262b', null);
      circle(c, wx, 0, 3.4, '#b9b9b9', null);
      c.strokeStyle = 'rgba(255,255,255,.25)'; c.lineWidth = 1.2;
      c.beginPath(); c.arc(wx, 0, 5.6, 0.4, 2.2); c.stroke();
    }
    if (running) {
      for (var k = 0; k < 4; k++) {
        c.fillStyle = 'rgba(255,220,120,' + (.7 - k * .15) + ')';
        c.beginPath(); c.arc(-38 - k * 7, -10 + Math.sin(t * 40 + k) * 5, 2.2, 0, TAU); c.fill();
      }
    }
    c.restore();
  };

  A.drawShovel = function (c, x, y, s, rot) {
    c.save(); c.translate(x, y); c.rotate(rot || 0); c.scale(s || 1, s || 1);
    line(c, 0, -26, 0, 5, 5, '#8a5a2b');
    line(c, -8, -28, 8, -28, 5.4, '#6b4420');
    fillRR(c, -10, 3, 20, 20, 8, '#cfd7dd', '#6b757d', 2);
    c.fillStyle = '#aeb8bf'; c.beginPath(); c.moveTo(-10, 3); c.lineTo(10, 3); c.lineTo(8, 9); c.lineTo(-8, 9); c.closePath(); c.fill();
    line(c, -4, 8, -4, 20, 2, 'rgba(255,255,255,.75)');
    c.restore();
  };

  /* 旗帜僵尸的小旗（大波次） */
  A.drawFlag = function (c, x, y, t) {
    c.save(); c.translate(x, y);
    line(c, 0, 0, 0, -54, 3, '#7a5428');
    c.fillStyle = '#b32020';
    var w = Math.sin(t * 3) * 4;
    c.beginPath(); c.moveTo(1, -54); c.quadraticCurveTo(20, -56 + w, 38, -46 + w * 1.4);
    c.lineTo(38 + w, -30 + w); c.quadraticCurveTo(20, -34 - w, 1, -34); c.closePath(); c.fill();
    circle(c, 20, -44 + w * .7, 4.4, '#f1e6c8', null);
    c.fillStyle = '#b32020'; circle(c, 20, -44 + w * .7, 1.6, '#b32020', null);
    c.restore();
  };

  /* ---------------- 迷你预览（卡片 / 侧栏） ---------------- */
  A.drawPlantPreview = function (c, type, x, y, scale, t) {
    c.save(); c.translate(x, y); c.scale(scale, scale);
    A.drawPlant(c, type, { t: t || 0, hp: 1, max: 1, armed: true, rise: 1, cherry: 0, chew: 0, hurt: 0 });
    c.restore();
  };

  A.drawSmallZombie = function (c, type, x, y, scale, t) {
    c.save(); c.translate(x, y); c.scale(scale, scale);
    A.drawZombie(c, {
      type: type, ph: (t || 0) * 3, eat: false, dead: false, dieT: 0, flash: 0, slow: 0,
      armLost: false, armor: 999, armorMax: 999, armorType: (PVZ_DATA.ZOMBIES[type] || {}).armorType || null,
      scale: 1, x: 0, y: 0, smash: 0,
      hasPole: type === 'pole'
    }, t || 0);
    c.restore();
  };

  A.metrics = { GX: GX, GY: GY, CW: CW, CH: CH, ROWS: ROWS, COLS: COLS, W: W, H: H };
  window.PVZ_ART = A;
})();
