import { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Grid,
  Group,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { IconSearch } from '@tabler/icons-react'

import { HomeCampaignList } from '../components/HomeCampaignList'
import { HomeGuide, HomeWelcome } from '../components/HomeOrientation'
import {
  type HomeSource,
  filterCampaigns,
  readLastCampaign,
  sortNewestFirst,
  summarizeCampaign,
} from '../components/homeCampaignSummary'
import { requireJson } from '../utils/api'

function countLine(campaigns: number, shots: number) {
  const c = campaigns === 1 ? '1 campaign' : `${campaigns} campaigns`
  const s = shots === 1 ? '1 shot' : `${shots} shots`
  return `${c}, ${s}. Newest first.`
}

export function HZDRSourceHome() {
  const [sources, setSources] = useState<HomeSource[]>()
  const [pollFailed, setPollFailed] = useState(false)
  const [query, setQuery] = useState('')
  const [lastCampaignKey] = useState(readLastCampaign)

  useEffect(() => {
    const loadSources = () => {
      fetch('/metadata/hzdr/sources')
        .then((response) => requireJson<HomeSource[]>(response))
        .then((loadedSources) => {
          setSources(loadedSources)
          setPollFailed(false)
        })
        .catch((error) => {
          console.error('Failed to load HZDR campaigns', error)
          setPollFailed(true)
        })
    }

    loadSources()
    const timer = window.setInterval(loadSources, 5000)
    return () => window.clearInterval(timer)
  }, [])

  const campaigns = useMemo(
    () =>
      sortNewestFirst(
        (sources ?? []).map((source) => summarizeCampaign(source))
      ),
    [sources]
  )
  const shown = filterCampaigns(campaigns, query)
  const shotTotal = campaigns.reduce((total, c) => total + c.shotCount, 0)

  return (
    <Stack gap="md" py="md">
      <HomeWelcome campaigns={campaigns} lastCampaignKey={lastCampaignKey} />
      <Grid gutter="md">
        <Grid.Col span={{ base: 12, md: 8 }}>
          <Stack gap="md">
            <Group justify="space-between" align="flex-end" gap="sm">
              <Stack gap={2}>
                <Title order={3}>Campaigns</Title>
                <Text size="sm" c="dimmed">
                  {countLine(campaigns.length, shotTotal)}
                </Text>
              </Stack>
              <TextInput
                aria-label="Filter campaigns"
                placeholder="Filter campaigns"
                leftSection={<IconSearch size={16} />}
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                w={{ base: '100%', xs: 280 }}
              />
            </Group>

            {pollFailed ? (
              <Alert color="yellow" variant="light" py="xs">
                <Text size="sm" c="dimmed">
                  Could not reach the API. Retrying.
                </Text>
              </Alert>
            ) : null}

            {sources && campaigns.length === 0 ? (
              <Text c="dimmed">No campaigns yet.</Text>
            ) : null}
            {campaigns.length > 0 && shown.length === 0 ? (
              <Text c="dimmed">
                No campaign matches &quot;{query.trim()}&quot;.
              </Text>
            ) : null}
            <HomeCampaignList campaigns={shown} />
          </Stack>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 4 }}>
          <HomeGuide />
        </Grid.Col>
      </Grid>
    </Stack>
  )
}
