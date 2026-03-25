import { describe, it, expect, vi } from 'vitest';
import {
  generateId,
  deepClone,
  deepFreeze,
  getInitialRules,
  createInitialState,
  updateState,
  addPlayer,
  awardPoints,
  addRule,
  addTransition,
  emitSystemEvent,
  StateHelpers,
} from './state.js';
import type { GameState, Player, Rule, StateTransition } from './types.js';

// ============================================================================
// Helpers
// ============================================================================

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'player-1',
    name: 'Alice',
    joinedAt: 1000,
    isActive: true,
    ...overrides,
  };
}

function makeRule(overrides: Partial<Rule> = {}): Rule {
  return {
    id: 'rule-99',
    number: 99,
    name: 'Test Rule',
    description: 'A test rule',
    code: '(state) => state',
    isActive: true,
    isMutable: true,
    proposedBy: 'player-1',
    createdAt: 1000,
    triggers: [],
    ...overrides,
  };
}

function makeTransition(overrides: Partial<StateTransition> = {}): StateTransition {
  return {
    id: 'trans-1',
    timestamp: 1000,
    type: 'rule-executed',
    actorId: 'system',
    data: {},
    ...overrides,
  };
}

// ============================================================================
// generateId
// ============================================================================

describe('generateId', () => {
  it('returns a 32-character hex string', () => {
    const id = generateId();
    expect(id).toMatch(/^[0-9a-f]{32}$/);
  });

  it('returns unique values on successive calls', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });
});

// ============================================================================
// deepClone
// ============================================================================

describe('deepClone', () => {
  it('clones primitives unchanged', () => {
    expect(deepClone(42)).toBe(42);
    expect(deepClone('hello')).toBe('hello');
    expect(deepClone(null)).toBeNull();
    expect(deepClone(true)).toBe(true);
  });

  it('clones arrays without sharing references', () => {
    const original = [1, 2, [3, 4]];
    const cloned = deepClone(original);
    expect(cloned).toEqual(original);
    expect(cloned).not.toBe(original);
    expect(cloned[2]).not.toBe(original[2]);
  });

  it('clones plain objects without sharing references', () => {
    const original = { a: 1, b: { c: 2 } };
    const cloned = deepClone(original);
    expect(cloned).toEqual(original);
    expect(cloned).not.toBe(original);
    expect(cloned.b).not.toBe(original.b);
  });

  it('clones Maps with deep-cloned values', () => {
    const original = new Map([['key', { nested: 1 }]]);
    const cloned = deepClone(original);
    expect(cloned).toBeInstanceOf(Map);
    expect(cloned.get('key')).toEqual({ nested: 1 });
    expect(cloned.get('key')).not.toBe(original.get('key'));
    expect(cloned).not.toBe(original);
  });

  it('handles nested Maps inside objects', () => {
    const original = { map: new Map([['x', 10]]) };
    const cloned = deepClone(original);
    expect(cloned.map).toBeInstanceOf(Map);
    expect(cloned.map.get('x')).toBe(10);
    expect(cloned.map).not.toBe(original.map);
  });
});

// ============================================================================
// deepFreeze
// ============================================================================

describe('deepFreeze', () => {
  it('freezes a top-level object', () => {
    const obj = { a: 1 };
    deepFreeze(obj);
    expect(Object.isFrozen(obj)).toBe(true);
  });

  it('freezes nested objects', () => {
    const obj = { a: { b: { c: 3 } } };
    deepFreeze(obj);
    expect(Object.isFrozen(obj.a)).toBe(true);
    expect(Object.isFrozen(obj.a.b)).toBe(true);
  });

  it('returns the same reference', () => {
    const obj = { x: 1 };
    expect(deepFreeze(obj)).toBe(obj);
  });

  it('prevents modification of frozen objects in strict mode', () => {
    const obj = deepFreeze({ a: 1 });
    expect(() => {
      'use strict';
      (obj as any).a = 2;
    }).toThrow();
  });
});

// ============================================================================
// getInitialRules
// ============================================================================

