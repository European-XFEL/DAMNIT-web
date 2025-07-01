import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'
import { BASE_URL } from '../../constants'

export const metadataApi = createApi({
  reducerPath: 'metadataApi',
  baseQuery: fetchBaseQuery({ baseUrl: `${BASE_URL}metadata` }),
  endpoints: (builder) => ({
    getProposal: builder.query({
      query: (proposal_num) => `proposal/${proposal_num}`,
    }),
  }),
})

export const { useGetProposalQuery } = metadataApi
