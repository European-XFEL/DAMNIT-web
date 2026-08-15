import { expect, test } from 'vitest'

import { countPinnedColumns } from '#src/features/table/utils/pinned-columns'

// The table's columns in metadata order, which always leads with the identity
// columns the server puts first.
const columns = (...ids: string[]) => ids.map((id) => ({ id }))

test('pins run alone while the proposal column is hidden', () => {
  const shown = columns('run', 'start_time', 'n_trains')

  expect(countPinnedColumns(shown)).toBe(1)
})

test('pins the proposal column too once it is shown', () => {
  const shown = columns('proposal', 'run', 'start_time', 'n_trains')

  expect(countPinnedColumns(shown)).toBe(2)
})

test('pins every column when the table has nothing but identity columns', () => {
  const shown = columns('proposal', 'run')

  expect(countPinnedColumns(shown)).toBe(2)
})
