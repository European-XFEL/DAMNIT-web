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

### A scrollbar press starts a cell drag

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

### A resize past the last column never says which column was grabbed

`onMouseDownImpl` in `internal/data-grid-dnd` starts a column resize down two
paths. The header path announces the grab through `onColumnResizeStart`; the
out-of-bounds path, which handles a press to the right of the last column, sets
the same state and says nothing. Both then reach the mouse-up handler that
re-sends the resize to every other selected column, so a consumer that uses
`onColumnResizeStart` to tell the grabbed column from the re-sent ones is blind
for one of the two gestures. In the table that let a press beside the last
column resize whatever else was selected: a drag handed the others its width, a
click with no movement collapsed them to the 50px minimum. The patch mirrors the
header path, which already has the bounds it needs.

The press has somewhere to land because the grid is sized to its columns plus
the width of a scrollbar (`data-editor.tsx`, `idealWidth`), whether or not one is
drawn, leaving a strip of dead space beside the last column. Headless Chromium
hides scrollbars, which makes that width zero and the strip disappear, so
`e2e/tests/app/table/resize-past-last-column.spec.ts` turns them back on with
`ignoreDefaultArgs: ['--hide-scrollbars']`. Without that the spec passes with the
patch reverted.

Still present on upstream `main`, and not yet reported there.

### A scrolled grid asks `verticalBorder` about the wrong column

`verticalBorder` is documented as the left-hand border of column `col`, and
`DataEditor` hands the consumer's function a source column, with the row-marker
offset already taken off. Four sites disagree once the grid scrolls sideways:

- `drawGridLines` and `drawExtraRowThemes` in
  `internal/data-grid/render/data-grid-render.lines.js` pass `index + 1`, a
  position in the visible window. It parts from the source column by one for
  every column scrolled out on the left, so the table's group edges stay in
  the band and leave the header and the cells. The patch passes
  `c.sourceIndex + 1`.
- `overdrawStickyBoundaries` in the same file and `drawGroups` in
  `data-grid-render.header.js` draw at the freeze edge but ask about the
  first visible scrollable column, which is whatever sits under the pinned
  ones. The pinned edge then comes and goes with the scroll offset. The patch
  asks about the first scrollable column, whose source index is the count of
  sticky columns.

A predicate that only names sticky columns never shows either, since sticky
columns keep their position. Covered by
`e2e/tests/app/table/grid-lines-after-scroll.spec.ts`.

Still present on upstream `main`, and not yet reported there.

## `plotly.js`

`react-plotly.js` loads `plotly.js/dist/plotly`, so the patch edits that one
bundle; `src/` edits are inert here too.

### The camera button exports nothing for a font name with a digit in it

Plotly's SVG export protects quoted font names by swapping each `"` for a
placeholder, setting the font-family again, and turning the placeholder into
`'` after serializing (`src/snapshot/tosvg.js`). A family with a word that
starts with a digit, like `"Source Sans 3 Variable"`, is not valid CSS once
unquoted, so the browser drops the new value and keeps the quotes. They
serialize as `&quot;`, and `htmlEntityDecode` then decodes them into a raw `"`
inside the `style` attribute. The SVG is no longer valid XML, the image never
loads, and the camera button downloads nothing. The patch keeps `&quot;`
escaped as `&#34;`.

The exported image still draws its text in a system font, because an SVG
drawn as an image cannot load the page's web fonts.

Still present on upstream `master`, and not yet reported there. Covered by
`e2e/tests/app/plots/summary-plot.spec.ts`.
