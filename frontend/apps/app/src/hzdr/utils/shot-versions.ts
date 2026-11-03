import type { HZDRShot } from '../types'

import { getShotDateKey, getShotRowKey } from './shot-key'

export type ShotVersionState = 'current' | 'older' | 'archived' | 'conflict'

export function getShotVersion(shot: HZDRShot): number | undefined {
  const value = shot.metadata.version
  if (typeof value !== 'number' && typeof value !== 'string') return undefined
  if (typeof value === 'string' && !value.trim()) return undefined
  const version = Number(value)
  return Number.isInteger(version) && version >= 0 ? version : undefined
}

/** Display policy only: never rewrite the recorded LabFrog status. */
export function classifyShotVersions(shots: HZDRShot[]) {
  const groups = new Map<string, HZDRShot[]>()
  for (const shot of shots) {
    const day =
      shot.metadata.shot_day ?? shot.shot_date ?? getShotDateKey(shot.fired_at)
    // Undated records cannot safely be combined by shot number alone.
    const key = JSON.stringify([
      shot.source_key,
      day ?? shot.shot_key ?? getShotRowKey(shot),
      shot.shot_number,
    ])
    const group = groups.get(key) ?? []
    group.push(shot)
    groups.set(key, group)
  }
  const states = new Map<string, ShotVersionState>()
  for (const group of groups.values()) {
    const versions = group.map(getShotVersion).filter((v) => v !== undefined)
    const latest = versions.length ? Math.max(...versions) : undefined
    const candidates: HZDRShot[] = []
    for (const shot of group) {
      const version = getShotVersion(shot)
      const state =
        shot.metadata.status?.trim().toLowerCase() === 'archived' ||
        shot.metadata.has_newer_version === true
          ? 'archived'
          : version !== undefined && latest !== undefined && version < latest
            ? 'older'
            : 'current'
      states.set(getShotRowKey(shot), state)
      if (state === 'current') candidates.push(shot)
    }
    // Equal highest versions or unknown versions need review, not a guessed winner.
    if (candidates.length > 1) {
      for (const shot of candidates) states.set(getShotRowKey(shot), 'conflict')
    }
  }
  return states
}
