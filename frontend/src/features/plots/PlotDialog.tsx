import React, { useEffect, useState } from "react"
import {
  Modal,
  Button,
  InputWrapper,
  Group,
  SegmentedControl,
  Select,
  Flex,
} from "@mantine/core"
import { TextInput, Text, Blockquote } from "@mantine/core"
import { useForm } from "@mantine/form"
import { addPlot } from "."
import TextCombobox from "../../common/textCombobox/TextCombobox"
import { connect } from "react-redux"
import { VARIABLES, DTYPES } from "../../common/constants"
import {
  getExtractedVariable,
  getTableData,
  getTableVariable,
  getAllExtracted,
} from "../../shared"

const PlotDialog = (props) => {

  const dialogForm = useForm({
    mode: "uncontrolled",
    initialValues: {
      runSelection: "",
      xVariable: "run",
      yVariable: "",
      plotType:"summary",
      runSelectionType: "allSelection"
    },

    validate: {
      runSelection: (value) => {
        const runs = parseRunSelection(value)

        return dialogForm.getValues().runSelectionType === "manualSelection" &&
          (runs.some((x) => !x) ||
            runs.length > props.tableMetadata.rows ||
            !runs.length)
          ? "Please enter a valid selection"
          : null
      },
      xVariable: (value) =>
        value === "" && dialogForm.getValues().plotType === "summary"
          ? "Please enter a valid variable"
          : null,
      yVariable: (value) =>
        value === "" ? "Please enter a valid variable" : null,
    },
  })

  const columns = Object.keys(props.tableMetadata.schema).filter(
    (e) => props.tableMetadata.schema[e].dtype === "number",
  )

  useEffect(() => {
    if (props.selectedColumns.length === 1) {
      if (true) {
        dialogForm.setFieldValue("xVariable", "run")
        dialogForm.setFieldValue("yVariable", props.selectedColumns[0])
      }
    } else if (props.selectedColumns.length === 2) {
      dialogForm.setFieldValue("xVariable", props.selectedColumns[0])
      dialogForm.setFieldValue("yVariable", props.selectedColumns[1])
    }
  }, [props.opened])

  // Clear states on close
  const handleClose = () => {
    props.close()
    dialogForm.reset()
  }

  // Plots upon form sending
  const handlePlot = () => {
    // runSelection must be parsed again in this case
    const runs =
    dialogForm.getValues().runSelectionType === "manualSelection"
        ? parseRunSelection(dialogForm.getValues().runSelection)
        : null

    const { xVariable, yVariable } = dialogForm.getValues()

    if (dialogForm.getValues().plotType !== "summary") {
      runs
        ? runs.forEach((run) => {
            props.dispatch(
              getExtractedVariable({ run: run, variable: yVariable }),
            )
          })
        : props.dispatch(getAllExtracted(yVariable))
    }

    props.dispatch(
      addPlot({
        variables:
          dialogForm.getValues().plotType === "extracted" ? [yVariable] : [xVariable, yVariable],
        source: dialogForm.getValues().plotType === "summary" ? "table" : "extracted",
        runs: runs,
      }),
    )

    if (dialogForm.getValues().plotType === "summary") {
      props.dispatch(getTableVariable([xVariable]))
      props.dispatch(getTableVariable([yVariable]))
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
      const [bottom, top] = str.split("-")
      for (let i = Number(bottom); i <= Number(top); i++) {
        result.push(i)
      }
      return result
    }, [])
    return parsed
  }

  return (
    <>
      <Modal
        opened={props.opened}
        onClose={handleClose}
        title="Plot settings"
        size="400px"
        keepMounted={false}
        centered
      >
        <form onSubmit={dialogForm.onSubmit((values) => handlePlot())}>
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
                dialogForm.getValues().plotType === "summary"
                  ? [{ display: "flex", justifyContent: "space-between" }]
                  : [{ display: "block", width: "100%" }]
              }
            >
              {dialogForm.getValues().plotType === "summary" && (
                <TextCombobox
                  columns={columns}
                  value={dialogForm.getValues().xVariable}
                  setValue={(value) =>
                    dialogForm.setFieldValue("xVariable", value)
                  }
                  label="X-axis"
                  placeholder="Choose a variable"
                  {...dialogForm.getInputProps("xVariable")}
                />
              )}
              <TextCombobox
                columns={columns}
                value={dialogForm.getValues().yVariable}
                setValue={(value) =>
                  dialogForm.setFieldValue("yVariable", value)
                }
                label={dialogForm.getValues().plotType === "summary" ? "Y-axis" : "Variable"}
                placeholder="Choose a variable"
                {...dialogForm.getInputProps("yVariable")}
              />
            </InputWrapper>

            <SegmentedControl
              id="plotType"
              value={dialogForm.getValues().plotType}
              onChange={(event) => {
                dialogForm.setFieldValue("plotType",event)
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
                value={dialogForm.getValues().runSelectionType}
                onChange={(value, option) => dialogForm.setFieldValue("runSelectionType",value)}
                allowDeselect={false}
              ></Select>
            </Flex>

            {dialogForm.getValues().runSelectionType === "manualSelection" && (
              <TextInput
                w="100%"
                placeholder={
                  dialogForm.getValues().runSelectionType === "allSelection"
                    ? "Run selection:" + +"-" + props.tableMetadata.rows
                    : "e.g. 1,2,3,6-20,22"
                }
                mr="2px"
                h="100%"
                disabled={dialogForm.getValues().runSelectionType !== "manualSelection"}
                key={dialogForm.key("runSelection")}
                {...dialogForm.getInputProps("runSelection")}
              />
            )}
            {dialogForm.getValues().plotType !== "summary" && dialogForm.getValues().runSelectionType === "allSelection" && (
              <Blockquote color="blue" p="10" w="100%">
                You are about to plot data for all the runs
              </Blockquote>
            )}

            <Group wrap="wrap" justify="space-between" w="100%">
              <Button onClick={handleClose}> Cancel </Button>
              <Button type="submit"> Plot </Button>
            </Group>
          </Flex>
        </form>
      </Modal>
    </>
  )
}

const mapStateToProps = ({ tableData }) => {
  // Passing the whole schema for dtypes will be useful later
  const tableMetadata = tableData.metadata
  return {
    tableMetadata: tableMetadata,
    runs: Object.keys(tableData.data),
  }
}

export default connect(mapStateToProps)(PlotDialog)
