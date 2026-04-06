/**
 * Unit tests for rule composition utilities
 * Tests composeRules, conditionalRule, playerRule, statusRule, turnRule,
 * onceRule, limitedRule, orRules, tryRule, loggedRule, cooldownRule,
 * chainRules, forEachPlayer, whenPlayerCondition, everyNTurns,
 * currentPlayerRule, and minPointsRule.
 */

import { describe, it, expect, vi } from 'vitest';
import {
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
} from './composition.js';
import { createInitialState, addPlayer, updateState, awardPoints } from '../core/state.js';
import type { GameState, RuleContext, RuleFunction } from '../core/types.js';

// ============================================================================
// Helpers
// ============================================================================

function makeContext(overrides: Partial<RuleContext> = {}): RuleContext {
  return {
    triggeredBy: 'player-1',
    timestamp: 1000,
    ...overrides,
  };
}

function makeTwoPlayerState(): GameState {
  let state = createInitialState('test-game');
  state = addPlayer(state, { id: 'player-1', name: 'Alice', joinedAt: 1000, isActive: true });
  state = addPlayer(state, { id: 'player-2', name: 'Bob', joinedAt: 1001, isActive: true });
  return state;
}

/** Mark a state with a sentinal extension value to verify the rule ran. */
const EXECUTED_KEY = '__test_executed__';
const markerRule: RuleFunction = (state) =>
  updateState(state, draft => {
    (draft.extensions as Map<string, any>).set(EXECUTED_KEY, true);
  });
const noopRule: RuleFunction = (state) => state;
const errorRule: RuleFunction = () => { throw new Error('rule error'); };

// ============================================================================
// composeRules
// ============================================================================

describe('composeRules', () => {
  it('applies rules in sequence, each receiving the previous state', () => {
    let callOrder: number[] = [];
    const r1: RuleFunction = (state) => { callOrder.push(1); return state; };
    const r2: RuleFunction = (state) => { callOrder.push(2); return state; };
    const composed = composeRules(r1, r2);
    composed(makeTwoPlayerState(), makeContext());
    expect(callOrder).toEqual([1, 2]);
  });

  it('composed rule returns the final state after all transformations', () => {
    const add1 = (state: GameState) => updateState(state, d => { (d.extensions as Map<string,any>).set('n', ((state.extensions.get('n') as number) ?? 0) + 1); });
    const composed = composeRules(add1, add1);
    const result = composed(makeTwoPlayerState(), makeContext());
    expect(result.extensions.get('n')).toBe(2);
  });

  it('composes zero rules and returns the original state', () => {
    const composed = composeRules();
    const state = makeTwoPlayerState();
    expect(composed(state, makeContext())).toBe(state);
  });
});

// ============================================================================
// conditionalRule
// ============================================================================

describe('conditionalRule', () => {
  it('executes the rule when predicate returns true', () => {
    const rule = conditionalRule(() => true, markerRule);
    const result = rule(makeTwoPlayerState(), makeContext());
    expect(result.extensions.get(EXECUTED_KEY)).toBe(true);
  });

  it('does not execute the rule when predicate returns false', () => {
    const rule = conditionalRule(() => false, markerRule);
    const state = makeTwoPlayerState();
    const result = rule(state, makeContext());
    expect(result).toBe(state);
  });

  it('passes state and context to the predicate', () => {
    let capturedTriggeredBy = '';
    const rule = conditionalRule((_state, ctx) => { capturedTriggeredBy = ctx.triggeredBy; return false; }, noopRule);
    rule(makeTwoPlayerState(), makeContext({ triggeredBy: 'p-x' }));
    expect(capturedTriggeredBy).toBe('p-x');
  });
});

// ============================================================================
// playerRule
// ============================================================================

