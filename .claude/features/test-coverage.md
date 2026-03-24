# Feature: Unit Test Coverage

## Context

The codebase has one existing test file (`src/rules/dispatcher.test.ts`) but no coverage tooling and no tests for the remaining 8+ source modules. This feature establishes coverage infrastructure and fills the gap with unit tests across all testable modules.

**Coverage target**: 80% (statements, branches, functions, lines).

**Excluded from coverage** (documented in `docs/testing.md`):
- `src/cli/index.ts` — interactive CLI, not suited for unit testing
- `src/persistence/storage.ts` — wraps Node.js `fs`; tested via integration paths if needed

**Relevant source files**:
- `src/core/state.ts` — immutable state management, ID generation
- `src/core/engine.ts` — main orchestrator, integrates all subsystems
- `src/systems/voting.ts` — proposal creation, voting, resolution
- `src/systems/turn.ts` — turn order, current player, turn history
- `src/systems/transitions.ts` — state transition validation and audit log
- `src/rules/executor.ts` — sandboxed rule execution via vm2
- `src/rules/composition.ts` — higher-order rule composition utilities
- `src/rules/dispatcher.ts` — event dispatching, depth-first traversal (already tested)
- `src/sandbox/runtime.ts` — vm2 sandbox setup and execution
- `src/persistence/serializer.ts` — JSON serialization/deserialization of game state

**Relevant docs**:
- `docs/testing.md` — testing philosophy, exclusion rationale, coverage workflow
- `docs/rule-event-execution.md` — depth-first event execution model

**Test framework**: Vitest. Tests are colocated with source files (`*.test.ts`).

## Feature Branch
`feature/test-coverage`

## Tickets

### Ticket 01 — Coverage Tooling & Testing Docs
- **Branch**: `feature/test-coverage/01`
- **Depends on**: none
- **Parallel with**: none
- **Goal**: Install `@vitest/coverage-v8`, configure coverage thresholds, add `test:coverage` npm script, and create `docs/testing.md` documenting the project's testing philosophy and exclusions.
- **Scope**:
  - `package.json` — add `@vitest/coverage-v8` dev dependency, add `"test:coverage": "vitest run --coverage"` script
  - `vitest.config.ts` — new file; configure coverage provider (`v8`), include/exclude patterns, 80% thresholds for statements/branches/functions/lines
  - `docs/testing.md` — new file; document coverage philosophy, exclusions, and how to run coverage locally
- **Acceptance criteria**:
  - [ ] `npm run test:coverage` runs and produces a coverage report
  - [ ] Coverage thresholds are set to 80% for all four metrics
  - [ ] `src/cli/index.ts` and `src/persistence/storage.ts` are excluded from coverage metrics
  - [ ] `docs/testing.md` exists and explains the exclusions and coverage workflow
  - [ ] All existing tests still pass (`npm test`)

### Ticket 02 — Tests: `core/state.ts`
- **Branch**: `feature/test-coverage/02`
- **Worktree**: `.claude/worktrees/feature/test-coverage/02`
- **Depends on**: Ticket 01
- **Parallel with**: Tickets 03, 04, 05, 06, 07, 08
- **Goal**: Comprehensive unit tests for `src/core/state.ts` — ID generation, deep clone/freeze, state factory functions, and all `updateState`/`emitSystemEvent` helpers.
- **Scope**:
  - `src/core/state.test.ts` — new file
- **Acceptance criteria**:
  - [ ] All exported functions in `core/state.ts` are tested
  - [ ] Happy path, edge cases, and boundary values covered
  - [ ] Tests verify immutability (returned state is a new object, original unchanged)
  - [ ] `npm test` passes

### Ticket 03 — Tests: `core/engine.ts`
- **Branch**: `feature/test-coverage/03`
- **Worktree**: `.claude/worktrees/feature/test-coverage/03`
- **Depends on**: Ticket 01
- **Parallel with**: Tickets 02, 04, 05, 06, 07, 08
- **Goal**: Unit tests for `src/core/engine.ts` — game creation, player management, rule lifecycle, turn progression, voting flow, and event dispatch integration.
- **Scope**:
  - `src/core/engine.test.ts` — new file
- **Acceptance criteria**:
  - [ ] Engine construction and game initialization tested
  - [ ] Player add/remove flows tested
  - [ ] Rule add/modify/remove tested
  - [ ] Voting flow (propose → vote → resolve) tested end-to-end through the engine
  - [ ] `npm test` passes

### Ticket 04 — Tests: `systems/voting.ts`
- **Branch**: `feature/test-coverage/04`
- **Worktree**: `.claude/worktrees/feature/test-coverage/04`
- **Depends on**: Ticket 01
- **Parallel with**: Tickets 02, 03, 05, 06, 07, 08
- **Goal**: Unit tests for `src/systems/voting.ts` — proposal creation, vote casting, resolution logic (majority, thresholds), and point awards.
- **Scope**:
  - `src/systems/voting.test.ts` — new file
