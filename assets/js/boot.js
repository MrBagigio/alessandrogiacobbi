/**
 * boot.js — Terminal typewriter on first load. Faster + tighter than v1.
 *
 * Total runtime ~2.0s on average machine (was 4.5s in v1).
 *  - char delay 9 ms (was 14)
 *  - line pause 50 ms (was 80)
 *  - hold-before-fade 280 ms (was 380)
 *  - 5 lines max
 *
 * Skips animation under prefers-reduced-motion.
 */

const CHAR_DELAY = 9;
const LINE_PAUSE = 50;
const HOLD_BEFORE_FADE = 280;

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
    await sleep(220);
    loader.classList.add('is-loaded');
    return;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const text = line.dataset.boot || '';
    line.classList.add('is-typing');
    await typewrite(line, text);
    // Previous (non-accent) lines get the "ok" → green flash
    if (i < lines.length - 1 && !line.classList.contains('loader__boot-line--accent')) {
      line.classList.add('is-done');
    }
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
