import React, { useEffect } from "react";
import { connect } from "react-redux";
import Table from "./Table";
import { sharedActions } from "../actions/shared";

const App = ({ dispatch }) => {
  // Get initial data
  useEffect(() => {
    dispatch(sharedActions.getInitialData());
  }, []);

  return (
    <div>
      <Table />
    </div>
  );
};

export default connect()(App);
