import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { visualizer } from 'rollup-plugin-visualizer'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    visualizer({
      open: false, // Set to true to auto-open after build
      gzipSize: true,
      brotliSize: true,
      filename: 'dist/stats.html',
    }),
  ],
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks: {
          // Core React - loaded immediately
          'vendor-react': ['react', 'react-dom'],

          // DnD kit - used by Timeline
          'vendor-dnd': ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],

          // Media processing - loaded when needed
          'vendor-media': ['mp4box', 'mp4-muxer', 'mux.js'],

          // HTML2Canvas - lazy loaded for export
          'vendor-canvas': ['html2canvas'],

          // Floating UI - used for dropdowns
          'vendor-floating': ['@floating-ui/react'],
        },
      },
    },
    chunkSizeWarningLimit: 500,
  },
  optimizeDeps: {
    include: ['react', 'react-dom'],
  },
})
