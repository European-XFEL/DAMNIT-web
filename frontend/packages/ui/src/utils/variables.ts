import { type VariableMetadataItem } from '#src/types'

export const getVariableTitle = (variable: VariableMetadataItem) =>
  variable.title || variable.name
