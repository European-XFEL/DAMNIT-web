import path from 'node:path'
import { fileURLToPath } from 'node:url'

import js from '@eslint/js'
import globals from 'globals'
import eslintConfigPrettier from 'eslint-config-prettier/flat'
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript'
import { importX } from 'eslint-plugin-import-x'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

const frontendRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
)

export default defineConfig(
  globalIgnores(['dist/**', 'public/mockServiceWorker.js']),
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'import-x': importX,
    },
    settings: {
      'import-x/parsers': {
        '@typescript-eslint/parser': ['.ts', '.tsx', '.cts', '.mts'],
      },
      'import-x/resolver-next': [
        createTypeScriptImportResolver({
          alwaysTryTypes: true,
          noWarnOnMultipleProjects: true,
          project: [
            path.join(frontendRoot, 'apps/*/tsconfig.json'),
            path.join(frontendRoot, 'packages/*/tsconfig.json'),
            path.join(frontendRoot, 'packages/*/tsconfig.test.json'),
            path.join(frontendRoot, 'e2e/tsconfig.json'),
          ],
        }),
      ],
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-hooks/set-state-in-effect': 'off', // TODO: Remove and fix things
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          args: 'after-used',
          ignoreRestSiblings: true,
          varsIgnorePattern: '^_+$',
          argsIgnorePattern: '^_+$',
        },
      ],
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          name: 'react-redux',
          importNames: ['useDispatch', 'useSelector'],
          message:
            'Use typed hooks `useAppDispatch` and `useAppSelector` instead.',
        },
      ],
      'import-x/no-cycle': ['error', { ignoreExternal: true }],
      'import-x/no-self-import': 'error',
      'import-x/no-useless-path-segments': 'error',
    },
  },
  eslintConfigPrettier
)
