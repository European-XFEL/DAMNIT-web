import {
  Modal,
  Button,
  InputWrapper,
  Group,
  SegmentedControl,
  Select,
  Flex,
  Title,
} from '@mantine/core'
import { TextInput, Text, Blockquote } from '@mantine/core'
import { useForm } from '@mantine/form'

import TextCombobox, {
  type TextComboboxOptions,
} from '#src/components/comboboxes/text-combobox'
import { useTableVariables } from '#src/data/table/use-table-meta'
import { useAppDispatch } from '#src/app/store/hooks'
import { type PlotSpec } from '#src/types'
import { getVariableTitle } from '#src/data/table/table-data.transforms'

import { addPlot } from './plots.slice'
import { parseRunSelection } from './utils'

type PlotDialogForm = {
  runSelection: string
  xVariable: string
  yVariable: string
  plotType: string
  runSelectionType: string
}

type PlotDialogProps = {
  opened: boolean
  close: () => void
}

const PlotDialog = (props: PlotDialogProps) => {
  const dispatch = useAppDispatch()

  const variables = useTableVariables()

  const dialogForm = useForm<PlotDialogForm>({
    mode: 'uncontrolled',
    initialValues: {
      runSelection: '',
      xVariable: 'run',
      yVariable: '',
      plotType: 'summary',
      runSelectionType: 'allSelection',
    },

    validate: {
      runSelection: (value, values) => {
        const selectedRuns = parseRunSelection(value)

        return values.runSelectionType === 'manualSelection' &&
          (selectedRuns.some((x) => !x) || !selectedRuns.length)
          ? 'Please enter a valid selection'
          : null
      },
      xVariable: (value, values) =>
        value === '' && values.plotType === 'summary'
          ? 'Please enter a valid variable'
          : null,
      yVariable: (value) =>
        value === '' ? 'Please enter a valid variable' : null,
    },
  })

  // Clear states on close
  const handleClose = () => {
    props.close()
    dialogForm.reset()
  }

  // Plots upon form sending
  const handlePlot = (submitedFormValues: PlotDialogForm) => {
    const runs =
      submitedFormValues.runSelectionType === 'manualSelection'
        ? parseRunSelection(submitedFormValues.runSelection)
        : null

    const { xVariable, yVariable } = submitedFormValues

    const xMetadata = variables.find((variable) => variable.name === xVariable)
    const yMetadata = variables.find((variable) => variable.name === yVariable)
    if (!xMetadata || !yMetadata) {
      return
    }

    const plotOptions: PlotSpec =
      submitedFormValues.plotType === 'summary'
        ? {
            variables: [xVariable, yVariable],
            source: 'summary',
            title: `Summary: ${getVariableTitle(
              yMetadata
            )} vs. ${getVariableTitle(xMetadata)}`,
          }
        : {
            variables: [yVariable],
            source: 'preview',
            title: `Preview: ${getVariableTitle(yMetadata)}`,
          }

    dispatch(addPlot({ ...plotOptions, runs: runs ?? undefined }))

    handleClose()
  }

  const formValues = dialogForm.getValues()

  return (
    <Modal
      opened={props.opened}
      onClose={handleClose}
      title={<Title order={4}>Plot Settings</Title>}
      size="400px"
      keepMounted={false}
      centered
    >
      <form
        onSubmit={dialogForm.onSubmit((values) => {
          handlePlot(values)
        })}
      >
        <Flex
          id="hGroup"
          mih={50}
          gap="md"
          justify="flex-start"
          align="center"
          direction="column"
        >
          <InputWrapper
            style={
              formValues.plotType === 'summary'
                ? [{ display: 'flex', justifyContent: 'space-between' }]
                : [{ display: 'block', width: '100%' }]
            }
          >
            {formValues.plotType === 'summary' && (
              <TextCombobox
                options={variables as TextComboboxOptions}
                value={formValues.xVariable}
                setValue={(value) =>
                  dialogForm.setFieldValue('xVariable', value)
                }
                label="X-axis"
                placeholder="Choose a variable"
                {...dialogForm.getInputProps('xVariable')}
              />
            )}
            <TextCombobox
              options={variables as TextComboboxOptions}
              value={formValues.yVariable}
              setValue={(value) => dialogForm.setFieldValue('yVariable', value)}
              label={formValues.plotType === 'summary' ? 'Y-axis' : 'Variable'}
              placeholder="Choose a variable"
              {...dialogForm.getInputProps('yVariable')}
            />
          </InputWrapper>

          <SegmentedControl
            id="plotType"
            value={formValues.plotType}
            onChange={(value) => {
              dialogForm.setFieldValue('plotType', value)
              if (value === 'preview') {
                dialogForm.setFieldValue('runSelectionType', 'manualSelection')
              } else if (!formValues.runSelection) {
                dialogForm.setFieldValue('runSelectionType', 'allSelection')
              }
            }}
            data={[
              { label: 'Plot summary', value: 'summary' },
              { label: 'Plot preview', value: 'preview' },
            ]}
            orientation="horizontal"
            mt="3px"
            mb="3px"
            w="100%"
          />

          <Flex justify="space-between" align="center" w="100%">
            <Text size="sd">Run selection:</Text>
            <Select
              data={[
                {
                  value: 'allSelection',
                  label: 'All runs',
                  disabled: formValues.plotType !== 'summary',
                },
                { value: 'manualSelection', label: 'Custom' },
              ]}
              defaultValue="allSelection"
              value={formValues.runSelectionType}
              onChange={(value) =>
                value && dialogForm.setFieldValue('runSelectionType', value)
              }
              allowDeselect={false}
            ></Select>
          </Flex>

          {formValues.runSelectionType === 'manualSelection' && (
            <TextInput
              w="100%"
              placeholder="e.g. 1,2,3,6-20,22"
              mr="2px"
              h="100%"
              disabled={formValues.runSelectionType !== 'manualSelection'}
              key={dialogForm.key('runSelection')}
              {...dialogForm.getInputProps('runSelection')}
            />
          )}
          {formValues.plotType !== 'summary' &&
            formValues.runSelectionType === 'allSelection' && (
              <Blockquote color="red" p="10" w="100%">
                You are about to plot preview data for all the runs.
              </Blockquote>
            )}

          <Group wrap="wrap" justify="space-between" w="100%">
            <Button color="indigo" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button color="indigo" variant="filled" type="submit">
              Plot
            </Button>
          </Group>
        </Flex>
      </form>
    </Modal>
  )
}

export default PlotDialog
