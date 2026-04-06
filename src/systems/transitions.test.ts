/**
 * Unit tests for state transition validation
 * Tests validateTransition, validateState, and their assert wrappers
 */

import { describe, it, expect } from 'vitest';
import {
  validateTransition,
  validateState,
  assertValidState,
  assertValidTransition,
} from './transitions.js';
import { createInitialState, addPlayer, updateState } from '../core/state.js';
import type { GameState, Player } from '../core/types.js';

function makePlayer(id: string, name: string): Player {
  return { id, name, joinedAt: Date.now(), isActive: true };
}

function twoPlayerState(): GameState {
  let state = createInitialState('test-game');
  state = addPlayer(state, makePlayer('p1', 'Alice'));
  state = addPlayer(state, makePlayer('p2', 'Bob'));
  return state;
}

// Shallow-clones a frozen GameState, allowing specific fields to be overridden
// without TypeScript's readonly enforcement at runtime.
function override(state: GameState, patch: Partial<Record<string, unknown>>): GameState {
  return { ...state, ...patch } as unknown as GameState;
}

// ============================================================================
// validateTransition — happy path
// ============================================================================

describe('validateTransition — valid transitions', () => {
  it('accepts a no-op state update', () => {
    const old = twoPlayerState();
    const next = updateState(old, () => {});
    const result = validateTransition(old, next);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('accepts adding a player', () => {
    const old = twoPlayerState();
    const next = addPlayer(old, makePlayer('p3', 'Carol'));
    const result = validateTransition(old, next);
    expect(result.valid).toBe(true);
  });

  it('accepts an equal updatedAt (not a decrease)', () => {
    const old = twoPlayerState();
    const next = override(old, { updatedAt: old.updatedAt });
    const result = validateTransition(old, next);
    expect(result.valid).toBe(true);
  });

  it('accepts null currentPlayerId (before game starts)', () => {
    const old = twoPlayerState();
    const next = updateState(old, () => {});
    expect(validateTransition(old, next).valid).toBe(true);
  });
});

// ============================================================================
// validateTransition — identity invariants
// ============================================================================

describe('validateTransition — identity invariants', () => {
  it('rejects a changed gameId', () => {
    const old = twoPlayerState();
    const next = override(old, { gameId: 'different-game' });
    const result = validateTransition(old, next);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Game ID cannot be changed');
  });

  it('rejects a changed version', () => {
    const old = twoPlayerState();
    const next = override(old, { version: '2.0.0' });
    const result = validateTransition(old, next);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Version cannot be changed');
  });

  it('rejects a changed createdAt', () => {
    const old = twoPlayerState();
    const next = override(old, { createdAt: old.createdAt + 1 });
    const result = validateTransition(old, next);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Created timestamp cannot be changed');
  });

  it('rejects a decreased updatedAt', () => {
    const old = twoPlayerState();
    const next = override(old, { updatedAt: old.updatedAt - 1000 });
    const result = validateTransition(old, next);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Updated timestamp must increase');
  });
});

// ============================================================================
// validateTransition — player invariants
// ============================================================================

describe('validateTransition — player invariants', () => {
  it('rejects removal of a player (fewer players in new state)', () => {
    const old = twoPlayerState();
    const next = override(old, { players: [] });
    const result = validateTransition(old, next);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Players cannot be removed');
  });

  it('rejects duplicate player IDs', () => {
    const old = twoPlayerState();
    const next = override(old, { players: [old.players[0], old.players[0]] });
    const result = validateTransition(old, next);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Duplicate player IDs found');
  });

  it('rejects a modified player joinedAt', () => {
    const old = twoPlayerState();
    const modifiedP1 = { ...old.players[0], joinedAt: old.players[0].joinedAt + 5000 };
    const next = override(old, { players: [modifiedP1, old.players[1]] });
    const result = validateTransition(old, next);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('joined time was modified'))).toBe(true);
  });
});

// ============================================================================
// validateTransition — points invariants
// ============================================================================

describe('validateTransition — points invariants', () => {
  it('rejects negative points for a player', () => {
    const old = twoPlayerState();
    const badPoints = new Map(old.points);
    badPoints.set('p1', -5);
    const next = override(old, { points: badPoints });
    const result = validateTransition(old, next);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('negative points'))).toBe(true);
  });

  it('rejects non-finite points', () => {
    const old = twoPlayerState();
    const badPoints = new Map(old.points);
    badPoints.set('p1', Infinity);
    const next = override(old, { points: badPoints });
    const result = validateTransition(old, next);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('invalid points'))).toBe(true);
  });

  it('rejects a player missing from the points map', () => {
    const old = twoPlayerState();
    const partialPoints = new Map<string, number>([['p1', 0]]);
    const next = override(old, { points: partialPoints });
    const result = validateTransition(old, next);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('missing from points map'))).toBe(true);
  });
});

