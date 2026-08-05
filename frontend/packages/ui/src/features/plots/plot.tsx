import Plotly from 'react-plotly.js'

import { type PlotData, type PlotMeta } from './plots.types'

type Plot = {
  data: Plotly.Data[]
  layout?: Plotly.Layout
}

/*
 * -----------------------------
 *   Scatter Plot
 * -----------------------------
 */

const scatterPlot = ({ traces }: PlotData): Plot => {
  const plotData = traces.reduce<Plotly.ScatterData[]>((acc, trace) => {
    if (trace.x?.value == null || trace.y?.value == null) {
      return acc
    }
    const plotTrace = {
      x: trace.x.value as number[],
      y: trace.y.value as number[],
      name: trace.y?.name,
      mode: 'markers',
      type: 'scatter',
    }
    acc.push(plotTrace as Plotly.ScatterData)
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

const heatmapPlot = ({ traces, meta }: PlotData): Plot => {
  const [zmin, zmax] = meta.colormap_range ?? [undefined, undefined]
  const { x, y, z } = traces[0]

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
  plot: PlotData & { meta: { type: T } }
) {
  return PLOTS[plot.meta.type](plot) as ReturnType<(typeof PLOTS)[T]>
}

/*
 * -----------------------------
 *   Plot Component
 * -----------------------------
 */

type PlotProps = PlotData

const Plot = ({ traces, meta }: PlotProps) => {
  const defaultLayout = {
    xaxis: { title: meta.x?.name },
    yaxis: { title: { text: meta.y?.name, standoff: 20 } },
    margin: {
      t: 40,
    },
  }
  const defaultConfig = {
    displaylogo: false,
    scrollZoom: true,
    modeBarButtonsToRemove: ['select2d', 'lasso2d', 'autoscale'],
  }

  if (!isAllowedPlotType(meta.type)) {
    return null
  }

  const { data: plotData, layout: plotLayout } = getPlot({
    traces,
    meta: meta as PlotMeta & { type: AllowedPlotTypes },
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
