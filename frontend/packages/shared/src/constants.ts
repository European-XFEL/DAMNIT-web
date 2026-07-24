// The dtypes the server's @lightweight directive holds back on the table's
// first pass (mirrors the API's HEAVY_DATA). A null value with one of these is
// a blank still being fetched; a null with any other dtype is a genuinely empty
// cell. Shared so the client and the mock server track the API in lockstep.
export const HEAVY_DTYPES = new Set<string>(['image', 'rgba', 'array'])
