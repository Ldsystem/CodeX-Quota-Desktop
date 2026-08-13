import '@fontsource/fira-code/400.css'
import '@fontsource/fira-code/500.css'
import '@fontsource/fira-code/600.css'
import './styles/tokens.css'
import './styles/app.css'
import './styles/panel.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import type { CodexQuotaService } from '../../shared/codex-quota'
import { FixtureCodexQuotaService } from './lib/fixture-service'
import { TrayPanel } from './panel/TrayPanel'

const service: CodexQuotaService = window.codexQuota ?? new FixtureCodexQuotaService()

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element #root not found')
}

createRoot(rootElement).render(
  <StrictMode>
    <TrayPanel service={service} />
  </StrictMode>
)
