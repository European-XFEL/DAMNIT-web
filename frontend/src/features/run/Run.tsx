import React from "react"
import { connect } from "react-redux"
import { Image, Text } from "@mantine/core"

import classes from "./Run.module.css"
import { DTYPES, EMPTY_VALUE } from "../../constants"
import { formatDate, imageBytesToURL, isEmpty } from "../../utils/helpers"

const HIDDEN_DTYPES = [DTYPES.array]

// TODO: Support additional display types
const TEXT_FIELD = [DTYPES.number, DTYPES.string, DTYPES.timestamp]

const Run = (props) => {
  // Conditions
  const isScalar = (key) => TEXT_FIELD.includes(props.data[key].dtype)
  const isImage = (key) => props.data[key].dtype === DTYPES.image

  // Renders
  const renderScalar = (key) => {
    const { value, dtype } = props.data[key]

    return (
      <div className={classes.scalarItem} key={`run-div-${key}`}>
        {renderLabel(key)}
        <Text
          size="sm"
          className={classes.scalarValue}
          key={`run-value-${key}`}
          {...(dtype === DTYPES.number && {
            sx: { fontFamily: "monospace" },
          })}
        >
          {value !== null ? (
            <>{dtype === DTYPES.timestamp ? formatDate(value) : value}</>
          ) : (
            ""
          )}
        </Text>
      </div>
    )
  }

  const renderImage = (key) => {
    return (
      <div className={classes.objectItem} key={`run-div-${key}`}>
        {renderLabel(key)}
        <Image
          className={classes.objectValue}
          key={`run-value-${key}`}
          fit="contain"
          src={imageBytesToURL(props.data[key].value)}
        />
      </div>
    )
  }

  const renderLabel = (key) => {
    return (
      <Text size="sm" className={classes.label} key={`run-label-${key}`}>
        {key}
      </Text>
    )
  }

  return (
    <div>
      {Object.keys(props.data).map((key) =>
        isScalar(key)
          ? renderScalar(key)
          : isImage(key)
          ? renderImage(key)
          : null,
      )}
    </div>
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

  const filtered = !variables
    ? []
    : Object.entries(variables).filter(
        ([_, variable]) =>
          !HIDDEN_DTYPES.includes(variable.dtype) &&
          variable.value !== EMPTY_VALUE,
      )

  return {
    data: Object.fromEntries(filtered),
  }
}

export default connect(mapStateToProps)(Run)
