// assets/js/modules/cursors/asteroids/entities/Bullet.js
export class Bullet {
    constructor(params) {
        this.reset(params);
    }

    reset({ x, y, vx, vy, radius, color, owner = 'player', bounces = 0 }) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.radius = radius;
        this.color = color;
        this.owner = owner;
        this.bounces = bounces;
        this.shouldBeRemoved = false;
        this.hitBoundary = false; // Flag per segnalare l'impatto
    }

    update(player, boundaries) { // Aggiunto boundaries
        this.x += this.vx;
        this.y += this.vy;

        // Controllo collisione con gli ostacoli della UI
        if (boundaries) {
            for (const rect of boundaries) {
                if (this.x > rect.left && this.x < rect.right && this.y > rect.top && this.y < rect.bottom) {
                    this.shouldBeRemoved = true;
                    this.hitBoundary = true; // Imposta il flag
                    return; // Interrompi l'aggiornamento
                }
            }
        }

        const scrollY = window.scrollY;
        const viewHeight = window.innerHeight;

        if (this.bounces > 0) { 
            if (this.x < 0 || this.x > window.innerWidth) { this.vx *= -1; this.bounces--; } 
            if (this.y < scrollY || this.y > scrollY + viewHeight) { this.vy *= -1; this.bounces--; } 
        } else { 
            if (this.x < -10 || this.x > window.innerWidth + 10 || this.y < scrollY - 10 || this.y > scrollY + viewHeight + 10) { 
                this.shouldBeRemoved = true; 
            } 
        } 
    }
    draw(ctx) { ctx.fillStyle = this.color; ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2); ctx.fill(); }
}