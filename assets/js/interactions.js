/**
 * interactions.js — UX micro-FX:
 *   1. Click ripple on buttons + project cards (Iron Man HUD-style pulse)
 *   2. Konami code easter egg → "debug mode" flash for 8s (rig view + chromatic)
 *   3. Tab focus indicators (Maya-style)
 *
 * Respects prefers-reduced-motion.
 */

const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
                'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight',
                'b', 'a'];

function initRipple() {
  const targets = '.btn, .project-card, .tool-tile, .rig-toggle, .footer__cta-link';
  document.addEventListener('click', (e) => {
    const t = e.target.closest(targets);
    if (!t) return;
    const r = t.getBoundingClientRect();
    const ripple = document.createElement('span');
    ripple.className = 'fx-ripple';
    const size = Math.max(r.width, r.height) * 1.4;
    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${e.clientX - r.left - size / 2}px`;
    ripple.style.top = `${e.clientY - r.top - size / 2}px`;
    // Element must be position:relative for ripple to anchor; force it
    const cs = getComputedStyle(t);
    if (cs.position === 'static') t.style.position = 'relative';
    if (cs.overflow !== 'hidden' && !t.classList.contains('project-card')) {
      // project-card already overflow:hidden via .project-card__media wrapper
      t.style.overflow = 'hidden';
    }
    t.appendChild(ripple);
    setTimeout(() => ripple.remove(), 620);
  });
}

function initKonami() {
  let pos = 0;
  document.addEventListener('keydown', (e) => {
    const target = KONAMI[pos];
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (key === target) {
      pos++;
      if (pos === KONAMI.length) {
        triggerDebugMode();
        pos = 0;
      }
    } else {
      pos = key === KONAMI[0] ? 1 : 0;
    }
  });
}

function triggerDebugMode() {
  document.body.classList.add('debug-mode', 'rig-view');
  // Spawn a quick "achievement" toast
  const toast = document.createElement('div');
  toast.className = 'fx-debug-toast';
  toast.innerHTML = `
    <span class="fx-debug-toast__tag">EASTER · EGG</span>
    <span class="fx-debug-toast__title">DEBUG MODE UNLOCKED</span>
    <span class="fx-debug-toast__sub">↑↑↓↓←→←→BA — chromatic shift engaged</span>
  `;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('is-visible'));
  setTimeout(() => toast.classList.remove('is-visible'), 6500);
  setTimeout(() => {
    document.body.classList.remove('debug-mode');
    toast.remove();
  }, 8000);
}

export function initInteractions() {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return;
  initRipple();
  initKonami();
}
