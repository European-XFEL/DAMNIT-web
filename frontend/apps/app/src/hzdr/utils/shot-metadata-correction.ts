/** Whether the correction forms may change a metadata key: not identity, status or history. */
export function isCorrectableMetadataKey(key: string) {
  return ![
    'shot_number',
    'shot_day',
    'fired_at',
    'status',
    'status_history',
    'reviewed_at',
    'reviewed_by',
    'review_note',
    'metadata_correction_history',
    'shot_id',
    'experiment_id',
    'combined_hdf5_path',
  ].includes(key)
}

export function formatMetadataCorrectionDraft(value: unknown) {
  if (value === undefined) {
    return ''
  }
  if (typeof value === 'string') {
    return value
  }
  return JSON.stringify(value, null, 2)
}

export function parseMetadataCorrectionDraft(draft: string): unknown {
  const trimmed = draft.trim()
  if (!trimmed) {
    return ''
  }
  try {
    return JSON.parse(trimmed)
  } catch {
    return draft
  }
}
