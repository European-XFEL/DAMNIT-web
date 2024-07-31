import React from "react"
import { connect } from "react-redux"
import { Stack, Text } from "@mantine/core"

import { removePlot, setCurrentPlot } from "./plotsSlice"
import Plot from "./Plot"
import Tabs from "../../components/tabs/Tabs"
import { sorted } from "../../utils/array"

const Plots = (props) => {
  const contents = Object.entries(props.contents).map(([id, plot]) => [
    id,
    {
      element: <Plot plotId={id} />,
      title: (
        <Stack gap={0} w={160}>
          <Text
            size="sm"
            style={{
              wordWrap: "break-word",
              whiteSpace: "normal",
            }}
          >
            {plot.title}
          </Text>
          <Text size="xs" c="light.9">
            {plot.subtitle}
          </Text>
        </Stack>
      ),
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
    return [id, { title: plot.title, subtitle: formatSubtitle(runs) }]
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

const formatSubtitle = (runs) => {
  if (runs.length === 1) {
    return `(run ${runs[0]})`
  } else {
    return `(runs ${runs[0]}-${runs[runs.length - 1]})`
  }
}
