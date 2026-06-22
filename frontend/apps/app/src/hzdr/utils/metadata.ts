import type { HZDRShot } from '../types'

export function getNestedMetadataValue(
  metadata: Record<string, unknown>,
  keyPath: string
) {
  return keyPath.split('.').reduce<unknown>((currentValue, key) => {
    if (
      currentValue &&
      typeof currentValue === 'object' &&
      !Array.isArray(currentValue)
    ) {
      return (currentValue as Record<string, unknown>)[key]
    }
    return undefined
  }, metadata)
}

export function flattenObjectKeys(
  value: Record<string, unknown>,
  prefix = ''
): string[] {
  return Object.entries(value).flatMap(([key, nestedValue]) => {
    const fullKey = prefix ? `${prefix}.${key}` : key
    if (
      nestedValue &&
      typeof nestedValue === 'object' &&
      !Array.isArray(nestedValue)
    ) {
      return flattenObjectKeys(nestedValue as Record<string, unknown>, fullKey)
    }
    return [fullKey]
  })
}

export function getNumericMetadataKeys(shots: HZDRShot[]) {
  return Array.from(
    new Set(
      shots.flatMap((shot) =>
        flattenObjectKeys(shot.metadata).filter((key) => {
          const value = getNestedMetadataValue(shot.metadata, key)
          return typeof value === 'number' && Number.isFinite(value)
        })
      )
    )
  ).sort()
}

export function countNumericValues(shots: HZDRShot[], key: string) {
  return shots.filter((shot) => {
    const value = getNestedMetadataValue(shot.metadata, key)
    return typeof value === 'number' && Number.isFinite(value)
  }).length
}

export function collectNumericMetadataTrendValues(
  shots: HZDRShot[],
  key: string
) {
  return shots.flatMap((shot) => {
    const value = getNestedMetadataValue(shot.metadata, key)
    return typeof value === 'number' && Number.isFinite(value)
      ? [{ shotNumber: shot.shot_number, value }]
      : []
  })
}
