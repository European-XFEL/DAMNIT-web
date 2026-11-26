# Changelog

All notable changes to DAMNIT-web are written here, for the people who use it.
The format follows [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Column resizing by drag, fit to content and reset.
- Tag filter in the table toolbar.
- Column groups in the Variables popover.
- Sparklines for 1D summary arrays.
- Colored cells with tooltips for failed variables, and image previews on hover.
- Warning on the run count when runs fail to load, with Try again.
- Proposal column for databases with guest runs.
- Screen reader labels on the toolbar popovers.
- Plots in their own browser window.
- Time a summary plot's data was computed, in the status bar.
- Status bar along the bottom of the dashboard.
- Try now and Reload for lost live updates.
- Proposal and view names in the browser tab.
- Failure details of an inspected cell in the side panel.
- Ctrl+F search in the context file, and its scroll position kept across tabs.
- Visit counts with Umami on the site, the app and the demo.

### Changed

- Clicking a cell selects its row, and the arrow keys move the selection.
- Variable visibility set in the Variables popover, no longer on a settings page.
- Variables popover search highlights matches instead of filtering.
- New plot dialog in a new order, with its variables grouped.
- Closing a tab returns to the previous tab.
- Run tab title reads `Run 12`.
- Every cycle expanded in the proposal list.
- One look for tooltips and popovers.
- One typography across pages.

### Removed

- Proposals with DAMNIT data only in `amore-online`.

### Fixed

- Table pages that failed to load now retry on their own.
- Grid scrolling while dragging a scrollbar.
- Window resizing stalls in Firefox with many image cells.
- Values of variables named like JavaScript built-ins.
- Plots of a cell's preview data.
- Preview plots of guest runs.
- Plot frame not shrinking back to 16:9.
- Live updates stopping after a long outage, and values missed meanwhile.
- Live updates left open after logout.
- Return to the visited page after login.
- Login for users with no EuXFEL group.
- Proposals behind a `usr/` symlink.
- Opening a proposal by URL before its DAMNIT data was found.
- Proposal details after a MyMdC change.
- State left over from the previous proposal.
- Fewer "database is locked" errors in DAMNIT while DAMNIT-web reads.

### Deployment

- Deploy the API from the checkout's root with `--podman-build-args="--network=host"`, as `api/docs/deployment.md` shows.
- API certificate in `api/certs/cert.bundle` and `api/certs/cert.key`.
- `UMAMI_WEBSITE_ID` and `UMAMI_HOST_URL` in `frontend/.env`.
- On the test host, the frontend mounts `/var/log/webserver` and no longer `frontend/certs`.

## [0.2.0] - 2026-01-22

### Added

- Variable visibility settings.
- Table scroll position kept across tabs.
- Read-only context file tab that follows changes.
- Context file status bar.
- Site with links to the app and the demo.
- Demo with example XPCS data.

### Changed

- Same centered loader in every view.
- Login through EuXFEL Keycloak.
- Faster proposal list.
- More visible footer links and contact details.
- EuXFEL logo as favicon.

### Fixed

- Side panel showing hidden variables.
- Runs added by hand missing from the table.
- Plots of newly added runs, and the dashboard reset on leaving a proposal.
- Variables of the previous proposal showing briefly.
- Pages waiting on MyMdC lookups.

### Deployment

- Frontend served by Docker Compose with `frontend/compose.prod.yml`: `PUBLIC_URL`, `APP_BASE_PATH`, `DEMO_BASE_PATH` and `API_URL` in `frontend/.env`, certificates in `/data/certs/`.
- API served by Podman Compose with `api/compose.prod.yml`, over HTTPS on port 8443, settings in `api/.env`.
- API cache in the SQLite file at `DW_API_DB_PATH`, replacing `damnit_proposals.json`.
- Keycloak client values in `DW_API_AUTH__CLIENT_ID`, `DW_API_AUTH__CLIENT_SECRET` and `DW_API_AUTH__SERVER_METADATA_URL`.

## [0.1.1] - 2025-01-16

### Added

- Plotting from any non-empty cell.

### Changed

- Faster table on proposals with heavy data.
- Variable titles in the plot dialog.
- Faster plotting.

### Fixed

- Live table updates.

## [0.1.0] - 2024-08-02

### Added

- The first version of DAMNIT-web.

[Unreleased]: https://github.com/European-XFEL/DAMNIT-web/compare/0.2.0...HEAD
[0.2.0]: https://github.com/European-XFEL/DAMNIT-web/compare/0.1.1...0.2.0
[0.1.1]: https://github.com/European-XFEL/DAMNIT-web/compare/0.1.0...0.1.1
[0.1.0]: https://github.com/European-XFEL/DAMNIT-web/releases/tag/0.1.0
