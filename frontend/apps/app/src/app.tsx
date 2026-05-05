import { type PropsWithChildren, useEffect, useState } from 'react'
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
  Code,
  Divider,
  Grid,
  Group,
  MultiSelect,
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

function useRuntimeConfig() {
  const [runtimeConfig, setRuntimeConfig] = useState<RuntimeConfig>()

  useEffect(() => {
    fetch('/config/runtime')
      .then((response) => response.json())
      .then(setRuntimeConfig)
  }, [])

  return runtimeConfig
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

  return (
    <Stack gap="md" py="md">
      <Group justify="space-between">
        <Title order={3}>HZDR sources</Title>
        <Badge variant="light">shot-based</Badge>
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
  )
}

function HZDRShotPage() {
  const { source_key } = useParams()
  const [source, setSource] = useState<HZDRSource>()
  const [shots, setShots] = useState<HZDRShot[]>([])
  const [availableSources, setAvailableSources] = useState<HZDRSource[]>([])
  const [selectedShotNumber, setSelectedShotNumber] = useState<number>()
  const [shotDetail, setShotDetail] = useState<HZDRShotDetail>()
  const [shotFilter, setShotFilter] = useState('')

  useEffect(() => {
    if (!source_key) {
      return
    }

    const loadShotPageData = () => {
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
    }

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
  const filteredShots = shots.filter((shot) => {
    const filter = shotFilter.trim().toLowerCase()
    if (!filter) {
      return true
    }
    return [
      shot.shot_number,
      shot.fired_at,
      shot.metadata.status,
      shot.metadata.target,
      shot.metadata.laser_energy_j,
      shot.hdf5_path,
    ]
      .filter((value) => value !== undefined)
      .some((value) => String(value).toLowerCase().includes(filter))
  })

  return (
    <HomePage
      header={
        <Header px={20}>
          <Logo linkTo="/home" />
        </Header>
      }
      main={
        <Container fluid py="md">
          <Grid gutter="md">
            <Grid.Col span={{ base: 12, md: 3, xl: 2 }}>
              <Stack gap="md">
                <Card withBorder radius={4} p="md">
                  <Stack gap="xs">
                    <Title order={5}>Sources</Title>
                    {availableSources.map((entry) => (
                      <Anchor key={entry.key} href={`/source/${entry.key}`}>
                        <Group justify="space-between" wrap="nowrap">
                          <Text size="sm" fw={entry.key === source_key ? 700 : 400}>
                            {entry.title}
                          </Text>
                          <Badge size="sm" variant="light">
                            {entry.shots.length}
                          </Badge>
                        </Group>
                      </Anchor>
                    ))}
                  </Stack>
                </Card>
                <Card withBorder radius={4} p="md">
                  <Stack gap={4}>
                    <Text size="xs" c="dimmed">
                      DAMNIT folder
                    </Text>
                    <Code block>{source?.damnit_path ?? '-'}</Code>
                  </Stack>
                </Card>
              </Stack>
            </Grid.Col>

            <Grid.Col span={{ base: 12, md: 9, xl: 10 }}>
              <Stack gap="md">
                <Group justify="space-between">
                  <Stack gap={2}>
                    <Title order={3}>{source?.title ?? source_key}</Title>
                    <Text size="sm" c="dimmed">
                      Shot number linked with fired-at date/time
                    </Text>
                  </Stack>
                  <Badge variant="light">HZDR source</Badge>
                </Group>

                <Grid gutter="md">
                  <Grid.Col span={{ base: 12, xl: 7 }}>
                    <Card withBorder radius={4} p="md">
                      <Stack gap="sm">
                        <TextInput
                          value={shotFilter}
                          onChange={(event) =>
                            setShotFilter(event.currentTarget.value)
                          }
                          placeholder="Filter shots, timestamps, targets, status"
                        />
                      </Stack>
                    </Card>
                    <Card withBorder radius={4} p={0}>
                      <ScrollArea h={520} type="auto" offsetScrollbars>
                        <Table striped highlightOnHover miw={760}>
                          <Table.Thead>
                            <Table.Tr>
                              <Table.Th>Shot</Table.Th>
                              <Table.Th>Fired at</Table.Th>
                              <Table.Th>Status</Table.Th>
                              <Table.Th>Energy</Table.Th>
                              <Table.Th>Target</Table.Th>
                            </Table.Tr>
                          </Table.Thead>
                          <Table.Tbody>
                            {filteredShots.map((shot) => (
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
                                <Table.Td>{shot.shot_number}</Table.Td>
                                <Table.Td>{shot.fired_at}</Table.Td>
                                <Table.Td>
                                  {shot.metadata.status ?? 'unknown'}
                                </Table.Td>
                                <Table.Td>
                                  {shot.metadata.laser_energy_j ?? '-'}
                                </Table.Td>
                                <Table.Td>{shot.metadata.target ?? '-'}</Table.Td>
                              </Table.Tr>
                            ))}
                          </Table.Tbody>
                        </Table>
                      </ScrollArea>
                    </Card>
                    <Text size="xs" c="dimmed">
                      Saved context files are not executed automatically yet. This
                      table shows live source metadata until the context runner is
                      connected.
                    </Text>
                  </Grid.Col>

                  <Grid.Col span={{ base: 12, xl: 5 }}>
                    <Stack gap="md">
                      <ContextBuilderPromo sourceKey={source_key ?? 'default'} />
                      <HZDRShotSetsPanel shots={shots} />
                      <ShotDetailPanel
                        shot={selectedShot}
                        shotDetail={shotDetail}
                        availableSources={availableSources}
                      />
                    </Stack>
                  </Grid.Col>
                </Grid>
              </Stack>
            </Grid.Col>
          </Grid>
        </Container>
      }
    />
  )
}

function ContextBuilderPromo({ sourceKey }: { sourceKey: string }) {
  return (
    <Card
      withBorder
      radius={4}
      p="md"
      style={{
        borderLeft: '4px solid var(--mantine-color-blue-6)',
        background: 'var(--mantine-color-gray-0)',
      }}
    >
      <Stack gap="xs">
        <Group justify="space-between">
          <Stack gap={2}>
            <Title order={4}>Context builder</Title>
          <Text size="sm" c="dimmed">
            Turn selected HZDR metadata, Mongo filters, and HDF5 datasets into
              one DAMNIT table column at a time. Saving writes context.py; running
              it into the table is the next integration step.
          </Text>
          </Stack>
          <Button component="a" href={`/source/${sourceKey}/context-builder`}>
            Build column
          </Button>
        </Group>
      </Stack>
    </Card>
  )
}

function HZDRShotSetsPanel({ shots }: { shots: HZDRShot[] }) {
  const numericMetadataKeys = Array.from(
    new Set(
      shots.flatMap((shot) =>
        flattenObjectKeys(shot.metadata).filter((key) => {
          const value = getNestedMetadataValue(shot.metadata, key)
          return typeof value === 'number'
        })
      )
    )
  )
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
}: {
  shot?: HZDRShot
  shotDetail?: HZDRShotDetail
  availableSources: HZDRSource[]
}) {
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
            <Badge>{shot.metadata.status ?? 'unknown'}</Badge>
          </Group>
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

  useEffect(() => {
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
        setSelectedShotNumber(loadedShots[0]?.shot_number)
      })
    fetch(`/contextfile/campaign/${source_key}/me`)
      .then((response) => response.json())
      .then((loadedContext: CampaignContextFile) => {
        setContextFile(loadedContext)
        setContextContent(loadedContext.fileContent)
      })
    fetch(`/contextfile/campaign/${source_key}/me/files`)
      .then((response) => response.json())
      .then(setContextFiles)
  }, [source_key])

  useEffect(() => {
    if (!source_key || !selectedShotNumber) {
      return
    }
    fetch(`/metadata/hzdr/sources/${source_key}/shots/${selectedShotNumber}`)
      .then((response) => response.json())
      .then(setShotDetail)
  }, [source_key, selectedShotNumber])

  const selectedShot = shots.find(
    (shot) => shot.shot_number === selectedShotNumber
  )
  const metadataOptions = flattenObjectKeys(selectedShot?.metadata ?? {}).map((key) => ({
    value: `metadata:${key}`,
    label: key,
  }))
  const datasetOptions =
    shotDetail?.hdf5_datasets.map((dataset) => ({
      value: `hdf5:${dataset.name}`,
      label: `${dataset.name} (${dataset.dtype}, ${dataset.shape.join('x')})`,
    })) ?? []
  const inputOptions = [
    { group: 'Shot metadata', items: metadataOptions },
    { group: 'HDF5 datasets', items: datasetOptions },
    {
      group: 'MongoDB',
      items: [{ value: 'mongo:query', label: 'Query/filter result' }],
    },
  ]
  const selectedInputSummary = selectedInputs.length
    ? selectedInputs.map(formatSelectedInput).join(', ')
    : 'No inputs selected yet'
  const showMongoFields = fieldKind === 'mongo-filter' || fieldKind === 'function'
  const showFunctionFields = fieldKind === 'function'
  const usesHdf5VisualPreview = [
    'hdf5',
    'lineout-preview',
    'image-preview',
    'plotly-trend',
    'function',
  ].includes(fieldKind)
  const snippet = buildComputedFieldSnippet({
    fieldKind,
    fieldName,
    fieldTitle,
    selectedInputs,
    mongoCollection,
    mongoFilter,
    combineExpression,
  })

  useEffect(() => {
    setGeneratedDraft(snippet)
  }, [snippet])

  const appendToContext = () => {
    if (!source_key || !contextFile) {
      return
    }
    setSaveStatus('Saving...')
    const fileContent = `${contextContent.trimEnd()}\n\n${generatedDraft}\n`
    fetch(`/contextfile/campaign/${source_key}/me/files/${selectedContextFile}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileContent }),
    })
      .then((response) => response.json())
      .then((savedContext: CampaignContextFile) => {
        setContextFile(savedContext)
        setContextContent(savedContext.fileContent)
        setSaveStatus(`Saved to ${selectedContextFile}`)
      })
      .catch(() => setSaveStatus('Save failed'))
  }

  const previewColumn = () => {
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
    if (usesHdf5VisualPreview && source_key && selectedShotNumber && datasetName) {
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
    fetch(`/contextfile/campaign/${source_key}/me/files/${selectedContextFile}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileContent: contextContent }),
    })
      .then((response) => response.json())
      .then((savedContext: CampaignContextFile) => {
        setContextFile(savedContext)
        setContextContent(savedContext.fileContent)
        setSaveStatus(`Saved ${selectedContextFile}`)
      })
      .catch(() => setSaveStatus('Save failed'))
  }

  const loadContextVariant = (fileName: string | null) => {
    if (!source_key || !fileName) {
      return
    }
    setSelectedContextFile(fileName)
    fetch(`/contextfile/campaign/${source_key}/me/files/${fileName}`)
      .then((response) => response.json())
      .then((loadedContext: CampaignContextFile) => {
        setContextFile(loadedContext)
        setContextContent(loadedContext.fileContent)
        setSaveStatus(`Loaded ${fileName}`)
      })
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
      .then((response) => response.json())
      .then((savedContext: CampaignContextFile) => {
        const savedName = savedContext.path.split(/[\\/]/).at(-1) ?? saveAsName
        setContextFile(savedContext)
        setContextContent(savedContext.fileContent)
        setSelectedContextFile(savedName)
        setSaveStatus(`Saved as ${savedName}`)
        return fetch(`/contextfile/campaign/${source_key}/me/files`)
      })
      .then((response) => response.json())
      .then(setContextFiles)
      .catch(() => setSaveStatus('Save as failed'))
  }

  return (
    <HomePage
      header={
        <Header px={20}>
          <Logo linkTo="/home" />
        </Header>
      }
      main={
        <Container fluid py="md">
          <Stack gap="md">
            <Group justify="space-between">
              <Stack gap={2}>
                <Title order={3}>Context builder</Title>
                <Text size="sm" c="dimmed">
                  Build and save one DAMNIT context variable for{' '}
                  {source?.title ?? source_key}. Saved files live on the API host.
                </Text>
              </Stack>
              <Button component="a" href={`/source/${source_key}`} variant="light">
                Back to shots
              </Button>
            </Group>
            <Grid gutter="md">
              <Grid.Col span={{ base: 12, lg: 5 }}>
                <Card withBorder radius={4} p="md">
                  <Stack gap="sm">
                    <Select
                      label="What are you building?"
                      value={contextScope}
                      onChange={(value) => setContextScope(value ?? 'shot')}
                      data={[
                        { value: 'shot', label: 'Per-shot table column' },
                        { value: 'set', label: 'Per-set trend or summary' },
                      ]}
                    />
                    <Select
                      label="Example shot"
                      value={selectedShotNumber?.toString()}
                      onChange={(value) =>
                        setSelectedShotNumber(value ? Number(value) : undefined)
                      }
                      data={shots.map((shot) => ({
                        value: shot.shot_number.toString(),
                        label: `${shot.shot_number} - ${shot.fired_at}`,
                      }))}
                    />
                    <TextInput
                      label="Column title"
                      value={fieldTitle}
                      onChange={(event) => setFieldTitle(event.currentTarget.value)}
                    />
                    {contextScope === 'shot' || fieldKind === 'function' ? (
                      <TextInput
                        label="Generated Python function name"
                        value={fieldName}
                        onChange={(event) => setFieldName(event.currentTarget.value)}
                      />
                    ) : null}
                    <Select
                      label={
                        contextScope === 'shot'
                          ? 'What should this column do?'
                          : 'What should this set view do?'
                      }
                      value={fieldKind}
                      onChange={(value) => setFieldKind(value ?? 'metadata')}
                      data={[
                        {
                          value: 'metadata',
                          label:
                            contextScope === 'shot'
                              ? 'Show a selected value'
                              : 'Trend selected values across shots',
                        },
                        {
                          value: 'hdf5',
                          label:
                            contextScope === 'shot'
                              ? 'Summarize selected data'
                              : 'Summarize selected data across shots',
                        },
                        ...(contextScope === 'shot'
                          ? [
                              {
                                value: 'lineout-preview',
                                label: 'Lineout with table preview',
                              },
                              {
                                value: 'image-preview',
                                label: 'Image with reduced preview',
                              },
                              {
                                value: 'plotly-trend',
                                label: 'Interactive trend preview',
                              },
                            ]
                          : []),
                        { value: 'mongo-filter', label: 'Show results from a query' },
                        {
                          value: 'function',
                          label: 'Compute with a custom function',
                        },
                      ]}
                    />
                    <MultiSelect
                      label="Inputs for this column"
                      value={selectedInputs}
                      onChange={setSelectedInputs}
                      data={inputOptions}
                      searchable
                    />
                    <Card withBorder radius={4} p="sm">
                      <Stack gap={4}>
                        <Text size="xs" c="dimmed">
                          Selected inputs
                        </Text>
                        <Text size="sm">{selectedInputSummary}</Text>
                      </Stack>
                    </Card>
                    {showMongoFields ? (
                      <>
                        <TextInput
                          label="Query collection"
                          value={mongoCollection}
                          onChange={(event) =>
                            setMongoCollection(event.currentTarget.value)
                          }
                        />
                        <Textarea
                          label="Query filter template"
                          minRows={5}
                          value={mongoFilter}
                          onChange={(event) =>
                            setMongoFilter(event.currentTarget.value)
                          }
                        />
                      </>
                    ) : null}
                    {showFunctionFields ? (
                      <Textarea
                        label="Function expression"
                        minRows={3}
                        value={combineExpression}
                        onChange={(event) =>
                          setCombineExpression(event.currentTarget.value)
                        }
                      />
                    ) : null}
                    <Text size="sm" c="dimmed">
                      {saveStatus || contextFile?.path || '-'}
                    </Text>
                  </Stack>
                </Card>
              </Grid.Col>
              <Grid.Col span={{ base: 12, lg: 7 }}>
                <Stack gap="md">
                  <Card withBorder radius={4} p="md">
                    <Stack gap="sm">
                    <Group justify="space-between">
                      <Stack gap={2}>
                        <Title order={5}>Generated variable</Title>
                        <Text size="xs" c="dimmed">
                          Edit this block before appending it to the selected context file.
                        </Text>
                      </Stack>
                      <Group>
                        <Button onClick={previewColumn} variant="light">
                          Preview column
                        </Button>
                        <Button onClick={appendToContext}>
                          Append to {selectedContextFile}
                        </Button>
                      </Group>
                    </Group>
                    <Textarea
                      value={generatedDraft}
                      onChange={(event) =>
                        setGeneratedDraft(event.currentTarget.value)
                      }
                      autosize
                      minRows={18}
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
                  <Card withBorder radius={4} p="md">
                    <Stack gap="xs">
                      <Title order={5}>Preview</Title>
                      <Grid gutter="md">
                        <Grid.Col span={{ base: 12, md: 7 }}>
                          <VisualPreview
                            datasetPreview={datasetPreview}
                            fieldKind={fieldKind}
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
                      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
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

function flattenObjectKeys(value: Record<string, unknown>, prefix = ''): string[] {
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
    },
    null,
    2
  )
}

