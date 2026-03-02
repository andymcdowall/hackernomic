- Rules should execute in numerical order: 1, then 2, then 101, then 204.
- Events are processed using depth-first preorder traversal with rule-number sorting:
  1. When a rule emits events, all (event, rule) pairs are created from those events
  2. Pairs are sorted by rule.number in ascending order
  3. Each pair's entire descendant tree executes before moving to the next sibling
  4. This ensures cascading rule effects complete before sibling rules execute
  5. Limits: 100 levels per branch, 1000 total nodes globally

  Example: If Rule 101 emits [event-a, event-b] where event-a triggers Rules 102 and 204, and event-b triggers Rules 005 and 201:
  - Pairs created: [(b,005), (a,102), (b,201), (a,204)]
  - After sorting by rule number: 005, 102, 201, 204
  - Execution order: 101 → 005 (+ descendants) → 102 (+ descendants) → 201 (+ descendants) → 204 (+ descendants)
- There are system events and user events. User event ids are self defined, but the system event ids are reserved.