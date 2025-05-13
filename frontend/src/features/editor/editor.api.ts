import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react"
import { BASE_URL } from "../../constants"

interface FileContent {
  fileContent: string
}

interface LastModifiedResponse {
  lastModified: number
}

export const fileApi = createApi({
  reducerPath: "fileApi",
  baseQuery: fetchBaseQuery({ baseUrl: `${BASE_URL}file` }),
  endpoints: (builder) => ({
    getFileContent: builder.query<
      FileContent,
      { proposalNum: string; filename: string }
    >({
      query: ({ proposalNum, filename }) => ({
        url: "current",
        params: { proposal_num: proposalNum, filename },
      }),
    }),
    checkFileLastModified: builder.query<
      LastModifiedResponse,
      { proposalNum: string | undefined; filename: string }
    >({
      query: ({ proposalNum, filename }) => ({
        url: "last_modified",
        params: { proposal_num: proposalNum, file_name: filename },
      }),
    }),
  }),
})

export const { useGetFileContentQuery, useCheckFileLastModifiedQuery } = fileApi

export type { LastModifiedResponse }
