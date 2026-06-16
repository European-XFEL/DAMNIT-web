import {
  type CSSProperties,
  type PropsWithChildren,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import Plotly from 'react-plotly.js'
import {
  Navigate,
  Route,
  Routes,
  useNavigate,
  useLocation,
  useParams,
} from 'react-router'
import { Container } from '@mantine/core'
import {
  Anchor,
  Badge,
  Button,
  Card,
  Checkbox,
  Code,
  Divider,
  Grid,
  Group,
  MultiSelect,
  Paper,
  Radio,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
  Title,
} from '@mantine/core'
import {
  IconActivityHeartbeat,
  IconArrowDown,
  IconArrowUp,
  IconBellRinging,
  IconBook,
  IconDatabase,
  IconPlayerPlay,
  IconRefresh,
  IconRoute,
  IconServer,
  IconVolume,
  IconVolumeOff,
} from '@tabler/icons-react'

import {
  Dashboard,
  Header,
  HomePage,
  LoggedOutPage,
  LoginRoute,
  LogoutRoute,
  Logo,
  NotFoundPage,
  PrivateRoute,
  Proposals,
  history,
  resetContextFile,
  resetDashboard,
  resetExtractedData,
  resetMetadata,
  resetPlots,
  resetTableData,
  resetTableView,
  setProposalPending,
  useAppDispatch,
  useProposal,
} from '@damnit-frontend/ui'

const SHOULD_SUBSCRIBE = !(import.meta.env.MODE === 'test')

const cellButtonStyle: CSSProperties = {
  width: '100%',
  border: 0,
  padding: 0,
  background: 'transparent',
  color: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
}

type FlowMonitorOption = {
  value: string
  label: string
  description?: string
}

type RuntimeConfig = {
  flow_monitor?: {
    receivers: {
      laser_data: boolean
      watchdog: boolean

      mongo: boolean
    }
    producers: {
      shotcounter: { enabled: boolean; tkeys: FlowMonitorOption[] }
      laser_data: { enabled: boolean }
      watchdog: { enabled: boolean; watchers: FlowMonitorOption[] }
      mongo: { enabled: boolean; updates_damnit_sqlite: boolean }
    }
  }
  terminology: {
    uses_proposals: boolean
    identity_label: string
    identity_label_plural: string
    collection_label: string
  }
}

type HZDRShot = {
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
    laser_energy_j?: number
    status?: string
    target?: string
  }
  events: HZDRSourceEvent[]
  data_products: HZDRDataProduct[]
}

