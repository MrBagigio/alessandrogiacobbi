import { describe, it, expect } from 'vitest';
import {
  Skyline, LayeredSkyline, P, PROP, createManikin, standPose, sitPose, walkPose, applyPose,
  step, pin, unpinAll, nearestPoint, bounds, impulse, GRAVITY, drive, gainsPreset, CONTACT_R, TICK, ticksFor,
} from '../assets/js/rig/manikin-physics.js';

const finite = (arr) => Array.from(arr).every(Number.isFinite);

// A fake headline: two "letters" 120px wide, 100px tall, top at y=200, gap of 40px, ground at 320
function fakeSkyline() {
  const dx = 2, n = 200; const tops = new Float32Array(n).fill(Infinity);
  for (let c = 0; c < n; c++) {
    const x = c * dx;
    if (x < 120) tops[c] = 200;
    if (x >= 160 && x < 280) tops[c] = 200;
    // a raised bump on the second letter (like the tittle of an i)
    if (x >= 200 && x < 220) tops[c] = 185;
  }
  return new Skyline(0, dx, tops, 320);
}

describe('Skyline', () => {
  it('topAt / hasInk / ground', () => {
    const s = fakeSkyline();
    expect(s.topAt(50)).toBe(200);
    expect(s.topAt(140)).toBe(320);        // in the gap → ground
    expect(s.hasInk(140)).toBe(false);
    expect(s.topAt(-10)).toBe(320);
    expect(s.topAt(210)).toBe(185);
  });
  it('runs() splits at gaps and at steps larger than maxStep', () => {
    const runs = fakeSkyline().runs(6, 10);
    // letter1, letter2-left, bump, letter2-right
    expect(runs.length).toBe(4);
    expect(runs[0].x0).toBe(0); expect(runs[0].x1).toBe(120);
  });
  it('edges() finds sittable drop-offs with the correct side and prefers wide runs', () => {
    const e = fakeSkyline().edges(18, 6, 10);
    // right edge of letter 1 (drop to ground), left+right of letter 2 parts, bump edges (drop 15 < 18 → not sittable)
    const rightOfL1 = e.find((q) => Math.abs(q.x - 118) < 3);
    expect(rightOfL1).toBeTruthy(); expect(rightOfL1.side).toBe(1);
    const leftOfL2 = e.find((q) => Math.abs(q.x - 162) < 3);
    expect(leftOfL2).toBeTruthy(); expect(leftOfL2.side).toBe(-1);
    // no edge on the bump (drop only 15)
    expect(e.some((q) => Math.abs(q.x - 218) < 3 && q.side === 1)).toBe(false);
    // widest run first
    expect(e[0].runWidth).toBeGreaterThanOrEqual(e[e.length - 1].runWidth);
  });
});

describe('LayeredSkyline (two headline lines)', () => {
  // line 1: letters at x 0-120 and 160-280, top 100. line 2: solid 0-400, top 300. floor 420.
  const mk = () => {
    const dx = 2, n = 200;
    const t1 = new Float32Array(n).fill(Infinity), t2 = new Float32Array(n).fill(Infinity);
    for (let c = 0; c < n; c++) { const x = c * dx; if (x < 120 || (x >= 160 && x < 280)) t1[c] = 100; t2[c] = 300; }
    return new LayeredSkyline([{ sky: new Skyline(0, dx, t1, 420), top: 100 }, { sky: new Skyline(0, dx, t2, 420), top: 300 }], 420);
  };
  it('topAt(x, y) returns the first surface at/below y', () => {
    const w = mk();
    expect(w.topAt(50, -100)).toBe(100);      // above line 1 → line 1
    expect(w.topAt(50, 150)).toBe(300);       // already below line 1 → line 2
    expect(w.topAt(140, -100)).toBe(300);     // in the gap of line 1 → line 2 directly
    expect(w.topAt(50, 350)).toBe(420);       // below everything → floor
  });
  it('a manikin dropped in the gap of line 1 lands ON line 2, not the floor and not line 1', () => {
    const w = mk();
    const m = createManikin({ x: 140, y: 40, u: 10 });
    let rest = false; for (let i = 0; i < 400 && !rest; i++) rest = step(m, 1 / 60, w);
    expect(rest).toBe(true);
    const b = bounds(m);
    expect(b.y1).toBeLessThanOrEqual(300 + 1e-6);
    expect(b.y1).toBeGreaterThan(300 - m.u * 0.6);
  });
  it('a manikin lying on line 2 under line 1 is not teleported up to line 1', () => {
    const w = mk();
    const m = createManikin({ x: 60, y: 300, u: 10 });      // standing on line 2, under letter 1
    for (let i = 0; i < 120; i++) step(m, 1 / 60, w);
    expect(bounds(m).y0).toBeGreaterThan(200);
  });
  it('edges() across layers: line 1 right edge is sittable (drop to line 2 = 200px)', () => {
    const e = mk().edges(18, 6, 10);
    expect(e.some((q) => Math.abs(q.x - 118) < 3 && q.side === 1)).toBe(true);
  });
});

