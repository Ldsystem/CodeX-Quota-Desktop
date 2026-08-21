/**
 * Credential refresh and reconciliation touch several files that represent one
 * logical state. Keep those operations ordered inside this process so the panel
 * and workbench cannot observe or produce competing partial transitions.
 */

const tails = new Map<string, Promise<void>>()

export async function withCredentialStateLock<T>(
  key: string,
  operation: () => Promise<T>
): Promise<T> {
  const previous = tails.get(key) ?? Promise.resolve()
  let release = (): void => undefined
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const tail = previous.catch(() => undefined).then(() => gate)
  tails.set(key, tail)

  await previous.catch(() => undefined)
  try {
    return await operation()
  } finally {
    release()
    if (tails.get(key) === tail) tails.delete(key)
  }
}