type HZDRSourceEvent = {
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

type HZDRDataProduct = {
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

type HZDRShotDetail = {
  shot: HZDRShot
  hdf5_exists: boolean
  hdf5_datasets: HZDRHDF5Dataset[]
  hdf5_error?: string
}

type HZDRHDF5Dataset = {
  name: string
  shape: Array<number | string>
  dtype: string
}

type HZDRDatasetKind = 'scalar' | 'line' | 'image' | 'stack' | 'raw'

type HZDRDatasetOption = {
  value: string
  label: string
  name: string
  previewName: string
  dtype: string
  shape: Array<number | string>
  kind: HZDRDatasetKind
  group: string
}

type SelectOption = {
  value: string
  label: string
}

type SelectOptionGroup = {
  group: string
  items: SelectOption[]
}

type HZDRSource = {
  key: string
  title: string
  damnit_path: string
  metadata: {
    facility?: string
    instrument?: string
    source_type?: string
    catalog_built_at?: string
    combined_hdf5_path?: string
    canonical_nexus_path?: string
  }
  shots: HZDRShot[]
  review_events: HZDRReviewEvent[]
  match_summary: HZDRMatchSummary
  staged_event_count: number
}

type HZDRDatasetPreview = {
  name: string
  dtype: string
  shape: number[]
  preview: number[][] | number[] | number | null
  preview_kind: 'image' | 'line' | 'scalar'
}

type FlowPacket = {
  id: number
  lane: 'shotcounter' | 'watchdog' | 'laser' | 'package' | 'damnit'
  label: string
}

type FlowLogEntry = {
  id: number
  at: string
  label: string
  detail: string
  tone: 'send' | 'stage' | 'receive'
}

type FlowReceiverConfig = {
  laserData: boolean
  watchdog: boolean
  mongo: boolean
}

type FlowMonitorState = {
  laserBuffered: boolean
  laserStaged: boolean
  laserBrokerPending: boolean
  watchdogBuffered: boolean
  watchdogBrokerPending: boolean
  watchdogStaged: boolean
  mongoPending: boolean
  hdf5Built: boolean
}

// Shotcounter TKEYs and Watchdog watcher rules are configured server-side
// (DW_API_FLOW_MONITOR__PRODUCERS__... or the launcher's flowMonitor.producers
// config) and reported through GET /config/runtime, so their value sets are
// open-ended strings rather than fixed unions.
type WatchdogWatcherKey = string

type ShotcounterTKey = string

type HZDRMatchSummary = {
  matched: number
  ambiguous: number
  unmatched: number
  confirmed: number
  dismissed: number
}

type HZDRReviewEvent = {
  event_id: string
  experiment_id: string
  source: string
  kind: string
  timestamp: string
  transport?: string
  payload_ref: Record<string, unknown>
  metadata: Record<string, unknown>
  match_status: string
  match_quality?: string
  candidate_shot_keys: string[]
  acknowledged: boolean
  acknowledged_at?: string
  acknowledged_by?: string
  acknowledged_note?: string
}

type HZDRReviewResponse = {
  match_summary: HZDRMatchSummary
  review_events: HZDRReviewEvent[]
}

type HZDRContextResults = {
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

type HZDRSelectedCell = {
  shotNumber: number
  columnTitle: string
  columnName: string
  value: unknown
  error?: string
  preview?: unknown
  trendValues?: { shotNumber: number; value: number }[]
  kind: 'metadata' | 'context'
}

type PlotlyPreview = {
  kind: 'plotly'
  json: string
}

type HZDRFilterOperator = 'includes' | 'equals' | 'gt' | 'gte' | 'lt' | 'lte'

type HZDRSortState = {
  column: string
  direction: 'asc' | 'desc'
}

type CampaignContextFile = {
  campaign: string
  user: string
  path: string
  lastModified: number
  fileContent: string
}

type ContextFileEntry = {
  name: string
  path: string
  active: boolean
}

type ContextVariableBlock = {
  id: string
  name: string
  title: string
  start: number
  end: number
  block: string
}

type ContextBuilderFormState = {
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

// Local fallback option lists, used until GET /config/runtime resolves (or if
// an older API omits flow_monitor.producers). Mirrors the API's own built-in
// defaults (api/src/damnit_api/shared/settings.py) so the page renders
// something sensible for local testing even before runtime config loads.
const defaultShotcounterTKeyOptions: FlowMonitorOption[] = [
  { value: 'draco01', label: 'Draco01', description: 'primary shot notice TKEY' },
  { value: 'draco02', label: 'Draco02', description: 'LLI watcher fanout TKEY' },
  { value: 'draco04', label: 'Draco04', description: 'LLI watcher fanout TKEY' },
  {
    value: 'draco07',
    label: 'Draco07',
    description: 'PNG original attachment TKEY',
  },
  { value: 'draco08', label: 'Draco08', description: 'LLI watcher fanout TKEY' },
]

const defaultWatchdogWatcherOptions: FlowMonitorOption[] = [
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

const emptyFlowMonitorState: FlowMonitorState = {
  laserBuffered: false,
  laserStaged: false,
  laserBrokerPending: false,
  watchdogBuffered: false,
  watchdogBrokerPending: false,
  watchdogStaged: false,
  mongoPending: false,
  hdf5Built: false,
}

function useRuntimeConfig() {
  const [runtimeConfig, setRuntimeConfig] = useState<RuntimeConfig>()

  useEffect(() => {
    fetch('/config/runtime')
      .then((response) => response.json())
      .then(setRuntimeConfig)
  }, [])

  return runtimeConfig
}

function AppHeader() {
  return (
    <Header px={20}>
      <Group gap="md" wrap="nowrap">
        <Logo linkTo="/home" />
        <Button
          component="a"
          href="/flow-monitor"
          variant="subtle"
          size="sm"
          leftSection={<IconRoute size={16} />}
        >
          Flow monitor
        </Button>
        <Button
          component="a"
          href="/link-shot-records"
          variant="subtle"
          size="sm"
          leftSection={<IconDatabase size={16} />}
        >
          Link records
        </Button>
      </Group>
    </Header>
  )
}

function HZDRFlowMonitorPage() {
  const runtimeConfig = useRuntimeConfig()
  const [sources, setSources] = useState<HZDRSource[]>([])
  const [packets, setPackets] = useState<FlowPacket[]>([])
  const [logEntries, setLogEntries] = useState<FlowLogEntry[]>([])
  const [soundEnabled, setSoundEnabled] = useState(false)
  const [damnitPulse, setDamnitPulse] = useState(false)
  const [livePollPulse, setLivePollPulse] = useState(false)
  const [receiverConfig, setReceiverConfig] = useState<FlowReceiverConfig>({
    laserData: true,
    watchdog: true,
    mongo: true,
  })
  const shotcounterTKeyOptions =
    runtimeConfig?.flow_monitor?.producers.shotcounter.tkeys ??
    defaultShotcounterTKeyOptions
  const watchdogWatcherOptions =
    runtimeConfig?.flow_monitor?.producers.watchdog.watchers ??
    defaultWatchdogWatcherOptions
  const mongoProducerConfig = runtimeConfig?.flow_monitor?.producers.mongo
  const [selectedWatchdogWatchers, setSelectedWatchdogWatchers] = useState<
    WatchdogWatcherKey[]
  >(defaultWatchdogWatcherOptions.map((option) => option.value))
  const [selectedShotcounterTKeys, setSelectedShotcounterTKeys] = useState<
    ShotcounterTKey[]
  >(defaultShotcounterTKeyOptions.map((option) => option.value))
  const [flowState, setFlowState] = useState<FlowMonitorState>(
    emptyFlowMonitorState
  )
  const [selectedSourceKey, setSelectedSourceKey] = useState<string | null>(
    null
  )
  const receiverConfigLoaded = useRef(false)
  const producerSelectionLoaded = useRef(false)
  const lastShotTotal = useRef<number | undefined>(undefined)
  const nextPacketId = useRef(1)
  const nextLogId = useRef(1)

  useEffect(() => {
    const runtimeReceivers = runtimeConfig?.flow_monitor?.receivers
    if (!runtimeReceivers || receiverConfigLoaded.current) {
      return
    }
    receiverConfigLoaded.current = true
    setReceiverConfig({
      laserData: runtimeReceivers.laser_data,
      watchdog: runtimeReceivers.watchdog,
      mongo: runtimeReceivers.mongo,
    })
  }, [runtimeConfig?.flow_monitor?.receivers])

  // Default the operator's selection to every configured option once the
  // real lists arrive, so the page is immediately testable instead of
  // starting empty. After this first sync, selection is purely UI state -
  // an operator narrowing their choice should not get reset on the next poll.
  useEffect(() => {
    const producers = runtimeConfig?.flow_monitor?.producers
    if (!producers || producerSelectionLoaded.current) {
      return
    }
    producerSelectionLoaded.current = true
    setSelectedShotcounterTKeys(
      producers.shotcounter.tkeys.map((option) => option.value)
    )
    setSelectedWatchdogWatchers(
      producers.watchdog.watchers.map((option) => option.value)
    )
  }, [runtimeConfig?.flow_monitor?.producers])

  const shotTotal = sources.reduce(
    (total, source) => total + source.shots.length,
    0
  )
  const selectedSource =
    sources.find((source) => source.key === selectedSourceKey) ?? sources[0]
  const selectedSourceShots = selectedSource?.shots ?? []
  const latestShotNumber = selectedSourceShots.reduce(
    (latest, shot) => Math.max(latest, shot.shot_number),
    0
  )
  const nextShotNumber = latestShotNumber ? latestShotNumber + 1 : 123

  const addLogEntry = useCallback(
    (label: string, detail: string, tone: FlowLogEntry['tone']) => {
      const entry: FlowLogEntry = {
        id: nextLogId.current++,
        at: new Date().toLocaleTimeString(),
        label,
        detail,
        tone,
      }
      setLogEntries((currentEntries) => [entry, ...currentEntries].slice(0, 16))
    },
    []
  )

  const playBleep = useCallback(() => {
    if (!soundEnabled) {
      return
    }
    const AudioContextClass = window.AudioContext
    if (!AudioContextClass) {
      return
    }
    const context = new AudioContextClass()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.value = 880
    gain.gain.setValueAtTime(0.001, context.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.16)
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start()
    oscillator.stop(context.currentTime + 0.18)
    window.setTimeout(() => context.close(), 220)
  }, [soundEnabled])

  const triggerDamnitPulse = useCallback(
    (detail: string) => {
      setDamnitPulse(true)
      addLogEntry('DAMNIT received', detail, 'receive')
      playBleep()
      window.setTimeout(() => setDamnitPulse(false), 850)
    },
    [addLogEntry, playBleep]
  )

  const loadSources = useCallback(() => {
    fetch('/metadata/hzdr/sources')
      .then((response) => (response.ok ? response.json() : []))
      .then((loadedSources: HZDRSource[]) => {
        const loadedShotTotal = loadedSources.reduce(
          (total, source) => total + source.shots.length,
          0
        )
        setSources(loadedSources)
        setSelectedSourceKey(
          (currentKey) => currentKey ?? loadedSources[0]?.key ?? null
        )
        if (
          lastShotTotal.current !== undefined &&
          loadedShotTotal !== lastShotTotal.current
        ) {
          triggerDamnitPulse(
            `${loadedShotTotal} visible shot packages across ${loadedSources.length} source(s)`
          )
        }
        lastShotTotal.current = loadedShotTotal
      })
      .catch(() => {
        setSources([])
      })
  }, [triggerDamnitPulse])

  useEffect(() => {
    loadSources()
    const timer = window.setInterval(loadSources, 3000)
    return () => window.clearInterval(timer)
  }, [loadSources])

  const sendPacket = (
    lane: FlowPacket['lane'],
    label: string,
    detail: string
  ) => {
    const packet: FlowPacket = {
      id: nextPacketId.current++,
      lane,
      label,
    }
    setPackets((currentPackets) => [...currentPackets, packet])
    addLogEntry(label, detail, lane === 'damnit' ? 'receive' : 'send')
    window.setTimeout(() => {
      setPackets((currentPackets) =>
        currentPackets.filter((currentPacket) => currentPacket.id !== packet.id)
      )
      if (lane !== 'damnit') {
        addLogEntry(
          'Staged package',
          `${label} appended to events JSONL`,
          'stage'
        )
      }
    }, 1450)
  }

  const appendEmulatedShot = (
    source: string,
    kind: string,
    action: 'append' | 'enrich',
    lane: FlowPacket['lane'],
    label: string,
    detail: string,
    notifyDamnit = true
  ) => {
    const targetShotNumber =
      action === 'append' ? nextShotNumber : latestShotNumber || nextShotNumber
    sendPacket(
      lane,
      label,
      `${detail}; ${action === 'append' ? 'appending' : 'enriching'} shot ${targetShotNumber}`
    )
    fetch('/metadata/hzdr/emulator/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source,
        kind,
        action,
        source_key: selectedSource?.key,
      }),
    })
      .then((response) => requireJson<HZDRSource>(response))
      .then(() => {
        loadSources()
        if (notifyDamnit) {
          triggerDamnitPulse(
            action === 'append'
              ? `Shot ${targetShotNumber} appended to local emulator`
              : `Shot ${targetShotNumber} enriched in local emulator`
          )
        }
      })
      .catch(() => {
        addLogEntry(
          'Append failed',
          'Local emulator endpoint did not accept the event',
          'stage'
        )
      })
  }

  const sendLaserData = () => {
    if (!receiverConfig.laserData) {
      addLogEntry(
        'LaserData disabled',
        'Enable LaserData in the launcher flow-monitor config.',
        'stage'
      )
      return
    }

    appendEmulatedShot(
      'LaserData',
      'pulse_energy_j',
      'enrich',
      'laser',
      'LaserData enrichment',
      'LaserData latest metadata -> ASAPO broker',
      false
    )

    setFlowState((current) => {
      console.log('before LaserData enrich', current)
      return {
        ...current,
        laserBuffered: false,
        laserBrokerPending: true,
        laserStaged: false,
        hdf5Built: false,
      }
    })
  }

  const sendWatchdog = () => {
    if (!receiverConfig.watchdog) {
      addLogEntry(
        'Watchdog disabled',
        'Enable DAQ File Watchdog in the launcher flow-monitor config.',
        'stage'
      )
      return
    }
    if (!selectedWatchdogWatchers.length) {
      addLogEntry(
        'No Watchdog watchers selected',
        'Select at least one DAQ File Watchdog watcher rule.',
        'stage'
      )
      return
    }
    const watcherLabels = watchdogWatcherOptions
      .filter((option) => selectedWatchdogWatchers.includes(option.value))
      .map((option) => option.label)
      .join(', ')
    appendEmulatedShot(
      'DAQ File Watchdog',
      'watchdog_shot_event',
      'enrich',
      'watchdog',
      'Watchdog shot event',
      `DAQ File Watchdog (${watcherLabels}) -> Kafka broker`,
      false
    )
    setFlowState((current) => ({
      ...current,
      watchdogBuffered: false,
      watchdogBrokerPending: true,
      watchdogStaged: false,
      hdf5Built: false,
    }))
  }

  const sendShotcounter = () => {
    if (!selectedShotcounterTKeys.length) {
      addLogEntry(
        'No Shotcounter TKEYs selected',
        'Select at least one Shotcounter TKEY before publishing a shot notice.',
        'stage'
      )
      return
    }
    const tkeyLabels = shotcounterTKeyOptions
      .filter((option) => selectedShotcounterTKeys.includes(option.value))
      .map((option) => option.label)
      .join(', ')
    setFlowState({
      ...emptyFlowMonitorState,
      laserBuffered: receiverConfig.laserData,
      watchdogBuffered:
        receiverConfig.watchdog && selectedWatchdogWatchers.length > 0,
      mongoPending: receiverConfig.mongo,
    })
    appendEmulatedShot(
      'Shotcounter',
      'shot_counter_event',
      'append',
      'shotcounter',
      'Shotcounter event',
      `Shotcounter (${tkeyLabels}) -> ZMQ -> Kafka fanout -> subscribed systems`
    )
  }

  const buildPackage = () => {
    setFlowState((current) => ({
      ...current,
      laserBuffered: false,
      laserStaged: false,
      laserBrokerPending: false,
      watchdogBuffered: false,
      watchdogBrokerPending: false,
      watchdogStaged: false,
      mongoPending: false,
      hdf5Built:
        current.laserStaged || current.watchdogStaged || current.hdf5Built,
    }))
    sendPacket(
      'package',
      'Build HDF5 from staged events',
      `events/*.jsonl -> HDF5 builder -> combined experiment file; no new shot`
    )
  }

  const refreshDamnit = () => {
    setLivePollPulse(true)
    loadSources()
    triggerDamnitPulse(
      `${shotTotal} currently visible shot package(s); MongoDB/source metadata queried`
    )
    window.setTimeout(() => {
      setLivePollPulse(false)
      setFlowState((current) => ({
        ...current,
        laserStaged: current.laserStaged || current.laserBrokerPending,
        laserBrokerPending: false,
        watchdogStaged: current.watchdogStaged || current.watchdogBrokerPending,
        watchdogBrokerPending: false,
        mongoPending: false,
      }))
    }, 1100)
  }
  return (
    <HomePage
      header={<AppHeader />}
      main={
        <Container fluid py="md">
          <style>
            {`
              @keyframes hzdrPacketMove {
                from { transform: translateX(0); opacity: 0; }
                12% { opacity: 1; }
                84% { opacity: 1; }
                to { transform: translateX(calc(100vw - 520px)); opacity: 0; }
              }
              @keyframes hzdrFlowDash {
                to { stroke-dashoffset: -28; }
              }
              @keyframes hzdrNodePulse {
                0% { transform: scale(1); }
                50% { transform: scale(1.015); }
                100% { transform: scale(1); }
              }
              @keyframes hzdrPulse {
                0% { box-shadow: 0 0 0 0 rgba(20, 184, 166, 0.55); }
                70% { box-shadow: 0 0 0 18px rgba(20, 184, 166, 0); }
                100% { box-shadow: 0 0 0 0 rgba(20, 184, 166, 0); }
              }
            `}
          </style>
          <Stack gap="md">
            <Group justify="space-between" align="flex-end">
              <Stack gap={2}>
                <Title order={3}>HZDR flow monitor</Title>
                <Text size="sm" c="dimmed">
                  Live package traffic, staging, HDF5 builder state, and DAMNIT
                  metadata visibility. LaserData is a passive live stream; local
                  buttons emulate shotcounter, Watchdog, and builder events.
                </Text>
              </Stack>
              <Group gap="xs">
                <Button
                  variant="light"
                  leftSection={
                    soundEnabled ? (
                      <IconVolume size={16} />
                    ) : (
                      <IconVolumeOff size={16} />
                    )
                  }
                  onClick={() => setSoundEnabled((enabled) => !enabled)}
                >
                  Sound {soundEnabled ? 'on' : 'off'}
                </Button>
                <Button
                  variant="light"
                  leftSection={<IconRefresh size={16} />}
                  onClick={refreshDamnit}
                >
                  Poll DAMNIT
                </Button>
              </Group>
            </Group>

            <Grid gutter="md">
              <Grid.Col span={{ base: 12, xl: 9 }}>
                <FlowDiagram
                  packets={packets}
                  damnitPulse={damnitPulse}
                  livePollPulse={livePollPulse}
                  shotTotal={shotTotal}
                  sourceTotal={sources.length}
                  latestShotNumber={latestShotNumber}
                  nextShotNumber={nextShotNumber}
                  receiverConfig={receiverConfig}
                  shotcounterTKeyOptions={shotcounterTKeyOptions}
                  watchdogWatcherOptions={watchdogWatcherOptions}
                  mongoUpdatesDamnitSqlite={
                    mongoProducerConfig?.updates_damnit_sqlite ?? false
                  }
                  selectedWatchdogWatchers={selectedWatchdogWatchers}
                  selectedShotcounterTKeys={selectedShotcounterTKeys}
                  flowState={flowState}
                  onSelectedWatchdogWatchersChange={setSelectedWatchdogWatchers}
                  onSelectedShotcounterTKeysChange={setSelectedShotcounterTKeys}
                  onSendShotcounter={sendShotcounter}
                  onSendLaserData={sendLaserData}
                  onSendWatchdog={sendWatchdog}
                  onBuildPackage={buildPackage}
                  onRefreshDamnit={refreshDamnit}
                />
              </Grid.Col>

              <Grid.Col span={{ base: 12, xl: 3 }}>
                <Stack gap="md">
                  <Paper
                    withBorder
                    radius={4}
                    p="md"
                    style={{
                      animation: damnitPulse
                        ? 'hzdrPulse 0.85s ease-out'
                        : undefined,
                      borderColor: damnitPulse
                        ? 'var(--mantine-color-teal-5)'
                        : undefined,
                    }}
                  >
                    <Stack gap="sm">
                      <Group justify="space-between">
                        <Stack gap={2}>
                          <Text fw={700}>DAMNIT-web</Text>
                          <Text size="xs" c="dimmed">
                            API metadata provider and HDF5 reader
                          </Text>
                        </Stack>
                        <IconBellRinging
                          size={24}
                          color={
                            damnitPulse
                              ? 'var(--mantine-color-teal-7)'
                              : 'var(--mantine-color-gray-5)'
                          }
                        />
                      </Group>
                      <SimpleGrid cols={2}>
                        <Stack gap={0}>
                          <Text size="xs" c="dimmed">
                            Sources
                          </Text>
                          <Text size="xl" fw={700}>
                            {sources.length}
                          </Text>
                        </Stack>
                        <Stack gap={0}>
                          <Text size="xs" c="dimmed">
                            Shots
                          </Text>
                          <Text size="xl" fw={700}>
                            {shotTotal}
                          </Text>
                        </Stack>
                      </SimpleGrid>
                      <Paper withBorder radius={4} p="sm" bg="gray.0">
                        <SimpleGrid cols={2}>
                          <Stack gap={0}>
                            <Text size="xs" c="dimmed">
                              Latest shot
                            </Text>
                            <Text size="xl" fw={700}>
                              {latestShotNumber || '-'}
                            </Text>
                          </Stack>
                          <Stack gap={0}>
                            <Text size="xs" c="dimmed">
                              Next send
                            </Text>
                            <Text size="xl" fw={700}>
                              {nextShotNumber}
                            </Text>
                          </Stack>
                        </SimpleGrid>
                      </Paper>
                      {selectedSource ? (
                        <Paper withBorder radius={4} p="sm" bg="gray.0">
                          <Stack gap={6}>
                            <Text size="xs" c="dimmed" fw={700}>
                              Review status ({selectedSource.key})
                            </Text>
                            <SimpleGrid cols={3} spacing="xs">
                              <ReviewStatusFigure
                                label="Staged"
                                value={selectedSource.staged_event_count}
                              />
                              <ReviewStatusFigure
                                label="Matched"
                                value={selectedSource.match_summary.matched}
                                color="teal"
                              />
                              <ReviewStatusFigure
                                label="Ambiguous"
                                value={selectedSource.match_summary.ambiguous}
                                color="orange"
                              />
                              <ReviewStatusFigure
                                label="Unmatched"
                                value={selectedSource.match_summary.unmatched}
                                color="red"
                              />
                              <ReviewStatusFigure
                                label="Confirmed"
                                value={selectedSource.match_summary.confirmed}
                                color="teal"
                              />
                              <ReviewStatusFigure
                                label="Dismissed"
                                value={selectedSource.match_summary.dismissed}
                              />
                            </SimpleGrid>
                            <Divider />
                            <Group justify="space-between" gap="xs">
                              <Text size="xs" c="dimmed">
                                Last rebuild
                              </Text>
                              <Text size="xs">
                                {formatFlowMonitorTimestamp(
                                  selectedSource.metadata.catalog_built_at
                                )}
                              </Text>
                            </Group>
                            <Group justify="space-between" gap="xs">
                              <Text size="xs" c="dimmed">
                                Export path
                              </Text>
                              <Text size="xs" truncate>
                                {selectedSource.metadata.combined_hdf5_path ??
                                  selectedSource.metadata.canonical_nexus_path ??
                                  '-'}
                              </Text>
                            </Group>
                          </Stack>
                        </Paper>
                      ) : null}
                      <Divider />
                      <Stack gap="xs">
                        <Select
                          label="Current source"
                          value={selectedSource?.key ?? null}
                          onChange={setSelectedSourceKey}
                          data={sources.map((source) => ({
                            value: source.key,
                            label: source.title,
                          }))}
                          placeholder="No source loaded"
                          searchable
                        />
                        <Group gap="xs" grow>
                          <Button
                            component="a"
                            href={
                              selectedSource
                                ? `/source/${selectedSource.key}`
                                : '#'
                            }
                            variant="light"
                            disabled={!selectedSource}
                          >
                            Table data
                          </Button>
                          <Button
                            component="a"
                            href={
                              selectedSource
                                ? `/source/${selectedSource.key}/context-builder`
                                : '#'
                            }
                            variant="light"
                            disabled={!selectedSource}
                          >
                            Context
                          </Button>
                        </Group>
                      </Stack>
                      <Divider />
                      <Stack gap={6}>
                        {sources.slice(0, 5).map((source) => (
                          <Group key={source.key} justify="space-between">
                            <Anchor href={`/source/${source.key}`} size="sm">
                              {source.title}
                            </Anchor>
                            <Badge size="sm" variant="light">
                              {source.shots.length}
                            </Badge>
                          </Group>
                        ))}
                        {!sources.length ? (
                          <Text size="sm" c="dimmed">
                            No HZDR sources visible from the API yet.
                          </Text>
                        ) : null}
                      </Stack>
                    </Stack>
                  </Paper>

                  <Paper withBorder radius={4} p="md">
                    <Stack gap="xs">
                      <Text fw={700}>Traffic log</Text>
                      <ScrollArea h={290} type="auto">
                        <Stack gap="xs">
                          {logEntries.map((entry) => (
                            <Paper
                              key={entry.id}
                              withBorder
                              radius={4}
                              p="xs"
                              style={{
                                borderLeft: `4px solid ${
                                  entry.tone === 'receive'
                                    ? 'var(--mantine-color-teal-6)'
                                    : entry.tone === 'stage'
                                      ? 'var(--mantine-color-indigo-6)'
                                      : 'var(--mantine-color-orange-6)'
                                }`,
                              }}
                            >
                              <Group justify="space-between" gap="xs">
                                <Text size="sm" fw={600}>
                                  {entry.label}
                                </Text>
                                <Text size="xs" c="dimmed">
                                  {entry.at}
                                </Text>
                              </Group>
                              <Text size="xs" c="dimmed">
                                {entry.detail}
                              </Text>
                            </Paper>
                          ))}
                          {!logEntries.length ? (
                            <Text size="sm" c="dimmed">
                              LaserData is streaming when enabled. Use
                              Shotcounter, Watchdog, or DAMNIT actions to add
                              trace entries.
                            </Text>
                          ) : null}
                        </Stack>
                      </ScrollArea>
                    </Stack>
                  </Paper>
                </Stack>
              </Grid.Col>
            </Grid>
          </Stack>
        </Container>
      }
    />
  )
}

function FlowDiagram({
  packets,
  damnitPulse,
  livePollPulse,
  shotTotal,
  sourceTotal,
  latestShotNumber,
  nextShotNumber,
  receiverConfig,

  shotcounterTKeyOptions,
  watchdogWatcherOptions,
  mongoUpdatesDamnitSqlite,
  selectedWatchdogWatchers,
  selectedShotcounterTKeys,
  flowState,
  onSelectedWatchdogWatchersChange,
  onSelectedShotcounterTKeysChange,
  onSendShotcounter,
  onSendLaserData,
  onSendWatchdog,
  onBuildPackage,
  onRefreshDamnit,
}: {
  packets: FlowPacket[]
  damnitPulse: boolean
  livePollPulse: boolean
  shotTotal: number
  sourceTotal: number
  latestShotNumber: number
  nextShotNumber: number
  receiverConfig: FlowReceiverConfig

  shotcounterTKeyOptions: FlowMonitorOption[]
  watchdogWatcherOptions: FlowMonitorOption[]
  mongoUpdatesDamnitSqlite: boolean
  selectedWatchdogWatchers: WatchdogWatcherKey[]
  selectedShotcounterTKeys: ShotcounterTKey[]
  flowState: FlowMonitorState
  onSelectedWatchdogWatchersChange: (watchers: WatchdogWatcherKey[]) => void
  onSelectedShotcounterTKeysChange: (tkeys: ShotcounterTKey[]) => void
  onSendShotcounter: () => void
  onSendLaserData: () => void
  onSendWatchdog: () => void
  onBuildPackage: () => void
  onRefreshDamnit: () => void
}) {
  const activeShotcounter = packets.some(
    (packet) => packet.lane === 'shotcounter'
  )
  const activeWatchdogPacket = packets.some(
    (packet) => packet.lane === 'watchdog'
  )

  const activeLaserPacket = packets.some((packet) => packet.lane === 'laser')
  const activeLaser = flowState.laserBuffered

  const activePackagePacket = packets.some(
    (packet) => packet.lane === 'package'
  )
  const hasFanoutBuffer =
    flowState.laserBuffered ||
    flowState.watchdogBuffered ||
    flowState.mongoPending
  const activeWatchdog = activeWatchdogPacket || flowState.watchdogBuffered
  const activeLaserBroker = activeLaserPacket || flowState.laserBrokerPending
  const activeWatchdogBroker =
    activeWatchdogPacket || flowState.watchdogBrokerPending
  const activeMongoQuery = receiverConfig.mongo && livePollPulse
  const activeMongo = flowState.mongoPending || activeMongoQuery
  const activeIncomingLivePoll =
    livePollPulse &&
    (flowState.laserBrokerPending || flowState.watchdogBrokerPending)
  const activeLiveEventLog = flowState.laserStaged || flowState.watchdogStaged
  const activeLive = activeLiveEventLog || activeIncomingLivePoll
  const activeDamnitLive = activeLive || damnitPulse
  const activeHdf5Builder = activePackagePacket
  const activeCombinedHdf5 = flowState.hdf5Built
  const steadyTrafficCount =
    (flowState.laserBuffered ? 1 : 0) +
    (flowState.laserBrokerPending ? 1 : 0) +
    (flowState.watchdogBuffered ? 1 : 0) +
    (flowState.watchdogBrokerPending ? 1 : 0) +
    (flowState.mongoPending ? 1 : 0) +
    (activeLiveEventLog ? 1 : 0)

  return (
    <Paper
      withBorder
      radius={4}
      p="md"
      style={{
        minHeight: 'calc(100vh - 210px)',
        overflow: 'auto',
        background: '#f8fafc',
      }}
    >
      <Stack gap="sm">
        <Group justify="space-between">
          <Stack gap={0}>
            <Text fw={700}>Live system diagram</Text>
            <Text size="xs" c="dimmed">
              Producers append live events, DAMNIT-web watches staged state, and
              the HDF5 combine step is visible whether traffic is emulated or
              real.
            </Text>
          </Stack>
          <Group gap="xs">
            <Badge variant="light">latest {latestShotNumber || '-'}</Badge>
            <Badge variant="light" color="teal">
              next {nextShotNumber}
            </Badge>
            <Badge variant="light">
              {packets.length + steadyTrafficCount} traffic path(s)
            </Badge>
          </Group>
        </Group>
        <DetailsSection title="Flow monitor enablement">
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
            <Stack gap="xs">
              <Text fw={700} size="sm">
                Shotcounter available TKEYs
              </Text>
              <Checkbox.Group
                value={selectedShotcounterTKeys}
                onChange={(values) =>
                  onSelectedShotcounterTKeysChange(values as ShotcounterTKey[])
                }
              >
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
                  {shotcounterTKeyOptions.map((option) => (
                    <Checkbox
                      key={option.value}
                      value={option.value}
                      label={option.label}
                      description={option.description}
                    />
                  ))}
                </SimpleGrid>
              </Checkbox.Group>
            </Stack>
            <Stack gap="xs">
              <Text fw={700} size="sm">
                DAQ File available watchers
              </Text>
              <Checkbox.Group
                value={selectedWatchdogWatchers}
                onChange={(values) =>
                  onSelectedWatchdogWatchersChange(
                    values as WatchdogWatcherKey[]
                  )
                }
              >
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
                  {watchdogWatcherOptions.map((option) => (
                    <Checkbox
                      key={option.value}
                      value={option.value}
                      label={option.label}
                      description={option.description}
                      disabled={!receiverConfig.watchdog}
                    />
                  ))}
                </SimpleGrid>
              </Checkbox.Group>
            </Stack>
          </SimpleGrid>
        </DetailsSection>

        <div
          style={{
            width: '100%',
            display: 'grid',
            gridTemplateColumns:
              'minmax(150px, 1.1fr) minmax(70px, 0.5fr) minmax(150px, 1.1fr) minmax(70px, 0.5fr) minmax(170px, 1.2fr) minmax(70px, 0.5fr) minmax(180px, 1.25fr)',
            gridTemplateRows: 'repeat(5, minmax(104px, auto))',
            gap: 12,
            alignItems: 'center',
            minWidth: 920,
          }}
        >
          <ProgramNode
            title="Shotcounter"
            subtitle={`${selectedShotcounterTKeys.length} TKEY(s) selected; ZMQ shot notice, Kafka fanout`}
            active={activeShotcounter}
            icon={<IconServer size={24} />}
            color="grape"
            actions={[{ label: 'New shot', onClick: onSendShotcounter }]}
            style={{ gridColumn: 1, gridRow: 1 }}
          />
          <FlowConnector
            active={activeShotcounter || hasFanoutBuffer}
            color="grape"
            label="kafka fanout"
            style={{ gridColumn: 2, gridRow: 1 }}
          />
          <ProgramNode
            title="Kafka fanout"
            subtitle="shot notice distributed to subscribers"
            active={activeShotcounter || hasFanoutBuffer}
            icon={<IconRoute size={24} />}
            color="grape"
            style={{ gridColumn: 3, gridRow: 1 }}
          />
          <FlowConnector
            active={activeShotcounter || hasFanoutBuffer}
            color="cyan"
            label="buffer"
            style={{ gridColumn: 4, gridRow: 1 }}
          />
          <ProgramNode
            title="LaserData"
            subtitle="primary laser measurements"
            active={activeLaser}
            buffered={flowState.laserBuffered}
            icon={<IconServer size={24} />}
            color="blue"
            actions={[
              {
                label: 'Enrich latest',
                onClick: onSendLaserData,
                disabled: !receiverConfig.laserData,
              },
            ]}
            style={{ gridColumn: 1, gridRow: 2 }}
          />
          <FlowConnector
            active={activeLaserPacket || flowState.laserBrokerPending}
            color="blue"
            label="ASAPO"
            style={{ gridColumn: 2, gridRow: 2 }}
          />
          <ProgramNode
            title="ASAPO broker"
            subtitle="LaserData metadata topic"
            active={activeLaserBroker}
            buffered={flowState.laserBrokerPending || flowState.laserStaged}
            icon={<IconRoute size={24} />}
            color="blue"
            style={{ gridColumn: 3, gridRow: 2 }}
          />
          <FlowConnector
            active={
              flowState.laserStaged ||
              (livePollPulse && flowState.laserBrokerPending)
            }
            color="blue"
            label="poll"
            style={{ gridColumn: 4, gridRow: 2 }}
          />
          <ProgramNode
            title="DAQ File Watchdog"
            subtitle={`${selectedWatchdogWatchers.length} watcher rule(s) selected`}
            active={activeWatchdog}
            buffered={flowState.watchdogBuffered}
            icon={<IconActivityHeartbeat size={24} />}
            color="orange"
            actions={[
              {
                label: 'Enrich latest',
                onClick: onSendWatchdog,
                disabled:
                  !receiverConfig.watchdog || !selectedWatchdogWatchers.length,
              },
            ]}
            style={{ gridColumn: 1, gridRow: 3 }}
          />
          <FlowConnector
            active={activeWatchdogBroker}
            color="orange"
            label="kafka"
            style={{ gridColumn: 2, gridRow: 3 }}
          />
          <ProgramNode
            title="Kafka"
            subtitle="watchdog transport, local or production"
            active={activeWatchdogBroker}
            buffered={
              flowState.watchdogBrokerPending || flowState.watchdogStaged
            }
            icon={<IconRoute size={24} />}
            color="orange"
            style={{ gridColumn: 3, gridRow: 3 }}
          />
          <FlowConnector
            active={
              flowState.watchdogStaged ||
              (livePollPulse && flowState.watchdogBrokerPending)
            }
            color="orange"
            label="poll"
            style={{ gridColumn: 4, gridRow: 3 }}
          />

          <ProgramNode
            title="MongoDB shotsheet"
            subtitle={
              mongoUpdatesDamnitSqlite
                ? 'shot metadata source; updates related damnit-sqlite'
                : 'shot metadata source'
            }
            active={activeMongo}
            buffered={flowState.mongoPending}
            icon={<IconDatabase size={24} />}
            color="teal"
            style={{ gridColumn: 1, gridRow: 4 }}
          />
          <FlowConnector
            active={activeMongoQuery}
            color="teal"
            label="query"
            style={{ gridColumn: '2 / 5', gridRow: 4 }}
          />
          <ProgramNode
            title="Live event log"
            subtitle="staged packages keyed by shot_id"
            active={activeLive || activePackagePacket}
            buffered={activeLiveEventLog}
            icon={<IconDatabase size={24} />}
            color="teal"
            style={{ gridColumn: 5, gridRow: '1 / 4', alignSelf: 'stretch' }}
          />
          <FlowConnector
            active={activeDamnitLive}
            color="teal"
            label="visible"
            style={{ gridColumn: 6, gridRow: '1 / 4' }}
          />
          <ProgramNode
            title="DAMNIT-web live view"
            subtitle={`${sourceTotal} source(s), ${shotTotal} shot(s) visible`}
            active={activeDamnitLive}
            buffered={damnitPulse}
            icon={<IconBellRinging size={24} />}
            color="teal"
            actions={[
              { label: 'Poll live', onClick: onRefreshDamnit },
              { label: 'Build HDF5', onClick: onBuildPackage },
            ]}
            style={{ gridColumn: 7, gridRow: '1 / 4', alignSelf: 'stretch' }}
          />
          <ProgramNode
            title="HDF5 builder"
            subtitle="combines staged event packages"
            active={activeHdf5Builder}
            buffered={activeCombinedHdf5}
            icon={<IconServer size={24} />}
            color="teal"
            style={{ gridColumn: 5, gridRow: 4 }}
          />

          <FlowConnector
            active={activeHdf5Builder}
            color="teal"
            label="writes"
            style={{ gridColumn: 6, gridRow: 4 }}
          />

          <ProgramNode
            title="combined HDF5"
            subtitle="reader-ready experiment file"
            active={activeCombinedHdf5}
            icon={<IconDatabase size={24} />}
            color="teal"
            style={{ gridColumn: 7, gridRow: 4 }}
          />
        </div>
      </Stack>
    </Paper>
  )
}

function formatFlowMonitorTimestamp(value: string | undefined): string {
  if (!value) {
    return '-'
  }
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString()
}

function ReviewStatusFigure({
  label,
  value,
  color,
}: {
  label: string
  value: number
  color?: string
}) {
  return (
    <Stack gap={0}>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text size="md" fw={700} c={value > 0 ? color : undefined}>
        {value}
      </Text>
    </Stack>
  )
}

function ProgramNode({
  title,
  subtitle,
  active,
  buffered,
  icon,
  color,
  actions = [],
  style,
}: {
  title: string
  subtitle: string
  active: boolean
  buffered?: boolean
  icon: ReactNode
  color: 'orange' | 'blue' | 'teal' | 'violet' | 'grape' | 'cyan'
  actions?: { label: string; onClick: () => void; disabled?: boolean }[]
  style?: CSSProperties
}) {
  const colorVar = `var(--mantine-color-${color}-6)`
  return (
    <Paper
      withBorder
      radius={4}
      p="md"
      style={{
        width: '100%',
        height: '100%',
        minHeight: 104,
        borderColor: active ? colorVar : 'var(--mantine-color-gray-3)',
        background:
          active || buffered ? `var(--mantine-color-${color}-0)` : 'white',
        animation: active
          ? 'hzdrNodePulse 0.9s ease-in-out infinite'
          : undefined,
        ...style,
      }}
    >
      <Stack gap={6}>
        <Group wrap="nowrap" align="flex-start">
          <Paper
            withBorder
            radius={4}
            p={6}
            style={{
              background: active
                ? `var(--mantine-color-${color}-1)`
                : '#f8fafc',
              color: colorVar,
            }}
          >
            {icon}
          </Paper>
          <Stack gap={2}>
            <Text fw={700} size="sm">
              {title}
            </Text>
            <Text size="xs" c="dimmed">
              {subtitle}
            </Text>
          </Stack>
        </Group>
        {actions.length ? (
          <Stack gap={6}>
            {actions.map((action) => (
              <Button
                key={action.label}
                size="xs"
                color={color}
                leftSection={<IconPlayerPlay size={14} />}
                onClick={action.onClick}
                disabled={action.disabled}
                fullWidth
              >
                {action.label}
              </Button>
            ))}
          </Stack>
        ) : null}
      </Stack>
    </Paper>
  )
}

function FlowConnector({
  active,
  color,
  label,
  style,
}: {
  active: boolean
  color: 'orange' | 'blue' | 'teal' | 'violet' | 'grape' | 'cyan'
  label: string
  style?: CSSProperties
}) {
  const colorVar = `var(--mantine-color-${color}-6)`
  const markerId = `connector-arrow-${color}-${useId().replace(/:/g, '')}`
  return (
    <Stack
      gap={4}
      align="center"
      justify="center"
      style={{
        minHeight: 70,
        color: active ? colorVar : 'var(--mantine-color-gray-5)',
        ...style,
      }}
    >
      <svg
        viewBox="0 0 120 28"
        width="100%"
        height="28"
        role="img"
        style={{ overflow: 'visible' }}
      >
        <defs>
          <marker
            id={markerId}
            markerWidth="10"
            markerHeight="10"
            refX="8"
            refY="3"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M0,0 L0,6 L9,3 z" fill="currentColor" />
          </marker>
        </defs>
        <line
          x1="5"
          y1="14"
          x2="108"
          y2="14"
          stroke="currentColor"
          strokeWidth={active ? 4 : 2.5}
          strokeLinecap="round"
          strokeDasharray={active ? '9 7' : undefined}
          markerEnd={`url(#${markerId})`}
          style={{
            animation: active
              ? 'hzdrFlowDash 0.75s linear infinite'
              : undefined,
          }}
        />
        {active ? (
          <circle r="5" fill="currentColor">
            <animateMotion
              dur="1.05s"
              repeatCount="indefinite"
              path="M 8 14 L 102 14"
            />
          </circle>
        ) : null}
      </svg>
      <Text size="xs" fw={active ? 700 : 500} ta="center">
        {label}
      </Text>
    </Stack>
  )
}

function HZDRSourceHome() {
  const [sources, setSources] = useState<HZDRSource[]>([])

  useEffect(() => {
    const loadSources = () => {
      fetch('/metadata/hzdr/sources')
        .then((response) => response.json())
        .then(setSources)
        .catch((error) => {
          console.error('Failed to load HZDR sources', error)
        })
    }

    loadSources()
    const timer = window.setInterval(loadSources, 5000)
    return () => window.clearInterval(timer)
  }, [])

  const shotTotal = sources.reduce(
    (total, source) => total + source.shots.length,
    0
  )

  return (
    <Stack gap="lg" py="md">
      <Group justify="space-between" align="flex-end">
        <Stack gap={4}>
          <Title order={2}>DAMNIT! HZDR workspace</Title>
          <Text c="dimmed">
            Follow live source traffic into staged packages, context columns,
            trends, and HDF5 previews.
          </Text>
        </Stack>
        <Group gap="xs">
          <Badge variant="light">{sources.length} sources</Badge>
          <Badge variant="light">{shotTotal} shots</Badge>
        </Group>
      </Group>

      <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
        <Card withBorder radius={4} p="md">
          <Stack gap="xs">
            <Group gap="xs">
              <IconRoute size={18} />
              <Title order={4}>Watch the flow</Title>
            </Group>
            <Text size="sm" c="dimmed">
              Watch the passive LaserData stream plus local Shotcounter and
              Watchdog events as they move through DAMNIT.
            </Text>
            <Button component="a" href="/flow-monitor" variant="light">
              Flow monitor
            </Button>
          </Stack>
        </Card>
        <Card withBorder radius={4} p="md">
          <Stack gap="xs">
            <Group gap="xs">
              <IconDatabase size={18} />
              <Title order={4}>Inspect sources</Title>
            </Group>
            <Text size="sm" c="dimmed">
              Open the shot table, select numeric cells for trends, and preview
              context-rendered data.
            </Text>
            <Button
              component="a"
              href={sources[0] ? `/source/${sources[0].key}` : '/home'}
              variant="light"
              disabled={!sources[0]}
            >
              Open latest source
            </Button>
          </Stack>
        </Card>
        <Card withBorder radius={4} p="md">
          <Stack gap="xs">
            <Group gap="xs">
              <IconBook size={18} />
              <Title order={4}>Read the workflow</Title>
            </Group>
            <Text size="sm" c="dimmed">
              Use the HZDR docs page for the local launcher, connections, and
              package boundaries.
            </Text>
            <Button component="a" href="/docs" variant="light">
              Documentation
            </Button>
          </Stack>
        </Card>
      </SimpleGrid>

      <Stack gap="sm">
        <Group justify="space-between">
          <Title order={3}>Sources</Title>
          <Text size="sm" c="dimmed">
            DAMNIT folders currently visible to the HZDR provider.
          </Text>
        </Group>
        {sources.map((source) => (
          <Card key={source.key} withBorder radius={4} p="md">
            <Group justify="space-between" align="flex-start">
              <Stack gap={4}>
                <Anchor href={`/source/${source.key}`} fw={600}>
                  {source.title}
                </Anchor>
                <Text size="sm" c="dimmed">
                  {source.metadata.facility ?? 'HZDR'} /{' '}
                  {source.metadata.instrument ?? source.key}
                </Text>
                <Text size="xs" c="dimmed">
                  DAMNIT folder: {source.damnit_path}
                </Text>
              </Stack>
              <Badge>{source.shots.length} shots</Badge>
            </Group>
          </Card>
        ))}
      </Stack>
    </Stack>
  )
}

function HZDRDocsPage() {
  return (
    <HomePage
      header={<AppHeader />}
      main={
        <Container size="lg" py="xl">
          <Stack gap="lg">
            <Stack gap={4}>
              <Title order={2}>DAMNIT-web HZDR workflow</Title>
              <Text c="dimmed">
                Start with the short path, then expand the sections that match
                what you are trying to understand or debug.
              </Text>
            </Stack>
            <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
              <Card withBorder radius={4} p="md">
                <Stack gap="xs">
                  <Title order={4}>1. Produce</Title>
                  <Text size="sm">
                    LaserData creates new shots through the ASAPO path. Watchdog
                    events enrich the latest shot through Kafka.
                  </Text>
                </Stack>
              </Card>
              <Card withBorder radius={4} p="md">
                <Stack gap="xs">
                  <Title order={4}>2. Stage</Title>
                  <Text size="sm">
                    Normalized packages are appended to JSONL staging by
                    experiment and shot id.
                  </Text>
                </Stack>
              </Card>
              <Card withBorder radius={4} p="md">
                <Stack gap="xs">
                  <Title order={4}>3. Inspect</Title>
                  <Text size="sm">
                    DAMNIT-web reads sources, context columns, trends, and HDF5
                    previews from the generated stream.
                  </Text>
                </Stack>
              </Card>
            </SimpleGrid>
            <Group>
              <Button component="a" href="/flow-monitor">
                Flow monitor
              </Button>
              <Button component="a" href="/home" variant="light">
                Workspace
              </Button>
              <Button component="a" href="/api-docs" variant="light">
                API docs
              </Button>
            </Group>
            <Stack gap="sm">
              <DetailsSection title="Quick start" open>
                <Stack gap="xs">
                  <Text size="sm">
                    Create `scripts/hzdr-launch.config.json`, start the
                    launcher, open the workspace, then use the flow monitor to
                    send test Shotcounter and Watchdog traffic.
                  </Text>
                  <Code block>
                    bash scripts/hzdr-launch.sh --init-config{'\n'}
                    bash scripts/hzdr-launch.sh{'\n\n'}
                    powershell -NoProfile -ExecutionPolicy Bypass -File
                    .\scripts\hzdr-launch.ps1 -InitConfig{'\n'}
                    powershell -NoProfile -ExecutionPolicy Bypass -File
                    .\scripts\hzdr-launch.ps1
                  </Code>
                </Stack>
              </DetailsSection>
              <DetailsSection title="Data boundaries">
                <Stack gap="xs">
                  <Text size="sm">
                    LaserData creates new shots. Watchdog/Kafka enriches the
                    latest shot. Additional enrichment data follows the same
                    staged-event path. The HDF5 builder consumes staged JSONL
                    package events, not MongoDB.
                  </Text>
                  <Text size="sm" c="dimmed">
                    MongoDB remains the live source for shot metadata and
                    context joins. The package stream is the combine boundary.
                  </Text>
                  <Text size="sm" c="dimmed">
                    JSONL is live staging. HDF5 appears only after a build or
                    finalize trigger reads staged packages and writes the
                    combined experiment file.
                  </Text>
                </Stack>
              </DetailsSection>
              <DetailsSection title="JSONL to HDF5 trigger">
                <Stack gap="xs">
                  <Text size="sm">
                    In the emulator, the flow monitor's Build HDF5 button stands
                    in for the production builder trigger.
                  </Text>
                  <Text size="sm" c="dimmed">
                    In production, that trigger should come from the operational
                    package-builder path: a run-close hook, shot-set-complete
                    signal, scheduled builder job, or broker message. DAMNIT
                    should read the resulting HDF5; it should not be the thing
                    deciding how staged packages are combined.
                  </Text>
                </Stack>
              </DetailsSection>
              <DetailsSection title="Launcher and connections">
                <Stack gap="xs">
                  <Text size="sm">
                    PLANET Watchdog, LabFrog, Kafka, ASAPO, and MongoDB live
                    together in the shared launcher config so the emulator can
                    be converted toward real services without moving settings
                    around.
                  </Text>
                  <Code block>
                    scripts/hzdr-launch.config.json{'\n'}
                    scripts/hzdr-launch.config.example.json
                  </Code>
                </Stack>
              </DetailsSection>
              <DetailsSection title="Source table">
                <Stack gap="xs">
                  <Text size="sm">
                    The source table starts with fixed shot metadata, then adds
                    active context columns from `context.py`.
                  </Text>
                  <Text size="sm" c="dimmed">
                    Numeric cells open trends automatically. Plot-backed context
                    cells show an inline sparkline and render the full Plotly
                    preview in the selected-cell panel.
                  </Text>
                </Stack>
              </DetailsSection>
              <DetailsSection title="Context builder">
                <Stack gap="xs">
                  <Text size="sm">
                    Context files are saved per source and user. Single-input
                    modes are used for metadata, HDF5 summaries, image/lineout
                    previews, Plotly previews, and Mongo queries.
                  </Text>
                  <Text size="sm" c="dimmed">
                    Multi-input selection is reserved for custom functions where
                    combining several values is expected.
                  </Text>
                </Stack>
              </DetailsSection>
              <DetailsSection title="Verification">
                <Stack gap="xs">
                  <Text size="sm">
                    Use the watchdog verifier when you need to test Kafka first
                    and fall back through ASAPO/local broker and MongoDB.
                  </Text>
                  <Code block>
                    cd api{'\n'}# use `uv run` for local/dev verification
                    scripts uv run python scripts/verify-hzdr-watchdog.py
                    --config ..\scripts\hzdr-launch.config.json --mode auto
                  </Code>
                </Stack>
              </DetailsSection>
              <DetailsSection title="API reference">
                <Stack gap="xs">
                  <Text size="sm">
                    This page is the expandable HZDR workflow guide. Use the API
                    reference when you need the generated backend endpoint docs.
                  </Text>
                  <Button component="a" href="/api-docs" variant="light">
                    Open API reference
                  </Button>
                </Stack>
              </DetailsSection>
            </Stack>
          </Stack>
        </Container>
      }
    />
  )
}

function LinkExistingShotRecordsPage() {
  const [sources, setSources] = useState<HZDRSource[]>([])
  const [selectedSourceKey, setSelectedSourceKey] = useState<string | null>(
    null
  )
  const [review, setReview] = useState<HZDRReviewResponse>()
  const [loadError, setLoadError] = useState<string>()
  const [actionError, setActionError] = useState<string>()
  const [actionStatus, setActionStatus] = useState<string>()
  const [candidateChoices, setCandidateChoices] = useState<
    Record<string, string | null>
  >({})
  const [dismissNotes, setDismissNotes] = useState<Record<string, string>>({})

  useEffect(() => {
    fetch('/metadata/hzdr/sources')
      .then((response) => requireJson<HZDRSource[]>(response))
      .then((loadedSources) => {
        setSources(loadedSources)
        setSelectedSourceKey((currentKey) => {
          if (
            currentKey &&
            loadedSources.some((source) => source.key === currentKey)
          ) {
            return currentKey
          }
          return loadedSources[0]?.key ?? null
        })
      })
      .catch(() => setSources([]))
  }, [])

  const loadReview = useCallback(() => {
    if (!selectedSourceKey) {
      setReview(undefined)
      return
    }
    setLoadError(undefined)
    fetch(`/metadata/hzdr/sources/${selectedSourceKey}/review`)
      .then((response) => requireJson<HZDRReviewResponse>(response))
      .then(setReview)
      .catch(() => {
        setReview(undefined)
        setLoadError('Could not load review events for this source.')
      })
  }, [selectedSourceKey])

  useEffect(() => {
    loadReview()
  }, [loadReview])

  const ambiguousEvents = (review?.review_events ?? []).filter(
    (event) => event.match_status === 'ambiguous'
  )
  const unmatchedEvents = (review?.review_events ?? []).filter(
    (event) => event.match_status === 'unmatched'
  )

  const confirmEvent = (event: HZDRReviewEvent) => {
    const shotKey = candidateChoices[event.event_id]
    if (!selectedSourceKey || !shotKey) {
      return
    }
    setActionError(undefined)
    fetch(
      `/metadata/hzdr/sources/${selectedSourceKey}/review/${event.event_id}/confirm`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shot_key: shotKey }),
      }
    )
      .then((response) => requireJson<HZDRSource>(response))
      .then(() => {
        setActionStatus(`Confirmed event ${event.event_id} to ${shotKey}.`)
        loadReview()
      })
      .catch(() => setActionError(`Could not confirm event ${event.event_id}.`))
  }

  const dismissEvent = (event: HZDRReviewEvent) => {
    if (!selectedSourceKey) {
      return
    }
    setActionError(undefined)
    fetch(
      `/metadata/hzdr/sources/${selectedSourceKey}/review/${event.event_id}/dismiss`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          note: dismissNotes[event.event_id]?.trim() || undefined,
        }),
      }
    )
      .then((response) => requireJson<HZDRSource>(response))
      .then(() => {
        setActionStatus(`Acknowledged event ${event.event_id}.`)
        loadReview()
      })
      .catch(() => setActionError(`Could not dismiss event ${event.event_id}.`))
  }

  return (
    <HomePage
      header={<AppHeader />}
      main={
        <Container size="lg" py="xl">
          <Stack gap="lg">
            <Stack gap={4}>
              <Title order={2}>Confirm Matches</Title>
              <Text c="dimmed">
                Review ambiguous and unmatched HZDR events for one source, and
                confirm or acknowledge them.
              </Text>
              <Text size="sm" c="orange">
                Review actions are saved to the local catalog only and may be
                reset if the HZDR builder is rerun.
              </Text>
            </Stack>
            <Select
              label="Source"
              value={selectedSourceKey}
              onChange={setSelectedSourceKey}
              data={sources.map((source) => ({
                value: source.key,
                label: `${source.title} (${source.shots.length})`,
              }))}
              placeholder="Choose a source"
              searchable
            />
            {loadError ? (
              <Text size="sm" c="red">
                {loadError}
              </Text>
            ) : null}
            {actionError ? (
              <Text size="sm" c="red">
                {actionError}
              </Text>
            ) : null}
            {actionStatus ? (
              <Text size="sm" c="teal">
                {actionStatus}
              </Text>
            ) : null}
            {review ? (
              <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
                <Card withBorder radius={4} p="md">
                  <Stack gap={2}>
                    <Text size="sm" c="dimmed">
                      Matched
                    </Text>
                    <Title order={3}>{review.match_summary.matched}</Title>
                  </Stack>
                </Card>
                <Card withBorder radius={4} p="md">
                  <Stack gap={2}>
                    <Text size="sm" c="dimmed">
                      Ambiguous
                    </Text>
                    <Title order={3}>{review.match_summary.ambiguous}</Title>
                  </Stack>
                </Card>
                <Card withBorder radius={4} p="md">
                  <Stack gap={2}>
                    <Text size="sm" c="dimmed">
                      Unmatched
                    </Text>
                    <Title order={3}>{review.match_summary.unmatched}</Title>
                  </Stack>
                </Card>
              </SimpleGrid>
            ) : null}

            <Stack gap="sm">
              <Title order={4}>Ambiguous events</Title>
              {ambiguousEvents.length === 0 ? (
                <Text size="sm" c="dimmed">
                  No ambiguous events awaiting review.
                </Text>
              ) : (
                ambiguousEvents.map((event) => (
                  <Card key={event.event_id} withBorder radius={4} p="md">
                    <Stack gap="xs">
                      <Group justify="space-between" align="flex-start">
                        <Stack gap={2}>
                          <Text fw={700}>{event.event_id}</Text>
                          <Text size="xs" c="dimmed">
                            {event.source} / {event.kind}
                            {event.transport ? ` / ${event.transport}` : ''}
                          </Text>
                          <Text size="xs" c="dimmed">
                            {event.timestamp}
                          </Text>
                        </Stack>
                        <Badge variant="light">{event.match_quality ?? '-'}</Badge>
                      </Group>
                      <Group align="flex-end" gap="sm">
                        <Select
                          label="Candidate shot"
                          value={candidateChoices[event.event_id] ?? null}
                          onChange={(value) =>
                            setCandidateChoices((current) => ({
                              ...current,
                              [event.event_id]: value,
                            }))
                          }
                          data={event.candidate_shot_keys.map((shotKey) => ({
                            value: shotKey,
                            label: shotKey,
                          }))}
                          placeholder="Choose a candidate shot key"
                          style={{ flex: '1 1 240px' }}
                        />
                        <Button
                          size="xs"
                          disabled={!candidateChoices[event.event_id]}
                          onClick={() => confirmEvent(event)}
                        >
                          Confirm
                        </Button>
                      </Group>
                    </Stack>
                  </Card>
                ))
              )}
            </Stack>

            <Stack gap="sm">
              <Title order={4}>Unmatched events</Title>
              {unmatchedEvents.length === 0 ? (
                <Text size="sm" c="dimmed">
                  No unmatched events awaiting review.
                </Text>
              ) : (
                unmatchedEvents.map((event) => (
                  <Card key={event.event_id} withBorder radius={4} p="md">
                    <Stack gap="xs">
                      <Group justify="space-between" align="flex-start">
                        <Stack gap={2}>
                          <Text fw={700}>{event.event_id}</Text>
                          <Text size="xs" c="dimmed">
                            {event.source} / {event.kind}
                            {event.transport ? ` / ${event.transport}` : ''}
                          </Text>
                          <Text size="xs" c="dimmed">
                            {event.timestamp}
                          </Text>
                        </Stack>
                        {event.acknowledged ? (
                          <Badge color="teal" variant="light">
                            Acknowledged
                          </Badge>
                        ) : null}
                      </Group>
                      <Group align="flex-end" gap="sm">
                        <TextInput
                          label="Note (optional)"
                          value={dismissNotes[event.event_id] ?? ''}
                          onChange={(changeEvent) =>
                            setDismissNotes((current) => ({
                              ...current,
                              [event.event_id]: changeEvent.currentTarget.value,
                            }))
                          }
                          style={{ flex: '1 1 240px' }}
                        />
                        <Button
                          size="xs"
                          variant="light"
                          disabled={event.acknowledged}
                          onClick={() => dismissEvent(event)}
                        >
                          Acknowledge
                        </Button>
                      </Group>
                    </Stack>
                  </Card>
                ))
              )}
            </Stack>
          </Stack>
        </Container>
      }
    />
  )
}

