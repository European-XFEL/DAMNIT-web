import { useState } from 'react'
import { expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'

import { VariableCombobox } from '#src/components/comboboxes/variable-combobox'
import type { VariableBlock } from '#src/utils/variable-blocks'
import { renderWithProviders } from '#tests/support/render'

const variableBlocks: VariableBlock[] = [
  { kind: 'variable', name: 'run', title: 'Run', columnTitle: 'Run' },
  {
    kind: 'group',
    name: 'xgm',
    title: 'XGM',
    members: [
      {
        name: 'xgm_intensity',
        title: 'XGM/Intensity',
        columnTitle: 'Intensity',
      },
      { name: 'xgm_pulses', title: 'XGM/Pulses', columnTitle: 'Pulses' },
    ],
  },
  { kind: 'variable', name: 'energy', title: 'Energy', columnTitle: 'Energy' },
]

const beamEnergy: VariableBlock = {
  kind: 'variable',
  name: 'beam_energy',
  title: 'Beam energy',
  columnTitle: 'Beam energy',
}

type PickerProps = {
  blocks?: VariableBlock[]
  initialValue?: string
  onChange?: (name: string) => void
}

// Holds the value the way a form does, so a pick shows up in the field.
function Picker({
  blocks = variableBlocks,
  initialValue = '',
  onChange = () => {},
}: PickerProps) {
  const [value, setValue] = useState(initialValue)
  return (
    <VariableCombobox
      label="Y axis"
      blocks={blocks}
      value={value}
      onChange={(name) => {
        setValue(name)
        onChange(name)
      }}
    />
  )
}

type PickerInFormProps = PickerProps & { onSubmit: () => void }

// The field inside a form with a submit button, as the plot dialog holds it,
// so Enter can either pick an option or submit.
function PickerInForm({ onSubmit, ...pickerProps }: PickerInFormProps) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      <Picker {...pickerProps} />
      <button type="submit">Plot</button>
    </form>
  )
}

test('typing narrows the options case-insensitively', async () => {
  const screen = await renderWithProviders(<Picker />)

  await screen.getByLabelText('Y axis').fill('ENER')

  await expect
    .element(screen.getByRole('option', { name: 'Energy' }))
    .toBeVisible()
  await expect
    .element(screen.getByRole('option', { name: 'Run' }))
    .not.toBeInTheDocument()
})

test('a search that matches nothing says no variables match', async () => {
  const screen = await renderWithProviders(<Picker />)

  await screen.getByLabelText('Y axis').fill('zzz')

  await expect.element(screen.getByText('No variables match')).toBeVisible()
})

test('picking an option reports its name and shows its title in the field', async () => {
  const onChange = vi.fn()
  const screen = await renderWithProviders(<Picker onChange={onChange} />)

  await screen.getByLabelText('Y axis').fill('ener')
  await screen.getByRole('option', { name: 'Energy' }).click()

  expect(onChange).toHaveBeenCalledWith('energy')
  await expect.element(screen.getByLabelText('Y axis')).toHaveValue('Energy')
})

test('a group member is listed by its short title but fills the field with its whole one', async () => {
  const screen = await renderWithProviders(<Picker />)

  await screen.getByLabelText('Y axis').click()
  await screen.getByRole('option', { name: 'Pulses' }).click()

  await expect
    .element(screen.getByLabelText('Y axis'))
    .toHaveValue('XGM/Pulses')
})

test('leaving the field puts the chosen title back over what was typed', async () => {
  const screen = await renderWithProviders(<Picker initialValue="energy" />)

  const input = screen.getByLabelText('Y axis')

  // Type over the chosen title
  await input.fill('xyz')
  await expect.element(input).toHaveValue('xyz')

  // Leave the field
  ;(input.element() as HTMLInputElement).blur()
  await expect.element(input).toHaveValue('Energy')
})

