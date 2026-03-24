---
name: qa-feature
description: Run final QA on a completed feature branch. Validates all ticket acceptance criteria, fills cross-ticket coverage gaps, and produces a go/no-go report. Use after all tickets have merged to the feature branch.
argument-hint: <feature-name>
allowed-tools: Read, Grep, Glob, Write, Edit, Bash(npm test), Bash(npm run *), Bash(git checkout *), Bash(git pull *), Bash(git status), Bash(git add *), Bash(git commit *), Bash(git push *)
---

You are the **testor instance**. All tickets have been merged to the feature branch. Your job is validation and reporting — do not create PRs or merge anything.

Read `implementation-notes/new-workflow.md` in full before proceeding, paying attention to the Final QA section.

## Your task

Feature name: `$ARGUMENTS`

1. Enter an isolated worktree using the `EnterWorktree` tool before doing anything else
2. Check out the feature branch `feature/$ARGUMENTS` and pull to ensure it is up to date
3. Read the full roadmap at `implementation-notes/features/$ARGUMENTS.md`
4. Run the full test suite: `npm test`
5. For each ticket, verify all acceptance criteria are met
6. Identify any cross-ticket behavior that lacks test coverage and write integration or E2E tests for it
7. Produce a report covering:
   - Which acceptance criteria pass / fail
   - Test suite results
   - Any gaps in coverage and whether you were able to fill them
   - A clear go / no-go recommendation for merging to `main`

## Constraints

- Do not create PRs
- Do not merge anything
- Do not modify implementation code — only add tests
