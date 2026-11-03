import { describe, it, expect } from 'vitest'
import { summarizeShotDataSources } from '../data-sources'
import type { HZDRShot, HZDRSourceEvent } from '../../types'

function event(source: string): HZDRSourceEvent {
  return {
    event_id: `${source}-1`,
    source,
    kind: 'k',
    timestamp: '2026-04-21T09:00:00Z',
    payload_ref: {},
    metadata: {},
  }
}

function shot(overrides: Partial<HZDRShot> = {}): HZDRShot {
  return {
    source_key: 'radbio',
    shot_number: 1,
    fired_at: '2026-04-21T09:00:00Z',
    metadata: {},
    events: [],
    data_products: [],
    ...overrides,
  }
}

describe('summarizeShotDataSources', () => {
  it('lists only LabFrog for shots built from LabFrog alone', () => {
    expect(
      summarizeShotDataSources([
        shot({ labfrog_record_id: 'a' }),
        shot({ labfrog_record_id: 'b' }),
      ])
    ).toEqual([{ label: 'LabFrog', shotCount: 2 }])
  })

  it('counts each producer once per shot, most shots first', () => {
    expect(
      summarizeShotDataSources([
        shot({
          labfrog_record_id: 'a',
          events: [event('DAQ File Watchdog'), event('DAQ File Watchdog')],
        }),
        shot({ events: [event('shot-authority')] }),
        shot({ labfrog_record_id: 'c' }),
      ])
    ).toEqual([
      { label: 'LabFrog', shotCount: 2 },
      { label: 'DAQ File Watchdog', shotCount: 1 },
      { label: 'shot-authority', shotCount: 1 },
    ])
  })

  it('is empty for no shots', () => {
    expect(summarizeShotDataSources([])).toEqual([])
  })
})
