/**
 * manikin-physics.js — pure-JS verlet ragdoll for the hero "manikins":
 * little rigger's manikins that live on top of the headline letters.
 *
 * No DOM, no Three. Everything a browser needs to draw them is in
 * manikin-scene.js; everything that can be unit-tested is here.
 *
 *   Skyline     — a heightmap of the text's top surface (y per x column) with
 *                 helpers to find sittable edges and walkable runs.
 *   Manikin     — 11 verlet points + distance constraints + a few "min
 *                 distance" struts that keep it from folding like paper.
 *   step()      — gravity, verlet integration, constraint relaxation, heightmap
 *                 collision with friction, pins (grab), rest detection.
 *   poses       — kinematic target poses (stand/sit/walk) the scene blends to
 *                 when the manikin is "awake"; the same points are then handed
 *                 to physics untouched when it is knocked or grabbed, so it
 *                 carries its last motion into the ragdoll.
 *
 * Units: css px in the coordinate space of the headline element. y grows DOWN.
 */

/* ───────────────────────────── Skyline ───────────────────────────── */

export class Skyline {
  /**
   * @param {number} x0      x of column 0
   * @param {number} dx      column width (px)
   * @param {Float32Array|number[]} tops   y of the topmost ink per column; Infinity = no ink
   * @param {number} ground  y of the floor below everything
   */
  constructor(x0, dx, tops, ground) {
    this.x0 = x0; this.dx = dx; this.tops = tops; this.ground = ground;
    this.n = tops.length;
  }
  get x1() { return this.x0 + this.n * this.dx; }
  col(x) { return Math.floor((x - this.x0) / this.dx); }
  /** top surface y at x (ground when no ink / out of range). `y` is ignored
   *  here; LayeredSkyline uses it to pick the first surface BELOW a point. */
  topAt(x, y) { // eslint-disable-line no-unused-vars
    const c = this.col(x);
    if (c < 0 || c >= this.n) return this.ground;
    const t = this.tops[c];
    return Number.isFinite(t) ? t : this.ground;
  }
  /** true if x is over ink (something to stand on above ground) */
  hasInk(x) { const c = this.col(x); return c >= 0 && c < this.n && Number.isFinite(this.tops[c]); }

  /**
   * Walkable runs: maximal x-intervals where the surface is continuous
   * (|Δy| between neighbours ≤ maxStep) and over ink. Returns [{x0,x1,yAvg}].
   */
  runs(maxStep = 6, minLen = 24) {
    const out = []; let start = -1, prev = NaN, sum = 0, cnt = 0;
    const flush = (endCol) => {
      if (start >= 0 && (endCol - start) * this.dx >= minLen) out.push({ x0: this.x0 + start * this.dx, x1: this.x0 + endCol * this.dx, yAvg: sum / cnt });
      start = -1; sum = 0; cnt = 0;
    };
    for (let c = 0; c < this.n; c++) {
      const t = this.tops[c];
      if (!Number.isFinite(t)) { flush(c); prev = NaN; continue; }
      if (start < 0) { start = c; sum = 0; cnt = 0; }
      else if (Math.abs(t - prev) > maxStep) { flush(c); start = c; sum = 0; cnt = 0; }
      sum += t; cnt++; prev = t;
    }
    flush(this.n);
    return out;
  }

  /**
   * Sittable edges: points where a walkable run ends with a DROP (ink ends or
   * surface falls by ≥ minDrop) so legs can dangle. side = +1 → drop is to the
   * right of x (sit facing right), -1 → drop to the left.
   * Returns [{x, y, side, runWidth}], best (widest run) first.
   */
  edges(minDrop = 18, maxStep = 6, minRun = 24) {
    const out = [];
    for (const r of this.runs(maxStep, minRun)) {
      const w = r.x1 - r.x0;
      const yr = this.topAt(r.x1 - this.dx), yl = this.topAt(r.x0);
      const dropR = this.topAt(r.x1 + this.dx * 2) - yr;
      const dropL = this.topAt(r.x0 - this.dx * 2) - yl;
      if (dropR >= minDrop) out.push({ x: r.x1 - this.dx, y: yr, side: 1, runWidth: w });
      if (dropL >= minDrop) out.push({ x: r.x0 + this.dx, y: yl, side: -1, runWidth: w });
    }
    return out.sort((a, b) => b.runWidth - a.runWidth);
  }
}

