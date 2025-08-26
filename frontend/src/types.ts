export type Maybe<T> = T | undefined

export type VariableValue = Maybe<string | number | number[]>

export type VariableDataItem = {
  value: VariableValue
  dtype: string
}

export type VariableMetadataItem = {
  name: string
  title?: string
  tag_ids: number[]
}

export type TagMetadataItem = {
  id: number
  name: string
}

export type ExtractedDataItem = unknown

export type ExtractedMetadataItem = {
  name: string
  dtype: string
  dims: string[]
  coords: { [dim: string]: number[] }
  attrs: { [attr: string]: unknown }
}

export type TabItem = {
  title: string
  subtitle?: string
  isClosable?: boolean
}

export type WithTypeName<T> = T & {
  __typename: string
}
