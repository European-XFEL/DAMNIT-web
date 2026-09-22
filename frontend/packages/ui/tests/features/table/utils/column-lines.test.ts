import { expect, test } from 'vitest'

import { leftBorder } from '#src/features/table/utils/column-lines'

// Run pinned, then two ungrouped columns, a two-column XES group and one
// ungrouped column after it.
const columns = [
  { group: undefined },
  { group: undefined },
  { group: undefined },
  { group: 'XES' },
  { group: 'XES' },
  { group: undefined },
]
const runPinned = { columns, pinnedCount: 1 }

test('leaves the row-marker edge without a line', () => {
  expect(leftBorder(0, runPinned)).toBe('none')
})

test("leaves the row marker's outer side without a line", () => {
  expect(leftBorder(-1, runPinned)).toBe('none')
})

test('draws the edge after the rightmost pinned column', () => {
  expect(leftBorder(1, runPinned)).toBe('edge')
})

test('draws an inner line between pinned columns, even from different groups', () => {
  const runAndXesPinned = {
    columns: [{ group: undefined }, { group: 'XES' }, { group: undefined }],
    pinnedCount: 2,
  }

  expect(leftBorder(1, runAndXesPinned)).toBe('inner')
})

test('draws an inner line between two ungrouped columns', () => {
  expect(leftBorder(2, runPinned)).toBe('inner')
})

test('draws the edge where a group starts and where it ends', () => {
  expect(leftBorder(3, runPinned)).toBe('edge')
  expect(leftBorder(5, runPinned)).toBe('edge')
})

test('draws an inner line inside a group', () => {
  expect(leftBorder(4, runPinned)).toBe('inner')
})

test('draws the edge after the last column, grouped or not', () => {
  const lastGrouped = columns.slice(0, 5)

  expect(leftBorder(columns.length, runPinned)).toBe('edge')
  expect(
    leftBorder(lastGrouped.length, { columns: lastGrouped, pinnedCount: 1 })
  ).toBe('edge')
})

test('draws only the pinned edge and the last edge on an ungrouped proposal', () => {
  const ungrouped = { columns: columns.map(() => ({})), pinnedCount: 1 }
  const edges = [...columns.keys(), columns.length].filter(
    (col) => leftBorder(col, ungrouped) === 'edge'
  )

  expect(edges).toEqual([1, columns.length])
})

test('treats a column with an empty group name as ungrouped', () => {
  const mixed = [{ group: undefined }, { group: '' }, { group: undefined }]

  expect(leftBorder(2, { columns: mixed, pinnedCount: 1 })).toBe('inner')
})
