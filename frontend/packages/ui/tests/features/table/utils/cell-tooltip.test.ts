import { describe, expect, test } from 'vitest'

import { cellTooltip } from '#src/features/table/utils/cell-tooltip'
import { serverCell } from '#tests/support/cells'

const RUN = { database: '900485', proposal: '900485', run: 12 }
const IMAGE = 'data:image/png;base64,iVBORw0KGgo='
const MIDDLE = { normalizedX: 0.5 }

describe('cellTooltip', () => {
  test('shows an error before the value', () => {
    const error = {
      cls: 'KeyError',
      message: "No source 'SA1_XTD2_XGM/XGM/DOOCS'",
    }
    const cell = serverCell({
      ...RUN,
      name: 'detector',
      value: IMAGE,
      dtype: 'image',
      error,
    })

    expect(cellTooltip(cell, MIDDLE)).toEqual({ kind: 'error', error })
  })

  test('shows an image', () => {
    const cell = serverCell({
      ...RUN,
      name: 'detector',
      value: IMAGE,
      dtype: 'image',
    })

    expect(cellTooltip(cell, MIDDLE)).toEqual({ kind: 'image', src: IMAGE })
  })

  test('shows nothing for an image with no data', () => {
    const cell = serverCell({
      ...RUN,
      name: 'detector',
      value: '',
      dtype: 'image',
    })

    expect(cellTooltip(cell, MIDDLE)).toBeUndefined()
  })

  // Four points sit a third of the way apart, so 0.37 is nearest the second.
  test('shows the sparkline point under the pointer', () => {
    const g2 = { x: [0.1, 0.2, 0.4, 0.8], y: [1.3, 1.21, 1.08, 1.02] }
    const cell = serverCell({ ...RUN, name: 'g2', value: g2, dtype: 'array1d' })

    expect(cellTooltip(cell, { normalizedX: 0.37 })).toEqual({
      kind: 'sparkline',
      x: 0.2,
      y: 1.21,
    })
  })

  test('shows nothing for an empty array', () => {
    const empty = { x: [], y: [] }
    const cell = serverCell({
      ...RUN,
      name: 'g2',
      value: empty,
      dtype: 'array1d',
    })

    expect(cellTooltip(cell, MIDDLE)).toBeUndefined()
  })

  test('shows nothing for a number', () => {
    const cell = serverCell({ ...RUN, name: 'photon_energy', value: 9.3 })

    expect(cellTooltip(cell, MIDDLE)).toBeUndefined()
  })
})