describe('getInitialRules', () => {
  it('returns exactly 5 initial rules', () => {
    const rules = getInitialRules();
    expect(rules).toHaveLength(5);
  });

  it('all rules have required fields', () => {
    const rules = getInitialRules();
    for (const rule of rules) {
      expect(rule.id).toBeTruthy();
      expect(rule.number).toBeTypeOf('number');
      expect(rule.name).toBeTruthy();
      expect(rule.isActive).toBe(true);
    }
  });

  it('immutable core rules are not mutable', () => {
    const rules = getInitialRules();
    const coreRules = rules.filter(r => r.number < 100);
    for (const rule of coreRules) {
      expect(rule.isMutable).toBe(false);
    }
  });

  it('returns new rule instances on each call (no shared state)', () => {
    const a = getInitialRules();
    const b = getInitialRules();
    expect(a[0]).not.toBe(b[0]);
    expect(a[0].id).not.toBe(b[0].id);
  });
});

// ============================================================================
// createInitialState
// ============================================================================

describe('createInitialState', () => {
  it('creates a frozen state with the correct gameId', () => {
    const state = createInitialState('game-abc');
    expect(state.gameId).toBe('game-abc');
    expect(Object.isFrozen(state)).toBe(true);
  });

  it('has status "setup" initially', () => {
    const state = createInitialState('g1');
    expect(state.status).toBe('setup');
  });

  it('starts with empty players list and empty points map', () => {
    const state = createInitialState('g1');
    expect(state.players).toHaveLength(0);
    expect(state.points.size).toBe(0);
  });

  it('starts with the 5 initial rules', () => {
    const state = createInitialState('g1');
    expect(state.rules).toHaveLength(5);
  });

  it('starts with empty turn order and no current player', () => {
    const state = createInitialState('g1');
    expect(state.turns.currentPlayerId).toBeNull();
    expect(state.turns.turnOrder).toHaveLength(0);
    expect(state.turns.currentTurn).toBe(0);
  });

  it('starts with empty pending events', () => {
    const state = createInitialState('g1');
    expect(state.pendingEvents).toHaveLength(0);
  });

  it('history contains one "game-created" transition', () => {
    const state = createInitialState('g1');
    expect(state.history).toHaveLength(1);
    expect(state.history[0].type).toBe('game-created');
    expect(state.history[0].actorId).toBe('system');
  });

  it('has the correct version string', () => {
    const state = createInitialState('g1');
    expect(state.version).toBe('1.0.0');
  });
});

// ============================================================================
// updateState
// ============================================================================

describe('updateState', () => {
  it('returns a new object, not the original', () => {
    const state = createInitialState('g1');
    const updated = updateState(state, () => {});
    expect(updated).not.toBe(state);
  });

  it('does not modify the original state', () => {
    const state = createInitialState('g1');
    const originalPlayersRef = state.players;
    updateState(state, draft => {
      (draft.players as Player[]).push(makePlayer());
    });
    expect(state.players).toBe(originalPlayersRef);
    expect(state.players).toHaveLength(0);
  });

  it('applies the updater function to the draft', () => {
    const state = createInitialState('g1');
    const updated = updateState(state, draft => {
      (draft as any).status = 'active';
    });
    expect(updated.status).toBe('active');
  });

  it('updates the updatedAt timestamp', () => {
    const before = Date.now();
    const state = createInitialState('g1');
    const updated = updateState(state, () => {});
    expect(updated.updatedAt).toBeGreaterThanOrEqual(before);
  });

  it('returns a frozen result', () => {
    const state = createInitialState('g1');
    const updated = updateState(state, () => {});
    expect(Object.isFrozen(updated)).toBe(true);
  });
});

// ============================================================================
// addPlayer
// ============================================================================

