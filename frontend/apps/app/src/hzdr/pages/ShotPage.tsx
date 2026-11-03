import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Checkbox,
  Code,
  Container,
  Grid,
  Group,
  Loader,
  ScrollArea,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { Link, useParams } from 'react-router'

import { history, HomePage } from '@damnit-frontend/ui'

import type {
  HZDRShot,
  HZDRShotDetail,
  HZDRSource,
  HZDRContextResults,
  HZDRSelectedCell,
  HZDRFilterOperator,
  HZDRSortState,
} from '../types'
import { AppHeader } from '../components/AppHeader'
import { CampaignCards } from '../components/CampaignCards'
import {
  SortableHeader,
  SelectedCellPanel,
  StatusBadge,
  HZDRShotSetsPanel,
  ShotDetailPanel,
  DetailsSection,
} from '../components/ShotTable'
import { cellButtonStyle } from '../components/styles'
import { TruncatedCell, ContextCellContent } from '../components/previews'
import {
  shotMatchesTableFilter,
  compareHZDRShotsForTableSort,
  buildContextRowsByShot,
  buildShotDayLabels,
  getShotRowKey,
  isScalarContextValue,
} from '../utils/filter'
import {
  formatFiredAt,
  isMissingContextValueError,
  formatContextValue,
} from '../utils/format'
import { getNestedMetadataValue, formatTargetLabel } from '../utils/metadata'
import { requireJson } from '../utils/api'
import { summarizeShotDataSources } from '../utils/data-sources'
import { formatShotLabel, toTrendValue } from '../utils/shot-key'
import { classifyShotVersions, getShotVersion } from '../utils/shot-versions'
import {
  SHOT_TABLE_COLUMNS,
  SHOT_TABLE_COLUMN_WIDTHS,
  CONTEXT_COLUMN_WIDTH,
  loadShotTableView,
  saveShotTableView,
} from '../utils/table-view'

