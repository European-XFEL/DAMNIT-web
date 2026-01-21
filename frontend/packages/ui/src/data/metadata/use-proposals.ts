import { useQuery, gql } from '@apollo/client'

const PROPOSAL_METADATA_QUERY = gql`
  query ProposalMetadata($proposalNumbers: [Int!]!, $full: Boolean = false) {
    proposal_metadata(proposal_numbers: $proposalNumbers) {
      number
      instrument
      principal_investigator
      start_date
      title @include(if: $full)
      damnit_path @include(if: $full)
    }
  }
`

type UseProposalsOptions = {
  proposals: number[]
  full?: boolean
}

function useProposals({ proposals, full = false }: UseProposalsOptions) {
  const { loading, error, data } = useQuery(PROPOSAL_METADATA_QUERY, {
    variables: { proposalNumbers: proposals, full },
  })

  return {
    proposals: data?.proposal_metadata,
    isLoading: loading,
    isError: error,
  }
}

export default useProposals
