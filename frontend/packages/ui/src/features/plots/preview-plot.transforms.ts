import {
  type PlotMeta,
  type PlotTrace,
  type PreviewScalar,
  type PreviewValue,
} from './plots.types'

// extracted_data is a JSON scalar, so `value.data` arrives as unknown and its
// shape is only knowable from `dtype`. Each branch narrows it to what Plot
// expects for that kind of trace.
export function toPlotTrace(
  value: PreviewValue,
  { run }: { run: string }
): PlotTrace {
  switch (value.dtype) {
    case 'array1d': {
      const dim = value.dims[0]
      return {
        x: { name: dim, value: value.coords[dim] },
        y: { name: `Run ${run}`, value: value.data as number[] },
      }
    }
    case 'array2d': {
      const [y, x] = value.dims.map((axis) => ({
        name: axis,
        value: value.coords[axis],
      }))
      return {
        x,
        y,
        z: { name: `Run ${run}`, value: value.data as number[][] },
      }
    }
    default:
      // Everything left plots as a bare value. A new array dtype has to be
      // given its own branch above before it builds.
      value satisfies PreviewScalar
      return { data: { name: `Run ${run}`, value: value.data } }
  }
}

export function toPlotMeta(value: PreviewValue): PlotMeta {
  const meta: PlotMeta = { type: 'unsupported' }

  switch (value.dtype) {
    case 'array1d':
      meta.x = { name: value.dims[0] }
      meta.y = { name: value.name }
      meta.type = 'scatter'
      break
    case 'array2d':
      meta.type = 'heatmap'
      break
    case 'image':
      meta.type = 'image'
      break
    case 'number':
    case 'string':
    case 'boolean':
    case 'timestamp':
      meta.type = 'scalar'
      break
    case 'none':
      // A run the variable has no value for, or one the backend could not type.
      // There is nothing to draw either way.
      break
    default:
      // A new dtype has to be drawn here before it builds. An unknown one at
      // runtime means a mismatched API, and stays unsupported.
      value satisfies never
  }

  // Only the attributes the plot declares. `attrs` also carries whatever the
  // context file left on the array, and spreading it whole put a single run's
  // arbitrary metadata on a plot that draws every run.
  const { shape, colormap_range: colormapRange } = value.attrs ?? {}

  return {
    ...(shape ? { shape } : {}),
    ...(colormapRange ? { colormap_range: colormapRange } : {}),
    ...meta,
  }
}
