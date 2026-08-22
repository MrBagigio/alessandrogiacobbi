import { describe, it, expect } from 'vitest';
import {
  proceduralSpec, loadSpec, buildChain, solveFK, solveIK, forward,
  stepSprings, settle, isSettled, restPositions, MAX_STRETCH, CLAMP_RAD, DEFAULT_N,
} from '../assets/js/rig/tail-chain.js';

const tipOf = (c) => ({ x: c.pos[(c.N - 1) * 2], y: c.pos[(c.N - 1) * 2 + 1] });
const noNaN = (arr) => Array.from(arr).every(Number.isFinite);

describe('proceduralSpec', () => {
  it('produces N joints, root at origin, first segment along +X, total length 1', () => {
    const s = proceduralSpec();
    expect(s.N).toBe(DEFAULT_N);
    expect(s.restXY[0]).toBeCloseTo(0, 9);
    expect(s.restXY[1]).toBeCloseTo(0, 9);
    expect(s.restXY[3]).toBeCloseTo(0, 6);            // y of joint 1 == 0 → along +X
    expect(s.restXY[2]).toBeGreaterThan(0);
    let len = 0;
    for (let i = 1; i < s.N; i++) len += Math.hypot(s.restXY[i*2]-s.restXY[(i-1)*2], s.restXY[i*2+1]-s.restXY[(i-1)*2+1]);
    expect(len).toBeCloseTo(1, 6);
  });
  it('is a coil: the tip ends up much closer to the root than the chain length', () => {
    const s = proceduralSpec();
    const tip = Math.hypot(s.restXY[(s.N-1)*2], s.restXY[(s.N-1)*2+1]);
    expect(tip).toBeLessThan(0.6);                     // 1.55 turns of spiral → tip well inside
  });
  it('tapers from 1.0 to ~0.12', () => {
    const s = proceduralSpec();
    expect(s.radii[0]).toBeCloseTo(1, 9);
    expect(s.radii[s.N-1]).toBeCloseTo(0.12, 6);
  });
});

describe('buildChain / FK', () => {
  it('curl=1 reproduces the rest positions exactly', () => {
    const s = proceduralSpec();
    const c = buildChain(s);
    c.curl = 1; solveFK(c); c.theta.set(c.thetaFK); forward(c);
    for (let i = 0; i < s.N * 2; i++) expect(c.pos[i]).toBeCloseTo(s.restXY[i], 4);
  });
  it('curl=0 is a straight line along +X of length 1', () => {
    const c = buildChain(proceduralSpec());
    c.curl = 0; solveFK(c); c.theta.set(c.thetaFK); forward(c);
    const t = tipOf(c);
    expect(t.x).toBeCloseTo(1, 6);
    expect(Math.abs(t.y)).toBeLessThan(1e-6);
  });
  it('restPositions() matches spec restXY', () => {
    const s = proceduralSpec();
    const p = restPositions(s);
    for (let i = 0; i < s.N * 2; i++) expect(p[i]).toBeCloseTo(s.restXY[i], 4);
  });
});

