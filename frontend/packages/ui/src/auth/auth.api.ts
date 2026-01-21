import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'

import { BASE_URL } from '../constants'

type Proposals = {
  [cycle: string]: number[]
}

export type UserInfo = {
  uid: number
  username: string
  name: string
  email: string
  proposals: Proposals
}

type UserInfoResponse = Omit<UserInfo, 'proposals'> & {
  proposals_by_year_half: Proposals
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
