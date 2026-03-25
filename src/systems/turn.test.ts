/**
 * Unit tests for TurnManager
 * Tests turn order, advancement, wrap-around, history recording, and game lifecycle
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TurnManager } from './turn.js';
import { createInitialState, addPlayer, updateState } from '../core/state.js';
import type { GameState, Player } from '../core/types.js';

function makePlayer(id: string, name: string, isActive = true): Player {
  return { id, name, joinedAt: Date.now(), isActive };
}

function setupState(...names: string[]): GameState {
  let state = createInitialState('test-game');
  for (const name of names) {
    state = addPlayer(state, makePlayer(name.toLowerCase(), name));
  }
  return state;
}

const turnManager = new TurnManager();

// ============================================================================
// startGame
// ============================================================================

describe('TurnManager.startGame', () => {
  it('transitions status from setup to active', () => {
    const state = setupState('Alice', 'Bob');
    expect(turnManager.startGame(state).status).toBe('active');
  });

  it('sets currentTurn to 1 and assigns the first player', () => {
    const state = setupState('Alice', 'Bob');
    const started = turnManager.startGame(state);
    expect(started.turns.currentTurn).toBe(1);
    expect(started.turns.currentPlayerId).toBe(state.players[0].id);
  });

  it('initialises turnOrder with all active players in join order', () => {
    const state = setupState('Alice', 'Bob', 'Carol');
    const started = turnManager.startGame(state);
    expect(started.turns.turnOrder).toHaveLength(3);
    expect(started.turns.turnOrder[0]).toBe(state.players[0].id);
    expect(started.turns.turnOrder[1]).toBe(state.players[1].id);
    expect(started.turns.turnOrder[2]).toBe(state.players[2].id);
  });

  it('excludes inactive players from turnOrder', () => {
    let state = createInitialState('test-game');
    state = addPlayer(state, makePlayer('alice', 'Alice'));
    state = addPlayer(state, makePlayer('bob', 'Bob'));
    state = addPlayer(state, makePlayer('carol', 'Carol', false));
    const started = turnManager.startGame(state);
    expect(started.turns.turnOrder).toHaveLength(2);
    expect(started.turns.turnOrder).not.toContain('carol');
  });

  it('records a turn-started history entry with correct actor and timestamp', () => {
    const state = setupState('Alice', 'Bob');
    const started = turnManager.startGame(state);
    const entries = started.history.filter(h => h.type === 'turn-started');
    expect(entries).toHaveLength(1);
    expect(entries[0].actorId).toBe('system');
    expect(entries[0].timestamp).toBeGreaterThan(0);
    expect(entries[0].type).toBe('turn-started');
  });

  it('adds game-started and turn-start pending events', () => {
    const state = setupState('Alice', 'Bob');
    const started = turnManager.startGame(state);
    const types = started.pendingEvents.map(e => e.type);
    expect(types).toContain('game-started');
    expect(types).toContain('turn-start');
  });

  it('throws when game is not in setup status', () => {
    const active = updateState(setupState('Alice', 'Bob'), draft => {
      draft.status = 'active';
    });
    expect(() => turnManager.startGame(active)).toThrow('Cannot start game');
  });

  it('throws when there is only one active player', () => {
    expect(() => turnManager.startGame(setupState('Alice'))).toThrow('at least 2');
  });

  it('throws when there are no active players', () => {
    expect(() => turnManager.startGame(createInitialState('test-game'))).toThrow('at least 2');
  });
});

// ============================================================================
// endTurn
// ============================================================================

describe('TurnManager.endTurn', () => {
  let active: GameState;

  beforeEach(() => {
    active = turnManager.startGame(setupState('Alice', 'Bob', 'Carol'));
  });

  it('advances currentPlayerId to the next player', () => {
    const before = active.turns.currentPlayerId;
    const expected = active.turns.turnOrder[1];
    const after = turnManager.endTurn(active);
    expect(after.turns.currentPlayerId).toBe(expected);
    expect(after.turns.currentPlayerId).not.toBe(before);
  });

  it('wraps around to the first player after the last player', () => {
    let state = active;
    state = turnManager.endTurn(state); // Alice → Bob
    state = turnManager.endTurn(state); // Bob → Carol
    state = turnManager.endTurn(state); // Carol → Alice (wrap)
    expect(state.turns.currentPlayerId).toBe(active.turns.turnOrder[0]);
  });

  it('increments turn number on each advance', () => {
    let state = active;
    expect(state.turns.currentTurn).toBe(1);
    state = turnManager.endTurn(state);
    expect(state.turns.currentTurn).toBe(2);
    state = turnManager.endTurn(state);
    expect(state.turns.currentTurn).toBe(3);
  });

  it('records the completed turn in turnHistory', () => {
    const after = turnManager.endTurn(active);
    expect(after.turns.turnHistory).toHaveLength(1);
    const record = after.turns.turnHistory[0];
    expect(record.turnNumber).toBe(1);
    expect(record.playerId).toBe(active.turns.currentPlayerId);
    expect(record.startedAt).toBeGreaterThan(0);
    expect(record.endedAt).toBeGreaterThanOrEqual(record.startedAt);
  });

  it('stores actions in the completed turn record', () => {
    const currentId = active.turns.currentPlayerId!;
    const action = { id: 'a1', type: 'test-action', playerId: currentId, timestamp: Date.now(), data: {} };
    const after = turnManager.endTurn(active, [action]);
    expect(after.turns.turnHistory[0].actions).toHaveLength(1);
    expect(after.turns.turnHistory[0].actions[0].id).toBe('a1');
  });

  it('stores an empty action list when none are provided', () => {
    const after = turnManager.endTurn(active);
    expect(after.turns.turnHistory[0].actions).toHaveLength(0);
  });

  it('adds turn-ended and turn-started history entries', () => {
    const after = turnManager.endTurn(active);
    const types = after.history.map(h => h.type);
    expect(types).toContain('turn-ended');
    expect(types).toContain('turn-started');
  });

  it('emits a turn-start pending event for the next player', () => {
    const after = turnManager.endTurn(active);
    const turnStarts = after.pendingEvents.filter(e => e.type === 'turn-start');
    expect(turnStarts.length).toBeGreaterThan(0);
  });

  it('throws when game is paused', () => {
    const paused = turnManager.pauseGame(active);
    expect(() => turnManager.endTurn(paused)).toThrow('Cannot end turn');
  });

  it('throws when game is in setup', () => {
    const state = setupState('Alice', 'Bob');
    expect(() => turnManager.endTurn(state)).toThrow('Cannot end turn');
  });

  it('throws when there is no active current player', () => {
    const state = updateState(active, draft => {
      (draft.turns as any).currentPlayerId = null;
    });
    expect(() => turnManager.endTurn(state)).toThrow('No active turn');
  });
});

// ============================================================================
// isPlayerTurn
// ============================================================================

describe('TurnManager.isPlayerTurn', () => {
  it('returns true for the current player', () => {
    const state = turnManager.startGame(setupState('Alice', 'Bob'));
    const currentId = state.turns.currentPlayerId!;
    expect(turnManager.isPlayerTurn(state, currentId)).toBe(true);
  });

  it('returns false for a non-current player', () => {
    const state = turnManager.startGame(setupState('Alice', 'Bob'));
    const otherId = state.turns.turnOrder.find(id => id !== state.turns.currentPlayerId)!;
    expect(turnManager.isPlayerTurn(state, otherId)).toBe(false);
  });

  it('returns false for an unknown player ID', () => {
    const state = turnManager.startGame(setupState('Alice', 'Bob'));
    expect(turnManager.isPlayerTurn(state, 'nobody')).toBe(false);
  });
});

// ============================================================================
// getCurrentPlayerId
// ============================================================================

describe('TurnManager.getCurrentPlayerId', () => {
  it('returns null before the game starts', () => {
    expect(turnManager.getCurrentPlayerId(setupState('Alice', 'Bob'))).toBeNull();
  });

  it('returns the current player ID after the game starts', () => {
    const state = turnManager.startGame(setupState('Alice', 'Bob'));
    expect(turnManager.getCurrentPlayerId(state)).toBe(state.turns.currentPlayerId);
  });
});

// ============================================================================
// getNextPlayerId
// ============================================================================

describe('TurnManager.getNextPlayerId', () => {
  it('returns null when no turn is active', () => {
    expect(turnManager.getNextPlayerId(setupState('Alice', 'Bob'))).toBeNull();
  });

  it('returns the player after the current one', () => {
    const state = turnManager.startGame(setupState('Alice', 'Bob', 'Carol'));
    expect(turnManager.getNextPlayerId(state)).toBe(state.turns.turnOrder[1]);
  });

  it('wraps to the first player when the current player is last', () => {
    let state = turnManager.startGame(setupState('Alice', 'Bob'));
    state = turnManager.endTurn(state); // now on Bob (last)
    expect(turnManager.getNextPlayerId(state)).toBe(state.turns.turnOrder[0]);
  });
});

// ============================================================================
// getTurnStats
// ============================================================================

describe('TurnManager.getTurnStats', () => {
  it('returns all-zero stats for a player with no completed turns', () => {
    const state = turnManager.startGame(setupState('Alice', 'Bob'));
    const stats = turnManager.getTurnStats(state, state.players[0].id);
    expect(stats.totalTurns).toBe(0);
    expect(stats.totalActions).toBe(0);
    expect(stats.averageTurnDuration).toBe(0);
  });

  it('counts completed turns and accumulated actions correctly', () => {
    let state = turnManager.startGame(setupState('Alice', 'Bob'));
    const aliceId = state.turns.turnOrder[0];
    const action = { id: 'a1', type: 'test', playerId: aliceId, timestamp: Date.now(), data: {} };

    state = turnManager.endTurn(state, [action]); // Alice turn 1 ends with 1 action
    state = turnManager.endTurn(state);            // Bob turn ends
    state = turnManager.endTurn(state, []);         // Alice turn 2 ends with 0 actions

    const stats = turnManager.getTurnStats(state, aliceId);
    expect(stats.totalTurns).toBe(2);
    expect(stats.totalActions).toBe(1);
  });

  it('computes a positive averageTurnDuration after turns complete', () => {
    let state = turnManager.startGame(setupState('Alice', 'Bob'));
    const aliceId = state.turns.turnOrder[0];
    state = turnManager.endTurn(state);
    const stats = turnManager.getTurnStats(state, aliceId);
    expect(stats.averageTurnDuration).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// getAllTurnStats
// ============================================================================

describe('TurnManager.getAllTurnStats', () => {
  it('returns a stats entry for every player', () => {
    const state = turnManager.startGame(setupState('Alice', 'Bob', 'Carol'));
    const allStats = turnManager.getAllTurnStats(state);
    expect(allStats.size).toBe(3);
    for (const player of state.players) {
      expect(allStats.has(player.id)).toBe(true);
    }
  });
});

// ============================================================================
// pauseGame / resumeGame
// ============================================================================

describe('TurnManager.pauseGame', () => {
  it('sets status to paused when game is active', () => {
    const state = turnManager.startGame(setupState('Alice', 'Bob'));
    expect(turnManager.pauseGame(state).status).toBe('paused');
  });

  it('throws when game is in setup', () => {
    expect(() => turnManager.pauseGame(setupState('Alice', 'Bob'))).toThrow('Cannot pause game');
  });

  it('throws when game is already paused', () => {
    const state = turnManager.startGame(setupState('Alice', 'Bob'));
    const paused = turnManager.pauseGame(state);
    expect(() => turnManager.pauseGame(paused)).toThrow('Cannot pause game');
  });
});

describe('TurnManager.resumeGame', () => {
  it('sets status back to active from paused', () => {
    const state = turnManager.startGame(setupState('Alice', 'Bob'));
    const paused = turnManager.pauseGame(state);
    expect(turnManager.resumeGame(paused).status).toBe('active');
  });

  it('throws when game is active (not paused)', () => {
    const state = turnManager.startGame(setupState('Alice', 'Bob'));
    expect(() => turnManager.resumeGame(state)).toThrow('Cannot resume game');
  });

  it('throws when game is in setup', () => {
    expect(() => turnManager.resumeGame(setupState('Alice', 'Bob'))).toThrow('Cannot resume game');
  });
});

// ============================================================================
// skipTurn
// ============================================================================

describe('TurnManager.skipTurn', () => {
  it('advances the turn and records a turn-skipped action', () => {
    const state = turnManager.startGame(setupState('Alice', 'Bob'));
    const firstId = state.turns.currentPlayerId!;
    const skipped = turnManager.skipTurn(state, 'unavailable');
    expect(skipped.turns.currentPlayerId).not.toBe(firstId);
    expect(skipped.turns.turnHistory[0].actions).toHaveLength(1);
    expect(skipped.turns.turnHistory[0].actions[0].type).toBe('turn-skipped');
  });

  it('throws when game is in setup', () => {
    expect(() => turnManager.skipTurn(setupState('Alice', 'Bob'), 'reason')).toThrow('Cannot skip turn');
  });

  it('throws when game is paused', () => {
    const state = turnManager.startGame(setupState('Alice', 'Bob'));
    const paused = turnManager.pauseGame(state);
    expect(() => turnManager.skipTurn(paused, 'reason')).toThrow('Cannot skip turn');
  });
});

// ============================================================================
// getCurrentTurn
// ============================================================================

describe('TurnManager.getCurrentTurn', () => {
  it('returns 0 before the game starts', () => {
    expect(turnManager.getCurrentTurn(setupState('Alice', 'Bob'))).toBe(0);
  });

  it('returns 1 on the first turn', () => {
    const state = turnManager.startGame(setupState('Alice', 'Bob'));
    expect(turnManager.getCurrentTurn(state)).toBe(1);
  });

  it('increments as turns advance', () => {
    let state = turnManager.startGame(setupState('Alice', 'Bob'));
    state = turnManager.endTurn(state);
    expect(turnManager.getCurrentTurn(state)).toBe(2);
  });
});

// ============================================================================
// getCurrentTurnDuration
// ============================================================================

describe('TurnManager.getCurrentTurnDuration', () => {
  it('returns null when no turn has started', () => {
    expect(turnManager.getCurrentTurnDuration(setupState('Alice', 'Bob'))).toBeNull();
  });

  it('returns a non-negative number during an active turn', () => {
    const state = turnManager.startGame(setupState('Alice', 'Bob'));
    const duration = turnManager.getCurrentTurnDuration(state);
    expect(duration).not.toBeNull();
    expect(duration!).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// isGameStarted
// ============================================================================

describe('TurnManager.isGameStarted', () => {
  it('returns false in setup', () => {
    expect(turnManager.isGameStarted(setupState('Alice', 'Bob'))).toBe(false);
  });

  it('returns true when active', () => {
    const state = turnManager.startGame(setupState('Alice', 'Bob'));
    expect(turnManager.isGameStarted(state)).toBe(true);
  });

  it('returns true when paused', () => {
    const state = turnManager.startGame(setupState('Alice', 'Bob'));
    const paused = turnManager.pauseGame(state);
    expect(turnManager.isGameStarted(paused)).toBe(true);
  });
});
