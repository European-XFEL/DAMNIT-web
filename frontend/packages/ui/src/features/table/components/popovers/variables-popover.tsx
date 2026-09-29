import {
  createContext,
  useContext,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import lodashSize from 'lodash/size'
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DraggableChildrenFn,
  type DraggableProvided,
  type DropResult,
} from '@hello-pangea/dnd'
import { Divider, Stack, rem } from '@mantine/core'
import { useDebouncedCallback } from '@mantine/hooks'
import {
  IconCheck,
  IconCircle,
  IconGripVertical,
  IconList,
  IconPinned,
} from '@tabler/icons-react'
import cx from 'clsx'

import { useTableMeta, useTableVariables } from '#src/data/table/use-table-meta'
import {
  useColumnVisibilityFromTags,
  useColumnVisibilityFromVariables,
} from '#src/features/table/hooks/use-column-visibility'
import { useOpenRows } from '#src/features/table/hooks/use-open-rows'
import {
  selectColumnOrder,
  selectColumnPinning,
  selectTagSelection,
} from '#src/features/table/stores/table.selectors'
import {
  columnMoved,
  columnOrderReset,
  setColumnVisibility,
} from '#src/features/table/stores/table.slice'
import {
  buildColumnBlocks,
  type Column,
  type ColumnBlock,
  type ColumnGroupBlock,
} from '#src/features/table/utils/column-blocks'
import { findColumnMatches } from '#src/features/table/utils/column-matches'
import {
  BLOCKS_DROPPABLE,
  membersDroppable,
  reorderColumns,
} from '#src/features/table/utils/column-reorder'
import { pinnedFirst } from '#src/features/table/utils/pinned-columns'
import { blockKey, itemsOf, variableKey } from '#src/utils/variable-blocks'
import { useAppDispatch, useAppSelector } from '#src/app/store/hooks'
import SectionHeading, {
  mutedC,
} from '#src/components/headings/section-heading'

import { ListRow, PopoverLink, PopoverList } from './popover-list'
import { RowItemCheckbox, RowList, RowSection } from './row-details'
import { BasePopover } from './base-popover'
import classes from './popover-list.module.css'

const buildVisibility = (names: string[], isVisible: boolean) =>
  Object.fromEntries(names.map((name) => [name, isVisible]))

// The list's open rows and its highlight, reached from every row however deep
// its group nests it.
const ListContext = createContext<{
  openRows: ReturnType<typeof useOpenRows>
  highlight: {
    search: string
    currentKey?: string
    targetId: (key: string) => string
  }
} | null>(null)

type VariableDetailsProps = {
  tags: string[]
}

function VariableDetails({ tags }: VariableDetailsProps) {
  const tagSelection = useAppSelector(selectTagSelection)

  const items = tags.map((tagName) => ({
    name: tagName,
    title: tagName,
    selected: !!tagSelection?.[tagName],
  }))

  const selectedCount = items.reduce(
    (acc, item) => acc + Number(item.selected),
    0
  )

  return (
    <RowSection
      header="Tags"
      info={`${selectedCount}/${lodashSize(items)} selected`}
    >
      <RowList
        items={items}
        renderIndicator={({ selected, color, size }) =>
          selected ? (
            <IconCheck style={{ width: rem(size), height: rem(size), color }} />
          ) : (
            <IconCircle
              style={{ width: rem(6), height: rem(6), color }}
              stroke={4}
            />
          )
        }
      />
    </RowSection>
  )
}

// Shows or hides a set of variables at once. The underline marks a set the tag
// filter refuses.
type VisibilityActionProps = {
  allShown: boolean
  onToggle: (isVisible: boolean) => void
  passesTagFilter?: boolean
  matchCount?: number
  // Named in the link's accessible name, so a group's link is not just another
  // "Hide all". It keeps the visible words, which is what the name has to say.
  groupTitle?: string
}

