import path from 'node:path'
import { fileURLToPath } from 'node:url'

import js from '@eslint/js'
import globals from 'globals'
import eslintConfigPrettier from 'eslint-config-prettier/flat'
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript'
import boundaries from 'eslint-plugin-boundaries'
import { importX } from 'eslint-plugin-import-x'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

const frontendRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
)
const uiRoot = path.join(frontendRoot, 'packages/ui')

const feature = (name) => ({
  element: { type: 'features', captured: { feature: name } },
})

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
      'import-x/order': [
        'error',
        {
          groups: [
            'builtin',
            'external',
            'internal',
            'parent',
            'sibling',
            'index',
          ],
          // Workspace packages and package.json subpath imports ('#src/...',
          // '#fixtures', ...) are internal, whichever package defines them.
          pathGroups: [
            { pattern: '@damnit-frontend/**', group: 'internal' },
            { pattern: '#*', group: 'internal' },
            { pattern: '#*/**', group: 'internal' },
          ],
          pathGroupsExcludedImportTypes: ['builtin'],
          'newlines-between': 'always',
        },
      ],
    },
  },
  eslintConfigPrettier
)

// The packages/ui architecture gates. Exported as a factory because ESLint
// resolves `files` globs against the directory of the config file that loaded
// them, and flat config does not cascade: packages/ui/eslint.config.mjs sees
// paths like 'src/...', while frontend/eslint.config.mjs (what pre-commit runs)
// sees 'packages/ui/src/...'. Each passes its own prefix so both agree.
export function uiArchitecture(prefix = '') {
  return [
    {
      files: [`${prefix}{src,tests}/**/*.{ts,tsx}`],
      rules: {
        // A file reaches its own folder with './' and everything else with a
        // subpath import, so moving a folder never rewrites its importers.
        // import-x/no-relative-parent-imports cannot express this: it resolves
        // the specifier, so it rejects '#src/...' too, which also lands in a
        // parent.
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['../*', '../**'],
                message:
                  "Import from outside this folder with '#src/...' (or '#tests/...' in tests), not '../'.",
              },
            ],
          },
        ],
      },
    },
    {
      files: [`${prefix}src/**/*.{ts,tsx}`],
      plugins: { boundaries },
      settings: {
        'boundaries/root-path': uiRoot,
        // boundaries resolves through the legacy 'import/resolver' setting, not
        // import-x's. Without this it cannot resolve '#src/...' and silently
        // classifies every dependency as unknown, so the rule never fires.
        'import/resolver': {
          typescript: {
            alwaysTryTypes: true,
            noWarnOnMultipleProjects: true,
            project: [
              path.join(uiRoot, 'tsconfig.app.json'),
              path.join(uiRoot, 'tsconfig.test.json'),
            ],
          },
        },
        // The public API deliberately composes the whole tree.
        'boundaries/ignore': ['src/index.ts'],
        // Elements are folders. First match wins, so specific ones come first,
        // and 'src' catches the loose root files (constants.ts, types.ts).
        'boundaries/elements': [
          { type: 'app', pattern: 'src/app' },
          { type: 'features', pattern: 'src/features/*', capture: ['feature'] },
          { type: 'components', pattern: 'src/components' },
          { type: 'graphql', pattern: 'src/graphql' },
          // Temporary: PRs 3-5 migrate this to Apollo and delete the layer.
          { type: 'data', pattern: 'src/data' },
          { type: 'shared', pattern: 'src/lib' },
          { type: 'shared', pattern: 'src/utils' },
          { type: 'shared', pattern: 'src/styles' },
          { type: 'shared', pattern: 'src' },
        ],
        // The store's typed surface: the one thing a feature may reach upward
        // for. The reducer assembly and the store itself stay out of reach.
        'boundaries/files': [
          {
            pattern: 'src/app/store/{hooks,selectors,thunks,actions,types}.ts',
            category: 'store-api',
          },
        ],
      },
      rules: {
        'boundaries/dependencies': [
          'error',
          {
            default: 'disallow',
            message:
              '{{from.element.types}} is not allowed to import {{to.element.types}}',
            policies: [
              // The wiring layer knows everything.
              {
                from: { element: { type: 'app' } },
                allow: { to: { element: { type: '*' } } },
              },
              // Leaves.
              {
                from: { element: { type: 'shared' } },
                allow: { to: { element: { type: 'shared' } } },
              },
              {
                from: { element: { type: 'components' } },
                allow: { to: { element: { type: ['components', 'shared'] } } },
              },
              {
                from: { element: { type: 'graphql' } },
                allow: { to: { element: { type: 'shared' } } },
              },
              {
                from: { element: { type: 'data' } },
                allow: {
                  to: [
                    { element: { type: ['data', 'graphql', 'shared'] } },
                    {
                      element: { type: 'app' },
                      file: { categories: 'store-api' },
                    },
                  ],
                },
              },
              // A feature may use the shared layers, its own files, and the
              // store's typed surface. It may not reach another feature.
              {
                from: { element: { type: 'features' } },
                allow: {
                  to: [
                    {
                      element: {
                        type: ['components', 'graphql', 'shared', 'data'],
                      },
                    },
                    {
                      element: { type: 'app' },
                      file: { categories: 'store-api' },
                    },
                    {
                      element: {
                        type: 'features',
                        captured: {
                          feature: '{{ from.element.captured.feature }}',
                        },
                      },
                    },
                  ],
                },
              },
              // The one architectural exception: dashboard is the workspace
              // composite (a Feature-Sliced-Design style tier), so it composes
              // the features that make up the workspace. Leaf-to-leaf stays
              // banned.
              {
                from: feature('dashboard'),
                allow: {
                  to: [
                    feature('table'),
                    feature('plots'),
                    feature('context-file'),
                    feature('auth'),
                  ],
                },
                message:
                  'dashboard is the workspace composite; other features must not import each other',
              },
            ],
          },
        ],
      },
    },
  ]
}
