import { describe, expect, it } from 'vitest'

import {
  NOT_RECORDED,
  campaignTitle,
  formatShotLabel,
  formatShotTime,
  matchQualityLabel,
} from '../format'

describe('labels for people', () => {
  it('formats shot times without ISO or seconds', () => {
    expect(formatShotTime(undefined)).toBe(NOT_RECORDED)
    expect(formatShotTime('nonsense')).toBe('nonsense')
    const text = formatShotTime('2026-07-01T09:36:00Z')
    expect(text).not.toContain('T09')
    expect(text).not.toContain(':00:')
    expect(formatShotLabel(7)).toBe('Shot 7')
    expect(formatShotLabel(7, '2026-07-01T09:36:00Z')).toMatch(/^Shot 7 · /)
  })

  it('says match qualities in words', () => {
    expect(matchQualityLabel('event_identity')).toBe(
      'Built from its own events'
    )
    expect(matchQualityLabel('new_rank')).toBe('new rank')
    expect(matchQualityLabel(null)).toBe(NOT_RECORDED)
  })

  it('drops the builder wrapper from campaign titles', () => {
    expect(
      campaignTitle('HZDR canonical campaign (Pilot_Screenshot_07.2026)')
    ).toBe('Pilot_Screenshot_07.2026')
    expect(campaignTitle('radbio')).toBe('radbio')
    expect(campaignTitle(undefined)).toBe('')
  })
})
