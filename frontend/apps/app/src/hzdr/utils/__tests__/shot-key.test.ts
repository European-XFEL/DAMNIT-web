import { describe, it, expect } from 'vitest'

import { formatShotLabel, getShotRowKey, toTrendValue } from '../shot-key'
import type { HZDRShot } from '../../types'

function makeShot(overrides: Partial<HZDRShot> = {}): HZDRShot {
  return {
    source_key: 'radbio',
    shot_number: 1,
    fired_at: '2026-04-21T09:04:53Z',
    metadata: {},
    events: [],
    data_products: [],
    ...overrides,
  }
}

describe('getShotRowKey', () => {
  it('uses the catalog shot_key when present', () => {
    expect(
      getShotRowKey(makeShot({ shot_key: 'radbio:20260421:000001' }))
    ).toBe('radbio:20260421:000001')
  })

  it('tells the same shot number on two days apart without a shot_key', () => {
    const first = makeShot({ fired_at: '2026-04-21T09:04:53Z' })
    const second = makeShot({ fired_at: '2026-04-28T10:31:57Z' })
    expect(getShotRowKey(first)).not.toBe(getShotRowKey(second))
  })
})

describe('formatShotLabel', () => {
  it('shows the day beside the number', () => {
    expect(formatShotLabel(makeShot({ shot_date: '2026-04-28' }))).toBe(
      '1 · 2026-04-28'
    )
  })

  it('falls back to the fired_at day, then the number alone', () => {
    expect(formatShotLabel(makeShot())).toBe('1 · 2026-04-21')
    expect(formatShotLabel(makeShot({ fired_at: '' }))).toBe('1')
  })
})

describe('toTrendValue', () => {
  it('carries the row key and label with the value', () => {
    const shot = makeShot({ shot_key: 'k1', shot_date: '2026-04-21' })
    expect(toTrendValue(shot, 12.25)).toEqual({
      shotNumber: 1,
      value: 12.25,
      rowKey: 'k1',
      label: '1 · 2026-04-21',
    })
  })
})
