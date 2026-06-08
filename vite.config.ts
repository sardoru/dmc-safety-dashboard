import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          leaflet: ['leaflet', 'react-leaflet'],
          supabase: ['@supabase/supabase-js'],
          webauthn: ['@simplewebauthn/browser'],
          datefns: ['date-fns'],
        },
      },
    },
  },
})
