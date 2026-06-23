import { type CSSProperties, type ReactNode, useId } from 'react'
import {
  Badge,
  Button,
  Checkbox,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
} from '@mantine/core'
import {
  IconActivityHeartbeat,
  IconBellRinging,
  IconDatabase,
  IconPlayerPlay,
  IconRoute,
  IconServer,
} from '@tabler/icons-react'
import type {
  FlowPacket,
  FlowMonitorState,
  FlowReceiverConfig,
  WatchdogWatcherKey,
  ShotcounterTKey,
} from '../types'
import { watchdogWatcherOptions, shotcounterTKeyOptions } from '../types'
import { DetailsSection } from './ShotTable'

export function FlowDiagram({
  packets,
  damnitPulse,
  livePollPulse,
  shotTotal,
  sourceTotal,
  latestShotNumber,
  nextShotNumber,
  receiverConfig,

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
            subtitle="ZMQ shot notice, Kafka fanout"
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
            subtitle="shot metadata source"
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

export function ProgramNode({
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

export function FlowConnector({
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
