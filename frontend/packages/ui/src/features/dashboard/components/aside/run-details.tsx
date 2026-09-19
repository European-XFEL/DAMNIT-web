import { useId } from 'react'
import { Image, ScrollArea, Skeleton, Text, rem } from '@mantine/core'

import CellErrorCard from '#src/components/feedback/cell-error-card'
import SectionHeading from '#src/components/headings/section-heading'
import { DTYPES } from '#src/constants'
import type { RunEntry } from '#src/data/table/run-entries'
import type { RunId } from '#src/data/table/table-data.types'
import { FONT_SIZE_DATA } from '#src/styles/fonts'
import { formatDate } from '#src/utils/helpers'
import {
  blockKey,
  type VariableBlock,
  type VariableGroupBlock,
} from '#src/utils/variable-blocks'

import classes from './run-details.module.css'
import { useRunEntries } from './use-run-entries'

// One line box for the title and either kind of value, so every row keeps the
// same rhythm whatever it holds.
const SCALAR_LINE = rem(22)

type EntryValueProps = {
  entry: RunEntry
}

function EntryValue({ entry }: EntryValueProps) {
  if (entry.state === 'error') {
    return <CellErrorCard error={entry.error} variant="panel" />
  }
  if (entry.state === 'blank') {
    return null
  }
  if (entry.state === 'no-preview') {
    return (
      <Text
        fz={FONT_SIZE_DATA}
        lh={SCALAR_LINE}
        fs="italic"
        className={classes.muted}
      >
        No preview
      </Text>
    )
  }
  if (entry.state === 'loading') {
    return <Skeleton mt={4} h={12} w={120} radius="sm" />
  }

  const { value, dtype } = entry
  switch (dtype) {
    case DTYPES.image:
      return <Image className={classes.image} src={String(value)} alt="" />
    case DTYPES.number:
      return <MonoValue>{String(value)}</MonoValue>
    case DTYPES.timestamp:
      return <MonoValue>{formatDate(Number(value))}</MonoValue>
    // Any other dtype prints the way the grid's text fallback prints it.
    default:
      return (
        <Text fz={FONT_SIZE_DATA} lh={SCALAR_LINE}>
          {String(value)}
        </Text>
      )
  }
}

type MonoValueProps = {
  children: string
}

// A Source Code Pro glyph is a fifth wider than the sans, so mono sits one
// step under the data size, as in the grid.
function MonoValue({ children }: MonoValueProps) {
  return (
    <Text fz="xs" lh={SCALAR_LINE} ff="monospace">
      {children}
    </Text>
  )
}

// An image, or the skeleton standing in for one, needs the panel's width.
function isStacked(entry: RunEntry) {
  return (
    (entry.state === 'value' || entry.state === 'loading') &&
    entry.dtype === DTYPES.image
  )
}

type EntryRowProps = {
  entry: RunEntry
}

// A member's column title drops its group's words; an ungrouped one's is whole.
function EntryRow({ entry }: EntryRowProps) {
  return (
    <div className={isStacked(entry) ? classes.stackedRow : classes.row}>
      <Text
        component="dt"
        size="xs"
        fw={500}
        lh={SCALAR_LINE}
        className={classes.title}
      >
        {entry.columnTitle}
      </Text>
      <dd className={classes.value}>
        <EntryValue entry={entry} />
      </dd>
    </div>
  )
}

type GroupBlockProps = {
  block: VariableGroupBlock<RunEntry>
}

// Members go by their short title, since the heading above says the rest.
function GroupBlock({ block }: GroupBlockProps) {
  const headingId = useId()

  return (
    <div role="group" aria-labelledby={headingId} className={classes.group}>
      <SectionHeading id={headingId}>{block.title}</SectionHeading>
      <dl className={classes.members}>
        {block.members.map((entry) => (
          <EntryRow key={entry.name} entry={entry} />
        ))}
      </dl>
    </div>
  )
}

type DrilledViewProps = {
  block: VariableBlock<RunEntry>
}

// One cell in a view of its own: its group's name above its title, and whatever
// it holds below at the panel's width.
function DrilledView({ block }: DrilledViewProps) {
  const entry = block.kind === 'group' ? block.members[0] : block

  return (
    <div className={classes.view}>
      {block.kind === 'group' && <SectionHeading>{block.title}</SectionHeading>}
      <Text fz={FONT_SIZE_DATA} fw={500}>
        {entry.columnTitle}
      </Text>
      <div className={classes.viewContent}>
        <EntryValue entry={entry} />
      </div>
    </div>
  )
}

type Section =
  | { kind: 'group'; block: VariableGroupBlock<RunEntry> }
  | { kind: 'entries'; entries: RunEntry[] }

// A heading may not sit inside a <dl>, so the ungrouped entries between two
// groups share a list of their own.
function toSections(blocks: VariableBlock<RunEntry>[]): Section[] {
  const sections: Section[] = []
  for (const block of blocks) {
    if (block.kind === 'group') {
      sections.push({ kind: 'group', block })
      continue
    }

    const last = sections.at(-1)
    if (last?.kind === 'entries') {
      last.entries.push(block)
    } else {
      sections.push({ kind: 'entries', entries: [block] })
    }
  }
  return sections
}

type RunDetailsProps = {
  run: RunId
  variable: string | null
}

function RunDetails({ run, variable }: RunDetailsProps) {
  const blocks = useRunEntries(run, variable)
  if (blocks == null) {
    return null
  }

  // Mostly what the user's filters leave; rarely a run with no value at all.
  if (blocks.length === 0) {
    return (
      // Italic, as in the nav's placeholder: the app speaking, not the run.
      <Text fz={FONT_SIZE_DATA} fs="italic" className={classes.muted}>
        No values to show
      </Text>
    )
  }

  return (
    <ScrollArea h="100%" offsetScrollbars>
      {variable != null ? (
        <DrilledView block={blocks[0]} />
      ) : (
        <div className={classes.list}>
          {toSections(blocks).map((section) =>
            section.kind === 'group' ? (
              <GroupBlock key={blockKey(section.block)} block={section.block} />
            ) : (
              <dl key={`entries:${section.entries[0].name}`}>
                {section.entries.map((entry) => (
                  <EntryRow key={entry.name} entry={entry} />
                ))}
              </dl>
            )
          )}
        </div>
      )}
    </ScrollArea>
  )
}

export default RunDetails
