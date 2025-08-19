/// <reference types="vite/client" />
export const BASE_URL = import.meta.env.BASE_URL
export const FULL_URL = window.location.origin + BASE_URL

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
