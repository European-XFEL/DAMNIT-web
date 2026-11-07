export {
  TABLE_DATA_QUERY_NAME,
  DEFERRED_TABLE_DATA_QUERY_NAME,
} from '#src/graphql/operation-names'

// The page size for asking the server for every run at once, for the plots
// that chart a variable across the whole proposal rather than a table page.
export const ALL_RUNS_PAGE_SIZE = 10000
