import type { CodexQuotaService } from '../shared/codex-quota'

declare global {
  interface Window {
    /** Absent in the browser preview, which falls back to fixture data. */
    codexQuota?: CodexQuotaService
    codexQuotaDesktop?: { platform: string }
  }
}

export {}
