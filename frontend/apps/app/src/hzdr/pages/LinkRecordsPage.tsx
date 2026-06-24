import { useEffect, useState } from 'react'
import {
  Button,
  Card,
  Checkbox,
  Code,
  Container,
  Grid,
  Group,
  Paper,
  Select,
  SimpleGrid,
  Stack,
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
import {
  buildLinkRecordsDraft,
  buildLinkRecordsReviewPackage,
} from '../utils/link-records'

export function LinkExistingShotRecordsPage() {
  const [sources, setSources] = useState<HZDRSource[]>([])
  const [campaignKey, setCampaignKey] = useState('')
  const [selectedSourceKey, setSelectedSourceKey] = useState<string | null>(
    null
  )
  const [shotNumberQuery, setShotNumberQuery] = useState('')
  const [collections, setCollections] = useState<string[]>([
    'shots',
    'watchdog',
  ])
  const [searchStatus, setSearchStatus] = useState(
    'Search all visible sources, or choose an optional source after narrowing the campaign.'
  )
  const [linkDraft, setLinkDraft] = useState<LinkRecordsDraft>()
  const [builtPackage, setBuiltPackage] = useState<BuiltLinkRecordsPackage>()

  useEffect(() => {
    fetch('/metadata/hzdr/sources')
      .then((response) => (response.ok ? response.json() : []))
      .then(setSources)
      .catch(() => setSources([]))
  }, [])

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
      `${nextDraft.linked_records.length} candidate shot record(s) from ${nextDraft.search.searched_sources} source(s).`
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
                Search existing MongoDB shot and watchdog records for a campaign
                key, then prepare a coherent JSON/HDF5/DAMNIT-table handoff for
                review.
              </Text>
            </Stack>
            <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
              <Card withBorder radius={4} p="md">
                <Stack gap="xs">
                  <Title order={4}>1. Search</Title>
                  <Text size="sm">
                    Choose the campaign key and collections that should be
                    inspected for existing shot records.
                  </Text>
                </Stack>
              </Card>
              <Card withBorder radius={4} p="md">
                <Stack gap="xs">
                  <Title order={4}>2. Link</Title>
                  <Text size="sm">
                    Match shotcounter, Watchdog, and shotsheet records into one
                    source-level package view.
                  </Text>
                </Stack>
              </Card>
              <Card withBorder radius={4} p="md">
                <Stack gap="xs">
                  <Title order={4}>3. Review</Title>
                  <Text size="sm">
                    Let the user fix small mismatches before writing coherent
                    JSON, HDF5, and DAMNIT table records.
                  </Text>
                </Stack>
              </Card>
            </SimpleGrid>
            <Grid gutter="md">
              <Grid.Col span={{ base: 12, md: 5 }}>
                <Card withBorder radius={4} p="md">
                  <Stack gap="sm">
                    <Title order={4}>Search setup</Title>
                    <TextInput
                      label="Campaign key"
                      value={campaignKey}
                      onChange={(event) =>
                        setCampaignKey(event.currentTarget.value)
                      }
                      placeholder="exp-2026-05-draco"
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
                    <Paper
                      withBorder
                      radius={4}
                      p="sm"
                      bg="var(--mantine-color-gray-0)"
                    >
                      <Text size="sm" c="dimmed">
                        {searchStatus}
                      </Text>
                    </Paper>
                  </Stack>
                </Card>
              </Grid.Col>
              <Grid.Col span={{ base: 12, md: 7 }}>
                <Card withBorder radius={4} p="md">
                  <Stack gap="sm">
                    <Title order={4}>Link draft</Title>
                    <Text size="sm" c="dimmed">
                      Search and build locally from the HZDR sources currently
                      visible to DAMNIT-web. The backend agent can replace this
                      with direct MongoDB collection reads later.
                    </Text>
                    <Code block>{JSON.stringify(visibleDraft, null, 2)}</Code>
                    <Group>
                      <Button onClick={searchExistingRecords} variant="light">
                        Search visible records
                      </Button>
                      <Button onClick={buildReviewPackage}>
                        Build review package
                      </Button>
                    </Group>
                  </Stack>
                </Card>
              </Grid.Col>
            </Grid>
          </Stack>
        </Container>
      }
    />
  )
}
