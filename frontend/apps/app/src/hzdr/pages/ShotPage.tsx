import { useEffect, useState } from 'react'
import {
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
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { useParams } from 'react-router'
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
import { getNestedMetadataValue } from '../utils/metadata'
import { requireJson } from '../utils/api'

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

  useEffect(() => {
    const loadShotPageData = () => {
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

      fetch(`/contextfile/campaign/${source_key}/me/results`)
        .then((response) => (response.ok ? response.json() : undefined))
        .then(setContextResults)
    }

    loadShotPageData()
  }, [source_key])

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
      .then((response) => response.json())
      .then(setShotDetail)
  }, [source_key, selectedShotNumber, shots])

  const selectedShot = shots.find(
    (shot) => shot.shot_number === selectedShotNumber
  )
  const contextRowsByShot = new Map(
    contextResults?.rows.map((row) => [row.shot_number, row]) ?? []
  )
  const shotDayLabels = buildShotDayLabels(shots)
  const filterColumnOptions = [
    { value: 'all', label: 'All visible columns' },
    { value: 'shot_number', label: 'Shot' },
    { value: 'shot_day', label: 'Day' },
    { value: 'fired_at', label: 'Fired at' },
    { value: 'status', label: 'Status' },
    { value: 'laser_energy_j', label: 'Energy' },
    { value: 'target', label: 'Target' },
    ...(contextResults?.columns.map((column) => ({
      value: `context:${column.name}`,
      label: column.title,
    })) ?? []),
  ]
  const tableColumnOptions = [
    { value: 'shot_number', label: 'Shot' },
    { value: 'shot_day', label: 'Day' },
    { value: 'fired_at', label: 'Fired at' },
    { value: 'status', label: 'Status' },
    { value: 'laser_energy_j', label: 'Energy' },
    { value: 'target', label: 'Target' },
    ...(contextResults?.columns.map((column) => ({
      value: `context:${column.name}`,
      label: column.title,
    })) ?? []),
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
    [
      isTableColumnVisible('shot_number') ? 86 : 0,
      isTableColumnVisible('shot_day') ? 92 : 0,
      isTableColumnVisible('fired_at') ? 168 : 0,
      isTableColumnVisible('status') ? 112 : 0,
      isTableColumnVisible('laser_energy_j') ? 96 : 0,
      isTableColumnVisible('target') ? 110 : 0,
      visibleContextColumns.length * 180,
    ].reduce((total, width) => total + width, 0)
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
              <Group justify="space-between" align="flex-start">
                <Stack gap={4} style={{ flex: 1, minWidth: 280 }}>
                  <Group gap="xs">
                    <Title order={3}>{source?.title ?? source_key}</Title>
                    <Badge variant="light">Emulated package stream</Badge>
                  </Group>
                  <Text size="sm" c="dimmed">
                    LaserData creates shots, Watchdog enriches them, and staged
                    events feed the HDF5 builder.
                  </Text>
                  <Code block>{source?.damnit_path ?? '-'}</Code>
                </Stack>
                <Stack gap="xs" style={{ minWidth: 260 }}>
                  <Select
                    label="Source"
                    value={source_key ?? null}
                    data={sourceOptions}
                    onChange={(value) => {
                      if (value) {
                        history.navigate(`/source/${value}`)
                      }
                    }}
                    searchable
                  />
                </Stack>
              </Group>
            </Card>

            <Grid gutter="md">
              <Grid.Col span={{ base: 12, xl: 10 }}>
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
                      component="a"
                      href={`/source/${source_key}/context-builder`}
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
                  <ScrollArea
                    h={520}
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
                          {isTableColumnVisible('shot_number') ? (
                            <SortableHeader
                              width={86}
                              label="Shot"
                              column="shot_number"
                              sortState={sortState}
                              onSort={toggleSort}
                            />
                          ) : null}
                          {isTableColumnVisible('shot_day') ? (
                            <SortableHeader
                              width={92}
                              label="Day"
                              column="shot_day"
                              sortState={sortState}
                              onSort={toggleSort}
                            />
                          ) : null}
                          {isTableColumnVisible('fired_at') ? (
                            <SortableHeader
                              width={168}
                              label="Fired at"
                              column="fired_at"
                              sortState={sortState}
                              onSort={toggleSort}
                            />
                          ) : null}
                          {isTableColumnVisible('status') ? (
                            <SortableHeader
                              width={112}
                              label="Status"
                              column="status"
                              sortState={sortState}
                              onSort={toggleSort}
                            />
                          ) : null}
                          {isTableColumnVisible('laser_energy_j') ? (
                            <SortableHeader
                              width={96}
                              label="Energy"
                              column="laser_energy_j"
                              sortState={sortState}
                              onSort={toggleSort}
                            />
                          ) : null}
                          {isTableColumnVisible('target') ? (
                            <SortableHeader
                              width={110}
                              label="Target"
                              column="target"
                              sortState={sortState}
                              onSort={toggleSort}
                            />
                          ) : null}
                          {visibleContextColumns.map((column) => (
                            <SortableHeader
                              key={column.name}
                              width={180}
                              label={column.title}
                              column={`context:${column.name}`}
                              sortState={sortState}
                              onSort={toggleSort}
                            />
                          ))}
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {visibleShots.map((shot) => (
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
                              <Table.Td w={86}>
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
                              <Table.Td w={92}>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    selectMetadataCell(
                                      shot,
                                      'Day',
                                      'shot_day',
                                      shotDayLabels.get(shot.shot_number) ?? '-'
                                    )
                                  }}
                                  style={cellButtonStyle}
                                >
                                  <TruncatedCell
                                    value={
                                      shotDayLabels.get(shot.shot_number) ?? '-'
                                    }
                                  />
                                </button>
                              </Table.Td>
                            ) : null}
                            {isTableColumnVisible('fired_at') ? (
                              <Table.Td w={168}>
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
                              <Table.Td w={112}>
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
                              <Table.Td w={96}>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    selectMetadataCell(
                                      shot,
                                      'Energy',
                                      'laser_energy_j',
                                      shot.metadata.laser_energy_j,
                                      'laser_energy_j'
                                    )
                                  }}
                                  style={cellButtonStyle}
                                >
                                  <TruncatedCell
                                    value={shot.metadata.laser_energy_j ?? '-'}
                                  />
                                </button>
                              </Table.Td>
                            ) : null}
                            {isTableColumnVisible('target') ? (
                              <Table.Td w={110}>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    selectMetadataCell(
                                      shot,
                                      'Target',
                                      'target',
                                      shot.metadata.target
                                    )
                                  }}
                                  style={cellButtonStyle}
                                >
                                  <TruncatedCell
                                    value={shot.metadata.target ?? '-'}
                                  />
                                </button>
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
                                <Table.Td key={column.name} w={180}>
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      event.stopPropagation()
                                      setSelectedShotNumber(shot.shot_number)
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
                                        <TruncatedCell value={error} c="red" />
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
                        ))}
                      </Table.Tbody>
                    </Table>
                  </ScrollArea>
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
                    }}
                  >
                    Refresh context
                  </Button>
                </Group>
              </Grid.Col>

              <Grid.Col span={{ base: 12, xl: 2 }}>
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
