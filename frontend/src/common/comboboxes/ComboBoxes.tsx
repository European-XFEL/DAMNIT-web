import { useState } from "react";
import { Combobox, useCombobox, ComboboxTarget, TextInput } from "@mantine/core";

//Common component for comboboxes
function TextCombobox(props: {
  columns: string[],
  value: string,
  setValue: object,
  label?: string,
  placeholder?: string,
  costumeclass?: string
  error?: string}){
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });

  const checkVariable = (item) => (item.toLowerCase().includes(props.value.toLowerCase()))
  const shouldFilterOptions = !props.columns.some((item) => item === props.value);
  const filteredOptions = shouldFilterOptions
    ? props.columns.filter(checkVariable)
    : props.columns;

  const options = filteredOptions.map((item) => (
    <Combobox.Option value={item} key={item}>
      {item}
    </Combobox.Option>
  ));

  return(
    <div className={props.costumeclass}>
      <Combobox
        store={combobox}
        withinPortal={false}
        onOptionSubmit={(val) => {
          props.setValue(val);
          combobox.closeDropdown();
        }}
      >
        <ComboboxTarget>
          <TextInput
            label={props.label}
            placeholder={props.placeholder}
            value={props.value}
            onChange={(event) => {
              props.setValue(event.currentTarget.value);
              combobox.openDropdown();
              combobox.updateSelectedOptionIndex();
            }}
            onClick={() => combobox.openDropdown()}
            onFocus={() => combobox.openDropdown()}
            onBlur={() => {
              if (!props.columns.some(checkVariable)) {
                props.setValue('');
                combobox.closeDropdown()
              } else {
                combobox.closeDropdown()
                }
              }
            }
            error={props.error}
          />
        </ComboboxTarget>

        <Combobox.Dropdown>
          <Combobox.Options mah={200} style={{ overflowY: 'auto' }}>
            {options.length === 0 ? <Combobox.Empty>Variable not found</Combobox.Empty> : options}
          </Combobox.Options>
        </Combobox.Dropdown>
      </Combobox>
    </div>
  );
}

export default TextCombobox;