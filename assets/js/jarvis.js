/**
 * jarvis.js — JARVIS-style status pings.
 *
 * Emits ephemeral micro-toasts (top-right) on key events:
 *   - boot complete (2.4s after load)
 *   - first scroll
 *   - section enters viewport (each major section, once)
 *   - rig view toggled on/off
 *   - konami debug mode unlocked
 *   - 25% / 50% / 75% scroll milestones
 *
 * Pings are queued — they don't pile up on screen, they auto-replace.
 */

const queue = [];
let active = false;
const sectionsSeen = new Set();

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/** Public API — push a ping into the queue. */
export function ping(text, opts = {}) {
  queue.push({ text, kind: opts.kind || 'info', duration: opts.duration ?? 2400 });
  if (!active) flush();
}

async function flush() {
  active = true;
  while (queue.length) {
    const { text, kind, duration } = queue.shift();
    const el = render(text, kind);
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('is-visible'));
    await sleep(duration);
    el.classList.remove('is-visible');
    await sleep(260);
    el.remove();
  }
  active = false;
}

function render(text, kind) {
  const el = document.createElement('div');
  el.className = `jarvis-ping jarvis-ping--${kind}`;
  el.innerHTML = `
    <span class="jarvis-ping__dot" aria-hidden="true"></span>
    <span class="jarvis-ping__ts">${stamp()}</span>
    <span class="jarvis-ping__text">${text}</span>
  `;
  return el;
}

function stamp() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

export function initJarvis() {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return;

  // Boot complete ping (after loader fade)
  window.addEventListener('load', () => {
    setTimeout(() => ping('scene rendered · ready', { kind: 'ok' }), 2200);
    setTimeout(() => ping('telemetry online'), 3600);
  });

  // First scroll
  let firstScroll = false;
  window.addEventListener('scroll', () => {
    if (firstScroll) return;
    firstScroll = true;
    ping('input · scroll engaged');
  }, { passive: true, once: false });

  // Scroll milestones (25/50/75/95%)
  const milestones = [
    [25, 'archive · 25% indexed'],
    [50, 'archive · 50% indexed'],
    [75, 'archive · 75% indexed'],
    [95, 'archive · scan complete'],
  ];
  const milestonesFired = new Set();
  window.addEventListener('scroll', () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (max <= 0) return;
    const pct = (window.scrollY / max) * 100;
    milestones.forEach(([threshold, msg]) => {
      if (pct >= threshold && !milestonesFired.has(threshold)) {
        milestonesFired.add(threshold);
        ping(msg);
      }
    });
  }, { passive: true });

  // Section entry pings — observe sections with a recognizable identity
  if ('IntersectionObserver' in window) {
    const targets = document.querySelectorAll(
      '.section-heading, .hero, .contact, .footer__cta-text, .showreel'
    );
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const el = entry.target;
        const name = labelFor(el);
        if (sectionsSeen.has(name)) return;
        sectionsSeen.add(name);
        ping(`section · ${name}`, { duration: 2200 });
      });
    }, { threshold: 0.35 });
    targets.forEach((t) => io.observe(t));
  }
}

function labelFor(el) {
  // Try the section title first, fall back to class slug
  const heading = el.querySelector('.section-heading__title, .hero__pretitle, .contact__pretitle, .showreel__cta-title, .footer__cta-pretitle');
  if (heading) {
    return heading.textContent.trim().toLowerCase().replace(/[^\w\s]/g, '').slice(0, 30);
  }
  return el.className.split(' ')[0].replace(/[-_]/g, ' ');
}

// ── Section scan-in (corner brackets + sweep line on first viewport entry) ──
export function initSectionScan() {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return;
  if (!('IntersectionObserver' in window)) return;

  const targets = document.querySelectorAll(
    'section[aria-label], .work, .toolkit, .showreel, .contact, .web-design, .footer__cta'
  );
  if (!targets.length) return;

  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      if (el.dataset.scanned === '1') return;
      el.dataset.scanned = '1';
      el.classList.add('rig-scan-in');
      setTimeout(() => el.classList.remove('rig-scan-in'), 1600);
      io.unobserve(el);
    });
  }, { threshold: 0.18 });

  targets.forEach((t) => io.observe(t));
}
