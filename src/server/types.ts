/**
 * HTTP server types and request/response shapes for the Nomic game server.
 */

// ============================================================================
// Request bodies
// ============================================================================

export interface AddPlayerRequest {
  name: string;
}

export interface ProposeRequest {
  playerId: string;
  description: string;
  ruleText: string;
}

export interface VoteRequest {
  playerId: string;
  proposalId: string;
  value: 'yes' | 'no';
}

export interface EndTurnRequest {
  playerId: string;
}

// ============================================================================
// Response shapes
// ============================================================================

export interface AddPlayerResponse {
  playerId: string;
}

export interface ProposeResponse {
  proposalId: string;
}

export interface ErrorResponse {
  error: string;
}

// ============================================================================
// Server config
// ============================================================================

export interface ServerConfig {
  port: number;
  gameFile: string;
}
