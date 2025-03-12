import {
  BaseGridCell,
  GridCell,
  GridCellKind,
  ImageCell,
  Item,
  LoadingCell,
  NumberCell,
  TextCell,
} from "@glideapps/glide-data-grid"
import { SparklineCellType } from "@glideapps/glide-data-grid-cells"

import { DTYPES } from "../../constants"
import { VariableValue } from "../../types"
import { formatDate, formatNumber } from "../../utils/helpers"

// TODO: Handle nonconforming data type

export const imageCell = (
  value: VariableValue,
  params: Partial<BaseGridCell> = {},
): ImageCell => {
  const data = typeof value === "string" ? [value] : []

  return {
    kind: GridCellKind.Image,
    data,
    allowOverlay: false,
    // allowAdd: false,
    readonly: true,
    ...params,
  }
}

export const textCell = (
  value: VariableValue,
  params: Partial<BaseGridCell> = {},
): TextCell => {
  const data = value ? String(value) : ""
  return {
    kind: GridCellKind.Text,
    displayData: data,
    data,
    allowOverlay: false,
    ...params,
  }
}

export const numberCell = (
  value: VariableValue,
  params: Partial<BaseGridCell> = {},
): NumberCell => {
  const data =
    typeof value === "number" && Number.isFinite(value)
      ? formatNumber(value)
      : undefined

  return {
    kind: GridCellKind.Number,
    displayData:
      data != null ? String(data) : value != null ? String(value) : "",
    data: data,
    allowOverlay: false,
    contentAlign: "right",
    themeOverride: {
      fontFamily: "monospace",
      textDark: "#4A4A4A",
    },
    ...params,
  }
}

export const arrayCell = (
  value: VariableValue,
  params: Partial<BaseGridCell> = {},
): SparklineCellType => {
  const values = Array.isArray(value) ? (value as number[]) : []

  const data = value
    ? {
        values: values,
        yAxis: [Math.min(...values), Math.max(...values)] as Item,
      }
    : { values: [], yAxis: [0, 0] as Item }

  return {
    kind: GridCellKind.Custom,
    allowOverlay: false,
    copyData: "",
    data: {
      kind: "sparkline-cell",
      color: "#77c4c4",
      ...data,
    },
    ...params,
  }
}

export const dateCell = (
  value: VariableValue,
  params: Partial<BaseGridCell> = {},
): TextCell => {
  const data = value && typeof value === "number" ? formatDate(value) : ""

  return {
    kind: GridCellKind.Text,
    allowOverlay: false,
    displayData: data,
    data,
    themeOverride: {
      fontFamily: "monospace",
    },
    ...params,
  }
}

export const loadingCell = (
  _: VariableValue,
  params: Partial<BaseGridCell> = {},
): LoadingCell => {
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

type GetCellOptions = {
  value: VariableValue
  dtype: keyof typeof gridCellFactory
  options: Partial<BaseGridCell>
}

export const getCell = ({
  value,
  dtype,
  options,
}: GetCellOptions): GridCell => {
  // If the value is null or undefined, use the loading cell factory.
  const factory = value == null ? loadingCell : gridCellFactory[dtype]
  return factory(value, options)
}
