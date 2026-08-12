import type { ReactNode } from 'react'

interface PanelProps {
  title: string
  subtitle?: string
  aside?: ReactNode
  children: ReactNode
  span?: 'wide' | 'normal'
}

export function Panel({ title, subtitle, aside, children, span = 'normal' }: PanelProps): React.JSX.Element {
  return (
    <section className={`panel${span === 'wide' ? ' panel--wide' : ''}`}>
      <header className="panel__head">
        <div className="panel__heading">
          <h2 className="panel__title">{title}</h2>
          {subtitle ? <span className="panel__subtitle">{subtitle}</span> : null}
        </div>
        {aside ? <div className="panel__aside">{aside}</div> : null}
      </header>
      <div className="panel__body">{children}</div>
    </section>
  )
}
