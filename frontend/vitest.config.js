import { defineConfig } from 'vitest/config'

// Dedicated test config (kept separate from vite.config.js so the PWA plugin
// doesn't run during tests). Coverage is scoped to business logic in src/lib —
// pure, unit-testable code. The patch-coverage CI gate uses the cobertura report
// to fail any PR that adds/changes a src/lib line without a test covering it.
// Presentational JSX is verified by manual smoke tests, not unit-gated.
export default defineConfig({
  test: {
    include: ['src/**/*.test.{js,jsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'cobertura'],
      reportsDirectory: './coverage',
      // Gate PURE business logic. New logic files under src/lib are included by
      // default (so they must be tested). The exclusions below are browser/hardware
      // I/O glue and static data that aren't meaningfully unit-testable — those are
      // covered by manual smoke tests. Add new pure-logic modules here, not to the
      // exclude list, so the gate keeps enforcing tests on them.
      include: ['src/lib/**/*.{js,jsx}'],
      exclude: [
        'src/lib/**/*.test.{js,jsx}',
        'src/lib/bluetoothPrint.js', // Web Bluetooth I/O
        'src/lib/db.js',             // IndexedDB I/O
        'src/lib/offlineSync.js',    // network/IDB sync
        'src/lib/pwa.js',            // browser PWA APIs + install hook
        'src/lib/receiptLib.js',     // canvas/DOM receipt rendering
        'src/lib/tiers.js',          // static pricing data
        'src/lib/useAdminTab.js',    // React hook
      ],
      all: true,
    },
  },
})
