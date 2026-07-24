import { Kind, parse } from 'graphql'

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

// A preview asks for many runs at once by aliasing extracted_data per run, with
// the run inlined as a literal. Reading them back means reading the document:
// unlike every other operation here, the runs are not in `variables`. Exported
// because the e2e suite asserts on which runs a preview actually asked for.
export function previewRunFields(query: string) {
  const fields: { alias: string; run: number }[] = []

  for (const definition of parse(query).definitions) {
    if (definition.kind !== Kind.OPERATION_DEFINITION) {
      continue
    }
    for (const selection of definition.selectionSet.selections) {
      if (
        selection.kind !== Kind.FIELD ||
        selection.name.value !== 'extracted_data'
      ) {
        continue
      }
      const run = selection.arguments?.find((arg) => arg.name.value === 'run')
      if (run?.value.kind !== Kind.INT) {
        continue
      }
      fields.push({
        alias: selection.alias?.value ?? selection.name.value,
        run: Number(run.value.value),
      })
    }
  }

  return fields
}

export async function resolveOperation(
  operationName: string,
  {
    query,
    variables,
    source,
  }: {
    query: string
    variables: Record<string, unknown>
    source: MockDataSource
  }
): Promise<Resolution> {
  const proposal = variables.proposal as string

  try {
    switch (operationName) {
      case 'TableMetaQuery': {
        const { meta } = await source.runs(proposal)
        return resolved({ metadata: shapeMetadata(meta, proposal) })
      }
      case 'TableDataQuery':
      case 'LightweightTableDataQuery':
      case 'DeferredTableDataQuery': {
        const { data } = await source.runs(proposal)
        const names = variables.names as string[] | null | undefined
        return resolved(
          shapeTableData(data, {
            proposal,
            names,
            lightweight: operationName === 'LightweightTableDataQuery',
          })
        )
      }
      case 'PreviewDataQuery': {
        const fields = previewRunFields(query)
        // Every caller skips an empty run set, so a preview asking for no runs
        // means the builder drifted rather than the plot being empty.
        if (!fields.length) {
          return unresolved(operationName)
        }
        // A run with no example data throws MockDataNotFound and takes the
        // whole chunk down as drift. That is deliberate: answering the missing
        // run with a silent null is the quiet drift this mock exists to catch.
        const values = await Promise.all(
          fields.map(({ run }) =>
            source.extractedData({
              proposal,
              run,
              variable: variables.variable as string,
            })
          )
        )
        return resolved(
          Object.fromEntries(
            fields.map(({ alias }, index) => [alias, values[index]])
          )
        )
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
