/**
 * boot.js — CRT power-on → typewriter → CRT shutdown → home.
 *
 * SHORT boot (~1.3 s), shown ONCE PER SESSION. The original 3.3 s version ran
 * on every load and an audit killed it ("boot cost real visitors"): a visitor
 * coming back from a project page paid it again. Now:
 *   - an inline script in <head> arms it (html.boot-armed) only on the first
 *     page of a session, BEFORE first paint, so repeat loads never flash black;
 *   - the sequence is 3 lines instead of 5 and every phase is ~half as long;
 *   - a click / tap / key skips to the end;
 *   - prefers-reduced-motion replaces the whole thing with a 220 ms fade.
 *
 * Timeline (≈1.3 s):
 *    0   ms  black
 *   60   ms  .is-on → power-on line stretches + terminal scales in
 *  380   ms  terminal solid, typewriter starts
 * ~790   ms  last line typed (3 lines, 4 ms/char + 30 ms pauses)
 * +120   ms  hold with blinking cursor
 *  910   ms  .is-shutdown → collapse to a line, white flash
 * 1290   ms  .is-loaded → loader fades (360 ms), page revealed
 *
 * The CSS phase durations live in --boot-poweron / --boot-shutdown on .loader
 * (assets/css/animations.css) and MUST match POWER_ON_HOLD / SHUTDOWN_HOLD.
 */

const CHAR_MS = 4;             // typing budget per character (time-driven, see typewrite)
const LINE_PAUSE = 30;
const HOLD_BEFORE_SHUTDOWN = 120;
const POWER_ON_HOLD = 320;     // matches --boot-poweron
const SHUTDOWN_HOLD = 380;     // matches --boot-shutdown (collapse + flash)

/** True when the page was armed for a boot (first load of the session). */
export function isBootArmed() {
  return document.documentElement.classList.contains('boot-armed');
}

export async function runBootSequence() {
  const loader = document.querySelector('.loader');
  if (!loader) return;

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const lines = loader.querySelectorAll('.loader__boot-line');

  const finish = () => {
    document.body.classList.remove('is-booting');
    loader.classList.add('is-loaded');
    document.documentElement.classList.remove('boot-armed');
  };

  if (reduced || !lines.length) {
    await new Promise((r) => setTimeout(r, 220));
    finish();
    return;
  }

  // ── skip: any click / tap / key ends the sequence immediately ──
  let skipped = false;
  let onSkip = null;
  const skipping = new Promise((resolve) => {
    onSkip = () => { skipped = true; resolve(); };
    loader.addEventListener('pointerdown', onSkip, { once: true });
    window.addEventListener('keydown', onSkip, { once: true });
  });
  const unbindSkip = () => {
    if (!onSkip) return;
    loader.removeEventListener('pointerdown', onSkip);
    window.removeEventListener('keydown', onSkip);
    onSkip = null;
  };
  // every wait races the skip, so a tap cuts straight to the shutdown
  const wait = (ms) => Promise.race([new Promise((r) => setTimeout(r, ms)), skipping]);

  // Time-driven, not one setTimeout per character: nested 4 ms timers get
  // clamped (measured 8 ms effective → the typing phase ran 250 ms long) and
  // stutter under load. rAF + elapsed time keeps the budget exact.
  function typewrite(el, text) {
    const ms = Math.max(1, text.length * CHAR_MS);
    return new Promise((resolve) => {
      const t0 = performance.now();
      (function frame(now) {
        if (skipped) { el.textContent = text; resolve(); return; }
        const k = Math.min(1, (now - t0) / ms);
        el.textContent = text.slice(0, Math.round(k * text.length));
        if (k >= 1) { resolve(); return; }
        requestAnimationFrame(frame);
      })(t0);
    });
  }

  // Hold all reveal animations until the loader fades — so they trigger
  // synchronously with the shutdown→home transition (CSS override).
  document.body.classList.add('is-booting');

  // ── Phase 1: CRT power-on ──
  await wait(60);                  // brief pure-black moment
  loader.classList.add('is-on');   // scanline expand + terminal scale-in + flicker
  await wait(POWER_ON_HOLD);       // wait until the terminal is solid before typing

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
    if (!skipped) await wait(LINE_PAUSE);
  }

  // ── Phase 3: CRT shutdown ── (always played, even when skipped: it IS the
  // transition into the page — cutting it would leave a hard black-to-paper jump)
  unbindSkip();
  if (!skipped) await new Promise((r) => setTimeout(r, HOLD_BEFORE_SHUTDOWN));
  loader.classList.add('is-shutdown');
  await new Promise((r) => setTimeout(r, SHUTDOWN_HOLD));

  // Drop the booting gate FIRST so page reveals start their transitions
  // (their .is-revealed class is already set; the override above suspended them).
  // Then fade the loader — reveals animate in during the fade overlap.
  finish();
}
