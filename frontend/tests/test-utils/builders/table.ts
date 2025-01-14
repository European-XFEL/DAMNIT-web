export const gridProps = {
  initialSize: [500, 500],
}

export const validTableData = {
  "448": {
    proposal: { value: 2956, dtype: "number" },
    run: { value: 448, dtype: "number" },
    start_time: { value: 1665264546765.0981, dtype: "timestamp" },
    added_at: { value: 1682887864430.31, dtype: "timestamp" },
    comment: { value: "None", dtype: "string" },
    rep_rate_laser: { value: 1.14, dtype: "number" },
    t0_from_bam: { value: 264.1849670410156, dtype: "number" },
    delay_mean: { value: 291.1703103718005, dtype: "number" },
    motor_stx: { value: -3.978009999999813, dtype: "number" },
    n_trains: { value: 3078, dtype: "number" },
    energy_min: { value: 928.0038686403836, dtype: "number" },
    energy_max: { value: 937.9920297832026, dtype: "number" },
    rep_rate_fel: { value: 1.14, dtype: "number" },
    hrixs_preview: {
      value:
        "iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAAOXRFWHRTb2Z0d2FyZQBNYXRwbG90bGliIHZlcnNpb24zLjcuMSwgaHR0cHM6Ly9tYXRwbG90bGliLm9yZy/bCgiHAAAACXBIWXMAAA9hAAAPYQGoP6dp...",
      dtype: "image",
    },
    motor_sry: { value: 93.50408817699997, dtype: "number" },
    delay_max: { value: "None", dtype: "number" },
    delay_min: { value: "None", dtype: "number" },
    motor_sty: { value: 4.3682550000003175, dtype: "number" },
    transmission: { value: 20.182795201148114, dtype: "number" },
    hrixs_spectrum: {
      value: [
        12.333243333333336, 12.332315555555555, 12.33223, 12.33347777777778,
        12.336, 12.333567777777777,
      ],
      dtype: "array",
    },
    energy_mean: { value: "None", dtype: "number" },
    test_variable: { value: "None", dtype: "string" },
  },
}

export const validTableVariables = {
  proposal: {
    name: "proposal",
    title: "Proposal",
  },
  run: {
    name: "run",
    title: "Run",
  },
  start_time: {
    name: "start_time",
    title: "Timestamp",
  },
  added_at: {
    name: "added_at",
    title: "Added At",
  },
  comment: {
    name: "comment",
    title: "Comment",
  },
  rep_rate_laser: {
    name: "rep_rate_laser",
    title: "Laser Rep. Rate",
  },
  t0_from_bam: {
    name: "t0_from_bam",
    title: "T0 From BAM",
  },
  delay_mean: {
    name: "delay_mean",
    title: "Delay (mean)",
  },
  motor_stx: {
    name: "motor_stx",
    title: "Motor STX",
  },
  n_trains: {
    name: "n_trains",
    title: "Number of Trains",
  },
  energy_min: {
    name: "energy_min",
    title: "Energy (min)",
  },
  energy_max: {
    name: "energy_max",
    title: "Energy (max)",
  },
  rep_rate_fel: {
    name: "rep_rate_fel",
    title: "FEL Rep. Rate",
  },
  hrixs_preview: {
    name: "hrixs_preview",
    title: "HRIXS Preview",
  },
  motor_sry: {
    name: "motor_sry",
    title: "Motor SRY",
  },
  delay_max: {
    name: "delay_max",
    title: "Delay (max)",
  },
  delay_min: {
    name: "delay_min",
    title: "Delay (min)",
  },
  motor_sty: {
    name: "motor_sty",
    title: "Motor STY",
  },
  transmission: {
    name: "transmission",
    title: "Transmission",
  },
  hrixs_spectrum: {
    name: "hrixs_spectrum",
    title: "HRIXS Spectrum",
  },
  energy_mean: {
    name: "energy_mean",
    title: "Energy (mean)",
  },
  test_variable: {
    name: "test_variable",
    title: "Test Variable",
  },
}

export const validTableMetadata = {
  variables: validTableVariables,
  runs: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  timestamp: Date.now(),
}

export const validTableState = {
  data: validTableData,
  metadata: validTableMetadata,
}
