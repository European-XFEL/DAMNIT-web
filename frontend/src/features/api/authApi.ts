import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react"

export const authApi = createApi({
  reducerPath: "authApi",
  baseQuery: fetchBaseQuery({ baseUrl: "/oauth" }),
  endpoints: (builder) => ({
    getUserInfo: builder.query({
      query: () => "userinfo",
    }),
  }),
})

export const { useGetUserInfoQuery } = authApi
