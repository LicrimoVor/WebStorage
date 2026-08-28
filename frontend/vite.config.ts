import {fileURLToPath, URL} from 'node:url';

import react from '@vitejs/plugin-react';
import {defineConfig} from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/shared/lib/testing/setup.ts',
    testTimeout: 15_000,
    maxWorkers: 2,
    css: true,
    server: {
      deps: {
        inline: [/@gravity-ui\//],
      },
    },
  },
});
