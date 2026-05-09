// assets/js/modules/cursors/asteroids/entities/Coin.js
import { CONFIG } from '../config.js';

export class Coin {
    constructor({ x, y, value = 1 }) {
        this.x = x; // page coordinates
        this.y = y;
        this.value = value;
        this.radius = 10;
        this.color = '#FFD700';
        this.rotation = 0;
        this.pulse = 0;
        this.shouldBeRemoved = false;
        this.life = CONFIG.COIN_LIFESPAN_FRAMES || 600; // frames before disappearing
        this.sparklePhase = Math.random() * Math.PI * 2;
        // seed for deterministic facet offsets (so polygon looks consistent)
        this._seed = Math.random() * 1000;
        this.scale = 1;
    }

    update() {
        this.rotation += 0.08;
        this.pulse += 0.16;
        this.sparklePhase += 0.12;
        // subtle scale pulse + a larger beat when collected soon
        const basePulse = Math.sin(this.pulse) * 0.08;
        const endPulse = Math.max(0, (60 - Math.min(60, this.life)) / 60) * 0.06; // small pulse when near expiry
        this.scale = 1 + basePulse + endPulse;
        if (--this.life <= 0) this.shouldBeRemoved = true;
    }

    draw(ctx) {
        const alpha = Math.max(0.08, this.life / (CONFIG.COIN_LIFESPAN_FRAMES || 600));

        ctx.save();
        ctx.globalAlpha *= alpha;
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation * 0.6);
        ctx.scale(this.scale, this.scale);

        // Simple hollow circle (stroke only)
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.lineWidth = Math.max(2, Math.round(this.radius * 0.18));
        ctx.strokeStyle = '#FFD54A';
        ctx.stroke();

        // Inner thin dark outline to make it readable on any background
        ctx.beginPath();
        ctx.arc(0, 0, this.radius - 2, 0, Math.PI * 2);
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(30,30,30,0.85)';
        ctx.stroke();

        // Draw big 'C' in the center to indicate 'coin'
        ctx.fillStyle = '#FFD54A';
        ctx.font = `bold ${Math.round(this.radius * 1.2)}px "Share Tech Mono", monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        // stroke for contrast
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        ctx.strokeText('C', 0, 0);
        ctx.fillText('C', 0, 0);

        ctx.restore();
    }

    takeCollected() {
        this.shouldBeRemoved = true;
        return this.value;
    }
}
