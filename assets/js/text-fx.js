/**
 * text-fx.js — micro effetti tipografici cinematic:
 *  - scramble(el)  → cycle char random poi assesta sul testo finale
 *  - glitch(el)    → brief CSS class flicker (RGB chromatic shift)
 *  - bindOnReveal(selector, fn) → trigger fx quando elemento entra in viewport
 */

const SCRAMBLE_CHARS = '!<>-_\\/[]{}—=+*^?#░▒▓▢▣▤';

export function scramble(el, opts = {}) {
  if (!el || el.dataset.fxDone === '1') return;
  // Skip se elemento ha magnetic letters (per-char spans), non sovrascrivere
  if (el.hasAttribute('data-magnetic') || el.dataset.mlxSplit === '1') return;
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
 * globalAmbientGlitch — pesca random un elemento .fx-ambient visibile e glitch.
 * Crea l'effetto "schermo che vive" senza essere distraente.
 */
function globalAmbientGlitch(intervalMin = 2200, intervalMax = 4500) {
  function tick() {
    const candidates = [...document.querySelectorAll('.fx-ambient')].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.top < window.innerHeight && r.bottom > 0 && r.width > 0;
    });
    if (candidates.length) {
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      glitch(pick, 200 + Math.random() * 200);
    }
    setTimeout(tick, intervalMin + Math.random() * (intervalMax - intervalMin));
  }
  setTimeout(tick, 2000);
}

/**
 * markAmbient — aggiunge classe .fx-ambient a tutti gli elementi matched.
 */
function markAmbient(selector) {
  document.querySelectorAll(selector).forEach((el) => el.classList.add('fx-ambient'));
}

/**
 * Setup: applica fx ai selettori standard del portfolio.
 * Rispetta prefers-reduced-motion.
 */
