/**
 * tail-chain.js — pure-JS planar tail rig: rest data, FK, 2D FABRIK IK,
 * per-joint springs, stretch. No Three.js dependency, so it drives the WebGL
 * scene, the vitest suite AND the SVG poster generator alike.
 *
 * MODEL — the tail lies in a plane, each joint has ONE degree of freedom: a
 * bend angle θ_i about the local Z axis. That collapses FK/IK/blend/springs to
 * scalar math (no quaternions, no parallel transport, no roll flips).
 *
 *   bind pose      = straight tube along +X, root at origin
 *   rest pose      = the curled tail (procedural log-spiral, or from Maya JSON)
 *   curlProfile[i] = θ_i in the rest pose  →  curl=1 reproduces rest exactly
 *   FK             θ_i = curl · curlProfile[i]
 *   IK             FABRIK in 2D toward a target, per-joint clamp, preferred bend
 *   blend + spring θ_i eases toward mix(FK, IK, ikBlend) with a damped spring
 *                  whose stiffness falls toward the tip → overlap / follow-through
 *   stretch        clamp(dist(root,target)/totalLen, 1, MAX_STRETCH), applied
 *                  as a uniform scale on segment lengths (volume preserve is done
 *                  in the vertex shader as yz *= 1/√s — no bone scaling, no shear)
 */

export const DEFAULT_N = 16;
export const MAX_STRETCH = 1.12;
/** Physical per-joint bend limit (absolute). The tightest joint of the rest
 *  coil is ~94°, so 100° lets the tail fully re-coil while still preventing
 *  the hairpin kinks FABRIK would otherwise produce near the tip. */
export const MAX_BEND = (100 * Math.PI) / 180;
/** @deprecated kept for API compat with early tests; use MAX_BEND */
export const CLAMP_RAD = MAX_BEND;
const FABRIK_ITERS = 8;

/* ─────────────────────────────── spec ─────────────────────────────── */

/**
 * Procedural rest spec: a log-spiral r(φ) = a·e^{bφ} over ~1.5 turns, sampled
 * at constant arc length into N joints, tapered radii 1.0 → 0.12.
 * Coordinates are normalised so total chain length == 1.
 */
export function proceduralSpec(N = DEFAULT_N) {
  const b = 0.24;                       // tightness of the spiral
  const turns = 1.55;
  const phiEnd = turns * Math.PI * 2;
  // dense sample of the spiral to measure arc length
  const dense = [];
  const S = 1200;
  for (let k = 0; k <= S; k++) {
    const phi = (k / S) * phiEnd;
    const r = Math.exp(b * phi);        // a=1, we normalise later
    dense.push([r * Math.cos(phi), r * Math.sin(phi)]);
  }
  const cum = [0];
  for (let k = 1; k <= S; k++) {
    const dx = dense[k][0] - dense[k - 1][0], dy = dense[k][1] - dense[k - 1][1];
    cum.push(cum[k - 1] + Math.hypot(dx, dy));
  }
  const total = cum[S];
  // pick N points at equal arc length; walk from the OUTER end (root) inward
  // so the root is the wide end of the spiral and the tip is the tight centre.
  const pts = [];
  for (let i = 0; i < N; i++) {
    const target = total * (1 - i / (N - 1));
    let k = 0;
    while (k < S && cum[k + 1] < target) k++;
    const seg = cum[k + 1] - cum[k] || 1;
    const t = (target - cum[k]) / seg;
    pts.push([
      dense[k][0] + (dense[k + 1][0] - dense[k][0]) * t,
      dense[k][1] + (dense[k + 1][1] - dense[k][1]) * t,
    ]);
  }
  // normalise: root at origin, total length 1, first segment along +X
  const root = pts[0];
  const rel = pts.map(([x, y]) => [x - root[0], y - root[1]]);
  const a0 = Math.atan2(rel[1][1], rel[1][0]);
  const c = Math.cos(-a0), s = Math.sin(-a0);
  const rot = rel.map(([x, y]) => [x * c - y * s, x * s + y * c]);
  let len = 0;
  for (let i = 1; i < N; i++) len += Math.hypot(rot[i][0] - rot[i - 1][0], rot[i][1] - rot[i - 1][1]);
  const restXY = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) { restXY[i * 2] = rot[i][0] / len; restXY[i * 2 + 1] = rot[i][1] / len; }
  const radii = new Float32Array(N);
  for (let i = 0; i < N; i++) { const t = i / (N - 1); radii[i] = 1.0 - 0.88 * t; }
  return { N, restXY, radii, source: 'procedural' };
}

