import { shapeMetadata, shapeTableData, unmockedOperationError } from './shape'
import type { Runs } from './types'

// Thrown by a data source when the requested example data does not exist, so
// the resolver reports the operation as unmocked drift instead of a hard error.
export class MockDataNotFound extends Error {}

// How resolveOperation reads example data. Each transport implements it its own
// way: the demo fetches over HTTP, the e2e suite reads the filesystem. A source
// throws MockDataNotFound when the requested data is absent.
export type MockDataSource = {
  runs(proposal: string): Promise<Runs>
  extractedData(options: {
    proposal: string
    run: number
    variable: string
  }): Promise<unknown>
  proposalMetadata(options: { proposalNumbers?: number[] }): Promise<unknown>
}

export type Resolution = {
  resolved: boolean
  body: Record<string, unknown>
}

export async function resolveOperation(
  operationName: string,
  {
    variables,
    source,
  }: { variables: Record<string, unknown>; source: MockDataSource }
): Promise<Resolution> {
  const proposal = variables.proposal as string

  try {
    switch (operationName) {
      case 'TableMetadataQuery': {
        const { meta } = await source.runs(proposal)
        return resolved({ metadata: shapeMetadata(meta) })
      }
      case 'TableDataQuery':
      case 'LightweightTableDataQuery':
      case 'DeferredTableDataQuery': {
        const { data } = await source.runs(proposal)
        const names = variables.names as string[] | null | undefined
        return resolved(shapeTableData(data, { names }))
      }
      case 'ExtractedDataQuery': {
        const extracted = await source.extractedData({
          proposal,
          run: variables.run as number,
          variable: variables.variable as string,
        })
        return resolved({ extracted_data: extracted })
      }
      case 'ProposalMetadata': {
        const metadata = await source.proposalMetadata({
          proposalNumbers: variables.proposalNumbers as number[] | undefined,
        })
        return resolved({ proposal_metadata: metadata })
      }
    }
  } catch (error) {
    if (error instanceof MockDataNotFound) {
      return unresolved(operationName)
    }
    throw error
  }

  return unresolved(operationName)
}

function resolved(data: unknown): Resolution {
  return { resolved: true, body: { data } }
}

function unresolved(operationName: string): Resolution {
  return { resolved: false, body: unmockedOperationError(operationName) }
}
