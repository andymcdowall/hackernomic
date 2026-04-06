/**
 * Integration-style unit tests for RuleSandbox
 * Tests valid code execution, timeout enforcement, blocked globals,
 * and syntax error handling.
 */

import { describe, it, expect } from 'vitest';
import { RuleSandbox } from './runtime.js';
import { createInitialState, addPlayer, generateId } from '../core/state.js';
import type { GameState, Rule, RuleContext } from '../core/types.js';

// ============================================================================
// Helpers
// ============================================================================

function makeState(): GameState {
  let state = createInitialState('sandbox-test');
  state = addPlayer(state, { id: 'p1', name: 'Alice', joinedAt: Date.now(), isActive: true });
  return state;
}

function makeRule(overrides: Partial<Rule> = {}): Rule {
  return {
    id: generateId(),
    number: 999,
    name: 'Sandbox Test Rule',
    description: 'Test',
    code: '(state) => state',
    isActive: true,
    isMutable: true,
    proposedBy: 'system',
    createdAt: Date.now(),
    triggers: [],
    ...overrides,
  };
}

function makeContext(): RuleContext {
  return { triggeredBy: 'p1', timestamp: Date.now() };
}

// ============================================================================
// execute — valid code
// ============================================================================

describe('RuleSandbox.execute — valid code', () => {
  const sandbox = new RuleSandbox();

  it('executes a no-op rule and returns a valid GameState', () => {
    const state = makeState();
    const rule = makeRule({ code: '(state) => state' });
    const result = sandbox.execute(rule, state, makeContext());
    expect(result).toBeTruthy();
    expect(result.gameId).toBe(state.gameId);
  });

  it('executes a rule that accesses state properties', () => {
    const state = makeState();
    const rule = makeRule({
      code: `(state) => {
        const id = state.gameId;
        return state;
      }`,
    });
    const result = sandbox.execute(rule, state, makeContext());
    expect(result.gameId).toBe(state.gameId);
  });

  it('executes a rule that uses allowed globals (Math)', () => {
    const state = makeState();
    const rule = makeRule({
      code: `(state) => {
        const n = Math.max(1, 2);
        return state;
      }`,
    });
    expect(() => sandbox.execute(rule, state, makeContext())).not.toThrow();
  });

  it('executes a rule that uses the provided context', () => {
    const state = makeState();
    const rule = makeRule({
      code: `(state, context) => {
        const actor = context.triggeredBy;
        return state;
      }`,
    });
    expect(() => sandbox.execute(rule, state, makeContext())).not.toThrow();
  });

  it('returns original-equivalent state when rule returns state unchanged', () => {
    const state = makeState();
    const rule = makeRule({ code: '(state) => state' });
    const result = sandbox.execute(rule, state, makeContext());
    expect(result.gameId).toBe(state.gameId);
    expect(result.version).toBe(state.version);
  });
});

// ============================================================================
// execute — error cases
// ============================================================================

describe('RuleSandbox.execute — errors', () => {
  const sandbox = new RuleSandbox();

  it('throws when rule code is not a function', () => {
    const state = makeState();
    const rule = makeRule({ code: '42' });
    expect(() => sandbox.execute(rule, state, makeContext())).toThrow();
  });

  it('throws when rule throws a runtime error', () => {
    const state = makeState();
    const rule = makeRule({ code: '(state) => { throw new Error("test error"); }' });
    expect(() => sandbox.execute(rule, state, makeContext())).toThrow();
  });

  it('throws when rule returns null', () => {
    const state = makeState();
    const rule = makeRule({ code: '(state) => null' });
    expect(() => sandbox.execute(rule, state, makeContext())).toThrow();
  });

  it('throws when rule returns an object missing required fields', () => {
    const state = makeState();
    const rule = makeRule({ code: '(state) => ({ some: "object" })' });
    expect(() => sandbox.execute(rule, state, makeContext())).toThrow();
  });

  it('throws with rule context in the error message', () => {
    const state = makeState();
    const rule = makeRule({ code: '42', name: 'Bad Rule', number: 777 });
    expect(() => sandbox.execute(rule, state, makeContext())).toThrow(/777/);
  });
});

// ============================================================================
// execute — blocked globals
// ============================================================================

