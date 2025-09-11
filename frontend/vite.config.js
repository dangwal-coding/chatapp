import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Forward frontend requests starting with /ajax to the backend
      '/ajax': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        secure: false,
        // keep path as-is (no rewrite needed)
        // rewrite: (path) => path
      }
    }
  }
})
