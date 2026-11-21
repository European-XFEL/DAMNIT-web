import { useState, type ReactNode } from 'react'
import {
  Alert,
  Autocomplete,
  Badge,
  Box,
  Button,
  Card,
  Code,
  Group,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  UnstyledButton,
} from '@mantine/core'

import type {
  HZDRExperimentRuling,
  HZDRMatchSummary,
  HZDRReviewEvent,
  HZDRShot,
} from '../types'
import { NOT_RECORDED, formatShotTime } from '../utils/format'
import { formatTargetLabel } from '../utils/metadata'
import {
  REVIEW_SECTIONS,
  closestCandidateKey,
  formatSeconds,
  reviewHeadingId,
  payloadPointer,
  secondsBetween,
  uniqueCandidateKeys,
  type ReviewSection,
  type ShotConfirmation,
} from '../utils/review'

// Presentational pieces of the Review matches page. The page owns fetching
// and posting; these only render and report what the reviewer chose.

/** Wide tables scroll inside their own box instead of widening the page. */
function ReviewTableScroll({ children }: { children: ReactNode }) {
  return <Box style={{ overflowX: 'auto', maxWidth: '100%' }}>{children}</Box>
}

/** An empty section, folded to one line. */
function EmptySection({
  section,
  title,
  text,
}: {
  section: ReviewSection
  title: string
  text: string
}) {
  return (
    <Card withBorder radius={4} px="md" py="xs" id={REVIEW_SECTIONS[section]}>
      <Group gap="xs">
        <Title order={4} id={reviewHeadingId(section)} tabIndex={-1} fz="sm">
          {title}
        </Title>
        <Text size="sm" c="dimmed">
          {text}
        </Text>
      </Group>
    </Card>
  )
}

