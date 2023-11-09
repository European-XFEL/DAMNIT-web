import React from "react"
import { connect } from "react-redux"
import { Image, Text } from "@mantine/core"

import classes from "./Run.module.css"
import { DTYPES, EMPTY_VALUE } from "../../common/constants"
import { formatDate, imageBytesToURL, isEmpty } from "../../utils/helpers"

const HIDDEN_DTYPES = [DTYPES.array]

// TODO: Support additional display types
const TEXT_FIELD = [DTYPES.number, DTYPES.string, DTYPES.timestamp]

const Run = (props) => {
  // Conditions
  const isScalar = (key) => TEXT_FIELD.includes(props.schema[key].dtype)
  const isImage = (key) => props.schema[key].dtype === DTYPES.image

  // Renders
  const renderScalar = (key) => {
    const value = props.data[key]
    const dtype = props.schema[key].dtype

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
    const value = props.data[key]
    return (
      <div className={classes.objectItem} key={`run-div-${key}`}>
        {renderLabel(key)}
        <Image
          className={classes.objectValue}
          key={`run-value-${key}`}
          fit="contain"
          src={imageBytesToURL(value)}
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

const mapStateToProps = ({ table }) => {
  const { run, variables } = table.selection
  let data = table.data[run]
  if (!isEmpty(variables)) {
    data = Object.fromEntries(
      Object.entries(data).filter(([key, value]) => variables.includes(key)),
    )
  }

  const filtered = !data
    ? []
    : Object.entries(data).filter(
        ([key, value]) =>
          !HIDDEN_DTYPES.includes(table.schema[key].dtype) &&
          value !== EMPTY_VALUE,
      )

  return {
    data: Object.fromEntries(filtered),
    schema: table.schema,
  }
}

export default connect(mapStateToProps)(Run)
