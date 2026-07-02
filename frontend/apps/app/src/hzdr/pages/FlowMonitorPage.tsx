import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Anchor,
  Badge,
  Button,
  Container,
  Divider,
  Group,
  Paper,
  ScrollArea,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import {
  IconBellRinging,
  IconRefresh,
  IconVolume,
  IconVolumeOff,
} from '@tabler/icons-react'
import { Grid } from '@mantine/core'
import { HomePage } from '@damnit-frontend/ui'
import type {
  HZDRSource,
  FlowPacket,
  FlowLogEntry,
  FlowReceiverConfig,
  FlowMonitorState,
  FlowMonitorMode,
  FlowMonitorHealth,
  FlowActivity,
  WatchdogWatcherKey,
  ShotcounterTKey,
} from '../types'
import {
  emptyFlowMonitorState,
  watchdogWatcherOptions,
  shotcounterTKeyOptions,
} from '../types'
import { useRuntimeConfig } from '../hooks'
import { AppHeader } from '../components/AppHeader'
import { FlowDiagram } from '../components/FlowDiagram'
import { requireJson } from '../utils/api'

function formatClock(iso?: string | null): string {
  if (!iso) {
    return '—'
  }
  const parsed = new Date(iso)
  return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleTimeString()
}

export function HZDRFlowMonitorPage() {
  const runtimeConfig = useRuntimeConfig()
  const [monitorMode, setMonitorMode] = useState<FlowMonitorMode>('demo')
  const [health, setHealth] = useState<FlowMonitorHealth | null>(null)
  const prevHealth = useRef<FlowMonitorHealth | null>(null)
  const [activity, setActivity] = useState<FlowActivity | null>(null)
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
  const [selectedWatchdogWatchers, setSelectedWatchdogWatchers] = useState<
    WatchdogWatcherKey[]
  >(['png-originals', 'lli-parser'])
  const [selectedShotcounterTKeys, setSelectedShotcounterTKeys] = useState<
    ShotcounterTKey[]
  >(['draco01', 'draco07'])
  const [flowState, setFlowState] = useState<FlowMonitorState>(
    emptyFlowMonitorState
  )
  const [selectedSourceKey, setSelectedSourceKey] = useState<string | null>(
    null
  )
  const receiverConfigLoaded = useRef(false)
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

  const loadHealth = useCallback(() => {
    fetch('/config/health')
      .then((response) => (response.ok ? response.json() : null))
      .then((data: FlowMonitorHealth | null) => {
        if (!data) {
          return
        }
        const previous = prevHealth.current
        ;(['asapo', 'kafka', 'mongo'] as const).forEach((service) => {
          const was = previous?.[service]?.reachable
          const now = data[service]?.reachable
          if (was !== undefined && was !== now) {
            addLogEntry(
              `${service.toUpperCase()} ${now ? 'reachable' : 'unreachable'}`,
              now
                ? `probe ok (${data[service].latency_ms ?? '?'} ms)`
                : (data[service].detail ?? 'probe failed'),
              now ? 'receive' : 'stage'
            )
          }
        })
        prevHealth.current = data
        setHealth(data)
      })
      .catch(() => {
        // A failed /config/health fetch leaves the last snapshot in place.
      })
  }, [addLogEntry])

  const loadActivity = useCallback(() => {
    fetch('/config/flow-activity')
      .then((response) => (response.ok ? response.json() : null))
      .then((data: FlowActivity | null) => {
        if (data) {
          setActivity(data)
        }
      })
      .catch(() => {
        // A failed fetch leaves the last activity snapshot in place.
      })
  }, [])

  useEffect(() => {
    if (monitorMode !== 'live') {
      return
    }
    const poll = () => {
      loadHealth()
      loadActivity()
    }
    poll()
    const timer = window.setInterval(poll, 5000)
    return () => window.clearInterval(timer)
  }, [monitorMode, loadHealth, loadActivity])

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
      'DAQ-File-Watchdog',
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
                  {monitorMode === 'live'
                    ? 'Live mode polls the API every 5s: broker reachability plus real data-flow activity (Kafka/ASAPO message counts and DAMNIT spool ingest).'
                    : 'Demo mode: LaserData is a passive live stream; local buttons emulate shotcounter, Watchdog, and builder events.'}
                </Text>
              </Stack>
              <Group gap="xs">
                <SegmentedControl
                  value={monitorMode}
                  onChange={(value) => setMonitorMode(value as FlowMonitorMode)}
                  data={[
                    { label: 'Demo', value: 'demo' },
                    { label: 'Live', value: 'live' },
                  ]}
                />
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
                {monitorMode === 'live' ? (
                  <Paper withBorder radius={4} p="md">
                    <Stack gap="md">
                      <Group justify="space-between" align="flex-end">
                        <Stack gap={2}>
                          <Text fw={700}>Live endpoint health</Text>
                          <Text size="xs" c="dimmed">
                            Source: GET /config/health · refreshes every 5s
                          </Text>
                        </Stack>
                        <Button
                          variant="light"
                          size="xs"
                          leftSection={<IconRefresh size={14} />}
                          onClick={loadHealth}
                        >
                          Refresh now
                        </Button>
                      </Group>
                      <SimpleGrid cols={{ base: 1, md: 3 }}>
                        {(
                          [
                            ['ASAPO', 'asapo'],
                            ['Kafka', 'kafka'],
                            ['MongoDB', 'mongo'],
                          ] as const
                        ).map(([label, key]) => {
                          const probe = health?.[key]
                          return (
                            <Paper key={key} withBorder radius={4} p="md">
                              <Stack gap="xs">
                                <Group justify="space-between">
                                  <Text fw={600}>{label}</Text>
                                  <Badge
                                    color={
                                      !probe
                                        ? 'gray'
                                        : probe.reachable
                                          ? 'teal'
                                          : 'red'
                                    }
                                    variant="light"
                                  >
                                    {!probe
                                      ? 'unknown'
                                      : probe.reachable
                                        ? 'reachable'
                                        : 'down'}
                                  </Badge>
                                </Group>
                                <Text size="xs" c="dimmed">
                                  {probe?.reachable
                                    ? `Latency ${probe.latency_ms ?? '?'} ms`
                                    : (probe?.detail ??
                                      'Awaiting first probe…')}
                                </Text>
                              </Stack>
                            </Paper>
                          )
                        })}
                      </SimpleGrid>

                      <Divider
                        label="Data flow activity"
                        labelPosition="left"
                      />
                      <Text size="xs" c="dimmed">
                        Source: GET /config/flow-activity · producer output
                        (broker) vs DAMNIT ingest (spool)
                      </Text>
                      <SimpleGrid cols={{ base: 1, md: 2 }}>
                        <Paper withBorder radius={4} p="md">
                          <Stack gap="xs">
                            <Group justify="space-between">
                              <Text fw={600}>Kafka topics</Text>
                              <Badge
                                variant="light"
                                color={
                                  activity?.kafka.available ? 'teal' : 'gray'
                                }
                              >
                                {activity?.kafka.available ? 'broker' : 'n/a'}
                              </Badge>
                            </Group>
                            {activity?.kafka.available ? (
                              activity.kafka.topics.length ? (
                                activity.kafka.topics.map((topic) => (
                                  <Group
                                    key={topic.topic}
                                    justify="space-between"
                                  >
                                    <Text size="sm">
                                      {topic.topic}
                                      {!topic.exists ? ' (missing)' : ''}
                                    </Text>
                                    <Text size="sm" c="dimmed">
                                      {topic.exists
                                        ? `${topic.messages} msgs · last ${formatClock(topic.last_message_at)}`
                                        : '—'}
                                    </Text>
                                  </Group>
                                ))
                              ) : (
                                <Text size="xs" c="dimmed">
                                  No topics configured
                                  (DW_API_HZDR_KAFKA_SPOOL__TOPICS).
                                </Text>
                              )
                            ) : (
                              <Text size="xs" c="dimmed">
                                {activity?.kafka.detail ??
                                  'Awaiting first poll…'}
                              </Text>
                            )}
                          </Stack>
                        </Paper>

                        <Paper withBorder radius={4} p="md">
                          <Stack gap="xs">
                            <Group justify="space-between">
                              <Text fw={600}>ASAPO streams</Text>
                              <Badge
                                variant="light"
                                color={
                                  activity?.asapo.available ? 'teal' : 'gray'
                                }
                              >
                                {activity?.asapo.available ? 'broker' : 'n/a'}
                              </Badge>
                            </Group>
                            {activity?.asapo.available ? (
                              activity.asapo.streams.length ? (
                                activity.asapo.streams.map((stream) => (
                                  <Group
                                    key={stream.name}
                                    justify="space-between"
                                  >
                                    <Text size="sm">{stream.name}</Text>
                                    <Text size="sm" c="dimmed">
                                      {stream.messages} msgs
                                    </Text>
                                  </Group>
                                ))
                              ) : (
                                <Text size="xs" c="dimmed">
                                  No streams yet.
                                </Text>
                              )
                            ) : (
                              <Text size="xs" c="dimmed">
                                {activity?.asapo.detail ??
                                  'Awaiting first poll…'}
                              </Text>
                            )}
                          </Stack>
                        </Paper>
                      </SimpleGrid>

                      <Paper withBorder radius={4} p="md">
                        <Stack gap="xs">
                          <Text fw={600}>DAMNIT spool (ingested events)</Text>
                          {activity?.spool.files.length ? (
                            activity.spool.files.map((file) => (
                              <Group
                                key={`${file.label}-${file.campaign}`}
                                justify="space-between"
                              >
                                <Text size="sm">
                                  {file.label} · {file.campaign}
                                </Text>
                                <Text size="sm" c="dimmed">
                                  {file.events} events · last{' '}
                                  {formatClock(file.last_event_at)}
                                </Text>
                              </Group>
                            ))
                          ) : (
                            <Text size="xs" c="dimmed">
                              No spool files yet — enable a consumer
                              (DW_API_HZDR_*SPOOL__ENABLED) and publish events.
                            </Text>
                          )}
                        </Stack>
                      </Paper>
                    </Stack>
                  </Paper>
                ) : (
                  <FlowDiagram
                    packets={packets}
                    damnitPulse={damnitPulse}
                    livePollPulse={livePollPulse}
                    shotTotal={shotTotal}
                    sourceTotal={sources.length}
                    latestShotNumber={latestShotNumber}
                    nextShotNumber={nextShotNumber}
                    receiverConfig={receiverConfig}
                    selectedWatchdogWatchers={selectedWatchdogWatchers}
                    selectedShotcounterTKeys={selectedShotcounterTKeys}
                    flowState={flowState}
                    onSelectedWatchdogWatchersChange={
                      setSelectedWatchdogWatchers
                    }
                    onSelectedShotcounterTKeysChange={
                      setSelectedShotcounterTKeys
                    }
                    onSendShotcounter={sendShotcounter}
                    onSendLaserData={sendLaserData}
                    onSendWatchdog={sendWatchdog}
                    onBuildPackage={buildPackage}
                    onRefreshDamnit={refreshDamnit}
                  />
                )}
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
