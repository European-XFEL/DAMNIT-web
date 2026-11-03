import { renderHook } from 'vitest-browser-react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { DrawHeaderCallback } from '@glideapps/glide-data-grid'

import { useColumnFlash } from '#src/features/table/hooks/use-column-flash'
import {
  columnMoved,
  columnOrderReset,
} from '#src/features/table/stores/table.slice'
import { setupStore, type AppStore } from '#src/app/store/store'
import { withStore } from '#tests/support/render'

const COLUMNS = [
  { id: 'run' },
  { id: 'n_trains' },
  { id: 'sample.type', group: 'sample' },
  { id: 'sample.x', group: 'sample' },
  { id: 'scan_type' },
]
const ORDER = COLUMNS.map((column) => column.id)
const COLUMN_INDEX = new Map(ORDER.map((name, index) => [name, index]))
const ROW_COUNT = 40
const FRAME = 16

function renderFlash(store: AppStore) {
  return renderHook(() => useColumnFlash(COLUMN_INDEX, ROW_COUNT), {
    wrapper: withStore(store),
  })
}

function moveColumns(store: AppStore, columns: string[]) {
  store.dispatch(columnMoved({ order: ORDER, moved: { columns, groups: [] } }))
}

function moveGroup(store: AppStore, group: string) {
  const columns = COLUMNS.filter((column) => column.group === group).map(
    (column) => column.id
  )
  store.dispatch(
    columnMoved({ order: ORDER, moved: { columns, groups: [group] } })
  )
}

const HEADER_FONT = '600 13px sans-serif'
const CELL_FONT = '13px sans-serif'

// Draws one header cell onto a context that records its fills and title font,
// starting a column its group themes in the cell font, as glide does.
function drawHeaderCell(
  flash: ReturnType<typeof useColumnFlash>,
  {
    columnIndex,
    isSelected = false,
  }: { columnIndex: number; isSelected?: boolean }
) {
  const column = COLUMNS[columnIndex]
  const themed = column.group != null && flash.groupThemes?.[column.group]
  const fills: number[][] = []
  const ctx = {
    font: themed ? CELL_FONT : HEADER_FONT,
    fillStyle: '',
    fillRect: (...rect: number[]) => fills.push(rect),
  }
  const titleFonts: string[] = []
  const args = {
    ctx,
    theme: { headerFontStyle: '600 13px', fontFamily: 'sans-serif' },
    column,
    columnIndex,
    rect: { x: 100, y: 24, width: 80, height: 36 },
    isSelected,
    hasSelectedCell: false,
    hoverAmount: 0,
  } as unknown as Parameters<DrawHeaderCallback>[0]

  flash.drawHeader!(args, () => titleFonts.push(ctx.font))
  return { fills, titleFonts }
}

// The flash runs on animation frames and performance.now(), and the default
// fake set covers neither.
beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'],
  })
})

afterEach(() => {
  vi.useRealTimers()
})

