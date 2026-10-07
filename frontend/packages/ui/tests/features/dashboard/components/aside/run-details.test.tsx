import { createRef } from 'react'
import { render } from 'vitest-browser-react'
import { beforeEach, expect, test } from 'vitest'

import { setupStore, type AppStore } from '#src/app/store/store'
import { RUN_FRAGMENT } from '#src/data/table/table-data.queries'
import type { Variable } from '#src/data/table/table-data.types'
import DashboardAside from '#src/features/dashboard/components/aside/dashboard-aside'
import {
  cellActivated,
  runSelected,
} from '#src/features/table/stores/table.slice'
import type { CellError } from '#src/utils/cell-errors'
import { metadataClient } from '#tests/support/apollo'
import { serverCell } from '#tests/support/cells'
import { GROUPS, VARIABLES } from '#tests/support/columns'
import { withProviders } from '#tests/support/render'

const PROPOSAL = '900405'
const RUN = 6

const EXTRA_VARIABLES: Variable[] = [
  { name: 'run', title: 'Run', tags: [] },
  { name: 'start_time', title: 'Start time', tags: [] },
  { name: 'comment', title: 'Comment', tags: [] },
  { name: 'xgm_energy', title: 'XGM energy', tags: [] },
  { name: 'shutter_open', title: 'Shutter open', tags: [] },
  { name: 'trend', title: 'Trend', tags: [] },
  { name: 'azimuthal', title: 'Azimuthal average', tags: [] },
]

const METADATA = {
  __typename: 'TableMeta',
  variables: Object.fromEntries(
    [...VARIABLES, ...EXTRA_VARIABLES].map((variable) => [
      variable.name,
      variable,
    ])
  ),
  runs: [{ __typename: 'RunId', proposal: PROPOSAL, run: RUN }],
  tags: {},
  groups: GROUPS,
  timestamp: 0,
}

type CellFixture = {
  name: string
  value: unknown
  dtype?: string
  error?: CellError
}

const RUN_6: CellFixture[] = [
  { name: 'run', value: RUN },
  { name: 'n_trains', value: 1200 },
  { name: 'sample.type', value: 'silica', dtype: 'string' },
  { name: 'sample.x', value: 1.5 },
  { name: 'scan_type', value: 'dscan', dtype: 'string' },
]

// The panel reads the run from the cache, so the run is written there first
// and the link answers only the metadata.
function runClient(cells: CellFixture[]) {
  const client = metadataClient(METADATA)
  client.cache.writeFragment({
    fragment: RUN_FRAGMENT,
    data: {
      __typename: 'DamnitRun',
      database: PROPOSAL,
      proposal: PROPOSAL,
      run: RUN,
      cells: cells.map((cell) =>
        serverCell({
          database: PROPOSAL,
          proposal: PROPOSAL,
          run: RUN,
          ...cell,
        })
      ),
    },
  })
  return client
}

let store: AppStore

beforeEach(() => {
  store = setupStore({
    metadata: {
      proposal: { value: PROPOSAL, loading: false, notFound: false },
    },
  })
  store.dispatch(runSelected({ proposal: PROPOSAL, run: RUN }))
})

function openRun({
  cells = RUN_6,
  activeVariable,
}: { cells?: CellFixture[]; activeVariable?: string } = {}) {
  if (activeVariable != null) {
    store.dispatch(
      cellActivated({ proposal: PROPOSAL, run: RUN, variable: activeVariable })
    )
  }
  return render(<DashboardAside viewRef={createRef()} />, {
    wrapper: withProviders({ store, client: runClient(cells) }),
  })
}

test('a group lists its members under its heading by their short titles', async () => {
  const screen = await openRun()

  const group = screen.getByRole('group', { name: 'Sample' })

  await expect.element(group.getByText('Type', { exact: true })).toBeVisible()
  await expect.element(group.getByText('X [mm]', { exact: true })).toBeVisible()
  await expect.element(group.getByText('silica')).toBeVisible()
})

