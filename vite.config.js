import { defineConfig } from 'vite';

// Относительный base, чтобы собранная игра работала и на GitHub Pages, и локально.
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    outDir: 'dist',
    chunkSizeWarningLimit: 1200
  }
});
