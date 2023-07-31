import React from "react"
import { DataEditor } from "@glideapps/glide-data-grid"

import Table from "@/features/table/Table"
import { size } from "@/utils/helpers"
import { renderWithProviders } from "../../test-utils/extensions"
import {
  gridProps,
  validTableData as validTableState,
  validTableColumns,
} from "../../test-utils/builders/table"

vi.mock("@glideapps/glide-data-grid", async () => ({
  ...(await vi.importActual("@glideapps/glide-data-grid")),
  DataEditor: vi.fn(() => <div id="DataEditor" />),
}))

describe("Table DataEditor", () => {
  it("is called with something", () => {
    renderWithProviders(<Table grid={gridProps} />, {
      preloadedState: {
        table: validTableState,
      },
    })

    expect(DataEditor).toBeRenderedWithProps({
      columns: validTableColumns,
      rows: size(validTableState.data),
    })
  })
})
