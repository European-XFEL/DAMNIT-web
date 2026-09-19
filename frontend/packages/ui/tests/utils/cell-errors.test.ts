import { describe, expect, test } from 'vitest'

import { errorText, errorVisuals } from '#src/utils/cell-errors'

describe('errorVisuals', () => {
  test('maps a skipped dependency', () => {
    expect(errorVisuals('Skip')).toEqual({
      kind: 'skipped',
      title: 'Missing dependency',
    })
  })

  test('maps missing source data', () => {
    expect(errorVisuals('SourceNameError')).toEqual({
      kind: 'missing',
      title: 'Missing data',
    })
  })

  test('falls back to a generic error for anything else', () => {
    expect(errorVisuals('ValueError')).toEqual({
      kind: 'error',
      title: 'Error',
    })
  })
})

describe('errorText', () => {
  test('joins the class and message with a newline', () => {
    expect(errorText({ cls: 'ValueError', message: 'boom' })).toBe(
      'ValueError\nboom'
    )
  })
})
