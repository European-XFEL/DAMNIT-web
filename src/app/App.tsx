import React, { useEffect } from "react";
import { connect } from "react-redux";

import Drawer from "../common/drawer";
import Table, { getTable } from "../features/table";

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
          <Table />
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
