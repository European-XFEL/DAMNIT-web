// Fake userinfo and proposal metadata, used by the e2e mocks and the app's mock
// mode.

// Wire shape returned by GET /oauth/userinfo (the app renames
// proposals_by_year_half -> proposals).
export type UserInfo = {
  uid: number
  username: string
  name: string
  email: string
  proposals_by_year_half: Record<string, number[]>
}

// Response objects for the ProposalMetadata GraphQL query.
export type ProposalMetadata = {
  number: number
  instrument: string
  principal_investigator: string
  start_date: string
  title: string
  damnit_path: string
}

// A user who can see only the XPCS proposal, 6996.
export const XPCS_USER: UserInfo = {
  uid: 1000,
  username: 'e2e',
  name: 'E2E Test User',
  email: 'e2e@xfel.eu',
  proposals_by_year_half: {
    '202401': [6996],
  },
}

// The proposal the demo's XPCS example data belongs to.
export const XPCS_PROPOSAL: ProposalMetadata = {
  number: 6996,
  instrument: 'MID',
  principal_investigator: 'Christian Gutt',
  start_date: '2024-05-30',
  title:
    'MHz XPCS enabled studies of dynamics, interactions and aggregation phenomena in protein solutions',
  damnit_path: '/gpfs/exfel/exp/MID/202401/p006996/usr/damnit',
}

// The home page shows one table per semester, so this list spreads proposals
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
export const HOME_PROPOSALS: ProposalMetadata[] = [
  XPCS_PROPOSAL,
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

// The semester buckets HOME_PROPOSALS sit in, as userinfo serves them.
export const HOME_SEMESTERS: UserInfo['proposals_by_year_half'] = {
  '202401': [6996, 700004],
  '202350': [700003],
  '202150': [700002],
}
