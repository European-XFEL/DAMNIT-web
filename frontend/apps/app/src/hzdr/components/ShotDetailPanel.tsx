import { type ReactNode, useEffect, useState } from 'react'
import {
  Anchor,
  Badge,
  Button,
  Card,
  Code,
  Group,
  Paper,
  ScrollArea,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core'
import { Link } from 'react-router'

import type { HZDRShot, HZDRShotDetail, HZDRSource } from '../types'
import {
  NOT_RECORDED,
  defaultReviewNote,
  formatShotTime,
  matchQualityLabel,
  statusColor,
} from '../utils/format'
import { formatTargetLabel } from '../utils/metadata'
import { formatShotLabel, getShotRowKey } from '../utils/shot-key'
import {
  formatMetadataCorrectionDraft,
  isCorrectableMetadataKey,
  parseMetadataCorrectionDraft,
} from '../utils/shot-metadata-correction'

import { ShotDatasetBrowser } from './ShotDatasetTree'
import { ShotProductPreview } from './ShotProductPreview'
import { DetailsSection, StatusBadge } from './ShotTable'

type MetadataCorrection = (
  rowKey: string,
  key: string,
  value: unknown,
  note?: string
) => void

const isEmpty = (value: unknown) =>
  value === null || value === undefined || value === ''

/** One labelled fact; an empty value reads "Not recorded", dimmed. */
function ShotField({
  label,
  value,
  title,
  children,
}: {
  label: string
  value?: unknown
  title?: string
  children?: ReactNode
}) {
  return (
    <Stack gap={2} style={{ minWidth: 0 }}>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      {children ??
        (isEmpty(value) ? (
          <Text size="sm" c="dimmed">
            {NOT_RECORDED}
          </Text>
        ) : (
          <Text size="sm" title={title}>
            {String(value)}
          </Text>
        ))}
    </Stack>
  )
}

/** The shot key in monospace, wrapping at any character, with a copy button. */
export function ShotKeyField({ shotKey }: { shotKey?: string }) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>(
    'idle'
  )
  useEffect(() => setCopyState('idle'), [shotKey])
  if (!shotKey) {
    return <ShotField label="Shot key" />
  }
  const copy = () => {
    // The clipboard is missing outside a secure context and can refuse.
    Promise.resolve()
      .then(() => navigator.clipboard.writeText(shotKey))
      .then(() => setCopyState('copied'))
      .catch(() => setCopyState('failed'))
  }
  return (
    <ShotField label="Shot key">
      <Group gap="xs" wrap="nowrap" align="flex-start">
        <Text
          size="sm"
          ff="monospace"
          style={{ overflowWrap: 'anywhere', minWidth: 0, flex: 1 }}
        >
          {shotKey}
        </Text>
        <Button
          size="compact-xs"
          variant="subtle"
          color={copyState === 'failed' ? 'red' : undefined}
          onClick={copy}
          style={{ flex: '0 0 auto' }}
        >
          {copyState === 'copied'
            ? 'Copied'
            : copyState === 'failed'
              ? 'Could not copy'
              : 'Copy'}
        </Button>
      </Group>
    </ShotField>
  )
}

const REVIEW_OPTIONS = [
  { value: 'processed', label: 'OK' },
  { value: 'needs-review', label: 'Review' },
  { value: 'revision-needed', label: 'Revise' },
]

