import React from "react"
import { DataEditor } from "@glideapps/glide-data-grid"

import Table, { EXCLUDED_VARIABLES } from "@/features/table/Table"
import { renderWithProviders } from "../../test-utils/extensions"
import {
  gridProps,
  validTableMetadata,
  validTableState,
} from "../../test-utils/builders/table"

vi.mock("@glideapps/glide-data-grid", async () => ({
  ...(await vi.importActual("@glideapps/glide-data-grid")),
  DataEditor: vi.fn(() => <div id="DataEditor" />),
}))

describe("Table DataEditor", () => {
  it("is called with something", () => {
    renderWithProviders(<Table grid={gridProps} />, {
      preloadedState: {
        tableData: validTableState,
      },
    })

    const validTableColumns = Object.values(validTableMetadata.variables)
      .filter((variable) => !EXCLUDED_VARIABLES.includes(variable.name))
      .map((variable) => ({
        id: variable.name,
        title: variable.title,
        width: 100,
      }))

    expect(DataEditor).toBeRenderedWithProps({
      columns: validTableColumns,
      rows: validTableMetadata.rows,
    })
  })
})
