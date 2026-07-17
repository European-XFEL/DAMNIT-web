import {
  type VariableDataItem,
  type VariableMetadataItem,
  type TagItem,
} from '#src/types'

export type TableData = {
  [run: string]: { [variable: string]: VariableDataItem }
}

export type TableMetadata = {
  variables: Record<string, VariableMetadataItem>
  runs: string[]
  timestamp: number
  tags: Record<string, TagItem>
}

export type TableInfo = {
  data: TableData
  metadata: TableMetadata
}
