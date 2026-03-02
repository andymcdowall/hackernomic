# Rule Event Execution - Depth-First Preorder Traversal

This document explains how the Nomic engine processes events and executes rules using depth-first preorder traversal with rule-number sorting.

## Overview

When rules emit events, the engine creates (event, rule) pairs for all matching rules, sorts them by rule number, and executes each pair's entire descendant tree before moving to the next sibling. This ensures cascading rule effects complete before sibling rules execute.

## Example Scenario

```
turn-end event → Rule 101 emits [event-a, event-b]
  event-a matches → Rules 102, 204
  event-b matches → Rules 005, 201
  Rule 005 emits → event-c
    event-c matches → Rule 050
```

**Execution Order:** 101 → 5 → 50 → 102 → 201 → 204

---

## Event Flow Diagram

This diagram shows how events flow through the system and trigger rules:

```mermaid
graph TD
    Start([turn-end event]) -->|triggers| R101[Rule 101<br/>Step 1]

    R101 -->|emits event-a| EA[event-a]
    R101 -->|emits event-b| EB[event-b]

    EA -->|matches| R102[Rule 102]
    EA -->|matches| R204[Rule 204]
    EB -->|matches| R005[Rule 5]
    EB -->|matches| R201[Rule 201]

    R005 -->|emits event-c| EC[event-c]
    EC -->|matches| R050[Rule 50]

    subgraph "Pair Creation & Sorting"
        Pairs["(event, rule) pairs:<br/>(b,005), (a,102), (b,201), (a,204)<br/><br/>Sort by rule.number ↓<br/><br/>005, 102, 201, 204"]
    end

    subgraph "Execution Order"
        O1["1️⃣ Rule 101<br/>(emits event-a, event-b)"]
        O2["2️⃣ Rule 5<br/>(first by number)"]
        O3["3️⃣ Rule 50<br/>(child of Rule 5)"]
        O4["4️⃣ Rule 102<br/>(next sibling)"]
        O5["5️⃣ Rule 201<br/>(next sibling)"]
        O6["6️⃣ Rule 204<br/>(last sibling)"]

        O1 --> O2
        O2 --> O3
        O3 --> O4
        O4 --> O5
        O5 --> O6
    end

    style R101 fill:#ff9999
    style R005 fill:#99ccff
    style R050 fill:#99ccff
    style R102 fill:#99ff99
    style R201 fill:#99ff99
    style R204 fill:#99ff99
    style EA fill:#ffffcc
    style EB fill:#ffffcc
    style EC fill:#ffffcc
```

---

## Algorithm Flowchart

This diagram shows the step-by-step algorithm for processing events:

```mermaid
flowchart TD
    A[Rule executes] --> B{Emitted events?}
    B -->|No| END[Done]
    B -->|Yes| C[Collect all emitted events]

    C --> D[Create event, rule pairs<br/>for each event × matching rules]

    D --> E[Sort pairs by rule.number<br/>ascending: 5, 102, 201, 204]

    E --> F[Take first pair]

    F --> G[Execute rule for this pair]

    G --> H{Rule emitted events?}

    H -->|Yes| I[Recursively process<br/>child pairs depth+1]

    H -->|No| J{More sibling pairs?}

    I --> J

    J -->|Yes| F
    J -->|No| END

    style A fill:#ff9999
    style G fill:#99ccff
    style I fill:#99ccff
```

---

## Tree Structure with Depth Levels

This diagram shows the tree structure and how depth is tracked per-branch:

```mermaid
graph TD
    subgraph "Depth 0"
        R101["Rule 101<br/>①"]
    end

    subgraph "Depth 1 - Siblings sorted by rule number"
        R005["Rule 5 ②<br/>(from event-b)"]
        R102["Rule 102 ④<br/>(from event-a)"]
        R201["Rule 201 ⑤<br/>(from event-b)"]
        R204["Rule 204 ⑥<br/>(from event-a)"]
    end

    subgraph "Depth 2"
        R050["Rule 50 ③<br/>(child of Rule 5)"]
    end

    R101 -->|emits events| R005
    R101 -->|emits events| R102
    R101 -->|emits events| R201
    R101 -->|emits events| R204

    R005 -->|emits event-c| R050

    style R005 fill:#ffcccc
    style R050 fill:#ffcccc
    style R102 fill:#ccffcc
    style R201 fill:#ccccff
    style R204 fill:#ffffcc
```

**Key Insights:**

- **Red (Rules 5 & 50)**: Rule 5's entire descendant tree (including Rule 50) executes completely before moving to siblings
- **Green (Rule 102)**: Next sibling by rule number
- **Blue (Rule 201)**: Next sibling
- **Yellow (Rule 204)**: Final sibling

---

## Why Depth-First Instead of Breadth-First?

### Breadth-First (Old Approach)
Execution order: **101 → 5 → 102 → 201 → 204 → 50**

All siblings at depth 1 execute before any children at depth 2.

### Depth-First Preorder (New Approach)
Execution order: **101 → 5 → 50 → 102 → 201 → 204**

Each sibling's entire descendant tree executes before moving to the next sibling.

### Why This Matters for Nomic

The depth-first approach aligns with Nomic's philosophy where:

1. **Cascading effects complete first**: When Rule 5 executes and emits event-c, Rule 50's effect should complete before other rules at the same level execute
2. **Legal precedent model**: Like real law, earlier provisions (lower-numbered rules) are fully interpreted with all their consequences before later provisions
3. **Predictability**: Players can reason about "If my rule fires, what's the complete cascade?" rather than "what gets interleaved?"
4. **Rule ordering matters**: Lower-numbered rules (often immutable base rules) fully execute with all side effects before higher-numbered player rules

---

## Execution Limits

- **Per-branch depth limit**: 100 levels
  - Each sibling branch can go 100 levels deep independently
  - Prevents infinite recursion in a single chain

- **Global node limit**: 1000 total rule executions
  - Prevents runaway execution across the entire tree
  - Counts all rules executed across all branches

When either limit is exceeded, the dispatcher logs a warning and stops processing.

---

## Implementation Details

### Key Data Structures

```typescript
interface DispatchResult {
  state: GameState;
  totalNodes: number;
}

interface EventRulePair {
  event: GameEvent;
  rule: Rule;
}
```

### Core Methods

1. **processEvents(state)**: Main entry point
2. **processEventsWithTracking(state, totalNodes)**: Internal tracking method
3. **dispatchEvent(state, event, depth, totalNodes)**: Processes a single event
4. **dispatchEventForRule(state, event, rule, depth, totalNodes)**: Processes a specific (event, rule) pair

### Pair Creation and Sorting

**For all events** (both initial events in `pendingEvents` and events emitted by rules):
1. Collect all events
2. For each event, find all matching rules
3. Create (event, rule) pairs
4. Sort pairs by `rule.number` in ascending order (5, 102, 201, 204)
5. Execute each pair depth-first

This ensures that **regardless of the order events are emitted or appear in pendingEvents**, the execution order is deterministic and based on rule numbers.

**Example:**
If `pendingEvents = [event-a, event-b]` where:
- event-a triggers Rule 102
- event-b triggers Rule 5

Execution order will be: **Rule 5, then Rule 102** (sorted by rule number, not event order)