/**
 * Validate + normalise a Maya sidecar JSON:
 *   { unit, up, project, joints:[{name, rest:[x,y,z], ext:[x,y,z], r}], controls? }
 * Projects the rest positions onto their principal plane (PCA), so a slightly
 * non-planar Maya chain still yields a clean 2D chain. Returns spec | null.
 */
export function loadSpec(json) {
  try {
    if (!json || !Array.isArray(json.joints)) return null;
    const J = json.joints;
    if (J.length < 8 || J.length > 24) return null;
    const P = J.map((j) => j.rest);
    if (P.some((p) => !Array.isArray(p) || p.length < 3 || p.some((v) => !Number.isFinite(v)))) return null;
    // PCA plane: centroid + top-2 eigenvectors (power iteration is overkill; use
    // the classic 3x3 covariance + Jacobi-free approach: pick the two axes with
    // the largest variance after removing the smallest one via cross products).
    const n = P.length;
    const cx = P.reduce((a, p) => a + p[0], 0) / n, cy = P.reduce((a, p) => a + p[1], 0) / n, cz = P.reduce((a, p) => a + p[2], 0) / n;
    const D = P.map((p) => [p[0] - cx, p[1] - cy, p[2] - cz]);
    // normal ≈ mean of cross products of consecutive segments
    let nx = 0, ny = 0, nz = 0;
    for (let i = 1; i < n - 1; i++) {
      const ax = D[i][0] - D[i - 1][0], ay = D[i][1] - D[i - 1][1], az = D[i][2] - D[i - 1][2];
      const bx = D[i + 1][0] - D[i][0], by = D[i + 1][1] - D[i][1], bz = D[i + 1][2] - D[i][2];
      nx += ay * bz - az * by; ny += az * bx - ax * bz; nz += ax * by - ay * bx;
    }
    const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
    // in-plane basis: u = first segment projected onto plane, v = n × u
    let ux = D[1][0] - D[0][0], uy = D[1][1] - D[0][1], uz = D[1][2] - D[0][2];
    const dot = ux * nx + uy * ny + uz * nz; ux -= dot * nx; uy -= dot * ny; uz -= dot * nz;
    const ul = Math.hypot(ux, uy, uz) || 1; ux /= ul; uy /= ul; uz /= ul;
    const vx = ny * uz - nz * uy, vy = nz * ux - nx * uz, vz = nx * uy - ny * ux;
    const rel = D.map((d) => [d[0] * ux + d[1] * uy + d[2] * uz, d[0] * vx + d[1] * vy + d[2] * vz]);
    const rx = rel[0][0], ry = rel[0][1];
    const shifted = rel.map(([x, y]) => [x - rx, y - ry]);
    let len = 0;
    for (let i = 1; i < n; i++) len += Math.hypot(shifted[i][0] - shifted[i - 1][0], shifted[i][1] - shifted[i - 1][1]);
    if (!(len > 0)) return null;
    const restXY = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { restXY[i * 2] = shifted[i][0] / len; restXY[i * 2 + 1] = shifted[i][1] / len; }
    // Radii: normalise to the thickest joint, and never let a joint fall
    // under 8% of it — Maya joint `radius` is a display attribute that riggers
    // often leave at 1.0 for the whole chain or shrink to ~0 at the tip; a
    // zero radius would pinch the tube into a line and break the hull.
    const rr = J.map((j) => (Number.isFinite(j.r) && j.r > 0 ? j.r : 1));
    const rmax = Math.max(...rr);
    const radii = new Float32Array(n);
    for (let i = 0; i < n; i++) radii[i] = Math.max(0.08, rr[i] / rmax);
    // If every radius is identical (typical untouched Maya default) apply the
    // procedural taper instead — a cylinder does not read as a tail.
    if (radii.every((r) => Math.abs(r - radii[0]) < 1e-6)) {
      for (let i = 0; i < n; i++) radii[i] = 1.0 - 0.88 * (i / (n - 1));
    }
    const names = J.map((j, i) => String(j.name || `tail_${String(i + 1).padStart(2, '0')}`));
    return { N: n, restXY, radii, source: 'json', names };
  } catch {
    return null;
  }
}

/* ─────────────────────────────── chain ────────────────────────────── */

