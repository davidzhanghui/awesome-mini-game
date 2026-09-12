/* AMG theme helper — shared by all mini-games. Zero dependencies.
 *
 * Theme resolution: localStorage "amg-theme" (system|dark|light) > system.
 * Mirrors the landing page logic, so a theme picked on the landing page
 * applies to every game automatically. Must be loaded in <head> (sync)
 * so <html data-theme> is set before first paint.
 *
 * Also mounts a ☀️/🌙 toggle into .brand-btns (or .top-links) on
 * DOMContentLoaded — i18n.js's 🏠 home link stays leftmost.
 */
(function () {
  'use strict';
  var KEY = 'amg-theme';
  var mq = (window.matchMedia) ? matchMedia('(prefers-color-scheme: light)') : null;

  function setting() {
    try { return localStorage.getItem(KEY) || 'system'; } catch (e) { return 'system'; }
  }
  function effective() {
    var s = setting();
    return s === 'system' ? (mq && mq.matches ? 'light' : 'dark') : s;
  }
  function apply() {
    try { document.documentElement.dataset.theme = effective(); } catch (e) {}
  }
  function syncBtn() {
    var b = document.getElementById('amg-theme-btn');
    if (!b) return;
    var dark = effective() === 'dark';
    b.textContent = dark ? '☀️' : '🌙';
    var lang = (window.AMG && AMG.lang) || 'zh';
    b.title = dark
      ? (lang === 'zh' ? '切换到白天' : 'Switch to light')
      : (lang === 'zh' ? '切换到夜间' : 'Switch to dark');
  }
  apply();

  if (mq && mq.addEventListener) {
    mq.addEventListener('change', function () { if (setting() === 'system') { apply(); syncBtn(); } });
  }

  function mount() {
    var host = document.querySelector('.brand-btns') || document.querySelector('.top-links');
    // flappy / mario 自带昼夜切换（body.night 已映射为暖黑主题），不重复挂载
    if (!host || document.getElementById('amg-theme-btn') || document.getElementById('btn-theme')) return;
    var b = document.createElement('button');
    b.id = 'amg-theme-btn';
    b.className = host.classList.contains('brand-btns') ? 'icon-btn' : 'ghost-btn';
    b.style.minWidth = '0';
    b.type = 'button';
    b.addEventListener('click', function () {
      var next = effective() === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(KEY, next); } catch (e) {}
      apply(); syncBtn();
    });
    // 插在第二位：🏠(i18n.js 稍后插到最前) | 语言 | 🌙 | 🔊
    host.insertBefore(b, host.children[1] || null);
    syncBtn();
  }

  window.AMG_THEME = { apply: apply, effective: effective };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
