import type { ReactNode } from 'react'
// Dimming is a colour, so the theme's variables have to be on the page for the
// test to see one.
import '@mantine/core/styles.layer.css'
import { userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { beforeEach, expect, test } from 'vitest'

import { setupStore, type AppStore } from '#src/app/store/store'
import { TABLE_META_QUERY } from '#src/data/table/table-data.queries'
import { VariablesPopover } from '#src/features/table/components/popovers/variables-popover'
import {
  setColumnVisibility,
  setTagSelection,
} from '#src/features/table/stores/table.slice'
import { metadataClient } from '#tests/support/apollo'
import { withProviders } from '#tests/support/render'

const PROPOSAL = '900405'

// The xpcs example's shape: two pinned columns, two ungrouped ones, and a group
// of two between them. One member carries a tag, so a tag can split its group.
const METADATA = {
  __typename: 'TableMeta',
  variables: {
    proposal: { name: 'proposal', title: 'Proposal', tags: [] },
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
      tags: ['position'],
      group: 'sample',
    },
    scan_type: { name: 'scan_type', title: 'Scan type', tags: ['scan'] },
  },
  runs: [],
  tags: {
    scan: { name: 'scan', variables: ['scan_type'] },
    position: { name: 'position', variables: ['sample.x'] },
  },
  groups: { sample: { name: 'sample', title: 'Sample' } },
  timestamp: 0,
}

let store: AppStore
let client: ReturnType<typeof metadataClient>

beforeEach(() => {
  store = setupStore({
    metadata: {
      proposal: { value: PROPOSAL, loading: false, notFound: false },
    },
  })
  client = metadataClient(METADATA)
})

async function openPopover({ outside }: { outside?: ReactNode } = {}) {
  const screen = await render(
    <>
      {outside}
      <VariablesPopover />
    </>,
    { wrapper: withProviders({ store, client }) }
  )

  await screen.getByRole('button', { name: 'Variables' }).click()
  // The popover moves focus onto its search box a tick after it opens, so a
  // keystroke sent before that lands on whatever had focus before.
  await expect
    .element(screen.getByPlaceholder('Search variables'))
    .toHaveFocus()

  return screen
}

type Screen = Awaited<ReturnType<typeof openPopover>>

const HANDLE = 'Reorder '

const handle = (screen: Screen, label: string) =>
  screen.getByRole('button', { name: `${HANDLE}${label}`, exact: true })

// What the list offers to move, top to bottom. Only a row an order governs has
// a handle, so this is the movable part of the list rather than all of it.
function movableColumns(screen: Screen) {
  return screen
    .getByRole('button')
    .elements()
    .map((element) => element.getAttribute('aria-label') ?? '')
    .filter((label) => label.startsWith(HANDLE))
    .map((label) => label.slice(HANDLE.length))
}

// The smallest element around a column's label that also holds `selector`.
function closestHolding(
  screen: Screen,
  { label, selector }: { label: string; selector: string }
) {
  let element = screen.getByText(label, { exact: true }).element().parentElement
  while (element != null && element.querySelector(selector) == null) {
    element = element.parentElement
  }

  return element!
}

// A handle in use shows only as the grip's colour. It is found from the label
// beside it, since a preview's copy of the grip answers to no name.
function gripColour(screen: Screen, label: string) {
  const row = closestHolding(screen, { label, selector: 'svg' })
  return getComputedStyle(row.querySelector('svg')!).color
}

const rowOf = (screen: Screen, label: string) =>
  closestHolding(screen, { label, selector: 'input[type="checkbox"]' })

// One place along, by the keyboard half of the gesture.
async function drag(
  screen: Screen,
  { label, key = 'ArrowDown' }: { label: string; key?: 'ArrowDown' | 'ArrowUp' }
) {
  handle(screen, label).element().focus()
  await userEvent.keyboard('{Space}')
  await userEvent.keyboard(`{${key}}`)
  await userEvent.keyboard('{Space}')
}

test('lists the columns in table order, a group as one block', async () => {
  const screen = await openPopover()

  expect(movableColumns(screen)).toEqual([
    'Trains',
    'Sample',
    'Sample/Type',
    'Sample/X [mm]',
    'Scan type',
  ])
})

test('a pinned column is marked pinned and offers no handle', async () => {
  const screen = await openPopover()

  const marked = screen
    .getByRole('img', { name: 'Pinned' })
    .elements()
    .map((mark) => mark.parentElement?.textContent)
  expect(marked).toEqual(['Proposal', 'Run'])
  expect(movableColumns(screen)).not.toContain('Proposal')
})

