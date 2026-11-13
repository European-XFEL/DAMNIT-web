import { useCallback, useRef } from 'react'
import { Stack } from '@mantine/core'

import { VARIABLES } from '#src/constants'
import { ViewStatus } from '#src/components/statuses/view-status'
import { useAppDispatch, useAppSelector } from '#src/app/store/hooks'
import { hasValue, runKey } from '#src/data/table/table-data.transforms'
import { useTableMeta } from '#src/data/table/use-table-meta'
import type { PlotSource, PlotSpec } from '#src/types'
import { cellTooltip } from '#src/features/table/utils/cell-tooltip'
import { summaryAxes } from '#src/features/table/utils/summary-axes'
import { TableToolbar } from '#src/features/table/components/table-toolbar'
import { RunCountItem } from '#src/features/table/components/run-count-item'
import ContextMenu from '#src/features/table/components/context-menu'
import GlideGrid from '#src/features/table/components/glide-grid'
import {
  useTableTooltip,
  type ResolveTooltip,
} from '#src/features/table/hooks/use-table-tooltip'
import { useTableColumns } from '#src/features/table/hooks/use-table-columns'
import { useTableRuns } from '#src/features/table/hooks/use-table-runs'
import { useContextMenu } from '#src/features/table/hooks/use-context-menu'
import type {
  CellId,
  CellMenuArgs,
  HeaderMenuArgs,
  Point,
  RunGridRef,
} from '#src/features/table/types/table.types'
import {
  cellActivated,
  runSelected,
} from '#src/features/table/stores/table.slice'

type TableProps = {
  onPlot: (plot: PlotSpec) => void
}

function Table({ onPlot }: TableProps) {
  const gridRef = useRef<RunGridRef>(null)

  const proposal = useAppSelector((state) => state.metadata.proposal.value)
  const { runs, groups } = useTableMeta()
  const {
    cellsByKey,
    lastUpdatedByKey,
    onVisibleRegionChanged: fetchOnScroll,
    loadErrors,
    retryNow,
  } = useTableRuns(proposal)

  const dispatch = useAppDispatch()
  const [contextMenu, setContextMenu] = useContextMenu()
  const { columns: tableColumns, pinnedCount } = useTableColumns()

  const columnsById = new Map(tableColumns.map((column) => [column.id, column]))

  const fitAllColumns = useCallback(() => {
    gridRef.current?.fitAllColumns()
  }, [])
  const resetColumnWidths = useCallback(() => {
    gridRef.current?.resetColumnWidths()
  }, [])

  const resolveTooltip: ResolveTooltip = ({ run, variable, normalizedX }) => {
    const cell = cellsByKey.get(runKey(run))?.get(variable)
    if (!cell) {
      return undefined
    }

    return cellTooltip(cell, { normalizedX })
  }
  const {
    onCellHovered,
    onCellMouseMove,
    dismiss: dismissTooltip,
    tooltip,
  } = useTableTooltip(resolveTooltip, { suppressed: contextMenu.isOpen })

  // The run number names the row rather than holding a value, so activating it
  // opens the whole run.
  const handleCellActivated = ({ run, variable }: CellId) => {
    dispatch(
      variable === VARIABLES.run
        ? runSelected(run)
        : cellActivated({ ...run, variable })
    )
  }

  // Every context menu is a single plot entry placed at the pointer, so the
  // menus differ only in what that entry says and does.
  const showPlotMenu = (
    position: Point,
    item: { kind: PlotSource; subtitle: string; onClick: () => void }
  ) => {
    setContextMenu({
      position,
      contents: [{ key: 'plot', title: `Plot: ${item.kind}`, ...item }],
    })
  }

  const handleCellContextMenu = ({
    run,
    variable,
    selectedRuns,
    position,
  }: CellMenuArgs) => {
    // A row whose page has not loaded yet has no data at all, not merely no
    // value: it has nothing to offer a plot either way.
    // TODO: Use extracted data type from the database
    const column = columnsById.get(variable)
    if (!column || !hasValue(cellsByKey.get(runKey(run))?.get(variable))) {
      return
    }

    const subtitle = column.title
    const runNumbers = selectedRuns.map((selected) => String(selected.run))

    showPlotMenu(position, {
      kind: 'preview',
      subtitle,
      onClick: () =>
        onPlot({
          source: 'preview',
          variables: [variable],
          runs: runNumbers,
        }),
    })
  }
  const handleHeaderContextMenu = ({
    variable,
    selectedVariables,
    position,
  }: HeaderMenuArgs) => {
    const axes = summaryAxes({ variable, selectedVariables, columnsById })
    if (!axes) {
      return
    }

    const { x, y } = axes
    const subtitle = `${y.title} vs. ${x.title}`

    showPlotMenu(position, {
      kind: 'summary',
      subtitle,
      onClick: () => onPlot({ source: 'summary', variables: [x.id, y.id] }),
    })
  }

  return (
    <>
      {!tableColumns.length ? null : (
        <Stack w="100%" h="100%" gap={0}>
          <TableToolbar
            onFitAllColumns={fitAllColumns}
            onResetColumnWidths={resetColumnWidths}
          />
          <>
            <GlideGrid
              ref={gridRef}
              columns={tableColumns}
              pinnedCount={pinnedCount}
              groups={groups}
              runs={runs}
              cellsByKey={cellsByKey}
              lastUpdatedByKey={lastUpdatedByKey}
              onVisibleRegionChanged={fetchOnScroll}
              onScroll={dismissTooltip}
              onCellHovered={onCellHovered}
              onCellMouseMove={onCellMouseMove}
              onCellActivated={handleCellActivated}
              onCellContextMenu={handleCellContextMenu}
              onHeaderContextMenu={handleHeaderContextMenu}
            />
            {tooltip}
            <ContextMenu {...contextMenu} />
            <div id="portal" />
          </>
          <ViewStatus>
            <RunCountItem
              runs={runs}
              loadErrors={loadErrors}
              onTryAgain={retryNow}
            />
          </ViewStatus>
        </Stack>
      )}
    </>
  )
}

export default Table
