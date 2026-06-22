import Plotly from 'react-plotly.js'
import { Card, Code, Group, Stack, Table, Text } from '@mantine/core'
import type { PlotlyPreview, HZDRShot, HZDRDatasetPreview } from '../types'
import { decodePlotlyTypedArrays } from '../utils/plotly'
import { isPlotlyPreview, getPlotlySparklineValues } from '../utils/plotly'
import { isNumericLinePreview, isNumericMatrixPreview } from '../utils/preview'
import { formatTrendValue } from '../utils/format'
import { collectNumericMetadataTrendValues } from '../utils/metadata'
import { parseColumnDetails } from '../utils/preview'

export function TruncatedCell({
  value,
  fw,
  c,
}: {
  value: unknown
  fw?: number
  c?: string
}) {
  return (
    <Text
      size="sm"
      fw={fw}
      c={c}
      title={String(value ?? '')}
      style={{
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        minWidth: 0,
      }}
    >
      {String(value ?? '-')}
    </Text>
  )
}

export function ContextPreviewValue({
  preview,
  value,
}: {
  preview?: unknown
  value: unknown
}) {
  if (isNumericLinePreview(preview)) {
    return <LineoutPreview values={preview} />
  }
  if (isNumericMatrixPreview(preview)) {
    return <ImageMatrixPreview values={preview} />
  }
  if (isPlotlyPreview(preview)) {
    return <PlotlyFigurePreview preview={preview} />
  }
  if (preview && typeof preview === 'object') {
    return <Code block>{JSON.stringify(preview, null, 2)}</Code>
  }
  if (Array.isArray(value)) {
    return <Code block>{JSON.stringify(value.slice(0, 32), null, 2)}</Code>
  }
  return null
}

export function ContextCellContent({
  value,
  preview,
  trendValues,
}: {
  value: unknown
  preview?: unknown
  trendValues?: { shotNumber: number; value: number }[]
}) {
  const sparklineValues = getPlotlySparklineValues(preview)
  const arrayPreviewValues = getNumericPreviewValues(preview)
  if (isNumericLinePreview(preview)) {
    return <MiniCellSparkline values={preview} />
  }
  if (isNumericMatrixPreview(preview)) {
    return <MiniImagePreview values={preview} size={48} />
  }
  if (isPlotlyPreview(preview)) {
    return sparklineValues.length > 1 ? (
      <MiniCellSparkline values={sparklineValues} />
    ) : (
      <Text size="xs" c="dimmed">
        Plot preview
      </Text>
    )
  }
  if (trendValues && trendValues.length > 1) {
    return (
      <MiniCellSparkline values={trendValues.map((entry) => entry.value)} />
    )
  }
  if (arrayPreviewValues.length > 1) {
    return (
      <Stack gap={2}>
        <TruncatedCell value={value} />
        <MiniCellSparkline values={arrayPreviewValues} />
      </Stack>
    )
  }
  return (
    <Stack gap={2}>
      <TruncatedCell value={value} />
      {sparklineValues.length > 1 ? (
        <MiniCellSparkline values={sparklineValues} />
      ) : null}
    </Stack>
  )
}