test('a line parts the pinned rows from the rows that move', async () => {
  const screen = await openPopover()
  // The popover always draws two of its own, above and below the list
  const lines = () => screen.getByRole('separator').elements().length

  // With rows on both sides of it
  expect(lines()).toBe(3)

  // Narrowed to Run alone, with nothing below to part it from
  await screen.getByPlaceholder('Search variables').fill('run')
  await expect.poll(lines).toBe(2)
})

test('Run is listed with a checkbox that cannot be cleared', async () => {
  const screen = await openPopover()

  const run = screen.getByRole('checkbox', { name: 'Run', exact: true })
  await expect.element(run).toBeChecked()
  await expect.element(run).toBeDisabled()
})

test("Run's checkbox does not light up under the pointer", async () => {
  const screen = await openPopover()
  const run = screen.getByRole('checkbox', { name: 'Run', exact: true })
  const atRest = getComputedStyle(run.element()).borderColor

  await userEvent.hover(run.element())
  // Past the checkbox's 100 ms colour transition
  await new Promise((resolve) => setTimeout(resolve, 300))

  expect(getComputedStyle(run.element()).borderColor).toBe(atRest)
})

test('dims a column the table is not showing', async () => {
  store.dispatch(setColumnVisibility({ n_trains: false }))
  const screen = await openPopover()

  const hidden = screen.getByText('Trains')
  const shown = screen.getByText('Scan type')

  expect(getComputedStyle(hidden.element()).color).not.toBe(
    getComputedStyle(shown.element()).color
  )
})

test('a handle the keyboard reaches darkens', async () => {
  const screen = await openPopover()

  const atRest = gripColour(screen, 'Trains')

  // Tab past the pinned row's checkbox
  await userEvent.tab()
  await userEvent.tab()
  await expect.element(handle(screen, 'Trains')).toHaveFocus()

  expect(gripColour(screen, 'Trains')).not.toBe(atRest)
})

test('a lifted group marks its own handle, not its members', async () => {
  const screen = await openPopover()

  // Lift the group, which the library replaces with a preview clone that
  // carries the members along
  handle(screen, 'Sample').element().focus()
  await userEvent.keyboard('{Space}')
  await expect
    .poll(() => gripColour(screen, 'Sample'))
    .not.toBe(gripColour(screen, 'Scan type'))

  // A member rides along, so it still looks like a row nobody is holding
  expect(gripColour(screen, 'Type')).toBe(gripColour(screen, 'Scan type'))
})

// Two levels, since the handle and the link beside it do different things: the
// handle speaks for the block it would move, the heading only for itself.
test("hovering a group's handle lights the whole group", async () => {
  const screen = await openPopover()

  const grip = handle(screen, 'Sample').element()
  const block = grip.parentElement!.parentElement!
  const atRest = getComputedStyle(block).backgroundColor

  // Over the heading, beside the handle
  await userEvent.hover(screen.getByText('Sample', { exact: true }).element())
  expect(getComputedStyle(block).backgroundColor).toBe(atRest)

  // Over the handle itself
  await userEvent.hover(grip)
  expect(getComputedStyle(block).backgroundColor).not.toBe(atRest)
})

test('a pinned row lights on hover like the rows it sits above', async () => {
  const screen = await openPopover()

  await userEvent.hover(rowOf(screen, 'Trains'))
  const lit = getComputedStyle(rowOf(screen, 'Trains')).backgroundColor

  await userEvent.hover(rowOf(screen, 'Proposal'))
  expect(getComputedStyle(rowOf(screen, 'Proposal')).backgroundColor).toBe(lit)
})

// The grid reads this order and is not rendered here, so the store is where the
// hand-over shows.
test('a drag hands the grid the whole order, pinned columns first', async () => {
  const screen = await openPopover()

  await drag(screen, { label: 'Trains' })

  await expect
    .poll(() => store.getState().table.columnOrder)
    .toEqual([
      'proposal',
      'run',
      'sample.type',
      'sample.x',
      'n_trains',
      'scan_type',
    ])
  expect(store.getState().table.lastMove?.columns).toEqual(['n_trains'])
})

test('a member cannot be dragged out of the group it belongs to', async () => {
  const screen = await openPopover()

  // The last member, pushed down past the group's own end
  await drag(screen, { label: 'Sample/X [mm]' })

  // Still between its own group's rows, with no order written to reset
  expect(movableColumns(screen)).toEqual([
    'Trains',
    'Sample',
    'Sample/Type',
    'Sample/X [mm]',
    'Scan type',
  ])
  expect(
    screen.getByRole('button', { name: 'Reset order' }).elements()
  ).toEqual([])
})

