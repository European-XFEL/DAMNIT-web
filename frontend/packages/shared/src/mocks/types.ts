type VariableValue =
  | { dtype: 'number'; value: number }
  | { dtype: 'string'; value: string }
  | { dtype: 'image'; value: string }

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
  variables: Record<string, VariableValue>
}

export type Runs = {
  meta: Meta
  data: RunData[]
}
