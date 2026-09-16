import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      // Dev server talks to the backend directly; in Docker nginx does this.
      '/api': { target: process.env.VITE_DEV_API || 'http://localhost:4000', changeOrigin: true },
      '/socket.io': {
        target: process.env.VITE_DEV_API || 'http://localhost:4000',
        ws: true,
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          map: ['maplibre-gl'],
          charts: ['chart.js'],
          geo: ['@turf/turf']
        }
      }
    }
  }
});
