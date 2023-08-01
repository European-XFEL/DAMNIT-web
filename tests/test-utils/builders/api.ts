import { rest } from "msw"

const createHandler = (path, { body = "", status = 200, delay = 150 } = {}) => {
  return rest.get(path, (req, res, ctx) =>
    res(ctx.json(body), ctx.status(status), ctx.delay(delay)),
  )
}

export const tableDataHandler = (response) => {
  return createHandler(`${import.meta.env.VITE_BACKEND_API}/db`, response)
}

export const tableSchemaHandler = (response) => {
  return createHandler(
    `${import.meta.env.VITE_BACKEND_API}/db/schema`,
    response,
  )
}
