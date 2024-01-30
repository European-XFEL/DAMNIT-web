import { rest } from "msw"

const createHandler = (path, { body = "", status = 200, delay = 150 } = {}) => {
  return rest.get(path, (req, res, ctx) =>
    res(ctx.json(body), ctx.status(status), ctx.delay(delay)),
  )
}

const tableDataHandler = (response) => {
  return createHandler(`${import.meta.env.VITE_BACKEND_API}/db`, response)
}

const tableSchemaHandler = (response) => {
  return createHandler(
    `${import.meta.env.VITE_BACKEND_API}/db/schema`,
    response,
  )
}

export const handlers = [tableDataHandler, tableSchemaHandler]
