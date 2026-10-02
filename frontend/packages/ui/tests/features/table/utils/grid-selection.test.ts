import { expect, test } from 'vitest'
import {
  CompactSelection,
  type GridSelection,
} from '@glideapps/glide-data-grid'

import { toSelectedRun } from '#src/features/table/utils/grid-selection'

const RUNS = [
  { proposal: '2956', run: 1 },
  { proposal: '3001', run: 1 },
  { proposal: '2956', run: 2 },
]
const SELECTED_RUN = RUNS[2]

const indices = (list: number[]) =>
  list.reduce(
    (selected, index) => selected.add(index),
    CompactSelection.empty()
  )

const selection = ({
  columns = [] as number[],
  rows = [] as number[],
  cell = undefined as [number, number] | undefined,
} = {}): GridSelection => ({
  columns: indices(columns),
  rows: indices(rows),
  current: cell && {
    cell,
    range: { x: cell[0], y: cell[1], width: 1, height: 1 },
    rangeStack: [],
  },
})

const options = ({ keyPressed = false, pointerOnHeader = false } = {}) => ({
  runs: RUNS,
  selectedRun: SELECTED_RUN,
  keyPressed,
  pointerOnHeader,
})

test('a row marker click selects the run on that row, proposal included', () => {
  const run = toSelectedRun(selection({ rows: [1] }), options())

  expect(run).toEqual({ proposal: '3001', run: 1 })
})

test('clicking the selected row marker off deselects the run', () => {
  const run = toSelectedRun(selection(), options())

  expect(run).toBeUndefined()
})

test('a column click keeps the selected run', () => {
  const run = toSelectedRun(selection({ columns: [2] }), options())

  expect(run).toBe(SELECTED_RUN)
})

// Glide reports it as the same empty selection a row marker click-off gives.
test('unselecting the last column keeps the selected run', () => {
  const run = toSelectedRun(selection(), options({ pointerOnHeader: true }))

  expect(run).toBe(SELECTED_RUN)
})

test('a cell click keeps the selected run', () => {
  const run = toSelectedRun(selection({ cell: [2, 0] }), options())

  expect(run).toBe(SELECTED_RUN)
})

test('a key deselects the run even while the pointer rests on a header', () => {
  const run = toSelectedRun(
    selection(),
    options({ keyPressed: true, pointerOnHeader: true })
  )

  expect(run).toBeUndefined()
})
