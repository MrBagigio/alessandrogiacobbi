// assets/js/modules/cursors/asteroids/entities/Player.js

import { CONFIG } from '../config.js';
import { Bullet } from './Bullet.js';
import { Particle } from './Particle.js';
import { bulletPool } from '../managers/BulletPool.js';

export class Player {
    static shipDesigns = [
        // Equilateral triangle base
        [
            { x: 1, y: 0 },
            { x: -0.5, y: -0.8660254 },
            { x: -0.5, y: 0.8660254 }
        ],
        // Arrowhead variant
        [
            { x: 1, y: 0 },
            { x: -0.1, y: -0.5 },
            { x: -0.5, y: -0.2 },
            { x: -0.7, y: 0 },
            { x: -0.5, y: 0.2 },
            { x: -0.1, y: 0.5 }
        ],
        // Shuttle variant
        [
            { x: 1, y: 0 },
            { x: 0.2, y: -0.5 },
            { x: -0.15, y: -0.9 },
            { x: -0.6, y: -0.5 },
            { x: -0.6, y: 0.5 },
            { x: -0.15, y: 0.9 },
            { x: 0.2, y: 0.5 }
        ]
    ];

    constructor(cosmeticsConfig = null) {
        this.currentShipDesignIndex = 0;
        this.cosmetics = {
            shipStrokeColor: '#FFFFFF',
            boostRGB: '150, 200, 255',
            particleColor: 'rgba(180, 220, 255, 0.8)',
            shipDesignIndex: 0,
            bulletColor: 'white'
        };
        this.setCosmetics(cosmeticsConfig);
        this.reset();
    }

    reset() {
        this.x = window.innerWidth / 2;
        this.y = window.innerHeight / 2;

        this.angle = 0;
        this.radius = CONFIG.SHIP_RADIUS;
        this.lives = CONFIG.MAX_LIVES;

        this.isRespawning = false;
        this.respawnTimer = 0;
        this.lastShotTime = 0;

        this.powerUpState = {
            fireRate: { active: false, timer: 0 },
            tripleShot: { active: false, timer: 0 },
            shield: { active: false, timer: 0 },
            bounce: { active: false, timer: 0 },
            laser: { active: false, timer: 0 }
        };
        this.trailParticles = [];
    }

    setCosmetics(config) {
        const defaults = {
            shipStrokeColor: '#FFFFFF',
            boostRGB: '150, 200, 255',
            particleColor: 'rgba(180, 220, 255, 0.8)',
            shipDesignIndex: 0,
            bulletColor: 'white'
        };
        if (!config || typeof config !== 'object') {
            this.cosmetics = { ...defaults };
            this.currentShipDesignIndex = defaults.shipDesignIndex;
            return;
        }
        this.cosmetics = {
            ...defaults,
            ...config
        };
        if (typeof this.cosmetics.shipDesignIndex === 'number') {
            this.currentShipDesignIndex = this.cosmetics.shipDesignIndex;
        }
    }

    update(targetX, targetY, baseLerpAmount) {
        const dx = targetX - this.x;
        const dy = targetY - this.y;
        const distance = Math.hypot(dx, dy);

        let lerpAmount = baseLerpAmount;
        // Rallenta quando è vicino al cursore, ma in modo meno aggressivo
        if (distance < 150) { 
            // Scala la velocità dal 40% al 100% nell'arco di 150px
            const scale = 0.4 + 0.6 * (distance / 150);
            lerpAmount *= Math.min(1, scale);
        }

        if (distance > CONFIG.SHIP_DEAD_ZONE_RADIUS) {
            this.x += dx * lerpAmount;
            this.y += dy * lerpAmount;
        }

        if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
            this.angle = Math.atan2(dy, dx);
        }

        if (this.isRespawning && --this.respawnTimer <= 0) {
            this.isRespawning = false;
        }

