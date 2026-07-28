import type {
  PREVIEW_ARRAY_DTYPES,
  PREVIEW_SCALAR_DTYPES,
} from '@damnit-frontend/shared/constants'

type TraceChannel<T> = {
  value: T
  name: string
}

export type PlotTrace = {
  x?: TraceChannel<number[]>
  y?: TraceChannel<number[]>
  z?: TraceChannel<number[][]>
  data?: TraceChannel<unknown>
}

type TraceMeta = {
  name: string
}

export type PlotMeta = {
  type: string

  // Traces
  x?: TraceMeta
  y?: TraceMeta
  z?: TraceMeta
  data?: TraceMeta

  // Optional: General
  shape?: number[]

  // Optional: 2D images
  colormap_range?: [number, number]
}

export type PlotData = {
  traces: PlotTrace[]
  meta: PlotMeta
}

// What the backend attaches to one run's value. Both named attributes describe
// that run alone: `shape` is its own array's, and `colormap_range` its own
// 1-99% quantiles. The rest is whatever the context file left on the array.
// `shape` has one entry for a 1-D array and two for anything else.
type PreviewAttrs = {
  shape?: number[]
  colormap_range?: [number, number]
  [attr: string]: unknown
}

type PreviewBase = {
  data: unknown
  name: string
  attrs?: PreviewAttrs
}

// A 1D or 2D numeric array: the backend sends these as a serialized DataArray,
// so they carry the dimensions and coordinates to plot the values against.
type PreviewArray = PreviewBase & {
  dtype: (typeof PREVIEW_ARRAY_DTYPES)[number]
  dims: string[]
  coords: { [dim: string]: number[] }
}

// A single value with nothing to plot it against. A picture arrives already
// rendered to a base64 png, and the rest are scalars; none has dimensions.
export type PreviewScalar = PreviewBase & {
  dtype: (typeof PREVIEW_SCALAR_DTYPES)[number]
}

// What extracted_data returns for one run and variable: the values, plus the
// metadata needed to plot them. The field is a JSON scalar, so `data` is the
// part no schema can describe and every reader has to narrow it by `dtype`.
export type PreviewValue = PreviewArray | PreviewScalar
