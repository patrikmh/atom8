import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  define: {
    'process.env': JSON.stringify({ NODE_ENV: 'production' }),
  },
  server: {
    port: 3000,
    host: true,
    proxy: {
      '/api': {
        target: 'http://192.168.0.108:8000',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://192.168.0.108:8000',
        changeOrigin: true,
      },
    },
  },
})
