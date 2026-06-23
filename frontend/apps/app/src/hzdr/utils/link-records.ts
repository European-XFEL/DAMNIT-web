import type {
  HZDRSource,
  HZDRShot,
  LinkCollectionStatus,
  LinkRecordsDraft,
  BuiltLinkRecordsPackage,
} from '../types'

export function buildLinkRecordsDraft({
  sources,
  campaignKey,
  selectedSourceKey,
  collections,
  shotNumberQuery,
}: {
  sources: HZDRSource[]
  campaignKey: string
  selectedSourceKey: string | null
  collections: string[]
  shotNumberQuery: string
}): LinkRecordsDraft {
  const normalizedCampaignKey = campaignKey.trim() || null
  const shotNumber = parseShotNumberFilter(shotNumberQuery)
  const candidateSources = sources.filter((source) => {
    if (selectedSourceKey && source.key !== selectedSourceKey) {
      return false
    }
    return sourceMatchesCampaign(source, normalizedCampaignKey)
  })
  const linkedRecords = candidateSources.flatMap((source) =>
    source.shots
      .filter((shot) => shotNumber === null || shot.shot_number === shotNumber)
      .map((shot) => ({
        source_key: source.key,
        source_title: source.title,
        shot_number: shot.shot_number,
        shot_id:
          String(shot.metadata.shot_id ?? '') ||
          `shot-${String(shot.shot_number).padStart(6, '0')}`,
        hdf5_path: shot.hdf5_path ?? null,
        collections: collections.map((collection) =>
          collectionStatusForShot(collection, shot)
        ),
      }))
  )

  return {
    campaign_key: normalizedCampaignKey,
    target_source_key: selectedSourceKey,
    search: {
      collections,
      shot_number: shotNumber,
      searched_sources: candidateSources.length,
    },
    linked_records: linkedRecords,
    output_targets: ['coherent-json', 'combined-hdf5', 'damnit-table'],
    review_required: true,
    unresolved: linkedRecords.length
      ? linkedRecords.flatMap((record) =>
          record.collections
            .filter((collection) => collection.status === 'missing')
            .map(
              (collection) =>
                `Shot ${record.shot_number}: ${collection.collection} not visible in loaded metadata`
            )
        )
      : ['No matching records are visible from the current HZDR sources.'],
  }
}

export function buildLinkRecordsReviewPackage(
  draft: LinkRecordsDraft
): BuiltLinkRecordsPackage {
  const sourceCount = new Set(
    draft.linked_records.map((record) => record.source_key)
  ).size

  return {
    ...draft,
    built_at: new Date().toISOString(),
    coherent_json: {
      campaign_key: draft.campaign_key,
      shots: draft.linked_records,
    },
    hdf5_plan: {
      source_count: sourceCount,
      row_count: draft.linked_records.length,
      mode: 'review-before-write',
    },
    damnit_table_plan: {
      columns: ['shot_number', 'shot_id', ...draft.search.collections],
      rows: draft.linked_records.length,
    },
  }
}

export function parseShotNumberFilter(value: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }
  const parsed = Number(trimmed)
  return Number.isInteger(parsed) ? parsed : null
}

export function sourceMatchesCampaign(
  source: HZDRSource,
  campaignKey: string | null
) {
  if (!campaignKey) {
    return true
  }
  return collectSearchText([source.key, source.title, source.metadata])
    .toLowerCase()
    .includes(campaignKey.toLowerCase())
}

export function collectSearchText(values: unknown[]): string {
  const parts: string[] = []
  const visit = (value: unknown) => {
    if (value === null || value === undefined) {
      return
    }
    if (['string', 'number', 'boolean'].includes(typeof value)) {
      parts.push(String(value))
      return
    }
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    if (typeof value === 'object') {
      Object.values(value).forEach(visit)
    }
  }
  values.forEach(visit)
  return parts.join(' ')
}

export function collectionStatusForShot(
  collection: string,
  shot: HZDRShot
): LinkCollectionStatus {
  if (collection === 'shots') {
    return {
      collection,
      status: 'matched',
      detail: 'loaded shot row',
    }
  }
  if (collection === 'watchdog') {
    return shot.metadata.watchdog_status
      ? {
          collection,
          status: 'matched',
          detail: String(shot.metadata.watchdog_status),
        }
      : {
          collection,
          status: 'missing',
          detail: 'no watchdog fields in loaded metadata',
        }
  }

  if (collection === 'shotcounter') {
    return {
      collection,
      status: shot.metadata.shot_id ? 'matched' : 'candidate',
      detail: String(shot.metadata.shot_id ?? 'shot number available'),
    }
  }
  return {
    collection,
    status: 'candidate',
    detail: 'collection selected for agent lookup',
  }
}
