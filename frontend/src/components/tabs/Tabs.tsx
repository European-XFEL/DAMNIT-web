import React from "react"
import { Button, Tabs as MantineTabs } from "@mantine/core"
import { IconX } from "@tabler/icons-react"

const Tabs = ({ contents, active, setActive, lastElement, ...props }) => {
  const entries = Object.entries(contents)
  return (
    <MantineTabs
      radius="xl"
      value={active || entries[0][0]}
      onChange={setActive}
      color="indigo"
      {...props}
    >
      <MantineTabs.List>
        {entries.map(([id, tab]) => (
          <MantineTabs.Tab
            value={id}
            key={`tabs-tab-${id}`}
            {...(tab.isClosable && tab.onClose
              ? {
                  leftSection: <IconX size={16} onClick={tab.onClose} />,
                }
              : {})}
          >
            {tab.title}
          </MantineTabs.Tab>
        ))}

        {lastElement}
      </MantineTabs.List>
      {entries.map(([id, { element }]) => (
        <MantineTabs.Panel value={id} key={`tabs-panel-${id}`} pt="xs">
          {element}
        </MantineTabs.Panel>
      ))}
    </MantineTabs>
  )
}

export default Tabs
