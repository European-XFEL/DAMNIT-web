import { expect, test } from 'vitest'

import { errorKind } from '#src/utils/cell-errors'

test('a Skip reads as a skipped dependency', () => {
  expect(errorKind('Skip')).toBe('skipped')
})

test('a SourceNameError reads as missing data', () => {
  expect(errorKind('SourceNameError')).toBe('missing')
})

test('any other exception reads as an error', () => {
  expect(errorKind('ValueError')).toBe('error')
})
