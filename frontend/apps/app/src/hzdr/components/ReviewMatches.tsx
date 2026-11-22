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
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
  UnstyledButton,
} from '@mantine/core'

import type {
  CandidateGaps,
  RunnerUpGaps,
  HZDRCampaignSuggestion,
  HZDRExperimentRuling,
  HZDRMatchSummary,
  HZDRReviewEvent,
  HZDRShot,
} from '../types'
import { NOT_RECORDED, formatShotTime } from '../utils/format'
import { formatTargetLabel } from '../utils/metadata'
import {
  REVIEW_REASON_TEXT,
  SUGGESTION_TEXT,
  CLEAR_TIME_CHOICE,
  candidateGap,
  clearTimeChoices,
  suggestedChoices,
  type BulkChoice,
  groupUnmatched,
  waitingUnassignedByDay,
  REVIEW_SECTIONS,
  closestCandidateKey,
  formatSeconds,
  reviewHeadingId,
  payloadPointer,
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
      {event.review_reason ? (
        <Text size="xs" data-testid="review-reason">
          <b>Why it waits:</b>{' '}
          {REVIEW_REASON_TEXT[event.review_reason] ??
            event.review_reason.replace(/_/g, ' ')}
        </Text>
      ) : null}
      {event.aligner_detail ? (
        <Text size="xs" c="dimmed" data-testid="aligner-detail">
          {event.aligner_detail}
        </Text>
      ) : null}
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
  gaps,
  busy,
  onConfirm,
}: {
  event: HZDRReviewEvent
  shotsByKey: Map<string, HZDRShot>
  gaps?: CandidateGaps
  busy: boolean
  onConfirm: (event: HZDRReviewEvent, shotKey: string, note: string) => void
}) {
  const [note, setNote] = useState('')
  const candidates = uniqueCandidateKeys(event)
  const closest = closestCandidateKey(event, shotsByKey, gaps)
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
                const isSuggested = shotKey === event.suggested_shot_key
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
                      {isSuggested ? (
                        <>
                          {' '}
                          <Badge size="xs" variant="light" color="blue">
                            suggested:{' '}
                            {SUGGESTION_TEXT[event.suggestion_reason ?? ''] ??
                              event.suggestion_reason}
                          </Badge>
                        </>
                      ) : null}
                    </Table.Td>
                    <Table.Td>
                      {shot?.labfrog_local_count ?? NOT_RECORDED}
                    </Table.Td>
                    <Table.Td>{formatShotTime(shotTime)}</Table.Td>
                    <Table.Td>
                      {formatSeconds(
                        candidateGap(event, shotKey, shotsByKey, gaps)
                      )}
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

/**
 * Events a person may confirm together (the clear-cut time cases, or the
 * builder's suggestions). Shown only when some exist; the list is opened and
 * read before the confirm button shows.
 */
function BulkConfirm({
  intro,
  detailHeading,
  choices,
  shotsByKey,
  busy,
  onConfirmMany,
}: {
  intro: ReactNode
  detailHeading: string
  choices: BulkChoice[]
  shotsByKey: Map<string, HZDRShot>
  busy: boolean
  onConfirmMany: (choices: BulkChoice[]) => void
}) {
  const [open, setOpen] = useState(false)
  if (!choices.length) return null
  return (
    <Alert color="blue" variant="light" p="sm">
      <Stack gap="xs">
        <Text size="sm">
          <b>{choices.length}</b>{' '}
          {choices.length === 1 ? 'event has' : 'events have'} {intro}
        </Text>
        {open ? (
          <>
            <ReviewTableScroll>
              <Table withTableBorder fz="xs" miw={420}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Event</Table.Th>
                    <Table.Th>Shot</Table.Th>
                    <Table.Th>{detailHeading}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {choices.map((choice) => (
                    <Table.Tr key={choice.event.event_id}>
                      <Table.Td>
                        {choice.event.source} {choice.event.kind},{' '}
                        {formatShotTime(choice.event.timestamp)}
                      </Table.Td>
                      <Table.Td>
                        {shotsByKey.get(choice.shotKey)?.shot_number ?? '?'}{' '}
                        <Text span size="xs" c="dimmed">
                          {choice.shotKey}
                        </Text>
                      </Table.Td>
                      <Table.Td>{choice.detail}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ReviewTableScroll>
            <Group gap="xs">
              <Button
                size="xs"
                disabled={busy}
                onClick={() => {
                  setOpen(false)
                  onConfirmMany(choices)
                }}
              >
                Confirm these {choices.length}
              </Button>
              <Button size="xs" variant="subtle" onClick={() => setOpen(false)}>
                Close
              </Button>
            </Group>
          </>
        ) : (
          <Group>
            <Button size="xs" variant="light" onClick={() => setOpen(true)}>
              Review the {choices.length}
            </Button>
          </Group>
        )}
      </Stack>
    </Alert>
  )
}

/** Suggestions first; the clear time cases among the rest. */
function BulkSections({
  events,
  shotsByKey,
  gaps,
  runnerUp,
  busy,
  onConfirmMany,
}: {
  events: HZDRReviewEvent[]
  shotsByKey: Map<string, HZDRShot>
  gaps?: CandidateGaps
  runnerUp?: RunnerUpGaps
  busy: boolean
  onConfirmMany: (choices: BulkChoice[]) => void
}) {
  const suggested = suggestedChoices(events, shotsByKey)
  const suggestedIds = new Set(suggested.map((choice) => choice.event.event_id))
  const timed = clearTimeChoices(
    events.filter((event) => !suggestedIds.has(event.event_id)),
    shotsByKey,
    gaps,
    runnerUp
  )
  return (
    <>
      <BulkConfirm
        intro="a suggested shot from evidence other than raw time: shot-aligner paired it, the watchdog named it, or it is the only candidate without this instrument's file. Check the list and confirm them yourself."
        detailHeading="Why"
        choices={suggested}
        shotsByKey={shotsByKey}
        busy={busy}
        onConfirmMany={onConfirmMany}
      />
      <BulkConfirm
        intro={`one shot clearly closest in time: within ${CLEAR_TIME_CHOICE.withinS} s, and every other shot at least ${CLEAR_TIME_CHOICE.othersFurtherS / 60} min further away. Only triggers are offered: file times come from instrument clocks that run minutes off. Time alone never decides; check the list and confirm them yourself.`}
        detailHeading="Event - shot"
        choices={timed}
        shotsByKey={shotsByKey}
        busy={busy}
        onConfirmMany={onConfirmMany}
      />
    </>
  )
}

export function AmbiguousMatchesCard({
  events,
  shotsByKey,
  gaps,
  runnerUp,
  busyKey,
  onConfirm,
  onConfirmMany,
}: {
  events: HZDRReviewEvent[]
  shotsByKey: Map<string, HZDRShot>
  gaps?: CandidateGaps
  runnerUp?: RunnerUpGaps
  busyKey: string | null
  onConfirm: (event: HZDRReviewEvent, shotKey: string, note: string) => void
  onConfirmMany?: (choices: BulkChoice[]) => void
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
      {onConfirmMany ? (
        <BulkSections
          events={events}
          shotsByKey={shotsByKey}
          gaps={gaps}
          runnerUp={runnerUp}
          busy={busyKey !== null}
          onConfirmMany={onConfirmMany}
        />
      ) : null}
      {events.map((event) => (
        <AmbiguousEventItem
          key={event.event_id}
          event={event}
          shotsByKey={shotsByKey}
          gaps={gaps}
          busy={busyKey !== null}
          onConfirm={onConfirm}
        />
      ))}
    </ReviewCard>
  )
}

/**
 * One button per producer and kind with several unmatched events: a test
 * series or a source that never belongs to a shot is acknowledged in one
 * go, after a second click that names the count.
 */
function AcknowledgeGroups({
  events,
  busy,
  onDismissMany,
}: {
  events: HZDRReviewEvent[]
  busy: boolean
  onDismissMany: (events: HZDRReviewEvent[]) => void
}) {
  const [asking, setAsking] = useState<string | null>(null)
  const groups = groupUnmatched(events).filter(
    (group) => group.events.length > 1
  )
  if (!groups.length) return null
  return (
    <Stack gap={6} mb="sm">
      <Text size="xs" c="dimmed">
        Several from one producer and kind:
      </Text>
      {groups.map((group) => (
        <Group key={group.key} gap="xs" wrap="wrap">
          <Text size="xs">
            <b>{group.events.length}</b> from <b>{group.source}</b> (
            <Code fz="xs">{group.kind}</Code>)
          </Text>
          {asking === group.key ? (
            <>
              <Button
                size="compact-xs"
                color="orange"
                disabled={busy}
                onClick={() => {
                  setAsking(null)
                  onDismissMany(group.events)
                }}
              >
                Yes, acknowledge {group.events.length} with no shot
              </Button>
              <Button
                size="compact-xs"
                variant="subtle"
                onClick={() => setAsking(null)}
              >
                Cancel
              </Button>
            </>
          ) : (
            <Button
              size="compact-xs"
              variant="light"
              disabled={busy}
              onClick={() => setAsking(group.key)}
            >
              Acknowledge all {group.events.length}
            </Button>
          )}
        </Group>
      ))}
    </Stack>
  )
}

export function UnmatchedEventsCard({
  events,
  busyKey,
  onDismiss,
  onDismissMany,
}: {
  events: HZDRReviewEvent[]
  busyKey: string | null
  onDismiss: (event: HZDRReviewEvent) => void
  onDismissMany: (events: HZDRReviewEvent[]) => void
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
      <AcknowledgeGroups
        events={events}
        busy={busyKey !== null}
        onDismissMany={onDismissMany}
      />
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
  suggested,
  busy,
  onAssign,
}: {
  shot: HZDRShot
  ruling: HZDRExperimentRuling | undefined
  suggestions: string[]
  suggested?: HZDRCampaignSuggestion
  busy: boolean
  onAssign: (shot: HZDRShot, experimentId: string) => void
}) {
  // Pre-filled from the neighbours' campaign; a person still presses Assign.
  const [experimentId, setExperimentId] = useState(
    suggested?.experiment_id ?? ''
  )
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
        {!ruling && suggested ? (
          <Text size="xs" c="dimmed" mt={2}>
            Suggested: the shots before and after it that day are in{' '}
            {suggested.experiment_id}.
          </Text>
        ) : null}
      </Table.Td>
    </Table.Tr>
  )
}

const ALL_DAYS = 'all'

/** Assign every waiting shot, or one day's, to one campaign. */
function AssignMany({
  shots,
  rulings,
  suggestions,
  busy,
  onAssignMany,
}: {
  shots: HZDRShot[]
  rulings: Map<number, HZDRExperimentRuling>
  suggestions: string[]
  busy: boolean
  onAssignMany: (shots: HZDRShot[], experimentId: string) => void
}) {
  const days = waitingUnassignedByDay(shots, rulings)
  const [day, setDay] = useState(ALL_DAYS)
  const [experimentId, setExperimentId] = useState('')
  const waitingCount = days.reduce((sum, item) => sum + item.shots.length, 0)
  if (waitingCount < 2) return null
  const chosen =
    day === ALL_DAYS
      ? days.flatMap((item) => item.shots)
      : (days.find((item) => item.day === day)?.shots ?? [])
  return (
    <Group gap="xs" align="flex-end" wrap="wrap" mb="sm">
      <Select
        size="xs"
        label="Assign several"
        value={day}
        onChange={(value) => setDay(value ?? ALL_DAYS)}
        data={[
          { value: ALL_DAYS, label: `Every waiting shot (${waitingCount})` },
          ...days.map((item) => ({
            value: item.day,
            label: `${item.day} (${item.shots.length})`,
          })),
        ]}
        allowDeselect={false}
        w={220}
      />
      <Autocomplete
        size="xs"
        label="to campaign"
        placeholder="Campaign id"
        data={suggestions}
        value={experimentId}
        onChange={setExperimentId}
        w={240}
      />
      <Button
        size="xs"
        disabled={busy || !experimentId.trim() || !chosen.length}
        onClick={() => onAssignMany(chosen, experimentId)}
      >
        Assign {chosen.length} {chosen.length === 1 ? 'shot' : 'shots'}
      </Button>
    </Group>
  )
}

/** Every waiting shot with a neighbours' suggestion, assigned on a second click. */
function AssignSuggested({
  shots,
  rulings,
  campaignSuggestions,
  busy,
  onAssignSuggested,
}: {
  shots: HZDRShot[]
  rulings: Map<number, HZDRExperimentRuling>
  campaignSuggestions: Record<string, HZDRCampaignSuggestion>
  busy: boolean
  onAssignSuggested: (assignments: Array<[HZDRShot, string]>) => void
}) {
  const [asking, setAsking] = useState(false)
  const assignments = shots.flatMap((shot): Array<[HZDRShot, string]> => {
    const suggested = shot.shot_key
      ? campaignSuggestions[shot.shot_key]
      : undefined
    return suggested && !rulings.has(shot.shot_number)
      ? [[shot, suggested.experiment_id]]
      : []
  })
  if (!assignments.length) return null
  const campaigns = [...new Set(assignments.map(([, id]) => id))]
  return (
    <Group gap="xs" mb="sm" wrap="wrap">
      <Text size="xs">
        <b>{assignments.length}</b> with a suggested campaign (
        {campaigns.join(', ')}), from the shots before and after them.
      </Text>
      {asking ? (
        <>
          <Button
            size="compact-xs"
            disabled={busy}
            onClick={() => {
              setAsking(false)
              onAssignSuggested(assignments)
            }}
          >
            Yes, assign {assignments.length} as suggested
          </Button>
          <Button
            size="compact-xs"
            variant="subtle"
            onClick={() => setAsking(false)}
          >
            Cancel
          </Button>
        </>
      ) : (
        <Button
          size="compact-xs"
          variant="light"
          disabled={busy}
          onClick={() => setAsking(true)}
        >
          Assign the {assignments.length} suggested
        </Button>
      )}
    </Group>
  )
}

export function UnassignedShotsCard({
  shots,
  rulings,
  suggestions,
  campaignSuggestions = {},
  busyKey,
  onAssign,
  onAssignMany,
  onAssignSuggested,
}: {
  shots: HZDRShot[]
  rulings: Map<number, HZDRExperimentRuling>
  suggestions: string[]
  campaignSuggestions?: Record<string, HZDRCampaignSuggestion>
  busyKey: string | null
  onAssign: (shot: HZDRShot, experimentId: string) => void
  onAssignMany: (shots: HZDRShot[], experimentId: string) => void
  onAssignSuggested?: (assignments: Array<[HZDRShot, string]>) => void
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
      {onAssignSuggested ? (
        <AssignSuggested
          shots={shots}
          rulings={rulings}
          campaignSuggestions={campaignSuggestions}
          busy={busyKey !== null}
          onAssignSuggested={onAssignSuggested}
        />
      ) : null}
      <AssignMany
        shots={shots}
        rulings={rulings}
        suggestions={suggestions}
        busy={busyKey !== null}
        onAssignMany={onAssignMany}
      />
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
                suggested={
                  shot.shot_key ? campaignSuggestions[shot.shot_key] : undefined
                }
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
