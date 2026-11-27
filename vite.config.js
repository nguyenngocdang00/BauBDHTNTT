import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Relative asset paths work on both the project URL and the custom domain root.
  base: process.env.GITHUB_ACTIONS ? './' : '/',
  plugins: [react()],
})
