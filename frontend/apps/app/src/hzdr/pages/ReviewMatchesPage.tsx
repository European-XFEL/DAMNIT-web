import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Container,
  Group,
  Loader,
  Select,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { useSearchParams } from 'react-router'

import { HomePage } from '@damnit-frontend/ui'

import type {
  HZDRReview,
  HZDRReviewEvent,
  HZDRShot,
  HZDRSource,
  HZDRSourceSummary,
} from '../types'
import { AppHeader } from '../components/AppHeader'
import {
  AmbiguousMatchesCard,
  ResolvedCard,
  ReviewAllClear,
  ReviewSummary,
  UnassignedShotsCard,
  UnmatchedEventsCard,
} from '../components/ReviewMatches'
import { sourceSummariesUrl } from '../components/homeCampaignSummary'
import { requireJson } from '../utils/api'
import { campaignTitle } from '../utils/format'
import {
  assignShotExperiment,
  busiestSourceKey,
  campaignSuggestions,
  confirmReviewEvent,
  dismissReviewEvent,
  fetchHZDRCampaigns,
  fetchHZDRReview,
  fetchHZDRSource,
  groupReviewEvents,
  reviewHeadingId,
  reviewWaiting,
  rulingsByShotNumber,
  shotConfirmations,
  shotsByKey,
  type LabFrogCampaignRef,
  type ReviewSection,
} from '../utils/review'

type Loaded = { review: HZDRReview; source: HZDRSource }

/** Cases waiting per catalog key; null where that catalog's review failed. */
type WaitingCounts = Record<string, number | null>

function waitingLabel(count: number | null | undefined) {
  if (count === undefined || count === null) return ''
  return count ? ` · ${count} waiting` : ' · all clear'
}

/** Scroll a section into view and move focus to its heading. */
function focusSection(section: ReviewSection) {
  const heading = document.getElementById(reviewHeadingId(section))
  if (!heading) return
  heading.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  heading.focus({ preventScroll: true })
}

/**
 * Review matches: the one place a person resolves what DAMNIT will not guess.
 *
 * Since ruling A7 (2026-09-30) the builder never attaches an event to a shot by
 * time alone, and since decision D1 every trigger arrives `unassigned`. What
 * is left over lands here, per campaign catalog: ambiguous events with their
 * candidate shots, unmatched events, and shots no campaign claimed. Decisions
 * go through the review API and are replayed by every rebuild.
 *
 * With no `?source=` the page opens the campaign with the most cases waiting;
 * empty sections fold to one line, and a campaign with nothing waiting shows
 * one "all clear" banner.
 */
