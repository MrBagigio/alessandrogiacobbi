/**
 * Cursor v4 — distance-based morph, game DISABLED.
 *
 * VISUAL MODEL:
 *   ─ DOT  = small filled circle, follows mouse INSTANTLY (no lerp)
 *   ─ RING = circle outline, lerps SLOWLY toward mouse (lags behind)
 *
 *   When distance(dot, ring) is small → dot + ring (classic magnetic cursor)
 *   When distance grows past threshold (mouse moves fast) → ring morphs
 *   smoothly into a TRIANGLE SHIP (navicella) with thrust particles.
 *   When mouse stops, ring catches up → ship reverts to ring.
 *
 *   Smooth, distance-driven, fluid transition.
 *
 * GAME LOGIC: present in code (Asteroid/Bullet classes) but DISABLED —
 *   no SPACE handler, no HUD, no waves. Pure decorative cursor.
 *   To re-enable: see TODO inside this file.
 *
 * Auto-disabled: touch, reduced-motion, narrow viewport.
 */

const COLORS = {
  dot:        '#161310',
  ring:       '#161310',
  shipFill:   'rgba(184, 50, 63, 0.15)',
  shipStroke: '#161310',
  thrust:     '#B8323F',
  star:       'rgba(22, 19, 16, 0.0)',  // alpha 0 — disabled by default
};

const CONFIG = {
  // Dot (instant cursor)
  dotSize: 4,

  // Ring (lagging cursor)
  ringSize: 16,           // outer radius when in ring mode
  ringLerp: 0.12,         // smoothing toward mouse (lower = more lag)

  // Ship morph
  shipSize: 14,
  morphDistanceMin: 14,   // below this → 100% ring
  morphDistanceMax: 60,   // above this → 100% ship
  shipinessLerp: 0.18,    // morph smoothing

  // Thrust particles
  thrustEvery: 2,
  thrustLife: 22,
  thrustMinShipiness: 0.5,

  // Hover magnet
  hoverMagnet: 0.25,
};

class Particle {
  constructor(x, y, vx, vy, life, color, size = 2) {
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.life = life; this.maxLife = life;
    this.color = color; this.size = size;
  }
  update() {
    this.x += this.vx; this.y += this.vy;
    this.vx *= 0.95; this.vy *= 0.95;
    this.life--;
  }
  draw(ctx) {
    const a = Math.max(0, this.life / this.maxLife);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
export class AsteroidCursor {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) {
      console.warn(`[AsteroidCursor] canvas #${canvasId} not found`);
      this.active = false;
      return;
    }

    const finePointer = window.matchMedia?.('(pointer: fine)').matches;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const wide = window.innerWidth >= 1024;
    if (!finePointer || reduced || !wide) {
      console.info('[AsteroidCursor] disabled (non-fine pointer / reduced-motion / narrow)');
      this.active = false;
      return;
    }

    this.ctx = this.canvas.getContext('2d');
    this.active = true;

    // Mouse = dot position (instant)
    this.mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    this.hasMoved = false;

    // Ring/ship position (lerps toward mouse)
    this.ring = {
      x: this.mouse.x, y: this.mouse.y,
      vx: 0, vy: 0,
      angle: 0,
    };

    // Morph state: 0 = ring, 1 = ship
    this.shipiness = 0;
    this.thrustCounter = 0;
    this.particles = [];

    // Hover targets
    this.hoverEl = null;
    this.hoverPos = null;

    this.bind();
    this.resize();
    this.start();

    console.info('[AsteroidCursor] ✓ active. Cursor morph dot↔ring↔ship enabled.');
  }

