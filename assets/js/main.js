/**
 * Bootstrap — entry point.
 * Loads GSAP via CDN, initializes scenes, cursor, lazy, scroll triggers.
 */
import { HeroScene } from './scene-hero.js?v=20260530-arc12';
import { BgScene } from './scene-bg.js?v=20260516-perf';
import { Cursor } from './cursor.js?v=20260530-arc11';
import { initLazyMedia } from './lazy.js?v=20260530-audit3';
import { initTextFx } from './text-fx.js?v=20260530-arc12';
import { initMagneticAuto } from './magnetic-letters.js?v=20260530-fx';
import { initInteractions } from './interactions.js?v=20260530-arc12';
import { initVideoHud } from './video-hud.js?v=20260516-perf';
import { initXrayLens } from './xray-lens.js?v=20260516-perf';
import { initAboutStats } from './about-stats.js?v=20260530-audit4';
import { initArcade } from './arcade.js?v=20260530-arc11';
import { initAnchorLinks } from './anchors.js?v=20260530-arc12';
import { initClock } from './clock.js?v=20260530-arc12';

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ──────────────────────────────────────────────────────────────────────────
 * FX_MAXIMAL — master switch for the "Iron Man / JARVIS" layer.
 *
 * Audit verdict: the technical shell was screaming louder than the work and
 * the 3.3s CRT boot cost real visitors. So the default is now the calm,
 * recruiter-friendly portfolio: 3D scenes + magnetic titles + reveals + cursor.
 *
 * Set to `true` to bring back the full kit (CRT boot, rig-view toggle, sys-strip
 * telemetry, JARVIS pings, targeting reticle, section-scan brackets, ambient
 * glitch). Nothing was deleted — it all still lives in its module.
 * ────────────────────────────────────────────────────────────────────────── */
const FX_MAXIMAL = false;

// 1. Boot sequence — typewriter terminal only in maximal mode; otherwise the
//    loader (if present) just fades fast. Default landing = instant content.
//    boot.js is dynamically imported so the default path never downloads it.
window.addEventListener('load', () => {
  const loader = document.querySelector('.loader');
  if (!loader) return;
  if (FX_MAXIMAL && document.querySelector('.loader__boot')) {
    import('./boot.js?v=20260516-perf').then((m) => m.runBootSequence());
  } else {
    setTimeout(() => loader.classList.add('is-loaded'), 220);
  }
});

// 2. Clock in meta-bar — Europe/Rome with CET/CEST (was the visitor's local
//    time labelled "CET")
initClock();

// 3. Scroll progress bar
const progress = document.querySelector('.scroll-progress');
if (progress) {
  window.addEventListener('scroll', () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const pct = (window.scrollY / max) * 100;
    progress.style.width = `${Math.min(pct, 100)}%`;
  }, { passive: true });
}

// 4. Three.js scenes.
//    Hero tail rig: ALWAYS mounted — under reduced-motion it renders one static
//    frame in rest pose (before this, reduced-motion left the canvas empty,
//    which is worse than still). Drag remains user-initiated so it stays on.
//    Contact particle field: skipped under reduced-motion (pure ambient motion).
const heroCanvas = document.querySelector('.hero__canvas');
if (heroCanvas) new HeroScene(heroCanvas, { animate: !reduced });
if (!reduced) {
  const bgCanvas = document.querySelector('.contact__canvas');
  if (bgCanvas) new BgScene(bgCanvas);
}
// 4b. Manikins on the headline (fig. 02) — ≥768px; on phones the H1 wraps to
//     3 tiny lines and there is no room for them. Loaded lazily after first
//     paint so it never competes with the hero's own LCP.
const heroTitle = document.querySelector('.hero__title');
if (heroTitle && window.matchMedia('(min-width: 768px)').matches && !/[?&]manikins=off/.test(location.search)) {
  const debug = /[?&]manikins=debug/.test(location.search);
  const count = window.matchMedia('(min-width: 1024px)').matches ? 2 : 1;
  requestAnimationFrame(() => {
    import('./rig/manikin-scene.js?v=20260530-arc11').then((m) => {
      window.__manikins = new m.ManikinScene(heroTitle, { count, animate: !reduced, debug });
    }).catch((e) => console.warn('[hero] manikins unavailable:', e?.message || e));
  });
}

