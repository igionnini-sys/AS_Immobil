import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  build: { target: 'chrome100', outDir: 'dist', emptyOutDir: true },
  server: { port: 5173, strictPort: true },
});