- **Acceptance criteria**:
  - [ ] Proposal creation (add/modify/remove rule) tested
  - [ ] Vote casting (yes/no/abstain) tested including duplicate-vote prevention
  - [ ] Majority resolution logic tested with various vote distributions
  - [ ] Configurable threshold support tested
  - [ ] `npm test` passes

### Ticket 05 — Tests: `systems/turn.ts` & `systems/transitions.ts`
- **Branch**: `feature/test-coverage/05`
- **Worktree**: `.claude/worktrees/feature/test-coverage/05`
- **Depends on**: Ticket 01
- **Parallel with**: Tickets 02, 03, 04, 06, 07, 08
- **Goal**: Unit tests for `src/systems/turn.ts` (turn order, current player, history) and `src/systems/transitions.ts` (state transition validation, audit log entries).
- **Scope**:
  - `src/systems/turn.test.ts` — new file
  - `src/systems/transitions.test.ts` — new file
- **Acceptance criteria**:
  - [ ] Turn advancement and wrap-around tested
  - [ ] Current player tracking tested
  - [ ] Turn history recording tested
  - [ ] Transition validation accepts valid transitions and rejects invalid ones
  - [ ] Audit log entries contain correct actor, type, and timestamp fields
  - [ ] `npm test` passes

### Ticket 06 — Tests: `rules/executor.ts` & `rules/composition.ts`
- **Branch**: `feature/test-coverage/06`
- **Worktree**: `.claude/worktrees/feature/test-coverage/06`
- **Depends on**: Ticket 01
- **Parallel with**: Tickets 02, 03, 04, 05, 07, 08
- **Goal**: Unit tests for `src/rules/executor.ts` (rule execution results, error handling) and `src/rules/composition.ts` (all composition helpers: conditional, turn-based, player-specific, etc.).
- **Scope**:
  - `src/rules/executor.test.ts` — new file
  - `src/rules/composition.test.ts` — new file
- **Acceptance criteria**:
  - [ ] Successful rule execution returns updated state
  - [ ] Rule execution errors are caught and returned as `ExecutionResult` with `success: false`
  - [ ] Each composition utility (`conditional`, `turnBased`, `playerSpecific`, etc.) tested
  - [ ] Composition of multiple rules tested
  - [ ] `npm test` passes

### Ticket 07 — Tests: `persistence/serializer.ts`
- **Branch**: `feature/test-coverage/07`
- **Worktree**: `.claude/worktrees/feature/test-coverage/07`
- **Depends on**: Ticket 01
- **Parallel with**: Tickets 02, 03, 04, 05, 06, 08
- **Goal**: Unit tests for `src/persistence/serializer.ts` — serialize/deserialize round-trips for GameState, including edge cases like empty collections and nested structures.
- **Scope**:
  - `src/persistence/serializer.test.ts` — new file
- **Acceptance criteria**:
  - [ ] Serialize → deserialize round-trip produces equivalent state
  - [ ] All top-level state fields preserved (players, rules, votes, history, etc.)
  - [ ] Edge cases tested: empty game, game with many players/rules, frozen state
  - [ ] Invalid JSON input handled gracefully
  - [ ] `npm test` passes

### Ticket 08 — Tests: `sandbox/runtime.ts`
- **Branch**: `feature/test-coverage/08`
- **Worktree**: `.claude/worktrees/feature/test-coverage/08`
- **Depends on**: Ticket 01
- **Parallel with**: Tickets 02, 03, 04, 05, 06, 07
- **Goal**: Integration-style unit tests for `src/sandbox/runtime.ts` — verify the vm2 sandbox executes valid code, enforces timeout, blocks disallowed globals, and returns errors for bad code.
- **Scope**:
  - `src/sandbox/runtime.test.ts` — new file
- **Acceptance criteria**:
  - [ ] Valid code executes and returns the expected result
  - [ ] Code that exceeds the timeout is terminated and returns an error
  - [ ] Code accessing disallowed globals (e.g., `process`, `require`, `fs`) is blocked
  - [ ] Syntax errors in sandboxed code are caught and returned as errors (not thrown)
  - [ ] `npm test` passes

## Parallel Work Note

Tickets 02–08 are all independent of each other and can be implemented in parallel. Each touches only a single test file (or two for Ticket 05). All depend on Ticket 01 so the coverage configuration is in place before any tests are run against it.

## Final QA

After all tickets merge to `feature/test-coverage`, a testor instance will run the full test suite with coverage (`npm run test:coverage`), verify the 80% threshold is met across all included modules, and confirm all acceptance criteria are satisfied before merging to `main`.
