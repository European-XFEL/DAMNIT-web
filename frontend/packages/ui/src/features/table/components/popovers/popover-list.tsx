import {
  useId,
  useRef,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import {
  Anchor,
  Box,
  CloseButton,
  Divider,
  Highlight,
  rem,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
  VisuallyHidden,
  type AnchorProps,
} from '@mantine/core'
import { IconSearch, IconX } from '@tabler/icons-react'
import cx from 'clsx'

import { mutedC } from '#src/components/headings/section-heading'

import classes from './popover-list.module.css'

const SECTION_WIDTH = 38

// A count up to "99/999" measures 42 px at 11 px in the widest fallback font.
const COUNT_SECTION_WIDTH = SECTION_WIDTH + 42

type MatchCount = {
  current: number
  total: number
}

type SearchMatches = {
  // Left out while the first search is still waiting to run.
  count?: MatchCount
  onStep: (direction: 1 | -1) => void
  // Moves focus to the current match, or returns false to let Tab go on.
  onTabToMatch: () => boolean
}

type SearchInputProps = {
  value: string
  onChange: (value: string) => void
  placeholder: string
  // For a control elsewhere in the popover that removes itself when used and
  // needs somewhere to leave focus.
  inputRef?: RefObject<HTMLInputElement>
  matches?: SearchMatches
}

function describeMatchCount({ current, total }: MatchCount) {
  if (total === 0) {
    return 'No matches'
  }
  return `${current} of ${total} ${total === 1 ? 'match' : 'matches'}`
}

function SearchInput({
  value,
  onChange,
  placeholder,
  inputRef,
  matches,
}: SearchInputProps) {
  const ownRef = useRef<HTMLInputElement>(null)
  const ref = inputRef ?? ownRef

  // An IME ends a word with Enter too, and that Enter belongs to the word.
  // Safari sends it after the composition ends, as key code 229.
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (
      matches == null ||
      event.key !== 'Enter' ||
      event.nativeEvent.isComposing ||
      event.keyCode === 229
    ) {
      return
    }
    event.preventDefault()
    matches.onStep(event.shiftKey ? -1 : 1)
  }

  const handleClearKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (matches == null || event.key !== 'Tab' || event.shiftKey) {
      return
    }
    if (matches.onTabToMatch()) {
      event.preventDefault()
    }
  }

  return (
    <>
      <TextInput
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        onKeyDown={handleKeyDown}
        size="sm"
        // The rows it filters are xs, and a size of its own would shrink the box
        // with the text. The search mark takes the placeholder's grey.
        styles={{
          input: { fontSize: 'var(--mantine-font-size-xs)' },
          section: { color: 'var(--mantine-color-gray-7)' },
        }}
        placeholder={placeholder}
        leftSection={<IconSearch style={{ width: rem(14), height: rem(14) }} />}
        // Matched sections put the placeholder on the popover's title column.
        leftSectionWidth={rem(SECTION_WIDTH)}
        rightSectionWidth={rem(
          matches == null ? SECTION_WIDTH : COUNT_SECTION_WIDTH
        )}
        // The section lies over the end of the box, so a click on the count
        // reaches the text under it. Only the button answers, by its own rule.
        rightSectionPointerEvents="none"
        rightSection={
          value === '' ? undefined : (
            <Box
              className={classes.searchEnd}
              style={{ '--clear-width': rem(SECTION_WIDTH) }}
            >
              {/* The status below says it in words. */}
              {matches?.count != null && (
                <Text
                  component="span"
                  className={classes.count}
                  fz={11}
                  c={mutedC}
                  aria-hidden
                >
                  {matches.count.current}/{matches.count.total}
                </Text>
              )}
              <span className={classes.clearSlot}>
                <CloseButton
                  size="sm"
                  icon={
                    <IconX
                      style={{ width: rem(16), height: rem(16) }}
                      stroke={1.5}
                    />
                  }
                  aria-label="Clear search"
                  onKeyDown={handleClearKeyDown}
                  // The button goes with the text, so focus goes back to the
                  // box.
                  onClick={() => {
                    onChange('')
                    ref.current?.focus()
                  }}
                />
              </span>
            </Box>
          )
        }
        variant="unstyled"
        style={{ minWidth: 100 }}
      />
      {/* Always rendered, so the first count lands in a watched region. */}
      <VisuallyHidden role="status">
        {matches?.count == null || value === ''
          ? ''
          : describeMatchCount(matches.count)}
      </VisuallyHidden>
    </>
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
  c = 'indigo.7',
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
      size="xxs"
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
  highlight?: string
  isCurrent?: boolean
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
  highlight = '',
  isCurrent = false,
  lead = <div className={classes.lead} />,
  control,
  details,
  isOpen,
  onToggle,
}: ListRowProps) {
  const detailsId = useId()

  const titleText = (
    <Highlight
      component="span"
      highlight={highlight}
      fz="xs"
      c={muted ? mutedC : undefined}
      fs={italic ? 'italic' : undefined}
      lineClamp={1}
      title={columnTitle}
    >
      {columnTitle}
    </Highlight>
  )

  return (
    <>
      <div
        className={cx(classes.row, {
          [classes.member]: isMember,
          [classes.current]: isCurrent,
        })}
        aria-current={isCurrent || undefined}
      >
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
