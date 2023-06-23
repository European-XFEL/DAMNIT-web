import React from "react";
import { connect } from "react-redux";

import Table from "../table";
import Tabs from "../../common/tabs/Tabs";
import { removeTab } from "./dashboardSlice";

const COMPONENTS_MAP = {
  table: <Table />,
};

const Dashboard = ({ contents, currentTab, removeTab }) => {
  const populated = Object.entries(contents).map(([id, tab]) => [
    id,
    {
      ...tab,
      element: COMPONENTS_MAP[id] || <div>{tab.title}</div>,
      ...(tab.isClosable ? { onClose: () => removeTab(id) } : {}),
    },
  ]);

  return (
    <div>
      <Tabs contents={Object.fromEntries(populated)} active={currentTab} />
    </div>
  );
};

const mapStateToProps = ({ dashboard }) => {
  return {
    contents: dashboard.tabs,
    currentTab: dashboard.currentTab,
  };
};

const mapDispatchToProps = (dispatch) => {
  return {
    removeTab: (id) => dispatch(removeTab(id)),
    dispatch,
  };
};

export default connect(mapStateToProps, mapDispatchToProps)(Dashboard);
