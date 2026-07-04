import { useEffect, useMemo, useState } from 'react'
import {
  Anchor,
  Badge,
  Button,
  Card,
  Checkbox,
  Code,
  Container,
  Grid,
  Group,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { HomePage } from '@damnit-frontend/ui'
import type {
  HZDRSource,
  LinkRecordsDraft,
  BuiltLinkRecordsPackage,
} from '../types'
import { AppHeader } from '../components/AppHeader'
import { DetailsSection } from '../components/ShotTable'
import {
  buildLinkRecordsDraft,
  buildLinkRecordsReviewPackage,
  fetchHZDRCampaigns,
  fetchHZDRCampaignShots,
  fetchHZDRProducerStatus,
  fetchHZDRSourceScicat,
  fetchHZDRSourceWiki,
  type HZDRProducerStatus,
  type HZDRScicatInfo,
  type HZDRWikiInfo,
  type LabFrogCampaignRef,
  type LabFrogCampaignShot,
} from '../utils/link-records'

const SHOTCOUNTER_STATUS_COLOR: Record<string, string> = {
  active: 'green',
  idle: 'yellow',
  absent: 'gray',
}

export function LinkExistingShotRecordsPage() {
  const [sources, setSources] = useState<HZDRSource[]>([])
  const [campaigns, setCampaigns] = useState<LabFrogCampaignRef[]>([])
  const [selectedCampaignKey, setSelectedCampaignKey] = useState<string | null>(
    null
  )
  const [campaignShots, setCampaignShots] = useState<LabFrogCampaignShot[]>([])
  const [selectedSourceKey, setSelectedSourceKey] = useState<string | null>(
    null
  )
  const [shotNumberQuery, setShotNumberQuery] = useState('')
  const [collections, setCollections] = useState<string[]>([
    'shots',
    'watchdog',
  ])
  const [producerStatus, setProducerStatus] = useState<HZDRProducerStatus>()
  const [wiki, setWiki] = useState<HZDRWikiInfo>()
  const [scicat, setScicat] = useState<HZDRScicatInfo>()
  const [searchStatus, setSearchStatus] = useState(
    'Pick a curated campaign, then search visible sources for matching shot records.'
  )
  const [linkDraft, setLinkDraft] = useState<LinkRecordsDraft>()
  const [builtPackage, setBuiltPackage] = useState<BuiltLinkRecordsPackage>()

  useEffect(() => {
    fetch('/metadata/hzdr/sources')
      .then((response) => (response.ok ? response.json() : []))
      .then(setSources)
      .catch(() => setSources([]))
    fetchHZDRCampaigns()
      .then(setCampaigns)
      .catch(() => {
        setCampaigns([])
        setSearchStatus(
          'Could not load curated campaigns — is the API running?'
        )
      })
  }, [])

  const selectedCampaign = useMemo(
    () => campaigns.find((campaign) => campaign.key === selectedCampaignKey),
    [campaigns, selectedCampaignKey]
  )
  // The curated campaign title is the text key the source matcher works against.
  const campaignKey = selectedCampaign?.title ?? ''

  useEffect(() => {
    if (!selectedCampaignKey) {
      setCampaignShots([])
      return
    }
    let active = true
    fetchHZDRCampaignShots(selectedCampaignKey)
      .then((shots) => active && setCampaignShots(shots))
      .catch(() => active && setCampaignShots([]))
    return () => {
      active = false
    }
  }, [selectedCampaignKey])

  useEffect(() => {
    if (!selectedSourceKey) {
      setProducerStatus(undefined)
      setWiki(undefined)
      setScicat(undefined)
      return
    }
    let active = true
    fetchHZDRProducerStatus(selectedSourceKey)
      .then((status) => active && setProducerStatus(status))
      .catch(() => active && setProducerStatus(undefined))
    fetchHZDRSourceWiki(selectedSourceKey)
      .then((info) => active && setWiki(info))
      .catch(() => active && setWiki(undefined))
    fetchHZDRSourceScicat(selectedSourceKey)
      .then((info) => active && setScicat(info))
      .catch(() => active && setScicat(undefined))
    return () => {
      active = false
    }
  }, [selectedSourceKey])

  const draftInput = {
    sources,
    campaignKey,
    selectedSourceKey,
    collections,
    shotNumberQuery,
  }
  const emptyDraft = buildLinkRecordsDraft({
    ...draftInput,
    sources: [],
  })
  const visibleDraft = builtPackage ?? linkDraft ?? emptyDraft

  const searchExistingRecords = () => {
    const nextDraft = buildLinkRecordsDraft(draftInput)
    setLinkDraft(nextDraft)
    setBuiltPackage(undefined)
    setSearchStatus(
      `${nextDraft.linked_records.length} candidate shot record(s) from ${nextDraft.search.searched_sources} source(s)` +
        (campaignShots.length
          ? `; ${campaignShots.length} curated record(s) in ${selectedCampaign?.title}.`
          : '.')
    )
  }

  const buildReviewPackage = () => {
    const nextDraft = linkDraft ?? buildLinkRecordsDraft(draftInput)
    const nextPackage = buildLinkRecordsReviewPackage(nextDraft)
    setLinkDraft(nextDraft)
    setBuiltPackage(nextPackage)
    setSearchStatus(
      `Built review package with ${nextPackage.linked_records.length} linked shot record(s).`
    )
  }

  return (
    <HomePage
      header={<AppHeader />}
      main={
        <Container size="lg" py="xl">
          <Stack gap="lg">
            <Stack gap={4}>
              <Title order={2}>Link Existing Shot Records</Title>
              <Text c="dimmed">
                Pick a curated campaign (read from the LabFrog SQLite
                snapshots), cross-reference DAQ File Watchdog, Shotcounter, and
                MediaWiki, then prepare a coherent JSON/HDF5/DAMNIT-table
                handoff for review.
              </Text>
            </Stack>
            <Text size="sm" c="dimmed">
              1 Search — choose the curated campaign and collections · 2 Link —
              match Shotcounter, Watchdog, and shotsheet records · 3 Review —
              fix mismatches, then write JSON/HDF5/DAMNIT records.
            </Text>
            <Grid gutter="md">
              <Grid.Col span={{ base: 12, md: 5 }}>
                <Card withBorder radius={4} p="md">
                  <Stack gap="sm">
                    <Title order={4}>Search setup</Title>
                    <Select
                      label="Campaign"
                      value={selectedCampaignKey}
                      onChange={setSelectedCampaignKey}
                      data={campaigns.map((campaign) => ({
                        value: campaign.key,
                        label: campaignOptionLabel(campaign),
                      }))}
                      placeholder={
                        campaigns.length
                          ? 'Select a curated campaign'
                          : 'No curated campaigns found'
                      }
                      searchable
                      clearable
                    />
                    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                      <TextInput
                        label="Shot number (optional)"
                        value={shotNumberQuery}
                        onChange={(event) =>
                          setShotNumberQuery(event.currentTarget.value)
                        }
                        placeholder="123"
                      />
                      <Select
                        label="Limit to source (optional)"
                        value={selectedSourceKey}
                        onChange={setSelectedSourceKey}
                        data={sources.map((source) => ({
                          value: source.key,
                          label: `${source.title} (${source.shots.length})`,
                        }))}
                        placeholder="Search all visible sources"
                        searchable
                        clearable
                      />
                    </SimpleGrid>
                    <Checkbox.Group
                      label="Collections to inspect"
                      value={collections}
                      onChange={setCollections}
                    >
                      <Stack gap="xs" mt="xs">
                        <Checkbox value="shots" label="MongoDB shotsheet" />
                        <Checkbox value="watchdog" label="DAQ File Watchdog" />
                        <Checkbox value="shotcounter" label="Shotcounter" />
                      </Stack>
                    </Checkbox.Group>
                  </Stack>
                </Card>
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 7 }}>
                <Stack gap="md">
                  <CampaignReferenceCard
                    campaign={selectedCampaign}
                    shots={campaignShots}
                  />
                  <ProducerStatusCard
                    status={producerStatus}
                    sourceSelected={Boolean(selectedSourceKey)}
                  />
                  <WikiCard
                    wiki={wiki}
                    sourceSelected={Boolean(selectedSourceKey)}
                  />
                  <ScicatCard
                    scicat={scicat}
                    sourceSelected={Boolean(selectedSourceKey)}
                  />
                </Stack>
              </Grid.Col>
            </Grid>
            <Card withBorder radius={4} p="md">
              <Stack gap="sm">
                <Title order={4}>Link draft</Title>
                <Group>
                  <Button onClick={searchExistingRecords} variant="light">
                    Search visible records
                  </Button>
                  <Button onClick={buildReviewPackage}>
                    Build review package
                  </Button>
                </Group>
                <Text size="sm" c="dimmed">
                  {searchStatus}
                </Text>
                <Text size="sm">
                  {visibleDraft.linked_records.length} linked record(s) ·{' '}
                  {visibleDraft.search.searched_sources} searched source(s)
                  {selectedCampaign ? ` · ${selectedCampaign.title}` : ''}
                </Text>
                <Text size="sm" c="dimmed">
                  Search and build locally from the HZDR sources currently
                  visible to DAMNIT-web, cross-referenced against the curated
                  campaign snapshot above.
                </Text>
                <DetailsSection title="Full draft JSON" open={false}>
                  <ScrollArea.Autosize mah={320} type="auto">
                    <Code block>{JSON.stringify(visibleDraft, null, 2)}</Code>
                  </ScrollArea.Autosize>
                </DetailsSection>
              </Stack>
            </Card>
          </Stack>
        </Container>
      }
    />
  )
}

