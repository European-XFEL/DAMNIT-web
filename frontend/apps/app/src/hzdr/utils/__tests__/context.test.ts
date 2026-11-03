import { describe, expect, it } from 'vitest'

import {
  buildComputedFieldSnippet,
  inferContextBuilderFormState,
  parseContextVariableBlocks,
} from '../context'
import { metadataFieldLabel } from '../metadata'

const base = {
  fieldKind: 'metadata',
  contextScope: 'shot',
  fieldName: 'energy',
  fieldTitle: 'Laser energy',
  selectedInputs: ['metadata:labfrog_variables.laser_energy.value'],
  mongoCollection: 'shots',
  mongoFilter: '{"shot_number": shot_number}',
  combineExpression: '',
}

describe('context column generation', () => {
  it('injects nested metadata directly and restores the same field when editing', () => {
    const code = buildComputedFieldSnippet(base)
    expect(code).toContain(
      'metadata_value: "meta#labfrog_variables.laser_energy.value"'
    )
    expect(code).not.toContain('mongo_find_one')
    expect(code).not.toContain('doc.get')
    const [block] = parseContextVariableBlocks(code)
    expect(inferContextBuilderFormState(block)).toMatchObject({
      fieldKind: 'metadata',
      selectedInputs: base.selectedInputs,
    })
  })

  it('only requests inputs actually selected for custom calculations', () => {
    const metadataOnly = buildComputedFieldSnippet({
      ...base,
      fieldKind: 'function',
    })
    expect(metadataOnly).not.toContain('hdf5_path:')
    expect(metadataOnly).toContain('return metadata_value')
    const dataOnly = buildComputedFieldSnippet({
      ...base,
      fieldKind: 'function',
      selectedInputs: ['hdf5:entry/signal'],
    })
    expect(dataOnly).not.toContain('metadata_value:')
    expect(dataOnly).toContain('return np.nanmean(hdf5_values)')
    const combined = buildComputedFieldSnippet({
      ...base,
      fieldKind: 'function',
      selectedInputs: [...base.selectedInputs, 'hdf5:entry/signal'],
      combineExpression: 'float(metadata_value) * np.nanmean(hdf5_values)',
    })
    expect(combined).toContain(
      'metadata_value: "meta#labfrog_variables.laser_energy.value"'
    )
    expect(combined).toContain('hdf5_path: "meta#hdf5_path"')
  })

  it('gives fields readable labels while retaining unit distinctions', () => {
    expect(metadataFieldLabel('labfrog_variables.target_name.value')).toBe(
      'Target name'
    )
    expect(metadataFieldLabel('labfrog_variables.laser_energy.unit')).toBe(
      'Laser energy / Unit'
    )
    expect(metadataFieldLabel('laser.pulse_energy')).toBe(
      'Laser / Pulse energy'
    )
  })
})
