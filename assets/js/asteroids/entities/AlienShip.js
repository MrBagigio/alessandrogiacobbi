// assets/js/modules/cursors/asteroids/entities/AlienShip.js

import { CONFIG } from '../config.js';
import { AlienAI } from './ai/AlienAI.js'; // Importa la nuova AI

export class AlienShip {
    constructor(x, y, variant = 'scout') {
        this.reset(x, y, variant);
    }

    reset(x, y, variant = 'scout') {
        this.x = x;
        this.y = y;
        this.variant = variant;

        this.radius = CONFIG.ALIEN_SHIP_RADIUS;
        this.health = CONFIG.ALIEN_SHIP_HEALTH;

        const direction = (x < window.innerWidth / 2) ? 1 : -1;
        this.vx = direction * 1.5;
        this.vy = 0;
        this.shouldBeRemoved = false;
        this.color = '#33FF33';
        this.spawnProgress = 0; // Aggiunto per l'animazione di spawn

        // Differenziazione di base tra varianti aliene
        switch (variant) {
            case 'scout':
                this.radius = CONFIG.ALIEN_SHIP_RADIUS * 0.85;
                this.health = 2;
                this.vx *= 1.3;
                this.color = '#5CFFF3';
                break;
            case 'sniper':
                this.radius = CONFIG.ALIEN_SHIP_RADIUS;
                this.health = 3;
                this.vx *= 0.8;
                this.color = '#FF66CC';
                break;
            case 'bomber':
                this.radius = CONFIG.ALIEN_SHIP_RADIUS * 1.2;
                this.health = 4;
                this.vx *= 0.9;
                this.color = '#FFA500';
                break;
            case 'ace':
                this.radius = CONFIG.ALIEN_SHIP_RADIUS * 1.1;
                this.health = 5;
                this.vx *= 1.1;
                this.color = '#FFFFFF';
                break;
            default:
                break;
        }

        this.ai = new AlienAI(this, variant); // Crea un'istanza dell'AI
    }

    update(player, boundaries) {
        // Anima lo spawn
        if (this.spawnProgress < 1) {
            this.spawnProgress += 0.04;
        }

        // Applica il movimento base
        this.x += this.vx;
        this.y += this.vy;

        // Delega le decisioni complesse (movimento verticale, sparo) all'AI
        const bulletOrBullets = this.ai.update(player);

        this.wrapEntity();
        this.avoidBoundaries(boundaries);

        return bulletOrBullets; // Può essere null, un singolo proiettile o un array
    }

    draw(ctx) {
        if (this.spawnProgress < 0.1) return;

        ctx.save();
        ctx.translate(this.x, this.y);
        
        // Applica la scala durante lo spawn
        const scale = this.spawnProgress;
        ctx.scale(scale, scale);

        const r = this.radius;
        const mainBodyHeight = r * 0.5;
        const domeRadius = r * 0.7;
        
        ctx.fillStyle = this.color;
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 1.5;

        // Corpo
        ctx.beginPath();
        ctx.moveTo(-r, 0);
        ctx.quadraticCurveTo(0, mainBodyHeight, r, 0);
        ctx.quadraticCurveTo(0, -mainBodyHeight, -r, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Cupola
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.strokeStyle = this.color;
        ctx.beginPath();
        ctx.arc(0, -domeRadius * 0.3, domeRadius, Math.PI, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.restore();
    }

    takeDamage(damage) {
        this.health -= damage;
        if (this.health <= 0) {
            this.shouldBeRemoved = true;
        }
        return null; // Non genera detriti
    }

    wrapEntity() {
        const margin = this.radius;
        const scrollY = window.scrollY;
        const viewHeight = window.innerHeight;

        if (this.x < -margin) this.x = window.innerWidth + margin;
        if (this.x > window.innerWidth + margin) this.x = -margin;
        
        if (this.y < scrollY - margin) this.y = scrollY + viewHeight + margin;
        if (this.y > scrollY + viewHeight + margin) this.y = scrollY - margin;
    }

    // Evita di passare sopra testi/UI usando i bounceBoundaries
    avoidBoundaries(boundaries) {
        if (!boundaries || !boundaries.length) return;

        const margin = this.radius + 4;

        for (const rect of boundaries) {
            const closestX = Math.max(rect.left, Math.min(this.x, rect.right));
            const closestY = Math.max(rect.top, Math.min(this.y, rect.bottom));
            const dx = this.x - closestX;
            const dy = this.y - closestY;
            const distSq = dx * dx + dy * dy;
            if (distSq < margin * margin) {
                const rectCenterY = (rect.top + rect.bottom) / 2;
                if (this.y <= rectCenterY) {
                    this.y = rect.top - margin;
                } else {
                    this.y = rect.bottom + margin;
                }
                this.vy *= -0.5;
                break;
            }
        }
    }
}