import { expect, test } from 'vitest'

import type { TableColumn } from '#src/features/table/types/table.types'
import { changedWidths } from '#src/features/table/utils/column-widths'

const COLUMNS: TableColumn[] = [
  { id: 'run', title: 'Run' },
  { id: 'n_trains', title: 'n_trains' },
  { id: 'xgm_intensity', title: 'XGM / intensity', group: 'XGM' },
  { id: 'xgm_energy', title: 'XGM / energy', group: 'XGM' },
]

test('a fit that lands a column on the default width does not name it', () => {
  const changed = changedWidths({
    columns: COLUMNS,
    before: { run: 140 },
    after: { run: 140, n_trains: 100 },
  })

  expect(changed).toEqual({ columns: [], groups: [] })
})

test('a column with no stored width is read as being at the default', () => {
  const changed = changedWidths({
    columns: COLUMNS,
    before: { n_trains: 100 },
    after: {},
  })

  expect(changed.columns).toEqual([])
})

test('a column the table is not showing is never named', () => {
  const changed = changedWidths({
    columns: COLUMNS,
    before: { hidden_variable: 300 },
    after: {},
  })

  expect(changed.columns).toEqual([])
})

test('a group whose every shown member changed is named beside its columns', () => {
  const changed = changedWidths({
    columns: COLUMNS,
    before: {},
    after: { xgm_intensity: 180, xgm_energy: 90 },
  })

  expect(changed).toEqual({
    columns: ['xgm_intensity', 'xgm_energy'],
    groups: ['XGM'],
  })
})

test('a group with a member left alone names only the members that changed', () => {
  const changed = changedWidths({
    columns: COLUMNS,
    before: {},
    after: { xgm_intensity: 180 },
  })

  expect(changed).toEqual({ columns: ['xgm_intensity'], groups: [] })
})

test('a reset names every column the user had resized', () => {
  const changed = changedWidths({
    columns: COLUMNS,
    before: { run: 140, xgm_intensity: 180 },
    after: {},
  })

  expect(changed.columns).toEqual(['run', 'xgm_intensity'])
})
