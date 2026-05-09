// assets/js/modules/cursors/asteroids/entities/ai/AlienAI.js

import { CONFIG } from '../../config.js';
import { Bullet } from '../Bullet.js';
import { bulletPool } from '../../managers/BulletPool.js';

export class AlienAI {
    constructor(ship, variant = 'scout') {
        this.ship = ship; // Riferimento alla nave che controlla
        this.variant = variant;
        this.pathTimer = Math.random() * 100; // Randomizza l'inizio del pattern
        this.shootCooldown = 90 + Math.random() * 60;
        this.bombCooldown = 180 + Math.random() * 90;
        this.lastTargetX = null;
        this.lastTargetY = null;
    }

    update(player) {
        this.pathTimer++;

        let baseAmplitude;
        switch (this.variant) {
            case 'scout':
                baseAmplitude = 0.9;
                break;
            case 'sniper':
                baseAmplitude = 0.4;
                break;
            case 'ace':
                baseAmplitude = 0.6;
                break;
            default:
                baseAmplitude = 0.3;
                break;
        }
        this.ship.y += Math.sin(this.pathTimer * 0.05) * baseAmplitude; // Movimento sinusoidale


        // Controlla se è fuori schermo
        if ((this.ship.vx > 0 && this.ship.x > window.innerWidth + this.ship.radius * 2) ||
            (this.ship.vx < 0 && this.ship.x < -this.ship.radius * 2)) {
            this.ship.shouldBeRemoved = true;
        }

        if (!player || player.isRespawning) {
            return null;
        }

        const bullets = [];

        // Aggiorna cooldown principale per gli spari mirati
        if (--this.shootCooldown <= 0) {
            // Player usa coordinate schermo; converti in coordinate pagina per puntare correttamente con la scrollbar
            const targetX = player.x + window.scrollX;
            const targetY = player.y + window.scrollY;

            let playerVx = 0;
            let playerVy = 0;
            if (this.lastTargetX != null && this.lastTargetY != null) {
                playerVx = targetX - this.lastTargetX;
                playerVy = targetY - this.lastTargetY;
            }
            this.lastTargetX = targetX;
            this.lastTargetY = targetY;

            const angle = Math.atan2(targetY - this.ship.y, targetX - this.ship.x);


            if (this.variant === 'sniper') {
                const verticalDelta = Math.abs(targetY - this.ship.y);
                if (verticalDelta < 60) {
                    this.shootCooldown = 160 + Math.random() * 80;
                    const spread = 0.12;
                    const speeds = [1.1, 1.0, 0.9];
                    [-spread, 0, spread].forEach((offset, idx) => {
                        bullets.push(bulletPool.get({
                            x: this.ship.x,
                            y: this.ship.y,
                            vx: Math.cos(angle + offset) * CONFIG.ENEMY_BULLET_SPEED * speeds[idx],
                            vy: Math.sin(angle + offset) * CONFIG.ENEMY_BULLET_SPEED * speeds[idx],
                            radius: CONFIG.ENEMY_BULLET_RADIUS,
                            color: '#FF66CC',
                            owner: 'enemy'
                        }));
                    });
                } else {
                    this.shootCooldown = 30; // Riprova presto quando non allineato
                }
            } else if (this.variant === 'bomber') {
                this.shootCooldown = 140 + Math.random() * 60;
                const inaccuracy = 0.18;
                const finalAngle = angle + (Math.random() - 0.5) * inaccuracy;
                bullets.push(bulletPool.get({
                    x: this.ship.x,
                    y: this.ship.y,
                    vx: Math.cos(finalAngle) * CONFIG.ENEMY_BULLET_SPEED * 0.9,
                    vy: Math.sin(finalAngle) * CONFIG.ENEMY_BULLET_SPEED * 0.9,
                    radius: CONFIG.ENEMY_BULLET_RADIUS,
                    color: '#FFA500',
                    owner: 'enemy'
                }));
            } else if (this.variant === 'ace') {
                // Variante "ace": mira predittiva con raffica stretta
                const leadFrames = 14;
                const leadX = targetX + playerVx * leadFrames;
                const leadY = targetY + playerVy * leadFrames;
                const baseAngle = Math.atan2(leadY - this.ship.y, leadX - this.ship.x);

                this.shootCooldown = 70 + Math.random() * 40;
                const spread = 0.16;
                const speeds = [1.25, 1.1, 0.95];
                [-spread, 0, spread].forEach((offset, idx) => {
                    bullets.push(bulletPool.get({
                        x: this.ship.x,
                        y: this.ship.y,
                        vx: Math.cos(baseAngle + offset) * CONFIG.ENEMY_BULLET_SPEED * speeds[idx],
                        vy: Math.sin(baseAngle + offset) * CONFIG.ENEMY_BULLET_SPEED * speeds[idx],
                        radius: CONFIG.ENEMY_BULLET_RADIUS,
                        color: '#FFFFFF',
                        owner: 'enemy'
                    }));
                });
            } else {
                this.shootCooldown = 80 + Math.random() * 40;
                const inaccuracy = 0.25;
                const finalAngle = angle + (Math.random() - 0.5) * inaccuracy;
                bullets.push(bulletPool.get({
                    x: this.ship.x,
                    y: this.ship.y,
                    vx: Math.cos(finalAngle) * CONFIG.ENEMY_BULLET_SPEED * 1.1,
                    vy: Math.sin(finalAngle) * CONFIG.ENEMY_BULLET_SPEED * 1.1,
                    radius: CONFIG.ENEMY_BULLET_RADIUS,
                    color: '#5CFFF3',
                    owner: 'enemy'
                }));
            }
        }

        // Bombe verticali per i bomber
        if (this.variant === 'bomber') {
            if (--this.bombCooldown <= 0) {
                this.bombCooldown = 220 + Math.random() * 120;
                const bombCount = 3;
                for (let i = 0; i < bombCount; i++) {
                    const offsetX = (i - 1) * 8;
                    bullets.push(bulletPool.get({
                        x: this.ship.x + offsetX,
                        y: this.ship.y,
                        vx: (Math.random() - 0.5) * 1.2,
                        vy: CONFIG.ENEMY_BULLET_SPEED * 0.8,
                        radius: CONFIG.ENEMY_BULLET_RADIUS,
                        color: '#FFA500',
                        owner: 'enemy'
                    }));
                }
            }
        }

        if (!bullets.length) return null;
        return bullets.length === 1 ? bullets[0] : bullets;
    }
}