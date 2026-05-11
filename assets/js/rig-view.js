/**
 * rig-view.js — Maya-style technical overlay toggle.
 *
 * Tags meaningful nodes with [data-rig-label] and renders a live HUD
 * (mouse coords, scroll %, viewport size, current section, FPS).
 *
 * Toggle:
 *   - click on .rig-toggle (bottom right)
 *   - keyboard 'R' (ignored inside inputs)
 *   - persists in localStorage
 */

const STORAGE_KEY = 'portfolio.rig-view';

// Curated label map — only meaningful "control nodes", not slivers/cursors/masks.
// [selector, baseLabel, opts?]
//   opts.below = label rendered below element (for elements near viewport top)
//   opts.inside = label rendered inside top-left corner instead of outside
const LABEL_MAP = [
  ['.hero__title em',          'character_ctrl',  { below: true }],
  ['.hero__pretitle',          'subtitle_loc'],
  ['.hero__sub',               'bio_node'],
  ['.btn.btn--ox',             'cta_primary',     { below: true }],
  ['.btn.btn--ghost',          'cta_ghost',       { below: true }],
  ['.section-heading__num',    'section_index'],
  ['.section-heading__title',  'section_label'],
  ['.project-card',            'project_geo'],
  ['.project-card__title',     'project_label'],
  ['.tool-tile',               'tool_ctrl'],
  ['.contact__channel-value',  'contact_attr'],
  ['.showreel__cta-title',     'showreel_root'],
  ['.footer__cta-text',        'footer_cta'],
];

function tagElements() {
  LABEL_MAP.forEach(([selector, base, opts = {}]) => {
    const els = document.querySelectorAll(selector);
    els.forEach((el, i) => {
      if (el.dataset.rigLabel) return;
      const suffix = els.length === 1
        ? ''
        : i === 0 ? '_L' : i === 1 ? '_R' : `_${String(i).padStart(2, '0')}`;
      el.dataset.rigLabel = base + suffix;
      if (opts.below) el.dataset.rigLabelPos = 'below';
      if (opts.inside) el.dataset.rigLabelPos = 'inside';
    });
  });
}

function buildToggle() {
  const btn = document.createElement('button');
  btn.className = 'rig-toggle';
  btn.type = 'button';
  btn.setAttribute('aria-pressed', 'false');
  btn.setAttribute('aria-label', 'Toggle rig view');
  btn.innerHTML = `
    <span class="rig-toggle__indicator" aria-hidden="true"></span>
    <span class="rig-toggle__label">rig view</span>
    <span class="rig-toggle__hint" aria-hidden="true">[R]</span>
  `;
  document.body.appendChild(btn);
  return btn;
}

// ── Live HUD: mouse coords, scroll %, viewport, section, FPS ────────────────

let hudEl = null;
let hudRafId = null;
let mx = 0;
let my = 0;
let lastFrameTs = performance.now();
let fps = 60;
let fpsSmoothed = 60;
let hudVisible = false;

function buildHUD() {
  if (hudEl) return hudEl;
  const el = document.createElement('div');
  el.className = 'rig-hud';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `
    <div class="rig-hud__row"><span class="rig-hud__k">cursor</span><span class="rig-hud__v" data-hud="cursor">0000, 0000</span></div>
    <div class="rig-hud__row"><span class="rig-hud__k">viewport</span><span class="rig-hud__v" data-hud="vp">0000 × 0000</span></div>
    <div class="rig-hud__row"><span class="rig-hud__k">scroll</span><span class="rig-hud__v" data-hud="scroll">000%</span></div>
    <div class="rig-hud__row"><span class="rig-hud__k">section</span><span class="rig-hud__v" data-hud="section">root</span></div>
    <div class="rig-hud__row"><span class="rig-hud__k">fps</span><span class="rig-hud__v" data-hud="fps">60</span></div>
  `;
  document.body.appendChild(el);
  hudEl = el;
  return el;
}

function pad(n, w) { return String(n).padStart(w, '0'); }

function currentSection() {
  // Find the section closest to top of viewport
  const sections = document.querySelectorAll('section[id], section[aria-label], main, footer, .hero');
  let best = 'root';
  let bestY = Infinity;
  sections.forEach((s) => {
    const r = s.getBoundingClientRect();
    if (r.top <= 80 && r.bottom > 80 && r.top > -10_000) {
      const dist = Math.abs(r.top - 80);
      if (dist < bestY) {
        bestY = dist;
        best = s.id || s.getAttribute('aria-label') || s.className.split(' ')[0] || s.tagName.toLowerCase();
      }
    }
  });
  return best.toLowerCase().slice(0, 16);
}

function tickHUD(now) {
  hudRafId = null;
  if (!hudVisible || !hudEl) return;

  // FPS (smoothed)
  const dt = now - lastFrameTs;
  lastFrameTs = now;
  fps = 1000 / dt;
  fpsSmoothed = fpsSmoothed * 0.92 + fps * 0.08;

  // Scroll %
  const max = document.documentElement.scrollHeight - window.innerHeight;
  const sp = max > 0 ? Math.round((window.scrollY / max) * 100) : 0;

  const cursorEl = hudEl.querySelector('[data-hud="cursor"]');
  const vpEl = hudEl.querySelector('[data-hud="vp"]');
  const scrollEl = hudEl.querySelector('[data-hud="scroll"]');
  const sectionEl = hudEl.querySelector('[data-hud="section"]');
  const fpsEl = hudEl.querySelector('[data-hud="fps"]');

  if (cursorEl) cursorEl.textContent = `${pad(Math.round(mx), 4)}, ${pad(Math.round(my), 4)}`;
  if (vpEl) vpEl.textContent = `${pad(window.innerWidth, 4)} × ${pad(window.innerHeight, 4)}`;
  if (scrollEl) scrollEl.textContent = `${pad(sp, 3)}%`;
  if (sectionEl) sectionEl.textContent = currentSection();
  if (fpsEl) {
    fpsEl.textContent = String(Math.round(fpsSmoothed));
    fpsEl.classList.toggle('rig-hud__v--warn', fpsSmoothed < 45);
  }

  hudRafId = requestAnimationFrame(tickHUD);
}

function startHUD() {
  if (hudVisible) return;
  hudVisible = true;
  buildHUD();
  hudEl?.classList.add('is-visible');
  lastFrameTs = performance.now();
  if (!hudRafId) hudRafId = requestAnimationFrame(tickHUD);
}

function stopHUD() {
  hudVisible = false;
  if (hudRafId) { cancelAnimationFrame(hudRafId); hudRafId = null; }
  hudEl?.classList.remove('is-visible');
}

function setActive(active, btn) {
  document.body.classList.toggle('rig-view', active);
  btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  if (active) startHUD(); else stopHUD();
  try { localStorage.setItem(STORAGE_KEY, active ? '1' : '0'); } catch { /* ignore */ }
}

export function initRigView() {
  tagElements();
  const btn = buildToggle();

  // Mouse tracking (cheap — always on, only consumed when HUD visible)
  document.addEventListener('mousemove', (e) => {
    mx = e.clientX;
    my = e.clientY;
  }, { passive: true });

  // Restore previous state
  let initial = false;
  try { initial = localStorage.getItem(STORAGE_KEY) === '1'; } catch { /* ignore */ }
  if (initial) setActive(true, btn);

  btn.addEventListener('click', () => {
    setActive(!document.body.classList.contains('rig-view'), btn);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'r' && e.key !== 'R') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    const tag = t?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || t?.isContentEditable) return;
    setActive(!document.body.classList.contains('rig-view'), btn);
  });
}
