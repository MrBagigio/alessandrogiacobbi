// assets/js/modules/cursors/asteroids/entities/Particle.js

import { CONFIG } from '../config.js';

export class Particle {
    constructor(x, y, color = 'white', life = CONFIG.PARTICLE_LIFESPAN, options = {}) {
        this.x = x;
        this.y = y;
        this.maxLife = life * (0.8 + Math.random() * 0.4);
        this.life = this.maxLife;
        this.color = color;
        
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 3 + 1;
        
        this.vx = options.vx ?? Math.cos(angle) * speed;
        this.vy = options.vy ?? Math.sin(angle) * speed;
        this.size = options.size ?? Math.random() * 3 + 1;
        this.drag = 0.98;
    }

    update() {
        this.life--;
        this.x += this.vx;
        this.y += this.vy;
        this.vx *= this.drag;
        this.vy *= this.drag;
    }

    draw(ctx) {
        ctx.save();
        ctx.globalAlpha = this.life / this.maxLife;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * (this.life / this.maxLife), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}