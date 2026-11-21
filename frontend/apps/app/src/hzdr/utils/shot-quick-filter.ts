import type { HZDRShot } from '../types'

import { getShotRowKey } from './shot-key'

/** The status chips above the shot table; `all` shows every shot. */
export const SHOT_STATUS_FILTERS = [
  'all',
  'needs-review',
  'revision-needed',
] as const

export type ShotStatusFilter = (typeof SHOT_STATUS_FILTERS)[number]

/** `''` shows every day. */
export type ShotQuickFilter = { status: ShotStatusFilter; day: string }

export function shotMatchesStatusFilter(
  shot: HZDRShot,
  status: ShotStatusFilter
) {
  return status === 'all' || String(shot.metadata.status ?? '') === status
}

export function shotMatchesDayFilter(
  shot: HZDRShot,
  day: string,
  dayLabels: Map<string, string>
) {
  return !day || dayLabels.get(getShotRowKey(shot)) === day
}

/** The day labels of these shots in order ("Day 1", "Day 2", ...). */
export function shotDayOptions(
  shots: HZDRShot[],
  dayLabels: Map<string, string>
) {
  const days = new Set<string>()
  for (const shot of shots) {
    const label = dayLabels.get(getShotRowKey(shot))
    if (label && label !== '-') days.add(label)
  }
  return [...days].sort((left, right) =>
    left.localeCompare(right, undefined, { numeric: true })
  )
}

/**
 * How many shots each chip would show, given the other chip and the text
 * filter: status counts within the chosen day, day counts within the chosen
 * status.
 */
export function countShotQuickFilters(
  shots: HZDRShot[],
  filter: ShotQuickFilter,
  dayLabels: Map<string, string>,
  days: string[]
) {
  const inDay = shots.filter((shot) =>
    shotMatchesDayFilter(shot, filter.day, dayLabels)
  )
  const inStatus = shots.filter((shot) =>
    shotMatchesStatusFilter(shot, filter.status)
  )
  return {
    status: Object.fromEntries(
      SHOT_STATUS_FILTERS.map((status) => [
        status,
        inDay.filter((shot) => shotMatchesStatusFilter(shot, status)).length,
      ])
    ) as Record<ShotStatusFilter, number>,
    allDays: inStatus.length,
    day: Object.fromEntries(
      days.map((day) => [
        day,
        inStatus.filter((shot) => shotMatchesDayFilter(shot, day, dayLabels))
          .length,
      ])
    ) as Record<string, number>,
  }
}
