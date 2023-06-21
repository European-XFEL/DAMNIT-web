import React from "react";
import { connect } from "react-redux";
import { Drawer as MantineDrawer } from "@mantine/core";

import { open as openDrawer, close as closeDrawer } from "./drawerSlice";
import Run from "../../features/run/Run";
import Tabs from "../tabs/Tabs";

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

const mapStateToProps = ({ drawer }) => {
  return {
    isOpened: drawer.isOpened,
    contents: {
      run: {
        element: <Run />,
        title: "Run",
      },
    },
  };
};

export default connect(mapStateToProps)(Drawer);
