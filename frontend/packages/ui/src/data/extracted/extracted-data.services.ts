import { gql } from '@apollo/client'

import { type ExtractedDataOptions } from './extracted-data.types'
import { client } from '#src/graphql/apollo'

const EXTRACTED_DATA = 'extracted_data'

const EXTRACTED_DATA_QUERY = gql`
  query ExtractedDataQuery($proposal: String, $run: Int!, $variable: String!) {
    ${EXTRACTED_DATA}(
      database: { proposal: $proposal }
      run: $run
      variable: $variable
    )
  }
`
async function getExtractedValue({
  proposal,
  run,
  variable,
}: ExtractedDataOptions) {
  // Redux renders this data, not the Apollo cache. no-cache stops a fetch that
  // resolves after resetProposal from writing the departed proposal's
  // extracted_data back into the just-evicted ROOT_QUERY.
  const result = await client.query({
    query: EXTRACTED_DATA_QUERY,
    fetchPolicy: 'no-cache',
    variables: {
      proposal: String(proposal),
      run: Number(run),
      variable,
    },
  })

  return result.data[EXTRACTED_DATA]
}

const ExtractedDataServices = {
  getExtractedValue,
}

export default ExtractedDataServices
