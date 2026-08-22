// assets/js/modules/cursors/asteroids/managers/WaveManager.js
import { Asteroid } from '../entities/Asteroid.js';
import { AlienShip } from '../entities/AlienShip.js';
import { asteroidPool } from './AsteroidPool.js';
import { alienShipPool } from './AlienShipPool.js';
export class WaveManager {
    static waveConfig = [
        { message: "WAVE 1", asteroids: { normal: 5 } },
        { message: "WAVE 2", asteroids: { normal: 7, fast: 2 } },
        { message: "WAVE 3", asteroids: { normal: 5, large: 2 } },
        { message: "WAVE 4", alienShips: 1, alienShipDelay: 1500 },
        { message: "WAVE 5", asteroids: { normal: 8, homing: 1 } },
        { message: "WAVE 6", asteroids: { fast: 6, splitter: 3 }, alienShips: 1, alienShipDelay: 1500 },
        { message: "WAVE 7", asteroids: { large: 3, homing: 2, splitter: 2 } },
        { message: "WAVE 8", asteroids: { normal: 6, armored: 2 }, alienShips: 2, alienShipDelay: 1400 },
        { message: "WAVE 9", asteroids: { normal: 8, fast: 4, large: 3, homing: 3, armored: 2 }, alienShips: 3, alienShipDelay: 1000 },
        { message: "FINAL WAVE", asteroids: { large: 3, homing: 5, splitter: 3, armored: 3 }, alienShips: 4, alienShipDelay: 800 }
    ];
    constructor() { this.reset(); }
    reset() { this.currentWave = -1; this.isTransitioning = false; if (this._transitionTimeout) { clearTimeout(this._transitionTimeout); this._transitionTimeout = null; } }
    startNextWave(boundaries) {
        if (this.currentWave >= WaveManager.waveConfig.length - 1) { return { event: 'game_win' }; }
        this.currentWave++;
        this.isTransitioning = true;
        const waveData = WaveManager.waveConfig[this.currentWave];
        const entitiesToSpawn = [];
        let maxDelay = 0;
        const initialDelay = 2500;

        if (waveData.asteroids) {
            Object.entries(waveData.asteroids).forEach(([type, count]) => {
                for (let i = 0; i < count; i++) {
                    const pos = this._getSpawnPosition(boundaries, type); // Passa il tipo
                    // pos now returns page coordinates (y includes scrollY)
                    // Aim roughly towards page-center (use viewport center + scroll)
                    const centerY = window.innerHeight / 2 + window.scrollY;
                    const centerX = window.innerWidth / 2 + window.scrollX;
                    const angleToCenter = Math.atan2(centerY - pos.y, centerX - pos.x);
                    const vx = Math.cos(angleToCenter) * (0.5 + Math.random() * 0.5);
                    const vy = Math.sin(angleToCenter) * (0.5 + Math.random() * 0.5);
                    const delay = initialDelay;
                    const asteroid = asteroidPool ? asteroidPool.get({ x: pos.x, y: pos.y, vx, vy, type }) : new Asteroid({ x: pos.x, y: pos.y, vx, vy, type });
                    entitiesToSpawn.push({ entity: asteroid, delay });
                    if (delay > maxDelay) maxDelay = delay;
                }
            });
        }

        if (waveData.alienShips) {
            const shipSpawnDelay = waveData.alienShipDelay || 1500;
            for (let i = 0; i < waveData.alienShips; i++) {
                const x = Math.random() > 0.5 ? -50 + window.scrollX : window.innerWidth + 50 + window.scrollX;
                const y = (Math.random() * (window.innerHeight * 0.8) + (window.innerHeight * 0.1)) + window.scrollY;
                const delay = initialDelay + (i * shipSpawnDelay);
                const variant = this._getAlienVariantForWave();
                const ship = alienShipPool ? alienShipPool.get({ x, y, variant }) : new AlienShip(x, y, variant);
                entitiesToSpawn.push({ entity: ship, delay });
                if (delay > maxDelay) maxDelay = delay;
            }
        }

        // (Coins spawn on asteroid destruction now)

        if (this._transitionTimeout) { clearTimeout(this._transitionTimeout); this._transitionTimeout = null; }
        this._transitionTimeout = setTimeout(() => { this.isTransitioning = false; this._transitionTimeout = null; }, maxDelay);
        return { entities: entitiesToSpawn };
    }

