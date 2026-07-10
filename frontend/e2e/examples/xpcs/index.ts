import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type {
  RunData,
  Runs,
  VariableError,
} from '@damnit-frontend/shared/mocks'

// Wire shape returned by GET /oauth/userinfo (the app renames
// proposals_by_year_half -> proposals).
type UserInfoWire = {
  uid: number
  username: string
  name: string
  email: string
  proposals_by_year_half: Record<string, number[]>
}

// Response objects for the ProposalMetadata GraphQL query.
type ProposalMetadata = {
  number: number
  instrument: string
  principal_investigator: string
  start_date: string
  title: string
  damnit_path: string
}

// Wire shape of a per-run extracted-data file: the raw values plus their
// metadata (dtype, dims, coords, attrs). Served verbatim as the ExtractedData
// query's extracted_data field, exactly as the demo's own handler serves it.
type ExtractedData = {
  data: unknown
  dtype: string
  name: string
  [key: string]: unknown
}

const here = dirname(fileURLToPath(import.meta.url))

// The base data (runs + context file) is the demo's canonical example, read
// directly so the two can never drift. Only the e2e-authored auth and proposal
// responses live alongside this file.
const base = join(here, '../../../apps/demo/public/examples/xpcs')

function readJson<T>(dir: string, name: string): T {
  return JSON.parse(readFileSync(join(dir, name), 'utf-8')) as T
}

const runs = readJson<Runs>(base, 'runs.json')

export const XPCS = {
  meta: runs.meta,
  data: runs.data,
  userInfo: readJson<UserInfoWire>(here, 'userinfo.json'),
  proposalMetadata: readJson<ProposalMetadata[]>(
    here,
    'proposal-metadata.json'
  ),
  contextFile: readFileSync(join(base, 'context.py'), 'utf-8'),

  // Per-run extracted data lives beside runs.json, one file per table variable.
  // Read lazily per query: some png payloads are ~190 KB, so only the requested
  // (run, variable) is loaded when the ExtractedData query fires.
  extractedData(run: number | string, variable: string): ExtractedData {
    return readJson<ExtractedData>(
      join(base, 'data', String(run)),
      `${variable}.json`
    )
  },
}

export type Example = typeof XPCS

// The proposal numbers the example's user can access, flattened out of the
// semester buckets. The mock rejects any proposal outside this set.
export function accessibleProposals(example: Example): number[] {
  return Object.values(example.userInfo.proposals_by_year_half).flat()
}

// openProposal() opens proposalMetadata[0], so it must be accessible or every
// dashboard spec silently redirects to /not-found.
if (!accessibleProposals(XPCS).includes(XPCS.proposalMetadata[0].number)) {
  throw new Error(
    `proposalMetadata[0] (${XPCS.proposalMetadata[0].number}) is not accessible; ` +
      `update userinfo.json or proposal-metadata.json so openProposal() lands ` +
      `on an accessible proposal`
  )
}

// Run 1 fails in three ways, one per status-card kind: xgm_intensity errors on
// its own, opt_transmission loses its source, and total_transmission is skipped
// for that missing dependency (see context.py for the chain).
const TRANSMISSION_SOURCE = 'MID_AUXT2_ATT/MDL/ATT'
const XGM_SOURCE = 'SA2_XTD1_XGM/XGM/DOOCS'

const ERRORED_RUN = 1

type Failure = {
  variable: string
  title: string
  error: VariableError
}

const FAILURES: Failure[] = [
  {
    variable: 'xgm_intensity',
    title: 'Error',
    error: {
      cls: 'ValueError',
      message: `No pulse energy recorded for ${XGM_SOURCE}:output in this run.`,
    },
  },
  {
    variable: 'opt_transmission',
    title: 'Missing data',
    error: {
      cls: 'SourceNameError',
      message:
        `This data has no source named '${TRANSMISSION_SOURCE}'.\n` +
        'See data.all_sources for available sources.',
    },
  },
  {
    variable: 'total_transmission',
    title: 'Missing dependency',
    error: {
      cls: 'Skip',
      message:
        'Skipped due to missing dependency:\n' +
        `└ (opt_transmission) failed: SourceNameError: This data has no ` +
        `source named '${TRANSMISSION_SOURCE}'`,
    },
  },
]