function HZDRShotPage() {
  const { source_key } = useParams()
  const [source, setSource] = useState<HZDRSource>()
  const [shots, setShots] = useState<HZDRShot[]>([])
  const [availableSources, setAvailableSources] = useState<HZDRSource[]>([])
  const [selectedShotNumber, setSelectedShotNumber] = useState<number>()
  const [shotDetail, setShotDetail] = useState<HZDRShotDetail>()
  const [contextResults, setContextResults] = useState<HZDRContextResults>()
  const [filterColumn, setFilterColumn] = useState('all')
  const [filterOperator, setFilterOperator] =
    useState<HZDRFilterOperator>('includes')
  const [filterValue, setFilterValue] = useState('')
  const [sortState, setSortState] = useState<HZDRSortState>({
    column: 'shot_number',
    direction: 'asc',
  })
  const [hiddenTableColumns, setHiddenTableColumns] = useState<string[]>([])
  const [selectedCell, setSelectedCell] = useState<HZDRSelectedCell>()

  useEffect(() => {
    const loadShotPageData = () => {
      if (!source_key) {
        return
      }

      fetch(`/metadata/hzdr/sources/${source_key}`)
        .then((response) => response.json())
        .then(setSource)

      fetch(`/metadata/hzdr/sources/${source_key}/shots`)
        .then((response) => response.json())
        .then((loadedShots: HZDRShot[]) => {
          setShots(loadedShots)
          setSelectedShotNumber((currentShotNumber) => {
            if (
              currentShotNumber &&
              loadedShots.some((shot) => shot.shot_number === currentShotNumber)
            ) {
              return currentShotNumber
            }
            return loadedShots[0]?.shot_number
          })
        })

      fetch('/metadata/hzdr/sources')
        .then((response) => response.json())
        .then(setAvailableSources)

      fetch(`/contextfile/campaign/${source_key}/me/results`)
        .then((response) => (response.ok ? response.json() : undefined))
        .then(setContextResults)
    }

    loadShotPageData()
  }, [source_key])

  useEffect(() => {
    if (!source_key || !selectedShotNumber) {
      setShotDetail(undefined)
      return
    }

    fetch(`/metadata/hzdr/sources/${source_key}/shots/${selectedShotNumber}`)
      .then((response) => response.json())
      .then(setShotDetail)
  }, [source_key, selectedShotNumber])

  const selectedShot = shots.find(
    (shot) => shot.shot_number === selectedShotNumber
  )
  const contextRowsByShot = new Map(
    contextResults?.rows.map((row) => [row.shot_number, row]) ?? []
  )
  const shotDayLabels = buildShotDayLabels(shots)
  const filterColumnOptions = [
    { value: 'all', label: 'All visible columns' },
    { value: 'shot_number', label: 'Shot' },
    { value: 'shot_day', label: 'Day' },
    { value: 'fired_at', label: 'Fired at' },
    { value: 'status', label: 'Status' },
    { value: 'laser_energy_j', label: 'Energy' },
    { value: 'target', label: 'Target' },
    ...(contextResults?.columns.map((column) => ({
      value: `context:${column.name}`,
      label: column.title,
    })) ?? []),
  ]
  const tableColumnOptions = [
    { value: 'shot_number', label: 'Shot' },
    { value: 'shot_day', label: 'Day' },
    { value: 'fired_at', label: 'Fired at' },
    { value: 'status', label: 'Status' },
    { value: 'laser_energy_j', label: 'Energy' },
    { value: 'target', label: 'Target' },
    ...(contextResults?.columns.map((column) => ({
      value: `context:${column.name}`,
      label: column.title,
    })) ?? []),
  ]
  const visibleTableColumns = tableColumnOptions
    .map((option) => option.value)
    .filter((column) => !hiddenTableColumns.includes(column))
  const isTableColumnVisible = (column: string) =>
    visibleTableColumns.includes(column)
  const visibleContextColumns =
    contextResults?.columns.filter((column) =>
      isTableColumnVisible(`context:${column.name}`)
    ) ?? []
  const tableMinWidth = Math.max(
    680,
    [
      isTableColumnVisible('shot_number') ? 86 : 0,
      isTableColumnVisible('shot_day') ? 92 : 0,
      isTableColumnVisible('fired_at') ? 168 : 0,
      isTableColumnVisible('status') ? 112 : 0,
      isTableColumnVisible('laser_energy_j') ? 96 : 0,
      isTableColumnVisible('target') ? 110 : 0,
      visibleContextColumns.length * 180,
    ].reduce((total, width) => total + width, 0)
  )
  const visibleShots = shots
    .filter((shot) =>
      shotMatchesTableFilter(
        shot,
        filterColumn,
        filterOperator,
        filterValue,
        contextRowsByShot.get(shot.shot_number),
        shotDayLabels.get(shot.shot_number)
      )
    )
    .sort((leftShot, rightShot) =>
      compareHZDRShotsForTableSort(
        leftShot,
        rightShot,
        sortState,
        contextRowsByShot,
        shotDayLabels
      )
    )
  const sourceOptions = availableSources.map((entry) => ({
    value: entry.key,
    label: `${entry.title} (${entry.shots.length})`,
  }))
  const toggleSort = (column: string) => {
    setSortState((currentSort) =>
      currentSort.column === column
        ? {
            column,
            direction: currentSort.direction === 'asc' ? 'desc' : 'asc',
          }
        : { column, direction: 'asc' }
    )
  }
  const buildMetadataTrendValues = (metadataKey: string) =>
    shots
      .map((shot) => ({
        shotNumber: shot.shot_number,
        value: Number(getNestedMetadataValue(shot.metadata, metadataKey)),
      }))
      .filter((entry) => Number.isFinite(entry.value))
  const buildContextTrendValues = (columnName: string) =>
    (contextResults?.rows ?? [])
      .map((row) => ({
        shotNumber: row.shot_number,
        value: Number(row.values[columnName]),
      }))
      .filter((entry) => Number.isFinite(entry.value))
  const selectMetadataCell = (
    shot: HZDRShot,
    columnTitle: string,
    columnName: string,
    value: unknown,
    metadataTrendKey?: string
  ) => {
    setSelectedShotNumber(shot.shot_number)
    setSelectedCell({
      shotNumber: shot.shot_number,
      columnTitle,
      columnName,
      value,
      trendValues: metadataTrendKey
        ? buildMetadataTrendValues(metadataTrendKey)
        : undefined,
      kind: 'metadata',
    })
  }
  const updateShotStatus = (
    shotNumber: number,
    status: string,
    note?: string
  ) => {
    if (!source_key) {
      return
    }
    fetch(`/metadata/hzdr/sources/${source_key}/shots/${shotNumber}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, note }),
    })
      .then((response) => requireJson<HZDRShot>(response))
      .then((updatedShot) => {
        setShots((currentShots) =>
          currentShots.map((shot) =>
            shot.shot_number === updatedShot.shot_number ? updatedShot : shot
          )
        )
        setShotDetail((currentDetail) =>
          currentDetail?.shot.shot_number === updatedShot.shot_number
            ? { ...currentDetail, shot: updatedShot }
            : currentDetail
        )
        setSelectedCell(undefined)
      })
      .catch(() => {
        setSelectedCell({
          shotNumber,
          columnTitle: 'Status update',
          columnName: 'status',
          value: status,
          error: 'Could not update shot status.',
          kind: 'metadata',
        })
      })
  }
  const updateShotMetadata = (
    shotNumber: number,
    key: string,
    value: unknown,
    note?: string
  ) => {
    if (!source_key) {
      return
    }
    fetch(`/metadata/hzdr/sources/${source_key}/shots/${shotNumber}/metadata`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value, note }),
    })
      .then((response) => requireJson<HZDRShot>(response))
      .then((updatedShot) => {
        setShots((currentShots) =>
          currentShots.map((shot) =>
            shot.shot_number === updatedShot.shot_number ? updatedShot : shot
          )
        )
        setShotDetail((currentDetail) =>
          currentDetail?.shot.shot_number === updatedShot.shot_number
            ? { ...currentDetail, shot: updatedShot }
            : currentDetail
        )
        setSelectedCell((currentCell) => {
          if (
            !currentCell ||
            currentCell.kind !== 'metadata' ||
            currentCell.shotNumber !== updatedShot.shot_number ||
            currentCell.columnName !== key
          ) {
            return currentCell
          }
          const correctedValue = updatedShot.metadata[key]
          const numericValue = Number(correctedValue)
          return {
            ...currentCell,
            value: correctedValue,
            error: undefined,
            trendValues: currentCell.trendValues?.map((entry) =>
              entry.shotNumber === updatedShot.shot_number &&
              Number.isFinite(numericValue)
                ? { ...entry, value: numericValue }
                : entry
            ),
          }
        })
        fetch(`/contextfile/campaign/${source_key}/me/results`)
          .then((response) => (response.ok ? response.json() : undefined))
          .then(setContextResults)
      })
      .catch(() => {
        setSelectedCell((currentCell) =>
          currentCell?.shotNumber === shotNumber &&
          currentCell.columnName === key
            ? { ...currentCell, error: `Could not correct ${key}.` }
            : currentCell
        )
      })
  }

  return (
    <HomePage
      header={<AppHeader />}
      main={
        <Container fluid py="md">
          <Stack gap="md">
            <Card withBorder radius={4} p="md">
              <Group justify="space-between" align="flex-start">
                <Stack gap={4} style={{ flex: 1, minWidth: 280 }}>
                  <Group gap="xs">
                    <Title order={3}>{source?.title ?? source_key}</Title>
                    <Badge variant="light">Emulated package stream</Badge>
                  </Group>
                  <Text size="sm" c="dimmed">
                    LaserData creates shots, Watchdog enriches them, and staged
                    events feed the HDF5 builder.
                  </Text>
                  <Code block>{source?.damnit_path ?? '-'}</Code>
                </Stack>
                <Stack gap="xs" style={{ minWidth: 260 }}>
                  <Select
                    label="Source"
                    value={source_key ?? null}
                    data={sourceOptions}
                    onChange={(value) => {
                      if (value) {
                        history.navigate(`/source/${value}`)
                      }
                    }}
                    searchable
                  />
                </Stack>
              </Group>
            </Card>

            <Grid gutter="md">
              <Grid.Col span={{ base: 12, xl: 10 }}>
                <Card withBorder radius={4} p="md">
                  <Group align="flex-end" gap="sm">
                    <Select
                      label="Filter column"
                      value={filterColumn}
                      onChange={(value) => setFilterColumn(value ?? 'all')}
                      data={filterColumnOptions}
                      searchable
                      style={{ flex: '1 1 220px' }}
                    />
                    <Select
                      label="Match"
                      value={filterOperator}
                      onChange={(value) =>
                        setFilterOperator(
                          (value as HZDRFilterOperator | null) ?? 'includes'
                        )
                      }
                      data={[
                        { value: 'includes', label: 'includes' },
                        { value: 'equals', label: 'equals' },
                        { value: 'gt', label: 'greater than' },
                        { value: 'gte', label: 'greater or equal' },
                        { value: 'lt', label: 'less than' },
                        { value: 'lte', label: 'less or equal' },
                      ]}
                      style={{ flex: '0 1 180px' }}
                    />
                    <TextInput
                      label="Value"
                      value={filterValue}
                      onChange={(event) =>
                        setFilterValue(event.currentTarget.value)
                      }
                      placeholder={
                        filterOperator === 'includes'
                          ? 'text to find'
                          : 'number or exact text'
                      }
                      style={{ flex: '1 1 180px' }}
                    />
                    <Button
                      variant="subtle"
                      disabled={!filterValue}
                      onClick={() => setFilterValue('')}
                    >
                      Clear
                    </Button>
                    <Button
                      component="a"
                      href={`/source/${source_key}/context-builder`}
                      variant="light"
                    >
                      Context builder
                    </Button>
                  </Group>
                  <DetailsSection title="Columns">
                    <Checkbox.Group
                      value={visibleTableColumns}
                      onChange={(selectedColumns) => {
                        const nextHiddenColumns = tableColumnOptions
                          .map((option) => option.value)
                          .filter((column) => !selectedColumns.includes(column))
                        setHiddenTableColumns(nextHiddenColumns)
                      }}
                    >
                      <Group gap="sm" mt="xs">
                        {tableColumnOptions.map((option) => (
                          <Checkbox
                            key={option.value}
                            value={option.value}
                            label={option.label}
                            size="xs"
                          />
                        ))}
                      </Group>
                    </Checkbox.Group>
                  </DetailsSection>
                </Card>
                <Card withBorder radius={4} p={0}>
                  <ScrollArea
                    h={520}
                    type="always"
                    offsetScrollbars
                    scrollbarSize={14}
                  >
                    <Table
                      striped
                      highlightOnHover
                      withColumnBorders
                      stickyHeader
                      miw={tableMinWidth}
                      style={{ tableLayout: 'fixed' }}
                    >
                      <Table.Thead>
                        <Table.Tr>
                          {isTableColumnVisible('shot_number') ? (
                            <SortableHeader
                              width={86}
                              label="Shot"
                              column="shot_number"
                              sortState={sortState}
                              onSort={toggleSort}
                            />
                          ) : null}
                          {isTableColumnVisible('shot_day') ? (
                            <SortableHeader
                              width={92}
                              label="Day"
                              column="shot_day"
                              sortState={sortState}
                              onSort={toggleSort}
                            />
                          ) : null}
                          {isTableColumnVisible('fired_at') ? (
                            <SortableHeader
                              width={168}
                              label="Fired at"
                              column="fired_at"
                              sortState={sortState}
                              onSort={toggleSort}
                            />
                          ) : null}
                          {isTableColumnVisible('status') ? (
                            <SortableHeader
                              width={112}
                              label="Status"
                              column="status"
                              sortState={sortState}
                              onSort={toggleSort}
                            />
                          ) : null}
                          {isTableColumnVisible('laser_energy_j') ? (
                            <SortableHeader
                              width={96}
                              label="Energy"
                              column="laser_energy_j"
                              sortState={sortState}
                              onSort={toggleSort}
                            />
                          ) : null}
                          {isTableColumnVisible('target') ? (
                            <SortableHeader
                              width={110}
                              label="Target"
                              column="target"
                              sortState={sortState}
                              onSort={toggleSort}
                            />
                          ) : null}
                          {visibleContextColumns.map((column) => (
                            <SortableHeader
                              key={column.name}
                              width={180}
                              label={column.title}
                              column={`context:${column.name}`}
                              sortState={sortState}
                              onSort={toggleSort}
                            />
                          ))}
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {visibleShots.map((shot) => (
                          <Table.Tr
                            key={shot.shot_number}
                            onClick={() =>
                              setSelectedShotNumber(shot.shot_number)
                            }
                            style={{
                              cursor: 'pointer',
                              background:
                                shot.shot_number === selectedShotNumber
                                  ? 'var(--mantine-color-blue-light)'
                                  : undefined,
                            }}
                          >
                            {isTableColumnVisible('shot_number') ? (
                              <Table.Td w={86}>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    selectMetadataCell(
                                      shot,
                                      'Shot',
                                      'shot_number',
                                      shot.shot_number
                                    )
                                  }}
                                  style={cellButtonStyle}
                                >
                                  {shot.shot_number}
                                </button>
                              </Table.Td>
                            ) : null}
                            {isTableColumnVisible('shot_day') ? (
                              <Table.Td w={92}>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    selectMetadataCell(
                                      shot,
                                      'Day',
                                      'shot_day',
                                      shotDayLabels.get(shot.shot_number) ?? '-'
                                    )
                                  }}
                                  style={cellButtonStyle}
                                >
                                  <TruncatedCell
                                    value={
                                      shotDayLabels.get(shot.shot_number) ?? '-'
                                    }
                                  />
                                </button>
                              </Table.Td>
                            ) : null}
                            {isTableColumnVisible('fired_at') ? (
                              <Table.Td w={168}>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    selectMetadataCell(
                                      shot,
                                      'Fired at',
                                      'fired_at',
                                      formatFiredAt(shot.fired_at)
                                    )
                                  }}
                                  style={cellButtonStyle}
                                >
                                  <TruncatedCell
                                    value={formatFiredAt(shot.fired_at)}
                                  />
                                </button>
                              </Table.Td>
                            ) : null}
                            {isTableColumnVisible('status') ? (
                              <Table.Td w={112}>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    selectMetadataCell(
                                      shot,
                                      'Status',
                                      'status',
                                      shot.metadata.status ?? 'unknown'
                                    )
                                  }}
                                  style={cellButtonStyle}
                                >
                                  <StatusBadge
                                    status={String(
                                      shot.metadata.status ?? 'unknown'
                                    )}
                                  />
                                </button>
                              </Table.Td>
                            ) : null}
                            {isTableColumnVisible('laser_energy_j') ? (
                              <Table.Td w={96}>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    selectMetadataCell(
                                      shot,
                                      'Energy',
                                      'laser_energy_j',
                                      shot.metadata.laser_energy_j,
                                      'laser_energy_j'
                                    )
                                  }}
                                  style={cellButtonStyle}
                                >
                                  <TruncatedCell
                                    value={shot.metadata.laser_energy_j ?? '-'}
                                  />
                                </button>
                              </Table.Td>
                            ) : null}
                            {isTableColumnVisible('target') ? (
                              <Table.Td w={110}>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    selectMetadataCell(
                                      shot,
                                      'Target',
                                      'target',
                                      shot.metadata.target
                                    )
                                  }}
                                  style={cellButtonStyle}
                                >
                                  <TruncatedCell
                                    value={shot.metadata.target ?? '-'}
                                  />
                                </button>
                              </Table.Td>
                            ) : null}
                            {visibleContextColumns.map((column) => {
                              const row = contextRowsByShot.get(
                                shot.shot_number
                              )
                              const error = row?.errors[column.name]
                              const value = row?.values[column.name]
                              const preview = row?.previews?.[column.name]
                              const trendValues = isScalarContextValue(
                                value,
                                preview
                              )
                                ? buildContextTrendValues(column.name)
                                : undefined
                              return (
                                <Table.Td key={column.name} w={180}>
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      setSelectedShotNumber(shot.shot_number)
                                      setSelectedCell({
                                        shotNumber: shot.shot_number,
                                        columnTitle: column.title,
                                        columnName: column.name,
                                        value,
                                        error,
                                        preview,
                                        trendValues,
                                        kind: 'context',
                                      })
                                    }}
                                    style={cellButtonStyle}
                                  >
                                    {error ? (
                                      isMissingContextValueError(error) ? (
                                        <Badge
                                          variant="light"
                                          color="gray"
                                          title={error}
                                        >
                                          Missing
                                        </Badge>
                                      ) : (
                                        <TruncatedCell value={error} c="red" />
                                      )
                                    ) : (
                                      <ContextCellContent
                                        value={formatContextValue(value)}
                                        preview={preview}
                                        trendValues={trendValues}
                                      />
                                    )}
                                  </button>
                                </Table.Td>
                              )
                            })}
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  </ScrollArea>
                </Card>
                <Group justify="space-between">
                  <Text size="xs" c="dimmed">
                    Context columns are loaded from your active context.py
                    workspace for this source.
                  </Text>
                  <Button
                    size="xs"
                    variant="subtle"
                    onClick={() => {
                      if (!source_key) {
                        return
                      }
                      fetch(`/contextfile/campaign/${source_key}/me/results`)
                        .then((response) =>
                          response.ok ? response.json() : undefined
                        )
                        .then(setContextResults)
                    }}
                  >
                    Refresh context
                  </Button>
                </Group>
              </Grid.Col>

              <Grid.Col span={{ base: 12, xl: 2 }}>
                <Stack gap="md">
                  <DetailsSection title="Selected cell" open>
                    <SelectedCellPanel
                      cell={selectedCell}
                      onCorrectMetadata={updateShotMetadata}
                    />
                  </DetailsSection>
                  <DetailsSection title="Shot sets" open>
                    <HZDRShotSetsPanel shots={shots} />
                  </DetailsSection>
                  <DetailsSection title="Shot detail">
                    <ShotDetailPanel
                      shot={selectedShot}
                      shotDetail={shotDetail}
                      availableSources={availableSources}
                      onUpdateStatus={updateShotStatus}
                      onCorrectMetadata={updateShotMetadata}
                    />
                  </DetailsSection>
                </Stack>
              </Grid.Col>
            </Grid>
          </Stack>
        </Container>
      }
    />
  )
}

function DetailsSection({
  title,
  children,
  open = false,
}: PropsWithChildren<{ title: string; open?: boolean }>) {
  return (
    <details open={open}>
      <summary
        style={{
          cursor: 'pointer',
          fontWeight: 700,
          padding: '8px 0',
        }}
      >
        {title}
      </summary>
      {children}
    </details>
  )
}

function SortableHeader({
  width,
  label,
  column,
  sortState,
  onSort,
}: {
  width: number
  label: string
  column: string
  sortState: HZDRSortState
  onSort: (column: string) => void
}) {
  const active = sortState.column === column
  return (
    <Table.Th w={width}>
      <button
        type="button"
        onClick={() => onSort(column)}
        title={`Sort by ${label}`}
        style={{
          ...cellButtonStyle,
          fontWeight: 700,
        }}
      >
        <Group gap={4} wrap="nowrap" justify="space-between">
          <Text size="sm" fw={700} truncate="end">
            {label}
          </Text>
          <Text
            size="xs"
            c={active ? 'blue' : 'dimmed'}
            style={{ flex: '0 0 auto' }}
          >
            {active ? (sortState.direction === 'asc' ? '↑' : '↓') : '↕'}
          </Text>
        </Group>
      </button>
    </Table.Th>
  )
}

function SelectedCellPanel({
  cell,
  onCorrectMetadata,
}: {
  cell?: HZDRSelectedCell
  onCorrectMetadata: (
    shotNumber: number,
    key: string,
    value: unknown,
    note?: string
  ) => void
}) {
  if (!cell) {
    return (
      <Card withBorder radius={4} p="md">
        <Text size="sm" c="dimmed">
          Click a table cell to inspect its value, preview, and numeric trend.
        </Text>
      </Card>
    )
  }

  const hasVisualPreview =
    isPlotlyPreview(cell.preview) ||
    isNumericLinePreview(cell.preview) ||
    isNumericMatrixPreview(cell.preview)

  return (
    <Card withBorder radius={4} p="md">
      <Stack gap="sm">
        <Group justify="space-between" gap="xs">
          <Stack gap={0}>
            <Text size="xs" c="dimmed">
              Shot {cell.shotNumber}
            </Text>
            <Text fw={700}>{cell.columnTitle}</Text>
          </Stack>
          <Badge variant="light">{cell.kind}</Badge>
        </Group>
        {cell.error ? (
          isMissingContextValueError(cell.error) ? (
            <Text size="sm" c="dimmed">
              No value is available for this shot.
            </Text>
          ) : (
            <Text size="sm" c="red">
              {cell.error}
            </Text>
          )
        ) : cell.kind === 'metadata' && cell.columnName === 'status' ? (
          <Stack gap="xs">
            <StatusBadge status={String(cell.value ?? 'unknown')} />
            <Text size="sm" c="dimmed">
              Change this in Shot detail using the review status form.
            </Text>
          </Stack>
        ) : !hasVisualPreview ? (
          <Text size="xl">{formatContextValue(cell.value)}</Text>
        ) : null}
        <ContextPreviewValue preview={cell.preview} value={cell.value} />
        {cell.trendValues && cell.trendValues.length > 1 ? (
          <Stack gap="xs">
            <Text size="sm" fw={600}>
              Column trend
            </Text>
            <MetadataTrendPreview values={cell.trendValues} />
          </Stack>
        ) : null}
        {isCorrectableMetadataCell(cell) ? (
          <MetadataCorrectionForm
            cell={cell}
            onCorrectMetadata={onCorrectMetadata}
          />
        ) : null}
      </Stack>
    </Card>
  )
}

function MetadataCorrectionForm({
  cell,
  onCorrectMetadata,
}: {
  cell: HZDRSelectedCell
  onCorrectMetadata: (
    shotNumber: number,
    key: string,
    value: unknown,
    note?: string
  ) => void
}) {
  const [draft, setDraft] = useState(formatMetadataCorrectionDraft(cell.value))
  const [note, setNote] = useState('')

  useEffect(() => {
    setDraft(formatMetadataCorrectionDraft(cell.value))
    setNote('')
  }, [cell.columnName, cell.shotNumber, cell.value])

  return (
    <DetailsSection title="Correct bad metadata">
      <Stack gap="xs">
        <Text size="xs" c="dimmed">
          Updates the source metadata and records who changed it, the previous
          value, and the reason.
        </Text>
        <Textarea
          label="Correct value"
          description="Enter JSON for numbers, booleans, null, arrays, or objects; plain text is kept as text."
          minRows={2}
          value={draft}
          onChange={(event) => setDraft(event.currentTarget.value)}
        />
        <TextInput
          label="Reason"
          placeholder="Why is this value being corrected?"
          value={note}
          onChange={(event) => setNote(event.currentTarget.value)}
        />
        <Button
          size="xs"
          variant="light"
          onClick={() =>
            onCorrectMetadata(
              cell.shotNumber,
              cell.columnName,
              parseMetadataCorrectionDraft(draft),
              note.trim() || undefined
            )
          }
        >
          Apply correction
        </Button>
      </Stack>
    </DetailsSection>
  )
}

function isCorrectableMetadataCell(cell: HZDRSelectedCell) {
  return cell.kind === 'metadata' && isCorrectableMetadataKey(cell.columnName)
}

function isCorrectableMetadataKey(key: string) {
  return ![
    'shot_number',
    'shot_day',
    'fired_at',
    'status',
    'status_history',
    'reviewed_at',
    'reviewed_by',
    'review_note',
    'metadata_correction_history',
    'shot_id',
    'experiment_id',
    'combined_hdf5_path',
  ].includes(key)
}

function formatMetadataCorrectionDraft(value: unknown) {
  if (value === undefined) {
    return ''
  }
  if (typeof value === 'string') {
    return value
  }
  return JSON.stringify(value, null, 2)
}

function parseMetadataCorrectionDraft(draft: string): unknown {
  const trimmed = draft.trim()
  if (!trimmed) {
    return ''
  }
  try {
    return JSON.parse(trimmed)
  } catch {
    return draft
  }
}

function ContextPreviewValue({
  preview,
  value,
}: {
  preview?: unknown
  value: unknown
}) {
  if (isNumericLinePreview(preview)) {
    return <LineoutPreview values={preview} />
  }
  if (isNumericMatrixPreview(preview)) {
    return <ImageMatrixPreview values={preview} />
  }
  if (isPlotlyPreview(preview)) {
    return <PlotlyFigurePreview preview={preview} />
  }
  if (preview && typeof preview === 'object') {
    return <Code block>{JSON.stringify(preview, null, 2)}</Code>
  }
  if (Array.isArray(value)) {
    return <Code block>{JSON.stringify(value.slice(0, 32), null, 2)}</Code>
  }
  return null
}

function ContextCellContent({
  value,
  preview,
  trendValues,
}: {
  value: unknown
  preview?: unknown
  trendValues?: { shotNumber: number; value: number }[]
}) {
  const sparklineValues = getPlotlySparklineValues(preview)
  const arrayPreviewValues = getNumericPreviewValues(preview)
  if (isNumericLinePreview(preview)) {
    return <MiniCellSparkline values={preview} />
  }
  if (isNumericMatrixPreview(preview)) {
    return <MiniImagePreview values={preview} size={48} />
  }
  if (isPlotlyPreview(preview)) {
    return sparklineValues.length > 1 ? (
      <MiniCellSparkline values={sparklineValues} />
    ) : (
      <Text size="xs" c="dimmed">
        Plot preview
      </Text>
    )
  }
  if (trendValues && trendValues.length > 1) {
    return (
      <MiniCellSparkline values={trendValues.map((entry) => entry.value)} />
    )
  }
  if (arrayPreviewValues.length > 1) {
    return (
      <Stack gap={2}>
        <TruncatedCell value={value} />
        <MiniCellSparkline values={arrayPreviewValues} />
      </Stack>
    )
  }
  return (
    <Stack gap={2}>
      <TruncatedCell value={value} />
      {sparklineValues.length > 1 ? (
        <MiniCellSparkline values={sparklineValues} />
      ) : null}
    </Stack>
  )
}

function MiniCellSparkline({ values }: { values: number[] }) {
  const width = 108
  const height = 24
  const padding = 3
  const minValue = Math.min(...values)
  const maxValue = Math.max(...values)
  const range = maxValue - minValue || 1
  const points = values
    .map((value, index) => {
      const x =
        padding +
        (index / Math.max(values.length - 1, 1)) * (width - padding * 2)
      const y =
        height - padding - ((value - minValue) / range) * (height - padding * 2)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  const lastValue = values[values.length - 1]
  const lastX = width - padding
  const lastY =
    height - padding - ((lastValue - minValue) / range) * (height - padding * 2)

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Plot preview sparkline"
      style={{ display: 'block' }}
    >
      <line
        x1={padding}
        x2={width - padding}
        y1={height - padding}
        y2={height - padding}
        stroke="var(--mantine-color-gray-3)"
        strokeWidth={1}
      />
      <polyline
        points={points}
        fill="none"
        stroke="var(--mantine-color-teal-6)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={lastX}
        cy={lastY}
        r={2.4}
        fill="var(--mantine-color-yellow-5)"
        stroke="var(--mantine-color-teal-7)"
        strokeWidth={1}
      />
    </svg>
  )
}

function LineoutPreview({ values }: { values: number[] }) {
  const indexedValues = values.map((value, index) => ({
    shotNumber: index,
    value,
  }))
  return (
    <MetadataTrendPreview
      values={indexedValues}
      title="Lineout preview"
      xLabel="sample index"
    />
  )
}

function ImageMatrixPreview({ values }: { values: number[][] }) {
  return (
    <Stack gap="xs">
      <Text size="sm" fw={600}>
        Image preview
      </Text>
      <MiniImagePreview values={values} size={260} />
    </Stack>
  )
}

function MiniImagePreview({
  values,
  size = 108,
}: {
  values: number[][]
  size?: number
}) {
  const flattened = values.flat()
  const minValue = Math.min(...flattened)
  const maxValue = Math.max(...flattened)
  const range = maxValue - minValue || 1
  return (
    <div
      role="img"
      aria-label="Image preview"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${values[0]?.length ?? 1}, 1fr)`,
        width: '100%',
        maxWidth: size,
        aspectRatio: '1 / 1',
        border: '1px solid var(--mantine-color-gray-4)',
        overflow: 'hidden',
      }}
    >
      {values.flatMap((row, rowIndex) =>
        row.map((value, columnIndex) => {
          const shade = Math.round(((value - minValue) / range) * 255)
          return (
            <div
              key={`${rowIndex}-${columnIndex}`}
              style={{
                backgroundColor: `rgb(${shade}, ${shade}, ${shade})`,
              }}
            />
          )
        })
      )}
    </div>
  )
}

