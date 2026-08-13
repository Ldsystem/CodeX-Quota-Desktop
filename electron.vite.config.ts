import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        // A sandboxed preload cannot be an ES module, and `"type": "module"`
        // would make a plain `.js` one. `.cjs` keeps the sandbox available.
        output: { format: 'cjs', entryFileNames: 'index.cjs' }
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    build: {
      rollupOptions: {
        // Two surfaces, one renderer build: the workbench window and the panel
        // the menu bar icon opens.
        input: {
          index: resolve('src/renderer/index.html'),
          panel: resolve('src/renderer/panel.html')
        }
      }
    },
    plugins: [react()]
  }
})
