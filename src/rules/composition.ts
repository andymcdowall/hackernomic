/**
 * Rule composition utilities
 *
 * Provides functions for composing rules - combining multiple rules,
 * conditional rules, and other functional patterns.
 */

import type { GameState, RuleContext, RuleFunction } from '../core/types.js';

// ============================================================================
// Rule Composition Functions
// ============================================================================

/**
 * Compose multiple rule functions into a single rule
 * Rules are executed in sequence, each receiving the output of the previous
 */
export function composeRules(...rules: RuleFunction[]): RuleFunction {
  return (state: GameState, context: RuleContext): GameState => {
    return rules.reduce((currentState, rule) => {
      return rule(currentState, context);
    }, state);
  };
}

/**
 * Create a conditional rule that only executes if a predicate is true
 */
export function conditionalRule(
  predicate: (state: GameState, context: RuleContext) => boolean,
  rule: RuleFunction
): RuleFunction {
  return (state: GameState, context: RuleContext): GameState => {
    if (predicate(state, context)) {
      return rule(state, context);
    }
    return state;
  };
}

/**
 * Create a rule that only applies to a specific player
 */
export function playerRule(playerId: string, rule: RuleFunction): RuleFunction {
  return conditionalRule(
    (state, context) =>
      context.triggeredBy === playerId ||
      state.turns.currentPlayerId === playerId,
    rule
  );
}

/**
 * Create a rule that only applies during a specific game status
 */
export function statusRule(
  status: 'setup' | 'active' | 'paused' | 'completed',
  rule: RuleFunction
): RuleFunction {
  return conditionalRule((state) => state.status === status, rule);
}

/**
 * Create a rule that only executes on specific turns
 * @param predicate - Function that returns true if rule should execute on this turn
 */
export function turnRule(
  predicate: (turnNumber: number) => boolean,
  rule: RuleFunction
): RuleFunction {
  return conditionalRule((state) => predicate(state.turns.currentTurn), rule);
}

/**
 * Create a rule that only executes once
 * Uses extensions to track if it's been executed
 */
export function onceRule(ruleId: string, rule: RuleFunction): RuleFunction {
  const executedKey = `rule_${ruleId}_executed`;

  return (state: GameState, context: RuleContext): GameState => {
    // Check if already executed
    if (state.extensions.get(executedKey)) {
      return state;
    }

    // Execute the rule
    const newState = rule(state, context);

    // Mark as executed
    const extensions = new Map(newState.extensions);
    extensions.set(executedKey, true);

    return {
      ...newState,
      extensions,
    };
  };
}

/**
 * Create a rule that executes at most N times
 */
export function limitedRule(
  ruleId: string,
  maxExecutions: number,
  rule: RuleFunction
): RuleFunction {
  const countKey = `rule_${ruleId}_count`;

  return (state: GameState, context: RuleContext): GameState => {
    // Get current count
    const count = (state.extensions.get(countKey) as number) || 0;

    // Check if limit reached
    if (count >= maxExecutions) {
      return state;
    }

    // Execute the rule
    const newState = rule(state, context);

    // Increment count
    const extensions = new Map(newState.extensions);
    extensions.set(countKey, count + 1);

    return {
      ...newState,
      extensions,
    };
  };
}

/**
 * Combine rules with OR logic - try first rule, if it returns unchanged state, try second
 */
export function orRules(rule1: RuleFunction, rule2: RuleFunction): RuleFunction {
  return (state: GameState, context: RuleContext): GameState => {
    const result1 = rule1(state, context);

    // If first rule changed the state, use it
    if (result1 !== state) {
      return result1;
    }

    // Otherwise try second rule
    return rule2(state, context);
  };
}

/**
 * Try to execute a rule, but if it fails/errors, return original state
 */
export function tryRule(rule: RuleFunction): RuleFunction {
  return (state: GameState, context: RuleContext): GameState => {
    try {
      return rule(state, context);
    } catch {
      return state;
    }
  };
}

/**
 * Create a rule that logs its execution
 */
export function loggedRule(label: string, rule: RuleFunction): RuleFunction {
  return (state: GameState, context: RuleContext): GameState => {
    console.log(`[Rule ${label}] Executing`, {
      turn: state.turns.currentTurn,
      triggeredBy: context.triggeredBy,
    });

    const result = rule(state, context);

    console.log(`[Rule ${label}] Completed`);

    return result;
  };
}

/**
 * Create a rule that executes with a delay/cooldown
 * @param ruleId - Unique identifier for the rule
 * @param cooldownMs - Minimum milliseconds between executions
 */
export function cooldownRule(
  ruleId: string,
  cooldownMs: number,
  rule: RuleFunction
): RuleFunction {
  const lastExecutedKey = `rule_${ruleId}_lastExecuted`;

  return (state: GameState, context: RuleContext): GameState => {
    const lastExecuted = state.extensions.get(lastExecutedKey) as number | undefined;

    // Check if still in cooldown
    if (lastExecuted && context.timestamp - lastExecuted < cooldownMs) {
      return state;
    }

    // Execute the rule
    const newState = rule(state, context);

    // Update last executed time
    const extensions = new Map(newState.extensions);
    extensions.set(lastExecutedKey, context.timestamp);

    return {
      ...newState,
      extensions,
    };
  };
}

/**
 * Chain rules with error handling - continue executing even if one fails
 */
export function chainRules(...rules: RuleFunction[]): RuleFunction {
  return (state: GameState, context: RuleContext): GameState => {
    let currentState = state;

    for (const rule of rules) {
      try {
        currentState = rule(currentState, context);
      } catch (error) {
        console.error('Rule in chain failed:', error);
        // Continue with next rule
      }
    }

    return currentState;
  };
}

/**
 * Map a rule over all players
 */
export function forEachPlayer(
  rule: (state: GameState, playerId: string, context: RuleContext) => GameState
): RuleFunction {
  return (state: GameState, context: RuleContext): GameState => {
    let currentState = state;

    for (const player of state.players) {
      currentState = rule(currentState, player.id, context);
    }

    return currentState;
  };
}

/**
 * Execute a rule only if player meets a condition
 */
export function whenPlayerCondition(
  condition: (state: GameState, playerId: string) => boolean,
  rule: RuleFunction
): RuleFunction {
  return conditionalRule(
    (state, context) => {
      const playerId = context.triggeredBy;
      return condition(state, playerId);
    },
    rule
  );
}

// ============================================================================
// Common Rule Patterns
// ============================================================================

/**
 * Create a rule that executes only every N turns
 */
export function everyNTurns(n: number, rule: RuleFunction): RuleFunction {
  return turnRule((turn) => turn % n === 0, rule);
}

/**
 * Create a rule that only executes for the current player
 */
export function currentPlayerRule(rule: RuleFunction): RuleFunction {
  return conditionalRule(
    (state, context) => state.turns.currentPlayerId === context.triggeredBy,
    rule
  );
}

/**
 * Create a rule that only executes when a player has a minimum number of points
 */
export function minPointsRule(minPoints: number, rule: RuleFunction): RuleFunction {
  return whenPlayerCondition(
    (state, playerId) => (state.points.get(playerId) || 0) >= minPoints,
    rule
  );
}