test('a drop under a search moves only the column that was dragged', async () => {
  const screen = await openPopover()

  // Narrow the list to the two ungrouped columns either side of the group
  await screen.getByPlaceholder('Search variables').fill('n')
  await expect
    .poll(() => movableColumns(screen))
    .toEqual(['Trains', 'Scan type'])

  await drag(screen, { label: 'Trains' })

  // With the search cleared, the group it passed over has not moved
  await screen.getByRole('button', { name: 'Clear search' }).click()
  await expect
    .poll(() => movableColumns(screen))
    .toEqual(['Sample', 'Sample/Type', 'Sample/X [mm]', 'Scan type', 'Trains'])
})

test('a search landing mid-drag leaves the list as the drag found it', async () => {
  const screen = await openPopover()

  // Type, then lift a column before the search has settled
  await screen.getByPlaceholder('Search variables').fill('n')
  handle(screen, 'Trains').element().focus()
  await userEvent.keyboard('{Space}')

  // Past the debounce, the pinned row the search would drop is still there
  await new Promise((resolve) => setTimeout(resolve, 400))
  await expect.element(screen.getByText('Proposal')).toBeVisible()
})

test('a search that matches nothing says so', async () => {
  const screen = await openPopover()

  await screen.getByPlaceholder('Search variables').fill('zzz')

  await expect.element(screen.getByText('No variables match')).toBeVisible()
})

test('the search box clears in one click', async () => {
  const screen = await openPopover()

  // Narrow the list to the group
  await screen.getByPlaceholder('Search variables').fill('sample')
  await expect
    .poll(() => movableColumns(screen))
    .toEqual(['Sample', 'Sample/Type', 'Sample/X [mm]'])

  // Clear it, and the button goes with the text it had to clear
  await screen.getByRole('button', { name: 'Clear search' }).click()
  await expect
    .poll(() => movableColumns(screen))
    .toEqual(['Trains', 'Sample', 'Sample/Type', 'Sample/X [mm]', 'Scan type'])
  expect(
    screen.getByRole('button', { name: 'Clear search' }).elements()
  ).toEqual([])
})

test('clearing the search hands focus back to the search box', async () => {
  const screen = await openPopover()
  const search = screen.getByPlaceholder('Search variables')

  await search.fill('sample')
  await screen.getByRole('button', { name: 'Clear search' }).click()

  await expect.element(search).toHaveFocus()
})

test('the checkbox beside a column hides it', async () => {
  const screen = await openPopover()

  const trains = screen.getByRole('checkbox', { name: 'Trains', exact: true })
  await trains.click()

  await expect.element(trains).not.toBeChecked()
})

test('the footer link leaves alone the columns the user cannot hide', async () => {
  const screen = await openPopover()
  const footerLink = (name: string) =>
    screen.getByRole('button', { name, exact: true })

  // Proposal starts hidden, so the link first offers to show it
  await footerLink('Show all').click()
  await expect.element(footerLink('Hide all')).toBeVisible()

  // Hiding everything still leaves Run shown
  await footerLink('Hide all').click()
  await expect
    .element(screen.getByRole('checkbox', { name: 'Run', exact: true }))
    .toBeChecked()
  // Run's checkbox reads checked whatever the store holds, so only the store
  // shows the link never wrote it.
  expect(store.getState().table.columnVisibility).not.toHaveProperty('run')
})

test("a group's link hides every member at once", async () => {
  const screen = await openPopover()
  const member = (name: string) =>
    screen.getByRole('checkbox', { name, exact: true })

  await screen.getByRole('button', { name: 'Hide all Sample' }).click()

  await expect.element(member('Sample/Type')).not.toBeChecked()
  await expect.element(member('Sample/X [mm]')).not.toBeChecked()
})

test("a group's link offers to show every member while one is hidden", async () => {
  store.dispatch(setColumnVisibility({ 'sample.x': false }))
  const screen = await openPopover()

  await expect
    .element(screen.getByRole('button', { name: 'Show all Sample' }))
    .toBeVisible()
})

test("a group's link is underlined only when no member passes the tag filter", async () => {
  const underline = (screen: Screen) =>
    getComputedStyle(
      screen.getByRole('button', { name: 'Hide all Sample' }).element()
    ).textDecorationLine

  // A tag one member carries
  store.dispatch(setTagSelection({ position: true }))
  const screen = await openPopover()
  expect(underline(screen)).toBe('none')

  // A tag neither member carries
  store.dispatch(setTagSelection({ position: false, scan: true }))
  await expect.poll(() => underline(screen)).toBe('underline')
})

test('a tagged column opens its tags where the row is', async () => {
  const screen = await openPopover()

  await screen.getByRole('button', { name: 'Scan type', exact: true }).click()

  await expect.element(screen.getByText('Tags')).toBeVisible()
  await expect.element(screen.getByText('scan', { exact: true })).toBeVisible()
})

