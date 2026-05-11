/**
 * sys-strip.js — Live system telemetry strip at the very top of the page.
 *
 * Reads as a flight-HUD diagnostic bar. Modules:
 *   1. SYS    — pulsing green dot, status "online"
 *   2. MODE   — design / rig / debug (reflects body classes)
 *   3. FPS    — live frame rate (oxblood if < 45)
 *   4. CUR    — live cursor coords (xxxx, yyyy)
 *   5. GPU    — synthetic load 60-95% wandering (telemetry feel)
 *   6. T      — running clock with milliseconds (the signature tick)
 *
 * Updates at requestAnimationFrame rate. Skips entirely under
 * prefers-reduced-motion. The pulsing dot + ms-ticking clock are the
 * single most "alive" signals.
 */

let mx = 0, my = 0;
let gpu = 78;
let lastFpsT = 0;
let frameCount = 0;
let fpsSmoothed = 60;
let stripEl = null;
let fpsEl, curEl, scrEl, gpuEl, tEl, modeEl;

function pad(n, w) { return String(n).padStart(w, '0'); }

function build() {
  const strip = document.createElement('aside');
  strip.className = 'sys-strip';
  strip.setAttribute('aria-hidden', 'true');
  strip.innerHTML = `
    <span class="sys-strip__module sys-strip__module--sys">
      <span class="sys-strip__dot" aria-hidden="true"></span>
      <span class="sys-strip__k">sys</span>
      <span class="sys-strip__v sys-strip__v--ok">online</span>
    </span>
    <span class="sys-strip__module">
      <span class="sys-strip__k">mode</span>
      <span class="sys-strip__v" data-sys="mode">design</span>
    </span>
    <span class="sys-strip__module sys-strip__module--sec">
      <span class="sys-strip__k">fps</span>
      <span class="sys-strip__v" data-sys="fps">60</span>
    </span>
    <span class="sys-strip__module sys-strip__module--sec">
      <span class="sys-strip__k">cur</span>
      <span class="sys-strip__v" data-sys="cur">0000, 0000</span>
    </span>
    <span class="sys-strip__module sys-strip__module--sec">
      <span class="sys-strip__k">scr</span>
      <span class="sys-strip__v" data-sys="scr">000%</span>
    </span>
    <span class="sys-strip__module sys-strip__module--sec">
      <span class="sys-strip__k">gpu</span>
      <span class="sys-strip__v" data-sys="gpu">078%</span>
    </span>
    <span class="sys-strip__module sys-strip__module--clock">
      <span class="sys-strip__k">t</span>
      <span class="sys-strip__v" data-sys="t">00:00:00.000</span>
    </span>
  `;
  document.body.insertBefore(strip, document.body.firstChild);
  return strip;
}

function readMode() {
  if (document.body.classList.contains('debug-mode')) return 'debug';
  if (document.body.classList.contains('rig-view')) return 'rig';
  return 'design';
}

let lastMode = 'design';
let lastUpdate = { cur: 0, scr: 0, gpu: 0 };

function tick(now) {
  // ── FPS sampling (smoothed, updated 4× per second) ─────────────────────
  frameCount++;
  const fpsDt = now - lastFpsT;
  if (fpsDt >= 250) {
    const inst = (frameCount * 1000) / fpsDt;
    fpsSmoothed = fpsSmoothed * 0.7 + inst * 0.3;
    frameCount = 0;
    lastFpsT = now;
    if (fpsEl) {
      fpsEl.textContent = Math.round(fpsSmoothed);
      fpsEl.classList.toggle('sys-strip__v--warn', fpsSmoothed < 45);
    }
  }

  // ── Cursor — every frame (cheap text update) ───────────────────────────
  if (curEl) curEl.textContent = `${pad(Math.round(mx), 4)}, ${pad(Math.round(my), 4)}`;

  // ── Scroll % — every 100ms ─────────────────────────────────────────────
  if (now - lastUpdate.scr > 100 && scrEl) {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const pct = max > 0 ? Math.round((window.scrollY / max) * 100) : 0;
    scrEl.textContent = `${pad(pct, 3)}%`;
    lastUpdate.scr = now;
  }

  // ── GPU wander — every 180ms (fake but plausible) ──────────────────────
  if (now - lastUpdate.gpu > 180 && gpuEl) {
    gpu += (Math.random() - 0.48) * 3.2;
    gpu = Math.max(58, Math.min(96, gpu));
    gpuEl.textContent = `${pad(Math.round(gpu), 3)}%`;
    gpuEl.classList.toggle('sys-strip__v--warn', gpu > 90);
    lastUpdate.gpu = now;
  }

  // ── Clock w/ milliseconds — every frame (THE signature) ────────────────
  if (tEl) {
    const d = new Date();
    tEl.textContent =
      `${pad(d.getHours(), 2)}:${pad(d.getMinutes(), 2)}:${pad(d.getSeconds(), 2)}` +
      `.${pad(d.getMilliseconds(), 3)}`;
  }

  // ── Mode — only update on change ───────────────────────────────────────
  const mode = readMode();
  if (mode !== lastMode) {
    lastMode = mode;
    if (modeEl) {
      modeEl.textContent = mode;
      modeEl.classList.toggle('sys-strip__v--ox', mode === 'rig');
      modeEl.classList.toggle('sys-strip__v--warn', mode === 'debug');
    }
    stripEl?.setAttribute('data-mode', mode);
  }

  requestAnimationFrame(tick);
}

export function initSysStrip() {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return;

  stripEl = build();
  fpsEl = stripEl.querySelector('[data-sys="fps"]');
  curEl = stripEl.querySelector('[data-sys="cur"]');
  scrEl = stripEl.querySelector('[data-sys="scr"]');
  gpuEl = stripEl.querySelector('[data-sys="gpu"]');
  tEl = stripEl.querySelector('[data-sys="t"]');
  modeEl = stripEl.querySelector('[data-sys="mode"]');

  document.addEventListener('mousemove', (e) => {
    mx = e.clientX;
    my = e.clientY;
  }, { passive: true });

  lastFpsT = performance.now();
  requestAnimationFrame(tick);
}
