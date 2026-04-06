# Ticket-Based Feature Workflow

This document describes the workflow for developing large features as a series of small, reviewable PRs ("tickets") that stack onto a feature branch before being merged to `main`.

---

## Overview

Large features are decomposed into tickets. Each ticket is implemented by a dedicated Claude instance with a fresh context window, keeping implementations focused and reviews manageable. All tickets target a shared feature branch. Once all tickets are merged, a final QA pass is performed before the feature branch merges to `main`.

```
main
 └── feature/<feature-name>         ← feature branch (PRs to main only after final QA)
       ├── ticket/<feature-name>/0  ← roadmap + scaffolding PR → feature branch
       ├── ticket/<feature-name>/01 ← ticket 1 PR → feature branch
       ├── ticket/<feature-name>/02 ← ticket 2 PR → feature branch (depends on 01)
       └── ticket/<feature-name>/03 ← ticket 3 PR → feature branch (depends on 01, parallel with 02)
```

---

## Roles

| Role | Responsibility |
|------|----------------|
| **Roadmap instance** | Analyzes the feature, dialogues with the user, creates the feature branch, writes the roadmap and scaffolding, opens a PR |
| **Implementor instance** | Implements one ticket, writes tests, creates the PR, responds to review comments |
| **Testor instance** | Runs comprehensive QA after all tickets are merged to the feature branch |

---

## Ticket Constraints

- **Lines changed**: < 500
- **Files touched**: < 5
- If a ticket would exceed these limits, decompose it further

---

## Step 1: Create a Roadmap

Invoke with `/roadmap <feature-name>`. The roadmap instance:

1. Enters an isolated worktree
2. Explores the codebase and dialogues with the user about decomposition
3. Creates the feature branch: `feature/<feature-name>`
4. Creates a roadmap sub-branch off the feature branch: `ticket/<feature-name>/0`
5. Writes the roadmap to `implementation-notes/features/<feature-name>.md`
6. Produces any scaffolding needed to give implementors a head start (docs, config, type stubs, etc.)
7. Commits everything to `ticket/<feature-name>/0` and opens a PR targeting `feature/<feature-name>` (not `main`)

### Roadmap File Format

`implementation-notes/features/<feature-name>.md`

```markdown
# Feature: <Feature Name>

## Context
<Why this feature exists, what problem it solves, relevant architectural context, relevant docs, relevant code files, relevant configuration snippets>

## Feature Branch
`feature/<feature-name>`

## Tickets

<!-- Repeat the Ticket block below once per ticket. Number sequentially: 01, 02, 03, ... -->

### Ticket NN — <Short Description>
- **Branch**: `ticket/<feature-name>/NN`
- **Worktree**: `.claude/worktrees/ticket/<feature-name>/NN` (omit if sequential, no parallel work)
- **Depends on**: <Ticket NN | none>
- **Parallel with**: <Ticket NN | none>
- **Goal**: <What this ticket accomplishes>
- **Scope**: <Files likely touched, rough description of changes>
- **Acceptance criteria**:
  - [ ] <Criterion>

<!-- Add a Ticket block for each ticket. -->

## Parallel Work Note
<!-- If any tickets are parallel, explain which and why. Remove this section if all tickets are sequential. -->

## Final QA
After all tickets merge to `feature/<feature-name>`, a testor instance will
run comprehensive integration/E2E testing before merging to `main`.
```

---

## Step 2: Implement a Ticket

Invoke with `/implement-ticket <feature-name> <ticket-number>` (e.g. `/implement-ticket payments 02`). One instance per ticket. The implementor:

1. Enters an isolated worktree
2. Reads the roadmap and verifies dependencies are merged
3. Creates the ticket branch off the feature branch
4. Implements only the ticket scope — no more, no less
5. Writes unit tests (required) and E2E tests (if applicable)
6. Runs `npm test` — all tests must pass
7. Auto-creates the PR targeting the feature branch
8. Responds to all review comments until merged

---

## Step 3: Review

For each ticket PR:
- **You** review the diff
- **ChatGPT** (manual step, out of scope for automation for now)
- Implementor instance addresses all comments and re-pushes

---

## Step 4: Final QA

After all ticket PRs are merged to `feature/<feature-name>`, invoke with `/qa-feature <feature-name>`. The testor:

1. Enters an isolated worktree and checks out the feature branch
2. Runs the full test suite
3. Validates all acceptance criteria from the roadmap
4. Fills any cross-ticket coverage gaps with integration or E2E tests
5. Produces a go / no-go report — no PRs, no merges

Once QA passes, the feature branch is ready to merge to `main`.

---

## Worktrees

Every agent — roadmap, implementor, and testor — creates its own isolated worktree at the start of the session. This prevents conflicts between parallel agents and keeps each agent's working state separate.

Agents do this autonomously using the `EnterWorktree` tool at the start of their session. No manual setup is needed.

**Important constraint**: `EnterWorktree` only works if the session was started from the main repository root, not from inside an existing worktree. All agent sessions must be started from the repo root.

---

## Branch Naming

| Purpose | Pattern |
|---------|---------|
| Feature branch | `feature/<feature-name>` |
| Roadmap branch | `ticket/<feature-name>/0` |
| Ticket branch | `ticket/<feature-name>/NN` (e.g. `ticket/payments/01`) |

---

## Design Principles

### Separate intent from mechanism
The roadmap file describes *what* needs to be built. Skills, prompt templates, and tooling describe *how* to build it. These should never be conflated — the roadmap must remain readable and actionable regardless of what AI tooling is current.

### The roadmap is the stable interface
Ticket constraints, branch names, acceptance criteria, and dependency ordering live in the roadmap. If Claude Code evolves, models improve, or orchestration becomes automated, the roadmap files survive intact. Build everything else to consume the roadmap, not to duplicate it.

### Skills are thin wrappers
Skill files should not re-explain role behavior. They point at this document and pass arguments. Role instructions live here and nowhere else.

### Constraints are configuration, not law
The 500-line / 5-file limits reflect today's review ergonomics. As context windows grow or review tooling improves, these can be relaxed. They are defined in one place (Ticket Constraints above) and referenced everywhere else.

### One instance, one ticket
Fresh context per ticket prevents accumulated state from influencing implementation decisions. This is a deliberate constraint, not just a workaround for context limits.

### Roadmap instance: dialogue first
The roadmap instance should treat the user as the domain expert. Before writing the roadmap, it should ask clarifying questions about intent, constraints, and priorities — especially around how to decompose the problem. The roadmap should reflect the user's decomposition decisions, not just the instance's own analysis. A roadmap written without dialogue risks encoding wrong assumptions that propagate through every ticket.

### Implementor instance: maximize autonomy
Once handed a ticket, the implementor should complete it without prompting the user for decisions. It should prefer tools and operations that do not require permission prompts (e.g. read, grep, write, test runner) and avoid actions that will pause for approval unless strictly necessary. The one exception: if the ticket scope would be exceeded or a dependency isn't met, stop and notify the user rather than improvising.

---

## Open Questions (to resolve in future conversations)

- Pipeline/CI setup for implementors to use (future work item)
- Formal ChatGPT review integration (future work item)

---

*Last updated: 2026-03-24*
