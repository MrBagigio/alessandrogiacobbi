// assets/js/modules/cursors/asteroids/AsteroidsGame.js

import { CONFIG } from './config.js';

import { Player } from './entities/Player.js';
import { PowerUp } from './entities/PowerUp.js';
import { Asteroid } from './entities/Asteroid.js';
import { AlienShip } from './entities/AlienShip.js';
import { Coin } from './entities/Coin.js';
import { Particle } from './entities/Particle.js';
import { Bullet } from './entities/Bullet.js';
import { WaveManager } from './managers/WaveManager.js';
import { UIManager } from './managers/UIManager.js';
import { CollisionManager } from './managers/CollisionManager.js';
import { ParallaxBackground } from './managers/ParallaxBackground.js';
import { bulletPool } from './managers/BulletPool.js';
import { asteroidPool } from './managers/AsteroidPool.js';
import { alienShipPool } from './managers/AlienShipPool.js';
import EventBus from './_stubs/EventBus.js';
import { EVENTS } from './_stubs/constants.js';
import { loopManager } from './_stubs/LoopManager.js';
import { hangarService } from './_stubs/HangarService.js';
import { AudioManager } from './_stubs/AudioManager.js';

const clamp01 = (value) => Math.min(1, Math.max(0, value));
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/**
 * AsteroidsGame
 *
 * Arcade-style space shooter used as a custom cursor. Manages ship
 * movement, waves, power-ups, collisions and rendering, while being
 * stepped by the global LoopManager.
 */
