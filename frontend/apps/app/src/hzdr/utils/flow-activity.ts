import type { FlowActivity, FlowPacket } from '../types'

export type FlowActivityChange = {
  lane: FlowPacket['lane']
  label: string
  detail: string
}

/** Which diagram lane a Kafka topic's traffic belongs to. */
const TOPIC_LANES: Record<string, FlowPacket['lane']> = {
  'draco.trigger': 'shotcounter',
  'planet.watchdog.events': 'watchdog',
}

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? '' : 's'}`

/**
 * What moved between two live activity snapshots, one entry per lane, so the
 * diagram can animate real traffic: new Kafka messages per topic, new ASAPO
 * messages, new events in DAMNIT's spool. The first snapshot is a baseline
 * and moves nothing; a count that went down (a topic or spool reset) is not
 * traffic either.
 */
export function activityChanges(
  previous: FlowActivity | null,
  next: FlowActivity
): FlowActivityChange[] {
  if (previous === null) {
    return []
  }
  const changes: FlowActivityChange[] = []

  const before = new Map(
    previous.kafka.topics.map((topic) => [topic.topic, topic.messages ?? 0])
  )
  for (const topic of next.kafka.topics) {
    const added = (topic.messages ?? 0) - (before.get(topic.topic) ?? 0)
    if (added > 0) {
      changes.push({
        lane: TOPIC_LANES[topic.topic] ?? 'package',
        label: `${topic.topic} +${added}`,
        detail: `${plural(added, 'new message')} on Kafka ${topic.topic}`,
      })
    }
  }

  const asapoBefore = new Map(
    previous.asapo.streams.map((stream) => [stream.name, stream.messages])
  )
  const asapoAdded = next.asapo.streams.reduce(
    (total, stream) =>
      total +
      Math.max(0, stream.messages - (asapoBefore.get(stream.name) ?? 0)),
    0
  )
  if (asapoAdded > 0) {
    changes.push({
      lane: 'laser',
      label: `ASAPO +${asapoAdded}`,
      detail: `${plural(asapoAdded, 'new message')} on ASAPO`,
    })
  }

  const spoolKey = (file: { label: string; campaign: string }) =>
    `${file.label}\u0000${file.campaign}`
  const spoolBefore = new Map(
    previous.spool.files.map((file) => [spoolKey(file), file.events])
  )
  const spoolAdded = next.spool.files.reduce(
    (total, file) =>
      total + Math.max(0, file.events - (spoolBefore.get(spoolKey(file)) ?? 0)),
    0
  )
  if (spoolAdded > 0) {
    changes.push({
      lane: 'damnit',
      label: `Spool +${spoolAdded}`,
      detail: `DAMNIT spooled ${plural(spoolAdded, 'new event')}`,
    })
  }
  return changes
}
