import { describe, it, expect } from 'vitest'
import {
  valueMatchesTableFilter,
  compareTableValues,
  getShotDateKey,
  buildShotDayLabels,
  isScalarContextValue,
  shotMatchesTableFilter,
} from '../filter'
import type { HZDRShot } from '../../types'

function makeShot(overrides: Partial<HZDRShot> = {}): HZDRShot {
  return {
    source_key: 'test-source',
    shot_number: 1,
    fired_at: '2026-05-01T10:00:00Z',
    metadata: {},
    events: [],
    data_products: [],
    ...overrides,
  }
}

describe('valueMatchesTableFilter', () => {
  describe('includes operator', () => {
    it('matches substring case-insensitively', () => {
      expect(valueMatchesTableFilter('Hello World', 'includes', 'world')).toBe(
        true
      )
    })

    it('returns false when substring not found', () => {
      expect(valueMatchesTableFilter('Hello', 'includes', 'xyz')).toBe(false)
    })

    it('returns false for null', () => {
      expect(valueMatchesTableFilter(null, 'includes', 'x')).toBe(false)
    })
  })

  describe('equals operator', () => {
    it('compares numbers numerically', () => {
      expect(valueMatchesTableFilter(42, 'equals', '42')).toBe(true)
      expect(valueMatchesTableFilter(42, 'equals', '43')).toBe(false)
    })

    it('compares strings case-insensitively when not numeric', () => {
      expect(valueMatchesTableFilter('Hello', 'equals', 'hello')).toBe(true)
    })
  })

  describe('numeric comparison operators', () => {
    it('gt: returns true when value > filter', () => {
      expect(valueMatchesTableFilter(10, 'gt', '5')).toBe(true)
      expect(valueMatchesTableFilter(3, 'gt', '5')).toBe(false)
    })

    it('gte: returns true when value >= filter', () => {
      expect(valueMatchesTableFilter(5, 'gte', '5')).toBe(true)
      expect(valueMatchesTableFilter(4, 'gte', '5')).toBe(false)
    })

    it('lt: returns true when value < filter', () => {
      expect(valueMatchesTableFilter(3, 'lt', '5')).toBe(true)
    })

    it('lte: returns true when value <= filter', () => {
      expect(valueMatchesTableFilter(5, 'lte', '5')).toBe(true)
    })

    it('returns false for non-numeric values on comparison operators', () => {
      expect(valueMatchesTableFilter('hello', 'gt', '5')).toBe(false)
    })
  })
})

describe('compareTableValues', () => {
  it('sorts numbers numerically', () => {
    expect(compareTableValues(1, 2)).toBeLessThan(0)
    expect(compareTableValues(2, 1)).toBeGreaterThan(0)
    expect(compareTableValues(1, 1)).toBe(0)
  })

  it('places nulls at the end (returns positive when left is null)', () => {
    expect(compareTableValues(null, 5)).toBeGreaterThan(0)
    expect(compareTableValues(5, null)).toBeLessThan(0)
    expect(compareTableValues(null, null)).toBe(0)
  })

  it('compares ISO date strings chronologically', () => {
    expect(
      compareTableValues('2026-01-01T00:00:00Z', '2026-06-01T00:00:00Z')
    ).toBeLessThan(0)
  })

  it('falls back to locale string compare for non-numeric non-date values', () => {
    expect(compareTableValues('apple', 'banana')).toBeLessThan(0)
  })
})

describe('getShotDateKey', () => {
  it('extracts the date from an ISO timestamp', () => {
    expect(getShotDateKey('2026-05-15T10:30:00Z')).toBe('2026-05-15')
  })

  it('returns undefined for empty string', () => {
    expect(getShotDateKey('')).toBeUndefined()
  })

  it('returns undefined for unparseable strings', () => {
    expect(getShotDateKey('not-a-date')).toBeUndefined()
  })
})

describe('buildShotDayLabels', () => {
  it('assigns sequential day labels per unique date', () => {
    const shots = [
      makeShot({ shot_number: 1, fired_at: '2026-05-01T10:00:00Z' }),
      makeShot({ shot_number: 2, fired_at: '2026-05-01T11:00:00Z' }),
      makeShot({ shot_number: 3, fired_at: '2026-05-02T09:00:00Z' }),
    ]
    const labels = buildShotDayLabels(shots)
    expect(labels.get(1)).toBe('Day 1')
    expect(labels.get(2)).toBe('Day 1')
    expect(labels.get(3)).toBe('Day 2')
  })

  it('returns dash for shots with missing fired_at', () => {
    const shots = [makeShot({ shot_number: 1, fired_at: '' })]
    const labels = buildShotDayLabels(shots)
    expect(labels.get(1)).toBe('-')
  })
})

describe('isScalarContextValue', () => {
  it('returns true for finite numbers with no preview', () => {
    expect(isScalarContextValue(3.14, undefined)).toBe(true)
  })

  it('returns false when preview is present', () => {
    expect(isScalarContextValue(3.14, { kind: 'line' })).toBe(false)
  })

  it('returns false for non-numeric values', () => {
    expect(isScalarContextValue('text', undefined)).toBe(false)
  })

  it('returns false for non-finite numbers', () => {
    expect(isScalarContextValue(Infinity, undefined)).toBe(false)
    expect(isScalarContextValue(NaN, undefined)).toBe(false)
  })
})

describe('shotMatchesTableFilter', () => {
  it('returns true when filter is empty', () => {
    expect(shotMatchesTableFilter(makeShot(), 'all', 'includes', '  ')).toBe(
      true
    )
  })

  it('matches shot_number via all-column filter', () => {
    const shot = makeShot({ shot_number: 42 })
    expect(shotMatchesTableFilter(shot, 'all', 'includes', '42')).toBe(true)
  })

  it('does not match when value not found', () => {
    const shot = makeShot({ shot_number: 42 })
    expect(shotMatchesTableFilter(shot, 'all', 'includes', 'xyz')).toBe(false)
  })

  it('matches metadata.status via specific column filter', () => {
    const shot = makeShot({ metadata: { status: 'processed' } })
    expect(shotMatchesTableFilter(shot, 'status', 'equals', 'processed')).toBe(
      true
    )
  })
})