function PlotlyFigurePreview({ preview }: { preview: PlotlyPreview }) {
  try {
    const figure = decodePlotlyTypedArrays(JSON.parse(preview.json)) as {
      data?: Plotly.Data[]
      layout?: Partial<Plotly.Layout>
      config?: Partial<Plotly.Config>
    }
    return (
      <Plotly
        data={figure.data ?? []}
        layout={
          {
            ...(figure.layout ?? {}),
            autosize: true,
            height: 260,
            margin: {
              l: 44,
              r: 16,
              t: 24,
              b: 42,
              ...(figure.layout?.margin ?? {}),
            },
          } as Partial<Plotly.Layout>
        }
        config={
          {
            displaylogo: false,
            responsive: true,
            ...(figure.config ?? {}),
          } as Partial<Plotly.Config>
        }
        style={{ width: '100%', height: 260 }}
        useResizeHandler
      />
    )
  } catch (error) {
    return (
      <Code block>
        {error instanceof Error
          ? error.message
          : 'Could not render Plotly preview.'}
      </Code>
    )
  }
}

function isPlotlyPreview(preview: unknown): preview is PlotlyPreview {
  return (
    Boolean(preview) &&
    typeof preview === 'object' &&
    (preview as { kind?: unknown }).kind === 'plotly' &&
    typeof (preview as { json?: unknown }).json === 'string'
  )
}

function getPlotlySparklineValues(preview: unknown) {
  if (!isPlotlyPreview(preview)) {
    return []
  }
  try {
    const figure = decodePlotlyTypedArrays(JSON.parse(preview.json)) as {
      data?: Array<{ y?: unknown }>
    }
    const yValues = figure.data?.find((trace) => Array.isArray(trace.y))?.y
    if (!Array.isArray(yValues)) {
      return []
    }
    return yValues
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value))
  } catch {
    return []
  }
}

function getNumericPreviewValues(preview: unknown): number[] {
  if (!isNumericLinePreview(preview)) {
    return []
  }
  return preview.slice(0, 64)
}

function isNumericLinePreview(preview: unknown): preview is number[] {
  return (
    Array.isArray(preview) &&
    preview.length > 1 &&
    preview.every(
      (entry) => typeof entry === 'number' && Number.isFinite(entry)
    )
  )
}

function isNumericMatrixPreview(preview: unknown): preview is number[][] {
  return (
    Array.isArray(preview) &&
    preview.length > 0 &&
    preview.every(
      (row) =>
        Array.isArray(row) &&
        row.length > 0 &&
        row.every(
          (entry) => typeof entry === 'number' && Number.isFinite(entry)
        )
    )
  )
}

function decodePlotlyTypedArrays(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(decodePlotlyTypedArrays)
  }
  if (isEncodedPlotlyArray(value)) {
    return decodeBase64Array(value.dtype, value.bdata)
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        decodePlotlyTypedArrays(entry),
      ])
    )
  }
  return value
}

function isEncodedPlotlyArray(value: unknown): value is {
  dtype: string
  bdata: string
} {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    typeof (value as { dtype?: unknown }).dtype === 'string' &&
    typeof (value as { bdata?: unknown }).bdata === 'string'
  )
}

function decodeBase64Array(dtype: string, bdata: string) {
  const binary = globalThis.atob(bdata)
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  )
  switch (dtype) {
    case 'f8':
      return Array.from(new Float64Array(buffer))
    case 'f4':
      return Array.from(new Float32Array(buffer))
    case 'i1':
      return Array.from(new Int8Array(buffer))
    case 'i2':
      return Array.from(new Int16Array(buffer))
    case 'i4':
      return Array.from(new Int32Array(buffer))
    case 'u1':
      return Array.from(new Uint8Array(buffer))
    case 'u2':
      return Array.from(new Uint16Array(buffer))
    case 'u4':
      return Array.from(new Uint32Array(buffer))
    default:
      return []
  }
}

function HZDRShotSetsPanel({ shots }: { shots: HZDRShot[] }) {
  const numericMetadataKeys = getNumericMetadataKeys(shots)
  const [trendKey, setTrendKey] = useState(numericMetadataKeys[0] ?? '')

  useEffect(() => {
    setTrendKey((currentKey) => currentKey || numericMetadataKeys[0] || '')
  }, [numericMetadataKeys])

  const trendValues = shots
    .map((shot) => ({
      shotNumber: shot.shot_number,
      value: Number(getNestedMetadataValue(shot.metadata, trendKey)),
    }))
    .filter((entry) => Number.isFinite(entry.value))

  return (
    <Card withBorder radius={4} p="md">
      <Stack gap="sm">
        <Group justify="space-between">
          <Stack gap={2}>
            <Title order={4}>Shot sets</Title>
            <Text size="sm" c="dimmed">
              Collections of shots for trends across the campaign/source.
            </Text>
          </Stack>
          <Badge variant="light">{shots.length} shots</Badge>
        </Group>
        <Select
          label="Trend value"
          value={trendKey}
          onChange={(value) => setTrendKey(value ?? '')}
          data={numericMetadataKeys}
          searchable
        />
        <MetadataTrendPreview values={trendValues} />
      </Stack>
    </Card>
  )
}

