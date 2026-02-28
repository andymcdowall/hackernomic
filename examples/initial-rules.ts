/**
 * Example Rules for Nomic Engine
 *
 * These examples demonstrate how to write rules for the Nomic Engine.
 * Rules are pure TypeScript functions that transform game state.
 */

import type { GameState, RuleContext, Rule } from '../src/index.js';
import { generateId, StateHelpers } from '../src/index.js';

// ============================================================================
// Basic Rules
// ============================================================================

/**
 * Rule 101: Win by Points
 * First player to reach 100 points wins the game
 */
export const winByPoints: Rule = {
  id: generateId(),
  number: 101,
  name: 'Win by Points',
  description: 'The first player to reach 100 points wins the game.',
  code: `(state) => {
  for (const [playerId, points] of state.points.entries()) {
    if (points >= 100) {
      return { ...state, status: 'completed' };
    }
  }
  return state;
}`,
  isActive: true,
  isMutable: true,
  proposedBy: 'system',
  createdAt: Date.now(),
};

/**
 * Rule 302: Points for Adopted Rules
 * When a rule is adopted, the proposer gains 10 points
 */
export const pointsForAdoptedRules: Rule = {
  id: generateId(),
  number: 302,
  name: 'Points for Adopted Rules',
  description: 'When a rule is adopted, its proposer gains 10 points.',
  code: `(state, context) => {
  // This is triggered by the voting system
  // when a proposal passes
  return StateHelpers.awardPoints(state, context.triggeredBy, 10);
}`,
  isActive: true,
  isMutable: true,
  proposedBy: 'system',
  createdAt: Date.now(),
};

// ============================================================================
// Using Extensions
// ============================================================================

/**
 * Example: Reputation System
 * Adds a reputation score that increases when players propose successful rules
 */
export const reputationSystem: Rule = {
  id: generateId(),
  number: 401,
  name: 'Reputation System',
  description: 'Players gain reputation when their proposals pass',
  code: `(state, context) => {
  const reputations = StateHelpers.getExtension(state, 'reputations', new Map());
  const currentRep = reputations.get(context.triggeredBy) || 0;

  const newReputations = new Map(reputations);
  newReputations.set(context.triggeredBy, currentRep + 1);

  return StateHelpers.setExtension(state, 'reputations', newReputations);
}`,
  isActive: false,
  isMutable: true,
  proposedBy: 'example',
  createdAt: Date.now(),
};

/**
 * Example: Win by Reputation
 * Alternative win condition using the reputation extension
 */
export const winByReputation: Rule = {
  id: generateId(),
  number: 402,
  name: 'Win by Reputation',
  description: 'First player to 50 reputation wins',
  code: `(state) => {
  const reputations = StateHelpers.getExtension(state, 'reputations', new Map());

  for (const [playerId, rep] of reputations.entries()) {
    if (rep >= 50) {
      return { ...state, status: 'completed' };
    }
  }

  return state;
}`,
  isActive: false,
  isMutable: true,
  proposedBy: 'example',
  createdAt: Date.now(),
};

// ============================================================================
// Advanced Rules
// ============================================================================

/**
 * Example: Bonus Points for Leadership
 * Player in first place gets 5 bonus points each turn
 */
export const leaderBonus: Rule = {
  id: generateId(),
  number: 501,
  name: 'Leader Bonus',
  description: 'The player in first place gets 5 bonus points each turn',
  code: `(state, context) => {
  const leaderboard = StateHelpers.getLeaderboard(state);

  if (leaderboard.length === 0) {
    return state;
  }

  const leader = leaderboard[0];
  return StateHelpers.awardPoints(state, leader.player.id, 5);
}`,
  isActive: false,
  isMutable: true,
  proposedBy: 'example',
  createdAt: Date.now(),
};

/**
 * Example: Turn Time Limit
 * Tracks how long turns take (using extensions)
 */