/**
 * Several stacked skylines (one per headline line) + a floor. A single
 * heightmap cannot hold two lines of text: the upper line's tops would hide
 * the lower line's under the same x columns (measured: line 2 kept only the
 * columns sticking out past line 1). Here `topAt(x, y)` returns the first
 * surface at or below y, so a manikin on line 1 stands on line 1, one that
 * falls between the letters lands on line 2 (or the floor).
 */
export class LayeredSkyline {
  constructor(layers, ground) {
    this.layers = layers.slice().sort((a, b) => a.top - b.top); // {sky, top}
    this.ground = ground;
    this.dx = layers[0]?.sky.dx || 2;
    this.x0 = Math.min(...layers.map((l) => l.sky.x0));
    this.x1 = Math.max(...layers.map((l) => l.sky.x1));
  }
  topAt(x, y = -Infinity) {
    let best = this.ground;
    for (const { sky } of this.layers) {
      const t = sky.topAt(x);
      if (t < this.ground && t >= y - 1e-6 && t < best) best = t;
    }
    return best;
  }
  hasInk(x, y = -Infinity) { return this.topAt(x, y) < this.ground; }
  runs(maxStep, minLen) { return this.layers.flatMap(({ sky }) => sky.runs(maxStep, minLen)); }
  edges(minDrop, maxStep, minRun) {
    // an edge needs a real drop: compare against what lies below at that x
    const out = [];
    for (const { sky } of this.layers) {
      for (const r of sky.runs(maxStep, minRun)) {
        const w = r.x1 - r.x0;
        const yr = sky.topAt(r.x1 - sky.dx), yl = sky.topAt(r.x0);
        // What is next to the run end ON THIS LINE? If it is higher (a wall —
        // e.g. the N→G join where the G rises), it is not an edge at all.
        // Only if the same-line neighbour is lower (or absent) do we look at
        // the layered world for how far the legs could hang.
        const nR = sky.topAt(r.x1 + sky.dx * 2), nL = sky.topAt(r.x0 - sky.dx * 2);
        const wallR = nR < yr - 1, wallL = nL < yl - 1;
        const dropR = wallR ? 0 : this.topAt(r.x1 + sky.dx * 2, yr - 1) - yr;
        const dropL = wallL ? 0 : this.topAt(r.x0 - sky.dx * 2, yl - 1) - yl;
        if (dropR >= minDrop) out.push({ x: r.x1 - sky.dx, y: yr, side: 1, runWidth: w });
        if (dropL >= minDrop) out.push({ x: r.x0 + sky.dx, y: yl, side: -1, runWidth: w });
      }
    }
    return out.sort((a, b) => b.runWidth - a.runWidth);
  }
}

/* ───────────────────────────── Manikin ───────────────────────────── */

// point indices
export const P = { HEAD: 0, NECK: 1, HIP: 2, LKNEE: 3, LFOOT: 4, RKNEE: 5, RFOOT: 6, LELB: 7, LHAND: 8, RELB: 9, RHAND: 10, N: 11 };

/** Contact radius of a point (fraction of u): collide() keeps points this far
 *  above a surface, so poses that put feet ON the surface must aim there too,
 *  or the drive and the floor fight (measured: 60 px/s foot flicker). */
export const CONTACT_R = 0.16;

/** Body proportions in units of u (u ≈ 1/7 of standing height). */
export const PROP = { head: 0.62, neck: 0.55, torso: 2.05, thigh: 1.85, shin: 1.85, upperArm: 1.45, foreArm: 1.4, shoulder: 0.5, hipW: 0.35 };

