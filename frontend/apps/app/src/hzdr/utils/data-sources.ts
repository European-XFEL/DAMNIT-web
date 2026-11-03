import type { HZDRShot } from '../types'

export type ShotDataSource = {
  label: string
  /** Shots that have data from this source. */
  shotCount: number
}

/**
 * Where a campaign's shots got their data: LabFrog for shots built from a
 * LabFrog record, then each event producer by the name it sends as `source`.
 * Ordered by how many shots each one reached.
 */
export function summarizeShotDataSources(shots: HZDRShot[]): ShotDataSource[] {
  const counts = new Map<string, number>()
  const add = (label: string) => counts.set(label, (counts.get(label) ?? 0) + 1)
  for (const shot of shots) {
    if (shot.labfrog_record_id) {
      add('LabFrog')
    }
    for (const source of new Set(shot.events.map((event) => event.source))) {
      if (source) {
        add(source)
      }
    }
  }
  return Array.from(counts, ([label, shotCount]) => ({
    label,
    shotCount,
  })).sort(
    (left, right) =>
      right.shotCount - left.shotCount || left.label.localeCompare(right.label)
  )
}
