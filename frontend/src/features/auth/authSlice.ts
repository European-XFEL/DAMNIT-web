import { createSelector } from "@reduxjs/toolkit"
import { authApi } from "../api"

export const selectSessionResult = authApi.endpoints.getSession.select()

export const selectUser = createSelector(
  selectSessionResult,
  (sessionResult) => sessionResult?.data?.user,
)
