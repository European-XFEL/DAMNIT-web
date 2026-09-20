import type { ReactNode } from 'react'
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

const background = (element: Element) =>
  getComputedStyle(element).backgroundColor

// The ground under a row's marked letters, which the current match deepens.
const markIn = (row: Element) => background(row.querySelector('mark')!)

// The letters a search has marked, top to bottom. The popover draws in a
// portal, so they are read from the whole page.
const markedLetters = () =>
  Array.from(document.querySelectorAll('mark'), (mark) => mark.textContent)

// The box's count of the matches, as it reads on screen.
const findCount = (screen: Screen) => screen.getByText(/^\d+\/\d+$/)

// A list long enough that its last rows sit outside the popover's viewport.
const manyVariables = () =>
  Object.fromEntries(
    Array.from({ length: 60 }, (_, index) => [
      `v${index}`,
      { name: `v${index}`, title: `Variable ${index}`, tags: [] },
    ])
  )

async function search(screen: Screen, query: string) {
  await screen.getByPlaceholder('Search variables').fill(query)
  // Past the debounce, once the count has come in
  await expect.element(findCount(screen)).toBeVisible()
}

// Out of the box, past the clear button Tab reaches first, and into the list.
async function tabToMatch() {
  await userEvent.tab()
  await userEvent.tab()
}

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

// The popover always draws two lines of its own, above and below the list.
const lines = (screen: Screen) =>
  screen.getByRole('separator').elements().length

test('a line parts the pinned rows from the rows that move', async () => {
  const screen = await openPopover()

  expect(lines(screen)).toBe(3)
})

