import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'

import { BASE_URL } from '#src/constants'
import { type AvailableProposals } from '#src/types'

export type UserInfo = {
  uid: number
  username: string
  name: string
  email: string
  proposals: AvailableProposals
}

type UserInfoResponse = Omit<UserInfo, 'proposals'> & {
  proposals_by_year_half: AvailableProposals
}

export const authApi = createApi({
  reducerPath: 'authApi',
  baseQuery: fetchBaseQuery({ baseUrl: `${BASE_URL}oauth` }),
  endpoints: (builder) => ({
    getUserInfo: builder.query<UserInfo, void>({
      query: () => 'userinfo',
      transformResponse: ({
        proposals_by_year_half,
        ...rest
      }: UserInfoResponse): UserInfo => ({
        ...rest,
        proposals: proposals_by_year_half,
      }),
    }),
  }),
})

export const { useGetUserInfoQuery } = authApi
