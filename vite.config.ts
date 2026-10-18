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
  },
});