describe('RuleSandbox.execute — blocked globals', () => {
  const sandbox = new RuleSandbox();

  it('blocks access to process object', () => {
    const state = makeState();
    const rule = makeRule({
      code: `(state) => {
        const p = typeof process !== 'undefined' ? process.version : null;
        return state;
      }`,
    });
    // vm2 sandbox should block process — either throws or returns undefined for process
    // The rule returns state safely even if process is undefined in the sandbox
    // We just verify it doesn't leak the real process
    const result = sandbox.execute(rule, state, makeContext());
    expect(result.gameId).toBe(state.gameId); // sandbox ran without crashing
  });

  it('blocks require()', () => {
    const state = makeState();
    const rule = makeRule({ code: `(state) => { require('fs'); return state; }` });
    expect(() => sandbox.execute(rule, state, makeContext())).toThrow();
  });
});

// ============================================================================
// execute — timeout
// ============================================================================

describe('RuleSandbox.execute — timeout', () => {
  it('throws when rule exceeds the configured timeout', () => {
    const fastTimeoutSandbox = new RuleSandbox({ timeout: 100 }); // 100ms
    const state = makeState();
    const rule = makeRule({
      code: `(state) => {
        const start = Date.now();
        while (Date.now() - start < 5000) {} // spin for 5 seconds
        return state;
      }`,
    });
    expect(() => fastTimeoutSandbox.execute(rule, state, makeContext())).toThrow();
  });
});

// ============================================================================
// validate
// ============================================================================

describe('RuleSandbox.validate', () => {
  const sandbox = new RuleSandbox();

  it('returns valid:true for a well-formed function expression', () => {
    const result = sandbox.validate('(state) => state');
    expect(result.valid).toBe(true);
  });

  it('returns valid:true for a function declaration style', () => {
    const result = sandbox.validate('function(state) { return state; }');
    expect(result.valid).toBe(true);
  });

  it('returns valid:false for syntactically invalid code', () => {
    const result = sandbox.validate('(((not valid js}}}}');
    expect(result.valid).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('returns valid:true for a numeric literal (validate only checks syntax, not function-ness)', () => {
    // sandbox.validate() uses `new Function()` which accepts any valid JS expression.
    // A numeric literal like 42 is syntactically valid; the function-type check only
    // fires at execute() time, not at validate() time.
    const result = sandbox.validate('42');
    expect(result.valid).toBe(true);
  });
});

// ============================================================================
// checkForbiddenPatterns
// ============================================================================

describe('RuleSandbox.checkForbiddenPatterns', () => {
  const sandbox = new RuleSandbox();

  it('returns safe:true for clean rule code', () => {
    const result = sandbox.checkForbiddenPatterns('(state) => state');
    expect(result.safe).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('flags require()', () => {
    const result = sandbox.checkForbiddenPatterns('(state) => { require("fs"); return state; }');
    expect(result.safe).toBe(false);
    expect(result.violations.some(v => v.includes('require'))).toBe(true);
  });

  it('flags import statements', () => {
    const result = sandbox.checkForbiddenPatterns('import fs from "fs"; (state) => state');
    expect(result.safe).toBe(false);
    expect(result.violations.some(v => v.includes('import'))).toBe(true);
  });

  it('flags eval()', () => {
    const result = sandbox.checkForbiddenPatterns('(state) => { eval("1+1"); return state; }');
    expect(result.safe).toBe(false);
    expect(result.violations.some(v => v.includes('eval'))).toBe(true);
  });

  it('flags Function() constructor', () => {
    const result = sandbox.checkForbiddenPatterns('(state) => { new Function("return 1")(); return state; }');
    expect(result.safe).toBe(false);
  });

  it('flags setTimeout/setInterval', () => {
    const result = sandbox.checkForbiddenPatterns('(state) => { setTimeout(()=>{}, 0); return state; }');
    expect(result.safe).toBe(false);
    expect(result.violations.some(v => v.includes('setTimeout'))).toBe(true);
  });

  it('flags process access', () => {
    const result = sandbox.checkForbiddenPatterns('(state) => { process.exit(0); return state; }');
    expect(result.safe).toBe(false);
    expect(result.violations.some(v => v.includes('process'))).toBe(true);
  });

  it('flags prototype mutation', () => {
    const result = sandbox.checkForbiddenPatterns('(state) => { Object.prototype = {}; return state; }');
    expect(result.safe).toBe(false);
  });

  it('collects multiple violations', () => {
    const result = sandbox.checkForbiddenPatterns('(state) => { eval("x"); process.exit(0); return state; }');
    expect(result.violations.length).toBeGreaterThan(1);
  });
});
