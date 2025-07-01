import Plotly from 'react-plotly.js'

import { PlotInfo, PlotMetadata } from './plots.types'

type Plot = {
  data: Plotly.Data[]
  layout?: Plotly.Layout
}

/*
 * -----------------------------
 *   Scatter Plot
 * -----------------------------
 */

const scatterPlot = ({ data }: PlotInfo): Plot => {
  const plotData = data.reduce<Plotly.ScatterData[]>((acc, d) => {
    if (d.x?.value == null || d.y?.value == null) {
      return acc
    }
    const trace = {
      x: d.x.value as number[],
      y: d.y.value as number[],
      name: d.y?.name,
      mode: 'markers',
      type: 'scatter',
    }
    acc.push(trace as Plotly.ScatterData)
    return acc
  }, [])

  return { data: plotData as Plotly.Data[] }
}

/*
 * -----------------------------
 *   Heatmap Plot
 * -----------------------------
 */

const getDynamicHeight = (height: number) => {
  const yScale = 20
  const minHeight = 400
  const maxHeight = 720

  return Math.min(Math.max(height * yScale, minHeight), maxHeight)
}

const heatmapPlot = ({ data, metadata }: PlotInfo): Plot => {
  const [zmin, zmax] = metadata.colormap_range ?? [undefined, undefined]
  const { x, y, z } = data[0]

  if (!x || !y || !z) {
    throw new Error('Unable to plot heatmap: missing required data.')
  }

  return {
    data: [
      {
        x: x.value,
        y: y.value,
        z: z.value,
        type: 'heatmap',
        colorscale: 'Viridis',
        zmin,
        zmax,
      },
    ] as Plotly.Data[],
    layout: {
      height: getDynamicHeight(y.value?.length),
      xaxis: {
        title: { text: x?.name, standoff: 20 },
        automargin: true,
      },
      yaxis: {
        title: { text: y?.name, standoff: 20 },
        automargin: true,
        autorange: 'reversed',
      },
    } as Plotly.Layout,
  }
}

/*
 * -----------------------------
 *   Plot Helpers
 * -----------------------------
 */

const PLOTS = {
  scatter: scatterPlot,
  heatmap: heatmapPlot,
}

type AllowedPlotTypes = keyof typeof PLOTS

function isAllowedPlotType(type: unknown): type is AllowedPlotTypes {
  return typeof type === 'string' && Object.keys(PLOTS).includes(type)
}

function getPlot<T extends AllowedPlotTypes>(
  info: PlotInfo & { metadata: { type: T } }
) {
  return PLOTS[info.metadata.type](info) as ReturnType<(typeof PLOTS)[T]>
}

/*
 * -----------------------------
 *   Plot Component
 * -----------------------------
 */

type PlotProps = PlotInfo

const Plot = ({ data, metadata }: PlotProps) => {
  const defaultLayout = {
    xaxis: { title: metadata.x?.name },
    yaxis: { title: { text: metadata.y?.name, standoff: 20 } },
    margin: {
      t: 40,
    },
  }
  const defaultConfig = {
    displaylogo: false,
    scrollZoom: true,
    modeBarButtonsToRemove: ['select2d', 'lasso2d', 'autoscale'],
  }

  if (!isAllowedPlotType(metadata.type)) {
    return null
  }

  const { data: plotData, layout: plotLayout } = getPlot({
    data,
    metadata: metadata as PlotMetadata & { type: AllowedPlotTypes },
  })

  return (
    <Plotly
      data={plotData}
      layout={{ ...defaultLayout, ...(plotLayout ?? {}) } as Plotly.Layout}
      config={defaultConfig as Plotly.Config}
      data-testid="js-plotly-plot"
    />
  )
}

export default Plot
