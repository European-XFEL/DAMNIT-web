export type Maybe<T> = T | undefined

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
export type DeepPartial<T> = T extends Function
  ? T
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T

export type VariableValue = Maybe<string | number | number[]>

export type VariableError = {
  message: string
  cls: string
}

export type VariableDataItem = {
  value: VariableValue
  dtype: string
  error?: VariableError
}

export type VariableMetadataItem = {
  name: string
  title?: string
  tags: string[]
}

export type TagItem = {
  id: number
  name: string
  variables: string[]
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

export type ProposalInfo = {
  number: number
  instrument: string
  title: string
  principal_investigator: string

  start_date: string
  end_date: string
  run_cycle: string

  proposal_path: string
  damnit_path: string
}

// The proposals available to a user, keyed by cycle.
export type AvailableProposals = {
  [cycle: string]: number[]
}

// A plot's definition: the plotRequested action payload and the shape plots
// stores. Lives here so table (requester) and plots (store) can share it.
export type PlotSpec = {
  variables: string[]
  runs?: string[]
  source: string
  title?: string
}
