export type Maybe<T> = T | undefined

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
export type DeepPartial<T> = T extends Function
  ? T
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T

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

// Summary plots chart one variable against another across runs; preview plots
// show a single variable's extracted value per run.
export type PlotSource = 'summary' | 'preview'

// A plot's definition: the plotRequested action payload and the shape plots
// stores. Lives here so table (requester) and plots (store) can share it.
export type PlotSpec = {
  variables: string[]
  runs?: string[]
  source: PlotSource
  title?: string
}
