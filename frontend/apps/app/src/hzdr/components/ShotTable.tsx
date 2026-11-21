import {
  type DragEvent,
  type PropsWithChildren,
  useEffect,
  useState,
} from 'react'
import {
  Badge,
  Button,
  Card,
  Group,
  Select,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core'

import type { HZDRShot, HZDRSelectedCell, HZDRSortState } from '../types'
import {
  statusColor,
  statusLabel,
  isMissingContextValueError,
  formatContextValue,
} from '../utils/format'
import { isPlotlyPreview } from '../utils/plotly'
import { isNumericLinePreview, isNumericMatrixPreview } from '../utils/preview'
import { getNumericMetadataKeys, metadataFieldLabel } from '../utils/metadata'
import { getNestedMetadataValue } from '../utils/metadata'
import { toTrendValue } from '../utils/shot-key'
import {
  formatMetadataCorrectionDraft,
  isCorrectableMetadataKey,
  parseMetadataCorrectionDraft,
} from '../utils/shot-metadata-correction'

import { MetadataTrendPreview, ContextPreviewValue } from './previews'
import { cellButtonStyle } from './styles'

export function DetailsSection({
  title,
  children,
  open = false,
}: PropsWithChildren<{ title: string; open?: boolean }>) {
  return (
    <details open={open}>
      <summary
        style={{
          cursor: 'pointer',
          fontWeight: 700,
          padding: '8px 0',
        }}
      >
        {title}
      </summary>
      {children}
    </details>
  )
}

const COLUMN_DRAG_TYPE = 'application/x-hzdr-column'

export function SortableHeader({
  width,
  label,
  column,
  sortState,
  onSort,
  onMove,
}: {
  width: number
  label: string
  column: string
  sortState: HZDRSortState
  onSort: (column: string) => void
  /** Given, the header can be dragged onto another one to move the column. */
  onMove?: (from: string, to: string) => void
}) {
  const active = sortState.column === column
  const [dropTarget, setDropTarget] = useState(false)
  const dragProps = onMove
    ? {
        draggable: true,
        title: `Drag to move ${label}`,
        onDragStart: (event: DragEvent) => {
          event.dataTransfer.setData(COLUMN_DRAG_TYPE, column)
          event.dataTransfer.effectAllowed = 'move'
        },
        onDragOver: (event: DragEvent) => {
          if (event.dataTransfer.types.includes(COLUMN_DRAG_TYPE)) {
            event.preventDefault()
            setDropTarget(true)
          }
        },
        onDragLeave: () => setDropTarget(false),
        onDrop: (event: DragEvent) => {
          event.preventDefault()
          setDropTarget(false)
          const from = event.dataTransfer.getData(COLUMN_DRAG_TYPE)
          if (from && from !== column) {
            onMove(from, column)
          }
        },
        style: {
          cursor: 'grab',
          boxShadow: dropTarget
            ? 'inset 3px 0 0 var(--mantine-color-blue-filled)'
            : undefined,
        },
      }
    : {}
  return (
    <Table.Th w={width} {...dragProps}>
      <button
        type="button"
        onClick={() => onSort(column)}
        title={`Sort by ${label}`}
        style={{
          ...cellButtonStyle,
          fontWeight: 700,
        }}
      >
        <Group gap={4} wrap="nowrap" justify="space-between">
          <Text size="sm" fw={700} truncate="end">
            {label}
          </Text>
          <Text
            size="xs"
            c={active ? 'blue' : 'dimmed'}
            style={{ flex: '0 0 auto' }}
          >
            {active ? (sortState.direction === 'asc' ? '↑' : '↓') : '↕'}
          </Text>
        </Group>
      </button>
    </Table.Th>
  )
}

export function SelectedCellPanel({
  cell,
  onCorrectMetadata,
}: {
  cell?: HZDRSelectedCell
  onCorrectMetadata: (
    rowKey: string,
    key: string,
    value: unknown,
    note?: string
  ) => void
}) {
  if (!cell) {
    return (
      <Card withBorder radius={4} p="md">
        <Text size="sm" c="dimmed">
          Click a table cell to inspect its value, preview, and numeric trend.
        </Text>
      </Card>
    )
  }

  const hasVisualPreview =
    isPlotlyPreview(cell.preview) ||
    isNumericLinePreview(cell.preview) ||
    isNumericMatrixPreview(cell.preview)

  return (
    <Card withBorder radius={4} p="md">
      <Stack gap="sm">
        <Group justify="space-between" gap="xs">
          <Stack gap={0}>
            <Text size="xs" c="dimmed">
              Shot {cell.shotLabel}
            </Text>
            <Text fw={700}>{cell.columnTitle}</Text>
          </Stack>
          <Badge variant="light">{cell.kind}</Badge>
        </Group>
        {cell.error ? (
          isMissingContextValueError(cell.error) ? (
            <Text size="sm" c="dimmed">
              No value is available for this shot.
            </Text>
          ) : (
            <Text size="sm" c="red">
              {cell.error}
            </Text>
          )
        ) : cell.kind === 'metadata' && cell.columnName === 'status' ? (
          <Stack gap="xs">
            <StatusBadge status={String(cell.value ?? 'unknown')} />
            <Text size="sm" c="dimmed">
              Change this in Shot detail using the review status form.
            </Text>
          </Stack>
        ) : !hasVisualPreview ? (
          <Text size="xl">{formatContextValue(cell.value)}</Text>
        ) : null}
        <ContextPreviewValue preview={cell.preview} value={cell.value} />
        {cell.trendValues && cell.trendValues.length > 1 ? (
          <Stack gap="xs">
            <Text size="sm" fw={600}>
              Column trend
            </Text>
            <MetadataTrendPreview values={cell.trendValues} />
          </Stack>
        ) : null}
        {isCorrectableMetadataCell(cell) ? (
          <MetadataCorrectionForm
            cell={cell}
            onCorrectMetadata={onCorrectMetadata}
          />
        ) : null}
      </Stack>
    </Card>
  )
}

export function MetadataCorrectionForm({
  cell,
  onCorrectMetadata,
}: {
  cell: HZDRSelectedCell
  onCorrectMetadata: (
    rowKey: string,
    key: string,
    value: unknown,
    note?: string
  ) => void
}) {
  const [draft, setDraft] = useState(formatMetadataCorrectionDraft(cell.value))
  const [note, setNote] = useState('')

  useEffect(() => {
    setDraft(formatMetadataCorrectionDraft(cell.value))
    setNote('')
  }, [cell.columnName, cell.rowKey, cell.value])

  return (
    <DetailsSection title="Correct bad metadata">
      <Stack gap="xs">
        <Text size="xs" c="dimmed">
          Updates the source metadata and records who changed it, the previous
          value, and the reason.
        </Text>
        <Textarea
          label="Correct value"
          description="Enter JSON for numbers, booleans, null, arrays, or objects; plain text is kept as text."
          minRows={2}
          value={draft}
          onChange={(event) => setDraft(event.currentTarget.value)}
        />
        <TextInput
          label="Reason"
          placeholder="Why is this value being corrected?"
          value={note}
          onChange={(event) => setNote(event.currentTarget.value)}
        />
        <Button
          size="xs"
          variant="light"
          onClick={() =>
            onCorrectMetadata(
              cell.rowKey,
              cell.columnName,
              parseMetadataCorrectionDraft(draft),
              note.trim() || undefined
            )
          }
        >
          Apply correction
        </Button>
      </Stack>
    </DetailsSection>
  )
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      color={statusColor(status)}
      variant="light"
      radius={4}
      miw={88}
      maw={112}
      styles={{
        root: { display: 'inline-flex' },
        label: {
          textTransform: 'none',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        },
      }}
    >
      {statusLabel(status)}
    </Badge>
  )
}

