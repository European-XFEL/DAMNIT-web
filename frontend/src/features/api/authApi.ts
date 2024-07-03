import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react"

export const authApi = createApi({
  reducerPath: "authApi",
  baseQuery: fetchBaseQuery({ baseUrl: "/oauth" }),
  endpoints: (builder) => ({
    getSession: builder.query({
      query: () => "session",
    }),
  }),
})

export const { useGetSessionQuery } = authApi
