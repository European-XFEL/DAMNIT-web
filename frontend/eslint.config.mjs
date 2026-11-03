import base, { uiArchitecture } from '@damnit-frontend/config/eslint'

// Pre-commit runs eslint from here over changed files across the workspace, so
// the ui gates need their path prefix to match.
export default [...base, ...uiArchitecture('packages/ui/')]
