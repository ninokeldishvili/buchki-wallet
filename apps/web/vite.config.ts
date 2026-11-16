import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

const API = process.env.API_URL || 'http://127.0.0.1:4000'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // WDK modules use Node built-ins (Buffer, crypto, stream...).
    nodePolyfills({ globals: { Buffer: true, process: true, global: true } })
  ],
  server: {
    port: 5173,
    strictPort: true,
    // Same-origin in development: the session cookie just works.
    proxy: { '/api': { target: API, changeOrigin: false, rewrite: (p) => p.replace(/^\/api/, '') } }
  },
  build: { target: 'es2023', sourcemap: true }
})
