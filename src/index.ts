/**
 * Nomic Engine
 *
 * A self-amending game engine where rules are pure TypeScript functions.
 * Build games where players can propose, vote on, and execute new rules.
 *
 * @example
 * ```typescript
 * import { NomicEngine } from 'nomic-engine';
 *
 * // Create a new game
 * const engine = new NomicEngine();
 *
 * // Add players
 * engine.initialize(['Alice', 'Bob', 'Charlie']);
 *
 * // Start the game
 * engine.start();
 *
 * // Propose a new rule
 * const rule = {
 *   id: generateId(),
 *   number: 401,
 *   name: 'Double Points',
 *   description: 'Players get 2 points instead of 1 for passing rules',
 *   code: `(state, context) => awardPoints(state, context.triggeredBy, 20)`,
 *   isActive: false,
 *   isMutable: true,
 *   proposedBy: playerId,
 *   createdAt: Date.now()
 * };
 *
 * const proposalId = engine.proposeRule(playerId, 'I propose double points!', rule);
 *
 * // Players vote
 * engine.vote(proposalId, player1Id, 'yes');
 * engine.vote(proposalId, player2Id, 'yes');
 * engine.vote(proposalId, player3Id, 'no');
 *
 * // Save game
 * await engine.save('./my-game.json');
 *
 * // Load game
 * const loaded = await NomicEngine.load('./my-game.json');
 * ```
 */

// ============================================================================
// Main Engine
// ============================================================================

export { NomicEngine } from './core/engine.js';
export type { NomicEngineOptions } from './core/engine.js';

// ============================================================================
// Core Types
// ============================================================================

export type {
  GameState,
  GameStatus,
  Player,
  Rule,
  RuleFunction,
  RuleContext,
  TurnState,
  TurnRecord,
  TurnStats,
  Action,
  VotingState,
  Proposal,
  ProposalType,
  ProposalStatus,
  Vote,
  VoteValue,
  VotingRules,
  VoteResult,
  StateTransition,
  TransitionType,
  ExecutionResult,
  ValidationResult,
  Writable,
  GameEvent,
  RuleTrigger,
  SystemEvent,
} from './core/types.js';

export { SYSTEM_EVENTS } from './core/types.js';

// ============================================================================
// Errors
// ============================================================================

export {
  NomicEngineError,
  RuleExecutionError,
  StateValidationError,
} from './core/types.js';

// ============================================================================
// State Utilities
// ============================================================================

export {
  generateId,
  deepClone,
  deepFreeze,
  createInitialState,
  getInitialRules,
  updateState,
  addPlayer,
  awardPoints,
  addRule,
  addTransition,
  emitSystemEvent,
  StateHelpers,
} from './core/state.js';

// ============================================================================
// Managers (for advanced usage)
// ============================================================================

export { TurnManager } from './systems/turn.js';
export { VotingManager } from './systems/voting.js';

// ============================================================================
// Rule Execution
// ============================================================================

export { RuleExecutor } from './rules/executor.js';
export type { ExecuteMultipleResult } from './rules/executor.js';

export {
  EventDispatcher,
  DEFAULT_DISPATCHER_CONFIG,
} from './rules/dispatcher.js';
export type { EventDispatcherConfig } from './rules/dispatcher.js';

export { RuleSandbox, DEFAULT_SANDBOX_CONFIG } from './sandbox/runtime.js';
export type { SandboxConfig } from './sandbox/runtime.js';

// ============================================================================
// Rule Composition
// ============================================================================

export {
  composeRules,
  conditionalRule,
  playerRule,
  statusRule,
  turnRule,
  onceRule,
  limitedRule,
  orRules,
  tryRule,
  loggedRule,
  cooldownRule,
  chainRules,
  forEachPlayer,
  whenPlayerCondition,
  everyNTurns,
  currentPlayerRule,
  minPointsRule,
} from './rules/composition.js';

// ============================================================================
// Validation
// ============================================================================

export {
  validateState,
  validateTransition,
  assertValidState,
  assertValidTransition,
} from './systems/transitions.js';

// ============================================================================
// Persistence
// ============================================================================

export { GameStorage } from './persistence/storage.js';
export type { FileMetadata } from './persistence/storage.js';

export { GameSerializer } from './persistence/serializer.js';
export type { SerializedGameState } from './persistence/serializer.js';
