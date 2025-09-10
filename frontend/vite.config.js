import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Forward frontend requests starting with /app/ajax to the Node backend
      '/app/ajax': {
        target: 'http://localhost:4000/ajax',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/app\/ajax/, '')
      }
    }
  }
})
