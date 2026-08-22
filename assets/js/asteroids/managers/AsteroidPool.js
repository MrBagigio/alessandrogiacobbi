// src/components/games/cursors/asteroids/managers/AsteroidPool.js

import { Asteroid } from '../entities/Asteroid.js';

export class AsteroidPool {
    constructor(initialSize = 48) {
        this.pool = [];
        this.active = [];

        for (let i = 0; i < initialSize; i++) {
            this.pool.push(new Asteroid({ x: 0, y: 0, vx: 0, vy: 0, type: 'normal' }));
        }
    }

    get(params) {
        let asteroid;
        if (this.pool.length > 0) {
            asteroid = this.pool.pop();
        } else {
            asteroid = new Asteroid({ x: 0, y: 0, vx: 0, vy: 0, type: 'normal' });
        }

        asteroid.reset(params);
        this.active.push(asteroid);
        return asteroid;
    }

    release(asteroid) {
        const index = this.active.indexOf(asteroid);
        if (index > -1) {
            this.active.splice(index, 1);
            this.pool.push(asteroid);
        }
    }

    reset() {
        this.active.forEach(a => this.pool.push(a));
        this.active = [];
    }
}

export const asteroidPool = new AsteroidPool(48);
