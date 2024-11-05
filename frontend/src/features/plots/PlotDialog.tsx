import React, { useEffect } from "react"
import {
  Modal,
  Button,
  InputWrapper,
  Group,
  SegmentedControl,
  Select,
  Flex,
} from "@mantine/core"
import { connect, useSelector } from "react-redux"
import { TextInput, Text, Blockquote } from "@mantine/core"
import { useForm } from "@mantine/form"

import { addPlot } from "./plotsSlice"
import TextCombobox from "../../components/textCombobox/TextCombobox"
import { EXCLUDED_VARIABLES } from "../../constants"
import { getExtractedVariable, getTableVariable } from "../../redux/slices"
import { getAllExtractedVariables } from "../../redux/thunks"

const PlotDialog = (props) => {
  const proposal = useSelector((state) => state.proposal.current.value)

  const dialogForm = useForm({
    mode: "uncontrolled",
    initialValues: {
      runSelection: "",
      xVariable: "run",
      yVariable: "",
      plotType: "summary",
      runSelectionType: "allSelection",
    },

    validate: {
      runSelection: (value, values) => {
        const runs = parseRunSelection(value)

        return values.runSelectionType === "manualSelection" &&
          (runs.some((x) => !x) || runs.length > props.rows || !runs.length)
          ? "Please enter a valid selection"
          : null
      },
      xVariable: (value, values) =>
        value === "" && values.plotType === "summary"
          ? "Please enter a valid variable"
          : null,
      yVariable: (value) =>
        value === "" ? "Please enter a valid variable" : null,
    },
  })

  const formValues = dialogForm.getValues()

  useEffect(() => {
    if (!props.selectedColumns?.[0]) {
      return
    }

    let xVar = "run"
    let yVar = props.selectedColumns[0]

    if (props.selectedColumns.length === 2) {
      xVar = props.selectedColumns[0]
      yVar = props.selectedColumns[1]
    }

    dialogForm.setFieldValue("xVariable", xVar)
    dialogForm.setFieldValue("yVariable", yVar)
  }, [props.opened])

  // Clear states on close
  const handleClose = () => {
    props.close()
    dialogForm.reset()
  }

  // Plots upon form sending
  const handlePlot = (submitedFormValues) => {
    const runs =
      submitedFormValues.runSelectionType === "manualSelection"
        ? parseRunSelection(submitedFormValues.runSelection)
        : null

    const { xVariable, yVariable } = submitedFormValues

    if (submitedFormValues.plotType !== "summary") {
      runs
        ? runs.forEach((run) => {
            props.dispatch(
              getExtractedVariable({ proposal, run, variable: yVariable }),
            )
          })
        : props.dispatch(
            getAllExtractedVariables({ proposal, variable: yVariable }),
          )
    }

    props.dispatch(
      addPlot({
        variables:
          submitedFormValues.plotType === "extracted"
            ? [yVariable]
            : [xVariable, yVariable],
        source:
          submitedFormValues.plotType === "summary" ? "table" : "extracted",
        runs: runs,
      }),
    )

    if (submitedFormValues.plotType === "summary") {
      props.dispatch(getTableVariable({ proposal, variable: xVariable }))
      props.dispatch(getTableVariable({ proposal, variable: yVariable }))
    }

    handleClose()
  }

  // Parses manual selection from string to array
  const parseRunSelection = (strInput) => {
    const input = String(strInput).split(",")
    const parsed = input.reduce((result, str) => {
      if (!str.includes("-")) {
        result.push(Number(str))
        return result
      }
      const [bottom, top] = str
        .split("-")
        .map((i) => Number(i))
        .sort()
      for (let i = bottom; i <= top; i++) {
        result.push(i)
      }
      return result
    }, [])
    return parsed
  }

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
              formValues.plotType === "summary"
                ? [{ display: "flex", justifyContent: "space-between" }]
                : [{ display: "block", width: "100%" }]
            }
          >
            {formValues.plotType === "summary" && (
              <TextCombobox
                columns={props.variables}
                value={formValues.xVariable}
                setValue={(value) =>
                  dialogForm.setFieldValue("xVariable", value)
                }
                label="X-axis"
                placeholder="Choose a variable"
                {...dialogForm.getInputProps("xVariable")}
              />
            )}
            <TextCombobox
              columns={props.variables}
              value={formValues.yVariable}
              setValue={(value) => dialogForm.setFieldValue("yVariable", value)}
              label={formValues.plotType === "summary" ? "Y-axis" : "Variable"}
              placeholder="Choose a variable"
              {...dialogForm.getInputProps("yVariable")}
            />
          </InputWrapper>

          <SegmentedControl
            id="plotType"
            value={formValues.plotType}
            onChange={(event) => {
              dialogForm.setFieldValue("plotType", event)
            }}
            data={[
              { label: "Plot summary", value: "summary" },
              { label: "Plot data", value: "extracted" },
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
                { value: "allSelection", label: "All runs" },
                { value: "manualSelection", label: "Custom" },
              ]}
              defaultValue="allSelection"
              value={formValues.runSelectionType}
              onChange={(value) =>
                dialogForm.setFieldValue("runSelectionType", value)
              }
              allowDeselect={false}
            ></Select>
          </Flex>

          {formValues.runSelectionType === "manualSelection" && (
            <TextInput
              w="100%"
              placeholder="e.g. 1,2,3,6-20,22"
              mr="2px"
              h="100%"
              disabled={formValues.runSelectionType !== "manualSelection"}
              key={dialogForm.key("runSelection")}
              {...dialogForm.getInputProps("runSelection")}
            />
          )}
          {formValues.plotType !== "summary" &&
            formValues.runSelectionType === "allSelection" && (
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

const mapStateToProps = ({ tableData }) => {
  return {
    runs: Object.keys(tableData.data),
    variables: Object.keys(tableData.metadata.variables).filter(
      (variable) => !EXCLUDED_VARIABLES.includes(variable),
    ),
    rows: tableData.metadata.rows,
  }
}

export default connect(mapStateToProps)(PlotDialog)