  bind() {
    this.onResize = () => this.resize();
    this.onMouseMove = (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.hasMoved = true;

      // Hover detection
      const target = e.target.closest('a, button, .project-card, [data-cursor-magnet]');
      if (target !== this.hoverEl) {
        this.hoverEl = target || null;
      }
    };

    window.addEventListener('resize', this.onResize, { passive: true });
    window.addEventListener('mousemove', this.onMouseMove, { passive: true });
    // NOTE: game logic intentionally DISABLED. To re-enable:
    //   - bind SPACE keydown → startGame()
    //   - bind mousedown/up → shooting
    //   - implement asteroids spawning + collision
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio, 2);
    this.canvas.width = window.innerWidth * dpr;
    this.canvas.height = window.innerHeight * dpr;
    this.canvas.style.width = window.innerWidth + 'px';
    this.canvas.style.height = window.innerHeight + 'px';
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(dpr, dpr);
  }

  start() {
    this.running = true;
    document.body.classList.add('cursor-canvas-active');
    const loop = () => {
      if (!this.running) return;
      this.update();
      this.draw();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  update() {
    // Magnetic hover target
    let targetX = this.mouse.x;
    let targetY = this.mouse.y;
    if (this.hoverEl) {
      const r = this.hoverEl.getBoundingClientRect();
      const hx = r.left + r.width / 2;
      const hy = r.top + r.height / 2;
      targetX = this.mouse.x + (hx - this.mouse.x) * CONFIG.hoverMagnet;
      targetY = this.mouse.y + (hy - this.mouse.y) * CONFIG.hoverMagnet;
      this.hoverPos = { x: hx, y: hy };
    } else {
      this.hoverPos = null;
    }

    // Ring lerps toward target (slow)
    const dx = targetX - this.ring.x;
    const dy = targetY - this.ring.y;
    this.ring.vx = dx * CONFIG.ringLerp;
    this.ring.vy = dy * CONFIG.ringLerp;
    this.ring.x += this.ring.vx;
    this.ring.y += this.ring.vy;

    // Distance dot↔ring (this is the "spazio" — the gap)
    const dist = Math.hypot(this.mouse.x - this.ring.x, this.mouse.y - this.ring.y);

    // Target shipiness based on distance
    let targetShipiness;
    if (dist <= CONFIG.morphDistanceMin) {
      targetShipiness = 0;
    } else if (dist >= CONFIG.morphDistanceMax) {
      targetShipiness = 1;
    } else {
      const t = (dist - CONFIG.morphDistanceMin) / (CONFIG.morphDistanceMax - CONFIG.morphDistanceMin);
      // smoothstep curve
      targetShipiness = t * t * (3 - 2 * t);
    }

    // Smooth lerp
    this.shipiness += (targetShipiness - this.shipiness) * CONFIG.shipinessLerp;

    // Ship angle = direction of motion (only when shipiness significant)
    if (this.shipiness > 0.15) {
      const speedSq = this.ring.vx * this.ring.vx + this.ring.vy * this.ring.vy;
      if (speedSq > 0.4) {
        const targetAngle = Math.atan2(this.ring.vy, this.ring.vx);
        let diff = targetAngle - this.ring.angle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.ring.angle += diff * 0.25;
      }
    }

    // Thrust particles when in ship mode + moving
    this.thrustCounter++;
    if (this.shipiness > CONFIG.thrustMinShipiness &&
        Math.hypot(this.ring.vx, this.ring.vy) > 1.0 &&
        this.thrustCounter % CONFIG.thrustEvery === 0) {
      const back = this.ring.angle + Math.PI;
      const offset = CONFIG.shipSize * this.shipiness;
      const px = this.ring.x + Math.cos(back) * offset;
      const py = this.ring.y + Math.sin(back) * offset;
      const spread = (Math.random() - 0.5) * 0.6;
      const speed = 1.2 + Math.random() * 1.4;
      this.particles.push(new Particle(
        px, py,
        Math.cos(back + spread) * speed,
        Math.sin(back + spread) * speed,
        CONFIG.thrustLife,
        COLORS.thrust,
        1.4 + Math.random() * 1.0,
      ));
    }

    // Update + cull particles
    this.particles.forEach((p) => p.update());
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    if (!this.hasMoved) return;

    // Particles (thrust) — under everything
    this.particles.forEach((p) => p.draw(ctx));

    const sh = this.shipiness;
    const easedSh = sh * sh * (3 - 2 * sh); // smoothstep visual

    // ── DOT (instant, at mouse) — always visible ──
    ctx.save();
    ctx.fillStyle = COLORS.dot;
    ctx.beginPath();
    ctx.arc(this.mouse.x, this.mouse.y, CONFIG.dotSize, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // ── RING (alpha = 1 - shipiness) ──
    if (easedSh < 0.99) {
      ctx.save();
      ctx.globalAlpha = 1 - easedSh;
      ctx.strokeStyle = COLORS.ring;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(this.ring.x, this.ring.y, CONFIG.ringSize, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // ── SHIP (alpha = shipiness, scale grows) ──
    if (easedSh > 0.01) {
      const s = CONFIG.shipSize * (0.55 + 0.45 * easedSh);
      ctx.save();
      ctx.translate(this.ring.x, this.ring.y);
      ctx.rotate(this.ring.angle);
      ctx.globalAlpha = easedSh;
      ctx.fillStyle = COLORS.shipFill;
      ctx.strokeStyle = COLORS.shipStroke;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(s, 0);
      ctx.lineTo(-s * 0.7, -s * 0.6);
      ctx.lineTo(-s * 0.4, 0);
      ctx.lineTo(-s * 0.7, s * 0.6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // ── Magnetic hover indicator (faded line dot↔target) ──
    if (this.hoverEl && this.hoverPos && easedSh < 0.5) {
      ctx.save();
      ctx.strokeStyle = COLORS.thrust;
      ctx.globalAlpha = 0.25 * (1 - easedSh);
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(this.mouse.x, this.mouse.y);
      ctx.lineTo(this.hoverPos.x, this.hoverPos.y);
      ctx.stroke();
      ctx.restore();
    }
  }

  destroy() {
    this.running = false;
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('mousemove', this.onMouseMove);
    document.body.classList.remove('cursor-canvas-active');
  }
}
