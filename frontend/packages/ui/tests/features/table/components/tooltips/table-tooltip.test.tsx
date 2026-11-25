import { expect, test } from 'vitest'

import { TableTooltip } from '#src/features/table/components/tooltips/table-tooltip'
import { renderWithProviders } from '#tests/support/render'

// The card floats over a sparkline cell with its arrow pointing down at the
// cell's top edge, where a spike's tip sits 4 px inside.
test("the empty half of the card's arrow lets the pointer through", async () => {
  const screen = await renderWithProviders(
    <TableTooltip
      target={{ kind: 'sparkline', x: 2, y: 10 }}
      layerProps={{
        ref: () => {},
        style: { position: 'fixed', top: 100, left: 100 },
      }}
      arrowProps={{
        ref: () => {},
        layerSide: 'top',
        style: { position: 'absolute', top: '100%', left: 20 },
      }}
      arrowSize={8}
      onMouseEnter={() => {}}
      onMouseLeave={() => {}}
    />
  )
  await expect.element(screen.getByText('y: 10')).toBeVisible()
  // The arrow is a bare svg with no role, so no locator reaches it.
  const arrow = document.querySelector('svg')!
  const { left, width, bottom } = arrow.getBoundingClientRect()

  const underPointer = document.elementFromPoint(left + width / 2, bottom - 2)

  expect(arrow.contains(underPointer)).toBe(false)
})
