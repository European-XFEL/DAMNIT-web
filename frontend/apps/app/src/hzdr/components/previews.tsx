import { useEffect, useRef } from 'react'
import Plotly from 'react-plotly.js'
import { Card, Code, Group, Stack, Text } from '@mantine/core'

import type { PlotlyPreview, HZDRTrendValue } from '../types'
import { decodePlotlyTypedArrays } from '../utils/plotly'
import { isPlotlyPreview, getPlotlySparklineValues } from '../utils/plotly'
import { isNumericLinePreview, isNumericMatrixPreview } from '../utils/preview'
import { formatTrendValue } from '../utils/format'

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
}: {
  value: unknown
  preview?: unknown
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
  return <CanvasImage values={values} maxWidth={size} />
}

/** A matrix drawn on a canvas, one pixel per value, scaled to its range. */
export function CanvasImage({
  values,
  maxWidth = 320,
}: {
  values: number[][]
  maxWidth?: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const height = values.length
  const width = values[0]?.length ?? 0

  useEffect(() => {
    const canvas = canvasRef.current
    // jsdom and very old browsers have no 2D context: draw nothing there.
    let context: CanvasRenderingContext2D | null = null
    try {
      context = canvas?.getContext('2d') ?? null
    } catch {
      context = null
    }
    if (!canvas || !context || !width || !height) return
    // A loop, not Math.min(...values): spreading a large image overflows
    // the call stack.
    let minimum = Infinity
    let maximum = -Infinity
    for (const row of values) {
      for (const value of row) {
        if (!Number.isFinite(value)) continue
        if (value < minimum) minimum = value
        if (value > maximum) maximum = value
      }
    }
    const range = maximum - minimum || 1
    const image = context.createImageData(width, height)
    values.forEach((row, y) =>
      row.forEach((value, x) => {
        const shade = Number.isFinite(value)
          ? Math.round(((value - minimum) / range) * 255)
          : 0
        const offset = (y * width + x) * 4
        image.data[offset] = shade
        image.data[offset + 1] = shade
        image.data[offset + 2] = shade
        image.data[offset + 3] = 255
      })
    )
    context.putImageData(image, 0, 0)
  }, [values, width, height])

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      role="img"
      aria-label="Image preview"
      style={{
        display: 'block',
        width: '100%',
        maxWidth,
        aspectRatio: `${width || 1} / ${height || 1}`,
        imageRendering: 'pixelated',
        border: '1px solid var(--mantine-color-gray-4)',
      }}
    />
  )
}

type PlotlyFigure = {
  data?: Plotly.Data[]
  layout?: Partial<Plotly.Layout>
  config?: Partial<Plotly.Config>
}

function parsePlotlyFigure(
  preview: PlotlyPreview
): { figure: PlotlyFigure } | { error: string } {
  try {
    return {
      figure: decodePlotlyTypedArrays(JSON.parse(preview.json)) as PlotlyFigure,
    }
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : 'Could not render Plotly preview.',
    }
  }
}

export function PlotlyFigurePreview({ preview }: { preview: PlotlyPreview }) {
  const parsed = parsePlotlyFigure(preview)
  if ('error' in parsed) {
    return <Code block>{parsed.error}</Code>
  }
  const { figure } = parsed
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
  selectedRowKey,
  onSelectPoint,
}: {
  values: HZDRTrendValue[]
  title?: string
  xLabel?: string
  /** The shot to mark on the curve (the table's selected shot). */
  selectedRowKey?: string
  /** Given, each point with a rowKey is a button that selects its shot. */
  onSelectPoint?: (rowKey: string) => void
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
        role={onSelectPoint ? 'group' : 'img'}
        aria-label={
          onSelectPoint ? `${title}: click a point to open its shot` : undefined
        }
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
          const selected =
            selectedRowKey !== undefined && entry.rowKey === selectedRowKey
          const description = `Shot ${entry.label ?? entry.shotNumber}: ${formatTrendValue(entry.value)}`
          const rowKey = entry.rowKey
          const clickable = Boolean(onSelectPoint && rowKey)
          const select = () => {
            if (onSelectPoint && rowKey) onSelectPoint(rowKey)
          }
          return (
            <g
              key={rowKey ?? index}
              data-selected={selected || undefined}
              {...(clickable
                ? {
                    role: 'button',
                    tabIndex: 0,
                    'aria-label': `Open ${description}`,
                    'aria-pressed': selected,
                    style: { cursor: 'pointer' },
                    onClick: select,
                    onKeyDown: (event: React.KeyboardEvent) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        select()
                      }
                    },
                  }
                : {})}
            >
              {clickable ? (
                // A larger, invisible target: a 3 px dot is hard to hit.
                <circle cx={x} cy={y} r="8" fill="transparent" />
              ) : null}
              {selected ? (
                <circle
                  cx={x}
                  cy={y}
                  r="6.5"
                  fill="none"
                  stroke="var(--mantine-color-orange-6)"
                  strokeWidth="2"
                />
              ) : null}
              <circle
                cx={x}
                cy={y}
                r={selected ? 4 : 3.2}
                fill={
                  selected
                    ? 'var(--mantine-color-orange-6)'
                    : 'var(--mantine-color-blue-7)'
                }
              />
              <title>{description}</title>
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