        this.trailParticles.forEach(p => p.update());
        this.trailParticles = this.trailParticles.filter(p => p.life > 0);
    }

    draw(ctx, gameTime, mouseVelocity, isShipMode, scale = 1) {
        if (this.isRespawning && (this.respawnTimer % 20 < 10)) return;
        if (scale < 0.01) return;

        this.trailParticles.forEach(p => p.draw(ctx));

        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        ctx.scale(scale, scale);

        const designPath = Player.shipDesigns[this.currentShipDesignIndex];
        ctx.beginPath();
        designPath.forEach((p, i) => {
            ctx[i === 0 ? 'moveTo' : 'lineTo'](p.x * this.radius, p.y * this.radius);
        });
        ctx.closePath();
        ctx.strokeStyle = this.cosmetics?.shipStrokeColor || 'white';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        const thrust = Math.min(Math.hypot(mouseVelocity.x, mouseVelocity.y) * 2, 25);
        if (isShipMode && thrust > 3) {
            ctx.beginPath();
            ctx.moveTo(-this.radius * 0.7, -this.radius * 0.4);
            ctx.lineTo(-this.radius - thrust, 0);
            ctx.lineTo(-this.radius * 0.7, this.radius * 0.4);
            ctx.closePath();
            const boostRGB = this.cosmetics?.boostRGB || '150, 200, 255';
            ctx.fillStyle = `rgba(${boostRGB}, ${0.5 + Math.random() * 0.3})`;
            ctx.fill();

            if (Math.random() > 0.5) {
                const angle = this.angle + Math.PI + (Math.random() - 0.5) * 0.5;
                const speed = 1 + Math.random();
                const particleColor = this.cosmetics?.particleColor || 'rgba(180, 220, 255, 0.8)';
                
                this.trailParticles.push(new Particle(
                    this.x - Math.cos(this.angle) * this.radius,
                    this.y - Math.sin(this.angle) * this.radius,
                    particleColor,
                    20,
                    {
                        vx: Math.cos(angle) * speed,
                        vy: Math.sin(angle) * speed,
                        size: Math.random() * 2 + 1
                    }
                ));
            }
        }

        if (this.powerUpState.shield.active) {
            ctx.beginPath();
            ctx.arc(0, 0, this.radius * 1.5, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(0, 255, 255, ${0.3 + Math.sin(gameTime * 0.005) * 0.2})`;
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        ctx.restore();
    }

    shoot(gameTime, isShooting, mouseVelocity) {
        if (!isShooting || this.isRespawning) return null;

        const now = gameTime;
        const cooldown = this.powerUpState.fireRate.active ? CONFIG.SHOOT_COOLDOWN_MS / 2 : CONFIG.SHOOT_COOLDOWN_MS;

        if (now - this.lastShotTime > cooldown) {
            this.lastShotTime = now;
            const bullets = [];

            const createBullet = (angleOffset = 0) => {
                const finalAngle = this.angle + angleOffset;
                const noseX = this.x + Math.cos(finalAngle) * this.radius;
                const noseY = this.y + Math.sin(finalAngle) * this.radius;
                
                // Convert nose position (screen-space) to page-space so bullets are anchored to the document
                const pageX = noseX + window.scrollX;
                const pageY = noseY + window.scrollY;
                const bulletColor = this.cosmetics && this.cosmetics.bulletColor ? this.cosmetics.bulletColor : 'white';
                return bulletPool.get({
                    x: pageX,
                    y: pageY,
                    vx: Math.cos(finalAngle) * CONFIG.BULLET_SPEED + mouseVelocity.x * 0.5,
                    vy: Math.sin(finalAngle) * CONFIG.BULLET_SPEED + mouseVelocity.y * 0.5,
                    radius: CONFIG.BULLET_RADIUS,
                    owner: 'player',
                    color: bulletColor,
                    bounces: this.powerUpState.bounce.active ? 2 : 0
                });
            };

            bullets.push(createBullet());
            if (this.powerUpState.tripleShot.active) {
                bullets.push(createBullet(-0.2));
                bullets.push(createBullet(0.2));
            }
            return bullets;
        }
        return null;
    }

    takeDamage() {
        if (this.isRespawning) return { playerHit: false, shieldBroken: false };
        
        if (this.powerUpState.shield.active) {
            this.powerUpState.shield.active = false;
            this.powerUpState.shield.timer = 0;
            return { shieldBroken: true, playerHit: false };
        }
        
        this.lives--;
        if (this.lives > 0) {
            this.isRespawning = true;
            this.respawnTimer = CONFIG.RESPAWN_DURATION_FRAMES;
        }
        return { playerHit: true, shieldBroken: false };
    }

    activatePowerUp(type, gameTime) {
        const state = this.powerUpState[type];
        if (state) {
            state.active = true;
            let duration = CONFIG.POWERUP_DURATION_MS;
            if (type === 'laser') duration = CONFIG.LASER_DURATION_MS;
            if (type === 'shield') duration = CONFIG.SHIELD_DURATION_MS;
            state.timer = gameTime + duration;
        }
    }

    updatePowerUps(gameTime) {
        for (const key in this.powerUpState) {
            const state = this.powerUpState[key];
            if (state.active && state.timer > 0 && gameTime > state.timer) {
                state.active = false;
                state.timer = 0;
            }
        }
    }
}