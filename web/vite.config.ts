import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

import { localRecordingsPlugin } from './vite-plugins/local-recordings.js'

// GitHub Pages serves this project from a subpath (no custom domain is
// configured), so asset URLs need that prefix baked in for the Pages build
// only — everywhere else (dev, preview, any future host that serves from
// the domain root) stays at '/'. See web/README.md's Deployment section.
//
// The manifest's start_url/scope reuse this same value rather than a
// hardcoded '/' — hardcoding either one breaks the other on whichever host
// wasn't hardcoded for (mobile.md §4).
const base = process.env.GH_PAGES === 'true' ? '/teochew-dictionary/' : '/'

export default defineConfig(({ command }) => ({
  base,
  plugins: [
    react(),
    // Dev-server-only: gives the Sounds tab's record control somewhere to
    // POST to (issue #128, data/phonology/REVIEW.md § 17). `configureServer`
    // is already never called during `vite build`, so this gate is
    // belt-and-suspenders, not load-bearing — it also keeps the route out of
    // `vite preview`, which serves a real build.
    ...(command === 'serve' ? [localRecordingsPlugin()] : []),
    // PWA installability (mobile.md §4, §11 — a deliberate exception to the
    // hand-rolled-implementations preference: the precache manifest has to
    // be generated from hashed build output, and hand-rolled cache
    // invalidation is a well-known way to brick a static site).
    VitePWA({
      // 'prompt' rather than 'autoUpdate': a silent reload could land mid
      // flashcard review and drop the session. src/pwa/UpdatePrompt.tsx
      // shows the reload control this implies.
      registerType: 'prompt',
      injectRegister: null,
      manifest: {
        name: 'Teochew Dictionary',
        short_name: 'Teochew Dict',
        description:
          "A free, searchable dictionary and flashcard trainer for Teochew (潮州話). Look up by Chinese characters, Peng'im, POJ, or English gloss.",
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#a63d2f',
        lang: 'en',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The shell only — never the dictionary/sounds/syllable-chart JSON
        // under public/data/ (41MB decoded for dict.json alone). Writing
        // that to someone's phone without asking is hostile, and it eats a
        // large share of a constrained iOS quota; Settings' "Available
        // offline" toggle (mobile.md §9) is what opts a device in.
        globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
        globIgnores: ['data/**'],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
}))
