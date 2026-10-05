import type { ReactNode } from 'react'
import { userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { beforeEach, expect, test } from 'vitest'

import { setupStore, type AppStore } from '#src/app/store/store'
import { TABLE_META_QUERY } from '#src/data/table/table-data.queries'
import { VariablesPopover } from '#src/features/table/components/popovers/variables-popover'
import { setColumnVisibility } from '#src/features/table/stores/table.slice'
import { metadataClient } from '#tests/support/apollo'
import { withProviders } from '#tests/support/render'

const PROPOSAL = '900405'

// The xpcs example's shape: two pinned columns, two ungrouped ones, and a group
// of two between them, one of its members tagged.
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

const checkbox = (screen: Screen, name: string) =>
  screen.getByRole('checkbox', { name, exact: true })

// The footer link a search turns to its matches, "Hide 3 matches".
const matchesLink = (screen: Screen) =>
  screen.getByRole('button', { name: /^(Hide|Show) \d+ match/ })

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

const currentMatch = () =>
  document.querySelector('[aria-current="true"]')?.textContent

// The letters a search has marked, top to bottom. The popover draws in a
// portal, so they are read from the whole page.
const markedLetters = () =>
  Array.from(document.querySelectorAll('mark'), (mark) => mark.textContent)

// The box's count of the matches, as it reads on screen.
const matchCount = (screen: Screen) => screen.getByText(/^\d+\/\d+$/)

// A list long enough that its last rows sit outside the popover's viewport.
const longListClient = () =>
  metadataClient({
    ...METADATA,
    variables: {
      ...METADATA.variables,
      ...Object.fromEntries(
        Array.from({ length: 60 }, (_, index) => [
          `v${index}`,
          { name: `v${index}`, title: `Variable ${index}`, tags: [] },
        ])
      ),
    },
  })

async function search(screen: Screen, query: string) {
  await screen.getByPlaceholder('Search variables').fill(query)
  // Past the debounce, once the count has come in
  await expect.element(matchCount(screen)).toBeVisible()
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

  const run = checkbox(screen, 'Run')
  await expect.element(run).toBeChecked()
  await expect.element(run).toBeDisabled()
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
  await expect.element(matchCount(screen)).toHaveTextContent('1/3')

  // Step on
  await userEvent.keyboard('{Enter}')
  await expect.element(matchCount(screen)).toHaveTextContent('2/3')

  // Past the last, back to the first
  await userEvent.keyboard('{Enter}')
  await userEvent.keyboard('{Enter}')
  await expect.element(matchCount(screen)).toHaveTextContent('1/3')
})

test('Shift+Enter steps back through the matches, wrapping', async () => {
  const screen = await openPopover()
  await search(screen, 't')

  // Back from the first, round to the last
  await userEvent.keyboard('{Shift>}{Enter}{/Shift}')
  await expect.element(matchCount(screen)).toHaveTextContent('3/3')

  // Back one more
  await userEvent.keyboard('{Shift>}{Enter}{/Shift}')
  await expect.element(matchCount(screen)).toHaveTextContent('2/3')
})

test("an IME's Enter that ends a word does not step to the next match", async () => {
  const screen = await openPopover()
  await search(screen, 't')
  const box = screen.getByPlaceholder('Search variables').element()

  // Safari sends it after the composition ends, as key code 229
  box.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', keyCode: 229, bubbles: true })
  )
  await userEvent.keyboard('{Enter}')

  await expect.element(matchCount(screen)).toHaveTextContent('2/3')
})

test('Enter pressed before the search settles runs it at once, on its first match', async () => {
  const screen = await openPopover()

  await screen.getByPlaceholder('Search variables').fill('type')
  await userEvent.keyboard('{Enter}')

  // Read at once, well inside the debounce, which a poll would wait out
  expect(matchCount(screen).element()).toHaveTextContent('1/2')
})

test('the current match, a row or a group heading, is marked current for screen readers', async () => {
  const screen = await openPopover()
  // The Sample heading, Type, and Scan type
  await search(screen, 'e')
  expect(currentMatch()).toContain('Sample')

  await userEvent.keyboard('{Enter}')
  await expect.poll(currentMatch).toContain('Type')
  expect(currentMatch()).not.toContain('Sample')
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
  await drag(screen, { label: 'Scan type', key: 'ArrowUp' })
  await expect
    .poll(() => movableColumns(screen))
    .toEqual(['Trains', 'Scan type', 'Sample', 'Sample/Type', 'Sample/X [mm]'])
})

test("Tab from a search that names a group lands on the group's handle", async () => {
  const screen = await openPopover()

  await search(screen, 'sample')

  await tabToMatch()
  await expect.element(handle(screen, 'Sample')).toHaveFocus()
})

