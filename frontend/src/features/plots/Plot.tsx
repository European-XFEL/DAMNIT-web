import React from "react"
import Plotly from "react-plotly.js"
import { useSelector } from "react-redux"
import { Skeleton } from "@mantine/core"

import { sorted } from "../../utils/array"

const scatterPlot = (data) => {
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

const heatmapPlot = (data) => {
  return {
    data: [{ z: data[0].z.data, type: "heatmap", colorscale: "YlGnBu" }],
  }
}

const imagePlot = (data) => {
  const image = data[0].z.data

  return {
    data: [
      {
        z: data[0].z.data,
        type: "image",
        colormodel: "rgba256",
      },
    ],
    layout: {
      xaxis: {
        showgrid: false,
        zeroline: false,
        showline: false,
        ticks: "",
        showticklabels: false,
      },
      yaxis: {
        showgrid: false,
        zeroline: false,
        showline: false,
        ticks: "",
        showticklabels: false,
      },
      width: image[0].length,
      height: image.length,
      margin: { t: 0, b: 0, l: 0, r: 0 },
      hovermode: false,
    },
  }
}

const PLOTS = {
  scatter: scatterPlot,
  heatmap: heatmapPlot,
  image: imagePlot,
}

const Plot = ({ plotId }) => {
  const plot = useSelector((state) => state.plots.data[plotId])
  const table = useSelector((state) => state.tableData)
  const extracted = useSelector((state) => state.extractedData)

  if (!plot) {
    // TODO: Return a better not-found indicator
    return <div />
  }

  const getTableData = () => {
    const runs = sorted(plot.runs || Object.keys(table.data))
    const values = runs.reduce((acc, run) => {
      plot.variables.forEach((variable) => {
        // Initialize array if not existing
        if (!acc[variable]) {
          acc[variable] = []
        }
        // Store the value to the array (only if run is there)
        table.data[run] && acc[variable].push(table.data[run][variable])
      })
      return acc
    }, {})

    const data = {}
    const metadata = { type: "scatter" }
    if (plot.variables.length === 1) {
      const yVar = plot.variables[0]
      data.x = { name: "run", data: runs }
      metadata.x = { type: "category", name: data.x.name }

      data.y = { name: yVar, data: values[yVar] }
      metadata.y = { name: data.y.name }
    } else {
      const xVar = plot.variables[0]
      const yVar = plot.variables[1]

      data.x = { name: xVar, data: values[xVar] }
      metadata.x = { name: data.x.name }

      data.y = { name: yVar, data: values[yVar] }
      metadata.y = { name: data.y.name }
    }

    return { data: [data], metadata }
  }

  const getExtractedData = () => {
    const variable = plot.variables[0]

    // TODO: Intersect common coordinates
    const coordIndex = 0
    const data = []
    const runs = sorted(plot.runs || Object.keys(extracted.metadata))


    runs.forEach((run) => {
      if (!extracted.data[run]?.[variable]) {
        return
      }

      const values = extracted.data[run][variable]
      const name = extracted.metadata[run][variable].name
      const coords = extracted.metadata[run][variable].coords
      const dtype = extracted.metadata[run][variable].dtype

      switch (dtype) {
        case "array":
          data.push({
            x: { name: coords[coordIndex], data: values[coords[coordIndex]] },
            y: {
              name: `Run ${run}`,
              data: values[name],
            },
          })
          break
        case "image":
        case "rgba":
          data.push({
            z: { data: values[name] },
          })
      }
    })

    // TODO: Get latest run
    const latestRun = runs[0]
    const metadata = {}
    switch (extracted.metadata[latestRun]?.[variable]?.dtype) {
      case "array":
        metadata.x = {
          name: extracted.metadata[latestRun][variable].coords[coordIndex],
        }
        metadata.y = { name: extracted.metadata[latestRun][variable].name }
        metadata.type = "scatter"
        break
      case "image":
        metadata.type = "heatmap"
        break
      case "rgba":
        metadata.type = "image"
        break
    }
    return { data, metadata }
  }

  const { data, metadata } =
    plot.source === "table" ? getTableData() : getExtractedData()

  const defaultLayout = {
    xaxis: { title: metadata.x?.name },
    yaxis: { title: { text: metadata.y?.name, standoff: 20 } },
  }
  const defaultConfig = {
    displaylogo: false,
    responsive: true,
    scrollZoom: true,
    modeBarButtonsToRemove: ["select2d", "lasso2d", "autoscale"],
  }

  const { data: plotData, layout: plotLayout } = metadata.type
    ? PLOTS[metadata.type](data)
    : {}

  return (
    <>
      {data.length ? (
        <Plotly
          data={plotData}
          layout={{ ...defaultLayout, ...(plotLayout || {}) }}
          config={defaultConfig}
          data-testid="js-plotly-plot"
        />
      ) : (
        <Skeleton height={430} width={740} my={20} mx={10} radius="xl" />
      )}
    </>
  )
}

export default Plot