describe('addPlayer', () => {
  it('adds the player to the players array', () => {
    const state = createInitialState('g1');
    const player = makePlayer();
    const updated = addPlayer(state, player);
    expect(updated.players).toHaveLength(1);
    expect(updated.players[0]).toMatchObject({ id: 'player-1', name: 'Alice' });
  });

  it('initializes player points to 0', () => {
    const state = createInitialState('g1');
    const player = makePlayer({ id: 'p1' });
    const updated = addPlayer(state, player);
    expect(updated.points.get('p1')).toBe(0);
  });

  it('records a player-joined transition in history', () => {
    const state = createInitialState('g1');
    const updated = addPlayer(state, makePlayer({ id: 'p1' }));
    const entry = updated.history.find(h => h.type === 'player-joined');
    expect(entry).toBeDefined();
    expect(entry?.actorId).toBe('p1');
  });

  it('does not mutate original state', () => {
    const state = createInitialState('g1');
    addPlayer(state, makePlayer());
    expect(state.players).toHaveLength(0);
  });

  it('supports adding multiple players', () => {
    let state = createInitialState('g1');
    state = addPlayer(state, makePlayer({ id: 'p1', name: 'Alice' }));
    state = addPlayer(state, makePlayer({ id: 'p2', name: 'Bob' }));
    expect(state.players).toHaveLength(2);
    expect(state.points.get('p1')).toBe(0);
    expect(state.points.get('p2')).toBe(0);
  });
});

// ============================================================================
// awardPoints
// ============================================================================

describe('awardPoints', () => {
  it('awards points to a player', () => {
    let state = createInitialState('g1');
    state = addPlayer(state, makePlayer({ id: 'p1' }));
    const updated = awardPoints(state, 'p1', 10);
    expect(updated.points.get('p1')).toBe(10);
  });

  it('accumulates multiple awards', () => {
    let state = createInitialState('g1');
    state = addPlayer(state, makePlayer({ id: 'p1' }));
    state = awardPoints(state, 'p1', 10);
    state = awardPoints(state, 'p1', 5);
    expect(state.points.get('p1')).toBe(15);
  });

  it('defaults to 0 for unknown player before awarding', () => {
    const state = createInitialState('g1');
    const updated = awardPoints(state, 'unknown', 5);
    expect(updated.points.get('unknown')).toBe(5);
  });

  it('records a points-awarded transition in history', () => {
    let state = createInitialState('g1');
    state = addPlayer(state, makePlayer({ id: 'p1' }));
    const updated = awardPoints(state, 'p1', 10);
    const entry = updated.history.find(h => h.type === 'points-awarded');
    expect(entry).toBeDefined();
    expect((entry?.data as any).playerId).toBe('p1');
    expect((entry?.data as any).amount).toBe(10);
    expect((entry?.data as any).newTotal).toBe(10);
  });

  it('does not mutate original state', () => {
    let state = createInitialState('g1');
    state = addPlayer(state, makePlayer({ id: 'p1' }));
    awardPoints(state, 'p1', 10);
    expect(state.points.get('p1')).toBe(0);
  });
});

// ============================================================================
// addRule
// ============================================================================

describe('addRule', () => {
  it('appends the rule to the rules array', () => {
    const state = createInitialState('g1');
    const initialCount = state.rules.length;
    const rule = makeRule();
    const updated = addRule(state, rule);
    expect(updated.rules).toHaveLength(initialCount + 1);
    expect(updated.rules[updated.rules.length - 1]).toMatchObject({ id: 'rule-99' });
  });

  it('does not mutate original state', () => {
    const state = createInitialState('g1');
    const initialCount = state.rules.length;
    addRule(state, makeRule());
    expect(state.rules).toHaveLength(initialCount);
  });
});

// ============================================================================
// addTransition
// ============================================================================

describe('addTransition', () => {
  it('appends the transition to history', () => {
    const state = createInitialState('g1');
    const transition = makeTransition({ id: 't-99', type: 'rule-executed' });
    const updated = addTransition(state, transition);
    expect(updated.history.find(h => h.id === 't-99')).toBeDefined();
  });

  it('does not mutate original state', () => {
    const state = createInitialState('g1');
    const originalLength = state.history.length;
    addTransition(state, makeTransition());
    expect(state.history).toHaveLength(originalLength);
  });
});

// ============================================================================
// emitSystemEvent
// ============================================================================

describe('emitSystemEvent', () => {
  it('adds a pending event to the state', () => {
    const state = createInitialState('g1');
    const updated = emitSystemEvent(state, 'turn-start', 'system', { turn: 1 });
    expect(updated.pendingEvents).toHaveLength(1);
    expect(updated.pendingEvents[0].type).toBe('turn-start');
    expect(updated.pendingEvents[0].actorId).toBe('system');
    expect(updated.pendingEvents[0].data).toEqual({ turn: 1 });
  });

  it('accumulates multiple pending events', () => {
    let state = createInitialState('g1');
    state = emitSystemEvent(state, 'turn-start', 'system');
    state = emitSystemEvent(state, 'turn-end', 'system');
    expect(state.pendingEvents).toHaveLength(2);
  });

  it('does not mutate original state', () => {
    const state = createInitialState('g1');
    emitSystemEvent(state, 'turn-start', 'system');
    expect(state.pendingEvents).toHaveLength(0);
  });
});

