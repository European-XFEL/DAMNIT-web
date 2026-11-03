import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  assignShotExperiment,
  campaignSuggestions,
  confirmReviewEvent,
  dismissReviewEvent,
  formatSeconds,
  groupReviewEvents,
  payloadPointer,
  readJson,
  secondsBetween,
  shotConfirmations,
  shotsByKey,
  uniqueCandidateKeys,
  type LabFrogCampaignRef,
} from '../review'
import type { HZDRReviewEvent, HZDRShot, HZDRSource } from '../../types'

function makeEvent(overrides: Partial<HZDRReviewEvent> = {}): HZDRReviewEvent {
  return {
    event_id: 'evt-1',
    experiment_id: 'exp',
    source: 'DRACO-Trigger',
    kind: 'draco.trigger',
    timestamp: '2026-05-05T08:17:00Z',
    payload_ref: {},
    metadata: {},
    match_status: 'ambiguous',
    candidate_shot_keys: [],
    acknowledged: false,
    ...overrides,
  }
}

function makeShot(overrides: Partial<HZDRShot> = {}): HZDRShot {
  return {
    source_key: 'src',
    shot_number: 1,
    fired_at: '2026-05-05T08:15:00Z',
    metadata: {},
    events: [],
    data_products: [],
    ...overrides,
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('readJson', () => {
  it('returns the parsed body on success', async () => {
    await expect(readJson(jsonResponse({ ok: 1 }))).resolves.toEqual({ ok: 1 })
  })

  it("surfaces the API's detail message on failure", async () => {
    await expect(
      readJson(jsonResponse({ detail: 'shot_key must be one of …' }, 400))
    ).rejects.toThrow('shot_key must be one of …')
  })

  it('falls back to the status when the body has no detail', async () => {
    await expect(
      readJson(new Response('oops', { status: 502 }))
    ).rejects.toThrow('Request failed with 502')
  })
})

describe('review POSTs', () => {
  it('confirms a candidate through the review API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}))
    vi.stubGlobal('fetch', fetchMock)

    await confirmReviewEvent('hzdr local', 'evt/1', 'exp:20260505:000001', ' ')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(
      '/metadata/hzdr/sources/hzdr%20local/review/evt%2F1/confirm'
    )
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({
      shot_key: 'exp:20260505:000001',
      note: null,
    })
  })

  it('dismisses an unmatched event', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}))
    vi.stubGlobal('fetch', fetchMock)

    await dismissReviewEvent('src', 'evt-2', 'test fire')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/metadata/hzdr/sources/src/review/evt-2/dismiss')
    expect(JSON.parse(init.body)).toEqual({ note: 'test fire' })
  })

  it('records a campaign ruling for an unassigned shot', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ status: 'pending_rebuild' }, 202))
    vi.stubGlobal('fetch', fetchMock)

    const result = await assignShotExperiment(9, ' Beamline_radbio_2026 ')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/metadata/hzdr/experiment-rulings')
    expect(JSON.parse(init.body)).toEqual({
      shot_number: 9,
      experiment_id: 'Beamline_radbio_2026',
      note: null,
    })
    expect(result.status).toBe('pending_rebuild')
  })
})

describe('groupReviewEvents', () => {
  it('splits ambiguous, waiting unmatched and acknowledged events', () => {
    const grouped = groupReviewEvents([
      makeEvent({ event_id: 'a' }),
      makeEvent({ event_id: 'u', match_status: 'unmatched' }),
      makeEvent({
        event_id: 'k',
        match_status: 'unmatched',
        acknowledged: true,
      }),
    ])
    expect(grouped.ambiguous.map((event) => event.event_id)).toEqual(['a'])
    expect(grouped.unmatched.map((event) => event.event_id)).toEqual(['u'])
    expect(grouped.acknowledged.map((event) => event.event_id)).toEqual(['k'])
  })
})

describe('candidates', () => {
  it('drops repeated candidate keys, keeping their order', () => {
    expect(
      uniqueCandidateKeys(makeEvent({ candidate_shot_keys: ['b', 'a', 'b'] }))
    ).toEqual(['b', 'a'])
  })

  it('looks shots up by the first row with each shot_key', () => {
    const lookup = shotsByKey([
      makeShot({ shot_key: 'k1', shot_number: 1 }),
      makeShot({ shot_key: 'k1', shot_number: 2 }),
      makeShot({ shot_number: 3 }),
    ])
    expect(lookup.get('k1')?.shot_number).toBe(1)
    expect(lookup.size).toBe(1)
  })
})

describe('secondsBetween', () => {
  it('measures between two zoned times', () => {
    expect(
      secondsBetween('2026-05-05T08:15:00Z', '2026-05-05T08:17:00+00:00')
    ).toBe(120)
  })

  it('refuses to guess the zone of a naive LabFrog time', () => {
    expect(
      secondsBetween('2026-05-05 10:15:00', '2026-05-05T08:17:00Z')
    ).toBeNull()
    expect(secondsBetween(undefined, '2026-05-05T08:17:00Z')).toBeNull()
  })
})

describe('formatSeconds', () => {
  it('formats signed seconds, minutes and hours', () => {
    expect(formatSeconds(null)).toBe('-')
    expect(formatSeconds(12)).toBe('+12 s')
    expect(formatSeconds(-120)).toBe('-2 min')
    expect(formatSeconds(125)).toBe('+2 min 5 s')
    expect(formatSeconds(3720)).toBe('+1 h 2 min')
  })
})

describe('campaignSuggestions', () => {
  it('offers curated campaigns, then catalog campaigns, never unassigned', () => {
    const campaigns = [
      { key: 'Beamline_radbio_2026' },
    ] as unknown as LabFrogCampaignRef[]
    const sources = [
      { metadata: { experiment_id: 'unassigned' } },
      { metadata: { experiment_id: 'Pilot_2026' } },
      { metadata: { experiment_id: 'Beamline_radbio_2026' } },
      { metadata: {} },
    ] as unknown as HZDRSource[]
    expect(campaignSuggestions(campaigns, sources)).toEqual([
      'Beamline_radbio_2026',
      'Pilot_2026',
    ])
  })
})

describe('shotConfirmations', () => {
  it('collects who confirmed what and when, newest first', () => {
    const confirmations = shotConfirmations([
      makeShot({
        shot_number: 4,
        shot_key: 'k4',
        metadata: {
          match_confirmation_history: [
            { at: '2026-10-01T08:00:00Z', event_id: 'e1', by: 'kim' },
            'not a record',
          ],
        },
      }),
      makeShot({
        shot_number: 5,
        metadata: {
          match_confirmation_history: [
            {
              at: '2026-10-02T08:00:00Z',
              event_id: 'e2',
              by: 'lee',
              note: 'ok',
            },
          ],
        },
      }),
      makeShot({ metadata: { match_confirmation_history: 'broken' } }),
    ])
    expect(confirmations.map((entry) => entry.event_id)).toEqual(['e2', 'e1'])
    expect(confirmations[0]).toMatchObject({
      shot_number: 5,
      shot_key: null,
      by: 'lee',
      note: 'ok',
    })
    expect(confirmations[1].note).toBeNull()
  })
})

describe('payloadPointer', () => {
  it('prefers a path, then a Kafka position', () => {
    expect(
      payloadPointer(makeEvent({ payload_ref: { path: '/data/a.h5' } }))
    ).toBe('/data/a.h5')
    expect(
      payloadPointer(
        makeEvent({ payload_ref: { topic: 't', partition: 1, offset: 7 } })
      )
    ).toBe('t@1:7')
    expect(payloadPointer(makeEvent())).toBeNull()
  })
})
