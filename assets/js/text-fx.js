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
 * Setup: applica fx ai selettori standard del portfolio.
 * Rispetta prefers-reduced-motion.
 */
export function initTextFx() {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return;

  // 1. Hero pretitle — scramble all'apertura della pagina (terminal style)
  const pretitle = document.querySelector('.hero__pretitle');
  if (pretitle) {
    scramble(pretitle, { delay: 450, duration: 850 });
  }

  // 2. Numerini section heading (01, 02, ...) — glitch on reveal + periodico
  bindOnReveal('.section-heading__num, .project-card__index', (el) => {
    glitch(el, 380);
    // Loop sporadico: 1 glitch ogni 6-12s mentre l'elemento è in viewport
    setTimeout(function loop() {
      if (!document.body.contains(el)) return;
      glitch(el, 280);
      setTimeout(loop, 6000 + Math.random() * 6000);
    }, 4000 + Math.random() * 2000);
  });

  // 3. Showreel CTA title — scramble on reveal
  bindOnReveal('.showreel__cta-title', (el) => {
    scramble(el, { duration: 900, stableChance: 0.32 });
  });

  // 4. NDA tag su LP page, badge mono — scramble on reveal
  bindOnReveal('.project-hero__nda-tag, .demo-bar__tier', (el) => {
    scramble(el, { duration: 500 });
  });

  // 5. Hero meta labels — scramble staggered
  document.querySelectorAll('.hero__meta-label').forEach((el, i) => {
    scramble(el, { delay: 700 + i * 120, duration: 600 });
  });
}
