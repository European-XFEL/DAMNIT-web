import { memo, useState } from "react"
import { Link } from "react-router-dom"
import { Box, Code, Group, Stack } from "@mantine/core"
import {
  IconCalendarEvent,
  IconChevronRight,
  IconPlus,
} from "@tabler/icons-react"
import cx from "clsx"
import dayjs from "dayjs"
import { DataTable } from "mantine-datatable"

import { InstrumentBadge } from "../../common/badges"
import { useProposals } from "../../hooks"
import { isArrayEqual } from "../../utils/array"
import styles from "./ProposalsList.module.css"

const formatRunCycle = (date: string) => {
  const year = date.slice(0, 4)
  const month = date.slice(4, 6)
  const period = month === "01" ? "I" : "II"
  return `${year} - ${period}`
}

const ExpandedCell = memo(({ Component, isExpanded }) => {
  return (
    <Component
      className={cx(styles.icon, styles.expandIcon, {
        [styles.expandIconRotated]: isExpanded,
      })}
    />
  )
})

const CycleCell = memo(({ cycle, isExpanded }) => {
  return (
    <Group gap={0}>
      <ExpandedCell Component={IconChevronRight} isExpanded={isExpanded} />
      <Group component="span" ml={10} gap={6}>
        <IconCalendarEvent className={cx(styles.icon)} />
        <span>{formatRunCycle(cycle)}</span>
      </Group>
    </Group>
  )
})

const InstrumentCell = memo(({ instrument }) => {
  return <InstrumentBadge instrument={instrument} />
})

const TextCell = memo(({ text, link }) => {
  const component = <span>{text}</span>

  return link ? <Link to={link}>{component}</Link> : component
})

const DateCell = memo(({ datetime }) => {
  const date = dayjs(datetime)
  return <TextCell text={date.format("DD-MM-YYYY")} />
})

const ProposalContent = memo(({ title, damnit_path }) => {
  return (
    <Stack className={styles.details} p="xs" gap={6} pl={65} pr={65}>
      <Group gap={6}>
        <div className={styles.label}>Title:</div>
        <div>{title}</div>
      </Group>
      <Group gap={6}>
        <div className={styles.label}>Path:</div>
        <Code>{damnit_path}</Code>
      </Group>
    </Stack>
  )
})

const ProposalSubTable = memo(({ proposals }) => {
  const [expandedProposals, setExpandedProposals] = useState<number[]>([])
  const { proposals: proposalInfo, isLoading } = useProposals(proposals)

  const handleExpandedProposals = (newProposals) => {
    setExpandedProposals((currentProposals) => {
      return isArrayEqual(currentProposals, newProposals)
        ? currentProposals
        : newProposals
    })
  }

  return (
    <DataTable
      noHeader
      striped
      idAccessor="number"
      minHeight={100}
      columns={[
        {
          accessor: "id",
          noWrap: true,
          render: ({ number }) => (
            <Box component="span" ml={23} mr={5}>
              <ExpandedCell
                Component={IconPlus}
                isExpanded={expandedProposals.includes(number)}
              />
            </Box>
          ),
        },
        {
          accessor: "instrument",
          noWrap: true,
          render: ({ instrument }) => (
            <InstrumentCell instrument={instrument} />
          ),
          cellsStyle: () => (theme) => ({ paddingLeft: 0 }),
        },
        {
          accessor: "proposal",
          noWrap: true,
          textAlign: "right",
          render: ({ number }) => (
            <TextCell text={number} link={`/proposal/${number}`} />
          ),
        },
        {
          accessor: "principal_investigator",
          noWrap: true,
          width: "100%",
          render: ({ principal_investigator, number }) => (
            <TextCell
              text={principal_investigator}
              link={`/proposal/${number}`}
            />
          ),
        },
        {
          accessor: "start_date",
          noWrap: true,
          render: ({ start_date }) => <DateCell datetime={start_date} />,
        },
      ]}
      records={proposalInfo}
      fetching={isLoading}
      rowExpansion={{
        allowMultiple: true,
        expanded: {
          recordIds: expandedProposals,
          onRecordIdsChange: handleExpandedProposals,
        },
        content: ({ record }) => <ProposalContent {...record} />,
      }}
    />
  )
})

const ProposalHeader = () => {
  return (
    <Group justify="space-between">
      <span>Proposal</span>
      <span>Beamtime date</span>
    </Group>
  )
}

const ProposalsList = ({ proposals }) => {
  const cycles = Object.keys(proposals)
    .sort((a, b) => Number(b) - Number(a))
    .slice(0, 2) // REMOVEME

  const [expandedCycles, setExpandedCycles] = useState<number[]>(
    cycles.slice(0, 1), // Expand the most recent cycle by default
  )

  const handleExpandedCycles = (newCycles) => {
    setExpandedCycles((currentCycles) => {
      return isArrayEqual(currentCycles, newCycles) ? currentCycles : newCycles
    })
  }

  return (
    <DataTable
      withTableBorder
      withColumnBorders
      highlightOnHover
      idAccessor="cycle"
      columns={[
        {
          accessor: "cycle",
          title: <ProposalHeader />,
          noWrap: true,
          render: ({ cycle }) => (
            <CycleCell
              cycle={cycle}
              isExpanded={expandedCycles.includes(cycle)}
            />
          ),
        },
      ]}
      records={cycles.map((cycle) => ({
        cycle,
      }))}
      rowExpansion={{
        allowMultiple: true,
        expanded: {
          recordIds: expandedCycles,
          onRecordIdsChange: handleExpandedCycles,
        },
        content: ({ record }) => (
          <ProposalSubTable proposals={proposals[record.cycle]} />
        ),
      }}
    />
  )
}

export default ProposalsList
