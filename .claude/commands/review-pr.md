Review the pull request $ARGUMENTS.

1. Fetch the PR details: `gh pr view $ARGUMENTS`
2. Fetch the diff: `gh pr diff $ARGUMENTS`
3. Fetch any existing review comments: `gh api repos/{owner}/{repo}/pulls/$ARGUMENTS/comments`

Review the changes for:
- Correctness and logic errors
- Consistency with existing patterns in the codebase
- Test coverage — are the changes adequately tested?
- Any security concerns
- Anything that could be simplified

Give clear, actionable feedback organised by file. Note anything that is good and should be kept. At the end, give an overall verdict: Approve, Request Changes, or Needs Discussion.
