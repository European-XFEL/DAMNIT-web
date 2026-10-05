import { afterEach, expect, test, vi } from 'vitest'

import CellErrorCard from '#src/components/feedback/cell-error-card'
import { renderWithProviders } from '#tests/support/render'

const XGM_ERROR = {
  cls: 'ValueError',
  message: "Couldn't find an XGM in the run",
}

const clipboardDescriptor = Object.getOwnPropertyDescriptor(
  Navigator.prototype,
  'clipboard'
)

afterEach(() => {
  if (clipboardDescriptor) {
    Object.defineProperty(Navigator.prototype, 'clipboard', clipboardDescriptor)
  }
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

test('the copy button says the copy failed when the browser refuses it', async () => {
  vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(
    new Error('Write permission denied')
  )
  const screen = await renderWithProviders(
    <CellErrorCard error={XGM_ERROR} variant="panel" />
  )

  await screen.getByRole('button', { name: 'Copy' }).click()

  await expect
    .element(screen.getByRole('button', { name: 'Copy failed' }))
    .toBeVisible()
})

test('a copy that works after a failed one says Copied', async () => {
  vi.spyOn(navigator.clipboard, 'writeText')
    .mockRejectedValueOnce(new Error('Document is not focused'))
    .mockResolvedValue(undefined)
  const screen = await renderWithProviders(
    <CellErrorCard error={XGM_ERROR} variant="panel" />
  )

  // The first copy fails
  await screen.getByRole('button', { name: 'Copy' }).click()
  await expect
    .element(screen.getByRole('button', { name: 'Copy failed' }))
    .toBeVisible()

  // The second one works
  await screen.getByRole('button', { name: 'Copy failed' }).click()
  await expect
    .element(screen.getByRole('button', { name: 'Copied' }))
    .toBeVisible()
})

test('the copy button says the copy failed on a page without a clipboard', async () => {
  // A plain-http origin does not expose navigator.clipboard at all.
  delete (Navigator.prototype as { clipboard?: Clipboard }).clipboard
  const screen = await renderWithProviders(
    <CellErrorCard error={XGM_ERROR} variant="tooltip" />
  )

  await screen.getByRole('button', { name: 'Copy' }).click()

  await expect
    .element(screen.getByRole('button', { name: 'Copy failed' }))
    .toBeVisible()
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
