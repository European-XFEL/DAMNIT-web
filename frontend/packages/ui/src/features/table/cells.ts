import {
  GridCellKind,
  type BaseGridCell,
  type CustomCell,
  type CustomRenderer,
  type GridCell,
  type ImageCell,
  type Item,
  type LoadingCell,
  type NumberCell,
  type TextCell,
} from '@glideapps/glide-data-grid'
import { type SparklineCellType } from '@glideapps/glide-data-grid-cells'

import { DTYPES } from '#src/constants'
import {
  type CellError,
  type CellValue,
} from '#src/data/table/table-data.types'
import { formatDate, formatNumber } from '#src/utils/helpers'

// Width of the small skeleton/error box, shared by loadingCell and the
// error cell renderer so a no-data cell and an errored cell line up.
const SKELETON_BOX_WIDTH = 30

// TODO: Handle nonconforming data type

export const imageCell = (
  value: CellValue,
  params: Partial<BaseGridCell> = {}
): ImageCell => {
  const data = typeof value === 'string' ? [value] : []

  return {
    kind: GridCellKind.Image,
    data,
    allowOverlay: false,
    // allowAdd: false,
    readonly: true,
    ...params,
  }
}

export const textCell = (
  value: CellValue,
  params: Partial<BaseGridCell> = {}
): TextCell => {
  const data = value ? String(value) : ''
  return {
    kind: GridCellKind.Text,
    displayData: data,
    data,
    allowOverlay: false,
    ...params,
  }
}

export const numberCell = (
  value: CellValue,
  params: Partial<BaseGridCell> = {}
): NumberCell => {
  const data =
    typeof value === 'number' && Number.isFinite(value)
      ? formatNumber(value)
      : undefined

  return {
    kind: GridCellKind.Number,
    displayData:
      data != null ? String(data) : value != null ? String(value) : '',
    data: data,
    allowOverlay: false,
    contentAlign: 'right',
    themeOverride: {
      fontFamily: 'monospace',
      textDark: '#4A4A4A',
    },
    ...params,
  }
}

export const arrayCell = (
  value: CellValue,
  params: Partial<BaseGridCell> = {}
): SparklineCellType => {
  const values = Array.isArray(value) ? (value as number[]) : []

  const data = value
    ? {
        values: values,
        displayValues: values.map((v) => formatNumber(v).toString()),
        yAxis: [Math.min(...values), Math.max(...values)] as Item,
      }
    : { values: [], yAxis: [0, 0] as Item }

  return {
    kind: GridCellKind.Custom,
    allowOverlay: false,
    copyData: '',
    data: {
      kind: 'sparkline-cell',
      color: '#4C78A8',
      graphKind: 'line',
      hideAxis: true,
      ...data,
    },
    ...params,
  }
}

export const dateCell = (
  value: CellValue,
  params: Partial<BaseGridCell> = {}
): TextCell => {
  const data = value && typeof value === 'number' ? formatDate(value) : ''

  return {
    kind: GridCellKind.Text,
    allowOverlay: false,
    displayData: data,
    data,
    themeOverride: {
      fontFamily: 'monospace',
    },
    ...params,
  }
}

// Shown for variables that failed to execute (the run_variables row carries an
// `error` instead of a value). Rendered as a small right-aligned glyph that
// varies with the kind of error.
const ERROR_CELL_KIND = 'error-cell'

export interface ErrorCellProps {
  readonly kind: typeof ERROR_CELL_KIND
  readonly error: CellError
}

export type ErrorCell = CustomCell<ErrorCellProps>

export type ErrorKind = 'skipped' | 'missing' | 'error'

export interface ErrorVisuals {
  kind: ErrorKind
  title: string
}

const ERROR_TITLES: Record<ErrorKind, string> = {
  skipped: 'Missing dependency',
  missing: 'Missing data',
  error: 'Error',
}

// Resolve an exception class to its display kind.
const errorKind = (cls: string): ErrorKind =>
  cls === 'Skip' ? 'skipped' : cls === 'SourceNameError' ? 'missing' : 'error'

// Resolve an exception class to its display kind and title.
export const errorVisuals = (cls: string): ErrorVisuals => {
  const kind = errorKind(cls)
  return { kind, title: ERROR_TITLES[kind] }
}

// Clipboard/copy representation, shared by the cell's copyData and the
// tooltip's Ctrl+C handler.
export const errorText = (error: CellError): string =>
  `${error.cls}\n${error.message}`

