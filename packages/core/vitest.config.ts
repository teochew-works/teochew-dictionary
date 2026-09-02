import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // 'jsdom' rather than 'node': flashcards/promptMode.ts, flashcards/levelFilter.ts and
    // settings/pronunciationMode.ts read/write `localStorage` directly (see README.md for why
    // that's here despite this package otherwise being pure derivation logic), and their tests
    // exercise that. Every other suite in this package is plain logic and runs identically
    // under jsdom or node.
    environment: 'jsdom',
  },
})
