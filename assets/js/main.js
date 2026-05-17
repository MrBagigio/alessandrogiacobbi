/**
 * Bootstrap — entry point.
 * Loads GSAP via CDN, initializes scenes, cursor, lazy, scroll triggers.
 */
import { HeroScene } from './scene-hero.js?v=20260516-perf';
import { BgScene } from './scene-bg.js?v=20260516-perf';
import { Cursor } from './cursor.js?v=20260516-perf';
import { initLazyMedia } from './lazy.js?v=20260516-perf';
import { initTextFx } from './text-fx.js?v=20260516-perf';
import { initMagneticAuto } from './magnetic-letters.js?v=20260516-perf';
import { runBootSequence } from './boot.js?v=20260516-perf';
import { initRigView } from './rig-view.js?v=20260516-perf';
import { initInteractions } from './interactions.js?v=20260516-perf';
import { initTargeting } from './targeting.js?v=20260516-perf';
import { initJarvis, initSectionScan, ping } from './jarvis.js?v=20260516-perf';
import { initSysStrip } from './sys-strip.js?v=20260516-perf';
import { initVideoHud } from './video-hud.js?v=20260516-perf';
import { initXrayLens } from './xray-lens.js?v=20260516-perf';
// import { AsteroidCursor } from './asteroid-cursor.js?v=20260516-perf'; // disabled — keep file for future

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// 1. Boot sequence — typewriter terminal on landing, simple fade on project pages
window.addEventListener('load', () => {
  const hasBootMarkup = !!document.querySelector('.loader__boot');
  if (hasBootMarkup) {
    runBootSequence();
  } else {
    setTimeout(() => {
      document.querySelector('.loader')?.classList.add('is-loaded');
    }, 400);
  }
});

// 2. Clock in meta-bar
function updateClock() {
  const el = document.querySelector('.meta-clock');
  if (!el) return;
  const d = new Date();
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  el.textContent = `${h}:${m} CET`;
}
updateClock();
setInterval(updateClock, 30_000);

// 3. Scroll progress bar
const progress = document.querySelector('.scroll-progress');
if (progress) {
  window.addEventListener('scroll', () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const pct = (window.scrollY / max) * 100;
    progress.style.width = `${Math.min(pct, 100)}%`;
  }, { passive: true });
}

// 4. Three.js scenes (skip on reduced-motion)
if (!reduced) {
  const heroCanvas = document.querySelector('.hero__canvas');
  if (heroCanvas) new HeroScene(heroCanvas);

  const bgCanvas = document.querySelector('.contact__canvas');
  if (bgCanvas) new BgScene(bgCanvas);
}

// 5. Cursor — classic CSS magnetic dot+ring (asteroid/ship temporarily disabled)
//    To re-enable ship morph: replace `new Cursor()` with `new AsteroidCursor('asteroid-cursor')`
const isFinePointer = window.matchMedia('(pointer: fine)').matches;
const isWideScreen = window.matchMedia('(min-width: 1024px)').matches;

if (!reduced && isFinePointer && isWideScreen) {
  new Cursor();
}

// 6. Lazy load
initLazyMedia();

// 7. Reveal animations via IntersectionObserver (no GSAP dependency required)
const revealEls = document.querySelectorAll('.reveal-up, .reveal-mask, .img-reveal, .char-reveal');
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-revealed');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -10% 0px' });
  revealEls.forEach((el) => io.observe(el));
}

