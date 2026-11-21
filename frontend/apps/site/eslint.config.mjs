import globals from 'globals'

import base from '@damnit-frontend/config/eslint'

export default [
  ...base,
  {
    files: ['tests/**/*.ts', 'playwright*.config.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },
]
