The PR number is the first word of "$ARGUMENTS". Use that number for all commands below.

1. Fetch the PR details: `gh pr view <PR_NUMBER>`
2. Fetch the diff: `gh pr diff <PR_NUMBER>`
3. Fetch any existing review comments: `gh api repos/{owner}/{repo}/pulls/<PR_NUMBER>/comments`

Review the changes for:
- Correctness and logic errors
- Consistency with existing patterns in the codebase
- Test coverage — are the changes adequately tested?
- Any security concerns
- Anything that could be simplified

Give clear, actionable feedback organised by file. Note anything that is good and should be kept. At the end, give an overall verdict: Approve, Request Changes, or Needs Discussion.
