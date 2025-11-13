import React from 'react'
import {
  Tabs as MantineTabs,
  type TabsProps as MantineTabsProps,
} from '@mantine/core'
import { IconX } from '@tabler/icons-react'
import { type TabContents } from './tabs.types'

export interface TabsProps extends MantineTabsProps {
  contents: TabContents
  active?: string | null
  setActive?: (value: string | null) => void
  lastElement?: React.ReactNode | undefined
  proposalNum?: string
}

const Tabs = ({
  contents,
  active,
  setActive,
  lastElement,
  ...props
}: TabsProps) => {
  const entries = Object.entries(contents)

  return (
    <MantineTabs
      radius="lg"
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
