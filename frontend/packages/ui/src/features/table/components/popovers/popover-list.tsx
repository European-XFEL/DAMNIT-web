import { useId, useRef, type ReactNode, type RefObject } from 'react'
import {
  Anchor,
  CloseButton,
  Divider,
  rem,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
  type AnchorProps,
} from '@mantine/core'
import { IconSearch } from '@tabler/icons-react'
import cx from 'clsx'

import { mutedC } from '#src/components/headings/section-heading'

import classes from './popover-list.module.css'

type SearchInputProps = {
  value: string
  onChange: (value: string) => void
  placeholder: string
  // For a control elsewhere in the popover that removes itself when used and
  // needs somewhere to leave focus.
  inputRef?: RefObject<HTMLInputElement>
}

function SearchInput({
  value,
  onChange,
  placeholder,
  inputRef,
}: SearchInputProps) {
  const ownRef = useRef<HTMLInputElement>(null)
  const ref = inputRef ?? ownRef

  return (
    <TextInput
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.currentTarget.value)}
      size="sm"
      placeholder={placeholder}
      leftSection={<IconSearch size={14} />}
      // Matched sections put the placeholder on the popover's title column and
      // set each glyph the same distance in from its own edge.
      leftSectionWidth={rem(38)}
      rightSectionWidth={rem(38)}
      // Mantine leaves a section inert unless it is told otherwise, so without
      // this the button draws and cannot be clicked.
      rightSectionPointerEvents="all"
      rightSection={
        value === '' ? undefined : (
          <CloseButton
            size="sm"
            aria-label="Clear search"
            // The button goes with the text, so focus goes back to the box.
            onClick={() => {
              onChange('')
              ref.current?.focus()
            }}
          />
        )
      }
      variant="unstyled"
      style={{ minWidth: 100 }}
    />
  )
}

type PopoverListProps = {
  search: SearchInputProps
  // The footer's two ends. The end holds the one action for the checkboxes,
  // worded for what they mean; the start holds a reset for anything else.
  footerStart?: ReactNode
  footerEnd?: ReactNode
  // Shown under the rows when the search has left none.
  emptyMessage?: string
  children: ReactNode
}

// The frame both toolbar popovers draw their rows in. The footer always draws,
// so an action appearing in it does not grow the popover under the cursor.
export function PopoverList({
  search,
  footerStart,
  footerEnd,
  emptyMessage,
  children,
}: PopoverListProps) {
  return (
    <Stack gap={2} w={rem(288)}>
      <SearchInput {...search} />

      <Divider />

      {/* The drag library counts any scrolling ancestor as a second scroller,
          and only the viewport inside this box ever scrolls. */}
      <ScrollArea.Autosize
        mah="50vh"
        scrollbarSize={6}
        scrollbars="y"
        style={{ overflow: 'hidden' }}
      >
        {children}
        {emptyMessage != null && (
          <Text className={classes.empty} fz="xs" c={mutedC}>
            {emptyMessage}
          </Text>
        )}
      </ScrollArea.Autosize>

      <Divider />
      <div className={classes.footer}>
        <div className={classes.footerSlot}>{footerStart}</div>
        <div className={classes.footerSlot}>{footerEnd}</div>
      </div>
    </Stack>
  )
}

type PopoverLinkProps = Pick<AnchorProps, 'c' | 'td'> & {
  onClick: () => void
  'aria-label'?: string
  children: ReactNode
}

// The small text action both popovers use, in the footer and on a group heading.
export function PopoverLink({
  onClick,
  c = 'indigo',
  td,
  'aria-label': label,
  children,
}: PopoverLinkProps) {
  return (
    <Anchor
      component="button"
      type="button"
      aria-label={label}
      c={c}
      td={td}
      underline="hover"
      fz={11}
      onClick={onClick}
    >
      {children}
    </Anchor>
  )
}

type ListRowProps = {
  // Whole, since it names the title's button. A member draws only its
  // `columnTitle`, which a member of another group can share.
  title: string
  columnTitle?: string
  // A row whose column the table is not showing, or that a filter refuses.
  muted?: boolean
  // A row the app made up rather than one named by the context file.
  italic?: boolean
  // A member is indented past the rail its group draws.
  isMember?: boolean
  // What sits in the handle column. Left out, the column stays blank.
  lead?: ReactNode
  control: ReactNode
  // What the title opens. A row with nothing to open keeps its title out of the
  // tab order.
  details?: ReactNode
  isOpen: boolean
  onToggle: () => void
}

// One row of a popover list: the handle column, the title, the checkbox, and
// the details the title opens attached underneath.
export function ListRow({
  title,
  columnTitle = title,
  muted = false,
  italic = false,
  isMember = false,
  lead = <div className={classes.lead} />,
  control,
  details,
  isOpen,
  onToggle,
}: ListRowProps) {
  const detailsId = useId()

  const titleText = (
    <Text
      component="span"
      fz="xs"
      c={muted ? mutedC : undefined}
      fs={italic ? 'italic' : undefined}
      lineClamp={1}
      title={columnTitle}
    >
      {columnTitle}
    </Text>
  )

  return (
    <>
      <div className={cx(classes.row, { [classes.member]: isMember })}>
        {lead}

        {details == null ? (
          <span className={classes.title}>{titleText}</span>
        ) : (
          <UnstyledButton
            className={classes.title}
            onClick={onToggle}
            aria-label={title}
            aria-controls={detailsId}
            aria-expanded={isOpen}
          >
            {titleText}
          </UnstyledButton>
        )}

        {control}
      </div>

      {isOpen && details != null && (
        <div
          id={detailsId}
          className={cx(classes.details, {
            [classes.memberDetails]: isMember,
          })}
        >
          {details}
        </div>
      )}
    </>
  )
}
