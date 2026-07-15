import base from '@damnit-frontend/config/eslint'

export default [
  ...base,
  {
    // A file reaches its own folder with './' and everything else with a
    // subpath import, so moving a folder never rewrites its importers.
    // import-x/no-relative-parent-imports cannot express this: it resolves the
    // specifier, so it rejects '#src/...' too, which also lands in a parent.
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
    rules: {
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
]
