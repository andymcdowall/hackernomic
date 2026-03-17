# Claude Code Instructions

This file contains specific instructions and workflows for Claude Code when working on this project.

## Feature Development Workflow

When adding a new feature or implementing a significant change, follow this workflow:

### 1. Create a New Branch

Before starting development:
- Create a descriptive branch name using the format: `feature/<short-description>` or `fix/<short-description>`
- Examples: `feature/depth-first-events`, `fix/rule-execution-order`

```bash
git checkout -b feature/<description>
```

### 2. Development

- Make code changes following the project's architectural guidelines in `.claude/architecture.md`
- Ensure code follows existing patterns and conventions
- Keep commits focused and descriptive
- Commit incrementally as you complete logical units of work

### 3. Unit Testing

**REQUIRED** - All features must have unit tests:
- Write comprehensive unit tests using Vitest
- Place tests in the same directory as the source file with `.test.ts` extension
- Test coverage should include:
  - Happy path scenarios
  - Edge cases
  - Error conditions
  - Boundary values
- Run tests with: `npm test`
- All tests must pass before proceeding

### 4. End-to-End Testing (if applicable)

If the feature involves user-facing functionality or integration between multiple systems:
- Create an E2E test script in the project root (e.g., `test-<feature-name>.js`)
- Test the feature in a realistic scenario
- Verify expected behavior and outputs
- Document the test scenario in comments

### 5. User Confirmation

**REQUIRED** - Before creating a PR:
- Summarize the changes made
- Show test results (unit + E2E)
- Ask the user for confirmation that the feature meets requirements
- Address any feedback or concerns
- Only proceed to PR creation after explicit user approval

### 6. Create GitHub Pull Request

After user confirmation:
- Ensure all changes are committed
- Push the branch to origin: `git push -u origin <branch-name>`
- Create PR using `gh` CLI with:
  - Clear title describing the feature
  - Comprehensive summary of changes (2-4 bullet points)
  - Test plan with checklist
  - Reference to any related issues

```bash
gh pr create --title "Feature: <description>" --body "$(cat <<'EOF'
## Summary
- Bullet point 1
- Bullet point 2

## Test Plan
- [ ] Unit tests pass
- [ ] E2E tests pass (if applicable)
- [ ] Manual testing completed

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- Return the PR URL to the user

### 7. Review and Iteration

After PR is created:
- User will review and may add comments
- To view PR comments: `gh pr view <PR-number>` or `gh api repos/{owner}/{repo}/pulls/<PR-number>/comments`
- Address all review comments:
  - Make necessary code changes
  - Update tests if needed
  - Commit with descriptive messages referencing the feedback
  - Push changes (they automatically update the PR)
  - **Reply to every PR comment** after addressing it, appending ` -Claude` to the message
- Request re-review if significant changes were made

## Branch Naming Conventions

- `feature/<description>` - New features or enhancements
- `fix/<description>` - Bug fixes
- `refactor/<description>` - Code refactoring without behavior change
- `docs/<description>` - Documentation updates
- `test/<description>` - Test additions or improvements

## Commit Message Format

Follow conventional commit format:
- `feat: Add depth-first event processing`
- `fix: Correct rule execution order`
- `test: Add unit tests for EventDispatcher`
- `docs: Update rule execution documentation`
- `refactor: Extract pair creation to helper function`

## Testing Requirements

### Unit Tests
- **Location**: Same directory as source, with `.test.ts` suffix
- **Framework**: Vitest
- **Coverage**: Aim for comprehensive coverage of all code paths
- **Run**: `npm test`

### E2E Tests
- **Location**: Project root with descriptive name
- **When**: User-facing features or cross-system integration
- **Run**: `node test-<feature>.js`

### Pre-PR Checklist
- [ ] All unit tests pass
- [ ] E2E tests created and pass (if applicable)
- [ ] Code follows project conventions
- [ ] Documentation updated
- [ ] User has confirmed the feature
- [ ] All changes committed
- [ ] Branch pushed to origin

## Code Design Principles

### Single Responsibility Principle (SRP)
Extract logic into separate functions when a function is doing more than one distinct operation. For example, a function that collects user input AND orchestrates a multi-step process should be split: one function gathers input and creates the entity, another drives the follow-on process (e.g., voting). Each function should do one "thing."

### No Backwards Compatibility in Pre-Alpha
This project is pre-alpha — do not add backwards-compatibility shims (e.g., union-type constructor signatures, legacy overloads). Just change the API directly. However, tests should be written to be **schema-resilient**: avoid hardcoding internal field names or structure that is likely to change; test observable behavior instead.

## Important Notes

- **NEVER create a PR without user confirmation**
- **ALWAYS run tests before asking for user confirmation**
- **ALWAYS use `gh` CLI for GitHub operations** (not manual web interface)
- **DO NOT push to main/master directly** - all changes go through PRs
- **DO NOT use `--force` push** unless explicitly requested by user
- **DO NOT skip hooks** (--no-verify) unless user explicitly requests it

## Questions or Uncertainties

If you're unsure about any step in the workflow:
1. Ask the user for clarification before proceeding
2. Use the `AskUserQuestion` tool for specific decisions
3. When in doubt, err on the side of asking rather than assuming

---

Last updated: 2026-03-16