describe('playerRule', () => {
  it('executes when triggeredBy matches the player ID', () => {
    const rule = playerRule('player-1', markerRule);
    const result = rule(makeTwoPlayerState(), makeContext({ triggeredBy: 'player-1' }));
    expect(result.extensions.get(EXECUTED_KEY)).toBe(true);
  });

  it('executes when state.turns.currentPlayerId matches the player ID', () => {
    let state = makeTwoPlayerState();
    state = updateState(state, d => { (d.turns as any).currentPlayerId = 'player-1'; });
    const rule = playerRule('player-1', markerRule);
    const result = rule(state, makeContext({ triggeredBy: 'other' }));
    expect(result.extensions.get(EXECUTED_KEY)).toBe(true);
  });

  it('skips when neither triggeredBy nor currentPlayerId matches', () => {
    const state = makeTwoPlayerState();
    const rule = playerRule('player-99', markerRule);
    const result = rule(state, makeContext({ triggeredBy: 'player-1' }));
    expect(result).toBe(state);
  });
});

// ============================================================================
// statusRule
// ============================================================================

describe('statusRule', () => {
  it('executes when game status matches', () => {
    const state = makeTwoPlayerState(); // status is 'setup'
    const rule = statusRule('setup', markerRule);
    const result = rule(state, makeContext());
    expect(result.extensions.get(EXECUTED_KEY)).toBe(true);
  });

  it('skips when game status does not match', () => {
    const state = makeTwoPlayerState(); // status is 'setup'
    const rule = statusRule('active', markerRule);
    const result = rule(state, makeContext());
    expect(result).toBe(state);
  });
});

// ============================================================================
// turnRule
// ============================================================================

describe('turnRule', () => {
  it('executes when the turn predicate returns true', () => {
    let state = makeTwoPlayerState();
    state = updateState(state, d => { (d.turns as any).currentTurn = 5; });
    const rule = turnRule(t => t === 5, markerRule);
    const result = rule(state, makeContext());
    expect(result.extensions.get(EXECUTED_KEY)).toBe(true);
  });

  it('skips when the turn predicate returns false', () => {
    let state = makeTwoPlayerState();
    state = updateState(state, d => { (d.turns as any).currentTurn = 3; });
    const rule = turnRule(t => t === 5, markerRule);
    const result = rule(state, makeContext());
    expect(result).toBe(state);
  });
});

// ============================================================================
// onceRule
// ============================================================================

describe('onceRule', () => {
  it('executes on the first call', () => {
    const state = makeTwoPlayerState();
    const rule = onceRule('my-rule', markerRule);
    const result = rule(state, makeContext());
    expect(result.extensions.get(EXECUTED_KEY)).toBe(true);
  });

  it('skips on subsequent calls (idempotent)', () => {
    const state = makeTwoPlayerState();
    const rule = onceRule('my-rule', markerRule);
    const after1 = rule(state, makeContext());
    const after2 = rule(after1, makeContext());
    // Second call should not re-execute the marker
    expect(after2.extensions.get(EXECUTED_KEY)).toBe(true); // still set from first run
    // But the rule itself should short-circuit — verify by checking a counter
    let count = 0;
    const counter: RuleFunction = (s) => { count++; return s; };
    const once = onceRule('counter-rule', counter);
    const s1 = once(state, makeContext());
    once(s1, makeContext());
    expect(count).toBe(1);
  });
});

// ============================================================================
// limitedRule
// ============================================================================

describe('limitedRule', () => {
  it('executes up to the maximum number of times', () => {
    let state = makeTwoPlayerState();
    let count = 0;
    const counter: RuleFunction = (s) => { count++; return s; };
    const limited = limitedRule('lim', 3, counter);
    for (let i = 0; i < 5; i++) {
      state = limited(state, makeContext());
    }
    expect(count).toBe(3);
  });

  it('returns the original state once limit is reached', () => {
    let state = makeTwoPlayerState();
    const rule = limitedRule('lim2', 1, markerRule);
    state = rule(state, makeContext());
    const after2 = rule(state, makeContext()); // should no-op
    expect(after2).toBe(state);
  });
});

