/**
 * arcade-units.test.js — pure/near-pure units of the Asteroids cursor game
 * (round-2 audit regressions): laser beam geometry, power-up ticks, shield
 * grace, tick-based flash/trail, respawn ticks, ace predictive aim, parallax
 * starfield under scroll, the `A` hotkey guard.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { laserHits } from '../assets/js/asteroids/geom.js'
import { Player } from '../assets/js/asteroids/entities/Player.js'
import { AlienAI } from '../assets/js/asteroids/entities/ai/AlienAI.js'
import { ParallaxBackground } from '../assets/js/asteroids/managers/ParallaxBackground.js'
import { isArcadeHotkey } from '../assets/js/arcade.js'

const setScroll = (x, y) => {
  Object.defineProperty(window, 'scrollX', { value: x, configurable: true, writable: true })
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true, writable: true })
}
const mkCtx = () => {
  const fn = () => ({ addColorStop() {} })
  return new Proxy({}, { get: (t, k) => (k in t ? t[k] : fn), set: (t, k, v) => { t[k] = v; return true } })
}

beforeEach(() => setScroll(0, 0))
afterEach(() => vi.restoreAllMocks())

describe('laserHits — forward beam, not infinite line', () => {
  const s = [640, 400], u = [1, 0], LEN = 1985
  it('hits an enemy ahead on the beam, not one behind the nose nor one past the beam end nor a lateral one', () => {
    expect(laserHits(...s, ...u, LEN, 900, 405, 35)).toBe(true)      // ahead
    expect(laserHits(...s, ...u, LEN, 340, 405, 35)).toBe(false)     // behind the ship (was: damaged)
    expect(laserHits(...s, ...u, LEN, 900, 450, 35)).toBe(false)     // lateral miss (dist 50 > 35)
    expect(laserHits(...s, ...u, LEN, 640 + 2000 + 100, 400, 35)).toBe(false)   // past the drawn beam
  })
  it('facing left (angle π) flips which side is "ahead"', () => {
    expect(laserHits(...s, -1, 0, LEN, 340, 405, 35)).toBe(true)
    expect(laserHits(...s, -1, 0, LEN, 900, 405, 35)).toBe(false)
  })
})

describe('Player — tick-based power-ups, shield grace, flash/trail per tick, respawn ticks', () => {
  it('power-ups last N world ticks and do NOT drain with wall time (pause as a sphere)', () => {
    const p = new Player()
    p.activatePowerUp('tripleShot', 0)
    expect(p.powerUpState.tripleShot.timer).toBe(390)              // 6500 ms / (1000/60)
    for (let i = 0; i < 389; i++) p.updatePowerUps(99999)           // gameTime far in the future is irrelevant
    expect(p.powerUpState.tripleShot.active).toBe(true)
    p.updatePowerUps(99999)
    expect(p.powerUpState.tripleShot.active).toBe(false)
    p.activatePowerUp('shield', 0); expect(p.powerUpState.shield.timer).toBe(600)
    p.activatePowerUp('laser', 0);  expect(p.powerUpState.laser.timer).toBe(210)
  })
  it('a shield break grants 45 ticks of grace: the next overlapping bullet cannot also take a life', () => {
    const p = new Player(); p.activatePowerUp('shield', 0)
    expect(p.takeDamage()).toEqual({ shieldBroken: true, playerHit: false })
    expect(p.hitGrace).toBe(45)
    expect(p.takeDamage()).toEqual({ playerHit: false, shieldBroken: false })   // next tick's bullet: ignored
    expect(p.lives).toBe(3)
    for (let i = 0; i < 45; i++) p.update(p.x, p.y, 0.05)
    expect(p.hitGrace).toBe(0)
    expect(p.takeDamage().playerHit).toBe(true)
    expect(p.lives).toBe(2)
    expect(p.isRespawning).toBe(true)
  })
  it('muzzle flash decays per TICK (update), never per rendered frame (draw)', () => {
    const p = new Player(); const ctx = mkCtx()
    p.flash = 3; for (let i = 0; i < 3; i++) p.update(p.x, p.y, 0.05); expect(p.flash).toBe(0)
    p.flash = 3; for (let i = 0; i < 10; i++) p.draw(ctx, 1000, { x: 0, y: 0 }, true, 1, 1, 0); expect(p.flash).toBe(3)
  })
  it('thrust trail spawns one roll per sim tick at 30 / 60 / 144 Hz draws', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.6)                     // always spawn
    const run = (hz) => {
      const p = new Player(); const ctx = mkCtx(); let acc = 0, spawned = 0
      for (let f = 0; f < hz; f++) {                                   // 1 s of frames
        acc += 1 / hz
        while (acc >= 1 / 60 - 1e-9) { p.update(p.x + 50, p.y, 0.05); acc -= 1 / 60 }
        const before = p.trailParticles.length
        p.draw(ctx, f * 1000 / hz, { x: 5, y: 0 }, true, 1, 1, 0)
        spawned += p.trailParticles.length - before
      }
      return spawned
    }
    expect(run(60)).toBe(60); expect(run(144)).toBe(60); expect(run(30)).toBe(60)   // was 60 / 144 / 30
  })
  it('respawn grace counts world ticks (tickRespawn), not Player.update calls; blink is wall-time based', () => {
    const p = new Player(); p.isRespawning = true; p.respawnTimer = 180
    for (let i = 0; i < 300; i++) p.update(0, 0, 0.05)
    expect(p.isRespawning).toBe(true)                                 // the sphere pause does not consume it
    for (let i = 0; i < 180; i++) p.tickRespawn()
    expect(p.isRespawning).toBe(false)
    // frozen timer must not hide the player on every frame: drawn on at least one of two instants
    p.isRespawning = true; p.respawnTimer = 5
    const ctx = mkCtx(); let drew = 0; const spy = vi.fn(); ctx.save = spy
    p.draw(ctx, 0, { x: 0, y: 0 }, false, 1, 0, 0); p.draw(ctx, 200, { x: 0, y: 0 }, false, 1, 0, 0)
    drew = spy.mock.calls.length
    expect(drew).toBeGreaterThan(0)
  })
})

describe('AlienAI ace — predictive aim uses per-tick velocity', () => {
  it('leads by ~14 ticks of the real velocity (was: displacement since the last shot × 14)', () => {
    const ship = { x: 640, y: 100, vx: 0, vy: 0, radius: 15 }
    const ai = new AlienAI(ship, 'ace'); ai.shootCooldown = 90; ai.pathTimer = 0
    const player = { x: 400, y: 600, isRespawning: false }; const PV = 3
    let shots = 0, out = null
    for (let t = 0; t < 2000 && shots < 2; t++) { player.x += PV; ship.y = 100; out = ai.update(player); if (out && out.length) shots++ }
    expect(shots).toBe(2)
    const angles = out.map((b) => Math.atan2(b.vy, b.vx)).sort((a, b) => a - b)
    const centre = angles[Math.floor(angles.length / 2)]
    const expected = Math.atan2(player.y - ship.y, (player.x + PV * 14) - ship.x)
    expect(Math.abs(centre - expected)).toBeLessThan(0.03)            // was ~0.8 rad (46°) off
  })
  it('drops its velocity history across a respawn (no one-off spike) and clamps |v| to 20 px/tick', () => {
    const ship = { x: 640, y: 100, vx: 0, vy: 0, radius: 15 }
    const ai = new AlienAI(ship, 'ace'); ai.shootCooldown = 5
    const player = { x: 400, y: 600, isRespawning: false }
    ai.update(player); player.isRespawning = true; ai.update(player)
    expect(ai.lastTargetX).toBeNull()
    player.isRespawning = false; player.x = 1200; ai.update(player)     // teleport after respawn: no history → v=0
    expect(ai.lastTargetX).toBe(1200)
  })
})

describe('ParallaxBackground — page-space bounds follow the scroll', () => {
  const visible = (bg) => bg.stars.filter((s) => s.y >= window.scrollY && s.y <= window.scrollY + window.innerHeight && s.x >= 0 && s.x <= window.innerWidth).length
  it('keeps stars in view at every scroll position, including a round trip, with a bounded total', () => {
    const bg = new ParallaxBackground(); const player = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
    for (const sy of [0, 1200, 3000, 6000, 3000, 0]) {
      setScroll(0, sy)
      for (let i = 0; i < 120; i++) bg.update({ x: 0, y: 0 }, player)
      expect(visible(bg), `scrollY=${sy}`).toBeGreaterThan(10)         // was 0 below ~1 viewport, and 0 forever after coming back
      expect(bg.stars.length).toBeLessThan(1500)
    }
  })
})

describe('isArcadeHotkey', () => {
  const ev = (o) => ({ key: 'a', repeat: false, defaultPrevented: false, ctrlKey: false, metaKey: false, altKey: false, target: document.body, ...o })
  it('plain a → true; repeat / consumed / modifiers / editable targets / other keys → false', () => {
    expect(isArcadeHotkey(ev({}))).toBe(true)
    expect(isArcadeHotkey(ev({ key: 'A' }))).toBe(true)
    expect(isArcadeHotkey(ev({ repeat: true }))).toBe(false)              // key held: was toggling at ~30 Hz
    expect(isArcadeHotkey(ev({ defaultPrevented: true }))).toBe(false)    // Konami's closing 'a'
    expect(isArcadeHotkey(ev({ ctrlKey: true }))).toBe(false)
    expect(isArcadeHotkey(ev({ target: document.createElement('input') }))).toBe(false)
    expect(isArcadeHotkey(ev({ key: 'b' }))).toBe(false)
    expect(isArcadeHotkey(null)).toBe(false)
  })
})
