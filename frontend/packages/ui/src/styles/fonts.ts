import { DEFAULT_THEME } from '@mantine/core'

export const FONT_NAME_SANS = 'Source Sans 3 Variable'
export const FONT_NAME_MONO = 'Source Code Pro Variable'

export const FONT_FAMILY_SANS = `'${FONT_NAME_SANS}', ${DEFAULT_THEME.fontFamily}`
export const FONT_FAMILY_MONO = `'${FONT_NAME_MONO}', ${DEFAULT_THEME.fontFamilyMonospace}`

// The body scale in px. theme.ts turns these into the rem tokens the DOM
// reads; Plotly takes the number itself.
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
