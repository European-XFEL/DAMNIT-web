import { expect, test } from 'vitest'
import {
  CompactSelection,
  type GridSelection,
} from '@glideapps/glide-data-grid'

import { runSelectionChange } from '#src/features/table/utils/grid-selection'

const RUNS = [
  { proposal: '2956', run: 1 },
  { proposal: '2956', run: 2 },
]

const selection = ({
  columns = [] as number[],
  rows = [] as number[],
  cell = undefined as [number, number] | undefined,
} = {}): GridSelection => ({
  columns: columns.reduce(
    (selected, index) => selected.add(index),
    CompactSelection.empty()
  ),
  rows: rows.reduce(
    (selected, index) => selected.add(index),
    CompactSelection.empty()
  ),
  current: cell && {
    cell,
    range: { x: cell[0], y: cell[1], width: 1, height: 1 },
    rangeStack: [],
  },
})

const byPointer = ({ onHeader = false } = {}) => ({
  runs: RUNS,
  keyPressed: false,
  pointerOnHeader: onHeader,
})

const byKey = ({ onHeader = false } = {}) => ({
  ...byPointer({ onHeader }),
  keyPressed: true,
})

test('a row marker click selects the run on that row', () => {
  expect(runSelectionChange(selection({ rows: [1] }), byPointer())).toEqual({
    type: 'select',
    run: { proposal: '2956', run: 2 },
  })
})

test('clicking the selected row marker off deselects the run', () => {
  expect(runSelectionChange(selection(), byPointer())).toEqual({
    type: 'deselect',
  })
})

test('a column click keeps the selected run', () => {
  const change = runSelectionChange(
    selection({ columns: [2] }),
    byPointer({ onHeader: true })
  )

  expect(change).toEqual({ type: 'keep' })
})

// A touch never hovers, so the grid does not know the header was the target.
test('a column tap on a touch screen keeps the selected run', () => {
  const change = runSelectionChange(selection({ columns: [2] }), byPointer())

  expect(change).toEqual({ type: 'keep' })
})

// Glide reports it as the same empty selection a row marker click-off gives.
test('unselecting the last column keeps the selected run', () => {
  const change = runSelectionChange(selection(), byPointer({ onHeader: true }))

  expect(change).toEqual({ type: 'keep' })
})

test('a cell click keeps the selected run', () => {
  const change = runSelectionChange(selection({ cell: [2, 1] }), byPointer())

  expect(change).toEqual({ type: 'keep' })
})

test('escape deselects the run', () => {
  expect(runSelectionChange(selection(), byKey())).toEqual({
    type: 'deselect',
  })
})

test('shift+space deselects the run while the pointer rests on a header', () => {
  const change = runSelectionChange(selection(), byKey({ onHeader: true }))

  expect(change).toEqual({ type: 'deselect' })
})