// ============================================================================
// orRules
// ============================================================================

describe('orRules', () => {
  it('uses the result of the first rule when it changes state', () => {
    const state = makeTwoPlayerState();
    const r1 = markerRule; // changes state
    let r2Called = false;
    const r2: RuleFunction = (s) => { r2Called = true; return s; };
    const rule = orRules(r1, r2);
    rule(state, makeContext());
    expect(r2Called).toBe(false);
  });

  it('falls back to the second rule when the first returns unchanged state', () => {
    const state = makeTwoPlayerState();
    const rule = orRules(noopRule, markerRule);
    const result = rule(state, makeContext());
    expect(result.extensions.get(EXECUTED_KEY)).toBe(true);
  });
});

// ============================================================================
// tryRule
// ============================================================================

describe('tryRule', () => {
  it('returns the rule result when execution succeeds', () => {
    const state = makeTwoPlayerState();
    const safe = tryRule(markerRule);
    const result = safe(state, makeContext());
    expect(result.extensions.get(EXECUTED_KEY)).toBe(true);
  });

  it('returns the original state when the rule throws', () => {
    const state = makeTwoPlayerState();
    const safe = tryRule(errorRule);
    const result = safe(state, makeContext());
    expect(result).toBe(state);
  });
});

// ============================================================================
// loggedRule
// ============================================================================

describe('loggedRule', () => {
  it('still returns the inner rule result', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const state = makeTwoPlayerState();
    const rule = loggedRule('test', markerRule);
    const result = rule(state, makeContext());
    expect(result.extensions.get(EXECUTED_KEY)).toBe(true);
    consoleSpy.mockRestore();
  });

  it('logs to console', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const state = makeTwoPlayerState();
    loggedRule('my-label', noopRule)(state, makeContext());
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

// ============================================================================
// cooldownRule
// ============================================================================

describe('cooldownRule', () => {
  it('executes on the first call', () => {
    let count = 0;
    const counter: RuleFunction = (s) => { count++; return s; };
    const state = makeTwoPlayerState();
    const rule = cooldownRule('cd', 10000, counter);
    rule(state, makeContext({ timestamp: 1000 }));
    expect(count).toBe(1);
  });

  it('skips when called within the cooldown window', () => {
    let count = 0;
    const counter: RuleFunction = (s) => { count++; return s; };
    let state = makeTwoPlayerState();
    const rule = cooldownRule('cd2', 10000, counter);
    state = rule(state, makeContext({ timestamp: 1000 }));
    rule(state, makeContext({ timestamp: 2000 })); // within 10s cooldown
    expect(count).toBe(1);
  });

  it('executes again after the cooldown expires', () => {
    let count = 0;
    const counter: RuleFunction = (s) => { count++; return s; };
    let state = makeTwoPlayerState();
    const rule = cooldownRule('cd3', 5000, counter);
    state = rule(state, makeContext({ timestamp: 0 }));
    rule(state, makeContext({ timestamp: 6000 })); // past the 5s cooldown
    expect(count).toBe(2);
  });
});

// ============================================================================
// chainRules
// ============================================================================

describe('chainRules', () => {
  it('applies all rules in sequence even if one throws', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let secondRan = false;
    const r2: RuleFunction = (s) => { secondRan = true; return s; };
    const state = makeTwoPlayerState();
    const rule = chainRules(errorRule, r2);
    rule(state, makeContext());
    expect(secondRan).toBe(true);
    consoleSpy.mockRestore();
  });

  it('returns the accumulated state from non-throwing rules', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const state = makeTwoPlayerState();
    const rule = chainRules(errorRule, markerRule);
    const result = rule(state, makeContext());
    expect(result.extensions.get(EXECUTED_KEY)).toBe(true);
    consoleSpy.mockRestore();
  });
});

// ============================================================================
// forEachPlayer
// ============================================================================

