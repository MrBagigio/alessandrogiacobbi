/**
 * Bootstrap — entry point.
 * Loads GSAP via CDN, initializes scenes, cursor, lazy, scroll triggers.
 */
import { HeroScene } from './scene-hero.js';
import { BgScene } from './scene-bg.js';
import { Cursor } from './cursor.js';
import { initLazyMedia } from './lazy.js';
import { initTextFx } from './text-fx.js';
import { initMagneticAuto } from './magnetic-letters.js';
import { runBootSequence } from './boot.js';
import { initRigView } from './rig-view.js';
import { initInteractions } from './interactions.js';
// import { AsteroidCursor } from './asteroid-cursor.js'; // disabled — keep file for future

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
    let target = { rx: 0, ry: 0 };
    let current = { rx: 0, ry: 0 };

    const update = () => {
      // Lerp toward target
      current.rx += (target.rx - current.rx) * 0.12;
      current.ry += (target.ry - current.ry) * 0.12;

      // Apply transform (combine with hover translateZ from CSS via additive transform on media)
      media.style.transform = `
        translateZ(24px)
        scale(1.015)
        rotateX(${current.rx}deg)
        rotateY(${current.ry}deg)
      `;

      if (Math.abs(target.rx - current.rx) > 0.01 || Math.abs(target.ry - current.ry) > 0.01) {
        rafId = requestAnimationFrame(update);
      } else {
        rafId = null;
      }
    };

    card.addEventListener('mousemove', (e) => {
      const r = card.getBoundingClientRect();
      const cx = e.clientX - r.left - r.width / 2;
      const cy = e.clientY - r.top - r.height / 2;

      // Tilt range ±6° (was 12° — too aggressive). Stripe/Linear scale.
      target.rx = -(cy / r.height) * 7;
      target.ry =  (cx / r.width) * 7;

      if (!rafId) rafId = requestAnimationFrame(update);
    });

    card.addEventListener('mouseleave', () => {
      target.rx = 0;
      target.ry = 0;
      // Reset transform on media — keep CSS hover transition
      setTimeout(() => {
        media.style.transform = '';
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

// 10. Char-reveal init — split text content into spans on .char-reveal
document.querySelectorAll('.char-reveal').forEach((el) => {
  const text = el.textContent;
  el.textContent = '';
  const words = text.split(/(\s+)/);
  words.forEach((w) => {
    if (/^\s+$/.test(w)) {
      el.appendChild(document.createTextNode(' '));
      return;
    }
    [...w].forEach((c, i) => {
      const span = document.createElement('span');
      span.className = 'char-reveal__inner';
      span.style.transitionDelay = `${i * 18}ms`;
      span.textContent = c;
      el.appendChild(span);
    });
  });
});
