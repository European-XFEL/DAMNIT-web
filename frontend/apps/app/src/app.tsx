import {
  type CSSProperties,
  type PropsWithChildren,
  type ReactNode,
  useEffect,
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

type RuntimeConfig = {
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
  hdf5_path?: string
  metadata: Record<string, unknown> & {
    laser_energy_j?: number
    status?: string
    target?: string
  }
}

type HZDRShotDetail = {
  shot: HZDRShot
  hdf5_exists: boolean
  hdf5_datasets: {
    name: string
    shape: Array<number | string>
    dtype: string
  }[]
  hdf5_error?: string
}

type HZDRSource = {
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

type HZDRDatasetPreview = {
  name: string
  dtype: string
  shape: number[]
  preview: number[][] | number[] | number | null
  preview_kind: 'image' | 'line' | 'scalar'
}

type FlowPacket = {
  id: number
  lane: 'watchdog' | 'laser' | 'package' | 'damnit'
  label: string
}

type FlowLogEntry = {
  id: number
  at: string
  label: string
  detail: string
  tone: 'send' | 'stage' | 'receive'
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
      </Group>
    </Header>
  )
}

function HZDRFlowMonitorPage() {
  const [sources, setSources] = useState<HZDRSource[]>([])
  const [packets, setPackets] = useState<FlowPacket[]>([])
  const [logEntries, setLogEntries] = useState<FlowLogEntry[]>([])
  const [soundEnabled, setSoundEnabled] = useState(false)
  const [damnitPulse, setDamnitPulse] = useState(false)
  const [livePollPulse, setLivePollPulse] = useState(false)
  const [selectedSourceKey, setSelectedSourceKey] = useState<string | null>(
    null
  )
  const lastShotTotal = useRef<number | undefined>(undefined)
  const nextPacketId = useRef(1)
  const nextLogId = useRef(1)

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

  const addLogEntry = (
    label: string,
    detail: string,
    tone: FlowLogEntry['tone']
  ) => {
    const entry: FlowLogEntry = {
      id: nextLogId.current++,
      at: new Date().toLocaleTimeString(),
      label,
      detail,
      tone,
    }
    setLogEntries((currentEntries) => [entry, ...currentEntries].slice(0, 16))
  }

  const playBleep = () => {
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
  }

  const triggerDamnitPulse = (detail: string) => {
    setDamnitPulse(true)
    addLogEntry('DAMNIT received', detail, 'receive')
    playBleep()
    window.setTimeout(() => setDamnitPulse(false), 850)
  }

  const loadSources = () => {
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
  }

  useEffect(() => {
    loadSources()
    const timer = window.setInterval(loadSources, 3000)
    return () => window.clearInterval(timer)
  }, [])

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
    detail: string
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
        triggerDamnitPulse(
          action === 'append'
            ? `Shot ${targetShotNumber} appended to local emulator`
            : `Shot ${targetShotNumber} enriched in local emulator`
        )
      })
      .catch(() => {
        addLogEntry(
          'Append failed',
          'Local emulator endpoint did not accept the event',
          'stage'
        )
      })
  }

  const sendWatchdog = () => {
    appendEmulatedShot(
      'PLANET-Watchdog',
      'watchdog_shot_event',
      'enrich',
      'watchdog',
      'Watchdog shot event',
      'PLANET Watchdog -> Kafka -> live JSONL staging'
    )
  }

  const sendLaser = () => {
    appendEmulatedShot(
      'LaserData',
      'laser_measurement',
      'append',
      'laser',
      'LaserData measurement',
      'LaserData -> ASAPO-style broker -> live JSONL staging'
    )
  }

  const buildPackage = () => {
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
    window.setTimeout(() => setLivePollPulse(false), 1100)
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
                  metadata visibility. Local buttons emulate traffic; production
                  should feed this view from real incoming services.
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
                  onSendWatchdog={sendWatchdog}
                  onSendLaser={sendLaser}
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
                              Send a packet or poll DAMNIT to start the trace.
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
  onSendWatchdog,
  onSendLaser,
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
  onSendWatchdog: () => void
  onSendLaser: () => void
  onBuildPackage: () => void
  onRefreshDamnit: () => void
}) {
  const activeWatchdog = packets.some((packet) => packet.lane === 'watchdog')
  const activeLaser = packets.some((packet) => packet.lane === 'laser')
  const activePackage = packets.some((packet) => packet.lane === 'package')
  const activeLive = activeWatchdog || activeLaser || livePollPulse
  const activeDamnitLive = activeLive || damnitPulse

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
            <Badge variant="light">{packets.length} active arrow(s)</Badge>
          </Group>
        </Group>

        <div
          style={{
            width: '100%',
            display: 'grid',
            gridTemplateColumns:
              'minmax(150px, 1.1fr) minmax(70px, 0.5fr) minmax(150px, 1.1fr) minmax(70px, 0.5fr) minmax(170px, 1.2fr) minmax(70px, 0.5fr) minmax(180px, 1.25fr)',
            gridTemplateRows: 'repeat(3, minmax(125px, auto))',
            gap: 12,
            alignItems: 'center',
            minWidth: 920,
          }}
        >
          <ProgramNode
            title="LaserData"
            subtitle="primary laser measurements"
            active={activeLaser}
            icon={<IconServer size={24} />}
            color="blue"
            actions={[{ label: 'New shot', onClick: onSendLaser }]}
            style={{ gridColumn: 1, gridRow: 1 }}
          />
          <FlowConnector
            active={activeLaser}
            color="blue"
            label="data"
            style={{ gridColumn: 2, gridRow: 1 }}
          />
          <ProgramNode
            title="ASAPO local broker"
            subtitle="local emulator or real ASAPO stream"
            active={activeLaser}
            icon={<IconRoute size={24} />}
            color="blue"
            style={{ gridColumn: 3, gridRow: 1 }}
          />
          <FlowConnector
            active={activeLaser}
            color="blue"
            label="append"
            style={{ gridColumn: 4, gridRow: 1 }}
          />
          <ProgramNode
            title="PLANET Watchdog"
            subtitle="detects shot events"
            active={activeWatchdog}
            icon={<IconActivityHeartbeat size={24} />}
            color="orange"
            actions={[{ label: 'Enrich latest', onClick: onSendWatchdog }]}
            style={{ gridColumn: 1, gridRow: 2 }}
          />
          <FlowConnector
            active={activeWatchdog}
            color="orange"
            label="event"
            style={{ gridColumn: 2, gridRow: 2 }}
          />
          <ProgramNode
            title="Kafka"
            subtitle="watchdog transport, local or production"
            active={activeWatchdog}
            icon={<IconRoute size={24} />}
            color="orange"
            style={{ gridColumn: 3, gridRow: 2 }}
          />
          <FlowConnector
            active={activeWatchdog}
            color="orange"
            label="append"
            style={{ gridColumn: 4, gridRow: 2 }}
          />
          <ProgramNode
            title="MongoDB shotsheet"
            subtitle="shot metadata source"
            active={livePollPulse}
            icon={<IconDatabase size={24} />}
            color="violet"
            style={{ gridColumn: 1, gridRow: 3 }}
          />
          <FlowConnector
            active={livePollPulse}
            color="violet"
            label="query"
            style={{ gridColumn: '2 / 5', gridRow: 3 }}
          />
          <ProgramNode
            title="Live event log"
            subtitle="staged packages keyed by shot_id"
            active={activeLive || activePackage}
            icon={<IconDatabase size={24} />}
            color="teal"
            style={{ gridColumn: 5, gridRow: '1 / 3', alignSelf: 'stretch' }}
          />
          <FlowConnector
            active={activeDamnitLive}
            color="teal"
            label="visible"
            style={{ gridColumn: 6, gridRow: '1 / 3' }}
          />
          <ProgramNode
            title="DAMNIT-web live view"
            subtitle={`${sourceTotal} source(s), ${shotTotal} shot(s) visible`}
            active={activeDamnitLive}
            icon={<IconBellRinging size={24} />}
            color="teal"
            actions={[
              { label: 'Poll live', onClick: onRefreshDamnit },
              { label: 'Build HDF5', onClick: onBuildPackage },
            ]}
            style={{ gridColumn: 7, gridRow: '1 / 3', alignSelf: 'stretch' }}
          />
          <ProgramNode
            title="HDF5 builder"
            subtitle="combines staged event packages"
            active={activePackage}
            icon={<IconServer size={24} />}
            color="teal"
            style={{ gridColumn: 5, gridRow: 3 }}
          />
          <FlowConnector
            active={activePackage}
            color="teal"
            label="writes"
            style={{ gridColumn: 6, gridRow: 3 }}
          />
          <ProgramNode
            title="combined HDF5"
            subtitle="reader-ready experiment file"
            active={activePackage}
            icon={<IconDatabase size={24} />}
            color="teal"
            style={{ gridColumn: 7, gridRow: 3 }}
          />
        </div>
      </Stack>
    </Paper>
  )
}