// 5. Cursor — magnetic dot + ring. Gated on a FINE pointer (a mouse) and a
//    window ≥640px (a desktop window narrowed to 800px still has a mouse and
//    used to lose the custom cursor + all pointer FX at the old 1024 gate).
//    Touch devices report (pointer: coarse) and keep the native behaviour.
//    The CSS `cursor:none` is keyed on html.has-custom-cursor (set by Cursor),
//    so when this branch is skipped the native cursor stays visible.
const isFinePointer = window.matchMedia('(pointer: fine)').matches;
const isWideScreen = window.matchMedia('(min-width: 640px)').matches;

let cursor = null;
if (!reduced && isFinePointer && isWideScreen) cursor = new Cursor();
// narrow → wide resize (side-by-side pane restored): mount the cursor late
if (!reduced && isFinePointer && !cursor) {
  const mq = window.matchMedia('(min-width: 640px)');
  const onWide = (e) => { if (e.matches && !cursor) { cursor = new Cursor(); mq.removeEventListener('change', onWide); } };
  mq.addEventListener('change', onWide);
}

// 5b. Arcade — the Asteroids cursor game, on demand (▲ arcade / key A / ?arcade=1)
window.__arcade = initArcade();

// 6. Lazy load
initLazyMedia();

// 6.b About — animated stat counters (scroll-triggered)
initAboutStats();

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

// 8. In-page anchor links — smooth scroll (not under reduced motion), focus
//    moved to the target, hash pushed; the skip-link stays native so it really
//    skips (see anchors.js)
initAnchorLinks(document, { reduced });

// 9. Magnetic buttons + tilt cards — any fine pointer
if (!reduced && isFinePointer && isWideScreen) {
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

// 9d. Text FX — scramble-on-reveal + hover + hero parallax + spotlight always on;
//     continuous ambient/loop glitch only in maximal mode.
initTextFx({ ambient: FX_MAXIMAL });

// 9f. Interactions — click ripple + konami easter egg (kept: subtle, on-demand)
initInteractions();

// 9m. X-ray lens + per-clip video HUD — only ever match on the LP project page
//     (no-ops on pages without .project-xray / .project-still--hud), so they
//     stay on regardless of FX_MAXIMAL — they ARE the LP breakdown content.
initVideoHud();
initXrayLens();

// ── Iron Man / JARVIS layer — gated behind FX_MAXIMAL (default off).
//    Dynamically imported: with the flag off these 5 modules (~26 KB) are
//    never fetched at all, instead of being downloaded and never run.
if (FX_MAXIMAL) {
  const V = '?v=20260516-perf';
  Promise.all([
    import('./rig-view.js' + V),
    import('./targeting.js' + V),
    import('./jarvis.js' + V),
    import('./sys-strip.js' + V),
  ]).then(([rigView, targeting, jarvis, sysStrip]) => {
    rigView.initRigView();          // Maya-style rig-view toggle + X-ray overlay
    targeting.initTargeting();      // corner-bracket reticle on hover
    jarvis.initJarvis();            // ephemeral status pings
    jarvis.initSectionScan();       // corner brackets + sweep on section entry
    sysStrip.initSysStrip();        // top-of-page FPS/GPU/clock telemetry strip

    // rig-view toggle fires a JARVIS ping
    let lastRigState = document.body.classList.contains('rig-view');
    new MutationObserver(() => {
      const active = document.body.classList.contains('rig-view');
      if (active === lastRigState) return;
      lastRigState = active;
      jarvis.ping(active ? 'rig view · engaged' : 'rig view · disengaged',
                  { kind: active ? 'ok' : 'info' });
    }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  });
}

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
