import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import { resolve } from 'node:path';

// Workspace packages are plain TypeScript sources and must be bundled, not externalized.
const workspacePackages = [
  '@poro/core',
  '@poro/lcu',
  '@poro/live-client',
  '@poro/riot-api', '@poro/stats',
  '@poro/static-data',
  '@poro/storage',
];

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: workspacePackages })],
    resolve: { alias: { '@shared': resolve('src/shared') } },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: workspacePackages })],
    resolve: { alias: { '@shared': resolve('src/shared') } },
  },
  renderer: {
    plugins: [react()],
    resolve: { alias: { '@shared': resolve('src/shared'), '@renderer': resolve('src/renderer/src') } },
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
          overlay: resolve('src/renderer/overlay.html'),
        },
      },
    },
  },
});
