/// <reference types="vite/client" />
export const BASE_URL = import.meta.env.BASE_URL
export const CURRENT_HOST = `${window.location.protocol}//${window.location.host}`

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
