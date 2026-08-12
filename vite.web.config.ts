import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Serves the renderer on its own so the interface can be reviewed in a browser
// without launching Electron. The app degrades gracefully: the preload bridge
// is simply absent outside Electron.
export default defineConfig({
  root: resolve('src/renderer'),
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src')
    }
  },
  plugins: [react()],
  server: {
    port: 5273,
    strictPort: true,
    // fsevents misses edits to these files on this machine, which leaves the
    // preview serving stale modules until the server is restarted.
    watch: { usePolling: true, interval: 400 }
  }
})
