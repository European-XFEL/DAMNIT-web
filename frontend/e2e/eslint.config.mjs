import globals from 'globals'

import base from '@damnit-frontend/config/eslint'

export default [
  ...base,
  {
    files: ['**/*.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },
]
