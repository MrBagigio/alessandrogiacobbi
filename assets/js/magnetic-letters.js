/**
 * magnetic-letters.js — fx avanzato per hover su scritte:
 *
 *  1. SPLIT TEXT: ogni char wrappato in <span class="mlx__c">
 *  2. MAGNETIC: char attratto dal cursore con falloff radiale
 *  3. CHROMATIC: char vicini al cursore hanno RGB shift (ox + cyan)
 *  4. PARTICLE BURST: canvas2D al click sul testo (lettere esplodono)
 *
 *  Uso: aggiungere data-magnetic="" al titolo, oppure chiamare initMagnetic(el).
 *  Rispetta prefers-reduced-motion + min-width 1024px (solo desktop).
 */

const REST_RADIUS = 140;  // px dentro cui un char è attratto
const MAX_PULL = 22;      // px massimo di translate
const SCALE_BOOST = 1.18; // scale up max
const LERP = 0.18;        // velocità lerp (0-1)
const CHROMATIC_RADIUS = 120;
const CHROMATIC_MAX = 4;  // px RGB shift max

function splitText(el) {
  if (el.dataset.mlxSplit === '1') return;
  const text = el.textContent;
  // DocumentFragment so we only reflow once for the whole title
  const frag = document.createDocumentFragment();
  const chars = [];
  for (const c of text) {
    if (c === ' ' || c === ' ') {
      frag.appendChild(document.createTextNode(' '));
      continue;
    }
    const span = document.createElement('span');
    span.className = 'mlx__c';
    span.textContent = c;
    span.style.display = 'inline-block';
    span.style.willChange = 'transform, text-shadow';
    frag.appendChild(span);
    chars.push(span);
  }
  el.textContent = '';
  el.appendChild(frag);
  el.dataset.mlxSplit = '1';
  el._mlxChars = chars;
  el._mlxState = chars.map(() => ({ tx: 0, ty: 0, cx: 0, cy: 0, sc: 1, sh: 0 }));
  el._mlxTarget = chars.map(() => ({ tx: 0, ty: 0, cx: 0, cy: 0, sc: 1, sh: 0 }));
  el._mlxRects = null;
}

/* Cache char-center positions once per hover session — was getBoundingClientRect()
   PER CHAR PER MOUSEMOVE which is ~1200 layout reads/sec on a 20-char title. */