function VisibilityAction({
  allShown,
  onToggle,
  passesTagFilter = true,
  matchCount,
  groupTitle,
}: VisibilityActionProps) {
  const verb = allShown ? 'Hide' : 'Show'
  const label =
    matchCount == null
      ? `${verb} all`
      : `${verb} ${matchCount} ${matchCount === 1 ? 'match' : 'matches'}`

  return (
    <PopoverLink
      aria-label={groupTitle == null ? undefined : `${label} ${groupTitle}`}
      c={passesTagFilter ? undefined : mutedC}
      td={passesTagFilter ? undefined : 'underline'}
      onClick={() => onToggle(!allShown)}
    >
      {label}
    </PopoverLink>
  )
}

// Even, like the handle column, so the icon centres on a whole pixel over the
// rail. An odd size lands on a half pixel and the browser paints it right.
const HANDLE_ICON_SIZE = 14

// The only thing that lifts a row, named for the column it moves. The copy a
// preview draws is not a handle and announces nothing.
type GripProps = {
  label: string
  handleProps?: DraggableProvided['dragHandleProps']
  id?: string
}

function Grip({ label, handleProps, id }: GripProps) {
  return (
    <div
      {...handleProps}
      id={handleProps == null ? undefined : id}
      className={classes.grip}
      aria-label={handleProps == null ? undefined : `Reorder ${label}`}
    >
      <IconGripVertical
        style={{ width: rem(HANDLE_ICON_SIZE), height: rem(HANDLE_ICON_SIZE) }}
      />
    </div>
  )
}

// Stands where the grip would, so a row that never moves says why.
function PinnedMark() {
  return (
    <div className={classes.pin} role="img" aria-label="Pinned" title="Pinned">
      <IconPinned
        style={{ width: rem(HANDLE_ICON_SIZE), height: rem(HANDLE_ICON_SIZE) }}
      />
    </div>
  )
}

type ColumnItemProps = {
  column: Column
  isMember?: boolean
  // A pinned row is not the user's to move, so it gets a pin, not a grip.
  isPinned?: boolean
  // Left out for a row that cannot move on its own: a pinned column, or a
  // member riding in its group's preview, whose grip is drawn but inert.
  provided?: DraggableProvided
  // Only a preview is ever marked as dragging. The library renders the original
  // as null while a clone stands in for it, so the class lands on the clone.
  isDragging?: boolean
}

// A column: the grip lifts it, the checkbox shows or hides it, the title opens
// its tags. A hidden column is dimmed, since it keeps its place in the order.
function ColumnItem({
  column,
  isMember = false,
  isPinned = false,
  provided,
  isDragging = false,
}: ColumnItemProps) {
  const dispatch = useAppDispatch()
  const list = useContext(ListContext)
  const openRows = list?.openRows
  const highlight = list?.highlight
  const {
    name,
    title,
    columnTitle,
    isVisible,
    canHide,
    passesTagFilter,
    tags,
  } = column
  const key = variableKey(name)
  const targetId = highlight?.targetId(key)

  return (
    <div
      ref={provided?.innerRef}
      className={cx(classes.item, { [classes.dragging]: isDragging })}
      {...provided?.draggableProps}
    >
      <ListRow
        title={title}
        columnTitle={columnTitle}
        muted={!isVisible || !passesTagFilter}
        isMember={isMember}
        highlight={highlight?.search}
        isCurrent={highlight?.currentKey === key}
        // An inert grip on a row nobody can move would invite a drag that does
        // nothing.
        lead={
          isPinned ? (
            <PinnedMark />
          ) : (
            <Grip
              label={title}
              handleProps={provided?.dragHandleProps}
              id={targetId}
            />
          )
        }
        control={
          <RowItemCheckbox
            // A pinned row has no grip, so a match lands on its checkbox.
            id={isPinned ? targetId : undefined}
            aria-label={title}
            checked={isVisible}
            disabled={!canHide}
            variant={passesTagFilter ? 'filled' : 'outline'}
            onChange={(e) =>
              dispatch(setColumnVisibility({ [name]: e.currentTarget.checked }))
            }
          />
        }
        // Tags are all the details there are, so an untagged column has
        // nothing to open.
        details={tags.length > 0 ? <VariableDetails tags={tags} /> : undefined}
        isOpen={openRows?.openNames.has(name) ?? false}
        onToggle={() => openRows?.toggle(name)}
      />
    </div>
  )
}