function campaignOptionLabel(campaign: LabFrogCampaignRef): string {
  const rows = campaign.row_count != null ? `${campaign.row_count} shots` : ''
  const range =
    campaign.shot_date_min && campaign.shot_date_max
      ? `${campaign.shot_date_min} → ${campaign.shot_date_max}`
      : ''
  const detail = [rows, range].filter(Boolean).join(' · ')
  return detail ? `${campaign.title} (${detail})` : campaign.title
}

function CampaignReferenceCard({
  campaign,
  shots,
}: {
  campaign: LabFrogCampaignRef | undefined
  shots: LabFrogCampaignShot[]
}) {
  return (
    <Card withBorder radius={4} p="md">
      <Stack gap="sm">
        <Title order={4}>Curated campaign reference</Title>
        {!campaign ? (
          <Text size="sm" c="dimmed">
            Select a campaign to load its curated SQLite records.
          </Text>
        ) : (
          <>
            <Group gap="xs">
              <Badge variant="light">
                {campaign.source_collection ?? 'mongo'}
              </Badge>
              {campaign.exported_at ? (
                <Text size="xs" c="dimmed">
                  exported {campaign.exported_at}
                </Text>
              ) : null}
            </Group>
            <Text size="sm">
              {campaign.row_count ?? shots.length} curated shot record(s)
              {campaign.shot_date_min && campaign.shot_date_max
                ? ` from ${campaign.shot_date_min} to ${campaign.shot_date_max}`
                : ''}
              .
            </Text>
            {shots.length ? (
              <Table striped withTableBorder fz="xs">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Day/Shot</Table.Th>
                    <Table.Th>Date</Table.Th>
                    <Table.Th>Target</Table.Th>
                    <Table.Th>Status</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {shots.slice(0, 8).map((shot) => (
                    <Table.Tr key={shot.shot_id ?? shot.day_shot_key}>
                      <Table.Td>
                        {shot.day_shot_key ?? shot.shot_number}
                      </Table.Td>
                      <Table.Td>{shot.date_time ?? shot.shot_date}</Table.Td>
                      <Table.Td>{shot.target ?? '—'}</Table.Td>
                      <Table.Td>{shot.status ?? '—'}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            ) : null}
            {shots.length > 8 ? (
              <Text size="xs" c="dimmed">
                Showing first 8 of {shots.length} loaded records.
              </Text>
            ) : null}
          </>
        )}
      </Stack>
    </Card>
  )
}

function ProducerStatusCard({
  status,
  sourceSelected,
}: {
  status: HZDRProducerStatus | undefined
  sourceSelected: boolean
}) {
  return (
    <Card withBorder radius={4} p="md">
      <Stack gap="sm">
        <Title order={4}>Producer status</Title>
        {!sourceSelected ? (
          <Text size="sm" c="dimmed">
            Limit to a source to see DAQ File Watchdog computers and Shotcounter
            status (derived from catalog events).
          </Text>
        ) : !status ? (
          <Text size="sm" c="dimmed">
            No producer status available for this source.
          </Text>
        ) : (
          <>
            <Stack gap={4}>
              <Text size="sm" fw={600}>
                DAQ File Watchdog — computers seen
              </Text>
              {status.watchdog_hosts.length ? (
                <Table withTableBorder fz="xs">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Host</Table.Th>
                      <Table.Th>Watcher</Table.Th>
                      <Table.Th>Last seen</Table.Th>
                      <Table.Th>Events</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {status.watchdog_hosts.map((host) => (
                      <Table.Tr key={host.host}>
                        <Table.Td>{host.host}</Table.Td>
                        <Table.Td>{host.watcher ?? '—'}</Table.Td>
                        <Table.Td>{host.last_seen ?? '—'}</Table.Td>
                        <Table.Td>{host.event_count}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              ) : (
                <Text size="xs" c="dimmed">
                  No DAQ File Watchdog events in this source's catalog.
                </Text>
              )}
            </Stack>
            <Stack gap={4}>
              <Group gap="xs">
                <Text size="sm" fw={600}>
                  Shotcounter status
                </Text>
                <Badge
                  color={
                    SHOTCOUNTER_STATUS_COLOR[status.shotcounter.status] ??
                    'gray'
                  }
                  variant="light"
                >
                  {status.shotcounter.status}
                </Badge>
              </Group>
              <Text size="xs" c="dimmed">
                {status.shotcounter.event_count} event(s)
                {status.shotcounter.last_event_at
                  ? `, last ${status.shotcounter.last_event_at}`
                  : ''}
                {status.shotcounter.tkeys_seen.length
                  ? ` · TKEYs: ${status.shotcounter.tkeys_seen.join(', ')}`
                  : ''}
              </Text>
            </Stack>
          </>
        )}
      </Stack>
    </Card>
  )
}

function WikiCard({
  wiki,
  sourceSelected,
}: {
  wiki: HZDRWikiInfo | undefined
  sourceSelected: boolean
}) {
  return (
    <Card withBorder radius={4} p="md">
      <Stack gap="sm">
        <Title order={4}>MediaWiki cross-reference</Title>
        {!sourceSelected ? (
          <Text size="sm" c="dimmed">
            Limit to a source to cross-reference its MediaWiki campaign page.
          </Text>
        ) : !wiki ? (
          <Text size="sm" c="dimmed">
            No wiki information available for this source.
          </Text>
        ) : !wiki.configured ? (
          <Text size="sm" c="dimmed">
            MediaWiki base URL is not configured (DW_API_HZDR_WIKI__BASE_URL).
          </Text>
        ) : (
          <>
            <Group gap="xs">
              {wiki.page_url ? (
                <Anchor href={wiki.page_url} target="_blank" size="sm">
                  {wiki.page_title ?? wiki.page_url}
                </Anchor>
              ) : (
                <Text size="sm">{wiki.page_title}</Text>
              )}
              {wiki.exists != null ? (
                <Badge color={wiki.exists ? 'green' : 'red'} variant="light">
                  {wiki.exists ? 'page exists' : 'missing'}
                </Badge>
              ) : null}
            </Group>
            {wiki.last_modified ? (
              <Text size="xs" c="dimmed">
                last modified {wiki.last_modified}
              </Text>
            ) : null}
            {wiki.categories.length ? (
              <Group gap={4}>
                {wiki.categories.map((category) => (
                  <Badge key={category} variant="outline" size="xs">
                    {category}
                  </Badge>
                ))}
              </Group>
            ) : null}
          </>
        )}
      </Stack>
    </Card>
  )
}

function ScicatCard({
  scicat,
  sourceSelected,
}: {
  scicat: HZDRScicatInfo | undefined
  sourceSelected: boolean
}) {
  return (
    <Card withBorder radius={4} p="md">
      <Stack gap="sm">
        <Title order={4}>SciCat dataset</Title>
        {!sourceSelected ? (
          <Text size="sm" c="dimmed">
            Limit to a source to see its registered SciCat dataset.
          </Text>
        ) : !scicat ? (
          <Text size="sm" c="dimmed">
            No SciCat information available for this source.
          </Text>
        ) : !scicat.configured ? (
          <Text size="sm" c="dimmed">
            SciCat registration is not enabled (DW_API_HZDR_SCICAT__ENABLED).
          </Text>
        ) : !scicat.registered ? (
          <Text size="sm" c="dimmed">
            Not yet registered — the builder registers the campaign NeXus file
            on its next run.
          </Text>
        ) : (
          <>
            <Group gap="xs">
              {scicat.dataset_url ? (
                <Anchor href={scicat.dataset_url} target="_blank" size="sm">
                  {scicat.pid}
                </Anchor>
              ) : (
                <Text size="sm">{scicat.pid}</Text>
              )}
              <Badge color="green" variant="light">
                registered
              </Badge>
            </Group>
            {scicat.registered_at ? (
              <Text size="xs" c="dimmed">
                registered {scicat.registered_at}
              </Text>
            ) : null}
          </>
        )}
      </Stack>
    </Card>
  )
}