export function createManikin({ x = 0, y = 0, u = 10, facing = 1, tint = 'ink', id = 0 } = {}) {
  const m = {
    id, u, tint, facing,
    x: new Float64Array(P.N), y: new Float64Array(P.N),
    px: new Float64Array(P.N), py: new Float64Array(P.N),
    pinned: new Int8Array(P.N),                 // 1 = pinned to (pinX,pinY)
    pinX: new Float64Array(P.N), pinY: new Float64Array(P.N),
    onGround: new Int8Array(P.N),
    cons: [], struts: [],
    state: 'sit', t: 0, restTime: 0, mass: 1,
    look: 0, blink: 0,
  };
  const L = (a, b, len) => m.cons.push([a, b, len * u]);
  L(P.HEAD, P.NECK, PROP.neck);
  L(P.NECK, P.HIP, PROP.torso);
  L(P.HIP, P.LKNEE, PROP.thigh); L(P.LKNEE, P.LFOOT, PROP.shin);
  L(P.HIP, P.RKNEE, PROP.thigh); L(P.RKNEE, P.RFOOT, PROP.shin);
  L(P.NECK, P.LELB, PROP.upperArm); L(P.LELB, P.LHAND, PROP.foreArm);
  L(P.NECK, P.RELB, PROP.upperArm); L(P.RELB, P.RHAND, PROP.foreArm);
  // struts: minimum distances that stop the body from folding flat
  const S = (a, b, min) => m.struts.push([a, b, min * u]);
  S(P.HEAD, P.HIP, PROP.neck + PROP.torso * 0.6);    // don't tuck the head into the belly (soft, see step)
  S(P.HIP, P.LFOOT, PROP.thigh * 0.55);                // knee can't fold past ~120°
  S(P.HIP, P.RFOOT, PROP.thigh * 0.55);
  S(P.NECK, P.LHAND, PROP.upperArm * 0.5);
  S(P.NECK, P.RHAND, PROP.upperArm * 0.5);
  S(P.LKNEE, P.RKNEE, PROP.hipW * 0.6);                // legs don't pass through each other
  // limbs keep some spread when hanging/lying — without these a manikin held
  // by the head collapsed into one vertical stroke (measured)
  S(P.LFOOT, P.RFOOT, 0.55); S(P.LHAND, P.RHAND, 0.7);
  S(P.LELB, P.HIP, 0.9); S(P.RELB, P.HIP, 0.9);
  S(P.LHAND, P.HIP, 0.6); S(P.RHAND, P.HIP, 0.6);
  const pose = standPose(m, x, y, facing, 0);
  applyPose(m, pose, 1);
  for (let i = 0; i < P.N; i++) { m.px[i] = m.x[i]; m.py[i] = m.y[i]; }
  return m;
}

/* ───────────────────────────── poses ───────────────────────────── */
// Poses return {x:Float64Array, y:Float64Array} targets. (fx, fy) = feet
// contact / hip anchor depending on pose. facing ±1. t = time for idle motion.

const _pose = () => ({ x: new Float64Array(P.N), y: new Float64Array(P.N) });
const put = (o, i, x, y) => { o.x[i] = x; o.y[i] = y; };

/** 2-bone IK: knee position for hip→foot with bones (l1,l2), bending toward `bend` (±1 = screen x side). */
export function kneeIK(hx, hy, fx, fy, l1, l2, bend = 1) {
  let dx = fx - hx, dy = fy - hy, d = Math.hypot(dx, dy);
  const maxD = (l1 + l2) * 0.999, minD = Math.abs(l1 - l2) * 1.001;
  if (d < 1e-6) { dx = 0; dy = 1; d = 1; }
  const dd = Math.min(maxD, Math.max(minD, d));
  const ux = dx / d, uy = dy / d;
  const a = (l1 * l1 - l2 * l2 + dd * dd) / (2 * dd);       // along-axis distance to knee
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));         // perpendicular offset
  // perpendicular pointing to +x side when the leg hangs down (uy>0): (-uy, ux) → x = -uy... pick sign by bend
  const px = -uy, py = ux;
  const sgn = (px * bend >= 0) ? 1 : -1;
  return [hx + ux * a + px * h * sgn, hy + uy * a + py * h * sgn];
}

