import { describe, expect, it } from 'vitest'

import type { HZDRShot } from '../../types'
import {
  buildShotDatasetTree,
  containsToken,
  countShotDatasets,
  safeHdf5Name,
  shotContainerStem,
  splitShotDatasets,
} from '../shot-datasets'

const CAMPAIGN = 'demo-campaign'

function shot(overrides: Partial<HZDRShot> = {}): HZDRShot {
  return {
    source_key: CAMPAIGN,
    shot_number: 7,
    fired_at: '2026-07-01T09:36:00Z',
    shot_key: `${CAMPAIGN}:20260701:000007`,
    metadata: { shot_id: 'shot-000007' },
    events: [],
    data_products: [],
    ...overrides,
  }
}

const names = (list: { name: string }[]) => list.map((entry) => entry.name)
const ds = (name: string) => ({ name, shape: [1], dtype: 'float64' })

describe('shotContainerStem', () => {
  it('reads the container name from the shot key', () => {
    expect(shotContainerStem(shot())).toBe('20260701_000007')
    expect(shotContainerStem(shot({ shot_key: 'radbio:2026-04-29:14' }))).toBe(
      '20260429_000014'
    )
  })

  it('falls back to the shot day and number without a shot key', () => {
    expect(
      shotContainerStem(shot({ shot_key: undefined, shot_date: '2026-07-02' }))
    ).toBe('20260702_000007')
  })

  it('gives none for a shot key it cannot read', () => {
    expect(shotContainerStem(shot({ shot_key: 'odd-key' }))).toBeUndefined()
  })
})

describe('containsToken', () => {
  it('needs a non-alphanumeric character on both sides', () => {
    expect(containsToken('a/shot-000007-energy/values', 'shot-000007')).toBe(
      true
    )
    expect(containsToken('a/shot-0000070/values', 'shot-000007')).toBe(false)
    expect(containsToken('a/xshot-000007/values', 'shot-000007')).toBe(false)
    expect(containsToken('shot-000007', 'shot-000007')).toBe(true)
  })
})

