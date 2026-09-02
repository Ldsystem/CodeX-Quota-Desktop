import { describe, expect, it } from 'vitest'

import { isAccountRowActionTarget } from '../account-row-actions'

function target(closestTo: string | null): { closest(selector: string): unknown } {
  return {
    closest(selector: string) {
      return selector === closestTo ? { matched: true } : null
    }
  }
}

describe('isAccountRowActionTarget', () => {
  it('treats nested action controls as not opening the row', () => {
    expect(isAccountRowActionTarget(target('[data-account-action]'))).toBe(true)
  })

  it('treats the rest of the row as open-account', () => {
    expect(isAccountRowActionTarget(target(null))).toBe(false)
    expect(isAccountRowActionTarget(null)).toBe(false)
  })
})
