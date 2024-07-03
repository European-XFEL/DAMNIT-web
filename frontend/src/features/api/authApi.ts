import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react"

export const authApi = createApi({
  reducerPath: "authApi",
  baseQuery: fetchBaseQuery({ baseUrl: "/oauth" }),
  tagTypes: ["Session"],
  endpoints: (builder) => ({
    getSession: builder.query({
      query: () => "session",
      providesTags: ["Session"],
    }),
  }),
})

export const { useGetSessionQuery } = authApi
