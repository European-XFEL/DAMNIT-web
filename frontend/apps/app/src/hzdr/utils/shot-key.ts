import type { HZDRShot, HZDRTrendValue } from '../types'

/**
 * The campaign's time zone. A shot day is the campaign day, never the UTC
 * date or the browser's zone (hzdr-combo docs/architecture.md § Time, rule 4):
 * a shot at 00:30 CET belongs to that day.
 */
export const CAMPAIGN_TIMEZONE = 'Europe/Berlin'

const DATE_PREFIX = /^\d{4}-\d{2}-\d{2}/
const HAS_OFFSET = /(?:Z|[+-]\d{2}:?\d{2})$/

const campaignDayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: CAMPAIGN_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** The date `value` falls on in the campaign zone, as `YYYY-MM-DD`. */
function campaignDay(value: Date) {
  // en-CA formats as YYYY-MM-DD.
  return campaignDayFormat.format(value)
}

export function getShotDateKey(firedAt: string) {
  if (!firedAt) {
    return undefined
  }
  // A time without an offset is the campaign's wall clock (rule 2), so its
  // date prefix is already the campaign day; converting it would shift it.
  if (!HAS_OFFSET.test(firedAt)) {
    const isoDate = firedAt.match(DATE_PREFIX)?.[0]
    if (isoDate) {
      return isoDate
    }
  }
  const date = new Date(firedAt)
  if (Number.isNaN(date.getTime())) {
    return undefined
  }
  return campaignDay(date)
}

type ShotIdentity = Pick<HZDRShot, 'shot_number' | 'fired_at'> &
  Partial<Pick<HZDRShot, 'shot_key' | 'shot_date' | 'labfrog_record_id'>>

function getShotDay(shot: ShotIdentity) {
  return shot.shot_date || getShotDateKey(shot.fired_at)
}

/**
 * One table row's identity. LabFrog shot numbers restart each day, so a
 * shot_number alone is shared by several shots of a campaign. Multiple
 * LabFrog records can also share a canonical shot_key, even at the same time.
 */
export function getShotRowKey(shot: ShotIdentity) {
  const shotKey =
    shot.shot_key ?? `${getShotDay(shot) ?? ''}:${shot.shot_number}`
  return shot.labfrog_record_id
    ? `${shotKey}:record:${shot.labfrog_record_id}`
    : shotKey
}

/** "12 · 2026-04-28": the shot number with the day that makes it unique. */
export function formatShotLabel(shot: ShotIdentity) {
  const day = getShotDay(shot)
  return day ? `${shot.shot_number} · ${day}` : String(shot.shot_number)
}

export function toTrendValue(shot: HZDRShot, value: number): HZDRTrendValue {
  return {
    shotNumber: shot.shot_number,
    value,
    rowKey: getShotRowKey(shot),
    label: formatShotLabel(shot),
  }
}

/** The value `?shot=` carries for a shot: its shot_key, else its number. */
export function shotLinkValue(shot: HZDRShot): string {
  return shot.shot_key || String(shot.shot_number)
}

/** Whether a `?shot=` value names this shot (its shot_key or its number). */
export function shotMatchesLink(shot: HZDRShot, link: string | null): boolean {
  if (!link) return false
  return shot.shot_key === link || String(shot.shot_number) === link
}
