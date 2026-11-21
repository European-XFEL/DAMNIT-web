import { type ReactNode, useEffect, useState } from 'react'
import { Anchor, Badge, Group } from '@mantine/core'
import { Link } from 'react-router'

import { requireJson } from '../utils/api'

type ScicatInfo = {
  configured: boolean
  registered: boolean
  pid: string | null
  dataset_url: string | null
}

type WikiInfo = {
  configured: boolean
  page_title: string | null
  page_url: string | null
}

type ProducerStatus = {
  watchdog_hosts: { host: string }[]
  shotcounter: { status: string; last_event_at: string | null }
}

function Chip({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <Badge
      variant="light"
      color="gray"
      radius={4}
      tt="none"
      fw={500}
      title={title}
      styles={{ label: { overflow: 'visible' } }}
    >
      {children}
    </Badge>
  )
}

/**
 * One line under the campaign title: its SciCat dataset, its wiki page, the
 * producers the catalog has seen, and a link to the flow monitor. Each
 * integration is read on its own and fails soft.
 */
export function ShotCampaignStrip({ sourceKey }: { sourceKey: string }) {
  const [scicat, setScicat] = useState<ScicatInfo>()
  const [wiki, setWiki] = useState<WikiInfo>()
  const [producers, setProducers] = useState<ProducerStatus>()

  useEffect(() => {
    let current = true
    setScicat(undefined)
    setWiki(undefined)
    setProducers(undefined)
    const base = `/metadata/hzdr/sources/${encodeURIComponent(sourceKey)}`
    fetch(`${base}/scicat`)
      .then((response) => requireJson<ScicatInfo>(response))
      .then((value) => current && setScicat(value))
      .catch(() => undefined)
    fetch(`${base}/wiki`)
      .then((response) => requireJson<WikiInfo>(response))
      .then((value) => current && setWiki(value))
      .catch(() => undefined)
    fetch(`${base}/producer-status`)
      .then((response) => requireJson<ProducerStatus>(response))
      .then((value) => current && setProducers(value))
      .catch(() => undefined)
    return () => {
      current = false
    }
  }, [sourceKey])

  const watchdogCount = producers?.watchdog_hosts?.length
  const shotcounterStatus = producers?.shotcounter?.status
  return (
    <Group gap={6} wrap="wrap">
      {scicat?.dataset_url ? (
        <Anchor
          href={scicat.dataset_url}
          target="_blank"
          rel="noreferrer"
          size="sm"
        >
          SciCat: {scicat.pid ?? 'open dataset'}
        </Anchor>
      ) : (
        <Chip>
          {scicat?.registered
            ? `SciCat: registered as ${scicat.pid}, no link set`
            : 'SciCat: not registered yet'}
        </Chip>
      )}
      {wiki?.page_url ? (
        <Anchor href={wiki.page_url} target="_blank" rel="noreferrer" size="sm">
          Wiki: {wiki.page_title ?? 'campaign page'}
        </Anchor>
      ) : (
        <Chip>Wiki: none</Chip>
      )}
      <Chip title="As seen in the catalog">
        {shotcounterStatus
          ? `Shotcounter ${shotcounterStatus}`
          : 'Shotcounter: unknown'}
      </Chip>
      <Chip title="Watchdog computers seen in the catalog">
        {watchdogCount === undefined
          ? 'Watchdog sources: unknown'
          : `${watchdogCount} watchdog source${watchdogCount === 1 ? '' : 's'}`}
      </Chip>
      <Anchor component={Link} to="/flow-monitor" size="sm">
        Flow monitor
      </Anchor>
    </Group>
  )
}
