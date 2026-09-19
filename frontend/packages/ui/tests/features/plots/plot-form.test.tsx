import { expect, test, vi } from 'vitest'

import { PlotForm } from '#src/features/plots/plot-form'
import type { VariableBlock } from '#src/utils/variable-blocks'
import { renderWithProviders } from '#tests/support/render'

const blocks: VariableBlock[] = [
  { kind: 'variable', name: 'run', title: 'Run', columnTitle: 'Run' },
  {
    kind: 'group',
    name: 'xgm',
    title: 'XGM',
    members: [
      { name: 'xgm_pulses', title: 'XGM/Pulses', columnTitle: 'Pulses' },
    ],
  },
  { kind: 'variable', name: 'energy', title: 'Energy', columnTitle: 'Energy' },
]

async function renderForm() {
  const onSubmit = vi.fn()
  const onCancel = vi.fn()
  const form = await renderWithProviders(
    <PlotForm blocks={blocks} onSubmit={onSubmit} onCancel={onCancel} />
  )
  return { form, onSubmit, onCancel }
}

type Form = Awaited<ReturnType<typeof renderForm>>['form']

async function choose(
  form: Form,
  { label, option }: { label: string; option: string }
) {
  await form.getByLabelText(label).fill(option)
  await form.getByRole('option', { name: option }).click()
}

test('Preview drops the X axis and names the Y field Variable', async () => {
  const { form } = await renderForm()

  await form.getByText('Preview').click()

  await expect.element(form.getByLabelText('Variable')).toBeVisible()
  await expect.element(form.getByLabelText('Y axis')).not.toBeInTheDocument()
  await expect.element(form.getByLabelText('X axis')).not.toBeInTheDocument()
})

test('Preview asks for runs with a bare input and no All runs choice', async () => {
  const { form } = await renderForm()

  await form.getByText('Preview').click()

  await expect
    .element(form.getByRole('textbox', { name: 'Runs' }))
    .toBeVisible()
  await expect
    .element(form.getByRole('radio', { name: 'All runs' }))
    .not.toBeInTheDocument()
})

test('a summary shows the runs input only once Custom is picked', async () => {
  const { form } = await renderForm()
  const runsInput = form.getByRole('textbox', { name: 'Runs' })

  // All runs, the default
  await expect
    .element(form.getByRole('radio', { name: 'All runs' }))
    .toBeChecked()
  await expect.element(runsInput).not.toBeInTheDocument()

  // Custom
  await form.getByText('Custom').click()
  await expect.element(runsInput).toBeVisible()

  // Back to All runs
  await form.getByText('All runs').click()
  await expect.element(runsInput).not.toBeInTheDocument()
})

test('submitting without a Y variable asks for one and plots nothing', async () => {
  const { form, onSubmit } = await renderForm()

  await form.getByRole('button', { name: 'Plot' }).click()

  await expect.element(form.getByText('Choose a variable')).toBeVisible()
  expect(onSubmit).not.toHaveBeenCalled()
})

test('a summary plots Y against X over all runs', async () => {
  const { form, onSubmit } = await renderForm()

  await choose(form, { label: 'Y axis', option: 'Energy' })
  await form.getByRole('button', { name: 'Plot' }).click()

  expect(onSubmit).toHaveBeenCalledWith({
    variables: ['run', 'energy'],
    source: 'summary',
    name: 'Energy vs. Run',
  })
})

test('a preview plots the variable over the runs typed', async () => {
  const { form, onSubmit } = await renderForm()

  await form.getByText('Preview').click()
  await choose(form, { label: 'Variable', option: 'Pulses' })
  await form.getByRole('textbox', { name: 'Runs' }).fill('7,9')
  await form.getByRole('button', { name: 'Plot' }).click()

  expect(onSubmit).toHaveBeenCalledWith({
    variables: ['xgm_pulses'],
    source: 'preview',
    runs: ['7', '9'],
    name: 'XGM/Pulses',
  })
})

test('a run selection that is not a run or a range is refused by name', async () => {
  const { form, onSubmit } = await renderForm()

  await choose(form, { label: 'Y axis', option: 'Energy' })
  await form.getByText('Custom').click()
  await form.getByRole('textbox', { name: 'Runs' }).fill('7,abc')
  await form.getByRole('button', { name: 'Plot' }).click()

  await expect
    .element(form.getByText('"abc" is not a run or a range'))
    .toBeVisible()
  expect(onSubmit).not.toHaveBeenCalled()
})

test('Cancel leaves without plotting', async () => {
  const { form, onSubmit, onCancel } = await renderForm()

  await form.getByRole('button', { name: 'Cancel' }).click()

  expect(onCancel).toHaveBeenCalledOnce()
  expect(onSubmit).not.toHaveBeenCalled()
})

test('runs typed for a preview carry over to a summary as a custom selection', async () => {
  const { form } = await renderForm()

  await form.getByText('Preview').click()
  await form.getByRole('textbox', { name: 'Runs' }).fill('7, 9')
  await form.getByText('Summary').click()

  await expect
    .element(form.getByRole('radio', { name: 'Custom' }))
    .toBeChecked()
  await expect
    .element(form.getByRole('textbox', { name: 'Runs' }))
    .toHaveValue('7, 9')
})

test('a Y variable that leaves the options is refused rather than plotted', async () => {
  const { form, onSubmit, onCancel } = await renderForm()
  await choose(form, { label: 'Y axis', option: 'Energy' })

  // A context file reload drops the variable while the dialog is open
  const withoutEnergy = blocks.filter((block) => block.name !== 'energy')
  await form.rerender(
    <PlotForm blocks={withoutEnergy} onSubmit={onSubmit} onCancel={onCancel} />
  )
  await form.getByRole('button', { name: 'Plot' }).click()

  await expect.element(form.getByText('Choose a variable')).toBeVisible()
  expect(onSubmit).not.toHaveBeenCalled()
})
