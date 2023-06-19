const API = "";
const PROPOSAL_NUMBER = 2956;
const TABLE = "runs";

const headers = {
  Accept: "application/json",
};

export const tableService = {
  getTableData,
  getTableSchema,
  getTable,
};

function getTableData({ pageSize = 100 } = {}) {
  const url = [
    `${API}/db?`,
    `page_size=${pageSize}`,
    `&table_name=${TABLE}`,
    `&proposal_number=${PROPOSAL_NUMBER}`,
  ];
  return fetch(url.join(""), { headers }).then((res) => res.json());
}

function getTableSchema() {
  const url = [
    `${API}/db/schema?`,
    `table_name=${TABLE}`,
    `&proposal_number=${PROPOSAL_NUMBER}`,
  ];
  return fetch(url.join(""), { headers }).then((res) => res.json());
}

function getTable() {
  return Promise.all([getTableData(), getTableSchema()]).then(
    ([data, schema]) => ({
      data,
      schema,
    })
  );
}