test("a member's tags open from a button named by its whole title", async () => {
  const screen = await openPopover()

  await screen
    .getByRole('button', { name: 'Sample/X [mm]', exact: true })
    .click()

  await expect
    .element(screen.getByText('position', { exact: true }))
    .toBeVisible()
})

test('a column dragged with its tags open keeps them open', async () => {
  const screen = await openPopover()
  await screen.getByRole('button', { name: 'Scan type', exact: true }).click()

  // Drag it up above the group
  await drag(screen, { label: 'Scan type', key: 'ArrowUp' })
  await expect
    .poll(() => movableColumns(screen))
    .toEqual(['Trains', 'Scan type', 'Sample', 'Sample/Type', 'Sample/X [mm]'])

  await expect.element(screen.getByText('Tags')).toBeVisible()
})

test('a variable a push deletes mid-drag keeps its open tags until the drop', async () => {
  const screen = await openPopover()
  await screen.getByRole('button', { name: 'Scan type', exact: true }).click()

  // Lift another column, then delete the open one the way a push does
  handle(screen, 'Trains').element().focus()
  await userEvent.keyboard('{Space}')
  const { scan_type: _deleted, ...variables } = METADATA.variables
  client.cache.writeQuery({
    query: TABLE_META_QUERY,
    variables: { proposal: PROPOSAL },
    data: {
      metadata: {
        ...METADATA,
        variables,
        tags: { position: METADATA.tags.position },
      },
    },
  })
  await new Promise((resolve) => setTimeout(resolve, 100))
  await expect.element(screen.getByText('scan', { exact: true })).toBeVisible()

  // Drop, and the deleted column leaves with the drag
  await userEvent.keyboard('{Space}')
  await expect
    .poll(() => movableColumns(screen))
    .toEqual(['Trains', 'Sample', 'Sample/Type', 'Sample/X [mm]'])
})

test('an untagged column has nothing to open', async () => {
  const screen = await openPopover()

  expect(
    screen.getByRole('button', { name: 'Trains', exact: true }).elements()
  ).toEqual([])
})

test('Reset order shows only once the columns have been moved', async () => {
  const screen = await openPopover()

  // Before anything has moved
  expect(
    screen.getByRole('button', { name: 'Reset order' }).elements()
  ).toEqual([])

  // After one drag
  await drag(screen, { label: 'Trains' })
  await expect
    .element(screen.getByRole('button', { name: 'Reset order' }))
    .toBeVisible()
})

test('Reset order puts the columns back the way the server sent them', async () => {
  const screen = await openPopover()

  await drag(screen, { label: 'Trains' })
  await screen.getByRole('button', { name: 'Reset order' }).click()

  await expect
    .poll(() => movableColumns(screen))
    .toEqual(['Trains', 'Sample', 'Sample/Type', 'Sample/X [mm]', 'Scan type'])
})

test('Reset order hands focus to the search box as it goes', async () => {
  const screen = await openPopover()
  await drag(screen, { label: 'Trains' })
  const reset = screen.getByRole('button', { name: 'Reset order' })
  await expect.element(reset).toBeVisible()

  reset.element().focus()
  await userEvent.keyboard('{Enter}')

  await expect
    .element(screen.getByPlaceholder('Search variables'))
    .toHaveFocus()
})

// The focus behaviour below belongs to BasePopover, which every popover shares;
// this is just the one with a harness.
test('Escape hands focus back to the button that opened the popover', async () => {
  const screen = await openPopover()

  await userEvent.keyboard('{Escape}')

  await expect
    .element(screen.getByRole('button', { name: 'Variables' }))
    .toHaveFocus()
})

test('Escape cancels a drag and leaves the popover open', async () => {
  const screen = await openPopover()

  handle(screen, 'Trains').element().focus()
  await userEvent.keyboard('{Space}')
  await userEvent.keyboard('{ArrowDown}')
  await userEvent.keyboard('{Escape}')

  // Past the popover's own close transition
  await new Promise((resolve) => setTimeout(resolve, 300))
  await expect
    .element(screen.getByPlaceholder('Search variables'))
    .toBeVisible()
  expect(movableColumns(screen)).toEqual([
    'Trains',
    'Sample',
    'Sample/Type',
    'Sample/X [mm]',
    'Scan type',
  ])
})

test('a click outside leaves focus on what was clicked', async () => {
  const screen = await openPopover({
    outside: <input aria-label="Elsewhere" />,
  })

  await screen.getByRole('textbox', { name: 'Elsewhere' }).click()

  await expect
    .element(screen.getByRole('textbox', { name: 'Elsewhere' }))
    .toHaveFocus()
})
