import { type PropsWithChildren, useEffect, useState } from 'react'
import {
  Anchor,
  Badge,
  Button,
  Card,
  Code,
  Divider,
  Group,
  Paper,
  Radio,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core'
import type {
  HZDRShot,
  HZDRShotDetail,
  HZDRSource,
  HZDRSelectedCell,
  HZDRSortState,
} from '../types'
import {
  statusColor,
  statusLabel,
  defaultReviewNote,
  formatFiredAt,
  isMissingContextValueError,
  formatContextValue,
} from '../utils/format'
import { isPlotlyPreview } from '../utils/plotly'
import { isNumericLinePreview, isNumericMatrixPreview } from '../utils/preview'
import { getNumericMetadataKeys } from '../utils/metadata'
import { getNestedMetadataValue } from '../utils/metadata'
import {
  MetadataTrendPreview,
  ContextPreviewValue,
  TruncatedCell,
} from './previews'

export { TruncatedCell }

import { cellButtonStyle } from './styles'
export { cellButtonStyle }

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

export function SortableHeader({
  width,
  label,
  column,
  sortState,
  onSort,
}: {
  width: number
  label: string
  column: string
  sortState: HZDRSortState
  onSort: (column: string) => void
}) {
  const active = sortState.column === column
  return (
    <Table.Th w={width}>
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
    shotNumber: number,
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
              Shot {cell.shotNumber}
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
    shotNumber: number,
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
  }, [cell.columnName, cell.shotNumber, cell.value])

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
              cell.shotNumber,
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
    .map((shot) => ({
      shotNumber: shot.shot_number,
      value: Number(getNestedMetadataValue(shot.metadata, trendKey)),
    }))
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
          data={numericMetadataKeys}
          searchable
        />
        <MetadataTrendPreview values={trendValues} />
      </Stack>
    </Card>
  )
}

