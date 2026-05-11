import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['__tests__/**/*.test.js'],
    setupFiles: ['__tests__/setup.js'],
    clearMocks: true,
    coverage: {
      provider: 'v8',
      include: ['assets/js/text-fx.js', 'assets/js/magnetic-letters.js'],
    },
  },
})
