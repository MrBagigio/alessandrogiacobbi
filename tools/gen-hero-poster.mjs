#!/usr/bin/env node
/**
 * gen-hero-poster.mjs — render the tail rig's REST pose to a static SVG.
 *
 * Used as: first-paint poster under the WebGL canvas (fades once the scene
 * is live), the no-WebGL fallback, and the reduced-motion still if the
 * canvas ever fails. Built from the same solver as the live scene, so the
 * silhouette matches to the pixel.
 *
 *   node tools/gen-hero-poster.mjs  →  assets/images/hero-tail-rest.svg
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { proceduralSpec, buildChain, solveFK, settle, forward } from '../assets/js/rig/tail-chain.js';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(here, '../assets/images/hero-tail-rest.svg');

const CURL_REST = 0.70, BASE_RADIUS = 0.072;
const INK = '#161310', OX = '#B8323F', LIT = '#D9CFB6', SHADE = '#C4B899';

const c = buildChain(proceduralSpec());
c.curl = CURL_REST; solveFK(c); settle(c); forward(c);
const N = c.N;
const P = (i) => [c.pos[i * 2], c.pos[i * 2 + 1]];
const R = (i) => c.radii[i] * BASE_RADIUS * c.totalLen;

// ── outline: offset the centreline by ±radius along the local normal → closed path
const left = [], right = [];
for (let i = 0; i < N; i++) {
  const [x, y] = P(i);
  const [px, py] = P(Math.max(0, i - 1)), [nx, ny] = P(Math.min(N - 1, i + 1));
  let tx = nx - px, ty = ny - py; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
  const r = R(i);
  left.push([x - ty * r, y + tx * r]); right.push([x + ty * r, y - tx * r]);
}
// bbox in chain units → viewBox (y flipped: chain +y up, svg +y down)
const all = [...left, ...right];
let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
for (const [x, y] of all) { minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y); }
const pad = BASE_RADIUS * 1.6; minx -= pad; maxx += pad; miny -= pad; maxy += pad;
const W = 400, S = W / (maxx - minx), H = Math.round((maxy - miny) * S);
const X = (x) => ((x - minx) * S).toFixed(1), Y = (y) => ((maxy - y) * S).toFixed(1);
const pt = ([x, y]) => `${X(x)},${Y(y)}`;

// smooth closed path with Catmull-Rom → cubic
function smooth(pts) {
  let d = `M ${pt(pts[0])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${pt(c1)} ${pt(c2)} ${pt(p2)}`;
  }
  return d;
}
// round the tip: pass through the centreline tip point instead of a hard L
const tipPt = P(N - 1);
const bodyPath = `${smooth([...left, tipPt])} ${smooth([tipPt, ...right.slice().reverse()]).replace(/^M [^ ]+/, '')} Z`;

// shade: a second path = the "lower/inner" half (right side) as darker wash
const shadePts = right.map((p, i) => [p[0], p[1]]);
const midPts = Array.from({ length: N }, (_, i) => { const [x, y] = P(i); const [lx, ly] = left[i]; return [x + (lx - x) * 0.05, y + (ly - y) * 0.05]; });
const shadePath = `${smooth(shadePts)} L ${pt(midPts[N - 1])} ${smooth(midPts.slice().reverse()).replace(/^M [^ ]+/, '')} Z`;

// joints: Maya pyramids as thin quads along the spine
let joints = '';
for (let i = 0; i < N - 1; i++) {
  const [x0, y0] = P(i), [x1, y1] = P(i + 1);
  let tx = x1 - x0, ty = y1 - y0; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
  const r = R(i) * 0.62 * 0.5;
  const b1 = [x0 - ty * r, y0 + tx * r], b2 = [x0 + ty * r, y0 - tx * r];
  joints += `<polygon points="${pt(b1)} ${pt([x1, y1])} ${pt(b2)}"/>`;
}
// FK circles + IK locator + handle line
const fk = [3, 6, 9, 12].filter((i) => i < N - 1).map((i) => { const [x, y] = P(i); return `<circle cx="${X(x)}" cy="${Y(y)}" r="${(R(i) * 1.6 * S).toFixed(1)}"/>`; }).join('');
const [tx, ty] = P(N - 1); const L = 0.035 * S, q = L * 0.55;
const ik = `<path d="M ${X(tx - 0.035)} ${Y(ty)} H ${X(tx + 0.035)} M ${X(tx)} ${Y(ty - 0.035)} V ${Y(ty + 0.035)}"/><rect x="${(+X(tx) - q).toFixed(1)}" y="${(+Y(ty) - q).toFixed(1)}" width="${(2 * q).toFixed(1)}" height="${(2 * q).toFixed(1)}"/><path d="M ${X(0)} ${Y(0)} L ${X(tx)} ${Y(ty)}"/>`;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="LP chameleon tail rig, rest pose">
<title>tail_rig — rest</title>
<g>
  <path d="${bodyPath}" fill="${LIT}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>
  <path d="${shadePath}" fill="${SHADE}" opacity="0.9"/>
  <g fill="${INK}" opacity="0.34">${joints}</g>
  <g fill="none" stroke="${OX}" stroke-width="0.9" opacity="0.6">${fk}${ik}</g>
</g>
</svg>
`;
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, svg);
console.log(`wrote ${OUT} (${svg.length} bytes, ${W}×${H})`);
