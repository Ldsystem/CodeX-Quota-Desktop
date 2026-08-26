import { ArrowClockwise } from '@phosphor-icons/react'

import type { QuotaState, QuotaWindow } from '../../../shared/codex-quota'
import {
  describeWindow,
  formatCountdown,
  formatPercent,
  formatResetAt,
  percentLeft,
  quotaLevel
} from '../lib/format'

interface QuotaMeterProps {
  state: QuotaState
  now: Date
  /** Uses the fixed menu-panel rail: short label, exact reset, percent, then track. */
  compact?: boolean
  /** Defaults to the window length the API reported once it is known. */
  label?: string
  /** Offered when the fetch failed; omit to render the failure read-only. */
  onRetry?: () => void
}

/** One aligned rail per reported limit; normally 5-hour above weekly. */
export function QuotaMeter({
  state,
  now,
  compact = false,
  label = 'Quota',
  onRetry
}: QuotaMeterProps): React.JSX.Element {
  if (state.status === 'loading' || state.status === 'idle') {
    const pending = state.status === 'loading'
    return (
      <div className="meter">
        <span className="meter__label">{label}</span>
        <div className={`meter__track${pending ? ' meter__track--pending' : ''}`}>
          <div className="meter__fill meter__fill--unknown" />
        </div>
        <div className="meter__readout">
          <span className="meter__value meter__value--unknown numeric">--</span>
          <span className="meter__reset">{pending ? 'fetching usage' : 'not fetched yet'}</span>
        </div>
      </div>
    )
  }

  if (state.status === 'failed') {
    return (
      <div className="meter">
        <span className="meter__label">{label}</span>
        <div className="meter__track meter__track--failed">
          <div className="meter__fill meter__fill--unknown" />
        </div>
        <div className="meter__readout">
          <span className="meter__value meter__value--critical numeric">--</span>
          {onRetry ? (
            <button
              type="button"
              className="link-button"
              onClick={(event) => {
                event.stopPropagation()
                onRetry()
              }}
            >
              <ArrowClockwise size={12} weight="bold" />
              retry usage
            </button>
          ) : (
            <span className="meter__reset">usage unavailable</span>
          )}
        </div>
      </div>
    )
  }

  if (state.report.windows.length === 0) {
    return (
      <div className="meter">
        <span className="meter__label">{label}</span>
        <div className="meter__track"><div className="meter__fill meter__fill--unknown" /></div>
        <div className="meter__readout">
          <span className="meter__value meter__value--unknown numeric">--</span>
          <span className="meter__reset">usage unavailable</span>
        </div>
      </div>
    )
  }

  return (
    <div className="quota-rails">
      {state.report.windows.map((window, index) => (
        <QuotaRail
          key={`${window.limitWindowSeconds ?? 'unknown'}-${index}`}
          window={window}
          now={now}
          compact={compact}
        />
      ))}
    </div>
  )
}

function QuotaRail({
  window,
  now,
  compact
}: {
  window: QuotaWindow
  now: Date
  compact: boolean
}): React.JSX.Element {
  const left = percentLeft(window)
  const level = quotaLevel(left)
  const reset = formatResetAt(window.resetAt, now)
  const countdown = formatCountdown(window.resetAt, now)
  const windowLabel = describeWindow(window.limitWindowSeconds)
  const visibleLabel = compact && windowLabel === '5-hour' ? '5h' : windowLabel

  return (
    <div className={`meter${compact ? ' meter--compact' : ''}`}>
      <span className="meter__label">{visibleLabel}</span>
      <div
        className="meter__track"
        role="progressbar"
        aria-label={`${windowLabel} quota remaining`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={left ?? undefined}
        aria-valuetext={left === null ? 'Unknown' : `${left}% left`}
      >
        <div
          className={`meter__fill meter__fill--${level}`}
          style={left === null ? undefined : { width: `${left}%` }}
        />
      </div>
      {compact ? (
        <>
          <span className="meter__reset">
            {window.resetAt === null ? 'Not started' : `Reset · ${reset}`}
          </span>
          <span className={`meter__value numeric meter__value--${level}`}>
            {formatPercent(left)}
            {left !== null ? <span className="visually-hidden"> remaining</span> : null}
          </span>
        </>
      ) : (
        <div className="meter__readout">
          <span className={`meter__value numeric meter__value--${level}`}>
            {formatPercent(left)}
            {left !== null ? <span className="visually-hidden"> remaining</span> : null}
          </span>
          <span className="meter__reset">
            {window.resetAt === null ? (
              'window not started'
            ) : (
              <>
                resets {reset}
                {countdown ? <span className="meter__countdown">, {countdown}</span> : null}
              </>
            )}
          </span>
        </div>
      )}
    </div>
  )
}
