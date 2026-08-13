import { useMemo } from 'react'

import type { TokenUsage } from '../../../shared/codex-quota'
import { formatTokens } from '../lib/format'

interface TokenActivityProps {
  usage: TokenUsage
  /** Weeks to render, counted back from the current week. */
  weeks?: number
}

const DAY_MS = 86_400_000
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * A year of daily token spend, one column per week. Days with no record and
 * days before the account existed both render as empty cells; only the
 * intensity of a real record carries meaning.
 */
export function TokenActivity({ usage, weeks = 52 }: TokenActivityProps): React.JSX.Element {
  const { cells, monthLabels, peak } = useMemo(() => buildGrid(usage, weeks), [usage, weeks])

  return (
    <div className="activity">
      {/* The column count drives the layout, so the grid is told how many weeks
          it is drawing rather than inferring it from a cell size. */}
      <div className="activity__scroll" style={{ '--weeks': weeks } as React.CSSProperties}>
        <div className="activity__grid" role="img" aria-label={activityLabel(usage)}>
          {cells.map((cell) => (
            <span
              key={cell.key}
              className={`activity__cell activity__cell--${cell.level}`}
              title={
                cell.tokens === null ? undefined : `${cell.date}: ${formatTokens(cell.tokens)} tokens`
              }
            />
          ))}
        </div>

        <div className="activity__months" aria-hidden="true">
          {monthLabels.map((label) => (
            <span key={label.key} className="activity__month" style={{ gridColumn: label.column }}>
              {label.text}
            </span>
          ))}
        </div>
      </div>

      <div className="activity__legend">
        <span>Busiest day {formatTokens(peak)}</span>
        <span className="activity__scale">
          Less
          <span className="activity__cell activity__cell--0" />
          <span className="activity__cell activity__cell--1" />
          <span className="activity__cell activity__cell--2" />
          <span className="activity__cell activity__cell--3" />
          <span className="activity__cell activity__cell--4" />
          More
        </span>
      </div>
    </div>
  )
}

interface Cell {
  key: string
  date: string
  tokens: number | null
  level: 0 | 1 | 2 | 3 | 4
}

function buildGrid(
  usage: TokenUsage,
  weeks: number
): { cells: Cell[]; monthLabels: Array<{ key: string; column: number; text: string }>; peak: number } {
  const byDate = new Map(usage.daily.map((entry) => [entry.date, entry.tokens]))
  const peak = usage.daily.reduce((max, entry) => Math.max(max, entry.tokens), 0)

  // Anchor on the end of the current week so the last column is "this week".
  const end = startOfDay(new Date())
  end.setDate(end.getDate() + (6 - end.getDay()))
  const start = new Date(end.getTime() - (weeks * 7 - 1) * DAY_MS)

  const cells: Cell[] = []
  const monthLabels: Array<{ key: string; column: number; text: string }> = []
  let lastMonth = -1

  for (let week = 0; week < weeks; week += 1) {
    for (let day = 0; day < 7; day += 1) {
      const date = new Date(start.getTime() + (week * 7 + day) * DAY_MS)
      const key = isoDate(date)
      const tokens = byDate.get(key) ?? null
      cells.push({ key, date: key, tokens, level: levelFor(tokens, peak) })

      if (day === 0 && date.getMonth() !== lastMonth) {
        lastMonth = date.getMonth()
        monthLabels.push({ key, column: week + 1, text: MONTHS[date.getMonth()]! })
      }
    }
  }

  return { cells, monthLabels, peak }
}

function levelFor(tokens: number | null, peak: number): 0 | 1 | 2 | 3 | 4 {
  if (tokens === null || tokens <= 0 || peak <= 0) return 0
  const share = tokens / peak
  if (share > 0.66) return 4
  if (share > 0.4) return 3
  if (share > 0.18) return 2
  return 1
}

function activityLabel(usage: TokenUsage): string {
  return `Daily token activity. ${formatTokens(usage.lifetimeTokens)} tokens in total across ${usage.daily.length} active days.`
}

function startOfDay(value: Date): Date {
  const copy = new Date(value)
  copy.setHours(0, 0, 0, 0)
  return copy
}

function isoDate(value: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
}
