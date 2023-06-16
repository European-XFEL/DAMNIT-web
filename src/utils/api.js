const API = "";
const DATABASE =
  "%2Fgpfs%2Fexfel%2Fexp%2FSCS%2F202202%2Fp002956%2Fusr%2FShared%2Famore%2Fruns.sqlite";
const TABLE = "runs";

const headers = {
  Accept: "application/json",
};

export const sharedService = {
  getInitialData,
};

function getInitialData() {
  return Promise.all([getTable(), getSchema()]).then(([table, schema]) => ({
    table: {
      data: table,
      schema,
    },
  }));
}

export const tableService = {
  getTable,
  getSchema,
};

function getTable({ pageSize = 1 } = {}) {
  const url = [
    `${API}/db?`,
    `page_size=${pageSize}`,
    `&table_name=${TABLE}`,
    `&db=${DATABASE}`,
  ];
  return fetch(url.join(""), { headers }).then((res) => res.json());
}

function getSchema() {
  const url = [`${API}/db/schema?`, `table_name=${TABLE}`, `&db=${DATABASE}`];
  return fetch(url.join(""), { headers }).then((res) => res.json());
}
