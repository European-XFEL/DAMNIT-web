import { useState, type ReactNode } from 'react'
import {
  Autocomplete,
  Badge,
  Button,
  Card,
  Code,
  Group,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core'

import type {
  HZDRExperimentRuling,
  HZDRMatchSummary,
  HZDRReviewEvent,
  HZDRShot,
} from '../types'
import { formatFiredAt } from '../utils/format'
import { formatTargetLabel } from '../utils/metadata'
import {
  formatSeconds,
  payloadPointer,
  secondsBetween,
  uniqueCandidateKeys,
  type ShotConfirmation,
} from '../utils/review'

// Presentational pieces of the Review matches page. The page owns fetching
// and posting; these only render and report what the reviewer chose.

function ReviewCard({
  title,
  count,
  hint,
  children,
}: {
  title: string
  count?: number
  hint: ReactNode
  children: ReactNode
}) {
  return (
    <Card withBorder radius={4} p="md">
      <Stack gap="sm">
        <Group gap="xs">
          <Title order={4}>{title}</Title>
          {count !== undefined ? (
            <Badge variant="light" color={count ? 'orange' : 'gray'}>
              {count}
            </Badge>
          ) : null}
        </Group>
        <Text size="sm" c="dimmed">
          {hint}
        </Text>
        {children}
      </Stack>
    </Card>
  )
}

function EventLine({ event }: { event: HZDRReviewEvent }) {
  const pointer = payloadPointer(event)
  return (
    <Stack gap={2}>
      <Group gap="xs">
        <Text size="sm" fw={600}>
          {event.kind}
        </Text>
        <Text size="sm">from {event.source}</Text>
        <Text size="sm" c="dimmed">
          at {formatFiredAt(event.timestamp)}
        </Text>
        {event.shot_number != null ? (
          <Badge variant="light">Trigger shot {event.shot_number}</Badge>
        ) : null}
      </Group>
      <Text size="xs" c="dimmed">
        event <Code>{event.event_id}</Code>
        {pointer ? (
          <>
            {' '}
            · <Code>{pointer}</Code>
          </>
        ) : null}
      </Text>
    </Stack>
  )
}

export function ReviewSummary({
  summary,
  unassigned,
}: {
  summary: HZDRMatchSummary
  unassigned: number
}) {
  const items: Array<[string, number, string]> = [
    ['ambiguous', summary.ambiguous, 'orange'],
    ['unmatched', summary.unmatched, 'orange'],
    ['unassigned shots', unassigned, 'orange'],
    ['matched', summary.matched, 'green'],
    ['confirmed by a reviewer', summary.confirmed, 'blue'],
    ['acknowledged', summary.dismissed, 'gray'],
  ]
  return (
    <Group gap="xs">
      {items.map(([label, value, color]) => (
        <Badge
          key={label}
          variant="light"
          color={value ? color : 'gray'}
          size="lg"
        >
          {value} {label}
        </Badge>
      ))}
    </Group>
  )
}

function AmbiguousEventItem({
  event,
  shotsByKey,
  busy,
  onConfirm,
}: {
  event: HZDRReviewEvent
  shotsByKey: Map<string, HZDRShot>
  busy: boolean
  onConfirm: (event: HZDRReviewEvent, shotKey: string, note: string) => void
}) {
  const [note, setNote] = useState('')
  const candidates = uniqueCandidateKeys(event)
  return (
    <Card withBorder radius={4} p="sm">
      <Stack gap="xs">
        <EventLine event={event} />
        <Table withTableBorder fz="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Shot</Table.Th>
              <Table.Th>Count</Table.Th>
              <Table.Th>LabFrog time</Table.Th>
              <Table.Th>Event - shot</Table.Th>
              <Table.Th>Target</Table.Th>
              <Table.Th>Already has</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {candidates.map((shotKey) => {
              const shot = shotsByKey.get(shotKey)
              const shotTime = shot?.labfrog_date_time ?? shot?.fired_at
              return (
                <Table.Tr key={shotKey}>
                  <Table.Td>
                    {shot ? shot.shot_number : '?'}{' '}
                    <Text span size="xs" c="dimmed">
                      {shotKey}
                    </Text>
                  </Table.Td>
                  <Table.Td>{shot?.labfrog_local_count ?? '-'}</Table.Td>
                  <Table.Td>
                    {shotTime ? formatFiredAt(shotTime) : '-'}
                  </Table.Td>
                  <Table.Td>
                    {formatSeconds(secondsBetween(shotTime, event.timestamp))}
                  </Table.Td>
                  <Table.Td>
                    {formatTargetLabel(shot?.metadata.target) ?? '-'}
                  </Table.Td>
                  <Table.Td>
                    {shot?.match_status === 'matched'
                      ? 'a matched trigger'
                      : shot
                        ? 'no trigger yet'
                        : 'shot not in catalog'}
                  </Table.Td>
                  <Table.Td>
                    <Button
                      size="xs"
                      disabled={busy || !shot}
                      onClick={() => onConfirm(event, shotKey, note)}
                    >
                      Confirm shot {shot?.shot_number ?? ''}
                    </Button>
                  </Table.Td>
                </Table.Tr>
              )
            })}
          </Table.Tbody>
        </Table>
        <TextInput
          size="xs"
          label="Note (optional)"
          placeholder="Why this shot, e.g. logbook entry"
          value={note}
          onChange={(change) => setNote(change.currentTarget.value)}
        />
      </Stack>
    </Card>
  )
}

export function AmbiguousMatchesCard({
  events,
  shotsByKey,
  busyKey,
  onConfirm,
}: {
  events: HZDRReviewEvent[]
  shotsByKey: Map<string, HZDRShot>
  busyKey: string | null
  onConfirm: (event: HZDRReviewEvent, shotKey: string, note: string) => void
}) {
  return (
    <ReviewCard
      title="Ambiguous matches"
      count={events.length}
      hint="DAMNIT found more than one shot this event could belong to and will not pick by time. Confirm the right shot, or leave the event here until someone knows."
    >
      {events.length ? (
        events.map((event) => (
          <AmbiguousEventItem
            key={event.event_id}
            event={event}
            shotsByKey={shotsByKey}
            busy={busyKey !== null}
            onConfirm={onConfirm}
          />
        ))
      ) : (
        <Text size="sm">Nothing ambiguous in this campaign.</Text>
      )}
    </ReviewCard>
  )
}

export function UnmatchedEventsCard({
  events,
  busyKey,
  onDismiss,
}: {
  events: HZDRReviewEvent[]
  busyKey: string | null
  onDismiss: (event: HZDRReviewEvent) => void
}) {
  return (
    <ReviewCard
      title="Unmatched events"
      count={events.length}
      hint="Events with no shot to belong to. Leave them if a shot may still arrive; acknowledge one only when it is known not to be a shot (a test fire, a glitch). It stays on record either way."
    >
      {events.length ? (
        <Table withTableBorder fz="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Event</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {events.map((event) => (
              <Table.Tr key={event.event_id}>
                <Table.Td>
                  <EventLine event={event} />
                </Table.Td>
                <Table.Td>
                  <Button
                    size="xs"
                    variant="light"
                    disabled={busyKey !== null}
                    onClick={() => onDismiss(event)}
                  >
                    Acknowledge, no shot
                  </Button>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      ) : (
        <Text size="sm">No unmatched events waiting.</Text>
      )}
    </ReviewCard>
  )
}

function UnassignedShotRow({
  shot,
  ruling,
  suggestions,
  busy,
  onAssign,
}: {
  shot: HZDRShot
  ruling: HZDRExperimentRuling | undefined
  suggestions: string[]
  busy: boolean
  onAssign: (shot: HZDRShot, experimentId: string) => void
}) {
  const [experimentId, setExperimentId] = useState('')
  return (
    <Table.Tr>
      <Table.Td>{shot.shot_number}</Table.Td>
      <Table.Td>{formatFiredAt(shot.fired_at)}</Table.Td>
      <Table.Td>{shot.events.length}</Table.Td>
      <Table.Td>
        {ruling ? (
          <Text size="xs">
            Assigned to <b>{ruling.experiment_id}</b>
            {ruling.by ? ` by ${ruling.by}` : ''}
            {ruling.at ? ` on ${formatFiredAt(ruling.at)}` : ''}; applies at the
            next rebuild.
          </Text>
        ) : (
          <Group gap="xs" wrap="nowrap">
            <Autocomplete
              size="xs"
              aria-label={`Campaign for shot ${shot.shot_number}`}
              placeholder="Campaign id"
              data={suggestions}
              value={experimentId}
              onChange={setExperimentId}
            />
            <Button
              size="xs"
              disabled={busy || !experimentId.trim()}
              onClick={() => onAssign(shot, experimentId)}
            >
              Assign
            </Button>
          </Group>
        )}
      </Table.Td>
    </Table.Tr>
  )
}

export function UnassignedShotsCard({
  shots,
  rulings,
  suggestions,
  busyKey,
  onAssign,
}: {
  shots: HZDRShot[]
  rulings: Map<number, HZDRExperimentRuling>
  suggestions: string[]
  busyKey: string | null
  onAssign: (shot: HZDRShot, experimentId: string) => void
}) {
  return (
    <ReviewCard
      title="Unassigned shots"
      count={shots.filter((shot) => !rulings.has(shot.shot_number)).length}
      hint="No LabFrog record and no campaign schedule placed these shots in a campaign. Assign one to the campaign it belongs to; the builder moves it there on its next run."
    >
      {shots.length ? (
        <Table withTableBorder fz="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Shot</Table.Th>
              <Table.Th>Fired</Table.Th>
              <Table.Th>Events</Table.Th>
              <Table.Th>Campaign</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {shots.map((shot) => (
              <UnassignedShotRow
                key={shot.shot_key ?? shot.shot_number}
                shot={shot}
                ruling={rulings.get(shot.shot_number)}
                suggestions={suggestions}
                busy={busyKey !== null}
                onAssign={onAssign}
              />
            ))}
          </Table.Tbody>
        </Table>
      ) : (
        <Text size="sm">No unassigned shots in this catalog.</Text>
      )}
    </ReviewCard>
  )
}

export function ResolvedCard({
  confirmations,
  acknowledged,
}: {
  confirmations: ShotConfirmation[]
  acknowledged: HZDRReviewEvent[]
}) {
  const rows = [
    ...confirmations.map((confirmation) => ({
      key: `confirm-${confirmation.event_id}-${confirmation.at}`,
      what: `Event ${confirmation.event_id ?? '?'} → shot ${confirmation.shot_number}`,
      by: confirmation.by,
      at: confirmation.at,
      note: confirmation.note,
    })),
    ...acknowledged.map((event) => ({
      key: `ack-${event.event_id}`,
      what: `Event ${event.event_id} acknowledged, no shot`,
      by: event.acknowledged_by ?? null,
      at: event.acknowledged_at ?? null,
      note: event.acknowledged_note ?? null,
    })),
  ].sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))
  return (
    <ReviewCard
      title="Resolved"
      hint="Decisions already taken here. They are kept in the review log beside the catalog and survive every rebuild."
    >
      {rows.length ? (
        <Table withTableBorder fz="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Decision</Table.Th>
              <Table.Th>By</Table.Th>
              <Table.Th>When</Table.Th>
              <Table.Th>Note</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((row) => (
              <Table.Tr key={row.key}>
                <Table.Td>{row.what}</Table.Td>
                <Table.Td>{row.by ?? '-'}</Table.Td>
                <Table.Td>{row.at ? formatFiredAt(row.at) : '-'}</Table.Td>
                <Table.Td>{row.note ?? '-'}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      ) : (
        <Text size="sm">No decisions yet.</Text>
      )}
    </ReviewCard>
  )
}
