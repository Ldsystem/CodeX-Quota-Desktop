import type { EnvironmentSnapshot } from '../../../shared/codex-quota'
import { Panel } from '../components/Panel'

interface EnvironmentViewProps {
  environment: EnvironmentSnapshot | null
}

/**
 * Read-only for now. These values come from the environment the app was
 * launched with; editing them belongs to a later settings surface.
 */
export function EnvironmentView({ environment }: EnvironmentViewProps): React.JSX.Element {
  if (environment === null) {
    return <p className="panel__empty">Reading local state.</p>
  }

  return (
    <div className="panel-grid">
      <Panel title="Storage" subtitle="Where profiles and backups live" span="wide">
        <div className="path-list">
          <Path label="Storage root" value={environment.storageRoot} />
          <Path label="Accounts" value={`${environment.storageRoot}/accounts`} />
          <Path label="Backups" value={environment.backupsPath} />
          <Path label="Live credential" value={environment.liveAuthPath} />
        </div>
      </Panel>

      <Panel title="Desktop" subtitle="Who holds the live credential">
        <div className="fact-column">
          <div className="fact">
            <span className="fact__label">State</span>
            <span className="fact__value">
              <span
                className={`dot${environment.desktopRunning ? ' dot--live' : ' dot--off'}`}
                aria-hidden="true"
              />
              {environment.desktopRunning ? 'Running' : 'Closed'}
            </span>
          </div>
          <div className="fact">
            <span className="fact__label">Active account</span>
            <span className="fact__value numeric">{environment.activeAccount ?? 'None recorded'}</span>
          </div>
          <p className="panel__note">
            Switching accounts while Desktop runs writes new credentials underneath it. Restart
            Desktop afterwards for the change to take effect.
          </p>
        </div>
      </Panel>

      <Panel title="Network" subtitle="How usage is fetched">
        <div className="fact-column">
          <div className="path">
            <span className="path__label">Usage API</span>
            <code className="path__value numeric">{environment.usageApiUrl}</code>
          </div>
          <div className="path">
            <span className="path__label">Proxy</span>
            <code className="path__value numeric">{environment.proxyUrl ?? 'Direct connection'}</code>
          </div>
        </div>
      </Panel>

      <Panel title="Window priming" subtitle="The billed request that starts a quota window" span="wide">
        <div className="fact-column">
          <div className="fact-grid">
            <div className="fact">
              <span className="fact__label">Model</span>
              <span className="fact__value numeric">{environment.windowStartModel}</span>
            </div>
            <div className="fact">
              <span className="fact__label">Reasoning effort</span>
              <span className="fact__value numeric">{environment.windowStartReasoningEffort}</span>
            </div>
          </div>
          <Path label="codex command" value={environment.codexBinary ?? 'Not found on this machine'} />
          <p className="panel__note">
            Starting a window sends one minimal request so the quota window begins counting from a
            moment you chose, rather than from whenever you next happen to use the account. Signing
            in and out run through the same command. Set <code>CODEX_QUOTA_CODEX_BIN</code> to point
            at a different one.
          </p>
        </div>
      </Panel>
    </div>
  )
}

function Path({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="path">
      <span className="path__label">{label}</span>
      <code className="path__value numeric">{value}</code>
    </div>
  )
}