export function HZDRShotSetsPanel({ shots }: { shots: HZDRShot[] }) {
  const numericMetadataKeys = getNumericMetadataKeys(shots)
  const [trendKey, setTrendKey] = useState(numericMetadataKeys[0] ?? '')

  useEffect(() => {
    setTrendKey((currentKey) => currentKey || numericMetadataKeys[0] || '')
  }, [numericMetadataKeys])

  const trendValues = shots
    .map((shot) =>
      toTrendValue(
        shot,
        Number(getNestedMetadataValue(shot.metadata, trendKey))
      )
    )
    .filter((entry) => Number.isFinite(entry.value))

  return (
    <Card withBorder radius={4} p="md">
      <Stack gap="sm">
        <Group justify="space-between">
          <Stack gap={2}>
            <Title order={4}>Shot sets</Title>
            <Text size="sm" c="dimmed">
              Collections of shots for trends across the campaign/source.
            </Text>
          </Stack>
          <Badge variant="light">{shots.length} shots</Badge>
        </Group>
        <Select
          label="Trend value"
          value={trendKey}
          onChange={(value) => setTrendKey(value ?? '')}
          data={numericMetadataKeys.map((key) => ({
            value: key,
            label: metadataFieldLabel(key),
          }))}
          searchable
        />
        <MetadataTrendPreview values={trendValues} />
      </Stack>
    </Card>
  )
}

function isCorrectableMetadataCell(cell: HZDRSelectedCell) {
  return cell.kind === 'metadata' && isCorrectableMetadataKey(cell.columnName)
}