export class AsteroidsGame {

    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) { this.isActive = false; return; }
        if (!window.matchMedia || !window.matchMedia("(pointer: fine)").matches) {
            this.isActive = false;
            try { this.canvas.style.display = 'none'; } catch (e) {}
            return;
        }
        
        this.ctx = this.canvas.getContext('2d');
        this.isActive = window.matchMedia("(pointer: fine)").matches;
        this.isRunning = false;
        this.gameTime = 0;
        this.animationFrameId = null;
    this.lastTimestamp = null;
    this.delta = 0; // seconds

        this.abortController = null;

        this.spawnTimeouts = new Set();
        this.isGameOver = false;
        this.isShipMode = false;
        this.isShooting = false;
        this.isReturningToCursor = false;
        this.isPaused = false;
        this.isGameMode = false;
        this.magneticState = 'none'; // Stati: none, entering, active, exiting
        this.magneticTransition = 0; // 0 = visibile, 1 = invisibile
        this.magneticRenderProgress = 0;
        this.magneticApproachProgress = 0;
        this.score = 0;
        this.comboMultiplier = 1.0;
        this.comboTimer = 0;
        this.shake = { intensity: 0, duration: 0 };
    this.globalAlpha = 0;
        this.hasShownShipHint = false;
        
        this.clickFeedback = null; // {x, y, radius, alpha, timestamp}

        // ── AAA layer ──
        this.morph = 0;            // 0 = sphere (cursor ring) … 1 = ship; distance-driven, smoothed
        this.restPaused = false;   // game frozen while the ship has caught the cursor (sphere)
        this.pendingSpawns = [];   // wave entities that arrived while paused (NOT dropped)
        this.rings = [];           // shockwave rings {x, y, r, max, life}
        this.flash = 0;            // full-screen hit flash 0..1
        this.slowmo = 0;           // frames of slow motion left (death)
        this.frameNo = 0;
        this.bank = 0;             // ship banking (turn rate), radians
        
        this.isMagnetic = false;
        this.attachedTarget = null;
        this.bounceBoundaries = [];

        this.mouse = { x: -100, y: -100 };
        this.prevMouse = { x: -100, y: -100 };
        this.mouseVelocity = { x: 0, y: 0 };

        const cosmeticsConfig = hangarService?.getAsteroidsCosmeticsConfig ? hangarService.getAsteroidsCosmeticsConfig() : null;
        this.player = new Player(cosmeticsConfig);
        this.entities = [];
        this.particles = [];
        
        this.waveManager = new WaveManager();
        this.uiManager = new UIManager();
        this.collisionManager = new CollisionManager();
        this.background = new ParallaxBackground();

        // Optional reference to Hangar view for safe-mode behaviour
        this.hangarView = typeof document !== 'undefined'
            ? document.getElementById('hangar-view')
            : null;

        this.handleResize = this.handleResize.bind(this);
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleMouseDown = this.handleMouseDown.bind(this);
        this.handleMouseUp = this.handleMouseUp.bind(this);
        this.handleClick = this.handleClick.bind(this);

        this.handleHangarStateChange = (payload) => {
            if (!payload || payload.reason !== 'item:equip') {
                return;
            }
            if (this.player && typeof this.player.setCosmetics === 'function') {
                const nextConfig = hangarService?.getAsteroidsCosmeticsConfig ? hangarService.getAsteroidsCosmeticsConfig() : null;
                this.player.setCosmetics(nextConfig);
            }
        };

        this.lowQuality = false;
        this._boundPerfHandler = (p) => { this.lowQuality = !!(p && p.fps && p.fps < 45); };
    }

    setBounceBoundaries() {
        this.bounceBoundaries = [];
    }

    start() {
        if (!this.isActive || this.isRunning) return;
        try { 
            this.canvas.style.display = 'block';
            this.canvas.style.pointerEvents = 'none'; // Hardened input: canvas doesn't capture events
        } catch (e) {}
        this.isRunning = true;
        this.abortController = new AbortController();
        this.addEventListeners();
        this.handleResize();

        this.reset();
        if (this.player && typeof this.player.setCosmetics === 'function' && hangarService?.getAsteroidsCosmeticsConfig) {
            try {
                const cfg = hangarService.getAsteroidsCosmeticsConfig();
                this.player.setCosmetics(cfg);
            } catch (e) {}
        }
        // Ensure we don't accidentally register multiple times in the global LoopManager
        // (safeguard in case previous state left an orphan). Remove then add is idempotent.
        try { loopManager.remove(this); } catch (e) {}
        loopManager.add(this);
        // Mark canvas as ready for CSS fallback
        this.canvas.classList.add('is-ready');
    }

    stop() {
        if (!this.isRunning) return;
        this.isRunning = false;
        // Deregistra dal LoopManager globale
        loopManager.remove(this);
        this.removeEventListeners();
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
        this.clearAllTimeouts();
        this.ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
        this.resetMagneticState();
        this.isShooting = false;
    }

    reset() {
        this.clearAllTimeouts();
        this.isGameOver = false;
        this.isShipMode = false;
        this.score = 0;
        this.comboMultiplier = 1.0;
        this.comboTimer = 0;
        this.player.reset();
        // Release pooled entities before clearing the array
        this._releaseAllPooledEntities();
        this.entities = [];
        this.particles = [];
        this.waveManager.reset();
        this.uiManager.reset();
        this.resetMagneticState();
        this.pendingSpawns = []; this.rings = []; this.flash = 0; this.slowmo = 0; this.restPaused = false;
        // Non avviare la prima ondata qui, ma aspetta che il gioco si attivi
    }
    
    handleResize() {
        // HiDPI: back the canvas at devicePixelRatio (capped at 2) and scale the
        // context, so all drawing stays in CSS px (the game's native units) but
        // lines/text are crisp on retina displays instead of 1× blurry.
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        this.dpr = dpr;
        this.canvas.width = Math.round(window.innerWidth * dpr);
        this.canvas.height = Math.round(window.innerHeight * dpr);
        this.canvas.style.width = window.innerWidth + 'px';
        this.canvas.style.height = window.innerHeight + 'px';
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.background.resize(window.innerWidth, window.innerHeight);

        if (this.player) {
            const r = this.player.radius || 16;
            const maxX = Math.max(r, window.innerWidth - r);
            const maxY = Math.max(r, window.innerHeight - r);
            this.player.x = Math.min(Math.max(this.player.x, r), maxX);
            this.player.y = Math.min(Math.max(this.player.y, r), maxY);
        }
    }

    handleMouseMove(e) { this.mouse.x = e.clientX; this.mouse.y = e.clientY; }

    handleMouseDown(e) {
        if (typeof document !== 'undefined') {
            const el = document.elementFromPoint(e.clientX, e.clientY);
            if (el) {
                try {
                    const isInteractive = el.closest && el.closest('a, button, input, textarea, select, label, [role="button"], [role="link"], [tabindex], .clickable, .project-card');
                    const isEditable = el.isContentEditable || (el.getAttribute && el.getAttribute('contenteditable') === 'true');
                    // Do not hijack clicks intended for native interactive elements
                    if (isInteractive || isEditable) {
                        return;
                    }
                    // Also ignore clicks originating in Hangar UI — be explicit and broad about selectors
                    const hangarUi = el.closest('#hangar-view, #hangar-grid, .hangar-mainframe, .hangar-item, .hangar-item-button, .hangar-item-actions, .hangar-preview-panel, .hangar-tab-button, .hangar-cursor-preview');
                    if (hangarUi) {
                        return;
                    }
                    // If Shadow DOM is involved, examine composedPath as well
                    if (typeof e.composedPath === 'function') {
                        const path = e.composedPath();
                        if (Array.isArray(path)) {
                            for (const node of path) {
                                try {
                                    if (!node) continue;
                                    if (node.closest && node.closest('#hangar-view, #hangar-grid, .hangar-mainframe, .hangar-item, .hangar-item-button')) {
                                        return;
                                    }
                                } catch (err) { /* ignore */ }
                            }
                        }
                    }
                } catch (err) {
                    // Fallback: if any error occurs, do not prevent default behavior
                    return;
                }
            }
        }
        if (e.button === 0 && this.isShipMode && !this.isGameOver && !this.player.isRespawning) {
            this.isShooting = true;
            // Add click feedback
            this.clickFeedback = {
                x: this.player.x,
                y: this.player.y,
                radius: 5,
                alpha: 1.0,
                timestamp: this.gameTime
            };
        }
    }

    handleMouseUp(e) { if (e.button === 0) this.isShooting = false; }
    handleClick() { if (this.isGameOver) { this.reset(); this.player.isRespawning = true; this.player.respawnTimer = 120; } }

    addEventListeners() {
        EventBus.on('global:resize', this.handleResize);
        EventBus.on('global:mousemove', this.handleMouseMove);
        EventBus.on('global:mousedown', this.handleMouseDown);
        EventBus.on('global:mouseup', this.handleMouseUp);
        EventBus.on('global:click', this.handleClick);
        EventBus.on('hangar:state_changed', this.handleHangarStateChange);
        EventBus.on(EVENTS.PERFORMANCE_DEGRADED, this._boundPerfHandler);
    }
    removeEventListeners() {
        EventBus.off('global:resize', this.handleResize);
        EventBus.off('global:mousemove', this.handleMouseMove);
        EventBus.off('global:mousedown', this.handleMouseDown);
        EventBus.off('global:mouseup', this.handleMouseUp);
        EventBus.off('global:click', this.handleClick);
        EventBus.off('hangar:state_changed', this.handleHangarStateChange);
        EventBus.off(EVENTS.PERFORMANCE_DEGRADED, this._boundPerfHandler);
    }
    
    step(deltaTime) {
        if (!this.isRunning) return;

        // Fixed-step simulation. Everything in update() advances a fixed amount
        // per call (player lerp 0.05, morph 0.16, comboTimer--, respawnTimer--,
        // entity x += vx, ring life, slowmo...): it was tuned at 60 Hz and ran
        // 2–2.4× faster on 120/144 Hz displays (respawn grace 0.83 s instead of
        // 2 s, combo window 1.25 s instead of 3 s). So: accumulate the real dt,
        // run update() once per 1/60 s tick (≤4 per frame), draw once.
        const STEP = 1 / 60;
        let dt = Math.max(0, Math.min(0.05, deltaTime || 0));
        if (Math.abs(dt - STEP) < 0.002) dt = STEP;          // 60 Hz jitter → exactly 1 tick/frame, no 0/2-tick hitches
        // Manteniamo gameTime come "ms dall'avvio" per compatibilità con la logica esistente
        this.gameTime += dt * 1000;
        this._acc = (this._acc || 0) + dt;
        const n = Math.min(4, Math.floor(this._acc / STEP + 1e-9));
        // pointer velocity in px per TICK (what shoot/bank/trail expect), not per rAF frame
        if (n > 0) {
            this.mouseVelocity.x = (this.mouse.x - this.prevMouse.x) / n;
            this.mouseVelocity.y = (this.mouse.y - this.prevMouse.y) / n;
            this.prevMouse.x = this.mouse.x; this.prevMouse.y = this.mouse.y;
        }
        this.delta = STEP;                                    // update() reads it for the magnet lerps

        const isHangarActive = this.hangarView && this.hangarView.classList.contains('active');

        this.ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);   // CSS px: the context is DPR-scaled

        if (!isHangarActive) {
            this.background.draw(this.ctx);
        }

        this.ctx.save();
        this.applyShake();
        for (let i = 0; i < n; i++) { this.update(); this._acc -= STEP; }
        if (this._acc >= STEP) this._acc = 0;                 // hitch (tab switch): drop the backlog, don't burst
        this.draw(isHangarActive);
        this.ctx.restore();
    }

    update() {
        // Update click feedback (gameTime is in ms, so compare with 300ms)
        if (this.clickFeedback) {
            const elapsed = this.gameTime - this.clickFeedback.timestamp;
            if (elapsed > 300) { // 300ms duration
                this.clickFeedback = null;
            } else {
                const progress = elapsed / 300;
                this.clickFeedback.radius = 5 + progress * 20; // expand from 5 to 25
                this.clickFeedback.alpha = 1.0 - progress;
            }
        }

        if (this.comboTimer > 0) {
            this.comboTimer--;
            if (this.comboTimer <= 0) {
                this.comboTimer = 0;
                this.comboMultiplier = 1.0;
            }
        }

        // Quando la pagina HANGAR è attiva, il cursore rimane giocabile
        // ma senza nemici, HUD o ondate.
        const isHangarActive = this.hangarView && this.hangarView.classList.contains('active');
        if (!isHangarActive) {
            this.background.update(this.mouseVelocity, this.player);
        }

        if (isHangarActive) {
            this.clearAllTimeouts();
            if (this.entities.length || this.particles.length || this.score !== 0) {
                this.entities = [];
                this.particles = [];
                this.waveManager.reset();
                this.score = 0;
            }
        }

        let targetX = this.mouse.x;
        let targetY = this.mouse.y;
        let lerpAmount = this.isShipMode ? CONFIG.LERP_AMOUNT_ACTIVE : CONFIG.LERP_AMOUNT_IDLE;
        let targetMagnetProgress = 0;

        let suppressUI = isHangarActive;

        // State machine for magnetic effect
        if (this.magneticState === 'entering' && this.attachedTarget) {
            if (!this.isPaused) {
                this.isPaused = true;
            }
            const rect = this.attachedTarget.getBoundingClientRect();
            targetX = rect.left + rect.width / 2;
            targetY = rect.top + rect.height / 2;
            const clampedTransition = clamp01(this.magneticTransition);
            const easedTransition = easeInOutCubic(clampedTransition);
            const dx = targetX - this.player.x;
            const dy = targetY - this.player.y;
            const captureDistance = Math.max(22, this.player.radius * 1.8);
            const distance = Math.hypot(dx, dy);
            const approachTarget = clamp01(1 - (distance / Math.max(captureDistance * 2, 1)));
            const approachLerp = Math.min(1, this.delta * 8);
            this.magneticApproachProgress += (approachTarget - this.magneticApproachProgress) * approachLerp;
            const magneticEase = easeInOutCubic(clamp01(this.magneticApproachProgress));
            const magnetStrength = 1.2 + magneticEase * 3.0;
            lerpAmount = CONFIG.MAGNETIC_LERP_AMOUNT * magnetStrength;
            suppressUI = true;
            // When close enough, start the shrink transition
            if (distance < captureDistance) {
                // Advance transition based on frame delta so animation duration is consistent
                this.magneticTransition += (this.delta / Math.max(0.0001, CONFIG.MAGNET_TRANSITION_TIME));
                if (this.magneticTransition >= 1) {
                    this.magneticTransition = 1;
                    this.magneticState = 'active';
                    this.isPaused = true;
                    this.magneticApproachProgress = 1;
                    this.attachedTarget.classList.add('is-magnet-locked');
                    this.attachedTarget.classList.add('magnet-active');
                    this.canvas.style.pointerEvents = 'none'; // BUG FIX: Release the mouse
                    this.magneticRenderProgress = 1;
                }
            }
            targetMagnetProgress = clamp01(this.magneticTransition);
        } else if (this.magneticState === 'active') {
            // While active, game is paused. Update stops here.
            const rect = this.attachedTarget.getBoundingClientRect();
            this.player.x = rect.left + rect.width / 2;
            this.player.y = rect.top + rect.height / 2;
            this.magneticRenderProgress += (1 - this.magneticRenderProgress) * 0.35;
            this.magneticApproachProgress = 1;
            suppressUI = true;
            this.uiManager.update(this.isShipMode, this.player.isRespawning, suppressUI);
            return;
        } else if (this.magneticState === 'exiting') {
            // Start the grow transition (time-based)
            this.magneticTransition -= (this.delta / Math.max(0.0001, CONFIG.MAGNET_TRANSITION_TIME));
            if (this.magneticTransition <= 0) {
                this.magneticTransition = 0;
                this.magneticState = 'none';
                this.resumeFromMagnet();
            }
            targetMagnetProgress = clamp01(this.magneticTransition);
        } else {
            targetMagnetProgress = 0;
            if (this.magneticApproachProgress > 0) {
                const decayLerp = Math.min(1, this.delta * 6);
                this.magneticApproachProgress += (0 - this.magneticApproachProgress) * decayLerp;
            }
        }

        const renderLerp = Math.min(1, this.delta * 10);
        this.magneticRenderProgress += (targetMagnetProgress - this.magneticRenderProgress) * renderLerp;

        this.uiManager.update(this.isShipMode, this.player.isRespawning, suppressUI || this.isPaused);

        const freezeGameplay = this.isPaused && this.magneticState !== 'entering';
        if (freezeGameplay) {
            return;
        }

        this.player.update(targetX, targetY, lerpAmount);

        if (this.magneticState === 'entering') {
            return;
        }

        const distance = Math.hypot(this.mouse.x - this.player.x, this.mouse.y - this.player.y);
        const wasInShipMode = this.isShipMode;

        // Ship ↔ sphere morph: the gap between the dot (pointer) and the
        // lagging body drives it. Near → sphere (a ring around the dot, the
        // classic cursor) and the game PAUSES; far → ship and the game runs.
        // Smoothstep + hysteresis so it doesn't flicker at the threshold.
        const MIN = 12, MAX = 64;
        let target = distance <= MIN ? 0 : distance >= MAX ? 1 : (() => { const t = (distance - MIN) / (MAX - MIN); return t * t * (3 - 2 * t); })();
        if (this.isGameOver) target = 0;
        this.morph += (target - this.morph) * 0.16;
        if (!this.isGameOver) {
            if (!this.isShipMode && this.morph > 0.6) this.isShipMode = true;
            else if (this.isShipMode && this.morph < 0.25) this.isShipMode = false;
        } else {
            this.isShipMode = false;
        }
        // pause while resting as a sphere (only meaningful in combat mode)
        const wasPaused = this.restPaused;
        this.restPaused = this.isGameMode && !this.isShipMode && !this.isGameOver;
        if (wasPaused && !this.restPaused && this.pendingSpawns.length) {
            this.entities.push(...this.pendingSpawns); this.pendingSpawns = [];
        }
        
        // If game mode just activated AND we're in combat mode, start the first wave e mostra hint una tantum
        if (!isHangarActive && this.isShipMode && !wasInShipMode && this.isGameMode) {
            if (!this.hasShownShipHint && this.uiManager && typeof this.uiManager.addHudNotification === 'function') {
                this.hasShownShipHint = true;
                this.uiManager.addHudNotification("TIENI PREMUTO PER SPARARE · ESC PER USCIRE", '#B8323F', 240);
            }
            const enemyPresent = this.entities.some(e => e instanceof Asteroid || e instanceof AlienShip);
            if (!enemyPresent && !this.waveManager.isTransitioning) {
                this.startNextWave();
            }
        }

        // In arcade (combat) mode the world stays visible while the pointer
        // rests — asteroids don't vanish every time you stop; as a pure
        // decorative cursor it still fades to nothing.
        const targetAlpha = (this.magneticState === 'none') ? ((this.isShipMode || this.isGameMode) ? 1 : 0) : 0;
        this.globalAlpha += (targetAlpha - this.globalAlpha) * CONFIG.FADE_SPEED;

        if (this.globalAlpha < 0.01 && this.magneticTransition <= 0) {
            this.particles = [];
            return;
        }
        
        // ── paused as a sphere: nothing moves, nothing shoots, nothing hurts.
        // Only cosmetic particles/rings keep fading so the freeze reads as a freeze.
        if (this.restPaused) {
            this.particles.forEach(p => p.update());
            this.particles = this.particles.filter(p => p.life > 0);
            this.rings.forEach(r => { r.r += (r.max - r.r) * 0.18; r.life -= 0.04; });
            this.rings = this.rings.filter(r => r.life > 0);
            this.player.trailParticles = [];
            return;
        }
        // slow motion after a hit: the world advances every 3rd frame
        this.frameNo++;
        if (this.slowmo > 0) { this.slowmo--; if (this.frameNo % 3 !== 0) { this.player.updatePowerUps(this.gameTime); this._tickCosmetics(); return; } }
        this._tickCosmetics();
        this.player.updatePowerUps(this.gameTime);

        if (!isHangarActive) {
            if (this.player.powerUpState.laser.active && this.isShooting) {
                this.applyLaserDamage();
            } else {
                const newPlayerBullets = this.player.shoot(this.gameTime, this.isShooting, this.mouseVelocity);
                if (newPlayerBullets && newPlayerBullets.length > 0) {
                    this.entities.push(...newPlayerBullets);
                    // Play shoot sound
                    if (window.audioManager) {
                        window.audioManager.onAudioPlay({ name: 'shoot' });
                    }
                }
            }
        }

        const newEntities = [];
        for (const entity of this.entities) {
            const result = entity.update(this.player, this.bounceBoundaries);
            if (result) newEntities.push(...(Array.isArray(result) ? result : [result]));

            if (entity.constructor.name === 'Bullet' && entity.hitBoundary) {
                this.createImpactSpark(entity.x, entity.y);
            }
        }
        if (newEntities.length > 0) this.entities.push(...newEntities);

        this.particles.forEach(p => p.update());

        if (!isHangarActive) {
            const collisionEvents = this.collisionManager.checkCollisions(this.player, this.entities);
            if (collisionEvents.length > 0) this.handleCollisionEvents(collisionEvents);

            // Rilascia le entità nei rispettivi pool e compatta l'array in-place per evitare allocazioni per frame
            const entities = this.entities;
            let writeIndex = 0;
            for (let i = 0; i < entities.length; i++) {
                const entity = entities[i];
                if (entity.shouldBeRemoved) {
                    if (entity instanceof Bullet && bulletPool && typeof bulletPool.release === 'function') {
                        bulletPool.release(entity);
                    } else if (entity instanceof Asteroid && asteroidPool && typeof asteroidPool.release === 'function') {
                        asteroidPool.release(entity);
                    } else if (entity instanceof AlienShip && alienShipPool && typeof alienShipPool.release === 'function') {
                        alienShipPool.release(entity);
                    }
                } else {
                    if (writeIndex !== i) {
                        entities[writeIndex] = entity;
                    }
                    writeIndex++;
                }
            }
            entities.length = writeIndex;

            const particles = this.particles;
            let pWrite = 0;
            for (let i = 0; i < particles.length; i++) {
                const p = particles[i];
                if (p.life > 0) {
                    if (pWrite !== i) {
                        particles[pWrite] = p;
                    }
                    pWrite++;
                }
            }
            particles.length = pWrite;

            const enemyCount = this.entities.some(e => e instanceof Asteroid || e instanceof AlienShip);
            if (this.isShipMode && !enemyCount && !this.waveManager.isTransitioning && this.isGameMode) {
                this.startNextWave();
            }
        } else {
            // In hangar: mantieni le liste vuote
            this.entities = [];
            this.particles = [];
        }
    }

    draw() {
        const easedMagnet = easeInOutCubic(clamp01(this.magneticRenderProgress));
        const cursorNormalAlpha = (this.magneticState === 'none') ? (1 - this.globalAlpha) : (1 - this.globalAlpha) * (1 - easedMagnet);
        if (cursorNormalAlpha > 0.01 && this.magneticState === 'none') {
            this.ctx.save();
            this.ctx.globalAlpha = cursorNormalAlpha;
            this.ctx.beginPath();
            const circleRadius = this.player.radius * (1 - this.globalAlpha);
            this.ctx.arc(this.player.x, this.player.y, Math.max(0.1, circleRadius), 0, Math.PI * 2);
            this.ctx.strokeStyle = `rgba(22, 19, 16, ${0.85 * cursorNormalAlpha})`;
            this.ctx.stroke();
            this.ctx.restore();
        }

        const gameAlpha = this.globalAlpha * (1 - easedMagnet);

        this.ctx.save();
        this.ctx.translate(-window.scrollX, -window.scrollY);
        this.ctx.globalAlpha = gameAlpha;

        if (gameAlpha > 0.01) {
            // paper halos first: everything that matters floats on a soft
            // clearing, so the page underneath reads as transparent around it
            for (const e of this.entities) { if (e.radius) this._halo(this.ctx, e.x, e.y, e.radius * 2.1 + 6, e.constructor.name === 'Bullet' ? 0.35 : 0.85); }
            for (const r of this.rings) {
                this.ctx.save(); this.ctx.globalAlpha = gameAlpha * Math.max(0, r.life); this.ctx.strokeStyle = r.color; this.ctx.lineWidth = 1.5 + r.life * 2;
                this.ctx.beginPath(); this.ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2); this.ctx.stroke(); this.ctx.restore();
            }
            this.entities.forEach(entity => entity.draw(this.ctx, this.gameTime));
            this.particles.forEach(p => p.draw(this.ctx));

            if (this.player.powerUpState.laser.active && this.isShooting) {
                this.drawLaser();
            }
        }
        this.ctx.restore();

        const playerScale = (1 - easedMagnet) * this.globalAlpha;
        if (playerScale > 0.01) {
            // halo under the ship/sphere (screen space)
            this._halo(this.ctx, this.player.x, this.player.y, this.player.radius * 2.4 + 8, 0.9);
            this.player.draw(this.ctx, this.gameTime, this.mouseVelocity, this.isShipMode, playerScale, this.morph, this.bank);
        }
        // hit flash: a quick oxblood wash over the whole screen
        if (this.flash > 0.01) {
            this.ctx.save(); this.ctx.globalAlpha = this.flash * 0.35; this.ctx.fillStyle = '#B8323F';
            this.ctx.fillRect(0, 0, window.innerWidth, window.innerHeight); this.ctx.restore();
        }
        // paused-as-sphere badge
        if (this.restPaused && this.isGameMode) {
            this.ctx.save(); this.ctx.globalAlpha = 0.8 * (1 - this.morph); this.ctx.font = "11px 'Geist Mono', monospace"; this.ctx.textAlign = 'left';
            this.ctx.lineJoin = 'round'; this.ctx.lineWidth = 4; this.ctx.strokeStyle = 'rgba(237,230,214,0.9)'; this.ctx.fillStyle = '#161310';
            const tx = this.player.x + 18, ty = this.player.y + 4;
            this.ctx.strokeText('PAUSA · muovi per riprendere', tx, ty); this.ctx.fillText('PAUSA · muovi per riprendere', tx, ty);
            this.ctx.restore();
        }
        
        this.uiManager.draw(this.ctx, { lives: this.player.lives, score: this.score, wave: this.waveManager.currentWave + 1, isGameOver: this.isGameOver, comboMultiplier: this.comboMultiplier, playerX: this.player.x, playerY: this.player.y, mouseX: this.mouse.x, mouseY: this.mouse.y });

        // Draw click feedback
        if (this.clickFeedback) {
            this.ctx.save();
            this.ctx.globalAlpha = this.clickFeedback.alpha;
            this.ctx.strokeStyle = 'rgba(184, 50, 63, 0.8)';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.arc(this.clickFeedback.x, this.clickFeedback.y, this.clickFeedback.radius, 0, Math.PI * 2);
            this.ctx.stroke();
            this.ctx.restore();
        }

        this.ctx.fillStyle = '#161310';
        this.ctx.beginPath();
        this.ctx.arc(this.mouse.x, this.mouse.y, CONFIG.DOT_RADIUS, 0, Math.PI * 2);
        this.ctx.fill();
    }

    _tickCosmetics() {
        this.rings.forEach(r => { r.r += (r.max - r.r) * 0.18; r.life -= 0.04; });
        this.rings = this.rings.filter(r => r.life > 0);
        if (this.flash > 0) this.flash = Math.max(0, this.flash - 0.06);
        // banking: how fast the heading changes
        const dAng = ((this.player.angle - (this._prevAngle ?? this.player.angle)) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
        this._prevAngle = this.player.angle;
        this.bank += ((Math.max(-1, Math.min(1, dAng * 6))) - this.bank) * 0.2;
    }

    /** Expanding shockwave ring (destruction / pickup). */
    addRing(x, y, max, color = 'rgba(22,19,16,0.55)') { this.rings.push({ x, y, r: 2, max, life: 1, color }); }

    /** Soft paper halo under an object: "clears" the page content around it so
     *  the game stays readable over text and images. Page-space coords. */
    _halo(ctx, x, y, r, a = 0.82) {
        const g = ctx.createRadialGradient(x, y, r * 0.25, x, y, r);
        g.addColorStop(0, `rgba(237, 230, 214, ${a})`);
        g.addColorStop(0.7, `rgba(237, 230, 214, ${a * 0.55})`);
        g.addColorStop(1, 'rgba(237, 230, 214, 0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }

    createImpactSpark(x, y) {
        for (let i = 0; i < 5; i++) { // Meno particelle per un effetto più piccolo
            this.particles.push(new Particle(x, y, 'rgba(22,19,16,0.7)', 20, { size: Math.random() * 1.5 }));
        }
    }

    createExplosion(x, y, color = '#161310', count = CONFIG.PARTICLE_COUNT_EXPLOSION) {
        const effectiveCount = this.lowQuality ? Math.max(1, Math.floor(count / 2)) : count;
        for (let i = 0; i < effectiveCount; i++) {
            this.particles.push(new Particle(x, y, color));
        }
    }

    handleCollisionEvents(events) {
        let playerHitThisFrame = false;
        for (const event of events) {
            switch (event.type) {
                case 'bullet_hit_enemy': {
                    // the collision manager emits one event per BULLET: a triple-shot
                    // regularly lands 2–3 bullets on the same asteroid in one frame.
                    // Only the bullet that makes the kill scores it (was: double/triple
                    // score + duplicate debris for the same rock)
                    const wasAlive = !event.enemy.shouldBeRemoved;
                    event.bullet.shouldBeRemoved = true;
                    if (!wasAlive) break;
                    this.createExplosion(event.bullet.x, event.bullet.y, 'rgba(22,19,16,0.5)', 5);
                    const debris = event.enemy.takeDamage(1);
                    if (debris) this.entities.push(...debris);

                    if (event.enemy.shouldBeRemoved) {
                        // Play coin sound when enemy is destroyed
                        if (window.audioManager) {
                            window.audioManager.onAudioPlay({ name: 'coin' });
                        }

                        const baseScore = (event.enemy instanceof AlienShip)
                            ? 300
                            : (event.enemy.type === 'large'
                                ? 150
                                : (event.enemy.type === 'debris' ? 25 : 100));

                        // Combo System: incrementa moltiplicatore e timer su ogni kill
                        this.comboMultiplier = Math.min(this.comboMultiplier + 0.5, 5.0);
                        this.comboTimer = 180;
                        const effectiveMultiplier = Math.max(1, Math.floor(this.comboMultiplier));
                        const gainedScore = baseScore * effectiveMultiplier;
                        this.score += gainedScore;

                        // score popup: convert page coords to screen coords
                        let popupText = `+${gainedScore}`;
                        if (effectiveMultiplier > 1) {
                            popupText += ` x${effectiveMultiplier}`;
                        }
                        this.uiManager.addScorePopup(
                                event.enemy.x - window.scrollX,
                                event.enemy.y - window.scrollY,
                                popupText
                        );
                        this.createExplosion(event.enemy.x, event.enemy.y, event.enemy.color);
                        this.addRing(event.enemy.x, event.enemy.y, (event.enemy.radius || 20) * 2.6, 'rgba(184,50,63,0.6)');
                        this.triggerShake(6 + (event.enemy.radius || 20) * 0.12, 8);

                        // Spawn at most one pickup per enemy: prefer power-up, otherwise possibly spawn a coin.
                        let didSpawnPickup = false;
                        if (Math.random() < CONFIG.POWERUP_SPAWN_CHANCE) {
                            this.entities.push(new PowerUp(event.enemy.x, event.enemy.y));
                            didSpawnPickup = true;
                        }

                        // Only spawn a coin if we didn't already spawn a power-up from this enemy
                        if (!didSpawnPickup && Math.random() < CONFIG.COIN_SPAWN_CHANCE) {
                            const coinValue = CONFIG.COIN_VALUE || 1;
                            this.entities.push(new Coin({ x: event.enemy.x, y: event.enemy.y, value: coinValue }));
                        }
                    }
                    break;
                }
                case 'player_hit_enemy': {
                    if (this.isGameOver || playerHitThisFrame) break;

                    // Combo System: subire danni azzera la combo
                    this.comboMultiplier = 1.0;
                    this.comboTimer = 0;

                    if (event.enemy.owner !== 'player') event.enemy.shouldBeRemoved = true;
                    this.triggerShake(30, 30);
                    this.createExplosion(this.player.x + window.scrollX, this.player.y + window.scrollY);
                    this.addRing(this.player.x + window.scrollX, this.player.y + window.scrollY, 90, 'rgba(184,50,63,0.7)');
                    this.flash = 0.55; this.slowmo = 40;

                    const playerState = this.player.takeDamage();

                    if (playerState.shieldBroken) {
                        this.uiManager.addHudNotification("SHIELD LOST!", '#B8323F');
                        this.createExplosion(this.player.x, this.player.y, '#B8323F', 40);
                    }

                    if (playerState.playerHit && this.player.lives <= 0) {
                        this.isGameOver = true;
                        this.uiManager.showFinalScore(this.score);
                    }
                    playerHitThisFrame = true;
                    this.isShipMode = false;
                    break;
                }
                case 'player_collect_powerup': {
                    event.powerUp.shouldBeRemoved = true;
                    this.player.activatePowerUp(event.powerUp.type, this.gameTime);
                    const powerUpInfo = { fireRate: 'FIRE RATE', tripleShot: 'TRIPLE SHOT', shield: 'SHIELD', bounce: 'BOUNCE SHOTS', laser: 'LASER' };
                    this.uiManager.addHudNotification(powerUpInfo[event.powerUp.type], event.powerUp.color);
                    break;
                }
                case 'player_collect_coin': {
                    if (event.coin) {
                        event.coin.shouldBeRemoved = true;
                        const value = event.coin.value || 1;
                        this.uiManager.addCredits(value);
                        // popup in screen-space
                        this.uiManager.addScorePopup(
                                event.coin.x - window.scrollX,
                                event.coin.y - window.scrollY,
                                `+${value}C`
                        );
                        const audio = document.getElementById('coin-audio');
                        if (audio && typeof audio.play === 'function') {
                            try {
                                audio.currentTime = 0;
                                // Se possibile, verifica rapidamente se il browser dichiara supporto (opzionale)
                                const canPlay = typeof audio.canPlayType === 'function'
                                    ? audio.canPlayType('audio/mpeg') || audio.canPlayType('audio/ogg')
                                    : true;
                                if (canPlay === '' || canPlay === 'no') {
                                    console.warn('[AsteroidsGame] Audio coin-audio potrebbe non essere supportato dal browser:', audio);
                                }
                                const p = audio.play();
                                if (p && typeof p.catch === 'function') p.catch(() => {});
                            } catch (e) {
                                // Ignora errori sincroni
                            }
                        }
                    }
                    break;
                }
            }
        }
    }

    startNextWave() {
        const waveResult = this.waveManager.startNextWave(this.bounceBoundaries);
        if (waveResult.event === 'game_win') {
            this.uiManager.addNotification("YOU WIN!", "#B8862E", 300);
            this.isGameOver = true;
            this.uiManager.showFinalScore(this.score);
            return;
        }
        this.uiManager.triggerWaveFlash();
        this.uiManager.addNotification(`WAVE ${this.waveManager.currentWave + 1}`, '#161310', 110);
        if (waveResult.entities) {
            waveResult.entities.forEach(spawnEvent => {
                let timeoutId;
                const callback = () => {
                    // while the ship is a sphere (paused) the wave waits for you
                    // instead of being silently dropped (which skipped whole waves)
                    if (this.isShipMode && !this.restPaused) this.entities.push(spawnEvent.entity);
                    else this.pendingSpawns.push(spawnEvent.entity);
                    this.spawnTimeouts.delete(timeoutId);
                };
                timeoutId = setTimeout(callback, spawnEvent.delay);
                this.spawnTimeouts.add(timeoutId);
            });
        }
    }

    updateMouseVelocity() {
        this.mouseVelocity.x = this.mouse.x - this.prevMouse.x;
        this.mouseVelocity.y = this.mouse.y - this.prevMouse.y;
        this.prevMouse.x = this.mouse.x;
        this.prevMouse.y = this.mouse.y;
    }

    clearAllTimeouts() {
        this.spawnTimeouts.forEach(clearTimeout);
        this.spawnTimeouts.clear();
    }

    resetMagneticState() {
        this.magneticState = 'none';
        this.magneticTransition = 0;
        this.isPaused = false;
        if (this.canvas) this.canvas.style.pointerEvents = 'none';
        if (this.attachedTarget) {
            try { this.attachedTarget.classList.remove('is-magnet-locked'); } catch (e) {}
            try { this.attachedTarget.classList.remove('magnet-active'); } catch (e) {}
            this.attachedTarget = null;
        }
    }

    resumeFromMagnet() {
        this.isPaused = false;
        if (this.canvas) this.canvas.style.pointerEvents = 'none';
        if (this.attachedTarget) {
            try { this.attachedTarget.classList.remove('is-magnet-locked'); } catch (e) {}
            try { this.attachedTarget.classList.remove('magnet-active'); } catch (e) {}
        }
        this.attachedTarget = null;
    }

    triggerShake(intensity, duration) {
        this.shake.intensity = Math.max(this.shake.intensity, intensity);
        this.shake.duration = Math.max(this.shake.duration, duration);
    }

    applyShake() {
        if (this.shake.duration > 0) {
            this.shake.duration--;
            const sx = (Math.random() - 0.5) * this.shake.intensity * (this.shake.duration / 10);
            const sy = (Math.random() - 0.5) * this.shake.intensity * (this.shake.duration / 10);
            this.ctx.translate(sx, sy);
        } else {
            this.shake.intensity = 0;
        }
    }

    applyLaserDamage() {
        const angle = this.player.angle;
        // Player is in screen coordinates; convert to page coordinates so laser
        // interacts correctly with enemies stored in page-space.
        const baseX = this.player.x + window.scrollX;
        const baseY = this.player.y + window.scrollY;
        const startX = baseX + Math.cos(angle) * this.player.radius;
        const startY = baseY + Math.sin(angle) * this.player.radius;
        const endX = baseX + Math.cos(angle) * 2000;
        const endY = baseY + Math.sin(angle) * 2000;
        const enemies = this.entities.filter(e => e instanceof Asteroid || e instanceof AlienShip);
        for (const enemy of enemies) {
            const dist = Math.abs((endY - startY) * enemy.x - (endX - startX) * enemy.y + endX * startY - endY * startX) / Math.hypot(endY - startY, endX - startX);
            if (dist < enemy.radius) {
                const damageDealt = enemy.takeDamage(0.25);
                if (damageDealt) this.entities.push(...damageDealt);
                if (Math.random() < 0.2) {
                    this.createExplosion(enemy.x, enemy.y, 'rgba(184,50,63,0.5)', 2);
                }
            }
        }
    }

    drawLaser() {
        const angle = this.player.angle;
        // Disegna il laser usando coordinate pagina, coerenti con le altre entità
        // (il contesto è già stato traslato di -scrollX/-scrollY nel draw()).
        const baseX = this.player.x + window.scrollX;
        const baseY = this.player.y + window.scrollY;
        const startX = baseX + Math.cos(angle) * this.player.radius;
        const startY = baseY + Math.sin(angle) * this.player.radius;
        const endX = baseX + Math.cos(angle) * 2000;
        const endY = baseY + Math.sin(angle) * 2000;
        this.ctx.beginPath();
        this.ctx.moveTo(startX, startY);
        this.ctx.lineTo(endX, endY);
        this.ctx.strokeStyle = `rgba(184, 50, 63, ${0.5 + Math.random() * 0.5})`;
        this.ctx.lineWidth = 1 + Math.random() * 4;
        this.ctx.stroke();
    }

    /** Release all pooled entities back to their respective pools. */
    _releaseAllPooledEntities() {
        for (const entity of this.entities) {
            if (entity instanceof Bullet && bulletPool && typeof bulletPool.release === 'function') {
                bulletPool.release(entity);
            } else if (entity instanceof Asteroid && asteroidPool && typeof asteroidPool.release === 'function') {
                asteroidPool.release(entity);
            } else if (entity instanceof AlienShip && alienShipPool && typeof alienShipPool.release === 'function') {
                alienShipPool.release(entity);
            }
        }
    }

    // ARCADE CONTROLLER METHODS
    // Start full combat mode (enemies spawn, collisions active)
    startCombatMode() {
        console.log('[AsteroidsGame] Starting combat mode');
        this.isGameMode = true;
        // Clear any existing safe mode restrictions
        this.clearAllTimeouts();
        // Reset game state for fresh start
        this.reset();
        // grace period: blink-invulnerable for 2 s so the first wave can't
        // kill you before you've understood what's happening
        this.player.isRespawning = true; this.player.respawnTimer = 120;
        // Make global reference for arcade controller
        window.AsteroidsGameInstance = this;
    }

    // Stop combat mode (return to cursor-only mode)
    stopCombatMode() {
        console.log('[AsteroidsGame] Stopping combat mode');
        this.isGameMode = false;
        // Release pooled combat entities back to their pools before filtering
        for (const entity of this.entities) {
            if (entity instanceof Bullet && bulletPool && typeof bulletPool.release === 'function') {
                bulletPool.release(entity);
            } else if (entity instanceof Asteroid && asteroidPool && typeof asteroidPool.release === 'function') {
                asteroidPool.release(entity);
            } else if (entity instanceof AlienShip && alienShipPool && typeof alienShipPool.release === 'function') {
                alienShipPool.release(entity);
            }
        }
        // Keep only non-combat entities (coins, powerups)
        this.entities = this.entities.filter(e => !(e instanceof Asteroid) && !(e instanceof AlienShip) && !(e instanceof Bullet));
        this.particles = []; this.pendingSpawns = []; this.rings = [];
        // Clear any pending spawns
        this.clearAllTimeouts();
        // Reset score and wave
        this.score = 0;
        this.waveManager.reset();
        // Make global reference for arcade controller
        window.AsteroidsGameInstance = this;
    }
}