test('Tab on text not yet searched lands on the first match of that text', async () => {
  const screen = await openPopover()
  await search(screen, 't')

  // One more letter, then Tab well inside the debounce
  await userEvent.keyboard('y')
  await tabToMatch()

  await expect.element(handle(screen, 'Sample/Type')).toHaveFocus()
})

test("Tab lands on a pinned match's checkbox, since it has no handle", async () => {
  const screen = await openPopover()
  await search(screen, 'proposal')

  await tabToMatch()

  await expect.element(checkbox(screen, 'Proposal')).toHaveFocus()
})

test('Tab past a match the keyboard cannot take goes on down the list', async () => {
  const screen = await openPopover()
  // Run's checkbox is disabled, and a pinned row has no handle
  await search(screen, 'run')

  await tabToMatch()

  // The first row, where Tab out of the box goes with no match to take it
  await expect.element(checkbox(screen, 'Proposal')).toHaveFocus()
})

test('a drop keeps the current match on the row it moved', async () => {
  const screen = await openPopover()
  await search(screen, 't')

  // Step on to Scan type, the last of the three, and move it above the group
  await userEvent.keyboard('{Enter}')
  await userEvent.keyboard('{Enter}')
  await drag(screen, { label: 'Scan type', key: 'ArrowUp' })

  // Now the second match in list order, and still the current one
  await expect.element(matchCount(screen)).toHaveTextContent('2/3')
  expect(currentMatch()).toContain('Scan type')
})

test('a drop keeps a current match that was never stepped to', async () => {
  const screen = await openPopover()
  await search(screen, 't')

  // Trains is the first of the three matches, with no Enter pressed
  await drag(screen, { label: 'Trains' })

  // Now the second match in list order, and still the current one
  await expect.element(matchCount(screen)).toHaveTextContent('2/3')
  expect(currentMatch()).toContain('Trains')
})

test('Reset order keeps a current match that was never stepped to', async () => {
  const screen = await openPopover()
  await drag(screen, { label: 'Scan type', key: 'ArrowUp' })
  await drag(screen, { label: 'Scan type', key: 'ArrowUp' })
  await expect.poll(() => movableColumns(screen)).toContain('Scan type')

  // Scan type now leads the three matches, with no Enter pressed
  await search(screen, 't')
  await expect.element(matchCount(screen)).toHaveTextContent('1/3')

  await screen.getByRole('button', { name: 'Reset order' }).click()

  // Back at the end of the list, and still the current one
  await expect.element(matchCount(screen)).toHaveTextContent('3/3')
})

// A click is answered by whatever sits at the point, and the count lies over
// the box, so the element at that point is what a click would reach.
test('a click on the match count reaches the search box under it', async () => {
  const screen = await openPopover()
  await search(screen, 'scan')

  const { left, top, width, height } = matchCount(screen)
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
  await expect.element(matchCount(screen)).toHaveTextContent('3/3')

  // The same word again, past the debounce both ways
  await box.clear()
  await expect.poll(markedLetters).toEqual([])
  await search(screen, 't')

  await expect.element(matchCount(screen)).toHaveTextContent('1/3')
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

  await expect.element(matchCount(screen)).toHaveTextContent('0/0')
  await expect
    .element(screen.getByRole('status'))
    .toHaveTextContent('No matches')
})

test('clearing the search ends it at once, marks and footer link too', async () => {
  const screen = await openPopover()
  await search(screen, 't')
  await expect.element(screen.getByRole('status')).toHaveTextContent('1 of 3')
  expect(markedLetters()).toEqual(['T', 'T', 't'])

  await screen.getByRole('button', { name: 'Clear search' }).click()

  // Read at once, well inside the debounce, which a poll would wait out
  expect(screen.getByRole('status').element()).toHaveTextContent('')
  expect(markedLetters()).toEqual([])
  expect(matchesLink(screen).elements()).toEqual([])
})

test("a new search is never read out with the last search's place", async () => {
  const screen = await openPopover()
  await search(screen, 't')
  // On to Scan type, the last of the three
  await userEvent.keyboard('{Enter}')
  await userEvent.keyboard('{Enter}')
  // Every text the status gives up, even one that lasted a single frame
  const status = screen.getByRole('status')
  const replaced: string[] = []
  new MutationObserver((records) =>
    records.forEach((record) => replaced.push(record.oldValue ?? ''))
  ).observe(status.element(), {
    subtree: true,
    characterData: true,
    characterDataOldValue: true,
  })

  // Scan type is the second of the two matches for "ty"
  await userEvent.keyboard('y')
  await expect.element(status).toHaveTextContent('1 of 2 matches')

  expect(replaced).toEqual(['3 of 3 matches'])
})

test('the count is read out in words as the current match moves', async () => {
  const screen = await openPopover()
  await search(screen, 't')

  await userEvent.keyboard('{Enter}')

  await expect
    .element(screen.getByRole('status'))
    .toHaveTextContent('2 of 3 matches')
})

