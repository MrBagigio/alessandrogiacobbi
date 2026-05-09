// assets/js/modules/cursors/asteroids/entities/Explosion.js
export class Explosion {
    constructor(x, y, count, color = 'white') { this.particles = []; for (let i = 0; i < count; i++) { const angle = Math.random() * Math.PI * 2; const speed = Math.random() * 3 + 1; this.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 30, radius: Math.random() * 2 + 1, color: color }); } this.shouldBeRemoved = false; }
    update() { for (let i = this.particles.length - 1; i >= 0; i--) { const p = this.particles[i]; p.life--; p.x += p.vx; p.y += p.vy; if (p.life <= 0) { this.particles.splice(i, 1); } } if (this.particles.length === 0) { this.shouldBeRemoved = true; } }
    draw(ctx) { this.particles.forEach(p => { const colorMap = { 'white': '255,255,255', 'cyan': '0,255,255', }; ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2); ctx.fillStyle = `rgba(${colorMap[p.color] || '255,255,255'}, ${p.life / 30})`; ctx.fill(); }); }
}