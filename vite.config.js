import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/',                // important on Pages
  plugins: [react()],
  build: { sourcemap: true } // helps debug if needed
})