/** Standing on ground at (x, groundY). Idle sway + breathing. */
export function standPose(m, x, groundY, facing = 1, t = 0) {
  const u = m.u, o = _pose();
  const sway = Math.sin(t * 1.3) * 0.06 * u, breath = Math.sin(t * 2.1) * 0.04 * u;
  const hipY = groundY - (PROP.thigh + PROP.shin) * u * 0.985;   // knees just short of locked
  put(o, P.HIP, x + sway, hipY);
  put(o, P.NECK, x + sway * 1.4, hipY - PROP.torso * u + breath);
  put(o, P.HEAD, x + sway * 1.6 + facing * 0.08 * u, o.y[P.NECK] - PROP.neck * u + breath);
  const spread = PROP.hipW * u * 1.1, fy = groundY - CONTACT_R * u;
  put(o, P.LFOOT, x - spread, fy); put(o, P.RFOOT, x + spread, fy);
  // knees via 2-bone IK so the target is reachable with the real bone lengths
  // (hand-placed knees were 4% short → the drive and the bones fought, 70 px/s
  // knee jitter while "standing still")
  const th = PROP.thigh * u, sh2 = PROP.shin * u;
  const [lkx, lky] = kneeIK(o.x[P.HIP], hipY, o.x[P.LFOOT], fy, th, sh2, facing);
  const [rkx, rky] = kneeIK(o.x[P.HIP], hipY, o.x[P.RFOOT], fy, th, sh2, facing);
  put(o, P.LKNEE, lkx, lky); put(o, P.RKNEE, rkx, rky);
  const sh = PROP.shoulder * u;
  put(o, P.LELB, o.x[P.NECK] - sh - 0.2 * u, o.y[P.NECK] + PROP.upperArm * u * 0.95);
  put(o, P.RELB, o.x[P.NECK] + sh + 0.2 * u, o.y[P.NECK] + PROP.upperArm * u * 0.95);
  put(o, P.LHAND, o.x[P.LELB] - 0.1 * u, o.y[P.LELB] + PROP.foreArm * u * 0.95);
  put(o, P.RHAND, o.x[P.RELB] + 0.1 * u, o.y[P.RELB] + PROP.foreArm * u * 0.95);
  return o;
}

/**
 * Sitting on an edge at (x, y) with legs dangling toward `facing` side.
 * Legs swing (alternating) with phase t; hands rest on the edge / lap.
 */
export function sitPose(m, x, y, facing = 1, t = 0, swing = 1) {
  const u = m.u, o = _pose();
  // seat a little inside the edge so the thighs rest on it; torso upright
  // with a hint of lean-back (hands planted behind), head looking out
  const hipX = x - facing * 0.45 * u, hipY = y - 0.30 * u;
  put(o, P.HIP, hipX, hipY);
  const lean = -facing * 0.10 * u + Math.sin(t * 0.7) * 0.05 * u;
  put(o, P.NECK, hipX + lean, hipY - PROP.torso * u * 0.98);
  put(o, P.HEAD, o.x[P.NECK] + facing * 0.18 * u, o.y[P.NECK] - PROP.neck * u * 0.98);
  // thighs go out over the edge (nearly horizontal), shins hang down and swing
  const kneeX = hipX + facing * PROP.thigh * u * 0.97, kneeY = hipY + 0.22 * u;
  const a1 = Math.sin(t * 2.6) * 0.55 * swing, a2 = Math.sin(t * 2.6 + Math.PI * 0.9) * 0.55 * swing;
  put(o, P.LKNEE, kneeX - facing * 0.1 * u, kneeY);
  put(o, P.RKNEE, kneeX + facing * 0.1 * u, kneeY + 0.08 * u);
  put(o, P.LFOOT, o.x[P.LKNEE] + Math.sin(a1) * PROP.shin * u * facing, o.y[P.LKNEE] + Math.cos(a1) * PROP.shin * u);
  put(o, P.RFOOT, o.x[P.RKNEE] + Math.sin(a2) * PROP.shin * u * facing, o.y[P.RKNEE] + Math.cos(a2) * PROP.shin * u);
  // arms: one hand on the edge behind, one on the lap
  const sh = PROP.shoulder * u;
  put(o, P.LELB, o.x[P.NECK] - facing * (sh + 0.5 * u), o.y[P.NECK] + PROP.upperArm * u * 0.75);
  {
    // hand planted on the edge behind: aim from the elbow toward that spot,
    // clamped to forearm length so the bone stays plausible
    const tx = hipX - facing * 0.9 * u, ty = y - 0.05 * u;
    const ex = o.x[P.LELB], ey = o.y[P.LELB];
    const d = Math.hypot(tx - ex, ty - ey) || 1, L = PROP.foreArm * u;
    put(o, P.LHAND, ex + (tx - ex) / d * L, ey + (ty - ey) / d * L);
  }
  put(o, P.RELB, o.x[P.NECK] + facing * (sh + 0.1 * u), o.y[P.NECK] + PROP.upperArm * u * 0.9);
  {
    const tx = kneeX - facing * 0.3 * u, ty = kneeY - 0.15 * u;
    const ex = o.x[P.RELB], ey = o.y[P.RELB];
    const d = Math.hypot(tx - ex, ty - ey) || 1, L = PROP.foreArm * u;
    put(o, P.RHAND, ex + (tx - ex) / d * L, ey + (ty - ey) / d * L);
  }
  return o;
}