// ============================================================================
// StateHelpers.getPlayer
// ============================================================================

describe('StateHelpers.getPlayer', () => {
  it('returns the player with the given id', () => {
    let state = createInitialState('g1');
    state = addPlayer(state, makePlayer({ id: 'p1', name: 'Alice' }));
    const player = StateHelpers.getPlayer(state, 'p1');
    expect(player?.name).toBe('Alice');
  });

  it('returns undefined for unknown player', () => {
    const state = createInitialState('g1');
    expect(StateHelpers.getPlayer(state, 'unknown')).toBeUndefined();
  });
});

// ============================================================================
// StateHelpers.getActivePlayers
// ============================================================================

describe('StateHelpers.getActivePlayers', () => {
  it('returns only active players', () => {
    let state = createInitialState('g1');
    state = addPlayer(state, makePlayer({ id: 'p1', isActive: true }));
    state = addPlayer(state, makePlayer({ id: 'p2', isActive: false }));
    const active = StateHelpers.getActivePlayers(state);
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe('p1');
  });

  it('returns empty array when no players', () => {
    const state = createInitialState('g1');
    expect(StateHelpers.getActivePlayers(state)).toHaveLength(0);
  });
});

// ============================================================================
// StateHelpers.getCurrentPlayer
// ============================================================================

describe('StateHelpers.getCurrentPlayer', () => {
  it('returns undefined when no current player is set', () => {
    const state = createInitialState('g1');
    expect(StateHelpers.getCurrentPlayer(state)).toBeUndefined();
  });

  it('returns the player whose turn it is', () => {
    let state = createInitialState('g1');
    state = addPlayer(state, makePlayer({ id: 'p1' }));
    const stateWithTurn = updateState(state, draft => {
      (draft.turns as any).currentPlayerId = 'p1';
    });
    expect(StateHelpers.getCurrentPlayer(stateWithTurn)?.id).toBe('p1');
  });
});

// ============================================================================
// StateHelpers.getPoints
// ============================================================================

describe('StateHelpers.getPoints', () => {
  it('returns 0 for a player not in the points map', () => {
    const state = createInitialState('g1');
    expect(StateHelpers.getPoints(state, 'unknown')).toBe(0);
  });

  it('returns correct points after awarding', () => {
    let state = createInitialState('g1');
    state = addPlayer(state, makePlayer({ id: 'p1' }));
    state = awardPoints(state, 'p1', 20);
    expect(StateHelpers.getPoints(state, 'p1')).toBe(20);
  });
});

// ============================================================================
// StateHelpers.countActivePlayers
// ============================================================================

describe('StateHelpers.countActivePlayers', () => {
  it('counts only active players', () => {
    let state = createInitialState('g1');
    state = addPlayer(state, makePlayer({ id: 'p1', isActive: true }));
    state = addPlayer(state, makePlayer({ id: 'p2', isActive: false }));
    expect(StateHelpers.countActivePlayers(state)).toBe(1);
  });

  it('returns 0 when there are no players', () => {
    const state = createInitialState('g1');
    expect(StateHelpers.countActivePlayers(state)).toBe(0);
  });
});

// ============================================================================
// StateHelpers.getActiveRules
// ============================================================================

describe('StateHelpers.getActiveRules', () => {
  it('returns only active rules', () => {
    let state = createInitialState('g1');
    state = addRule(state, makeRule({ id: 'r-inactive', isActive: false }));
    const active = StateHelpers.getActiveRules(state);
    expect(active.every(r => r.isActive)).toBe(true);
    expect(active.find(r => r.id === 'r-inactive')).toBeUndefined();
  });

  it('all initial rules are active', () => {
    const state = createInitialState('g1');
    expect(StateHelpers.getActiveRules(state)).toHaveLength(state.rules.length);
  });
});

