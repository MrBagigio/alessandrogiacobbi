// About — animated stat counters (scroll-triggered, ease-out cubic).
// Honors data-count and optional data-suffix (e.g. "%").
// Respects prefers-reduced-motion: shows final value instantly.

const DURATION_MS = 1400;
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

/* Counters still mid-flight, so we can snap them to their final value if the
   tab goes hidden (rAF is suspended in background tabs — without this the
   observer has already unobserved and the number stays frozen at 0 forever). */
const pending = new Map(); // el -> "8" | "65%"

function finalize(el) {
  const final = pending.get(el);
  if (final === undefined) return;
  el.textContent = final;
  pending.delete(el);
}

function finalizeAllIfHidden() {
  if (!document.hidden) return;
  [...pending.keys()].forEach(finalize);
}
document.addEventListener('visibilitychange', finalizeAllIfHidden);

function animate(el, target) {
  const start = performance.now();
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // data-suffix (e.g. "%") was being silently dropped — the 65% mutation stat
  // rendered as a bare "65". Append it on every frame, final value included.
  const suffix = el.dataset.suffix || '';
  const final = String(target) + suffix;

  // No animation when motion is reduced, or when the tab is hidden (rAF would
  // never tick and the value would stay stuck at its initial 0).
  if (reduced || document.hidden) {
    el.textContent = final;
    return;
  }

  pending.set(el, final);
  const tick = (now) => {
    if (!pending.has(el)) return;            // finalized by visibilitychange
    const t = Math.min(1, (now - start) / DURATION_MS);
    el.textContent = String(Math.round(easeOutCubic(t) * target)) + suffix;
    if (t < 1) {
      requestAnimationFrame(tick);
    } else {
      pending.delete(el);
    }
  };
  requestAnimationFrame(tick);
}

export function initAboutStats(root = document) {
  const nodes = root.querySelectorAll('.about__stat-num[data-count]');
  if (!nodes.length) return;

  // Fallback: if IntersectionObserver missing, set values immediately.
  if (!('IntersectionObserver' in window)) {
    nodes.forEach((el) => {
      const target = parseInt(el.dataset.count, 10);
      if (!Number.isNaN(target)) el.textContent = String(target) + (el.dataset.suffix || '');
    });
    return;
  }

  const io = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      const target = parseInt(el.dataset.count, 10);
      if (Number.isNaN(target)) {
        observer.unobserve(el);
        return;
      }
      animate(el, target);
      observer.unobserve(el);
    });
  }, { threshold: 0.45, rootMargin: '0px 0px -10% 0px' });

  nodes.forEach((el) => io.observe(el));
}
