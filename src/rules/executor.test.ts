/**
 * Unit tests for RuleExecutor
 * Tests rule execution results, error handling, multi-rule execution, and validation.
 */

import { describe, it, expect } from 'vitest';
import { RuleExecutor } from './executor.js';
import { createInitialState, addPlayer, generateId } from '../core/state.js';
import type { GameState, Rule, RuleContext } from '../core/types.js';

// ============================================================================
// Helpers
// ============================================================================

function makeContext(overrides: Partial<RuleContext> = {}): RuleContext {
  return {
    triggeredBy: 'player-1',
    timestamp: Date.now(),
    ...overrides,
  };
}

function makeRule(overrides: Partial<Rule> = {}): Rule {
  return {
    id: generateId(),
    number: 999,
    name: 'Test Rule',
    description: 'A test rule',
    code: '(state) => state',
    isActive: true,
    isMutable: true,
    proposedBy: 'system',
    createdAt: Date.now(),
    triggers: [],
    ...overrides,
  };
}

function makeState(): GameState {
  let state = createInitialState('test-game');
  state = addPlayer(state, {
    id: 'player-1',
    name: 'Alice',
    joinedAt: Date.now(),
    isActive: true,
  });
  return state;
}

// ============================================================================
// executeRule — success paths
// ============================================================================

describe('RuleExecutor.executeRule — success', () => {
  const executor = new RuleExecutor();

  it('returns success:true for a valid no-op rule', () => {
    const state = makeState();
    const rule = makeRule({ code: '(state) => state' });
    const result = executor.executeRule(state, rule, makeContext());
    expect(result.success).toBe(true);
  });

  it('returns the updated state after execution', () => {
    const state = makeState();
    const rule = makeRule({ code: '(state) => state' });
    const result = executor.executeRule(state, rule, makeContext());
    expect(result.state).toBeDefined();
    expect(result.state?.gameId).toBe(state.gameId);
  });

  it('records rule-executed in the state history', () => {
    const state = makeState();
    const rule = makeRule({ code: '(state) => state' });
    const result = executor.executeRule(state, rule, makeContext());
    expect(result.success).toBe(true);
    const entry = result.state?.history.find(h => h.type === 'rule-executed');
    expect(entry).toBeDefined();
    expect(entry?.actorId).toBe('player-1');
  });
});

// ============================================================================
// executeRule — failure paths
// ============================================================================

