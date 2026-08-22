// src/components/games/cursors/asteroids/managers/AlienShipPool.js

import { AlienShip } from '../entities/AlienShip.js';

export class AlienShipPool {
    constructor(initialSize = 8) {
        this.pool = [];
        this.active = [];

        for (let i = 0; i < initialSize; i++) {
            this.pool.push(new AlienShip(0, 0, 'scout'));
        }
    }

    get({ x, y, variant }) {
        let ship;
        if (this.pool.length > 0) {
            ship = this.pool.pop();
        } else {
            ship = new AlienShip(0, 0, 'scout');
        }

        ship.reset(x, y, variant);
        this.active.push(ship);
        return ship;
    }

    release(ship) {
        const index = this.active.indexOf(ship);
        if (index > -1) {
            this.active.splice(index, 1);
            this.pool.push(ship);
        }
    }

    reset() {
        this.active.forEach(s => this.pool.push(s));
        this.active = [];
    }
}

export const alienShipPool = new AlienShipPool(8);
