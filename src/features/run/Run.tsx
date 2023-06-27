import React from "react";
import { connect } from "react-redux";
import { Text } from "@mantine/core";

import useStyles from "./Run.styles";
import { DTYPES, EMPTY_VALUE } from "../../common/constants";
import { formatDate } from "../../utils/helpers";

const HIDDEN_DTYPES = [DTYPES.image, DTYPES.array];

const Run = (props) => {
  const { classes } = useStyles();

  return (
    <div>
      {Object.entries(props.data).map(([key, value]) => (
        <div className={classes.item} key={`run-div-${key}`}>
          <Text size="sm" className={classes.label} key={`run-label-${key}`}>
            {key}
          </Text>
          <Text
            size="sm"
            className={classes.value}
            key={`run-value-${key}`}
            {...(props.schema[key].dtype === DTYPES.number && {
              sx: { fontFamily: "monospace" },
            })}
          >
            {value !== null ? (
              <>
                {props.schema[key].dtype === DTYPES.timestamp
                  ? formatDate(value)
                  : value}
              </>
            ) : (
              ""
            )}
          </Text>
        </div>
      ))}
    </div>
  );
};

const mapStateToProps = ({ table }) => {
  const data = table.data[table.selection.run];
  const filtered = !data
    ? []
    : Object.entries(data).filter(
        ([key, value]) =>
          !HIDDEN_DTYPES.includes(table.schema[key].dtype) &&
          value !== EMPTY_VALUE
      );

  return {
    data: Object.fromEntries(filtered),
    schema: table.schema,
  };
};

export default connect(mapStateToProps)(Run);
