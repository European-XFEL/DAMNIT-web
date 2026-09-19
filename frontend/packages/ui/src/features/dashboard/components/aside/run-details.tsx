import { Image, ScrollArea, Text, rem } from '@mantine/core'

import { DTYPES } from '#src/constants'
import type { RunEntry } from '#src/data/table/run-entries'
import {
  type CellError,
  type CellValue,
  type RunId,
} from '#src/data/table/table-data.types'
import { FONT_SIZE_DATA } from '#src/styles/fonts'
import { formatDate } from '#src/utils/helpers'
import { itemsOf } from '#src/utils/variable-blocks'

import classes from './run-details.module.css'
import { useRunEntries } from './use-run-entries'

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

function renderEntry(entry: RunEntry) {
  const { name, title: label } = entry
  switch (entry.state) {
    case 'value': {
      const render = renderFactory[entry.dtype] ?? renderFactory.default
      return render({ name, label, value: entry.value })
    }
    case 'error':
      return renderError({ name, label, error: entry.error })
    default:
      return null
  }
}

type RunDetailsProps = {
  run: RunId
  variable: string | null
}

function RunDetails({ run, variable }: RunDetailsProps) {
  const blocks = useRunEntries(run, variable)
  if (blocks == null) {
    return null
  }

  return (
    <ScrollArea h="100%" offsetScrollbars>
      {itemsOf(blocks).map(renderEntry)}
    </ScrollArea>
  )
}

export default RunDetails
