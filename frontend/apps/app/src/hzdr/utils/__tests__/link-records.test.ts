import { describe, it, expect } from 'vitest'
import {
  parseShotNumberFilter,
  collectSearchText,
  sourceMatchesCampaign,
  collectionStatusForShot,
  buildLinkRecordsDraft,
  buildLinkRecordsReviewPackage,
} from '../link-records'
import type { HZDRShot, HZDRSource } from '../../types'

function makeShot(overrides: Partial<HZDRShot> = {}): HZDRShot {
  return {
    source_key: 'src',
    shot_number: 1,
    fired_at: '2026-05-01T10:00:00Z',
    metadata: {},
    events: [],
    data_products: [],
    ...overrides,
  }
}

function makeSource(overrides: Partial<HZDRSource> = {}): HZDRSource {
  return {
    key: 'test-source',
    title: 'Test Source',
    damnit_path: '/data/test',
    metadata: {},
    shots: [makeShot()],
    ...overrides,
  }
}

describe('parseShotNumberFilter', () => {
  it('returns null for empty string', () => {
    expect(parseShotNumberFilter('')).toBeNull()
    expect(parseShotNumberFilter('  ')).toBeNull()
  })

  it('returns the integer for a valid number string', () => {
    expect(parseShotNumberFilter('42')).toBe(42)
  })

  it('returns null for non-integer input', () => {
    expect(parseShotNumberFilter('3.14')).toBeNull()
    expect(parseShotNumberFilter('abc')).toBeNull()
  })
})

describe('collectSearchText', () => {
  it('collects primitive values', () => {
    expect(collectSearchText(['hello', 42, true])).toBe('hello 42 true')
  })

  it('recursively collects from nested objects', () => {
    const text = collectSearchText([{ facility: 'HZDR', instrument: 'Draco' }])
    expect(text).toContain('HZDR')
    expect(text).toContain('Draco')
  })

  it('recursively collects from arrays', () => {
    const text = collectSearchText([['a', 'b'], 'c'])
    expect(text).toBe('a b c')
  })

  it('ignores null and undefined', () => {
    expect(collectSearchText([null, undefined, 'x'])).toBe('x')
  })
})

describe('sourceMatchesCampaign', () => {
  it('returns true when campaignKey is null', () => {
    expect(sourceMatchesCampaign(makeSource(), null)).toBe(true)
  })

  it('returns true when source key contains the campaign key', () => {
    const source = makeSource({ key: 'exp-2026-05-draco' })
    expect(sourceMatchesCampaign(source, '2026-05')).toBe(true)
  })

  it('returns false when no text matches', () => {
    const source = makeSource({ key: 'exp-2026-05', title: 'May run' })
    expect(sourceMatchesCampaign(source, 'november')).toBe(false)
  })

  it('is case-insensitive', () => {
    const source = makeSource({ title: 'DRACO Campaign' })
    expect(sourceMatchesCampaign(source, 'draco')).toBe(true)
  })
})

describe('collectionStatusForShot', () => {
  it('always marks shots collection as matched', () => {
    const result = collectionStatusForShot('shots', makeShot())
    expect(result.status).toBe('matched')
    expect(result.collection).toBe('shots')
  })

  it('marks watchdog as matched when watchdog_status is present', () => {
    const shot = makeShot({ metadata: { watchdog_status: 'ok' } })
    const result = collectionStatusForShot('watchdog', shot)
    expect(result.status).toBe('matched')
    expect(result.detail).toBe('ok')
  })

  it('marks watchdog as missing when watchdog_status is absent', () => {
    const result = collectionStatusForShot('watchdog', makeShot())
    expect(result.status).toBe('missing')
  })

  it('marks shotcounter as matched when shot_id is present', () => {
    const shot = makeShot({ metadata: { shot_id: 'shot-000042' } })
    const result = collectionStatusForShot('shotcounter', shot)
    expect(result.status).toBe('matched')
  })

  it('marks shotcounter as candidate when shot_id is absent', () => {
    const result = collectionStatusForShot('shotcounter', makeShot())
    expect(result.status).toBe('candidate')
  })

  it('marks unknown collections as candidate', () => {
    const result = collectionStatusForShot('custom', makeShot())
    expect(result.status).toBe('candidate')
  })
})

