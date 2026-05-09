// assets/js/modules/cursors/asteroids/config.js

export const CONFIG = {
    // --- Movimento Giocatore ---
    LERP_AMOUNT_ACTIVE: 0.05,
    LERP_AMOUNT_IDLE: 0.01,           // MODIFICATO: Ancora più basso per un ritorno più lento
    MAGNETIC_LERP_AMOUNT: 0.2,
    
    // --- Stato Giocatore ---
    SHIP_RADIUS: 15,
    MAX_LIVES: 2,
    RESPAWN_DURATION_FRAMES: 180,
    SHIP_DEAD_ZONE_RADIUS: 1,
    DISTANCE_ENTER_SHIP_THRESHOLD: 40,
    
    // --- Transizioni e UI ---
    FADE_SPEED: 0.1,                  // NUOVO: Controlla la velocità di fade-in/out
    
    // --- Armi Giocatore ---
    SHOOT_COOLDOWN_MS: 280,
    BULLET_RADIUS: 2,
    BULLET_SPEED: 10,
    
    // --- Nemici ---
    ASTEROID_BASE_HEALTH: 3,
    ASTEROID_BASE_RADIUS: 35,
    DEBRIS_SPEED_MULTIPLIER: 2.0,
    ALIEN_SHIP_RADIUS: 20,
    ALIEN_SHIP_HEALTH: 4,
    ENEMY_BULLET_RADIUS: 3,
    ENEMY_BULLET_SPEED: 5,
    
    // --- Power-Ups ---
    POWERUP_DURATION_MS: 6500,
    SHIELD_DURATION_MS: 10000,
    LASER_DURATION_MS: 3500,
    POWERUP_SPAWN_CHANCE: 0.18,
    POWERUP_RADIUS: 10,
    POWERUP_LIFESPAN_FRAMES: 400,
    
    // --- Effetti Visivi ---
    DOT_RADIUS: 3,
    PARTICLE_COUNT_EXPLOSION: 25,
    PARTICLE_LIFESPAN: 80,
    // Durata (in secondi) della transizione magnetica (entrata/uscita)
    MAGNET_TRANSITION_TIME: 0.25,
    // --- Coins ---
    // Make coins rarer by default
    COIN_SPAWN_CHANCE: 0.1,
    COIN_LIFESPAN_FRAMES: 600,
    COIN_VALUE: 1,
};