describe('forEachPlayer', () => {
  it('calls the inner callback for every player', () => {
    const seen: string[] = [];
    const rule = forEachPlayer((state, playerId) => {
      seen.push(playerId);
      return state;
    });
    rule(makeTwoPlayerState(), makeContext());
    expect(seen).toContain('player-1');
    expect(seen).toContain('player-2');
    expect(seen).toHaveLength(2);
  });

  it('accumulates state changes across all players', () => {
    const rule = forEachPlayer((state, playerId) =>
      updateState(state, d => {
        (d.extensions as Map<string,any>).set(`seen-${playerId}`, true);
      })
    );
    const result = rule(makeTwoPlayerState(), makeContext());
    expect(result.extensions.get('seen-player-1')).toBe(true);
    expect(result.extensions.get('seen-player-2')).toBe(true);
  });
});

// ============================================================================
// whenPlayerCondition
// ============================================================================

describe('whenPlayerCondition', () => {
  it('executes when the player condition is met', () => {
    const state = makeTwoPlayerState();
    const rule = whenPlayerCondition(() => true, markerRule);
    const result = rule(state, makeContext({ triggeredBy: 'player-1' }));
    expect(result.extensions.get(EXECUTED_KEY)).toBe(true);
  });

  it('skips when the player condition is not met', () => {
    const state = makeTwoPlayerState();
    const rule = whenPlayerCondition(() => false, markerRule);
    const result = rule(state, makeContext({ triggeredBy: 'player-1' }));
    expect(result).toBe(state);
  });
});

// ============================================================================
// everyNTurns
// ============================================================================

describe('everyNTurns', () => {
  it('executes on multiples of N', () => {
    let state = makeTwoPlayerState();
    state = updateState(state, d => { (d.turns as any).currentTurn = 4; });
    const rule = everyNTurns(2, markerRule);
    const result = rule(state, makeContext());
    expect(result.extensions.get(EXECUTED_KEY)).toBe(true);
  });

  it('skips on non-multiples of N', () => {
    let state = makeTwoPlayerState();
    state = updateState(state, d => { (d.turns as any).currentTurn = 3; });
    const rule = everyNTurns(2, markerRule);
    const result = rule(state, makeContext());
    expect(result).toBe(state);
  });
});

// ============================================================================
// currentPlayerRule
// ============================================================================

describe('currentPlayerRule', () => {
  it('executes when triggeredBy is the current player', () => {
    let state = makeTwoPlayerState();
    state = updateState(state, d => { (d.turns as any).currentPlayerId = 'player-1'; });
    const rule = currentPlayerRule(markerRule);
    const result = rule(state, makeContext({ triggeredBy: 'player-1' }));
    expect(result.extensions.get(EXECUTED_KEY)).toBe(true);
  });

  it('skips when triggeredBy is not the current player', () => {
    let state = makeTwoPlayerState();
    state = updateState(state, d => { (d.turns as any).currentPlayerId = 'player-2'; });
    const rule = currentPlayerRule(markerRule);
    const result = rule(state, makeContext({ triggeredBy: 'player-1' }));
    expect(result).toBe(state);
  });
});

// ============================================================================
// minPointsRule
// ============================================================================

describe('minPointsRule', () => {
  it('executes when the triggering player meets the points threshold', () => {
    let state = makeTwoPlayerState();
    state = awardPoints(state, 'player-1', 10);
    const rule = minPointsRule(10, markerRule);
    const result = rule(state, makeContext({ triggeredBy: 'player-1' }));
    expect(result.extensions.get(EXECUTED_KEY)).toBe(true);
  });

  it('skips when the triggering player is below the points threshold', () => {
    const state = makeTwoPlayerState();
    // player-1 has 0 points
    const rule = minPointsRule(10, markerRule);
    const result = rule(state, makeContext({ triggeredBy: 'player-1' }));
    expect(result).toBe(state);
  });
});
