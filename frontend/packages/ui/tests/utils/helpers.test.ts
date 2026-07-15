import { describe, expect, test } from 'vitest'

import {
  formatDate,
  formatNumber,
  formatRunsSubtitle,
  formatUrl,
} from '#src/utils/helpers'

describe('formatNumber', () => {
  test('passes integers through unchanged', () => {
    expect(formatNumber(42)).toBe(42)
  })

  test('rounds a float to two decimals', () => {
    expect(formatNumber(3.14159)).toBe(3.14)
  })

  test('keeps more decimals for small magnitudes (adaptive precision)', () => {
    expect(formatNumber(0.001234)).toBe(0.00123)
  })
})

describe('formatDate', () => {
  test('formats as "HH:mm:ss | DD MMMM YYYY" in UTC', () => {
    const timestamp = Date.UTC(2023, 5, 9, 8, 5, 3)
    expect(formatDate(timestamp)).toBe('08:05:03 | 09 June 2023')
  })
})

describe('formatRunsSubtitle', () => {
  test('returns an empty string for no runs', () => {
    expect(formatRunsSubtitle([])).toBe('')
  })

  test('shows a single run', () => {
    expect(formatRunsSubtitle(['5'])).toBe('(run 5)')
  })

  test('shows the first and last run as a range', () => {
    expect(formatRunsSubtitle(['5', '6', '7', '8', '9'])).toBe('(run 5-9)')
  })
})

describe('formatUrl', () => {
  test('turns an empty string into a root slash', () => {
    expect(formatUrl('')).toBe('/')
  })

  test('appends a trailing slash', () => {
    expect(formatUrl('x')).toBe('x/')
  })

  test('leaves an existing trailing slash intact', () => {
    expect(formatUrl('x/')).toBe('x/')
  })
})
