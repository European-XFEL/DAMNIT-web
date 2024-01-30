import React from "react";
import { connect } from "react-redux";
import { Drawer as MantineDrawer } from "@mantine/core";

import { close as closeDrawer } from "./drawerSlice";
import Run from "../run/Run";
import Tabs from "../../common/tabs/Tabs";

const Drawer = ({ dispatch, isOpened, contents }) => {
  const handleClose = () => {
    dispatch(closeDrawer());
  };

  return (
    <div>
      <MantineDrawer
        opened={isOpened}
        onClose={handleClose}
        position="right"
        withOverlay={false}
      >
        <Tabs contents={contents}></Tabs>
      </MantineDrawer>
    </div>
  );
};

const COMPONENTS_MAP = {
  run: <Run />,
};

const mapStateToProps = ({ drawer }) => {
  const contents = Object.entries(drawer.tabs).map(([key, value]) => [
    key,
    { ...value, element: COMPONENTS_MAP[key] },
  ]);

  return {
    isOpened: drawer.isOpened,
    contents: Object.fromEntries(contents),
  };
};

export default connect(mapStateToProps)(Drawer);
