import { useMemo } from 'react'
import { useQuery } from '@apollo/client/react'

import { useAppSelector } from '#src/app/store/hooks'
import { EXCLUDED_VARIABLES } from '#src/constants'

import {
  TABLE_META_QUERY,
  type TableMetaResult,
  type TableMetaVariables,
} from './table-data.queries'
import type { TableMeta, Variable } from './table-data.types'

const EMPTY_META: TableMeta = {
  variables: {},
  runs: [],
  tags: {},
  timestamp: 0,
}

// The server metadata's only home is the Apollo cache. useProposal fetches it
// cache-and-network; every other reader shares that entry cache-first, so the
// run layout, columns, and tags all come from one place.
export function useTableMeta(): TableMeta {
  const proposal = useAppSelector((state) => state.metadata.proposal.value)

  const { data } = useQuery<TableMetaResult, TableMetaVariables>(
    TABLE_META_QUERY,
    {
      variables: { proposal },
      skip: !proposal,
      fetchPolicy: 'cache-first',
    }
  )

  return data?.metadata ?? EMPTY_META
}

// The variables a user configures, in metadata order: the identity and
// bookkeeping columns are never offered.
export function useTableVariables(): Variable[] {
  const { variables } = useTableMeta()

  return useMemo(
    () =>
      Object.values(variables).filter(
        (variable) => !EXCLUDED_VARIABLES.includes(variable.name)
      ),
    [variables]
  )
}
