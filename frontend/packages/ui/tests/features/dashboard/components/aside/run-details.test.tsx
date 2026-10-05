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
import { resizeViewport } from '#tests/support/viewport'

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
  { name: 'detector', title: 'Detector image', tags: [] },
  {
    name: 'intensity',
    title: 'Integrated intensity of the azimuthal average over all trains',
    tags: [],
  },
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

type Screen = Awaited<ReturnType<typeof openRun>>

function thumbnail({ width, height }: { width: number; height: number }) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas.toDataURL('image/png')
}

const boxOf = (screen: Screen, text: string) =>
  screen.getByText(text, { exact: true }).element().getBoundingClientRect()

function expectInsidePanel(element: Element) {
  const viewport = element.closest('.mantine-ScrollArea-viewport')!
  expect(viewport.scrollWidth).toBe(viewport.clientWidth)
  expect(element.getBoundingClientRect().right).toBeLessThanOrEqual(
    viewport.getBoundingClientRect().right
  )
}

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

test('an active cell shows its value below its title', async () => {
  const screen = await openRun({ activeVariable: 'scan_type' })
  await expect.element(screen.getByText('dscan')).toBeVisible()

  const title = boxOf(screen, 'Scan type')
  const value = boxOf(screen, 'dscan')

  expect(value.top).toBeGreaterThanOrEqual(title.bottom)
  expect(value.left).toBe(title.left)
})

// The group heading stays, but a group role and rail around one row would
// make it read as a list.
test('an active grouped cell names its group above its short title', async () => {
  const screen = await openRun({ activeVariable: 'sample.type' })
  await expect.element(screen.getByText('silica')).toBeVisible()

  expect(boxOf(screen, 'Sample').bottom).toBeLessThanOrEqual(
    boxOf(screen, 'Type').top
  )
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

test('an active failed cell keeps a long message and its copy button inside the panel', async () => {
  const error = {
    cls: 'SourceNameError',
    message:
      'No source SA2_XTD1_XGM_DOOCS_output_data_intensitySa1TD_pulseEnergy_photonFlux',
  }
  const screen = await openRun({
    cells: [{ name: 'n_trains', value: null, dtype: 'string', error }],
    activeVariable: 'n_trains',
  })
  const copy = screen.getByRole('button', { name: 'Copy' })
  await expect.element(copy).toBeVisible()

  expectInsidePanel(copy.element())
})

test('an active cell wraps a long value inside the panel', async () => {
  const value =
    'silica_50nm_capillary_2mm_slow_flow_batch_A3_prepared_2025_06_03'
  const screen = await openRun({
    cells: [...RUN_6, { name: 'comment', value, dtype: 'string' }],
    activeVariable: 'comment',
  })
  const text = screen.getByText(value)
  await expect.element(text).toBeVisible()

  expectInsidePanel(text.element())
})

test('an active cell the run has no value for says No value', async () => {
  const screen = await openRun({ activeVariable: 'comment' })

  await expect
    .element(screen.getByText('Comment', { exact: true }))
    .toBeVisible()
  await expect.element(screen.getByText('No value')).toBeVisible()
})

test('a long string drops below its title', async () => {
  const screen = await openRun({
    cells: [
      ...RUN_6,
      {
        name: 'comment',
        value: 'Silica 50 nm in a 2 mm capillary, slow flow on',
        dtype: 'string',
      },
    ],
  })
  const comment = screen.getByText('Silica 50 nm', { exact: false })
  await expect.element(comment).toBeVisible()

  const title = boxOf(screen, 'Comment')
  const value = comment.element().getBoundingClientRect()
  expect(value.top).toBeGreaterThanOrEqual(title.bottom)
  expect(value.left).toBe(title.left)
})

test('a date stays beside its title', async () => {
  const screen = await openRun({
    cells: [
      ...RUN_6,
      {
        name: 'start_time',
        value: Date.UTC(2025, 5, 3, 9, 41, 7),
        dtype: 'timestamp',
      },
    ],
  })
  const date = screen.getByText('2025', { exact: false })
  await expect.element(date).toBeVisible()

  expect(date.element().getBoundingClientRect().left).toBeGreaterThan(
    boxOf(screen, 'Start time').right
  )
})

test('a title wider than the panel wraps inside it', async () => {
  const screen = await openRun({
    cells: [...RUN_6, { name: 'intensity', value: 0.52 }],
  })
  const title = screen.getByText('Integrated intensity', { exact: false })
  await expect.element(title).toBeVisible()

  expectInsidePanel(title.element())
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

async function loadedImage(screen: Screen, name: string) {
  const image = screen.getByRole('img', { name })
  await expect.element(image).toBeVisible()
  const element = image.element() as HTMLImageElement
  await expect.poll(() => element.naturalWidth).toBeGreaterThan(0)
  return element
}

test('a thumbnail narrower than the panel draws at its own size', async () => {
  const screen = await openRun({
    cells: [
      ...RUN_6,
      {
        name: 'azimuthal',
        value: thumbnail({ width: 300, height: 225 }),
        dtype: 'image',
      },
    ],
  })

  const image = await loadedImage(screen, 'Azimuthal average')

  expect(image.getBoundingClientRect().width).toBe(300)
})

test('a thumbnail wider than the panel scales down to its width', async () => {
  const screen = await openRun({
    cells: [
      ...RUN_6,
      {
        name: 'detector',
        value: thumbnail({ width: 600, height: 300 }),
        dtype: 'image',
      },
    ],
  })

  const image = await loadedImage(screen, 'Detector image')

  const panelWidth = image.closest('dd')!.getBoundingClientRect().width
  expect(image.getBoundingClientRect().width).toBe(panelWidth)
  expect(image.getBoundingClientRect().height).toBe(panelWidth / 2)
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
