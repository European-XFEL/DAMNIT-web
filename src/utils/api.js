const API = "";
const DATABASE =
  "%2Fgpfs%2Fexfel%2Fexp%2FSCS%2F202202%2Fp002956%2Fusr%2FShared%2Famore%2Fruns.sqlite";

const headers = {
  Accept: "application/json",
};

export const tableService = {
  getTable,
};

function getTable({ pageSize = 1 } = {}) {
  const url = [
    `${API}/db?`,
    `page_size=${pageSize}`,
    `&table_name=runs`,
    `&db=${DATABASE}`,
  ];
  return fetch(url.join(""), { headers }).then((res) => res.json());
}
