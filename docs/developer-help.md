# Common dev workflows

## QA Testing with worktrees

Sometimes, you may want to QA test as a human.

Build the tool (in the main worktree, ie the not-worktree folder):
```bash
npm run build
```

Pull worktree changes into the main worktree (ie, the not-worktree codebase)
```bash
git merge --no-commit <worktree> --no-ff
npm run build
# Do QA testing
git reset --hard
```

Build the tool in a worktree:
```bash
cd .claude/worktrees/<worktree>
npm run build
npx nomic play ../../../games/<game>.json
```

# Troubleshooting

## I made changes but the CLI doesn't show them.

You may need to build the CLI, especially if you're working with worktrees. See # QA Testing with worktrees
