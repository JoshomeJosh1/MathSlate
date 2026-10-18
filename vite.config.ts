/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves a project repo under /<repo>/, so built asset URLs need that prefix.
export default defineConfig({
  base: '/MathSlate/',
  plugins: [react()],
  worker: { format: 'es' },
  // MathLive alone is ~800 kB minified; revisit with code splitting if load time matters.
  build: { chunkSizeWarningLimit: 1200 },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // Integration tests load real SymPy (Pyodide) and are run separately: npm run test:integration
    exclude: process.env.INTEGRATION ? [] : ['src/**/*.integration.test.ts'],
    // The on-disk transform cache is keyed by file contents, so a registry index's
    // import.meta.glob result goes stale when a file is added to defs/ — new registry entries
    // would silently be missing from tests.
    fsModuleCache: false,
  },
});
