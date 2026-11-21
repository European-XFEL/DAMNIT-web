import type { HZDRSourceSummary } from '../types'
import { campaignTitle } from '../utils/format'

export type { HZDRSourceSummary }

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
  unreadableTimes: number
}

/** Local midnight of `now` as ISO-8601 with this browser's UTC offset. */
export function localMidnightIso(now: Date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0')
  const offset = -now.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  const abs = Math.abs(offset)
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `T00:00:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  )
}

/** The summaries URL Home polls, counting today from local midnight. */
export function sourceSummariesUrl(now: Date = new Date()) {
  const since = encodeURIComponent(localMidnightIso(now))
  return `/metadata/hzdr/source-summaries?since=${since}`
}

export function summarizeCampaign(
  summary: HZDRSourceSummary
): HomeCampaignSummary {
  const ms = summary.last_shot_at
    ? new Date(summary.last_shot_at).getTime()
    : Number.NaN
  const valid = !Number.isNaN(ms)
  return {
    key: summary.key,
    title: campaignTitle(summary.title) || summary.key,
    damnitPath: summary.damnit_path,
    shotCount: summary.shot_count,
    lastShotAt: valid ? summary.last_shot_at : null,
    lastShotMs: valid ? ms : null,
    firedToday: summary.fired_since,
    waiting: summary.waiting,
    needsReview: summary.needs_review,
    needsRevision: summary.needs_revision,
    unreadableTimes: summary.unreadable_times ?? 0,
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

const LAST_CAMPAIGN_KEY = 'hzdr.home.lastCampaign'

/** Remember the campaign a person opened, for "Continue with" on Home. */
export function rememberLastCampaign(key: string) {
  try {
    window.localStorage.setItem(LAST_CAMPAIGN_KEY, key)
  } catch {
    // blocked storage: Home simply offers no "Continue with"
  }
}

export function readLastCampaign(): string | null {
  try {
    return window.localStorage.getItem(LAST_CAMPAIGN_KEY)
  } catch {
    return null
  }
}

/** The numbers a person scans first: what exists, what is new, what waits. */
export function homeGlance(campaigns: HomeCampaignSummary[]) {
  let shots = 0
  let today = 0
  let waiting = 0
  let newest: HomeCampaignSummary | undefined
  for (const campaign of campaigns) {
    shots += campaign.shotCount
    today += campaign.firedToday
    waiting += campaign.waiting
    if (
      campaign.lastShotMs !== null &&
      (newest?.lastShotMs == null || campaign.lastShotMs > newest.lastShotMs)
    ) {
      newest = campaign
    }
  }
  const busiest = campaigns
    .filter((campaign) => campaign.waiting > 0)
    .sort((a, b) => b.waiting - a.waiting)[0]
  return { campaigns: campaigns.length, shots, today, waiting, newest, busiest }
}
