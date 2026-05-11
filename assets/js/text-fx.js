/**
 * text-fx.js — micro effetti tipografici cinematic:
 *  - scramble(el)  → cycle char random poi assesta sul testo finale
 *  - glitch(el)    → brief CSS class flicker (RGB chromatic shift)
 *  - bindOnReveal(selector, fn) → trigger fx quando elemento entra in viewport
 */

const SCRAMBLE_CHARS = '!<>-_\\/[]{}—=+*^?#░▒▓▢▣▤';

export function scramble(el, opts = {}) {
  if (!el || el.dataset.fxDone === '1') return;
  // Stash final text (idempotent — sopravvive a re-trigger)
  if (!el.dataset.textFx) el.dataset.textFx = el.textContent.trim();
  const finalText = el.dataset.textFx;
  const duration = opts.duration ?? 750;
  const startDelay = opts.delay ?? 0;
  const stableChance = opts.stableChance ?? 0.28;

  const chars = [...finalText];
  const queue = chars.map((c) => {
    // Spaces e punteggiatura speciale: nessuno scramble
    if (/\s/.test(c)) return { final: c, skip: true };
    return {
      final: c,
      from: SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)],
      start: Math.random() * duration * 0.35,
      end:   duration * 0.55 + Math.random() * duration * 0.4,
    };
  });

  const startTime = performance.now() + startDelay;

  function tick(now) {
    const t = now - startTime;
    let out = '';
    let done = 0;
    queue.forEach((q) => {
      if (q.skip || t >= q.end) {
        out += q.final;
        done++;
      } else if (t >= q.start) {
        if (Math.random() < stableChance) {
          q.from = SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
        }
        out += `<span class="fx-scramble">${q.from}</span>`;
      } else {
        out += `<span class="fx-scramble">${q.from}</span>`;
      }
    });
    el.innerHTML = out;
    if (done < queue.length) {
      requestAnimationFrame(tick);
    } else {
      el.dataset.fxDone = '1';
    }
  }
  requestAnimationFrame(tick);
}

export function glitch(el, duration = 320) {
  if (!el) return;
  el.classList.remove('is-glitching');
  // Force reflow per restartare animation
  void el.offsetWidth;
  el.classList.add('is-glitching');
  setTimeout(() => el.classList.remove('is-glitching'), duration);
}

export function bindOnReveal(selector, fn, opts = {}) {
  const els = document.querySelectorAll(selector);
  if (!els.length || !('IntersectionObserver' in window)) {
    els.forEach((e) => fn(e));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        fn(entry.target);
        io.unobserve(entry.target);
      }
    });
  }, { threshold: opts.threshold ?? 0.4, rootMargin: opts.rootMargin ?? '0px 0px -8% 0px' });
  els.forEach((el) => io.observe(el));
}

/**
 * loopGlitch — schedule glitch on element periodicamente con jitter random.
 * @param {Element} el
 * @param {object} opts
 *   minDelay: ms minimi tra glitch (default 6000)
 *   maxDelay: ms massimi tra glitch (default 14000)
 *   duration: durata singolo glitch (default 280)
 *   onlyInViewport: se true (default), pausa quando element fuori viewport
 */
const _loopHandles = new WeakMap();
export function loopGlitch(el, opts = {}) {
  if (!el) return;
  if (_loopHandles.has(el)) return; // già attivo
  const minDelay = opts.minDelay ?? 6000;
  const maxDelay = opts.maxDelay ?? 14000;
  const duration = opts.duration ?? 280;
  const onlyInViewport = opts.onlyInViewport ?? true;

  let visible = !onlyInViewport;
  if (onlyInViewport && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    }, { threshold: 0.1 });
    io.observe(el);
  }

  function schedule() {
    const delay = minDelay + Math.random() * (maxDelay - minDelay);
    const handle = setTimeout(() => {
      if (!document.body.contains(el)) return;
      if (visible) glitch(el, duration);
      schedule();
    }, delay);
    _loopHandles.set(el, handle);
  }
  schedule();
}

/**
 * loopScramble — re-scramble periodico (re-trigger animation).
 * Utile per parole brand/keyword che devono "respirare".
 */
