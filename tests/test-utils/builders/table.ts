export const gridProps = {
  initialSize: [500, 500],
}

export const validTableData = {
  "448": {
    proposal: 2956,
    runnr: 448,
    start_time: 1665264546765.0981,
    added_at: 1682887864430.31,
    comment: "None",
    rep_rate_laser: 1.14,
    t0_from_bam: 264.1849670410156,
    delay_mean: 291.1703103718005,
    motor_stx: -3.978009999999813,
    n_trains: 3078,
    energy_min: 928.0038686403836,
    energy_max: 937.9920297832026,
    rep_rate_fel: 1.14,
    hrixs_preview:
      "iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAAOXRFWHRTb2Z0d2FyZQBNYXRwbG90bGliIHZlcnNpb24zLjcuMSwgaHR0cHM6Ly9tYXRwbG90bGliLm9yZy/bCgiHAAAACXBIWXMAAA9hAAAPYQGoP6dp...",
    motor_sry: 93.50408817699997,
    delay_max: "None",
    delay_min: "None",
    motor_sty: 4.3682550000003175,
    transmission: 20.182795201148114,
    hrixs_spectrum: [
      12.333243333333336, 12.332315555555555, 12.33223, 12.33347777777778,
      12.336, 12.333567777777777,
    ],
    energy_mean: "None",
    test_variable: "None",
  },
}

export const validTableSchema = {
  proposal: {
    id: "proposal",
    dtype: "number",
  },
  runnr: {
    id: "runnr",
    dtype: "number",
  },
  start_time: {
    id: "start_time",
    dtype: "timestamp",
  },
  added_at: {
    id: "added_at",
    dtype: "timestamp",
  },
  comment: {
    id: "comment",
    dtype: "string",
  },
  rep_rate_laser: {
    id: "rep_rate_laser",
    dtype: "number",
  },
  t0_from_bam: {
    id: "t0_from_bam",
    dtype: "number",
  },
  delay_mean: {
    id: "delay_mean",
    dtype: "number",
  },
  motor_stx: {
    id: "motor_stx",
    dtype: "number",
  },
  n_trains: {
    id: "n_trains",
    dtype: "number",
  },
  energy_min: {
    id: "energy_min",
    dtype: "number",
  },
  energy_max: {
    id: "energy_max",
    dtype: "number",
  },
  rep_rate_fel: {
    id: "rep_rate_fel",
    dtype: "number",
  },
  hrixs_preview: {
    id: "hrixs_preview",
    dtype: "image",
  },
  motor_sry: {
    id: "motor_sry",
    dtype: "number",
  },
  delay_max: {
    id: "delay_max",
    dtype: "number",
  },
  delay_min: {
    id: "delay_min",
    dtype: "number",
  },
  motor_sty: {
    id: "motor_sty",
    dtype: "number",
  },
  transmission: {
    id: "transmission",
    dtype: "number",
  },
  hrixs_spectrum: {
    id: "hrixs_spectrum",
    dtype: "array",
  },
  energy_mean: {
    id: "energy_mean",
    dtype: "number",
  },
  test_variable: {
    id: "test_variable",
    dtype: "string",
  },
}

export const validTableState = {
  data: validTableData,
  schema: validTableSchema,
  selection: {},
}

const numberTheme = { fontFamily: "monospace", headerFontStyle: "" }

export const validTableColumns = [
  {
    id: "runnr",
    title: "runnr",
    width: 100,
    themeOverride: numberTheme,
  },
  { id: "start_time", title: "start_time" },
  { id: "added_at", title: "added_at" },
  { id: "comment", title: "comment" },
  {
    id: "rep_rate_laser",
    title: "rep_rate_laser",
    width: 100,
    themeOverride: numberTheme,
  },
  {
    id: "t0_from_bam",
    title: "t0_from_bam",
    width: 100,
    themeOverride: numberTheme,
  },
  {
    id: "delay_mean",
    title: "delay_mean",
    width: 100,
    themeOverride: numberTheme,
  },
  {
    id: "motor_stx",
    title: "motor_stx",
    width: 100,
    themeOverride: numberTheme,
  },
  {
    id: "n_trains",
    title: "n_trains",
    width: 100,
    themeOverride: numberTheme,
  },
  {
    id: "energy_min",
    title: "energy_min",
    width: 100,
    themeOverride: numberTheme,
  },
  {
    id: "energy_max",
    title: "energy_max",
    width: 100,
    themeOverride: numberTheme,
  },
  {
    id: "rep_rate_fel",
    title: "rep_rate_fel",
    width: 100,
    themeOverride: numberTheme,
  },
  { id: "hrixs_preview", title: "hrixs_preview" },
  {
    id: "motor_sry",
    title: "motor_sry",
    width: 100,
    themeOverride: numberTheme,
  },
  {
    id: "delay_max",
    title: "delay_max",
    width: 100,
    themeOverride: numberTheme,
  },
  {
    id: "delay_min",
    title: "delay_min",
    width: 100,
    themeOverride: numberTheme,
  },
  {
    id: "motor_sty",
    title: "motor_sty",
    width: 100,
    themeOverride: numberTheme,
  },
  {
    id: "transmission",
    title: "transmission",
    width: 100,
    themeOverride: numberTheme,
  },
  { id: "hrixs_spectrum", title: "hrixs_spectrum" },
  {
    id: "energy_mean",
    title: "energy_mean",
    width: 100,
    themeOverride: numberTheme,
  },
  { id: "test_variable", title: "test_variable" },
]
