/**
 * boot.js — Phased CRT power-on → typewriter → CRT shutdown → home.
 *
 * Timeline (≈3.3 s total on a fresh load):
 *   0     ms   black
 *   80    ms   .is-on added → power-on line stretches (720 ms) + terminal
 *              scales in vertically (460 ms, delay 380 ms) + brief flicker
 *   720   ms   terminal fully visible, typewriter begins
 *  ~2620  ms   last line types out (5 lines × ~9 ms/char + line pauses)
 *  +280   ms   hold with blinking cursor
 *   2900  ms   .is-shutdown added → terminal collapses to a line,
 *              line flashes WHITE and expands vertically (CRT discharge)
 *   3460  ms   .is-loaded added → loader fades, page revealed (360 ms)
 *
 * Under prefers-reduced-motion the whole sequence is replaced with a
 * single 220 ms fade.
 */

const CHAR_DELAY = 9;
const LINE_PAUSE = 50;
const HOLD_BEFORE_SHUTDOWN = 280;
const POWER_ON_HOLD = 720;     // matches loader-poweron-line keyframe duration
const SHUTDOWN_HOLD = 700;     // covers shutdown collapse + line flash + zoom

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

  // Hold all reveal animations until the loader fades — so they trigger
  // synchronously with the shutdown→home transition (CSS override).
  document.body.classList.add('is-booting');

  // ── Phase 1: CRT power-on ──
  await sleep(80);                 // brief pure-black moment
  loader.classList.add('is-on');   // triggers scanline expand + terminal scale-in + flicker
  await sleep(POWER_ON_HOLD);      // wait until terminal is solid before typing

  // ── Phase 2: Typewriter ──
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const text = line.dataset.boot || '';
    line.classList.add('is-typing');
    await typewrite(line, text);
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

  // ── Phase 3: CRT shutdown ──
  await sleep(HOLD_BEFORE_SHUTDOWN);
  loader.classList.add('is-shutdown');
  await sleep(SHUTDOWN_HOLD);

  // Drop the booting gate FIRST so page reveals start their transitions
  // (their .is-revealed class is already set; the override above suspended them).
  // Then fade the loader — reveals animate in during the fade overlap.
  document.body.classList.remove('is-booting');
  loader.classList.add('is-loaded');
}
