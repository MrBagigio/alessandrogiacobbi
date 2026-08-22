// assets/js/modules/cursors/asteroids/managers/CollisionManager.js

import { Asteroid } from '../entities/Asteroid.js';
import { AlienShip } from '../entities/AlienShip.js';
import { PowerUp } from '../entities/PowerUp.js';
import { Coin } from '../entities/Coin.js';
import { Bullet } from '../entities/Bullet.js';

export class CollisionManager {
    checkCollisions(player, entities) {
        const events = [];
        
        const enemies = entities.filter(e => e instanceof Asteroid || e instanceof AlienShip);
        const playerBullets = entities.filter(e => e instanceof Bullet && e.owner === 'player');
        const enemyBullets = entities.filter(e => e instanceof Bullet && e.owner === 'enemy');
    const powerUps = entities.filter(e => e instanceof PowerUp);
    const coins = entities.filter(e => e instanceof Coin);

        // 1. Proiettili del giocatore contro nemici
        for (const bullet of playerBullets) {
            for (const enemy of enemies) {
                // both bullet and enemy are now in page coordinates
                if (this.isCollidingEntities(bullet, enemy)) {
                    events.push({ type: 'bullet_hit_enemy', bullet, enemy });
                    break;
                }
            }
        }
        
        if (!player.isRespawning) {
            // 2. Giocatore contro minacce (nemici e proiettili nemici)
            const threats = [...enemies, ...enemyBullets];
            for (const threat of threats) {
                // threat is in page coords, convert to screen coords to compare with player (screen-space)
                const tx = (threat.x !== undefined) ? (threat.x - window.scrollX) : threat.x;
                const ty = (threat.y !== undefined) ? (threat.y - window.scrollY) : threat.y;
                const dx = player.x - tx;
                const dy = player.y - ty;
                const distance = Math.hypot(dx, dy);
                const radiusSum = (player.radius || 0) + (threat.radius || 0);
                if (distance < radiusSum) {
                    events.push({ type: 'player_hit_enemy', player, enemy: threat });
                    break;
                }
            }
        
            // 3. Giocatore contro Power-up
            for (const powerUp of powerUps) {
                const px = powerUp.x - window.scrollX;
                const py = powerUp.y - window.scrollY;
                const dx = player.x - px;
                const dy = player.y - py;
                const distance = Math.hypot(dx, dy);
                if (distance < (player.radius || 0) + (powerUp.radius || 0)) {
                    events.push({ type: 'player_collect_powerup', player, powerUp });
                }
            }

            // Coins (page-space entities)
            for (const coin of coins) {
                const cx = coin.x - window.scrollX;
                const cy = coin.y - window.scrollY;
                const dx = player.x - cx;
                const dy = player.y - cy;
                const distance = Math.hypot(dx, dy);
                if (distance < (player.radius || 0) + (coin.radius || 0)) {
                    events.push({ type: 'player_collect_coin', player, coin });
                }
            }
        }

        return events;
    }

    isColliding(obj1, obj2) {
        if (!obj1 || !obj2) return false;
        const dx = obj1.x - obj2.x;
        const dy = obj1.y - obj2.y;
        const distance = Math.hypot(dx, dy);
        return distance < (obj1.radius || 0) + (obj2.radius || 0);
    }

    // Use when both objects are in page coordinates
    isCollidingEntities(a, b) {
        if (!a || !b) return false;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const distance = Math.hypot(dx, dy);
        return distance < (a.radius || 0) + (b.radius || 0);
    }
}