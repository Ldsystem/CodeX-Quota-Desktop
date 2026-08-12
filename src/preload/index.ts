import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('codexQuotaDesktop', {
  platform: process.platform
})
