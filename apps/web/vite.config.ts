import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // Must mirror the paths in tsconfig.app.json — TS resolves types, Vite
    // resolves the actual import at build time. They drift silently if you
    // change one and not the other.
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
})
