import { createRef } from 'react'
import { render } from 'vitest-browser-react'
import { beforeEach, expect, test } from 'vitest'

import { setupStore, type AppStore } from '#src/app/store/store'
import { RUN_FRAGMENT } from '#src/data/table/table-data.queries'
import type { Variable } from '#src/data/table/table-data.types'
import DashboardAside from '#src/features/dashboard/components/aside/dashboard-aside'
import { runSelected } from '#src/features/table/stores/table.slice'
import { metadataClient } from '#tests/support/apollo'
import { serverCell } from '#tests/support/cells'
import { GROUPS, VARIABLES } from '#tests/support/columns'
import { withProviders } from '#tests/support/render'
import { resizeViewport } from '#tests/support/viewport'

const PROPOSAL = '900405'
const RUN = 6

const EXTRA_VARIABLES: Variable[] = [{ name: 'run', title: 'Run', tags: [] }]

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

type CellFixture = { name: string; value: unknown; dtype?: string }

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

beforeEach(async () => {
  // Past `sm`, where the panel sits beside the table at its 360 px.
  await resizeViewport({ width: 1280, height: 800 })
  store = setupStore({
    metadata: {
      proposal: { value: PROPOSAL, loading: false, notFound: false },
    },
  })
  store.dispatch(runSelected({ proposal: PROPOSAL, run: RUN }))
})

function openRun({ cells = RUN_6 } = {}) {
  return render(<DashboardAside viewRef={createRef()} />, {
    wrapper: withProviders({ store, client: runClient(cells) }),
  })
}

type Screen = Awaited<ReturnType<typeof openRun>>

const boxOf = (screen: Screen, text: string) =>
  screen.getByText(text, { exact: true }).element().getBoundingClientRect()

test('a group lists its members under its heading by their short titles', async () => {
  const screen = await openRun()

  const group = screen.getByRole('group', { name: 'Sample' })

  await expect.element(group.getByText('Type', { exact: true })).toBeVisible()
  await expect.element(group.getByText('X [mm]', { exact: true })).toBeVisible()
  await expect.element(group.getByText('silica')).toBeVisible()
})

test('an ungrouped variable sits flush with a group heading, its members inset', async () => {
  const screen = await openRun()
  await expect.element(screen.getByText('Type', { exact: true })).toBeVisible()

  const heading = boxOf(screen, 'Sample').left

  expect(boxOf(screen, 'Trains').left).toBe(heading)
  expect(boxOf(screen, 'Scan type').left).toBe(heading)
  expect(boxOf(screen, 'Type').left - heading).toBe(22)
})
