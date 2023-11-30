import React from "react"
import { connect } from "react-redux"
import ReactEcharts from "echarts-for-react"

import { removePlot, setCurrentPlot } from "./plotsSlice"
import Tabs from "../../common/tabs/Tabs"

const scatterPlot = ({ xAxis = {}, yAxis = [] }) => {
  return {
    xAxis: { ...xAxis, type: "category" },
    yAxis: { scale: true },
    series: yAxis.map((y) => ({ ...y, type: "scatter" })),
  }
}

const Plots = (props) => {
  const populated = Object.entries(props.contents).map(([id, plot]) => [
    id,
    {
      element: (
        <ReactEcharts
          option={scatterPlot({
            xAxis: {
              name: "Runs",
              data: plot.runs,
            },
            yAxis: plot.variables.map((variable) => ({
              data: plot.runs.map((run) => props.data[run][variable]),
            })),
          })}
        />
      ),
      title: `${plot.variables.join(", ")} (runs ${plot.runs[0]}-${
        plot.runs[plot.runs.length - 1]
      })`,
      isClosable: true,
      onClose: () => props.removePlot(id),
    },
  ])

  return !populated.length ? null : (
    <Tabs
      orientation="vertical"
      keepMounted="false"
      contents={Object.fromEntries(populated)}
      active={props.currentPlot}
      setActive={props.setCurrentPlot}
    />
  )
}

const mapStateToProps = ({ table, plots }) => {
  return {
    data: table.data,
    contents: plots.data,
    currentPlot: plots.currentPlot,
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
