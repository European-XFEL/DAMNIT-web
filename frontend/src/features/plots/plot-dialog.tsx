import {
  Modal,
  Button,
  InputWrapper,
  Group,
  SegmentedControl,
  Select,
  Flex,
} from '@mantine/core'
import { TextInput, Text, Blockquote } from '@mantine/core'
import { useForm } from '@mantine/form'

import { addPlot } from './plots.slice'
import { TextCombobox, TextComboboxOptions } from '../../components/comboboxes'
import { getExtractedValue } from '../../data/extracted'
import { getTableData } from '../../data/table'
import { selectVariables } from '../../data/table'
import { getAllExtractedValues } from '../../data/thunks'
import { useAppDispatch, useAppSelector } from '../../redux'
import { getVariableTitle } from '../../utils/variables'

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

// Parses manual selection from string to array
const parseRunSelection = (strInput: string) => {
  const input = String(strInput).split(',')
  const parsed = input.reduce<string[]>((result, str) => {
    if (!str.includes('-')) {
      result.push(str)
      return result
    }
    const [bottom, top] = str
      .split('-')
      .map((i) => Number(i))
      .sort()
    for (let i = bottom; i <= top; i++) {
      result.push(String(i))
    }
    return result
  }, [])

  return parsed
}

const PlotDialog = (props: PlotDialogProps) => {
  const dispatch = useAppDispatch()

  const proposal = useAppSelector((state) => state.metadata.proposal.value)
  const variables = useAppSelector(selectVariables)

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

    const plotOptions =
      submitedFormValues.plotType === 'summary'
        ? {
            variables: [xVariable, yVariable],
            source: 'table',
            title: `Summary: ${getVariableTitle(
              yMetadata
            )} vs. ${getVariableTitle(xMetadata)}`,
          }
        : {
            variables: [yVariable],
            source: 'extracted',
            title: `Data: ${getVariableTitle(yMetadata)}`,
          }

    dispatch(addPlot({ ...plotOptions, runs: runs }))

    if (submitedFormValues.plotType === 'summary') {
      dispatch(getTableData({ proposal, variables: [xVariable, yVariable] }))
    } else if (runs) {
      runs.forEach((run) => {
        dispatch(getExtractedValue({ proposal, run, variable: yVariable }))
      })
    } else {
      dispatch(getAllExtractedValues({ proposal, variable: yVariable }))
    }

    handleClose()
  }

  const formValues = dialogForm.getValues()

  return (
    <Modal
      opened={props.opened}
      onClose={handleClose}
      title="Plot settings"
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
            onChange={(event) => {
              dialogForm.setFieldValue('plotType', event)
            }}
            data={[
              { label: 'Plot summary', value: 'summary' },
              { label: 'Plot data', value: 'extracted' },
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
                { value: 'allSelection', label: 'All runs' },
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
              <Blockquote color="indigo" p="10" w="100%">
                You are about to plot data for all the runs
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
