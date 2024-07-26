import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react"

export const metadataApi = createApi({
  reducerPath: "metadataApi",
  baseQuery: fetchBaseQuery({ baseUrl: "/metadata" }),
  endpoints: (builder) => ({
    getProposal: builder.query({
      query: (proposal_num) => `proposal/${proposal_num}`,
    }),
  }),
})

export const { useGetProposalQuery } = metadataApi
