import type { HZDRShot } from '../types'

// Per campaign, the newest shot time this browser has shown: the next visit
// calls everything fired after it new. One number per campaign.
const lastSeenKey = (sourceKey: string) =>
  `hzdr:shot-page:last-seen:${sourceKey}`

function shotMs(shot: HZDRShot): number | null {
  const ms = shot.fired_at ? Date.parse(shot.fired_at) : Number.NaN
  return Number.isNaN(ms) ? null : ms
}

/** The newest shot time shown on the last visit, or null (first visit). */
export function readLastSeenShot(sourceKey: string): number | null {
  try {
    const raw = window.localStorage.getItem(lastSeenKey(sourceKey))
    const value = raw === null ? Number.NaN : Number(raw)
    return Number.isFinite(value) ? value : null
  } catch {
    return null
  }
}

/** Remember the newest of these shots for the next visit (never goes back). */
export function rememberLastSeenShot(sourceKey: string, shots: HZDRShot[]) {
  const newest = Math.max(
    ...shots.map((shot) => shotMs(shot) ?? Number.NEGATIVE_INFINITY)
  )
  if (!Number.isFinite(newest)) return
  const previous = readLastSeenShot(sourceKey)
  if (previous !== null && previous >= newest) return
  try {
    window.localStorage.setItem(lastSeenKey(sourceKey), String(newest))
  } catch {
    // blocked storage: nothing is marked new next time
  }
}

/** Whether a shot was fired after the last visit's newest shot. */
export function isNewShot(shot: HZDRShot, lastSeen: number | null) {
  if (lastSeen === null) return false
  const ms = shotMs(shot)
  return ms !== null && ms > lastSeen
}
