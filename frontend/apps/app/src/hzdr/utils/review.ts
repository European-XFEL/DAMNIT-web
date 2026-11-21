import type {
  HZDRExperimentRuling,
  HZDRReview,
  HZDRReviewEvent,
  HZDRShot,
  HZDRSource,
} from '../types'

// Client for the Review matches page: the review API
// (GET/POST /metadata/hzdr/sources/{key}/review…), the experiment-ruling POST,
// and the curated LabFrog campaign list used to suggest campaign ids.

export interface LabFrogCampaignRef {
  key: string
  title: string
  sqlite_path: string
  source_database: string | null
  source_collection: string | null
  row_count: number | null
  exported_at: string | null
  shot_date_min: string | null
  shot_date_max: string | null
}

export interface ShotConfirmation {
  shot_number: number
  shot_key: string | null
  event_id: string | null
  by: string | null
  at: string | null
  note: string | null
}

/** Parse a JSON response, surfacing the API's `detail` message on failure. */
export async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let detail = ''
    try {
      const body = (await response.json()) as { detail?: unknown }
      if (typeof body.detail === 'string') {
        detail = body.detail
      }
    } catch {
      // Not JSON; fall back to the status code.
    }
    throw new Error(detail || `Request failed with ${response.status}`)
  }
  return response.json() as Promise<T>
}

function sourcePath(sourceKey: string) {
  return `/metadata/hzdr/sources/${encodeURIComponent(sourceKey)}`
}

function postJson(url: string, body: unknown) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export async function fetchHZDRSources(): Promise<HZDRSource[]> {
  return readJson<HZDRSource[]>(await fetch('/metadata/hzdr/sources'))
}

export async function fetchHZDRSource(sourceKey: string): Promise<HZDRSource> {
  return readJson<HZDRSource>(await fetch(sourcePath(sourceKey)))
}

export async function fetchHZDRReview(sourceKey: string): Promise<HZDRReview> {
  return readJson<HZDRReview>(await fetch(`${sourcePath(sourceKey)}/review`))
}

export async function fetchHZDRCampaigns(): Promise<LabFrogCampaignRef[]> {
  return readJson<LabFrogCampaignRef[]>(await fetch('/metadata/hzdr/campaigns'))
}

export async function confirmReviewEvent(
  sourceKey: string,
  eventId: string,
  shotKey: string,
  note?: string
): Promise<HZDRSource> {
  return readJson<HZDRSource>(
    await postJson(
      `${sourcePath(sourceKey)}/review/${encodeURIComponent(eventId)}/confirm`,
      { shot_key: shotKey, note: note?.trim() || null }
    )
  )
}

export async function dismissReviewEvent(
  sourceKey: string,
  eventId: string,
  note?: string
): Promise<HZDRSource> {
  return readJson<HZDRSource>(
    await postJson(
      `${sourcePath(sourceKey)}/review/${encodeURIComponent(eventId)}/dismiss`,
      { note: note?.trim() || null }
    )
  )
}

export async function assignShotExperiment(
  shotNumber: number,
  experimentId: string,
  note?: string
): Promise<{ status: string }> {
  return readJson<{ status: string }>(
    await postJson('/metadata/hzdr/experiment-rulings', {
      shot_number: shotNumber,
      experiment_id: experimentId.trim(),
      note: note?.trim() || null,
    })
  )
}

/** Split review events into what still needs a person and what was acknowledged. */
export function groupReviewEvents(events: HZDRReviewEvent[]) {
  return {
    ambiguous: events.filter((event) => event.match_status === 'ambiguous'),
    unmatched: events.filter(
      (event) => event.match_status === 'unmatched' && !event.acknowledged
    ),
    acknowledged: events.filter(
      (event) => event.match_status === 'unmatched' && event.acknowledged
    ),
  }
}

/** The matcher's candidates for one event, in order, without repeats. */
export function uniqueCandidateKeys(event: HZDRReviewEvent): string[] {
  return [...new Set(event.candidate_shot_keys ?? [])]
}

/** First shot per shot_key, for looking up an event's candidates. */
export function shotsByKey(shots: HZDRShot[]): Map<string, HZDRShot> {
  const byKey = new Map<string, HZDRShot>()
  for (const shot of shots) {
    if (shot.shot_key && !byKey.has(shot.shot_key)) {
      byKey.set(shot.shot_key, shot)
    }
  }
  return byKey
}

export function rulingsByShotNumber(
  rulings: HZDRExperimentRuling[]
): Map<number, HZDRExperimentRuling> {
  return new Map(rulings.map((ruling) => [ruling.shot_number, ruling]))
}

const ZONED_TIME = /(Z|[+-]\d{2}:?\d{2})$/i

/**
 * Seconds from `from` to `to`, or null.
 *
 * Only when both times name their zone: LabFrog times are often naive
 * campaign-local times, and guessing their zone in the browser would show a
 * confidently wrong difference.
 */
export function secondsBetween(
  from: string | null | undefined,
  to: string | null | undefined
): number | null {
  if (!from || !to || !ZONED_TIME.test(from) || !ZONED_TIME.test(to)) {
    return null
  }
  const start = Date.parse(from)
  const end = Date.parse(to)
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return null
  }
  return (end - start) / 1000
}

