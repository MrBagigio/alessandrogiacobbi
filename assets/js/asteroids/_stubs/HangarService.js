/**
 * HangarService stub — minimal noop.
 *
 * Original Portfolio V14 had cosmetics shop system. Portfolio Giacobbi
 * doesn't need cosmetics or hangar — cursor is purely decorative.
 *
 * All methods return null/empty so AsteroidsGame falls back to defaults.
 */
export const hangarService = {
  _credits: 0,
  getAsteroidsCosmeticsConfig() { return null; },
  getEquippedShipSkin() { return null; },
  getEquippedTrail() { return null; },
  getEquippedBulletStyle() { return null; },
  getCredits() { return this._credits; },
  addCredits(n) { this._credits += n; return this._credits; },
  spendCredits(n) { this._credits = Math.max(0, this._credits - n); return this._credits; },
  on(/* event, callback */) { return () => {}; },
  off(/* event, callback */) {},
  emit(/* event, data */) {},
};

export default hangarService;
