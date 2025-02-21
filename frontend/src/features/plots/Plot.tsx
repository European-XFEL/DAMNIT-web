import React from "react"
import Plotly from "react-plotly.js"

const scatterPlot = (data, _) => {
  return {
    data: data.map((d) => ({
      x: d.x.data,
      y: d.y.data,
      name: d.y.name,
      mode: "markers",
      type: "scatter",
    })),
  }
}

const heatmapPlot = (data, metadata) => {
  const [zmin, zmax] = metadata.colormap_range ?? [undefined, undefined]
  const { x, y, z } = data[0]

  return {
    data: [
      {
        x: x.data,
        y: y.data,
        z: z.data,
        type: "heatmap",
        colorscale: "Viridis",
        zmin,
        zmax,
      },
    ],
    layout: {
      height: getDynamicHeight(y.data.length),
      xaxis: {
        title: { text: x.name, standoff: 20 },
        automargin: true,
      },
      yaxis: {
        title: { text: y.name, standoff: 20 },
        automargin: true,
        autorange: "reversed",
      },
    },
  }
}

const PLOTS = {
  scatter: scatterPlot,
  heatmap: heatmapPlot,
}

const getDynamicHeight = (height) => {
  // Scale height dynamically
  const yScale = 20
  const minHeight = 400
  const maxHeight = 720

  return Math.min(Math.max(height * yScale, minHeight), maxHeight)
}

const Plot = ({ data, metadata }) => {
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
    modeBarButtonsToRemove: ["select2d", "lasso2d", "autoscale"],
  }

  const { data: plotData, layout: plotLayout } = metadata.type
    ? PLOTS[metadata.type](data, metadata)
    : {}

  return (
    <Plotly
      data={plotData}
      layout={{ ...defaultLayout, ...(plotLayout ?? {}) }}
      config={defaultConfig}
      data-testid="js-plotly-plot"
    />
  )
}

export default Plot
