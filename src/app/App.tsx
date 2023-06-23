import React, { useEffect } from "react";
import { connect } from "react-redux";

import Dashboard from "../features/dashboard";
import Drawer from "../features/drawer";
import { getTable } from "../features/table";

const App = ({ dispatch, loading }) => {
  // Get initial data
  useEffect(() => {
    dispatch(getTable());
  }, []);

  return (
    <div>
      {loading ? null : (
        <>
          <Drawer />
          <Dashboard />
        </>
      )}
    </div>
  );
};

const mapStateToProps = ({ table }) => {
  return {
    loading: !table.data,
  };
};

export default connect(mapStateToProps)(App);
