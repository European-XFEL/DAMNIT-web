import type { FlowMonitorMode, FlowPacket } from '../types'

/** The part of GET /config/runtime the flow monitor reads to pick its mode. */
export type FlowRuntimeConfig = {
  flow_monitor?: {
    /** True when a spool consumer (ASAPO or Kafka) is enabled. */
    live_traffic?: boolean
  }
}

export const FLOW_MODE_STORAGE_KEY = 'hzdr.flowMonitor.mode'

function isMode(value: unknown): value is FlowMonitorMode {
  return value === 'demo' || value === 'live'
}

/** The mode this browser last chose by hand, or null. */
export function readStoredFlowMode(): FlowMonitorMode | null {
  try {
    const stored = window.localStorage.getItem(FLOW_MODE_STORAGE_KEY)
    return isMode(stored) ? stored : null
  } catch {
    return null
  }
}

export function storeFlowMode(mode: FlowMonitorMode): void {
  try {
    window.localStorage.setItem(FLOW_MODE_STORAGE_KEY, mode)
  } catch {
    // Storage blocked (private window, previews): the choice lasts this visit.
  }
}

/**
 * The mode the page opens in: the user's last explicit choice wins, then
 * Live when the deployment receives real traffic, else Demo.
 */
export function initialFlowMode(
  stored: FlowMonitorMode | null,
  runtimeConfig: FlowRuntimeConfig | undefined
): FlowMonitorMode {
  if (stored) {
    return stored
  }
  return runtimeConfig?.flow_monitor?.live_traffic ? 'live' : 'demo'
}

/** One line of the traffic log. */
export type FlowTrafficEntry = {
  id: number
  at: string
  /** Who sent or handled it: a producer, a broker or DAMNIT. */
  source: string
  label: string
  detail: string
  tone: 'send' | 'stage' | 'receive'
  /** The shot it belongs to, when known. */
  shot?: number | null
}

const LANE_SOURCES: Record<FlowPacket['lane'], string> = {
  shotcounter: 'Shot trigger',
  watchdog: 'DAQ File Watchdog',
  laser: 'LaserData',
  package: 'HDF5 builder',
  damnit: 'DAMNIT',
}

export function laneSource(lane: FlowPacket['lane']): string {
  return LANE_SOURCES[lane]
}

/** The diagram's activity badge, named for what it counts: paths lit now. */
export function activePathsLabel(count: number): string {
  if (count <= 0) {
    return 'No traffic now'
  }
  return `${count} ${count === 1 ? 'path' : 'paths'} active`
}