function ShotDetailPanel({
  shot,
  shotDetail,
  availableSources,
  onUpdateStatus,
  onCorrectMetadata,
}: {
  shot?: HZDRShot
  shotDetail?: HZDRShotDetail
  availableSources: HZDRSource[]
  onUpdateStatus?: (shotNumber: number, status: string, note?: string) => void
  onCorrectMetadata?: (
    shotNumber: number,
    key: string,
    value: unknown,
    note?: string
  ) => void
}) {
  const [reviewStatus, setReviewStatus] = useState('processed')
  const [reviewNote, setReviewNote] = useState('')
  const [correctionKey, setCorrectionKey] = useState('')
  const [correctionDraft, setCorrectionDraft] = useState('')
  const [correctionNote, setCorrectionNote] = useState('')

  useEffect(() => {
    setReviewStatus(String(shot?.metadata.status ?? 'processed'))
    setReviewNote(String(shot?.metadata.review_note ?? ''))
  }, [shot?.shot_number, shot?.metadata.status, shot?.metadata.review_note])

  useEffect(() => {
    setCorrectionKey('')
    setCorrectionDraft('')
    setCorrectionNote('')
  }, [shot?.shot_number])

  if (!shot) {
    return (
      <Card withBorder radius={4} p="md">
        <Stack gap={6}>
          <Text fw={600}>No shot selected.</Text>
          <Text size="sm" c="dimmed">
            Available sources in current provider:
          </Text>
          {availableSources.map((entry) => (
            <Anchor key={entry.key} href={`/source/${entry.key}`}>
              {entry.key} ({entry.shots.length} shots)
            </Anchor>
          ))}
        </Stack>
      </Card>
    )
  }

  return (
    <Stack gap="md">
      <Card withBorder radius={4} p="md">
        <Stack gap="sm">
          <Group justify="space-between">
            <Title order={4}>Shot {shot.shot_number}</Title>
            <Badge color={statusColor(String(shot.metadata.status ?? ''))}>
              {shot.metadata.status ?? 'unknown'}
            </Badge>
          </Group>
          <Paper withBorder radius={4} p="sm" bg="var(--mantine-color-gray-0)">
            <Stack gap="sm">
              <Radio.Group
                label="Review status"
                value={reviewStatus}
                onChange={setReviewStatus}
              >
                <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="xs" mt="xs">
                  {[
                    {
                      value: 'processed',
                      label: 'OK',
                      color: 'teal',
                      background: 'var(--mantine-color-teal-0)',
                    },
                    {
                      value: 'needs-review',
                      label: 'Review',
                      color: 'yellow',
                      background: 'var(--mantine-color-yellow-0)',
                    },
                    {
                      value: 'revision-needed',
                      label: 'Revise',
                      color: 'red',
                      background: 'var(--mantine-color-red-0)',
                    },
                  ].map((option) => (
                    <Paper
                      key={option.value}
                      withBorder
                      radius={4}
                      p="xs"
                      bg={option.background}
                    >
                      <Radio
                        value={option.value}
                        label={option.label}
                        color={option.color}
                      />
                    </Paper>
                  ))}
                </SimpleGrid>
              </Radio.Group>
              <Textarea
                label="Review note"
                minRows={2}
                value={reviewNote}
                onChange={(event) => setReviewNote(event.currentTarget.value)}
              />
              <Button
                size="xs"
                variant="light"
                color={statusColor(reviewStatus)}
                onClick={() =>
                  onUpdateStatus?.(
                    shot.shot_number,
                    reviewStatus,
                    reviewNote.trim() || defaultReviewNote(reviewStatus)
                  )
                }
              >
                Apply review
              </Button>
            </Stack>
          </Paper>
          {shot.metadata.review_note ? (
            <Text size="xs" c="dimmed">
              Last review note: {String(shot.metadata.review_note)}
            </Text>
          ) : null}
          {shot.metadata.reviewed_by || shot.metadata.reviewed_at ? (
            <Text size="xs" c="dimmed">
              Last changed by {String(shot.metadata.reviewed_by ?? 'unknown')}
              {shot.metadata.reviewed_at
                ? ` at ${formatFiredAt(String(shot.metadata.reviewed_at))}`
                : ''}
            </Text>
          ) : null}
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
            <Stack gap={2}>
              <Text size="xs" c="dimmed">
                Fired at
              </Text>
              <Text size="sm">{shot.fired_at}</Text>
            </Stack>
            <Stack gap={2}>
              <Text size="xs" c="dimmed">
                Target
              </Text>
              <Text size="sm">{shot.metadata.target ?? '-'}</Text>
            </Stack>
            <Stack gap={2}>
              <Text size="xs" c="dimmed">
                Canonical shot key
              </Text>
              <Text size="sm">{shot.shot_key ?? '-'}</Text>
            </Stack>
            <Stack gap={2}>
              <Text size="xs" c="dimmed">
                Match quality
              </Text>
              <Text size="sm">
                {shot.match_quality ?? shot.match_status ?? '-'}
                {shot.match_time_delta_s !== undefined &&
                shot.match_time_delta_s !== null
                  ? ` (${shot.match_time_delta_s.toFixed(3)} s)`
                  : ''}
              </Text>
            </Stack>
            <Stack gap={2}>
              <Text size="xs" c="dimmed">
                LabFrog record
              </Text>
              <Text size="sm">{shot.labfrog_record_id ?? '-'}</Text>
            </Stack>
            <Stack gap={2}>
              <Text size="xs" c="dimmed">
                LabFrog date/time
              </Text>
              <Text size="sm">{shot.labfrog_date_time ?? '-'}</Text>
            </Stack>
          </SimpleGrid>
          <Divider />
          <Stack gap={4}>
            <Text size="xs" c="dimmed">
              HDF5 file
            </Text>
            <Code block>{shot.hdf5_path ?? '-'}</Code>
          </Stack>
        </Stack>
      </Card>

      <Card withBorder radius={4} p="md">
        <Stack gap="xs">
          <Group justify="space-between">
            <Title order={5}>Linked source events</Title>
            <Badge variant="light">{shot.events?.length ?? 0}</Badge>
          </Group>
          {shot.events?.length ? (
            shot.events.map((event) => (
              <Paper key={event.event_id} withBorder radius={4} p="xs">
                <Group justify="space-between" align="flex-start">
                  <Stack gap={2}>
                    <Group gap="xs">
                      <Badge variant="light">{event.source}</Badge>
                      <Text size="sm" fw={600}>
                        {event.kind}
                      </Text>
                    </Group>
                    <Text size="xs" c="dimmed">
                      {event.timestamp} /{' '}
                      {event.transport ?? 'unknown transport'}
                    </Text>
                  </Stack>
                  <Text size="xs" c="dimmed">
                    {event.match_quality ?? '-'}
                  </Text>
                </Group>
              </Paper>
            ))
          ) : (
            <Text size="sm" c="dimmed">
              No source events are linked to this canonical shot.
            </Text>
          )}
        </Stack>
      </Card>

      <Card withBorder radius={4} p="md">
        <Stack gap="xs">
          <Group justify="space-between">
            <Title order={5}>Data products</Title>
            <Badge variant="light">{shot.data_products?.length ?? 0}</Badge>
          </Group>
          {shot.data_products?.length ? (
            shot.data_products.map((product, index) => (
              <Paper
                key={product.product_id ?? `${product.source}-${index}`}
                withBorder
                radius={4}
                p="xs"
              >
                <Group justify="space-between" align="flex-start" wrap="nowrap">
                  <Stack gap={2} style={{ minWidth: 0 }}>
                    <Group gap="xs">
                      <Badge variant="light">{product.source}</Badge>
                      <Text size="sm" fw={600}>
                        {product.preview_kind ?? product.kind}
                      </Text>
                    </Group>
                    <Text size="xs" style={{ overflowWrap: 'anywhere' }}>
                      {product.dataset_name ?? product.path ?? '-'}
                    </Text>
                  </Stack>
                  <Text size="xs" c="dimmed" ta="right">
                    {product.dtype ?? '-'}
                    {product.shape.length
                      ? ` [${product.shape.join(', ')}]`
                      : ''}
                    {product.units ? ` ${product.units}` : ''}
                  </Text>
                </Group>
              </Paper>
            ))
          ) : (
            <Text size="sm" c="dimmed">
              No data products are registered for this shot.
            </Text>
          )}
        </Stack>
      </Card>

      <Card withBorder radius={4} p="md">
        <Stack gap="xs">
          <Title order={5}>HDF5 datasets</Title>
          {shotDetail?.hdf5_error ? (
            <Text size="sm" c="red">
              {shotDetail.hdf5_error}
            </Text>
          ) : null}
          {shotDetail && !shotDetail.hdf5_exists ? (
            <Text size="sm" c="dimmed">
              File not found.
            </Text>
          ) : null}
          {shotDetail?.hdf5_datasets.map((dataset) => (
            <Group key={dataset.name} justify="space-between" wrap="nowrap">
              <Text size="sm">{dataset.name}</Text>
              <Text size="xs" c="dimmed">
                {dataset.dtype} [{dataset.shape.join(', ')}]
              </Text>
            </Group>
          ))}
        </Stack>
      </Card>

      <Card withBorder radius={4} p="md">
        <Stack gap="xs">
          <Title order={5}>Metadata</Title>
          <DetailsSection title="Correct or add metadata">
            <Stack gap="xs">
              <Select
                label="Load existing field"
                description="Or type a missing top-level key below."
                data={Object.keys(shot.metadata)
                  .filter(isCorrectableMetadataKey)
                  .sort()
                  .map((key) => ({ value: key, label: key }))}
                value={
                  Object.prototype.hasOwnProperty.call(
                    shot.metadata,
                    correctionKey
                  )
                    ? correctionKey
                    : null
                }
                onChange={(key) => {
                  const nextKey = key ?? ''
                  setCorrectionKey(nextKey)
                  setCorrectionDraft(
                    nextKey
                      ? formatMetadataCorrectionDraft(shot.metadata[nextKey])
                      : ''
                  )
                }}
                searchable
                clearable
              />
              <TextInput
                label="Metadata key"
                value={correctionKey}
                onChange={(event) =>
                  setCorrectionKey(event.currentTarget.value)
                }
                placeholder="missing_or_bad_field"
              />
              <Textarea
                label="Correct value"
                description="JSON values keep their type; plain text stays text."
                minRows={2}
                value={correctionDraft}
                onChange={(event) =>
                  setCorrectionDraft(event.currentTarget.value)
                }
              />
              <TextInput
                label="Reason"
                value={correctionNote}
                onChange={(event) =>
                  setCorrectionNote(event.currentTarget.value)
                }
                placeholder="Why is this being corrected?"
              />
              <Button
                size="xs"
                variant="light"
                disabled={
                  !correctionKey.trim() ||
                  !isCorrectableMetadataKey(correctionKey.trim())
                }
                onClick={() =>
                  onCorrectMetadata?.(
                    shot.shot_number,
                    correctionKey.trim(),
                    parseMetadataCorrectionDraft(correctionDraft),
                    correctionNote.trim() || undefined
                  )
                }
              >
                Apply metadata correction
              </Button>
            </Stack>
          </DetailsSection>
          <ScrollArea.Autosize mah={260} type="auto">
            <Code block>{JSON.stringify(shot.metadata, null, 2)}</Code>
          </ScrollArea.Autosize>
        </Stack>
      </Card>

      <Card withBorder radius={4} p="md">
        <Stack gap="xs">
          <Group justify="space-between">
            <Title order={5}>Context</Title>
            <Button
              component="a"
              href={`/source/${shot.source_key}/context-builder`}
              size="xs"
              variant="light"
            >
              Build column
            </Button>
          </Group>
          <Text size="sm" c="dimmed">
            Build and save one table column at a time in the context builder.
          </Text>
        </Stack>
      </Card>
    </Stack>
  )
}

function ContextBuilderSectionTitle({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <Stack gap={2}>
      <Text size="sm" fw={700}>
        {title}
      </Text>
      <Text size="xs" c="dimmed">
        {description}
      </Text>
    </Stack>
  )
}

function ContextBuilderPanel({
  title,
  description,
  tone,
  children,
}: PropsWithChildren<{
  title: string
  description: string
  tone: string
}>) {
  return (
    <Paper withBorder radius={4} p="sm" bg={`var(--mantine-color-${tone}-0)`}>
      <Stack gap="xs">
        <ContextBuilderSectionTitle title={title} description={description} />
        {children}
      </Stack>
    </Paper>
  )
}

function ContextBuilderDisclosure({
  title,
  description,
  summary,
  children,
  open = false,
}: PropsWithChildren<{
  title: string
  description: string
  summary?: string
  open?: boolean
}>) {
  const [expanded, setExpanded] = useState(open)

  return (
    <Paper withBorder radius={4} p="sm">
      <details
        open={expanded}
        onToggle={(event) => setExpanded(event.currentTarget.open)}
      >
        <summary style={{ cursor: 'pointer' }}>
          <Group justify="space-between" gap="sm" wrap="nowrap">
            <Stack gap={0} style={{ minWidth: 0 }}>
              <Text size="sm" fw={700}>
                {title}
              </Text>
              <Text size="xs" c="dimmed" truncate="end">
                {description}
              </Text>
            </Stack>
            {summary ? (
              <Badge variant="light" radius={4} style={{ flexShrink: 0 }}>
                {summary}
              </Badge>
            ) : null}
          </Group>
        </summary>
        <Stack gap="sm" mt="sm">
          {children}
        </Stack>
      </details>
    </Paper>
  )
}

function contextRecipeTone(fieldKind: string) {
  if (fieldKind === 'metadata') {
    return 'blue'
  }
  if (
    ['hdf5', 'lineout-preview', 'image-preview', 'plotly-trend'].includes(
      fieldKind
    )
  ) {
    return 'teal'
  }
  if (fieldKind === 'mongo-filter') {
    return 'yellow'
  }
  return 'violet'
}

function contextRecipeLabel(fieldKind: string) {
  if (fieldKind === 'metadata') {
    return 'Metadata value'
  }
  if (fieldKind === 'hdf5') {
    return 'HDF5 summary'
  }
  if (fieldKind === 'lineout-preview') {
    return 'Lineout preview'
  }
  if (fieldKind === 'image-preview') {
    return 'Image preview'
  }
  if (fieldKind === 'plotly-trend') {
    return 'Plotly preview'
  }
  if (fieldKind === 'mongo-filter') {
    return 'Mongo query'
  }
  return 'Custom function'
}

function getContextRecipeOptionHelp(fieldKind: string, contextScope: string) {
  if (fieldKind === 'metadata') {
    return contextScope === 'set'
      ? 'Trends numeric metadata across the visible shots.'
      : 'Shows the selected metadata value directly in the table.'
  }
  if (fieldKind === 'hdf5') {
    return 'Reads the selected HDF5 dataset and stores a compact numeric summary.'
  }
  if (fieldKind === 'lineout-preview') {
    return (
      'Stores a 1D lineout, shows a summary in the table, and expands ' +
      'the line in the cell panel.'
    )
  }
  if (fieldKind === 'image-preview') {
    return (
      'Stores a 2D image, shows a summary in the table, and expands a ' +
      'reduced image in the cell panel.'
    )
  }
  if (fieldKind === 'plotly-trend') {
    return 'Builds an interactive Plotly preview from a 1D HDF5 dataset.'
  }
  if (fieldKind === 'mongo-filter') {
    return 'Uses the selected metadata field from a Mongo-style lookup result.'
  }
  return 'Combines one or more selected inputs with a custom Python expression.'
}

function getContextRecipeOptions({
  contextScope,
  selectedInputs,
  datasetOptions,
}: {
  contextScope: string
  selectedInputs: string[]
  datasetOptions: HZDRDatasetOption[]
}) {
  const selectedDatasets = selectedInputs
    .filter((value) => value.startsWith('hdf5:'))
    .map((value) => datasetOptions.find((option) => option.value === value))
    .filter((option): option is HZDRDatasetOption => option !== undefined)
  const metadataCount = selectedInputs.filter((value) =>
    value.startsWith('metadata:')
  ).length
  const datasetCount = selectedDatasets.length
  const selectedCount = selectedInputs.length
  const singleDataset = selectedDatasets[0]
  const options: { value: string; label: string; disabled?: boolean }[] = []

  if (!selectedCount) {
    return [
      {
        value: 'metadata',
        label: 'Choose data first',
        disabled: true,
      },
    ]
  }

  if (selectedCount === 1 && metadataCount === 1) {
    options.push({
      value: 'metadata',
      label:
        contextScope === 'set'
          ? 'Trend selected metadata'
          : 'Show selected metadata',
    })
    if (contextScope === 'shot') {
      options.push({
        value: 'mongo-filter',
        label: 'Show results from a query',
      })
    }
  }

  if (
    selectedCount === 1 &&
    datasetCount === 1 &&
    singleDataset?.kind !== 'raw'
  ) {
    options.push({
      value: 'hdf5',
      label:
        contextScope === 'set'
          ? 'Summarize selected data across shots'
          : 'Summarize selected data',
    })
    if (contextScope === 'shot' && singleDataset.kind === 'line') {
      options.push(
        { value: 'lineout-preview', label: 'Lineout with table preview' },
        { value: 'plotly-trend', label: 'Interactive trend preview' }
      )
    }
    if (contextScope === 'shot' && singleDataset.kind === 'image') {
      options.push({
        value: 'image-preview',
        label: 'Image with reduced preview',
      })
    }
  }

  options.push({
    value: 'function',
    label:
      selectedCount > 1
        ? 'Compute with selected inputs'
        : 'Compute with a custom function',
  })

  return options
}

function hdf5PerShotTemplateName(datasetName: string) {
  const patterns = [
    /^(.*\/by_shot\/)([^/]+)(\/.+)$/,
    /^(.*\/shots\/)([^/]+)(\/.+)$/,
    /^(.*\/shot\/)([^/]+)(\/.+)$/,
  ]

  for (const pattern of patterns) {
    const match = datasetName.match(pattern)
    if (match) {
      const [, prefix, , suffix] = match
      return `${prefix}{shot_id}${suffix}`
    }
  }

  return null
}

function buildHdf5DatasetOptions(
  datasets: HZDRHDF5Dataset[],
  contextScope: string
): HZDRDatasetOption[] {
  const byShotOptions = new Map<string, HZDRDatasetOption>()
  const directOptions: HZDRDatasetOption[] = []

  for (const dataset of datasets) {
    const templateName = hdf5PerShotTemplateName(dataset.name)
    const kind = classifyHdf5Dataset(dataset)

    if (contextScope === 'shot' && templateName) {
      byShotOptions.set(templateName, {
        value: `hdf5:${templateName}`,
        label: `${dataset.name.split('/').at(-1)} (${dataset.dtype}, ${formatShape(dataset.shape)})`,
        name: templateName,
        previewName: dataset.name,
        dtype: dataset.dtype,
        shape: dataset.shape,
        kind,
        group: hdf5DatasetGroupLabel(kind, true),
      })
      continue
    }

    if (contextScope === 'shot' && isShotIndexedAggregateDataset(dataset)) {
      continue
    }

    if (contextScope === 'set' && templateName) {
      continue
    }

    directOptions.push({
      value: `hdf5:${dataset.name}`,
      label: `${dataset.name} (${dataset.dtype}, ${formatShape(dataset.shape)})`,
      name: dataset.name,
      previewName: dataset.name,
      dtype: dataset.dtype,
      shape: dataset.shape,
      kind,
      group: hdf5DatasetGroupLabel(
        contextScope === 'set' && isShotIndexedAggregateDataset(dataset)
          ? 'stack'
          : kind,
        false
      ),
    })
  }

  return [...byShotOptions.values(), ...directOptions]
}

function groupHdf5DatasetOptions(
  datasetOptions: HZDRDatasetOption[]
): SelectOptionGroup[] {
  const grouped = new Map<string, HZDRDatasetOption[]>()
  for (const option of datasetOptions) {
    grouped.set(option.group, [...(grouped.get(option.group) ?? []), option])
  }
  return [...grouped.entries()].map(([group, items]) => ({
    group,
    items: items.map((item) => ({ value: item.value, label: item.label })),
  }))
}

function getContextInputOptions({
  fieldKind,
  metadataOptions,
  datasetOptions,
}: {
  fieldKind: string
  metadataOptions: SelectOption[]
  datasetOptions: HZDRDatasetOption[]
}): SelectOptionGroup[] {
  const compatibleDatasetOptions =
    fieldKind === 'function'
      ? datasetOptions
      : datasetOptions.filter((option) => option.kind !== 'raw')

  return [
    { group: 'Shot metadata', items: metadataOptions },
    ...groupHdf5DatasetOptions(compatibleDatasetOptions),
  ].filter((group) => group.items.length)
}

function isNumericHdf5Dtype(dtype: string) {
  const normalized = dtype.toLowerCase()

  return (
    normalized.includes('float') ||
    normalized.includes('double') ||
    normalized.includes('int') ||
    normalized.includes('uint') ||
    /^[<>|]?[fiu]\d+$/.test(normalized)
  )
}

function classifyHdf5Dataset(dataset: HZDRHDF5Dataset): HZDRDatasetKind {
  const numeric = isNumericHdf5Dtype(dataset.dtype)
  const shape = dataset.shape

  if (!shape.length || (shape.length === 1 && Number(shape[0]) === 1)) {
    return numeric ? 'scalar' : 'raw'
  }

  if (shape.length === 1) {
    return numeric ? 'line' : 'raw'
  }

  if (shape.length === 2) {
    return numeric ? 'image' : 'raw'
  }

  if (shape.length > 2) {
    return numeric ? 'stack' : 'raw'
  }

  return 'raw'
}

function hdf5DatasetGroupLabel(kind: HZDRDatasetKind, perShot: boolean) {
  const prefix = perShot ? 'HDF5 per-shot ' : 'HDF5 '
  if (kind === 'scalar') {
    return `${prefix}scalars`
  }
  if (kind === 'line') {
    return `${prefix}lineouts`
  }
  if (kind === 'image') {
    return `${prefix}images and masks`
  }
  if (kind === 'stack') {
    return `${prefix}shot-set stacks`
  }
  return `${prefix}raw datasets`
}

function isShotIndexedAggregateDataset(dataset: HZDRHDF5Dataset) {
  return (
    dataset.name.endsWith('_by_shot') ||
    dataset.name.includes('_by_shot/') ||
    dataset.name.includes('/by_shot_')
  )
}

function formatShape(shape: Array<number | string>) {
  return shape.length ? shape.join('x') : 'scalar'
}

function repairCommonContextImports(content: string) {
  const imports: string[] = []
  if (/\bh5py\b/.test(content) && !/^\s*import\s+h5py\b/m.test(content)) {
    imports.push('import h5py')
  }
  if (
    /\bnp\./.test(content) &&
    !/^\s*import\s+numpy\s+as\s+np\b/m.test(content)
  ) {
    imports.push('import numpy as np')
  }
  if (
    /\bpx\./.test(content) &&
    !/^\s*import\s+plotly\.express\s+as\s+px\b/m.test(content)
  ) {
    imports.push('import plotly.express as px')
  }
  const damnitNames = ['Cell', 'Skip', 'Variable', 'mongo_find_one'].filter(
    (name) => new RegExp(`\\b${name}\\b`).test(content)
  )
  if (
    damnitNames.length &&
    !/^\s*from\s+damnit_ctx\s+import\s+/m.test(content)
  ) {
    imports.push(`from damnit_ctx import ${damnitNames.join(', ')}`)
  }
  if (!imports.length) {
    return content
  }
  return `${imports.join('\n')}\n\n${content.trimStart()}`
}

function statusColor(status: string) {
  if (status === 'processed') {
    return 'teal'
  }
  if (status === 'needs-review') {
    return 'yellow'
  }
  if (status === 'revision-needed') {
    return 'red'
  }
  return 'gray'
}

function statusLabel(status: string) {
  if (status === 'processed') {
    return 'Processed'
  }
  if (status === 'needs-review') {
    return 'Needs review'
  }
  if (status === 'revision-needed') {
    return 'Needs revision'
  }
  return status || 'Unknown'
}

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      color={statusColor(status)}
      variant="light"
      radius={4}
      miw={88}
      maw={112}
      styles={{
        root: { display: 'inline-flex' },
        label: {
          textTransform: 'none',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        },
      }}
    >
      {statusLabel(status)}
    </Badge>
  )
}

function defaultReviewNote(status: string) {
  if (status === 'processed') {
    return 'Reviewed and accepted'
  }
  if (status === 'revision-needed') {
    return 'Processed data needs revision'
  }
  return 'Needs manual review'
}

