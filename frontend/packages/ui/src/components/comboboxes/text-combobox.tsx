import { useState } from 'react'
import { Combobox, useCombobox, ComboboxTarget, TextInput } from '@mantine/core'

type TextComboboxProps = {
  options: { name: string; title: string }[]
  value: string
  setValue: (value: string) => void
  label?: string
  placeholder?: string
  error?: string
}

function TextCombobox(props: TextComboboxProps) {
  const selectedOpt = props.options.find((item) => item.name === props.value)
  const defaultText = selectedOpt?.title ?? ''
  const [search, setSearch] = useState(defaultText)
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  })

  const optionsToRender = search
    ? props.options.filter((item) =>
        item.title.toLowerCase().includes(search.toLowerCase())
      )
    : props.options

  const options = optionsToRender.map((item) => (
    <Combobox.Option value={item.name} key={item.name}>
      {item.title}
    </Combobox.Option>
  ))

  return (
    <div style={{ margin: '5px 2px' }}>
      <Combobox
        store={combobox}
        withinPortal={false}
        onOptionSubmit={(val) => {
          props.setValue(val)
          const newOpt = props.options.find((item) => item.name === val)
          if (newOpt) {
            setSearch(newOpt.title)
          }
          combobox.closeDropdown()
        }}
      >
        <ComboboxTarget>
          <TextInput
            label={props.label}
            placeholder={props.placeholder}
            value={search}
            onChange={(event) => {
              setSearch(event.currentTarget.value)
              combobox.openDropdown()
              combobox.updateSelectedOptionIndex()
            }}
            onClick={() => combobox.openDropdown()}
            onFocus={() => combobox.openDropdown()}
            onBlur={() => {
              setSearch(defaultText)
              combobox.closeDropdown()
            }}
            error={props.error}
          />
        </ComboboxTarget>

        <Combobox.Dropdown>
          <Combobox.Options mah={160} style={{ overflowY: 'auto' }}>
            {options.length === 0 ? (
              <Combobox.Empty>Variable not found</Combobox.Empty>
            ) : (
              options
            )}
          </Combobox.Options>
        </Combobox.Dropdown>
      </Combobox>
    </div>
  )
}

export default TextCombobox
