import React from "react";
import { connect } from "react-redux";

import Table from "../table";
import Plots from "../plots";
import Tabs from "../../common/tabs/Tabs";
import { removeTab, setCurrentTab } from "./dashboardSlice";

const COMPONENTS_MAP = {
  table: <Table />,
  plots: <Plots />,
};

const Dashboard = ({ contents, currentTab, removeTab, setCurrentTab }) => {
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
      <Tabs
        contents={Object.fromEntries(populated)}
        active={currentTab}
        setActive={setCurrentTab}
      />
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
    setCurrentTab: (id) => {
      dispatch(setCurrentTab(id));
    },
    dispatch,
  };
};

export default connect(mapStateToProps, mapDispatchToProps)(Dashboard);
