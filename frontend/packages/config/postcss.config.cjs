module.exports = {
  plugins: {
    // Plain px becomes the calc(rem * --mantine-scale) that rem() gives, in
    // node_modules CSS too; a value holding var() or calc() keeps its px.
    // require.resolve keys: the plugins resolve from this config package even
    // when an app that has no direct dependency on them loads the config.
    [require.resolve('postcss-preset-mantine')]: { autoRem: true },
    [require.resolve('postcss-simple-vars')]: {
      variables: {
        'mantine-breakpoint-xs': '36em',
        'mantine-breakpoint-sm': '48em',
        'mantine-breakpoint-md': '62em',
        'mantine-breakpoint-lg': '75em',
        'mantine-breakpoint-xl': '88em',
      },
    },
  },
}
