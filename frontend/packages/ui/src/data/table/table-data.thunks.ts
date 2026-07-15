import { type PayloadAction } from '@reduxjs/toolkit'

import { type AppDispatch } from '#src/app/store/types'
import { isEmpty } from '#src/utils/helpers'

import { getTable, getTableData } from './table-data.slice'
import { type TableInfo } from './table-data.types'

export const getDeferredTable =
  ({
    proposal,
    page = 1,
    pageSize = 5,
  }: {
    proposal: string
    page: number
    pageSize: number
  }) =>
  async (dispatch: AppDispatch) => {
    const action = (await dispatch(
      getTable({ proposal, page, pageSize, lightweight: true })
    )) as PayloadAction<TableInfo>

    const { data } = action.payload
    if (isEmpty(data)) {
      return
    }

    const heavyVariables = [
      ...new Set(
        Object.values(data).flatMap((run) =>
          Object.entries(run)
            .filter(
              ([_, variables]) =>
                variables?.value === null && variables?.error == null
            )
            .map(([variable]) => variable)
        )
      ),
    ]

    dispatch(
      getTableData({
        proposal,
        variables: heavyVariables,
        page,
        pageSize,
        deferred: true,
      })
    )
  }
