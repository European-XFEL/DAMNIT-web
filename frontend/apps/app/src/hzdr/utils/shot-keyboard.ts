/** Up or Down with no modifier: the keys that move the table's selection. */
export function isTableArrowKey(event: {
  key: string
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  defaultPrevented?: boolean
}) {
  return (
    (event.key === 'ArrowUp' || event.key === 'ArrowDown') &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    !event.defaultPrevented
  )
}

const TEXT_ROLES = [
  'combobox',
  'listbox',
  'option',
  'textbox',
  'slider',
  'spinbutton',
  'menu',
  'menuitem',
]

/**
 * Whether an arrow key belongs to the focused control rather than the table:
 * text fields, selects, sliders and anything editable keep their own keys.
 */
export function shouldIgnoreTableArrowKey(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return true
  }
  if (target.isContentEditable) {
    return true
  }
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
    return true
  }
  const role = target.closest('[role]')?.getAttribute('role')
  return Boolean(role && TEXT_ROLES.includes(role))
}
