/**
 * clock.js — meta-bar clock in the studio's time zone.
 *
 * It used to print the VISITOR's local hours and hard-code "CET": a recruiter
 * in New York read "09:15 CET" when it was 15:15 in Italy (and "CET" is wrong
 * in summer anyway). Intl does the zone + CET/CEST for us; en-GB guarantees a
 * 24 h clock and the abbreviated zone name (en-US would print "GMT+2").
 */
const FMT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit', hour12: false, timeZoneName: 'short',
});

/** "15:15 CEST" / "14:15 CET" for the given instant (default: now). */
export function formatClock(d = new Date()) { return FMT.format(d); }

export function initClock(selector = '.meta-clock', intervalMs = 30_000) {
  const el = document.querySelector(selector);
  if (!el) return null;
  const tick = () => { el.textContent = formatClock(); };
  tick();
  return setInterval(tick, intervalMs);
}
