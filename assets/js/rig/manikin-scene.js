/**
 * manikin-scene.js — little rigger's manikins living on the hero headline.
 *
 * They sit on the letters with their legs dangling, walk along the tops of
 * the words, look at your pointer, and can be grabbed and thrown: they turn
 * into ragdolls, land on the letters (or fall between them), lie still for a
 * beat, then get up and carry on. Ink-on-paper, joints drawn as small dots
 * (X-ray, like the tail rig) — "fig. 02 · manikin_rig".
 *
 * How they know where the letters are: we rasterise each headline line on an
 * offscreen 2D canvas with the SAME font/size/letter-spacing the DOM uses,
 * read back the alpha, and build a Skyline (top-of-ink y per x column) in the
 * headline's own coordinate space. Re-sampled on resize and once the display
 * font has loaded. A debug overlay (?manikins=debug) draws the skyline.
 *
 * The overlay <canvas> is a CHILD of the <h1>, so it inherits the headline's
 * mouse-parallax transform for free and stays glued to the glyphs.
 *
 * Cost: 2D canvas, 2 × 11 verlet points. rAF only while the hero is on
 * screen and the tab visible; ~0.1 ms/frame.
 */
import { onPointerMove } from '../pointer.js?v=20260516-pointer';
import {
  Skyline, LayeredSkyline, P, PROP, createManikin, standPose, sitPose, walkPose, crouchPose, applyPose,
  step, drive, gainsPreset, reachHand, mixPose, pin, unpinAll, nearestPoint, bounds, impulse,
} from './manikin-physics.js?v=20260530-mk22';

const INK = '#161310', OX = '#B8323F', PAPER = '#EDE6D6';
/** weighted random pick from [[name, weight], ...] with r in [0,1) */
function weighted(items, r) { const tot = items.reduce((a, [, w]) => a + w, 0) || 1; let acc = 0; for (const [n, w] of items) { acc += w / tot; if (r < acc) return n; } return items[items.length - 1][0]; }
const GRAB_PX = 22;

export class ManikinScene {
  /**
   * @param {HTMLElement} h1   the headline element (position: relative is applied)
   * @param {{count?: number, animate?: boolean, debug?: boolean}} opts
   */
  constructor(h1, { count = 2, animate = true, debug = false } = {}) {
    this.h1 = h1; this.animate = animate; this.debug = debug; this.count = count;
    this.disposed = false; this.visible = true; this.rafId = null;
    this.lastT = performance.now(); this.pointer = { x: 0, y: 0, inside: false };
    this.grab = null;               // {m, i}
    this.hover = null;              // manikin under the pointer
    this.sky = null; this.lines = [];
    this.manikins = [];

    // overlay canvas inside the h1
    const cs = getComputedStyle(h1);
    if (cs.position === 'static') h1.style.position = 'relative';
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'hero__manikins';
    this.canvas.setAttribute('aria-hidden', 'true');
    Object.assign(this.canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '3' });
    h1.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');