test('no line is drawn under pinned rows with nothing below them', async () => {
  const { proposal, run } = METADATA.variables
  client = metadataClient({ ...METADATA, variables: { proposal, run } })
  const screen = await openPopover()
  await expect.element(screen.getByText('Proposal')).toBeVisible()

  expect(lines(screen)).toBe(2)
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
  expect(store.getState().table.lastFlash?.columns).toEqual(['n_trains'])
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

test('a search marks the letters it matched and leaves every row in place', async () => {
  const screen = await openPopover()

  await search(screen, 'type')

  expect(markedLetters()).toEqual(['Type', 'type'])
  expect(movableColumns(screen)).toEqual([
    'Trains',
    'Sample',
    'Sample/Type',
    'Sample/X [mm]',
    'Scan type',
  ])
})

test('the box counts the matches and Enter steps through them, wrapping', async () => {
  const screen = await openPopover()
  // Trains, Type and Scan type
  await search(screen, 't')
  await expect.element(findCount(screen)).toHaveTextContent('1/3')

  await userEvent.keyboard('{Enter}')
  await expect.element(findCount(screen)).toHaveTextContent('2/3')

  await userEvent.keyboard('{Enter}')
  await userEvent.keyboard('{Enter}')
  await expect.element(findCount(screen)).toHaveTextContent('1/3')
})

test('the current match is lit and its mark deepens, and Enter moves both on', async () => {
  const screen = await openPopover()
  const unlit = background(rowOf(screen, 'Run'))
  await search(screen, 't')

  // On the first match
  const ordinaryMark = markIn(rowOf(screen, 'Type'))
  expect(background(rowOf(screen, 'Trains'))).not.toBe(unlit)
  expect(markIn(rowOf(screen, 'Trains'))).not.toBe(ordinaryMark)
  expect(background(rowOf(screen, 'Type'))).toBe(unlit)

  // Stepped on to the second
  await userEvent.keyboard('{Enter}')
  await expect.poll(() => background(rowOf(screen, 'Type'))).not.toBe(unlit)
  expect(markIn(rowOf(screen, 'Type'))).not.toBe(ordinaryMark)
  expect(background(rowOf(screen, 'Trains'))).toBe(unlit)
  expect(markIn(rowOf(screen, 'Trains'))).toBe(ordinaryMark)
})

test('Tab leaves the search box through the button that clears it', async () => {
  const screen = await openPopover()
  await search(screen, 'scan')

  await userEvent.tab()

  await expect
    .element(screen.getByRole('button', { name: 'Clear search' }))
    .toHaveFocus()
})

test("Tab from the search box lands on the current match's handle, ready to drag", async () => {
  const screen = await openPopover()
  await search(screen, 'scan')

  // Tab into the list
  await tabToMatch()
  await expect.element(handle(screen, 'Scan type')).toHaveFocus()

  // One place up, past the group
  await userEvent.keyboard('{Space}')
  await userEvent.keyboard('{ArrowUp}')
  await userEvent.keyboard('{Space}')
  await expect
    .poll(() => movableColumns(screen))
    .toEqual(['Trains', 'Scan type', 'Sample', 'Sample/Type', 'Sample/X [mm]'])
})

test('a group heading is one match, and Tab lands on its handle', async () => {
  const screen = await openPopover()

  await search(screen, 'sample')
  await expect.element(findCount(screen)).toHaveTextContent('1/1')
  expect(markedLetters()).toEqual(['Sample'])

  await tabToMatch()
  await expect.element(handle(screen, 'Sample')).toHaveFocus()
})

test("Tab lands on a pinned match's checkbox, since it has no handle", async () => {
  const screen = await openPopover()
  await search(screen, 'proposal')

  await tabToMatch()

  await expect
    .element(screen.getByRole('checkbox', { name: 'Proposal', exact: true }))
    .toHaveFocus()
})

test('Tab past a match the keyboard cannot take goes on down the list', async () => {
  const screen = await openPopover()
  // Run's checkbox is disabled, and a pinned row has no handle
  await search(screen, 'run')

  await tabToMatch()

  // The first row, where Tab out of the box goes with no match to take it
  await expect
    .element(screen.getByRole('checkbox', { name: 'Proposal', exact: true }))
    .toHaveFocus()
})

test('a drop keeps the find on the row it moved', async () => {
  const screen = await openPopover()
  await search(screen, 't')

  // Step on to Scan type, the last of the three, and move it above the group
  await userEvent.keyboard('{Enter}')
  await userEvent.keyboard('{Enter}')
  await drag(screen, { label: 'Scan type', key: 'ArrowUp' })

  // Now the second match in list order, and still the current one
  await expect.element(findCount(screen)).toHaveTextContent('2/3')
  expect(background(rowOf(screen, 'Scan type'))).not.toBe(
    background(rowOf(screen, 'Run'))
  )
})

test('a drop keeps the find on a match it never stepped to', async () => {
  const screen = await openPopover()
  await search(screen, 't')

  // Trains is the first of the three matches, with no Enter pressed
  await drag(screen, { label: 'Trains' })

  // Now the second match in list order, and still the current one
  await expect.element(findCount(screen)).toHaveTextContent('2/3')
  expect(background(rowOf(screen, 'Trains'))).not.toBe(
    background(rowOf(screen, 'Run'))
  )
})

// A click is answered by whatever sits at the point, and the count lies over
// the box, so the element at that point is what a click would reach.
test('a click on the find count reaches the search box under it', async () => {
  const screen = await openPopover()
  await search(screen, 'scan')

  const { left, top, width, height } = findCount(screen)
    .element()
    .getBoundingClientRect()
  const hit = document.elementFromPoint(left + width / 2, top + height / 2)

  expect(hit).toBe(screen.getByPlaceholder('Search variables').element())
})

test('a search typed again starts at its first match', async () => {
  const screen = await openPopover()
  const box = screen.getByPlaceholder('Search variables')
  await search(screen, 't')

  // On to the last of the three
  await userEvent.keyboard('{Enter}')
  await userEvent.keyboard('{Enter}')
  await expect.element(findCount(screen)).toHaveTextContent('3/3')

  // The same word again, past the debounce both ways
  await box.clear()
  await expect.poll(markedLetters).toEqual([])
  await search(screen, 't')

  await expect.element(findCount(screen)).toHaveTextContent('1/3')
})

test('a search landing mid-drag marks nothing until the drop', async () => {
  const screen = await openPopover()

  // Type, then lift a column before the search has settled
  await screen.getByPlaceholder('Search variables').fill('t')
  handle(screen, 'Trains').element().focus()
  await userEvent.keyboard('{Space}')

  // Past the debounce
  await new Promise((resolve) => setTimeout(resolve, 400))
  expect(markedLetters()).toEqual([])

  // Dropped where it was lifted
  await userEvent.keyboard('{Space}')
  await expect.poll(markedLetters).toEqual(['T', 'T', 't'])
})

test('a search that matches nothing says so', async () => {
  const screen = await openPopover()

  await search(screen, 'zzz')

  await expect.element(findCount(screen)).toHaveTextContent('0/0')
  await expect
    .element(screen.getByRole('status'))
    .toHaveTextContent('No matches')
})

test('the count is read out in words as the find moves', async () => {
  const screen = await openPopover()
  await search(screen, 't')

  await userEvent.keyboard('{Enter}')

  await expect
    .element(screen.getByRole('status'))
    .toHaveTextContent('2 of 3 matches')
})

test('a match far down a long list is brought into view, and the page stays put', async () => {
  client = metadataClient({
    ...METADATA,
    variables: { ...METADATA.variables, ...manyVariables() },
  })
  const screen = await openPopover()
  const last = handle(screen, 'Variable 59')
  await expect.element(last).not.toBeInViewport()

  await search(screen, 'variable 59')

  await expect.element(last).toBeInViewport()
  expect([window.scrollX, window.scrollY]).toEqual([0, 0])
})

test('Enter brings back a sole match scrolled out of view', async () => {
  client = metadataClient({
    ...METADATA,
    variables: { ...METADATA.variables, ...manyVariables() },
  })
  const screen = await openPopover()
  const last = handle(screen, 'Variable 59')
  await search(screen, 'variable 59')
  await expect.element(last).toBeInViewport()

  // Scrolled back up, away from the only match
  handle(screen, 'Variable 0').element().scrollIntoView()
  await expect.element(last).not.toBeInViewport()

  await userEvent.keyboard('{Enter}')

  await expect.element(last).toBeInViewport()
})

// A browser names the box by its placeholder anyway, so only the attribute
// shows that the name no longer rests on that fallback.
test('the search box carries a name of its own', async () => {
  const screen = await openPopover()

  await expect
    .element(screen.getByPlaceholder('Search variables'))
    .toHaveAttribute('aria-label', 'Search variables')
})

test('the search box clears in one click', async () => {
  const screen = await openPopover()
  await search(screen, 'sample')
  expect(markedLetters()).toEqual(['Sample'])

  // The marks go, and the button with the text it had to clear
  await screen.getByRole('button', { name: 'Clear search' }).click()
  await expect.poll(markedLetters).toEqual([])
  expect(
    screen.getByRole('button', { name: 'Clear search' }).elements()
  ).toEqual([])
})

test('clearing the search hands focus back to the search box', async () => {
  const screen = await openPopover()
  const box = screen.getByPlaceholder('Search variables')

  await box.fill('sample')
  await screen.getByRole('button', { name: 'Clear search' }).click()

  await expect.element(box).toHaveFocus()
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

test('under a search the footer link hides only the matches and says how many', async () => {
  const screen = await openPopover()
  const checkbox = (name: string) =>
    screen.getByRole('checkbox', { name, exact: true })
  await search(screen, 't')

  await screen.getByRole('button', { name: 'Hide 3 matches' }).click()

  await expect.element(checkbox('Trains')).not.toBeChecked()
  await expect.element(checkbox('Sample/Type')).not.toBeChecked()
  await expect.element(checkbox('Scan type')).not.toBeChecked()
  await expect.element(checkbox('Sample/X [mm]')).toBeChecked()
})

test('a group found by its heading is left to the link beside the heading', async () => {
  const screen = await openPopover()
  const checkbox = (name: string) =>
    screen.getByRole('checkbox', { name, exact: true })
  await search(screen, 'sample')

  // The footer says nothing: the heading is the only match, and hiding a group
  // is what the link on the heading is for
  expect(
    screen.getByRole('button', { name: /^(Hide|Show) \d+ match/ }).elements()
  ).toEqual([])

  // That link still takes the whole group
  await screen.getByRole('button', { name: 'Hide all Sample' }).click()
  await expect.element(checkbox('Sample/Type')).not.toBeChecked()
  await expect.element(checkbox('Sample/X [mm]')).not.toBeChecked()
})

test('under a search that finds nothing the footer link goes', async () => {
  const screen = await openPopover()

  await search(screen, 'zzz')

  // A group's own link names its group, so it does not answer to this
  expect(
    screen
      .getByRole('button', { name: /^(Hide|Show) (all|\d+ match(es)?)$/ })
      .elements()
  ).toEqual([])
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
test('the button says its popover is open', async () => {
  const screen = await openPopover()

  await expect
    .element(screen.getByRole('button', { name: 'Variables' }))
    .toHaveAttribute('aria-expanded', 'true')
})

test('the popover takes the name of the button that opened it', async () => {
  const screen = await openPopover()

  // The button's name carries its badge too, so only its start is fixed
  await expect
    .element(screen.getByRole('dialog', { name: /^Variables/ }))
    .toBeVisible()
})

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