function getNestedMetadataValue(metadata: Record<string, unknown>, keyPath: string) {
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
}: {
  datasetPreview?: HZDRDatasetPreview
  fieldKind: string
}) {
  if (
    !['hdf5', 'lineout-preview', 'image-preview', 'plotly-trend', 'function'].includes(
      fieldKind
    )
  ) {
    return (
      <Card withBorder radius={4} p="md">
        <Text size="sm" c="dimmed">
          This column uses metadata or query results. The JSON panel shows the
          selected value for the example shot.
        </Text>
      </Card>
    )
  }

  if (!datasetPreview) {
    return (
      <Card withBorder radius={4} p="md">
        <Text size="sm" c="dimmed">
          Select an HDF5 input and click Preview column.
        </Text>
      </Card>
    )
  }

  if (datasetPreview.preview_kind === 'image') {
    const pixels = datasetPreview.preview as number[][]
    return (
      <Stack gap="xs">
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
          90 -
          ((value - minValue) / Math.max(maxValue - minValue, 1e-9)) * 80
        return `${x},${y}`
      })
      .join(' ')
    return (
      <Stack gap="xs">
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
    <Card withBorder radius={4} p="md">
      <Stack gap={4}>
        <Text size="sm" fw={600}>
          {datasetPreview.name}
        </Text>
        <Text size="xl">{String(datasetPreview.preview)}</Text>
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

  const maxValue = Math.max(...values.map((entry) => entry.value), 1)
  const points = values
    .map((entry, index) => {
      const x = values.length === 1 ? 50 : (index / (values.length - 1)) * 90 + 5
      const y = 90 - (entry.value / maxValue) * 75
      return `${x},${y}`
    })
    .join(' ')

  return (
    <Stack gap="xs">
      <Text size="sm" fw={600}>
        Trend preview
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
        {values.map((entry, index) => {
          const x = values.length === 1 ? 50 : (index / (values.length - 1)) * 90 + 5
          const y = 90 - (entry.value / maxValue) * 75
          return (
            <circle
              key={entry.shotNumber}
              cx={x}
              cy={y}
              r="2.4"
              fill="var(--mantine-color-blue-7)"
            />
          )
        })}
      </svg>
    </Stack>
  )
}

function buildComputedFieldSnippet({
  fieldKind,
  fieldName,
  fieldTitle,
  selectedInputs,
  mongoCollection,
  mongoFilter,
  combineExpression,
}: {
  fieldKind: string
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
                header={
                  <Header px={20}>
                    <Logo linkTo="/home" />
                  </Header>
                }
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
