import { expect, test } from 'vitest'

import { findColumnMatches } from '#src/features/table/utils/column-find'
import { exampleBlocks } from '#tests/support/columns'

const keysFound = (query: string) =>
  findColumnMatches(exampleBlocks(), query).map((match) => match.key)

test('a column matches on the title its row draws', () => {
  expect(keysFound('x [mm]')).toEqual(['variable:sample.x'])
})

test("a group matches once on its heading, and its members not on the group's words", () => {
  expect(keysFound('sample')).toEqual(['group:sample'])
})

test('the matches come in list order, whatever the case', () => {
  expect(keysFound('Y')).toEqual([
    'variable:sample.type',
    'variable:sample.y',
    'variable:scan_type',
  ])
})

test('the spaces around a search do not count', () => {
  expect(keysFound('  trains ')).toEqual(['variable:n_trains'])
})

test('an empty search finds nothing', () => {
  expect(keysFound('  ')).toEqual([])
})
