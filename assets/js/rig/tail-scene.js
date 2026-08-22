/**
 * tail-scene.js — the hero signature piece: the LP chameleon's prehensile tail,
 * rigged and posable in the browser. Ink-on-paper look, Maya-style joint
 * pyramids in X-ray, oxblood control curves. Drag the IK control → the tail
 * un-coils and follows with stretch; release → it re-coils with per-joint
 * overlap. Scroll → the curl attribute un-rolls it. Idle → ZERO frames.
 *
 * Draw calls: fill + hull + instanced joints + control lines = 4.
 * Renders on demand only (dirty flag), IO-gated, DPR-capped, with a governor
 * that steps down hatching → DPR before it would ever drop frames.
 */
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { onPointerMove } from '../pointer.js?v=20260530-pm';
import { TAIL_VERT, TAIL_FRAG } from './tail-shaders.js?v=20260530-tail13';
import {
  proceduralSpec, loadSpec, buildChain, solveFK, solveIK, forward,
  stepSprings, settle, MAX_STRETCH,
} from './tail-chain.js?v=20260530-tail26';

// Tube tones. NOT the page's paper2/paper3: those were within a few points of
// the page background, so the lit half of the tube was invisible against it
// and only the inverted hull (ink) read — the whole tail looked solid black.
// Lit = a warm mid-paper clearly darker than the bg; shadow = deeper still.
const PAPER  = 0xEDE6D6, INK = 0x161310, OX = 0xB8323F;
const TUBE_LIT = 0xD9CFB6, TUBE_SHADE = 0xC4B899;
const RADIAL = 16;              // ring vertices
const RINGS_PER_SEG = 6;
const TILT_DEG = 12;            // fixed 3/4 tilt of the "plate"
const HOVER_PX = 22, GRAB_PX = 36;
const CURL_REST = 0.70, CURL_END = 0.15;
/** Tube radius at the base as a fraction of total chain length. A real
 *  chameleon tail is ~1/14 of its length thick at the base. */
const BASE_RADIUS = 0.072;

export class TailScene {
  constructor(canvas, { anchor, animate = true, spec = null, onFirstFrame = null } = {}) {
    this.canvas = canvas;
    this.onFirstFrame = onFirstFrame;
    this._framed = false;
    this.anchor = anchor || canvas;      // element whose rect frames the tail
    this.animate = animate;
    this.disposed = false;
    this.visible = true;
    this.dirty = true;
    this.rafId = null;
    this.hoverJoint = -1;
    this.bloom = 0; this.bloomTarget = 0;
    this.ikBlendTarget = 0;
    this.lastT = performance.now();
    this.pointer = { x: 0, y: 0 };
    this.frameTimes = [];
    this.hatchOn = 1;

    this.chain = buildChain(spec || proceduralSpec());
    this.chain.curl = CURL_REST;
    solveFK(this.chain); settle(this.chain); forward(this.chain);

    // debug/QA handle (read-only use): document.querySelector('.hero__canvas').__tail
    canvas.__tail = this;

    this._initRenderer();
    this._buildTube();
    this._buildJoints();
    this._buildControls();
    this._bind();
    this._layout();
    this.requestRender();
  }

  /* ───────────────────────── setup ───────────────────────── */

