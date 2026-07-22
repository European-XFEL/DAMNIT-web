import type { Meta, RunData } from './types'

// The app's REST surfaces (auth and context file), as BASE_URL-relative path
// prefixes. Both mock guards fail loudly on any of these they don't cover, so
// mock drift surfaces immediately instead of as a silently broken page.
export const REST_API_PREFIXES = ['oauth/', 'contextfile/']

export function shapeMetadata(meta: Meta) {
  return {
    variables: meta.variables,
    runs: meta.runs,
    timestamp: 0,
    tags: meta.tags,
  }
}

// What the server's @lightweight directive holds back: the dtypes whose values
// are too big to send with the first pass. It nulls their value and leaves
// dtype and error alone, so the client can see which cells to ask for again.
const HEAVY_DTYPES = ['image', 'rgba', 'array']

export function shapeTableData(
  data: RunData[],
  { names, lightweight = false }: ShapeTableDataOptions = {}
) {
  return {
    runs: data.map((run) => ({
      cells: Object.entries(run.variables)
        .filter(([name]) => names == null || names.includes(name))
        .map(([name, variable]) => ({
          name,
          value:
            lightweight && HEAVY_DTYPES.includes(variable.dtype)
              ? null
              : variable.value,
          dtype: variable.dtype,
          // Always sent, even absent from the example: the query selects it, so
          // omitting it leaves the client's cache read incomplete and every
          // cached replay silently refetches.
          error: 'error' in variable ? variable.error : null,
        })),
    })),
  }
}

type ShapeTableDataOptions = {
  names?: string[] | null
  lightweight?: boolean
}

// A GraphQL error response (not a network error) surfaces mock drift
// immediately without tripping Apollo's RetryLink into an endless retry.
export function unmockedOperationError(operationName: string) {
  return { errors: [{ message: `Unmocked operation: ${operationName}` }] }
}