export function loopScramble(el, opts = {}) {
  if (!el) return;
  const minDelay = opts.minDelay ?? 14000;
  const maxDelay = opts.maxDelay ?? 28000;
  const duration = opts.duration ?? 600;

  let visible = true;
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    }, { threshold: 0.1 });
    io.observe(el);
  }

  function schedule() {
    const delay = minDelay + Math.random() * (maxDelay - minDelay);
    setTimeout(() => {
      if (!document.body.contains(el)) return;
      if (visible) {
        el.dataset.fxDone = '';  // reset
        scramble(el, { duration });
      }
      schedule();
    }, delay);
  }
  schedule();
}

/**
 * Setup: applica fx ai selettori standard del portfolio.
 * Rispetta prefers-reduced-motion.
 */
export function initTextFx() {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return;

  // 1. Hero pretitle — scramble all'apertura + loop scramble ogni 18-30s
  const pretitle = document.querySelector('.hero__pretitle');
  if (pretitle) {
    scramble(pretitle, { delay: 450, duration: 850 });
    loopScramble(pretitle, { minDelay: 18000, maxDelay: 30000, duration: 700 });
  }

  // 2. Numerini section heading (01, 02, ...) — glitch on reveal + loop
  bindOnReveal('.section-heading__num, .project-card__index', (el) => {
    glitch(el, 380);
    loopGlitch(el, { minDelay: 5000, maxDelay: 11000, duration: 280 });
  });

  // 3. Section heading title (3D · Character Rigging, ComfyUI, ...) — loop glitch raro
  bindOnReveal('.section-heading__title', (el) => {
    loopGlitch(el, { minDelay: 11000, maxDelay: 22000, duration: 360 });
  });

  // 4. Hero title "Character" word (em wrapped) — loop glitch ogni 8-16s
  document.querySelectorAll('.hero__title em').forEach((el) => {
    loopGlitch(el, { minDelay: 8000, maxDelay: 16000, duration: 380 });
  });

  // 5. Showreel CTA title — scramble on reveal + loop re-scramble
  bindOnReveal('.showreel__cta-title', (el) => {
    scramble(el, { duration: 900, stableChance: 0.32 });
    loopScramble(el, { minDelay: 16000, maxDelay: 28000, duration: 800 });
  });

  // 6. NDA tag + demo-bar tier (LP page + demo viewer) — scramble + loop glitch
  bindOnReveal('.project-hero__nda-tag, .demo-bar__tier', (el) => {
    scramble(el, { duration: 500 });
    loopGlitch(el, { minDelay: 7000, maxDelay: 13000, duration: 260 });
  });

  // 7. Hero meta labels — scramble staggered + loop glitch raro
  document.querySelectorAll('.hero__meta-label').forEach((el, i) => {
    scramble(el, { delay: 700 + i * 120, duration: 600 });
    loopGlitch(el, { minDelay: 12000 + i * 2000, maxDelay: 24000, duration: 240 });
  });

  // 8. Trusted-by logos — glitch random rotation (uno alla volta ogni 4-8s)
  const trustedLogos = document.querySelectorAll('.trusted-by__logo');
  if (trustedLogos.length) {
    setInterval(() => {
      const pick = trustedLogos[Math.floor(Math.random() * trustedLogos.length)];
      glitch(pick, 220);
    }, 4500 + Math.random() * 3500);
  }

  // 9. Meta-bar clock — glitch ogni minuto al refresh
  const clock = document.querySelector('.meta-clock');
  if (clock) {
    setInterval(() => glitch(clock, 240), 30000 + Math.random() * 10000);
  }

  // 10. Section eyebrow + project-split-section eyebrow (LP page)
  bindOnReveal('.project-split-section__eyebrow, .project-hero__breadcrumb', (el) => {
    loopGlitch(el, { minDelay: 9000, maxDelay: 18000, duration: 280 });
  });

  // 11. Toolkit labels (3D · VFX, AI · Generative, Post · Audio) — scramble on reveal
  bindOnReveal('.toolkit__label', (el) => {
    scramble(el, { duration: 700 });
    loopGlitch(el, { minDelay: 13000, maxDelay: 24000, duration: 260 });
  });
}
