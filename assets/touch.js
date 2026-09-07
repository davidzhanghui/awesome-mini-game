/* AMG touch helper — shared by games with on-screen touch controls.
 * Zero dependencies. Adds `is-touch` to <body> when the device has a
 * coarse pointer or touch input, so games can show their `#touch`
 * overlay even when the `(pointer:coarse)` media query doesn't match
 * (e.g. touch laptops, some devtools emulation, hybrid devices).
 * Include after i18n.js on pages that have a #touch overlay:
 *   <script src="../assets/touch.js?v=20260908"></script>
 */
(function () {
  'use strict';
  try {
    var coarse = window.matchMedia &&
      (window.matchMedia('(pointer:coarse)').matches ||
        window.matchMedia('(hover:none)').matches);
    var hasTouch = ('ontouchstart' in window) ||
      (navigator.maxTouchPoints > 0) ||
      (navigator.msMaxTouchPoints > 0);
    if (coarse || hasTouch) document.body.classList.add('is-touch');
  } catch (_) { /* no-touch fallback: overlay stays hidden */ }
})();
