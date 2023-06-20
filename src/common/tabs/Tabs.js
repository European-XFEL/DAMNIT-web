import React from "react";
import { Tabs as MantineTabs } from "@mantine/core";

const Tabs = ({ contents }) => {
  const tabs = Object.keys(contents);
  return (
    <MantineTabs radius="xl" defaultValue={tabs.length ? tabs[0] : ""}>
      <MantineTabs.List>
        {tabs.map((tab) => (
          <MantineTabs.Tab value={tab} key={`tabs-tab-${tab}`}>
            {contents[tab].title}
          </MantineTabs.Tab>
        ))}
      </MantineTabs.List>
      {tabs.map((tab) => (
        <MantineTabs.Panel value={tab} key={`tabs-panel-${tab}`} pt="xs">
          {contents[tab].element}
        </MantineTabs.Panel>
      ))}
    </MantineTabs>
  );
};

export default Tabs;
