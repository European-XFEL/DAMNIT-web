import { lazy, Suspense } from 'react'
import {
  Button as MantineButton,
  Flex,
  Group,
  Tabs as MantineTabs,
  Text,
  rem,
  type ButtonProps as MantineButtonProps,
  type ElementProps,
} from '@mantine/core'
import { useDisclosure } from '@mantine/hooks'

import { IconGraph, IconX } from '@tabler/icons-react'
import cx from 'clsx'

import { setCurrentTab, removeTab } from './dashboard.slice'
import { type ContextFileProps } from '../context-file'
import { PlotDialog } from '../plots'
import { type TableProps } from '../table'

import { CenteredLoader } from '../../components/feedback'
import { type TabsProps } from '../../components/tabs'
import { useAppDispatch, useAppSelector } from '../../redux/hooks'

import styles from './dashboard.module.css'
import headerStyles from '../../styles/header.module.css'

const PlotsTab = lazy(() =>
  import('../plots').then((module) => ({ default: module.PlotsTab }))
)
const ContextFile = lazy(() =>
  import('../context-file').then((module) => ({
    default: module.ContextFile,
  }))
)
const Table = lazy(() => import('../table'))

interface ButtonProps
  extends MantineButtonProps,
    ElementProps<'button', keyof MantineButtonProps> {
  label: string
  icon: React.ReactNode
  color?: string
}

const Button = ({ label, icon, color = 'indigo', ...props }: ButtonProps) => {
  return (
    <MantineButton
      color={color}
      variant="white"
      size="xs"
      style={{
        transition: 'color 0.5s ease, box-shadow 0.3s ease',
      }}
      {...props}
    >
      <Group gap={6} px={0}>
        {icon}
        <Text fw={500} size={rem(12)} lh={1} ml={3}>
          {label}
        </Text>
      </Group>
    </MantineButton>
  )
}

const MainTabs = ({ contents, active, setActive, ...props }: TabsProps) => {
  const [openedDialog, { open: openDialog, close: closeDialog }] =
    useDisclosure()

  const entries = Object.entries(contents)
  return (
    <>
      <MantineTabs
        value={active || entries[0][0]}
        onChange={setActive}
        classNames={{
          root: styles.tabs,
          list: cx(headerStyles.bottom, styles.tabsList),
          tab: styles.tab,
        }}
        variant="outline"
        visibleFrom="sm"
        pt={8}
        keepMounted={false}
        {...props}
      >
        <MantineTabs.List px={8}>
          {entries.map(([id, tab]) => (
            <MantineTabs.Tab
              value={id}
              key={`tabs-tab-${id}`}
              {...(tab.isClosable && tab.onClose
                ? {
                    rightSection: <IconX size={16} onClick={tab.onClose} />,
                  }
                : {})}
            >
              {tab.title}
            </MantineTabs.Tab>
          ))}
          <Button
            label="Display Plot"
            icon={
              <IconGraph
                style={{ width: rem(14), height: rem(14) }}
                stroke={1.5}
              />
            }
            ml="auto"
            onClick={openDialog}
          />
        </MantineTabs.List>
        {entries.map(([id, { element }]) => (
          <MantineTabs.Panel value={id} key={`tabs-panel-${id}`} pt="xs">
            <Flex
              direction="column"
              h="calc(100vh - 52px - var(--app-shell-header-height, 0px) - var(--app-shell-footer-height, 0px))"
            >
              {element}
            </Flex>
          </MantineTabs.Panel>
        ))}
      </MantineTabs>
      <PlotDialog opened={openedDialog} close={closeDialog} />
    </>
  )
}

type DashBoardMainProps = {
  tableProps?: TableProps
  contextFileProps?: ContextFileProps
}

function DashboardMain({ tableProps, contextFileProps }: DashBoardMainProps) {
  const dispatch = useAppDispatch()
  const main = useAppSelector((state) => state.dashboard.main)

  // Main tabs
  const mainTabElements = {
    table: (
      <Suspense fallback={<CenteredLoader />}>
        <Table {...tableProps} />
      </Suspense>
    ),
    plots: (
      <Suspense fallback={<CenteredLoader />}>
        <PlotsTab />
      </Suspense>
    ),
    editor: (
      <Suspense fallback={<CenteredLoader />}>
        <ContextFile {...contextFileProps} />
      </Suspense>
    ),
  }
  const populatedMainTabs = Object.fromEntries(
    Object.entries(main.tabs).map(([id, tab]) => [
      id,
      {
        element: mainTabElements[id as keyof typeof mainTabElements],
        ...tab,
        ...(tab.isClosable ? { onClose: () => dispatch(removeTab(id)) } : {}),
      },
    ])
  )

  return (
    <MainTabs
      contents={populatedMainTabs}
      active={main.currentTab}
      setActive={(id) => dispatch(setCurrentTab(id))}
    />
  )
}

export default DashboardMain
