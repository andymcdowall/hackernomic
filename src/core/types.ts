/**
 * Core type definitions for the Nomic Engine
 *
 * This file defines the complete domain model for a self-amending game where:
 * - State is immutable (all fields are readonly)
 * - Rules are pure functions that transform state
 * - Extensions allow rules to add custom state
 */

// ============================================================================
// Game State
// ============================================================================

export type GameStatus = 'setup' | 'active' | 'paused' | 'completed';

export interface GameState {
  // Metadata
  readonly version: string;
  readonly gameId: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly status: GameStatus;

  // Core entities
  readonly players: ReadonlyArray<Player>;
  readonly points: ReadonlyMap<string, number>; // playerId -> points
  readonly rules: ReadonlyArray<Rule>;

  // Game systems
  readonly turns: TurnState;
  readonly voting: VotingState;

  // Audit trail
  readonly history: ReadonlyArray<StateTransition>;

  // Extension area (rules can add arbitrary state here)
  readonly extensions: ReadonlyMap<string, unknown>;
}

// ============================================================================
// Players
// ============================================================================

export interface Player {
  readonly id: string;
  readonly name: string;
  readonly joinedAt: number;
  readonly isActive: boolean;
}

// ============================================================================
// Rules
// ============================================================================

export interface Rule {
  readonly id: string;
  readonly number: number; // Nomic convention: rules are numbered
  readonly name: string;
  readonly description: string;
  readonly code: string; // TypeScript function source code
  readonly isActive: boolean;
  readonly isMutable: boolean; // Can this rule be changed?
  readonly proposedBy: string; // player ID
  readonly createdAt: number;
}

/**
 * Rule function signature
 * All rules are pure functions that take state and context, return new state
 */
export type RuleFunction = (state: GameState, context: RuleContext) => GameState;

export interface RuleContext {
  readonly triggeredBy: string; // player ID or 'system'
  readonly action?: Action;
  readonly timestamp: number;
}

// ============================================================================
// Turn System
// ============================================================================

export interface TurnState {
  readonly currentTurn: number;
  readonly currentPlayerId: string | null;
  readonly turnOrder: ReadonlyArray<string>; // array of player IDs
  readonly turnStartedAt: number | null;
  readonly turnHistory: ReadonlyArray<TurnRecord>;
}

export interface TurnRecord {
  readonly turnNumber: number;
  readonly playerId: string;
  readonly startedAt: number;
  readonly endedAt: number;
  readonly actions: ReadonlyArray<Action>;
}

export interface Action {
  readonly id: string;
  readonly type: string;
  readonly playerId: string;
  readonly timestamp: number;
  readonly data: unknown;
}

export interface TurnStats {
  readonly totalTurns: number;
  readonly totalActions: number;
  readonly averageTurnDuration: number;
}

// ============================================================================
// Voting System
// ============================================================================

export interface VotingState {
  readonly activeProposals: ReadonlyArray<Proposal>;
  readonly proposalHistory: ReadonlyArray<Proposal>;
}

export type ProposalType = 'add-rule' | 'modify-rule' | 'remove-rule';
export type ProposalStatus = 'pending' | 'passed' | 'failed' | 'withdrawn';

export interface Proposal {
  readonly id: string;
  readonly type: ProposalType;
  readonly proposedBy: string;
  readonly proposedAt: number;
  readonly rule?: Rule; // The rule being proposed/modified/removed
  readonly description: string;
  readonly votes: ReadonlyMap<string, Vote>; // playerId -> vote
  readonly status: ProposalStatus;
  readonly resolvedAt: number | null;
}

export type VoteValue = 'yes' | 'no' | 'abstain';

export interface Vote {
  readonly playerId: string;
  readonly value: VoteValue;
  readonly votedAt: number;
}

export interface VotingRules {
  readonly threshold: number; // 0.5 = majority, 0.66 = supermajority
  readonly requireAllVotes: boolean; // Must all players vote?
}

export interface VoteResult {
  readonly passed: boolean;
  readonly yesCount: number;
  readonly noCount: number;
  readonly abstainCount: number;
  readonly totalEligibleVoters: number;
}

// ============================================================================
// State Transitions
// ============================================================================

export type TransitionType =
  | 'game-created'
  | 'player-joined'
  | 'turn-started'
  | 'turn-ended'
  | 'proposal-created'
  | 'vote-cast'
  | 'proposal-resolved'
  | 'rule-executed'
  | 'points-awarded'
  | 'extension-updated';

export interface StateTransition {
  readonly id: string;
  readonly timestamp: number;
  readonly type: TransitionType;
  readonly actorId: string; // player ID or 'system'
  readonly data: unknown;
  readonly previousStateHash?: string;
  readonly newStateHash?: string;
}

// ============================================================================
// Rule Execution
// ============================================================================

export interface ExecutionResult {
  readonly success: boolean;
  readonly state?: GameState;
  readonly error?: string;
  readonly rule: Rule;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: ReadonlyArray<string>;
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Writable version of a type (for internal use in update functions)
 */
export type Writable<T> = {
  -readonly [P in keyof T]: T[P] extends ReadonlyArray<infer U>
    ? Array<U>
    : T[P] extends ReadonlyMap<infer K, infer V>
    ? Map<K, V>
    : T[P];
};

// ============================================================================
// Error Types
// ============================================================================

export class NomicEngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NomicEngineError';
  }
}

export class RuleExecutionError extends NomicEngineError {
  constructor(
    message: string,
    public readonly rule: Rule,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'RuleExecutionError';
  }
}

export class StateValidationError extends NomicEngineError {
  constructor(
    message: string,
    public readonly errors: ReadonlyArray<string>
  ) {
    super(message);
    this.name = 'StateValidationError';
  }
}
