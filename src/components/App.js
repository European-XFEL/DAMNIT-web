import React, { useEffect } from "react";
import { connect } from "react-redux";
import Table from "./Table";
import { sharedActions } from "../actions/shared";

const App = ({ dispatch, loading }) => {
  // Get initial data
  useEffect(() => {
    dispatch(sharedActions.getInitialData());
  }, []);

  return <div>{loading ? null : <Table />}</div>;
};

const mapStateToProps = ({ table }) => {
  return {
    loading: !table.data,
  };
};

export default connect(mapStateToProps)(App);
