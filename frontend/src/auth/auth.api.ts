import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'

import { BASE_URL } from '../constants'

export type UserInfo = {
  uid: number
  username: string
  name: string
  email: string
  proposals: { [cycle: string]: string[] }
}

export const authApi = createApi({
  reducerPath: 'authApi',
  baseQuery: fetchBaseQuery({ baseUrl: `${BASE_URL}oauth` }),
  endpoints: (builder) => ({
    getUserInfo: builder.query<UserInfo, void>({
      query: () => 'userinfo',
    }),
  }),
})

export const { useGetUserInfoQuery } = authApi
