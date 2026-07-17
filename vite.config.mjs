import { defineConfig } from 'vite';

// The game is a custom canvas renderer (src/main.js) loaded from index.html.
// Vite serves the project root, so runtime-fetched assets in ./assets (.tmx,
// tileset .png) resolve at /assets/* in dev. Phaser is installed as a dependency
// for future use; the current renderer does not import it.
export default defineConfig({
  root: '.',
  server: { port: 5173, open: true },
  build: { outDir: 'dist', emptyOutDir: true },
});