/**
 * Walking on a surface: hip moves with the caller; feet follow a gait cycle.
 * groundAt(x) gives the surface y under a foot. phase in [0, 2π).
 */
export function walkPose(m, x, groundAt, facing = 1, phase = 0, t = 0) {
  const u = m.u, o = _pose();
  const stride = 0.95 * u, lift = 0.5 * u;
  const bob = Math.abs(Math.sin(phase)) * 0.12 * u;
  const gY = groundAt(x);
  const hipY = gY - (PROP.thigh + PROP.shin) * u * 0.955 - bob;
  put(o, P.HIP, x, hipY);
  put(o, P.NECK, x + facing * 0.12 * u, hipY - PROP.torso * u);
  put(o, P.HEAD, x + facing * 0.22 * u, o.y[P.NECK] - PROP.neck * u);
  // feet: sinusoidal gait, opposite phases; lifted foot arcs
  const f = (ph) => {
    const s = Math.sin(ph), c = Math.cos(ph);
    const fx = x + facing * s * stride;
    const up = c > 0 ? c * lift : 0;             // swing phase lifts
    return [fx, groundAt(fx) - CONTACT_R * u - up];
  };
  const [lx, ly] = f(phase), [rx, ry] = f(phase + Math.PI);
  put(o, P.LFOOT, lx, ly); put(o, P.RFOOT, rx, ry);
  const th = PROP.thigh * u, sh2 = PROP.shin * u;
  const [lkx, lky] = kneeIK(x, hipY, lx, ly, th, sh2, facing);
  const [rkx, rky] = kneeIK(x, hipY, rx, ry, th, sh2, facing);
  put(o, P.LKNEE, lkx, lky); put(o, P.RKNEE, rkx, rky);
  // arms swing opposite to legs
  const sh = PROP.shoulder * u, aswing = Math.sin(phase) * 0.6 * u;
  put(o, P.LELB, o.x[P.NECK] - facing * (sh - aswing * 0.6), o.y[P.NECK] + PROP.upperArm * u * 0.9);
  put(o, P.RELB, o.x[P.NECK] + facing * (sh + aswing * 0.6), o.y[P.NECK] + PROP.upperArm * u * 0.9);
  put(o, P.LHAND, o.x[P.LELB] - facing * aswing * 0.8, o.y[P.LELB] + PROP.foreArm * u * 0.85);
  put(o, P.RHAND, o.x[P.RELB] + facing * aswing * 0.8, o.y[P.RELB] + PROP.foreArm * u * 0.85);
  return o;
}

/** Crouch on the ground at (x, groundY): hips low, knees bent forward, hands
 *  near the ground in front — the "landed / about to get up / startled" shape. */
export function crouchPose(m, x, groundY, facing = 1, depth = 1) {
  const u = m.u, o = _pose();
  const fy = groundY - CONTACT_R * u;
  const legLen = (PROP.thigh + PROP.shin) * u;
  const hipY = groundY - legLen * (0.96 - 0.42 * depth);
  const hipX = x - facing * 0.25 * u * depth;
  put(o, P.HIP, hipX, hipY);
  put(o, P.NECK, hipX + facing * (0.35 + 0.5 * depth) * u, hipY - PROP.torso * u * (1 - 0.18 * depth));
  put(o, P.HEAD, o.x[P.NECK] + facing * 0.25 * u, o.y[P.NECK] - PROP.neck * u * 0.95);
  const spread = PROP.hipW * u * 1.6;
  put(o, P.LFOOT, x - spread + facing * 0.2 * u, fy); put(o, P.RFOOT, x + spread + facing * 0.2 * u, fy);
  const th = PROP.thigh * u, sh2 = PROP.shin * u;
  const [lkx, lky] = kneeIK(hipX, hipY, o.x[P.LFOOT], fy, th, sh2, facing);
  const [rkx, rky] = kneeIK(hipX, hipY, o.x[P.RFOOT], fy, th, sh2, facing);
  put(o, P.LKNEE, lkx, lky); put(o, P.RKNEE, rkx, rky);
  // hands toward the ground in front (bracing)
  reachHand(o, m, P.LELB, P.LHAND, x + facing * 1.1 * u, groundY - CONTACT_R * u, -facing);
  reachHand(o, m, P.RELB, P.RHAND, x + facing * 1.6 * u, groundY - CONTACT_R * u, facing);
  return o;
}

