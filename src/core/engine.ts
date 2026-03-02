/**
 * Nomic Engine - Main orchestrator
 *
 * Integrates all systems and provides the primary API for the game engine.
 */

import type {
  Action,
  GameState,
  Player,
  Proposal,
  Rule,
  RuleContext,
  VoteValue,
  VotingRules,
} from './types.js';
import { addPlayer, createInitialState, emitSystemEvent, generateId } from './state.js';
import { TurnManager } from '../systems/turn.js';
import { VotingManager } from '../systems/voting.js';
import { RuleExecutor } from '../rules/executor.js';
import {
  EventDispatcher,
  type EventDispatcherConfig,
} from '../rules/dispatcher.js';
import { GameStorage } from '../persistence/storage.js';

// ============================================================================
// Nomic Engine
// ============================================================================

export interface NomicEngineOptions {
  state?: GameState;
  dispatcherConfig?: Partial<EventDispatcherConfig>;
}

export class NomicEngine {
  private state: GameState;
  private turnManager: TurnManager;
  private votingManager: VotingManager;
  private ruleExecutor: RuleExecutor;
  private eventDispatcher: EventDispatcher;

  /**
   * Create a new Nomic Engine instance
   * @param options - Optional configuration and initial state
   */
  constructor(options?: GameState | NomicEngineOptions) {
    // Support both old signature (state) and new signature (options)
    if (options && 'gameId' in options) {
      // Old signature: constructor(state?: GameState)
      this.state = options;
    } else if (options && 'state' in options) {
      // New signature: constructor(options?: NomicEngineOptions)
      this.state = options.state || createInitialState(generateId());
    } else {
      // No arguments
      this.state = createInitialState(generateId());
    }

    this.turnManager = new TurnManager();
    this.votingManager = new VotingManager();
    this.ruleExecutor = new RuleExecutor();

    // Extract dispatcher config if using new options signature
    const dispatcherConfig =
      options && 'dispatcherConfig' in options ? options.dispatcherConfig : undefined;
    this.eventDispatcher = new EventDispatcher(this.ruleExecutor, dispatcherConfig);
  }

  // ========================================================================
  // State Access
  // ========================================================================

  /**
   * Get the current game state (immutable)
   */
  getState(): GameState {
    return this.state;
  }

  /**
   * Get game ID
   */
  getGameId(): string {
    return this.state.gameId;
  }

  /**
   * Get game status
   */
  getStatus(): GameState['status'] {
    return this.state.status;
  }

  // ========================================================================
  // Game Setup
  // ========================================================================

  /**
   * Add a player to the game
   * Can only be done during setup
   */
  addPlayer(name: string): Player {
    if (this.state.status !== 'setup') {
      throw new Error('Players can only be added during setup');
    }

    const player: Player = {
      id: generateId(),
      name,
      joinedAt: Date.now(),
      isActive: true,
    };

    this.state = addPlayer(this.state, player);
    return player;
  }

  /**
   * Initialize game with multiple players
   */
  initialize(playerNames: string[]): void {
    if (this.state.status !== 'setup') {
      throw new Error('Game already initialized');
    }

    for (const name of playerNames) {
      this.addPlayer(name);
    }
  }

  /**
   * Start the game (move from setup to active)
   */
  start(): void {
    this.state = this.turnManager.startGame(this.state);
  }

  // ========================================================================
  // Turn Management
  // ========================================================================

  /**
   * End the current turn and advance to next player
   */
  endTurn(actions: ReadonlyArray<Action> = []): void {
    const currentPlayerId = this.state.turns.currentPlayerId || 'system';

    // Advance turn
    this.state = this.turnManager.endTurn(this.state, actions);

    // Emit turn-end event
    this.state = emitSystemEvent(this.state, 'turn-end', currentPlayerId);

    // Process all events (this will trigger rules with turn-end trigger)
    this.state = this.eventDispatcher.processEvents(this.state);
  }

  /**
   * Get the current turn number
   */
  getCurrentTurn(): number {
    return this.state.turns.currentTurn;
  }

  /**
   * Get the current player ID
   */
  getCurrentPlayerId(): string | null {
    return this.state.turns.currentPlayerId;
  }

  /**
   * Check if it's a specific player's turn
   */
  isPlayerTurn(playerId: string): boolean {
    return this.turnManager.isPlayerTurn(this.state, playerId);
  }

  /**
   * Pause the game
   */
  pause(): void {
    this.state = this.turnManager.pauseGame(this.state);
  }

  /**
   * Resume a paused game
   */
  resume(): void {
    this.state = this.turnManager.resumeGame(this.state);
  }

  /**
   * Process any pending events
   */
  processEvents(): void {
    this.state = this.eventDispatcher.processEvents(this.state);
  }

  // ========================================================================
  // Rule Proposals
  // ========================================================================

  /**
   * Propose a new rule
   */
  proposeRule(
    playerId: string,
    description: string,
    rule: Rule
  ): string {
    this.state = this.votingManager.createProposal(
      this.state,
      'add-rule',
      playerId,
      description,
      rule
    );

    // Return the proposal ID
    return this.state.voting.activeProposals[
      this.state.voting.activeProposals.length - 1
    ].id;
  }

  /**
   * Propose modifying an existing rule
   */
  proposeModifyRule(
    playerId: string,
    description: string,
    modifiedRule: Rule
  ): string {
    this.state = this.votingManager.createProposal(
      this.state,
      'modify-rule',
      playerId,
      description,
      modifiedRule
    );

    return this.state.voting.activeProposals[
      this.state.voting.activeProposals.length - 1
    ].id;
  }