type DraggableColumnProps = {
  column: Column
  isMember?: boolean
  index: number
}

function DraggableColumn({ index, ...item }: DraggableColumnProps) {
  return (
    <Draggable draggableId={variableKey(item.column.name)} index={index}>
      {(provided) => <ColumnItem provided={provided} {...item} />}
    </Draggable>
  )
}

type GroupBlockProps = {
  block: ColumnGroupBlock
  provided: DraggableProvided
  isDragging?: boolean
  children: ReactNode
}

// A group heads the members it carries. Its grip is the only way to move the
// whole block, and the link beside it speaks for every member below.
function GroupBlock({
  block,
  provided,
  isDragging,
  children,
}: GroupBlockProps) {
  const dispatch = useAppDispatch()
  const highlight = useContext(ListContext)?.highlight
  const { innerRef, draggableProps, dragHandleProps } = provided

  const key = blockKey(block)
  const isCurrent = highlight?.currentKey === key
  const names = block.members.map((member) => member.name)

  return (
    <div
      ref={innerRef}
      className={cx(classes.block, { [classes.dragging]: isDragging })}
      {...draggableProps}
    >
      <div
        className={cx(classes.groupHeader, { [classes.current]: isCurrent })}
        aria-current={isCurrent || undefined}
      >
        <Grip
          label={block.title}
          handleProps={dragHandleProps}
          id={highlight?.targetId(key)}
        />
        <span className={classes.title}>
          <SectionHeading highlight={highlight?.search}>
            {block.title}
          </SectionHeading>
        </span>
        <VisibilityAction
          groupTitle={block.title}
          allShown={block.members.every((member) => member.isVisible)}
          passesTagFilter={block.members.some(
            (member) => member.passesTagFilter
          )}
          onToggle={(isVisible) =>
            dispatch(setColumnVisibility(buildVisibility(names, isVisible)))
          }
        />
      </div>
      {children}
    </div>
  )
}

type MemberListProps = {
  block: ColumnGroupBlock
}

// The list a group's members reorder in. It takes nothing from outside the
// group: it is the only one of its type, so a member has nowhere else to land.
function MemberList({ block }: MemberListProps) {
  return (
    <Droppable
      droppableId={membersDroppable(block.name)}
      type={membersDroppable(block.name)}
      renderClone={(clone, _snapshot, rubric) => (
        <ColumnItem
          column={block.members[rubric.source.index]}
          isMember
          provided={clone}
          isDragging
        />
      )}
    >
      {(memberList) => (
        <div ref={memberList.innerRef} {...memberList.droppableProps}>
          {block.members.map((member, index) => (
            <DraggableColumn
              key={member.name}
              column={member}
              isMember
              index={index}
            />
          ))}
          {memberList.placeholder}
        </div>
      )}
    </Droppable>
  )
}

type DraggableGroupProps = {
  block: ColumnGroupBlock
  index: number
}

function DraggableGroup({ block, index }: DraggableGroupProps) {
  return (
    <Draggable draggableId={blockKey(block)} index={index}>
      {(provided) => (
        <GroupBlock block={block} provided={provided}>
          <MemberList block={block} />
        </GroupBlock>
      )}
    </Draggable>
  )
}

