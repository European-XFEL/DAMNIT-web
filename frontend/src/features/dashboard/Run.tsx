import React from "react"
import { connect, useSelector } from "react-redux"
import { Image, ScrollArea, Text } from "@mantine/core"

import styles from "./Run.module.css"
import { DTYPES } from "../../constants"
import { formatDate, imageBytesToURL, isEmpty } from "../../utils/helpers"

const EXCLUDED_VARIABLES = ["proposal", "run", "added_at"]

// Renders
const renderString = ({ name, label, value }) => {
  return (
    <div className={styles.scalarItem} key={`run-div-${name}`}>
      <Text size="xs" className={styles.scalarLabel} key={`run-label-${name}`}>
        {label}
      </Text>{" "}
      <Text size="sm" className={styles.scalarValue} key={`run-value-${name}`}>
        {value}
      </Text>
    </div>
  )
}

const renderDate = ({ name, label, value }) => {
  return (
    <div className={styles.scalarItem} key={`run-div-${name}`}>
      <Text size="xs" className={styles.scalarLabel} key={`run-label-${name}`}>
        {label}
      </Text>{" "}
      <Text
        size="sm"
        className={styles.scalarValue}
        key={`run-value-${name}`}
        style={{ fontFamily: "monospace" }}
        c="dark.5"
      >
        {formatDate(value)}
      </Text>
    </div>
  )
}

const renderNumber = ({ name, label, value }) => {
  return (
    <div className={styles.scalarItem} key={`run-div-${name}`}>
      <Text size="xs" className={styles.scalarLabel} key={`run-label-${name}`}>
        {label}
      </Text>
      <Text
        size="sm"
        className={styles.scalarValue}
        key={`run-value-${name}`}
        style={{ fontFamily: "monospace" }}
        c="dark.5"
      >
        {value}
      </Text>
    </div>
  )
}
const renderImage = ({ name, label, value }) => {
  return (
    <div className={styles.objectItem} key={`run-div-${name}`}>
      <Text size="xs" className={styles.objectLabel} key={`run-label-${name}`}>
        {label}
      </Text>
      <Image
        className={styles.objectValue}
        key={`run-value-${name}`}
        fit="contain"
        src={imageBytesToURL(value)}
      />
    </div>
  )
}

const renderFactory = {
  [DTYPES.image]: renderImage,
  [DTYPES.string]: renderString,
  [DTYPES.number]: renderNumber,
  [DTYPES.timestamp]: renderDate,
}

const Run = (props) => {
  const variables = useSelector((state) => state.tableData.metadata.variables)

  return (
    <ScrollArea h="100vh" offsetScrollbars>
      {Object.entries(props.data).map(([name, data]) => {
        if (!data) {
          return null
        }

        const render = renderFactory[data.dtype]
        if (!data.value || !render || EXCLUDED_VARIABLES.includes(name)) {
          return null
        }

        return render({
          name,
          label: variables[name].title || name,
          value: data.value,
        })
      })}
    </ScrollArea>
  )
}

const mapStateToProps = ({ tableData, table }) => {
  const { run, variables: selectedVariables } = table.selection

  let variables = tableData.data[run]

  if (!isEmpty(selectedVariables)) {
    variables = Object.fromEntries(
      Object.entries(variables).filter(([name, _]) =>
        selectedVariables.includes(name),
      ),
    )
  }

  return {
    data: variables ?? {},
  }
}

export default connect(mapStateToProps)(Run)
