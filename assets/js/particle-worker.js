/**
 * particle-worker.js — runs the magnetic-letters click-burst physics
 * + canvas drawing on a Worker thread via OffscreenCanvas.
 *
 * Why: the burst is the single heaviest compute path in this codebase —
 * up to 600 particles × 200 frames of physics + fillRect each frame. On
 * mobile that's the kind of payload that drops main-thread frames during
 * a critical click interaction.
 *
 * Protocol:
 *   main → worker  { type: 'init',  canvas, dpr }       (canvas transferred)
 *   main → worker  { type: 'burst', particles }
 *   worker → main  { type: 'done' }
 *   main → worker  { type: 'stop' }
 */

let canvas = null;
let ctx = null;
let particles = [];
let stopFlag = false;

function loop() {
  if (stopFlag || !ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  let alive = 0;
  for (const p of particles) {
    if (p.life <= 0) continue;
    alive++;
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.18;       // gravity
    p.vx *= 0.985;      // air drag
    p.life -= p.decay;
    const a = Math.max(0, p.life);
    ctx.fillStyle = `rgba(${p.color},${a.toFixed(2)})`;
    ctx.fillRect(p.x, p.y, p.size, p.size);
  }

  if (alive > 0) {
    // Workers have no rAF; setTimeout(0) ticks at ~60fps when host idle,
    // and the browser throttles further if the tab is hidden — good.
    setTimeout(loop, 16);
  } else {
    self.postMessage({ type: 'done' });
  }
}

self.onmessage = (e) => {
  const { type, data } = e.data || {};
  if (type === 'init') {
    canvas = data.canvas;
    ctx = canvas.getContext('2d');
    if (data.dpr && data.dpr !== 1) ctx.scale(data.dpr, data.dpr);
  } else if (type === 'burst') {
    particles = data.particles;
    stopFlag = false;
    loop();
  } else if (type === 'stop') {
    stopFlag = true;
  }
};
