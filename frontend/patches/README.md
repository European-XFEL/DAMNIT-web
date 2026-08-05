# Patches

Local fixes to third-party packages, applied by pnpm through the
`patchedDependencies` map in `pnpm-workspace.yaml`. A version bump makes
`pnpm install` fail until the patch is regenerated:

```sh
pnpm patch <package>@<version>   # edit the printed directory, then:
pnpm patch-commit <printed-path>
```

The package's `exports` map resolves to `dist/`, so `src/` edits are inert.
Patch both `dist/cjs` and `dist/esm`.

## `@glideapps/glide-data-grid`

Pressing a scrollbar starts a cell drag, which autoscrolls the grid along the
other axis. The grid's mousedown guard rejects presses past the scroller's
border box, but scrollbars sit inside it, between the client box and the border
box, so a press on one is never rejected. The patch measures the client box.

Still present on upstream `main`, and reported there as
[#1034](https://github.com/glideapps/glide-data-grid/issues/1034), which reaches
the same cause from the other end: the press lands on whatever sits under the
scrollbar. Drop the patch once that is fixed.

The patch only recognises scrollbars that take layout space. Overlay scrollbars
sit over the client box, so a press on one looks exactly like a press on a cell
and still gets through. Covered by
`e2e/tests/app/table/scrollbar-drag.spec.ts`.
