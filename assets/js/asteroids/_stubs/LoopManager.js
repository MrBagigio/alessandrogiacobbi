// src/core/loop/LoopManager.js

/**
 * Simple global loop manager that centralizes a single requestAnimationFrame
 * for multiple subscribers (e.g. PacmanGame, AsteroidsGame).
 *
 * Subscribers are expected to expose a `step(deltaTimeSeconds)` method.
 */
class LoopManager {
    constructor() {
        this.subscribers = new Set();
        this.isRunning = false;
        this.rafId = null;
        this.lastTimestamp = null;
        // Pre-bind once to avoid creating a new function every frame
        this._boundLoop = this._loop.bind(this);
    }

    /**
     * Registers a subscriber. The object must expose a step(deltaTimeSeconds) method.
     * @param {{ step: (deltaTimeSeconds: number) => void }} subscriber
     */
    add(subscriber) {
        if (!subscriber || typeof subscriber.step !== 'function') {
            return;
        }
        this.subscribers.add(subscriber);
        if (!this.isRunning && typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
            this.start();
        }
    }

    /**
     * Unregisters a previously added subscriber.
     * @param {{ step: (deltaTimeSeconds: number) => void }} subscriber
     */
    remove(subscriber) {
        if (!subscriber) return;
        this.subscribers.delete(subscriber);
        if (this.subscribers.size === 0) {
            this.stop();
        }
    }

    /**
     * Starts the internal requestAnimationFrame loop if not already running.
     */
    start() {
        if (this.isRunning) return;
        if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') return;
        this.isRunning = true;
        this.lastTimestamp = null;
        this.rafId = window.requestAnimationFrame(this._boundLoop);
    }

    /**
     * Stops the internal requestAnimationFrame loop and clears timestamps.
     */
    stop() {
        if (!this.isRunning) return;
        this.isRunning = false;
        if (this.rafId !== null && typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
            window.cancelAnimationFrame(this.rafId);
        }
        this.rafId = null;
        this.lastTimestamp = null;
    }

    _loop(timestamp) {
        if (!this.isRunning) return;

        const last = this.lastTimestamp == null ? timestamp : this.lastTimestamp;
        let deltaTime = (timestamp - last) / 1000;
        this.lastTimestamp = timestamp;

        if (deltaTime < 0) deltaTime = 0;
        if (deltaTime > 0.1) deltaTime = 0.1; // clamp to avoid huge jumps

        // Iterate the Set directly — safe because we check .has() before calling
        for (const sub of this.subscribers) {
            try {
                sub.step(deltaTime);
            } catch (error) {
                console.error('[LoopManager] Error in subscriber.step:', error);
            }
        }

        if (!this.isRunning || this.subscribers.size === 0) {
            this.stop();
            return;
        }

        this.rafId = window.requestAnimationFrame(this._boundLoop);
    }
}

export const loopManager = new LoopManager();
