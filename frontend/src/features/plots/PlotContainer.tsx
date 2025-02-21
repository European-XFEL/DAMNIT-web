import React, { useEffect, useState } from "react"
import { useSelector } from "react-redux"
import { createSelector } from "@reduxjs/toolkit"

import { Alert, Code, Image, Skeleton, Stack, Text } from "@mantine/core"
import { IconInfoCircle } from "@tabler/icons-react"

import Plot from "./Plot"
import { formatRunsSubtitle } from "../../utils/helpers"
import { canPlotSummary } from "../../utils/plots"

const selectTableData = createSelector(
  [
    (state) => state.tableData.data,
    (state) => state.tableData.metadata,
    (_, runs) => runs,
    (_, __, variables) => variables,
  ],
  (tableData, tableMetadata, runs, variables) => {
    const result = variables.reduce((acc, variable) => {
      acc[variable] = { data: [], metadata: tableMetadata.variables[variable] }
      return acc
    }, {})

    runs.forEach((run) => {
      const varData = variables.map((variable) => tableData[run]?.[variable])
      const valid = varData.every((data) =>
        canPlotSummary(data?.value, data?.dtype),
      )

      if (valid) {
        varData.forEach((data, index) => {
          result[variables[index]].data.push(data?.value)
        })
      }
    })

    return result
  },
)

const useTableData = (
  { runs, variables, enabled } = { runs: [], variables: [], enabled: true },
) => {
  const tableData = useSelector((state) =>
    selectTableData(state, runs, variables),
  )

  if (!enabled) {
    return
  }

  const plotData = {}
  const plotMetadata = { type: "scatter" }
  const [xVar, yVar] = variables

  plotData.x = {
    name: tableData[xVar].metadata.title || xVar,
    data: tableData[xVar].data,
  }
  plotMetadata.x = { name: plotData.x.name }

  plotData.y = {
    name: tableData[yVar].metadata.title || yVar,
    data: tableData[yVar].data,
  }
  plotMetadata.y = { name: plotData.y.name }

  return { data: [plotData], metadata: plotMetadata }
}

const selectExtractedData = createSelector(
  [
    (state) => state.extractedData.data,
    (_, runs) => runs,
    (_, __, variable) => variable,
  ],
  (extractedData, runs, variable) => {
    return runs.reduce((result, run) => {
      const data = extractedData[run]?.[variable]
      if (data) {
        result[run] = data
      }
      return result
    }, {})
  },
)

const selectExtractedMetadata = createSelector(
  [
    (state) => state.extractedData.metadata,
    (_, runs) => runs,
    (_, __, variable) => variable,
  ],
  (extractedMetadata, runs, variable) => {
    return runs.reduce((result, run) => {
      const metadata = extractedMetadata[run]?.[variable]
      if (metadata) {
        result[run] = metadata
      }
      return result
    }, {})
  },
)

const selectExtractedValues = createSelector(
  [selectExtractedData, selectExtractedMetadata, (_, runs) => runs],
  (extractedData, extractedMetadata, runs) => {
    return runs.reduce((result, run) => {
      if (extractedMetadata?.[run]) {
        result[run] = {
          data: extractedData[run] ?? null,
          metadata: extractedMetadata[run],
        }
      }
      return result
    }, {})
  },
)

const getPlotData = (extracted, { run, coord } = {}) => {
  const varData = extracted.data
  const varMetadata = extracted.metadata

  switch (varMetadata?.dtype) {
    case "array":
      coord = coord ?? extracted.metadata.dims[0]

      return {
        x: { name: coord, data: varMetadata.coords[coord] },
        y: {
          name: `Run ${run}`,
          data: varData,
        },
      }
    case "image": {
      const [y, x] = varMetadata.dims.map((ax) => ({
        name: ax,
        data: varMetadata.coords[ax],
      }))
      return {
        x,
        y,
        z: { data: varData },
      }
    }
    case "png":
      return {
        src: varData,
      }
    default:
      return { value: varData }
  }
}

