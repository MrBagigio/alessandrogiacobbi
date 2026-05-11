import { vi } from 'vitest'

// ── rAF: no-op by default so animations never self-advance.
// Individual tests override per-call with mockImplementationOnce.
global.requestAnimationFrame = vi.fn(() => 1)
global.cancelAnimationFrame = vi.fn()

// ── IntersectionObserver: jsdom doesn't implement it.
// Minimal mock that records observe/unobserve calls but never fires callbacks.
// loopGlitch/loopScramble check `'IntersectionObserver' in window`; with this
// mock present the IO branch runs (visible stays at its initial value).
const _mockIOInstance = {
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}
global.IntersectionObserver = vi.fn(() => _mockIOInstance)

// ── matchMedia: needed by initTextFx / initMagneticAuto guards.
// Returns matches: false so no reduced-motion skip fires.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// ── devicePixelRatio (used by particleBurst canvas)
Object.defineProperty(window, 'devicePixelRatio', { value: 1, writable: true })