/** OK / Review / Revise with a note: one compact row under the facts. */
export function ShotReviewControl({
  shot,
  onUpdateStatus,
}: {
  shot: HZDRShot
  onUpdateStatus?: (rowKey: string, status: string, note?: string) => void
}) {
  const rowKey = getShotRowKey(shot)
  const [reviewStatus, setReviewStatus] = useState('processed')
  const [reviewNote, setReviewNote] = useState('')

  useEffect(() => {
    setReviewStatus(String(shot.metadata.status ?? 'processed'))
    setReviewNote(String(shot.metadata.review_note ?? ''))
  }, [rowKey, shot.metadata.status, shot.metadata.review_note])

  return (
    <Paper withBorder radius={4} p="xs">
      <Stack gap={6}>
        <Text size="xs" fw={600}>
          Review
        </Text>
        <SegmentedControl
          size="xs"
          fullWidth
          aria-label="Review status"
          value={reviewStatus}
          onChange={setReviewStatus}
          color={statusColor(reviewStatus)}
          data={REVIEW_OPTIONS}
        />
        <Group gap="xs" wrap="nowrap" align="flex-end">
          <TextInput
            size="xs"
            aria-label="Review note"
            placeholder="Note (optional)"
            value={reviewNote}
            onChange={(event) => setReviewNote(event.currentTarget.value)}
            style={{ flex: 1, minWidth: 0 }}
          />
          <Button
            size="xs"
            variant="light"
            color={statusColor(reviewStatus)}
            onClick={() =>
              onUpdateStatus?.(
                rowKey,
                reviewStatus,
                reviewNote.trim() || defaultReviewNote(reviewStatus)
              )
            }
          >
            Save
          </Button>
        </Group>
        {shot.metadata.reviewed_by || shot.metadata.reviewed_at ? (
          <Text size="xs" c="dimmed">
            Last changed by {String(shot.metadata.reviewed_by ?? 'unknown')}
            {shot.metadata.reviewed_at
              ? `, ${formatShotTime(String(shot.metadata.reviewed_at))}`
              : ''}
            {shot.metadata.review_note
              ? `: ${String(shot.metadata.review_note)}`
              : ''}
          </Text>
        ) : shot.metadata.review_note ? (
          <Text size="xs" c="dimmed">
            Last note: {String(shot.metadata.review_note)}
          </Text>
        ) : null}
      </Stack>
    </Paper>
  )
}

function MetadataCard({
  shot,
  onCorrectMetadata,
}: {
  shot: HZDRShot
  onCorrectMetadata?: MetadataCorrection
}) {
  const rowKey = getShotRowKey(shot)
  const [correctionKey, setCorrectionKey] = useState('')
  const [correctionDraft, setCorrectionDraft] = useState('')
  const [correctionNote, setCorrectionNote] = useState('')

  useEffect(() => {
    setCorrectionKey('')
    setCorrectionDraft('')
    setCorrectionNote('')
  }, [rowKey])

  return (
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
              onChange={(event) => setCorrectionKey(event.currentTarget.value)}
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
              onChange={(event) => setCorrectionNote(event.currentTarget.value)}
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
                  rowKey,
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
  )
}

