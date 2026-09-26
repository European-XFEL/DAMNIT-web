import { ApolloClient, ApolloLink, InMemoryCache } from '@apollo/client'
import { expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'

import { setupStore } from '#src/app/store/store'
import { setProposalPending } from '#src/data/metadata/metadata.slice'
import { TABLE_META_QUERY } from '#src/data/table/table-data.queries'
import PlotDialog from '#src/features/plots/plot-dialog'
import { withProviders } from '#tests/support/render'

const PROPOSAL = '6996'

// The dialog reads its variables from the metadata the proposal already
// cached, so a link that answers nothing leaves the seeded cache as the source.
async function renderDialog() {
  const store = setupStore()
  store.dispatch(setProposalPending(PROPOSAL))

  const cache = new InMemoryCache()
  cache.writeQuery({
    query: TABLE_META_QUERY,
    variables: { proposal: PROPOSAL },
    data: {
      metadata: {
        runs: [],
        variables: {
          run: { name: 'run', title: 'Run', tags: [] },
          energy: { name: 'energy', title: 'Energy', tags: [] },
        },
        tags: {},
        groups: {},
        timestamp: 0,
      },
    },
  })
  const client = new ApolloClient({ cache, link: new ApolloLink(() => null) })

  const close = vi.fn()
  const dialog = await render(<PlotDialog opened close={close} />, {
    wrapper: withProviders({ store, client }),
  })
  return { dialog, store, close }
}

test('a plot made in the dialog opens as the view and closes the dialog', async () => {
  const { dialog, store, close } = await renderDialog()

  await dialog.getByLabelText('Y axis').fill('Energy')
  await dialog.getByRole('option', { name: 'Energy' }).click()
  await dialog.getByRole('button', { name: 'Plot' }).click()

  const { activeView } = store.getState().dashboard
  expect(activeView.kind).toBe('plot')
  expect(Object.values(store.getState().plots.data)).toEqual([
    { variables: ['run', 'energy'], source: 'summary', name: 'Energy vs. Run' },
  ])
  expect(close).toHaveBeenCalledOnce()
})

test('the dialog opens on the Y field with its list closed, so nothing covers the form', async () => {
  const { dialog } = await renderDialog()

  await expect.element(dialog.getByLabelText('Y axis')).toHaveFocus()
  await expect.element(dialog.getByRole('listbox')).not.toBeInTheDocument()
})

test('Escape closes the open variable list before the dialog', async () => {
  const { dialog, close } = await renderDialog()
  await expect.element(dialog.getByLabelText('Y axis')).toHaveFocus()

  // Open the list from the keyboard
  await userEvent.keyboard('{ArrowDown}')
  await expect.element(dialog.getByRole('listbox')).toBeVisible()

  // The first Escape closes the list
  await userEvent.keyboard('{Escape}')
  await expect.element(dialog.getByRole('listbox')).not.toBeInTheDocument()
  expect(close).not.toHaveBeenCalled()

  // The second closes the dialog
  await userEvent.keyboard('{Escape}')
  expect(close).toHaveBeenCalledOnce()
})
