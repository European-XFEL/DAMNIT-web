import { Image, ScrollArea, Text } from '@mantine/core'
import { useFragment } from '@apollo/client/react'

import { selectVariableVisibility } from '#src/features/table/store/selectors'
import { DTYPES, NONCONFIGURABLE_VARIABLES } from '#src/constants'
import { RUN_FRAGMENT } from '#src/data/table/table-data.queries'
import {
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

const renderFactory = {
  [DTYPES.image]: renderImage,
  [DTYPES.string]: renderString,
  [DTYPES.number]: renderNumber,
  [DTYPES.timestamp]: renderDate,
  default: renderUnknown,
}

const Run = () => {
  const proposal = useAppSelector((state) => state.metadata.proposal.value)
  const { run, variables: selectedVariables } = useAppSelector(
    (state) => state.table.selection
  )
  const { runs, variables: metadataVariables } = useTableMeta()
  const variableVisibility = useAppSelector(selectVariableVisibility)

  // The selection carries a run number; its proposal comes from the run list,
  // which pairs each number with the proposal it belongs to.
  const identity =
    run != null ? runs.find((entry) => entry.run === run) : undefined
  const { data: runEntity, complete } = useFragment<RunEntity>({
    fragment: RUN_FRAGMENT,
    from: {
      __typename: 'DamnitRun',
      database: proposal,
      proposal: identity?.proposal ?? '',
      run: identity?.run ?? -1,
    },
  })

  if (run == null || !identity || !complete) {
    return null
  }

  const cells = Object.fromEntries(
    (runEntity.cells ?? []).map((cell) => [cell.name, cell])
  )
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
      data?.value != null &&
      !NONCONFIGURABLE_VARIABLES.includes(name)
  )

  return (
    <ScrollArea h="100vh" offsetScrollbars>
      {validRuns.map(([name, data]) => {
        const render = renderFactory[data.dtype] ?? renderFactory.default
        return render({
          name,
          label: metadataVariables[name]?.title || name,
          value: data.value as CellValue,
        })
      })}
    </ScrollArea>
  )
}

export default Run
