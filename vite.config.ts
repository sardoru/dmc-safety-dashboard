import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      // Each film page is its own entry so link previews get real video meta;
      // /join and /live are the same app with their own link-preview cards.
      input: {
        main: 'index.html',
        film: 'how-it-works.html',
        reportFilm: 'how-to-report.html',
        joinFilm: 'how-to-join.html',
        shortFilm: 'in-30-seconds.html',
        join: 'join.html',
        live: 'live.html',
      },
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
