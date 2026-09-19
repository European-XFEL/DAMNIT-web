import { useEffect, useState } from 'react'
import {
  Combobox,
  rem,
  ScrollArea,
  TextInput,
  useCombobox,
  type TextInputProps,
} from '@mantine/core'
import { IconCheck, IconChevronDown } from '@tabler/icons-react'

import SectionHeading from '#src/components/headings/section-heading'
import {
  blockKey,
  filterVariableBlocks,
  itemsOf,
  variableKey,
  type VariableBlock,
  type VariableItem,
} from '#src/utils/variable-blocks'

import classes from './variable-combobox.module.css'

export type VariableComboboxProps = Omit<
  TextInputProps,
  'value' | 'onChange'
> & {
  blocks: VariableBlock[]
  // A variable name; none is chosen while it is empty.
  value?: string
  onChange: (name: string) => void
}

function highlightedOptionId(listId: string | null) {
  return (
    document.querySelector(`#${listId} [data-combobox-selected]`)?.id ?? null
  )
}

export function VariableCombobox({
  blocks,
  value = '',
  onChange,
  onClick,
  onBlur,
  onKeyDown,
  ...inputProps
}: VariableComboboxProps) {
  const combobox = useCombobox({
    onDropdownClose: () => {
      combobox.resetSelectedOption()
      setHighlightedId(null)
    },
  })

  // Null while the field shows the chosen title, so opening it lists every
  // variable rather than only the ones matching that title.
  const [query, setQuery] = useState<string | null>(null)

  const chosen = itemsOf(blocks).find((item) => item.name === value)
  const hasChosen = chosen !== undefined

  // Mantine points `aria-activedescendant` at the highlight only when an arrow
  // moves it, so the field names every highlight itself.
  const [highlightedId, setHighlightedId] = useState<string | null>(null)

  // What Enter would pick is always highlighted: the first match while a search
  // is typed, or the chosen variable when the list opens on it.
  const {
    dropdownOpened,
    listId,
    selectActiveOption,
    selectFirstOption,
    resetSelectedOption,
    updateSelectedOptionIndex,
  } = combobox
  useEffect(() => {
    if (!dropdownOpened) {
      return
    }
    if (query === null) {
      if (hasChosen) {
        selectActiveOption()
      }
    } else if (query.trim() === '') {
      resetSelectedOption()
    } else {
      selectFirstOption()
    }
    setHighlightedId(highlightedOptionId(listId))
  }, [
    dropdownOpened,
    query,
    hasChosen,
    listId,
    selectActiveOption,
    selectFirstOption,
    resetSelectedOption,
  ])

  // A reload can move or drop rows under an open list, so Enter's index and
  // the announced row are read again from the highlight.
  useEffect(() => {
    updateSelectedOptionIndex()
    setHighlightedId(highlightedOptionId(listId))
  }, [blocks, listId, updateSelectedOptionIndex])

  const shownBlocks =
    query === null ? blocks : filterVariableBlocks(blocks, query)

  // Named by the whole title: a member shows only its `columnTitle`, which a
  // member of another group can share.
  const renderOption = (item: VariableItem, label: string) => {
    const isChosen = item.name === value
    return (
      <Combobox.Option
        key={variableKey(item.name)}
        value={item.name}
        aria-label={item.title}
        // Only `active`: Mantine puts `aria-selected` on the highlighted row,
        // and a combobox list has one selected option at a time.
        active={isChosen}
      >
        <span>{label}</span>
        {isChosen && (
          <IconCheck style={{ width: rem(14), height: rem(14) }} aria-hidden />
        )}
      </Combobox.Option>
    )
  }

  return (
    <Combobox
      store={combobox}
      classNames={{
        dropdown: classes.dropdown,
        option: classes.option,
        group: classes.group,
        groupLabel: classes.groupLabel,
      }}
      onOptionSubmit={(name) => {
        onChange(name)
        setQuery(null)
        combobox.closeDropdown()
      }}
    >
      {/* Focus alone leaves the list shut: a field focused on opening would
          otherwise cover the form below it. A click, typing or an arrow opens. */}
      <Combobox.Target aria-activedescendant={highlightedId}>
        <TextInput
          {...inputProps}
          rightSection={
            <IconChevronDown
              style={{ width: rem(16), height: rem(16) }}
              stroke={1.5}
              aria-hidden
            />
          }
          rightSectionPointerEvents="none"
          value={query ?? chosen?.title ?? ''}
          onChange={(event) => {
            setQuery(event.currentTarget.value)
            combobox.openDropdown()
          }}
          onClick={(event) => {
            combobox.openDropdown()
            onClick?.(event)
          }}
          onBlur={(event) => {
            setQuery(null)
            combobox.closeDropdown()
            onBlur?.(event)
          }}
          // While a search is typed, Enter picks the highlighted match or does
          // nothing; it never submits a value the field is not showing.
          onKeyDown={(event) => {
            if (event.key === 'Enter' && query !== null) {
              event.preventDefault()
            }
            // Mantine moves the highlight after this handler returns.
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              queueMicrotask(() =>
                setHighlightedId(highlightedOptionId(listId))
              )
            }
            onKeyDown?.(event)
          }}
        />
      </Combobox.Target>

      <Combobox.Dropdown>
        <Combobox.Options>
          <ScrollArea.Autosize mah={300} type="scroll">
            {shownBlocks.length === 0 && (
              <Combobox.Empty>No variables match</Combobox.Empty>
            )}
            {shownBlocks.map((block) =>
              block.kind === 'variable' ? (
                renderOption(block, block.title)
              ) : (
                <Combobox.Group
                  key={blockKey(block)}
                  label={<SectionHeading>{block.title}</SectionHeading>}
                >
                  {block.members.map((member) =>
                    renderOption(member, member.columnTitle)
                  )}
                </Combobox.Group>
              )
            )}
          </ScrollArea.Autosize>
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  )
}
