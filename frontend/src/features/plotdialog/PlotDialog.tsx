import React, { useEffect, useState } from "react"
import { Modal, Button, InputWrapper, Switch, Group, Stack, SegmentedControl } from '@mantine/core'
import { TextInput } from "@mantine/core"
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
} from "../../shared"

// Defines comboboxes components for two or one variable cases
function TwoVariableOptions(props) {
  const columns = props.columns

  return(
  <InputWrapper style={[{display:"flex", justifyContent:"space-between"}]}>
    <TextCombobox
      columns={columns}
      value={props.xVariable}
      setValue={props.setXVariable}
      label="X-axis"
      placeholder="Choose a variable"
      costumeclass={classes.damnit__plotdialog_axis_combobox}
      error={props.xError}
    />
    <TextCombobox
      columns={columns}
      value={props.yVariable}
      setValue={props.setYVariable}
      label="Y-axis"
      placeholder="Choose a variable"
      costumeclass={classes.damnit__plotdialog_axis_combobox}
      error={props.yError}
    />
  </InputWrapper>
  )
}


function UniVariableOptions(props) {
  return(
  <InputWrapper style={{display:"block"}}>
    <TextCombobox
      columns={props.columns}
      value={props.xVariable}
      setValue={props.setXVariable}
      label="Variable"
      placeholder="Choose a variable"
      costumeclass={classes.damnit__plotdialog_axis_combobox}
      error={props.xError}
    />
  </InputWrapper>
  )
}