describe('Manikin poses', () => {
  it('createManikin builds 11 points, 10 bones, finite, standing on the given ground', () => {
    const m = createManikin({ x: 100, y: 300, u: 10 });
    expect(m.cons.length).toBe(10);
    expect(finite(m.x) && finite(m.y)).toBe(true);
    expect(m.y[P.LFOOT]).toBeCloseTo(300 - CONTACT_R * 10, 6);   // feet sit one contact radius above the ground
    expect(m.y[P.HEAD]).toBeLessThan(m.y[P.HIP]);
  });
  it('bone lengths in every pose stay within 12% of their rest lengths (poses are physically plausible)', () => {
    const m = createManikin({ u: 10 });
    const check = (pose, label) => {
      for (const [a, b, len] of m.cons) {
        const d = Math.hypot(pose.x[b] - pose.x[a], pose.y[b] - pose.y[a]);
        expect(Math.abs(d - len) / len, `${label} bone ${a}-${b}`).toBeLessThan(0.12);
      }
    };
    check(standPose(m, 0, 0, 1, 0.3), 'stand');
    check(sitPose(m, 0, 0, 1, 1.2), 'sit');
    check(sitPose(m, 0, 0, -1, 2.0), 'sit-left');
    check(walkPose(m, 0, () => 0, 1, 1.0), 'walk');
    check(walkPose(m, 0, () => 0, -1, 4.0), 'walk-left');
  });
  it('sit pose puts the hip on the edge and both feet below it (dangling)', () => {
    const m = createManikin({ u: 10 });
    const p = sitPose(m, 50, 200, 1, 0);
    expect(p.y[P.HIP]).toBeLessThan(200);
    expect(p.y[P.HIP]).toBeGreaterThan(200 - 0.6 * m.u);
    expect(p.y[P.LFOOT]).toBeGreaterThan(200); expect(p.y[P.RFOOT]).toBeGreaterThan(200);
    expect(p.x[P.LFOOT]).toBeGreaterThan(50);            // dangling on the facing side
  });
  it('walk pose: feet alternate — at phase π/2 vs 3π/2 the lifted foot swaps', () => {
    const m = createManikin({ u: 10 });
    const a = walkPose(m, 0, () => 100, 1, Math.PI * 0.5), b = walkPose(m, 0, () => 100, 1, Math.PI * 1.5);
    expect(a.x[P.LFOOT]).toBeGreaterThan(a.x[P.RFOOT]);
    expect(b.x[P.LFOOT]).toBeLessThan(b.x[P.RFOOT]);
    // the foot in the back half of the cycle is on the ground; the other may be lifted
    expect(Math.min(a.y[P.LFOOT], a.y[P.RFOOT])).toBeLessThanOrEqual(100);
  });
  it('applyPose keeps prev positions so a snapped body carries no fake velocity', () => {
    const m = createManikin({ u: 10 });
    const p = standPose(m, 40, 100, 1, 0);
    applyPose(m, p, 1);
    for (let i = 0; i < P.N; i++) expect(m.x[i]).toBeCloseTo(p.x[i], 9);
  });
});

