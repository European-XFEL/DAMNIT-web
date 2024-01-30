import React from "react"
import { connect } from "react-redux"

import { removePlot, setCurrentPlot } from "./plotsSlice"
import Plot from "./Plot"
import Tabs from "../../common/tabs/Tabs"
import { sorted } from "../../utils/array"

const Plots = (props) => {
  const contents = Object.entries(props.contents).map(([id, plot]) => [
    id,
    {
      element: <Plot plotId={id} />,
      title: plot.title,
      isClosable: true,
      onClose: () => props.removePlot(id),
    },
  ])

  return !contents.length ? null : (
    <Tabs
      orientation="vertical"
      keepMounted="false"
      contents={Object.fromEntries(contents)}
      active={props.currentPlot}
      setActive={props.setCurrentPlot}
    />
  )
}

const mapStateToProps = ({ tableData: table, plots }) => {
  const contents = Object.entries(plots.data).map(([id, plot]) => {
    const runs = sorted(plot.runs || Object.keys(table.data))
    return [id, { title: formatTitle(plot.variables, runs) }]
  })

  return {
    currentPlot: plots.currentPlot,
    contents: Object.fromEntries(contents),
  }
}

const mapDispatchToProps = (dispatch) => {
  return {
    removePlot: (id) => dispatch(removePlot(id)),
    setCurrentPlot: (id) => {
      dispatch(setCurrentPlot(id))
    },
    dispatch,
  }
}

export default connect(mapStateToProps, mapDispatchToProps)(Plots)

const formatTitle = (variables, runs) => {
  let prefix = "",
    suffix = ""

  if (variables.length === 2) {
    // Most likely correlation
    prefix = `${variables[1]} vs ${variables[0]}`
  } else {
    prefix = variables[0]
  }

  if (runs.length === 1) {
    suffix = `(run ${runs[0]})`
  } else {
    suffix = `(runs ${runs[0]}-${runs[runs.length - 1]})`
  }

  return `${prefix} ${suffix}`
}
