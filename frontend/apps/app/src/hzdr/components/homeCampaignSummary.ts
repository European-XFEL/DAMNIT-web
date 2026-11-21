import type { HZDRReviewEvent, HZDRSource } from '../types'
import { campaignTitle } from '../utils/format'
import { groupReviewEvents } from '../utils/review'

/**
 * The sources list (GET /metadata/hzdr/sources) already carries every
 * campaign's shots and its ambiguous/unmatched `review_events` (the same list
 * GET .../review returns), so Home needs no fetch per campaign.
 */
export type HomeSource = HZDRSource & { review_events?: HZDRReviewEvent[] }

export type HomeCampaignSummary = {
  key: string
  title: string
  damnitPath: string
  shotCount: number
  /** Latest shot time as an ISO string, or null when no shot has one. */
  lastShotAt: string | null
  lastShotMs: number | null
  firedToday: number
  /** Decisions waiting in Review matches: ambiguous + unmatched + unassigned. */
  waiting: number
  needsReview: number
  needsRevision: number
}

function sameLocalDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export function summarizeCampaign(
  source: HomeSource,
  now: Date = new Date()
): HomeCampaignSummary {
  let lastShotMs: number | null = null
  let lastShotAt: string | null = null
  let firedToday = 0
  let needsReview = 0
  let needsRevision = 0
  let unassigned = 0
  for (const shot of source.shots ?? []) {
    const time = shot.fired_at ? new Date(shot.fired_at) : null
    const ms = time?.getTime()
    if (time && ms !== undefined && !Number.isNaN(ms)) {
      if (lastShotMs === null || ms > lastShotMs) {
        lastShotMs = ms
        lastShotAt = shot.fired_at
      }
      if (sameLocalDay(time, now)) {
        firedToday += 1
      }
    }
    const status = shot.metadata?.status
    if (status === 'needs-review') needsReview += 1
    if (status === 'revision-needed') needsRevision += 1
    if (shot.experiment_id_source === 'unassigned') unassigned += 1
  }
  const events = groupReviewEvents(source.review_events ?? [])
  return {
    key: source.key,
    title: campaignTitle(source.title) || source.key,
    damnitPath: source.damnit_path,
    shotCount: source.shots?.length ?? 0,
    lastShotAt,
    lastShotMs,
    firedToday,
    waiting: events.ambiguous.length + events.unmatched.length + unassigned,
    needsReview,
    needsRevision,
  }
}

/** Newest first by latest shot; campaigns without a shot time go last. */
export function sortNewestFirst(campaigns: HomeCampaignSummary[]) {
  return [...campaigns].sort((a, b) => {
    if (a.lastShotMs === b.lastShotMs) return a.title.localeCompare(b.title)
    if (a.lastShotMs === null) return 1
    if (b.lastShotMs === null) return -1
    return b.lastShotMs - a.lastShotMs
  })
}

/** Case-insensitive match on the campaign title. */
export function filterCampaigns(
  campaigns: HomeCampaignSummary[],
  query: string
) {
  const needle = query.trim().toLowerCase()
  if (!needle) return campaigns
  return campaigns.filter((campaign) =>
    campaign.title.toLowerCase().includes(needle)
  )
}