export function initTextFx() {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return;

  // ─── 1. SCRAMBLE ON LOAD / ON REVEAL ───────────────────────────────────

  // Hero pretitle — scramble all'apertura + loop scramble
  const pretitle = document.querySelector('.hero__pretitle');
  if (pretitle) {
    scramble(pretitle, { delay: 450, duration: 850 });
    loopScramble(pretitle, { minDelay: 16000, maxDelay: 28000, duration: 700 });
  }

  // Hero meta-label (Based/Studio/Status) — scramble staggered
  document.querySelectorAll('.hero__meta-label').forEach((el, i) => {
    scramble(el, { delay: 700 + i * 120, duration: 600 });
    loopGlitch(el, { minDelay: 10000 + i * 1500, maxDelay: 22000, duration: 240 });
  });

  // Trusted-by label
  bindOnReveal('.trusted-by__label', (el) => {
    scramble(el, { duration: 600 });
  });

  // Section heading titles — scramble on reveal
  bindOnReveal('.section-heading__title', (el) => {
    scramble(el, { duration: 800, stableChance: 0.26 });
  });

  // Toolkit labels — scramble on reveal
  bindOnReveal('.toolkit__label', (el) => {
    scramble(el, { duration: 700 });
  });

  // Showreel CTA title + tag — scramble on reveal
  bindOnReveal('.showreel__cta-title', (el) => {
    scramble(el, { duration: 900, stableChance: 0.32 });
    loopScramble(el, { minDelay: 14000, maxDelay: 26000, duration: 800 });
  });
  bindOnReveal('.showreel__tag, .showreel__cta-sub', (el) => {
    scramble(el, { duration: 600 });
  });

  // Project card titles — scramble on reveal + loop scramble raro
  bindOnReveal('.project-card__title', (el) => {
    scramble(el, { duration: 700 });
    loopScramble(el, { minDelay: 20000, maxDelay: 40000, duration: 600 });
  });

  // Project meta (LP Group · Setpoint · Character Rigging) — scramble
  bindOnReveal('.project-card__meta', (el) => {
    scramble(el, { duration: 600, stableChance: 0.25 });
  });

  // Project role label
  bindOnReveal('.project-card__role', (el) => {
    scramble(el, { duration: 750 });
  });

  // LP page: project hero breadcrumb, client, NDA, split eyebrow
  bindOnReveal('.project-hero__breadcrumb', (el) => {
    scramble(el, { duration: 700 });
  });
  bindOnReveal('.project-hero__client', (el) => {
    scramble(el, { duration: 850 });
  });
  bindOnReveal('.project-hero__nda-tag, .demo-bar__tier', (el) => {
    scramble(el, { duration: 500 });
    loopGlitch(el, { minDelay: 6000, maxDelay: 12000, duration: 260 });
  });
  bindOnReveal('.project-split-section__eyebrow', (el) => {
    scramble(el, { duration: 600 });
    loopGlitch(el, { minDelay: 9000, maxDelay: 18000, duration: 280 });
  });
  bindOnReveal('.project-split-section__title', (el) => {
    scramble(el, { duration: 800 });
  });

  // Project meta labels (CLIENT, STUDIO, DISCIPLINE, SUBJECT)
  bindOnReveal('.project-meta__label, .project-credits__label', (el) => {
    scramble(el, { duration: 500 });
  });

  // Contact pretitle + channel labels
  bindOnReveal('.contact__pretitle', (el) => {
    scramble(el, { duration: 700 });
    loopGlitch(el, { minDelay: 9000, maxDelay: 18000, duration: 320 });
  });
  bindOnReveal('.contact__channel-label', (el) => {
    scramble(el, { duration: 550 });
  });

  // Footer cta pretitle + footer credits
  bindOnReveal('.footer__cta-pretitle, .footer__credit', (el) => {
    scramble(el, { duration: 600 });
  });

  // ─── 2. LOOP GLITCH (periodic flicker) ─────────────────────────────────

  // Section num (01-05) — glitch on reveal + loop frequente
  bindOnReveal('.section-heading__num, .project-card__index', (el) => {
    glitch(el, 380);
    loopGlitch(el, { minDelay: 5000, maxDelay: 11000, duration: 280 });
  });

  // Section heading title — loop glitch dopo scramble
  document.querySelectorAll('.section-heading__title').forEach((el) => {
    loopGlitch(el, { minDelay: 11000, maxDelay: 22000, duration: 360 });
  });

  // Hero <em>Character</em> word — loop glitch (parola brand)
  document.querySelectorAll('.hero__title em').forEach((el) => {
    loopGlitch(el, { minDelay: 7000, maxDelay: 14000, duration: 380 });
  });

  // Hero title masks (Render, che vendono, che si muovono) — loop glitch raro
  document.querySelectorAll('.hero__title .reveal-mask').forEach((el, i) => {
    loopGlitch(el, { minDelay: 13000 + i * 1500, maxDelay: 26000, duration: 320 });
  });

  // Project card titles — loop glitch
  document.querySelectorAll('.project-card__title').forEach((el) => {
    loopGlitch(el, { minDelay: 11000, maxDelay: 24000, duration: 320 });
  });

  // Contact title + footer cta-text — loop glitch
  document.querySelectorAll('.contact__title em, .footer__cta-text em').forEach((el) => {
    loopGlitch(el, { minDelay: 9000, maxDelay: 19000, duration: 360 });
  });

  // Meta-bar elements (Available, clock)
  const clock = document.querySelector('.meta-clock');
  if (clock) loopGlitch(clock, { minDelay: 18000, maxDelay: 32000, duration: 220, onlyInViewport: false });

  const metaLeft = document.querySelector('.meta-bar .left');
  if (metaLeft) loopGlitch(metaLeft, { minDelay: 16000, maxDelay: 30000, duration: 240, onlyInViewport: false });

  // Trusted-by logos — random one glitches every 4-8s
  const trustedLogos = document.querySelectorAll('.trusted-by__logo');
  if (trustedLogos.length) {
    function trustedLoop() {
      const pick = trustedLogos[Math.floor(Math.random() * trustedLogos.length)];
      glitch(pick, 220);
      setTimeout(trustedLoop, 4500 + Math.random() * 3500);
    }
    setTimeout(trustedLoop, 3000);
  }

  // Tool tiles (Maya, ZBrush, ComfyUI, etc.) — pick random one ogni 3-6s
  const toolTiles = document.querySelectorAll('.tool-tile');
  if (toolTiles.length) {
    function toolLoop() {
      const visible = [...toolTiles].filter((el) => {
        const r = el.getBoundingClientRect();
        return r.top < window.innerHeight && r.bottom > 0;
      });
      if (visible.length) {
        const pick = visible[Math.floor(Math.random() * visible.length)];
        glitch(pick, 240);
      }
      setTimeout(toolLoop, 3500 + Math.random() * 3000);
    }
    setTimeout(toolLoop, 5000);
  }

  // ─── 3. AMBIENT GLITCH — random subset di elementi viventi (più frequente) ─

  markAmbient([
    '.section-heading__title',
    '.section-heading__num',
    '.project-card__title',
    '.project-card__meta span',
    '.project-card__role',
    '.project-card__index',
    '.toolkit__label',
    '.tool-tile__name',
    '.project-meta__value',
    '.project-meta__label',
    '.project-credits__value',
    '.project-credits__label',
    '.contact__pretitle',
    '.contact__channel-value',
    '.footer__cta-pretitle',
    '.footer__credit',
    '.hero__sub',
    '.hero__meta-label',
    '.hero__pretitle',
    '.manifesto__lead em',
    '.trusted-by__logo',
    '.showreel__tag',
    '.btn',
    '.demo-bar__title',
  ].join(','));

  // Ambient più frequente: ogni 1.4-3s
  globalAmbientGlitch(1400, 3000);

  // ─── 4. HOVER SCRAMBLE — passi sopra → re-scramble ─────────────────────
  document.querySelectorAll(
    '.project-card__title, .section-heading__title, .toolkit__label, .contact__channel-value, .btn'
  ).forEach((el) => {
    el.classList.add('fx-hover-scramble');
    let cooldown = false;
    el.addEventListener('mouseenter', () => {
      if (cooldown) return;
      cooldown = true;
      el.dataset.fxDone = '';
      scramble(el, { duration: 450, stableChance: 0.35 });
      setTimeout(() => { cooldown = false; }, 600);
    });
  });

  // ─── 5. HERO TITLE 3D PARALLAX — mouse → rotateX/Y ────────────────────
  const heroTitle = document.querySelector('.hero__title');
  const heroSection = document.querySelector('.hero');
  if (heroTitle && heroSection && window.matchMedia('(min-width: 1024px)').matches) {
    let raf;
    let target = { x: 0, y: 0 };
    let current = { x: 0, y: 0 };
    function update() {
      current.x += (target.x - current.x) * 0.08;
      current.y += (target.y - current.y) * 0.08;
      heroTitle.style.setProperty('--hero-rx', `${current.y * -3}deg`);
      heroTitle.style.setProperty('--hero-ry', `${current.x * 6}deg`);
      if (Math.abs(target.x - current.x) > 0.001 || Math.abs(target.y - current.y) > 0.001) {
        raf = requestAnimationFrame(update);
      } else { raf = null; }
    }
    heroSection.addEventListener('mousemove', (e) => {
      const r = heroSection.getBoundingClientRect();
      target.x = (e.clientX - r.left) / r.width - 0.5;
      target.y = (e.clientY - r.top) / r.height - 0.5;
      if (!raf) raf = requestAnimationFrame(update);
    });
    heroSection.addEventListener('mouseleave', () => {
      target.x = 0; target.y = 0;
      if (!raf) raf = requestAnimationFrame(update);
    });
  }

  // ─── 6. CURSOR SPOTLIGHT — radial light sulle zone scure ──────────────
  const spotlightSections = document.querySelectorAll('.showreel, .contact, .footer');
  spotlightSections.forEach((sec) => {
    sec.classList.add('fx-spotlight');
    sec.addEventListener('mousemove', (e) => {
      const r = sec.getBoundingClientRect();
      const mx = ((e.clientX - r.left) / r.width) * 100;
      const my = ((e.clientY - r.top) / r.height) * 100;
      sec.style.setProperty('--mx', `${mx}%`);
      sec.style.setProperty('--my', `${my}%`);
      sec.classList.add('is-spotlight-active');
    });
    sec.addEventListener('mouseleave', () => {
      sec.classList.remove('is-spotlight-active');
    });
  });

  // ─── 7. CRT SCANLINE SWEEP — overlay fisso che attraversa la pagina ───
  if (window.matchMedia('(min-width: 768px)').matches) {
    const scan = document.createElement('div');
    scan.className = 'fx-scanline';
    scan.setAttribute('aria-hidden', 'true');
    document.body.appendChild(scan);
  }

  // ─── 8. INDEX/NUM massive glitch ogni tanto (BOOM moment) ─────────────
  function massiveGlitchBurst() {
    const candidates = [...document.querySelectorAll('.section-heading__num, .project-card__index, .hero__title em, .hero__pretitle')];
    const visible = candidates.filter((el) => {
      const r = el.getBoundingClientRect();
      return r.top < window.innerHeight && r.bottom > 0;
    });
    // Pick 2-4 elementi visibili e glitchali insieme (effetto "scossa")
    const picks = visible.sort(() => Math.random() - 0.5).slice(0, 2 + Math.floor(Math.random() * 3));
    picks.forEach((el, i) => setTimeout(() => glitch(el, 400), i * 60));
    setTimeout(massiveGlitchBurst, 18000 + Math.random() * 14000);
  }
  setTimeout(massiveGlitchBurst, 8000);
}
