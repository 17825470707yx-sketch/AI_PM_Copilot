import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const PROXY_PORT = Number(process.env.ARK_PROXY_PORT || 8787)
const PROXY_TARGET = `http://127.0.0.1:${PROXY_PORT}`
const VITE_PORT = Number(process.env.VITE_PORT || 5173)

export default defineConfig({
  plugins: [react()],
  base: '/',
  server: {
    host: '127.0.0.1',
    port: VITE_PORT,
    strictPort: false,
    proxy: {
      '/api': {
        target: PROXY_TARGET,
        changeOrigin: true,
        secure: false,
        configure: (proxy, options) => {
          proxy.on('proxyReq', (proxyReq, req, res) => {
            console.log(`[Vite Proxy] 转发请求: ${req.method} ${req.url} -> ${PROXY_TARGET}${req.url}`);
          });
        },
      },
    },
  },
})
