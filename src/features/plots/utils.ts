function generateUID() {
  return (
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15)
  );
}

export function formatPlot({ variables, runs, type = "scatter" }) {
  return {
    id: generateUID(),
    variables,
    runs,
    type,
  };
}
