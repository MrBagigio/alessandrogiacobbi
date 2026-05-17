/**
 * pointer.js — shared, rAF-coalesced pointer position.
 *
 * Before this module: 4+ separate window/document mousemove listeners
 * (cursor.js, scene-hero.js, sys-strip.js, rig-view.js) each fired
 * synchronously per move. On a 120Hz pointer that's 4 callbacks × 120/s.
 *
 * Now: ONE global listener stores the latest position, and a single rAF
 * fans out to all subscribers at most once per frame (≤60Hz). Subscribers
 * get the same fresh (x, y) read each frame; only one event-loop callback
 * per pointer event regardless of how many modules listen.
 *
 * API:
 *   import { onPointerMove, getPointer } from './pointer.js';
 *   const unsub = onPointerMove((x, y) => { ... });
 *   const { x, y } = getPointer();
 *   unsub();
 */

let _x = 0;
let _y = 0;
const _listeners = new Set();
let _rafQueued = false;

function _flush() {
  _rafQueued = false;
  _listeners.forEach((fn) => {
    try { fn(_x, _y); } catch (e) { /* don't let one bad listener kill the rest */ }
  });
}

function _onMove(e) {
  _x = e.clientX;
  _y = e.clientY;
  if (!_rafQueued && _listeners.size > 0) {
    _rafQueued = true;
    requestAnimationFrame(_flush);
  }
}

// Capture early so position is current even before any module subscribes.
window.addEventListener('mousemove', _onMove, { passive: true });

// Touch fallback — first touch contact updates the pointer too,
// so HUDs that read getPointer() get something sensible on mobile.
window.addEventListener('touchmove', (e) => {
  const t = e.touches[0];
  if (!t) return;
  _x = t.clientX;
  _y = t.clientY;
  if (!_rafQueued && _listeners.size > 0) {
    _rafQueued = true;
    requestAnimationFrame(_flush);
  }
}, { passive: true });

export function onPointerMove(fn) {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

export function getPointer() {
  return { x: _x, y: _y };
}