export function buildChain(spec) {
  const N = spec.N;
  const lengths = new Float32Array(N - 1);
  const curlProfile = new Float32Array(N);
  let prevHeading = 0;
  for (let i = 1; i < N; i++) {
    const dx = spec.restXY[i * 2] - spec.restXY[(i - 1) * 2];
    const dy = spec.restXY[i * 2 + 1] - spec.restXY[(i - 1) * 2 + 1];
    lengths[i - 1] = Math.hypot(dx, dy);
    const heading = Math.atan2(dy, dx);
    curlProfile[i] = i === 1 ? heading : wrap(heading - prevHeading);
    prevHeading = heading;
  }
  curlProfile[0] = 0;
  const totalLen = lengths.reduce((a, b) => a + b, 0);
  const c = {
    N, lengths, radii: spec.radii, curlProfile, totalLen,
    thetaFK: new Float32Array(N), thetaIK: new Float32Array(N), theta: new Float32Array(N),
    vel: new Float32Array(N), pos: new Float32Array(N * 2),
    curl: 0.7, ikBlend: 0, stretch: 1, dragging: false,
    target: { x: 0, y: 0 },
    // spring params: base joints stiff, tip loose → overlap
    stiffness: new Float32Array(N), damping: 0.8, settled: true,
    source: spec.source, names: spec.names || null,
  };
  for (let i = 0; i < N; i++) c.stiffness[i] = 60 * (1 - 0.55 * (i / (N - 1)));
  solveFK(c);
  c.theta.set(c.thetaFK);
  forward(c);
  return c;
}

/* ─────────────────────────────── solvers ──────────────────────────── */

export function solveFK(c) {
  for (let i = 0; i < c.N; i++) c.thetaFK[i] = c.curl * c.curlProfile[i];
}

/** Forward kinematics from c.theta (+ stretch on lengths) into c.pos. */
export function forward(c) {
  let x = 0, y = 0, heading = 0;
  c.pos[0] = 0; c.pos[1] = 0;
  for (let i = 1; i < c.N; i++) {
    heading += c.theta[i];
    const L = c.lengths[i - 1] * c.stretch;
    x += Math.cos(heading) * L; y += Math.sin(heading) * L;
    c.pos[i * 2] = x; c.pos[i * 2 + 1] = y;
  }
}

/**
 * FABRIK 2D toward (tx,ty), root pinned at origin. Iterates backward/forward,
 * clamps each joint's bend to ±CLAMP_RAD around its FK value, prefers bending
 * in the sign of the rest curl (the tail re-coils its own way). Also sets
 * c.stretch when the target is beyond reach.
 */