export function ReviewMatchesPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [sources, setSources] = useState<HZDRSourceSummary[]>()
  const [campaigns, setCampaigns] = useState<LabFrogCampaignRef[]>([])
  const [fetched, setFetched] = useState<Loaded>()
  const [loadError, setLoadError] = useState<string>()
  const [reloadToken, setReloadToken] = useState(0)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string>()
  const [actionMessage, setActionMessage] = useState<string>()
  const [resolvedOpen, setResolvedOpen] = useState(false)
  const [pendingJump, setPendingJump] = useState<ReviewSection | null>(null)

  useEffect(() => {
    fetch(sourceSummariesUrl())
      .then((response) => requireJson<HZDRSourceSummary[]>(response))
      .then(setSources)
      .catch((error: Error) => {
        setSources([])
        setLoadError(`Could not load campaigns: ${error.message}`)
      })
    // Campaign ids are only suggestions for assigning a shot; none is fine.
    fetchHZDRCampaigns()
      .then(setCampaigns)
      .catch(() => setCampaigns([]))
  }, [])

  // How many cases wait in each catalog, for the picker and the first pick:
  // the summaries count them as this page does.
  const waitingCounts = useMemo<WaitingCounts | undefined>(
    () =>
      sources &&
      Object.fromEntries(sources.map((source) => [source.key, source.waiting])),
    [sources]
  )

  // An explicit choice (the URL's ?source=) wins; otherwise open the catalog
  // with the most cases waiting, once the counts are in.
  const requestedKey = searchParams.get('source')
  const requested = sources?.find((source) => source.key === requestedKey)
  const autoKey = useMemo(() => {
    if (!sources?.length) return null
    if (sources.length === 1) return sources[0].key
    return waitingCounts ? busiestSourceKey(sources, waitingCounts) : null
  }, [sources, waitingCounts])
  const sourceKey = requested?.key ?? autoKey

  useEffect(() => {
    if (!sourceKey) {
      setFetched(undefined)
      return
    }
    let active = true
    Promise.all([fetchHZDRReview(sourceKey), fetchHZDRSource(sourceKey)])
      .then(([review, source]) => {
        if (active) {
          setFetched({ review, source })
          setLoadError(undefined)
        }
      })
      .catch((error: Error) => {
        if (active) {
          setFetched(undefined)
          setLoadError(`Could not load the review list: ${error.message}`)
        }
      })
    return () => {
      active = false
    }
  }, [sourceKey, reloadToken])

  // Never show one catalog's cases under another's name while switching.
  const loaded = fetched?.source.key === sourceKey ? fetched : undefined

  const waiting = useMemo(
    () => (loaded ? reviewWaiting(loaded.review) : undefined),
    [loaded]
  )
  // The open catalog's count is the freshest: it reloads after each decision.
  const pickerCounts = useMemo<WaitingCounts>(
    () =>
      loaded && waiting
        ? { ...waitingCounts, [loaded.source.key]: waiting.total }
        : { ...waitingCounts },
    [loaded, waiting, waitingCounts]
  )

  // A jump to Resolved opens it first (same render); focus once it is there.
  useEffect(() => {
    if (!pendingJump) return
    focusSection(pendingJump)
    setPendingJump(null)
  }, [pendingJump])

  const jumpTo = useCallback((section: ReviewSection) => {
    if (section === 'resolved') setResolvedOpen(true)
    setPendingJump(section)
  }, [])

  const grouped = useMemo(
    () => groupReviewEvents(loaded?.review.review_events ?? []),
    [loaded]
  )
  const shotLookup = useMemo(
    () => shotsByKey(loaded?.source.shots ?? []),
    [loaded]
  )
  const rulings = useMemo(
    () => rulingsByShotNumber(loaded?.review.experiment_rulings ?? []),
    [loaded]
  )
  const confirmations = useMemo(
    () => shotConfirmations(loaded?.source.shots ?? []),
    [loaded]
  )
  const suggestions = useMemo(
    () => campaignSuggestions(campaigns, sources ?? []),
    [campaigns, sources]
  )

  const selectSource = (key: string | null) => {
    setActionError(undefined)
    setActionMessage(undefined)
    setResolvedOpen(false)
    setSearchParams(key ? { source: key } : {})
  }

  const runAction = (
    key: string,
    action: () => Promise<unknown>,
    done: string
  ) => {
    setBusyKey(key)
    setActionError(undefined)
    setActionMessage(undefined)
    action()
      .then(() => {
        setActionMessage(done)
        setReloadToken((token) => token + 1)
      })
      .catch((error: Error) => setActionError(error.message))
      .finally(() => setBusyKey(null))
  }

  const confirm = (event: HZDRReviewEvent, shotKey: string, note: string) => {
    if (!sourceKey) return
    const shot = shotLookup.get(shotKey)
    runAction(
      `confirm:${event.event_id}`,
      () => confirmReviewEvent(sourceKey, event.event_id, shotKey, note),
      `Event ${event.event_id} confirmed to shot ${shot?.shot_number ?? shotKey}.`
    )
  }

  const dismiss = (event: HZDRReviewEvent) => {
    if (!sourceKey) return
    runAction(
      `dismiss:${event.event_id}`,
      () => dismissReviewEvent(sourceKey, event.event_id),
      `Event ${event.event_id} acknowledged with no shot.`
    )
  }

  const assign = (shot: HZDRShot, experimentId: string) => {
    runAction(
      `assign:${shot.shot_number}`,
      () => assignShotExperiment(shot.shot_number, experimentId),
      `Shot ${shot.shot_number} assigned to ${experimentId.trim()}; it moves there at the next rebuild.`
    )
  }

  return (
    <HomePage
      header={<AppHeader />}
      main={
        <Container size="lg" py="xl">
          <Stack gap="lg">
            <Stack gap={4}>
              <Title order={2}>Review matches</Title>
              <Text c="dimmed">
                DAMNIT never matches a shot by time alone. When it is unsure
                which shot an event belongs to, or which campaign a shot belongs
                to, the case waits here until a person decides. Every decision
                is recorded with your name and kept across rebuilds.
              </Text>
            </Stack>
            <Group align="end">
              <Select
                label="Campaign"
                value={sourceKey}
                onChange={selectSource}
                data={(sources ?? []).map((source) => ({
                  value: source.key,
                  label: `${campaignTitle(source.title) || source.key}${waitingLabel(pickerCounts[source.key])}`,
                }))}
                placeholder={
                  sources === undefined
                    ? 'Loading…'
                    : sources.length
                      ? 'Select a campaign'
                      : 'No campaign catalogs found'
                }
                searchable
                w={{ base: '100%', sm: 420 }}
              />
              {sources === undefined ||
              (sources.length > 0 && !sourceKey && !loadError) ||
              (sourceKey && !loaded && !loadError) ? (
                <Loader size="sm" />
              ) : null}
            </Group>
            {loadError ? (
              <Alert color="red" title="Not loaded">
                {loadError}
              </Alert>
            ) : null}
            {actionError ? (
              <Alert
                color="red"
                title="Not saved"
                withCloseButton
                onClose={() => setActionError(undefined)}
              >
                {actionError}
              </Alert>
            ) : null}
            {actionMessage ? (
              <Alert
                color="green"
                withCloseButton
                onClose={() => setActionMessage(undefined)}
              >
                {actionMessage}
              </Alert>
            ) : null}
            {loaded && waiting ? (
              <>
                <ReviewSummary
                  summary={loaded.review.match_summary}
                  ambiguous={waiting.ambiguous}
                  unmatched={waiting.unmatched}
                  unassigned={waiting.unassigned}
                  onJump={jumpTo}
                />
                {waiting.total === 0 ? (
                  <ReviewAllClear
                    campaign={
                      campaignTitle(loaded.source.title) || loaded.source.key
                    }
                    matched={loaded.review.match_summary.matched}
                  />
                ) : (
                  <AmbiguousMatchesCard
                    events={grouped.ambiguous}
                    shotsByKey={shotLookup}
                    busyKey={busyKey}
                    onConfirm={confirm}
                  />
                )}
                {/* Shots assigned but not moved yet still show, with who
                    assigned them, even when nothing else waits. */}
                {waiting.total > 0 ||
                loaded.review.unassigned_shots.length > 0 ? (
                  <UnassignedShotsCard
                    shots={loaded.review.unassigned_shots}
                    rulings={rulings}
                    suggestions={suggestions}
                    busyKey={busyKey}
                    onAssign={assign}
                  />
                ) : null}
                {waiting.total > 0 ? (
                  <UnmatchedEventsCard
                    events={grouped.unmatched}
                    busyKey={busyKey}
                    onDismiss={dismiss}
                  />
                ) : null}
                <ResolvedCard
                  confirmations={confirmations}
                  acknowledged={grouped.acknowledged}
                  opened={resolvedOpen}
                  onToggle={() => setResolvedOpen((open) => !open)}
                />
              </>
            ) : null}
          </Stack>
        </Container>
      }
    />
  )
}
