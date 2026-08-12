import type { ReactNode } from 'react'

export type StatTone = 'neutral' | 'accent' | 'warn' | 'danger'

interface StatCardProps {
  label: string
  value: string
  /** Rendered under the value; keep it to one short clause. */
  note: string
  icon: ReactNode
  tone?: StatTone
  /** True while the number is still being fetched. */
  pending?: boolean
}

export function StatCard({
  label,
  value,
  note,
  icon,
  tone = 'neutral',
  pending = false
}: StatCardProps): React.JSX.Element {
  return (
    <article className="stat">
      <header className="stat__head">
        <span className="stat__label">{label}</span>
        <span className={`stat__icon stat__icon--${tone}`}>{icon}</span>
      </header>
      {pending ? (
        <div className="stat__value stat__value--pending" aria-hidden="true">
          <span className="skeleton skeleton--value" />
        </div>
      ) : (
        <div className={`stat__value numeric stat__value--${tone}`}>{value}</div>
      )}
      <p className="stat__note">{pending ? 'Fetching' : note}</p>
    </article>
  )
}
