import type { Page, Route } from '@playwright/test'

// The HZDR pages read /config/* and /metadata/hzdr/*, which upstream's mock
// router leaves to the server. These answers are a small two-campaign fixture,
// enough to lay each page out; nothing reaches a real backend.

const TODAY = new Date()
const at = (hours: number) =>
  new Date(
    TODAY.getFullYear(),
    TODAY.getMonth(),
    TODAY.getDate(),
    hours
  ).toISOString()

export const HZDR_CAMPAIGN = 'Target_Alignment_11.2026'

const shot = (shot_number: number, hours: number) => ({
  source_key: HZDR_CAMPAIGN,
  shot_number,
  fired_at: at(hours),
  shot_key: `${HZDR_CAMPAIGN}:20261121:${shot_number}`,
  shot_date: '2026-11-21',
  match_status: 'matched',
  match_quality: 'exact_kafka_event_id',
  metadata: { status: 'processed', laser: { pulse_energy: 2.5 + shot_number } },
  events: [],
  data_products: [],
})

const SHOTS = [shot(101, 9), shot(102, 10), shot(103, 11)]

const SOURCE = {
  key: HZDR_CAMPAIGN,
  title: `HZDR canonical campaign (${HZDR_CAMPAIGN})`,
  damnit_path: '/data/damnit/a-campaign-with-a-long-folder-name',
  data_paths: [],
  metadata: { experiment_id: HZDR_CAMPAIGN },
  shots: SHOTS,
  review_events: [],
  match_summary: { matched: 3, ambiguous: 0, unmatched: 0 },
  staged_event_count: 3,
}

const SUMMARIES = [
  {
    key: HZDR_CAMPAIGN,
    title: SOURCE.title,
    damnit_path: SOURCE.damnit_path,
    shot_count: SHOTS.length,
    latest_shot_number: 103,
    last_shot_at: at(11),
    fired_since: 3,
    waiting: 2,
    needs_review: 1,
    needs_revision: 0,
    unreadable_times: 0,
  },
  {
    key: 'Pilot_Old_01.2026',
    title: 'HZDR canonical campaign (Pilot_Old_01.2026)',
    damnit_path: '/data/damnit/pilot',
    shot_count: 40,
    latest_shot_number: 40,
    last_shot_at: '2026-01-11T09:00:00Z',
    fired_since: 0,
    waiting: 0,
    needs_review: 0,
    needs_revision: 2,
    unreadable_times: 0,
  },
]

const RUNTIME = {
  profile: 'hzdr',
  auth_mode: 'none',
  ldap_form_enabled: false,
  metadata_provider: 'local',
  flow_monitor: {
    receivers: { laser_data: true, watchdog: true, mongo: true },
    live_traffic: false,
  },
  terminology: {
    identity_name: 'source',
    identity_name_plural: 'sources',
    identity_label: 'Campaign',
    identity_label_plural: 'Campaigns',
    collection_label: 'Shots',
    uses_proposals: false,
    uses_mymdc: false,
  },
}

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, json: body })

/** Answer every HZDR route the pages call; anything else is a 404. */
export async function mockHZDR(page: Page) {
  // Registered first, so the specific routes below win.
  await page.route(/^https?:\/\/[^/]+\/(metadata|config)\//, (route) =>
    json(route, { detail: 'not in the e2e fixture' }, 404)
  )
  await page.route('**/config/runtime', (route) => json(route, RUNTIME))
  await page.route('**/config/version', (route) =>
    json(route, { version: '0.3.1', commit: null })
  )
  await page.route('**/metadata/hzdr/source-summaries**', (route) =>
    json(route, SUMMARIES)
  )
  await page.route('**/metadata/hzdr/sources', (route) => json(route, [SOURCE]))
  await page.route(`**/metadata/hzdr/sources/${HZDR_CAMPAIGN}`, (route) =>
    json(route, SOURCE)
  )
  await page.route(`**/metadata/hzdr/sources/${HZDR_CAMPAIGN}/shots`, (route) =>
    json(route, SHOTS)
  )
  await page.route(
    `**/metadata/hzdr/sources/${HZDR_CAMPAIGN}/review`,
    (route) =>
      json(route, {
        match_summary: SOURCE.match_summary,
        review_events: [],
        unassigned_shots: [],
        experiment_rulings: [],
      })
  )
  await page.route(`**/metadata/hzdr/sources/${HZDR_CAMPAIGN}/views`, (route) =>
    json(route, [
      {
        id: 'v1',
        name: 'Energy first, newest shots',
        kind: 'table',
        state: {
          filterColumn: 'all',
          filterOperator: 'includes',
          filterValue: '',
          sortState: { column: 'laser_energy_j', direction: 'desc' },
          hiddenTableColumns: [],
          showHistoricalVersions: false,
          columnOrder: [],
        },
      },
    ])
  )
  // The shot page asks for this user's context-column results; none yet.
  await page.route('**/contextfile/campaign/**', (route) =>
    json(route, { detail: 'no context file' }, 404)
  )
}

/** How far the page scrolls sideways; 0 when it fits the viewport. */
export function horizontalOverflow(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  )
}
