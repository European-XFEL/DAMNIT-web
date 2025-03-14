import { memo, useState } from "react"
import { Link } from "react-router-dom"
import { Box, Code, Group, rem, Stack, Text } from "@mantine/core"
import {
  IconCalendarEvent,
  IconChevronRight,
  IconPlus,
} from "@tabler/icons-react"
import cx from "clsx"
import dayjs from "dayjs"
import { DataTable } from "mantine-datatable"

import { InstrumentBadge } from "../../components/badges"
import { useProposals } from "../../hooks"
import { isArrayEqual } from "../../utils/array"
import { orderBy } from "../../utils/objects"
import styles from "./ProposalsList.module.css"

const formatRunCycle = (date: string) => {
  const year = date.slice(0, 4)
  const month = date.slice(4, 6)
  const period = month === "01" ? "I" : "II"
  return `${year} - ${period}`
}

const ExpandedCell = memo(function ExpandedCell({ Component, isExpanded }) {
  return (
    <Component
      className={cx(styles.icon, styles.expandIcon, {
        [styles.expandIconRotated]: isExpanded,
      })}
    />
  )
})

const CycleCell = memo(function CycleCell({ cycle, isExpanded }) {
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

const InstrumentCell = memo(function InstrumentCell(props) {
  return <InstrumentBadge {...props} />
})

const TextCell = memo(function TextCell({ text, link, ...props }) {
  const component = <Text {...props}>{text}</Text>

  return <Group>{link ? <Link to={link}>{component}</Link> : component}</Group>
})

const DateCell = memo(function DateCell({ datetime, ...props }) {
  const date = dayjs(datetime)
  return (
    <TextCell
      text={date.format("MMMM DD, YYYY")}
      className={styles.proposalDate}
      {...props}
    />
  )
})

const ProposalContent = memo(function ProposalContent({ title, damnit_path }) {
  return (
    <Stack className={styles.content} p="xs" gap={6} pl={65} pr={65}>
      <Group gap={6}>
        <Text size="xs" className={styles.contentLabel} c="dark.4">
          Title:
        </Text>
        <Text size="xs">{title}</Text>
      </Group>
      <Group gap={6}>
        <Text size="xs" className={styles.contentLabel} c="dark.4">
          Path:
        </Text>
        <Code style={{ fontSize: rem(11) }}>{damnit_path}</Code>
      </Group>
    </Stack>
  )
})

const ProposalSubTable = memo(function ProposalSubTable({ proposals }) {
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
      minHeight={isLoading ? 100 : 0}
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
          width: 50,
          render: ({ instrument }) => (
            <InstrumentCell instrument={instrument} size="sm" />
          ),
          cellsStyle: () => (_) => ({ paddingLeft: 0 }),
        },
        {
          accessor: "proposal",
          noWrap: true,
          textAlign: "right",
          render: ({ number }) => (
            <TextCell text={number} link={`/proposal/${number}`} size="sm" />
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
              size="sm"
            />
          ),
        },
        {
          accessor: "start_date",
          noWrap: true,
          render: ({ start_date }) => (
            <DateCell datetime={start_date} size="xs" />
          ),
        },
      ]}
      records={
        isLoading
          ? []
          : proposalInfo
              .concat()
              .sort(orderBy(["start_date", "instrument"], ["desc", "asc"]))
      }
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
      <span className={styles.proposalDate}>Beamtime date</span>
    </Group>
  )
}

const ProposalsList = ({ proposals }) => {
  const cycles = Object.keys(proposals).sort((a, b) => Number(b) - Number(a))
  //.slice(0, 2) // REMOVEME

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