    this._bind();
    this._resample().then(() => { this._prevW = this.W; this._prevH = this.H; this._spawn(); this._loop(); });
  }

  /* ───────────────────────── skyline from the DOM text ───────────────────────── */

  async _resample() {
    if (document.fonts?.ready) { try { await document.fonts.ready; } catch (_) {} }
    const h1r = this.h1.getBoundingClientRect();
    const W = Math.max(1, Math.round(h1r.width)), H = Math.max(1, Math.round(h1r.height));
    this.W = W; this.H = H;
    // headroom: a manikin standing on line 1 is ~7u tall and pokes ABOVE the
    // h1 box; a thrown one flies higher still. The canvas extends above/around
    // the box and all drawing is translated by (padX, padTop).
    const fontPx = parseFloat(getComputedStyle(this.h1).fontSize) || 100;
    this.padTop = Math.ceil(fontPx * 1.1); this.padX = Math.ceil(fontPx * 0.5);
    Object.assign(this.canvas.style, { top: `${-this.padTop}px`, left: `${-this.padX}px`, width: `calc(100% + ${2 * this.padX}px)`, height: `calc(100% + ${this.padTop}px)` });
    const dpr = Math.min(2, devicePixelRatio || 1);
    this.dpr = dpr;
    this.canvas.width = Math.round((W + 2 * this.padX) * dpr); this.canvas.height = Math.round((H + this.padTop) * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, this.padX * dpr, this.padTop * dpr);

    // one skyline PER LINE (a single heightmap can't hold two lines: the
    // upper line's tops hide the lower line's under the same columns —
    // measured), stacked in a LayeredSkyline. 2px columns.
    const dx = 2, n = Math.ceil(W / dx);
    const off = document.createElement('canvas');
    this.lines = []; const layers = [];
    // each visible text run = the innermost span inside a .reveal-mask (or the mask itself)
    const runs = [...this.h1.querySelectorAll('.reveal-mask')].map((mask) => mask.querySelector('span') || mask);
    for (const el of runs) {
      const text = el.textContent.replace(/\s+/g, ' ').trim(); if (!text) continue;
      const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
      const fontPx = parseFloat(s.fontSize);
      // rasterise at DOM size
      const cw = Math.ceil(r.width) + 8, ch = Math.ceil(r.height) + 8;
      off.width = cw; off.height = ch;
      const c = off.getContext('2d', { willReadFrequently: true });
      c.clearRect(0, 0, cw, ch);
      c.font = `${s.fontStyle} ${s.fontWeight} ${fontPx}px ${s.fontFamily}`;
      if ('letterSpacing' in c) c.letterSpacing = s.letterSpacing === 'normal' ? '0px' : s.letterSpacing;
      c.textBaseline = 'alphabetic';
      c.fillStyle = '#000';
      // baseline: DOM line box top + ascent. Approximate ascent from font metrics.
      const mt = c.measureText(text);
      const ascent = mt.actualBoundingBoxAscent || fontPx * 0.8;
      // Where is the glyph top inside the DOM box? The inline box is line-height
      // tall; glyphs sit at (lineHeight - (ascent+descent))/2 from its top,
      // roughly. We instead ANCHOR on the measured ink: draw at y=ascent+4 and
      // remember the offset the DOM applies (padding-top of the mask etc.) via
      // the box top; the vertical error is a few px which we correct below by
      // aligning the raster's ink top with the DOM box's text top estimate.
      const measuredW = mt.width;
      const sx = measuredW > 0 ? (r.width / measuredW) : 1;   // canvas vs DOM advance mismatch → scale x
      c.save(); c.scale(sx, 1); c.fillText(text, 4 / sx, ascent + 4); c.restore();
      const img = c.getImageData(0, 0, cw, ch).data;
      // per-column top of ink (in raster space)
      const colTop = new Float32Array(cw).fill(Infinity);
      let inkTop = Infinity, inkBot = -Infinity;
      for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
        if (img[(y * cw + x) * 4 + 3] > 96) { if (y < colTop[x]) colTop[x] = y; if (y < inkTop) inkTop = y; if (y > inkBot) inkBot = y; }
      }
      // vertical placement: the DOM inline box for a display font of size F with
      // line-height L: text top ≈ boxTop + (L - F*(asc+desc)/units)/2 ... too font-
      // specific. Use the CSS "content area": glyph ink top ≈ box.top + (box.height
      // - inkHeight)/2 for our all-caps display font on a single line — measured
      // against real glyphs with the debug overlay and adjusted (padding-bottom
      // of the mask is included in r.height, so we take the mask's own box).
      const mask = el.closest('.reveal-mask') || el;
      const mr = mask.getBoundingClientRect();
      const padB = parseFloat(getComputedStyle(mask).paddingBottom) || 0;
      const inkH = inkBot - inkTop + 1;
      const textBoxH = mr.height - padB;
      const domInkTop = mr.top + (textBoxH - inkH) / 2;         // estimated y of glyph tops in client coords
      const yOff = domInkTop - h1r.top - inkTop;                 // raster y → h1-local y
      const xOff = r.left - h1r.left - 4;                        // raster x → h1-local x
      const tops = new Float32Array(n).fill(Infinity);
      for (let x = 0; x < cw; x++) {
        if (!Number.isFinite(colTop[x])) continue;
        const lx = xOff + x; const col = Math.floor(lx / dx);
        if (col < 0 || col >= n) continue;
        const ly = colTop[x] + yOff;
        if (ly < tops[col]) tops[col] = ly;
      }
      // Bridge the small gaps BETWEEN LETTERS of a word (a few px of no ink at
      // the top) so a word is one continuous walkway and a ragdoll doesn't
      // wedge into a 6px slot. Real word spaces stay gaps. Bridge = linear
      // ramp between the two sides.
      // Two kinds of slot to bridge: (a) no ink at all (upright letters),
      // (b) a narrow PIT — italic letters overhang, so between two tops the
      // column still has ink far below (the previous letter's foot). Both are
      // ≤ bridgeCols wide; a pit must be ≥ 0.22·font deeper than its sides.
      const bridgeCols = Math.round((fontPx * 0.16) / dx), pitDepth = fontPx * 0.22;
      const isSlot = (i, ref) => !Number.isFinite(tops[i]) || tops[i] > ref + pitDepth;
      for (let cIdx = 1; cIdx < n; cIdx++) {
        const ref = tops[cIdx - 1];
        if (!Number.isFinite(ref) || !isSlot(cIdx, ref)) continue;
        let e = cIdx; while (e < n && isSlot(e, ref)) e++;
        const gap = e - cIdx;
        if (e < n && gap <= bridgeCols && Math.abs(tops[e] - ref) < pitDepth) {
          const a = ref, b = tops[e];
          for (let k = 0; k < gap; k++) tops[cIdx + k] = a + (b - a) * ((k + 1) / (gap + 1));
        }
        cIdx = e;
      }
      const lineTop = domInkTop - h1r.top;
      this.lines.push({ el, top: lineTop, bottom: lineTop + inkH, left: r.left - h1r.left, right: r.right - h1r.left, fontPx, tops });
      layers.push({ sky: null, top: lineTop, tops });
    }
    // ground = bottom of the last line's ink (they can fall onto the second line or the floor)
    const ground = this.lines.length ? Math.max(...this.lines.map((l) => l.bottom)) : H;
    for (const l of layers) l.sky = new Skyline(0, dx, l.tops, ground);
    this.sky = layers.length ? new LayeredSkyline(layers, ground) : new Skyline(0, dx, new Float32Array(n).fill(Infinity), ground);
    this.u = this.lines.length ? this.lines[0].fontPx * 0.066 : 10;   // manikin unit ≈ 6.6% of font size (standing ≈ 46% of the cap height)
    // "walkable" continuity: a step between neighbouring 2px columns up to
    // ~1.2u is a slope you walk over (round letter tops), more is a cliff.
    this.STEP = this.u * 2.2;
    // a sittable edge needs room for the shins to hang: drop ≥ 2.4u
    this.DROP = this.u * 2.4;
    if (this.debug) this._drawDebug();
  }

  /* ───────────────────────── population ───────────────────────── */

  _spawn() {
    if (!this.sky) return;
    const edges = this.sky.edges(this.DROP, this.STEP, this.u * 2.2);
    const runs = this.sky.runs(this.STEP, this.u * 4);
    this.manikins = [];
    // #1: sits on the widest sittable edge of line 1 (prefer an edge on the first line)
    const line1 = this.lines[0];
    // prefer the END of line 1 (right edge, legs dangling toward the tail rig)
    const l1 = edges.filter((e) => line1 && Math.abs(e.y - line1.top) < line1.fontPx * 0.5);
    const e1 = l1.filter((e) => e.side === 1).sort((a, b) => b.x - a.x)[0] || l1[0] || edges[0];
    if (e1) {
      const m = createManikin({ x: e1.x, y: e1.y, u: this.u, facing: e1.side, tint: 'ink', id: 0 });
      m.state = 'sit'; m.spot = e1; m.t = 0; m.layerTop = this._layerTopFor(e1.y);
      applyPose(m, sitPose(m, e1.x, e1.y, e1.side, 0), 1);
      this.manikins.push(m);
    }
    // #2: walks along the longest run of the last line
    if (this.count > 1) {
      const lastLine = this.lines[this.lines.length - 1];
      const cand = runs.filter((r) => lastLine && Math.abs(r.yAvg - lastLine.top) < lastLine.fontPx * 0.5).sort((a, b) => (b.x1 - b.x0) - (a.x1 - a.x0));
      const r = cand[0] || runs.sort((a, b) => (b.x1 - b.x0) - (a.x1 - a.x0))[0];
      if (r) {
        const x = r.x0 + (r.x1 - r.x0) * 0.35;
        const m = createManikin({ x, y: this.sky.topAt(x, r.yAvg - 1), u: this.u, facing: 1, tint: 'ox', id: 1 });
        m.state = 'walk'; m.run = r; m.phase = 0; m.speed = this.u * 2.6; m.t = 0; m.pause = 0; m.layerTop = this._layerTopFor(r.yAvg); m.walkX = x; m.dir = 1;
        applyPose(m, walkPose(m, x, (xx) => this.sky.topAt(xx, r.yAvg - 1), 1, 0, 0), 1);
        this.manikins.push(m);
      }
    }
  }

  /* ───────────────────────── input ───────────────────────── */

  _bind() {
    this._onResize = () => {
      clearTimeout(this._rt);
      this._rt = setTimeout(() => {
        // ignore resize events that don't change the headline box (devtools,
        // screenshots, scrollbar flicker) — nothing to re-seat
        const r = this.h1.getBoundingClientRect();
        if (Math.round(r.width) === this.W && Math.round(r.height) === this.H) return;
        this._resample().then(() => this._respawnKeepingStates());
      }, 120);
    };
    window.addEventListener('resize', this._onResize, { passive: true });
    if ('IntersectionObserver' in window) {
      this._io = new IntersectionObserver((e) => { this.visible = e[0]?.isIntersecting ?? true; if (this.visible) this._loop(); }, { threshold: 0 });
      this._io.observe(this.h1);
    }
    this._onVis = () => { if (!document.hidden) { this.lastT = performance.now(); this._loop(); } };
    document.addEventListener('visibilitychange', this._onVis);

    this._unsub = onPointerMove((x, y) => {
      const p = this._toLocal(x, y); this.pointer.x = p.x; this.pointer.y = p.y; this.pointer.cx = x; this.pointer.cy = y;
      this.pointer.inside = p.x >= -this.padX && p.x <= this.W + this.padX && p.y >= -this.padTop && p.y <= this.H + 40;
      if (this.grab) { pin(this.grab.m, this.grab.i, p.x, p.y); return; }
      // hover
      let best = null, bd = GRAB_PX;
      for (const m of this.manikins) { const n = nearestPoint(m, p.x, p.y); if (n.d < bd) { bd = n.d; best = m; } }
      if (best !== this.hover) { this.hover = best; this._cursor(!!best); }
      this._label();
    });
    // capture-phase pointerdown on the document: we sit above the tail canvas,
    // so if a manikin is hit we take the event and nothing else acts on it
    this._onDown = (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      const p = this._toLocal(e.clientX, e.clientY);
      let best = null, bi = -1, bd = GRAB_PX;
      for (const m of this.manikins) { const n = nearestPoint(m, p.x, p.y); if (n.d < bd) { bd = n.d; best = m; bi = n.i; } }
      if (!best) return;
      e.preventDefault(); e.stopPropagation();
      this._startGrab(best, bi, p);
    };
    document.addEventListener('pointerdown', this._onDown, { capture: true });
    this._onUp = () => { if (this.grab) this._endGrab(); };
    window.addEventListener('pointerup', this._onUp); window.addEventListener('pointercancel', this._onUp);
    // touch: same via pointer events (pointerdown fires for touch)
  }

  _toLocal(cx, cy) {
    // inverse of the h1's (slight) 3D parallax is approximated by its bounding rect
    const r = this.canvas.getBoundingClientRect();
    const sx = (this.W + 2 * this.padX) / (r.width || 1), sy = (this.H + this.padTop) / (r.height || 1);
    return { x: (cx - r.left) * sx - this.padX, y: (cy - r.top) * sy - this.padTop };
  }
  _label() {
    if (!this.labelEl) {
      this.labelEl = document.createElement('span');
      this.labelEl.className = 'hero__rig-label hero__mk-label'; this.labelEl.setAttribute('aria-hidden', 'true');
      document.querySelector('.hero')?.appendChild(this.labelEl);
    }
    const m = this.grab?.m || this.hover;
    if (!m) { this.labelEl.style.opacity = 0; return; }
    const st = m.state === 'ragdoll' ? (m.grabbed ? 'ragdoll · grabbed' : 'ragdoll') : m.state;
    this.labelEl.textContent = `manikin_${String(m.id + 1).padStart(2, '0')} · ${st}`;
    // position: client coords of the head, offset up-right, relative to .hero
    const cr = this.canvas.getBoundingClientRect(); const sx = cr.width / (this.W + 2 * this.padX), sy = cr.height / (this.H + this.padTop);
    const hx = cr.left + (m.x[P.HEAD] + this.padX) * sx, hy = cr.top + (m.y[P.HEAD] + this.padTop) * sy;
    const hr = document.querySelector('.hero')?.getBoundingClientRect() || { left: 0, top: 0 };
    this.labelEl.style.transform = `translate(${Math.round(hx - hr.left + 14)}px, ${Math.round(hy - hr.top - 24)}px)`;
    this.labelEl.style.opacity = 1;
  }
  _cursor(on) {
    document.querySelector('.cursor-ring')?.classList.toggle('is-hover', on);
    document.body.style.cursor = on ? 'grab' : '';
  }
  _startGrab(m, i, p) {
    this.grab = { m, i };
    m.state = 'ragdoll'; m.grabbed = true; m.restTime = 0; m.quietTime = 0;
    // prefer grabbing the head or a hand — reads better than the hip
    pin(m, i, p.x, p.y);
    document.querySelector('.hero')?.classList.add('is-dragging');
    document.querySelector('.cursor-ring')?.classList.add('is-grab');
    document.body.style.cursor = 'grabbing';
    // touch: while a manikin is held, the finger must move it, not scroll the page
    this._noScroll = (ev) => ev.preventDefault();
    document.addEventListener('touchmove', this._noScroll, { passive: false });
    this._loop();
  }
  _endGrab() {
    const { m } = this.grab; unpinAll(m); m.grabbed = false; this.grab = null;
    // cap the fling: a flick of the mouse is 1500+ px/s and sent them off the
    // top of the hero for a full second (measured hip y −273)
    const VMAX = 700 / 60; // px per frame
    for (let i = 0; i < P.N; i++) {
      const vx = m.x[i] - m.px[i], vy = m.y[i] - m.py[i], v = Math.hypot(vx, vy);
      if (v > VMAX) { m.px[i] = m.x[i] - vx * (VMAX / v); m.py[i] = m.y[i] - vy * (VMAX / v); }
    }
    document.querySelector('.hero')?.classList.remove('is-dragging');
    document.querySelector('.cursor-ring')?.classList.remove('is-grab');
    document.body.style.cursor = this.hover ? 'grab' : '';
    if (this._noScroll) { document.removeEventListener('touchmove', this._noScroll); this._noScroll = null; }
  }

  _respawnKeepingStates() {
    // After a resize the letters moved/rescaled. Keep the SAME manikin
    // objects (a resize must never teleport them to spawn — measured: every
    // screenshot/devtools resize reset the whole cast) and re-seat each one
    // at the equivalent place on the new skyline.
    if (!this.manikins.length || !this.sky) { this._spawn(); return; }
    const kx = this.W / (this._prevW || this.W); this._prevW = this.W;
    const newU = this.u;
    for (const m of this.manikins) {
      const ratio = newU / m.u; m.u = newU;
      for (const c of m.cons) c[2] *= ratio; for (const st of m.struts) st[2] *= ratio;
      const x = m.x[P.HIP] * kx;
      const layerTop = m.layerTop === undefined ? -Infinity : this._layerTopFor(m.layerTop * (this.H / (this._prevH || this.H)));
      m.layerTop = layerTop;
      if (m.state === 'sit' || m.state === 'sitdown' || m.state === 'climb') {
        const e = this._edgeNear(x, m.spot?.side || 1, layerTop) || this._nearestEdgeAny(x);
        if (e) { m.spot = e; m.layerTop = this._layerTopFor(e.y); m.state = 'sit'; applyPose(m, sitPose(m, e.x, e.y, e.side, m.t, 1), 1); }
      } else if (m.state === 'walk' || m.state === 'stand' || m.state === 'standup' || m.state === 'getup') {
        m.walkX = x; m.run = this._runAt(x, layerTop);
        if (!m.run) { const e = this._nearestEdgeAny(x); if (e) { m.state = 'sit'; m.spot = e; m.layerTop = this._layerTopFor(e.y); applyPose(m, sitPose(m, e.x, e.y, e.side, 0, 1), 1); continue; } }
        m.state = 'stand'; m.brain && (m.brain.act = null);
        applyPose(m, standPose(m, x, this.sky.topAt(x, layerTop - 1), m.dir || 1, m.t), 1);
      } else {
        // ragdoll: scale positions in place, physics takes it from here
        for (let i = 0; i < P.N; i++) { m.x[i] *= kx; m.px[i] *= kx; }
        m.asleep = false;
      }
    }
    this._prevH = this.H;
  }

  /* ───────────────────────── behaviour + frame ───────────────────────── */

  _loop() {
    if (this.disposed || this.rafId !== null || !this.visible || document.hidden) return;
    this.rafId = requestAnimationFrame((t) => this._frame(t));
  }

  _frame(now) {
    this.rafId = null;
    if (this.disposed) return;
    const dt = Math.min(0.05, (now - this.lastT) / 1000); this.lastT = now;
    const sky = this.sky; if (!sky) return;
    this._perceive(dt);
    for (const m of this.manikins) {
      m.t += dt;
      if (!m.brain) this._initBrain(m);
      this._gaze(m, dt);
      this._blink(m, dt);
      if (!this.animate && m.state !== 'ragdoll' && m.state !== 'getup') continue;   // reduced motion: static
      this._think(m, dt);
      this._act(m, dt);
    }
    this._render();
    if (this.grab || this.hover) this._label();
    const anyMoving = this.animate || this.manikins.some((m) => m.state === 'ragdoll' || m.state === 'getup');
    if (anyMoving && this.visible && !document.hidden) this.rafId = requestAnimationFrame((t) => this._frame(t));
  }

  /* ───────────────────────── perception ───────────────────────── */

  _perceive(dt) {
    const p = this.pointer;
    // pointer speed from CLIENT coords (px/s), smoothed — local coords also move
    // when the headline's parallax transform changes, which read as phantom speed
    if (this._pp && p.cx !== undefined) { const v = Math.hypot(p.cx - this._pp.x, p.cy - this._pp.y) / Math.max(dt, 1e-3); p.speed = (p.speed || 0) * 0.7 + v * 0.3; }
    this._pp = { x: p.cx ?? 0, y: p.cy ?? 0 };
    p.fastT = (p.speed || 0) > 900 ? (p.fastT || 0) + dt : 0;
    p.still = (p.speed || 0) < 12 ? (p.still || 0) + dt : 0;
    // tail rig being dragged? (its control point in our local space)
    const heroDragging = document.querySelector('.hero')?.classList.contains('is-dragging') && !this.grab;
    this.tailDrag = null;
    if (heroDragging) {
      const t = document.querySelector('.hero__canvas')?.__tail;
      if (t?.chain?.dragging) { const c = t._jointClient(t.chain.N - 1); this.tailDrag = this._toLocal(c.x, c.y); }
    }
  }

  /* ───────────────────────── brain: personality, gaze, blink ───────────────────────── */

  _initBrain(m) {
    // two temperaments: #0 curious & lively, #1 lazy & calm
    const curious = m.id === 0;
    m.brain = {
      curiosity: curious ? 0.9 : 0.4, energy: curious ? 0.8 : 0.45, calm: curious ? 0.5 : 0.85,
      gaze: { x: m.x[P.HEAD] + m.facing * 40, y: m.y[P.HEAD], tx: 0, ty: 0, hold: 0, mode: 'idle', jitter: 0, pointerHold: 0 },
      blink: { t: 1.5 + Math.random() * 3, closed: 0 },
      act: null,               // current sub-action {name, t, dur, ...}
      idleT: 0,                // time since last sub-action
      startleCd: 0, watchCd: 0,
      shake: 0,                // head-shake timer after landing
    };
    m.look = 0; m.lookY = 0;
  }

  _gaze(m, dt) {
    const b = m.brain, g = b.gaze, u = this.u, p = this.pointer;
    const hx = m.x[P.HEAD], hy = m.y[P.HEAD];
    const other = this.manikins.find((o) => o !== m);
    // choose a target with priorities; hold times make it feel deliberate
    let want = null, mode = g.mode;
    if (this.grab?.m === m) { want = null; mode = 'held'; }
    else if (this.tailDrag) { want = this.tailDrag; mode = 'tail'; }
    else if (other && (other.state === 'ragdoll' || other.state === 'getup' || other.state === 'climb')) { want = { x: other.x[P.HEAD], y: other.y[P.HEAD] }; mode = 'other'; }
    else if (p.inside && ((p.speed || 0) > 60 || Math.hypot(p.x - hx, p.y - hy) < u * 12)) { want = { x: p.x, y: p.y }; mode = 'pointer'; g.pointerHold = 1.2 + b.curiosity; }
    else if (g.pointerHold > 0 && p.inside) { g.pointerHold -= dt; want = { x: p.x, y: p.y }; mode = 'pointer'; }
    else {
      // idle wander: hold a point for a while, then saccade somewhere else
      g.hold -= dt;
      if (g.hold <= 0 || mode !== 'idle') {
        mode = 'idle';
        const r = Math.random();
        if (other && r < 0.25) g.idlePt = { x: other.x[P.HEAD], y: other.y[P.HEAD], follow: true };
        else if (r < 0.45) g.idlePt = { x: hx + (m.facing || 1) * u * (6 + Math.random() * 14), y: hy - u * (Math.random() * 6) };   // ahead / up
        else if (r < 0.65) g.idlePt = { x: hx - (m.facing || 1) * u * (4 + Math.random() * 10), y: hy + u * (Math.random() * 3) };   // glance back
        else g.idlePt = { x: hx + (Math.random() - 0.5) * u * 24, y: hy + u * (2 + Math.random() * 6) };                          // down at the letters
        g.hold = 1.2 + Math.random() * 3.2 * b.calm;
      }
      want = g.idlePt.follow && other ? { x: other.x[P.HEAD], y: other.y[P.HEAD] } : g.idlePt;
    }
    g.mode = mode;
    if (want) { g.tx = want.x; g.ty = want.y; }
    // saccade: fast ease toward target, tiny drift while holding
    const k = mode === 'idle' ? 0.22 : 0.4;
    g.x += (g.tx - g.x) * k; g.y += (g.ty - g.y) * k;
    g.jitter += dt;
    const jx = Math.sin(g.jitter * 3.1) * 0.6 + Math.sin(g.jitter * 7.3) * 0.3, jy = Math.cos(g.jitter * 2.3) * 0.5;
    // head look vector (-1..1) used by poses/render; eye follows faster than head
    const dxg = g.x + jx - hx, dyg = g.y + jy - hy;
    const lx = Math.max(-1, Math.min(1, dxg / (u * 10))), ly = Math.max(-1, Math.min(1, dyg / (u * 10)));
    m.look += (lx - m.look) * 0.12; m.lookY += (ly - m.lookY) * 0.12;
    m.eyeX = lx; m.eyeY = ly;
    m.gazeDir = Math.sign(dxg) || m.facing;
  }

  _blink(m, dt) {
    const bl = m.brain.blink;
    if (bl.closed > 0) { bl.closed -= dt; return; }
    bl.t -= dt;
    if (bl.t <= 0) { bl.closed = 0.11; bl.t = (Math.random() < 0.25 ? 0.25 : 2.2 + Math.random() * 4.5); }
  }

  /* ───────────────────────── brain: decisions ───────────────────────── */

  _think(m, dt) {
    const b = m.brain, p = this.pointer, u = this.u;
    b.startleCd -= dt; b.watchCd -= dt;
    const other = this.manikins.find((o) => o !== m);
    const near = p.inside ? Math.hypot(p.x - m.x[P.HEAD], p.y - m.y[P.HEAD]) : Infinity;

    // reactions preempt (only when awake and not mid-gesture)
    if (m.state !== 'ragdoll' && m.state !== 'getup' && m.state !== 'climb') {
      // startle: the pointer rushes in
      if (b.startleCd <= 0 && near < u * 9 && (p.fastT || 0) > 0.05 && !(b.act && b.act.name === 'startle')) {
        b.act = { name: 'startle', t: 0, dur: 0.55 + 0.4 * (1 - b.calm) }; b.startleCd = 5;
        if (m.state === 'walk') { m.state = 'stand'; m.t = 0; }        // stop dead
        return;
      }
      // watch: the other one gets thrown / falls -> freeze and stare
      if (other && other.state === 'ragdoll' && !other.grabbed && b.watchCd <= 0 && (!b.act || b.act.name !== 'watch')) {
        b.act = { name: 'watch', t: 0, dur: 2.5 + Math.random() * 2 }; b.watchCd = 8; b.wantApproach = b.curiosity > 0.6;
        if (m.state === 'walk') { m.state = 'stand'; m.t = 0; }        // freeze mid-step
        return;
      }
      // approach: once the stare is over, the curious one walks over to where the
      // other lies (if it is on the same walkway) and looks down at it
      if (b.wantApproach && !b.act && other && (other.state === 'ragdoll' || other.state === 'getup') && (m.state === 'stand' || m.state === 'sit' || m.state === 'walk')) {
        b.wantApproach = false;
        const ox = other.x[P.HIP], oy = this.sky.topAt(ox, other.y[P.HIP] - u);
        const myTop = m.layerTop ?? -Infinity;
        if (Math.abs(oy - myTop) < u * 3) {
          const run = this._runAt(ox, myTop), myRun = this._runAt(m.walkX ?? m.x[P.HIP], myTop);
          if (run && myRun && run.x0 === myRun.x0) {
            const goal = ox - Math.sign(ox - m.x[P.HIP]) * u * 3.2;
            if (m.state === 'sit') { m.state = 'standup'; m.t = 0; }
            else { m.state = 'walk'; m.t = 0; m.phase = 0; m.speedK = 0; }
            m.goalX = goal; m.dir = Math.sign(goal - (m.walkX ?? m.x[P.HIP])) || 1; m.walkX = m.walkX ?? m.x[P.HIP];
            return;
          }
        }
      }
    }
    if (b.act) return;                            // busy with a sub-action
    b.idleT += dt;

    // utility pick for the next sub-action, by state
    const rnd = Math.random();
    if (m.state === 'sit') {
      const wantWave = near < u * 8 && (p.still || 0) > 0.6 && b.curiosity > 0.5 && (m.lastWave === undefined || m.t - m.lastWave > 7);
      if (wantWave) { b.act = { name: 'wave', t: 0, dur: 2.0 }; m.lastWave = m.t; return; }
      if (b.idleT < 2.5 + 3 * b.calm) return;   // let the dangle breathe
      const menu = [
        ['kick', 0.25 * b.energy], ['scratch', 0.18], ['leanback', 0.22 * b.calm], ['stretch', 0.15],
        ['lookaround', 0.3], ['standup', m.t > 12 ? 0.22 * b.energy : 0], ['nap', m.t > 26 ? 0.25 * b.calm : 0],
      ];
      const pick = weighted(menu, rnd);
      const durs = { kick: 1.6, scratch: 1.4, leanback: 2.6, stretch: 1.6, lookaround: 2.2, standup: 0.01, nap: 0 };
      if (pick === 'nap') { m.state = 'ragdoll'; m.napping = true; m.napLen = 6 + Math.random() * 6; m.t = 0; }
      else if (pick === 'standup') { m.state = 'standup'; m.t = 0; }
      else b.act = { name: pick, t: 0, dur: durs[pick] };
      b.idleT = 0;
    } else if (m.state === 'stand') {
      if (b.idleT < 1.5) return;
      const pick = weighted([['walk', 0.5 * b.energy + 0.1], ['weightshift', 0.3], ['lookaround', 0.3], ['sitdown', 0.25]], rnd);
      if (pick === 'walk') { m.state = 'walk'; m.t = 0; m.phase = 0; m.walkT = 0; m.dir = m.dir || m.facing || 1; m.speedK = 0; if (Math.random() < 0.5) m.dir = m.gazeDir || m.dir; }
      else if (pick === 'sitdown') { const x0 = m.walkX ?? m.x[P.HIP]; const e = this._edgeNear(x0, m.dir || 1, m.layerTop) || this._edgeNear(x0, -(m.dir || 1), m.layerTop); if (e) { m.state = 'sitdown'; m.spot = e; m.t = 0; } }
      else b.act = { name: pick, t: 0, dur: 1.8 + Math.random() };
      b.idleT = 0;
    } else if (m.state === 'walk') {
      // occasional stop to look around
      if (b.idleT > 3 && rnd < dt * 0.25) { m.state = 'stand'; m.t = 0; b.act = { name: 'lookaround', t: 0, dur: 1.4 + Math.random() * 1.6 }; b.idleT = 0; }
    }
  }

  /* ───────────────────────── act: build target pose and drive ───────────────────────── */

  _act(m, dt) {
    const sky = this.sky, u = this.u, b = m.brain;
    const groundAt = (x) => sky.topAt(x, (m.layerTop ?? -Infinity) - 1);
    const facing = m.facing || 1;
    let pose = null, gains = 'stand', gravity = 1;

    switch (m.state) {
      case 'sit': {
        const sp = m.spot; const side = sp.side;
        // legs: physics does the dangling — the pose only nudges the shins with a
        // slow irregular impulse (two incommensurate sines + rests), never a metronome
        const kick = (b.act && b.act.name === 'kick') ? 1.6 : 1;
        const sw = (Math.sin(m.t * 1.7) * 0.6 + Math.sin(m.t * 2.9 + 1) * 0.4) * (0.35 + 0.65 * Math.max(0, Math.sin(m.t * 0.21))) * kick;
        pose = sitPose(m, sp.x, sp.y, side, m.t, sw);
        gains = 'sit';
        m.facing = side;
        this._applyGesture(m, pose, dt);
        break;
      }
      case 'sitdown': {
        const sp = m.spot; pose = sitPose(m, sp.x, sp.y, sp.side, 0, 0); gains = 'gesture'; m.facing = sp.side;
        if (m.t > 0.9) { m.state = 'sit'; m.t = 0; b.idleT = 0; }
        break;
      }
      case 'stand': {
        const x = m.walkX ?? m.x[P.HIP]; m.walkX = x;
        pose = standPose(m, x, groundAt(x), facing, m.t);
        this._applyGesture(m, pose, dt);
        gains = 'stand';
        break;
      }
      case 'standup': {
        const sp = m.spot; const x = sp.x - sp.side * u * 1.6; m.walkX = x; m.dir = -sp.side; m.facing = m.dir;
        // anticipation: lean forward from the seat, then rise
        const k = Math.min(1, m.t / 0.9);
        const a = sitPose(m, sp.x, sp.y, sp.side, 0, 0), c = crouchPose(m, x, groundAt(x), m.dir, 0.8), st = standPose(m, x, groundAt(x), m.dir, m.t);
        pose = k < 0.45 ? mixPose(a, c, k / 0.45) : mixPose(c, st, (k - 0.45) / 0.55);
        gains = 'gesture';
        if (m.t > 1.0) {
          m.state = 'stand'; m.t = 0; b.idleT = 0.8; m.run = this._runAt(x, m.layerTop);
          if (m.goalX !== undefined) { m.state = 'walk'; m.phase = 0; m.speedK = 0; m.dir = Math.sign(m.goalX - x) || 1; }
        }
        break;
      }
      case 'walk': {
        m.walkT = (m.walkT || 0) + dt;
        const run = m.run || (m.run = this._runAt(m.walkX, m.layerTop));
        m.speedK = Math.min(1, (m.speedK || 0) + dt * 1.6);            // ease in
        const speed = u * (2.0 + 1.2 * b.energy) * m.speedK;
        const nx = m.walkX + m.dir * speed * dt;
        if (m.goalX !== undefined) {
          if (Math.sign(m.goalX - nx) !== m.dir || Math.abs(m.goalX - nx) < u * 0.4) {
            // arrived next to the other one: stand and look down at it for a while
            m.goalX = undefined; m.state = 'stand'; m.t = 0; b.act = { name: 'lookdown', t: 0, dur: 2.5 + Math.random() * 2 }; b.idleT = 0;
            break;
          }
        }
        const margin = u * 1.3;
        const atEnd = run && (nx > run.x1 - margin || nx < run.x0 + margin);
        if (atEnd || !(sky.topAt(nx, (m.layerTop ?? -Infinity) - 1) < sky.ground)) {
          const edge = this._edgeNear(m.walkX, m.dir, m.layerTop);
          if (edge && Math.random() < 0.7) { m.state = 'sitdown'; m.spot = edge; m.t = 0; }
          else { m.dir *= -1; m.facing = m.dir; m.state = 'stand'; m.t = 0; b.act = { name: 'lookaround', t: 0, dur: 0.6 + Math.random() }; b.idleT = 0; }
          break;
        }
        m.walkX = nx; m.phase += dt * (speed / (u * 0.95)) * 1.05;
        m.facing = m.dir;
        pose = walkPose(m, m.walkX, groundAt, m.dir, m.phase, m.t);
        const lean = m.dir * u * 0.25 * m.speedK; pose.x[P.NECK] += lean; pose.x[P.HEAD] += lean * 1.5;   // weight forward
        this._applyGesture(m, pose, dt);
        gains = 'walk';
        break;
      }
      case 'ragdoll': {
        // struggle while held: irregular kicks and reaches
        if (m.grabbed) {
          m.struggleT = (m.struggleT || 0) - dt;
          if (m.struggleT <= 0) {
            m.struggleT = 0.25 + Math.random() * 0.7;
            const pts = [P.LFOOT, P.RFOOT, P.LHAND, P.RHAND, P.LKNEE, P.RKNEE];
            const i = pts[Math.floor(Math.random() * pts.length)];
            const k = u * (0.35 + Math.random() * 0.6) * (0.5 + b.energy);
            m.px[i] -= (Math.random() - 0.5) * k * 2; m.py[i] -= (Math.random() * 0.8) * k;
            m.asleep = false;
          }
        }
        const rest = step(m, dt, sky);
        if (!m.grabbed && rest && m.restTime > (m.napping ? m.napLen : 0.9 + 0.6 * b.calm)) {
          m.state = 'getup'; m.t = 0; m.napping = false;
          m.getupX = m.x[P.HIP]; m.getupY = sky.topAt(m.getupX, m.y[P.HIP] - u);
          m.layerTop = this._layerTopFor(m.getupY);
          m.getupDir = (this.pointer.inside ? (this.pointer.x > m.getupX ? 1 : -1) : (m.dir || 1));
          b.shake = 0.5;
        }
        return;   // physics already stepped
      }
      case 'getup': {
        const gx = m.getupX, gy = m.getupY, d = m.getupDir;
        const onFloor = gy >= sky.ground - 0.5;
        // phase 1: push up onto hands & knees (crouch); phase 2: rise
        const k = m.t / 1.35;
        const cr = crouchPose(m, gx, gy, d, 1), st = standPose(m, gx, gy, d, m.t);
        pose = k < 0.42 ? cr : mixPose(cr, st, Math.min(1, (k - 0.42) / 0.58));
        gains = k < 0.42 ? 'gesture' : 'stand';
        if (m.t > 1.35) {
          m.walkX = gx; m.dir = d; m.facing = d; m.run = this._runAt(gx, m.layerTop);
          if (onFloor) { const t = this._nearestEdgeAny(gx); if (t) { m.state = 'climb'; m.spot = t; m.climbFrom = { x: gx, y: gy }; m.t = 0; break; } }
          m.state = 'stand'; m.t = 0; b.idleT = 0; b.act = { name: 'lookaround', t: 0, dur: 1.2 };
        }
        break;
      }
      case 'climb': {
        const T = 0.9, k = Math.min(1, m.t / T), e = m.spot, f = m.climbFrom;
        const hx = f.x + (e.x - f.x) * k, arc = -Math.sin(Math.PI * k) * u * 3.5;
        const hy = f.y + (e.y - f.y) * k + arc;
        const st = standPose(m, hx, hy + (PROP.thigh + PROP.shin) * u * 0.6, e.side, m.t);
        const si = sitPose(m, e.x, e.y, e.side, 0, 0);
        pose = mixPose(st, si, k * k); gains = 'gesture'; gravity = 0.15;
        if (k >= 1) { m.state = 'sit'; m.layerTop = this._layerTopFor(e.y); m.t = 0; b.idleT = 0; }
        break;
      }
    }
    if (!pose) return;
    // safety net: an act that no state advanced (e.g. set right before a state
    // change) must still expire, or it blocks every future decision
    if (b.act && (m.state === 'sitdown' || m.state === 'standup' || m.state === 'climb' || m.state === 'getup')) { b.act.t += dt; if (b.act.t >= b.act.dur) b.act = null; }
    // head follows the gaze (small offsets), then drive
    const hr = u * 0.42;
    pose.x[P.HEAD] += m.look * hr * 0.6; pose.y[P.HEAD] += m.lookY * hr * 0.35;
    if (b.shake > 0) { b.shake -= dt; pose.x[P.HEAD] += Math.sin(b.shake * 40) * u * 0.25 * b.shake; }
    drive(m, pose, gainsPreset(gains), 0.14);
    step(m, dt, sky, { noSleep: true, gravity });
  }

  /** Sub-action overlays on the current pose (arm gestures, torso lean, startle crouch). */
  _applyGesture(m, pose, dt) {
    const b = m.brain, a = b.act; if (!a) return;
    a.t += dt; const u = this.u, k = a.t / a.dur, side = m.facing || 1;
    const env = Math.sin(Math.PI * Math.min(1, k));                    // 0->1->0 envelope
    switch (a.name) {
      case 'wave': {
        const hand = side > 0 ? P.RHAND : P.LHAND, elb = side > 0 ? P.RELB : P.LELB;
        const wag = Math.sin(a.t * 13) * 0.55 * env;
        const tx = pose.x[P.NECK] + side * (0.9 + 0.5 * env) * u + Math.sin(wag) * u * 1.4;
        const ty = pose.y[P.NECK] - (0.2 + 1.5 * env) * u;
        reachHand(pose, m, elb, hand, tx, ty, side);
        break;
      }
      case 'scratch': {
        const hand = side > 0 ? P.RHAND : P.LHAND, elb = side > 0 ? P.RELB : P.LELB;
        const tx = pose.x[P.HEAD] + side * u * 0.5 + Math.sin(a.t * 18) * u * 0.15 * env, ty = pose.y[P.HEAD] - u * 0.35 * env + (1 - env) * u * 2;
        reachHand(pose, m, elb, hand, tx, ty, side);
        break;
      }
      case 'stretch': {
        reachHand(pose, m, P.LELB, P.LHAND, pose.x[P.NECK] - u * 0.6, pose.y[P.NECK] - u * 2.6 * env, -1);
        reachHand(pose, m, P.RELB, P.RHAND, pose.x[P.NECK] + u * 0.6, pose.y[P.NECK] - u * 2.6 * env, 1);
        pose.y[P.NECK] -= u * 0.25 * env; pose.y[P.HEAD] -= u * 0.35 * env;
        break;
      }
      case 'leanback': {
        pose.x[P.NECK] -= side * u * 0.7 * env; pose.x[P.HEAD] -= side * u * 0.9 * env; pose.y[P.HEAD] -= u * 0.15 * env;
        m.lookY += (-0.6 - m.lookY) * 0.1;
        break;
      }
      case 'kick': break;                          // handled by the dangle multiplier
      case 'lookaround': break;                    // gaze system does it
      case 'weightshift': {
        const sh = Math.sin(a.t * 1.6) * u * 0.35 * env; pose.x[P.HIP] += sh; pose.x[P.NECK] += sh * 1.3; pose.x[P.HEAD] += sh * 1.4;
        break;
      }
      case 'startle': {
        // flinch: quick crouch + arms up, then release
        const q = Math.min(1, a.t / 0.12) * (1 - Math.max(0, (k - 0.55) / 0.45));
        pose.y[P.HIP] += u * 0.5 * q; pose.y[P.NECK] += u * 0.6 * q; pose.y[P.HEAD] += u * 0.7 * q;
        pose.x[P.NECK] -= side * u * 0.3 * q; pose.x[P.HEAD] -= side * u * 0.5 * q;
        reachHand(pose, m, P.LELB, P.LHAND, pose.x[P.NECK] - u * 1.2, pose.y[P.NECK] - u * 0.6 * q + u * (1 - q) * 1.6, -1);
        reachHand(pose, m, P.RELB, P.RHAND, pose.x[P.NECK] + u * 1.2, pose.y[P.NECK] - u * 0.6 * q + u * (1 - q) * 1.6, 1);
        break;
      }
      case 'lookdown': {
        const other = this.manikins.find((o) => o !== m); if (!other) break;
        const dir = Math.sign(other.x[P.HEAD] - m.x[P.HEAD]) || 1;
        pose.x[P.NECK] += dir * u * 0.55 * env; pose.y[P.NECK] += u * 0.25 * env; pose.x[P.HEAD] += dir * u * 0.9 * env; pose.y[P.HEAD] += u * 0.45 * env;
        m.brain.gaze.tx = other.x[P.HEAD]; m.brain.gaze.ty = other.y[P.HEAD]; m.brain.gaze.mode = 'other';
        break;
      }
      case 'watch': {
        const other = this.manikins.find((o) => o !== m); if (!other) break;
        const dir = Math.sign(other.x[P.HEAD] - m.x[P.HEAD]) || 1;
        pose.x[P.NECK] += dir * u * 0.35 * env; pose.x[P.HEAD] += dir * u * 0.55 * env;
        break;
      }
    }
    if (a.t >= a.dur) { b.act = null; b.idleT = 0; }
  }

  _nearestEdgeAny(x) {
    const es = this.sky.edges(this.DROP, this.STEP, this.u * 2.2);
    es.sort((a, b) => Math.hypot(a.x - x, 0) - Math.hypot(b.x - x, 0));
    return es[0] || null;
  }
  _runAt(x, layerTop = -Infinity) { return this.sky.runs(this.STEP, this.u * 3).find((r) => x >= r.x0 && x <= r.x1 && Math.abs(r.yAvg - layerTop) < this.u * 3) || null; }
  _layerTopFor(y) { let best = -Infinity, bd = Infinity; for (const l of this.lines) { const d = Math.abs(l.top - y); if (d < bd) { bd = d; best = l.top; } } return best; }
  _edgeNear(x, dir, layerTop = -Infinity) {
    const es = this.sky.edges(this.DROP, this.STEP, this.u * 2.2).filter((e) => e.side === dir && Math.abs(e.x - x) < this.u * 4 && (layerTop === -Infinity || Math.abs(e.y - layerTop) < this.u * 3));
    es.sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x));
    return es[0] || null;
  }

  /* ───────────────────────── render ───────────────────────── */

  _render() {
    const c = this.ctx; c.clearRect(-this.padX, -this.padTop, this.W + 2 * this.padX, this.H + this.padTop);
    if (this.debug) this._drawDebug();
    for (const m of this.manikins) this._drawManikin(c, m);
  }

  _drawManikin(c, m) {
    // Both manikins are INK with a paper halo under every stroke: an oxblood
    // figure on the oxblood line (or an ink one lying on an ink letter) was
    // invisible. The halo cuts them out of whatever they stand on. The tint
    // only changes the accent (joints, eye).
    const u = m.u, ink = INK, accent = m.tint === 'ox' ? OX : OX;
    const lw = Math.max(1.5, u * 0.21);
    c.lineCap = 'round'; c.lineJoin = 'round';
    const seg = (a, b) => { c.beginPath(); c.moveTo(m.x[a], m.y[a]); c.lineTo(m.x[b], m.y[b]); c.stroke(); };
    const body = (w) => {
      // line-weight variation like a pen drawing: torso heaviest, upper limbs
      // medium, forearms/shins lighter, neck light
      c.lineWidth = w * 1.25; seg(P.NECK, P.HIP);
      c.lineWidth = w * 1.0; seg(P.HIP, P.LKNEE); seg(P.HIP, P.RKNEE); seg(P.NECK, P.LELB); seg(P.NECK, P.RELB);
      c.lineWidth = w * 0.85; seg(P.LKNEE, P.LFOOT); seg(P.RKNEE, P.RFOOT); seg(P.LELB, P.LHAND); seg(P.RELB, P.RHAND);
      c.lineWidth = w * 0.8; c.beginPath(); c.moveTo(m.x[P.HEAD], m.y[P.HEAD]); c.lineTo(m.x[P.NECK], m.y[P.NECK]); c.stroke();
    };
    // halo pass
    c.strokeStyle = PAPER; body(lw * 2.8);
    const hrH = u * 0.42;
    c.beginPath(); c.arc(m.x[P.HEAD], m.y[P.HEAD], hrH + lw * 0.9, 0, Math.PI * 2); c.fillStyle = PAPER; c.fill();
    // ink pass
    c.strokeStyle = ink; body(lw);
    // feet: tiny ticks
    c.lineWidth = lw * 0.9;
    for (const [k, f] of [[P.LKNEE, P.LFOOT], [P.RKNEE, P.RFOOT]]) {
      const dx = m.x[f] - m.x[k], dy = m.y[f] - m.y[k], d = Math.hypot(dx, dy) || 1;
      const nx = -dy / d, ny = dx / d;                     // perpendicular to the shin
      const dir = (m.dir || m.facing || 1);
      c.beginPath(); c.moveTo(m.x[f], m.y[f]); c.lineTo(m.x[f] + nx * u * 0.42 * dir, m.y[f] + ny * u * 0.42 * dir); c.stroke();
    }
    // head: paper disc with ink rim, eye dot that looks around
    const hr = u * 0.42;
    c.beginPath(); c.arc(m.x[P.HEAD], m.y[P.HEAD], hr, 0, Math.PI * 2);
    c.fillStyle = PAPER; c.fill(); c.lineWidth = lw; c.strokeStyle = ink; c.stroke();
    // neck
    c.beginPath(); c.moveTo(m.x[P.HEAD], m.y[P.HEAD] + hr * 0.9); c.lineTo(m.x[P.NECK], m.y[P.NECK]); c.stroke();
    // eye: follows the gaze in 2D, blinks (a short line while closed)
    const facing = m.facing || m.dir || 1;
    const ex = m.x[P.HEAD] + (m.eyeX ?? m.look) * hr * 0.42 + facing * hr * 0.18, ey = m.y[P.HEAD] + (m.eyeY ?? 0) * hr * 0.3 - hr * 0.08;
    const closed = m.brain?.blink?.closed > 0;
    c.fillStyle = c.strokeStyle = m.tint === 'ox' ? OX : ink;
    if (closed) { c.lineWidth = Math.max(1, u * 0.09); c.beginPath(); c.moveTo(ex - hr * 0.28, ey); c.lineTo(ex + hr * 0.28, ey); c.stroke(); }
    else { c.beginPath(); c.arc(ex, ey, Math.max(0.9, u * 0.09), 0, Math.PI * 2); c.fill(); }
    // joints: X-ray dots in the accent colour
    const jr = Math.max(1.2, u * 0.13);
    c.fillStyle = accent;
    for (const i of [P.NECK, P.HIP, P.LKNEE, P.RKNEE, P.LELB, P.RELB]) { c.beginPath(); c.arc(m.x[i], m.y[i], jr, 0, Math.PI * 2); c.fill(); }
    // grabbed: highlight the pinned point
    if (m.grabbed) { for (let i = 0; i < P.N; i++) if (m.pinned[i]) { c.beginPath(); c.arc(m.x[i], m.y[i], jr * 2.2, 0, Math.PI * 2); c.strokeStyle = OX; c.lineWidth = 1; c.stroke(); } }
  }

  _drawDebug() {
    const c = this.ctx, s = this.sky; if (!s) return;
    c.save(); c.strokeStyle = 'rgba(184,50,63,0.9)'; c.lineWidth = 1; c.beginPath();
    for (let i = 0; i < s.n; i++) { const t = s.tops[i]; if (!Number.isFinite(t)) continue; const x = s.x0 + i * s.dx; c.moveTo(x, t); c.lineTo(x + s.dx, t); }
    c.stroke();
    c.strokeStyle = 'rgba(0,120,255,0.8)'; c.beginPath(); c.moveTo(0, s.ground); c.lineTo(this.W, s.ground); c.stroke();
    for (const e of s.edges(this.DROP, this.STEP, this.u * 2.2)) { c.fillStyle = e.side > 0 ? 'rgba(0,160,0,0.9)' : 'rgba(0,0,255,0.9)'; c.fillRect(e.x - 2, e.y - 6, 4, 6); }
    c.restore();
  }

  dispose() {
    this.disposed = true;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this._io?.disconnect(); this._unsub?.();
    window.removeEventListener('resize', this._onResize);
    document.removeEventListener('visibilitychange', this._onVis);
    document.removeEventListener('pointerdown', this._onDown, { capture: true });
    window.removeEventListener('pointerup', this._onUp); window.removeEventListener('pointercancel', this._onUp);
    this.canvas.remove(); this.labelEl?.remove();
  }
}