function ProgramNode({
  title,
  subtitle,
  active,
  icon,
  color,
  actions = [],
  style,
}: {
  title: string
  subtitle: string
  active: boolean
  icon: ReactNode
  color: 'orange' | 'blue' | 'teal' | 'violet'
  actions?: { label: string; onClick: () => void }[]
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
        background: active ? `var(--mantine-color-${color}-0)` : 'white',
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
  color: 'orange' | 'blue' | 'teal' | 'violet'
  label: string
  style?: CSSProperties
}) {
  const colorVar = `var(--mantine-color-${color}-6)`
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
            id={`connector-arrow-${color}`}
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
          markerEnd={`url(#connector-arrow-${color})`}
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
              Send local LaserData and Watchdog events, or watch production
              traffic move through DAMNIT.
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
                    send test LaserData and Watchdog traffic.
                  </Text>
                  <Code block>
                    powershell -NoProfile -ExecutionPolicy Bypass -File
                    ..\scripts\hzdr-launch.ps1 -InitConfig{'\n'}
                    powershell -NoProfile -ExecutionPolicy Bypass -File
                    ..\scripts\hzdr-launch.ps1
                  </Code>
                </Stack>
              </DetailsSection>
              <DetailsSection title="Data boundaries">
                <Stack gap="xs">
                  <Text size="sm">
                    LaserData creates new shots. Watchdog/Kafka enriches the
                    latest shot. The HDF5 builder consumes staged JSONL package
                    events, not MongoDB.
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
                    Kafka, ASAPO, and MongoDB live together in the shared
                    launcher config so the emulator can be converted toward real
                    services without moving settings around.
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

  useEffect(() => {
    loadShotPageData()
    const timer = window.setInterval(loadShotPageData, 5000)
    return () => window.clearInterval(timer)
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
                                      shot.metadata.laser_energy_j ?? '-',
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
                                      shot.metadata.target ?? '-'
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
                                      <TruncatedCell value={error} c="dimmed" />
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
                    <SelectedCellPanel cell={selectedCell} />
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

function SelectedCellPanel({ cell }: { cell?: HZDRSelectedCell }) {
  if (!cell) {
    return (
      <Card withBorder radius={4} p="md">
        <Text size="sm" c="dimmed">
          Click a table cell to inspect its value, preview, and numeric trend.
        </Text>
      </Card>
    )
  }

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
          <Text size="sm" c="red">
            {cell.error}
          </Text>
        ) : isPlotlyPreview(cell.preview) ? (
          <Text size="sm" c="dimmed">
            Plot preview
          </Text>
        ) : cell.kind === 'metadata' && cell.columnName === 'status' ? (
          <Stack gap="xs">
            <StatusBadge status={String(cell.value ?? 'unknown')} />
            <Text size="sm" c="dimmed">
              Change this in Shot detail using the review status form.
            </Text>
          </Stack>
        ) : (
          <Text size="xl">{formatContextValue(cell.value)}</Text>
        )}
        <ContextPreviewValue preview={cell.preview} value={cell.value} />
        {cell.trendValues && cell.trendValues.length > 1 ? (
          <Stack gap="xs">
            <Text size="sm" fw={600}>
              Column trend
            </Text>
            <MetadataTrendPreview values={cell.trendValues} />
          </Stack>
        ) : null}
      </Stack>
    </Card>
  )
}