describe('active-ragdoll drive', () => {
  const world = fakeSkyline();
  it('drives a fallen body up into the stand pose while gravity/bones/floor act (converges < 0.4u, no NaN)', () => {
    const m = createManikin({ x: 60, y: 200, u: 10 });
    for (let i = 0; i < 90; i++) step(m, 1 / 60, world);              // collapse on the letter
    const target = standPose(m, 60, 200, 1, 0), g = gainsPreset('stand');
    for (let i = 0; i < 150; i++) { drive(m, target, g); step(m, 1 / 60, world, { noSleep: true }); }
    expect(finite(m.x) && finite(m.y)).toBe(true);
    for (const i of [P.HIP, P.NECK, P.LFOOT, P.RFOOT]) {
      expect(Math.hypot(m.x[i] - target.x[i], m.y[i] - target.y[i])).toBeLessThan(m.u * 0.4);
    }
    for (const [a, b, len] of m.cons) { const d = Math.hypot(m.x[b] - m.x[a], m.y[b] - m.y[a]); expect(Math.abs(d - len) / len).toBeLessThan(0.08); }
  });
  it('follow-through: after a sudden torso move the hip overshoots and the passive hand is still swinging once the hip has arrived', () => {
    const m = createManikin({ x: 60, y: 200, u: 10 });
    const g = gainsPreset('walk');
    let target = standPose(m, 60, 200, 1, 0);
    for (let i = 0; i < 60; i++) { drive(m, target, g); step(m, 1 / 60, world, { noSleep: true }); }
    target = standPose(m, 100, 200, 1, 0);                              // torso jumps 40px right
    let overshoot = false, handSwingsAfterHipArrived = false;
    for (let i = 0; i < 24; i++) {
      drive(m, target, g); step(m, 1 / 60, world, { noSleep: true });
      const hipErr = target.x[P.HIP] - m.x[P.HIP];
      const vHip = Math.hypot(m.x[P.HIP] - m.px[P.HIP], m.y[P.HIP] - m.py[P.HIP]) * 60;
      const vHand = Math.hypot(m.x[P.RHAND] - m.px[P.RHAND], m.y[P.RHAND] - m.py[P.RHAND]) * 60;
      if (hipErr < -2) overshoot = true;
      if (Math.abs(hipErr) < 8 && vHand > vHip * 1.5 && vHand > 150) handSwingsAfterHipArrived = true;
    }
    expect(overshoot).toBe(true);
    expect(handSwingsAfterHipArrived).toBe(true);
    for (let i = 0; i < 120; i++) { drive(m, target, g); step(m, 1 / 60, world, { noSleep: true }); }
    expect(Math.abs(m.x[P.RHAND] - target.x[P.RHAND])).toBeLessThan(m.u * 0.6);   // …and settles
  });
  it('a driven standing body is quiet: no point vibrates above ~1 px/frame once settled', () => {
    const m = createManikin({ x: 60, y: 200, u: 10 });
    const g = gainsPreset('stand'), target = standPose(m, 60, 200, 1, 0);
    for (let i = 0; i < 120; i++) { drive(m, target, g); step(m, 1 / 60, world, { noSleep: true }); }
    let maxV = 0;
    for (let i = 0; i < 60; i++) { drive(m, target, g); step(m, 1 / 60, world, { noSleep: true }); for (let k = 0; k < P.N; k++) maxV = Math.max(maxV, Math.hypot(m.x[k] - m.px[k], m.y[k] - m.py[k]) * 60); }
    expect(maxV).toBeLessThan(65);
  });
});

