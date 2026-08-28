import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 开发模式下把 /api 请求转发给后端（端口 3001）
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001'
    }
  }
});
