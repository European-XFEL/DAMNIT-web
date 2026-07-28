/// <reference types="vite/client" />
import { HEAVY_DTYPES } from '@damnit-frontend/shared/constants'

import { formatUrl } from './utils/helpers'

// The dtypes @lightweight holds back on the table's first pass. Shared with the
// mock server so both track the API's HEAVY_DATA from one place.
export { HEAVY_DTYPES }

// A summary whose value is null under a heavy dtype is one @lightweight held
// back, not a genuine absence: only heavy dtypes are blanked, so a null scalar
// is a cell DAMNIT has no value for. Every caller that decides "still to come"
// reads this one rule over its own cell shape, so keeping it here stops them
// drifting.
export function isHeavySummaryBlank({
  value,
  dtype,
}: {
  value: unknown
  dtype: string
}): boolean {
  return value == null && HEAVY_DTYPES.has(dtype)
}

export const CONTACT_EMAIL = 'da@xfel.eu'

export const BASE_URL = formatUrl(import.meta.env.VITE_BASE_URL)
export const HTTP_URL = window.location.origin + BASE_URL

const wsProtocol = window.location.origin.startsWith('https') ? 'wss' : 'ws'
export const WS_URL = `${wsProtocol}://${window.location.host}${BASE_URL}`

export const EMPTY_VALUE = 'None'
export const VARIABLES = {
  proposal: 'proposal',
  run: 'run',
}
export const DTYPES = {
  image: 'image',
  array1d: 'array1d',
  string: 'string',
  number: 'number',
  timestamp: 'timestamp',
}

export const EXCLUDED_VARIABLES = ['added_at']

// `run` identifies the row rather than describing it, so it is never a column
// the user configures, and the run detail panel already shows it in the header.
export const NONCONFIGURABLE_VARIABLES = [...EXCLUDED_VARIABLES, 'run']

// Real, configurable columns the table leaves out of the default view. They
// stay hidden until the user turns them on in the Variables popover.
export const DEFAULT_HIDDEN_VARIABLES = ['proposal']

// A variable the user hasn't touched shows by default, unless it is hidden by
// default, in which case it stays hidden until explicitly turned on.
export function isVariableVisible(
  name: string,
  visibility: Record<string, boolean | undefined>
) {
  return visibility[name] ?? !DEFAULT_HIDDEN_VARIABLES.includes(name)
}
