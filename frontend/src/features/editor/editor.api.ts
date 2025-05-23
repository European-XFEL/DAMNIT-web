import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react"
import { BASE_URL } from "../../constants"

interface FileContent {
  fileContent: string
  lastModified: number
}

interface LastModifiedResponse {
  lastModified: number
}

export const fileApi = createApi({
  reducerPath: "fileApi",
  baseQuery: fetchBaseQuery({ baseUrl: `${BASE_URL}contextfile` }),
  endpoints: (builder) => ({
    getFileContent: builder.query<
      FileContent,
      { proposalNum: string }
    >({
      query: ({ proposalNum }) => ({
        url: "content",
        params: { proposal_num: proposalNum },
      }),
    }),
    checkFileLastModified: builder.query<
      LastModifiedResponse,
      { proposalNum: string }
    >({
      query: ({ proposalNum }) => ({
        url: "last_modified",
        params: { proposal_num: proposalNum },
      }),
    }),
  }),
})

export const { useGetFileContentQuery, useCheckFileLastModifiedQuery } = fileApi
export type { LastModifiedResponse }
