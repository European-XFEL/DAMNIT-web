import { PayloadAction } from "@reduxjs/toolkit"

import { getTable, getTableData } from "./table-data.slice"
import { TableInfo } from "./table-data.types"

import { AppDispatch } from "../../redux"

export const getDeferredTableValues =
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
      getTable({ proposal, page, pageSize, lightweight: true }),
    )) as PayloadAction<TableInfo>

    const { data } = action.payload
    if (!data) {
      return
    }

    const heavyVariables = [
      ...new Set(
        Object.values(data).flatMap((run) =>
          Object.entries(run)
            .filter(([_, variables]) => variables?.value === null)
            .map(([variable]) => variable),
        ),
      ),
    ]

    dispatch(
      getTableData({
        proposal,
        variables: heavyVariables,
        page,
        pageSize,
        deferred: true,
      }),
    )
  }
