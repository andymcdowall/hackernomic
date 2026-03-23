# Nomic Engine

A self-amending game engine where rules are pure TypeScript functions. Build games where players can propose, vote on, and execute new rules that fundamentally change how the game works.

## What is Nomic?

Nomic is a game where changing the rules is a move. Players propose new rules, vote on them democratically, and the rules actually execute to modify the game state. This engine makes it easy to build Nomic games and other self-amending systems.

## Features

- **Rules as Pure Functions**: Rules are `(state: GameState) => GameState` functions
- **Secure Sandboxing**: Rules execute in isolated VM context with vm2
- **Immutable State**: Functional state management with validation
- **Democratic Voting**: Proposal and voting system built-in
- **Turn Management**: Sequential turn-based gameplay
- **Extensions**: Rules can add custom state beyond the core schema
- **Composable**: Combine and compose rules using functional patterns
- **Persistent**: Save/load games to JSON files
- **CLI**: Interactive command-line interface included

## Installation

```bash
npm install
npm run build
```

## Quick Start

### Using the CLI

```bash
# Create a new game
npx nomic new my-game --players Alice Bob Charlie

# Play interactively
npx nomic play games/my-game.json

# Check status
npx nomic status games/my-game.json

# View rules
npx nomic rules games/my-game.json
```

### Using as a Library

```typescript
import { NomicEngine, generateId } from 'nomic-engine';

// Create a new game
const engine = new NomicEngine();

// Add players
engine.initialize(['Alice', 'Bob', 'Charlie']);

// Start the game
engine.start();

// Propose a new rule
const rule = {
  id: generateId(),
  number: 401,
  name: 'Double Points',
  description: 'Proposers get 20 points instead of 10',
  code: `(state, context) => StateHelpers.awardPoints(state, context.triggeredBy, 20)`,
  isActive: false,
  isMutable: true,
  proposedBy: aliceId,
  createdAt: Date.now()
};

const proposalId = engine.proposeRule(aliceId, 'I propose double points!', rule);

// Vote on the proposal
engine.vote(proposalId, aliceId, 'yes');
engine.vote(proposalId, bobId, 'yes');
engine.vote(proposalId, charlieId, 'no');

// If passed, the rule is now active and will execute

// Save game
await engine.save('./my-game.json');

// Load game later
const loaded = await NomicEngine.load('./my-game.json');
```

## Writing Rules

Rules are pure TypeScript functions that transform state:

### Basic Rule

```typescript
const simpleRule: Rule = {
  id: generateId(),
  number: 401,
  name: 'My Rule',
  description: 'Does something cool',
  code: `(state) => {
    // Your logic here
    return state;
  }`,
  isActive: false,
  isMutable: true,
  proposedBy: playerId,
  createdAt: Date.now()
};
```

### Award Points

```typescript
code: `(state, context) => {
  return StateHelpers.awardPoints(state, context.triggeredBy, 10);
}`
```

### Win Condition

```typescript
code: `(state) => {
  for (const [playerId, points] of state.points.entries()) {
    if (points >= 100) {
      return { ...state, status: 'completed' };
    }
  }
  return state;
}`
```

### Using Extensions (Custom State)

```typescript
code: `(state, context) => {
  // Get or create reputation map
  const reputations = StateHelpers.getExtension(state, 'reputations', new Map());

  // Update reputation
  const current = reputations.get(context.triggeredBy) || 0;
  const updated = new Map(reputations);
  updated.set(context.triggeredBy, current + 1);

  // Save back to extensions
  return StateHelpers.setExtension(state, 'reputations', updated);
}`
```

## Core Concepts

### Game State

The game state is immutable and includes:

- **Players**: List of players with names and IDs
- **Points**: Map of player IDs to point totals
- **Rules**: All rules (active and inactive)
- **Turns**: Current turn, turn order, and turn history
- **Voting**: Active proposals and proposal history
- **Extensions**: Custom state added by rules
- **History**: Complete audit trail of all state changes

### Rules

- **Pure Functions**: `(state: GameState, context: RuleContext) => GameState`
- **Sandboxed**: Execute in isolated VM with timeout
- **Numbered**: Follow Nomic convention (101, 201, 301, ...)
- **Mutable/Immutable**: Some rules can be changed, others cannot
- **Active/Inactive**: Only active rules execute

### Proposals & Voting

1. Player proposes a rule change
2. All players vote (yes/no/abstain)
3. If majority votes yes, the proposal passes
4. Passed rules become active and proposer gets points

### Turn System

- Sequential turn order
- Each player gets a turn
- Actions are recorded per turn
- Win conditions checked after each turn

## State Helpers

Rules have access to helper functions:

```typescript
StateHelpers.getPlayer(state, playerId)
StateHelpers.getCurrentPlayer(state)
StateHelpers.getPoints(state, playerId)
StateHelpers.awardPoints(state, playerId, amount)
StateHelpers.getExtension(state, key, defaultValue)
StateHelpers.setExtension(state, key, value)
StateHelpers.getLeaderboard(state)
```

## Rule Composition

Combine rules using functional patterns:

```typescript
import { composeRules, conditionalRule, turnRule } from 'nomic-engine';

// Execute rules in sequence
const combined = composeRules(checkWin, awardPoints, updateStats);

// Conditional execution
const ifLeading = conditionalRule(
  (state, context) => {
    const points = StateHelpers.getPoints(state, context.triggeredBy);
    return points > 50;
  },
  bonusRule
);

// Execute every N turns
const everyFiveTurns = turnRule(
  (turn) => turn % 5 === 0,
  specialRule
);
```

## Security

Rules run in a secure sandbox:

- **Isolated VM**: Uses vm2 for true isolation
- **Timeout**: 5 second maximum execution time
- **No I/O**: Cannot access filesystem, network, or system APIs
- **Iteration Limits**: Prevents infinite loops
- **Whitelisted Globals**: Only safe built-ins available
- **Human Approval**: Rules must be approved before activation

## Initial Rules

Every game starts with these rules:

- **Rule 101**: Win by Points - First to 100 wins
- **Rule 201**: Sequential Turn Order
- **Rule 202**: One Proposal Per Turn
- **Rule 301**: Majority Voting
- **Rule 302**: 10 Points for Passed Proposals

## API Reference

### NomicEngine

Main engine class:

```typescript
// Create/load
new NomicEngine(state?)
NomicEngine.load(filepath)

// Setup
engine.initialize(playerNames)
engine.addPlayer(name)
engine.start()

// Gameplay
engine.proposeRule(playerId, description, rule)
engine.vote(proposalId, playerId, value)
engine.endTurn(actions?)
engine.executeRule(ruleId, triggeredBy)
engine.checkWinConditions()

// Queries
engine.getState()
engine.getPlayers()
engine.getActiveRules()
engine.getLeaderboard()
engine.getActiveProposals()

// Persistence
engine.save(filepath)
engine.toJSON()
NomicEngine.fromJSON(json)
```

## Examples

See [examples/initial-rules.ts](./examples/initial-rules.ts) for:

- Basic rules
- Extension usage
- Win conditions
- Advanced patterns
- Rule templates

## Project Structure

```
nomic-engine/
├── src/
│   ├── core/
│   │   ├── types.ts          # Type definitions
│   │   ├── state.ts          # State management
│   │   └── engine.ts         # Main engine
│   ├── systems/
│   │   ├── turn.ts           # Turn management
│   │   ├── voting.ts         # Voting system
│   │   └── transitions.ts    # State validation
│   ├── rules/
│   │   ├── executor.ts       # Rule execution
│   │   └── composition.ts    # Rule composition
│   ├── sandbox/
│   │   └── runtime.ts        # Secure sandbox
│   ├── persistence/
│   │   ├── serializer.ts     # JSON serialization
│   │   └── storage.ts        # File I/O
│   ├── cli/
│   │   └── index.ts          # CLI interface
│   └── index.ts              # Main export
└── examples/
    └── initial-rules.ts      # Example rules
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Type check
npm run typecheck

# Development mode (pass -- to forward args to the CLI)
npm run dev -- play games/my-game.json
npm run dev -- new my-game --players Alice Bob
```

## Architecture Decisions

### Why Functional/Immutable?

- Predictable state changes
- Easy to reason about
- Time-travel debugging possible
- No unexpected mutations
- Composable rules

### Why vm2 Sandbox?

- True isolation (separate V8 context)
- Hard resource limits
- Battle-tested security
- Prevents malicious code

### Why Extensions?

- Allows rules to add custom state
- Core schema stays type-safe
- Enables emergent gameplay
- Balances flexibility and safety

## Limitations

- Rules must be synchronous (no async/await)
- No direct state mutation (use functional updates)
- Sandbox has timeout and iteration limits
- Extensions are not type-checked at compile time

## Future Enhancements

- AI-powered natural language → TypeScript conversion
- Web UI using this engine as backend
- Real-time multiplayer with WebSockets
- Rule template library
- Visual rule builder
- Game replay and time-travel
- Database persistence option

## License

None.

## Credits

Built with:
- [vm2](https://github.com/patriksimek/vm2) - Secure sandboxing
- [commander](https://github.com/tj/commander.js) - CLI framework
- [TypeScript](https://www.typescriptlang.org/) - Type safety

Inspired by Peter Suber's [Nomic](https://legacy.earlham.edu/~peters/writing/nomic.htm).
