import { DTYPES } from "../constants"

export const isSummaryPlottable = (dtype) => {
  return [DTYPES.number].includes(dtype)
}

export const isDataPlottable = (dtype) => {
  return [DTYPES.number, DTYPES.image].includes(dtype)
}
