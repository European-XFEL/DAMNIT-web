import { expect, test } from 'vitest'
import { userEvent } from 'vitest/browser'

import ComputedItem from '#src/features/plots/components/computed-item'
import { renderWithProviders } from '#tests/support/render'

// Half an hour clear of the boundary, since the minute clock's now lags the real
// one by up to a minute.
const TWO_HOURS_AGO = Date.now() - 2.5 * 60 * 60 * 1000

// An earlier test can leave the pointer resting where the item draws.
const renderItem = async (ui: Parameters<typeof renderWithProviders>[0]) => {
  const screen = await renderWithProviders(ui)
  await userEvent.unhover(screen.container)
  return screen
}

test('an outdated item names the runs with newer data beside a Reload button', async () => {
  const screen = await renderItem(
    <ComputedItem time={TWO_HOURS_AGO} outdated={[2, 5]} />
  )
  const item = screen.getByRole('button', {
    name: 'Computed: 2 hours ago. Reload',
  })

  await expect.element(item).toBeVisible()

  // A tap clicks with no hover first
  ;(item.element() as HTMLElement).click()

  const bubble = screen.getByRole('dialog')
  await expect
    .element(bubble)
    .toHaveTextContent(
      /^Computed .+ at .+Runs 2 and 5 have newer data\.Reload$/
    )
  await expect
    .element(screen.getByRole('button', { name: 'Reload', exact: true }))
    .toBeVisible()
})

test('a current item has no Reload button', async () => {
  const screen = await renderItem(<ComputedItem time={TWO_HOURS_AGO} />)

  await expect.element(screen.getByText('2 hours ago')).toBeVisible()
  expect(screen.getByRole('button').elements()).toHaveLength(0)
})
