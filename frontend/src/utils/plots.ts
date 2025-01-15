import { DTYPES } from "../constants"

export const canPlotSummary = (data, dtype) => {
  return data != null && [DTYPES.number].includes(dtype)
}

export const canPlotData = (data, dtype) => {
  // TODO: Use extracted data type from the database
  return data != null
}
