import { Image, ScrollArea, Text, rem } from '@mantine/core'
import { useFragment } from '@apollo/client/react'

import { useColumnVisibilityFromVariables } from '#src/features/table/hooks/use-column-visibility'
import { DTYPES, NONCONFIGURABLE_VARIABLES } from '#src/constants'
import { RUN_FRAGMENT } from '#src/data/table/table-data.queries'
import {
  cellsByName,
  getTitleByName,
} from '#src/data/table/table-data.transforms'
import {
  type Cell,
  type CellError,
  type CellValue,
  type RunCells,
  type Run,
  type RunId,
} from '#src/data/table/table-data.types'
import { useTableMeta } from '#src/data/table/use-table-meta'
import { useAppSelector } from '#src/app/store/hooks'
import { FONT_SIZE_DATA } from '#src/styles/fonts'
import { formatDate } from '#src/utils/helpers'

import classes from './run-details.module.css'

// One line box for the label and either kind of value, so every row keeps the
// same rhythm whatever it holds.
const SCALAR_LINE = rem(22)

type ScalarProps = {
  label: string
  value: string | number
  monospace?: boolean
}

function Scalar({ label, value, monospace = false }: ScalarProps) {
  return (
    <div className={classes.scalarItem}>
      <Text size="xs" lh={SCALAR_LINE} className={classes.scalarLabel}>
        {label}
      </Text>
      <Text
        fz={monospace ? 'xs' : FONT_SIZE_DATA}
        lh={SCALAR_LINE}
        className={classes.scalarValue}
        ff={monospace ? 'monospace' : undefined}
      >
        {value}
      </Text>
    </div>
  )
}

type RenderProps = {
  name: string
  label: string
  value: CellValue
}

const renderString = ({ name, label, value }: RenderProps) => (
  <Scalar key={name} label={label} value={value as string} />
)

const renderDate = ({ name, label, value }: RenderProps) => (
  <Scalar
    key={name}
    label={label}
    value={formatDate(value as number)}
    monospace
  />
)

const renderNumber = ({ name, label, value }: RenderProps) => (
  <Scalar key={name} label={label} value={value as number} monospace />
)

const renderImage = ({ name, label, value }: RenderProps) => (
  <div className={classes.objectItem} key={name}>
    <Text size="xs" className={classes.objectLabel}>
      {label}
    </Text>
    <Image className={classes.objectValue} fit="contain" src={value} />
  </div>
)

const renderUnknown = ({ name, label }: RenderProps) => (
  <Scalar key={name} label={label} value={'(no preview)'} />
)

const renderError = ({
  name,
  label,
  error,
}: {
  name: string
  label: string
  error: CellError
}) => <Scalar key={name} label={label} value={error.message} />

const renderFactory = {
  [DTYPES.image]: renderImage,
  [DTYPES.string]: renderString,
  [DTYPES.number]: renderNumber,
  [DTYPES.timestamp]: renderDate,
  default: renderUnknown,
}

// A name the map does not carry has either left the context file since the run
// was written or is one the user cannot hide; only the second is dropped here.
function isShown(
  name: string,
  visibility: Record<string, boolean | undefined>
) {
  return visibility[name] !== false && !NONCONFIGURABLE_VARIABLES.includes(name)
}

// Drilling into a cell asks for that one variable by name, so hiding its column
// does not veto it: visibility is about the grid, and this is not the grid.
function shownCells(
  cells: RunCells,
  activeVariable: string | null,
  visibility: Record<string, boolean | undefined>
): [string, Cell][] {
  if (activeVariable == null) {
    return Object.entries(cells).filter(([name]) => isShown(name, visibility))
  }

  const drilled = cells[activeVariable]
  return drilled ? [[activeVariable, drilled]] : []
}

type RunDetailsProps = {
  run: RunId
  variable: string | null
}

function RunDetails({ run: runId, variable }: RunDetailsProps) {
  const proposal = useAppSelector((state) => state.metadata.proposal.value)
  const { variables: metadataVariables } = useTableMeta()
  const columnVisibility = useColumnVisibilityFromVariables()

  // Read the normalized run straight from the cache by its identity trio. The
  // run id carries (proposal, run); `database` is constant across the table,
  // so those two complete the key the cache normalizes on.
  const { data: run, complete } = useFragment<Run>({
    fragment: RUN_FRAGMENT,
    from: {
      __typename: 'DamnitRun',
      database: proposal,
      proposal: runId.proposal,
      run: runId.run,
    },
  })

  if (!complete) {
    return null
  }

  const cells = cellsByName(run.cells ?? [])

  const renderable = shownCells(cells, variable, columnVisibility).filter(
    ([, cell]) => cell.error != null || cell.summary.value != null
  )

  return (
    <ScrollArea h="100%" offsetScrollbars>
      {renderable.map(([name, data]) => {
        const label = getTitleByName(metadataVariables, name)
        // A cell that failed has nothing worth rendering from its summary.
        if (data.error) {
          return renderError({ name, label, error: data.error })
        }
        const render =
          renderFactory[data.summary.dtype] ?? renderFactory.default
        return render({
          name,
          label,
          value: data.summary.value as CellValue,
        })
      })}
    </ScrollArea>
  )
}

export default RunDetails
