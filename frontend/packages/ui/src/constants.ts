/// <reference types="vite/client" />
import { HEAVY_DTYPES } from '@damnit-frontend/shared/constants'

import { formatUrl } from './utils/helpers'

// The dtypes @lightweight holds back on the table's first pass. Shared with the
// mock server so both track the API's HEAVY_DATA from one place.
export { HEAVY_DTYPES }

// An errorless null with a heavy dtype is a value @lightweight held back, not a
// genuine absence: only heavy dtypes are blanked, and a real failure carries an
// error. A null scalar is a cell DAMNIT has no value for. The cache merge policy
// and the table's deferred-fetch selector both decide "still to come" by this
// one rule, over their own cell shapes, so keeping it here stops them drifting.
export function isHeavyBlank({
  value,
  error,
  dtype,
}: {
  value: unknown
  error: unknown
  dtype: string
}): boolean {
  return value == null && error == null && HEAVY_DTYPES.has(dtype)
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
  array: 'array',
  string: 'string',
  number: 'number',
  timestamp: 'timestamp',
}

export const EXCLUDED_VARIABLES = ['proposal', 'added_at']

// `run` identifies the row rather than describing it, so it is never a column
// the user configures, and the run detail panel already shows it in the header.
export const NONCONFIGURABLE_VARIABLES = [...EXCLUDED_VARIABLES, 'run']
