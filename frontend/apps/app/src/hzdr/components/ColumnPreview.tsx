import { useMemo } from 'react'
import {
  Group,
  Loader,
  Paper,
  Progress,
  Stack,
  Table,
  Text,
} from '@mantine/core'

import type { HZDRDatasetPreview, HZDRShot } from '../types'
import {
  campaignValues,
  cellValue,
  formatPreviewNumber,
} from '../utils/columnPreview'
import type { CellValue } from '../utils/columnPreview'

import { CanvasImage, MetadataTrendPreview } from './previews'

/** What a column reads, as far as a preview can show it. */
export type ColumnPreviewInput =
  | {
      source: 'metadata'
      field: string
      /** auto: a number when most recorded values parse as one. */
      type: 'number' | 'text' | 'auto'
      unit?: string
    }
  | {
      source: 'hdf5'
      /** The builder's field kind: hdf5, lineout-preview, image-preview, ... */
      display: string
      preview?: HZDRDatasetPreview
      loading: boolean
      error?: string
    }
  | { source: 'computed'; note: string }

const LABELS_SHOWN = 6

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <Stack gap={4}>
      <Text size="xs" fw={700} c="dimmed" tt="uppercase">
        {title}
      </Text>
      {children}
    </Stack>
  )
}

function TableRow({
  shotLabel,
  title,
  children,
}: {
  shotLabel: string
  title: string
  children: React.ReactNode
}) {
  return (
    <Table withTableBorder withColumnBorders layout="fixed">
      <Table.Thead>
        <Table.Tr>
          <Table.Th w={110}>Shot</Table.Th>
          <Table.Th>{title}</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        <Table.Tr>
          <Table.Td>{shotLabel}</Table.Td>
          <Table.Td>{children}</Table.Td>
        </Table.Tr>
      </Table.Tbody>
    </Table>
  )
}

function MetadataCell({ cell, unit }: { cell: CellValue; unit?: string }) {
  if (cell.state === 'missing') {
    return (
      <Text size="sm" c="dimmed" fs="italic">
        Missing
      </Text>
    )
  }
  if (cell.state === 'not-a-number') {
    return (
      <Text size="sm" c="red" title="Not a number: check this value in LabFrog">
        {cell.value}
      </Text>
    )
  }
  if (cell.state === 'number') {
    return (
      <Text size="sm">
        {formatPreviewNumber(cell.value)}
        {unit ? ` ${unit}` : ''}
      </Text>
    )
  }
  return <Text size="sm">{cell.value}</Text>
}

function LabelBars({
  labels,
  recorded,
}: {
  labels: [string, number][]
  recorded: number
}) {
  const shown = labels.slice(0, LABELS_SHOWN)
  const more = labels.length - shown.length
  return (
    <Stack gap={4}>
      {shown.map(([label, count]) => (
        <Group key={label} gap="xs" wrap="nowrap">
          <Text size="xs" w={140} truncate="end" title={label}>
            {label}
          </Text>
          <Progress
            value={(count / recorded) * 100}
            size="sm"
            style={{ flex: 1 }}
            aria-label={`${label}: ${count} shots`}
          />
          <Text size="xs" c="dimmed" w={60} ta="right">
            {count} shot{count === 1 ? '' : 's'}
          </Text>
        </Group>
      ))}
      {more > 0 ? (
        <Text size="xs" c="dimmed">
          and {more} more label{more === 1 ? '' : 's'}
        </Text>
      ) : null}
    </Stack>
  )
}

function summaryText(preview: HZDRDatasetPreview) {
  if (preview.summary === null || preview.summary === undefined) {
    return preview.preview_kind === 'scalar'
      ? String(preview.preview ?? '-')
      : 'Not a number'
  }
  const value = formatPreviewNumber(preview.summary)
  return preview.summary_exact === false ? `≈ ${value}` : value
}

const SUMMARY_NOTES: Record<string, string> = {
  image: 'The mean of the image',
  line: 'The mean of the lineout',
  scalar: 'The stored value',
}