describe('RuleExecutor.executeRule — failure', () => {
  const executor = new RuleExecutor();

  it('returns success:false for an inactive rule', () => {
    const state = makeState();
    const rule = makeRule({ isActive: false });
    const result = executor.executeRule(state, rule, makeContext());
    expect(result.success).toBe(false);
    expect(result.error).toContain('not active');
  });

  it('returns success:false when rule throws a runtime error', () => {
    const state = makeState();
    const rule = makeRule({ code: '(state) => { throw new Error("oops"); }' });
    const result = executor.executeRule(state, rule, makeContext());
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('returns success:false when rule code is not a function', () => {
    const state = makeState();
    const rule = makeRule({ code: '42' });
    const result = executor.executeRule(state, rule, makeContext());
    expect(result.success).toBe(false);
  });

  it('returns success:false when rule returns an invalid state', () => {
    const state = makeState();
    const rule = makeRule({ code: '(state) => null' });
    const result = executor.executeRule(state, rule, makeContext());
    expect(result.success).toBe(false);
  });

  it('returns the rule reference in failure result', () => {
    const state = makeState();
    const rule = makeRule({ isActive: false });
    const result = executor.executeRule(state, rule, makeContext());
    expect(result.rule).toBe(rule);
  });
});

// ============================================================================
// executeRules
// ============================================================================

describe('RuleExecutor.executeRules', () => {
  const executor = new RuleExecutor();

  it('executes multiple rules in sequence', () => {
    const state = makeState();
    const r1 = makeRule({ code: '(state) => state' });
    const r2 = makeRule({ code: '(state) => state' });
    const result = executor.executeRules(state, [r1, r2], makeContext());
    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(2);
  });

  it('stops on first error by default', () => {
    const state = makeState();
    const failing = makeRule({ isActive: false });
    const good = makeRule({ code: '(state) => state' });
    const result = executor.executeRules(state, [failing, good], makeContext());
    expect(result.results).toHaveLength(1);
    expect(result.results[0].success).toBe(false);
  });

  it('continues on error when continueOnError is true', () => {
    const state = makeState();
    const failing = makeRule({ isActive: false });
    const good = makeRule({ code: '(state) => state' });
    const result = executor.executeRules(state, [failing, good], makeContext(), {
      continueOnError: true,
    });
    expect(result.results).toHaveLength(2);
  });

  it('returns the original state on failure', () => {
    const state = makeState();
    const failing = makeRule({ isActive: false });
    const result = executor.executeRules(state, [failing], makeContext());
    expect(result.success).toBe(false);
    expect(result.finalState).toBe(state);
  });

  it('returns the accumulated final state on complete success', () => {
    const state = makeState();
    const r1 = makeRule({ code: '(state) => state' });
    const result = executor.executeRules(state, [r1], makeContext());
    expect(result.success).toBe(true);
    expect(result.finalState).not.toBe(state);
  });

  it('handles empty rule list gracefully', () => {
    const state = makeState();
    const result = executor.executeRules(state, [], makeContext());
    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(0);
  });
});

// ============================================================================
// executeAllActiveRules
// ============================================================================

describe('RuleExecutor.executeAllActiveRules', () => {
  const executor = new RuleExecutor();

  it('returns a result with one entry per active rule in a custom rule set', () => {
    const state = makeState();
    // Replace the default rules with two simple no-op rules
    const r1 = makeRule({ number: 800, isActive: true, code: '(state) => state' });
    const r2 = makeRule({ number: 801, isActive: true, code: '(state) => state' });
    const stateWithRules = { ...state, rules: [r1, r2] } as typeof state;
    const result = executor.executeAllActiveRules(stateWithRules, makeContext());
    expect(result.results).toHaveLength(2);
    expect(result.success).toBe(true);
  });

  it('does not execute inactive rules', () => {
    // Build a state where all rules are explicitly inactive except one simple rule.
    // We verify the inactive rule would have thrown if run.
    let state = makeState();
    // Replace rules entirely with one active no-op and one inactive error rule
    const noopR = makeRule({ number: 800, isActive: true, code: '(state) => state' });
    const badR = makeRule({ number: 801, isActive: false, code: '(state) => { throw new Error("should not run"); }' });
    state = { ...state, rules: [noopR, badR] } as typeof state;
    const result = executor.executeAllActiveRules(state, makeContext());
    expect(result.results).toHaveLength(1);
    expect(result.results[0].success).toBe(true);
  });
});

// ============================================================================
// validateRuleCode
// ============================================================================

describe('RuleExecutor.validateRuleCode', () => {
  const executor = new RuleExecutor();

  it('returns valid:true for a valid rule function', () => {
    const result = executor.validateRuleCode('(state) => state');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('returns valid:false for syntactically invalid code', () => {
    const result = executor.validateRuleCode('this is not js {{{{');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('returns valid:false for code with forbidden patterns (require)', () => {
    const result = executor.validateRuleCode('(state) => { require("fs"); return state; }');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('require'))).toBe(true);
  });

  it('returns valid:false for code with forbidden patterns (process)', () => {
    const result = executor.validateRuleCode('(state) => { process.exit(0); return state; }');
    expect(result.valid).toBe(false);
  });

  it('returns valid:false for eval usage', () => {
    const result = executor.validateRuleCode('(state) => { eval("1+1"); return state; }');
    expect(result.valid).toBe(false);
  });
});

// ============================================================================
// testRule
// ============================================================================

describe('RuleExecutor.testRule', () => {
  const executor = new RuleExecutor();

  it('runs a rule with default context when none supplied', () => {
    const state = makeState();
    const rule = makeRule({ code: '(state) => state' });
    const result = executor.testRule(rule, state);
    expect(result.success).toBe(true);
  });

  it('respects partial context overrides', () => {
    const state = makeState();
    const rule = makeRule({ code: '(state) => state' });
    const result = executor.testRule(rule, state, { triggeredBy: 'custom-actor' });
    expect(result.success).toBe(true);
  });
});
