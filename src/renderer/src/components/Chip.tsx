import type { ReactNode } from 'react'

export type ChipTone = 'neutral' | 'accent' | 'warn' | 'danger'

interface ChipProps {
  tone?: ChipTone
  icon?: ReactNode
  children: ReactNode
}

export function Chip({ tone = 'neutral', icon, children }: ChipProps): React.JSX.Element {
  return (
    <span className={`chip chip--${tone}`}>
      {icon ? <span className="chip__icon">{icon}</span> : null}
      {children}
    </span>
  )
}