function ContextPreviewValue({
  preview,
  value,
}: {
  preview?: unknown
  value: unknown
}) {
  if (
    Array.isArray(preview) &&
    preview.every((entry) => typeof entry === 'number')
  ) {
    return (
      <MetadataTrendPreview
        values={preview.map((entry, index) => ({
          shotNumber: index + 1,
          value: Number(entry),
        }))}
      />
    )
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
  if (!Array.isArray(preview)) {
    return []
  }
  const flattened = preview.flatMap((entry) =>
    Array.isArray(entry) ? entry : [entry]
  )
  return flattened
    .filter(
      (entry): entry is number =>
        typeof entry === 'number' && Number.isFinite(entry)
    )
    .slice(0, 64)
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
}: {
  shot?: HZDRShot
  shotDetail?: HZDRShotDetail
  availableSources: HZDRSource[]
  onUpdateStatus?: (shotNumber: number, status: string, note?: string) => void
}) {
  const [reviewStatus, setReviewStatus] = useState('processed')
  const [reviewNote, setReviewNote] = useState('')

  useEffect(() => {
    setReviewStatus(String(shot?.metadata.status ?? 'processed'))
    setReviewNote(String(shot?.metadata.review_note ?? ''))
  }, [shot?.shot_number, shot?.metadata.status, shot?.metadata.review_note])

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

function getContextRecipeValidInputHelp(
  fieldKind: string,
  contextScope: string
) {
  if (fieldKind === 'metadata') {
    return contextScope === 'set'
      ? 'Numeric metadata values only; used for shot-set trends.'
      : 'One metadata value from the selected shot.'
  }
  if (fieldKind === 'hdf5') {
    return 'One HDF5 dataset; scalar, line, and image datasets are summarized.'
  }
  if (fieldKind === 'lineout-preview') {
    return (
      'One 1D HDF5 dataset; the table shows a summary and the cell panel ' +
      'shows the line.'
    )
  }
  if (fieldKind === 'image-preview') {
    return (
      'One 2D HDF5 dataset; the table shows a summary and the cell panel ' +
      'shows the reduced image.'
    )
  }
  if (fieldKind === 'plotly-trend') {
    return 'One numeric HDF5 dataset; creates an interactive Plotly preview.'
  }
  if (fieldKind === 'mongo-filter') {
    return 'One metadata field returned by the Mongo-style query.'
  }
  return 'Any selected metadata or HDF5 inputs; combine them in the expression.'
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
  datasetOptions: {
    value: string
    label: string
    shape?: Array<number | string>
  }[]
}) {
  const selectedDatasets = selectedInputs
    .filter((value) => value.startsWith('hdf5:'))
    .map((value) => datasetOptions.find((option) => option.value === value))
    .filter(Boolean)
  const metadataCount = selectedInputs.filter((value) =>
    value.startsWith('metadata:')
  ).length
  const datasetCount = selectedDatasets.length
  const selectedCount = selectedInputs.length
  const singleDatasetShape = selectedDatasets[0]?.shape
  const singleDatasetRank = singleDatasetShape?.length ?? 0
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

  if (selectedCount === 1 && datasetCount === 1) {
    options.push({
      value: 'hdf5',
      label:
        contextScope === 'set'
          ? 'Summarize selected data across shots'
          : 'Summarize selected data',
    })
    if (contextScope === 'shot' && singleDatasetRank === 1) {
      options.push(
        { value: 'lineout-preview', label: 'Lineout with table preview' },
        { value: 'plotly-trend', label: 'Interactive trend preview' }
      )
    }
    if (contextScope === 'shot' && singleDatasetRank === 2) {
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
  const [fieldName, setFieldName] = useState('hzdr_computed_field')
  const [fieldTitle, setFieldTitle] = useState('HZDR/Computed field')
  const [fieldNameEdited, setFieldNameEdited] = useState(false)
  const [selectedInputs, setSelectedInputs] = useState<string[]>([])
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
  const [generatedEditorCompact, setGeneratedEditorCompact] = useState(false)

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
      shotDetail?.hdf5_datasets.map((dataset) => ({
        value: `hdf5:${dataset.name}`,
        label: `${dataset.name} (${dataset.dtype}, ${dataset.shape.join('x')})`,
        shape: dataset.shape,
      })) ?? [],
    [shotDetail?.hdf5_datasets]
  )
  const inputOptions = useMemo(
    () => [
      { group: 'Shot metadata', items: metadataOptions },
      { group: 'HDF5 datasets', items: datasetOptions },
    ],
    [datasetOptions, metadataOptions]
  )
  const inputValueKey = useMemo(
    () => getContextRecipeInputValues(inputOptions).join('\u0000'),
    [inputOptions]
  )
  const selectedInputSummary = selectedInputs.length
    ? selectedInputs.map(formatSelectedInput).join(', ')
    : 'No inputs selected yet'
  const validInputHelp = getContextRecipeValidInputHelp(fieldKind, contextScope)
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
  const contextVariables = parseContextVariableBlocks(contextContent)
  const showMongoFields =
    fieldKind === 'mongo-filter' || fieldKind === 'function'
  const showFunctionFields = fieldKind === 'function'
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
    setSaveStatus('Saving...')
    const { imports, body } = splitPythonImportBlock(generatedDraft)
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
    setGeneratedDraft(selectedBlock.block.trim())
    setSaveStatus(`Loaded ${selectedBlock.name} into the draft editor`)
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
    const replacedContent = `${contextContent.slice(
      0,
      selectedBlock.start
    )}${body.trimEnd()}\n${contextContent.slice(selectedBlock.end)}`
    const fileContent = mergeImportsAtTop(replacedContent, imports)
    setSaveStatus(`Replacing ${selectedBlock.name}...`)
    saveContextContent(fileContent, `Replaced ${selectedBlock.name}`)
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
    const selectedIndex = contextVariables.findIndex(
      (block) => block.id === selectedColumnId
    )
    const targetIndex = selectedIndex + direction
    if (
      selectedIndex < 0 ||
      targetIndex < 0 ||
      targetIndex >= contextVariables.length
    ) {
      return
    }
    const reorderedBlocks = [...contextVariables]
    const [selectedBlock] = reorderedBlocks.splice(selectedIndex, 1)
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
      shotDetail,
      combineExpression,
    })
    setColumnDetails(preview)
    const datasetName = selectedInputs
      .find((value) => value.startsWith('hdf5:'))
      ?.slice(5)
    if (
      usesHdf5VisualPreview &&
      source_key &&
      selectedShotNumber &&
      datasetName
    ) {
      fetch(
        `/metadata/hzdr/sources/${source_key}/shots/${selectedShotNumber}/datasets/${datasetName}`
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

  const saveContextContent = (fileContent: string, savedMessage: string) => {
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
                    <ContextBuilderPanel
                      tone="gray"
                      title="Target"
                      description="Choose whether this creates a shot column or a shot-set helper."
                    >
                      <Select
                        label="Build target"
                        value={contextScope}
                        onChange={(value) => setContextScope(value ?? 'shot')}
                        data={[
                          { value: 'shot', label: 'Per-shot table column' },
                          { value: 'set', label: 'Per-set trend or summary' },
                        ]}
                      />
                      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
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
                        <Card withBorder radius={4} p="sm">
                          <Stack gap={2}>
                            <Text size="xs" c="dimmed">
                              Current source
                            </Text>
                            <Text size="sm" truncate="end">
                              {source?.title ?? source_key}
                            </Text>
                          </Stack>
                        </Card>
                      </SimpleGrid>
                    </ContextBuilderPanel>
                    <ContextBuilderPanel
                      tone="blue"
                      title="Column identity"
                      description="The Python name follows the title until you edit it manually."
                    >
                      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                        <TextInput
                          label="Column title"
                          value={fieldTitle}
                          onChange={(event) => {
                            const nextTitle = event.currentTarget.value
                            setFieldTitle(nextTitle)
                            if (!fieldNameEdited) {
                              setFieldName(pythonNameFromTitle(nextTitle))
                            }
                          }}
                        />
                        {contextScope === 'shot' || fieldKind === 'function' ? (
                          <TextInput
                            label="Generated Python function name"
                            value={fieldName}
                            onChange={(event) => {
                              setFieldNameEdited(true)
                              setFieldName(event.currentTarget.value)
                            }}
                          />
                        ) : (
                          <Card withBorder radius={4} p="sm">
                            <Text size="xs" c="dimmed">
                              Set views do not need a per-shot function name.
                            </Text>
                          </Card>
                        )}
                      </SimpleGrid>
                    </ContextBuilderPanel>
                    <ContextBuilderPanel
                      tone="indigo"
                      title="Data"
                      description="Choose the metadata or HDF5 data first; valid actions appear below."
                    >
                      <MultiSelect
                        label="Data to use"
                        value={selectedInputs}
                        onChange={setSelectedInputs}
                        data={inputOptions}
                        searchable
                        clearable
                      />
                      <Card withBorder radius={4} p="sm">
                        <Stack gap={4}>
                          <Text size="xs" c="dimmed">
                            Selected data
                          </Text>
                          <Text size="sm">{selectedInputSummary}</Text>
                        </Stack>
                      </Card>
                    </ContextBuilderPanel>
                    <ContextBuilderPanel
                      tone="teal"
                      title="Action"
                      description="Choose what this column can do with the selected data."
                    >
                      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
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
                        <Card withBorder radius={4} p="sm">
                          <Stack gap={4}>
                            <Text size="xs" c="dimmed">
                              Selected action
                            </Text>
                            <Group gap="xs">
                              <Badge
                                variant="light"
                                color={contextRecipeTone(fieldKind)}
                                radius={4}
                                styles={{ label: { textTransform: 'none' } }}
                              >
                                {contextRecipeLabel(fieldKind)}
                              </Badge>
                              <Badge
                                variant="outline"
                                color="gray"
                                radius={4}
                                title={validInputHelp}
                                styles={{ label: { textTransform: 'none' } }}
                              >
                                Valid inputs
                              </Badge>
                            </Group>
                            <Text size="xs" c="dimmed">
                              {selectedInputs.length
                                ? recipeHelp
                                : validInputHelp}
                            </Text>
                          </Stack>
                        </Card>
                      </SimpleGrid>
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
                <Stack gap="md">
                  <Card withBorder radius={4} p="md">
                    <Stack gap="sm">
                      <Group justify="space-between">
                        <Stack gap={2}>
                          <Title order={5}>Context file and column</Title>
                          <Text size="xs" c="dimmed">
                            Shared imports stay at the top of the file. Select a
                            variable here before editing its block below.
                          </Text>
                        </Stack>
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
                      <SimpleGrid cols={{ base: 1, md: 4 }} spacing="sm">
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
                        <Select
                          label="Selected column"
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
                        <Group mt={24} gap="xs" grow>
                          <Button
                            variant="light"
                            leftSection={<IconArrowUp size={16} />}
                            onClick={() => moveSelectedColumn(-1)}
                            disabled={!selectedColumnId}
                          >
                            Up
                          </Button>
                          <Button
                            variant="light"
                            leftSection={<IconArrowDown size={16} />}
                            onClick={() => moveSelectedColumn(1)}
                            disabled={!selectedColumnId}
                          >
                            Down
                          </Button>
                        </Group>
                        <Button
                          mt={24}
                          variant="light"
                          color="red"
                          onClick={deleteSelectedColumn}
                          disabled={!selectedColumnId}
                        >
                          Delete selected
                        </Button>
                      </SimpleGrid>
                    </Stack>
                  </Card>
                  <Card withBorder radius={4} p="md">
                    <Stack gap="sm">
                      <Group justify="space-between">
                        <Stack gap={2}>
                          <Title order={5}>Generated variable</Title>
                          <Text size="xs" c="dimmed">
                            Edit this block before appending it to the selected
                            context file.
                          </Text>
                        </Stack>
                        <Group>
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
                          <Button
                            onClick={appendToContext}
                            disabled={!canBuildColumn}
                          >
                            Append to {selectedContextFile}
                          </Button>
                          <Button
                            variant="light"
                            onClick={replaceSelectedColumn}
                            disabled={!selectedColumnId || !canBuildColumn}
                          >
                            Replace selected
                          </Button>
                        </Group>
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
                    </Stack>
                  </Card>
                  <Card withBorder radius={4} p="md">
                    <Stack gap="xs">
                      <Group justify="space-between">
                        <Stack gap={2}>
                          <Title order={5}>Preview</Title>
                          <Text size="xs" c="dimmed">
                            Check the selected recipe and input before saving.
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
                      <Grid gutter="md">
                        <Grid.Col span={{ base: 12, md: 7 }}>
                          <VisualPreview
                            datasetPreview={datasetPreview}
                            fieldKind={fieldKind}
                            fieldTitle={fieldTitle}
                            columnDetails={columnDetails}
                          />
                        </Grid.Col>
                        <Grid.Col span={{ base: 12, md: 5 }}>
                          <Stack gap="xs">
                            <Text size="sm" fw={600}>
                              Details
                            </Text>
                            <Code block>
                              {columnDetails || 'Click Preview column.'}
                            </Code>
                          </Stack>
                        </Grid.Col>
                      </Grid>
                    </Stack>
                  </Card>
                  <Card withBorder radius={4} p="md">
                    <Stack gap="sm">
                      <Group justify="space-between">
                        <Stack gap={2}>
                          <Title order={5}>Manual context editor</Title>
                          <Text size="xs" c="dimmed">
                            {contextFile?.path ?? '-'}
                          </Text>
                        </Stack>
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
                    </Stack>
                  </Card>
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
      id: `${name}-${start}-${end}`,
      name,
      title: titleMatch?.[1] ?? name,
      start,
      end,
      block: content.slice(start, end),
    }
  })
}

