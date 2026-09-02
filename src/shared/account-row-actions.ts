/**
 * Landing-row nested controls live beside the identity button. Activation of
 * those controls must not open account detail.
 */

export interface ClosestTarget {
  closest(selector: string): unknown
}

export function isAccountRowActionTarget(target: ClosestTarget | EventTarget | null): boolean {
  if (target === null || typeof (target as ClosestTarget).closest !== 'function') return false
  return (target as ClosestTarget).closest('[data-account-action]') != null
}
