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
  roundedRect,
} from '@glideapps/glide-data-grid'
import { type SparklineCellType } from '@glideapps/glide-data-grid-cells'

import { DTYPES } from '../../constants'
import { type VariableError, type VariableValue } from '../../types'
import { formatDate, formatNumber } from '../../utils/helpers'

// Width of the small skeleton/error box, shared by loadingCell and
// errorCellRenderer so a no-data cell and an errored cell line up.
const SKELETON_BOX_WIDTH = 30

// TODO: Handle nonconforming data type

export const imageCell = (
  value: VariableValue,
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
  value: VariableValue,
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
  value: VariableValue,
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
  value: VariableValue,
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
  value: VariableValue,
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
// `error` instead of a value). Rendered as a small box with different colors
// depending on the error.
const ERROR_CELL_KIND = 'error-cell'

export interface ErrorCellProps {
  readonly kind: typeof ERROR_CELL_KIND
  readonly error: VariableError
}

export type ErrorCell = CustomCell<ErrorCellProps>

// Mantine's orange.4 and gray.5 respectively (the on-canvas draw can't use
// Mantine tokens; keep these in sync with the tooltip's `c="orange.4"`).
const ERROR_BOX_COLOR = '#FFA94D'
const SKIP_BOX_COLOR = '#ADB5BD'

// `error_cls` values that aren't serious failures get drawn in grey instead of
// orange.
const GREYED_ERROR_CLASSES: ReadonlySet<string> = new Set([
  'Skip',
  'SourceNameError',
])

export const errorCell = (
  error: VariableError,
  params: Partial<BaseGridCell> = {}
): ErrorCell => {
  return {
    kind: GridCellKind.Custom,
    allowOverlay: false,
    copyData: error.message,
    data: { kind: ERROR_CELL_KIND, error },
    ...params,
  }
}

export const errorCellRenderer: CustomRenderer<ErrorCell> = {
  kind: GridCellKind.Custom,
  isMatch: (cell: CustomCell): cell is ErrorCell =>
    (cell.data as Partial<ErrorCellProps>).kind === ERROR_CELL_KIND,
  draw: ({ ctx, rect, theme, cell }) => {
    const boxHeight = Math.min(18, rect.height - 2 * theme.cellVerticalPadding)
    const x = rect.x + theme.cellHorizontalPadding
    const y = rect.y + (rect.height - boxHeight) / 2

    roundedRect(
      ctx,
      x,
      y,
      SKELETON_BOX_WIDTH,
      boxHeight,
      theme.roundingRadius ?? 3
    )

    let boxColor = ERROR_BOX_COLOR
    if (GREYED_ERROR_CLASSES.has(cell.data.error.cls)) {
      boxColor = SKIP_BOX_COLOR
    }

    ctx.fillStyle = boxColor
    ctx.fill()
  },
}

export const loadingCell = (
  _: VariableValue,
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
  value: VariableValue
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
