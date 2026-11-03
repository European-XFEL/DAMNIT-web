import { expect, test } from 'vitest'

import ProposalIdentity from '#src/features/dashboard/components/proposal-identity'
import { renderWithProviders } from '#tests/support/render'
import { resizeViewport } from '#tests/support/viewport'

function renderIdentity() {
  return renderWithProviders(
    <ProposalIdentity instrument="MID" label="p6996" detail="Christian Gutt" />
  )
}

test('the identity keeps the proposal and drops the detail below `sm`', async () => {
  const screen = await renderIdentity()

  // On a phone the instrument and its proposal are whole, the PI has stepped out
  await expect.element(screen.getByText('MID')).toBeVisible()
  await expect.element(screen.getByText('p6996')).toBeVisible()
  await expect.element(screen.getByText('Christian Gutt')).not.toBeVisible()

  // Widened, the PI comes back beside it
  await resizeViewport({ width: 1024, height: 768 })

  await expect.element(screen.getByText('Christian Gutt')).toBeVisible()
})
