import { describe, expect, it } from 'vitest'

import { buildHdf5DatasetOptions } from '../hdf5'

describe('per-shot preview follows the example shot', () => {
  const datasets = ['shot-000001', 'shot-000007', 'shot-000016'].map((id) => ({
    name: `fixtures/by_shot/${id}/images/camera_raw`,
    shape: [64, 64],
    dtype: 'float32',
  }))

  it('previews the example shot’s own copy, not the last one listed', () => {
    const [option] = buildHdf5DatasetOptions(datasets, 'shot', 'shot-000007')
    expect(option.name).toBe('fixtures/by_shot/{shot_id}/images/camera_raw')
    expect(option.previewName).toBe(
      'fixtures/by_shot/shot-000007/images/camera_raw'
    )
  })

  it('falls back to a listed copy when the shot has none', () => {
    const [option] = buildHdf5DatasetOptions(datasets, 'shot', 'shot-000099')
    expect(option.previewName).toMatch(/^fixtures\/by_shot\/shot-0000/)
  })
})