export function HZDRShotPage() {
  const { source_key } = useParams()
  const [source, setSource] = useState<HZDRSource>()
  const [shots, setShots] = useState<HZDRShot[]>([])
  const [availableSources, setAvailableSources] = useState<HZDRSource[]>([])
  // The selected row (getShotRowKey): shot numbers repeat across days.
  const [selectedRowKey, setSelectedRowKey] = useState<string>()
  const [shotDetail, setShotDetail] = useState<HZDRShotDetail>()
  const [contextResults, setContextResults] = useState<HZDRContextResults>()
  const [filterColumn, setFilterColumn] = useState('all')
  const [filterOperator, setFilterOperator] =
    useState<HZDRFilterOperator>('includes')
  const [filterValue, setFilterValue] = useState('')
  const [sortState, setSortState] = useState<HZDRSortState>({
    column: 'shot_number',
    direction: 'asc',
  })
  const [hiddenTableColumns, setHiddenTableColumns] = useState<string[]>([])
  const [showHistoricalVersions, setShowHistoricalVersions] = useState(false)
  const [selectedCell, setSelectedCell] = useState<HZDRSelectedCell>()
  // One page-level state for the shots list only; the secondary fetches
  // (source header, available sources, context results, shot detail) fail soft.
  const [dataState, setDataState] = useState<'loading' | 'ready' | 'error'>(
    'loading'
  )
  // Set by the view-loading effect so the save effect skips the render pass
  // in which the persisted view is applied (or defaults are restored) — the
  // filter/sort states still hold the previous source's values on that pass.
  const skipNextViewSave = useRef(false)

  useEffect(() => {
    if (!source_key) {
      return
    }
    skipNextViewSave.current = true
    const savedView = loadShotTableView(source_key)
    setFilterColumn(savedView?.filterColumn ?? 'all')
    setFilterOperator(savedView?.filterOperator ?? 'includes')
    setFilterValue(savedView?.filterValue ?? '')
    setSortState(
      savedView?.sortState ?? { column: 'shot_number', direction: 'asc' }
    )
    setHiddenTableColumns(savedView?.hiddenTableColumns ?? [])
    setShowHistoricalVersions(savedView?.showHistoricalVersions ?? false)
  }, [source_key])

  useEffect(() => {
    if (!source_key) {
      return
    }
    if (skipNextViewSave.current) {
      skipNextViewSave.current = false
      return
    }
    saveShotTableView(source_key, {
      filterColumn,
      filterOperator,
      filterValue,
      sortState,
      hiddenTableColumns,
      showHistoricalVersions,
    })
  }, [
    source_key,
    filterColumn,
    filterOperator,
    filterValue,
    sortState,
    hiddenTableColumns,
    showHistoricalVersions,
  ])

  const loadShotPageData = useCallback(() => {
    if (!source_key) {
      return
    }

    setDataState('loading')

    fetch(`/metadata/hzdr/sources/${source_key}`)
      .then((response) => requireJson<HZDRSource>(response))
      .then(setSource)
      .catch(() => setSource(undefined))

    fetch(`/metadata/hzdr/sources/${source_key}/shots`)
      .then((response) => requireJson<HZDRShot[]>(response))
      .then((loadedShots) => {
        setShots(loadedShots)
        setSelectedRowKey((currentRowKey) => {
          if (
            currentRowKey &&
            loadedShots.some((shot) => getShotRowKey(shot) === currentRowKey)
          ) {
            return currentRowKey
          }
          return loadedShots[0] ? getShotRowKey(loadedShots[0]) : undefined
        })
        setDataState('ready')
      })
      .catch(() => setDataState('error'))

    fetch('/metadata/hzdr/sources')
      .then((response) => requireJson<HZDRSource[]>(response))
      .then(setAvailableSources)
      .catch(() => setAvailableSources([]))

    fetch(`/contextfile/campaign/${source_key}/me/results`)
      .then((response) => (response.ok ? response.json() : undefined))
      .then(setContextResults)
      .catch(() => setContextResults(undefined))
  }, [source_key])

  useEffect(() => {
    loadShotPageData()
  }, [loadShotPageData])

  const versionStates = classifyShotVersions(shots)
  const currentShots = shots.filter((shot) =>
    ['current', 'conflict'].includes(
      versionStates.get(getShotRowKey(shot)) ?? ''
    )
  )
  const tableShots = showHistoricalVersions ? shots : currentShots
  const selectedShot =
    tableShots.find((shot) => getShotRowKey(shot) === selectedRowKey) ??
    tableShots[0]

  useEffect(() => {
    const selected = selectedShot
    if (!source_key || !selected) {
      setShotDetail(undefined)
      return
    }

    // Prefer the unambiguous shot_key route: shot_number can repeat when the
    // counter restarts each day, so fetching detail by number alone is fragile.
    // Fall back to the legacy number route only when no shot_key is available.
    const shotsBase = `/metadata/hzdr/sources/${source_key}/shots`
    const detailPath = selected.shot_key
      ? `${shotsBase}/by-key/${encodeURIComponent(selected.shot_key)}`
      : `${shotsBase}/${selected.shot_number}`

    fetch(detailPath)
      .then((response) => requireJson<HZDRShotDetail>(response))
      .then(setShotDetail)
      .catch(() => setShotDetail(undefined))
  }, [source_key, selectedShot])
  const contextRowsByShot = buildContextRowsByShot(shots, contextResults?.rows)
  const shotDayLabels = buildShotDayLabels(shots)
  const historicalCount = shots.length - currentShots.length
  const conflictCount = currentShots.filter(
    (shot) => versionStates.get(getShotRowKey(shot)) === 'conflict'
  ).length
  const dataSources = summarizeShotDataSources(tableShots)
  const contextColumnOptions =
    contextResults?.columns.map((column) => ({
      value: `context:${column.name}`,
      label: column.title,
    })) ?? []
  const filterColumnOptions = [
    { value: 'all', label: 'All visible columns' },
    ...SHOT_TABLE_COLUMNS.map(({ value, label }) => ({ value, label })),
    ...contextColumnOptions,
  ]
  const tableColumnOptions = [
    ...SHOT_TABLE_COLUMNS.map(({ value, label }) => ({ value, label })),
    ...contextColumnOptions,
  ]
  const visibleTableColumns = tableColumnOptions
    .map((option) => option.value)
    .filter((column) => !hiddenTableColumns.includes(column))
  const isTableColumnVisible = (column: string) =>
    visibleTableColumns.includes(column)
  const visibleContextColumns =
    contextResults?.columns.filter((column) =>
      isTableColumnVisible(`context:${column.name}`)
    ) ?? []
  const tableMinWidth = Math.max(
    680,
    SHOT_TABLE_COLUMNS.reduce(
      (total, column) =>
        total + (isTableColumnVisible(column.value) ? column.width : 0),
      visibleContextColumns.length * CONTEXT_COLUMN_WIDTH
    )
  )
  const visibleShots = tableShots
    .filter((shot) =>
      shotMatchesTableFilter(
        shot,
        filterColumn,
        filterOperator,
        filterValue,
        contextRowsByShot.get(getShotRowKey(shot)),
        shotDayLabels.get(getShotRowKey(shot))
      )
    )
    .sort((leftShot, rightShot) =>
      compareHZDRShotsForTableSort(
        leftShot,
        rightShot,
        sortState,
        contextRowsByShot,
        shotDayLabels
      )
    )
  const sourceOptions = availableSources.map((entry) => ({
    value: entry.key,
    label: `${entry.title} (${entry.shots.length})`,
  }))
  const toggleSort = (column: string) => {
    setSortState((currentSort) =>
      currentSort.column === column
        ? {
            column,
            direction: currentSort.direction === 'asc' ? 'desc' : 'asc',
          }
        : { column, direction: 'asc' }
    )
  }
  const buildMetadataTrendValues = (metadataKey: string) =>
    tableShots
      .map((shot) =>
        toTrendValue(
          shot,
          Number(getNestedMetadataValue(shot.metadata, metadataKey))
        )
      )
      .filter((entry) => Number.isFinite(entry.value))
  const buildContextTrendValues = (columnName: string) =>
    tableShots
      .map((shot) =>
        toTrendValue(
          shot,
          Number(
            contextRowsByShot.get(getShotRowKey(shot))?.values[columnName] ??
              Number.NaN
          )
        )
      )
      .filter((entry) => Number.isFinite(entry.value))
  const shotUpdateUrl = (shot: HZDRShot, field: 'status' | 'metadata') => {
    const query = shot.shot_key
      ? `?shot_key=${encodeURIComponent(shot.shot_key)}`
      : ''
    return `/metadata/hzdr/sources/${source_key}/shots/${shot.shot_number}/${field}${query}`
  }
  const replaceShot = (updatedShot: HZDRShot) => {
    const updatedRowKey = getShotRowKey(updatedShot)
    setShots((currentShots) =>
      currentShots.map((shot) =>
        getShotRowKey(shot) === updatedRowKey ? updatedShot : shot
      )
    )
    setShotDetail((currentDetail) =>
      currentDetail && getShotRowKey(currentDetail.shot) === updatedRowKey
        ? { ...currentDetail, shot: updatedShot }
        : currentDetail
    )
  }
  const selectMetadataCell = (
    shot: HZDRShot,
    columnTitle: string,
    columnName: string,
    value: unknown,
    metadataTrendKey?: string
  ) => {
    setSelectedRowKey(getShotRowKey(shot))
    setSelectedCell({
      shotNumber: shot.shot_number,
      rowKey: getShotRowKey(shot),
      shotLabel: formatShotLabel(shot),
      columnTitle,
      columnName,
      value,
      trendValues: metadataTrendKey
        ? buildMetadataTrendValues(metadataTrendKey)
        : undefined,
      kind: 'metadata',
    })
  }
  const updateShotStatus = (rowKey: string, status: string, note?: string) => {
    const shot = shots.find((entry) => getShotRowKey(entry) === rowKey)
    if (!source_key || !shot) {
      return
    }
    fetch(shotUpdateUrl(shot, 'status'), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, note }),
    })
      .then((response) => requireJson<HZDRShot>(response))
      .then((updatedShot) => {
        replaceShot(updatedShot)
        setSelectedCell(undefined)
      })
      .catch(() => {
        setSelectedCell({
          shotNumber: shot.shot_number,
          rowKey,
          shotLabel: formatShotLabel(shot),
          columnTitle: 'Status update',
          columnName: 'status',
          value: status,
          error: 'Could not update shot status.',
          kind: 'metadata',
        })
      })
  }
  const updateShotMetadata = (
    rowKey: string,
    key: string,
    value: unknown,
    note?: string
  ) => {
    const shot = shots.find((entry) => getShotRowKey(entry) === rowKey)
    if (!source_key || !shot) {
      return
    }
    fetch(shotUpdateUrl(shot, 'metadata'), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value, note }),
    })
      .then((response) => requireJson<HZDRShot>(response))
      .then((updatedShot) => {
        replaceShot(updatedShot)
        setSelectedCell((currentCell) => {
          if (
            !currentCell ||
            currentCell.kind !== 'metadata' ||
            currentCell.rowKey !== rowKey ||
            currentCell.columnName !== key
          ) {
            return currentCell
          }
          const correctedValue = updatedShot.metadata[key]
          const numericValue = Number(correctedValue)
          return {
            ...currentCell,
            value: correctedValue,
            error: undefined,
            trendValues: currentCell.trendValues?.map((entry) =>
              entry.rowKey === rowKey && Number.isFinite(numericValue)
                ? { ...entry, value: numericValue }
                : entry
            ),
          }
        })
        fetch(`/contextfile/campaign/${source_key}/me/results`)
          .then((response) => (response.ok ? response.json() : undefined))
          .then(setContextResults)
          .catch(() => undefined)
      })
      .catch(() => {
        setSelectedCell((currentCell) =>
          currentCell?.rowKey === rowKey && currentCell.columnName === key
            ? { ...currentCell, error: `Could not correct ${key}.` }
            : currentCell
        )
      })
  }

  return (
    <HomePage
      header={<AppHeader />}
      main={
        <Container fluid py="md">
          <Stack gap="md">
            <Card withBorder radius={4} p="md">
              <Group justify="space-between" align="center" gap="sm">
                <Group gap="xs">
                  <Title order={3}>{source?.title ?? source_key}</Title>
                  {dataSources.map(({ label, shotCount }) => (
                    <Badge
                      key={label}
                      variant="light"
                      title={`${shotCount} of ${tableShots.length} shots have data from ${label}`}
                    >
                      {label} · {shotCount}
                    </Badge>
                  ))}
                </Group>
                <Group gap="xs" align="center" wrap="nowrap">
                  <Text size="sm" fw={500} component="label">
                    Source
                  </Text>
                  <Select
                    aria-label="Source"
                    value={source_key ?? null}
                    data={sourceOptions}
                    onChange={(value) => {
                      if (value) {
                        history.navigate(`/source/${value}`)
                      }
                    }}
                    searchable
                    comboboxProps={{
                      width: 'max-content',
                      position: 'bottom-end',
                    }}
                    style={{ minWidth: 320 }}
                  />
                </Group>
              </Group>
              <Group gap="xs" mt={4} align="center">
                <Text size="sm" c="dimmed">
                  {dataSources.length
                    ? 'Shots by the sources their data came from.'
                    : 'No shots yet.'}
                </Text>
                <Code>{source?.damnit_path ?? '-'}</Code>
              </Group>
            </Card>

            {source_key && source_key !== '_unassigned' ? (
              <CampaignCards sourceKey={source_key} />
            ) : null}

            <Grid gutter="md">
              <Grid.Col span={{ base: 12, lg: 9 }}>
                <Card withBorder radius={4} p="md">
                  <Group align="flex-end" gap="sm">
                    <Select
                      label="Filter column"
                      value={filterColumn}
                      onChange={(value) => setFilterColumn(value ?? 'all')}
                      data={filterColumnOptions}
                      searchable
                      style={{ flex: '1 1 220px' }}
                    />
                    <Select
                      label="Match"
                      value={filterOperator}
                      onChange={(value) =>
                        setFilterOperator(
                          (value as HZDRFilterOperator | null) ?? 'includes'
                        )
                      }
                      data={[
                        { value: 'includes', label: 'includes' },
                        { value: 'equals', label: 'equals' },
                        { value: 'gt', label: 'greater than' },
                        { value: 'gte', label: 'greater or equal' },
                        { value: 'lt', label: 'less than' },
                        { value: 'lte', label: 'less or equal' },
                      ]}
                      style={{ flex: '0 1 180px' }}
                    />
                    <TextInput
                      label="Value"
                      value={filterValue}
                      onChange={(event) =>
                        setFilterValue(event.currentTarget.value)
                      }
                      placeholder={
                        filterOperator === 'includes'
                          ? 'text to find'
                          : 'number or exact text'
                      }
                      style={{ flex: '1 1 180px' }}
                    />
                    <Button
                      variant="subtle"
                      disabled={!filterValue}
                      onClick={() => setFilterValue('')}
                    >
                      Clear
                    </Button>
                    <Button
                      component={Link}
                      to={`/source/${source_key}/context-builder`}
                      variant="light"
                    >
                      Context builder
                    </Button>
                  </Group>
                  <Group gap="sm" mt="sm">
                    <Checkbox
                      label="Show older and archived versions"
                      checked={showHistoricalVersions}
                      onChange={(event) =>
                        setShowHistoricalVersions(event.currentTarget.checked)
                      }
                    />
                    <Text size="xs" c="dimmed">
                      {historicalCount} older or archived records
                    </Text>
                  </Group>
                  {conflictCount > 0 ? (
                    <Alert color="yellow" title="Version conflicts" mt="sm">
                      {conflictCount} records share a day and shot number
                      without a unique latest version. They remain visible for
                      review.
                    </Alert>
                  ) : null}
                  <DetailsSection title="Columns">
                    <Checkbox.Group
                      value={visibleTableColumns}
                      onChange={(selectedColumns) => {
                        const nextHiddenColumns = tableColumnOptions
                          .map((option) => option.value)
                          .filter((column) => !selectedColumns.includes(column))
                        setHiddenTableColumns(nextHiddenColumns)
                      }}
                    >
                      <Group gap="sm" mt="xs">
                        {tableColumnOptions.map((option) => (
                          <Checkbox
                            key={option.value}
                            value={option.value}
                            label={option.label}
                            size="xs"
                          />
                        ))}
                      </Group>
                    </Checkbox.Group>
                  </DetailsSection>
                </Card>
                <Card withBorder radius={4} p={0}>
                  {dataState === 'error' ? (
                    <Alert color="red" title="Shots unavailable" m="md">
                      <Stack gap="xs" align="flex-start">
                        <Text size="sm">
                          Could not load shots for this source.
                        </Text>
                        <Button
                          size="xs"
                          color="red"
                          variant="light"
                          onClick={loadShotPageData}
                        >
                          Retry
                        </Button>
                      </Stack>
                    </Alert>
                  ) : (
                    <ScrollArea
                      style={{ height: 'calc(100vh - 340px)', minHeight: 320 }}
                      type="always"
                      offsetScrollbars
                      scrollbarSize={14}
                    >
                      <Table
                        striped
                        highlightOnHover
                        withColumnBorders
                        stickyHeader
                        miw={tableMinWidth}
                        style={{ tableLayout: 'fixed' }}
                      >
                        <Table.Thead>
                          <Table.Tr>
                            {SHOT_TABLE_COLUMNS.filter((column) =>
                              isTableColumnVisible(column.value)
                            ).map((column) => (
                              <SortableHeader
                                key={column.value}
                                width={column.width}
                                label={column.label}
                                column={column.value}
                                sortState={sortState}
                                onSort={toggleSort}
                              />
                            ))}
                            {visibleContextColumns.map((column) => (
                              <SortableHeader
                                key={column.name}
                                width={CONTEXT_COLUMN_WIDTH}
                                label={column.title}
                                column={`context:${column.name}`}
                                sortState={sortState}
                                onSort={toggleSort}
                              />
                            ))}
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {dataState === 'loading' ? (
                            <Table.Tr>
                              <Table.Td
                                colSpan={Math.max(
                                  visibleTableColumns.length,
                                  1
                                )}
                              >
                                <Group justify="center" gap="xs" py="md">
                                  <Loader size="sm" />
                                  <Text size="sm" c="dimmed">
                                    Loading shots…
                                  </Text>
                                </Group>
                              </Table.Td>
                            </Table.Tr>
                          ) : visibleShots.length === 0 ? (
                            <Table.Tr>
                              <Table.Td
                                colSpan={Math.max(
                                  visibleTableColumns.length,
                                  1
                                )}
                              >
                                <Text size="sm" c="dimmed" ta="center" py="md">
                                  {filterValue
                                    ? 'No shots match the filter.'
                                    : !showHistoricalVersions &&
                                        historicalCount > 0
                                      ? 'No current versions. Enable Show older and archived versions to inspect history.'
                                      : 'No shots yet for this source.'}
                                </Text>
                              </Table.Td>
                            </Table.Tr>
                          ) : (
                            visibleShots.map((shot) => (
                              <Table.Tr
                                key={getShotRowKey(shot)}
                                onClick={() =>
                                  setSelectedRowKey(getShotRowKey(shot))
                                }
                                style={{
                                  cursor: 'pointer',
                                  background:
                                    getShotRowKey(shot) ===
                                    (selectedShot &&
                                      getShotRowKey(selectedShot))
                                      ? 'var(--mantine-color-blue-light)'
                                      : undefined,
                                }}
                              >
                                {isTableColumnVisible('shot_number') ? (
                                  <Table.Td
                                    w={SHOT_TABLE_COLUMN_WIDTHS.shot_number}
                                  >
                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation()
                                        selectMetadataCell(
                                          shot,
                                          'Shot',
                                          'shot_number',
                                          shot.shot_number
                                        )
                                      }}
                                      style={cellButtonStyle}
                                    >
                                      {shot.shot_number}
                                      {getShotVersion(shot) !== undefined ? (
                                        <Text span size="xs" c="dimmed" ml={6}>
                                          v{getShotVersion(shot)}
                                        </Text>
                                      ) : null}
                                    </button>
                                  </Table.Td>
                                ) : null}
                                {isTableColumnVisible('shot_day') ? (
                                  <Table.Td
                                    w={SHOT_TABLE_COLUMN_WIDTHS.shot_day}
                                  >
                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation()
                                        selectMetadataCell(
                                          shot,
                                          'Day',
                                          'shot_day',
                                          shotDayLabels.get(
                                            getShotRowKey(shot)
                                          ) ?? '-'
                                        )
                                      }}
                                      style={cellButtonStyle}
                                    >
                                      <TruncatedCell
                                        value={
                                          shotDayLabels.get(
                                            getShotRowKey(shot)
                                          ) ?? '-'
                                        }
                                      />
                                    </button>
                                  </Table.Td>
                                ) : null}
                                {isTableColumnVisible('fired_at') ? (
                                  <Table.Td
                                    w={SHOT_TABLE_COLUMN_WIDTHS.fired_at}
                                  >
                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation()
                                        selectMetadataCell(
                                          shot,
                                          'Fired at',
                                          'fired_at',
                                          formatFiredAt(shot.fired_at)
                                        )
                                      }}
                                      style={cellButtonStyle}
                                    >
                                      <TruncatedCell
                                        value={formatFiredAt(shot.fired_at)}
                                      />
                                    </button>
                                  </Table.Td>
                                ) : null}
                                {isTableColumnVisible('status') ? (
                                  <Table.Td w={SHOT_TABLE_COLUMN_WIDTHS.status}>
                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation()
                                        selectMetadataCell(
                                          shot,
                                          'Status',
                                          'status',
                                          shot.metadata.status ?? 'unknown'
                                        )
                                      }}
                                      style={cellButtonStyle}
                                    >
                                      {versionStates.get(
                                        getShotRowKey(shot)
                                      ) === 'current' ? (
                                        <StatusBadge
                                          status={String(
                                            shot.metadata.status ?? 'unknown'
                                          )}
                                        />
                                      ) : (
                                        <Badge
                                          size="xs"
                                          title={`Recorded LabFrog status: ${shot.metadata.status ?? 'unknown'}`}
                                          color={
                                            versionStates.get(
                                              getShotRowKey(shot)
                                            ) === 'conflict'
                                              ? 'yellow'
                                              : 'gray'
                                          }
                                        >
                                          {versionStates.get(
                                            getShotRowKey(shot)
                                          ) === 'conflict'
                                            ? 'Version conflict'
                                            : versionStates.get(
                                                  getShotRowKey(shot)
                                                ) === 'older'
                                              ? 'Older version'
                                              : 'Archived'}
                                        </Badge>
                                      )}
                                    </button>
                                  </Table.Td>
                                ) : null}
                                {isTableColumnVisible('laser_energy_j') ? (
                                  <Table.Td
                                    w={SHOT_TABLE_COLUMN_WIDTHS.laser_energy_j}
                                  >
                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation()
                                        selectMetadataCell(
                                          shot,
                                          'Energy',
                                          'laser_energy_j',
                                          getNestedMetadataValue(
                                            shot.metadata,
                                            'laser.pulse_energy'
                                          ),
                                          'laser.pulse_energy'
                                        )
                                      }}
                                      style={cellButtonStyle}
                                    >
                                      <TruncatedCell
                                        value={
                                          getNestedMetadataValue(
                                            shot.metadata,
                                            'laser.pulse_energy'
                                          ) ?? '-'
                                        }
                                      />
                                    </button>
                                  </Table.Td>
                                ) : null}
                                {isTableColumnVisible('target') ? (
                                  <Table.Td w={SHOT_TABLE_COLUMN_WIDTHS.target}>
                                    <Group gap={6} wrap="nowrap">
                                      <button
                                        type="button"
                                        onClick={(event) => {
                                          event.stopPropagation()
                                          selectMetadataCell(
                                            shot,
                                            'Target',
                                            'target',
                                            formatTargetLabel(
                                              shot.metadata.target
                                            )
                                          )
                                        }}
                                        style={cellButtonStyle}
                                      >
                                        <TruncatedCell
                                          value={
                                            formatTargetLabel(
                                              shot.metadata.target
                                            ) ?? '-'
                                          }
                                        />
                                      </button>
                                      {shot.target_wiki_ref ? (
                                        <Anchor
                                          href={shot.target_wiki_ref}
                                          target="_blank"
                                          rel="noreferrer"
                                          size="xs"
                                          onClick={(event) =>
                                            event.stopPropagation()
                                          }
                                          title={
                                            shot.target_wiki_page ??
                                            'Open target wiki'
                                          }
                                          style={{ flex: '0 0 auto' }}
                                        >
                                          Wiki
                                        </Anchor>
                                      ) : null}
                                    </Group>
                                  </Table.Td>
                                ) : null}
                                {visibleContextColumns.map((column) => {
                                  const row = contextRowsByShot.get(
                                    getShotRowKey(shot)
                                  )
                                  const error = row?.errors[column.name]
                                  const value = row?.values[column.name]
                                  const preview = row?.previews?.[column.name]
                                  const trendValues = isScalarContextValue(
                                    value,
                                    preview
                                  )
                                    ? buildContextTrendValues(column.name)
                                    : undefined
                                  return (
                                    <Table.Td
                                      key={column.name}
                                      w={CONTEXT_COLUMN_WIDTH}
                                    >
                                      <button
                                        type="button"
                                        onClick={(event) => {
                                          event.stopPropagation()
                                          setSelectedRowKey(getShotRowKey(shot))
                                          setSelectedCell({
                                            shotNumber: shot.shot_number,
                                            rowKey: getShotRowKey(shot),
                                            shotLabel: formatShotLabel(shot),
                                            columnTitle: column.title,
                                            columnName: column.name,
                                            value,
                                            error,
                                            preview,
                                            trendValues,
                                            kind: 'context',
                                          })
                                        }}
                                        style={cellButtonStyle}
                                      >
                                        {error ? (
                                          isMissingContextValueError(error) ? (
                                            <Badge
                                              variant="light"
                                              color="gray"
                                              title={error}
                                            >
                                              Missing
                                            </Badge>
                                          ) : (
                                            <TruncatedCell
                                              value={error}
                                              c="red"
                                            />
                                          )
                                        ) : (
                                          <ContextCellContent
                                            value={formatContextValue(value)}
                                            preview={preview}
                                          />
                                        )}
                                      </button>
                                    </Table.Td>
                                  )
                                })}
                              </Table.Tr>
                            ))
                          )}
                        </Table.Tbody>
                      </Table>
                    </ScrollArea>
                  )}
                </Card>
                <Group justify="space-between">
                  <Text size="xs" c="dimmed">
                    Context columns are loaded from your active context.py
                    workspace for this source.
                  </Text>
                  <Button
                    size="xs"
                    variant="subtle"
                    onClick={() => {
                      if (!source_key) {
                        return
                      }
                      fetch(`/contextfile/campaign/${source_key}/me/results`)
                        .then((response) =>
                          response.ok ? response.json() : undefined
                        )
                        .then(setContextResults)
                        .catch(() => undefined)
                    }}
                  >
                    Refresh context
                  </Button>
                </Group>
              </Grid.Col>

              <Grid.Col span={{ base: 12, lg: 3 }}>
                <Stack gap="md">
                  <DetailsSection title="Selected cell" open>
                    <SelectedCellPanel
                      cell={selectedCell}
                      onCorrectMetadata={updateShotMetadata}
                    />
                  </DetailsSection>
                  <DetailsSection title="Shot sets" open>
                    <HZDRShotSetsPanel shots={tableShots} />
                  </DetailsSection>
                  <DetailsSection title="Shot detail">
                    <ShotDetailPanel
                      shot={selectedShot}
                      shotDetail={shotDetail}
                      availableSources={availableSources}
                      onUpdateStatus={updateShotStatus}
                      onCorrectMetadata={updateShotMetadata}
                    />
                  </DetailsSection>
                </Stack>
              </Grid.Col>
            </Grid>
          </Stack>
        </Container>
      }
    />
  )
}