/** Arm 2-bone IK on a pose: place elbow/hand so the hand reaches (tx,ty)
 *  from the neck; the elbow bends toward `bend` (±1 in x). Clamps to reach. */
export function reachHand(o, m, elb, hand, tx, ty, bend = 1) {
  const u = m.u, l1 = PROP.upperArm * u, l2 = PROP.foreArm * u;
  const sx = o.x[P.NECK], sy = o.y[P.NECK];
  let dx = tx - sx, dy = ty - sy, d = Math.hypot(dx, dy) || 1e-6;
  const maxD = (l1 + l2) * 0.985; if (d > maxD) { dx *= maxD / d; dy *= maxD / d; d = maxD; }
  const [ex, ey] = kneeIK(sx, sy, sx + dx, sy + dy, l1, l2, bend);
  put(o, elb, ex, ey); put(o, hand, sx + dx, sy + dy);
  return o;
}

/** Copy of a pose. */
export function clonePose(p) { return { x: Float64Array.from(p.x), y: Float64Array.from(p.y) }; }
/** Blend two poses: a*(1-w) + b*w. */
export function mixPose(a, b, w) { const o = _pose(); for (let i = 0; i < P.N; i++) { o.x[i] = a.x[i] + (b.x[i] - a.x[i]) * w; o.y[i] = a.y[i] + (b.y[i] - a.y[i]) * w; } return o; }

/** Blend current points toward a pose. k=1 snaps. Keeps prev for velocity. */
export function applyPose(m, pose, k = 0.35) {
  m.asleep = false; m.quietTime = 0;
  for (let i = 0; i < P.N; i++) {
    m.px[i] = m.x[i]; m.py[i] = m.y[i];
    m.x[i] += (pose.x[i] - m.x[i]) * k;
    m.y[i] += (pose.y[i] - m.y[i]) * k;
  }
}

/* ───────────────────────────── physics ───────────────────────────── */

export const GRAVITY = 1400;      // px/s² — headline letters are ~100 px, so a light world
export const DAMP = 0.992;
export const FRICTION = 0.72;
export const REST_V = 4;          // px/s below which a point counts as resting

/**
 * One physics step. `world.topAt(x)` = surface y (ground if none),
 * `world.ground` = floor y, `world.x0/x1` = soft horizontal bounds.
 * Returns true when the whole body is at rest on a surface.
 */
export function step(m, dt, world, opts = {}) {
  const N = P.N;
  const gScale = opts.gravity ?? 1, noSleep = !!opts.noSleep, damp = opts.damp ?? DAMP;
  // Asleep: frozen solid until something wakes it (pin / impulse / pose).
  // A grounded ragdoll otherwise flickers ~1 px/frame forever where a knee
  // is wedged between a strut, a bone and the floor (measured 68 px/s on one
  // point) — invisible, but it would never count as "at rest".
  if (m.asleep && !noSleep) { let anyPin = 0; for (let i = 0; i < N; i++) anyPin |= m.pinned[i]; if (!anyPin) { m.restTime += dt; return true; } m.asleep = false; }
  if (noSleep) m.asleep = false;
  const g = GRAVITY * gScale * dt * dt;
  // integrate
  for (let i = 0; i < N; i++) {
    if (m.pinned[i]) { m.px[i] = m.x[i] = m.pinX[i]; m.py[i] = m.y[i] = m.pinY[i]; continue; }
    const vx = (m.x[i] - m.px[i]) * damp, vy = (m.y[i] - m.py[i]) * damp;
    m.px[i] = m.x[i]; m.py[i] = m.y[i];
    m.x[i] += vx; m.y[i] += vy + g;
  }
  // relax constraints
  for (let it = 0; it < 6; it++) {
    for (const [a, b, len] of m.cons) satisfy(m, a, b, len, 0);
    for (const [a, b, min] of m.struts) satisfy(m, a, b, min, 1, 0.5);   // soft: struts nudge, bones bind
    // collisions inside the loop so constraints don't push points back into ink
    collide(m, world);
  }
  // rest detection + sleep. A grounded ragdoll twitches forever at a few
  // px/s (constraints vs. floor vs. struts, measured 30–110 px/s pops while
  // lying down). Once it is *nearly* still for 0.25 s we zero every velocity
  // → it lies dead still, and step() reports resting.
  let maxV = 0, anyGround = 0;
  for (let i = 0; i < N; i++) {
    const v = Math.hypot(m.x[i] - m.px[i], m.y[i] - m.py[i]) / dt;
    if (v > maxV) maxV = v; anyGround |= m.onGround[i];
  }
  // "quiet" = nothing moved more than ~1.5 px this frame while touching a
  // surface; 0.25 s of quiet → freeze (asleep) and report resting.
  const nearly = maxV < 90 && anyGround === 1;
  m.quietTime = nearly ? (m.quietTime || 0) + dt : 0;
  if (m.quietTime > 0.25 && !noSleep) {
    for (let i = 0; i < N; i++) { m.px[i] = m.x[i]; m.py[i] = m.y[i]; }
    m.asleep = true; m.restTime += dt; return true;
  }
  const resting = maxV < REST_V && anyGround === 1;
  m.restTime = resting ? m.restTime + dt : 0;
  return resting;
}

