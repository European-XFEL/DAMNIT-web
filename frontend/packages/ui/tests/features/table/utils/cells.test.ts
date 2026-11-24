import { describe, expect, onTestFinished, test, vi } from 'vitest'
import {
  GridCellKind,
  type GridCell,
  type ImageCell,
  type TextCell,
} from '@glideapps/glide-data-grid'

import {
  arrayCell,
  dateCell,
  errorCell,
  getCell,
  GRID_RENDERERS,
  imageCell,
  loadingCell,
  makeCellRenderers,
  numberCell,
  textCell,
  toSparkline,
} from '#src/features/table/utils/cells'
import { DEFAULT_COLUMN_WIDTH } from '#src/features/table/utils/column-widths'
import { DTYPES } from '#src/constants'

describe('getCell', () => {
  // Only a heavy dtype is ever held back by @lightweight, so only a heavy null
  // has a value still on its way.
  test('renders a loading cell for a missing heavy value', () => {
    expect(
      getCell({ value: undefined, dtype: DTYPES.image, options: {} }).kind
    ).toBe(GridCellKind.Loading)
    expect(
      getCell({ value: undefined, dtype: DTYPES.array1d, options: {} }).kind
    ).toBe(GridCellKind.Loading)
  })

  // A missing scalar is a genuinely empty cell, not a pending fetch, so it
  // renders blank instead of spinning forever.
  test('renders an empty cell for a missing scalar, not a loading one', () => {
    const cell = getCell({ value: null, dtype: DTYPES.number, options: {} })

    expect(cell.kind).toBe(GridCellKind.Text)
    expect((cell as TextCell).displayData).toBe('')
  })

  test('picks the cell type from the dtype when a value is present', () => {
    expect(
      getCell({ value: 3.14159, dtype: DTYPES.number, options: {} }).kind
    ).toBe(GridCellKind.Number)
    expect(
      getCell({ value: 'hi', dtype: DTYPES.string, options: {} }).kind
    ).toBe(GridCellKind.Text)
  })

  // A dtype with no renderer (a boolean cell has none) must not throw: the grid
  // asks getContent for every visible cell, so one would break the whole table.
  test('falls back to a text cell for a dtype with no renderer', () => {
    const cell = getCell({ value: false, dtype: 'boolean', options: {} })

    expect(cell.kind).toBe(GridCellKind.Text)
    expect((cell as TextCell).displayData).toBe('false')
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

describe('textCell', () => {
  test('stringifies a truthy value', () => {
    const cell = textCell('hello')
    expect(cell.data).toBe('hello')
    expect(cell.displayData).toBe('hello')
  })

  // The unknown-dtype fallback routes through here, so a false or a zero is a
  // real value the grid still has to show, not an absent one.
  test('stringifies a falsy value rather than blanking it', () => {
    expect(textCell(0).displayData).toBe('0')
    expect(textCell(false).displayData).toBe('false')
  })

  test('renders an empty string for a missing value', () => {
    expect(textCell(null).displayData).toBe('')
    expect(textCell(undefined).displayData).toBe('')
  })
})

describe('toSparkline', () => {
  test('passes an x/y sparkline through', () => {
    const sparkline = { x: [0, 5], y: [3, 1] }
    expect(toSparkline(sparkline)).toBe(sparkline)
  })

  test('is undefined for a non-sparkline value', () => {
    expect(toSparkline('float64: (3,)')).toBeUndefined()
    expect(toSparkline(null)).toBeUndefined()
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

describe('GRID_RENDERERS', () => {
  const screenReaderText = (cell: ImageCell) =>
    GRID_RENDERERS.find(
      (renderer) => renderer.kind === GridCellKind.Image
    )?.getAccessibilityString(cell)

  test('reads an image cell as "image", not its data URI', () => {
    const cell = imageCell('data:image/png;base64,iVBORw0KGgo=')
    expect(screenReaderText(cell)).toBe('image')
  })

  test('reads an image cell with no image as nothing', () => {
    expect(screenReaderText(imageCell(42))).toBe('')
  })

  describe('a loading cell', () => {
    // measureInCellFont saves and restores the canvas around every measure.
    const canvas = { save() {}, restore() {} } as CanvasRenderingContext2D
    const measureAs = (kind: GridCellKind, cell: GridCell) =>
      GRID_RENDERERS.find((renderer) => renderer.kind === kind)?.measure?.(
        canvas,
        cell,
        {} as never
      )
    const loadingWidth = (cell: GridCell) =>
      measureAs(GridCellKind.Loading, cell)
    const loadingCellFor = (dtype: string) =>
      getCell({ value: undefined, dtype, options: {} })

    test('measures as wide as the image it stands in for', () => {
      const image = imageCell('http://x/y.png')
      const imageWidth = measureAs(GridCellKind.Image, image)

      expect(imageWidth).toBeGreaterThan(0)
      expect(loadingWidth(loadingCellFor(DTYPES.image))).toBe(imageWidth)
    })

    test('measures as wide as the sparkline it stands in for', () => {
      // The error renderer draws its glyphs into a DOM Image, which node lacks.
      vi.stubGlobal('Image', class {})
      onTestFinished(() => {
        vi.unstubAllGlobals()
      })
      const sparkline = arrayCell({ x: [0, 1, 2], y: [3, 1, 2] })

      // Glide types each custom renderer's measure as taking every custom cell.
      const sparklineWidth = makeCellRenderers({
        errorColors: { error: 'red', missing: 'gray', skipped: 'gray' },
        ringColor: 'gray',
        sparklineWidth: DEFAULT_COLUMN_WIDTH,
      })
        .find(
          (renderer) => 'isMatch' in renderer && renderer.isMatch(sparkline)
        )
        ?.measure?.(canvas, sparkline as never, {} as never)

      expect(sparklineWidth).toBeGreaterThan(0)
      expect(loadingWidth(loadingCellFor(DTYPES.array1d))).toBe(sparklineWidth)
    })

    test('measures 0 when the value it stands in for is unknown', () => {
      expect(loadingWidth(loadingCell(''))).toBe(0)
    })
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
