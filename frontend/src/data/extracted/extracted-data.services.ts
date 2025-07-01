import { gql } from '@apollo/client'

import { ExtractedDataOptions } from './extracted-data.types'
import { client } from '../../graphql/apollo'

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
  const result = await client.query({
    query: EXTRACTED_DATA_QUERY,
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
