import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      allowedHosts: true as const,
      watch: {
        ignored: [
          '**/server/data/**',
          '**/server/uploads/**',
          '**/print-client/temp/**',
          '**/print-client/printed_output/**',
          path.resolve(__dirname, 'server/data/**'),
          path.resolve(__dirname, 'server/uploads/**'),
          path.resolve(__dirname, 'print-client/temp/**'),
          path.resolve(__dirname, 'print-client/printed_output/**')
        ]
      },
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:3001',
          changeOrigin: true,
        },
        '/uploads': {
          target: 'http://127.0.0.1:3001',
          changeOrigin: true,
        },
        '/download': {
          target: 'http://127.0.0.1:3001',
          changeOrigin: true,
        },
      },
    },
  };
});