export function ShotDetailPanel({
  shot,
  shotDetail,
  availableSources,
  onUpdateStatus,
  onCorrectMetadata,
}: {
  shot?: HZDRShot
  shotDetail?: HZDRShotDetail
  availableSources: HZDRSource[]
  onUpdateStatus?: (shotNumber: number, status: string, note?: string) => void
  onCorrectMetadata?: (
    shotNumber: number,
    key: string,
    value: unknown,
    note?: string
  ) => void
}) {
  const [reviewStatus, setReviewStatus] = useState('processed')
  const [reviewNote, setReviewNote] = useState('')
  const [correctionKey, setCorrectionKey] = useState('')
  const [correctionDraft, setCorrectionDraft] = useState('')
  const [correctionNote, setCorrectionNote] = useState('')

  useEffect(() => {
    setReviewStatus(String(shot?.metadata.status ?? 'processed'))
    setReviewNote(String(shot?.metadata.review_note ?? ''))
  }, [shot?.shot_number, shot?.metadata.status, shot?.metadata.review_note])

  useEffect(() => {
    setCorrectionKey('')
    setCorrectionDraft('')
    setCorrectionNote('')
  }, [shot?.shot_number])

  if (!shot) {
    return (
      <Card withBorder radius={4} p="md">
        <Stack gap={6}>
          <Text fw={600}>No shot selected.</Text>
          <Text size="sm" c="dimmed">
            Available sources in current provider:
          </Text>
          {availableSources.map((entry) => (
            <Anchor key={entry.key} href={`/source/${entry.key}`}>
              {entry.key} ({entry.shots.length} shots)
            </Anchor>
          ))}
        </Stack>
      </Card>
    )
  }

  return (
    <Stack gap="md">
      <Card withBorder radius={4} p="md">
        <Stack gap="sm">
          <Group justify="space-between">
            <Title order={4}>Shot {shot.shot_number}</Title>
            <Badge color={statusColor(String(shot.metadata.status ?? ''))}>
              {shot.metadata.status ?? 'unknown'}
            </Badge>
          </Group>
          <Paper withBorder radius={4} p="sm" bg="var(--mantine-color-gray-0)">
            <Stack gap="sm">
              <Radio.Group
                label="Review status"
                value={reviewStatus}
                onChange={setReviewStatus}
              >
                <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="xs" mt="xs">
                  {[
                    {
                      value: 'processed',
                      label: 'OK',
                      color: 'teal',
                      background: 'var(--mantine-color-teal-0)',
                    },
                    {
                      value: 'needs-review',
                      label: 'Review',
                      color: 'yellow',
                      background: 'var(--mantine-color-yellow-0)',
                    },
                    {
                      value: 'revision-needed',
                      label: 'Revise',
                      color: 'red',
                      background: 'var(--mantine-color-red-0)',
                    },
                  ].map((option) => (
                    <Paper
                      key={option.value}
                      withBorder
                      radius={4}
                      p="xs"
                      bg={option.background}
                    >
                      <Radio
                        value={option.value}
                        label={option.label}
                        color={option.color}
                      />
                    </Paper>
                  ))}
                </SimpleGrid>
              </Radio.Group>
              <Textarea
                label="Review note"
                minRows={2}
                value={reviewNote}
                onChange={(event) => setReviewNote(event.currentTarget.value)}
              />
              <Button
                size="xs"
                variant="light"
                color={statusColor(reviewStatus)}
                onClick={() =>
                  onUpdateStatus?.(
                    shot.shot_number,
                    reviewStatus,
                    reviewNote.trim() || defaultReviewNote(reviewStatus)
                  )
                }
              >
                Apply review
              </Button>
            </Stack>
          </Paper>
          {shot.metadata.review_note ? (
            <Text size="xs" c="dimmed">
              Last review note: {String(shot.metadata.review_note)}
            </Text>
          ) : null}
          {shot.metadata.reviewed_by || shot.metadata.reviewed_at ? (
            <Text size="xs" c="dimmed">
              Last changed by {String(shot.metadata.reviewed_by ?? 'unknown')}
              {shot.metadata.reviewed_at
                ? ` at ${formatFiredAt(String(shot.metadata.reviewed_at))}`
                : ''}
            </Text>
          ) : null}
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
            <Stack gap={2}>
              <Text size="xs" c="dimmed">
                Fired at
              </Text>
              <Text size="sm">{shot.fired_at}</Text>
            </Stack>
            <Stack gap={2}>
              <Text size="xs" c="dimmed">
                Target
              </Text>
              <Text size="sm">{shot.metadata.target ?? '-'}</Text>
            </Stack>
            <Stack gap={2}>
              <Text size="xs" c="dimmed">
                Canonical shot key
              </Text>
              <Text size="sm">{shot.shot_key ?? '-'}</Text>
            </Stack>
            <Stack gap={2}>
              <Text size="xs" c="dimmed">
                Match quality
              </Text>
              <Text size="sm">
                {shot.match_quality ?? shot.match_status ?? '-'}
                {shot.match_time_delta_s !== undefined &&
                shot.match_time_delta_s !== null
                  ? ` (${shot.match_time_delta_s.toFixed(3)} s)`
                  : ''}
              </Text>
            </Stack>
            <Stack gap={2}>
              <Text size="xs" c="dimmed">
                LabFrog record
              </Text>
              <Text size="sm">{shot.labfrog_record_id ?? '-'}</Text>
            </Stack>
            <Stack gap={2}>
              <Text size="xs" c="dimmed">
                LabFrog date/time
              </Text>
              <Text size="sm">{shot.labfrog_date_time ?? '-'}</Text>
            </Stack>
          </SimpleGrid>
          <Divider />
          <Stack gap={4}>
            <Text size="xs" c="dimmed">
              HDF5 file
            </Text>
            <Code block>{shot.hdf5_path ?? '-'}</Code>
          </Stack>
        </Stack>
      </Card>

      <Card withBorder radius={4} p="md">
        <Stack gap="xs">
          <Group justify="space-between">
            <Title order={5}>Linked source events</Title>
            <Badge variant="light">{shot.events?.length ?? 0}</Badge>
          </Group>
          {shot.events?.length ? (
            shot.events.map((event) => (
              <Paper key={event.event_id} withBorder radius={4} p="xs">
                <Group justify="space-between" align="flex-start">
                  <Stack gap={2}>
                    <Group gap="xs">
                      <Badge variant="light">{event.source}</Badge>
                      <Text size="sm" fw={600}>
                        {event.kind}
                      </Text>
                    </Group>
                    <Text size="xs" c="dimmed">
                      {event.timestamp} /{' '}
                      {event.transport ?? 'unknown transport'}
                    </Text>
                  </Stack>
                  <Text size="xs" c="dimmed">
                    {event.match_quality ?? '-'}
                  </Text>
                </Group>
              </Paper>
            ))
          ) : (
            <Text size="sm" c="dimmed">
              No source events are linked to this canonical shot.
            </Text>
          )}
        </Stack>
      </Card>

      <Card withBorder radius={4} p="md">
        <Stack gap="xs">
          <Group justify="space-between">
            <Title order={5}>Data products</Title>
            <Badge variant="light">{shot.data_products?.length ?? 0}</Badge>
          </Group>
          {shot.data_products?.length ? (
            shot.data_products.map((product, index) => (
              <Paper
                key={product.product_id ?? `${product.source}-${index}`}
                withBorder
                radius={4}
                p="xs"
              >
                <Group justify="space-between" align="flex-start" wrap="nowrap">
                  <Stack gap={2} style={{ minWidth: 0 }}>
                    <Group gap="xs">
                      <Badge variant="light">{product.source}</Badge>
                      <Text size="sm" fw={600}>
                        {product.preview_kind ?? product.kind}
                      </Text>
                    </Group>
                    <Text size="xs" style={{ overflowWrap: 'anywhere' }}>
                      {product.dataset_name ?? product.path ?? '-'}
                    </Text>
                  </Stack>
                  <Text size="xs" c="dimmed" ta="right">
                    {product.dtype ?? '-'}
                    {product.shape.length
                      ? ` [${product.shape.join(', ')}]`
                      : ''}
                    {product.units ? ` ${product.units}` : ''}
                  </Text>
                </Group>
              </Paper>
            ))
          ) : (
            <Text size="sm" c="dimmed">
              No data products are registered for this shot.
            </Text>
          )}
        </Stack>
      </Card>

      <Card withBorder radius={4} p="md">
        <Stack gap="xs">
          <Title order={5}>HDF5 datasets</Title>
          {shotDetail?.hdf5_error ? (
            <Text size="sm" c="red">
              {shotDetail.hdf5_error}
            </Text>
          ) : null}
          {shotDetail && !shotDetail.hdf5_exists ? (
            <Text size="sm" c="dimmed">
              File not found.
            </Text>
          ) : null}
          {shotDetail?.hdf5_datasets.map((dataset) => (
            <Group key={dataset.name} justify="space-between" wrap="nowrap">
              <Text size="sm">{dataset.name}</Text>
              <Text size="xs" c="dimmed">
                {dataset.dtype} [{dataset.shape.join(', ')}]
              </Text>
            </Group>
          ))}
        </Stack>
      </Card>

      <Card withBorder radius={4} p="md">
        <Stack gap="xs">
          <Title order={5}>Metadata</Title>
          <DetailsSection title="Correct or add metadata">
            <Stack gap="xs">
              <Select
                label="Load existing field"
                description="Or type a missing top-level key below."
                data={Object.keys(shot.metadata)
                  .filter(isCorrectableMetadataKey)
                  .sort()
                  .map((key) => ({ value: key, label: key }))}
                value={
                  Object.prototype.hasOwnProperty.call(
                    shot.metadata,
                    correctionKey
                  )
                    ? correctionKey
                    : null
                }
                onChange={(key) => {
                  const nextKey = key ?? ''
                  setCorrectionKey(nextKey)
                  setCorrectionDraft(
                    nextKey
                      ? formatMetadataCorrectionDraft(shot.metadata[nextKey])
                      : ''
                  )
                }}
                searchable
                clearable
              />
              <TextInput
                label="Metadata key"
                value={correctionKey}
                onChange={(event) =>
                  setCorrectionKey(event.currentTarget.value)
                }
                placeholder="missing_or_bad_field"
              />
              <Textarea
                label="Correct value"
                description="JSON values keep their type; plain text stays text."
                minRows={2}
                value={correctionDraft}
                onChange={(event) =>
                  setCorrectionDraft(event.currentTarget.value)
                }
              />
              <TextInput
                label="Reason"
                value={correctionNote}
                onChange={(event) =>
                  setCorrectionNote(event.currentTarget.value)
                }
                placeholder="Why is this being corrected?"
              />
              <Button
                size="xs"
                variant="light"
                disabled={
                  !correctionKey.trim() ||
                  !isCorrectableMetadataKey(correctionKey.trim())
                }
                onClick={() =>
                  onCorrectMetadata?.(
                    shot.shot_number,
                    correctionKey.trim(),
                    parseMetadataCorrectionDraft(correctionDraft),
                    correctionNote.trim() || undefined
                  )
                }
              >
                Apply metadata correction
              </Button>
            </Stack>
          </DetailsSection>
          <ScrollArea.Autosize mah={260} type="auto">
            <Code block>{JSON.stringify(shot.metadata, null, 2)}</Code>
          </ScrollArea.Autosize>
        </Stack>
      </Card>

      <Card withBorder radius={4} p="md">
        <Stack gap="xs">
          <Group justify="space-between">
            <Title order={5}>Context</Title>
            <Button
              component="a"
              href={`/source/${shot.source_key}/context-builder`}
              size="xs"
              variant="light"
            >
              Build column
            </Button>
          </Group>
          <Text size="sm" c="dimmed">
            Build and save one table column at a time in the context builder.
          </Text>
        </Stack>
      </Card>
    </Stack>
  )
}

function isCorrectableMetadataCell(cell: HZDRSelectedCell) {
  return cell.kind === 'metadata' && isCorrectableMetadataKey(cell.columnName)
}

function isCorrectableMetadataKey(key: string) {
  return ![
    'shot_number',
    'shot_day',
    'fired_at',
    'status',
    'status_history',
    'reviewed_at',
    'reviewed_by',
    'review_note',
    'metadata_correction_history',
    'shot_id',
    'experiment_id',
    'combined_hdf5_path',
  ].includes(key)
}

function formatMetadataCorrectionDraft(value: unknown) {
  if (value === undefined) {
    return ''
  }
  if (typeof value === 'string') {
    return value
  }
  return JSON.stringify(value, null, 2)
}

function parseMetadataCorrectionDraft(draft: string): unknown {
  const trimmed = draft.trim()
  if (!trimmed) {
    return ''
  }
  try {
    return JSON.parse(trimmed)
  } catch {
    return draft
  }
}
