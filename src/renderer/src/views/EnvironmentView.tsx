import type { EnvironmentSnapshot } from '../../../shared/codex-quota'
import { Panel } from '../components/Panel'
import { hasShell } from '../lib/shell'
import { usePreferences } from '../lib/use-preferences'

interface EnvironmentViewProps {
  environment: EnvironmentSnapshot | null
}

/**
 * Paths and settings are read-only, since they come from the environment the
 * app was launched with. The two menu bar preferences are not: they are the
 * only things here the app itself owns.
 */
export function EnvironmentView({ environment }: EnvironmentViewProps): React.JSX.Element {
  const { preferences, update: change } = usePreferences()

  if (environment === null) {
    return <p className="panel__empty">Reading local state.</p>
  }

  return (
    <div className="panel-grid">
      <Panel
        title="Automatic sync"
        subtitle="What the app does on its own between your visits"
        span="wide"
      >
        <div className="fact-column">
          <Toggle
            label="Keep accounts in sync automatically"
            hint="Re-reads usage every two minutes while anything is still undecided, then every ten once all windows are known to be counting."
            checked={preferences.autoSync}
            onChange={(next) => change({ autoSync: next })}
          />
          <p className="panel__note">
            A weekly allowance does not begin when the week does. It begins with the first billed
            request, and until then the reset time the API reports simply slides along with the
            clock. Sampling it twice tells the difference: a reset that moved with the clock belongs
            to a window nobody has started, and one that held still is already counting down.
          </p>
          <p className="panel__note">
            When this switch is on and an account&rsquo;s window has not started, the app sends the
            same single minimal request the <strong>Start window</strong> button sends, so the week
            begins now rather than whenever that account next happens to be used, and its reset
            arrives that much sooner. It costs a negligible number of tokens, it is announced by a
            notice like any other action, and it is not retried for six hours if it fails. Turn the
            switch off and nothing is read or spent unless you ask for it.
          </p>
        </div>
      </Panel>

      {hasShell ? (
        <Panel title="Menu bar" subtitle="How the app behaves when its window is closed" span="wide">
          <div className="fact-column">
            <Toggle
              label="Keep running in the menu bar"
              hint="Closing this window leaves the icon and its panel available. Quit from the icon's menu."
              checked
              disabled
              onChange={() => undefined}
            />
            <Toggle
              label="Start at login"
              hint="Launches straight into the menu bar, without opening this window."
              checked={preferences.startAtLogin}
              onChange={(next) => change({ startAtLogin: next })}
            />
            <Toggle
              label="Hide the Dock icon"
              hint="Leaves only the menu bar icon. Reopen this window from there."
              checked={preferences.menuBarOnly}
              onChange={(next) => change({ menuBarOnly: next })}
            />
          </div>
        </Panel>
      ) : null}

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
            Desktop afterwards for the change to take effect. Codex now ships inside the ChatGPT
            app rather than as a separate one, so either counts as running.
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

interface ToggleProps {
  label: string
  hint: string
  checked: boolean
  disabled?: boolean
  onChange: (next: boolean) => void
}

function Toggle({ label, hint, checked, disabled, onChange }: ToggleProps): React.JSX.Element {
  return (
    <label className={`toggle${disabled ? ' toggle--fixed' : ''}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="toggle__text">
        <span className="toggle__label">{label}</span>
        <span className="toggle__hint">{hint}</span>
      </span>
    </label>
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
