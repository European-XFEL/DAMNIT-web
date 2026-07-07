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

export function shapeTableData(
  data: RunData[],
  { names }: { names?: string[] | null } = {}
) {
  return {
    runs: data.map((run) => ({
      variables: Object.entries(run.variables)
        .filter(([name]) => names == null || names.includes(name))
        .map(([name, variable]) => ({
          name,
          value: variable.value,
          dtype: variable.dtype,
        })),
    })),
  }
}

// A GraphQL error response (not a network error) surfaces mock drift
// immediately without tripping Apollo's RetryLink into an endless retry.
export function unmockedOperationError(operationName: string) {
  return { errors: [{ message: `Unmocked operation: ${operationName}` }] }
}
