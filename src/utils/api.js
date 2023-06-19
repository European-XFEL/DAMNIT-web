const API = "";
const PROPOSAL_NUMBER = 2956;
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

function getTable({ pageSize = 100 } = {}) {
  const url = [
    `${API}/db?`,
    `page_size=${pageSize}`,
    `&table_name=${TABLE}`,
    `&proposal_number=${PROPOSAL_NUMBER}`,
  ];
  return fetch(url.join(""), { headers }).then((res) => res.json());
}

function getSchema() {
  const url = [
    `${API}/db/schema?`,
    `table_name=${TABLE}`,
    `&proposal_number=${PROPOSAL_NUMBER}`,
  ];
  return fetch(url.join(""), { headers }).then((res) => res.json());
}
