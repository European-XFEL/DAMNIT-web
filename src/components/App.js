import React, { useEffect } from "react";
import { connect } from "react-redux";
import { sharedActions } from "../actions/shared";

const App = ({ dispatch }) => {
  // Get initial data
  useEffect(() => {
    dispatch(sharedActions.getInitialData());
  }, []);

  return <div>App</div>;
};

export default connect()(App);
