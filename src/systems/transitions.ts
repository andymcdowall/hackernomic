/**
 * State transition validation
 *
 * Validates that state changes maintain game invariants and rules.
 * Every state transition must pass validation.
 */

import type { GameState, Rule, ValidationResult } from '../core/types.js';

// ============================================================================
// State Transition Validation
// ============================================================================

/**
 * Validate a transition from old state to new state
 * Returns validation result with any errors found
 */
export function validateTransition(
  oldState: GameState,
  newState: GameState,
  _rule?: Rule
): ValidationResult {
  const errors: string[] = [];

  // 1. Game ID must not change
  if (oldState.gameId !== newState.gameId) {
    errors.push('Game ID cannot be changed');
  }

  // 2. Version must not change (unless explicitly migrating)
  if (oldState.version !== newState.version) {
    errors.push('Version cannot be changed');
  }

  // 3. Created timestamp must not change
  if (oldState.createdAt !== newState.createdAt) {
    errors.push('Created timestamp cannot be changed');
  }

  // 4. Updated timestamp must increase
  if (newState.updatedAt < oldState.updatedAt) {
    errors.push('Updated timestamp must increase');
  }

  // 5. Players can only be added, not removed
  if (newState.players.length < oldState.players.length) {
    errors.push('Players cannot be removed');
  }

  // 6. Player IDs must be unique
  const playerIds = new Set(newState.players.map(p => p.id));
  if (playerIds.size !== newState.players.length) {
    errors.push('Duplicate player IDs found');
  }

  // 7. Existing players must not change their IDs or join times
  for (const oldPlayer of oldState.players) {
    const newPlayer = newState.players.find(p => p.id === oldPlayer.id);
    if (newPlayer) {
      if (newPlayer.joinedAt !== oldPlayer.joinedAt) {
        errors.push(`Player ${oldPlayer.id} joined time was modified`);
      }
    } else {
      errors.push(`Player ${oldPlayer.id} was removed`);
    }
  }

  // 8. Points must be non-negative
  for (const [playerId, points] of newState.points.entries()) {
    if (points < 0) {
      errors.push(`Player ${playerId} has negative points: ${points}`);
    }
    if (!Number.isFinite(points)) {
      errors.push(`Player ${playerId} has invalid points: ${points}`);
    }
  }

  // 9. All players must have a points entry
  for (const player of newState.players) {
    if (!newState.points.has(player.id)) {
      errors.push(`Player ${player.id} missing from points map`);
    }
  }

  // 10. Turn number must not decrease
  if (newState.turns.currentTurn < oldState.turns.currentTurn) {
    errors.push('Turn number cannot decrease');
  }

  // 11. Turn order must contain valid player IDs
  for (const playerId of newState.turns.turnOrder) {
    if (!playerIds.has(playerId)) {
      errors.push(`Turn order contains invalid player ID: ${playerId}`);
    }
  }

  // 12. Current player must be in turn order (if set)
  if (newState.turns.currentPlayerId !== null) {
    if (!newState.turns.turnOrder.includes(newState.turns.currentPlayerId)) {
      errors.push(`Current player ${newState.turns.currentPlayerId} not in turn order`);
    }
  }

  // 13. History must be append-only
  if (newState.history.length < oldState.history.length) {
    errors.push('History cannot shrink');
  }

  // 14. Old history entries must not change
  for (let i = 0; i < oldState.history.length; i++) {
    const oldEntry = oldState.history[i];
    const newEntry = newState.history[i];
    if (oldEntry.id !== newEntry.id) {
      errors.push(`History entry ${i} was modified`);
    }
  }

  // 15. Rule numbers must be unique
  const ruleNumbers = new Set(newState.rules.map(r => r.number));
  if (ruleNumbers.size !== newState.rules.length) {
    errors.push('Duplicate rule numbers found');
  }

  // 16. Rule IDs must be unique
  const ruleIds = new Set(newState.rules.map(r => r.id));
  if (ruleIds.size !== newState.rules.length) {
    errors.push('Duplicate rule IDs found');
  }

  // 17. Immutable rules cannot be modified
  for (const oldRule of oldState.rules) {
    if (!oldRule.isMutable) {
      const newRule = newState.rules.find(r => r.id === oldRule.id);
      if (newRule && !rulesEqual(oldRule, newRule)) {
        errors.push(`Immutable rule ${oldRule.id} (${oldRule.name}) was modified`);
      }
    }
  }

  // 18. Active proposals must have valid structure
  for (const proposal of newState.voting.activeProposals) {
    if (proposal.status !== 'pending') {
      errors.push(`Active proposal ${proposal.id} has non-pending status: ${proposal.status}`);
    }
    if (proposal.resolvedAt !== null) {
      errors.push(`Active proposal ${proposal.id} has resolvedAt set but is still active`);
    }
  }

  // 19. Proposal history must have resolved status
  for (const proposal of newState.voting.proposalHistory) {
    if (proposal.status === 'pending') {
      errors.push(`Historical proposal ${proposal.id} has pending status`);
    }
    if (proposal.resolvedAt === null && proposal.status !== 'withdrawn') {
      errors.push(`Historical proposal ${proposal.id} missing resolvedAt timestamp`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// Full State Validation
// ============================================================================

/**
 * Validate the structure and integrity of a game state
 * More thorough than transition validation - checks all invariants
 */
export function validateState(state: GameState): ValidationResult {
  const errors: string[] = [];

  // Type validation
  if (!state.version || typeof state.version !== 'string') {
    errors.push('Invalid or missing version');
  }

  if (!state.gameId || typeof state.gameId !== 'string') {
    errors.push('Invalid or missing gameId');
  }

  if (typeof state.createdAt !== 'number' || !Number.isFinite(state.createdAt)) {
    errors.push('Invalid createdAt timestamp');
  }

  if (typeof state.updatedAt !== 'number' || !Number.isFinite(state.updatedAt)) {
    errors.push('Invalid updatedAt timestamp');
  }

  if (!['setup', 'active', 'paused', 'completed'].includes(state.status)) {
    errors.push(`Invalid status: ${state.status}`);
  }

  // Players validation
  if (!Array.isArray(state.players)) {
    errors.push('Players must be an array');
  } else {
    for (const player of state.players) {
      if (!player.id || typeof player.id !== 'string') {
        errors.push('Player missing or invalid ID');
      }
      if (!player.name || typeof player.name !== 'string') {
        errors.push(`Player ${player.id} missing or invalid name`);
      }
      if (typeof player.joinedAt !== 'number') {
        errors.push(`Player ${player.id} missing or invalid joinedAt`);
      }
      if (typeof player.isActive !== 'boolean') {
        errors.push(`Player ${player.id} missing or invalid isActive`);
      }
    }
  }

  // Points validation
  if (!(state.points instanceof Map)) {
    errors.push('Points must be a Map');
  }

  // Rules validation
  if (!Array.isArray(state.rules)) {
    errors.push('Rules must be an array');
  } else {
    for (const rule of state.rules) {
      if (!rule.id || typeof rule.id !== 'string') {
        errors.push('Rule missing or invalid ID');
      }
      if (typeof rule.number !== 'number') {
        errors.push(`Rule ${rule.id} missing or invalid number`);
      }
      if (!rule.name || typeof rule.name !== 'string') {
        errors.push(`Rule ${rule.id} missing or invalid name`);
      }
      if (typeof rule.code !== 'string') {
        errors.push(`Rule ${rule.id} missing or invalid code`);
      }
      if (typeof rule.isActive !== 'boolean') {
        errors.push(`Rule ${rule.id} missing or invalid isActive`);
      }
      if (typeof rule.isMutable !== 'boolean') {
        errors.push(`Rule ${rule.id} missing or invalid isMutable`);
      }
    }
  }

  // Turns validation
  if (!state.turns || typeof state.turns !== 'object') {
    errors.push('Turns state missing or invalid');
  } else {
    if (typeof state.turns.currentTurn !== 'number') {
      errors.push('Invalid currentTurn');
    }
    if (!Array.isArray(state.turns.turnOrder)) {
      errors.push('turnOrder must be an array');
    }
    if (!Array.isArray(state.turns.turnHistory)) {
      errors.push('turnHistory must be an array');
    }
  }

  // Voting validation
  if (!state.voting || typeof state.voting !== 'object') {
    errors.push('Voting state missing or invalid');
  } else {
    if (!Array.isArray(state.voting.activeProposals)) {
      errors.push('activeProposals must be an array');
    }
    if (!Array.isArray(state.voting.proposalHistory)) {
      errors.push('proposalHistory must be an array');
    }
  }

  // History validation
  if (!Array.isArray(state.history)) {
    errors.push('History must be an array');
  }

  // Extensions validation
  if (!(state.extensions instanceof Map)) {
    errors.push('Extensions must be a Map');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if two rules are equal (for immutability checking)
 */
function rulesEqual(a: Rule, b: Rule): boolean {
  return (
    a.id === b.id &&
    a.number === b.number &&
    a.name === b.name &&
    a.description === b.description &&
    a.code === b.code &&
    a.isActive === b.isActive &&
    a.isMutable === b.isMutable &&
    a.proposedBy === b.proposedBy &&
    a.createdAt === b.createdAt
  );
}

/**
 * Assert that a state is valid, throw if not
 */
export function assertValidState(state: GameState): void {
  const result = validateState(state);
  if (!result.valid) {
    throw new Error(`Invalid state: ${result.errors.join(', ')}`);
  }
}

/**
 * Assert that a transition is valid, throw if not
 */
export function assertValidTransition(
  oldState: GameState,
  newState: GameState,
  rule?: Rule
): void {
  const result = validateTransition(oldState, newState, rule);
  if (!result.valid) {
    throw new Error(`Invalid transition: ${result.errors.join(', ')}`);
  }
}
