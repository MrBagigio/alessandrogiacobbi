/**
 * EventBus stub — minimal pub/sub.
 *
 * Replicate API surface so AsteroidsGame imports work, but nessun
 * subscriber esterno è connesso (portfolio non emette/ascolta eventi globali).
 */
class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  on(event, handler) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(handler);
    return () => this.off(event, handler);
  }

  off(event, handler) {
    const set = this.listeners.get(event);
    if (set) set.delete(handler);
  }

  emit(event, payload) {
    const set = this.listeners.get(event);
    if (!set) return;
    set.forEach((fn) => {
      try { fn(payload); } catch (e) { console.error('[EventBus]', e); }
    });
  }
}

export default new EventBus();
