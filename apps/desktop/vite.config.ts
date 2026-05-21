import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { copyFileSync, mkdirSync, existsSync } from 'fs';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'copy-preload',
      closeBundle() {
        // Copy preload.js to dist/main
        const src = path.resolve(__dirname, 'src/main/preload.js');
        const destDir = path.resolve(__dirname, '../../dist/main');
        const dest = path.resolve(destDir, 'preload.js');

        if (!existsSync(destDir)) {
          mkdirSync(destDir, { recursive: true });
        }

        if (existsSync(src)) {
          copyFileSync(src, dest);
          console.log('[vite] Copied preload.js');
        }
      },
    },
  ],
  root: './src/renderer',
  base: './',
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, 'src/renderer/index.html'),
    },
  },
  server: {
    port: 5173,
  },
});
