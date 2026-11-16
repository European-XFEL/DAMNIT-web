import { describe, expect, it } from 'vitest'

import type { FlowActivity } from '../../types'
import { activityChanges } from '../flow-activity'

function snapshot(
  trigger: number,
  watchdog: number,
  spool: number,
  asapo = 0
): FlowActivity {
  return {
    kafka: {
      available: true,
      topics: [
        {
          topic: 'draco.trigger',
          exists: true,
          messages: trigger,
          partitions: 1,
        },
        {
          topic: 'planet.watchdog.events',
          exists: true,
          messages: watchdog,
          partitions: 1,
        },
      ],
    },
    asapo: {
      available: asapo > 0,
      streams: asapo ? [{ name: 'default', messages: asapo }] : [],
    },
    spool: {
      files: [{ label: 'kafka', campaign: '_unassigned', events: spool }],
    },
  }
}

describe('activityChanges', () => {
  it('treats the first snapshot as a baseline', () => {
    expect(activityChanges(null, snapshot(5, 2, 7))).toEqual([])
  })

  it('moves one packet per lane that gained traffic', () => {
    const changes = activityChanges(snapshot(5, 2, 7), snapshot(6, 2, 9, 3))
    expect(changes.map((change) => [change.lane, change.label])).toEqual([
      ['shotcounter', 'draco.trigger +1'],
      ['laser', 'ASAPO +3'],
      ['damnit', 'Spool +2'],
    ])
  })

  it('does not count a reset as traffic', () => {
    expect(activityChanges(snapshot(5, 2, 7), snapshot(0, 0, 0))).toEqual([])
  })
})
