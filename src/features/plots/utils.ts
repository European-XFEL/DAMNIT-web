function generateUID() {
  return (
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15)
  );
}

export function formatPlot({ variable, runs, type = "scatter" }) {
  return {
    id: generateUID(),
    variable,
    runs,
    type,
  };
}
