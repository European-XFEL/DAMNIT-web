import { Image, ScrollArea, Text } from '@mantine/core'
import { useFragment } from '@apollo/client/react'

import { selectVariableVisibility } from '#src/features/table/store/selectors'
import { DTYPES, NONCONFIGURABLE_VARIABLES } from '#src/constants'
import { RUN_FRAGMENT } from '#src/data/table/table-data.queries'
import { cellsByName } from '#src/data/table/table-data.transforms'
import {
  type CellError,
  type CellValue,
  type Run as RunEntity,
} from '#src/data/table/table-data.types'
import { useTableMeta } from '#src/data/table/use-table-meta'
import { useAppSelector } from '#src/app/store/hooks'
import { formatDate, isEmpty } from '#src/utils/helpers'

import classes from './run.module.css'

type ScalarProps = {
  label: string
  value: string | number
  monospace?: boolean
}

const Scalar = ({ label, value, monospace = false }: ScalarProps) => (
  <div className={classes.scalarItem}>
    <Text size="xs" className={classes.scalarLabel}>
      {label}
    </Text>
    <Text
      size="sm"
      className={classes.scalarValue}
      style={monospace ? { fontFamily: 'monospace' } : undefined}
      c={monospace ? 'dark.5' : undefined}
    >
      {value}
    </Text>
  </div>
)

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

const Run = () => {
  const proposal = useAppSelector((state) => state.metadata.proposal.value)
  const {
    proposal: selectedProposal,
    run,
    variables: selectedVariables,
  } = useAppSelector((state) => state.table.selection)
  const { runs, variables: metadataVariables } = useTableMeta()
  const variableVisibility = useAppSelector(selectVariableVisibility)

  // Read the normalized run straight from the cache by its identity trio. The
  // selection carries (proposal, run); `database` is constant across the table,
  // so those two complete the key the cache normalizes on.
  const { data: runEntity, complete } = useFragment<RunEntity>({
    fragment: RUN_FRAGMENT,
    from: {
      __typename: 'DamnitRun',
      database: proposal,
      proposal: selectedProposal ?? '',
      run: run ?? -1,
    },
  })

  // Show the selection only while it is still a row of the current proposal's
  // table. Run numbers collide across proposals, so both parts must match; a
  // stale selection from a proposal the user has left resolves to nothing.
  const inCurrentTable =
    run != null &&
    selectedProposal != null &&
    runs.some(
      (entry) => entry.proposal === selectedProposal && entry.run === run
    )

  if (!inCurrentTable || !complete) {
    return null
  }

  const cells = cellsByName(runEntity.cells ?? [])
  const runData = isEmpty(selectedVariables)
    ? cells
    : Object.fromEntries(
        Object.entries(cells).filter(([name]) =>
          selectedVariables.includes(name)
        )
      )

  const validRuns = Object.entries(runData).filter(
    ([name, data]) =>
      variableVisibility[name] !== false &&
      (data?.error != null || data?.value != null) &&
      !NONCONFIGURABLE_VARIABLES.includes(name)
  )

  return (
    <ScrollArea h="100vh" offsetScrollbars>
      {validRuns.map(([name, data]) => {
        const label = metadataVariables[name]?.title || name
        // A failed cell keeps its stale value in the cache; the grid gives the
        // error precedence, so the aside must too, showing the error rather
        // than the stale value.
        if (data.error) {
          return renderError({ name, label, error: data.error })
        }
        const render = renderFactory[data.dtype] ?? renderFactory.default
        return render({
          name,
          label,
          value: data.value as CellValue,
        })
      })}
    </ScrollArea>
  )
}

export default Run
