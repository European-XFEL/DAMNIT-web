import { createSelector } from '@reduxjs/toolkit'
import { authApi } from './auth.api'

export const selectUserInfoResult = authApi.endpoints.getUserInfo.select()

export const selectUserFullName = createSelector(
  selectUserInfoResult,
  (result) => result?.data?.name
)

export const selectAvailableProposals = createSelector(
  selectUserInfoResult,
  (result) => result?.data?.proposals ?? {}
)
