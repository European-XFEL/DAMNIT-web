import {
  createContext,
  useContext,
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
import { useDebouncedValue } from '@mantine/hooks'
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
  type ColumnGroupBlock,
} from '#src/features/table/utils/column-blocks'
import {
  BLOCKS_DROPPABLE,
  membersDroppable,
  reorderColumns,
} from '#src/features/table/utils/column-reorder'
import { pinnedFirst } from '#src/features/table/utils/pinned-columns'
import {
  blockKey,
  filterVariableBlocks,
  itemsOf,
  variableKey,
} from '#src/utils/variable-blocks'
import { useAppDispatch, useAppSelector } from '#src/app/store/hooks'
import SectionHeading, {
  mutedC,
} from '#src/components/headings/section-heading'

import { ControlButton } from './control-button'
import { ListRow, PopoverLink, PopoverList } from './popover-list'
import { RowItemCheckbox, RowList, RowSection } from './row-details'
import { BasePopover } from './base-popover'
import classes from './popover-list.module.css'

const buildVisibility = (names: string[], isVisible: boolean) =>
  Object.fromEntries(names.map((name) => [name, isVisible]))

// The list's open rows, reached from every row however deep its group nests it.
const OpenRowsContext = createContext<ReturnType<typeof useOpenRows> | null>(
  null
)

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
  // Named in the link's accessible name, so a group's link is not just another
  // "Hide all". It keeps the visible words, which is what the name has to say.
  groupTitle?: string
}

function VisibilityAction({
  allShown,
  onToggle,
  passesTagFilter = true,
  groupTitle,
}: VisibilityActionProps) {
  const label = allShown ? 'Hide all' : 'Show all'

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
}

function Grip({ label, handleProps }: GripProps) {
  return (
    <div
      {...handleProps}
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
  const openRows = useContext(OpenRowsContext)
  const {
    name,
    title,
    columnTitle,
    isVisible,
    canHide,
    passesTagFilter,
    tags,
  } = column

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
        // An inert grip on a row nobody can move would invite a drag that does
        // nothing.
        lead={
          isPinned ? (
            <PinnedMark />
          ) : (
            <Grip label={title} handleProps={provided?.dragHandleProps} />
          )
        }
        control={
          <RowItemCheckbox
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
  const { innerRef, draggableProps, dragHandleProps } = provided

  const names = block.members.map((member) => member.name)

  return (
    <div
      ref={innerRef}
      className={cx(classes.block, { [classes.dragging]: isDragging })}
      {...draggableProps}
    >
      <div className={classes.groupHeader}>
        <Grip label={block.title} handleProps={dragHandleProps} />
        <span className={classes.title}>
          <SectionHeading>{block.title}</SectionHeading>
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
  const [debouncedQuery] = useDebouncedValue(query, 200)
  const variables = useTableVariables()
  const { groups } = useTableMeta()
  const { start: pinned } = useAppSelector(selectColumnPinning)
  const hasOrder = useAppSelector(selectColumnOrder).length > 0
  const visibility = useColumnVisibilityFromVariables()
  const tagFilter = useColumnVisibilityFromTags()
  const openRows = useOpenRows()
  const searchRef = useRef<HTMLInputElement>(null)

  // Pinned columns are not the user's to move, but they still lead the stored
  // order, or every other reader would find them at its end.
  const { start, centre } = useMemo(
    () => pinnedFirst(variables, pinned),
    [variables, pinned]
  )

  const live = useMemo(() => {
    const build = (columns: typeof variables) =>
      buildColumnBlocks({ variables: columns, groups, visibility, tagFilter })

    const blocks = build(centre)

    return {
      blocks,
      shown: filterVariableBlocks(blocks, debouncedQuery),
      // A pinned column leads the list and shows what it is, but it never moves.
      pinnedColumns: itemsOf(
        filterVariableBlocks(build(start), debouncedQuery)
      ),
    }
  }, [start, centre, groups, visibility, tagFilter, debouncedQuery])

  // A drag reads the list as the library measured it, so a search or a live run
  // push landing mid-drag cannot shift a row under the drop.
  const [frozen, setFrozen] = useState<typeof live | null>(null)
  const { blocks, shown, pinnedColumns } = frozen ?? live

  // A drop lands beside its neighbour in the whole order, so the columns the
  // search left out stay where they are.
  const handleDragEnd = (result: DropResult) => {
    const move = reorderColumns({ blocks, shown }, result)
    setFrozen(null)
    if (move != null) {
      const order = [...start.map(({ name }) => name), ...move.order]
      dispatch(columnMoved({ order, moved: move.moved }))
    }
  }

  // Mantine's transform would offset a preview's `position: fixed`, so both
  // lists drag a clone, which the library renders outside the popover.
  const renderBlockClone: DraggableChildrenFn = (clone, _snapshot, rubric) => {
    const block = shown[rubric.source.index]
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

  const listedColumns = [...pinnedColumns, ...itemsOf(shown)]

  // The link speaks only for the columns the search left that the user can
  // hide, so with none of those it says nothing rather than "Hide all".
  const hideable = listedColumns.filter((column) => column.canHide)
  const hideableNames = hideable.map((column) => column.name)

  return (
    <OpenRowsContext.Provider value={openRows}>
      <DragDropContext
        onBeforeCapture={() => setFrozen(live)}
        onDragEnd={handleDragEnd}
      >
        <PopoverList
          search={{
            value: query,
            onChange: setQuery,
            placeholder: 'Search variables',
            inputRef: searchRef,
          }}
          emptyMessage={
            debouncedQuery.trim() !== '' && listedColumns.length === 0
              ? 'No variables match'
              : undefined
          }
          // Back to the server's order, all of it whatever the search shows.
          // It appears once the user has moved something, and goes when used.
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
          footerEnd={
            hideableNames.length > 0 && (
              <VisibilityAction
                allShown={hideable.every((column) => column.isVisible)}
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
          {pinnedColumns.length > 0 && shown.length > 0 && (
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
                {shown.map((block, index) =>
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
    </OpenRowsContext.Provider>
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
      renderTarget={({ opened, toggle }) => (
        <ControlButton
          onClick={toggle}
          isActive={opened}
          icon={IconList}
          label="Variables"
          badgeCount={notVisibleCount * -1}
        />
      )}
    >
      <VariableList />
    </BasePopover>
  )
}
