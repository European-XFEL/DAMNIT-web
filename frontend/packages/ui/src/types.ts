export type Maybe<T> = T | undefined

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
export type DeepPartial<T> = T extends Function
  ? T
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T

export type WithTypeName<T> = T & {
  __typename: string
}

// The proposals available to a user, keyed by cycle.
export type AvailableProposals = {
  [cycle: string]: number[]
}

// Summary plots chart one variable against another across runs; preview plots
// show a single variable's extracted value per run.
export type PlotSource = 'summary' | 'preview'

// A plot's definition, shared by table (requester) and plots (store). `name`
// is the plot alone ("Pulses vs. Run"); the kind comes from `source`.
export type PlotSpec = {
  variables: string[]
  runs?: string[]
  source: PlotSource
  name: string
}
