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
import { addPlot } from "../plots"
import TextCombobox from "../../common/comboboxes/ComboBoxes"
import classes from "./PlotDialog.module.css"
import { connect } from "react-redux"
import { VARIABLES, DTYPES } from "../../common/constants"
import {
  getExtractedVariable,
  getTableData,
  getTableVariable,
  getAllExtracted,
} from "../../shared"

const PlotDialog = (props) => {
  const [plotType, setPloType] = useState("summary")
  const [runSelectionType, setRunSelectionType] = useState("allSelection")

  const dialogForm = useForm({
    mode: "uncontrolled",
    initialValues: {
      runSelection: "",
      xVariable: "run",
      yVariable: "",
    },

    validate: {
      runSelection: (value) => {
        const runs = parseRunSelection(value)

        return runSelectionType === "manualSelection" &&
          (runs.some((x) => !x) ||
            runs.length > props.tableMetadata.rows ||
            !runs.length)
          ? "Please enter a valid selection"
          : null
      },
      xVariable: (value) =>
        value === "" && plotType === "summary"
          ? "Please enter a valid variable"
          : null,
      yVariable: (value) =>
        value === "" ? "Please enter a valid variable" : null,
    },
  })

  const columns = Object.keys(props.tableMetadata.schema).filter(
    (e) => props.tableMetadata.schema[e].dtype === "number",
  )
  const gridSelectionCol = props.gridSelection.columns.toArray()

  useEffect(() => {
    const cleanColumns = Object.keys(props.tableMetadata.schema).filter(
      (id) => id !== VARIABLES.proposal,
    )

    if (gridSelectionCol.length === 1) {
      if (gridSelectionCol[0] !== -1) {
        dialogForm.setFieldValue("xVariable", cleanColumns[gridSelectionCol[0]])
      }
    } else if (gridSelectionCol.length === 2) {
      dialogForm.setFieldValue("xVariable", cleanColumns[gridSelectionCol[0]])
      dialogForm.setFieldValue("yVariable", cleanColumns[gridSelectionCol[1]])
    }
  }, [props.opened])

  // Clear states on close
  const handleClose = () => {
    setPloType("summary")
    setRunSelectionType("allSelection")
    props.close()
    dialogForm.reset()
  }

  // Plots upon form sending
  const handlePlot = () => {
    // runSelection must be parsed again in this case
    const runs =
      runSelectionType === "manualSelection"
        ? parseRunSelection(dialogForm.getValues().runSelection)
        : null

    const { xVariable, yVariable } = dialogForm.getValues()

    if (plotType !== "summary") {
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
          plotType === "extracted" ? [yVariable] : [xVariable, yVariable],
        source: plotType === "summary" ? "table" : "extracted",
        runs: runs,
      }),
    )

    if (plotType === "summary") {
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
                plotType === "summary"
                  ? [{ display: "flex", justifyContent: "space-between" }]
                  : [{ display: "block", width: "100%" }]
              }
            >
              {plotType === "summary" && (
                <TextCombobox
                  columns={columns}
                  value={dialogForm.getValues().xVariable}
                  setValue={(value) =>
                    dialogForm.setFieldValue("xVariable", value)
                  }
                  label="X-axis"
                  placeholder="Choose a variable"
                  costumeclass={classes.damnit__plotdialog_axis_combobox}
                  {...dialogForm.getInputProps("xVariable")}
                />
              )}
              <TextCombobox
                columns={columns}
                value={dialogForm.getValues().yVariable}
                setValue={(value) =>
                  dialogForm.setFieldValue("yVariable", value)
                }
                label={plotType === "summary" ? "Y-axis" : "Variable"}
                placeholder="Choose a variable"
                costumeclass={classes.damnit__plotdialog_axis_combobox}
                {...dialogForm.getInputProps("yVariable")}
              />
            </InputWrapper>

            <SegmentedControl
              id="plotType"
              value={plotType}
              onChange={(event) => {
                setPloType(event)
              }}
              data={[
                { label: "Plot for summary data", value: "summary" },
                { label: "Plot for extracted data", value: "extracted" },
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
                value={runSelectionType}
                onChange={(value, option) => setRunSelectionType(value)}
              ></Select>
            </Flex>

            {runSelectionType === "manualSelection" && (
              <TextInput
                w="100%"
                placeholder={
                  runSelectionType === "allSelection"
                    ? "Run selection:" + +"-" + props.tableMetadata.rows
                    : "e.g. 1,2,3,6-20,22"
                }
                mr="2px"
                h="100%"
                disabled={runSelectionType !== "manualSelection"}
                key={dialogForm.key("runSelection")}
                {...dialogForm.getInputProps("runSelection")}
              />
            )}
            {plotType !== "summary" && runSelectionType === "allSelection" && (
              <Blockquote color="blue" p="5">
                You are about to plot extracted data for all the runs
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
