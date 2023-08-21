import { GridCellKind } from "@glideapps/glide-data-grid"
import { DTYPES } from "../../common/constants"
import { formatDate, formatFloat, imageBytesToURL } from "../../utils/helpers"

// TODO: Handle nonconforming data type

const imageCell = (data, params = {}) => {
  const image = imageBytesToURL(data)
  return {
    kind: GridCellKind.Image,
    // displayData: [image],
    data: [image],
    allowOverlay: true,
    allowAdd: false,
    readonly: true,
  }
}

const textCell = (data, params = {}) => {
  return {
    kind: GridCellKind.Text,
    displayData: data || "",
    data,
    allowOverlay: false,
  }
}

const numberCell = (data, params = {}) => {
  return {
    kind: GridCellKind.Number,
    displayData: Number.isFinite(data)
      ? String(Number.isInteger(data) ? data : formatFloat(data))
      : data
      ? String(data)
      : "",
    data,
    allowOverlay: false,
    contentAlign: "right",
  }
}

const arrayCell = (data, params = {}) => {
  return {
    kind: GridCellKind.Custom,
    allowOverlay: false,
    copyData: "4",
    data: {
      kind: "sparkline-cell",
      values: data,
      // displayValues: TODO: Round in server?
      color: "#77c4c4",
      yAxis: [Math.min(...data), Math.max(...data)],
    },
  }
}

const dateCell = (data, params = {}) => {
  return {
    kind: GridCellKind.Text,
    allowOverlay: false,
    displayData: formatDate(data),
    data,
  }
}

export const gridCellFactory = {
  [DTYPES.image]: imageCell,
  [DTYPES.string]: textCell,
  [DTYPES.number]: numberCell,
  [DTYPES.array]: arrayCell,
  [DTYPES.timestamp]: dateCell,
}
