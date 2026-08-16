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
 * Optional Maya sidecar: assets/data/tail_rig.json (see tail-chain.loadSpec).
 * If absent or invalid → procedural log-spiral coil, silently.
 */
import { TailScene, loadTailSpec } from './rig/tail-scene.js?v=20260530-tail16';

export class HeroScene {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{animate?: boolean}} [opts]  animate=false → single static frame
   *        (prefers-reduced-motion); user-initiated drag still works.
   */
  constructor(canvas, { animate = true } = {}) {
    this.canvas = canvas;
    this.scene = null;
    this.disposed = false;
    const anchor = document.querySelector('.hero__rig') || canvas;
    // Kick off spec fetch and scene build in parallel; the scene starts
    // procedural and is rebuilt only if a valid JSON arrives (rare, ~1 KB).
    this.scene = new TailScene(canvas, { anchor, animate });
    loadTailSpec('./assets/data/tail_rig.json').then((spec) => {
      if (!spec || this.disposed) return;
      const prev = this.scene;
      this.scene = new TailScene(canvas, { anchor, animate, spec });
      prev.dispose();
      document.querySelector('.hero')?.classList.add('is-live');
    }).catch(() => {});
    // First frame is scheduled by TailScene itself; mark live once it exists.
    requestAnimationFrame(() => document.querySelector('.hero')?.classList.add('is-live'));
  }

  dispose() {
    this.disposed = true;
    this.scene?.dispose();
  }
}
