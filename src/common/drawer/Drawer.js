import React from "react";
import { connect } from "react-redux";
import { Drawer as MantineDrawer, Button, Group } from "@mantine/core";

import { open as openDrawer, close as closeDrawer } from "./drawerSlice";

const Drawer = ({ dispatch, isOpened }) => {
  const handleClose = () => {
    dispatch(closeDrawer());
  };

  // REMOVEME: Button is just for checking :P
  const handleClick = () => {
    dispatch(openDrawer());
  };

  return (
    <div>
      <MantineDrawer
        opened={isOpened}
        onClose={handleClose}
        position="right"
        withOverlay={false}
      ></MantineDrawer>
      <Group position="center">
        <Button onClick={handleClick}>Open Drawer</Button>
      </Group>
    </div>
  );
};

const mapStateToProps = ({ drawer }) => {
  return { isOpened: drawer.isOpened };
};

export default connect(mapStateToProps)(Drawer);
