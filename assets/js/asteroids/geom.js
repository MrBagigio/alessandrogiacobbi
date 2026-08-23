/**
 * geom.js — pure geometry helpers for the arcade (no DOM, unit-testable).
 */

/**
 * Does a laser BEAM starting at (sx, sy), pointing along the unit vector
 * (ux, uy) for `len` px, hit a circle (ex, ey, r)?
 * The old test used the distance to the INFINITE line, so enemies behind the
 * ship's nose (and past the drawn beam) were damaged — asteroids exploded
 * "for no reason" while lasering.
 */
export function laserHits(sx, sy, ux, uy, len, ex, ey, r) {
  const dx = ex - sx, dy = ey - sy;
  const t = dx * ux + dy * uy;                 // along-beam distance
  if (t < -r || t > len + r) return false;     // behind the nose / past the beam end
  const d = Math.abs(dx * uy - dy * ux);       // perpendicular distance to the beam
  return d < r;
}
