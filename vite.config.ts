import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      // The film page is its own entry so link previews get real video meta.
      input: { main: 'index.html', film: 'how-it-works.html' },
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
