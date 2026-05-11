/**
 * boot.js — Tony-Stark-style terminal boot sequence on first load.
 *
 * Markup expected:
 *   <div class="loader">
 *     <div class="loader__boot">
 *       <pre class="loader__boot-line" data-boot="> initializing portfolio_v2.6...">
 *       ...
 *     </div>
 *   </div>
 *
 * On window load, types each line char-by-char, then fades loader out.
 * Skips animation under prefers-reduced-motion (just fades immediately).
 */

const CHAR_DELAY = 14;        // ms per char while typing
const LINE_PAUSE = 80;        // ms between lines
const HOLD_BEFORE_FADE = 380; // ms after last line before fade

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function typewrite(el, text) {
  return new Promise((resolve) => {
    let i = 0;
    function tick() {
      if (i > text.length) { resolve(); return; }
      el.textContent = text.slice(0, i);
      i++;
      setTimeout(tick, CHAR_DELAY);
    }
    tick();
  });
}

export async function runBootSequence() {
  const loader = document.querySelector('.loader');
  if (!loader) return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const lines = loader.querySelectorAll('.loader__boot-line');

  if (reduced || !lines.length) {
    // Skip animation — just fade the loader away.
    await sleep(300);
    loader.classList.add('is-loaded');
    return;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const text = line.dataset.boot || '';
    line.classList.add('is-typing');
    await typewrite(line, text);
    // Last line gets the blinking cursor
    if (i === lines.length - 1) {
      const cursor = document.createElement('span');
      cursor.className = 'loader__cursor';
      line.appendChild(cursor);
    }
    await sleep(LINE_PAUSE);
  }

  await sleep(HOLD_BEFORE_FADE);
  loader.classList.add('is-loaded');
}
