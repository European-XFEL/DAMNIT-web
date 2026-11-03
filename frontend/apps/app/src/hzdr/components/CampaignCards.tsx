import { useEffect, useState } from 'react'
import {
  Anchor,
  Card,
  Group,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core'
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

export function CampaignCards({ sourceKey }: { sourceKey: string }) {
  const [scicat, setScicat] = useState<ScicatInfo>()
  const [wiki, setWiki] = useState<WikiInfo>()
  const [producers, setProducers] = useState<ProducerStatus>()

  useEffect(() => {
    let current = true
    setScicat(undefined)
    setWiki(undefined)
    setProducers(undefined)
    const base = `/metadata/hzdr/sources/${encodeURIComponent(sourceKey)}`
    // Each optional integration fails independently; the shot table stays usable.
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

  return (
    <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
      <Card withBorder radius={4} p="md">
        <Stack gap="xs">
          <Title order={4}>SciCat dataset</Title>
          {scicat?.dataset_url ? (
            <Anchor href={scicat.dataset_url} target="_blank" rel="noreferrer">
              {scicat.pid ?? 'Open dataset'}
            </Anchor>
          ) : (
            <Text size="sm" c="dimmed">
              {scicat?.registered
                ? `Registered as ${scicat.pid}; no SciCat link configured.`
                : 'No registered dataset yet.'}
            </Text>
          )}
        </Stack>
      </Card>
      <Card withBorder radius={4} p="md">
        <Stack gap="xs">
          <Title order={4}>Campaign wiki</Title>
          {wiki?.page_url ? (
            <Anchor href={wiki.page_url} target="_blank" rel="noreferrer">
              {wiki.page_title ?? 'Open campaign wiki'}
            </Anchor>
          ) : (
            <Text size="sm" c="dimmed">
              No campaign wiki link configured.
            </Text>
          )}
        </Stack>
      </Card>
      <Card withBorder radius={4} p="md">
        <Stack gap="xs">
          <Title order={4}>Producers seen in catalog</Title>
          <Group gap="xs">
            <Text size="sm">
              Shotcounter: {producers?.shotcounter.status ?? 'unknown'}
            </Text>
            <Text size="sm">
              Watchdog sources: {producers?.watchdog_hosts.length ?? 'unknown'}
            </Text>
          </Group>
          <Anchor component={Link} to="/flow-monitor">
            Open Flow Monitor
          </Anchor>
        </Stack>
      </Card>
    </SimpleGrid>
  )
}
