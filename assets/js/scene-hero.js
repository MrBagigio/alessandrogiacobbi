/**
 * Hero scene v4 — the LP chameleon tail rig, posable in the browser.
 *
 * Replaces v3 (generic PBR icosahedron + particles + floor + 5 lights) with the
 * signature piece a character rigger can actually claim: a skinned tail with a
 * Maya-style joint chain in X-ray and oxblood control curves. Drag the IK
 * control, it follows with stretch; release, it re-coils with per-joint
 * overlap; scroll, the curl attribute un-rolls it. Idle = zero frames.
 *
 * This file is a thin wrapper so main.js keeps `new HeroScene(canvas, opts)`.
 * The rig lives in ./rig/ (tail-chain.js pure solver, tail-scene.js Three).
 *
 * Failure policy: if WebGL is unavailable or the renderer throws, we never add
 * `.hero.is-live`, so the static SVG poster (same solver, same pose) stays —
 * the hero never shows an empty box.
 *
 * Optional Maya sidecar: assets/data/tail_rig.json (see tail-chain.loadSpec).
 * If absent or invalid → procedural log-spiral coil, silently.
 */
import { TailScene, loadTailSpec } from './rig/tail-scene.js?v=20260530-mk15';

export class HeroScene {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{animate?: boolean}} [opts]  animate=false → single static frame
   *        (prefers-reduced-motion); user-initiated drag still works (snaps).
   */
  constructor(canvas, { animate = true } = {}) {
    this.canvas = canvas;
    this.scene = null;
    this.disposed = false;
    const hero = document.querySelector('.hero');
    const anchor = document.querySelector('.hero__rig') || canvas;
    const goLive = () => hero?.classList.add('is-live');

    try {
      this.scene = new TailScene(canvas, { anchor, animate, onFirstFrame: goLive });
    } catch (err) {
      // No WebGL / context lost at creation → poster stays. Log once, quietly.
      console.warn('[hero] tail rig unavailable, keeping poster:', err?.message || err);
      return;
    }

    loadTailSpec('./assets/data/tail_rig.json?v=20260530-tail27').then((spec) => {
      if (!spec || this.disposed) return;
      try {
        const prev = this.scene;
        this.scene = new TailScene(canvas, { anchor, animate, spec, onFirstFrame: goLive });
        prev.dispose();
      } catch (_) { /* keep the procedural scene */ }
    }).catch(() => {});
  }

  dispose() {
    this.disposed = true;
    this.scene?.dispose();
  }
}