  /**
   * Propose removing a rule
   */
  proposeRemoveRule(
    playerId: string,
    description: string,
    ruleToRemove: Rule
  ): string {
    this.state = this.votingManager.createProposal(
      this.state,
      'remove-rule',
      playerId,
      description,
      ruleToRemove
    );

    return this.state.voting.activeProposals[
      this.state.voting.activeProposals.length - 1
    ].id;
  }

  // ========================================================================
  // Voting
  // ========================================================================

  /**
   * Cast a vote on a proposal
   */
  vote(proposalId: string, playerId: string, value: VoteValue): void {
    this.state = this.votingManager.castVote(this.state, proposalId, playerId, value);

    // Check if all votes are in and auto-resolve
    if (this.votingManager.canResolve(this.state, proposalId)) {
      this.resolveProposal(proposalId);
    }
  }

  /**
   * Resolve a proposal (tally votes and apply if passed)
   */
  resolveProposal(proposalId: string, votingRules?: VotingRules): void {
    this.state = this.votingManager.resolveProposal(
      this.state,
      proposalId,
      votingRules
    );

    // Process any events that were emitted (e.g., proposal-passed)
    this.state = this.eventDispatcher.processEvents(this.state);
  }

  /**
   * Withdraw a proposal
   */
  withdrawProposal(proposalId: string, playerId: string): void {
    this.state = this.votingManager.withdrawProposal(this.state, proposalId, playerId);
  }

  /**
   * Get all active proposals
   */
  getActiveProposals(): ReadonlyArray<Proposal> {
    return this.state.voting.activeProposals;
  }

  /**
   * Get a proposal by ID
   */
  getProposal(proposalId: string): Proposal | undefined {
    return this.votingManager.getProposal(this.state, proposalId);
  }

  // ========================================================================
  // Rule Execution
  // ========================================================================

  /**
   * Execute a specific rule manually (for testing or special triggers)
   */
  executeRule(ruleId: string, triggeredBy: string): void {
    const rule = this.state.rules.find(r => r.id === ruleId);
    if (!rule) {
      throw new Error(`Rule ${ruleId} not found`);
    }

    const context: RuleContext = {
      triggeredBy,
      timestamp: Date.now(),
    };

    const result = this.ruleExecutor.executeRule(this.state, rule, context);
    if (!result.success) {
      throw new Error(`Rule execution failed: ${result.error}`);
    }

    if (result.state) {
      this.state = result.state;
    }
  }

  /**
   * Check all win conditions
   */
  checkWinConditions(): void {
    this.state = this.ruleExecutor.checkWinConditions(this.state);
  }

  /**
   * Validate a rule's code without executing it
   */
  validateRuleCode(ruleCode: string): { valid: boolean; errors: string[] } {
    return this.ruleExecutor.validateRuleCode(ruleCode);
  }

  // ========================================================================
  // Queries
  // ========================================================================

  /**
   * Get all players
   */
  getPlayers(): ReadonlyArray<Player> {
    return this.state.players;
  }

  /**
   * Get a player by ID
   */
  getPlayer(playerId: string): Player | undefined {
    return this.state.players.find(p => p.id === playerId);
  }

  /**
   * Get player points
   */
  getPoints(playerId: string): number {
    return this.state.points.get(playerId) || 0;
  }

  /**
   * Get all active rules
   */
  getActiveRules(): ReadonlyArray<Rule> {
    return this.state.rules.filter(r => r.isActive);
  }

  /**
   * Get all rules (including inactive)
   */
  getAllRules(): ReadonlyArray<Rule> {
    return this.state.rules;
  }

  /**
   * Get a rule by ID
   */
  getRule(ruleId: string): Rule | undefined {
    return this.state.rules.find(r => r.id === ruleId);
  }

  /**
   * Get a rule by number
   */
  getRuleByNumber(ruleNumber: number): Rule | undefined {
    return this.state.rules.find(r => r.number === ruleNumber);
  }

  /**
   * Get leaderboard (players sorted by points)
   */
  getLeaderboard(): Array<{ player: Player; points: number }> {
    return this.state.players
      .map(player => ({
        player,
        points: this.state.points.get(player.id) || 0,
      }))
      .sort((a, b) => b.points - a.points);
  }

  // ========================================================================
  // Persistence
  // ========================================================================

  /**
   * Save game to a file
   */
  async save(filepath: string): Promise<void> {
    const storage = new GameStorage();
    await storage.save(this.state, filepath);
  }

  /**
   * Load game from a file
   */
  static async load(filepath: string): Promise<NomicEngine> {
    const storage = new GameStorage();
    const state = await storage.load(filepath);
    return new NomicEngine(state);
  }

  /**
   * Export state as JSON string
   */
  toJSON(): string {
    return JSON.stringify(this.state, (_key, value) => {
      if (value instanceof Map) {
        return Array.from(value.entries());
      }
      return value;
    }, 2);
  }

  /**
   * Create engine from JSON string
   */
  static fromJSON(json: string): NomicEngine {
    const parsed = JSON.parse(json);
    // Reconstruct Maps
    const state: GameState = {
      ...parsed,
      points: new Map(parsed.points),
      extensions: new Map(parsed.extensions),
      voting: {
        ...parsed.voting,
        activeProposals: parsed.voting.activeProposals.map((p: any) => ({
          ...p,
          votes: new Map(p.votes),
        })),
        proposalHistory: parsed.voting.proposalHistory.map((p: any) => ({
          ...p,
          votes: new Map(p.votes),
        })),
      },
    };
    return new NomicEngine(state);
  }
}
