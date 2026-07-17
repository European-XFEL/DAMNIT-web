import { useEffect } from 'react'
import { useQuery } from '@apollo/client/react'

import { useAppDispatch, useAppSelector } from '#src/app/store/hooks'
import { VARIABLES } from '#src/constants'
import { ALL_RUNS_PAGE_SIZE } from '#src/data/table/table-data.constants'
import {
  TABLE_DATA_QUERY,
  type TableDataResult,
  type TableDataVariables,
} from '#src/data/table/table-data.queries'
import { updateTable } from '#src/data/table/table-data.slice'
import { flattenRuns } from '#src/data/table/table-data.transforms'

type UseSummaryPlotDataOptions = {
  variables: string[]
  enabled: boolean
}

// Fetches the variables a summary plot charts into the table slice, which is
// where the plot reads them back from. Routing through the slice rather than
// rendering from the cache is what keeps summary plots live: a subscription
// push writes the same rows, and the plot redraws with them.
export function useSummaryPlotData({
  variables,
  enabled,
}: UseSummaryPlotDataOptions) {
  const dispatch = useAppDispatch()
  const proposal = useAppSelector((state) => state.metadata.proposal.value)

  const { data } = useQuery<TableDataResult, TableDataVariables>(
    TABLE_DATA_QUERY,
    {
      variables: {
        proposal,
        page: 1,
        per_page: ALL_RUNS_PAGE_SIZE,
        // `run` keys each row onto the ones the table already holds.
        names: [VARIABLES.run, ...variables],
      },
      // The slice is the only thing that renders these rows, so a cached copy
      // is never read: caching one would only cost a write, and let this
      // query's entry replace the unpaginated table's, which is stored under
      // the same arguments. Once a keyed run lets the plot render from the
      // cache, this becomes cache-and-network and the slice goes away.
      fetchPolicy: 'no-cache',
      skip: !enabled || !proposal,
    }
  )

  useEffect(() => {
    if (!data) {
      return
    }
    dispatch(updateTable({ data: flattenRuns(data.runs) }))
  }, [data, dispatch])
}
