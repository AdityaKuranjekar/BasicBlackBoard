import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Infinite Blackboard',
        short_name: 'Blackboard',
        description: 'A distraction-free infinite digital blackboard',
        theme_color: '#1C3A2A',
        background_color: '#1C3A2A',
        display: 'standalone',
        orientation: 'landscape',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
  // Optimise for iPad Safari — no polyfills for very old browsers
  build: {
    target: 'es2020',
    // Keep chunk sizes reasonable
    chunkSizeWarningLimit: 600,
  },
  server: {
    // Allow LAN access for iPad testing via USB/WiFi
    host: true,
    port: 5173,
  },
})
