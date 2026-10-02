import { afterEach, expect, test, vi } from 'vitest'

import CellErrorCard from '#src/components/feedback/cell-error-card'
import { renderWithProviders } from '#tests/support/render'

const XGM_ERROR = {
  cls: 'ValueError',
  message: "Couldn't find an XGM in the run",
}

const LONG_SOURCE =
  'SA2_XTD1_XGM_DOOCS_output_data_intensitySa1TD_pulseEnergy_photonFlux_averaged'

afterEach(() => {
  vi.restoreAllMocks()
})

test('copying an error puts its class and message on the clipboard', async () => {
  const writeText = vi
    .spyOn(navigator.clipboard, 'writeText')
    .mockResolvedValue(undefined)
  const screen = await renderWithProviders(
    <CellErrorCard error={XGM_ERROR} variant="panel" />
  )

  await screen.getByRole('button', { name: 'Copy' }).click()

  await expect
    .element(screen.getByRole('button', { name: 'Copied' }))
    .toBeVisible()
  expect(writeText).toHaveBeenCalledWith(
    "ValueError\nCouldn't find an XGM in the run"
  )
})

test('a copied mark does not carry over to the next error', async () => {
  vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
  const screen = await renderWithProviders(
    <CellErrorCard error={XGM_ERROR} variant="tooltip" />
  )
  await screen.getByRole('button', { name: 'Copy' }).click()
  await expect
    .element(screen.getByRole('button', { name: 'Copied' }))
    .toBeVisible()

  await screen.rerender(
    <CellErrorCard
      error={{ cls: 'SourceNameError', message: 'No source SA3_XTD10_XGM' }}
      variant="tooltip"
    />
  )

  // A poll could wait out the 1.5 s reset and pass without it.
  expect(screen.getByRole('button', { name: 'Copy' }).element()).toBeVisible()
})

test('a long word in the message wraps inside the card', async () => {
  const screen = await renderWithProviders(
    <div data-testid="frame" style={{ width: 360 }}>
      <CellErrorCard
        error={{ cls: 'SourceNameError', message: `No source ${LONG_SOURCE}` }}
        variant="tooltip"
      />
    </div>
  )
  const copy = screen.getByRole('button', { name: 'Copy' })
  await expect.element(copy).toBeVisible()

  const frame = screen.getByTestId('frame').element().getBoundingClientRect()
  const message = screen.getByText(LONG_SOURCE, { exact: false }).element()
  expect(message.getBoundingClientRect().right).toBeLessThanOrEqual(frame.right)
  expect(copy.element().getBoundingClientRect().right).toBeLessThanOrEqual(
    frame.right
  )
})
