/**
 * arcade.js — the Asteroids cursor game, restored and wired for real.
 *
 * The game (assets/js/asteroids/*) came from the Setpoint V14 site: the
 * cursor becomes a ship when you move fast, waves of asteroids and alien
 * ships roll in, you hold click to fire, pick up power-ups, chain combos.
 * It was imported "disabled" (no events ever reached its EventBus) and later
 * deleted as dead code. This module is the missing glue:
 *
 *   - a fixed full-viewport <canvas id="asteroid-cursor"> (pointer-events:none)
 *   - a toggle (meta-bar "▲ arcade", or the `A` key, or ?arcade=1) that
 *     lazy-loads the game, starts combat mode and hides the CSS cursor
 *   - a pump that feeds the game's EventBus from POINTER events (the tail rig
 *     and the manikins preventDefault() their pointerdown, which suppresses
 *     compatibility mouse events — mousemove-only feeds froze)
 *   - Esc / toggle again → stop, restore the CSS cursor, release everything
 *
 * Nothing is loaded until the user opts in, so Lighthouse/LCP are untouched.
 * Desktop fine-pointer only; off under prefers-reduced-motion.
 */
const CANVAS_ID = 'asteroid-cursor';
const V = '?v=20260530-arc5';

export function initArcade() {
  const fine = matchMedia('(pointer: fine)').matches;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const toggle = document.querySelector('[data-arcade-toggle]');
  if (!fine || reduced) { toggle?.setAttribute('hidden', ''); return null; }

  const state = { game: null, on: false, pump: null, bus: null, loading: false };

  const setLabel = () => { if (toggle) { toggle.textContent = state.on ? '■ exit arcade' : '▲ arcade'; toggle.setAttribute('aria-pressed', String(state.on)); } };

  const ensureCanvas = () => {
    let c = document.getElementById(CANVAS_ID);
    if (!c) { c = document.createElement('canvas'); c.id = CANVAS_ID; c.className = 'asteroid-cursor'; c.setAttribute('aria-hidden', 'true'); document.body.appendChild(c); }
    return c;
  };

  const start = async () => {
    if (state.on || state.loading) return;
    state.loading = true;
    try {
      // NOTE: the bus must be the SAME module instance the game imports
      // ('./_stubs/EventBus.js', no query string) — a versioned specifier
      // resolves to a second singleton and nothing reaches the game (measured:
      // mouse stuck at centre, ship never appeared).
      const [{ AsteroidsGame }, busMod] = await Promise.all([
        import(`./asteroids/AsteroidsGame.js${V}`),
        import('./asteroids/_stubs/EventBus.js'),
      ]);
      const bus = busMod.default;
      ensureCanvas();
      if (!state.game) state.game = new AsteroidsGame(CANVAS_ID);
      const game = state.game;
      if (!game.isActive) { state.loading = false; return; }
      document.body.classList.add('is-arcade');
      game.start();
      game.startCombatMode();
      // seed the ship at the current pointer so it doesn't fly in from the centre
      const p = window.__lastPointer || { x: innerWidth / 2, y: innerHeight / 2 };
      game.mouse.x = p.x; game.mouse.y = p.y; game.player.x = p.x; game.player.y = p.y;
      // pump pointer/window events into the game's bus
      const onMove = (e) => { bus.emit('global:mousemove', e); };
      const onDown = (e) => { if (e.button === 0) bus.emit('global:mousedown', e); };
      const onUp = (e) => { if (e.button === 0) bus.emit('global:mouseup', e); };
      const onClick = (e) => { bus.emit('global:click', e); };
      const onResize = () => bus.emit('global:resize');
      const onKey = (e) => { if (e.key === 'Escape') stop(); };
      window.addEventListener('pointermove', onMove, { passive: true });
      window.addEventListener('pointerdown', onDown, { capture: true });
      window.addEventListener('pointerup', onUp, { capture: true });
      window.addEventListener('click', onClick, { capture: true });
      window.addEventListener('resize', onResize);
      window.addEventListener('keydown', onKey);
      // context menu off while firing (right button unused, but it interrupts)
      const onCtx = (e) => { if (game.isShipMode) e.preventDefault(); };
      window.addEventListener('contextmenu', onCtx);
      state.pump = () => {
        window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerdown', onDown, { capture: true });
        window.removeEventListener('pointerup', onUp, { capture: true }); window.removeEventListener('click', onClick, { capture: true });
        window.removeEventListener('resize', onResize); window.removeEventListener('keydown', onKey); window.removeEventListener('contextmenu', onCtx);
      };
      state.bus = bus; state.on = true; setLabel();
      // the manikins should not be grabbed while you're shooting asteroids
      window.__manikins && (window.__manikins.suspended = true);
      const tail = document.querySelector('.hero__canvas')?.__tail; if (tail) tail.suspended = true;
    } catch (err) {
      console.warn('[arcade] unavailable:', err?.message || err);
    } finally { state.loading = false; }
  };

  const stop = () => {
    if (!state.on) return;
    try { state.game.stopCombatMode(); state.game.stop(); } catch (_) {}
    state.pump?.(); state.pump = null;
    document.body.classList.remove('is-arcade');
    const c = document.getElementById(CANVAS_ID); if (c) { c.style.display = 'none'; c.classList.remove('is-ready'); }
    state.on = false; setLabel();
    window.__manikins && (window.__manikins.suspended = false);
    const tail = document.querySelector('.hero__canvas')?.__tail; if (tail) tail.suspended = false;
  };

  toggle?.addEventListener('click', (e) => { e.preventDefault(); state.on ? stop() : start(); });
  window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() !== 'a' || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    state.on ? stop() : start();
  });
  // remember the pointer for seeding the ship
  window.addEventListener('pointermove', (e) => { window.__lastPointer = { x: e.clientX, y: e.clientY }; }, { passive: true });
  if (/[?&]arcade=1/.test(location.search)) start();
  setLabel();
  return { start, stop, get on() { return state.on; }, get game() { return state.game; } };
}
