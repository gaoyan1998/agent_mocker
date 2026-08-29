import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverTarget = process.env.MOCK_SERVER_URL ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // 直接指向 workspace 里的 TS 源码，前后端共用同一套类型定义。
      '@agent-mock/shared': path.resolve(here, '../../packages/shared/src/index.ts'),
      '@': path.resolve(here, 'src'),
    },
  },
  optimizeDeps: {
    exclude: ['@agent-mock/shared'],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: serverTarget, changeOrigin: true },
      '/v1': { target: serverTarget, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
