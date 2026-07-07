import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Runs } from '@damnit-frontend/shared/mocks'

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
}

export type Example = typeof XPCS
