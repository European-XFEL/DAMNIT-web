import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
  useMantineTheme,
} from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { IconRefresh } from '@tabler/icons-react'
import { useParams, useSearchParams } from 'react-router'

import { HomePage } from '@damnit-frontend/ui'

import type {
  ColumnSuggestion,
  HZDRShot,
  HZDRShotDetail,
  HZDRSource,
  CampaignContextFile,
  ContextFileEntry,
  SelectOptionGroup,
} from '../types'
import { AppHeader } from '../components/AppHeader'
import { ColumnPreview } from '../components/ColumnPreview'
import type { ColumnPreviewInput } from '../components/ColumnPreview'
import {
  ContextAssistant,
  SuggestionDetail,
} from '../components/ContextAssistant'
import { ContextColumnList } from '../components/ContextColumnList'
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
  getNestedMetadataValue,
  metadataFieldLabel,
} from '../utils/metadata'
import {
  campaignTitle,
  formatContextValue,
  formatSelectedInput,
  formatShotLabel,
} from '../utils/format'
import { useDatasetPreview } from '../utils/columnPreview'
import { requireJson } from '../utils/api'
import {
  appendSuggestionBlocks,
  datasetSuggestions,
  inputFormState,
  isAlreadyInContext,
  loadIgnoredSuggestions,
  saveIgnoredSuggestions,
  suggestionFormState,
} from '../utils/contextAssist'

type BuilderMode = 'help' | 'build'