describe('splitShotDatasets', () => {
  const campaignFile = [
    // The shot's container, as list_container_datasets names it.
    '20260701_000007/instrument/camera_1/data',
    '20260701_000007/instrument/spectrometer/spectrum',
    // Another shot's container: same number, another day; another number.
    '20260702_000007/instrument/camera_1/data',
    '20260701_000017/instrument/camera_1/data',
    // Event values the builder writes (the emulator's event ids).
    `entry/laserdata/pulse_energy_j/laserdata-${CAMPAIGN}-shot-000007-energy/values`,
    `entry/laserdata/waveform/laserdata-${CAMPAIGN}-shot-000007-waveform/values`,
    `entry/laserdata/pulse_energy_j/laserdata-${CAMPAIGN}-shot-000017-energy/values`,
    `entry/laserdata/pulse_energy_j/laserdata-${CAMPAIGN}-shot-000070-energy/values`,
    // Campaign tables.
    'entry/shots/shot_number',
    'entry/source_events/event_id',
    'entry/shot_containers/container',
  ].map(ds)

  it('keeps the container and the emulator datasets of shot 7 only', () => {
    const split = splitShotDatasets(shot(), campaignFile)
    expect(names(split.shot)).toEqual([
      '20260701_000007/instrument/camera_1/data',
      '20260701_000007/instrument/spectrometer/spectrum',
      `entry/laserdata/pulse_energy_j/laserdata-${CAMPAIGN}-shot-000007-energy/values`,
      `entry/laserdata/waveform/laserdata-${CAMPAIGN}-shot-000007-waveform/values`,
    ])
    expect(split.rest).toHaveLength(campaignFile.length - 4)
    expect(names(split.rest)).toContain(
      `entry/laserdata/pulse_energy_j/laserdata-${CAMPAIGN}-shot-000017-energy/values`
    )
    expect(names(split.rest)).toContain(
      `entry/laserdata/pulse_energy_j/laserdata-${CAMPAIGN}-shot-000070-energy/values`
    )
  })

  it('prefers the shot’s own event ids over its shot-number token', () => {
    // Day two's shot 7: its events name it, and day one's shot-000007
    // datasets are not its own.
    const dayTwo = shot({
      shot_key: `${CAMPAIGN}:20260702:000007`,
      fired_at: '2026-07-02T09:00:00Z',
      events: [
        {
          event_id: `laserdata-${CAMPAIGN}-d2-shot-000007-energy`,
          source: 'LaserData',
          kind: 'pulse_energy_j',
          timestamp: '2026-07-02T09:00:01Z',
          payload_ref: {},
          metadata: {},
        },
      ],
    })
    const datasets = [
      ...campaignFile,
      ds(
        `entry/laserdata/pulse_energy_j/laserdata-${CAMPAIGN}-d2-shot-000007-energy/values`
      ),
    ]
    expect(names(splitShotDatasets(dayTwo, datasets).shot)).toEqual([
      '20260702_000007/instrument/camera_1/data',
      `entry/laserdata/pulse_energy_j/laserdata-${CAMPAIGN}-d2-shot-000007-energy/values`,
    ])
  })

  it('matches a data product’s dataset with or without the leading slash', () => {
    const withProduct = shot({
      metadata: {},
      data_products: [
        {
          source: 'LaserData',
          kind: 'hdf5_dataset',
          dataset_name: '/entry/laserdata/custom/abc/values',
          shape: [4],
          metadata: {},
        },
      ],
    })
    expect(
      names(
        splitShotDatasets(withProduct, [
          ds('entry/laserdata/custom/abc/values'),
          ds('entry/laserdata/custom/abd/values'),
        ]).shot
      )
    ).toEqual(['entry/laserdata/custom/abc/values'])
  })

  it('uses the detail’s container and a sanitized shot key', () => {
    const odd = shot({ shot_key: 'odd:key', metadata: {} })
    expect(
      names(
        splitShotDatasets(
          odd,
          [ds('custom_stem/entry/x'), ds('entry/odd_key/y'), ds('entry/z')],
          'custom_stem'
        ).shot
      )
    ).toEqual(['custom_stem/entry/x', 'entry/odd_key/y'])
  })

  it('ignores a bare numeric shot id', () => {
    const numeric = shot({ shot_key: undefined, metadata: { shot_id: '7' } })
    expect(
      splitShotDatasets(numeric, [ds('entry/derived/7/values')]).shot
    ).toEqual([])
  })
})

describe('buildShotDatasetTree', () => {
  it('groups by path segments, folds single-folder chains, folders first', () => {
    const tree = buildShotDatasetTree(
      [
        `entry/laserdata/pulse_energy_j/laserdata-${CAMPAIGN}-shot-000007-energy/values`,
        `entry/laserdata/waveform/laserdata-${CAMPAIGN}-shot-000007-waveform/values`,
        '20260701_000007/instrument/camera_1/data',
        '20260701_000007/notes',
      ].map(ds)
    )
    expect(tree.map((node) => node.label)).toEqual([
      '20260701_000007',
      'entry/laserdata',
    ])
    const [container, laser] = tree
    expect(container.children.map((node) => node.label)).toEqual([
      'instrument/camera_1',
      'notes',
    ])
    expect(container.children[1].dataset?.name).toBe('20260701_000007/notes')
    expect(laser.children.map((node) => node.label)).toEqual([
      `pulse_energy_j/laserdata-${CAMPAIGN}-shot-000007-energy`,
      `waveform/laserdata-${CAMPAIGN}-shot-000007-waveform`,
    ])
    expect(countShotDatasets(laser)).toBe(2)
  })
})

describe('safeHdf5Name', () => {
  it('replaces what HDF5 names drop', () => {
    expect(safeHdf5Name('demo:20260701:000007')).toBe('demo_20260701_000007')
  })
})
