import { useEffect, useMemo, useState } from 'react'
import type { PropsWithChildren } from 'react'
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Code,
  Container,
  Grid,
  Group,
  MultiSelect,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core'
import { IconArrowDown, IconArrowUp, IconRefresh } from '@tabler/icons-react'
import { useParams } from 'react-router'
import { HomePage } from '@damnit-frontend/ui'
import type {
  HZDRShot,
  HZDRShotDetail,
  HZDRSource,
  HZDRDatasetPreview,
  CampaignContextFile,
  ContextFileEntry,
  SelectOptionGroup,
} from '../types'
import { AppHeader } from '../components/AppHeader'
import { VisualPreview } from '../components/previews'
import {
  buildHdf5DatasetOptions,
  getContextInputOptions,
  getContextRecipeOptionHelp,
  getContextRecipeOptions,
  contextRecipeTone,
  contextRecipeLabel,
} from '../utils/hdf5'
import {
  splitPythonImportBlock,
  mergeImportsAtTop,
  stripDuplicateSnippetImports,
  parseContextVariableBlocks,
  inferContextBuilderFormState,
  extractPythonFunctionName,
  isValidPythonFunctionName,
  pythonNameFromTitle,
  repairCommonContextImports,
  buildComputedFieldSnippet,
  makeContextVariableBlockUnique,
  getContextRecipeInputValues,
} from '../utils/context'
import {
  flattenObjectKeys,
  getNumericMetadataKeys,
  countNumericValues,
} from '../utils/metadata'
import { formatSelectedInput } from '../utils/format'
import { buildColumnPreview } from '../utils/preview'
import { requireJson } from '../utils/api'

function ContextBuilderSectionTitle({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <Stack gap={2}>
      <Text size="sm" fw={700}>
        {title}
      </Text>
      <Text size="xs" c="dimmed">
        {description}
      </Text>
    </Stack>
  )
}

function ContextBuilderPanel({
  title,
  description,
  tone,
  children,
}: PropsWithChildren<{
  title: string
  description: string
  tone: string
}>) {
  return (
    <Paper withBorder radius={4} p="sm" bg={`var(--mantine-color-${tone}-0)`}>
      <Stack gap="xs">
        <ContextBuilderSectionTitle title={title} description={description} />
        {children}
      </Stack>
    </Paper>
  )
}

function ContextBuilderDisclosure({
  title,
  description,
  summary,
  children,
  open = false,
}: PropsWithChildren<{
  title: string
  description: string
  summary?: string
  open?: boolean
}>) {
  const [expanded, setExpanded] = useState(open)

  return (
    <Paper withBorder radius={4} p="sm">
      <details
        open={expanded}
        onToggle={(event) => setExpanded(event.currentTarget.open)}
      >
        <summary style={{ cursor: 'pointer' }}>
          <Group justify="space-between" gap="sm" wrap="nowrap">
            <Stack gap={0} style={{ minWidth: 0 }}>
              <Text size="sm" fw={700}>
                {title}
              </Text>
              <Text size="xs" c="dimmed" truncate="end">
                {description}
              </Text>
            </Stack>
            {summary ? (
              <Badge variant="light" radius={4} style={{ flexShrink: 0 }}>
                {summary}
              </Badge>
            ) : null}
          </Group>
        </summary>
        <Stack gap="sm" mt="sm">
          {children}
        </Stack>
      </details>
    </Paper>
  )
}

