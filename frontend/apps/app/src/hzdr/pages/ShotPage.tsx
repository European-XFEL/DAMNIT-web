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
import {
  SortableHeader,
  SelectedCellPanel,
  StatusBadge,
  HZDRShotSetsPanel,
  ShotDetailPanel,
  DetailsSection,
  cellButtonStyle,
} from '../components/ShotTable'
import { TruncatedCell, ContextCellContent } from '../components/previews'
import {
  shotMatchesTableFilter,
  compareHZDRShotsForTableSort,
  buildShotDayLabels,
  isScalarContextValue,
} from '../utils/filter'
import {
  formatFiredAt,
  isMissingContextValueError,
  formatContextValue,
} from '../utils/format'
import { getNestedMetadataValue, formatTargetLabel } from '../utils/metadata'
import { requireJson } from '../utils/api'
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
  const [selectedShotNumber, setSelectedShotNumber] = useState<number>()
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
    })
  }, [
    source_key,
    filterColumn,
    filterOperator,
    filterValue,
    sortState,
    hiddenTableColumns,
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
        setSelectedShotNumber((currentShotNumber) => {
          if (
            currentShotNumber &&
            loadedShots.some((shot) => shot.shot_number === currentShotNumber)
          ) {
            return currentShotNumber
          }
          return loadedShots[0]?.shot_number
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

  useEffect(() => {
    if (!source_key || !selectedShotNumber) {
      setShotDetail(undefined)
      return
    }

    // Prefer the unambiguous shot_key route: shot_number can repeat when the
    // counter restarts each day, so fetching detail by number alone is fragile.
    // Fall back to the legacy number route only when no shot_key is available.
    const selected = shots.find(
      (shot) => shot.shot_number === selectedShotNumber
    )
    const shotsBase = `/metadata/hzdr/sources/${source_key}/shots`
    const detailPath = selected?.shot_key
      ? `${shotsBase}/by-key/${encodeURIComponent(selected.shot_key)}`
      : `${shotsBase}/${selectedShotNumber}`

    fetch(detailPath)
      .then((response) => requireJson<HZDRShotDetail>(response))
      .then(setShotDetail)
      .catch(() => setShotDetail(undefined))
  }, [source_key, selectedShotNumber, shots])

  const selectedShot = shots.find(
    (shot) => shot.shot_number === selectedShotNumber
  )
  const contextRowsByShot = new Map(
    contextResults?.rows.map((row) => [row.shot_number, row]) ?? []
  )
  const shotDayLabels = buildShotDayLabels(shots)
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
  const visibleShots = shots
    .filter((shot) =>
      shotMatchesTableFilter(
        shot,
        filterColumn,
        filterOperator,
        filterValue,
        contextRowsByShot.get(shot.shot_number),
        shotDayLabels.get(shot.shot_number)
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
    shots
      .map((shot) => ({
        shotNumber: shot.shot_number,
        value: Number(getNestedMetadataValue(shot.metadata, metadataKey)),
      }))
      .filter((entry) => Number.isFinite(entry.value))
  const buildContextTrendValues = (columnName: string) =>
    (contextResults?.rows ?? [])
      .map((row) => ({
        shotNumber: row.shot_number,
        value: Number(row.values[columnName]),
      }))
      .filter((entry) => Number.isFinite(entry.value))
  const selectMetadataCell = (
    shot: HZDRShot,
    columnTitle: string,
    columnName: string,
    value: unknown,
    metadataTrendKey?: string
  ) => {
    setSelectedShotNumber(shot.shot_number)
    setSelectedCell({
      shotNumber: shot.shot_number,
      columnTitle,
      columnName,
      value,
      trendValues: metadataTrendKey
        ? buildMetadataTrendValues(metadataTrendKey)
        : undefined,
      kind: 'metadata',
    })
  }
  const updateShotStatus = (
    shotNumber: number,
    status: string,
    note?: string
  ) => {
    if (!source_key) {
      return
    }
    fetch(`/metadata/hzdr/sources/${source_key}/shots/${shotNumber}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, note }),
    })
      .then((response) => requireJson<HZDRShot>(response))
      .then((updatedShot) => {
        setShots((currentShots) =>
          currentShots.map((shot) =>
            shot.shot_number === updatedShot.shot_number ? updatedShot : shot
          )
        )
        setShotDetail((currentDetail) =>
          currentDetail?.shot.shot_number === updatedShot.shot_number
            ? { ...currentDetail, shot: updatedShot }
            : currentDetail
        )
        setSelectedCell(undefined)
      })
      .catch(() => {
        setSelectedCell({
          shotNumber,
          columnTitle: 'Status update',
          columnName: 'status',
          value: status,
          error: 'Could not update shot status.',
          kind: 'metadata',
        })
      })
  }
  const updateShotMetadata = (
    shotNumber: number,
    key: string,
    value: unknown,
    note?: string
  ) => {
    if (!source_key) {
      return
    }
    fetch(`/metadata/hzdr/sources/${source_key}/shots/${shotNumber}/metadata`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value, note }),
    })
      .then((response) => requireJson<HZDRShot>(response))
      .then((updatedShot) => {
        setShots((currentShots) =>
          currentShots.map((shot) =>
            shot.shot_number === updatedShot.shot_number ? updatedShot : shot
          )
        )
        setShotDetail((currentDetail) =>
          currentDetail?.shot.shot_number === updatedShot.shot_number
            ? { ...currentDetail, shot: updatedShot }
            : currentDetail
        )
        setSelectedCell((currentCell) => {
          if (
            !currentCell ||
            currentCell.kind !== 'metadata' ||
            currentCell.shotNumber !== updatedShot.shot_number ||
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
              entry.shotNumber === updatedShot.shot_number &&
              Number.isFinite(numericValue)
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
          currentCell?.shotNumber === shotNumber &&
          currentCell.columnName === key
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
                  <Badge variant="light">Emulated package stream</Badge>
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
                  LaserData creates shots, Watchdog enriches them, and staged
                  events feed the HDF5 builder.
                </Text>
                <Code>{source?.damnit_path ?? '-'}</Code>
              </Group>
            </Card>

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
                                    : 'No shots yet for this source.'}
                                </Text>
                              </Table.Td>
                            </Table.Tr>
                          ) : (
                            visibleShots.map((shot) => (
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
                                          shotDayLabels.get(shot.shot_number) ??
                                            '-'
                                        )
                                      }}
                                      style={cellButtonStyle}
                                    >
                                      <TruncatedCell
                                        value={
                                          shotDayLabels.get(shot.shot_number) ??
                                          '-'
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
                                      <StatusBadge
                                        status={String(
                                          shot.metadata.status ?? 'unknown'
                                        )}
                                      />
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
                                    shot.shot_number
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
                                          setSelectedShotNumber(
                                            shot.shot_number
                                          )
                                          setSelectedCell({
                                            shotNumber: shot.shot_number,
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
                                            trendValues={trendValues}
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
                    <HZDRShotSetsPanel shots={shots} />
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
