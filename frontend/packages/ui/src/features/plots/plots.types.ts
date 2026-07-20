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
  shape?: [number, number]

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
type PreviewAttrs = {
  shape?: [number, number]
  colormap_range?: [number, number]
  [attr: string]: unknown
}

type PreviewBase = {
  data: unknown
  name: string
  attrs?: PreviewAttrs
}

// An array or a 2D image: the backend sends these as a serialized DataArray, so
// they carry the dimensions and coordinates to plot the values against.
type PreviewArray = PreviewBase & {
  dtype: 'array' | 'image'
  dims: string[]
  coords: { [dim: string]: number[] }
}

// A single value with nothing to plot it against. An RGBA image arrives already
// encoded as a png, and the rest are scalars; none of them has dimensions.
type PreviewScalar = PreviewBase & {
  dtype: 'png' | 'number' | 'string' | 'boolean' | 'timestamp' | 'none'
}

// What extracted_data returns for one run and variable: the values, plus the
// metadata needed to plot them. The field is a JSON scalar, so `data` is the
// part no schema can describe and every reader has to narrow it by `dtype`.
export type PreviewValue = PreviewArray | PreviewScalar
