import { userEvent } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { expect, test } from 'vitest'

import { setupStore } from '#src/app/store/store'
import { TableToolbar } from '#src/features/table/components/table-toolbar'
import { metadataClient } from '#tests/support/apollo'
import { withProviders } from '#tests/support/render'

test('Fit all columns shows its tooltip when tabbed to', async () => {
  const store = setupStore()
  // The query is skipped with no proposal, but Apollo still needs a client.
  const client = metadataClient({})
  const screen = await render(
    <TableToolbar onFitAllColumns={() => {}} onResetColumnWidths={() => {}} />,
    { wrapper: withProviders({ store, client }) }
  )

  // Variables and Tags come first in the tab order.
  await userEvent.tab()
  await userEvent.tab()
  await userEvent.tab()

  await expect
    .element(screen.getByRole('button', { name: 'Fit all columns' }))
    .toHaveFocus()
  await expect
    .element(screen.getByRole('tooltip', { name: 'Fit all columns' }))
    .toBeVisible()
})
