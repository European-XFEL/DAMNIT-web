import { createRef } from 'react'
import { render } from 'vitest-browser-react'
import { beforeEach, expect, test } from 'vitest'
import {
  ApolloClient,
  ApolloLink,
  InMemoryCache,
  Observable,
} from '@apollo/client'

import { setupStore, type AppStore } from '#src/app/store/store'
import { RUN_FRAGMENT } from '#src/data/table/table-data.queries'
import DashboardAside from '#src/features/dashboard/components/aside/dashboard-aside'
import {
  cellActivated,
  runSelected,
} from '#src/features/table/stores/table.slice'
import { typePolicies } from '#src/graphql/type-policies'
import { serverCell } from '#tests/support/cells'
import { withProviders } from '#tests/support/render'
import { resizeViewport } from '#tests/support/viewport'

const PROPOSAL = '900405'
const RUN = 6

// The xpcs example's shape: two ungrouped columns around a group of two.
const METADATA = {
  __typename: 'TableMeta',
  variables: {
    run: { name: 'run', title: 'Run', tags: [] },
    n_trains: { name: 'n_trains', title: 'Trains', tags: [] },
    'sample.type': {
      name: 'sample.type',
      title: 'Sample/Type',
      tags: [],
      group: 'sample',
    },
    'sample.x': {
      name: 'sample.x',
      title: 'Sample/X [mm]',
      tags: [],
      group: 'sample',
    },
    scan_type: { name: 'scan_type', title: 'Scan type', tags: [] },
  },
  runs: [{ __typename: 'RunId', proposal: PROPOSAL, run: RUN }],
  tags: {},
  groups: { sample: { name: 'sample', title: 'Sample' } },
  timestamp: 0,
}

type CellFixture = {
  name: string
  value: unknown
  dtype?: string
  error?: { cls: string; message: string }
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
  const link = new ApolloLink(
    () =>
      new Observable((observer) => {
        observer.next({ data: { metadata: METADATA } })
        observer.complete()
      })
  )
  const client = new ApolloClient({
    link,
    cache: new InMemoryCache({ typePolicies }),
  })
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

function openRun({ cells = RUN_6, drilled = null as string | null } = {}) {
  if (drilled != null) {
    store.dispatch(
      cellActivated({ proposal: PROPOSAL, run: RUN, variable: drilled })
    )
  }
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

test('a drilled cell shows its value below its title', async () => {
  const screen = await openRun({ drilled: 'scan_type' })
  await expect.element(screen.getByText('dscan')).toBeVisible()

  const title = boxOf(screen, 'Scan type')
  const value = boxOf(screen, 'dscan')

  expect(value.top).toBeGreaterThanOrEqual(title.bottom)
  expect(value.left).toBe(title.left)
})

// A heading and a rail for one row would dress it as a list.
test('a drilled grouped cell names its group above its short title', async () => {
  const screen = await openRun({ drilled: 'sample.type' })
  await expect.element(screen.getByText('silica')).toBeVisible()

  expect(boxOf(screen, 'Sample').bottom).toBeLessThanOrEqual(
    boxOf(screen, 'Type').top
  )
  await expect.element(screen.getByRole('group')).not.toBeInTheDocument()
})

test('a drilled failed cell shows the failure card', async () => {
  const error = { cls: 'ValueError', message: 'No trains in this run' }
  const screen = await openRun({
    cells: [{ name: 'n_trains', value: null, dtype: 'string', error }],
    drilled: 'n_trains',
  })

  await expect
    .element(screen.getByText('Trains', { exact: true }))
    .toBeVisible()
  await expect.element(screen.getByText('Error', { exact: true })).toBeVisible()
  await expect.element(screen.getByText('ValueError')).toBeVisible()
  await expect.element(screen.getByText(error.message)).toBeVisible()
})