export const turnTimeLimit: Rule = {
  id: generateId(),
  number: 502,
  name: 'Turn Time Limit',
  description: 'Track turn duration in extensions',
  code: `(state, context) => {
  const turnDurations = StateHelpers.getExtension(state, 'turnDurations', new Map());

  if (state.turns.turnStartedAt) {
    const duration = context.timestamp - state.turns.turnStartedAt;
    turnDurations.set(state.turns.currentTurn, duration);
  }

  return StateHelpers.setExtension(state, 'turnDurations', turnDurations);
}`,
  isActive: false,
  isMutable: true,
  proposedBy: 'example',
  createdAt: Date.now(),
};

/**
 * Example: Streak Bonus
 * Players get bonus points for consecutive successful proposals
 */
export const streakBonus: Rule = {
  id: generateId(),
  number: 503,
  name: 'Streak Bonus',
  description: 'Players get bonus points for consecutive successful proposals',
  code: `(state, context) => {
  const streaks = StateHelpers.getExtension(state, 'streaks', new Map());
  const playerId = context.triggeredBy;
  const currentStreak = streaks.get(playerId) || 0;
  const newStreak = currentStreak + 1;

  // Bonus points based on streak
  const bonus = newStreak * 2;

  const newStreaks = new Map(streaks);
  newStreaks.set(playerId, newStreak);

  let newState = StateHelpers.setExtension(state, 'streaks', newStreaks);
  newState = StateHelpers.awardPoints(newState, playerId, bonus);

  return newState;
}`,
  isActive: false,
  isMutable: true,
  proposedBy: 'example',
  createdAt: Date.now(),
};

/**
 * Example: Point Decay
 * All players lose 1 point each turn (prevents runaway scores)
 */
export const pointDecay: Rule = {
  id: generateId(),
  number: 504,
  name: 'Point Decay',
  description: 'All players lose 1 point each turn',
  code: `(state) => {
  let newState = state;

  for (const player of state.players) {
    const currentPoints = state.points.get(player.id) || 0;
    if (currentPoints > 0) {
      newState = {
        ...newState,
        points: new Map(newState.points).set(player.id, Math.max(0, currentPoints - 1))
      };
    }
  }

  return newState;
}`,
  isActive: false,
  isMutable: true,
  proposedBy: 'example',
  createdAt: Date.now(),
};

// ============================================================================
// Export All Examples
// ============================================================================

export const exampleRules: Rule[] = [
  winByPoints,
  pointsForAdoptedRules,
  reputationSystem,
  winByReputation,
  leaderBonus,
  turnTimeLimit,
  streakBonus,
  pointDecay,
];

// ============================================================================
// Rule Templates (as strings for copy-paste)
// ============================================================================

export const ruleTemplates = {
  simple: `(state) => {
  // Simple rule that reads state and returns it
  return state;
}`,

  awardPoints: `(state, context) => {
  // Award points to the triggering player
  return StateHelpers.awardPoints(state, context.triggeredBy, 10);
}`,

  winCondition: `(state) => {
  // Check if any player meets the win condition
  for (const [playerId, points] of state.points.entries()) {
    if (points >= 100) {
      return { ...state, status: 'completed' };
    }
  }
  return state;
}`,

  useExtension: `(state, context) => {
  // Use extensions to add custom state
  const myData = StateHelpers.getExtension(state, 'myData', {});

  // Modify the extension data
  const updated = { ...myData, count: (myData.count || 0) + 1 };

  return StateHelpers.setExtension(state, 'myData', updated);
}`,

  conditional: `(state, context) => {
  // Only execute if condition is met
  const currentPlayer = StateHelpers.getCurrentPlayer(state);

  if (currentPlayer && StateHelpers.getPoints(state, currentPlayer.id) > 50) {
    return StateHelpers.awardPoints(state, currentPlayer.id, 5);
  }

  return state;
}`,
};
