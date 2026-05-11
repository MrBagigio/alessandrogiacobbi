/**
 * rig-view.js — Toggle "rig view": Maya-style technical overlay.
 *
 *  - Adds outlines + control labels to interactive elements
 *  - Persists state in localStorage
 *  - Keyboard shortcut: press 'R' anywhere (except inputs) to toggle
 *
 * The visual layer is pure CSS (body.rig-view). This module only tags
 * elements with data-rig-label and renders the toggle UI.
 */

const STORAGE_KEY = 'portfolio.rig-view';

// [selector, baseLabel] — index suffix appended if multiple matches.
const LABEL_MAP = [
  ['.hero__title em',           'character_ctrl'],
  ['.hero__title .reveal-mask', 'title_mask'],
  ['.hero__pretitle',           'subtitle_loc'],
  ['.hero__sub',                'bio_node'],
  ['.btn.btn--ox',              'cta_primary'],
  ['.btn.btn--ghost',           'cta_ghost'],
  ['.meta-bar',                 'hud_overlay'],
  ['.meta-clock',               'clock_display'],
  ['.section-heading',          'section_grp'],
  ['.section-heading__num',     'section_index'],
  ['.section-heading__title',   'section_label'],
  ['.project-card',             'project_geo'],
  ['.project-card__title',      'project_label'],
  ['.tool-tile',                'tool_ctrl'],
  ['.toolkit__label',           'toolkit_label'],
  ['.contact__channel-value',   'contact_attr'],
  ['.footer',                   'footer_root'],
  ['.scroll-progress',          'scroll_bar'],
  ['.cursor-dot',               'cursor_dot'],
  ['.cursor-ring',              'cursor_ring'],
];

function tagElements() {
  LABEL_MAP.forEach(([selector, base]) => {
    const els = document.querySelectorAll(selector);
    els.forEach((el, i) => {
      if (el.dataset.rigLabel) return; // already tagged
      const idx = String(i).padStart(2, '0');
      const sideSuffix = i === 0 ? 'L' : i === 1 ? 'R' : `${idx}`;
      el.dataset.rigLabel = els.length > 1
        ? `${base}_${sideSuffix}`
        : base;
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

function setActive(active, btn) {
  document.body.classList.toggle('rig-view', active);
  btn.setAttribute('aria-pressed', active ? 'true' : 'false');
  try {
    localStorage.setItem(STORAGE_KEY, active ? '1' : '0');
  } catch { /* localStorage disabled — fail silent */ }
}

export function initRigView() {
  tagElements();
  const btn = buildToggle();

  // Restore previous state
  let initial = false;
  try {
    initial = localStorage.getItem(STORAGE_KEY) === '1';
  } catch { /* ignore */ }
  if (initial) setActive(true, btn);

  btn.addEventListener('click', () => {
    setActive(!document.body.classList.contains('rig-view'), btn);
  });

  // Keyboard shortcut: 'R' toggles (ignore when typing in input/textarea)
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'r' && e.key !== 'R') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    const tag = t?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || t?.isContentEditable) return;
    setActive(!document.body.classList.contains('rig-view'), btn);
  });
}
