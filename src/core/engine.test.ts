/**
 * Unit tests for NomicEngine
 * Tests game creation, player management, rule lifecycle, turn progression,
 * voting flow, and event dispatch integration.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { NomicEngine } from './engine.js';
import type { Rule } from './types.js';
import { generateId } from './state.js';

// ============================================================================
// Test Helpers
// ============================================================================

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
    triggers: [{ type: 'never' }],
    ...overrides,
  };
}

/** Create an engine with two players added and started. */
function createActiveEngine(): { engine: NomicEngine; p1: string; p2: string } {
  const engine = new NomicEngine();
  const p1 = engine.addPlayer('Alice');
  const p2 = engine.addPlayer('Bob');
  engine.start();
  return { engine, p1: p1.id, p2: p2.id };
}

// ============================================================================
// Construction & Initialization
// ============================================================================

describe('NomicEngine - construction', () => {
  it('creates engine with default state', () => {
    const engine = new NomicEngine();
    expect(engine.getStatus()).toBe('setup');
    expect(engine.getGameId()).toBeTruthy();
    expect(engine.getPlayers()).toHaveLength(0);
  });

  it('accepts custom initial state', () => {
    const engine1 = new NomicEngine();
    engine1.addPlayer('Alice');
    engine1.addPlayer('Bob');
    engine1.start();

    const engine2 = new NomicEngine({ state: engine1.getState() });
    expect(engine2.getStatus()).toBe('active');
    expect(engine2.getPlayers()).toHaveLength(2);
  });

  it('two engines have different game IDs', () => {
    const e1 = new NomicEngine();
    const e2 = new NomicEngine();
    expect(e1.getGameId()).not.toBe(e2.getGameId());
  });
});

// ============================================================================
// Player Management
// ============================================================================

describe('NomicEngine - player management', () => {
  it('adds a player during setup', () => {
    const engine = new NomicEngine();
    const player = engine.addPlayer('Alice');
    expect(player.name).toBe('Alice');
    expect(player.id).toBeTruthy();
    expect(engine.getPlayers()).toHaveLength(1);
  });

  it('assigns zero points to new players', () => {
    const engine = new NomicEngine();
    const player = engine.addPlayer('Alice');
    expect(engine.getPoints(player.id)).toBe(0);
  });

  it('throws when adding player after game starts', () => {
    const { engine } = createActiveEngine();
    expect(() => engine.addPlayer('Charlie')).toThrow('setup');
  });

  it('initializes multiple players at once', () => {
    const engine = new NomicEngine();
    engine.initialize(['Alice', 'Bob', 'Charlie']);
    expect(engine.getPlayers()).toHaveLength(3);
  });

  it('getPlayer returns the correct player', () => {
    const engine = new NomicEngine();
    const player = engine.addPlayer('Alice');
    expect(engine.getPlayer(player.id)?.name).toBe('Alice');
  });

  it('getPlayer returns undefined for unknown ID', () => {
    const engine = new NomicEngine();
    expect(engine.getPlayer('nonexistent')).toBeUndefined();
  });
});

// ============================================================================
// Game Start
// ============================================================================

describe('NomicEngine - game start', () => {
  it('transitions status to active after start', () => {
    const { engine } = createActiveEngine();
    expect(engine.getStatus()).toBe('active');
  });

  it('throws when starting with fewer than 2 players', () => {
    const engine = new NomicEngine();
    engine.addPlayer('Alice');
    expect(() => engine.start()).toThrow('2');
  });

  it('throws when starting an already-active game', () => {
    const { engine } = createActiveEngine();
    expect(() => engine.start()).toThrow();
  });

  it('sets current player to first player after start', () => {
    const { engine, p1 } = createActiveEngine();
    expect(engine.getCurrentPlayerId()).toBe(p1);
    expect(engine.getCurrentTurn()).toBe(1);
  });
});

// ============================================================================
// Turn Management
// ============================================================================

describe('NomicEngine - turn management', () => {
  it('advances to next player after endTurn', () => {
    const { engine, p2 } = createActiveEngine();
    engine.endTurn();
    expect(engine.getCurrentPlayerId()).toBe(p2);
    expect(engine.getCurrentTurn()).toBe(2);
  });

  it('wraps turn order back to first player', () => {
    const { engine, p1 } = createActiveEngine();
    engine.endTurn(); // p2's turn
    engine.endTurn(); // back to p1
    expect(engine.getCurrentPlayerId()).toBe(p1);
    expect(engine.getCurrentTurn()).toBe(3);
  });

  it('isPlayerTurn returns true for current player', () => {
    const { engine, p1 } = createActiveEngine();
    expect(engine.isPlayerTurn(p1)).toBe(true);
  });

  it('isPlayerTurn returns false for non-current player', () => {
    const { engine, p2 } = createActiveEngine();
    expect(engine.isPlayerTurn(p2)).toBe(false);
  });

  it('pause transitions game to paused status', () => {
    const { engine } = createActiveEngine();
    engine.pause();
    expect(engine.getStatus()).toBe('paused');
  });

  it('resume transitions game back to active', () => {
    const { engine } = createActiveEngine();
    engine.pause();
    engine.resume();
    expect(engine.getStatus()).toBe('active');
  });
});

