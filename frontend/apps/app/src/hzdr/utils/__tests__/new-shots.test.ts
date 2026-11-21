import { afterEach, describe, expect, it } from 'vitest'

import type { HZDRShot } from '../../types'
import { isNewShot, readLastSeenShot, rememberLastSeenShot } from '../new-shots'

const shot = (fired_at: string) =>
  ({ source_key: 'c', shot_number: 1, fired_at }) as HZDRShot

afterEach(() => window.localStorage.clear())

describe('new shots since the last visit', () => {
  it('marks nothing new on a first visit', () => {
    expect(readLastSeenShot('c')).toBeNull()
    expect(isNewShot(shot('2026-11-21T10:00:00Z'), null)).toBe(false)
  })

  it('remembers the newest shot and marks only later ones', () => {
    rememberLastSeenShot('c', [
      shot('2026-11-21T09:00:00Z'),
      shot('2026-11-21T10:00:00Z'),
      shot('not a time'),
    ])
    const seen = readLastSeenShot('c')
    expect(seen).toBe(Date.parse('2026-11-21T10:00:00Z'))
    expect(isNewShot(shot('2026-11-21T10:00:00Z'), seen)).toBe(false)
    expect(isNewShot(shot('2026-11-21T10:04:00Z'), seen)).toBe(true)
    expect(isNewShot(shot(''), seen)).toBe(false)
  })

  it('never moves the mark back, and keeps campaigns apart', () => {
    rememberLastSeenShot('c', [shot('2026-11-21T10:00:00Z')])
    rememberLastSeenShot('c', [shot('2026-11-20T10:00:00Z')])
    expect(readLastSeenShot('c')).toBe(Date.parse('2026-11-21T10:00:00Z'))
    expect(readLastSeenShot('other')).toBeNull()
  })
})
