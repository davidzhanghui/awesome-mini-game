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
 * Home button: AMG.mountHome() inserts a 🏠 link to the landing page
 *   ("../") into .brand-btns (or raiden's .top-links), carrying ?lang=
 *   so the landing page keeps the same language. It is ALSO auto-mounted
 *   on DOMContentLoaded, so individual games need zero edits.
 */
(function () {
  'use strict';

  var LANGS = ['zh', 'en', 'ja', 'ko'];
  // Button shows the NEXT language in the cycle.
  var NEXT_LABEL = { zh: 'EN', en: '日本語', ja: '한국어', ko: '中文' };
  var NEXT_TITLE = {
    zh: 'Switch to English', en: '日本語に切り替え',
    ja: '한국어로 전환', ko: '切换到中文'
  };

  function navLang() {
    var nav = '';
    try { nav = (navigator.language || 'zh').toLowerCase(); } catch (e) {}
    if (nav.indexOf('zh') === 0) return 'zh';
    if (nav.indexOf('ja') === 0) return 'ja';
    if (nav.indexOf('ko') === 0) return 'ko';
    return 'en';
  }

  function getLang() {
    try {
      var m = /[?&]lang=(zh|en|ja|ko)\b/.exec(location.search || '');
      if (m) return m[1];
      var saved = localStorage.getItem('amg-lang');
      if (LANGS.indexOf(saved) >= 0) return saved;
      return navLang();
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

  // Lookup with fallback chain: lang -> en -> zh.
  function t(dict, key) {
    if (!dict) return key;
    if (dict[lang] && dict[lang][key] !== undefined) return dict[lang][key];
    if (lang !== 'en' && dict.en && dict.en[key] !== undefined) return dict.en[key];
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
    try { document.documentElement.lang = lang === 'zh' ? 'zh-CN' : lang; } catch (e) {}
    var els = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < els.length; i++) {
      els[i].textContent = t(dict, els[i].getAttribute('data-i18n'));
    }
  }

  // Language cycle button (zh -> en -> ja -> ko). Prefers .brand-btns,
  // else fixed top-right.
  function mountBtn() {
    var btn = document.createElement('button');
    btn.id = 'amg-lang-btn';
    btn.className = 'icon-btn';
    btn.textContent = NEXT_LABEL[lang] || 'EN';
    btn.title = NEXT_TITLE[lang] || 'Switch language';
    btn.style.minWidth = '52px';
    btn.onclick = function () {
      setLang(LANGS[(LANGS.indexOf(lang) + 1) % LANGS.length]);
    };
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

  window.AMG = { lang: lang, getLang: getLang, setLang: setLang, t: t, tf: tf, apply: apply, mountBtn: mountBtn, mountHome: mountHome };

  // ---- Home button (back to landing page) ----
  // Anchor normalizer: <button> centers its glyph natively, <a> does not.
  function injectHomeCss() {
    if (document.getElementById('amg-home-css')) return;
    var st = document.createElement('style');
    st.id = 'amg-home-css';
    st.textContent = '.amg-home{text-decoration:none!important;display:inline-flex!important;'
      + 'align-items:center;justify-content:center;min-width:44px;}';
    document.head.appendChild(st);
  }

  function mountHome() {
    if (document.querySelector('.amg-home')) return null;
    injectHomeCss();
    var a = document.createElement('a');
    a.href = '../?lang=' + lang;
    a.textContent = '🏠';
    var label = lang === 'zh' ? '返回游戏库' : 'Back to game library';
    a.title = label;
    a.setAttribute('aria-label', label);
    var host = document.querySelector('.brand-btns') || document.querySelector('.top-links');
    if (host) {
      // .brand-btns pages style it as icon-btn; raiden's .top-links as ghost-btn.
      a.className = (host.classList.contains('brand-btns') ? 'icon-btn' : 'ghost-btn') + ' amg-home';
      host.insertBefore(a, host.firstChild);
    } else {
      a.className = 'amg-home';
      a.style.cssText = 'position:fixed;top:12px;left:12px;z-index:99;font-size:20px;'
        + 'background:rgba(20,28,48,.9);color:#fff;border:1px solid rgba(148,163,184,.4);'
        + 'border-radius:12px;width:46px;height:46px;cursor:pointer;';
      document.body.appendChild(a);
    }
    return a;
  }

  // Auto-mount so games need zero edits. Runs after parse so .brand-btns exists.
  // game.js files call mountBtn() synchronously during parse, therefore the
  // home link (inserted later, before firstChild) ends up leftmost: 🏠 EN 🔊.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountHome);
  } else {
    mountHome();
  }
})();
