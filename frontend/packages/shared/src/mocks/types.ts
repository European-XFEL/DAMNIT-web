export type VariableError = { cls: string; message: string }

type VariableValue =
  | { dtype: 'number'; value: number }
  | { dtype: 'string'; value: string }
  | { dtype: 'image'; value: string }

// A variable that failed to compute: no value, an error payload instead. The
// server nulls the value and stores the error class and message, and the table
// renders a status glyph plus a hover card from it.
type VariableFailure = { dtype: 'string'; value: null; error: VariableError }

type Variable = VariableValue | VariableFailure

type SourceMeta = {
  proposal_number: number
  title: string
  principal_investigator: string
}

type VariableMeta = {
  name: string
  title: string
  tags: string[]
}

type TagMeta = {
  id: number
  name: string
  variables: string[]
}

export type Meta = {
  sources: Record<string, SourceMeta>
  variables: Record<string, VariableMeta>
  runs: number[]
  tags: Record<string, TagMeta>
}

export type RunData = {
  source: {
    ref: string
    run_number: number
  }
  variables: Record<string, Variable>
}

export type Runs = {
  meta: Meta
  data: RunData[]
}