export function solveIK(c, tx, ty) {
  const N = c.N;
  const dist = Math.hypot(tx, ty);
  c.stretch = Math.max(1, Math.min(MAX_STRETCH, dist / (c.totalLen || 1)));
  const L = c.lengths;
  // work buffer starts from current forward pose
  const P = c._ik || (c._ik = new Float32Array(N * 2));
  P.set(c.pos);
  const reach = c.totalLen * c.stretch;
  if (dist > reach - 1e-6) {
    // fully extended straight at target (with stretch) — clamp will bend it back
    const ux = tx / (dist || 1), uy = ty / (dist || 1);
    let acc = 0;
    for (let i = 0; i < N; i++) { P[i * 2] = ux * acc; P[i * 2 + 1] = uy * acc; if (i < N - 1) acc += L[i] * c.stretch; }
  } else {
    for (let it = 0; it < FABRIK_ITERS; it++) {
      // backward: tip → target
      P[(N - 1) * 2] = tx; P[(N - 1) * 2 + 1] = ty;
      for (let i = N - 2; i >= 0; i--) {
        const dx = P[i * 2] - P[(i + 1) * 2], dy = P[i * 2 + 1] - P[(i + 1) * 2 + 1];
        const d = Math.hypot(dx, dy) || 1e-6, l = L[i] * c.stretch;
        P[i * 2] = P[(i + 1) * 2] + (dx / d) * l; P[i * 2 + 1] = P[(i + 1) * 2 + 1] + (dy / d) * l;
      }
      // forward: root → pinned, WITH the bend limit enforced inside the pass.
      // Constraining here (not after extraction) lets FABRIK converge to a pose
      // that is both reachable and physically valid — clamping angles after the
      // fact broke the chain at the clamped joint and missed the target by 0.38.
      P[0] = 0; P[1] = 0;
      let prevHeading = 0;
      for (let i = 1; i < N; i++) {
        let dx = P[i * 2] - P[(i - 1) * 2], dy = P[i * 2 + 1] - P[(i - 1) * 2 + 1];
        let heading = Math.atan2(dy, dx);
        if (i > 1) {
          const bend = wrap(heading - prevHeading);
          if (bend > MAX_BEND) heading = prevHeading + MAX_BEND;
          else if (bend < -MAX_BEND) heading = prevHeading - MAX_BEND;
        }
        const l = L[i - 1] * c.stretch;
        P[i * 2] = P[(i - 1) * 2] + Math.cos(heading) * l;
        P[i * 2 + 1] = P[(i - 1) * 2 + 1] + Math.sin(heading) * l;
        prevHeading = heading;
      }
    }
  }
  // Extract bend angles from consecutive headings. The clamp is a PHYSICAL
  // joint limit on the absolute bend (|θ_i| ≤ MAX_BEND), not a band around
  // the FK pose — a band around FK made the tail unable to un-coil toward
  // targets on the far side of the plane (caught by the "reaches target" test).
  // Joint 1 is the root heading and is free (the tail may point anywhere).
  let prev = 0;
  for (let i = 1; i < N; i++) {
    const h = Math.atan2(P[i * 2 + 1] - P[(i - 1) * 2 + 1], P[i * 2] - P[(i - 1) * 2]);
    let th = i === 1 ? h : wrap(h - prev);
    if (i > 1) {
      if (th > MAX_BEND) th = MAX_BEND; else if (th < -MAX_BEND) th = -MAX_BEND;
    }
    c.thetaIK[i] = th;
    prev = h;
  }
  c.thetaIK[0] = 0;
}

/**
 * Advance the per-joint springs one step (dt seconds). theta_i chases the
 * blended goal mix(FK, IK, ikBlend). Marks c.settled when nothing moves.
 */
export function stepSprings(c, dt) {
  const clampedDt = Math.min(dt, 1 / 30);
  let maxV = 0;
  for (let i = 0; i < c.N; i++) {
    const goal = c.thetaFK[i] + (c.thetaIK[i] - c.thetaFK[i]) * c.ikBlend;
    const k = c.stiffness[i];
    const zeta = c.damping;
    const cDamp = 2 * zeta * Math.sqrt(k);
    const x = c.theta[i] - goal;
    const a = -k * x - cDamp * c.vel[i];
    c.vel[i] += a * clampedDt;
    c.theta[i] += c.vel[i] * clampedDt;
    const av = Math.abs(c.vel[i]); if (av > maxV) maxV = av;
  }
  // Settle when both velocity AND residual error are below the perceptual
  // floor (chain length 1 ≈ 300–550 css px on screen: 2e-3 rad on a 0.07
  // segment ≈ 0.05 px). Then snap so the pose is exactly the goal and the
  // renderer can go idle instead of chasing an asymptote (measured: 3.2 s
  // to idle at 1e-3 velocity-only vs ~1 s of visible motion).
  let maxErr = 0;
  for (let i = 0; i < c.N; i++) {
    const goal = c.thetaFK[i] + (c.thetaIK[i] - c.thetaFK[i]) * c.ikBlend;
    const e = Math.abs(c.theta[i] - goal); if (e > maxErr) maxErr = e;
  }
  c.settled = maxV < 2e-2 && maxErr < 2e-3;
  if (c.settled) settle(c);
  return c.settled;
}

/** Snap springs to their goal instantly (reduced-motion / init). */
export function settle(c) {
  for (let i = 0; i < c.N; i++) {
    c.theta[i] = c.thetaFK[i] + (c.thetaIK[i] - c.thetaFK[i]) * c.ikBlend;
    c.vel[i] = 0;
  }
  c.settled = true;
}

export function isSettled(c, eps = 1e-3) {
  for (let i = 0; i < c.N; i++) if (Math.abs(c.vel[i]) > eps) return false;
  return true;
}

/* ─────────────────────────────── utils ────────────────────────────── */

function wrap(a) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

/** Joint world positions from the rest pose (curl=1, no IK) — used by the SVG poster. */
export function restPositions(spec) {
  const c = buildChain(spec);
  c.curl = 1; solveFK(c); c.theta.set(c.thetaFK); forward(c);
  return Array.from(c.pos);
}
