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
  match_status?: string
  match_quality?: string
  match_time_delta_s?: number
  hdf5_path?: string
  nexus_entry?: string
  metadata: Record<string, unknown> & {
    laser?: { pulse_energy?: number } & Record<string, unknown>
    status?: string
    target?: string | ({ name?: string } & Record<string, unknown>)
  }
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
}

export type HZDRShotDetail = {
  shot: HZDRShot
  hdf5_exists: boolean
  hdf5_datasets: HZDRHDF5Dataset[]
  hdf5_error?: string
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
  | 'png-originals'
  | 'dummy-analysis'
  | 'lli-parser'
  | 'tps-quick'

export type ShotcounterTKey =
  | 'draco01'
  | 'draco02'
  | 'draco04'
  | 'draco07'
  | 'draco08'

export type LinkCollectionStatus = {
  collection: string
  status: 'matched' | 'candidate' | 'missing'
  detail: string
}

export type LinkedShotRecord = {
  source_key: string
  source_title: string
  shot_number: number
  shot_id: string
  hdf5_path: string | null
  collections: LinkCollectionStatus[]
}

export type LinkRecordsDraft = {
  campaign_key: string | null
  target_source_key: string | null
  search: {
    collections: string[]
    shot_number: number | null
    searched_sources: number
  }
  linked_records: LinkedShotRecord[]
  output_targets: string[]
  review_required: boolean
  unresolved: string[]
}

export type BuiltLinkRecordsPackage = LinkRecordsDraft & {
  built_at: string
  coherent_json: {
    campaign_key: string | null
    shots: LinkedShotRecord[]
  }
  hdf5_plan: {
    source_count: number
    row_count: number
    mode: string
  }
  damnit_table_plan: {
    columns: string[]
    rows: number
  }
}

export type HZDRContextResults = {
  columns: {
    name: string
    title: string
  }[]
  rows: {
    shot_number: number
    values: Record<string, unknown>
    errors: Record<string, string>
    previews?: Record<string, unknown>
  }[]
}

export type HZDRSelectedCell = {
  shotNumber: number
  columnTitle: string
  columnName: string
  value: unknown
  error?: string
  preview?: unknown
  trendValues?: { shotNumber: number; value: number }[]
  kind: 'metadata' | 'context'
}

export type PlotlyPreview = {
  kind: 'plotly'
  json: string
}

export type HZDRFilterOperator =
  | 'includes'
  | 'equals'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'

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
