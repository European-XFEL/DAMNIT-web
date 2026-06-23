import { describe, it, expect } from 'vitest'
import {
  isEncodedPlotlyArray,
  decodeBase64Array,
  isPlotlyPreview,
  decodePlotlyTypedArrays,
  getPlotlySparklineValues,
} from '../plotly'

function encodeFloat64(values: number[]): string {
  const buffer = new Float64Array(values).buffer
  const bytes = new Uint8Array(buffer)
  return btoa(String.fromCharCode(...bytes))
}

function encodeUint8(values: number[]): string {
  const bytes = new Uint8Array(values)
  return btoa(String.fromCharCode(...bytes))
}

describe('isEncodedPlotlyArray', () => {
  it('returns true for an object with dtype and bdata strings', () => {
    expect(isEncodedPlotlyArray({ dtype: 'f8', bdata: 'AAAA' })).toBe(true)
  })

  it('returns false for plain objects', () => {
    expect(isEncodedPlotlyArray({ x: 1 })).toBe(false)
  })

  it('returns false for null', () => {
    expect(isEncodedPlotlyArray(null)).toBe(false)
  })

  it('returns false for arrays', () => {
    expect(isEncodedPlotlyArray([1, 2, 3])).toBe(false)
  })
})

describe('decodeBase64Array', () => {
  it('decodes f8 (Float64) data correctly', () => {
    const original = [1.5, 2.5, 3.5]
    const bdata = encodeFloat64(original)
    const decoded = decodeBase64Array('f8', bdata)
    expect(decoded).toEqual(original)
  })

  it('decodes u1 (Uint8) data correctly', () => {
    const original = [0, 128, 255]
    const bdata = encodeUint8(original)
    const decoded = decodeBase64Array('u1', bdata)
    expect(decoded).toEqual(original)
  })

  it('returns empty array for unknown dtype', () => {
    expect(decodeBase64Array('unknown', 'AAAA')).toEqual([])
  })
})

describe('isPlotlyPreview', () => {
  it('returns true for valid plotly preview shape', () => {
    expect(isPlotlyPreview({ kind: 'plotly', json: '{}' })).toBe(true)
  })

  it('returns false for non-plotly kind', () => {
    expect(isPlotlyPreview({ kind: 'image', json: '{}' })).toBe(false)
  })

  it('returns false for missing json', () => {
    expect(isPlotlyPreview({ kind: 'plotly' })).toBe(false)
  })

  it('returns false for null', () => {
    expect(isPlotlyPreview(null)).toBe(false)
  })
})

describe('decodePlotlyTypedArrays', () => {
  it('passes through scalars unchanged', () => {
    expect(decodePlotlyTypedArrays(42)).toBe(42)
    expect(decodePlotlyTypedArrays('hello')).toBe('hello')
  })

  it('recursively decodes encoded arrays inside objects', () => {
    const encoded = encodeFloat64([1.0, 2.0])
    const input = { data: [{ y: { dtype: 'f8', bdata: encoded } }] }
    const result = decodePlotlyTypedArrays(input) as {
      data: Array<{ y: number[] }>
    }
    expect(result.data[0].y).toEqual([1.0, 2.0])
  })

  it('handles plain arrays by mapping recursively', () => {
    expect(decodePlotlyTypedArrays([1, 2, 3])).toEqual([1, 2, 3])
  })
})

describe('getPlotlySparklineValues', () => {
  it('returns empty array for non-plotly input', () => {
    expect(getPlotlySparklineValues(null)).toEqual([])
    expect(getPlotlySparklineValues({ kind: 'image' })).toEqual([])
  })

  it('extracts y values from the first trace that has an array y', () => {
    const figure = { data: [{ y: [1, 2, 3] }] }
    const preview = { kind: 'plotly', json: JSON.stringify(figure) }
    expect(getPlotlySparklineValues(preview)).toEqual([1, 2, 3])
  })

  it('filters out non-numeric string values', () => {
    const figure = { data: [{ y: [1, 'bad', 'n/a', 2] }] }
    const preview = { kind: 'plotly', json: JSON.stringify(figure) }
    expect(getPlotlySparklineValues(preview)).toEqual([1, 2])
  })

  it('returns empty array for malformed JSON', () => {
    const preview = { kind: 'plotly', json: 'not json' }
    expect(getPlotlySparklineValues(preview)).toEqual([])
  })
})
