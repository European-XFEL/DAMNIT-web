import React from "react";
import { connect } from "react-redux";
import { Text } from "@mantine/core";

import useStyles from "./Run.styles";
import { EMPTY_VALUE } from "../../common/constants";

const HIDDEN_DTYPES = ["image", "array"];

const Run = ({ data }) => {
  const { classes } = useStyles();

  return (
    <div>
      {Object.entries(data).map(([key, value]) => (
        <div className={classes.item} key={`run-div-${key}`}>
          <Text size="sm" className={classes.label} key={`run-label-${key}`}>
            {key}
          </Text>
          <Text size="sm" className={classes.value} key={`run-value-${key}`}>
            {value !== null ? value : ""}
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
  };
};

export default connect(mapStateToProps)(Run);
