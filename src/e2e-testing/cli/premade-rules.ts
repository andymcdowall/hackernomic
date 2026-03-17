/**
 * Premade rules for use in E2E test fixtures and scenarios.
 *
 * Rule objects: used in the fixture factory to build pre-built game states.
 * Rule specs: used in YAML scenarios' propose actions (name/description/code/trigger).
 */

import { generateId } from '../../core/state.js';
import type { Rule } from '../../core/types.js';
import type { RuleSpec } from './types.js';

// ============================================================================
// Rule Objects (for fixture factory - go directly into game state)
// ============================================================================

/**
 * Awards 5 points to the player who ended their turn (context.triggeredBy).
 * Uses the turn-end event actor, not getCurrentPlayer, because by the time
 * this rule executes the currentPlayerId has already advanced to the next player.
 * Rule number 202.
 */
export function makeAwardTurnPointsRule(): Rule {
  return {
    id: generateId(),
    number: 202,
    name: 'Award Turn Points',
    description: 'Awards 5 points to the player who just ended their turn',
    code: `(state, context) => {
  if (context.triggeredBy && context.triggeredBy !== 'system') {
    return StateHelpers.awardPoints(state, context.triggeredBy, 5);
  }
  return state;
}`,
    isActive: true,
    isMutable: true,
    proposedBy: 'system',
    createdAt: Date.now(),
    triggers: [{ type: 'event', eventType: 'turn-end' }],
  };
}

/** Sets game status to 'completed' when any player reaches 30 points. Rule number 203. */
export function makeWinAt30Rule(): Rule {
  return {
    id: generateId(),
    number: 203,
    name: 'Win at 30 Points',
    description: 'The first player to reach 30 points wins the game',
    code: `(state) => {
  for (const [playerId, points] of state.points.entries()) {
    if (points >= 30) {
      return { ...state, status: 'completed' };
    }
  }
  return state;
}`,
    isActive: true,
    isMutable: true,
    proposedBy: 'system',
    createdAt: Date.now(),
    triggers: [{ type: 'event', eventType: 'turn-end' }],
  };
}

/** Template for a basic turn-points rule to propose via CLI. */
export function makeProposableAwardTurnPointsRule(proposedBy: string): Rule {
  return {
    id: generateId(),
    number: 201,
    name: 'Award Turn Points',
    description: 'Awards 5 points to current player on turn end',
    code: `(state, context) => { const p = StateHelpers.getCurrentPlayer(state); if (p) return StateHelpers.awardPoints(state, p.id, 5); return state; }`,
    isActive: false,
    isMutable: true,
    proposedBy,
    createdAt: Date.now(),
    triggers: [{ type: 'event', eventType: 'turn-end' }],
  };
}

// ============================================================================
// Rule Specs (for YAML scenarios - describe what to type into the CLI)
// ============================================================================

export const premadeRuleSpecs: Record<string, RuleSpec> = {
  award_turn_points: {
    name: 'Award Turn Points',
    description: 'Awards 5 points to current player on turn end',
    code: `(state, context) => { const p = StateHelpers.getCurrentPlayer(state); if (p) return StateHelpers.awardPoints(state, p.id, 5); return state; }`,
    trigger: 'turn-end',
  },

  award_proposal_bonus: {
    name: 'Proposal Bonus',
    description: 'Awards 20 points to the proposer when a rule is adopted',
    code: `(state, context) => { if (context.triggeredBy) return StateHelpers.awardPoints(state, context.triggeredBy, 20); return state; }`,
    trigger: 'proposal-passed',
  },

  informational_rule: {
    name: 'House Rule',
    description: 'An informational rule with no automatic effect',
    code: `(state) => state`,
    trigger: 'never',
  },
};