    _getSpawnRadius(type) {
        switch (type) {
            case 'fast': return 25;
            case 'large': return 60;
            case 'debris': return 15;
            case 'splitter': return 30;
            case 'armored': return 50;
            default: return 35; // ASTEROID_BASE_RADIUS from config
        }
    }

    _getAlienVariantForWave() {
        const wave = this.currentWave;
        if (wave <= 3) return 'scout';
        if (wave <= 5) {
            return Math.random() < 0.65 ? 'scout' : 'sniper';
        }
        if (wave <= 7) {
            const r = Math.random();
            if (r < 0.4) return 'scout';
            if (r < 0.8) return 'sniper';
            return 'bomber';
        }
        const r = Math.random();
        if (r < 0.25) return 'scout';
        if (r < 0.5) return 'sniper';
        if (r < 0.8) return 'bomber';
        return 'ace';
    }

    _isCircleCollidingWithRect(circle, rect) {
        const closestX = Math.max(rect.left, Math.min(circle.x, rect.right));
        const closestY = Math.max(rect.top, Math.min(circle.y, rect.bottom));
        const distanceX = circle.x - closestX;
        const distanceY = circle.y - closestY;
        return (distanceX * distanceX + distanceY * distanceY) < (circle.radius * circle.radius);
    }

    _getSpawnPosition(boundaries, entityType) {
        let x, y, isValid;
        let attempts = 0;
        const maxAttempts = 30; // Aumentato per sicurezza
        const radius = this._getSpawnRadius(entityType);

        do {
            isValid = true;
            const edge = Math.floor(Math.random() * 4);
            const margin = radius + 50; // Usa il raggio come margine
            const w = window.innerWidth;
            const h = window.innerHeight;

            switch (edge) {
                case 0: x = -margin; y = Math.random() * h; break;
                case 1: x = w + margin; y = Math.random() * h; break;
                case 2: y = -margin; x = Math.random() * w; break;
                case 3: y = h + margin; x = Math.random() * w; break;
            }

            const pageX = x + window.scrollX;
            const pageY = y + window.scrollY;

            if (boundaries) {
                const spawnCircle = { x: pageX, y: pageY, radius: radius };
                for (const rect of boundaries) {
                    if (this._isCircleCollidingWithRect(spawnCircle, rect)) {
                        isValid = false;
                        break;
                    }
                }
            }
            
            x = pageX;
            y = pageY;
            attempts++;

        } while (!isValid && attempts < maxAttempts);
        
        if (!isValid) {
            // Fallback: spawn anywhere in viewport, avoiding boundaries
            let fallbackAttempts = 0;
            const maxFallback = 50;
            do {
                isValid = true;
                x = Math.random() * window.innerWidth;
                y = Math.random() * window.innerHeight;
                const pageX = x + window.scrollX;
                const pageY = y + window.scrollY;
                const spawnCircle = { x: pageX, y: pageY, radius };
                if (boundaries) {
                    for (const rect of boundaries) {
                        if (this._isCircleCollidingWithRect(spawnCircle, rect)) {
                            isValid = false;
                            break;
                        }
                    }
                }
                x = pageX;
                y = pageY;
                fallbackAttempts++;
            } while (!isValid && fallbackAttempts < maxFallback);
        }

        if (!isValid) {
            // As a last resort, nudge downward until free
            const spawnCircle = { x, y, radius };
            let safetyIterations = 0;
            while (boundaries?.some(rect => this._isCircleCollidingWithRect(spawnCircle, rect)) && safetyIterations < 20) {
                spawnCircle.y += radius;
                y += radius;
                safetyIterations++;
            }
            if (boundaries?.some(rect => this._isCircleCollidingWithRect(spawnCircle, rect))) {
                // give up and disable collision removal
                return { x: window.scrollX + window.innerWidth / 2, y: window.scrollY - radius };
            }
        }
        
        return { x, y };
    }
}