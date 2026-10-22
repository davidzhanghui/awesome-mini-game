/* 萌可花园 · 植物大战僵尸（萌可版） — 程序化美术
 * 风格：奶油糖果系「萌可」——粉彩配色、粗圆描边、大眼高光、腮红与小星星。
 * 全部图形用 Canvas 2D 矢量绘制，无素材文件。
 * 坐标系：植物 / 僵尸以脚底为原点 (0,0)，向上为负 y。
 */
(function () {
  'use strict';

  var A = {};
  var TAU = Math.PI * 2;
  var W = 1120, H = 660;
  var GX = 132, GY = 120, CW = 98, CH = 98, ROWS = 5, COLS = 9;

  var OUT = '#5d4157';      // 植物统一描边：暖紫棕
  var ZOUT = '#59424f';     // 僵尸描边
  var INK = '#4a2f3f';

  /* ---------------- 基础工具 ---------------- */
  function mix(a, b, t) {
    if (!a || a[0] !== '#') return b;
    var pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)];
    var pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)];
    return 'rgb(' + Math.round(pa[0] + (pb[0] - pa[0]) * t) + ',' +
      Math.round(pa[1] + (pb[1] - pa[1]) * t) + ',' +
      Math.round(pa[2] + (pb[2] - pa[2]) * t) + ')';
  }
  function alpha(hex, a) {
    if (!hex || hex[0] !== '#') return hex;
    return 'rgba(' + parseInt(hex.slice(1, 3), 16) + ',' + parseInt(hex.slice(3, 5), 16) + ',' + parseInt(hex.slice(5, 7), 16) + ',' + a + ')';
  }
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
    c.fillStyle = 'rgba(92,68,82,' + (a == null ? 0.16 : a) + ')';
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

  /* 萌可大眼：外圈描边 + 双高光 */
  function moeEye(c, x, y, r, lookX, lookY, opts) {
    opts = opts || {};
    if (opts.closed) {
      c.strokeStyle = OUT; c.lineWidth = Math.max(1.4, r * .3); c.lineCap = 'round';
      c.beginPath(); c.arc(x, y - r * .2, r * .9, .2, Math.PI - .2); c.stroke();
      return;
    }
    if (opts.dead) {
      c.strokeStyle = '#5c4452'; c.lineWidth = Math.max(1.4, r * .3);
      c.beginPath();
      c.moveTo(x - r * .6, y - r * .6); c.lineTo(x + r * .6, y + r * .6);
      c.moveTo(x + r * .6, y - r * .6); c.lineTo(x - r * .6, y + r * .6);
      c.stroke();
      return;
    }
    circle(c, x, y, r, opts.white || '#fffdfa', OUT, Math.max(1.2, r * .14));
    var px = x + (lookX || 0) * r * .34, py = y + (lookY || 0) * r * .34;
    circle(c, px, py, r * (opts.pupil || .56), opts.iris || '#4b3358', null);
    circle(c, px + r * .16, py + r * .18, r * .4, '#241a2c', null);
    // 双高光
    circle(c, px - r * .2, py - r * .22, r * .21, '#ffffff', null);
    circle(c, px + r * .24, py + r * .2, r * .1, 'rgba(255,255,255,.92)', null);
    if (opts.sparkle) {
      c.fillStyle = '#fff';
      star4(c, x + r * .95, y - r * .75, r * .34, 0);
    }
  }
  function star4(c, x, y, r, rot) {
    c.save(); c.translate(x, y); c.rotate(rot || 0);
    c.beginPath();
    c.moveTo(0, -r); c.quadraticCurveTo(r * .16, -r * .16, r, 0);
    c.quadraticCurveTo(r * .16, r * .16, 0, r);
    c.quadraticCurveTo(-r * .16, r * .16, -r, 0);
    c.quadraticCurveTo(-r * .16, -r * .16, 0, -r);
    c.closePath(); c.fill(); c.restore();
  }
  function blush(c, x, y, rx, ry, a) {
    c.fillStyle = 'rgba(255,138,158,' + (a == null ? .45 : a) + ')';
    c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); c.fill();
  }
  function smile(c, x, y, w, open) {
    c.strokeStyle = OUT; c.lineWidth = 2.2; c.lineCap = 'round';
    c.beginPath();
    if (open) {
      c.fillStyle = '#7a3a4e';
      c.ellipse(x, y, w, w * .85, 0, 0, Math.PI); c.fill();
      c.stroke();
    } else c.arc(x, y, w, .22, Math.PI - .22);
    c.stroke();
  }
  function catMouth(c, x, y, w) {
    c.strokeStyle = OUT; c.lineWidth = 2; c.lineCap = 'round';
    c.beginPath();
    c.arc(x - w * .5, y, w * .5, .1, Math.PI - .1);
    c.arc(x + w * .5, y, w * .5, .1, Math.PI - .1);
    c.stroke();
  }
  function starPop(c, x, y, r, col, a) {
    c.save(); c.globalAlpha = a == null ? 1 : a;
    c.fillStyle = col || '#fff3b0';
    star4(c, x, y, r, Math.PI / 4);
    star4(c, x, y, r * .42, 0);
    c.restore();
  }
  function leaf(c, x, y, len, wid, rot, fill, stroke) {
    c.save(); c.translate(x, y); c.rotate(rot);
    c.beginPath();
    c.moveTo(0, 0);
    c.quadraticCurveTo(len * .5, -wid, len, 0);
    c.quadraticCurveTo(len * .5, wid, 0, 0);
    c.fillStyle = fill; c.fill();
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1.8; c.stroke(); }
    c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(3, 0); c.lineTo(len * .78, 0); c.stroke();
    c.restore();
  }

  /* ---------------- 调色板：萌可奶油糖果 ---------------- */
  var P = {
    stem: '#8fd97b', stemD: '#5fb85c', leaf: '#9ee88a', leafD: '#5fb85c',
    sun: '#ffd86b', sunD: '#efa63f', face: '#b97b4e', faceD: '#8a5326',
    pea: '#9ce56f', peaD: '#5fbf52', ice: '#a9e2ff', iceD: '#5fb3e8',
    nut: '#f3c98c', nutD: '#c9975a', nutDD: '#9c6d38',
    purple: '#c790f0', purpleD: '#8c56c0',
    metal: '#dbe4ee', metalD: '#94a3b4', metalL: '#f4f8fc',
    wood: '#c08a52', woodD: '#8d5f33',
    // 糖果色
    pink: '#ff9fc4', pinkD: '#e2699d', rose: '#ff7fab',
    mint: '#9be8cf', mintD: '#57c2a5',
    lilac: '#c7b2ff', lilacD: '#8f76d8',
    cream: '#fff3e0', creamD: '#efd7bc',
    choco: '#a9714b', chocoD: '#7b4c30',
    sky: '#bfe9ff'
  };

  /* ---------------- 场景背景 ---------------- */
  var SCENES = {
    day: {
      g1: '#a9e084', g2: '#9cd876', gEdge: '#79bd5e', tuft: '#c9f0a6',
      path: '#f3dfc4', pathD: '#ddc3a2', pathL: '#fdf0dc',
      bush: '#6fbf62', bushD: '#57a84e', sky: '#cdefff',
      light: 'rgba(255,246,200,.30)', shade: 'rgba(90,140,70,0)', lr: 640, la: 1,
      wall: '#ffe9d0', wallD: '#f3d0ae', roof: '#ff9db1',
      fence: '#fff6e8', fenceD: '#e6cdb2',
      flower: ['#ffb3cc', '#ffe08a', '#c7b2ff', '#9be8cf']
    },
    noon: {
      g1: '#b8ea92', g2: '#a9e284', gEdge: '#82c263', tuft: '#d8f7b4',
      path: '#f7e5c9', pathD: '#e1c8a6', pathL: '#fff4e1',
      bush: '#79c66a', bushD: '#5cae52', sky: '#d8f3ff',
      light: 'rgba(255,252,214,.40)', shade: 'rgba(255,235,180,.05)', lr: 640, la: 1,
      wall: '#fff0da', wallD: '#f6d8b8', roof: '#ffb0bf',
      fence: '#fff9ee', fenceD: '#ecd5ba',
      flower: ['#ffc2d6', '#ffe9a0', '#d3c2ff', '#a9efda']
    },
    dusk: {
      g1: '#a8ce85', g2: '#9bc279', gEdge: '#7aa35f', tuft: '#c3e29c',
      path: '#efd6bc', pathD: '#d8ba9b', pathL: '#fae8d2',
      bush: '#68ac5e', bushD: '#51924a', sky: '#ffc9a3',
      light: 'rgba(255,178,120,.36)', shade: 'rgba(150,80,70,.10)', lr: 640, la: 1,
      wall: '#f7ddc2', wallD: '#e6c0a0', roof: '#e8889e',
      fence: '#fbe8d2', fenceD: '#dcbfa1',
      flower: ['#ffabbf', '#ffd88a', '#c3a8ff', '#93dfc7']
    },
    night: {
      g1: '#528f6f', g2: '#488364', gEdge: '#356b56', tuft: '#6fbd9a',
      path: '#9fa6ae', pathD: '#7d848d', pathL: '#c2c8d0',
      bush: '#2f6b56', bushD: '#235445', sky: '#2b3560',
      light: 'rgba(190,215,255,.20)', shade: 'rgba(30,40,80,.28)', lr: 640, la: 0,
      wall: '#b3ada6', wallD: '#8f8a83', roof: '#5b4a63',
      fence: '#c4bfb5', fenceD: '#9d978d',
      flower: ['#c8b6ff', '#a9d8ff', '#ffc6dd', '#b6f0d8']
    },
    eclipse: {
      g1: '#3f7d64', g2: '#376f59', gEdge: '#265444', tuft: '#5faa8b',
      path: '#8f949c', pathD: '#70757d', pathL: '#b2b7bf',
      bush: '#2a604d', bushD: '#1f4c3c', sky: '#221c3e',
      light: 'rgba(255,170,150,.16)', shade: 'rgba(20,10,45,.34)', lr: 640, la: 0,
      wall: '#a8a09a', wallD: '#847c77', roof: '#4a3855',
      fence: '#b8b1a6', fenceD: '#938c82',
      flower: ['#e0b3ff', '#ffb3c9', '#9fc6ff', '#a8f0d0']
    },
    candy: {
      g1: '#ffc2da', g2: '#f9aecb', gEdge: '#e88fb4', tuft: '#ffe0ee',
      path: '#ffe9d4', pathD: '#f5cfae', pathL: '#fff6ea',
      bush: '#ffb3cf', bushD: '#f293b6', sky: '#ffe4f2',
      light: 'rgba(255,240,250,.20)', shade: 'rgba(210,120,160,.06)', lr: 420, la: 0,
      wall: '#fff2f7', wallD: '#ffd6e6', roof: '#ff8fb2',
      fence: '#fffaf5', fenceD: '#f7cede',
      flower: ['#ff9ec4', '#ffe08a', '#c7b2ff', '#9be8cf'],
      candy: true
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
    var rd = seeded(scene === 'night' ? 31 : scene === 'eclipse' ? 51 : scene === 'dusk' ? 17 : scene === 'candy' ? 99 : 7);
    var lawnW = COLS * CW, lawnH = ROWS * CH;

    // 底部全幅草地
    b.fillStyle = pal.gEdge; b.fillRect(0, 0, W, H);

    // ---- 棋盘草坪（圆角色块，留出奶油缝隙） ----
    var darkScene = (scene === 'night' || scene === 'eclipse');
    var tileHi = darkScene ? .16 : .34;
    for (var r = 0; r < ROWS; r++) {
      for (var col = 0; col < COLS; col++) {
        var x = GX + col * CW, y = GY + r * CH;
        var even = (r + col) % 2;
        // 地砖投影
        fillRR(b, x + 4, y + 6, CW - 6, CH - 6, 17, 'rgba(60,110,50,.10)', null);
        fillRR(b, x + 3, y + 3, CW - 6, CH - 6, 17, even ? pal.g1 : pal.g2, null);
        // 顶部高光 + 底部暗边
        var g = b.createLinearGradient(x, y, x, y + CH);
        g.addColorStop(0, 'rgba(255,255,255,' + tileHi + ')');
        g.addColorStop(.26, 'rgba(255,255,255,' + (darkScene ? .05 : .10) + ')');
        g.addColorStop(.72, 'rgba(255,255,255,0)');
        g.addColorStop(1, 'rgba(70,120,55,.11)');
        rr(b, x + 3, y + 3, CW - 6, CH - 6, 17);
        b.fillStyle = g; b.fill();
        // 圆角描边（让格子边界清晰）
        rr(b, x + 3.6, y + 3.6, CW - 7.2, CH - 7.2, 16);
        b.strokeStyle = 'rgba(255,255,255,' + (darkScene ? .18 : .34) + ')'; b.lineWidth = 1.2; b.stroke();
        rr(b, x + 2.4, y + 2.4, CW - 4.8, CH - 4.8, 17);
        b.strokeStyle = 'rgba(70,125,55,.16)'; b.lineWidth = 1.6; b.stroke();
        // 表面光泽
        b.save(); rr(b, x + 3, y + 3, CW - 6, CH - 6, 17); b.clip();
        var gl = b.createRadialGradient(x + CW * .34, y + CH * .26, 2, x + CW * .34, y + CH * .26, CW * .48);
        gl.addColorStop(0, 'rgba(255,255,255,' + (darkScene ? .10 : .20) + ')'); gl.addColorStop(1, 'rgba(255,255,255,0)');
        b.fillStyle = gl; b.fillRect(x, y, CW, CH);
        b.restore();
      }
    }
    // 草叶点点
    for (var i = 0; i < 900; i++) {
      var gx = GX + rd() * lawnW, gy = GY + rd() * lawnH;
      b.strokeStyle = rd() > .5 ? 'rgba(255,255,255,' + (darkScene ? .24 : .42) + ')' : 'rgba(70,130,60,' + (darkScene ? .12 : .20) + ')';
      b.lineWidth = 1.15;
      b.beginPath(); b.moveTo(gx, gy); b.lineTo(gx + (rd() - .5) * 3.4, gy - 3.4 - rd() * 3.6); b.stroke();
    }
    // 三叶草小簇
    for (var cl = 0; cl < 26; cl++) {
      var clx = GX + 18 + rd() * (lawnW - 36), cly = GY + 16 + rd() * (lawnH - 26);
      b.fillStyle = 'rgba(255,255,255,.28)';
      for (var cl2 = 0; cl2 < 3; cl2++) {
        var ca = cl2 / 3 * TAU + rd();
        b.beginPath(); b.ellipse(clx + Math.cos(ca) * 2.6, cly + Math.sin(ca) * 2.2, 2.6, 1.7, ca, 0, TAU); b.fill();
      }
    }
    // 小野花
    for (var f = 0; f < 70; f++) {
      var fx = GX + 20 + rd() * (lawnW - 40), fy = GY + 16 + rd() * (lawnH - 30);
      var fc = pal.flower[Math.floor(rd() * pal.flower.length)];
      var fsc = .8 + rd() * .55;
      b.save(); b.translate(fx, fy); b.scale(fsc, fsc);
      b.fillStyle = 'rgba(70,120,50,.12)';
      b.beginPath(); b.ellipse(0, 2, 4.4, 1.8, 0, 0, TAU); b.fill();
      b.fillStyle = fc;
      for (var pt = 0; pt < 5; pt++) {
        var pa = pt / 5 * TAU;
        b.beginPath(); b.arc(Math.cos(pa) * 3, Math.sin(pa) * 3, 2.5, 0, TAU); b.fill();
      }
      b.fillStyle = 'rgba(255,250,210,.98)';
      b.beginPath(); b.arc(0, 0, 1.8, 0, TAU); b.fill();
      b.restore();
    }

    // ---- 左侧糖果小路 ----
    var pg = b.createLinearGradient(0, 0, GX, 0);
    pg.addColorStop(0, pal.pathD); pg.addColorStop(.5, pal.path); pg.addColorStop(1, pal.pathL);
    b.fillStyle = pg; b.fillRect(0, GY - 12, GX, lawnH + 24);
    // 圆卵石
    for (var sr = 0; sr < ROWS; sr++) {
      var rowY = GY + sr * CH;
      for (var sc = 0; sc < 2; sc++) {
        var oy = rowY + 14 + sc * 42 + (sr % 2) * 10;
        var ox = 34 + (sc % 2) * 58;
        b.fillStyle = 'rgba(255,255,255,.30)';
        b.beginPath(); b.ellipse(ox, oy, 26, 15, rd() * .3, 0, TAU); b.fill();
        b.fillStyle = 'rgba(140,110,90,.10)';
        b.beginPath(); b.ellipse(ox, oy + 4, 22, 11, 0, 0, TAU); b.fill();
      }
    }
    if (pal.candy) {
      // 糖霜条纹小路
      for (var st2 = 0; st2 < 4; st2++) {
        b.save();
        b.beginPath(); b.rect(0, GY - 12 + st2 * (lawnH / 4), GX, lawnH / 4); b.clip();
        for (var sd = -2; sd < 8; sd++) {
          b.fillStyle = st2 % 2 ? 'rgba(255,255,255,.22)' : 'rgba(255,190,215,.24)';
          b.beginPath();
          b.moveTo(sd * 34, GY - 12 + st2 * (lawnH / 4));
          b.lineTo(sd * 34 + 17, GY - 12 + st2 * (lawnH / 4));
          b.lineTo(sd * 34 + 17 + 30, GY - 12 + (st2 + 1) * (lawnH / 4));
          b.lineTo(sd * 34 + 30, GY - 12 + (st2 + 1) * (lawnH / 4));
          b.closePath(); b.fill();
        }
        b.restore();
      }
    }
    b.fillStyle = 'rgba(255,255,255,.5)'; b.fillRect(GX - 5, GY - 12, 3, lawnH + 24);
    b.fillStyle = 'rgba(110,150,80,.28)'; b.fillRect(GX - 3, GY - 12, 3, lawnH + 24);

    // ---- 右下角的糖霜小屋（画在高草带里，做远景） ----
    b.save();
    b.translate(GX + lawnW + 52, GY + lawnH - 6);
    b.scale(.78, .78);
    b.fillStyle = 'rgba(90,60,80,.16)';
    b.beginPath(); b.ellipse(0, 2, 62, 9, 0, 0, TAU); b.fill();
    // 墙体
    fillRR(b, -46, -66, 92, 68, 14, pal.wall, null);
    var wg = b.createLinearGradient(0, -66, 0, 0);
    wg.addColorStop(0, 'rgba(255,255,255,.60)'); wg.addColorStop(.7, 'rgba(255,255,255,.06)'); wg.addColorStop(1, 'rgba(150,90,120,.14)');
    rr(b, -46, -66, 92, 68, 14); b.fillStyle = wg; b.fill();
    // 屋顶
    var rg2 = b.createLinearGradient(0, -96, 0, -58);
    rg2.addColorStop(0, mix(pal.roof, '#ffffff', .38)); rg2.addColorStop(1, pal.roof);
    b.fillStyle = rg2;
    b.beginPath();
    b.moveTo(-58, -64); b.quadraticCurveTo(0, -104, 58, -64);
    b.lineTo(50, -50); b.quadraticCurveTo(0, -86, -50, -50);
    b.closePath(); b.fill();
    b.strokeStyle = 'rgba(120,60,90,.24)'; b.lineWidth = 1.6; b.stroke();
    // 糖霜滴落
    b.fillStyle = 'rgba(255,255,255,.80)';
    for (var dr = 0; dr < 8; dr++) {
      var drx = -52 + dr * 13.5, drh = 5 + ((dr * 7) % 9);
      b.beginPath(); b.moveTo(drx, -64); b.quadraticCurveTo(drx + 5, -64 + drh, drx + 10, -64); b.closePath(); b.fill();
    }
    b.fillStyle = 'rgba(255,255,255,.34)';
    b.beginPath(); b.ellipse(0, -80, 26, 6, -.06, 0, TAU); b.fill();
    // 阁楼圆窗
    circle(b, 0, -78, 10.5, '#bfe9ff', '#fffdf8', 3);
    b.fillStyle = 'rgba(255,255,255,.55)';
    b.beginPath(); b.arc(-3.5, -81.5, 3.4, 0, TAU); b.fill();
    // 大门窗
    circle(b, -12, -36, 18.5, '#cdeeff', '#fffdf8', 3.2);
    b.fillStyle = 'rgba(255,170,200,.5)';
    b.beginPath(); b.moveTo(-28.5, -50); b.quadraticCurveTo(-19, -36, -28.5, -22); b.closePath(); b.fill();
    b.beginPath(); b.moveTo(4.5, -50); b.quadraticCurveTo(-5, -36, 4.5, -22); b.closePath(); b.fill();
    line(b, -12, -54, -12, -18, 2.2, '#fffdf8');
    line(b, -30.5, -36, 6.5, -36, 2.2, '#fffdf8');
    // 门
    fillRR(b, 18, -36, 26, 36, 11, '#ffd0e0', '#e9a3bd', 2.4);
    fillRR(b, 22.5, -31, 17, 15, 6, 'rgba(255,255,255,.45)', null);
    circle(b, 39, -16.5, 2.4, '#fffdf8', null);
    // 门口小花盆
    fillRR(b, 8, -13, 13, 12, 4, '#f7b98a', '#d99a6c', 1.6);
    circle(b, 14.5, -17, 5.6, '#9be8cf', '#57c2a5', 1.4);
    circle(b, 12, -20, 4.2, '#ff9fc4', '#e2699d', 1.2);
    b.restore();
    // ---- 顶部圆头栅栏 ----
    var fenceY = GY - 4;
    b.fillStyle = 'rgba(120,90,80,.10)'; b.fillRect(0, fenceY + 4, W, 5);
    for (var fx2 = 0; fx2 < W; fx2 += 22) {
      b.fillStyle = pal.fence;
      fillRR(b, fx2 + 3, fenceY - 30, 13, 34, 6, pal.fence, pal.fenceD, 1.2);
      b.fillStyle = 'rgba(255,255,255,.55)';
      b.beginPath(); b.arc(fx2 + 9.5, fenceY - 30, 3.4, 0, TAU); b.fill();
    }
    b.fillStyle = pal.fenceD; b.fillRect(0, fenceY - 20, W, 3);
    b.fillStyle = 'rgba(255,255,255,.4)'; b.fillRect(0, fenceY - 20, W, 1);

    // ---- 底部蓬蓬灌木 ----
    var bt = GY + lawnH;
    b.fillStyle = pal.bushD; b.fillRect(0, bt + 4, W, H - bt);
    for (var bx = -16; bx < W + 30; bx += 30) {
      b.fillStyle = (Math.floor(bx / 30) % 2) ? pal.bush : pal.bushD;
      b.beginPath(); b.arc(bx + 15, bt + 16, 19 + ((Math.floor(bx / 30)) % 3) * 2, Math.PI, 0); b.fill();
      b.fillRect(bx - 6, bt + 14, 40, H - bt);
    }
    for (var bx2 = -6; bx2 < W + 20; bx2 += 30) {
      b.fillStyle = 'rgba(255,255,255,.18)';
      b.beginPath(); b.arc(bx2 + 15, bt + 13, 10, Math.PI * 1.05, Math.PI * 1.85); b.fill();
    }
    // 灌木小果子
    for (var bb = 0; bb < 26; bb++) {
      var bxx = rd() * W, byy = bt + 8 + rd() * 18;
      circle(b, bxx, byy, 2.2, pal.flower[Math.floor(rd() * pal.flower.length)], null);
    }

    // ---- 右侧草丛 ----
    var rx = GX + lawnW;
    var rgd = b.createLinearGradient(rx, 0, W, 0);
    rgd.addColorStop(0, 'rgba(80,150,80,.26)');
    rgd.addColorStop(.5, 'rgba(120,190,110,.10)');
    rgd.addColorStop(1, 'rgba(80,150,80,.28)');
    b.fillStyle = rgd; b.fillRect(rx, GY, W - rx, lawnH);
    for (var gr = 0; gr < 200; gr++) {
      var gx2 = rx + rd() * (W - rx), gy2 = GY + rd() * lawnH;
      b.strokeStyle = 'rgba(70,140,80,' + (0.10 + rd() * .14) + ')'; b.lineWidth = 1.2;
      b.beginPath(); b.moveTo(gx2, gy2); b.lineTo(gx2 + (rd() - .5) * 6, gy2 - 6 - rd() * 8); b.stroke();
    }
    b.fillStyle = 'rgba(90,150,90,.20)'; b.fillRect(rx - 3, GY, 4, lawnH);

    // 糖果场景：粉色糖霜花边
    if (pal.candy) {
      for (var cw2 = 0; cw2 < 22; cw2++) {
        var cx3 = GX + cw2 * 49;
        b.fillStyle = 'rgba(255,255,255,.55)';
        b.beginPath(); b.arc(cx3, GY + 2, 9, 0, TAU); b.fill();
        b.beginPath(); b.arc(cx3 + 24, GY + 2, 6, 0, TAU); b.fill();
      }
      // 漂浮糖粒
      for (var cn = 0; cn < 26; cn++) {
        var cnx = GX + rd() * lawnW, cny = GY + rd() * lawnH;
        b.save(); b.translate(cnx, cny); b.rotate(rd() * TAU);
        b.fillStyle = rd() > .5 ? 'rgba(255,255,255,.55)' : 'rgba(255,170,205,.45)';
        b.fillRect(-3, -1.4, 6, 2.8);
        b.restore();
      }
    }

    // 夜晚 / 日蚀：额外的冷色压暗，避免草地发灰
    if (scene === 'night' || scene === 'eclipse') {
      b.save();
      b.globalCompositeOperation = 'multiply';
      b.fillStyle = scene === 'eclipse' ? 'rgba(170,150,200,.42)' : 'rgba(180,200,220,.30)';
      b.fillRect(0, GY - 12, W, lawnH + 24);
      b.restore();
      var ng2 = b.createRadialGradient(GX + lawnW * .78, GY + 40, 30, GX + lawnW * .78, GY + 40, lawnW * .55);
      ng2.addColorStop(0, scene === 'eclipse' ? 'rgba(255,180,190,.12)' : 'rgba(205,225,255,.11)');
      ng2.addColorStop(1, 'rgba(205,225,255,0)');
      b.fillStyle = ng2; b.fillRect(0, GY - 12, W, lawnH + 24);
    }

    // ---- 暗角 & 光照 ----
    var vg = b.createRadialGradient(W * .45, H * .46, H * .34, W * .5, H * .5, H * .98);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, scene === 'candy' ? 'rgba(150,80,120,.20)' : 'rgba(90,60,90,.18)');
    b.fillStyle = vg; b.fillRect(0, 0, W, H);

    if (scene === 'candy') {
      // 糖果花园：柔和的粉白侧光，避免整片过曝
      var cl = b.createRadialGradient(W * .82, -60, 30, W * .8, 150, pal.lr);
      cl.addColorStop(0, pal.light); cl.addColorStop(1, 'rgba(255,235,250,0)');
      b.fillStyle = cl; b.fillRect(0, 0, W, H);
      // 淡淡的薄荷反光，给粉色压一层层次
      var cm = b.createRadialGradient(GX + lawnW * .3, GY + lawnH * .8, 20, GX + lawnW * .3, GY + lawnH * .8, 460);
      cm.addColorStop(0, 'rgba(180,245,225,.10)'); cm.addColorStop(1, 'rgba(180,245,225,0)');
      b.fillStyle = cm; b.fillRect(0, GY, W, lawnH);
    } else if (scene === 'day' || scene === 'noon') {
      var lg = b.createRadialGradient(W * .8, -70, 40, W * .76, 130, pal.lr);
      lg.addColorStop(0, pal.light); lg.addColorStop(1, 'rgba(255,245,190,0)');
      b.fillStyle = lg; b.fillRect(0, 0, W, H);
    } else if (scene === 'dusk') {
      var lg2 = b.createLinearGradient(0, GY, 0, H);
      lg2.addColorStop(0, 'rgba(255,170,120,.06)'); lg2.addColorStop(1, 'rgba(150,70,110,.22)');
      b.fillStyle = lg2; b.fillRect(0, GY - 10, W, H - GY + 10);
      var sg2 = b.createRadialGradient(W * .86, GY + 40, 10, W * .86, GY + 40, 330);
      sg2.addColorStop(0, 'rgba(255,225,160,.55)'); sg2.addColorStop(1, 'rgba(255,160,120,0)');
      b.fillStyle = sg2; b.fillRect(0, 0, W, H);
    } else {
      var ng = b.createLinearGradient(0, GY, 0, H);
      ng.addColorStop(0, 'rgba(40,55,95,.14)'); ng.addColorStop(1, 'rgba(28,40,74,.22)');
      b.fillStyle = ng; b.fillRect(0, GY - 10, W, H - GY + 10);
      var mg = b.createRadialGradient(W * .84, 66, 8, W * .84, 66, 300);
      mg.addColorStop(0, 'rgba(220,225,255,.42)'); mg.addColorStop(1, 'rgba(180,195,255,0)');
      b.fillStyle = mg; b.fillRect(0, 0, W, H);
      if (scene === 'eclipse') {
        var eg2 = b.createRadialGradient(W * .84, 66, 26, W * .84, 66, 120);
        eg2.addColorStop(0, 'rgba(255,150,170,.32)'); eg2.addColorStop(1, 'rgba(255,110,150,0)');
        b.fillStyle = eg2; b.fillRect(0, 0, W, H);
      }
    }
    return cv;
  };

  /* 每帧环境装饰 */
  A.drawSky = function (c, scene, t) {
    if (scene === 'day' || scene === 'noon' || scene === 'candy') {
      // 软云影
      c.save();
      for (var i = 0; i < 3; i++) {
        var cx = ((t * (7 + i * 3) + i * 420) % (W + 520)) - 260;
        var cy = 148 + i * 74;
        c.globalAlpha = scene === 'candy' ? .13 : .10;
        c.fillStyle = '#ffffff';
        c.beginPath();
        c.ellipse(cx, cy, 128, 25, 0, 0, TAU);
        c.ellipse(cx + 62, cy - 13, 74, 19, 0, 0, TAU);
        c.ellipse(cx - 56, cy - 6, 58, 16, 0, 0, TAU);
        c.fill();
      }
      c.restore();
      // 阳光光柱
      c.save(); c.globalAlpha = scene === 'candy' ? .07 : .06; c.fillStyle = '#fff8d6';
      var bx = W * .78;
      c.beginPath(); c.moveTo(bx - 42, GY); c.lineTo(bx + 12, GY); c.lineTo(bx - 130, H); c.lineTo(bx - 300, H); c.closePath(); c.fill();
      c.restore();
      // 飘落的花瓣 / 糖屑
      var petalCol = scene === 'candy' ? ['#ffb3cf', '#fff0b8', '#ffffff', '#ffd1e3'] : ['#ffd9e2', '#fff3c0', '#ffffff'];
      for (var p = 0; p < 12; p++) {
        var px = GX + ((p * 173 + t * (12 + p % 4)) % (COLS * CW));
        var py = GY + ((p * 97 + t * (16 + p % 3)) % (ROWS * CH));
        c.save(); c.globalAlpha = .5 + .3 * Math.sin(t * 1.4 + p);
        c.translate(px, py); c.rotate(t * .8 + p);
        c.fillStyle = petalCol[p % petalCol.length];
        c.beginPath(); c.ellipse(0, 0, 3.4, 2.1, 0, 0, TAU); c.fill();
        c.restore();
      }
    } else if (scene === 'night' || scene === 'eclipse') {
      for (var j = 0; j < 26; j++) {
        var fx = GX + ((j * 137.3 + Math.sin(t * .7 + j) * 26) % (COLS * CW));
        var fy = GY + 60 + ((j * 83.7 + Math.cos(t * .5 + j * 2) * 20) % (ROWS * CH - 90));
        var a = 0.3 + 0.55 * (0.5 + 0.5 * Math.sin(t * 2.2 + j * 1.7));
        var g = c.createRadialGradient(fx, fy, 0, fx, fy, 10);
        g.addColorStop(0, 'rgba(255,246,180,' + a * .8 + ')'); g.addColorStop(1, 'rgba(255,240,160,0)');
        c.fillStyle = g; c.beginPath(); c.arc(fx, fy, 10, 0, TAU); c.fill();
        c.fillStyle = 'rgba(255,250,220,' + a + ')';
        c.beginPath(); c.arc(fx, fy, 1.7, 0, TAU); c.fill();
      }
      // 月亮
      c.save(); c.globalAlpha = .55;
      circle(c, W * .86, 54, 26, '#fff6cf', null);
      circle(c, W * .89, 47, 22, null, null);
      c.globalAlpha = .22; circle(c, W * .9, 46, 18, '#2b3560', null);
      c.restore();
    } else if (scene === 'dusk') {
      for (var k = 0; k < 12; k++) {
        var mx = GX + ((k * 211 + t * 14) % (COLS * CW));
        var my = GY + 80 + ((k * 97) % (ROWS * CH - 120));
        c.fillStyle = 'rgba(255,220,170,.20)';
        c.beginPath(); c.arc(mx, my, 2.4, 0, TAU); c.fill();
      }
    }
  };

  /* ---------------- 墓碑（萌可版：圆头小碑 + 蝴蝶结） ---------------- */
  A.drawGrave = function (c, x, y, t, broken) {
    if (broken) {
      ell(c, x, y - 3, 22, 9, 'rgba(120,100,110,.20)');
      return;
    }
    shadow(c, x, y + 2, 24, 8, .18);
    c.save(); c.translate(x, y);
    var sway = Math.sin(t * 1.2) * .02;
    c.rotate(sway);
    fillRR(c, -21, -44, 42, 46, 18, '#d9d2e4', '#9a92ad', 2.4);
    fillRR(c, -14, -36, 28, 32, 12, 'rgba(255,255,255,.35)', null);
    // 小爱心刻痕（萌可版：不用十字）
    c.save(); c.globalAlpha = .45; c.translate(0, -24); c.scale(1, 1);
    c.fillStyle = '#8c82a5';
    c.beginPath();
    c.moveTo(0, 4); c.bezierCurveTo(-7, -2, -6, -8, 0, -5); c.bezierCurveTo(6, -8, 7, -2, 0, 4);
    c.closePath(); c.fill();
    c.restore();
    // 蝴蝶结
    c.fillStyle = '#ff9fc4';
    c.beginPath(); c.moveTo(0, -44); c.quadraticCurveTo(-13, -54, -4, -44); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(0, -44); c.quadraticCurveTo(13, -54, 4, -44); c.closePath(); c.fill();
    circle(c, 0, -44, 3, '#ff7fab', null);
    c.restore();
    // 幽光
    c.save(); c.globalAlpha = .16 + .08 * Math.sin(t * 2);
    var g = c.createRadialGradient(x, y - 26, 2, x, y - 26, 40);
    g.addColorStop(0, 'rgba(200,170,255,.9)'); g.addColorStop(1, 'rgba(160,120,255,0)');
    c.fillStyle = g; c.beginPath(); c.arc(x, y - 26, 40, 0, TAU); c.fill();
    c.restore();
  };

  /* ---------------- 植物 ---------------- */
  function stem(c, h, sway, col, colD) {
    c.save(); c.rotate(sway * .35);
    c.strokeStyle = colD; c.lineWidth = 10; c.lineCap = 'round';
    c.beginPath(); c.moveTo(0, -2); c.quadraticCurveTo(-4, -h * .55, 0, -h); c.stroke();
    c.strokeStyle = col; c.lineWidth = 6.5;
    c.beginPath(); c.moveTo(0, -2); c.quadraticCurveTo(-4, -h * .55, 0, -h); c.stroke();
    c.restore();
  }
  function pairLeaves(c, y1, y2, tint) {
    leaf(c, -4, y1, 28, 10, Math.PI + .42, tint || P.leaf, P.leafD);
    leaf(c, 4, y2, 28, 10, -.42, tint || P.leaf, P.leafD);
  }

  var DRAW = {};

  DRAW.sunflower = function (c, v) {
    var t = v.t, sway = Math.sin(t * 2.1) * .06, gl = v.glow || 0;
    shadow(c, 0, 1, 26, 8);
    stem(c, 40, sway, P.stem, P.stemD);
    pairLeaves(c, -14, -22);
    c.save(); c.translate(0, -60); c.rotate(sway * 1.4);
    var sc = 1 + gl * .1 + Math.sin(t * 3) * .014;
    c.scale(sc, sc);
    if (gl > 0) {
      var g = gradR(c, 0, 0, 8, 55, [[0, 'rgba(255,248,180,' + (.8 * gl) + ')'], [1, 'rgba(255,230,120,0)']]);
      c.fillStyle = g; c.beginPath(); c.arc(0, 0, 55, 0, TAU); c.fill();
    }
    // 花瓣：两层圆润花瓣
    for (var layer = 0; layer < 2; layer++) {
      var n = layer ? 8 : 12, rad = layer ? 15 : 20;
      for (var i = 0; i < n; i++) {
        var a = i / n * TAU + t * .2 + layer * .26;
        c.save(); c.translate(Math.cos(a) * rad, Math.sin(a) * rad); c.rotate(a);
        ellS(c, 0, 0, layer ? 11 : 9.5, layer ? 7.5 : 6, gl > .35 ? '#fff0a0' : (layer ? '#ffc94f' : P.sun), P.sunD, 0, 1.6);
        c.restore();
      }
    }
    // 花盘
    var fg = gradR(c, -4, -4, 2, 18, [[0, '#d29a63'], [1, '#a8703c']]);
    circle(c, 0, 0, 16, fg, OUT, 2.4);
    for (var d = 0; d < 9; d++) {
      var da = d / 9 * TAU;
      circle(c, Math.cos(da) * 9.5, Math.sin(da) * 9.5, 1.2, 'rgba(255,235,190,.45)', null);
    }
    moeEye(c, -6, -3.5, 5.2, 0, 0, { sparkle: true });
    moeEye(c, 6, -3.5, 5.2, 0, 0);
    blush(c, -11, 5, 4, 2.6, .5);
    blush(c, 11, 5, 4, 2.6, .5);
    catMouth(c, 0, 4, 7);
    c.restore();
  };

  function peaHead(c, t, ice, sway, opt) {
    opt = opt || {};
    var col = opt.col || (ice ? P.ice : P.pea), colD = opt.colD || (ice ? P.iceD : P.peaD);
    c.save(); c.rotate(sway * .4);
    // 叶冠
    for (var i = 0; i < 3; i++) {
      c.save(); c.rotate(-2.1 + i * .36);
      ellS(c, 0, -18, 5, 12.5, colD, null, 0, 0);
      c.restore();
    }
    if (ice) {
      c.fillStyle = '#f0fbff';
      for (var k = 0; k < 3; k++) {
        c.save(); c.rotate(-2.1 + k * .36);
        c.beginPath(); c.moveTo(-3.4, -26); c.lineTo(0, -35); c.lineTo(3.4, -26); c.closePath(); c.fill();
        c.restore();
      }
    }
    if (opt.crown) {
      // 星星灯：小皇冠
      c.fillStyle = '#ffe066'; c.strokeStyle = '#e0a010'; c.lineWidth = 1.4;
      c.beginPath();
      c.moveTo(-11, -20); c.lineTo(-11, -30); c.lineTo(-5.5, -25); c.lineTo(0, -34);
      c.lineTo(5.5, -25); c.lineTo(11, -30); c.lineTo(11, -20); c.closePath();
      c.fill(); c.stroke();
      circle(c, 0, -21, 2.2, '#ff9fc4', null);
    }
    var hg = gradR(c, -6, -8, 3, 20, [[0, mix(col, '#ffffff', .45)], [1, col]]);
    circle(c, 0, 0, 18, hg, colD, 2.4);
    // 炮口（萌可版：圆喇叭）
    fillRR(c, 8, -8, 24, 17, 8, opt.col || (ice ? '#cdefff' : col), colD, 2.2);
    circle(c, 31, .5, 7.4, opt.col || '#7fc95e', colD, 2);
    circle(c, 31, .5, 4.4, '#3f6b34', null);
    if (opt.multi) {
      fillRR(c, 6, 10, 20, 12, 6, col, colD, 2);
      fillRR(c, 6, -26, 20, 12, 6, col, colD, 2);
    }
    // 高光
    c.fillStyle = 'rgba(255,255,255,.6)';
    c.beginPath(); c.ellipse(-6.5, -8.5, 5.6, 3.2, -.5, 0, TAU); c.fill();
    moeEye(c, 2.5, -5.5, 4.6, 1.4, .2, { sparkle: true });
    blush(c, 8, 6, 4, 2.4, .45);
    catMouth(c, 3, 6, 6);
    if (ice && Math.sin(t * 2) > .3) {
      star4(c, 36 + Math.sin(t * 6) * 2, -5, 2.4, t);
      c.fillStyle = 'rgba(255,255,255,.9)';
      circle(c, 40, 4, 1.2, 'rgba(255,255,255,.9)', null);
    }
    if (opt.star) {
      c.fillStyle = '#fff6c0';
      for (var s = 0; s < 3; s++) {
        var sa = t * 2 + s * 2.1;
        star4(c, Math.cos(sa) * 22, -12 + Math.sin(sa) * 8, 2.6, sa);
      }
    }
    c.restore();
  }

  DRAW.peashooter = function (c, v) {
    var t = v.t, sway = Math.sin(t * 2.3) * .07;
    shadow(c, 0, 1, 25, 8);
    stem(c, 34, sway, P.stem, P.stemD);
    pairLeaves(c, -11, -18);
    var rec = v.shoot > 0 ? -5 * Math.min(1, v.shoot / .16) : 0;
    c.save(); c.translate(rec, -52); peaHead(c, t, false, sway); c.restore();
  };

  DRAW.snowpea = function (c, v) {
    var t = v.t, sway = Math.sin(t * 2.1) * .07;
    shadow(c, 0, 1, 25, 8);
    stem(c, 34, sway, '#8fd9c4', '#5fb8a8');
    leaf(c, -4, -11, 26, 9, Math.PI + .42, '#a8efd8', '#5fb8a8');
    leaf(c, 4, -18, 26, 9, -.42, '#a8efd8', '#5fb8a8');
    var rec = v.shoot > 0 ? -5 * Math.min(1, v.shoot / .16) : 0;
    c.save(); c.translate(rec, -52); peaHead(c, t, true, sway); c.restore();
    // 霜圈
    c.fillStyle = 'rgba(220,245,255,.40)';
    c.beginPath(); c.ellipse(0, 0, 24, 6, 0, 0, TAU); c.fill();
  };

  DRAW.repeater = function (c, v) {
    var t = v.t, sway = Math.sin(t * 2.3) * .07;
    shadow(c, 0, 1, 26, 8);
    stem(c, 34, sway, P.stem, P.stemD);
    pairLeaves(c, -11, -18);
    var rec = v.shoot > 0 ? -6 * Math.min(1, v.shoot / .16) : 0;
    c.save(); c.translate(rec, -54);
    peaHead(c, t, false, sway, { col: '#a8e86f', colD: '#5fbf52', multi: true });
    c.restore();
  };

  DRAW.threepeater = function (c, v) {
    var t = v.t, sway = Math.sin(t * 2.0) * .07;
    shadow(c, 0, 1, 28, 9);
    stem(c, 40, sway, P.stem, P.stemD);
    pairLeaves(c, -12, -20);
    var rec = v.shoot > 0 ? -5 * Math.min(1, v.shoot / .16) : 0;
    c.save(); c.translate(rec, -58);
    peaHead(c, t, false, sway, { col: '#b7e86f', colD: '#6fbf52', multi: true, crown: true });
    c.restore();
  };

  /* 坚果：圆胖果仁，戴小帽 */
  function nutBody(c, v, tall) {
    var t = v.t, hurt = v.hurt > 0 ? Math.sin(t * 60) * 1.6 : 0;
    var h = tall ? 92 : 66, w = tall ? 33 : 34;
    c.save(); c.translate(hurt, 0);
    shadow(c, 0, 1, w + 4, 9);
    var g = gradR(c, -w * .35, -h * .72, 4, h * .92, [[0, '#fde3b6'], [.55, P.nut], [1, P.nutD]]);
    c.beginPath();
    c.moveTo(-w * .86, -4);
    c.bezierCurveTo(-w * 1.16, -h * .6, -w * .7, -h - 4, 0, -h - 2);
    c.bezierCurveTo(w * .7, -h - 4, w * 1.16, -h * .6, w * .86, -4);
    c.quadraticCurveTo(0, 6, -w * .86, -4);
    c.closePath();
    c.fillStyle = g; c.fill();
    c.strokeStyle = OUT; c.lineWidth = 2.6; c.stroke();
    // 果壳裂纹
    c.strokeStyle = 'rgba(160,110,60,.28)'; c.lineWidth = 1.4; c.lineCap = 'round';
    c.beginPath();
    c.moveTo(-w * .45, -h * .36); c.quadraticCurveTo(-w * .2, -h * .46, -w * .05, -h * .3);
    c.moveTo(w * .3, -h * .62); c.quadraticCurveTo(w * .5, -h * .52, w * .42, -h * .36);
    c.stroke();
    // 脸
    moeEye(c, -w * .34, -h * .56, h * .115, 0, 0, { sparkle: true });
    moeEye(c, w * .3, -h * .56, h * .12, 0, 0);
    blush(c, -w * .62, -h * .44, 5, 3, .5);
    blush(c, w * .6, -h * .44, 5, 3, .5);
    catMouth(c, 0, -h * .42, h * .1);
    // 小帽 / 叶子
    if (tall) {
      fillRR(c, -w * .5, -h - 12, w, 9, 4, '#8fd97b', '#5fb85c', 2);
      leaf(c, -2, -h - 12, 20, 7, -1.0, '#9ee88a', '#5fb85c');
    } else {
      leaf(c, -2, -h - 1, 19, 7, -1.15, '#9ee88a', '#5fb85c');
      leaf(c, 1, -h - 1, 17, 6, -.6, '#8fd97b', '#5fb85c');
    }
    // 生命裂纹
    if (v.hp < v.max * .66) {
      c.strokeStyle = 'rgba(120,80,50,.5)'; c.lineWidth = 1.6;
      c.beginPath(); c.moveTo(w * .1, -h * .86); c.lineTo(-w * .06, -h * .7); c.lineTo(w * .05, -h * .58); c.stroke();
    }
    if (v.hp < v.max * .33) {
      c.beginPath(); c.moveTo(-w * .55, -h * .5); c.lineTo(-w * .38, -h * .38); c.lineTo(-w * .5, -h * .26); c.stroke();
    }
    c.restore();
  }
  DRAW.wallnut = function (c, v) { nutBody(c, v, false); };
  DRAW.tallnut = function (c, v) { nutBody(c, v, true); };

  DRAW.potato = function (c, v) {
    var t = v.t;
    shadow(c, 0, 1, 26, 8);
    // 土包
    var tg = gradR(c, 0, -6, 2, 30, [[0, '#c79a6b'], [1, '#8d6238']]);
    c.beginPath(); c.ellipse(0, 0, 30, 13, 0, Math.PI, 0); c.fillStyle = tg; c.fill();
    c.strokeStyle = '#6f4a28'; c.lineWidth = 2; c.stroke();
    if (!v.armed) {
      // 埋着：露出芽和倒计时环
      leaf(c, 0, -10, 15, 5, -1.5, '#8fd97b', '#5fb85c');
      c.save(); c.globalAlpha = .55;
      c.strokeStyle = '#ffe08a'; c.lineWidth = 4; c.lineCap = 'round';
      c.beginPath(); c.arc(0, -4, 20, -Math.PI / 2, -Math.PI / 2 + TAU * clamp01(1 - (v.timer || 0) / 10)); c.stroke();
      c.restore();
      return;
    }
    var rise = v.rise || 0;
    c.save(); c.translate(0, 8 - rise * 14);
    var pg = gradR(c, -6, -12, 3, 24, [[0, '#e8c088'], [1, '#c08a4e']]);
    ellS(c, 0, -10, 23, 18, pg, OUT, 2.4);
    // 眼睛
    moeEye(c, -8, -13, 5.2, 0, -1, { sparkle: true });
    moeEye(c, 7, -13, 5.2, 0, -1);
    blush(c, -15, -5, 4, 2.4, .5);
    blush(c, 15, -5, 4, 2.4, .5);
    // 引信
    c.strokeStyle = '#7b4c30'; c.lineWidth = 2.2; c.lineCap = 'round';
    c.beginPath(); c.moveTo(4, -24); c.quadraticCurveTo(12, -34, 6, -40); c.stroke();
    var fl = 1 + Math.sin(t * 12) * .25;
    starPop(c, 6, -42, 5 * fl, '#ffdf6b', 1);
    starPop(c, 6, -42, 2.4 * fl, '#fff8c8', 1);
    c.restore();
  };

  DRAW.cherry = function (c, v) {
    var t = v.t, k = Math.min(1, (v.cherry || 0) / 1);
    var shakeX = k > .3 ? Math.sin(t * 40) * k * 2.6 : 0;
    shadow(c, 0, 1, 30, 9);
    c.save(); c.translate(shakeX, 0);
    // 梗
    c.strokeStyle = '#7fae5a'; c.lineWidth = 3.4; c.lineCap = 'round';
    c.beginPath(); c.moveTo(-12, -30); c.quadraticCurveTo(-4, -54, 2, -56); c.stroke();
    c.beginPath(); c.moveTo(12, -30); c.quadraticCurveTo(10, -50, 2, -56); c.stroke();
    leaf(c, 2, -56, 18, 7, -.55, '#9ee88a', '#5fb85c');
    // 两颗樱桃
    function cherry(x, y, r) {
      var g = gradR(c, x - r * .3, y - r * .35, 2, r * 1.1, [[0, '#ffb3c4'], [.55, '#f2577a'], [1, '#c33a5e']]);
      circle(c, x, y, r, g, OUT, 2.4);
      c.fillStyle = 'rgba(255,255,255,.62)';
      c.beginPath(); c.ellipse(x - r * .34, y - r * .4, r * .3, r * .19, -.5, 0, TAU); c.fill();
      moeEye(c, x - r * .3, y - r * .05, r * .27, 0, 0, { sparkle: true });
      moeEye(c, x + r * .28, y - r * .05, r * .27, 0, 0);
      blush(c, x - r * .62, y + r * .32, r * .2, r * .12, .5);
      catMouth(c, x + r * .02, y + r * .3, r * .22);
    }
    cherry(-13, -18, 17);
    cherry(14, -14, 15);
    c.restore();
    // 引信火花
    if (k > .35) {
      for (var i = 0; i < 5; i++) {
        var a = t * 8 + i * 1.3;
        starPop(c, Math.cos(a) * 26, -34 + Math.sin(a) * 14, 2.6 + Math.sin(t * 9 + i) * .8, i % 2 ? '#ffd86b' : '#ff9fc4', .9);
      }
    }
  };

  DRAW.chomper = function (c, v) {
    var t = v.t, chew = v.chew > 0 ? 1 : 0;
    shadow(c, 0, 1, 28, 9);
    stem(c, 26, Math.sin(t * 1.7) * .05, P.purple, P.purpleD);
    leaf(c, -6, -8, 24, 9, Math.PI + .45, '#c790f0', P.purpleD);
    leaf(c, 6, -12, 24, 9, -.45, '#c790f0', P.purpleD);
    c.save(); c.translate(2, -48);
    var open = chew ? .12 : (.35 + .35 * (0.5 + 0.5 * Math.sin(t * 2.4)));
    c.rotate(-.12);
    // 下颚
    c.save(); c.rotate(open * .5);
    var lg = gradR(c, -4, 4, 2, 26, [[0, '#e3b8ff'], [1, '#b06fe0']]);
    c.beginPath(); c.ellipse(0, 4, 26, 15, .08, 0, Math.PI); c.closePath();
    c.fillStyle = lg; c.fill(); c.strokeStyle = OUT; c.lineWidth = 2.4; c.stroke();
    c.restore();
    // 上颚
    c.save(); c.rotate(-open * .6);
    var ug = gradR(c, -4, -10, 2, 28, [[0, '#f0d4ff'], [1, '#c58cf0']]);
    c.beginPath(); c.ellipse(0, -6, 27, 18, -.06, Math.PI, TAU); c.closePath();
    c.fillStyle = ug; c.fill(); c.strokeStyle = OUT; c.lineWidth = 2.4; c.stroke();
    // 牙
    c.fillStyle = '#fffdf8';
    for (var d = 0; d < 4; d++) {
      var dx = -16 + d * 10;
      c.beginPath(); c.moveTo(dx, -8); c.lineTo(dx + 4, -1); c.lineTo(dx + 8, -8); c.closePath(); c.fill();
    }
    // 眼
    moeEye(c, -9, -16, 5, 0, 0, { sparkle: true, closed: chew });
    moeEye(c, 6, -18, 4.6, 0, 0, { closed: chew });
    blush(c, 14, -8, 4, 2.4, .5);
    c.restore();
    if (chew) {
      c.fillStyle = 'rgba(255,255,255,.5)';
      circle(c, 26, -56, 4 + Math.sin(t * 8) * 1.4, 'rgba(255,255,255,.55)', null);
    }
  };

  DRAW.spike = function (c, v) {
    var t = v.t;
    // 藤蔓垫
    ell(c, 0, -2, 46, 14, 'rgba(111,191,98,.35)');
    for (var i = 0; i < 5; i++) {
      var x = -36 + i * 18;
      var lift = Math.sin(t * 3 + i) * 1.6;
      c.save(); c.translate(x, -4 + lift); c.rotate(-.06);
      // 尖刺（萌可版：甜甜的三角糖）
      var g = gradV(c, 0, -26, 0, [[0, '#fff3c4'], [1, '#ffc94f']]);
      c.beginPath();
      c.moveTo(-8, 0); c.quadraticCurveTo(-3, -14, 0, -24); c.quadraticCurveTo(3, -14, 8, 0);
      c.closePath();
      c.fillStyle = g; c.fill(); c.strokeStyle = '#d99a2c'; c.lineWidth = 1.6; c.stroke();
      circle(c, 0, -6, 1.5, 'rgba(255,255,255,.8)', null);
      c.restore();
    }
    // 小眼睛在垫子上
    moeEye(c, -14, -4, 3.2, 0, 0);
    moeEye(c, 14, -4, 3.2, 0, 0);
    catMouth(c, 0, -1, 3.6);
  };

  DRAW.torch = function (c, v) {
    var t = v.t;
    shadow(c, 0, 1, 26, 8);
    // 木桩
    var g = gradV(c, 0, -54, 0, [[0, '#d6a46a'], [1, '#a3703c']]);
    fillRR(c, -15, -56, 30, 56, 9, g, OUT, 2.4);
    c.strokeStyle = 'rgba(120,80,40,.35)'; c.lineWidth = 1.2;
    for (var i = 0; i < 3; i++) { c.beginPath(); c.moveTo(-11 + i * 8, -50); c.lineTo(-10 + i * 8, -8); c.stroke(); }
    // 眼睛 + 腮红
    moeEye(c, -6, -36, 4.6, 0, 0, { sparkle: true });
    moeEye(c, 6, -36, 4.6, 0, 0);
    blush(c, -12, -28, 3.4, 2, .5);
    blush(c, 12, -28, 3.4, 2, .5);
    catMouth(c, 0, -28, 5);
    // 火焰（圆润水滴 + 内焰）
    var f = Math.sin(t * 7) * .5 + .5;
    var fg = gradV(c, 0, -96, -54, [[0, 'rgba(255,250,205,.98)'], [.4, 'rgba(255,206,90,.95)'], [1, 'rgba(255,130,150,0)']]);
    c.fillStyle = fg;
    c.beginPath();
    c.moveTo(-14, -52);
    c.bezierCurveTo(-20, -72, -8, -80 - f * 6, -2, -92 - f * 4);
    c.bezierCurveTo(2, -84, 12, -78, 13, -64);
    c.bezierCurveTo(15, -54, 8, -50, 0, -50);
    c.bezierCurveTo(-6, -50, -12, -50, -14, -52);
    c.closePath(); c.fill();
    c.fillStyle = 'rgba(255,255,230,.9)';
    c.beginPath();
    c.moveTo(-5, -54); c.quadraticCurveTo(-8, -68, 0, -78 - f * 3); c.quadraticCurveTo(7, -66, 5, -54); c.closePath(); c.fill();
    // 火星
    for (var k = 0; k < 3; k++) {
      var yy = -64 - ((t * 26 + k * 17) % 34);
      c.fillStyle = 'rgba(255,200,110,' + (0.75 - (yy + 64) / 46) + ')';
      circle(c, Math.sin(t * 3 + k) * 8, yy, 1.7, c.fillStyle, null);
    }
  };

  /* ---- 萌可新增植物 ---- */

  // 星星灯：浅蓝铃铛花，星形花冠
  DRAW.star = function (c, v) {
    var t = v.t, sway = Math.sin(t * 2.4) * .08;
    shadow(c, 0, 1, 25, 8);
    stem(c, 36, sway, '#a7b8ff', '#7b8ce0');
    pairLeaves(c, -12, -18, '#b6c4ff');
    var rec = v.shoot > 0 ? -6 * Math.min(1, v.shoot / .16) : 0;
    c.save(); c.translate(rec, -54); c.rotate(sway * .5);
    // 星形花瓣
    for (var i = 0; i < 5; i++) {
      c.save(); c.rotate(i / 5 * TAU + t * .5);
      c.beginPath();
      c.moveTo(0, -13); c.quadraticCurveTo(7, -24, 0, -30); c.quadraticCurveTo(-7, -24, 0, -13);
      c.closePath();
      c.fillStyle = i % 2 ? '#dbe6ff' : '#c9d8ff'; c.fill();
      c.strokeStyle = '#8496d8'; c.lineWidth = 1.6; c.stroke();
      c.restore();
    }
    var g = gradR(c, -5, -6, 2, 17, [[0, '#fffdf0'], [1, '#ffe58a']]);
    circle(c, 0, 0, 15, g, '#d9a83c', 2.2);
    moeEye(c, -5.5, -2.5, 4.6, 0, 0, { sparkle: true });
    moeEye(c, 5.5, -2.5, 4.6, 0, 0);
    blush(c, -10.5, 4, 3.4, 2.1, .5);
    blush(c, 10.5, 4, 3.4, 2.1, .5);
    catMouth(c, 0, 4, 6);
    // 光晕与飘星
    c.globalAlpha = .5 + .3 * Math.sin(t * 3);
    star4(c, 17, -20, 3.2, t);
    star4(c, -18, -8, 2.4, -t);
    c.globalAlpha = 1;
    c.restore();
  };

  // 棉花糖苔：蓬松云朵 + 糖霜护盾波纹
  DRAW.marshmallow = function (c, v) {
    var t = v.t;
    shadow(c, 0, 1, 30, 9);
    var bob = Math.sin(t * 1.6) * 1.6;
    c.save(); c.translate(0, bob);
    // 云朵轮廓
    var blobs = [[-18, -18, 17], [0, -30, 22], [19, -17, 16], [-6, -12, 18], [10, -10, 15]];
    c.beginPath();
    blobs.forEach(function (b) { c.moveTo(b[0] + b[2], b[1]); c.arc(b[0], b[1], b[2], 0, TAU); });
    // 先描粗边再填充，填充覆盖内部弧线，只留外轮廓
    c.strokeStyle = OUT; c.lineWidth = 7.2; c.lineJoin = 'round'; c.stroke();
    var cg = gradR(c, -8, -34, 4, 42, [[0, '#ffffff'], [.6, '#ffeef6'], [1, '#ffc9e0']]);
    c.fillStyle = cg; c.fill();
    // 糖粒
    for (var i = 0; i < 6; i++) {
      var a = i * 1.7 + t * .3;
      c.fillStyle = i % 2 ? '#ff9fc4' : '#9be8cf';
      c.save(); c.translate(Math.cos(a) * 20, -26 + Math.sin(a) * 13); c.rotate(a);
      c.fillRect(-2.2, -1, 4.4, 2); c.restore();
    }
    moeEye(c, -8, -26, 5, 0, 0, { sparkle: true });
    moeEye(c, 8, -26, 5, 0, 0);
    blush(c, -16, -19, 4.2, 2.6, .55);
    blush(c, 16, -19, 4.2, 2.6, .55);
    catMouth(c, 0, -18, 7);
    c.restore();
    // 护盾波纹
    var pulse = (t * .7) % 1;
    c.save(); c.globalAlpha = (1 - pulse) * .5;
    c.strokeStyle = '#bfe9ff'; c.lineWidth = 2.4;
    c.beginPath(); c.ellipse(0, -18, 30 + pulse * 22, 26 + pulse * 18, 0, 0, TAU); c.stroke();
    c.restore();
  };

  // 幽灵南瓜：半透明南瓜灵，追踪
  DRAW.pumpkin = function (c, v) {
    var t = v.t, bob = Math.sin(t * 1.8) * 3;
    // 幽光尾
    c.save(); c.globalAlpha = .35;
    var tg = gradR(c, 0, -18, 4, 40, [[0, 'rgba(255,170,90,.9)'], [1, 'rgba(255,140,60,0)']]);
    c.fillStyle = tg; c.beginPath(); c.arc(0, -18, 40, 0, TAU); c.fill();
    c.restore();
    c.save(); c.translate(0, bob);
    // 南瓜身体（南瓜瓣）
    var pg = gradR(c, -7, -26, 3, 34, [[0, '#ffd59a'], [.55, '#ffab4f'], [1, '#e8822e']]);
    for (var i = 0; i < 4; i++) {
      var ox = (i - 1.5) * 11;
      ellS(c, ox, -22, 12.5, 20, i % 2 ? mix('#ffb45c', '#ffffff', .12) : '#ffa844', null, 0, 0);
    }
    c.beginPath(); c.ellipse(0, -22, 30, 21, 0, 0, TAU);
    c.fillStyle = pg; c.globalAlpha = .92; c.fill(); c.globalAlpha = 1;
    c.strokeStyle = OUT; c.lineWidth = 2.4; c.stroke();
    // 茎
    c.strokeStyle = '#7fae5a'; c.lineWidth = 4; c.lineCap = 'round';
    c.beginPath(); c.moveTo(0, -42); c.quadraticCurveTo(5, -50, 2, -56); c.stroke();
    leaf(c, 2, -54, 15, 6, -.7, '#9ee88a', '#5fb85c');
    // 表情：可爱版
    moeEye(c, -9, -26, 5.4, 0, 0, { sparkle: true });
    moeEye(c, 9, -26, 5.4, 0, 0);
    blush(c, -17, -18, 4.4, 2.6, .5);
    blush(c, 17, -18, 4.4, 2.6, .5);
    // 锯齿小嘴
    c.fillStyle = '#7b4c30';
    c.beginPath();
    c.moveTo(-8, -12); c.lineTo(-4, -7); c.lineTo(0, -12); c.lineTo(4, -7); c.lineTo(8, -12);
    c.quadraticCurveTo(0, -6, -8, -12);
    c.closePath(); c.fill();
    c.restore();
  };

  // 甜筒炮：冰淇淋甜筒，倒扣发射
  DRAW.sundae = function (c, v) {
    var t = v.t, shake = v.cherry > 0 ? Math.sin(t * 34) * 1.8 : 0;
    shadow(c, 0, 1, 26, 8);
    c.save(); c.translate(shake, 0);
    // 甜筒
    c.beginPath();
    c.moveTo(-17, -8); c.lineTo(17, -8); c.lineTo(0, 10); c.closePath();
    var cg = gradV(c, 0, -8, 10, [[0, '#f0c88a'], [1, '#cf9a56']]);
    c.fillStyle = cg; c.fill(); c.strokeStyle = OUT; c.lineWidth = 2.2; c.stroke();
    c.strokeStyle = 'rgba(140,90,40,.45)'; c.lineWidth = 1.4;
    for (var i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(i * 8 - 6, -6); c.lineTo(i * 8 + 3, 7); c.stroke(); }
    // 奶油球
    var bc = ['#ffc2d8', '#ffe7b3', '#c7f0e2'];
    for (var b = 0; b < 3; b++) {
      var y = -14 - b * 10, r = 16 - b * 2.4;
      circle(c, (b % 2 ? 2 : -2), y, r, bc[b], OUT, 2.2);
      c.fillStyle = 'rgba(255,255,255,.5)';
      c.beginPath(); c.ellipse((b % 2 ? 2 : -2) - r * .3, y - r * .35, r * .32, r * .18, -.4, 0, TAU); c.fill();
    }
    // 樱桃
    circle(c, 8, -50, 7, '#f2577a', OUT, 2);
    c.strokeStyle = '#7fae5a'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(8, -56); c.quadraticCurveTo(12, -64, 17, -62); c.stroke();
    // 小脸
    moeEye(c, -6, -24, 5, 0, 0, { sparkle: true });
    moeEye(c, 6, -24, 5, 0, 0);
    blush(c, -14, -17, 4, 2.4, .5);
    blush(c, 14, -17, 4, 2.4, .5);
    catMouth(c, 0, -16, 6);
    c.restore();
    // 发射倒计时环
    if (v.cherry > 0) {
      c.save(); c.globalAlpha = .6;
      c.strokeStyle = '#ffdf6b'; c.lineWidth = 3.4; c.lineCap = 'round';
      c.beginPath(); c.arc(0, -14, 34, -Math.PI / 2, -Math.PI / 2 + TAU * clamp01(1 - v.cherry)); c.stroke();
      c.restore();
    }
  };
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

  A.drawPlant = function (c, type, v) {
    (DRAW[type] || DRAW.peashooter)(c, v);
  };
  A.plantTypes = Object.keys(DRAW);

  /* ---------------- 僵尸：萌可捣蛋团子 ---------------- */
  var ZCOL = {
    normal:    { skin: '#c9e4c0', skinD: '#a5c99b', coat: '#a98bd0', coatD: '#8768b0', pants: '#7f9fc4', pantsD: '#6784a6' },
    cone:      { skin: '#c9e4c0', skinD: '#a5c99b', coat: '#a98bd0', coatD: '#8768b0', pants: '#7f9fc4', pantsD: '#6784a6' },
    bucket:    { skin: '#c9e4c0', skinD: '#a5c99b', coat: '#9a86b8', coatD: '#7c6898', pants: '#728fae', pantsD: '#5c7691' },
    pole:      { skin: '#cbe7c2', skinD: '#a8cc9e', coat: '#8fbfe8', coatD: '#6a9bc7', pants: '#6f9fd0', pantsD: '#5783ad' },
    newspaper: { skin: '#c9e4c0', skinD: '#a5c99b', coat: '#c8b28f', coatD: '#a38f6e', pants: '#8d93a0', pantsD: '#727885' },
    door:      { skin: '#c3dfba', skinD: '#9fc695', coat: '#b5a08c', coatD: '#92806f', pants: '#728fae', pantsD: '#5c7691' },
    football:  { skin: '#d3ebc9', skinD: '#afd1a3', coat: '#ef8f8f', coatD: '#c56a6a', pants: '#fff3e0', pantsD: '#e2cfb4' },
    giant:     { skin: '#b9cfe4', skinD: '#95aec6', coat: '#a67fbf', coatD: '#8360a0', pants: '#6b6f9e', pantsD: '#525680' },
    imp:       { skin: '#cfe6c6', skinD: '#aacfa0', coat: '#d79ad0', coatD: '#b478ad', pants: '#8c88b8', pantsD: '#6e6a99' },
    jelly:     { skin: '#ffc2d8', skinD: '#f59cbe', coat: '#ffc2d8', coatD: '#f59cbe', pants: '#ffc2d8', pantsD: '#f59cbe' },
    spring:    { skin: '#bfe9db', skinD: '#93d3c0', coat: '#bfe9db', coatD: '#93d3c0', pants: '#bfe9db', pantsD: '#93d3c0' },
    bubble:    { skin: '#c9d8ff', skinD: '#9db4ea', coat: '#c9d8ff', coatD: '#9db4ea', pants: '#c9d8ff', pantsD: '#9db4ea' }
  };

  // z: { type, ph, eat, dead, dieT, flash, slow, armLost, armor, armorMax, armorType, smash, jumping, rage, scale, x, y, jy }
  A.drawZombie = function (c, z, t) {
    var type = z.type;
    if (type === 'jelly') return drawJelly(c, z, t);
    if (type === 'spring') return drawSpring(c, z, t);
    if (type === 'bubble') return drawBubbleZ(c, z, t);

    var col = ZCOL[type] || ZCOL.normal;
    var s = z.scale || 1;
    var K = function (hex) {
      if (z.flash > 0) return mix(hex, '#ffffff', .8);
      if (z.charred) return mix(hex, '#4a3a3a', .78);
      if (z.slow > 0) return mix(hex, '#9fd8ff', .5);
      if (z.rage && type === 'newspaper') return mix(hex, '#ff9a9a', .3);
      return hex;
    };
    var alpha = 1;
    if (z.dead) alpha = Math.max(0, 1 - Math.max(0, z.dieT - (z.charred ? .25 : .8)) / .7);
    if (alpha <= 0) return;

    c.fillStyle = 'rgba(92,68,82,' + (0.18 * alpha) + ')';
    c.beginPath(); c.ellipse(z.x, z.y + 2, 25 * s, 7 * s, 0, 0, TAU); c.fill();

    c.save();
    c.globalAlpha = alpha;
    c.translate(z.x, z.y - (z.jy || 0));
    c.scale(s, s);
    var ph = z.ph, eat = z.eat ? (0.5 + 0.5 * Math.sin(ph * 9)) : 0;
    var amp = z.dead ? .05 : (z.eat ? .1 : (z.jumping ? .3 : .5));
    var lean = z.eat ? .12 + eat * .06 : (type === 'giant' ? .06 : .04);

    if (z.dead && !z.charred) { var f = Math.min(1, (z.dieT || 0) / .55); c.rotate(f * f * 1.4); }
    if (z.jumping) { c.translate(0, -40); c.rotate(-Math.min(1, z.jt / .95) * TAU); c.translate(0, 40); }

    // 腿（小短腿 + 圆鞋）
    for (var i = 1; i >= 0; i--) {
      var a = Math.sin(ph + i * Math.PI) * amp;
      var hx = -2 + i * 6, hy = -30;
      var fx = hx + Math.sin(a) * 19, fy = hy + Math.cos(a) * 27;
      line(c, hx, hy, fx, fy, 10, K(i ? mix(col.pants, '#000', .14) : col.pants));
      ell(c, fx - 3, fy - 1, 9.5, 5, K('#6f5d6e'));
    }

    c.save();
    c.translate(0, -30); c.rotate(-lean); c.translate(0, 30);

    // 后臂
    var raise = 0;
    if (z.smash != null && z.smash > 0) raise = Math.min(1, z.smash / .7);
    var armA = function (k) {
      var ang = Math.PI + .08 + Math.sin(ph + k) * .12;
      if (z.eat) ang = Math.PI + .25 + Math.sin(ph * 9 + k) * .4;
      if (type === 'giant') ang = Math.PI * 1.5 * raise + Math.PI * .1 * (1 - raise) + (z.smash < 0 ? Math.min(1, -z.smash / .5) * -0.5 : 0);
      if (z.jumping) ang = Math.PI * 1.3;
      if (z.dead) ang = Math.PI * .8;
      return ang;
    };
    var arm = function (sx, sy, ang, coatCol, skinCol) {
      var ex = sx + Math.cos(ang) * 12, ey = sy + Math.sin(ang) * 12;
      var a2 = ang + .22, hx2 = ex + Math.cos(a2) * 12, hy2 = ey + Math.sin(a2) * 12;
      line(c, sx, sy, ex, ey, 7.4, K(coatCol));
      line(c, ex, ey, hx2, hy2, 6.4, K(skinCol));
      circle(c, hx2, hy2, 4.6, K(col.skinD), K(ZOUT), 1.4);
    };
    arm(4, -34, armA(Math.PI), mix(col.coat, '#000000', .16), col.skin);

    // 躯干（圆胖）
    var tg = gradV(c, 0, -66, -28, [[0, K(mix(col.coat, '#ffffff', .22))], [1, K(col.coat)]]);
    rr(c, -14, -66, 28, 40, 12); c.fillStyle = tg; c.fill();
    c.strokeStyle = K(col.coatD); c.lineWidth = 1.8; c.stroke();
    // 领口 + 小领结
    c.fillStyle = K('#fff6e0');
    c.beginPath(); c.moveTo(-6, -64); c.lineTo(6, -64); c.lineTo(3.4, -54); c.lineTo(-3.4, -54); c.closePath(); c.fill();
    if (type !== 'football' && type !== 'giant') {
      c.fillStyle = K(type === 'pole' ? '#ffe08a' : '#ff8fb2');
      c.beginPath(); c.moveTo(-3, -62); c.lineTo(3, -62); c.lineTo(3.6, -44); c.lineTo(0, -38); c.lineTo(-3.6, -44); c.closePath(); c.fill();
    }
    // 破洞
    c.fillStyle = K(mix(col.coat, '#000', .22));
    for (var k2 = 0; k2 < 3; k2++) { c.beginPath(); c.moveTo(-12 + k2 * 8, -29); c.lineTo(-9 + k2 * 8, -24); c.lineTo(-6 + k2 * 8, -29); c.closePath(); c.fill(); }
    // 橄榄球肩甲
    if (type === 'football') {
      ell(c, -15, -58, 11, 8, K('#ffe9e9')); c.strokeStyle = K('#d9a3a3'); c.lineWidth = 1.6; c.stroke();
      ell(c, 15, -58, 11, 8, K('#ffe9e9')); c.stroke();
      c.fillStyle = K('#fff6f6'); c.fillRect(-4, -61, 8, 5);
    }
    if (type === 'giant') {
      // 巨型棒棒糖
      c.save(); c.translate(18, -42); c.rotate(.12);
      line(c, 0, -64, 0, 24, 7, K('#e8d3b0'));
      circle(c, 0, -74, 22, K('#ffb3cf'), K('#d98aa8'), 2.4);
      for (var sp = 0; sp < 3; sp++) {
        c.strokeStyle = K('#fff6fa'); c.lineWidth = 3;
        c.beginPath(); c.arc(0, -74, 15 - sp * 4, sp * 2, sp * 2 + 2.4); c.stroke();
      }
      c.restore();
    }

    // 头
    c.save();
    c.translate(-1, -80); c.rotate(Math.sin(ph) * .06 + (z.eat ? eat * .1 : 0) + (z.dead ? .3 : 0));
    var hg = gradR(c, -5, -6, 2, 18, [[0, K(mix(col.skin, '#ffffff', .38))], [1, K(col.skin)]]);
    circle(c, 0, 0, 15.5, hg, K(col.skinD), 2);
    // 呆毛
    c.strokeStyle = K('#7d6880'); c.lineWidth = 2.4; c.lineCap = 'round';
    if (type !== 'football' && z.armorType !== 'bucket') {
      c.beginPath(); c.moveTo(-2, -14); c.quadraticCurveTo(-1, -24, 4, -26); c.stroke();
      c.beginPath(); c.moveTo(2, -14); c.quadraticCurveTo(6, -21, 10, -20); c.stroke();
    }
    // 耳朵
    circle(c, 14, 2, 3.6, K(col.skinD), null);
    // 脸
    moeEye(c, -5.4, -1.5, 4.8, 0, 0, { sparkle: !z.dead, dead: z.dead, iris: '#5b3350' });
    moeEye(c, 5, -2.5, 4.2, 0, 0, { dead: z.dead, iris: '#5b3350' });
    blush(c, -10, 5.5, 3.6, 2.2, .55);
    blush(c, 10.5, 5.5, 3.6, 2.2, .55);
    // 嘴
    c.fillStyle = K('#7a4a58');
    c.beginPath(); c.moveTo(-7, 6.5); c.quadraticCurveTo(-2, 11 + eat * 3.5, 4, 6.5); c.lineTo(3, 5); c.lineTo(-6, 5); c.closePath(); c.fill();
    c.fillStyle = K('#fffdf5'); c.fillRect(-5, 5, 2.6, 2.8); c.fillRect(0, 5, 2.6, 2.8);
    if (z.rage) {
      c.fillStyle = 'rgba(255,90,110,.26)';
      circle(c, 0, -1, 13.5, 'rgba(255,90,110,.26)', null);
    }

    // ---- 护甲 ----
    if (z.armorType === 'cone' && z.armor > 0) {
      var dm = z.armor / z.armorMax;
      // 派对帽
      c.fillStyle = K(dm > .5 ? '#ffb35c' : '#e8913f');
      c.beginPath(); c.moveTo(-14, -9); c.lineTo(13, -9); c.lineTo(-1, -43); c.closePath(); c.fill();
      c.strokeStyle = K('#c06c22'); c.lineWidth = 1.6; c.stroke();
      c.strokeStyle = K('#fff3d6'); c.lineWidth = 2.4;
      c.beginPath(); c.moveTo(-9.5, -19); c.lineTo(8.5, -19); c.moveTo(-5.5, -29); c.lineTo(5, -29); c.stroke();
      circle(c, -1, -44, 3.6, K('#ffe08a'), null);
    } else if (z.armorType === 'bucket' && z.armor > 0) {
      var bm = z.armor / z.armorMax;
      var bg2 = gradV(c, 0, -36, -8, [[0, K('#eef4fb')], [1, K(bm > .5 ? '#b9c6d6' : '#a3b0c0')]]);
      c.beginPath();
      c.moveTo(-16, -8); c.lineTo(16, -8); c.lineTo(13, -36); c.lineTo(-13, -36); c.closePath();
      c.fillStyle = bg2; c.fill(); c.strokeStyle = K('#8b98a8'); c.lineWidth = 2; c.stroke();
      c.strokeStyle = K('#ffffff'); c.lineWidth = 1.6; c.beginPath(); c.moveTo(-15, -12); c.lineTo(15, -12); c.stroke();
      c.fillStyle = 'rgba(255,255,255,.45)';
      c.beginPath(); c.ellipse(-7, -24, 2.6, 7, -.2, 0, TAU); c.fill();
    } else if (z.armorType === 'paper' && z.armor > 0) {
      c.fillStyle = K('#fffaf0');
      c.beginPath(); c.moveTo(-15, -6); c.lineTo(14, -8); c.lineTo(15, 9); c.lineTo(-16, 10); c.closePath();
      c.fill(); c.strokeStyle = K('#c9bca4'); c.lineWidth = 1.4; c.stroke();
      c.strokeStyle = K('#b8ac96'); c.lineWidth = 1;
      for (var pl = 0; pl < 3; pl++) { c.beginPath(); c.moveTo(-11, -2 + pl * 4); c.lineTo(10, -3 + pl * 4); c.stroke(); }
    } else if (z.armorType === 'door' && z.armor > 0) {
      c.fillStyle = K('#cfd6df');
      fillRR(c, 8, -46, 20, 52, 5, K('#cfd6df'), K('#8d97a4'), 2);
      c.strokeStyle = K('#aab3bf'); c.lineWidth = 1.4;
      c.strokeRect(12, -42, 12, 20);
      c.strokeRect(12, -18, 12, 20);
      circle(c, 14, -12, 2, K('#8d97a4'), null);
    } else if (z.armorType === 'helmet' && z.armor > 0) {
      c.fillStyle = K('#ef8f8f');
      c.beginPath(); c.arc(0, -4, 16.5, Math.PI * 1.03, Math.PI * 1.97); c.closePath(); c.fill();
      c.strokeStyle = K('#c56a6a'); c.lineWidth = 1.8; c.stroke();
      c.fillStyle = K('#ffe1a8');
      c.beginPath(); c.moveTo(-2, -20); c.lineTo(2, -20); c.lineTo(2, -29); c.lineTo(-2, -29); c.closePath(); c.fill();
      c.strokeStyle = K('#ffffff'); c.lineWidth = 2.6;
      c.beginPath(); c.arc(0, -6, 11, Math.PI * 1.15, Math.PI * 1.55); c.stroke();
    }
    c.restore(); // head
    c.restore(); // torso
    c.restore(); // body

    // 撑杆
    if (type === 'pole' && z.hasPole) {
      c.save(); c.translate(-18, -6); c.rotate(-.36);
      line(c, 0, 20, 0, -70, 3.4, '#d8b98a');
      c.restore();
    }
    // 减速冰晶
    if (z.slow > 0 && !z.dead) {
      c.save(); c.globalAlpha = .6;
      for (var ic = 0; ic < 3; ic++) star4(c, -14 + ic * 13, -78 + (ic % 2) * 10, 2.6, t + ic);
      c.restore();
    }
    c.restore();
  };

  /* 果冻团子 */
  function drawJelly(c, z, t) {
    var s = z.scale || 1;
    var alpha = z.dead ? Math.max(0, 1 - Math.max(0, z.dieT - .3) / .6) : 1;
    if (alpha <= 0) return;
    c.save(); c.globalAlpha = alpha;
    c.translate(z.x, z.y - (z.jy || 0)); c.scale(s, s);
    var wob = Math.sin(z.ph * 1.4) * .08;
    c.fillStyle = 'rgba(92,68,82,.16)';
    c.beginPath(); c.ellipse(0, 2, 27, 8, 0, 0, TAU); c.fill();
    c.save();
    c.scale(1 + wob, 1 - wob);
    if (z.flash > 0) c.globalAlpha = alpha * .7;
    var jg = gradR(c, -9, -44, 4, 38, [[0, z.flash > 0 ? '#ffffff' : '#ffe3ef'], [.5, z.flash > 0 ? '#ffd0e0' : (z.slow > 0 ? '#c9e9ff' : '#ffb6d4')], [1, z.flash > 0 ? '#ffb6d4' : (z.slow > 0 ? '#9fd0f0' : '#f295bb')]]);
    c.beginPath();
    c.moveTo(-27, -4);
    c.bezierCurveTo(-30, -40, -18, -56, 0, -56);
    c.bezierCurveTo(18, -56, 30, -40, 27, -4);
    c.quadraticCurveTo(0, 8, -27, -4);
    c.closePath();
    c.fillStyle = jg; c.fill();
    c.strokeStyle = OUT; c.lineWidth = 2.6; c.stroke();
    // 半透明与果粒
    c.fillStyle = 'rgba(255,255,255,.6)';
    c.beginPath(); c.ellipse(-12, -40, 7, 4, -.5, 0, TAU); c.fill();
    for (var i = 0; i < 5; i++) {
      var a = i * 1.3 + t * .6;
      circle(c, Math.cos(a) * 14, -24 + Math.sin(a) * 10, 2.4, i % 2 ? '#fff0a0' : '#ff8fb2', null);
    }
    moeEye(c, -8, -28, 5.4, 0, 0, { sparkle: true, dead: z.dead });
    moeEye(c, 8, -28, 5.4, 0, 0, { dead: z.dead });
    blush(c, -17, -20, 4.4, 2.6, .5);
    blush(c, 17, -20, 4.4, 2.6, .5);
    catMouth(c, 0, -19, 7);
    c.restore();
    c.restore();
  }

  /* 弹簧团子：果冻头 + 螺旋糖圈身体 */
  function drawSpring(c, z, t) {
    var s = z.scale || 1;
    var alpha = z.dead ? Math.max(0, 1 - Math.max(0, z.dieT - .3) / .6) : 1;
    if (alpha <= 0) return;
    var jump = z.jumping ? Math.min(1, z.jt / .72) : 0;
    var squash = z.jumping ? 1 - Math.sin(jump * Math.PI) * .16 : 1 + Math.sin(z.ph * 2) * .035;
    c.save(); c.globalAlpha = alpha;
    c.translate(z.x, z.y - (z.jy || 0)); c.scale(s, s);
    c.fillStyle = 'rgba(92,68,82,.16)';
    c.beginPath(); c.ellipse(0, 2 + (z.jy || 0) * .1, 24, 7, 0, 0, TAU); c.fill();
    var main = z.flash > 0 ? '#ffffff' : (z.slow > 0 ? '#b8e9ff' : '#7fdcc0');
    var mainD = z.flash > 0 ? '#ffffff' : (z.slow > 0 ? '#6fb8dd' : '#3fae92');
    var mainL = z.flash > 0 ? '#ffffff' : (z.slow > 0 ? '#dff4ff' : '#b3f0dd');

    c.save(); c.scale(1 / squash, squash);
    // 弹簧身体：一根粗糖霜弹簧盘起来
    var coils = 5;
    var rx = 18;
    // 底部软垫
    ellS(c, 0, -2, 23, 8.5, mainD, OUT, 2.2);
    c.fillStyle = 'rgba(255,255,255,.30)';
    c.beginPath(); c.ellipse(-7, -4, 10, 2.8, 0, 0, TAU); c.fill();
    for (var i = 0; i < coils; i++) {
      var yy = -11 - i * 9.5;
      // 每圈：一根从后往前绕的糖管
      c.save();
      c.strokeStyle = OUT; c.lineWidth = 11.5; c.lineCap = 'round';
      c.beginPath(); c.ellipse(0, yy, rx, 5.4, 0, Math.PI * 1.02, Math.PI * 1.98); c.stroke();
      c.strokeStyle = mainD; c.lineWidth = 8.2;
      c.beginPath(); c.ellipse(0, yy, rx, 5.4, 0, Math.PI * 1.02, Math.PI * 1.98); c.stroke();
      c.strokeStyle = i % 2 ? main : mainL; c.lineWidth = 6.2;
      c.beginPath(); c.ellipse(0, yy, rx, 5.4, 0, Math.PI * 1.06, Math.PI * 1.9); c.stroke();
      // 圈的后半段（被下一圈遮住的感觉）
      c.strokeStyle = OUT; c.lineWidth = 7.6;
      c.beginPath(); c.ellipse(0, yy + 1.4, rx, 4.6, 0, Math.PI * .04, Math.PI * .96); c.stroke();
      c.strokeStyle = mainD; c.lineWidth = 5;
      c.beginPath(); c.ellipse(0, yy + 1.4, rx, 4.6, 0, Math.PI * .08, Math.PI * .92); c.stroke();
      c.restore();
    }
    // 顶端接口
    ellS(c, 0, -55, 13, 5, mainL, OUT, 2);

    // 头
    c.save(); c.translate(0, -74);
    var hg = gradR(c, -8, -10, 3, 24, [[0, mainL], [.55, main], [1, mainD]]);
    circle(c, 0, 0, 20.5, hg, OUT, 2.6);
    // 小触角
    c.strokeStyle = mainD; c.lineWidth = 2.2; c.lineCap = 'round';
    c.beginPath(); c.moveTo(-6, -19); c.quadraticCurveTo(-10, -30, -5, -33); c.stroke();
    c.beginPath(); c.moveTo(7, -19); c.quadraticCurveTo(11, -29, 16, -31); c.stroke();
    circle(c, -5, -34, 3.2, '#ffe08a', OUT, 1.4);
    circle(c, 16.5, -32, 3.2, '#ff9fc4', OUT, 1.4);
    // 高光
    c.fillStyle = 'rgba(255,255,255,.6)';
    c.beginPath(); c.ellipse(-8, -9, 6.4, 3.6, -.5, 0, TAU); c.fill();
    moeEye(c, -7, -1, 5.6, 0, 0, { sparkle: true, dead: z.dead });
    moeEye(c, 7, -1, 5.6, 0, 0, { dead: z.dead });
    blush(c, -15, 7, 4.6, 2.8, .55);
    blush(c, 15, 7, 4.6, 2.8, .55);
    catMouth(c, 0, 8, 8);
    c.restore();
    c.restore();
    // 跳跃时的弹力弧线
    if (z.jumping) {
      c.save(); c.globalAlpha = (1 - jump) * .55;
      c.strokeStyle = '#ffffff'; c.lineWidth = 2;
      c.beginPath(); c.arc(0, -30, 34 + jump * 16, Math.PI * .15, Math.PI * .85); c.stroke();
      c.restore();
    }
    c.restore();
  }

  /* 泡泡团子 */
  function drawBubbleZ(c, z, t) {
    var s = z.scale || 1;
    var alpha = z.dead ? Math.max(0, 1 - Math.max(0, z.dieT - .3) / .6) : 1;
    if (alpha <= 0) return;
    c.save(); c.globalAlpha = alpha;
    c.translate(z.x, z.y - (z.jy || 0)); c.scale(s, s);
    var bob = Math.sin(z.ph * 1.2) * 2;
    c.translate(0, bob);
    c.fillStyle = 'rgba(92,68,82,.16)';
    c.beginPath(); c.ellipse(0, 2 - bob, 24, 7, 0, 0, TAU); c.fill();
    var body = z.flash > 0 ? '#ffffff' : (z.slow > 0 ? '#d9f2ff' : '#c9d8ff');
    circle(c, 0, -34, 21, body, OUT, 2.6);
    c.fillStyle = 'rgba(255,255,255,.55)';
    c.beginPath(); c.ellipse(-7, -43, 6, 3.4, -.4, 0, TAU); c.fill();
    moeEye(c, -7, -35, 5, 0, 0, { sparkle: true, dead: z.dead });
    moeEye(c, 7, -35, 5, 0, 0, { dead: z.dead });
    blush(c, -14, -27, 4.2, 2.4, .5);
    blush(c, 14, -27, 4.2, 2.4, .5);
    // 吹泡泡的圆嘴
    circle(c, 0, -25, 3.6, '#7a5a88', OUT, 1.4);
    // 泡泡棒
    c.strokeStyle = '#e0a8d8'; c.lineWidth = 3.4; c.lineCap = 'round';
    c.beginPath(); c.moveTo(16, -22); c.lineTo(28, -46); c.stroke();
    circle(c, 30, -50, 6, 'rgba(200,240,255,.55)', '#a8d8f0', 1.6);
    // 小短腿
    line(c, -7, -14, -9, -2, 5.4, '#a8b8e8');
    line(c, 7, -14, 9, -2, 5.4, '#a8b8e8');
    c.restore();
  }

  /* ---------------- 阳光 / 豌豆 / 小推车 / 铲子 / 旗 ---------------- */
  A.drawSun = function (c, x, y, r, rot, al) {
    c.save(); c.globalAlpha = al == null ? 1 : al; c.translate(x, y);
    var g = c.createRadialGradient(0, 0, r * .3, 0, 0, r * 2.6);
    g.addColorStop(0, 'rgba(255,248,190,.9)'); g.addColorStop(1, 'rgba(255,225,120,0)');
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, r * 2.6, 0, TAU); c.fill();
    c.rotate(rot);
    // 光芒：圆头花瓣
    for (var i = 0; i < 10; i++) {
      c.rotate(TAU / 10);
      ellS(c, r * 1.15, 0, r * .42, r * .2, '#ffe27a', '#f0b840', 0, 1);
    }
    var g2 = c.createRadialGradient(-r * .28, -r * .3, r * .08, 0, 0, r);
    g2.addColorStop(0, '#fffdf0'); g2.addColorStop(.55, '#ffe98a'); g2.addColorStop(1, '#f7bf3f');
    circle(c, 0, 0, r, g2, '#e0a528', 1.2);
    // 小表情
    c.save(); c.rotate(-rot);
    moeEye(c, -r * .3, -r * .1, r * .18, 0, 0, {});
    moeEye(c, r * .3, -r * .1, r * .18, 0, 0, {});
    blush(c, -r * .6, r * .22, r * .17, r * .1, .5);
    blush(c, r * .6, r * .22, r * .17, r * .1, .5);
    c.strokeStyle = '#c98a2a'; c.lineWidth = 1.4; c.lineCap = 'round';
    c.beginPath(); c.arc(0, r * .14, r * .2, .25, Math.PI - .25); c.stroke();
    c.restore();
    c.restore();
  };

  A.drawPea = function (c, x, y, ice, fire, scale) {
    var s = scale || 1;
    c.save(); c.translate(x, y); c.scale(s, s);
    var trail = fire ? 'rgba(255,170,60,' : ice ? 'rgba(180,230,255,' : 'rgba(150,225,110,';
    for (var i = 3; i >= 1; i--) {
      c.fillStyle = trail + (0.3 - i * .07) + ')';
      c.beginPath(); c.arc(-i * 7, 0, 6.8 - i * 1.1, 0, TAU); c.fill();
    }
    if (fire) {
      var fg = c.createRadialGradient(0, 0, 1, 0, 0, 14);
      fg.addColorStop(0, 'rgba(255,255,225,.95)'); fg.addColorStop(.4, 'rgba(255,185,70,.95)'); fg.addColorStop(1, 'rgba(255,120,90,0)');
      c.fillStyle = fg; c.beginPath(); c.arc(0, 0, 14, 0, TAU); c.fill();
    }
    var g = c.createRadialGradient(-2.5, -3, 1, 0, 0, 9);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(.34, fire ? '#ffd86b' : ice ? '#b6ecff' : '#a9ef7d');
    g.addColorStop(1, fire ? '#ef7a3a' : ice ? '#5fb3e8' : '#5fbf52');
    circle(c, 0, 0, 8.4, g, fire ? '#d9602a' : ice ? '#5fa8d0' : '#5fbf52', 1.2);
    c.fillStyle = 'rgba(255,255,255,.9)';
    c.beginPath(); c.ellipse(-2.6, -3, 2.2, 1.5, -.5, 0, TAU); c.fill();
    c.restore();
  };

  A.drawMower = function (c, x, y, running, t) {
    c.save(); c.translate(x, y + (running ? Math.sin(t * 60) * 1.4 : 0));
    shadow(c, 0, 6, 29, 6, .2);
    // 小推车：糖果粉
    var g = gradV(c, 0, -28, 0, [[0, '#ffb3c8'], [1, '#f2799f']]);
    fillRR(c, -25, -26, 49, 26, 10, g, '#b8506f', 2.2);
    fillRR(c, -12, -36, 24, 12, 6, '#ffc9d9', '#b8506f', 2);
    // 脸
    moeEye(c, -9, -13, 4, 0, 0, {});
    moeEye(c, 9, -13, 4, 0, 0, {});
    blush(c, -16, -7, 3.2, 2, .5);
    blush(c, 16, -7, 3.2, 2, .5);
    // 手柄
    line(c, 16, -28, 28, -48, 4.2, '#b9a0b0'); line(c, 24, -48, 35, -48, 4.2, '#9c8294');
    line(c, -25, -9, -37, -9, 3, '#d9b8c8'); line(c, -37, -16, -37, -1, 3, '#eed3df');
    for (var i = 0; i < 2; i++) {
      var wx = i ? 14 : -14;
      circle(c, wx, 0, 8.4, '#6f5d6e', null);
      circle(c, wx, 0, 3.6, '#f4e8ef', null);
      c.strokeStyle = 'rgba(255,255,255,.4)'; c.lineWidth = 1.3;
      c.beginPath(); c.arc(wx, 0, 5.8, .4, 2.2); c.stroke();
    }
    if (running) {
      for (var k = 0; k < 4; k++) {
        c.fillStyle = 'rgba(255,220,140,' + (.75 - k * .16) + ')';
        c.beginPath(); c.arc(-38 - k * 7, -12 + Math.sin(t * 40 + k) * 5, 2.4, 0, TAU); c.fill();
      }
    }
    c.restore();
  };

  A.drawShovel = function (c, x, y, s, rot) {
    c.save(); c.translate(x, y); c.rotate(rot || 0); c.scale(s || 1, s || 1);
    line(c, 0, -26, 0, 5, 5.4, '#d8a878');
    // 心形铲柄
    c.fillStyle = '#ff9fc4'; c.strokeStyle = '#d9749a'; c.lineWidth = 1.6;
    c.beginPath(); c.arc(-4, -30, 5, 0, TAU); c.arc(4, -30, 5, 0, TAU); c.fill(); c.stroke();
    fillRR(c, -10, 3, 20, 20, 9, '#e6eef7', '#94a3b4', 2);
    c.fillStyle = '#cdd8e6'; c.beginPath(); c.moveTo(-10, 3); c.lineTo(10, 3); c.lineTo(8, 9); c.lineTo(-8, 9); c.closePath(); c.fill();
    line(c, -4, 9, -4, 20, 2, 'rgba(255,255,255,.8)');
    c.restore();
  };

  A.drawFlag = function (c, x, y, t) {
    c.save(); c.translate(x, y);
    line(c, 0, 0, 0, -56, 3, '#b08a5a');
    c.fillStyle = '#ff8fb2';
    var w = Math.sin(t * 3) * 4;
    c.beginPath(); c.moveTo(1, -56); c.quadraticCurveTo(20, -58 + w, 38, -48 + w * 1.4);
    c.lineTo(38 + w, -32 + w); c.quadraticCurveTo(20, -36 - w, 1, -36); c.closePath(); c.fill();
    // 心形
    c.fillStyle = '#fff5f8';
    c.beginPath();
    c.moveTo(20, -42 + w * .7);
    c.bezierCurveTo(12, -50 + w * .7, 10, -38 + w * .7, 20, -33 + w * .7);
    c.bezierCurveTo(30, -38 + w * .7, 28, -50 + w * .7, 20, -42 + w * .7);
    c.closePath(); c.fill();
    c.restore();
  };

  /* ---------------- 迷你预览 ---------------- */
  A.drawPlantPreview = function (c, type, x, y, scale, t) {
    c.save(); c.translate(x, y); c.scale(scale, scale);
    A.drawPlant(c, type, { t: t || 0, hp: 1, max: 1, armed: true, rise: 1, cherry: 0, chew: 0, hurt: 0, timer: 0 });
    c.restore();
  };

  A.drawSmallZombie = function (c, type, x, y, scale, t) {
    c.save(); c.translate(x, y); c.scale(scale, scale);
    A.drawZombie(c, {
      type: type, ph: (t || 0) * 3, eat: false, dead: false, dieT: 0, flash: 0, slow: 0,
      armLost: false, armor: 999, armorMax: 999, armorType: (window.PVZ_DATA.ZOMBIES[type] || {}).armorType || null,
      scale: 1, x: 0, y: 0, smash: 0, hasPole: type === 'pole'
    }, t || 0);
    c.restore();
  };

  A.metrics = { GX: GX, GY: GY, CW: CW, CH: CH, ROWS: ROWS, COLS: COLS, W: W, H: H };
  window.PVZ_ART = A;
})();