function ReviewCard({
  section,
  title,
  count,
  countColor = 'orange',
  hint,
  children,
}: {
  section: ReviewSection
  title: ReactNode
  count?: number
  countColor?: string
  hint: ReactNode
  children: ReactNode
}) {
  return (
    <Card withBorder radius={4} p="md" id={REVIEW_SECTIONS[section]}>
      <Stack gap="sm">
        <Group gap="xs">
          <Title order={4} id={reviewHeadingId(section)} tabIndex={-1}>
            {title}
          </Title>
          {count !== undefined ? (
            <Badge variant="light" color={count ? countColor : 'gray'}>
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
          at {formatShotTime(event.timestamp)}
        </Text>
        {event.shot_number != null ? (
          <Badge variant="light">Trigger shot {event.shot_number}</Badge>
        ) : null}
      </Group>
      <Text size="xs" c="dimmed" style={{ wordBreak: 'break-all' }}>
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

/**
 * The count chips. A chip with something behind it is a button that jumps to
 * its section; a zero chip is muted and inert.
 */
export function ReviewSummary({
  summary,
  ambiguous,
  unmatched,
  unassigned,
  onJump,
}: {
  summary: HZDRMatchSummary
  ambiguous: number
  unmatched: number
  unassigned: number
  onJump?: (section: ReviewSection) => void
}) {
  const items: Array<[string, number, string, ReviewSection | null]> = [
    ['ambiguous', ambiguous, 'orange', 'ambiguous'],
    ['unmatched', unmatched, 'orange', 'unmatched'],
    ['unassigned shots', unassigned, 'orange', 'unassigned'],
    ['matched', summary.matched, 'green', null],
    ['confirmed by a reviewer', summary.confirmed, 'blue', 'resolved'],
    ['acknowledged', summary.dismissed, 'gray', 'resolved'],
  ]
  return (
    <Group gap="xs">
      {items.map(([label, value, color, section]) =>
        value && section && onJump ? (
          <Badge
            key={label}
            component="button"
            type="button"
            variant="light"
            color={color}
            size="lg"
            style={{ cursor: 'pointer' }}
            title="Go to this section"
            onClick={() => onJump(section)}
          >
            {value} {label}
          </Badge>
        ) : (
          <Badge
            key={label}
            variant={value ? 'light' : 'outline'}
            color={value ? color : 'gray'}
            size="lg"
            style={value ? undefined : { opacity: 0.6 }}
          >
            {value} {label}
          </Badge>
        )
      )}
    </Group>
  )
}

/** One banner instead of three empty cards when nothing waits. */
export function ReviewAllClear({
  campaign,
  matched,
}: {
  campaign: string
  matched: number
}) {
  return (
    <Alert color="green" title="All clear">
      {campaign}: all clear. {matched} {matched === 1 ? 'event' : 'events'}{' '}
      matched; nothing is waiting for a decision.
    </Alert>
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
  const closest = closestCandidateKey(event, shotsByKey)
  return (
    <Card withBorder radius={4} p="sm">
      <Stack gap="xs">
        <EventLine event={event} />
        <ReviewTableScroll>
          <Table withTableBorder fz="xs" miw={640}>
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
                const isClosest = shotKey === closest
                return (
                  <Table.Tr
                    key={shotKey}
                    data-closest={isClosest || undefined}
                    bg={
                      isClosest
                        ? 'var(--mantine-color-yellow-light)'
                        : undefined
                    }
                  >
                    <Table.Td>
                      {shot ? shot.shot_number : '?'}{' '}
                      <Text span size="xs" c="dimmed">
                        {shotKey}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      {shot?.labfrog_local_count ?? NOT_RECORDED}
                    </Table.Td>
                    <Table.Td>{formatShotTime(shotTime)}</Table.Td>
                    <Table.Td>
                      {formatSeconds(secondsBetween(shotTime, event.timestamp))}
                      {isClosest ? (
                        <>
                          {' '}
                          <Badge size="xs" variant="light" color="yellow">
                            closest in time
                          </Badge>
                        </>
                      ) : null}
                    </Table.Td>
                    <Table.Td>
                      {formatTargetLabel(shot?.metadata.target) ?? NOT_RECORDED}
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
        </ReviewTableScroll>
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
  if (!events.length) {
    return (
      <EmptySection
        section="ambiguous"
        title="Ambiguous matches"
        text="Nothing ambiguous in this campaign."
      />
    )
  }
  return (
    <ReviewCard
      section="ambiguous"
      title="Ambiguous matches"
      count={events.length}
      hint="DAMNIT found more than one shot this event could belong to and will not pick by time. Confirm the right shot, or leave the event here until someone knows."
    >
      <Text size="sm">
        Closest in time is highlighted; time alone never decides.
      </Text>
      {events.map((event) => (
        <AmbiguousEventItem
          key={event.event_id}
          event={event}
          shotsByKey={shotsByKey}
          busy={busyKey !== null}
          onConfirm={onConfirm}
        />
      ))}
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
  if (!events.length) {
    return (
      <EmptySection
        section="unmatched"
        title="Unmatched events"
        text="No unmatched events waiting."
      />
    )
  }
  return (
    <ReviewCard
      section="unmatched"
      title="Unmatched events"
      count={events.length}
      hint="Events with no shot to belong to. Leave them if a shot may still arrive; acknowledge one only when it is known not to be a shot (a test fire, a glitch). It stays on record either way."
    >
      <ReviewTableScroll>
        <Table withTableBorder fz="xs" miw={420}>
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
      </ReviewTableScroll>
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
      <Table.Td>{formatShotTime(shot.fired_at)}</Table.Td>
      <Table.Td>{shot.events.length}</Table.Td>
      <Table.Td>
        {ruling ? (
          <Text size="xs">
            Assigned to <b>{ruling.experiment_id}</b>
            {ruling.by ? ` by ${ruling.by}` : ''}
            {ruling.at ? ` on ${formatShotTime(ruling.at)}` : ''}; applies at
            the next rebuild.
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
  if (!shots.length) {
    return (
      <EmptySection
        section="unassigned"
        title="Unassigned shots"
        text="No unassigned shots in this catalog."
      />
    )
  }
  return (
    <ReviewCard
      section="unassigned"
      title="Unassigned shots"
      count={shots.filter((shot) => !rulings.has(shot.shot_number)).length}
      hint="No LabFrog record and no campaign schedule placed these shots in a campaign. Assign one to the campaign it belongs to; the builder moves it there on its next run."
    >
      <ReviewTableScroll>
        <Table withTableBorder fz="xs" miw={520}>
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
      </ReviewTableScroll>
    </ReviewCard>
  )
}

export function ResolvedCard({
  confirmations,
  acknowledged,
  opened,
  onToggle,
}: {
  confirmations: ShotConfirmation[]
  acknowledged: HZDRReviewEvent[]
  /** Folded unless set; pass with onToggle to control it from outside. */
  opened?: boolean
  onToggle?: () => void
}) {
  const [ownOpened, setOwnOpened] = useState(false)
  const isOpen = opened ?? ownOpened
  const toggle = onToggle ?? (() => setOwnOpened((value) => !value))
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
      section="resolved"
      title={
        <UnstyledButton
          onClick={toggle}
          aria-expanded={isOpen}
          aria-controls={isOpen ? 'review-resolved-body' : undefined}
          fw="inherit"
          fz="inherit"
        >
          {isOpen ? '▾' : '▸'} Resolved
        </UnstyledButton>
      }
      count={rows.length}
      countColor="blue"
      hint="Decisions already taken here. They are kept in the review log beside the catalog and survive every rebuild."
    >
      {!isOpen ? null : rows.length ? (
        <ReviewTableScroll>
          <Table withTableBorder fz="xs" miw={520} id="review-resolved-body">
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
                  <Table.Td>{row.by ?? NOT_RECORDED}</Table.Td>
                  <Table.Td>{formatShotTime(row.at)}</Table.Td>
                  <Table.Td>{row.note ?? NOT_RECORDED}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ReviewTableScroll>
      ) : (
        <Text size="sm" id="review-resolved-body">
          No decisions yet.
        </Text>
      )}
    </ReviewCard>
  )
}