function ContextBuilderPage() {
  const { source_key } = useParams()
  const [source, setSource] = useState<HZDRSource>()
  const [shots, setShots] = useState<HZDRShot[]>([])
  const [selectedShotNumber, setSelectedShotNumber] = useState<number>()
  const [shotDetail, setShotDetail] = useState<HZDRShotDetail>()
  const [contextFile, setContextFile] = useState<CampaignContextFile>()
  const [contextContent, setContextContent] = useState('')
  const [contextFiles, setContextFiles] = useState<ContextFileEntry[]>([])
  const [selectedContextFile, setSelectedContextFile] = useState('context.py')
  const [saveAsName, setSaveAsName] = useState('context_variant.py')
  const [contextScope, setContextScope] = useState('shot')
  const [fieldKind, setFieldKind] = useState('metadata')
  const [fieldTitle, setFieldTitle] = useState('HZDR/Computed field')
  const [fieldName, setFieldName] = useState('computed_field')
  const [fieldNameOverridden, setFieldNameOverridden] = useState(false)
  const [fieldTitleEdited, setFieldTitleEdited] = useState(false)
  const [selectedInputs, setSelectedInputs] = useState<string[]>([])
  const [allowMultipleInputs, setAllowMultipleInputs] = useState(false)
  const [mongoCollection, setMongoCollection] = useState('shots')
  const [mongoFilter, setMongoFilter] = useState(
    '{\n  "shot_number": shot_number\n}'
  )
  const [combineExpression, setCombineExpression] = useState(
    'np.nanmean(hdf5_values) * float(metadata_value)'
  )
  const [generatedDraft, setGeneratedDraft] = useState('')
  const [columnDetails, setColumnDetails] = useState('')
  const [datasetPreview, setDatasetPreview] = useState<HZDRDatasetPreview>()
  const [saveStatus, setSaveStatus] = useState('')
  const [selectedColumnId, setSelectedColumnId] = useState<string | null>(null)
  const [generatedEditorCompact, setGeneratedEditorCompact] = useState(true)

  useEffect(() => {
    if (!source_key) {
      return
    }
    fetch(`/metadata/hzdr/sources/${source_key}`)
      .then((response) => requireJson<HZDRSource>(response))
      .then(setSource)
      .catch(() => setSaveStatus('Could not load source metadata.'))
    fetch(`/metadata/hzdr/sources/${source_key}/shots`)
      .then((response) => requireJson<unknown>(response))
      .then((loadedShots) => {
        if (!Array.isArray(loadedShots)) {
          throw new Error('Shots response was not a list')
        }
        const nextShots = loadedShots as HZDRShot[]
        setShots(nextShots)
        setSelectedShotNumber(nextShots[0]?.shot_number)
      })
      .catch(() => setSaveStatus('Could not load source shots.'))
    fetch(`/contextfile/campaign/${source_key}/me`)
      .then((response) => requireJson<CampaignContextFile>(response))
      .then((loadedContext: CampaignContextFile) => {
        setContextFile(loadedContext)
        setContextContent(loadedContext.fileContent ?? '')
      })
      .catch(() => setSaveStatus('Could not load your context file.'))
    fetch(`/contextfile/campaign/${source_key}/me/files`)
      .then((response) => requireJson<unknown>(response))
      .then((loadedFiles) => {
        setContextFiles(
          Array.isArray(loadedFiles) ? (loadedFiles as ContextFileEntry[]) : []
        )
      })
      .catch(() => setContextFiles([]))
  }, [source_key])

  useEffect(() => {
    if (!source_key || !selectedShotNumber) {
      return
    }
    fetch(`/metadata/hzdr/sources/${source_key}/shots/${selectedShotNumber}`)
      .then((response) => requireJson<HZDRShotDetail>(response))
      .then(setShotDetail)
      .catch(() => setShotDetail(undefined))
  }, [source_key, selectedShotNumber])

  useEffect(() => {
    if (!fieldNameOverridden) {
      setFieldName(pythonNameFromTitle(fieldTitle))
    }
  }, [fieldNameOverridden, fieldTitle])

  const selectedShot = shots.find(
    (shot) => shot.shot_number === selectedShotNumber
  )
  const metadataKeys = useMemo(
    () =>
      contextScope === 'set'
        ? getNumericMetadataKeys(shots)
        : flattenObjectKeys(selectedShot?.metadata ?? {}),
    [contextScope, selectedShot?.metadata, shots]
  )
  const metadataOptions = useMemo(
    () =>
      metadataKeys.map((key) => ({
        value: `metadata:${key}`,
        label:
          contextScope === 'set'
            ? `${key} (${countNumericValues(shots, key)}/${shots.length} shots)`
            : key,
      })),
    [contextScope, metadataKeys, shots]
  )
  const datasetOptions = useMemo(
    () =>
      buildHdf5DatasetOptions(shotDetail?.hdf5_datasets ?? [], contextScope),
    [contextScope, shotDetail?.hdf5_datasets]
  )
  const inputOptions = useMemo<SelectOptionGroup[]>(
    () =>
      getContextInputOptions({
        fieldKind,
        metadataOptions,
        datasetOptions,
      }),
    [datasetOptions, fieldKind, metadataOptions]
  )
  const inputValueKey = useMemo(
    () => getContextRecipeInputValues(inputOptions).join('\u0000'),
    [inputOptions]
  )
  const selectedInputSummary = selectedInputs.length
    ? selectedInputs.map(formatSelectedInput).join(', ')
    : 'No inputs selected yet'
  const recipeOptions = useMemo(
    () =>
      getContextRecipeOptions({
        contextScope,
        selectedInputs,
        datasetOptions,
      }),
    [contextScope, datasetOptions, selectedInputs]
  )
  const recipeOptionValueKey = useMemo(
    () =>
      recipeOptions
        .map(
          (option) =>
            `${option.value}:${option.disabled ? 'disabled' : 'enabled'}`
        )
        .join('\u0000'),
    [recipeOptions]
  )
  const recipeHelp = getContextRecipeOptionHelp(fieldKind, contextScope)
  const canBuildColumn = selectedInputs.length > 0
  const canSaveGeneratedColumn =
    canBuildColumn && Boolean(extractPythonFunctionName(generatedDraft))
  const contextVariables = parseContextVariableBlocks(contextContent)
  const selectedColumnIndex = contextVariables.findIndex(
    (block) => block.id === selectedColumnId
  )
  const selectedContextVariable =
    selectedColumnIndex >= 0 ? contextVariables[selectedColumnIndex] : undefined
  const showMongoFields =
    fieldKind === 'mongo-filter' || fieldKind === 'function'
  const showFunctionFields = fieldKind === 'function'
  const actionCanUseMultipleInputs =
    fieldKind === 'function' ||
    (contextScope === 'set' &&
      (fieldKind === 'metadata' || fieldKind === 'hdf5'))
  const usesHdf5VisualPreview = [
    'hdf5',
    'lineout-preview',
    'image-preview',
    'plotly-trend',
    'function',
  ].includes(fieldKind)
  const rawSnippet = buildComputedFieldSnippet({
    fieldKind,
    contextScope,
    fieldName,
    fieldTitle,
    selectedInputs,
    mongoCollection,
    mongoFilter,
    combineExpression,
  })
  const snippet = stripDuplicateSnippetImports(rawSnippet, contextContent)

  useEffect(() => {
    setGeneratedDraft(snippet)
  }, [snippet])

  useEffect(() => {
    if (!actionCanUseMultipleInputs && allowMultipleInputs) {
      setAllowMultipleInputs(false)
      setSelectedInputs((current) => current.slice(0, 1))
    }
  }, [actionCanUseMultipleInputs, allowMultipleInputs])

  useEffect(() => {
    if (!allowMultipleInputs && selectedInputs.length > 1) {
      setSelectedInputs([selectedInputs[0]])
      return
    }

    if (
      contextScope === 'set' &&
      ['lineout-preview', 'image-preview', 'plotly-trend'].includes(fieldKind)
    ) {
      setFieldKind('metadata')
      setSelectedInputs([])
      return
    }

    const validRecipeValues = recipeOptions
      .filter((option) => !option.disabled)
      .map((option) => option.value)
    if (!validRecipeValues.includes(fieldKind) && validRecipeValues[0]) {
      setFieldKind(validRecipeValues[0])
      return
    }

    const validInputValues = new Set(
      inputValueKey.split('\u0000').filter(Boolean)
    )
    if (selectedInputs.some((input) => !validInputValues.has(input))) {
      setSelectedInputs([])
    }
  }, [
    allowMultipleInputs,
    contextScope,
    fieldKind,
    inputValueKey,
    recipeOptionValueKey,
    recipeOptions,
    selectedInputs,
  ])

  const appendToContext = () => {
    if (!source_key || !contextFile) {
      return
    }
    if (!canBuildColumn) {
      setSaveStatus('Choose data before adding a column.')
      return
    }
    const { imports, body } = splitPythonImportBlock(generatedDraft)
    if (!extractPythonFunctionName(body)) {
      setSaveStatus('Generated variable needs a valid Python function name.')
      return
    }
    setSaveStatus('Saving...')
    const uniqueBody = makeContextVariableBlockUnique(body, contextVariables)
    const contextWithImports = mergeImportsAtTop(contextContent, imports)
    const fileContent = `${contextWithImports.trimEnd()}\n\n${uniqueBody.trimEnd()}\n`
    fetch(
      `/contextfile/campaign/${source_key}/me/files/${selectedContextFile}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileContent }),
      }
    )
      .then((response) => requireJson<CampaignContextFile>(response))
      .then((savedContext: CampaignContextFile) => {
        setContextFile(savedContext)
        setContextContent(savedContext.fileContent ?? '')
        setSaveStatus(`Saved to ${selectedContextFile}`)
      })
      .catch(() => setSaveStatus('Save failed'))
  }

  const selectAndLoadColumn = (columnId: string | null) => {
    setSelectedColumnId(columnId)
    const selectedBlock = contextVariables.find(
      (block) => block.id === columnId
    )
    if (!selectedBlock) {
      return
    }
    const formState = inferContextBuilderFormState(selectedBlock)
    const validInputValues = new Set(
      inputValueKey.split('\u0000').filter(Boolean)
    )
    const selectedExistingInputs =
      formState.selectedInputs?.filter((input) =>
        validInputValues.has(input)
      ) ?? []
    if (formState.contextScope) {
      setContextScope(formState.contextScope)
    }
    if (formState.fieldKind) {
      setFieldKind(formState.fieldKind)
    }
    if (formState.fieldName) {
      setFieldName(formState.fieldName)
      setFieldNameOverridden(
        !formState.fieldTitle ||
          formState.fieldName !== pythonNameFromTitle(formState.fieldTitle)
      )
    }
    if (formState.fieldTitle) {
      setFieldTitle(formState.fieldTitle)
      setFieldTitleEdited(true)
    }
    if (formState.selectedInputs?.length) {
      setSelectedInputs(
        selectedExistingInputs.length
          ? selectedExistingInputs
          : formState.selectedInputs
      )
    }
    if (formState.allowMultipleInputs !== undefined) {
      setAllowMultipleInputs(formState.allowMultipleInputs)
    }
    if (formState.mongoCollection) {
      setMongoCollection(formState.mongoCollection)
    }
    if (formState.mongoFilter) {
      setMongoFilter(formState.mongoFilter)
    }
    if (formState.combineExpression) {
      setCombineExpression(formState.combineExpression)
    }
    setColumnDetails('')
    setDatasetPreview(undefined)
    setGeneratedDraft(selectedBlock.block.trim())
    setSaveStatus(`Loaded ${selectedBlock.name} into the builder form`)
  }

  const replaceSelectedColumn = () => {
    const selectedBlock = contextVariables.find(
      (block) => block.id === selectedColumnId
    )
    if (!source_key || !selectedBlock) {
      return
    }
    if (!canBuildColumn) {
      setSaveStatus('Choose data before replacing a column.')
      return
    }
    const { imports, body } = splitPythonImportBlock(generatedDraft)
    const replacementName = extractPythonFunctionName(body)
    if (!replacementName) {
      setSaveStatus('Replacement must contain one named Python function.')
      return
    }
    const duplicateColumn = contextVariables.find(
      (block) => block.id !== selectedBlock.id && block.name === replacementName
    )
    if (duplicateColumn) {
      setSaveStatus(
        `Cannot rename to ${replacementName}: that column already exists.`
      )
      return
    }
    const replacedContent = `${contextContent.slice(
      0,
      selectedBlock.start
    )}${body.trimEnd()}\n${contextContent.slice(selectedBlock.end)}`
    const fileContent = mergeImportsAtTop(replacedContent, imports)
    setSaveStatus(`Replacing ${selectedBlock.name}...`)
    saveContextContent(
      fileContent,
      replacementName === selectedBlock.name
        ? `Replaced ${selectedBlock.name}`
        : `Replaced ${selectedBlock.name} with ${replacementName}`,
      () => setSelectedColumnId(replacementName)
    )
  }

  const deleteSelectedColumn = () => {
    const selectedBlock = contextVariables.find(
      (block) => block.id === selectedColumnId
    )
    if (!source_key || !selectedBlock) {
      return
    }
    const fileContent = `${contextContent.slice(
      0,
      selectedBlock.start
    )}${contextContent.slice(selectedBlock.end)}`.trimEnd()
    setSaveStatus(`Deleting ${selectedBlock.name}...`)
    saveContextContent(`${fileContent}\n`, `Deleted ${selectedBlock.name}`)
    setSelectedColumnId(null)
  }

  const moveSelectedColumn = (direction: -1 | 1) => {
    const targetIndex = selectedColumnIndex + direction
    if (
      selectedColumnIndex < 0 ||
      targetIndex < 0 ||
      targetIndex >= contextVariables.length
    ) {
      setSaveStatus('Select a column that can move in that direction.')
      return
    }
    const reorderedBlocks = [...contextVariables]
    const [selectedBlock] = reorderedBlocks.splice(selectedColumnIndex, 1)
    reorderedBlocks.splice(targetIndex, 0, selectedBlock)
    const prefix = contextContent.slice(0, contextVariables[0].start)
    const suffix = contextContent.slice(
      contextVariables.at(-1)?.end ?? contextContent.length
    )
    const fileContent = `${prefix}${reorderedBlocks
      .map((block) => block.block.trim())
      .join('\n\n')}\n${suffix}`
    setSaveStatus(`Moving ${selectedBlock.name}...`)
    saveContextContent(fileContent, `Moved ${selectedBlock.name}`)
  }

  const previewColumn = () => {
    if (!canBuildColumn) {
      setColumnDetails('Choose data before previewing a column.')
      setDatasetPreview(undefined)
      return
    }
    const preview = buildColumnPreview({
      fieldKind,
      selectedInputs,
      selectedShot,
      datasetOptions,
      combineExpression,
    })
    setColumnDetails(preview)
    const selectedDataset = selectedInputs
      .map((value) => datasetOptions.find((option) => option.value === value))
      .find(Boolean)
    if (
      usesHdf5VisualPreview &&
      source_key &&
      selectedShotNumber &&
      selectedDataset
    ) {
      fetch(
        `/metadata/hzdr/sources/${source_key}/shots/${selectedShotNumber}/datasets/${selectedDataset.previewName}`
      )
        .then((response) => response.json())
        .then(setDatasetPreview)
    } else {
      setDatasetPreview(undefined)
    }
  }

  const saveManualContext = () => {
    if (!source_key) {
      return
    }
    setSaveStatus(`Saving ${selectedContextFile}...`)
    saveContextContent(contextContent, `Saved ${selectedContextFile}`)
  }

  const repairContextImports = () => {
    const repairedContent = repairCommonContextImports(contextContent)
    if (repairedContent === contextContent) {
      setSaveStatus('No missing common imports found.')
      return
    }
    setContextContent(repairedContent)
    setSaveStatus('Added missing common imports. Review, then save.')
  }

  const saveContextContent = (
    fileContent: string,
    savedMessage: string,
    onSaved?: (savedContext: CampaignContextFile) => void
  ) => {
    if (!source_key) {
      return
    }
    fetch(
      `/contextfile/campaign/${source_key}/me/files/${selectedContextFile}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileContent }),
      }
    )
      .then((response) => requireJson<CampaignContextFile>(response))
      .then((savedContext: CampaignContextFile) => {
        setContextFile(savedContext)
        setContextContent(savedContext.fileContent ?? '')
        setSaveStatus(savedMessage)
        onSaved?.(savedContext)
      })
      .catch(() => setSaveStatus('Save failed'))
  }

  const loadContextVariant = (fileName: string | null) => {
    if (!source_key || !fileName) {
      return
    }
    setSelectedContextFile(fileName)
    fetch(`/contextfile/campaign/${source_key}/me/files/${fileName}`)
      .then((response) => requireJson<CampaignContextFile>(response))
      .then((loadedContext: CampaignContextFile) => {
        setContextFile(loadedContext)
        setContextContent(loadedContext.fileContent ?? '')
        setSaveStatus(`Loaded ${fileName}`)
      })
      .catch(() => setSaveStatus(`Could not load ${fileName}`))
  }

  const saveAsContext = () => {
    if (!source_key || !saveAsName.trim()) {
      return
    }
    setSaveStatus('Saving context copy...')
    fetch(`/contextfile/campaign/${source_key}/me/files/${saveAsName}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileContent: contextContent }),
    })
      .then((response) => requireJson<CampaignContextFile>(response))
      .then((savedContext: CampaignContextFile) => {
        const savedName = savedContext.path?.split(/[\\/]/).at(-1) ?? saveAsName
        setContextFile(savedContext)
        setContextContent(savedContext.fileContent ?? '')
        setSelectedContextFile(savedName)
        setSaveStatus(`Saved as ${savedName}`)
        return fetch(`/contextfile/campaign/${source_key}/me/files`)
      })
      .then((response) => requireJson<unknown>(response))
      .then((loadedFiles) => {
        setContextFiles(
          Array.isArray(loadedFiles) ? (loadedFiles as ContextFileEntry[]) : []
        )
      })
      .catch(() => setSaveStatus('Save as failed'))
  }

  function titleFromDataName(value: string) {
    return (
      value
        .replace(/^hdf5:/, '')
        .replace(/^metadata:/, '')
        .replace(/\{shot_id\}/g, 'shot')
        .split('/')
        .filter(Boolean)
        .at(-1) ?? ''
    )
  }

  const updateSelectedInputs = (nextInputs: string[]) => {
    setSelectedInputs(nextInputs)

    const firstInput = nextInputs[0] ?? ''
    if (!firstInput) {
      return
    }

    const nextTitle = titleFromDataName(firstInput)

    if (nextTitle && !fieldTitleEdited) {
      setFieldTitle(nextTitle)
    }
  }
  return (
    <HomePage
      header={<AppHeader />}
      main={
        <Container fluid py="md">
          <Stack gap="md">
            <Group justify="space-between">
              <Stack gap={2}>
                <Title order={3}>Context builder</Title>
                <Text size="sm" c="dimmed">
                  Build and save one DAMNIT context variable for{' '}
                  {source?.title ?? source_key}. Saved files live on the API
                  host.
                </Text>
              </Stack>
              <Button
                component="a"
                href={`/source/${source_key}`}
                variant="light"
              >
                Back to shots
              </Button>
            </Group>
            <Grid gutter="md">
              <Grid.Col span={{ base: 12, lg: 5 }}>
                <Card withBorder radius={4} p="md">
                  <Stack gap="md">
                    <ContextBuilderDisclosure
                      title="Target and example shot"
                      description="Choose the output scope and the shot used for previews."
                      summary={
                        contextScope === 'set' ? 'Per-set view' : 'Per-shot'
                      }
                    >
                      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                        <Select
                          label="Build target"
                          value={contextScope}
                          onChange={(value) => setContextScope(value ?? 'shot')}
                          data={[
                            { value: 'shot', label: 'Per-shot table column' },
                            { value: 'set', label: 'Per-set trend or summary' },
                          ]}
                        />
                        <Select
                          label="Example shot"
                          value={selectedShotNumber?.toString()}
                          onChange={(value) =>
                            setSelectedShotNumber(
                              value ? Number(value) : undefined
                            )
                          }
                          data={shots.map((shot) => ({
                            value: shot.shot_number.toString(),
                            label: `${shot.shot_number} - ${shot.fired_at}`,
                          }))}
                        />
                      </SimpleGrid>
                      <Text size="xs" c="dimmed">
                        Source: {source?.title ?? source_key}
                      </Text>
                    </ContextBuilderDisclosure>
                    <ContextBuilderPanel
                      tone="blue"
                      title="Column identity"
                      description="The title drives the Python function name unless you unlock a custom one."
                    >
                      <Stack gap="sm">
                        <TextInput
                          label="Column title"
                          value={fieldTitle}
                          onChange={(event) => {
                            const nextTitle = event.currentTarget.value

                            setFieldTitle(nextTitle)
                            setFieldTitleEdited(nextTitle.trim() !== '')
                          }}
                        />
                        <Paper withBorder radius={4} p="sm" bg="white">
                          <Stack gap="xs">
                            <Group justify="space-between" align="flex-start">
                              <Stack gap={0} style={{ minWidth: 0 }}>
                                <Text size="sm" fw={600}>
                                  Python function name
                                </Text>
                                <Text size="xs" c="dimmed">
                                  {fieldNameOverridden
                                    ? 'Custom name is enabled.'
                                    : 'This stays synced to the title.'}
                                </Text>
                              </Stack>
                              <Group gap="xs">
                                {fieldNameOverridden ? (
                                  <Button
                                    size="xs"
                                    variant="subtle"
                                    onClick={() =>
                                      setFieldNameOverridden(false)
                                    }
                                  >
                                    Use title name
                                  </Button>
                                ) : null}
                                <Button
                                  size="xs"
                                  variant="light"
                                  onClick={() => {
                                    if (!fieldNameOverridden) {
                                      setFieldNameOverridden(true)
                                    }
                                  }}
                                >
                                  {fieldNameOverridden
                                    ? 'Custom name'
                                    : 'Override name'}
                                </Button>
                              </Group>
                            </Group>
                            {fieldNameOverridden ? (
                              <TextInput
                                value={fieldName}
                                error={
                                  isValidPythonFunctionName(fieldName)
                                    ? undefined
                                    : 'Use a valid, non-reserved Python function name.'
                                }
                                onChange={(event) =>
                                  setFieldName(
                                    pythonNameFromTitle(
                                      event.currentTarget.value
                                    )
                                  )
                                }
                              />
                            ) : (
                              <Code block>{fieldName}</Code>
                            )}
                          </Stack>
                        </Paper>
                      </Stack>
                    </ContextBuilderPanel>
                    <ContextBuilderPanel
                      tone="indigo"
                      title="Data"
                      description="Choose the metadata or HDF5 data first; valid actions appear below."
                    >
                      {actionCanUseMultipleInputs ? (
                        <Checkbox
                          label={
                            contextScope === 'set'
                              ? 'Compare multiple columns/datasets'
                              : 'Use multiple inputs for custom function'
                          }
                          checked={allowMultipleInputs}
                          onChange={(event) =>
                            setAllowMultipleInputs(event.currentTarget.checked)
                          }
                        />
                      ) : null}
                      {allowMultipleInputs && actionCanUseMultipleInputs ? (
                        <MultiSelect
                          label="Data to use"
                          value={selectedInputs}
                          onChange={updateSelectedInputs}
                          data={inputOptions}
                          searchable
                          clearable
                        />
                      ) : (
                        <Select
                          label="Data to use"
                          value={selectedInputs[0] ?? null}
                          onChange={(value) =>
                            updateSelectedInputs(value ? [value] : [])
                          }
                          data={inputOptions}
                          searchable
                          clearable
                        />
                      )}
                      <Text size="xs" c="dimmed">
                        Selected: {selectedInputSummary}
                      </Text>
                    </ContextBuilderPanel>
                    <ContextBuilderPanel
                      tone="teal"
                      title="Action"
                      description="Choose what this column can do with the selected data."
                    >
                      <Select
                        label={
                          contextScope === 'shot'
                            ? 'What should this column do?'
                            : 'What should this set view do?'
                        }
                        value={fieldKind}
                        onChange={(value) => {
                          if (value) {
                            setFieldKind(value)
                          }
                        }}
                        data={recipeOptions}
                        disabled={!selectedInputs.length}
                      />
                      <Group gap="xs" align="flex-start" wrap="nowrap">
                        <Badge
                          variant="light"
                          color={contextRecipeTone(fieldKind)}
                          radius={4}
                          styles={{ label: { textTransform: 'none' } }}
                          style={{ flexShrink: 0 }}
                        >
                          {contextRecipeLabel(fieldKind)}
                        </Badge>
                        <Text size="xs" c="dimmed">
                          {selectedInputs.length
                            ? recipeHelp
                            : 'Choose data first, then available actions appear here.'}
                        </Text>
                      </Group>
                    </ContextBuilderPanel>
                    {showMongoFields ? (
                      <ContextBuilderPanel
                        tone="yellow"
                        title="Mongo query"
                        description="Write the Mongo-style filter object used to find the row, then choose which field from that row appears in the table."
                      >
                        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                          <TextInput
                            label="Query collection"
                            value={mongoCollection}
                            onChange={(event) =>
                              setMongoCollection(event.currentTarget.value)
                            }
                          />
                          <Card withBorder radius={4} p="sm">
                            <Stack gap={2}>
                              <Text size="xs" c="dimmed">
                                Filter variable
                              </Text>
                              <Code>shot_number</Code>
                            </Stack>
                          </Card>
                        </SimpleGrid>
                        <Textarea
                          label="Mongo filter object"
                          description="Use shot_number from the current shot. The result should be one JSON-like object."
                          minRows={5}
                          value={mongoFilter}
                          onChange={(event) =>
                            setMongoFilter(event.currentTarget.value)
                          }
                        />
                        <Code block>
                          {'{\n  "shot_number": shot_number\n}'}
                        </Code>
                      </ContextBuilderPanel>
                    ) : null}
                    {showFunctionFields ? (
                      <ContextBuilderPanel
                        tone="violet"
                        title="Custom function"
                        description="Combine the selected inputs into the value returned by the column."
                      >
                        <Textarea
                          label="Function expression"
                          minRows={3}
                          value={combineExpression}
                          onChange={(event) =>
                            setCombineExpression(event.currentTarget.value)
                          }
                        />
                      </ContextBuilderPanel>
                    ) : null}
                    <Paper
                      withBorder
                      radius={4}
                      p="sm"
                      bg="var(--mantine-color-gray-0)"
                    >
                      <Text size="sm" c="dimmed">
                        {saveStatus || contextFile?.path || '-'}
                      </Text>
                    </Paper>
                  </Stack>
                </Card>
              </Grid.Col>
              <Grid.Col span={{ base: 12, lg: 7 }}>
                <Stack gap="sm">
                  <ContextBuilderPanel
                    tone="gray"
                    title="Context file and existing columns"
                    description="Choose the destination, manage existing columns, and add the generated variable."
                  >
                    <Group justify="space-between" gap="xs">
                      <Badge variant="light" radius={4}>
                        Destination: {selectedContextFile}
                      </Badge>
                      <Group gap="xs">
                        <Button
                          onClick={appendToContext}
                          disabled={!canSaveGeneratedColumn}
                        >
                          Add to context
                        </Button>
                        <Button onClick={saveManualContext}>
                          Save {selectedContextFile}
                        </Button>
                        <Button
                          onClick={repairContextImports}
                          variant="light"
                          leftSection={<IconRefresh size={16} />}
                        >
                          Repair imports
                        </Button>
                      </Group>
                    </Group>
                    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
                      <Select
                        label="Context file"
                        value={selectedContextFile}
                        onChange={loadContextVariant}
                        data={contextFiles.map((entry) => ({
                          value: entry.name,
                          label: entry.active
                            ? `${entry.name} (active)`
                            : entry.name,
                        }))}
                        searchable
                      />
                      <Paper withBorder radius={4} p="sm">
                        <Stack gap="xs">
                          <Select
                            label="Selected existing column"
                            description="The actions below apply to this column."
                            value={selectedColumnId}
                            onChange={selectAndLoadColumn}
                            data={contextVariables.map((block, index) => ({
                              value: block.id,
                              label: block.title
                                ? `${index + 1}. ${block.title} (${block.name})`
                                : `${index + 1}. ${block.name}`,
                            }))}
                            placeholder="Choose a @Variable"
                            searchable
                          />
                          {selectedContextVariable ? (
                            <Text size="xs" c="dimmed">
                              Position {selectedColumnIndex + 1} of{' '}
                              {contextVariables.length}
                            </Text>
                          ) : null}
                          <Group gap="xs">
                            <Button
                              size="xs"
                              variant="light"
                              onClick={() => {
                                setSelectedColumnId(null)
                                setSaveStatus(
                                  'Existing column deselected. Add to context will create a new column.'
                                )
                              }}
                              disabled={!selectedContextVariable}
                            >
                              Deselect / new column
                            </Button>
                            <Button
                              size="xs"
                              variant="light"
                              onClick={replaceSelectedColumn}
                              disabled={
                                !selectedContextVariable ||
                                !canSaveGeneratedColumn
                              }
                            >
                              Replace selected
                            </Button>
                            <Button
                              size="xs"
                              variant="light"
                              leftSection={<IconArrowUp size={16} />}
                              onClick={() => moveSelectedColumn(-1)}
                              disabled={selectedColumnIndex <= 0}
                            >
                              Move selected up
                            </Button>
                            <Button
                              size="xs"
                              variant="light"
                              leftSection={<IconArrowDown size={16} />}
                              onClick={() => moveSelectedColumn(1)}
                              disabled={
                                selectedColumnIndex < 0 ||
                                selectedColumnIndex >=
                                  contextVariables.length - 1
                              }
                            >
                              Move selected down
                            </Button>
                            <Button
                              size="xs"
                              variant="light"
                              color="red"
                              onClick={deleteSelectedColumn}
                              disabled={!selectedContextVariable}
                            >
                              Delete selected column
                            </Button>
                          </Group>
                        </Stack>
                      </Paper>
                    </SimpleGrid>
                  </ContextBuilderPanel>
                  <ContextBuilderDisclosure
                    title="Preview"
                    description="Visual result and exact technical values in one view."
                    summary={contextRecipeLabel(fieldKind)}
                    open
                  >
                    <Group justify="space-between" gap="sm">
                      <Stack gap={2}>
                        <Text size="xs" c="dimmed">
                          Selected input
                        </Text>
                        <Text size="sm" fw={600}>
                          {selectedInputSummary}
                        </Text>
                      </Stack>
                      <Button
                        onClick={previewColumn}
                        variant="light"
                        disabled={!canBuildColumn}
                      >
                        Preview column
                      </Button>
                    </Group>
                    <Grid gutter="sm">
                      <Grid.Col span={{ base: 12, md: 7 }}>
                        <Paper
                          withBorder
                          radius={4}
                          p="sm"
                          bg="var(--mantine-color-blue-0)"
                          h="100%"
                        >
                          <Stack gap="xs">
                            <Text size="sm" fw={700}>
                              Visual preview
                            </Text>
                            <VisualPreview
                              contextScope={contextScope}
                              datasetPreview={datasetPreview}
                              fieldKind={fieldKind}
                              fieldTitle={fieldTitle}
                              columnDetails={columnDetails}
                              shots={shots}
                            />
                          </Stack>
                        </Paper>
                      </Grid.Col>
                      <Grid.Col span={{ base: 12, md: 5 }}>
                        <Paper
                          withBorder
                          radius={4}
                          p="sm"
                          bg="var(--mantine-color-gray-0)"
                          h="100%"
                        >
                          <Stack gap="xs">
                            <Text size="sm" fw={700}>
                              Technical values
                            </Text>
                            <Text size="xs" c="dimmed">
                              Exact values used to build the visual result.
                            </Text>
                            <Code block>
                              {columnDetails || 'Click Preview column.'}
                            </Code>
                          </Stack>
                        </Paper>
                      </Grid.Col>
                    </Grid>
                  </ContextBuilderDisclosure>
                  <ContextBuilderDisclosure
                    title="Generated variable"
                    description="Review or edit the generated Python before saving it."
                    summary={generatedEditorCompact ? 'Compact' : 'Expanded'}
                  >
                    <Group justify="flex-end" gap="xs">
                      <Button
                        variant="subtle"
                        onClick={() =>
                          setGeneratedEditorCompact((compact) => !compact)
                        }
                      >
                        {generatedEditorCompact
                          ? 'Expand editor'
                          : 'Compact editor'}
                      </Button>
                    </Group>
                    <Textarea
                      value={generatedDraft}
                      onChange={(event) =>
                        setGeneratedDraft(event.currentTarget.value)
                      }
                      autosize
                      minRows={generatedEditorCompact ? 6 : 18}
                      maxRows={generatedEditorCompact ? 10 : 28}
                      styles={{
                        input: {
                          fontFamily:
                            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                          fontSize: '12px',
                        },
                      }}
                    />
                  </ContextBuilderDisclosure>
                  <ContextBuilderDisclosure
                    title="Manual context editor"
                    description={
                      contextFile?.path ?? 'Edit the full context file.'
                    }
                    summary={selectedContextFile}
                  >
                    <Group justify="flex-end">
                      <Button onClick={saveManualContext}>
                        Save {selectedContextFile}
                      </Button>
                    </Group>
                    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                      <TextInput
                        label="Save as"
                        value={saveAsName}
                        onChange={(event) =>
                          setSaveAsName(event.currentTarget.value)
                        }
                      />
                      <Button mt={24} onClick={saveAsContext} variant="light">
                        Save as
                      </Button>
                    </SimpleGrid>
                    <Textarea
                      value={contextContent}
                      onChange={(event) =>
                        setContextContent(event.currentTarget.value)
                      }
                      autosize
                      minRows={14}
                      maxRows={28}
                      styles={{
                        input: {
                          fontFamily:
                            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                          fontSize: '12px',
                        },
                      }}
                    />
                  </ContextBuilderDisclosure>
                </Stack>
              </Grid.Col>
            </Grid>
          </Stack>
        </Container>
      }
    />
  )
}

function flattenObjectKeys(
  value: Record<string, unknown>,
  prefix = ''
): string[] {
  return Object.entries(value).flatMap(([key, nestedValue]) => {
    const fullKey = prefix ? `${prefix}.${key}` : key
    if (
      nestedValue &&
      typeof nestedValue === 'object' &&
      !Array.isArray(nestedValue)
    ) {
      return flattenObjectKeys(nestedValue as Record<string, unknown>, fullKey)
    }
    return [fullKey]
  })
}

function getNumericMetadataKeys(shots: HZDRShot[]) {
  return Array.from(
    new Set(
      shots.flatMap((shot) =>
        flattenObjectKeys(shot.metadata).filter((key) => {
          const value = getNestedMetadataValue(shot.metadata, key)
          return typeof value === 'number' && Number.isFinite(value)
        })
      )
    )
  ).sort()
}

function countNumericValues(shots: HZDRShot[], key: string) {
  return shots.filter((shot) => {
    const value = getNestedMetadataValue(shot.metadata, key)
    return typeof value === 'number' && Number.isFinite(value)
  }).length
}

function collectNumericMetadataTrendValues(shots: HZDRShot[], key: string) {
  return shots.flatMap((shot) => {
    const value = getNestedMetadataValue(shot.metadata, key)
    return typeof value === 'number' && Number.isFinite(value)
      ? [{ shotNumber: shot.shot_number, value }]
      : []
  })
}

async function requireJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}`)
  }
  return response.json() as Promise<T>
}

