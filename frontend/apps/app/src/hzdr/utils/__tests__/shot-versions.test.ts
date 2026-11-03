import { describe, expect, it } from 'vitest'

import { classifyShotVersions, getShotVersion } from '../shot-versions'
import { getShotRowKey } from '../shot-key'
import type { HZDRShot } from '../../types'

function shot(
  id: string,
  version: unknown,
  overrides: Partial<HZDRShot> = {}
): HZDRShot {
  return {
    source_key: 'radbio',
    shot_number: 40,
    fired_at: '2026-06-17T10:38:36Z',
    labfrog_record_id: id,
    metadata: { status: 'active', version },
    events: [],
    data_products: [],
    ...overrides,
  }
}

const states = (shots: HZDRShot[]) => {
  const result = classifyShotVersions(shots)
  return shots.map((s) => result.get(getShotRowKey(s)))
}

describe('shot version display policy', () => {
  it('keeps the highest version even if the lower version is also active', () => {
    const shots = [shot('old', 2), shot('new', 3)]
    expect(states(shots)).toEqual(['older', 'current'])
    expect(shots[0].metadata.status).toBe('active')
    expect(states([...shots].reverse())).toEqual(['current', 'older'])
  })

  it('flags equal highest versions and unknown versions without choosing a record', () => {
    expect(states([shot('a', 0), shot('b', 0)])).toEqual([
      'conflict',
      'conflict',
    ])
    expect(states([shot('a', undefined), shot('b', 3)])).toEqual([
      'conflict',
      'conflict',
    ])
    expect(states([shot('a', 1), shot('b', 3), shot('c', 3)])).toEqual([
      'older',
      'conflict',
      'conflict',
    ])
  })

  it('hides explicitly archived or superseded records', () => {
    expect(
      states([
        shot('a', 1, { metadata: { version: 1, status: 'ARCHIVED' } }),
        shot('b', 2, { metadata: { version: 2, has_newer_version: true } }),
        shot('c', 3),
      ])
    ).toEqual(['archived', 'archived', 'current'])
    expect(
      states([shot('a', 0, { metadata: { status: 'archived' } })])
    ).toEqual(['archived'])
  })

  it('separates campaigns, shot numbers, dates and exported shot days', () => {
    const base = shot('a', 1)
    expect(
      states([
        base,
        shot('b', 2, { source_key: 'other' }),
        shot('c', 3, { shot_number: 41 }),
        shot('d', 4, { fired_at: '2026-06-18T10:38:36Z' }),
      ])
    ).toEqual(['current', 'current', 'current', 'current'])
    expect(
      states([
        shot('a', 1, { metadata: { version: 1, shot_day: 7 } }),
        shot('b', 2, { metadata: { version: 2, shot_day: 8 } }),
      ])
    ).toEqual(['current', 'current'])
    expect(
      states([shot('a', 1, { fired_at: '' }), shot('b', 2, { fired_at: '' })])
    ).toEqual(['current', 'current'])
  })

  it('accepts integer strings but rejects empty, invalid and fractional versions', () => {
    expect(getShotVersion(shot('a', '7'))).toBe(7)
    for (const version of [null, '', ' ', true, -1, 1.5, 'bad']) {
      expect(getShotVersion(shot('a', version))).toBeUndefined()
    }
  })
})