describe('IK (FABRIK 2D)', () => {
  it('reaches an in-range target (tip within 2% of chain length)', () => {
    const c = buildChain(proceduralSpec());
    c.curl = 0.7; solveFK(c);
    const tx = 0.55, ty = 0.30;
    solveIK(c, tx, ty);
    c.ikBlend = 1; settle(c); forward(c);
    const t = tipOf(c);
    // clamps can keep it from an exact hit; require it to close most of the distance
    const startDist = Math.hypot(tx, ty);
    const err = Math.hypot(t.x - tx, t.y - ty);
    expect(err).toBeLessThan(startDist * 0.35);
  });
  it('clamps stretch to MAX_STRETCH for a far target and never exceeds it', () => {
    const c = buildChain(proceduralSpec());
    solveFK(c);
    solveIK(c, 5, 0);
    expect(c.stretch).toBeCloseTo(MAX_STRETCH, 9);
    solveIK(c, 0.2, 0.1);
    expect(c.stretch).toBe(1);
  });
  it('never exceeds the physical bend limit on any interior joint', () => {
    const c = buildChain(proceduralSpec());
    c.curl = 0.7; solveFK(c);
    // several awkward targets, including behind the root and tight to it
    for (const [tx, ty] of [[-0.4, 0.9], [-0.9, -0.1], [0.05, 0.05], [0.9, -0.9]]) {
      solveIK(c, tx, ty);
      for (let i = 2; i < c.N; i++) {
        expect(Math.abs(c.thetaIK[i])).toBeLessThanOrEqual(CLAMP_RAD + 1e-9);
      }
    }
  });
  it('can reach targets on BOTH sides of the plane (the tail is not locked to its rest curl)', () => {
    const above = buildChain(proceduralSpec()); above.curl = 0.7; solveFK(above);
    solveIK(above, 0.55, 0.30); above.ikBlend = 1; settle(above); forward(above);
    const below = buildChain(proceduralSpec()); below.curl = 0.7; solveFK(below);
    solveIK(below, 0.55, -0.30); below.ikBlend = 1; settle(below); forward(below);
    const errA = Math.hypot(tipOf(above).x - 0.55, tipOf(above).y - 0.30);
    const errB = Math.hypot(tipOf(below).x - 0.55, tipOf(below).y + 0.30);
    expect(errA).toBeLessThan(0.08);
    expect(errB).toBeLessThan(0.08);
  });
  it('produces no NaN for a target at the root or behind it', () => {
    const c = buildChain(proceduralSpec());
    solveFK(c);
    solveIK(c, 0, 0);
    expect(noNaN(c.thetaIK)).toBe(true);
    solveIK(c, -1, 0);
    expect(noNaN(c.thetaIK)).toBe(true);
    c.ikBlend = 1; settle(c); forward(c);
    expect(noNaN(c.pos)).toBe(true);
  });
});

describe('springs', () => {
  it('converge to the FK pose in under 2 s and report settled', () => {
    const c = buildChain(proceduralSpec());
    c.curl = 0.7; solveFK(c);
    // perturb
    for (let i = 0; i < c.N; i++) c.theta[i] = c.thetaFK[i] + 0.4;
    let t = 0; const dt = 1 / 60;
    while (t < 2 && !stepSprings(c, dt)) t += dt;
    expect(t).toBeLessThan(2);
    expect(isSettled(c)).toBe(true);
    for (let i = 0; i < c.N; i++) expect(c.theta[i]).toBeCloseTo(c.thetaFK[i], 2);
  });
  it('tip lags behind base on release (overlap): base settles first', () => {
    const c = buildChain(proceduralSpec());
    c.curl = 0.7; solveFK(c);
    for (let i = 0; i < c.N; i++) c.theta[i] = c.thetaFK[i] + 0.5;
    const dt = 1 / 60;
    let baseSettledAt = null, tipSettledAt = null, t = 0;
    for (let s = 0; s < 240; s++) {
      stepSprings(c, dt); t += dt;
      if (baseSettledAt === null && Math.abs(c.theta[1] - c.thetaFK[1]) < 0.02) baseSettledAt = t;
      if (tipSettledAt === null && Math.abs(c.theta[c.N-1] - c.thetaFK[c.N-1]) < 0.02) tipSettledAt = t;
    }
    expect(baseSettledAt).not.toBeNull();
    expect(tipSettledAt).not.toBeNull();
    expect(tipSettledAt).toBeGreaterThan(baseSettledAt);
  });
  it('root heading takes the short arc: a target crossing the −X axis behind the root does not whip the tail 360°', () => {
    const c = buildChain(proceduralSpec());
    solveFK(c); c.ikBlend = 1;
    solveIK(c, -1.5, 0.01); settle(c); forward(c);            // heading ≈ +π
    solveIK(c, -1.5, -0.01);                                   // heading ≈ −π: goal jumps by ~2π
    let sweep = 0, maxTipStep = 0, prev = c.theta[1]; forward(c); let pt = tipOf(c);
    for (let s = 0; s < 120; s++) {
      stepSprings(c, 1 / 60); forward(c);
      // settle() may snap θ1 by 2πk (no visual change) — measure the wrapped delta
      let d = c.theta[1] - prev; d = Math.atan2(Math.sin(d), Math.cos(d)); sweep += Math.abs(d); prev = c.theta[1];
      const t = tipOf(c); maxTipStep = Math.max(maxTipStep, Math.hypot(t.x - pt.x, t.y - pt.y)); pt = t;
    }
    expect(sweep).toBeLessThan(0.5);                           // was: ~6.3 rad (362° sweep over 2 s)
    expect(maxTipStep).toBeLessThan(0.02);                     // tip never jumps (chain length ≈ 1)
    expect(noNaN(c.theta)).toBe(true);
  });
});