// ============================================================================
// StateHelpers.getExtension / setExtension / updateExtension
// ============================================================================

describe('StateHelpers.getExtension', () => {
  it('returns the default value when key is absent', () => {
    const state = createInitialState('g1');
    expect(StateHelpers.getExtension(state, 'missing', 42)).toBe(42);
  });

  it('returns the stored value when key exists', () => {
    const state = createInitialState('g1');
    const updated = StateHelpers.setExtension(state, 'foo', 'bar');
    expect(StateHelpers.getExtension(updated, 'foo', null)).toBe('bar');
  });
});

describe('StateHelpers.setExtension', () => {
  it('stores a value and records an extension-updated transition', () => {
    const state = createInitialState('g1');
    const updated = StateHelpers.setExtension(state, 'x', 99);
    expect(updated.extensions.get('x')).toBe(99);
    const entry = updated.history.find(h => h.type === 'extension-updated');
    expect(entry).toBeDefined();
    expect((entry?.data as any).key).toBe('x');
  });

  it('does not mutate original state', () => {
    const state = createInitialState('g1');
    StateHelpers.setExtension(state, 'x', 1);
    expect(state.extensions.get('x')).toBeUndefined();
  });
});

describe('StateHelpers.updateExtension', () => {
  it('applies the updater to the current value', () => {
    let state = createInitialState('g1');
    state = StateHelpers.setExtension(state, 'counter', 5);
    state = StateHelpers.updateExtension<number>(state, 'counter', c => (c ?? 0) + 1);
    expect(StateHelpers.getExtension(state, 'counter', 0)).toBe(6);
  });

  it('passes undefined when the key does not exist', () => {
    const state = createInitialState('g1');
    const updated = StateHelpers.updateExtension<number>(
      state,
      'new-key',
      c => (c === undefined ? 100 : c)
    );
    expect(StateHelpers.getExtension(updated, 'new-key', 0)).toBe(100);
  });
});

// ============================================================================
// StateHelpers.getLeaderboard
// ============================================================================

describe('StateHelpers.getLeaderboard', () => {
  it('returns players sorted by points descending', () => {
    let state = createInitialState('g1');
    state = addPlayer(state, makePlayer({ id: 'p1', name: 'Alice' }));
    state = addPlayer(state, makePlayer({ id: 'p2', name: 'Bob' }));
    state = awardPoints(state, 'p1', 5);
    state = awardPoints(state, 'p2', 20);
    const board = StateHelpers.getLeaderboard(state);
    expect(board[0].player.id).toBe('p2');
    expect(board[0].points).toBe(20);
    expect(board[1].player.id).toBe('p1');
    expect(board[1].points).toBe(5);
  });

  it('returns empty array when there are no players', () => {
    const state = createInitialState('g1');
    expect(StateHelpers.getLeaderboard(state)).toHaveLength(0);
  });
});

// ============================================================================
// StateHelpers.awardPoints (convenience wrapper)
// ============================================================================

describe('StateHelpers.awardPoints', () => {
  it('is the same function as the top-level awardPoints', () => {
    expect(StateHelpers.awardPoints).toBe(awardPoints);
  });
});

// ============================================================================
// StateHelpers.emitEvent
// ============================================================================

describe('StateHelpers.emitEvent', () => {
  it('adds a custom event to pendingEvents', () => {
    const state = createInitialState('g1');
    const updated = StateHelpers.emitEvent(state, 'custom-event', { foo: 'bar' });
    expect(updated.pendingEvents).toHaveLength(1);
    expect(updated.pendingEvents[0].type).toBe('custom-event');
    expect(updated.pendingEvents[0].actorId).toBe('rule');
    expect(updated.pendingEvents[0].data).toEqual({ foo: 'bar' });
  });

  it('throws when emitting a reserved system event', () => {
    const state = createInitialState('g1');
    expect(() => StateHelpers.emitEvent(state, 'turn-start')).toThrow(
      'Cannot emit reserved system event: turn-start'
    );
  });

  it('does not mutate the original state', () => {
    const state = createInitialState('g1');
    StateHelpers.emitEvent(state, 'my-event');
    expect(state.pendingEvents).toHaveLength(0);
  });
});