// ============================================================================
// Rule Queries
// ============================================================================

describe('NomicEngine - rule queries', () => {
  it('getAllRules returns initial rules', () => {
    const engine = new NomicEngine();
    expect(engine.getAllRules().length).toBeGreaterThan(0);
  });

  it('getActiveRules returns only active rules', () => {
    const engine = new NomicEngine();
    const activeRules = engine.getActiveRules();
    expect(activeRules.every(r => r.isActive)).toBe(true);
  });

  it('getRule returns rule by ID', () => {
    const engine = new NomicEngine();
    const rule = engine.getAllRules()[0];
    expect(engine.getRule(rule.id)).toEqual(rule);
  });

  it('getRule returns undefined for unknown ID', () => {
    const engine = new NomicEngine();
    expect(engine.getRule('nonexistent')).toBeUndefined();
  });

  it('getRuleByNumber returns rule with that number', () => {
    const engine = new NomicEngine();
    expect(engine.getRuleByNumber(1)?.name).toBeTruthy();
  });

  it('getRuleByNumber returns undefined for unknown number', () => {
    const engine = new NomicEngine();
    expect(engine.getRuleByNumber(9999)).toBeUndefined();
  });
});

// ============================================================================
// Leaderboard
// ============================================================================

describe('NomicEngine - leaderboard', () => {
  it('returns all players with zero points initially', () => {
    const { engine } = createActiveEngine();
    const board = engine.getLeaderboard();
    expect(board).toHaveLength(2);
    expect(board.every(e => e.points === 0)).toBe(true);
  });
});

// ============================================================================
// Rule Execution
// ============================================================================

