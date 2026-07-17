import { gql } from '@apollo/client'
import { type DocumentNode } from 'graphql'

import { PREVIEW_DATA_QUERY_NAME } from '#src/graphql/operation-names'

// The schema fetches one run per extracted_data call and offers no batch field,
// so a preview over N runs needs N aliased fields. Sending them in chunks lets
// the plot fill in as each chunk lands, and keeps a plot over every run to ~20
// watchers instead of one per run.
export const PREVIEW_CHUNK_SIZE = 50

const ALIAS_PATTERN = /^r(\d+)$/

export function aliasForRun(run: number) {
  return `r${run}`
}

export function runForAlias(alias: string) {
  const match = ALIAS_PATTERN.exec(alias)
  if (!match) {
    return null
  }
  return Number(match[1])
}

// Group the runs by value, so which chunk a run belongs to depends on the run
// alone. Chunking by position instead ties every run's chunk to how many runs
// precede it, so a single new run rewrites the documents of the chunks after it
// and refetches every heavy payload they already hold. Boundaries fall on
// multiples of the size, which is why runs 1-51 split as 1-49 and 50-51.
export function chunkRuns(
  runs: number[],
  size = PREVIEW_CHUNK_SIZE
): number[][] {
  const buckets = new Map<number, number[]>()

  // A run asked for twice is one field: a repeat would alias to the same name,
  // and give two chunks the same key.
  for (const run of new Set(runs)) {
    const key = Math.floor(run / size)
    const bucket = buckets.get(key) ?? []
    bucket.push(run)
    buckets.set(key, bucket)
  }

  return [...buckets.entries()]
    .sort(([first], [second]) => first - second)
    .map(([, bucket]) => bucket.sort((first, second) => first - second))
}

// A watcher's document cannot be conditional, so a hook with nothing to ask for
// still has to hold one. This is that placeholder: it is never sent, because
// every caller skips when it has no runs to fetch.
export const EMPTY_PREVIEW_QUERY = gql`
  query ${PREVIEW_DATA_QUERY_NAME} {
    __typename
  }
`

// Aliases are erased in the Apollo store: every field here writes to
// extracted_data({database, run, variable}) under ROOT_QUERY, so chunks of
// different plots that overlap on a run share the one entry. That is what lets
// the chunk loaders fetch and the parent watcher read the same cells.
export function buildPreviewQuery(runs: number[]): DocumentNode {
  if (!runs.length) {
    return EMPTY_PREVIEW_QUERY
  }

  const fields = runs.map(
    (run) => `${aliasForRun(run)}: extracted_data(
      database: { proposal: $proposal }
      run: ${run}
      variable: $variable
    )`
  )

  return gql`
    query ${PREVIEW_DATA_QUERY_NAME}($proposal: String, $variable: String!) {
      ${fields.join('\n')}
    }
  `
}
