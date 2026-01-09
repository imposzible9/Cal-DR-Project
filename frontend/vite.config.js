import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/caldr/',
  server: { port: 8082 },
  build: {
    outDir: 'dist', // ค่า default 
    assetsDir: 'assets', // ค่า default; ปล่อยได้ 
    sourcemap: false
  },
  plugins: [
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler']],
      },
    }),
    tailwindcss(),
  ],
})
