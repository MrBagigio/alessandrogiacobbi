import { describe, it, expect } from 'vitest'
import { formatClock, initClock } from '../assets/js/clock.js'

describe('meta-bar clock (Europe/Rome, CET/CEST)', () => {
  it('formats a summer instant as CEST and a winter one as CET, 24 h, regardless of the visitor zone', () => {
    expect(formatClock(new Date('2026-08-23T13:15:00Z'))).toBe('15:15 CEST')
    expect(formatClock(new Date('2026-01-15T13:15:00Z'))).toBe('14:15 CET')
    expect(formatClock(new Date('2026-01-15T23:05:00Z'))).toBe('00:05 CET')   // never "24:05"
  })
  it('initClock writes into .meta-clock and returns an interval handle (null without the element)', () => {
    document.body.innerHTML = '<span class="meta-clock">--:--</span>'
    const h = initClock('.meta-clock', 60_000)
    expect(h).not.toBeNull()
    expect(document.querySelector('.meta-clock').textContent).toMatch(/^\d\d:\d\d CES?T$/)
    clearInterval(h)
    document.body.innerHTML = ''
    expect(initClock('.meta-clock')).toBeNull()
  })
})
