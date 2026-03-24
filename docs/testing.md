# Testing Guide

## Overview

Nomic Engine uses [Vitest](https://vitest.dev/) for unit testing. Tests are colocated with source files using the `.test.ts` suffix.

## Running Tests

```bash
# Run all tests once
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

## Coverage

Coverage is measured using the `v8` provider (built into Node.js) via `@vitest/coverage-v8`.

**Threshold**: 80% across all four metrics — statements, branches, functions, and lines.

Running `npm run test:coverage` will fail the build if coverage drops below 80% on any metric. A detailed HTML report is generated in `coverage/` (gitignored).

### Excluded from Coverage

The following files are excluded from coverage measurement:

| File | Reason |
|------|--------|
| `src/cli/index.ts` | Interactive CLI built on `commander` — not suitable for unit testing. Tested manually. |
| `src/persistence/storage.ts` | Thin wrapper around Node.js `fs`. File I/O paths are covered indirectly by integration usage. Unit testing would require extensive `fs` mocking with low signal-to-noise ratio. |

These exclusions are configured in `vitest.config.ts`.

## Test Conventions

- **Location**: Same directory as the source file, with `.test.ts` extension
  - e.g. `src/core/state.ts` → `src/core/state.test.ts`
- **Framework**: Vitest (`describe`, `it`, `expect`, `beforeEach`, `vi`)
- **Style**: Test observable behavior, not internal structure. Avoid hardcoding field names that are likely to change.
- **Coverage goal**: Happy path + edge cases + error conditions for all exported functions

## Future Additions

This file will be expanded with:
- Integration test conventions (when added)
- E2E test setup and execution
- CI coverage reporting configuration