  _initRenderer() {
    const coarse = matchMedia('(pointer: coarse)').matches;
    this.dprCap = coarse ? 1.5 : 2;
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.dprCap));
    this.renderer.setClearColor(0x000000, 0);
    this.scene = new THREE.Scene();
    // Ortho camera looking straight down -Z; world units == CSS px, origin at
    // the canvas top-left, +Y down (we flip the root's Y so chain +Y is "up").
    // Ortho near/far: the root is tilted 12° about Y and scaled to hundreds
    // of css px, so tube vertices reach z = ±(x·sin12°·scale) ≈ ±100 world
    // units. A tight [0.1, 50] frustum clipped a sliver of the tube near
    // the base against the near plane (measured: a background-coloured
    // diamond where no fragments were produced). Ortho near may be negative.
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -2000, 2000);
    this.camera.position.set(0, 0, 10);
    this.root = new THREE.Group();     // positioned/scaled into the anchor rect
    // the 3/4 "plate" tilt lives on the root, not the camera, so screen-space
    // math (hit-tests, labels) stays a plain 2D transform
    this.root.rotation.y = THREE.MathUtils.degToRad(TILT_DEG);
    this.scene.add(this.root);
  }

  _buildTube() {
    const c = this.chain, N = c.N;
    const SEG = RINGS_PER_SEG * (N - 1);
    const L = c.totalLen;
    const pos = [], nor = [], idx = [], si = [], sw = [];
    // cumulative bind x per joint (straight along +X)
    const jx = [0]; for (let i = 1; i < N; i++) jx.push(jx[i - 1] + c.lengths[i - 1]);
    for (let s = 0; s <= SEG; s++) {
      const t = s / SEG, x = t * L;
      // joint float index by arc length
      let jf = N - 1; for (let i = 1; i < N; i++) if (x <= jx[i]) { jf = i - 1 + (x - jx[i - 1]) / (jx[i] - jx[i - 1] || 1); break; }
      const ri = Math.floor(jf), rf = jf - ri;
      const r = (c.radii[Math.min(ri, N - 1)] * (1 - rf) + c.radii[Math.min(ri + 1, N - 1)] * rf) * BASE_RADIUS * L;
      // Skin weights: the 4 nearest joints (clamped into range), gaussian
      // falloff, normalised. Always the SAME 4 slots in the same order for
      // neighbouring rings → weights vary continuously along the tube. The
      // previous "pick top-3 by weight, then sort" re-ordered slots between
      // adjacent rings and produced a torn quad near the base (measured).
      const j0 = Math.max(1, Math.min(N - 3, Math.floor(jf)));
      const cand = [j0 - 1, j0, j0 + 1, j0 + 2];
      const ws = cand.map((j) => Math.exp(-((jf - j) ** 2) / (2 * 0.6 * 0.6)));
      const sum = ws.reduce((a, w) => a + w, 0) || 1;
      for (let k = 0; k <= RADIAL; k++) {
        const a = (k / RADIAL) * Math.PI * 2, cy = Math.cos(a), sz = Math.sin(a);
        pos.push(x, cy * r, sz * r); nor.push(0, cy, sz);
        si.push(cand[0], cand[1], cand[2], cand[3]);
        sw.push(ws[0] / sum, ws[1] / sum, ws[2] / sum, ws[3] / sum);
      }
    }
    // Winding: CCW as seen from OUTSIDE the tube (ring angle a runs +Y→+Z
    // about +X, rings advance along +X). Getting this backwards made
    // FrontSide render the tube's INTERIOR — the fill had holes over the
    // whole outer wall of the coil and the BackSide hull filled them with
    // ink. Verified by rendering fill alone in green: outer wall missing.
    for (let s = 0; s < SEG; s++) for (let k = 0; k < RADIAL; k++) {
      const a = s * (RADIAL + 1) + k, b = a + RADIAL + 1;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
    // No end caps: the tube is DoubleSide (see fillMat), so the open mouth at
    // the base reads as the tail's cross-section in shadow — like a cut in a
    // technical plate. Cap-fans were tried and produced winding/skin artefacts
    // (a stray quad) for zero visual gain.
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    g.setIndex(idx);
    g.computeBoundingSphere();

    this.bones = [];
    for (let i = 0; i < N; i++) {
      const b = new THREE.Bone();
      b.position.x = i === 0 ? 0 : c.lengths[i - 1];
      if (i) this.bones[i - 1].add(b);
      this.bones.push(b);
    }
    this.skeleton = new THREE.Skeleton(this.bones);

    const mkUniforms = () => ({
      uStretch: { value: 1 }, uHullPx: { value: 0 }, uScale: { value: 1 }, uBone: { value: -1 },
      // key from top-left-front: on an ortho tube the "up" half of each ring
      // catches it → clean 2-tone split along the length (engraving look)
      uLightDir: { value: new THREE.Vector3(-0.35, 0.55, 0.76).normalize() },
      uPaper2: { value: new THREE.Color(TUBE_LIT) }, uPaper3: { value: new THREE.Color(TUBE_SHADE) },
      uInk: { value: new THREE.Color(INK) }, uOx: { value: new THREE.Color(OX) },
      uBloom: { value: 0 }, uHatch: { value: 1 }, uHatchPeriod: { value: 0.035 * L },
    });
    // DoubleSide: the tube's interior (visible through the base mouth and on
    // tight bends under the 12° tilt) renders as deep shade instead of a hole
    // that the ink hull would otherwise fill solid. gl_FrontFacing decides.
    this.fillMat = new THREE.ShaderMaterial({ vertexShader: TAIL_VERT, fragmentShader: TAIL_FRAG, uniforms: mkUniforms(), side: THREE.DoubleSide });
    // Inverted hull: BackSide, offset outward, drawn FIRST, and — critically —
    // it must NOT write depth. On a coil the back faces of one turn sit in
    // front of the front faces of the next turn; if the hull wrote depth it
    // would occlude the neighbouring fill (measured: everything past the first
    // straight run rendered solid black).
    // polygonOffset pushes the hull BEHIND the fill in depth by a fixed bias.
    // Without it, wherever the tube is seen edge-on (most of a coil under an
    // ortho camera) fill and expanded hull sit at near-identical depth and the
    // hull wins the z-test in patches → solid ink (measured, 3 iterations).
    this.hullMat = new THREE.ShaderMaterial({
      vertexShader: TAIL_VERT, fragmentShader: TAIL_FRAG, uniforms: mkUniforms(), defines: { OUTLINE: 1 },
      side: THREE.BackSide, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 4,
    });

    this.fill = new THREE.SkinnedMesh(g, this.fillMat);
    this.fill.add(this.bones[0]);
    this.fill.bind(this.skeleton);
    this.hull = new THREE.SkinnedMesh(g, this.hullMat);
    this.hull.bind(this.skeleton);
    // Fill first (writes depth), hull after with depthTest on and no depthWrite:
    // the outline only shows where no nearer fill exists → correct on a coil.
    this.fill.renderOrder = 0; this.hull.renderOrder = 1;
    this.fill.frustumCulled = false; this.hull.frustumCulled = false;
    this.root.add(this.hull); this.root.add(this.fill);
  }

  _buildJoints() {
    // Maya-style bone: 4-sided pyramid base→apex along +X + small pivot octahedron
    const N = this.chain.N;
    const verts = [], idx = [];
    const push = (x, y, z) => (verts.push(x, y, z), verts.length / 3 - 1);
    const s = 0.5;
    const b0 = push(0, s, 0), b1 = push(0, 0, s), b2 = push(0, -s, 0), b3 = push(0, 0, -s), ap = push(1, 0, 0);
    idx.push(b0, b1, ap, b1, b2, ap, b2, b3, ap, b3, b0, ap, b0, b3, b2, b2, b1, b0);
    const p = 0.28;
    const c0 = push(p, 0, 0), c1 = push(-p, 0, 0), c2 = push(0, p, 0), c3 = push(0, -p, 0), c4 = push(0, 0, p), c5 = push(0, 0, -p);
    idx.push(c0, c2, c4, c0, c4, c3, c0, c3, c5, c0, c5, c2, c1, c4, c2, c1, c3, c4, c1, c5, c3, c1, c2, c5);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.MeshBasicMaterial({ color: INK, transparent: true, opacity: 0.34, depthTest: false, depthWrite: false });
    this.joints = new THREE.InstancedMesh(g, m, N - 1);
    this.joints.renderOrder = 2; this.joints.frustumCulled = false;
    this.root.add(this.joints);
    this._m4 = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._sc = new THREE.Vector3();
    this._zAxis = new THREE.Vector3(0, 0, 1);
  }

  _buildControls() {
    const N = this.chain.N;
    this.fkJoints = [3, 6, 9, 12].filter((i) => i < N - 1);
    const CIRC = 32;
    const nSeg = this.fkJoints.length * CIRC + 6 /* locator */ + 1 /* ik line */;
    this.ctrlPos = new Float32Array(nSeg * 2 * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.ctrlPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.ctrlMat = new THREE.LineBasicMaterial({ color: OX, transparent: true, opacity: 0.55, depthTest: false });
    this.ctrls = new THREE.LineSegments(g, this.ctrlMat);
    this.ctrls.renderOrder = 3; this.ctrls.frustumCulled = false;
    this.root.add(this.ctrls);
    this.hoverCtrlLine = null;
  }

  /* ───────────────────────── layout ───────────────────────── */

  _layout() {
    const cw = this.canvas.clientWidth || 1, ch = this.canvas.clientHeight || 1;
    this.renderer.setSize(cw, ch, false);
    // world = CSS px, origin at canvas top-left, y down flipped to y up
    this.camera.left = 0; this.camera.right = cw; this.camera.top = 0; this.camera.bottom = -ch;
    this.camera.updateProjectionMatrix();
    // anchor rect relative to canvas
    const cr = this.canvas.getBoundingClientRect(), ar = this.anchor.getBoundingClientRect();
    const ax = ar.left - cr.left, ay = ar.top - cr.top, aw = ar.width, ah = ar.height;
    // Fit the REST coil (curl = CURL_REST, what you see on load) into the
    // anchor. On scroll the tail deliberately un-rolls OUT of the box (that's
    // the point — it leaves the hero with you), so we don't fit the whole run.
    // A little slack around rest (±0.08 curl) so idle springs don't clip.
    const c = this.chain; const save = { curl: c.curl, theta: Float32Array.from(c.theta) };
    let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
    for (const k of [CURL_REST - 0.08, CURL_REST, CURL_REST + 0.08]) {
      c.curl = k; solveFK(c); c.theta.set(c.thetaFK); forward(c);
      for (let i = 0; i < c.N; i++) { const x = c.pos[i * 2], y = c.pos[i * 2 + 1]; if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; }
    }
    const pad = BASE_RADIUS * c.totalLen * 1.4; minx -= pad; maxx += pad; miny -= pad; maxy += pad;
    c.curl = save.curl; c.theta.set(save.theta); forward(c);
    const bw = maxx - minx || 1, bh = maxy - miny || 1;
    const scale = Math.min(aw * 0.92 / bw, ah * 0.92 / bh);
    this.worldScale = scale;
    // Convention: world X = css px right, world Y = css px UP (camera bottom = -ch).
    // Chain +Y is "up" too, so root scale is (+s,+s) and the anchor centre
    // (cx, cy in css px, y down) maps to world (cx, -cy).
    const cx = ax + aw / 2, cy = ay + ah / 2;
    const bxc = (minx + maxx) / 2, byc = (miny + maxy) / 2;
    this.root.position.set(cx - bxc * scale, -cy - byc * scale, 0);
    this.root.scale.set(scale, scale, scale);
    // outline thickness in css px (applied in view space by the shader) +
    // the bind→px scale it needs to cap the offset near the thin tip
    this.hullMat.uniforms.uHullPx.value = 1.4;
    this.hullMat.uniforms.uScale.value = scale;
    this.fillMat.uniforms.uScale.value = scale;
    this.dirty = true;
  }

  /* ───────────────────────── input ───────────────────────── */

  _bind() {
    this._onResize = () => { this._layout(); this.requestRender(); };
    window.addEventListener('resize', this._onResize, { passive: true });

    if ('IntersectionObserver' in window) {
      this._io = new IntersectionObserver((e) => { this.visible = e[0]?.isIntersecting ?? true; if (this.visible) this.requestRender(); }, { threshold: 0 });
      this._io.observe(this.canvas);
    }

    const fine = matchMedia('(pointer: fine)').matches;
    this._unsubPointer = onPointerMove((x, y) => {
      this.pointer.x = x; this.pointer.y = y;
      if (this.chain.dragging) { this._setTargetFromClient(x, y); this.requestRender(); return; }
      if (!fine) return;
      const j = this._nearestJoint(x, y);
      const hj = (j.i >= 0 && j.dist < HOVER_PX) ? j.i : -1;
      if (hj !== this.hoverJoint) {
        this.hoverJoint = hj;
        this.bloomTarget = hj >= 0 ? 1 : 0;
        this.fillMat.uniforms.uBone.value = hj;
        this.hullMat.uniforms.uBone.value = hj;
        this._setCursorHover(hj >= 0);
        this._setLabel(hj);
        this.requestRender();
      }
    });

    this._onDown = (e) => {
      if (this.suspended) return;               // arcade mode: clicks are for shooting
      if (e.button !== undefined && e.button !== 0) return;
      const j = this._nearestJoint(e.clientX, e.clientY);
      const tip = this._nearestTip(e.clientX, e.clientY);
      const canGrab = tip < GRAB_PX || (j.i >= 0 && j.dist < this._jointGrabRadiusPx(j.i));
      if (!canGrab) return;
      e.preventDefault();
      this.chain.dragging = true;
      this.ikBlendTarget = 1;
      this._setTargetFromClient(e.clientX, e.clientY);
      this.canvas.closest('.hero')?.classList.add('is-dragging');
      document.querySelector('.cursor-ring')?.classList.add('is-grab');
      try { this.canvas.setPointerCapture?.(e.pointerId); } catch (_) {}
      this.requestRender();
    };
    this._onUp = () => {
      if (!this.chain.dragging) return;
      this.chain.dragging = false;
      this.ikBlendTarget = 0;
      this.canvas.closest('.hero')?.classList.remove('is-dragging');
      document.querySelector('.cursor-ring')?.classList.remove('is-grab');
      this.requestRender();
    };
    this.canvas.addEventListener('pointerdown', this._onDown);
    window.addEventListener('pointerup', this._onUp);
    window.addEventListener('pointercancel', this._onUp);

    // scroll → curl (un-roll as the hero scrolls out)
    this._onScroll = () => {
      const h = this.canvas.closest('.hero') || this.canvas;
      const r = h.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, -r.top / (r.height || 1)));
      const curl = CURL_REST + (CURL_END - CURL_REST) * p;
      if (Math.abs(curl - this.chain.curl) > 1e-4) { this.chain.curl = curl; this.requestRender(); }
    };
    window.addEventListener('scroll', this._onScroll, { passive: true });

    // touch pluck (coarse pointers): tap the tail → impulse at the tip
    if (!fine) {
      let t0 = 0, x0 = 0, y0 = 0;
      this.canvas.addEventListener('touchstart', (e) => { const t = e.touches[0]; t0 = performance.now(); x0 = t.clientX; y0 = t.clientY; }, { passive: true });
      this.canvas.addEventListener('touchend', (e) => {
        const t = e.changedTouches[0];
        if (performance.now() - t0 < 250 && Math.hypot(t.clientX - x0, t.clientY - y0) < 8) {
          const j = this._nearestJoint(t.clientX, t.clientY);
          if (j.i >= 0 && j.dist < 40) { const c = this.chain; for (let i = c.N - 4; i < c.N; i++) c.vel[i] += 6 * (i - (c.N - 4) + 1); this.requestRender(); }
        }
      }, { passive: true });
    }
  }

  _setCursorHover(on) {
    const ring = document.querySelector('.cursor-ring');
    if (ring) ring.classList.toggle('is-hover', on);
    this.canvas.style.cursor = on ? 'grab' : '';
  }
  _setLabel(j) {
    const el = document.querySelector('.hero__rig-label');
    if (!el) return;
    if (j < 0) { el.style.opacity = 0; return; }
    const names = this.chain.names;
    const isTip = j === this.chain.N - 1;
    el.textContent = isTip ? 'tail_ik_ctrl' : (names ? names[j] : `tail_${String(j + 1).padStart(2, '0')}`);
    const p = this._jointClient(j);
    el.style.transform = `translate(${Math.round(p.x + 14)}px, ${Math.round(p.y - 22)}px)`;
    el.style.opacity = 1;
  }

  /* ───────────────────────── math helpers ───────────────────────── */

  _jointClient(i) {
    // chain → world (root pos/scale, world Y up) → client (canvas rect, Y down).
    // The root's small Y tilt shifts X by (1-cos) — negligible for hit-tests.
    const c = this.chain; const cr = this.canvas.getBoundingClientRect();
    const wx = this.root.position.x + c.pos[i * 2] * this.worldScale;
    const wy = this.root.position.y + c.pos[i * 2 + 1] * this.worldScale;
    return { x: cr.left + wx, y: cr.top - wy };
  }
  _nearestJoint(cx, cy) {
    let best = -1, bd = 1e9;
    for (let i = 0; i < this.chain.N; i++) { const p = this._jointClient(i); const d = Math.hypot(p.x - cx, p.y - cy); if (d < bd) { bd = d; best = i; } }
    return { i: best, dist: bd };
  }
  _nearestTip(cx, cy) { const p = this._jointClient(this.chain.N - 1); return Math.hypot(p.x - cx, p.y - cy); }
  _tubeRadius(i) { return this.chain.radii[i] * BASE_RADIUS * this.chain.totalLen; }
  _jointGrabRadiusPx(i) { return Math.max(14, this._tubeRadius(i) * this.worldScale + 8); }
  _setTargetFromClient(cx, cy) {
    // inverse of _jointClient
    const cr = this.canvas.getBoundingClientRect();
    const wx = cx - cr.left, wy = -(cy - cr.top);
    this.chain.target.x = (wx - this.root.position.x) / this.worldScale;
    this.chain.target.y = (wy - this.root.position.y) / this.worldScale;
  }

  /* ───────────────────────── frame ───────────────────────── */

  requestRender() {
    if (this.disposed || this.rafId !== null) return;
    this.dirty = true;
    this.rafId = requestAnimationFrame((t) => this._frame(t));
  }

  _frame(now) {
    this.rafId = null;
    if (this.disposed) return;
    const dt = Math.min(0.05, (now - this.lastT) / 1000); this.lastT = now;
    const c = this.chain;
    let moving = false;

    if (this.animate) {
      // eased scalars
      // Eased scalars, SNAPPED once below the perceptual threshold: an
      // exponential never reaches its target, and without the snap the scene
      // kept rendering ~2 s of visually identical frames after every release
      // (measured 3.2 s to idle vs ~1 s visible motion).
      const eb = 1 - Math.exp(-dt / 0.15);
      c.ikBlend += (this.ikBlendTarget - c.ikBlend) * (c.dragging ? eb : 1 - Math.exp(-dt / 0.35));
      this.bloom += (this.bloomTarget - this.bloom) * (1 - Math.exp(-dt / 0.25));
      if (Math.abs(this.ikBlendTarget - c.ikBlend) < 0.01) c.ikBlend = this.ikBlendTarget; else moving = true;
      if (Math.abs(this.bloomTarget - this.bloom) < 0.01) this.bloom = this.bloomTarget; else moving = true;
      solveFK(c);
      if (c.ikBlend > 0) solveIK(c, c.target.x, c.target.y); else c.stretch = 1;
      const settled = stepSprings(c, dt);
      if (!settled) moving = true;
    } else {
      // Reduced motion: no springs, no eases — but posing is USER-initiated
      // motion, so a drag still moves the tail; it just snaps (no overlap,
      // no recoil) and the frame is rendered on demand only.
      solveFK(c);
      c.ikBlend = c.dragging ? 1 : 0;
      this.bloom = this.bloomTarget;
      if (c.dragging) solveIK(c, c.target.x, c.target.y); else c.stretch = 1;
      settle(c);
    }
    forward(c);

    // Bones. Chain convention (tail-chain.forward): theta[i] is the bend of
    // SEGMENT i (joint i-1 → joint i), i.e. the heading delta applied at
    // joint i-1. Three bone i owns segment i+1 (from bones[i] to bones[i+1]),
    // so bones[i].rotation = theta[i+1]. Off-by-one here rotated every bone by
    // its parent's bend: the tube still coiled (rotations accumulate) but was
    // one segment out of phase with the joint pyramids, and the tip bone
    // carried a stray bend that tore a quad open near the base (measured).
    for (let i = 0; i < c.N; i++) {
      const b = this.bones[i];
      if (i) b.position.x = c.lengths[i - 1] * c.stretch;
      b.rotation.z = i < c.N - 1 ? c.theta[i + 1] : 0;
    }
    this.fillMat.uniforms.uStretch.value = c.stretch;
    this.hullMat.uniforms.uStretch.value = c.stretch;
    this.fillMat.uniforms.uBloom.value = this.bloom;
    this.fillMat.uniforms.uHatch.value = this.hatchOn;
    this.fill.updateMatrixWorld(true);

    // Instanced Maya-style joints, built in the ROOT's local 2D frame directly
    // from the solved chain (position + heading), not from bone matrices —
    // avoids compounding the bones' rotations with the root transform.
    {
      let heading = 0;
      for (let i = 0; i < c.N - 1; i++) {
        heading += c.theta[i + 1];               // heading of segment i → i+1
        const x = c.pos[i * 2], y = c.pos[i * 2 + 1];
        const len = c.lengths[i] * c.stretch;
        const r = this._tubeRadius(i) * 0.62;    // pyramid base well inside the tube (X-ray, not a spike)
        this._q.setFromAxisAngle(this._zAxis, heading);
        this._sc.set(len, r, r);
        this._m4.compose(this._v.set(x, y, 0), this._q, this._sc);
        this.joints.setMatrixAt(i, this._m4);
      }
      this.joints.instanceMatrix.needsUpdate = true;
    }

    // control lines
    this._updateControls();

    const t0 = performance.now();
    if (this.visible) this.renderer.render(this.scene, this.camera);
    this._govern(performance.now() - t0);
    if (!this._framed && this.visible) { this._framed = true; try { this.onFirstFrame?.(); } catch (_) {} }
    if (this.animate && moving && this.visible) this.rafId = requestAnimationFrame((t) => this._frame(t));
  }

  _updateControls() {
    const c = this.chain; const P = this.ctrlPos; let k = 0;
    const put = (x, y) => { P[k++] = x; P[k++] = y; P[k++] = 0; };
    const heads = [0]; let h = 0; for (let i = 1; i < c.N; i++) { h += c.theta[i]; heads.push(h); }
    // FK circles: in the plane perpendicular to the bone → drawn as an ellipse in our tilted ortho view; keep it a flat circle in XY for the plate look
    for (const j of this.fkJoints) {
      const cx = c.pos[j * 2], cy = c.pos[j * 2 + 1];
      const r = this._tubeRadius(j) * 1.6;
      for (let s = 0; s < 32; s++) {
        const a0 = (s / 32) * Math.PI * 2, a1 = ((s + 1) / 32) * Math.PI * 2;
        put(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r); put(cx + Math.cos(a1) * r, cy + Math.sin(a1) * r);
      }
    }
    // IK locator at tip: 3 axes + small square
    const tx = c.pos[(c.N - 1) * 2], ty = c.pos[(c.N - 1) * 2 + 1];
    const L = 0.035 * c.totalLen;
    put(tx - L, ty); put(tx + L, ty);
    put(tx, ty - L); put(tx, ty + L);
    const q = L * 0.55;
    put(tx - q, ty - q); put(tx + q, ty - q);
    put(tx + q, ty - q); put(tx + q, ty + q);
    put(tx + q, ty + q); put(tx - q, ty + q);
    put(tx - q, ty + q); put(tx - q, ty - q);
    // ikHandle line root → effector
    put(0, 0); put(tx, ty);
    this.ctrls.geometry.attributes.position.needsUpdate = true;
    this.ctrlMat.opacity = this.hoverJoint >= 0 || c.dragging ? 1.0 : 0.55;
  }

  /** Quality governor. Measures the JS-side cost of renderer.render() (ms of
   *  WORK per frame), NOT the interval between frames — that interval is
   *  ~16.7 ms at 60 Hz whatever the load, so a 14 ms threshold on it fired
   *  unconditionally and stripped hatch + DPR on every machine (measured).
   *  Steps down hatch → DPR only if 90 consecutive frames average > 9 ms. */
  _govern(workMs) {
    const ft = this.frameTimes; ft.push(workMs); if (ft.length > 90) ft.shift();
    if (ft.length < 90) return;
    const avg = ft.reduce((a, b) => a + b, 0) / ft.length;
    if (avg > 9 && this.hatchOn) { this.hatchOn = 0; ft.length = 0; return; }
    if (avg > 9 && this.dprCap > 1) { this.dprCap = 1; this.renderer.setPixelRatio(1); this._layout(); ft.length = 0; }
  }

  dispose() {
    this.disposed = true;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this._io?.disconnect();
    this._unsubPointer?.();
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('scroll', this._onScroll);
    window.removeEventListener('pointerup', this._onUp);
    window.removeEventListener('pointercancel', this._onUp);
    this.renderer.dispose();
  }
}

/** Fetch optional Maya sidecar; resolves to a spec or null. */
export async function loadTailSpec(url) {
  try {
    // NOT force-cache: it happily serves a previously cached 404 forever
    // (measured: file added, curl 200, page kept seeing 404 from HTTP cache).
    const r = await fetch(url);
    if (!r.ok) return null;
    return loadSpec(await r.json());
  } catch { return null; }
}