function refreshCharRects(el) {
  const chars = el._mlxChars;
  if (!chars) return null;
  const rects = new Array(chars.length);
  for (let i = 0; i < chars.length; i++) {
    const r = chars[i].getBoundingClientRect();
    rects[i] = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  el._mlxRects = rects;
  return rects;
}

let rafId = null;
const activeEls = new Set();

function animate() {
  rafId = null;
  let needsMore = false;
  activeEls.forEach((el) => {
    const chars = el._mlxChars;
    const states = el._mlxState;
    const targets = el._mlxTarget;
    chars.forEach((c, i) => {
      const s = states[i];
      const t = targets[i];
      s.tx += (t.tx - s.tx) * LERP;
      s.ty += (t.ty - s.ty) * LERP;
      s.cx += (t.cx - s.cx) * LERP;
      s.cy += (t.cy - s.cy) * LERP;
      s.sc += (t.sc - s.sc) * LERP;
      s.sh += (t.sh - s.sh) * (LERP * 1.3);
      if (Math.abs(t.tx - s.tx) > 0.05 || Math.abs(t.ty - s.ty) > 0.05 ||
          Math.abs(t.sc - s.sc) > 0.002 || Math.abs(t.sh - s.sh) > 0.01) {
        needsMore = true;
      }
      c.style.transform = `translate(${s.tx.toFixed(2)}px, ${s.ty.toFixed(2)}px) scale(${s.sc.toFixed(3)})`;
      // Chromatic shift: RGB ghost (ox + cyan) intensità sh
      if (s.sh > 0.01) {
        c.style.textShadow = `${s.cx.toFixed(1)}px ${s.cy.toFixed(1)}px 0 rgba(184,50,63,${(s.sh * 0.85).toFixed(2)}), ${(-s.cx).toFixed(1)}px ${(-s.cy).toFixed(1)}px 0 rgba(44,181,195,${(s.sh * 0.65).toFixed(2)})`;
      } else {
        c.style.textShadow = '';
      }
    });
  });
  if (needsMore) rafId = requestAnimationFrame(animate);
}

function scheduleAnimate() {
  if (!rafId) rafId = requestAnimationFrame(animate);
}

function onMouseMove(el, mx, my) {
  const chars = el._mlxChars;
  if (!chars) return;
  const targets = el._mlxTarget;
  // Use cached rects if available; refresh on first move of hover session.
  const rects = el._mlxRects || refreshCharRects(el);
  if (!rects) return;
  for (let i = 0; i < chars.length; i++) {
    const { x, y } = rects[i];
    const dx = mx - x;
    const dy = my - y;
    const dist = Math.hypot(dx, dy);
    const t = targets[i];

    if (dist < REST_RADIUS) {
      const force = 1 - dist / REST_RADIUS;
      const pull = force * force * MAX_PULL;
      t.tx = (dx / (dist || 1)) * pull;
      t.ty = (dy / (dist || 1)) * pull;
      t.sc = 1 + force * (SCALE_BOOST - 1);
    } else {
      t.tx = 0; t.ty = 0; t.sc = 1;
    }

    if (dist < CHROMATIC_RADIUS) {
      const force = 1 - dist / CHROMATIC_RADIUS;
      t.cx = -(dx / (dist || 1)) * CHROMATIC_MAX * force;
      t.cy = -(dy / (dist || 1)) * CHROMATIC_MAX * force;
      t.sh = force;
    } else {
      t.cx = 0; t.cy = 0; t.sh = 0;
    }
  }
  scheduleAnimate();
}

function onMouseLeave(el) {
  const targets = el._mlxTarget;
  if (!targets) return;
  targets.forEach((t) => { t.tx = 0; t.ty = 0; t.cx = 0; t.cy = 0; t.sc = 1; t.sh = 0; });
  scheduleAnimate();
}

/* Invalidate rect cache for all active magnetic elements (called once on
   resize + scroll instead of per-mousemove). */
function invalidateAllRects() {
  activeEls.forEach((el) => { el._mlxRects = null; });
}
let _rectInvalidatorWired = false;
function wireRectInvalidator() {
  if (_rectInvalidatorWired) return;
  _rectInvalidatorWired = true;
  let resizeRaf = null;
  const onChange = () => {
    if (resizeRaf) return;
    resizeRaf = requestAnimationFrame(() => {
      invalidateAllRects();
      resizeRaf = null;
    });
  };
  window.addEventListener('resize', onChange, { passive: true });
  window.addEventListener('scroll', onChange, { passive: true });
}

export function initMagnetic(el) {
  if (!el) return;
  splitText(el);
  activeEls.add(el);
  wireRectInvalidator();
  // Cache invalidation on hover entry: text-fx scramble may have rebuilt spans
  el.addEventListener('mouseenter', () => { el._mlxRects = null; });
  el.addEventListener('mousemove', (e) => onMouseMove(el, e.clientX, e.clientY));
  el.addEventListener('mouseleave', () => onMouseLeave(el));
}

/**
 * Particle burst on click — letters explode into particles that fade.
 *
 * Performance: physics + draw run on a Web Worker via OffscreenCanvas when
 * available (Chrome 80+, Safari 16.4+, Firefox 105+). Falls back to a
 * main-thread loop when the API is missing, so older browsers still get
 * the effect — just on the main thread.
 */
function buildParticles(el, x, y) {
  const chars = el._mlxChars;
  if (!chars) return [];
  const out = [];
  for (const c of chars) {
    const r = c.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dx = cx - x;
    const dy = cy - y;
    const dist = Math.hypot(dx, dy);
    if (dist > 280) continue;
    const count = 4 + Math.floor((1 - dist / 280) * 8);
    for (let i = 0; i < count; i++) {
      const angle = Math.atan2(dy, dx) + (Math.random() - 0.5) * 1.6;
      const speed = 2 + Math.random() * 7 * (1 - dist / 280);
      out.push({
        x: cx + (Math.random() - 0.5) * r.width,
        y: cy + (Math.random() - 0.5) * r.height,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1,
        size: 2 + Math.random() * 3,
        life: 1,
        decay: 0.012 + Math.random() * 0.02,
        color: Math.random() < 0.7 ? '184,50,63' : '237,230,214',
      });
    }
  }
  return out;
}

function makeBurstCanvas() {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9997;';
  canvas.width = window.innerWidth * devicePixelRatio;
  canvas.height = window.innerHeight * devicePixelRatio;
  canvas.style.width = window.innerWidth + 'px';
  canvas.style.height = window.innerHeight + 'px';
  document.body.appendChild(canvas);
  return canvas;
}

function particleBurst(el, x, y) {
  const particles = buildParticles(el, x, y);
  if (!particles.length) return;

  const canvas = makeBurstCanvas();
  const supportsWorker = typeof Worker !== 'undefined'
    && typeof OffscreenCanvas !== 'undefined'
    && 'transferControlToOffscreen' in canvas;

  if (supportsWorker) {
    try {
      const offscreen = canvas.transferControlToOffscreen();
      const worker = new Worker(
        new URL('./particle-worker.js?v=20260516-pointer', import.meta.url),
        { type: 'module' }
      );
      worker.postMessage({ type: 'init', data: { canvas: offscreen, dpr: devicePixelRatio } }, [offscreen]);
      worker.postMessage({ type: 'burst', data: { particles } });
      worker.onmessage = (e) => {
        if (e.data?.type === 'done') {
          worker.terminate();
          canvas.remove();
        }
      };
      // Safety timeout in case worker dies silently
      setTimeout(() => {
        worker.terminate();
        if (canvas.parentNode) canvas.remove();
      }, 5000);
      return;
    } catch (err) {
      // Fall through to main-thread fallback on any worker init error
      canvas.remove();
    }
  }

  // ── Fallback: main-thread loop (same logic as the worker) ──
  const fbCanvas = makeBurstCanvas();
  const ctx = fbCanvas.getContext('2d');
  ctx.scale(devicePixelRatio, devicePixelRatio);
  let frame = 0;
  function loop() {
    ctx.clearRect(0, 0, fbCanvas.width, fbCanvas.height);
    let alive = 0;
    for (const p of particles) {
      if (p.life <= 0) continue;
      alive++;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.18;
      p.vx *= 0.985;
      p.life -= p.decay;
      ctx.fillStyle = `rgba(${p.color},${Math.max(0, p.life).toFixed(2)})`;
      ctx.fillRect(p.x, p.y, p.size, p.size);
    }
    frame++;
    if (alive > 0 && frame < 200) requestAnimationFrame(loop);
    else fbCanvas.remove();
  }
  loop();
}

/**
 * Setup auto: applica magnetic ai selettori standard del portfolio.
 * Skip se reduced-motion o viewport < 1024.
 */
const DEFAULT_SELECTORS = [
  '.section-heading__title',
  '.project-card__title',
  '.project-hero__title',
  '.project-split-section__title',
  '.showreel__cta-title',
  '.contact__title',
  '.footer__cta-text',
  '.toolkit__label',
  '[data-magnetic]',
];

export function initMagneticAuto(selectors = DEFAULT_SELECTORS) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wide = window.matchMedia('(min-width: 1024px)').matches;
  if (reduced || !wide) return;

  selectors.forEach((sel) => {
    document.querySelectorAll(sel).forEach((el) => {
      // Skip se contiene HTML markup complesso (avoid breaking nested spans)
      if (el.querySelector('span, em, strong, br')) return;
      el.setAttribute('data-magnetic', '');
      initMagnetic(el);
    });
  });

  // Click → particle burst su elementi magnetic
  // Skip se dentro <a> (navigazione cambia pagina, effetto perso) o su <a> stesso
  document.addEventListener('click', (e) => {
    const target = e.target.closest('[data-magnetic]');
    if (!target) return;
    if (target.closest('a[href]')) return;
    particleBurst(target, e.clientX, e.clientY);
  });
}
