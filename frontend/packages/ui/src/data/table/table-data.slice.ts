/*
This is planned to be deprecated in favor of unified Redux and
Apollo Client store
*/

import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

import { resetProposal } from '#src/app/store/actions'
import { type Maybe } from '#src/types'
import { isEmpty } from '#src/utils/helpers'

import { isBlanked } from './table-data.transforms'
import {
  type TableData,
  type TableInfo,
  type TableMetadata,
} from './table-data.types'

interface TableDataState extends TableInfo {
  lastUpdate: Record<string, Maybe<number>>
}

const initialState: TableDataState = {
  data: {},
  metadata: { variables: {}, runs: [], timestamp: 0, tags: {} },
  lastUpdate: {},
}

// Metadata is optional: a page loader has only rows to contribute, while
// useProposal's metadata query and the subscription have both. Runs arrive on
// the wire as numbers, so the payload takes that shape and the reducer is what
// turns them into the strings the table keys its rows by.
type UpdateInfo = {
  data: TableData
  metadata?: Partial<Omit<TableMetadata, 'runs'>> & {
    runs?: (string | number)[]
  }
  // A push from the subscription, as opposed to a bulk load of rows the table
  // asked for. Only a push is news: it is what marks the runs as just-updated
  // and what may legitimately clear a value.
  live?: boolean
}

const slice = createSlice({
  name: 'tableData',
  initialState,
  reducers: {
    update: (state, action: PayloadAction<UpdateInfo>) => {
      const { data, metadata, live = false } = action.payload

      // Update data
      if (!isEmpty(data)) {
        const timestamp = performance.now()
        const updatedData = { ...state.data }
        const updatedTimestamp = { ...state.lastUpdate }

        Object.entries(data).forEach(([run, variables]) => {
          const row = { ...(updatedData[run] || { run }) }

          Object.entries(variables).forEach(([name, incoming]) => {
            // A bulk load must not clobber a value the deferred pass already
            // delivered with one @lightweight held back (see isBlanked): that
            // would blank the cell for good, since both passes refetch together
            // and the deferred one, having nothing new to report, never runs
            // again to repair it.
            const heldBack = !live && isBlanked(incoming)
            if (heldBack && row[name]?.value != null) {
              return
            }
            row[name] = incoming
          })

          updatedData[run] = row
          if (live) {
            updatedTimestamp[run] = timestamp
          }
        })

        state.data = updatedData
        state.lastUpdate = updatedTimestamp
      }

      // A subscription push resends runs, variables, and timestamp but never
      // tags, so replacing wholesale would drop them and crash the tag-driven
      // column visibility. Merge so unsent fields (tags) survive.
      if (metadata) {
        const { runs, ...rest } = metadata
        state.metadata = {
          ...state.metadata,
          ...rest,
          ...(runs ? { runs: runs.map(String) } : {}),
        }
      }
    },
  },
  extraReducers: (builder) => {
    builder.addCase(resetProposal, () => initialState)
  },
})

export default slice.reducer
export const { update: updateTable } = slice.actions
