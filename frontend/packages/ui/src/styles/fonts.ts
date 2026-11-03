export const FONT_NAME_SANS = 'Source Sans 3 Variable'
export const FONT_NAME_MONO = 'Source Code Pro Variable'

// Mantine's default stacks, copied so the node tests need not load Mantine.
const SYSTEM_SANS =
  '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif, Apple Color Emoji, Segoe UI Emoji'
const SYSTEM_MONO =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace'

export const FONT_FAMILY_SANS = `'${FONT_NAME_SANS}', ${SYSTEM_SANS}`
export const FONT_FAMILY_MONO = `'${FONT_NAME_MONO}', ${SYSTEM_MONO}`

// The body scale in px. theme.ts turns these into the rem tokens the DOM
// reads; the grid and Plotly take the number itself.
export const FONT_SIZES = {
  xxs: 12,
  xs: 13,
  sm: 15,
  md: 17,
  lg: 19,
  xl: 21,
}

// What a run's values are drawn at, in the grid and in the run panel alike.
// The grid is the source of truth, so both sides read this one number.
export const FONT_SIZE_DATA = 14
