import { VariableMetadataItem } from '../types'

export const getVariableTitle = (variable: VariableMetadataItem) =>
  variable.title || variable.name
