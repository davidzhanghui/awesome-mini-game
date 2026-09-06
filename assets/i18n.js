/* AMG i18n helper — shared by all mini-games. Zero dependencies.
 *
 * Language resolution order:  ?lang= URL param  >  localStorage "amg-lang"
 *   >  navigator.language  >  "zh".
 * The landing page writes localStorage "amg-lang" and appends ?lang= to
 * game links, so a game opened from the landing page always matches it.
 *
 * Usage in a game (before game.js):
 *   <script src="../assets/i18n.js"></script>
 *   <script>window.GAME_STR = { zh: {...}, en: {...} };</script>
 *
 * Then in game.js:  AMG.t(GAME_STR, "key")  or  AMG.tf(GAME_STR, "key", arg)
 * Static DOM: add data-i18n="key" attributes, then call AMG.apply(GAME_STR).
 * Toggle button: AMG.mountBtn() appends an EN/中文 button into .brand-btns
 *   (falls back to a fixed corner button). Switching reloads with ?lang=.
 */
(function () {
  'use strict';

  function getLang() {
    try {
      var m = /[?&]lang=(zh|en)\b/.exec(location.search || '');
      if (m) return m[1];
      var saved = localStorage.getItem('amg-lang');
      if (saved === 'zh' || saved === 'en') return saved;
      var nav = (navigator.language || 'zh').toLowerCase();
      return nav.indexOf('zh') === 0 ? 'zh' : 'en';
    } catch (e) {
      return 'zh';
    }
  }

  var lang = getLang();

  function setLang(next) {
    try { localStorage.setItem('amg-lang', next); } catch (e) {}
    var url = new URL(location.href);
    url.searchParams.set('lang', next);
    location.href = url.toString();
  }

  // Plain lookup with zh fallback.
  function t(dict, key) {
    if (!dict) return key;
    if (dict[lang] && dict[lang][key] !== undefined) return dict[lang][key];
    if (dict.zh && dict.zh[key] !== undefined) return dict.zh[key];
    return key;
  }

  // Template lookup: value is a function receiving (...args).
  function tf(dict, key) {
    var fn = t(dict, key);
    var args = Array.prototype.slice.call(arguments, 2);
    if (typeof fn === 'function') return fn.apply(null, args);
    return fn;
  }

  // Apply dict to static DOM: data-i18n="key" -> textContent.
  // Also sets <html lang> and document.title from dict.title.
  function apply(dict) {
    var ttl = t(dict, 'title');
    if (ttl && ttl !== 'title') document.title = ttl;
    try { document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'; } catch (e) {}
    var els = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < els.length; i++) {
      els[i].textContent = t(dict, els[i].getAttribute('data-i18n'));
    }
  }

  // Language toggle button. Prefers .brand-btns, else fixed top-right.
  function mountBtn() {
    var btn = document.createElement('button');
    btn.id = 'amg-lang-btn';
    btn.className = 'icon-btn';
    btn.textContent = lang === 'zh' ? 'EN' : '中文';
    btn.title = lang === 'zh' ? 'Switch to English' : '切换到中文';
    btn.style.minWidth = '44px';
    btn.onclick = function () { setLang(lang === 'zh' ? 'en' : 'zh'); };
    var host = document.querySelector('.brand-btns');
    if (host) {
      host.insertBefore(btn, host.firstChild);
    } else {
      btn.style.cssText = 'position:fixed;top:12px;right:12px;z-index:99;'
        + 'background:rgba(20,28,48,.9);color:#fff;border:1px solid rgba(148,163,184,.4);'
        + 'border-radius:10px;padding:8px 12px;font-size:13px;font-weight:700;cursor:pointer;';
      document.body.appendChild(btn);
    }
  }

  window.AMG = { lang: lang, getLang: getLang, setLang: setLang, t: t, tf: tf, apply: apply, mountBtn: mountBtn };
})();