const PlotDialog = (props) => {
  //Sets various states. Mind that some must be set accordanly to the
  //grid selection. This is done with the useEffect hook
  const [plotType, setPloType] = useState('summary')
  const [isUniVariable, setPlotAsUniVariable] = useState(true)
  const [runSelectionType, setRunSelectionType] = useState('allSelection')

  const dialogForm = useForm({
    mode: 'uncontrolled',
    initialValues: {
      runSelection: '',
      xVariable: '',
      yVariable: '',
    },

    validate:{
      runSelection: (value) => {
        const runs = parseRunSelection(value)

        return (
        (runSelectionType === "manualSelection") &&
        (runs.some(x => !x) ||
        runs.length > props.tableMetadata.rows ||
        !runs.length) ? 'Please enter a valid selection':
        null
        )
      },
      xVariable: (value) => (value === '' ? 'Please enter a valid variable' : null),
      yVariable: (value) => (value === '' ? 'Please enter a valid variable' : null),
    }
  })

  const columns = Object.keys(props.tableMetadata.schema).filter((e) =>
    props.tableMetadata.schema[e].dtype === 'number')
  const gridSelectionCol = props.gridSelection.columns.toArray()

  useEffect(()=>{
    const cleanColumns = Object.keys(props.tableMetadata.schema)
    .filter((id) => id !== VARIABLES.proposal)

    if (gridSelectionCol.length === 1) {
      if (gridSelectionCol[0] !== -1) {
        setPlotAsUniVariable(true)
        dialogForm.setFieldValue('xVariable', cleanColumns[gridSelectionCol[0]])
      }
    } else if (gridSelectionCol.length === 2) {
        setPlotAsUniVariable(false)
        dialogForm.setFieldValue('xVariable', cleanColumns[gridSelectionCol[0]])
        dialogForm.setFieldValue('yVariable', cleanColumns[gridSelectionCol[1]])
    }
  }, [props.opened])

  // Clear states on close
  const handleClose = () => {
    setPloType("summary")
    setPlotAsUniVariable(false)
    setRunSelectionType('allSelection')
    props.close()
    dialogForm.reset()
  }

  // Plots upon form sending
  const handlePlot = () => {
    // runSelection must be parsed again in this case
    const runs = parseRunSelection(dialogForm.getValues().runSelection)
    const { xVariable, yVariable } = dialogForm.getValues()
    props.dispatch(
        addPlot({
          variables: isUniVariable ? [xVariable]
          : [xVariable, yVariable],
          source: (plotType === "summary") ? "table"
          : "extracted",
          runs: runSelectionType === "manualSelection" ? runs
          : null
        })
    )

    if (plotType !== "summary"){
      runs.forEach((run) => {
        props.dispatch(getExtractedVariable({ run: run, variable: xVariable }))
      })
    }

    if (runSelectionType === "allSelection"){
      if((plotType === "summary")){
        if(isUniVariable){
          props.dispatch(getTableVariable([xVariable]))
        } else {
          props.dispatch(getTableVariable([xVariable]))
        }
      }
    }

    handleClose()
  }

  // Parses manual selection from string to array
  const parseRunSelection =  (strInput) => {
    const input = String(strInput).split(',')
    const parsed = input.reduce((result, str) => {
      if(!str.includes('-')) {
        result.push(Number(str))
        return result
    }
    const [ bottom, top ] = str.split('-')
      for (let i = Number(bottom); i<=Number(top); i++) {
        result.push(i)
      }
      return result
    }, [])
    return parsed
  }

  // Looks for form errors
  const validateForm = (runs) => {
    const err = {
      selectionError: false,
      yVariableError: false,
      xVariableError: false,
    }

    // runSelectionError must be improved. With pagination that's not
    // straightforward

    err.selectionError = ((runSelectionType === "manualSelection") &&
    (runs.some(x => !x) || runs.length > props.tableMetadata.rows || !runs.length))
    err.xVariableError = xVariable === ""
    err.yVariableError = (yVariable === "") && (!isUniVariable)
    return err
  }

  return (
    <>
      <Modal
        opened={props.opened}
        onClose={handleClose}
        title="Plot settings"
        size="500px"
        keepMounted = {false}
        centered
        >
        <form onSubmit={dialogForm.onSubmit((values) => handlePlot())}>
          <Stack m = "5px">
            <Switch
              checked={ isUniVariable }
              label="Single variable plot"
              onChange={(event) => {setPlotAsUniVariable(event.currentTarget.checked)}}
              disabled={plotType !== "summary"}
            />
          </Stack>

          <InputWrapper style={[{display:"flex", justifyContent:"space-between"}]}>
            <TextCombobox
              columns={columns}
              value={dialogForm.getValues().xVariable}
              setValue={(value) => dialogForm.setFieldValue('xVariable',value)}
              label="X-axis"
              placeholder="Choose a variable"
              costumeclass={classes.damnit__plotdialog_axis_combobox}
              {... dialogForm.getInputProps('xVariable')}
            />
            <TextCombobox
              columns={columns}
              value={dialogForm.getValues().yVariable}
              setValue={(value) => dialogForm.setFieldValue('yVariable',value)}
              label="Y-axis"
              placeholder="Choose a variable"
              costumeclass={classes.damnit__plotdialog_axis_combobox}
              {... dialogForm.getInputProps('yVariable')}
            />
        </InputWrapper>

          <SegmentedControl
              id="plotType"
              value={ plotType }
              onChange={ (event) => { setPloType(event);
                setPlotAsUniVariable(event !== "summary" || isUniVariable)
                setRunSelectionType(event === "summary" ?  runSelectionType : "manualSelection")
              }}
              data={[
                { label: 'Plot for summary data', value: 'summary' },
                { label: 'Plot for extracted data', value: 'extracted' },
              ]}
              orientation="horizontal"
              mt="3px"
              mb="3px"
              fullWidth={true}
            />

            <SegmentedControl
              id="selectionType"
              value={ plotType !== "summary" ? 'manualSelection' : runSelectionType }
              onChange={ setRunSelectionType }
              data={[
                { label: 'Plot for all runs', value: 'allSelection' },
                { label: 'Manual selection', value: 'manualSelection' },
              ]}
              orientation="horizontal"
              mt="3px"
              mb="3px"
              fullWidth={true}
              disabled={ plotType !== "summary" }
            />

            <TextInput
              label="Run selection:"
              placeholder={
                runSelectionType === "allSelection" ?
                "Run selection:" + 0 + "-" + props.tableMetadata.rows :
                "e.g. 1,2,3,6-20,22"
              }
              mr="2px"
              h="100%"
              disabled={ runSelectionType !== "manualSelection" }
              key={ dialogForm.key('runSelection') }
              { ...dialogForm.getInputProps('runSelection') }
            />

          <Group wrap="wrap">
            <Button onClick={handleClose}> Cancel </Button>
            <Button type="submit"> Plot </Button>
          </Group>
        </form>
      </Modal>
    </>
  );
}

const mapStateToProps = ({ tableData }) => {
  // Passing the whole schema for dtypes will be useful later
  const tableMetadata = tableData.metadata
  return {
    tableMetadata: tableMetadata,
  }
}

export default connect(mapStateToProps)(PlotDialog)