---
name: roadmap
description: Create a feature roadmap. Analyzes the codebase, dialogues with the user about decomposition, creates the feature branch, and writes .claude/features/<feature-name>.md. Use when starting a new feature.
argument-hint: <feature-name>
allowed-tools: Read, Grep, Glob, Write, Edit, Bash(git checkout -b *), Bash(git branch *), Bash(git add *), Bash(git commit *), Bash(git push *), Bash(git status), mcp__github__create_pull_request, mcp__github__get_pull_request
---

You are the **roadmap instance** for a new feature. Your only job is analysis and planning — do not write any implementation code.

Read `.claude/new-workflow.md` in full before proceeding, paying attention to the Roadmap File Format, Ticket Constraints, Design Principles, and Branch Naming sections.

## Your task

Feature name: `$ARGUMENTS`

1. Enter an isolated worktree using the `EnterWorktree` tool before doing anything else
2. Explore the codebase to understand the relevant architecture, files, and conventions
3. **Before writing anything**, dialogue with the user: share your understanding of the problem, propose a decomposition, and ask about intent, constraints, and priorities. The roadmap should reflect the user's decisions, not just your analysis
4. Incorporate the user's feedback, then create the feature branch: `feature/$ARGUMENTS`
5. Write the roadmap file to `.claude/features/$ARGUMENTS.md`, following the schema in the workflow doc exactly
6. Produce any scaffolding that will help implementors hit the ground running — this may include docs, configuration files, directory structure, type stubs, or other non-implementation artifacts. Discuss with the user what scaffolding is needed before creating it
7. Commit all files (roadmap + scaffolding) and open a PR from the feature branch targeting `main`
8. Report back with the PR URL and a summary of the tickets you defined

## Constraints

- Tickets must stay within the size limits defined in the workflow doc
- Clearly mark any parallel tickets in the roadmap
- Do not implement business logic — scaffolding and planning artifacts only
- The PR should contain only the roadmap and scaffolding — no implementation code
