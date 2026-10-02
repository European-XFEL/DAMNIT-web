import { expect, test } from 'vitest'

import { cellsByName } from '#src/data/table/table-data.transforms'
import type {
  Cell,
  CellError,
  CellValue,
  Variable,
} from '#src/data/table/table-data.types'
import {
  runEntries,
  type RunEntry,
} from '#src/features/dashboard/components/aside/run-entries'
import { itemsOf, type VariableBlock } from '#src/utils/variable-blocks'
import { ALL_VISIBLE, GROUPS, VARIABLES } from '#tests/support/columns'

function cell({
  name,
  value,
  dtype = 'number',
  error = null,
}: {
  name: string
  value: CellValue
  dtype?: string
  error?: CellError | null
}): Cell {
  return { id: `p2956:6:${name}`, name, error, summary: { value, dtype } }
}

const RUN_6 = [
  cell({ name: 'run', value: 6 }),
  cell({ name: 'n_trains', value: 1200 }),
  cell({ name: 'sample.type', value: 'Silica 50 nm', dtype: 'string' }),
  cell({ name: 'sample.x', value: 1.5 }),
  cell({ name: 'sample.y', value: -0.25 }),
  cell({ name: 'scan_type', value: 'dscan', dtype: 'string' }),
]

const RUN_VARIABLE: Variable = { name: 'run', title: 'Run', tags: [] }

type EntriesOptions = {
  cells?: Cell[]
  variables?: Variable[]
  visible?: Record<string, boolean | undefined>
  activeVariable?: string | null
}

const entriesOf = ({
  cells = RUN_6,
  variables = VARIABLES,
  visible = ALL_VISIBLE,
  activeVariable = null,
}: EntriesOptions = {}) =>
  runEntries({
    cells: cellsByName(cells),
    variables,
    groups: GROUPS,
    visible,
    activeVariable,
  })

const namesOf = (blocks: VariableBlock<RunEntry>[]) =>
  itemsOf(blocks).map((entry) => entry.name)

test('lists the run in the order the grid draws its columns', () => {
  const [trains, sampleType, sampleX, sampleY, scanType] = VARIABLES
  const dragged = [scanType, trains, sampleType, sampleX, sampleY]

  expect(namesOf(entriesOf({ variables: dragged }))).toEqual([
    'scan_type',
    'n_trains',
    'sample.type',
    'sample.x',
    'sample.y',
  ])
})

test('a grouped variable lists under its group by its short title', () => {
  const [, group] = entriesOf()

  expect(group).toMatchObject({
    kind: 'group',
    title: 'Sample',
    members: [
      { name: 'sample.type', columnTitle: 'Type', state: 'value' },
      { name: 'sample.x', columnTitle: 'X [mm]', state: 'value' },
      { name: 'sample.y', columnTitle: 'Y [mm]', state: 'value' },
    ],
  })
})

test('an unticked column leaves the list', () => {
  const visible = { ...ALL_VISIBLE, scan_type: false }

  expect(namesOf(entriesOf({ visible }))).toEqual([
    'n_trains',
    'sample.type',
    'sample.x',
    'sample.y',
  ])
})

test('a group whose members all left the list leaves with them', () => {
  const visible = {
    ...ALL_VISIBLE,
    'sample.type': false,
    'sample.x': false,
    'sample.y': false,
  }

  const blocks = entriesOf({ visible })

  expect(blocks.map((block) => block.kind)).toEqual(['variable', 'variable'])
})

test('the run number is not listed as a variable', () => {
  const blocks = entriesOf({ variables: [RUN_VARIABLE, ...VARIABLES] })

  expect(namesOf(blocks)).toEqual([
    'n_trains',
    'sample.type',
    'sample.x',
    'sample.y',
    'scan_type',
  ])
})

test('a failed cell leaves the list', () => {
  const failed = cell({
    name: 'n_trains',
    value: null,
    error: { cls: 'ValueError', message: 'No trains in this run' },
  })

  const blocks = entriesOf({ cells: [failed, ...RUN_6.slice(2)] })

  expect(namesOf(blocks)).toEqual([
    'sample.type',
    'sample.x',
    'sample.y',
    'scan_type',
  ])
})

test('a scalar with no value leaves the list', () => {
  const missing = cell({ name: 'scan_type', value: null, dtype: 'string' })

  const blocks = entriesOf({ cells: [...RUN_6.slice(0, 5), missing] })

  expect(namesOf(blocks)).toEqual([
    'n_trains',
    'sample.type',
    'sample.x',
    'sample.y',
  ])
})

test('a variable the run has no cell for leaves the list', () => {
  const blocks = entriesOf({ cells: RUN_6.slice(0, 5) })

  expect(namesOf(blocks)).toEqual([
    'n_trains',
    'sample.type',
    'sample.x',
    'sample.y',
  ])
})

// Only a heavy dtype is held back for the deferred fetch, so only a heavy null
// still has a value on its way.
test('a heavy value still loading keeps its place', () => {
  const variables = [
    ...VARIABLES.slice(0, 1),
    { name: 'xgm_image', title: 'XGM image', tags: [] },
    ...VARIABLES.slice(1),
  ]
  const loading = cell({ name: 'xgm_image', value: null, dtype: 'image' })

  const blocks = entriesOf({ variables, cells: [...RUN_6, loading] })

  expect(itemsOf(blocks)[1]).toMatchObject({
    name: 'xgm_image',
    state: 'loading',
  })
})

const TREND: Variable = { name: 'trend', title: 'Trend', tags: [] }

test('a failed array leaves the list', () => {
  const trend = cell({
    name: 'trend',
    value: null,
    dtype: 'array1d',
    error: { cls: 'ValueError', message: 'No trains in this run' },
  })

  const blocks = entriesOf({
    variables: [...VARIABLES, TREND],
    cells: [...RUN_6, trend],
  })

  expect(namesOf(blocks)).not.toContain('trend')
})

test('the active variable is listed alone, in its group', () => {
  const blocks = entriesOf({ activeVariable: 'sample.x' })

  expect(blocks).toMatchObject([
    {
      kind: 'group',
      title: 'Sample',
      members: [{ name: 'sample.x', columnTitle: 'X [mm]', value: 1.5 }],
    },
  ])
})

test('the active variable shows while its column is hidden', () => {
  const visible = { ...ALL_VISIBLE, scan_type: false }

  const blocks = entriesOf({ visible, activeVariable: 'scan_type' })

  expect(namesOf(blocks)).toEqual(['scan_type'])
})

test('an active failed cell carries its error', () => {
  const error = { cls: 'ValueError', message: 'No trains in this run' }
  const failed = cell({ name: 'n_trains', value: null, error })

  const [entry] = entriesOf({ cells: [failed], activeVariable: 'n_trains' })

  expect(entry).toMatchObject({ state: 'error', error })
})

test('an active scalar with no value is blank', () => {
  const missing = cell({ name: 'scan_type', value: null, dtype: 'string' })

  const [entry] = entriesOf({ cells: [missing], activeVariable: 'scan_type' })

  expect(entry).toMatchObject({ name: 'scan_type', state: 'blank' })
})
