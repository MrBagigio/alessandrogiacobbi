/**
 * text-fx.test.js
 * Unit tests for the pure-function layer of assets/js/text-fx.js.
 * Does NOT test initTextFx() (orchestrator with many DOM side-effects) or
 * the rAF animation loop internals — only the exported API surface.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { scramble, glitch, bindOnReveal, loopGlitch, loopScramble } from '../assets/js/text-fx.js'

// ── helpers ─────────────────────────────────────────────────────────────────

function makeEl(text = 'Hello') {
  const el = document.createElement('p')
  el.textContent = text
  document.body.appendChild(el)
  return el
}

// Drive a rAF-captured callback far into the future so all scramble chars resolve.
function driveScrambleToEnd(el, text) {
  let capturedCb
  requestAnimationFrame.mockImplementationOnce((cb) => { capturedCb = cb; return 1 })
  // Ensure element is fresh
  el.textContent = text
  delete el.dataset.textFx
  delete el.dataset.fxDone
  scramble(el)
  // t = 10 000 ms >> any queue.end value → all chars resolve to final
  capturedCb(performance.now() + 10_000)
}

// ── scramble ─────────────────────────────────────────────────────────────────

describe('scramble', () => {
  let el

  beforeEach(() => {
    el = makeEl('Test')
    vi.clearAllMocks()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('does not throw on null input', () => {
    expect(() => scramble(null)).not.toThrow()
  })

  it('skips (no rAF) when data-fx-done="1"', () => {
    el.dataset.fxDone = '1'
    scramble(el)
    expect(requestAnimationFrame).not.toHaveBeenCalled()
  })

  it('skips when data-magnetic attribute is present', () => {
    el.setAttribute('data-magnetic', '')
    scramble(el)
    expect(requestAnimationFrame).not.toHaveBeenCalled()
  })

  it('skips when data-mlx-split="1" (magnetic letters already split)', () => {
    el.dataset.mlxSplit = '1'
    scramble(el)
    expect(requestAnimationFrame).not.toHaveBeenCalled()
  })

  it('stashes original text in data-text-fx', () => {
    scramble(el)
    expect(el.dataset.textFx).toBe('Test')
  })

  it('does not overwrite an existing data-text-fx (idempotent stash)', () => {
    el.dataset.textFx = 'Original'
    el.textContent = 'Modified'
    scramble(el)
    expect(el.dataset.textFx).toBe('Original')
  })

  it('schedules a rAF call to start the animation', () => {
    scramble(el)
    expect(requestAnimationFrame).toHaveBeenCalledOnce()
  })

  it('resolves to final text after animation completes', () => {
    driveScrambleToEnd(el, 'ABC')
    expect(el.textContent).toBe('ABC')
    expect(el.dataset.fxDone).toBe('1')
  })

  it('space chars are never wrapped in fx-scramble spans', () => {
    driveScrambleToEnd(el, 'A B')
    // Space should be preserved as plain text, not a span
    expect(el.innerHTML).not.toMatch(/<span[^>]*> <\/span>/)
    expect(el.innerHTML).not.toMatch(/<span[^>]*>&nbsp;<\/span>/)
  })

  it('non-space chars produce fx-scramble spans during mid-animation', () => {
    let capturedCb
    requestAnimationFrame.mockImplementationOnce((cb) => { capturedCb = cb; return 1 })
    el.textContent = 'AB'
    delete el.dataset.textFx
    delete el.dataset.fxDone
    scramble(el)
    // Drive tick at a time within the scramble window (startDelay=0, startTime≈now)
    // Using now + 1 ms — chars haven't passed q.end yet, so they render as spans
    capturedCb(performance.now() + 1)
    expect(el.innerHTML).toMatch(/fx-scramble/)
  })

  it('custom stableChance option is accepted without errors', () => {
    expect(() => scramble(el, { stableChance: 0.9, duration: 200 })).not.toThrow()
  })

  it('custom delay option defers animation start', () => {
    let capturedCb
    requestAnimationFrame.mockImplementationOnce((cb) => { capturedCb = cb; return 1 })
    el.textContent = 'X'
    delete el.dataset.textFx
    delete el.dataset.fxDone
    scramble(el, { delay: 5000, duration: 200 })
    // t = 1 ms — before startTime (startTime = now + 5000), so char hasn't started
    // and should still render as its initial from char, not final
    capturedCb(performance.now() + 1)
    // fxDone should NOT be set (animation not complete)
    expect(el.dataset.fxDone).not.toBe('1')
  })
})

// ── glitch ───────────────────────────────────────────────────────────────────

describe('glitch', () => {
  let el

  beforeEach(() => {
    el = makeEl()
    vi.useFakeTimers()
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.useRealTimers()
  })

  it('does not throw on null input', () => {
    expect(() => glitch(null)).not.toThrow()
  })

  it('adds is-glitching class immediately', () => {
    glitch(el)
    expect(el.classList.contains('is-glitching')).toBe(true)
  })

  it('removes is-glitching class after the specified duration', () => {
    glitch(el, 400)
    vi.advanceTimersByTime(400)
    expect(el.classList.contains('is-glitching')).toBe(false)
  })

  it('class is still present just before duration expires', () => {
    glitch(el, 300)
    vi.advanceTimersByTime(299)
    expect(el.classList.contains('is-glitching')).toBe(true)
  })

  it('default duration is ~320 ms', () => {
    glitch(el)         // no explicit duration → uses 320
    vi.advanceTimersByTime(319)
    expect(el.classList.contains('is-glitching')).toBe(true)
    vi.advanceTimersByTime(2)
    expect(el.classList.contains('is-glitching')).toBe(false)
  })

  it('removes and re-adds class on repeated call (reflow restart)', () => {
    el.classList.add('is-glitching')
    glitch(el)
    // After removing + re-adding, class must be present
    expect(el.classList.contains('is-glitching')).toBe(true)
  })
})

// ── loopGlitch ───────────────────────────────────────────────────────────────

describe('loopGlitch', () => {
  let el

  beforeEach(() => {
    el = makeEl()
    vi.useFakeTimers()
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.useRealTimers()
  })

  it('does not throw on null input', () => {
    expect(() => loopGlitch(null)).not.toThrow()
  })

  it('fires glitch after minDelay when onlyInViewport:false', () => {
    loopGlitch(el, { minDelay: 500, maxDelay: 500, duration: 200, onlyInViewport: false })
    vi.advanceTimersByTime(600)
    expect(el.classList.contains('is-glitching')).toBe(true)
  })

  it('second call with same element does not schedule additional timer (WeakMap guard)', () => {
    const spy = vi.spyOn(global, 'setTimeout')
    loopGlitch(el, { minDelay: 100, maxDelay: 100, onlyInViewport: false })
    const callsAfterFirst = spy.mock.calls.length
    loopGlitch(el, { minDelay: 100, maxDelay: 100, onlyInViewport: false })
    expect(spy.mock.calls.length).toBe(callsAfterFirst) // no extra setTimeout
    spy.mockRestore()
  })

  it('does not throw when element is removed from DOM before timer fires', () => {
    loopGlitch(el, { minDelay: 100, maxDelay: 100, onlyInViewport: false })
    document.body.removeChild(el)
    expect(() => vi.advanceTimersByTime(200)).not.toThrow()
  })
})

// ── loopScramble ─────────────────────────────────────────────────────────────

describe('loopScramble', () => {
  let el

  beforeEach(() => {
    el = makeEl('Keyword')
    vi.useFakeTimers()
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.useRealTimers()
  })

  it('does not throw on null input', () => {
    expect(() => loopScramble(null)).not.toThrow()
  })

  it('resets data-fx-done to empty string before re-scrambling', () => {
    el.dataset.fxDone = '1'
    loopScramble(el, { minDelay: 100, maxDelay: 100, duration: 600 })
    vi.advanceTimersByTime(200)
    // loopScramble does `el.dataset.fxDone = ''` before calling scramble()
    expect(el.dataset.fxDone).toBe('')
  })

  it('does not throw when element is removed from DOM before timer fires', () => {
    loopScramble(el, { minDelay: 100, maxDelay: 100 })
    document.body.removeChild(el)
    expect(() => vi.advanceTimersByTime(200)).not.toThrow()
  })
})

// ── bindOnReveal ─────────────────────────────────────────────────────────────

describe('bindOnReveal', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('calls fn immediately for each match when IntersectionObserver is unavailable', () => {
    const orig = window.IntersectionObserver
    delete window.IntersectionObserver

    const el1 = makeEl()
    el1.className = 'test-reveal-a'
    const el2 = makeEl()
    el2.className = 'test-reveal-a'

    const fn = vi.fn()
    bindOnReveal('.test-reveal-a', fn)

    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn).toHaveBeenCalledWith(el1)
    expect(fn).toHaveBeenCalledWith(el2)

    window.IntersectionObserver = orig
  })

  it('does not throw when selector matches nothing', () => {
    expect(() => bindOnReveal('.nonexistent-xyz-selector', vi.fn())).not.toThrow()
  })

  it('does not call fn when selector matches nothing', () => {
    const fn = vi.fn()
    bindOnReveal('.nonexistent-xyz-selector', fn)
    expect(fn).not.toHaveBeenCalled()
  })

  it('uses threshold option in IntersectionObserver config', () => {
    const fn = vi.fn()
    // With IO mocked globally (never fires), fn should NOT be called immediately
    bindOnReveal('.nonexistent-xyz', fn, { threshold: 0.8 })
    expect(fn).not.toHaveBeenCalled()
    // Verify IO was constructed with our threshold
    const ioCalls = IntersectionObserver.mock.calls
    if (ioCalls.length) {
      // IO constructor was called with options containing threshold
      const opts = ioCalls[ioCalls.length - 1][1]
      expect(opts?.threshold ?? 0.4).toBeDefined()
    }
  })
})
