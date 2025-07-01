import { VariableDataItem, VariableMetadataItem } from '../../types'

export type TableData = {
  [run: string]: { [variable: string]: VariableDataItem }
}

export type TableMetadata = {
  variables: Record<string, VariableMetadataItem>
  runs: string[]
  timestamp: number
}

export type TableInfo = {
  data: TableData
  metadata: TableMetadata
}

export type TableDataOptions = {
  proposal: string
  page?: number
  pageSize?: number
  lightweight?: boolean
  deferred?: boolean
}

export type TableMetadataOptions = {
  proposal: string
}