export function formatSeconds(seconds: number | null): string {
  if (seconds === null) {
    return '-'
  }
  const sign = seconds < 0 ? '-' : '+'
  const total = Math.round(Math.abs(seconds))
  if (total < 60) {
    return `${sign}${total} s`
  }
  const minutes = Math.floor(total / 60)
  const rest = total % 60
  if (minutes < 60) {
    return rest ? `${sign}${minutes} min ${rest} s` : `${sign}${minutes} min`
  }
  const hours = Math.floor(minutes / 60)
  return `${sign}${hours} h ${minutes % 60} min`
}

/** Campaign ids a reviewer can assign a shot to, curated campaigns first. */
export function campaignSuggestions(
  campaigns: LabFrogCampaignRef[],
  sources: HZDRSource[]
): string[] {
  const fromSources = sources
    .map((source) => (source.metadata as Record<string, unknown>).experiment_id)
    .filter((value): value is string => typeof value === 'string')
  return [
    ...new Set([...campaigns.map((campaign) => campaign.key), ...fromSources]),
  ].filter((value) => value && value !== 'unassigned')
}

/** Confirmed matches recorded on shots (who/when), newest first. */
export function shotConfirmations(shots: HZDRShot[]): ShotConfirmation[] {
  const confirmations: ShotConfirmation[] = []
  for (const shot of shots) {
    const history = shot.metadata.match_confirmation_history
    if (!Array.isArray(history)) {
      continue
    }
    for (const entry of history) {
      if (!entry || typeof entry !== 'object') {
        continue
      }
      const record = entry as Record<string, unknown>
      const text = (value: unknown) =>
        typeof value === 'string' && value ? value : null
      confirmations.push({
        shot_number: shot.shot_number,
        shot_key: shot.shot_key ?? null,
        event_id: text(record.event_id),
        by: text(record.by),
        at: text(record.at),
        note: text(record.note),
      })
    }
  }
  return confirmations.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))
}

/** A short pointer to where an event's data lives, if the event says. */
export function payloadPointer(event: HZDRReviewEvent): string | null {
  const ref = event.payload_ref ?? {}
  for (const key of ['path', 'uri', 'message_key']) {
    const value = ref[key]
    if (typeof value === 'string' && value) {
      return value
    }
  }
  if (ref.topic !== undefined && ref.offset !== undefined) {
    return `${String(ref.topic)}@${String(ref.partition ?? 0)}:${String(ref.offset)}`
  }
  return null
}

/** How many cases in one review still wait for a person, per section. */
export interface ReviewWaiting {
  ambiguous: number
  unmatched: number
  unassigned: number
  total: number
}

export function reviewWaiting(review: HZDRReview): ReviewWaiting {
  const grouped = groupReviewEvents(review.review_events ?? [])
  const ruled = new Set(
    (review.experiment_rulings ?? []).map((ruling) => ruling.shot_number)
  )
  const unassigned = (review.unassigned_shots ?? []).filter(
    (shot) => !ruled.has(shot.shot_number)
  ).length
  const ambiguous = grouped.ambiguous.length
  const unmatched = grouped.unmatched.length
  return {
    ambiguous,
    unmatched,
    unassigned,
    total: ambiguous + unmatched + unassigned,
  }
}

/**
 * The campaign to open when nobody chose one: the one with the most cases
 * waiting. Ties, and campaigns whose count is unknown, keep the list order,
 * so with nothing waiting anywhere the first campaign opens as before.
 */
export function busiestSourceKey(
  sources: HZDRSource[],
  waiting: Record<string, number | null | undefined>
): string | null {
  let best: string | null = sources[0]?.key ?? null
  let most = 0
  for (const source of sources) {
    const count = waiting[source.key] ?? 0
    if (count > most) {
      best = source.key
      most = count
    }
  }
  return best
}

/**
 * The candidate whose shot time is closest to the event's, or null when no
 * gap is known or two candidates tie. A hint for the reviewer only: it is
 * never selected or confirmed for them.
 */
export function closestCandidateKey(
  event: HZDRReviewEvent,
  shots: Map<string, HZDRShot>
): string | null {
  let best: string | null = null
  let bestGap = Infinity
  let tied = false
  for (const shotKey of uniqueCandidateKeys(event)) {
    const shot = shots.get(shotKey)
    const gap = secondsBetween(
      shot?.labfrog_date_time ?? shot?.fired_at,
      event.timestamp
    )
    if (gap === null) {
      continue
    }
    const size = Math.abs(gap)
    if (size < bestGap) {
      best = shotKey
      bestGap = size
      tied = false
    } else if (size === bestGap) {
      tied = true
    }
  }
  return tied ? null : best
}

/** The page's sections; a count chip jumps to `<id>-heading`. */
export const REVIEW_SECTIONS = {
  ambiguous: 'review-ambiguous',
  unmatched: 'review-unmatched',
  unassigned: 'review-unassigned',
  resolved: 'review-resolved',
} as const

export type ReviewSection = keyof typeof REVIEW_SECTIONS

export function reviewHeadingId(section: ReviewSection) {
  return `${REVIEW_SECTIONS[section]}-heading`
}
