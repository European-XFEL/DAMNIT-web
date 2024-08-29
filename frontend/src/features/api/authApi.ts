import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react"

import { BASE_URL } from "../../constants"

export const authApi = createApi({
  reducerPath: "authApi",
  baseQuery: fetchBaseQuery({ baseUrl: `${BASE_URL}oauth` }),
  endpoints: (builder) => ({
    getUserInfo: builder.query({
      query: () => "userinfo",
    }),
  }),
})

export const { useGetUserInfoQuery } = authApi
