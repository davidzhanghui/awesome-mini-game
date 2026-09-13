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
  var LANG_LABEL = { zh: '中文', en: 'EN', ja: '日本語', ko: '한국어' };
  var LANG_TITLE = {
    zh: '切换语言', en: 'Switch language',
    ja: '言語を切り替え', ko: '언어 변경'
  };

  // Default language is English. ?lang= > localStorage > en.
  function getLang() {
    try {
      var m = /[?&]lang=(zh|en|ja|ko)\b/.exec(location.search || '');
      if (m) return m[1];
      var saved = localStorage.getItem('amg-lang');
      if (LANGS.indexOf(saved) >= 0) return saved;
      return 'en';
    } catch (e) {
      return 'en';
    }
  }

  var lang = getLang();

  function setLang(next) {
    try { localStorage.setItem('amg-lang', next); } catch (e) {}
    var url = new URL(location.href);
    url.searchParams.set('lang', next);
    location.href = url.toString();
  }

  // No-reload switch for game pages (same UX as the landing page).
  // Updates ?lang= via replaceState and delegates DOM refresh to the game
  // via window.__refreshLang (games define it next to their boot code).
  // Canvas/event texts already read T() live, so they need no handling.
  function setLangLive(next) {
    lang = next;
    window.AMG.lang = next;
    try { localStorage.setItem('amg-lang', next); } catch (e) {}
    try {
      var url = new URL(location.href);
      url.searchParams.set('lang', next);
      history.replaceState(null, '', url.toString());
    } catch (e) {}
    var f = window.__refreshLang;
    if (typeof f === 'function') {
      try { f(); } catch (e) {}
    }
    var sel = document.getElementById('amg-lang-btn');
    if (sel && sel.tagName === 'SELECT') sel.value = next;
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

  // Language dropdown. Prefers .brand-btns, else fixed top-right.
  function mountBtn() {
    var old = document.getElementById('amg-lang-btn');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var sel = document.createElement('select');
    sel.id = 'amg-lang-btn';
    sel.className = 'icon-btn';
    sel.title = LANG_TITLE[lang] || 'Switch language';
    sel.style.minWidth = '0';
    for (var i = 0; i < LANGS.length; i++) {
      var op = document.createElement('option');
      op.value = LANGS[i];
      op.textContent = LANG_LABEL[LANGS[i]];
      sel.appendChild(op);
    }
    sel.value = lang;
    sel.onchange = function () { setLangLive(sel.value); };
    var host = document.querySelector('.brand-btns');
    if (host) {
      host.insertBefore(sel, host.firstChild);
    } else {
      sel.style.cssText = 'position:fixed;top:12px;right:12px;z-index:99;'
        + 'background:rgba(20,28,48,.9);color:#fff;border:1px solid rgba(148,163,184,.4);'
        + 'border-radius:10px;padding:8px 12px;font-size:13px;font-weight:700;cursor:pointer;';
      document.body.appendChild(sel);
    }
  }

  window.AMG = { lang: lang, getLang: getLang, setLang: setLang, setLangLive: setLangLive, t: t, tf: tf, apply: apply, mountBtn: mountBtn, mountHome: mountHome };

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
    var label = lang === 'zh' ? '返回游戏库' : lang === 'ja' ? 'ゲーム一覧へ戻る' :
      lang === 'ko' ? '게임 목록으로' : 'Back to game library';
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
