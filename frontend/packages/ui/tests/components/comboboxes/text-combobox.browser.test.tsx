import { describe, expect, test, vi } from 'vitest'

import TextCombobox from '@/components/comboboxes/text-combobox'
import { renderWithProviders } from '../../test-utils'

const options = [
  { name: 'energy', title: 'Energy' },
  { name: 'delay', title: 'Delay' },
]

describe('TextCombobox', () => {
  test('filters options case-insensitively as you type', async () => {
    const screen = await renderWithProviders(
      <TextCombobox options={options} value="" setValue={vi.fn()} />
    )

    await screen.getByRole('textbox').fill('ener')

    await expect.element(screen.getByText('Energy')).toBeVisible()
    await expect.element(screen.getByText('Delay')).not.toBeInTheDocument()
  })

  test('shows "Variable not found" when nothing matches', async () => {
    const screen = await renderWithProviders(
      <TextCombobox options={options} value="" setValue={vi.fn()} />
    )

    await screen.getByRole('textbox').fill('zzz')

    await expect.element(screen.getByText('Variable not found')).toBeVisible()
  })

  test('selecting an option reports its name and shows its title', async () => {
    const setValue = vi.fn()
    const screen = await renderWithProviders(
      <TextCombobox options={options} value="" setValue={setValue} />
    )

    await screen.getByRole('textbox').fill('ener')
    await screen.getByText('Energy').click()

    expect(setValue).toHaveBeenCalledWith('energy')
    await expect.element(screen.getByRole('textbox')).toHaveValue('Energy')
  })

  test('blur reverts the input to the title derived from value', async () => {
    const screen = await renderWithProviders(
      <TextCombobox options={options} value="energy" setValue={vi.fn()} />
    )

    const input = screen.getByRole('textbox')
    await expect.element(input).toHaveValue('Energy')

    await input.fill('xyz')
    await expect.element(input).toHaveValue('xyz')
    ;(input.element() as HTMLInputElement).blur()
    await expect.element(input).toHaveValue('Energy')
  })
})