test('a match far down a long list is brought into view, and the page stays put', async () => {
  client = longListClient()
  // Low enough on the page that the popover runs past its end
  const screen = await openPopover({ outside: <div style={{ height: 400 }} /> })
  expect(document.documentElement.scrollHeight).toBeGreaterThan(
    window.innerHeight
  )
  const match = handle(screen, 'Variable 40')
  await expect.element(match).not.toBeInViewport()

  await search(screen, 'variable 40')

  await expect.element(match).toBeInViewport()
  expect(window.scrollY).toBe(0)
})

test('a match already in view leaves the list where it is', async () => {
  client = longListClient()
  const screen = await openPopover()
  const viewport = handle(screen, 'Variable 0')
    .element()
    .closest('.mantine-ScrollArea-viewport')!
  await expect
    .element(handle(screen, 'Variable 5'))
    .toBeInViewport({ ratio: 1 })

  // Variable 5 is in view, below the middle of the list
  await search(screen, 'variable 5')
  expect(viewport.scrollTop).toBe(0)

  // Variable 50 is out of view, so the list moves to it
  await userEvent.keyboard('{Enter}')
  await expect.element(handle(screen, 'Variable 50')).toBeInViewport()
  expect(viewport.scrollTop).toBeGreaterThan(0)
})

test('Enter brings back a sole match scrolled out of view', async () => {
  client = longListClient()
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

test('the search box clears in one click', async () => {
  const screen = await openPopover()
  await search(screen, 'sample')

  // The button goes with the text it had to clear
  await screen.getByRole('button', { name: 'Clear search' }).click()
  await expect
    .poll(() => screen.getByRole('button', { name: 'Clear search' }).elements())
    .toEqual([])
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

  const trains = checkbox(screen, 'Trains')
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
  await expect.element(checkbox(screen, 'Run')).toBeChecked()
  // Run's checkbox reads checked whatever the store holds, so only the store
  // shows the link never wrote it.
  expect(store.getState().table.columnVisibility).not.toHaveProperty('run')
})

test('under a search the footer link hides only the matches and says how many', async () => {
  const screen = await openPopover()
  await search(screen, 't')

  await screen.getByRole('button', { name: 'Hide 3 matches' }).click()

  await expect.element(checkbox(screen, 'Trains')).not.toBeChecked()
  await expect.element(checkbox(screen, 'Sample/Type')).not.toBeChecked()
  await expect.element(checkbox(screen, 'Scan type')).not.toBeChecked()
  await expect.element(checkbox(screen, 'Sample/X [mm]')).toBeChecked()
})

test('a group found by its heading is left to the link beside the heading', async () => {
  const screen = await openPopover()
  await search(screen, 'sample')

  // The footer says nothing: the heading is the only match, and hiding a group
  // is what the link on the heading is for
  expect(matchesLink(screen).elements()).toEqual([])

  // That link still takes the whole group
  await screen.getByRole('button', { name: 'Hide all Sample' }).click()
  await expect.element(checkbox(screen, 'Sample/Type')).not.toBeChecked()
  await expect.element(checkbox(screen, 'Sample/X [mm]')).not.toBeChecked()
})

test('under a search that finds nothing the footer link goes', async () => {
  const screen = await openPopover()
  // A group's own link names its group, so it does not answer to this
  const footerLink = screen.getByRole('button', {
    name: /^(Hide|Show) (all|\d+ match(es)?)$/,
  })
  await expect.element(footerLink).toBeVisible()

  await search(screen, 'zzz')

  expect(footerLink.elements()).toEqual([])
})

test("a group's link hides every member at once", async () => {
  const screen = await openPopover()

  await screen.getByRole('button', { name: 'Hide all Sample' }).click()

  await expect.element(checkbox(screen, 'Sample/Type')).not.toBeChecked()
  await expect.element(checkbox(screen, 'Sample/X [mm]')).not.toBeChecked()
})

test("a group's link offers to show every member while one is hidden", async () => {
  store.dispatch(setColumnVisibility({ 'sample.x': false }))
  const screen = await openPopover()

  await expect
    .element(screen.getByRole('button', { name: 'Show all Sample' }))
    .toBeVisible()
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

test('the button says whether its popover is open', async () => {
  const screen = await openPopover()
  const button = screen.getByRole('button', { name: 'Variables' })

  // Open
  await expect.element(button).toHaveAttribute('aria-expanded', 'true')

  // Closed with Escape
  await userEvent.keyboard('{Escape}')
  await expect.element(button).toHaveAttribute('aria-expanded', 'false')
})

test('the popover is named Variables whatever its badge says', async () => {
  const screen = await openPopover()

  await expect.element(screen.getByText('1 hidden')).toBeVisible()
  await expect
    .element(screen.getByRole('dialog', { name: 'Variables', exact: true }))
    .toBeVisible()
})

// The focus behaviour below belongs to BasePopover, which every popover shares.
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