function satisfy(m, a, b, len, minOnly, k = 1) {
  let dx = m.x[b] - m.x[a], dy = m.y[b] - m.y[a];
  let d = Math.hypot(dx, dy); if (d < 1e-6) { dx = 1e-3; dy = 0; d = 1e-3; }
  if (minOnly && d >= len) return;
  const diff = ((d - len) / d) * k;
  const wa = m.pinned[a] ? 0 : 1, wb = m.pinned[b] ? 0 : 1, ws = wa + wb || 1;
  const ka = (wa / ws) * diff, kb = (wb / ws) * diff;
  m.x[a] += dx * ka; m.y[a] += dy * ka;
  m.x[b] -= dx * kb; m.y[b] -= dy * kb;
}

function collide(m, world) {
  const r = m.u * CONTACT_R;
  for (let i = 0; i < P.N; i++) {
    m.onGround[i] = 0;
    if (m.pinned[i]) continue;
    // surface below THIS point (layered worlds pick the first one under it;
    // a point that already fell past line 1 must not be snapped back up)
    const surf = world.topAt(m.x[i], m.py[i] + r - m.u * 0.6) - r;
    if (m.y[i] > surf) {
      // Came from ABOVE the surface → land (clamp + tangential friction).
      // Came from the SIDE (was already well below this column's top, i.e.
      // it slid into a letter's flank) → treat the letter as a wall: revert
      // x, kill x-velocity. Without this, a point drifting sideways under a
      // letter top got snapped UP to it → 100 px teleports, 4000 px/s
      // "explosions" (measured in the drop test).
      const wasAbove = m.py[i] <= surf + r * 1.5;
      if (wasAbove) {
        m.y[i] = surf;
        let vx = (m.x[i] - m.px[i]) * FRICTION;
        // static friction: a grounded point crawling slower than ~0.35 px/frame
        // sticks. Letter tops are curved — without this a landed body kept
        // creeping down the slope and never counted as at rest (measured 5 s
        // on the shoulder of a G instead of 1.2 s).
        if (Math.abs(vx) < 0.35) vx = 0;
        m.px[i] = m.x[i] - vx;
        m.py[i] = m.y[i];               // kill vertical bounce
        m.onGround[i] = 1;
      } else {
        // wall: step back out horizontally to where there is headroom
        const dir = m.x[i] - m.px[i] >= 0 ? -1 : 1;
        let x = m.px[i], tries = 0;
        while (world.topAt(x, m.py[i] + r - m.u * 0.6) - r < m.y[i] && tries++ < 8) x += dir * world.dx * 2;
        m.x[i] = x; m.px[i] = x;
      }
    }
    // soft horizontal bounds
    if (m.x[i] < world.x0) { m.x[i] = world.x0; m.px[i] = m.x[i]; }
    if (m.x[i] > world.x1) { m.x[i] = world.x1; m.px[i] = m.x[i]; }
  }
}

/**
 * Active-ragdoll drive: pull each point toward the target pose with its own
 * stiffness (0..1 per frame) and bleed off some velocity (per-point damping),
 * WITHOUT resetting prev — so the body keeps its momentum: it overshoots,
 * settles, arms swing after the torso stops. Follow with step(m, dt, world,
 * {noSleep:true}) so gravity, bones and the floor act on the result.
 * gains/damps: Float32Array(P.N) or a number.
 */
