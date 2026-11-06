import { useQuery, gql } from '@apollo/client'

const PROPOSAL_METADATA_QUERY = gql`
  query ProposalMetadata($proposalNumbers: [Int!]!, $full: Boolean = false) {
    proposal_metadata(proposal_numbers: $proposalNumbers) {
      number
      instrument
      principal_investigator
      start_date
      title
      damnit_path @include(if: $full)
    }
  }
`

export type ProposalMetadata = {
  number: number
  instrument: string
  principal_investigator: string
  start_date: string
  title: string
  // Only fetched with `full`
  damnit_path?: string | null
}

type ProposalMetadataResult = {
  proposal_metadata: ProposalMetadata[] | null
}

type ProposalMetadataVariables = {
  proposalNumbers: number[]
  full: boolean
}

type UseProposalsOptions = {
  proposals: number[]
  full?: boolean
}

function useProposals({ proposals, full = false }: UseProposalsOptions) {
  const { loading, error, data } = useQuery<
    ProposalMetadataResult,
    ProposalMetadataVariables
  >(PROPOSAL_METADATA_QUERY, {
    variables: { proposalNumbers: proposals, full },
  })

  return {
    proposals: data?.proposal_metadata,
    isLoading: loading,
    isError: error,
  }
}

export default useProposals