test('opening a field that holds a variable lists every variable', async () => {
  const screen = await renderWithProviders(<Picker initialValue="energy" />)

  await screen.getByLabelText('Y axis').click()

  await expect
    .element(screen.getByRole('option', { name: 'Run' }))
    .toBeVisible()
  await expect
    .element(screen.getByRole('option', { name: 'Energy' }))
    .toBeVisible()
})

test('opening a field that holds a variable highlights that variable', async () => {
  const screen = await renderWithProviders(<Picker initialValue="energy" />)

  await screen.getByLabelText('Y axis').click()

  await expect
    .element(screen.getByRole('option', { name: 'Energy', selected: true }))
    .toBeVisible()
})

test('clicking an empty field highlights nothing, so the first arrow lands on the first variable', async () => {
  const screen = await renderWithProviders(<Picker />)

  await screen.getByLabelText('Y axis').click()
  await userEvent.keyboard('{ArrowDown}')

  await expect
    .element(screen.getByRole('option', { name: 'Run', selected: true }))
    .toBeVisible()
})

test('a search in a field that holds a variable highlights only its first match', async () => {
  const screen = await renderWithProviders(<Picker initialValue="energy" />)

  await screen.getByLabelText('Y axis').fill('e')

  await expect
    .element(screen.getByRole('option', { name: 'Intensity', selected: true }))
    .toBeVisible()
  expect(
    screen.getByRole('option', { selected: true }).elements()
  ).toHaveLength(1)
})

test('Enter picks the highlighted match after a reload adds a variable above it', async () => {
  const onChange = vi.fn()
  const screen = await renderWithProviders(<Picker onChange={onChange} />)

  await screen.getByLabelText('Y axis').fill('e')
  await screen.rerender(
    <Picker onChange={onChange} blocks={[beamEnergy, ...variableBlocks]} />
  )
  await userEvent.keyboard('{Enter}')

  expect(onChange).toHaveBeenCalledWith('xgm_intensity')
})

test('Enter picks the row the arrows reached after a reload adds a variable above it', async () => {
  const onChange = vi.fn()
  const screen = await renderWithProviders(<Picker onChange={onChange} />)

  await screen.getByLabelText('Y axis').click()
  await userEvent.keyboard('{ArrowDown}{ArrowDown}')
  await screen.rerender(
    <Picker onChange={onChange} blocks={[beamEnergy, ...variableBlocks]} />
  )
  await userEvent.keyboard('{Enter}')

  expect(onChange).toHaveBeenCalledWith('xgm_intensity')
})

// The option the field points a screen reader at, by its accessible name.
function announcedOption(input: Element) {
  const id = input.getAttribute('aria-activedescendant')
  return id === null ? null : document.getElementById(id)?.ariaLabel
}

test('a search points a screen reader at its highlighted first match', async () => {
  const screen = await renderWithProviders(<Picker initialValue="energy" />)
  const input = screen.getByLabelText('Y axis')

  await input.fill('e')

  await expect
    .poll(() => announcedOption(input.element()))
    .toBe('XGM/Intensity')
})

test('opening a field that holds a variable points a screen reader at it', async () => {
  const screen = await renderWithProviders(<Picker initialValue="energy" />)
  const input = screen.getByLabelText('Y axis')

  await input.click()

  await expect.poll(() => announcedOption(input.element())).toBe('Energy')
})

test('the arrows move what a screen reader is pointed at', async () => {
  const screen = await renderWithProviders(<Picker />)
  const input = screen.getByLabelText('Y axis')

  await input.click()
  await userEvent.keyboard('{ArrowDown}{ArrowDown}')

  await expect
    .poll(() => announcedOption(input.element()))
    .toBe('XGM/Intensity')
})

