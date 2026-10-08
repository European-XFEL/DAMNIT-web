import { expect, test } from 'vitest'

import { retryDelay } from '#src/graphql/live-updates'

test('the wait before reconnecting doubles from 1 s and stops at 30 s', () => {
  const waits = [0, 1, 2, 3, 4, 5, 6, 50].map((retries) => retryDelay(retries))

  expect(waits).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000])
})
