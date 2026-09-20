import { useEffect, useId, useState } from 'react'

import type { EnvironmentSnapshot } from '../../../shared/codex-quota'
import { Panel } from '../components/Panel'
import { hasShell } from '../lib/shell'
import { usePreferences } from '../lib/use-preferences'

interface EnvironmentViewProps {
  environment: EnvironmentSnapshot | null
}

/**
 * Paths and network settings are read-only. Menu bar behavior and the request
 * settings used for window priming are app-owned preferences.
 */
export function EnvironmentView({ environment }: EnvironmentViewProps): React.JSX.Element {
  const { preferences, update: change } = usePreferences()
  const [windowStartModel, setWindowStartModel] = useState(preferences.windowStartModel)
  const [windowStartReasoningEffort, setWindowStartReasoningEffort] = useState(
    preferences.windowStartReasoningEffort
  )
  const modelId = useId()
  const reasoningEffortId = useId()

  useEffect(() => setWindowStartModel(preferences.windowStartModel), [preferences.windowStartModel])
  useEffect(
    () => setWindowStartReasoningEffort(preferences.windowStartReasoningEffort),
    [preferences.windowStartReasoningEffort]
  )

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
            hint="Refreshes immediately when enabled, then every two minutes while anything is undecided and every five minutes once all windows are counting."
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
          <form
            className="field"
            onSubmit={(event) => {
              event.preventDefault()
              change({ windowStartModel, windowStartReasoningEffort })
            }}
          >
            <div className="field-grid">
              <div className="field">
                <label className="field__label" htmlFor={modelId}>
                  Model for billed requests
                </label>
                <input
                  id={modelId}
                  className="field__input numeric"
                  value={windowStartModel}
                  placeholder="Codex configured default"
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(event) => setWindowStartModel(event.target.value)}
                />
              </div>
              <div className="field">
                <label className="field__label" htmlFor={reasoningEffortId}>
                  Reasoning effort
                </label>
                <input
                  id={reasoningEffortId}
                  className="field__input numeric"
                  value={windowStartReasoningEffort}
                  placeholder="Codex configured default"
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(event) => setWindowStartReasoningEffort(event.target.value)}
                />
              </div>
            </div>
            <span className="field__hint">
              Enter values supported by the selected model, or leave either field empty to let
              Codex use its configured default.
            </span>
            <div>
              <button
                type="submit"
                className="button button--primary"
                disabled={
                  windowStartModel.trim() === preferences.windowStartModel &&
                  windowStartReasoningEffort.trim() === preferences.windowStartReasoningEffort
                }
              >
                Save request settings
              </button>
            </div>
          </form>
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