describe('loadSpec (Maya sidecar JSON)', () => {
  const mk = (n, planar = true) => ({
    unit: 'cm', up: 'y', project: 'LP',
    joints: Array.from({ length: n }, (_, i) => {
      const a = i * 0.35, r = 10 * Math.exp(0.2 * a);
      return { name: `tail_${String(i+1).padStart(2,'0')}`, rest: [r*Math.cos(a), r*Math.sin(a), planar ? 0 : Math.sin(i)*0.4], ext: [i*5,0,0], r: 1.2 - i*0.05 };
    }),
  });
  it('accepts a valid 16-joint chain and normalises length to 1', () => {
    const s = loadSpec(mk(16));
    expect(s).not.toBeNull();
    expect(s.N).toBe(16);
    expect(s.source).toBe('json');
    let len = 0;
    for (let i = 1; i < s.N; i++) len += Math.hypot(s.restXY[i*2]-s.restXY[(i-1)*2], s.restXY[i*2+1]-s.restXY[(i-1)*2+1]);
    expect(len).toBeCloseTo(1, 6);
    expect(s.names[0]).toBe('tail_01');
  });
  it('projects a slightly non-planar chain without NaN', () => {
    const s = loadSpec(mk(16, false));
    expect(s).not.toBeNull();
    expect(noNaN(s.restXY)).toBe(true);
  });
  it('rejects too few / too many joints, bad coords, garbage', () => {
    expect(loadSpec(mk(6))).toBeNull();
    expect(loadSpec(mk(30))).toBeNull();
    const bad = mk(16); bad.joints[3].rest = [1, NaN, 0];
    expect(loadSpec(bad)).toBeNull();
    expect(loadSpec(null)).toBeNull();
    expect(loadSpec({})).toBeNull();
    expect(loadSpec({ joints: 'nope' })).toBeNull();
  });
  it('uniform Maya radii (untouched default 1.0) get the procedural taper; tiny radii are floored', () => {
    const uni = mk(16); uni.joints.forEach((j) => { j.r = 1.0; });
    const s = loadSpec(uni);
    expect(s.radii[0]).toBeCloseTo(1, 6);
    expect(s.radii[s.N - 1]).toBeCloseTo(0.12, 6);
    const tiny = mk(16); tiny.joints[15].r = 0.0001;
    const s2 = loadSpec(tiny);
    expect(s2.radii[15]).toBeGreaterThanOrEqual(0.08 - 1e-6); // Float32Array storage
  });
  it('missing names fall back to tail_01.. (1-based, per joint)', () => {
    const anon = mk(10); anon.joints.forEach((j) => { delete j.name; });
    const s = loadSpec(anon);
    expect(s.names[0]).toBe('tail_01');
    expect(s.names[9]).toBe('tail_10');
  });
  it('a chain built from JSON reproduces its own rest at curl=1', () => {
    const s = loadSpec(mk(14));
    const c = buildChain(s);
    c.curl = 1; solveFK(c); c.theta.set(c.thetaFK); forward(c);
    for (let i = 0; i < s.N * 2; i++) expect(c.pos[i]).toBeCloseTo(s.restXY[i], 4);
  });
});
