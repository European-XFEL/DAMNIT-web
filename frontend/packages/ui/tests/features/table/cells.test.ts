import { describe, expect, test } from 'vitest'
import { GridCellKind } from '@glideapps/glide-data-grid'

import {
  arrayCell,
  dateCell,
  errorCell,
  errorText,
  errorVisuals,
  getCell,
  imageCell,
  numberCell,
  textCell,
} from '@/features/table/cells'
import { DTYPES } from '@/constants'

describe('getCell', () => {
  // A missing value (null or undefined) always renders a loading skeleton,
  // whatever the declared dtype is.
  test('renders a loading cell when the value is missing', () => {
    expect(
      getCell({ value: undefined, dtype: DTYPES.number, options: {} }).kind
    ).toBe(GridCellKind.Loading)
    expect(
      getCell({ value: undefined, dtype: DTYPES.image, options: {} }).kind
    ).toBe(GridCellKind.Loading)
  })

  test('dispatches to a factory by dtype when a value is present', () => {
    expect(
      getCell({ value: 3.14159, dtype: DTYPES.number, options: {} }).kind
    ).toBe(GridCellKind.Number)
    expect(
      getCell({ value: 'hi', dtype: DTYPES.string, options: {} }).kind
    ).toBe(GridCellKind.Text)
  })
})

describe('numberCell', () => {
  test('rounds a float and mirrors it into displayData', () => {
    const cell = numberCell(3.14159)
    expect(cell.data).toBe(3.14)
    expect(cell.displayData).toBe('3.14')
  })

  test('passes an integer through', () => {
    const cell = numberCell(42)
    expect(cell.data).toBe(42)
    expect(cell.displayData).toBe('42')
  })

  test('leaves data undefined for a non-number but keeps displayData', () => {
    const cell = numberCell('n/a')
    expect(cell.data).toBeUndefined()
    expect(cell.displayData).toBe('n/a')
  })
})

describe('dateCell', () => {
  test('formats a numeric timestamp', () => {
    const cell = dateCell(Date.UTC(2023, 5, 9, 8, 5, 3))
    expect(cell.displayData).toBe('08:05:03 | 09 June 2023')
  })

  test('renders an empty string for a non-number', () => {
    expect(dateCell('nope').displayData).toBe('')
  })
})

describe('errorVisuals', () => {
  test('maps a skipped dependency', () => {
    expect(errorVisuals('Skip')).toEqual({
      kind: 'skipped',
      title: 'Missing dependency',
    })
  })

  test('maps missing source data', () => {
    expect(errorVisuals('SourceNameError')).toEqual({
      kind: 'missing',
      title: 'Missing data',
    })
  })

  test('falls back to a generic error for anything else', () => {
    expect(errorVisuals('ValueError')).toEqual({
      kind: 'error',
      title: 'Error',
    })
  })
})

describe('errorText', () => {
  test('joins the class and message with a newline', () => {
    expect(errorText({ cls: 'ValueError', message: 'boom' })).toBe(
      'ValueError\nboom'
    )
  })
})

describe('textCell', () => {
  test('stringifies a truthy value', () => {
    const cell = textCell('hello')
    expect(cell.data).toBe('hello')
    expect(cell.displayData).toBe('hello')
  })

  test('renders an empty string for the falsy 0', () => {
    const cell = textCell(0)
    expect(cell.data).toBe('')
    expect(cell.displayData).toBe('')
  })
})

describe('arrayCell', () => {
  test('carries the values and a [min, max] y-axis', () => {
    const cell = arrayCell([3, 1, 2])
    expect(cell.data.values).toEqual([3, 1, 2])
    expect(cell.data.yAxis).toEqual([1, 3])
  })

  test('is empty for a missing value', () => {
    const cell = arrayCell(undefined)
    expect(cell.data.values).toEqual([])
    expect(cell.data.yAxis).toEqual([0, 0])
  })
})

describe('imageCell', () => {
  test('wraps a string value in a single-item array', () => {
    expect(imageCell('http://x/y.png').data).toEqual(['http://x/y.png'])
  })

  test('is empty for a non-string value', () => {
    expect(imageCell(undefined).data).toEqual([])
    expect(imageCell(42).data).toEqual([])
  })
})

describe('errorCell', () => {
  test('uses errorText as its copy data', () => {
    const error = { cls: 'ValueError', message: 'boom' }
    const cell = errorCell(error)
    expect(cell.copyData).toBe('ValueError\nboom')
    expect(cell.data).toEqual({ kind: 'error-cell', error })
  })
})
