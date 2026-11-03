import type { HZDRShot, HZDRTrendValue } from '../types'

export function getShotDateKey(firedAt: string) {
  if (!firedAt) {
    return undefined
  }
  const isoDate = firedAt.match(/^\d{4}-\d{2}-\d{2}/)?.[0]
  if (isoDate) {
    return isoDate
  }
  const date = new Date(firedAt)
  if (Number.isNaN(date.getTime())) {
    return undefined
  }
  return date.toISOString().slice(0, 10)
}

type ShotIdentity = Pick<HZDRShot, 'shot_number' | 'fired_at'> &
  Partial<Pick<HZDRShot, 'shot_key' | 'shot_date'>>

function getShotDay(shot: ShotIdentity) {
  return shot.shot_date || getShotDateKey(shot.fired_at)
}

/**
 * One table row's identity. LabFrog shot numbers restart each day, so a
 * shot_number alone is shared by several shots of a campaign.
 */
export function getShotRowKey(shot: ShotIdentity) {
  return shot.shot_key ?? `${getShotDay(shot) ?? ''}:${shot.shot_number}`
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
