import { useEffect, useMemo } from 'react'
import { useQuery } from '@apollo/client/react'

import { useAppDispatch } from '#src/app/store/hooks'
import { VARIABLES } from '#src/constants'
import {
  DEFERRED_TABLE_DATA_QUERY,
  LIGHTWEIGHT_TABLE_DATA_QUERY,
  type TableDataResult,
  type TableDataVariables,
} from '#src/data/table/table-data.queries'
import { updateTable } from '#src/data/table/table-data.slice'
import {
  flattenRuns,
  heavyVariableNames,
} from '#src/data/table/table-data.transforms'

type TablePageLoaderProps = {
  proposal: string
  page: number
  pageSize: number
}

// Loads one page of runs into the table slice and renders nothing. The table
// wants a changing number of pages at once and a component can own only one
// watched query, so each page gets its own instance. Rows live in the slice,
// not in this null-rendering loader, so a revisited page has nothing to paint
// from a cached copy. Fetching it fresh (no-cache) is what stops a stale page
// from replaying over the newer values the subscription writes to the slice
// while the page is off screen.
function TablePageLoader({ proposal, page, pageSize }: TablePageLoaderProps) {
  const dispatch = useAppDispatch()

  const { data: lightweight } = useQuery<TableDataResult, TableDataVariables>(
    LIGHTWEIGHT_TABLE_DATA_QUERY,
    {
      variables: { proposal, page, per_page: pageSize },
      fetchPolicy: 'no-cache',
      skip: !proposal,
    }
  )

  const rows = useMemo(
    () => (lightweight ? flattenRuns(lightweight.runs) : undefined),
    [lightweight]
  )

  useEffect(() => {
    if (rows === undefined) {
      return
    }
    dispatch(updateTable({ data: rows }))
  }, [rows, dispatch])

  // Ask for the values @lightweight held back, for this page only. `run` comes
  // along because it is what keys each row onto the ones already dispatched.
  const heavy = useMemo(() => (rows ? heavyVariableNames(rows) : []), [rows])

  const { data: deferred } = useQuery<TableDataResult, TableDataVariables>(
    DEFERRED_TABLE_DATA_QUERY,
    {
      variables: {
        proposal,
        page,
        per_page: pageSize,
        names: [VARIABLES.run, ...heavy],
      },
      fetchPolicy: 'no-cache',
      skip: !heavy.length,
    }
  )

  useEffect(() => {
    if (!deferred) {
      return
    }
    dispatch(updateTable({ data: flattenRuns(deferred.runs) }))
  }, [deferred, dispatch])

  return null
}

export default TablePageLoader
