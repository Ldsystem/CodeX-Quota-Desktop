import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { ToastStack } from '../ToastStack'

describe('success notification response', () => {
  it('renders the model response in a dedicated code block', () => {
    const html = renderToStaticMarkup(
      <ToastStack
        toasts={[
          {
            id: 1,
            ok: true,
            title: 'Started the quota window',
            detail: 'One request was billed.',
            response: 'ok'
          }
        ]}
        onDismiss={() => undefined}
      />
    )

    expect(html).toContain('toast__response')
    expect(html).toContain('<code>ok</code>')
  })

  it('does not show a response block on an unsuccessful notification', () => {
    const html = renderToStaticMarkup(
      <ToastStack
        toasts={[
          {
            id: 2,
            ok: false,
            title: 'Could not start the quota window',
            response: 'not a successful response'
          }
        ]}
        onDismiss={() => undefined}
      />
    )

    expect(html).not.toContain('toast__response')
  })
})
