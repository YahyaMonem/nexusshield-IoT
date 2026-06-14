import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('@tensorflow')) return 'tensorflow'
            if (id.includes('lucide-react')) return 'lucide'
            if (id.includes('recharts')) return 'recharts'
            return 'vendor'
          }
        }
      }
    }
  }
})