import { DTYPES } from "../constants"

export const canPlotSummary = (data, dtype) => {
  return data != null && [DTYPES.number].includes(dtype)
}

export const canPlotData = (data, dtype) => {
  return [DTYPES.number, DTYPES.image].includes(dtype)
}
