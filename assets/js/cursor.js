/**
 * Magnetic cursor — dot + ring with mix-blend-mode difference.
 * Disabled on touch devices automatically (CSS @media).
 *
 * Pointer position comes from the shared pointer module (one global
 * listener fans out via rAF to every consumer).
 */
import { onPointerMove } from './pointer.js?v=20260530-pm';

export class Cursor {
  constructor() {
    this.dot = document.querySelector('.cursor-dot');
    this.ring = document.querySelector('.cursor-ring');
    if (!this.dot || !this.ring) return;
    // The CSS `cursor: none` rule is gated on this class, so the native cursor
    // is only hidden when the custom one actually exists (reduced-motion
    // desktops and narrow→wide resizes used to end up with NO cursor at all).
    document.documentElement.classList.add('has-custom-cursor');

    this.x = window.innerWidth / 2;
    this.y = window.innerHeight / 2;
    this.tx = this.x;
    this.ty = this.y;
    this._raf = null;
    this._disposed = false;

    this.bind();
    this.animate();
  }

  bind() {
    this._unsub = onPointerMove((x, y) => {
      this.tx = x;
      this.ty = y;
      // Dot tracks pointer 1:1 — no lerp needed
      this.dot.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      this.animate();                       // wake the ring's easing loop
    });

    // Hover targets — ring grows on interactive elements
    const targets = document.querySelectorAll('a, button, .project-card, .showreel__placeholder');
    targets.forEach((el) => {
      el.addEventListener('mouseenter', () => this.ring.classList.add('is-hover'));
      el.addEventListener('mouseleave', () => this.ring.classList.remove('is-hover'));
    });
  }

  /** Ease the ring toward the pointer. The loop STOPS once it has caught up
   *  (it used to rAF forever at 60 fps for the whole session, re-binding a new
   *  closure every frame, even with the pointer parked); onPointerMove wakes it. */
  animate() {
    if (this._raf !== null && this._raf !== undefined) return;
    const step = () => {
      this._raf = null;
      if (this._disposed) return;
      this.x += (this.tx - this.x) * 0.18;
      this.y += (this.ty - this.y) * 0.18;
      this.ring.style.transform = `translate(${this.x}px, ${this.y}px) translate(-50%, -50%)`;
      if (Math.abs(this.tx - this.x) > 0.05 || Math.abs(this.ty - this.y) > 0.05) this._raf = requestAnimationFrame(step);
    };
    this._raf = requestAnimationFrame(step);
  }

  dispose() {
    this._disposed = true;
    if (this._raf != null) { cancelAnimationFrame(this._raf); this._raf = null; }
    if (this._unsub) this._unsub();
    document.documentElement.classList.remove('has-custom-cursor');
  }
}
