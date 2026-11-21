import { afterEach, describe, expect, it } from 'vitest'

import type { ColumnSuggestion } from '../../types'
import {
  appendSuggestionBlocks,
  datasetSuggestions,
  inputFormState,
  isAlreadyInContext,
  loadIgnoredSuggestions,
  saveIgnoredSuggestions,
  suggestionFormState,
  suggestionSummary,
} from '../contextAssist'
import { buildHdf5DatasetOptions } from '../hdf5'

const suggestion = (
  overrides: Partial<ColumnSuggestion> = {}
): ColumnSuggestion => ({
  id: 'labfrog:ICT charge',
  title: 'ICT charge (nC)',
  function: 'ict_charge',
  origin: 'labfrog',
  originLabel: 'LabFrog record',
  field: 'labfrog_variables.ICT charge.value',
  path: 'meta#labfrog_variables.ICT charge.value',
  type: 'number',
  unit: 'nC',
  count: 9,
  total: 10,
  examples: ['1.5'],
  reason: 'Recorded on 9 of 10 shots',
  starter: true,
  block: '',
  display: 'number',
  displayLabel: 'Number column',
  displayHelp: '',
  ...overrides,
})

afterEach(() => window.localStorage.clear())

describe('datasetSuggestions', () => {
  it('offers images, lineouts and scalars with the matching preview', () => {
    const options = buildHdf5DatasetOptions(
      [
        { name: 'cam/image', shape: [64, 64], dtype: 'uint16' },
        { name: 'spectrometer/lineout', shape: [512], dtype: 'float64' },
        { name: 'ict/charge', shape: [], dtype: 'float64' },
        { name: 'notes', shape: [], dtype: 'string' },
      ],
      'shot'
    )
    const suggestions = datasetSuggestions(options, 'shot 3')
    expect(suggestions.map((entry) => [entry.title, entry.display])).toEqual([
      ['Image', 'image-preview'],
      ['Lineout', 'lineout-preview'],
      ['Charge', 'hdf5'],
    ])
    expect(suggestions[0].reason).toContain('shot 3')
    expect(suggestions[0].block).toContain('def image(')
    expect(suggestions[0].block).toContain('"cam/image"')
  })

  it('keeps function names unique when datasets share a name', () => {
    const options = buildHdf5DatasetOptions(
      [
        { name: 'a/signal', shape: [8], dtype: 'float64' },
        { name: 'b/signal', shape: [8], dtype: 'float64' },
      ],
      'shot'
    )
    expect(
      datasetSuggestions(options, 'x').map((entry) => entry.function)
    ).toEqual(['signal', 'signal_2'])
  })
})

describe('isAlreadyInContext', () => {
  it('matches the data the file reads, not a shared function name', () => {
    const entry = suggestion()
    expect(isAlreadyInContext(entry, '')).toBe(false)
    expect(
      isAlreadyInContext(
        entry,
        "def x(run, value: 'meta#labfrog_variables.ICT charge.value' = None):"
      )
    ).toBe(true)
    // a column that only shares the name reads other data
    expect(
      isAlreadyInContext(entry, 'def ict_charge(run, value: "meta#other"):')
    ).toBe(false)
    // a longer path that only starts with this one is a different field
    expect(
      isAlreadyInContext(
        entry,
        '"meta#labfrog_variables.ICT charge.value.extra"'
      )
    ).toBe(false)
  })
})

describe('suggestionFormState', () => {
  it('maps metadata and HDF5 suggestions onto builder inputs', () => {
    expect(suggestionFormState(suggestion())).toEqual({
      fieldKind: 'metadata',
      selectedInputs: ['metadata:labfrog_variables.ICT charge.value'],
      fieldTitle: 'ICT charge (nC)',
    })
    expect(
      suggestionFormState(
        suggestion({
          origin: 'hdf5',
          field: 'cam/image',
          display: 'image-preview',
          title: 'Image',
        })
      )
    ).toEqual({
      fieldKind: 'image-preview',
      selectedInputs: ['hdf5:cam/image'],
      fieldTitle: 'Image',
    })
  })
})

describe('ignored suggestions', () => {
  it('are remembered per campaign and survive bad storage', () => {
    saveIgnoredSuggestions('radbio', ['labfrog:a'])
    expect(loadIgnoredSuggestions('radbio')).toEqual(['labfrog:a'])
    expect(loadIgnoredSuggestions('other')).toEqual([])
    saveIgnoredSuggestions('radbio', [])
    expect(
      window.localStorage.getItem('hzdr.contextAssist.ignored.radbio')
    ).toBe(null)
    window.localStorage.setItem('hzdr.contextAssist.ignored.radbio', '{bad')
    expect(loadIgnoredSuggestions('radbio')).toEqual([])
  })
})

