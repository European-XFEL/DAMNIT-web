import {
  Button,
  Group,
  Radio,
  SegmentedControl,
  Stack,
  TextInput,
} from '@mantine/core'
import { useForm } from '@mantine/form'

import { VariableCombobox } from '#src/components/comboboxes/variable-combobox'
import PlotKindIcon from '#src/components/icons/plot-kind-icon'
import { type PlotSource, type PlotSpec } from '#src/types'
import { itemsOf, type VariableBlock } from '#src/utils/variable-blocks'

import { parseRunSelection } from './utils'

type PlotFormValues = {
  kind: PlotSource
  y: string
  x: string
  runsMode: 'all' | 'custom'
  runs: string
}

const RUNS_HINT = 'Runs and ranges, like 3, 7, 10-20'

const KIND_OPTIONS = [
  {
    value: 'summary',
    label: (
      <Group gap={8} justify="center" wrap="nowrap">
        <PlotKindIcon kind="summary" size={16} />
        <span>Summary</span>
      </Group>
    ),
  },
  {
    value: 'preview',
    label: (
      <Group gap={8} justify="center" wrap="nowrap">
        <PlotKindIcon kind="preview" size={16} />
        <span>Preview</span>
      </Group>
    ),
  },
]

// A preview is drawn per run, so only a summary can follow all of them.
function readsRuns(values: PlotFormValues) {
  return values.kind === 'preview' || values.runsMode === 'custom'
}

type PlotFormProps = {
  blocks: VariableBlock[]
  onSubmit: (plot: PlotSpec) => void
  onCancel: () => void
}

export function PlotForm({ blocks, onSubmit, onCancel }: PlotFormProps) {
  const titles = new Map(itemsOf(blocks).map((item) => [item.name, item.title]))
  const titleOf = (name: string) => titles.get(name) ?? name

  // A name the options no longer hold, say after a context file reload, shows
  // as a blank field, so it is refused like one.
  const form = useForm<PlotFormValues>({
    initialValues: {
      kind: 'summary',
      y: '',
      x: 'run',
      runsMode: 'all',
      runs: '',
    },
    validate: {
      y: (value) => (titles.has(value) ? null : 'Choose a variable'),
      x: (value, values) =>
        values.kind === 'summary' && !titles.has(value)
          ? 'Choose a variable'
          : null,
      runs: (value, values) => {
        if (!readsRuns(values)) {
          return null
        }
        const selection = parseRunSelection(value)
        return 'error' in selection ? selection.error : null
      },
    },
  })

  // Runs typed for a preview carry over, so a summary opens on them.
  form.watch('kind', ({ value }) => {
    if (value === 'summary' && form.getValues().runs.trim() !== '') {
      form.setFieldValue('runsMode', 'custom')
    }
  })

  const handleSubmit = (values: PlotFormValues) => {
    const selection = readsRuns(values)
      ? parseRunSelection(values.runs)
      : undefined
    const runs = selection && 'runs' in selection ? selection.runs : undefined

    if (values.kind === 'summary') {
      onSubmit({
        variables: [values.x, values.y],
        source: 'summary',
        name: `${titleOf(values.y)} vs. ${titleOf(values.x)}`,
        runs,
      })
    } else {
      onSubmit({
        variables: [values.y],
        source: 'preview',
        name: titleOf(values.y),
        runs,
      })
    }
  }

  const isPreview = form.values.kind === 'preview'

  return (
    <form onSubmit={form.onSubmit(handleSubmit)}>
      <Stack gap="xl">
        <SegmentedControl
          fullWidth
          data={KIND_OPTIONS}
          {...form.getInputProps('kind')}
        />

        <Stack gap="md">
          <VariableCombobox
            label={isPreview ? 'Variable' : 'Y axis'}
            blocks={blocks}
            data-autofocus
            {...form.getInputProps('y')}
          />
          {!isPreview && (
            <VariableCombobox
              label="X axis"
              blocks={blocks}
              {...form.getInputProps('x')}
            />
          )}
        </Stack>

        {isPreview ? (
          <TextInput
            label="Runs"
            description={RUNS_HINT}
            {...form.getInputProps('runs')}
          />
        ) : (
          <Stack gap="md">
            <Radio.Group label="Runs" {...form.getInputProps('runsMode')}>
              <Group gap="md">
                <Radio value="all" label="All runs" />
                <Radio value="custom" label="Custom" />
              </Group>
            </Radio.Group>
            {form.values.runsMode === 'custom' && (
              // Indented by the radio and its label gap, so it lines up with
              // the words above it.
              <TextInput
                ml="xl"
                aria-label="Runs"
                description={RUNS_HINT}
                {...form.getInputProps('runs')}
              />
            )}
          </Stack>
        )}
      </Stack>

      <Group justify="flex-end" gap="sm" mt="xl">
        <Button variant="default" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">Plot</Button>
      </Group>
    </form>
  )
}