function getContextRecipeInputValues(
  options:
    | { value: string; label: string }[]
    | { group: string; items: { value: string; label: string }[] }[]
) {
  return options.flatMap((option) =>
    'items' in option ? option.items.map((item) => item.value) : option.value
  )
}

function makeContextVariableBlockUnique(
  block: string,
  existingBlocks: ContextVariableBlock[]
) {
  const functionMatch = block.match(/def\s+([A-Za-z_]\w*)\s*\(/)
  if (!functionMatch) {
    return block
  }
  const existingNames = new Set(existingBlocks.map((entry) => entry.name))
  const currentName = functionMatch[1]
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

function pythonNameFromTitle(title: string) {
  const slug = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  const safeSlug = slug || 'hzdr_computed_field'
  return /^[a-z_]/.test(safeSlug) ? safeSlug : `field_${safeSlug}`
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
  shotDetail,
  combineExpression,
}: {
  fieldKind: string
  selectedInputs: string[]
  selectedShot?: HZDRShot
  shotDetail?: HZDRShotDetail
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
  const dataset = shotDetail?.hdf5_datasets.find(
    (entry) => entry.name === datasetName
  )

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

  if (fieldKind === 'hdf5' || fieldKind === 'lineout-preview') {
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

  if (fieldKind === 'image-preview') {
    return JSON.stringify(
      {
        shot_number: selectedShot.shot_number,
        dataset: datasetName ?? 'dataset not selected',
        shape: dataset?.shape ?? null,
        dtype: dataset?.dtype ?? null,
        value: dataset ? `mean(${dataset.name})` : null,
        displayed_value: 'mean(image), thumbnail=image[::8, ::8]',
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
        displayed_value: 'nanmean(values), preview=Plotly line',
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
  datasetPreview,
  fieldKind,
  fieldTitle,
  columnDetails,
}: {
  datasetPreview?: HZDRDatasetPreview
  fieldKind: string
  fieldTitle: string
  columnDetails: string
}) {
  const parsedDetails = parseColumnDetails(columnDetails)

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
}: {
  values: { shotNumber: number; value: number }[]
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
          Trend preview
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
          shot number
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
def ${safeFieldName}(run, hdf5_path: "meta#hdf5_path"):
    if not hdf5_path:
        raise Skip("No HDF5 path for this shot")
    with h5py.File(hdf5_path, "r") as handle:
        values = handle[${JSON.stringify(datasetName)}][...]
    return float(np.nanmean(values))
`
  }

  if (fieldKind === 'lineout-preview') {
    return `import h5py
import numpy as np

from damnit_ctx import Cell, Skip, Variable


@Variable(title=${JSON.stringify(safeFieldTitle)}, summary="nanmean")
def ${safeFieldName}(run, hdf5_path: "meta#hdf5_path"):
    """Store a full lineout while showing a compact table preview."""
    if not hdf5_path:
        raise Skip("No HDF5 path for this shot")
    with h5py.File(hdf5_path, "r") as handle:
        lineout = np.asarray(handle[${JSON.stringify(datasetName)}][...])
    return Cell(lineout, summary="nanmean", preview=lineout)
`
  }

  if (fieldKind === 'image-preview') {
    return `import h5py
import numpy as np

from damnit_ctx import Cell, Skip, Variable


@Variable(title=${JSON.stringify(safeFieldTitle)}, summary="mean")
def ${safeFieldName}(run, hdf5_path: "meta#hdf5_path"):
    """Store a full image while showing a reduced thumbnail in the table."""
    if not hdf5_path:
        raise Skip("No HDF5 path for this shot")
    with h5py.File(hdf5_path, "r") as handle:
        image = np.asarray(handle[${JSON.stringify(datasetName)}][...])
    return Cell(image, summary="mean", preview=image[::8, ::8])
`
  }

  if (fieldKind === 'plotly-trend') {
    return `import h5py
import numpy as np
import plotly.express as px

from damnit_ctx import Cell, Skip, Variable


@Variable(title=${JSON.stringify(safeFieldTitle)}, summary="nanmean")
def ${safeFieldName}(run, hdf5_path: "meta#hdf5_path"):
    """Use a Plotly figure as the double-click preview for a lineout."""
    if not hdf5_path:
        raise Skip("No HDF5 path for this shot")
    with h5py.File(hdf5_path, "r") as handle:
        values = np.asarray(handle[${JSON.stringify(datasetName)}][...])
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
def ${safeFieldName}(run, shot_number: "meta#shot_number", hdf5_path: "meta#hdf5_path"):
    """Compute this column from selected HZDR inputs."""
    doc = mongo_find_one(
        ${JSON.stringify(safeMongoCollection)},
        query=${mongoFilter},
    )
    if doc is None or not hdf5_path:
        raise Skip("Missing Mongo metadata or HDF5 path")
    with h5py.File(hdf5_path, "r") as handle:
        hdf5_values = handle[${JSON.stringify(datasetName)}][...]
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