const block = (
  name: string,
  field: string
) => `from damnit_ctx import Skip, Variable


@Variable(title='${name}')
def ${name}(run, value: 'meta#${field}' = None):
    return float(value)
`

const shot = (value: unknown, number = 1) => ({
  source_key: 'c',
  shot_number: number,
  fired_at: '2026-07-01T09:12:00Z',
  metadata: { labfrog_variables: { 'ICT charge': { value } } },
  events: [],
  data_products: [],
})

describe('suggestionSummary', () => {
  it('gives the shots recorded and the range of values', () => {
    const shots = [shot('0,836', 1), shot(0.924, 2), shot(null, 3)]
    expect(suggestionSummary(suggestion(), shots)).toBe(
      '2 of 3 shots · 0.836–0.924 nC'
    )
    expect(suggestionSummary(suggestion(), [shot(2)])).toBe(
      '1 of 1 shots · 2 nC'
    )
    expect(
      suggestionSummary(suggestion({ type: 'text', unit: '' }), [
        shot('A', 1),
        shot('B', 2),
        shot('A', 3),
      ])
    ).toBe('3 of 3 shots · 2 labels')
  })

  it('falls back to the suggestion’s own counts, and describes datasets', () => {
    expect(suggestionSummary(suggestion(), [])).toBe('9 of 10 shots · e.g. 1.5')
    expect(
      suggestionSummary(suggestion({ origin: 'hdf5', type: 'image' }), [])
    ).toBe('An image on the example shot')
  })
})

describe('appendSuggestionBlocks', () => {
  it('appends every new block once, imports at the top', () => {
    const start =
      'from damnit_ctx import Variable\n\n\n@Variable(title="A")\ndef a(run):\n    return 1\n'
    const one = suggestion({
      id: 'labfrog:x',
      path: 'meta#labfrog_variables.x.value',
      block: block('x', 'labfrog_variables.x.value'),
    })
    const two = suggestion({
      id: 'labfrog:y',
      path: 'meta#labfrog_variables.y.value',
      block: block('x', 'labfrog_variables.y.value'),
    })
    const { fileContent, added, skipped } = appendSuggestionBlocks(start, [
      one,
      two,
      // the same data twice: added once
      { ...one, id: 'labfrog:x-again' },
    ])
    expect(added.map((entry) => entry.id)).toEqual(['labfrog:x', 'labfrog:y'])
    expect(skipped.map((entry) => entry.id)).toEqual(['labfrog:x-again'])
    // the second block's function name is made unique
    expect(fileContent).toContain('def x(run')
    expect(fileContent).toContain('def x_2(run')
    expect(fileContent.match(/import Skip, Variable/g)).toHaveLength(1)
    expect(fileContent.indexOf('import Skip')).toBeLessThan(
      fileContent.indexOf('@Variable')
    )
  })

  it('skips what the file already reads', () => {
    const one = suggestion({
      block: block('x', 'labfrog_variables.ICT charge.value'),
    })
    const start = `x = "meta#labfrog_variables.ICT charge.value"\n`
    const result = appendSuggestionBlocks(start, [one])
    expect(result.added).toEqual([])
    expect(result.fileContent).toBe(start)
  })
})

describe('inputFormState', () => {
  const datasetOptions = buildHdf5DatasetOptions(
    [
      { name: 'cam/image', shape: [64, 64], dtype: 'uint16' },
      { name: 'spec/line', shape: [100], dtype: 'float64' },
    ],
    'shot'
  )
  const context = {
    metadataKeys: new Set(['labfrog_variables.ICT charge.value']),
    datasetOptions,
  }

  it('reads a recorded field or a dataset in the builder’s input format', () => {
    expect(
      inputFormState('metadata:labfrog_variables.ICT charge.value', context)
    ).toEqual({
      fieldKind: 'metadata',
      selectedInputs: ['metadata:labfrog_variables.ICT charge.value'],
      fieldTitle: 'ICT charge',
    })
    expect(inputFormState('hdf5:cam/image', context)).toEqual({
      fieldKind: 'image-preview',
      selectedInputs: ['hdf5:cam/image'],
      fieldTitle: 'Image',
    })
    expect(inputFormState('hdf5:/spec/line', context)?.fieldKind).toBe(
      'lineout-preview'
    )
  })

  it('returns null for what the campaign does not have', () => {
    expect(inputFormState('metadata:nope', context)).toBeNull()
    expect(inputFormState('hdf5:nope', context)).toBeNull()
    expect(inputFormState('mongo:shots', context)).toBeNull()
    expect(inputFormState('', context)).toBeNull()
  })
})
