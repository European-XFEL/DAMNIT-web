import globals from 'globals'

export default [
  {
    files: ['tests/**/*.ts', 'playwright/**/*.ts', 'playwright*.config.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },
]
