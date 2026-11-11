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

// What a plot shows, which is all its address carries. A summary with no runs
// draws them all.
export type PlotSpec =
  | { source: 'summary'; variables: [x: string, y: string]; runs?: string[] }
  | { source: 'preview'; variables: [variable: string]; runs: string[] }