export const errorCell = (
  error: CellError,
  params: Partial<BaseGridCell> = {}
): ErrorCell => {
  return {
    kind: GridCellKind.Custom,
    allowOverlay: false,
    copyData: errorText(error),
    data: { kind: ERROR_CELL_KIND, error },
    ...params,
  }
}

const ERROR_ICON_SIZE = 14
// Rasterize larger than we draw so the canvas downscales (crisp on HiDPI)
// instead of upscaling a display-size raster.
const ERROR_ICON_RENDER_SIZE = 56
const ERROR_ICON_STROKE = 2

// Tabler outline icon paths (@tabler/icons-react v3.31.0): alert-triangle,
// help, and chevrons-right. Inlined so the canvas renderer can build the SVG
// itself instead of pulling react-dom/server into the client bundle.
const ERROR_ICON_PATHS: Record<ErrorKind, string> = {
  error:
    '<path d="M12 9v4" />' +
    '<path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0z" />' +
    '<path d="M12 16h.01" />',
  missing:
    '<path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0" />' +
    '<path d="M12 17l0 .01" />' +
    '<path d="M12 13.5a1.5 1.5 0 0 1 1 -1.5a2.6 2.6 0 1 0 -3 -4" />',
  skipped: '<path d="M7 7l5 5l-5 5" />' + '<path d="M13 7l5 5l-5 5" />',
}

// Rasterize an error glyph to a cached image keyed by kind and color so the
// canvas renderer can drawImage() it. The SVG is built once per unique
// (kind, color); every redraw is a cache hit.
const iconCache = new Map<string, HTMLImageElement>()

const errorIcon = (kind: ErrorKind, color: string): HTMLImageElement => {
  const key = `${kind}|${color}`
  let img = iconCache.get(key)
  if (!img) {
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"` +
      ` width="${ERROR_ICON_RENDER_SIZE}" height="${ERROR_ICON_RENDER_SIZE}"` +
      ` fill="none" stroke="${color}" stroke-width="${ERROR_ICON_STROKE}"` +
      ` stroke-linecap="round" stroke-linejoin="round">` +
      `${ERROR_ICON_PATHS[kind]}</svg>`
    img = new Image()
    // encodeURIComponent is load-bearing: the hex `#` must become %23 or the
    // data URL breaks.
    img.src = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
    iconCache.set(key, img)
  }
  return img
}

export type ErrorColors = Record<ErrorKind, string>

export const makeErrorCellRenderer = (
  colors: ErrorColors
): CustomRenderer<ErrorCell> => {
  const icons: Record<ErrorKind, HTMLImageElement> = {
    error: errorIcon('error', colors.error),
    missing: errorIcon('missing', colors.missing),
    skipped: errorIcon('skipped', colors.skipped),
  }

  return {
    kind: GridCellKind.Custom,
    isMatch: (cell: CustomCell): cell is ErrorCell =>
      (cell.data as Partial<ErrorCellProps>).kind === ERROR_CELL_KIND,
    draw: ({ ctx, rect, theme, cell }) => {
      const img = icons[errorKind(cell.data.error.cls)]
      if (!img.complete || img.naturalWidth === 0) {
        return
      }

      const size = Math.min(
        ERROR_ICON_SIZE,
        rect.height - 2 * theme.cellVerticalPadding
      )
      const x = rect.x + rect.width - theme.cellHorizontalPadding - size
      const y = rect.y + (rect.height - size) / 2

      ctx.drawImage(img, x, y, size, size)
    },
  }
}

export const loadingCell = (
  _: CellValue,
  params: Partial<BaseGridCell> = {}
): LoadingCell => {
  return {
    kind: GridCellKind.Loading,
    allowOverlay: false,
    skeletonWidth: SKELETON_BOX_WIDTH,
    skeletonHeight: 30,
    ...params,
  }
}

const gridCellFactory = {
  [DTYPES.image]: imageCell,
  [DTYPES.string]: textCell,
  [DTYPES.number]: numberCell,
  [DTYPES.array]: arrayCell,
  [DTYPES.timestamp]: dateCell,
}

type GetCellOptions = {
  value: CellValue
  dtype: keyof typeof gridCellFactory
  options: Partial<BaseGridCell>
}

export const getCell = ({
  value,
  dtype,
  options,
}: GetCellOptions): GridCell => {
  // If the value is null or undefined, use the loading cell factory.
  const factory = value == null ? loadingCell : gridCellFactory[dtype]
  return factory(value, options)
}
