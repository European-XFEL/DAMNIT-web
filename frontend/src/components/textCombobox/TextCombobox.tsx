import { useState } from "react"
import { Combobox, useCombobox, ComboboxTarget, TextInput } from "@mantine/core"

//Common component for comboboxes
function TextCombobox(props: {
  options: { name: string; title: string }[]
  value: string
  setValue: object
  label?: string
  placeholder?: string
  error?: string
}) {
  const selectedOpt = props.options.find((item) => item.name === props.value)
  const haveSelection = selectedOpt !== undefined
  const [search, setSearch] = useState(haveSelection ? selectedOpt.title : "")
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  })

  // const checkVariable = (item) =>
  //   item.name.toLowerCase().includes(props.value.toLowerCase())
  const optionsToRender = search
    ? props.options.filter((item) =>
        (item.title || item.name).toLowerCase().includes(search.toLowerCase()),
      )
    : props.options

  const options = optionsToRender.map((item) => (
    <Combobox.Option value={item.name} key={item.name}>
      {item.title}
    </Combobox.Option>
  ))

  return (
    <div style={{ margin: "5px 2px" }}>
      <Combobox
        store={combobox}
        withinPortal={false}
        onOptionSubmit={(val) => {
          props.setValue(val)
          const new_opt = props.options.find((item) => item.name === val)
          new_opt && setSearch(new_opt.title || new_opt.name)
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
              setSearch(haveSelection ? selectedOpt.title : "")
              combobox.closeDropdown()
            }}
            error={props.error}
          />
        </ComboboxTarget>

        <Combobox.Dropdown>
          <Combobox.Options mah={160} style={{ overflowY: "auto" }}>
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