/** What Customise and a deep link load into the builder form. */
type BuilderFormState = {
  fieldKind: string
  selectedInputs: string[]
  fieldTitle: string
}

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
  const [selectedShotIndex, setSelectedShotIndex] = useState<number>()
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
  const [saveStatus, setSaveStatus] = useState('')
  const [selectedColumnId, setSelectedColumnId] = useState<string | null>(null)
  const [generatedEditorCompact, setGeneratedEditorCompact] = useState(true)
  const [mode, setMode] = useState<BuilderMode>('help')
  const [serverSuggestions, setServerSuggestions] = useState<
    ColumnSuggestion[]
  >([])
  const [suggestionsLoading, setSuggestionsLoading] = useState(true)
  const [suggestionsError, setSuggestionsError] = useState('')
  const [ignoredSuggestionIds, setIgnoredSuggestionIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [selectedSuggestionId, setSelectedSuggestionId] = useState<
    string | null
  >(null)
  const [checkedSuggestionIds, setCheckedSuggestionIds] = useState<string[]>([])
  const [shotsLoaded, setShotsLoaded] = useState(false)
  const [shotDetailLoadedPath, setShotDetailLoadedPath] = useState<string>()
  const [deepLinkNote, setDeepLinkNote] = useState('')
  const [searchParams] = useSearchParams()
  // ?add=<input> (and optionally &shot=<shot key or number>): open the
  // builder with that input chosen, e.g. from a shot's "Add as column".
  const addInput = searchParams.get('add')
  const addShot = searchParams.get('shot')
  const handledAddRef = useRef<string | null>(null)
  const appliedShotRef = useRef<string | null>(null)
  const theme = useMantineTheme()
  const wide = useMediaQuery(`(min-width: ${theme.breakpoints.lg})`) ?? false

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
        // A deep link's shot (&shot=) stays the example shot even when the
        // shots load again (a second load would otherwise reset it to the first).
        const linked = addShot
          ? nextShots.findIndex(
              (shot) =>
                shot.shot_key === addShot ||
                String(shot.shot_number) === addShot
            )
          : -1
        setSelectedShotIndex(nextShots.length ? Math.max(linked, 0) : undefined)
      })
      .catch(() => setSaveStatus('Could not load source shots.'))
      .finally(() => setShotsLoaded(true))
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
  }, [addShot, source_key])

  // Suggestions for this campaign only: a late answer for the campaign the
  // page showed before is dropped, so Add never writes its blocks here.
  useEffect(() => {
    if (!source_key) {
      return
    }
    let active = true
    setIgnoredSuggestionIds(loadIgnoredSuggestions(source_key))
    setServerSuggestions([])
    setSuggestionsLoading(true)
    setSuggestionsError('')
    fetch(`/contextfile/campaign/${source_key}/assist`)
      .then((response) =>
        requireJson<{ suggestions?: ColumnSuggestion[] }>(response)
      )
      .then((loaded) => {
        if (!active) return
        setServerSuggestions(
          Array.isArray(loaded.suggestions) ? loaded.suggestions : []
        )
      })
      .catch(() => {
        if (!active) return
        setSuggestionsError(
          'Could not load suggestions for this campaign. You can still build columns yourself.'
        )
      })
      .finally(() => {
        if (active) setSuggestionsLoading(false)
      })
    return () => {
      active = false
    }
  }, [source_key])

  // Select a row rather than a shot number: numbers may repeat across days,
  // and older catalogs may not include canonical shot keys.
  const selectedShot =
    selectedShotIndex === undefined ? undefined : shots[selectedShotIndex]
  const shotDetailPath =
    source_key && selectedShot
      ? `/metadata/hzdr/sources/${source_key}/shots/${
          selectedShot.shot_key
            ? `by-key/${encodeURIComponent(selectedShot.shot_key)}`
            : selectedShot.shot_number
        }`
      : undefined

  useEffect(() => {
    setShotDetail(undefined)
    if (!shotDetailPath) {
      return
    }
    let active = true
    fetch(shotDetailPath)
      .then((response) => requireJson<HZDRShotDetail>(response))
      .then((detail) => {
        if (active) setShotDetail(detail)
      })
      .catch(() => {
        if (active) setShotDetail(undefined)
      })
      .finally(() => {
        if (active) setShotDetailLoadedPath(shotDetailPath)
      })
    return () => {
      active = false
    }
  }, [shotDetailPath])

  useEffect(() => {
    if (!fieldNameOverridden) {
      setFieldName(pythonNameFromTitle(fieldTitle))
    }
  }, [fieldNameOverridden, fieldTitle])

  const metadataKeys = useMemo(
    () =>
      contextScope === 'set'
        ? getNumericMetadataKeys(shots)
        : Array.from(
            new Set(shots.flatMap((shot) => flattenObjectKeys(shot.metadata)))
          ).sort(),
    [contextScope, shots]
  )
  const metadataOptions = useMemo(
    () =>
      metadataKeys.map((key) => ({
        value: `metadata:${key}`,
        label: `${metadataFieldLabel(key)} (${shots.filter((shot) => getNestedMetadataValue(shot.metadata, key) != null).length}/${shots.length} shots)`,
      })),
    [metadataKeys, shots]
  )
  // The shot whose datasets are listed: per-shot previews read its own copy.
  const exampleShotMetadataId = shotDetail?.shot.metadata?.shot_id
  const exampleShotId =
    typeof exampleShotMetadataId === 'string'
      ? exampleShotMetadataId
      : undefined
  const datasetOptions = useMemo(
    () =>
      buildHdf5DatasetOptions(
        shotDetail?.hdf5_datasets ?? [],
        contextScope,
        exampleShotId
      ),
    [contextScope, exampleShotId, shotDetail?.hdf5_datasets]
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
  const selectedMetadataPath = selectedInputs
    .find((value) => value.startsWith('metadata:'))
    ?.slice(9)
  const selectedMetadataValue =
    selectedMetadataPath && selectedShot
      ? getNestedMetadataValue(selectedShot.metadata, selectedMetadataPath)
      : undefined
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
  const contextVariables = useMemo(
    () => parseContextVariableBlocks(contextContent),
    [contextContent]
  )
  const selectedColumnIndex = contextVariables.findIndex(
    (block) => block.id === selectedColumnId
  )
  const selectedContextVariable =
    selectedColumnIndex >= 0 ? contextVariables[selectedColumnIndex] : undefined
  const exampleShotLabel = selectedShot
    ? formatShotLabel(selectedShot.shot_number, selectedShot.fired_at)
    : 'none'
  const shotDatasetOptions = useMemo(
    () =>
      buildHdf5DatasetOptions(
        shotDetail?.hdf5_datasets ?? [],
        'shot',
        exampleShotId
      ),
    [exampleShotId, shotDetail?.hdf5_datasets]
  )
  const shotDatasetSuggestions = useMemo(
    () => datasetSuggestions(shotDatasetOptions, exampleShotLabel),
    [exampleShotLabel, shotDatasetOptions]
  )
  const exampleShotOptions = useMemo(
    () =>
      shots.map((shot, index) => ({
        value: index.toString(),
        label: formatShotLabel(shot.shot_number, shot.fired_at),
      })),
    [shots]
  )
  // Sorted once per change of the file, the list or what is ignored (not on
  // every render, e.g. each keystroke elsewhere on the page).
  const { openSuggestions, inContextCount, ignoredOpenCount } = useMemo(() => {
    const ignored = new Set(ignoredSuggestionIds)
    const open: ColumnSuggestion[] = []
    let inContext = 0
    let ignoredOpen = 0
    for (const suggestion of [
      ...serverSuggestions,
      ...shotDatasetSuggestions,
    ]) {
      if (isAlreadyInContext(suggestion, contextContent)) inContext += 1
      else if (ignored.has(suggestion.id)) ignoredOpen += 1
      else open.push(suggestion)
    }
    return {
      openSuggestions: open,
      inContextCount: inContext,
      ignoredOpenCount: ignoredOpen,
    }
  }, [
    contextContent,
    ignoredSuggestionIds,
    serverSuggestions,
    shotDatasetSuggestions,
  ])
  // On wide screens the right column always previews one suggestion: the
  // one picked, else the first. On narrow ones it opens under its row.
  const selectedSuggestion =
    openSuggestions.find(
      (suggestion) => suggestion.id === selectedSuggestionId
    ) ?? (wide ? openSuggestions[0] : undefined)
  const selectSuggestion = useCallback(
    (id: string) =>
      setSelectedSuggestionId((current) =>
        !wide && current === id ? null : id
      ),
    [wide]
  )
  const showMongoFields = fieldKind === 'mongo-filter'
  const showFunctionFields = fieldKind === 'function'
  const actionCanUseMultipleInputs = fieldKind === 'function'
  // The builder's preview follows the form: what the column would show on
  // the example shot, read again whenever the data or the shot changes.
  const selectedDatasetOption = selectedInputs
    .map((value) => datasetOptions.find((option) => option.value === value))
    .find(Boolean)
  const previewsDataset = [
    'hdf5',
    'lineout-preview',
    'image-preview',
    'plotly-trend',
  ].includes(fieldKind)
  const builderDataset = useDatasetPreview(
    source_key,
    selectedShot,
    mode === 'build' && previewsDataset
      ? selectedDatasetOption?.previewName
      : undefined
  )
  const builderPreviewInput: ColumnPreviewInput = !selectedInputs.length
    ? {
        source: 'computed',
        note: 'Choose data to see what this column will show.',
      }
    : fieldKind === 'metadata' && selectedMetadataPath
      ? { source: 'metadata', field: selectedMetadataPath, type: 'auto' }
      : previewsDataset && selectedDatasetOption
        ? { source: 'hdf5', display: fieldKind, ...builderDataset }
        : fieldKind === 'function'
          ? {
              source: 'computed',
              note: 'A custom function is calculated when the shot table loads, so its value cannot be shown here. Check each input first by previewing it as its own column.',
            }
          : {
              source: 'computed',
              note: 'This value is looked up in MongoDB when the shot table loads, so it cannot be shown here.',
            }
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

  // Append one @Variable block (imports first) to the destination file and
  // save it: the builder's "Add to context" and the assistant's "Add this
  // column" both go through here.
  const appendBlockToContext = (draft: string, savedMessage: string) => {
    if (!source_key || !contextFile) {
      return
    }
    const { imports, body } = splitPythonImportBlock(draft)
    if (!extractPythonFunctionName(body)) {
      setSaveStatus('Generated variable needs a valid Python function name.')
      return
    }
    setSaveStatus('Saving...')
    setSaving(true)
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
        setSaveStatus(savedMessage)
      })
      .catch(() => setSaveStatus('Save failed'))
      .finally(() => setSaving(false))
  }

  const appendToContext = () => {
    if (!canBuildColumn) {
      setSaveStatus('Choose data before adding a column.')
      return
    }
    appendBlockToContext(generatedDraft, `Saved to ${selectedContextFile}`)
  }

  const addSuggestion = (suggestion: ColumnSuggestion) => {
    appendBlockToContext(
      suggestion.block,
      `Added “${suggestion.title}” to ${selectedContextFile}.`
    )
  }

  // All ticked suggestions in one save: the file is written once, so a
  // failure adds none of them.
  const addSuggestions = (picked: ColumnSuggestion[]) => {
    if (!source_key || !contextFile || !picked.length) {
      return
    }
    const { fileContent, added, skipped } = appendSuggestionBlocks(
      contextContent,
      picked
    )
    const skippedNote = skipped.length
      ? ` Skipped ${skipped.length} already in the file.`
      : ''
    if (!added.length) {
      setSaveStatus(`Nothing to add.${skippedNote}`)
      return
    }
    const columns = `${added.length} column${added.length === 1 ? '' : 's'}`
    const addedIds = new Set(added.map((suggestion) => suggestion.id))
    setSaveStatus(`Adding ${columns}...`)
    setSaving(true)
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
        setCheckedSuggestionIds((current) =>
          current.filter((id) => !addedIds.has(id))
        )
        setSaveStatus(
          `Added ${columns} to ${selectedContextFile}: ${added
            .map((suggestion) => suggestion.title)
            .join(', ')}.${skippedNote}`
        )
      })
      .catch(() =>
        setSaveStatus(
          `Save failed: none of the ${columns} was added to ${selectedContextFile}.`
        )
      )
      .finally(() => setSaving(false))
  }

  const updateIgnoredSuggestions = (ids: string[]) => {
    setIgnoredSuggestionIds(ids)
    if (source_key) saveIgnoredSuggestions(source_key, ids)
  }

  const ignoreSuggestions = (picked: ColumnSuggestion[]) => {
    const ids = new Set(picked.map((suggestion) => suggestion.id))
    updateIgnoredSuggestions([...new Set([...ignoredSuggestionIds, ...ids])])
    setCheckedSuggestionIds((current) => current.filter((id) => !ids.has(id)))
    setSaveStatus(
      picked.length === 1
        ? `Ignored “${picked[0].title}”.`
        : `Ignored ${picked.length} suggestions.`
    )
  }

  const ignoreSuggestion = (suggestion: ColumnSuggestion) =>
    ignoreSuggestions([suggestion])

  // Setters only, so this stays the same function across renders.
  const loadIntoBuilder = useCallback(
    (state: BuilderFormState, message: string) => {
      setMode('build')
      setSelectedColumnId(null)
      setContextScope('shot')
      setAllowMultipleInputs(false)
      setSelectedInputs(state.selectedInputs)
      setFieldKind(state.fieldKind)
      setFieldTitle(state.fieldTitle)
      setFieldTitleEdited(true)
      setFieldNameOverridden(false)
      setSaveStatus(message)
    },
    []
  )

  const customiseSuggestion = (suggestion: ColumnSuggestion) => {
    loadIntoBuilder(
      suggestionFormState(suggestion),
      `Loaded “${suggestion.title}” into the builder. Adjust it, preview, then Add to context.`
    )
  }

  // A deep link's example shot first, so its datasets are the ones offered.
  useEffect(() => {
    if (!addShot || !shotsLoaded || appliedShotRef.current === addShot) {
      return
    }
    appliedShotRef.current = addShot
    const index = shots.findIndex(
      (shot) =>
        shot.shot_key === addShot || String(shot.shot_number) === addShot
    )
    if (index >= 0) setSelectedShotIndex(index)
  }, [addShot, shots, shotsLoaded])

  const deepLinkMetadataKeys = useMemo(
    () =>
      addInput?.startsWith('metadata:')
        ? new Set(shots.flatMap((shot) => flattenObjectKeys(shot.metadata)))
        : new Set<string>(),
    [addInput, shots]
  )

  // ?add=: once the shots (and, for a dataset, the example shot's datasets)
  // are known, open the builder with that input, or say it was not found.
  useEffect(() => {
    if (!addInput || handledAddRef.current === addInput || !shotsLoaded) {
      return
    }
    if (addShot && appliedShotRef.current !== addShot) {
      return
    }
    if (
      addInput.startsWith('hdf5:') &&
      shotDetailPath &&
      shotDetailLoadedPath !== shotDetailPath
    ) {
      return
    }
    handledAddRef.current = addInput
    const state = inputFormState(addInput, {
      metadataKeys: deepLinkMetadataKeys,
      datasetOptions: shotDatasetOptions,
    })
    if (!state) {
      setDeepLinkNote(
        `Could not find “${formatSelectedInput(addInput)}” in this campaign. Pick a suggestion or build the column yourself.`
      )
      return
    }
    setDeepLinkNote('')
    loadIntoBuilder(
      state,
      `Loaded “${state.fieldTitle}” into the builder. Check the preview, then Add to context.`
    )
  }, [
    addInput,
    addShot,
    deepLinkMetadataKeys,
    loadIntoBuilder,
    shotDatasetOptions,
    shotDetailLoadedPath,
    shotDetailPath,
    shotsLoaded,
  ])

  const editColumn = (columnId: string) => {
    setMode('build')
    selectAndLoadColumn(columnId)
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

  const deleteColumn = (columnId: string) => {
    const selectedBlock = contextVariables.find(
      (block) => block.id === columnId
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
    if (columnId === selectedColumnId) setSelectedColumnId(null)
  }

  const moveColumn = (columnId: string, direction: -1 | 1) => {
    const columnIndex = contextVariables.findIndex(
      (block) => block.id === columnId
    )
    const targetIndex = columnIndex + direction
    if (
      columnIndex < 0 ||
      targetIndex < 0 ||
      targetIndex >= contextVariables.length
    ) {
      setSaveStatus('That column cannot move further.')
      return
    }
    const reorderedBlocks = [...contextVariables]
    const [selectedBlock] = reorderedBlocks.splice(columnIndex, 1)
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

  const loadSuggestedContext = () => {
    if (!source_key) {
      return
    }
    fetch(`/contextfile/campaign/${source_key}/suggested`)
      .then((response) => requireJson<{ fileContent: string }>(response))
      .then((suggested) => {
        setContextContent(suggested.fileContent)
        setSaveStatus(
          "Loaded suggested columns from this campaign's LabFrog records. Review, then save."
        )
      })
      .catch(() => setSaveStatus('Could not load suggested columns'))
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

  // The shot table always runs context.py, so a variant becomes active by
  // being written there. The file it replaces is kept as context_previous.py.
  const makeContextActive = () => {
    if (!source_key || selectedContextFile === 'context.py') {
      return
    }
    const base = `/contextfile/campaign/${source_key}/me/files`
    const put = (name: string, fileContent: string) =>
      fetch(`${base}/${name}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileContent }),
      }).then((response) => requireJson<CampaignContextFile>(response))
    const variant = selectedContextFile
    setSaveStatus(`Making ${variant} active...`)
    fetch(`${base}/context.py`)
      .then((response) => requireJson<CampaignContextFile>(response))
      .then((previous) =>
        put('context_previous.py', previous.fileContent ?? '')
      )
      .then(() => put('context.py', contextContent))
      .then((activeContext) => {
        setContextFile(activeContext)
        setContextContent(activeContext.fileContent ?? '')
        setSelectedContextFile('context.py')
        setSaveStatus(
          `${variant} is now active (context.py); the file it replaced is context_previous.py.`
        )
        return fetch(base)
      })
      .then((response) => requireJson<unknown>(response))
      .then((loadedFiles) => {
        setContextFiles(
          Array.isArray(loadedFiles) ? (loadedFiles as ContextFileEntry[]) : []
        )
      })
      .catch(() => setSaveStatus(`Could not make ${variant} active`))
  }

  function titleFromDataName(value: string) {
    if (value.startsWith('metadata:')) return metadataFieldLabel(value.slice(9))
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
    if (
      ['metadata:', 'hdf5:'].some(
        (prefix) =>
          nextInputs.filter((input) => input.startsWith(prefix)).length > 1
      )
    ) {
      setSaveStatus(
        'Choose one shot field and one HDF5 dataset for a custom calculation. Add separate columns for other fields.'
      )
      return
    }
    setSelectedInputs(nextInputs)
    setSaveStatus('')
    const hasMetadata = nextInputs.some((input) =>
      input.startsWith('metadata:')
    )
    const hasDataset = nextInputs.some((input) => input.startsWith('hdf5:'))
    setCombineExpression(
      hasMetadata && hasDataset
        ? 'np.nanmean(hdf5_values) * float(metadata_value)'
        : hasDataset
          ? 'np.nanmean(hdf5_values)'
          : 'metadata_value'
    )

    const firstInput = nextInputs[0] ?? ''
    if (!firstInput) {
      return
    }

    const nextTitle = titleFromDataName(firstInput)

    if (nextTitle && !fieldTitleEdited) {
      setFieldTitle(nextTitle)
    }
  }
  const campaignName = campaignTitle(source?.title) || source_key
  const suggestionDetail = selectedSuggestion ? (
    <SuggestionDetail
      key={selectedSuggestion.id}
      suggestion={selectedSuggestion}
      busy={saving || !contextFile}
      sourceKey={source_key}
      exampleShot={selectedShot}
      shots={shots}
      onAdd={addSuggestion}
      onIgnore={ignoreSuggestion}
      onCustomise={customiseSuggestion}
    />
  ) : null
  return (
    <HomePage
      header={<AppHeader />}
      main={
        <Container fluid py="md">
          <Stack gap="md">
            <Group justify="space-between">
              <Stack gap={2}>
                <Title order={3}>Add columns</Title>
                <Text size="sm" c="dimmed">
                  Choose columns for the {campaignName} shot table: tick
                  suggestions, or build one yourself and check it on an example
                  shot.
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
                    {deepLinkNote ? (
                      <Text size="sm" c="orange.8" role="status">
                        {deepLinkNote}
                      </Text>
                    ) : null}
                    <SegmentedControl
                      fullWidth
                      aria-label="How to add columns"
                      value={mode}
                      onChange={(value) => setMode(value as BuilderMode)}
                      data={[
                        { value: 'help', label: 'Help me choose' },
                        { value: 'build', label: 'Build a column myself' },
                      ]}
                    />
                    <ContextBuilderDisclosure
                      title="Target and example shot"
                      description="The example shot is used to check values before saving."
                      open
                      summary={
                        contextScope === 'set' ? 'Per-set view' : 'Per-shot'
                      }
                    >
                      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                        <Select
                          label="Use column for"
                          value={contextScope}
                          onChange={(value) => setContextScope(value ?? 'shot')}
                          data={[
                            {
                              value: 'shot',
                              label: 'Table values for each shot',
                            },
                            {
                              value: 'set',
                              label: 'Numeric trend across shots',
                            },
                          ]}
                        />
                        <Select
                          label="Example shot"
                          searchable
                          value={selectedShotIndex?.toString() ?? null}
                          onChange={(value) =>
                            setSelectedShotIndex(
                              value ? Number(value) : undefined
                            )
                          }
                          data={exampleShotOptions}
                        />
                      </SimpleGrid>
                      <Text size="xs" c="dimmed">
                        Campaign: {campaignName}
                      </Text>
                    </ContextBuilderDisclosure>
                    <Paper
                      withBorder
                      radius={4}
                      p="sm"
                      bg="var(--mantine-color-gray-0)"
                    >
                      <Text size="sm" c="dimmed" role="status">
                        {saveStatus || contextFile?.path || '-'}
                      </Text>
                    </Paper>
                    {mode === 'help' ? (
                      <ContextAssistant
                        suggestions={openSuggestions}
                        loading={suggestionsLoading}
                        error={suggestionsError}
                        destination={selectedContextFile}
                        busy={saving || !contextFile}
                        ignoredCount={ignoredOpenCount}
                        addedCount={inContextCount}
                        selectedId={selectedSuggestion?.id ?? null}
                        onSelect={selectSuggestion}
                        checkedIds={checkedSuggestionIds}
                        onCheckedChange={setCheckedSuggestionIds}
                        onAddMany={addSuggestions}
                        onIgnoreMany={ignoreSuggestions}
                        onRestoreIgnored={() => updateIgnoredSuggestions([])}
                        selectedDetail={wide ? undefined : suggestionDetail}
                        shots={shots}
                      />
                    ) : null}
                    {mode === 'build' ? (
                      <>
                        <ContextBuilderPanel
                          tone="indigo"
                          title="1. Choose data"
                          description="Fields are grouped by source. Counts show how many shots contain each field."
                        >
                          {actionCanUseMultipleInputs ? (
                            <Checkbox
                              label="Combine one field with one HDF5 dataset"
                              checked={allowMultipleInputs}
                              onChange={(event) =>
                                setAllowMultipleInputs(
                                  event.currentTarget.checked
                                )
                              }
                            />
                          ) : null}
                          {allowMultipleInputs && actionCanUseMultipleInputs ? (
                            <MultiSelect
                              label="Data to use"
                              maxValues={2}
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
                          {selectedMetadataPath ? (
                            <Paper withBorder p="xs">
                              <Text size="sm" fw={600}>
                                Value on example shot
                              </Text>
                              <Code>
                                {selectedMetadataValue == null
                                  ? 'Not available on this shot'
                                  : formatContextValue(selectedMetadataValue)}
                              </Code>
                              <Text size="xs" c="dimmed">
                                Field: {selectedMetadataPath}
                              </Text>
                              {selectedMetadataValue == null ? (
                                <Button
                                  size="xs"
                                  variant="subtle"
                                  onClick={() => {
                                    const index = shots.findIndex(
                                      (shot) =>
                                        getNestedMetadataValue(
                                          shot.metadata,
                                          selectedMetadataPath
                                        ) != null
                                    )
                                    if (index >= 0) setSelectedShotIndex(index)
                                  }}
                                >
                                  Use a shot with this field
                                </Button>
                              ) : null}
                            </Paper>
                          ) : null}
                        </ContextBuilderPanel>
                        <ContextBuilderPanel
                          tone="teal"
                          title="2. Choose display"
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
                        <ContextBuilderPanel
                          tone="blue"
                          title="3. Name column"
                          description="Choose the name that will appear in the shot table."
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
                            <ContextBuilderDisclosure
                              title="Advanced naming"
                              description="Override the automatically generated Python name if needed."
                            >
                              <Stack gap="xs">
                                <Group
                                  justify="space-between"
                                  align="flex-start"
                                >
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
                            </ContextBuilderDisclosure>
                          </Stack>
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
                      </>
                    ) : null}
                  </Stack>
                </Card>
              </Grid.Col>
              <Grid.Col span={{ base: 12, lg: 7 }}>
                <Stack gap="sm">
                  {mode === 'help' && wide ? (
                    <div
                      style={{
                        position: 'sticky',
                        top: 'calc(var(--app-shell-header-offset, 0rem) + var(--mantine-spacing-md))',
                        zIndex: 2,
                        maxHeight:
                          'calc(100vh - var(--app-shell-header-offset, 0rem) - var(--app-shell-footer-offset, 0rem) - 2 * var(--mantine-spacing-md))',
                        overflowY: 'auto',
                        background: 'var(--mantine-color-body)',
                      }}
                    >
                      {suggestionDetail ?? (
                        <Paper withBorder radius={4} p="sm">
                          <Text size="sm" c="dimmed">
                            Select a suggestion to preview it here.
                          </Text>
                        </Paper>
                      )}
                    </div>
                  ) : null}
                  <ContextBuilderPanel
                    tone="gray"
                    title="Context file and existing columns"
                    description="Choose the file, then edit, reorder or delete its columns."
                  >
                    <Group justify="space-between" gap="xs">
                      <Badge variant="light" radius={4}>
                        Destination: {selectedContextFile}
                      </Badge>
                      <Group gap="xs">
                        {mode === 'build' ? (
                          <Button
                            onClick={appendToContext}
                            disabled={!canSaveGeneratedColumn}
                          >
                            Add to context
                          </Button>
                        ) : null}
                        {mode === 'build' && selectedContextVariable ? (
                          <Button
                            variant="light"
                            onClick={replaceSelectedColumn}
                            disabled={!canSaveGeneratedColumn}
                          >
                            Replace {selectedContextVariable.title}
                          </Button>
                        ) : null}
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
                    <Group gap="xs" align="flex-end">
                      <Select
                        label="Context file"
                        description="The shot table uses the active file, context.py."
                        value={selectedContextFile}
                        onChange={loadContextVariant}
                        data={contextFiles.map((entry) => ({
                          value: entry.name,
                          label: entry.active
                            ? `${entry.name} (active)`
                            : entry.name,
                        }))}
                        searchable
                        style={{ flex: 1, minWidth: 200 }}
                      />
                      {selectedContextFile !== 'context.py' ? (
                        <Button
                          variant="light"
                          onClick={makeContextActive}
                          title="Write this variant (as shown in the editor) to context.py, keeping the current context.py as context_previous.py."
                        >
                          Make {selectedContextFile} active
                        </Button>
                      ) : null}
                    </Group>
                    <Stack gap={4}>
                      <Text size="sm" fw={600}>
                        Columns in {selectedContextFile} (
                        {contextVariables.length})
                      </Text>
                      <ContextColumnList
                        columns={contextVariables}
                        selectedId={selectedContextVariable?.id ?? null}
                        onEdit={editColumn}
                        onStopEditing={() => {
                          setSelectedColumnId(null)
                          setSaveStatus(
                            'Stopped editing. Add to context will create a new column.'
                          )
                        }}
                        onMove={moveColumn}
                        onDelete={deleteColumn}
                      />
                    </Stack>
                  </ContextBuilderPanel>
                  {mode === 'build' ? (
                    <>
                      <ContextBuilderDisclosure
                        title="Preview"
                        description="What this column will show for the example shot, and across the campaign. It follows your choices as you make them."
                        summary={contextRecipeLabel(fieldKind)}
                        open
                      >
                        <Text size="xs" c="dimmed">
                          Data: {selectedInputSummary}
                        </Text>
                        <ColumnPreview
                          title={fieldTitle}
                          input={builderPreviewInput}
                          exampleShot={selectedShot}
                          shots={shots}
                        />
                      </ContextBuilderDisclosure>
                      <ContextBuilderDisclosure
                        title="Generated variable"
                        description="Review or edit the generated Python before saving it."
                        summary={
                          generatedEditorCompact ? 'Compact' : 'Expanded'
                        }
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
                    </>
                  ) : null}
                  <ContextBuilderDisclosure
                    title="Manual context editor"
                    description={
                      contextFile?.path ?? 'Edit the full context file.'
                    }
                    summary={selectedContextFile}
                  >
                    <Group justify="flex-end">
                      <Button
                        variant="light"
                        onClick={loadSuggestedContext}
                        title="Replace the editor's text with a few columns from what this campaign's LabFrog records hold. Nothing is saved until you press Save."
                      >
                        Load suggested columns
                      </Button>
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
