import { Image, ScrollArea, Text } from '@mantine/core'

import classes from './run.module.css'
import { selectVariableVisibility } from '../table/store/selectors'
import { DTYPES } from '../../constants'
import { useAppSelector } from '../../redux/hooks'
import { type VariableValue } from '../../types'
import { formatDate, isEmpty } from '../../utils/helpers'

const EXCLUDED_VARIABLES = ['proposal', 'run', 'added_at']

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
  value: VariableValue
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
  const tableData = useAppSelector((state) => state.tableData.data)
  const { run, variables: selectedVariables } = useAppSelector(
    (state) => state.table.selection
  )
  const metadataVariables = useAppSelector(
    (state) => state.tableData.metadata.variables
  )
  const variableVisibility = useAppSelector(selectVariableVisibility)

  if (!run || !tableData[run]) {
    return null
  }

  const runData = isEmpty(selectedVariables)
    ? tableData[run]
    : Object.fromEntries(
        Object.entries(tableData[run]).filter(([name]) =>
          selectedVariables.includes(name)
        )
      )

  const validRuns = Object.entries(runData).filter(
    ([name, data]) =>
      variableVisibility[name] !== false &&
      data?.value != null &&
      !EXCLUDED_VARIABLES.includes(name)
  )

  return (
    <ScrollArea h="100vh" offsetScrollbars>
      {validRuns.map(([name, data]) => {
        const render = renderFactory[data.dtype] ?? renderFactory.default
        return render({
          name,
          label: metadataVariables[name]?.title || name,
          value: data.value,
        })
      })}
    </ScrollArea>
  )
}

export default Run
