/**
 * anchors.js — in-page anchor links done right.
 *
 * The old handler intercepted EVERY a[href^="#"] (skip-link included),
 * called preventDefault() and scrollIntoView({smooth}) and nothing else:
 *  - the skip link never moved focus into <main> (next Tab landed back in the
 *    header — WCAG 2.4.1 bypass blocks broken), and its :focus pill stayed
 *    pinned on screen;
 *  - About/Contact/CTAs never updated the URL hash (no Back, no deep link);
 *  - smooth scrolling was forced under prefers-reduced-motion.
 *
 * Now: skip-links are left to the browser (native fragment navigation sets
 * the hash AND the sequential-focus start point); every other anchor scrolls
 * (smooth unless reduced motion), moves focus to the target (tabindex=-1,
 * preventScroll so the focus call doesn't cancel the smooth scroll) and
 * pushes the hash.
 */
export function initAnchorLinks(root = document, { reduced = false } = {}) {
  root.querySelectorAll('a[href^="#"]:not(.skip-link)').forEach((a) => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href');
      if (!id || id.length < 2) return;                       // bare "#": native
      let target = null;
      try { target = root.querySelector(id); } catch (_) { return; }   // not a valid selector: native
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
      if (location.hash !== id) history.pushState(null, '', id);
    });
  });
}
