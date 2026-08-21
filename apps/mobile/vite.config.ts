import { defineConfig } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// Set by `tauri android dev --host <ip>` on its beforeDevCommand subprocess so the
// dev server binds to an interface reachable from the emulator/device.
const mobileHost = process.env.TAURI_DEV_HOST;

export default defineConfig({
  resolve: {
    alias: {
      '@tauri-apps/plugin-camera': resolve(__dirname, 'src/shared/tauri-plugins/plugin-camera'),
    },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
    chunkSizeWarningLimit: 200,
  },
  server: {
    host: mobileHost || false,
    port: 1420,
    strictPort: true,
    ...(mobileHost && {
      hmr: {
        protocol: 'ws',
        host: mobileHost,
        port: 1421,
      },
    }),
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
});