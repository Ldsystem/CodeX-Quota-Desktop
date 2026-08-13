/**
 * Whether this window is on screen. Work done for a window nobody can see is
 * work the panel is already doing on everyone's behalf.
 */

import { useEffect, useState } from 'react'

export function useVisible(): boolean {
  const [visible, setVisible] = useState(() => document.visibilityState === 'visible')

  useEffect(() => {
    const read = (): void => setVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', read)
    return () => document.removeEventListener('visibilitychange', read)
  }, [])

  return visible
}
