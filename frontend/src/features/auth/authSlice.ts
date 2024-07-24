import { createSelector } from "@reduxjs/toolkit"
import { authApi } from "../api"

export const selectUserInfoResult = authApi.endpoints.getUserInfo.select()

export const selectUserFullName = createSelector(
  selectUserInfoResult,
  (result) => result?.data?.name,
)
