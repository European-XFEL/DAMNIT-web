import { useEffect, useState, PropsWithChildren } from 'react'

import { Alert, Code, Image, Skeleton, Stack, Text } from '@mantine/core'
import { IconInfoCircle } from '@tabler/icons-react'

import Plot from './plot'
import { PlotDataItem, PlotMetadata, PlotInfo } from './plots.types'
import { DTYPES } from '../../constants'
import { createTypedSelector, useAppSelector } from '../../redux'
import {
  ExtractedDataItem,
  ExtractedMetadataItem,
  VariableDataItem,
  VariableMetadataItem,
} from '../../types'
import { formatRunsSubtitle } from '../../utils/helpers'

type Variable = {
  data: number[]
  metadata: VariableMetadataItem
}

/*
 * -----------------------------
 *   Table Data
 * -----------------------------
 */

const selectTableData = createTypedSelector(
  [
    (state) => state.tableData.data,
    (state) => state.tableData.metadata,
    (_, runs) => runs,
    (_, __, variables) => variables,
  ],
  (tableData, tableMetadata, runs: string[], variables: string[]) => {
    const result = variables.reduce<Record<string, Variable>>(
      (acc, variable) => {
        acc[variable] = {
          data: [],
          metadata: tableMetadata.variables[variable],
        }
        return acc
      },
      {}
    )

    for (const run of runs) {
      const varData = variables.map((variable) => tableData[run]?.[variable])

      if (
        varData.every(
          (data): data is VariableDataItem =>
            data != null &&
            typeof data.value === 'number' &&
            [DTYPES.number].includes(data.dtype)
        )
      ) {
        variables.forEach((variable, i) => {
          result[variable].data.push(varData[i].value as number)
        })
      }
    }

    return result
  }
)

type UseTableDataOptions = {
  runs: string[]
  variables: string[]
  enabled: boolean
}

const useTableData = (
  { runs, variables, enabled }: UseTableDataOptions = {
    runs: [],
    variables: [],
    enabled: true,
  }
): PlotInfo | null => {
  const tableData = useAppSelector((state) =>
    selectTableData(state, runs, variables)
  )

  if (!enabled) {
    return null
  }

  const plotData: PlotDataItem = {}
  const plotMetadata: PlotMetadata = { type: 'scatter' }
  const [xVar, yVar] = variables

  const xName = tableData[xVar].metadata.title || xVar
  plotData.x = {
    value: tableData[xVar].data,
    name: xName,
  }
  plotMetadata.x = { name: xName }

  const yName = tableData[yVar].metadata.title || yVar
  plotData.y = {
    value: tableData[yVar].data,
    name: yName,
  }
  plotMetadata.y = { name: yName }

  return { data: [plotData], metadata: plotMetadata }
}

/*
 * -----------------------------
 *   Extracted Data
 * -----------------------------
 */

type ExtractedValue = {
  data: ExtractedDataItem | null
  metadata: ExtractedMetadataItem
}

const selectExtractedData = createTypedSelector(
  [
    (state) => state.extractedData.data,
    (_, runs) => runs,
    (_, __, variable) => variable,
  ],
  (extractedData, runs: string[], variable: string) => {
    return runs.reduce<Record<string, ExtractedDataItem>>((result, run) => {
      const data = extractedData[run]?.[variable]
      if (data) {
        result[run] = data
      }
      return result
    }, {})
  }
)

const selectExtractedMetadata = createTypedSelector(
  [
    (state) => state.extractedData.metadata,
    (_, runs) => runs,
    (_, __, variable) => variable,
  ],
  (extractedMetadata, runs: string[], variable: string) => {
    return runs.reduce<Record<string, ExtractedMetadataItem>>((result, run) => {
      const metadata = extractedMetadata[run]?.[variable]
      if (metadata) {
        result[run] = metadata
      }
      return result
    }, {})
  }
)

const selectExtractedValues = createTypedSelector(
  [selectExtractedData, selectExtractedMetadata, (_, runs) => runs],
  (extractedData, extractedMetadata, runs: string[]) => {
    return runs.reduce<Record<string, ExtractedValue>>((result, run) => {
      if (extractedMetadata?.[run]) {
        result[run] = {
          data: extractedData[run] ?? null,
          metadata: extractedMetadata[run],
        }
      }
      return result
    }, {})
  }
)