function DatasetPreview({
  input,
  shotLabel,
  title,
}: {
  input: Extract<ColumnPreviewInput, { source: 'hdf5' }>
  shotLabel: string
  title: string
}) {
  if (input.loading) {
    return (
      <Group gap="xs">
        <Loader size="xs" />
        <Text size="xs">Reading the dataset on the example shot…</Text>
      </Group>
    )
  }
  if (input.error || !input.preview) {
    return (
      <Text size="sm" c="red">
        {input.error ?? 'Choose an example shot that has this dataset.'}
      </Text>
    )
  }
  const { preview } = input
  const opensAs =
    preview.preview_kind === 'image' &&
    Array.isArray(preview.preview) &&
    Array.isArray(preview.preview[0])
      ? 'image'
      : preview.preview_kind === 'line' && Array.isArray(preview.preview)
        ? 'line'
        : undefined
  return (
    <Stack gap="sm">
      <Section title="In the table">
        <TableRow shotLabel={shotLabel} title={title}>
          <Text size="sm">{summaryText(preview)}</Text>
        </TableRow>
        <Text size="xs" c="dimmed">
          {SUMMARY_NOTES[preview.preview_kind] ?? 'The value'}
          {preview.summary_exact === false
            ? ', estimated from the preview here; the table uses every value'
            : ''}
          . {preview.name}: {preview.dtype}, {preview.shape.join('×') || '1'}.
        </Text>
      </Section>
      {opensAs === 'image' && input.display !== 'hdf5' ? (
        <Section title="On double-click">
          <CanvasImage values={preview.preview as number[][]} />
          <Text size="xs" c="dimmed">
            Shown reduced; the cell panel opens the shot’s own image.
          </Text>
        </Section>
      ) : null}
      {opensAs === 'line' && input.display !== 'hdf5' ? (
        <Section title="On double-click">
          <MetadataTrendPreview
            values={(preview.preview as Array<number | null>).flatMap(
              // NaN and infinities arrive as null: leave a gap, not a zero.
              (value, index) =>
                typeof value === 'number' && Number.isFinite(value)
                  ? [{ shotNumber: index, value }]
                  : []
            )}
            title={title}
            xLabel="sample"
          />
        </Section>
      ) : null}
    </Stack>
  )
}

/**
 * What a column will show, before it is added: the example shot's cell, what
 * a double-click opens, and the values across the campaign. Used by the
 * builder and by each suggestion of "Help me choose".
 */
export function ColumnPreview({
  title,
  input,
  exampleShot,
  shots,
}: {
  title: string
  input: ColumnPreviewInput
  exampleShot?: HZDRShot
  shots: HZDRShot[]
}) {
  const shotLabel = exampleShot ? `Shot ${exampleShot.shot_number}` : '-'

  if (input.source === 'computed') {
    return (
      <Paper withBorder radius={4} p="sm">
        <Text size="sm" c="dimmed">
          {input.note}
        </Text>
      </Paper>
    )
  }

  if (input.source === 'hdf5') {
    return (
      <Paper withBorder radius={4} p="sm">
        <DatasetPreview input={input} shotLabel={shotLabel} title={title} />
      </Paper>
    )
  }

  return (
    <MetadataPreview
      title={title}
      input={input}
      exampleShot={exampleShot}
      shots={shots}
      shotLabel={shotLabel}
    />
  )
}

function MetadataPreview({
  title,
  input,
  exampleShot,
  shots,
  shotLabel,
}: {
  title: string
  input: Extract<ColumnPreviewInput, { source: 'metadata' }>
  exampleShot?: HZDRShot
  shots: HZDRShot[]
  shotLabel: string
}) {
  // Every shot is read once per campaign and field, not on each render.
  const across = useMemo(
    () => campaignValues(shots, input.field),
    [shots, input.field]
  )
  const type =
    input.type === 'auto' ? (across.numeric ? 'number' : 'text') : input.type
  const cell = cellValue(exampleShot, input.field, type)
  return (
    <Paper withBorder radius={4} p="sm">
      <Stack gap="sm">
        <Section title="In the table">
          <TableRow shotLabel={shotLabel} title={title}>
            <MetadataCell cell={cell} unit={input.unit} />
          </TableRow>
          {cell.state === 'missing' ? (
            <Text size="xs" c="dimmed">
              The example shot has no value here; such shots show Missing.
            </Text>
          ) : null}
          {cell.state === 'not-a-number' ? (
            <Text size="xs" c="dimmed">
              Not a number, so the table shows it in red: check the value in
              LabFrog.
            </Text>
          ) : null}
        </Section>
        <Section
          title={`Across the campaign: ${across.recorded} of ${across.total} shots`}
        >
          {!across.recorded ? (
            <Text size="sm" c="dimmed">
              No shot records this value yet.
            </Text>
          ) : type === 'number' && across.numbers.length ? (
            <MetadataTrendPreview
              values={across.numbers}
              title={title}
              xLabel="shot"
            />
          ) : (
            <LabelBars labels={across.labels} recorded={across.recorded} />
          )}
        </Section>
      </Stack>
    </Paper>
  )
}