function VariableList() {
  const dispatch = useAppDispatch()
  const [query, setQuery] = useState('')
  // What the list has searched and its current match, set together. The match
  // is kept by key, so a change in the order of the matches keeps it.
  const [searched, setSearched] = useState<{ search: string; key?: string }>({
    search: '',
  })
  const variables = useTableVariables()
  const { groups } = useTableMeta()
  const { start: pinned } = useAppSelector(selectColumnPinning)
  const hasOrder = useAppSelector(selectColumnOrder).length > 0
  const visibility = useColumnVisibilityFromVariables()
  const tagFilter = useColumnVisibilityFromTags()
  const openRows = useOpenRows()
  const searchRef = useRef<HTMLInputElement>(null)
  const idPrefix = useId()

  // Pinned columns are not the user's to move, but they still lead the stored
  // order, or every other reader would find them at its end.
  const { start, centre } = useMemo(
    () => pinnedFirst(variables, pinned),
    [variables, pinned]
  )

  // A pinned column leads the list and shows what it is, but it never moves.
  const built = useMemo(() => {
    const build = (columns: typeof variables) =>
      buildColumnBlocks({ variables: columns, groups, visibility, tagFilter })

    return { blocks: build(centre), pinnedColumns: itemsOf(build(start)) }
  }, [start, centre, groups, visibility, tagFilter])

  const live = { ...built, found: searched }

  // A drag reads the list as the library measured it, so a live run push landing
  // mid-drag cannot shift a row under the drop, nor a search scroll one away.
  const [frozen, setFrozen] = useState<typeof live | null>(null)
  const { blocks, pinnedColumns, found } = frozen ?? live

  const rows = useMemo(
    () => [
      ...pinnedColumns.map(
        (column): ColumnBlock => ({ kind: 'variable', ...column })
      ),
      ...blocks,
    ],
    [pinnedColumns, blocks]
  )
  const matches = useMemo(
    () => findColumnMatches(rows, found.search),
    [rows, found.search]
  )
  const isSearching = found.search !== ''

  const current =
    matches.find((match) => match.key === found.key) ?? matches.at(0)
  const currentIndex = current == null ? -1 : matches.indexOf(current)

  const targetId = (key: string) => `${idPrefix}${key}`
  const element = (key: string) => document.getElementById(targetId(key))

  // Only the list scrolls, and only when the match is out of its view.
  const scrollToMatch = (key: string) => {
    const target = element(key)
    const viewport = target?.closest('.mantine-ScrollArea-viewport')
    if (target == null || viewport == null || frozen != null) {
      return
    }
    const box = target.getBoundingClientRect()
    const view = viewport.getBoundingClientRect()
    if (box.top >= view.top && box.bottom <= view.bottom) {
      return
    }
    viewport.scrollTop += box.top - view.top - (view.height - box.height) / 2
  }

  const runSearch = (text: string) => {
    const search = text.trim()
    if (search === searched.search) {
      return
    }
    const key = findColumnMatches(rows, search).at(0)?.key
    setSearched({ search, key })
    if (key !== undefined) {
      scrollToMatch(key)
    }
  }
  const searchLater = useDebouncedCallback(runSearch, 200)

  // Enter on text the list has not searched yet runs that search now, and its
  // first match is current.
  const step = (direction: 1 | -1) => {
    if (query.trim() !== searched.search) {
      runSearch(query)
      return
    }
    if (matches.length === 0) {
      return
    }
    const next =
      matches[(currentIndex + direction + matches.length) % matches.length].key
    setSearched({ search: searched.search, key: next })
    scrollToMatch(next)
  }

  const handleDragEnd = (result: DropResult) => {
    const move = reorderColumns(blocks, result)
    setFrozen(null)
    if (move != null) {
      const order = [...start.map(({ name }) => name), ...move.order]
      dispatch(columnMoved({ order, moved: move.moved }))
    }
  }

  // Mantine's transform would offset a preview's `position: fixed`, so both
  // lists drag a clone, which the library renders outside the popover.
  const renderBlockClone: DraggableChildrenFn = (clone, _snapshot, rubric) => {
    const block = blocks[rubric.source.index]
    return block.kind === 'group' ? (
      <GroupBlock block={block} provided={clone} isDragging>
        {block.members.map((member) => (
          <ColumnItem key={member.name} column={member} isMember />
        ))}
      </GroupBlock>
    ) : (
      <ColumnItem column={block} provided={clone} isDragging />
    )
  }

  const hideable = (
    isSearching
      ? matches.flatMap((match) =>
          match.kind === 'column' ? [match.column] : []
        )
      : [...pinnedColumns, ...itemsOf(blocks)]
  ).filter((column) => column.canHide)
  const hideableNames = hideable.map((column) => column.name)

  // The box counts nothing until the text typed in it has been searched.
  const count = isSearching
    ? { current: currentIndex + 1, total: matches.length }
    : undefined

  const highlight = { search: found.search, currentKey: current?.key, targetId }

  return (
    <ListContext.Provider value={{ openRows, highlight }}>
      <DragDropContext
        onBeforeCapture={() => setFrozen(live)}
        onDragEnd={handleDragEnd}
      >
        <PopoverList
          search={{
            value: query,
            onChange: (value) => {
              setQuery(value)
              // An empty box is never a word half typed, so it waits for nothing.
              if (value.trim() === '') {
                runSearch('')
              }
              searchLater(value)
            },
            placeholder: 'Search variables',
            inputRef: searchRef,
            matches:
              query.trim() === ''
                ? undefined
                : { count, onStep: step, onTabToMatch: () => false },
          }}
          // Back to the server's order. It appears once the user has moved
          // something, and goes when used.
          footerStart={
            hasOrder && (
              <PopoverLink
                onClick={() => {
                  dispatch(columnOrderReset())
                  searchRef.current?.focus()
                }}
              >
                Reset order
              </PopoverLink>
            )
          }
          // With nothing to act on, the link says nothing rather than
          // "Hide all".
          footerEnd={
            hideableNames.length > 0 && (
              <VisibilityAction
                allShown={hideable.every((column) => column.isVisible)}
                matchCount={isSearching ? hideable.length : undefined}
                onToggle={(isVisible) =>
                  dispatch(
                    setColumnVisibility(
                      buildVisibility(hideableNames, isVisible)
                    )
                  )
                }
              />
            )
          }
        >
          {pinnedColumns.map((column) => (
            <ColumnItem key={column.name} column={column} isPinned />
          ))}

          {/* Where the columns that stay put end and the ones a drag moves
              begin, drawn only with rows on both sides. */}
          {pinnedColumns.length > 0 && blocks.length > 0 && (
            <Divider className={classes.pinnedDivider} />
          )}

          <Droppable
            droppableId={BLOCKS_DROPPABLE}
            type={BLOCKS_DROPPABLE}
            renderClone={renderBlockClone}
          >
            {(blockList) => (
              <Stack
                ref={blockList.innerRef}
                {...blockList.droppableProps}
                gap={0}
              >
                {blocks.map((block, index) =>
                  block.kind === 'group' ? (
                    <DraggableGroup
                      key={blockKey(block)}
                      block={block}
                      index={index}
                    />
                  ) : (
                    <DraggableColumn
                      key={blockKey(block)}
                      column={block}
                      index={index}
                    />
                  )
                )}
                {blockList.placeholder}
              </Stack>
            )}
          </Droppable>
        </PopoverList>
      </DragDropContext>
    </ListContext.Provider>
  )
}

export function VariablesPopover() {
  const visibilityFromTags = useColumnVisibilityFromTags()
  const visibilityFromVariables = useColumnVisibilityFromVariables()
  const notVisibleCount = Object.entries(visibilityFromVariables).reduce(
    (acc, [name, isVisible]) =>
      acc +
      Number(
        (visibilityFromTags == null || visibilityFromTags[name]) && !isVisible
      ),
    0
  )

  return (
    <BasePopover
      icon={IconList}
      label="Variables"
      badge={notVisibleCount ? `${notVisibleCount} hidden` : undefined}
    >
      <VariableList />
    </BasePopover>
  )
}