export function MiniCellSparkline({ values }: { values: number[] }) {
  const width = 108
  const height = 24
  const padding = 3
  const minValue = Math.min(...values)
  const maxValue = Math.max(...values)
  const range = maxValue - minValue || 1
  const points = values
    .map((value, index) => {
      const x =
        padding +
        (index / Math.max(values.length - 1, 1)) * (width - padding * 2)
      const y =
        height - padding - ((value - minValue) / range) * (height - padding * 2)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  const lastValue = values[values.length - 1]
  const lastX = width - padding
  const lastY =
    height - padding - ((lastValue - minValue) / range) * (height - padding * 2)

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Plot preview sparkline"
      style={{ display: 'block' }}
    >
      <line
        x1={padding}
        x2={width - padding}
        y1={height - padding}
        y2={height - padding}
        stroke="var(--mantine-color-gray-3)"
        strokeWidth={1}
      />
      <polyline
        points={points}
        fill="none"
        stroke="var(--mantine-color-teal-6)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={lastX}
        cy={lastY}
        r={2.4}
        fill="var(--mantine-color-yellow-5)"
        stroke="var(--mantine-color-teal-7)"
        strokeWidth={1}
      />
    </svg>
  )
}

export function LineoutPreview({ values }: { values: number[] }) {
  const indexedValues = values.map((value, index) => ({
    shotNumber: index,
    value,
  }))
  return (
    <MetadataTrendPreview
      values={indexedValues}
      title="Lineout preview"
      xLabel="sample index"
    />
  )
}

export function ImageMatrixPreview({ values }: { values: number[][] }) {
  return (
    <Stack gap="xs">
      <Text size="sm" fw={600}>
        Image preview
      </Text>
      <MiniImagePreview values={values} size={260} />
    </Stack>
  )
}

export function MiniImagePreview({
  values,
  size = 108,
}: {
  values: number[][]
  size?: number
}) {
  const flattened = values.flat()
  const minValue = Math.min(...flattened)
  const maxValue = Math.max(...flattened)
  const range = maxValue - minValue || 1
  return (
    <div
      role="img"
      aria-label="Image preview"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${values[0]?.length ?? 1}, 1fr)`,
        width: '100%',
        maxWidth: size,
        aspectRatio: '1 / 1',
        border: '1px solid var(--mantine-color-gray-4)',
        overflow: 'hidden',
      }}
    >
      {values.flatMap((row, rowIndex) =>
        row.map((value, columnIndex) => {
          const shade = Math.round(((value - minValue) / range) * 255)
          return (
            <div
              key={`${rowIndex}-${columnIndex}`}
              style={{
                backgroundColor: `rgb(${shade}, ${shade}, ${shade})`,
              }}
            />
          )
        })
      )}
    </div>
  )
}

export function PlotlyFigurePreview({ preview }: { preview: PlotlyPreview }) {
  try {
    const figure = decodePlotlyTypedArrays(JSON.parse(preview.json)) as {
      data?: Plotly.Data[]
      layout?: Partial<Plotly.Layout>
      config?: Partial<Plotly.Config>
    }
    return (
      <Plotly
        data={figure.data ?? []}
        layout={
          {
            ...(figure.layout ?? {}),
            autosize: true,
            height: 260,
            margin: {
              l: 44,
              r: 16,
              t: 24,
              b: 42,
              ...(figure.layout?.margin ?? {}),
            },
          } as Partial<Plotly.Layout>
        }
        config={
          {
            displaylogo: false,
            responsive: true,
            ...(figure.config ?? {}),
          } as Partial<Plotly.Config>
        }
        style={{ width: '100%', height: 260 }}
        useResizeHandler
      />
    )
  } catch (error) {
    return (
      <Code block>
        {error instanceof Error
          ? error.message
          : 'Could not render Plotly preview.'}
      </Code>
    )
  }
}

function getNumericPreviewValues(preview: unknown): number[] {
  if (!isNumericLinePreview(preview)) {
    return []
  }
  return preview.slice(0, 64)
}

export function MetadataTrendPreview({
  values,
  title = 'Trend preview',
  xLabel = 'shot number',
}: {
  values: { shotNumber: number; value: number }[]
  title?: string
  xLabel?: string
}) {
  if (!values.length) {
    return (
      <Card withBorder radius={4} p="md">
        <Text size="sm" c="dimmed">
          Select a numeric trend value to preview this shot set.
        </Text>
      </Card>
    )
  }

  const chart = {
    width: 320,
    height: 180,
    left: 58,
    right: 18,
    top: 18,
    bottom: 36,
  }
  const rawMin = Math.min(...values.map((entry) => entry.value))
  const rawMax = Math.max(...values.map((entry) => entry.value))
  const rawRange = rawMax - rawMin
  const padding =
    rawRange === 0 ? Math.max(Math.abs(rawMax) * 0.1, 1) : rawRange * 0.12
  const minValue = rawMin - padding
  const maxValue = rawMax + padding
  const valueRange = Math.max(maxValue - minValue, 1e-9)
  const plotWidth = chart.width - chart.left - chart.right
  const plotHeight = chart.height - chart.top - chart.bottom
  const xForIndex = (index: number) =>
    chart.left +
    (values.length === 1
      ? plotWidth / 2
      : (index / (values.length - 1)) * plotWidth)
  const yForValue = (value: number) =>
    chart.top + ((maxValue - value) / valueRange) * plotHeight
  const ticks = [maxValue, (maxValue + minValue) / 2, minValue]
  const points = values
    .map((entry, index) => {
      return `${xForIndex(index)},${yForValue(entry.value)}`
    })
    .join(' ')
  const firstShot = values[0]?.shotNumber
  const lastShot = values.at(-1)?.shotNumber

  return (
    <Stack gap="xs">
      <Group justify="space-between">
        <Text size="sm" fw={600}>
          {title}
        </Text>
        <Text size="xs" c="dimmed">
          {formatTrendValue(rawMin)} to {formatTrendValue(rawMax)}
        </Text>
      </Group>
      <svg
        viewBox={`0 0 ${chart.width} ${chart.height}`}
        width="100%"
        height="240"
        role="img"
        preserveAspectRatio="xMidYMid meet"
        style={{
          border: '1px solid var(--mantine-color-gray-4)',
          display: 'block',
          overflow: 'visible',
        }}
      >
        <rect
          x={chart.left}
          y={chart.top}
          width={plotWidth}
          height={plotHeight}
          fill="var(--mantine-color-gray-0)"
          stroke="var(--mantine-color-gray-4)"
          strokeWidth="1"
        />
        {ticks.map((tick) => {
          const y = yForValue(tick)
          return (
            <g key={tick}>
              <line
                x1={chart.left}
                x2={chart.width - chart.right}
                y1={y}
                y2={y}
                stroke="var(--mantine-color-gray-3)"
                strokeWidth="0.8"
              />
              <text
                x={chart.left - 8}
                y={y + 3}
                textAnchor="end"
                fontSize="10"
                fill="var(--mantine-color-gray-7)"
              >
                {formatTrendValue(tick)}
              </text>
            </g>
          )
        })}
        <polyline
          points={points}
          fill="none"
          stroke="var(--mantine-color-blue-7)"
          strokeWidth="2"
        />
        {values.map((entry, index) => {
          const x = xForIndex(index)
          const y = yForValue(entry.value)
          return (
            <g key={entry.shotNumber}>
              <circle
                cx={x}
                cy={y}
                r="3.2"
                fill="var(--mantine-color-blue-7)"
              />
              <title>
                Shot {entry.shotNumber}: {formatTrendValue(entry.value)}
              </title>
            </g>
          )
        })}
        <text
          x={chart.left}
          y={chart.height - 12}
          textAnchor="middle"
          fontSize="10"
          fill="var(--mantine-color-gray-7)"
        >
          {firstShot ?? '-'}
        </text>
        <text
          x={chart.width - chart.right}
          y={chart.height - 12}
          textAnchor="middle"
          fontSize="10"
          fill="var(--mantine-color-gray-7)"
        >
          {lastShot ?? '-'}
        </text>
        <text
          x={(chart.left + chart.width - chart.right) / 2}
          y={chart.height - 12}
          textAnchor="middle"
          fontSize="10"
          fill="var(--mantine-color-gray-7)"
        >
          {xLabel}
        </text>
      </svg>
    </Stack>
  )
}

export function ColumnCellPreview({
  fieldTitle,
  details,
}: {
  fieldTitle: string
  details: Record<string, unknown>
}) {
  const value =
    details.value ??
    details.displayed_value ??
    details.metadata_value ??
    details.mongo_query ??
    'Click Preview column.'
  return (
    <Card withBorder radius={4} p="md">
      <Stack gap="xs">
        <Text size="sm" fw={700}>
          Table cell preview
        </Text>
        <Table withTableBorder withColumnBorders>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Shot</Table.Th>
              <Table.Th>{fieldTitle || 'Generated column'}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            <Table.Tr>
              <Table.Td>{String(details.shot_number ?? '-')}</Table.Td>
              <Table.Td>{String(value)}</Table.Td>
            </Table.Tr>
          </Table.Tbody>
        </Table>
        {details.dataset ? (
          <Text size="xs" c="dimmed">
            Dataset: {String(details.dataset)}
            {details.shape ? ` [${String(details.shape)}]` : ''}
          </Text>
        ) : null}
        {details.input ? (
          <Text size="xs" c="dimmed">
            Input: {String(details.input)}
          </Text>
        ) : null}
      </Stack>
    </Card>
  )
}

export function VisualPreview({
  contextScope,
  datasetPreview,
  fieldKind,
  fieldTitle,
  columnDetails,
  shots,
}: {
  contextScope: string
  datasetPreview?: HZDRDatasetPreview
  fieldKind: string
  fieldTitle: string
  columnDetails: string
  shots: HZDRShot[]
}) {
  const parsedDetails = parseColumnDetails(columnDetails)
  const metadataInput =
    typeof parsedDetails.input === 'string' ? parsedDetails.input : undefined

  if (contextScope === 'set' && fieldKind === 'metadata' && metadataInput) {
    return (
      <Stack gap="xs">
        <ColumnCellPreview fieldTitle={fieldTitle} details={parsedDetails} />
        <MetadataTrendPreview
          values={collectNumericMetadataTrendValues(shots, metadataInput)}
          title={`${metadataInput} trend`}
        />
      </Stack>
    )
  }

  if (
    ![
      'hdf5',
      'lineout-preview',
      'image-preview',
      'plotly-trend',
      'function',
    ].includes(fieldKind)
  ) {
    return <ColumnCellPreview fieldTitle={fieldTitle} details={parsedDetails} />
  }

  if (!datasetPreview) {
    return <ColumnCellPreview fieldTitle={fieldTitle} details={parsedDetails} />
  }

  if (datasetPreview.preview_kind === 'image') {
    const pixels = datasetPreview.preview as number[][]
    return (
      <Stack gap="xs">
        <ColumnCellPreview fieldTitle={fieldTitle} details={parsedDetails} />
        <Text size="sm" fw={600}>
          {datasetPreview.name}
        </Text>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${pixels[0]?.length ?? 1}, 1fr)`,
            width: '100%',
            maxWidth: 420,
            aspectRatio: '1 / 1',
            border: '1px solid var(--mantine-color-gray-4)',
          }}
        >
          {pixels.flatMap((row, rowIndex) =>
            row.map((value, columnIndex) => (
              <div
                key={`${rowIndex}-${columnIndex}`}
                style={{
                  backgroundColor: `rgb(${Math.round(value * 255)}, ${Math.round(value * 255)}, ${Math.round(value * 255)})`,
                }}
              />
            ))
          )}
        </div>
      </Stack>
    )
  }

  if (datasetPreview.preview_kind === 'line') {
    const values = datasetPreview.preview as number[]
    const minValue = Math.min(...values)
    const maxValue = Math.max(...values)
    const points = values
      .map((value, index) => {
        const x = (index / Math.max(values.length - 1, 1)) * 100
        const y =
          90 - ((value - minValue) / Math.max(maxValue - minValue, 1e-9)) * 80
        return `${x},${y}`
      })
      .join(' ')
    return (
      <Stack gap="xs">
        <ColumnCellPreview fieldTitle={fieldTitle} details={parsedDetails} />
        <Text size="sm" fw={600}>
          {datasetPreview.name}
        </Text>
        <svg
          viewBox="0 0 100 100"
          width="100%"
          height="220"
          role="img"
          style={{ border: '1px solid var(--mantine-color-gray-4)' }}
        >
          <polyline
            points={points}
            fill="none"
            stroke="var(--mantine-color-blue-7)"
            strokeWidth="1.5"
          />
        </svg>
      </Stack>
    )
  }

  return (
    <Stack gap="xs">
      <ColumnCellPreview fieldTitle={fieldTitle} details={parsedDetails} />
      <Card withBorder radius={4} p="md">
        <Stack gap={4}>
          <Text size="sm" fw={600}>
            {datasetPreview.name}
          </Text>
          <Text size="xl">{String(datasetPreview.preview)}</Text>
        </Stack>
      </Card>
    </Stack>
  )
}
