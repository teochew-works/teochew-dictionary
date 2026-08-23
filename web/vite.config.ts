import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

import { localRecordingsPlugin } from './vite-plugins/local-recordings.js'

// GitHub Pages serves this project from a subpath (no custom domain is
// configured), so asset URLs need that prefix baked in for the Pages build
// only — everywhere else (dev, preview, any future host that serves from
// the domain root) stays at '/'. See web/README.md's Deployment section.
export default defineConfig(({ command }) => ({
  base: process.env.GH_PAGES === 'true' ? '/teochew-dictionary/' : '/',
  plugins: [
    react(),
    // Dev-server-only: gives the Sounds tab's record control somewhere to
    // POST to (issue #128, data/phonology/REVIEW.md § 17). `configureServer`
    // is already never called during `vite build`, so this gate is
    // belt-and-suspenders, not load-bearing — it also keeps the route out of
    // `vite preview`, which serves a real build.
    ...(command === 'serve' ? [localRecordingsPlugin()] : []),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
}))
