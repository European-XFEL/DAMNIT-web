import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  FLOW_MODE_STORAGE_KEY,
  activePathsLabel,
  initialFlowMode,
  laneSource,
  readStoredFlowMode,
  storeFlowMode,
} from '../flow-mode'

afterEach(() => {
  vi.restoreAllMocks()
  window.localStorage.clear()
})

describe('initialFlowMode', () => {
  it('opens Live when live traffic is configured, else Demo', () => {
    expect(
      initialFlowMode(null, { flow_monitor: { live_traffic: true } })
    ).toBe('live')
    expect(
      initialFlowMode(null, { flow_monitor: { live_traffic: false } })
    ).toBe('demo')
    expect(initialFlowMode(null, undefined)).toBe('demo')
    // An older API without the field keeps the old default.
    expect(initialFlowMode(null, { flow_monitor: {} })).toBe('demo')
  })

  it('lets the stored choice win', () => {
    expect(
      initialFlowMode('demo', { flow_monitor: { live_traffic: true } })
    ).toBe('demo')
    expect(initialFlowMode('live', undefined)).toBe('live')
  })
})

describe('stored flow mode', () => {
  it('round-trips and ignores junk', () => {
    expect(readStoredFlowMode()).toBeNull()
    storeFlowMode('live')
    expect(readStoredFlowMode()).toBe('live')
    window.localStorage.setItem(FLOW_MODE_STORAGE_KEY, 'other')
    expect(readStoredFlowMode()).toBeNull()
  })

  it('survives blocked storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readStoredFlowMode()).toBeNull()
    expect(() => storeFlowMode('demo')).not.toThrow()
  })
})

describe('labels', () => {
  it('names the active paths truthfully', () => {
    expect(activePathsLabel(0)).toBe('No traffic now')
    expect(activePathsLabel(1)).toBe('1 path active')
    expect(activePathsLabel(3)).toBe('3 paths active')
  })

  it('names each lane by its source', () => {
    expect(laneSource('shotcounter')).toBe('Shot trigger')
    expect(laneSource('damnit')).toBe('DAMNIT')
  })
})
