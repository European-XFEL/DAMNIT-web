type TraceData<T> = {
  value: T
  name: string
}
export type PlotDataItem = {
  x?: TraceData<number[]>
  y?: TraceData<number[]>
  z?: TraceData<number[][]>
  data?: TraceData<unknown>
}

export type PlotData = PlotDataItem[]

type TraceMetadata = {
  name: string
}

export type PlotMetadata = {
  type: string

  // Traces
  x?: TraceMetadata
  y?: TraceMetadata
  z?: TraceMetadata
  data?: TraceMetadata

  // Optional: General
  shape?: [number, number]

  // Optional: 2D images
  colormap_range?: [number, number]
}

export type PlotInfo = {
  data: PlotData
  metadata: PlotMetadata
}
