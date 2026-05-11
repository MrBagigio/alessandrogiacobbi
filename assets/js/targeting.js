/**
 * targeting.js — Iron Man hover reticle.
 *
 * When the user hovers an interactive element (btn / card / tile / link),
 * 4 oxblood corner brackets snap to its bounds with a "LOCK · {coords}" label.
 * Brackets follow position on scroll/resize via rAF.
 *
 * Honors prefers-reduced-motion (skips entirely).
 */

const SELECTORS = [
  '.btn',
  '.project-card',
  '.tool-tile',
  '.project-card__media',
  '.case-card',
  '.contact__channel-link',
  '.contact__channel-value',
  'a[href]:not(.skip-link)',
  '.rig-toggle',
].join(',');

const PADDING = 6;       // px outside element edges
const BRACKET = 12;      // px corner bracket arm length

let hud = null;
let target = null;
let rafId = null;

function build() {
  const root = document.createElement('div');
  root.className = 'rig-target';
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML = `
    <span class="rig-target__corner rig-target__corner--tl"></span>
    <span class="rig-target__corner rig-target__corner--tr"></span>
    <span class="rig-target__corner rig-target__corner--bl"></span>
    <span class="rig-target__corner rig-target__corner--br"></span>
    <span class="rig-target__label">
      <span class="rig-target__tag">LOCK</span>
      <span class="rig-target__coord">0000, 0000</span>
    </span>
  `;
  root.style.setProperty('--bracket-len', `${BRACKET}px`);
  document.body.appendChild(root);
  return root;
}

function follow() {
  rafId = null;
  if (!target || !hud) return;
  const r = target.getBoundingClientRect();
  // Skip if element is off-screen or zero-sized
  if (r.width === 0 || r.height === 0) return;
  hud.style.transform = `translate(${r.left - PADDING}px, ${r.top - PADDING}px)`;
  hud.style.width = `${r.width + PADDING * 2}px`;
  hud.style.height = `${r.height + PADDING * 2}px`;
  // Coord readout (relative to viewport, padded 4 digits each)
  const coord = hud.querySelector('.rig-target__coord');
  if (coord) {
    coord.textContent =
      `${String(Math.round(r.left)).padStart(4, '0')}, ` +
      `${String(Math.round(r.top)).padStart(4, '0')}`;
  }
  rafId = requestAnimationFrame(follow);
}

function activate(el) {
  if (target === el) return;
  target = el;
  hud.classList.add('is-active');
  // Tag-specific label
  const tag = el.matches('.btn') ? 'TGT'
            : el.matches('.project-card, .project-card__media, .case-card') ? 'SCAN'
            : el.matches('.tool-tile') ? 'TOOL'
            : 'LOCK';
  const tagEl = hud.querySelector('.rig-target__tag');
  if (tagEl) tagEl.textContent = tag;
  if (!rafId) rafId = requestAnimationFrame(follow);
}

function deactivate() {
  target = null;
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  hud?.classList.remove('is-active');
}

export function initTargeting() {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = window.matchMedia('(pointer: fine)').matches;
  const wide = window.matchMedia('(min-width: 1024px)').matches;
  if (reduced || !fine || !wide) return;

  hud = build();

  // mouseover/mouseout bubble — single document-level listener is enough
  document.addEventListener('mouseover', (e) => {
    const t = e.target.closest(SELECTORS);
    if (!t) return;
    activate(t);
  });

  document.addEventListener('mouseout', (e) => {
    if (!target) return;
    // Stay locked if moving to a child of the current target
    if (target.contains(e.relatedTarget)) return;
    // Stay locked if moving to another interactive element (it'll re-trigger mouseover)
    const next = e.relatedTarget?.closest?.(SELECTORS);
    if (next && next !== target) return;
    deactivate();
  });

  // Hide target on scroll start (re-locks on next mouseover)
  let scrollTimer = null;
  window.addEventListener('scroll', () => {
    if (!target) return;
    if (scrollTimer) clearTimeout(scrollTimer);
    hud.classList.add('is-translating');
    scrollTimer = setTimeout(() => hud.classList.remove('is-translating'), 120);
  }, { passive: true });
}
