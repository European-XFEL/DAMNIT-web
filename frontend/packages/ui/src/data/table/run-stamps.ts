import { makeVar } from '@apollo/client'

import { runKey } from './table-data.transforms'
import type { RunId } from './table-data.types'

// Flash stamps for runs delivered by a live push, keyed by run identity. Only
// the subscription push handler writes here: bulk loads and deferred fills are
// not updates, so they never flash. Stamps are performance.now() values
// because glide fades the flash against its own performance.now() frame
// clock; an epoch stamp (Date.now() or a server time) reads as decades in the
// future there and paints the row yellow forever.
export const liveRunStamps = makeVar<ReadonlyMap<string, number>>(new Map())

// How long a stamp can still affect a frame. Glide fades the highlight over
// 500ms and ignores anything older, so this only needs to clear that with room
// to spare; past it a stamp is dead weight the next push would copy again.
const FLASH_DURATION = 1000

export function stampLiveRuns(runs: RunId[]): void {
  if (runs.length === 0) {
    return
  }
  const now = performance.now()
  // Rebuilt rather than copied so the map holds the runs of the last second or
  // so, not every run stamped since the tab was opened. That also means a
  // proposal's stamps expire on their own, without a teardown hook.
  const next = new Map<string, number>()
  for (const [key, stamp] of liveRunStamps()) {
    if (now - stamp < FLASH_DURATION) {
      next.set(key, stamp)
    }
  }
  for (const run of runs) {
    next.set(runKey(run), now)
  }
  liveRunStamps(next)
}
