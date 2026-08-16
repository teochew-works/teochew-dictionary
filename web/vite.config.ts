import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// GitHub Pages serves this project from a subpath (no custom domain is
// configured), so asset URLs need that prefix baked in for the Pages build
// only — everywhere else (dev, preview, any future host that serves from
// the domain root) stays at '/'. See web/README.md's Deployment section.
export default defineConfig({
  base: process.env.GH_PAGES === 'true' ? '/teochew-dictionary/' : '/',
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