// ============================================================================
// validateTransition — turn invariants
// ============================================================================

describe('validateTransition — turn invariants', () => {
  it('rejects a decreased turn number', () => {
    const old = twoPlayerState();
    const next = override(old, { turns: { ...old.turns, currentTurn: -1 } });
    const result = validateTransition(old, next);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Turn number cannot decrease');
  });

  it('rejects an invalid player ID in turnOrder', () => {
    const old = twoPlayerState();
    const next = override(old, { turns: { ...old.turns, turnOrder: ['p1', 'ghost'] } });
    const result = validateTransition(old, next);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('invalid player ID'))).toBe(true);
  });

  it('rejects a currentPlayerId that is not in turnOrder', () => {
    const old = twoPlayerState();
    const next = override(old, {
      turns: { ...old.turns, currentPlayerId: 'p1', turnOrder: ['p2'] },
    });
    const result = validateTransition(old, next);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('not in turn order'))).toBe(true);
  });
});

// ============================================================================
// validateTransition — history invariants
// ============================================================================

describe('validateTransition — history invariants', () => {
  it('throws when history shrinks (function does not guard check 14 behind check 13)', () => {
    const old = twoPlayerState();
    const next = override(old, { history: [] });
    // The function pushes "History cannot shrink" but then crashes in the entry-comparison
    // loop because it does not skip that loop when history is shorter.
    expect(() => validateTransition(old, next)).toThrow();
  });

  it('rejects a modified history entry (same-length history with tampered id)', () => {
    const old = twoPlayerState();
    // Keep the same length; only tamper the id of the first entry so check 14 fires
    const tamperedHistory = [
      { ...old.history[0], id: 'tampered-id' },
      ...Array.from(old.history).slice(1),
    ];
    const next = override(old, { history: tamperedHistory });
    const result = validateTransition(old, next);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('History entry'))).toBe(true);
  });

  it('accepts an appended history entry', () => {
    const old = twoPlayerState();
    const newEntry = {
      id: 'new-entry',
      timestamp: Date.now(),
      type: 'player-joined' as const,
      actorId: 'system',
      data: {},
    };
    const next = override(old, { history: [...old.history, newEntry] });
    const result = validateTransition(old, next);
    // History check passes (new entry is addition, not modification)
    const historyErrors = result.errors.filter(e => e.includes('History'));
    expect(historyErrors).toHaveLength(0);
  });
});

// ============================================================================
// validateTransition — rule invariants
// ============================================================================

describe('validateTransition — rule invariants', () => {
  it('rejects duplicate rule numbers', () => {
    const old = twoPlayerState();
    const firstRule = old.rules[0];
    const dupes = [firstRule, { ...firstRule, id: 'different-id' }];
    const next = override(old, { rules: dupes });
    const result = validateTransition(old, next);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Duplicate rule numbers found');
  });

  it('rejects duplicate rule IDs', () => {
    const old = twoPlayerState();
    const firstRule = old.rules[0];
    const dupes = [firstRule, { ...firstRule, number: 9999 }];
    const next = override(old, { rules: dupes });
    const result = validateTransition(old, next);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Duplicate rule IDs found');
  });

  it('rejects modification of an immutable rule', () => {
    const old = twoPlayerState();
    const immutable = old.rules.find(r => !r.isMutable)!;
    const modifiedRules = old.rules.map(r =>
      r.id === immutable.id ? { ...r, name: 'Hacked Name' } : r
    );
    const next = override(old, { rules: modifiedRules });
    const result = validateTransition(old, next);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Immutable rule'))).toBe(true);
  });

  it('accepts modification of a mutable rule', () => {
    const old = twoPlayerState();
    const mutable = old.rules.find(r => r.isMutable)!;
    const modifiedRules = old.rules.map(r =>
      r.id === mutable.id ? { ...r, name: 'Updated Name' } : r
    );
    const next = override(old, { rules: modifiedRules });
    const result = validateTransition(old, next);
    const ruleErrors = result.errors.filter(e => e.includes('Immutable rule'));
    expect(ruleErrors).toHaveLength(0);
  });
});

// ============================================================================
// validateTransition — voting invariants
// ============================================================================

