# Campus Print AI Agent Instructions

## General Rules
- Always understand the existing architecture before modifying code.
- Follow existing coding style.
- Never rewrite working code unnecessarily.
- Prefer small, incremental changes.
- Explain architectural decisions before major refactoring.

## Repository Rules
- Never modify node_modules, dist, test-results, or playwright-report.
- Never commit automatically.
- Never delete files unless explicitly requested.

## Development Workflow
1. Read the relevant subsystem first.
2. Plan the implementation.
3. Modify only the necessary files.
4. Run npm run build.
5. Fix compilation errors.
6. Run tests when available.
7. Continue iterating until the build succeeds.
8. Stop only when human input is required.

## Priority
1. Reliability
2. Maintainability
3. Readability
4. Performance
5. Minimal code changes
