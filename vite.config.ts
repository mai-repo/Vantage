import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: {
        '/api/chartmetric': {
          target: 'https://api.chartmetric.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/chartmetric/, '/api'),
        },
        '/api/jambase': {
          target: 'https://www.jambase.com',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/jambase/, '/jb-api/v1'),
        },
      },
    },
  };
});
