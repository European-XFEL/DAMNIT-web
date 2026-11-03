export type RuntimeConfig = {
  flow_monitor?: {
    receivers: {
      laser_data: boolean
      watchdog: boolean

      mongo: boolean
    }
  }
  terminology: {
    uses_proposals: boolean
    identity_label: string
    identity_label_plural: string
    collection_label: string
  }
}

export type HZDRShot = {
  source_key: string
  shot_number: number
  fired_at: string
  shot_key?: string
  shot_date?: string
  labfrog_record_id?: string
  labfrog_date_time?: string
  /** The experimenters' Count from LabFrog's local-counter reset: a user aid, not the shot number. */
  labfrog_local_count?: number | null
  match_status?: string
  match_quality?: string
  match_time_delta_s?: number
  /** Why the shot is in this campaign: labfrog, schedule, ruling, producer or unassigned. */
  experiment_id_source?: string | null
  hdf5_path?: string
  nexus_entry?: string
  metadata: Record<string, unknown> & {
    laser?: { pulse_energy?: number } & Record<string, unknown>
    status?: string
    target?: string | ({ name?: string } & Record<string, unknown>)
  }
  target_wiki_ref?: string | null
  target_wiki_page?: string | null
  events: HZDRSourceEvent[]
  data_products: HZDRDataProduct[]
}

export type HZDRSourceEvent = {
  event_id: string
  source: string
  kind: string
  timestamp: string
  transport?: string
  payload_ref: Record<string, unknown>
  metadata: Record<string, unknown>
  match_quality?: string
  match_time_delta_s?: number
}

export type HZDRDataProduct = {
  product_id?: string
  source: string
  kind: string
  path?: string
  dataset_name?: string
  preview_kind?: string
  shape: Array<number | string>
  dtype?: string
  units?: string
  metadata: Record<string, unknown>
  // Only in a shot detail: does the file exist on the API host (after the
  // path map)? null/absent when there is nothing local to check.
  reachable?: boolean | null
}

export type HZDRShotDetail = {
  shot: HZDRShot
  hdf5_exists: boolean
  hdf5_datasets: HZDRHDF5Dataset[]
  hdf5_error?: string
  // The shot's container as the campaign file links it; its datasets are
  // listed in hdf5_datasets under this prefix.
  container?: string | null
}

export type HZDRHDF5Dataset = {
  name: string
  shape: Array<number | string>
  dtype: string
}

export type HZDRDatasetKind = 'scalar' | 'line' | 'image' | 'stack' | 'raw'

export type HZDRDatasetOption = {
  value: string
  label: string
  name: string
  previewName: string
  dtype: string
  shape: Array<number | string>
  kind: HZDRDatasetKind
  group: string
}

export type SelectOption = {
  value: string
  label: string
}

export type SelectOptionGroup = {
  group: string
  items: SelectOption[]
}

export type HZDRSource = {
  key: string
  title: string
  damnit_path: string
  metadata: {
    facility?: string
    instrument?: string
    source_type?: string
  }
  shots: HZDRShot[]
}

export type HZDRDatasetPreview = {
  name: string
  dtype: string
  shape: number[]
  preview: number[][] | number[] | number | null
  preview_kind: 'image' | 'line' | 'scalar'
}

export type FlowPacket = {
  id: number
  lane: 'shotcounter' | 'watchdog' | 'laser' | 'package' | 'damnit'
  label: string
}

export type FlowLogEntry = {
  id: number
  at: string
  label: string
  detail: string
  tone: 'send' | 'stage' | 'receive'
}

export type FlowReceiverConfig = {
  laserData: boolean
  watchdog: boolean
  mongo: boolean
}

export type FlowMonitorMode = 'demo' | 'live'

export type FlowServiceHealth = {
  reachable: boolean
  latency_ms?: number | null
  detail?: string | null
}

// Mirrors the FastAPI GET /config/health payload (FlowMonitorHealth).
export type FlowMonitorHealth = {
  asapo: FlowServiceHealth
  kafka: FlowServiceHealth
  mongo: FlowServiceHealth
}

// Mirrors the FastAPI GET /config/flow-activity payload (FlowActivity).
export type KafkaTopicActivity = {
  topic: string
  exists: boolean
  messages: number
  partitions: number
  last_message_at?: string | null
}

export type KafkaActivity = {
  available: boolean
  detail?: string | null
  topics: KafkaTopicActivity[]
}

export type AsapoStreamActivity = {
  name: string
  messages: number
  last_message_at?: string | null
}

export type AsapoActivity = {
  available: boolean
  detail?: string | null
  streams: AsapoStreamActivity[]
}

export type SpoolFileActivity = {
  label: string
  campaign: string
  events: number
  modified_at?: string | null
  last_event_at?: string | null
}

export type SpoolActivity = {
  files: SpoolFileActivity[]
}

export type FlowActivity = {
  kafka: KafkaActivity
  spool: SpoolActivity
  asapo: AsapoActivity
}

export type FlowMonitorState = {
  laserBuffered: boolean
  laserStaged: boolean
  laserBrokerPending: boolean
  watchdogBuffered: boolean
  watchdogBrokerPending: boolean
  watchdogStaged: boolean
  mongoPending: boolean
  hdf5Built: boolean
}

