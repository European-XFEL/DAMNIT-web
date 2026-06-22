import type { PlotlyPreview } from '../types'

export function decodePlotlyTypedArrays(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(decodePlotlyTypedArrays)
  }
  if (isEncodedPlotlyArray(value)) {
    return decodeBase64Array(value.dtype, value.bdata)
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        decodePlotlyTypedArrays(entry),
      ])
    )
  }
  return value
}

export function isEncodedPlotlyArray(value: unknown): value is {
  dtype: string
  bdata: string
} {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    typeof (value as { dtype?: unknown }).dtype === 'string' &&
    typeof (value as { bdata?: unknown }).bdata === 'string'
  )
}

export function decodeBase64Array(dtype: string, bdata: string) {
  const binary = globalThis.atob(bdata)
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  )
  switch (dtype) {
    case 'f8':
      return Array.from(new Float64Array(buffer))
    case 'f4':
      return Array.from(new Float32Array(buffer))
    case 'i1':
      return Array.from(new Int8Array(buffer))
    case 'i2':
      return Array.from(new Int16Array(buffer))
    case 'i4':
      return Array.from(new Int32Array(buffer))
    case 'u1':
      return Array.from(new Uint8Array(buffer))
    case 'u2':
      return Array.from(new Uint16Array(buffer))
    case 'u4':
      return Array.from(new Uint32Array(buffer))
    default:
      return []
  }
}

export function getPlotlySparklineValues(preview: unknown) {
  if (!isPlotlyPreview(preview)) {
    return []
  }
  try {
    const figure = decodePlotlyTypedArrays(JSON.parse(preview.json)) as {
      data?: Array<{ y?: unknown }>
    }
    const yValues = figure.data?.find((trace) => Array.isArray(trace.y))?.y
    if (!Array.isArray(yValues)) {
      return []
    }
    return yValues
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value))
  } catch {
    return []
  }
}

export function isPlotlyPreview(preview: unknown): preview is PlotlyPreview {
  return (
    Boolean(preview) &&
    typeof preview === 'object' &&
    (preview as { kind?: unknown }).kind === 'plotly' &&
    typeof (preview as { json?: unknown }).json === 'string'
  )
}
