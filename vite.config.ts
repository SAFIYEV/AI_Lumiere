import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { apiPlugin } from './api-plugin'

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/AI_Lumiere/' : '/',
  plugins: [react(), apiPlugin()],
  server: {
    port: 5173,
  },
}))