const getPlotMetadata = (extracted, { coord } = {}) => {
  const metadata = {}

  switch (extracted.metadata.dtype) {
    case "array":
      metadata.x = {
        name: coord ?? extracted.metadata.dims[0],
      }
      metadata.y = { name: extracted.metadata.name }
      metadata.type = "scatter"
      break
    case "image":
      metadata.type = "heatmap"
      break
    case "png":
      metadata.type = "image"
      break
    case "number":
    case "string":
    case "boolean":
    case "timestamp":
      metadata.type = "scalar"
      break
    default:
      metadata.type = "unsupported"
      break
  }

  return {
    ...(extracted.metadata.attrs ?? {}),
    ...metadata,
  }
}

const useExtractedData = (
  { runs, variable, enabled } = { runs: [], variable: null, enabled: true },
) => {
  const [plotData, setPlotData] = useState({})
  const [plotMetadata, setPlotMetadata] = useState({})

  const extracted = useSelector((state) =>
    selectExtractedValues(state, runs, variable),
  )

  useEffect(() => {
    if (!enabled || !extracted) {
      return
    }

    const newEntries = Object.entries(extracted)
      .filter(([run]) => !(run in plotData))
      .map(([run, extracted]) => [run, getPlotData(extracted, { run })])

    if (newEntries.length) {
      setPlotData((prevData) => ({
        ...prevData,
        ...Object.fromEntries(newEntries),
      }))
      if (runs.length > 0) {
        setPlotMetadata(getPlotMetadata(extracted[runs[0]]))
      }
    }
  }, [enabled, runs, extracted, plotData])

  return {
    data: Object.values(plotData),
    metadata: plotMetadata,
  }
}

const selectRuns = createSelector(
  [
    (state, plotId) => state.plots.data[plotId],
    (state) => state.tableData.metadata.runs,
  ],
  (plot, runsArr) => {
    // Use all runs if `plot.runs` is not defined
    if (!plot?.runs) {
      return runsArr
    }

    // Only get existing runs from `plot.runs`
    const runsSet = new Set(runsArr)
    return plot.runs.filter((run) => runsSet.has(run))
  },
)

const UnableToDisplayAlert = ({ children }) => {
  return (
    <Alert
      variant="light"
      color="orange"
      title="Unable to display the plot"
      icon={<IconInfoCircle />}
    >
      {children}
    </Alert>
  )
}

const PlotContainer = ({ plotId }) => {
  const runs = useSelector((state) => selectRuns(state, plotId))
  const plot = useSelector((state) => state.plots.data[plotId])

  const tableData = useTableData({
    runs,
    variables: plot.variables,
    enabled: plot.source === "table",
  })
  const extractedData = useExtractedData({
    runs,
    variable: plot.variables[0],
    enabled: plot.source === "extracted",
  })

  const { data, metadata } = tableData ?? extractedData

  return (
    <Stack align="flex-start" justify="flex-start">
      <Stack gap={0} align="flex-start" justify="flex-start">
        <Text size="lg">{plot.title}</Text>
        <Text size="sm" c="dark.5">
          {formatRunsSubtitle(runs)}
        </Text>
      </Stack>
      {!data.length ? (
        <Skeleton height={430} width={740} radius="xl" />
      ) : metadata.type === "image" ? (
        <Image
          src={data[0].src}
          h={metadata.shape[0]}
          w={metadata.shape[1]}
          fit="contain"
        />
      ) : metadata.type === "scalar" ? (
        <UnableToDisplayAlert>
          <Text size="sm">
            {"The plot can't be displayed because the value is a scalar "}
            <Code>{data[0].value}</Code>.
          </Text>
        </UnableToDisplayAlert>
      ) : metadata.type === "unsupported" ? (
        <UnableToDisplayAlert>
          <Text size="sm">
            {"The plot can't be displayed because the value is unsupported."}
          </Text>
        </UnableToDisplayAlert>
      ) : (
        <Plot data={data} metadata={metadata} />
      )}
    </Stack>
  )
}

export default PlotContainer
