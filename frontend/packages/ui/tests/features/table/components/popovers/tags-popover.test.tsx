import { userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { beforeEach, expect, test } from 'vitest'

import { setupStore, type AppStore } from '#src/app/store/store'
import { TagsPopover } from '#src/features/table/components/popovers/tags-popover'
import { setTagSelection } from '#src/features/table/stores/table.slice'
import { metadataClient } from '#tests/support/apollo'
import { withProviders } from '#tests/support/render'

const PROPOSAL = '900405'

// `Timing` tags only the run number, which nobody can hide, so it lists no
// columns. Collation sorts `_raw` above the server's own `(Untagged)`.
const METADATA = {
  __typename: 'TableMeta',
  variables: {
    run: { name: 'run', title: 'Run', tags: ['Timing'] },
    n_trains: { name: 'n_trains', title: 'Trains', tags: ['Run details'] },
    xgm: {
      name: 'xgm',
      title: 'XGM intensity [uJ]',
      tags: ['Beam properties', '_raw'],
    },
    scan_type: {
      name: 'scan_type',
      title: 'Scan type',
      tags: ['Run details'],
    },
    comment: { name: 'comment', title: 'Comment', tags: [] },
  },
  runs: [],
  tags: {
    '(Untagged)': { id: 0, name: '(Untagged)', variables: ['comment'] },
    _raw: { id: 4, name: '_raw', variables: ['xgm'] },
    'Beam properties': { id: 1, name: 'Beam properties', variables: ['xgm'] },
    'Run details': {
      id: 2,
      name: 'Run details',
      variables: ['n_trains', 'scan_type'],
    },
    Timing: { id: 3, name: 'Timing', variables: ['run'] },
  },
  groups: {},
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

async function openPopover() {
  const screen = await render(<TagsPopover />, {
    wrapper: withProviders({ store, client }),
  })

  await screen.getByRole('button', { name: 'Tags' }).click()
  // The popover moves focus onto its search box a tick after it opens.
  await expect.element(screen.getByPlaceholder('Search tags')).toHaveFocus()

  return screen
}

// What the list shows, top to bottom, read from each row's checkbox.
function listedTags(screen: Awaited<ReturnType<typeof openPopover>>) {
  return screen
    .getByRole('checkbox')
    .elements()
    .map((element) => element.getAttribute('aria-label'))
}

test('(Untagged) leads the list, ahead of a tag that sorts before it', async () => {
  const screen = await openPopover()

  expect(listedTags(screen)).toEqual([
    '(Untagged)',
    '_raw',
    'Beam properties',
    'Run details',
    'Timing',
  ])
})

test('(Untagged) is set in italics, unlike a tag the user wrote', async () => {
  const screen = await openPopover()
  const fontStyle = (name: string) =>
    getComputedStyle(screen.getByText(name, { exact: true }).element())
      .fontStyle

  expect(fontStyle('(Untagged)')).toBe('italic')
  expect(fontStyle('_raw')).toBe('normal')
})

test('the search matches a tag by name, whatever its case and spacing', async () => {
  const screen = await openPopover()

  await screen.getByPlaceholder('Search tags').fill('  RUN ')

  await expect.poll(() => listedTags(screen)).toEqual(['Run details'])
})

test('a search that matches nothing says so', async () => {
  const screen = await openPopover()

  await screen.getByPlaceholder('Search tags').fill('zzz')

  await expect.element(screen.getByText('No tags match')).toBeVisible()
})

test('Clear all drops the tags the search is hiding too', async () => {
  store.dispatch(
    setTagSelection({ 'Beam properties': true, 'Run details': true })
  )
  const screen = await openPopover()

  // Narrow the list to one of the two selected tags
  await screen.getByPlaceholder('Search tags').fill('run')
  await expect.poll(() => listedTags(screen)).toEqual(['Run details'])

  // Clear the selection
  await screen.getByRole('button', { name: 'Clear all' }).click()

  // With the search cleared, the tag it was hiding is unselected too
  await screen.getByRole('button', { name: 'Clear search' }).click()
  await expect
    .element(
      screen.getByRole('checkbox', { name: 'Beam properties', exact: true })
    )
    .not.toBeChecked()
})

test('a tag opens the variables it would show', async () => {
  const screen = await openPopover()

  await screen.getByRole('button', { name: 'Run details', exact: true }).click()

  await expect.element(screen.getByText('Variables')).toBeVisible()
  await expect.element(screen.getByText('Scan type')).toBeVisible()
  await expect.element(screen.getByText('Trains')).toBeVisible()
})

test('a tag with no column the user can hide has nothing to open', async () => {
  const screen = await openPopover()

  await expect.element(screen.getByText('Timing')).toBeVisible()
  expect(
    screen.getByRole('button', { name: 'Timing', exact: true }).elements()
  ).toEqual([])
})

test("the keyboard reaches a tag's variables from the search box", async () => {
  const screen = await openPopover()
  const tag = screen.getByRole('button', { name: '(Untagged)', exact: true })

  // Tab out of the search box onto the first tag
  await userEvent.tab()
  await expect.element(tag).toHaveFocus()

  // Open it
  await userEvent.keyboard('{Enter}')
  await expect.element(tag).toHaveAttribute('aria-expanded', 'true')
  await expect.element(screen.getByText('Comment')).toBeVisible()
})
