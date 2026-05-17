// About — animated stat counters (scroll-triggered, ease-out cubic).
// Respects prefers-reduced-motion: shows final value instantly.

const DURATION_MS = 1400;
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

function animate(el, target) {
  const start = performance.now();
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) {
    el.textContent = String(target);
    return;
  }
  const tick = (now) => {
    const t = Math.min(1, (now - start) / DURATION_MS);
    el.textContent = String(Math.round(easeOutCubic(t) * target));
    if (t < 1) requestAnimationFrame(tick);
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
      if (!Number.isNaN(target)) el.textContent = String(target);
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