test('reopening an empty field points a screen reader at nothing', async () => {
  const screen = await renderWithProviders(<Picker />)
  const input = screen.getByLabelText('Y axis')

  // Arrow down to a variable
  await input.click()
  await userEvent.keyboard('{ArrowDown}{ArrowDown}')
  await expect
    .poll(() => announcedOption(input.element()))
    .toBe('XGM/Intensity')

  // Close the list and open it again
  await userEvent.keyboard('{Escape}')
  await input.click()
  await expect
    .element(screen.getByRole('option', { name: 'Run' }))
    .toBeVisible()
  expect(input.element().getAttribute('aria-activedescendant')).toBeNull()
})

test('a matching member keeps its group heading and drops its siblings', async () => {
  const screen = await renderWithProviders(<Picker />)

  await screen.getByLabelText('Y axis').fill('pulses')

  await expect.element(screen.getByText('XGM', { exact: true })).toBeVisible()
  await expect
    .element(screen.getByRole('option', { name: 'Pulses' }))
    .toBeVisible()
  await expect
    .element(screen.getByRole('option', { name: 'Intensity' }))
    .not.toBeInTheDocument()
})

test("a search matching a group's title keeps all its members", async () => {
  const screen = await renderWithProviders(<Picker />)

  await screen.getByLabelText('Y axis').fill('xgm')

  await expect
    .element(screen.getByRole('option', { name: 'Intensity' }))
    .toBeVisible()
  await expect
    .element(screen.getByRole('option', { name: 'Pulses' }))
    .toBeVisible()
})

test('a group with no matching member disappears, heading and all', async () => {
  const screen = await renderWithProviders(<Picker />)

  await screen.getByLabelText('Y axis').fill('energy')

  await expect
    .element(screen.getByRole('option', { name: 'Energy' }))
    .toBeVisible()
  await expect
    .element(screen.getByText('XGM', { exact: true }))
    .not.toBeInTheDocument()
})

test('arrow keys move through the options and Enter picks one', async () => {
  const onChange = vi.fn()
  const screen = await renderWithProviders(<Picker onChange={onChange} />)

  await screen.getByLabelText('Y axis').click()
  await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}')

  expect(onChange).toHaveBeenCalledWith('xgm_intensity')
  await expect
    .element(screen.getByLabelText('Y axis'))
    .toHaveValue('XGM/Intensity')
})

test('a group member is named by its whole title, since another group can share its short one', async () => {
  const screen = await renderWithProviders(<Picker />)

  await screen.getByLabelText('Y axis').click()

  await expect
    .element(screen.getByRole('option', { name: 'XGM/Intensity', exact: true }))
    .toBeVisible()
})

test('Enter after typing picks the first match instead of submitting the form', async () => {
  const onChange = vi.fn()
  const onSubmit = vi.fn()
  const screen = await renderWithProviders(
    <PickerInForm
      initialValue="energy"
      onChange={onChange}
      onSubmit={onSubmit}
    />
  )

  await screen.getByLabelText('Y axis').fill('puls')
  await userEvent.keyboard('{Enter}')

  expect(onChange).toHaveBeenCalledWith('xgm_pulses')
  await expect
    .element(screen.getByLabelText('Y axis'))
    .toHaveValue('XGM/Pulses')
  expect(onSubmit).not.toHaveBeenCalled()
})

test('Enter on a search that matches nothing submits nothing until the search is gone', async () => {
  const onSubmit = vi.fn()
  const screen = await renderWithProviders(
    <PickerInForm initialValue="energy" onSubmit={onSubmit} />
  )
  const input = screen.getByLabelText('Y axis')

  // A search with no match
  await input.fill('zzz')
  await userEvent.keyboard('{Enter}')
  expect(onSubmit).not.toHaveBeenCalled()
  await expect.element(input).toHaveValue('zzz')

  // Leave and come back, so the field shows its variable again
  ;(input.element() as HTMLInputElement).blur()
  ;(input.element() as HTMLInputElement).focus()
  await expect.element(input).toHaveValue('Energy')
  await userEvent.keyboard('{Enter}')
  expect(onSubmit).toHaveBeenCalledOnce()
})