// The group heading stays, but a group role and rail around one row would
// make it read as a list.
test('an active grouped cell names its group without listing it as a group', async () => {
  const screen = await openRun({ activeVariable: 'sample.type' })
  await expect.element(screen.getByText('silica')).toBeVisible()

  await expect
    .element(screen.getByText('Sample', { exact: true }))
    .toBeVisible()
  await expect.element(screen.getByText('Type', { exact: true })).toBeVisible()
  await expect.element(screen.getByRole('group')).not.toBeInTheDocument()
})

test('an active failed cell shows the failure card', async () => {
  const error = { cls: 'ValueError', message: 'No trains in this run' }
  const screen = await openRun({
    cells: [{ name: 'n_trains', value: null, dtype: 'string', error }],
    activeVariable: 'n_trains',
  })

  await expect
    .element(screen.getByText('Trains', { exact: true }))
    .toBeVisible()
  await expect.element(screen.getByText('Error', { exact: true })).toBeVisible()
  await expect.element(screen.getByText('ValueError')).toBeVisible()
  await expect.element(screen.getByText(error.message)).toBeVisible()
})

test('an active cell the run has no value for says No value', async () => {
  const screen = await openRun({ activeVariable: 'comment' })

  await expect
    .element(screen.getByText('Comment', { exact: true }))
    .toBeVisible()
  await expect.element(screen.getByText('No value')).toBeVisible()
})

test('a number prints at full precision', async () => {
  const screen = await openRun({
    cells: [...RUN_6, { name: 'xgm_energy', value: 1500.5958251953125 }],
  })

  await expect
    .element(screen.getByText('1500.5958251953125', { exact: true }))
    .toBeVisible()
})

// Set in local time, since the panel prints in the machine's timezone.
test('a timestamp prints as a date', async () => {
  const screen = await openRun({
    cells: [
      ...RUN_6,
      {
        name: 'start_time',
        value: new Date(2025, 5, 3, 9, 41, 7).getTime(),
        dtype: 'timestamp',
      },
    ],
  })

  await expect
    .element(screen.getByText('09:41:07 | 03 June 2025', { exact: true }))
    .toBeVisible()
})

test('a value with no renderer of its own prints as the grid prints it', async () => {
  const screen = await openRun({
    cells: [...RUN_6, { name: 'shutter_open', value: true, dtype: 'boolean' }],
  })

  await expect.element(screen.getByText('true', { exact: true })).toBeVisible()
})

test('an array still held back reads No preview', async () => {
  const screen = await openRun({
    cells: [...RUN_6, { name: 'trend', value: null, dtype: 'array1d' }],
  })

  await expect.element(screen.getByText('No preview')).toBeVisible()
})

test('an array that has arrived reads No preview too', async () => {
  const screen = await openRun({
    cells: [...RUN_6, { name: 'trend', value: [1, 2, 3], dtype: 'array1d' }],
  })

  await expect.element(screen.getByText('No preview')).toBeVisible()
})

test('a thumbnail is named for its variable', async () => {
  const pixel =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
  const screen = await openRun({
    cells: [...RUN_6, { name: 'azimuthal', value: pixel, dtype: 'image' }],
  })

  await expect
    .element(screen.getByRole('img', { name: 'Azimuthal average' }))
    .toBeVisible()
})

test('a thumbnail still loading keeps its title in the list', async () => {
  const screen = await openRun({
    cells: [...RUN_6, { name: 'azimuthal', value: null, dtype: 'image' }],
  })

  await expect
    .element(screen.getByText('Azimuthal average', { exact: true }))
    .toBeVisible()
})

test('a run with nothing left to show says so', async () => {
  const screen = await openRun({
    cells: [{ name: 'n_trains', value: null }],
  })

  await expect.element(screen.getByText('No values to show')).toBeVisible()
})
