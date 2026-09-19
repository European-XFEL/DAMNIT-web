import { createRef } from 'react'
import { render } from 'vitest-browser-react'
import { beforeEach, expect, test } from 'vitest'

import { setupStore, type AppStore } from '#src/app/store/store'
import { RUN_FRAGMENT } from '#src/data/table/table-data.queries'
import DashboardAside from '#src/features/dashboard/components/aside/dashboard-aside'
import {
  cellActivated,
  runSelected,
} from '#src/features/table/stores/table.slice'
import { metadataClient } from '#tests/support/apollo'
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
    start_time: { name: 'start_time', title: 'Start time', tags: [] },
    comment: { name: 'comment', title: 'Comment', tags: [] },
    xgm_energy: { name: 'xgm_energy', title: 'XGM energy', tags: [] },
    shutter_open: { name: 'shutter_open', title: 'Shutter open', tags: [] },
    trend: { name: 'trend', title: 'Trend', tags: [] },
    azimuthal: { name: 'azimuthal', title: 'Azimuthal average', tags: [] },
    detector: { name: 'detector', title: 'Detector image', tags: [] },
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

// A thumbnail as DAMNIT stores one: a PNG of a given size.
function thumbnail({ width, height }: { width: number; height: number }) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas.toDataURL('image/png')
}

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

test('a long string drops below its title while a date stays beside it', async () => {
  const screen = await openRun({
    cells: [
      ...RUN_6,
      {
        name: 'comment',
        value: 'Silica 50 nm in a 2 mm capillary, slow flow on',
        dtype: 'string',
      },
      {
        name: 'start_time',
        value: Date.UTC(2025, 5, 3, 9, 41, 7),
        dtype: 'timestamp',
      },
    ],
  })
  const comment = screen.getByText('Silica 50 nm', { exact: false })
  await expect.element(comment).toBeVisible()

  const commentTitle = boxOf(screen, 'Comment')
  const commentValue = comment.element().getBoundingClientRect()
  expect(commentValue.top).toBeGreaterThanOrEqual(commentTitle.bottom)
  expect(commentValue.left).toBe(commentTitle.left)

  const dateTitle = boxOf(screen, 'Start time')
  const dateValue = screen.getByText('2025', { exact: false }).element()
  expect(dateValue.getBoundingClientRect().left).toBeGreaterThan(
    dateTitle.right
  )
})

test('a number prints at full precision', async () => {
  const screen = await openRun({
    cells: [...RUN_6, { name: 'xgm_energy', value: 1500.5958251953125 }],
  })

  await expect
    .element(screen.getByText('1500.5958251953125', { exact: true }))
    .toBeVisible()
})

test('a thumbnail draws at its own size, and a wider one at the panel width', async () => {
  const screen = await openRun({
    cells: [
      ...RUN_6,
      {
        name: 'azimuthal',
        value: thumbnail({ width: 300, height: 225 }),
        dtype: 'image',
      },
      {
        name: 'detector',
        value: thumbnail({ width: 600, height: 300 }),
        dtype: 'image',
      },
    ],
  })
  // A thumbnail is decoration beside its title, so it has no role to find.
  const loaded = () =>
    [...screen.container.querySelectorAll('dd img')].filter(
      (image): image is HTMLImageElement =>
        image instanceof HTMLImageElement && image.naturalWidth > 0
    )
  await expect.poll(() => loaded().length).toBe(2)

  const [azimuthal, detector] = loaded()
  expect(azimuthal.getBoundingClientRect().width).toBe(300)
  const panelWidth = detector.closest('dd')!.getBoundingClientRect().width
  expect(detector.getBoundingClientRect().width).toBe(panelWidth)
  expect(detector.getBoundingClientRect().height).toBe(panelWidth / 2)
})

test('a value with no renderer of its own prints as the grid prints it', async () => {
  const screen = await openRun({
    cells: [...RUN_6, { name: 'shutter_open', value: true, dtype: 'boolean' }],
  })

  await expect.element(screen.getByText('true', { exact: true })).toBeVisible()
})

test('an array still held back reads No preview beside its title', async () => {
  const screen = await openRun({
    cells: [...RUN_6, { name: 'trend', value: null, dtype: 'array1d' }],
  })
  const placeholder = screen.getByText('No preview')
  await expect.element(placeholder).toBeVisible()

  expect(placeholder.element().getBoundingClientRect().left).toBeGreaterThan(
    boxOf(screen, 'Trend').right
  )
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
