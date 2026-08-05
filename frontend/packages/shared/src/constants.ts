// The dtypes the server's @lightweight directive holds back on the table's
// first pass (mirrors the API's HEAVY_DATA). A null value with one of these is
// a blank still being fetched; a null with any other dtype is a genuinely empty
// cell. Shared so the client and the mock server track the API in lockstep.
export const HEAVY_DTYPES = new Set<string>(['image', 'array1d'])

// The preview dtypes the plots feature can render; only an array carries dims
// and coords. Named like the summary dtypes above but a different payload.
export const PREVIEW_ARRAY_DTYPES = ['array1d', 'array2d'] as const
export const PREVIEW_SCALAR_DTYPES = [
  'image',
  'number',
  'string',
  'boolean',
  'timestamp',
  'none',
] as const

export const PREVIEW_DTYPES = new Set<string>([
  ...PREVIEW_ARRAY_DTYPES,
  ...PREVIEW_SCALAR_DTYPES,
])