describe('buildLinkRecordsDraft', () => {
  it('includes all sources when no source key is selected', () => {
    const sources = [makeSource({ key: 'a' }), makeSource({ key: 'b' })]
    const draft = buildLinkRecordsDraft({
      sources,
      campaignKey: '',
      selectedSourceKey: null,
      collections: ['shots'],
      shotNumberQuery: '',
    })
    expect(draft.search.searched_sources).toBe(2)
    expect(draft.linked_records).toHaveLength(2)
  })

  it('filters by shot number when provided', () => {
    const shots = [makeShot({ shot_number: 10 }), makeShot({ shot_number: 20 })]
    const source = makeSource({ shots })
    const draft = buildLinkRecordsDraft({
      sources: [source],
      campaignKey: '',
      selectedSourceKey: null,
      collections: ['shots'],
      shotNumberQuery: '10',
    })
    expect(draft.linked_records).toHaveLength(1)
    expect(draft.linked_records[0].shot_number).toBe(10)
  })

  it('limits to selected source key', () => {
    const sources = [makeSource({ key: 'src-a' }), makeSource({ key: 'src-b' })]
    const draft = buildLinkRecordsDraft({
      sources,
      campaignKey: '',
      selectedSourceKey: 'src-a',
      collections: ['shots'],
      shotNumberQuery: '',
    })
    expect(draft.linked_records.every((r) => r.source_key === 'src-a')).toBe(
      true
    )
  })

  it('generates fallback shot_id when metadata.shot_id is missing', () => {
    const shot = makeShot({ shot_number: 7 })
    const draft = buildLinkRecordsDraft({
      sources: [makeSource({ shots: [shot] })],
      campaignKey: '',
      selectedSourceKey: null,
      collections: ['shots'],
      shotNumberQuery: '',
    })
    expect(draft.linked_records[0].shot_id).toBe('shot-000007')
  })

  it('reports unresolved when no records match', () => {
    const draft = buildLinkRecordsDraft({
      sources: [],
      campaignKey: '',
      selectedSourceKey: null,
      collections: ['shots'],
      shotNumberQuery: '',
    })
    expect(draft.unresolved).toContain(
      'No matching records are visible from the current HZDR sources.'
    )
  })
})

describe('buildLinkRecordsReviewPackage', () => {
  it('adds built_at timestamp', () => {
    const draft = buildLinkRecordsDraft({
      sources: [makeSource()],
      campaignKey: '',
      selectedSourceKey: null,
      collections: ['shots'],
      shotNumberQuery: '',
    })
    const pkg = buildLinkRecordsReviewPackage(draft)
    expect(pkg.built_at).toBeTruthy()
    expect(new Date(pkg.built_at).getTime()).not.toBeNaN()
  })

  it('populates coherent_json with shots', () => {
    const draft = buildLinkRecordsDraft({
      sources: [makeSource()],
      campaignKey: 'exp-2026',
      selectedSourceKey: null,
      collections: ['shots'],
      shotNumberQuery: '',
    })
    const pkg = buildLinkRecordsReviewPackage(draft)
    expect(pkg.coherent_json.shots).toHaveLength(draft.linked_records.length)
  })

  it('counts unique sources in hdf5_plan', () => {
    const sources = [
      makeSource({ key: 'src-a', shots: [makeShot({ shot_number: 1 })] }),
      makeSource({ key: 'src-b', shots: [makeShot({ shot_number: 2 })] }),
    ]
    const draft = buildLinkRecordsDraft({
      sources,
      campaignKey: '',
      selectedSourceKey: null,
      collections: ['shots'],
      shotNumberQuery: '',
    })
    const pkg = buildLinkRecordsReviewPackage(draft)
    expect(pkg.hdf5_plan.source_count).toBe(2)
    expect(pkg.hdf5_plan.row_count).toBe(2)
  })
})
