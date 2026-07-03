# e2e examples

The `xpcs` base data (`runs.json` + `context.py`) is the demo's canonical
example, read directly from `apps/demo/public/examples/xpcs/` by `xpcs/index.ts`.
There is one copy, so the demo and the e2e mocks cannot drift apart; if the
example is ever regenerated, the assertions below break loudly instead of the
tests quietly running on stale data.

Only the auth and proposal responses are authored here, because the app needs
them but the demo does not expose them.

## xpcs fact sheet (what tests may assert on)

Source: `apps/demo/public/examples/xpcs/` (proposal 6996).

- **Proposal:** 6996 (`p6996`)
- **Instrument:** MID
- **Principal investigator:** Christian Gutt
- **Title:** MHz XPCS enabled studies of dynamics, interactions and aggregation
  phenomena in protein solutions
- **Runs:** 13 (run numbers 1-13)
- **Variables:** 13, including `run`. Cell dtypes: `number`, `string`, `image`
  (base64 PNG data URIs).
- **Tags:** "Run details", "Beam properties", "XPCS"

## Files

- `xpcs/index.ts` - loads the base data from the demo plus the authored
  responses below into the typed `xpcs` example used by the mock router.
- `xpcs/userinfo.json` - authored wire response for `GET /oauth/userinfo`
  (`proposals_by_year_half` holds `6996`). Returning it makes the app behave as
  logged in.
- `xpcs/proposal-metadata.json` - authored response array for the
  `ProposalMetadata` query. Drives the dashboard header (number, instrument,
  PI, title).
