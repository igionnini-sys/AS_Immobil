import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  build: {
    ssr: fileURLToPath(new URL('./repository.ts', import.meta.url)),
    outDir: fileURLToPath(new URL('./dist', import.meta.url)),
    emptyOutDir: true,
    rolldownOptions: { output: { entryFileNames: 'repository.mjs' } },
  },
  ssr: { noExternal: ['@immobil/storage', '@immobil/core'] },
});
