import { ArrowClockwise, ArrowSquareOut } from '@phosphor-icons/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { CodexQuotaService } from '../../../shared/codex-quota'
import { trayTitle } from '../../../shared/codex-quota'
import { shell } from '../lib/shell'
import { useAutoSync } from '../lib/use-auto-sync'
import { usePreferences } from '../lib/use-preferences'
import { useWorkbench } from '../lib/use-workbench'
import { AccountCard } from './AccountCard'

interface TrayPanelProps {
  service: CodexQuotaService
}

/**
 * The menu bar deck.
 *
 * This window is never closed, only hidden, which makes it the app's steady
 * reader: it keeps polling while out of sight and feeds the figure next to the
 * menu bar icon. Anything it cannot fit hands off to the workbench window.
 */
export function TrayPanel({ service }: TrayPanelProps): React.JSX.Element {
  const bench = useWorkbench(service)
  const { preferences, update } = usePreferences()
  useAutoSync(bench, preferences.autoSync)
  const [now, setNow] = useState(() => new Date())
  const [index, setIndex] = useState(0)
  const deck = useRef<HTMLDivElement>(null)
  const settled = useRef(false)

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(timer)
  }, [])

  // The workbench window acts on the same files; without this the deck would
  // keep showing the account that was live before the user switched over there.
  useEffect(() => shell.onChanged(() => bench.refreshAll()), [bench.refreshAll])

  const accounts = bench.accounts
  const environment = bench.environment
  const live = accounts.find((account) => account.active === 'yes')

  const status = useMemo(
    () => ({
      title: trayTitle(accounts),
      tooltip: live ? `Codex Quota — ${live.account} in use` : 'Codex Quota — no account in use'
    }),
    [accounts, live]
  )

  useEffect(() => {
    void shell.setTrayStatus(status)
  }, [status])

  const scrollTo = useCallback((target: number) => {
    const element = deck.current
    if (!element) return
    const clamped = Math.max(0, Math.min(target, element.children.length - 1))
    element.scrollTo({ left: clamped * element.clientWidth, behavior: 'smooth' })
  }, [])

  // Open on the account in use, once, rather than on whichever happens to be
  // first in the registry.
  useEffect(() => {
    if (settled.current || accounts.length === 0) return
    settled.current = true
    const position = live ? accounts.indexOf(live) : 0
    if (position > 0) {
      const element = deck.current
      if (element) element.scrollLeft = position * element.clientWidth
      setIndex(position)
    }
  }, [accounts, live])

  const onScroll = (): void => {
    const element = deck.current
    if (!element || element.clientWidth === 0) return
    setIndex(Math.round(element.scrollLeft / element.clientWidth))
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'ArrowRight') scrollTo(index + 1)
    if (event.key === 'ArrowLeft') scrollTo(index - 1)
  }

  const newest = bench.toasts.length > 0 ? bench.toasts[bench.toasts.length - 1] : undefined

  // A toast in a panel this size would cover a card, so the newest one is a
  // single line that clears itself.
  useEffect(() => {
    if (!newest) return
    const timer = setTimeout(() => bench.dismissToast(newest.id), 6_000)
    return () => clearTimeout(timer)
  }, [bench, newest])

  return (
    <div className="panel-shell">
      <header className="panel-shell__head">
        <span className="panel-shell__title">
          {live ? `${live.account} in use` : 'No account in use'}
        </span>
        <span className="panel-shell__tools">
          <button
            type="button"
            className="button button--icon"
            title="Refresh"
            aria-label="Refresh"
            onClick={bench.refreshAll}
          >
            <ArrowClockwise size={13} weight="bold" />
          </button>
          <button
            type="button"
            className="button button--icon"
            title="Open Codex Quota"
            aria-label="Open Codex Quota"
            onClick={() => void shell.openMain()}
          >
            <ArrowSquareOut size={13} weight="bold" />
          </button>
        </span>
      </header>

      {accounts.length === 0 || environment === null ? (
        <div className="panel-shell__empty">
          <p>
            {bench.registryStatus === 'loading' || environment === null
              ? 'Reading accounts…'
              : 'No accounts yet.'}
          </p>
          <button type="button" className="button" onClick={() => void shell.openMain()}>
            Open Codex Quota
          </button>
        </div>
      ) : (
        <>
          <div
            className="deck"
            ref={deck}
            onScroll={onScroll}
            onKeyDown={onKeyDown}
            tabIndex={0}
            role="group"
            aria-label="Accounts"
          >
            {accounts.map((account) => (
              <div className="deck__slide" key={account.account}>
                <AccountCard
                  account={account}
                  environment={environment}
                  job={bench.jobFor(account.account)}
                  now={now}
                  onActivate={(force) => bench.runAction('activate', account.account, { force })}
                  onOpen={() => void shell.openMain(account.account)}
                  onRetryQuota={() => bench.refreshQuota(account.account)}
                />
              </div>
            ))}
          </div>

          <nav className="deck__dots" aria-label="Account">
            {accounts.map((account, position) => (
              <button
                key={account.account}
                type="button"
                className={`deck__dot${position === index ? ' deck__dot--current' : ''}`}
                aria-label={account.account}
                aria-current={position === index}
                onClick={() => scrollTo(position)}
              />
            ))}
          </nav>
        </>
      )}

      {newest ? (
        <button
          type="button"
          className={`panel-shell__toast${newest.ok ? '' : ' panel-shell__toast--bad'}`}
          onClick={() => bench.dismissToast(newest.id)}
        >
          {newest.title}
        </button>
      ) : null}
    </div>
  )
}
