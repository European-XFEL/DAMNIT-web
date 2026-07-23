import { expect, test } from 'vitest'

import reducer, { updateTable } from '#src/data/table/table-data.slice'
import type { CellValue, TableData } from '#src/data/table/table-data.types'

const initial = reducer(undefined, { type: '@@INIT' })

const spectrum = (value: CellValue): TableData => ({
  '1': { spectrum: { value, dtype: 'array' } },
})

// What the deferred pass delivers, and what a later lightweight pass sends for
// the same cell: a null with no error, meaning the server held the value back.
const filled = spectrum([1, 2, 3])
const heldBack = spectrum(null)

test('a live push marks its runs as just updated', () => {
  const state = reducer(initial, updateTable({ data: filled, live: true }))

  expect(state.lastUpdate['1']).toEqual(expect.any(Number))
})

test('a page load does not mark its runs as just updated', () => {
  // Only a push is news. Stamping a bulk load would flash the grid's
  // live-update highlight over every row the table happens to load.
  const state = reducer(initial, updateTable({ data: filled }))

  expect(state.lastUpdate).toEqual({})
})

test('a bulk load does not undo a value already filled in', () => {
  const loaded = reducer(initial, updateTable({ data: filled }))

  const state = reducer(loaded, updateTable({ data: heldBack }))

  expect(state.data['1'].spectrum.value).toEqual([1, 2, 3])
})

test('a live push can clear a value', () => {
  // A push carries what the server really holds, so its nulls are the truth
  // rather than a value being held back for a second fetch.
  const loaded = reducer(initial, updateTable({ data: filled }))

  const state = reducer(loaded, updateTable({ data: heldBack, live: true }))

  expect(state.data['1'].spectrum.value).toBeNull()
})

test('a held-back value still lands on a cell that has none yet', () => {
  // The grid draws a null as a loading skeleton, which is what tells the user
  // the deferred pass is still fetching that cell.
  const state = reducer(initial, updateTable({ data: heldBack }))

  expect(state.data['1'].spectrum.value).toBeNull()
})

test('an errored value replaces one already filled in', () => {
  // A blank carrying an error is a real result, not a value held back.
  const error = { cls: 'ValueError', message: 'boom' }
  const loaded = reducer(initial, updateTable({ data: filled }))

  const errored: TableData = {
    '1': { spectrum: { ...spectrum(null)['1'].spectrum, error } },
  }
  const state = reducer(loaded, updateTable({ data: errored }))

  expect(state.data['1'].spectrum).toEqual({
    value: null,
    dtype: 'array',
    error,
  })
})

test('runs arriving as numbers become the strings the table keys rows by', () => {
  // The subscription and the metadata query both send runs as numbers, while
  // the table keys its rows by string. Coercing here is what keeps a plot's
  // run list comparable with this one.
  const state = reducer(
    initial,
    updateTable({ data: {}, metadata: { runs: [1, 2, 3] }, live: true })
  )

  expect(state.metadata.runs).toEqual(['1', '2', '3'])
})

test('a metadata push keeps the fields it does not send', () => {
  // A push resends runs and variables but never tags, so replacing wholesale
  // would drop them and break the tag-driven column visibility.
  const tags = { 1: { id: 1, name: 'xpcs', variables: ['spectrum'] } }
  const seeded = reducer(initial, updateTable({ data: {}, metadata: { tags } }))

  const state = reducer(
    seeded,
    updateTable({ data: {}, metadata: { runs: [1] }, live: true })
  )

  expect(state.metadata.tags).toEqual(tags)
})