export function drive(m, pose, gains, damps = 0.12) {
  m.asleep = false; m.quietTime = 0;
  for (let i = 0; i < P.N; i++) {
    if (m.pinned[i]) continue;
    const k = typeof gains === 'number' ? gains : gains[i];
    const d = typeof damps === 'number' ? damps : damps[i];
    // damp velocity first (prev toward current), then spring toward target
    m.px[i] += (m.x[i] - m.px[i]) * d;
    m.py[i] += (m.y[i] - m.py[i]) * d;
    m.x[i] += (pose.x[i] - m.x[i]) * k;
    m.y[i] += (pose.y[i] - m.y[i]) * k;
  }
}

/** Per-point stiffness presets for drive(). Feet/hips firm, hands loose. */
export function gainsPreset(kind = 'stand') {
  const g = new Float32Array(P.N);
  const set = (i, v) => { g[i] = v; };
  if (kind === 'walk') {
    set(P.HIP, 0.42); set(P.NECK, 0.34); set(P.HEAD, 0.22);
    set(P.LKNEE, 0.30); set(P.RKNEE, 0.30); set(P.LFOOT, 0.55); set(P.RFOOT, 0.55);
    set(P.LELB, 0.10); set(P.RELB, 0.10); set(P.LHAND, 0.05); set(P.RHAND, 0.05);   // arms swing passively
  } else if (kind === 'sit') {
    set(P.HIP, 0.45); set(P.NECK, 0.30); set(P.HEAD, 0.20);
    set(P.LKNEE, 0.28); set(P.RKNEE, 0.28); set(P.LFOOT, 0.14); set(P.RFOOT, 0.14); // shins pendulum-ish
    set(P.LELB, 0.14); set(P.RELB, 0.14); set(P.LHAND, 0.16); set(P.RHAND, 0.16);
  } else if (kind === 'gesture') {
    set(P.HIP, 0.45); set(P.NECK, 0.32); set(P.HEAD, 0.24);
    set(P.LKNEE, 0.28); set(P.RKNEE, 0.28); set(P.LFOOT, 0.30); set(P.RFOOT, 0.30);
    set(P.LELB, 0.30); set(P.RELB, 0.30); set(P.LHAND, 0.34); set(P.RHAND, 0.34);
  } else { // stand
    set(P.HIP, 0.40); set(P.NECK, 0.32); set(P.HEAD, 0.22);
    set(P.LKNEE, 0.30); set(P.RKNEE, 0.30); set(P.LFOOT, 0.55); set(P.RFOOT, 0.55);
    set(P.LELB, 0.12); set(P.RELB, 0.12); set(P.LHAND, 0.07); set(P.RHAND, 0.07);
  }
  return g;
}

/** Pin point i to (x, y) (grab). */
export function pin(m, i, x, y) { m.pinned[i] = 1; m.pinX[i] = x; m.pinY[i] = y; m.asleep = false; m.quietTime = 0; m.restTime = 0; }
export function unpin(m, i) { m.pinned[i] = 0; }
export function unpinAll(m) { m.pinned.fill(0); }

/** Nearest point of the manikin to (x, y): {i, d} */
export function nearestPoint(m, x, y) {
  let bi = -1, bd = Infinity;
  for (let i = 0; i < P.N; i++) { const d = Math.hypot(m.x[i] - x, m.y[i] - y); if (d < bd) { bd = d; bi = i; } }
  return { i: bi, d: bd };
}

/** Bounding box of the manikin. */
export function bounds(m) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < P.N; i++) { if (m.x[i] < x0) x0 = m.x[i]; if (m.x[i] > x1) x1 = m.x[i]; if (m.y[i] < y0) y0 = m.y[i]; if (m.y[i] > y1) y1 = m.y[i]; }
  return { x0, y0, x1, y1 };
}

/** Give the whole body a velocity kick (px/s). */
export function impulse(m, vx, vy) {
  m.asleep = false; m.quietTime = 0; m.restTime = 0;
  for (let i = 0; i < P.N; i++) { if (m.pinned[i]) continue; m.px[i] -= vx / 60; m.py[i] -= vy / 60; }
}