// opt_transmission has no base variable, so append it as a trailing column.
// ERROR_CELLS resolves each hover column by name, so its position is free.
const erroredMeta: Example['meta'] = {
  ...XPCS.meta,
  variables: {
    ...XPCS.meta.variables,
    opt_transmission: {
      name: 'opt_transmission',
      title: 'Opt. trans.',
      tags: [],
    },
  },
}

// a11y grid column of a variable: its index among the meta columns, offset by
// one for the row-marker column. The demo data carries none of the app's
// EXCLUDED_VARIABLES, so every meta variable is a rendered column.
function columnOf(order: string[], name: string): number {
  const index = order.indexOf(name)
  if (index === -1) {
    throw new Error(
      `'${name}' is not a column in the example; update the fixture or the demo data`
    )
  }
  return index + 1
}

export const ERROR_CELLS = FAILURES.map((failure) => ({
  ...failure,
  col: columnOf(Object.keys(erroredMeta.variables), failure.variable),
}))

// Grid row of the errored run, derived so a reordered demo still hovers it.
export const ERROR_ROW = XPCS.meta.runs.indexOf(ERRORED_RUN)
if (ERROR_ROW === -1) {
  throw new Error(
    `run ${ERRORED_RUN} is not in the example; update the fixture or the demo data`
  )
}

// First image column of the plain XPCS example. Row 0 is run 1, whose image
// cells hold real base64 PNGs.
const imageVariable = Object.entries(XPCS.data[0].variables).find(
  ([, variable]) => variable.dtype === 'image'
)?.[0]
if (imageVariable === undefined) {
  throw new Error('the XPCS example has no image column for the preview test')
}
export const IMAGE_CELL = {
  col: columnOf(Object.keys(XPCS.meta.variables), imageVariable),
  row: 0,
}

function withErrorCells(run: RunData): RunData {
  const variables = { ...run.variables }
  for (const { variable, error } of FAILURES) {
    // Errored cells render from `error`; the backend nulls the value and falls
    // back to the string dtype, so mirror that.
    variables[variable] = { dtype: 'string', value: null, error }
  }
  return { ...run, variables }
}

// XPCS with run 1's transmission and XGM cells failed, so the status tooltips
// have real errors to explain. The global XPCS export stays pristine for the
// other specs.
export const xpcsWithErrors: Example = {
  ...XPCS,
  meta: erroredMeta,
  data: XPCS.data.map((run) =>
    run.variables.run.value === ERRORED_RUN ? withErrorCells(run) : run
  ),
}

// The home page shows one table per semester, so this example spreads proposals
// across a few. It keeps 6996 (so the dashboard link still works) and adds the
// real XFEL example proposals 700002/700003/700004.
//
// Grouping and the semester label come from the proposals_by_year_half key.
// Don't read the semester off start_date or damnit_path: the real paths and
// dates won't always line up with the semester a proposal sits under. (The app
// calls this key a "cycle", but it's really the semester.)
//
// 6996 and 700004 share the 202401 semester, so the sub-table has two rows to
// sort: 6996 is May 30, 700004 is May 31, and start_date-desc puts 700004 first.
const homeProposals: ProposalMetadata[] = [
  ...XPCS.proposalMetadata,
  {
    number: 700004,
    instrument: 'SQS',
    principal_investigator: 'Michael Meyer',
    start_date: '2024-05-31',
    title: 'SQS example data',
    damnit_path: '/gpfs/exfel/d/raw/XMPL/202450/p700004/usr/damnit',
  },
  {
    number: 700003,
    instrument: 'SCS',
    principal_investigator: 'Andreas Scherz',
    start_date: '2023-01-30',
    title: 'SCS example data',
    damnit_path: '/gpfs/exfel/d/raw/XMPL/202350/p700003/usr/damnit',
  },
  {
    number: 700002,
    instrument: 'FXE',
    principal_investigator: 'Christopher Milne',
    start_date: '2021-09-27',
    title: 'FXE example data',
    damnit_path: '/gpfs/exfel/d/raw/XMPL/202150/p700002/usr/damnit',
  },
]

// XPCS whose user owns proposals across three semesters, for the home page's
// semester-grouped proposal list.
export const xpcsWithProposals: Example = {
  ...XPCS,
  userInfo: {
    ...XPCS.userInfo,
    proposals_by_year_half: {
      '202401': [6996, 700004],
      '202350': [700003],
      '202150': [700002],
    },
  },
  proposalMetadata: homeProposals,
}