export function ShotDetailPanel({
  shot,
  shotDetail,
  sourceKey,
  availableSources,
  onUpdateStatus,
  onCorrectMetadata,
}: {
  shot?: HZDRShot
  shotDetail?: HZDRShotDetail
  /** The campaign the page shows; the shot's own source_key otherwise. */
  sourceKey?: string
  availableSources: HZDRSource[]
  onUpdateStatus?: (rowKey: string, status: string, note?: string) => void
  onCorrectMetadata?: MetadataCorrection
}) {
  if (!shot) {
    return (
      <Card withBorder radius={4} p="md">
        <Stack gap={6}>
          <Text fw={600}>No shot selected.</Text>
          <Text size="sm" c="dimmed">
            Available sources in current provider:
          </Text>
          {availableSources.map((entry) => (
            <Anchor
              key={entry.key}
              component={Link}
              to={`/source/${entry.key}`}
            >
              {entry.key} ({entry.shots.length} shots)
            </Anchor>
          ))}
        </Stack>
      </Card>
    )
  }

  const campaign = sourceKey ?? shot.source_key
  // The detail belongs to this shot only when its identity matches: the
  // selection can move on before the request for the last one answers.
  const detail =
    shotDetail?.shot.shot_number === shot.shot_number &&
    shotDetail.shot.shot_key === shot.shot_key
      ? shotDetail
      : undefined
  // The detail carries whether each file is reachable on the API host.
  const dataProducts = detail
    ? detail.shot.data_products
    : (shot.data_products ?? [])
  const target = formatTargetLabel(shot.metadata.target)
  const matchQuality = shot.match_quality ?? shot.match_status
  const localCount =
    typeof shot.labfrog_local_count === 'number' &&
    shot.labfrog_local_count >= 0
      ? shot.labfrog_local_count
      : undefined

  return (
    <Stack gap="md">
      <Card withBorder radius={4} p="md">
        <Stack gap="sm">
          <Group justify="space-between" gap="xs">
            <Title order={4}>Shot {formatShotLabel(shot)}</Title>
            <StatusBadge status={String(shot.metadata.status ?? 'unknown')} />
          </Group>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
            <ShotField
              label="Fired at"
              value={shot.fired_at ? formatShotTime(shot.fired_at) : undefined}
              title={shot.fired_at}
            />
            <ShotField label="Target" value={target}>
              {shot.target_wiki_ref ? (
                <Anchor
                  href={shot.target_wiki_ref}
                  target="_blank"
                  rel="noreferrer"
                  size="sm"
                  title={shot.target_wiki_page ?? 'Open target wiki'}
                >
                  {target ?? shot.target_wiki_page ?? 'Target wiki'}
                </Anchor>
              ) : undefined}
            </ShotField>
            <ShotField label="Match quality">
              {matchQuality ? (
                <Text size="sm" title={matchQuality}>
                  {matchQualityLabel(matchQuality)}
                  {shot.match_time_delta_s !== undefined &&
                  shot.match_time_delta_s !== null
                    ? ` (${shot.match_time_delta_s.toFixed(3)} s)`
                    : ''}
                </Text>
              ) : undefined}
            </ShotField>
            <ShotField
              label="LabFrog date/time"
              value={
                shot.labfrog_date_time
                  ? formatShotTime(shot.labfrog_date_time)
                  : undefined
              }
              title={shot.labfrog_date_time}
            />
            <ShotField label="LabFrog record" value={shot.labfrog_record_id} />
            <ShotField label="LabFrog local count" value={localCount} />
          </SimpleGrid>
          <ShotKeyField shotKey={shot.shot_key} />
          <ShotField label="HDF5 file">
            {shot.hdf5_path ? (
              <Code
                block
                style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}
              >
                {shot.hdf5_path}
              </Code>
            ) : undefined}
          </ShotField>
          <ShotReviewControl shot={shot} onUpdateStatus={onUpdateStatus} />
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
                    <Text size="xs" c="dimmed" title={event.timestamp}>
                      {formatShotTime(event.timestamp)} /{' '}
                      {event.transport ?? 'unknown transport'}
                    </Text>
                  </Stack>
                  <Text
                    size="xs"
                    c="dimmed"
                    title={event.match_quality ?? undefined}
                  >
                    {matchQualityLabel(event.match_quality)}
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
            <Badge variant="light">{dataProducts.length}</Badge>
          </Group>
          {dataProducts.length ? (
            dataProducts.map((product, index) => (
              <Paper
                key={product.product_id ?? `${product.source}-${index}`}
                withBorder
                radius={4}
                p="xs"
              >
                <Stack gap={4}>
                  <Group
                    justify="space-between"
                    align="flex-start"
                    wrap="nowrap"
                  >
                    <Stack gap={2} style={{ minWidth: 0 }}>
                      <Group gap="xs">
                        <Badge variant="light">{product.source}</Badge>
                        <Text size="sm" fw={600}>
                          {product.preview_kind ?? product.kind}
                        </Text>
                        {product.reachable != null && (
                          <Badge
                            size="xs"
                            variant="light"
                            color={product.reachable ? 'teal' : 'red'}
                          >
                            {product.reachable ? 'on disk' : 'missing'}
                          </Badge>
                        )}
                      </Group>
                      <Text size="xs" style={{ overflowWrap: 'anywhere' }}>
                        {product.dataset_name ?? product.path ?? NOT_RECORDED}
                      </Text>
                    </Stack>
                    <Text size="xs" c="dimmed" ta="right">
                      {product.dtype ?? ''}
                      {product.shape.length
                        ? ` [${product.shape.join(', ')}]`
                        : ''}
                      {product.units ? ` ${product.units}` : ''}
                    </Text>
                  </Group>
                  <ShotProductPreview
                    sourceKey={campaign}
                    shot={shot}
                    product={product}
                  />
                </Stack>
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
          {detail?.hdf5_error ? (
            <Text size="sm" c="red">
              {detail.hdf5_error}
            </Text>
          ) : null}
          {detail && !detail.hdf5_exists ? (
            <Text size="sm" c="dimmed">
              File not found.
            </Text>
          ) : null}
          {detail?.hdf5_exists ? (
            <ShotDatasetBrowser
              key={getShotRowKey(shot)}
              shot={shot}
              datasets={detail.hdf5_datasets}
              container={detail.container}
            />
          ) : null}
        </Stack>
      </Card>

      <MetadataCard shot={shot} onCorrectMetadata={onCorrectMetadata} />

      <Card withBorder radius={4} p="md">
        <Group justify="space-between" gap="xs">
          <Text size="sm" c="dimmed">
            Add a table column in Context Builder.
          </Text>
          <Button
            component={Link}
            to={`/source/${campaign}/context-builder`}
            size="xs"
            variant="light"
          >
            Add columns
          </Button>
        </Group>
      </Card>
    </Stack>
  )
}