export type WatchdogWatcherKey =
  'png-originals' | 'dummy-analysis' | 'lli-parser' | 'tps-quick'

export type ShotcounterTKey =
  'draco01' | 'draco02' | 'draco04' | 'draco07' | 'draco08'

// Mirrors the FastAPI HZDRMatchSummary.
export type HZDRMatchSummary = {
  matched: number
  ambiguous: number
  unmatched: number
  confirmed: number
  dismissed: number
}

// Mirrors the FastAPI HZDRReviewEvent: one ambiguous or unmatched event.
export type HZDRReviewEvent = {
  event_id: string
  experiment_id: string
  shot_number?: number | null
  source: string
  kind: string
  timestamp: string
  transport?: string | null
  payload_ref: Record<string, unknown>
  metadata: Record<string, unknown>
  match_status: 'ambiguous' | 'unmatched' | string
  match_quality?: string | null
  candidate_shot_keys: string[]
  acknowledged: boolean
  acknowledged_at?: string | null
  acknowledged_by?: string | null
  acknowledged_note?: string | null
  review_level?: string | null
}

// Mirrors the FastAPI HZDRExperimentRuling: a ruling waiting for a rebuild.
export type HZDRExperimentRuling = {
  shot_number: number
  experiment_id: string
  by?: string | null
  at?: string | null
  note?: string | null
  review_level?: string | null
}

// Mirrors GET /metadata/hzdr/sources/{key}/review (HZDRReviewResponse).
export type HZDRReview = {
  match_summary: HZDRMatchSummary
  review_events: HZDRReviewEvent[]
  unassigned_shots: HZDRShot[]
  experiment_rulings: HZDRExperimentRuling[]
}

export type HZDRContextResults = {
  columns: {
    name: string
    title: string
  }[]
  rows: {
    shot_number: number
    /** Absent from an older API; then rows can only be matched by number. */
    shot_key?: string | null
    values: Record<string, unknown>
    errors: Record<string, string>
    previews?: Record<string, unknown>
  }[]
}

/** One point of a per-shot trend; rowKey/label tell same-number shots apart. */
export type HZDRTrendValue = {
  shotNumber: number
  value: number
  rowKey?: string
  label?: string
}

export type HZDRSelectedCell = {
  shotNumber: number
  /** The selected row's identity (getShotRowKey), never just the number. */
  rowKey: string
  /** Shot number plus its day, for display. */
  shotLabel: string
  columnTitle: string
  columnName: string
  value: unknown
  error?: string
  preview?: unknown
  trendValues?: HZDRTrendValue[]
  kind: 'metadata' | 'context'
}

export type PlotlyPreview = {
  kind: 'plotly'
  json: string
}

export type HZDRFilterOperator =
  'includes' | 'equals' | 'gt' | 'gte' | 'lt' | 'lte'

export type HZDRSortState = {
  column: string
  direction: 'asc' | 'desc'
}

export type CampaignContextFile = {
  campaign: string
  user: string
  path: string
  lastModified: number
  fileContent: string
}

export type ContextFileEntry = {
  name: string
  path: string
  active: boolean
}

export type ContextVariableBlock = {
  id: string
  name: string
  title: string
  start: number
  end: number
  block: string
}

export type ContextBuilderFormState = {
  contextScope?: string
  fieldKind?: string
  fieldName?: string
  fieldTitle?: string
  selectedInputs?: string[]
  allowMultipleInputs?: boolean
  mongoCollection?: string
  mongoFilter?: string
  combineExpression?: string
}

export const watchdogWatcherOptions: {
  value: WatchdogWatcherKey
  label: string
  description: string
}[] = [
  {
    value: 'png-originals',
    label: 'PNG originals',
    description: 'set1_*_original.png with Draco01/Draco07 ZMQ attachment',
  },
  {
    value: 'dummy-analysis',
    label: 'Dummy analysis',
    description: 'script parser rule for generic dummy analysis files',
  },
  {
    value: 'lli-parser',
    label: 'LLI parser',
    description: 'LLI ToolResult CSV parser with Draco02/04/08 topics',
  },
  {
    value: 'tps-quick',
    label: 'TPS quick',
    description: 'simple TPS parser for particle spectrum text output',
  },
]

export const shotcounterTKeyOptions: {
  value: ShotcounterTKey
  label: string
  description: string
}[] = [
  {
    value: 'draco01',
    label: 'Draco01',
    description: 'primary shot notice TKEY',
  },
  {
    value: 'draco02',
    label: 'Draco02',
    description: 'LLI watcher fanout TKEY',
  },
  {
    value: 'draco04',
    label: 'Draco04',
    description: 'LLI watcher fanout TKEY',
  },
  {
    value: 'draco07',
    label: 'Draco07',
    description: 'PNG original attachment TKEY',
  },
  {
    value: 'draco08',
    label: 'Draco08',
    description: 'LLI watcher fanout TKEY',
  },
]

export const emptyFlowMonitorState: FlowMonitorState = {
  laserBuffered: false,
  laserStaged: false,
  laserBrokerPending: false,
  watchdogBuffered: false,
  watchdogBrokerPending: false,
  watchdogStaged: false,
  mongoPending: false,
  hdf5Built: false,
}