function splitPythonImportBlock(content: string) {
  const imports: string[] = []
  const bodyLines: string[] = []
  let inLeadingImports = true

  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    const isImportLine =
      /^import\s+\S+/.test(trimmed) || /^from\s+\S+\s+import\s+/.test(trimmed)
    if (inLeadingImports && (isImportLine || trimmed === '')) {
      if (isImportLine) {
        imports.push(trimmed)
      }
      continue
    }
    inLeadingImports = false
    bodyLines.push(line)
  }

  return {
    imports,
    body: bodyLines.join('\n').trimStart(),
  }
}

function mergeImportsAtTop(content: string, imports: string[]) {
  const missingImports = imports.filter(
    (importLine) => !pythonImportAlreadyCovered(content, importLine)
  )
  if (!missingImports.length) {
    return content
  }

  const insertionIndex = getPythonImportInsertionIndex(content)
  const before = content.slice(0, insertionIndex).trimEnd()
  const after = content.slice(insertionIndex).trimStart()
  const importBlock = missingImports.join('\n')
  return `${before}\n\n${importBlock}\n\n${after}`.trimStart()
}

function stripDuplicateSnippetImports(snippet: string, contextContent: string) {
  const { imports, body } = splitPythonImportBlock(snippet)
  const newImports = imports.filter(
    (importLine) => !pythonImportAlreadyCovered(contextContent, importLine)
  )
  return `${newImports.length ? `${newImports.join('\n')}\n\n` : ''}${body}`
}

function pythonImportAlreadyCovered(content: string, importLine: string) {
  const trimmedImport = importLine.trim()
  if (content.split('\n').some((line) => line.trim() === trimmedImport)) {
    return true
  }

  const fromImportMatch = trimmedImport.match(/^from\s+(\S+)\s+import\s+(.+)$/)
  if (!fromImportMatch) {
    return false
  }

  const [, moduleName, requiredNamesText] = fromImportMatch
  const requiredNames = parsePythonImportNames(requiredNamesText)
  return content.split('\n').some((line) => {
    const existingMatch = line.trim().match(/^from\s+(\S+)\s+import\s+(.+)$/)
    if (!existingMatch || existingMatch[1] !== moduleName) {
      return false
    }
    const existingNames = parsePythonImportNames(existingMatch[2])
    return (
      existingNames.includes('*') ||
      requiredNames.every((name) => existingNames.includes(name))
    )
  })
}

function parsePythonImportNames(namesText: string) {
  return namesText
    .replace(/[()]/g, '')
    .split(',')
    .map((name) => name.trim().split(/\s+as\s+/)[0])
    .filter(Boolean)
}

function getPythonImportInsertionIndex(content: string) {
  const trimmedStart = content.trimStart()
  const leadingWhitespace = content.length - trimmedStart.length
  const quote = trimmedStart.startsWith('"""')
    ? '"""'
    : trimmedStart.startsWith("'''")
      ? "'''"
      : ''
  if (!quote) {
    return 0
  }
  const docstringEnd = trimmedStart.indexOf(quote, quote.length)
  if (docstringEnd < 0) {
    return 0
  }
  return leadingWhitespace + docstringEnd + quote.length
}

function parseContextVariableBlocks(content: unknown): ContextVariableBlock[] {
  if (typeof content !== 'string' || !content.trim()) {
    return []
  }
  const matches = [
    ...content.matchAll(/@Variable\(([\s\S]*?)\)\s*\ndef\s+([A-Za-z_]\w*)/g),
  ]
  return matches.map((match, index) => {
    const start = match.index ?? 0
    const end = matches[index + 1]?.index ?? content.length
    const titleMatch = match[1].match(/title\s*=\s*["']([^"']+)["']/)
    const name = match[2]
    return {
      id: name,
      name,
      title: titleMatch?.[1] ?? name,
      start,
      end,
      block: content.slice(start, end),
    }
  })
}

function inferContextBuilderFormState(
  block: ContextVariableBlock
): ContextBuilderFormState {
  const metadataKey = extractPythonDocGetKey(block.block)
  const datasetName = extractPythonHdf5DatasetName(block.block)
  const selectedInputs = [
    metadataKey ? `metadata:${metadataKey}` : undefined,
    datasetName ? `hdf5:${datasetName}` : undefined,
  ].filter((input): input is string => Boolean(input))
  const fieldKind = inferContextBuilderFieldKind(block.block)
  const mongoFilter = extractPythonMongoFilter(block.block)
  const combineExpression =
    fieldKind === 'function'
      ? extractPythonReturnExpression(block.block)
      : undefined

  return {
    contextScope: block.block.includes('trendable shot-set') ? 'set' : 'shot',
    fieldKind,
    fieldName: block.name,
    fieldTitle: block.title,
    selectedInputs,
    allowMultipleInputs: selectedInputs.length > 1,
    mongoCollection: extractPythonMongoCollection(block.block),
    mongoFilter,
    combineExpression,
  }
}

function inferContextBuilderFieldKind(block: string) {
  if (/\bhdf5_values\b/.test(block) && /\bmetadata_value\b/.test(block)) {
    return 'function'
  }
  if (/preview\s*=\s*fig\b/.test(block) || /\bpx\.line\b/.test(block)) {
    return 'plotly-trend'
  }
  if (/preview\s*=\s*image\b/.test(block)) {
    return 'image-preview'
  }
  if (/preview\s*=\s*lineout\b/.test(block)) {
    return 'lineout-preview'
  }
  if (/\bh5py\.File\b/.test(block)) {
    return 'hdf5'
  }
  if (/^\s*query\s*=/m.test(block)) {
    return 'mongo-filter'
  }
  if (/\bmongo_find_one\b/.test(block)) {
    return 'metadata'
  }
  return 'function'
}

