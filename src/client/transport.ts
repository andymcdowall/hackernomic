/**
 * GameTransport interface and client-side types.
 *
 * These types mirror the HTTP API response shapes — they are NOT the same as
 * the engine's internal GameState. Clients work entirely with these types.
 */

import type { Rule, VoteValue } from '../core/types.js';

// ── Response types (match server response shapes) ─────────────────────────────

export interface ClientPlayer {
  id: string;
  name: string;
  points: number;
  isActive: boolean;
}

/** Matches GET /state response */
export interface ClientGameState {
  gameId: string;
  status: 'setup' | 'active' | 'paused' | 'completed';
  turn: number;
  currentPlayerId: string | null;
  players: ClientPlayer[];
  activeProposals: number;
}

/** Matches entries in GET /rules response */
export interface ClientRule {
  id: string;
  number: number;
  name: string;
  description: string;
  isMutable: boolean;
  proposedBy: string;
}

/** Matches entries in GET /proposals response */
export interface ClientProposal {
  id: string;
  type: string;
  description: string;
  proposedBy: string;
  status: string;
  votes: Array<{ playerId: string; value: string }>;
  totalPlayers: number;
}

// ── Transport interface ───────────────────────────────────────────────────────

export interface GameTransport {
  /** GET /state */
  getState(): Promise<ClientGameState>;

  /** GET /rules */
  getRules(): Promise<ClientRule[]>;

  /** GET /proposals */
  getProposals(): Promise<ClientProposal[]>;

  /** POST /propose — returns proposalId */
  propose(playerId: string, description: string, rule: Rule): Promise<string>;

  /** POST /vote — returns resolved proposal status */
  vote(playerId: string, proposalId: string, value: VoteValue): Promise<string>;

  /** POST /end-turn */
  endTurn(playerId: string): Promise<void>;
}
