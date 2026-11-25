import { readFileSync } from 'node:fs'

import type { Runs } from '@damnit-frontend/shared/mocks'
import { columnIndex } from '@damnit-frontend/testing/playwright/grid'

// Read from the demo's own public folder, so the specs follow whatever it ships.
const folder = new URL('../../../public/examples/xpcs/', import.meta.url)

function readExampleFile(name: string) {
  return readFileSync(new URL(name, folder), 'utf-8')
}

const { meta } = JSON.parse(readExampleFile('runs.json')) as Runs

export const RUN_COUNT = meta.runs.length

export const CONTEXT_FILE = readExampleFile('context.py')

export function columnOf(name: string): number {
  return columnIndex(Object.keys(meta.variables), name)
}

export function titleOf(name: string): string {
  return meta.variables[name].title
}
