import { describe, it, expect } from 'vitest'
import {
  formatContextValue,
  formatFiredAt,
  formatSelectedInput,
  formatTrendValue,
  isMissingContextValueError,
  defaultReviewNote,
  statusColor,
  statusLabel,
} from '../format'

describe('formatFiredAt', () => {
  it('returns dash for empty string', () => {
    expect(formatFiredAt('')).toBe('-')
  })

  it('returns original string for unparseable input', () => {
    expect(formatFiredAt('not-a-date')).toBe('not-a-date')
  })

  it('formats a valid ISO timestamp to a locale string', () => {
    const result = formatFiredAt('2026-05-15T14:30:00Z')
    expect(result).toBeTruthy()
    expect(result).not.toBe('-')
    expect(result).not.toBe('2026-05-15T14:30:00Z')
  })
})

describe('formatContextValue', () => {
  it('returns dash for null', () => {
    expect(formatContextValue(null)).toBe('-')
  })

  it('returns dash for undefined', () => {
    expect(formatContextValue(undefined)).toBe('-')
  })

  it('formats integers as plain strings', () => {
    expect(formatContextValue(42)).toBe('42')
  })

  it('formats floats with toPrecision(5)', () => {
    expect(formatContextValue(3.14159265)).toBe('3.1416')
  })

  it('formats strings as-is', () => {
    expect(formatContextValue('hello')).toBe('hello')
  })

  it('formats booleans via String()', () => {
    expect(formatContextValue(true)).toBe('true')
    expect(formatContextValue(false)).toBe('false')
  })

  it('JSON-serializes objects', () => {
    expect(formatContextValue({ a: 1 })).toBe('{"a":1}')
  })
})

describe('formatSelectedInput', () => {
  it('strips metadata: prefix into dot notation', () => {
    expect(formatSelectedInput('metadata:laser_energy_j')).toBe(
      'metadata.laser_energy_j'
    )
  })

  it('strips hdf5: prefix into bracket notation', () => {
    expect(formatSelectedInput('hdf5:spectrum')).toBe('hdf5[spectrum]')
  })

  it('strips mongo: prefix into dot notation', () => {
    expect(formatSelectedInput('mongo:shots')).toBe('mongo.shots')
  })

  it('returns unknown prefixes unchanged', () => {
    expect(formatSelectedInput('unknown:value')).toBe('unknown:value')
  })
})

describe('isMissingContextValueError', () => {
  it('matches "no " prefix', () => {
    expect(isMissingContextValueError('No data found')).toBe(true)
  })

  it('matches "missing " substring', () => {
    expect(isMissingContextValueError('Value missing in record')).toBe(true)
  })

  it('matches "not found" substring', () => {
    expect(isMissingContextValueError('Dataset not found')).toBe(true)
  })

  it('returns false for unrelated errors', () => {
    expect(isMissingContextValueError('Type error: expected number')).toBe(
      false
    )
  })
})

describe('formatTrendValue', () => {
  it('uses exponential for large numbers', () => {
    expect(formatTrendValue(12345)).toMatch(/e/)
  })

  it('uses exponential for very small non-zero numbers', () => {
    expect(formatTrendValue(0.00005)).toMatch(/e/)
  })

  it('formats zero as "0"', () => {
    expect(formatTrendValue(0)).toBe('0')
  })

  it('formats plain integers as strings', () => {
    expect(formatTrendValue(42)).toBe('42')
  })

  it('formats moderate floats with toPrecision(4)', () => {
    expect(formatTrendValue(3.14159)).toBe('3.142')
  })
})

describe('statusColor', () => {
  it('maps processed → teal', () =>
    expect(statusColor('processed')).toBe('teal'))
  it('maps needs-review → yellow', () =>
    expect(statusColor('needs-review')).toBe('yellow'))
  it('maps revision-needed → red', () =>
    expect(statusColor('revision-needed')).toBe('red'))
  it('falls back to gray for unknown', () =>
    expect(statusColor('unknown')).toBe('gray'))
})

describe('statusLabel', () => {
  it('maps processed', () => expect(statusLabel('processed')).toBe('Processed'))
  it('maps needs-review', () =>
    expect(statusLabel('needs-review')).toBe('Needs review'))
  it('maps revision-needed', () =>
    expect(statusLabel('revision-needed')).toBe('Needs revision'))
  it('returns the raw value for unknown statuses', () =>
    expect(statusLabel('custom')).toBe('custom'))
  it('returns Unknown for empty string', () =>
    expect(statusLabel('')).toBe('Unknown'))
})

describe('defaultReviewNote', () => {
  it('returns accepted note for processed', () =>
    expect(defaultReviewNote('processed')).toBe('Reviewed and accepted'))
  it('returns revision note for revision-needed', () =>
    expect(defaultReviewNote('revision-needed')).toBe(
      'Processed data needs revision'
    ))
  it('returns manual review note as default', () =>
    expect(defaultReviewNote('needs-review')).toBe('Needs manual review'))
})
