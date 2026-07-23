export type CellValue = string | number | number[] | null | undefined

export type CellError = {
  message: string
  cls: string
}

export type Cell = {
  value: CellValue
  dtype: string
  error?: CellError
}

// A column: what a variable is, independent of any run's value of it.
export type Variable = {
  name: string
  title?: string
  tags: string[]
}

export type Tag = {
  id: number
  name: string
  variables: string[]
}

export type TableData = {
  [run: string]: { [variable: string]: Cell }
}

export type TableMetadata = {
  variables: Record<string, Variable>
  runs: string[]
  timestamp: number
  tags: Record<string, Tag>
}

export type TableInfo = {
  data: TableData
  metadata: TableMetadata
}