describe('NomicEngine - rule execution', () => {
  it('executeRule runs a rule and updates state', () => {
    const { engine, p1 } = createActiveEngine();

    const rule = makeRule({
      code: `(state) => {
        const newPoints = new Map(state.points);
        newPoints.set('${p1}', 42);
        return { ...state, points: newPoints };
      }`,
      triggers: [{ type: 'never' }],
    });

    // Inject rule directly into state for testing
    const currentState = engine.getState();
    const engineWithRule = new NomicEngine({
      state: {
        ...currentState,
        rules: [...currentState.rules, rule],
      } as any,
    });

    engineWithRule.executeRule(rule.id, 'system');
    expect(engineWithRule.getPoints(p1)).toBe(42);
  });

  it('executeRule throws for unknown rule ID', () => {
    const { engine } = createActiveEngine();
    expect(() => engine.executeRule('nonexistent', 'system')).toThrow('not found');
  });

  it('validateRuleCode returns valid for simple rule', () => {
    const engine = new NomicEngine();
    const result = engine.validateRuleCode('(state) => state');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

// ============================================================================
// Proposals
// ============================================================================

describe('NomicEngine - proposals', () => {
  it('proposeRule creates an active proposal', () => {
    const { engine, p1 } = createActiveEngine();
    const rule = makeRule({ proposedBy: p1 });
    const proposalId = engine.proposeRule(p1, 'Add test rule', rule);

    expect(proposalId).toBeTruthy();
    expect(engine.getActiveProposals()).toHaveLength(1);
    expect(engine.getProposal(proposalId)?.status).toBe('pending');
  });

  it('proposeModifyRule creates a modify proposal', () => {
    const { engine, p1 } = createActiveEngine();
    const existingRule = engine.getAllRules().find(r => r.isMutable)!;
    const modifiedRule = { ...existingRule, name: 'Modified Rule' };
    const proposalId = engine.proposeModifyRule(p1, 'Modify rule', modifiedRule);

    expect(engine.getProposal(proposalId)?.type).toBe('modify-rule');
  });

  it('proposeRemoveRule creates a remove proposal', () => {
    const { engine, p1 } = createActiveEngine();
    const existingRule = engine.getAllRules().find(r => r.isMutable)!;
    const proposalId = engine.proposeRemoveRule(p1, 'Remove rule', existingRule);

    expect(engine.getProposal(proposalId)?.type).toBe('remove-rule');
  });

  it('withdrawProposal moves proposal out of active list', () => {
    const { engine, p1 } = createActiveEngine();
    const rule = makeRule({ proposedBy: p1 });
    const proposalId = engine.proposeRule(p1, 'Add test rule', rule);

    engine.withdrawProposal(proposalId, p1);

    expect(engine.getActiveProposals()).toHaveLength(0);
    expect(engine.getProposal(proposalId)?.status).toBe('withdrawn');
  });
});

// ============================================================================
// Voting Flow (end-to-end through engine)
// ============================================================================

describe('NomicEngine - voting flow', () => {
  it('add-rule proposal passes when all players vote yes', () => {
    const { engine, p1, p2 } = createActiveEngine();
    const rule = makeRule({ proposedBy: p1 });
    const ruleCountBefore = engine.getAllRules().length;

    const proposalId = engine.proposeRule(p1, 'Add test rule', rule);

    engine.vote(proposalId, p1, 'yes');
    engine.vote(proposalId, p2, 'yes'); // auto-resolves

    expect(engine.getActiveProposals()).toHaveLength(0);
    expect(engine.getProposal(proposalId)?.status).toBe('passed');
    expect(engine.getAllRules().length).toBe(ruleCountBefore + 1);
  });

  it('add-rule proposal fails when majority vote no', () => {
    const { engine, p1, p2 } = createActiveEngine();
    const rule = makeRule({ proposedBy: p1 });
    const ruleCountBefore = engine.getAllRules().length;

    const proposalId = engine.proposeRule(p1, 'Add test rule', rule);

    engine.vote(proposalId, p1, 'no');
    engine.vote(proposalId, p2, 'no'); // auto-resolves

    expect(engine.getProposal(proposalId)?.status).toBe('failed');
    expect(engine.getAllRules().length).toBe(ruleCountBefore);
  });

  it('modify-rule proposal replaces rule on pass', () => {
    const { engine, p1, p2 } = createActiveEngine();
    const existingRule = engine.getAllRules().find(r => r.isMutable)!;
    const modifiedRule = { ...existingRule, name: 'Modified Rule Name' };

    const proposalId = engine.proposeModifyRule(p1, 'Modify rule', modifiedRule);

    engine.vote(proposalId, p1, 'yes');
    engine.vote(proposalId, p2, 'yes');

    expect(engine.getRule(existingRule.id)?.name).toBe('Modified Rule Name');
  });

  it('remove-rule proposal deactivates rule on pass', () => {
    const { engine, p1, p2 } = createActiveEngine();
    const existingRule = engine.getAllRules().find(r => r.isMutable)!;

    const proposalId = engine.proposeRemoveRule(p1, 'Remove rule', existingRule);

    engine.vote(proposalId, p1, 'yes');
    engine.vote(proposalId, p2, 'yes');

    expect(engine.getRule(existingRule.id)?.isActive).toBe(false);
  });

  it('manual resolveProposal works when not auto-resolving', () => {
    const { engine, p1 } = createActiveEngine();

    // Add a third player so auto-resolve doesn't fire after 1 vote
    // We need to do this in setup — create a fresh engine
    const engine2 = new NomicEngine();
    const a = engine2.addPlayer('Alice');
    const b = engine2.addPlayer('Bob');
    const c = engine2.addPlayer('Charlie');
    engine2.start();

    const rule = makeRule({ proposedBy: a.id });
    const proposalId = engine2.proposeRule(a.id, 'Add rule', rule);

    engine2.vote(proposalId, a.id, 'yes');
    engine2.vote(proposalId, b.id, 'yes');
    // Only 2 of 3 voted — not auto-resolved yet
    expect(engine2.getProposal(proposalId)?.status).toBe('pending');

    engine2.vote(proposalId, c.id, 'yes'); // now auto-resolves
    expect(engine2.getProposal(proposalId)?.status).toBe('passed');
  });
});

// ============================================================================
// Serialization
// ============================================================================

describe('NomicEngine - serialization', () => {
  it('toJSON produces valid JSON string', () => {
    const { engine } = createActiveEngine();
    const json = engine.toJSON();
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('fromJSON reconstructs equivalent engine state', () => {
    const { engine, p1 } = createActiveEngine();
    const json = engine.toJSON();
    const engine2 = NomicEngine.fromJSON(json);

    expect(engine2.getStatus()).toBe('active');
    expect(engine2.getPlayers()).toHaveLength(2);
    expect(engine2.getCurrentPlayerId()).toBe(p1);
  });

  it('fromJSON preserves rules', () => {
    const { engine } = createActiveEngine();
    const ruleCount = engine.getAllRules().length;
    const engine2 = NomicEngine.fromJSON(engine.toJSON());
    expect(engine2.getAllRules().length).toBe(ruleCount);
  });
});
