export const gridProps = {
  initialSize: [500, 500],
}

export const validTable = {
  data: {
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
  },
  schema: {
    runnr: {
      id: "runnr",
      dtype: "number",
    },
    start_time: {
      id: "start_time",
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
    hrixs_preview: {
      id: "hrixs_preview",
      dtype: "image",
    },
    hrixs_spectrum: {
      id: "hrixs_spectrum",
      dtype: "array",
    },
    test_variable: {
      id: "test_variable",
      dtype: "string",
    },
  },
  selection: {},
}