function extractPythonDocGetKey(block: string) {
  return block.match(/doc\.get\(\s*(["'])(.*?)\1\s*\)/)?.[2]
}

function extractPythonHdf5DatasetName(block: string) {
  return (
    block.match(/dataset_name\s*=\s*f?(["'])(.*?)\1/)?.[2] ??
    block.match(/handle\[\s*(["'])(.*?)\1\s*\]/)?.[2]
  )
}

function extractPythonMongoCollection(block: string) {
  return block.match(/mongo_find_one\(\s*(["'])(.*?)\1/)?.[2]
}

function extractPythonMongoFilter(block: string) {
  const queryAssignment = block.match(
    /^\s*query\s*=\s*([\s\S]*?)\n\s*doc\s*=\s*mongo_find_one/m
  )
  if (queryAssignment?.[1]) {
    return queryAssignment[1].trim()
  }
  const keywordQuery = block.match(/query\s*=\s*([\s\S]*?)\n\s*\)/)
  return keywordQuery?.[1]?.replace(/,\s*$/, '').trim()
}

function extractPythonReturnExpression(block: string) {
  const returns = [...block.matchAll(/^\s*return\s+(.+)$/gm)]
  return returns.at(-1)?.[1]?.trim()
}

function getContextRecipeInputValues(
  options: Array<SelectOption | SelectOptionGroup>
) {
  return options.flatMap((option) =>
    'items' in option ? option.items.map((item) => item.value) : option.value
  )
}

function makeContextVariableBlockUnique(
  block: string,
  existingBlocks: ContextVariableBlock[]
) {
  const currentName = extractPythonFunctionName(block)
  if (!currentName) {
    return block
  }
  const existingNames = new Set(existingBlocks.map((entry) => entry.name))
  if (!existingNames.has(currentName)) {
    return block
  }

  const baseName = currentName.replace(/_\d+$/, '')
  let suffix = 2
  let nextName = `${baseName}_${suffix}`
  while (existingNames.has(nextName)) {
    suffix += 1
    nextName = `${baseName}_${suffix}`
  }

  const renamedBlock = block.replace(
    new RegExp(`def\\s+${escapeRegExp(currentName)}\\s*\\(`),
    `def ${nextName}(`
  )
  const titleMatch = renamedBlock.match(/title\s*=\s*(["'])(.*?)\1/)
  if (!titleMatch) {
    return renamedBlock
  }
  const existingTitles = new Set(existingBlocks.map((entry) => entry.title))
  const currentTitle = titleMatch[2]
  const nextTitle = existingTitles.has(currentTitle)
    ? `${currentTitle} ${suffix}`
    : currentTitle
  return renamedBlock.replace(
    /title\s*=\s*(["'])(.*?)\1/,
    `title=${JSON.stringify(nextTitle)}`
  )
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const PYTHON_RESERVED_NAMES = new Set([
  'False',
  'None',
  'True',
  'and',
  'as',
  'assert',
  'async',
  'await',
  'break',
  'class',
  'continue',
  'def',
  'del',
  'elif',
  'else',
  'except',
  'finally',
  'for',
  'from',
  'global',
  'if',
  'import',
  'in',
  'is',
  'lambda',
  'nonlocal',
  'not',
  'or',
  'pass',
  'raise',
  'return',
  'try',
  'while',
  'with',
  'yield',
])

function isValidPythonFunctionName(name: string) {
  return /^[A-Za-z_]\w*$/.test(name) && !PYTHON_RESERVED_NAMES.has(name)
}

function extractPythonFunctionName(block: string) {
  const name = block.match(/def\s+([A-Za-z_]\w*)\s*\(/)?.[1]
  return name && isValidPythonFunctionName(name) ? name : undefined
}

function pythonNameFromTitle(title: string) {
  const slug = title
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  const safeSlug = slug || 'hzdr_computed_field'
  const identifier = /^[a-z_]/.test(safeSlug) ? safeSlug : `field_${safeSlug}`
  return PYTHON_RESERVED_NAMES.has(identifier)
    ? `field_${identifier}`
    : identifier
}

function formatSelectedInput(value: string) {
  if (value.startsWith('metadata:')) {
    return `metadata.${value.slice(9)}`
  }
  if (value.startsWith('hdf5:')) {
    return `hdf5[${value.slice(5)}]`
  }
  if (value.startsWith('mongo:')) {
    return `mongo.${value.slice(6)}`
  }
  return value
}

function formatContextValue(value: unknown) {
  if (value === null || value === undefined) {
    return '-'
  }
  if (typeof value === 'number') {
    return Number.isInteger(value) ? value.toString() : value.toPrecision(5)
  }
  if (typeof value === 'string' || typeof value === 'boolean') {
    return String(value)
  }
  return JSON.stringify(value)
}

function isMissingContextValueError(error: string) {
  const normalized = error.toLowerCase()
  return (
    normalized.startsWith('no ') ||
    normalized.includes('missing ') ||
    normalized.includes('not found')
  )
}

function shotMatchesTableFilter(
  shot: HZDRShot,
  filterColumn: string,
  filterOperator: HZDRFilterOperator,
  filterValue: string,
  contextRow?: HZDRContextResults['rows'][number],
  shotDayLabel?: string
) {
  const trimmedFilter = filterValue.trim()
  if (!trimmedFilter) {
    return true
  }
  return getShotFilterValues(shot, filterColumn, contextRow, shotDayLabel).some(
    (value) => valueMatchesTableFilter(value, filterOperator, trimmedFilter)
  )
}

function compareHZDRShotsForTableSort(
  leftShot: HZDRShot,
  rightShot: HZDRShot,
  sortState: HZDRSortState,
  contextRowsByShot: Map<number, HZDRContextResults['rows'][number]>,
  shotDayLabels: Map<number, string | undefined>
) {
  const leftValue = getPrimaryShotSortValue(
    leftShot,
    sortState.column,
    contextRowsByShot.get(leftShot.shot_number),
    shotDayLabels.get(leftShot.shot_number)
  )
  const rightValue = getPrimaryShotSortValue(
    rightShot,
    sortState.column,
    contextRowsByShot.get(rightShot.shot_number),
    shotDayLabels.get(rightShot.shot_number)
  )
  const comparison = compareTableValues(leftValue, rightValue)
  if (comparison === 0) {
    return leftShot.shot_number - rightShot.shot_number
  }
  return sortState.direction === 'asc' ? comparison : -comparison
}

function getPrimaryShotSortValue(
  shot: HZDRShot,
  sortColumn: string,
  contextRow?: HZDRContextResults['rows'][number],
  shotDayLabel?: string
) {
  return getShotFilterValues(shot, sortColumn, contextRow, shotDayLabel)[0]
}

function compareTableValues(leftValue: unknown, rightValue: unknown) {
  if (leftValue === undefined || leftValue === null) {
    return rightValue === undefined || rightValue === null ? 0 : 1
  }
  if (rightValue === undefined || rightValue === null) {
    return -1
  }
  const leftNumber = Number(leftValue)
  const rightNumber = Number(rightValue)
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber - rightNumber
  }
  const leftDate = Date.parse(String(leftValue))
  const rightDate = Date.parse(String(rightValue))
  if (Number.isFinite(leftDate) && Number.isFinite(rightDate)) {
    return leftDate - rightDate
  }
  return String(leftValue).localeCompare(String(rightValue), undefined, {
    numeric: true,
    sensitivity: 'base',
  })
}

function getShotFilterValues(
  shot: HZDRShot,
  filterColumn: string,
  contextRow?: HZDRContextResults['rows'][number],
  shotDayLabel?: string
) {
  if (filterColumn.startsWith('context:')) {
    const columnName = filterColumn.slice('context:'.length)
    return [contextRow?.values[columnName]]
  }
  const metadataValues: Record<string, unknown> = {
    shot_number: shot.shot_number,
    shot_day: shotDayLabel,
    fired_at: [shot.fired_at, formatFiredAt(shot.fired_at)],
    status: shot.metadata.status,
    laser_energy_j: shot.metadata.laser_energy_j,
    target: shot.metadata.target,
  }
  if (filterColumn !== 'all') {
    return [metadataValues[filterColumn]].flat()
  }
  return [
    ...Object.values(metadataValues).flat(),
    shot.hdf5_path,
    ...Object.values(contextRow?.values ?? {}),
  ]
}

function valueMatchesTableFilter(
  value: unknown,
  filterOperator: HZDRFilterOperator,
  filterValue: string
) {
  if (value === null || value === undefined) {
    return false
  }
  if (filterOperator === 'includes') {
    return String(value).toLowerCase().includes(filterValue.toLowerCase())
  }
  const numericValue = Number(value)
  const numericFilter = Number(filterValue)
  const canCompareNumbers =
    Number.isFinite(numericValue) && Number.isFinite(numericFilter)
  if (filterOperator === 'equals') {
    return canCompareNumbers
      ? numericValue === numericFilter
      : String(value).toLowerCase() === filterValue.toLowerCase()
  }
  if (!canCompareNumbers) {
    return false
  }
  if (filterOperator === 'gt') {
    return numericValue > numericFilter
  }
  if (filterOperator === 'gte') {
    return numericValue >= numericFilter
  }
  if (filterOperator === 'lt') {
    return numericValue < numericFilter
  }
  return numericValue <= numericFilter
}

function isScalarContextValue(value: unknown, preview: unknown) {
  return (
    typeof value === 'number' && Number.isFinite(value) && preview === undefined
  )
}

function buildShotDayLabels(shots: HZDRShot[]) {
  const dateKeys = Array.from(
    new Set(
      shots
        .map((shot) => getShotDateKey(shot.fired_at))
        .filter((dateKey): dateKey is string => Boolean(dateKey))
    )
  ).sort()
  const dayByDate = new Map(
    dateKeys.map((dateKey, index) => [dateKey, `Day ${index + 1}`])
  )
  return new Map(
    shots.map((shot) => {
      const dateKey = getShotDateKey(shot.fired_at)
      return [shot.shot_number, dateKey ? (dayByDate.get(dateKey) ?? '-') : '-']
    })
  )
}

function getShotDateKey(firedAt: string) {
  if (!firedAt) {
    return undefined
  }
  const isoDate = firedAt.match(/^\d{4}-\d{2}-\d{2}/)?.[0]
  if (isoDate) {
    return isoDate
  }
  const date = new Date(firedAt)
  if (Number.isNaN(date.getTime())) {
    return undefined
  }
  return date.toISOString().slice(0, 10)
}

function formatFiredAt(firedAt: string) {
  if (!firedAt) {
    return '-'
  }
  const date = new Date(firedAt)
  if (Number.isNaN(date.getTime())) {
    return firedAt
  }
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(date)
}

function TruncatedCell({
  value,
  fw,
  c,
}: {
  value: unknown
  fw?: number
  c?: string
}) {
  return (
    <Text
      size="sm"
      fw={fw}
      c={c}
      title={String(value ?? '')}
      style={{
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        minWidth: 0,
      }}
    >
      {String(value ?? '-')}
    </Text>
  )
}

function buildColumnPreview({
  fieldKind,
  selectedInputs,
  selectedShot,
  datasetOptions,
  combineExpression,
}: {
  fieldKind: string
  selectedInputs: string[]
  selectedShot?: HZDRShot
  datasetOptions: HZDRDatasetOption[]
  combineExpression: string
}) {
  if (!selectedShot) {
    return 'No example shot selected.'
  }

  const metadataKey = selectedInputs
    .find((value) => value.startsWith('metadata:'))
    ?.slice(9)
  const datasetName = selectedInputs
    .find((value) => value.startsWith('hdf5:'))
    ?.slice(5)
  const metadataValue = metadataKey
    ? getNestedMetadataValue(selectedShot.metadata, metadataKey)
    : undefined
  const dataset = selectedInputs
    .map((value) => datasetOptions.find((option) => option.value === value))
    .find(Boolean)

  if (fieldKind === 'metadata') {
    return JSON.stringify(
      {
        shot_number: selectedShot.shot_number,
        input: metadataKey ?? 'metadata key not selected',
        value: metadataValue ?? null,
      },
      null,
      2
    )
  }

  if (fieldKind === 'hdf5') {
    return JSON.stringify(
      {
        shot_number: selectedShot.shot_number,
        dataset: datasetName ?? 'dataset not selected',
        shape: dataset?.shape ?? null,
        dtype: dataset?.dtype ?? null,
        value: dataset ? `nanmean(${dataset.name})` : null,
        displayed_value: 'nanmean(dataset)',
      },
      null,
      2
    )
  }

  if (fieldKind === 'lineout-preview') {
    return JSON.stringify(
      {
        shot_number: selectedShot.shot_number,
        dataset: datasetName ?? 'dataset not selected',
        shape: dataset?.shape ?? null,
        dtype: dataset?.dtype ?? null,
        value: dataset ? `nanmean(${dataset.name})` : null,
        preview: dataset ? `lineout(${dataset.name})` : null,
        displayed_value: 'nanmean(lineout)',
      },
      null,
      2
    )
  }

  if (fieldKind === 'image-preview') {
    return JSON.stringify(
      {
        shot_number: selectedShot.shot_number,
        dataset: datasetName ?? 'dataset not selected',
        shape: dataset?.shape ?? null,
        dtype: dataset?.dtype ?? null,
        value: dataset ? `nanmean(${dataset.name})` : null,
        preview: dataset ? `thumbnail(${dataset.name})` : null,
        displayed_value: 'nanmean(image)',
      },
      null,
      2
    )
  }

  if (fieldKind === 'plotly-trend') {
    return JSON.stringify(
      {
        shot_number: selectedShot.shot_number,
        dataset: datasetName ?? 'dataset not selected',
        shape: dataset?.shape ?? null,
        dtype: dataset?.dtype ?? null,
        value: dataset ? `nanmean(${dataset.name})` : null,
        preview: dataset ? `Plotly line(${dataset.name})` : null,
        displayed_value: 'nanmean(values)',
      },
      null,
      2
    )
  }

  if (fieldKind === 'function') {
    return JSON.stringify(
      {
        shot_number: selectedShot.shot_number,
        metadata_input: metadataKey ?? null,
        metadata_value: metadataValue ?? null,
        hdf5_dataset: datasetName ?? null,
        hdf5_shape: dataset?.shape ?? null,
        expression: combineExpression,
        value:
          metadataValue !== undefined && dataset
            ? `${combineExpression} -> computed at runtime`
            : null,
      },
      null,
      2
    )
  }

  return JSON.stringify(
    {
      shot_number: selectedShot.shot_number,
      mongo_query: 'uses the configured Mongo filter at runtime',
      selected_inputs: selectedInputs.map(formatSelectedInput),
      value: 'MongoDB field value at runtime',
    },
    null,
    2
  )
}

function getNestedMetadataValue(
  metadata: Record<string, unknown>,
  keyPath: string
) {
  return keyPath.split('.').reduce<unknown>((currentValue, key) => {
    if (
      currentValue &&
      typeof currentValue === 'object' &&
      !Array.isArray(currentValue)
    ) {
      return (currentValue as Record<string, unknown>)[key]
    }
    return undefined
  }, metadata)
}

function VisualPreview({
  contextScope,
  datasetPreview,
  fieldKind,
  fieldTitle,
  columnDetails,
  shots,
}: {
  contextScope: string
  datasetPreview?: HZDRDatasetPreview
  fieldKind: string
  fieldTitle: string
  columnDetails: string
  shots: HZDRShot[]
}) {
  const parsedDetails = parseColumnDetails(columnDetails)
  const metadataInput =
    typeof parsedDetails.input === 'string' ? parsedDetails.input : undefined

  if (contextScope === 'set' && fieldKind === 'metadata' && metadataInput) {
    return (
      <Stack gap="xs">
        <ColumnCellPreview fieldTitle={fieldTitle} details={parsedDetails} />
        <MetadataTrendPreview
          values={collectNumericMetadataTrendValues(shots, metadataInput)}
          title={`${metadataInput} trend`}
        />
      </Stack>
    )
  }

  if (
    ![
      'hdf5',
      'lineout-preview',
      'image-preview',
      'plotly-trend',
      'function',
    ].includes(fieldKind)
  ) {
    return <ColumnCellPreview fieldTitle={fieldTitle} details={parsedDetails} />
  }

  if (!datasetPreview) {
    return <ColumnCellPreview fieldTitle={fieldTitle} details={parsedDetails} />
  }

  if (datasetPreview.preview_kind === 'image') {
    const pixels = datasetPreview.preview as number[][]
    return (
      <Stack gap="xs">
        <ColumnCellPreview fieldTitle={fieldTitle} details={parsedDetails} />
        <Text size="sm" fw={600}>
          {datasetPreview.name}
        </Text>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${pixels[0]?.length ?? 1}, 1fr)`,
            width: '100%',
            maxWidth: 420,
            aspectRatio: '1 / 1',
            border: '1px solid var(--mantine-color-gray-4)',
          }}
        >
          {pixels.flatMap((row, rowIndex) =>
            row.map((value, columnIndex) => (
              <div
                key={`${rowIndex}-${columnIndex}`}
                style={{
                  backgroundColor: `rgb(${Math.round(value * 255)}, ${Math.round(value * 255)}, ${Math.round(value * 255)})`,
                }}
              />
            ))
          )}
        </div>
      </Stack>
    )
  }

  if (datasetPreview.preview_kind === 'line') {
    const values = datasetPreview.preview as number[]
    const minValue = Math.min(...values)
    const maxValue = Math.max(...values)
    const points = values
      .map((value, index) => {
        const x = (index / Math.max(values.length - 1, 1)) * 100
        const y =
          90 - ((value - minValue) / Math.max(maxValue - minValue, 1e-9)) * 80
        return `${x},${y}`
      })
      .join(' ')
    return (
      <Stack gap="xs">
        <ColumnCellPreview fieldTitle={fieldTitle} details={parsedDetails} />
        <Text size="sm" fw={600}>
          {datasetPreview.name}
        </Text>
        <svg
          viewBox="0 0 100 100"
          width="100%"
          height="220"
          role="img"
          style={{ border: '1px solid var(--mantine-color-gray-4)' }}
        >
          <polyline
            points={points}
            fill="none"
            stroke="var(--mantine-color-blue-7)"
            strokeWidth="1.5"
          />
        </svg>
      </Stack>
    )
  }

  return (
    <Stack gap="xs">
      <ColumnCellPreview fieldTitle={fieldTitle} details={parsedDetails} />
      <Card withBorder radius={4} p="md">
        <Stack gap={4}>
          <Text size="sm" fw={600}>
            {datasetPreview.name}
          </Text>
          <Text size="xl">{String(datasetPreview.preview)}</Text>
        </Stack>
      </Card>
    </Stack>
  )
}

function parseColumnDetails(columnDetails: string): Record<string, unknown> {
  if (!columnDetails.trim()) {
    return {}
  }
  try {
    const parsed = JSON.parse(columnDetails)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : { value: parsed }
  } catch {
    return { value: columnDetails }
  }
}

function ColumnCellPreview({
  fieldTitle,
  details,
}: {
  fieldTitle: string
  details: Record<string, unknown>
}) {
  const value =
    details.value ??
    details.displayed_value ??
    details.metadata_value ??
    details.mongo_query ??
    'Click Preview column.'
  return (
    <Card withBorder radius={4} p="md">
      <Stack gap="xs">
        <Text size="sm" fw={700}>
          Table cell preview
        </Text>
        <Table withTableBorder withColumnBorders>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Shot</Table.Th>
              <Table.Th>{fieldTitle || 'Generated column'}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            <Table.Tr>
              <Table.Td>{String(details.shot_number ?? '-')}</Table.Td>
              <Table.Td>{String(value)}</Table.Td>
            </Table.Tr>
          </Table.Tbody>
        </Table>
        {details.dataset ? (
          <Text size="xs" c="dimmed">
            Dataset: {String(details.dataset)}
            {details.shape ? ` [${String(details.shape)}]` : ''}
          </Text>
        ) : null}
        {details.input ? (
          <Text size="xs" c="dimmed">
            Input: {String(details.input)}
          </Text>
        ) : null}
      </Stack>
    </Card>
  )
}

function MetadataTrendPreview({
  values,
  title = 'Trend preview',
  xLabel = 'shot number',
}: {
  values: { shotNumber: number; value: number }[]
  title?: string
  xLabel?: string
}) {
  if (!values.length) {
    return (
      <Card withBorder radius={4} p="md">
        <Text size="sm" c="dimmed">
          Select a numeric trend value to preview this shot set.
        </Text>
      </Card>
    )
  }

  const chart = {
    width: 320,
    height: 180,
    left: 58,
    right: 18,
    top: 18,
    bottom: 36,
  }
  const rawMin = Math.min(...values.map((entry) => entry.value))
  const rawMax = Math.max(...values.map((entry) => entry.value))
  const rawRange = rawMax - rawMin
  const padding =
    rawRange === 0 ? Math.max(Math.abs(rawMax) * 0.1, 1) : rawRange * 0.12
  const minValue = rawMin - padding
  const maxValue = rawMax + padding
  const valueRange = Math.max(maxValue - minValue, 1e-9)
  const plotWidth = chart.width - chart.left - chart.right
  const plotHeight = chart.height - chart.top - chart.bottom
  const xForIndex = (index: number) =>
    chart.left +
    (values.length === 1
      ? plotWidth / 2
      : (index / (values.length - 1)) * plotWidth)
  const yForValue = (value: number) =>
    chart.top + ((maxValue - value) / valueRange) * plotHeight
  const ticks = [maxValue, (maxValue + minValue) / 2, minValue]
  const points = values
    .map((entry, index) => {
      return `${xForIndex(index)},${yForValue(entry.value)}`
    })
    .join(' ')
  const firstShot = values[0]?.shotNumber
  const lastShot = values.at(-1)?.shotNumber

  return (
    <Stack gap="xs">
      <Group justify="space-between">
        <Text size="sm" fw={600}>
          {title}
        </Text>
        <Text size="xs" c="dimmed">
          {formatTrendValue(rawMin)} to {formatTrendValue(rawMax)}
        </Text>
      </Group>
      <svg
        viewBox={`0 0 ${chart.width} ${chart.height}`}
        width="100%"
        height="240"
        role="img"
        preserveAspectRatio="xMidYMid meet"
        style={{
          border: '1px solid var(--mantine-color-gray-4)',
          display: 'block',
          overflow: 'visible',
        }}
      >
        <rect
          x={chart.left}
          y={chart.top}
          width={plotWidth}
          height={plotHeight}
          fill="var(--mantine-color-gray-0)"
          stroke="var(--mantine-color-gray-4)"
          strokeWidth="1"
        />
        {ticks.map((tick) => {
          const y = yForValue(tick)
          return (
            <g key={tick}>
              <line
                x1={chart.left}
                x2={chart.width - chart.right}
                y1={y}
                y2={y}
                stroke="var(--mantine-color-gray-3)"
                strokeWidth="0.8"
              />
              <text
                x={chart.left - 8}
                y={y + 3}
                textAnchor="end"
                fontSize="10"
                fill="var(--mantine-color-gray-7)"
              >
                {formatTrendValue(tick)}
              </text>
            </g>
          )
        })}
        <polyline
          points={points}
          fill="none"
          stroke="var(--mantine-color-blue-7)"
          strokeWidth="2"
        />
        {values.map((entry, index) => {
          const x = xForIndex(index)
          const y = yForValue(entry.value)
          return (
            <g key={entry.shotNumber}>
              <circle
                cx={x}
                cy={y}
                r="3.2"
                fill="var(--mantine-color-blue-7)"
              />
              <title>
                Shot {entry.shotNumber}: {formatTrendValue(entry.value)}
              </title>
            </g>
          )
        })}
        <text
          x={chart.left}
          y={chart.height - 12}
          textAnchor="middle"
          fontSize="10"
          fill="var(--mantine-color-gray-7)"
        >
          {firstShot ?? '-'}
        </text>
        <text
          x={chart.width - chart.right}
          y={chart.height - 12}
          textAnchor="middle"
          fontSize="10"
          fill="var(--mantine-color-gray-7)"
        >
          {lastShot ?? '-'}
        </text>
        <text
          x={(chart.left + chart.width - chart.right) / 2}
          y={chart.height - 12}
          textAnchor="middle"
          fontSize="10"
          fill="var(--mantine-color-gray-7)"
        >
          {xLabel}
        </text>
      </svg>
    </Stack>
  )
}

function formatTrendValue(value: number) {
  if (
    Math.abs(value) >= 1000 ||
    (Math.abs(value) > 0 && Math.abs(value) < 0.001)
  ) {
    return value.toExponential(2)
  }
  return Number.isInteger(value) ? value.toString() : value.toPrecision(4)
}

function pythonShotIdParameter(datasetName: string) {
  return datasetName.includes('{shot_id}') ? ', shot_id: "meta#shot_id"' : ''
}

function pythonHdf5DatasetExpression(datasetName: string) {
  if (!datasetName.includes('{shot_id}')) {
    return JSON.stringify(datasetName)
  }
  return `f${JSON.stringify(datasetName)}`
}

function buildComputedFieldSnippet({
  fieldKind,
  contextScope,
  fieldName,
  fieldTitle,
  selectedInputs,
  mongoCollection,
  mongoFilter,
  combineExpression,
}: {
  fieldKind: string
  contextScope: string
  fieldName: string
  fieldTitle: string
  selectedInputs: string[]
  mongoCollection: string
  mongoFilter: string
  combineExpression: string
}) {
  const safeFieldName = fieldName.trim() || 'hzdr_computed_field'
  const safeFieldTitle = fieldTitle.trim() || 'HZDR/Computed field'
  const metadataKey =
    selectedInputs.find((value) => value.startsWith('metadata:'))?.slice(9) ??
    'status'
  const datasetName =
    selectedInputs.find((value) => value.startsWith('hdf5:'))?.slice(5) ??
    'signal'
  const hdf5ShotIdParameter = pythonShotIdParameter(datasetName)
  const hdf5DatasetExpression = pythonHdf5DatasetExpression(datasetName)
  const safeMongoCollection = mongoCollection.trim() || 'shots'

  if (fieldKind === 'metadata') {
    return `from damnit_ctx import Skip, Variable, mongo_find_one


@Variable(title=${JSON.stringify(safeFieldTitle)})
def ${safeFieldName}(run, shot_number: "meta#shot_number"):
    """Return a ${contextScope === 'set' ? 'trendable shot-set' : 'per-shot'} metadata value."""
    doc = mongo_find_one("shots", query={"shot_number": shot_number})
    if doc is None:
        raise Skip("No shot metadata document")
    value = doc.get(${JSON.stringify(metadataKey)})
    if value is None:
        raise Skip("No ${metadataKey} metadata for this shot")
    return value
`
  }

  if (fieldKind === 'hdf5') {
    return `import h5py
import numpy as np

from damnit_ctx import Skip, Variable


@Variable(title=${JSON.stringify(safeFieldTitle)}, summary="nanmean")
def ${safeFieldName}(run, hdf5_path: "meta#hdf5_path"${hdf5ShotIdParameter}):
    if not hdf5_path:
        raise Skip("No HDF5 path for this shot")
    with h5py.File(hdf5_path, "r") as handle:
        dataset_name = ${hdf5DatasetExpression}
        values = handle[dataset_name][...]
    return float(np.nanmean(values))
`
  }

  if (fieldKind === 'lineout-preview') {
    return `import h5py
import numpy as np

from damnit_ctx import Cell, Skip, Variable


@Variable(title=${JSON.stringify(safeFieldTitle)}, summary="nanmean")
def ${safeFieldName}(run, hdf5_path: "meta#hdf5_path"${hdf5ShotIdParameter}):
    """Show a scalar summary in the table and the full lineout in the preview."""
    if not hdf5_path:
        raise Skip("No HDF5 path for this shot")
    with h5py.File(hdf5_path, "r") as handle:
        dataset_name = ${hdf5DatasetExpression}
        lineout = np.asarray(handle[dataset_name][...])
    return Cell(lineout, summary="nanmean", preview=lineout)
`
  }

  if (fieldKind === 'image-preview') {
    return `import h5py
import numpy as np

from damnit_ctx import Cell, Skip, Variable


@Variable(title=${JSON.stringify(safeFieldTitle)}, summary="nanmean")
def ${safeFieldName}(run, hdf5_path: "meta#hdf5_path"${hdf5ShotIdParameter}):
    """Show a scalar summary in the table and a reduced image in the preview."""
    if not hdf5_path:
        raise Skip("No HDF5 path for this shot")
    with h5py.File(hdf5_path, "r") as handle:
        dataset_name = ${hdf5DatasetExpression}
        image = np.asarray(handle[dataset_name][...])
    return Cell(image, summary="nanmean", preview=image[::8, ::8])
`
  }

  if (fieldKind === 'plotly-trend') {
    return `import h5py
import numpy as np
import plotly.express as px

from damnit_ctx import Cell, Skip, Variable


@Variable(title=${JSON.stringify(safeFieldTitle)}, summary="nanmean")
def ${safeFieldName}(run, hdf5_path: "meta#hdf5_path"${hdf5ShotIdParameter}):
    """Use a Plotly figure as the double-click preview for a lineout."""
    if not hdf5_path:
        raise Skip("No HDF5 path for this shot")
    with h5py.File(hdf5_path, "r") as handle:
        dataset_name = ${hdf5DatasetExpression}
        values = np.asarray(handle[dataset_name][...])
    fig = px.line(x=np.arange(values.size), y=values, labels={"x": "Index", "y": "Signal"})
    return Cell(values, summary="nanmean", preview=fig)
`
  }

  if (fieldKind === 'mongo-filter') {
    return `from damnit_ctx import Skip, Variable, mongo_find_one


@Variable(title=${JSON.stringify(safeFieldTitle)})
def ${safeFieldName}(run, shot_number: "meta#shot_number"):
    query = ${mongoFilter}
    doc = mongo_find_one(${JSON.stringify(safeMongoCollection)}, query=query)
    if doc is None:
        raise Skip("No matching Mongo document")
    return doc.get(${JSON.stringify(metadataKey)})
`
  }

  if (fieldKind === 'function') {
    return `import h5py
import numpy as np

from damnit_ctx import Skip, Variable, mongo_find_one


@Variable(title=${JSON.stringify(safeFieldTitle)}, summary="nanmean")
def ${safeFieldName}(run, shot_number: "meta#shot_number", hdf5_path: "meta#hdf5_path"${hdf5ShotIdParameter}):
    """Compute this column from selected HZDR inputs."""
    doc = mongo_find_one(
        ${JSON.stringify(safeMongoCollection)},
        query=${mongoFilter},
    )
    if doc is None or not hdf5_path:
        raise Skip("Missing Mongo metadata or HDF5 path")
    with h5py.File(hdf5_path, "r") as handle:
        dataset_name = ${hdf5DatasetExpression}
        hdf5_values = handle[dataset_name][...]
    metadata_value = doc.get(${JSON.stringify(metadataKey)})
    return ${combineExpression || 'np.nanmean(hdf5_values)'}
`
  }

  return `from damnit_ctx import Skip, Variable, mongo_find_one


@Variable(title=${JSON.stringify(safeFieldTitle)})
def ${safeFieldName}(run, shot_number: "meta#shot_number"):
    doc = mongo_find_one(
        ${JSON.stringify(safeMongoCollection)},
        query=${mongoFilter},
    )
    if doc is None:
        raise Skip("No matching Mongo document")
    return doc.get(${JSON.stringify(metadataKey)})
`
}

function ProposalWrapper({ children }: PropsWithChildren) {
  const proposal = useProposal({ subscribe: SHOULD_SUBSCRIBE })
  const dispatch = useAppDispatch()
  const { proposal_number } = useParams()

  useEffect(() => {
    if (proposal_number) {
      dispatch(setProposalPending(proposal_number))
    }

    return () => {
      dispatch(resetTableData())
      dispatch(resetTableView())
      dispatch(resetExtractedData())
      dispatch(resetPlots())
      dispatch(resetMetadata())
      dispatch(resetDashboard())
      dispatch(resetContextFile())
    }
  }, [proposal_number, dispatch])

  return proposal.loading || !proposal_number ? (
    <div></div>
  ) : proposal.notFound ? (
    <Navigate to="/not-found" />
  ) : (
    children
  )
}

const App = () => {
  // Initialize routers
  history.setNavigate(useNavigate())
  history.setLocation(useLocation())
  const runtimeConfig = useRuntimeConfig()
  const usesProposals = runtimeConfig?.terminology.uses_proposals ?? true

  return (
    <>
      <Routes>
        <Route path="/" element={<Navigate to="/home" />} />
        <Route path="/login" element={<LoginRoute />} />
        <Route path="/logout" element={<LogoutRoute />} />
        <Route path="/logged-out" element={<LoggedOutPage />} />
        <Route
          path="/home"
          element={
            <PrivateRoute>
              <HomePage
                header={<AppHeader />}
                main={
                  <Container>
                    {usesProposals ? <Proposals /> : <HZDRSourceHome />}
                  </Container>
                }
              />
            </PrivateRoute>
          }
        />
        <Route
          path="/docs"
          element={
            <PrivateRoute>
              <HZDRDocsPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/proposal/:proposal_number"
          element={
            <PrivateRoute>
              <ProposalWrapper>
                <Dashboard />
              </ProposalWrapper>
            </PrivateRoute>
          }
        />
        <Route
          path="/flow-monitor"
          element={
            <PrivateRoute>
              <HZDRFlowMonitorPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/link-shot-records"
          element={
            <PrivateRoute>
              <LinkExistingShotRecordsPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/source/:source_key/context-builder"
          element={
            <PrivateRoute>
              <ContextBuilderPage />
            </PrivateRoute>
          }
        />
        <Route
          path="/source/:source_key"
          element={
            <PrivateRoute>
              <HZDRShotPage />
            </PrivateRoute>
          }
        />
        <Route path="/not-found" element={<NotFoundPage />} />
        <Route path="*" element={<Navigate to="/not-found" />} />
      </Routes>
    </>
  )
}

export default App