type UseExtractedDataOptions = {
  runs: string[]
  variable: string
  enabled: boolean
}

const useExtractedData = ({
  runs,
  variable,
  enabled,
}: UseExtractedDataOptions): PlotInfo => {
  const [plotData, setPlotData] = useState<PlotDataItem[]>([])
  const [plotMetadata, setPlotMetadata] = useState<PlotMetadata>({
    type: 'unsupported',
  })

  const extracted = useAppSelector((state) =>
    selectExtractedValues(state, runs, variable)
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

/*
 * -----------------------------
 *   Plot (Extracted) Data
 * -----------------------------
 */

type getPlotDataOptions = {
  run: string
  coord?: string
}

const getPlotData = (
  extracted: ExtractedValue,
  { run, coord }: getPlotDataOptions
) => {
  const varData = extracted.data
  const varMetadata = extracted.metadata

  switch (varMetadata?.dtype) {
    case 'array':
      coord = coord ?? extracted.metadata.dims[0]

      return {
        x: { name: coord, value: varMetadata.coords[coord] },
        y: {
          name: `Run ${run}`,
          value: varData,
        },
      }
    case 'image': {
      const [y, x] = varMetadata.dims.map((ax) => ({
        name: ax,
        value: varMetadata.coords[ax],
      }))
      return {
        x,
        y,
        z: { value: varData },
      }
    }
    case 'png':
    default:
      return {
        data: { value: varData },
      }
  }
}

/*
 * -----------------------------
 *   Plot (Extracted) Metadata
 * -----------------------------
 */

type getPlotMetadataOptions = {
  coord?: string
}

const getPlotMetadata = (
  extracted: ExtractedValue,
  { coord }: getPlotMetadataOptions = {}
) => {
  const metadata: PlotMetadata = { type: 'unsupported' }

  switch (extracted.metadata.dtype) {
    case 'array':
      metadata.x = {
        name: coord ?? extracted.metadata.dims[0],
      }
      metadata.y = { name: extracted.metadata.name }
      metadata.type = 'scatter'
      break
    case 'image':
      metadata.type = 'heatmap'
      break
    case 'png':
      metadata.type = 'image'
      break
    case 'number':
    case 'string':
    case 'boolean':
    case 'timestamp':
      metadata.type = 'scalar'
      break
  }

  return {
    ...(extracted.metadata.attrs ?? {}),
    ...metadata,
  }
}

/*
 * -----------------------------
 *   Other Selectors
 * -----------------------------
 */

const selectRuns = createTypedSelector(
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
  }
)

/*
 * ------------------------------------
 *   UnableToDisplayAlert Component
 * ------------------------------------
 */

const UnableToDisplayAlert = ({ children }: PropsWithChildren) => {
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

/*
 * -----------------------------
 *   PlotContainer Component
 * -----------------------------
 */

type PlotContainerProps = {
  plotId: string
}

const PlotContainer = ({ plotId }: PlotContainerProps) => {
  const runs = useAppSelector((state) => selectRuns(state, plotId))
  const plot = useAppSelector((state) => state.plots.data[plotId])

  const tableData = useTableData({
    runs,
    variables: plot.variables,
    enabled: plot.source === 'table',
  })
  const extractedData = useExtractedData({
    runs,
    variable: plot.variables[0],
    enabled: plot.source === 'extracted',
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
      ) : metadata.type === 'image' ? (
        <Image
          src={data[0].data?.value}
          h={metadata.shape?.[0]}
          w={metadata.shape?.[1]}
          fit="contain"
        />
      ) : metadata.type === 'scalar' ? (
        <UnableToDisplayAlert>
          <Text size="sm">
            {"The plot can't be displayed because the value is a scalar "}
            <Code>{data[0].data?.value as string}</Code>.
          </Text>
        </UnableToDisplayAlert>
      ) : metadata.type === 'unsupported' ? (
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
