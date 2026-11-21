import { describe, expect, it } from 'vitest'

import { buildComputedFieldSnippet } from '../context'
import { buildHdf5DatasetOptions, hdf5PerShotTemplateName } from '../hdf5'

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

describe('shot containers', () => {
  it("fold a container's datasets into one {container} template", () => {
    expect(hdf5PerShotTemplateName('20261121_000103/instrument/cam/data')).toBe(
      '{container}/instrument/cam/data'
    )
    // a date-like folder deeper in the file is not a container link
    expect(hdf5PerShotTemplateName('entry/20261121_000103/data')).toBeNull()
    expect(hdf5PerShotTemplateName('20261121_000103')).toBeNull()
  })

  it("previews the example shot's own container copy", () => {
    const [option] = buildHdf5DatasetOptions(
      [
        {
          name: '20261121_000103/instrument/cam/data',
          shape: [8, 8],
          dtype: 'uint16',
        },
      ],
      'shot'
    )
    expect(option.value).toBe('hdf5:{container}/instrument/cam/data')
    expect(option.previewName).toBe('20261121_000103/instrument/cam/data')
  })
})

describe('the column a container template writes', () => {
  const code = buildComputedFieldSnippet({
    fieldKind: 'hdf5',
    contextScope: 'shot',
    fieldName: 'cam_mean',
    fieldTitle: 'Camera mean',
    selectedInputs: ['hdf5:{container}/instrument/cam/data'],
    mongoCollection: '',
    mongoFilter: '',
    combineExpression: '',
  })

  it("asks for the shot's container and reads its copy", () => {
    expect(code).toContain(
      'def cam_mean(run, hdf5_path: "meta#hdf5_path", container: "meta#shot_container"):'
    )
    expect(code).toContain('dataset_name = f"{container}/instrument/cam/data"')
  })

  it('skips a shot without that dataset instead of failing', () => {
    expect(code).toContain('if dataset_name not in handle:')
    expect(code).toContain('raise Skip(f"No {dataset_name} for this shot")')
  })

  it('leaves a fixed path as it was', () => {
    const fixed = buildComputedFieldSnippet({
      fieldKind: 'hdf5',
      contextScope: 'shot',
      fieldName: 'energy',
      fieldTitle: 'Energy',
      selectedInputs: ['hdf5:entry/shots/energy'],
      mongoCollection: '',
      mongoFilter: '',
      combineExpression: '',
    })
    expect(fixed).toContain('dataset_name = "entry/shots/energy"')
    expect(fixed).not.toContain('not in handle')
    expect(fixed).toContain('def energy(run, hdf5_path: "meta#hdf5_path"):')
  })
})
