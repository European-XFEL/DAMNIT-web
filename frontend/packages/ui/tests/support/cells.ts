import { cellId } from '@damnit-frontend/shared/mocks'

// One cell as the server sends it, built the way the mock server builds it.
// Apollo keys `Cell` on the id, so a fixture that spells the composite shape its
// own way mints a second entity for the same cell, which is exactly the drift
// these tests exist to catch.
export function serverCell({
  database,
  proposal,
  run,
  name,
  value,
  dtype = 'number',
  error = null,
}: ServerCellOptions) {
  return {
    __typename: 'Cell',
    id: cellId({ database, proposal, run, name }),
    name,
    error,
    summary: { __typename: 'CellSummary', value, dtype },
  }
}

type ServerCellOptions = {
  database: string
  proposal: string
  run: number
  name: string
  value: unknown
  dtype?: string
  error?: CellError | null
}

type CellError = { cls: string; message: string }