describe('Manikin physics', () => {
  const world = fakeSkyline();
  it('a manikin dropped in the gap falls to the ground and comes to rest', () => {
    const m = createManikin({ x: 140, y: 100, u: 10 });        // over the gap, high up
    let rest = false, t = 0;
    while (t < 4 && !rest) { rest = step(m, 1 / 60, world); t += 1 / 60; }
    expect(rest).toBe(true);
    const b = bounds(m);
    expect(b.y1).toBeLessThanOrEqual(320 + 1e-6);              // nothing below the floor
    expect(b.y1).toBeGreaterThan(320 - m.u * 0.5);              // actually ON the floor
    expect(finite(m.x) && finite(m.y)).toBe(true);
  });
  it('a manikin dropped over a letter lands on the letter top, not the ground', () => {
    const m = createManikin({ x: 60, y: 120, u: 10 });
    for (let i = 0; i < 240; i++) step(m, 1 / 60, world);
    const b = bounds(m);
    expect(b.y1).toBeLessThanOrEqual(200 + 1e-6);
    expect(b.y1).toBeGreaterThan(200 - m.u);
  });
  it('bone lengths survive a hard fall (constraint solver holds within 5%)', () => {
    const m = createManikin({ x: 60, y: 0, u: 10 });
    impulse(m, 300, 0);
    for (let i = 0; i < 300; i++) step(m, 1 / 60, world);
    for (const [a, b, len] of m.cons) {
      const d = Math.hypot(m.x[b] - m.x[a], m.y[b] - m.y[a]);
      expect(Math.abs(d - len) / len).toBeLessThan(0.05);
    }
  });
  it('struts prevent the head from folding into the hip', () => {
    const m = createManikin({ x: 60, y: 120, u: 10 });
    // slam the head down onto the hip
    m.x[P.HEAD] = m.x[P.HIP]; m.y[P.HEAD] = m.y[P.HIP] + 1;
    for (let i = 0; i < 60; i++) step(m, 1 / 60, world);
    const d = Math.hypot(m.x[P.HEAD] - m.x[P.HIP], m.y[P.HEAD] - m.y[P.HIP]);
    expect(d).toBeGreaterThan((PROP.neck + PROP.torso * 0.6) * m.u * 0.9);
  });
  it('a pinned point stays exactly where it is pinned while the rest dangles under it', () => {
    const m = createManikin({ x: 60, y: 120, u: 10 });
    pin(m, P.HEAD, 60, 50);
    for (let i = 0; i < 180; i++) step(m, 1 / 60, world);
    expect(m.x[P.HEAD]).toBeCloseTo(60, 9); expect(m.y[P.HEAD]).toBeCloseTo(50, 9);
    expect(m.y[P.HIP]).toBeGreaterThan(50);                    // hangs below the head
    expect(m.y[P.LFOOT]).toBeGreaterThan(m.y[P.HIP]);
    unpinAll(m);
    let rest = false; for (let i = 0; i < 300 && !rest; i++) rest = step(m, 1 / 60, world);
    expect(rest).toBe(true);
  });
  it('nearestPoint / bounds are consistent', () => {
    const m = createManikin({ x: 60, y: 120, u: 10 });
    const n = nearestPoint(m, m.x[P.RHAND] + 0.1, m.y[P.RHAND]);
    expect(n.i).toBe(P.RHAND);
    const b = bounds(m); expect(b.x1).toBeGreaterThan(b.x0); expect(b.y1).toBeGreaterThan(b.y0);
  });
  it('gravity is sane for headline scale (a fall of 100px takes ~0.4s, not 3s)', () => {
    const m = createManikin({ x: 140, y: 150, u: 10 });          // over the gap, 100px above ground-ish
    let t = 0; while (t < 3 && !m.onGround.some((g) => g)) { step(m, 1 / 60, world); t += 1 / 60; }
    expect(t).toBeGreaterThan(0.15); expect(t).toBeLessThan(0.9);
    expect(GRAVITY).toBeGreaterThan(600);
  });
});