export function ContextBuilderPage() {
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
  const [fieldTitle, setFieldTitle] = useState('HZDR/Computed field')
  const [fieldName, setFieldName] = useState('computed_field')
  const [fieldNameOverridden, setFieldNameOverridden] = useState(false)
  const [fieldTitleEdited, setFieldTitleEdited] = useState(false)
  const [selectedInputs, setSelectedInputs] = useState<string[]>([])
  const [allowMultipleInputs, setAllowMultipleInputs] = useState(false)
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
  const [selectedColumnId, setSelectedColumnId] = useState<string | null>(null)
  const [generatedEditorCompact, setGeneratedEditorCompact] = useState(true)

  useEffect(() => {
    if (!source_key) {
      return
    }
    fetch(`/metadata/hzdr/sources/${source_key}`)
      .then((response) => requireJson<HZDRSource>(response))
      .then(setSource)
      .catch(() => setSaveStatus('Could not load source metadata.'))
    fetch(`/metadata/hzdr/sources/${source_key}/shots`)
      .then((response) => requireJson<unknown>(response))
      .then((loadedShots) => {
        if (!Array.isArray(loadedShots)) {
          throw new Error('Shots response was not a list')
        }
        const nextShots = loadedShots as HZDRShot[]
        setShots(nextShots)
        setSelectedShotNumber(nextShots[0]?.shot_number)
      })
      .catch(() => setSaveStatus('Could not load source shots.'))
    fetch(`/contextfile/campaign/${source_key}/me`)
      .then((response) => requireJson<CampaignContextFile>(response))
      .then((loadedContext: CampaignContextFile) => {
        setContextFile(loadedContext)
        setContextContent(loadedContext.fileContent ?? '')
      })
      .catch(() => setSaveStatus('Could not load your context file.'))
    fetch(`/contextfile/campaign/${source_key}/me/files`)
      .then((response) => requireJson<unknown>(response))
      .then((loadedFiles) => {
        setContextFiles(
          Array.isArray(loadedFiles) ? (loadedFiles as ContextFileEntry[]) : []
        )
      })
      .catch(() => setContextFiles([]))
  }, [source_key])

  useEffect(() => {
    if (!source_key || !selectedShotNumber) {
      return
    }
    fetch(`/metadata/hzdr/sources/${source_key}/shots/${selectedShotNumber}`)
      .then((response) => requireJson<HZDRShotDetail>(response))
      .then(setShotDetail)
      .catch(() => setShotDetail(undefined))
  }, [source_key, selectedShotNumber])

  useEffect(() => {
    if (!fieldNameOverridden) {
      setFieldName(pythonNameFromTitle(fieldTitle))
    }
  }, [fieldNameOverridden, fieldTitle])

  const selectedShot = shots.find(
    (shot) => shot.shot_number === selectedShotNumber
  )
  const metadataKeys = useMemo(
    () =>
      contextScope === 'set'
        ? getNumericMetadataKeys(shots)
        : flattenObjectKeys(selectedShot?.metadata ?? {}),
    [contextScope, selectedShot?.metadata, shots]
  )
  const metadataOptions = useMemo(
    () =>
      metadataKeys.map((key) => ({
        value: `metadata:${key}`,
        label:
          contextScope === 'set'
            ? `${key} (${countNumericValues(shots, key)}/${shots.length} shots)`
            : key,
      })),
    [contextScope, metadataKeys, shots]
  )
  const datasetOptions = useMemo(
    () =>
      buildHdf5DatasetOptions(shotDetail?.hdf5_datasets ?? [], contextScope),
    [contextScope, shotDetail?.hdf5_datasets]
  )
  const inputOptions = useMemo<SelectOptionGroup[]>(
    () =>
      getContextInputOptions({
        fieldKind,
        metadataOptions,
        datasetOptions,
      }),
    [datasetOptions, fieldKind, metadataOptions]
  )
  const inputValueKey = useMemo(
    () => getContextRecipeInputValues(inputOptions).join(' '),
    [inputOptions]
  )
  const selectedInputSummary = selectedInputs.length
    ? selectedInputs.map(formatSelectedInput).join(', ')
    : 'No inputs selected yet'
  const recipeOptions = useMemo(
    () =>
      getContextRecipeOptions({
        contextScope,
        selectedInputs,
        datasetOptions,
      }),
    [contextScope, datasetOptions, selectedInputs]
  )
  const recipeOptionValueKey = useMemo(
    () =>
      recipeOptions
        .map(
          (option) =>
            `${option.value}:${option.disabled ? 'disabled' : 'enabled'}`
        )
        .join(' '),
    [recipeOptions]
  )
  const recipeHelp = getContextRecipeOptionHelp(fieldKind, contextScope)
  const canBuildColumn = selectedInputs.length > 0
  const canSaveGeneratedColumn =
    canBuildColumn && Boolean(extractPythonFunctionName(generatedDraft))
  const contextVariables = parseContextVariableBlocks(contextContent)
  const selectedColumnIndex = contextVariables.findIndex(
    (block) => block.id === selectedColumnId
  )
  const selectedContextVariable =
    selectedColumnIndex >= 0 ? contextVariables[selectedColumnIndex] : undefined
  const showMongoFields =
    fieldKind === 'mongo-filter' || fieldKind === 'function'
  const showFunctionFields = fieldKind === 'function'
  const actionCanUseMultipleInputs =
    fieldKind === 'function' ||
    (contextScope === 'set' &&
      (fieldKind === 'metadata' || fieldKind === 'hdf5'))
  const usesHdf5VisualPreview = [
    'hdf5',
    'lineout-preview',
    'image-preview',
    'plotly-trend',
    'function',
  ].includes(fieldKind)
  const rawSnippet = buildComputedFieldSnippet({
    fieldKind,
    contextScope,
    fieldName,
    fieldTitle,
    selectedInputs,
    mongoCollection,
    mongoFilter,
    combineExpression,
  })
  const snippet = stripDuplicateSnippetImports(rawSnippet, contextContent)

  useEffect(() => {
    setGeneratedDraft(snippet)
  }, [snippet])

  useEffect(() => {
    if (!actionCanUseMultipleInputs && allowMultipleInputs) {
      setAllowMultipleInputs(false)
      setSelectedInputs((current) => current.slice(0, 1))
    }
  }, [actionCanUseMultipleInputs, allowMultipleInputs])

  useEffect(() => {
    if (!allowMultipleInputs && selectedInputs.length > 1) {
      setSelectedInputs([selectedInputs[0]])
      return
    }

    if (
      contextScope === 'set' &&
      ['lineout-preview', 'image-preview', 'plotly-trend'].includes(fieldKind)
    ) {
      setFieldKind('metadata')
      setSelectedInputs([])
      return
    }

    const validRecipeValues = recipeOptions
      .filter((option) => !option.disabled)
      .map((option) => option.value)
    if (!validRecipeValues.includes(fieldKind) && validRecipeValues[0]) {
      setFieldKind(validRecipeValues[0])
      return
    }

    const validInputValues = new Set(inputValueKey.split(' ').filter(Boolean))
    if (selectedInputs.some((input) => !validInputValues.has(input))) {
      setSelectedInputs([])
    }
  }, [
    allowMultipleInputs,
    contextScope,
    fieldKind,
    inputValueKey,
    recipeOptionValueKey,
    recipeOptions,
    selectedInputs,
  ])

  const appendToContext = () => {
    if (!source_key || !contextFile) {
      return
    }
    if (!canBuildColumn) {
      setSaveStatus('Choose data before adding a column.')
      return
    }
    const { imports, body } = splitPythonImportBlock(generatedDraft)
    if (!extractPythonFunctionName(body)) {
      setSaveStatus('Generated variable needs a valid Python function name.')
      return
    }
    setSaveStatus('Saving...')
    const uniqueBody = makeContextVariableBlockUnique(body, contextVariables)
    const contextWithImports = mergeImportsAtTop(contextContent, imports)
    const fileContent = `${contextWithImports.trimEnd()}\n\n${uniqueBody.trimEnd()}\n`
    fetch(
      `/contextfile/campaign/${source_key}/me/files/${selectedContextFile}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileContent }),
      }
    )
      .then((response) => requireJson<CampaignContextFile>(response))
      .then((savedContext: CampaignContextFile) => {
        setContextFile(savedContext)
        setContextContent(savedContext.fileContent ?? '')
        setSaveStatus(`Saved to ${selectedContextFile}`)
      })
      .catch(() => setSaveStatus('Save failed'))
  }

  const selectAndLoadColumn = (columnId: string | null) => {
    setSelectedColumnId(columnId)
    const selectedBlock = contextVariables.find(
      (block) => block.id === columnId
    )
    if (!selectedBlock) {
      return
    }
    const formState = inferContextBuilderFormState(selectedBlock)
    const validInputValues = new Set(inputValueKey.split(' ').filter(Boolean))
    const selectedExistingInputs =
      formState.selectedInputs?.filter((input) =>
        validInputValues.has(input)
      ) ?? []
    if (formState.contextScope) {
      setContextScope(formState.contextScope)
    }
    if (formState.fieldKind) {
      setFieldKind(formState.fieldKind)
    }
    if (formState.fieldName) {
      setFieldName(formState.fieldName)
      setFieldNameOverridden(
        !formState.fieldTitle ||
          formState.fieldName !== pythonNameFromTitle(formState.fieldTitle)
      )
    }
    if (formState.fieldTitle) {
      setFieldTitle(formState.fieldTitle)
      setFieldTitleEdited(true)
    }
    if (formState.selectedInputs?.length) {
      setSelectedInputs(
        selectedExistingInputs.length
          ? selectedExistingInputs
          : formState.selectedInputs
      )
    }
    if (formState.allowMultipleInputs !== undefined) {
      setAllowMultipleInputs(formState.allowMultipleInputs)
    }
    if (formState.mongoCollection) {
      setMongoCollection(formState.mongoCollection)
    }
    if (formState.mongoFilter) {
      setMongoFilter(formState.mongoFilter)
    }
    if (formState.combineExpression) {
      setCombineExpression(formState.combineExpression)
    }
    setColumnDetails('')
    setDatasetPreview(undefined)
    setGeneratedDraft(selectedBlock.block.trim())
    setSaveStatus(`Loaded ${selectedBlock.name} into the builder form`)
  }

  const replaceSelectedColumn = () => {
    const selectedBlock = contextVariables.find(
      (block) => block.id === selectedColumnId
    )
    if (!source_key || !selectedBlock) {
      return
    }
    if (!canBuildColumn) {
      setSaveStatus('Choose data before replacing a column.')
      return
    }
    const { imports, body } = splitPythonImportBlock(generatedDraft)
    const replacementName = extractPythonFunctionName(body)
    if (!replacementName) {
      setSaveStatus('Replacement must contain one named Python function.')
      return
    }
    const duplicateColumn = contextVariables.find(
      (block) => block.id !== selectedBlock.id && block.name === replacementName
    )
    if (duplicateColumn) {
      setSaveStatus(
        `Cannot rename to ${replacementName}: that column already exists.`
      )
      return
    }
    const replacedContent = `${contextContent.slice(
      0,
      selectedBlock.start
    )}${body.trimEnd()}\n${contextContent.slice(selectedBlock.end)}`
    const fileContent = mergeImportsAtTop(replacedContent, imports)
    setSaveStatus(`Replacing ${selectedBlock.name}...`)
    saveContextContent(
      fileContent,
      replacementName === selectedBlock.name
        ? `Replaced ${selectedBlock.name}`
        : `Replaced ${selectedBlock.name} with ${replacementName}`,
      () => setSelectedColumnId(replacementName)
    )
  }

  const deleteSelectedColumn = () => {
    const selectedBlock = contextVariables.find(
      (block) => block.id === selectedColumnId
    )
    if (!source_key || !selectedBlock) {
      return
    }
    const fileContent = `${contextContent.slice(
      0,
      selectedBlock.start
    )}${contextContent.slice(selectedBlock.end)}`.trimEnd()
    setSaveStatus(`Deleting ${selectedBlock.name}...`)
    saveContextContent(`${fileContent}\n`, `Deleted ${selectedBlock.name}`)
    setSelectedColumnId(null)
  }

  const moveSelectedColumn = (direction: -1 | 1) => {
    const targetIndex = selectedColumnIndex + direction
    if (
      selectedColumnIndex < 0 ||
      targetIndex < 0 ||
      targetIndex >= contextVariables.length
    ) {
      setSaveStatus('Select a column that can move in that direction.')
      return
    }
    const reorderedBlocks = [...contextVariables]
    const [selectedBlock] = reorderedBlocks.splice(selectedColumnIndex, 1)
    reorderedBlocks.splice(targetIndex, 0, selectedBlock)
    const prefix = contextContent.slice(0, contextVariables[0].start)
    const suffix = contextContent.slice(
      contextVariables.at(-1)?.end ?? contextContent.length
    )
    const fileContent = `${prefix}${reorderedBlocks
      .map((block) => block.block.trim())
      .join('\n\n')}\n${suffix}`
    setSaveStatus(`Moving ${selectedBlock.name}...`)
    saveContextContent(fileContent, `Moved ${selectedBlock.name}`)
  }

  const previewColumn = () => {
    if (!canBuildColumn) {
      setColumnDetails('Choose data before previewing a column.')
      setDatasetPreview(undefined)
      return
    }
    const preview = buildColumnPreview({
      fieldKind,
      selectedInputs,
      selectedShot,
      datasetOptions,
      combineExpression,
    })
    setColumnDetails(preview)
    const selectedDataset = selectedInputs
      .map((value) => datasetOptions.find((option) => option.value === value))
      .find(Boolean)
    if (
      usesHdf5VisualPreview &&
      source_key &&
      selectedShotNumber &&
      selectedDataset
    ) {
      fetch(
        `/metadata/hzdr/sources/${source_key}/shots/${selectedShotNumber}/datasets/${selectedDataset.previewName}`
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
    saveContextContent(contextContent, `Saved ${selectedContextFile}`)
  }

  const repairContextImports = () => {
    const repairedContent = repairCommonContextImports(contextContent)
    if (repairedContent === contextContent) {
      setSaveStatus('No missing common imports found.')
      return
    }
    setContextContent(repairedContent)
    setSaveStatus('Added missing common imports. Review, then save.')
  }

  const saveContextContent = (
    fileContent: string,
    savedMessage: string,
    onSaved?: (savedContext: CampaignContextFile) => void
  ) => {
    if (!source_key) {
      return
    }
    fetch(
      `/contextfile/campaign/${source_key}/me/files/${selectedContextFile}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileContent }),
      }
    )
      .then((response) => requireJson<CampaignContextFile>(response))
      .then((savedContext: CampaignContextFile) => {
        setContextFile(savedContext)
        setContextContent(savedContext.fileContent ?? '')
        setSaveStatus(savedMessage)
        onSaved?.(savedContext)
      })
      .catch(() => setSaveStatus('Save failed'))
  }

  const loadContextVariant = (fileName: string | null) => {
    if (!source_key || !fileName) {
      return
    }
    setSelectedContextFile(fileName)
    fetch(`/contextfile/campaign/${source_key}/me/files/${fileName}`)
      .then((response) => requireJson<CampaignContextFile>(response))
      .then((loadedContext: CampaignContextFile) => {
        setContextFile(loadedContext)
        setContextContent(loadedContext.fileContent ?? '')
        setSaveStatus(`Loaded ${fileName}`)
      })
      .catch(() => setSaveStatus(`Could not load ${fileName}`))
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
      .then((response) => requireJson<CampaignContextFile>(response))
      .then((savedContext: CampaignContextFile) => {
        const savedName = savedContext.path?.split(/[\\/]/).at(-1) ?? saveAsName
        setContextFile(savedContext)
        setContextContent(savedContext.fileContent ?? '')
        setSelectedContextFile(savedName)
        setSaveStatus(`Saved as ${savedName}`)
        return fetch(`/contextfile/campaign/${source_key}/me/files`)
      })
      .then((response) => requireJson<unknown>(response))
      .then((loadedFiles) => {
        setContextFiles(
          Array.isArray(loadedFiles) ? (loadedFiles as ContextFileEntry[]) : []
        )
      })
      .catch(() => setSaveStatus('Save as failed'))
  }

  function titleFromDataName(value: string) {
    return (
      value
        .replace(/^hdf5:/, '')
        .replace(/^metadata:/, '')
        .replace(/\{shot_id\}/g, 'shot')
        .split('/')
        .filter(Boolean)
        .at(-1) ?? ''
    )
  }

  const updateSelectedInputs = (nextInputs: string[]) => {
    setSelectedInputs(nextInputs)

    const firstInput = nextInputs[0] ?? ''
    if (!firstInput) {
      return
    }

    const nextTitle = titleFromDataName(firstInput)

    if (nextTitle && !fieldTitleEdited) {
      setFieldTitle(nextTitle)
    }
  }
  return (
    <HomePage
      header={<AppHeader />}
      main={
        <Container fluid py="md">
          <Stack gap="md">
            <Group justify="space-between">
              <Stack gap={2}>
                <Title order={3}>Context builder</Title>
                <Text size="sm" c="dimmed">
                  Build and save one DAMNIT context variable for{' '}
                  {source?.title ?? source_key}. Saved files live on the API
                  host.
                </Text>
              </Stack>
              <Button
                component="a"
                href={`/source/${source_key}`}
                variant="light"
              >
                Back to shots
              </Button>
            </Group>
            <Grid gutter="md">
              <Grid.Col span={{ base: 12, lg: 5 }}>
                <Card withBorder radius={4} p="md">
                  <Stack gap="md">
                    <ContextBuilderDisclosure
                      title="Target and example shot"
                      description="Choose the output scope and the shot used for previews."
                      summary={
                        contextScope === 'set' ? 'Per-set view' : 'Per-shot'
                      }
                    >
                      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                        <Select
                          label="Build target"
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
                            setSelectedShotNumber(
                              value ? Number(value) : undefined
                            )
                          }
                          data={shots.map((shot) => ({
                            value: shot.shot_number.toString(),
                            label: `${shot.shot_number} - ${shot.fired_at}`,
                          }))}
                        />
                      </SimpleGrid>
                      <Text size="xs" c="dimmed">
                        Source: {source?.title ?? source_key}
                      </Text>
                    </ContextBuilderDisclosure>
                    <ContextBuilderPanel
                      tone="blue"
                      title="Column identity"
                      description="The title drives the Python function name unless you unlock a custom one."
                    >
                      <Stack gap="sm">
                        <TextInput
                          label="Column title"
                          value={fieldTitle}
                          onChange={(event) => {
                            const nextTitle = event.currentTarget.value

                            setFieldTitle(nextTitle)
                            setFieldTitleEdited(nextTitle.trim() !== '')
                          }}
                        />
                        <Paper withBorder radius={4} p="sm" bg="white">
                          <Stack gap="xs">
                            <Group justify="space-between" align="flex-start">
                              <Stack gap={0} style={{ minWidth: 0 }}>
                                <Text size="sm" fw={600}>
                                  Python function name
                                </Text>
                                <Text size="xs" c="dimmed">
                                  {fieldNameOverridden
                                    ? 'Custom name is enabled.'
                                    : 'This stays synced to the title.'}
                                </Text>
                              </Stack>
                              <Group gap="xs">
                                {fieldNameOverridden ? (
                                  <Button
                                    size="xs"
                                    variant="subtle"
                                    onClick={() =>
                                      setFieldNameOverridden(false)
                                    }
                                  >
                                    Use title name
                                  </Button>
                                ) : null}
                                <Button
                                  size="xs"
                                  variant="light"
                                  onClick={() => {
                                    if (!fieldNameOverridden) {
                                      setFieldNameOverridden(true)
                                    }
                                  }}
                                >
                                  {fieldNameOverridden
                                    ? 'Custom name'
                                    : 'Override name'}
                                </Button>
                              </Group>
                            </Group>
                            {fieldNameOverridden ? (
                              <TextInput
                                value={fieldName}
                                error={
                                  isValidPythonFunctionName(fieldName)
                                    ? undefined
                                    : 'Use a valid, non-reserved Python function name.'
                                }
                                onChange={(event) =>
                                  setFieldName(
                                    pythonNameFromTitle(
                                      event.currentTarget.value
                                    )
                                  )
                                }
                              />
                            ) : (
                              <Code block>{fieldName}</Code>
                            )}
                          </Stack>
                        </Paper>
                      </Stack>
                    </ContextBuilderPanel>
                    <ContextBuilderPanel
                      tone="indigo"
                      title="Data"
                      description="Choose the metadata or HDF5 data first; valid actions appear below."
                    >
                      {actionCanUseMultipleInputs ? (
                        <Checkbox
                          label={
                            contextScope === 'set'
                              ? 'Compare multiple columns/datasets'
                              : 'Use multiple inputs for custom function'
                          }
                          checked={allowMultipleInputs}
                          onChange={(event) =>
                            setAllowMultipleInputs(event.currentTarget.checked)
                          }
                        />
                      ) : null}
                      {allowMultipleInputs && actionCanUseMultipleInputs ? (
                        <MultiSelect
                          label="Data to use"
                          value={selectedInputs}
                          onChange={updateSelectedInputs}
                          data={inputOptions}
                          searchable
                          clearable
                        />
                      ) : (
                        <Select
                          label="Data to use"
                          value={selectedInputs[0] ?? null}
                          onChange={(value) =>
                            updateSelectedInputs(value ? [value] : [])
                          }
                          data={inputOptions}
                          searchable
                          clearable
                        />
                      )}
                      <Text size="xs" c="dimmed">
                        Selected: {selectedInputSummary}
                      </Text>
                    </ContextBuilderPanel>
                    <ContextBuilderPanel
                      tone="teal"
                      title="Action"
                      description="Choose what this column can do with the selected data."
                    >
                      <Select
                        label={
                          contextScope === 'shot'
                            ? 'What should this column do?'
                            : 'What should this set view do?'
                        }
                        value={fieldKind}
                        onChange={(value) => {
                          if (value) {
                            setFieldKind(value)
                          }
                        }}
                        data={recipeOptions}
                        disabled={!selectedInputs.length}
                      />
                      <Group gap="xs" align="flex-start" wrap="nowrap">
                        <Badge
                          variant="light"
                          color={contextRecipeTone(fieldKind)}
                          radius={4}
                          styles={{ label: { textTransform: 'none' } }}
                          style={{ flexShrink: 0 }}
                        >
                          {contextRecipeLabel(fieldKind)}
                        </Badge>
                        <Text size="xs" c="dimmed">
                          {selectedInputs.length
                            ? recipeHelp
                            : 'Choose data first, then available actions appear here.'}
                        </Text>
                      </Group>
                    </ContextBuilderPanel>
                    {showMongoFields ? (
                      <ContextBuilderPanel
                        tone="yellow"
                        title="Mongo query"
                        description="Write the Mongo-style filter object used to find the row, then choose which field from that row appears in the table."
                      >
                        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                          <TextInput
                            label="Query collection"
                            value={mongoCollection}
                            onChange={(event) =>
                              setMongoCollection(event.currentTarget.value)
                            }
                          />
                          <Card withBorder radius={4} p="sm">
                            <Stack gap={2}>
                              <Text size="xs" c="dimmed">
                                Filter variable
                              </Text>
                              <Code>shot_number</Code>
                            </Stack>
                          </Card>
                        </SimpleGrid>
                        <Textarea
                          label="Mongo filter object"
                          description="Use shot_number from the current shot. The result should be one JSON-like object."
                          minRows={5}
                          value={mongoFilter}
                          onChange={(event) =>
                            setMongoFilter(event.currentTarget.value)
                          }
                        />
                        <Code block>
                          {'{\n  "shot_number": shot_number\n}'}
                        </Code>
                      </ContextBuilderPanel>
                    ) : null}
                    {showFunctionFields ? (
                      <ContextBuilderPanel
                        tone="violet"
                        title="Custom function"
                        description="Combine the selected inputs into the value returned by the column."
                      >
                        <Textarea
                          label="Function expression"
                          minRows={3}
                          value={combineExpression}
                          onChange={(event) =>
                            setCombineExpression(event.currentTarget.value)
                          }
                        />
                      </ContextBuilderPanel>
                    ) : null}
                    <Paper
                      withBorder
                      radius={4}
                      p="sm"
                      bg="var(--mantine-color-gray-0)"
                    >
                      <Text size="sm" c="dimmed">
                        {saveStatus || contextFile?.path || '-'}
                      </Text>
                    </Paper>
                  </Stack>
                </Card>
              </Grid.Col>
              <Grid.Col span={{ base: 12, lg: 7 }}>
                <Stack gap="sm">
                  <ContextBuilderPanel
                    tone="gray"
                    title="Context file and existing columns"
                    description="Choose the destination, manage existing columns, and add the generated variable."
                  >
                    <Group justify="space-between" gap="xs">
                      <Badge variant="light" radius={4}>
                        Destination: {selectedContextFile}
                      </Badge>
                      <Group gap="xs">
                        <Button
                          onClick={appendToContext}
                          disabled={!canSaveGeneratedColumn}
                        >
                          Add to context
                        </Button>
                        <Button onClick={saveManualContext}>
                          Save {selectedContextFile}
                        </Button>
                        <Button
                          onClick={repairContextImports}
                          variant="light"
                          leftSection={<IconRefresh size={16} />}
                        >
                          Repair imports
                        </Button>
                      </Group>
                    </Group>
                    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
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
                      <Paper withBorder radius={4} p="sm">
                        <Stack gap="xs">
                          <Select
                            label="Selected existing column"
                            description="The actions below apply to this column."
                            value={selectedColumnId}
                            onChange={selectAndLoadColumn}
                            data={contextVariables.map((block, index) => ({
                              value: block.id,
                              label: block.title
                                ? `${index + 1}. ${block.title} (${block.name})`
                                : `${index + 1}. ${block.name}`,
                            }))}
                            placeholder="Choose a @Variable"
                            searchable
                          />
                          {selectedContextVariable ? (
                            <Text size="xs" c="dimmed">
                              Position {selectedColumnIndex + 1} of{' '}
                              {contextVariables.length}
                            </Text>
                          ) : null}
                          <Group gap="xs">
                            <Button
                              size="xs"
                              variant="light"
                              onClick={() => {
                                setSelectedColumnId(null)
                                setSaveStatus(
                                  'Existing column deselected. Add to context will create a new column.'
                                )
                              }}
                              disabled={!selectedContextVariable}
                            >
                              Deselect / new column
                            </Button>
                            <Button
                              size="xs"
                              variant="light"
                              onClick={replaceSelectedColumn}
                              disabled={
                                !selectedContextVariable ||
                                !canSaveGeneratedColumn
                              }
                            >
                              Replace selected
                            </Button>
                            <Button
                              size="xs"
                              variant="light"
                              leftSection={<IconArrowUp size={16} />}
                              onClick={() => moveSelectedColumn(-1)}
                              disabled={selectedColumnIndex <= 0}
                            >
                              Move selected up
                            </Button>
                            <Button
                              size="xs"
                              variant="light"
                              leftSection={<IconArrowDown size={16} />}
                              onClick={() => moveSelectedColumn(1)}
                              disabled={
                                selectedColumnIndex < 0 ||
                                selectedColumnIndex >=
                                  contextVariables.length - 1
                              }
                            >
                              Move selected down
                            </Button>
                            <Button
                              size="xs"
                              variant="light"
                              color="red"
                              onClick={deleteSelectedColumn}
                              disabled={!selectedContextVariable}
                            >
                              Delete selected column
                            </Button>
                          </Group>
                        </Stack>
                      </Paper>
                    </SimpleGrid>
                  </ContextBuilderPanel>
                  <ContextBuilderDisclosure
                    title="Preview"
                    description="Visual result and exact technical values in one view."
                    summary={contextRecipeLabel(fieldKind)}
                    open
                  >
                    <Group justify="space-between" gap="sm">
                      <Stack gap={2}>
                        <Text size="xs" c="dimmed">
                          Selected input
                        </Text>
                        <Text size="sm" fw={600}>
                          {selectedInputSummary}
                        </Text>
                      </Stack>
                      <Button
                        onClick={previewColumn}
                        variant="light"
                        disabled={!canBuildColumn}
                      >
                        Preview column
                      </Button>
                    </Group>
                    <Grid gutter="sm">
                      <Grid.Col span={{ base: 12, md: 7 }}>
                        <Paper
                          withBorder
                          radius={4}
                          p="sm"
                          bg="var(--mantine-color-blue-0)"
                          h="100%"
                        >
                          <Stack gap="xs">
                            <Text size="sm" fw={700}>
                              Visual preview
                            </Text>
                            <VisualPreview
                              contextScope={contextScope}
                              datasetPreview={datasetPreview}
                              fieldKind={fieldKind}
                              fieldTitle={fieldTitle}
                              columnDetails={columnDetails}
                              shots={shots}
                            />
                          </Stack>
                        </Paper>
                      </Grid.Col>
                      <Grid.Col span={{ base: 12, md: 5 }}>
                        <Paper
                          withBorder
                          radius={4}
                          p="sm"
                          bg="var(--mantine-color-gray-0)"
                          h="100%"
                        >
                          <Stack gap="xs">
                            <Text size="sm" fw={700}>
                              Technical values
                            </Text>
                            <Text size="xs" c="dimmed">
                              Exact values used to build the visual result.
                            </Text>
                            <Code block>
                              {columnDetails || 'Click Preview column.'}
                            </Code>
                          </Stack>
                        </Paper>
                      </Grid.Col>
                    </Grid>
                  </ContextBuilderDisclosure>
                  <ContextBuilderDisclosure
                    title="Generated variable"
                    description="Review or edit the generated Python before saving it."
                    summary={generatedEditorCompact ? 'Compact' : 'Expanded'}
                  >
                    <Group justify="flex-end" gap="xs">
                      <Button
                        variant="subtle"
                        onClick={() =>
                          setGeneratedEditorCompact((compact) => !compact)
                        }
                      >
                        {generatedEditorCompact
                          ? 'Expand editor'
                          : 'Compact editor'}
                      </Button>
                    </Group>
                    <Textarea
                      value={generatedDraft}
                      onChange={(event) =>
                        setGeneratedDraft(event.currentTarget.value)
                      }
                      autosize
                      minRows={generatedEditorCompact ? 6 : 18}
                      maxRows={generatedEditorCompact ? 10 : 28}
                      styles={{
                        input: {
                          fontFamily:
                            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                          fontSize: '12px',
                        },
                      }}
                    />
                  </ContextBuilderDisclosure>
                  <ContextBuilderDisclosure
                    title="Manual context editor"
                    description={
                      contextFile?.path ?? 'Edit the full context file.'
                    }
                    summary={selectedContextFile}
                  >
                    <Group justify="flex-end">
                      <Button onClick={saveManualContext}>
                        Save {selectedContextFile}
                      </Button>
                    </Group>
                    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
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
                  </ContextBuilderDisclosure>
                </Stack>
              </Grid.Col>
            </Grid>
          </Stack>
        </Container>
      }
    />
  )
}