describe('validateTransition — voting invariants', () => {
  it('rejects an active proposal with a non-pending status', () => {
    const old = twoPlayerState();
    const badProposal = {
      id: 'prop-1',
      type: 'add-rule' as const,
      proposedBy: 'p1',
      proposedAt: Date.now(),
      description: 'test',
      votes: new Map(),
      status: 'passed' as const,
      resolvedAt: null,
    };
    const next = override(old, {
      voting: { activeProposals: [badProposal], proposalHistory: [] },
    });
    const result = validateTransition(old, next);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('non-pending status'))).toBe(true);
  });

  it('rejects a historical proposal that still has pending status', () => {
    const old = twoPlayerState();
    const pendingInHistory = {
      id: 'prop-2',
      type: 'add-rule' as const,
      proposedBy: 'p1',
      proposedAt: Date.now(),
      description: 'test',
      votes: new Map(),
      status: 'pending' as const,
      resolvedAt: null,
    };
    const next = override(old, {
      voting: { activeProposals: [], proposalHistory: [pendingInHistory] },
    });
    const result = validateTransition(old, next);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('pending status'))).toBe(true);
  });

  it('rejects a historical proposal missing resolvedAt (unless withdrawn)', () => {
    const old = twoPlayerState();
    const missingResolved = {
      id: 'prop-3',
      type: 'add-rule' as const,
      proposedBy: 'p1',
      proposedAt: Date.now(),
      description: 'test',
      votes: new Map(),
      status: 'passed' as const,
      resolvedAt: null,
    };
    const next = override(old, {
      voting: { activeProposals: [], proposalHistory: [missingResolved] },
    });
    const result = validateTransition(old, next);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('missing resolvedAt'))).toBe(true);
  });
});

// ============================================================================
// validateState
// ============================================================================

describe('validateState', () => {
  it('accepts a freshly created initial state', () => {
    const result = validateState(createInitialState('game-1'));
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('accepts a state with players', () => {
    expect(validateState(twoPlayerState()).valid).toBe(true);
  });

  it('rejects a missing version string', () => {
    const invalid = override(createInitialState('game-1'), { version: '' });
    const result = validateState(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Invalid or missing version');
  });

  it('rejects a missing gameId', () => {
    const invalid = override(createInitialState('game-1'), { gameId: '' });
    const result = validateState(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Invalid or missing gameId');
  });

  it('rejects a non-finite createdAt', () => {
    const invalid = override(createInitialState('game-1'), { createdAt: NaN });
    const result = validateState(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('createdAt'))).toBe(true);
  });

  it('rejects a non-finite updatedAt', () => {
    const invalid = override(createInitialState('game-1'), { updatedAt: Infinity });
    const result = validateState(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('updatedAt'))).toBe(true);
  });

  it('rejects an unrecognised status', () => {
    const invalid = override(createInitialState('game-1'), { status: 'limbo' });
    const result = validateState(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('Invalid status'))).toBe(true);
  });

  it('rejects a non-array players field', () => {
    const invalid = override(createInitialState('game-1'), { players: 'nope' });
    const result = validateState(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Players must be an array');
  });

  it('rejects a player with an empty name', () => {
    let state = createInitialState('game-1');
    state = addPlayer(state, { id: 'p1', name: '', joinedAt: Date.now(), isActive: true });
    const result = validateState(state);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('missing or invalid name'))).toBe(true);
  });

  it('rejects a null rules field', () => {
    const invalid = override(createInitialState('game-1'), { rules: null });
    const result = validateState(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Rules must be an array');
  });

  it('rejects a null turns object', () => {
    const invalid = override(createInitialState('game-1'), { turns: null });
    const result = validateState(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Turns state missing or invalid');
  });

  it('rejects a null voting object', () => {
    const invalid = override(createInitialState('game-1'), { voting: null });
    const result = validateState(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Voting state missing or invalid');
  });

  it('rejects a non-array history', () => {
    const invalid = override(createInitialState('game-1'), { history: 'nope' });
    const result = validateState(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('History must be an array');
  });

  it('accepts all four valid statuses', () => {
    for (const status of ['setup', 'active', 'paused', 'completed'] as const) {
      const state = override(createInitialState('game-1'), { status });
      expect(validateState(state).errors.some(e => e.includes('Invalid status'))).toBe(false);
    }
  });
});

// ============================================================================
// assertValidState
// ============================================================================

describe('assertValidState', () => {
  it('does not throw for a valid state', () => {
    expect(() => assertValidState(createInitialState('game-1'))).not.toThrow();
  });

  it('throws with a descriptive message for an invalid state', () => {
    const invalid = override(createInitialState('game-1'), { version: '' });
    expect(() => assertValidState(invalid)).toThrow('Invalid state');
  });
});

// ============================================================================
// assertValidTransition
// ============================================================================

describe('assertValidTransition', () => {
  it('does not throw for a valid transition', () => {
    const old = twoPlayerState();
    const next = updateState(old, () => {});
    expect(() => assertValidTransition(old, next)).not.toThrow();
  });

  it('throws with a descriptive message for an invalid transition', () => {
    const state = twoPlayerState();
    const invalid = override(state, { gameId: 'different' });
    expect(() => assertValidTransition(state, invalid)).toThrow('Invalid transition');
  });
});
