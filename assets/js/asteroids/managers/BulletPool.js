// src/components/games/cursors/asteroids/managers/BulletPool.js

import { Bullet } from '../entities/Bullet.js';

export class BulletPool {
    constructor(initialSize = 128) {
        this.pool = [];
        this.active = [];

        for (let i = 0; i < initialSize; i++) {
            this.pool.push(new Bullet({ x: 0, y: 0, vx: 0, vy: 0, radius: 1, color: 'white', owner: 'player', bounces: 0 }));
        }
    }

    get(params) {
        let bullet;
        if (this.pool.length > 0) {
            bullet = this.pool.pop();
        } else {
            bullet = new Bullet({ x: 0, y: 0, vx: 0, vy: 0, radius: 1, color: 'white', owner: 'player', bounces: 0 });
        }
        bullet.reset(params);
        this.active.push(bullet);
        return bullet;
    }

    release(bullet) {
        const index = this.active.indexOf(bullet);
        if (index > -1) {
            this.active.splice(index, 1);
            this.pool.push(bullet);
        }
    }

    reset() {
        this.active.forEach(b => this.pool.push(b));
        this.active = [];
    }
}

export const bulletPool = new BulletPool(128);
