import type { CodexQuotaService } from '../shared/codex-quota'
import type { CodexQuotaShell } from '../shared/shell'

declare global {
  interface Window {
    /** Absent in the browser preview, which falls back to fixture data. */
    codexQuota?: CodexQuotaService
    /** Absent in the browser preview, where there is no menu bar to talk to. */
    codexQuotaShell?: CodexQuotaShell
    codexQuotaDesktop?: { platform: string }
  }
}

export {}