// 8. Smooth anchor links
document.querySelectorAll('a[href^="#"]').forEach((a) => {
  a.addEventListener('click', (e) => {
    const id = a.getAttribute('href');
    if (id.length > 1) {
      const target = document.querySelector(id);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  });
});

// 9. Magnetic buttons
if (!reduced && window.matchMedia('(min-width: 1024px)').matches) {
  document.querySelectorAll('.btn').forEach((btn) => {
    btn.addEventListener('mousemove', (e) => {
      const r = btn.getBoundingClientRect();
      const x = e.clientX - r.left - r.width / 2;
      const y = e.clientY - r.top - r.height / 2;
      btn.style.transform = `translate(${x * 0.18}px, ${y * 0.18}px)`;
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.transform = '';
    });
  });

  // 9b. 3D tilt cards (project cards) — mouse-tracked rotateX/Y + translateZ
  document.querySelectorAll('.project-card').forEach((card) => {
    const media = card.querySelector('.project-card__media');
    if (!media) return;

    let rafId = null;
    let resetTimer = null;
    let target = { rx: 0, ry: 0 };
    let current = { rx: 0, ry: 0 };
    let cachedRect = null;

    const update = () => {
      current.rx += (target.rx - current.rx) * 0.12;
      current.ry += (target.ry - current.ry) * 0.12;
      media.style.transform = `translateZ(24px) scale(1.015) rotateX(${current.rx}deg) rotateY(${current.ry}deg)`;
      if (Math.abs(target.rx - current.rx) > 0.01 || Math.abs(target.ry - current.ry) > 0.01) {
        rafId = requestAnimationFrame(update);
      } else {
        rafId = null;
      }
    };

    card.addEventListener('mouseenter', () => {
      // Cache rect once per hover session — invalidated on mouseleave + resize
      cachedRect = card.getBoundingClientRect();
      // Cancel any pending reset from a previous mouseleave (B1 race fix)
      if (resetTimer) { clearTimeout(resetTimer); resetTimer = null; }
    });

    card.addEventListener('mousemove', (e) => {
      const r = cachedRect || card.getBoundingClientRect();
      const cx = e.clientX - r.left - r.width / 2;
      const cy = e.clientY - r.top - r.height / 2;
      target.rx = -(cy / r.height) * 7;
      target.ry =  (cx / r.width) * 7;
      if (!rafId) rafId = requestAnimationFrame(update);
    });

    card.addEventListener('mouseleave', () => {
      target.rx = 0;
      target.ry = 0;
      cachedRect = null;
      // Replace blind setTimeout with named handle so re-enter can cancel it
      resetTimer = setTimeout(() => {
        media.style.transform = '';
        resetTimer = null;
      }, 250);
      if (!rafId) rafId = requestAnimationFrame(update);
    });
  });
}

// 9c. Magnetic letters PRIMA — split text in per-char spans
initMagneticAuto();

// 9d. Text FX — scramble + glitch (skip elementi data-magnetic per evitare conflitti)
initTextFx();

// 9e. Rig view toggle — Maya-style technical overlay (every page)
initRigView();

// 9f. Interactions — click ripple + konami easter egg
initInteractions();

// 9g. Targeting reticle — corner brackets on hover (Iron Man lock)
initTargeting();

// 9h. JARVIS pings — ephemeral status toasts on events
initJarvis();

// 9i. Section scan-in — corner brackets + sweep on viewport entry
initSectionScan();

// 9k. System telemetry strip — top-of-page live HUD (THE "Stark mode" signal)
initSysStrip();

// 9l. Per-clip video HUD readouts (TC / frame / diagnostic line)
initVideoHud();

// 9m. X-ray lens — dual-video reveal interaction on .project-xray containers
initXrayLens();

// 9j. Cross-module ping wire — rig view toggle fires a JARVIS ping
let _lastRigState = document.body.classList.contains('rig-view');
const _rigToggleObserver = new MutationObserver(() => {
  const active = document.body.classList.contains('rig-view');
  if (active === _lastRigState) return;
  _lastRigState = active;
  ping(active ? 'rig view · engaged' : 'rig view · disengaged', { kind: active ? 'ok' : 'info' });
});
_rigToggleObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

// 10. Char-reveal init — split text into spans on .char-reveal.
// Batch via DocumentFragment so each element only triggers one layout/paint
// (was N appendChild → N reflows).
document.querySelectorAll('.char-reveal').forEach((el) => {
  const text = el.textContent;
  const frag = document.createDocumentFragment();
  const words = text.split(/(\s+)/);
  let charIdx = 0;
  words.forEach((w) => {
    if (/^\s+$/.test(w)) {
      frag.appendChild(document.createTextNode(' '));
      return;
    }
    for (const c of w) {
      const span = document.createElement('span');
      span.className = 'char-reveal__inner';
      span.style.transitionDelay = `${charIdx * 18}ms`;
      span.textContent = c;
      frag.appendChild(span);
      charIdx++;
    }
  });
  el.textContent = '';
  el.appendChild(frag);
});