test('a reset tints the cells and header of every column moved since the last one', async () => {
  const store = setupStore()
  const { result, act } = await renderFlash(store)

  await act(() => moveColumns(store, ['sample.type']))
  await act(() => moveColumns(store, ['sample.x']))
  await act(() => store.dispatch(columnOrderReset()))
  await act(() => vi.advanceTimersByTime(FRAME))

  const { highlightRegions, groupThemes } = result.current
  expect(highlightRegions).toEqual([
    {
      color: expect.stringMatching(/^rgba\(/),
      range: { x: 2, y: 0, width: 1, height: ROW_COUNT },
      style: 'no-outline',
    },
    {
      color: expect.stringMatching(/^rgba\(/),
      range: { x: 3, y: 0, width: 1, height: ROW_COUNT },
      style: 'no-outline',
    },
  ])

  expect(drawHeaderCell(result.current, { columnIndex: 2 })).toEqual({
    fills: [[100, 24, 80, 36]],
    titleFonts: [HEADER_FONT],
  })
  expect(drawHeaderCell(result.current, { columnIndex: 1 })).toEqual({
    fills: [],
    titleFonts: [HEADER_FONT],
  })
  expect(groupThemes).toBeUndefined()
})

test('a group drop tints the band in the same colour as its columns', async () => {
  const store = setupStore()
  const { result, act } = await renderFlash(store)

  await act(() => moveGroup(store, 'sample'))
  await act(() => vi.advanceTimersByTime(FRAME))

  const { highlightRegions, groupThemes } = result.current
  const color = highlightRegions?.[0].color
  expect(color).toMatch(/^rgba\(/)
  expect(groupThemes).toEqual({ sample: { bgHeader: color } })
})

test("a group drop leaves its members' headers to the band's theme", async () => {
  const store = setupStore()
  const { result, act } = await renderFlash(store)

  await act(() => moveGroup(store, 'sample'))
  await act(() => vi.advanceTimersByTime(FRAME))

  expect(drawHeaderCell(result.current, { columnIndex: 2 }).fills).toEqual([])
})

test("a group drop still tints a selected member's header", async () => {
  const store = setupStore()
  const { result, act } = await renderFlash(store)

  await act(() => moveGroup(store, 'sample'))
  await act(() => vi.advanceTimersByTime(FRAME))

  expect(
    drawHeaderCell(result.current, { columnIndex: 2, isSelected: true }).fills
  ).toEqual([[100, 24, 80, 36]])
})

test("a group drop keeps its members' titles in the header font", async () => {
  const store = setupStore()
  const { result, act } = await renderFlash(store)

  await act(() => moveGroup(store, 'sample'))
  await act(() => vi.advanceTimersByTime(FRAME))

  expect(drawHeaderCell(result.current, { columnIndex: 2 }).titleFonts).toEqual(
    [HEADER_FONT]
  )
})

test('the tint is gone a second after the drop', async () => {
  const store = setupStore()
  const { result, act } = await renderFlash(store)

  await act(() => moveColumns(store, ['n_trains']))
  await act(() => vi.advanceTimersByTime(1000 + FRAME))

  expect(result.current).toEqual({
    highlightRegions: undefined,
    drawHeader: undefined,
    groupThemes: undefined,
  })
})

test('a drop of a column the grid does not show schedules no frames', async () => {
  const store = setupStore()
  const { act } = await renderFlash(store)

  await act(() => moveColumns(store, ['hidden_column']))

  // Nothing on screen differs either way, so the pending frames are the only trace.
  expect(vi.getTimerCount()).toBe(0)
})

test('a column hidden mid-flash and shown again after it draws no tint', async () => {
  const store = setupStore()
  const withoutNTrains = new Map(
    ORDER.filter((name) => name !== 'n_trains').map((name, index) => [
      name,
      index,
    ])
  )
  const { result, act, rerender } = await renderHook(
    (columnIndex = COLUMN_INDEX) => useColumnFlash(columnIndex, ROW_COUNT),
    { initialProps: COLUMN_INDEX, wrapper: withStore(store) }
  )

  // Drop a column and hide it while it flashes
  await act(() => moveColumns(store, ['n_trains']))
  await act(() => vi.advanceTimersByTime(300))
  await rerender(withoutNTrains)

  // Show it again once the flash is over
  await act(() => vi.advanceTimersByTime(1000))
  await rerender(COLUMN_INDEX)

  expect(result.current.highlightRegions).toBeUndefined()
})

test('a drop older than the flash draws nothing when the grid mounts', async () => {
  const store = setupStore()
  moveColumns(store, ['n_trains'])
  vi.advanceTimersByTime(1000)

  const { result, act } = await renderFlash(store)
  await act(() => vi.advanceTimersByTime(FRAME))

  expect(result.current.highlightRegions).toBeUndefined()
})

test('a second drop mid-flash moves the tint to the column it moved', async () => {
  const store = setupStore()
  const { result, act } = await renderFlash(store)

  // Drop the first column and let its flash run for a moment
  await act(() => moveColumns(store, ['n_trains']))
  await act(() => vi.advanceTimersByTime(300))
  expect(result.current.highlightRegions?.map(({ range }) => range.x)).toEqual([
    1,
  ])

  // Drop another before the first has faded
  await act(() => moveColumns(store, ['scan_type']))
  await act(() => vi.advanceTimersByTime(FRAME))
  expect(result.current.highlightRegions?.map(({ range }) => range.x)).toEqual([
    4,
  ])
})
