import { describe, expect, it } from 'vitest'

import type { HZDRShot } from '../../types'
import { buildShotDayLabels } from '../filter'
import {
  countShotQuickFilters,
  shotDayOptions,
  shotMatchesStatusFilter,
} from '../shot-quick-filter'
import { previewableProductDataset, shotAddColumnPath } from '../shot-products'
import { isTableArrowKey, shouldIgnoreTableArrowKey } from '../shot-keyboard'

const shot = (number: number, day: string, status: string): HZDRShot => ({
  source_key: 'demo',
  shot_number: number,
  fired_at: `${day}T10:00:00Z`,
  shot_key: `demo:${day.replace(/-/g, '')}:${String(number).padStart(6, '0')}`,
  metadata: { status },
  events: [],
  data_products: [],
})

describe('shot quick filters', () => {
  const shots = [
    shot(1, '2026-07-01', 'processed'),
    shot(2, '2026-07-01', 'needs-review'),
    shot(3, '2026-07-02', 'needs-review'),
    shot(4, '2026-07-02', 'revision-needed'),
  ]
  const labels = buildShotDayLabels(shots)

  it('lists the days in order and counts each chip within the other', () => {
    const days = shotDayOptions(shots, labels)
    expect(days).toEqual(['Day 1', 'Day 2'])
    expect(
      countShotQuickFilters(shots, { status: 'all', day: '' }, labels, days)
    ).toEqual({
      status: { all: 4, 'needs-review': 2, 'revision-needed': 1 },
      allDays: 4,
      day: { 'Day 1': 2, 'Day 2': 2 },
    })
    expect(
      countShotQuickFilters(
        shots,
        { status: 'needs-review', day: 'Day 2' },
        labels,
        days
      )
    ).toEqual({
      status: { all: 2, 'needs-review': 1, 'revision-needed': 1 },
      allDays: 2,
      day: { 'Day 1': 1, 'Day 2': 1 },
    })
  })

  it('matches the status value exactly', () => {
    expect(shotMatchesStatusFilter(shots[1], 'needs-review')).toBe(true)
    expect(shotMatchesStatusFilter(shots[1], 'revision-needed')).toBe(false)
    expect(shotMatchesStatusFilter(shots[1], 'all')).toBe(true)
  })
})

describe('previewable data products', () => {
  const product = {
    source: 'LaserData',
    kind: 'hdf5_dataset',
    dataset_name: '/entry/laserdata/waveform/ev-1/values',
    preview_kind: 'line',
    shape: [256],
    metadata: {},
  }

  it('previews in-file scalars, lines and images, without the slash', () => {
    expect(previewableProductDataset(product)).toBe(
      'entry/laserdata/waveform/ev-1/values'
    )
    expect(
      previewableProductDataset({
        ...product,
        preview_kind: undefined,
        shape: [4, 4],
      })
    ).toBe('entry/laserdata/waveform/ev-1/values')
  })

  it('previews a product whose path is the campaign file itself', () => {
    const campaignFile = '/bigdata/nexus/Pilot/Pilot.nxs'
    expect(
      previewableProductDataset(
        { ...product, path: campaignFile },
        campaignFile
      )
    ).toBe('entry/laserdata/waveform/ev-1/values')
    // the same file recorded under another host's mount
    expect(
      previewableProductDataset(
        { ...product, path: 'Z:/bigdata/nexus/Pilot/Pilot.nxs' },
        campaignFile
      )
    ).toBe('entry/laserdata/waveform/ev-1/values')
    expect(
      previewableProductDataset(
        { ...product, path: '/data/a.h5' },
        campaignFile
      )
    ).toBe(undefined)
  })

  it('skips files, stacks and LabFrog tables of every shot', () => {
    expect(previewableProductDataset({ ...product, path: '/data/a.h5' })).toBe(
      undefined
    )
    expect(
      previewableProductDataset({ ...product, preview_kind: 'stack' })
    ).toBe(undefined)
    expect(
      previewableProductDataset({
        ...product,
        metadata: { shot_indexed: true },
      })
    ).toBe(undefined)
    expect(
      previewableProductDataset({ ...product, dataset_name: undefined })
    ).toBe(undefined)
  })

  it('links Context Builder with the per-shot template and the shot', () => {
    const path = shotAddColumnPath(
      'demo',
      'fixtures/by_shot/shot 7/images/camera_raw',
      'demo:20260701:000007'
    )
    expect(path).toBe(
      '/source/demo/context-builder?add=hdf5:fixtures/by_shot/{shot_id}/images/camera_raw&shot=demo:20260701:000007'
    )
    const params = new URL(path!, 'http://x').searchParams
    expect(params.get('add')).toBe(
      'hdf5:fixtures/by_shot/{shot_id}/images/camera_raw'
    )
    expect(params.get('shot')).toBe('demo:20260701:000007')
  })

  it('offers no column for a dataset named for one shot', () => {
    // an event's values would repeat this shot's value in every row
    expect(
      shotAddColumnPath('demo', 'entry/laserdata/waveform/ev-1/values')
    ).toBe(undefined)
  })

  it("offers a column of each shot's container dataset", () => {
    expect(
      shotAddColumnPath(
        'demo',
        '20260701_000007/instrument/camera/data',
        'demo:20260701:000007'
      )
    ).toBe(
      '/source/demo/context-builder?add=hdf5:{container}/instrument/camera/data&shot=demo:20260701:000007'
    )
  })
})

describe('table arrow keys', () => {
  const key = (name: string, extra = {}) => ({
    key: name,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...extra,
  })

  it('moves on plain Up and Down only', () => {
    expect(isTableArrowKey(key('ArrowDown'))).toBe(true)
    expect(isTableArrowKey(key('ArrowUp'))).toBe(true)
    expect(isTableArrowKey(key('ArrowLeft'))).toBe(false)
    expect(isTableArrowKey(key('ArrowDown', { shiftKey: true }))).toBe(false)
    expect(isTableArrowKey(key('ArrowDown', { defaultPrevented: true }))).toBe(
      false
    )
  })

  it('leaves inputs, selects and comboboxes their own keys', () => {
    const input = document.createElement('input')
    const select = document.createElement('select')
    const combo = document.createElement('div')
    combo.setAttribute('role', 'combobox')
    const inside = document.createElement('span')
    combo.appendChild(inside)
    const button = document.createElement('button')
    expect(shouldIgnoreTableArrowKey(input)).toBe(true)
    expect(shouldIgnoreTableArrowKey(select)).toBe(true)
    expect(shouldIgnoreTableArrowKey(inside)).toBe(true)
    expect(shouldIgnoreTableArrowKey(button)).toBe(false)
    expect(shouldIgnoreTableArrowKey(null)).toBe(true)
  })
})
