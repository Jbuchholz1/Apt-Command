import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/') || id.includes('node_modules/react-router')) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/@azure/msal')) {
            return 'vendor-msal';
          }
          if (id.includes('node_modules/recharts') || id.includes('node_modules/d3-')) {
            return 'vendor-charts';
          }
          if (id.includes('node_modules/reactflow') || id.includes('node_modules/dagre') || id.includes('node_modules/@reactflow')) {
            return 'vendor-flow';
          }
          if (id.includes('node_modules/exceljs')) {
            return 'vendor-excel';
          }
        },
      },
    },
  },
})
