import React, { lazy, Suspense } from "react"
import {
  AppShell,
  Burger,
  Button as MantineButton,
  ButtonProps as MantineButtonProps,
  CloseButton,
  ElementProps,
  Flex,
  Group,
  Skeleton,
  Stack,
  Tabs as MantineTabs,
  Text,
  Title,
  rem,
} from "@mantine/core"
import { useDisclosure } from "@mantine/hooks"

import { IconGraph, IconX, IconEyeClosed, IconEye } from "@tabler/icons-react"
import cx from "clsx"

import { Header, Logo } from "../../components/headers"
import { InstrumentBadge } from "../../components/badges"
import { Tabs, TabsProps } from "../../components/tabs"
import { useCurrentProposal } from "../../data/metadata"
import { useAppDispatch, useAppSelector } from "../../redux"
import { PlotDialog } from "../plots"
import { openEditor } from "../editor"
import { useCheckFileLastModifiedQuery } from "../editor/editor.api"
import { removeTab, setCurrentTab, closeAside } from "./dashboard.slice"
import Run from "./run"

import styles from "./dashboard.module.css"
import headerStyles from "../../styles/header.module.css"

import { resetEditor, upadateLastModified } from "../editor/editor.slice"

const PlotsTab = lazy(() =>
  import("../plots").then((module) => ({ default: module.PlotsTab })),
)
const EditorTab = lazy(() =>
  import("../editor").then((module) => ({ default: module.EditorTab })),
)
const Table = lazy(() => import("../table"))

interface ButtonProps
  extends MantineButtonProps,
    ElementProps<"button", keyof MantineButtonProps> {
  label: string
  icon: React.ReactNode
  color?: string
}

const Button = ({ label, icon, color = "indigo", ...props }: ButtonProps) => {
  return (
    <MantineButton color={color} variant="white" size="xs"
    style={{
      transition: "color 0.5s ease, box-shadow 0.3s ease",
    }}
    {...props}>
      <Group gap={6} px={0}>
        {icon}
        <Text fw={500} size={rem(12)} lh={1} ml={3}>
          {label}
        </Text>
      </Group>
    </MantineButton>
  )
}

const MainTabs = ({ contents, active, setActive, proposalNum, ...props }: TabsProps & { proposalNum: number }) => {
  const [openedDialog, { open: openDialog, close: closeDialog }] =
    useDisclosure()
  const { main } = useAppSelector((state) => state.dashboard)
  const { lastModified, unseenChanges, isOpen } = useAppSelector((state) => state.editor)
  const dispatch = useAppDispatch()
  const handleOpenEditor = () => {
   !isOpen ? dispatch(openEditor()) : dispatch(dispatch(removeTab("editor")))
  }

  const filename = "context.py"
  const {
    data,
    error,
    isLoading,
    isFetching,
    refetch
  } = useCheckFileLastModifiedQuery({ proposalNum, filename }, { pollingInterval: 5000 })

  React.useEffect(() => {
    if (data?.lastModified && data?.lastModified !== lastModified) {
      dispatch(upadateLastModified({ lastModified: data.lastModified, isEditorVisible: main.currentTab === "editor" }))
    }
  }, [data?.lastModified, lastModified, dispatch])


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
              {id === "editor" && unseenChanges && (
                <div
                  style={{
                    display: "inline-block",
                    marginLeft: 8,
                    width: 10,
                    height: 10,
                    marginBottom: 2,
                    borderRadius: "50%",
                    background: "orange",
                    boxShadow: "0 0 8px 2px orange",
                    animation: "blink 1s infinite alternate",
                    verticalAlign: "middle",
                  }}
                />
              )}
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
        <style>
          {`
            @keyframes blink {
              0% { opacity: 1; }
              100% { opacity: 0.3; }
            }
          `}
        </style>
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

const Dashboard = () => {
  const dispatch = useAppDispatch()
  const { main, aside } = useAppSelector((state) => state.dashboard)
  const { run: selectedRun } = useAppSelector((state) => state.table.selection)

  const [openedNavBar, { toggle: toggleNavBar }] = useDisclosure()

  // Proposal: Check if it is fully loaded (at least the metadata)
  const { proposal, isLoading } = useCurrentProposal()
  if (isLoading) {
    return
  }

  // Main tabs
  const mainTabElements = {
    table: (
      <Suspense fallback={<div>Loading...</div>}>
        <Table />
      </Suspense>
    ),
    plots: (
      <Suspense fallback={<div>Loading...</div>}>
        <PlotsTab />
      </Suspense>
    ),
    editor: (
      <Suspense fallback={<div>Loading...</div>}>
        <EditorTab />
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
    ]),
  )

  // Aside tabs
  const populatedAsideTabs = Object.fromEntries(
    Object.entries(aside.tabs).map(([id, tab]) => {
      const extraProps = selectedRun
        ? { title: `${tab.title}: ${selectedRun}` }
        : {}
      return [
        id,
        {
          ...tab,
          ...extraProps,
          element: <Run />,
        },
      ]
    }),
  )

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{
        width: 300,
        breakpoint: "sm",
        collapsed: { desktop: !openedNavBar },
      }}
      aside={{
        width: 360,
        breakpoint: "sm",
        collapsed: { desktop: !aside.isOpened },
      }}
    >
      <AppShell.Header>
        <Header px={8}>
          <Group gap="sm" align="center">
            <Burger
              opened={openedNavBar}
              onClick={toggleNavBar}
              visibleFrom="sm"
              size="sm"
            />
            <Logo />
            <Stack gap={0}>
              <Flex gap={10} align="center">
                <InstrumentBadge instrument={proposal.instrument} />
                <Title order={5}>
                  {`p${proposal.number} - ${proposal.principal_investigator}`}
                </Title>
              </Flex>
              <Text size={rem(10)} c="dimmed" fs="italic">
                {proposal.title}
              </Text>
            </Stack>
          </Group>
        </Header>
      </AppShell.Header>
      <AppShell.Navbar p="md">
        {Array(15)
          .fill(0)
          .map((_, index) => (
            <Skeleton key={index} h={28} mt="sm" animate={false} />
          ))}
      </AppShell.Navbar>
      <AppShell.Main>
        <MainTabs
          contents={populatedMainTabs}
          active={main.currentTab}
          setActive={(id) => dispatch(setCurrentTab(id))}
          proposalNum={proposal.number}
        />
      </AppShell.Main>
      <AppShell.Aside p="xs">
        <Tabs
          contents={populatedAsideTabs}
          lastElement={
            <CloseButton ml="auto" onClick={() => dispatch(closeAside())} />
          }
        />
      </AppShell.Aside>
    </AppShell>
  )
}

export default Dashboard
