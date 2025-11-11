import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/',             // keep root for your custom domain
  plugins: [react()],
})