describe('audit regressions (sleep-while-held, snap velocity, wall teleport, fixed ticks)', () => {
  const world = fakeSkyline();
  // same headline but every letter top raised by `dy` px (a resize re-raster)
  function raisedSkyline(dy) {
    const dx = 2, n = 200; const tops = new Float32Array(n).fill(Infinity);
    for (let c = 0; c < n; c++) {
      const x = c * dx;
      if (x < 120) tops[c] = 200 - dy;
      if (x >= 160 && x < 280) tops[c] = 200 - dy;
      if (x >= 200 && x < 220) tops[c] = 185 - dy;
    }
    return new Skyline(0, dx, tops, 320);
  }
  it('a held (pinned) body never falls asleep, and drops normally once released', () => {
    const m = createManikin({ x: 60, y: 150, u: 10 });
    for (let i = 0; i < 240; i++) step(m, 1 / 60, world);            // lie down, fall asleep
    expect(m.asleep).toBe(true);
    const hy = m.y[P.RHAND];
    pin(m, P.RHAND, m.x[P.RHAND], hy - 40);                            // lift one hand and HOLD it still
    for (let i = 0; i < 30; i++) step(m, 1 / 60, world);
    expect(m.asleep).toBe(false);                                      // was: slept mid-drag (feet on the letter)
    expect(m.quietTime || 0).toBe(0);
    unpinAll(m);
    expect(m.asleep).toBe(false);
    for (let i = 0; i < 30; i++) step(m, 1 / 60, world);
    expect(m.y[P.RHAND]).toBeGreaterThan(hy - 40 + 5);                 // the released hand falls (was: frozen in the held pose)
  });
  it('applyPose(k=1) is a teleport: prev positions equal the new ones (no fake velocity)', () => {
    const m = createManikin({ u: 10 });
    const p = standPose(m, 40, 100, 1, 0);
    applyPose(m, p, 1);
    for (let i = 0; i < P.N; i++) {
      expect(m.x[i]).toBeCloseTo(p.x[i], 9);
      expect(m.px[i]).toBeCloseTo(m.x[i], 12); expect(m.py[i]).toBeCloseTo(m.y[i], 12);
    }
    // and one step carries no kick: nothing moves more than gravity's 1 frame
    const before = Float64Array.from(m.x);
    step(m, 1 / 60, world, { noSleep: true });
    for (let i = 0; i < P.N; i++) expect(Math.abs(m.x[i] - before[i])).toBeLessThan(1.5);
  });
  it('letter tops moving a few px UP under a resting ragdoll lands it, does not shove it through the letter', () => {
    const m = createManikin({ x: 250, y: 150, u: 10 });
    for (let i = 0; i < 240; i++) step(m, 1 / 60, world);
    const hipX = m.x[P.HIP], bb0 = bounds(m);
    expect(bb0.x0).toBeGreaterThan(160); expect(bb0.x1).toBeLessThan(280);   // it lies on the second letter
    for (const dy of [3, 4, 5]) {
      const w2 = raisedSkyline(dy);
      m.asleep = false; m.quietTime = 0;
      step(m, 1 / 60, w2);
      expect(Math.abs(m.x[P.HIP] - hipX)).toBeLessThan(m.u);            // was: 49–61 px sideways in ONE frame
      const bb = bounds(m); expect(bb.x0).toBeGreaterThan(160 - m.u); expect(bb.x1).toBeLessThan(280 + m.u);
      expect(finite(m.x) && finite(m.y)).toBe(true);
    }
  });
  it('a point pinned a few px under a letter top lands in place when released (no walk-out teleport)', () => {
    const m = createManikin({ x: 240, y: 150, u: 10 });
    for (let i = 0; i < 240; i++) step(m, 1 / 60, world);
    pin(m, P.HEAD, 240, 203);                                          // 3 px under the letter top, mid-letter
    step(m, 1 / 60, world);
    const hx = m.x[P.HIP]; unpinAll(m); step(m, 1 / 60, world);
    expect(Math.abs(m.x[P.HIP] - hx)).toBeLessThan(m.u);
  });
  it('ticksFor: 60 Hz jitter → exactly one tick per frame; 120 Hz → one tick per two frames; hitch capped at 3', () => {
    const acc = { t: 0 };
    let ticks = 0, zeros = 0, twos = 0;
    for (let f = 0; f < 600; f++) { const n = ticksFor(acc, TICK + (((f * 7919) % 11) - 5) * 0.0001); ticks += n; if (n === 0) zeros++; if (n === 2) twos++; }
    expect(ticks).toBe(600); expect(zeros).toBe(0); expect(twos).toBe(0);
    const acc2 = { t: 0 }; let t2 = 0;
    for (let f = 0; f < 120; f++) t2 += ticksFor(acc2, 1 / 120);
    expect(t2).toBe(60);
    const acc3 = { t: 0 };
    expect(ticksFor(acc3, 0.5)).toBe(3); expect(acc3.t).toBe(0);       // backlog dropped, not burst
    expect(ticksFor({ t: 0 }, 0)).toBe(0);
  });
  it('a throw travels the same distance whether the display runs at 60 or 120 Hz (fixed ticks)', () => {
    const run = (frameDt, frames) => {
      const m = createManikin({ x: 60, y: 150, u: 10 });
      for (let i = 0; i < 120; i++) step(m, TICK, world);
      const x0 = m.x[P.HIP]; const acc = { t: 0 }; impulse(m, 300, -300);
      for (let f = 0; f < frames; f++) { const n = ticksFor(acc, frameDt); for (let k = 0; k < n; k++) step(m, TICK, world); }
      return m.x[P.HIP] - x0;
    };
    const d60 = run(1 / 60, 18), d120 = run(1 / 120, 36);
    expect(d60).toBeGreaterThan(20);
    expect(Math.abs(d60 - d120) / d60).toBeLessThan(0.1);
  });
});
