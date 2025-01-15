import { GridCellKind } from "@glideapps/glide-data-grid"
import { DTYPES } from "../../constants"
import { formatDate, formatFloat, imageBytesToURL } from "../../utils/helpers"

// TODO: Handle nonconforming data type

export const imageCell = (data, params = {}) => {
  const image = data ? [imageBytesToURL(data)] : []
  return {
    kind: GridCellKind.Image,
    data: image,
    allowOverlay: false,
    allowAdd: false,
    readonly: true,
    ...params,
  }
}

export const textCell = (data, params = {}) => {
  return {
    kind: GridCellKind.Text,
    displayData: data ? String(data) : "",
    data,
    allowOverlay: false,
    ...params,
  }
}

export const numberCell = (data, params = {}) => {
  return {
    kind: GridCellKind.Number,
    displayData: Number.isFinite(data)
      ? String(Number.isInteger(data) ? data : formatFloat(data))
      : data !== null
      ? String(data)
      : "",
    data,
    allowOverlay: false,
    contentAlign: "right",
    themeOverride: {
      fontFamily: "monospace",
      textDark: "#4A4A4A",
    },
    ...params,
  }
}

export const arrayCell = (data, params = {}) => {
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
    ...params,
  }
}

export const dateCell = (data, params = {}) => {
  return {
    kind: GridCellKind.Text,
    allowOverlay: false,
    displayData: data ? formatDate(data) : "",
    data,
    themeOverride: {
      fontFamily: "monospace",
    },
    ...params,
  }
}

export const loadingCell = (data, params = {}) => {
  return {
    kind: GridCellKind.Loading,
    allowOverlay: false,
    skeletonWidth: 30,
    skeletonHeight: 30,
    ...params,
  }
}

const gridCellFactory = {
  [DTYPES.image]: imageCell,
  [DTYPES.string]: textCell,
  [DTYPES.number]: numberCell,
  [DTYPES.array]: arrayCell,
  [DTYPES.timestamp]: dateCell,
}

export const getCell = (value, dtype) => {
  return value !== null ? gridCellFactory[dtype] ?? textCell("") : loadingCell
}
