/**
 * JSON serialization for game state
 *
 * Handles serialization of Maps and other non-JSON-native types to
 * enable saving and loading game state from JSON files.
 */

import type { GameState, Proposal } from '../core/types.js';

// ============================================================================
// Serialized Type Definitions
// ============================================================================

/**
 * JSON-serializable version of GameState
 * Maps are converted to arrays of [key, value] tuples
 */
export interface SerializedGameState {
  version: string;
  gameId: string;
  createdAt: number;
  updatedAt: number;
  status: string;
  players: any[];
  points: Array<[string, number]>; // Map -> array
  rules: any[];
  turns: {
    currentTurn: number;
    currentPlayerId: string | null;
    turnOrder: string[];
    turnStartedAt: number | null;
    turnHistory: any[];
  };
  voting: {
    activeProposals: SerializedProposal[];
    proposalHistory: SerializedProposal[];
  };
  history: any[];
  extensions: Array<[string, any]>; // Map -> array
}

interface SerializedProposal {
  id: string;
  type: string;
  proposedBy: string;
  proposedAt: number;
  rule?: any;
  description: string;
  votes: Array<[string, any]>; // Map -> array
  status: string;
  resolvedAt: number | null;
}

// ============================================================================
// Game Serializer
// ============================================================================

export class GameSerializer {
  /**
   * Serialize game state to JSON-compatible object
   */
  serialize(state: GameState): SerializedGameState {
    return {
      version: state.version,
      gameId: state.gameId,
      createdAt: state.createdAt,
      updatedAt: state.updatedAt,
      status: state.status,
      players: Array.from(state.players),
      points: Array.from(state.points.entries()),
      rules: Array.from(state.rules),
      turns: {
        currentTurn: state.turns.currentTurn,
        currentPlayerId: state.turns.currentPlayerId,
        turnOrder: Array.from(state.turns.turnOrder),
        turnStartedAt: state.turns.turnStartedAt,
        turnHistory: Array.from(state.turns.turnHistory),
      },
      voting: {
        activeProposals: state.voting.activeProposals.map(p => this.serializeProposal(p)),
        proposalHistory: state.voting.proposalHistory.map(p => this.serializeProposal(p)),
      },
      history: Array.from(state.history),
      extensions: Array.from(state.extensions.entries()),
    };
  }

  /**
   * Deserialize from JSON-compatible object to game state
   */
  deserialize(data: SerializedGameState): GameState {
    return {
      version: data.version,
      gameId: data.gameId,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      status: data.status as any,
      players: data.players,
      points: new Map(data.points),
      rules: data.rules,
      turns: {
        currentTurn: data.turns.currentTurn,
        currentPlayerId: data.turns.currentPlayerId,
        turnOrder: data.turns.turnOrder,
        turnStartedAt: data.turns.turnStartedAt,
        turnHistory: data.turns.turnHistory,
      },
      voting: {
        activeProposals: data.voting.activeProposals.map(p => this.deserializeProposal(p)),
        proposalHistory: data.voting.proposalHistory.map(p => this.deserializeProposal(p)),
      },
      pendingEvents: [], // Events should be processed before saving
      history: data.history,
      extensions: new Map(data.extensions),
    };
  }

  /**
   * Serialize a single proposal
   */
  private serializeProposal(proposal: Proposal): SerializedProposal {
    return {
      id: proposal.id,
      type: proposal.type,
      proposedBy: proposal.proposedBy,
      proposedAt: proposal.proposedAt,
      rule: proposal.rule,
      description: proposal.description,
      votes: Array.from(proposal.votes.entries()),
      status: proposal.status,
      resolvedAt: proposal.resolvedAt,
    };
  }

  /**
   * Deserialize a single proposal
   */
  private deserializeProposal(data: SerializedProposal): Proposal {
    return {
      id: data.id,
      type: data.type as any,
      proposedBy: data.proposedBy,
      proposedAt: data.proposedAt,
      rule: data.rule,
      description: data.description,
      votes: new Map(data.votes),
      status: data.status as any,
      resolvedAt: data.resolvedAt,
    };
  }

  /**
   * Serialize to JSON string
   */
  toJSON(state: GameState, pretty: boolean = true): string {
    const serialized = this.serialize(state);
    return JSON.stringify(serialized, null, pretty ? 2 : 0);
  }

  /**
   * Deserialize from JSON string
   */
  fromJSON(json: string): GameState {
    const data = JSON.parse(json) as SerializedGameState;
    return this.deserialize(data);
  }
}
