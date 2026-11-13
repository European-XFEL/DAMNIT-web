# Managed campaign publishing to SciCat

This is an opt-in caller contract. Deploy the plugin's `/scicat/publish` endpoint
with service authentication and a backed-up persistent registration journal
before enabling it in DAMNIT. These source changes do not enable a running
deployment or migrate existing SciCat records.

The production, HZDR and pilot examples select this managed endpoint while
leaving registration disabled until configured. DAMNIT is the default campaign
publisher: publish a coherent canonical snapshot with explicit missing/review
coverage, then keep its PID updated as curation progresses. Final scientific
approval is not required to catalogue a clearly provisional snapshot, and is
never inferred by registration. Direct Watchdog-to-SciCat publishing remains
off in its shipped normal/site/pilot configuration. Per-file publication is a
separate opt-in policy for stable, independently useful products.

```dotenv
DW_API_HZDR_SCICAT__ENABLED=true
DW_API_HZDR_SCICAT__PLUGIN_URL=http://127.0.0.1:5001
DW_API_HZDR_SCICAT__ENDPOINT=publish
DW_API_HZDR_SCICAT__PUBLISHER=damnit
DW_API_HZDR_SCICAT__API_KEY=configure-locally-do-not-commit
DW_API_HZDR_SCICAT__DATASET_TYPE=raw
DW_API_HZDR_SCICAT__TIMEOUT=120.0
```

The API key authenticates DAMNIT to the plugin. SciCat URL/token remain in the
plugin's own configuration. The publisher name must remain stable across key
rotation and service restarts. Ownership defaults and optional verified
`CATALOGUE_INSTRUMENT_ID`, `CATALOGUE_PROPOSAL_ID` and `CATALOGUE_SAMPLE_ID` may be
configured. Empty catalogue settings explicitly suppress legacy metadata-ID
fallback. The old `INSTRUMENT_ID` value is kept descriptively as
`configured_instrument`; a campaign slug is not assumed to be a proposal ID.
Managed campaign publishing currently supports raw masters; derived provenance
is not inferred from the fact that DAMNIT wrote the file.

Optional `PREVIEW_PATH=overview.png` names an existing PNG/JPEG overview inside
each campaign folder (absolute paths are also explicit). `PREVIEW_CAPTION` supplies
its caption. No image is auto-selected or generated, and preview contents are
included in skip detection. Images are bounded to 256 KiB. Core registration may
succeed while an optional preview is partial; the caller retains the PID and
retries the preview instead of treating it as a successful snapshot to skip.
Preview support is best-effort and remains unset in shipped configurations.
Missing image-update permission does not block later campaign metadata/file
updates. Never upload acquisition files as attachments.

## Metadata and selected files

The builder assembles `hzdr-scicat-campaign-summary-v1` from the canonical
reconciliation output. It includes current shot count, superseded-record count,
shot-key/LabFrog-record coverage, earliest/latest canonical `fired_at`, separate
authority-number and LabFrog-local-count coverage/ranges, instrument IDs,
multiple target descriptions and canonical units, normalized event sources,
match statuses and review levels, bridge profile and available package version.
Unknown times/ranges are omitted; missing counts are explicit. Review levels
describe what is present in normalized events at this post-step, not a new
scientific approval or a substitute for catalogue sidecar rulings.

Each distinct-value list retains at most 64 entries with a truncation flag;
text fields are bounded to 256 characters. Targets use an explicit field
allowlist, excluding free-text notes and property bags. No per-shot or per-event
dump is sent. Multiple targets remain a list, not one supposed sample. Missing
facility/beamline/PI details are not guessed; the facility is HZDR, as in the
canonical source catalogue.

The inventory contains the master and only its explicit root links into
`shots/`. Unlinked files and raw acquisition directories are not scanned.
Every selected container is required, must exist and must resolve inside the
campaign folder. A stale/missing link makes registration partial/best-effort;
the build and previous dataset link are preserved. A worker relink can trigger
the next successful update. At most 10000 container links are accepted.

The caller computes bounded-read SHA-256 checksums and asks the plugin to verify
them. The skip fingerprint includes the actual selected file checksums, metadata,
catalogue fields and configuration. Metadata-only changes and companion-content
changes cannot be suppressed by a master-only hash. A rewritten master with
different physical bytes may require a checksum update even when its logical
content is the same; the managed PID remains stable.

## Outcomes and migration

The logical identity is `<source_key>/<campaign_id>`, scoped by publisher,
plugin target and owner. An initial request creates; later changed requests
pass the persisted PID as an explicit update. Unchanged local snapshots skip
the POST. Partial outcomes preserve the PID, failed stage and identity so a
later build can retry against the plugin's durable journal. Partial operations
never take the successful-snapshot skip path. The builder logs actual actions
rather than treating every repeated PID as unchanged.

An existing legacy PID, changed publisher identity or changed plugin target
returns `migration_required`, preserving the current link without a write.
The plugin does not infer which historical file blocks it owns. Choose and
review a per-campaign migration procedure before enabling this mode for existing
campaigns. It does not bulk migrate, merge or delete duplicate candidates.

Legacy `/from-json` and `/push` callers retain their prior payload and skip
semantics. The canonical legacy fixture remains, alongside the managed fixture
mirrored from `scicat_plugin/tests/fixtures/`. Topic 10 of the combo contract
register guards both copies.

## Verification status

The plugin has been tested against one synthetic dataset on the HZDR SciCat API,
including PID reuse, lost-write-response recovery and metadata/file updates.
DAMNIT's new caller is tested offline; it has not been enabled against production
campaigns. Full cross-repo gates must distinguish the pre-existing vendored
shot-aligner pack drift from these changes. No broker pass or deployment is
implied by focused test results.
