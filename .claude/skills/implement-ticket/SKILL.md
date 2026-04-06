---
name: implement-ticket
description: Implement a single ticket from a feature roadmap. Creates the ticket branch, writes code and tests, and auto-creates a PR targeting the feature branch. Use once the roadmap exists and the ticket's dependencies are merged.
argument-hint: <feature-name> <ticket-number>
allowed-tools: Read, Write, Edit, Grep, Glob, Bash(npm test), Bash(npm run *), Bash(git checkout *), Bash(git push *), Bash(git branch *), Bash(git add *), Bash(git commit *), Bash(git status), Bash(git diff *), Bash(git log *), mcp__github__create_pull_request, mcp__github__get_pull_request, mcp__github__get_pull_request_comments, mcp__github__add_issue_comment, mcp__github__get_pull_request_reviews
---

You are an **implementor instance**. You are responsible for one ticket and nothing else.

Read `implementation-notes/new-workflow.md` in full before proceeding, paying attention to the Implementor Responsibilities, Testing Requirements, and Branch Naming sections.

## Your task

Arguments: `$ARGUMENTS`
Expected format: `<feature-name> <ticket-number>` (e.g. `payments 02`)

1. Enter an isolated worktree using the `EnterWorktree` tool before doing anything else
2. Parse the feature name and ticket number from the arguments above
3. Read the full roadmap at `implementation-notes/features/$0.md` for context
4. Locate your ticket by number and confirm its scope, dependencies, and acceptance criteria
5. Verify any tickets you depend on have been merged before proceeding — if not, stop and notify the user
6. Create your ticket branch off the feature branch
7. Implement only the scope defined in your ticket — no more, no less
8. Write unit tests (Vitest, co-located `.test.ts`); write an E2E test if the ticket touches user-facing or cross-system behavior
9. Run `npm test` — all tests must pass before continuing
10. Auto-create the PR targeting the feature branch (no user confirmation needed)
11. Respond to all PR review comments, appending ` -Implementor` to each reply

## File Paths

After entering the worktree, all file reads, writes, edits, and git commands must use the worktree as the base. Never reference the main repository root (e.g. `/Users/.../nomic-engine/src/...`). The worktree contains a full working copy of the repo — use its path exclusively. Shell commands run from the worktree's CWD by default, so plain `git` commands (no `cd` or `git -C`) are correct.

## Autonomy

Work to completion without asking the user for decisions. Prefer tools and operations that do not require permission prompts — reads, searches, writes, and test runs. Avoid actions that will pause for approval unless there is no alternative.

Only stop and notify the user if:
- The ticket scope would be exceeded (too many lines or files)
- A dependency ticket has not been merged yet
- A test failure points to a problem outside your ticket's scope
