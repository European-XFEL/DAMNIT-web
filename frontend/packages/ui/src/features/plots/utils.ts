import { type VariableValue } from '../../types'

export function generateUID() {
  return (
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15)
  )
}

export const canPlotData = (data: VariableValue, _: string) => {
  // TODO: Use extracted data type from the database
  return data != null
}
