import { shapeMetadata, shapeTableData, unmockedOperationError } from './shape'
import type { Runs } from './types'

// Thrown by a seed when the requested example data does not exist, so the
// resolver reports the operation as unmocked drift instead of a hard error.
export class MockDataNotFound extends Error {}

// How resolveOperation reads example data. Each transport implements it its own
// way: the demo fetches over HTTP, the e2e suite reads the filesystem. A seed
// throws MockDataNotFound when the requested data is absent.
export type MockSeed = {
  runs(proposal: string): Promise<Runs>
  extractedData(options: {
    proposal: string
    run: number
    variable: string
  }): Promise<unknown>
  proposalMetadata(): Promise<unknown>
}

export type Resolution = {
  resolved: boolean
  body: Record<string, unknown>
}

export async function resolveOperation(
  operationName: string,
  { variables, seed }: { variables: Record<string, unknown>; seed: MockSeed }
): Promise<Resolution> {
  const proposal = variables.proposal as string

  try {
    switch (operationName) {
      case 'TableMetadataQuery': {
        const { meta } = await seed.runs(proposal)
        return resolved({ metadata: shapeMetadata(meta) })
      }
      case 'TableDataQuery':
      case 'LightweightTableDataQuery':
      case 'DeferredTableDataQuery': {
        const { data } = await seed.runs(proposal)
        const names = variables.names as string[] | null | undefined
        return resolved(shapeTableData(data, { names }))
      }
      case 'ExtractedDataQuery': {
        const extracted = await seed.extractedData({
          proposal,
          run: variables.run as number,
          variable: variables.variable as string,
        })
        return resolved({ extracted_data: extracted })
      }
      case 'ProposalMetadata': {
        const metadata = await seed.proposalMetadata()
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
